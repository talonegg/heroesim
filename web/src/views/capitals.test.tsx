import type { OfferId, WorldDocument } from '@heroesim/engine';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, test } from 'vitest';
import { App } from '../app';
import { content } from '../content';
import { cameHome, changed, holding, holdingUnique, played, started, withOffer, withOlderRules, withPartyOut, withTheGone, withTraitNews, withWorldNews, type Named } from '../state/game.test-support';
import type { GameState } from '../state/reducer';
import { poolView } from '../state/trade-views';
import { closeMenu, openGuildPart, openMenu, openView, rosterList, section, time, type GuildPartName, type ViewName } from './page.test-support';

// The page's words (v1.1.2-S1, DL-125 item 9, DL-128): every standalone text begins with a capital,
// as `docs/agents/ui-text.md` writes the rule. Each view and the Guild's four parts are drawn over a
// seeded game with something in every part, and opened as a player opens them: a Hero's page of each
// kind, a Rival Guild's page, each History, the Party builder, the game menu, the other ways to Fast
// forward, a Quest report and the new-game form. Every text that stands on its own is read, and any
// that begins with a lower-case letter is a failure; a number may begin one, and so may a name, which
// keeps its own case. Every failure is listed, not the first.

afterEach(cleanup);

/**
 * What stands on its own: headings, buttons and links, table headers and cells, chips, legends,
 * labels, `dt`s and `dd`s, options, tabs, paragraphs and list items, and the values the page marks
 * for its tests (the Wealth, the Rankings, a fee).
 */
const standalone = [
  'h1, h2, h3, h4, h5, h6, button, a, summary',
  'th, td, caption, .chip, legend, label, dt, dd, option, [role="tab"]',
  'p, li, [data-testid]',
].join(', ');

/** The controls whose `aria-label` names them, which begin with a capital too. */
const named = 'button[aria-label], a[aria-label], input[aria-label], select[aria-label], summary[aria-label], [role="tab"][aria-label]';

/** The inline parts that can stand on their own inside a capitalised element: a slot's word, a value, a label. */
const inlineParts = 'span, strong, em';

/**
 * Whether the words before `element` in its parent run into it: a text node just before, which
 * ends in a letter, a digit, a comma or a colon, so that the part continues a sentence, or is the value of
 * a label (`Fame 12: met`), and takes no capital. A part after a `·` or a bracket stands alone.
 */
function continuesASentence(element: HTMLElement): boolean {
  const before = element.previousSibling;
  if (before === null || before.nodeType !== Node.TEXT_NODE) return false;
  const words = (before.textContent ?? '').replace(/\s+/g, ' ').trim();
  return words !== '' && /[\p{L}\p{N},:]$/u.test(words);
}

/** A text's opening, past any punctuation or sign before it: `(none)` opens with `none`, `+2` with `2`. */
function opening(text: string): string {
  return text.replace(/^[^\p{L}\p{N}]+/u, '');
}

