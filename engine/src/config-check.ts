// The config's seam (v1.1.6-S7, DL-186 item 12, DL-193): every setting of `GameConfig` has one rule
// in `configRules`, and `checkConfig` reads them all; `playDeps` merges a game's own config with the
// current defaults and checks it before any play. The CLI, the page, the harness and a save's load
// go through it, so a setting no rule allows never reaches the rules that read it. Each rule is the
// setting's range, a Min's Max at least the Min, a list of bands in their order, or a list that
// asks nothing of the content (DL-193); none is checked lazily where it is read (the Quest Engine's and
// the Encounter draw's checks, DL-152 to DL-160, are rules here).

import { chanceBandNames, defaultConfig, moraleBandNames, potentialHints, questBands, regardBandNames, type EngineDeps, type GameConfig } from './config.js';
import { degrees, type ContentSet, type StatArea } from './content-types.js';
import { highestSkillRating, lowestSkillRating, type Meta } from './document.js';
import { sexes } from './generators/draw.js';
import type { Module } from './modules.js';

/** A setting's problem: the setting, and a sentence naming it, its value and what it is to be. */
export interface ConfigProblem {
  setting: keyof GameConfig;
  message: string;
}

/** The settings as a rule reads them: whatever a save held, before any is known to be sound. */
type Settings = Readonly<Record<string, unknown>>;

/**
 * One setting's rule: `undefined` for a sound value, else what the value is to be, the words after
 * "<setting> is <value>; ". It may read the other settings, never the content (DL-193).
 */
export type ConfigRule = (value: unknown, settings: Settings) => string | undefined;

/** Every Stat area, in the order of `StatArea`; a record, so that `tsc` asks for an area `StatArea` gains. */
const statAreas = Object.keys({ physical: true, mental: true, magical: true, social: true } satisfies Record<StatArea, true>);

/** A bound: a number, or another setting, read at the check. */
type Bound = number | keyof GameConfig;

interface NumberSpec {
  whole?: boolean;
  min?: Bound;
  above?: Bound;
  max?: Bound;
  below?: Bound;
  /** In place of the words the bounds make. */
  words?: string;
}

const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

/** A bound's value, or `undefined` for a setting that is no finite number (its own rule names it). */
function boundOf(bound: Bound | undefined, settings: Settings): number | undefined {
  if (bound === undefined || typeof bound === 'number') return bound;
  const value = settings[bound];
  return isNumber(value) ? value : undefined;
}

function boundWords(bound: Bound, settings: Settings): string {
  return typeof bound === 'number' ? String(bound) : `${bound} (${shown(settings[bound])})`;
}

/** Whether `value` is a number `spec` allows. */
function allows(spec: NumberSpec, value: unknown, settings: Settings): boolean {
  if (!isNumber(value) || (spec.whole === true && !Number.isSafeInteger(value))) return false;
  const min = boundOf(spec.min, settings);
  const above = boundOf(spec.above, settings);
  const max = boundOf(spec.max, settings);
  const below = boundOf(spec.below, settings);
  return (
    (min === undefined || value >= min) &&
    (above === undefined || value > above) &&
    (max === undefined || value <= max) &&
    (below === undefined || value < below)
  );
}

function numberWords(spec: NumberSpec, settings: Settings): string {
  if (spec.words !== undefined) return spec.words;
  const clauses = [
    ...(spec.min === undefined ? [] : [`at least ${boundWords(spec.min, settings)}`]),
    ...(spec.above === undefined ? [] : [`above ${boundWords(spec.above, settings)}`]),
    ...(spec.max === undefined ? [] : [`at most ${boundWords(spec.max, settings)}`]),
    ...(spec.below === undefined ? [] : [`below ${boundWords(spec.below, settings)}`]),
  ];
  return `it is a ${spec.whole === true ? 'whole' : 'finite'} number${clauses.length === 0 ? '' : `, ${clauses.join(' and ')}`}`;
}

/** A number within `spec`. */
function numeric(spec: NumberSpec): ConfigRule {
  return (value, settings) => (allows(spec, value, settings) ? undefined : numberWords(spec, settings));
}

