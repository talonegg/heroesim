import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { createSaves } from '../saves';
import { memoryStore } from '../saves.test-support';
import type { GameAction } from '../state/reducer';
import { setupFormChoices } from '../state/setup';
import { NewGame } from './new-game';

// The new-game form's Guildmaster (M9-S7, #30): an optional sex and age, the Traits drawn from the
// seed or chosen within the budget, and the three descriptive Attributes, all behind "Your
// Guildmaster". Every number, bound and judgement is a selector's (`state/setup.ts`), the engine's
// own through `setupRefusal`; a setup the engine would refuse cannot be started, and its sentence
// stands beside "Start the game". The values are DL-100 item 3's: a budget of 1, at most 2 Traits.

afterEach(cleanup);

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

/** The Traits chosen rather than drawn, and the list of them. */
function chooseTraits(): HTMLElement {
  fireEvent.click(within(setup()).getByRole('radio', { name: 'Choose them' }));
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

describe("the Guildmaster's setup in the new-game form (M9-S7)", () => {
  test('sits behind "Your Guildmaster", closed; left as it is, everything of the Guildmaster is drawn from the seed', () => {
    const { play } = form();
    named();

    const details = screen.getByText('Your Guildmaster').closest('details');
    expect(details?.open).toBe(false);
    for (const label of ['Sex', 'Age']) {
      const select = within(details as HTMLElement).getByLabelText(label) as HTMLSelectElement;
      expect(select.selectedOptions[0]?.textContent, label).toBe('Drawn from the seed');
    }
    expect((within(details as HTMLElement).getByRole('radio', { name: 'Drawn from the seed' }) as HTMLInputElement).checked).toBe(true);
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

  test('offers each sex, each starting age, and the three descriptive Attributes with their bounds, and starts with what was set', () => {
    const { play } = form();
    named();
    const details = setup();

    expect(within(details).getAllByRole('option').map((option) => option.textContent)).toEqual([
      'Drawn from the seed',
      'Female',
      'Male',
      'Drawn from the seed',
      ...setupFormChoices().ages.map(String),
    ]);
    expect(details.textContent).toContain(setupFormChoices().agesWords);
    for (const [label, bound] of [
      ['Birthplace', 'At most 60 characters'],
      ['Appearance', 'At most 280 characters'],
      ['Biography', 'At most 1000 characters'],
    ] as const) {
      const field = within(details).getByLabelText(label);
      expect(document.getElementById(field.getAttribute('aria-describedby') ?? '')?.textContent).toBe(bound);
    }

    fireEvent.change(within(details).getByLabelText('Sex'), { target: { value: 'male' } });
    fireEvent.change(within(details).getByLabelText('Age'), { target: { value: '38' } });
    fireEvent.change(within(details).getByLabelText('Birthplace'), { target: { value: 'Harrowgate' } });
    fireEvent.change(within(details).getByLabelText('Biography'), { target: { value: 'Kept the toll bridge for twenty years.' } });
    fireEvent.click(start());

    expect(play.mock.calls[0]?.[0]).toMatchObject({
      guildmasterSex: 'male',
      guildmasterAge: 38,
      guildmasterBirthplace: 'Harrowgate',
      guildmasterBiography: 'Kept the toll bridge for twenty years.',
    });
    expect(play.mock.calls[0]?.[0]).not.toHaveProperty('guildmasterAppearance');
    expect(play.mock.calls[0]?.[0]).not.toHaveProperty('guildmasterTraitKeys');
  });

  test('each Trait says what it does, what it costs and what it excludes; the budget left moves as the player picks', () => {
    form();
    named();
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
    chooseTraits();
    fireEvent.click(trait('Miser'));
    fireEvent.click(trait('Thrifty'));

    for (const name of ['Old soldier', 'Mistrusts magic', 'Spendthrift', 'Well liked']) {
      expect(trait(name).disabled, name).toBe(true);
      expect(said(name), name).toContain('2 Traits are chosen, the most a Guildmaster holds.');
    }
    expect(budget()).toContain('Budget left: 1');
  });

  test('choosing none is a choice: the Guildmaster starts with no Trait', () => {
    const { play } = form();
    named();
    chooseTraits();
    fireEvent.click(start());

    expect(play.mock.calls[0]?.[0]).toMatchObject({ guildmasterTraitKeys: [] });
    // Back to drawn, the choice is not sent.
    play.mockClear();
    fireEvent.click(within(setup()).getByRole('radio', { name: 'Drawn from the seed' }));
    expect(within(setup()).queryByRole('list', { name: 'Guildmaster Traits' })).toBeNull();
    fireEvent.click(start());
    expect(play.mock.calls[0]?.[0]).not.toHaveProperty('guildmasterTraitKeys');
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

    fireEvent.change(within(setup()).getByLabelText('Birthplace'), { target: { value: 'x'.repeat(61) } });
    expect(refusal()).toBe('The Birthplace is 61 characters long; it holds at most 60.');
    expect(start().disabled).toBe(true);
    // The docked alert is the reducer's, after a click; this is the form's own, before one.
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe("the rest of the CLI's `new` in the form (M9-S8, the epic's §3)", () => {
  test("a Background chosen for the Guild and the Guildmaster's Appearance start the game with them, as `--background` and `--appearance` do", () => {
    const { play } = form();
    named();
    const background = document.querySelector<HTMLSelectElement>('select[name="backgroundKey"]');
    if (background === null) throw new Error('no Background');
    expect(background.selectedOptions[0]?.textContent).toBe('Drawn from the seed');
    const chosen = Array.from(background.options).find((option) => option.value !== '');
    if (chosen === undefined) throw new Error('no Background to choose');

    fireEvent.change(background, { target: { value: chosen.value } });
    fireEvent.change(within(setup()).getByLabelText('Appearance'), { target: { value: '  Tall, grey at the temples.  ' } });
    fireEvent.click(start());

    // The engine trims the texts (DL-102 item 6); the form sends them as written.
    expect(play.mock.calls[0]?.[0]).toMatchObject({
      backgroundKey: chosen.value,
      guildmasterAppearance: '  Tall, grey at the temples.  ',
    });
  });
});
