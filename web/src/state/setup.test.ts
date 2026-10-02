import { createWorld, defaultConfig, portraitFit, type DescriptiveAttribute, type Sex } from '@heroesim/engine';
import { describe, expect, test } from 'vitest';
import { content } from '../content';
import { capitalised } from './names';
import type { NewGame } from './reducer';
import {
  givenTexts,
  guildmasterPreview,
  guildmasterPreviewView,
  noTexts,
  portraitChoices,
  portraitFitWords,
  portraitGrid,
  portraitPick,
  setupFormChoices,
  setupNotice,
  setupRefusalWords,
  startingStats,
  statPicksView,
  statsWords,
  traitPicksView,
  textsView,
  textsWritten,
  textTyped,
  unchosenWords,
  unseededWords,
  unsexedGridWords,
  writtenDescription,
  type SetupFields,
  type SetupWay,
  type TextsHeld,
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

/** The preview's words for `setup` and `seed`, from the engine's preview, as the form makes them with `way`. */
function previewOf(setup: SetupFields, seed: string, way: SetupWay = 'for-me') {
  return guildmasterPreviewView(guildmasterPreview(setup, seed), seed, way);
}

/** The texts written for `setup` and `seed`, from the engine's preview, as the form writes them. */
function writtenOf(setup: SetupFields, seed: string, n: number, given: Partial<Record<DescriptiveAttribute, string>> = {}) {
  return writtenDescription(guildmasterPreview(setup, seed), seed, n, given);
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

  // v1.1.4-S11 (DL-149 items 3 and 4): "Choose myself" holds "Start the game" until the sex, the age and a
  // picture are chosen, after the names; the engine would draw them, so the hold is the form's.
  test('with "Choose myself", holds the start until the sex, the age and a picture are chosen, saying which', () => {
    const empty: NewGame = { ...play, guildName: '', guildmasterName: '' };
    const all = ['sex', 'age', 'portrait'] as const;

    expect(unchosenWords(all)).toBe("Choose your Guildmaster's Sex, Age and Portrait to start.");
    expect(unchosenWords(['age', 'portrait'])).toBe("Choose your Guildmaster's Age and Portrait to start.");
    expect(unchosenWords(['portrait'])).toBe("Choose your Guildmaster's Portrait to start.");
    expect(unchosenWords([])).toBeNull();
    // The names first, as a hint and then as the refusal; then what is still to choose, as a hint.
    expect(setupNotice(empty, false, all)).toEqual({ kind: 'hint', words: 'Name your Guild and its Guildmaster to start.' });
    expect(setupNotice(empty, true, all)).toEqual({ kind: 'refusal', words: 'The Guild needs a name.' });
    expect(setupNotice(play, true, all)).toEqual({ kind: 'hint', words: "Choose your Guildmaster's Sex, Age and Portrait to start." });
    expect(setupNotice(play, false, ['sex'])).toEqual({ kind: 'hint', words: "Choose your Guildmaster's Sex to start." });
    expect(setupNotice(play, true, [])).toBeNull();
    // An engine refusal of a choice stands before the hold.
    expect(setupNotice({ ...play, guildmasterTraitKeys: ['thrifty'] }, true, ['portrait'])?.kind).toBe('refusal');
  });
});

