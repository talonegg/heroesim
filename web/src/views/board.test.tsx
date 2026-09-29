import type { GuildId, Hero, HeroId, PartyId, Quest, QuestId, WorldDocument } from '@heroesim/engine';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, test } from 'vitest';
import { App } from '../app';
import { changed, holding, started } from '../state/game.test-support';
import type { GameState } from '../state/reducer';
import { navButton, openView, section } from './page.test-support';

// The Board's Quest cards and the Party builder (M9-S4, DL-104), through the page as a player uses
// them: a card of two lines that unfolds to its details, the Board ordered, each Hero's row in the
// builder, a Hero's page opened from it and left with the choice kept, the requirements as a
// checklist, dispatch's verdict as a banner, and the card a Quest becomes once its Party is sent.
// Every value on the page comes from a selector (`state/selectors.test.ts` holds them to the
// engine); here they are read as the page shows them.

afterEach(cleanup);

async function idle(): Promise<void> {
  await waitFor(() => expect(document.querySelector('main')?.getAttribute('aria-busy')).toBe('false'));
}

function documentOf(state: GameState): WorldDocument {
  if (state.document === null) throw new Error('no game');
  return state.document;
}

/** The Board's Quests, in its order. */
function questsOf(state: GameState): Quest[] {
  const { world } = documentOf(state);
  return world.board.map((id) => world.quests[id] as Quest);
}

/** The player's Heroes, in the Roster's order. */
function heroesOf(state: GameState): Hero[] {
  const { world } = documentOf(state);
  const guild = Object.values(world.guilds).find((each) => each.controller.kind === 'player');
  return (guild?.rosterIds ?? []).map((id) => world.heroes[id] as Hero);
}

/**
 * A new game whose first Quest is made to order: difficulty 54 on a Board of 19 to 89, 5 Days away,
 * 243 Wealth, Fame 2, a Party of 1 to 3 with a Hero with Herbalism among them, on its last Day; it
 * demands Strength, Willpower and Courage, and meets stealth, combat, stealth, combat and travel.
 * The last Hero on the Roster has Herbalism 2.
 */
function madeToOrder(from: GameState = started()): GameState {
  return changed(from, (document, player) => {
    const last = document.world.heroes[player.rosterIds.at(-1) ?? ('' as HeroId)];
    if (last === undefined) throw new Error('an empty Roster');
    last.skills = { ...last.skills, herbalism: 2 };
    const quests = document.world.board.map((id) => document.world.quests[id] as Quest);
    [54, 19, 89, 40, 40, 70].forEach((difficulty, index) => {
      const quest = quests[index];
      if (quest !== undefined) quest.difficulty = difficulty;
    });
    const [first] = quests;
    if (first === undefined) throw new Error('an empty Board');
    first.durationTurns = 15;
    first.reward = 243;
    first.fameEffect = 2;
    first.requirements = { partySizeMin: 1, partySizeMax: 3, skillKey: 'herbalism' };
    first.expiresOnTurn = 2;
    first.demands = [
      ['strength', 0.4],
      ['willpower', 0.35],
      ['courage', 0.25],
    ];
    first.encounterKeys = ['past-the-watch', 'ambush-on-the-road', 'the-trapped-passage', 'hold-the-line', 'the-long-march'];
  });
}

/** The Board's first card, the Board opened. */
function firstCard(): HTMLElement {
  const [card] = within(section('Board')).getAllByRole('article');
  if (card === undefined) throw new Error('an empty Board');
  return card;
}

/** Opens the builder of the Board's first Quest, and gives its form. */
function chooseForFirst(): HTMLElement {
  const card = firstCard();
  fireEvent.click(within(card).getByRole('button', { name: 'Choose a Party' }));
  return within(card).getByRole('form');
}

function rows(form: HTMLElement): HTMLElement[] {
  return within(form).getAllByTestId('party-row');
}

