import type { HeroId } from '@heroesim/engine';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { cameHome, played, started, withPartyOut, withReturn, withRosterReleased, withTheGone, withTraitNews } from '../state/game.test-support';
import { historyView } from '../state/history';
import { gameReducer, type GameState } from '../state/reducer';
import { History } from './history';
import { HistoryLinksContext } from './history-entries';
import { historyLines, idle, inHistory, navButton, openDebugHistory, openView, renderGame, section, sentenceOf } from './page.test-support';

// The History as the one place to read what happened (DL-105), driven through the page: it
// opens on the player's Guild, the last play's entries its newest and marked new; the World History
// and a Rival's are one choice away, a choice that holds, and the whole History is the game menu's
// debug view; groups by date and time of day; a Party's
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

/** The History's title, the `h3` over its page. */
function title(): string {
  return within(section('History')).getByRole('heading', { level: 3 }).textContent ?? '';
}

function whose(): HTMLElement {
  return within(section('History')).getByRole('group', { name: 'Whose History' });
}

/** A `Year 1 Day 6, night` as the Turn it names in a Year of 1,080 Turns, to put groups in order (DL-210). */
function turnOf(when: string): number {
  const [, year = '1', day = '1', time = ''] = /^Year (\d+) Day (\d+), (morning|afternoon|night)$/.exec(when) ?? [];
  return (Number(year) - 1) * 1080 + (Number(day) - 1) * 3 + ['morning', 'afternoon', 'night'].indexOf(time);
}

