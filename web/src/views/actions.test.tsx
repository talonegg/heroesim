import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, test } from 'vitest';
import { App } from '../app';
import { holding, holdingUnique, started, withOffer, withRichRivals, withWealth } from '../state/game.test-support';
import type { GameState } from '../state/reducer';
import { historyLines, inHistory, navButton, openDebugHistory, rosterList, section, sentenceOf } from './page.test-support';

// The plays part 2 adds, driven through the page's own controls (M7-S3 part 2, DL-73): the CLI's
// `buy`, `sell`, `build`, `recruit`, `equip`, `unequip`, `transfer --to`, `transfer --in`, `accept`
// and `decline`. Each play is the engine's; the page shows what changed, the History narrates it,
// new, on the player's Guild's (M9-S5), and a refusal is the engine's rejection as a sentence. Each
// region is found by opening its view first (M9-S3, DL-103).

afterEach(cleanup);

async function idle(): Promise<void> {
  await waitFor(() => expect(document.querySelector('main')?.getAttribute('aria-busy')).toBe('false'));
}

function wealth(): number {
  return Number(screen.getByTestId('wealth').textContent);
}

/** The refusal's sentence, without its Dismiss button. */
function refusal(): string {
  return within(screen.getByRole('alert')).getByText(/./, { selector: 'p' }).textContent ?? '';
}

/** The History, opened on the player's Guild, has the play's line, marked new (M9-S5, DL-105). */
function logSays(pattern: RegExp): void {
  expect(inHistory(pattern).classList.contains('is-new')).toBe(true);
}

/**
 * A purchase or a sale is not in the player's Guild's History (M9-F4, DL-111 item 4): its line is
 * read, new, in the whole History, the game menu's debug view.
 */
function debugSays(pattern: RegExp): void {
  expect(historyLines(section('History')).some((line) => pattern.test(sentenceOf(line)))).toBe(false);
  openDebugHistory();
  logSays(pattern);
}

function render_(state: GameState): void {
  render(<App initial={state} />);
}

/** A table's row by what its row heading names: an Item, a Hero (M9-S6's tables). */
function rowOf(scope: HTMLElement, name: string): HTMLElement {
  const row = within(scope).getByRole('rowheader', { name }).closest('tr');
  if (row === null) throw new Error(`no row for ${name}`);
  return row;
}

/** A row's cells after its heading, their words. */
function cells(row: HTMLElement): string[] {
  return within(row)
    .getAllByRole('cell')
    .map((cell) => cell.textContent ?? '');
}

describe('the Market', () => {
  test('buys what it has for sale at its price, and the Guild then holds it', async () => {
    render_(started());
    const jack = rowOf(section('Market'), 'Padded jack');
    // Kind, Effect, Price, Stock (M9-S6's table).
    const price = Number(cells(jack)[2]);
    const before = wealth();

    fireEvent.change(within(jack).getByLabelText('How many Padded jack'), { target: { value: '2' } });
    fireEvent.click(within(jack).getByRole('button', { name: 'Buy Padded jack' }));
    await idle();

    expect(wealth()).toBe(before - 2 * price);
    // Kind, Effect, Held, Sells for.
    expect(cells(rowOf(section('Sell'), 'Padded jack')).slice(0, 3)).toEqual(['Armour Gear', 'Constitution +1', '2']);
    debugSays(new RegExp(`^The Lantern bought 2 × Padded jack at the Market for ${2 * price} Wealth\\.$`));
  });

  test('sells from a stack the Guild holds for what the Market pays', async () => {
    render_(holding(started(), 'whetstone', 3));
    const sale = rowOf(section('Sell'), 'Whetstone');
    const each = Number(cells(sale)[3]);
    const before = wealth();

    fireEvent.change(within(sale).getByLabelText('How many Whetstone'), { target: { value: '2' } });
    fireEvent.click(within(sale).getByRole('button', { name: 'Sell Whetstone' }));
    await idle();

    expect(wealth()).toBe(before + 2 * each);
    expect(cells(rowOf(section('Sell'), 'Whetstone'))[2]).toBe('1');
  });

  test("sells a unique Item the Guild holds, one of its own with no quantity to choose (the CLI's `sell --item`, M9-S8)", async () => {
    const blade = "The Barrow King's blade";
    render_(holdingUnique(started(), 'barrow-kings-blade'));
    const sale = rowOf(section('Sell'), blade);
    // Kind, Effect, Held, Sells for.
    expect(cells(sale)[0]).toBe('Weapon Gear, Unique Item');
    expect(cells(sale)[2]).toBe('1');
    const each = Number(cells(sale)[3]);
    expect(each).toBeGreaterThan(0);
    expect(within(sale).queryByLabelText(`How many ${blade}`)).toBeNull();
    const before = wealth();

    fireEvent.click(within(sale).getByRole('button', { name: `Sell ${blade}` }));
    await idle();

    expect(wealth()).toBe(before + each);
    // The Guild holds nothing now: Sell says so, with no table (M9-F2).
    expect(within(section('Sell')).queryByRole('table')).toBeNull();
    debugSays(new RegExp(`^The Lantern sold ${blade} at the Market for ${each} Wealth\\.$`));
  });

  test("says why a purchase is refused, in the engine's terms", async () => {
    render_(withWealth(started(), 10));

    fireEvent.click(within(rowOf(section('Market'), 'Plate harness')).getByRole('button', { name: 'Buy Plate harness' }));
    await idle();

    expect(refusal()).toMatch(/^That costs \d+ Wealth; The Lantern has 10\./);
    expect(wealth()).toBe(10);
  });
});

