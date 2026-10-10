import { describe, expect, test } from 'vitest';
import { applyAction } from './actions/action.js';
import { advance } from './advance.js';
import type { EngineDeps } from './config.js';
import { createWorld } from './create.js';
import type { Guild, Party, Quest, WorldDocument } from './document.js';
import type { EngineEvent } from './events.js';
import { addStack } from './items.js';
import { phaseContext } from './phases/phase.js';
import { xpForLevel } from './progression.js';
import { resolveQuest, type Resolution } from './quest-engine/resolve.js';
import { playReturnNight } from './return-night.js';
import { playerGuild } from './selectors.js';
import { dayOf, nightOf } from './time.js';
import { testDeps, withValid } from './world.test-support.js';
import { copyWorld } from './world-copy.js';

// `playReturnNight` (DL-245): a Party's return played as the night plays it, with a resolution a
// test chose for the Quest Engine's, for the other packages' tests through `@heroesim/engine/testing`.

/** No Rivals, so the player's Party is the only one out, and the night's other events are none of its return's. */
const deps: EngineDeps = testDeps({ rivalCount: 0 });

/**
 * The player's Heroes sent two by two on `count` open Quests of one length, so that every Party comes home
 * the same night: the document as sent, and played to the afternoon before that night.
 */
function eveOfReturns(seed: string, count: number): { sent: WorldDocument; eve: WorldDocument; parties: Party[] } {
  const start = createWorld(seed, { guildmasterName: 'Ada', guildName: 'The Test', createdAt: 'test' }, deps).document;
  const guild = playerGuild(start.world) as Guild;
  const open = start.world.board
    .map((id) => start.world.quests[id] as Quest)
    .filter(({ requirements }) => requirements.classKey === undefined && requirements.skillKey === undefined && requirements.partySizeMin <= 2 && 2 <= requirements.partySizeMax);
  const quests = open.filter((quest) => open.filter((other) => other.durationTurns === quest.durationTurns).length >= count).slice(0, count);
  if (quests.length < count) throw new Error(`no ${count} open Quests of one length for two each`);
  let sent = start;
  for (const [at, quest] of quests.entries()) {
    const taken = applyAction(sent, { kind: 'dispatch', guildId: guild.id, questId: quest.id, heroIds: guild.rosterIds.slice(2 * at, 2 * at + 2) }, deps);
    if (!taken.ok) throw new Error(taken.rejection.reason);
    sent = taken.document;
  }
  const parties = Object.values(sent.world.parties);
  let eve = withValid(sent, deps);
  while (eve.world.turn < (parties[0] as Party).returnsOnTurn - 1) eve = advance(eve, deps).document;
  return { sent, eve, parties };
}

/** One Party out, as `eveOfReturns` sends them. */
function eveOfReturn(seed: string): { sent: WorldDocument; eve: WorldDocument; party: Party } {
  const { sent, eve, parties } = eveOfReturns(seed, 1);
  return { sent, eve, party: parties[0] as Party };
}

/** The resolutions the Quest Engine draws for `parties` on their return night, from the eve's streams, in the night's order. */
function drawnAll(eve: WorldDocument, parties: readonly Party[]): Resolution[] {
  const night = copyWorld(eve.world);
  night.turn += 1;
  const ctx = phaseContext(night, deps, eve.history);
  return parties.map((party) => resolveQuest(night, structuredClone(night.quests[party.questId] as Quest), structuredClone(party), ctx));
}

/** The resolution the Quest Engine draws for the Party on its return night, from the eve's streams. */
function drawn(eve: WorldDocument, party: Party): Resolution {
  return drawnAll(eve, [party])[0] as Resolution;
}

