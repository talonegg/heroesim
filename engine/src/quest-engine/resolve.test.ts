import { describe, expect, test } from 'vitest';
import { defaultConfig, type EngineDeps } from '../config.js';
import {
  degrees,
  type Consequence,
  type ContentSet,
  type Degree,
  type Encounter,
  type EncounterCheck,
  type InjuryConsequence,
  type HeroTraitEffect,
  type PassFormula,
  type SetQuery,
  type TraitConsequence,
} from '../content-types.js';
import { createWorld } from '../create.js';
import { addStack } from '../items.js';
import { makeId, type Guild, type Hero, type Party, type Quest, type World } from '../document.js';
import { streamOf } from '../generators/draw.js';
import { chance, int, next } from '../rng.js';
import { playerGuild } from '../selectors.js';
import { encounterCapability as capability, heroStatKeys, oldFormCheck, testContent, testDeps, withFactor } from '../world.test-support.js';
import { capability as checkCapability } from './check.js';
import { drawLoot } from './loot.js';
import { queryParty } from './query.js';
import { questBand, resolveQuest } from './resolve.js';
import { synergyBonus } from './synergy.js';
import { teamwork } from './teamwork.js';

// M4-S2: a Quest resolved as its sequence of Encounters (DL-42). A created world's player Guild
// sends its Roster, every Stat set to 8, on a Quest whose Encounters a test writes into content.

const setup = { guildmasterName: 'Ada', guildName: 'The Test', createdAt: 'test' };
const pinned = {
  rivalCount: 0,
  checkVariance: 0,
  skillBonusPerRating: 2,
  bandBySuccessShare: { successAbove: 0.5, strongAtLeast: 1 },
  // v1.1.4-S2's Degrees and S3's form factors, which these scenes' numbers were worked out under;
  // S10's balance pass moved the defaults (DL-166).
  checkDegrees: { triumph: 1.25, success: 1, setback: 0.75 },
  strongTriumphShare: 0.5,
  moraleCheckFactor: { wretched: 0.85, low: 0.93, steady: 1, high: 1.04, elated: 1.08 },
  hurtCheckFactor: 0.85,
  xpPerDifficultyPoint: 1,
  xpBandFactor: { fail: 0.5, success: 1, strong: 1 },
  infirmaryHealFactor: [1, 1 / 2, 1 / 3],
};

/** An Encounter keyed `key`: one Stat, `sum`, no Skills, which `pass` or fail any Party of 8s, with `success`/`failure`. */
function encounter(key: string, pass: boolean, failure: Consequence[] = [], success: Consequence[] = []): Encounter {
  return {
    key,
    name: key,
    kind: 'combat',
    checks: [oldFormCheck(key, key, 'sum', [['strength', 1]], [], pass ? 0.001 : 1000)],
    consequences: { success, failure },
  };
}

/** The test content with `encounters` beside its own. */
function contentWith(...encounters: Encounter[]): ContentSet {
  return { ...testContent, encounters: { ...testContent.encounters, ...Object.fromEntries(encounters.map((it) => [it.key, it])) } };
}

interface Scene {
  world: World;
  guild: Guild;
  heroes: Hero[];
  quest: Quest;
  party: Party;
  deps: EngineDeps;
}

/**
 * The player's first `size` Heroes, Stats all 8, sent through `keys` on a Quest of `difficulty`. A
 * `size` above the starting Roster's 4 starts the Roster with `size` Heroes.
 */
function scene(seed: string, content: ContentSet, keys: string[], { size = 3, difficulty = 40 } = {}): Scene {
  const deps = testDeps({ ...pinned, ...(size > 4 ? { startingRosterSize: size } : {}) }, content);
  const { world } = createWorld(seed, setup, deps).document;
  const guild = playerGuild(world) as Guild;
  const heroes = guild.rosterIds.slice(0, size).map((id) => world.heroes[id] as Hero);
  for (const hero of heroes) {
    hero.stats = Object.fromEntries(heroStatKeys.map((key) => [key, 8]));
    hero.skills = {};
  }
  const offered = world.quests[world.board[0] as Quest['id']] as Quest;
  const quest: Quest = { ...structuredClone(offered), difficulty, reward: 200, fameEffect: 3, encounterKeys: keys };
  const party: Party = {
    id: makeId('parties', 99),
    questId: quest.id,
    guildId: guild.id,
    heroIds: heroes.map((hero) => hero.id),
    departedOnTurn: 0,
    returnsOnTurn: 5,
  };
  return { world, guild, heroes, quest, party, deps };
}

describe('questBand', () => {
  const config = { bandBySuccessShare: { successAbove: 0.5, strongAtLeast: 1 }, strongTriumphShare: 0.5 };
  /** The band with every Encounter at Success or better a Triumph: the share of Triumphs is never short. */
  const allTriumphs = (successes: number, count: number, using: Parameters<typeof questBand>[3] = config) =>
    questBand(successes, successes, count, using);

  test('is strong when every Encounter succeeded, success for a majority, and fail for half or fewer', () => {
    expect([0, 1, 2].map((n) => allTriumphs(n, 2))).toEqual(['fail', 'fail', 'strong']);
    expect([0, 1, 2, 3].map((n) => allTriumphs(n, 3))).toEqual(['fail', 'fail', 'success', 'strong']);
    expect([0, 1, 2, 3, 4].map((n) => allTriumphs(n, 4))).toEqual(['fail', 'fail', 'fail', 'success', 'strong']);
    expect([2, 3, 4, 5].map((n) => allTriumphs(n, 5))).toEqual(['fail', 'success', 'success', 'strong']);
  });

  test('reads bandBySuccessShare, and no Encounters is a share of 0', () => {
    const lenient = { bandBySuccessShare: { successAbove: 0.3, strongAtLeast: 0.75 }, strongTriumphShare: 0.5 };
    expect([1, 2, 3, 4].map((n) => allTriumphs(n, 4, lenient))).toEqual(['fail', 'success', 'strong', 'strong']);
    expect(questBand(0, 0, 0, config)).toBe('fail');
  });

  // v1.1.4-S2's band boxes (DL-148 item 8): DL-83 item 17's margin, a share of Triumphs.
  test('a majority at Success or better, Triumphs or not, is a success', () => {
    expect(questBand(2, 0, 3, config)).toBe('success');
    expect(questBand(3, 1, 4, config)).toBe('success');
    expect(questBand(2, 2, 4, config)).toBe('fail');
  });

  test('every Encounter at Success or better with half or more of them Triumphs is a strong success', () => {
    expect(questBand(2, 1, 2, config)).toBe('strong');
    expect(questBand(4, 2, 4, config)).toBe('strong');
    expect(questBand(3, 3, 3, config)).toBe('strong');
    expect(questBand(3, 2, 3, config)).toBe('strong');
  });

  test('every Encounter at Success or better with fewer than half Triumphs is a plain success', () => {
    expect(questBand(4, 1, 4, config)).toBe('success');
    expect(questBand(3, 1, 3, config)).toBe('success');
    expect(questBand(2, 0, 2, config)).toBe('success');
    expect(questBand(5, 2, 5, config)).toBe('success');
  });

  test('strongTriumphShare 0 is the rule before v1.1.4: every Encounter at Success or better is strong', () => {
    const before = { ...config, strongTriumphShare: 0 };
    for (const count of [1, 2, 3, 4, 5]) {
      for (let successes = 0; successes <= count; successes += 1) {
        expect(questBand(successes, 0, count, before)).toBe(successes === count ? 'strong' : successes / count > 0.5 ? 'success' : 'fail');
      }
    }
  });

  test('strongTriumphShare is read', () => {
    expect(questBand(4, 3, 4, { ...config, strongTriumphShare: 0.75 })).toBe('strong');
    expect(questBand(4, 2, 4, { ...config, strongTriumphShare: 0.75 })).toBe('success');
  });
});

