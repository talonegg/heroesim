import {
  advance,
  availableHeroes,
  build,
  buy,
  createProbe,
  createWorld,
  defaultConfig,
  dispatch,
  holdings,
  makeId,
  marketStock,
  nextUpkeepDay,
  offeredQuests,
  partyFor,
  playerGuild,
  recruit,
  sell,
  transferIn,
  transferOut,
  unattachedHeroes,
  upkeepParts,
  type EngineDeps,
  type EntityId,
  type Entry,
  type EventType,
  type GuildId,
  type WorldDocument,
} from '@heroesim/engine';
import { describe, expect, test } from 'vitest';
import { content } from '../content';
import { changed, played, started, withWealth } from './game.test-support';
import { initialGameState, playDeps, type GameState } from './reducer';
import { countdownView } from './selectors';
import { ledgerOf, treasuryView, wealthChangeOf, type TreasuryFilter } from './treasury';

// The Treasury (M9-F3, DL-111 item 5, DL-112 item 6, DL-116): the ledger is every change to a Guild's
// Wealth read from the History by six categories. Its heart is that it misses nothing: a Guild's
// Wealth at the start plus its ledger is its Wealth now.

const setup = { guildName: 'The Lantern', guildmasterName: 'Ada Vell', createdAt: '2026-09-30T09:00:00.000Z' };

const lantern = makeId('guilds', 1);
const ashford = makeId('guilds', 2);
const hero = makeId('heroes', 7);

/** An entry of `type` at Turn 5 with `payload`, naming `participants`: what the engine appends. */
function entry(type: EventType, payload: object, participants: EntityId[] = [lantern]): Entry {
  return { turn: 5, type, participants, labels: {}, milestone: false, payload };
}

describe('wealthChangeOf: each category takes exactly its events', () => {
  test('Upkeep is what the Guild paid, against it', () => {
    expect(wealthChangeOf(entry('guild.upkeep-paid', { guildId: lantern, amount: 120, wealthAfter: 80 }), lantern)).toEqual({
      category: 'upkeep',
      amount: -120,
    });
  });

  test("a Quest's reward is what it paid the Guild, and a failed Quest's nil reward gives no row", () => {
    const resolved = (wealthDelta: number) =>
      entry('quest.resolved', { guildId: lantern, questId: makeId('quests', 3), partyId: makeId('parties', 1), heroIds: [], templateKey: 'x', band: wealthDelta === 0 ? 'fail' : 'success', wealthDelta, fameDelta: 0 });
    expect(wealthChangeOf(resolved(300), lantern)).toEqual({ category: 'quest', amount: 300 });
    expect(wealthChangeOf(resolved(0), lantern)).toBeNull();
  });

  test('the Market takes purchases against the Guild and sales for it, a fold’s sale among them', () => {
    expect(wealthChangeOf(entry('item.bought', { guildId: lantern, definitionKey: 'whetstone', quantity: 2, unitPrice: 15, cost: 30, itemIds: [] }), lantern)).toEqual({
      category: 'market',
      amount: -30,
    });
    for (const cause of ['sale', 'fold']) {
      expect(
        wealthChangeOf(entry('item.sold', { guildId: lantern, definitionKey: 'whetstone', quantity: 1, unitPrice: 7, proceeds: 7, itemIds: [], cause }), lantern),
      ).toEqual({ category: 'market', amount: 7 });
    }
  });

  test('the Hall takes an Improvement’s cost', () => {
    expect(
      wealthChangeOf(entry('guild.improved', { guildId: lantern, facility: 'infirmary', grade: 1, improvementKey: 'cots', cost: 250 }), lantern),
    ).toEqual({ category: 'hall', amount: -250 });
  });

  test('Heroes take a signing fee, and a Transfer fee counts against the Guild it goes to and for the one it leaves', () => {
    expect(wealthChangeOf(entry('hero.recruited', { heroId: hero, guildId: lantern, fee: 90 }, [hero, lantern]), lantern)).toEqual({
      category: 'heroes',
      amount: -90,
    });
    const transferred = entry('hero.transferred', { heroId: hero, fromGuildId: ashford, toGuildId: lantern, fee: 180, offerId: null }, [hero, ashford, lantern]);
    expect(wealthChangeOf(transferred, lantern)).toEqual({ category: 'heroes', amount: -180 });
    expect(wealthChangeOf(transferred, ashford)).toEqual({ category: 'heroes', amount: 180 });
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
    expect(wealthChangeOf(entry('guild.upkeep-paid', { guildId: ashford, amount: 120, wealthAfter: 80 }, [ashford]), lantern)).toBeNull();
    expect(wealthChangeOf(entry('item.bought', { guildId: ashford, definitionKey: 'whetstone', quantity: 1, unitPrice: 15, cost: 15, itemIds: [] }, [ashford]), lantern)).toBeNull();
    expect(wealthChangeOf(entry('guild.below-floor', { guildId: lantern, wealth: -5, floor: 0, dueDay: 30 }), lantern)).toBeNull();
    expect(wealthChangeOf(entry('guild.transfer-offered', { offerId: makeId('offers', 1), fromGuildId: ashford, toGuildId: lantern, heroId: hero, fee: 180, expiresOnTurn: 20 }), lantern)).toBeNull();
    expect(wealthChangeOf(entry('probe.fired', { guildId: lantern }), lantern)).toBeNull();
  });
});

