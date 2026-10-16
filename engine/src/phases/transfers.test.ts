import { describe, expect, test } from 'vitest';
import { applyTransferIn } from '../actions/transfer.js';
import type { EngineDeps, GameConfig } from '../config.js';
import type { ContentSet, DispositionKey } from '../content-types.js';
import { transferBid } from '../controllers/rival.js';
import { contractWage } from '../contract.js';
import { createWorld } from '../create.js';
import { compareByCodeUnit, type Guild, type Hero, type HeroId, type PartyId, type World, type WorldDocument } from '../document.js';
import type { EngineEvent, EngineEventOf } from '../events.js';
import { guildmasterOf } from '../guildmaster.js';
import { next } from '../rng.js';
import { dispositionOf, playerGuild, transferFee, upkeep } from '../selectors.js';
import { nightOf } from '../time.js';
import { deepFreeze, setup, testContent, testDeps, withDispositions, withValid } from '../world.test-support.js';
import { phaseContext } from './phase.js';
import { transfers } from './transfers.js';

// The Transfer Generator's night (DL-59). Each test builds a world, sets the Rosters, Wealth
// and appetites it is about, and runs the phase on a Generator night; the numbers it relies on are
// pinned. The acceptance boxes' multi-seed tests are controllers/transfer-generator.test.ts.

/** The config the tests rely on, pinned: every pair bids, weekly, and the range out of the way. */
const pins: Partial<GameConfig> = {
  negotiationRange: 0,
  marketSize: 0,
  transferFeeFactor: 2,
  transferGeneratorEveryDays: 7,
  transferGeneratorChance: 1,
  rivalRosterMin: 0,
  rivalRosterMax: 100,
  transferLockDays: 30,
};

/** The test content with each Disposition's `transferAppetite` as given, frozen. */
function withAppetites(appetites: Record<DispositionKey, number>, content: ContentSet = testContent): ContentSet {
  const dispositions = Object.fromEntries(
    Object.entries(content.dispositions).map(([key, row]) => [key, { ...row, transferAppetite: appetites[key] ?? row.transferAppetite }]),
  );
  return deepFreeze({ ...content, dispositions });
}

/** Four Rivals, dealt `ambitious`, `miserly`, `reckless`, `steady` in Guild id order (DL-56). */
const eager = withAppetites({ ambitious: 1, miserly: 0.9, reckless: 0.8, steady: 0.7 });
const deps = (overrides: Partial<GameConfig> = {}, content: ContentSet = eager): EngineDeps =>
  testDeps({ ...pins, ...overrides }, content);

/** The first Generator night: Day 6's, with `transferGeneratorEveryDays` 7. */
const generatorNight = nightOf(6);

/**
 * A world made with `with_`, but its Rivals' Rosters generated in the default range, 4 to 8 Heroes,
 * pinned: the Generator's own range in `with_` is the phase's to read, not the Guild Generator's.
 */
function created(seed: string, with_: EngineDeps): WorldDocument {
  const generating = testDeps({ ...with_.config, rivalRosterMin: 4, rivalRosterMax: 8 }, with_.content);
  return withValid(createWorld(seed, setup, generating).document, with_);
}

function rivals(world: World): Guild[] {
  return Object.values(world.guilds)
    .filter((guild) => dispositionOf(guild) !== null)
    .sort((a, b) => compareByCodeUnit(a.id, b.id));
}

function rivalOf(world: World, disposition: DispositionKey): Guild {
  const guild = rivals(world).find((rival) => dispositionOf(rival) === disposition);
  if (guild === undefined) throw new Error(`No ${disposition} Rival`);
  return guild;
}

function heroOf(world: World, heroId: HeroId): Hero {
  const hero = world.heroes[heroId];
  if (hero === undefined) throw new Error(`No Hero ${heroId}`);
  return hero;
}

/** Moves `count` Heroes from the end of `from`'s Roster to the end of `to`'s, as a Transfer would. */
function move(world: World, from: Guild, to: Guild, count: number): void {
  for (let moved = 0; moved < count; moved += 1) {
    const heroId = from.rosterIds.pop();
    if (heroId === undefined) throw new Error(`${from.id} has no Hero to move`);
    to.rosterIds.push(heroId);
    heroOf(world, heroId).guildId = to.id;
  }
}

