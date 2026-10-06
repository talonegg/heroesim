import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, test } from 'vitest';
import { App } from '../app';
import { changed, holding, started, withPartyOut, withRosterReleased } from '../state/game.test-support';
import { navButton, openView, section, time } from './page.test-support';

// The page's side of #32 (M9-S7): the split button's opt-in stops, "until a Quest you can staff
// appears" (`quest-staffable`, M9-S1) beside "until new Heroes join the pool"; the words that say
// which stops are always on; and the Bankruptcy stop (`below-floor`) in the home view, a warning
// card with the Day it falls on, what can be done, and the ways to what the Guild holds and the Board. Driven
// through the page's own controls.

afterEach(cleanup);

async function idle(): Promise<void> {
  await waitFor(() => expect(document.querySelector('main')?.getAttribute('aria-busy')).toBe('false'));
}

/** The sentence that says what a region or group is for: its accessible description. */
function described(element: HTMLElement): string {
  const ids = element.getAttribute('aria-describedby')?.split(' ') ?? [];
  return ids.map((id) => document.getElementById(id)?.textContent ?? '').join(' ').trim();
}

/** The status bar's other ways to fast forward, opened. */
function otherWays(): HTMLElement {
  fireEvent.click(within(time()).getByRole('button', { name: 'More ways to Fast forward' }));
  const ways = document.getElementById('fast-forward-ways');
  if (ways === null) throw new Error('the other ways to fast forward did not open');
  return ways;
}

describe('the ways to fast forward (M9-S7, #32)', () => {
  test('the split button offers "until a Quest you can staff appears" beside "until new Heroes join the pool", and says which stops are always on', () => {
    render(<App initial={started()} />);
    const ways = otherWays();

    expect(within(ways).getAllByRole('button').map((button) => button.textContent)).toEqual([
      'Fast forward until a Quest you can staff appears',
      'Fast forward until new Heroes join the pool',
    ]);
    expect(ways.textContent).toContain(
      'Fast forward stops of its own accord when a Party of yours comes home, a decision is needed, a Transfer Offer ' +
        'arrives, your Guild falls below the Bankruptcy floor or the game ends.',
    );
    expect(ways.textContent).toContain('A Quest you can staff is one the Heroes at home could take, even with a Party out.');
  });

  test("the time controls' words and the home view's name every stop the page offers", () => {
    render(<App initial={started()} />);

    const words = described(time());
    for (const stop of [
      'a Party of yours comes home',
      'a decision is needed',
      'a Transfer Offer arrives',
      'your Guild falls below the Bankruptcy floor',
      'the game ends',
      'a Quest the Heroes at home can staff appears, even with a Party out',
      'new Heroes join the Unattached pool',
    ]) {
      expect(words, stop).toContain(stop);
    }
    // The Guild's Home says it, a part of the Guild since M9-F2.
    expect(described(section('Home'))).toContain('the Bankruptcy countdown while your Guild is below the floor');
  });

  test('with a Party out, "until a Quest you can staff appears" stops before it is home, and each Quest it names opens its Party on the Board', async () => {
    render(<App initial={withPartyOut(started('reducer-test'))} />);

    fireEvent.click(within(otherWays()).getByRole('button', { name: 'Fast forward until a Quest you can staff appears' }));
    await idle();

    const stop = screen.getByTestId('stop');
    const sentence = within(stop).getByText(/^Stopped: a Quest to staff: The Lantern's Heroes at home could go on .+\.$/).textContent ?? '';
    // The Party is still out.
    expect(within(openView('Guild')).getByRole('heading', { level: 3, name: 'Parties out' })).toBeDefined();
    const [first] = within(screen.getByTestId('stop')).getAllByRole('button', { name: /^Choose a Party for .+, offered by .+, for \d+ Wealth$/ });
    const questName = first?.querySelector('.quest-button__name')?.textContent ?? '';
    expect(sentence).toContain(questName);

    fireEvent.click(first as HTMLElement);

    expect(navButton('Board').getAttribute('aria-current')).toBe('page');
    const heading = document.activeElement as HTMLElement;
    expect(heading.tagName).toBe('H3');
    expect(heading.textContent).toBe(questName);
    expect(within(heading.closest('article') as HTMLElement).getByRole('form', { name: `A Party for ${questName}` })).toBeDefined();
  });
});

describe('the Bankruptcy stop in the home view (M9-S7, #32)', () => {
  test('falling below the floor stops a fast forward unasked: one warning card, with the Day Bankruptcy falls on and what can be done', async () => {
    render(<App initial={changed(started(), (_, player) => void (player.wealth = -1))} />);
    openView('Roster');

    fireEvent.click(screen.getByRole('button', { name: 'Fast forward' }));
    await idle();

    // The fast forward ended on the home view, where the card stands.
    expect(navButton('Guild').getAttribute('aria-current')).toBe('page');
    const stop = screen.getByTestId('stop');
    expect(stop.classList.contains('stop--warning')).toBe(true);
    const due = screen.getByTestId('countdown').textContent ?? '';
    expect(due).toMatch(/^Bankruptcy on the night of Year \d+ Day \d+$/);
    expect(within(stop).getByText(/^Stopped: The Lantern fell below the Bankruptcy floor: .+\.$/).textContent).toContain(due);
    expect(stop.textContent).toContain('Sell what the Guild holds at the Market, or send a Party on a Quest');
    // The countdown's own banner would say the same Day again: the card stands in its place.
    const home = screen.getByRole('region', { name: 'Guild' });
    expect(within(home).queryByText(/has been below the Bankruptcy floor since/)).toBeNull();
  });

  test("goes to the Market's Sell, and to the Board; after the next play, the countdown stands as before (M9-F2)", async () => {
    // Something to sell.
    render(<App initial={changed(holding(started(), 'healing-draught', 2), (_, player) => void (player.wealth = -1))} />);
    fireEvent.click(screen.getByRole('button', { name: 'Fast forward' }));
    await idle();

    fireEvent.click(within(screen.getByTestId('stop')).getByRole('button', { name: 'Sell what the Guild holds' }));
    expect(navButton('Market').getAttribute('aria-current')).toBe('page');
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('heading', { level: 3, name: 'Sell' })));
    expect(within(screen.getByRole('region', { name: 'Sell' })).getByRole('button', { name: 'Sell Healing draught' })).toBeDefined();

    openView('Guild');
    fireEvent.click(within(screen.getByTestId('stop')).getByRole('button', { name: 'Open the Board' }));
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('heading', { level: 2, name: 'Board' })));

    openView('Guild');
    fireEvent.click(screen.getByRole('button', { name: 'Advance a Turn' }));
    await idle();
    const home = openView('Guild');
    expect(screen.queryByTestId('stop')).toBeNull();
    expect(within(home).getByText(/^The Lantern has been below the Bankruptcy floor since Year \d+ Day \d+: Bankruptcy on the night of Year \d+ Day \d+ /)).toBeDefined();
  });
});

