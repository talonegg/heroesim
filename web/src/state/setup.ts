// The new-game form's Guildmaster (M9-S7, #30; DL-100 item 3, DL-102 item 10): what there is to
// choose, how each Trait stands against those already chosen, the budget left, and the engine's
// refusal of the whole setup as a sentence. Every judgement is the engine's own: a Trait's standing
// is `setupRefusal`'s verdict on the Traits chosen with it added, and the budget is
// `guildmasterTraitCost`'s sum through `traitBudgetView`, so the form copies no rule (ADR-0007).
// Built on M9-S2's `guildmasterSetupChoices`, `traitBudgetView` and `newGameRefusal`.

import { defaultConfig, setupRefusal, type ContentSet, type DescriptiveAttribute, type GameConfig, type Sex, type TraitKey } from '@heroesim/engine';
import { content } from '../content';
import { capitalised } from './names';
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
