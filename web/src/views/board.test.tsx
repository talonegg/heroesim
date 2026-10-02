import type { GuildId, Hero, HeroId, PartyId, Quest, QuestId, WorldDocument } from '@heroesim/engine';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, test } from 'vitest';
import { App } from '../app';
import { changed, estimateOf, holding, started } from '../state/game.test-support';
import { chanceWords, shownPercent } from '../state/query-words';
import type { GameState } from '../state/reducer';
import { inHistory, navButton, openView, section } from './page.test-support';

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
 * meets Past the watch, Ambush on the road, The trapped passage, Hold the line and The long march,
 * stealth, combat, stealth, combat and travel, whose Checks read Dexterity, Wits, Perception,
 * Weaponry, Strength, Courage, Constitution, Endurance, Leadership and Willpower, in that order.
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
      'Fame ±2',
      '1 to 3 Heroes',
      'Needs a Hero with Herbalism',
      'Leaves today',
    ]);
    // The Fame chip says when it is won and when lost (DL-109 item 2, Q9).
    expect(within(terms).getByText('Fame ±2').closest('.chip')?.getAttribute('title')).toBe('Won on a success, lost on a failure');
    // The others leave on a later Day, which they name.
    const [, second] = within(section('Board')).getAllByRole('article');
    expect(within(second as HTMLElement).getByText(/^Until Day \d+$/)).toBeDefined();
    // Folded: none of its details.
    expect(within(card).queryByRole('heading', { name: 'Encounters' })).toBeNull();
  });

  // v1.1.4-S6 (DL-148 items 15 and 17): the Party the engine would send from the free Heroes, and a word for its chance.
  test('says "Your best Party:" with a chance word and who, or that no Party of the free Heroes meets the requirements', () => {
    const state = changed(madeToOrder(), (document) => {
      const second = document.world.quests[document.world.board[1] as QuestId] as Quest;
      second.requirements = { partySizeMin: 1, partySizeMax: 2, classKey: 'no-such-class' };
    });
    render(<App initial={state} />);
    const [first, second] = within(section('Board')).getAllByRole('article') as [HTMLElement, HTMLElement];

    const best = within(first).getByTestId('best-party');
    expect(best.textContent).toMatch(/^Your best Party: (Hopeless|Unlikely|Even|Likely|Near certain), .+$/);
    expect(best.querySelector('strong')?.textContent).toMatch(/^(Hopeless|Unlikely|Even|Likely|Near certain)$/);
    // The Quest needs a Hero with Herbalism, whom only the last Hero has: they are of the Party.
    expect(best.textContent).toContain(heroesOf(state).at(-1)?.name ?? '');
    expect(within(second).getByTestId('best-party').textContent).toBe('No Party of your free Heroes meets its requirements.');
  });

  test("unfolds from its name to its Encounters, each Check's name and what it reads, the Skills that help, and its difficulty against the Board", () => {
    render(<App initial={madeToOrder()} />);
    const card = firstCard();
    const toggle = within(within(card).getByRole('heading', { level: 3 })).getByRole('button');
    expect(toggle.getAttribute('aria-expanded')).toBe('false');

    fireEvent.click(toggle);

    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    // Each Encounter in the order it meets them, with its kind's icon, and what its one Check reads: no demands.
    expect(within(card).queryByText(/Demands/)).toBeNull();
    const encounters = within(card).getByTestId('encounters');
    const met = [...encounters.children] as HTMLElement[];
    expect(met.map((item) => item.querySelector('.reads__name')?.textContent)).toEqual([
      'Past the watch',
      'Ambush on the road',
      'The trapped passage',
      'Hold the line',
      'The long march',
    ]);
    for (const item of met) expect(item.querySelector('.reads__name svg.icon[aria-hidden="true"]')).not.toBeNull();
    expect(met[0]?.querySelector('p')?.textContent).toBe(
      'Reads 0.4 × the highest Dexterity in the Party + 0.3 × the highest Wits in the Party + 0.3 × the highest Perception in the Party',
    );
    expect(met[1]?.querySelector('p')?.textContent).toBe(
      'Reads 0.4 × the total Weaponry of the Party + 0.3 × the total Strength of the Party + 0.3 × the total Courage of the Party',
    );

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

    // Placed against the Board's 19 to 89, halfway, never called a band.
    const meter = within(card).getByRole('img', { name: 'Difficulty 54: 3rd hardest of the 6 Quests on the Board, from 19 to 89' });
    expect((meter.querySelector('.meter__mark') as HTMLElement).style.left).toBe('50%');
    expect(meter.querySelectorAll('.meter__tick')).toHaveLength(5);
    expect(within(card).getByText('3rd hardest of the 6 Quests on the Board', { exact: false })).toBeDefined();
    expect(card.textContent).not.toMatch(/\bband\b/i);

    fireEvent.click(toggle);
    expect(within(card).queryByRole('heading', { name: 'Encounters' })).toBeNull();
  });
});