describe('resolveQuest', () => {
  // M4-S2's second box.
  test('a Hero killed in Encounter 2 contributes nothing to Encounter 3', () => {
    const content = contentWith(
      encounter('first', true),
      encounter('deadly', false, [{ kind: 'death', chance: 1 }]),
      withFactor(encounter('third', true), 0.4),
    );
    const { world, heroes, quest, party, deps } = scene('killed', content, ['first', 'deadly', 'third'], { difficulty: 40 });

    const { encounters, outcome } = resolveQuest(world, quest, party, deps);

    const [dead] = encounters[1]?.died ?? [];
    expect(dead).toBeDefined();
    expect(outcome.deaths).toEqual([dead]);
    const living = heroes.filter((hero) => hero.id !== dead);
    const third = content.encounters['third'] as Encounter;
    // `sum` of Strength: the two living Heroes' 16, not the three's 24, against a target of 16.
    expect(encounters[2]).toMatchObject({ encounterKey: 'third', roll: capability(living, third, world, deps), target: 16 });
    expect(encounters[2]?.roll).toBe(16);
    expect(capability(heroes, third, world, deps)).toBe(24);
    expect(encounters[2]?.outcome).toBe('success');
  });

  test('stops when no one is left, the Encounters it never reached counting as not succeeded', () => {
    const content = contentWith(encounter('wipe', false, [{ kind: 'death', chance: 1 }]), encounter('easy', true));
    const { world, quest, party, deps } = scene('wiped', content, ['wipe', 'easy', 'easy'], { size: 1 });

    const { encounters, outcome } = resolveQuest(world, quest, party, deps);

    expect(encounters.map((it) => it.encounterKey)).toEqual(['wipe']);
    expect(outcome).toMatchObject({ band: 'fail', successes: 0, encounterCount: 3, deaths: party.heroIds });
  });

  test("a Party wiped out after succeeding is banded over the whole sequence, not the Encounters it reached", () => {
    // It comes through the first Encounter and dies of it: one success of three is a failure, where
    // one of the one it reached would be strong (M4 verification, DL-42 item 11).
    const content = contentWith(encounter('pyrrhic', true, [], [{ kind: 'death', chance: 1 }]), encounter('easy', true));
    const { world, quest, party, deps } = scene('pyrrhic', content, ['pyrrhic', 'easy', 'easy'], { size: 1 });

    const { encounters, outcome } = resolveQuest(world, quest, party, deps);

    expect(encounters.map((it) => [it.encounterKey, it.outcome])).toEqual([['pyrrhic', 'success']]);
    expect(outcome).toMatchObject({ band: 'fail', successes: 1, encounterCount: 3, deaths: party.heroIds, wealthDelta: 0 });
  });

  test('pays the reward times the wealth factors on a success, nothing on a failure; Fame by the band plus the Encounters; XP by band times the XP factors', () => {
    const rich: Consequence[] = [
      { kind: 'wealth', factor: 1.5 },
      { kind: 'xp', factor: 2 },
      { kind: 'fame', delta: 1 },
    ];
    const content = contentWith(
      encounter('good', true, [], rich),
      encounter('bad', false, [{ kind: 'wealth', factor: 0.5 }, { kind: 'fame', delta: -2 }]),
    );
    const won = scene('won', content, ['good', 'good', 'bad'], { difficulty: 40 });
    const lost = scene('lost', content, ['good', 'bad', 'bad'], { difficulty: 40 });

    const success = resolveQuest(won.world, won.quest, won.party, won.deps).outcome;
    const failure = resolveQuest(lost.world, lost.quest, lost.party, lost.deps).outcome;

    // Two of three: a success, paying 200 × 1.5 × 1.5 × 0.5, gaining 3 + 1 + 1 − 2 Fame and 40 × 1 × 2 × 2
    // XP, 160, split across the three Heroes sent and rounded down (v1.1.5-S13, DL-182).
    expect(success).toMatchObject({ band: 'success', successes: 2, wealthDelta: 225, fameDelta: 3, xpPerHero: 53 });
    // One of three: a failure, paying nothing, losing 3 + 1 + 2 + 2 Fame, and half XP times 2, 40, split by three.
    expect(failure).toMatchObject({ band: 'fail', successes: 1, wealthDelta: 0, fameDelta: -6, xpPerHero: 13 });
  });

  // v1.1.5-S13 (DL-182 item 1): the Quest's XP split across the Party sent, each share rounded down.
  describe('the XP split', () => {
    const content = contentWith(encounter('pass', true), encounter('miss', false));
    /** The share each Hero of a Party of 1 to 5 (content's largest) takes of a Quest of 41 through `keys`. */
    const shares = (keys: string[]) =>
      [1, 2, 3, 4, 5].map((size) => {
        const { world, quest, party, deps } = scene(`split-${size}`, content, keys, { size, difficulty: 41 });
        expect(party.heroIds).toHaveLength(size);
        return resolveQuest(world, quest, party, deps).outcome;
      });

    test('divides the XP by the size of the Party sent, rounded down, a Party of one taking it whole: a strong success', () => {
      const outcomes = shares(['pass', 'pass', 'pass']);
      expect(outcomes.map((it) => it.band)).toEqual(['strong', 'strong', 'strong', 'strong', 'strong']);
      // 41 × 1 × 1: 41, 20.5, 13.67, 10.25 and 8.2, each rounded down.
      expect(outcomes.map((it) => it.xpPerHero)).toEqual([41, 20, 13, 10, 8]);
    });

    test('and a plain success', () => {
      const outcomes = shares(['pass', 'pass', 'miss']);
      expect(outcomes.map((it) => it.band)).toEqual(['success', 'success', 'success', 'success', 'success']);
      expect(outcomes.map((it) => it.xpPerHero)).toEqual([41, 20, 13, 10, 8]);
    });

    test('and a failure, its half XP split too', () => {
      const outcomes = shares(['pass', 'miss', 'miss']);
      expect(outcomes.map((it) => it.band)).toEqual(['fail', 'fail', 'fail', 'fail', 'fail']);
      // 41 × 0.5: 20.5, 10.25, 6.83, 5.125 and 4.1, each rounded down; a Party of one loses the half point as before.
      expect(outcomes.map((it) => it.xpPerHero)).toEqual([20, 10, 6, 5, 4]);
    });

    test('counts a Hero who dies in the divisor: their share is lost, not passed to those who come home', () => {
      const deadly = contentWith(encounter('first', true), encounter('deadly', false, [{ kind: 'death', chance: 1 }]), encounter('third', true));
      for (const [size, share] of [
        [2, 20],
        [3, 13],
      ] as const) {
        const { world, quest, party, deps } = scene(`split-death-${size}`, deadly, ['first', 'deadly', 'third'], { size, difficulty: 40 });

        const { outcome } = resolveQuest(world, quest, party, deps);

        // Two of three: a success of 40 XP, one Hero dead and `size − 1` home, each taking 40 / `size`.
        expect(outcome).toMatchObject({ band: 'success', xpPerHero: share });
        expect(outcome.deaths).toHaveLength(1);
        expect(share * (size - 1)).toBeLessThan(40);
      }
    });

    test('gives a Party of no Heroes a share of 0, not the Infinity of dividing by none, and JSON-safe', () => {
      // `dispatch` sends no Party below the Quest's `partySizeMin`, which content holds at 1 or more, and
      // nothing takes a Hero out of a Party; but the estimate's test resolves a Party of no one (a failure
      // meeting no Encounter), so the resolver keeps taking one (S13's verification, DL-184).
      const { world, quest, party, deps } = scene('split-empty', content, ['pass']);

      const { outcome } = resolveQuest(world, quest, { ...party, heroIds: [] }, deps);

      expect(outcome.band).toBe('fail');
      expect(outcome.xpPerHero).toBe(0);
      expect(JSON.parse(JSON.stringify(outcome)).xpPerHero).toBe(0);
    });
  });

  test("sums the Encounters' Morale and Regard into the outcome", () => {
    const content = contentWith(
      encounter('cheer', true, [], [{ kind: 'morale', delta: 2 }, { kind: 'regard', between: 'party', delta: 1 }]),
      encounter('gloom', false, [{ kind: 'morale', delta: -5 }, { kind: 'regard', between: 'party', delta: -2 }]),
    );
    const { world, quest, party, deps } = scene('moods', content, ['cheer', 'gloom', 'cheer']);

    expect(resolveQuest(world, quest, party, deps).outcome).toMatchObject({ moraleDelta: -1, regardDelta: 0 });
  });

  test('brings each Hero home with at most one Injury, and none on a Hero who died', () => {
    const content = contentWith(
      encounter('hurt', false, [{ kind: 'injury', typeKey: 'deep-cut', chance: 1, count: 5 }]),
      encounter('kill', false, [{ kind: 'death', chance: 1 }]),
    );
    const { world, heroes, quest, party, deps } = scene('one-each', content, ['hurt', 'kill', 'hurt'], { size: 3 });

    const { encounters, outcome } = resolveQuest(world, quest, party, deps);

    expect(encounters[0]?.injured).toHaveLength(3);
    expect(new Set(encounters[0]?.injured)).toEqual(new Set(heroes.map((hero) => hero.id)));
    expect(encounters[2]?.injured).toEqual([]);
    const [dead] = outcome.deaths;
    expect(outcome.injuries.map((injury) => injury.heroId).sort()).toEqual(
      heroes.map((hero) => hero.id).filter((id) => id !== dead).sort(),
    );
    for (const injury of outcome.injuries) {
      expect(injury.typeKey).toBe('deep-cut');
      expect(injury.healDays).toBeGreaterThanOrEqual(6);
      expect(injury.healDays).toBeLessThanOrEqual(12);
    }
  });

  test("heals an Injury by the infirmary at the Guild's grade when it is inflicted", () => {
    const content = contentWith(encounter('hurt', false, [{ kind: 'injury', typeKey: 'broken-arm', chance: 1, count: 1 }]));
    const bare = scene('infirmary', content, ['hurt'], { size: 1 });
    const kept = scene('infirmary', content, ['hurt'], { size: 1 });
    kept.guild.hall.infirmary = 2;

    const [without] = resolveQuest(bare.world, bare.quest, bare.party, bare.deps).outcome.injuries;
    const [within] = resolveQuest(kept.world, kept.quest, kept.party, kept.deps).outcome.injuries;

    expect(within?.healDays).toBe(Math.max(1, Math.round((without?.healDays ?? NaN) / 3)));
  });

  test("takes one draw a Check, three a count of an Injury and two a Death, whether or not they land, and draws only from quests", () => {
    const harm: Consequence[] = [
      { kind: 'injury', typeKey: 'deep-cut', chance: 0, count: 2 },
      { kind: 'death', chance: 0 },
      { kind: 'fame', delta: 1 },
    ];
    const content = contentWith(encounter('miss', false, harm), encounter('pass', true, harm, harm));
    const { world, quest, party, deps } = scene('draws', content, ['miss', 'pass']);
    const twin = structuredClone(streamOf(world, 'quests'));
    const before = structuredClone(world.rng) as Record<string, unknown>;

    resolveQuest(world, quest, party, deps);

    for (let draw = 0; draw < 2 * (1 + 2 * 3 + 2); draw += 1) next(twin);
    expect(streamOf(world, 'quests')).toEqual(twin);
    const after = world.rng as Record<string, unknown>;
    for (const name of Object.keys(before)) if (name !== 'quests') expect(after[name], name).toEqual(before[name]);
  });

  test('throws on a difficulty not above 0, a Hero not in the world, or an Injury type content lacks', () => {
    const content = contentWith(encounter('odd', false, [{ kind: 'injury', typeKey: 'frostbite', chance: 1, count: 1 }]));
    const { world, quest, party, deps } = scene('throws', content, ['hold-the-line']);

    expect(() => resolveQuest(world, { ...quest, difficulty: 0 }, party, deps)).toThrow(/difficulty/);
    expect(() => resolveQuest(world, quest, { ...party, heroIds: [makeId('heroes', 999)] }, deps)).toThrow(/hero-000999/);
    expect(() => resolveQuest(world, { ...quest, encounterKeys: ['odd'] }, party, deps)).toThrow(/frostbite/);
  });
});

describe("the Quest Engine's config (DL-42)", () => {
  test("defaults to ±40% (INPUTS 6.2's ±20% until DL-165) and Skill rating × 2, all strong and a majority success, and the stub's fields are gone", () => {
    // configVersion 4 from DL-42; 8 on the main line by the M5 close (DL-62) and 5 on M6's from M6-S1,
    // which moved two Rival fields to content (DL-56); 9 from their merge (DL-63); 10 from the M6 close's
    // Transfer lock (DL-69); 11 from M9-S2's Trait budget (DL-102); 12 from M9-F1's Guildmasters' ages (DL-113);
    // 13 from v1.1.4-S2's Degrees (DL-152), which v1.1.4-S3's form factors (DL-154) and v1.1.4-S4's harm
    // ranges (DL-155) join. v1.1.4-S10's balance pass sets the Triumph, the share of Triumphs and the
    // form factors under 13 (DL-166): 1.25, 0.5, 0.85 to 1.08 and 0.85 before it.
    expect(defaultConfig).toMatchObject({
      configVersion: 13,
      checkVariance: 0.4,
      skillBonusPerRating: 2,
      bandBySuccessShare: { successAbove: 0.5, strongAtLeast: 1 },
      checkDegrees: { triumph: 1.35, success: 1, setback: 0.75 },
      strongTriumphShare: 0.6,
      moraleCheckFactor: { wretched: 0.93, low: 0.97, steady: 1, high: 1.03, elated: 1.06 },
      hurtCheckFactor: 0.93,
      exposureRange: 2,
      guardRange: 0.5,
    });
    for (const field of ['stubBands', 'stubVariance', 'stubSkillBonusPerRating', 'stubInjuryChance', 'stubDeathChance']) {
      expect(Object.hasOwn(defaultConfig, field), field).toBe(false);
    }
    expect(Object.isFrozen(defaultConfig.bandBySuccessShare)).toBe(true);
    expect(Object.isFrozen(defaultConfig.checkDegrees)).toBe(true);
    expect(Object.isFrozen(defaultConfig.moraleCheckFactor)).toBe(true);
  });
});

