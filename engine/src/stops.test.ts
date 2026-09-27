import { describe, expect, test } from 'vitest';
import { dispatch } from './actions/dispatch.js';
import { advance } from './advance.js';
import { staffableQuests } from './controllers/rival.js';
import { createWorld } from './create.js';
import type { Guild, GuildId, Hero, HeroId, Party, Quest, World, WorldDocument } from './document.js';
import type { EngineEvent } from './events.js';
import { playerGuild } from './selectors.js';
import {
  alwaysStops,
  decisionNeededStop,
  isStopCondition,
  partyReturnedStop,
  poolRefreshedStop,
  stopConditions,
  stopsOfTurn,
} from './stops.js';
import { testDeps, withValid } from './world.test-support.js';

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
  test('an ending, a Party home, a decision and a Transfer Offer always stop; the pool refreshing only when asked', () => {
    expect(alwaysStops).toEqual({
      ended: true,
      'party-returned': true,
      'decision-needed': true,
      'transfer-offer': true,
      'pool-refreshed': false,
    });
    expect(stopConditions).toEqual(['ended', 'party-returned', 'decision-needed', 'transfer-offer', 'pool-refreshed']);
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

    expect(staffableQuests(world, guild, deps.content).map((quest) => quest.id)).toContain(questId);
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
      missing === undefined ? { partySizeMin: guild.rosterIds.length + 1, partySizeMax: guild.rosterIds.length + 1 } : { classKey: missing },
    );
    const before = structuredClone(after);
    before.board = before.board.filter((id) => id !== questId);

    expect(staffableQuests(after, guild, deps.content).map((quest) => quest.id)).not.toContain(questId);
    expect(decisionNeededStop(before, after, guild.id, deps)).toBeNull();
  });

  test('is not needed while a Party of the Guild is out, though the Heroes at home could staff the new Quest', () => {
    const { world } = created();
    const guild = player(world);
    const before = structuredClone(world);
    before.board = [];
    const after = structuredClone(world);
    (after.heroes[guild.rosterIds[0] as HeroId] as Hero).partyId = 'party-000001' as Party['id'];

    expect(staffableQuests(after, guild, deps.content).length).toBeGreaterThan(0);
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
    const quest = staffableQuests(document.world, guild, deps.content).find(
      (row) => row.requirements.partySizeMax >= guild.rosterIds.length,
    );
    if (quest === undefined) throw new Error('No Quest takes the whole Roster');
    const sent = dispatch(document, { guildId: guild.id, questId: quest.id, heroIds: [...guild.rosterIds] }, deps);
    if (!sent.ok) throw new Error(`Rejected ${sent.rejection.reason}`);
    const party = Object.values(sent.document.world.parties)[0] as Party;
    let eve = sent.document;
    while (eve.world.turn < party.returnsOnTurn - 1) eve = advance(eve, deps).document;

    const night = advance(eve, deps);
    const stops = stopsOfTurn({ before: eve.world, after: night.document.world, events: night.events }, guild.id, deps);

    withValid(night.document, deps);
    expect(stops.map((stop) => stop.kind)).toEqual(['party-returned', 'decision-needed']);
    expect(stops[0]).toEqual({ kind: 'party-returned', guildId: guild.id, partyIds: [party.id] });
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
    ] as unknown as EngineEvent[];
    const turn = { before, after, events };

    expect(stopsOfTurn(turn, guild.id, deps).map((stop) => stop.kind)).toEqual([
      'ended',
      'party-returned',
      'decision-needed',
      'pool-refreshed',
    ]);
    expect(stopsOfTurn(turn, guild.id, deps, ['pool-refreshed', 'party-returned']).map((stop) => stop.kind)).toEqual([
      'party-returned',
      'pool-refreshed',
    ]);
  });
});