describe('the Board', () => {
  test('is ordered by reward, by difficulty or by the Day each leaves, and as posted again, as display only, the order kept in this browser', () => {
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
    // Kept for the next time the page opens in this browser (DL-109 item 2, Q11), as the pool's is.
    expect(localStorage.getItem('heroesim.boardOrder')).toBe('leaves');
    cleanup();
    render(<App initial={state} />);
    openView('Board');
    expect((within(section('Board')).getByRole('combobox', { name: 'Order' }) as HTMLSelectElement).value).toBe('leaves');
    expect(rewards()).toEqual([216, 188, 378, 96, 207, 92]);

    fireEvent.change(within(section('Board')).getByRole('combobox', { name: 'Order' }), { target: { value: 'posted' } });
    expect(rewards()).toEqual([96, 188, 207, 216, 92, 378]);
    expect(localStorage.getItem('heroesim.boardOrder')).toBe('posted');
  });

  test('a browser that keeps a Board order it does not know, or refuses its storage, shows the Board as posted', () => {
    localStorage.setItem('heroesim.boardOrder', 'by-moonlight');
    render(<App initial={started()} />);
    expect((within(section('Board')).getByRole('combobox', { name: 'Order' }) as HTMLSelectElement).value).toBe('posted');
    cleanup();

    const blocked = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get() {
        throw new Error('storage blocked');
      },
    });
    try {
      render(<App initial={started()} />);
      const order = within(section('Board')).getByRole('combobox', { name: 'Order' }) as HTMLSelectElement;
      expect(order.value).toBe('posted');
      fireEvent.change(order, { target: { value: 'reward' } });
      expect((within(section('Board')).getByRole('combobox', { name: 'Order' }) as HTMLSelectElement).value).toBe('reward');
    } finally {
      if (blocked !== undefined) Object.defineProperty(globalThis, 'localStorage', blocked);
    }
  });
});

