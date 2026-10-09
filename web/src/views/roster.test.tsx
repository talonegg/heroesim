import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, test } from 'vitest';
import { App } from '../app';
import { mediaFiles } from '../media';
import { carrying, carryingUnique, changed, holding, started, withOffer, withPartyOut, withRichRivals, withTraitNews } from '../state/game.test-support';
import type { GameState } from '../state/reducer';
import { rosterList, section } from './page.test-support';
import { help } from './section';

// The Roster redesigned (DL-106; the review's B7, B8 and E4): compact Hero cards, a Hero's
// page as a line and chips with the Stats in four blocks, the Unattached pool as rows ordered by its
// headings, and a confirmation before a Transfer out or an offer accepted lets a Hero go. Every
// value comes from a selector (`rosterRows`, `heroPage`, `poolView`, `offersView`).

afterEach(cleanup);

async function idle(): Promise<void> {
  await waitFor(() => expect(document.querySelector('main')?.getAttribute('aria-busy')).toBe('false'));
}

function render_(state: GameState): void {
  render(<App initial={state} />);
}

function wealth(): number {
  return Number(screen.getByTestId('wealth').textContent);
}

/** The Roster's cards, each a list item. */
function cards(): HTMLElement[] {
  return within(rosterList()).getAllByRole('listitem');
}

/** The chip whose words are `words` in `scope`: its frame, where its tone and icon are. */
function chip(scope: HTMLElement, words: string | RegExp): HTMLElement {
  const found = within(scope).getByText(words).closest('.chip');
  if (!(found instanceof HTMLElement)) throw new Error(`no chip saying ${String(words)}`);
  return found;
}

/**
 * Opens the first Hero to join the Roster of `state`, the one the setups change, and gives their name
 * and page: the Roster lists by the default order (DL-169), not the order of joining.
 */
function openFirstHero(state: GameState): { name: string; page: () => HTMLElement } {
  const world = state.document?.world;
  const player = Object.values(world?.guilds ?? {}).find((guild) => guild.controller.kind === 'player');
  const first = player === undefined ? undefined : world?.heroes[player.rosterIds[0] as never];
  if (first === undefined) throw new Error('an empty Roster');
  fireEvent.click(within(rosterList()).getByRole('button', { name: first.name }));
  return { name: first.name, page: () => within(section('Roster')).getByRole('article') };
}

describe("the Roster's Hero cards", () => {
  test('give each Hero their name, Class, Level and Age, a Morale chip, and where they are, injured or away by an icon and its words', () => {
    const state = changed(withPartyOut(started()), (document, player) => {
      const hero = Object.values(document.world.heroes).find((each) => player.rosterIds.includes(each.id) && each.partyId === null);
      if (hero === undefined) throw new Error('no Hero at the Hall');
      hero.injury = { typeKey: 'deep-cut', healsOnTurn: 20 };
      hero.morale = 12;
    });
    render_(state);

    const all = cards();
    expect(all.length).toBeGreaterThan(2);
    for (const card of all) {
      expect(within(card).getByRole('button').className).toBe('link');
      // "Age" as a label, capitalised (DL-111 item 9).
      expect(card.textContent).toMatch(/(Warrior|Rogue|Mage|Healer) · Level \d+ · Age \d+/);
      expect(chip(card, /^Morale \d+, (wretched|low|steady|high|elated)$/).querySelector('svg')).not.toBeNull();
    }
    const injured = all.find((card) => card.textContent?.includes('Injured, healing on the night of Year 1 Day 7') === true) as HTMLElement;
    expect(chip(injured, 'Injured, healing on the night of Year 1 Day 7').className).toBe('chip chip--warn');
    expect(chip(injured, 'Morale 12, wretched').className).toBe('chip chip--bad');
    const away = all.filter((card) => /Away with a Party, back on the night of Year \d+ Day \d+/.test(card.textContent ?? ''));
    expect(away.length).toBeGreaterThan(0);
    for (const card of away) expect(chip(card, /^Away with a Party/).querySelector('svg')).not.toBeNull();
    expect(all.some((card) => within(card).queryByText('At the Hall') !== null)).toBe(true);
  });
});

describe("a Hero's page (the review's B7)", () => {
  test('is a line and chips, the Stats in four area blocks each with its Outlook as a chip, and what gear lifts in the accent', async () => {
    const held = holding(started(), 'arming-sword', 1);
    render_(held);
    const { name, page } = openFirstHero(held);
    // The keyboard is on their name.
    expect(document.activeElement).toBe(within(page()).getByRole('heading', { level: 3, name }));
    expect(within(page()).getByText(/^(Warrior|Rogue|Mage|Healer) · Level \d+ · Age \d+ · (Female|Male) · .+ · of The Lantern$/)).toBeDefined();
    const state = within(page()).getByRole('list', { name: `${name}'s State` });
    expect(within(state).getByText(/^Morale \d+, (wretched|low|steady|high|elated)$/)).toBeDefined();
    expect(within(state).getByText('At the Hall')).toBeDefined();
    expect(within(state).getByText(/^XP \d+$/)).toBeDefined();
    // No longer eleven label and value rows: the only terms are the Appearance and Biography.
    expect(within(page()).getAllByRole('term').map((term) => term.textContent)).toEqual(['Appearance', 'Biography']);

    const blocks = within(page()).getAllByRole('table');
    expect(blocks.map((block) => block.querySelector('caption')?.textContent)).toEqual(['Physical', 'Mental', 'Magical', 'Social']);
    const physical = within(page()).getByRole('table', { name: 'Physical' });
    expect(within(physical).getAllByRole('row')).toHaveLength(5);
    expect(within(page()).getAllByTitle('Outlook')).toHaveLength(20);
    const weaponry = (): HTMLElement => within(within(page()).getByRole('table', { name: 'Physical' })).getByRole('rowheader', { name: 'Weaponry' }).closest('tr') as HTMLElement;
    const [before] = within(weaponry()).getAllByRole('cell');
    const base = Number(before?.textContent);
    expect(weaponry().querySelector('.lift')).toBeNull();

    fireEvent.click(within(page()).getByRole('button', { name: 'Equip Arming sword' }));
    await idle();

    const [value] = within(weaponry()).getAllByRole('cell');
    const lift = value?.querySelector('.lift');
    expect(lift?.className).toBe('lift lift--up');
    expect(lift?.textContent).toBe(`+2 on its base of ${base}`);
    expect(value?.firstChild?.textContent).toBe(String(base + 2));
    expect(document.body.innerHTML).not.toMatch(/potential/i);
  });

  // DL-148 item 24: a Hero Trait's effects beside its name, and its Stat changes in the blocks.
  test("gives each Trait with what it does, and a Trait's Stat change lowers the Stat where it shows", () => {
    const state = changed(started(), (document, player) => {
      const first = document.world.heroes[player.rosterIds[0] as never];
      if (first === undefined) throw new Error('an empty Roster');
      first.traits = ['lame'];
      first.stats['dexterity'] = 12;
    });
    render_(state);
    const { name, page } = openFirstHero(state);

    const chips = within(page()).getByRole('list', { name: `${name}'s State` });
    expect(chip(chips, 'Lame: -2 Dexterity, -1 Endurance').title).toBe('Trait');
    const dexterity = within(within(page()).getByRole('table', { name: 'Physical' })).getByRole('rowheader', { name: 'Dexterity' }).closest('tr') as HTMLElement;
    const [value] = within(dexterity).getAllByRole('cell');
    expect(value?.firstChild?.textContent).toBe('10');
    expect(value?.querySelector('.lift')?.textContent).toBe('-2 on its base of 12');
  });

  // A Trait's Encounter bonus in words on its chip.
  test("gives a Trait's Encounter bonus in words, on the Trait's chip", () => {
    const state = changed(started(), (document, player) => {
      const first = document.world.heroes[player.rosterIds[0] as never];
      if (first === undefined) throw new Error('an empty Roster');
      first.traits = ['battle-tried'];
    });
    render_(state);
    const { name, page } = openFirstHero(state);

    const chips = within(page()).getByRole('list', { name: `${name}'s State` });
    expect(chip(chips, 'Battle-tried: +2 to every Check of combat Encounters').title).toBe('Trait');
  });

  // A Trait earned on a Quest and one lost to another, among the Hero's Milestones.
  test('lists a Trait earned and a Trait lost among the Milestones', () => {
    const news = withTraitNews(started());
    render_(news);
    const { name, page } = openFirstHero(news);

    const heading = within(page()).getByRole('heading', { name: 'Milestones' });
    const milestones = heading.nextElementSibling as HTMLElement;
    const lines = within(milestones)
      .getAllByRole('listitem')
      .map((line) => line.textContent ?? '');
    expect(lines.some((line) => new RegExp(`${name} earned the Trait Scarred on .+, at Ambush on the road\\.$`).test(line)), lines.join('\n')).toBe(true);
    expect(lines.some((line) => line.endsWith(`${name} lost the Trait Scarred, replaced by Lame.`)), lines.join('\n')).toBe(true);
  });

  test('shows the Relationships as bands, a ramp of tones, and folds those neutral both ways under their count', () => {
    const state = changed(started(), (document, player) => {
      const [first, second] = player.rosterIds;
      const hero = first === undefined ? undefined : document.world.heroes[first];
      if (hero === undefined || second === undefined) throw new Error('two Heroes wanted');
      hero.regard[second] = { value: 8, since: 0, reason: 'test' };
    });
    render_(state);
    const heroes = cards().length;
    const { name, page } = openFirstHero(state);

    const shown = within(page()).getByRole('list', { name: `${name}'s Relationships` });
    expect(within(shown).getAllByRole('listitem')).toHaveLength(1);
    expect(chip(shown, 'Regard warm').className).toBe('chip chip--good');
    expect(within(page()).getByText(/^\d+ neutral$/).textContent).toBe(`${heroes - 2} neutral`);
    expect(within(page()).getByRole('list', { name: `${name}'s Relationships, neutral` }).children).toHaveLength(heroes - 2);
  });

  test('a Transfer out asks first, with the fee and what it costs; "Keep them" leaves the Hero where they are', () => {
    const rich = withRichRivals(started());
    render_(rich);
    const { name, page } = openFirstHero(rich);
    const before = wealth();
    const opener = within(page()).getByRole('button', { name: `Transfer ${name}…` });
    expect(within(page()).queryByLabelText(`Transfer ${name} to`)).toBeNull();

    fireEvent.click(opener);

    const ask = within(page()).getByRole('group', { name: `Transfer ${name}?` });
    expect(document.activeElement).toBe(ask);
    expect(within(ask).getByText(/ would pay \d+ Wealth for .+, if it is willing to take them\. Their Gear stays with your Guild, and the Heroes left behind who held them in high Regard lose Morale\.$/)).toBeDefined();
    // Another Guild chosen: the sentence says its fee.
    const select = within(ask).getByLabelText(`Transfer ${name} to`) as HTMLSelectElement;
    const second = select.options[1];
    if (second === undefined) throw new Error('one Guild to transfer to');
    fireEvent.change(select, { target: { value: second.value } });
    const [, guildName, fee] = /^(.+), for (\d+) Wealth$/.exec(second.textContent ?? '') ?? [];
    expect(within(ask).getByText(new RegExp(`^${guildName} would pay ${fee} Wealth for ${name},`))).toBeDefined();

    fireEvent.click(within(ask).getByRole('button', { name: 'Keep them' }));

    expect(within(page()).queryByRole('group', { name: `Transfer ${name}?` })).toBeNull();
    expect(document.activeElement).toBe(within(page()).getByRole('button', { name: `Transfer ${name}…` }));
    expect(wealth()).toBe(before);
    fireEvent.click(within(page()).getByRole('button', { name: 'Back to the Roster' }));
    expect(within(rosterList()).getByRole('button', { name })).toBeDefined();
    // The keyboard is back on the Hero's card.
    expect(document.activeElement).toBe(within(rosterList()).getByRole('button', { name }));
  });
});

