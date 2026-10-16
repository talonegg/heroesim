import { describe, expect, test } from 'vitest';
import { chanceBandNames, defaultConfig, type GameConfig, type TierRow } from './config.js';
import { checkConfig, configRules, playConfig, playDeps, tierRowProblems } from './config-check.js';
import type { Module } from './modules.js';
import { cyrb128, int } from './rng.js';
import { testContent, testMeta } from './world.test-support.js';

// DL-186 item 12, DL-193: every setting checked, from one table of rules, before any play.

const content = testContent;

/** A sound Tier, its bands from `10 + 20 × step`. */
const tierRow = (step: number): TierRow => ({
  difficultyMin: 10 + 20 * step,
  difficultyMax: 30 + 20 * step,
  daysMin: 3,
  daysMax: 5,
  beats: 2,
  loot: false,
  rewardFactor: 1.5,
  xpFactor: 1.5,
  deathScale: 0,
  fameMinimum: 0,
  unlockLevel: 0,
});

/** The settings a config with `changes` breaks the rules of. */
const broken = (changes: Readonly<Record<string, unknown>>): string[] => checkConfig({ ...defaultConfig, ...changes }).map((problem) => problem.setting);

describe('the rules', () => {
  test('the defaults break none', () => {
    expect(checkConfig(defaultConfig)).toEqual([]);
  });

  test('a setting missing is named, as missing', () => {
    const config: Record<string, unknown> = { ...defaultConfig };
    delete config['boardSizeStart'];
    expect(checkConfig(config)).toEqual([{ setting: 'boardSizeStart', message: 'boardSizeStart is missing; it is a whole number, at least 0' }]);
  });

  test('a problem names its setting, its value and what it is to be, in GameConfig\'s order', () => {
    expect(checkConfig({ ...defaultConfig, checkVariance: 2, boardSizeStart: -1 })).toEqual([
      { setting: 'boardSizeStart', message: 'boardSizeStart is -1; it is a whole number, at least 0' },
      { setting: 'checkVariance', message: 'checkVariance is 2; it is a share from 0 to 1' },
    ]);
  });

  test('a whole number is a safe integer, as `int` asks of its bounds', () => {
    expect(broken({ startingWealth: 2 ** 53 - 1 })).toEqual([]);
    expect(broken({ startingWealth: 2 ** 53 })).toEqual(['startingWealth']);
    expect(broken({ heroStartingAgeMax: 1e17 })).toContain('heroStartingAgeMax');
    expect(broken({ bankruptcyFloor: -(2 ** 53 - 1) })).toEqual([]);
    expect(broken({ bankruptcyFloor: -(2 ** 53) })).toEqual(['bankruptcyFloor']);
  });

  test('a Year is whole Days, three Turns each, so that no Day straddles two Years (DL-206 item 8, DL-210)', () => {
    expect(checkConfig({ ...defaultConfig, turnsPerYear: 20 })).toEqual([
      { setting: 'turnsPerYear', message: 'turnsPerYear is 20; it is a whole number, at least 3 and a multiple of 3' },
    ]);
    expect(broken({ turnsPerYear: 3 })).toEqual([]);
  });

  test('never throws, whatever a save holds', () => {
    // The settings whose `null` is a value: none, for a rest band (DL-286).
    const nullable = ['playerRestBand'];
    for (const value of [null, 'x', {}, true, Number.NaN, undefined]) {
      for (const setting of Object.keys(defaultConfig)) {
        expect(() => checkConfig({ ...defaultConfig, [setting]: value }), `${setting} = ${String(value)}`).not.toThrow();
        if (value === null && nullable.includes(setting)) continue;
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

/** A `<name>Max` row's own kind edges (not whole, not a number); its relation to its Min is held by 'a Min and its Max'. */
const maxOf = (min: keyof GameConfig, max: keyof GameConfig): Case => ({
  refused: [(defaultConfig[max] as number) + 0.5, Number.NaN],
  allowed: [defaultConfig[min] as number, defaultConfig[max] as number],
});

const cases: { readonly [Setting in keyof GameConfig]-?: Case } = {
  // Whole Days, so that a Day never straddles two Years (DL-206 item 8, DL-210).
  turnsPerYear: { refused: [0, 1, 2, 4, 20, 1081, -3, 1080.5, Number.POSITIVE_INFINITY], allowed: [3, 6, 21, 1080] },
  startingRosterSize: wholeFrom(0),
  // A Guild starts with no debt (DL-206 item 8, DL-210).
  startingWealth: wholeFrom(0),
  rivalCount: wholeFrom(0),
  rivalRosterMin: { refused: [-1, 0.5], allowed: [0, defaultConfig.rivalRosterMax] },
  rivalRosterMax: maxOf('rivalRosterMin', 'rivalRosterMax'),
  rivalHireReserveUpkeeps: finiteFrom(0),
  rivalHealItemStock: wholeFrom(0),
  rivalStartingWealthMin: { refused: [-1, 1.5, Number.NaN], allowed: [0, defaultConfig.rivalStartingWealthMax] },
  rivalStartingWealthMax: maxOf('rivalStartingWealthMin', 'rivalStartingWealthMax'),
  patronCount: wholeFrom(1),
  unattachedPoolSize: wholeFrom(0),
  heroStartingAgeMin: { refused: [-1, 18.5], allowed: [0, defaultConfig.heroStartingAgeMax] },
  heroStartingAgeMax: maxOf('heroStartingAgeMin', 'heroStartingAgeMax'),
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
  statBaseMin: { refused: [-1, 2.5], allowed: [0, defaultConfig.statBaseMax] },
  statBaseMax: maxOf('statBaseMin', 'statBaseMax'),
  statBiasMin: { refused: [-1, 1.5], allowed: [0, defaultConfig.statBiasMax] },
  statBiasMax: maxOf('statBiasMin', 'statBiasMax'),
  potentialGapMin: { refused: [-1, 2.5], allowed: [0, defaultConfig.potentialGapMax] },
  potentialGapMax: maxOf('potentialGapMin', 'potentialGapMax'),
  startingSkillsMin: { refused: [-1, 0.5], allowed: [0, defaultConfig.startingSkillsMax] },
  startingSkillsMax: maxOf('startingSkillsMin', 'startingSkillsMax'),
  // A Skill rating, 1 to 5 (`SkillRating`): the Hero generator draws a starting rating up to it (DL-205's verification).
  startingSkillRatingMax: { refused: [0, 1.5, 6, Number.POSITIVE_INFINITY], allowed: [1, 5] },
  moraleBaseline: { refused: [-0.5, 100.5, Number.NaN], allowed: [0, 60.5, 100] },
  guildmasterStartingAgeMin: { refused: [-1, 21.5], allowed: [0, defaultConfig.guildmasterStartingAgeMax] },
  guildmasterStartingAgeMax: maxOf('guildmasterStartingAgeMin', 'guildmasterStartingAgeMax'),
  // A Guildmaster's own sex weights (DL-206 item 1, DL-208), held as a Hero's are.
  guildmasterSexWeights: {
    refused: [
      { female: 0, male: 0 },
      { female: -1, male: 2 },
      { female: 1, male: Number.NaN },
      { female: 1, male: Number.POSITIVE_INFINITY },
      { male: 1 },
      { female: 1, male: 1, other: 1 },
      [1, 1],
      '1',
      null,
    ],
    allowed: [{ female: 1, male: 1 }, { female: 3, male: 0 }, { female: 0, male: 0.5 }],
  },
  guildmasterStatMin: { refused: [-1, 5.5], allowed: [0, defaultConfig.guildmasterStatMax] },
  guildmasterStatMax: maxOf('guildmasterStatMin', 'guildmasterStatMax'),
  guildmasterStatPoints: wholeFrom(0),
  guildmasterTraitsMin: { refused: [-1, 0.5], allowed: [0, defaultConfig.guildmasterTraitsMax] },
  guildmasterTraitsMax: maxOf('guildmasterTraitsMin', 'guildmasterTraitsMax'),
  guildmasterTraitBudget: anyFinite,
  upkeepEveryDays: wholeFrom(1),
  // The wage rule's terms and the Contract's lengths, a factor for each (DL-294 item 6).
  wageBase: wholeFrom(0),
  wagePerLevel: wholeFrom(0),
  wageStatDivisor: finiteAbove(0),
  wageFameFactor: finiteFrom(0),
  // Three each, as long as `contractWageFactors`, whose rule reads it: its length is 'the Contract's lengths and factors'.
  contractLengthsYears: { refused: [[], [0, 1, 2], [1, 1, 2], [1, 1.5, 2], [1, '2', 3], 1], allowed: [[1, 2, 3], [2, 4, 6], [3, 1, 2]] },
  contractWageFactors: { refused: [[1, 0.95], [1, 0.95, 0.9, 0.85], [1, 0, 1], [1, -1, 1], [1, Number.NaN, 1], [1, '1', 1], 1], allowed: [[1, 1, 1], [0.5, 2, 0.01]] },
  outOfContractPremium: finiteFrom(0),
  releasePayoutFactor: { refused: [-0.01, 1.01, Number.NaN], allowed: [0, 0.8, 1] },
  // DL-298: the Hall's upkeep, its Days, its base, its Heroes' curve and its grades' factor.
  hallUpkeepEveryDays: wholeFrom(1),
  hallBaseUpkeep: wholeFrom(0),
  hallUpkeepPerHero: wholeFrom(0),
  hallUpkeepHeroExponent: finiteFrom(0),
  // A grade never costs less to keep than the one below it (DL-294 item 3).
  improvementUpkeepGradeFactor: finiteFrom(1),
  bankruptcyFloor: anyWhole,
  bankruptcyGraceDays: wholeFrom(0),
  // No higher than `foundingFame`, whose rule reads it (DL-261): its edges above 0 are 'the Board's size and the founding Fame'.
  fameFloor: { refused: [-1, 0.5, Number.POSITIVE_INFINITY], allowed: [0] },
  // At least `fameFloor` (DL-261), held by 'the Board's size and the founding Fame'.
  foundingFame: wholeFrom(0),
  signingFeeBase: wholeFrom(0),
  signingFeePerLevel: wholeFrom(0),
  signingFeeStatDivisor: finiteAbove(0),
  unattachedStayDays: wholeFrom(0),
  fameRequiredPerLevel: finiteFrom(0),
  boardSizeStart: wholeFrom(0),
  boardGrowthPerYear: finiteFrom(0),
  // At least `boardSizeStart` (DL-261).
  boardSizeMax: { refused: [defaultConfig.boardSizeStart - 1, defaultConfig.boardSizeMax + 0.5, Number.NaN], allowed: [defaultConfig.boardSizeStart, defaultConfig.boardSizeMax + 1] },
  questOfferDays: wholeFrom(1),
  questDifficultyMin: { refused: [0, 10.5], allowed: [1, defaultConfig.questDifficultyMax] },
  questDifficultyMax: maxOf('questDifficultyMin', 'questDifficultyMax'),
  encounterTagWeight: { refused: [0.99, 0, -3, Number.NaN, Number.POSITIVE_INFINITY], allowed: [1, 3.5] },
  // One Tier or more, each sound, its bands and unlock Levels no lower than the Tier's below, Tier 1's
  // unlock Level 0 (DL-262, DL-271), held by 'the Tier ladder'.
  tiers: {
    refused: [
      [],
      'tiers',
      [{ ...tierRow(0), beats: 0 }],
      [tierRow(1), tierRow(0)],
      [{ ...tierRow(0), extra: 1 }],
      [{ ...tierRow(0), unlockLevel: 3 }],
      [tierRow(0), { ...tierRow(0), unlockLevel: 6 }, { ...tierRow(0), unlockLevel: 3 }],
    ],
    allowed: [[tierRow(0)], defaultConfig.tiers, [tierRow(0), tierRow(0)], [tierRow(0), { ...tierRow(0), unlockLevel: 4 }, { ...tierRow(0), unlockLevel: 4 }]],
  },
  // Every weight above 0, so that no Tier at or below the Board's top Tier is ever left out (DL-271).
  tierDrawWeights: { refused: [[], [0, 1], [1, -0.5], [1, Number.NaN], 1, [1, 0], [0.01, 0, 0]], allowed: [[1], [0.01, 0.01], [1, 0.5, 0.2, 0.1, 5]] },
  unlockHeroes: wholeFrom(1),
  deathFactor: finiteFrom(0),
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
  hurtCheckFactor: { refused: [0, -0.5, 1.01, Number.NaN, Number.POSITIVE_INFINITY], allowed: [0.01, 1] },
  healerHurtRelief: share,
  healItemHurtRelief: share,
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
  moraleMax: { refused: [100.5, Number.NaN], allowed: [100, 120] },
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
  fatigueMax: { refused: [0, 75.5, Number.NaN, Number.POSITIVE_INFINITY], allowed: [75, 200] },
  fatigueBands: {
    refused: [
      { fresh: -1, weary: 25, tired: 50, exhausted: 75 },
      { fresh: 0, weary: 25, tired: 50, exhausted: 101 },
      { fresh: 0, weary: 50, tired: 50, exhausted: 75 },
      { fresh: 0, weary: 50, tired: 25, exhausted: 75 },
      { fresh: 0, weary: 25, tired: 50 },
    ],
    allowed: [{ fresh: 0, weary: 1, tired: 2, exhausted: 100 }],
  },
  fatigueRiseByTier: { refused: [[], [4, -1], [4, Number.NaN], [4, Number.POSITIVE_INFINITY], [4, '5'], 4], allowed: [[0], [4, 5, 6, 7, 8], [8, 4], [0.5, 1, 1.5]] },
  fatigueScaling: share,
  playerRestBand: { refused: ['sleepy', '', 'none', 3], allowed: ['fresh', 'tired', 'exhausted', null] },
  // DL-287: a Captain adds to their Party's form and Morale, never takes; a change only costs.
  captainFormFactor: { refused: [0.99, 0, -1, Number.NaN, Number.POSITIVE_INFINITY, undefined], allowed: [1, 1.05, 2] },
  captainHomecomingMorale: { refused: [-0.5, Number.NaN, Number.POSITIVE_INFINITY, undefined], allowed: [0, 5, 2.5] },
  captainHomeBaselineBonus: { refused: [-1, Number.NaN, Number.POSITIVE_INFINITY, undefined], allowed: [0, 5, 0.5] },
  captainChangeMoraleCost: { refused: [1, 0.5, Number.NaN, Number.NEGATIVE_INFINITY, undefined], allowed: [0, -10, -2.5] },
  captainChangeLockDays: wholeFrom(0),
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
  lootOnBands: { refused: [['strong', 'strong'], ['great'], 'strong'], allowed: [[], ['fail', 'success', 'strong']] },
  lootOnFinaleDegrees: { refused: [['triumph', 'triumph'], ['strong'], ['unmet'], 'triumph'], allowed: [[], ['success', 'triumph'], ['failure', 'setback', 'success', 'triumph']] },
  marketSize: wholeFrom(0),
  marketStackMin: { refused: [0, 1.5], allowed: [1, defaultConfig.marketStackMax] },
  marketStackMax: maxOf('marketStackMin', 'marketStackMax'),
  sellRatio: { refused: [-0.01, 1, Number.NaN], allowed: [0, 0.99] },
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
    expect(checkConfig({ ...defaultConfig, rivalRosterMax: defaultConfig.rivalRosterMin - 1 })).toEqual([
      {
        setting: 'rivalRosterMax',
        message: `rivalRosterMax is ${defaultConfig.rivalRosterMin - 1}; it is a whole number, at least rivalRosterMin (${defaultConfig.rivalRosterMin})`,
      },
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

  test("a Max far above its Min is named, with the most a draw spans", () => {
    expect(checkConfig({ ...defaultConfig, rivalStartingWealthMax: 5_000_000_000 })).toEqual([
      {
        setting: 'rivalStartingWealthMax',
        message: `rivalStartingWealthMax is 5000000000; it is a whole number from rivalStartingWealthMin (${defaultConfig.rivalStartingWealthMin}) to 4294967295 above it, the most a draw spans`,
      },
    ]);
  });
});

describe("the Board's size and the founding Fame (DL-261)", () => {
  test('a Board starting above its cap is refused, the cap named with the start', () => {
    expect(checkConfig({ ...defaultConfig, boardSizeStart: 7, boardSizeMax: 6 })).toEqual([
      { setting: 'boardSizeMax', message: 'boardSizeMax is 6; it is a whole number, at least boardSizeStart (7)' },
    ]);
    expect(broken({ boardSizeStart: 6, boardSizeMax: 6 })).toEqual([]);
    expect(broken({ boardSizeStart: 2, boardSizeMax: 9 })).toEqual([]);
  });

  test('the Board grows by a finite number of 0 or more a Year, a part of one Quest allowed, and starts and ends whole', () => {
    expect(checkConfig({ ...defaultConfig, boardGrowthPerYear: -1 })).toEqual([
      { setting: 'boardGrowthPerYear', message: 'boardGrowthPerYear is -1; it is a finite number, at least 0' },
    ]);
    expect(broken({ boardGrowthPerYear: Number.POSITIVE_INFINITY })).toEqual(['boardGrowthPerYear']);
    expect(broken({ boardSizeStart: 2, boardGrowthPerYear: 0.5 })).toEqual([]);
    expect(broken({ boardSizeStart: 2.5 })).toEqual(['boardSizeStart']);
    expect(broken({ boardSizeMax: 7.5 })).toEqual(['boardSizeMax']);
  });

  test('a Guild is founded with whole Fame, never below the Fame floor', () => {
    expect(checkConfig({ ...defaultConfig, fameFloor: 10, foundingFame: 5 })).toEqual([
      { setting: 'foundingFame', message: 'foundingFame is 5; it is a whole number, at least fameFloor (10)' },
    ]);
    expect(broken({ fameFloor: 10, foundingFame: 10 })).toEqual([]);
    expect(broken({ foundingFame: 25 })).toEqual([]);
    expect(broken({ foundingFame: 2.5 })).toEqual(['foundingFame']);
  });
});

describe('the Tier ladder (DL-262)', () => {
  test('a Tier row breaks no rule at its edges', () => {
    expect(tierRowProblems(tierRow(0))).toEqual([]);
    expect(tierRowProblems({ ...tierRow(0), difficultyMin: 1, difficultyMax: 1, daysMin: 1, daysMax: 1, beats: 1, loot: true })).toEqual([]);
    expect(tierRowProblems({ ...tierRow(0), rewardFactor: 0, xpFactor: 0, deathScale: 0, fameMinimum: 0 })).toEqual([]);
    expect(tierRowProblems({ ...tierRow(0), rewardFactor: 0.25, deathScale: 2.5, fameMinimum: 40 })).toEqual([]);
  });

  test("a Tier row's field below its bound, not whole where it is a count, or of no number is named, with what it is to be", () => {
    expect(tierRowProblems({ ...tierRow(0), difficultyMin: 0 })).toEqual(['difficultyMin is 0; it is a whole number, at least 1']);
    expect(tierRowProblems({ ...tierRow(0), difficultyMax: 9 })).toEqual(['difficultyMax is 9; it is a whole number, at least difficultyMin (10)']);
    expect(tierRowProblems({ ...tierRow(0), daysMin: 0.5 })).toEqual(['daysMin is 0.5; it is a whole number, at least 1']);
    expect(tierRowProblems({ ...tierRow(0), daysMax: 2 })).toEqual(['daysMax is 2; it is a whole number, at least daysMin (3)']);
    expect(tierRowProblems({ ...tierRow(0), beats: 0 })).toEqual(['beats is 0; it is a whole number, at least 1']);
    expect(tierRowProblems({ ...tierRow(0), beats: 2.5 })).toEqual(['beats is 2.5; it is a whole number, at least 1']);
    expect(tierRowProblems({ ...tierRow(0), loot: 'yes' })).toEqual(['loot is "yes"; it is true or false']);
    expect(tierRowProblems({ ...tierRow(0), rewardFactor: -0.1 })).toEqual(['rewardFactor is -0.1; it is a finite number, at least 0']);
    expect(tierRowProblems({ ...tierRow(0), xpFactor: Number.NaN })).toEqual(['xpFactor is NaN; it is a finite number, at least 0']);
    expect(tierRowProblems({ ...tierRow(0), deathScale: Number.POSITIVE_INFINITY })).toEqual(['deathScale is Infinity; it is a finite number, at least 0']);
    expect(tierRowProblems({ ...tierRow(0), fameMinimum: 1.5 })).toEqual(['fameMinimum is 1.5; it is a whole number, at least 0']);
    expect(tierRowProblems({ ...tierRow(0), unlockLevel: -1 })).toEqual(['unlockLevel is -1; it is a whole number, at least 0']);
    expect(tierRowProblems({ ...tierRow(0), unlockLevel: 2.5 })).toEqual(['unlockLevel is 2.5; it is a whole number, at least 0']);
  });

  test('a Tier row lacking a field, or holding one a Tier has not, is named; one that is no object is named whole', () => {
    const lacking: Partial<TierRow> = tierRow(0);
    delete lacking.beats;
    expect(tierRowProblems(lacking)).toEqual(['beats is missing; it is a whole number, at least 1']);
    expect(tierRowProblems({ ...tierRow(0), duration: 3 })).toEqual([expect.stringMatching(/^duration is no field of a Tier, which holds difficultyMin, /)]);
    expect(tierRowProblems(5)).toEqual([expect.stringMatching(/^a Tier is an object of difficultyMin, .*; got 5$/)]);
    expect(tierRowProblems(null)).toHaveLength(1);
  });

  test("the ladder names each Tier's problem by its number", () => {
    const [problem] = checkConfig({ ...defaultConfig, tiers: [tierRow(0), { ...tierRow(1), daysMax: 1 }] });
    expect(problem?.setting).toBe('tiers');
    expect(problem?.message.endsWith('; Tier 2: daysMax is 1; it is a whole number, at least daysMin (3)')).toBe(true);
  });

  test("a Tier's band starts and ends no lower than the Tier's below; days and factors may fall", () => {
    const [start] = checkConfig({ ...defaultConfig, tiers: [tierRow(1), { ...tierRow(1), difficultyMin: 29 }] });
    expect(start?.message).toMatch(/; Tier 2: difficultyMin is 29; it is at least Tier 1's, 30$/);
    const [end] = checkConfig({ ...defaultConfig, tiers: [tierRow(1), { ...tierRow(1), difficultyMax: 49 }] });
    expect(end?.message).toMatch(/; Tier 2: difficultyMax is 49; it is at least Tier 1's, 50$/);
    expect(broken({ tiers: [tierRow(1), tierRow(1)] })).toEqual([]);
    expect(broken({ tiers: [tierRow(0), { ...tierRow(1), daysMin: 1, daysMax: 2, rewardFactor: 0.5, beats: 1 }] })).toEqual([]);
  });

  test("Tier 1's unlock Level is 0, and each Tier's at least the Tier's below (DL-271)", () => {
    const [first] = checkConfig({ ...defaultConfig, tiers: [{ ...tierRow(0), unlockLevel: 2 }, { ...tierRow(0), unlockLevel: 3 }] });
    expect(first?.message).toMatch(/; Tier 1: unlockLevel is 2; it is 0, so that Tier 1 is always on offer$/);
    const [falling] = checkConfig({ ...defaultConfig, tiers: [tierRow(0), { ...tierRow(0), unlockLevel: 6 }, { ...tierRow(0), unlockLevel: 5 }] });
    expect(falling?.message).toMatch(/; Tier 3: unlockLevel is 5; it is at least Tier 2's, 6$/);
    expect(broken({ tiers: [tierRow(0), tierRow(0), { ...tierRow(0), unlockLevel: 1 }] })).toEqual([]);
  });

  test('an empty ladder, or one that is no list, is refused', () => {
    expect(checkConfig({ ...defaultConfig, tiers: [] })[0]?.message).toBe(
      'tiers is []; it is a list of one or more Tiers, each an object of difficultyMin, difficultyMax, daysMin, daysMax, beats, loot, rewardFactor, xpFactor, deathScale, fameMinimum, unlockLevel',
    );
    expect(broken({ tiers: { 1: tierRow(0) } })).toEqual(['tiers']);
  });

  test("the draw weights name the top Tier's first, each above 0 (DL-271)", () => {
    expect(checkConfig({ ...defaultConfig, tierDrawWeights: [1, 0] })).toEqual([
      {
        setting: 'tierDrawWeights',
        message: "tierDrawWeights is [1,0]; it is a list of one weight or more, the top Tier's first, then each Tier further below it, the last held, each a finite number above 0",
      },
    ]);
  });

  test('the best four are one Hero or more', () => {
    expect(checkConfig({ ...defaultConfig, unlockHeroes: 0 })).toEqual([{ setting: 'unlockHeroes', message: 'unlockHeroes is 0; it is a whole number, at least 1' }]);
  });
});

describe('the bands, in their order', () => {
  test('the Morale bands, and the baseline, lie within moraleMin and moraleMax', () => {
    expect(broken({ moraleMin: defaultConfig.moraleBands.wretched + 1 })).toEqual(['moraleBands']);
    expect(broken({ moraleMax: defaultConfig.moraleBands.elated - 1 })).toEqual(['moraleBands']);
    expect(broken({ moraleMin: defaultConfig.moraleBaseline + 1 })).toEqual(['moraleBaseline', 'moraleBands']);
  });

  test("the Morale bands keep the scale Morale's factor divides by wider than 0 (DL-283)", () => {
    expect(broken({ moraleMax: defaultConfig.moraleMin })).toContain('moraleBands');
  });

  test('the Fatigue bands lie within 0 and fatigueMax (DL-282)', () => {
    expect(broken({ fatigueMax: defaultConfig.fatigueBands.exhausted - 1 })).toEqual(['fatigueBands']);
    expect(broken({ fatigueMax: defaultConfig.fatigueBands.exhausted })).toEqual([]);
  });

  test('the Regard bands lie within regardMin and regardMax', () => {
    expect(broken({ regardMin: defaultConfig.regardBands.hostile + 1 })).toEqual(['regardBands']);
    expect(broken({ regardMax: defaultConfig.regardBands.close - 1 })).toEqual(['regardBands']);
  });

  test('the chance bands from unlikely, hopeless being below them', () => {
    expect(chanceBandNames[0]).toBe('hopeless');
    const bands = { ...defaultConfig.chanceBands, even: defaultConfig.chanceBands.likely };
    expect(checkConfig({ ...defaultConfig, chanceBands: bands })[0]?.message).toBe(
      `chanceBands is ${JSON.stringify(bands)}; it holds unlikely < even < likely < near-certain, each a finite number, above 0 and below 1`,
    );
  });
});

describe("the Contract's lengths and factors (DL-294 item 6)", () => {
  test('a factor for each length: two lengths take two factors, and a list of another length is refused, naming the lengths', () => {
    expect(broken({ contractLengthsYears: [1, 2], contractWageFactors: [1, 0.9] })).toEqual([]);
    expect(broken({ contractLengthsYears: [1, 2] })).toEqual(['contractWageFactors']);
    expect(checkConfig({ ...defaultConfig, contractWageFactors: [1] })[0]?.message).toBe(
      'contractWageFactors is [1]; it is a list of one factor for each of contractLengthsYears ([1,2,3]), in its order, each a finite number above 0',
    );
  });
});

describe('the lists a content release may outgrow: no rule reads the content (DL-193)', () => {
  test("Fatigue's rise by Tier is a list of at least one, whatever the ladder, one past the list reading the last (DL-282)", () => {
    expect(broken({ fatigueRiseByTier: [4] })).toEqual([]);
    expect(broken({ fatigueRiseByTier: [4, 5, 6, 7, 8, 9, 10] })).toEqual([]);
    expect(checkConfig({ ...defaultConfig, fatigueRiseByTier: [] })[0]?.message).toBe(
      "fatigueRiseByTier is []; it is a list of at least one figure, one for each Tier from 1, a Tier past the list reading the last, each a finite number of 0 or more",
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
    const saved = { boardSizeStart: 3, retiredField: 7 };
    expect(playConfig(saved)).toEqual({ ok: true, config: { ...defaultConfig, boardSizeStart: 3 } });
  });

  test('refuses a saved value its rule refuses, naming each', () => {
    const played = playConfig({ boardSizeStart: 1.5, sellRatio: 1 });
    expect(played).toMatchObject({ ok: false, refusal: { kind: 'unsound-config', problems: [{ setting: 'boardSizeStart' }, { setting: 'sellRatio' }] } });
    expect(!played.ok && played.refusal.message).toBe(
      "The game's config is unsound: boardSizeStart is 1.5; it is a whole number, at least 0; sellRatio is 1; it is a finite number, at least 0 and below 1",
    );
  });
});

describe('playDeps', () => {
  test("is the game's own config filled forward, the content, and the modules given, none unless given", () => {
    const meta = { ...testMeta, config: { ...testMeta.config, boardSizeStart: 4 } };
    expect(playDeps({ meta }, content)).toEqual({ ok: true, deps: { config: { ...defaultConfig, boardSizeStart: 4 }, content } });
    const modules = [{ id: 'a-module' }] as unknown as Module[];
    expect(playDeps({ meta }, content, modules)).toEqual({ ok: true, deps: { config: { ...defaultConfig, boardSizeStart: 4 }, content, modules } });
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