describe("the pool's stop and the end, through a fast forward (M9-S8, the epic's §3)", () => {
  test('"until new Heroes join the pool" plays until the pool turns over, names who joined, and its step opens the pool', async () => {
    // No Hero on the Roster: no Party comes home, no decision is needed and no offer made.
    render(<App initial={withRosterReleased(started())} />);

    fireEvent.click(within(otherWays()).getByRole('button', { name: 'Fast forward until new Heroes join the pool' }));
    await idle();

    expect(navButton('Guild').getAttribute('aria-current')).toBe('page');
    const stop = screen.getByTestId('stop');
    expect(within(stop).getByText(/^Stopped: new in the Unattached pool: .+\.$/)).toBeDefined();
    fireEvent.click(within(stop).getByRole('button', { name: 'See who joined the pool' }));
    expect(navButton('Roster').getAttribute('aria-current')).toBe('page');
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('heading', { level: 3, name: 'Unattached pool' })));
  });

  test('a game that ends in a fast forward stops it: the home view says how, and time stands still', async () => {
    // No Hero on the Roster and no Wealth to sign one: the first night wipes the Roster out.
    render(<App initial={withRosterReleased(started(), 0)} />);

    fireEvent.click(screen.getByRole('button', { name: 'Fast forward' }));
    await idle();

    expect(navButton('Guild').getAttribute('aria-current')).toBe('page');
    expect(within(screen.getByTestId('stop')).getByText('Stopped: the game is over.')).toBeDefined();
    const home = screen.getByRole('region', { name: 'Guild' });
    expect(within(home).getByText(/^The game ended on Year 1 Day 1: The Lantern had its Roster wiped out\.$/)).toBeDefined();
    expect(within(screen.getByRole('banner')).getByText('The game has ended')).toBeDefined();
    for (const name of ['Advance a Turn', 'Fast forward', 'More ways to Fast forward']) {
      expect((within(time()).getByRole('button', { name }) as HTMLButtonElement).disabled, name).toBe(true);
    }
    // The end names no next step: there is none.
    expect(within(screen.getByTestId('stop')).queryAllByRole('button')).toHaveLength(0);
  });
});
