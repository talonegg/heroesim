import { cleanup, fireEvent, within } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { changed, started } from '../state/game.test-support';
import type { GameState } from '../state/reducer';
import { openView, renderGame, section, silverOf } from './page.test-support';

// The Rankings redesigned (DL-106; the review's B4, B5 and B10): the Rankings and the Guilds
// as one table whose headings order it, By Fame and By Wealth keeping their shared places; a
// Rival's page with its Roster as a table and its Hall and Guildmaster folded; and the Patrons as
// one table with the neutral folded. Every value comes from a selector (`guildsTable`, `guildPage`,
// `patronsView`).

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function table(): HTMLElement {
  return within(section('Guilds')).getByRole('table', { name: 'Every Guild, and the Rankings' });
}

/** Each Guild's row: its name, then Place, Disposition, Fame, Wealth, Heroes, Upkeep; Wealth and Upkeep also as their Silver (`wealth`, `upkeep`). */
function rows(): { name: string; cells: string[]; wealth: number; upkeep: number; row: HTMLElement }[] {
  return within(table())
    .getAllByTestId('guild-row')
    .map((row) => ({
      name: within(row).getAllByRole('button')[0]?.textContent ?? '',
      cells: within(row)
        .getAllByRole('cell')
        .map((cell) => cell.textContent ?? ''),
      wealth: silverOf(within(row).getAllByRole('cell')[3] as HTMLElement),
      upkeep: silverOf(within(row).getAllByRole('cell')[5] as HTMLElement),
      row,
    }));
}

function orderBy(column: string): void {
  fireEvent.click(within(table()).getByRole('button', { name: `Order by ${column}` }));
}

/** A game whose five Guilds have the names, Fame, Wealth and Roster sizes given, in the world's order. */
function arranged(guilds: readonly (readonly [name: string, fame: number, wealth: number, heroes: number])[]): GameState {
  return changed(started(), (document) => {
    Object.values(document.world.guilds).forEach((guild, index) => {
      const [name, fame, wealth, heroes] = guilds[index] ?? ['', 0, 0, 0];
      Object.assign(guild, { name, fame, wealth, rosterIds: guild.rosterIds.slice(0, heroes) });
    });
  });
}

const five = [
  ['The Lantern', 9, 100, 1],
  ['Ashford', 4, 300, 3],
  ['Old Weir', 4, 300, 1],
  ['Barrow', 1, 50, 2],
  ['Cinder', 0, 200, 3],
] as const;