describe('the Hall', () => {
  test("builds a facility's next grade for its cost, and then offers the one after", async () => {
    render_(started());
    const infirmary = (): HTMLElement =>
      within(section('Hall'))
        .getAllByTestId('facility')
        .find((row) => row.textContent?.startsWith('Infirmary') === true) as HTMLElement;
    const build = within(infirmary()).getByRole('button', { name: 'Build Sickroom for 200 Wealth' });
    // The cost on the button (M9-S6, the review's B9).
    expect(build.textContent).toBe('Build Sickroom · 200');
    const before = wealth();

    fireEvent.click(build);
    await idle();

    expect(wealth()).toBe(before - 200);
    expect(within(infirmary()).getByRole('img', { name: 'Grade 1 of 3' })).toBeDefined();
    expect(within(infirmary()).getByRole('button', { name: 'Build Infirmary ward for 500 Wealth' })).toBeDefined();
    logSays(/^The Lantern built Sickroom for 200 Wealth: its infirmary is now grade 1\.$/);
  });

  test('says why a grade cannot be built', async () => {
    render_(withWealth(started(), 50));

    fireEvent.click(within(section('Hall')).getByRole('button', { name: 'Build Dormitory for 200 Wealth' }));
    await idle();

    expect(refusal()).toBe("The next grade of The Lantern's quarters costs 200 Wealth; The Lantern has 50.");
  });
});

describe('the Unattached pool', () => {
  test('recruits a Hero for the signing fee shown, onto the Roster', async () => {
    render_(started());
    const pool = section('Unattached pool');
    const [row] = within(pool).getAllByTestId('pool-row');
    if (row === undefined) throw new Error('an empty pool');
    const name = within(row).getByRole('rowheader').textContent ?? '';
    const fee = Number(within(row).getByTestId('fee').textContent);
    const heroes = within(rosterList()).getAllByRole('button').length;
    const before = wealth();

    fireEvent.click(within(row).getByRole('button', { name: `Recruit ${name}` }));
    await idle();

    expect(wealth()).toBe(before - fee);
    expect(within(rosterList()).getAllByRole('button')).toHaveLength(heroes + 1);
    expect(within(rosterList()).getByRole('button', { name })).toBeDefined();
    expect(within(section('Unattached pool')).queryByRole('button', { name })).toBeNull();
    logSays(new RegExp(`^The Lantern signed ${name} for ${fee} Wealth\\.$`));
  });

  test('says why a Hero will not sign, and recruits from their page too', async () => {
    render_(withWealth(started(), 0));
    const pool = section('Unattached pool');
    const [name] = within(pool)
      .getAllByRole('button')
      .filter((button) => button.className === 'link')
      .map((button) => button.textContent ?? '');
    if (name === undefined) throw new Error('an empty pool');

    fireEvent.click(within(pool).getByRole('button', { name }));
    const page = within(section('Unattached pool')).getByRole('article');
    expect(within(page).getByText(/^Signing fee \d+ Wealth\. Signs for your Guild: yes\.$/)).toBeDefined();
    fireEvent.click(within(page).getByRole('button', { name: `Recruit ${name}` }));
    await idle();

    expect(refusal()).toMatch(/^The signing fee is \d+ Wealth; The Lantern has 0\.$/);
  });
});