describe('Transfer Offers (the review’s E4)', () => {
  test('Accept asks first, with the fee and what letting the Hero go costs; "Keep them" leaves the offer standing', () => {
    render_(withOffer(started()));
    const offers = section('Transfer Offers');
    const accept = within(offers).getByRole('button', { name: /^Accept .+'s Offer for .+…$/ });
    const [, whose = ''] = /^Accept (.+)…$/.exec(accept.getAttribute('aria-label') ?? '') ?? [];
    const before = wealth();

    fireEvent.click(accept);

    const ask = within(offers).getByRole('group', { name: `Accept ${whose}?` });
    expect(document.activeElement).toBe(ask);
    expect(within(ask).getByText(/^Accepting sends .+ to .+ for \d+ Wealth\. Their Gear stays with your Guild, and the Heroes left behind who held them in high Regard lose Morale\.$/)).toBeDefined();
    expect(within(ask).getByRole('button', { name: `Accept ${whose}` }).textContent).toBe('Accept the Offer');

    fireEvent.click(within(ask).getByRole('button', { name: 'Keep them' }));

    expect(within(section('Transfer Offers')).getAllByRole('listitem')).toHaveLength(1);
    expect(document.activeElement).toBe(within(section('Transfer Offers')).getByRole('button', { name: `Accept ${whose}…` }));
    expect(wealth()).toBe(before);
  });
});

describe("the Unattached pool as rows (the review's B8)", () => {
  /** The pool's rows as their cells say them: Class, Level, Age, Background, Fee, Signs, after the name. */
  function rows(): { name: string; cells: string[]; row: HTMLElement }[] {
    return within(section('Unattached pool'))
      .getAllByTestId('pool-row')
      .map((row) => ({
        name: within(row).getByRole('rowheader').textContent ?? '',
        cells: within(row)
          .getAllByRole('cell')
          .map((cell) => cell.textContent ?? ''),
        row,
      }));
  }

  test('lists Name, Class, Level, Age, Background, Fee, whether they sign and Recruit; one who will not sign is set back with the pool’s reason, and Recruit disabled', () => {
    const state = changed(started(), (document, player) => {
      player.fame = 0;
      const pooled = Object.values(document.world.heroes).find((hero) => hero.unattachedSince !== null);
      if (pooled === undefined) throw new Error('an empty pool');
      pooled.level = 4;
    });
    render_(state);
    const table = within(section('Unattached pool')).getByRole('table', { name: 'Heroes in the Unattached pool' });

    expect(within(table).getAllByRole('columnheader').map((header) => header.textContent)).toEqual(['Name', 'Class', 'Level', 'Age', 'Background', 'Fee', 'Signs', 'Recruit']);
    const all = rows();
    expect(all.length).toBeGreaterThan(3);
    for (const { name, cells: [kind, level, age, , fee, signs], row } of all) {
      expect(kind).toMatch(/^(Warrior|Rogue|Mage|Healer)$/);
      expect([level, age, fee].every((number) => /^\d+$/.test(number ?? ''))).toBe(true);
      expect(signs).toMatch(/^(Yes|Needs Fame \d+)$/);
      expect(row.className).toBe(signs === 'Yes' ? '' : 'is-set-back');
      const recruit = within(row).getByRole('button', { name: `Recruit ${name}` }) as HTMLButtonElement;
      expect(recruit.textContent).toBe('Recruit');
      // DL-109 item 2, Q17: the engine's `signingRefusal`, as the row says it, disables Recruit, and
      // the row's reason describes it.
      expect(recruit.disabled, name).toBe(signs !== 'Yes');
      const reason = recruit.getAttribute('aria-describedby');
      expect(reason === null ? null : document.getElementById(reason)?.textContent).toBe(signs === 'Yes' ? null : signs);
    }
    expect(all.filter(({ cells }) => cells[5] !== 'Yes').length).toBeGreaterThan(0);
  });

  test("a Hero's page opened from the pool disables Recruit for one who will not sign, and says why", () => {
    let name = '';
    const state = changed(started(), (document, player) => {
      player.fame = 0;
      const pooled = Object.values(document.world.heroes).find((hero) => hero.unattachedSince !== null);
      if (pooled === undefined) throw new Error('an empty pool');
      pooled.level = 4;
      name = pooled.name;
    });
    render_(state);

    fireEvent.click(within(section('Unattached pool')).getByRole('button', { name }));
    const page = within(section('Unattached pool')).getByRole('article');
    expect(within(page).getByText(/^Signing fee \d+ Wealth\. Signs for your Guild: needs Fame \d+\.$/)).toBeDefined();
    expect((within(page).getByRole('button', { name: `Recruit ${name}` }) as HTMLButtonElement).disabled).toBe(true);
  });

  test('orders its rows by Class or by fee from their headings, display only, again to the pool’s own order, and keeps the order in this browser', () => {
    render_(started());
    const listed = rows().map(({ name }) => name);
    const header = (label: string): HTMLElement => within(section('Unattached pool')).getByRole('columnheader', { name: label });

    fireEvent.click(within(header('Class')).getByRole('button', { name: 'Order by Class' }));
    expect(header('Class').getAttribute('aria-sort')).toBe('ascending');
    const byClass = rows().map(({ cells }) => cells[0] ?? '');
    // In the content's declared order, Warrior, Rogue, Mage, Healer, not A to Z (DL-186 item 24).
    const declared = ['Warrior', 'Rogue', 'Mage', 'Healer'];
    expect(byClass).toEqual([...byClass].sort((a, b) => declared.indexOf(a) - declared.indexOf(b)));

    fireEvent.click(within(header('Fee')).getByRole('button', { name: 'Order by Fee' }));
    expect(header('Fee').getAttribute('aria-sort')).toBe('ascending');
    expect(header('Class').getAttribute('aria-sort')).toBeNull();
    const byFee = rows().map(({ cells }) => Number(cells[4]));
    expect(byFee).toEqual([...byFee].sort((a, b) => a - b));
    expect(localStorage.getItem('heroesim.poolOrder')).toBe('fee');

    // Kept for the next time the page opens in this browser.
    cleanup();
    render_(started());
    expect(within(section('Unattached pool')).getByRole('columnheader', { name: 'Fee' }).getAttribute('aria-sort')).toBe('ascending');

    fireEvent.click(within(section('Unattached pool')).getByRole('button', { name: 'Order by Fee' }));
    expect(rows().map(({ name }) => name)).toEqual(listed);
    expect(localStorage.getItem('heroesim.poolOrder')).toBe('listed');
  });

  test("a Hero's name opens their page in place, and back returns the keyboard to their row", () => {
    render_(started());
    const [first] = rows();
    if (first === undefined) throw new Error('an empty pool');

    fireEvent.click(within(first.row).getByRole('button', { name: first.name }));

    const page = within(section('Unattached pool')).getByRole('article');
    expect(document.activeElement).toBe(within(page).getByRole('heading', { level: 4, name: first.name }));
    expect(within(page).getByText(/^Signing fee \d+ Wealth\. Signs for your Guild: (yes|needs Fame \d+)\.$/)).toBeDefined();
    fireEvent.click(within(page).getByRole('button', { name: 'Back to the pool' }));
    expect(document.activeElement).toBe(within(section('Unattached pool')).getByRole('button', { name: first.name }));
  });

  test('a browser that refuses its storage lists the pool in its own order', () => {
    const blocked = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get() {
        throw new Error('storage blocked');
      },
    });
    try {
      render_(started());
      expect(within(section('Unattached pool')).getByRole('columnheader', { name: 'Class' }).getAttribute('aria-sort')).toBeNull();
      fireEvent.click(within(section('Unattached pool')).getByRole('button', { name: 'Order by Class' }));
      expect(within(section('Unattached pool')).getByRole('columnheader', { name: 'Class' }).getAttribute('aria-sort')).toBe('ascending');
    } finally {
      if (blocked !== undefined) Object.defineProperty(globalThis, 'localStorage', blocked);
    }
  });
});