function tidy(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/** What `element` shows, without the words only assistive technology reads: an Outlook chip shows `Modest`, and reads `Outlook Modest`. */
function shown(element: HTMLElement): string {
  const copy = element.cloneNode(true) as HTMLElement;
  for (const hidden of Array.from(copy.querySelectorAll('.visually-hidden'))) hidden.remove();
  return copy.textContent ?? '';
}

/** The names the game holds, which keep their own case: everyone and everything the History labels, the seed and the content set. */
function namesOf(state: GameState): string[] {
  const document = state.document;
  if (document === null) return [];
  const labels = document.history.entries.flatMap((entry) => Object.values(entry.labels));
  return [...new Set([...labels, document.meta.seed, document.meta.content.id])].filter((name) => name !== '');
}

/**
 * Reads the page as it is drawn at each step, and keeps each text that stands on its own and begins
 * with a lower-case letter: once, with what holds it and everywhere it was read. The text is read
 * whole, as a screen reader has it, and as shown; one that begins with a name is allowed.
 */
class Reader {
  readonly #failures = new Map<string, { what: string; words: string; where: Set<string> }>();
  /** How many texts were read: a guard that reads nothing passes nothing. */
  checked = 0;
  constructor(private readonly names: readonly string[]) {}

  read(where: string): void {
    for (const element of Array.from(document.body.querySelectorAll<HTMLElement>(standalone))) {
      const what = `<${element.tagName.toLowerCase()}${element.classList.length === 0 ? '' : `.${[...element.classList].join('.')}`}>`;
      this.#check(where, what, element.textContent ?? '');
      this.#check(where, `${what} as shown`, shown(element));
    }
    for (const element of Array.from(document.body.querySelectorAll<HTMLElement>(inlineParts))) {
      if (element.children.length > 0 || element.classList.contains('visually-hidden') || continuesASentence(element)) continue;
      const what = `<${element.tagName.toLowerCase()}${element.classList.length === 0 ? '' : `.${[...element.classList].join('.')}`}> inside <${element.parentElement?.tagName.toLowerCase() ?? ''}>`;
      this.#check(where, what, shown(element));
    }
    for (const element of Array.from(document.body.querySelectorAll<HTMLElement>(named))) {
      this.#check(where, `<${element.tagName.toLowerCase()}> aria-label`, element.getAttribute('aria-label') ?? '');
    }
  }

  /** Every failure: `what "text" (where, where)`. */
  get failures(): string[] {
    return [...this.#failures.values()].map(({ what, words, where }) => `${what} "${words.slice(0, 90)}" (${[...where].join(', ')})`);
  }

  #check(where: string, what: string, text: string): void {
    const words = tidy(text);
    if (words !== '') this.checked += 1;
    const start = opening(words);
    if (!/^\p{Ll}/u.test(start) || this.names.some((name) => start.startsWith(name))) return;
    const key = `${what.replace(/ as shown$/, '')} ${words}`;
    const failure = this.#failures.get(key) ?? { what, words, where: new Set<string>() };
    failure.where.add(where);
    this.#failures.set(key, failure);
  }
}

/** Opens and reads each view, and each of the Guild's parts. */
function readEveryView(reader: Reader): void {
  for (const view of ['Guildmaster', 'Guild', 'Roster', 'Board', 'Rankings', 'Market', 'History'] as const satisfies readonly ViewName[]) {
    openView(view);
    reader.read(view);
  }
  for (const part of ['Home', 'Hall', 'Stores', 'Treasury'] as const satisfies readonly GuildPartName[]) {
    openGuildPart(part);
    reader.read(`Guild › ${part}`);
  }
}

/**
 * A game with something in every part: a Rival folded and another's Guildmaster succeeded; six
 * Turns played; a Hero dead, one retired and one gone from the pool; one injured and one with no
 * Skill; a Guildmaster with no Trait; a Party out; a Unique Item and a Consumable held; older rules,
 * which the game menu offers to adopt; and a Transfer Offer, which stopped the last play.
 */
function busyGame(): { state: GameState; gone: Named[] } {
  const { state: played6, dead, retired, gone } = withTheGone(played(withWorldNews(started('capitals')), { kind: 'advance', turns: 6 }));
  const changed6 = changed(played6, (document, player) => {
    const [first, second] = player.rosterIds.flatMap((heroId) => document.world.heroes[heroId] ?? []);
    if (first === undefined || second === undefined) throw new Error('expected two Heroes on the Roster');
    first.injury = { typeKey: 'deep-cut', healsOnTurn: document.world.turn + 12 };
    second.skills = {};
    const guildmaster = document.world.guildmasters[player.guildmasterId];
    if (guildmaster === undefined) throw new Error("no player's Guildmaster");
    guildmaster.traits = [];
  });
  // One Hero of the pool signed after the Party left, so one is at the Hall.
  // v1.1.4-S7: a Hero Trait with its effects on the page, and a Trait gained and one lost in the History.
  const out = withPartyOut(withTraitNews(changed6));
  const signing = poolView(out.document as WorldDocument).rows.find((row) => row.willSign === true);
  if (signing === undefined) throw new Error('no Hero in the pool who signs');
  const recruited = played(out, { kind: 'recruit', heroId: signing.heroId });
  const offered = withOlderRules(withOffer(holding(holdingUnique(recruited, 'barrow-kings-blade'), 'whetstone', 2)));
  const { document } = offered;
  if (document === null) throw new Error('no game in hand');
  const offerIds = Object.keys(document.world.offers) as OfferId[];
  const player = Object.values(document.world.guilds).find((guild) => guild.controller.kind === 'player');
  if (player === undefined) throw new Error("no player's Guild");
  return { state: { ...offered, stoppedBecause: { kind: 'transfer-offer', guildId: player.id, offerIds } }, gone: [dead, retired, gone] };
}

describe('every standalone text begins with a capital (DL-125 item 9)', { timeout: 30_000 }, () => {
  test('in every view and each of the Guild’s parts, and in what opens from them', () => {
    const { state, gone } = busyGame();
    const reader = new Reader(namesOf(state));
    render(<App initial={state} />);

    readEveryView(reader);

    // Each Hero's page on the Roster: at the Hall, injured and away.
    section('Roster');
    const heroes = within(rosterList()).getAllByRole('button').length;
    for (let index = 0; index < heroes; index += 1) {
      fireEvent.click(within(rosterList()).getAllByRole('button')[index] as HTMLElement);
      reader.read('A Hero’s page');
      fireEvent.click(screen.getByRole('button', { name: 'Back to the Roster' }));
    }
    // A Hero's page in the Unattached pool.
    const [pooled] = within(section('Unattached pool')).getAllByTestId('pool-row');
    fireEvent.click(within(within(pooled as HTMLElement).getByRole('rowheader')).getByRole('button'));
    reader.read('A Hero’s page in the pool');
    fireEvent.click(screen.getByRole('button', { name: 'Back to the pool' }));
    // The Offer asked about.
    fireEvent.click(within(section('Transfer Offers')).getByRole('button', { name: /^Accept .*…$/ }));
    reader.read('The Offer');

    // The Party builder, with each Quest unfolded.
    const board = openView('Board');
    for (const toggle of Array.from(board.querySelectorAll<HTMLElement>('.quest__toggle'))) fireEvent.click(toggle);
    const [choose] = within(board).getAllByRole('button', { name: 'Choose a Party' });
    fireEvent.click(choose as HTMLElement);
    reader.read('The Party builder');
    // With a Hero chosen, its Morale line too (v1.1.4-S3).
    const [pick] = within(board).getAllByRole('checkbox').filter((box) => !(box as HTMLInputElement).disabled);
    fireEvent.click(pick as HTMLElement);
    expect(within(board).getByTestId('party-morale')).toBeDefined();
    // And its chances, a word each, with the numbers in the detail, opened (v1.1.4-S6).
    expect(within(board).getAllByTestId('best-party').length).toBeGreaterThan(0);
    expect(within(board).getAllByTestId('encounters').length).toBeGreaterThan(0);
    expect(within(board).getByTestId('chances')).toBeDefined();
    fireEvent.click(within(within(board).getByTestId('chance-numbers')).getByText('The numbers, if no one falls'));
    reader.read('The Party builder, a Hero chosen');

    // A Rival Guild's page, its Hall and Guildmaster.
    const guilds = section('Guilds');
    const rival = within(guilds).getAllByRole('button', { name: /^Open / })[1] as HTMLElement;
    fireEvent.click(rival);
    reader.read('A Rival Guild’s page');

    // Each History.
    const history = openView('History');
    const whose = within(within(history).getByRole('group', { name: 'Whose History' })).getAllByRole('button');
    for (const choice of whose) {
      fireEvent.click(choice);
      reader.read(`The History of ${choice.textContent ?? ''}`);
    }

    // The pages of a Hero dead, retired and gone from the world, found in the History.
    for (const hero of gone) {
      fireEvent.change(within(section('History')).getByRole('searchbox', { name: 'Find someone in the History by name' }), { target: { value: hero.name } });
      fireEvent.click(within(section('History')).getByRole('button', { name: `Read ${hero.name}` }));
      reader.read('A gone Hero’s page');
    }

    // The game menu, and the other ways to Fast forward.
    openMenu();
    reader.read('The game menu');
    closeMenu();
    fireEvent.click(within(time()).getByRole('button', { name: 'More ways to Fast forward' }));
    reader.read('The other ways to Fast forward');

    expect(reader.checked).toBeGreaterThan(5000);
    expect(reader.failures).toEqual([]);
  });

  test('in a Quest report', () => {
    const state = cameHome(started('capitals'));
    const reader = new Reader(namesOf(state));
    render(<App initial={state} />);

    openGuildPart('Home');
    reader.read('A Quest report');

    expect(within(section('Home')).getByRole('region', { name: /^Quest report: / })).toBeDefined();
    expect(reader.checked).toBeGreaterThan(50);
    expect(reader.failures).toEqual([]);
  });

  test('in the new-game form', () => {
    render(<App />);
    const reader = new Reader([]);
    for (const summary of Array.from(document.querySelectorAll('summary'))) fireEvent.click(summary);
    reader.read('The new-game form');
    // v1.1.4-S11: "Choose myself", before a sex is chosen and after, with its Stats, a point left unspent,
    // and what it still needs beside "Start the game".
    fireEvent.change(screen.getByLabelText('Guild name'), { target: { value: 'The Lantern' } });
    fireEvent.change(screen.getByLabelText('Guildmaster’s name'), { target: { value: 'Ada Vell' } });
    fireEvent.click(screen.getByRole('radio', { name: 'Choose myself' }));
    expect(screen.getByTestId('portrait-unsexed')).toBeDefined();
    reader.read('The new-game form, "Choose myself"');
    fireEvent.change(screen.getByLabelText('Sex'), { target: { value: 'male' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lower Coaching' }));
    expect(screen.getByTestId('stat-points-unspent')).toBeDefined();
    expect(screen.getByTestId('setup-hint').textContent).toMatch(/^Choose your Guildmaster's /);
    reader.read('The new-game form, "Choose myself", a sex chosen and a Stat point unspent');

    expect(reader.checked).toBeGreaterThan(20);
    expect(reader.failures).toEqual([]);
  });

  // v1.1.3-S7: the setup grid, and a note beside a Portrait chosen; since v1.1.4-S11 with "Choose myself".
  test('in the setup grid, with a note beside a Portrait chosen', () => {
    render(<App />);
    const reader = new Reader([]);
    for (const summary of Array.from(document.querySelectorAll('summary'))) fireEvent.click(summary);
    fireEvent.change(screen.getByLabelText('Seed'), { target: { value: 'capitals' } });
    fireEvent.click(screen.getByRole('radio', { name: 'Choose myself' }));
    fireEvent.change(screen.getByLabelText('Sex'), { target: { value: 'female' } });
    fireEvent.change(screen.getByLabelText('Age'), { target: { value: '21' } });
    const portrait = screen.getByRole('group', { name: 'Portrait' });
    const radios = within(portrait).getAllByRole('radio');
    // Each picture chosen in turn, so that the notes of every kind they give are read.
    let noted = 0;
    for (const radio of radios) {
      fireEvent.click(radio);
      if (screen.queryByTestId('portrait-notes') !== null) noted += 1;
      reader.read(`The setup grid, ${radio.closest('label')?.textContent ?? ''} chosen`);
    }

    expect(noted).toBeGreaterThan(0);
    expect(reader.checked).toBeGreaterThan(20);
    expect(reader.failures).toEqual([]);
  });

  // v1.1.3-S8: with a Trait chosen that a Calling clashes with, the note of a Calling, each picture of
  // both sexes chosen in turn (since v1.1.4-S11, each sex chosen in its field).
  test('in the setup grid, each sex chosen, and a Calling that clashes with a Trait chosen', () => {
    const clashing = Object.values(content.descriptions.callings).find((calling) => calling.clashes.length > 0);
    const traitName = content.guildmasterTraits[clashing?.clashes[0] ?? '']?.name;
    if (traitName === undefined) throw new Error('no Calling clashes with a Trait');
    render(<App />);
    const reader = new Reader([]);
    for (const summary of Array.from(document.querySelectorAll('summary'))) fireEvent.click(summary);
    fireEvent.change(screen.getByLabelText('Seed'), { target: { value: 'capitals' } });
    fireEvent.click(screen.getByRole('radio', { name: 'Choose myself' }));
    fireEvent.click(within(screen.getByRole('group', { name: 'Traits' })).getByRole('radio', { name: 'Choose them' }));
    fireEvent.click(screen.getByRole('checkbox', { name: new RegExp(`^${traitName}\\b`) }));
    let clashes = 0;
    for (const sex of ['Female', 'Male']) {
      fireEvent.change(screen.getByLabelText('Sex'), { target: { value: sex.toLowerCase() } });
      const radios = within(screen.getByRole('group', { name: 'Portrait' })).getAllByRole('radio');
      for (const radio of radios) {
        fireEvent.click(radio);
        if (/clashes with the Trait/.test(screen.queryByTestId('portrait-notes')?.textContent ?? '')) clashes += 1;
        reader.read(`The setup grid, ${sex} shown, ${radio.closest('label')?.textContent ?? ''} chosen`);
      }
    }

    expect(clashes).toBeGreaterThan(0);
    expect(reader.checked).toBeGreaterThan(20);
    expect(reader.failures).toEqual([]);
  });
});

describe('the guard itself fails what begins in lower case, and names it', () => {
  test('a paragraph, a nested span and a control’s aria-label', () => {
    render(
      <div>
        <p>lower</p>
        <ul>
          <li>
            Weapon · <span className="slot">none</span>
          </li>
          <li>
            Gear of <span className="slot">Una</span>, and <strong>more</strong>
          </li>
        </ul>
        <button type="button" aria-label="open it">
          Open
        </button>
      </div>,
    );
    const reader = new Reader([]);
    reader.read('a snippet');

    expect(reader.checked).toBeGreaterThan(0);
    expect(reader.failures).toEqual([
      '<p> "lower" (a snippet)',
      '<span.slot> inside <li> "none" (a snippet)',
      '<button> aria-label "open it" (a snippet)',
    ]);
  });

  test('passes a capitalised text, a number, a name and a sentence’s own parts', () => {
    render(
      <ul>
        <li>3 new</li>
        <li>
          Fame 12: <strong>met</strong>
        </li>
        <li>
          Una Greave, <em>known</em> as a healer
        </li>
      </ul>,
    );
    const reader = new Reader(['Una Greave']);
    reader.read('a snippet');

    expect(reader.failures).toEqual([]);
  });
});

describe('the words DL-125 item 9 settled, where the guard reads no failure to show them', () => {
  test('a Rival’s Disposition by name, and None where a part is empty', () => {
    const { state } = busyGame();
    render(<App initial={state} />);

    // The Guildmaster with no Trait, and a Hero with no Skill.
    const guildmaster = openView('Guildmaster');
    const traits = within(guildmaster).getByRole('heading', { name: 'Traits' });
    expect(traits.nextElementSibling?.textContent).toBe('None');
    const skills = within(rosterList())
      .getAllByRole('button')
      .map((_, index) => {
        fireEvent.click(within(rosterList()).getAllByRole('button')[index] as HTMLElement);
        const next = within(section('Roster')).getByRole('heading', { name: 'Skills' }).nextElementSibling?.textContent;
        fireEvent.click(screen.getByRole('button', { name: 'Back to the Roster' }));
        return next;
      });
    expect(skills).toContain('None');

    // A Rival Guild's page: "Rival (Steady)", as the Guilds' table names its Disposition.
    const guilds = section('Guilds');
    const [, rival] = within(guilds).getAllByTestId('guild-row');
    const disposition = within(rival as HTMLElement).getAllByRole('cell')[1]?.textContent ?? '';
    fireEvent.click(within(rival as HTMLElement).getByRole('button', { name: /^Open / }));
    expect(disposition).toMatch(/^[A-Z][a-z]+$/);
    expect(section('Guilds').querySelector('.guild-page__line')?.textContent?.startsWith(`Rival (${disposition}) · `)).toBe(true);
  });

  test('the terms in the help and the new-game form', () => {
    render(<App />);
    expect(screen.getByText('Chosen for you, or choose their Sex, Age, Portrait, Stats and Traits, and a few words about them')).toBeDefined();
    cleanup();

    render(<App initial={started('capitals')} />);
    const board = openView('Board');
    expect(within(board).getByText(/As you pick Heroes and Consumables, the preview/)).toBeDefined();
    const roster = openView('Roster');
    expect(within(roster).getByText(/with what Gear adds .+ their Gear and Skills/)).toBeDefined();
  });
});
