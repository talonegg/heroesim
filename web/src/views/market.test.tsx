import { cleanup, fireEvent, render, within } from '@testing-library/react';
import { afterEach, describe, expect, test } from 'vitest';
import { App } from '../app';
import type { ItemDefinitionKey } from '@heroesim/engine';
import { holding, holdingUnique, started } from '../state/game.test-support';
import type { GameState } from '../state/reducer';
import { section } from './page.test-support';

// The Market view (M9-F2, DL-111 item 6, DL-112 item 5): Buy and Sell, the Market and what the Guild
// holds that the Hall view held (M9-S6, DL-106; the review's B3), a view of their own. What is for
// sale as a table shown one kind at a time; what the Guild holds as a table with Sell.

afterEach(cleanup);

function render_(state: GameState): void {
  render(<App initial={state} />);
}

describe("the Market view's Buy and Sell, as tables (M9-S6, the review's B3; M9-F2)", () => {
  test('is a view with its heading and two parts, Buy and Sell, in that order', () => {
    render_(started());
    const market = section('Market');

    expect(within(market).getByRole('heading', { level: 2, name: 'Market' })).toBeDefined();
    expect(within(market).getAllByRole('region').map((region) => region.getAttribute('aria-labelledby'))).toEqual(['buy-heading', 'sell-heading']);
    expect(within(market).getByRole('heading', { level: 3, name: 'Buy' })).toBeDefined();
    expect(within(market).getByRole('heading', { level: 3, name: 'Sell' })).toBeDefined();
  });

  test('Buy lists what is for sale as Item, Kind, Effect, Price, Stock, how many and Buy, one kind at a time from its chips', () => {
    render_(started());
    const market = section('Buy');
    const table = within(market).getByRole('table', { name: 'For sale at the Market' });
    expect(within(table).getAllByRole('columnheader').map((header) => header.textContent)).toEqual(['Item', 'Kind', 'Effect', 'Price', 'Stock', 'How many', 'Buy']);
    const kinds = (): string[] =>
      within(within(section('Market')).getByRole('table', { name: 'For sale at the Market' }))
        .getAllByTestId('listing')
        .map((row) => within(row).getAllByRole('cell')[0]?.textContent ?? '');
    const all = kinds();
    expect(new Set(all.map((kind) => kind.split(' ')[0])).size).toBeGreaterThan(1);
    const filters = within(market).getByRole('group', { name: 'Show for sale' });
    expect(within(filters).getByRole('button', { name: 'All' }).getAttribute('aria-pressed')).toBe('true');

    const weapon = within(filters).getByRole('button', { name: /^Weapon \d+$/ });
    fireEvent.click(weapon);

    expect(weapon.getAttribute('aria-pressed')).toBe('true');
    expect(kinds().length).toBe(Number(/(\d+)$/.exec(weapon.textContent ?? '')?.[1]));
    for (const kind of kinds()) expect(kind).toMatch(/^Weapon Gear/);
    // The count of what is for sale stays the whole Market's.
    expect(within(section('Market')).getByText(/^\d+ Items for sale, of \d+ kinds\.$/)).toBeDefined();

    fireEvent.click(within(filters).getByRole('button', { name: 'All' }));
    expect(kinds()).toEqual(all);
  });

  test('Sell says so while the Guild holds nothing, and is one table with Sell when it holds something', () => {
    const { unmount } = render(<App initial={started()} />);
    const nothing = section('Sell');
    expect(within(nothing).queryByRole('table')).toBeNull();
    expect(within(nothing).getByText('The Lantern holds nothing to sell. Gear a Hero carries can be sold once it is taken off.')).toBeDefined();
    unmount();

    render_(holding(holding(started(), 'whetstone', 3), 'arming-sword', 1));
    const held = within(section('Sell')).getByRole('table', { name: 'What The Lantern holds' });
    expect(within(held).getAllByRole('columnheader').map((header) => header.textContent)).toEqual(['Item', 'Kind', 'Effect', 'Held', 'Sells for', 'How many', 'Sell']);
    const rows = within(held)
      .getAllByTestId('held')
      .map((row) => [within(row).getByRole('rowheader').textContent, ...within(row).getAllByRole('cell').slice(0, 3).map((cell) => cell.textContent)]);
    expect(rows).toEqual([
      ['Whetstone', 'Consumable', '+3 on a combat Encounter', '3'],
      ['Arming sword', 'Weapon Gear', 'Weaponry +2, Strength +1', '1'],
    ]);
    expect(within(held).getByRole('button', { name: 'Sell Whetstone' })).toBeDefined();
    // Buy does not list them a second time.
    expect(within(section('Buy')).queryByRole('button', { name: 'Sell Whetstone' })).toBeNull();
  });

  test('says "Cannot be priced" for an Item the content does not define', () => {
    render_(holdingUnique(started(), 'not-in-the-content' as ItemDefinitionKey));
    const held = within(section('Sell')).getByRole('table', { name: 'What The Lantern holds' });

    expect(within(within(held).getByTestId('held')).getByText('Cannot be priced')).toBeDefined();
  });
});
