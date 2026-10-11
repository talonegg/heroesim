import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, test } from 'vitest';
import { changed, holding, holdingUnique, started, withOffer, withRichRivals, withWealth } from '../state/game.test-support';
import { historyLines, idle, inHistory, openDebugHistory, openFirstHero, renderGame, rosterList, section, sentenceOf, wealth } from './page.test-support';

// The plays part 2 adds, driven through the page's own controls (DL-73): the CLI's
// `buy`, `sell`, `build`, `recruit`, `equip`, `unequip`, `transfer --to`, `transfer --in`, `accept`
// and `decline`. Each play is the engine's; the page shows what changed, the History narrates it,
// new, on the player's Guild's, and a refusal is the engine's rejection as a sentence. Each
// region is found by opening its view first (DL-103).

afterEach(cleanup);

/** The refusal's sentence, without its Dismiss button. */
function refusal(): string {
  return within(screen.getByRole('alert')).getByText(/./, { selector: 'p' }).textContent ?? '';
}

/** The History, opened on the player's Guild, has the play's line, marked new (DL-105). */
function logSays(pattern: RegExp): void {
  expect(inHistory(pattern).classList.contains('is-new')).toBe(true);
}

/**
 * A purchase or a sale is not in the player's Guild's History (DL-111 item 4): its line is
 * read, new, in the whole History, the game menu's debug view.
 */
function debugSays(pattern: RegExp): void {
  expect(historyLines(section('History')).some((line) => pattern.test(sentenceOf(line)))).toBe(false);
  openDebugHistory();
  logSays(pattern);
}

/** A table's row by what its row heading names: an Item, a Hero. */
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
    renderGame(started());
    const sword = rowOf(section('Market'), 'Short sword');
    // Kind, Effect, Price, Stock.
    const price = Number(cells(sword)[2]);
    const before = wealth();

    fireEvent.change(within(sword).getByLabelText('How many Short sword'), { target: { value: '2' } });
    fireEvent.click(within(sword).getByRole('button', { name: 'Buy Short sword' }));
    await idle();

    expect(wealth()).toBe(before - 2 * price);
    // Kind, Effect, Held, Sells for.
    expect(cells(rowOf(section('Sell'), 'Short sword')).slice(0, 3)).toEqual(['Weapon Gear', 'Weaponry +1', '2']);
    debugSays(new RegExp(`^The Lantern bought 2 × Short sword at the Market for ${2 * price} Wealth\\.$`));
  });

  test('sells from a stack the Guild holds for what the Market pays', async () => {
    renderGame(holding(started(), 'whetstone', 3));
    const sale = rowOf(section('Sell'), 'Whetstone');
    const each = Number(cells(sale)[3]);
    const before = wealth();

    fireEvent.change(within(sale).getByLabelText('How many Whetstone'), { target: { value: '2' } });
    fireEvent.click(within(sale).getByRole('button', { name: 'Sell Whetstone' }));
    await idle();

    expect(wealth()).toBe(before + 2 * each);
    expect(cells(rowOf(section('Sell'), 'Whetstone'))[2]).toBe('1');
  });

  test("sells a unique Item the Guild holds, one of its own with no quantity to choose (the CLI's `sell --item`)", async () => {
    const blade = "The Barrow King's blade";
    renderGame(holdingUnique(started(), 'barrow-kings-blade'));
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
    // The Guild holds nothing now: Sell says so, with no table.
    expect(within(section('Sell')).queryByRole('table')).toBeNull();
    debugSays(new RegExp(`^The Lantern sold ${blade} at the Market for ${each} Wealth\\.$`));
  });

  test("says why a purchase is refused, in the engine's terms", async () => {
    renderGame(withWealth(started(), 10));

    fireEvent.click(within(rowOf(section('Market'), 'Plate harness')).getByRole('button', { name: 'Buy Plate harness' }));
    await idle();

    expect(refusal()).toMatch(/^That costs \d+ Wealth; The Lantern has 10\./);
    expect(wealth()).toBe(10);
  });
});

