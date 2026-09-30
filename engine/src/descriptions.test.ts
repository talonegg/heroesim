import { describe, expect, test } from 'vitest';
import { createWorld, previewGuildmaster, type WorldSetup } from './create.js';
import { biographyTraitSentences, describeBlanks, describeGuildmaster, type DescribeRequest } from './descriptions.js';
import { descriptiveAttributeMaxLength, descriptiveAttributes, makeId, type Guild, type Guildmaster, type WorldDocument } from './document.js';
import { streamNames } from './rng.js';
import { deepFreeze, testDeps, testWorld } from './world.test-support.js';

// A Guildmaster described (v1.1.2-S5; DL-125 item 6, DL-127 item 4): `describeGuildmaster` for a front
// end's "Write them for me" and "Again", and every blank written as a Guildmaster enters play, on the
// stream `descriptions`, in draws that never depend on what is written.

const deps = testDeps();
const playerId = makeId('guilds', 1);
const setup: WorldSetup = { guildmasterName: 'Aldith Barrowby', guildName: 'The Salt Road Guild', createdAt: 'harness' };
const seeds = Array.from({ length: 60 }, (_, n) => `described-${n}`);

function guildmasterOf(document: WorldDocument, guildId = playerId): Guildmaster {
  const guild = document.world.guilds[guildId] as Guild;
  return document.world.guildmasters[guild.guildmasterId] as Guildmaster;
}

const request: DescribeRequest = {
  seed: 'amber-fox',
  n: 0,
  sex: 'male',
  age: 30,
  backgroundKey: 'old-charter',
  traitKeys: ['old-soldier', 'thrifty'],
  portraitKey: null,
};