/** Makes `guild`'s Roster `size` Heroes long, moving Heroes to or from the end of `spare`'s. */
function resize(world: World, guild: Guild, size: number, spare: Guild): void {
  if (guild.rosterIds.length > size) move(world, guild, spare, guild.rosterIds.length - size);
  if (guild.rosterIds.length < size) move(world, spare, guild, size - guild.rosterIds.length);
}

/** Runs the phase on `world` at `turn`, in place, and returns its events. */
function run(world: World, with_: EngineDeps, turn = generatorNight): EngineEvent[] {
  world.turn = turn;
  return transfers(world, phaseContext(world, with_));
}

const transferred = (events: readonly EngineEvent[]): EngineEventOf<'hero.transferred'>[] =>
  events.filter((event): event is EngineEventOf<'hero.transferred'> => event.type === 'hero.transferred');

/** `state` advanced by `draws` draws, on a copy. */
function drawn(state: World['rng']['rivals'], draws: number): World['rng']['rivals'] {
  const copy = structuredClone(state);
  for (let draw = 0; draw < draws; draw += 1) next(copy);
  return copy;
}

/**
 * The Hero of `seller` that `bidder` wants: the dearest it can pay for at home and never transferred
 * (so no lock holds them), the lowest id among equal fees.
 */
function dearest(world: World, bidder: Guild, seller: Guild, with_: EngineDeps): { heroId: HeroId; fee: number } {
  const guildmaster = guildmasterOf(bidder, world);
  const offers = seller.rosterIds
    .map((heroId) => heroOf(world, heroId))
    .filter((hero) => hero.partyId === null && hero.transferredOnTurn === null)
    .map((hero) => ({ heroId: hero.id, fee: transferFee(hero, guildmaster, with_) }))
    .filter(({ fee }) => fee <= bidder.wealth)
    .sort((a, b) => b.fee - a.fee || compareByCodeUnit(a.heroId, b.heroId));
  const [first] = offers;
  if (first === undefined) throw new Error(`${bidder.id} can pay for none of ${seller.id}'s Heroes`);
  return first;
}

/** Two Rivals only, `ambitious` and `miserly`, each rich enough to pay for any Hero. */
function pairWorld(seed: string, with_: EngineDeps): { document: WorldDocument; world: World; ambitious: Guild; miserly: Guild } {
  const document = created(seed, testDeps({ ...with_.config, rivalCount: 2 }, with_.content));
  const { world } = document;
  const ambitious = rivalOf(world, 'ambitious');
  const miserly = rivalOf(world, 'miserly');
  ambitious.wealth = 1_000_000;
  miserly.wealth = 1_000_000;
  return { document, world, ambitious, miserly };
}

describe('the Transfer Generator runs weekly', () => {
  test('on the night of every transferGeneratorEveryDays-th Day, and on no other night', () => {
    const with_ = deps();
    const { world } = created('weekly', with_);
    const ran: number[] = [];
    for (let day = 0; day <= 21; day += 1) {
      const copy = structuredClone(world);
      const before = structuredClone(copy.rng);
      const events = run(copy, with_, nightOf(day));
      if (JSON.stringify(copy.rng) !== JSON.stringify(before)) ran.push(day);
      if (!ran.includes(day)) expect(events, `Day ${day}`).toEqual([]);
    }
    expect(ran).toEqual([6, 13, 20]);
  });

  test('a fortnightly Generator runs on Days 13 and 27', () => {
    const with_ = deps({ transferGeneratorEveryDays: 14 });
    const { world } = created('fortnightly', with_);
    const ran = [6, 13, 20, 27].filter((day) => {
      const copy = structuredClone(world);
      run(copy, with_, nightOf(day));
      return JSON.stringify(copy.rng.rivals) !== JSON.stringify(world.rng.rivals);
    });
    expect(ran).toEqual([13, 27]);
  });
});

