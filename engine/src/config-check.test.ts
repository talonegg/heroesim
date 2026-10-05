import { describe, expect, test } from 'vitest';
import { chanceBandNames, defaultConfig, moraleBandNames, type GameConfig } from './config.js';
import { checkConfig, configRules, playConfig, playDeps } from './config-check.js';
import type { Module } from './modules.js';
import { cyrb128, int } from './rng.js';
import { testContent, testMeta } from './world.test-support.js';

// v1.1.6-S7 (DL-186 item 12, DL-193): every setting checked, from one table of rules, before any play.

const content = testContent;

/** The settings a config with `changes` breaks the rules of. */
const broken = (changes: Readonly<Record<string, unknown>>): string[] => checkConfig({ ...defaultConfig, ...changes }).map((problem) => problem.setting);

describe('the rules', () => {
  test('one for every setting of GameConfig, and none for a setting it lacks: 120 settings', () => {
    expect(Object.keys(configRules).sort()).toEqual(Object.keys(defaultConfig).sort());
    expect(Object.keys(configRules)).toHaveLength(120);
  });

  test('the defaults break none', () => {
    expect(checkConfig(defaultConfig)).toEqual([]);
  });

  test('a setting missing is named, as missing', () => {
    const config: Record<string, unknown> = { ...defaultConfig };
    delete config['boardSize'];
    expect(checkConfig(config)).toEqual([{ setting: 'boardSize', message: 'boardSize is missing; it is a whole number, at least 0' }]);
  });

  test('a problem names its setting, its value and what it is to be, in GameConfig\'s order', () => {
    expect(checkConfig({ ...defaultConfig, checkVariance: 2, boardSize: -1 })).toEqual([
      { setting: 'boardSize', message: 'boardSize is -1; it is a whole number, at least 0' },
      { setting: 'checkVariance', message: 'checkVariance is 2; it is a share from 0 to 1' },
    ]);
  });

  test('a whole number is a safe integer, as `int` asks of its bounds', () => {
    expect(broken({ startingWealth: 2 ** 53 - 1 })).toEqual([]);
    expect(broken({ startingWealth: 2 ** 53 })).toEqual(['startingWealth']);
    expect(broken({ heroStartingAgeMax: 1e17 })).toContain('heroStartingAgeMax');
    expect(broken({ rivalStartingWealthMin: -(2 ** 53) })).toContain('rivalStartingWealthMin');
  });

  test('never throws, whatever a save holds', () => {
    for (const value of [null, 'x', {}, true, Number.NaN, undefined]) {
      for (const setting of Object.keys(defaultConfig)) {
        expect(() => checkConfig({ ...defaultConfig, [setting]: value }), `${setting} = ${String(value)}`).not.toThrow();
        expect(broken({ [setting]: value }), `${setting} = ${String(value)}`).toContain(setting);
      }
    }
  });
});

// Each setting's own values: those its rule refuses, naming it, and those it allows at its edges, so
// that each rule fails under a mutation of its bound, its whole-number test or its kind. (A value may
// break another setting's rule too: a Morale band outside a new `moraleMax`.)
type Case = { refused: readonly unknown[]; allowed: readonly unknown[] };
const wholeFrom = (min: number): Case => ({ refused: [min - 1, min + 0.5, Number.POSITIVE_INFINITY], allowed: [min, min + 1] });
const finiteFrom = (min: number): Case => ({ refused: [min - 0.01, Number.NaN, Number.POSITIVE_INFINITY], allowed: [min, min + 0.5] });
const finiteAbove = (above: number): Case => ({ refused: [above, above - 1, Number.NaN], allowed: [above + 0.001, above + 2.5] });
const finiteTo = (max: number): Case => ({ refused: [max + 0.01, Number.NaN, Number.NEGATIVE_INFINITY], allowed: [max, max - 3.5] });
const share: Case = { refused: [-0.01, 1.01, Number.NaN], allowed: [0, 0.5, 1] };
const anyWhole: Case = { refused: [0.5, Number.NaN, '3'], allowed: [-7, 0, 7] };
const anyFinite: Case = { refused: [Number.NaN, Number.POSITIVE_INFINITY, '1'], allowed: [-1.5, 0, 2.5] };