// v1.1.4-S11 (DL-149 item 5): the five Guildmaster Stats set within the Stat points, each step the
// engine's verdict, and what each does in the Guildmaster view's words.
describe('the Stats "Choose myself" sets, within the Stat points (v1.1.4-S11)', () => {
  const play: NewGame = { kind: 'newGame', seed: 'setup', guildName: 'The Lantern', guildmasterName: 'Ada Vell', createdAt: '' };

  test("start at 10 each, all 50 Stat points spent, each said in the Guildmaster view's words, in its order", () => {
    const view = statPicksView(startingStats());

    expect(startingStats()).toEqual({ inspiration: 10, influence: 10, negotiation: 10, coaching: 10, judgement: 10 });
    expect(view.points).toEqual({
      points: 50,
      spent: 50,
      left: 0,
      over: false,
      leftWords: 'Stat points left: 0',
      spentWords: 'The Stats spend 50 of 50 Stat points.',
      unspentWords: null,
    });
    expect(view.stats.map(({ name, value, min, max, bearsOn }) => [name, value, min, max, bearsOn])).toEqual([
      ['Inspiration', 10, 5, 15, 'The Morale baseline of the Heroes'],
      ['Influence', 10, 5, 15, "The Regard a Patron's Quest earns"],
      ['Negotiation', 10, 5, 15, 'The reward agreed and the fees paid'],
      ['Coaching', 10, 5, 15, 'The XP of the training yard'],
      ['Judgement', 10, 5, 15, 'How sharp the Potential hints read'],
    ]);
    // With every point spent, none can be raised until one is lowered.
    expect(view.stats.every((pick) => !pick.canRaise && pick.canLower)).toBe(true);
    expect(statsWords()).toBe('Each 5 to 15, sharing 50 Stat points; each starts at 10.');
  });

  test('a point taken from one may be given to another, never past 15 or below 5, and points left unspent are noted as lost', () => {
    const lowered = statPicksView({ ...startingStats(), coaching: 5 });
    expect(lowered.points).toMatchObject({ left: 5, leftWords: 'Stat points left: 5', unspentWords: 'Stat points left unspent are lost.' });
    expect(lowered.stats.find((pick) => pick.key === 'coaching')).toMatchObject({ canLower: false, canRaise: true });
    expect(lowered.stats.find((pick) => pick.key === 'negotiation')).toMatchObject({ canLower: true, canRaise: true });

    const best = { inspiration: 10, influence: 15, negotiation: 15, coaching: 5, judgement: 5 };
    const top = statPicksView(best);
    expect(top.points.left).toBe(0);
    expect(top.stats.find((pick) => pick.key === 'negotiation')).toMatchObject({ value: 15, canRaise: false, canLower: true });
    // Unspent points are allowed: the game starts with them.
    expect(setupRefusalWords({ ...play, guildmasterStats: { ...best, inspiration: 5 } })).toBeNull();
    expect(setupRefusalWords({ ...play, guildmasterStats: best })).toBeNull();
  });

  test('marks the points overspent, as the engine refuses them, and says each refusal of the Stats in words', () => {
    expect(statPicksView({ ...startingStats(), negotiation: 12 }).points).toMatchObject({ over: true, leftWords: 'Over the Stat points by 2' });
    expect(setupRefusalWords({ ...play, guildmasterStats: { ...startingStats(), negotiation: 12 } })).toBe(
      'Those Stats spend 52 points, and the Stat points are 50: lower one to raise another.',
    );
    expect(setupRefusalWords({ ...play, guildmasterStats: { ...startingStats(), coaching: 4 } })).toBe(
      "A Guildmaster's Coaching is 5 to 15 when chosen, in whole numbers; 4 is not.",
    );
    expect(setupRefusalWords({ ...play, guildmasterStats: { inspiration: 10, influence: 10, negotiation: 10 } })).toBe(
      'Every Guildmaster Stat is chosen, or none; Coaching and Judgement are not.',
    );
  });

  test('reads the bounds and the points from the config it is given', () => {
    const other = { ...defaultConfig, guildmasterStatMin: 8, guildmasterStatMax: 12, guildmasterStatPoints: 45 };
    expect(startingStats(content, other)).toEqual({ inspiration: 9, influence: 9, negotiation: 9, coaching: 9, judgement: 9 });
    expect(statPicksView(startingStats(content, other), content, other).stats[0]).toMatchObject({ min: 8, max: 12, canRaise: false });
    expect(statsWords(content, other)).toBe('Each 8 to 12, sharing 45 Stat points; each starts at 9.');
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

  test("offers content's pictures, each named by its sex and its place, by the sex chosen, or both with the sex drawn", () => {
    /** The 20 pictures of `sex` since v1.1.3-S4, as the form offers them. */
    const twenty = (sex: Sex, label: string) =>
      Array.from({ length: 20 }, (_, n) => ({ key: `gm-${sex}-${String(n + 1).padStart(2, '0')}`, sex, label: `${label} Portrait ${n + 1}` }));
    expect(portraitChoices(null)).toEqual([
      { sex: 'female', label: 'Female', pictures: twenty('female', 'Female') },
      { sex: 'male', label: 'Male', pictures: twenty('male', 'Male') },
    ]);
    expect(portraitChoices('male').map((group) => group.pictures.map((pick) => pick.key))).toEqual([content.portraits.guildmaster.male]);
    expect(portraitChoices('female').map((group) => group.pictures.map((pick) => pick.key))).toEqual([content.portraits.guildmaster.female]);
    // A sex with no picture has no group: a Silhouette is never offered (DL-125 item 3).
    const none = { female: [], male: [] };
    expect(portraitChoices(null, { ...content, portraits: { ...content.portraits, guildmaster: { ...none, male: ['gm-male-01'] } } })).toHaveLength(1);
    expect(portraitPick('gm-male-01')?.label).toBe('Male Portrait 1');
    expect(portraitPick('gm-male-09')?.label).toBe('Male Portrait 9');
    expect(portraitPick('gm-male-21')).toBeUndefined();
  });

  test('with "Choose for me", names the sex, age, Stats, Traits and Portrait "Start the game" makes, over many seeds', () => {
    const traitNames = (keys: readonly string[]) => keys.map((key) => content.traits[key]?.name);
    for (let n = 0; n < 40; n += 1) {
      const seed = `form-preview-${n}`;
      const guildmaster = made(seed, fields);
      const view = previewOf(fields, seed);
      if (guildmaster === undefined || view?.kind !== 'chosen') throw new Error(`${seed}: no preview`);
      expect(view.whoWords).toBe(`${guildmaster.sex === 'female' ? 'Female' : 'Male'}, ${guildmaster.ageAtEntry}`);
      const { inspiration, influence, negotiation, coaching, judgement } = guildmaster.stats;
      expect(view.statsWords).toBe(`Inspiration ${inspiration}, Influence ${influence}, Negotiation ${negotiation}, Coaching ${coaching} and Judgement ${judgement}`);
      const names = traitNames(guildmaster.traits);
      expect(view.traitsWords).toBe(names.length === 0 ? 'Traits: None' : `Traits: ${names.length === 1 ? names[0] : `${names[0]} and ${names[1]}`}`);
      // Chosen to fit them since v1.1.3-S5: a picture of the sex, named by its place in content's list,
      // or the Silhouette where none fits their age.
      const place = guildmaster.portraitKey === null ? 0 : content.portraits.guildmaster[guildmaster.sex].indexOf(guildmaster.portraitKey) + 1;
      expect(view.portrait).toEqual({
        sex: guildmaster.sex,
        portraitKey: guildmaster.portraitKey,
        words: guildmaster.portraitKey === null ? 'Portrait: None, the Silhouette' : `Portrait: ${guildmaster.sex === 'female' ? 'Female' : 'Male'} Portrait ${place}`,
      });
    }
  });

  test('with "Choose myself", says only the Traits chosen for the player, and nothing once they are chosen', () => {
    const mine = { ...fields, guildmasterSex: 'male', guildmasterAge: 40, guildmasterPortraitKey: 'gm-male-03', guildmasterStats: startingStats() } as const;
    const traits = made('seed-a', mine)?.traits ?? [];
    expect(previewOf(mine, 'seed-a', 'myself')).toEqual({
      kind: 'chosen',
      whoWords: null,
      statsWords: null,
      traitsWords: `Traits: ${traits.length === 0 ? 'None' : traits.map((key) => content.traits[key]?.name).join(' and ')}`,
      portrait: null,
    });
    expect(previewOf({ ...mine, guildmasterTraitKeys: [] }, 'seed-a', 'myself')).toBeNull();
    expect(previewOf({ ...mine, guildmasterTraitKeys: [] }, '  ', 'myself')).toBeNull();
    expect(previewOf(mine, '  ', 'myself')).toEqual({ kind: 'unseeded', words: unseededWords.myself });
  });

  test('follows the seed, says a blank one is made up at the start, and shows nothing while the engine would refuse', () => {
    const whoOf = (seed: string) => {
      const view = previewOf(fields, seed);
      return view?.kind === 'chosen' ? `${view.whoWords} ${view.statsWords}` : null;
    };
    expect(new Set(Array.from({ length: 20 }, (_, n) => whoOf(`follow-${n}`))).size).toBeGreaterThan(1);
    // The seed as the click sends it, trimmed.
    expect(previewOf(fields, '  follow-1  ')).toEqual(previewOf(fields, 'follow-1'));
    expect(previewOf(fields, '  ')).toEqual({ kind: 'unseeded', words: unseededWords['for-me'] });
    expect(unseededWords['for-me']).toBe('The seed is blank, so one is made up when the game starts, and your Guildmaster is chosen for you then.');
    expect(previewOf({ ...fields, guildmasterSex: 'female', guildmasterPortraitKey: 'gm-male-01' }, 'seed-a', 'myself')).toBeNull();
    // Before the names are typed, the preview shows: no name is drawn.
    expect(previewOf({ guildName: '', guildmasterName: '' }, 'seed-a')).toEqual(previewOf(fields, 'seed-a'));
  });

  test('a Portrait chosen starts the game with it, as `--portrait` does, and one of the other sex is refused in words', () => {
    const play: NewGame = { kind: 'newGame', seed: 's', createdAt: '', ...fields, guildmasterPortraitKey: 'gm-male-01' };
    expect(setupRefusalWords(play)).toBeNull();
    expect(made('s', { ...fields, guildmasterPortraitKey: 'gm-male-01' })).toMatchObject({ sex: 'male', portraitKey: 'gm-male-01' });
    expect(setupRefusalWords({ ...play, guildmasterSex: 'female' })).toBe("That Portrait is of a male Guildmaster, and your Guildmaster's Sex is female.");
  });
});

// v1.1.3-S7 (DL-134 items 7 and 9, DL-143): the setup grid, one sex's thumbnails at a time, since
// v1.1.4-S11 the sex chosen's and none before (DL-149 item 4), and `portraitFit`'s notes in words.
describe('the setup grid and the notes beside a Portrait chosen (v1.1.3-S7)', () => {
  const fields = { guildName: 'The Lantern', guildmasterName: 'Ada Vell' };

  test("shows no picture before a sex is chosen, saying so, and then that sex's pictures only, with no draw among them", () => {
    expect(portraitGrid(null)).toEqual({ sex: null, words: 'Choose a Sex to see the pictures.' });
    expect(unsexedGridWords).toBe('Choose a Sex to see the pictures.');
    for (const sex of ['female', 'male'] as const) {
      const grid = portraitGrid(sex);
      if (grid.sex === null) throw new Error('no pictures');
      expect(grid.sex).toBe(sex);
      expect(grid.pictures.map((pick) => pick.key)).toEqual(content.portraits.guildmaster[sex]);
      expect(grid.pictures.every((pick) => pick.sex === sex)).toBe(true);
    }
    // A sex with no picture offers none: a Silhouette is never offered (DL-125 item 3).
    const none = { female: [], male: [] };
    expect(portraitGrid('male', { ...content, portraits: { ...content.portraits, guildmaster: none } })).toEqual({ sex: 'male', pictures: [] });
  });

  /** A Guildmaster picture whose row `test` passes, and its row. */
  function pictureWhere(test: (row: { apparentAge: [number, number]; callings: string[] }) => boolean) {
    for (const sex of ['female', 'male'] as const) {
      for (const key of content.portraits.guildmaster[sex]) {
        const found = content.portraitAppearances.portraits[key];
        const row = found === undefined ? undefined : { apparentAge: found.apparentAge, callings: found.callings ?? [] };
        if (row !== undefined && test(row)) return { key, sex, row };
      }
    }
    throw new Error('no such picture in content');
  }

  test("notes in words a Portrait chosen that looks older or younger than the age chosen, as the engine's portraitFit does", () => {
    const youngest = Math.min(...setupFormChoices().ages);
    const older = pictureWhere((row) => row.apparentAge[0] > youngest);
    const setup = { ...fields, guildmasterPortraitKey: older.key, guildmasterAge: youngest, guildmasterTraitKeys: [] };
    expect(portraitFit({ ...setup, createdAt: '' }, 'fit-seed', { config: defaultConfig, content })).toHaveLength(1);
    expect(portraitFitWords(setup, 'fit-seed')).toEqual([
      `This Portrait looks ${older.row.apparentAge[0]} to ${older.row.apparentAge[1]}: older than your Guildmaster's ${youngest}.`,
    ]);
  });

  test('notes a Calling of the Portrait chosen that clashes with a Trait chosen, and nothing for one that fits', () => {
    const clashing = Object.entries(content.descriptions.callings).find(([, calling]) => calling.clashes.length > 0);
    if (clashing === undefined) throw new Error('no Calling clashes with a Trait');
    const [callingKey, calling] = clashing;
    const traitKey = calling.clashes[0] as string;
    const picture = pictureWhere((row) => row.callings.includes(callingKey));
    const ages = setupFormChoices().ages;
    const age = Math.min(Math.max(picture.row.apparentAge[0], Math.min(...ages)), Math.max(...ages));
    const setup = { ...fields, guildmasterPortraitKey: picture.key, guildmasterAge: age, guildmasterTraitKeys: [traitKey] };
    const words = portraitFitWords(setup, 'fit-seed');
    expect(words).toContain(`This Portrait's Calling, ${capitalised(callingKey)}, clashes with the Trait ${content.traits[traitKey]?.name}.`);
    expect(words).toHaveLength(portraitFit({ ...setup, createdAt: '' }, 'fit-seed', { config: defaultConfig, content }).length);

    // None while no Portrait is chosen, or the seed is blank; and none is a refusal.
    const unpictured: SetupFields = { ...setup };
    delete unpictured.guildmasterPortraitKey;
    expect(portraitFitWords(unpictured, 'fit-seed')).toEqual([]);
    expect(portraitFitWords(setup, ' ')).toEqual([]);
    expect(setupRefusalWords({ kind: 'newGame', seed: 'fit-seed', createdAt: '', ...setup })).toBeNull();
  });
});

// v1.1.2-S5 (DL-125 item 6): "Write them for me" and "Again", the engine's `describeGuildmaster` for
// the Guildmaster the form makes, whose facts are `previewGuildmaster`'s.
describe("the Guildmaster's texts written for the new-game form (v1.1.2-S5)", () => {
  const fields = { guildName: 'The Lantern', guildmasterName: 'Ada Vell' };

  function made(seed: string, setup: SetupFields) {
    const { world } = createWorld(seed, { ...setup, createdAt: '' }, { config: defaultConfig, content }).document;
    const guild = Object.values(world.guilds).find((each) => each.controller.kind === 'player');
    return guild === undefined ? undefined : { guild, guildmaster: world.guildmasters[guild.guildmasterId] };
  }

  test('writes, with n 0, what "Start the game" writes for the three left blank, for the Guildmaster the seed draws, over many seeds', () => {
    for (let n = 0; n < 40; n += 1) {
      const seed = `form-written-${n}`;
      for (const setup of [fields, { ...fields, guildmasterSex: 'male' as const, guildmasterAge: 44 }, { ...fields, backgroundKey: 'breakaway' }]) {
        const written = writtenOf(setup, seed, 0);
        const guildmaster = made(seed, setup)?.guildmaster;
        if (written === null || guildmaster === undefined) throw new Error(`${seed}: nothing written`);
        expect(written.texts).toEqual({ birthplace: guildmaster.birthplace, appearance: guildmaster.appearance, biography: guildmaster.biography });
        expect(written.words).toBe(`Written for a ${guildmaster.sex} Guildmaster of ${guildmaster.ageAtEntry}.`);
      }
    }
  });

  test("with every picture mapped, the Appearance is the Portrait's narrative; \"Again\" writes the rest anew", () => {
    const first = writtenOf(fields, 'again-seed', 0);
    const again = [1, 2, 3, 4].map((n) => writtenOf(fields, 'again-seed', n));
    const key = made('again-seed', fields)?.guildmaster?.portraitKey ?? null;
    expect(key).not.toBeNull();
    const narrative = content.portraitAppearances.portraits[key ?? '']?.narrative;
    expect(narrative).toBeDefined();
    for (const each of [first, ...again]) expect(each?.texts.appearance).toBe(narrative);
    expect(new Set([first, ...again].map((each) => each?.texts.biography)).size).toBeGreaterThan(3);
    expect(writtenOf(fields, 'again-seed', 3)).toEqual(again[2]);
  });

  test('reads neither name nor any text typed, trims the seed, and writes nothing for a blank seed or a setup the engine refuses', () => {
    const typed = { ...fields, guildmasterName: '', guildmasterBirthplace: 'x'.repeat(99), guildmasterBiography: 'Mine.' };
    expect(writtenOf(typed, ' seed-a ', 1)).toEqual(writtenOf(fields, 'seed-a', 1));
    expect(writtenOf(fields, '  ', 0)).toBeNull();
    expect(writtenOf({ ...fields, guildmasterTraitKeys: ['well-liked'] }, 'seed-a', 0)).toBeNull();
    // Whether there is a Guildmaster to write for is whether the engine previews one.
    expect(guildmasterPreview({ ...fields, guildmasterTraitKeys: ['well-liked'] }, 'seed-a')).toBeNull();
    expect(guildmasterPreview(typed, 'seed-a')).not.toBeNull();
  });
});

// v1.1.2-S6 (the review's F and I): the form asks the engine once for the Guildmaster it makes, and reads
// from that preview what the seed draws and the first texts written, computing no rule of its own.
describe("the new-game form's preview, read from the engine's (v1.1.2-S6)", () => {
  const fields = { guildName: 'The Lantern', guildmasterName: 'Ada Vell' };

  test("says what is chosen for the player as the engine's preview says it, not by the fields left blank", () => {
    const preview = guildmasterPreview(fields, 'seed-a');
    if (preview === null) throw new Error('no preview');
    const nothing = { sex: false, age: false, traits: false, portrait: false, stats: false };
    expect(guildmasterPreviewView({ ...preview, drawn: nothing }, 'seed-a', 'myself')).toBeNull();
    expect(guildmasterPreviewView({ ...preview, drawn: { ...nothing, traits: true } }, 'seed-a', 'myself')).toMatchObject({
      kind: 'chosen',
      whoWords: null,
      portrait: null,
    });
    expect(guildmasterPreviewView(null, 'seed-a', 'for-me')).toBeNull();
  });

  test('writes the first texts from the preview, as "Start the game" would, and asks the engine again only for "Again"', () => {
    const preview = guildmasterPreview(fields, 'seed-a');
    if (preview === null) throw new Error('no preview');
    const description = { birthplace: 'Here', appearance: 'Tall.', biography: 'Born.' };
    expect(writtenDescription({ ...preview, description }, 'seed-a', 0)?.texts).toEqual(description);
    expect(writtenDescription({ ...preview, description }, 'seed-a', 1)?.texts).not.toEqual(description);
    expect(writtenDescription(preview, '  ', 0)).toBeNull();
  });
});

// v1.1.2-S6 (the review's B and C): "Write them for me" and "Again" fill only the fields left blank or
// still as written, and a field still as written follows the Guildmaster when the facts change; the
// player's own words are kept, and the note says when they were written for another Guildmaster.
describe("the Guildmaster's texts held by the new-game form (v1.1.2-S6)", () => {
  const fields = { guildName: 'The Lantern', guildmasterName: 'Ada Vell' };
  const written = (setup: SetupFields, n: number, seed = 'held-seed', given: Partial<Record<DescriptiveAttribute, string>> = {}) =>
    writtenOf(setup, seed, n, given);
  // As the form does: the writing for the texts the player gave.
  const valuesOf = (held: TextsHeld, setup: SetupFields = fields, seed = 'held-seed') =>
    textsView(held, held.n === null ? null : written(setup, held.n, seed, givenTexts(held))).values;

  test('before anything is written, the fields hold what the player types, and nothing is said', () => {
    const typed = textTyped(noTexts, 'biography', 'Mine.', null);
    expect(textsView(typed, null)).toEqual({ values: { birthplace: '', appearance: '', biography: 'Mine.' }, words: null });
  });

  test('"Write them for me" fills the blanks and keeps what the player typed; "Again" rewrites only what is still as written', () => {
    const typed = textTyped(noTexts, 'biography', 'Kept the toll bridge.', null);
    const first = textsWritten(typed, 0);
    expect(valuesOf(first)).toEqual({ ...written(fields, 0)?.texts, biography: 'Kept the toll bridge.' });

    const again = textsWritten(first, 1);
    expect(valuesOf(again)).toEqual({ ...written(fields, 1)?.texts, biography: 'Kept the toll bridge.' });

    // A field the player cleared is blank, and is written again.
    const cleared = textTyped(again, 'biography', '  ', written(fields, 1));
    expect(valuesOf(textsWritten(cleared, 2))).toEqual(written(fields, 2)?.texts);
  });

  test('a field typed back to the text written is as written again, and follows the writing', () => {
    const shown = written(fields, 0);
    const edited = textTyped(textsWritten(noTexts, 0), 'birthplace', 'Elsewhere', shown);
    const held = textTyped(edited, 'birthplace', shown?.texts.birthplace ?? '', shown);
    expect(held.typed).toEqual({});
    expect(valuesOf(textsWritten(held, 1))).toEqual(written(fields, 1)?.texts);
  });

  test('when the facts change, the fields still as written are written for the new Guildmaster, and the note says for whom', () => {
    const held = textsWritten(noTexts, 0);
    const female = { ...fields, guildmasterSex: 'female' as const, guildmasterAge: 34 };
    const male = { ...fields, guildmasterSex: 'male' as const, guildmasterAge: 48 };
    expect(valuesOf(held, female)).toEqual(written(female, 0)?.texts);
    expect(valuesOf(held, male)).toEqual(written(male, 0)?.texts);
    expect(textsView(held, written(male, 0)).words).toBe('Written for a male Guildmaster of 48. Change them as you like.');
    // The Traits and the seed are facts too.
    const traits = { ...male, guildmasterTraitKeys: ['old-soldier'] };
    expect(valuesOf(held, traits)).toEqual(written(traits, 0)?.texts);
    expect(valuesOf(held, male, 'another-seed')).toEqual(written(male, 0, 'another-seed')?.texts);
  });

  test('a field the player changed is kept when the facts change, and the note says it was written for another Guildmaster', () => {
    const female = { ...fields, guildmasterSex: 'female' as const, guildmasterAge: 34 };
    const male = { ...fields, guildmasterSex: 'male' as const, guildmasterAge: 48 };
    const held = textTyped(textsWritten(noTexts, 0), 'biography', 'She kept the toll bridge.', written(female, 0));

    // Changed for the Guildmaster it was written for, it is only the player's.
    expect(textsView(held, written(female, 0)).words).toBe('Written for a female Guildmaster of 34. Change them as you like.');

    const view = textsView(held, written(male, 0));
    expect(view.values).toEqual({ ...written(male, 0)?.texts, biography: 'She kept the toll bridge.' });
    expect(view.words).toBe(
      'Written for a male Guildmaster of 48. The Biography was written for another Guildmaster, and is kept as you changed it.',
    );
    const both = textTyped(held, 'appearance', 'Tall.', written(female, 0));
    expect(textsView(both, written(male, 0)).words).toBe(
      'Written for a male Guildmaster of 48. The Appearance and the Biography were written for another Guildmaster, and are kept as you changed them.',
    );
    // Typed where nothing was written, a text is the player's own, for whomever the Guildmaster is.
    const own = textTyped(noTexts, 'birthplace', 'Kingsbridge', null);
    expect(textsView(textsWritten(own, 0), written(male, 0)).words).toBe('Written for a male Guildmaster of 48. Change them as you like.');
  });

  // The verification of the review's fixes: a Birthplace typed and a Biography written from another.
  test("a Birthplace the player typed is the Biography's too, and a Biography still as written follows it", () => {
    const drawn = written(fields, 0);
    if (drawn === null) throw new Error('nothing written');
    // Typed before "Write them for me".
    const before = textsWritten(textTyped(noTexts, 'birthplace', 'Kingsbridge', null), 0);
    expect(valuesOf(before)).toEqual({
      ...drawn.texts,
      birthplace: 'Kingsbridge',
      biography: drawn.texts.biography.replace(drawn.texts.birthplace, 'Kingsbridge'),
    });
    expect(valuesOf(before).biography).not.toContain(drawn.texts.birthplace);

    // Typed after it: the Biography still as written follows, and "Again" writes with it too.
    const after = textTyped(textsWritten(noTexts, 0), 'birthplace', 'Aldermoor', drawn);
    expect(valuesOf(after).biography).toBe(drawn.texts.biography.replace(drawn.texts.birthplace, 'Aldermoor'));
    expect(valuesOf(textsWritten(after, 1)).biography).toContain('Aldermoor');
    // The Birthplace is the player's, not written for another Guildmaster.
    expect(textsView(after, written(fields, 0, 'held-seed', givenTexts(after))).words).toBe(`${drawn.words} Change them as you like.`);

    // A Biography the player changed is kept, and once the Birthplace changes it was written for another.
    const mine = textTyped(after, 'biography', 'She kept the toll bridge.', written(fields, 0, 'held-seed', givenTexts(after)));
    const moved = textTyped(mine, 'birthplace', 'Elsewhere', written(fields, 0, 'held-seed', givenTexts(mine)));
    const view = textsView(moved, written(fields, 0, 'held-seed', givenTexts(moved)));
    expect(view.values.biography).toBe('She kept the toll bridge.');
    expect(view.words).toBe(`${drawn.words} The Biography was written for another Guildmaster, and is kept as you changed it.`);
    expect(givenTexts(textTyped(noTexts, 'birthplace', '  ', null))).toEqual({});
  });

  test('a field the player changes again once the facts have changed is theirs, and the note no longer names it', () => {
    const female = { ...fields, guildmasterSex: 'female' as const, guildmasterAge: 34 };
    const male = { ...fields, guildmasterSex: 'male' as const, guildmasterAge: 48 };
    const held = textTyped(textsWritten(noTexts, 0), 'biography', 'She kept the toll bridge.', written(female, 0));
    expect(textsView(held, written(male, 0)).words).toMatch(/The Biography was written for another Guildmaster/);

    const again = textTyped(held, 'biography', 'He kept the toll bridge.', written(male, 0));
    expect(textsView(again, written(male, 0)).words).toBe('Written for a male Guildmaster of 48. Change them as you like.');
    // And named again only if the facts change after that.
    expect(textsView(again, written(female, 0)).words).toMatch(/The Biography was written for another Guildmaster/);

    // Typed where nothing was written, a text stays the player's own however often it is changed.
    const own = textTyped(textsWritten(textTyped(noTexts, 'appearance', 'Tall.', null), 0), 'appearance', 'Very tall.', written(male, 0));
    expect(textsView(own, written(female, 0)).words).toBe('Written for a female Guildmaster of 34. Change them as you like.');
  });

  test("with all three the player's own, says none was written; with no Guildmaster to write for, says when they will be", () => {
    let held: TextsHeld = noTexts;
    for (const attribute of ['birthplace', 'appearance', 'biography'] as const) held = textTyped(held, attribute, 'Mine.', null);
    expect(textsView(textsWritten(held, 0), written(fields, 0)).words).toBe('All three are your own words, so none was written. Clear one to have it written.');
    expect(textsView(textsWritten(noTexts, 0), null)).toEqual({
      values: { birthplace: '', appearance: '', biography: '' },
      words: 'Nothing can be written for this Guildmaster yet. Any left blank are written when the game starts.',
    });
  });
});
