// @vitest-environment node
import {
  advance,
  applyAction,
  availableHeroes,
  bestParties,
  createWorld,
  defaultConfig,
  holdings,
  marketStock,
  offeredQuests,
  playerGuild,
  unattachedHeroes,
  hallUpkeepParts,
  wages,
  type EngineDeps,
  type EntityId,
  type Entry,
  type EventType,
  type GuildId,
  type WorldDocument,
} from '@heroesim/engine';
import { createProbe, makeId } from '@heroesim/engine/testing';
import { beforeAll, describe, expect, test } from 'vitest';
import { coinWords, whenOfTurn } from '@heroesim/words';
import { content } from '../content';
import { changed, documentOf, played, playerOf, started, withTrades, withWealth } from './game.test-support';
import { initialGameState, playDeps, type GameState } from './reducer';
import { countdownView } from './selectors';
import { faceted, type FacetChoices } from './facets';
import { ledgerCategories, ledgerOf, ledgerPage, lineWords, totalsOf, treasuryAccounts, wealthChangeOf } from './treasury';

// The Treasury (DL-111 item 5, DL-112 item 6, DL-116): the ledger is every change to a Guild's
// Wealth read from the History, each on its line (DL-302). Its heart is that it misses nothing: from its opening
// row, the Wealth the Guild was founded with (DL-120 item 4), it adds up to its Wealth now.

const setup = { guildName: 'The Lantern', guildmasterName: 'Ada Vell', createdAt: '2026-09-30T09:00:00.000Z' };

const lantern = makeId('guilds', 1);
const ashford = makeId('guilds', 2);
const hero = makeId('heroes', 7);

/** An entry of `type` at Turn 5 with `payload`, naming `participants`: what the engine appends. */
function entry(type: EventType, payload: object, participants: EntityId[] = [lantern]): Entry {
  return { turn: 5, type, participants, labels: {}, milestone: false, payload };
}

