import { afterEach, describe, expect, test, vi } from 'vitest';
import { advance } from '../advance.js';
import type { EngineDeps } from '../config.js';
import type { ContentSet, PortraitAppearance } from '../content-types.js';
import { bestParties, partyPool } from '../best-party.js';
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
import type { TurnEvent } from '../events.js';
import { count, entriesFor } from '../history.js';
import { addStack, createItem, holdings } from '../items.js';
import { marketHolder } from '../market.js';
import { phases } from '../pipeline.js';
import { createStreams } from '../rng.js';
import { dispositionOf, playerGuild, rankings, signingFee, signingRefusal, unattachedHeroes } from '../selectors.js';
import { nightOf, retirementTurn, retiresOn } from '../time.js';
import { guildmasterRegardForGuild } from '../regard.js';
import { ofType, plannedStreams, playWith, streamsOutOfPlace, testContent, testDeps, thriftyRivals, withCaptaincy, withDispositions, withValid } from '../world.test-support.js';
import { ageSpanOf, portraitSexOf } from '../portraits.js';
import { endings } from './endings.js';
import { phaseContext } from './phase.js';
import { applyAction } from '../actions/action.js';

/** Advances to a Turn, validating the document it stops at, or until the game ends. */
const playTo = playWith(advance, { validate: 'last', stopAtEnd: true });

// The endings (DL-28). Each ending is arranged on a world `createWorld` made, then played
// through `advance`; every document a test inspects is held to the validator.

const setup = { guildmasterName: 'Aldith Barrowby', guildName: 'The Salt Road Guild', createdAt: 'test' };

afterEach(() => {
  vi.restoreAllMocks();
});

/**
 * Stills every Rival's controller until the returned spy is restored. Each Rival
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
    if (hero !== undefined) Object.assign(hero, { diedOnTurn: world.turn, contract: null });
  }
  guild.rosterIds = [];
}

/** The cheapest fee in the pool at the price `guild` pays: its Guildmaster's Negotiation applied. */
function cheapestFee(world: World, deps: EngineDeps, guild: Guild): number {
  const buyer = world.guildmasters[guild.guildmasterId];
  return Math.min(...unattachedHeroes(world).map((hero) => signingFee(hero, deps, buyer)));
}

const reasons = ['retirement', 'bankruptcy', 'roster-wiped'] as const satisfies readonly EndingReason[];

