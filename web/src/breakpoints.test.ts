// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import { breakpoints, containerBreakpoints, narrowQuery } from './breakpoints';

// The page's named widths (DL-186 item 23): every width the style sheet's media queries
// use is one of them, a `min-width` at it and a `max-width` a pixel under it; and every width its
// container queries use is one of the parts' named widths, in rem, a `min-width` at it.

const here = fileURLToPath(new URL('.', import.meta.url));
const css = readFileSync(path.join(here, 'styles.css'), 'utf8')
  .replace(/\r\n/g, '\n')
  .replace(/\/\*[\s\S]*?\*\//g, '');
const declared: readonly number[] = Object.values(breakpoints);
const declaredContainers: readonly number[] = Object.values(containerBreakpoints);

interface Query {
  at: 'media' | 'container';
  /** `null` for a width asked in a form not read here (`width <= 599px`, `min-inline-size`). */
  side: 'min' | 'max' | null;
  width: number;
  unit: string;
  text: string;
}

/**
 * Each width a `@media` or `@container` query of `source` asks of, from every such rule's prelude
 * wherever it stands, indented in another rule or over lines.
 */
function widths(source: string): Query[] {
  const found: Query[] = [];
  for (const [, at = '', prelude = ''] of source.matchAll(/@(media|container)\b([^{;]*)\{/g)) {
    const read = [...prelude.matchAll(/\((min|max)-width:\s*([0-9.]+)([a-z]*)\s*\)/g)];
    for (const [text = '', side = '', width = '', unit = ''] of read) {
      found.push({ at: at as Query['at'], side: side as 'min' | 'max', width: Number(width), unit, text });
    }
    const asked = prelude.match(/width|inline-size/g)?.length ?? 0;
    if (asked > read.length) found.push({ at: at as Query['at'], side: null, width: Number.NaN, unit: '', text: prelude.trim() });
  }
  return found;
}

/** Whether `query` stands on a declared breakpoint: the page's in px, or a part's in rem. */
function declaredWidth({ at, side, width, unit }: Query): boolean {
  if (at === 'container') return side === 'min' && unit === 'rem' && declaredContainers.includes(width);
  if (side === null || unit !== 'px') return false;
  return declared.includes(side === 'min' ? width : width + 1);
}

describe('the breakpoints', () => {
  test("are four, in order, the style sheet uses every one; and the parts' widths, each used", () => {
    expect(declared).toEqual([...declared].sort((a, b) => a - b));
    const queries = widths(css);
    const used = queries.filter(({ at }) => at === 'media').map((query) => (query.side === 'min' ? query.width : query.width + 1));
    for (const width of declared) expect(used, String(width)).toContain(width);
    const usedByParts = queries.filter(({ at }) => at === 'container').map(({ width }) => width);
    for (const width of declaredContainers) expect(usedByParts, `${width}rem`).toContain(width);
  });

  test("the style sheet's every width query, media or container, stands on a declared breakpoint", () => {
    const queries = widths(css);
    expect(queries.filter(({ at }) => at === 'media').length).toBeGreaterThan(0);
    expect(queries.filter(({ at }) => at === 'container').length).toBeGreaterThan(0);
    for (const query of queries) expect(declaredWidth(query), query.text).toBe(true);
  });

  test('the style sheet is the only one: no other under src, and none in the page', () => {
    const sheets = readdirSync(here, { recursive: true, encoding: 'utf8' }).filter((file) => /\.(css|scss|sass|less)$/.test(file));
    expect(sheets).toEqual(['styles.css']);
    const page = readFileSync(path.join(here, '..', 'index.html'), 'utf8');
    expect(page).not.toMatch(/<style|@media|@container/);
  });

  test('an undeclared width fails the check, in whatever form', () => {
    const passes = (source: string): boolean => {
      const queries = widths(source);
      return queries.length > 0 && queries.every(declaredWidth);
    };
    expect(passes('@media (max-width: 700px) {}')).toBe(false);
    expect(passes('@media (min-width: 599px) {}')).toBe(false);
    expect(passes('@media (min-width: 40em) {}')).toBe(false);
    expect(passes('@media (width <= 599px) {}')).toBe(false);
    expect(passes('@media (600px <= width < 900px) {}')).toBe(false);
    expect(passes('@media (min-width: 600px),\n  (max-width: 300px) {}')).toBe(false);
    expect(passes('.a {\n  @media screen and (min-width: 700px) {}\n}')).toBe(false);
    expect(passes('@container part (min-width: 40rem) {}')).toBe(false);
    expect(passes('@container part (min-width: 600px) {}')).toBe(false);
    expect(passes('@container part (max-width: 46rem) {}')).toBe(false);
    expect(passes('@container part (min-inline-size: 46rem) {}')).toBe(false);
    expect(passes('@media (min-width: 600px) and (max-width: 899px) {}')).toBe(true);
    expect(passes('.a {\n  @media screen and (max-width: 419px) {}\n}')).toBe(true);
    expect(passes('@container part (min-width: 46rem) {}')).toBe(true);
  });

  test('the narrow query is a phone: under the phone width', () => {
    expect(narrowQuery).toBe('(max-width: 599px)');
  });
});
