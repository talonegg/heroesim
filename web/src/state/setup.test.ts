import { createWorld, defaultConfig, type DescriptiveAttribute, type Sex } from '@heroesim/engine';
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
  portraitPick,
  setupFormChoices,
  setupNotice,
  setupRefusalWords,
  traitPicksView,
  textsView,
  textsWritten,
  textTyped,
  unseededWords,
  writtenDescription,
  type SetupFields,
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

/** The preview's words for `setup` and `seed`, from the engine's preview, as the form makes them. */
function previewOf(setup: SetupFields, seed: string) {
  return guildmasterPreviewView(guildmasterPreview(setup, seed), seed);
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
      const view = previewOf(fields, seed);
      if (guildmaster === undefined || view?.kind !== 'drawn') throw new Error(`${seed}: no preview`);
      expect(view.drawnWords).toBe(`Drawn: ${guildmaster.sex === 'female' ? 'Female' : 'Male'}, ${guildmaster.ageAtEntry}`);
      const names = traitNames(guildmaster.traits);
      expect(view.traitsWords).toBe(names.length === 0 ? 'Drawn Traits: None' : `Drawn Traits: ${names.length === 1 ? names[0] : `${names[0]} and ${names[1]}`}`);
      // Chosen to fit them since v1.1.3-S5: the core's one picture of the sex, or the Silhouette where
      // it does not fit their age.
      expect(view.portrait).toEqual({
        sex: guildmaster.sex,
        portraitKey: guildmaster.portraitKey,
        words:
          guildmaster.portraitKey === null
            ? 'Drawn Portrait: None: the Silhouette'
            : `Drawn Portrait: ${guildmaster.sex === 'female' ? 'Female' : 'Male'} Portrait 1`,
      });
    }
  });

  test('says only what is drawn: the age alone, the sex alone, or nothing at all when everything is chosen', () => {
    const chosenSex = previewOf({ ...fields, guildmasterSex: 'male' }, 'seed-a');
    expect(chosenSex).toMatchObject({ kind: 'drawn', drawnWords: `Drawn: Age ${made('seed-a', { ...fields, guildmasterSex: 'male' })?.ageAtEntry}` });
    expect(chosenSex?.kind === 'drawn' && chosenSex.portrait?.words).toBe('Drawn Portrait: Male Portrait 1');

    const chosenAge = previewOf({ ...fields, guildmasterAge: 40, guildmasterTraitKeys: [] }, 'seed-a');
    expect(chosenAge).toMatchObject({ kind: 'drawn', drawnWords: `Drawn: ${capitalised(made('seed-a', fields)?.sex ?? '')}`, traitsWords: null });

    // A Portrait chosen chooses its sex: nothing of the sex is drawn, and no Portrait.
    const pictured = previewOf({ ...fields, guildmasterPortraitKey: 'gm-female-01', guildmasterAge: 30 }, 'seed-a');
    expect(pictured).toMatchObject({ kind: 'drawn', drawnWords: null, portrait: null });

    const all = { ...fields, guildmasterSex: 'female', guildmasterAge: 30, guildmasterTraitKeys: [], guildmasterPortraitKey: 'gm-female-01' } as const;
    expect(previewOf(all, 'seed-a')).toBeNull();
  });

  test('follows the seed, says a blank one is made up at the start, and shows nothing while the engine would refuse', () => {
    const drawnOf = (seed: string) => {
      const view = previewOf(fields, seed);
      return view?.kind === 'drawn' ? view.drawnWords : null;
    };
    expect(new Set(Array.from({ length: 20 }, (_, n) => drawnOf(`follow-${n}`))).size).toBeGreaterThan(1);
    // The seed as the click sends it, trimmed.
    expect(previewOf(fields, '  follow-1  ')).toEqual(previewOf(fields, 'follow-1'));
    expect(previewOf(fields, '  ')).toEqual({ kind: 'unseeded', words: unseededWords });
    expect(previewOf({ ...fields, guildmasterSex: 'female', guildmasterPortraitKey: 'gm-male-01' }, 'seed-a')).toBeNull();
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

  test("with the owner's pictures mapped, the Appearance is the Portrait's narrative; \"Again\" writes the rest anew", () => {
    const first = writtenOf(fields, 'again-seed', 0);
    const again = [1, 2, 3, 4].map((n) => writtenOf(fields, 'again-seed', n));
    const sex = made('again-seed', fields)?.guildmaster?.sex ?? 'female';
    const narrative = content.portraitAppearances.portraits[`gm-${sex}-01`]?.narrative;
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

  test("says what is drawn as the engine's preview says it, not by the fields left blank", () => {
    const preview = guildmasterPreview(fields, 'seed-a');
    if (preview === null) throw new Error('no preview');
    const nothing = { sex: false, age: false, traits: false, portrait: false };
    expect(guildmasterPreviewView({ ...preview, drawn: nothing }, 'seed-a')).toBeNull();
    expect(guildmasterPreviewView({ ...preview, drawn: { ...nothing, age: true } }, 'seed-a')).toMatchObject({
      kind: 'drawn',
      drawnWords: `Drawn: Age ${preview.age}`,
      traitsWords: null,
      portrait: null,
    });
    expect(guildmasterPreviewView(null, 'seed-a')).toBeNull();
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
