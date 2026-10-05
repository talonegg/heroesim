// The new-game form's Guildmaster (M9-S7, #30; DL-100 item 3, DL-102 item 10): what there is to
// choose, how each Trait stands against those already chosen, the budget left, and the engine's
// refusal of the whole setup as a sentence. Every judgement is the engine's own: a Trait's standing
// is `setupRefusal`'s verdict on the Traits chosen with it added, and the budget is
// `guildmasterTraitCost`'s sum through `traitBudgetView`, so the form copies no rule (ADR-0007).
// Built on M9-S2's `guildmasterSetupChoices`, `traitBudgetView` and `newGameRefusal`.
//
// Since v1.1.2-S4 (DL-125 items 3 and 6): the Guildmaster pictures offered for the Portrait, and the
// preview of what the seed draws, which is the engine's `previewGuildmaster`, the function
// `createWorld` makes the Guildmaster by, so the form names what "Start the game" makes. Since
// v1.1.2-S5: the Birthplace, Appearance and Biography written for that Guildmaster by the engine's
// `describeGuildmaster`, for "Write them for me" and "Again".
//
// Since v1.1.4-S11 (DL-149): the two ways of "Your Guildmaster", "Choose for me", which leaves the whole
// Guildmaster to the seed, and "Choose myself", which holds "Start the game" until the sex, the age and
// a picture are chosen (`unchosenWords`); the Portrait grid of the sex chosen, and none before; and the
// five Guildmaster Stats set within the Stat points (`statPicksView`), each judged by the engine's
// `setupRefusal` and summed by its `guildmasterStatCost`.

import {
  defaultConfig,
  describeGuildmaster,
  descriptiveAttributeLabels,
  descriptiveAttributes,
  guildmasterStatBounds,
  guildmasterStatCost,
  guildmasterStatsOf,
  portraitFit,
  portraitsOf,
  previewGuildmaster,
  setupRefusal,
  sexes,
  type ContentSet,
  type DescriptiveAttribute,
  type GameConfig,
  type GuildmasterDescription,
  type GuildmasterPreview,
  type PortraitKey,
  type Sex,
  type StatKey,
  type StatValues,
  type TraitKey,
} from '@heroesim/engine';
import { capitalised, listed, nameIn } from '@heroesim/words';
import { content } from '../content';
import { newGameRefusal, type NewGame } from './reducer';
import { rejectionSentence } from './rejections';
import { guildmasterSetupChoices, traitBudgetView, type TraitChoice } from './selectors';
import { guildmasterStatBearsOn } from './world-views';

/** What the form offers for the Guildmaster beside the Traits, and how the Traits are held. */
export interface SetupFormChoices {
  sexes: { value: Sex; label: string }[];
  /** Each starting age, whole years, youngest first. */
  ages: number[];
  /** `21 to 50`: the ages `guildmasterStartingAgeMin` to `Max`. */
  agesWords: string;
  /** `Retires at 61`: the age a Guildmaster retires at, `guildmasterRetirementAge` (DL-113 item 5). */
  retiresWords: string;
  /** How many Traits, and the budget they keep to, in words. */
  traitsWords: string;
  /** The descriptive Attributes, each with its bound in characters and in words. */
  attributes: { attribute: DescriptiveAttribute; label: string; maxLength: number; boundWords: string }[];
}

/**
 * The sexes, the starting ages and the descriptive Attributes the new-game form offers for the
 * Guildmaster, and the Traits' limits in words (M9-S7), from `guildmasterSetupChoices` under
 * `config`, the current defaults unless given.
 */
export function setupFormChoices(set: ContentSet = content, config: GameConfig = defaultConfig): SetupFormChoices {
  const choices = guildmasterSetupChoices(set, config);
  const { ageMin, ageMax, retirementAge, traitsMax, traitBudget } = choices;
  return {
    sexes: choices.sexes.map((sex) => ({ value: sex, label: capitalised(sex) })),
    ages: Array.from({ length: Math.max(0, ageMax - ageMin + 1) }, (_, index) => ageMin + index),
    agesWords: `${ageMin} to ${ageMax}`,
    retiresWords: `Retires at ${retirementAge}`,
    traitsWords:
      `Up to ${traitsMax} ${traitsMax === 1 ? 'Trait' : 'Traits'}, costing no more than the budget of ${traitBudget} in all: ` +
      'a buff costs, and a penalty refunds.',
    attributes: choices.attributes.map((row) => ({ ...row, boundWords: `At most ${row.maxLength} characters` })),
  };
}

