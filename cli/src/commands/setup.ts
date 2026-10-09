// `new`'s refusals (DL-102): the engine's `setupRefusal` says which rule a setup breaks, as typed
// data; the refusals' table says it (DL-240), the CLI's Namer naming the flag to change, and this
// adds the keys `new` takes where a key was not one: a Trait's and a Portrait's.

import {
  defaultConfig,
  guildmasterStatCost,
  guildmasterStatsOf,
  guildmasterTraitsOf,
  portraitsOf,
  sexes,
  type ContentSet,
  type GameConfig,
  type GuildmasterTrait,
  type SetupRefusal,
} from '@heroesim/engine';
import { listed, type NewGameRejection } from '@heroesim/words';
import { refusalLine } from '../namer.js';

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
  return unknown === undefined ? null : `No Guildmaster Stat is called "${unknown}". Choose from: ${guildmasterStatChoices(content)}.`;
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

/**
 * Why `new` refuses a setup, in the refusals' words (DL-240), naming what to change, and the keys to
 * choose from where it was a Trait or a Portrait that is none.
 */
export function setupRefusalWords(refusal: SetupRefusal, content: ContentSet): string {
  const words = refusalLine({ action: 'newGame', ...refusal } as NewGameRejection, { world: null, content, calendar: defaultConfig });
  switch (refusal.reason) {
    case 'unknown-trait':
      return `${words} Choose from: ${guildmasterTraitChoices(content)}.`;
    case 'unknown-portrait':
      return `${words} ${guildmasterPortraitChoices(content)}`;
    default:
      return words;
  }
}

/** The Guildmaster pictures by key with their sex, `gm-female-01 (female)`, or that there are none (v1.1.2-S3). */
function guildmasterPortraitChoices(content: Pick<ContentSet, 'portraits'>): string {
  const choices = sexes.flatMap((sex) => portraitsOf(content, 'guildmaster', sex).map((key) => `${key} (${sex})`));
  return choices.length === 0 ? 'There are none yet: leave out --portrait.' : `Choose from: ${choices.join(', ')}.`;
}
