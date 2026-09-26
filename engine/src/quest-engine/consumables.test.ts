import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import type { EngineDeps, GameConfig } from '../config.js';
import type { Consequence, ContentSet, Encounter, EncounterKind, InjuryType } from '../content-types.js';
import { createWorld } from '../create.js';
import { makeId, type Guild, type Hero, type Party, type Quest, type World } from '../document.js';
import { streamOf, type Stream } from '../generators/draw.js';
import { addStack } from '../items.js';
import { next } from '../rng.js';
import { playerGuild } from '../selectors.js';
import { heroStatKeys, testContent, testDeps } from '../world.test-support.js';
import { capability } from './check.js';
import { resolveQuest } from './resolve.js';

// M5-S3 (DL-50): the consumables a Party carries, used as the Quest Engine resolves its sequence. A
// created world's player Guild sends its Roster, every Stat set to 8, on a Quest whose Encounters a
// test writes into content, carrying the stacks a test gives the Party.

const setup = { guildmasterName: 'Ada', guildName: 'The Test', createdAt: 'test' };
const pinned: Partial<GameConfig> = {
  rivalCount: 0,
  checkVariance: 0,
  skillBonusPerRating: 2,
  bandBySuccessShare: { successAbove: 0.5, strongAtLeast: 1 },
  xpPerDifficultyPoint: 1,
  xpBandFactor: { fail: 0.5, success: 1, strong: 1 },
  infirmaryHealFactor: [1, 1 / 2, 1 / 3],
};

/** An Encounter keyed `key` of `kind`: Strength, `sum`, no Skills, which `pass` or fail any Party of 8s. */
function encounter(key: string, kind: EncounterKind, pass: boolean, failure: Consequence[] = [], success: Consequence[] = []): Encounter {
  return {
    key,
    name: key,
    kind,
    demands: [['strength', 1]],
    aggregate: 'sum',
    skillKeys: [],
    difficultyFactor: pass ? 0.001 : 1000,
    consequences: { success, failure },
  };
}

/** The test content with `encounters` beside its own, and `injuries` beside its Injury types. */
function contentWith(encounters: Encounter[], injuries: InjuryType[] = []): ContentSet {
  return {
    ...testContent,
    encounters: { ...testContent.encounters, ...Object.fromEntries(encounters.map((it) => [it.key, it])) },
    injuries: { ...testContent.injuries, ...Object.fromEntries(injuries.map((it) => [it.key, it])) },
  };
}

interface Scene {
  world: World;
  heroes: Hero[];
  quest: Quest;
  party: Party;
  deps: EngineDeps;
  /** The `quests` stream as the resolution will find it, to draw from alongside. */
  twin: Stream;
}

/**
 * The player's first `size` Heroes, Stats all 8, sent through `keys` on a Quest of difficulty 40,
 * carrying `carried` (definition key and quantity), under the pinned config and `overrides`.
 */
function scene(
  seed: string,
  content: ContentSet,
  keys: string[],
  carried: [string, number][],
  { size = 3, overrides = {} }: { size?: number; overrides?: Partial<GameConfig> } = {},
): Scene {
  const deps = testDeps({ ...pinned, ...overrides }, content);
  const { world } = createWorld(seed, setup, deps).document;
  const guild = playerGuild(world) as Guild;
  const heroes = guild.rosterIds.slice(0, size).map((id) => world.heroes[id] as Hero);
  for (const hero of heroes) {
    hero.stats = Object.fromEntries(heroStatKeys.map((key) => [key, 8]));
    hero.skills = {};
  }
  const offered = world.quests[world.board[0] as Quest['id']] as Quest;
  const quest: Quest = { ...structuredClone(offered), difficulty: 40, reward: 200, fameEffect: 3, encounterKeys: keys, lootTableKey: null }; // no Loot draws (M5-S5): these tests count the reroll's
  const party: Party = {
    id: makeId('parties', 99),
    questId: quest.id,
    guildId: guild.id,
    heroIds: heroes.map((hero) => hero.id),
    departedOnTurn: 0,
    returnsOnTurn: 5,
  };
  for (const [definitionKey, quantity] of carried) addStack(world, definitionKey, quantity, { kind: 'party', id: party.id });
  return { world, heroes, quest, party, deps, twin: structuredClone(streamOf(world, 'quests')) };
}