/**
 * Why the engine would refuse to start `play`, in the page's words (`rejections.ts`), or `null`
 * when it keeps the rules (M9-S7): `newGameRefusal`'s verdict, so the form says it before the click.
 */
export function setupRefusalWords(play: NewGame): string | null {
  const refusal = newGameRefusal(play);
  return refusal === null ? null : rejectionSentence(refusal, null, content);
}

/** What an empty new-game form says in place of a refusal, before anything is typed (DL-109 item 2, Q22). */
export const setupHint = 'Name your Guild and its Guildmaster to start.';

/**
 * The two ways of "Your Guildmaster" (v1.1.4-S11, DL-149 items 1 to 3): `for-me`, "Choose for me", the
 * whole Guildmaster drawn from the seed; `myself`, "Choose myself", the sex, the age, a picture and the
 * Stats the player's, and the Traits either way.
 */
export type SetupWay = 'for-me' | 'myself';

/** What "Choose myself" needs chosen before "Start the game" (DL-149 items 3 and 4). */
export type UnchosenPart = 'sex' | 'age' | 'portrait';

const unchosenNames: Readonly<Record<UnchosenPart, string>> = Object.freeze({ sex: 'Sex', age: 'Age', portrait: 'Portrait' });

/**
 * What "Choose myself" says while `unchosen` are not yet chosen (v1.1.4-S11): `Choose your Guildmaster's
 * Sex, Age and Portrait to start.`; `null` once all are. The engine would draw any left out, for the
 * CLI, so the hold is the form's, not a refusal.
 */
export function unchosenWords(unchosen: readonly UnchosenPart[]): string | null {
  if (unchosen.length === 0) return null;
  return `Choose your Guildmaster's ${listed(unchosen.map((part) => unchosenNames[part]))} to start.`;
}

/** What the form says beside "Start the game": a hint, or the engine's refusal. */
export interface SetupNotice {
  kind: 'hint' | 'refusal';
  words: string;
}

/**
 * What the new-game form says beside "Start the game" (DL-109 item 2, Q22): before any field is
 * touched, the hint that asks for the names; once one is, the engine's refusal (`setupRefusalWords`);
 * then, with "Choose myself", what is still to choose (`unchosenWords`, v1.1.4-S11); `null` while the
 * game would start. Whether the game can start is the notice's: none, and it can.
 */
export function setupNotice(play: NewGame, touched: boolean, unchosen: readonly UnchosenPart[] = []): SetupNotice | null {
  const refusal = setupRefusalWords(play);
  if (refusal !== null) return touched ? { kind: 'refusal', words: refusal } : { kind: 'hint', words: setupHint };
  const words = unchosenWords(unchosen);
  return words === null ? null : { kind: 'hint', words };
}

/**
 * How a Trait stands against those chosen:
 * - `chosen`: it is one of them;
 * - `open`: it can be chosen, and the Traits would keep the rules;
 * - `over-budget`: it can be chosen, but the Traits would then cost more than the budget, until a
 *   penalty chosen beside it refunds enough;
 * - `excluded`: a Trait chosen excludes it;
 * - `at-most`: as many Traits as a Guildmaster holds are chosen.
 *
 * The last two cannot be chosen until a Trait is taken off: choosing more mends neither.
 */
export type TraitStanding = 'chosen' | 'open' | 'over-budget' | 'excluded' | 'at-most';

/** A Guildmaster Trait as the form offers it, with how it stands against those chosen. */
export interface TraitPick extends TraitChoice {
  /** `Costs 2`, `Refunds 2`, `Costs nothing`. */
  costWords: string;
  /** `Excludes Spendthrift and Well liked`; `null` when it excludes none. */
  excludesWords: string | null;
  chosen: boolean;
  standing: TraitStanding;
  /** Whether its box can be ticked or unticked now: not while it is `excluded` or `at-most`. */
  choosable: boolean;
  /** Why it is `over-budget`, `excluded` or `at-most`, in words; `null` otherwise. */
  reason: string | null;
}

