import { describe, expect, test } from 'vitest';
import { advance, type StopReason } from '../advance.js';
import type { EngineDeps } from '../config.js';
import { createWorld } from '../create.js';
import {
  takeId,
  type EndingReason,
  type Guild,
  type GuildId,
  type HeroId,
  type World,
  type WorldDocument,
} from '../document.js';
import type { EngineEvent } from '../events.js';
import { count, entriesFor } from '../history.js';
import { createStreams } from '../rng.js';
import { playerGuild, rankings, signingFee, unattachedHeroes } from '../selectors.js';
import { nightOf } from '../time.js';
import { plannedStreams, testDeps, withValid } from '../world.test-support.js';
import { endings } from './endings.js';
import { phaseContext } from './phase.js';

// M2-S10: the endings (DL-28). Each ending is arranged on a world `createWorld` made, then played
// through `advance`; every document a test inspects is held to the validator.

const setup = { guildmasterName: 'Aldith Barrowby', guildName: 'The Salt Road Guild', createdAt: 'test' };

function created(seed: string, deps: EngineDeps): WorldDocument {
  return createWorld(seed, setup, deps).document;
}

interface Played {
  document: WorldDocument;
  /** Every event of every Turn played. */
  events: EngineEvent[];
  /** What the last Turn played reported. */
  stoppedBecause: StopReason | null;
}

/** Advances `document` to Turn `turn`, or until the game ends. */
function playTo(document: WorldDocument, turn: number, deps: EngineDeps): Played {
  let current = document;
  let stoppedBecause: StopReason | null = null;
  const events: EngineEvent[] = [];
  while (current.world.turn < turn && current.world.ended === null) {
    const result = advance(current, deps);
    current = result.document;
    stoppedBecause = result.stoppedBecause;
    events.push(...result.events);
  }
  return { document: withValid(current, deps), events, stoppedBecause };
}

const ofType = <Type extends EngineEvent['type']>(events: EngineEvent[], type: Type) =>
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

function cheapestFee(world: World, deps: EngineDeps): number {
  return Math.min(...unattachedHeroes(world).map((hero) => signingFee(hero, deps)));
}

