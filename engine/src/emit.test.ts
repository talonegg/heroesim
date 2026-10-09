import { describe, expect, test } from 'vitest';
import { createWorld } from './create.js';
import type { EntityId, HeroId, StackId } from './document.js';
import { eventEmitter } from './emit.js';
import { isMilestone, milestoneTypes, milestoneWhen } from './events.js';
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
      payload: { guildId: ids.rivalGuild, guildmasterId: ids.playerGuildmaster, wealth: 500 },
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

// DL-52: `quest.loot` is a Milestone when its Item is unique, and only then.
describe('milestoneWhen', () => {
  test('makes quest.loot a Milestone for a unique Item and not for a common one, through emit', () => {
    const { ids, emit } = fixture();
    const common = {
      questId: ids.takenQuest,
      partyId: ids.party,
      guildId: ids.playerGuild,
      lootTableKey: 'lesser-loot',
      definitionKey: 'whetstone',
      quantity: 2,
      itemId: null,
      stackId: ids.guildStack as StackId,
    };
    const unique = { ...common, definitionKey: 'lantern-of-stannary', quantity: 1, itemId: ids.item, stackId: null };
    const participants = [ids.takenQuest, ids.party, ids.playerGuild];

    expect(emit({ type: 'quest.loot', participants, payload: common }).milestone).toBe(false);
    expect(emit({ type: 'quest.loot', participants: [...participants, ids.item], payload: unique }).milestone).toBe(true);
    expect(isMilestone('quest.loot', unique)).toBe(true);
    expect(milestoneTypes['quest.loot']).toBe(false);
  });

  test('names only types milestoneTypes holds false, and leaves every other type to milestoneTypes', () => {
    for (const type of Object.keys(milestoneWhen) as (keyof typeof milestoneTypes)[]) expect(milestoneTypes[type], type).toBe(false);
    expect(isMilestone('hero.died', { heroId: 'hero-000001' as HeroId, questId: 'quest-000001' as never })).toBe(true);
    expect(isMilestone('quest.resolved', {} as never)).toBe(false);
  });
});
