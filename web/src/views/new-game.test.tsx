import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { App } from '../app';
import { media } from '../media';
import { createSaves } from '../saves';
import { memoryStore } from '../saves.test-support';
import type { GameAction } from '../state/reducer';
import { setupFormChoices } from '../state/setup';
import { NewGame } from './new-game';
import { openView } from './page.test-support';

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

/** A part of the Guildmaster's setup with its own legend: `Traits` or `Portrait`. */
function part(legend: 'Traits' | 'Portrait'): HTMLElement {
  return within(setup()).getByRole('group', { name: legend });
}

/** The Traits chosen rather than drawn, and the list of them. */
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
    for (const legend of ['Traits', 'Portrait'] as const) {
      expect((within(part(legend)).getByRole('radio', { name: 'Drawn from the seed' }) as HTMLInputElement).checked, legend).toBe(true);
    }
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
    fireEvent.click(within(part('Traits')).getByRole('radio', { name: 'Drawn from the seed' }));
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

describe('when the Guildmaster retires (M9-F2, DL-113 item 5)', () => {
  test('the Age field says the age a Guildmaster retires at, from the configuration', () => {
    form();
    const age = within(setup()).getByLabelText('Age');
    const said = (age.getAttribute('aria-describedby') ?? '')
      .split(' ')
      .map((id) => document.getElementById(id)?.textContent ?? '')
      .join(' ');

    expect(said).toContain(setupFormChoices().retiresWords);
    expect(setupFormChoices().retiresWords).toMatch(/^Retires at \d+$/);
  });
});

// v1.1.2-S4 (DL-125 items 3 and 6): the Portrait chosen from the owner's pictures, or drawn, and what the
// seed draws shown before "Start the game". The core has one picture of each sex.
describe("the Guildmaster's Portrait and what the seed draws, in the new-game form (v1.1.2-S4)", () => {
  /** The Portrait's radio buttons, by the words each is named by. */
  function portraitNames(): string[] {
    return within(part('Portrait'))
      .getAllByRole('radio')
      .map((radio) => (radio.closest('label')?.textContent ?? '').trim());
  }

  function portraitRadio(name: string): HTMLInputElement {
    return within(part('Portrait')).getByRole('radio', { name }) as HTMLInputElement;
  }

  function sexField(): HTMLSelectElement {
    return within(setup()).getByLabelText('Sex') as HTMLSelectElement;
  }

  function preview(): HTMLElement {
    return within(setup()).getByTestId('guildmaster-preview');
  }

  /** The preview's lines. */
  function lines(): string[] {
    return [...preview().querySelectorAll('p')].map((line) => line.textContent ?? '');
  }

  test('offers "Drawn from the seed", then a thumbnail of each picture of the sex, each a radio button with its picture as its label', () => {
    form();
    named();

    // With the sex drawn, every sex's pictures: choosing one chooses its sex.
    expect(portraitNames()).toEqual(['Drawn from the seed', 'Female Portrait 1', 'Male Portrait 1']);
    const female = portraitRadio('Female Portrait 1');
    const thumbnail = female.closest('label')?.querySelector('[data-testid="portrait-thumbnail"]');
    expect(thumbnail?.querySelector('img[data-picture="picture"]')?.getAttribute('src')).toBe(media.portrait('guildmaster', 'female', 'gm-female-01').picture);
    // The picture is its label for the eye; its name is said in words, whether the picture loads or not.
    expect(thumbnail?.getAttribute('aria-hidden')).toBe('true');

    fireEvent.change(sexField(), { target: { value: 'male' } });
    expect(portraitNames()).toEqual(['Drawn from the seed', 'Male Portrait 1']);
    fireEvent.change(sexField(), { target: { value: 'female' } });
    expect(portraitNames()).toEqual(['Drawn from the seed', 'Female Portrait 1']);
  });

  test('a Portrait chosen starts the game with it; with the sex drawn, choosing one chooses its sex, and every picture stays offered', () => {
    const { play } = form();
    named();

    fireEvent.click(portraitRadio('Female Portrait 1'));
    expect(sexField().value).toBe('female');
    // The other sex's pictures stay, so the arrow keys move through every one.
    expect(portraitNames()).toEqual(['Drawn from the seed', 'Female Portrait 1', 'Male Portrait 1']);
    fireEvent.click(portraitRadio('Male Portrait 1'));
    expect(portraitRadio('Male Portrait 1').checked).toBe(true);
    expect(sexField().value).toBe('male');
    fireEvent.click(start());
    expect(play.mock.calls[0]?.[0]).toMatchObject({ guildmasterSex: 'male', guildmasterPortraitKey: 'gm-male-01' });

    // The Portrait drawn again draws the sex again, which was only the Portrait's.
    fireEvent.click(portraitRadio('Drawn from the seed'));
    expect(sexField().value).toBe('');
    // A sex chosen in its own field stays when the Portrait is drawn again.
    fireEvent.change(sexField(), { target: { value: 'male' } });
    fireEvent.click(portraitRadio('Male Portrait 1'));
    fireEvent.click(portraitRadio('Drawn from the seed'));
    expect(sexField().value).toBe('male');
    expect(portraitNames()).toEqual(['Drawn from the seed', 'Male Portrait 1']);
  });

  test('changing the sex clears a Portrait of the other sex, and so does leaving the sex to the seed', () => {
    const { play } = form();
    named();
    fireEvent.change(sexField(), { target: { value: 'female' } });
    fireEvent.click(portraitRadio('Female Portrait 1'));
    fireEvent.change(within(setup()).getByLabelText('Age'), { target: { value: '30' } });
    expect(portraitRadio('Female Portrait 1').checked).toBe(true);

    fireEvent.change(sexField(), { target: { value: 'male' } });
    expect(portraitRadio('Drawn from the seed').checked).toBe(true);
    fireEvent.click(start());
    expect(play.mock.calls[0]?.[0]).toMatchObject({ guildmasterSex: 'male' });
    expect(play.mock.calls[0]?.[0]).not.toHaveProperty('guildmasterPortraitKey');

    fireEvent.click(portraitRadio('Male Portrait 1'));
    fireEvent.change(sexField(), { target: { value: '' } });
    expect(portraitRadio('Drawn from the seed').checked).toBe(true);
  });

  test('with the sex and age drawn, shows "Drawn: Female, 34", the drawn Traits and the Portrait, and follows the Seed field', () => {
    form();
    named();

    const [drawn, traits, portrait] = lines();
    expect(drawn).toMatch(/^Drawn: (Female|Male), \d\d$/);
    expect(traits).toMatch(/^Drawn Traits: /);
    const sex = drawn?.startsWith('Drawn: Female') === true ? 'female' : 'male';
    expect(portrait).toBe(`Drawn Portrait: ${sex === 'female' ? 'Female' : 'Male'} Portrait 1`);
    const figure = within(preview()).getByTestId('portrait');
    expect(within(figure).getByRole('img', { name: 'Portrait of Ada Vell' }).getAttribute('src')).toBe(
      media.portrait('guildmaster', sex, `gm-${sex}-01`).picture,
    );

    // Another seed draws another Guildmaster; the preview follows it as it is typed.
    const seen = new Set<string>();
    for (let n = 0; n < 12; n += 1) {
      fireEvent.change(screen.getByLabelText('Seed'), { target: { value: `follow-${n}` } });
      seen.add(lines().join(' | '));
    }
    expect(seen.size).toBeGreaterThan(1);

    fireEvent.change(screen.getByLabelText('Seed'), { target: { value: ' ' } });
    expect(preview().textContent).toBe('The seed is blank, so one is made up when the game starts, and what is left to it is drawn then.');
  });

  test('says only what is left to the seed, and nothing once everything is chosen', () => {
    form();
    named();
    fireEvent.change(sexField(), { target: { value: 'female' } });
    expect(lines()[0]).toMatch(/^Drawn: Age \d\d$/);
    expect(lines().at(-1)).toBe('Drawn Portrait: Female Portrait 1');

    fireEvent.click(portraitRadio('Female Portrait 1'));
    fireEvent.change(within(setup()).getByLabelText('Age'), { target: { value: '30' } });
    expect(lines()).toHaveLength(1);
    expect(lines()[0]).toMatch(/^Drawn Traits: /);
    expect(within(preview()).queryByTestId('portrait')).toBeNull();

    chooseTraits();
    expect(within(setup()).queryByTestId('guildmaster-preview')).toBeNull();
  });
});

