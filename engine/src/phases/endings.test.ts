import { afterEach, describe, expect, test, vi } from 'vitest';
import { dispatch } from '../actions/dispatch.js';
import { advance } from '../advance.js';
import type { StopReason } from '../stops.js';
import { defaultConfig, type EngineDeps } from '../config.js';
import { availableHeroes, partyFor } from '../controllers/rival.js';
import { createWorld } from '../create.js';
import {
  takeId,
  type EndingReason,
  type Guild,
  type GuildId,
  type HeroId,
  type Holder,
  type QuestId,
  type World,
  type WorldDocument,
} from '../document.js';
import type { EngineEvent, TurnEvent } from '../events.js';
import { count, entriesFor } from '../history.js';
import { addStack, createItem, holdings } from '../items.js';
import { marketHolder, sellPrice } from '../market.js';
import { phases } from '../pipeline.js';
import { createStreams } from '../rng.js';
import { dispositionOf, playerGuild, rankings, signingFee, signingRefusal, unattachedHeroes } from '../selectors.js';
import { nightOf, retirementTurn, retiresOn } from '../time.js';
import { guildmasterRegardForGuild } from '../regard.js';
import { plannedStreams, testContent, testDeps, thriftyRivals, withDispositions, withValid } from '../world.test-support.js';
import { endings } from './endings.js';
import { phaseContext } from './phase.js';

// M2-S10: the endings (DL-28). Each ending is arranged on a world `createWorld` made, then played
// through `advance`; every document a test inspects is held to the validator.

const setup = { guildmasterName: 'Aldith Barrowby', guildName: 'The Salt Road Guild', createdAt: 'test' };

afterEach(() => {
  vi.restoreAllMocks();
});

/**
 * Stills every Rival's controller until the returned spy is restored. From M2-S9 each Rival
 * dispatches and recruits every afternoon (DL-30), changing the Roster, the Parties and the pool
 * that a test arranges before an ending; a test whose subject is not the Rivals' choices stills
 * them, as DL-30 item 11 does.
 */
function stillRivalControllers() {
  const rivalControllers = phases.find((phase) => phase.name === 'rivalControllers');
  if (rivalControllers === undefined) throw new Error('No rivalControllers phase');
  return vi.spyOn(rivalControllers, 'run').mockReturnValue([]);
}

function created(seed: string, deps: EngineDeps): WorldDocument {
  return createWorld(seed, setup, deps).document;
}

interface Played {
  document: WorldDocument;
  /** Every event of every Turn played. */
  events: TurnEvent[];
  /** What the last Turn played reported. */
  stoppedBecause: StopReason | null;
}

/** Advances `document` to Turn `turn`, or until the game ends. */
function playTo(document: WorldDocument, turn: number, deps: EngineDeps): Played {
  let current = document;
  let stoppedBecause: StopReason | null = null;
  const events: TurnEvent[] = [];
  while (current.world.turn < turn && current.world.ended === null) {
    const result = advance(current, deps);
    current = result.document;
    stoppedBecause = result.stoppedBecause;
    events.push(...result.events);
  }
  return { document: withValid(current, deps), events, stoppedBecause };
}

const ofType = <Type extends EngineEvent['type']>(events: TurnEvent[], type: Type) =>
  events.filter((event): event is Extract<EngineEvent, { type: Type }> => event.type === type);

function guildOf(world: World, id: GuildId): Guild {
  const guild = world.guilds[id];
  if (guild === undefined) throw new Error(`No ${id}`);
  return guild;
}

function thePlayer(world: World): Guild {
  const guild = playerGuild(world);
  if (guild === undefined) throw new Error('No player Guild');
  return guild;
}

/** The first Rival, by id: the player's Guild is `guild-000001`, created first. */
function firstRival(world: World): Guild {
  const player = thePlayer(world);
  const rival = Object.values(world.guilds).find((guild) => guild.id !== player.id);
  if (rival === undefined) throw new Error('No Rival');
  return rival;
}

/** Every Hero on `guild`'s Roster dies, as on a Quest: off the Roster, keeping their `guildId`. */
function wipeRoster(world: World, guild: Guild): void {
  for (const heroId of guild.rosterIds) {
    const hero = world.heroes[heroId];
    if (hero !== undefined) hero.diedOnTurn = world.turn;
  }
  guild.rosterIds = [];
}

/** The cheapest fee in the pool at the price `guild` pays: its Guildmaster's Negotiation applied (M4-S5). */
function cheapestFee(world: World, deps: EngineDeps, guild: Guild): number {
  const buyer = world.guildmasters[guild.guildmasterId];
  return Math.min(...unattachedHeroes(world).map((hero) => signingFee(hero, deps, buyer)));
}

const reasons = ['retirement', 'bankruptcy', 'roster-wiped'] as const satisfies readonly EndingReason[];

/** The endings that fold a Rival: a Rival's Guildmaster's Retirement is met by Succession (M9-S2). */
const foldReasons = ['bankruptcy', 'roster-wiped'] as const satisfies readonly EndingReason[];

type Arrangement = (world: World, guild: Guild, deps: EngineDeps) => void;

/**
 * Arranges each ending on `guild` at Turn 0, so that it is reached on the first night (Bankruptcy
 * under `bankruptcyGraceDays: 0`).
 */
const arrange: Record<(typeof reasons)[number], Arrangement> = {
  retirement: (world, guild, deps) => {
    const guildmaster = world.guildmasters[guild.guildmasterId];
    if (guildmaster !== undefined) guildmaster.ageAtEntry = deps.config.guildmasterRetirementAge;
  },
  bankruptcy: (_world, guild, deps) => {
    guild.wealth = deps.config.bankruptcyFloor - 1; // below the floor from the first night
  },
  'roster-wiped': (world, guild) => {
    wipeRoster(world, guild);
    guild.wealth = 0;
  },
};

// ── The player's endings ─────────────────────────────────────────────────────────────────────

