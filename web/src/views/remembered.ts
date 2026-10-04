// The open view, remembered per browser (M9-S3, DL-103; the review's E5): a convenience of this
// browser's, never game state, kept in `localStorage`. The browser may refuse it (a private window,
// site data blocked, a sandboxed frame), so every read and write is in try/catch, and the page
// opens on the home view when nothing is remembered or nothing can be.
//
// The order of the Guilds' table and of the Unattached pool are kept the same way (M9-S6, DL-106),
// and the Board's (DL-109 item 2, Q11): display only, and for this browser, whatever game is in hand.
// So are the Roster's view, columns, phone's tab and sort (v1.1.5-S12, DL-169 item 11), its hidden
// columns a list.
//
// The Guild's part open is kept too (M9-F2, DL-112 item 5). The Hall was a view until M9-F2: a
// browser that kept "hall" as its view opens the Guild at its Hall part.

import { guildParts, viewIds, type GuildPartId, type ViewId } from './section';

/** The key the open view is kept under. */
export const viewKey = 'heroesim.view';

/** The key the Guild's open part is kept under (M9-F2). */
export const guildPartKey = 'heroesim.guildPart';

/** The view kept before M9-F2 that is now a part of the Guild. */
const hallView = 'hall';

/** The view this browser last had open, or the home view; the Guild for the Hall view kept before M9-F2. */
export function rememberedView(): ViewId {
  return rememberedChoice(viewKey, viewIds, 'guild');
}

/** Remembers `view` as the one open, where the browser lets it. */
export function rememberView(view: ViewId): void {
  rememberChoice(viewKey, view);
}

/** The Guild's part this browser last had open, or Home; its Hall when the view kept is the Hall view of before M9-F2. */
export function rememberedGuildPart(): GuildPartId {
  if (rememberedChoice(viewKey, [hallView], null) === hallView) return 'hall';
  return rememberedChoice(guildPartKey, guildParts, 'home');
}

/** Remembers `part` as the Guild's part open, where the browser lets it. */
export function rememberGuildPart(part: GuildPartId): void {
  rememberChoice(guildPartKey, part);
}

/** What this browser keeps under `key`, if it is one of `choices`; `fallback` when not, or when nothing can be read. */
export function rememberedChoice<Choice extends string, Fallback extends Choice | null>(
  key: string,
  choices: readonly Choice[],
  fallback: Fallback,
): Choice | Fallback {
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

/**
 * The list this browser keeps under `key`, in the order of `choices`, leaving out what is not one of
 * them; `null` when nothing is kept, or nothing can be read (v1.1.5-S12).
 */
export function rememberedList<Choice extends string>(key: string, choices: readonly Choice[]): Choice[] | null {
  try {
    const kept = globalThis.localStorage?.getItem(key);
    if (kept === null || kept === undefined) return null;
    const listed = kept.split(',');
    return choices.filter((choice) => listed.includes(choice));
  } catch {
    return null;
  }
}

/** Keeps `list` under `key`, where the browser lets it. */
export function rememberList(key: string, list: readonly string[]): void {
  rememberChoice(key, list.join(','));
}
