import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, test } from 'vitest';
import { App } from '../app';
import { holding, played, started, withWealth } from '../state/game.test-support';
import type { GameState } from '../state/reducer';
import { section } from './page.test-support';

// The Guild's Treasury (M9-F3, DL-111 item 5, DL-112 item 6, DL-116): the Wealth, Upkeep's next
// payment with its Day and parts, the Bankruptcy floor and the countdown while below it, and the
// ledger, filtered by income or expense and by category, paged, with the totals of what is shown.

afterEach(() => {
  cleanup();
  localStorage.clear();
});

/** The Lantern after selling a whetstone, signing a Hero and paying its first Upkeep. */
function traded(): GameState {
  let state = holding(withWealth(started(), 5_000), 'whetstone', 3);
  const stack = Object.values(state.document?.world.stacks ?? {}).find((each) => each.definitionKey === 'whetstone' && each.holder.kind === 'guild');
  if (stack === undefined) throw new Error('no whetstones');
  state = played(state, { kind: 'sell', stackId: stack.id, quantity: 1 });
  const signing = Object.values(state.document?.world.heroes ?? {}).find((hero) => hero.unattachedSince !== null);
  if (signing === undefined) throw new Error('no one in the pool');
  state = played(state, { kind: 'recruit', heroId: signing.id });
  return played(state, { kind: 'advance', turns: 30 });
}

function treasury(): HTMLElement {
  return section('Treasury');
}

function ledger(): HTMLElement {
  return within(treasury()).getByRole('table', { name: 'The ledger of The Lantern' });
}

/** The ledger's rows, each its cells' words. */
function rows(): string[][] {
  return within(ledger())
    .getAllByRole('row')
    .slice(1)
    .map((row) => Array.from(row.querySelectorAll('th, td'), (cell) => cell.textContent ?? ''));
}

function totals(): string {
  return within(treasury()).getByTestId('totals').textContent ?? '';
}

