// The open view, remembered per browser (M9-S3, DL-103; the review's E5): a convenience of this
// browser's, never game state, kept in `localStorage`. The browser may refuse it (a private window,
// site data blocked, a sandboxed frame), so every read and write is in try/catch, and the page
// opens on the home view when nothing is remembered or nothing can be.

import { viewIds, type ViewId } from './section';

/** The key the open view is kept under. */
export const viewKey = 'heroesim.view';

/** The view this browser last had open, or the home view. */
export function rememberedView(): ViewId {
  try {
    const kept = globalThis.localStorage?.getItem(viewKey);
    return viewIds.find((view) => view === kept) ?? 'guild';
  } catch {
    return 'guild';
  }
}

/** Remembers `view` as the one open, where the browser lets it. */
export function rememberView(view: ViewId): void {
  try {
    globalThis.localStorage?.setItem(viewKey, view);
  } catch {
    // Nothing kept: the page opens on the home view next time.
  }
}
