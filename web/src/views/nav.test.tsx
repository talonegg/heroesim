import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { App } from '../app';
import { started } from '../state/game.test-support';
import { Nav } from './nav';
import { nav, navButton, openView, type ViewName } from './page.test-support';

// The navigation of seven views (DL-112 item 5, DL-113 item 1): the Guildmaster at the top,
// named by the player's Guildmaster's name, then Guild, Roster, Board, Rankings, Market and History.
// One order at every width: on a phone the bar holds Guild, Roster, Board and Rankings, and "More"
// holds the Guildmaster, the Market and the History, in the same order; from 600px all seven show
// (the stylesheet's, `nav__item--wide`).

afterEach(cleanup);

const noCounts = { quests: 0, offers: 0, fresh: 0 };

/** The navigation's own items, in its list, More apart. */
function items(): HTMLElement[] {
  return Array.from(nav().querySelectorAll<HTMLElement>('.nav__list > .nav__item:not(.nav__item--more)'));
}

describe('the navigation', () => {
  test('holds the seven views in one order: the Guildmaster, Guild, Roster, Board, Rankings, Market and History', () => {
    render(<App initial={started()} />);

    expect(items().map((item) => /nav__item--([a-z]+)/.exec(item.className)?.[1])).toEqual([
      'guildmaster',
      'guild',
      'roster',
      'board',
      'rankings',
      'market',
      'history',
    ]);
    expect(items().map((item) => item.querySelector('.nav__label')?.textContent)).toEqual([
      'Ada Vell',
      'Guild',
      'Roster',
      'Board',
      'Rankings',
      'Market',
      'History',
    ]);
    // There is no Hall view (DL-111 item 7).
    expect(within(nav()).queryByRole('button', { name: /^Hall/ })).toBeNull();
  });

  test("the Guildmaster's label is the player's Guildmaster's name, described as \"Guildmaster\", and opens the Guildmaster view", () => {
    render(<App initial={started()} />);

    const button = navButton('Guildmaster');
    expect(button).toHaveProperty('textContent', 'Ada Vell');
    expect(within(nav()).getByRole('button', { name: 'Ada Vell', description: 'Guildmaster' })).toBe(button);
    fireEvent.click(button);
    expect(button.getAttribute('aria-current')).toBe('page');
    expect(document.activeElement).toBe(screen.getByRole('heading', { level: 2, name: 'Guildmaster' }));
  });

  test('before a game, the label reads "Guildmaster"', () => {
    render(<Nav current="guild" counts={noCounts} guildmasterName={null} onOpen={vi.fn()} />);

    expect(navButton('Guildmaster').querySelector('.nav__label')?.textContent).toBe('Guildmaster');
  });

  test('on a phone the bar holds Guild, Roster, Board and Rankings; More holds the Guildmaster, the Market and the History', () => {
    render(<App initial={started()} />);

    const inBar = items().filter((item) => !item.classList.contains('nav__item--wide'));
    expect(inBar.map((item) => item.querySelector('.nav__label')?.textContent)).toEqual(['Guild', 'Roster', 'Board', 'Rankings']);

    fireEvent.click(within(nav()).getByRole('button', { name: /^More/ }));
    const more = nav().querySelector('#nav-more') as HTMLElement;
    expect(within(more).getAllByRole('button').map((button) => button.querySelector('.nav__label')?.textContent)).toEqual([
      'Ada Vell',
      'Market',
      'History',
    ]);
    // A view opened from More marks More as the place the player is.
    fireEvent.click(within(more).getByRole('button', { name: /^Market/ }));
    expect(screen.getByRole('region', { name: 'Market' })).toBeDefined();
    expect(within(nav()).getByRole('button', { name: /^More/ }).classList.contains('is-current')).toBe(true);
  });

  test('each of the seven opens from the navigation with its heading focused and aria-current set', () => {
    render(<App initial={started()} />);
    const views: readonly ViewName[] = ['Guildmaster', 'Guild', 'Roster', 'Board', 'Rankings', 'Market', 'History'];

    for (const view of views) {
      const region = openView(view);
      expect(document.activeElement, view).toBe(within(region).getByRole('heading', { level: 2, name: view }));
      expect(navButton(view).getAttribute('aria-current'), view).toBe('page');
    }
  });
});

describe('what More holds that is new (the code review)', () => {
  test('More carries a dot, and says in words how many History entries are new, while the History under it has any', () => {
    const { unmount } = render(<Nav current="guild" counts={{ ...noCounts, fresh: 3 }} guildmasterName="Ada Vell" onOpen={vi.fn()} />);
    const more = within(nav()).getByRole('button', { name: /^More/ });
    expect(more.textContent).toBe('More, 3 new in the History');
    expect(more.querySelector('.dot')).not.toBeNull();
    unmount();

    render(<Nav current="guild" counts={noCounts} guildmasterName="Ada Vell" onOpen={vi.fn()} />);
    const quiet = within(nav()).getByRole('button', { name: /^More/ });
    expect(quiet.textContent).toBe('More');
    expect(quiet.querySelector('.dot')).toBeNull();
  });
});