const cases: { readonly [Setting in keyof GameConfig]-?: Case } = {
  turnsPerYear: { refused: [0, 1080.5, Number.POSITIVE_INFINITY], allowed: [1, 20, 1080] },
  startingRosterSize: wholeFrom(0),
  startingWealth: anyWhole,
  rivalCount: wholeFrom(0),
  rivalRosterMin: { refused: [-1, 0.5], allowed: [0, 4] },
  rivalRosterMax: { refused: [3, 4.5], allowed: [4, 9] },
  rivalHireReserveUpkeeps: finiteFrom(0),
  rivalStartingWealthMin: { refused: [1.5, Number.NaN], allowed: [-100, 0, 700] },
  rivalStartingWealthMax: { refused: [299, 300.5], allowed: [300, 701] },
  patronCount: wholeFrom(1),
  unattachedPoolSize: wholeFrom(0),
  heroStartingAgeMin: { refused: [-1, 18.5], allowed: [0, 36] },
  heroStartingAgeMax: { refused: [17, 20.5], allowed: [18, 60] },
  heroSexWeights: {
    refused: [
      { female: 0, male: 0 },
      { female: -1, male: 2 },
      { female: 1, male: Number.NaN },
      { female: 1 },
      { female: 1, male: 1, other: 1 },
      [1, 1],
      '1',
    ],
    allowed: [{ female: 1, male: 1 }, { female: 0, male: 3 }, { female: 0.25, male: 0 }],
  },
  statBaseMin: { refused: [-1, 2.5], allowed: [0, 10] },
  statBaseMax: { refused: [2, 10.5], allowed: [3, 12] },
  statBiasMin: { refused: [-1, 1.5], allowed: [0, 4] },
  statBiasMax: { refused: [1, 4.5], allowed: [2, 6] },
  potentialGapMin: { refused: [-1, 2.5], allowed: [0, 12] },
  potentialGapMax: { refused: [2, 12.5], allowed: [3, 20] },
  startingSkillsMin: { refused: [-1, 0.5], allowed: [0, 2] },
  startingSkillsMax: { refused: [0, 2.5], allowed: [1, 3] },
  // A Skill rating, 1 to 5 (`SkillRating`): the Hero generator draws a starting rating up to it (DL-205's verification).
  startingSkillRatingMax: { refused: [0, 1.5, 6, Number.POSITIVE_INFINITY], allowed: [1, 5] },
  moraleBaseline: { refused: [-0.5, 100.5, Number.NaN], allowed: [0, 60.5, 100] },
  guildmasterStartingAgeMin: { refused: [-1, 21.5], allowed: [0, 50] },
  guildmasterStartingAgeMax: { refused: [20, 50.5], allowed: [21, 60] },
  guildmasterStatMin: { refused: [-1, 5.5], allowed: [0, 15] },
  guildmasterStatMax: { refused: [4, 15.5], allowed: [5, 20] },
  guildmasterStatPoints: wholeFrom(0),
  guildmasterTraitsMin: { refused: [-1, 0.5], allowed: [0, 2] },
  guildmasterTraitsMax: { refused: [-1, 2.5], allowed: [0, 3] },
  guildmasterTraitBudget: anyFinite,
  upkeepEveryDays: wholeFrom(1),
  wagePerLevel: wholeFrom(0),
  hallMaintenancePerGrade: wholeFrom(0),
  bankruptcyFloor: anyWhole,
  bankruptcyGraceDays: wholeFrom(0),
  fameFloor: anyWhole,
  signingFeeBase: wholeFrom(0),
  signingFeePerLevel: wholeFrom(0),
  signingFeeStatDivisor: finiteAbove(0),
  unattachedStayDays: wholeFrom(0),
  fameRequiredPerLevel: finiteFrom(0),
  boardSize: wholeFrom(0),
  questOfferDays: wholeFrom(1),
  questDifficultyMin: { refused: [0, 10.5], allowed: [1, 100] },
  questDifficultyMax: { refused: [9, 100.5], allowed: [10, 120] },
  encounterTagWeight: { refused: [0.99, 0, -3, Number.NaN, Number.POSITIVE_INFINITY], allowed: [1, 3.5] },
  checkVariance: share,
  skillBonusPerRating: finiteFrom(0),
  bandBySuccessShare: {
    refused: [{ successAbove: 0.5, strongAtLeast: 0.5 }, { successAbove: -0.1, strongAtLeast: 1 }, { successAbove: 0.5, strongAtLeast: 1.1 }, { successAbove: 0.5 }, 0.5],
    allowed: [{ successAbove: 0, strongAtLeast: 1 }, { successAbove: 0.4, strongAtLeast: 0.41 }],
  },
  checkDegrees: {
    refused: [
      { triumph: 1, success: 1, setback: 0.75 },
      { triumph: 1.25, success: 1, setback: 1.1 },
      { triumph: 1.25, success: 1, setback: 0 },
      { triumph: Number.NaN, success: 1, setback: 0.75 },
      { triumph: 1.25, success: 1 },
    ],
    allowed: [{ triumph: 1.01, success: 1, setback: 0.01 }],
  },
  strongTriumphShare: share,
  moraleCheckFactor: {
    refused: [
      ...[0, -1, Number.NaN, Number.POSITIVE_INFINITY, undefined].flatMap((bad) => moraleBandNames.map((band) => ({ ...defaultConfig.moraleCheckFactor, [band]: bad }))),
      { wretched: 0.93, low: 0.97, high: 1.03, elated: 1.06 },
      { ...defaultConfig.moraleCheckFactor, steady: 1.02 },
      { ...defaultConfig.moraleCheckFactor, wretched: 0.95, low: 0.93 },
      { ...defaultConfig.moraleCheckFactor, low: 1.01 },
      { ...defaultConfig.moraleCheckFactor, high: 0.99 },
      { ...defaultConfig.moraleCheckFactor, elated: 1.02 },
    ],
    allowed: [{ wretched: 1, low: 1, steady: 1, high: 1, elated: 1 }, { wretched: 0.5, low: 0.5, steady: 1, high: 2, elated: 2 }],
  },
  hurtCheckFactor: { refused: [0, -0.5, 1.01, Number.NaN, Number.POSITIVE_INFINITY], allowed: [0.01, 1] },
  exposureRange: { refused: [-1, Number.NaN, Number.POSITIVE_INFINITY, undefined], allowed: [0, 2] },
  guardRange: { refused: [-0.1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, undefined], allowed: [0, 1] },
  chanceBands: {
    refused: [
      { unlikely: 0, even: 0.35, likely: 0.65, 'near-certain': 0.9 },
      { unlikely: 0.1, even: 0.35, likely: 0.65, 'near-certain': 1 },
      { unlikely: 0.35, even: 0.35, likely: 0.65, 'near-certain': 0.9 },
      { unlikely: 0.1, even: 0.65, likely: 0.35, 'near-certain': 0.9 },
      { unlikely: 0.1, even: Number.NaN, likely: 0.65, 'near-certain': 0.9 },
      { unlikely: 0.1, even: 0.35, likely: 0.65 },
      { unlikely: 0.1, even: 0.35, likely: 0.65, 'near-certain': 0.9, hopeless: 0 },
      undefined,
    ],
    allowed: [{ unlikely: 0.01, even: 0.02, likely: 0.98, 'near-certain': 0.99 }],
  },
  playerPartyMargin: { refused: [-0.05, 1.5, Number.NaN], allowed: [0, 0.5, 1] },
  moraleMin: { refused: [-0.5, 0.5, Number.NaN, '0'], allowed: [-7, 0] },
  moraleMax: { refused: [-1, 100.5, Number.NaN], allowed: [100, 120] },
  moraleDrift: finiteFrom(0),
  moraleBands: {
    refused: [
      { wretched: -1, low: 20, steady: 40, high: 75, elated: 90 },
      { wretched: 0, low: 20, steady: 40, high: 75, elated: 101 },
      { wretched: 0, low: 40, steady: 40, high: 75, elated: 90 },
      { wretched: 0, low: 40, steady: 20, high: 75, elated: 90 },
      { wretched: 0, low: 20, steady: 40, high: 75 },
    ],
    allowed: [{ wretched: 0, low: 1, steady: 2, high: 99, elated: 100 }],
  },
  moraleOnRosterDeath: finiteTo(0),
  moraleOnStrongSuccess: finiteFrom(0),
  heroRetirementAge: wholeFrom(0),
  heroRetirementChancePerYear: share,
  heroRetirementInjuredMultiplier: finiteFrom(0),
  infirmaryHealFactor: { refused: [[], [1, 0.5, 0, 0.25], [1, 0.5, Number.NaN, 0.25], [1, Number.POSITIVE_INFINITY], [1, '0.5'], 1], allowed: [[1], [1, 0.5, 0.3], [1, 1, 1, 1], [1, 0.5, 0.3, 0.2, 0.1], [2, 1, 0.5, 0.01]] },
  quartersMoraleBonus: finiteFrom(0),
  potentialHintBands: {
    refused: [{ modest: -1, promising: 6, exceptional: 10 }, { modest: 0, promising: 10, exceptional: 6 }, { modest: 0, promising: 6, exceptional: 6 }],
    allowed: [{ modest: 0, promising: 0.5, exceptional: 30 }],
  },
  declineAge: wholeFrom(0),
  declinePerYear: wholeFrom(0),
  declineAreas: { refused: [['physical', 'physical'], ['physical', 'spiritual'], 'physical', [1]], allowed: [[], ['physical'], ['mental', 'physical'], ['magical', 'social']] },
  guildmasterRetirementAge: wholeFrom(0),
  rivalReplacementDays: wholeFrom(0),
  xpCurveBase: finiteAbove(0),
  xpCurveExponent: finiteFrom(0),
  levelCap: wholeFrom(1),
  growthPointsPerLevel: wholeFrom(0),
  xpPerDifficultyPoint: finiteFrom(0),
  xpBandFactor: {
    refused: [{ fail: -0.5, success: 1, strong: 1 }, { fail: 0.5, success: 1 }, { fail: 0.5, success: Number.NaN, strong: 1 }, { fail: 0.5, success: 1, strong: 1, great: 2 }],
    allowed: [{ fail: 0, success: 0, strong: 0 }, { fail: 2, success: 1, strong: 0.5 }],
  },
  xpPerTrainingDay: finiteFrom(0),
  regardMin: { refused: [0, 1, Number.NaN], allowed: [-20, -25.5] },
  regardMax: { refused: [0, -1, Number.NaN], allowed: [20, 25.5] },
  regardBands: {
    refused: [
      { hostile: -21, cool: -12, neutral: -4, warm: 4, close: 12 },
      { hostile: -20, cool: -12, neutral: -4, warm: 4, close: 21 },
      { hostile: -20, cool: -4, neutral: -12, warm: 4, close: 12 },
      { hostile: -20, cool: -12, neutral: -12, warm: 4, close: 12 },
    ],
    allowed: [{ hostile: -20, cool: -19, neutral: 0, warm: 19, close: 20 }],
  },
  regardPerSharedQuest: finiteFrom(0),
  regardOnSuccessBonus: finiteFrom(0),
  regardDecayPerYear: finiteFrom(0),
  teamworkRange: share,
  patronRegardOnSuccess: finiteFrom(0),
  patronRegardOnFailure: finiteTo(0),
  patronRegardOnExpiry: finiteTo(0),
  patronRegardRecoveryPerYear: finiteFrom(0),
  boardRegardWeight: finiteFrom(0),
  negotiationRange: share,
  inspirationMoraleShift: finiteFrom(0),
  coachingFactor: finiteFrom(0),
  influenceFactor: finiteFrom(0),
  judgementHintSharpening: share,
  guildmasterRegardOnPatronSuccess: finiteFrom(0),
  guildmasterRegardOnPatronFailure: finiteTo(0),
  guildmasterRegardOnHeroSuccess: finiteFrom(0),
  guildmasterRegardOnHeroFailure: finiteTo(0),
  transferFeeFactor: finiteFrom(0),
  transferMoraleCost: finiteTo(0),
  transferRegardBand: { refused: ['fond', '', 3], allowed: ['hostile', 'close'] },
  guildmasterRegardPerTransferDeal: finiteFrom(0),
  transferOfferDays: wholeFrom(1),
  transferGeneratorEveryDays: wholeFrom(1),
  transferGeneratorChance: share,
  transferLockDays: wholeFrom(0),
  lootDifficultyThreshold: finiteFrom(0),
  lootOnBands: { refused: [['strong', 'strong'], ['great'], 'strong'], allowed: [[], ['fail', 'success', 'strong']] },
  lootOnFinaleDegrees: { refused: [['triumph', 'triumph'], ['strong'], ['unmet'], 'triumph'], allowed: [[], ['success', 'triumph'], ['failure', 'setback', 'success', 'triumph']] },
  marketSize: wholeFrom(0),
  marketStackMin: { refused: [0, 1.5], allowed: [1, 5] },
  marketStackMax: { refused: [0, 5.5], allowed: [1, 6] },
  sellRatio: { refused: [-0.01, 1, Number.NaN], allowed: [0, 0.99] },
  lootOnlyPrice: wholeFrom(0),
};