describe("the player's ending ends the game", () => {
  test('Retirement: on the first night the Guildmaster is guildmasterRetirementAge, 61 by default (DL-113)', () => {
    const deps = testDeps({ turnsPerYear: 30 }); // ten Days a year, so that a birthday comes soon
    expect(deps.config.guildmasterRetirementAge).toBe(61);
    const start = created('retirement', deps);
    const player = thePlayer(start.world);
    const guildmaster = start.world.guildmasters[player.guildmasterId];
    if (guildmaster === undefined) throw new Error('No Guildmaster');
    guildmaster.ageAtEntry = 60;

    // 60 until Turn 30, the morning of Day 10; the check is at night.
    const before = playTo(start, nightOf(9), deps);
    expect(before.document.world.ended).toBeNull();
    const { document, events, stoppedBecause } = playTo(before.document, nightOf(10), deps);

    expect(document.world.turn).toBe(nightOf(10));
    expect(document.world.ended).toEqual({ turn: nightOf(10), reason: 'retirement' });
    expect(ofType(events, 'game.ended')).toEqual([
      {
        turn: nightOf(10),
        type: 'game.ended',
        participants: [player.id, player.guildmasterId],
        labels: { [player.id]: player.name, [player.guildmasterId]: guildmaster.name },
        milestone: true,
        payload: { guildId: player.id, reason: 'retirement' },
      },
    ]);
    expect(stoppedBecause).toEqual({ kind: 'ended' });
    // The game ends instead of the Guild folding: its row and Roster stand as they were.
    expect(guildOf(document.world, player.id)).toMatchObject({ foldedOnTurn: null, rosterIds: player.rosterIds });
    expect(count(document.history, 'guild.folded')).toBe(0);
  });

  test('Bankruptcy: once Wealth has stayed below the floor for bankruptcyGraceDays, 30 by default', () => {
    const deps = testDeps();
    expect(deps.config.bankruptcyGraceDays).toBe(30);
    const start = created('bankruptcy', deps);
    const player = thePlayer(start.world);
    player.wealth = deps.config.bankruptcyFloor - 1;

    // Below the floor from the night of Day 0 (the Guild State Engine); thirty Days on, it ends.
    const before = playTo(start, nightOf(29), deps);
    expect(guildOf(before.document.world, player.id).belowFloorSince).toBe(nightOf(0));
    expect(before.document.world.ended).toBeNull();
    const { document, events, stoppedBecause } = playTo(before.document, nightOf(30), deps);

    expect(document.world.ended).toEqual({ turn: nightOf(30), reason: 'bankruptcy' });
    expect(ofType(events, 'game.ended')).toEqual([
      expect.objectContaining({ turn: nightOf(30), milestone: true, payload: { guildId: player.id, reason: 'bankruptcy' } }),
    ]);
    expect(stoppedBecause).toEqual({ kind: 'ended' });
  });

  test('Bankruptcy: Wealth back at the floor before the grace runs out ends nothing', () => {
    const deps = testDeps({ bankruptcyGraceDays: 3 });
    const start = created('recovery', deps);
    thePlayer(start.world).wealth = deps.config.bankruptcyFloor - 1;
    const below = playTo(start, nightOf(2), deps);
    thePlayer(below.document.world).wealth = deps.config.bankruptcyFloor;

    const { document, events } = playTo(below.document, nightOf(5), deps);

    expect(document.world.ended).toBeNull();
    expect(thePlayer(document.world).belowFloorSince).toBeNull();
    expect(ofType(events, 'game.ended')).toEqual([]);
  });

  test('Roster wiped: no Hero on the Roster and Wealth below the cheapest signing fee in the pool', () => {
    const deps = testDeps();
    const start = created('wiped', deps);
    const player = thePlayer(start.world);
    wipeRoster(start.world, player);
    player.wealth = cheapestFee(start.world, deps, player) - 1;

    const { document, events, stoppedBecause } = playTo(start, nightOf(0), deps);

    expect(document.world.ended).toEqual({ turn: nightOf(0), reason: 'roster-wiped' });
    expect(ofType(events, 'game.ended')).toEqual([
      expect.objectContaining({ turn: nightOf(0), milestone: true, payload: { guildId: player.id, reason: 'roster-wiped' } }),
    ]);
    expect(stoppedBecause).toEqual({ kind: 'ended' });
  });

  test('an empty Roster with Wealth for the cheapest Hero in the pool is not wiped', () => {
    // No Rivals: from M2-S9 a Rival signs the cheapest Hero in the afternoon, and the player's
    // Wealth, the fee of the cheapest at Turn 0, no longer covers the cheapest left by night.
    const deps = testDeps({ rivalCount: 0 });
    const start = created('not-wiped', deps);
    const player = thePlayer(start.world);
    wipeRoster(start.world, player);
    player.wealth = cheapestFee(start.world, deps, player);

    const { document } = playTo(start, nightOf(1), deps);

    expect(document.world.ended).toBeNull();
  });

  test('an empty Roster whose Wealth reaches only Heroes who refuse its Fame is waiting, not wiped (M3-S5, DL-38)', () => {
    // No Rivals, so that nobody signs from the pool before night.
    const refusing = testDeps({ rivalCount: 0, fameRequiredPerLevel: 10 });
    const start = created('waiting-for-fame', refusing);
    const player = thePlayer(start.world);
    wipeRoster(start.world, player);
    player.fame = 0;
    const pool = unattachedHeroes(start.world);
    for (const hero of pool) hero.level = 2;
    expect(pool.every((hero) => signingRefusal(player, hero, refusing.config) !== null)).toBe(true);
    player.wealth = cheapestFee(start.world, refusing, player);

    expect(playTo(structuredClone(start), nightOf(0), refusing).document.world.ended).toBeNull();
    // A fee short of every Hero in the pool is wiped, as before: Fame is not what ends a Guild.
    player.wealth -= 1;
    expect(playTo(start, nightOf(0), refusing).document.world.ended).toEqual({ turn: nightOf(0), reason: 'roster-wiped' });
  });

  test('an empty Roster with nobody in the pool to sign is wiped, whatever the Wealth', () => {
    const deps = testDeps({ unattachedPoolSize: 0 });
    const start = created('empty-pool', deps);
    const player = thePlayer(start.world);
    wipeRoster(start.world, player);
    player.wealth = 1_000_000;

    const { document } = playTo(start, nightOf(0), deps);

    expect(unattachedHeroes(document.world)).toEqual([]);
    expect(document.world.ended).toEqual({ turn: nightOf(0), reason: 'roster-wiped' });
  });

  test.each(reasons)('%s arranged on the player ends the game on the first night', (reason) => {
    const deps = testDeps({ bankruptcyGraceDays: 0 });
    const start = created(`player-${reason}`, deps);
    arrange[reason](start.world, thePlayer(start.world), deps);

    const { document, events } = playTo(start, nightOf(0), deps);

    expect(document.world.ended).toEqual({ turn: nightOf(0), reason });
    expect(ofType(events, 'game.ended').map((event) => event.payload.reason)).toEqual([reason]);
    expect(ofType(events, 'guild.folded')).toEqual([]);
  });

  test('a Guild that meets several endings at once reaches one: Retirement, then Bankruptcy, then Roster wiped', () => {
    const deps = testDeps({ bankruptcyGraceDays: 0 });
    const { world } = created('several', deps);
    world.turn = nightOf(0);
    const player = thePlayer(world);
    arrange.bankruptcy(world, player, deps);
    player.belowFloorSince = nightOf(0);
    arrange['roster-wiped'](world, player, deps);
    player.wealth = -1;
    const withoutRetirement = structuredClone(world);
    arrange.retirement(world, player, deps);

    const reasonsOf = (events: TurnEvent[]) => ofType(events, 'game.ended').map((event) => event.payload.reason);
    expect(reasonsOf(endings(world, phaseContext(world, deps)))).toEqual(['retirement']);
    expect(reasonsOf(endings(withoutRetirement, phaseContext(withoutRetirement, deps)))).toEqual(['bankruptcy']);
  });
});