describe('the Hall', () => {
  test("builds a facility's next grade for its cost, and then offers the one after", async () => {
    renderGame(started());
    const infirmary = (): HTMLElement =>
      within(section('Hall'))
        .getAllByTestId('facility')
        .find((row) => row.textContent?.startsWith('Infirmary') === true) as HTMLElement;
    const build = within(infirmary()).getByRole('button', { name: 'Build Sickroom for 200 Wealth' });
    // The cost on the button (the review's B9).
    expect(build.textContent).toBe('Build Sickroom · 200');
    const before = wealth();

    fireEvent.click(build);
    await idle();

    expect(wealth()).toBe(before - 200);
    expect(within(infirmary()).getByRole('img', { name: 'Grade 1 of 3' })).toBeDefined();
    expect(within(infirmary()).getByRole('button', { name: 'Build Infirmary ward for 500 Wealth' })).toBeDefined();
    logSays(/^The Lantern built Sickroom for 200 Wealth: its infirmary is now grade 1\.$/);
  });
});

describe('the Unattached pool', () => {
  test('recruits a Hero for the signing fee shown, onto the Roster', async () => {
    renderGame(started());
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
    renderGame(withWealth(started(), 0));
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
  test('equips gear the Guild holds, and unequips it', async () => {
    const game = holding(started(), 'arming-sword', 1);
    renderGame(game);
    const { name, page } = openFirstHero(game);
    /** The Hero's weapon slot, as their gear lists it. */
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
    // Read beside the page, in the History rail, as the page stays open.
    const rail = screen.getByRole('complementary', { name: 'Latest for The Lantern' });
    expect(within(rail).getByText(new RegExp(`^The Lantern put Arming sword in ${name}'s weapon slot\\.$`))).toBeDefined();

    fireEvent.click(within(page()).getByRole('button', { name: 'Unequip Arming sword' }));
    await idle();

    expect(within(weapon()).getByText('None')).toBeDefined();
    expect(within(page()).getByRole('button', { name: 'Equip Arming sword' })).toBeDefined();
    logSays(new RegExp(`^The Lantern took Arming sword from ${name}'s weapon slot\\.$`));
  });

  test("equips a unique Item the Guild holds, and unequips it back to the Guild (the CLI's `equip --item`)", async () => {
    const blade = "The Barrow King's blade";
    const game = holdingUnique(started(), 'barrow-kings-blade');
    renderGame(game);
    const { name, page } = openFirstHero(game);
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
    const game = withRichRivals(started());
    renderGame(game);
    const { name, page } = openFirstHero(game);
    // "Transfer…" asks first, stating the fee and what it costs (the review's E4).
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
    const game = started();
    renderGame(game);
    const { name, page } = openFirstHero(game);

    fireEvent.click(within(page()).getByRole('button', { name: `Transfer ${name}…` }));
    fireEvent.click(within(page()).getByRole('button', { name: `Transfer ${name} to The Ashford Guild` }));
    await idle();

    expect(refusal()).toBe(`The Ashford Guild will not take ${name}: it is not rich enough to hire now.`);
  });
});

describe("another Guild's Roster", () => {
  test('takes a Hero in for the Transfer fee shown', async () => {
    renderGame(started());
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
    renderGame(started());
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
  test('accepts an offer, once asked and confirmed: the Hero goes to the Guild that made it, for its fee', async () => {
    renderGame(withOffer(started()));
    const offers = section('Transfer Offers');
    const sentence = within(offers).getByText(/ offers \d+ Wealth for .+, until the night of Year \d+ Day \d+\.$/).textContent ?? '';
    const [, guildName = '', fee = '', name = ''] = /^(.+) offers (\d+) Wealth for (.+), until/.exec(sentence) ?? [];
    // Accept asks first, stating the fee and what letting the Hero go costs (the review's E4).
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
    renderGame(withOffer(started()));
    const offers = section('Transfer Offers');
    const [, guildName = '', name = ''] = /^(.+) offers \d+ Wealth for (.+), until/.exec(within(offers).getAllByRole('listitem')[0]?.textContent ?? '') ?? [];

    fireEvent.click(within(offers).getByRole('button', { name: `Decline ${guildName}'s Offer for ${name}` }));
    await idle();

    expect(within(rosterList()).getByRole('button', { name })).toBeDefined();
    expect(screen.queryByRole('region', { name: 'Transfer Offers' })).toBeNull();
    logSays(new RegExp(`^The Lantern declined ${guildName}'s Offer for ${name}\\.$`));
  });
});

// DL-289 (the design's part 11; DL-287): the Captain is named from a Hero's page, `nameCaptain` through the
// page's own control, the engine's refusal said in its words.
describe('the Captain', () => {
  const holds = (page: HTMLElement, name: string): HTMLElement => within(within(page).getByRole('list', { name: `${name}'s State` })).getByText('Captain');

  test('is named from a Hero’s page, free to an empty post: the page says so, the post is theirs, the History records it', async () => {
    const game = started();
    renderGame(game);
    const { name, page } = openFirstHero(game);
    expect(within(page()).getByRole('heading', { name: 'Captain' })).toBeDefined();
    expect(within(page()).getByText(`Naming ${name} Captain is free: the post is empty.`)).toBeDefined();
    expect(within(within(page()).getByRole('list', { name: `${name}'s State` })).queryByText('Captain')).toBeNull();

    fireEvent.click(within(page()).getByRole('button', { name: `Name ${name} Captain` }));
    await idle();

    expect(within(page()).getByText(`${name} is The Lantern's Captain.`)).toBeDefined();
    expect(within(page()).queryByRole('button', { name: `Name ${name} Captain` })).toBeNull();
    expect(holds(page(), name).closest('.chip')?.querySelector('svg')).not.toBeNull();
    logSays(new RegExp(`^The Lantern named ${name} its Captain\\.$`));
  });

  test('in another’s place says what it costs and locks, then the post stays locked in the refusal’s words, and the one replaced is no Captain', async () => {
    let other = '';
    let cost = 0;
    let days = 0;
    const game = changed(started(), (document, player) => {
      cost = -document.meta.config.captainChangeMoraleCost;
      days = document.meta.config.captainChangeLockDays;
      player.captainId = player.rosterIds[1] ?? null;
      other = document.world.heroes[player.rosterIds[1] as never]?.name ?? '';
    });
    renderGame(game);
    const { name, page } = openFirstHero(game);
    expect(
      within(page()).getByText(
        `Naming ${name} Captain in place of ${other} costs ${other} ${cost} Morale and locks the post for ${days} Days.`,
      ),
    ).toBeDefined();

    fireEvent.click(within(page()).getByRole('button', { name: `Name ${name} Captain` }));
    await idle();

    expect(within(page()).getByText(`${name} is The Lantern's Captain.`)).toBeDefined();
    // The one replaced: no Captain now, and the post is locked, said as the engine refuses it.
    fireEvent.click(within(page()).getByRole('button', { name: 'Back to the Roster' }));
    fireEvent.click(within(rosterList()).getByRole('button', { name: other }));
    const locked = within(section('Roster')).getByRole('article');
    const button = within(locked).getByRole('button', { name: `Name ${other} Captain` });
    expect(button.hasAttribute('disabled')).toBe(true);
    const lockWords = within(locked).getByText(new RegExp(`^${name} was named Captain on Year 1 Day \\d+, and the post cannot change again before Year 1 Day \\d+\\.$`));
    // The disabled button carries its reason, so a screen reader that reaches it hears why (DL-289's verification).
    expect(button.getAttribute('aria-describedby')).toBe(lockWords.id);
    expect(lockWords.id).not.toBe('');
    expect(within(within(locked).getByRole('list', { name: `${other}'s State` })).queryByText('Captain')).toBeNull();
    logSays(new RegExp(`^The Lantern named ${name} its Captain in place of ${other}; the post cannot change again before Year 1 Day \\d+\\.$`));
  });
});
