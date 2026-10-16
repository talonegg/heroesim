import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, test } from 'vitest';
import { App } from '../app';
import { coinWords } from '@heroesim/words';
import { append } from '@heroesim/engine/testing';
import { changed, documentOf, holding, played, playerOf, started, withTrades, withWealth } from '../state/game.test-support';
import type { GameState } from '../state/reducer';
import { treasuryAccounts } from '../state/treasury';
import { amountPattern, coinsPattern, section, silverOf, silverOfWords, spokenText } from './page.test-support';
import { Treasury } from './treasury';

// The Guild's Treasury (DL-111 item 5, DL-112 item 6, DL-116): the Wealth, Upkeep's next
// payment with its Day and parts, the Bankruptcy floor and the countdown while below it, and the
// ledger, filtered by income or expense and by category, paged, with the totals of what is shown.

afterEach(() => {
  cleanup();
  localStorage.clear();
});

/** The Lantern after selling a whetstone, signing a Hero and paying its first Upkeep: played once, and only read (ADR-0008). */
let tradedOnce: GameState | undefined;
function traded(): GameState {
  tradedOnce ??= trade();
  return tradedOnce;
}

function trade(): GameState {
  let state = holding(withWealth(started(), 5_000), 'whetstone', 3);
  const stack = Object.values(state.document?.world.stacks ?? {}).find((each) => each.definitionKey === 'whetstone' && each.holder.kind === 'guild');
  if (stack === undefined) throw new Error('no whetstones');
  state = played(state, { kind: 'sell', stackId: stack.id, quantity: 1 });
  const signing = Object.values(state.document?.world.heroes ?? {}).find((hero) => hero.unattachedSince !== null);
  if (signing === undefined) throw new Error('no one in the pool');
  state = played(state, { kind: 'recruit', heroId: signing.id, years: 2 });
  return played(state, { kind: 'advance', turns: 30 });
}

/** The Treasury: the page's body when it is drawn alone, else its part of the Guild, opened. */
function treasury(): HTMLElement {
  return screen.queryByRole('navigation', { name: 'Views' }) === null ? document.body : section('Treasury');
}

/** The Treasury of the game in `state`, drawn alone. */
function renderTreasury(state: GameState): void {
  render(<Treasury document={documentOf(state)} />);
}

function ledger(): HTMLElement {
  return within(treasury()).getByRole('table', { name: 'The ledger of The Lantern' });
}

/** The ledger's rows, each its cells' words. */
function rows(): string[][] {
  return within(ledger())
    .getAllByRole('row')
    .slice(1)
    .map((row) => Array.from(row.querySelectorAll<HTMLElement>('th, td'), spokenText));
}

/** The lines table: each row its name and its total in Silver, in the order shown. */
function lines(): [string, number][] {
  return within(within(treasury()).getByRole('table', { name: 'The lines of The Lantern' }))
    .getAllByRole('row')
    .slice(1)
    .map((row) => [within(row).getByRole('rowheader').textContent ?? '', silverOf(row.querySelector<HTMLElement>('td') as HTMLElement)]);
}

/** The ledger's rows of a category, their amounts summed in Silver. */
function ledgerSum(category: string): number {
  return rows()
    .filter((row) => row[2] === category)
    .reduce((sum, row) => sum + silverOfWords(row[3]?.replace('+', '') ?? ''), 0);
}

function totals(): string {
  return spokenText(within(treasury()).getByTestId('totals'));
}