describe('wealthChangeOf: each line takes exactly its events', () => {
  test('Upkeep is what the Guild paid, against it: its wages and its Hall upkeep, with its Improvements’ upkeep (DL-298, DL-302)', () => {
    expect(wealthChangeOf(entry('guild.wages-paid', { guildId: lantern, amount: 120, wealthAfter: 80 }), lantern)).toEqual({
      category: 'wages',
      amount: -120,
    });
    const hallWithoutFacilities = { guildId: lantern, amount: 35, wealthAfter: 45, base: 30, heroCount: 1, heroes: 5, facilities: {}, traitFactor: 1 };
    expect(wealthChangeOf(entry('guild.hall-upkeep-paid', hallWithoutFacilities), lantern)).toEqual({
      category: 'hall-upkeep',
      amount: -35,
    });
    const hallWithFacilities = { guildId: lantern, amount: 65, wealthAfter: 15, base: 30, heroCount: 1, heroes: 5, facilities: { infirmary: 30 }, traitFactor: 1 };
    expect(wealthChangeOf(entry('guild.hall-upkeep-paid', hallWithFacilities), lantern)).toEqual([
      { category: 'hall-upkeep', amount: -35 },
      { category: 'improvement-upkeep', amount: -30 },
    ]);
    const scaledHall = { guildId: lantern, amount: 59, wealthAfter: 21, base: 30, heroCount: 1, heroes: 5, facilities: { infirmary: 30 }, traitFactor: 0.9 };
    expect(wealthChangeOf(entry('guild.hall-upkeep-paid', scaledHall), lantern)).toEqual([
      { category: 'hall-upkeep', amount: -32 },
      { category: 'improvement-upkeep', amount: -27 },
    ]);
  });

  test('the charge splits as the Improvements’ part rounded to the nearest Silver and the Hall’s the rest, one line alone where the other is nothing (DL-302)', () => {
    const charge = (amount: number, base: number, heroes: number, facilities: Record<string, number>, traitFactor: number) =>
      entry('guild.hall-upkeep-paid', { guildId: lantern, amount, wealthAfter: 0, base, heroCount: heroes / 5, heroes, facilities, traitFactor });
    // 17 × 0.9 is 15.3, and 17 × 1.1 is 18.7: the nearest Silver, neither floored nor ceiled.
    expect(wealthChangeOf(charge(54, 30, 15, { infirmary: 17 }, 0.9), lantern)).toEqual([
      { category: 'hall-upkeep', amount: -39 },
      { category: 'improvement-upkeep', amount: -15 },
    ]);
    expect(wealthChangeOf(charge(70, 30, 15, { infirmary: 17 }, 1.1), lantern)).toEqual([
      { category: 'hall-upkeep', amount: -51 },
      { category: 'improvement-upkeep', amount: -19 },
    ]);
    expect(wealthChangeOf(charge(10, 0, 0, { infirmary: 10 }, 1), lantern)).toEqual({ category: 'improvement-upkeep', amount: -10 });
  });

  test("a Quest's reward is what it paid the Guild, and a failed Quest's nil reward gives no row", () => {
    const resolved = (wealthDelta: number) =>
      entry('quest.resolved', { guildId: lantern, questId: makeId('quests', 3), partyId: makeId('parties', 1), heroIds: [], templateKey: 'x', band: wealthDelta === 0 ? 'fail' : 'success', wealthDelta, fameDelta: 0 });
    expect(wealthChangeOf(resolved(300), lantern)).toEqual({ category: 'quest-rewards', amount: 300 });
    expect(wealthChangeOf(resolved(0), lantern)).toBeNull();
  });

  test('the Market takes purchases against the Guild and sales for it, a fold’s sale among them', () => {
    expect(wealthChangeOf(entry('item.bought', { guildId: lantern, definitionKey: 'whetstone', quantity: 2, unitPrice: 15, cost: 30, itemIds: [] }), lantern)).toEqual({
      category: 'item-purchases',
      amount: -30,
    });
    for (const cause of ['sale', 'fold']) {
      expect(
        wealthChangeOf(entry('item.sold', { guildId: lantern, definitionKey: 'whetstone', quantity: 1, unitPrice: 7, proceeds: 7, itemIds: [], cause }), lantern),
      ).toEqual({ category: 'item-sales', amount: 7 });
    }
  });

  test('the Hall takes an Improvement’s cost', () => {
    expect(
      wealthChangeOf(entry('guild.improved', { guildId: lantern, facility: 'infirmary', grade: 1, improvementKey: 'cots', cost: 250 }), lantern),
    ).toEqual({ category: 'improvements', amount: -250 });
  });

  test('Heroes take a signing fee, and a Transfer fee counts against the Guild it goes to and for the one it leaves', () => {
    expect(wealthChangeOf(entry('hero.recruited', { heroId: hero, guildId: lantern, fee: 90 }, [hero, lantern]), lantern)).toEqual({
      category: 'signing-fees',
      amount: -90,
    });
    const transferred = entry('hero.transferred', { heroId: hero, fromGuildId: ashford, toGuildId: lantern, fee: 180, offerId: null }, [hero, ashford, lantern]);
    expect(wealthChangeOf(transferred, lantern)).toEqual({ category: 'transfers-in', amount: -180 });
    expect(wealthChangeOf(transferred, ashford)).toEqual({ category: 'transfers-out', amount: 180 });
  });

  test("Other takes a module's change of Wealth, either way", () => {
    expect(wealthChangeOf(entry('guild.wealth-changed', { guildId: lantern, moduleId: 'probe', before: 100, after: 125 }), lantern)).toEqual({
      category: 'other',
      amount: 25,
    });
    expect(wealthChangeOf(entry('guild.wealth-changed', { guildId: lantern, moduleId: 'probe', before: 100, after: 60 }), lantern)).toEqual({
      category: 'other',
      amount: -40,
    });
  });

  test('an entry of another Guild, one that moves no Wealth, and a module’s own event give none', () => {
    expect(wealthChangeOf(entry('guild.wages-paid', { guildId: ashford, amount: 120, wealthAfter: 80 }, [ashford]), lantern)).toBeNull();
    const theirHall = { guildId: ashford, amount: 65, wealthAfter: 15, base: 30, heroCount: 1, heroes: 5, facilities: { infirmary: 30 }, traitFactor: 1 };
    expect(wealthChangeOf(entry('guild.hall-upkeep-paid', theirHall, [ashford]), lantern)).toBeNull();
    expect(wealthChangeOf(entry('item.bought', { guildId: ashford, definitionKey: 'whetstone', quantity: 1, unitPrice: 15, cost: 15, itemIds: [] }, [ashford]), lantern)).toBeNull();
    expect(wealthChangeOf(entry('guild.below-floor', { guildId: lantern, wealth: -5, floor: 0, dueDay: 30 }), lantern)).toBeNull();
    expect(wealthChangeOf(entry('guild.transfer-offered', { offerId: makeId('offers', 1), fromGuildId: ashford, toGuildId: lantern, heroId: hero, fee: 180, expiresOnTurn: 20 }), lantern)).toBeNull();
    expect(wealthChangeOf(entry('probe.fired', { guildId: lantern }), lantern)).toBeNull();
  });
});