// DL-169 items 6 to 11: the Roster as Tiles or a Table, its columns chosen in a panel on a
// wide screen and in five tabs on a phone, one "Sort by" for both views with the Table's headings in
// step, each Hero's Traits and Items, and every choice kept in this browser, never in the save.

/** The Stats as content lists them, by area: what the Table's columns follow. */
const physical = ['Strength', 'Dexterity', 'Weaponry', 'Constitution', 'Endurance'];
const mental = ['Intelligence', 'Knowledge', 'Perception', 'Wits', 'Courage', 'Willpower'];
const magical = ['Arcana', 'Power', 'Spelllore', 'Spirit', 'Resistance'];
const social = ['Leadership', 'Charisma', 'Diplomacy', 'Adaptability'];
const heroColumns = ['Class', 'Level', 'Age', 'Morale', 'Where', 'Traits', 'Items'];

/**
 * A new game whose first Hero is a Warrior carrying an arming sword, holding Lame, Weaponry 10,
 * Strength 11, Dexterity 12 and Charisma 10, and whose second is a Mage of Arcana 14; their
 * Guildmaster holds Old soldier (+1 Weaponry to Warriors) and Mistrusts magic (-1 Arcana to Mages),
 * and no other Hero holds a Trait.
 */
function stocked(): { state: GameState; warrior: string; mage: string } {
  let warrior = '';
  let mage = '';
  const state = changed(carrying(started(), 'arming-sword', 'weapon'), (document, player) => {
    const [first, second] = player.rosterIds.map((id) => document.world.heroes[id]);
    const guildmaster = document.world.guildmasters[player.guildmasterId];
    if (first === undefined || second === undefined || guildmaster === undefined) throw new Error('two Heroes and a Guildmaster wanted');
    for (const id of player.rosterIds) {
      const hero = document.world.heroes[id];
      if (hero !== undefined) hero.traits = [];
    }
    guildmaster.traits = ['old-soldier', 'mistrusts-magic'];
    Object.assign(first, { classKey: 'warrior', traits: ['lame'] });
    Object.assign(first.stats, { weaponry: 10, strength: 11, dexterity: 12, charisma: 10 });
    second.classKey = 'mage';
    second.stats['arcana'] = 14;
    warrior = first.name;
    mage = second.name;
  });
  return { state, warrior, mage };
}

/** The switch between Tiles and the Table. */
function showAs(view: 'Tiles' | 'Table'): void {
  fireEvent.click(within(within(section('Roster')).getByRole('radiogroup', { name: 'Show the Roster as' })).getByRole('radio', { name: view }));
}

/** The Roster's Table. */
function rosterTable(): HTMLElement {
  return within(section('Roster')).getByRole('table', { name: 'Heroes on the Roster' });
}

/** The Table's headings, as they read. */
function headings(): string[] {
  return within(rosterTable())
    .getAllByRole('columnheader')
    .map((heading) => heading.textContent ?? '');
}

/** The Table's Heroes, by name, top to bottom. */
function tableNames(): string[] {
  return within(rosterTable())
    .getAllByRole('rowheader')
    .map((name) => name.textContent ?? '');
}

/** The Tiles' Heroes, by name, first to last. */
function tileNames(): string[] {
  return cards().map((card) => within(card).getByRole('button').textContent ?? '');
}

/** The cell of `column` in the row of the Hero named `name`. */
function cellOf(name: string, column: string): HTMLElement {
  const row = within(rosterTable()).getByRole('rowheader', { name }).closest('tr');
  const found = row?.querySelector<HTMLElement>(`[data-column="${column}"]`);
  if (found === null || found === undefined) throw new Error(`no ${column} for ${name}`);
  return found;
}

/** What a screen reader reads of `element`: its words, those hidden from it left out. */
function read(element: HTMLElement): string {
  const copy = element.cloneNode(true) as HTMLElement;
  for (const hidden of copy.querySelectorAll('[aria-hidden="true"]')) hidden.remove();
  return copy.textContent ?? '';
}

/** The tooltip on `element`'s shown part: the one element of it that bears a `title`. */
function tooltip(element: HTMLElement): string {
  const titled = [element, ...element.querySelectorAll<HTMLElement>('[title]')].filter((each) => each.hasAttribute('title'));
  expect(titled).toHaveLength(1);
  return titled[0]?.title ?? '';
}

/**
 * Every tooltip in `scope` sits on a part hidden from the screen reader, whose own words are beside it:
 * a mouse's tooltip, never read as well as those words (S10, the close review's W3).
 */
function tooltipsUnread(scope: HTMLElement): void {
  const titled = [scope, ...scope.querySelectorAll<HTMLElement>('[title]')].filter((each) => each.hasAttribute('title'));
  expect(titled.length).toBeGreaterThan(0);
  for (const element of titled) expect(element.closest('[aria-hidden="true"]'), element.outerHTML).not.toBeNull();
}

/** The "Sort by" dropdown. */
function sortBy(): HTMLSelectElement {
  return within(section('Roster')).getByRole('combobox', { name: 'Sort by' }) as HTMLSelectElement;
}

/** The button that reverses the sort, named by the direction it is in. */
function direction(): HTMLElement {
  return within(section('Roster')).getByTestId('roster-direction');
}

/** The browser as a phone's, under 600px, for what `useNarrow` reads; gives back a function that restores it. */
function asPhone(): () => void {
  const before = Object.getOwnPropertyDescriptor(globalThis, 'matchMedia');
  Object.defineProperty(globalThis, 'matchMedia', {
    configurable: true,
    value: (query: string) => ({ matches: query === '(max-width: 599px)', media: query, addEventListener: () => undefined, removeEventListener: () => undefined }),
  });
  return () => {
    if (before === undefined) Reflect.deleteProperty(globalThis, 'matchMedia');
    else Object.defineProperty(globalThis, 'matchMedia', before);
  };
}