/** A whole number: a safe integer, as `int` asks of its bounds (`rng.ts`). */
const whole = (spec: Omit<NumberSpec, 'whole'> = {}): ConfigRule => numeric({ ...spec, whole: true });
const finite = (spec: Omit<NumberSpec, 'whole'> = {}): ConfigRule => numeric(spec);
/** The most values `int` draws between (`rng.ts`): 2^32. */
const drawSpan = 2 ** 32;

/**
 * A Max `int` draws to from its Min: a whole number at least the Min, and at most `drawSpan` values
 * from the Min to it, so that a config the rules allow never throws at a draw (DL-205).
 */
function drawnMax(min: keyof GameConfig): ConfigRule {
  const atLeast = whole({ min });
  return (value, settings) => {
    const refused = atLeast(value, settings);
    if (refused !== undefined) return refused;
    const from = boundOf(min, settings);
    return from === undefined || (value as number) - from + 1 <= drawSpan
      ? undefined
      : `it is a whole number from ${boundWords(min, settings)} to ${drawSpan - 1} above it, the most a draw spans`;
  };
}

/** A share from 0 to 1. */
const share: ConfigRule = numeric({ min: 0, max: 1, words: 'it is a share from 0 to 1' });

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** `value` as a record of exactly `keys`, each a number `spec` allows, in `keys`' order; else `undefined`. */
function numbersOf(value: unknown, keys: readonly string[], spec: NumberSpec, settings: Settings): number[] | undefined {
  if (!isRecord(value)) return undefined;
  if (Object.keys(value).length !== keys.length || !keys.every((key) => Object.hasOwn(value, key))) return undefined;
  const numbers = keys.map((key) => value[key]);
  return numbers.every((number) => allows(spec, number, settings)) ? (numbers as number[]) : undefined;
}

/** A record of exactly `keys`, each a number `spec` allows. */
function each(keys: readonly string[], spec: NumberSpec): ConfigRule {
  return (value, settings) =>
    numbersOf(value, keys, spec, settings) === undefined
      ? `it holds ${keys.join(', ')}, each ${numberWords(spec, settings).slice('it is '.length)}`
      : undefined;
}

/**
 * Bands: a record of exactly `keys`, each a number `spec` allows, rising strictly in `keys`' order,
 * where each band starts (`moraleBands`, `regardBands`, `potentialHintBands`, `chanceBands`).
 */
function bands(keys: readonly string[], spec: NumberSpec): ConfigRule {
  return (value, settings) => {
    const starts = numbersOf(value, keys, spec, settings);
    const rising = starts?.every((start, index) => index === 0 || start > (starts[index - 1] as number));
    return rising === true ? undefined : `it holds ${keys.join(' < ')}, each ${numberWords(spec, settings).slice('it is '.length)}`;
  };
}

/** One of `members`. */
function oneOf(members: readonly string[]): ConfigRule {
  return (value) => (members.includes(value as string) ? undefined : `it is one of ${members.join(', ')}`);
}

/** A list of `members`, none twice. */
function listOf(members: readonly string[]): ConfigRule {
  return (value) =>
    Array.isArray(value) && value.every((member) => members.includes(member as string)) && new Set(value).size === value.length
      ? undefined
      : `it is a list of ${members.join(', ')}, none twice`;
}

/** A new Hero's sex weights (v1.1.6-S16, DL-202): one for each sex, each 0 or more, one above 0 for a draw to land on. */
const sexWeights: ConfigRule = (value, settings) => {
  const weights = numbersOf(value, sexes, { min: 0 }, settings);
  return weights?.some((weight) => weight > 0) === true
    ? undefined
    : `it holds ${sexes.join(', ')}, each a number of 0 or more, one of them above 0`;
};

/** The Degrees' thresholds (DL-152): a Degree means something only while they are ordered. */
const degreeThresholds: ConfigRule = (value, settings) => {
  const [triumph, success, setback] = numbersOf(value, ['triumph', 'success', 'setback'], {}, settings) ?? [];
  return triumph !== undefined && success !== undefined && setback !== undefined && triumph > success && success > setback && setback > 0
    ? undefined
    : 'triumph > success > setback > 0';
};

/**
 * The form factors (DL-154): one for every Morale band, each a finite number above 0, `steady`'s 1
 * and the rest in the bands' order, so that better spirits never bring less.
 */