// M9-F1 (DL-113 items 4 and 5): every Guildmaster 21 to 50 at the start and retiring at 61, on the
// Turn `retirementTurn` gives, which the endings read. The year is the default's 1,080 Turns: the
// world is moved to the night before, and the Rivals stilled.
describe('Retirement at 61, on the Turn retirementTurn gives (M9-F1)', () => {
  test('the defaults: every Guildmaster starts 21 to 50 and retires at 61, under configVersion 12', () => {
    expect(defaultConfig).toMatchObject({
      guildmasterStartingAgeMin: 21,
      guildmasterStartingAgeMax: 50,
      guildmasterRetirementAge: 61,
      configVersion: 12,
    });
  });

  /** A world whose Guildmaster of the Guild `pick` gives entered aged `age` on `enteredTurn`, moved to the night before their Retirement. */
  function toTheEve(seed: string, pick: (world: World) => Guild, age: number, enteredTurn = 0) {
    stillRivalControllers();
    const deps = testDeps({ startingWealth: 100_000 });
    const start = created(seed, deps);
    const guild = pick(start.world);
    // Every other Guildmaster is 21, so that none of them retires in the years skipped.
    for (const other of Object.values(start.world.guildmasters)) other.ageAtEntry = 21;
    const guildmaster = start.world.guildmasters[guild.guildmasterId];
    if (guildmaster === undefined) throw new Error('No Guildmaster');
    Object.assign(guildmaster, { ageAtEntry: age, enteredTurn });
    const retires = retirementTurn(guildmaster, deps.config);
    start.world.turn = retires - 3;
    return { deps, eve: withValid(start, deps), guild, guildmaster, retires };
  }

  test("the player's Guildmaster founded at 50 retires on the first night they are 61, Turn 11,882, and the game ends", () => {
    const { deps, eve, guild, retires } = toTheEve('at-fifty', thePlayer, 50);
    expect(retires).toBe(11_882);

    const before = playTo(eve, retires - 1, deps);
    expect(before.document.world.ended).toBeNull();
    const { document, events } = playTo(before.document, retires, deps);

    expect(document.world.ended).toEqual({ turn: retires, reason: 'retirement' });
    expect(ofType(events, 'game.ended').map((event) => [event.turn, event.payload])).toEqual([[retires, { guildId: guild.id, reason: 'retirement' }]]);
  });

  test("a Rival's Guildmaster founded at 50 is succeeded on the Turn retirementTurn gives, at 61", () => {
    const { deps, eve, guild, guildmaster, retires } = toTheEve('rival-at-fifty', firstRival, 50);

    const before = playTo(eve, retires - 1, deps);
    expect(ofType(before.events, 'guildmaster.succeeded')).toEqual([]);
    const { document, events } = playTo(before.document, retires, deps);

    expect(document.world.ended).toBeNull();
    const succeeded = ofType(events, 'guildmaster.succeeded');
    expect(succeeded.map((event) => [event.turn, event.payload.guildmasterId, event.payload.age])).toEqual([[retires, guildmaster.id, 61]]);
    expect(guildOf(document.world, guild.id).guildmasterId).toBe(succeeded[0]?.payload.successorId);
  });

  test('a Guildmaster who entered mid-game, a successor at 45 on the night of Day 100, retires on the Turn it gives', () => {
    const { deps, eve, guildmaster, retires } = toTheEve('mid-game', firstRival, 45, nightOf(100));
    expect(retires).toBe(17_582);

    const { events } = playTo(eve, retires, deps);

    expect(ofType(events, 'guildmaster.succeeded').map((event) => [event.turn, event.payload.guildmasterId])).toEqual([[retires, guildmaster.id]]);
  });

  test('one past the night retirementTurn gave, as in a save that adopted younger rules, retires on the night retiresOn gives (M9-F6)', () => {
    const { deps, eve, guildmaster, retires } = toTheEve('past-it', firstRival, 45);
    // A year past their Retirement night, on a morning played: they are 62 and still in office.
    const since = structuredClone(eve);
    since.world.turn = retires + 1080 - 2;
    expect(since.world.turn % 3).toBe(0);
    const night = retiresOn(guildmaster, since.world.turn, deps.config);
    expect(night).toBe(since.world.turn + 2);

    const { events } = playTo(since, night, deps);

    expect(ofType(events, 'guildmaster.succeeded').map((event) => [event.turn, event.payload.guildmasterId, event.payload.age])).toEqual([[night, guildmaster.id, 62]]);
  });
});

