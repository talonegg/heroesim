import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, test } from 'vitest';
import { App } from '../app';
import { holding, started, withOffer, withRichRivals, withWealth } from '../state/game.test-support';
import type { GameState } from '../state/reducer';

// The plays part 2 adds, driven through the page's own controls (M7-S3 part 2, DL-73): the CLI's
// `buy`, `sell`, `build`, `recruit`, `equip`, `unequip`, `transfer --to`, `transfer --in`, `accept`
// and `decline`. Each play is the engine's; the page shows what changed, the log narrates it, and a
// refusal is the engine's rejection as a sentence.

afterEach(cleanup);

async function idle(): Promise<void> {
  await waitFor(() => expect(document.querySelector('main')?.getAttribute('aria-busy')).toBe('false'));
}

function section(name: string): HTMLElement {
  return screen.getByRole('region', { name });
}

function wealth(): number {
  return Number(screen.getByTestId('wealth').textContent);
}

/** The refusal's sentence, without its Dismiss button. */
function refusal(): string {
  return within(screen.getByRole('alert')).getByText(/./, { selector: 'p' }).textContent ?? '';
}

function logSays(pattern: RegExp): void {
  expect(within(section('Since your last action')).getByText(pattern)).toBeDefined();
}

function render_(state: GameState): void {
  render(<App initial={state} />);
}

describe('the Market', () => {
  test('buys what it has for sale at its price, and the Guild then holds it', async () => {
    render_(started());
    const market = section('Market');
    const jack = within(market).getByRole('form', { name: 'Buy Padded jack' });
    const price = Number(/at (\d+) Wealth each/.exec(jack.textContent ?? '')?.[1]);
    const before = wealth();

    fireEvent.change(within(jack).getByLabelText('How many'), { target: { value: '2' } });
    fireEvent.click(within(jack).getByRole('button', { name: 'Buy' }));
    await idle();

    expect(wealth()).toBe(before - 2 * price);
    expect(within(section('Market')).getByRole('form', { name: 'Sell Padded jack' }).textContent).toMatch(/^Padded jack: 2 held; each sells for \d+ Wealth\./);
    logSays(new RegExp(`^The Lantern bought 2 × Padded jack at the Market for ${2 * price} Wealth\\.$`));
  });

  test('sells from a stack the Guild holds for what the Market pays', async () => {
    render_(holding(started(), 'whetstone', 3));
    const sale = within(section('Market')).getByRole('form', { name: 'Sell Whetstone' });
    const each = Number(/each sells for (\d+) Wealth/.exec(sale.textContent ?? '')?.[1]);
    const before = wealth();

    fireEvent.change(within(sale).getByLabelText('How many'), { target: { value: '2' } });
    fireEvent.click(within(sale).getByRole('button', { name: 'Sell' }));
    await idle();

    expect(wealth()).toBe(before + 2 * each);
    expect(within(section('Market')).getByRole('form', { name: 'Sell Whetstone' }).textContent).toMatch(/^Whetstone: 1 held;/);
  });

  test("says why a purchase is refused, in the engine's terms", async () => {
    render_(withWealth(started(), 10));
    const plate = within(section('Market')).getByRole('form', { name: 'Buy Plate harness' });

    fireEvent.click(within(plate).getByRole('button', { name: 'Buy' }));
    await idle();

    expect(refusal()).toMatch(/^That costs \d+ Wealth; The Lantern has 10\./);
    expect(wealth()).toBe(10);
  });
});

describe('the Hall', () => {
  test("builds a facility's next grade for its cost, and then offers the one after", async () => {
    render_(started());
    const hall = section('Hall');
    const build = within(hall).getByRole('button', { name: 'Build Sickroom' });
    expect(within(hall).getByText('Next grade: Sickroom, 200 Wealth.')).toBeDefined();
    const before = wealth();

    fireEvent.click(build);
    await idle();

    expect(wealth()).toBe(before - 200);
    expect(within(section('Hall')).getByRole('heading', { name: 'Infirmary: grade 1' })).toBeDefined();
    expect(within(section('Hall')).getByRole('button', { name: 'Build Infirmary ward' })).toBeDefined();
    logSays(/^The Lantern built Sickroom for 200 Wealth: its infirmary is now grade 1\.$/);
  });

  test('says why a grade cannot be built', async () => {
    render_(withWealth(started(), 50));

    fireEvent.click(within(section('Hall')).getByRole('button', { name: 'Build Dormitory' }));
    await idle();

    expect(refusal()).toBe("The next grade of The Lantern's quarters costs 200 Wealth; The Lantern has 50.");
  });
});

