import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { App } from '../app';
import { cameHome, namesakes, started, withNamesakesHurt, withPartyOut } from '../state/game.test-support';
import { headerView } from '../state/selectors';
import { GuildView } from './guild';
import { navButton, openView } from './page.test-support';

// The home view's outcome cards (M9-S3, DL-103). A Hero's name is not unique (`drawPersonName`
// avoids no name in use), so each death and Injury on a card is its own line, keyed by its Hero
// (the M9 review).

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  localStorage.clear();
});

describe('a Party that came home', () => {
  test('shows each of two Heroes of one name who died, and each of two injured, as a line of its own', () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const state = withNamesakesHurt(cameHome(started('reducer-test')));
    if (state.document === null) throw new Error('no game in hand');
    const header = headerView(state.document);
    if (header === null) throw new Error("no player's Guild");

    render(
      <GuildView
        state={state}
        document={state.document}
        header={header}
        notice={null}
        stop={null}
        busy={false}
        play={vi.fn()}
        onGo={vi.fn()}
        onOpenQuest={vi.fn()}
        onOpenMenu={vi.fn()}
      />,
    );

    const [card] = screen.getAllByRole('listitem').filter((item) => item.classList.contains('outcome'));
    if (card === undefined) throw new Error('no outcome shown');
    expect(within(card).getAllByText(`${namesakes.diedName} died on the Quest`)).toHaveLength(2);
    expect(within(card).getAllByText(new RegExp(`^${namesakes.injuredName}: `))).toHaveLength(2);
    // React says so when two lines share a key: none do.
    expect(errors.mock.calls.flat().join(' ')).not.toMatch(/same key/);
  });
});

// The Guild in parts (M9-F2, DL-111 item 5, DL-112 item 5): tabs under the view's heading, Home and
// Hall (Stores and Treasury come with M9-F3), following the ARIA tabs pattern: one tab in the Tab
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

    expect(tabs().map((tab) => tab.textContent)).toEqual(['Home', 'Hall']);
    expect(tabs().map((tab) => tab.getAttribute('aria-selected'))).toEqual(['true', 'false']);
    const home = within(guild()).getByRole('tabpanel', { name: 'Home' });
    expect(within(home).getByText(/^Nothing is waiting on you\./)).toBeDefined();
    // The panel is the one its tab controls.
    expect(tabs()[0]?.getAttribute('aria-controls')).toBe(home.id);

    fireEvent.click(within(guild()).getByRole('tab', { name: 'Hall' }));

    expect(tabs().map((tab) => tab.getAttribute('aria-selected'))).toEqual(['false', 'true']);
    const hall = within(guild()).getByRole('tabpanel', { name: 'Hall' });
    expect(within(hall).getAllByTestId('facility')).toHaveLength(3);
    expect(within(guild()).queryByRole('tabpanel', { name: 'Home' })).toBeNull();
    // The Upkeep sentence stays in the Hall until M9-F3 moves it.
    expect(within(hall).getByText(/^Upkeep of The Lantern:/)).toBeDefined();
  });

  test('the arrow keys, Home and End move between the tabs and open each; only the open one is in the Tab order', () => {
    render(<App initial={started()} />);
    const [home, hall] = tabs();
    if (home === undefined || hall === undefined) throw new Error('two tabs wanted');
    expect(home.getAttribute('tabindex')).toBe('0');
    expect(hall.getAttribute('tabindex')).toBe('-1');
    home.focus();

    fireEvent.keyDown(home, { key: 'ArrowRight' });
    expect(document.activeElement).toBe(tabs()[1]);
    expect(tabs()[1]?.getAttribute('aria-selected')).toBe('true');
    expect(tabs()[1]?.getAttribute('tabindex')).toBe('0');
    expect(tabs()[0]?.getAttribute('tabindex')).toBe('-1');

    // Round from the last to the first, and back.
    fireEvent.keyDown(tabs()[1] as HTMLElement, { key: 'ArrowRight' });
    expect(document.activeElement).toBe(tabs()[0]);
    fireEvent.keyDown(tabs()[0] as HTMLElement, { key: 'ArrowLeft' });
    expect(document.activeElement).toBe(tabs()[1]);
    fireEvent.keyDown(tabs()[1] as HTMLElement, { key: 'Home' });
    expect(tabs()[0]?.getAttribute('aria-selected')).toBe('true');
    fireEvent.keyDown(tabs()[0] as HTMLElement, { key: 'End' });
    expect(tabs()[1]?.getAttribute('aria-selected')).toBe('true');
    expect(within(guild()).getByRole('tabpanel', { name: 'Hall' })).toBeDefined();
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

  test('the end of a fast forward, and a way to the home view, open the Guild at its Home', async () => {
    render(<App initial={withPartyOut(started('reducer-test'))} />);
    fireEvent.click(within(guild()).getByRole('tab', { name: 'Hall' }));

    fireEvent.click(screen.getByRole('button', { name: 'Fast forward' }));
    await idle();

    expect(within(guild()).getByRole('tab', { name: 'Home' }).getAttribute('aria-selected')).toBe('true');
    expect(within(guild()).getByTestId('stop')).toBeDefined();
    expect(document.activeElement).toBe(within(guild()).getByRole('heading', { level: 2, name: 'Guild' }));
  });
});
