/**
 * The terminal boundary (E7-S5): width detection, wrapping that never cuts, paging,
 * grouped coin, the ASCII fallback and the dressing — and the rule that this is the only
 * module in the front end that reads the environment or the terminal at all.
 */

import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  coin,
  days,
  detectScreen,
  dress,
  groupDigits,
  heading,
  keyHints,
  labelled,
  pad,
  padLeft,
  paginate,
  render,
  signedRegard,
  toAscii,
  wrap,
  wrapAt,
  DEFAULT_WIDTH,
  FLOOR,
  MINIMUM,
  PAGE_ROWS,
  type Terminal,
} from '../src/screen.js';
import { longest } from './helpers.js';

const ESC = String.fromCharCode(27);
const PLAIN: Terminal = { columns: undefined, isTty: false, env: {} };

describe('how wide the terminal is', () => {
  it('takes the terminal at its word when it says', () => {
    expect(detectScreen({ ...PLAIN, columns: 132 }).width).toBe(132);
  });

  it('falls back to COLUMNS for a session driven through a pipe', () => {
    expect(detectScreen({ ...PLAIN, env: { COLUMNS: '54' } }).width).toBe(54);
  });

  it('defaults to 80 when nothing says', () => {
    expect(detectScreen(PLAIN).width).toBe(DEFAULT_WIDTH);
  });

  it('never lays out narrower than it can', () => {
    expect(detectScreen({ ...PLAIN, columns: 3 }).width).toBe(MINIMUM);
  });

  it('lets the command line win', () => {
    expect(detectScreen({ ...PLAIN, columns: 132 }, { width: 40 }).width).toBe(40);
  });
});

describe('colour', () => {
  it('is off when stdout is not a terminal', () => {
    expect(detectScreen(PLAIN).colour).toBe(false);
  });

  it('is on for a terminal that says nothing against it', () => {
    expect(detectScreen({ ...PLAIN, isTty: true }).colour).toBe(true);
  });

  it('is off under NO_COLOR, whatever the terminal is', () => {
    expect(detectScreen({ ...PLAIN, isTty: true, env: { NO_COLOR: '1' } }).colour).toBe(false);
  });

  it('is off under TERM=dumb', () => {
    expect(detectScreen({ ...PLAIN, isTty: true, env: { TERM: 'dumb' } }).colour).toBe(false);
  });

  it('puts no escape at all into the output when it is off', () => {
    const screen = detectScreen(PLAIN);
    const text = render(['BOARD  something', '[q] quit', 'ordinary prose'], screen);
    expect(text).not.toContain(ESC);
  });

  it('dresses a block heading and a line of key hints, and nothing else', () => {
    const screen = detectScreen({ ...PLAIN, isTty: true });
    expect(dress('BOARD  Upkeep of 88 coin', screen)).toBe(
      `${ESC}[1mBOARD${ESC}[0m  Upkeep of 88 coin`,
    );
    expect(dress('[q] quit', screen)).toBe(`${ESC}[2m[q] quit${ESC}[0m`);
    expect(dress('Brenna came off worst.', screen)).toBe('Brenna came off worst.');
    expect(dress('  1  The tithe barge down to Lowford', screen)).toBe(
      '  1  The tithe barge down to Lowford',
    );
  });

  it('adds nothing but escapes: the words are identical either way', () => {
    const lines = ['ROSTER  4 of 12 places taken', '  Brenna, 34', '[q] quit'];
    const coloured = render(lines, detectScreen({ ...PLAIN, isTty: true }));
    const escape = new RegExp(`${ESC}\\[\\d+m`, 'g');
    expect(coloured.replaceAll(escape, '')).toBe(render(lines, detectScreen(PLAIN)));
  });
});