// ── The ledger misses nothing ─────────────────────────────────────────────────────────────────

/** The probe fires often, so a module's change of Wealth ("Other") comes up in a few years. */
const probe = createProbe({ probeFireBelow: 0.1, probeWealthDelta: 40 });
const deps: EngineDeps = { config: defaultConfig, content, modules: [probe] };

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
  if (signed !== undefined) next = tried(next, recruit(next, { guildId, heroId: signed.id }, deps));
  next = tried(next, build(next, { guildId, facility: month % 2 === 0 ? 'infirmary' : 'quarters' }, deps));
  const cheapest = [...marketStock(next.world, deps)].sort((a, b) => a.price - b.price)[0];
  if (cheapest !== undefined) next = tried(next, buy(next, { guildId, definitionKey: cheapest.definition.key, quantity: 1 }, deps));
  const [stack] = holdings(next.world, { kind: 'guild', id: guildId }).stacks;
  if (stack !== undefined) next = tried(next, sell(next, { guildId, stackId: stack.id, quantity: 1 }, deps));
  const available = availableHeroes(next.world, guild() ?? { rosterIds: [] });
  for (const quest of offeredQuests(next.world)) {
    const heroIds = partyFor(quest, available, content);
    if (heroIds === null) continue;
    next = tried(next, dispatch(next, { guildId, questId: quest.id, heroIds }, deps));
    break;
  }
  if (month % 3 === 0) {
    const rival = Object.values(next.world.guilds).find((other) => other.id !== guildId && other.foldedOnTurn === null && other.rosterIds.length > 1);
    const theirs = rival?.rosterIds[0];
    if (rival !== undefined && theirs !== undefined) next = tried(next, transferIn(next, { guildId, heroId: theirs }, deps));
    const ours = guild()?.rosterIds.at(-1);
    if (rival !== undefined && ours !== undefined && (guild()?.rosterIds.length ?? 0) > 2) {
      next = tried(next, transferOut(next, { guildId, heroId: ours, toGuildId: rival.id }, deps));
    }
  }
  return next;
}

/** A game from `seed` played `years` years, the player's Guild playing its month every 30 Days. */
function playedGame(seed: string, years: number): { start: WorldDocument; now: WorldDocument } {
  const start = createWorld(seed, setup, deps).document;
  // Rich enough to play its month for years without Bankruptcy ending the game.
  const player = playerGuild(start.world);
  if (player !== undefined) player.wealth = 100_000;
  let now = start;
  const turns = years * defaultConfig.turnsPerYear;
  for (let turn = 0; turn < turns && now.world.ended === null; turn += 1) {
    if (turn % 90 === 0) now = playersMonth(now, turn / 90);
    now = advance(now, deps).document;
  }
  return { start: structuredClone(start), now };
}

describe('the ledger misses nothing (M9-F3)', () => {
  const games = ['ledger-1', 'ledger-2', 'ledger-3'].map((seed) => ({ seed, ...playedGame(seed, 2) }));

  test.each(games.map((game) => [game.seed, game] as const))(
    "%s: every founding Guild's Wealth at the start plus its ledger is its Wealth now, the player's and each Rival's",
    (_, { start, now }) => {
      for (const founded of Object.values(start.world.guilds)) {
        const rows = ledgerOf(now, founded.id);
        const sum = rows.reduce((total, row) => total + row.amount, 0);
        expect({ guild: founded.name, wealth: founded.wealth + sum }).toEqual({ guild: founded.name, wealth: now.world.guilds[founded.id]?.wealth });
      }
    },
  );

  test('the games bring up every category, for the player’s Guild and for the Rivals', () => {
    const player = (document: WorldDocument) => playerGuild(document.world)?.id ?? '';
    const categories = (rivals: boolean) =>
      new Set(
        games.flatMap(({ start, now }) =>
          Object.keys(start.world.guilds)
            .filter((id) => (id === player(now)) !== rivals)
            .flatMap((id) => ledgerOf(now, id as GuildId).map((row) => row.category)),
        ),
      );
    const all = ['upkeep', 'quest', 'market', 'hall', 'heroes', 'other'];
    expect([...categories(false)].sort()).toEqual([...all].sort());
    expect([...categories(true)].sort()).toEqual([...all].sort());
  });
});

