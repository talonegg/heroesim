// `new`'s refusals (M9-S2, DL-102): the engine's `setupRefusal` says which rule a setup breaks, as
// typed data; this says it in the CLI's words, naming the flag to change. The names and the
// Background keep the words `new` gave them before M9-S2.

import {
  guildmasterStatCost,
  guildmasterStatsOf,
  guildmasterTraitsOf,
  portraitsOf,
  sexes,
  type ContentSet,
  type DescriptiveAttribute,
  type GameConfig,
  type GuildmasterTrait,
  type SetupRefusal,
} from '@heroesim/engine';
import { listed, nameIn } from '@heroesim/words';

/** The flag that sets each descriptive Attribute. */
const attributeFlags: Readonly<Record<DescriptiveAttribute, string>> = Object.freeze({
  birthplace: '--birthplace',
  appearance: '--appearance',
  biography: '--biography',
});

/** A Trait's cost in words: `costs 2`, `refunds 1`, `costs nothing`. */
function costWords(trait: Pick<GuildmasterTrait, 'cost'>): string {
  if (trait.cost > 0) return `costs ${trait.cost}`;
  return trait.cost < 0 ? `refunds ${-trait.cost}` : 'costs nothing';
}

/** Every Guildmaster Trait by key, with its name and cost: `miser (Miser, refunds 2)`, in key order. */
export function guildmasterTraitChoices(content: Pick<ContentSet, 'guildmasterTraits'>): string {
  return guildmasterTraitsOf(content)
    .map((trait) => `${trait.key} (${trait.name}, ${costWords(trait)})`)
    .join(', ');
}

/** Every Guildmaster Stat by key, in content's order: `inspiration, influence, negotiation, coaching and judgement`. */
function guildmasterStatChoices(content: Pick<ContentSet, 'stats'>): string {
  return listed(guildmasterStatsOf(content).map((stat) => stat.key));
}

/**
 * Why `--stats` names a Stat that is no Guildmaster Stat of the content, the first it names (v1.1.4-S11),
 * or `null`: the engine counts such a key for nothing (data-model rule 5), so `new` refuses it first.
 */
export function unknownStatWords(stats: Readonly<Record<string, number>>, content: Pick<ContentSet, 'stats'>): string | null {
  const known = new Set(guildmasterStatsOf(content).map((stat) => stat.key));
  const unknown = Object.keys(stats).find((key) => !known.has(key));
  return unknown === undefined ? null : `No Guildmaster Stat is keyed "${unknown}". Choose from: ${guildmasterStatChoices(content)}.`;
}

/**
 * What `new` says of the Stat points `--stats` leaves unspent, which are lost (v1.1.4-S14, DL-149
 * item 5), or `null` when it spends them all or sets no Stats: `25 Stat points left unspent are lost.`
 */
export function unspentStatWords(
  stats: Readonly<Record<string, number>> | undefined,
  content: Pick<ContentSet, 'stats'>,
  config: Pick<GameConfig, 'guildmasterStatPoints'>,
): string | null {
  if (stats === undefined) return null;
  const left = config.guildmasterStatPoints - guildmasterStatCost(stats, content);
  if (left <= 0) return null;
  return `${left} Stat ${left === 1 ? 'point' : 'points'} left unspent ${left === 1 ? 'is' : 'are'} lost.`;
}

/** Why `new` refuses a setup, in one sentence naming what to change. */
export function setupRefusalWords(refusal: SetupRefusal, content: Pick<ContentSet, 'guildmasterTraits' | 'backgrounds' | 'portraits' | 'stats'>): string {
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
    // The Stats chosen (v1.1.4-S11, DL-149 item 9).
    case 'stats-incomplete':
      return `--stats sets every Guildmaster Stat or none; it leaves out ${listed(refusal.missing)}.`;
    case 'stat-out-of-range':
      return `A Guildmaster's Stat is ${refusal.min} to ${refusal.max} when chosen, in whole numbers; --stats ${refusal.statKey}=${refusal.value} is not.`;
    case 'stats-over-points':
      return `Those Stats spend ${refusal.spent} Stat points and a Guildmaster has ${refusal.points} to share: lower one to raise another.`;
    case 'unknown-trait':
      return `No Guildmaster Trait is keyed "${refusal.traitKey}". Choose from: ${guildmasterTraitChoices(content)}.`;
    case 'repeated-trait':
      return `--traits names ${refusal.traitKey} twice.`;
    case 'too-many-traits':
      return `A Guildmaster holds at most ${refusal.max} Traits; --traits names ${refusal.count}.`;
    case 'excluded-pair':
      return (
        `${nameIn(content.guildmasterTraits, refusal.traitKey)} and ${nameIn(content.guildmasterTraits, refusal.otherKey)} exclude each other: ` +
        'a Guildmaster holds one or the other.'
      );
    case 'over-budget':
      return (
        `Those Traits cost ${refusal.cost} points and the budget is ${refusal.budget}: ` +
        'a buff costs points and a penalty refunds them.'
      );
    case 'text-too-long':
      return `${attributeFlags[refusal.attribute]} is ${refusal.length} characters once trimmed; it holds at most ${refusal.max}.`;
    case 'unknown-portrait':
      return `No Guildmaster Portrait is keyed "${refusal.portraitKey}". ${guildmasterPortraitChoices(content)}`;
    case 'portrait-of-another-sex':
      return (
        `--portrait ${refusal.portraitKey} is a ${refusal.portraitSex} Guildmaster's Portrait, and --sex is ${refusal.sex}: ` +
        'choose a Portrait of that sex, or leave out --sex.'
      );
  }
}

/** The Guildmaster pictures by key with their sex, `gm-female-01 (female)`, or that there are none (v1.1.2-S3). */
function guildmasterPortraitChoices(content: Pick<ContentSet, 'portraits'>): string {
  const choices = sexes.flatMap((sex) => portraitsOf(content, 'guildmaster', sex).map((key) => `${key} (${sex})`));
  return choices.length === 0 ? 'There are none yet: leave out --portrait.' : `Choose from: ${choices.join(', ')}.`;
}
