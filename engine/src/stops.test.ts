import { describe, expect, test } from 'vitest';
import { dispatchRefusal } from './actions/dispatch.js';
import { advance } from './advance.js';
import { bestParties } from './best-party.js';
import { availableHeroes, staffableQuests } from './controllers/rival.js';
import { createWorld } from './create.js';
import type { Guild, GuildId, Hero, HeroId, Party, Quest, World, WorldDocument } from './document.js';
import type { EngineEvent } from './events.js';
import { playerGuild } from './selectors.js';
import {
  alwaysStops,
  belowFloorStop,
  decisionNeededStop,
  isStopCondition,
  partyReturnedStop,
  poolRefreshedStop,
  questStaffableStop,
  stopConditions,
  stopsOfTurn,
} from './stops.js';
import { testDeps, withValid } from './world.test-support.js';
import { applyAction } from './actions/action.js';

// No Rivals: these tests watch the player's Guild and arrange its Board themselves.
const deps = testDeps({ rivalCount: 0 });
const setup = { guildmasterName: 'Ada', guildName: 'The Test', createdAt: 'test' };

function created(seed = 'stops'): WorldDocument {
  return withValid(createWorld(seed, setup, deps).document, deps);
}

function player(world: World): Guild {
  const guild = playerGuild(world);
  if (guild === undefined) throw new Error('No player Guild');
  return guild;
}

/** A copy of `world` with the Quest `questId` given `requirements` beside its size. */
function requiring(world: World, questId: Quest['id'], requirements: Partial<Quest['requirements']>): World {
  const copy = structuredClone(world);
  const quest = copy.quests[questId] as Quest;
  quest.requirements = { ...quest.requirements, ...requirements };
  return copy;
}

describe('which stops are always on (approach §2, principle 10, pre-M0 review B7)', () => {
  test("an ending, the floor, a Party home, a decision, a Transfer Offer and a module's stop always stop; a staffable Quest and the pool only when asked", () => {
    expect(alwaysStops).toEqual({
      ended: true,
      'below-floor': true,
      'party-returned': true,
      'decision-needed': true,
      'quest-staffable': false,
      'transfer-offer': true,
      module: true,
      'pool-refreshed': false,
    });
    expect(stopConditions).toEqual([
      'ended',
      'below-floor',
      'party-returned',
      'decision-needed',
      'quest-staffable',
      'transfer-offer',
      'module',
      'pool-refreshed',
    ]);
    expect(stopConditions.every(isStopCondition)).toBe(true);
    expect(['max-turns', 'returns', 3, undefined].some(isStopCondition)).toBe(false);
  });
});

describe('party-returned', () => {
  const resolved = (guildId: string, partyId: string) =>
    ({ type: 'quest.resolved', turn: 5, payload: { guildId, partyId } }) as unknown as EngineEvent;

  test("is the watched Guild's resolved Quests, in order, and never another Guild's", () => {
    const events = [resolved('guild-000002', 'party-000001'), resolved('guild-000001', 'party-000003'), resolved('guild-000001', 'party-000002')];

    expect(partyReturnedStop(events, 'guild-000001' as GuildId)).toEqual({
      kind: 'party-returned',
      guildId: 'guild-000001',
      partyIds: ['party-000003', 'party-000002'],
    });
    expect(partyReturnedStop(events, 'guild-000003' as GuildId)).toBeNull();
    expect(partyReturnedStop([], 'guild-000001' as GuildId)).toBeNull();
  });
});