describe('the ASCII fallback', () => {
  it('is on under TERM=dumb and under a locale that is not UTF-8', () => {
    expect(detectScreen({ ...PLAIN, env: { TERM: 'dumb' } }).ascii).toBe(true);
    expect(detectScreen({ ...PLAIN, env: { LANG: 'en_GB.ISO-8859-1' } }).ascii).toBe(true);
  });

  it('is off for a UTF-8 locale and for a locale that says nothing', () => {
    expect(detectScreen({ ...PLAIN, env: { LANG: 'en_GB.UTF-8' } }).ascii).toBe(false);
    expect(detectScreen(PLAIN).ascii).toBe(false);
  });

  it('maps every mark the game prints, one character for one', () => {
    const marks = '—–−·‘’“” ';
    const flat = toAscii(marks);
    expect(flat).toBe('----\'\'"" ');
    expect(flat.length).toBe(marks.length);
  });

  it('leaves nothing a 7-bit terminal cannot show', () => {
    const text = toAscii('Brenna — the ferryman’s strongbox · 中');
    expect([...text].every((character) => character.charCodeAt(0) < 128)).toBe(true);
  });

  it('is applied to everything the program prints, narration included', () => {
    const screen = detectScreen({ ...PLAIN, env: { TERM: 'dumb' } });
    const text = render(['Brenna — out at the weir'], screen);
    expect(text).toContain('Brenna - out at the weir');
    expect(text).not.toContain('—');
  });

  it('draws no box: the only rule is an ASCII dash', () => {
    expect(toAscii('─')).toBe('?');
  });
});

describe('wrapping, which never cuts', () => {
  it('never returns a line wider than asked for', () => {
    const text = 'The quick brown fox jumps over the lazy dog, and then does it again. '.repeat(8);
    for (const width of [20, 40, 60, 80, 120]) {
      expect(longest(wrap(text, width))).toBeLessThanOrEqual(width);
    }
  });

  it('breaks a word wider than the line rather than running over', () => {
    const lines = wrap('x'.repeat(200), 40);
    expect(longest(lines)).toBeLessThanOrEqual(40);
    expect(lines.join('')).toBe('x'.repeat(200));
  });

  it("keeps the author's own line breaks", () => {
    expect(wrap('one\ntwo', 78)).toEqual(['one', 'two']);
    expect(wrap('one\n\ntwo', 78)).toEqual(['one', '', 'two']);
  });

  it('loses no words', () => {
    const text = 'a bb ccc dddd eeeee ffffff ggggggg';
    expect(wrap(text, 10).join(' ').split(/\s+/)).toEqual(text.split(' '));
  });

  it('indents every line of a wrapped block, inside the width', () => {
    const lines = wrapAt('one two three four five six seven eight nine ten', 20, 4);
    expect(longest(lines)).toBeLessThanOrEqual(20);
    for (const line of lines) expect(line.startsWith('    ')).toBe(true);
  });
});

describe('a label and its value', () => {
  it('sits on one line where there is room', () => {
    expect(labelled('Age', '34', 40)).toEqual(['Age  34']);
  });

  it('stacks rather than cutting when there is not', () => {
    const lines = labelled('Regard for you', 'a very long reason indeed about Thurrow', 24);
    expect(lines.length).toBeGreaterThan(1);
    expect(longest(lines)).toBeLessThanOrEqual(24);
    expect(lines.join(' ')).toContain('Thurrow');
  });
});

describe('padding a column', () => {
  it('pads out to the width so columns line up', () => {
    expect(pad('ab', 5)).toBe('ab   ');
    expect(padLeft('7', 4)).toBe('   7');
  });

  it('never cuts, which is what replaced the clip-with-an-ellipsis E1 shipped', () => {
    // A value wider than its column comes back whole: the caller must stack instead.
    expect(pad('abcdefgh', 5)).toBe('abcdefgh');
    expect(padLeft('abcdefgh', 5)).toBe('abcdefgh');
  });
});

describe('numbers', () => {
  it('groups a four-figure sum and never abbreviates coin', () => {
    expect(groupDigits(1140)).toBe('1,140');
    expect(groupDigits(999)).toBe('999');
    expect(groupDigits(1_234_567)).toBe('1,234,567');
    expect(groupDigits(-1140)).toBe('-1,140');
    expect(coin(1140)).toBe('1,140 coin');
    expect(coin(1140)).not.toContain('k');
  });

  it('counts Days in British English', () => {
    expect(days(1)).toBe('1 Day');
    expect(days(4)).toBe('4 Days');
  });

  it('always shows the sign on a Regard, so a fall is legible at a glance', () => {
    expect(signedRegard(3)).toBe('+3');
    expect(signedRegard(0)).toBe('0');
    expect(signedRegard(-4)).toBe('-4');
  });
});

