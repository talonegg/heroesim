import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { App } from '../app';
import { started, withPartyOut, withWealth } from '../state/game.test-support';
import { navButton, openView } from './page.test-support';

// The home view's report of a Party home is `quest-report.test.tsx`'s (M9-F5), which took the place
// of the outcome cards' tests.

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  localStorage.clear();
});

// The Guild in parts (M9-F2, DL-111 item 5, DL-112 item 5): tabs under the view's heading, Home,
// Hall, and from M9-F3 Stores and Treasury (DL-116), following the ARIA tabs pattern: one tab in the Tab
// order, the arrow keys, Home and End moving between them, and the part open remembered in this
// browser.
describe("the Guild's parts (M9-F2)", () => {
  function guild(): HTMLElement {
    return screen.getByRole('region', { name: 'Guild' });
  }

  function tabs(): HTMLElement[] {
    return within(within(guild()).getByRole('tablist', { name: 'The Guild’s parts' })).getAllByRole('tab');
  }

  async function idle(): Promise<void> {
    await waitFor(() => expect(document.querySelector('main')?.getAttribute('aria-busy')).toBe('false'));
  }

  test('are tabs under the heading, Home open at first; a tab opens its part by pointer', () => {
    render(<App initial={started()} />);

    expect(tabs().map((tab) => tab.textContent)).toEqual(['Home', 'Hall', 'Stores', 'Treasury']);
    expect(tabs().map((tab) => tab.getAttribute('aria-selected'))).toEqual(['true', 'false', 'false', 'false']);
    const home = within(guild()).getByRole('tabpanel', { name: 'Home' });
    expect(within(home).getByText(/^Nothing is waiting on you\./)).toBeDefined();
    // The panel is the one its tab controls.
    expect(tabs()[0]?.getAttribute('aria-controls')).toBe(home.id);

    fireEvent.click(within(guild()).getByRole('tab', { name: 'Hall' }));

    expect(tabs().map((tab) => tab.getAttribute('aria-selected'))).toEqual(['false', 'true', 'false', 'false']);
    const hall = within(guild()).getByRole('tabpanel', { name: 'Hall' });
    expect(within(hall).getAllByTestId('facility')).toHaveLength(3);
    expect(within(guild()).queryByRole('tabpanel', { name: 'Home' })).toBeNull();
    // The Upkeep sentence left the Hall for the Treasury (M9-F3).
    expect(within(hall).queryByText(/^Upkeep of The Lantern:/)).toBeNull();

    fireEvent.click(within(guild()).getByRole('tab', { name: 'Stores' }));
    expect(within(guild()).getByRole('tabpanel', { name: 'Stores' })).toBeDefined();
    fireEvent.click(within(guild()).getByRole('tab', { name: 'Treasury' }));
    expect(within(within(guild()).getByRole('tabpanel', { name: 'Treasury' })).getByText(/^Upkeep of The Lantern:/)).toBeDefined();
  });

  test('the arrow keys, Home and End move between the tabs and open each; only the open one is in the Tab order', () => {
    render(<App initial={started()} />);
    const [home, hall] = tabs();
    if (home === undefined || hall === undefined) throw new Error('four tabs wanted');
    expect(home.getAttribute('tabindex')).toBe('0');
    expect(hall.getAttribute('tabindex')).toBe('-1');
    home.focus();

    fireEvent.keyDown(home, { key: 'ArrowRight' });
    expect(document.activeElement).toBe(tabs()[1]);
    expect(tabs()[1]?.getAttribute('aria-selected')).toBe('true');
    expect(tabs()[1]?.getAttribute('tabindex')).toBe('0');
    expect(tabs()[0]?.getAttribute('tabindex')).toBe('-1');

    // Round from the last to the first, and back.
    fireEvent.keyDown(tabs()[1] as HTMLElement, { key: 'End' });
    expect(document.activeElement).toBe(tabs()[3]);
    expect(within(guild()).getByRole('tabpanel', { name: 'Treasury' })).toBeDefined();
    fireEvent.keyDown(tabs()[3] as HTMLElement, { key: 'ArrowRight' });
    expect(document.activeElement).toBe(tabs()[0]);
    fireEvent.keyDown(tabs()[0] as HTMLElement, { key: 'ArrowLeft' });
    expect(document.activeElement).toBe(tabs()[3]);
    fireEvent.keyDown(tabs()[3] as HTMLElement, { key: 'Home' });
    expect(tabs()[0]?.getAttribute('aria-selected')).toBe('true');
    fireEvent.keyDown(tabs()[0] as HTMLElement, { key: 'ArrowRight' });
    fireEvent.keyDown(tabs()[1] as HTMLElement, { key: 'ArrowRight' });
    expect(tabs()[2]?.getAttribute('aria-selected')).toBe('true');
    expect(within(guild()).getByRole('tabpanel', { name: 'Stores' })).toBeDefined();
  });

  test('the part open is remembered in this browser, and the Guild opens at it again', async () => {
    const { unmount } = render(<App initial={started()} />);
    fireEvent.click(within(guild()).getByRole('tab', { name: 'Hall' }));
    await waitFor(() => expect(localStorage.getItem('heroesim.guildPart')).toBe('hall'));
    openView('Board');
    // The navigation's Guild opens the part last open.
    openView('Guild');
    expect(within(guild()).getByRole('tab', { name: 'Hall' }).getAttribute('aria-selected')).toBe('true');
    unmount();

    render(<App initial={started()} />);
    expect(within(guild()).getByRole('tabpanel', { name: 'Hall' })).toBeDefined();
  });

  test('a view remembered as "hall", from before M9-F2, opens the Guild at its Hall part', () => {
    localStorage.setItem('heroesim.view', 'hall');
    render(<App initial={started()} />);

    expect(navButton('Guild').getAttribute('aria-current')).toBe('page');
    expect(within(guild()).getByRole('tabpanel', { name: 'Hall' })).toBeDefined();
  });

  test("the status bar's Bankruptcy countdown opens the Guild at its Home, where the countdown is said in full, from any part and view", () => {
    render(<App initial={withWealth(started(), -100, 0)} />);
    fireEvent.click(within(guild()).getByRole('tab', { name: 'Hall' }));
    openView('Market');

    fireEvent.click(screen.getByTestId('countdown'));

    expect(navButton('Guild').getAttribute('aria-current')).toBe('page');
    const home = within(guild()).getByRole('tabpanel', { name: 'Home' });
    expect(within(home).getByText(/has been below the Bankruptcy floor since Day 0/)).toBeDefined();
    expect(document.activeElement).toBe(within(guild()).getByRole('heading', { level: 2, name: 'Guild' }));
  });

  test('the end of a fast forward, and a way to the home view, open the Guild at its Home: at the report of a Party home (M9-F5)', async () => {
    render(<App initial={withPartyOut(started('reducer-test'))} />);
    fireEvent.click(within(guild()).getByRole('tab', { name: 'Hall' }));

    fireEvent.click(screen.getByRole('button', { name: 'Fast forward' }));
    await idle();

    expect(within(guild()).getByRole('tab', { name: 'Home' }).getAttribute('aria-selected')).toBe('true');
    expect(within(guild()).getByTestId('stop')).toBeDefined();
    // The keyboard moves in an effect after the play's render, which a busy machine may paint first.
    await waitFor(() => expect(document.activeElement).toBe(within(guild()).getByRole('heading', { level: 3, name: /^Quest report: / })));
  });
});