describe("a Hero's page on the player's Roster", () => {
  function openFirstHero(): { name: string; page: () => HTMLElement } {
    const [first] = within(rosterList()).getAllByRole('button');
    const name = first?.textContent ?? '';
    if (first === undefined) throw new Error('an empty Roster');
    fireEvent.click(first);
    return { name, page: () => within(section('Roster')).getByRole('article') };
  }

  test('equips gear the Guild holds, and unequips it', async () => {
    render_(holding(started(), 'arming-sword', 1));
    const { name, page } = openFirstHero();
    /** The Hero's weapon slot, as their gear lists it (M9-S6). */
    const weapon = (): HTMLElement =>
      within(within(page()).getByRole('list', { name: `${name}'s Gear` }))
        .getAllByRole('listitem')
        .find((item) => item.textContent?.startsWith('Weapon') === true) as HTMLElement;
    expect(within(weapon()).getByText('None')).toBeDefined();

    fireEvent.click(within(page()).getByRole('button', { name: 'Equip Arming sword' }));
    await idle();

    expect(within(weapon()).getByText('Arming sword')).toBeDefined();
    expect(within(weapon()).getByText('Weaponry +2, Strength +1')).toBeDefined();
    expect(within(page()).getByText('The Guild holds no Gear; the Market sells it.')).toBeDefined();
    // Read beside the page, in the History rail, as the page stays open (M9-S3).
    const rail = screen.getByRole('complementary', { name: 'Latest for The Lantern' });
    expect(within(rail).getByText(new RegExp(`^The Lantern put Arming sword in ${name}'s weapon slot\\.$`))).toBeDefined();

    fireEvent.click(within(page()).getByRole('button', { name: 'Unequip Arming sword' }));
    await idle();

    expect(within(weapon()).getByText('None')).toBeDefined();
    expect(within(page()).getByRole('button', { name: 'Equip Arming sword' })).toBeDefined();
    logSays(new RegExp(`^The Lantern took Arming sword from ${name}'s weapon slot\\.$`));
  });

  test("equips a unique Item the Guild holds, and unequips it back to the Guild (the CLI's `equip --item`, M9-S8)", async () => {
    const blade = "The Barrow King's blade";
    render_(holdingUnique(started(), 'barrow-kings-blade'));
    const { name, page } = openFirstHero();
    const weapon = (): HTMLElement =>
      within(within(page()).getByRole('list', { name: `${name}'s Gear` }))
        .getAllByRole('listitem')
        .find((item) => item.textContent?.startsWith('Weapon') === true) as HTMLElement;
    expect(within(weapon()).getByText('None')).toBeDefined();

    fireEvent.click(within(page()).getByRole('button', { name: `Equip ${blade}` }));
    await idle();

    expect(within(weapon()).getByText(blade)).toBeDefined();
    expect(within(page()).getByText('The Guild holds no Gear; the Market sells it.')).toBeDefined();

    fireEvent.click(within(page()).getByRole('button', { name: `Unequip ${blade}` }));
    await idle();

    expect(within(weapon()).getByText('None')).toBeDefined();
    expect(within(page()).getByRole('button', { name: `Equip ${blade}` })).toBeDefined();
    // Both plays read in the History, new (the last play's line marked so).
    expect(inHistory(new RegExp(`^The Lantern put ${blade} in ${name}'s weapon slot\\.$`))).toBeDefined();
    logSays(new RegExp(`^The Lantern took ${blade} from ${name}'s weapon slot\\.$`));
  });

  test('transfers the Hero to the Guild chosen, for the fee it would pay, once asked and confirmed', async () => {
    render_(withRichRivals(started()));
    const { name, page } = openFirstHero();
    // "Transfer…" asks first, stating the fee and what it costs (M9-S6, the review's E4).
    fireEvent.click(within(page()).getByRole('button', { name: `Transfer ${name}…` }));
    const ask = within(page()).getByRole('group', { name: `Transfer ${name}?` });
    const select = within(ask).getByLabelText(`Transfer ${name} to`) as HTMLSelectElement;
    const option = select.options[0];
    const [, guildName, fee] = /^(.+), for (\d+) Wealth$/.exec(option?.textContent ?? '') ?? [];
    expect(
      within(ask).getByText(
        `${guildName} would pay ${fee} Wealth for ${name}, if it is willing to take them. Their Gear stays with your Guild, and the ` +
          'Heroes left behind who held them in high Regard lose Morale.',
      ),
    ).toBeDefined();
    const before = wealth();

    fireEvent.click(within(ask).getByRole('button', { name: `Transfer ${name} to ${guildName}` }));
    await idle();

    expect(wealth()).toBe(before + Number(fee));
    fireEvent.click(within(page()).getByRole('button', { name: 'Back to the Roster' }));
    expect(within(rosterList()).queryByRole('button', { name })).toBeNull();
    logSays(new RegExp(`^${guildName} took ${name} from The Lantern for ${fee} Wealth\\.$`));
  });

  test('says why a Guild will not take the Hero', async () => {
    render_(started());
    const { name, page } = openFirstHero();

    fireEvent.click(within(page()).getByRole('button', { name: `Transfer ${name}…` }));
    fireEvent.click(within(page()).getByRole('button', { name: `Transfer ${name} to The Ashford Guild` }));
    await idle();

    expect(refusal()).toBe(`The Ashford Guild will not take ${name}: it is not rich enough to hire now.`);
  });
});