describe('the Roster as Tiles or a Table (DL-169 item 6)', () => {
  test('opens in Tiles the first time, switches to the Table and back, and keeps the last choice in this browser', () => {
    render_(started());
    // A choice of one, announced so (DL-206 item 27, DL-213).
    const group = within(section('Roster')).getByRole('radiogroup', { name: 'Show the Roster as' });
    expect(within(group).getByRole('radio', { name: 'Tiles' }).getAttribute('aria-checked')).toBe('true');
    expect(within(group).getByRole('radio', { name: 'Table' }).getAttribute('aria-checked')).toBe('false');
    expect(cards()).toHaveLength(4);
    expect(within(section('Roster')).queryByRole('table', { name: 'Heroes on the Roster' })).toBeNull();

    showAs('Table');

    expect(within(section('Roster')).queryByRole('list', { name: 'Heroes on the Roster' })).toBeNull();
    expect(within(rosterTable()).getAllByRole('rowheader')).toHaveLength(4);
    expect(localStorage.getItem('heroesim.rosterView')).toBe('table');
    // The Offers and the Unattached pool below it, as they were.
    expect(within(section('Unattached pool')).getByRole('table', { name: 'Heroes in the Unattached pool' })).toBeDefined();

    cleanup();
    render_(started());
    expect(rosterTable()).toBeDefined();
    showAs('Tiles');
    expect(cards()).toHaveLength(4);
    expect(localStorage.getItem('heroesim.rosterView')).toBe('tiles');
  });

  test("the tiles add each Trait with what it does and each Item the Hero carries, its effect in a tooltip and the screen reader's words, and no Stat", () => {
    const { state, warrior } = stocked();
    render_(changed(state, (document, player) => {
      const first = document.world.heroes[player.rosterIds[0] as never];
      if (first !== undefined) first.traits = ['lame', 'battle-tried'];
    }));

    const card = cards().find((each) => within(each).getByRole('button').textContent === warrior) as HTMLElement;
    expect(chip(card, 'Lame: -2 Dexterity, -1 Endurance').title).toBe('Trait');
    expect(chip(card, 'Battle-tried: +2 to every Check of combat Encounters').title).toBe('Trait');
    const sword = chip(card, 'Arming sword');
    expect(tooltip(sword)).toBe('Weaponry +2, Strength +1');
    expect(read(sword)).toBe('Arming sword: Weaponry +2, Strength +1');
    tooltipsUnread(sword);
    // No Stats on a tile: no Stat's name stands in a card but in an Item's words.
    for (const each of cards()) {
      const shown = Array.from(each.querySelectorAll('*:not(.visually-hidden)'))
        .filter((element) => element.children.length === 0)
        .map((element) => element.textContent ?? '');
      expect(shown.filter((words) => [...physical, ...mental, ...magical, ...social].includes(words))).toEqual([]);
      expect(each.querySelector('table')).toBeNull();
    }
    // A Hero with neither shows neither.
    const other = cards().find((each) => each !== card) as HTMLElement;
    expect(other.querySelector('.hero-card__traits')).toBeNull();
    expect(other.querySelector('.hero-card__items')).toBeNull();
  });
});

describe("the Roster's Table (DL-169 items 7 to 9)", () => {
  test('has Name with its thumbnail pinned, then Class, Level, Age, Morale, where the Hero is, Traits, Items and the 20 Stats', () => {
    render_(withPartyOut(started()));
    showAs('Table');

    expect(headings()).toEqual(['Name', ...heroColumns, ...physical, ...mental, ...magical, ...social]);
    expect(rosterTable().className).toContain('table--first-sticky');
    for (const name of within(rosterTable()).getAllByRole('rowheader')) {
      expect(within(name).getByTestId('portrait-thumb')).toBeDefined();
      expect(within(name).getByRole('button').className).toBe('link');
    }
    const [first] = tableNames();
    expect(cellOf(first ?? '', 'class').textContent).toMatch(/^(Warrior|Rogue|Mage|Healer)$/);
    expect(cellOf(first ?? '', 'level').textContent).toMatch(/^\d+$/);
    expect(cellOf(first ?? '', 'age').textContent).toMatch(/^\d+$/);
    expect(cellOf(first ?? '', 'morale').textContent).toMatch(/^\d+, (wretched|low|steady|high|elated)$/);
    // Where the Hero is, in its full words with the date.
    const where = tableNames().map((name) => cellOf(name, 'where').textContent);
    expect(where.some((words) => /^Away with a Party, back on the night of Year \d+ Day \d+$/.test(words ?? ''))).toBe(true);
    expect(where).toContain('At the Hall');
    // The Table scrolls in its own box.
    expect(rosterTable().parentElement?.className).toContain('table-wrap');
  });

  test("shows each Stat's effective value, raised in green with a ▲ and lowered in red with a ▼, the base and each source in its tooltip and the screen reader's words, and a net change of nothing plain", () => {
    const { state, warrior, mage } = stocked();
    render_(state);
    showAs('Table');

    const weaponry = cellOf(warrior, 'weaponry');
    expect(weaponry.className).toBe('number change change--up');
    expect(weaponry.querySelector('[aria-hidden="true"]')?.textContent).toBe('13 ▲');
    expect(tooltip(weaponry)).toBe("Base 10, +1 from the Guildmaster's Class bonus, +2 from Gear");
    expect(read(weaponry)).toBe("13, raised: Base 10, +1 from the Guildmaster's Class bonus, +2 from Gear");
    expect(cellOf(warrior, 'strength').querySelector('[aria-hidden="true"]')?.textContent).toBe('12 ▲');

    const dexterity = cellOf(warrior, 'dexterity');
    expect(dexterity.className).toBe('number change change--down');
    expect(dexterity.querySelector('[aria-hidden="true"]')?.textContent).toBe('10 ▼');
    expect(read(dexterity)).toBe('10, lowered: Base 12, -2 from Traits');
    expect(cellOf(mage, 'arcana').querySelector('[aria-hidden="true"]')?.textContent).toBe('13 ▼');
    expect(tooltip(cellOf(mage, 'arcana'))).toBe("Base 14, -1 from the Guildmaster's Class bonus");

    // Nothing changes it: plain, the value alone.
    const charisma = cellOf(warrior, 'charisma');
    expect(charisma.className).toBe('number');
    expect(charisma.textContent).toBe('10');
    expect(charisma.querySelector('[title]')).toBeNull();
    expect(charisma.title).toBe('');

    // Each tooltip is the mouse's alone: the screen reader reads the words beside it once (S10, W3).
    tooltipsUnread(rosterTable());
  });

  test("gives the Traits and Items by name, each effect in a tooltip and the screen reader's words; None for a Hero with neither", () => {
    const { state, warrior, mage } = stocked();
    render_(state);
    showAs('Table');

    const lame = within(cellOf(warrior, 'traits')).getByText('Lame');
    expect(lame.title).toBe('-2 Dexterity, -1 Endurance');
    expect(read(cellOf(warrior, 'traits'))).toBe('Lame: -2 Dexterity, -1 Endurance');
    const sword = within(cellOf(warrior, 'items')).getByText('Arming sword');
    expect(sword.title).toBe('Weaponry +2, Strength +1');
    expect(read(cellOf(warrior, 'items'))).toBe('Arming sword: Weaponry +2, Strength +1');
    tooltipsUnread(cellOf(warrior, 'traits'));
    tooltipsUnread(cellOf(warrior, 'items'));
    expect(cellOf(mage, 'traits').textContent).toBe('None');
    expect(cellOf(mage, 'items').textContent).toBe('None');
  });

  test("a Hero's name opens their page in place, unchanged, and back returns the keyboard to their name in the Table", () => {
    const { state, warrior } = stocked();
    render_(state);
    showAs('Table');

    fireEvent.click(within(rosterTable()).getByRole('button', { name: warrior }));
    const page = within(section('Roster')).getByRole('article');
    expect(document.activeElement).toBe(within(page).getByRole('heading', { level: 3, name: warrior }));
    // The page as it is: its Stats in four blocks with their Outlooks.
    expect(within(page).getAllByTitle('Outlook')).toHaveLength(20);
    fireEvent.click(within(page).getByRole('button', { name: 'Back to the Roster' }));
    expect(document.activeElement).toBe(within(rosterTable()).getByRole('button', { name: warrior }));
  });
});