describe('playReturnNight', () => {
  test("plays the Quest Engine's own resolution as the night does: each of its events, in the night's order", () => {
    const { eve, party } = eveOfReturn('return-night-same');
    const played = advance(structuredClone(eve), deps).events;

    const { events, document } = playReturnNight(structuredClone(eve), [{ partyId: party.id, resolution: drawn(eve, party) }], deps, party.returnsOnTurn);

    expect(events.map((event) => event.type)).toContain('quest.resolved');
    const at = events.map((event) => played.findIndex((each) => JSON.stringify(each) === JSON.stringify(event)));
    expect(at.every((index) => index >= 0)).toBe(true);
    expect(at).toEqual([...at].sort((a, b) => a - b));
    expect(document.world.parties).not.toHaveProperty(party.id);
    expect(document.world.turn).toBe(party.returnsOnTurn);
  });

  test("applies a resolution the test chose: a Death and the dead's gear home, a survivor's Level, each recorded on the night", () => {
    const { eve, party } = eveOfReturn('return-night-told');
    const [dead, alive] = party.heroIds;
    if (dead === undefined || alive === undefined) throw new Error('a Party of two');
    const before = structuredClone(eve);
    addStack(eve.world, 'padded-jack', 1, { kind: 'hero', id: dead, slot: 'armour' });
    const hero = eve.world.heroes[alive];
    if (hero === undefined) throw new Error('no survivor');
    const resolution = drawn(eve, party);
    const xp = xpForLevel(hero.level + 1, deps.config) - hero.xp;
    const told: Resolution = { ...resolution, outcome: { ...resolution.outcome, xpPerHero: xp, deaths: [dead], injuries: [] }, traits: [] };
    const from = eve.history.entries.length;

    const { events } = playReturnNight(eve, [{ partyId: party.id, resolution: told }], deps, party.returnsOnTurn);

    const of = (type: EngineEvent['type']): EngineEvent[] => events.filter((event) => event.type === type);
    expect(of('hero.died').map((event) => event.participants[0])).toEqual([dead]);
    expect(of('item.returned')).toMatchObject([{ payload: { heroId: dead, definitionKey: 'padded-jack', cause: 'died' } }]);
    expect(of('hero.levelled')).toMatchObject([{ payload: { heroId: alive, level: hero.level + 1 } }]);
    expect(of('hero.xp-gained').map((event) => event.participants[0])).toEqual([alive]);
    expect(eve.history.entries.slice(from)).toEqual(events);
    // In the night's order (pipeline.ts): the Quest's outcome, then the Levels, then the dead's gear.
    expect(events.map((event) => event.type).slice(-2)).toEqual(['hero.levelled', 'item.returned']);
    expect(events.every((event) => event.turn === party.returnsOnTurn)).toBe(true);
    expect(eve.world.heroes[dead]?.diedOnTurn).toBeNull();
    expect(before.world.heroes[alive]).toEqual(eve.world.heroes[alive]);
  });

  test('plays several Parties home on one night as the night does: every outcome in Party id order, then the Levels and the gear once', () => {
    const { eve, parties } = eveOfReturns('return-night-two', 2);
    const played = advance(structuredClone(eve), deps).events;
    const [first, second] = drawnAll(eve, parties);
    if (first === undefined || second === undefined) throw new Error('two resolutions');

    // Given out of order: played in the night's.
    const returns = [
      { partyId: (parties[1] as Party).id, resolution: second },
      { partyId: (parties[0] as Party).id, resolution: first },
    ];
    const { events, document } = playReturnNight(structuredClone(eve), returns, deps, (parties[0] as Party).returnsOnTurn);

    const resolved = events.filter((event) => event.type === 'quest.resolved');
    expect(resolved.map((event) => event.participants[1])).toEqual(parties.map((party) => party.id));
    const at = events.map((event) => played.findIndex((each) => JSON.stringify(each) === JSON.stringify(event)));
    expect(at.every((index) => index >= 0)).toBe(true);
    expect(at).toEqual([...at].sort((a, b) => a - b));
    expect(document.world.parties).toEqual({});
  });

  test("refuses a night already played: a return is the engine's once", () => {
    const { eve, party } = eveOfReturn('return-night-past');
    const home = advance(structuredClone(eve), deps).document;
    const returns = [{ partyId: party.id, resolution: drawn(eve, party) }];

    expect(() => playReturnNight(home, returns, deps, party.returnsOnTurn)).toThrow(/already played/);
    expect(() => playReturnNight(eve, returns, deps, eve.world.turn)).toThrow(/already played/);
  });

  test('refuses a Turn that is not a night: a Party comes home only on one', () => {
    const { sent, eve, party } = eveOfReturn('return-night-morning');

    expect(party.returnsOnTurn - 2).toBeGreaterThan(sent.world.turn);
    expect(() => playReturnNight(sent, [{ partyId: party.id, resolution: drawn(eve, party) }], deps, party.returnsOnTurn - 2)).toThrow(/not a night/);
  });

  test("refuses a night that is not the Party's return night", () => {
    const { sent, eve, party } = eveOfReturn('return-night-other');
    const returns = [{ partyId: party.id, resolution: drawn(eve, party) }];
    const earlier = nightOf(dayOf(party.returnsOnTurn) - 1);

    expect(earlier).toBeGreaterThan(sent.world.turn);
    expect(() => playReturnNight(sent, returns, deps, earlier)).toThrow(/comes home on Turn/);
    expect(() => playReturnNight(sent, returns, deps, nightOf(dayOf(party.returnsOnTurn) + 1))).toThrow(/comes home on Turn/);
  });
});
