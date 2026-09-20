/**
 * The terminal itself: how wide it is, whether it can colour, whether it can show
 * anything but ASCII, and how a finished line gets out (E7-S5).
 *
 * **This is the only module under `cli/src` that reads `process.env` or touches
 * `process.stdout` or `process.stdin`** (E7 §4), which `cli/tests/screen.test.ts` asserts
 * by scanning the source. Everything else in the front end is a pure function from a
 * Career and a width to an array of plain strings, and colour is put on at this boundary
 * on the way out — so a view can never make a presentation decision, and a snapshot of a
 * view is the text a player reads.
 */

import { groupDigits as groupNarrated } from '@heroesim/narrate';
import { createInterface } from 'node:readline/promises';

/** The width every layout assumes when the terminal will not say. */
export const DEFAULT_WIDTH = 80;

/** At or above this, a layout may use columns and tables. Below it, everything stacks. */
export const WIDE = 80;

/** At or below this, headings shorten to one word and key hints go one per line. */
export const FLOOR = 40;

/** Narrower than this nothing can be laid out at all, so it is where the width stops. */
export const MINIMUM = 20;

/** What the terminal can do. Read once, at the start, and then passed about as data. */
export interface Screen {
  /** Columns available. Never below `MINIMUM`. */
  width: number;
  /** Whether ANSI dressing may be applied on the way out. */
  colour: boolean;
  /** Whether the output must be pure ASCII. */
  ascii: boolean;
}

/** What `detectScreen` reads, so a test can hand it a terminal that does not exist. */
export interface Terminal {
  /** `process.stdout.columns`, or undefined when the output is not a terminal. */
  columns?: number | undefined;
  /** Whether stdout is a terminal. */
  isTty: boolean;
  /** The environment. */
  env: Record<string, string | undefined>;
}

/** The real terminal, read in the one place this front end is allowed to read it. */
export function thisTerminal(): Terminal {
  return {
    columns: process.stdout.columns,
    isTty: process.stdout.isTTY === true,
    env: process.env,
  };
}

/**
 * What the terminal can do.
 *
 * Width comes from `process.stdout.columns`, then from `COLUMNS` for a session driven
 * through a pipe, and defaults to 80 when neither says (E7-S5). Colour is off unless
 * stdout is a terminal, and off outright under `NO_COLOR` or `TERM=dumb`. ASCII is forced
 * by `TERM=dumb` and by a locale that names an encoding which is not UTF-8; a locale that
 * says nothing at all is taken at its word rather than guessed at, and `--ascii` is there
 * for a terminal that cannot show a dash.
 *
 * @param terminal what the world says
 * @param overrides what the command line says, which wins
 */
export function detectScreen(terminal: Terminal, overrides: Partial<Screen> = {}): Screen {
  const fromEnv = Number(terminal.env['COLUMNS']);
  const columns =
    terminal.columns !== undefined && terminal.columns > 0
      ? terminal.columns
      : Number.isFinite(fromEnv) && fromEnv > 0
        ? fromEnv
        : DEFAULT_WIDTH;
  const dumb = terminal.env['TERM'] === 'dumb';
  const forbidden = terminal.env['NO_COLOR'] !== undefined || dumb;
  const locale = terminal.env['LC_ALL'] ?? terminal.env['LC_CTYPE'] ?? terminal.env['LANG'];
  return {
    width: Math.max(MINIMUM, Math.floor(overrides.width ?? columns)),
    // `NO_COLOR` and `TERM=dumb` beat the command line: the environment is the player
    // saying their terminal cannot show it, and `--colour` cannot argue with that (E7-S5).
    colour: forbidden ? false : (overrides.colour ?? terminal.isTty),
    ascii: dumb || (overrides.ascii ?? (locale !== undefined && !/utf-?8/i.test(locale))),
  };
}

// ── Text ────────────────────────────────────────────────────────────────────

/**
 * Break prose into lines no wider than `width`, keeping the author's own line breaks.
 * A word longer than the width is broken rather than allowed to run over. Nothing is
 * ever cut short: this is the only way text is made to fit in the terminal (E7-S5).
 */
export function wrap(text: string, width: number): string[] {
  const room = Math.max(1, width);
  const lines: string[] = [];
  for (const block of text.split('\n')) {
    const words = block.split(/\s+/).filter((word) => word.length > 0);
    if (words.length === 0) {
      lines.push('');
      continue;
    }
    let line = '';
    for (const word of words) {
      line = line.length === 0 ? word : `${line} ${word}`;
      while (line.length > room) {
        const head = line.slice(0, room);
        const lastSpace = head.lastIndexOf(' ');
        if (lastSpace > 0) {
          lines.push(head.slice(0, lastSpace));
          line = line.slice(lastSpace + 1);
        } else {
          lines.push(head);
          line = line.slice(room);
        }
      }
    }
    if (line.length > 0) lines.push(line);
  }
  return lines;
}