describe('headings and hints', () => {
  it('shortens a heading to one word at or below 40 columns', () => {
    expect(heading('Waiting on your word', 'Word', 80)).toBe('WAITING ON YOUR WORD');
    expect(heading('Waiting on your word', 'Word', FLOOR)).toBe('WORD');
  });

  it('packs the key hints to the width, and puts them one per line at the floor', () => {
    const items = ['[r] roster', '[p] patrons', '[g] league', '[i] hall', '[a] applicants'];
    expect(longest(keyHints(items, 80))).toBeLessThanOrEqual(80);
    expect(keyHints(items, FLOOR)).toEqual(items);
    expect(keyHints(items, 20).length).toBe(items.length);
  });
});

describe('paging', () => {
  const view = ['ROSTER', ...Array.from({ length: 60 }, (_, at) => `line ${at}`)];

  it('leaves a short view alone', () => {
    const short = ['ROSTER', 'one', 'two'];
    expect(paginate(short).lines).toEqual(short);
    expect(paginate(short).pages).toBe(1);
  });

  it('repeats the heading and says which page this is', () => {
    const page = paginate(view, 2);
    expect(page.lines[0]).toBe('ROSTER');
    expect(page.lines[page.lines.length - 1]).toContain('page 2 of');
    expect(page.lines[page.lines.length - 1]?.length).toBeLessThanOrEqual(MINIMUM);
    expect(page.pages).toBeGreaterThan(2);
  });

  it('clamps a page that does not exist', () => {
    expect(paginate(view, 99).page).toBe(paginate(view, 99).pages);
    expect(paginate(view, 0).page).toBe(1);
  });

  it('breaks at a blank line so an entry is never split down the middle', () => {
    const blocks = ['ROSTER'];
    for (let at = 0; at < 12; at += 1) blocks.push(`name ${at}`, `detail ${at}`, '');
    const page = paginate(blocks, 1, 10);
    // The last line before the marker is a detail, never a name left without one.
    const body = page.lines.slice(1, -1);
    expect(body[body.length - 1]).toMatch(/^detail /);
  });

  /**
   * The case above passes whether or not the break looks for a blank, because a
   * three-line block and a room of eight happen to end on a detail either way — a
   * mutation that disabled the blank-line search survived it. This one cannot: the blocks
   * are ragged, so only a break that finds the blank keeps every one of them whole.
   */
  it('keeps a whole block together whatever length it is', () => {
    const blocks = ['ROSTER'];
    const sizes = [5, 2, 4, 3, 6, 2, 5, 3];
    sizes.forEach((size, at) => {
      for (let line = 0; line < size; line += 1) blocks.push(`block ${at} line ${line}`);
      blocks.push('');
    });
    const total = paginate(blocks).pages;
    expect(total).toBeGreaterThan(1);
    for (let page = 1; page <= total; page += 1) {
      const body = paginate(blocks, page).lines.slice(1, -1);
      const seen = new Set(body.map((line) => /^block (\d+) /.exec(line)?.[1]).filter(Boolean));
      for (const which of seen) {
        const size = sizes[Number(which)] ?? 0;
        expect(
          body.filter((line) => line.startsWith(`block ${which} `)).length,
          `block ${which} was split across pages`,
        ).toBe(size);
      }
    }
  });

  it('shows twenty rows at a time, which is what a view is written against', () => {
    // Asserted against the number rather than the constant, because every other row
    // assertion reads the constant and would follow it wherever it went (E7-S3).
    expect(PAGE_ROWS).toBe(20);
    const page = paginate(view);
    expect(page.lines.length).toBeLessThanOrEqual(20);
  });

  it('never says there is a page that is not there', () => {
    const total = paginate(view).pages;
    for (let at = 1; at <= total; at += 1) {
      const shown = paginate(view, at);
      expect(shown.lines[shown.lines.length - 1]).toBe(`-- page ${at} of ${total} --`);
    }
    // And the page it claims to be the last really is: asking for the one beyond it comes
    // back to the same page rather than to an empty one.
    expect(paginate(view, total + 1).page).toBe(total);
    expect(paginate(view, total).lines.length).toBeGreaterThan(2);
  });

  it('loses no line across the pages', () => {
    const seen: string[] = [];
    const first = paginate(view, 1);
    for (let at = 1; at <= first.pages; at += 1) {
      seen.push(...paginate(view, at).lines.slice(1, -1));
    }
    expect(seen.filter((line) => line.startsWith('line '))).toEqual(
      view.filter((line) => line.startsWith('line ')),
    );
  });
});

