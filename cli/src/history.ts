/**
 * The last five decisions and what came of them (E7-S2), **as the terminal renders them**.
 *
 * The pure half — which moments are worth remembering, what an entry says, the Day stamp
 * and the five-deep window — moved to `@heroesim/narrate` when the browser needed the same
 * five entries and neither front end should own them (DL-27 §6). It is re-exported below,
 * so every caller and every test here still reads one name from one place.
 *
 * What stays is arrangement, and it is the terminal's alone: an entry is trimmed to two
 * lines at the width in hand, never ending mid-clause (DL-26 §4). The browser wraps and
 * trims nothing.
 */

import { splitStamp } from '@heroesim/narrate';
import { wrap, WIDE } from './screen.js';

export { entriesFrom, remember, splitStamp, HISTORY_KEPT, STAMP, WORTH_REMEMBERING } from '@heroesim/narrate';

/** How many lines one entry may take at 80 columns. The one cut E7 sanctions (E7-S2). */
export const ENTRY_LINES = 2;

/** Where a sentence ends: a stop, with whatever closing punctuation follows it. */
const SENTENCE_END = /[.!?]["'’”)\]]*(?=\s|$)/;

/** Where a clause ends. The author's own mark, kept as they wrote it. */
const CLAUSE_END = /[,;:—–](?=\s)/;

/**
 * Words nothing may end on. A line that stops on one of these has stopped **before** the
 * thing it was about to say, which is what "Elswith Greyeye set out on The tithe barge
 * down to" did at 40 columns (DL-26 §4).
 */
const POINTS_FORWARD = new Set([
  'a', 'an', 'the', 'of', 'for', 'to', 'at', 'in', 'on', 'by', 'with', 'from', 'and', 'or',
  'but', 'as', 'into', 'onto', 'over', 'under', 'up', 'down', 'off', 'out', 'about', 'than',
  'that', 'their', 'his', 'her', 'its', 'your', 'our', 'this', 'these', 'those', 'is', 'was',
]);

/** The last index in `text` at which `pattern` matches, or -1. */
function lastMatch(text: string, pattern: RegExp): number {
  const all = new RegExp(pattern.source, 'g');
  let at = -1;
  for (const found of text.matchAll(all)) at = found.index + found[0].length - 1;
  return at;
}

/** The first whole sentence of a paragraph, or the whole of it where there is no stop. */
export function firstSentence(text: string): string {
  const found = SENTENCE_END.exec(text);
  return found === null ? text : text.slice(0, found.index + found[0].length);
}

/**
 * One entry, trimmed to two lines, **never ending mid-clause** (DL-26 §4, superseding
 * DL-25 §14). It cuts at a **sentence** boundary where there is one in range and at a
 * **clause** boundary — the author's own comma, semicolon, colon or dash — where there is
 * not; never with an ellipsis, and never merely at a word.
 *
 * Punctuation is kept exactly as `narrate` wrote it: a clause cut ends on the author's own
 * comma rather than on a full stop this module invented, because E7-S2 forbids the CLI to
 * re-word an entry and inventing a sentence end is re-wording it.
 *
 * Where two lines hold no boundary at all — which the authored content never does — the
 * entry keeps its two lines and gives back the words that merely point at the next one, so
 * that it still ends on something that carries meaning.
 */
export function trimToTwoLines(text: string, width: number): string[] {
  const lines = wrap(text, width);
  if (lines.length <= ENTRY_LINES) return lines;
  const joined = lines.slice(0, ENTRY_LINES).join(' ');

  // A whole sentence, where keeping one says more than the two full lines would.
  const stop = lastMatch(joined, SENTENCE_END);
  if (stop > Math.floor(joined.length / 2)) {
    return wrap(joined.slice(0, stop + 1), width).slice(0, ENTRY_LINES);
  }
  // Otherwise the last clause that leaves the entry worth reading.
  const clause = lastMatch(joined, CLAUSE_END);
  if (clause > Math.floor(joined.length / 3)) {
    return wrap(joined.slice(0, clause + 1), width).slice(0, ENTRY_LINES);
  }
  // The last resort, and it still does not end on a word that points forward.
  const words = joined.split(' ');
  while (words.length > 1 && POINTS_FORWARD.has(words[words.length - 1]?.toLowerCase() ?? '')) {
    words.pop();
  }
  return wrap(words.join(' '), width).slice(0, ENTRY_LINES);
}

/**
 * One entry below 80 columns, where the layout is stacked and the terminal scrolls anyway
 * (E7-S5): the Day stamp takes a line of its own and the paragraph is given the lines its
 * **first sentence** needs. A sixteen-column stamp leaves about sixty characters of two
 * 40-column lines, and sixty characters is not a sentence (DL-26 §4).
 */
export function stackedEntry(entry: string, width: number, indent: number): string[] {
  const pad = ' '.repeat(indent);
  const under = ' '.repeat(indent + 2);
  const { stamp, text } = splitStamp(entry);
  const body = wrap(firstSentence(text), width - indent - 2).map((line) => `${under}${line}`);
  return stamp === undefined ? body : [`${pad}${stamp}`, ...body];
}

/**
 * The block as the player reads it, newest last. A Career with fewer than five decisions
 * renders without padding or placeholder rows, and one with none renders nothing at all.
 *
 * @param history the window, oldest first, at full length — the trim is here, at render
 * time, so the width a Career was saved at never reaches the slot file
 * @param width the columns available
 * @param indent how far each entry is indented under the heading
 */
export function historyLines(
  history: readonly string[],
  width: number,
  indent = 2,
): string[] {
  const pad = ' '.repeat(indent);
  const out: string[] = [];
  for (const entry of history) {
    if (width < WIDE) {
      out.push(...stackedEntry(entry, width, indent));
      continue;
    }
    for (const line of trimToTwoLines(entry, width - indent)) out.push(`${pad}${line}`);
  }
  return out;
}