/** The Trait budget as the player picks. */
export interface TraitBudget {
  /** `guildmasterTraitBudget`. */
  budget: number;
  /** What the Traits chosen cost, a penalty's refund taken off: the engine's sum. */
  spent: number;
  /** The budget less `spent`: negative when they pass it. */
  left: number;
  /** Whether they pass it, which the engine refuses. */
  over: boolean;
  /** `Budget left: 1`, or `Over the budget by 1`. */
  leftWords: string;
  /** `The Traits chosen cost 2; the budget is 1.`, or they refund, or none is chosen. */
  costWords: string;
}

export interface TraitPicksView {
  budget: TraitBudget;
  /** Every Guildmaster Trait, in key order. */
  traits: TraitPick[];
}

/** What a Trait costs against the budget, in words. */
function costWords(cost: number): string {
  if (cost > 0) return `Costs ${cost}`;
  if (cost < 0) return `Refunds ${-cost}`;
  return 'Costs nothing';
}

function budgetOf(chosen: readonly TraitKey[], set: ContentSet, config: GameConfig): TraitBudget {
  const { spent, left } = traitBudgetView(chosen, set, config);
  const budget = config.guildmasterTraitBudget;
  const over = left < 0;
  const said =
    chosen.length === 0
      ? `No Trait is chosen; the budget is ${budget}.`
      : spent < 0
        ? `The Traits chosen refund ${-spent}; the budget is ${budget}.`
        : `The Traits chosen cost ${spent}; the budget is ${budget}.`;
  return { budget, spent, left, over, leftWords: over ? `Over the budget by ${-left}` : `Budget left: ${left}`, costWords: said };
}

/**
 * Each Guildmaster Trait of `set` as the form offers it while `chosen` are chosen, with the budget
 * left (M9-S7). A Trait's standing is the engine's `setupRefusal` on the Traits chosen with it
 * added, under `config` (the current defaults, the rules a new game begins under): refused as too
 * many, it is `at-most`; as an excluded pair with it, `excluded`; as over the budget, `over-budget`.
 */
export function traitPicksView(
  chosen: readonly TraitKey[],
  set: ContentSet = content,
  config: GameConfig = defaultConfig,
): TraitPicksView {
  const deps = { config, content: set };
  const { traits } = guildmasterSetupChoices(set, config);
  const nameOf = (key: TraitKey): string => traits.find((trait) => trait.key === key)?.name ?? key;
  const picks = traits.map((trait): TraitPick => {
    const offered = {
      ...trait,
      costWords: costWords(trait.cost),
      excludesWords: trait.excludes.length === 0 ? null : `Excludes ${listed(trait.excludes.map(({ name }) => name))}`,
    };
    if (chosen.includes(trait.key)) return { ...offered, chosen: true, standing: 'chosen', choosable: true, reason: null };
    // The whole setup but the Traits keeps the rules, so the verdict is the Traits' alone.
    const refusal = setupRefusal({ guildName: 'Guild', guildmasterName: 'Guildmaster', createdAt: '', guildmasterTraitKeys: [...chosen, trait.key] }, deps);
    const open = { ...offered, chosen: false, choosable: true };
    switch (refusal?.reason) {
      case 'too-many-traits':
        return { ...open, standing: 'at-most', choosable: false, reason: `${refusal.max} Traits are chosen, the most a Guildmaster holds.` };
      case 'excluded-pair': {
        const by = refusal.traitKey === trait.key ? refusal.otherKey : refusal.traitKey;
        return { ...open, standing: 'excluded', choosable: false, reason: `Excluded by ${nameOf(by)}, which is chosen.` };
      }
      case 'over-budget':
        return {
          ...open,
          standing: 'over-budget',
          reason: `Over the budget: with it, the Traits cost ${refusal.cost} and the budget is ${refusal.budget}.`,
        };
      default:
        return { ...open, standing: 'open', reason: null };
    }
  });
  return { budget: budgetOf(chosen, set, config), traits: picks };
}