/**
 * E7 §4: `screen.ts` is the only module that reads `process.env` or touches the terminal.
 * Written as a test rather than an ESLint rule because the boundary is this project's and
 * the root config is shared with four other packages — the precedent is
 * `web/tests/engine-imports.test.ts`.
 */
describe('the one module allowed to read the terminal', () => {
  const srcDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'src');

  function sources(directory: string): string[] {
    return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) return sources(full);
      return entry.name.endsWith('.ts') ? [full] : [];
    });
  }

  it('is screen.ts, and nothing else reads process.env or process.stdout', () => {
    const offenders: string[] = [];
    for (const file of sources(srcDir)) {
      if (path.basename(file) === 'screen.ts') continue;
      const text = readFileSync(file, 'utf8');
      for (const forbidden of ['process.env', 'process.stdout', 'process.stdin']) {
        if (text.includes(forbidden)) offenders.push(`${path.relative(srcDir, file)}: ${forbidden}`);
      }
    }
    expect(offenders, 'only screen.ts may read the terminal').toEqual([]);
  });

  it('finds the source it is checking', () => {
    expect(sources(srcDir).length).toBeGreaterThan(10);
  });
});

/**
 * The prose this front end may not hold a copy of (DL-25 §15, DL-27 §§1–2). A sentence
 * about the world held here and copied into the browser is a sentence the two will come
 * to say differently — which is exactly what happened to the wronged-Rival pair, where
 * the terminal joined two clauses with a comma and the browser with a full stop.
 */
describe('the words that belong to narrate', () => {
  const srcDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'src');

  function sources(directory: string): string[] {
    return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) return sources(full);
      return entry.name.endsWith('.ts') ? [full] : [];
    });
  }

  /** A fragment of each shared sentence, short enough to survive a reflow of the source. */
  const SHARED = [
    'Coming back: they were on your Roster before',
    'They are posting nothing at all',
    'You have wronged them',
    'They have room to take somebody off your Roster',
    'Their own Roster is full, so they can take nobody',
    // How a Hero's going is said, and why nobody at the door can be taken on. Both were
    // held here and in the terminal word for word until they moved to `narrate`.
    'reached the end of a working life',
    'did not come back',
    'the Roster is full at',
    'the Guild cannot pay any of them yet',
    'none can be taken on just now',
  ];

  /** A line end, spelled without an escape so this file can be rewritten safely. */
  const NEWLINE = String.fromCharCode(10);

  /** True of a line that is a comment: prose *about* a sentence is not a copy of it. */
  function isComment(line: string): boolean {
    const trimmed = line.trim();
    return trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*');
  }

  it('holds no copy of a sentence narrate owns', () => {
    const offenders: string[] = [];
    for (const file of sources(srcDir)) {
      for (const line of readFileSync(file, 'utf8').split(NEWLINE)) {
        if (isComment(line)) continue;
        for (const sentence of SHARED) {
          if (line.includes(sentence)) {
            offenders.push(`${path.relative(srcDir, file)}: ${line.trim()}`);
          }
        }
      }
    }
    expect(offenders, 'these sentences live in @heroesim/narrate').toEqual([]);
  });

  it('writes no coin figure of its own: every one goes through the one formatter', () => {
    // A template hole followed by the word `coin` is a number printed without grouping.
    // `coin(…)` and `groupDigits(…)` are the two ways a figure may reach the screen.
    const offenders: string[] = [];
    for (const file of sources(srcDir)) {
      for (const line of readFileSync(file, 'utf8').split('\n')) {
        if (/\$\{[^}]*\}\s*coin\b/.test(line)) offenders.push(`${path.relative(srcDir, file)}: ${line.trim()}`);
      }
    }
    expect(offenders, 'coin is printed by narrate\'s coin(), never by hand').toEqual([]);
  });
});