/** The endings that fold a Rival: a Rival's Guildmaster's Retirement is met by Succession. */
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
  test('Retirement: on the first night the Guildmaster is guildmasterRetirementAge (DL-113)', () => {
    const deps = testDeps({ turnsPerYear: 30 }); // ten Days a year, so that a birthday comes soon
    const start = created('retirement', deps);
    const player = thePlayer(start.world);
    const guildmaster = start.world.guildmasters[player.guildmasterId];
    if (guildmaster === undefined) throw new Error('No Guildmaster');
    guildmaster.ageAtEntry = deps.config.guildmasterRetirementAge - 1;

    // One year short of the age until Turn 30, the morning of Day 10; the check is at night.
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

  test('Bankruptcy: once Wealth has stayed below the floor for bankruptcyGraceDays', () => {
    const deps = testDeps({ bankruptcyGraceDays: 3 });
    const start = created('bankruptcy', deps);
    const player = thePlayer(start.world);
    player.wealth = deps.config.bankruptcyFloor - 1;

    // Below the floor from the night of Day 0 (the Guild State Engine); three Days on, it ends.
    const before = playTo(start, nightOf(2), deps);
    expect(guildOf(before.document.world, player.id).belowFloorSince).toBe(nightOf(0));
    expect(before.document.world.ended).toBeNull();
    const { document, events, stoppedBecause } = playTo(before.document, nightOf(3), deps);

    expect(document.world.ended).toEqual({ turn: nightOf(3), reason: 'bankruptcy' });
    expect(ofType(events, 'game.ended')).toEqual([
      expect.objectContaining({ turn: nightOf(3), milestone: true, payload: { guildId: player.id, reason: 'bankruptcy' } }),
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
    // No Rivals: a Rival signs the cheapest Hero in the afternoon, and the player's
    // Wealth, the fee of the cheapest at Turn 0, no longer covers the cheapest left by night.
    const deps = testDeps({ rivalCount: 0 });
    const start = created('not-wiped', deps);
    const player = thePlayer(start.world);
    wipeRoster(start.world, player);
    player.wealth = cheapestFee(start.world, deps, player);

    const { document } = playTo(start, nightOf(1), deps);

    expect(document.world.ended).toBeNull();
  });

  test('an empty Roster whose Wealth reaches only Heroes who refuse its Fame is waiting, not wiped (DL-38)', () => {
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

// DL-113 items 4 and 5: every Guildmaster 21 to 50 at the start and retiring at 61, on the
// Turn `retirementTurn` gives, which the endings read. The year is the default's 1,080 Turns: the
// world is moved to the night before, and the Rivals stilled.
describe('Retirement at 61, on the Turn retirementTurn gives', () => {
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

  test('one past the night retirementTurn gave, as in a save that adopted younger rules, retires on the night retiresOn gives', () => {
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
      // watches; and no building, which would spend a new Rival's Wealth before its first
      // Upkeep and, under this test's two Days' grace, fold it too (DL-56).
      withDispositions(thriftyRivals),
    );
    const start = created('fold', deps);
    const player = thePlayer(start.world);
    const rival = firstRival(start.world);
    rival.wealth = deps.config.bankruptcyFloor - 1;
    const roster: HeroId[] = [...rival.rosterIds];
    const foldNight = nightOf(2); // below the floor from the night of Day 0, then two Days' grace

    // Until the fold the Rivals' controllers are stilled: the bankrupt Rival still sends
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
    // Its founding names its founding Wealth, drawn as a founding Rival's is (DL-120 item 4).
    expect(founded[0]?.payload.wealth).toBe(newcomer.wealth);
    expect(newcomer.wealth).toBeGreaterThanOrEqual(deps.config.rivalStartingWealthMin);
    expect(newcomer.wealth).toBeLessThanOrEqual(deps.config.rivalStartingWealthMax);
    // Its Hall's own base upkeep is the config's at its founding, as every Guild's is (DL-298).
    expect(newcomer.hallBaseUpkeep).toBe(deps.config.hallBaseUpkeep);
    // It takes the controller of the Rival it replaces, so the world keeps every Disposition it was
    // dealt (DL-56): here the first Rival's, `ambitious`, dealt first in key order.
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

    // Past a wages Day (Day 9) and the night the released Heroes leave the pool (Day 12).
    const beyond = playTo(replaced.document, nightOf(12), deps);
    const afterwards = [...waiting.events, ...replaced.events, ...beyond.events];
    expect(afterwards.filter((event) => event.participants.includes(rival.id))).toEqual([]);
    expect(ofType(afterwards, 'quest.taken').length).toBeGreaterThan(0); // the other Rivals did act
    expect(guildOf(beyond.document.world, rival.id)).toEqual(folded);
    const paid = ofType(beyond.events, 'guild.wages-paid').map((event) => event.payload.guildId);
    expect(new Set(paid)).toEqual(new Set(rankings(beyond.document.world, 'fame').map((ranking) => ranking.guildId)));
    expect(ofType(beyond.events, 'guild.founded')).toEqual([]);
    // A released Hero leaves the pool like any other, and hero.left-guild keeps their row (DL-27).
    // Hired once, dealt onto the Rival's Roster, their History holds it all, their leaving too (DL-211).
    for (const heroId of roster) {
      expect(beyond.document.world.heroes[heroId]).toMatchObject({ unattachedSince: null, leftPoolOnTurn: nightOf(12) });
      const types = entriesFor(beyond.document.history, heroId).map((entry) => entry.type);
      expect(types[0]).toBe('hero.left-pool');
      expect(types.at(-1)).toBe('hero.generated');
      expect(types).toContain('hero.left-guild');
    }
  });

  test.each(foldReasons)('%s arranged on a Rival folds it and the game goes on', (reason) => {
    const deps = testDeps({ rivalCount: 1, bankruptcyGraceDays: 0 });
    // The Rival's controller is stilled: it signs a Hero in the afternoon, onto the
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
    // The Rival's controller is stilled: it sends a Party of its own in the afternoon,
    // which the fold would disband beside the one made here.
    stillRivalControllers();
    const start = created('party', deps);
    const { world } = start;
    const rival = firstRival(world);
    arrange.bankruptcy(world, rival, deps);
    // A Party away on a taken Quest, as dispatch leaves one, made by hand here.
    const patronId = Object.keys(world.patrons)[0] as keyof World['patrons'];
    const questId = takeId(world, 'quests');
    const partyId = takeId(world, 'parties');
    const members = rival.rosterIds.slice(0, 2);
    world.quests[questId] = {
      id: questId,
      templateKey: 'clear-the-barrow',
      patronId,
      tier: 2,
      difficulty: 30,
      tags: [],
      reward: 120,
      fameEffect: 2,
      durationTurns: 9,
      skillKeys: [],
      encounterKeys: ['hold-the-line'],
      beatLines: ['A combat Beat.'],
      requirements: { partySizeMin: 1 },
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
      fatigueAtDispatch: Object.fromEntries(members.map((id) => [id, 0])),
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

  test("a fold draws from no stream, and a replacement from generation alone, its Guildmaster's Portrait from gm-portraits and descriptions from descriptions", () => {
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
        // A Guildmaster entering play is given a Portrait and described, each on a stream of its own,
        // and so is each Hero of the new Rival's Roster.
        // A replacement's founding Contracts draw on `contracts` (DL-311 item 2, DL-315).
        const own = ['generation', 'gm-portraits', 'descriptions', 'hero-portraits', 'hero-descriptions', 'contracts'];
        const moved = own.includes(name) && rivalReplacementDays === 0;
        if (moved) expect(rng[name], name).not.toEqual(before[name]);
        else expect(rng[name], name).toEqual(before[name]);
      }
    }
  });

  test('a fold leaves its post of Captain empty with its Roster (DL-287)', () => {
    const deps = testDeps({ rivalCount: 1, bankruptcyGraceDays: 0 }, withCaptaincy(withDispositions(thriftyRivals)));
    stillRivalControllers();
    const start = created('fold-captain', deps);
    const rival = firstRival(start.world);
    arrange.bankruptcy(start.world, rival, deps);
    rival.captainId = rival.rosterIds[0] ?? null;
    expect(rival.captainId).not.toBeNull();

    // playTo holds the document to the validator, whose captain-off-roster a Captain left behind fails.
    const { world } = playTo(start, nightOf(0), deps).document;

    expect(guildOf(world, rival.id)).toMatchObject({ foldedOnTurn: nightOf(0), rosterIds: [], captainId: null });
  });
});

// ── Succession (DL-83 item 19, DL-100 item 3) ────────────────────────────────────────

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
    // Described as they enter play (DL-125 item 6).
    for (const text of [successor.birthplace, successor.appearance, successor.biography]) expect(text).not.toBe('');
    expect(successor.ageAtEntry).toBeGreaterThanOrEqual(deps.config.guildmasterStartingAgeMin);
    expect(successor.ageAtEntry).toBeLessThanOrEqual(deps.config.guildmasterStartingAgeMax);
    for (const value of Object.values(successor.stats)) {
      expect(value).toBeGreaterThanOrEqual(deps.config.guildmasterStatMin);
      expect(value).toBeLessThanOrEqual(deps.config.guildmasterStatMax);
    }
    const cost = successor.traits.reduce((sum, key) => sum + (deps.content.guildmasterTraits[key]?.cost ?? Number.NaN), 0);
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

  test('the successor is drawn from generation alone, given a Portrait from gm-portraits, and described from descriptions', () => {
    const deps = testDeps({ rivalCount: 1 });
    const document = created('succession-streams', deps);
    const world = structuredClone(document.world);
    Object.assign(world.rng, createStreams(document.meta.seed, plannedStreams), structuredClone(world.rng));
    world.turn = nightOf(0);
    arrange.retirement(world, firstRival(world), deps);
    const before = structuredClone(world.rng) as Record<string, unknown>;

    const events = endings(world, phaseContext(world, deps, document.history));

    expect(ofType(events, 'guildmaster.succeeded')).toHaveLength(1);
    expect(streamsOutOfPlace(before, world.rng, ['generation', 'gm-portraits', 'descriptions'])).toEqual([]);
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

// ── Every entrant's Portrait (DL-134 item 5, DL-135 items 3 and 4) ────────────────────

describe("every Guildmaster entering play through Succession or a replacement has a Portrait that fits, or the Silhouette", () => {
  /** A Guildmaster picture's row: its ages, and the rest as any Guildmaster's. */
  const row = (apparentAge: [number, number], narrative: string): PortraitAppearance => ({
    apparentAge,
    station: 'common',
    callings: ['soldier'],
    temper: 'stern',
    features: [],
    narrative,
    hooks: [],
  });
  /**
   * The test content with six pictures of each sex, spread over its two bands (young to 35, older
   * from 36), so that some entrants find one free and some find every one that fits in use, now that
   * a retired or folded Guildmaster keeps theirs (DL-144 item 1).
   */
  const pictures: Record<string, PortraitAppearance> = {
    'gm-female-01': row([22, 30], 'A young face.'),
    'gm-female-02': row([38, 50], 'A lined face.'),
    'gm-female-03': row([30, 42], 'A steady face.'),
    'gm-female-04': row([21, 29], 'A bright face.'),
    'gm-female-05': row([40, 52], 'A weathered face.'),
    'gm-female-06': row([26, 34], 'A calm face.'),
    'gm-male-01': row([40, 50], 'A bearded face.'),
    'gm-male-02': row([28, 40], 'A trimmed beard.'),
    'gm-male-03': row([21, 30], 'A young face.'),
    'gm-male-04': row([36, 46], 'A broken nose.'),
    'gm-male-05': row([22, 32], 'A clean-shaven face.'),
    'gm-male-06': row([42, 55], 'A grey beard.'),
  };
  const ofSex = (sex: string) => Object.keys(pictures).filter((key) => key.split('-')[1] === sex);
  const content: ContentSet = {
    ...testContent,
    portraits: {
      ...testContent.portraits,
      guildmaster: { female: ofSex('female'), male: ofSex('male') },
    },
    portraitAppearances: { ...testContent.portraitAppearances, portraits: { ...testContent.portraitAppearances.portraits, ...pictures } },
  };

  /** Whether `key` is a Guildmaster picture of `sex` whose ages reach the band of `age`. */
  const fits = (key: string, sex: string, age: number): boolean => {
    const band = ageSpanOf(content.descriptions.ageBands, age);
    const [from, to] = pictures[key]?.apparentAge ?? [1, 0];
    return portraitSexOf(content, 'guildmaster', key) === sex && from <= band.to && to >= band.from;
  };

  test('forced Successions and folds over twenty nights: each entrant fits, no two living share, retired and folded among them, and a Silhouette only where every fitting picture is held', () => {
    const deps = testDeps({ rivalCount: 4, rivalReplacementDays: 1, bankruptcyGraceDays: 0 }, content);
    stillRivalControllers();
    let document = created('entrants', deps);
    const tally = { successions: 0, replacements: 0, pictured: 0, silhouettes: 0 };

    for (let day = 0; day < 20; day += 1) {
      const inPlay = Object.values(document.world.guilds)
        .filter((guild) => guild.controller.kind === 'rival' && guild.foldedOnTurn === null)
        .sort((a, b) => a.id.localeCompare(b.id));
      // Each night one Rival's Guildmaster retires, and every third night another Rival goes bankrupt.
      const retiring = inPlay[day % inPlay.length];
      if (retiring !== undefined) arrange.retirement(document.world, retiring, deps);
      const failing = inPlay[(day + 1) % inPlay.length];
      if (day % 3 === 0 && failing !== undefined && failing !== retiring) arrange.bankruptcy(document.world, failing, deps);

      const played = playTo(document, nightOf(day) + 1, deps);
      document = played.document;
      tally.successions += ofType(played.events, 'guildmaster.succeeded').length;
      tally.replacements += ofType(played.events, 'guild.founded').length;

      const { world } = document;
      // No Guildmaster's death is recorded, so every one in the world is living, retired, folded or in
      // office, and holds their picture for good (DL-144 item 1).
      const living = Object.values(world.guildmasters);
      const held = living.flatMap((guildmaster) => (guildmaster.portraitKey === null ? [] : [guildmaster.portraitKey]));
      expect(new Set(held).size, `day ${day}: no two living share`).toBe(held.length);

      for (const entrant of Object.values(world.guildmasters).filter((guildmaster) => guildmaster.enteredTurn === nightOf(day))) {
        // What was held as they chose: the picture of every Guildmaster made before them, retired,
        // folded or in office, since ids are given in order.
        const heldThen = new Set(living.filter((other) => other.id < entrant.id).flatMap((other) => other.portraitKey ?? []));
        const fitting = Object.keys(pictures).filter((key) => fits(key, entrant.sex, entrant.ageAtEntry));
        if (entrant.portraitKey === null) {
          tally.silhouettes += 1;
          for (const key of fitting) expect(heldThen.has(key), `day ${day}: ${entrant.id} could have had ${key}`).toBe(true);
        } else {
          tally.pictured += 1;
          expect(fits(entrant.portraitKey, entrant.sex, entrant.ageAtEntry), `day ${day}: ${entrant.id}'s ${entrant.portraitKey}`).toBe(true);
          expect(entrant.appearance).toBe(pictures[entrant.portraitKey]?.narrative);
        }
      }
    }

    expect(tally.successions).toBeGreaterThanOrEqual(15);
    expect(tally.replacements).toBeGreaterThanOrEqual(4);
    expect(tally.pictured).toBeGreaterThan(5);
    expect(tally.silhouettes).toBeGreaterThan(0);
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
      const heroIds = quest === undefined ? null : bestParties(world, rival, deps).party(quest, partyPool(world, rival, deps))?.heroIds ?? null;
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
    const sent = applyAction(start, { kind: 'dispatch', guildId: rival.id, questId: quest.id, heroIds, consumables }, deps);
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

    // Every unique Item is on the Market exactly once, sold at its value (DL-301) to the folded Guild's
    // credit; the Market lists nothing else.
    expect(holdings(after, marketHolder)).toEqual({ items: uniques.map((itemId) => after.items[itemId]), stacks: [] });
    const sold = ofType(events, 'item.sold');
    expect(sold.flatMap((event) => event.payload.itemIds)).toEqual(uniques);
    for (const event of sold) {
      expect(event.payload).toMatchObject({ guildId: rival.id, quantity: 1, unitPrice: deps.content.items[event.payload.definitionKey]?.value });
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
