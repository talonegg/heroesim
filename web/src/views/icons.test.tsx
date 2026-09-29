import { cleanup, render } from '@testing-library/react';
import { afterEach, expect, test } from 'vitest';
import { Icon, iconNames } from './icons';

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
  const named = ['wealth', 'fame', 'morning', 'afternoon', 'night', 'combat', 'travel', 'stealth', 'arcane', 'social', 'morale', 'injury', 'build', 'history', 'menu', 'close'];
  expect(named.filter((name) => !(iconNames as readonly string[]).includes(name))).toEqual([]);
});