/** Wrap prose and put every line of it under the same indent. */
export function wrapAt(text: string, width: number, indent = 0): string[] {
  const pad = ' '.repeat(indent);
  return wrap(text, width - indent).map((line) => (line === '' ? '' : `${pad}${line}`));
}

/**
 * A numbered or lettered entry: the marker, and the text wrapped under a hanging indent
 * so that the second line of a long title sits clear of the number rather than under it.
 * The marker's own spacing survives, which a plain wrap would collapse.
 */
export function hanging(prefix: string, text: string, width: number, indent = 2): string[] {
  const head = `${' '.repeat(indent)}${prefix}`;
  const body = wrap(text, Math.max(1, width - head.length));
  return body.map((line, at) => (at === 0 ? `${head}${line}` : `${' '.repeat(head.length)}${line}`));
}

/**
 * One label and its value, on one line where the width allows and stacked where it does
 * not. A table's row becomes several of these below 80 columns; nothing is ever cut to
 * make a column fit (E7-S5).
 */
export function labelled(label: string, value: string, width: number, indent = 0): string[] {
  const pad = ' '.repeat(indent);
  const oneLine = `${pad}${label}  ${value}`;
  if (oneLine.length <= width) return [oneLine];
  return [`${pad}${label}`, ...wrapAt(value, width, indent + 2)];
}

/**
 * Pad a string out to a width so that columns line up. **Never cuts**: a value wider than
 * its column comes back whole and the caller must have checked that it fits, or must be
 * stacking instead.
 */
export function pad(text: string, width: number): string {
  return text.length >= width ? text : text.padEnd(width);
}

/** Pad on the left, for a number in a column. Never cuts, for the same reason. */
export function padLeft(text: string, width: number): string {
  return text.length >= width ? text : text.padStart(width);
}

/**
 * 1140 → "1,140", and "1,140 coin". Grouped so a four-figure sum is read at a glance,
 * never abbreviated.
 *
 * **`narrate`'s, re-exported and not copied** (DL-27 §1): this module wrote its own until
 * the E8-S6 build found three conventions on one screen — the grouped header here, the
 * ungrouped sentences `narrate` wrote and the browser's ungrouped label — and a number a
 * sentence prints is shared prose, so the one definition lives where shared prose lives.
 */
export { coin, groupDigits } from '@heroesim/narrate';

/** "1 Day" / "4 Days". */
export function days(amount: number): string {
  return `${groupNarrated(amount)} ${amount === 1 ? 'Day' : 'Days'}`;
}

/** A Regard value with its sign always shown, so a fall is legible at a glance. */
export function signedRegard(value: number): string {
  return value > 0 ? `+${String(value)}` : String(value);
}

/**
 * A block heading. Headings are capitals so that the eye finds them without colour, and
 * at or below 40 columns they shorten to the single word the caller names (E7-S5).
 */
export function heading(full: string, short: string, width: number): string {
  return (width <= FLOOR ? short : full).toUpperCase();
}

/** A horizontal rule, in ASCII, because there is no box-drawing anywhere (E7 §3). */
export function rule(width: number): string {
  return '-'.repeat(Math.max(1, width));
}

/**
 * The key hints, packed onto as few lines as the width allows and put one per line at or
 * below 40 columns (E7-S5). Each item is already written as `[k] what it does`.
 */
export function keyHints(items: readonly string[], width: number): string[] {
  if (width <= FLOOR) return [...items];
  const lines: string[] = [];
  let line = '';
  for (const item of items) {
    const candidate = line.length === 0 ? item : `${line}  ${item}`;
    if (candidate.length > width) {
      if (line.length > 0) lines.push(line);
      line = item;
    } else {
      line = candidate;
    }
  }
  if (line.length > 0) lines.push(line);
  return lines;
}

// ── Paging ──────────────────────────────────────────────────────────────────

/** How many rows of a view are shown at once before it says there is more. */
export const PAGE_ROWS = 20;

/** One page of a view, and whether there is another. */
export interface Page {
  lines: string[];
  /** Counting from 1. */
  page: number;
  pages: number;
}

/**
 * Cut a view into pages of at most `rows` lines, repeating its heading on each (E7-S3).
 * A page break is taken at a blank line where there is one in range, so an entry is not
 * split down the middle; where there is not, it is taken at the row limit. Nothing is
 * ever truncated — a page that does not fit becomes another page.
 *
 * @param lines the whole view, heading first
 * @param page which page to show, counting from 1 and clamped to what exists
 * @param rows how many lines a page holds
 */