/** The roll a draw `r` gives a capability of `capable` under `variance`, as the Check makes it. */
const rollOf = (capable: number, r: number, variance: number): number => Math.max(0, capable * (1 + (r * 2 - 1) * variance));

/** The carried stack of `definitionKey` in `scene`. */
function stackOf({ world, party }: Scene, definitionKey: string) {
  const stack = Object.values(world.stacks).find((it) => it.definitionKey === definitionKey && it.holder.kind === 'party' && it.holder.id === party.id);
  if (stack === undefined) throw new Error(`The Party carries no ${definitionKey}`);
  return stack;
}

const ford = encounter('ford', 'travel', false);
const fordPassed = encounter('ford-passed', 'travel', true);
const ambush = encounter('ambush', 'combat', true);
const ambushFailed = encounter('ambush-failed', 'combat', false);

describe('a reroll', () => {
  // M5-S3's first box, in the Quest Engine: questsConclude.test.ts holds it gone from the world after.
  test('turns exactly one failure into a second roll: one more draw from quests, straight after the first, and it is used up', () => {
    const variance = 0.5;
    const s = scene('reroll', contentWith([ford]), ['ford', 'ford'], [['grappling-line', 1]], { overrides: { checkVariance: variance } });
    const capable = capability(s.heroes, ford, s.world, s.deps);
    const [first, second, third] = [next(s.twin), next(s.twin), next(s.twin)].map((r) => rollOf(capable, r, variance)) as [number, number, number];

    const { encounters, consumables } = resolveQuest(s.world, s.quest, s.party, s.deps);

    // The first Encounter failed on the first draw and was rolled again on the second; the second
    // Encounter, failed too, had nothing left to roll it again.
    expect(encounters.map((it) => [it.roll, it.outcome])).toEqual([
      [second, 'failure'],
      [third, 'failure'],
    ]);
    expect(consumables).toEqual([
      { stackId: stackOf(s, 'grappling-line').id, definitionKey: 'grappling-line', effect: 'reroll', encounterIndex: 0, firstRoll: first },
    ]);
    expect(streamOf(s.world, 'quests')).toEqual(s.twin);
  });

  test('stands on the second roll, which may succeed: the consequences are its outcome\'s', () => {
    const variance = 0.5;
    const fame = (delta: number): Consequence[] => [{ kind: 'fame', delta }];
    // A seed whose first draw rolls below its second, so a target between them fails, then succeeds.
    const found = Array.from({ length: 20 }, (_, n) => `turned-${n}`).find((seed) => {
      const { twin } = scene(seed, contentWith([ford]), ['ford'], []);
      return next(twin) < next(twin);
    });
    if (found === undefined) throw new Error('No seed rolls up');
    const probe = scene(found, contentWith([ford]), ['ford'], [], { overrides: { checkVariance: variance } });
    const capable = capability(probe.heroes, ford, probe.world, probe.deps);
    const first = rollOf(capable, next(probe.twin), variance);
    const second = rollOf(capable, next(probe.twin), variance);
    const between = { ...encounter('between', 'travel', false, fame(-5), fame(1)), difficultyFactor: (first + second) / 2 / 40 };
    const without = scene(found, contentWith([between]), ['between'], [], { overrides: { checkVariance: variance } });
    const within = scene(found, contentWith([between]), ['between'], [['grappling-line', 1]], { overrides: { checkVariance: variance } });

    const bare = resolveQuest(without.world, without.quest, without.party, without.deps);
    const carried = resolveQuest(within.world, within.quest, within.party, within.deps);

    expect(bare.encounters[0]).toMatchObject({ roll: first, outcome: 'failure' });
    expect(bare.outcome).toMatchObject({ band: 'fail', fameDelta: -3 - 5 });
    expect(carried.encounters[0]).toMatchObject({ roll: second, outcome: 'success' });
    expect(carried.outcome).toMatchObject({ band: 'strong', fameDelta: 3 + 1 });
    expect(carried.consumables).toMatchObject([{ effect: 'reroll', encounterIndex: 0, firstRoll: first }]);
  });

  test('is kept, and draws nothing, on a Check that succeeds or an Encounter of another kind', () => {
    const s = scene('kept', contentWith([fordPassed, ambushFailed]), ['ford-passed', 'ambush-failed'], [['grappling-line', 1]]);

    const { encounters, consumables } = resolveQuest(s.world, s.quest, s.party, s.deps);

    expect(encounters.map((it) => it.outcome)).toEqual(['success', 'failure']);
    expect(consumables).toEqual([]);
    next(s.twin);
    next(s.twin);
    expect(streamOf(s.world, 'quests')).toEqual(s.twin);
  });

  test('rolls an Encounter again once, however many are carried: the next Item waits for the next failure', () => {
    const s = scene('twice', contentWith([ford]), ['ford', 'ford', 'ford'], [['grappling-line', 2]]);

    const { consumables } = resolveQuest(s.world, s.quest, s.party, s.deps);

    expect(consumables.map((use) => [use.effect, 'encounterIndex' in use ? use.encounterIndex : null])).toEqual([
      ['reroll', 0],
      ['reroll', 1],
    ]);
    for (let draw = 0; draw < 3 + 2; draw += 1) next(s.twin);
    expect(streamOf(s.world, 'quests')).toEqual(s.twin);
  });
});