// The two seams M4-S3 and M4-S4 fill (DL-42): neutral until then, and the Synergy term neutral for
// content without Synergies (M4-S3's own tests are synergy.test.ts).
// v1.1.4-S1: a Query's `["hurt"]` reads the Heroes injured earlier on the same Quest (resolve.ts
// passes them to `queryParty` for each Encounter).
describe('a Query on the Quest', () => {
  test('`["hurt"]` counts a Hero injured by an earlier Encounter, and no one when the Injury did not land', () => {
    const counted: Encounter = {
      key: 'counted',
      name: 'counted',
      kind: 'combat',
      // The number hurt, against a target of 0.5 (0.0125 × 40): met by one Hero hurt, missed by none.
      checks: [{ key: 'counted', name: 'Counted', score: ['count', ['where', 'party', ['hurt']]], skills: [], difficultyFactor: 0.0125 }],
      consequences: { success: [], failure: [] },
    };
    const wounding = (chance: number) => encounter('wounding', false, [{ kind: 'injury', typeKey: 'deep-cut', chance, count: 1 }]);
    const resolved = (chance: number) => {
      const content = { ...contentWith(wounding(chance), counted), synergies: {} };
      const { world, quest, party, deps } = scene(`hurt-${chance}`, content, ['wounding', 'counted']);
      return resolveQuest(world, quest, party, deps).encounters;
    };

    const [woundedBy, countedHurt] = resolved(1);
    expect(woundedBy?.injured).toHaveLength(1);
    expect(countedHurt).toMatchObject({ encounterKey: 'counted', target: 0.5, outcome: 'success' });
    expect(countedHurt?.roll).toBeGreaterThanOrEqual(0.9);

    const [unwounded, countedNone] = resolved(0);
    expect(unwounded?.injured).toEqual([]);
    expect(countedNone).toMatchObject({ encounterKey: 'counted', roll: 0, outcome: 'failure' });
  });
});

describe("the Check's seams", () => {
  test('the Synergy bonus is 0 and the teamwork scalar 1, whatever the Party', () => {
    const { world, heroes, deps } = scene('seams', { ...testContent, synergies: {} }, []);
    const any = testContent.encounters['ambush-on-the-road'] as Encounter;
    expect(synergyBonus(queryParty(heroes, world, deps), any, 30, deps)).toBe(0);
    expect(teamwork(heroes, world, deps)).toBe(1);
  });
});

// v1.1.4-S2 (DL-148 items 7 and 8): an Encounter of one to four Checks, combined by its pass formula
// into a Degree, with consequences by Degree. The scene's Party of three has Strength 24 in all and
// the Quest a difficulty of 40, so with no variance a Check's factor sets its Degree: 0.25 a Triumph
// (a target of 10), 0.55 a Success (22), 0.7 a Setback (28) and 2 a Failure (80).
describe('several Checks (v1.1.4-S2)', () => {
  const factors: Record<Degree, number> = { triumph: 0.25, success: 0.55, setback: 0.7, failure: 2 };

  /** A Check keyed `key` of the Party's summed Strength, coming out `degree`, with `fields` beside. */
  function strength(key: string, degree: Degree, fields: Partial<EncounterCheck> = {}): EncounterCheck {
    return { key, name: `The ${key}`, score: ['sum', 'party', ['stat', 'strength']], skills: [], difficultyFactor: factors[degree], ...fields };
  }

  /** An Encounter keyed `key` of `checks` and `pass`, with `consequences`. */
  function several(key: string, checks: EncounterCheck[], pass?: PassFormula, consequences: Encounter['consequences'] = { success: [], failure: [] }): Encounter {
    return { key, name: key, kind: 'combat', checks, ...(pass === undefined ? {} : { pass }), consequences };
  }

  // v1.1.4-S2's second box.
  test.each<[string, PassFormula]>([
    ['decided by its first Check', ['or', 'a', ['and', 'b', 'c']]],
    ['decided by its last', ['and', 'b', 'a', 'c']],
    ['decided by the k-th best', ['at-least', 2, 'c', 'b', 'a']],
  ])("a Quest draws one `next` for each Check, its formula %s, and Loot's draws follow as before", (_, pass) => {
    const harm: Consequence[] = [
      { kind: 'injury', typeKey: 'deep-cut', chance: 0, count: 1 },
      { kind: 'death', chance: 0 },
    ];
    const trio = several('trio', [strength('a', 'triumph'), strength('b', 'failure'), strength('c', 'setback')], pass, { success: harm, failure: harm });
    const s = scene('per-check', contentWith(trio), ['trio', 'trio', 'trio']);
    const quest = { ...s.quest, lootTableKey: 'lesser-loot' };
    const twin = structuredClone(s.world);

    const { encounters, outcome, loot } = resolveQuest(s.world, quest, s.party, s.deps);

    // Three Checks and the five draws of the harm, an Encounter; then Loot's two, as a twin draws them.
    expect(encounters).toHaveLength(3);
    for (let draw = 0; draw < 3 * (3 + 3 + 2); draw += 1) next(streamOf(twin, 'quests'));
    expect(loot).toEqual(drawLoot(twin, quest, outcome.band, s.deps));
    expect(streamOf(s.world, 'quests')).toEqual(streamOf(twin, 'quests'));
  });

  test("records its Degree, the Check that decided it and each Check, the roll, target, margin and outcome the deciding one's", () => {
    const pair = several('pair', [strength('first', 'success'), strength('second', 'setback')], ['or', 'second', 'first']);
    const s = scene('recorded', contentWith(pair), ['pair']);

    const [result] = resolveQuest(s.world, s.quest, s.party, s.deps).encounters;

    expect(result).toMatchObject({ degree: 'success', decidedBy: 'first', roll: 24, target: 22, margin: 2, outcome: 'success' });
    expect(result?.checks).toEqual([
      { key: 'first', capability: 24, roll: 24, target: 22, margin: 2, degree: 'success' },
      { key: 'second', capability: 24, roll: 24, target: 28, margin: -4, degree: 'setback' },
    ]);
  });

  test("applies its Degree's consequences: a Triumph's own or else Success's, a Setback's own or else Failure's", () => {
    const morale = (delta: number): Consequence[] => [{ kind: 'morale', delta }];
    const full = { success: morale(1), failure: morale(-1), triumph: morale(5), setback: morale(-3) };
    const plain = { success: morale(1), failure: morale(-1) };
    const moraleOf = (degree: Degree, consequences: Encounter['consequences']) => {
      const encounter = several(degree, [strength('only', degree)], undefined, consequences);
      const s = scene(`by-${degree}`, contentWith(encounter), [degree]);
      const { encounters, outcome } = resolveQuest(s.world, s.quest, s.party, s.deps);
      expect(encounters[0]?.degree).toBe(degree);
      return outcome.moraleDelta;
    };

    expect(degrees.map((degree) => moraleOf(degree, full))).toEqual([-1, -3, 1, 5]);
    expect(degrees.map((degree) => moraleOf(degree, plain))).toEqual([-1, -1, 1, 1]);
  });

  test("a Check's target is its flat plus its factor times the difficulty, and its own variance replaces checkVariance", () => {
    // A count of the Heroes with Strength 12 or more against a flat 1: a gate, with no luck in it.
    const gate = several('gate', [
      {
        key: 'strong-one',
        name: 'A strong one',
        score: ['count', ['where', 'party', ['>=', ['stat', 'strength'], 12]]],
        skills: [],
        difficultyFactor: 0,
        flat: 1,
        variance: 0,
      },
    ]);
    const resolved = (strongest: number) => {
      // No Synergies, whose flat bonus would add to the count.
      const s = scene(`gate-${strongest}`, { ...contentWith(gate), synergies: {} }, ['gate', 'gate'], { difficulty: 90 });
      const deps = { ...s.deps, config: { ...s.deps.config, checkVariance: 0.9 } };
      (s.heroes[0] as Hero).stats['strength'] = strongest;
      return resolveQuest(s.world, s.quest, s.party, deps).encounters;
    };

    expect(resolved(12).map((it) => [it.roll, it.target, it.degree])).toEqual([
      [1, 1, 'success'],
      [1, 1, 'success'],
    ]);
    expect(resolved(11).map((it) => [it.roll, it.target, it.degree])).toEqual([
      [0, 1, 'failure'],
      [0, 1, 'failure'],
    ]);
    // A flat beside a factor: 5 + 0.25 × 40.
    const both = several('both', [strength('both', 'triumph', { flat: 5 })]);
    const s = scene('flat-and-factor', contentWith(both), ['both']);
    expect(resolveQuest(s.world, s.quest, s.party, s.deps).encounters[0]?.target).toBe(15);
  });

  // v1.1.4-S2's verification (DL-152): a gate on a count is a gate only when nothing but the count
  // reaches the roll. A raw Check's capability is its score alone.
  test('a raw Check is its score alone: no teamwork, Synergy, Skill or consumable moves a count past its flat', () => {
    const counting = (raw: boolean): Encounter =>
      several('gate', [
        {
          key: 'strong-one',
          name: 'A strong one',
          score: ['count', ['where', 'party', ['>=', ['stat', 'strength'], 12]]],
          skills: [],
          difficultyFactor: 0,
          flat: 1,
          variance: 0,
          ...(raw ? { raw: true } : {}),
        },
      ]);
    /** The gate's Degree with one Hero at `strongest` Strength, every pair of the Party at the worst Regard, carrying a Whetstone. */
    const degreeOf = (raw: boolean, strongest: number) => {
      const s = scene(`raw-${raw}-${strongest}`, contentWith(counting(raw)), ['gate']);
      (s.heroes[0] as Hero).stats['strength'] = strongest;
      for (const hero of s.heroes) {
        hero.regard = Object.fromEntries(s.heroes.filter((other) => other.id !== hero.id).map((other) => [other.id, { value: s.deps.config.regardMin, since: 0, reason: 'test' }]));
      }
      addStack(s.world, 'whetstone', 1, { kind: 'party', id: s.party.id });
      return resolveQuest(s.world, s.quest, s.party, s.deps).encounters[0]?.degree;
    };

    // Not raw: with no Hero of Strength 12, the Whetstone's 3 alone is a Triumph.
    expect(degreeOf(false, 11)).toBe('triumph');
    // Raw: the count, 1 or 0, against the flat 1.
    expect(degreeOf(true, 12)).toBe('success');
    expect(degreeOf(true, 11)).toBe('failure');
  });

  test('a raw Check is not scaled by teamwork', () => {
    const counted = (raw: boolean) =>
      several('counted', [
        { key: 'one', name: 'One', score: ['count', ['where', 'party', ['>=', ['stat', 'strength'], 12]]], skills: [], difficultyFactor: 0, flat: 1, variance: 0, ...(raw ? { raw: true } : {}) },
      ]);
    const degreeOf = (raw: boolean) => {
      const s = scene(`raw-teamwork-${raw}`, { ...contentWith(counted(raw)), synergies: {} }, ['counted']);
      (s.heroes[0] as Hero).stats['strength'] = 12;
      for (const hero of s.heroes) {
        hero.regard = Object.fromEntries(s.heroes.filter((other) => other.id !== hero.id).map((other) => [other.id, { value: s.deps.config.regardMin, since: 0, reason: 'test' }]));
      }
      expect(teamwork(s.heroes, s.world, s.deps)).toBeLessThan(1);
      return resolveQuest(s.world, s.quest, s.party, s.deps).encounters[0]?.degree;
    };

    expect(degreeOf(false)).toBe('setback');
    expect(degreeOf(true)).toBe('success');
  });

  // v1.1.4-S2's third box, through the resolver (`questBand`'s own tests are above).
  test('the band: a majority at Success is a success; every Encounter at Success or better, half Triumphs, strong; fewer, not', () => {
    const triumph = several('won-well', [strength('only', 'triumph')]);
    const success = several('won', [strength('only', 'success')]);
    const setback = several('lost-narrowly', [strength('only', 'setback')]);
    const bandOf = (keys: string[]) => {
      const s = scene(`band-${keys.join('-')}`, contentWith(triumph, success, setback), keys);
      return resolveQuest(s.world, s.quest, s.party, s.deps).outcome;
    };

    expect(bandOf(['won-well', 'won'])).toMatchObject({ band: 'strong', successes: 2 });
    expect(bandOf(['won-well', 'won', 'won'])).toMatchObject({ band: 'success', successes: 3 });
    expect(bandOf(['won-well', 'won-well', 'lost-narrowly'])).toMatchObject({ band: 'success', successes: 2 });
    expect(bandOf(['won', 'lost-narrowly', 'lost-narrowly'])).toMatchObject({ band: 'fail', successes: 1 });
  });

  test("a Check's margin is its roll less the Success threshold times its target, so 0 or more is a Success at any threshold (DL-152)", () => {
    const one = several('one', [strength('only', 'success')]);
    const marginOf = (success: number) => {
      const s = scene(`margin-${success}`, contentWith(one), ['one']);
      const deps = { ...s.deps, config: { ...s.deps.config, checkDegrees: { triumph: 2, success, setback: 0.5 } } };
      return resolveQuest(s.world, s.quest, s.party, deps).encounters[0];
    };

    expect(marginOf(1)).toMatchObject({ roll: 24, target: 22, margin: 2, degree: 'success' });
    expect(marginOf(1.1)).toMatchObject({ roll: 24, target: 22, degree: 'setback' });
    expect(marginOf(1.1)?.margin).toBeCloseTo(24 - 1.1 * 22);
  });

  test('throws on a configuration whose Degrees are out of order', () => {
    const one = several('one', [strength('only', 'success')]);
    const s = scene('disordered', contentWith(one), ['one']);
    const deps = { ...s.deps, config: { ...s.deps.config, checkDegrees: { triumph: 0.9, success: 1, setback: 0.75 } } };
    expect(() => resolveQuest(s.world, s.quest, s.party, deps)).toThrow(/checkDegrees is .*; triumph > success > setback > 0/);
  });

  test('throws on several Checks with no pass formula', () => {
    const loose = several('loose', [strength('a', 'success'), strength('b', 'success')]);
    const s = scene('loose', contentWith(loose), ['loose']);
    expect(() => resolveQuest(s.world, s.quest, s.party, s.deps)).toThrow(/2 Checks and no pass formula/);
  });
});

