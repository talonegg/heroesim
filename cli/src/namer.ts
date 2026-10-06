// The CLI's Namer (v1.1.6-S12, DL-186 item 1): how the CLI fills the name slots of the narration's
// sentences (`narrate` in `@heroesim/words`), one short line each (M2-S11, DL-33). A Hero by label
// and id, `Brenna Ashcombe (hero-000003)`, and an Item, a Transfer Offer, a Quest or a Party by the id
// a command takes, since the player types them; anyone else by label alone. Where an event carries
// no label, the id stands in its place.

import type { ContentSet, TurnEvent } from '@heroesim/engine';
import { listed, narrate, sentenceText, type CommandSlot, type Namer } from '@heroesim/words';

/** What a stop points the player to, in the commands the CLI takes (v1.1.7-S3, DL-209); the page has a button. */
const commands: Readonly<Record<CommandSlot['command'], string>> = {
  'show-board': ' (show board)',
  'show-pool': ' (show pool)',
  'answer-offer': ' Answer with accept --offer <id> or decline --offer <id> (show offers).',
};

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
    case 'parties':
      // A stop's Parties (v1.1.7-S3, DL-209): the words, then the ids a command takes after what they did.
      if (slot.form === 'ids') return slot.ids.length === 0 ? '' : `: ${listed(slot.ids)}`;
      return slot.ids.length === 1 ? 'Party' : 'Parties';
    case 'command':
      return commands[slot.command];
  }
};

/** One line for `event`, in the CLI's words. */
export function narrateLine(event: TurnEvent, content: ContentSet): string {
  return sentenceText(narrate(event, content), cliNamer);
}