describe('Unique Items on the Roster (DL-182 item 4)', () => {
  /** `stocked()`'s game with its Mage carrying the Lantern of Stannary, a Unique Item; its Warrior carries only a Common Item. */
  function lit(): { state: GameState; warrior: string; mage: string } {
    const { state, warrior, mage } = stocked();
    return { state: carryingUnique(state, 'lantern-of-stannary', 'trinket', 1), warrior, mage };
  }

  /** The tile of the Hero named `name`. */
  function tileOf(name: string): HTMLElement {
    const found = cards().find((each) => within(each).getByRole('button').textContent === name);
    if (found === undefined) throw new Error(`no tile for ${name}`);
    return found;
  }

  /** The row of the Hero named `name` in the Table. */
  function rowOf(name: string): HTMLElement {
    const found = within(rosterTable()).getByRole('rowheader', { name }).closest('tr');
    if (found === null) throw new Error(`no row for ${name}`);
    return found;
  }

  test("on the Tiles, a Hero carrying a Unique Item shows its picture before its name in its chip, the chest's Silhouette, and their tile the gold glow; a Hero with only Common Items, or none, neither", () => {
    const { state, warrior, mage } = lit();
    render_(state);

    const tile = tileOf(mage);
    expect(tile.className).toBe('card hero-card carries-unique');
    const lantern = chip(tile, 'The Lantern of Stannary');
    const picture = within(lantern).getByTestId('item-picture');
    // Before the name: the chip's first part, hidden from the screen reader as everywhere it stands.
    expect(lantern.firstElementChild).toBe(picture);
    expect(picture.getAttribute('aria-hidden')).toBe('true');
    expect([...picture.querySelectorAll('img')].map((img) => [img.dataset.picture, img.getAttribute('alt')])).toEqual([['silhouette', '']]);
    expect(picture.querySelector('img')?.getAttribute('src')).toBe(mediaFiles['items/silhouette.svg']);
    // The chip's tooltip and the screen reader's words as a Common Item's are.
    expect(tooltip(lantern)).toBe('Perception +3, Wits +2');
    expect(read(lantern)).toBe('The Lantern of Stannary: Perception +3, Wits +2');
    tooltipsUnread(lantern);

    // A Common Item: no picture, and no glow on its carrier's tile.
    const common = tileOf(warrior);
    expect(common.className).toBe('card hero-card');
    expect(within(chip(common, 'Arming sword')).queryByTestId('item-picture')).toBeNull();
    // No Item at all: neither.
    for (const other of cards().filter((each) => each !== tile && each !== common)) {
      expect(other.className).toBe('card hero-card');
      expect(within(other).queryByTestId('item-picture')).toBeNull();
    }
  });

  test("on the Tiles, the glow adds no words: the screen reader reads a glowing tile as it reads one without (DL-182 item 4)", () => {
    const { state, mage } = lit();
    render_(state);
    const tile = tileOf(mage);
    for (const name of ['aria-label', 'aria-describedby', 'title', 'role']) expect(tile.hasAttribute(name), name).toBe(false);
    const glowing = read(tile);
    cleanup();
    // The same Hero without the Lantern: no glow, and the same words but the Item's own.
    render_(stocked().state);
    expect(glowing).toBe(`${read(tileOf(mage))}The Lantern of Stannary: Perception +3, Wits +2`);
  });

  test("in the Table, the row of a Hero carrying a Unique Item has the gold glow and no picture, its Items cell naming the Item; the others neither; on a phone's tabs too", () => {
    const { state, warrior, mage } = lit();
    render_(state);
    showAs('Table');

    const row = rowOf(mage);
    expect(row.className).toBe('carries-unique');
    expect(row.querySelector('[data-testid="item-picture"]')).toBeNull();
    // The Items cell names the Unique Item: the glow is never all that says so.
    expect(within(cellOf(mage, 'items')).getByText('The Lantern of Stannary')).toBeDefined();
    expect(read(cellOf(mage, 'items'))).toBe('The Lantern of Stannary: Perception +3, Wits +2');
    for (const name of ['aria-label', 'aria-describedby', 'title', 'role']) expect(row.hasAttribute(name), name).toBe(false);
    for (const other of tableNames().filter((name) => name !== mage)) expect(rowOf(other).className, other).toBe('');
    expect(rowOf(warrior).className).toBe('');
    cleanup();

    const restore = asPhone();
    try {
      render_(state);
      const tabs = within(section('Roster')).getByRole('tablist', { name: 'Columns of the Table' });
      for (const tab of within(tabs).getAllByRole('tab')) {
        fireEvent.click(tab);
        expect(rowOf(mage).className, tab.textContent ?? '').toBe('carries-unique');
        expect(rowOf(warrior).className, tab.textContent ?? '').toBe('');
        expect(rosterTable().querySelector('[data-testid="item-picture"]')).toBeNull();
      }
    } finally {
      restore();
    }
  });
});

describe('no Potential on the Roster (data-model rule 9)', () => {
  test('neither the tiles nor the Table show Potential or its hint', () => {
    const { state } = stocked();
    render_(state);
    const roster = (): HTMLElement => within(section('Roster')).getByRole('list', { name: 'Heroes on the Roster' });

    for (const shown of [roster(), (showAs('Table'), rosterTable())]) {
      expect(shown.innerHTML).not.toMatch(/potential|outlook/i);
      expect(shown.textContent).not.toMatch(/Modest|Promising|Exceptional/);
    }
    expect(within(section('Roster')).queryAllByTitle('Outlook')).toEqual([]);
  });
});

describe("the Table's Columns panel, on a wide screen (DL-169 item 7)", () => {
  test('groups its boxes as Hero and the four areas, every column on; a box hides its column, All and None a group, and Reset shows every one; Name always shows', () => {
    render_(started());
    showAs('Table');
    const button = within(section('Roster')).getByRole('button', { name: 'Columns' });
    expect(button.getAttribute('aria-expanded')).toBe('false');

    fireEvent.click(button);

    expect(button.getAttribute('aria-expanded')).toBe('true');
    const panel = within(section('Roster')).getByRole('group', { name: 'Columns' });
    expect(Array.from(panel.querySelectorAll('legend')).map((legend) => legend.textContent)).toEqual(['Hero', 'Physical', 'Mental', 'Magical', 'Social']);
    const boxes = within(panel).getAllByRole('checkbox') as HTMLInputElement[];
    expect(boxes.map((box) => box.labels?.[0]?.textContent)).toEqual([...heroColumns, ...physical, ...mental, ...magical, ...social]);
    expect(boxes.every((box) => box.checked)).toBe(true);
    expect(within(panel).queryByRole('checkbox', { name: 'Name' })).toBeNull();

    fireEvent.click(within(panel).getByRole('checkbox', { name: 'Strength' }));
    fireEvent.click(within(panel).getByRole('checkbox', { name: 'Traits' }));
    expect(headings()).not.toContain('Strength');
    expect(headings()).not.toContain('Traits');
    expect(localStorage.getItem('heroesim.rosterColumns')).toBe('traits,strength');

    fireEvent.click(within(panel).getByRole('button', { name: 'None of the Mental columns' }));
    expect(headings().filter((heading) => mental.includes(heading))).toEqual([]);
    fireEvent.click(within(panel).getByRole('button', { name: 'None of the Hero columns' }));
    expect(headings().slice(0, 2)).toEqual(['Name', 'Dexterity']);
    fireEvent.click(within(panel).getByRole('button', { name: 'All the Mental columns' }));
    expect(headings().filter((heading) => mental.includes(heading))).toEqual(mental);

    // Every column hidden: Name still shows.
    for (const group of ['Hero', 'Physical', 'Mental', 'Magical', 'Social']) fireEvent.click(within(panel).getByRole('button', { name: `None of the ${group} columns` }));
    expect(headings()).toEqual(['Name']);
    expect(tableNames()).toHaveLength(4);

    // Kept for the next time the page opens in this browser.
    cleanup();
    render_(started());
    expect(headings()).toEqual(['Name']);
    fireEvent.click(within(section('Roster')).getByRole('button', { name: 'Columns' }));
    fireEvent.click(within(within(section('Roster')).getByRole('group', { name: 'Columns' })).getByRole('button', { name: 'Reset the columns' }));
    expect(headings()).toEqual(['Name', ...heroColumns, ...physical, ...mental, ...magical, ...social]);
    expect(localStorage.getItem('heroesim.rosterColumns')).toBe('');
  });

  test('is not offered on the tiles', () => {
    render_(started());
    expect(within(section('Roster')).queryByRole('button', { name: 'Columns' })).toBeNull();
  });
});

describe("the Table's tabs, on a phone (DL-169 item 7)", () => {
  test('shows one group at a time, Hero first, Name pinned; no Columns panel; the columns hidden on a wide screen stay hidden; the tab kept in this browser', () => {
    const restore = asPhone();
    try {
      localStorage.setItem('heroesim.rosterColumns', 'strength,traits');
      render_(started());
      showAs('Table');
      expect(within(section('Roster')).queryByRole('button', { name: 'Columns' })).toBeNull();
      const tabs = within(section('Roster')).getByRole('tablist', { name: 'Columns of the Table' });
      expect(within(tabs).getAllByRole('tab').map((tab) => tab.textContent)).toEqual(['Hero', 'Physical', 'Mental', 'Magical', 'Social']);
      expect(within(tabs).getByRole('tab', { name: 'Hero' }).getAttribute('aria-selected')).toBe('true');
      expect(headings()).toEqual(['Name', 'Class', 'Level', 'Age', 'Morale', 'Where', 'Items']);
      expect(within(section('Roster')).getByRole('tabpanel', { name: 'Hero' }).contains(rosterTable())).toBe(true);

      fireEvent.click(within(tabs).getByRole('tab', { name: 'Physical' }));
      expect(headings()).toEqual(['Name', ...physical.filter((name) => name !== 'Strength')]);
      fireEvent.click(within(tabs).getByRole('tab', { name: 'Social' }));
      expect(headings()).toEqual(['Name', ...social]);
      expect(localStorage.getItem('heroesim.rosterTab')).toBe('social');

      cleanup();
      render_(started());
      expect(within(section('Roster')).getByRole('tab', { name: 'Social' }).getAttribute('aria-selected')).toBe('true');
      expect(headings()).toEqual(['Name', ...social]);
    } finally {
      restore();
    }
  });

  test('says so when every column of a tab is hidden, Name still shown', () => {
    const restore = asPhone();
    try {
      localStorage.setItem('heroesim.rosterColumns', social.map((name) => name.toLowerCase()).join(','));
      localStorage.setItem('heroesim.rosterTab', 'social');
      localStorage.setItem('heroesim.rosterView', 'table');
      render_(started());
      expect(headings()).toEqual(['Name']);
      expect(within(section('Roster')).getByText('The columns of this tab are hidden: show them from Columns on a wider screen.')).toBeDefined();
    } finally {
      restore();
    }
  });
});

