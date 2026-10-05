// The CLI's Namer (v1.1.6-S12, DL-186 item 1): how the CLI fills the name slots of the narration's
// sentences (`narrate` in `@heroesim/words`), one short line each (M2-S11, DL-33). A Hero by label
// and id, `Brenna Ashcombe (hero-000003)`, and an Item, a Transfer Offer, a Quest or a Party by the id
// a command takes, since the player types them; anyone else by label alone. Where an event carries
// no label, the id stands in its place.

import type { ContentSet, TurnEvent } from '@heroesim/engine';
import { narrate, sentenceText, type Namer } from '@heroesim/words';

/** The CLI's name for what `slot` holds. */
export const cliNamer: Namer<string> = (slot) => {
  switch (slot.kind) {
    case 'hero':
      return slot.label === undefined ? slot.id : `${slot.label} (${slot.id})`;
    case 'name':
      return slot.label ?? slot.id;
    case 'quest':
      return slot.template === undefined ? slot.id : `${slot.template} (${slot.id})`;
    case 'party':
    case 'offer':
      return slot.id;
    case 'ids':
      return slot.ids.length === 0 ? '' : ` (${slot.ids.join(', ')})`;
  }
};

/** One line for `event`, in the CLI's words. */
export function narrateLine(event: TurnEvent, content: ContentSet): string {
  return sentenceText(narrate(event, content), cliNamer);
}