// v1.1.4-S3 (DL-148 items 9 to 11, DL-154): each Hero's form, from the band of their Morale on the
// Quest and whether they are hurt on it, scales the Stats they add into a Check's score. The scene's
// Party of three, steady at Morale 60, has Strength 24 in all; with no variance, its roll is its
// capability.
describe('form on the Quest (v1.1.4-S3)', () => {
  /** An Encounter keyed `key` of one Check of the Party's summed Strength at `factor`, with `success` and `failure`. */
  function summed(key: string, factor: number, success: Consequence[] = [], failure: Consequence[] = [], fields: Partial<EncounterCheck> = {}): Encounter {
    return {
      key,
      name: key,
      kind: 'combat',
      checks: [{ key, name: key, score: ['sum', 'party', ['stat', 'strength']], skills: [], difficultyFactor: factor, ...fields }],
      consequences: { success, failure },
    };
  }

  /** The scene through `encounters`, its Heroes at Morale `morale`. */
  function resolvedAt(seed: string, morale: number, encounters: Encounter[], config: Partial<EngineDeps['config']> = {}) {
    const s = scene(seed, { ...contentWith(...encounters), synergies: {} }, encounters.map((it) => it.key));
    for (const hero of s.heroes) hero.morale = morale;
    const deps = { ...s.deps, config: { ...s.deps.config, ...config } };
    return { ...resolveQuest(s.world, s.quest, s.party, deps), heroes: s.heroes };
  }

  test('a Morale consequence in Encounter 1 changes form in Encounter 2, and stored Morale waits for the return', () => {
    const capabilities = (delta: number) => {
      const { encounters, outcome, heroes } = resolvedAt(`morale-${delta}`, 60, [summed('first', 0.25, [{ kind: 'morale', delta }]), summed('second', 0.25)]);
      expect(heroes.map((hero) => hero.morale)).toEqual([60, 60, 60]);
      expect(outcome.moraleDelta).toBe(delta);
      return encounters.map((it) => it.checks[0]?.capability ?? Number.NaN);
    };
    const { moraleCheckFactor: factor } = pinned;

    // Steady at 60 in the first, as they set out; in the second at 60 + delta, held to the scale.
    expect(capabilities(0)).toEqual([24, 24]);
    const [steady, wretched] = capabilities(-45);
    expect(steady).toBe(24);
    expect(wretched).toBeCloseTo(24 * factor.wretched, 10);
    expect(capabilities(-200)[1]).toBeCloseTo(24 * factor.wretched, 10);
    expect(capabilities(-30)[1]).toBeCloseTo(24 * factor.low, 10);
    expect(capabilities(20)[1]).toBeCloseTo(24 * factor.high, 10);
    expect(capabilities(35)[1]).toBeCloseTo(24 * factor.elated, 10);
  });

  test('a Hero hurt in Encounter 1 adds hurtCheckFactor of their Strength in Encounter 2', () => {
    const wounding = summed('wounding', 0.25, [{ kind: 'injury', typeKey: 'deep-cut', chance: 1, count: 1 }]);
    const { encounters } = resolvedAt('hurt-form', 60, [wounding, summed('after', 0.25)]);

    expect(encounters[0]?.injured).toHaveLength(1);
    expect(encounters[1]?.checks[0]?.capability).toBeCloseTo(8 * pinned.hurtCheckFactor + 16, 10);
  });

  test("sets a Check's formDecided exactly when the same roll with every form at 1 falls on the other side of the Success line, and which way", () => {
    // A target of 22: 24 is a Success at form 1, and 20.4, wretched, a Setback.
    const lowered = resolvedAt('lowered', 10, [summed('one', 0.55)]).encounters[0];
    expect(lowered).toMatchObject({ degree: 'setback', formDecided: 'lowered', checks: [{ degree: 'setback', formDecided: 'lowered' }] });
    expect(lowered?.checks[0]?.roll).toBeCloseTo(24 * pinned.moraleCheckFactor.wretched, 10);
    // A target of 25.2: 24 is a Setback at form 1, and 25.92, elated, a Success.
    expect(resolvedAt('raised', 95, [summed('one', 0.63)]).encounters[0]).toMatchObject({
      degree: 'success',
      formDecided: 'raised',
      checks: [{ degree: 'success', formDecided: 'raised' }],
    });
    // Form moved the roll but not past the Success line: a Failure made a Setback (a target of 34),
    // a Success made a Triumph (20), or no Degree moved at all. None is set. Nor at form 1, steady.
    for (const [morale, factor] of [[95, 0.85], [95, 0.5], [95, 0.55], [10, 0.25], [60, 0.55], [60, 0.63]] as const) {
      const [only] = resolvedAt(`none-${morale}-${factor}`, morale, [summed('one', factor)]).encounters;
      expect(only).not.toHaveProperty('formDecided');
      expect(only?.checks[0]).not.toHaveProperty('formDecided');
    }
    expect(resolvedAt('setback-not-raised', 95, [summed('one', 0.85)]).encounters[0]?.checks[0]?.degree).toBe('setback');
    expect(resolvedAt('triumph-not-raised', 95, [summed('one', 0.5)]).encounters[0]?.checks[0]?.degree).toBe('triumph');
  });

  // The verification of v1.1.4-S3: the Encounter says form decided it only when, with every form at 1
  // and the same rolls, its pass formula would have given the other side of the Success line.
  test("an Encounter's formDecided follows its pass formula: not when form raised a Check of an `and` another failed", () => {
    const anded: Encounter = {
      key: 'anded',
      name: 'anded',
      kind: 'combat',
      checks: [
        { key: 'a', name: 'A', score: ['sum', 'party', ['stat', 'strength']], skills: [], difficultyFactor: 0.63 },
        { key: 'b', name: 'B', score: ['sum', 'party', ['stat', 'strength']], skills: [], difficultyFactor: 2 },
      ],
      pass: ['and', 'a', 'b'],
      consequences: { success: [], failure: [] },
    };
    const [only] = resolvedAt('anded', 95, [anded]).encounters;

    expect(only?.checks.map((it) => [it.degree, it.formDecided])).toEqual([['success', 'raised'], ['failure', undefined]]);
    expect(only?.degree).toBe('failure');
    expect(only).not.toHaveProperty('formDecided');
  });

  test("nor when an `or` succeeded through a Check form did not move, though it lowered another", () => {
    const ored: Encounter = {
      key: 'ored',
      name: 'ored',
      kind: 'combat',
      checks: [
        { key: 'a', name: 'A', score: ['sum', 'party', ['stat', 'strength']], skills: [], difficultyFactor: 0.55 },
        { key: 'c', name: 'C', score: ['count', 'party'], skills: [], difficultyFactor: 0.05 },
      ],
      pass: ['or', 'a', 'c'],
      consequences: { success: [], failure: [] },
    };
    const [only] = resolvedAt('ored', 10, [ored]).encounters;

    expect(only?.checks.map((it) => [it.degree, it.formDecided])).toEqual([['setback', 'lowered'], ['triumph', undefined]]);
    expect(only).toMatchObject({ degree: 'triumph', decidedBy: 'c' });
    expect(only).not.toHaveProperty('formDecided');
    // With the counting Check missed, the same lowering decides the `or`: it fails, and says so.
    const [missed] = resolvedAt('ored-missed', 10, [{ ...ored, checks: [ored.checks[0] as EncounterCheck, { ...(ored.checks[1] as EncounterCheck), difficultyFactor: 2 }] }]).encounters;
    expect(missed).toMatchObject({ degree: 'setback', formDecided: 'lowered' });
  });

  test('every form factor 1 plays as before v1.1.4-S3: the capabilities read as they are, and nothing is formDecided', () => {
    const ones = { moraleCheckFactor: { wretched: 1, low: 1, steady: 1, high: 1, elated: 1 }, hurtCheckFactor: 1 };
    const wounding = summed('wounding', 0.25, [{ kind: 'injury', typeKey: 'deep-cut', chance: 1, count: 1 }, { kind: 'morale', delta: -50 }]);
    const { encounters } = resolvedAt('ones', 10, [wounding, summed('after', 0.55)], ones);

    expect(encounters.map((it) => it.checks)).toEqual([
      [{ key: 'wounding', capability: 24, roll: 24, target: 10, margin: 14, degree: 'triumph' }],
      [{ key: 'after', capability: 24, roll: 24, target: 22, margin: 2, degree: 'success' }],
    ]);
  });

  test('a raw Check is read without form, and form decides none of it (DL-152)', () => {
    const gate = summed('gate', 0, [], [], { score: ['sum', 'party', ['stat', 'strength']], flat: 24, variance: 0, raw: true });
    const { encounters } = resolvedAt('raw-form', 10, [gate]);

    expect(encounters[0]?.checks).toEqual([{ key: 'gate', capability: 24, roll: 24, target: 24, margin: 0, degree: 'success' }]);
  });

  test('throws on a form factor that is not a finite number above 0, naming it', () => {
    const one = summed('one', 0.55);
    expect(() => resolvedAt('bad-band', 60, [one], { moraleCheckFactor: { ...defaultConfig.moraleCheckFactor, low: 0 } })).toThrow(
      /moraleCheckFactor\.low is 0; it is a finite number above 0/,
    );
    expect(() => resolvedAt('bad-hurt', 60, [one], { hurtCheckFactor: Number.POSITIVE_INFINITY })).toThrow(/hurtCheckFactor is Infinity/);
  });
});

