import { cleanup, render } from '@testing-library/react';
import { classIcons } from '../state/names';
import { afterEach, describe, expect, test } from 'vitest';
import { ClassMark, classDrawingNames, HeroName, Icon, iconNames } from './icons';

// The icon set (M9-S3, DL-103; the review's D3): inline SVG in one stroke style, decoration beside
// words that say the same, and at least the icons the epic names.

afterEach(cleanup);

test('every icon is an inline SVG in the one stroke style, hidden from assistive technology, drawing something', () => {
  for (const name of iconNames) {
    const { container, unmount } = render(<Icon name={name} />);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('viewBox'), name).toBe('0 0 24 24');
    expect(svg?.getAttribute('aria-hidden'), name).toBe('true');
    expect(svg?.getAttribute('stroke'), name).toBe('currentColor');
    expect(svg?.getAttribute('stroke-width'), name).toBe('1.75');
    expect(svg?.getAttribute('fill'), name).toBe('none');
    expect(svg?.querySelectorAll('path, circle, rect').length, name).toBeGreaterThan(0);
    // Nothing is fetched: no reference to anything outside the bundle.
    expect(container.innerHTML, name).not.toMatch(/href|url\(/);
    unmount();
  }
});

test('the set holds the icons the epic names', () => {
  const named = ['wealth', 'fame', 'morning', 'afternoon', 'night', 'combat', 'travel', 'stealth', 'arcane', 'social', 'lore', 'morale', 'injury', 'build', 'history', 'menu', 'close'];
  expect(named.filter((name) => !(iconNames as readonly string[]).includes(name))).toEqual([]);
});

// The Class icons (v1.1.7-S6, DL-206 item 22, DL-212): the names content may give a Class, the
// drawings the page holds, and a plain mark for a Class with none.
describe('the Class icons', () => {
  test('every name content may give a Class is drawn, and no drawing is without a name', () => {
    expect([...classDrawingNames].sort()).toEqual([...classIcons].sort());
  });

  test.each([...classIcons, null])('%s is drawn in the one stroke style, hidden from assistive technology, its tooltip the Class', (icon) => {
    const { container } = render(<ClassMark icon={icon} className="Rogue" />);
    const mark = container.querySelector('.class-mark');
    expect(mark?.getAttribute('title')).toBe('Rogue');
    expect(mark?.getAttribute('aria-hidden')).toBe('true');
    const svg = mark?.querySelector('svg');
    expect(svg?.getAttribute('viewBox')).toBe('0 0 24 24');
    expect(svg?.getAttribute('stroke')).toBe('currentColor');
    expect(svg?.getAttribute('stroke-width')).toBe('1.75');
    expect(svg?.getAttribute('fill')).toBe('none');
    expect(svg?.querySelectorAll('path').length).toBeGreaterThan(0);
    expect(container.innerHTML).not.toMatch(/href|url\(/);
  });

  test('a Class with none shows the plain mark, and each name another drawing', () => {
    const plain = render(<ClassMark icon={null} className="Rogue" />).container.innerHTML;
    expect(plain).toContain('M12 4l8 8-8 8-8-8z');
    for (const icon of classIcons) expect(render(<ClassMark icon={icon} className="Rogue" />).container.innerHTML).not.toBe(plain);
  });
});

// A Hero's name with the mark (DL-206 item 23, DL-212): the mark and the name's first word are one
// unit, so the mark is never alone on a line (the owner's (b), 2026-10-06); the later words follow it
// and wrap as words do. That the unit holds on the page is the e2e's (layout.spec.ts).
describe("a Hero's name with their Class's mark", () => {
  test.each([
    ['Ingram Holloway', 'Ingram', ' Holloway'],
    ['Cynwise', 'Cynwise', ''],
    ['Swanhild of the Long Barrow', 'Swanhild', ' of the Long Barrow'],
  ])('%s: the mark and the first word in one unit, the rest after it', (name, firstWord, rest) => {
    const { container } = render(<HeroName icon="tome" className="Mage" name={name} />);
    const element = container.querySelector('.hero-name');
    expect(element?.textContent).toBe(name);
    const lead = element?.querySelector('.hero-name__lead');
    expect(element?.firstElementChild).toBe(lead);
    expect(lead?.firstElementChild?.classList.contains('class-mark')).toBe(true);
    expect(lead?.textContent).toBe(firstWord);
    expect(element?.textContent?.slice(firstWord.length)).toBe(rest);
  });

  test('the name may carry a class of its own, its text the name alone', () => {
    const { container } = render(<HeroName icon={null} className="Rogue" name="Ingram Holloway" nameClass="party-row__name" />);
    const element = container.querySelector('.hero-name');
    expect(element?.classList.contains('party-row__name')).toBe(true);
    expect(element?.textContent).toBe('Ingram Holloway');
  });
});