describe('a Quest card', () => {
  test('is two lines, its name and Patron, then its terms as chips, the Day it leaves marked when that is today', () => {
    const state = madeToOrder();
    const [quest] = questsOf(state);
    const patron = Object.values(documentOf(state).world.patrons).find((each) => each.id === quest?.patronId);
    render(<App initial={state} />);

    const card = firstCard();
    const name = within(card).getByRole('heading', { level: 3 }).textContent ?? '';
    expect(within(card).getByText(patron?.name ?? '')).toBeDefined();
    const terms = within(card).getByRole('list', { name: `The terms of ${name}` });
    expect(within(terms).getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      'Difficulty 54',
      '5 Days away',
      '243 Wealth',
      '±2 Fame',
      '1 to 3 Heroes',
      'Needs a Hero with Herbalism',
      'Leaves today',
    ]);
    // The others leave on a later Day, which they name.
    const [, second] = within(section('Board')).getAllByRole('article');
    expect(within(second as HTMLElement).getByText(/^Until Day \d+$/)).toBeDefined();
    // Folded: none of its details.
    expect(within(card).queryByRole('heading', { name: 'Demands' })).toBeNull();
  });

  test('unfolds from its name to its Demands as bars, the Skills that help, its Encounters counted with their icons, and its difficulty against the Board', () => {
    render(<App initial={madeToOrder()} />);
    const card = firstCard();
    const toggle = within(within(card).getByRole('heading', { level: 3 })).getByRole('button');
    expect(toggle.getAttribute('aria-expanded')).toBe('false');

    fireEvent.click(toggle);

    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    const demands = within(card).getByRole('heading', { level: 4, name: 'Demands' }).parentElement as HTMLElement;
    expect(within(demands).getAllByRole('listitem').map((item) => item.textContent)).toEqual(['Strength40%', 'Willpower35%', 'Courage25%']);
    const bars = [...demands.querySelectorAll<HTMLElement>('.demand__bar > span')].map((bar) => bar.style.width);
    expect(bars).toEqual(['40%', '35%', '25%']);

    const skills = within(card).getByRole('heading', { level: 4, name: 'Skills that help' }).parentElement as HTMLElement;
    expect(within(skills).getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      'Stealth',
      'Lockpicking',
      'Swordcraft',
      'Tactics',
      'Trapcraft',
      'Shieldwork',
      'Field surgery',
      'Herbalism',
    ]);

    const encounters = within(card).getByRole('heading', { level: 4, name: 'Encounters' }).parentElement as HTMLElement;
    const chips = within(encounters).getAllByRole('listitem');
    expect(chips.map((item) => item.textContent)).toEqual(['stealth ×2', 'combat ×2', 'travel ×1']);
    // Each with its kind's icon: an icon is decoration, beside the word.
    for (const chip of chips) expect(chip.querySelector('svg.icon[aria-hidden="true"]')).not.toBeNull();

    // Placed against the Board's 19 to 89, halfway, never called a band.
    const meter = within(card).getByRole('img', { name: 'Difficulty 54: 3rd hardest of the 6 Quests on the Board, from 19 to 89' });
    expect((meter.querySelector('.meter__mark') as HTMLElement).style.left).toBe('50%');
    expect(meter.querySelectorAll('.meter__tick')).toHaveLength(5);
    expect(within(card).getByText('3rd hardest of the 6 Quests on the Board', { exact: false })).toBeDefined();
    expect(card.textContent).not.toMatch(/\bband\b/i);

    fireEvent.click(toggle);
    expect(within(card).queryByRole('heading', { name: 'Demands' })).toBeNull();
  });
});