describe('a bonus', () => {
  test('adds its flat to the capability of the first Check of its kinds, one Item a Check, whatever the outcome, and draws nothing', () => {
    const s = scene('bonus', contentWith([ambush, fordPassed]), ['ambush', 'ford-passed', 'ambush', 'ambush'], [['whetstone', 2]]);
    const capable = capability(s.heroes, ambush, s.world, s.deps);
    const travel = capability(s.heroes, fordPassed, s.world, s.deps);

    const { encounters, consumables } = resolveQuest(s.world, s.quest, s.party, s.deps);

    // Variance 0: the roll is the capability, the bonus in it.
    expect(encounters.map((it) => it.roll)).toEqual([capable + 3, travel, capable + 3, capable]);
    const stackId = stackOf(s, 'whetstone').id;
    expect(consumables).toEqual([
      { stackId, definitionKey: 'whetstone', effect: 'bonus', encounterIndex: 0, flat: 3 },
      { stackId, definitionKey: 'whetstone', effect: 'bonus', encounterIndex: 2, flat: 3 },
    ]);
    for (let draw = 0; draw < 4; draw += 1) next(s.twin);
    expect(streamOf(s.world, 'quests')).toEqual(s.twin);
  });

  test('a reroll rolls the capability with the bonus in it again (DL-50 items 4 and 5)', () => {
    const variance = 0.5;
    const shadow = encounter('shadow', 'stealth', false);
    const s = scene('honed-reroll', contentWith([shadow]), ['shadow'], [['lockpicks', 1], ['grappling-line', 1]], { overrides: { checkVariance: variance } });
    const capable = capability(s.heroes, shadow, s.world, s.deps);
    const [first, second] = [next(s.twin), next(s.twin)].map((r) => rollOf(capable + 3, r, variance)) as [number, number];

    const { encounters, consumables } = resolveQuest(s.world, s.quest, s.party, s.deps);

    expect(encounters.map((it) => [it.roll, it.outcome])).toEqual([[second, 'failure']]);
    expect(consumables).toEqual([
      { stackId: stackOf(s, 'lockpicks').id, definitionKey: 'lockpicks', effect: 'bonus', encounterIndex: 0, flat: 3 },
      { stackId: stackOf(s, 'grappling-line').id, definitionKey: 'grappling-line', effect: 'reroll', encounterIndex: 0, firstRoll: first },
    ]);
  });

  test('can turn a failure into a success, and a reroll then rolls the same capability again', () => {
    const tight = { ...encounter('tight', 'combat', false), difficultyFactor: 0 };
    const s0 = scene('tight', contentWith([tight]), ['tight'], []);
    const capable = capability(s0.heroes, tight, s0.world, s0.deps);
    // A target just above the capability: failed bare, met with a whetstone's 3.
    const edge = { ...tight, difficultyFactor: (capable + 1) / 40 };
    const bare = scene('tight', contentWith([edge]), ['tight'], []);
    const honed = scene('tight', contentWith([edge]), ['tight'], [['whetstone', 1]]);

    expect(resolveQuest(bare.world, bare.quest, bare.party, bare.deps).encounters[0]?.outcome).toBe('failure');
    const resolved = resolveQuest(honed.world, honed.quest, honed.party, honed.deps);
    expect(resolved.encounters[0]).toMatchObject({ roll: capable + 3, outcome: 'success' });
  });
});

