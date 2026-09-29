import { defaultConfig, type Sex } from '@heroesim/engine';
import { describe, expect, test } from 'vitest';
import { content } from '../content';
import type { NewGame } from './reducer';
import { setupFormChoices, setupNotice, setupRefusalWords, traitPicksView } from './setup';

// The new-game form's Guildmaster (M9-S7, #30): what each Trait costs and excludes, how it stands
// against those chosen, and the budget left, every judgement the engine's own. The values are
// DL-100 item 3's: a budget of 1 and at most 2 Traits; Well liked and Thrifty cost 2 and Old soldier
// 1; Miser and Spendthrift refund 2 and Mistrusts magic 1; Thrifty excludes Spendthrift, Well liked
// Miser, and Miser Spendthrift.

/** Each Trait's standing, by key. */
function standings(chosen: Parameters<typeof traitPicksView>[0]): Record<string, string> {
  return Object.fromEntries(traitPicksView(chosen).traits.map(({ key, standing }) => [key, standing]));
}

/** The Traits whose box can be ticked or unticked now, by key. */
function choosable(chosen: Parameters<typeof traitPicksView>[0]): string[] {
  return traitPicksView(chosen).traits.filter((trait) => trait.choosable).map(({ key }) => key);
}

describe("the Traits the new-game form offers, as they stand against those chosen (M9-S7)", () => {
  test('with none chosen, the whole budget is left, and the dearer buffs would pass it alone', () => {
    const view = traitPicksView([]);

    expect(view.budget).toEqual({
      budget: 1,
      spent: 0,
      left: 1,
      over: false,
      leftWords: 'Budget left: 1',
      costWords: 'No Trait is chosen; the budget is 1.',
    });
    expect(standings([])).toEqual({
      miser: 'open',
      'mistrusts-magic': 'open',
      'old-soldier': 'open',
      spendthrift: 'open',
      thrifty: 'over-budget',
      'well-liked': 'over-budget',
    });
    expect(view.traits.find(({ key }) => key === 'well-liked')).toMatchObject({
      name: 'Well liked',
      effect: 'Morale baseline +5',
      cost: 2,
      costWords: 'Costs 2',
      excludesWords: 'Excludes Miser',
      chosen: false,
      reason: 'Over the budget: with it, the Traits cost 2 and the budget is 1.',
    });
    expect(view.traits.find(({ key }) => key === 'miser')).toMatchObject({
      costWords: 'Refunds 2',
      excludesWords: 'Excludes Spendthrift and Well liked',
      standing: 'open',
      reason: null,
    });
    expect(view.traits.find(({ key }) => key === 'old-soldier')).toMatchObject({ costWords: 'Costs 1', excludesWords: null });
  });

  test('a penalty chosen refunds, leaving more than the budget, and excludes the Traits it cannot be held with', () => {
    const view = traitPicksView(['miser']);

    expect(view.budget).toMatchObject({
      spent: -2,
      left: 3,
      over: false,
      leftWords: 'Budget left: 3',
      costWords: 'The Traits chosen refund 2; the budget is 1.',
    });
    expect(standings(['miser'])).toEqual({
      miser: 'chosen',
      'mistrusts-magic': 'open',
      'old-soldier': 'open',
      spendthrift: 'excluded',
      thrifty: 'open',
      'well-liked': 'excluded',
    });
    expect(view.traits.find(({ key }) => key === 'miser')).toMatchObject({ chosen: true, reason: null });
    // An excluded Trait cannot be ticked until the one that excludes it is taken off; one chosen can always be.
    expect(choosable(['miser'])).toEqual(['miser', 'mistrusts-magic', 'old-soldier', 'thrifty']);
    expect(view.traits.find(({ key }) => key === 'well-liked')).toMatchObject({ chosen: false, reason: 'Excluded by Miser, which is chosen.' });
  });

  test('a buff chosen alone may pass the budget: it is over, and the penalties it can be held with would mend it', () => {
    const view = traitPicksView(['well-liked']);

    expect(view.budget).toMatchObject({
      spent: 2,
      left: -1,
      over: true,
      leftWords: 'Over the budget by 1',
      costWords: 'The Traits chosen cost 2; the budget is 1.',
    });
    expect(standings(['well-liked'])).toEqual({
      miser: 'excluded',
      'mistrusts-magic': 'open',
      'old-soldier': 'over-budget',
      spendthrift: 'open',
      thrifty: 'over-budget',
      'well-liked': 'chosen',
    });
    expect(view.traits.find(({ key }) => key === 'old-soldier')?.reason).toBe(
      'Over the budget: with it, the Traits cost 3 and the budget is 1.',
    );
    // Over the budget, a Trait can still be ticked: a penalty ticked after it may bring the cost back.
    expect(choosable(['well-liked'])).toEqual(['mistrusts-magic', 'old-soldier', 'spendthrift', 'thrifty', 'well-liked']);
  });

  test('with as many chosen as a Guildmaster holds, no other can be chosen, whatever else would hold', () => {
    const view = traitPicksView(['miser', 'thrifty']);

    expect(view.budget).toMatchObject({ spent: 0, left: 1, over: false });
    expect(standings(['miser', 'thrifty'])).toEqual({
      miser: 'chosen',
      'mistrusts-magic': 'at-most',
      'old-soldier': 'at-most',
      spendthrift: 'at-most',
      thrifty: 'chosen',
      'well-liked': 'at-most',
    });
    expect(view.traits.find(({ key }) => key === 'old-soldier')?.reason).toBe('2 Traits are chosen, the most a Guildmaster holds.');
    expect(choosable(['miser', 'thrifty'])).toEqual(['miser', 'thrifty']);
  });

  test('reads the budget and the most Traits from the config it is given', () => {
    const wider = { ...defaultConfig, guildmasterTraitBudget: 3, guildmasterTraitsMax: 3 };

    expect(traitPicksView(['well-liked'], content, wider).budget).toMatchObject({ budget: 3, left: 1, leftWords: 'Budget left: 1' });
    // Under the defaults it would pass the budget.
    expect(standings(['well-liked'])['old-soldier']).toBe('over-budget');
    expect(traitPicksView(['well-liked'], content, wider).traits.find(({ key }) => key === 'old-soldier')?.standing).toBe('open');
    expect(traitPicksView(['miser', 'thrifty'], content, wider).traits.find(({ key }) => key === 'old-soldier')?.standing).toBe('open');
  });
});