describe('the lines (DL-302)', () => {
  test('each has its words on the page', () => {
    expect(lineWords).toEqual({
      'quest-rewards': 'Quest rewards',
      'item-sales': 'Item sales',
      'transfers-out': 'Transfers out',
      wages: 'Wages',
      'hall-upkeep': 'Hall upkeep',
      'improvement-upkeep': 'Improvements’ upkeep',
      'item-purchases': 'Item purchases',
      improvements: 'Improvements',
      'signing-fees': 'Signing fees',
      'transfers-in': 'Transfers in',
      other: 'Other',
    });
  });

  test('a section totals its own lines; Other, a module’s change, counts in income or expense and in no section', () => {
    const totals = totalsOf([
      { category: 'quest-rewards', amount: 300 },
      { category: 'transfers-out', amount: 80 },
      { category: 'other', amount: 40 },
      { category: 'wages', amount: -120 },
      { category: 'hall-upkeep', amount: -35 },
      { category: 'improvement-upkeep', amount: -30 },
      { category: 'other', amount: -25 },
    ]);
    expect(totals).toMatchObject({ income: 420, expense: -210, net: 210 });
    expect(totals.sections.income).toEqual({ total: 380, lines: { 'quest-rewards': 300, 'item-sales': 0, 'transfers-out': 80 } });
    expect(totals.sections.expenses).toEqual({
      total: -185,
      lines: { wages: -120, 'hall-upkeep': -35, 'improvement-upkeep': -30, 'item-purchases': 0, improvements: 0, 'signing-fees': 0, 'transfers-in': 0 },
    });
  });
});

// ── The ledger misses nothing ─────────────────────────────────────────────────────────────────

/**
 * The probe fires often, so a module's change of Wealth ("Other") comes up in a few years. The player's
 * Guild is founded rich enough to play its month for years without Bankruptcy ending the game.
 */
const probe = createProbe({ probeFireBelow: 0.1, probeWealthDelta: 40 });
const deps: EngineDeps = {
  config: { ...defaultConfig, startingWealth: 100_000, rivalStartingWealthMin: 100_000, rivalStartingWealthMax: 100_000 },
  content,
  modules: [probe],
};

/** `result`'s document when the engine took the action; the one given when it refused. */
function tried(document: WorldDocument, result: { ok: true; document: WorldDocument } | { ok: false }): WorldDocument {
  return result.ok ? result.document : document;
}

/**
 * The player's Guild plays what a player might each month: signs a Hero, builds, buys and sells, sends
 * a Party, and every third month takes a Rival's Hero in and lets one of its own go, so every
 * category comes up on its side as the Rivals' own routine brings them up on theirs.
 */