describe('describeGuildmaster', () => {
  test('is pure: the same for the same inputs, and changes nothing it is given', () => {
    const frozen = deepFreeze({ ...request, traitKeys: [...request.traitKeys] });
    expect(describeGuildmaster(frozen, deps)).toEqual(describeGuildmaster(frozen, deps));
  });

  test("with n 0, writes what a new game from the seed writes for its player's Guildmaster left blank", () => {
    for (const seed of seeds) {
      for (const chosen of [{}, { guildmasterSex: 'female' as const, guildmasterAge: 44 }, { guildmasterPortraitKey: 'gm-male-01' }]) {
        const { document } = createWorld(seed, { ...setup, ...chosen }, deps);
        const guildmaster = guildmasterOf(document);
        const preview = previewGuildmaster({ ...setup, ...chosen }, seed, deps);
        if (preview === null) throw new Error('No preview');
        const written = describeGuildmaster({ seed, n: 0, ...preview, age: preview.age }, deps);

        expect(written, seed).toEqual({ birthplace: guildmaster.birthplace, appearance: guildmaster.appearance, biography: guildmaster.biography });
      }
    }
  });

  test('"Again" writes anew for each n, the same each time for the same n', () => {
    const written = Array.from({ length: 12 }, (_, n) => describeGuildmaster({ ...request, n }, deps));
    expect(new Set(written.map((it) => JSON.stringify(it))).size).toBeGreaterThan(8);
    expect(describeGuildmaster({ ...request, n: 7 }, deps)).toEqual(written[7]);
  });

  test('refuses an n that is not a whole number from 0', () => {
    for (const n of [-1, 1.5, Number.NaN]) expect(() => describeGuildmaster({ ...request, n }, deps)).toThrow(/whole number/);
  });

  test("with a mapped picture, the Appearance is its narrative as written, over many seeds and n; with another it is drawn whole", () => {
    for (const seed of seeds) {
      for (const n of [0, 1, 2]) {
        const male = describeGuildmaster({ ...request, seed, n, portraitKey: 'gm-male-01' }, deps);
        const female = describeGuildmaster({ ...request, seed, n, sex: 'female', traitKeys: [], portraitKey: 'gm-female-01' }, deps);
        expect(male.appearance).toBe('A bearded face in a picture.');
        expect(female.appearance).toBe('A braided head in a picture.');
        const unmapped = describeGuildmaster({ ...request, seed, n, portraitKey: 'gm-male-02' }, deps);
        expect(unmapped.appearance).toMatch(/^Build (one|two) \(young male\)\. Face/);
      }
    }
  });

  test("draws the Appearance whole from the sex's age band: each slot in order, facialHair a male's only, then mark or bearing", () => {
    const lasts = new Set<string>();
    for (const seed of seeds) {
      const young = describeGuildmaster({ ...request, seed, age: 35 }, deps).appearance;
      const older = describeGuildmaster({ ...request, seed, age: 36 }, deps).appearance;
      const female = describeGuildmaster({ ...request, seed, sex: 'female', age: 21 }, deps).appearance;
      expect(young).toMatch(
        /^Build (one|two) \(young male\)\. Face (one|two) \(young male\)\. Hair (one|two) \(young male\)\. A young (beard|moustache)\. Eyes (one|two) \(young male\)\. (Mark|Bearing) (one|two) \(young male\)\.$/,
      );
      expect(older).toMatch(/^Build (one|two) \(older male\)\. .* An older beard\. .*\(older male\)\.$/);
      expect(female).toMatch(/^Build (one|two) \(young female\)\. Face .* Hair .* Eyes (one|two) \(young female\)\. (Mark|Bearing) .*\.$/);
      lasts.add(/(Mark|Bearing)/.exec(young)?.[1] ?? '');
    }
    expect([...lasts].sort()).toEqual(['Bearing', 'Mark']);
  });

  test("writes the Biography from the age band, the Guild's Background and the first two Traits, with the sex's pronouns and the Birthplace", () => {
    const { birthplace, biography } = describeGuildmaster({ ...request, seed: 'bio', traitKeys: ['old-soldier', 'thrifty', 'miser'] }, deps);
    expect(['Saltcote', "Hob's Ferry", 'Crane Marsh']).toContain(birthplace);
    expect(biography).toMatch(
      new RegExp(`^He was born in ${birthplace}\\. He carried loads\\. He took the old charter\\. He was a soldier\\. (He counts coins|Nothing is wasted by him)\\. He is young\\.$`),
    );
    expect(biographyTraitSentences).toBe(2);

    const hers = describeGuildmaster({ ...request, seed: 'bio', sex: 'female', age: 50, backgroundKey: 'newly-founded', traitKeys: ['miser'] }, deps);
    expect(hers.biography).toMatch(/^(She left .* long ago|Her people came from .*)\. She kept an inn for her life\. She is old\.$/);
    expect(hers.biography).not.toMatch(/[{}]/);
  });

  test('each text is within its bound, written, and none empty, over many requests', () => {
    for (const seed of seeds) {
      for (const sex of ['female', 'male'] as const) {
        const written = describeGuildmaster({ ...request, seed, sex, age: 21 + (seed.length % 30) }, deps);
        for (const attribute of descriptiveAttributes) {
          expect(written[attribute]).not.toBe('');
          expect([...written[attribute]].length).toBeLessThanOrEqual(descriptiveAttributeMaxLength[attribute]);
        }
      }
    }
  });
});

