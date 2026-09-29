import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, test } from 'vitest';
import { App } from '../app';
import { changed, holding, started, withOffer, withPartyOut, withRichRivals } from '../state/game.test-support';
import type { GameState } from '../state/reducer';
import { rosterList, section } from './page.test-support';

// The Roster redesigned (M9-S6, DL-106; the review's B7, B8 and E4): compact Hero cards, a Hero's
// page as a line and chips with the Stats in four blocks, the Unattached pool as rows ordered by its
// headings, and a confirmation before a Transfer out or an offer accepted lets a Hero go. Every
// value comes from a selector (`rosterView`, `heroPage`, `poolView`, `offersView`).

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

/** Opens the first Hero on the Roster, and gives their name and page. */
function openFirstHero(): { name: string; page: () => HTMLElement } {
  const [first] = within(rosterList()).getAllByRole('button');
  if (first === undefined) throw new Error('an empty Roster');
  const name = first.textContent ?? '';
  fireEvent.click(first);
  return { name, page: () => within(section('Roster')).getByRole('article') };
}

describe("the Roster's Hero cards (M9-S6)", () => {
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
    const injured = all.find((card) => card.textContent?.includes('injured, healing on the night of Day 6') === true) as HTMLElement;
    expect(chip(injured, 'injured, healing on the night of Day 6').className).toBe('chip chip--warn');
    expect(chip(injured, 'Morale 12, wretched').className).toBe('chip chip--bad');
    const away = all.filter((card) => /away with a Party, back on the night of Day \d+/.test(card.textContent ?? ''));
    expect(away.length).toBeGreaterThan(0);
    for (const card of away) expect(chip(card, /^away with a Party/).querySelector('svg')).not.toBeNull();
    expect(all.some((card) => within(card).queryByText('at the Hall') !== null)).toBe(true);
  });
});

describe("a Hero's page (M9-S6, the review's B7)", () => {
  test('is a line and chips, the Stats in four area blocks each with its Outlook as a chip, and what gear lifts in the accent', async () => {
    render_(holding(started(), 'arming-sword', 1));
    const { name, page } = openFirstHero();
    // The keyboard is on their name.
    expect(document.activeElement).toBe(within(page()).getByRole('heading', { level: 3, name }));
    expect(within(page()).getByText(/^(Warrior|Rogue|Mage|Healer) · Level \d+ · Age \d+ · (Female|Male) · .+ · of The Lantern$/)).toBeDefined();
    const state = within(page()).getByRole('list', { name: `${name}'s State` });
    expect(within(state).getByText(/^Morale \d+, (wretched|low|steady|high|elated)$/)).toBeDefined();
    expect(within(state).getByText('at the Hall')).toBeDefined();
    expect(within(state).getByText(/^XP \d+$/)).toBeDefined();
    // No longer eleven label and value rows.
    expect(within(page()).queryByRole('term')).toBeNull();

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

  test('shows the Relationships as bands, a ramp of tones, and folds those neutral both ways under their count', () => {
    const state = changed(started(), (document, player) => {
      const [first, second] = player.rosterIds;
      const hero = first === undefined ? undefined : document.world.heroes[first];
      if (hero === undefined || second === undefined) throw new Error('two Heroes wanted');
      hero.regard[second] = { value: 8, since: 0, reason: 'test' };
    });
    render_(state);
    const heroes = cards().length;
    const { name, page } = openFirstHero();

    const shown = within(page()).getByRole('list', { name: `${name}'s Relationships` });
    expect(within(shown).getAllByRole('listitem')).toHaveLength(1);
    expect(chip(shown, 'Regard warm').className).toBe('chip chip--good');
    expect(within(page()).getByText(/^\d+ neutral$/).textContent).toBe(`${heroes - 2} neutral`);
    expect(within(page()).getByRole('list', { name: `${name}'s Relationships, neutral` }).children).toHaveLength(heroes - 2);
  });

  test('a Transfer out asks first, with the fee and what it costs; "Keep them" leaves the Hero where they are', () => {
    render_(withRichRivals(started()));
    const { name, page } = openFirstHero();
    const before = wealth();
    const opener = within(page()).getByRole('button', { name: `Transfer ${name}…` });
    expect(within(page()).queryByLabelText(`Transfer ${name} to`)).toBeNull();

    fireEvent.click(opener);

    const ask = within(page()).getByRole('group', { name: `Transfer ${name}?` });
    expect(document.activeElement).toBe(ask);
    expect(within(ask).getByText(/ would pay \d+ Wealth for .+, if it is willing to take them\. Their gear stays with your Guild, and the Heroes left behind who held them in high Regard lose Morale\.$/)).toBeDefined();
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

describe('Transfer Offers (M9-S6, the review’s E4)', () => {
  test('Accept asks first, with the fee and what letting the Hero go costs; "Keep them" leaves the offer standing', () => {
    render_(withOffer(started()));
    const offers = section('Transfer Offers');
    const accept = within(offers).getByRole('button', { name: /^Accept .+'s offer for .+…$/ });
    const [, whose = ''] = /^Accept (.+)…$/.exec(accept.getAttribute('aria-label') ?? '') ?? [];
    const before = wealth();

    fireEvent.click(accept);

    const ask = within(offers).getByRole('group', { name: `Accept ${whose}?` });
    expect(document.activeElement).toBe(ask);
    expect(within(ask).getByText(/^Accepting sends .+ to .+ for \d+ Wealth\. Their gear stays with your Guild, and the Heroes left behind who held them in high Regard lose Morale\.$/)).toBeDefined();
    expect(within(ask).getByRole('button', { name: `Accept ${whose}` }).textContent).toBe('Accept the offer');

    fireEvent.click(within(ask).getByRole('button', { name: 'Keep them' }));

    expect(within(section('Transfer Offers')).getAllByRole('listitem')).toHaveLength(1);
    expect(document.activeElement).toBe(within(section('Transfer Offers')).getByRole('button', { name: `Accept ${whose}…` }));
    expect(wealth()).toBe(before);
  });
});

describe("the Unattached pool as rows (M9-S6, the review's B8)", () => {
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
      expect(signs).toMatch(/^(yes|needs Fame \d+)$/);
      expect(row.className).toBe(signs === 'yes' ? '' : 'is-set-back');
      const recruit = within(row).getByRole('button', { name: `Recruit ${name}` }) as HTMLButtonElement;
      expect(recruit.textContent).toBe('Recruit');
      // DL-109 item 2, Q17: the engine's `signingRefusal`, as the row says it, disables Recruit, and
      // the row's reason describes it.
      expect(recruit.disabled, name).toBe(signs !== 'yes');
      const reason = recruit.getAttribute('aria-describedby');
      expect(reason === null ? null : document.getElementById(reason)?.textContent).toBe(signs === 'yes' ? null : signs);
    }
    expect(all.filter(({ cells }) => cells[5] !== 'yes').length).toBeGreaterThan(0);
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
    expect(byClass).toEqual([...byClass].sort());

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