describe('the Unattached pool', () => {
  test('recruits a Hero for the signing fee shown, onto the Roster', async () => {
    render_(started());
    const pool = section('Unattached pool');
    const [card] = within(pool).getAllByRole('listitem');
    if (card === undefined) throw new Error('an empty pool');
    const name = within(card).getByRole('button', { name: /^(?!Recruit)/ }).textContent ?? '';
    const fee = Number(/Signing fee (\d+) Wealth/.exec(card.textContent ?? '')?.[1]);
    const heroes = within(section('Roster')).getAllByRole('button').length;
    const before = wealth();

    fireEvent.click(within(card).getByRole('button', { name: `Recruit ${name}` }));
    await idle();

    expect(wealth()).toBe(before - fee);
    expect(within(section('Roster')).getAllByRole('button')).toHaveLength(heroes + 1);
    expect(within(section('Roster')).getByRole('button', { name })).toBeDefined();
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
    const roster = section('Roster');
    const [first] = within(roster).getAllByRole('button');
    const name = first?.textContent ?? '';
    if (first === undefined) throw new Error('an empty Roster');
    fireEvent.click(first);
    return { name, page: () => within(section('Roster')).getByRole('article') };
  }

  test('equips gear the Guild holds, and unequips it', async () => {
    render_(holding(started(), 'arming-sword', 1));
    const { name, page } = openFirstHero();
    expect(within(page()).getByText('Weapon: none')).toBeDefined();

    fireEvent.click(within(page()).getByRole('button', { name: 'Equip Arming sword' }));
    await idle();

    expect(within(page()).getByText('Weapon: Arming sword (Weaponry +2, Strength +1)')).toBeDefined();
    expect(within(page()).getByText('The Guild holds no gear; the Market sells it.')).toBeDefined();
    logSays(new RegExp(`^The Lantern put Arming sword in ${name}'s weapon slot\\.$`));

    fireEvent.click(within(page()).getByRole('button', { name: 'Unequip Arming sword' }));
    await idle();

    expect(within(page()).getByText('Weapon: none')).toBeDefined();
    expect(within(page()).getByRole('button', { name: 'Equip Arming sword' })).toBeDefined();
  });

  test('transfers the Hero to the Guild chosen, for the fee it would pay', async () => {
    render_(withRichRivals(started()));
    const { name, page } = openFirstHero();
    const select = within(page()).getByLabelText(`Transfer ${name} to`) as HTMLSelectElement;
    const option = select.options[0];
    const [, guildName, fee] = /^(.+), for (\d+) Wealth$/.exec(option?.textContent ?? '') ?? [];
    const before = wealth();

    fireEvent.click(within(page()).getByRole('button', { name: `Transfer ${name} to ${guildName}` }));
    await idle();

    expect(wealth()).toBe(before + Number(fee));
    logSays(new RegExp(`^${guildName} took ${name} from The Lantern for ${fee} Wealth\\.$`));
    fireEvent.click(within(page()).getByRole('button', { name: 'Back to the Roster' }));
    expect(within(section('Roster')).queryByRole('button', { name })).toBeNull();
  });

  test('says why a Guild will not take the Hero', async () => {
    render_(started());
    const { name, page } = openFirstHero();

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
    const [card] = within(page).getAllByRole('listitem');
    if (card === undefined) throw new Error('an empty Roster');
    const name = within(card).getAllByRole('button')[0]?.textContent ?? '';
    const fee = Number(/Transfer fee (\d+) Wealth/.exec(card.textContent ?? '')?.[1]);
    const before = wealth();

    fireEvent.click(within(card).getByRole('button', { name: `Take ${name} in` }));
    await idle();

    expect(wealth()).toBe(before - fee);
    expect(within(section('Roster')).getByRole('button', { name })).toBeDefined();
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
  test('says there are none, until a Rival makes one', () => {
    render_(started());

    expect(within(section('Transfer Offers')).getByText("No Transfer Offer stands for The Lantern’s Heroes.")).toBeDefined();
  });

  test('accepts an offer: the Hero goes to the Guild that made it, for its fee', async () => {
    render_(withOffer(started()));
    const offers = section('Transfer Offers');
    const sentence = within(offers).getByText(/ offers \d+ Wealth for .+, until the night of Day \d+\.$/).textContent ?? '';
    const [, guildName = '', fee = '', name = ''] = /^(.+) offers (\d+) Wealth for (.+), until/.exec(sentence) ?? [];
    const before = wealth();

    fireEvent.click(within(offers).getByRole('button', { name: 'Accept' }));
    await idle();

    expect(wealth()).toBe(before + Number(fee));
    expect(within(section('Roster')).queryByRole('button', { name })).toBeNull();
    expect(within(section('Transfer Offers')).queryByRole('button', { name: 'Accept' })).toBeNull();
    logSays(new RegExp(`^${guildName} took ${name} from The Lantern for ${fee} Wealth, accepting its Transfer Offer\\.$`));
  });

  test('declines an offer: the Hero stays', async () => {
    render_(withOffer(started()));
    const offers = section('Transfer Offers');
    const [, guildName = '', name = ''] = /^(.+) offers \d+ Wealth for (.+), until/.exec(within(offers).getAllByRole('listitem')[0]?.textContent ?? '') ?? [];

    fireEvent.click(within(offers).getByRole('button', { name: 'Decline' }));
    await idle();

    expect(within(section('Roster')).getByRole('button', { name })).toBeDefined();
    expect(within(section('Transfer Offers')).getByText("No Transfer Offer stands for The Lantern’s Heroes.")).toBeDefined();
    logSays(new RegExp(`^The Lantern declined ${guildName}'s offer for ${name}\\.$`));
  });
});