describe("the Roster's sort (DL-169 item 10)", () => {
  test('offers Default, Name, Class, Level, Age, Morale, When free and each Stat by area, the default order first', () => {
    render_(started());
    const select = sortBy();
    expect(select.value).toBe('default');
    expect(Array.from(select.options).map((option) => option.textContent)).toEqual(['Default', 'Name', 'Class', 'Level', 'Age', 'Morale', 'When free', ...physical, ...mental, ...magical, ...social]);
    expect(Array.from(select.querySelectorAll('optgroup')).map((group) => group.label)).toEqual(['Physical', 'Mental', 'Magical', 'Social']);
    expect(direction().textContent).toBe('Default order');
    // The default order: Class in the content's order.
    const classes = cards().map((card) => /^(\w+) ·/.exec(card.querySelector('.hero-card__line')?.textContent ?? '')?.[1]);
    expect(classes).toEqual(['Warrior', 'Rogue', 'Mage', 'Healer']);
  });

  test('says in its help what sorts it: "Sort by", or any heading but Traits and Items, which have no sort (S10, the close review)', () => {
    render_(started());
    showAs('Table');

    const unsorted = within(rosterTable())
      .getAllByRole('columnheader')
      .filter((heading) => within(heading).queryByRole('button') === null)
      .map((heading) => heading.textContent);
    expect(unsorted).toEqual(['Traits', 'Items']);
    expect(help.roster).not.toMatch(/any column/);
    expect(help.roster).toContain('Sort from "Sort by" or by a column’s heading, any but Traits and Items.');
  });

  test('says in its help which choices this browser keeps, and that the filters are not among them (DL-206 item 28, DL-214)', () => {
    expect(help.roster).toContain('This browser keeps Tiles or Table, the order, the Table’s columns and a phone’s tab; the chips start at All each time.');
    expect(help.roster).not.toContain('keeps your choices');
  });

  test('sorts both views from the dropdown, the direction from its button; the headings in step, one pressed again reversing; ties in the default order', () => {
    const { state } = stocked();
    render_(changed(state, (document, player) => {
      // Two Heroes of Level 3, two of Level 1: the ties go to the default order whichever way.
      const heroes = player.rosterIds.map((id) => document.world.heroes[id]);
      for (const [index, hero] of heroes.entries()) if (hero !== undefined) hero.level = index < 2 ? 3 : 1;
    }));
    const byDefault = tileNames();

    fireEvent.change(sortBy(), { target: { value: 'name' } });
    expect(tileNames()).toEqual([...byDefault].sort());
    expect(direction().textContent).toBe('A to Z');
    fireEvent.click(direction());
    expect(direction().textContent).toBe('Z to A');
    expect(tileNames()).toEqual([...byDefault].sort().reverse());

    showAs('Table');
    expect(tableNames()).toEqual([...byDefault].sort().reverse());
    const heading = (label: string): HTMLElement => within(rosterTable()).getByRole('columnheader', { name: label });
    expect(heading('Name').getAttribute('aria-sort')).toBe('descending');

    // A heading: its sort, in its first direction, the dropdown in step.
    fireEvent.click(within(heading('Level')).getByRole('button', { name: 'Order by Level' }));
    expect(sortBy().value).toBe('level');
    expect(direction().textContent).toBe('Highest first');
    expect(heading('Level').getAttribute('aria-sort')).toBe('descending');
    expect(heading('Name').getAttribute('aria-sort')).toBeNull();
    const levels = tableNames().map((name) => Number(cellOf(name, 'level').textContent));
    expect(levels).toEqual([3, 3, 1, 1]);
    const high = tableNames().slice(0, 2);
    expect(high).toEqual(byDefault.filter((name) => high.includes(name)));

    // Pressed again: reversed, the ties still in the default order.
    fireEvent.click(within(heading('Level')).getByRole('button', { name: 'Order by Level' }));
    expect(heading('Level').getAttribute('aria-sort')).toBe('ascending');
    expect(direction().textContent).toBe('Lowest first');
    expect(tableNames().slice(2)).toEqual(high);

    // A Stat's heading: its effective value, highest first.
    fireEvent.click(within(heading('Weaponry')).getByRole('button', { name: 'Order by Weaponry' }));
    expect(sortBy().value).toBe('weaponry');
    const weaponry = tableNames().map((name) => Number(/^\d+/.exec(cellOf(name, 'weaponry').textContent ?? '')?.[0]));
    expect(weaponry).toEqual([...weaponry].sort((a, b) => b - a));
    // Age, youngest first; the tiles in the same order.
    fireEvent.change(sortBy(), { target: { value: 'age' } });
    expect(direction().textContent).toBe('Youngest first');
    expect(heading('Age').getAttribute('aria-sort')).toBe('ascending');
    const sortedNames = tableNames();
    showAs('Tiles');
    expect(tileNames()).toEqual(sortedNames);
  });

  test("names the direction's button by its action, then its state, the shown words kept and its tooltip read once (#52's judgement call 4, DL-185)", () => {
    render_(started());
    const roster = within(section('Roster'));
    expect(roster.getByRole('button', { name: 'Reverse the order, now default order' })).toBe(direction());
    expect(direction().textContent).toBe('Default order');

    fireEvent.change(sortBy(), { target: { value: 'name' } });
    expect(roster.getByRole('button', { name: 'Reverse the order, now A to Z' })).toBe(direction());
    expect(direction().textContent).toBe('A to Z');
    fireEvent.click(roster.getByRole('button', { name: 'Reverse the order, now A to Z' }));
    expect(roster.getByRole('button', { name: 'Reverse the order, now Z to A' })).toBe(direction());
    expect(direction().textContent).toBe('Z to A');

    fireEvent.change(sortBy(), { target: { value: 'level' } });
    expect(roster.getByRole('button', { name: 'Reverse the order, now highest first' })).toBe(direction());
    expect(direction().textContent).toBe('Highest first');

    // The tooltip "Reverse the order" stays a mouse's, on the shown part the screen reader passes over,
    // so it is not read again after the name (W3's way, S10's close review).
    expect(direction().hasAttribute('title')).toBe(false);
    const tipped = direction().querySelector('[title]');
    expect(tipped?.getAttribute('title')).toBe('Reverse the order');
    expect(tipped?.closest('[aria-hidden="true"]')).not.toBeNull();
  });

  test('keeps the sort and its direction in this browser', () => {
    render_(started());
    fireEvent.change(sortBy(), { target: { value: 'morale' } });
    fireEvent.click(direction());
    expect(localStorage.getItem('heroesim.rosterOrder')).toBe('morale:ascending');

    cleanup();
    render_(started());
    expect(sortBy().value).toBe('morale');
    expect(direction().textContent).toBe('Lowest first');
  });
});

describe("the Roster's choices in a browser that refuses its storage (DL-169 item 11)", () => {
  test('opens as by default, and its choices still work while the page is open', () => {
    localStorage.setItem('heroesim.rosterView', 'table');
    localStorage.setItem('heroesim.rosterOrder', 'name:descending');
    const blocked = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get() {
        throw new Error('storage blocked');
      },
    });
    try {
      render_(started());
      expect(cards()).toHaveLength(4);
      expect(sortBy().value).toBe('default');
      expect(direction().textContent).toBe('Default order');

      showAs('Table');
      fireEvent.click(within(section('Roster')).getByRole('button', { name: 'Columns' }));
      fireEvent.click(within(within(section('Roster')).getByRole('group', { name: 'Columns' })).getByRole('checkbox', { name: 'Age' }));
      expect(headings()).not.toContain('Age');
      fireEvent.change(sortBy(), { target: { value: 'name' } });
      expect(tableNames()).toEqual([...tableNames()].sort());
    } finally {
      if (blocked !== undefined) Object.defineProperty(globalThis, 'localStorage', blocked);
    }
  });

  test('keeps its choices under its four keys in this browser, and nothing else of them', () => {
    const restore = asPhone();
    try {
      render_(started());
      showAs('Table');
      fireEvent.change(sortBy(), { target: { value: 'strength' } });
      fireEvent.click(within(section('Roster')).getByRole('tab', { name: 'Mental' }));
    } finally {
      restore();
    }
    cleanup();
    render_(started());
    fireEvent.click(within(section('Roster')).getByRole('button', { name: 'Columns' }));
    fireEvent.click(within(within(section('Roster')).getByRole('group', { name: 'Columns' })).getByRole('checkbox', { name: 'Age' }));

    const kept = Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index) ?? '')
      // The page's other preferences, each kept as the page opens on it (DL-201).
      .filter((key) => !['heroesim.view', 'heroesim.guildPart', 'heroesim.boardOrder', 'heroesim.poolOrder'].includes(key));
    expect(kept.sort()).toEqual(['heroesim.rosterColumns', 'heroesim.rosterOrder', 'heroesim.rosterTab', 'heroesim.rosterView']);
  });
});

