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

import {
  defaultConfig,
  describeGuildmaster,
  descriptiveAttributeLabels,
  descriptiveAttributes,
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
  type TraitKey,
} from '@heroesim/engine';
import { content } from '../content';
import { capitalised, nameIn } from './names';
import { listed } from './narrate';
import { newGameRefusal, type NewGame } from './reducer';
import { rejectionSentence } from './rejections';
import { guildmasterSetupChoices, traitBudgetView, type TraitChoice } from './selectors';

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

/** What the form says beside "Start the game": a hint, or the engine's refusal. */
export interface SetupNotice {
  kind: 'hint' | 'refusal';
  words: string;
}

/**
 * What the new-game form says beside "Start the game" (DL-109 item 2, Q22): before any field is
 * touched, the hint that asks for the names; once one is, the engine's refusal (`setupRefusalWords`);
 * `null` while the engine would start the game. Whether the game can start is the refusal's either way.
 */
export function setupNotice(play: NewGame, touched: boolean): SetupNotice | null {
  const refusal = setupRefusalWords(play);
  if (refusal === null) return null;
  return touched ? { kind: 'refusal', words: refusal } : { kind: 'hint', words: setupHint };
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
 * The Guildmaster pictures the form offers after "Drawn from the seed" (v1.1.2-S4, DL-125 item 3):
 * those of `sex`, the sex chosen; with the sex drawn (`null`), every sex's, a group each, since a
 * picture is of one sex and choosing it chooses the sex (DL-130 item 5). A sex with no picture has no
 * group, and a Silhouette is never offered.
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

/** What the form says of the seed's draws with the seed blank: one is made up at the click. */
export const unseededWords = 'The seed is blank, so one is made up when the game starts, and what is left to it is drawn then.';

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
 * What the new-game form shows of the Guildmaster the seed draws (v1.1.2-S4, DL-125 item 6), each line
 * only for what is left to the seed:
 * - `drawnWords`, the sex and the age: `Drawn: Female, 34`, `Drawn: Female` or `Drawn: Age 34`;
 * - `traitsWords`: `Drawn Traits: Miser and Old soldier`, or `Drawn Traits: None`;
 * - `portrait`, the Portrait drawn, with its words: `Drawn Portrait: Female Portrait 1`.
 */
export type GuildmasterPreviewView =
  | {
      kind: 'drawn';
      drawnWords: string | null;
      traitsWords: string | null;
      portrait: { sex: Sex; portraitKey: PortraitKey | null; words: string } | null;
    }
  | { kind: 'unseeded'; words: string };

/**
 * The preview's words for `preview`, the engine's for `seed` (`guildmasterPreview`): what is left to
 * the seed is the engine's `drawn` (v1.1.2-S6), a Portrait chosen choosing the sex with it, so the
 * form repeats no rule (ADR-0007). `null` when the engine would refuse the setup, whose sentence the
 * form already says, or when nothing is left to the seed; the `unseeded` words when the seed is blank.
 */
export function guildmasterPreviewView(preview: GuildmasterPreview | null, seed: string, set: ContentSet = content): GuildmasterPreviewView | null {
  if (preview === null) return null;
  const { sex, age, traitKeys, portraitKey, drawn } = preview;
  if (!(drawn.sex || drawn.age || drawn.traits || drawn.portrait)) return null;
  if (seed.trim() === '') return { kind: 'unseeded', words: unseededWords };
  const parts = [drawn.sex ? capitalised(sex) : null, drawn.age ? (drawn.sex ? String(age) : `Age ${age}`) : null].filter((part) => part !== null);
  const pictured = portraitKey === null ? 'None: the Silhouette' : (portraitPick(portraitKey, set)?.label ?? portraitKey);
  return {
    kind: 'drawn',
    drawnWords: parts.length === 0 ? null : `Drawn: ${parts.join(', ')}`,
    traitsWords: drawn.traits ? `Drawn Traits: ${traitKeys.length === 0 ? 'None' : listed(traitKeys.map((key) => nameIn(set.traits, key)))}` : null,
    portrait: drawn.portrait ? { sex, portraitKey, words: `Drawn Portrait: ${pictured}` } : null,
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
