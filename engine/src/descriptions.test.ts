import { describe, expect, test } from 'vitest';
import { createWorld, previewGuildmaster, type WorldSetup } from './create.js';
import type { ContentSet } from './content-types.js';
import {
  biographyTraitSentences,
  describeBlanks,
  describeGuildmaster,
  describeHero,
  heroBiographyTraitSentences,
  heroDescriptionDraws,
  type DescribeRequest,
  type HeroFacts,
} from './descriptions.js';
import { descriptiveAttributeMaxLength, descriptiveAttributes, makeId, type Guild, type Guildmaster, type WorldDocument } from './document.js';
import { createStreams, next, streamNames } from './rng.js';
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
        // A key with no row, as a retired picture's might be, is drawn whole.
        const unmapped = describeGuildmaster({ ...request, seed, n, portraitKey: 'gm-male-99' }, deps);
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

  test('keeps a Birthplace given, and writes it into the Biography, in the same draws (v1.1.2-S6)', () => {
    for (const seed of seeds) {
      for (const n of [0, 3]) {
        const drawn = describeGuildmaster({ ...request, seed, n }, deps);
        const given = describeGuildmaster({ ...request, seed, n, given: { birthplace: '  Kingsbridge ' } }, deps);
        expect(given.birthplace).toBe('Kingsbridge');
        expect(given.appearance).toBe(drawn.appearance);
        expect(given.biography).toBe(drawn.biography.replace(drawn.birthplace, 'Kingsbridge'));
        expect(given.biography).toContain('Kingsbridge');
        // A blank one is written, as it would be with none given.
        expect(describeGuildmaster({ ...request, seed, n, given: { birthplace: ' ' } }, deps)).toEqual(drawn);
      }
    }
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

// v1.1.3-S5 (DL-134 item 6): with a picture, the Biography's origin is its Station's, its career its
// Callings' at the band with its hooks, and its closing its Temper's, each the band's where the
// picture's own list is empty, in the same fifteen draws. The test content has a common Station's
// origin, a soldier's young career and a stern Temper's closing, and none for gentry, the older band,
// a merchant, a scholar or a composed Temper.
describe("the Biography from the picture (v1.1.3-S5, DL-134 item 6)", () => {
  const bio = (portraitKey: string | null, age: number, seed = 'from-picture') =>
    describeGuildmaster({ ...request, seed, age, traitKeys: ['old-soldier'], portraitKey }, deps);

  test("the picture's Station's origin, its Calling's career at the band, and its Temper's closing", () => {
    // gm-male-01: common, a soldier, stern; 30 is young.
    const { birthplace, biography } = bio('gm-male-01', 30);
    expect(biography).toBe(`He was born common in ${birthplace}. He carried a pike. He took the old charter. He was a soldier. He is stern.`);
  });

  test("each falls back to the band's where the picture's own is empty", () => {
    // gm-male-01 at 40 is older, where a soldier has no career: the band's.
    expect(bio('gm-male-01', 40).biography).toMatch(/^He was born common in .*\. He kept an inn for his life\. .* He is stern\.$/);
    // gm-male-03 is a scholar and a soldier: a scholar has none, so the soldier's at the band.
    expect(bio('gm-male-03', 25).biography).toMatch(/^He was born common in .*\. He carried a pike\. /);
  });

  test("a picture's hooks join its Callings' careers, and stand alone where the Callings have none", () => {
    // gm-male-02: gentry (no origin), a merchant (no career), composed (no closing), with one hook.
    const { birthplace, biography } = bio('gm-male-02', 30);
    expect(biography).toBe(`He was born in ${birthplace}. He kept a ledger of every debt. He took the old charter. He was a soldier. He is young.`);
    // gm-female-02's hook beside a scholar's none, at 44: every seed writes it.
    for (const seed of seeds.slice(0, 10)) {
      const hers = describeGuildmaster({ ...request, seed, sex: 'female', age: 44, traitKeys: [], portraitKey: 'gm-female-02' }, deps);
      expect(hers.biography).toMatch(/^She was born common in .*\. She keeps a lamp lit late\. She took the old charter\. She is stern\.$/);
    }
  });

  test("with no picture, or one with no row, the band's alone", () => {
    for (const portraitKey of [null, 'gm-male-99']) {
      const { birthplace, biography } = bio(portraitKey, 30);
      expect(biography).toBe(`He was born in ${birthplace}. He carried loads. He took the old charter. He was a soldier. He is young.`);
    }
  });

  test('the same fifteen draws with a picture or without, at any band', () => {
    const states = ['gm-male-01', 'gm-male-02', 'gm-male-03', null].flatMap((portraitKey) =>
      [25, 44].map((age) => {
        const world = testWorld('picture-draws', deps);
        const row = { ...(guildmasterRow() as Guildmaster), sex: 'male' as const, ageAtEntry: age, portraitKey };
        describeBlanks(world, deps, row, 'old-charter');
        return world.rng.descriptions;
      }),
    );
    for (const state of states) expect(state).toEqual(states[0]);
  });
});

/** A Guildmaster's row with no texts, for `describeBlanks`. */
function guildmasterRow(): Guildmaster {
  return {
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
    portraitKey: null,
    retiredOnTurn: null,
    regard: {},
  };
}

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

  test("a new world has the stream descriptions, after gm-portraits and before the Heroes' two (v1.1.3-S6)", () => {
    const { document } = createWorld('streams', setup, deps);
    expect(Object.keys(document.world.rng).slice(-4)).toEqual(['gm-portraits', 'descriptions', 'hero-portraits', 'hero-descriptions']);
    expect(streamNames.slice(-4)).toEqual(['gm-portraits', 'descriptions', 'hero-portraits', 'hero-descriptions']);
  });
});