describe('one draw from rivals for each pair of Rivals in play', () => {
  test('six draws for four Rivals, whatever they hold, and no other stream moves', () => {
    for (const [chance, content] of [
      [0, eager],
      [1, eager],
      [1, withAppetites({ ambitious: 0, miserly: 0, reckless: 0, steady: 0 })],
    ] as const) {
      const with_ = deps({ transferGeneratorChance: chance }, content);
      const { world } = created('draws', with_);
      const before = structuredClone(world.rng);

      run(world, with_);

      for (const [name, state] of Object.entries(world.rng)) {
        expect(state, `${name} at chance ${chance}`).toEqual(name === 'rivals' ? drawn(before.rivals, 6) : before[name as keyof typeof before]);
      }
    }
  });

  test("the player's Guild is in no pair and a folded Rival leaves play: three Rivals, three draws", () => {
    const with_ = deps();
    const { world } = created('folded', with_);
    const player = playerGuild(world) as Guild;
    const folded = rivalOf(world, 'steady');
    folded.foldedOnTurn = 1;
    const before = structuredClone(world.rng.rivals);

    const events = run(world, with_);

    // Five Guilds, four of them Rivals and one folded: the pairs are those of the three in play.
    expect(world.rng.rivals).toEqual(drawn(before, 3));
    for (const event of transferred(events)) {
      expect([event.payload.fromGuildId, event.payload.toGuildId]).not.toContain(player.id);
      expect([event.payload.fromGuildId, event.payload.toGuildId]).not.toContain(folded.id);
    }
  });

  test('at a chance of 0 no Rival bids; at 1 every pair with a bid to make deals', () => {
    // The same world, as rich as the one below that deals six times: only the chance keeps it quiet.
    const still = deps({ transferGeneratorChance: 0 });
    const quiet = created('chance', still).world;
    for (const rival of rivals(quiet)) rival.wealth = 1_000_000;
    expect(run(quiet, still)).toEqual([]);

    const with_ = deps();
    const { world } = created('chance', with_);
    for (const rival of rivals(world)) rival.wealth = 1_000_000;
    // Each of the six pairs has a bid to make: every Roster is above the range's floor, every appetite
    // lets a Hero go from four, and every Rival can pay.
    expect(transferred(run(world, with_))).toHaveLength(6);
  });
});

describe('the bid', () => {
  test('the more transferAppetite-heavy of the pair bids, for the dearest Hero of the other it can pay for, through transferIn', () => {
    for (const [ambitiousAppetite, miserlyAppetite] of [
      [1, 0.5],
      [0.5, 1],
    ] as const) {
      // Any Wealth is enough to hire, so the bidder's only limit is the fee.
      const with_ = deps({}, withDispositions({ recruitThreshold: 0 }, withAppetites({ ambitious: ambitiousAppetite, miserly: miserlyAppetite })));
      const { document, world, ambitious, miserly } = pairWorld('heavier', with_);
      const [bidder, seller] = ambitiousAppetite > miserlyAppetite ? [ambitious, miserly] : [miserly, ambitious];
      // The bidder can pay for all but the dearest of the seller's Heroes, so the one it wants is the second dearest.
      const all = dearest(world, bidder, seller, with_);
      bidder.wealth = all.fee - 1;
      const wanted = dearest(world, bidder, seller, with_);
      const wealthBefore = bidder.wealth + seller.wealth;
      world.turn = generatorNight;
      // The bidder signs for its Disposition's length (DL-315): ambitious 1 year, miserly 3 in the test content.
      const years = bidder === ambitious ? 1 : 3;
      const wage = contractWage(world, world.heroes[wanted.heroId] as Hero, bidder, years, with_);
      const expected = applyTransferIn(structuredClone(world), { guildId: bidder.id, heroId: wanted.heroId, years }, with_);

      const events = run(world, with_);

      expect(transferred(events).map((event) => event.payload)).toEqual([
        { heroId: wanted.heroId, fromGuildId: seller.id, toGuildId: bidder.id, fee: wanted.fee, offerId: null, wage, years, endDay: 6 + years * 360 },
      ]);
      // Exactly what transferIn makes of the bid: its events, its fee, its Wealth.
      expect(expected.ok && expected.events).toEqual(events);
      expect(bidder.wealth + seller.wealth).toBe(wealthBefore);
      expect(heroOf(world, wanted.heroId).guildId).toBe(bidder.id);
      withValid({ ...document, world }, with_);
    }
  });

  test('of two with equal appetites, the one with fewer Heroes bids; with as many, the lower Guild id', () => {
    const with_ = deps({}, withAppetites({ ambitious: 0.5, miserly: 0.5 }));
    /** The Guild id of the bidder when ambitious's Roster holds `a` Heroes and miserly's `m`. */
    const bidderWith = (a: number, m: number): string[] => {
      const { world, ambitious, miserly } = pairWorld('tie', with_);
      const spare = playerGuild(world) as Guild;
      resize(world, ambitious, a, spare);
      resize(world, miserly, m, spare);
      return transferred(run(world, with_)).map((event) => event.payload.toGuildId);
    };
    const { ambitious, miserly } = pairWorld('tie', with_);
    expect(compareByCodeUnit(ambitious.id, miserly.id)).toBeLessThan(0);

    expect(bidderWith(5, 5)).toEqual([ambitious.id]);
    expect(bidderWith(6, 4)).toEqual([miserly.id]);
    expect(bidderWith(4, 6)).toEqual([ambitious.id]);
  });

  test('a Hero away in a Party is passed over for the dearest at home', () => {
    const with_ = deps({}, withAppetites({ ambitious: 1, miserly: 0.5 }));
    const { world, ambitious, miserly } = pairWorld('away', with_);
    const first = dearest(world, ambitious, miserly, with_);
    // Not a valid world (the Party has no row): the rule reads only the Hero's partyId.
    heroOf(world, first.heroId).partyId = 'party-999999' as PartyId;
    const second = dearest(world, ambitious, miserly, with_);

    expect(transferred(run(world, with_)).map((event) => event.payload.heroId)).toEqual([second.heroId]);
    expect(second.heroId).not.toBe(first.heroId);
  });
});