// ── The Treasury part ────────────────────────────────────────────────────────────────────────

function documentOf(state: GameState): WorldDocument {
  if (state.document === null) throw new Error('no game');
  return state.document;
}

function mine(state: GameState): GuildId {
  const guild = playerGuild(documentOf(state).world);
  if (guild === undefined) throw new Error("no player's Guild");
  return guild.id;
}

const both: TreasuryFilter = { flow: 'both', category: null };

describe('treasuryView: the Wealth, Upkeep and the Bankruptcy floor (M9-F3)', () => {
  test("gives the Guild's Wealth, and Upkeep's next payment with its Day and its parts, as the engine reckons them", () => {
    const state = played(started('treasury-upkeep'), { kind: 'advance', turns: 7 });
    const document = documentOf(state);
    const guild = document.world.guilds[mine(state)];
    if (guild === undefined) throw new Error('no Guild');
    const { config } = playDeps(document);
    const parts = upkeepParts(guild, document.world, config, content);
    const view = treasuryView(document, both, 0);

    expect(view?.wealth).toBe(guild.wealth);
    expect(view?.upkeep.total).toBe(parts.total);
    expect(view?.upkeep.sentence).toBe(`Upkeep of The Lantern: ${parts.total} Wealth every ${config.upkeepEveryDays} Days`);
    expect(view?.upkeep.next).toBe(`the night of Day ${nextUpkeepDay(document.world.turn, config)}`);
    expect(view?.upkeep.next).toBe('the night of Day 9');
    expect(view?.upkeep.parts).toEqual([
      { label: 'Wages', value: String(parts.wages) },
      { label: 'Hall maintenance', value: String(parts.hallMaintenance) },
    ]);
  });

  test("names the Guildmaster's Traits' factor among the parts when one bears on Upkeep", () => {
    const state = played(initialGameState, {
      kind: 'newGame',
      seed: 'treasury-thrifty',
      guildName: 'The Lantern',
      guildmasterName: 'Ada Vell',
      // Thrifty costs 2 of a budget of 1; Miser gives 2 back.
      guildmasterTraitKeys: ['thrifty', 'miser'],
      createdAt: '2026-09-30T09:00:00.000Z',
    });
    expect(treasuryView(documentOf(state), both, 0)?.upkeep.parts.at(-1)).toEqual({ label: 'Guildmaster’s Traits', value: '×0.9' });
  });

  test("gives a factor of two Traits as a figure a player reads, not the float's digits (M9-F6, code review)", () => {
    // Thrifty and Spendthrift together are no legal set, but a row that holds both multiplies their
    // factors, 0.9 × 1.1, which is 0.9900000000000001 in floating point.
    const state = changed(started('treasury-factors'), (document, player) => {
      const guildmaster = document.world.guildmasters[player.guildmasterId];
      if (guildmaster === undefined) throw new Error('no Guildmaster');
      guildmaster.traits = ['spendthrift', 'thrifty'];
    });
    expect(treasuryView(documentOf(state), both, 0)?.upkeep.parts.at(-1)).toEqual({ label: 'Guildmaster’s Traits', value: '×0.99' });
  });

  test('gives the Bankruptcy floor, and the countdown only while the Guild is below it', () => {
    const state = started('treasury-floor');
    const floor = playDeps(documentOf(state)).config.bankruptcyFloor;
    const above = treasuryView(documentOf(state), both, 0);
    expect(above?.floor).toBe(floor);
    expect(above?.countdown).toBeNull();

    const below = withWealth(state, floor - 50, 0);
    expect(treasuryView(documentOf(below), both, 0)?.countdown).toBe(countdownView(documentOf(below)));
    expect(treasuryView(documentOf(below), both, 0)?.countdown).toMatch(/below the Bankruptcy floor since Day 0/);
  });

  test('gives no next payment once the game has ended', () => {
    const state = changed(started('treasury-ended'), (document) => {
      document.world.ended = { turn: document.world.turn, reason: 'bankruptcy' };
    });
    expect(treasuryView(documentOf(state), both, 0)?.upkeep.next).toBeNull();
  });

  test("is null in a save with no player's Guild", () => {
    const state = changed(started('treasury-none'), (_, player) => {
      player.controller = { kind: 'rival', disposition: 'steady' };
    });
    expect(treasuryView(documentOf(state), both, 0)).toBeNull();
  });
});

