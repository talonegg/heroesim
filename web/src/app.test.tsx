import type { Quest } from '@heroesim/engine';
import { whenOfTurn } from '@heroesim/words';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { App } from './app';
import { changed, documentOf, firstSeedWhere, played, started, turnsUntilHome, withOffer, withOlderRules, withPartyHomeInALaterStep, withPartyOut, withRosterReleased, withWealth } from './state/game.test-support';
import { fastForwardStepTurns, initialGameState, type GameState } from './state/reducer';
import { download } from './views/download';
import {
  closeMenu,
  described,
  historyLines,
  idle,
  inHistory,
  nav,
  navButton,
  openDebugHistory,
  openGuildPart,
  openMenu,
  openView,
  refuseStorage,
  rosterList,
  section,
  startNewGame,
  time,
  views,
  type ViewName,
} from './views/page.test-support';

// The page (views in a shell, DL-103): a new game, the status bar, the views
// and the navigation between them, the home view's digest, the Board with dispatch, the Roster with
// Hero pages and the History, driven through the page's own controls. Every play settles after the
// busy state is painted, so each test waits for the page to be idle again. The file a
// player saves is kept, not downloaded: "Export this game" hands it to `download`.
vi.mock('./views/download', () => ({ download: vi.fn() }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.restoreAllMocks();
});


/** The whole History, the game menu's debug view: a module's events are there alone. */
function wholeHistory(): HTMLElement {
  return openDebugHistory();
}

/** What the History's summary says: its entries in all, and how many of them are new. */
function summary(history: HTMLElement): { entries: number; fresh: number } {
  const text = within(history).getByText(/^Page \d+ of \d+, \d+ (entry|entries) in all, newest first\./).textContent ?? '';
  return { entries: Number(/, (\d+) entr/.exec(text)?.[1]), fresh: Number(/ (\d+) new since your last action\.$/.exec(text)?.[1] ?? 0) };
}


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

    startNewGame({ guildName: 'The Lantern', guildmasterName: 'Ada Vell', seed: 'app-test' });
    await idle();

    const bar = screen.getByRole('banner');
    expect(within(bar).getByRole('heading', { level: 1, name: 'The Lantern' })).toBeDefined();
    expect(within(bar).getByTestId('time').textContent).toBe('Year 1 Day 1, morning');
    // Every Guild starts at Fame 0, so all five share the first place (DL-95).
    expect(within(bar).getByTestId('rankings').textContent).toBe('Joint 1st of 5 by Fame');
    expect(screen.queryByTestId('countdown')).toBeNull();
    expect(within(bar).getByTestId('wealth').textContent).toMatch(/^\d+$/);
    // A new game opens the home view, and puts the keyboard on its heading. The keyboard moves in
    // an effect after the play's render, which a busy machine may paint first.
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('heading', { level: 2, name: 'Guild' })));
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