describe('the bid passes over a Hero a recent Transfer holds (DL-60)', () => {
  test('the dearest, bought the afternoon before, stays; the next dearest is bid for', () => {
    const with_ = deps({}, withAppetites({ ambitious: 1, miserly: 0.5 }));
    const { world, ambitious, miserly } = pairWorld('held', with_);
    const first = dearest(world, ambitious, miserly, with_);
    // Bought by the seller on the afternoon of the Generator's Day: held for transferLockDays from it.
    heroOf(world, first.heroId).transferredOnTurn = generatorNight - 1;
    const second = dearest(world, ambitious, miserly, with_);

    expect(transferred(run(world, with_)).map((event) => event.payload.heroId)).toEqual([second.heroId]);
    expect(second.heroId).not.toBe(first.heroId);
    expect(heroOf(world, first.heroId).guildId).toBe(miserly.id);
  });
});

describe('a bidder hiring by need (DL-60)', () => {
  test('below rivalRosterMin and under its threshold, bids only for a Hero whose fee leaves it its reserve', () => {
    const with_ = deps(
      { rivalRosterMin: 4, rivalHireReserveUpkeeps: 3 },
      withDispositions({ recruitThreshold: 1_000_000 }, withAppetites({ ambitious: 1, miserly: 0.5 })),
    );
    const { world, ambitious, miserly } = pairWorld('need-bid', with_);
    const spare = playerGuild(world) as Guild;
    resize(world, ambitious, 3, spare);
    resize(world, miserly, 6, spare);
    const reserve = with_.config.rivalHireReserveUpkeeps * upkeep(ambitious, world, with_.config, with_.content);
    const top = dearest(world, ambitious, miserly, with_);
    // What it would spend: a Wealth one short of the dearest fee and its reserve together.
    ambitious.wealth = top.fee - 1;
    const wanted = dearest(world, ambitious, miserly, with_);
    ambitious.wealth = top.fee + reserve - 1;

    expect(transferred(run(world, with_)).map((event) => event.payload.heroId)).toEqual([wanted.heroId]);
    expect(wanted.heroId).not.toBe(top.heroId);
    expect(ambitious.wealth).toBeGreaterThanOrEqual(reserve);
  });
});