const formFactors: ConfigRule = (value, settings) => {
  const factors = numbersOf(value, moraleBandNames, { above: 0 }, settings);
  const ordered = factors?.every((factor, index) => index === 0 || factor >= (factors[index - 1] as number));
  return ordered === true && factors?.[moraleBandNames.indexOf('steady')] === 1
    ? undefined
    : `it holds ${moraleBandNames.join(' ≤ ')}, each a finite number above 0, steady 1, the band that changes nothing`;
};

/** A Quest's band by its share of Encounters succeeded (M4-S2): two shares, `successAbove` below `strongAtLeast`. */
const successShares: ConfigRule = (value, settings) => {
  const [successAbove, strongAtLeast] = numbersOf(value, ['successAbove', 'strongAtLeast'], { min: 0, max: 1 }, settings) ?? [];
  return successAbove !== undefined && strongAtLeast !== undefined && successAbove < strongAtLeast
    ? undefined
    : 'it holds successAbove < strongAtLeast, each a share from 0 to 1';
};

/**
 * The infirmary's heal factors: at least one, each a finite number above 0 (DL-53). A grade past the
 * list reads its last factor (`healFactor`), so a content release with more grades leaves a save's
 * list sound (DL-193, the owner's answer).
 */
const healFactors: ConfigRule = (value) =>
  Array.isArray(value) && value.length >= 1 && value.every((factor) => isNumber(factor) && factor > 0)
    ? undefined
    : 'it is a list of at least one factor, one for each infirmary grade from 0, a grade past the list reading the last, each a finite number above 0';

/**
 * The Stat areas a decline draws from (M3-S4): any of the Stat areas, none twice. An area content has
 * no Hero Stat of draws nothing, as a content key a save names that content lacks is no refusal
 * (DL-193, the owner's answer); the check has no channel for a warning, so none is made.
 */
const declineAreaList: ConfigRule = listOf(statAreas);

/**
 * Every setting's rule (v1.1.6-S7, DL-193), in `GameConfig`'s order. A Min's Max is at least the Min,
 * and spans no more than a draw does where `int` draws between them;
 * a count, a Day, an age or a sum of Wealth is a whole number; a chance or a share is from 0 to 1;
 * what `GameConfig` says is negative is at most 0; a divisor is above 0.
 */