describe('the Treasury', () => {
  test("gives the Guild's Wealth, each charge of its Upkeep with its next Day, the Hall's with its parts, and the Bankruptcy floor, with no countdown above it (DL-298)", () => {
    const state = changed(started(), (_, player) => {
      player.hall = { ...player.hall, quarters: 1 };
    });
    renderTreasury(state);
    const part = treasury();
    const upkeep = treasuryAccounts(documentOf(state))?.upkeep;
    const rosterSize = documentOf(state).meta.config.startingRosterSize;

    expect(spokenText(within(part).getByTestId('treasury-wealth'))).toMatch(new RegExp(`^Wealth\\s*${coinsPattern}$`));
    expect(within(part).getByText(new RegExp(`^Wages of The Lantern: ${amountPattern} every 10 Days$`))).toBeDefined();
    expect(within(part).getByText(new RegExp(`^Hall upkeep of The Lantern: ${amountPattern} every 30 Days$`))).toBeDefined();
    expect(spokenText(within(part).getByTestId('wages-next'))).toBe(`Next paid on the night of Year 1 Day 10: ${coinWords(upkeep?.wages.total ?? Number.NaN)}.`);
    expect(spokenText(within(part).getByTestId('hall-upkeep-next'))).toBe(`Next paid on the night of Year 1 Day 30: ${coinWords(upkeep?.hall.total ?? Number.NaN)}.`);
    const labels = ['The Hall', `${rosterSize} Heroes`, 'Quarters, grade 1'];
    expect(within(part).getAllByRole('term').map((term) => term.textContent)).toEqual(expect.arrayContaining(labels));
    // Each part that is an amount is shown in coins (DL-294 item 1).
    const parts = upkeep?.hall.parts ?? [];
    for (const label of labels) {
      const value = within(part).getByText(label, { selector: 'dt' }).nextElementSibling;
      if (!(value instanceof HTMLElement)) throw new Error(`no value for ${label}`);
      expect(silverOf(value)).toBe(parts.find((each) => each.label === label)?.silver);
    }
    expect(spokenText(within(part).getByTestId('floor'))).toBe(`The Bankruptcy floor is ${coinWords(documentOf(state).meta.config.bankruptcyFloor)}.`);
    expect(within(part).queryByText(/below the Bankruptcy floor since/)).toBeNull();
  });

  test("is in two sections, the Upkeep and the Ledger, and gives the Bankruptcy floor the Guild's rules set (DL-303)", () => {
    renderTreasury(
      changed(started(), (document) => {
        document.meta.config = { ...document.meta.config, bankruptcyFloor: 250 };
      }),
    );

    expect(within(treasury()).getAllByRole('heading', { level: 3 }).map((heading) => heading.textContent)).toEqual(['Upkeep', 'Ledger']);
    expect(spokenText(within(treasury()).getByTestId('floor'))).toBe('The Bankruptcy floor is 2 Gold 50 Silver.');
  });

  test('gives the countdown while the Guild is below the floor', () => {
    renderTreasury(withWealth(started(), -50, 0));

    expect(within(treasury()).getByText(/^The Lantern has been below the Bankruptcy floor since Year 1 Day 1: Bankruptcy on the night of Year \d+ Day \d+/)).toBeDefined();
  });

  test('gives the ledger newest first: the date, what happened, the category and the amount, with the totals of what is shown', () => {
    renderTreasury(traded());
    const founded = documentOf(traded()).meta.config.startingWealth;

    expect(within(ledger()).getAllByRole('columnheader').map((cell) => cell.textContent)).toEqual(['Date', 'What happened', 'Category', 'Amount']);
    const shown = rows();
    expect(shown.map((row) => row[2])).toEqual(['Wages', 'Signing fees', 'Item sales', 'Opening balance']);
    // It opens with the Wealth the Guild was founded with (DL-120 item 4).
    expect(shown[3]).toEqual(['Year 1 Day 1, morning', `Founded with ${coinWords(founded)}`, 'Opening balance', coinWords(founded)]);
    expect(within(treasury()).getByText('Page 1 of 1, 3 changes in all since the founding, newest first.')).toBeDefined();
    expect(shown[0]?.[0]).toBe('Year 1 Day 10, night');
    expect(shown[0]?.[1]).toMatch(new RegExp(`^The Lantern paid ${amountPattern} in wages, leaving ${amountPattern}\\.$`));
    expect(shown[0]?.[3]).toMatch(new RegExp(`^-${amountPattern}$`));
    expect(shown[2]?.[1]).toMatch(new RegExp(`^The Lantern sold Whetstone at the Market for ${amountPattern}\\.$`));
    expect(shown[2]?.[3]).toMatch(new RegExp(`^\\+${amountPattern}$`));
    expect(totals()).toMatch(new RegExp(`^Income \\+${amountPattern} · Expense -${amountPattern} · Net [+-]?${amountPattern}$`));
  });

  test('filters by income or expense and by categories, several of each, each option counting against the other filter, and totals only what is shown (DL-206 items 26 to 29)', () => {
    renderTreasury(traded());
    const flow = within(treasury()).getByRole('group', { name: 'Show income or expense' });
    const categories = within(treasury()).getByRole('group', { name: 'Show of category' });
    const words = (group: HTMLElement): string[] => within(group).getAllByRole('button').map((button) => button.textContent ?? '');
    expect(words(flow)).toEqual(['All', 'Income 1', 'Expense 2']);
    expect(words(categories)).toEqual(['All', 'Item sales 1', 'Wages 1', 'Signing fees 1']);

    fireEvent.click(within(flow).getByRole('button', { name: /^Income/ }));
    expect(within(flow).getByRole('button', { name: /^Income/ }).getAttribute('aria-pressed')).toBe('true');
    expect(within(flow).getByRole('button', { name: 'All' }).getAttribute('aria-pressed')).toBe('false');
    expect(rows().map((row) => row[2])).toEqual(['Item sales']);
    expect(totals()).toMatch(new RegExp(`^Income \\+(${amountPattern}) · Expense 0 Silver · Net \\+\\1$`));
    // The categories count their income; those with none greyed.
    expect(words(categories)).toEqual(['All', 'Item sales 1', 'Wages 0', 'Signing fees 0']);
    expect(within(categories).getByRole('button', { name: /^Wages/ }).classList.contains('is-empty')).toBe(true);

    // Both ways pressed reads as All: every change, and the opening row.
    fireEvent.click(within(flow).getByRole('button', { name: /^Expense/ }));
    expect(within(flow).getByRole('button', { name: 'All' }).getAttribute('aria-pressed')).toBe('true');
    expect(rows()).toHaveLength(4);

    fireEvent.click(within(flow).getByRole('button', { name: /^Expense/ }));
    expect(rows().map((row) => row[2])).toEqual(['Wages', 'Signing fees']);

    fireEvent.click(within(categories).getByRole('button', { name: /^Signing fees/ }));
    expect(rows().map((row) => row[2])).toEqual(['Signing fees']);
    // A second category: either shown.
    fireEvent.click(within(categories).getByRole('button', { name: /^Wages/ }));
    expect(rows().map((row) => row[2])).toEqual(['Wages', 'Signing fees']);
    fireEvent.click(within(categories).getByRole('button', { name: /^Wages/ }));

    fireEvent.click(within(flow).getByRole('button', { name: /^Expense/ }));
    fireEvent.click(within(flow).getByRole('button', { name: /^Income/ }));
    expect(within(treasury()).queryByRole('table')).toBeNull();
    expect(within(treasury()).getByText('No change to the Wealth of The Lantern matches the filters.')).toBeDefined();

    fireEvent.click(within(flow).getByRole('button', { name: 'All' }));
    fireEvent.click(within(categories).getByRole('button', { name: 'All' }));
    // The opening row again, with every change.
    expect(rows()).toHaveLength(4);
  });

  test('gives the lines under the totals, the income lines then the expense lines, each with its total and each section with its own, a line of nothing left out (DL-304 item 4)', () => {
    renderTreasury(traded());
    const sales = ledgerSum('Item sales');
    const wages = ledgerSum('Wages');
    const fees = ledgerSum('Signing fees');

    expect(sales).toBeGreaterThan(0);
    expect(wages + fees).toBeLessThan(0);
    expect(lines()).toEqual([
      ['Income', sales],
      ['Item sales', sales],
      ['Expense', wages + fees],
      ['Wages', wages],
      ['Signing fees', fees],
    ]);
    // Under the sentence of totals, and above the ledger.
    const table = within(treasury()).getByRole('table', { name: 'The lines of The Lantern' });
    expect(within(treasury()).getByTestId('totals').compareDocumentPosition(table) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(table.compareDocumentPosition(ledger()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  test('follows the filters: one line chosen, the table gives it and its section alone, and none shown, no table (DL-304 item 4)', () => {
    renderTreasury(traded());
    const categories = within(treasury()).getByRole('group', { name: 'Show of category' });
    const wages = ledgerSum('Wages');

    fireEvent.click(within(categories).getByRole('button', { name: /^Wages/ }));
    expect(lines()).toEqual([
      ['Expense', wages],
      ['Wages', wages],
    ]);

    const flow = within(treasury()).getByRole('group', { name: 'Show income or expense' });
    fireEvent.click(within(flow).getByRole('button', { name: /^Income/ }));
    expect(within(treasury()).queryByRole('table', { name: 'The lines of The Lantern' })).toBeNull();
  });

  test("gives Other's income as Other Income, the last of Income's lines, and its expense as Other Expense, the last of Expense's, each shown though they net to nothing, Income and Expense the sentence's (DL-306)", () => {
    // A module's changes of Wealth, which no shipped play makes: +50 and −50, Other netting 0.
    const document = structuredClone(documentOf(traded()));
    const guildId = playerOf(document).id;
    for (const [before, after] of [
      [1_000, 1_050],
      [1_050, 1_000],
    ] as const) {
      append(document.history, {
        turn: document.world.turn,
        type: 'guild.wealth-changed',
        participants: [guildId],
        labels: { [guildId]: 'The Lantern' },
        milestone: false,
        payload: { guildId, moduleId: 'probe', before, after },
      });
    }
    render(<Treasury document={document} />);
    const sales = ledgerSum('Item sales');
    const expense = ledgerSum('Wages') + ledgerSum('Signing fees');
    const [income, spent, net] = Array.from(within(treasury()).getByTestId('totals').querySelectorAll('[data-silver]'), (coins) => Number(coins.getAttribute('data-silver')));

    expect(ledgerSum('Other')).toBe(0);
    expect(lines()).toEqual([
      ['Income', sales + 50],
      ['Item sales', sales],
      ['Other Income', 50],
      ['Expense', expense - 50],
      ['Wages', ledgerSum('Wages')],
      ['Signing fees', ledgerSum('Signing fees')],
      ['Other Expense', -50],
    ]);
    expect([income, spent, net]).toEqual([sales + 50, expense - 50, sales + expense]);
    const table = within(treasury()).getByRole('table', { name: 'The lines of The Lantern' });
    for (const name of ['Other Income', 'Other Expense']) {
      expect(within(table).getByRole('rowheader', { name }).closest('tr')?.className).toBe('lines-table__line');
    }
  });

  test('gives no lines before the Wealth has changed (DL-304 item 4)', () => {
    renderTreasury(started());

    expect(within(treasury()).queryByRole('table', { name: 'The lines of The Lantern' })).toBeNull();
  });

  test('pages the ledger by 20, from the newest', () => {
    // Eleven purchases and eleven sales: more than a page of changes, with no Turn played.
    renderTreasury(withTrades(started(), 11, 11));

    expect(rows()).toHaveLength(20);
    expect(within(treasury()).getByText(/^Page 1 of \d+, \d+ changes in all since the founding, newest first\.$/)).toBeDefined();
    const first = rows()[0];
    fireEvent.click(within(treasury()).getByRole('button', { name: 'Older' }));
    expect(within(treasury()).getByText(/^Page 2 of \d+/)).toBeDefined();
    expect(rows()[0]).not.toEqual(first);
    fireEvent.click(within(treasury()).getByRole('button', { name: 'Newest' }));
    expect(rows()[0]).toEqual(first);

    // A filter's choice shows the ledger it leaves from its first page (DL-213).
    fireEvent.click(within(treasury()).getByRole('button', { name: 'Older' }));
    expect(within(treasury()).getByText(/^Page 2 of \d+/)).toBeDefined();
    fireEvent.click(within(within(treasury()).getByRole('group', { name: 'Show income or expense' })).getByRole('button', { name: /^Expense/ }));
    expect(within(treasury()).getByText(/^Page 1 of \d+, \d+ changes in all, newest first\.$/)).toBeDefined();
  });

  test("a name opens whom it names: a Guild's page in the Rankings", () => {
    render(<App initial={traded()} />);
    const [guild] = within(ledger()).getAllByRole('button', { name: 'The Lantern' });

    fireEvent.click(guild as HTMLElement);

    expect(screen.getByRole('region', { name: 'Rankings' })).toBeDefined();
  });

  test('opens with the Wealth the Guild was founded with, and says so while the Wealth has not changed since (DL-120 item 4)', () => {
    const state = started();
    const founded = documentOf(state).meta.config.startingWealth;
    renderTreasury(state);

    expect(within(treasury()).getByText('No change to the Wealth of The Lantern yet.')).toBeDefined();
    expect(rows()).toEqual([['Year 1 Day 1, morning', `Founded with ${coinWords(founded)}`, 'Opening balance', coinWords(founded)]]);
    // Nothing to filter or total yet.
    expect(within(treasury()).queryByRole('group', { name: 'Show income or expense' })).toBeNull();
    expect(within(treasury()).queryByTestId('totals')).toBeNull();
  });
});

describe("the Treasury's filters, one state with the page's other filters (DL-213)", () => {
  const group = (name: string): HTMLElement | null => screen.queryByRole('group', { name });
  const button = (scope: HTMLElement | null, name: RegExp | string): HTMLElement => within(scope as HTMLElement).getByRole('button', { name });

  test('a chip pressed, or a page turned, reads the History no more: the ledger is read once a document', () => {
    // Twenty-one purchases: more than a page of expenses, with no Turn played.
    const document = documentOf(withTrades(started(), 21));
    let reads = 0;
    // Every walk of the History for a Guild's changes begins at its index by participant.
    const history = new Proxy(document.history, {
      get(target, key, receiver) {
        if (key === 'byEntity') reads += 1;
        return Reflect.get(target, key, receiver) as unknown;
      },
    });
    render(<Treasury document={{ ...document, history }} />);
    expect(screen.getByRole('button', { name: 'Older' })).toBeDefined();
    const read = reads;
    expect(read).toBeGreaterThan(0);

    fireEvent.click(button(group('Show income or expense'), /^Expense \d+$/));
    fireEvent.click(screen.getByRole('button', { name: 'Older' }));
    fireEvent.click(button(group('Show income or expense'), 'All'));
    fireEvent.click(screen.getByRole('button', { name: 'Older' }));
    expect(screen.getByText(/^Page 2 of \d+/)).toBeDefined();
    expect(reads).toBe(read);
  });
});