describe('when there is no bid', () => {
  /** Whether the Generator made a Transfer in the two-Rival world `change` leaves, the draw still taken. */
  function deals(seed: string, with_: EngineDeps, change: (world: World, ambitious: Guild, miserly: Guild) => void): boolean {
    const { world, ambitious, miserly } = pairWorld(seed, with_);
    change(world, ambitious, miserly);
    const before = structuredClone(world.rng.rivals);
    const events = run(world, with_);
    expect(world.rng.rivals).toEqual(drawn(before, 1));
    return transferred(events).length > 0;
  }
  const heavy = withAppetites({ ambitious: 1, miserly: 0.5 });

  test('the Transfer would take the seller to rivalRosterMin or below, or the bidder above rivalRosterMax', () => {
    const size = (guild: Guild) => guild.rosterIds.length;
    // The seller's Roster at the range's floor, then one above it.
    const atFloor = pairWorld('floor', deps({}, heavy)).miserly;
    expect(deals('floor', deps({ rivalRosterMin: size(atFloor) }, heavy), () => undefined)).toBe(false);
    expect(deals('floor', deps({ rivalRosterMin: size(atFloor) - 1 }, heavy), () => undefined)).toBe(true);
    // The bidder's Roster at the range's ceiling, then one below it.
    const atCeiling = pairWorld('ceiling', deps({}, heavy)).ambitious;
    expect(deals('ceiling', deps({ rivalRosterMax: size(atCeiling) }, heavy), () => undefined)).toBe(false);
    expect(deals('ceiling', deps({ rivalRosterMax: size(atCeiling) + 1 }, heavy), () => undefined)).toBe(true);
  });

  test('the seller would not let a Hero go: its Roster too small for its appetite', () => {
    // miserly keeps its Roster less one; at an appetite of 1 / (kept) it lets one go, below that it does not.
    const kept = pairWorld('appetite', deps({}, heavy)).miserly.rosterIds.length - 1;
    expect(deals('appetite', deps({}, withAppetites({ ambitious: 1, miserly: 1 / kept })), () => undefined)).toBe(true);
    expect(deals('appetite', deps({}, withAppetites({ ambitious: 1, miserly: 1 / kept - 0.01 })), () => undefined)).toBe(false);
  });

  test('the bidder would not take a Hero in: its Wealth not above recruitThreshold times its Upkeep, or an appetite of 0', () => {
    const with_ = deps({}, heavy);
    // Its Wealth exactly at its row's recruitThreshold times its Upkeep, then one above it.
    const threshold = (world: World, guild: Guild) =>
      (with_.content.dispositions['ambitious']?.recruitThreshold ?? Number.NaN) * upkeep(guild, world, with_.config, with_.content);
    expect(deals('hire', with_, (world, ambitious) => (ambitious.wealth = threshold(world, ambitious)))).toBe(false);
    expect(deals('hire', with_, (world, ambitious) => (ambitious.wealth = threshold(world, ambitious) + 1))).toBe(true);
    expect(deals('zero', deps({}, withAppetites({ ambitious: 0, miserly: 0 })), () => undefined)).toBe(false);
  });

  test('the bidder can pay for none of the Heroes at home', () => {
    const with_ = deps({}, withDispositions({ recruitThreshold: 0 }, heavy));
    expect(deals('pay', with_, () => undefined)).toBe(true);
    expect(deals('poor', with_, (world, ambitious, miserly) => {
      const cheapest = Math.min(...miserly.rosterIds.map((heroId) => transferFee(heroOf(world, heroId), guildmasterOf(ambitious, world), with_)));
      ambitious.wealth = cheapest - 1;
    })).toBe(false);
    expect(deals('home', with_, (world, _ambitious, miserly) => {
      for (const heroId of miserly.rosterIds) heroOf(world, heroId).partyId = 'party-999999' as PartyId;
    })).toBe(false);
  });

  test('either Rival has a Disposition content does not define', () => {
    for (const disposition of ['ambitious', 'miserly'] as const) {
      expect(deals(`unknown-${disposition}`, deps({}, heavy), (world) => {
        const guild = rivalOf(world, disposition);
        guild.controller = { kind: 'rival', disposition: 'unheard-of' };
      })).toBe(false);
    }
  });

  test('transferBid names no bid for a pair with the player in it', () => {
    const with_ = deps();
    const { world } = created('player-pair', with_);
    const player = playerGuild(world) as Guild;
    for (const rival of rivals(world)) {
      rival.wealth = 1_000_000;
      expect(transferBid(world, [player, rival], with_)).toBeNull();
      expect(transferBid(world, [rival, player], with_)).toBeNull();
    }
  });
});

describe("the player's Roster", () => {
  test("is never a source: with every Rival eager and rich, the player's Guild, Guildmaster and Heroes are untouched", () => {
    const with_ = deps();
    const document = created('untouched', with_);
    const { world } = document;
    const player = playerGuild(world) as Guild;
    for (const rival of rivals(world)) rival.wealth = 1_000_000;
    const snapshot = () =>
      JSON.stringify([player, world.guildmasters[player.guildmasterId], player.rosterIds.map((heroId) => heroOf(world, heroId))]);
    const before = snapshot();

    const events = run(world, with_);

    expect(transferred(events).length).toBeGreaterThan(0);
    expect(snapshot()).toBe(before);
    for (const event of events) expect(event.participants, event.type).not.toContain(player.id);
    withValid({ ...document, world }, with_);
  });
});