/** A Guildmaster Stat as "Choose myself" offers it (v1.1.4-S11, DL-149 item 5), with its stepper's state. */
export interface StatPick {
  key: StatKey;
  name: string;
  value: number;
  /** The bounds the engine holds it to: `guildmasterStatMin` to `Max` (`guildmasterStatBounds`). */
  min: number;
  max: number;
  /** What it does, in the Guildmaster view's words (`guildmasterStatBearsOn`): `The reward agreed and the fees paid`. */
  bearsOn: string;
  /** Whether one more would keep the rules: within its bounds and the Stat points, the engine's verdict. */
  canRaise: boolean;
  /** Whether one less would: within its bounds. */
  canLower: boolean;
}

/** The Stat points as the player sets the Stats, shown as the Trait budget is. */
export interface StatPoints {
  /** `guildmasterStatPoints`. */
  points: number;
  /** What the Stats set cost in all: the engine's sum. */
  spent: number;
  /** The points less `spent`: negative when they pass them, which the engine refuses. */
  left: number;
  over: boolean;
  /** `Stat points left: 0`, or `Over the Stat points by 1`. */
  leftWords: string;
  /** `The Stats spend 50 of 50 Stat points.` */
  spentWords: string;
  /** `Stat points left unspent are lost.` while some are; `null` otherwise. */
  unspentWords: string | null;
}

export interface StatPicksView {
  points: StatPoints;
  /** Every Guildmaster Stat, in content's order, as the Guildmaster view lists them. */
  stats: StatPick[];
}

/** No refusal for the Stats `stats`, the rest of the setup keeping the rules: the engine's verdict on them alone. */
function statsKeepTheRules(stats: Readonly<StatValues>, deps: { config: GameConfig; content: ContentSet }): boolean {
  return setupRefusal({ guildName: 'Guild', guildmasterName: 'Guildmaster', createdAt: '', guildmasterStats: stats }, deps) === null;
}

/**
 * The Stats "Choose myself" starts from (v1.1.4-S11, DL-149 item 5): each the Stat points shared evenly,
 * 10 of 50 by default, the drawn Stats' mean, held within its bounds, so the start never passes the points.
 */
export function startingStats(set: ContentSet = content, config: GameConfig = defaultConfig): StatValues {
  const rows = guildmasterStatsOf(set);
  const even = rows.length === 0 ? 0 : Math.floor(config.guildmasterStatPoints / rows.length);
  return Object.fromEntries(
    rows.map((row) => {
      const { min, max } = guildmasterStatBounds(row, config);
      return [row.key, Math.min(max, Math.max(min, even))];
    }),
  );
}

/**
 * Each Guildmaster Stat as "Choose myself" sets it while `stats` are set, and the Stat points left
 * (v1.1.4-S11, DL-149 item 5). Whether a Stat can be raised or lowered by one is the engine's
 * `setupRefusal` on the Stats so changed, under `config`, so the stepper never passes the points or a
 * bound; what they cost is its `guildmasterStatCost` (ADR-0007).
 */
export function statPicksView(stats: Readonly<StatValues>, set: ContentSet = content, config: GameConfig = defaultConfig): StatPicksView {
  const deps = { config, content: set };
  const spent = guildmasterStatCost(stats, set);
  const points = config.guildmasterStatPoints;
  const left = points - spent;
  const over = left < 0;
  return {
    points: {
      points,
      spent,
      left,
      over,
      leftWords: over ? `Over the Stat points by ${-left}` : `Stat points left: ${left}`,
      spentWords: `The Stats spend ${spent} of ${points} Stat points.`,
      unspentWords: left > 0 ? 'Stat points left unspent are lost.' : null,
    },
    stats: guildmasterStatsOf(set).map((row) => {
      const value = stats[row.key] ?? 0;
      const { min, max } = guildmasterStatBounds(row, config);
      return {
        key: row.key,
        name: row.name,
        value,
        min,
        max,
        bearsOn: guildmasterStatBearsOn[row.key] ?? '',
        canRaise: statsKeepTheRules({ ...stats, [row.key]: value + 1 }, deps),
        canLower: statsKeepTheRules({ ...stats, [row.key]: value - 1 }, deps),
      };
    }),
  };
}