describe('the Party builder', () => {
  test("gives each Hero on the Roster a row: whether they can go, and why not and until when; Class and Level; the Stats the Quest's Checks read; the Skills it names; and no Hero's Morale (DL-148 item 12)", () => {
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
      // The Stats its Encounters' Checks read, in the order it meets them (v1.1.4-S6), where the template's demands stood.
      const read = ['Dexterity', 'Wits', 'Perception', 'Weaponry', 'Strength', 'Courage', 'Constitution', 'Endurance', 'Leadership', 'Willpower'];
      expect([...stats.querySelectorAll('div')].map((pair) => pair.textContent)).toEqual(
        read.map((name) => `${name}${hero.stats[name.toLowerCase()]}`),
      );
    });
    // v1.1.4-S3's verification: the builder names no Hero's Morale; the Party's one line says what it does.
    for (const row of rows(form)) expect(row.textContent).not.toMatch(/Morale|wretched|steady/);
    expect(within(third as HTMLElement).getByText('Herbalism 3')).toBeDefined();
    // No fit and no odds: nothing on a row judges the Hero against the Quest; the chances are the Party's (v1.1.4-S6).
    for (const row of rows(form)) expect(row.textContent).not.toMatch(/\b(fit|odds|chance)\b/i);
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

  test("sends the Party with the consumables chosen, which leave what the Guild holds (the CLI's `dispatch --consumables`, M9-S8)", async () => {
    render(<App initial={holding(madeToOrder(), 'healing-draught', 3)} />);
    const questName = within(firstCard()).getByRole('heading', { level: 3 }).textContent ?? '';
    const form = chooseForFirst();
    const healer = rows(form).find((row) => within(row).queryByText(/^Herbalism \d$/) !== null);
    if (healer === undefined) throw new Error('no Hero with Herbalism');
    fireEvent.click(within(healer).getByRole('checkbox'));
    for (let times = 0; times < 2; times += 1) {
      fireEvent.click(within(form).getByRole('button', { name: /^Healing draught, 3 held: .+: one more$/ }));
    }

    fireEvent.click(within(form).getByRole('button', { name: 'Send the Party' }));
    await idle();

    const sent = inHistory(/^The Lantern sent .+ on .+, back on the night of Day \d+, carrying Healing draught ×2\.$/);
    expect(sent.classList.contains('is-new')).toBe(true);
    expect(sent.textContent).toContain(` on ${questName}, `);
    // Kind, Effect, Held, Sells for: two of the three went with the Party.
    const held = within(section('Sell')).getByRole('rowheader', { name: 'Healing draught' }).closest('tr') as HTMLElement;
    expect(within(held).getAllByRole('cell')[2]?.textContent).toBe('1');
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

  test("gives one Morale line for the Party chosen, from its mean form, naming no Hero (v1.1.4-S3, DL-148 item 12)", () => {
    const state = changed(madeToOrder(), (document, player) => {
      const [first, second] = player.rosterIds;
      (document.world.heroes[first as HeroId] as Hero).morale = 10;
      (document.world.heroes[second as HeroId] as Hero).morale = 60;
    });
    render(<App initial={state} />);
    const form = chooseForFirst();
    const [first, second] = rows(form);
    if (first === undefined || second === undefined) throw new Error('two Heroes wanted');

    expect(within(form).queryByTestId('party-morale')).toBeNull();
    fireEvent.click(within(second).getByRole('checkbox'));
    expect(within(form).getByRole('heading', { level: 4, name: 'Morale' })).toBeDefined();
    expect(within(form).getByTestId('party-morale').textContent).toBe('Makes no difference.');

    // A wretched Hero beside a steady one: a mean form of 0.925, below the low band's 0.93.
    fireEvent.click(within(first).getByRole('checkbox'));
    const line = within(form).getByTestId('party-morale').textContent ?? '';
    expect(line).toBe('Lowers the odds badly.');
    for (const hero of heroesOf(state).slice(0, 2)) expect(line).not.toContain(hero.name);
  });

  // v1.1.4-S6 (DL-148 item 15): a word for each Encounter and the Quest; the detail, the estimate's percentages floored to 5%, "if no one falls".
  test('gives a chance word for each Encounter and the Quest, and in the detail each percentage floored to 5%, if no one falls', () => {
    const state = holding(madeToOrder(), 'whetstone', 2);
    const [quest] = questsOf(state);
    const [hero, other] = heroesOf(state).slice(-2) as [Hero, Hero];
    render(<App initial={state} />);
    const form = chooseForFirst();
    expect(within(form).queryByTestId('chances')).toBeNull();

    for (const row of rows(form).slice(-2)) fireEvent.click(within(row).getByRole('checkbox'));
    fireEvent.click(within(form).getByRole('button', { name: /^Whetstone, 2 held: .+: one more$/ }));

    const estimate = estimateOf(state, (quest as Quest).id, [hero.id, other.id], [{ definitionKey: 'whetstone', quantity: 1 }]);
    if (estimate === null) throw new Error('No estimate');
    const names = ['Past the watch', 'Ambush on the road', 'The trapped passage', 'Hold the line', 'The long march', 'The Quest'];
    const chances = [...estimate.encounters, estimate];
    expect(within(form).getByRole('heading', { level: 4, name: 'Chances' })).toBeDefined();
    expect(within(within(form).getByTestId('chances')).getAllByRole('listitem').map((item) => item.textContent)).toEqual(
      names.map((name, index) => `${name}: ${chanceWords[chances[index]?.chance ?? 'hopeless']}`),
    );
    const detail = within(form).getByTestId('chance-numbers');
    expect(detail.querySelector('summary')?.textContent).toBe('The numbers, if no one falls');
    expect([...detail.querySelectorAll('li')].map((item) => item.textContent)).toEqual(
      names.map((name, index) => `${name}: ${shownPercent(chances[index]?.success ?? 0)}%`),
    );
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

describe('a Party chosen and not sent (DL-109 item 2, Q16)', () => {
  /** Ticks the second Hero on the first Quest's builder and carries two healing draughts; the builder's form. */
  function chooseSome(): HTMLElement {
    const form = chooseForFirst();
    fireEvent.click(within(rows(form)[1] as HTMLElement).getByRole('checkbox'));
    for (let times = 0; times < 2; times += 1) {
      fireEvent.click(within(form).getByRole('button', { name: /^Healing draught, 3 held: .+: one more$/ }));
    }
    return form;
  }

  function ticked(form: HTMLElement): boolean[] {
    return rows(form).map((row) => (within(row).getByRole('checkbox') as HTMLInputElement).checked);
  }

  function draughts(form: HTMLElement): string {
    return (within(form).getByRole('spinbutton', { name: /^Healing draught, 3 held/ }) as HTMLInputElement).value;
  }

  test('is kept, with its consumables, when the player leaves the Board and comes back', () => {
    render(<App initial={holding(madeToOrder(), 'healing-draught', 3)} />);
    const before = ticked(chooseSome());

    openView('Roster');
    openView('Market');
    openView('Board');

    const again = within(firstCard()).getByRole('form');
    expect(ticked(again)).toEqual(before);
    expect(ticked(again).filter(Boolean)).toHaveLength(1);
    expect(draughts(again)).toBe('2');
  });

  test('offers no more of a consumable than the Guild holds now, once some are sold (M9-F6, carried finding 1)', async () => {
    render(<App initial={holding(madeToOrder(), 'healing-draught', 3)} />);
    chooseSome();

    openView('Market');
    const sale = within(section('Sell')).getByRole('rowheader', { name: 'Healing draught' }).closest('tr') as HTMLElement;
    fireEvent.change(within(sale).getByLabelText('How many Healing draught'), { target: { value: '2' } });
    fireEvent.click(within(sale).getByRole('button', { name: 'Sell Healing draught' }));
    await idle();
    openView('Board');

    // Two were chosen and one is left: the stepper says one, what the Party would carry.
    const stepper = within(within(firstCard()).getByRole('form')).getByRole('spinbutton', { name: /^Healing draught, 1 held/ }) as HTMLInputElement;
    expect(stepper.value).toBe('1');
  });

  test("is kept for each Quest: another Quest's builder starts empty, and the first's is as it was", () => {
    render(<App initial={holding(madeToOrder(), 'healing-draught', 3)} />);
    const before = ticked(chooseSome());

    const second = within(section('Board')).getAllByRole('article')[1] as HTMLElement;
    fireEvent.click(within(second).getByRole('button', { name: 'Choose a Party' }));
    const other = within(second).getByRole('form');
    expect(ticked(other).some(Boolean)).toBe(false);
    expect(draughts(other)).toBe('0');
    fireEvent.click(within(rows(other)[0] as HTMLElement).getByRole('checkbox'));

    fireEvent.click(within(firstCard()).getByRole('button', { name: 'Choose a Party' }));
    const first = within(firstCard()).getByRole('form');
    expect(ticked(first)).toEqual(before);
    expect(draughts(first)).toBe('2');
  });

  test('goes when its Quest leaves the Board', async () => {
    render(<App initial={holding(madeToOrder(), 'healing-draught', 3)} />);
    const questName = within(firstCard()).getByRole('heading', { level: 3 }).textContent ?? '';
    chooseSome();

    // The first Quest's last Day is today: a Day on, it has left the Board, and its choice with it.
    for (let turn = 0; turn < 3; turn += 1) {
      fireEvent.click(screen.getByRole('button', { name: 'Advance a Turn' }));
      await idle();
    }
    const board = openView('Board');
    expect(within(board).queryByRole('heading', { level: 3, name: questName })).toBeNull();
    for (const card of within(board).getAllByRole('article')) expect(within(card).queryByRole('form')).toBeNull();
  });

  test('goes when another game is started, though its Quest has the same id there', async () => {
    render(<App initial={holding(madeToOrder(), 'healing-draught', 3)} />);
    chooseSome();

    fireEvent.click(within(section('This game')).getByRole('button', { name: 'Start a new game' }));
    fireEvent.change(screen.getByLabelText('Guild name'), { target: { value: 'The Second Lamp' } });
    fireEvent.change(screen.getByLabelText(/Guildmaster/), { target: { value: 'Bran Tull' } });
    fireEvent.change(screen.getByLabelText('Seed'), { target: { value: 'app-test' } });
    fireEvent.click(screen.getByRole('button', { name: 'Start the game' }));
    await idle();

    // The same seed: the same Board, its Quests by the same ids, and nothing chosen for them.
    openView('Board');
    const form = chooseForFirst();
    expect(ticked(form).some(Boolean)).toBe(false);
    expect(within(form).queryByRole('spinbutton')).toBeNull();
  });
});