// The journey (v1.1.2-S4): from the form's Portrait, or its preview, to the Guildmaster view.
describe('from the new-game form to the Guildmaster view (v1.1.2-S4)', () => {
  async function begin(): Promise<void> {
    fireEvent.click(start());
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Start the game' })).toBeNull());
    await waitFor(() => expect(document.querySelector('main')?.getAttribute('aria-busy')).toBe('false'));
  }

  function guildmasterPicture(): HTMLElement {
    return within(openView('Guildmaster')).getByRole('img', { name: 'Portrait of Ada Vell' });
  }

  test('a Portrait chosen is the one the Guildmaster view shows', async () => {
    render(<App />);
    named();
    fireEvent.click(within(part('Portrait')).getByRole('radio', { name: 'Female Portrait 1' }));
    await begin();

    expect(guildmasterPicture().getAttribute('src')).toBe(media.portrait('guildmaster', 'female', 'gm-female-01').picture);
    const terms = [...openView('Guildmaster').querySelectorAll('dt')].map((dt) => [dt.textContent, dt.nextElementSibling?.textContent]);
    expect(terms).toContainEqual(['Sex', 'Female']);
  });

  test('what the preview names is what "Start the game" makes: the sex, the age, the Traits and the Portrait', async () => {
    render(<App />);
    named();
    const [drawn = '', traits = '', portrait = ''] = [...within(setup()).getByTestId('guildmaster-preview').querySelectorAll('p')].map(
      (line) => line.textContent ?? '',
    );
    const [, sexWord = '', age = ''] = /^Drawn: (Female|Male), (\d+)$/.exec(drawn) ?? [];
    const sex = sexWord === 'Female' ? 'female' : 'male';
    await begin();

    const view = openView('Guildmaster');
    const terms = [...view.querySelectorAll('dt')].map((dt) => [dt.textContent, dt.nextElementSibling?.textContent]);
    expect(terms).toContainEqual(['Sex', sexWord]);
    expect(terms).toContainEqual(['Age', age]);
    const held = within(view).queryByRole('list', { name: "Ada Vell's Traits" });
    const names = held === null ? [] : within(held).getAllByRole('listitem').map((item) => item.querySelector('.chip')?.textContent ?? '');
    expect(traits).toBe(`Drawn Traits: ${names.length === 0 ? 'None' : names.join(' and ')}`);
    expect(portrait).toBe(`Drawn Portrait: ${sexWord} Portrait 1`);
    expect(guildmasterPicture().getAttribute('src')).toBe(media.portrait('guildmaster', sex, `gm-${sex}-01`).picture);
  });
});