/** `Each 5 to 15, sharing 50 Stat points; each starts at 10.`: the Stats' rules, in words. */
export function statsWords(set: ContentSet = content, config: GameConfig = defaultConfig): string {
  const start = Object.values(startingStats(set, config))[0] ?? config.guildmasterStatMin;
  return `Each ${config.guildmasterStatMin} to ${config.guildmasterStatMax}, sharing ${config.guildmasterStatPoints} Stat points; each starts at ${start}.`;
}

/** A Guildmaster picture as the form offers it for the Portrait (v1.1.2-S4). */
export interface PortraitPick {
  key: PortraitKey;
  sex: Sex;
  /** `Female Portrait 1`: its sex and its place among that sex's pictures, its name for a screen reader. */
  label: string;
}

/** The Guildmaster pictures of one sex, as the form groups them. */
export interface PortraitGroup {
  sex: Sex;
  /** `Female`. */
  label: string;
  pictures: PortraitPick[];
}

/** Every Guildmaster picture of `set`, by sex in the engine's order, each in content's order. */
function portraitPicks(set: ContentSet): PortraitGroup[] {
  return sexes.map((sex) => ({
    sex,
    label: capitalised(sex),
    pictures: portraitsOf(set, 'guildmaster', sex).map((key, index) => ({ key, sex, label: `${capitalised(sex)} Portrait ${index + 1}` })),
  }));
}

/**
 * The Guildmaster pictures of `sex` (v1.1.2-S4, DL-125 item 3), a group; with `null`, every sex's, a
 * group each. A sex with no picture has no group, and a Silhouette is never offered.
 */
export function portraitChoices(sex: Sex | null, set: ContentSet = content): PortraitGroup[] {
  return portraitPicks(set).filter((group) => (sex === null || group.sex === sex) && group.pictures.length > 0);
}

/** The picture of the Guildmaster's keyed `key`, as the form names it; `undefined` when content lists none. */
export function portraitPick(key: PortraitKey, set: ContentSet = content): PortraitPick | undefined {
  return portraitPicks(set)
    .flatMap((group) => group.pictures)
    .find((pick) => pick.key === key);
}

/** What the form holds of a new game: all of it but the seed and the clock, which the click supplies. */
export type SetupFields = Omit<NewGame, 'kind' | 'seed' | 'createdAt'>;

/**
 * The setup grid (v1.1.3-S7; DL-134 item 9, DL-143) as "Choose myself" shows it (v1.1.4-S11, DL-149
 * item 4): the pictures of the sex chosen, one sex's being within the 250 kB the grid may read, and no
 * draw from the seed among them; before a sex is chosen, no picture at all, and the words that say so.
 */
export type PortraitGridView = { sex: Sex; pictures: PortraitPick[] } | { sex: null; words: string };

/** What the grid says before a sex is chosen (v1.1.4-S11, DL-149 item 4). */
export const unsexedGridWords = 'Choose a Sex to see the pictures.';

/** The setup grid for the sex chosen, `null` while none is (v1.1.4-S11). */
export function portraitGrid(sex: Sex | null, set: ContentSet = content): PortraitGridView {
  if (sex === null) return { sex: null, words: unsexedGridWords };
  return { sex, pictures: portraitChoices(sex, set)[0]?.pictures ?? [] };
}

/**
 * What the form notes beside a Portrait the player chose (v1.1.3-S7; DL-134 item 7): the engine's
 * `portraitFit`, in words, never a refusal. None while no Portrait is chosen, or the seed is blank,
 * since the Guildmaster's Traits, and the age left blank, are the seed's to draw.
 * - `This Portrait looks 40 to 55: older than your Guildmaster's 25.`
 * - `This Portrait's Calling, Scholar, clashes with the Trait Mistrusts magic.`
 */
export function portraitFitWords(setup: SetupFields, seed: string, set: ContentSet = content, config: GameConfig = defaultConfig): string[] {
  if (setup.guildmasterPortraitKey === undefined || seed.trim() === '') return [];
  return portraitFit({ ...factsOf(setup), createdAt: '' }, seed.trim(), { config, content: set }).map((note) =>
    note.kind === 'age'
      ? `This Portrait looks ${note.apparentAge[0]} to ${note.apparentAge[1]}: ${note.looks} than your Guildmaster's ${note.age}.`
      : `This Portrait's Calling, ${capitalised(note.callingKey)}, clashes with the Trait ${nameIn(set.guildmasterTraits, note.traitKey)}.`,
  );
}