describe('the shell (DL-103)', () => {
  test('opens on the home view, with the seven views in the navigation in order and the open one marked', () => {
    render(<App initial={started()} />);

    const buttons = within(nav()).getAllByRole('button').filter((button) => !/^More(,|$)/.test(button.textContent ?? ''));
    // The Guildmaster's is labelled with their name.
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
    startNewGame({ guildName: 'The Second Lamp', guildmasterName: 'Bran Tull' });
    await idle();
    expect(navButton('Guild').getAttribute('aria-current')).toBe('page');
    // The page remembers the view in an effect after the play's render, which settles outside the click.
    await waitFor(() => expect(localStorage.getItem('heroesim.view')).toBe('guild'));
  });

  test('opens on the home view where the browser keeps nothing, or keeps a view it does not know', () => {
    refuseStorage();
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

describe('the home view (DL-103)', () => {
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
    // The Party builder (DL-104): a row for each Hero on the Roster, and the card's details unfolded.
    const roster = Object.values(initial.document?.world.guilds ?? {}).find((guild) => guild.controller.kind === 'player')?.rosterIds;
    expect(within(card).getAllByTestId('party-row')).toHaveLength(roster?.length ?? -1);
    expect(within(card).getByRole('heading', { level: 4, name: 'Encounters' })).toBeDefined();
  });

  test('shows the Parties out, with who went and the night they return', () => {
    render(<App initial={withPartyOut(started())} />);

    const home = screen.getByRole('region', { name: 'Guild' });
    const out = within(home).getByRole('heading', { level: 3, name: 'Parties out' }).parentElement as HTMLElement;
    expect(within(out).getAllByRole('listitem')).toHaveLength(1);
    expect(within(out).getByRole('listitem').textContent).toMatch(/^.+ · .+ · back on the night of Year \d+ Day \d+$/);
  });

  test("shows the report of the Party that came home, in the Came home cards' place: its band, Wealth, Fame, XP and Injuries, as its History says", async () => {
    // A Party out on a Quest made as hard as a Quest is, so that it comes home hurt: the first game
    // from report-o whose Party, played ahead, comes home with an Injury (DL-272).
    const hardFrom = (seed: string): GameState =>
      changed(withPartyOut(started(seed)), (document, player) => {
        for (const party of Object.values(document.world.parties)) {
          if (party.guildId === player.id) (document.world.quests[party.questId] as Quest).difficulty = 100;
        }
      });
    const comesHomeInjured = (out: GameState): boolean => {
      const heroIds = Object.values(out.document?.world.parties ?? {}).flatMap((party) => party.heroIds);
      let next = out;
      for (let tries = 0; tries < 5 && next.stoppedBecause?.kind !== 'party-returned'; tries += 1) next = played(next, { kind: 'fastForward', until: [] });
      return next.stoppedBecause?.kind === 'party-returned' && heroIds.some((heroId) => (next.document?.world.heroes[heroId]?.injury ?? null) !== null);
    };
    // Played ahead on a game of its own, since playing on shares the game it starts from.
    const seed = firstSeedWhere('report-o', (each) => each, (each) => comesHomeInjured(hardFrom(each)), 'a Party home with an Injury');
    render(<App initial={hardFrom(seed)} />);

    fireEvent.click(screen.getByRole('button', { name: 'Fast forward' }));
    await idle();

    const home = screen.getByRole('region', { name: 'Guild' });
    expect(within(screen.getByTestId('stop')).getByText("Stopped: The Lantern's Party came home.")).toBeDefined();
    expect(within(home).queryByRole('heading', { level: 3, name: 'Came home' })).toBeNull();
    const report = within(home).getByRole('region', { name: /^Quest report: / });
    const quest = /^Quest report: (.+)$/.exec(within(report).getByRole('heading', { level: 3 }).textContent ?? '')?.[1] ?? '';
    expect(within(report).getByText(/^(Success|Strong success|Failure)$/)).toBeDefined();
    // Each Encounter the engine played names its Degree (DL-152).
    const encounters = within(report).getByRole('heading', { level: 4, name: 'Encounters' }).parentElement as HTMLElement;
    const steps = Array.from(encounters.querySelectorAll('.report__list > li'))
      .map((item) => item.textContent ?? '')
      .filter((words) => / \(Encounter \d+\)/.test(words));
    expect(steps.length).toBeGreaterThan(0);
    for (const step of steps) expect(step).toMatch(/ \(Encounter \d+\), a (Triumph|Success|Setback|Failure)\b/);
    const wealth = /^Wealth ([+-]?\d+)$/.exec(within(report).getByText(/^Wealth /).textContent ?? '')?.[1];
    const fame = /^Fame ([+-]?\d+)$/.exec(within(report).getByText(/^Fame /).textContent ?? '')?.[1];
    expect(within(report).getByText(/^XP \+\d+ each$/)).toBeDefined();
    // The Party comes home with an Injury: named, with the night it heals.
    expect(within(report).getByText(/^Injured: .+, healing on the night of Year \d+ Day \d+$/)).toBeDefined();
    // The same outcome, as the History narrates it, new, on the player's Guild.
    const line = inHistory(new RegExp(`^The Lantern's Party came home from ${quest} and \\w+.*: Wealth ${wealth?.replace('+', '\\+')}, Fame ${fame?.replace('+', '\\+')}\\.`));
    expect(line.classList.contains('is-new')).toBe(true);
  });

  test('says when nothing waits, and names the Transfer Offers waiting with the way to answer them', () => {
    const { unmount } = render(<App initial={started()} />);
    expect(within(screen.getByRole('region', { name: 'Guild' })).getByText(/^Nothing is waiting on you\./)).toBeDefined();
    unmount();

    render(<App initial={withOffer(started())} />);
    const home = screen.getByRole('region', { name: 'Guild' });
    expect(within(home).getByText(/ offers \d+ Wealth for .+, until the night of Year \d+ Day \d+\.$/)).toBeDefined();
    fireEvent.click(within(home).getByRole('button', { name: 'Answer on the Roster' }));
    expect(document.activeElement).toBe(screen.getByRole('heading', { level: 3, name: 'Transfer Offers' }));
  });
});

describe('a Party’s return opens its report on Guild › Home (DL-112 item 8)', () => {
  /** A Party of the player's out, and the game played to the Turn before the night it comes home. */
  function onTheEve(): GameState {
    const out = withPartyOut(started('reducer-test'));
    const party = Object.values(out.document?.world.parties ?? {})[0];
    if (party === undefined || out.document === null) throw new Error('no Party out');
    return played(out, { kind: 'advance', turns: party.returnsOnTurn - out.document.world.turn - 1 });
  }

  function reportHeading(): HTMLElement {
    return within(screen.getByRole('region', { name: 'Guild' })).getByRole('heading', { level: 3, name: /^Quest report: / });
  }

  test.each(['Board', 'History'] as const)('after one Turn, from the %s: Guild › Home at the report, with the keyboard on its heading', async (from) => {
    render(<App initial={onTheEve()} />);
    openView(from);

    fireEvent.click(screen.getByRole('button', { name: 'Advance a Turn' }));
    await idle();

    expect(navButton('Guild').getAttribute('aria-current')).toBe('page');
    expect(within(screen.getByRole('region', { name: 'Guild' })).getByRole('tab', { name: 'Home' }).getAttribute('aria-selected')).toBe('true');
    // The keyboard moves in an effect after the play's render, which a busy machine may paint first.
    await waitFor(() => expect(document.activeElement).toBe(reportHeading()));
  });

  test.each(['Board', 'History'] as const)('after a fast forward, from the %s: Guild › Home at the report, with the keyboard on its heading', async (from) => {
    render(<App initial={withPartyOut(started('reducer-test'))} />);
    openView(from);

    fireEvent.click(screen.getByRole('button', { name: 'Fast forward' }));
    await idle();

    expect(navButton('Guild').getAttribute('aria-current')).toBe('page');
    await waitFor(() => expect(document.activeElement).toBe(reportHeading()));
  });

  test('a play that brings no Party home leaves the view where it was', async () => {
    render(<App initial={withPartyOut(started('reducer-test'))} />);
    openView('Board');

    fireEvent.click(screen.getByRole('button', { name: 'Advance a Turn' }));
    await idle();

    expect(navButton('Board').getAttribute('aria-current')).toBe('page');
  });

  test('"Open the report" on an older entry shows it on Guild › Home; closing it returns to Home', async () => {
    render(<App initial={withPartyOut(started('reducer-test'))} />);
    fireEvent.click(screen.getByRole('button', { name: 'Fast forward' }));
    await idle();
    await waitFor(() => expect(document.activeElement).toBe(reportHeading()));
    const quest = reportHeading().textContent;
    // A Turn on, the report is no longer the last play's: Home no longer shows it.
    fireEvent.click(screen.getByRole('button', { name: 'Advance a Turn' }));
    await idle();
    openView('Guild');
    expect(within(screen.getByRole('region', { name: 'Guild' })).queryByRole('heading', { level: 3, name: /^Quest report: / })).toBeNull();

    openView('History');
    fireEvent.click(within(inHistory(/^The Lantern's Party came home from /)).getByRole('button', { name: /^Open the report: / }));

    expect(navButton('Guild').getAttribute('aria-current')).toBe('page');
    expect(document.activeElement).toBe(reportHeading());
    expect(reportHeading().textContent).toBe(quest);
    // It stands in Home's place: no digest beside it.
    expect(within(screen.getByRole('region', { name: 'Guild' })).queryByRole('heading', { level: 3, name: 'Parties out' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Close the report' }));

    expect(within(screen.getByRole('region', { name: 'Guild' })).queryByRole('heading', { level: 3, name: /^Quest report: / })).toBeNull();
    expect(within(screen.getByRole('region', { name: 'Guild' })).getByRole('tabpanel', { name: 'Home' })).toBeDefined();
    expect(document.activeElement).toBe(screen.getByRole('heading', { level: 2, name: 'Guild' }));
  });

  test('"Open the report" in the rail shows it on Guild › Home too', async () => {
    render(<App initial={withPartyOut(started('reducer-test'))} />);
    fireEvent.click(screen.getByRole('button', { name: 'Fast forward' }));
    await idle();
    openView('Roster');

    fireEvent.click(within(screen.getByRole('complementary', { name: 'Latest for The Lantern' })).getByRole('button', { name: /^Open the report: / }));

    expect(document.activeElement).toBe(reportHeading());
  });
});

describe('a game in hand', () => {
  test('advances a Turn, and narrates what happened in it', async () => {
    render(<App initial={started()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Advance a Turn' }));
    await idle();

    expect(screen.getByTestId('time').textContent).toBe('Year 1 Day 1, afternoon');
    // What the Turn added is the History's newest, under its Day and time of day, each line marked new.
    const history = wholeHistory();
    const before = started().document?.history.entries.length ?? 0;
    const { entries, fresh } = summary(history);
    expect(fresh).toBe(entries - before);
    expect(fresh).toBeGreaterThan(0);
    const [newest] = within(history).getAllByRole('heading', { level: 4 });
    expect(newest?.textContent).toBe('Year 1 Day 1, afternoon');
    const lines = historyLines(newest?.parentElement as HTMLElement);
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) expect(line.classList.contains('is-new')).toBe(true);
  });

  test('after a fast forward, the History has all it added, marked new, twenty entries a page', async () => {
    // A Party out on a Quest of ten Days: the fast forward plays until it comes home.
    const state = withPartyOut(started('reducer-test'));
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

  test('beside the view, the History rail gives the Guild’s latest entries, the new ones marked', () => {
    // The last play sent a Party: a purchase is no longer in the Guild's History, nor the rail.
    render(<App initial={withPartyOut(started())} />);

    const rail = screen.getByRole('complementary', { name: 'Latest for The Lantern' });
    const [newest, next] = within(rail).getAllByRole('listitem');
    expect(newest?.textContent).toMatch(/^Year 1 Day 1, morningNew The Lantern sent .+ on .+, back on the night of Year \d+ Day \d+\.$/);
    expect(newest?.classList.contains('is-new')).toBe(true);
    expect(next?.classList.contains('is-new')).toBe(false);
    expect(within(rail).getByText('1 new')).toBeDefined();
    expect(navButton('History').textContent).toBe('History1, 1 new');
  });
});

describe('fast forward in steps, with progress and a Stop (DL-96)', () => {
  /** The Turns the player's Stop says it played. */
  function stoppedAfter(): number {
    const sentence = within(screen.getByTestId('stop')).getByText(/^Stopped: you asked to stop, after \d+ Turns\.$/).textContent ?? '';
    return Number(/after (\d+) Turns/.exec(sentence)?.[1]);
  }

  test('between steps the status bar shows the Turns played, the Day reached and the countdown below the floor; plays wait, and the game in hand stands', async () => {
    // A Party out, home partway through the second or third step, before the night of Day 31 (DL-272);
    // Wealth below the floor since its first Day, before the fast forward, so its countdown stands and no
    // new crossing stops it (DL-101).
    const out = withPartyHomeInALaterStep('reducer-test', fastForwardStepTurns);
    const home = whenOfTurn(documentOf(out).world.turn + turnsUntilHome(out), documentOf(out).meta.config);
    render(<App initial={withWealth(out, -100, 0)} />);

    fireEvent.click(screen.getByRole('button', { name: 'Fast forward' }));

    await waitFor(() => {
      const progress = within(screen.getByRole('banner')).getByTestId('progress');
      expect(within(progress).getByText('Played 30 Turns so far. Now Year 1 Day 11, morning.')).toBeDefined();
      expect(
        within(progress).getByText(
          'The Lantern has been below the Bankruptcy floor since Year 1 Day 1: Bankruptcy on the night of Year 1 Day 31 unless Wealth is back ' +
            'to 0 or more on a night by then, after any Upkeep due.',
        ),
      ).toBeDefined();
      expect(within(time()).getByRole('status').textContent).toBe('Playing the Turns…');
      for (const name of ['Advance a Turn', 'Fast forward', 'More ways to Fast forward']) {
        expect((within(time()).getByRole('button', { name }) as HTMLButtonElement).disabled).toBe(true);
      }
      expect(within(progress).getByRole('button', { name: 'Stop the Fast forward' })).toBeDefined();
      // The game in hand, and so the status bar, stand until the fast forward ends (DL-96).
      expect(screen.getByTestId('time').textContent).toBe('Year 1 Day 1, morning');
    });
    await idle();

    expect(screen.queryByTestId('progress')).toBeNull();
    expect(within(screen.getByTestId('stop')).getByText("Stopped: The Lantern's Party came home.")).toBeDefined();
    expect(screen.getByTestId('time').textContent).toBe(home);
    // The History marks both steps' entries new: all it gained in the fast forward.
    const { entries, fresh } = summary(wholeHistory());
    expect(fresh).toBe(entries - documentOf(out).history.entries.length);
  });

  test('Stop leaves the game, the log and the sentence as its step left them, and "Fast forward again" goes on from there', async () => {
    // The Roster released and Wealth to spare: a year with nothing of the player's to stop it.
    render(<App initial={withRosterReleased(started())} />);

    fireEvent.click(screen.getByRole('button', { name: 'Fast forward' }));
    await waitFor(() => expect(screen.getByTestId('progress')).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: 'Stop the Fast forward' }));
    await idle();

    const first = stoppedAfter();
    expect(first % 30).toBe(0);
    expect(first).toBeGreaterThan(0);
    expect(first).toBeLessThan(1080);
    expect(screen.queryByTestId('progress')).toBeNull();
    expect(screen.getByTestId('time').textContent).toBe(`Year 1 Day ${first / 3 + 1}, morning`);
    // The History marks new all the steps played until the Stop.
    const { entries, fresh } = summary(wholeHistory());
    expect(fresh).toBe(entries - (withRosterReleased(started()).document?.history.entries.length ?? 0));
    expect((screen.getByRole('button', { name: 'Advance a Turn' }) as HTMLButtonElement).disabled).toBe(false);

    openView('Guild');
    fireEvent.click(within(screen.getByTestId('stop')).getByRole('button', { name: 'Fast forward again' }));
    await waitFor(() => expect(screen.getByTestId('progress')).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: 'Stop the Fast forward' }));
    await idle();

    const second = stoppedAfter();
    expect(screen.getByTestId('time').textContent).toBe(`Year 1 Day ${(first + second) / 3 + 1}, morning`);
  }, 30_000);

  test('"Export this game" waits between steps, when the game in hand\'s History runs ahead of its World; stopped, it exports a save that loads (DL-97)', async () => {
    // Between steps the game in hand shares its History with the steps' games (ADR-0008): a save of
    // it would hold Turns its World has not played, and the page's own load refuses one.
    render(<App initial={withRosterReleased(started())} />);
    const exporting = () => within(section('This game')).getByRole('button', { name: 'Export this game' }) as HTMLButtonElement;

    fireEvent.click(screen.getByRole('button', { name: 'Fast forward' }));
    await waitFor(() => expect(screen.getByTestId('progress')).toBeDefined());
    expect(exporting().disabled).toBe(true);
    fireEvent.click(exporting());
    expect(download).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Stop the Fast forward' }));
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
  /** A Transfer Offer standing and older rules: every part the page has is drawn. Made once, and only rendered. */
  const everyPart = withOlderRules(withOffer(started()));

  test('before a game, its one region says what it is for', () => {
    render(<App />);
    const regions = screen.getAllByRole('region');

    expect(regions).toHaveLength(1);
    for (const region of regions) expect(described(region)).toMatch(/^[A-Z].{40,}\.$/);
  });

  // Where each region is drawn: the view that holds it, or the game menu; its parts, described as a
  // region is; the Guild's, tabs' panels (DL-115, DL-116). Together the rows' regions are every region the
  // page draws, each in the one place it is, so a region added anywhere fails the case it lands in (DL-236).
  test.each<[ViewName | 'the game menu', string[], string[]]>([
    ['Guildmaster', ['guildmaster'], []],
    ['Guild', ['guild'], ['Home', 'Hall', 'Stores', 'Treasury']],
    ['Roster', ['roster', 'offers', 'pool'], ['Transfer Offers', 'Unattached pool']],
    ['Board', ['board'], []],
    ['Rankings', ['rankings', 'guilds', 'patrons'], ['Guilds', 'Patrons']],
    ['Market', ['market', 'buy', 'sell'], ['Buy', 'Sell']],
    ['History', ['history'], []],
    ['the game menu', ['rules', 'game'], ['New rules available', 'This game']],
  ])('%s says what it is for, and each of its parts, in its About or the menu: %j', (where, ids, parts) => {
    render(<App initial={everyPart} />);
    const scope = where === 'the game menu' ? openMenu() : openView(where);
    const regions = where === 'the game menu' ? within(scope).getAllByRole('region') : screen.getAllByRole('region');

    expect(regions.map((region) => region.getAttribute('aria-labelledby')).sort()).toEqual(ids.map((id) => `${id}-heading`).sort());
    for (const id of ids) expect(document.getElementById(`${id}-help`)?.textContent, id).toMatch(/^[A-Z].{40,}\.$/);
    if (where !== 'the game menu') {
      // The view's sentence and its parts' are in its "About this view", closed until asked for.
      const about = within(scope).getByText('About this view').closest('details');
      expect(about?.open).toBe(false);
      const helpIds = [...regions, ...screen.queryAllByRole('tabpanel')].map((region) => region.getAttribute('aria-describedby'));
      for (const id of helpIds) expect(about?.querySelector(`#${id}`), `${where}'s About holds ${id}`).not.toBeNull();
      expect(described(scope)).toMatch(/^[A-Z].{40,}\.$/);
    }
    for (const part of parts) expect(described(section(part)), part).toMatch(/^[A-Z].{40,}\.$/);
  });

  test('the time controls say what time is and how many Turns a step of fast forward plays: the constant the steps play (DL-97)', () => {
    render(<App initial={started()} />);

    expect(described(time())).toMatch(/^Time moves only here; .+\.$/);
    expect(described(time())).toContain(`It plays them ${fastForwardStepTurns} Turns, ten Days, at a time`);
  });

  /** A Transfer Offer standing: its controls drawn. Made once, and only rendered. */
  const offered = withOffer(started());

  // Each view, each of the Guild's parts, its tab opened (Stores and Treasury among them, DL-116), and the game menu.
  test.each<[string, () => void]>([
    ...views.map((view): [string, () => void] => [view, () => void openView(view)]),
    ...(['Home', 'Hall', 'Stores', 'Treasury'] as const).map((part): [string, () => void] => [`the Guild's ${part}`, () => void openGuildPart(part)]),
    ['the game menu', () => void openMenu()],
  ])('every control has a name that says what it does: %s', (where, open) => {
    const { container } = render(<App initial={offered} />);
    open();

    const buttons = within(container).getAllByRole('button');
    expect(within(container).getAllByRole('button', { name: /\S/ }), where).toHaveLength(buttons.length);
    for (const role of ['textbox', 'searchbox', 'combobox', 'spinbutton', 'checkbox'] as const) {
      const controls = within(container).queryAllByRole(role);
      expect(within(container).queryAllByRole(role, { name: /\S/ }), `${where}: ${role}`).toHaveLength(controls.length);
    }
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

    // The Quest has left the Board, and its card is the Party out card in its place (DL-104).
    const [sent, ...others] = named();
    expect(sent?.dataset.testid).toBe('sent');
    expect(others.filter((card) => card.dataset.testid !== 'sent')).toHaveLength(before - 1);
    // The play's line is the History's newest, marked new (DL-105).
    expect(inHistory(new RegExp(`^The Lantern sent .+ on ${questName}, back on the night of Year \\d+ Day \\d+`)).classList.contains('is-new')).toBe(true);
    expect(within(rosterList()).getAllByText(/^Away with a Party, back on the night of Year \d+ Day \d+$/).length).toBeGreaterThan(0);
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
        // A Stat's row in its area's block: its value, then its Outlook as a chip.
        const cells = within(row).queryAllByRole('cell');
        return cells.length === 2 ? [cells[1]?.textContent?.replace(/^Outlook /, '')] : [];
      });
    expect(outlooks.length).toBeGreaterThan(10);
    for (const outlook of outlooks) expect(['Modest', 'Promising', 'Exceptional']).toContain(outlook);
    expect(within(page).getByRole('heading', { name: 'History, newest first' })).toBeDefined();
    expect(within(page).getByText(/^Page 1 of \d+, \d+ (entry|entries) in all, newest first\./)).toBeDefined();
    // Grouped by date and time of day, as the History is; a first page has no newer one.
    expect(within(page).getAllByRole('heading', { level: 5 }).length).toBeGreaterThan(0);
    expect((within(page).queryByRole('button', { name: 'Newer' }) as HTMLButtonElement | null)?.disabled ?? true).toBe(true);

    fireEvent.click(within(page).getByRole('button', { name: 'Back to the Roster' }));
    expect(within(section('Roster')).queryByRole('article')).toBeNull();
  });
});

describe('the test-only switch for modules, the query parameter ?modules=probe', () => {
  afterEach(() => {
    window.history.replaceState(null, '', '/');
  });

  /** Opens the page at `address`, starts a game from the firing seed through the form, and plays eleven Turns one at a time. */
  async function elevenTurns(address: string): Promise<void> {
    window.history.replaceState(null, '', address);
    render(<App />);
    // Seed `modules`: the probe's stream first draws below 0.02 on the eleventh Turn, the night of Year 1 Day 4.
    startNewGame({ guildName: 'The Lantern', guildmasterName: 'Ada Vell', seed: 'modules' });
    await idle();
    for (let turn = 1; turn <= 11; turn += 1) {
      fireEvent.click(screen.getByRole('button', { name: 'Advance a Turn' }));
      await idle();
    }
    expect(screen.getByTestId('time').textContent).toBe('Year 1 Day 4, night');
  }

  test('with it, the page says the probe is installed, and its probe.fired event is in the log on a seed known to fire one', async () => {
    await elevenTurns('/?modules=probe');

    expect(screen.getByText('Installed for testing: the probe Module.')).toBeDefined();
    expect(within(openMenu()).getByText('The probe Module')).toBeDefined();
    // In the whole History, new, under the night it fired.
    wholeHistory();
    const fired = inHistory(/^The probe Module recorded probe\.fired for .+\.$/);
    expect(fired.classList.contains('is-new')).toBe(true);
    expect(fired.closest('.history-group')?.querySelector('h4')?.textContent).toBe('Year 1 Day 4, night');
    // Its effects' events follow it, in the page's words for the core's own.
    expect(inHistory(/'s Wealth went from \d+ to \d+\.$/).classList.contains('is-new')).toBe(true);
  }, 30_000);

  // With none installed, no module plays (reducer.test.ts's "with none, ... every engine call is made without
  // one"; modules.test.ts reads the query).
  test('without it, nothing is installed: no word of a module, on the page or in the game menu', () => {
    window.history.replaceState(null, '', '/');
    render(<App initial={started()} />);

    expect(screen.queryByText(/Installed for testing/)).toBeNull();
    expect(within(openMenu()).queryByText(/ Module$/)).toBeNull();
  });
});