describe('describeBlanks, as a Guildmaster enters play', () => {
  const guildmaster = (texts: Partial<Pick<Guildmaster, 'birthplace' | 'appearance' | 'biography'>> = {}, portraitKey: string | null = null): Guildmaster => ({
    id: makeId('guildmasters', 1),
    name: 'Ada Vell',
    sex: 'female',
    guildId: playerId,
    enteredTurn: 0,
    ageAtEntry: 40,
    stats: {},
    traits: ['thrifty'],
    birthplace: '',
    appearance: '',
    biography: '',
    portraitKey,
    retiredOnTurn: null,
    regard: {},
    ...texts,
  });

  test('keeps each text written and writes each blank, from the stream descriptions alone', () => {
    const world = testWorld('blanks', deps);
    const before = structuredClone(world.rng);
    const row = guildmaster({ birthplace: 'Kingsbridge.', appearance: '  ' });
    describeBlanks(world, deps, row, 'breakaway');

    expect(row.birthplace).toBe('Kingsbridge.');
    expect(row.appearance).toMatch(/^Build .*\(older female\)\.$/);
    // The Birthplace kept is the Biography's, its full stop dropped.
    expect(row.biography).toMatch(/^(She left Kingsbridge long ago|Her people came from Kingsbridge)\. She kept an inn for her life\. She broke away\. (She counts coins|Nothing is wasted by her)\. She is old\.$/);
    for (const name of streamNames) {
      if (name === 'descriptions') expect(world.rng[name]).not.toEqual(before[name]);
      else expect(world.rng[name], name).toEqual(before[name]);
    }
  });

  // v1.1.2-S6 (the S5 verification): a successor did not found the Guild they lead.
  test("writes a successor's sentence in the Background's place, in the same draw, so nothing after moves", () => {
    const founder = guildmaster();
    const successor = guildmaster();
    const [founding, succeeding] = [testWorld('successor', deps), testWorld('successor', deps)];
    describeBlanks(founding, deps, founder, 'breakaway');
    describeBlanks(succeeding, deps, successor, 'breakaway', { successor: true });

    expect(founder.biography).toContain(' She broke away. ');
    expect(successor.biography).not.toContain('broke away');
    expect(successor.biography).toContain(' She took the chair. ');
    expect(succeeding.rng.descriptions).toEqual(founding.rng.descriptions);
  });

  test('takes the same draws whatever is given, mapped or keyed, so the next Guildmaster is described as they would have been', () => {
    const states = [
      guildmaster(),
      guildmaster({ birthplace: 'Here', appearance: 'Tall.', biography: 'A life.' }),
      guildmaster({}, 'gm-female-01'),
      { ...guildmaster(), traits: [], sex: 'male' as const, ageAtEntry: 22 },
    ].map((row) => {
      const world = testWorld('draws', deps);
      describeBlanks(world, deps, row, 'newly-founded');
      return world.rng.descriptions;
    });
    for (const state of states) expect(state).toEqual(states[0]);
  });
});

describe('every Guildmaster of a new game is described (v1.1.2-S5, DL-125 item 6)', () => {
  test("the player's and every Rival's have three texts within their bounds, and the same seed writes the same", () => {
    for (const seed of seeds.slice(0, 20)) {
      const { document } = createWorld(seed, setup, deps);
      const again = createWorld(seed, setup, deps).document;
      for (const row of Object.values(document.world.guildmasters)) {
        for (const attribute of descriptiveAttributes) {
          expect(row[attribute], `${seed} ${row.id} ${attribute}`).not.toBe('');
          expect([...row[attribute]].length).toBeLessThanOrEqual(descriptiveAttributeMaxLength[attribute]);
        }
        expect(again.world.guildmasters[row.id]).toEqual(row);
      }
    }
  });

  test("the player's texts, given or not, move no draw: the world is the one written for them, but for those texts", () => {
    for (const seed of seeds.slice(0, 10)) {
      const blank = createWorld(seed, setup, deps).document;
      const given = createWorld(
        seed,
        { ...setup, guildmasterBirthplace: ' Kingsbridge ', guildmasterAppearance: 'Tall.', guildmasterBiography: 'A life.' },
        deps,
      ).document;
      expect(guildmasterOf(given)).toMatchObject({ birthplace: 'Kingsbridge', appearance: 'Tall.', biography: 'A life.' });
      const was = guildmasterOf(blank);
      Object.assign(guildmasterOf(given), { birthplace: was.birthplace, appearance: was.appearance, biography: was.biography });

      expect(given).toEqual(blank);
    }
  });

  test('a new world has the stream descriptions, last of the core streams', () => {
    const { document } = createWorld('streams', setup, deps);
    expect(Object.keys(document.world.rng).at(-1)).toBe('descriptions');
    expect(streamNames.at(-1)).toBe('descriptions');
  });
});