describe('the Board', () => {
  test('is ordered by reward, by difficulty or by the Day each leaves, and as posted again, as display only', () => {
    const state = changed(started(), (document) => {
      const quests = document.world.board.map((id) => document.world.quests[id] as Quest);
      [96, 188, 207, 216, 92, 378].forEach((reward, index) => ((quests[index] as Quest).reward = reward));
      [24, 47, 46, 54, 23, 84].forEach((difficulty, index) => ((quests[index] as Quest).difficulty = difficulty));
      [8, 5, 8, 2, 11, 5].forEach((expires, index) => ((quests[index] as Quest).expiresOnTurn = expires));
    });
    render(<App initial={state} />);
    const rewards = () =>
      within(section('Board'))
        .getAllByRole('article')
        .map((card) => Number(/^(\d+) Wealth$/.exec(within(card).getAllByRole('listitem')[2]?.textContent ?? '')?.[1]));
    const order = within(section('Board')).getByRole('combobox', { name: 'Order' });

    expect(rewards()).toEqual([96, 188, 207, 216, 92, 378]);
    fireEvent.change(order, { target: { value: 'reward' } });
    expect(rewards()).toEqual([378, 216, 207, 188, 96, 92]);
    fireEvent.change(order, { target: { value: 'difficulty' } });
    expect(rewards()).toEqual([92, 96, 207, 188, 216, 378]);
    fireEvent.change(order, { target: { value: 'leaves' } });
    expect(rewards()).toEqual([216, 188, 378, 96, 207, 92]);

    // Kept from view to view.
    openView('Roster');
    expect(rewards()).toEqual([216, 188, 378, 96, 207, 92]);
    fireEvent.change(within(section('Board')).getByRole('combobox', { name: 'Order' }), { target: { value: 'posted' } });
    expect(rewards()).toEqual([96, 188, 207, 216, 92, 378]);
  });
});

