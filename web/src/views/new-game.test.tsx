import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { App } from '../app';
import { content } from '../content';
import { media } from '../media';
import { createSaves } from '../saves';
import { memoryStore } from '../saves.test-support';
import type { GameAction } from '../state/reducer';
import { guildmasterPreview, setupFormChoices, startingStats, statPicksView, statsWords, writtenDescription, type SetupFields } from '../state/setup';
import { NewGame } from './new-game';
import { openView } from './page.test-support';

// The new-game form's Guildmaster (#30): behind "Your Guildmaster" (DL-149)
// two ways, "Choose for me", chosen at first, which leaves the whole Guildmaster to the seed, and "Choose
// myself": the sex and the age with no draw, a Portrait of that sex, the five Stats within the Stat
// points, the Traits chosen for the player or chosen within the budget, and the three descriptive
// Attributes. Every number, bound and judgement is a selector's (`state/setup.ts`), the engine's own
// through `setupRefusal`; a setup the engine would refuse cannot be started, and its sentence stands
// beside "Start the game", as does what "Choose myself" still needs. The values are DL-100 item 3's: a
// budget of 1, at most 2 Traits; and DL-149 item 5's: 50 Stat points, each Stat 5 to 15.

afterEach(cleanup);

/** The facts "Choose myself" sends with the sex, the age and the picture chosen as `chosen()` chooses them. */
const mine = {
  guildName: 'The Lantern',
  guildmasterName: 'Ada Vell',
  guildmasterSex: 'female',
  guildmasterAge: 34,
  guildmasterPortraitKey: 'gm-female-01',
  guildmasterStats: startingStats(),
} as const satisfies SetupFields;

/** The texts the form writes for `setup` and `seed`, from the engine's preview. */
function writtenOf(setup: SetupFields, seed: string, n: number) {
  return writtenDescription(guildmasterPreview(setup, seed), seed, n);
}

/** The form, before a game, and the plays it makes. */
function form(): { play: ReturnType<typeof vi.fn<(action: GameAction) => void>> } {
  const play = vi.fn<(action: GameAction) => void>();
  const saves = createSaves(async () => memoryStore());
  render(<NewGame saves={saves} busy={false} play={play} />);
  return { play };
}

function named(): void {
  fireEvent.change(screen.getByLabelText('Guild name'), { target: { value: 'The Lantern' } });
  fireEvent.change(screen.getByLabelText('Guildmaster’s name'), { target: { value: 'Ada Vell' } });
  fireEvent.change(screen.getByLabelText('Seed'), { target: { value: 'new-game-test' } });
}

function start(): HTMLButtonElement {
  return screen.getByRole('button', { name: 'Start the game' }) as HTMLButtonElement;
}

/** The Guildmaster's setup, opened. */
function setup(): HTMLElement {
  const details = screen.getByText('Your Guildmaster').closest('details');
  if (details === null) throw new Error('no "Your Guildmaster"');
  if (!details.open) fireEvent.click(within(details).getByText('Your Guildmaster'));
  return details;
}

/** The two ways of "Your Guildmaster". */
function way(name: 'Choose for me' | 'Choose myself'): HTMLInputElement {
  return within(within(setup()).getByRole('radiogroup', { name: 'Who chooses' })).getByRole('radio', { name }) as HTMLInputElement;
}

/** "Choose myself", the setup opened. */
function myself(): HTMLElement {
  fireEvent.click(way('Choose myself'));
  return setup();
}

/** A part of the Guildmaster's setup with its own legend. */
function part(legend: 'Traits' | 'Portrait' | 'Stats'): HTMLElement {
  return within(setup()).getByRole('group', { name: legend });
}

function sexField(): HTMLSelectElement {
  return within(setup()).getByLabelText('Sex') as HTMLSelectElement;
}

function ageField(): HTMLSelectElement {
  return within(setup()).getByLabelText('Age') as HTMLSelectElement;
}

function portraitRadio(name: string): HTMLInputElement {
  return within(part('Portrait')).getByRole('radio', { name }) as HTMLInputElement;
}

/** With "Choose myself", the sex, the age and a picture chosen, as `mine` holds them. */
function chosen(): void {
  myself();
  fireEvent.change(sexField(), { target: { value: mine.guildmasterSex } });
  fireEvent.change(ageField(), { target: { value: String(mine.guildmasterAge) } });
  fireEvent.click(portraitRadio('Female Portrait 1'));
}

/** A Stat's stepper button, by its name: `Lower Coaching`. */
function stepperOf(name: string): HTMLButtonElement {
  return within(part('Stats')).getByRole('button', { name }) as HTMLButtonElement;
}

/** The Traits chosen rather than chosen for the player, and the list of them. */
function chooseTraits(): HTMLElement {
  fireEvent.click(within(part('Traits')).getByRole('radio', { name: 'Choose them' }));
  return within(setup()).getByRole('list', { name: 'Guildmaster Traits' });
}

function trait(name: string): HTMLInputElement {
  return within(setup()).getByRole('checkbox', { name: new RegExp(`^${name}\\b`) }) as HTMLInputElement;
}

/** What is said of a Trait beside its box: its effect, what it excludes, and how it stands. */
function said(name: string): string {
  const ids = trait(name).getAttribute('aria-describedby')?.split(' ') ?? [];
  return ids.map((id) => document.getElementById(id)?.textContent ?? '').join(' ');
}

function budget(): string {
  return within(setup()).getByTestId('trait-budget').textContent ?? '';
}

function refusal(): string | null {
  return screen.queryByTestId('setup-refusal')?.textContent ?? null;
}

function hint(): string | null {
  return screen.queryByTestId('setup-hint')?.textContent ?? null;
}

function preview(): HTMLElement {
  return within(setup()).getByTestId('guildmaster-preview');
}

/** The preview's lines. */
function lines(): string[] {
  return [...preview().querySelectorAll('p')].map((line) => line.textContent ?? '');
}

