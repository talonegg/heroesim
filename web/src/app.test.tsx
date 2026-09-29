import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { App } from './app';
import { started as startedFrom, withOffer, withOlderRules, withPartyOut, withRosterReleased, withWealth } from './state/game.test-support';
import { fastForwardStepTurns, gameReducer, initialGameState, type GameState, type Play } from './state/reducer';
import { download } from './views/download';
import {
  closeMenu,
  historyLines,
  inHistory,
  nav,
  navButton,
  openMenu,
  openView,
  rosterList,
  section,
  sentenceOf,
  time,
  type ViewName,
} from './views/page.test-support';

// The page (M7-S3; views in a shell since M9-S3, DL-103): a new game, the status bar, the views
// and the navigation between them, the home view's digest, the Board with dispatch, the Roster with
// Hero pages and the History, driven through the page's own controls. Every play settles after the
// busy state is painted (M7-S2), so each test waits for the page to be idle again. The file a
// player saves is kept, not downloaded: "Export this game" hands it to `download`.
vi.mock('./views/download', () => ({ download: vi.fn() }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.restoreAllMocks();
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

/** The whole History, chosen in the History view (M9-S5). */
function wholeHistory(): HTMLElement {
  fireEvent.click(within(within(section('History')).getByRole('group', { name: 'Whose History' })).getByRole('button', { name: 'The whole History' }));
  return section('History');
}

/** What the History's summary says: its entries in all, and how many of them are new. */
function summary(history: HTMLElement): { entries: number; fresh: number } {
  const text = within(history).getByText(/^Page \d+ of \d+, \d+ (entry|entries) in all, newest first\./).textContent ?? '';
  return { entries: Number(/, (\d+) entr/.exec(text)?.[1]), fresh: Number(/ (\d+) new since your last action\.$/.exec(text)?.[1] ?? 0) };
}

// The seven views in the navigation's order (M9-F2, DL-112 item 5).
const views: readonly ViewName[] = ['Guildmaster', 'Guild', 'Roster', 'Board', 'Rankings', 'Market', 'History'];

describe('before a game', () => {
  test('offers a new game, and names the content set it loaded', () => {
    render(<App />);

    expect(screen.getByRole('heading', { level: 1, name: 'Heroesim' })).toBeDefined();
    expect(screen.getByRole('heading', { name: 'A new game' })).toBeDefined();
    expect(screen.getByText(/^Content set core, version \d+, loaded\.$/)).toBeDefined();
    expect((screen.getByLabelText('Seed') as HTMLInputElement).value).toMatch(/^[a-z]+-[a-z]+-\d{4}$/);
  });

  test('starts one from the names given, and shows its status bar and the home view', async () => {
    render(<App />);

    fireEvent.change(screen.getByLabelText('Guild name'), { target: { value: 'The Lantern' } });
    fireEvent.change(screen.getByLabelText(/Guildmaster/), { target: { value: 'Ada Vell' } });
    fireEvent.change(screen.getByLabelText('Seed'), { target: { value: 'app-test' } });
    fireEvent.click(screen.getByRole('button', { name: 'Start the game' }));
    await idle();

    const bar = screen.getByRole('banner');
    expect(within(bar).getByRole('heading', { level: 1, name: 'The Lantern' })).toBeDefined();
    expect(within(bar).getByTestId('time').textContent).toBe('Day 0, morning, Year 0');
    // Every Guild starts at Fame 0, so all five share the first place (DL-95).
    expect(within(bar).getByTestId('rankings').textContent).toBe('joint 1st of 5 by Fame');
    expect(screen.queryByTestId('countdown')).toBeNull();
    expect(within(bar).getByTestId('wealth').textContent).toMatch(/^\d+$/);
    // A new game opens the home view, and puts the keyboard on its heading.
    expect(document.activeElement).toBe(screen.getByRole('heading', { level: 2, name: 'Guild' }));
    // The seed is the game menu's to say, no longer the status bar's (the review's B12).
    expect(within(bar).queryByText('app-test')).toBeNull();
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

describe('the shell (M9-S3, DL-103)', () => {
  test('opens on the home view, with the seven views in the navigation in order and the open one marked', () => {
    render(<App initial={started()} />);

    const buttons = within(nav()).getAllByRole('button').filter((button) => !/^More$/.test(button.textContent ?? ''));
    // The Guildmaster's is labelled with their name (M9-F2).
    expect(buttons.map((button) => button.querySelector('.nav__label')?.textContent)).toEqual(
      views.map((view) => (view === 'Guildmaster' ? 'Ada Vell' : view)),
    );
    expect(navButton('Guild').getAttribute('aria-current')).toBe('page');
    expect(screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent)).toContain('Guild');
    expect(screen.getByRole('region', { name: 'Guild' })).toBeDefined();
    // One view at a time: the Board is not on the page until it is opened.
    expect(screen.queryByRole('region', { name: 'Board' })).toBeNull();
  });

  test('opens every view from the navigation, a button the keyboard reaches, and puts the keyboard on its heading', () => {
    render(<App initial={started()} />);

    for (const view of views) {
      const button = navButton(view);
      // A native button: reached by Tab and pressed with Enter or Space, no tabindex to take it out.
      expect(button.tagName).toBe('BUTTON');
      expect(button.getAttribute('tabindex')).toBeNull();
      const region = openView(view);

      expect(document.activeElement).toBe(within(region).getByRole('heading', { level: 2, name: view }));
      expect(navButton(view).getAttribute('aria-current')).toBe('page');
      for (const other of views.filter((each) => each !== view)) expect(navButton(other).getAttribute('aria-current')).toBeNull();
      // One view at a time.
      expect(views.filter((each) => screen.queryByRole('region', { name: each }) !== null)).toEqual([view]);
    }
  });

  test('counts on the navigation: the Quests on offer, a dot while a Transfer Offer waits, and the entries new since the last action', () => {
    const state = started();
    const quests = state.document?.world.board.length ?? 0;
    const { unmount } = render(<App initial={state} />);

    expect(navButton('Board').textContent).toBe(`Board${quests}, ${quests} Quests on offer`);
    expect(navButton('Roster').textContent).toBe('Roster');
    expect(navButton('History').textContent).toMatch(/^History\d+, \d+ new$/);
    unmount();

    render(<App initial={withOffer(state)} />);
    expect(navButton('Roster').textContent).toBe('Roster, a Transfer Offer waits');
    expect(navButton('Roster').querySelector('.dot')).not.toBeNull();
  });

  test('remembers the open view in this browser, and a new game or a load opens the home view', async () => {
    const { unmount } = render(<App initial={started()} />);
    openView('Market');
    expect(localStorage.getItem('heroesim.view')).toBe('market');
    unmount();

    render(<App initial={started()} />);
    expect(navButton('Market').getAttribute('aria-current')).toBe('page');
    expect(screen.getByRole('region', { name: 'Market' })).toBeDefined();

    fireEvent.click(within(section('This game')).getByRole('button', { name: 'Start a new game' }));
    fireEvent.change(screen.getByLabelText('Guild name'), { target: { value: 'The Second Lamp' } });
    fireEvent.change(screen.getByLabelText(/Guildmaster/), { target: { value: 'Bran Tull' } });
    fireEvent.click(screen.getByRole('button', { name: 'Start the game' }));
    await idle();
    expect(navButton('Guild').getAttribute('aria-current')).toBe('page');
    // The page remembers the view in an effect after the play's render, which settles outside the click.
    await waitFor(() => expect(localStorage.getItem('heroesim.view')).toBe('guild'));
  });

  test('opens on the home view where the browser keeps nothing, or keeps a view it does not know', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('The operation is insecure.', 'SecurityError');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
    });
    const { unmount } = render(<App initial={started()} />);
    expect(navButton('Guild').getAttribute('aria-current')).toBe('page');
    openView('Board');
    expect(navButton('Board').getAttribute('aria-current')).toBe('page');
    unmount();
    vi.restoreAllMocks();

    localStorage.setItem('heroesim.view', 'the-cellar');
    render(<App initial={started()} />);
    expect(navButton('Guild').getAttribute('aria-current')).toBe('page');
  });

  test('docks a refusal under the status bar, whichever view the play came from', async () => {
    render(<App initial={withWealth(started(), 50)} />);

    fireEvent.click(within(section('Hall')).getByRole('button', { name: /^Build Dormitory for \d+ Wealth$/ }));
    await idle();

    const alert = within(screen.getByRole('banner')).getByRole('alert');
    expect(alert.textContent).toContain("The next grade of The Lantern's quarters costs 200 Wealth; The Lantern has 50.");
    expect(within(screen.getByRole('main')).queryByRole('alert')).toBeNull();
    fireEvent.click(within(alert).getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  test('the game menu holds the seed, the content version and the game as a file; Escape closes it and returns to its button', () => {
    render(<App initial={started()} />);
    const button = screen.getByRole('button', { name: 'Game' });
    fireEvent.click(button);

    const menu = screen.getByRole('dialog', { name: 'Game' });
    expect(document.activeElement).toBe(within(menu).getByRole('heading', { level: 2, name: 'Game' }));
    expect(within(menu).getByTestId('seed').textContent).toBe('app-test');
    expect(within(menu).getByText(/^core, version \d+$/)).toBeDefined();
    expect(within(menu).getByRole('region', { name: 'This game' })).toBeDefined();
    expect(within(menu).queryByRole('region', { name: 'New rules available' })).toBeNull();

    fireEvent.keyDown(menu, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Game' })).toBeNull();
    expect(document.activeElement).toBe(button);
  });

  test('the rules notice is in the game menu with its versions, and a banner in the home view while it stands', async () => {
    render(<App initial={withOlderRules(started(), 2)} />);

    const home = screen.getByRole('region', { name: 'Guild' });
    expect(within(home).getByText('New rules are available.')).toBeDefined();
    expect(within(section('New rules available')).getByText(/configVersion \d+; this release’s rules are configVersion \d+/)).toBeDefined();
    closeMenu();

    fireEvent.click(within(home).getByRole('button', { name: 'Adopt the new rules' }));
    await idle();

    expect(within(screen.getByRole('region', { name: 'Guild' })).queryByText('New rules are available.')).toBeNull();
    expect(within(openMenu()).queryByRole('region', { name: 'New rules available' })).toBeNull();
  });
});

describe('the home view (M9-S3, DL-103)', () => {
  test('after a fast forward, opens with the stop, and each Quest it names opens that Quest’s Party on the Board', async () => {
    const initial = started();
    render(<App initial={initial} />);
    openView('Roster');

    fireEvent.click(screen.getByRole('button', { name: 'Fast forward' }));
    await idle();

    // The fast forward ended: the home view, with why it stopped.
    expect(navButton('Guild').getAttribute('aria-current')).toBe('page');
    const stop = screen.getByTestId('stop');
    // A new game's idle Roster and a fresh Board: the next morning's Quests need a decision.
    const sentence = within(stop).getByText(/^Stopped: a decision is needed: The Lantern has no Party out, and could send one on .+.$/).textContent ?? '';
    const buttons = within(stop).getAllByRole('button', { name: /^Choose a Party for .+, offered by .+, for \d+ Wealth$/ });
    expect(buttons.length).toBeGreaterThan(1);
    const [first] = buttons;
    const questName = first?.querySelector('.quest-button__name')?.textContent ?? '';
    expect(sentence).toContain(questName);

    fireEvent.click(first as HTMLElement);

    expect(navButton('Board').getAttribute('aria-current')).toBe('page');
    // The keyboard is on that Quest's heading: two Quests may share a name, so it is found by the focus.
    const heading = document.activeElement as HTMLElement;
    expect(heading.tagName).toBe('H3');
    expect(heading.textContent).toBe(questName);
    const card = heading.closest('article') as HTMLElement;
    expect(within(card).getByRole('form', { name: `A Party for ${questName}` })).toBeDefined();
    expect(within(card).getByRole('button', { name: 'Close' }).getAttribute('aria-expanded')).toBe('true');
    // The Party builder (M9-S4, DL-104): a row for each Hero on the Roster, and the card's details unfolded.
    const roster = Object.values(initial.document?.world.guilds ?? {}).find((guild) => guild.controller.kind === 'player')?.rosterIds;
    expect(within(card).getAllByTestId('party-row')).toHaveLength(roster?.length ?? -1);
    expect(within(card).getByRole('heading', { level: 4, name: 'Demands' })).toBeDefined();
  });

  test('shows the Parties out, with who went and the night they return', () => {
    render(<App initial={withPartyOut(started())} />);

    const home = screen.getByRole('region', { name: 'Guild' });
    const out = within(home).getByRole('heading', { level: 3, name: 'Parties out' }).parentElement as HTMLElement;
    expect(within(out).getAllByRole('listitem')).toHaveLength(1);
    expect(within(out).getByRole('listitem').textContent).toMatch(/^.+ · .+ · back on the night of Day \d+$/);
  });

  test("shows how the Party that came home fared: its Quest band, Wealth, Fame, XP and Injuries, and the stop's words", async () => {
    // A Party out on a Quest of ten Days, home on the night of Day 10.
    render(<App initial={withPartyOut(startedFrom('reducer-test'))} />);

    fireEvent.click(screen.getByRole('button', { name: 'Fast forward' }));
    await idle();

    const home = screen.getByRole('region', { name: 'Guild' });
    expect(within(screen.getByTestId('stop')).getByText("Stopped: The Lantern's Party came home.")).toBeDefined();
    const came = within(home).getByRole('heading', { level: 3, name: 'Came home' }).parentElement as HTMLElement;
    const [outcome] = within(came).getAllByRole('listitem').filter((item) => item.classList.contains('outcome'));
    if (outcome === undefined) throw new Error('no outcome shown');
    const quest = within(outcome).getByRole('heading', { level: 4 }).textContent ?? '';
    expect(within(outcome).getByText(/^(Success|Strong success|Failure)$/)).toBeDefined();
    const wealth = /^Wealth ([+-]?\d+)$/.exec(within(outcome).getByText(/^Wealth /).textContent ?? '')?.[1];
    const fame = /^Fame ([+-]?\d+)$/.exec(within(outcome).getByText(/^Fame /).textContent ?? '')?.[1];
    expect(within(outcome).getByText(/^XP \+\d+ each$/)).toBeDefined();
    // The same outcome, as the History narrates it, new, where it opens: on the player's Guild (M9-S5).
    const line = inHistory(new RegExp(`^The Lantern's Party came home from ${quest} and \\w+.*: Wealth ${wealth?.replace('+', '\\+')}, Fame ${fame?.replace('+', '\\+')}\\.`));
    expect(line.classList.contains('is-new')).toBe(true);
    // This seed's Party comes home with an Injury: named, with the night it heals.
    openView('Guild');
    expect(within(screen.getByRole('region', { name: 'Guild' })).getByText(/^.+: .+, healing on the night of Day \d+$/)).toBeDefined();
  });

  test('says when nothing waits, and names the Transfer Offers waiting with the way to answer them', () => {
    const { unmount } = render(<App initial={started()} />);
    expect(within(screen.getByRole('region', { name: 'Guild' })).getByText(/^Nothing is waiting on you\./)).toBeDefined();
    unmount();

    render(<App initial={withOffer(started())} />);
    const home = screen.getByRole('region', { name: 'Guild' });
    expect(within(home).getByText(/ offers \d+ Wealth for .+, until the night of Day \d+\.$/)).toBeDefined();
    fireEvent.click(within(home).getByRole('button', { name: 'Answer on the Roster' }));
    expect(document.activeElement).toBe(screen.getByRole('heading', { level: 3, name: 'Transfer Offers' }));
  });
});

describe('a game in hand', () => {
  test('advances a Turn, and narrates what happened in it', async () => {
    render(<App initial={started()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Advance a Turn' }));
    await idle();

    expect(screen.getByTestId('time').textContent).toBe('Day 0, afternoon, Year 0');
    // What the Turn added is the History's newest, under its Day and time of day, each line marked new (M9-S5).
    const history = wholeHistory();
    const before = started().document?.history.entries.length ?? 0;
    const { entries, fresh } = summary(history);
    expect(fresh).toBe(entries - before);
    expect(fresh).toBeGreaterThan(0);
    const [newest] = within(history).getAllByRole('heading', { level: 4 });
    expect(newest?.textContent).toBe('Day 0, afternoon');
    const lines = historyLines(newest?.parentElement as HTMLElement);
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) expect(line.classList.contains('is-new')).toBe(true);
  });

  test('after a fast forward, the History has all it added, marked new, twenty entries a page', async () => {
    // A Party out on a Quest of ten Days: the fast forward plays until it comes home.
    const state = withPartyOut(startedFrom('reducer-test'));
    // Counted now: the History is appended to in place, shared by the games that follow (ADR-0008).
    const before = state.document?.history.entries.length ?? 0;
    render(<App initial={state} />);

    fireEvent.click(screen.getByRole('button', { name: 'Fast forward' }));
    await idle();
    const history = wholeHistory();
    const { entries, fresh } = summary(history);

    expect(fresh).toBe(entries - before);
    expect(fresh).toBeGreaterThan(20);
    // The first page is all new, twenty entries and the steps its outcomes took with them.
    const lines = historyLines(history);
    expect(lines.length).toBeGreaterThanOrEqual(20);
    for (const line of lines) expect(line.classList.contains('is-new')).toBe(true);
  });

  test('beside the view, the History rail gives the Guild’s latest entries, the new ones marked', async () => {
    render(<App initial={started()} />);

    fireEvent.click(within(section('Market')).getByRole('button', { name: 'Buy Padded jack' }));
    await idle();

    const rail = screen.getByRole('complementary', { name: 'Latest for The Lantern' });
    const [newest, next] = within(rail).getAllByRole('listitem');
    expect(newest?.textContent).toMatch(/^Day 0, morningNew The Lantern bought .+ at the Market for \d+ Wealth\.$/);
    expect(newest?.classList.contains('is-new')).toBe(true);
    expect(next?.classList.contains('is-new')).toBe(false);
    expect(within(rail).getByText('1 new')).toBeDefined();
    expect(navButton('History').textContent).toBe('History1, 1 new');
  });
});

describe('fast forward in steps, with progress and a Stop (v1.0.1-S5, DL-96)', () => {
  /** The Turns the player's Stop says it played. */
  function stoppedAfter(): number {
    const sentence = within(screen.getByTestId('stop')).getByText(/^Stopped: you asked to stop, after \d+ Turns\.$/).textContent ?? '';
    return Number(/after (\d+) Turns/.exec(sentence)?.[1]);
  }

  test('between steps the status bar shows the Turns played, the Day reached and the countdown below the floor; plays wait, and the game in hand stands', async () => {
    // A Party out on a Quest of ten Days, home on the 32nd Turn, in the second step; Wealth below
    // the floor since Day 0, before the fast forward, so its countdown stands and no new crossing
    // stops it (M9-S1, DL-101).
    render(<App initial={withWealth(withPartyOut(startedFrom('reducer-test')), -100, 0)} />);

    fireEvent.click(screen.getByRole('button', { name: 'Fast forward' }));

    await waitFor(() => {
      const progress = within(screen.getByRole('banner')).getByTestId('progress');
      expect(within(progress).getByText('Played 30 Turns so far. Now Day 10, morning, Year 0.')).toBeDefined();
      expect(
        within(progress).getByText(
          'The Lantern has been below the Bankruptcy floor since Day 0: Bankruptcy on the night of Day 30 unless Wealth is back ' +
            'to 0 or more on a night by then, after any Upkeep due.',
        ),
      ).toBeDefined();
      expect(within(time()).getByRole('status').textContent).toBe('Playing the Turns…');
      for (const name of ['Advance a Turn', 'Fast forward', 'More ways to fast forward']) {
        expect((within(time()).getByRole('button', { name }) as HTMLButtonElement).disabled).toBe(true);
      }
      expect(within(progress).getByRole('button', { name: 'Stop the fast forward' })).toBeDefined();
      // The game in hand, and so the status bar, stand until the fast forward ends (DL-96).
      expect(screen.getByTestId('time').textContent).toBe('Day 0, morning, Year 0');
    });
    await idle();

    expect(screen.queryByTestId('progress')).toBeNull();
    expect(within(screen.getByTestId('stop')).getByText("Stopped: The Lantern's Party came home.")).toBeDefined();
    expect(screen.getByTestId('time').textContent).toBe('Day 10, night, Year 0');
    // The History marks both steps' entries new: all it gained in the fast forward (M9-S5).
    const { entries, fresh } = summary(wholeHistory());
    expect(fresh).toBe(entries - (withPartyOut(startedFrom('reducer-test')).document?.history.entries.length ?? 0));
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
    // The History marks new all the steps played until the Stop (M9-S5).
    const { entries, fresh } = summary(wholeHistory());
    expect(fresh).toBe(entries - (withRosterReleased(startedFrom()).document?.history.entries.length ?? 0));
    expect((screen.getByRole('button', { name: 'Advance a Turn' }) as HTMLButtonElement).disabled).toBe(false);

    openView('Guild');
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
    closeMenu();
    expect(loaded.document?.world.turn).toBe(stoppedAfter());
  });
});

describe("the page's own words, the CLI's help, on request (DL-73 item 9 as DL-99 item 1 amends it)", () => {
  /** The sentence that says what a region is for: its accessible description. */
  function described(region: HTMLElement): string {
    const ids = region.getAttribute('aria-describedby')?.split(' ') ?? [];
    return ids.map((id) => document.getElementById(id)?.textContent ?? '').join(' ').trim();
  }

  /** Every region on the page, from every view and the game menu, by its heading. */
  function everyRegion(): Map<string, HTMLElement> {
    const regions = new Map<string, HTMLElement>();
    const note = (): void => {
      for (const region of screen.getAllByRole('region')) regions.set(region.getAttribute('aria-labelledby') ?? '', region.cloneNode(true) as HTMLElement);
    };
    for (const view of views) {
      openView(view);
      note();
      // Each view's sentence and its parts' are in its "About this view", closed until asked for.
      const about = within(screen.getByRole('region', { name: view })).getByText('About this view').closest('details');
      expect(about?.open).toBe(false);
      // The Guild's parts are tabs' panels, described as a region is (M9-F2).
      const helpIds = [...screen.getAllByRole('region'), ...screen.queryAllByRole('tabpanel')].map((region) => region.getAttribute('aria-describedby'));
      for (const id of helpIds) expect(about?.querySelector(`#${id}`), `${view}'s About holds ${id}`).not.toBeNull();
    }
    openMenu();
    note();
    closeMenu();
    return regions;
  }

  test('every view and every part of one says what it is for and what its controls do, before a game and with one', () => {
    const { unmount } = render(<App />);
    const before = screen.getAllByRole('region');
    expect(before).toHaveLength(1);
    for (const region of before) expect(described(region)).toMatch(/^[A-Z].{40,}\.$/);
    unmount();

    // A Transfer Offer standing and older rules: every part the page has is drawn.
    render(<App initial={withOlderRules(withOffer(started()))} />);
    const regions = everyRegion();
    expect([...regions.keys()].sort()).toEqual(
      [
        'guildmaster', 'guild', 'roster', 'offers', 'pool', 'board', 'rankings', 'guilds', 'patrons', 'market', 'buy', 'sell',
        'history', 'rules', 'game',
      ]
        .map((id) => `${id}-heading`)
        .sort(),
    );
    for (const [id] of regions) {
      const help = document.getElementById(id.replace(/-heading$/, '-help'));
      // The menu's are gone with the menu; a view's are there while it is open.
      if (help === null) continue;
      expect(help.textContent, id).toMatch(/^[A-Z].{40,}\.$/);
    }
    for (const view of views) expect(described(openView(view))).toMatch(/^[A-Z].{40,}\.$/);
    for (const part of ['Transfer Offers', 'Unattached pool', 'Buy', 'Sell', 'Guilds', 'Patrons', 'This game', 'New rules available']) {
      expect(described(section(part)), part).toMatch(/^[A-Z].{40,}\.$/);
    }
    // Each of the Guild's parts, a tab's panel, says what it is for too, from the Guild's "About this view" (M9-F2).
    for (const part of ['Home', 'Hall']) {
      expect(described(section(part)), part).toMatch(/^[A-Z].{40,}\.$/);
    }
  });

  test('the time controls say what time is and how many Turns a step of fast forward plays: the constant the steps play (v1.0.1-S6, DL-97)', () => {
    render(<App initial={started()} />);

    expect(described(time())).toMatch(/^Time moves only here; .+\.$/);
    expect(described(time())).toContain(`It plays them ${fastForwardStepTurns} Turns, ten Days, at a time`);
  });

  test('every control has a name that says what it does, in every view and the game menu', () => {
    const { container } = render(<App initial={withOffer(started())} />);

    const check = (where: string): void => {
      const buttons = within(container).getAllByRole('button');
      expect(within(container).getAllByRole('button', { name: /\S/ }), where).toHaveLength(buttons.length);
      for (const role of ['textbox', 'searchbox', 'combobox', 'spinbutton', 'checkbox'] as const) {
        const controls = within(container).queryAllByRole(role);
        expect(within(container).queryAllByRole(role, { name: /\S/ }), `${where}: ${role}`).toHaveLength(controls.length);
      }
    };
    for (const view of views) {
      openView(view);
      check(view);
    }
    openMenu();
    check('the game menu');
  });
});

describe('the Board with dispatch', () => {
  test('previews a Party as it is chosen, and sends it when dispatch would', async () => {
    render(<App initial={started()} />);
    const board = section('Board');
    const [first] = within(board).getAllByRole('article');
    if (first === undefined) throw new Error('an empty Board');
    const questName = within(first).getByRole('heading', { level: 3 }).textContent ?? '';

    fireEvent.click(within(first).getByRole('button', { name: 'Choose a Party' }));
    const form = within(first).getByRole('form');
    expect(within(form).getByRole('status').textContent).toMatch(/^Dispatch would refuse it: /);
    // A new Guild holds no consumables: their fieldset is not drawn (the review's A5).
    expect(within(form).queryByRole('group', { name: 'Consumables' })).toBeNull();

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

    const named = (): HTMLElement[] => within(section('Board')).queryAllByRole('article', { name: questName });
    const before = named().length;

    fireEvent.click(send);
    await idle();

    // The Quest has left the Board, and its card is the Party out card in its place (M9-S4, DL-104).
    const [sent, ...others] = named();
    expect(sent?.dataset.testid).toBe('sent');
    expect(others.filter((card) => card.dataset.testid !== 'sent')).toHaveLength(before - 1);
    // The play's line is the History's newest, marked new (M9-S5, DL-105).
    expect(inHistory(new RegExp(`^The Lantern sent .+ on ${questName}, back on the night of Day \\d+`)).classList.contains('is-new')).toBe(true);
    expect(within(rosterList()).getAllByText(/^away with a Party, back on the night of Day \d+$/).length).toBeGreaterThan(0);
    const out = within(openView('Guild')).getByRole('heading', { level: 3, name: 'Parties out' }).parentElement as HTMLElement;
    expect(within(out).getByText(questName)).toBeDefined();
  });
});

describe('the Roster with Hero pages', () => {
  test("opens a Hero's page with Stats and hints, pages their History, and goes back", () => {
    let state = started();
    state = played(state, { kind: 'advance', turns: 30 });
    render(<App initial={state} />);
    const [first] = within(rosterList()).getAllByRole('button');
    if (first === undefined) throw new Error('an empty Roster');
    const name = first.textContent ?? '';

    fireEvent.click(first);

    const page = within(section('Roster')).getByRole('article');
    expect(within(page).getByRole('heading', { level: 3 }).textContent).toBe(name);
    const outlooks = within(page)
      .getAllByRole('row')
      .flatMap((row) => {
        // A Stat's row in its area's block (M9-S6): its value, then its Outlook as a chip.
        const cells = within(row).queryAllByRole('cell');
        return cells.length === 2 ? [cells[1]?.textContent?.replace(/^Outlook /, '')] : [];
      });
    expect(outlooks.length).toBeGreaterThan(10);
    for (const outlook of outlooks) expect(['modest', 'promising', 'exceptional']).toContain(outlook);
    expect(within(page).getByRole('heading', { name: 'History, newest first' })).toBeDefined();
    expect(within(page).getByText(/^Page 1 of \d+, \d+ (entry|entries) in all, newest first\./)).toBeDefined();
    // Grouped by Day and time of day, as the History is (M9-S5); a first page has no newer one.
    expect(within(page).getAllByRole('heading', { level: 5 }).length).toBeGreaterThan(0);
    expect((within(page).queryByRole('button', { name: 'Newer' }) as HTMLButtonElement | null)?.disabled ?? true).toBe(true);

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
    expect(within(openMenu()).getByText('the probe module')).toBeDefined();
    // In the whole History, new, under the night it fired (M9-S5).
    wholeHistory();
    const fired = inHistory(/^The probe module recorded probe\.fired for .+\.$/);
    expect(fired.classList.contains('is-new')).toBe(true);
    expect(fired.closest('.history-group')?.querySelector('h4')?.textContent).toBe('Day 3, night');
    // Its effects' events follow it, in the page's words for the core's own.
    expect(inHistory(/'s Wealth went from \d+ to \d+\.$/).classList.contains('is-new')).toBe(true);
  }, 30_000);

  test('without it, nothing is installed: no word of a module, and no probe.fired on the same Turns', async () => {
    await elevenTurns('/');

    expect(screen.queryByText(/Installed for testing/)).toBeNull();
    // Nothing new in the whole History names a probe.
    const fresh = historyLines(wholeHistory()).filter((line) => line.classList.contains('is-new'));
    expect(fresh.length).toBeGreaterThan(0);
    expect(fresh.filter((line) => /probe/.test(sentenceOf(line)))).toEqual([]);
  }, 30_000);
});
