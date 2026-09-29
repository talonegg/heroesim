// `new`'s refusals (M9-S2, DL-102): the engine's `setupRefusal` says which rule a setup breaks, as
// typed data; this says it in the CLI's words, naming the flag to change. The names and the
// Background keep the words `new` gave them before M9-S2.

import { guildmasterTraitsOf, sexes, type ContentSet, type DescriptiveAttribute, type SetupRefusal, type Trait } from '@heroesim/engine';

/** The flag that sets each descriptive Attribute. */
const attributeFlags: Readonly<Record<DescriptiveAttribute, string>> = Object.freeze({
  birthplace: '--birthplace',
  appearance: '--appearance',
  biography: '--biography',
});

/** A Trait's cost in words: `costs 2`, `refunds 1`, `costs nothing`. */
function costWords(trait: Pick<Trait, 'cost'>): string {
  if (trait.cost > 0) return `costs ${trait.cost}`;
  return trait.cost < 0 ? `refunds ${-trait.cost}` : 'costs nothing';
}

/** Every Guildmaster Trait by key, with its name and cost: `miser (Miser, refunds 2)`, in key order. */
export function guildmasterTraitChoices(content: Pick<ContentSet, 'traits'>): string {
  return guildmasterTraitsOf(content)
    .map((trait) => `${trait.key} (${trait.name}, ${costWords(trait)})`)
    .join(', ');
}

/** A Trait's name, or its key when content lacks it. */
function traitName(content: Pick<ContentSet, 'traits'>, key: string): string {
  return Object.hasOwn(content.traits, key) ? (content.traits[key]?.name ?? key) : key;
}

/** Why `new` refuses a setup, in one sentence naming what to change. */
export function setupRefusalWords(refusal: SetupRefusal, content: Pick<ContentSet, 'traits' | 'backgrounds'>): string {
  switch (refusal.reason) {
    case 'guild-name-blank':
      return 'The Guild needs a name: --guild <name>.';
    case 'guildmaster-name-blank':
      return 'The Guildmaster needs a name: --master <name>.';
    case 'unknown-background': {
      const choices = Object.values(content.backgrounds)
        .filter((row) => row.owner === 'guild')
        .map((row) => `${row.key} (${row.name})`)
        .join(', ');
      return `No Guild Background "${refusal.backgroundKey}". Choose one of: ${choices}.`;
    }
    case 'unknown-sex':
      // `--sex` refuses a sex that is not one first (`args.ts`), in the command line's words.
      return `A Guildmaster's sex is ${sexes.join(' or ')}; --sex ${refusal.sex} is not.`;
    case 'age-out-of-range':
      return `A Guildmaster starts aged ${refusal.min} to ${refusal.max}, in whole years; --age ${refusal.age} is not.`;
    case 'unknown-trait':
      return `No Guildmaster Trait is keyed "${refusal.traitKey}". Choose from: ${guildmasterTraitChoices(content)}.`;
    case 'repeated-trait':
      return `--traits names ${refusal.traitKey} twice.`;
    case 'too-many-traits':
      return `A Guildmaster holds at most ${refusal.max} Traits; --traits names ${refusal.count}.`;
    case 'excluded-pair':
      return (
        `${traitName(content, refusal.traitKey)} and ${traitName(content, refusal.otherKey)} exclude each other: ` +
        'a Guildmaster holds one or the other.'
      );
    case 'over-budget':
      return (
        `Those Traits cost ${refusal.cost} points and the budget is ${refusal.budget}: ` +
        'a buff costs points and a penalty refunds them.'
      );
    case 'text-too-long':
      return `${attributeFlags[refusal.attribute]} is ${refusal.length} characters once trimmed; it holds at most ${refusal.max}.`;
  }
}
