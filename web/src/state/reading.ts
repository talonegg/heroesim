// The player's reading on the page (DL-241): what the player sees of a document, derived once for
// it, which the selectors and the readings of `@heroesim/words` take. It is the words' player's
// reading (`playerReading`): the deps the game plays under, its calendar, the player's Guild and
// Guildmaster, the hint bands that Guildmaster's Judgement reads and one Best Party module over the
// world; and beside it the narration, the page's names for a sentence. The player sees what their
// Guildmaster sees and pays (R8): the hints through those bands, the fees at their Negotiation.
//
// One a document, kept by the document itself, which no play changes: each play makes a new one
// (`reducer.ts`), and `rebase` a new one of the same world under other rules, which so reads its own
// Best Party. It is kept only while the document holds the world and the rules it was read from, so
// a document given another of either, as a test may give one, is read afresh. Never stored in the
// document (DL-232 item 3).

import type { ContentSet, GameConfig, World, WorldDocument } from '@heroesim/engine';
import { playerReading, type PlayerReading } from '@heroesim/words';
import { content as bundled } from '../content';
import { questNamer, type Narration } from './namer';
import { playDeps } from './reducer';

export interface PageReading extends PlayerReading {
  /** The narration's content, Quest names and calendar, for a sentence of the History. */
  readonly narration: Narration;
}

/** What a test may give a reading in place of the page's own: its content, or its config. */
export interface ReadingGiven {
  content?: ContentSet;
  config?: GameConfig;
}

/** Each document's own reading, with the world and the rules it was read from. */
const readings = new WeakMap<WorldDocument, { reading: PageReading; world: World; rules: WorldDocument['meta']['config'] }>();

/**
 * The player's reading of `document`: the page's own, made once and then the same, under the rules
 * the document plays under and the bundled content; or, made afresh and kept by no one, under the
 * content or the config `given`.
 */
export function readingOf(document: WorldDocument, given: ReadingGiven = {}): PageReading {
  const own = given.content === undefined && given.config === undefined;
  if (own) {
    // Kept while the document holds the world and the rules it was read from.
    const known = readings.get(document);
    if (known !== undefined && known.world === document.world && known.rules === document.meta.config) return known.reading;
  }
  const played = playDeps(document);
  const deps = own ? played : { config: given.config ?? played.config, content: given.content ?? bundled };
  const reading: PageReading = {
    ...playerReading(document, deps),
    narration: { content: deps.content, questName: questNamer(document, deps.content), calendar: deps.config },
  };
  if (own) readings.set(document, { reading, world: document.world, rules: document.meta.config });
  return reading;
}