describe('each setting', () => {
  test('has its cases here, as it has its rule', () => {
    expect(Object.keys(cases).sort()).toEqual(Object.keys(configRules).sort());
  });

  test.each(Object.entries(cases))('%s: its rule refuses what it is not, naming it, and allows its edges', (setting, { refused, allowed }) => {
    for (const value of refused) {
      const problem = checkConfig({ ...defaultConfig, [setting]: value }).find((found) => found.setting === setting);
      expect(problem?.message.startsWith(`${setting} is `), JSON.stringify(value) ?? String(value)).toBe(true);
    }
    for (const value of allowed) expect(broken({ [setting]: value }), JSON.stringify(value)).toEqual([]);
  });
});

describe('a Min and its Max', () => {
  /** Every `<name>Min` with its `<name>Max` but Regard's, a scale around neutral, 0, whose rules are its own. */
  const pairs = Object.keys(defaultConfig).flatMap((setting) => {
    const max = setting.replace(/Min$/, 'Max') as keyof GameConfig;
    return setting.endsWith('Min') && setting !== 'regardMin' && Object.hasOwn(defaultConfig, max) ? [[setting as keyof GameConfig, max] as const] : [];
  });

  test('13 pairs, and Regard\'s scale', () => {
    expect(pairs).toHaveLength(13);
    expect(broken({ regardMin: 1, regardMax: 0 })).toEqual(expect.arrayContaining(['regardMin', 'regardMax']));
  });

  test.each(pairs)('%s ≤ its Max: the Max is refused below the Min, named, and allowed at it', (min, max) => {
    const at = (defaultConfig[min] as number) + 5;
    const settings = { ...defaultConfig, [min]: at };
    expect(configRules[max](at - 1, settings)).toBeDefined();
    expect(configRules[max](at, settings)).toBeUndefined();
    expect(broken({ [max]: (defaultConfig[min] as number) - 1 })).toContain(max);
  });

  test("the Max's words name the Min and its value", () => {
    expect(checkConfig({ ...defaultConfig, rivalRosterMax: 3 })).toEqual([
      { setting: 'rivalRosterMax', message: 'rivalRosterMax is 3; it is a whole number, at least rivalRosterMin (4)' },
    ]);
  });

  test('a Min that is no number is named alone, its Max not checked against it', () => {
    expect(broken({ rivalRosterMin: 'four' })).toEqual(['rivalRosterMin']);
  });

  /** The pairs `int` draws between: all but Morale's, a scale nothing draws a value on. */
  const drawn = pairs.filter(([min]) => min !== 'moraleMin');

  test.each(drawn)("%s to its Max: at most 2^32 values, as many as `int` draws from, the Max named past them", (min, max) => {
    const from = defaultConfig[min] as number;
    expect(broken({ [max]: from + 2 ** 32 - 1 })).toEqual([]);
    expect(() => int(cyrb128('span'), from, from + 2 ** 32 - 1)).not.toThrow();
    expect(broken({ [max]: from + 2 ** 32 })).toEqual([max]);
    expect(() => int(cyrb128('span'), from, from + 2 ** 32)).toThrow(RangeError);
  });

  test("a Min far below its Max is named on the Max, with the most a draw spans", () => {
    expect(checkConfig({ ...defaultConfig, rivalStartingWealthMin: -5_000_000_000 })).toEqual([
      {
        setting: 'rivalStartingWealthMax',
        message: 'rivalStartingWealthMax is 700; it is a whole number from rivalStartingWealthMin (-5000000000) to 4294967295 above it, the most a draw spans',
      },
    ]);
  });
});

