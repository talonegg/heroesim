// @vitest-environment node
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';

// The page's style (M9-S3, DL-103): its colour tokens meet WCAG AA contrast in both schemes, for
// every pairing the stylesheet uses for text and for the edges of controls; its faces are the
// system's own, so nothing is fetched; `h5` and `h6` have sizes; and its motion is off under
// `prefers-reduced-motion`.

// Read with its line ends made one kind: a Windows checkout has CRLF.
const css = readFileSync(path.join(fileURLToPath(new URL('.', import.meta.url)), 'styles.css'), 'utf8').replace(/\r\n/g, '\n');

/** The `--name: #rrggbb` tokens of the first `:root` block after `after`. */
function tokens(after: string): Map<string, string> {
  const from = css.indexOf(after);
  const start = css.indexOf(':root {', from);
  if (from < 0 || start < 0) throw new Error(`no :root block after ${after}`);
  const body = css.slice(start, css.indexOf('}', start));
  return new Map([...body.matchAll(/--([a-z-]+):\s*(#[0-9a-f]{6})\s*;/g)].map(([, name = '', value = '']) => [name, value]));
}

const light = tokens('/* ── Tokens');
const darkOwn = tokens('@media (prefers-color-scheme: dark)');
const dark = new Map([...light, ...darkOwn]);

/** WCAG 2.2's relative luminance of `#rrggbb`. */
function luminance(hex: string): number {
  const [r = 0, g = 0, b = 0] = [1, 3, 5].map((at) => {
    const channel = parseInt(hex.slice(at, at + 2), 16) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG 2.2's contrast ratio between two colours. */
function contrast(a: string, b: string): number {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (high + 0.05) / (low + 0.05);
}

/** Text on a surface: each pairing the stylesheet sets. */
const textPairs: readonly (readonly [string, string])[] = [
  ...['paper', 'surface', 'sunk', 'accent-soft', 'bad-soft', 'warn-soft', 'brass-soft'].map((surface) => ['ink', surface] as const),
  ...['paper', 'surface', 'sunk', 'accent-soft', 'bad-soft', 'warn-soft', 'brass-soft'].map((surface) => ['ink-soft', surface] as const),
  ...['paper', 'surface', 'sunk', 'accent-soft'].map((surface) => ['accent', surface] as const),
  ['on-accent', 'accent'],
  ['on-accent', 'accent-strong'],
  ...['paper', 'surface', 'brass-soft'].map((surface) => ['brass', surface] as const),
  ...['paper', 'surface', 'good-soft'].map((surface) => ['good', surface] as const),
  ...['paper', 'surface', 'bad-soft'].map((surface) => ['bad', surface] as const),
  ...['paper', 'surface', 'warn-soft'].map((surface) => ['warn', surface] as const),
];

/** The edge of a control, or the focus ring, against what it sits on: 3:1 (WCAG 1.4.11). */
const edgePairs: readonly (readonly [string, string])[] = [
  ['line-strong', 'paper'],
  ['line-strong', 'surface'],
  ['focus', 'paper'],
  ['focus', 'surface'],
  ['accent', 'paper'],
];

describe('colour contrast, WCAG AA', () => {
  for (const [scheme, colours] of [
    ['light', light],
    ['dark', dark],
  ] as const) {
    test(`in the ${scheme} scheme, text is at least 4.5:1 on every surface it is set on, and a control's edge 3:1`, () => {
      const colour = (name: string): string => {
        const value = colours.get(name);
        if (value === undefined) throw new Error(`no --${name} in the ${scheme} scheme`);
        return value;
      };
      const short = [
        ...textPairs.filter(([ink, surface]) => contrast(colour(ink), colour(surface)) < 4.5),
        ...edgePairs.filter(([edge, surface]) => contrast(colour(edge), colour(surface)) < 3),
      ].map(([a, b]) => `--${a} on --${b}: ${contrast(colour(a), colour(b)).toFixed(2)}`);

      expect(short).toEqual([]);
    });
  }

  test('the dark scheme redefines every colour the light one sets', () => {
    expect([...light.keys()].filter((name) => !darkOwn.has(name))).toEqual([]);
  });

  test('the check fails a pairing that falls short: grey on white is 2.3:1', () => {
    expect(contrast('#aaaaaa', '#ffffff')).toBeLessThan(3);
    expect(contrast('#000000', '#ffffff')).toBe(21);
  });
});

describe('faces, headings and motion', () => {
  test('headings are in the system serif stack and body text in system-ui: no face is fetched', () => {
    expect(css).toContain(`--serif: 'Iowan Old Style', 'Palatino Linotype', Palatino, 'Book Antiqua', Georgia, serif;`);
    expect(css).toMatch(/--sans: system-ui,/);
    expect(css).not.toMatch(/@font-face|@import|url\(/);
  });

  test('every heading level has a size, h5 and h6 among them', () => {
    for (const level of [1, 2, 3, 4, 5, 6]) expect(css).toMatch(new RegExp(`\\nh${level} \\{\\n[^}]*font-size:`));
  });

  test('every number is set in tabular figures', () => {
    expect(css).toMatch(/body \{[^}]*font-variant-numeric: tabular-nums;/);
  });

  test('motion runs only when the player has not asked for less, and is off when they have', () => {
    const animated = [...css.matchAll(/animation: (?!none)[a-z-]+ /g)].length;
    expect(animated).toBeGreaterThan(0);
    const allowed = css.slice(css.indexOf('@media (prefers-reduced-motion: no-preference)'), css.indexOf('@media (prefers-reduced-motion: reduce)'));
    expect([...allowed.matchAll(/animation: (?!none)[a-z-]+ /g)].length).toBe(animated);
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\) \{[^@]*animation: none !important;[^@]*transition: none !important;/);
  });
});