describe('the Party builder', () => {
  test("gives each Hero on the Roster a row: whether they can go, and why not and until when; Class and Level; Morale and its band; the Stats the Quest demands; the Skills it names", () => {
    let names: string[] = [];
    const state = changed(madeToOrder(), (document) => {
      const guild = Object.values(document.world.guilds).find((each) => each.controller.kind === 'player');
      const [first, second, third] = (guild?.rosterIds ?? []).map((id) => document.world.heroes[id] as Hero);
      if (first === undefined || second === undefined || third === undefined) throw new Error('three Heroes');
      first.injury = { typeKey: 'deep-cut', healsOnTurn: 20 };
      second.morale = 15;
      third.skills = { ...third.skills, herbalism: 3 };
      names = [first.name, second.name, third.name];
    });
    const heroes = heroesOf(state);
    render(<App initial={state} />);

    const form = chooseForFirst();
    const [first, second, third] = rows(form);
    expect(rows(form)).toHaveLength(heroes.length);

    // Injured: the reason and the night the Injury heals, as the Roster words it; the box cannot be ticked.
    expect(within(first as HTMLElement).getByText('Injured, healing on the night of Day 6')).toBeDefined();
    expect((within(first as HTMLElement).getByRole('checkbox') as HTMLInputElement).disabled).toBe(true);
    expect((within(second as HTMLElement).getByRole('checkbox') as HTMLInputElement).disabled).toBe(false);
    expect(within(second as HTMLElement).queryByText(/healing|away with a Party/)).toBeNull();

    heroes.slice(0, 3).forEach((hero, index) => {
      const row = rows(form)[index] as HTMLElement;
      expect(within(row).getByRole('checkbox', { name: new RegExp(`^${names[index]} `) })).toBeDefined();
      expect(within(row).getByText(/^(Warrior|Rogue|Mage|Healer), Level \d+$/)).toBeDefined();
      const stats = row.querySelector('dl') as HTMLElement;
      expect([...stats.querySelectorAll('div')].map((pair) => pair.textContent)).toEqual([
        `Strength${hero.stats.strength}`,
        `Willpower${hero.stats.willpower}`,
        `Courage${hero.stats.courage}`,
      ]);
    });
    expect(within(second as HTMLElement).getByText('Morale 15, wretched')).toBeDefined();
    expect(within(third as HTMLElement).getByText('Herbalism 3')).toBeDefined();
    // No fit and no odds: nothing on a row judges the Hero against the Quest.
    expect(form.textContent).not.toMatch(/\b(fit|odds|chance)\b/i);
  });

  test('says who is away with a Party, and the night they come back', () => {
    const state = changed(madeToOrder(), (document) => {
      const guild = Object.values(document.world.guilds).find((each) => each.controller.kind === 'player');
      const hero = document.world.heroes[guild?.rosterIds[1] ?? ('' as HeroId)] as Hero;
      const questId = document.world.board[5] as QuestId;
      const partyId = 'party-000099' as PartyId;
      document.world.parties[partyId] = { id: partyId, questId, guildId: guild?.id as GuildId, heroIds: [hero.id], departedOnTurn: 0, returnsOnTurn: 17 };
      hero.partyId = partyId;
    });
    render(<App initial={state} />);

    const [, away] = rows(chooseForFirst());
    expect(within(away as HTMLElement).getByText('Away with a Party, back on the night of Day 5')).toBeDefined();
    expect((within(away as HTMLElement).getByRole('checkbox') as HTMLInputElement).disabled).toBe(true);
  });

  test("opens a Hero's page in place, and comes back to the Party and the consumables as chosen", () => {
    const state = holding(madeToOrder(), 'healing-draught', 3);
    const second = heroesOf(state)[1]?.name ?? '';
    render(<App initial={state} />);
    const form = chooseForFirst();
    const questName = within(firstCard()).getByRole('heading', { level: 3 }).textContent ?? '';
    const box = within(rows(form)[1] as HTMLElement).getByRole('checkbox');
    fireEvent.click(box);
    fireEvent.click(within(form).getByRole('button', { name: /^Healing draught, 3 held: .+: one more$/ }));
    fireEvent.click(within(form).getByRole('button', { name: /^Healing draught, 3 held: .+: one more$/ }));

    fireEvent.click(within(rows(form)[1] as HTMLElement).getByRole('button', { name: `Open ${second}'s page` }));

    const board = section('Board');
    const page = within(board).getByRole('article', { name: second });
    expect(document.activeElement).toBe(within(page).getByRole('heading', { level: 3, name: second }));
    expect(within(board).getByText(questName, { selector: 'strong' }).parentElement?.textContent).toBe(`Choosing a Party for ${questName}: 1 chosen.`);
    expect(within(board).queryByRole('form')).toBeNull();

    fireEvent.click(within(board).getByRole('button', { name: 'Back to the Party' }));

    const again = within(firstCard()).getByRole('form');
    expect((within(rows(again)[1] as HTMLElement).getByRole('checkbox') as HTMLInputElement).checked).toBe(true);
    expect(rows(again).filter((row) => (within(row).getByRole('checkbox') as HTMLInputElement).checked)).toHaveLength(1);
    expect((within(again).getByRole('spinbutton', { name: /^Healing draught, 3 held/ }) as HTMLInputElement).value).toBe('2');
    expect(within(again).getByText(/^Healing draught ×2, of 3 the Guild holds: /)).toBeDefined();
    // The keyboard is back where it left.
    expect(document.activeElement).toBe(within(rows(again)[1] as HTMLElement).getByRole('button', { name: `Open ${second}'s page` }));
  });

  test('shows the requirements as a checklist of met and missed, and dispatch’s verdict as a banner, green to send and red to refuse', () => {
    render(<App initial={madeToOrder()} />);
    const form = chooseForFirst();
    const checklist = () =>
      within(within(form).getByRole('heading', { level: 4, name: 'Requirements' }).nextElementSibling as HTMLElement)
        .getAllByRole('listitem')
        .map((item) => [item.className, item.textContent]);
    const verdict = within(form).getByRole('status');

    expect(checklist()).toEqual([
      ['is-missed', 'A Party of 1 to 3 (0 chosen): missed'],
      ['is-missed', 'A Hero with Herbalism: missed'],
    ]);
    expect(verdict.className).toBe('banner banner--bad');
    expect(verdict.textContent).toMatch(/^Dispatch would refuse it: /);
    expect((within(form).getByRole('button', { name: 'Send the Party' }) as HTMLButtonElement).disabled).toBe(true);

    // A Hero with Herbalism alone: both are met, and dispatch would send the Party.
    const healer = rows(form).find((row) => within(row).queryByText(/^Herbalism \d$/) !== null);
    if (healer === undefined) throw new Error('no Hero with Herbalism');
    fireEvent.click(within(healer).getByRole('checkbox'));

    expect(checklist()).toEqual([
      ['is-met', 'A Party of 1 to 3 (1 chosen): met'],
      ['is-met', 'A Hero with Herbalism: met'],
    ]);
    expect(verdict.className).toBe('banner banner--good');
    expect(verdict.textContent).toBe('Dispatch would send this Party.');
    expect((within(form).getByRole('button', { name: 'Send the Party' }) as HTMLButtonElement).disabled).toBe(false);
  });

  test('once sent, the card becomes a Party out card where it stood, naming who went and the night they return, with the keyboard on it', async () => {
    const state = madeToOrder();
    render(<App initial={state} />);
    const board = section('Board');
    const count = within(board).getAllByRole('article').length;
    const questName = within(firstCard()).getByRole('heading', { level: 3 }).textContent ?? '';
    const form = chooseForFirst();
    const healer = rows(form).find((row) => within(row).queryByText(/^Herbalism \d$/) !== null) as HTMLElement;
    const other = rows(form).find((row) => row !== healer && !(within(row).getByRole('checkbox') as HTMLInputElement).disabled) as HTMLElement;
    fireEvent.click(within(healer).getByRole('checkbox'));
    fireEvent.click(within(other).getByRole('checkbox'));
    const who = [healer, other].map((row) => row.querySelector('.party-row__name')?.textContent ?? '');

    fireEvent.click(within(form).getByRole('button', { name: 'Send the Party' }));
    await idle();

    // Where the Quest stood, first; the Board one Quest fewer.
    const [first, ...rest] = within(section('Board')).getAllByRole('article');
    expect(first?.dataset.testid).toBe('sent');
    expect(rest).toHaveLength(count - 1);
    const sent = first as HTMLElement;
    expect(within(sent).getByRole('heading', { level: 3 }).textContent).toBe(questName);
    expect(within(sent).getByText('Party out')).toBeDefined();
    const [words] = /^Sent: .+\. Back on the night of Day \d+\.$/.exec(within(sent).getByText(/^Sent: /).textContent ?? '') ?? [];
    expect(words).toBeDefined();
    const whoWent = [...who].sort();
    expect(whoWent.every((name) => words?.includes(name))).toBe(true);
    // The play settles after a paint, outside the click, so the card's effect may come a moment later.
    await waitFor(() => expect(document.activeElement).toBe(within(sent).getByRole('heading', { level: 3 })));

    // The home view lists it under the Parties out, in the same words.
    fireEvent.click(within(sent).getByRole('button', { name: 'See the Parties out' }));
    expect(navButton('Guild').getAttribute('aria-current')).toBe('page');
    const out = within(screen.getByRole('region', { name: 'Guild' })).getByRole('heading', { level: 3, name: 'Parties out' }).parentElement as HTMLElement;
    const line = within(out).getByRole('listitem').textContent ?? '';
    expect(line.startsWith(questName)).toBe(true);
    expect(words).toContain(line.slice(line.indexOf('back on ') + 'back on '.length));
  });

  test('the Party out card stays until the next play', async () => {
    const state = madeToOrder();
    render(<App initial={state} />);
    const form = chooseForFirst();
    const healer = rows(form).find((row) => within(row).queryByText(/^Herbalism \d$/) !== null) as HTMLElement;
    fireEvent.click(within(healer).getByRole('checkbox'));
    fireEvent.click(within(form).getByRole('button', { name: 'Send the Party' }));
    await idle();
    expect(within(section('Board')).getByTestId('sent')).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: 'Advance a Turn' }));
    await idle();

    expect(within(section('Board')).queryByTestId('sent')).toBeNull();
  });
});