describe('the bands, in their order', () => {
  test('the Morale bands, and the baseline, lie within moraleMin and moraleMax', () => {
    expect(broken({ moraleMin: 10 })).toEqual(['moraleBands']);
    expect(broken({ moraleMax: 80 })).toEqual(['moraleBands']);
    expect(broken({ moraleMin: 61 })).toEqual(['moraleBaseline', 'moraleBands']);
  });

  test('the Regard bands lie within regardMin and regardMax', () => {
    expect(broken({ regardMin: -10 })).toEqual(['regardBands']);
    expect(broken({ regardMax: 10 })).toEqual(['regardBands']);
  });

  test('the chance bands from unlikely, hopeless being below them', () => {
    expect(chanceBandNames[0]).toBe('hopeless');
    expect(checkConfig({ ...defaultConfig, chanceBands: { ...defaultConfig.chanceBands, even: 0.7 } })[0]?.message).toBe(
      'chanceBands is {"unlikely":0.1,"even":0.7,"likely":0.65,"near-certain":0.9}; it holds unlikely < even < likely < near-certain, each a finite number, above 0 and below 1',
    );
  });
});

describe('the lists a content release may outgrow: no rule reads the content (DL-193)', () => {
  test('a heal factor list of at least one is sound, whatever grades content has, a grade past it reading the last', () => {
    expect(broken({ infirmaryHealFactor: [1] })).toEqual([]);
    expect(broken({ infirmaryHealFactor: [1, 0.5, 0.25, 0.2, 0.1, 0.05, 0.01] })).toEqual([]);
    expect(broken({ infirmaryHealFactor: [] })).toEqual(['infirmaryHealFactor']);
    expect(checkConfig({ ...defaultConfig, infirmaryHealFactor: [] })[0]?.message).toBe(
      'infirmaryHealFactor is []; it is a list of at least one factor, one for each infirmary grade from 0, a grade past the list reading the last, each a finite number above 0',
    );
  });

  test("the decline's areas may be any Stat areas, whether or not content has a Hero Stat of each, none twice", () => {
    expect(broken({ declineAreas: ['social', 'magical'] })).toEqual([]);
    expect(broken({ declineAreas: ['physical', 'physical'] })).toEqual(['declineAreas']);
    expect(checkConfig({ ...defaultConfig, declineAreas: ['spiritual'] })[0]?.message).toBe(
      'declineAreas is ["spiritual"]; it is a list of physical, mental, magical, social, none twice',
    );
  });
});