// DL-171: a Stat moved by sources whose net change is nothing, a
// browser that keeps stale or corrupt choices, and a window that crosses 600px while the Table is open.

describe("the Roster's Table, a Stat whose net change is nothing (DL-169 item 8)", () => {
  test("is plain, its figure alone, the sources and the bound still in its tooltip and the screen reader's words", () => {
    const { state, warrior } = stocked();
    render_(
      changed(carrying(state, 'signet-ring', 'trinket'), (document, player) => {
        const first = document.world.heroes[player.rosterIds[0] as never];
        if (first === undefined) throw new Error('no Hero');
        // At the top: Weaponry 20, +1 from the Class bonus and +2 from the sword, held at 20.
        first.stats['weaponry'] = 20;
        // The ring's +1 Charisma against Scarred's -1: they cancel.
        first.traits = ['lame', 'scarred'];
      }),
    );
    showAs('Table');

    const weaponry = cellOf(warrior, 'weaponry');
    expect(weaponry.className).toBe('number');
    expect(weaponry.querySelector('[aria-hidden="true"]')?.textContent).toBe('20');
    expect(read(weaponry)).toBe("20, Base 20, +1 from the Guildmaster's Class bonus, +2 from Gear, held at 20");
    expect(tooltip(weaponry)).toBe("Base 20, +1 from the Guildmaster's Class bonus, +2 from Gear, held at 20");
    tooltipsUnread(weaponry);

    const charisma = cellOf(warrior, 'charisma');
    expect(charisma.className).toBe('number');
    expect(tooltip(charisma)).toBe('Base 10, +1 from Gear, -1 from Traits');
    expect(read(charisma)).toBe('10, Base 10, +1 from Gear, -1 from Traits');
    expect(charisma.textContent).not.toMatch(/[▲▼]/);
    tooltipsUnread(charisma);
  });
});

describe("the Roster's filters (DL-206 items 25 to 29)", () => {
  /** Where a Hero is, as the filter names it. */
  type At = 'At the Hall' | 'Injured' | 'Away';
  interface Filtered {
    name: string;
    className: string;
    at: At;
  }

  /**
   * The Lantern with a Party out, its Heroes' Classes set Warrior, Rogue, Warrior, Mage in the order
   * they joined (no Healer), and the first at home injured; with each Hero's name, Class and where.
   */
  function filtering(): { state: GameState; heroes: Filtered[] } {
    const heroes: Filtered[] = [];
    const classes = ['warrior', 'rogue', 'warrior', 'mage'] as const;
    const names: Readonly<Record<(typeof classes)[number], string>> = { warrior: 'Warrior', rogue: 'Rogue', mage: 'Mage' };
    const state = changed(withPartyOut(started()), (document, player) => {
      let injured = false;
      player.rosterIds.forEach((id, at) => {
        const hero = document.world.heroes[id];
        const classKey = classes[at % classes.length] ?? 'warrior';
        if (hero === undefined) return;
        hero.classKey = classKey;
        if (!injured && hero.partyId === null) {
          hero.injury = { typeKey: 'deep-cut', healsOnTurn: 20 };
          injured = true;
        }
        heroes.push({ name: hero.name, className: names[classKey], at: hero.partyId !== null ? 'Away' : hero.injury !== null ? 'Injured' : 'At the Hall' });
      });
      if (!injured) throw new Error('no Hero at home to injure');
    });
    return { state, heroes };
  }

  const classes = (): HTMLElement => within(section('Roster')).getByRole('group', { name: 'Class' });
  const availability = (): HTMLElement => within(section('Roster')).getByRole('group', { name: 'Where' });
  const words = (group: HTMLElement): string[] => within(group).getAllByRole('button').map((button) => button.textContent ?? '');
  const press = (group: HTMLElement, name: string): void => {
    fireEvent.click(within(group).getByRole('button', { name: name === 'All' ? 'All' : new RegExp(`^${name} \\d+$`) }));
  };
  const showing = (): string | null => within(section('Roster')).queryByTestId('roster-shown')?.textContent ?? null;
  const count = (list: readonly Filtered[], keep: (hero: Filtered) => boolean): number => list.filter(keep).length;

  test('by Class, in the order content declares, and by At the Hall, Injured and Away, each with its count; a choice with none greyed', () => {
    const { state, heroes } = filtering();
    render_(state);
    expect(words(classes())).toEqual(['All', 'Warrior 2', 'Rogue 1', 'Mage 1', 'Healer 0']);
    expect(within(classes()).getByRole('button', { name: 'Healer 0' }).classList.contains('is-empty')).toBe(true);
    const at = (where: At): number => count(heroes, (hero) => hero.at === where);
    expect(at('Injured')).toBe(1);
    expect(at('Away')).toBeGreaterThan(0);
    expect(words(availability())).toEqual(['All', `At the Hall ${at('At the Hall')}`, 'Injured 1', `Away ${at('Away')}`]);
    // Nothing hidden: no "Showing" line; the Roster's count as before.
    expect(showing()).toBeNull();
    expect(within(section('Roster')).getByText('4 Heroes on the Roster.')).toBeDefined();
  });

  test('each group shows its name, Class and Where, before its chips, and is named by it (DL-213)', () => {
    const { state } = filtering();
    render_(state);
    for (const [group, name] of [
      [classes(), 'Class'],
      [availability(), 'Where'],
    ] as const) {
      const label = group.firstElementChild as HTMLElement;
      expect(label.textContent).toBe(name);
      expect(label.closest('button')).toBeNull();
      expect(group.getAttribute('aria-labelledby')).toBe(label.id);
      expect(words(group)[0]).toBe('All');
    }
  });

  test('a Hero shown when they match both; several choices of a filter show either; each count against the other filter; "Showing" says how many', () => {
    const { state, heroes } = filtering();
    render_(state);
    press(classes(), 'Warrior');
    const warriors = heroes.filter((hero) => hero.className === 'Warrior');
    expect(tileNames().sort()).toEqual(warriors.map((hero) => hero.name).sort());
    expect(showing()).toBe('Showing 2 of 4 Heroes.');
    // The places count among the Warriors; the Classes still among everyone.
    expect(words(availability())).toEqual([
      'All',
      `At the Hall ${count(warriors, (hero) => hero.at === 'At the Hall')}`,
      `Injured ${count(warriors, (hero) => hero.at === 'Injured')}`,
      `Away ${count(warriors, (hero) => hero.at === 'Away')}`,
    ]);
    expect(words(classes())).toEqual(['All', 'Warrior 2', 'Rogue 1', 'Mage 1', 'Healer 0']);

    press(classes(), 'Mage');
    const either = heroes.filter((hero) => hero.className === 'Warrior' || hero.className === 'Mage');
    expect(tileNames().sort()).toEqual(either.map((hero) => hero.name).sort());
    expect(showing()).toBe('Showing 3 of 4 Heroes.');

    press(availability(), 'Injured');
    const injured = either.filter((hero) => hero.at === 'Injured');
    expect(tileNames()).toEqual(injured.map((hero) => hero.name));
    expect(showing()).toBe(`Showing ${injured.length} of 4 Heroes.`);

    // All clears a filter.
    press(classes(), 'All');
    press(availability(), 'All');
    expect(tileNames()).toHaveLength(4);
    expect(showing()).toBeNull();
  });

  test('the Table shows the same Heroes, in the sort in force, and keeps the filters across the switch', () => {
    const { state, heroes } = filtering();
    render_(state);
    press(availability(), 'At the Hall');
    press(availability(), 'Away');
    const shown = heroes.filter((hero) => hero.at !== 'Injured').map((hero) => hero.name);
    fireEvent.change(sortBy(), { target: { value: 'name' } });
    expect(tileNames()).toEqual([...shown].sort());

    showAs('Table');
    expect(tableNames()).toEqual([...shown].sort());
    expect(showing()).toBe('Showing 3 of 4 Heroes.');
    fireEvent.click(direction());
    expect(tableNames()).toEqual([...shown].sort().reverse());
  });

  test("on a phone, each of the Table's tabs shows the same Heroes", () => {
    const restore = asPhone();
    try {
      const { state, heroes } = filtering();
      render_(state);
      showAs('Table');
      press(classes(), 'Warrior');
      const warriors = heroes.filter((hero) => hero.className === 'Warrior').map((hero) => hero.name);
      const tabs = within(section('Roster')).getByRole('tablist', { name: 'Columns of the Table' });
      for (const tab of within(tabs).getAllByRole('tab')) {
        fireEvent.click(tab);
        expect(tableNames().sort(), tab.textContent ?? '').toEqual([...warriors].sort());
      }
      expect(showing()).toBe('Showing 2 of 4 Heroes.');
    } finally {
      restore();
    }
  });

  test('says so when no Hero matches, in tiles and Table, the filters still there to change', () => {
    const { state } = filtering();
    render_(state);
    press(classes(), 'Healer');
    expect(within(section('Roster')).queryByRole('list', { name: 'Heroes on the Roster' })).toBeNull();
    expect(showing()).toBe('No Hero on the Roster matches the filters.');
    showAs('Table');
    expect(within(section('Roster')).queryByRole('table', { name: 'Heroes on the Roster' })).toBeNull();
    expect(showing()).toBe('No Hero on the Roster matches the filters.');

    press(classes(), 'Healer');
    expect(tableNames()).toHaveLength(4);
  });

  test('the lead keeps the whole Roster\'s count under a filter, and "Showing" is said as it changes, in a live region', () => {
    const { state } = filtering();
    render_(state);
    press(classes(), 'Warrior');
    expect(within(section('Roster')).getByText('4 Heroes on the Roster.')).toBeDefined();
    const line = within(section('Roster')).getByTestId('roster-shown');
    expect(line.closest('[role="status"]')).not.toBeNull();
    press(classes(), 'Healer');
    press(classes(), 'Warrior');
    expect(showing()).toBe('No Hero on the Roster matches the filters.');
    expect(within(section('Roster')).getByText('4 Heroes on the Roster.')).toBeDefined();
    expect(within(section('Roster')).getByTestId('roster-shown').closest('[role="status"]')).not.toBeNull();
  });

  test('"Showing" counts one Hero shown as well as several', () => {
    const { state, heroes } = filtering();
    render_(state);
    press(classes(), 'Rogue');
    expect(tileNames()).toEqual(heroes.filter((hero) => hero.className === 'Rogue').map((hero) => hero.name));
    expect(showing()).toBe('Showing 1 of 4 Heroes.');
  });

  test("closing the page of a Hero a filter now hides returns the keyboard to the Roster's heading, not the page's end (DL-213)", async () => {
    const { state: hurt, heroes } = filtering();
    const injured = heroes.find((hero) => hero.at === 'Injured');
    if (injured === undefined) throw new Error('no one injured');
    // Their Injury heals at the next night the world reaches.
    const state = changed(hurt, (document) => {
      const hero = Object.values(document.world.heroes).find((each) => each.name === injured.name);
      if (hero?.injury === null || hero?.injury === undefined) throw new Error('no Injury');
      hero.injury.healsOnTurn = document.world.turn;
    });
    render_(state);
    press(availability(), 'Injured');
    fireEvent.click(within(rosterList()).getByRole('button', { name: injured.name }));
    for (let turn = 0; turn < 3; turn += 1) {
      fireEvent.click(screen.getByRole('button', { name: 'Advance a Turn' }));
      await idle();
    }
    fireEvent.click(within(section('Roster')).getByRole('button', { name: 'Back to the Roster' }));

    expect(showing()).toBe('No Hero on the Roster matches the filters.');
    expect(document.activeElement).toBe(within(section('Roster')).getByRole('heading', { level: 2, name: 'Roster' }));
  });

  test("closing the page of a Hero who left the Roster while it was open returns the keyboard to the Roster's heading (DL-213)", async () => {
    const rich = withRichRivals(started());
    render_(rich);
    const { name, page } = openFirstHero(rich);
    fireEvent.click(within(page()).getByRole('button', { name: `Transfer ${name}…` }));
    const ask = within(page()).getByRole('group', { name: `Transfer ${name}?` });
    fireEvent.click(within(ask).getAllByRole('button', { name: new RegExp(`^Transfer ${name} to `) })[0] as HTMLElement);
    await idle();
    fireEvent.click(within(page()).getByRole('button', { name: 'Back to the Roster' }));

    expect(within(rosterList()).queryByRole('button', { name })).toBeNull();
    expect(document.activeElement).toBe(within(section('Roster')).getByRole('heading', { level: 2, name: 'Roster' }));
  });

  test('are not kept: the Roster opened again shows everyone', () => {
    const { state } = filtering();
    render_(state);
    press(classes(), 'Warrior');
    expect(tileNames()).toHaveLength(2);
    cleanup();
    render_(state);
    expect(tileNames()).toHaveLength(4);
    expect(within(classes()).getByRole('button', { name: 'All' }).getAttribute('aria-pressed')).toBe('true');
  });
});

