// The words about a proposed Party that the page's builder and the CLI's `preview` share (DL-289):
// what its form does to its odds and what relieves the hurt on the Quest
// (a Healer among the Party, a heal Item carried; DL-285). Words only: whether a Class relieves is
// content's mark, read through the engine's `relievesHurt`, and which effect a form has is
// `formEffect`'s.

import { relievesHurt, type ConsumableReach, type FormEffect, type Hero } from '@heroesim/engine';
import type { ContentSet } from '@heroesim/engine/content';
import { listed } from './names.js';

/** What a Party's mean form does to its odds (v1.1.4-S3, DL-154, `formEffect`): the page's builder and the CLI's `preview` say it alike. */
export const formEffectWords: Readonly<Record<FormEffect, string>> = {
  raises: 'Raises the odds',
  none: 'Makes no difference',
  'lowers-a-little': 'Lowers the odds a little',
  'lowers-badly': 'Lowers the odds badly',
};

/**
 * What relieves the hurt of a Party's Heroes on the Quest, in two lines (DL-285): the Heroes of a Class
 * content marks as relieving, who ease the hurt of the others, and the heal Items it would carry, each
 * spent at an Injury taken on the Quest; a line says `none` rather than leave the player to guess. The
 * Healer's line is left out where content marks no Class. The figures are the config's and are not said.
 */
export function reliefWords(
  heroes: readonly Pick<Hero, 'name' | 'classKey'>[],
  consumables: readonly Pick<ConsumableReach, 'quantity' | 'consumable'>[],
  content: Pick<ContentSet, 'classes'>,
): string[] {
  const classes = Object.entries(content.classes)
    .filter(([key]) => relievesHurt(key, content))
    .map(([, row]) => row.name);
  const healers = heroes.filter((hero) => relievesHurt(hero.classKey, content)).map((hero) => hero.name);
  const heals = consumables.flatMap(({ quantity, consumable }) => (consumable?.effect.kind === 'heal' ? [`${consumable.name} ×${quantity}`] : []));
  return [
    ...(classes.length === 0
      ? []
      : [`${listed(classes, 'or')} in the Party: ${healers.length === 0 ? 'none.' : `${listed(healers)}, who ${healers.length === 1 ? 'eases' : 'ease'} the hurt of the others.`}`]),
    `Heal Items carried: ${heals.length === 0 ? 'none.' : `${listed(heals)}, spent at an Injury taken on the Quest.`}`,
  ];
}