describe("treasuryView: the ledger's filters, totals and pages (M9-F3)", () => {
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
    const view = treasuryView(documentOf(state), both, 0);
    const { cost } = payloadOf<{ cost: number }>(state, 'item.bought');
    const { proceeds } = payloadOf<{ proceeds: number }>(state, 'item.sold');
    const { fee } = payloadOf<{ fee: number }>(state, 'hero.recruited');
    const { amount: upkeep } = payloadOf<{ amount: number }>(state, 'guild.upkeep-paid');

    expect(view?.ledger.rows.map((row) => [row.category, row.amount])).toEqual([
      ['upkeep', -upkeep],
      ['heroes', -fee],
      ['market', proceeds],
      ['market', -cost],
    ]);
    const [paid, , , bought] = view?.ledger.rows ?? [];
    expect(paid?.categoryWords).toBe('Upkeep');
    expect(paid?.when).toBe('Day 9, night');
    expect(paid?.amountWords).toBe(`-${upkeep}`);
    expect(bought?.sentence).toMatch(/^The Lantern bought 2 × .* at the Market for \d+ Wealth\.$/);
    expect(bought?.segments[0]).toMatchObject({ kind: 'name', text: 'The Lantern', table: 'guilds' });
    expect(bought?.when).toBe('Day 0, morning');

    const expense = -(upkeep + fee + cost);
    expect(view?.ledger.totals).toEqual({
      income: proceeds,
      expense,
      net: proceeds + expense,
      incomeWords: `+${proceeds}`,
      expenseWords: String(expense),
      netWords: String(proceeds + expense),
    });
  });

  test('filters by income, by expense, and by category, and totals only what is shown', () => {
    const document = documentOf(traded());
    const income = treasuryView(document, { flow: 'income', category: null }, 0)?.ledger;
    expect(income?.rows.map((row) => row.category)).toEqual(['market']);
    expect(income?.totals.expense).toBe(0);
    expect(income?.totals.net).toBe(income?.totals.income);

    const expense = treasuryView(document, { flow: 'expense', category: null }, 0)?.ledger;
    expect(expense?.rows.map((row) => row.category)).toEqual(['upkeep', 'heroes', 'market']);
    expect(expense?.totals.income).toBe(0);

    const market = treasuryView(document, { flow: 'both', category: 'market' }, 0)?.ledger;
    expect(market?.rows.map((row) => row.category)).toEqual(['market', 'market']);
    expect(market?.shown).toBe(2);
    expect(treasuryView(document, { flow: 'expense', category: 'market' }, 0)?.ledger.rows).toHaveLength(1);
    expect(treasuryView(document, { flow: 'income', category: 'hall' }, 0)?.ledger.rows).toEqual([]);
  });

  test("names each category the Guild's ledger holds, in the Treasury's order, with its count, whatever is shown", () => {
    const categories = treasuryView(documentOf(traded()), { flow: 'income', category: 'market' }, 0)?.ledger.categories;
    expect(categories).toEqual([
      { key: 'upkeep', label: 'Upkeep', count: 1 },
      { key: 'market', label: 'Market', count: 2 },
      { key: 'heroes', label: 'Heroes', count: 1 },
    ]);
  });

  test('pages what is shown by 20, newest first; a page past the last reads as the last', () => {
    // Most of a year of Upkeep: over 20 rows.
    const state = played(withWealth(started('treasury-pages'), 100_000), { kind: 'advance', turns: 900 });
    const document = documentOf(state);
    const all = ledgerOf(document, mine(state));
    expect(all.length).toBeGreaterThan(20);
    const first = treasuryView(document, both, 0)?.ledger;
    expect(first?.rows.map((row) => row.key)).toEqual(all.slice(0, 20).map((row) => row.key));
    expect(first?.page).toBe(0);
    expect(first?.pages).toBe(Math.ceil(all.length / 20));
    expect(first?.shown).toBe(all.length);
    const last = treasuryView(document, both, 99)?.ledger;
    expect(last?.page).toBe((first?.pages ?? 0) - 1);
    expect(last?.rows.map((row) => row.key)).toEqual(all.slice(20 * (last?.page ?? 0)).map((row) => row.key));
  });

  test('a ledger with nothing to show has one empty page, and totals of nothing', () => {
    const view = treasuryView(documentOf(started('treasury-empty')), both, 0)?.ledger;
    expect(view?.rows).toEqual([]);
    expect(view?.page).toBe(0);
    expect(view?.pages).toBe(1);
    expect(view?.totals).toMatchObject({ income: 0, expense: 0, net: 0 });
  });
});
