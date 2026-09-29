import { cleanup, fireEvent, render, within } from '@testing-library/react';
import { afterEach, describe, expect, test } from 'vitest';
import { App } from '../app';
import { changed, holding, started } from '../state/game.test-support';
import type { GameState } from '../state/reducer';
import { section } from './page.test-support';

// The Hall redesigned (M9-S6, DL-106; the review's B3, B9 and C8): each facility one row with its
// grade as pips and the cost on its button, the Upkeep above them; the Guildmaster with Traits and
// their effects, the descriptive Attributes written, and Regard as chips with the neutral folded;
// what the Guild holds as a table with Sell; and the Market as a table shown one kind at a time.

afterEach(cleanup);

function render_(state: GameState): void {
  render(<App initial={state} />);
}

/** The Hall's facility rows, by their names. */
function facility(name: string): HTMLElement {
  const row = within(section('Hall'))
    .getAllByTestId('facility')
    .find((each) => each.textContent?.startsWith(name) === true);
  if (row === undefined) throw new Error(`no ${name}`);
  return row;
}

describe("the Hall's facilities (M9-S6, the review's B9)", () => {
  test('are one row each: the grade as pips to the top grade, what it does, and Build with its cost; the Upkeep above them', () => {
    render_(
      changed(started(), (_, player) => {
        player.hall.infirmary = 1;
        player.hall.quarters = 3;
      }),
    );

    expect(within(section('Hall')).getAllByTestId('facility')).toHaveLength(3);
    const infirmary = facility('Infirmary');
    const pips = within(infirmary).getByRole('img', { name: 'Grade 1 of 3' });
    expect(pips.textContent).toBe('●○○');
    expect(within(infirmary).getByText('Sickroom')).toBeDefined();
    expect(within(infirmary).getByText('The infirmary shortens the Days an Injury takes to heal.')).toBeDefined();
    expect(within(infirmary).getByRole('button', { name: 'Build Infirmary ward for 500 Wealth' }).textContent).toBe('Build Infirmary ward · 500');
    expect(within(facility('Training yard')).getByRole('img', { name: 'Grade 0 of 3' }).textContent).toBe('○○○');
    // At the top grade, no button.
    const quarters = facility('Quarters');
    expect(within(quarters).getByRole('img', { name: 'Grade 3 of 3' }).textContent).toBe('●●●');
    expect(within(quarters).getByText('At the top grade')).toBeDefined();
    expect(within(quarters).queryByRole('button')).toBeNull();
    expect(within(section('Hall')).getByText(/^\d+ Wealth every \d+ Days$/).closest('p')?.textContent).toMatch(/^Upkeep of The Lantern: \d+ Wealth every 10 Days$/);
  });
});

describe('the Guildmaster (M9-S6, the review’s C8)', () => {
  test('gives the Traits with what each does, the descriptive Attributes written and none left empty, and Regard as chips with the neutral folded', () => {
    const state = changed(started(), (document, player) => {
      const guildmaster = document.world.guildmasters[player.guildmasterId];
      const [patron] = Object.values(document.world.patrons);
      if (guildmaster === undefined || patron === undefined) throw new Error('no Guildmaster or Patron');
      guildmaster.traits = ['thrifty', 'mistrusts-magic'] as never;
      guildmaster.birthplace = 'Harrowgate';
      guildmaster.biography = 'Once a quartermaster of the river levies.';
      guildmaster.regard[patron.id] = { value: 8, since: 0, reason: 'test' };
    });
    render_(state);
    const guildmaster = section('Guildmaster');

    const traits = within(guildmaster).getByRole('list', { name: "Ada Vell's Traits" });
    expect(within(traits).getAllByRole('listitem').map((item) => item.textContent)).toEqual(['Thrifty Upkeep ×0.9', 'Mistrusts magic -1 Arcana to Mages']);
    expect(within(guildmaster).getByText('Harrowgate')).toBeDefined();
    expect(within(guildmaster).getByText('Once a quartermaster of the river levies.')).toBeDefined();
    expect(within(guildmaster).getAllByRole('term').map((term) => term.textContent)).toEqual(['Sex', 'Age', 'Birthplace', 'Biography']);
    expect(within(guildmaster).getByRole('rowheader', { name: 'Negotiation' })).toBeDefined();

    const patrons = within(guildmaster).getByRole('list', { name: 'For Patrons' });
    const [warm] = within(patrons).getAllByRole('listitem');
    expect(within(patrons).getAllByRole('listitem')).toHaveLength(1);
    expect(within(warm as HTMLElement).getByText('warm').closest('.chip')?.className).toBe('chip chip--good');
    const counts = within(guildmaster)
      .getAllByText(/^\d+ neutral$/)
      .map((each) => each.textContent);
    expect(counts).toHaveLength(3);
    expect(within(guildmaster).getByRole('list', { name: 'For Patrons, neutral' }).children.length).toBe(Number(/^(\d+)/.exec(counts[0] ?? '')?.[1]));
    // Never a number beside a band.
    for (const item of within(guildmaster).getAllByRole('listitem').filter((each) => each.closest('.regards') !== null)) {
      expect(item.textContent).toMatch(/(hostile|cool|neutral|warm|close)$/);
    }
  });
});

describe("the Market and what the Guild holds as tables (M9-S6, the review's B3)", () => {
  test('lists what is for sale as Item, Kind, Effect, Price, Stock, how many and Buy, one kind at a time from its chips', () => {
    render_(started());
    const market = section('Market');
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
    for (const kind of kinds()) expect(kind).toMatch(/^weapon gear/);
    // The count of what is for sale stays the whole Market's.
    expect(within(section('Market')).getByText(/^\d+ Items for sale, of \d+ kinds\.$/)).toBeDefined();

    fireEvent.click(within(filters).getByRole('button', { name: 'All' }));
    expect(kinds()).toEqual(all);
  });

  test('what the Guild holds is not drawn while it holds nothing, and is one table with Sell when it holds something', () => {
    const { unmount } = render(<App initial={started()} />);
    section('Hall');
    expect(document.querySelector('#held')).toBeNull();
    unmount();

    render_(holding(holding(started(), 'whetstone', 3), 'arming-sword', 1));
    const held = within(section('What the Guild holds')).getByRole('table', { name: 'What The Lantern holds' });
    expect(within(held).getAllByRole('columnheader').map((header) => header.textContent)).toEqual(['Item', 'Kind', 'Effect', 'Held', 'Sells for', 'How many', 'Sell']);
    const rows = within(held)
      .getAllByTestId('held')
      .map((row) => [within(row).getByRole('rowheader').textContent, ...within(row).getAllByRole('cell').slice(0, 3).map((cell) => cell.textContent)]);
    expect(rows).toEqual([
      ['Whetstone', 'consumable', '+3 on a combat Encounter', '3'],
      ['Arming sword', 'weapon gear', 'Weaponry +2, Strength +1', '1'],
    ]);
    expect(within(held).getByRole('button', { name: 'Sell Whetstone' })).toBeDefined();
    // The Market no longer lists them a second time.
    expect(within(section('Market')).queryByRole('button', { name: 'Sell Whetstone' })).toBeNull();
  });
});