describe("the Guilds and the Rankings as one table (the review's B4)", () => {
  test('gives Place, Guild, Disposition, Fame, Wealth, Heroes and Upkeep, the Rankings by Fame first, the player’s row marked', () => {
    renderGame(arranged(five));

    expect(within(table()).getAllByRole('columnheader').map((header) => header.textContent)).toEqual([
      'Place by Fame',
      'Guild',
      'Disposition',
      'Fame',
      'Wealth',
      'Heroes',
      'Upkeep',
    ]);
    expect(within(table()).getByRole('columnheader', { name: 'Fame' }).getAttribute('aria-sort')).toBe('descending');
    expect(rows().map(({ name, cells: [place] }) => [place, name])).toEqual([
      ['1st', 'The Lantern'],
      ['Joint 2nd', 'Ashford'],
      ['Joint 2nd', 'Old Weir'],
      ['4th', 'Barrow'],
      ['5th', 'Cinder'],
    ]);
    const [mine, ...rivals] = rows();
    expect(mine?.row.className).toBe('mine');
    expect(mine?.cells[1]).toBe('Yours');
    expect(within(mine?.row as HTMLElement).getByText(', your Guild')).toBeDefined();
    for (const rival of rivals) {
      expect(rival.row.className).toBe('');
      expect(rival.cells[1]).toMatch(/^[A-Z][a-z]+$/);
    }
    expect(rows().map(({ cells, wealth }) => [cells[2], wealth, cells[4]])).toEqual([
      ['9', 100, '1'],
      ['4', 300, '3'],
      ['4', 300, '1'],
      ['1', 50, '2'],
      ['0', 200, '3'],
    ]);
    for (const { upkeep } of rows()) expect(Number.isSafeInteger(upkeep)).toBe(true);
  });

  test('by Wealth, orders and places the Guilds by Wealth, the level ones sharing a place (DL-95, DL-91)', () => {
    renderGame(arranged(five));

    orderBy('Wealth');

    expect(within(table()).getByRole('columnheader', { name: 'Wealth' }).getAttribute('aria-sort')).toBe('descending');
    expect(within(table()).getByRole('columnheader', { name: 'Fame' }).getAttribute('aria-sort')).toBeNull();
    expect(within(table()).getByRole('columnheader', { name: 'Place by Wealth' })).toBeDefined();
    expect(rows().map(({ name, cells: [place] }) => [place, name])).toEqual([
      ['Joint 1st', 'Ashford'],
      ['Joint 1st', 'Old Weir'],
      ['3rd', 'Cinder'],
      ['4th', 'The Lantern'],
      ['5th', 'Barrow'],
    ]);
  });

  test('by any other column, orders for display only, and Place still reads by Fame', () => {
    renderGame(arranged(five));

    orderBy('Heroes');

    expect(within(table()).getByRole('columnheader', { name: 'Heroes' }).getAttribute('aria-sort')).toBe('descending');
    expect(within(table()).getByRole('columnheader', { name: 'Place by Fame' })).toBeDefined();
    expect(rows().map(({ name, cells: [place, , , , heroes] }) => [name, heroes, place])).toEqual([
      ['Ashford', '3', 'Joint 2nd'],
      ['Cinder', '3', '5th'],
      ['Barrow', '2', '4th'],
      ['The Lantern', '1', '1st'],
      ['Old Weir', '1', 'Joint 2nd'],
    ]);

    orderBy('Guild');
    expect(within(table()).getByRole('columnheader', { name: 'Guild' }).getAttribute('aria-sort')).toBe('ascending');
    expect(rows().map(({ name }) => name)).toEqual(['Ashford', 'Barrow', 'Cinder', 'Old Weir', 'The Lantern']);
  });

  test('a new game, every Guild at Fame 0, is joint 1st by Fame; by Wealth, each Guild has its place by Wealth', () => {
    renderGame(started());

    expect(rows().map(({ cells: [place] }) => place)).toEqual(Array(5).fill('Joint 1st'));
    orderBy('Wealth');
    const places = rows().map(({ cells: [place] }) => place);
    expect(places.every((place) => /^(joint )?\d(st|nd|rd|th)$/.test(place ?? ''))).toBe(true);
    expect(places[0]).toMatch(/^(joint )?1st$/);
  });

  test('lists a folded Guild last, with the Day it folded in place of a place', () => {
    renderGame(
      changed(started(), (document, player) => {
        const rival = Object.values(document.world.guilds).find((guild) => guild.id !== player.id);
        if (rival === undefined) throw new Error('no Rival');
        rival.foldedOnTurn = 7;
      }),
    );

    const all = rows();
    expect(all).toHaveLength(5);
    const last = all.at(-1);
    expect(last?.cells[0]).toBe('Folded on Year 1 Day 3');
    expect(last?.row.className).toBe('is-folded');
    expect(all.slice(0, 4).every(({ cells: [place] }) => place === 'Joint 1st')).toBe(true);
  });

  test('keeps its order in this browser', () => {
    renderGame(arranged(five));
    orderBy('Upkeep');
    expect(localStorage.getItem('heroesim.guildsOrder')).toBe('upkeep');
    cleanup();

    renderGame(arranged(five));
    expect(within(table()).getByRole('columnheader', { name: 'Upkeep' }).getAttribute('aria-sort')).toBe('descending');
  });
});

