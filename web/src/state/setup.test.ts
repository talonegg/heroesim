import { createWorld, defaultConfig, type Sex } from '@heroesim/engine';
import { describe, expect, test } from 'vitest';
import { content } from '../content';
import { capitalised } from './names';
import type { NewGame } from './reducer';
import {
  guildmasterPreviewView,
  portraitChoices,
  portraitPick,
  setupFormChoices,
  setupNotice,
  setupRefusalWords,
  traitPicksView,
  unseededWords,
  type SetupFields,
} from './setup';

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
    // The rules' range, 21 to 50 from M9-F1 (DL-113 item 4), read from the config.
    const { guildmasterStartingAgeMin: min, guildmasterStartingAgeMax: max } = defaultConfig;
    expect(choices.ages).toEqual(Array.from({ length: max - min + 1 }, (_, index) => min + index));
    expect(choices.agesWords).toBe(`${min} to ${max}`);
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
    ['a sex that is not one', { guildmasterSex: 'other' as Sex }, `A Guildmaster's Sex is female or male; "other" is not.`],
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

// v1.1.2-S4 (DL-125 items 3 and 6): the Portraits the form offers, and what the seed draws.
describe("the Guildmaster's Portrait and the preview on the form (v1.1.2-S4)", () => {
  const fields = { guildName: 'The Lantern', guildmasterName: 'Ada Vell' };

  /** What "Start the game" makes of the Guildmaster, from the engine's world. */
  function made(seed: string, setup: SetupFields) {
    const { world } = createWorld(seed, { ...setup, createdAt: '' }, { config: defaultConfig, content }).document;
    const guild = Object.values(world.guilds).find((each) => each.controller.kind === 'player');
    return guild === undefined ? undefined : world.guildmasters[guild.guildmasterId];
  }

  test("offers the owner's two pictures, each named by its sex and its place, by the sex chosen, or both with the sex drawn", () => {
    expect(portraitChoices(null)).toEqual([
      { sex: 'female', label: 'Female', pictures: [{ key: 'gm-female-01', sex: 'female', label: 'Female Portrait 1' }] },
      { sex: 'male', label: 'Male', pictures: [{ key: 'gm-male-01', sex: 'male', label: 'Male Portrait 1' }] },
    ]);
    expect(portraitChoices('male').map((group) => group.pictures.map((pick) => pick.key))).toEqual([['gm-male-01']]);
    expect(portraitChoices('female').map((group) => group.pictures.map((pick) => pick.key))).toEqual([['gm-female-01']]);
    // A sex with no picture has no group: a Silhouette is never offered (DL-125 item 3).
    const none = { female: [], male: [] };
    expect(portraitChoices(null, { ...content, portraits: { ...content.portraits, guildmaster: { ...none, male: ['gm-male-01'] } } })).toHaveLength(1);
    expect(portraitPick('gm-male-01')?.label).toBe('Male Portrait 1');
    expect(portraitPick('gm-male-09')).toBeUndefined();
  });

  test('names the sex, age, Traits and Portrait "Start the game" makes, over many seeds, each line only for what is drawn', () => {
    const traitNames = (keys: readonly string[]) => keys.map((key) => content.traits[key]?.name);
    for (let n = 0; n < 40; n += 1) {
      const seed = `form-preview-${n}`;
      const guildmaster = made(seed, fields);
      const view = guildmasterPreviewView(fields, seed);
      if (guildmaster === undefined || view?.kind !== 'drawn') throw new Error(`${seed}: no preview`);
      expect(view.drawnWords).toBe(`Drawn: ${guildmaster.sex === 'female' ? 'Female' : 'Male'}, ${guildmaster.ageAtEntry}`);
      const names = traitNames(guildmaster.traits);
      expect(view.traitsWords).toBe(names.length === 0 ? 'Drawn Traits: None' : `Drawn Traits: ${names.length === 1 ? names[0] : `${names[0]} and ${names[1]}`}`);
      expect(view.portrait).toEqual({
        sex: guildmaster.sex,
        portraitKey: guildmaster.portraitKey,
        words: `Drawn Portrait: ${guildmaster.sex === 'female' ? 'Female' : 'Male'} Portrait 1`,
      });
    }
  });

  test('says only what is drawn: the age alone, the sex alone, or nothing at all when everything is chosen', () => {
    const chosenSex = guildmasterPreviewView({ ...fields, guildmasterSex: 'male' }, 'seed-a');
    expect(chosenSex).toMatchObject({ kind: 'drawn', drawnWords: `Drawn: Age ${made('seed-a', { ...fields, guildmasterSex: 'male' })?.ageAtEntry}` });
    expect(chosenSex?.kind === 'drawn' && chosenSex.portrait?.words).toBe('Drawn Portrait: Male Portrait 1');

    const chosenAge = guildmasterPreviewView({ ...fields, guildmasterAge: 40, guildmasterTraitKeys: [] }, 'seed-a');
    expect(chosenAge).toMatchObject({ kind: 'drawn', drawnWords: `Drawn: ${capitalised(made('seed-a', fields)?.sex ?? '')}`, traitsWords: null });

    // A Portrait chosen chooses its sex: nothing of the sex is drawn, and no Portrait.
    const pictured = guildmasterPreviewView({ ...fields, guildmasterPortraitKey: 'gm-female-01', guildmasterAge: 30 }, 'seed-a');
    expect(pictured).toMatchObject({ kind: 'drawn', drawnWords: null, portrait: null });

    const all = { ...fields, guildmasterSex: 'female', guildmasterAge: 30, guildmasterTraitKeys: [], guildmasterPortraitKey: 'gm-female-01' } as const;
    expect(guildmasterPreviewView(all, 'seed-a')).toBeNull();
  });

  test('follows the seed, says a blank one is made up at the start, and shows nothing while the engine would refuse', () => {
    const drawnOf = (seed: string) => {
      const view = guildmasterPreviewView(fields, seed);
      return view?.kind === 'drawn' ? view.drawnWords : null;
    };
    expect(new Set(Array.from({ length: 20 }, (_, n) => drawnOf(`follow-${n}`))).size).toBeGreaterThan(1);
    // The seed as the click sends it, trimmed.
    expect(guildmasterPreviewView(fields, '  follow-1  ')).toEqual(guildmasterPreviewView(fields, 'follow-1'));
    expect(guildmasterPreviewView(fields, '  ')).toEqual({ kind: 'unseeded', words: unseededWords });
    expect(guildmasterPreviewView({ ...fields, guildmasterSex: 'female', guildmasterPortraitKey: 'gm-male-01' }, 'seed-a')).toBeNull();
    // Before the names are typed, the preview shows: no name is drawn.
    expect(guildmasterPreviewView({ guildName: '', guildmasterName: '' }, 'seed-a')).toEqual(guildmasterPreviewView(fields, 'seed-a'));
  });

  test('a Portrait chosen starts the game with it, as `--portrait` does, and one of the other sex is refused in words', () => {
    const play: NewGame = { kind: 'newGame', seed: 's', createdAt: '', ...fields, guildmasterPortraitKey: 'gm-male-01' };
    expect(setupRefusalWords(play)).toBeNull();
    expect(made('s', { ...fields, guildmasterPortraitKey: 'gm-male-01' })).toMatchObject({ sex: 'male', portraitKey: 'gm-male-01' });
    expect(setupRefusalWords({ ...play, guildmasterSex: 'female' })).toBe("That Portrait is of a male Guildmaster, and your Guildmaster's Sex is female.");
  });
});
