// @vitest-environment node
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import { breakpoints, narrowQuery } from './breakpoints';

// The page's named widths (v1.1.6-S15, DL-186 item 23): every width the style sheet's media queries
// use is one of them, a `min-width` at it and a `max-width` a pixel under it.

const css = readFileSync(path.join(fileURLToPath(new URL('.', import.meta.url)), 'styles.css'), 'utf8').replace(/\r\n/g, '\n');
const declared: readonly number[] = Object.values(breakpoints);

/** Each width a media query of `source` names, with its side. */
function widths(source: string): { side: 'min' | 'max'; width: number; text: string }[] {
  return [...source.matchAll(/\((min|max)-width:\s*([0-9.]+)(px|em|rem)?\s*\)/g)].map(([text = '', side = '', width = '', unit = '']) => ({
    side: side as 'min' | 'max',
    // An `em` is a unit the table does not speak of: it is read as the number it is, and fails.
    width: unit === 'px' ? Number(width) : Number.NaN,
    text,
  }));
}

/** Whether `width` on `side` stands on a declared breakpoint. */
function declaredWidth({ side, width }: { side: 'min' | 'max'; width: number }): boolean {
  return declared.includes(side === 'min' ? width : width + 1);
}

describe('the breakpoints', () => {
  test('are four, in order, the style sheet uses every one', () => {
    expect(declared).toEqual([...declared].sort((a, b) => a - b));
    const used = widths(css).map((query) => (query.side === 'min' ? query.width : query.width + 1));
    for (const width of declared) expect(used, String(width)).toContain(width);
  });

  test("the style sheet's every min-width and max-width query stands on a declared breakpoint", () => {
    const queries = widths(css.split('\n').filter((line) => line.startsWith('@media')).join('\n'));
    expect(queries.length).toBeGreaterThan(0);
    for (const query of queries) expect(declaredWidth(query), query.text).toBe(true);
  });

  test('an undeclared width fails the check', () => {
    expect(widths('@media (max-width: 700px) {}').every(declaredWidth)).toBe(false);
    expect(widths('@media (min-width: 599px) {}').every(declaredWidth)).toBe(false);
    expect(widths('@media (min-width: 40em) {}').every(declaredWidth)).toBe(false);
    expect(widths('@media (min-width: 600px) and (max-width: 899px) {}').every(declaredWidth)).toBe(true);
  });

  test('the narrow query is a phone: under the phone width', () => {
    expect(narrowQuery).toBe('(max-width: 599px)');
  });
});