describe('decision-needed', () => {
  test('names a Quest new on the Board that the idle Roster could staff', () => {
    const { world } = created();
    const guild = player(world);
    const [questId] = world.board;
    if (questId === undefined) throw new Error('An empty Board');
    const before = structuredClone(world);
    before.board = before.board.filter((id) => id !== questId);

    expect(staffableQuests(world, guild, deps).map((quest) => quest.id)).toContain(questId);
    expect(decisionNeededStop(before, world, guild.id, deps)).toEqual({ kind: 'decision-needed', guildId: guild.id, questIds: [questId] });
  });

  test('is not needed for a Quest the Guild could staff before the Turn: the caller has seen it', () => {
    const { world } = created();
    expect(decisionNeededStop(world, structuredClone(world), player(world).id, deps)).toBeNull();
  });

  test('is not needed for a new Quest no Party of the Roster meets', () => {
    const { world } = created();
    const guild = player(world);
    const [questId] = world.board;
    if (questId === undefined) throw new Error('An empty Board');
    const classes = new Set(guild.rosterIds.map((id) => (world.heroes[id] as Hero).classKey));
    const missing = Object.keys(deps.content.classes).find((key) => !classes.has(key));
    // A Class nobody on the Roster has, or more Heroes than the Roster holds.
    const after = requiring(
      world,
      questId,
      missing === undefined ? { partySizeMin: guild.rosterIds.length + 1 } : { classKey: missing },
    );
    const before = structuredClone(after);
    before.board = before.board.filter((id) => id !== questId);

    expect(staffableQuests(after, guild, deps).map((quest) => quest.id)).not.toContain(questId);
    expect(decisionNeededStop(before, after, guild.id, deps)).toBeNull();
  });

  test('is not needed while a Party of the Guild is out, though the Heroes at home could staff the new Quest', () => {
    const { world } = created();
    const guild = player(world);
    const before = structuredClone(world);
    before.board = [];
    const after = structuredClone(world);
    (after.heroes[guild.rosterIds[0] as HeroId] as Hero).partyId = 'party-000001' as Party['id'];

    expect(staffableQuests(after, guild, deps).length).toBeGreaterThan(0);
    expect(decisionNeededStop(before, after, guild.id, deps)).toBeNull();
  });

  test('is not needed while the whole Roster is away or injured', () => {
    const { world } = created();
    const guild = player(world);
    const before = structuredClone(world);
    before.board = [];
    const [away, ...rest] = guild.rosterIds as [HeroId, ...HeroId[]];
    const after = structuredClone(world);
    (after.heroes[away] as Hero).partyId = 'party-000001' as Party['id'];
    for (const heroId of rest) (after.heroes[heroId] as Hero).injury = { typeKey: 'bruised-ribs', healsOnTurn: 99 };

    expect(decisionNeededStop(before, after, guild.id, deps)).toBeNull();
  });

  test('is needed on the night a Party comes home to a Board it can staff, after party-returned', () => {
    const document = created('stops-home');
    const guild = player(document.world);
    // Any Quest the Roster can staff takes it whole: none has a most (DL-266).
    const [quest] = staffableQuests(document.world, guild, deps);
    if (quest === undefined) throw new Error('No Quest takes the whole Roster');
    const sent = applyAction(document, { kind: 'dispatch', guildId: guild.id, questId: quest.id, heroIds: [...guild.rosterIds] }, deps);
    if (!sent.ok) throw new Error(`Rejected ${sent.rejection.reason}`);
    const party = Object.values(sent.document.world.parties)[0] as Party;
    let eve = sent.document;
    while (eve.world.turn < party.returnsOnTurn - 1) eve = advance(eve, deps).document;

    const night = advance(eve, deps);
    const stops = stopsOfTurn({ before: eve.world, after: night.document.world, events: night.events }, guild.id, deps);

    withValid(night.document, deps);
    // The Quests the Heroes home can staff are newly within reach too, so the opt-in stop names
    // them as well; listening to every condition, all three are reported, in order.
    expect(stops.map((stop) => stop.kind)).toEqual(['party-returned', 'decision-needed', 'quest-staffable']);
    expect(stops[0]).toEqual({ kind: 'party-returned', guildId: guild.id, partyIds: [party.id] });
  });
});