describe("another Guild's Roster", () => {
  test('takes a Hero in for the Transfer fee shown', async () => {
    render_(started());
    fireEvent.click(within(section('Guilds')).getByRole('button', { name: 'Open The Ashford Guild' }));
    const page = within(section('Guilds')).getByRole('article');
    const [row] = within(page).getAllByTestId('guild-hero');
    if (row === undefined) throw new Error('an empty Roster');
    const name = within(row).getByRole('rowheader').textContent ?? '';
    const fee = Number(within(row).getByTestId('fee').textContent);
    const before = wealth();

    fireEvent.click(within(row).getByRole('button', { name: `Take ${name} in` }));
    await idle();

    expect(wealth()).toBe(before - fee);
    expect(within(rosterList()).getByRole('button', { name })).toBeDefined();
    logSays(new RegExp(`^The Lantern took ${name} from The Ashford Guild for ${fee} Wealth\\.$`));
  });

  test("offers the same from a Rival Hero's page, and says why a Guild will not part with them", async () => {
    render_(started());
    fireEvent.click(within(section('Guilds')).getByRole('button', { name: 'Open The Old Weir Guild' }));
    const [heroButton] = within(section('Guilds')).getAllByRole('button').filter((button) => button.className === 'link');
    const name = heroButton?.textContent ?? '';
    if (heroButton === undefined) throw new Error('an empty Roster');
    fireEvent.click(heroButton);
    const page = within(section('Guilds')).getByRole('article');
    expect(within(page).getByText(new RegExp(`^Your Guild would pay The Old Weir Guild a Transfer fee of \\d+ Wealth to take ${name} in`))).toBeDefined();

    fireEvent.click(within(page).getByRole('button', { name: `Take ${name} in` }));
    await idle();

    expect(refusal()).toMatch(new RegExp(`^The Old Weir Guild will not part with ${name}: its Roster of \\d+ is too small`));
    expect(within(section('Guilds')).getByRole('button', { name: 'Back to The Old Weir Guild' })).toBeDefined();
  });
});

describe('Transfer Offers', () => {
  test('are not drawn while none stands, and the Roster in the navigation carries no dot, until a Rival makes one (M9-S3)', () => {
    const { unmount } = render(<App initial={started()} />);
    section('Roster');
    expect(screen.queryByRole('region', { name: 'Transfer Offers' })).toBeNull();
    expect(navButton('Roster').textContent).toBe('Roster');
    unmount();

    render_(withOffer(started()));
    expect(within(section('Transfer Offers')).getAllByRole('listitem')).toHaveLength(1);
    expect(navButton('Roster').textContent).toBe('Roster, a Transfer Offer waits');
  });

  test('accepts an offer, once asked and confirmed: the Hero goes to the Guild that made it, for its fee', async () => {
    render_(withOffer(started()));
    const offers = section('Transfer Offers');
    const sentence = within(offers).getByText(/ offers \d+ Wealth for .+, until the night of Day \d+\.$/).textContent ?? '';
    const [, guildName = '', fee = '', name = ''] = /^(.+) offers (\d+) Wealth for (.+), until/.exec(sentence) ?? [];
    // Accept asks first, stating the fee and what letting the Hero go costs (M9-S6, the review's E4).
    fireEvent.click(within(offers).getByRole('button', { name: `Accept ${guildName}'s Offer for ${name}…` }));
    const ask = within(offers).getByRole('group', { name: `Accept ${guildName}'s Offer for ${name}?` });
    expect(within(ask).getByText(new RegExp(`^Accepting sends ${name} to ${guildName} for ${fee} Wealth\\. Their Gear stays with your Guild`))).toBeDefined();
    const before = wealth();

    fireEvent.click(within(ask).getByRole('button', { name: `Accept ${guildName}'s Offer for ${name}` }));
    await idle();

    expect(wealth()).toBe(before + Number(fee));
    expect(within(rosterList()).queryByRole('button', { name })).toBeNull();
    expect(screen.queryByRole('region', { name: 'Transfer Offers' })).toBeNull();
    logSays(new RegExp(`^${guildName} took ${name} from The Lantern for ${fee} Wealth, accepting its Transfer Offer\\.$`));
  });

  test('declines an offer: the Hero stays', async () => {
    render_(withOffer(started()));
    const offers = section('Transfer Offers');
    const [, guildName = '', name = ''] = /^(.+) offers \d+ Wealth for (.+), until/.exec(within(offers).getAllByRole('listitem')[0]?.textContent ?? '') ?? [];

    fireEvent.click(within(offers).getByRole('button', { name: `Decline ${guildName}'s Offer for ${name}` }));
    await idle();

    expect(within(rosterList()).getByRole('button', { name })).toBeDefined();
    expect(screen.queryByRole('region', { name: 'Transfer Offers' })).toBeNull();
    logSays(new RegExp(`^The Lantern declined ${guildName}'s Offer for ${name}\\.$`));
  });
});