export function paginate(lines: readonly string[], page = 1, rows = PAGE_ROWS): Page {
  const head = lines[0] ?? '';
  const body = lines.slice(1);
  const room = Math.max(1, rows - 2);
  if (body.length <= room) return { lines: [...lines], page: 1, pages: 1 };

  // Break at the last blank line inside the room available, so a Hero's block of lines
  // is not split; fall back to the limit itself when there is no blank to break at.
  const breaks: number[] = [];
  let at = 0;
  while (at < body.length) {
    const limit = Math.min(body.length, at + room);
    if (limit === body.length) {
      breaks.push(body.length);
      break;
    }
    let cut = limit;
    for (let back = limit; back > at + 1; back -= 1) {
      if (body[back - 1] === '') {
        cut = back;
        break;
      }
    }
    breaks.push(cut);
    at = cut;
  }
  const pages = breaks.length;
  const wanted = Math.min(Math.max(1, Math.floor(page)), pages);
  const from = wanted === 1 ? 0 : (breaks[wanted - 2] ?? 0);
  const to = breaks[wanted - 1] ?? body.length;
  const shown = body.slice(from, to);
  while (shown.length > 0 && shown[shown.length - 1] === '') shown.pop();
  // Short enough to fit the narrowest terminal there is; the key that turns the page is
  // in the hints under it, as every other key is.
  return { lines: [head, ...shown, `-- page ${wanted} of ${pages} --`], page: wanted, pages };
}

// ── Getting a line out ──────────────────────────────────────────────────────

const ESC = String.fromCharCode(27);

/** What a character becomes where the terminal can only show ASCII (E7-S5). */
const ASCII: ReadonlyMap<string, string> = new Map([
  ['—', '-'], // em dash
  ['–', '-'], // en dash
  ['‒', '-'],
  ['−', '-'], // minus sign
  ['·', '-'], // middle dot
  ['•', '-'], // bullet
  [' ', ' '], // non-breaking space
  ['‘', "'"],
  ['’', "'"],
  ['“', '"'],
  ['”', '"'],
  ['…', '...'],
  ['§', 'S'],
]);

/**
 * The same line with nothing in it a 7-bit terminal cannot show. Applied to everything
 * the program prints, narration included — which is shared with the browser and must not
 * be rewritten for a terminal's sake, so the fallback is a transform here at the output
 * boundary rather than a change to `narrate` (E7-S5, DL-25 §8).
 *
 * Every mapping but the ellipsis is one character for one, so a line that fitted before
 * the transform still fits after it; anything unmapped becomes a question mark rather
 * than a byte the terminal will draw as a box.
 */
export function toAscii(text: string): string {
  let out = '';
  for (const character of text) {
    if (character.charCodeAt(0) < 128) {
      out += character;
      continue;
    }
    out += ASCII.get(character) ?? '?';
  }
  return out;
}

/** A run of capitals at the head of a line is a block heading. Three or more, so that a
 * name at the start of a sentence is never mistaken for one. */
const HEADING_RUN = /^(\s*)([A-Z][A-Z0-9]{2,}(?: [A-Z0-9]+)*)(?=$|[^A-Za-z0-9])/;

/**
 * Put the dressing on a finished line. **Exactly two things are dressed**: a block
 * heading, and a line of key hints. Nothing else, ever — so colour is emphasis and never
 * the only carrier of meaning, and a terminal with none reads exactly the same words
 * (E7-S5).
 */
export function dress(line: string, screen: Screen): string {
  if (!screen.colour || line.length === 0) return line;
  if (/^\s*\[/.test(line)) return `${ESC}[2m${line}${ESC}[0m`;
  const found = HEADING_RUN.exec(line);
  if (found === null) return line;
  const [, space = '', words = ''] = found;
  return `${space}${ESC}[1m${words}${ESC}[0m${line.slice(space.length + words.length)}`;
}

/** Every line, dressed and made safe for the terminal, as one piece of text. */
export function render(lines: readonly string[], screen: Screen): string {
  if (lines.length === 0) return '';
  const out = lines.map((line) => dress(screen.ascii ? toAscii(line) : line, screen));
  return `${out.join('\n')}\n`;
}

/** Where the program's own output goes. The one writer, in the one module allowed one. */
export function writer(): (text: string) => void {
  return (text: string): void => {
    process.stdout.write(text);
  };
}

/** How the loop asks for the next line. A script and a terminal both satisfy it. */
export interface Prompter {
  /** The next line, or undefined when there is no more input. */
  ask(prompt: string): Promise<string | undefined>;
  close(): void;
}

/** A prompter reading the real terminal. */
export function terminalPrompter(): Prompter {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return {
    ask: async (prompt) => {
      try {
        return await rl.question(prompt);
      } catch {
        return undefined;
      }
    },
    close: () => rl.close(),
  };
}
