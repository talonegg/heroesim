import { describe, expect, test } from 'vitest';
import { createWorld } from './create.js';
import type { EntityId, HeroId } from './document.js';
import { eventEmitter } from './emit.js';
import { milestoneTypes } from './events.js';
import { buildDocument, fixtureTurn, testDeps } from './world.test-support.js';

function fixture() {
  const { document, ids } = buildDocument();
  return { world: document.world, ids, emit: eventEmitter(document.world) };
}

describe('emit', () => {
  test("adds a Hero's Guild to the participants when only the Hero was given", () => {
    const { world, ids, emit } = fixture();
    const heroId = ids.partyHero;

    const event = emit({
      type: 'hero.generated',
      participants: [heroId],
      payload: { heroId, guildId: ids.playerGuild, classKey: 'warrior' },
    });

    expect(event.participants).toEqual([heroId, ids.playerGuild]);
    expect(event.labels).toEqual({
      [heroId]: world.heroes[heroId]?.name,
      [ids.playerGuild]: world.guilds[ids.playerGuild]?.name,
    });
  });

  test('adds no Guild for an Unattached Hero, and none twice', () => {
    const { ids, emit } = fixture();
    const unattached = ids.unattachedHero as HeroId;
    const second = ids.idleHero as HeroId;
    const payload = { heroId: unattached, guildId: null, classKey: 'mage' };

    expect(emit({ type: 'hero.generated', participants: [unattached], payload }).participants).toEqual([unattached]);
    // Two Heroes of one Guild, and the Guild given before them: each id once, in the given order.
    const both = emit({ type: 'hero.generated', participants: [ids.partyHero, second, ids.partyHero], payload });
    expect(both.participants).toEqual([ids.partyHero, second, ids.playerGuild]);
    const guildFirst = emit({ type: 'hero.generated', participants: [ids.playerGuild, second], payload });
    expect(guildFirst.participants).toEqual([ids.playerGuild, second]);
  });

  test("stamps the world's Turn and the type's Milestone flag", () => {
    const { ids, emit } = fixture();

    const founded = emit({
      type: 'guild.founded',
      participants: [ids.rivalGuild],
      payload: { guildId: ids.rivalGuild, guildmasterId: ids.playerGuildmaster },
    });
    const adopted = emit({ type: 'world.rules-adopted', participants: [], payload: { oldConfigVersion: 1, newConfigVersion: 2 } });

    expect(founded).toMatchObject({ turn: fixtureTurn, milestone: true });
    expect(adopted).toEqual({
      turn: fixtureTurn,
      type: 'world.rules-adopted',
      participants: [],
      labels: {},
      milestone: true,
      payload: { oldConfigVersion: 1, newConfigVersion: 2 },
    });
  });

  test('labels a participant with its name as it is at emission; a row with no name has no label', () => {
    const { world, ids, emit } = fixture();
    const payload = { seed: 'labels' };
    const named = world.heroes[ids.partyHero];
    if (named === undefined) throw new Error('The fixture has no party Hero');

    const before = emit({ type: 'world.created', participants: [ids.partyHero, ids.takenQuest, ids.party], payload });
    named.name = 'Renamed';
    const after = emit({ type: 'world.created', participants: [ids.partyHero], payload });

    expect(Object.keys(before.labels).sort()).toEqual([ids.partyHero, ids.playerGuild].sort());
    expect(before.labels[ids.partyHero]).not.toBe('Renamed');
    expect(after.labels[ids.partyHero]).toBe('Renamed');
  });

  test('throws on a participant that is not an id, or whose row is not in the world', () => {
    const { ids, emit } = fixture();
    const payload = { seed: 'missing' };

    expect(() => emit({ type: 'world.created', participants: ['nobody' as EntityId], payload })).toThrow(TypeError);
    expect(() => emit({ type: 'world.created', participants: [ids.departedHero], payload })).toThrow(RangeError);
    expect(() => emit({ type: 'world.created', participants: [ids.resolvedQuest], payload })).toThrow(RangeError);
  });
});

describe('milestoneTypes', () => {
  test('agrees with the Milestone flag of every event world creation makes', () => {
    const { events } = createWorld('milestones', { guildmasterName: 'Ada', guildName: 'The Test', createdAt: 'test' }, testDeps());

    for (const event of events) expect(event.milestone).toBe(milestoneTypes[event.type]);
    expect(events.some((event) => event.milestone)).toBe(true);
  });
});