describe('a heal', () => {
  const graze: InjuryType = { key: 'graze', name: 'Graze', healDaysMin: 1, healDaysMax: 1, leavesTrait: null };
  const hurt = (typeKey: string, count: number): Encounter =>
    encounter(`hurt-${typeKey}`, 'combat', false, [{ kind: 'injury', typeKey, chance: 1, count }]);

  test('shortens the longest Injury by its Days, the strongest heal first, to no fewer than 1, one Item an Injury, and draws nothing', () => {
    const content = contentWith([hurt('deep-cut', 3)]);
    const bare = scene('heal', content, ['hurt-deep-cut'], []);
    const kept = scene('heal', content, ['hurt-deep-cut'], [
      ['healing-draught', 1],
      ['physicians-kit', 1],
    ]);

    const before = resolveQuest(bare.world, bare.quest, bare.party, bare.deps).outcome.injuries;
    const { outcome, consumables } = resolveQuest(kept.world, kept.quest, kept.party, kept.deps);

    expect(before).toHaveLength(3);
    // Longest first, ties to the first taken: the kit's 10 Days on it, the draught's 5 on the next.
    const ranked = before.map((injury, order) => ({ ...injury, order })).sort((a, b) => b.healDays - a.healDays || a.order - b.order);
    const [longest, next2, last] = ranked as [(typeof ranked)[number], (typeof ranked)[number], (typeof ranked)[number]];
    const expected = before.map((injury) => ({ ...injury }));
    (expected[longest.order] as { healDays: number }).healDays = Math.max(1, longest.healDays - 10);
    (expected[next2.order] as { healDays: number }).healDays = Math.max(1, next2.healDays - 5);
    expect(outcome.injuries).toEqual(expected);
    expect(outcome.injuries[last.order]).toEqual(before[last.order]);
    expect(consumables).toEqual([
      { stackId: stackOf(kept, 'physicians-kit').id, definitionKey: 'physicians-kit', effect: 'heal', heroId: longest.heroId, days: longest.healDays - Math.max(1, longest.healDays - 10) },
      { stackId: stackOf(kept, 'healing-draught').id, definitionKey: 'healing-draught', effect: 'heal', heroId: next2.heroId, days: next2.healDays - Math.max(1, next2.healDays - 5) },
    ]);
    expect(streamOf(kept.world, 'quests')).toEqual(streamOf(bare.world, 'quests'));
  });

  test('is kept when no Injury is left to shorten: none taken, each treated already, or one at 1 Day', () => {
    const content = contentWith([hurt('deep-cut', 1), hurt('graze', 1), ambush], [graze]);
    const unhurt = scene('none', content, ['ambush'], [['healing-draught', 2]]);
    const once = scene('once', content, ['hurt-deep-cut'], [['healing-draught', 3]], { size: 1 });
    const grazed = scene('grazed', content, ['hurt-graze'], [['healing-draught', 1]], { size: 1 });

    expect(resolveQuest(unhurt.world, unhurt.quest, unhurt.party, unhurt.deps).consumables).toEqual([]);
    expect(resolveQuest(once.world, once.quest, once.party, once.deps).consumables).toHaveLength(1);
    const graze1 = resolveQuest(grazed.world, grazed.quest, grazed.party, grazed.deps);
    expect(graze1.outcome.injuries).toMatchObject([{ typeKey: 'graze', healDays: 1 }]);
    expect(graze1.consumables).toEqual([]);
  });

  test('leaves an Injury shorter than its Days at 1 Day, not 0, and records the Days it took off', () => {
    const bruise: InjuryType = { key: 'bruise', name: 'Bruise', healDaysMin: 3, healDaysMax: 3, leavesTrait: null };
    const content = contentWith([hurt('bruise', 1)], [bruise]);
    const s = scene('bruised', content, ['hurt-bruise'], [['healing-draught', 1]], { size: 1 });

    const { outcome, consumables } = resolveQuest(s.world, s.quest, s.party, s.deps);

    expect(outcome.injuries).toMatchObject([{ typeKey: 'bruise', healDays: 1 }]);
    expect(consumables).toEqual([
      { stackId: stackOf(s, 'healing-draught').id, definitionKey: 'healing-draught', effect: 'heal', heroId: s.heroes[0]?.id, days: 2 },
    ]);
  });

  test('shortens an Injury after the infirmary, and never the Injury of a Hero who then died', () => {
    const deadly = encounter('deadly', 'combat', false, [{ kind: 'death', chance: 1 }]);
    const content = contentWith([hurt('broken-arm', 1), deadly]);
    const bare = scene('after', content, ['hurt-broken-arm'], [], { size: 1 });
    const kept = scene('after', content, ['hurt-broken-arm'], [['healing-draught', 1]], { size: 1 });
    bare.world.guilds[bare.party.guildId]!.hall.infirmary = 2;
    kept.world.guilds[kept.party.guildId]!.hall.infirmary = 2;
    const killed = scene('killed', content, ['hurt-broken-arm', 'deadly'], [['healing-draught', 1]], { size: 1 });

    const [infirmed] = resolveQuest(bare.world, bare.quest, bare.party, bare.deps).outcome.injuries;
    const [healed] = resolveQuest(kept.world, kept.quest, kept.party, kept.deps).outcome.injuries;
    const dead = resolveQuest(killed.world, killed.quest, killed.party, killed.deps);

    expect(healed?.healDays).toBe(Math.max(1, (infirmed?.healDays ?? NaN) - 5));
    expect(dead.outcome.injuries).toEqual([]);
    expect(dead.consumables).toEqual([]);
  });
});

