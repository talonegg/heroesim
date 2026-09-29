import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { App } from '../app';
import { played, started, withPartyOut, withRosterReleased, withTheGone, withWorldNews } from '../state/game.test-support';
import { historyView } from '../state/history';
import { gameReducer, type GameState } from '../state/reducer';
import { History } from './history';
import { HistoryLinksContext } from './history-entries';
import { historyLines, inHistory, navButton, openDebugHistory, openView, section, sentenceOf } from './page.test-support';

// The History as the one place to read what happened (M9-S5, DL-105), driven through the page: it
// opens on the player's Guild, the last play's entries its newest and marked new; the World History
// and a Rival's are one choice away, a choice that holds, and the whole History is the game menu's
// debug view (M9-F4); groups by Day and time of day; a Party's
// Encounters and a Rival's routine folded, each opened by a button; the marks, each with a word or an
// icon; names that open whom they name; and each entity's page opening its History.

vi.mock('../state/history', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../state/history')>();
  return { ...actual, historyView: vi.fn(actual.historyView) };
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

async function idle(): Promise<void> {
  await waitFor(() => expect(document.querySelector('main')?.getAttribute('aria-busy')).toBe('false'));
}

function render_(state: GameState): void {
  render(<App initial={state} />);
}

/** The History's title, the `h3` over its page. */
function title(): string {
  return within(section('History')).getByRole('heading', { level: 3 }).textContent ?? '';
}

function whose(): HTMLElement {
  return within(section('History')).getByRole('group', { name: 'Whose History' });
}

/** A `Day 5, night` as the Turn it names, to put groups in order. */
function turnOf(when: string): number {
  const [, day = '0', time = ''] = /^Day (\d+), (morning|afternoon|night)$/.exec(when) ?? [];
  return Number(day) * 3 + ['morning', 'afternoon', 'night'].indexOf(time);
}

/** A game with a Party of the player's home, and the fast forward that brought it home the last play. */
function cameHome(): GameState {
  return played(withPartyOut(started('reducer-test')), { kind: 'fastForward', until: [] });
}

describe('one view, opened on the player’s Guild (M9-S5)', () => {
  test("opens on the player's Guild, grouped by Day and time of day, newest first, what the last play added marked new", () => {
    render_(cameHome());
    const history = section('History');

    expect(title()).toBe('The History of The Lantern');
    expect(within(whose()).getByRole('button', { name: 'The Lantern, your Guild' }).getAttribute('aria-pressed')).toBe('true');
    // No section of its own for the last play, and no filter to tick.
    expect(screen.queryByRole('region', { name: 'Since your last action' })).toBeNull();
    expect(within(history).queryByRole('checkbox')).toBeNull();
    const groups = within(history)
      .getAllByRole('heading', { level: 4 })
      .map((heading) => heading.textContent ?? '');
    expect(groups.length).toBeGreaterThan(1);
    expect(groups.map(turnOf)).toEqual(groups.map(turnOf).sort((a, b) => b - a));
    // Each group is a list named by its Day and time of day.
    expect(within(history).getByRole('list', { name: groups[0] ?? '' })).toBeDefined();
    // Every line is the player's Guild's, and what the last play appended is marked, in a word.
    const lines = historyLines(history);
    expect(lines.every((line) => line.classList.contains('entry--mine'))).toBe(true);
    const fresh = lines.filter((line) => line.classList.contains('is-new'));
    expect(fresh.length).toBeGreaterThan(0);
    for (const line of fresh) expect(line.querySelector(':scope > .entry__line > .new-tag')?.textContent).toBe('New');
    // As many new as the navigation's count says, and the page's summary.
    const count = Number(/(\d+) new$/.exec(navButton('History').textContent ?? '')?.[1]);
    expect(within(history).getByText(new RegExp(`^Page 1 of \\d+, \\d+ entries in all, newest first\\. ${count} new since your last action\\.$`))).toBeDefined();
  });

  test('gives the world and each Rival’s in one choice, a choice that holds from view to view and play to play', async () => {
    render_(played(started(), { kind: 'advance', turns: 6 }));

    fireEvent.click(within(whose()).getByRole('button', { name: 'The world' }));
    expect(title()).toBe('The World History');
    expect(within(whose()).getByRole('button', { name: 'The world' }).getAttribute('aria-pressed')).toBe('true');
    const rival = within(whose()).getAllByRole('button').at(-1) as HTMLElement;
    fireEvent.click(rival);
    expect(title()).toBe(`The History of ${rival.textContent}`);

    fireEvent.click(within(whose()).getByRole('button', { name: 'The world' }));
    openView('Board');
    fireEvent.click(screen.getByRole('button', { name: 'Advance a Turn' }));
    await idle();
    expect(title()).toBe('The World History');
  });

  test('pages twenty entries at a time; "Newest" returns to the top, the page and the keyboard', () => {
    render_(played(started(), { kind: 'advance', turns: 12 }));
    const history = (): HTMLElement => section('History');
    openDebugHistory();

    fireEvent.click(within(history()).getByRole('button', { name: 'Oldest' }));
    // The oldest group opens with the world's first entry.
    const [oldest] = historyLines(history()).slice(-1).map((line) => line.closest('ol')?.querySelector('li.entry') as HTMLElement);
    expect(sentenceOf(oldest as HTMLElement)).toBe('The world was made from seed app-test.');
    expect((within(history()).getByRole('button', { name: 'Older' }) as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(within(history()).getByRole('button', { name: 'Newest' }));
    expect(within(history()).getByText(/^Page 1 of \d+, /)).toBeDefined();
    expect(document.activeElement).toBe(history().querySelector('.history__top'));
    expect(within(document.activeElement as HTMLElement).getByRole('heading', { level: 3, name: 'Debug: the whole History' })).toBeDefined();
  });

  test('reads its page again when the game, the log or the page changes, and not at each step of a fast forward', () => {
    // v1.0.1-S5, DL-96 item 3: a year's History read at every step would be narrated again 36 times.
    const first = gameReducer(gameReducer(withRosterReleased(started()), { kind: 'fastForward', until: [] }), { kind: 'settle' });
    const second = gameReducer(first, { kind: 'settle' });
    expect(second.document).toBe(first.document);
    expect(second.log).toBe(first.log);
    const page = (state: GameState) => (
      <HistoryLinksContext value={{ log: state.log, onName: () => undefined, onHistory: () => undefined }}>
        <History document={state.document as NonNullable<GameState['document']>} busy={false} play={() => undefined} whose={null} onWhose={() => undefined} />
      </HistoryLinksContext>
    );

    const { rerender } = render(page(first));
    const reads = vi.mocked(historyView).mock.calls.length;
    rerender(page(second));
    expect(vi.mocked(historyView).mock.calls.length).toBe(reads);

    rerender(page(gameReducer(second, { kind: 'stop' })));
    expect(vi.mocked(historyView).mock.calls.length).toBe(reads + 1);
  });
});

describe('folds, and the marks on each line (M9-S5)', () => {
  test("folds a Rival's Party's Encounters under how its Quest went, marked with an icon and a word, and opens them (the player's return is one entry, M9-F5)", () => {
    render_(cameHome());
    // A Rival's own History: the last choice.
    fireEvent.click(within(whose()).getAllByRole('button').at(-1) as HTMLElement);
    const history = (): HTMLElement => section('History');
    const outcomes = (): HTMLElement[] => historyLines(history()).filter((line) => /'s Party came home from /.test(sentenceOf(line)) && line.querySelector(':scope > button.fold') !== null);
    // Older, a page at a time, until a Rival's Party's return is on one.
    while (outcomes().length === 0 && !(within(history()).getByRole('button', { name: 'Older' }) as HTMLButtonElement).disabled) {
      fireEvent.click(within(history()).getByRole('button', { name: 'Older' }));
    }
    const [outcome] = outcomes();
    if (outcome === undefined) throw new Error("no Rival's Party came home");

    expect(sentenceOf(outcome)).toMatch(/^.+'s Party came home from .+ and (failed|succeeded|succeeded strongly): Wealth [+-]?\d+, Fame [+-]?\d+\./);
    expect(outcome.classList.contains('entry--rival')).toBe(true);
    const mark = within(outcome).getByText(/^(Success|Strong success|Failure)$/).closest('.chip') as HTMLElement;
    expect(mark.querySelector('svg')).not.toBeNull();
    const fold = within(outcome).getByRole('button', { name: /^\d+ Encounters?( and \d+ consumables? used)?$/ });
    const count = Number(/^(\d+)/.exec(fold.textContent ?? '')?.[1]);
    const folded = document.getElementById(fold.getAttribute('aria-controls') ?? '') as HTMLElement;
    expect(fold.getAttribute('aria-expanded')).toBe('false');
    expect(folded.hidden).toBe(true);

    fireEvent.click(fold);

    expect(fold.getAttribute('aria-expanded')).toBe('true');
    expect(folded.hidden).toBe(false);
    const encounters = historyLines(folded).map(sentenceOf).filter((sentence) => /\(Encounter \d+\)/.test(sentence));
    expect(encounters).toHaveLength(count);
    for (const sentence of encounters) expect(sentence).toMatch(/^.+'s Party (came through|failed at) .+ \(Encounter \d+\)/);
  });

  test("folds each Rival's routine in a group into one line for the Guild, muted, and opens it", () => {
    render_(cameHome());
    // A Rival's own History: the last choice.
    fireEvent.click(within(whose()).getAllByRole('button').at(-1) as HTMLElement);
    const history = (): HTMLElement => section('History');
    const routineOn = (): HTMLElement[] => historyLines(history()).filter((line) => line.classList.contains('entry--routine'));
    // Older, a page at a time, until a Rival's routine is folded on one.
    while (routineOn().length === 0 && !(within(history()).getByRole('button', { name: 'Older' }) as HTMLButtonElement).disabled) {
      fireEvent.click(within(history()).getByRole('button', { name: 'Older' }));
    }
    const routine = routineOn();

    expect(routine.length).toBeGreaterThan(0);
    const [first] = routine;
    if (first === undefined) throw new Error('no routine');
    expect(first.classList.contains('entry--rival')).toBe(true);
    const [, guild = '', many = '0'] = /^(.+): (\d+) routine entries \(.+\)\.$/.exec(sentenceOf(first)) ?? [];
    expect(within(first).getByRole('button', { name: guild })).toBeDefined();
    const fold = within(first).getByRole('button', { name: `${many} entries` });

    fireEvent.click(fold);

    const folded = document.getElementById(fold.getAttribute('aria-controls') ?? '') as HTMLElement;
    expect(fold.getAttribute('aria-expanded')).toBe('true');
    expect(folded.hidden).toBe(false);
    expect(historyLines(folded)).toHaveLength(Number(many));
    for (const line of historyLines(folded)) expect(line.classList.contains('entry--rival')).toBe(true);
  });

  test("marks the player's lines, a Rival's and the world's apart, and a Milestone in words", () => {
    render_(played(started(), { kind: 'advance', turns: 6 }));
    openDebugHistory();
    fireEvent.click(within(section('History')).getByRole('button', { name: 'Oldest' }));
    const founded = inHistory('The Lantern was founded.');
    const oldest = historyLines(section('History'));
    fireEvent.click(within(section('History')).getByRole('button', { name: 'Newer' }));
    const lines = [...oldest, ...historyLines(section('History'))];

    for (const side of ['mine', 'rival', 'world']) expect(lines.some((line) => line.classList.contains(`entry--${side}`))).toBe(true);
    expect(founded.classList.contains('is-milestone')).toBe(true);
    expect(within(founded).getByText('Milestone:')).toBeDefined();
  });
});

describe('names that open whom they name (M9-S5)', () => {
  test("a Hero's name opens their page in the History, and back goes to the History it came from", () => {
    render_(withPartyOut(started()));
    const sent = inHistory(/^The Lantern sent .+ on .+, back on the night of Day \d+\.$/);
    const [, hero] = within(sent).getAllByRole('button');
    const name = hero?.textContent ?? '';

    fireEvent.click(hero as HTMLElement);

    const page = within(section('History')).getByRole('article');
    expect(within(page).getByRole('heading', { level: 3, name })).toBeDefined();
    // Their History on their page, grouped as the History is.
    expect(within(page).getByRole('heading', { level: 4, name: 'History, newest first' })).toBeDefined();
    expect(within(page).getAllByRole('heading', { level: 5 }).length).toBeGreaterThan(0);
    fireEvent.click(within(page).getByRole('button', { name: 'Back to the History of The Lantern' }));
    expect(title()).toBe('The History of The Lantern');
  });

  test("a Guild's name opens its page in the Rankings, and it opens the Guild's History", () => {
    render_(withPartyOut(started()));
    const sent = inHistory(/^The Lantern sent /);

    fireEvent.click(within(sent).getByRole('button', { name: 'The Lantern' }));

    const guilds = section('Guilds');
    expect(within(guilds).getByRole('heading', { level: 4, name: 'The Lantern' })).toBeDefined();
    expect(document.activeElement).toBe(within(guilds).getByRole('heading', { level: 4, name: 'The Lantern' }));
    fireEvent.click(within(guilds).getByRole('button', { name: 'Read the History of The Lantern' }));
    expect(title()).toBe('The History of The Lantern');
  });

  test("a Patron's and a Guildmaster's names open their History", () => {
    render_(started());
    openDebugHistory();
    const offered = historyLines(section('History')).find((line) => / offered .+\.$/.test(sentenceOf(line))) as HTMLElement;
    const [patron] = within(offered).getAllByRole('button');
    if (patron === undefined) throw new Error('no Patron named');
    const patronName = patron.textContent ?? '';

    fireEvent.click(patron);
    expect(title()).toBe(`The History of ${patronName}`);
    for (const line of historyLines(section('History'))) expect(sentenceOf(line)).toContain(patronName);

    fireEvent.click(within(whose()).getByRole('button', { name: 'The Lantern, your Guild' }));
    fireEvent.click(within(inHistory('Ada Vell leads The Lantern.')).getByRole('button', { name: 'Ada Vell' }));
    expect(title()).toBe('The History of Ada Vell');
  });
});

describe("each one's page opens their History (M9-S5)", () => {
  test("a Rival's page in the Rankings, a Patron and a Guildmaster", () => {
    render_(played(started(), { kind: 'advance', turns: 3 }));
    const guilds = section('Guilds');
    // The player's Guild is a row of the table too (M9-S6): a Rival's is one of the others.
    fireEvent.click(within(guilds).getAllByRole('button', { name: /^Open / }).find((each) => each.getAttribute('aria-label') !== 'Open The Lantern') as HTMLElement);
    const rival = within(guilds).getByRole('heading', { level: 4 }).textContent ?? '';
    fireEvent.click(within(guilds).getByRole('button', { name: `Read the History of ${rival}` }));
    expect(title()).toBe(`The History of ${rival}`);
    expect(within(whose()).getByRole('button', { name: rival }).getAttribute('aria-pressed')).toBe('true');

    // A Patron neutral both ways is folded under the count of them (M9-S6).
    const fold = within(section('Patrons')).queryByRole('button', { name: /^\d+ neutral$/ });
    if (fold !== null) fireEvent.click(fold);
    const [patron] = within(section('Patrons')).getAllByRole('button', { name: /^Read the History of / });
    const patronName = /^Read the History of (.+)$/.exec(patron?.getAttribute('aria-label') ?? '')?.[1];
    fireEvent.click(patron as HTMLElement);
    expect(title()).toBe(`The History of ${patronName}`);

    fireEvent.click(within(section('Guildmaster')).getByRole('button', { name: 'Read the History of Ada Vell' }));
    expect(title()).toBe('The History of Ada Vell');
  });

  test('the rail and the stop open the History on the player’s Guild, at its newest, whatever was chosen before', async () => {
    render_(withPartyOut(started('reducer-test')));
    fireEvent.click(within(whose()).getByRole('button', { name: 'The world' }));
    openView('Board');

    fireEvent.click(within(screen.getByRole('complementary', { name: 'Latest for The Lantern' })).getByRole('button', { name: 'Open the History' }));
    expect(title()).toBe('The History of The Lantern');

    fireEvent.click(within(whose()).getByRole('button', { name: 'The world' }));
    fireEvent.click(screen.getByRole('button', { name: 'Fast forward' }));
    await idle();
    fireEvent.click(within(screen.getByTestId('stop')).getByRole('button', { name: 'Read what happened' }));
    expect(title()).toBe('The History of The Lantern');
    expect(document.activeElement).toBe(within(section('History')).getByRole('heading', { level: 3 }));
    expect(inHistory(/^The Lantern's Party came home from /).classList.contains('is-new')).toBe(true);
  });
});

describe("the home view's outcomes open their line in the History (M9-S5)", () => {
  test('on the page it stands on, with the keyboard on it', () => {
    render_(cameHome());
    const home = screen.getByRole('region', { name: 'Guild' });
    const [outcome] = within(home).getAllByRole('listitem').filter((item) => item.classList.contains('outcome'));
    const quest = within(outcome as HTMLElement).getByRole('heading', { level: 4 }).textContent ?? '';

    fireEvent.click(within(outcome as HTMLElement).getByRole('button', { name: `Read it in the History: ${quest}` }));

    expect(title()).toBe('The History of The Lantern');
    const line = document.activeElement as HTMLElement;
    expect(line.classList.contains('entry')).toBe(true);
    expect(sentenceOf(line)).toMatch(new RegExp(`^The Lantern's Party came home from ${quest} and `));
    expect(line.classList.contains('is-new')).toBe(true);
  });

  test('the History opens on the page it is given', () => {
    const state = played(started(), { kind: 'advance', turns: 12 });
    render(
      <HistoryLinksContext value={{ log: state.log, onName: () => undefined, onHistory: () => undefined }}>
        <History document={state.document as NonNullable<GameState['document']>} busy={false} play={() => undefined} whose="all" onWhose={() => undefined} startPage={2} />
      </HistoryLinksContext>,
    );

    expect(screen.getByText(/^Page 3 of \d+, /)).toBeDefined();
  });
});

describe('anyone the History names, found by name (DL-74)', () => {
  test("a dead Hero's page opens from it, and a Hero gone from the world has their History", () => {
    const { state, dead, gone } = withTheGone(played(started(), { kind: 'advance', turns: 6 }));
    render_(state);
    const history = (): HTMLElement => section('History');
    const search = (): HTMLElement => within(history()).getByRole('searchbox', { name: 'Find someone in the History by name' });

    fireEvent.change(search(), { target: { value: dead.name.toLowerCase() } });
    expect(within(history()).getByRole('status').textContent).toMatch(/^\d+ found/);
    expect(within(within(history()).getByRole('list', { name: 'Found in the History' })).getByText('(Hero, dead)')).toBeDefined();
    fireEvent.click(within(history()).getByRole('button', { name: `Read ${dead.name}` }));

    const page = within(history()).getByRole('article');
    expect(within(page).getByRole('heading', { level: 3, name: dead.name })).toBeDefined();
    expect(within(page).getByText(/^died on Day \d+$/)).toBeDefined();
    // This Hero is dead by the test's own hand, with no Milestone recorded: none is drawn (M9-S3, the review's A5).
    expect(within(page).queryByRole('heading', { name: 'Milestones' })).toBeNull();
    expect(within(page).getByRole('heading', { level: 4, name: 'History, newest first' })).toBeDefined();
    expect(within(history()).queryByRole('list', { name: 'Found in the History' })).toBeNull();
    // No choice of the three is theirs.
    expect(within(whose()).getAllByRole('button').every((button) => button.getAttribute('aria-pressed') === 'false')).toBe(true);
    fireEvent.click(within(page).getByRole('button', { name: 'Back to the History of The Lantern' }));
    expect(title()).toBe('The History of The Lantern');

    fireEvent.change(search(), { target: { value: gone.name } });
    expect(within(history()).getByText('(Hero, no longer in the world)')).toBeDefined();
    fireEvent.click(within(history()).getByRole('button', { name: `Read ${gone.name}` }));
    expect(within(history()).queryByRole('article')).toBeNull();
    expect(title()).toBe(`The History of ${gone.name}`);
    expect(inHistory(new RegExp(`^${gone.name}, .+, joined the Unattached pool\\.$`))).toBeDefined();

    fireEvent.change(search(), { target: { value: 'no one is called this' } });
    expect(within(history()).getByRole('status').textContent).toBe('No one the History names is called that.');
  });
});

describe("the History's scopes (M9-F4, DL-111 item 4, DL-112 item 7)", () => {
  test('the choices are your Guild, the world and each Rival: the whole History is not among them', () => {
    render_(played(started(), { kind: 'advance', turns: 3 }));
    const labels = within(whose())
      .getAllByRole('button')
      .map((button) => button.textContent ?? '');

    expect(labels.slice(0, 2)).toEqual(['The Lantern, your Guild', 'The world']);
    expect(labels.length).toBeGreaterThan(2);
    expect(labels.some((label) => /whole History/.test(label))).toBe(false);
  });

  test("your Guild's History leaves out the Heroes' XP and Morale, the Upkeep and the Market; a Hero's page keeps their XP", () => {
    const state = played(cameHome(), { kind: 'buy', definitionKey: 'padded-jack', quantity: 1 });
    render_(state);
    const history = (): HTMLElement => section('History');
    const sentences: string[] = [];
    for (;;) {
      sentences.push(...historyLines(history()).map(sentenceOf));
      const older = within(history()).queryByRole('button', { name: 'Older' }) as HTMLButtonElement | null;
      if (older === null || older.disabled) break;
      fireEvent.click(older);
    }

    expect(sentences.some((sentence) => / Party came home from /.test(sentence))).toBe(true);
    for (const pattern of [/ gained \d+ XP\.$/, /Morale/, / paid \d+ Upkeep/, / bought .+ at the Market/, /Regard/]) {
      expect(sentences.filter((sentence) => pattern.test(sentence)), String(pattern)).toEqual([]);
    }
    // The purchase was the last play: nothing of it is new in the Guild's History, or on the navigation.
    expect(navButton('History').textContent).not.toMatch(/new$/);
    expect(within(history()).queryByText(/new since your last action/)).toBeNull();
  });

  test('the world: every Guild’s news, grouped by Day and time of day, with no folds', () => {
    render_(played(withWorldNews(started('history-world')), { kind: 'advance', turns: 120 }));
    fireEvent.click(within(whose()).getByRole('button', { name: 'The world' }));
    const history = (): HTMLElement => section('History');
    const sentences: string[] = [];
    for (;;) {
      expect(within(history()).queryAllByRole('button', { name: /Encounter|entries$/ })).toEqual([]);
      expect(history().querySelectorAll('.fold')).toHaveLength(0);
      sentences.push(...historyLines(history()).map(sentenceOf));
      const older = within(history()).queryByRole('button', { name: 'Older' }) as HTMLButtonElement | null;
      if (older === null || older.disabled) break;
      fireEvent.click(older);
    }

    expect(title()).toBe('The World History');
    expect(within(history()).getAllByRole('heading', { level: 4 }).every((heading) => /^Day \d+, (morning|afternoon|night)$/.test(heading.textContent ?? ''))).toBe(true);
    // A fold, a Succession, a Rival's Quest taken and resolved, a Patron's band, a Guild founded, the world made.
    for (const pattern of [/ and folded\.$/, / retired at \d+ as Guildmaster of .+ succeeded them\.$/, / sent .+ on .+, back on /, / Party came home from /, /'s Regard for /, /The world was made from seed history-world\./, / was founded\./]) {
      expect(sentences.some((sentence) => pattern.test(sentence)), String(pattern)).toBe(true);
    }
    expect(sentences.some((sentence) => /^(?!The Lantern).+ Party came home from /.test(sentence))).toBe(true);
    // No step, Upkeep, purchase, XP or warning of the floor.
    for (const pattern of [/\(Encounter \d+\)/, / gained \d+ XP\.$/, /Upkeep/, / bought /, /below the Bankruptcy floor/]) {
      expect(sentences.filter((sentence) => pattern.test(sentence)), String(pattern)).toEqual([]);
    }
  });

  test('the game menu opens the whole History: every entry with its event type, unfolded, no choice pressed, the search still there', () => {
    const { state, dead } = withTheGone(played(withPartyOut(started('reducer-test')), { kind: 'fastForward', until: [] }));
    render_(state);

    const history = openDebugHistory();

    expect(screen.queryByRole('dialog', { name: 'Game' })).toBeNull();
    expect(title()).toBe('Debug: the whole History');
    expect(document.activeElement).toBe(within(history).getByRole('heading', { level: 3 }));
    expect(within(whose()).getAllByRole('button').every((button) => button.getAttribute('aria-pressed') === 'false')).toBe(true);
    const lines = historyLines(history);
    expect(lines.length).toBeGreaterThanOrEqual(20);
    for (const line of lines) expect(line.querySelector('.entry__type')?.textContent).toMatch(/^[a-z-]+\.[a-z-]+$/);
    expect(history.querySelectorAll('.fold')).toHaveLength(0);
    // What the Guild's History leaves out is here: the Heroes' XP of the return.
    fireEvent.click(within(history).getByRole('button', { name: 'Older' }));
    const all: string[] = [];
    for (;;) {
      all.push(...historyLines(section('History')).map((line) => line.querySelector('.entry__type')?.textContent ?? ''));
      const older = within(section('History')).getByRole('button', { name: 'Older' }) as HTMLButtonElement;
      if (older.disabled) break;
      fireEvent.click(older);
    }
    for (const type of ['hero.xp-gained', 'quest.encounter', 'guild.upkeep-paid', 'world.created']) expect(all, type).toContain(type);

    fireEvent.change(within(section('History')).getByRole('searchbox', { name: 'Find someone in the History by name' }), { target: { value: dead.name } });
    expect(within(section('History')).getByRole('button', { name: `Read ${dead.name}` })).toBeDefined();
  });

  test('a choice leaves the debug view, and the event types go with it', () => {
    render_(played(started(), { kind: 'advance', turns: 3 }));
    openDebugHistory();
    fireEvent.click(within(whose()).getByRole('button', { name: 'The Lantern, your Guild' }));

    expect(title()).toBe('The History of The Lantern');
    expect(section('History').querySelector('.entry__type')).toBeNull();
  });
});
