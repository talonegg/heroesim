import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, test } from 'vitest';
import { Coins } from './coins';
import { StatPill } from './ui';

// The coins element (DL-294 item 1): each part's number, then its disc, largest Gold first and a zero
// part left out; the sentence form is what assistive technology reads, and the amount in Silver is on
// `data-silver`, which tests read.

afterEach(cleanup);

/** The element's visible parts: each coin's class and its number, in order. */
function shown(container: HTMLElement): string[] {
  return [...container.querySelectorAll('.coin')].map((coin) => `${coin.className}:${coin.textContent ?? ''}`);
}

describe('the coins element', () => {
  test.each<[string, number, string[], string]>([
    ['Gold and Silver', 520, ['coin coin--gold:5', 'coin coin--silver:20'], '5 Gold 20 Silver'],
    ['whole Gold, the zero Silver left out', 300, ['coin coin--gold:3'], '3 Gold'],
    ['under a Gold, the zero Gold left out', 20, ['coin coin--silver:20'], '20 Silver'],
    ['nothing, as 0 and a silver disc', 0, ['coin coin--silver:0'], '0 Silver'],
  ])('%s: the numbers before their discs, the sentence read', (_, silver, coins, words) => {
    const { container } = render(<Coins silver={silver} />);
    expect(shown(container)).toEqual(coins);
    expect(screen.getByText(words).className).toBe('visually-hidden');
    expect(container.querySelector('[data-silver]')?.getAttribute('data-silver')).toBe(String(silver));
  });

  test('a debt: the minus leads the parts, and the sentence reads it', () => {
    const { container } = render(<Coins silver={-520} />);
    const seen = container.querySelector('[aria-hidden="true"]');
    expect(seen?.textContent).toBe('-520');
    expect(shown(container)).toEqual(['coin coin--gold:5', 'coin coin--silver:20']);
    expect(screen.getByText('-5 Gold 20 Silver').className).toBe('visually-hidden');
    expect(container.querySelector('[data-silver]')?.getAttribute('data-silver')).toBe('-520');
  });

  test('signed, a gain takes a plus and a loss its minus; nothing is unsigned', () => {
    const gain = render(<Coins silver={150} signed />);
    expect(gain.container.querySelector('[aria-hidden="true"]')?.textContent).toBe('+150');
    expect(screen.getByText('+1 Gold 50 Silver').className).toBe('visually-hidden');
    gain.unmount();
    const loss = render(<Coins silver={-20} signed />);
    expect(loss.container.querySelector('[aria-hidden="true"]')?.textContent).toBe('-20');
    expect(screen.getByText('-20 Silver').className).toBe('visually-hidden');
    loss.unmount();
    const none = render(<Coins silver={0} signed />);
    expect(none.container.querySelector('[aria-hidden="true"]')?.textContent).toBe('0');
    expect(screen.getByText('0 Silver').className).toBe('visually-hidden');
  });

  test('the discs and numbers are hidden from assistive technology, which reads the sentence alone; a tooltip says it too', () => {
    const { container } = render(<Coins silver={520} />);
    const seen = container.querySelector('[aria-hidden="true"]');
    expect(seen?.querySelectorAll('.coin')).toHaveLength(2);
    expect(seen?.getAttribute('title')).toBe('5 Gold 20 Silver');
    const root = container.firstElementChild;
    expect(root?.className).toBe('coins');
    expect([...(root?.children ?? [])].map((child) => child.getAttribute('aria-hidden') ?? child.className)).toEqual(['true', 'visually-hidden']);
  });

  test("in a stat pill, keyed on the Silver: a new amount replays the pill's flash, the same amount does not", () => {
    const pill = (silver: number) => <StatPill icon="wealth" label="Wealth" value={<Coins silver={silver} />} flashKey={silver} testId="wealth" />;
    const { rerender } = render(pill(520));
    const first = screen.getByTestId('wealth');
    rerender(pill(520));
    expect(screen.getByTestId('wealth')).toBe(first);
    rerender(pill(480));
    expect(screen.getByTestId('wealth')).not.toBe(first);
    expect(screen.getByTestId('wealth').querySelector('[data-silver]')?.getAttribute('data-silver')).toBe('480');
  });

  test('a large amount keeps every Gold, with no separator', () => {
    const { container } = render(<Coins silver={1_234_567} />);
    expect(shown(container)).toEqual(['coin coin--gold:12345', 'coin coin--silver:67']);
  });
});