export const configRules: { readonly [Setting in keyof GameConfig]-?: ConfigRule } = Object.freeze({
  turnsPerYear: whole({ min: 1 }),

  startingRosterSize: whole({ min: 0 }),
  // Wealth may be below 0, a Guild in debt.
  startingWealth: whole(),
  rivalCount: whole({ min: 0 }),
  rivalRosterMin: whole({ min: 0 }),
  rivalRosterMax: drawnMax('rivalRosterMin'),
  rivalHireReserveUpkeeps: finite({ min: 0 }),
  rivalStartingWealthMin: whole(),
  rivalStartingWealthMax: drawnMax('rivalStartingWealthMin'),
  patronCount: whole({ min: 1 }),
  unattachedPoolSize: whole({ min: 0 }),

  heroStartingAgeMin: whole({ min: 0 }),
  heroStartingAgeMax: drawnMax('heroStartingAgeMin'),
  heroSexWeights: sexWeights,
  statBaseMin: whole({ min: 0 }),
  statBaseMax: drawnMax('statBaseMin'),
  statBiasMin: whole({ min: 0 }),
  statBiasMax: drawnMax('statBiasMin'),
  potentialGapMin: whole({ min: 0 }),
  potentialGapMax: drawnMax('potentialGapMin'),
  startingSkillsMin: whole({ min: 0 }),
  startingSkillsMax: drawnMax('startingSkillsMin'),
  // A Skill rating (`SkillRating`): the Hero generator draws a starting rating up to it.
  startingSkillRatingMax: whole({ min: lowestSkillRating, max: highestSkillRating }),
  moraleBaseline: finite({ min: 'moraleMin', max: 'moraleMax' }),

  guildmasterStartingAgeMin: whole({ min: 0 }),
  guildmasterStartingAgeMax: drawnMax('guildmasterStartingAgeMin'),
  guildmasterStatMin: whole({ min: 0 }),
  guildmasterStatMax: drawnMax('guildmasterStatMin'),
  guildmasterStatPoints: whole({ min: 0 }),
  guildmasterTraitsMin: whole({ min: 0 }),
  guildmasterTraitsMax: drawnMax('guildmasterTraitsMin'),
  guildmasterTraitBudget: finite(),

  upkeepEveryDays: whole({ min: 1 }),
  wagePerLevel: whole({ min: 0 }),
  hallMaintenancePerGrade: whole({ min: 0 }),
  bankruptcyFloor: whole(),
  bankruptcyGraceDays: whole({ min: 0 }),
  fameFloor: whole(),
  signingFeeBase: whole({ min: 0 }),
  signingFeePerLevel: whole({ min: 0 }),
  signingFeeStatDivisor: finite({ above: 0 }),
  unattachedStayDays: whole({ min: 0 }),
  fameRequiredPerLevel: finite({ min: 0 }),
  boardSize: whole({ min: 0 }),
  questOfferDays: whole({ min: 1 }),
  // A Quest's difficulty is above 0 (`resolveQuest`, `estimateQuest`).
  questDifficultyMin: whole({ min: 1 }),
  questDifficultyMax: drawnMax('questDifficultyMin'),
  // A tag shared never makes an Encounter rarer (DL-160).
  encounterTagWeight: finite({ min: 1 }),

  // A roll never reaches below nothing (DL-156).
  checkVariance: share,
  skillBonusPerRating: finite({ min: 0 }),
  bandBySuccessShare: successShares,
  checkDegrees: degreeThresholds,
  strongTriumphShare: share,
  moraleCheckFactor: formFactors,
  // A wound never helps (DL-154).
  hurtCheckFactor: finite({ above: 0, max: 1 }),
  // No weight in the draw of who is hit falls below 1 (DL-155).
  exposureRange: finite({ min: 0 }),
  // A guard never raises a chance nor turns it below 0 (DL-155).
  guardRange: share,
  // Every band holds some chances (DL-156).
  chanceBands: bands(chanceBandNames.slice(1), { above: 0, below: 1 }),
  playerPartyMargin: share,

  moraleMin: whole(),
  moraleMax: whole({ min: 'moraleMin' }),
  moraleDrift: finite({ min: 0 }),
  moraleBands: bands(moraleBandNames, { min: 'moraleMin', max: 'moraleMax' }),
  moraleOnRosterDeath: finite({ max: 0 }),
  moraleOnStrongSuccess: finite({ min: 0 }),
  heroRetirementAge: whole({ min: 0 }),
  heroRetirementChancePerYear: share,
  heroRetirementInjuredMultiplier: finite({ min: 0 }),
  infirmaryHealFactor: healFactors,
  quartersMoraleBonus: finite({ min: 0 }),

  potentialHintBands: bands(potentialHints, { min: 0 }),
  declineAge: whole({ min: 0 }),
  declinePerYear: whole({ min: 0 }),
  declineAreas: declineAreaList,

  guildmasterRetirementAge: whole({ min: 0 }),
  rivalReplacementDays: whole({ min: 0 }),

  xpCurveBase: finite({ above: 0 }),
  xpCurveExponent: finite({ min: 0 }),
  levelCap: whole({ min: 1 }),
  growthPointsPerLevel: whole({ min: 0 }),
  xpPerDifficultyPoint: finite({ min: 0 }),
  xpBandFactor: each(questBands, { min: 0 }),
  xpPerTrainingDay: finite({ min: 0 }),

  // Neutral, 0, is inside the scale, and each side has a reach to divide by.
  regardMin: finite({ below: 0 }),
  regardMax: finite({ above: 0 }),
  regardBands: bands(regardBandNames, { min: 'regardMin', max: 'regardMax' }),
  regardPerSharedQuest: finite({ min: 0 }),
  regardOnSuccessBonus: finite({ min: 0 }),
  regardDecayPerYear: finite({ min: 0 }),
  // From 1 − this to 1 + this: never below 0.
  teamworkRange: share,

  patronRegardOnSuccess: finite({ min: 0 }),
  patronRegardOnFailure: finite({ max: 0 }),
  patronRegardOnExpiry: finite({ max: 0 }),
  patronRegardRecoveryPerYear: finite({ min: 0 }),
  boardRegardWeight: finite({ min: 0 }),

  negotiationRange: share,
  inspirationMoraleShift: finite({ min: 0 }),
  coachingFactor: finite({ min: 0 }),
  influenceFactor: finite({ min: 0 }),
  judgementHintSharpening: share,

  guildmasterRegardOnPatronSuccess: finite({ min: 0 }),
  guildmasterRegardOnPatronFailure: finite({ max: 0 }),
  guildmasterRegardOnHeroSuccess: finite({ min: 0 }),
  guildmasterRegardOnHeroFailure: finite({ max: 0 }),

  transferFeeFactor: finite({ min: 0 }),
  transferMoraleCost: finite({ max: 0 }),
  transferRegardBand: oneOf(regardBandNames),
  guildmasterRegardPerTransferDeal: finite({ min: 0 }),
  transferOfferDays: whole({ min: 1 }),
  transferGeneratorEveryDays: whole({ min: 1 }),
  transferGeneratorChance: share,
  transferLockDays: whole({ min: 0 }),

  lootDifficultyThreshold: finite({ min: 0 }),
  lootOnBands: listOf(questBands),
  lootOnFinaleDegrees: listOf(degrees),

  marketSize: whole({ min: 0 }),
  marketStackMin: whole({ min: 1 }),
  marketStackMax: drawnMax('marketStackMin'),
  // An Item sells for less than it costs (R31).
  sellRatio: finite({ min: 0, below: 1 }),
  lootOnlyPrice: whole({ min: 0 }),
});