describe("the Guildmaster's setup in the new-game form ", () => {
  test('sits behind "Your Guildmaster", closed, on "Choose for me": no control for the Guildmaster shows, and all of them is drawn from the seed', () => {
    const { play } = form();
    named();

    const details = screen.getByText('Your Guildmaster').closest('details');
    expect(details?.open).toBe(false);
    expect(way('Choose for me').checked).toBe(true);
    expect(way('Choose myself').checked).toBe(false);
    // Only the names, the Background and the seed: nothing of the Guildmaster but the preview.
    for (const label of ['Sex', 'Age', 'Birthplace', 'Appearance', 'Biography']) expect(within(setup()).queryByLabelText(label), label).toBeNull();
    for (const legend of ['Traits', 'Portrait', 'Stats']) expect(within(setup()).queryByRole('group', { name: legend }), legend).toBeNull();
    expect(within(setup()).queryByRole('button', { name: 'Write them for me' })).toBeNull();
    fireEvent.click(start());

    expect(play).toHaveBeenCalledTimes(1);
    const [action] = play.mock.calls[0] ?? [];
    expect(action).toEqual({
      kind: 'newGame',
      seed: 'new-game-test',
      guildName: 'The Lantern',
      guildmasterName: 'Ada Vell',
      createdAt: expect.any(String),
    });
  });

  test('"Choose myself" offers each sex and each starting age with no draw, and the three descriptive Attributes with their bounds, and starts with what was set', () => {
    const { play } = form();
    named();
    const details = myself();

    expect(within(details).getAllByRole('option').map((option) => option.textContent)).toEqual([
      'Choose',
      'Female',
      'Male',
      'Choose',
      ...setupFormChoices().ages.map(String),
    ]);
    // "Choose" stands until a sex and an age are chosen, and cannot be chosen back.
    expect(sexField().value).toBe('');
    expect((sexField().options[0] as HTMLOptionElement).disabled).toBe(true);
    expect((ageField().options[0] as HTMLOptionElement).disabled).toBe(true);
    expect(details.textContent).toContain(setupFormChoices().agesWords);
    for (const [label, bound] of [
      ['Birthplace', 'At most 60 characters'],
      ['Appearance', 'At most 280 characters'],
      ['Biography', 'At most 1000 characters'],
    ] as const) {
      const field = within(details).getByLabelText(label);
      expect(document.getElementById(field.getAttribute('aria-describedby') ?? '')?.textContent).toBe(bound);
    }

    fireEvent.change(sexField(), { target: { value: 'male' } });
    fireEvent.change(ageField(), { target: { value: '38' } });
    fireEvent.click(portraitRadio('Male Portrait 2'));
    fireEvent.change(within(details).getByLabelText('Birthplace'), { target: { value: 'Harrowgate' } });
    fireEvent.change(within(details).getByLabelText('Biography'), { target: { value: 'Kept the toll bridge for twenty years.' } });
    fireEvent.click(start());

    expect(play.mock.calls[0]?.[0]).toMatchObject({
      guildmasterSex: 'male',
      guildmasterAge: 38,
      guildmasterPortraitKey: 'gm-male-02',
      guildmasterStats: { inspiration: 10, influence: 10, negotiation: 10, coaching: 10, judgement: 10 },
      guildmasterBirthplace: 'Harrowgate',
      guildmasterBiography: 'Kept the toll bridge for twenty years.',
    });
    expect(play.mock.calls[0]?.[0]).not.toHaveProperty('guildmasterAppearance');
    expect(play.mock.calls[0]?.[0]).not.toHaveProperty('guildmasterTraitKeys');
  });

  // DL-149 items 3 and 4: the engine would draw what is left out, for the CLI; the form holds the start.
  test('"Choose myself" holds "Start the game" until a sex, an age and a picture are chosen, saying which', () => {
    const { play } = form();
    named();
    myself();

    expect(start().disabled).toBe(true);
    expect(hint()).toBe("Choose your Guildmaster's Sex, Age and Portrait to start.");
    expect(start().getAttribute('aria-describedby')).toBe(screen.getByTestId('setup-hint').id);
    fireEvent.change(sexField(), { target: { value: 'female' } });
    expect(hint()).toBe("Choose your Guildmaster's Age and Portrait to start.");
    fireEvent.change(ageField(), { target: { value: '30' } });
    expect(hint()).toBe("Choose your Guildmaster's Portrait to start.");
    expect(start().disabled).toBe(true);
    fireEvent.click(portraitRadio('Female Portrait 4'));
    expect(hint()).toBeNull();
    expect(start().disabled).toBe(false);
    fireEvent.click(start());
    expect(play.mock.calls[0]?.[0]).toMatchObject({ guildmasterSex: 'female', guildmasterAge: 30, guildmasterPortraitKey: 'gm-female-04' });
  });

  // DL-149 item 8: switching ways keeps the player's choices for when they come back.
  test('switching to "Choose for me" sends nothing of the Guildmaster, and back to "Choose myself" finds every choice kept', () => {
    const { play } = form();
    named();
    chosen();
    chooseTraits();
    fireEvent.click(trait('Old soldier'));
    fireEvent.click(trait('Mistrusts magic'));
    fireEvent.click(within(part('Stats')).getByRole('button', { name: 'Lower Coaching' }));
    fireEvent.change(within(setup()).getByLabelText('Biography'), { target: { value: 'A life.' } });

    fireEvent.click(way('Choose for me'));
    expect(within(setup()).queryByLabelText('Sex')).toBeNull();
    fireEvent.click(start());
    expect(play.mock.calls[0]?.[0]).toEqual({ kind: 'newGame', seed: 'new-game-test', guildName: 'The Lantern', guildmasterName: 'Ada Vell', createdAt: expect.any(String) });

    fireEvent.click(way('Choose myself'));
    expect(sexField().value).toBe('female');
    expect(ageField().value).toBe('34');
    expect(portraitRadio('Female Portrait 1').checked).toBe(true);
    expect(trait('Old soldier').checked).toBe(true);
    expect(within(part('Stats')).getByTestId('stat-coaching').textContent).toBe('9');
    expect((within(setup()).getByLabelText('Biography') as HTMLTextAreaElement).value).toBe('A life.');
    fireEvent.click(start());
    expect(play.mock.calls[1]?.[0]).toMatchObject({
      ...mine,
      guildmasterStats: { ...mine.guildmasterStats, coaching: 9 },
      guildmasterTraitKeys: ['old-soldier', 'mistrusts-magic'],
      guildmasterBiography: 'A life.',
    });
  });

  test('each Trait says what it does, what it costs and what it excludes; the budget left moves as the player picks', () => {
    form();
    named();
    chosen();
    chooseTraits();

    expect(within(setup()).getByText(/^Up to 2 Traits, costing no more than the budget of 1 in all/)).toBeDefined();
    expect(budget()).toContain('Budget left: 1');
    expect(trait('Miser').closest('label')?.textContent).toContain('Refunds 2');
    expect(said('Miser')).toContain('Morale baseline -5');
    expect(said('Miser')).toContain('Excludes Spendthrift and Well liked');
    expect(trait('Old soldier').closest('label')?.textContent).toContain('Costs 1');

    fireEvent.click(trait('Miser'));
    expect(trait('Miser').checked).toBe(true);
    expect(budget()).toContain('Budget left: 3');
    expect(budget()).toContain('The Traits chosen refund 2; the budget is 1.');
  });

  test('a Trait excluded by one chosen cannot be chosen, and says why; taking the other off frees it', () => {
    form();
    named();
    chosen();
    chooseTraits();
    fireEvent.click(trait('Miser'));

    for (const name of ['Well liked', 'Spendthrift']) {
      expect(trait(name).disabled, name).toBe(true);
      expect(said(name), name).toContain('Excluded by Miser, which is chosen.');
    }
    expect(trait('Thrifty').disabled).toBe(false);

    fireEvent.click(trait('Miser'));
    expect(trait('Well liked').disabled).toBe(false);
    expect(said('Well liked')).not.toContain('Excluded');
  });

  test('a Trait over the budget is marked so, and may be chosen: the game cannot start until a penalty brings the cost back', () => {
    const { play } = form();
    named();
    chosen();
    chooseTraits();

    expect(said('Well liked')).toContain('Over the budget: with it, the Traits cost 2 and the budget is 1.');
    expect(trait('Well liked').disabled).toBe(false);
    fireEvent.click(trait('Well liked'));

    expect(budget()).toContain('Over the budget by 1');
    expect(start().disabled).toBe(true);
    expect(refusal()).toBe('Those Traits cost 2 points and the budget is 1: a buff costs points and a penalty refunds them.');
    expect(start().getAttribute('aria-describedby')).toBe(screen.getByTestId('setup-refusal').id);

    fireEvent.click(trait('Spendthrift'));
    expect(budget()).toContain('Budget left: 1');
    expect(refusal()).toBeNull();
    expect(start().disabled).toBe(false);
    fireEvent.click(start());
    expect(play.mock.calls[0]?.[0]).toMatchObject({ guildmasterTraitKeys: ['well-liked', 'spendthrift'] });
  });

  test('with as many Traits chosen as a Guildmaster holds, the rest cannot be chosen, and say why', () => {
    form();
    named();
    chosen();
    chooseTraits();
    fireEvent.click(trait('Miser'));
    fireEvent.click(trait('Thrifty'));

    for (const name of ['Old soldier', 'Mistrusts magic', 'Spendthrift', 'Well liked']) {
      expect(trait(name).disabled, name).toBe(true);
      expect(said(name), name).toContain('2 Traits are chosen, the most a Guildmaster holds.');
    }
    expect(budget()).toContain('Budget left: 1');
  });

  test('the Traits keep their two ways, "Choose for me" and "Choose them"; choosing none is a choice: the Guildmaster starts with no Trait', () => {
    const { play } = form();
    named();
    chosen();
    expect((within(part('Traits')).getByRole('radio', { name: 'Choose for me' }) as HTMLInputElement).checked).toBe(true);
    chooseTraits();
    fireEvent.click(start());

    expect(play.mock.calls[0]?.[0]).toMatchObject({ guildmasterTraitKeys: [] });
    // Back to chosen for the player, the choice is not sent.
    play.mockClear();
    fireEvent.click(within(part('Traits')).getByRole('radio', { name: 'Choose for me' }));
    expect(within(setup()).queryByRole('list', { name: 'Guildmaster Traits' })).toBeNull();
    fireEvent.click(start());
    expect(play.mock.calls[0]?.[0]).not.toHaveProperty('guildmasterTraitKeys');
  });

  // DL-149 item 7: "Choose for me" for "Drawn from the seed", the Seed field keeping its name.
  test('no "Drawn from the seed" remains on the setup screen, either way, and the Seed field keeps its name', () => {
    form();
    named();
    setup();
    const said = (): string => [document.body.textContent ?? '', ...[...document.querySelectorAll('[aria-label]')].map((each) => each.getAttribute('aria-label'))].join(' ');
    expect(said()).not.toMatch(/drawn from the seed/i);
    chosen();
    fireEvent.click(stepperOf('Lower Coaching'));
    expect(said()).not.toMatch(/drawn from the seed/i);
    chooseTraits();
    expect(said()).not.toMatch(/drawn from the seed/i);
    expect(screen.getByLabelText('Seed')).toBeDefined();
    expect(within(setup()).getAllByRole('radio', { name: 'Choose for me' })).toHaveLength(2);
  });

  test("a setup the engine would refuse cannot be started, and the engine's sentence stands beside the form", () => {
    form();

    // Before anything is typed, a hint in place of a refusal (DL-109 item 2, Q22); the game cannot start.
    expect(hint()).toBe('Name your Guild and its Guildmaster to start.');
    expect(refusal()).toBeNull();
    expect(start().disabled).toBe(true);
    expect(start().getAttribute('aria-describedby')).toBe(screen.getByTestId('setup-hint').id);
    // Once a field is touched, the first thing the engine asks for.
    fireEvent.change(screen.getByLabelText('Guild name'), { target: { value: 'The Lantern' } });
    expect(hint()).toBeNull();
    expect(refusal()).toBe('The Guildmaster needs a name.');
    fireEvent.change(screen.getByLabelText('Guild name'), { target: { value: '' } });
    expect(refusal()).toBe('The Guild needs a name.');
    expect(start().disabled).toBe(true);
    named();
    expect(refusal()).toBeNull();
    expect(start().disabled).toBe(false);
    expect(start().hasAttribute('aria-describedby')).toBe(false);

    chosen();
    fireEvent.change(within(setup()).getByLabelText('Birthplace'), { target: { value: 'x'.repeat(61) } });
    expect(refusal()).toBe('The Birthplace is 61 characters long; it holds at most 60.');
    expect(start().disabled).toBe(true);
    // The docked alert is the reducer's, after a click; this is the form's own, before one.
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

// DL-149 item 5: the five Guildmaster Stats, each with a stepper, within the Stat points.
describe('the Stats "Choose myself" sets, within the Stat points', () => {
  function stepper(name: string, how: 'Raise' | 'Lower'): HTMLButtonElement {
    return within(part('Stats')).getByRole('button', { name: `${how} ${name}` }) as HTMLButtonElement;
  }

  /**
   * Whether a stepper's button is held: marked `aria-disabled`, and still a button the keyboard can be
   * on, never `disabled`.
   */
  function held(button: HTMLButtonElement): boolean {
    expect(button.disabled).toBe(false);
    return button.getAttribute('aria-disabled') === 'true';
  }

  function value(key: string): string {
    return within(part('Stats')).getByTestId(`stat-${key}`).textContent ?? '';
  }

  function points(): string {
    return within(part('Stats')).getByTestId('stat-points').textContent ?? '';
  }

  test("each starts at 10 with all 50 points spent, says what it does in the Guildmaster view's words, and cannot be raised until another is lowered", () => {
    form();
    named();
    chosen();

    // The words the page's setup gives under the game's rules, which a view reads as it takes no engine value (DL-73).
    expect(within(part('Stats')).getByText(statsWords())).toBeDefined();
    expect(points()).toContain('Stat points left: 0');
    expect(points()).toContain(statPicksView(startingStats()).points.spentWords);
    const rows = within(within(part('Stats')).getByRole('list', { name: 'Guildmaster Stats' })).getAllByRole('listitem');
    expect(rows.map((row) => row.textContent)).toEqual([
      'Inspiration−10+The Morale baseline of the Heroes',
      "Influence−10+The Regard a Patron's Quest earns",
      'Negotiation−10+The reward agreed and the fees paid',
      'Coaching−10+The XP of the training yard',
      'Judgement−10+How sharp the Potential hints read',
    ]);
    // Each stepper is named by its Stat, and says what it does.
    const group = within(part('Stats')).getByRole('group', { name: 'Negotiation' });
    expect(document.getElementById(group.getAttribute('aria-describedby') ?? '')?.textContent).toBe('The reward agreed and the fees paid');
    for (const name of ['Inspiration', 'Influence', 'Negotiation', 'Coaching', 'Judgement']) {
      expect(held(stepper(name, 'Raise')), name).toBe(true);
      expect(held(stepper(name, 'Lower')), name).toBe(false);
    }
  });

  // A button a browser disables loses the keyboard, so a step held is marked aria-disabled
  // and kept in the tab order; activated, it does nothing.
  test('a stepper pressed from the keyboard to its bound keeps the keyboard, and holds the value there', () => {
    form();
    named();
    chosen();
    const lower = stepper('Coaching', 'Lower');
    lower.focus();

    // Enter on a focused button, as a browser does it: the key, then the click it makes.
    for (let n = 0; n < 7; n += 1) {
      fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'Enter' });
      fireEvent.click(document.activeElement as HTMLElement);
      fireEvent.keyUp(document.activeElement as HTMLElement, { key: 'Enter' });
    }

    expect(value('coaching')).toBe('5');
    expect(document.activeElement).toBe(stepper('Coaching', 'Lower'));
    expect(held(stepper('Coaching', 'Lower'))).toBe(true);
    expect(points()).toContain('Stat points left: 5');
  });

  test('a point lowered may be raised elsewhere, never past 15 or below 5, and points left unspent are noted as lost; the game starts with them', () => {
    const { play } = form();
    named();
    chosen();

    for (let n = 0; n < 5; n += 1) fireEvent.click(stepper('Coaching', 'Lower'));
    expect(value('coaching')).toBe('5');
    expect(held(stepper('Coaching', 'Lower'))).toBe(true);
    expect(points()).toContain('Stat points left: 5');
    expect(within(part('Stats')).getByTestId('stat-points-unspent').textContent).toBe('Stat points left unspent are lost.');
    for (let n = 0; n < 5; n += 1) fireEvent.click(stepper('Negotiation', 'Raise'));
    expect(value('negotiation')).toBe('15');
    expect(held(stepper('Negotiation', 'Raise'))).toBe(true);
    expect(within(part('Stats')).queryByTestId('stat-points-unspent')).toBeNull();
    // The points spent, every Raise is held: the pool cannot be overspent.
    expect(held(stepper('Influence', 'Raise'))).toBe(true);
    for (let n = 0; n < 5; n += 1) fireEvent.click(stepper('Judgement', 'Lower'));
    for (let n = 0; n < 5; n += 1) fireEvent.click(stepper('Influence', 'Raise'));
    expect(value('influence')).toBe('15');
    fireEvent.click(stepper('Inspiration', 'Lower'));
    expect(points()).toContain('Stat points left: 1');

    fireEvent.click(start());
    expect(play.mock.calls[0]?.[0]).toMatchObject({
      guildmasterStats: { inspiration: 9, influence: 15, negotiation: 15, coaching: 5, judgement: 5 },
    });
  });
});

describe("the rest of the CLI's `new` in the form (the epic's §3)", () => {
  test("a Background chosen for the Guild and the Guildmaster's Appearance start the game with them, as `--background` and `--appearance` do", () => {
    const { play } = form();
    named();
    const background = document.querySelector<HTMLSelectElement>('select[name="backgroundKey"]');
    if (background === null) throw new Error('no Background');
    // "Choose for me" for "Drawn from the seed" (DL-149 item 7).
    expect(background.selectedOptions[0]?.textContent).toBe('Choose for me');
    const option = Array.from(background.options).find((each) => each.value !== '');
    if (option === undefined) throw new Error('no Background to choose');

    fireEvent.change(background, { target: { value: option.value } });
    chosen();
    fireEvent.change(within(setup()).getByLabelText('Appearance'), { target: { value: '  Tall, grey at the temples.  ' } });
    fireEvent.click(start());

    // The engine trims the texts (DL-102 item 6); the form sends them as written.
    expect(play.mock.calls[0]?.[0]).toMatchObject({
      backgroundKey: option.value,
      guildmasterAppearance: '  Tall, grey at the temples.  ',
    });
  });
});

describe('when the Guildmaster retires (DL-113 item 5)', () => {
  test('the Age field says the age a Guildmaster retires at, from the configuration', () => {
    form();
    myself();
    const said = (ageField().getAttribute('aria-describedby') ?? '')
      .split(' ')
      .map((id) => document.getElementById(id)?.textContent ?? '')
      .join(' ');

    expect(said).toContain(setupFormChoices().retiresWords);
    expect(setupFormChoices().retiresWords).toMatch(/^Retires at \d+$/);
  });
});

// DL-125 items 3 and 6: the Portrait chosen from the owner's pictures, and the Guildmaster
// chosen for the player shown before "Start the game". The pictures of each sex are the content's.
// The grid (DL-149 item 4) offers no draw, and shows no picture before a sex is chosen.
describe("the Guildmaster's Portrait and the Guildmaster chosen for the player, in the new-game form", () => {
  /** The names of the pictures of a sex, by its word, as the form offers them: one for each the content lists. */
  function picturesOf(sexWord: 'Female' | 'Male'): string[] {
    const count = content.portraits.guildmaster[sexWord === 'Female' ? 'female' : 'male'].length;
    return Array.from({ length: count }, (_, n) => `${sexWord} Portrait ${n + 1}`);
  }

  /** The Portrait's radio buttons, by the words each is named by. */
  function portraitNames(): string[] {
    return within(part('Portrait'))
      .queryAllByRole('radio')
      .map((radio) => (radio.closest('label')?.textContent ?? '').trim());
  }

  /** The thumbnail a radio button's label holds: its picture's `src`, or `null` for the Silhouette alone. */
  function thumbnailOf(name: string): string | null {
    const thumbnail = portraitRadio(name).closest('label')?.querySelector('[data-testid="portrait-thumbnail"]');
    return thumbnail?.querySelector('img[data-picture="picture"]')?.getAttribute('src') ?? null;
  }

  test("shows no picture until a sex is chosen, saying so, then a thumbnail of each of that sex's pictures, each a radio button with its picture as its label", () => {
    form();
    named();
    myself();

    expect(portraitNames()).toEqual([]);
    expect(within(part('Portrait')).getByTestId('portrait-unsexed').textContent).toBe('Choose a Sex to see the pictures.');
    expect(part('Portrait').querySelectorAll('img')).toHaveLength(0);
    // No draw from the seed, and no buttons for the other sex.
    expect(within(part('Portrait')).queryByRole('group', { name: 'Pictures shown' })).toBeNull();

    fireEvent.change(sexField(), { target: { value: 'female' } });
    expect(portraitNames()).toEqual(picturesOf('Female'));
    expect(within(part('Portrait')).queryByTestId('portrait-unsexed')).toBeNull();
    const thumbnail = portraitRadio('Female Portrait 1').closest('label')?.querySelector('[data-testid="portrait-thumbnail"]');
    // Each from its thumbnail, never the full picture.
    expect(thumbnailOf('Female Portrait 1')).toBe(media.portraitThumbnail('guildmaster', 'female', 'gm-female-01').picture);
    // The picture is its label for the eye; its name is said in words, whether the picture loads or not.
    expect(thumbnail?.getAttribute('aria-hidden')).toBe('true');

    fireEvent.change(sexField(), { target: { value: 'male' } });
    expect(portraitNames()).toEqual(picturesOf('Male'));
    expect(within(part('Portrait')).queryByRole('group', { name: 'Pictures shown' })).toBeNull();
  });

  test('changing the sex clears the picture chosen', () => {
    const { play } = form();
    named();
    chosen();
    expect(portraitRadio('Female Portrait 1').checked).toBe(true);
    expect(start().disabled).toBe(false);

    fireEvent.change(sexField(), { target: { value: 'male' } });
    expect(within(part('Portrait')).getAllByRole('radio').some((radio) => (radio as HTMLInputElement).checked)).toBe(false);
    expect(start().disabled).toBe(true);
    expect(hint()).toBe("Choose your Guildmaster's Portrait to start.");
    fireEvent.click(portraitRadio('Male Portrait 1'));
    fireEvent.click(start());
    expect(play.mock.calls[0]?.[0]).toMatchObject({ guildmasterSex: 'male', guildmasterPortraitKey: 'gm-male-01' });
  });

  // DL-134 item 7: the engine's `portraitFit`, beside the choice, never a refusal.
  test('notes beside the choice a Portrait chosen that looks older than the age chosen, and lets the game start', () => {
    const { play } = form();
    named();
    myself();
    const youngest = Math.min(...setupFormChoices().ages);
    const older = content.portraits.guildmaster.female.find((key) => (content.portraitAppearances.portraits[key]?.apparentAge[0] ?? 0) > youngest);
    if (older === undefined) throw new Error('no female picture older than the youngest age');
    const [from, to] = content.portraitAppearances.portraits[older]?.apparentAge ?? [];
    const live = within(part('Portrait')).getByTestId('portrait-notes-live');
    expect(live.getAttribute('aria-live')).toBe('polite');
    expect(within(live).queryByTestId('portrait-notes')).toBeNull();

    fireEvent.change(sexField(), { target: { value: 'female' } });
    fireEvent.change(ageField(), { target: { value: String(youngest) } });
    fireEvent.click(portraitRadio(`Female Portrait ${content.portraits.guildmaster.female.indexOf(older) + 1}`));
    expect(within(live).getByTestId('portrait-notes').textContent).toBe(`This Portrait looks ${from} to ${to}: older than your Guildmaster's ${youngest}.`);
    expect(refusal()).toBeNull();
    expect(start().disabled).toBe(false);
    fireEvent.click(start());
    expect(play.mock.calls[0]?.[0]).toMatchObject({ guildmasterPortraitKey: older, guildmasterAge: youngest });

    // Another sex clears the picture, and its note.
    fireEvent.change(sexField(), { target: { value: 'male' } });
    expect(within(live).queryByTestId('portrait-notes')).toBeNull();
  });

  test('with "Choose for me", shows the Guildmaster chosen for the player: the Portrait, sex and age, the five Stats and the Traits, following the Seed field', () => {
    form();
    named();

    const [lead, who, stats, traits, portrait] = lines();
    expect(lead).toBe('Chosen for you');
    // 'new-game-test' draws a female of 26, and gm-female-13, of 26 to 36, fits her.
    expect(who).toBe('Female, 26');
    expect(stats).toMatch(/^Inspiration \d+, Influence \d+, Negotiation \d+, Coaching \d+ and Judgement \d+$/);
    expect(traits).toMatch(/^Traits: /);
    expect(portrait).toBe('Portrait: Female Portrait 13');
    // From its thumbnail.
    const figure = within(preview()).getByTestId('portrait');
    expect(within(figure).getByRole('img', { name: 'Portrait of Ada Vell' }).getAttribute('src')).toBe(
      media.portraitThumbnail('guildmaster', 'female', 'gm-female-13').picture,
    );

    // Another seed chooses another Guildmaster; the preview follows it as it is typed.
    const seen = new Set<string>();
    for (let n = 0; n < 12; n += 1) {
      fireEvent.change(screen.getByLabelText('Seed'), { target: { value: `follow-${n}` } });
      seen.add(lines().join(' | '));
    }
    expect(seen.size).toBeGreaterThan(1);

    fireEvent.change(screen.getByLabelText('Seed'), { target: { value: ' ' } });
    expect(preview().textContent).toBe('The seed is blank, so one is made up when the game starts, and your Guildmaster is chosen for you then.');
  });

  test('says what is chosen for the player in a polite live region, so a screen reader hears it follow the fields', () => {
    form();
    named();
    const live = within(setup()).getByTestId('guildmaster-preview-live');
    expect(live.getAttribute('aria-live')).toBe('polite');
    expect(within(live).getByTestId('guildmaster-preview').textContent).toMatch(/^Chosen for you/);
  });

  test('with "Choose myself", says only the Traits chosen for the player, and nothing once they are chosen', () => {
    form();
    named();
    chosen();
    expect(lines()).toHaveLength(2);
    expect(lines()[0]).toBe('Chosen for you');
    expect(lines()[1]).toMatch(/^Traits: /);
    expect(within(preview()).queryByTestId('portrait')).toBeNull();
    // Within the Traits, and still a live region.
    expect(within(part('Traits')).getByTestId('guildmaster-preview-live').getAttribute('aria-live')).toBe('polite');

    chooseTraits();
    expect(within(setup()).queryByTestId('guildmaster-preview')).toBeNull();
  });
});

// DL-125 item 6: "Write them for me" and "Again" fill the three texts, which stay the player's.
// They are "Choose myself"'s, written once the sex, the age and the picture are chosen.
describe("the Guildmaster's Birthplace, Appearance and Biography written in the new-game form", () => {
  function field(label: 'Birthplace' | 'Appearance' | 'Biography'): HTMLInputElement | HTMLTextAreaElement {
    return within(setup()).getByLabelText(label) as HTMLInputElement | HTMLTextAreaElement;
  }

  function texts(): { birthplace: string; appearance: string; biography: string } {
    return { birthplace: field('Birthplace').value, appearance: field('Appearance').value, biography: field('Biography').value };
  }

  function writeButton(name: 'Write them for me' | 'Again'): HTMLButtonElement {
    return within(setup()).getByRole('button', { name }) as HTMLButtonElement;
  }

  function writtenFor(): string {
    return within(setup()).getByTestId('written-for').textContent ?? '';
  }

  test('cannot write until the sex, the age and the picture are chosen', () => {
    form();
    named();
    myself();
    expect(writeButton('Write them for me').disabled).toBe(true);
    fireEvent.change(sexField(), { target: { value: 'female' } });
    fireEvent.change(ageField(), { target: { value: '34' } });
    expect(writeButton('Write them for me').disabled).toBe(true);
    fireEvent.click(portraitRadio('Female Portrait 1'));
    expect(writeButton('Write them for me').disabled).toBe(false);
  });

  test('"Write them for me" fills the three fields for the Guildmaster chosen, as the engine writes them, and says for whom', () => {
    form();
    named();
    chosen();
    expect(texts()).toEqual({ birthplace: '', appearance: '', biography: '' });
    expect(within(setup()).queryByRole('button', { name: 'Again' })).toBeNull();

    fireEvent.click(writeButton('Write them for me'));

    expect(texts()).toEqual(writtenOf(mine, 'new-game-test', 0)?.texts);
    // The picture chosen is mapped: its narrative is the Appearance.
    expect(texts().appearance).toBe(content.portraitAppearances.portraits['gm-female-01']?.narrative);
    expect(writtenFor()).toBe('Written for a female Guildmaster of 34. Change them as you like.');
  });

  test('"Again" writes them anew, each time another, and "Write them for me" writes the first again', () => {
    form();
    named();
    chosen();
    fireEvent.click(writeButton('Write them for me'));
    const first = texts();

    fireEvent.click(writeButton('Again'));
    expect(texts()).toEqual(writtenOf(mine, 'new-game-test', 1)?.texts);
    fireEvent.click(writeButton('Again'));
    expect(texts()).toEqual(writtenOf(mine, 'new-game-test', 2)?.texts);
    expect(texts().biography).not.toBe(first.biography);

    fireEvent.click(writeButton('Write them for me'));
    expect(texts()).toEqual(first);
  });

  test('the fields stay editable: what they hold at the start is kept', () => {
    const { play } = form();
    named();
    chosen();
    fireEvent.click(writeButton('Write them for me'));
    fireEvent.change(field('Biography'), { target: { value: 'Kept the toll bridge for twenty years.' } });
    fireEvent.click(start());

    expect(play.mock.calls[0]?.[0]).toMatchObject({
      guildmasterSex: 'female',
      guildmasterAge: 34,
      guildmasterBirthplace: texts().birthplace,
      guildmasterAppearance: texts().appearance,
      guildmasterBiography: 'Kept the toll bridge for twenty years.',
    });
  });

  test('with the seed blank, makes one up as the click would, shows it, and writes for it', () => {
    form();
    named();
    chosen();
    fireEvent.change(screen.getByLabelText('Seed'), { target: { value: '  ' } });
    fireEvent.click(writeButton('Write them for me'));

    const seed = (screen.getByLabelText('Seed') as HTMLInputElement).value;
    expect(seed.trim()).not.toBe('');
    expect(texts()).toEqual(writtenOf(mine, seed, 0)?.texts);
  });

  // The buttons write only what is blank or still as written.
  test('"Write them for me" and "Again" keep what the player typed, and write the rest', () => {
    form();
    named();
    chosen();
    fireEvent.change(field('Biography'), { target: { value: 'Kept the toll bridge for twenty years.' } });
    fireEvent.click(writeButton('Write them for me'));
    expect(texts()).toEqual({ ...writtenOf(mine, 'new-game-test', 0)?.texts, biography: 'Kept the toll bridge for twenty years.' });

    fireEvent.change(field('Birthplace'), { target: { value: 'Kingsbridge' } });
    fireEvent.click(writeButton('Again'));
    expect(texts()).toEqual({
      ...writtenOf(mine, 'new-game-test', 1)?.texts,
      birthplace: 'Kingsbridge',
      biography: 'Kept the toll bridge for twenty years.',
    });
  });

  // The Birthplace typed is the one the Biography names.
  test('a Birthplace typed is the Biography\'s: "Write them for me", "Again" and a Biography still as written name it, and the game starts with both', () => {
    const { play } = form();
    named();
    chosen();
    const drawn = writtenOf(mine, 'new-game-test', 0)?.texts;
    if (drawn === undefined) throw new Error('nothing written');
    fireEvent.change(field('Birthplace'), { target: { value: 'Kingsbridge' } });
    fireEvent.click(writeButton('Write them for me'));
    expect(texts()).toEqual({ ...drawn, birthplace: 'Kingsbridge', biography: drawn.biography.replace(drawn.birthplace, 'Kingsbridge') });

    fireEvent.click(writeButton('Again'));
    expect(field('Biography').value).toContain('Kingsbridge');
    fireEvent.change(field('Birthplace'), { target: { value: 'Aldermoor, by the ford' } });
    expect(field('Biography').value).toContain('Aldermoor, by the ford');
    expect(field('Biography').value).not.toContain('Kingsbridge');
    expect(writtenFor()).toMatch(/Change them as you like\.$/);

    fireEvent.click(start());
    const sent = play.mock.calls[0]?.[0];
    expect(sent).toMatchObject({ guildmasterBirthplace: 'Aldermoor, by the ford' });
    expect(sent !== undefined && 'guildmasterBiography' in sent ? sent.guildmasterBiography : '').toContain('Aldermoor, by the ford');
  });

  test('a text changed again after the Guildmaster changed is the player\'s, and the note no longer names it', () => {
    form();
    named();
    chosen();
    fireEvent.click(writeButton('Write them for me'));
    fireEvent.change(field('Biography'), { target: { value: 'She rows.' } });
    fireEvent.change(ageField(), { target: { value: '47' } });
    expect(writtenFor()).toMatch(/The Biography was written for another Guildmaster/);

    fireEvent.change(field('Biography'), { target: { value: 'She rows still.' } });
    expect(writtenFor()).toBe('Written for a female Guildmaster of 47. Change them as you like.');
  });

  // The texts follow the Guildmaster the form makes, unless the player changed them.
  test('changing the sex and picture, the age or the seed writes the texts still as written for the new Guildmaster, and says so', () => {
    const { play } = form();
    named();
    chosen();
    fireEvent.click(writeButton('Write them for me'));
    expect(writtenFor()).toBe('Written for a female Guildmaster of 34. Change them as you like.');

    fireEvent.change(sexField(), { target: { value: 'male' } });
    fireEvent.click(portraitRadio('Male Portrait 3'));
    fireEvent.change(ageField(), { target: { value: '48' } });
    const male = { ...mine, guildmasterSex: 'male' as const, guildmasterAge: 48, guildmasterPortraitKey: 'gm-male-03' };
    expect(texts()).toEqual(writtenOf(male, 'new-game-test', 0)?.texts);
    expect(writtenFor()).toBe('Written for a male Guildmaster of 48. Change them as you like.');

    fireEvent.change(screen.getByLabelText('Seed'), { target: { value: 'another-seed' } });
    expect(texts()).toEqual(writtenOf(male, 'another-seed', 0)?.texts);
    fireEvent.click(start());
    expect(play.mock.calls[0]?.[0]).toMatchObject({
      seed: 'another-seed',
      guildmasterSex: 'male',
      guildmasterAge: 48,
      guildmasterBirthplace: writtenOf(male, 'another-seed', 0)?.texts.birthplace,
      guildmasterBiography: writtenOf(male, 'another-seed', 0)?.texts.biography,
    });
  });

  test('a text the player changed is kept when the Guildmaster changes, and the note says it was written for another', () => {
    const { play } = form();
    named();
    chosen();
    fireEvent.click(writeButton('Write them for me'));
    fireEvent.change(field('Biography'), { target: { value: `${field('Biography').value} She rows.` } });
    const changed = field('Biography').value;

    fireEvent.change(ageField(), { target: { value: '45' } });
    expect(field('Biography').value).toBe(changed);
    expect(writtenFor()).toBe('Written for a female Guildmaster of 45. The Biography was written for another Guildmaster, and is kept as you changed it.');
    fireEvent.click(start());
    expect(play.mock.calls[0]?.[0]).toMatchObject({ guildmasterAge: 45, guildmasterBiography: changed });
  });

  test('cannot write while the engine would refuse the rest of the setup, whose sentence stands', () => {
    form();
    named();
    chosen();
    chooseTraits();
    fireEvent.click(trait('Well liked'));

    expect(writeButton('Write them for me').disabled).toBe(true);
    expect(refusal()).toMatch(/budget/);
  });
});

// The journey: from the form's choices, or its preview, to the Guildmaster view.
describe('from the new-game form to the Guildmaster view', () => {
  async function begin(): Promise<void> {
    fireEvent.click(start());
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Start the game' })).toBeNull());
    await waitFor(() => expect(document.querySelector('main')?.getAttribute('aria-busy')).toBe('false'));
  }

  function guildmasterPicture(): HTMLElement {
    return within(openView('Guildmaster')).getByRole('img', { name: 'Portrait of Ada Vell' });
  }

  /** The Guildmaster view's Stats, by name. */
  function statsShown(): Record<string, string> {
    const view = openView('Guildmaster');
    return Object.fromEntries(
      ['Inspiration', 'Influence', 'Negotiation', 'Coaching', 'Judgement'].map((name) => [
        name,
        within(view).getByRole('rowheader', { name }).nextElementSibling?.textContent ?? '',
      ]),
    );
  }

  test('with "Choose myself", the Portrait and the Stats chosen are the ones the Guildmaster view shows', async () => {
    render(<App />);
    named();
    chosen();
    fireEvent.click(within(part('Stats')).getByRole('button', { name: 'Lower Judgement' }));
    fireEvent.click(within(part('Stats')).getByRole('button', { name: 'Raise Negotiation' }));
    await begin();

    expect(guildmasterPicture().getAttribute('src')).toBe(media.portrait('guildmaster', 'female', 'gm-female-01').picture);
    const terms = [...openView('Guildmaster').querySelectorAll('dt')].map((dt) => [dt.textContent, dt.nextElementSibling?.textContent]);
    expect(terms).toContainEqual(['Sex', 'Female']);
    expect(terms).toContainEqual(['Age', '34']);
    expect(statsShown()).toEqual({ Inspiration: '10', Influence: '10', Negotiation: '11', Coaching: '10', Judgement: '9' });
  });

  test('with "Choose for me", what the preview names is what "Start the game" makes: the sex, the age, the Stats, the Traits and the Portrait, and the texts written', async () => {
    render(<App />);
    named();
    const [, who = '', stats = '', traits = '', portrait = ''] = [...within(setup()).getByTestId('guildmaster-preview').querySelectorAll('p')].map(
      (line) => line.textContent ?? '',
    );
    const [, sexWord = '', age = ''] = /^(Female|Male), (\d+)$/.exec(who) ?? [];
    const sex = sexWord === 'Female' ? 'female' : 'male';
    await begin();

    const view = openView('Guildmaster');
    const terms = [...view.querySelectorAll('dt')].map((dt) => [dt.textContent, dt.nextElementSibling?.textContent]);
    expect(terms).toContainEqual(['Sex', sexWord]);
    expect(terms).toContainEqual(['Age', age]);
    // DL-149 item 2: the texts are written for them too.
    for (const term of ['Birthplace', 'Appearance', 'Biography']) expect(terms.find(([dt]) => dt === term)?.[1]?.trim() ?? '', term).not.toBe('');
    const shown = statsShown();
    expect(stats).toBe(
      `Inspiration ${shown.Inspiration}, Influence ${shown.Influence}, Negotiation ${shown.Negotiation}, Coaching ${shown.Coaching} and Judgement ${shown.Judgement}`,
    );
    const held = within(openView('Guildmaster')).queryByRole('list', { name: "Ada Vell's Traits" });
    const names = held === null ? [] : within(held).getAllByRole('listitem').map((item) => item.querySelector('.chip')?.textContent ?? '');
    expect(traits).toBe(`Traits: ${names.length === 0 ? 'None' : names.join(' and ')}`);
    // The picture the preview names by its place is the one the view shows.
    const place = portrait.replace(`Portrait: ${sexWord} Portrait `, '');
    expect(place).toMatch(/^\d+$/);
    expect(guildmasterPicture().getAttribute('src')).toBe(media.portrait('guildmaster', sex, `gm-${sex}-${place.padStart(2, '0')}`).picture);
  });

  test('the texts written, and one then changed, are the ones the Guildmaster view shows', async () => {
    render(<App />);
    named();
    chosen();
    fireEvent.click(within(setup()).getByRole('button', { name: 'Write them for me' }));
    fireEvent.click(within(setup()).getByRole('button', { name: 'Again' }));
    const birthplace = (within(setup()).getByLabelText('Birthplace') as HTMLInputElement).value;
    const appearance = (within(setup()).getByLabelText('Appearance') as HTMLTextAreaElement).value;
    fireEvent.change(within(setup()).getByLabelText('Biography'), { target: { value: 'Kept the toll bridge for twenty years.' } });
    await begin();

    const terms = [...openView('Guildmaster').querySelectorAll('dt')].map((dt) => [dt.textContent, dt.nextElementSibling?.textContent]);
    expect(terms).toContainEqual(['Birthplace', birthplace]);
    expect(terms).toContainEqual(['Appearance', appearance]);
    expect(terms).toContainEqual(['Biography', 'Kept the toll bridge for twenty years.']);
  });
});