// v1.1.4-S4 (DL-148 item 14, DL-155): harm that reads the Stats. Who an Injury or a Death falls on
// follows its `among` and `exposedBy`, whether it lands its `guardedBy`, and a Morale loss is each
// Hero's own by its `steadiedBy`. The draws keep their number and order. A Stat's range is 1 to 20.
describe('harm that reads the Stats (v1.1.4-S4)', () => {
  /** An Encounter keyed `key` the Party of 8s always fails, with `failure`. */
  const failing = (key: string, failure: Consequence[]): Encounter => encounter(key, false, failure);
  const injury = (fields: Partial<InjuryConsequence> = {}): InjuryConsequence => ({ kind: 'injury', typeKey: 'deep-cut', chance: 1, count: 1, ...fields });
  const warriors: SetQuery = ['where', 'party', ['class', 'warrior']];

  /** The scene through `encounters`, of `size` Heroes, each set by `set` before they set out. */
  function harmed(seed: string, encounters: Encounter[], { size = 3, set = (() => undefined) as (heroes: Hero[]) => void, config = {} as Partial<EngineDeps['config']> } = {}) {
    const s = scene(seed, { ...contentWith(...encounters), synergies: {} }, encounters.map((it) => it.key), { size });
    set(s.heroes);
    const deps = { ...s.deps, config: { ...s.deps.config, ...config } };
    return { ...s, deps, resolve: () => resolveQuest(s.world, s.quest, s.party, deps) };
  }

  /** Sets the Heroes' Classes, in order. */
  const classes =
    (...keys: string[]) =>
    (heroes: Hero[]): void => {
      heroes.forEach((hero, index) => (hero.classKey = keys[index] ?? hero.classKey));
    };

  test('with none of the fields, whether it lands and on whom are what chance and pick drew, and the Days follow', () => {
    const harm: Consequence[] = [injury({ chance: 0.5, count: 3 }), { kind: 'death', chance: 0.4 }];
    for (let seed = 0; seed < 40; seed += 1) {
      const h = harmed(`plain-${seed}`, [failing('harm', harm), failing('again', harm)]);
      h.quest.lootTableKey = null; // No Loot's draws after the sequence.
      const twin = structuredClone(streamOf(h.world, 'quests'));
      const { encounters } = h.resolve();

      // Each Encounter: one draw for its Check, then three an Injury and two a Death, as before v1.1.4-S4.
      let alive = [...h.heroes];
      const hurt = new Set<string>();
      for (const result of encounters) {
        const injured: string[] = [];
        const died: string[] = [];
        next(twin);
        for (let time = 0; time < 3; time += 1) {
          const lands = chance(twin, 0.5);
          const unhurt = alive.filter((hero) => !hurt.has(hero.id));
          const who = unhurt[int(twin, 0, Math.max(0, unhurt.length - 1))];
          int(twin, 6, 12);
          if (lands && who !== undefined) {
            hurt.add(who.id);
            injured.push(who.id);
          }
        }
        const lands = chance(twin, 0.4);
        const dead = alive[int(twin, 0, Math.max(0, alive.length - 1))];
        if (lands && dead !== undefined) {
          died.push(dead.id);
          alive = alive.filter((hero) => hero.id !== dead.id);
          hurt.delete(dead.id);
        }
        expect([result.injured, result.died]).toEqual([injured, died]);
      }
      expect(streamOf(h.world, 'quests')).toEqual(twin);
    }
  });

  test('the fields at no effect, exposureRange and guardRange 0 and among the whole Party, draw and resolve exactly as none', () => {
    const plain: Consequence[] = [injury({ chance: 0.6, count: 2 }), { kind: 'death', chance: 0.3 }, { kind: 'morale', delta: -7 }];
    const reading: Consequence[] = [
      injury({ chance: 0.6, count: 2, among: 'party', exposedBy: ['constitution'], guardedBy: ['endurance'] }),
      { kind: 'death', chance: 0.3, among: 'party', exposedBy: ['strength'], guardedBy: ['constitution'] },
      { kind: 'morale', delta: -7, steadiedBy: ['courage'] },
    ];
    const none = { exposureRange: 0, guardRange: 0 };
    const vary = (heroes: Hero[]): void => {
      heroes.forEach((hero, index) => Object.assign(hero.stats, { constitution: 1 + 9 * index, endurance: 20 - 7 * index, courage: 3 + 8 * index }));
    };
    for (let seed = 0; seed < 30; seed += 1) {
      const a = harmed(`neutral-${seed}`, [failing('harm', plain), failing('again', plain)], { set: vary, config: none });
      const b = harmed(`neutral-${seed}`, [failing('harm', reading), failing('again', reading)], { set: vary, config: none });
      expect(b.resolve()).toEqual(a.resolve());
      expect(streamOf(b.world, 'quests')).toEqual(streamOf(a.world, 'quests'));
    }
  });

  test('among narrows who an Injury falls on, and a count it finds hurt falls on the others', () => {
    for (let seed = 0; seed < 20; seed += 1) {
      const h = harmed(`among-${seed}`, [failing('front', [injury({ among: warriors })])], { set: classes('mage', 'warrior', 'mage') });
      expect(h.resolve().encounters[0]?.injured).toEqual([h.heroes[1]?.id]);
    }
    const twice = harmed('among-twice', [failing('front', [injury({ count: 3, among: warriors })])], { set: classes('mage', 'warrior', 'mage') });
    const [first, ...rest] = twice.resolve().encounters[0]?.injured ?? [];
    expect(first).toBe(twice.heroes[1]?.id);
    expect(new Set(rest)).toEqual(new Set([twice.heroes[0]?.id, twice.heroes[2]?.id]));
  });

  // The epic's second box.
  test('among falls back to the whole unhurt Party when it matches no one, so leaving the Warriors at home dodges nothing', () => {
    const hit = new Set<string>();
    for (let seed = 0; seed < 40; seed += 1) {
      const h = harmed(`fallback-${seed}`, [failing('front', [injury({ among: warriors })])], { set: classes('mage', 'rogue', 'mage') });
      const { encounters, outcome } = h.resolve();
      expect(encounters[0]?.injured).toHaveLength(1);
      expect(outcome.injuries).toHaveLength(1);
      hit.add(encounters[0]?.injured[0] as string);
    }
    expect(hit.size).toBe(3);
  });

  test('a Death among the Warriors may fall on a hurt one, since a wound makes no one safer', () => {
    for (let seed = 0; seed < 20; seed += 1) {
      const harm: Consequence[] = [injury({ among: warriors }), { kind: 'death', chance: 1, among: warriors }];
      const h = harmed(`death-among-${seed}`, [failing('front', harm)], { set: classes('mage', 'warrior', 'mage') });
      const [result] = h.resolve().encounters;
      expect(result?.injured).toEqual([h.heroes[1]?.id]);
      expect(result?.died).toEqual([h.heroes[1]?.id]);
    }
  });

  // v1.1.5-S4 (DL-168 item 6, E3, DL-178): an Injury's `among` is read over the unhurt living Heroes,
  // then gives the Heroes it names among them; a Death's, over the living Party, as before.
  describe('an Injury on the next-weakest unhurt Hero (v1.1.5-S4)', () => {
    const weakest: SetQuery = ['bottom', 'party', 1, ['stat', 'strength']];
    const strongestThree: SetQuery = ['top', 'party', 3, ['stat', 'strength']];
    /** Sets the Heroes' Strength, in order. */
    const strengths =
      (...values: number[]) =>
      (heroes: Hero[]): void => {
        heroes.forEach((hero, index) => (hero.stats['strength'] = values[index] ?? 8));
      };

    // The epic's first box: the weakest hurt by one Encounter, or by the count before, the next falls on the next weakest.
    test('with the weakest hurt, a `bottom` Injury falls on the next weakest unhurt, its three draws a count as before', () => {
      for (let seed = 0; seed < 20; seed += 1) {
        // Party order 12, 4, 8: the weakest second, the next weakest third.
        const h = harmed(`next-weakest-${seed}`, [failing('first', [injury({ among: weakest })]), failing('second', [injury({ among: weakest })])], {
          set: strengths(12, 4, 8),
        });
        h.quest.lootTableKey = null;
        const twin = structuredClone(streamOf(h.world, 'quests'));
        const [first, second] = h.resolve().encounters;
        expect([first?.injured, second?.injured]).toEqual([[h.heroes[1]?.id], [h.heroes[2]?.id]]);
        // Each Encounter one Check's draw, then the Injury's three.
        for (let draw = 0; draw < 2 * (1 + 3); draw += 1) next(twin);
        expect(streamOf(h.world, 'quests')).toEqual(twin);

        const counted = harmed(`next-weakest-count-${seed}`, [failing('both', [injury({ count: 3, among: weakest })])], { set: strengths(12, 4, 8) });
        expect(counted.resolve().encounters[0]?.injured).toEqual([counted.heroes[1]?.id, counted.heroes[2]?.id, counted.heroes[0]?.id]);
      }
    });

    test('a `top` 3 with one of the three strongest hurt names the three strongest unhurt', () => {
      const hit = new Set<number>();
      for (let seed = 0; seed < 40; seed += 1) {
        // Party order 20, 16, 12, 8, 4; the Warrior, at 16, hurt first. The scene's Roster holds four
        // Heroes, so a fifth, the fourth's copy under a new id, joins the Party: with four, the three
        // unhurt would be the whole pool, and a `top` 3 would name them whichever way it ranked
        // (the S4 verification, DL-178).
        const h = harmed(`top-three-${seed}`, [failing('front', [injury({ among: warriors })]), failing('top', [injury({ among: strongestThree })])], { size: 4 });
        const fifth: Hero = { ...structuredClone(h.heroes[3] as Hero), id: makeId('heroes', 999_999) };
        h.world.heroes[fifth.id] = fifth;
        h.party.heroIds = [...h.party.heroIds, fifth.id];
        h.heroes.push(fifth);
        strengths(20, 16, 12, 8, 4)(h.heroes);
        classes('mage', 'warrior', 'mage', 'mage', 'mage')(h.heroes);
        expect(h.party.heroIds).toHaveLength(5);
        const [front, top] = h.resolve().encounters;
        expect(front?.injured).toEqual([h.heroes[1]?.id]);
        expect(top?.injured).toHaveLength(1);
        hit.add(h.heroes.findIndex((hero) => hero.id === top?.injured[0]));
      }
      expect(hit).toEqual(new Set([0, 2, 3]));
    });

    test("a Death's `among` still reads the living Party: the weakest, hurt, is the one it names", () => {
      for (let seed = 0; seed < 20; seed += 1) {
        const harm: Consequence[] = [injury({ among: weakest }), { kind: 'death', chance: 1, among: weakest }];
        const h = harmed(`death-weakest-${seed}`, [failing('front', harm)], { set: strengths(12, 4, 8) });
        const [result] = h.resolve().encounters;
        expect(result?.injured).toEqual([h.heroes[1]?.id]);
        expect(result?.died).toEqual([h.heroes[1]?.id]);
      }
    });

    // The epic's fourth box: with the weakest hurt, an Injury and a Death with none of the fields draw
    // as before the change, whether it lands then `pick` over the unhurt (or the living) then the Days.
    test('with the weakest hurt, a consequence with none of the fields draws as a twin before the change', () => {
      for (let seed = 0; seed < 30; seed += 1) {
        const plain: Consequence[] = [injury({ chance: 0.5, count: 2 }), { kind: 'death', chance: 0.4 }];
        const h = harmed(`plain-after-${seed}`, [failing('first', [injury({ among: weakest })]), failing('plain', plain)], { set: strengths(12, 4, 8) });
        h.quest.lootTableKey = null;
        const twin = structuredClone(streamOf(h.world, 'quests'));
        const [first, second] = h.resolve().encounters;

        // The first Encounter: its Check, then the `bottom` Injury's three, on the weakest.
        for (let draw = 0; draw < 1 + 3; draw += 1) next(twin);
        expect(first?.injured).toEqual([h.heroes[1]?.id]);
        // The second, by hand as before v1.1.4-S4.
        const alive = [...h.heroes];
        const hurt = new Set<string>([h.heroes[1]?.id as string]);
        const injured: string[] = [];
        const died: string[] = [];
        next(twin);
        for (let time = 0; time < 2; time += 1) {
          const lands = chance(twin, 0.5);
          const unhurt = alive.filter((hero) => !hurt.has(hero.id));
          const who = unhurt[int(twin, 0, Math.max(0, unhurt.length - 1))];
          int(twin, 6, 12);
          if (lands && who !== undefined) {
            hurt.add(who.id);
            injured.push(who.id);
          }
        }
        const lands = chance(twin, 0.4);
        const dead = alive[int(twin, 0, Math.max(0, alive.length - 1))];
        if (lands && dead !== undefined) died.push(dead.id);
        expect([second?.injured, second?.died]).toEqual([injured, died]);
        expect(streamOf(h.world, 'quests')).toEqual(twin);
      }
    });
  });

  // The epic's third box.
  // 20,000 resolutions for a ratio held to 5%, and 60,000 for three rates held to 1.5 points below: one
  // to two seconds each alone, past the default 5 s under the whole suite's load (DL-164).
  test('over 20,000 draws, the Hero at the bottom of exposedBy is hit about three times as often as the one at the top', { timeout: 30_000 }, () => {
    const h = harmed('exposure', [failing('front', [injury({ exposedBy: ['constitution'] })])], {
      size: 2,
      set: (heroes) => heroes.forEach((hero, index) => (hero.stats['constitution'] = index === 0 ? 1 : 20)),
    });
    const [low, high] = h.heroes as [Hero, Hero];
    const hits = new Map<string, number>();
    for (let draw = 0; draw < 20_000; draw += 1) {
      const hurt = h.resolve().encounters[0]?.injured[0] ?? 'no one';
      hits.set(hurt, (hits.get(hurt) ?? 0) + 1);
    }
    expect(hits.get('no one')).toBeUndefined();
    const ratio = (hits.get(low.id) ?? 0) / (hits.get(high.id) ?? 1);
    expect(ratio).toBeGreaterThan(2.85);
    expect(ratio).toBeLessThan(3.15);
  });

  test('over 20,000 draws, guardedBy at the top halves the chance, and at the bottom leaves it', { timeout: 30_000 }, () => {
    const rate = (constitution: number, kind: 'injury' | 'death'): number => {
      const harm: Consequence = kind === 'injury' ? injury({ chance: 0.8, guardedBy: ['constitution'] }) : { kind, chance: 0.8, guardedBy: ['constitution'] };
      const h = harmed(`guard-${constitution}-${kind}`, [failing('front', [harm])], {
        size: 1,
        set: (heroes) => heroes.forEach((hero) => (hero.stats['constitution'] = constitution)),
      });
      let landed = 0;
      for (let draw = 0; draw < 20_000; draw += 1) {
        const [result] = h.resolve().encounters;
        landed += (result?.injured.length ?? 0) + (result?.died.length ?? 0);
      }
      return landed / 20_000;
    };

    expect(Math.abs(rate(20, 'injury') - 0.4)).toBeLessThan(0.015);
    expect(Math.abs(rate(1, 'injury') - 0.8)).toBeLessThan(0.015);
    expect(Math.abs(rate(20, 'death') - 0.4)).toBeLessThan(0.015);
  });

  test("steadiedBy makes each Hero's Morale loss their own, a gain as written, and moraleDelta stays the sum as written", () => {
    const steadied: Consequence[] = [
      { kind: 'morale', delta: -10, steadiedBy: ['courage'] },
      { kind: 'morale', delta: 3, steadiedBy: ['courage'] },
    ];
    const h = harmed('steadied', [failing('gloom', steadied)], {
      set: (heroes) => heroes.forEach((hero, index) => (hero.stats['courage'] = [20, 1, 11][index] ?? 10)),
    });
    const { outcome } = h.resolve();

    // −10 × (1 − 0.5 × share): −5 at the top, −10 at the bottom, −7.37 at 11; then +3 each, the total rounded.
    expect(outcome.moraleDelta).toBe(-7);
    expect(outcome.moraleByHero).toEqual(Object.fromEntries(h.heroes.map((hero, index) => [hero.id, [-2, -7, -4][index]])));
    expect(Object.keys(outcome.moraleByHero)).toEqual(h.heroes.map((hero) => hero.id));
  });

  // The verification of v1.1.4-S4: a steadied loss rounded as it was applied let a small one vanish.
  test("steadied losses are summed as they are and each Hero's total rounded once: two −1s halved are −1, not 0", () => {
    const small: Consequence = { kind: 'morale', delta: -1, steadiedBy: ['courage'] };
    const h = harmed('small-losses', [failing('chill', [small, small])], {
      set: (heroes) => heroes.forEach((hero, index) => (hero.stats['courage'] = index === 0 ? 20 : 1)),
    });

    expect(h.resolve().outcome.moraleByHero).toEqual(Object.fromEntries(h.heroes.map((hero, index) => [hero.id, index === 0 ? -1 : -2])));
  });

  test("each Hero's Morale on the Quest reads their steadied losses unrounded: 40 less a half is the low band", () => {
    const after: Encounter = {
      key: 'after',
      name: 'after',
      kind: 'combat',
      checks: [{ key: 'after', name: 'after', score: ['sum', 'party', ['stat', 'strength']], skills: [], difficultyFactor: 0.25 }],
      consequences: { success: [], failure: [] },
    };
    const h = harmed('half-a-point', [failing('chill', [{ kind: 'morale', delta: -1, steadiedBy: ['courage'] }]), after], {
      set: (heroes) => {
        heroes.forEach((hero, index) => {
          hero.morale = index === 0 ? 40 : 60;
          hero.stats['courage'] = 20;
        });
      },
    });

    // The first Hero at 39.5 is low; the others, at 59.5, steady.
    expect(h.resolve().encounters[1]?.checks[0]?.capability).toBeCloseTo(8 * pinned.moraleCheckFactor.low + 16, 10);
  });

  test('moraleByHero names each Hero home alive, and with no steadiedBy is moraleDelta for each', () => {
    const h = harmed('by-hero', [failing('grim', [{ kind: 'morale', delta: -4 }, { kind: 'death', chance: 1 }]), failing('grimmer', [{ kind: 'morale', delta: -2 }])]);
    const { outcome } = h.resolve();
    const [dead] = outcome.deaths;

    expect(dead).toBeDefined();
    expect(outcome.moraleDelta).toBe(-6);
    expect(outcome.moraleByHero).toEqual(Object.fromEntries(h.heroes.filter((hero) => hero.id !== dead).map((hero) => [hero.id, -6])));
  });

  test("each Hero's own Morale sets their form in the next Encounter", () => {
    const after: Encounter = {
      key: 'after',
      name: 'after',
      kind: 'combat',
      checks: [{ key: 'after', name: 'after', score: ['sum', 'party', ['stat', 'strength']], skills: [], difficultyFactor: 0.25 }],
      consequences: { success: [], failure: [] },
    };
    // From 60: −30 at the bottom of Courage, to 30, low; −15 at the top, to 45, steady.
    const h = harmed('own-form', [failing('gloom', [{ kind: 'morale', delta: -30, steadiedBy: ['courage'] }]), after], {
      set: (heroes) => {
        heroes.forEach((hero, index) => {
          hero.morale = 60;
          hero.stats['courage'] = index === 0 ? 1 : 20;
        });
      },
    });

    expect(h.resolve().encounters[1]?.checks[0]?.capability).toBeCloseTo(8 * pinned.moraleCheckFactor.low + 16, 10);
  });

  test("a share reads effective Stats, so armour's Constitution steadies, and never form", () => {
    const battered: Consequence[] = [
      injury({ among: warriors }),
      { kind: 'morale', delta: -40, steadiedBy: ['constitution'] },
      { kind: 'morale', delta: -10, steadiedBy: ['constitution'] },
    ];
    const h = harmed('armoured', [failing('battered', battered)], {
      size: 2,
      set: (heroes) => {
        for (const hero of heroes) {
          hero.morale = 10;
          hero.stats['constitution'] = 17;
        }
        classes('warrior', 'mage')(heroes);
      },
    });
    const [plated, bare] = h.heroes as [Hero, Hero];
    addStack(h.world, 'plate-harness', 1, { kind: 'hero', id: plated.id, slot: 'armour' }); // Constitution +3, to 20

    const { encounters, outcome } = h.resolve();
    // Hurt and wretched, the plated Hero keeps half of each: −20 and −5. Bare, at 17, 1 − 0.5 × 16/19 of each.
    expect(encounters[0]?.injured).toEqual([plated.id]);
    const kept = 1 - 0.5 * (16 / 19);
    expect(outcome.moraleByHero).toEqual({ [plated.id]: -25, [bare.id]: Math.round(-50 * kept) });
  });
});

