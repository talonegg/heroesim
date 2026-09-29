// The open view, remembered per browser (M9-S3, DL-103; the review's E5): a convenience of this
// browser's, never game state, kept in `localStorage`. The browser may refuse it (a private window,
// site data blocked, a sandboxed frame), so every read and write is in try/catch, and the page
// opens on the home view when nothing is remembered or nothing can be.
//
// The order of the Guilds' table and of the Unattached pool are kept the same way (M9-S6, DL-106):
// display only, and for this browser, whatever game is in hand.

import { viewIds, type ViewId } from './section';

/** The key the open view is kept under. */
export const viewKey = 'heroesim.view';

/** The view this browser last had open, or the home view. */
export function rememberedView(): ViewId {
  return rememberedChoice(viewKey, viewIds, 'guild');
}

/** Remembers `view` as the one open, where the browser lets it. */
export function rememberView(view: ViewId): void {
  rememberChoice(viewKey, view);
}

/** What this browser keeps under `key`, if it is one of `choices`; `fallback` when not, or when nothing can be read. */
export function rememberedChoice<Choice extends string>(key: string, choices: readonly Choice[], fallback: Choice): Choice {
  try {
    const kept = globalThis.localStorage?.getItem(key);
    return choices.find((choice) => choice === kept) ?? fallback;
  } catch {
    return fallback;
  }
}

/** Keeps `choice` under `key`, where the browser lets it. */
export function rememberChoice(key: string, choice: string): void {
  try {
    globalThis.localStorage?.setItem(key, choice);
  } catch {
    // Nothing kept: the default next time.
  }
}