describe('below-floor (DL-85 item 6)', () => {
  const below = (guildId: string, dueDay: number) =>
    ({ type: 'guild.below-floor', turn: 5, payload: { guildId, wealth: -3, floor: 0, dueDay } }) as unknown as EngineEvent;
  const recovered = (guildId: string) =>
    ({ type: 'guild.floor-recovered', turn: 5, payload: { guildId, wealth: 3, floor: 0, belowFloorSince: 2 } }) as unknown as EngineEvent;

  test("is the watched Guild's guild.below-floor this Turn, and never a Rival's crossing", () => {
    const watched = 'guild-000001' as GuildId;
    const rival = 'guild-000002' as GuildId;

    expect(belowFloorStop([below(rival, 31), below(watched, 32)], watched)).toEqual({ kind: 'below-floor', guildId: watched, dueDay: 32 });
    expect(belowFloorStop([below(rival, 31)], watched)).toBeNull();
    expect(belowFloorStop([recovered(watched)], watched)).toBeNull();
    expect(belowFloorStop([], watched)).toBeNull();
  });
});

describe('quest-staffable (DL-85 item 8)', () => {
  /**
   * `world` with the first Hero of the Roster away in a Party, and a Quest on the Board the rest can
   * staff; `before` the same world without that Quest on the Board.
   */
  function partyOut(seed: string): { before: World; after: World; guild: Guild; questId: Quest['id'] } {
    const { world } = created(seed);
    const guild = player(world);
    const after = structuredClone(world);
    (after.heroes[guild.rosterIds[0] as HeroId] as Hero).partyId = 'party-000001' as Party['id'];
    const [quest] = staffableQuests(after, player(after), deps);
    if (quest === undefined) throw new Error('The Heroes at home can staff nothing');
    const before = structuredClone(after);
    before.board = before.board.filter((id) => id !== quest.id);
    return { before, after, guild, questId: quest.id };
  }

  test('names a Quest new on the Board that the free Heroes could staff, even with a Party out, where decision-needed does not', () => {
    const { before, after, guild, questId } = partyOut('stops-out');

    expect(questStaffableStop(before, after, guild.id, deps)).toEqual({ kind: 'quest-staffable', guildId: guild.id, questIds: [questId] });
    expect(decisionNeededStop(before, after, guild.id, deps)).toBeNull();
  });

  test('on an idle Roster, names what decision-needed names', () => {
    const { world } = created();
    const guild = player(world);
    const before = structuredClone(world);
    before.board = before.board.slice(2);

    const decision = decisionNeededStop(before, world, guild.id, deps);
    expect(decision?.kind).toBe('decision-needed');
    expect(questStaffableStop(before, world, guild.id, deps)).toEqual({ ...decision, kind: 'quest-staffable' });
  });

  test('names nothing the free Heroes could staff before the Turn: the caller has seen it', () => {
    const { after, guild } = partyOut('stops-out');
    expect(questStaffableStop(after, structuredClone(after), guild.id, deps)).toBeNull();
  });

  test('names nothing when no free Hero could staff the new Quest: the rest injured, or a Class nobody at home has', () => {
    const { before, after, guild, questId } = partyOut('stops-out');
    const hurt = structuredClone(after);
    for (const heroId of guild.rosterIds.slice(1)) (hurt.heroes[heroId] as Hero).injury = { typeKey: 'bruised-ribs', healsOnTurn: 99 };
    expect(questStaffableStop(before, hurt, guild.id, deps)).toBeNull();

    const home = guild.rosterIds.slice(1).map((id) => (after.heroes[id] as Hero).classKey);
    const missing = Object.keys(deps.content.classes).find((key) => !home.includes(key));
    const beyond = requiring(
      after,
      questId,
      missing === undefined ? { partySizeMin: guild.rosterIds.length } : { classKey: missing },
    );
    expect(questStaffableStop(before, beyond, guild.id, deps)).toBeNull();
  });

  test('names a Quest already on the Board once it comes within reach, as when a Hero heals', () => {
    const { after, guild } = partyOut('stops-out');
    const hurt = structuredClone(after);
    for (const heroId of guild.rosterIds.slice(1)) (hurt.heroes[heroId] as Hero).injury = { typeKey: 'bruised-ribs', healsOnTurn: 99 };

    const stop = questStaffableStop(hurt, after, guild.id, deps);
    expect(stop?.kind).toBe('quest-staffable');
    expect(stop?.kind === 'quest-staffable' && stop.questIds).toEqual(staffableQuests(after, player(after), deps).map((quest) => quest.id));
  });

  test('names nothing for a Guild not in the world', () => {
    const { before, after } = partyOut('stops-out');
    expect(questStaffableStop(before, after, 'guild-999999' as GuildId, deps)).toBeNull();
  });
});

