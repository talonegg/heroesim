import { describe, expect, test } from 'vitest';
import { defaultConfig, type EngineDeps, type GameConfig } from '../config.js';
import type { Class, Consequence, ContentSet, Encounter, EncounterKind, InjuryType, ItemDefinition, SetQuery } from '../content-types.js';
import type { Hero, Party, Quest, World } from '../document.js';
import { streamOf, type Stream } from '../generators/draw.js';
import { addStack } from '../items.js';
import { next } from '../rng.js';
import { demandsCheck, encounterCapability as capability, testContent, testDeps, withFactor } from '../world.test-support.js';
import { resolveQuest, type QuestInjury } from './resolve.js';
import { scene as sharedScene } from './resolve.test-support.js';

// DL-50: the consumables a Party carries, used as the Quest Engine resolves its sequence. A
// created world's player Guild sends its Roster, every Stat set to 8, on a Quest whose Encounters a
// test writes into content, carrying the stacks a test gives the Party.

const pinned: Partial<GameConfig> = {
  rivalCount: 0,
  checkVariance: 0,
  skillBonusPerRating: 2,
  bandBySuccessShare: { successAbove: 0.5, strongAtLeast: 1 },
  // DL-148's Degrees, as these Quests were written under; the defaults have moved since (DL-166).
  checkDegrees: { triumph: 1.25, success: 1, setback: 0.75 },
  strongTriumphShare: 0.5,
  xpPerDifficultyPoint: 1,
  xpBandFactor: { fail: 0.5, success: 1, strong: 1 },
  infirmaryHealFactor: [1, 1 / 2, 1 / 3],
  // Every Tier's Death at a scale of 1, as these Quests' Deaths were written before Tiers (DL-265).
  tiers: defaultConfig.tiers.map((tier) => ({ ...tier, deathScale: 1 })),
  // No Fatigue on form or harm, as these Quests' capabilities were worked out before it acted (DL-284).
  fatigueScaling: 0,
};

