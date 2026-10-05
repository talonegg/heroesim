import type * as Engine from '@heroesim/engine';
import { statBreakdown } from '@heroesim/engine';
import { cleanup, fireEvent, render, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { App } from '../app';
import { rosterList, section } from '../views/page.test-support';
import { played, started } from './game.test-support';
import type * as Selectors from './selectors';
import { rosterRows, rosterSortChoices, sortedRoster } from './selectors';

// v1.1.6-S13 (DL-186 item 22): the Roster's rows apart from their sorting. The rows are built once for
// a document (`rosterRows`) and a new sort only sorts them (`sortedRoster`). A build reads each Hero's
// Stats through the engine's `statBreakdown` once, so its calls count the builds: the engine's entry
// is wrapped in a spy that calls the real one.
vi.mock('@heroesim/engine', async (importOriginal) => {
  const engine = await importOriginal<typeof Engine>();
  return { ...engine, statBreakdown: vi.fn(engine.statBreakdown) };
});
// The sorts too, so that a test can count them (v1.1.6-S19, DL-205).
vi.mock('./selectors', async (importOriginal) => {
  const selectors = await importOriginal<typeof Selectors>();
  return { ...selectors, sortedRoster: vi.fn(selectors.sortedRoster) };
});

const breakdowns = vi.mocked(statBreakdown);
const sorts = vi.mocked(sortedRoster);

beforeEach(() => {
  breakdowns.mockClear();
  sorts.mockClear();
});

afterEach(cleanup);

/** The game's document. */
function documentOf(state: ReturnType<typeof started>): Engine.WorldDocument {
  if (state.document === null) throw new Error('no game');
  return state.document;
}

describe("the Roster's rows, built once for a document (v1.1.6-S13)", () => {
  test('are the same rows for the same document, built once, and new rows for a new one', () => {
    const state = started();
    const document = documentOf(state);

    const rows = rosterRows(document);
    const heroes = rows.entries.length;
    expect(heroes).toBeGreaterThan(2);
    expect(breakdowns).toHaveBeenCalledTimes(heroes);
    expect(rosterRows(document)).toBe(rows);
    expect(breakdowns).toHaveBeenCalledTimes(heroes);

    // A play gives a new document, and its rows are built for it.
    const next = documentOf(played(state, { kind: 'advance' }));
    expect(rosterRows(next)).not.toBe(rows);
    expect(breakdowns).toHaveBeenCalledTimes(heroes + rosterRows(next).entries.length);
  });

  test('a re-sort builds nothing: every sort, either way, gives the rows already built', () => {
    const document = documentOf(started());
    const rows = rosterRows(document);
    const built = rows.entries.map((entry) => entry.row);
    const joined = Object.values(document.world.guilds).find((guild) => guild.controller.kind === 'player')?.rosterIds;
    expect(built.map((row) => row.heroId)).toEqual(joined);
    breakdowns.mockClear();

    for (const { key } of rosterSortChoices()) {
      for (const direction of ['ascending', 'descending'] as const) {
        const sorted = sortedRoster(rows, { key, direction });
        expect(sorted).toHaveLength(built.length);
        for (const row of sorted) expect(built).toContain(row);
        // Sorting leaves the rows built in the order the Heroes joined.
        expect(rows.entries.map((entry) => entry.row.heroId), `${key} ${direction}`).toEqual(joined);
      }
    }
    expect(breakdowns).not.toHaveBeenCalled();
  });

  test('the Roster view: a new sort or its direction builds no row again, and the order changes', () => {
    render(<App initial={started()} />);
    const names = (): string[] => within(rosterList()).getAllByRole('listitem').map((card) => within(card).getByRole('button').textContent ?? '');
    const byDefault = names();
    const calls = breakdowns.mock.calls.length;

    fireEvent.change(within(section('Roster')).getByRole('combobox', { name: 'Sort by' }), { target: { value: 'name' } });
    expect(names()).toEqual([...byDefault].sort());
    fireEvent.click(within(section('Roster')).getByTestId('roster-direction'));
    expect(names()).toEqual([...byDefault].sort().reverse());

    expect(breakdowns.mock.calls.length).toBe(calls);
  });

  // v1.1.6-S19 (DL-205): the sort in force is one value while it is kept, so a render for another
  // reason sorts nothing again.
  test('the Roster view: a render for another reason, the Columns opened and closed, sorts nothing again', () => {
    render(<App initial={started()} />);
    const roster = section('Roster');
    fireEvent.click(within(roster).getByRole('button', { name: 'Table' }));
    const sorted = sorts.mock.calls.length;
    expect(sorted).toBeGreaterThan(0);

    const columns = within(roster).getByRole('button', { name: 'Columns' });
    fireEvent.click(columns);
    expect(columns.getAttribute('aria-expanded')).toBe('true');
    fireEvent.click(columns);
    expect(columns.getAttribute('aria-expanded')).toBe('false');
    expect(sorts.mock.calls.length).toBe(sorted);

    fireEvent.click(within(roster).getByTestId('roster-direction'));
    expect(sorts.mock.calls.length).toBe(sorted + 1);
  });
});