describe("a Guild's page (the review's B10)", () => {
  test("opens from its row: its Roster as a table with the Transfer fees and Take in, and its Hall and Guildmaster folded", () => {
    renderGame(started());
    const rival = rows().find(({ name }) => name === 'The Ashford Guild');
    if (rival === undefined) throw new Error('no Ashford');

    fireEvent.click(within(rival.row).getByRole('button', { name: 'Open The Ashford Guild' }));

    const page = within(section('Guilds')).getByRole('article');
    const heading = within(page).getByRole('heading', { level: 4, name: 'The Ashford Guild' });
    expect(document.activeElement).toBe(heading);
    expect(within(page).getByText(/^Rival \(\w+\) · .+$/)).toBeDefined();
    const roster = within(page).getByRole('table', { name: 'The Roster of The Ashford Guild' });
    expect(within(roster).getAllByRole('columnheader').map((header) => header.textContent)).toEqual(['Name', 'Class', 'Level', 'Age', 'Transfer fee', 'Take in']);
    const heroes = within(roster).getAllByTestId('guild-hero');
    expect(heroes.length).toBeGreaterThan(0);
    for (const hero of heroes) {
      const name = within(hero).getByRole('rowheader').textContent ?? '';
      // Their thumbnail before their name, hidden from a screen reader, which reads the name (DL-147).
      const thumb = within(hero).getByTestId('portrait-thumb');
      expect(thumb.getAttribute('aria-hidden')).toBe('true');
      expect(thumb.compareDocumentPosition(within(hero).getByRole('button', { name })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(Number.isSafeInteger(silverOf(within(hero).getByTestId('fee')))).toBe(true);
      expect(within(hero).getByRole('button', { name: `Take ${name} in` })).toBeDefined();
    }
    // Folded: a disclosure each, closed.
    const folds = Array.from(page.querySelectorAll(':scope > details.disclosure'));
    expect(folds.map((fold) => fold.querySelector('summary')?.textContent)).toEqual(['Hall', expect.stringMatching(/^Guildmaster: .+$/)]);
    expect(folds.every((fold) => !(fold as HTMLDetailsElement).open)).toBe(true);
    // The facility names are no longer headings too small to read.
    expect(within(page).queryByRole('heading', { name: /^(Infirmary|Training yard|Quarters)/ })).toBeNull();

    // A Hero opens their page, and back returns the keyboard to their row.
    const first = within(heroes[0] as HTMLElement).getByRole('rowheader').textContent ?? '';
    fireEvent.click(within(section('Guilds')).getByRole('button', { name: first }));
    expect(within(section('Guilds')).getByRole('heading', { level: 4, name: first })).toBeDefined();
    fireEvent.click(within(section('Guilds')).getByRole('button', { name: 'Back to The Ashford Guild' }));
    expect(document.activeElement).toBe(within(section('Guilds')).getByRole('button', { name: first }));

    fireEvent.click(within(section('Guilds')).getByRole('button', { name: 'Back to the Guilds' }));
    expect(document.activeElement).toBe(within(table()).getByRole('button', { name: 'Open The Ashford Guild' }));
  });

  test("the player's own Guild opens too, its Roster with no fees", () => {
    renderGame(started());

    fireEvent.click(within(table()).getByRole('button', { name: 'Open The Lantern' }));

    const page = within(section('Guilds')).getByRole('article');
    expect(within(page).getByText(/^Yours · .+$/)).toBeDefined();
    const roster = within(page).getByRole('table', { name: 'The Roster of The Lantern' });
    expect(within(roster).getAllByRole('columnheader').map((header) => header.textContent)).toEqual(['Name', 'Class', 'Level', 'Age']);
    expect(within(roster).queryByRole('button', { name: /^Take / })).toBeNull();
    const heroes = within(roster).getAllByTestId('guild-hero');
    expect(heroes.every((hero) => within(hero).queryByTestId('portrait-thumb') !== null)).toBe(true);
  });
});

describe("the Patrons as one table (the review's B5)", () => {
  test("give each Patron's Sphere, their Regard for the Guild, the Guildmaster's for them, and their Quests on the Board, the neutral folded", () => {
    const state = changed(started(), (document, player) => {
      const guildmaster = document.world.guildmasters[player.guildmasterId];
      const [cold, liked] = Object.values(document.world.patrons);
      if (guildmaster === undefined || cold === undefined || liked === undefined) throw new Error('no Guildmaster or Patrons');
      cold.regard[player.id] = { value: -30, since: 0, reason: 'test' };
      guildmaster.regard[liked.id] = { value: 20, since: 0, reason: 'test' };
    });
    renderGame(state);
    const patrons = section('Patrons');
    const all = (): HTMLElement[] => within(section('Patrons')).queryAllByTestId('patron');
    const shown = (): HTMLElement[] => within(section('Patrons')).queryAllByRole('row').filter((row) => row.dataset.testid === 'patron');

    expect(within(within(patrons).getByRole('table', { name: 'The Patrons' })).getAllByRole('columnheader').map((header) => header.textContent)).toEqual([
      'Patron',
      'Sphere',
      'Their Regard for The Lantern',
      'Your Guildmaster’s Regard',
      'Quests on the Board',
    ]);
    // Two Patrons with a Regard that is not neutral; the rest folded under their count.
    expect(shown().map((row) => within(row).getAllByRole('cell').slice(1, 3).map((cell) => cell.textContent))).toEqual([
      ['Hostile', 'Neutral'],
      ['Neutral', 'Close'],
    ]);
    expect(within(shown()[0] as HTMLElement).getByText('Hostile').closest('.chip')?.className).toBe('chip chip--bad');
    const fold = within(patrons).getByRole('button', { name: `${all().length - 2} neutral` });
    expect(fold.getAttribute('aria-expanded')).toBe('false');

    fireEvent.click(fold);

    expect(fold.getAttribute('aria-expanded')).toBe('true');
    expect(shown()).toHaveLength(all().length);
    // Their Quests on the Board now: as many as the Board has.
    const onTheBoard = shown().reduce((sum, row) => sum + Number(within(row).getAllByRole('cell').at(-1)?.textContent), 0);
    const board = openView('Board');
    expect(within(board).getAllByRole('article')).toHaveLength(onTheBoard);
  });
});