describe("the Roster's choices kept stale or corrupt in this browser (DL-169 item 11)", () => {
  test('open as by default: an unknown view, sort, direction or tab is forgotten, and an unknown column is left out', () => {
    localStorage.setItem('heroesim.rosterView', 'grid');
    localStorage.setItem('heroesim.rosterOrder', 'potential:descending');
    localStorage.setItem('heroesim.rosterColumns', 'luck,,strength,Strength');
    localStorage.setItem('heroesim.rosterTab', 'skills');
    render_(started());

    const group = within(section('Roster')).getByRole('radiogroup', { name: 'Show the Roster as' });
    expect(within(group).getByRole('radio', { name: 'Tiles' }).getAttribute('aria-checked')).toBe('true');
    expect(cards()).toHaveLength(4);
    expect(sortBy().value).toBe('default');
    expect(direction().textContent).toBe('Default order');
    showAs('Table');
    expect(headings()).toEqual(['Name', ...heroColumns, ...physical.filter((name) => name !== 'Strength'), ...mental, ...magical, ...social]);

    // A sort the page knows, in a direction it does not.
    cleanup();
    localStorage.setItem('heroesim.rosterOrder', 'strength:sideways');
    render_(started());
    expect(sortBy().value).toBe('default');
    expect(direction().textContent).toBe('Default order');

    // On a phone, the unknown tab is the first.
    cleanup();
    const restore = asPhone();
    try {
      render_(started());
      const tabs = within(section('Roster')).getByRole('tablist', { name: 'Columns of the Table' });
      expect(within(tabs).getByRole('tab', { name: 'Hero' }).getAttribute('aria-selected')).toBe('true');
      expect(headings()).toEqual(['Name', ...heroColumns]);
    } finally {
      restore();
    }
  });
});

describe("the Roster's Table as the window crosses 600px (DL-169 item 7)", () => {
  test('shows its tabs when the window narrows to a phone, its Columns again when it widens, and stops listening when the Roster closes', () => {
    const listeners = new Set<() => void>();
    let narrow = false;
    const before = Object.getOwnPropertyDescriptor(globalThis, 'matchMedia');
    Object.defineProperty(globalThis, 'matchMedia', {
      configurable: true,
      value: (query: string) => ({
        get matches() {
          return query === '(max-width: 599px)' && narrow;
        },
        media: query,
        addEventListener: (_: string, listener: () => void) => listeners.add(listener),
        removeEventListener: (_: string, listener: () => void) => listeners.delete(listener),
      }),
    });
    const resize = (to: boolean): void =>
      act(() => {
        narrow = to;
        for (const listener of listeners) listener();
      });
    try {
      localStorage.setItem('heroesim.rosterView', 'table');
      render_(started());
      expect(within(section('Roster')).getByRole('button', { name: 'Columns' })).toBeDefined();
      expect(within(section('Roster')).queryByRole('tablist', { name: 'Columns of the Table' })).toBeNull();

      resize(true);
      expect(within(section('Roster')).queryByRole('button', { name: 'Columns' })).toBeNull();
      expect(within(section('Roster')).getByRole('tablist', { name: 'Columns of the Table' })).toBeDefined();
      expect(headings()).toEqual(['Name', ...heroColumns]);

      resize(false);
      expect(within(section('Roster')).getByRole('button', { name: 'Columns' })).toBeDefined();
      expect(headings()).toEqual(['Name', ...heroColumns, ...physical, ...mental, ...magical, ...social]);

      expect(listeners.size).toBeGreaterThan(0);
      cleanup();
      expect(listeners.size).toBe(0);
    } finally {
      if (before === undefined) Reflect.deleteProperty(globalThis, 'matchMedia');
      else Object.defineProperty(globalThis, 'matchMedia', before);
    }
  });
});