function playersMonth(document: WorldDocument, month: number): WorldDocument {
  let next = document;
  const guildId = (playerGuild(next.world)?.id ?? lantern) as GuildId;
  const guild = () => next.world.guilds[guildId];
  const [signed] = unattachedHeroes(next.world);
  if (signed !== undefined) next = tried(next, applyAction(next, { kind: 'recruit', guildId, heroId: signed.id }, deps));
  next = tried(next, applyAction(next, { kind: 'build', guildId, facility: month % 2 === 0 ? 'infirmary' : 'quarters' }, deps));
  const cheapest = [...marketStock(next.world, deps)].sort((a, b) => a.price - b.price)[0];
  if (cheapest !== undefined) next = tried(next, applyAction(next, { kind: 'buy', guildId, definitionKey: cheapest.definition.key, quantity: 1 }, deps));
  const [stack] = holdings(next.world, { kind: 'guild', id: guildId }).stacks;
  if (stack !== undefined) next = tried(next, applyAction(next, { kind: 'sell', guildId, stackId: stack.id, quantity: 1 }, deps));
  const available = availableHeroes(next.world, guild() ?? { rosterIds: [] });
  const owner = guild();
  for (const quest of offeredQuests(next.world)) {
    if (owner === undefined) break;
    const heroIds = bestParties(next.world, owner, deps).party(quest, available)?.heroIds ?? null;
    if (heroIds === null) continue;
    next = tried(next, applyAction(next, { kind: 'dispatch', guildId, questId: quest.id, heroIds }, deps));
    break;
  }
  if (month % 3 === 0) {
    const rival = Object.values(next.world.guilds).find((other) => other.id !== guildId && other.foldedOnTurn === null && other.rosterIds.length > 1);
    const theirs = rival?.rosterIds[0];
    if (rival !== undefined && theirs !== undefined) next = tried(next, applyAction(next, { kind: 'transferIn', guildId, heroId: theirs }, deps));
    const atHome = availableHeroes(next.world, guild() ?? { rosterIds: [] }).filter(
      (h) => h.transferredOnTurn === null || next.world.turn - h.transferredOnTurn > deps.config.transferLockDays * 3,
    );
    const buyers = Object.values(next.world.guilds).filter((other) => other.id !== guildId && other.foldedOnTurn === null);
    if ((guild()?.rosterIds.length ?? 0) > 2) {
      for (const h of atHome) {
        let sold = false;
        for (const b of buyers) {
          const res = applyAction(next, { kind: 'transferOut', guildId, heroId: h.id, toGuildId: b.id }, deps);
          if (res.ok) {
            next = res.document;
            sold = true;
            break;
          }
        }
        if (sold) break;
      }
    }
  }
  return next;
}

/**
 * A game from `seed` played `years` years, the player's Guild playing its month every 30 Days. The last
 * Rival is founded with no Wealth and its Roster released to the Unattached pool, its founding saying
 * so, so it folds that night with its Roster wiped, and a Rival is founded in its place.
 */
function playedGame(seed: string, years: number): { start: WorldDocument; now: WorldDocument } {
  const start = createWorld(seed, setup, deps).document;
  const folding = Object.values(start.world.guilds).filter((guild) => guild.controller.kind === 'rival').at(-1);
  if (folding === undefined) throw new Error('no Rival');
  for (const heroId of folding.rosterIds) Object.assign(start.world.heroes[heroId] ?? {}, { guildId: null, unattachedSince: start.world.turn });
  folding.rosterIds = [];
  folding.wealth = 0;
  for (const entry of start.history.entries) {
    if (entry.type === 'guild.founded' && (entry.payload as { guildId: string }).guildId === folding.id) Object.assign(entry.payload as object, { wealth: 0 });
  }
  let now = start;
  const turns = years * defaultConfig.turnsPerYear;
  for (let turn = 0; turn < turns && now.world.ended === null; turn += 1) {
    if (turn % 90 === 0) now = playersMonth(now, turn / 90);
    now = advance(now, deps).document;
  }
  return { start: structuredClone(start), now };
}

describe('the ledger misses nothing', () => {
  // Played before the tests rather than as they are collected, so that the run, which starts the files
  // that took longest first, counts the games' time (DL-234). One game of two Years: its seed brings up
  // every category on both sides, which the test after the first holds.
  const seeds = ['ledger-1'];
  const games: ({ seed: string } & ReturnType<typeof playedGame>)[] = [];
  beforeAll(() => {
    games.push(...seeds.map((seed) => ({ seed, ...playedGame(seed, 2) })));
  }, 120_000);

  test.each(seeds)(
    "%s: every Guild's ledger, from its opening row, adds up to its Wealth now: the player's, each founding Rival's and each replacement's",
    (seed) => {
      const game = games.find((each) => each.seed === seed);
      if (game === undefined) throw new Error(`no game of ${seed}`);
      const { start, now } = game;
      const guilds = Object.values(now.world.guilds);
      // A Rival was founded in the folded one's place.
      expect(guilds.filter((guild) => !Object.hasOwn(start.world.guilds, guild.id)).length).toBeGreaterThan(0);
      for (const guild of guilds) {
        const rows = ledgerOf(now, guild.id);
        const opening = rows.at(-1);
        const founding = Object.hasOwn(start.world.guilds, guild.id) ? start.world.guilds[guild.id]?.wealth : undefined;
        // Its oldest row is the Wealth it was founded with, as the Guild's row had it at the start.
        expect(opening, guild.name).toMatchObject({ category: null, categoryWords: 'Opening balance', when: whenOfTurn(guild.foundedTurn, now.meta.config) });
        expect(opening?.sentence).toBe(`Founded with ${coinWords(opening?.amount ?? 0)}`);
        if (founding !== undefined) expect(opening?.amount, guild.name).toBe(founding);
        const sum = rows.reduce((total, row) => total + row.amount, 0);
        expect({ guild: guild.name, wealth: sum }).toEqual({ guild: guild.name, wealth: guild.wealth });
      }
    },
  );

  test('each row has a key of its own, the two lines of a split charge among them', () => {
    for (const { now } of games) {
      for (const guild of Object.values(now.world.guilds)) {
        const keys = ledgerOf(now, guild.id).map((row) => row.key);
        expect(new Set(keys).size, guild.name).toBe(keys.length);
      }
    }
  });

  test('the game brings up every category, for the player’s Guild and for the Rivals', () => {
    const player = (document: WorldDocument) => playerGuild(document.world)?.id ?? '';
    const categories = (rivals: boolean) =>
      new Set(
        games.flatMap(({ start, now }) =>
          Object.keys(start.world.guilds)
            .filter((id) => (id === player(now)) !== rivals)
            .flatMap((id) => ledgerOf(now, id as GuildId).flatMap((row) => (row.category === null ? [] : [row.category]))),
        ),
      );
    expect([...categories(false)].sort()).toEqual([...ledgerCategories].sort());
    expect([...categories(true)].sort()).toEqual([...ledgerCategories].sort());
  });
});