describe('advance after the ending', () => {
  test('is a no-op with the typed stop: the same document, no events, nothing appended', () => {
    const deps = testDeps();
    const start = created('after', deps);
    const player = thePlayer(start.world);
    wipeRoster(start.world, player);
    player.wealth = 0;
    const { document } = playTo(start, nightOf(0), deps);
    expect(document.world.ended).not.toBeNull();
    const world = structuredClone(document.world);
    const entries = document.history.entries.length;

    for (let call = 0; call < 3; call += 1) {
      expect(advance(document, deps)).toEqual({ document, events: [], stoppedBecause: { kind: 'ended' } });
      expect(advance(document, deps).document).toBe(document);
    }

    expect(document.world).toEqual(world);
    expect(document.history.entries).toHaveLength(entries);
    withValid(document, deps);
  });
});

// ── A Rival's endings ────────────────────────────────────────────────────────────────────────

describe("a Rival's ending folds it (pre-M0 review D6)", () => {
  test('a bankrupt Rival folds without ending the game: its Heroes are Unattached that night, it leaves the Rankings, it acts no more, and a new Rival is founded rivalReplacementDays later', () => {
    const deps = testDeps(
      { rivalCount: 2, bankruptcyGraceDays: 2, rivalReplacementDays: 5 },
      // Out of every Rival's reach, so that none re-signs the released Heroes (a Rival recruits
      // above its Disposition's recruitThreshold of Upkeeps), whose leaving the pool the test
      // watches; and no building (M3-S6), which would spend a new Rival's Wealth before its first
      // Upkeep and, under this test's two Days' grace, fold it too (DL-56).
      withDispositions(thriftyRivals),
    );
    const start = created('fold', deps);
    const player = thePlayer(start.world);
    const rival = firstRival(start.world);
    rival.wealth = deps.config.bankruptcyFloor - 1;
    const roster: HeroId[] = [...rival.rosterIds];
    const foldNight = nightOf(2); // below the floor from the night of Day 0, then two Days' grace

    // Until the fold the Rivals' controllers are stilled: from M2-S9 the bankrupt Rival still sends
    // a Party each afternoon, and a fold with Parties in flight is a test of its own, below.
    const stilled = stillRivalControllers();
    const before = playTo(start, nightOf(1), deps);
    expect(guildOf(before.document.world, rival.id).foldedOnTurn).toBeNull();
    const night = playTo(before.document, foldNight, deps);
    const { world } = night.document;
    stilled.mockRestore();

    // The game goes on.
    expect(world.ended).toBeNull();
    expect(night.stoppedBecause).toBeNull();
    expect(ofType(night.events, 'game.ended')).toEqual([]);
    // The Rival folded, for Bankruptcy, with a Milestone.
    const folded = guildOf(world, rival.id);
    expect(folded).toMatchObject({ foldedOnTurn: foldNight, rosterIds: [] });
    expect(ofType(night.events, 'guild.folded')).toEqual([
      expect.objectContaining({
        turn: foldNight,
        milestone: true,
        participants: [rival.id, rival.guildmasterId],
        payload: { guildId: rival.id, reason: 'bankruptcy' },
      }),
    ]);
    // Its Heroes are Unattached the same night, each with hero.left-guild.
    const left = ofType(night.events, 'hero.left-guild');
    expect(left.map((event) => [event.turn, event.milestone, event.payload])).toEqual(
      roster.map((heroId) => [foldNight, false, { heroId, guildId: rival.id }]),
    );
    for (const heroId of roster) {
      expect(world.heroes[heroId]).toMatchObject({ guildId: null, unattachedSince: foldNight, partyId: null });
    }
    expect(unattachedHeroes(world).map((hero) => hero.id)).toEqual(expect.arrayContaining(roster));
    // Its Guildmaster keeps their row, still naming it.
    expect(world.guildmasters[rival.guildmasterId]?.guildId).toBe(rival.id);
    // It is absent from the Rankings, and every other Guild is in them.
    for (const by of ['fame', 'wealth'] as const) {
      const ranked = rankings(world, by).map((ranking) => ranking.guildId);
      expect(ranked).not.toContain(rival.id);
      expect(new Set(ranked)).toEqual(new Set(Object.keys(world.guilds).filter((id) => id !== rival.id)));
    }

    // It acts no more, the Rivals' controllers running again: no event names it and no rule
    // touches its row.
    const replacementNight = nightOf(2 + deps.config.rivalReplacementDays);
    const waiting = playTo(night.document, replacementNight - 3, deps);
    expect(ofType(waiting.events, 'guild.founded')).toEqual([]);

    // rivalReplacementDays after the fold, a new Rival is founded in its place.
    const replaced = playTo(waiting.document, replacementNight, deps);
    const founded = ofType(replaced.events, 'guild.founded');
    expect(founded).toHaveLength(1);
    const newcomerId = founded[0]?.payload.guildId ?? ('' as GuildId);
    const newcomer = guildOf(replaced.document.world, newcomerId);
    expect(founded[0]).toMatchObject({ turn: replacementNight, milestone: true });
    // Its founding names its founding Wealth, drawn as a founding Rival's is (M9-F7, DL-120 item 4).
    expect(founded[0]?.payload.wealth).toBe(newcomer.wealth);
    expect(newcomer.wealth).toBeGreaterThanOrEqual(deps.config.rivalStartingWealthMin);
    expect(newcomer.wealth).toBeLessThanOrEqual(deps.config.rivalStartingWealthMax);
    // It takes the controller of the Rival it replaces, so the world keeps every Disposition it was
    // dealt (M6-S1, DL-56): here the first Rival's, `ambitious`, dealt first in key order.
    expect(newcomer).toMatchObject({
      foundedTurn: replacementNight,
      foldedOnTurn: null,
      controller: { kind: 'rival', disposition: 'ambitious' },
    });
    expect(newcomer.controller).toEqual(rival.controller);
    const inPlay = (world: typeof start.world) =>
      Object.values(world.guilds)
        .filter((guild) => guild.foldedOnTurn === null)
        .map((guild) => dispositionOf(guild))
        .sort();
    expect(inPlay(replaced.document.world)).toEqual(inPlay(start.world));
    expect(newcomer.name).not.toBe(folded.name);
    expect(newcomer.rosterIds.length).toBeGreaterThanOrEqual(deps.config.rivalRosterMin);
    expect(newcomer.rosterIds.length).toBeLessThanOrEqual(deps.config.rivalRosterMax);
    const rivalsInPlay = rankings(replaced.document.world, 'fame').filter((ranking) => ranking.guildId !== player.id);
    expect(rivalsInPlay).toHaveLength(deps.config.rivalCount);

    // Past an Upkeep Day (Day 9) and the night the released Heroes leave the pool (Day 12).
    const beyond = playTo(replaced.document, nightOf(12), deps);
    const afterwards = [...waiting.events, ...replaced.events, ...beyond.events];
    expect(afterwards.filter((event) => event.participants.includes(rival.id))).toEqual([]);
    expect(ofType(afterwards, 'quest.taken').length).toBeGreaterThan(0); // the other Rivals did act
    expect(guildOf(beyond.document.world, rival.id)).toEqual(folded);
    const paid = ofType(beyond.events, 'guild.upkeep-paid').map((event) => event.payload.guildId);
    expect(new Set(paid)).toEqual(new Set(rankings(beyond.document.world, 'fame').map((ranking) => ranking.guildId)));
    expect(ofType(beyond.events, 'guild.founded')).toEqual([]);
    // A released Hero leaves the pool like any other, and hero.left-guild keeps their row (DL-27).
    for (const heroId of roster) {
      expect(beyond.document.world.heroes[heroId]).toMatchObject({ unattachedSince: null, leftPoolOnTurn: nightOf(12) });
    }
  });

  test.each(foldReasons)('%s arranged on a Rival folds it and the game goes on', (reason) => {
    const deps = testDeps({ rivalCount: 1, bankruptcyGraceDays: 0 });
    // The Rival's controller is stilled: from M2-S9 it signs a Hero in the afternoon, onto the
    // Roster recorded here at Turn 0.
    stillRivalControllers();
    const start = created(`rival-${reason}`, deps);
    const rival = firstRival(start.world);
    const roster = [...rival.rosterIds];
    arrange[reason](start.world, rival, deps);

    const { document, events } = playTo(start, nightOf(0), deps);

    expect(document.world.ended).toBeNull();
    expect(guildOf(document.world, rival.id).foldedOnTurn).toBe(nightOf(0));
    expect(ofType(events, 'guild.folded').map((event) => event.payload)).toEqual([{ guildId: rival.id, reason }]);
    const released = reason === 'roster-wiped' ? [] : roster;
    expect(ofType(events, 'hero.left-guild').map((event) => event.payload.heroId)).toEqual(released);
  });

  test("a folded Rival's Party in flight is disbanded: its Quest is abandoned unresolved and its Heroes are in the pool that night", () => {
    const deps = testDeps({ rivalCount: 1, bankruptcyGraceDays: 0 });
    // The Rival's controller is stilled: from M2-S9 it sends a Party of its own in the afternoon,
    // which the fold would disband beside the one made here.
    stillRivalControllers();
    const start = created('party', deps);
    const { world } = start;
    const rival = firstRival(world);
    arrange.bankruptcy(world, rival, deps);
    // A Party away on a taken Quest, as dispatch (M2-S4) leaves one, made by hand here.
    const patronId = Object.keys(world.patrons)[0] as keyof World['patrons'];
    const questId = takeId(world, 'quests');
    const partyId = takeId(world, 'parties');
    const members = rival.rosterIds.slice(0, 2);
    world.quests[questId] = {
      id: questId,
      templateKey: 'clear-the-barrow',
      patronId,
      difficulty: 30,
      tags: [],
      reward: 120,
      fameEffect: 2,
      durationTurns: 9,
      demands: [['strength', 1]],
      skillKeys: [],
      encounterKeys: [],
      requirements: { partySizeMin: 1, partySizeMax: 3 },
      lootTableKey: null,
      status: 'taken',
      offeredOnTurn: 0,
      expiresOnTurn: nightOf(3),
      partyIds: [partyId],
    };
    world.parties[partyId] = {
      id: partyId,
      questId,
      guildId: rival.id,
      heroIds: members,
      departedOnTurn: 0,
      returnsOnTurn: nightOf(3),
    };
    for (const heroId of members) {
      const hero = world.heroes[heroId];
      if (hero !== undefined) hero.partyId = partyId;
    }
    withValid(start, deps);

    const { document, events } = playTo(start, nightOf(0), deps);

    expect(document.world.parties).not.toHaveProperty(partyId);
    expect(document.world.quests).not.toHaveProperty(questId);
    for (const heroId of members) {
      expect(document.world.heroes[heroId]).toMatchObject({ partyId: null, guildId: null, unattachedSince: nightOf(0) });
    }
    const [fold] = ofType(events, 'guild.folded');
    expect(fold?.participants).toEqual([rival.id, rival.guildmasterId, partyId, questId]);
    // The Quest's History ends with the fold, and the Party's.
    expect(entriesFor(document.history, questId)[0]?.type).toBe('guild.folded');
    expect(entriesFor(document.history, partyId)[0]?.type).toBe('guild.folded');
  });

  test("a fold draws from no stream, and a replacement from generation alone, its Guildmaster's descriptions from descriptions", () => {
    for (const rivalReplacementDays of [5, 0]) {
      const deps = testDeps({ rivalCount: 1, rivalReplacementDays });
      const document = created('streams', deps);
      const world = structuredClone(document.world);
      // Every planned stream, so that each can be seen to stand still.
      Object.assign(world.rng, createStreams(document.meta.seed, plannedStreams), structuredClone(world.rng));
      world.turn = nightOf(0);
      arrange['roster-wiped'](world, firstRival(world), deps);
      const before = structuredClone(world.rng) as Record<string, unknown>;

      const events = endings(world, phaseContext(world, deps, document.history));

      expect(ofType(events, 'guild.folded')).toHaveLength(1);
      expect(ofType(events, 'guild.founded')).toHaveLength(rivalReplacementDays === 0 ? 1 : 0);
      const rng = world.rng as Record<string, unknown>;
      for (const name of plannedStreams) {
        // A Guildmaster entering play is described on a stream of its own (v1.1.2-S5).
        const moved = (name === 'generation' || name === 'descriptions') && rivalReplacementDays === 0;
        if (moved) expect(rng[name], name).not.toEqual(before[name]);
        else expect(rng[name], name).toEqual(before[name]);
      }
    }
  });
});

