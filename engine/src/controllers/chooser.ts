// What makes a Guild's choices (ADR-0002, DL-30): the one place the engine's rules read where
// a Guild's choices come from, for the Rival controllers' choices (rival.ts) and for the margin a
// Guild's Best Party is chosen at (best-party.ts, DL-175).

import type { ContentSet, Disposition } from '../content-types.js';
import type { Guild } from '../document.js';
import { dispositionOf } from '../selectors.js';

/**
 * What makes `guild`'s choices: its Disposition's row; `'own'` for a Guild with no Disposition,
 * whose controller makes its own choices through the actions (the player's, ADR-0002); or `null` for
 * a Disposition content does not define (data-model rule 5). The one place the Rival controllers
 * read where a Guild's choices come from (`dispositionOf`, ADR-0002's exception 2), for their own choices,
 * for a Guild's answer to a Transfer asked of it (`transferAnswer`), which is a choice too, and for the
 * margin a Guild's Best Party is chosen at (`best-party.ts`, DL-175).
 */
export function chooser(guild: Pick<Guild, 'controller'>, content: Pick<ContentSet, 'dispositions'>): Disposition | 'own' | null {
  const key = dispositionOf(guild);
  if (key === null) return 'own';
  return Object.hasOwn(content.dispositions, key) ? (content.dispositions[key] as Disposition) : null;
}
