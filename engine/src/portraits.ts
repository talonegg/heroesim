// Portraits (v1.1.2-S3; DL-125 items 2 to 4): the pictures content lists by role and sex, and the
// player's Guildmaster's, chosen at setup or drawn. A Portrait is a key, never a file: the page finds
// the picture by it in `media/portraits/<role>s/<sex>/` and shows the Silhouette of the sex where it
// finds none or the key is `null`. No rule reads a Portrait.

import type { ContentSet, PortraitKey, PortraitRole } from './content-types.js';
import { pickOrNone, sexes, type Stream } from './generators/draw.js';
import type { Sex } from './document.js';

/** The pictures of `role` and `sex` content lists, in its order; none where it lists none. */
export function portraitsOf(content: Pick<ContentSet, 'portraits'>, role: PortraitRole, sex: Sex): readonly PortraitKey[] {
  return content.portraits[role][sex];
}

/** The sex of the picture of `role` keyed `key`; `null` when content lists no such picture of that role. */
export function portraitSexOf(content: Pick<ContentSet, 'portraits'>, role: PortraitRole, key: PortraitKey): Sex | null {
  return sexes.find((sex) => portraitsOf(content, role, sex).includes(key)) ?? null;
}

/**
 * The player's Guildmaster's Portrait (DL-125 item 3): the one `chosen`, else one drawn from the
 * Guildmaster pictures of `sex`, each equally likely, `null` when there are none. One draw from
 * `state` (the `gm-portraits` stream) either way, so a choice, or how many pictures there are, moves no
 * later draw (M9-S2's rule for the setup, DL-102). `chosen` has been checked by `setupRefusal`.
 */
export function guildmasterPortrait(
  state: Stream,
  content: Pick<ContentSet, 'portraits'>,
  sex: Sex,
  chosen: PortraitKey | undefined,
): PortraitKey | null {
  const drawn = pickOrNone(state, portraitsOf(content, 'guildmaster', sex));
  return chosen ?? drawn;
}