// ── Succession (M9-S2, DL-83 item 19, DL-100 item 3) ────────────────────────────────────────

describe("a Rival's Guildmaster's Retirement is met by Succession", () => {
  /** A world whose first Rival's Guildmaster retires on the first night, the Rivals stilled. */
  function retiring(seed: string, deps: EngineDeps) {
    stillRivalControllers();
    const start = created(seed, deps);
    const rival = firstRival(start.world);
    const retiree = start.world.guildmasters[rival.guildmasterId];
    if (retiree === undefined) throw new Error('No Guildmaster');
    arrange.retirement(start.world, rival, deps);
    return { start, rival, retiree: structuredClone(retiree), before: structuredClone(rival) };
  }

  test('on the first night the Guildmaster is guildmasterRetirementAge, a successor takes over and the Guild carries on with its Roster, Wealth, Fame, Hall and Items', () => {
    const deps = testDeps({ rivalCount: 2 });
    const { start, rival, retiree, before } = retiring('succession', deps);
    const heldBefore = holdings(start.world, { kind: 'guild', id: rival.id });

    const { document, events } = playTo(start, nightOf(0), deps);
    const { world } = document;
    const guild = guildOf(world, rival.id);
    const successor = world.guildmasters[guild.guildmasterId];
    if (successor === undefined) throw new Error('No successor');

    expect(world.ended).toBeNull();
    expect(guild).toEqual({ ...before, guildmasterId: successor.id });
    expect(holdings(world, { kind: 'guild', id: rival.id })).toEqual(heldBefore);
    expect(world.guildmasters[retiree.id]).toEqual({ ...retiree, retiredOnTurn: nightOf(0) });
    expect(successor.id).not.toBe(retiree.id);
    expect(successor).toMatchObject({
      guildId: rival.id,
      enteredTurn: nightOf(0),
      retiredOnTurn: null,
      regard: {},
    });
    // Described as they enter play (v1.1.2-S5, DL-125 item 6).
    for (const text of [successor.birthplace, successor.appearance, successor.biography]) expect(text).not.toBe('');
    expect(successor.ageAtEntry).toBeGreaterThanOrEqual(deps.config.guildmasterStartingAgeMin);
    expect(successor.ageAtEntry).toBeLessThanOrEqual(deps.config.guildmasterStartingAgeMax);
    for (const value of Object.values(successor.stats)) {
      expect(value).toBeGreaterThanOrEqual(deps.config.guildmasterStatMin);
      expect(value).toBeLessThanOrEqual(deps.config.guildmasterStatMax);
    }
    const cost = successor.traits.reduce((sum, key) => sum + (deps.content.traits[key]?.cost ?? Number.NaN), 0);
    expect(cost).toBeLessThanOrEqual(deps.config.guildmasterTraitBudget);

    expect(ofType(events, 'guildmaster.succeeded')).toEqual([
      {
        turn: nightOf(0),
        type: 'guildmaster.succeeded',
        participants: [rival.id, retiree.id, successor.id],
        labels: { [rival.id]: rival.name, [retiree.id]: retiree.name, [successor.id]: successor.name },
        milestone: true,
        payload: { guildId: rival.id, guildmasterId: retiree.id, successorId: successor.id, age: 61 },
      },
    ]);
    expect(ofType(events, 'guild.folded')).toEqual([]);
    expect(ofType(events, 'hero.left-guild')).toEqual([]);
    // The retired Guildmaster's History ends with it, and the successor's begins with it.
    expect(entriesFor(document.history, retiree.id)[0]?.type).toBe('guildmaster.succeeded');
    expect(entriesFor(document.history, successor.id).map((entry) => entry.type)).toEqual(['guildmaster.succeeded']);
  });

  test('the replacement path does not run: no Rival is founded rivalReplacementDays later, and the Guilds in play hold', () => {
    const deps = testDeps({ rivalCount: 2, rivalReplacementDays: 2 });
    const { start } = retiring('no-replacement', deps);
    const guilds = Object.keys(start.world.guilds).sort();

    const { document, events } = playTo(start, nightOf(3), deps);

    expect(ofType(events, 'guild.founded')).toEqual([]);
    expect(Object.keys(document.world.guilds).sort()).toEqual(guilds);
    expect(Object.values(document.world.guilds).filter((guild) => guild.foldedOnTurn !== null)).toEqual([]);
    expect(ofType(events, 'guildmaster.succeeded')).toHaveLength(1);
  });

  test('Regard others held for the retired Guildmaster stays with them, and the successor holds none', () => {
    const deps = testDeps({ rivalCount: 2 });
    const { start, rival, retiree } = retiring('regard', deps);
    const player = thePlayer(start.world);
    const mine = start.world.guildmasters[player.guildmasterId];
    if (mine === undefined) throw new Error("No player's Guildmaster");
    const held = { value: 10, since: 0, reason: 'guild.transfer' };
    mine.regard[retiree.id] = held;
    const patronId = Object.values(start.world.patrons)[0]?.id;
    if (patronId === undefined) throw new Error('No Patron');
    const theirs = start.world.guildmasters[retiree.id];
    if (theirs !== undefined) theirs.regard[patronId] = { value: -8, since: 0, reason: 'quest.resolved' };

    const { world } = playTo(start, nightOf(0), deps).document;
    const successor = world.guildmasters[guildOf(world, rival.id).guildmasterId];

    expect(world.guildmasters[player.guildmasterId]?.regard[retiree.id]).toEqual(held);
    expect(guildmasterRegardForGuild(world.guildmasters[player.guildmasterId] ?? mine, rival.id, world)).toBe(0);
    expect(world.guildmasters[retiree.id]?.regard[patronId]?.value).toBe(-8);
    expect(successor?.regard).toEqual({});
  });

  test('the successor is drawn from generation alone, and described from descriptions (v1.1.2-S5)', () => {
    const deps = testDeps({ rivalCount: 1 });
    const document = created('succession-streams', deps);
    const world = structuredClone(document.world);
    Object.assign(world.rng, createStreams(document.meta.seed, plannedStreams), structuredClone(world.rng));
    world.turn = nightOf(0);
    arrange.retirement(world, firstRival(world), deps);
    const before = structuredClone(world.rng) as Record<string, unknown>;

    const events = endings(world, phaseContext(world, deps, document.history));

    expect(ofType(events, 'guildmaster.succeeded')).toHaveLength(1);
    const rng = world.rng as Record<string, unknown>;
    for (const name of plannedStreams) {
      if (name === 'generation' || name === 'descriptions') expect(rng[name], name).not.toEqual(before[name]);
      else expect(rng[name], name).toEqual(before[name]);
    }
  });

  test("the successor's name is none in use: not a Guildmaster's in office, nor a Hero's in play", () => {
    // Two names in all, so a successor must take the one not in use, and cannot be named when both are.
    const names = { ...testContent.names, given: { female: ['Ada'], male: ['Ada'] }, family: ['Vell', 'Hale'] };
    const deps = testDeps({ rivalCount: 1, unattachedPoolSize: 0, startingRosterSize: 0 }, { ...testContent, names });
    const other = (name: string) => (name === 'Ada Vell' ? 'Ada Hale' : 'Ada Vell');

    for (const seed of ['names-1', 'names-2', 'names-3', 'names-4']) {
      const document = created(seed, deps);
      const { world } = document;
      world.turn = nightOf(0);
      const rival = firstRival(world);
      // No Hero on the Rival's Roster shares either name, so only the retiring Guildmaster is in use.
      for (const heroId of Object.keys(world.heroes)) world.heroes[heroId as HeroId] = { ...world.heroes[heroId as HeroId]!, name: `Hero ${heroId}` };
      const retiree = world.guildmasters[rival.guildmasterId];
      if (retiree === undefined) throw new Error('No Guildmaster');
      arrange.retirement(world, rival, deps);

      const events = endings(world, phaseContext(world, deps, document.history));

      const successor = world.guildmasters[guildOf(world, rival.id).guildmasterId];
      expect(ofType(events, 'guildmaster.succeeded')).toHaveLength(1);
      expect(successor?.name).toBe(other(retiree.name));
    }

    // A living Hero on a Roster holds the other name: every name is in use, and the draw throws.
    const document = created('names-taken', deps);
    const { world } = document;
    world.turn = nightOf(0);
    const rival = firstRival(world);
    const retiree = world.guildmasters[rival.guildmasterId];
    const heroId = rival.rosterIds[0];
    if (retiree === undefined || heroId === undefined) throw new Error('No Guildmaster or Hero');
    for (const id of Object.keys(world.heroes)) world.heroes[id as HeroId] = { ...world.heroes[id as HeroId]!, name: `Hero ${id}` };
    world.heroes[heroId] = { ...world.heroes[heroId]!, name: other(retiree.name) };
    arrange.retirement(world, rival, deps);
    expect(() => endings(structuredClone(world), phaseContext(world, deps, document.history))).toThrow(/already in use/);

    // Once that Hero has died, their name is free again.
    world.heroes[heroId] = { ...world.heroes[heroId]!, diedOnTurn: 0 };
    endings(world, phaseContext(world, deps, document.history));
    expect(world.guildmasters[guildOf(world, rival.id).guildmasterId]?.name).toBe(other(retiree.name));
  });

  test("a Rival whose Guildmaster retires on the night it goes bankrupt is succeeded, then folds that night with its successor", () => {
    const deps = testDeps({ rivalCount: 1, bankruptcyGraceDays: 0 });
    const { start, rival } = retiring('succeeded-then-folded', deps);
    arrange.bankruptcy(start.world, rival, deps);

    const { document, events } = playTo(start, nightOf(0), deps);

    const [succeeded] = ofType(events, 'guildmaster.succeeded');
    const [folded] = ofType(events, 'guild.folded');
    expect(folded?.payload).toEqual({ guildId: rival.id, reason: 'bankruptcy' });
    expect(folded?.participants.slice(0, 2)).toEqual([rival.id, succeeded?.payload.successorId]);
    expect(guildOf(document.world, rival.id)).toMatchObject({ foldedOnTurn: nightOf(0), guildmasterId: succeeded?.payload.successorId });
  });

  test("the player's Guildmaster is never succeeded: their Retirement ends the game", () => {
    const deps = testDeps({ rivalCount: 1 });
    const start = created('player-retires', deps);
    const player = thePlayer(start.world);
    arrange.retirement(start.world, player, deps);

    const { document, events } = playTo(start, nightOf(0), deps);

    expect(document.world.ended).toEqual({ turn: nightOf(0), reason: 'retirement' });
    expect(ofType(events, 'guildmaster.succeeded')).toEqual([]);
    expect(guildOf(document.world, player.id).guildmasterId).toBe(player.guildmasterId);
    expect(document.world.guildmasters[player.guildmasterId]?.retiredOnTurn).toBeNull();
  });
});