describe("what else the form offers for the Guildmaster, and the engine's refusal as a sentence (M9-S7)", () => {
  test('offers each sex by a word, each starting age, how the Traits are held, and each descriptive Attribute with its bound', () => {
    const choices = setupFormChoices();

    expect(choices.sexes).toEqual([
      { value: 'female', label: 'Female' },
      { value: 'male', label: 'Male' },
    ]);
    expect(choices.ages).toEqual([30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45]);
    expect(choices.agesWords).toBe('30 to 45');
    expect(choices.traitsWords).toBe('Up to 2 Traits, costing no more than the budget of 1 in all: a buff costs, and a penalty refunds.');
    expect(choices.attributes).toEqual([
      { attribute: 'birthplace', label: 'Birthplace', maxLength: 60, boundWords: 'At most 60 characters' },
      { attribute: 'appearance', label: 'Appearance', maxLength: 280, boundWords: 'At most 280 characters' },
      { attribute: 'biography', label: 'Biography', maxLength: 1000, boundWords: 'At most 1000 characters' },
    ]);
  });

  test('reads the ages and the Traits from the config it is given', () => {
    const other = { ...defaultConfig, guildmasterStartingAgeMin: 40, guildmasterStartingAgeMax: 42, guildmasterTraitBudget: 3, guildmasterTraitsMax: 1 };
    const choices = setupFormChoices(content, other);

    expect(choices.ages).toEqual([40, 41, 42]);
    expect(choices.traitsWords).toBe('Up to 1 Trait, costing no more than the budget of 3 in all: a buff costs, and a penalty refunds.');
  });

  const play: NewGame = { kind: 'newGame', seed: 'setup', guildName: 'The Lantern', guildmasterName: 'Ada Vell', createdAt: '2026-09-29T09:00:00.000Z' };

  test.each([
    ['nothing, for a setup that keeps the rules', {}, null],
    ['nothing, for one that sets everything within them', {
      guildmasterSex: 'male',
      guildmasterAge: 45,
      guildmasterTraitKeys: ['spendthrift', 'well-liked'],
      guildmasterBirthplace: 'Harrowgate',
    }, null],
    ['the blank Guild name', { guildName: '  ' }, 'The Guild needs a name.'],
    // The M9 review: a sex the form does not offer, refused in words rather than thrown.
    ['a sex that is not one', { guildmasterSex: 'other' as Sex }, `A Guildmaster's sex is female or male; "other" is not.`],
    [
      'Traits over the budget',
      { guildmasterTraitKeys: ['thrifty'] },
      'Those Traits cost 2 points and the budget is 1: a buff costs points and a penalty refunds them.',
    ],
    [
      'an excluded pair',
      { guildmasterTraitKeys: ['miser', 'well-liked'] },
      'Miser and Well liked exclude each other: a Guildmaster holds one or the other.',
    ],
    ['a Birthplace too long', { guildmasterBirthplace: 'x'.repeat(61) }, 'The Birthplace is 61 characters long; it holds at most 60.'],
  ] as const)("says %s: the engine's refusal in the page's words", (_name, change, sentence) => {
    expect(setupRefusalWords({ ...play, ...change })).toBe(sentence);
  });

  // DL-109 item 2, Q22: an empty form asks for the names before it refuses anything.
  test('before any field is touched, the form gives a hint in place of the refusal; after, the refusal, and nothing when the engine would start the game', () => {
    const empty: NewGame = { ...play, guildName: '', guildmasterName: '' };

    expect(setupNotice(empty, false)).toEqual({ kind: 'hint', words: 'Name your Guild and its Guildmaster to start.' });
    expect(setupNotice(empty, true)).toEqual({ kind: 'refusal', words: 'The Guild needs a name.' });
    expect(setupNotice({ ...empty, guildName: 'The Lantern' }, true)).toEqual({ kind: 'refusal', words: 'The Guildmaster needs a name.' });
    expect(setupNotice(play, true)).toBeNull();
    expect(setupNotice(play, false)).toBeNull();
  });
});

describe('when the Guildmaster retires, on the form (M9-F2, DL-113 item 5)', () => {
  test("says the age a Guildmaster retires at, the configuration's", () => {
    expect(setupFormChoices().retiresWords).toBe(`Retires at ${defaultConfig.guildmasterRetirementAge}`);
    expect(setupFormChoices(content, { ...defaultConfig, guildmasterRetirementAge: 70 }).retiresWords).toBe('Retires at 70');
  });
});