// v1.1.4-S7 (DL-148 items 25 and 26, DL-150 item 5): Traits earned on a Quest, and a Trait's
// Encounter bonus. The test content's Hero Traits, with three of the tests' own: `battle-hardened`
// and `shaken`, which exclude each other, and `quick-study`.
describe('earned Traits (v1.1.4-S7)', () => {
  const trait = (key: string, excludes: string[] = []) => ({ key, name: key, excludes, effects: [] });
  const heroTraits = {
    ...testContent.heroTraits,
    'battle-hardened': trait('battle-hardened', ['shaken']),
    shaken: trait('shaken', ['battle-hardened']),
    'quick-study': trait('quick-study'),
  };
  const earned = (traitKey: string, fields: Partial<TraitConsequence> = {}): TraitConsequence => ({ kind: 'trait', traitKey, chance: 1, ...fields });
  const injury = (fields: Partial<InjuryConsequence> = {}): InjuryConsequence => ({ kind: 'injury', typeKey: 'deep-cut', chance: 1, count: 1, ...fields });
  /** An Encounter the Party of 8s always meets at a Triumph, with `triumph`. */
  const triumphant = (key: string, triumph: Consequence[] = []): Encounter => ({ ...encounter(key, true), consequences: { success: [], failure: [], triumph } });
  /** An Encounter the Party of 8s always fails, with `failure`. */
  const failing = (key: string, failure: Consequence[] = []): Encounter => encounter(key, false, failure);

  /** The scene through `encounters`, of `size` Heroes, each set by `set`, with no Loot unless `loot`. */
  function earning(
    seed: string,
    encounters: Encounter[],
    {
      size = 3,
      set = (() => undefined) as (heroes: Hero[]) => void,
      traits = heroTraits as ContentSet['heroTraits'],
      loot = false,
      config = {} as Partial<EngineDeps['config']>,
    } = {},
  ) {
    const s = scene(seed, { ...contentWith(...encounters), synergies: {}, heroTraits: traits }, encounters.map((it) => it.key), { size });
    s.quest.lootTableKey = loot ? 'lesser-loot' : null;
    set(s.heroes);
    const deps = { ...s.deps, config: { ...s.deps.config, ...config } };
    return { ...s, deps, resolve: () => resolveQuest(s.world, s.quest, s.party, deps) };
  }

  test('a positive Trait drawn on a Triumph is granted on a strong success, naming the Encounter, and not on a plain one', () => {
    const strong = earning('strong', [triumphant('feat', [earned('quick-study')]), triumphant('again')]);
    const { outcome, traits } = strong.resolve();
    expect(outcome.band).toBe('strong');
    expect(traits).toHaveLength(1);
    expect(traits[0]).toMatchObject({ traitKey: 'quick-study', encounterIndex: 0, encounterKey: 'feat' });
    expect(strong.party.heroIds).toContain(traits[0]?.heroId);

    // The same Triumph, held: a third Encounter failed leaves a plain success, and nothing is granted.
    const plain = earning('strong', [triumphant('feat', [earned('quick-study')]), triumphant('again'), failing('lost')]);
    const resolved = plain.resolve();
    expect(resolved.outcome.band).toBe('success');
    expect(resolved.traits).toEqual([]);
  });

  test("takes its two draws in its place whether or not it lands, before Loot's, and a chance of 0 grants nothing", () => {
    for (let seed = 0; seed < 10; seed += 1) {
      const sequence = (consequences: Consequence[]) => [triumphant('feat', consequences), triumphant('again')];
      const without = earning(`draws-${seed}`, sequence([{ kind: 'fame', delta: 1 }]), { loot: true });
      const twin = structuredClone(without.world);
      const lands = earning(`draws-${seed}`, sequence([earned('quick-study'), { kind: 'fame', delta: 1 }]), { loot: true });
      const misses = earning(`draws-${seed}`, sequence([earned('quick-study', { chance: 0 }), { kind: 'fame', delta: 1 }]), { loot: true });

      const plain = without.resolve();
      const landed = lands.resolve();
      const missed = misses.resolve();

      expect(landed.traits).toHaveLength(1);
      expect(missed.traits).toEqual([]);
      expect(streamOf(misses.world, 'quests')).toEqual(streamOf(lands.world, 'quests'));
      // Two Checks, then the Trait's two draws, then Loot's: a twin of the Quest without it, two draws on.
      for (let draw = 0; draw < 2 + 2; draw += 1) next(streamOf(twin, 'quests'));
      expect(landed.loot).toEqual(drawLoot(twin, lands.quest, 'strong', lands.deps));
      expect(streamOf(lands.world, 'quests')).toEqual(streamOf(twin, 'quests'));
      expect(plain.outcome).toEqual(landed.outcome);
    }
  });

  test('with no one who may take it, still takes its two draws: all hold it, it conflicts, among names no one, or the Encounter injured no one', () => {
    const warriors: SetQuery = ['where', 'party', ['class', 'warrior']];
    const fame: Consequence = { kind: 'fame', delta: 1 };
    const unhurt = injury({ chance: 0 });
    const cases: [string, (consequences: Consequence[]) => Encounter[], Consequence, (heroes: Hero[]) => void][] = [
      ['all hold it', (it) => [triumphant('feat', it), triumphant('again')], earned('quick-study'), (heroes) => heroes.forEach((hero) => hero.traits.push('quick-study'))],
      ['it conflicts', (it) => [triumphant('feat', it), triumphant('again')], earned('battle-hardened'), (heroes) => heroes.forEach((hero) => hero.traits.push('shaken'))],
      ['among names no one', (it) => [triumphant('feat', it), triumphant('again')], earned('quick-study', { among: warriors }), (heroes) => heroes.forEach((hero) => (hero.classKey = 'mage'))],
      ['the Encounter injured no one', (it) => [failing('ambush', [unhurt, ...it])], earned('shaken'), () => undefined],
    ];
    for (const [why, sequence, trait, set] of cases) {
      const without = earning(`none-${why}`, sequence([fame]), { set });
      const twin = structuredClone(without.world);
      const plain = without.resolve();
      const withIt = earning(`none-${why}`, sequence([trait, fame]), { set });
      const resolved = withIt.resolve();

      expect(resolved.traits, why).toEqual([]);
      expect(resolved.outcome, why).toEqual(plain.outcome);
      // The twin, resolved without it, then two draws on: what the Trait drew from no one.
      resolveQuest(twin, without.quest, without.party, without.deps);
      next(streamOf(twin, 'quests'));
      next(streamOf(twin, 'quests'));
      expect(streamOf(withIt.world, 'quests'), why).toEqual(streamOf(twin, 'quests'));
    }
  });

  test("a held positive Trait does not keep a negative one from its Hero, and the negative one stands in its place on a strong success", () => {
    // Strong at two Encounters of three at Success or better, so a Failure leaves the band strong.
    const config = { bandBySuccessShare: { successAbove: 0.5, strongAtLeast: 0.6 }, strongTriumphShare: 0.5 };
    const h = earning('held-then-hurt', [triumphant('feat', [earned('quick-study')]), triumphant('again'), failing('ambush', [injury(), earned('one-eyed')])], {
      size: 1,
      config,
    });
    const { outcome, encounters, traits } = h.resolve();
    expect(outcome.band).toBe('strong');
    expect(encounters[2]?.injured).toEqual([h.heroes[0]?.id]);
    expect(traits).toEqual([{ heroId: h.heroes[0]?.id, traitKey: 'one-eyed', encounterIndex: 2, encounterKey: 'ambush' }]);
  });

  test('draws whether it lands, then on whom by pick among those who may take it', () => {
    for (let seed = 0; seed < 20; seed += 1) {
      const h = earning(`whom-${seed}`, [triumphant('feat', [earned('quick-study', { chance: 0.5 })]), triumphant('again')]);
      const twin = structuredClone(streamOf(h.world, 'quests'));
      const { traits } = h.resolve();
      next(twin);
      const lands = chance(twin, 0.5);
      const who = h.heroes[int(twin, 0, h.heroes.length - 1)] as Hero;
      expect(traits.map((it) => it.heroId)).toEqual(lands ? [who.id] : []);
    }
  });

  test('a negative Trait falls only on a Hero that Encounter injured', () => {
    for (let seed = 0; seed < 20; seed += 1) {
      const h = earning(`shaken-${seed}`, [failing('ambush', [injury(), earned('shaken')])]);
      const { encounters, traits } = h.resolve();
      expect(traits).toEqual([{ heroId: encounters[0]?.injured[0], traitKey: 'shaken', encounterIndex: 0, encounterKey: 'ambush' }]);
    }
    // No one injured by that Encounter, though one is hurt from the one before: it falls on no one.
    const h = earning('shaken-none', [failing('ambush', [injury()]), failing('rout', [injury({ chance: 0 }), earned('shaken')])]);
    const { encounters, traits } = h.resolve();
    expect(encounters[0]?.injured).toHaveLength(1);
    expect(traits).toEqual([]);
  });

  test("a negative Trait is granted only at a Failure: at a Setback that reads the failure list it lands on no one, its two draws still taken (v1.1.4-S14)", () => {
    // One Check of summed Strength, 24 against a target of 0.7 × 40 = 28: at 0.86 of it, a Setback (0.75 to 1).
    const setback = (key: string, failure: Consequence[]): Encounter => ({
      ...encounter(key, false),
      checks: [oldFormCheck(key, key, 'sum', [['strength', 1]], [], 0.7)],
      consequences: { success: [], failure },
    });
    for (let seed = 0; seed < 10; seed += 1) {
      const without = earning(`setback-${seed}`, [setback('ambush', [injury()])]);
      const twin = structuredClone(without.world);
      const plain = without.resolve();
      const withIt = earning(`setback-${seed}`, [setback('ambush', [injury(), earned('shaken')])]);
      const { encounters, traits, outcome } = withIt.resolve();

      expect(encounters[0]?.degree).toBe('setback');
      expect(encounters[0]?.injured).toHaveLength(1);
      expect(traits).toEqual([]);
      expect(outcome).toEqual(plain.outcome);
      // The twin, resolved without it, then two draws on: what the Trait drew though it could not land.
      resolveQuest(twin, without.quest, without.party, without.deps);
      next(streamOf(twin, 'quests'));
      next(streamOf(twin, 'quests'));
      expect(streamOf(withIt.world, 'quests')).toEqual(streamOf(twin, 'quests'));
    }
  });

  test('a negative Trait on a Failure is granted on a failed Quest, and a Hero who died on the Quest gains none', () => {
    const hurt: SetQuery = ['where', 'party', ['hurt']];
    const kept = earning('kept', [failing('ambush', [injury(), earned('shaken')])], { size: 1 }).resolve();
    expect([kept.outcome.band, kept.traits.length]).toEqual(['fail', 1]);
    const died = earning('died', [failing('ambush', [injury(), earned('shaken'), { kind: 'death', chance: 1, among: hurt }])], { size: 1 }).resolve();
    expect(died.outcome.deaths).toHaveLength(1);
    expect(died.traits).toEqual([]);
  });

  test('no Hero gains two in one Quest, one they hold, or one that conflicts with one they hold', () => {
    // Two in one Quest: one Hero, three Traits drawn for certain; the first stands.
    const one = earning('two', [triumphant('feat', [earned('quick-study'), earned('battle-hardened')]), triumphant('again', [earned('scarred')])], { size: 1 });
    expect(one.resolve().traits.map((it) => it.traitKey)).toEqual(['quick-study']);
    // Three Heroes, four drawn for certain: one each, to three Heroes.
    const three = earning('each', [triumphant('feat', [earned('quick-study'), earned('battle-hardened'), earned('scarred'), earned('lame')])]);
    const granted = three.resolve().traits;
    expect(granted.map((it) => it.traitKey)).toEqual(['quick-study', 'battle-hardened', 'scarred']);
    expect(new Set(granted.map((it) => it.heroId)).size).toBe(3);

    // One they hold: only the Hero who lacks it may take it.
    const held = earning('held', [triumphant('feat', [earned('quick-study')]), triumphant('again')], {
      set: (heroes) => heroes.slice(0, 2).forEach((hero) => hero.traits.push('quick-study')),
    });
    expect(held.resolve().traits.map((it) => it.heroId)).toEqual([held.heroes[2]?.id]);
    const all = earning('all-held', [triumphant('feat', [earned('quick-study')]), triumphant('again')], { set: (heroes) => heroes.forEach((hero) => hero.traits.push('quick-study')) });
    expect(all.resolve().traits).toEqual([]);

    // One that conflicts, either way round: `shaken` excludes `battle-hardened` from its own side only.
    for (const traits of [heroTraits, { ...heroTraits, 'battle-hardened': trait('battle-hardened') }]) {
      const shaken = earning('conflict', [triumphant('feat', [earned('battle-hardened')]), triumphant('again')], {
        traits,
        set: (heroes) => heroes.forEach((hero) => hero.traits.push('shaken')),
      });
      expect(shaken.resolve().traits).toEqual([]);
    }
  });

  test('among names who it may fall on, and when it names no one it falls on no one', () => {
    const warriors: SetQuery = ['where', 'party', ['class', 'warrior']];
    const classes = (...keys: string[]) => (heroes: Hero[]) => heroes.forEach((hero, index) => (hero.classKey = keys[index] ?? hero.classKey));
    for (let seed = 0; seed < 10; seed += 1) {
      const h = earning(`among-${seed}`, [triumphant('feat', [earned('quick-study', { among: warriors })]), triumphant('again')], { set: classes('mage', 'warrior', 'rogue') });
      expect(h.resolve().traits.map((it) => it.heroId)).toEqual([h.heroes[1]?.id]);
    }
    const none = earning('among-none', [triumphant('feat', [earned('quick-study', { among: warriors })]), triumphant('again')], { set: classes('mage', 'mage', 'rogue') });
    expect(none.resolve().traits).toEqual([]);
  });

  // #52's judgement call 6 (DL-182 item 3, v1.1.5's re-close, DL-185): an earned Trait's `among` is read
  // over the Heroes it can fall on, as an Injury's is (v1.1.5-S4, `narrowed`), not over the whole Party.
  test("a negative Trait's `bottom` among ranks those the Encounter injured, so the weakest Hero, unhurt there, is passed over; its two draws as before", () => {
    const weakest: SetQuery = ['bottom', 'party', 1, ['stat', 'strength']];
    const strongest: SetQuery = ['top', 'party', 1, ['stat', 'strength']];
    // Party order 12, 4, 8: the weakest second; the Injury falls on the strongest, the first.
    const strengths = (heroes: Hero[]): void => [12, 4, 8].forEach((value, index) => ((heroes[index] as Hero).stats['strength'] = value));
    for (let seed = 0; seed < 20; seed += 1) {
      const h = earning(`pool-${seed}`, [failing('ambush', [injury({ among: strongest }), earned('shaken', { among: weakest })])], { set: strengths });
      h.quest.lootTableKey = null;
      const twin = structuredClone(streamOf(h.world, 'quests'));
      const { encounters, traits } = h.resolve();
      expect(encounters[0]?.injured).toEqual([h.heroes[0]?.id]);
      // Read over the whole Party, the `bottom` would name the second Hero, whom the Encounter did not injure, and no one would take it.
      expect(traits).toEqual([{ heroId: h.heroes[0]?.id, traitKey: 'shaken', encounterIndex: 0, encounterKey: 'ambush' }]);
      // One Check's draw, the Injury's three, then the Trait's two, whether it lands and on whom.
      for (let draw = 0; draw < 1 + 3 + 2; draw += 1) next(twin);
      expect(streamOf(h.world, 'quests')).toEqual(twin);
    }
  });

  test("a positive Trait's among still reads the living Party, which is its pool: the weakest named", () => {
    const weakest: SetQuery = ['bottom', 'party', 1, ['stat', 'strength']];
    const strengths = (heroes: Hero[]): void => [12, 4, 8].forEach((value, index) => ((heroes[index] as Hero).stats['strength'] = value));
    for (let seed = 0; seed < 10; seed += 1) {
      const h = earning(`living-${seed}`, [triumphant('feat', [earned('quick-study', { among: weakest })]), triumphant('again')], { set: strengths });
      expect(h.resolve().traits.map((it) => it.heroId)).toEqual([h.heroes[1]?.id]);
    }
  });
});

