// The CLI's Namer (v1.1.6-S12, DL-186 item 1): how the CLI fills the name slots of the narration's
// sentences (`narrate` in `@heroesim/words`), one short line each (M2-S11, DL-33). A Hero by label
// and id, `Brenna Ashcombe (hero-000003)`, and an Item, a Transfer Offer, a Quest or a Party by the id
// a command takes, since the player types them; anyone else by label alone. Where an event carries
// no label, the id stands in its place. A refusal (`refusalSentence`, DL-240) is filled the same way,
// with the command or the flag it points to, and a date with its Turn beside it.

import type { ContentSet, TurnEvent } from '@heroesim/engine';
import {
  listed,
  narrate,
  refusalSentence,
  sentenceText,
  type Calendar,
  type CommandSlot,
  type EntrySlot,
  type Namer,
  type Refusal,
  type RefusalSetting,
} from '@heroesim/words';

/**
 * What a stop or a refusal points the player to, in the commands and the flags the CLI takes (DL-209,
 * DL-240); the page has a button or a form.
 */
const commands: Readonly<Record<CommandSlot['command'], string>> = {
  'show-board': ' (show board)',
  'show-pool': ' (show pool)',
  'answer-offer': ' Answer with accept --offer <id> or decline --offer <id> (show offers).',
  'show-roster': ' (show roster)',
  'show-rosters': ' (show roster <guildId>)',
  'show-market': ' (show market)',
  'show-offers': ' (show offers)',
  'roster-holds': ': show roster lists what it holds',
  'market-holds': ' (show market lists what it holds)',
  'pool-holds': '; show pool lists who is',
  'name-guild': ': --guild <name>',
  'name-guildmaster': ': --master <name>',
  'portrait-sex': ': choose a Portrait of that Sex, or leave out --sex',
};

/** The flag that sets each entry of `new` a refusal quotes. */
const flags: Readonly<Record<EntrySlot['field'], string>> = { sex: '--sex', age: '--age', stats: '--stats' };

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
    case 'date':
      return `${slot.date} (Turn ${slot.turn})`;
    case 'entry':
      return `${flags[slot.field]} ${slot.key === undefined ? slot.value : `${slot.key}=${slot.value}`}`;
  }
};

/** One line for `event`, in the CLI's words, its dates by the game's `calendar` (DL-210). */
export function narrateLine(event: TurnEvent, content: ContentSet, calendar: Calendar): string {
  return sentenceText(narrate(event, content, calendar), cliNamer);
}

/** `refusal` in the CLI's words, one line, naming what `setting.world` holds (DL-240). */
export function refusalLine(refusal: Refusal, setting: RefusalSetting): string {
  return sentenceText(refusalSentence(refusal, setting), cliNamer);
}