describe("staffableQuests: a Quest can be staffed exactly when dispatch would send some Party of the Roster", () => {
  /** Every non-empty subset of `ids`. */
  function subsets<Id>(ids: readonly Id[]): Id[][] {
    const all: Id[][] = [];
    for (let mask = 1; mask < 1 << ids.length; mask += 1) all.push(ids.filter((_, bit) => (mask & (1 << bit)) !== 0));
    return all;
  }

  test('against every Party of the Roster, judged by dispatchRefusal, over Heroes away and injured and every shape of requirement', () => {
    const six = testDeps({ rivalCount: 0, startingRosterSize: 6 });
    const shapes: Pick<Quest['requirements'], 'classKey' | 'skillKey'>[] = [
      {},
      { classKey: 'healer' },
      { classKey: 'mage' },
      { skillKey: 'lockpicking' },
      { classKey: 'warrior', skillKey: 'tactics' },
      { classKey: 'rogue', skillKey: 'lockpicking' },
    ];
    const sizes = [[1, 1], [1, 3], [2, 2], [2, 4], [3, 5], [5, 6], [7, 8]] as const;
    let staffable = 0;
    let unstaffable = 0;
    for (const seed of ['staff-a', 'staff-b', 'staff-c']) {
      const base = withValid(createWorld(seed, setup, six).document, six).world;
      const guild = player(base);
      const [away, hurt] = guild.rosterIds as [HeroId, HeroId];
      for (const unavailable of [[], [away], [away, hurt]] as const) {
        const world = structuredClone(base);
        if (unavailable.length > 0) (world.heroes[away] as Hero).partyId = 'party-000001' as Party['id'];
        if (unavailable.length > 1) (world.heroes[hurt] as Hero).injury = { typeKey: 'bruised-ribs', healsOnTurn: 99 };
        const questId = world.board[0] as Quest['id'];
        for (const [partySizeMin] of sizes) {
          for (const shape of shapes) {
            const asked = structuredClone(world);
            (asked.quests[questId] as Quest).requirements = { partySizeMin, ...shape };
            const some = subsets(guild.rosterIds).some(
              (heroIds) => dispatchRefusal(asked, { guildId: guild.id, questId, heroIds }, six) === null,
            );
            const named = staffableQuests(asked, player(asked), six).some((quest) => quest.id === questId);
            expect(named, `${seed} ${unavailable.length} away ${partySizeMin} ${JSON.stringify(shape)}`).toBe(some);
            if (some) staffable += 1;
            else unstaffable += 1;
          }
        }
      }
    }
    // Both answers are reached often, so neither is true by default.
    expect(staffable).toBeGreaterThan(40);
    expect(unstaffable).toBeGreaterThan(40);
  });

  test("a Quest dispatch would refuse whoever went is not staffable, whatever its requirements: the verdict is dispatch's", () => {
    const { world } = created();
    const guild = player(world);
    const [quest] = staffableQuests(world, guild, deps);
    if (quest === undefined) throw new Error('Nothing staffable');
    // A folded Guild sends no Party (`guild-folded`), so it can staff nothing on the Board.
    const folded = structuredClone(world);
    (folded.guilds[guild.id] as Guild).foldedOnTurn = 0;
    expect(staffableQuests(folded, player(folded), deps)).toEqual([]);
  });
});

describe('pool-refreshed', () => {
  test('names the Heroes in the pool after the Turn and not before, refilled or released alike', () => {
    const { world } = created();
    const guild = player(world);
    const after = structuredClone(world);
    // One released from a Roster, as a fold releases (DL-28): in the pool from this Turn.
    const released = guild.rosterIds[0] as HeroId;
    Object.assign(after.heroes[released] as Hero, { guildId: null, unattachedSince: 1 });
    // One in the pool before the Turn and still there, one recruited out of it.
    const pool = Object.values(world.heroes).filter((hero) => hero.unattachedSince !== null);
    const recruited = pool[0] as Hero;
    Object.assign(after.heroes[recruited.id] as Hero, { guildId: guild.id, unattachedSince: null });

    expect(poolRefreshedStop(world, after)).toEqual({ kind: 'pool-refreshed', heroIds: [released] });
    expect(poolRefreshedStop(world, structuredClone(world))).toBeNull();
  });
});