describe("a Hero Trait's effects in a Check (v1.1.4-S7)", () => {
  const withEffects = (key: string, effects: HeroTraitEffect[]) => ({ key, name: key, excludes: [], effects });
  const heroTraits = {
    ...testContent.heroTraits,
    lame: withEffects('lame', [{ kind: 'statModifiers', modifiers: { strength: -2, endurance: -1 } }]),
    veteran: withEffects('veteran', [{ kind: 'encounterBonus', flat: 5, kinds: ['combat'] }]),
    'tomb-wise': withEffects('tomb-wise', [{ kind: 'encounterBonus', flat: 3, tags: ['undead'] }]),
  };
  const content = { ...contentWith(encounter('strength', true)), synergies: {}, heroTraits };

  test("a Stat change shows in the Check: a lame Hero adds 2 less Strength to a sum", () => {
    const s = scene('lame', content, ['strength']);
    const party = () => queryParty(s.heroes, s.world, s.deps);
    const check = (s.deps.content.encounters['strength'] as Encounter);
    const before = checkCapability(party(), check, onlyCheckOf(check), s.world, s.deps);
    (s.heroes[0] as Hero).traits.push('lame');
    const form = party().members[0]?.form ?? 1;
    expect(checkCapability(party(), check, onlyCheckOf(check), s.world, s.deps)).toBeCloseTo(before - 2 * form * teamwork(s.heroes, s.world, s.deps), 10);
  });

  test('an Encounter bonus applies once however many hold it, to an Encounter of its kinds or tags, and never to a raw Check', () => {
    const s = scene('bonus', content, ['strength']);
    const check = s.deps.content.encounters['strength'] as Encounter;
    const at = (target: Parameters<typeof checkCapability>[1], it = onlyCheckOf(check)) => checkCapability(queryParty(s.heroes, s.world, s.deps), target, it, s.world, s.deps);
    const plain = at(check);
    (s.heroes[0] as Hero).traits.push('veteran');
    expect(at(check)).toBeCloseTo(plain + 5, 10);
    for (const hero of s.heroes) if (!hero.traits.includes('veteran')) hero.traits.push('veteran');
    expect(at(check)).toBeCloseTo(plain + 5, 10);
    expect(at({ kind: 'travel' })).toBeCloseTo(plain, 10);
    // Tags: an Encounter of v1.1.4-S8's shape, sharing one, gains it; one sharing none does not.
    (s.heroes[1] as Hero).traits.push('tomb-wise');
    expect(at({ kind: 'combat', tags: ['crypt', 'undead'] })).toBeCloseTo(plain + 5 + 3, 10);
    expect(at({ kind: 'combat', tags: ['crypt'] })).toBeCloseTo(plain + 5, 10);
    // A raw Check is its score alone (DL-152).
    const raw: EncounterCheck = { ...onlyCheckOf(check), raw: true };
    expect(at(check, raw)).toBe(at({ kind: 'travel' }, raw));
  });
});

