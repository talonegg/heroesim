import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { App } from './app';
import { started as startedFrom, withPartyOut, withRosterReleased, withWealth } from './state/game.test-support';
import { fastForwardStepTurns, gameReducer, initialGameState, type GameState, type Play } from './state/reducer';
import { download } from './views/download';

// The page (M7-S3): a new game, the header, time, the Board with dispatch, the Roster with Hero
// pages and the log, driven through the page's own controls. Every play settles after the busy
// state is painted (M7-S2), so each test waits for the page to be idle again. The file a player
// saves is kept, not downloaded: "Export this game" hands it to `download`.
vi.mock('./views/download', () => ({ download: vi.fn() }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const newGame: Play = {
  kind: 'newGame',
  seed: 'app-test',
  guildName: 'The Lantern',
  guildmasterName: 'Ada Vell',
  createdAt: '2026-09-27T09:00:00.000Z',
};

/** Plays `action` as the page does, accepted then settled, outside React. */
function played(state: GameState, action: Play): GameState {
  return gameReducer(gameReducer(state, action), { kind: 'settle' });
}

function started(): GameState {
  return played(initialGameState, newGame);
}

async function idle(): Promise<void> {
  await waitFor(() => expect(document.querySelector('main')?.getAttribute('aria-busy')).toBe('false'));
}

function section(name: RegExp | string): HTMLElement {
  return screen.getByRole('region', { name });
}

describe('before a game', () => {
  test('offers a new game, and names the content set it loaded', () => {
    render(<App />);

    expect(screen.getByRole('heading', { level: 1, name: 'Heroesim' })).toBeDefined();
    expect(screen.getByRole('heading', { name: 'A new game' })).toBeDefined();
    expect(screen.getByText(/^Content set core, version \d+, loaded\.$/)).toBeDefined();
    expect((screen.getByLabelText('Seed') as HTMLInputElement).value).toMatch(/^[a-z]+-[a-z]+-\d{4}$/);
  });

  test('starts one from the names given, and shows its header', async () => {
    render(<App />);

    fireEvent.change(screen.getByLabelText('Guild name'), { target: { value: 'The Lantern' } });
    fireEvent.change(screen.getByLabelText(/Guildmaster/), { target: { value: 'Ada Vell' } });
    fireEvent.change(screen.getByLabelText('Seed'), { target: { value: 'app-test' } });
    fireEvent.click(screen.getByRole('button', { name: 'Start the game' }));
    await idle();

    expect(screen.getByRole('heading', { level: 1, name: 'The Lantern' })).toBeDefined();
    expect(screen.getByTestId('time').textContent).toBe('Day 0, morning, Year 0');
    // Every Guild starts at Fame 0, so all five share the first place (DL-95).
    expect(screen.getByTestId('rankings').textContent).toBe('joint 1st of 5 by Fame');
    expect(screen.queryByTestId('countdown')).toBeNull();
    expect(screen.getByTestId('wealth').textContent).toMatch(/^\d+$/);
  });

  test('says why a new game is refused, and puts the refusal away', async () => {
    render(<App />);

    fireEvent.change(screen.getByLabelText('Guild name'), { target: { value: '   ' } });
    fireEvent.change(screen.getByLabelText(/Guildmaster/), { target: { value: 'Ada Vell' } });
    fireEvent.submit(screen.getByRole('button', { name: 'Start the game' }));
    await idle();

    expect(screen.getByRole('alert').textContent).toContain('The Guild needs a name.');
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('a game in hand', () => {
  test('lays its sections out in the order a Turn reads', () => {
    render(<App initial={started()} />);

    const headings = screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent);
    expect(headings).toEqual([
      'Time',
      'Board',
      'Roster',
      'Transfer Offers',
      'Unattached pool',
      'Market',
      'Hall',
      'Guildmaster',
      'Patrons',
      'Rankings',
      'Guilds',
      'Since your last action',
      'History',
      'This game',
    ]);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('The Lantern');
  });

  test('indexes its sections, and each link takes the player to its heading', () => {
    render(<App initial={started()} />);
    const index = screen.getByRole('navigation', { name: 'Sections' });
    const links = within(index).getAllByRole('link');

    expect(links.map((link) => link.textContent)).toEqual(
      screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent === 'Transfer Offers' ? 'Offers' : heading.textContent === 'Unattached pool' ? 'Pool' : heading.textContent),
    );
    fireEvent.click(within(index).getByRole('link', { name: 'Market' }));
    expect(document.activeElement).toBe(screen.getByRole('heading', { level: 2, name: 'Market' }));
  });

  test('advances a Turn, and narrates what happened in it', async () => {
    render(<App initial={started()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Advance a Turn' }));
    await idle();

    expect(screen.getByTestId('time').textContent).toBe('Day 0, afternoon, Year 0');
    const log = section('Since your last action');
    expect(within(log).getByText(/^\d+ events?, oldest first\.$/)).toBeDefined();
    for (const item of within(log).getAllByRole('listitem')) expect(item.textContent).toMatch(/^Day \d+, (morning|afternoon|night) .+\.$/);
  });

  test("fast forwards to a stop, says why, and the stop's button takes the player on", async () => {
    render(<App initial={started()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Fast forward' }));
    await idle();

    const stop = screen.getByTestId('stop');
    // A new game's idle Roster and a fresh Board: the next morning's Quests need a decision.
    expect(within(stop).getByText(/^Stopped: a decision is needed: The Lantern has no Party out, and could send one on .+.$/)).toBeDefined();
    fireEvent.click(within(stop).getByRole('button', { name: 'Choose a Party on the Board' }));
    expect(document.activeElement).toBe(screen.getByRole('heading', { level: 2, name: 'Board' }));
  });

  test('keeps the log to the Guild when asked, and shows a long one a hundred lines at a time', async () => {
    render(<App initial={started()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Fast forward until new Heroes join the pool' }));
    await idle();
    const log = section('Since your last action');
    const count = (): number => within(log).queryAllByRole('listitem').length;
    const all = Number(/^(\d+) events?/.exec(within(log).getByText(/oldest first/).textContent ?? '')?.[1]);

    expect(count()).toBe(Math.min(all, 100));
    fireEvent.click(within(log).getByRole('checkbox'));
    const mine = Number(/^(\d+) events?/.exec(within(log).queryByText(/oldest first/)?.textContent ?? '0')?.[1] ?? 0);
    expect(mine).toBeLessThanOrEqual(all);
  });

  test('keeps to the Guild from play to play once asked, as the History keeps whose it shows (DL-74)', async () => {
    render(<App initial={started()} />);
    const box = (): HTMLInputElement => within(section('Since your last action')).getByRole('checkbox') as HTMLInputElement;

    fireEvent.click(box());
    expect(box().checked).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Advance a Turn' }));
    await idle();

    expect(screen.getByTestId('time').textContent).toBe('Day 0, afternoon, Year 0');
    expect(box().checked).toBe(true);
  });
});

describe('fast forward in steps, with progress and a Stop (v1.0.1-S5, DL-96)', () => {
  /** The Turns the player's Stop says it played. */
  function stoppedAfter(): number {
    const sentence = within(screen.getByTestId('stop')).getByText(/^Stopped: you asked to stop, after \d+ Turns\.$/).textContent ?? '';
    return Number(/after (\d+) Turns/.exec(sentence)?.[1]);
  }

  test('between steps it shows the Turns played, the Day reached and the countdown below the floor; plays wait, and the game in hand stands', async () => {
    // A Party out on a Quest of ten Days, home on the 32nd Turn, in the second step; Wealth below
    // the floor, so the night's check starts the countdown on Day 0.
    render(<App initial={withWealth(withPartyOut(startedFrom('reducer-test')), -100)} />);
    const time = section('Time');

    fireEvent.click(screen.getByRole('button', { name: 'Fast forward' }));

    await waitFor(() => {
      const progress = screen.getByTestId('progress');
      expect(within(progress).getByText('Played 30 Turns so far. Now Day 10, morning, Year 0.')).toBeDefined();
      expect(
        within(progress).getByText(
          'The Lantern has been below the Bankruptcy floor since Day 0: Bankruptcy on the night of Day 30 unless Wealth is back ' +
            'to 0 or more on a night by then, after any Upkeep due.',
        ),
      ).toBeDefined();
      expect(within(time).getByRole('status').textContent).toBe('Playing the Turns…');
      for (const name of ['Advance a Turn', 'Fast forward', 'Fast forward until new Heroes join the pool']) {
        expect((within(time).getByRole('button', { name }) as HTMLButtonElement).disabled).toBe(true);
      }
      expect(within(time).getByRole('button', { name: 'Stop the fast forward' })).toBeDefined();
      // The game in hand, and so the header, stand until the fast forward ends (DL-96).
      expect(screen.getByTestId('time').textContent).toBe('Day 0, morning, Year 0');
    });
    await idle();

    expect(screen.queryByTestId('progress')).toBeNull();
    expect(within(screen.getByTestId('stop')).getByText("Stopped: The Lantern's Party came home.")).toBeDefined();
    expect(screen.getByTestId('time').textContent).toBe('Day 10, night, Year 0');
    // The log gathers both steps' events, the first step's first.
    const log = section('Since your last action');
    expect(within(log).getByText(/^\d+ events, oldest first\.$/)).toBeDefined();
    expect(within(log).getAllByRole('listitem')[0]?.textContent).toMatch(/^Day 0, /);
  });

  test('Stop leaves the game, the log and the sentence as its step left them, and "Fast forward again" goes on from there', async () => {
    // The Roster released and Wealth to spare: a year with nothing of the player's to stop it.
    render(<App initial={withRosterReleased(startedFrom())} />);

    fireEvent.click(screen.getByRole('button', { name: 'Fast forward' }));
    await waitFor(() => expect(screen.getByTestId('progress')).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: 'Stop the fast forward' }));
    await idle();

    const first = stoppedAfter();
    expect(first % 30).toBe(0);
    expect(first).toBeGreaterThan(0);
    expect(first).toBeLessThan(1080);
    expect(screen.queryByTestId('progress')).toBeNull();
    expect(screen.getByTestId('time').textContent).toBe(`Day ${first / 3}, morning, Year 0`);
    const log = section('Since your last action');
    expect(within(log).getByText(/^\d+ events, oldest first\.$/)).toBeDefined();
    expect(within(log).getAllByRole('listitem')[0]?.textContent).toMatch(/^Day 0, /);
    expect((screen.getByRole('button', { name: 'Advance a Turn' }) as HTMLButtonElement).disabled).toBe(false);

    fireEvent.click(within(screen.getByTestId('stop')).getByRole('button', { name: 'Fast forward again' }));
    await waitFor(() => expect(screen.getByTestId('progress')).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: 'Stop the fast forward' }));
    await idle();

    const second = stoppedAfter();
    expect(screen.getByTestId('time').textContent).toBe(`Day ${(first + second) / 3}, morning, Year 0`);
  }, 30_000);

  test('"Export this game" waits between steps, when the game in hand\'s History runs ahead of its World; stopped, it exports a save that loads (v1.0.1-S6, DL-97)', async () => {
    // Between steps the game in hand shares its History with the steps' games (ADR-0008): a save of
    // it would hold Turns its World has not played, and the page's own load refuses one.
    render(<App initial={withRosterReleased(startedFrom())} />);
    const exporting = () => within(section('This game')).getByRole('button', { name: 'Export this game' }) as HTMLButtonElement;

    fireEvent.click(screen.getByRole('button', { name: 'Fast forward' }));
    await waitFor(() => expect(screen.getByTestId('progress')).toBeDefined());
    expect(exporting().disabled).toBe(true);
    fireEvent.click(exporting());
    expect(download).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Stop the fast forward' }));
    await idle();
    expect(exporting().disabled).toBe(false);
    fireEvent.click(exporting());

    expect(download).toHaveBeenCalledTimes(1);
    const file = vi.mocked(download).mock.calls[0]?.[0];
    if (file === undefined) throw new Error('expected a file');
    const loaded = played(initialGameState, { kind: 'load', text: await file.text() });
    expect(loaded.rejection).toBeNull();
    expect(loaded.document?.world.turn).toBe(stoppedAfter());
  });
});

describe("the page's own words, the CLI's help", () => {
  /** The sentence that says what a section is for: its accessible description. */
  function described(region: HTMLElement): string {
    const ids = region.getAttribute('aria-describedby')?.split(' ') ?? [];
    return ids.map((id) => document.getElementById(id)?.textContent ?? '').join(' ').trim();
  }

  test('every section says what it is for and what its controls do, before a game and with one', () => {
    for (const initial of [undefined, started()]) {
      const { container, unmount } = render(<App {...(initial === undefined ? {} : { initial })} />);
      const regions = within(container).getAllByRole('region');
      expect(regions.length).toBeGreaterThan(initial === undefined ? 0 : 13);
      for (const region of regions) expect(described(region), region.getAttribute('aria-labelledby') ?? '').toMatch(/^[A-Z].{40,}\.$/);
      unmount();
    }
  });

  test('Time says how many Turns a step of fast forward plays: the constant the steps play (v1.0.1-S6, DL-97)', () => {
    render(<App initial={started()} />);

    expect(described(section('Time'))).toContain(`It plays them ${fastForwardStepTurns} Turns, ten Days, at a time`);
  });

  test('every control has a name that says what it does', () => {
    const { container } = render(<App initial={started()} />);

    for (const control of within(container).getAllByRole('button')) expect(control.textContent?.trim()).not.toBe('');
    for (const control of [
      ...within(container).queryAllByRole('textbox'),
      ...within(container).queryAllByRole('searchbox'),
      ...within(container).queryAllByRole('combobox'),
      ...within(container).queryAllByRole('spinbutton'),
    ]) {
      expect(control.closest('label')?.textContent?.trim() ?? control.getAttribute('aria-label')).toBeTruthy();
    }
  });
});

describe('the Board with dispatch', () => {
  test("previews a Party as it is chosen, and sends it when dispatch would", async () => {
    render(<App initial={started()} />);
    const board = section('Board');
    const [first] = within(board).getAllByRole('article');
    if (first === undefined) throw new Error('an empty Board');
    const questName = within(first).getByRole('heading', { level: 3 }).textContent ?? '';

    fireEvent.click(within(first).getByRole('button', { name: 'Choose a Party' }));
    const form = within(first).getByRole('form');
    expect(within(form).getByRole('status').textContent).toMatch(/^Dispatch would refuse it: /);

    // Choose Heroes one at a time until dispatch would send them, or none are left.
    for (const box of within(form).getAllByRole('checkbox')) {
      if ((box as HTMLInputElement).disabled) continue;
      fireEvent.click(box);
      if (within(form).getByRole('status').textContent === 'Dispatch would send this Party.') break;
    }
    const verdict = within(form).getByRole('status').textContent;
    expect(within(form).getByText(/^Reward agreed on a success: \d+ Wealth, \d+ offered\.$/)).toBeDefined();
    expect(within(form).getByRole('heading', { name: 'Synergies' })).toBeDefined();
    const send = within(form).getByRole('button', { name: 'Send the Party' }) as HTMLButtonElement;
    expect(send.disabled).toBe(verdict !== 'Dispatch would send this Party.');
    expect(send.disabled).toBe(false);

    fireEvent.click(send);
    await idle();

    expect(within(section('Board')).queryByRole('heading', { level: 3, name: questName })).toBeNull();
    expect(within(section('Since your last action')).getByText(new RegExp(`^The Lantern sent .+ on ${questName}, back on the night of Day \\d+`))).toBeDefined();
    expect(within(section('Roster')).getAllByText(/^away with a Party, back on the night of Day \d+$/).length).toBeGreaterThan(0);
  });
});

describe('the Roster with Hero pages', () => {
  test('opens a Hero\'s page with Stats and hints, pages their History, and goes back', async () => {
    let state = started();
    state = played(state, { kind: 'advance', turns: 30 });
    render(<App initial={state} />);
    const roster = section('Roster');
    const [first] = within(roster).getAllByRole('button');
    if (first === undefined) throw new Error('an empty Roster');
    const name = first.textContent ?? '';

    fireEvent.click(first);

    const page = within(section('Roster')).getByRole('article');
    expect(within(page).getByRole('heading', { level: 3 }).textContent).toBe(name);
    const outlooks = within(page)
      .getAllByRole('row')
      .flatMap((row) => {
        const cells = within(row).queryAllByRole('cell');
        return cells.length === 3 ? [cells[2]?.textContent] : [];
      });
    expect(outlooks.length).toBeGreaterThan(10);
    for (const outlook of outlooks) expect(['modest', 'promising', 'exceptional']).toContain(outlook);
    expect(within(page).getByRole('heading', { name: 'History, newest first' })).toBeDefined();
    expect(within(page).getByText(/^Page 1 of \d+, \d+ (entry|entries) in all\.$/)).toBeDefined();
    expect((within(page).getByRole('button', { name: 'Newer' }) as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(within(page).getByRole('button', { name: 'Back to the Roster' }));
    expect(within(section('Roster')).queryByRole('article')).toBeNull();
  });
});

describe('the test-only switch for modules, the query parameter ?modules=probe (M8-S4)', () => {
  afterEach(() => {
    window.history.replaceState(null, '', '/');
  });

  /** Opens the page at `address`, starts a game from the firing seed through the form, and plays eleven Turns one at a time. */
  async function elevenTurns(address: string): Promise<void> {
    window.history.replaceState(null, '', address);
    render(<App />);
    fireEvent.change(screen.getByLabelText('Guild name'), { target: { value: 'The Lantern' } });
    fireEvent.change(screen.getByLabelText(/Guildmaster/), { target: { value: 'Ada Vell' } });
    // Seed `modules`: the probe's stream first draws below 0.02 on the eleventh Turn, the night of Day 3.
    fireEvent.change(screen.getByLabelText('Seed'), { target: { value: 'modules' } });
    fireEvent.click(screen.getByRole('button', { name: 'Start the game' }));
    await idle();
    for (let turn = 1; turn <= 11; turn += 1) {
      fireEvent.click(screen.getByRole('button', { name: 'Advance a Turn' }));
      await idle();
    }
    expect(screen.getByTestId('time').textContent).toBe('Day 3, night, Year 0');
  }

  test('with it, the page says the probe is installed, and its probe.fired event is in the log on a seed known to fire one', async () => {
    await elevenTurns('/?modules=probe');

    expect(screen.getByText('Installed for testing: the probe module.')).toBeDefined();
    const log = section('Since your last action');
    const fired = within(log).getByText(/^The probe module recorded probe\.fired for .+\.$/);
    expect(fired.closest('li')?.querySelector('.when')?.textContent).toBe('Day 3, night');
    // Its effects' events follow it, in the page's words for the core's own.
    expect(within(log).getByText(/'s Wealth went from \d+ to \d+\.$/)).toBeDefined();
  }, 30_000);

  test('without it, nothing is installed: no word of a module, and no probe.fired on the same Turns', async () => {
    await elevenTurns('/');

    expect(screen.queryByText(/Installed for testing/)).toBeNull();
    expect(within(section('Since your last action')).queryByText(/probe/)).toBeNull();
  }, 30_000);
});
