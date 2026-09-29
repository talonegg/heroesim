import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, test } from 'vitest';
import { App } from '../app';
import { cameHome, played, started, withPartyOut } from '../state/game.test-support';
import { historyLines, inHistory, openDebugHistory, openMenu, openView } from './page.test-support';

// The game menu's debug view (M9-F4, DL-111 item 4, DL-112 item 7, DL-117): "Debug: Whole History"
// (the owner's words, DL-120 item 1) is the menu's last control. It closes the menu and opens the History view on every entry,
// unfiltered and unfolded, each with its event type, with the keyboard on its title.

afterEach(cleanup);

describe('the game menu’s debug view (M9-F4)', () => {
  test('is the last control of the menu, after the game file', () => {
    render(<App initial={started()} />);
    const menu = openMenu();
    const controls = within(menu).getAllByRole('button');

    expect(controls.at(-1)?.textContent).toBe('Debug: Whole History');
    // After what concerns the game: the game file's region comes before it.
    const file = within(menu).getByRole('region', { name: 'This game' });
    expect(file.compareDocumentPosition(controls.at(-1) as HTMLElement) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  test('opens every entry with its type, folding nothing, the menu closed and the keyboard on the title, from any view', () => {
    const state = played(cameHome(started('reducer-test')), { kind: 'advance', turns: 1 });
    const entries = state.document?.history.entries.length ?? 0;
    render(<App initial={state} />);
    openView('Board');

    fireEvent.click(within(openMenu()).getByRole('button', { name: 'Debug: Whole History' }));

    expect(screen.queryByRole('dialog', { name: 'Game' })).toBeNull();
    const history = screen.getByRole('region', { name: 'History' });
    const title = within(history).getByRole('heading', { level: 3, name: 'Debug: Whole History' });
    expect(document.activeElement).toBe(title);
    // Every entry: the History's whole length, each new one of the last play counted.
    const summary = within(history).getByText(/^Page 1 of \d+, /).textContent;
    expect(summary).toMatch(new RegExp(`^Page 1 of \\d+, ${entries} entries in all, newest first\\. ${state.log.length} new since your last action\\.$`));
    const lines = historyLines(history);
    expect(lines).toHaveLength(20);
    expect(lines.every((line) => /^[a-z-]+\.[a-z-]+$/.test(line.querySelector('.entry__type')?.textContent ?? ''))).toBe(true);
    expect(history.querySelectorAll('.fold, .entry--routine')).toHaveLength(0);
  });

  test("a Hero's page opened from it goes back to it by its name: \"Back to Debug: Whole History\" (M9-F7, DL-120 item 1)", () => {
    render(<App initial={withPartyOut(started())} />);
    openDebugHistory();
    const sent = inHistory(/^The Lantern sent .+ on .+, back on the night of Day \d+\.$/);
    const [, hero] = within(sent).getAllByRole('button');

    fireEvent.click(hero as HTMLElement);
    const history = screen.getByRole('region', { name: 'History' });
    fireEvent.click(within(history).getByRole('button', { name: 'Back to Debug: Whole History' }));

    expect(within(history).getByRole('heading', { level: 3 }).textContent).toBe('Debug: Whole History');
  });
});