/**
 * What the preview says with the seed blank (v1.1.4-S11, DL-149 item 7): one is made up at the click,
 * and what is chosen for the player is chosen then.
 */
export const unseededWords: Readonly<Record<SetupWay, string>> = Object.freeze({
  'for-me': 'The seed is blank, so one is made up when the game starts, and your Guildmaster is chosen for you then.',
  myself: 'The seed is blank, so one is made up when the game starts, and the Traits are chosen for you then.',
});

/** `setup` with neither name nor any text: what the Guildmaster's facts are drawn from. */
function factsOf(setup: SetupFields): SetupFields {
  const facts: SetupFields = { ...setup, guildName: 'Guild', guildmasterName: 'Guildmaster' };
  delete facts.guildmasterBirthplace;
  delete facts.guildmasterAppearance;
  delete facts.guildmasterBiography;
  return facts;
}

/**
 * The Guildmaster `setup` makes from `seed`, trimmed as the click sends it, under `config` and `set`
 * (the current defaults and the core, a new game's rules): the engine's `previewGuildmaster`, asked
 * once for the form's preview and its texts (v1.1.2-S6), so the form computes no rule (ADR-0007).
 * Neither name nor any text is read, so typing them asks nothing again, and the texts in the preview
 * are those "Start the game" writes for all three left blank. `null` when the engine would refuse
 * the setup, whose sentence the form already says. A blank seed is previewed as it stands: what is
 * drawn, and whether the setup is refused, do not follow the seed.
 */
export function guildmasterPreview(
  setup: SetupFields,
  seed: string,
  set: ContentSet = content,
  config: GameConfig = defaultConfig,
): GuildmasterPreview | null {
  return previewGuildmaster({ ...factsOf(setup), createdAt: '' }, seed.trim(), { config, content: set });
}

/**
 * What the new-game form shows of the Guildmaster chosen for the player (v1.1.2-S4, DL-125 item 6;
 * v1.1.4-S11, DL-149 items 2 and 7), under `Chosen for you`. With "Choose for me", the whole
 * Guildmaster:
 * - `whoWords`, the sex and the age: `Female, 34`;
 * - `statsWords`: `Inspiration 12, Influence 8, Negotiation 11, Coaching 9 and Judgement 10`;
 * - `traitsWords`: `Traits: Miser and Old soldier`, or `Traits: None`;
 * - `portrait`, the Portrait, with its words: `Portrait: Female Portrait 1`.
 * With "Choose myself", the Traits alone, and only when they are chosen for the player.
 */
export type GuildmasterPreviewView =
  | {
      kind: 'chosen';
      whoWords: string | null;
      statsWords: string | null;
      traitsWords: string | null;
      portrait: { sex: Sex; portraitKey: PortraitKey | null; words: string } | null;
    }
  | { kind: 'unseeded'; words: string };

/** `Inspiration 12, Influence 8, …`: the Guildmaster Stats in content's order, as the Guildmaster view lists them. */
function statsLine(stats: Readonly<StatValues>, set: ContentSet): string {
  return listed(guildmasterStatsOf(set).map((row) => `${row.name} ${stats[row.key] ?? 0}`));
}

/**
 * The preview's words for `preview`, the engine's for `seed` (`guildmasterPreview`), with the setup's
 * `way` (v1.1.4-S11): with "Choose for me", everything the engine drew; with "Choose myself", the Traits
 * when the engine's `drawn` says they are left to it (v1.1.2-S6), so the form repeats no rule
 * (ADR-0007). `null` when the engine would refuse the setup, whose sentence the form already says, or
 * when nothing is chosen for the player; the `unseeded` words when the seed is blank.
 */