describe('a Finale and Loot (v1.1.4-S8)', () => {
  // Two Encounters: `easy`, always a Triumph, then `last`, whose one Check is aimed so its roll
  // lands about the Triumph line: a Success leaves the Quest strong (every Encounter at Success or
  // better, half Triumphs), so only the Finale's rule keeps Loot from it.
  const config = { checkVariance: 0.2 };

  /** The scene's Quest through `easy` then `last`, given a Loot table, `last` aimed at 1 ÷ 1.2 of the Party's capability. */
  function finaleScene(seed: string, finale: boolean): Scene {
    const easy = encounter('easy', true);
    const plain = contentWith(easy, encounter('last', true));
    const s = scene(seed, plain, ['easy', 'last']);
    const last = plain.encounters['last'] as Encounter;
    const aim = checkCapability(queryParty(s.heroes, s.world, s.deps), last, onlyCheckOf(last), s.world, s.deps) / 1.2;
    const aimed: Encounter = { ...last, checks: [{ ...onlyCheckOf(last), difficultyFactor: 0, flat: aim }] };
    const template = s.deps.content.questTemplates[s.quest.templateKey];
    if (template === undefined) throw new Error(`No template ${s.quest.templateKey}`);
    const content: ContentSet = {
      ...contentWith(easy, aimed),
      questTemplates: { ...testContent.questTemplates, [template.key]: { ...template, ...(finale ? { finale: 'last' } : {}) } },
    };
    s.deps = testDeps({ ...pinned, ...config }, content);
    s.quest.lootTableKey = 'lesser-loot';
    return s;
  }

  test("Loot is never drawn on a Quest whose Finale did not end a Triumph, and is on one whose Finale did; its two draws taken whatever happens", () => {
    const seen = new Map<string, number>();
    for (let seed = 0; seed < 120; seed += 1) {
      const withFinale = finaleScene(`finale-${seed}`, true);
      const without = finaleScene(`finale-${seed}`, false);
      const resolved = resolveQuest(withFinale.world, withFinale.quest, withFinale.party, withFinale.deps);
      const plain = resolveQuest(without.world, without.quest, without.party, without.deps);
      const degree = resolved.encounters.at(-1)?.degree ?? 'unmet';
      const key = `${degree} ${resolved.outcome.band}`;
      seen.set(key, (seen.get(key) ?? 0) + 1);

      // The same rolls and band either way, and the same draws: only the award differs.
      expect(resolved.encounters).toEqual(plain.encounters);
      expect(streamOf(withFinale.world, 'quests')).toEqual(streamOf(without.world, 'quests'));
      if (degree === 'triumph') expect(resolved.loot, key).toEqual(plain.loot);
      else expect(resolved.loot, key).toBeNull();
      if (resolved.outcome.band === 'strong') expect(plain.loot, key).not.toBeNull();
    }
    // The case the rule is for, a strong success with the Finale a plain Success, and the Triumphs, were both met.
    expect(seen.get('success strong') ?? 0).toBeGreaterThan(0);
    expect(seen.get('triumph strong') ?? 0).toBeGreaterThan(0);
  });

  test('a Party that falls before its Finale brings no Loot home, however the Encounters before went', () => {
    const killer = encounter('killer', false, [{ kind: 'death', chance: 1 }]);
    const s = finaleScene('fallen', true);
    const content: ContentSet = { ...s.deps.content, encounters: { ...s.deps.content.encounters, killer } };
    const deps = testDeps({ ...pinned, ...config, bandBySuccessShare: { successAbove: 0, strongAtLeast: 0 }, strongTriumphShare: 0 }, content);
    const quest = { ...s.quest, encounterKeys: ['easy', 'killer', 'killer', 'killer', 'last'] };
    const resolved = resolveQuest(s.world, quest, s.party, deps);
    expect(resolved.outcome.deaths).toHaveLength(3);
    expect(resolved.encounters.map((it) => it.encounterKey)).toEqual(['easy', 'killer', 'killer', 'killer']);
    expect(resolved.outcome.band).toBe('strong');
    expect(resolved.loot).toBeNull();
  });

  test("an Encounter bonus by tag applies to an Encounter whose tags content writes, through the resolver (DL-159's seam)", () => {
    const withEffects = (key: string, effects: HeroTraitEffect[]) => ({ key, name: key, excludes: [], effects });
    const heroTraits = { ...testContent.heroTraits, 'tomb-wise': withEffects('tomb-wise', [{ kind: 'encounterBonus', flat: 3, tags: ['dark'] }]) };
    const dark: Encounter = { ...encounter('dark', true), tags: ['dark', 'delve'] };
    const light: Encounter = { ...encounter('light', true), tags: ['town'] };
    const content = { ...contentWith(dark, light), synergies: {}, heroTraits };
    const capabilities = (traits: string[]) => {
      const s = scene('tagged', content, ['dark', 'light']);
      (s.heroes[0] as Hero).traits.push(...traits);
      return resolveQuest(s.world, s.quest, s.party, s.deps).encounters.map((it) => it.checks[0]?.capability ?? 0);
    };
    const [darkBefore = 0, lightBefore = 0] = capabilities([]);
    const [darkAfter = 0, lightAfter = 0] = capabilities(['tomb-wise']);
    expect(darkAfter).toBeCloseTo(darkBefore + 3, 10);
    expect(lightAfter).toBeCloseTo(lightBefore, 10);
  });
});

/** An Encounter's one Check. */
function onlyCheckOf(it: Encounter): EncounterCheck {
  return it.checks[0] as EncounterCheck;
}