// ── The Treasury part ────────────────────────────────────────────────────────────────────────

/** The player's Guild's id in the game in hand. */
function mine(state: GameState): GuildId {
  return playerOf(documentOf(state)).id;
}

const both: FacetChoices<'flow' | 'category'> = {};

/**
 * The Treasury as its page composes it (`Accounts`, DL-213, DL-214): the accounts read once
 * (`treasuryAccounts`), filtered by `faceted` as `useFacets` filters them, and a page put in words
 * by `ledgerPage`, beside the filters' chips; `null` with no player's Guild.
 */
function treasuryPage(document: WorldDocument, filter: FacetChoices<'flow' | 'category'>, page: number) {
  const accounts = treasuryAccounts(document);
  if (accounts === null) return null;
  const { ledger, ...rest } = accounts;
  const shown = faceted(ledger.changes, ledger.facets, filter);
  return { ...rest, ledger: { ...ledgerPage(ledger, shown, page), filters: shown.facets } };
}

describe('The Treasury: the Wealth, Upkeep and the Bankruptcy floor', () => {
  test("gives the Guild's Wealth, and each charge of its Upkeep, the wages and the Hall's, with its next Day and its parts, as the engine reckons them (DL-298)", () => {
    const state = changed(played(started('treasury-upkeep'), { kind: 'advance', turns: 7 }), (document, player) => {
      player.hall = { ...player.hall, infirmary: 2 };
      const guildmaster = document.world.guildmasters[player.guildmasterId];
      if (guildmaster === undefined) throw new Error('no Guildmaster');
      guildmaster.traits = [];
    });
    const document = documentOf(state);
    const guild = document.world.guilds[mine(state)];
    if (guild === undefined) throw new Error('no Guild');
    const { config } = playDeps(document);
    const owed = wages(guild, document.world, config);
    const parts = hallUpkeepParts(guild, document.world, config, content);
    const infirmary = parts.facilities['infirmary'] ?? Number.NaN;
    const view = treasuryPage(document, both, 0);

    expect(view?.wealth).toBe(guild.wealth);
    expect(view?.upkeep.wages).toEqual({
      sentence: `Wages of The Lantern: ${coinWords(owed)} every ${config.upkeepEveryDays} Days`,
      total: owed,
      next: 'the night of Year 1 Day 10',
      parts: [],
    });
    expect(view?.upkeep.hall).toEqual({
      sentence: `Hall upkeep of The Lantern: ${coinWords(parts.total)} every ${config.hallUpkeepEveryDays} Days`,
      total: parts.total,
      next: 'the night of Year 1 Day 30',
      parts: [
        { label: 'The Hall', value: coinWords(parts.base), silver: parts.base },
        { label: `${parts.heroCount} Heroes`, value: coinWords(parts.heroes), silver: parts.heroes },
        { label: 'Infirmary, grade 2', value: coinWords(infirmary), silver: infirmary },
      ],
    });
    expect(parts.total).toBe(parts.base + parts.heroes + infirmary);
  });

  test("names the Guildmaster's Traits' factor among the Hall upkeep's parts when one bears on it, and not among the wages' (DL-298)", () => {
    const state = played(initialGameState, {
      kind: 'newGame',
      seed: 'treasury-thrifty',
      guildName: 'The Lantern',
      guildmasterName: 'Ada Vell',
      // Thrifty costs 2 of a budget of 1; Miser gives 2 back.
      guildmasterTraitKeys: ['thrifty', 'miser'],
      createdAt: '2026-09-30T09:00:00.000Z',
    });
    const upkeep = treasuryPage(documentOf(state), both, 0)?.upkeep;
    expect(upkeep?.hall.parts.at(-1)).toEqual({ label: 'Guildmaster’s Traits', value: '×0.9' });
    // The wages are not scaled (DL-298).
    expect(upkeep?.wages.parts).toEqual([]);
  });

  test("gives a factor of two Traits as a figure a player reads, not the float's digits (code review)", () => {
    // Thrifty and Spendthrift together are no legal set, but a row that holds both multiplies their
    // factors, 0.9 × 1.1, which is 0.9900000000000001 in floating point.
    const state = changed(started('treasury-factors'), (document, player) => {
      const guildmaster = document.world.guildmasters[player.guildmasterId];
      if (guildmaster === undefined) throw new Error('no Guildmaster');
      guildmaster.traits = ['spendthrift', 'thrifty'];
    });
    expect(treasuryPage(documentOf(state), both, 0)?.upkeep.hall.parts.at(-1)).toEqual({ label: 'Guildmaster’s Traits', value: '×0.99' });
  });

  test('gives the Bankruptcy floor, and the countdown only while the Guild is below it', () => {
    const state = started('treasury-floor');
    const floor = playDeps(documentOf(state)).config.bankruptcyFloor;
    const above = treasuryPage(documentOf(state), both, 0);
    expect(above?.floor).toBe(floor);
    expect(above?.countdown).toBeNull();

    const below = withWealth(state, floor - 50, 0);
    expect(treasuryPage(documentOf(below), both, 0)?.countdown).toBe(countdownView(documentOf(below)));
    expect(treasuryPage(documentOf(below), both, 0)?.countdown).toMatch(/below the Bankruptcy floor since Year 1 Day 1:/);
  });

  test('gives no next payment once the game has ended', () => {
    const state = changed(started('treasury-ended'), (document) => {
      document.world.ended = { turn: document.world.turn, reason: 'bankruptcy' };
    });
    const upkeep = treasuryPage(documentOf(state), both, 0)?.upkeep;
    expect([upkeep?.wages.next, upkeep?.hall.next]).toEqual([null, null]);
  });

  test("is null in a save with no player's Guild", () => {
    const state = changed(started('treasury-none'), (_, player) => {
      player.controller = { kind: 'rival', disposition: 'steady' };
    });
    expect(treasuryPage(documentOf(state), both, 0)).toBeNull();
  });
});