describe('what a Party carries', () => {
  test('changes nothing when it is nothing, or a stack that is not a consumable', () => {
    const content = contentWith([ford, ambush, hurt()]);
    const keys = ['ambush', 'ford', 'hurt-deep-cut'];
    const bare = scene('carry', content, keys, []);
    const odd = scene('carry', content, keys, [['padded-jack', 1], ['no-such-item', 2]]);

    const expected = resolveQuest(bare.world, bare.quest, bare.party, bare.deps);
    expect(expected.consumables).toEqual([]);
    expect(resolveQuest(odd.world, odd.quest, odd.party, odd.deps)).toEqual(expected);
    expect(streamOf(odd.world, 'quests')).toEqual(streamOf(bare.world, 'quests'));

    function hurt(): Encounter {
      return encounter('hurt-deep-cut', 'combat', false, [{ kind: 'injury', typeKey: 'deep-cut', chance: 1, count: 1 }]);
    }
  });
});

// M4's third risk, held for the Party's consumables as for the Check (DL-50 item 3).
describe('consumables.ts', () => {
  test('never mentions the Guildmaster', () => {
    const source = readFileSync(fileURLToPath(new URL('./consumables.ts', import.meta.url)), 'utf8');
    expect(source.toLowerCase()).not.toContain('guildmaster');
  });
});