export function guildmasterPreviewView(
  preview: GuildmasterPreview | null,
  seed: string,
  way: SetupWay,
  set: ContentSet = content,
): GuildmasterPreviewView | null {
  if (preview === null) return null;
  const { sex, age, traitKeys, stats, portraitKey, drawn } = preview;
  const whole = way === 'for-me';
  if (!whole && !drawn.traits) return null;
  if (seed.trim() === '') return { kind: 'unseeded', words: unseededWords[way] };
  const pictured = portraitKey === null ? 'None, the Silhouette' : (portraitPick(portraitKey, set)?.label ?? portraitKey);
  return {
    kind: 'chosen',
    whoWords: whole ? `${capitalised(sex)}, ${age}` : null,
    statsWords: whole ? statsLine(stats, set) : null,
    traitsWords: `Traits: ${traitKeys.length === 0 ? 'None' : listed(traitKeys.map((key) => nameIn(set.guildmasterTraits, key)))}`,
    portrait: whole ? { sex, portraitKey, words: `Portrait: ${pictured}` } : null,
  };
}

/** The three texts written for the Guildmaster, and for whom, in words and as the facts written for. */
export interface WrittenDescription {
  /** What each field shows where the player has not typed. */
  texts: GuildmasterDescription;
  /** `Written for a female Guildmaster of 34.` */
  words: string;
  /**
   * The facts each text was written for, as one string: the seed, the sex, the age, the Traits, the
   * Portrait and the Background, and for the Biography the Birthplace given too. Two writings for the
   * same facts have the same (v1.1.2-S6).
   */
  facts: Record<DescriptiveAttribute, string>;
}

/**
 * The Birthplace, Appearance and Biography "Write them for me" (`n` 0) and "Again" (each `n` after)
 * put in the form (v1.1.2-S5, DL-125 item 6), for `preview`, the engine's Guildmaster for `seed`
 * (`guildmasterPreview`): at `n` 0 the texts in the preview, which are the engine's
 * `describeGuildmaster` at 0 and what "Start the game" writes; after, `describeGuildmaster` for the
 * preview's sex, age, Traits, Portrait and Background, so the form computes no rule (ADR-0007). A
 * Birthplace `given`, the one the player typed (`givenTexts`), is the Biography's (v1.1.2-S6).
 * `null` when there is no preview, the engine refusing the setup, or the seed is blank, since then
 * there is no Guildmaster to write for.
 */
export function writtenDescription(
  preview: GuildmasterPreview | null,
  seed: string,
  n: number,
  given: Partial<GuildmasterDescription> = {},
  set: ContentSet = content,
): WrittenDescription | null {
  const trimmed = seed.trim();
  if (preview === null || trimmed === '') return null;
  const { sex, age, traitKeys, portraitKey, backgroundKey } = preview;
  const request = { seed: trimmed, n, sex, age, traitKeys, portraitKey, backgroundKey };
  const drawn = n === 0 ? preview.description : describeGuildmaster(request, { content: set });
  const place = (given.birthplace ?? '').trim();
  // The Birthplace typed is the Biography's too, as "Start the game" would write it (v1.1.2-S6); the
  // draws are the same, so only the Biography moves. The Birthplace field, where not typed, shows the
  // Birthplace drawn.
  const texts = place === '' ? drawn : { ...describeGuildmaster({ ...request, given: { birthplace: place } }, { content: set }), birthplace: drawn.birthplace };
  const facts = JSON.stringify([trimmed, sex, age, traitKeys, portraitKey, backgroundKey]);
  return {
    texts,
    words: `Written for a ${sex} Guildmaster of ${age}.`,
    facts: { birthplace: facts, appearance: facts, biography: JSON.stringify([facts, place]) },
  };
}

/**
 * The texts the player has given that a writing reads (v1.1.2-S6): the Birthplace typed, which the
 * Biography names. A blank one is none.
 */
export function givenTexts(held: TextsHeld): Partial<GuildmasterDescription> {
  const place = held.typed.birthplace?.text.trim() ?? '';
  return place === '' ? {} : { birthplace: place };
}

/**
 * What the form holds of the three texts (v1.1.2-S6): how many times they have been written, and those
 * the player has typed. A field the player has not typed in shows the writing, so it follows the
 * Guildmaster as the facts change; one they have typed in keeps their words.
 */