/** An Encounter keyed `key` of `kind`: Strength, `sum`, no Skills, which `pass` or fail any Party of 8s. */
function encounter(key: string, kind: EncounterKind, pass: boolean, failure: Consequence[] = [], success: Consequence[] = []): Encounter {
  return {
    key,
    name: key,
    kind,
    checks: [demandsCheck(key, key, 'sum', [['strength', 1]], [], pass ? 0.001 : 1000)],
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
 * The shared Quest scene (resolve.test-support.ts) of the player's first `size` Heroes on a Quest of
 * difficulty 40 through `keys`, carrying `carried` (definition key and quantity), under this file's pinned
 * config and `overrides`, with no Loot: these tests count the reroll's draws.
 */
function scene(
  seed: string,
  content: ContentSet,
  keys: string[],
  carried: [string, number][],
  { size = 3, overrides = {} }: { size?: number; overrides?: Partial<GameConfig> } = {},
): Scene {
  const shared = sharedScene(seed, content, keys, { size });
  const deps = testDeps({ ...pinned, ...overrides }, content);
  const { world, heroes, quest, party } = shared;
  quest.lootTableKey = null;
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
  // The first acceptance box, in the Quest Engine: questsConclude.test.ts holds it gone from the world after.
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
    const between = withFactor(encounter('between', 'travel', false, fame(-5), fame(1)), (first + second) / 2 / 40);
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
  test('adds its flat to the capability of each Encounter of its kinds, one Item an Encounter till none is left, whatever the outcome, and draws nothing', () => {
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
    const tight = withFactor(encounter('tight', 'combat', false), 0);
    const s0 = scene('tight', contentWith([tight]), ['tight'], []);
    const capable = capability(s0.heroes, tight, s0.world, s0.deps);
    // A target just above the capability: failed bare, met with a whetstone's 3.
    const edge = withFactor(tight, (capable + 1) / 40);
    const bare = scene('tight', contentWith([edge]), ['tight'], []);
    const honed = scene('tight', contentWith([edge]), ['tight'], [['whetstone', 1]]);

    expect(resolveQuest(bare.world, bare.quest, bare.party, bare.deps).encounters[0]?.outcome).toBe('failure');
    const resolved = resolveQuest(honed.world, honed.quest, honed.party, honed.deps);
    expect(resolved.encounters[0]).toMatchObject({ roll: capable + 3, outcome: 'success' });
  });
});

// DL-280 item 4, Q15 a; DL-285: a heal Item is spent at the moment of an Injury, the one healing most
// Days first, and relieves `healItemHurtRelief` of the hurt's gap for the rest of the Quest; it still
// shortens the Injury, which the return applies.
describe('a heal', () => {
  const graze: InjuryType = { key: 'graze', name: 'Graze', healDaysMin: 1, healDaysMax: 1, leavesTrait: null };
  const hurt = (typeKey: string, count: number, among?: SetQuery): Encounter =>
    encounter(`hurt-${typeKey}`, 'combat', false, [{ kind: 'injury', typeKey, chance: 1, count, ...(among === undefined ? {} : { among }) }]);
  /** An arcane Encounter, which no Synergy of the test content's touches, of the Party's summed Strength, which no Party of 8s meets and which harms no one. */
  const lift = encounter('lift', 'arcane', false);

  test('is spent at each Injury as it is taken, the strongest heal first, one Item an Injury, naming its Encounter, and draws nothing', () => {
    const content = contentWith([hurt('deep-cut', 3)]);
    const bare = scene('heal', content, ['hurt-deep-cut'], []);
    const kept = scene('heal', content, ['hurt-deep-cut'], [
      ['healing-draught', 1],
      ['physicians-kit', 1],
    ]);

    const before = resolveQuest(bare.world, bare.quest, bare.party, bare.deps).outcome.injuries;
    const { outcome, consumables } = resolveQuest(kept.world, kept.quest, kept.party, kept.deps);

    expect(before).toHaveLength(3);
    // In the order taken: the kit's 10 Days on the first, the draught's 5 on the second, none left for the third.
    const [first, second, third] = before as [QuestInjury, QuestInjury, QuestInjury];
    expect(outcome.injuries).toEqual([
      { ...first, healDays: Math.max(1, first.healDays - 10) },
      { ...second, healDays: Math.max(1, second.healDays - 5) },
      third,
    ]);
    expect(consumables).toEqual([
      { stackId: stackOf(kept, 'physicians-kit').id, definitionKey: 'physicians-kit', effect: 'heal', heroId: first.heroId, days: first.healDays - Math.max(1, first.healDays - 10), encounterIndex: 0 },
      { stackId: stackOf(kept, 'healing-draught').id, definitionKey: 'healing-draught', effect: 'heal', heroId: second.heroId, days: second.healDays - Math.max(1, second.healDays - 5), encounterIndex: 0 },
    ]);
    expect(streamOf(kept.world, 'quests')).toEqual(streamOf(bare.world, 'quests'));
  });

  test('is spent at the Encounter of the Injury, a later Injury taking the next', () => {
    const content = contentWith([hurt('deep-cut', 1), lift]);
    const s = scene('later', content, ['lift', 'hurt-deep-cut', 'lift', 'hurt-deep-cut'], [['healing-draught', 3]], { size: 2 });

    const { outcome, consumables } = resolveQuest(s.world, s.quest, s.party, s.deps);

    expect(outcome.injuries).toHaveLength(2);
    expect(consumables.map((use) => use.effect === 'heal' && [use.heroId, use.encounterIndex])).toEqual(outcome.injuries.map((injury, at) => [injury.heroId, [1, 3][at]]));
  });

  test('is kept when no Injury is taken, and spent on one at 1 Day for its relief, taking no Day off', () => {
    const content = contentWith([hurt('graze', 1), ambush], [graze]);
    const unhurt = scene('none', content, ['ambush'], [['healing-draught', 2]]);
    const grazed = scene('grazed', content, ['hurt-graze'], [['healing-draught', 1]], { size: 1 });

    expect(resolveQuest(unhurt.world, unhurt.quest, unhurt.party, unhurt.deps).consumables).toEqual([]);
    const graze1 = resolveQuest(grazed.world, grazed.quest, grazed.party, grazed.deps);
    expect(graze1.outcome.injuries).toMatchObject([{ typeKey: 'graze', healDays: 1 }]);
    expect(graze1.consumables).toEqual([
      { stackId: stackOf(grazed, 'healing-draught').id, definitionKey: 'healing-draught', effect: 'heal', heroId: grazed.heroes[0]?.id, days: 0, encounterIndex: 0 },
    ]);
  });

  test('leaves an Injury shorter than its Days at 1 Day, not 0, and records the Days it took off', () => {
    const bruise: InjuryType = { key: 'bruise', name: 'Bruise', healDaysMin: 3, healDaysMax: 3, leavesTrait: null };
    const content = contentWith([hurt('bruise', 1)], [bruise]);
    const s = scene('bruised', content, ['hurt-bruise'], [['healing-draught', 1]], { size: 1 });

    const { outcome, consumables } = resolveQuest(s.world, s.quest, s.party, s.deps);

    expect(outcome.injuries).toMatchObject([{ typeKey: 'bruise', healDays: 1 }]);
    expect(consumables).toEqual([
      { stackId: stackOf(s, 'healing-draught').id, definitionKey: 'healing-draught', effect: 'heal', heroId: s.heroes[0]?.id, days: 2, encounterIndex: 0 },
    ]);
  });

  test('shortens an Injury after the infirmary; spent on a Hero who then dies, it is lost with them (DL-280)', () => {
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
    expect(dead.outcome.deaths).toEqual([killed.heroes[0]?.id]);
    expect(dead.outcome.injuries).toEqual([]);
    expect(dead.consumables).toEqual([expect.objectContaining({ definitionKey: 'healing-draught', effect: 'heal', heroId: killed.heroes[0]?.id, encounterIndex: 0 })]);
  });

  // The gap with neither, either and both, as the resolver meets it: a Warrior hurt at the first
  // Encounter brings 8 × 0.6, 8 × 0.8, 8 × 0.8 or 8 × 0.9 Strength to the next, beside a Healer's 8.
  test("relieves half the hurt's gap for the rest of the Quest, and with a Healer in the Party the two multiply", () => {
    const warriors: SetQuery = ['where', 'party', ['class', 'warrior']];
    const content = contentWith([hurt('deep-cut', 1, warriors), lift]);
    const marked: ContentSet = { ...content, classes: { ...content.classes, healer: { ...(content.classes['healer'] as Class), relievesHurt: true } } };
    // No teamwork, so the capability is the summed formed Strength alone.
    const overrides = { hurtCheckFactor: 0.6, healerHurtRelief: 0.5, healItemHurtRelief: 0.5, teamworkRange: 0 };
    /** The capability of the Encounter after the Injury, for a Warrior and a Healer, under `over`'s content, carrying `carried`. */
    const after = (over: ContentSet, carried: [string, number][]) => {
      const s = scene('relief', over, ['hurt-deep-cut', 'lift'], carried, { size: 2, overrides });
      const [warrior, healer] = s.heroes as [Hero, Hero];
      warrior.classKey = 'warrior';
      healer.classKey = 'healer';
      for (const hero of s.heroes) hero.morale = s.deps.config.moraleBaseline;
      const resolved = resolveQuest(s.world, s.quest, s.party, s.deps);
      expect(resolved.outcome.injuries.map((injury) => injury.heroId)).toEqual([warrior.id]);
      return resolved.encounters[1]?.checks[0]?.capability ?? NaN;
    };

    expect(after(content, [])).toBeCloseTo(8 + 8 * 0.6, 9);
    expect(after(marked, [])).toBeCloseTo(8 + 8 * 0.8, 9);
    expect(after(content, [['healing-draught', 1]])).toBeCloseTo(8 + 8 * 0.8, 9);
    expect(after(marked, [['healing-draught', 1]])).toBeCloseTo(8 + 8 * 0.9, 9);
  });

  test('of two heals healing the same Days, spends the first by key', () => {
    const content = contentWith([hurt('deep-cut', 1)]);
    const draught = content.items['healing-draught'] as ItemDefinition;
    const tied: ContentSet = { ...content, items: { ...content.items, 'field-dressing': { ...draught, key: 'field-dressing', name: 'Field dressing' } } };
    const s = scene('tied', tied, ['hurt-deep-cut'], [['healing-draught', 1], ['field-dressing', 1]], { size: 1 });

    expect(resolveQuest(s.world, s.quest, s.party, s.deps).consumables.map((use) => use.definitionKey)).toEqual(['field-dressing']);
  });

  // A Healer relieves on each Encounter they are among the living for, not from the Injury on
  // (DL-285): hurt at the first, the Warrior brings 8 × 0.8 to the second beside the Healer's 8, and
  // with the Healer fallen there, 8 × 0.6 to the third.
  test('a Healer relieves only while among the living: one who falls relieves no one after', () => {
    const warriors: SetQuery = ['where', 'party', ['class', 'warrior']];
    const healers: SetQuery = ['where', 'party', ['class', 'healer']];
    // Arcane, as `lift` is, so that no Synergy of the test content's adds to the capabilities.
    const cut = encounter('cut', 'arcane', false, [{ kind: 'injury', typeKey: 'deep-cut', chance: 1, count: 1, among: warriors }]);
    const fall = encounter('fall', 'arcane', false, [{ kind: 'death', chance: 1, among: healers }]);
    const base = contentWith([cut, fall, lift]);
    const content: ContentSet = { ...base, classes: { ...base.classes, healer: { ...(base.classes['healer'] as Class), relievesHurt: true } } };
    const overrides = { hurtCheckFactor: 0.6, healerHurtRelief: 0.5, healItemHurtRelief: 0.5, teamworkRange: 0 };
    const s = scene('fallen', content, ['cut', 'fall', 'lift'], [], { size: 2, overrides });
    const [warrior, healer] = s.heroes as [Hero, Hero];
    warrior.classKey = 'warrior';
    healer.classKey = 'healer';
    for (const hero of s.heroes) hero.morale = s.deps.config.moraleBaseline;

    const resolved = resolveQuest(s.world, s.quest, s.party, s.deps);

    expect(resolved.outcome.injuries.map((injury) => injury.heroId)).toEqual([warrior.id]);
    expect(resolved.outcome.deaths).toEqual([healer.id]);
    expect(resolved.encounters.map((it) => it.checks[0]?.capability)).toEqual([16, expect.closeTo(8 + 8 * 0.8, 9), expect.closeTo(8 * 0.6, 9)]);
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

// DL-148 items 7 and 13: on an Encounter of several Checks, a bonus adds to every one of
// them, one Item for the Encounter; a reroll rolls again each Check of a failed Encounter that fell
// short of Success, one draw each in the order listed, and the new rolls stand.
describe('on an Encounter of several Checks', () => {
  /** A Check keyed `key` of the Party's summed Strength, which any Party of 8s meets (`pass`) or misses. */
  const strength = (key: string, pass: boolean) => demandsCheck(key, key, 'sum', [['strength', 1]], [], pass ? 0.001 : 1000);
  /** An Encounter keyed `key` of `kind`: a met Check `met`, then a missed one `missed` and another `also`, all three needed. */
  const threefold = (key: string, kind: EncounterKind): Encounter => ({
    key,
    name: key,
    kind,
    checks: [strength('met', true), strength('missed', false), strength('also', false)],
    pass: ['and', 'met', 'missed', 'also'],
    consequences: { success: [], failure: [] },
  });

  test('a reroll rolls again each Check that fell short of Success, one draw each after the three, and the rolls stand', () => {
    const variance = 0.5;
    const pass = threefold('crossing', 'travel');
    const s = scene('several-reroll', contentWith([pass]), ['crossing'], [['grappling-line', 1]], { overrides: { checkVariance: variance } });
    const capable = capability(s.heroes, ford, s.world, s.deps);
    const [met, missed, also, missedAgain, alsoAgain] = Array.from({ length: 5 }, () => rollOf(capable, next(s.twin), variance)) as number[];

    const [result] = resolveQuest(s.world, s.quest, s.party, s.deps).encounters;

    expect(result?.checks.map((it) => it.roll)).toEqual([met, missedAgain, alsoAgain]);
    expect(result).toMatchObject({ decidedBy: 'missed', degree: 'failure', roll: missedAgain });
    expect(missed).not.toBe(missedAgain);
    expect(also).not.toBe(alsoAgain);
    expect(streamOf(s.world, 'quests')).toEqual(s.twin);
  });

  test("a reroll records the deciding Check's failed roll, and is kept, drawing nothing, when the Encounter succeeds", () => {
    const variance = 0.5;
    const either: Encounter = { ...threefold('either', 'travel'), pass: ['or', 'missed', 'met', 'also'] };
    const both = threefold('both', 'travel');
    const s = scene('several-kept', contentWith([either, both]), ['either', 'both'], [['grappling-line', 1]], { overrides: { checkVariance: variance } });
    const capable = capability(s.heroes, ford, s.world, s.deps);
    const rolls = Array.from({ length: 3 + 3 }, () => rollOf(capable, next(s.twin), variance));

    const { encounters, consumables } = resolveQuest(s.world, s.quest, s.party, s.deps);

    expect(encounters.map((it) => it.degree === 'success' || it.degree === 'triumph')).toEqual([true, false]);
    expect(consumables).toMatchObject([{ effect: 'reroll', encounterIndex: 1, firstRoll: rolls[4] }]);
    next(s.twin);
    next(s.twin);
    expect(streamOf(s.world, 'quests')).toEqual(s.twin);
  });

  test('a bonus adds its flat to every Check of the Encounter, one Item for them all (DL-148 item 13)', () => {
    const fight = threefold('fight', 'combat');
    const s = scene('several-bonus', contentWith([fight]), ['fight', 'fight'], [['whetstone', 1]]);
    const capable = capability(s.heroes, ambush, s.world, s.deps);

    const { encounters, consumables } = resolveQuest(s.world, s.quest, s.party, s.deps);

    // Variance 0: each roll is the capability, the bonus in it on the first Encounter only.
    expect(encounters.map((it) => it.checks.map((each) => each.capability))).toEqual([
      [capable + 3, capable + 3, capable + 3],
      [capable, capable, capable],
    ]);
    expect(consumables).toEqual([{ stackId: stackOf(s, 'whetstone').id, definitionKey: 'whetstone', effect: 'bonus', encounterIndex: 0, flat: 3 }]);
  });
});