describe('one view, opened on the player’s Guild', () => {
  test("opens on the player's Guild, grouped by date and time of day, newest first, what the last play added marked new", () => {
    renderGame(cameHome(started('reducer-test')));
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
    // Each group is a list named by its date and time of day, as the help says (DL-210, DL-214).
    expect(within(history).getByRole('list', { name: groups[0] ?? '' })).toBeDefined();
    expect(groups[0]).toMatch(/^Year \d+ Day \d+, (morning|afternoon|night)$/);
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
    renderGame(played(started(), { kind: 'advance', turns: 6 }));

    fireEvent.click(within(whose()).getByRole('button', { name: 'The World History' }));
    expect(title()).toBe('The World History');
    expect(within(whose()).getByRole('button', { name: 'The World History' }).getAttribute('aria-pressed')).toBe('true');
    const rival = within(whose()).getAllByRole('button').at(-1) as HTMLElement;
    fireEvent.click(rival);
    expect(title()).toBe(`The History of ${rival.textContent}`);

    fireEvent.click(within(whose()).getByRole('button', { name: 'The World History' }));
    openView('Board');
    fireEvent.click(screen.getByRole('button', { name: 'Advance a Turn' }));
    await idle();
    expect(title()).toBe('The World History');
  });

  test('pages twenty entries at a time; "Newest" returns to the top, the page and the keyboard', () => {
    renderGame(played(started(), { kind: 'advance', turns: 12 }));
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
    expect(within(document.activeElement as HTMLElement).getByRole('heading', { level: 3, name: 'Debug: Whole History' })).toBeDefined();
  });

  test('reads its page again when the game, the log or the page changes, and not at each step of a fast forward', () => {
    // DL-96 item 3: a year's History read at every step would be narrated again 36 times.
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

describe('folds, and the marks on each line', () => {
  test("folds a Rival's Party's Encounters under how its Quest went, marked with an icon and a word, and opens them (the player's return is one entry)", () => {
    renderGame(cameHome(started('reducer-test')));
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
    renderGame(cameHome(started('reducer-test')));
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
    renderGame(played(started(), { kind: 'advance', turns: 6 }));
    openDebugHistory();
    fireEvent.click(within(section('History')).getByRole('button', { name: 'Oldest' }));
    const oldest = historyLines(section('History'));
    fireEvent.click(within(section('History')).getByRole('button', { name: 'Newer' }));
    const lines = [...oldest, ...historyLines(section('History'))];
    // The oldest page is what is left of the pages counted from the newest: the founding is on it or the next.
    const founded = lines.find((line) => line.textContent?.includes('The Lantern was founded.')) as HTMLElement;
    expect(founded).toBeDefined();

    for (const side of ['mine', 'rival', 'world']) expect(lines.some((line) => line.classList.contains(`entry--${side}`))).toBe(true);
    expect(founded.classList.contains('is-milestone')).toBe(true);
    expect(within(founded).getByText('Milestone:')).toBeDefined();
  });
});

describe('names that open whom they name', () => {
  test("a Hero's name opens their page in the History, and back goes to the History it came from", () => {
    renderGame(withPartyOut(started()));
    const sent = inHistory(/^The Lantern sent .+ on .+, back on the night of Year \d+ Day \d+\.$/);
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
    renderGame(withPartyOut(started()));
    const sent = inHistory(/^The Lantern sent /);

    fireEvent.click(within(sent).getByRole('button', { name: 'The Lantern' }));

    const guilds = section('Guilds');
    expect(within(guilds).getByRole('heading', { level: 4, name: 'The Lantern' })).toBeDefined();
    expect(document.activeElement).toBe(within(guilds).getByRole('heading', { level: 4, name: 'The Lantern' }));
    fireEvent.click(within(guilds).getByRole('button', { name: 'Read the History of The Lantern' }));
    expect(title()).toBe('The History of The Lantern');
  });

  test("a Patron's and a Guildmaster's names open their History", () => {
    renderGame(started());
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

describe("each one's page opens their History", () => {
  test("a Rival's page in the Rankings, a Patron and a Guildmaster", () => {
    renderGame(played(started(), { kind: 'advance', turns: 3 }));
    const guilds = section('Guilds');
    // The player's Guild is a row of the table too: a Rival's is one of the others.
    fireEvent.click(within(guilds).getAllByRole('button', { name: /^Open / }).find((each) => each.getAttribute('aria-label') !== 'Open The Lantern') as HTMLElement);
    const rival = within(guilds).getByRole('heading', { level: 4 }).textContent ?? '';
    fireEvent.click(within(guilds).getByRole('button', { name: `Read the History of ${rival}` }));
    expect(title()).toBe(`The History of ${rival}`);
    expect(within(whose()).getByRole('button', { name: rival }).getAttribute('aria-pressed')).toBe('true');

    // A Patron neutral both ways is folded under the count of them.
    const fold = within(section('Patrons')).queryByRole('button', { name: /^\d+ neutral$/ });
    if (fold !== null) fireEvent.click(fold);
    const [patron] = within(section('Patrons')).getAllByRole('button', { name: /^Read the History of / });
    const patronName = /^Read the History of (.+)$/.exec(patron?.getAttribute('aria-label') ?? '')?.[1];
    fireEvent.click(patron as HTMLElement);
    expect(title()).toBe(`The History of ${patronName}`);

    fireEvent.click(within(section('Guildmaster')).getByRole('button', { name: 'Read the History of Ada Vell' }));
    expect(title()).toBe('The History of Ada Vell');
  });

  test('the rail opens the History on the player’s Guild, at its newest, whatever was chosen before', () => {
    renderGame(withPartyOut(started('reducer-test')));
    fireEvent.click(within(whose()).getByRole('button', { name: 'The World History' }));
    openView('Board');

    fireEvent.click(within(screen.getByRole('complementary', { name: 'Latest for The Lantern' })).getByRole('button', { name: 'Open the History' }));
    expect(title()).toBe('The History of The Lantern');
  });
});

describe('a Party’s return in the player’s Guild’s History (DL-111 item 2)', () => {
  const written = withReturn(withPartyOut(started('history-return')), {
    band: 'fail',
    fame: -2,
    xp: 12,
    encounters: [{ outcome: 'failure', injured: [0] }],
    injuries: [{ hero: 0, typeKey: 'bruised-ribs', healsOnTurn: 999 }],
    loot: [{ definitionKey: 'whetstone', quantity: 1 }],
  });

  test('is one entry: the band in bold and the reward, a line per Hero behind a disclosure, the Loot the next entry, its Injury standing out after it, and no Encounter', () => {
    renderGame(written.state);
    openView('History');
    const entry = inHistory(/^The Lantern's Party came home from .+ and failed: Wealth 0, Fame -2\.$/);

    expect(entry.querySelector('.entry__text strong')?.textContent).toBe('failed');
    const heroes = within(entry).getByRole('button', { name: /^\d+ Heroes?: how each fared on / });
    const lines = document.getElementById(heroes.getAttribute('aria-controls') ?? '') as HTMLElement;
    expect(lines.hidden).toBe(true);
    fireEvent.click(heroes);
    expect(heroes.getAttribute('aria-expanded')).toBe('true');
    expect(within(lines).getAllByRole('listitem')).toHaveLength(written.party.heroIds.length);
    const [first] = within(lines).getAllByRole('listitem');
    expect(first?.textContent).toMatch(/^.+: gained 12 XP; injured: Bruised ribs, healing on the night of Year \d+ Day \d+\.$/);
    // A Hero's name opens their page, as every name in the History does.
    const name = within(first as HTMLElement).getByRole('button');
    fireEvent.click(name);
    expect(within(section('History')).getByRole('heading', { level: 3 }).textContent).toBe(name.textContent);
    fireEvent.click(within(section('History')).getByRole('button', { name: /^Back to / }));

    const lines_ = historyLines(section('History')).filter((line) => line.parentElement?.classList.contains('entries') && !line.parentElement.classList.contains('entries--folded'));
    const sentences = lines_.map(sentenceOf);
    const at = sentences.findIndex((sentence) => / Party came home from /.test(sentence));
    expect(sentences[at + 1]).toMatch(/^The Lantern found Loot on .+: Whetstone\.$/);
    // The Injury stands out as an entry of its own, beside the return, and stays in its Hero line (DL-120 item 6).
    expect(sentences[at + 2]).toMatch(/ was injured /);
    expect(sentences.filter((sentence) => / was injured /.test(sentence))).toHaveLength(1);
    expect(sentences.some((sentence) => /\(Encounter \d+\)/.test(sentence))).toBe(false);
  });

  test('"Open the report" opens it on Guild › Home, with the keyboard on its heading', () => {
    renderGame(written.state);
    openView('History');
    const entry = inHistory(/^The Lantern's Party came home from /);

    fireEvent.click(within(entry).getByRole('button', { name: /^Open the report: / }));

    expect(navButton('Guild').getAttribute('aria-current')).toBe('page');
    expect(document.activeElement).toBe(screen.getByRole('heading', { level: 3, name: /^Quest report: / }));
  });
});

describe("a Party's Encounters, and a Hero's Traits, in the History", () => {
  test("a Hero's History folds their Party's Encounters under its return, each with its Degree", () => {
    // Each Encounter hurt the first Hero, so names them, and stands in their History (`quests-conclude.ts`).
    const written = withReturn(withPartyOut(started('history-degrees')), {
      band: 'success',
      encounters: [
        { encounterKey: 'ambush-on-the-road', outcome: 'success', degree: 'triumph', injured: [0] },
        { encounterKey: 'ambush-on-the-road', outcome: 'failure', degree: 'setback', injured: [0] },
      ],
    });
    const name = written.state.document?.world.heroes[written.party.heroIds[0] as HeroId]?.name ?? '';
    renderGame(written.state);
    openView('History');
    const entry = inHistory(/^The Lantern's Party came home from /);
    fireEvent.click(within(entry).getByRole('button', { name: /^\d+ Heroes?: how each fared on / }));
    fireEvent.click(within(entry).getByRole('button', { name }));

    const page = within(section('History')).getByRole('article');
    const outcome = historyLines(page).find((line) => / Party came home from /.test(sentenceOf(line)) && line.querySelector(':scope > button.fold') !== null);
    if (outcome === undefined) throw new Error(`no return folded in ${name}'s History`);
    const fold = within(outcome).getByRole('button', { name: '2 Encounters' });
    fireEvent.click(fold);

    const folded = document.getElementById(fold.getAttribute('aria-controls') ?? '') as HTMLElement;
    expect(folded.hidden).toBe(false);
    expect(historyLines(folded).map((line) => / \(Encounter \d\), a (\w+)/.exec(sentenceOf(line))?.[1])).toEqual(['Triumph', 'Setback']);
  });

  test("an earned Trait and a lost one are Milestones in the Guild's History, in words", () => {
    const state = withTraitNews(started());
    const world = state.document?.world;
    const player = Object.values(world?.guilds ?? {}).find((guild) => guild.controller.kind === 'player');
    const hero = world?.heroes[player?.rosterIds[0] as HeroId];
    renderGame(state);
    openView('History');

    for (const sentence of [new RegExp(`^${hero?.name} earned the Trait Scarred on .+, at Ambush on the road\\.$`), `${hero?.name} lost the Trait Scarred, replaced by Lame.`]) {
      const line = inHistory(sentence);
      expect(line.classList.contains('is-milestone'), String(sentence)).toBe(true);
      expect(within(line).getByText('Milestone:')).toBeDefined();
      expect(within(line).getByRole('button', { name: hero?.name ?? '' })).toBeDefined();
    }
  });
});

describe('anyone the History names, found by name (DL-74)', () => {
  test("a dead Hero's page opens from it", () => {
    const { state, dead } = withTheGone(played(started(), { kind: 'advance', turns: 6 }));
    renderGame(state);
    const history = (): HTMLElement => section('History');
    const search = (): HTMLElement => within(history()).getByRole('searchbox', { name: 'Find someone in the History by name' });

    fireEvent.change(search(), { target: { value: dead.name.toLowerCase() } });
    expect(within(history()).getByRole('status').textContent).toMatch(/^\d+ found/);
    expect(within(within(history()).getByRole('list', { name: 'Found in the History' })).getByText('(Hero, dead)')).toBeDefined();
    fireEvent.click(within(history()).getByRole('button', { name: `Read ${dead.name}` }));

    const page = within(history()).getByRole('article');
    expect(within(page).getByRole('heading', { level: 3, name: dead.name })).toBeDefined();
    expect(within(page).getByText(/^Died on Year \d+ Day \d+$/)).toBeDefined();
    // This Hero is dead by the test's own hand, with no Milestone recorded: none is drawn (the review's A5).
    expect(within(page).queryByRole('heading', { name: 'Milestones' })).toBeNull();
    expect(within(page).getByRole('heading', { level: 4, name: 'History, newest first' })).toBeDefined();
    expect(within(history()).queryByRole('list', { name: 'Found in the History' })).toBeNull();
    // No choice of the three is theirs.
    expect(within(whose()).getAllByRole('button').every((button) => button.getAttribute('aria-pressed') === 'false')).toBe(true);
    fireEvent.click(within(page).getByRole('button', { name: 'Back to the History of The Lantern' }));
    expect(title()).toBe('The History of The Lantern');


    fireEvent.change(search(), { target: { value: 'no one is called this' } });
    expect(within(history()).getByRole('status').textContent).toBe('No one the History names is called that.');
  });
});

describe("the History's scopes (DL-111 item 4, DL-112 item 7)", () => {
  test('the game menu opens the whole History with no choice pressed, the search still there', () => {
    const { state, dead } = withTheGone(played(started(), { kind: 'advance', turns: 3 }));
    renderGame(state);

    openDebugHistory();

    expect(title()).toBe('Debug: Whole History');
    expect(within(whose()).getAllByRole('button').every((button) => button.getAttribute('aria-pressed') === 'false')).toBe(true);
    fireEvent.change(within(section('History')).getByRole('searchbox', { name: 'Find someone in the History by name' }), { target: { value: dead.name } });
    expect(within(section('History')).getByRole('button', { name: `Read ${dead.name}` })).toBeDefined();
  });

  test('a choice leaves the debug view, and the event types go with it', () => {
    renderGame(played(started(), { kind: 'advance', turns: 3 }));
    openDebugHistory();
    fireEvent.click(within(whose()).getByRole('button', { name: 'The Lantern, your Guild' }));

    expect(title()).toBe('The History of The Lantern');
    expect(section('History').querySelector('.entry__type')).toBeNull();
  });
});