export interface TextsHeld {
  /** `null` before "Write them for me"; then 0, and one more for each "Again". */
  n: number | null;
  /**
   * The texts the player typed, each with `over`, the facts of the writing shown when they last changed
   * it (`WrittenDescription.facts`), or `null` when none was shown there when they first typed in it.
   */
  typed: Readonly<Partial<Record<DescriptiveAttribute, { text: string; over: string | null }>>>;
}

/** Nothing written and nothing typed: the form as it opens. */
export const noTexts: TextsHeld = { n: null, typed: {} };

/**
 * "Write them for me" (`n` 0) or "Again" (`n` one more) (v1.1.2-S6): the fields left blank, or still
 * as written, are written; those holding the player's words are kept, as `createWorld` keeps a text
 * given and writes a blank one (`describeBlanks`).
 */
export function textsWritten(held: TextsHeld, n: number): TextsHeld {
  const typed = Object.fromEntries(Object.entries(held.typed).filter(([, each]) => each.text.trim() !== ''));
  return { n, typed };
}

/**
 * `text` typed in `attribute`'s field while `written` is the writing for the Guildmaster the form
 * makes (v1.1.2-S6). Typed back to the text written, the field is as written again, and follows the
 * writing; otherwise it holds the player's words, marked with the facts of the writing shown as they
 * change it. So a field changed after the facts changed is the player's, and is not said to be written
 * for another Guildmaster until the facts change again. One first typed where nothing was written is
 * the player's own, however often it is changed.
 */
export function textTyped(held: TextsHeld, attribute: DescriptiveAttribute, text: string, written: WrittenDescription | null): TextsHeld {
  const shown = held.n === null ? null : written;
  const rest = Object.fromEntries(Object.entries(held.typed).filter(([key]) => key !== attribute));
  if (shown !== null && text === shown.texts[attribute]) return { ...held, typed: rest };
  const before = held.typed[attribute];
  const over = (before !== undefined && before.over === null) || shown === null ? null : shown.facts[attribute];
  return { ...held, typed: { ...rest, [attribute]: { text, over } } };
}

/** What the three fields show and "Start the game" sends, and what the form says of them. */
export interface TextsView {
  values: Record<DescriptiveAttribute, string>;
  /** `Written for a female Guildmaster of 34. Change them as you like.`, and more; `null` before any writing. */
  words: string | null;
}

/** What the form says with nothing written because there is no Guildmaster to write for. */
const unwritableWords = 'Nothing can be written for this Guildmaster yet. Any left blank are written when the game starts.';

/**
 * The three fields as `held` and `written` make them (v1.1.2-S6): the player's words where they typed,
 * else the writing, else blank; and the note. The note says for whom they were written. It names the
 * fields the player changed from a writing for other facts, which are kept as they are, and says so
 * when all three are the player's own, or when there is no Guildmaster to write for (`written`
 * `null`: the setup refused, or the seed blank).
 */
export function textsView(held: TextsHeld, written: WrittenDescription | null): TextsView {
  const shown = held.n === null ? null : written;
  const values = Object.fromEntries(
    descriptiveAttributes.map((attribute) => [attribute, held.typed[attribute]?.text ?? shown?.texts[attribute] ?? '']),
  ) as Record<DescriptiveAttribute, string>;
  if (held.n === null) return { values, words: null };
  if (written === null) return { values, words: unwritableWords };
  const own = descriptiveAttributes.filter((attribute) => (held.typed[attribute]?.text.trim() ?? '') !== '');
  const stale = own.filter((attribute) => {
    const over = held.typed[attribute]?.over ?? null;
    return over !== null && over !== written.facts[attribute];
  });
  if (stale.length === 0) {
    const words =
      own.length === descriptiveAttributes.length
        ? 'All three are your own words, so none was written. Clear one to have it written.'
        : `${written.words} Change them as you like.`;
    return { values, words };
  }
  const named = listed(stale.map((attribute) => `the ${descriptiveAttributeLabels[attribute]}`));
  const one = stale.length === 1;
  return {
    values,
    words:
      `${written.words} ${capitalised(named)} ${one ? 'was' : 'were'} written for another Guildmaster, ` +
      `and ${one ? 'is' : 'are'} kept as you changed ${one ? 'it' : 'them'}.`,
  };
}