// ── A Hero described (v1.1.3-S6, DL-135 item 6) ──────────────────────────────────────────────

describe('describeHero', () => {
  const facts: HeroFacts = {
    sex: 'female',
    age: 20,
    backgroundKey: 'farm-born',
    classKey: 'warrior',
    traitKeys: ['scarred'],
    portraitKey: null,
  };
  const stream = (seed = 'hero-described') => createStreams(seed, ['hero-descriptions'])['hero-descriptions'];
  const described = (overrides: Partial<HeroFacts> = {}, content: ContentSet = deps.content, seed?: string) =>
    describeHero(stream(seed), content, { ...facts, ...overrides });
  /** The test content with a second Hero picture: a Mage's, composed, whose Temper has no closing, with a hook. */
  const withHook: ContentSet = {
    ...deps.content,
    portraits: { ...deps.content.portraits, hero: { female: ['hero-female-01', 'hero-female-02'], male: [] } },
    portraitAppearances: {
      ...deps.content.portraitAppearances,
      portraits: {
        ...deps.content.portraitAppearances.portraits,
        'hero-female-02': {
          apparentAge: [30, 45],
          station: 'common',
          classes: ['mage'],
          temper: 'composed',
          features: [],
          narrative: 'A calm face in a picture.',
          hooks: ['{He} once held a bridge alone.'],
        },
      },
    },
  };

  test('is pure but for the stream: the same for the same stream and facts', () => {
    const frozen = deepFreeze({ ...facts, traitKeys: [...facts.traitKeys] });
    expect(describeHero(stream(), deps.content, frozen)).toEqual(describeHero(stream(), deps.content, frozen));
  });

  test("with no picture, draws the Appearance whole from the sex's age band, each slot in order, as a Guildmaster's", () => {
    for (const seed of seeds.slice(0, 20)) {
      expect(described({}, deps.content, seed).appearance).toMatch(
        /^Build (one|two) \(young female\)\. Face (one|two) \(young female\)\. Hair (one|two) \(young female\)\. Eyes (one|two) \(young female\)\. (Mark|Bearing) (one|two) \(young female\)\.$/,
      );
      expect(described({ sex: 'male', age: 40 }, deps.content, seed).appearance).toMatch(
        /^Build (one|two) \(older male\)\. Face .* Hair .* An older beard\. Eyes .* (Mark|Bearing) (one|two) \(older male\)\.$/,
      );
    }
  });

  test('writes the Biography from the Background, the Class at the band, the Traits and the band\'s closing, with the sex\'s pronouns', () => {
    expect(described().biography).toBe('She grew up on a farm. She fought young. She is scarred. She is young.');
    expect(described({ sex: 'male', age: 40, traitKeys: [] }).biography).toBe('He grew up on a farm. He fought long. He is old.');
  });

  test('leaves out a part with no sentence: a Background, a Class or a Trait content writes none for', () => {
    expect(described({ backgroundKey: 'levy-soldier', classKey: 'mage', traitKeys: ['lame', 'scarred'] }).biography).toBe('She is scarred. She is young.');
  });

  test(`gives a sentence to the first ${heroBiographyTraitSentences} Traits only, in their order`, () => {
    const only = { ...deps.content, descriptions: { ...deps.content.descriptions, heroBiography: { ...deps.content.descriptions.heroBiography, traits: { scarred: ['{He} is scarred.'], lame: ['{He} limps.'], 'one-eyed': ['{He} has one eye.'] } } } };
    expect(described({ traitKeys: ['lame', 'scarred', 'one-eyed'] }, only).biography).toBe('She grew up on a farm. She fought young. She limps. She is scarred. She is young.');
  });

  test("with a picture, the Appearance is its narrative as written, and the closing its Temper's", () => {
    for (const seed of seeds.slice(0, 10)) {
      const { appearance, biography } = described({ portraitKey: 'hero-female-01' }, deps.content, seed);
      expect(appearance).toBe('A scarred young face in a picture.');
      expect(biography).toBe('She grew up on a farm. She fought young. She is scarred. She is stern.');
    }
  });

  test("a picture's hooks join the Class's sentences, stand alone where it has none, and a Temper with no closing falls back to the band's", () => {
    // A Mage has no sentence in the test content: the hook is the Class's sentence every time.
    for (const seed of seeds.slice(0, 10)) {
      expect(described({ classKey: 'mage', age: 32, portraitKey: 'hero-female-02' }, withHook, seed)).toEqual({
        appearance: 'A calm face in a picture.',
        biography: 'She grew up on a farm. She once held a bridge alone. She is scarred. She is young.',
      });
    }
    // A Warrior's sentence at the band and the hook are both drawn, over many seeds.
    const classSentences = new Set(seeds.map((seed) => described({ age: 32, portraitKey: 'hero-female-02' }, withHook, seed).biography.split('. ')[1]));
    expect(classSentences).toEqual(new Set(['She fought young', 'She once held a bridge alone']));
  });

  test('a key with no row is the Silhouette\'s: drawn from the phrases, closed by the band', () => {
    const { appearance, biography } = described({ portraitKey: 'hero-male-99' });
    expect(appearance).toMatch(/^Build .*\(young female\)\.$/);
    expect(biography).toBe('She grew up on a farm. She fought young. She is scarred. She is young.');
  });

  test(`takes exactly ${heroDescriptionDraws} draws whatever it writes: a picture, a sex, a band, a Class, a Background or Traits with no sentence`, () => {
    expect(heroDescriptionDraws).toBe(13);
    const spent = stream();
    for (let draw = 0; draw < heroDescriptionDraws; draw += 1) next(spent);
    const variants: Partial<HeroFacts>[] = [
      {},
      { portraitKey: 'hero-female-01' },
      { portraitKey: 'hero-female-02', classKey: 'mage' },
      { sex: 'male', age: 44 },
      { classKey: 'rogue', backgroundKey: 'river-folk', traitKeys: [] },
      { traitKeys: ['scarred', 'lame', 'one-eyed', 'short-winded'] },
    ];
    for (const variant of variants) {
      const state = stream();
      describeHero(state, withHook, { ...facts, ...variant });
      expect(state, JSON.stringify(variant)).toEqual(spent);
    }
  });

  test('each text is written, and within its bound, over many Heroes', () => {
    for (const seed of seeds) {
      for (const sex of ['female', 'male'] as const) {
        for (const age of [18, 30, 36, 50]) {
          for (const classKey of Object.keys(deps.content.classes)) {
            const { appearance, biography } = described({ sex, age, classKey, traitKeys: ['scarred', 'lame'] }, withHook, seed);
            expect(appearance).not.toBe('');
            expect(biography).not.toBe('');
            expect([...appearance].length).toBeLessThanOrEqual(descriptiveAttributeMaxLength.appearance);
            expect([...biography].length).toBeLessThanOrEqual(descriptiveAttributeMaxLength.biography);
          }
        }
      }
    }
  });

  test("as many Trait sentences as a Guildmaster's", () => {
    expect(heroBiographyTraitSentences).toBe(biographyTraitSentences);
  });
});
