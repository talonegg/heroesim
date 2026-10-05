// The game as a file, and the notice of new rules (M7-S3 part 2, DL-73).
//
// The CLI's `save --as <file>` writes the save as canonical JSON, and `load <file>` makes a file the
// save. In the browser the file is one the player downloads or picks: `saveText` is the engine's
// `serialise`, the bytes the CLI writes, so either front end loads the other's file; a file picked
// goes to the reducer's `load` play as text, where the engine's `deserialise` reads it (DL-20, DL-65).
// Keeping saves in the browser, in IndexedDB, is M7-S4's.
//
// `rulesNotice` is the engine's `newRules`, the game's `meta.configVersion` against this release's
// (DL-193): while a game's rules are behind, the page offers `rebase` (pre-M0 review D1).

import { dayOf, newRules, serialise, type WorldDocument } from '@heroesim/engine';

/** The game as the CLI writes a save: canonical JSON, byte for byte. */
export function saveText(document: WorldDocument): string {
  return serialise(document);
}

/** `heroesim-amber-fox-4821-day-12.json`: the seed and the Day, in characters any file system takes. */
export function saveFileName(document: WorldDocument): string {
  const seed = document.meta.seed.replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'game';
  return `heroesim-${seed}-day-${dayOf(document.world.turn)}.json`;
}

/** The game's rules and this release's, while the game's are behind; `null` when they are not. */
export function rulesNotice(document: WorldDocument): { from: number; to: number } | null {
  return newRules(document.meta);
}