const reasons = ['retirement', 'bankruptcy', 'roster-wiped'] as const satisfies readonly EndingReason[];

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
  test('Retirement: on the first night the Guildmaster is guildmasterRetirementAge, 65 by default', () => {
    const deps = testDeps({ turnsPerYear: 30 }); // ten Days a year, so that a birthday comes soon
    expect(deps.config.guildmasterRetirementAge).toBe(65);
    const start = created('retirement', deps);
    const player = thePlayer(start.world);
    const guildmaster = start.world.guildmasters[player.guildmasterId];
    if (guildmaster === undefined) throw new Error('No Guildmaster');
    guildmaster.ageAtEntry = 64;

    // 64 until Turn 30, the morning of Day 10; the check is at night.
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
    player.wealth = cheapestFee(start.world, deps) - 1;

    const { document, events, stoppedBecause } = playTo(start, nightOf(0), deps);

    expect(document.world.ended).toEqual({ turn: nightOf(0), reason: 'roster-wiped' });
    expect(ofType(events, 'game.ended')).toEqual([
      expect.objectContaining({ turn: nightOf(0), milestone: true, payload: { guildId: player.id, reason: 'roster-wiped' } }),
    ]);
    expect(stoppedBecause).toEqual({ kind: 'ended' });
  });

  test('an empty Roster with Wealth for the cheapest Hero in the pool is not wiped', () => {
    const deps = testDeps();
    const start = created('not-wiped', deps);
    const player = thePlayer(start.world);
    wipeRoster(start.world, player);
    player.wealth = cheapestFee(start.world, deps);

    const { document } = playTo(start, nightOf(1), deps);

    expect(document.world.ended).toBeNull();
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

    const reasonsOf = (events: EngineEvent[]) => ofType(events, 'game.ended').map((event) => event.payload.reason);
    expect(reasonsOf(endings(world, phaseContext(world, deps)))).toEqual(['retirement']);
    expect(reasonsOf(endings(withoutRetirement, phaseContext(withoutRetirement, deps)))).toEqual(['bankruptcy']);
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
    const deps = testDeps({ rivalCount: 2, bankruptcyGraceDays: 2, rivalReplacementDays: 5 });
    const start = created('fold', deps);
    const player = thePlayer(start.world);
    const rival = firstRival(start.world);
    rival.wealth = deps.config.bankruptcyFloor - 1;
    const roster: HeroId[] = [...rival.rosterIds];
    const foldNight = nightOf(2); // below the floor from the night of Day 0, then two Days' grace

    const before = playTo(start, nightOf(1), deps);
    expect(guildOf(before.document.world, rival.id).foldedOnTurn).toBeNull();
    const night = playTo(before.document, foldNight, deps);
    const { world } = night.document;

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

    // It acts no more: no event names it and no rule touches its row.
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
    expect(newcomer).toMatchObject({
      foundedTurn: replacementNight,
      foldedOnTurn: null,
      controller: { kind: 'rival', disposition: 'steady' },
    });
    expect(newcomer.name).not.toBe(folded.name);
    expect(newcomer.rosterIds.length).toBeGreaterThanOrEqual(deps.config.rivalRosterMin);
    expect(newcomer.rosterIds.length).toBeLessThanOrEqual(deps.config.rivalRosterMax);
    const rivalsInPlay = rankings(replaced.document.world, 'fame').filter((ranking) => ranking.guildId !== player.id);
    expect(rivalsInPlay).toHaveLength(deps.config.rivalCount);

    // Past an Upkeep Day (Day 9) and the night the released Heroes leave the pool (Day 12).
    const beyond = playTo(replaced.document, nightOf(12), deps);
    const afterwards = [...waiting.events, ...replaced.events, ...beyond.events];
    expect(afterwards.filter((event) => event.participants.includes(rival.id))).toEqual([]);
    expect(guildOf(beyond.document.world, rival.id)).toEqual(folded);
    const paid = ofType(beyond.events, 'guild.upkeep-paid').map((event) => event.payload.guildId);
    expect(new Set(paid)).toEqual(new Set(rankings(beyond.document.world, 'fame').map((ranking) => ranking.guildId)));
    expect(ofType(beyond.events, 'guild.founded')).toEqual([]);
    // A released Hero leaves the pool like any other, and hero.left-guild keeps their row (DL-27).
    for (const heroId of roster) {
      expect(beyond.document.world.heroes[heroId]).toMatchObject({ unattachedSince: null, leftPoolOnTurn: nightOf(12) });
    }
  });

  test.each(reasons)('%s arranged on a Rival folds it and the game goes on', (reason) => {
    const deps = testDeps({ rivalCount: 1, bankruptcyGraceDays: 0 });
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
    const deps = testDeps({ rivalCount: 1 });
    const start = created('party', deps);
    const { world } = start;
    const rival = firstRival(world);
    arrange.retirement(world, rival, deps);
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

  test('a fold draws from no stream, and a replacement from generation alone', () => {
    for (const rivalReplacementDays of [5, 0]) {
      const deps = testDeps({ rivalCount: 1, rivalReplacementDays });
      const document = created('streams', deps);
      const world = structuredClone(document.world);
      // Every planned stream, so that each can be seen to stand still.
      Object.assign(world.rng, createStreams(document.meta.seed, plannedStreams), structuredClone(world.rng));
      world.turn = nightOf(0);
      arrange.retirement(world, firstRival(world), deps);
      const before = structuredClone(world.rng) as Record<string, unknown>;

      const events = endings(world, phaseContext(world, deps, document.history));

      expect(ofType(events, 'guild.folded')).toHaveLength(1);
      expect(ofType(events, 'guild.founded')).toHaveLength(rivalReplacementDays === 0 ? 1 : 0);
      const rng = world.rng as Record<string, unknown>;
      for (const name of plannedStreams) {
        const moved = name === 'generation' && rivalReplacementDays === 0;
        if (moved) expect(rng[name], name).not.toEqual(before[name]);
        else expect(rng[name], name).toEqual(before[name]);
      }
    }
  });
});