describe("The Treasury: the ledger's filters, totals and pages", () => {
  /** A game in which The Lantern bought and sold at the Market, signed a Hero and paid Upkeep. */
  function traded(): GameState {
    let state = withWealth(started('treasury-ledger'), 5_000);
    const [listing] = marketStock(documentOf(state).world, playDeps(documentOf(state)));
    if (listing === undefined) throw new Error('nothing for sale');
    state = played(state, { kind: 'buy', definitionKey: listing.definition.key, quantity: 2 });
    const [stack] = holdings(documentOf(state).world, { kind: 'guild', id: mine(state) }).stacks;
    if (stack === undefined) throw new Error('nothing held');
    state = played(state, { kind: 'sell', stackId: stack.id, quantity: 1 });
    const [signing] = unattachedHeroes(documentOf(state).world);
    if (signing === undefined) throw new Error('no one in the pool');
    state = played(state, { kind: 'recruit', heroId: signing.id });
    return played(state, { kind: 'advance', turns: 30 });
  }

  /** The payload of the History's first entry of `type`. */
  function payloadOf<Payload>(state: GameState, type: string): Payload {
    const found = documentOf(state).history.entries.find((entry) => entry.type === type);
    if (found === undefined) throw new Error(`no ${type}`);
    return found.payload as Payload;
  }

  test('shows every row, newest first, with its Day, its words, its category and its amount, and totals them', () => {
    const state = traded();
    const view = treasuryPage(documentOf(state), both, 0);
    const { cost } = payloadOf<{ cost: number }>(state, 'item.bought');
    const { proceeds } = payloadOf<{ proceeds: number }>(state, 'item.sold');
    const { fee } = payloadOf<{ fee: number }>(state, 'hero.recruited');
    const { amount: upkeep } = payloadOf<{ amount: number }>(state, 'guild.wages-paid');

    const { wealth: founding } = payloadOf<{ wealth: number }>(state, 'guild.founded');
    expect(view?.ledger.rows.map((row) => [row.category, row.amount])).toEqual([
      ['wages', -upkeep],
      ['signing-fees', -fee],
      ['item-sales', proceeds],
      ['item-purchases', -cost],
      // The ledger opens with the Wealth the Guild was founded with (DL-120 item 4).
      [null, founding],
    ]);
    const [paid, , , bought, opening] = view?.ledger.rows ?? [];
    expect(opening).toMatchObject({ when: 'Year 1 Day 1, morning', sentence: `Founded with ${coinWords(founding)}`, categoryWords: 'Opening balance' });
    expect(founding).toBe(defaultConfig.startingWealth);
    expect(view?.ledger).toMatchObject({ shown: 4, opens: true });
    expect(paid?.categoryWords).toBe('Wages');
    expect(paid?.when).toBe('Year 1 Day 10, night');
    expect(paid?.amount).toBe(-upkeep);
    expect(bought?.sentence).toMatch(/^The Lantern bought 2 × .* at the Market for (\d+ Gold( \d+ Silver)?|\d+ Silver)\.$/);
    expect(bought?.segments[0]).toMatchObject({ kind: 'name', text: 'The Lantern', table: 'guilds' });
    expect(bought?.when).toBe('Year 1 Day 1, morning');

    const expense = -(upkeep + fee + cost);
    expect(view?.ledger.totals).toEqual({
      income: proceeds,
      expense,
      net: proceeds + expense,
      sections: {
        income: {
          total: proceeds,
          lines: {
            'quest-rewards': 0,
            'item-sales': proceeds,
            'transfers-out': 0,
          },
        },
        expenses: {
          total: expense,
          lines: {
            wages: -upkeep,
            'hall-upkeep': 0,
            'improvement-upkeep': 0,
            'item-purchases': -cost,
            improvements: 0,
            'signing-fees': -fee,
            'transfers-in': 0,
          },
        },
        expense: {
          total: expense,
          lines: {
            wages: -upkeep,
            'hall-upkeep': 0,
            'improvement-upkeep': 0,
            'item-purchases': -cost,
            improvements: 0,
            'signing-fees': -fee,
            'transfers-in': 0,
          },
        },
      },
    });
  });

  test('filters by income, by expense, and by categories, several of each, and totals only what is shown', () => {
    const document = documentOf(traded());
    const income = treasuryPage(document, { flow: ['income'] }, 0)?.ledger;
    // The opening row is no income: a filter leaves it out, and the totals are the changes' alone.
    expect(income?.rows.map((row) => row.category)).toEqual(['item-sales']);
    expect(income?.opens).toBe(false);
    expect(income?.totals.expense).toBe(0);
    expect(income?.totals.net).toBe(income?.totals.income);

    const expense = treasuryPage(document, { flow: ['expense'] }, 0)?.ledger;
    expect(expense?.rows.map((row) => row.category)).toEqual(['wages', 'signing-fees', 'item-purchases']);
    expect(expense?.totals.income).toBe(0);

    const purchases = treasuryPage(document, { category: ['item-purchases'] }, 0)?.ledger;
    expect(purchases?.rows.map((row) => row.category)).toEqual(['item-purchases']);
    expect(purchases?.shown).toBe(1);
    expect(purchases?.opens).toBe(false);
    expect(treasuryPage(document, { flow: ['expense'], category: ['item-purchases'] }, 0)?.ledger.rows).toHaveLength(1);
    expect(treasuryPage(document, { flow: ['income'], category: ['wages'] }, 0)?.ledger.rows).toEqual([]);
    // A category the ledger holds no change of is no choice, and is let go.
    expect(treasuryPage(document, { flow: ['income'], category: ['improvements'] }, 0)?.ledger.rows.map((row) => row.category)).toEqual(['item-sales']);
    // Several categories: the rows of either.
    expect(treasuryPage(document, { category: ['wages', 'signing-fees'] }, 0)?.ledger.rows.map((row) => row.category)).toEqual(['wages', 'signing-fees']);
    // Both ways chosen reads as All: every change, and the opening row.
    const whole = treasuryPage(document, { flow: ['income', 'expense'] }, 0)?.ledger;
    expect(whole).toMatchObject({ shown: 4, opens: true });
    expect(whole?.filters.flow.chosen).toEqual([]);
  });

  test("names each category the Guild's ledger holds, in the Treasury's order, and income and expense, each with its count against the other filter (DL-206 item 29)", () => {
    const document = documentOf(traded());
    const { filters } = treasuryPage(document, both, 0)?.ledger ?? {};
    expect(filters?.category).toEqual({
      label: 'Show of category',
      chosen: [],
      options: [
        { key: 'item-sales', label: 'Item sales', count: 1 },
        { key: 'wages', label: 'Wages', count: 1 },
        { key: 'item-purchases', label: 'Item purchases', count: 1 },
        { key: 'signing-fees', label: 'Signing fees', count: 1 },
      ],
    });
    expect(filters?.flow).toEqual({
      label: 'Show income or expense',
      chosen: [],
      options: [
        { key: 'income', label: 'Income', count: 1 },
        { key: 'expense', label: 'Expense', count: 3 },
      ],
    });
    // Income chosen: each category counts its income; the flows count among every category still.
    const income = treasuryPage(document, { flow: ['income'], category: ['item-purchases', 'item-sales'] }, 0)?.ledger.filters;
    expect(income?.category.options.map((option) => [option.key, option.count])).toEqual([
      ['item-sales', 1],
      ['wages', 0],
      ['item-purchases', 0],
      ['signing-fees', 0],
    ]);
    expect(income?.flow.options.map((option) => [option.key, option.count])).toEqual([
      ['income', 1],
      ['expense', 1],
    ]);
  });

  test('pages what is shown by 20, newest first; a page past the last reads as the last', () => {
    // Eleven purchases and eleven sales: over 20 rows, with no Turn played.
    const state = withTrades(started('treasury-pages'), 11, 11);
    const document = documentOf(state);
    const all = ledgerOf(document, mine(state));
    expect(all.length).toBeGreaterThan(20);
    const first = treasuryPage(document, both, 0)?.ledger;
    expect(first?.rows.map((row) => row.key)).toEqual(all.slice(0, 20).map((row) => row.key));
    expect(first?.page).toBe(0);
    expect(first?.pages).toBe(Math.ceil(all.length / 20));
    // The changes, less the opening row, which ends the last page.
    expect(first?.shown).toBe(all.length - 1);
    const last = treasuryPage(document, both, 99)?.ledger;
    expect(last?.page).toBe((first?.pages ?? 0) - 1);
    expect(last?.rows.map((row) => row.key)).toEqual(all.slice(20 * (last?.page ?? 0)).map((row) => row.key));
    expect(last?.rows.at(-1)?.category).toBeNull();
  });

  test("a new game's ledger holds its opening row alone, on one page, and totals of nothing", () => {
    const view = treasuryPage(documentOf(started('treasury-empty')), both, 0)?.ledger;
    expect(view?.rows.map((row) => row.sentence)).toEqual([`Founded with ${coinWords(defaultConfig.startingWealth)}`]);
    expect(view?.page).toBe(0);
    expect(view?.pages).toBe(1);
    expect(view?.shown).toBe(0);
    expect(view?.filters.category.options).toEqual([]);
    expect(view?.filters.flow.options.map((option) => option.count)).toEqual([0, 0]);
    expect(view?.totals).toMatchObject({ income: 0, expense: 0, net: 0 });
  });

  test('a Guild the History holds no founding for has no opening row, and a ledger with nothing to show has one empty page', () => {
    const document = documentOf(started('treasury-empty'));
    expect(ledgerOf(document, 'guild-999999' as GuildId)).toEqual([]);
    const ledger = treasuryAccounts(document)?.ledger;
    if (ledger === undefined) throw new Error('no player’s Guild');

    const view = ledgerPage({ ...ledger, changes: [], opening: null }, { rows: [], filtered: false }, 0);
    expect(view).toMatchObject({ rows: [], page: 0, pages: 1, shown: 0, opens: false });
  });
});
