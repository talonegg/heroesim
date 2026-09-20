/**
 * The rolling window of what the player did and what came of it — the pure half of it,
 * shared by both front ends (E7-S2, E8-S6; DL-27 §6).
 *
 * The engine has no memory of decisions as decisions, so a front end keeps one. It was
 * the terminal's alone until the browser needed the same five entries; the parts that
 * decide **which moments are worth remembering** and **what an entry says** are the same
 * in both, so they live here, where shared words live, and neither front end re-words an
 * entry. What is *not* here is arrangement: the terminal trims an entry to two lines at
 * the width in hand (`cli/src/history.ts`), and the browser wraps and trims nothing.
 *
 * **Not one word of an entry is written here either.** A step's events are filtered to the
 * moments E7-S2 names and handed to `narrateEvents`, so every entry is `narrate`'s own
 * sentence; this module Day-stamps it and keeps five. A `Paragraph` carries no event type,
 * so the paragraphs of a whole step cannot be told apart after the fact — a Hall purchase
 * arrives as a `coin` paragraph exactly as Upkeep does — which is why the filtering
 * happens before the narration rather than after it (DL-25 §14).
 */

import type { Career, Content, GameEvent, GameEventType } from '@heroesim/engine';
import { formatDay } from './lines.js';
import { narrateEvents } from './index.js';

/** How many decisions a front end remembers. Exactly five, oldest dropped (E7-S2). */
export const HISTORY_KEPT = 5;

/** What separates the Day stamp from the paragraph. Written here and read back here. */
export const STAMP = ' · ';

/**
 * The events an entry is made from: the moments E7-S2 lists, plus the two `narrate` needs
 * in order to tell them. A Transfer and a Poaching are told on the `HeroJoined` that
 * closes them and a joining fee on the `ApplicantAccepted` beside it (E4 §4, DL-21), so
 * those come along; taking somebody on at the door arrives with them and is a decision in
 * its own right, which makes this a superset of E7-S2's list rather than a subset.
 */
export const WORTH_REMEMBERING: ReadonlySet<GameEventType> = new Set<GameEventType>([
  'PartyCommitted',
  'PartyReturned',
  'PartyAnswered',
  'PartyTurnedBack',
  'InsistenceApplied',
  'HeroDeparted',
  'HeroInjured',
  'HeroScarred',
  'HeroDied',
  'HallImproved',
  'HeroTransferred',
  'HeroPoached',
  'ApplicantAccepted',
  'HeroJoined',
]);

/**
 * What a step is worth remembering for, in `narrate`'s words and Day-stamped.
 *
 * @param events the step's events, in the order the engine reported them
 * @param career the Career **after** the step, so every name and title resolves
 * @param content the authored content
 * @returns zero or more entries, oldest first. Each is one paragraph, at full length.
 */
export function entriesFrom(
  events: readonly GameEvent[],
  career: Career,
  content: Content,
): string[] {
  const worth = events.filter((event) => WORTH_REMEMBERING.has(event.type));
  if (worth.length === 0) return [];
  // Day-stamped with a separator that survives a wrap, so the stamp stays legible at the
  // head of the entry however narrow the screen is.
  return narrateEvents(worth, career, content).map(
    (entry) => `${formatDay(entry.day, career)}${STAMP}${entry.text}`,
  );
}

/** The window after some more happened: five entries, oldest dropped (E7-S2). */
export function remember(history: readonly string[], entries: readonly string[]): string[] {
  return [...history, ...entries].slice(-HISTORY_KEPT);
}

/**
 * An entry split into its Day stamp and the paragraph under it. The stamp is this
 * module's own doing (`entriesFrom` writes it), so this reads back what it wrote; an entry
 * that carries none — nothing writes one, but a slot file is a file and browser storage is
 * editable — is all paragraph.
 */
export function splitStamp(entry: string): { stamp?: string; text: string } {
  const at = entry.indexOf(STAMP);
  if (at < 0) return { text: entry };
  return { stamp: entry.slice(0, at), text: entry.slice(at + STAMP.length) };
}