describe('stopsOfTurn', () => {
  test('reports every reason the Turn gives in order, and looks only for the conditions asked', () => {
    const { world } = created();
    const guild = player(world);
    const before = structuredClone(world);
    before.board = [];
    const after = structuredClone(world);
    after.ended = { turn: 1, reason: 'bankruptcy' };
    const released = guild.rosterIds[0] as HeroId;
    Object.assign(after.heroes[released] as Hero, { guildId: null, unattachedSince: 1 });
    after.guilds[guild.id]!.rosterIds = guild.rosterIds.slice(1);
    const events = [
      { type: 'quest.resolved', turn: 1, payload: { guildId: guild.id, partyId: 'party-000001' } },
      { type: 'guild.below-floor', turn: 1, payload: { guildId: guild.id, wealth: -1, floor: 0, dueDay: 30 } },
    ] as unknown as EngineEvent[];
    const turn = { before, after, events };

    expect(stopsOfTurn(turn, guild.id, deps).map((stop) => stop.kind)).toEqual([
      'ended',
      'below-floor',
      'party-returned',
      'decision-needed',
      'quest-staffable',
      'pool-refreshed',
    ]);
    expect(stopsOfTurn(turn, guild.id, deps, ['pool-refreshed', 'party-returned']).map((stop) => stop.kind)).toEqual([
      'party-returned',
      'pool-refreshed',
    ]);
    expect(stopsOfTurn(turn, guild.id, deps, ['quest-staffable', 'below-floor']).map((stop) => stop.kind)).toEqual([
      'below-floor',
      'quest-staffable',
    ]);
  });

  test('gives decision-needed and quest-staffable as each detector alone gives them, over played Turns with a Party out and home (M9 review)', () => {
    const staffing = ['decision-needed', 'quest-staffable'] as const;
    /** What the two detectors give for `turn`, each asked alone, in `stopConditions`' order. */
    const alone = ({ before, after }: { before: World; after: World }, guildId: GuildId) =>
      [decisionNeededStop(before, after, guildId, deps), questStaffableStop(before, after, guildId, deps)].filter((stop) => stop !== null);

    let document = created('stops-both');
    const guildId = player(document.world).id;
    const seen = new Set<string>();
    for (let turn = 0; turn < 120; turn += 1) {
      // Every third Turn, send the smallest Party the staffing rule finds, when the Roster is idle.
      const guild = player(document.world);
      const idle = guild.rosterIds.every((heroId) => document.world.heroes[heroId]?.partyId === null);
      const [quest] = idle && turn % 3 === 0 ? staffableQuests(document.world, guild, deps) : [];
      const heroIds = quest === undefined ? null : bestParties(document.world, guild, deps).party(quest, availableHeroes(document.world, guild))?.heroIds ?? null;
      if (quest !== undefined && heroIds !== null) {
        const sent = applyAction(document, { kind: 'dispatch', guildId, questId: quest.id, heroIds }, deps);
        if (!sent.ok) throw new Error(`Rejected ${sent.rejection.reason}`);
        document = sent.document;
      }
      const played = advance(document, deps);
      const step = { before: document.world, after: played.document.world, events: played.events };
      const both = stopsOfTurn(step, guildId, deps, staffing);
      expect(both).toEqual(alone(step, guildId));
      for (const stop of both) seen.add(stop.kind);
      expect(stopsOfTurn(step, 'guild-999999' as GuildId, deps, staffing)).toEqual([]);
      document = played.document;
    }
    // Both stops were met, so the reading they share was read both ways.
    expect([...seen].sort()).toEqual([...staffing]);
  });
});