describe('playConfig', () => {
  test("is the defaults with the saved values over them, a setting the save lacks the default's, a field GameConfig lacks left out", () => {
    const saved = { boardSize: 3, retiredField: 7 };
    expect(playConfig(saved)).toEqual({ ok: true, config: { ...defaultConfig, boardSize: 3 } });
  });

  test('refuses a saved value its rule refuses, naming each', () => {
    const played = playConfig({ boardSize: 1.5, sellRatio: 1 });
    expect(played).toMatchObject({ ok: false, refusal: { kind: 'unsound-config', problems: [{ setting: 'boardSize' }, { setting: 'sellRatio' }] } });
    expect(!played.ok && played.refusal.message).toBe(
      "The game's config is unsound: boardSize is 1.5; it is a whole number, at least 0; sellRatio is 1; it is a finite number, at least 0 and below 1",
    );
  });
});

describe('playDeps', () => {
  test("is the game's own config filled forward, the content, and the modules given, none unless given", () => {
    const meta = { ...testMeta, config: { ...testMeta.config, boardSize: 4 } };
    expect(playDeps({ meta }, content)).toEqual({ ok: true, deps: { config: { ...defaultConfig, boardSize: 4 }, content } });
    const modules = [{ id: 'a-module' }] as unknown as Module[];
    expect(playDeps({ meta }, content, modules)).toEqual({ ok: true, deps: { config: { ...defaultConfig, boardSize: 4 }, content, modules } });
  });

  test("copies: the play config is not the save's, nor the defaults", () => {
    const played = playDeps({ meta: testMeta }, content);
    if (!played.ok) throw new Error(played.refusal.message);
    expect(played.deps.config).not.toBe(testMeta.config);
    expect(played.deps.config).not.toBe(defaultConfig);
  });

  test("refuses a game whose config breaks a rule, naming the setting", () => {
    const meta = { ...testMeta, config: { ...testMeta.config, sellRatio: 1 } };
    expect(playDeps({ meta }, content)).toMatchObject({ ok: false, refusal: { kind: 'unsound-config', problems: [{ setting: 'sellRatio' }] } });
  });
});