// ── The fold's one order (M5, DL-54) ─────────────────────────────────────────────────────────

describe("a fold's one order (DL-54)", () => {
  /** What a test reads of a fold's event: its type and the Hero, Item, stack or Guild it concerns. */
  const told = (event: TurnEvent): string[] => {
    switch (event.type) {
      case 'item.returned':
        return [event.type, event.payload.heroId, event.payload.itemId ?? event.payload.stackId ?? ''];
      case 'item.sold':
        return [event.type, event.payload.cause, ...event.payload.itemIds];
      case 'hero.left-guild':
        return [event.type, event.payload.heroId];
      case 'guild.folded':
        return [event.type, ...event.participants];
      default:
        return [event.type];
    }
  };
  const foldTypes: ReadonlySet<string> = new Set(['item.returned', 'item.sold', 'hero.left-guild', 'guild.folded']);

  test("Parties home, the Roster's gear back, unique Items sold, stacks discarded, Heroes released, then guild.folded", () => {
    // One Rival; an empty Market, so that whatever it lists the fold put there; the prices pinned.
    const deps = testDeps({
      rivalCount: 1,
      marketSize: 0,
      sellRatio: 0.5,
      lootOnlyPrice: 600,
      gearSlots: ['weapon', 'armour', 'trinket'],
      bankruptcyGraceDays: 0,
    });
    stillRivalControllers();
    const start = created('one-order', deps);
    const { world } = start;
    const rival = firstRival(world);
    arrange.bankruptcy(world, rival, deps); // it folds on the first night
    const vault: Holder = { kind: 'guild', id: rival.id };

    // In its holding: two unique Items, and stacks, some of which a Party carries away.
    const lantern = createItem(world, 'lantern-of-stannary', vault);
    const mantle = createItem(world, 'mantle-of-the-fells', vault);
    addStack(world, 'whetstone', 3, vault);
    addStack(world, 'healing-draught', 3, vault);
    // A Party in flight, its first member wearing a unique Item and common gear.
    const staffing = (questId: QuestId) => {
      const quest = world.quests[questId];
      const heroIds = quest === undefined ? null : partyFor(quest, availableHeroes(world, rival), deps.content);
      return quest === undefined || heroIds === null ? [] : [{ quest, heroIds }];
    };
    const [staffed] = world.board.flatMap(staffing);
    if (staffed === undefined) throw new Error('The Rival can staff no Quest');
    const { quest, heroIds } = staffed;
    const [wearer] = heroIds as [HeroId];
    const blade = createItem(world, 'barrow-kings-blade', { kind: 'hero', id: wearer, slot: 'weapon' });
    const shirt = addStack(world, 'mail-shirt', 1, { kind: 'hero', id: wearer, slot: 'armour' });
    const consumables = [
      { definitionKey: 'healing-draught', quantity: 2 },
      { definitionKey: 'whetstone', quantity: 1 },
    ];
    const sent = dispatch(start, { guildId: rival.id, questId: quest.id, heroIds, consumables }, deps);
    if (!sent.ok) throw new Error(`Refused: ${sent.rejection.reason}`);
    const eve = withValid(sent.document, deps);
    const party = Object.values(eve.world.parties).find((it) => it.guildId === rival.id);
    if (party === undefined) throw new Error('No Party');
    expect(party.returnsOnTurn).toBeGreaterThan(nightOf(0)); // still away on the night it folds
    expect(holdings(eve.world, { kind: 'party', id: party.id }).stacks).toHaveLength(2);
    const roster = [...guildOf(eve.world, rival.id).rosterIds];
    const uniques = [lantern, mantle, blade]; // in id order, as made

    // playTo holds the document to the validator.
    const { document, events } = playTo(eve, nightOf(0), deps);
    const after = document.world;

    // The fold's events, in its order, and the night's last.
    const expected = [
      ['item.returned', wearer, blade],
      ['item.returned', wearer, shirt],
      ...uniques.map((itemId) => ['item.sold', 'fold', itemId]),
      ...roster.map((heroId) => ['hero.left-guild', heroId]),
      ['guild.folded', rival.id, rival.guildmasterId, party.id, quest.id],
    ];
    expect(events.filter((event) => foldTypes.has(event.type)).map(told)).toEqual(expected);
    expect(events.slice(-expected.length).map(told)).toEqual(expected);
    expect(guildOf(after, rival.id)).toMatchObject({ foldedOnTurn: nightOf(0), rosterIds: [] });

    // Every unique Item is on the Market exactly once, sold at sell price to the folded Guild's
    // credit; the Market lists nothing else.
    expect(holdings(after, marketHolder)).toEqual({ items: uniques.map((itemId) => after.items[itemId]), stacks: [] });
    const sold = ofType(events, 'item.sold');
    expect(sold.flatMap((event) => event.payload.itemIds)).toEqual(uniques);
    for (const event of sold) {
      expect(event.payload).toMatchObject({ guildId: rival.id, quantity: 1, unitPrice: sellPrice(event.payload.definitionKey, deps) });
    }

    // Nothing is left with the Guild, a Party of its own, or a Hero who was on its Roster: the Party
    // and its Quest are gone, and what it carried went home and was discarded with the Guild's stacks.
    expect(after.parties).not.toHaveProperty(party.id);
    expect(after.quests).not.toHaveProperty(quest.id);
    const ours = (holder: Holder): boolean =>
      (holder.kind === 'guild' && holder.id === rival.id) ||
      (holder.kind === 'party' && (holder.id === party.id || after.parties[holder.id]?.guildId === rival.id)) ||
      (holder.kind === 'hero' && (roster.includes(holder.id) || after.heroes[holder.id]?.guildId === rival.id));
    expect([...Object.values(after.items), ...Object.values(after.stacks)].filter((row) => ours(row.holder))).toEqual([]);
    for (const heroId of roster) {
      expect(after.heroes[heroId]).toMatchObject({ guildId: null, partyId: null, unattachedSince: nightOf(0) });
    }
  });
});