/** A value in a problem's words: a number as it reads, anything else as JSON, a setting absent as missing. */
function shown(value: unknown): string {
  if (value === undefined) return 'missing';
  return typeof value === 'number' ? String(value) : JSON.stringify(value);
}

/**
 * What is wrong with `settings`, a problem for each setting its rule refuses, in `GameConfig`'s
 * order; none for a sound config. Never throws, whatever it is given: a save's config is read text.
 */
export function checkConfig(settings: Readonly<GameConfig> | Settings): ConfigProblem[] {
  const read = settings as Settings;
  return (Object.keys(configRules) as (keyof GameConfig)[]).flatMap((setting) => {
    const value = Object.hasOwn(read, setting) ? read[setting] : undefined;
    const expected = configRules[setting](value, read);
    return expected === undefined ? [] : [{ setting, message: `${setting} is ${shown(value)}; ${expected}` }];
  });
}

/** A config `playDeps` refuses, its problems named; a front end words `message`. */
export interface UnsoundConfig {
  kind: 'unsound-config';
  problems: ConfigProblem[];
  message: string;
}

/**
 * The config a game plays under: `defaultConfig` with `saved`'s values over it, a setting `saved`
 * lacks reading as the current default and a field `GameConfig` lacks left out (data-model §2 and
 * rule 5), checked whole (`checkConfig`). What `playDeps` merges a save's `meta.config` with, and the
 * harness its `HEROESIM_CONFIG`.
 */
export function playConfig(saved: Settings): { ok: true; config: GameConfig } | { ok: false; refusal: UnsoundConfig } {
  const merged = Object.fromEntries(
    Object.keys(defaultConfig).map((setting) => [setting, Object.hasOwn(saved, setting) ? saved[setting] : defaultConfig[setting as keyof GameConfig]]),
  );
  const problems = checkConfig(merged);
  if (problems.length === 0) return { ok: true, config: merged as unknown as GameConfig };
  const message = `The game's config is unsound: ${problems.map((problem) => problem.message).join('; ')}`;
  return { ok: false, refusal: { kind: 'unsound-config', problems, message } };
}

/**
 * The deps a game plays under (DL-186 item 12): its own `meta.config` filled forward with the current
 * defaults (`playConfig`), `content`, and `modules`, none unless given; or the config's refusal. The
 * one merge every front end, the harness and a save's load use, before any play.
 */
export function playDeps(
  document: { readonly meta: Pick<Meta, 'config'> },
  content: ContentSet,
  modules: readonly Module[] = [],
): { ok: true; deps: EngineDeps } | { ok: false; refusal: UnsoundConfig } {
  const played = playConfig(document.meta.config as unknown as Settings);
  if (!played.ok) return played;
  return { ok: true, deps: { config: played.config, content, ...(modules.length === 0 ? {} : { modules }) } };
}