describe('the Treasury (M9-F3)', () => {
  test("gives the Guild's Wealth, Upkeep's next payment with its Day and parts, and the Bankruptcy floor, with no countdown above it", () => {
    render(<App initial={started()} />);
    const part = treasury();

    expect(within(part).getByTestId('treasury-wealth').textContent).toMatch(/^Wealth\s*\d+$/);
    expect(within(part).getByText(/^Upkeep of The Lantern: \d+ Wealth every 10 Days$/)).toBeDefined();
    expect(within(part).getByTestId('upkeep-next').textContent).toMatch(/^Next paid on the night of Year 1 Day 10: \d+ Wealth\.$/);
    expect(within(part).getAllByRole('term').map((term) => term.textContent)).toEqual(expect.arrayContaining(['Wages', 'Hall maintenance']));
    expect(within(part).getByTestId('floor').textContent).toBe('The Bankruptcy floor is 0 Wealth.');
    expect(within(part).queryByText(/below the Bankruptcy floor since/)).toBeNull();
  });

  test('gives the countdown while the Guild is below the floor', () => {
    render(<App initial={withWealth(started(), -50, 0)} />);

    expect(within(treasury()).getByText(/^The Lantern has been below the Bankruptcy floor since Year 1 Day 1: Bankruptcy on the night of Year \d+ Day \d+/)).toBeDefined();
  });

  test('gives the ledger newest first: the date, what happened, the category and the amount, with the totals of what is shown', () => {
    render(<App initial={traded()} />);

    expect(within(ledger()).getAllByRole('columnheader').map((cell) => cell.textContent)).toEqual(['Date', 'What happened', 'Category', 'Amount']);
    const shown = rows();
    expect(shown.map((row) => row[2])).toEqual(['Upkeep', 'Heroes', 'Market', 'Opening balance']);
    // It opens with the Wealth the Guild was founded with (M9-F7, DL-120 item 4).
    expect(shown[3]).toEqual(['Year 1 Day 1, morning', 'Founded with 500 Wealth', 'Opening balance', '500']);
    expect(within(treasury()).getByText('Page 1 of 1, 3 changes in all since the founding, newest first.')).toBeDefined();
    expect(shown[0]?.[0]).toBe('Year 1 Day 10, night');
    expect(shown[0]?.[1]).toMatch(/^The Lantern paid \d+ Upkeep, leaving \d+ Wealth\.$/);
    expect(shown[0]?.[3]).toMatch(/^-\d+$/);
    expect(shown[2]?.[1]).toMatch(/^The Lantern sold Whetstone at the Market for \d+ Wealth\.$/);
    expect(shown[2]?.[3]).toMatch(/^\+\d+$/);
    expect(totals()).toMatch(/^Income \+\d+ · Expense -\d+ · Net -?\d+$/);
  });

  test('filters by income or expense and by categories, several of each, each option counting against the other filter, and totals only what is shown (DL-206 items 26 to 29)', () => {
    render(<App initial={traded()} />);
    const flow = within(treasury()).getByRole('group', { name: 'Show income or expense' });
    const categories = within(treasury()).getByRole('group', { name: 'Show of category' });
    const words = (group: HTMLElement): string[] => within(group).getAllByRole('button').map((button) => button.textContent ?? '');
    expect(words(flow)).toEqual(['All', 'Income 1', 'Expense 2']);
    expect(words(categories)).toEqual(['All', 'Upkeep 1', 'Market 1', 'Heroes 1']);

    fireEvent.click(within(flow).getByRole('button', { name: /^Income/ }));
    expect(within(flow).getByRole('button', { name: /^Income/ }).getAttribute('aria-pressed')).toBe('true');
    expect(within(flow).getByRole('button', { name: 'All' }).getAttribute('aria-pressed')).toBe('false');
    expect(rows().map((row) => row[2])).toEqual(['Market']);
    expect(totals()).toMatch(/^Income \+(\d+) · Expense 0 · Net \+\1$/);
    // The categories count their income; those with none greyed.
    expect(words(categories)).toEqual(['All', 'Upkeep 0', 'Market 1', 'Heroes 0']);
    expect(within(categories).getByRole('button', { name: /^Upkeep/ }).classList.contains('is-empty')).toBe(true);

    // Both ways pressed reads as All: every change, and the opening row.
    fireEvent.click(within(flow).getByRole('button', { name: /^Expense/ }));
    expect(within(flow).getByRole('button', { name: 'All' }).getAttribute('aria-pressed')).toBe('true');
    expect(rows()).toHaveLength(4);

    fireEvent.click(within(flow).getByRole('button', { name: /^Expense/ }));
    expect(rows().map((row) => row[2])).toEqual(['Upkeep', 'Heroes']);

    fireEvent.click(within(categories).getByRole('button', { name: /^Heroes/ }));
    expect(rows().map((row) => row[2])).toEqual(['Heroes']);
    // A second category: either shown.
    fireEvent.click(within(categories).getByRole('button', { name: /^Upkeep/ }));
    expect(rows().map((row) => row[2])).toEqual(['Upkeep', 'Heroes']);
    fireEvent.click(within(categories).getByRole('button', { name: /^Upkeep/ }));

    fireEvent.click(within(flow).getByRole('button', { name: /^Expense/ }));
    fireEvent.click(within(flow).getByRole('button', { name: /^Income/ }));
    expect(within(treasury()).queryByRole('table')).toBeNull();
    expect(within(treasury()).getByText('No change to the Wealth of The Lantern matches the filters.')).toBeDefined();

    fireEvent.click(within(flow).getByRole('button', { name: 'All' }));
    fireEvent.click(within(categories).getByRole('button', { name: 'All' }));
    // The opening row again, with every change.
    expect(rows()).toHaveLength(4);
  });

  // 900 Turns played for more than a page of changes: four to five seconds alone (DL-164).
  test('pages the ledger by 20, from the newest', { timeout: 30_000 }, () => {
    render(<App initial={played(withWealth(started(), 100_000), { kind: 'advance', turns: 900 })} />);

    expect(rows()).toHaveLength(20);
    expect(within(treasury()).getByText(/^Page 1 of \d+, \d+ changes in all since the founding, newest first\.$/)).toBeDefined();
    const first = rows()[0];
    fireEvent.click(within(treasury()).getByRole('button', { name: 'Older' }));
    expect(within(treasury()).getByText(/^Page 2 of \d+/)).toBeDefined();
    expect(rows()[0]).not.toEqual(first);
    fireEvent.click(within(treasury()).getByRole('button', { name: 'Newest' }));
    expect(rows()[0]).toEqual(first);
  });

  test("a name opens whom it names: a Guild's page in the Rankings", () => {
    render(<App initial={traded()} />);
    const [guild] = within(ledger()).getAllByRole('button', { name: 'The Lantern' });

    fireEvent.click(guild as HTMLElement);

    expect(screen.getByRole('region', { name: 'Rankings' })).toBeDefined();
  });

  test('opens with the Wealth the Guild was founded with, and says so while the Wealth has not changed since (M9-F7, DL-120 item 4)', () => {
    render(<App initial={started()} />);

    expect(within(treasury()).getByText('No change to the Wealth of The Lantern yet.')).toBeDefined();
    expect(rows()).toEqual([['Year 1 Day 1, morning', 'Founded with 500 Wealth', 'Opening balance', '500']]);
    // Nothing to filter or total yet.
    expect(within(treasury()).queryByRole('group', { name: 'Show income or expense' })).toBeNull();
    expect(within(treasury()).queryByTestId('totals')).toBeNull();
  });
});
