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
import { testDeps, withValid } from './world.test-support.js';
import { copyWorld } from './world-copy.js';

// `playReturnNight` (DL-245): a Party's return played as the night plays it, with a resolution a
// test chose for the Quest Engine's, for the other packages' tests through `@heroesim/engine/testing`.

/** No Rivals, so the player's Party is the only one out, and the night's other events are none of its return's. */
const deps: EngineDeps = testDeps({ rivalCount: 0 });

/** The player's first two Heroes sent on the first open Quest, the document played to the afternoon before their return. */
function eveOfReturn(seed: string): { eve: WorldDocument; party: Party; quest: Quest } {
  const start = createWorld(seed, { guildmasterName: 'Ada', guildName: 'The Test', createdAt: 'test' }, deps).document;
  const guild = playerGuild(start.world) as Guild;
  const heroIds = guild.rosterIds.slice(0, 2);
  const open = start.world.board
    .map((id) => start.world.quests[id] as Quest)
    .find(({ requirements }) => requirements.classKey === undefined && requirements.skillKey === undefined && requirements.partySizeMin <= 2 && 2 <= requirements.partySizeMax);
  if (open === undefined) throw new Error('no open Quest for two');
  const sent = applyAction(start, { kind: 'dispatch', guildId: guild.id, questId: open.id, heroIds }, deps);
  if (!sent.ok) throw new Error(sent.rejection.reason);
  const party = Object.values(sent.document.world.parties)[0] as Party;
  let eve = withValid(sent.document, deps);
  while (eve.world.turn < party.returnsOnTurn - 1) eve = advance(eve, deps).document;
  return { eve, party, quest: eve.world.quests[party.questId] as Quest };
}

/** The resolution the Quest Engine draws for the Party on its return night, from the eve's streams. */
function drawn(eve: WorldDocument, party: Party, quest: Quest): Resolution {
  const night = copyWorld(eve.world);
  night.turn += 1;
  return resolveQuest(night, structuredClone(quest), structuredClone(party), phaseContext(night, deps, eve.history));
}

describe('playReturnNight', () => {
  test("plays the Quest Engine's own resolution as the night does: each of its events, in the night's order", () => {
    const { eve, party, quest } = eveOfReturn('return-night-same');
    const played = advance(structuredClone(eve), deps).events;

    const { events, document } = playReturnNight(structuredClone(eve), party.id, drawn(eve, party, quest), deps, party.returnsOnTurn);

    expect(events.map((event) => event.type)).toContain('quest.resolved');
    const at = events.map((event) => played.findIndex((each) => JSON.stringify(each) === JSON.stringify(event)));
    expect(at.every((index) => index >= 0)).toBe(true);
    expect(at).toEqual([...at].sort((a, b) => a - b));
    expect(document.world.parties).not.toHaveProperty(party.id);
    expect(document.world.turn).toBe(party.returnsOnTurn);
  });

  test("applies a resolution the test chose: a Death and the dead's gear home, a survivor's Level, each recorded on the night", () => {
    const { eve, party, quest } = eveOfReturn('return-night-told');
    const [dead, alive] = party.heroIds;
    if (dead === undefined || alive === undefined) throw new Error('a Party of two');
    const before = structuredClone(eve);
    addStack(eve.world, 'padded-jack', 1, { kind: 'hero', id: dead, slot: 'armour' });
    const hero = eve.world.heroes[alive];
    if (hero === undefined) throw new Error('no survivor');
    const resolution = drawn(eve, party, quest);
    const xp = xpForLevel(hero.level + 1, deps.config) - hero.xp;
    const told: Resolution = { ...resolution, outcome: { ...resolution.outcome, xpPerHero: xp, deaths: [dead], injuries: [] }, traits: [] };
    const from = eve.history.entries.length;

    const { events } = playReturnNight(eve, party.id, told, deps, party.returnsOnTurn);

    const of = (type: EngineEvent['type']): EngineEvent[] => events.filter((event) => event.type === type);
    expect(of('hero.died').map((event) => event.participants[0])).toEqual([dead]);
    expect(of('item.returned')).toMatchObject([{ payload: { heroId: dead, definitionKey: 'padded-jack', cause: 'died' } }]);
    expect(of('hero.levelled')).toMatchObject([{ payload: { heroId: alive, level: hero.level + 1 } }]);
    expect(of('hero.xp-gained').map((event) => event.participants[0])).toEqual([alive]);
    expect(eve.history.entries.slice(from)).toEqual(events);
    expect(events.every((event) => event.turn === party.returnsOnTurn)).toBe(true);
    expect(eve.world.heroes[dead]?.diedOnTurn).toBeNull();
    expect(before.world.heroes[alive]).toEqual(eve.world.heroes[alive]);
  });

  test('refuses a night before the world stands', () => {
    const { eve, party, quest } = eveOfReturn('return-night-past');

    expect(() => playReturnNight(eve, party.id, drawn(eve, party, quest), deps, eve.world.turn - 1)).toThrow(RangeError);
  });
});
