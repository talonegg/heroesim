import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, test } from 'vitest';
import { App } from '../app';
import { carrying, changed, holding, holdingUnique, started } from '../state/game.test-support';
import type { GameState } from '../state/reducer';
import { section } from './page.test-support';

// The Guild's Stores (M9-F3, DL-111 item 5, DL-112 item 6, DL-113 item 2, DL-116): one table of every
// Item the Guild owns, wherever it is, filtered by kind and by where; read only, with a way to the
// Market's Sell.

afterEach(() => {
  cleanup();
  localStorage.clear();
});

/** The Lantern with two whetstones held, a padded jack on its first Hero and a unique lantern held. */
function stocked(): GameState {
  return holdingUnique(carrying(holding(started(), 'whetstone', 2), 'padded-jack', 'armour'), 'lantern-of-stannary');
}

function stores(): HTMLElement {
  return section('Stores');
}

function table(): HTMLElement {
  return within(stores()).getByRole('table', { name: 'Everything The Lantern owns' });
}

function rows(): string[][] {
  return within(table())
    .getAllByRole('row')
    .slice(1)
    .map((row) => Array.from(row.querySelectorAll('th, td'), (cell) => cell.textContent ?? ''));
}

describe('the Stores (M9-F3)', () => {
  test('is one table: Item, Kind, where it is, Quantity, and what a held Item sells for', () => {
    render(<App initial={stocked()} />);

    expect(within(stores()).getByText('The Lantern owns 4 Items: 3 held and 1 carried by its Heroes.')).toBeDefined();
    expect(within(table()).getAllByRole('columnheader').map((cell) => cell.textContent)).toEqual(['Item', 'Kind', 'Where', 'Quantity', 'Sells for']);
    const shown = rows();
    expect(shown).toHaveLength(3);
    expect(shown[0]?.slice(0, 4)).toEqual(['Whetstone', 'Consumable', 'Held', '2']);
    expect(shown[0]?.[4]).toMatch(/^\d+$/);
    expect(shown[1]?.slice(0, 4)).toEqual(['The Lantern of Stannary', 'Trinket Gear, Unique Item', 'Held', '1']);
    expect(shown[2]?.slice(0, 2)).toEqual(['Padded jack', 'Armour Gear']);
    expect(shown[2]?.[2]).toMatch(/^Carried by /);
    expect(shown[2]?.[4]).toBe('—');
  });

  test('filters by kind and by where, and shows everything again from All', () => {
    render(<App initial={stocked()} />);
    const kinds = within(stores()).getByRole('group', { name: 'Show of kind' });
    const wheres = within(stores()).getByRole('group', { name: 'Show where' });

    fireEvent.click(within(kinds).getByRole('button', { name: /^Consumable/ }));
    expect(rows().map((row) => row[0])).toEqual(['Whetstone']);
    expect(within(kinds).getByRole('button', { name: /^Consumable/ }).getAttribute('aria-pressed')).toBe('true');

    fireEvent.click(within(kinds).getByRole('button', { name: 'All' }));
    fireEvent.click(within(wheres).getByRole('button', { name: /^Carried/ }));
    expect(rows().map((row) => row[0])).toEqual(['Padded jack']);

    fireEvent.click(within(kinds).getByRole('button', { name: /^Consumable/ }));
    expect(within(stores()).queryByRole('table')).toBeNull();
    expect(within(stores()).getByText('Nothing The Lantern owns is of that kind and there.')).toBeDefined();

    fireEvent.click(within(wheres).getByRole('button', { name: 'All' }));
    expect(rows().map((row) => row[0])).toEqual(['Whetstone']);
  });

  test("a Hero's name opens their page", () => {
    render(<App initial={stocked()} />);
    const carrier = within(table()).getByRole('button', { name: /^[A-Z]/ });
    const name = carrier.textContent ?? '';

    fireEvent.click(carrier);

    const page = within(screen.getByRole('region', { name: 'History' })).getByRole('article');
    expect(within(page).getByRole('heading', { level: 3, name })).toBeDefined();
  });

  test("goes to the Market's Sell", () => {
    render(<App initial={stocked()} />);

    fireEvent.click(within(stores()).getByRole('button', { name: 'Sell at the Market' }));

    expect(screen.getByRole('region', { name: 'Sell' })).toBeDefined();
    expect(document.activeElement).toBe(screen.getByRole('heading', { level: 3, name: 'Sell' }));
  });

  test("offers no way to the Market's Sell while the Guild holds nothing, all it owns carried (code review)", () => {
    render(
      <App
        initial={carrying(
          changed(started(), (document) => {
            document.world.items = {};
            document.world.stacks = {};
          }),
          'padded-jack',
          'armour',
        )}
      />,
    );

    expect(rows().map((row) => row[0])).toEqual(['Padded jack']);
    expect(within(stores()).queryByRole('button', { name: 'Sell at the Market' })).toBeNull();
  });

  test('says so when the Guild owns nothing, with no table and no filters', () => {
    render(
      <App
        initial={changed(started(), (document) => {
          document.world.items = {};
          document.world.stacks = {};
        })}
      />,
    );

    expect(within(stores()).getByText('The Lantern owns nothing: no Item is held, carried by a Hero or with a Party.')).toBeDefined();
    expect(within(stores()).queryByRole('table')).toBeNull();
    expect(within(stores()).queryByRole('group')).toBeNull();
  });
});
