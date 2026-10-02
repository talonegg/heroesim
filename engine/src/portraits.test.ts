import { describe, expect, test } from 'vitest';
import type { ContentSet, PortraitAppearance, PortraitKey } from './content-types.js';
import type { Sex } from './document.js';
import {
  ageIntoPortrait,
  ageSpanOf,
  callingClashes,
  choosePortrait,
  portraitNotes,
  type ChosenRole,
  type PortraitPerson,
} from './portraits.js';
import { createStreams, next } from './rng.js';
import { testContent } from './world.test-support.js';

// v1.1.3-S5 (DL-134 item 5, DL-135 items 3 and 4): the Portrait chosen to fit a person already drawn,
// at its seam. Each test builds the pictures it needs, and holds the choice to exactly one draw of the
// stream whatever the list, so that the pictures content holds never move a later draw.

type Row = Partial<PortraitAppearance>;

/** A picture's row: a Guildmaster's of 30 to 40, common, a soldier, stern, unless `row` says otherwise. */
function rowOf(role: ChosenRole, row: Row): PortraitAppearance {
  return {
    apparentAge: [30, 40],
    station: 'common',
    temper: 'stern',
    features: [],
    narrative: 'A face in a picture.',
    hooks: [],
    ...(role === 'guildmaster' ? { callings: ['soldier'] } : { classes: ['warrior'] }),
    ...row,
  };
}

/**
 * The test content with only `pictures` of `role`, each of `sex` by its key's middle word, in the
 * order given. The test content's bands are young from 0 and older from 36; its Callings are
 * soldier (suits Old soldier), scholar (clashes with Mistrusts magic) and merchant (suits Thrifty,
 * clashes with Spendthrift); its Features braids and beard, and scar, which shows Scarred.
 */
function withPictures(role: ChosenRole, pictures: Record<PortraitKey, Row>): ContentSet {
  const bySex = (sex: Sex) => Object.keys(pictures).filter((key) => key.split('-')[1] === sex);
  const none = { female: [], male: [] };
  return {
    ...testContent,
    portraits: { guildmaster: none, hero: none, patron: none, [role]: { female: bySex('female'), male: bySex('male') } },
    portraitAppearances: {
      features: testContent.portraitAppearances.features,
      portraits: Object.fromEntries(Object.entries(pictures).map(([key, row]) => [key, rowOf(role, row)])),
    },
  };
}

const guildmaster: PortraitPerson = { sex: 'female', age: 33, traitKeys: [] };
const hero: PortraitPerson = { sex: 'female', age: 33, traitKeys: [], classKey: 'warrior' };

/**
 * `choosePortrait` over `seeds` seeds, each checked to take exactly one draw: the stream afterwards is
 * the stream before with one `next`. Returns every Portrait it chose.
 */
function chosen(
  content: ContentSet,
  role: ChosenRole,
  person: PortraitPerson,
  inUse: readonly PortraitKey[] = [],
  seeds = 40,
): Set<PortraitKey | null> {
  const found = new Set<PortraitKey | null>();
  for (let n = 0; n < seeds; n += 1) {
    const state = createStreams(`choose-${n}`, ['gm-portraits'])['gm-portraits'];
    const once = structuredClone(state);
    next(once);
    found.add(choosePortrait(state, content, role, person, new Set(inUse)));
    expect(state, `seed ${n}: one draw`).toEqual(once);
  }
  return found;
}

describe('choosePortrait: what must match (DL-135 item 3)', () => {
  test("the sex: only pictures of the person's sex, else the Silhouette", () => {
    const male = withPictures('guildmaster', { 'gm-male-01': {} });
    expect(chosen(male, 'guildmaster', guildmaster)).toEqual(new Set([null]));
    const both = withPictures('guildmaster', { 'gm-male-01': {}, 'gm-female-01': {} });
    expect(chosen(both, 'guildmaster', guildmaster)).toEqual(new Set(['gm-female-01']));
  });

  test("the band: a picture whose apparentAge reaches the band the age falls in, even outside the age; none that reaches another", () => {
    // The bands are young to 35 and older from 36. [34, 35] is young alone, and [36, 50] older alone.
    const content = withPictures('guildmaster', { 'gm-female-01': { apparentAge: [36, 50] }, 'gm-female-02': { apparentAge: [34, 35] } });
    expect(chosen(content, 'guildmaster', { ...guildmaster, age: 25 })).toEqual(new Set(['gm-female-02']));
    expect(chosen(content, 'guildmaster', { ...guildmaster, age: 45 })).toEqual(new Set(['gm-female-01']));
    expect(chosen(withPictures('guildmaster', { 'gm-female-01': { apparentAge: [36, 50] } }), 'guildmaster', guildmaster)).toEqual(new Set([null]));
  });

  test("a Hero's Class: only pictures whose Classes hold it, else the Silhouette; a Hero with no Class fits none", () => {
    const content = withPictures('hero', { 'hero-female-01': { classes: ['mage'] }, 'hero-female-02': { classes: ['rogue', 'warrior'] } });
    expect(chosen(content, 'hero', hero)).toEqual(new Set(['hero-female-02']));
    expect(chosen(content, 'hero', { ...hero, classKey: 'healer' })).toEqual(new Set([null]));
    expect(chosen(content, 'hero', { sex: 'female', age: 33, traitKeys: [] })).toEqual(new Set([null]));
  });

  test("the role: a Guildmaster is never given a Hero's picture, nor a Hero a Guildmaster's", () => {
    const heroes = withPictures('hero', { 'hero-female-01': {} });
    expect(chosen(heroes, 'guildmaster', guildmaster)).toEqual(new Set([null]));
    expect(chosen(withPictures('guildmaster', { 'gm-female-01': {} }), 'hero', hero)).toEqual(new Set([null]));
  });

  test('a picture listed with no row fits no one', () => {
    const content = withPictures('guildmaster', { 'gm-female-01': {} });
    const rowless = { ...content, portraits: { ...content.portraits, guildmaster: { female: ['gm-female-01', 'gm-female-09'], male: [] } } };
    expect(chosen(rowless, 'guildmaster', guildmaster)).toEqual(new Set(['gm-female-01']));
  });

  test('with no picture of the role and sex at all, the Silhouette, still in one draw', () => {
    expect(chosen(withPictures('guildmaster', {}), 'guildmaster', guildmaster)).toEqual(new Set([null]));
  });
});

describe('choosePortrait: pictures in use (DL-135 item 4)', () => {
  const two = withPictures('guildmaster', { 'gm-female-01': {}, 'gm-female-02': {} });

  test('a Guildmaster never repeats a picture in use: the other, else the Silhouette', () => {
    expect(chosen(two, 'guildmaster', guildmaster, ['gm-female-01'])).toEqual(new Set(['gm-female-02']));
    expect(chosen(two, 'guildmaster', guildmaster, ['gm-female-01', 'gm-female-02'])).toEqual(new Set([null]));
  });

  test('a picture in use that would be preferred gives way to a free one that fits', () => {
    // 33 is within gm-female-01's ages only, but it is in use.
    const content = withPictures('guildmaster', { 'gm-female-01': { apparentAge: [30, 40] }, 'gm-female-02': { apparentAge: [20, 25] } });
    expect(chosen(content, 'guildmaster', guildmaster, ['gm-female-01'])).toEqual(new Set(['gm-female-02']));
  });

  test('a Hero takes a free picture first, and repeats one once every fitting picture is in use', () => {
    const heroes = withPictures('hero', { 'hero-female-01': {}, 'hero-female-02': {} });
    expect(chosen(heroes, 'hero', hero, ['hero-female-01'])).toEqual(new Set(['hero-female-02']));
    expect(chosen(heroes, 'hero', hero, ['hero-female-01', 'hero-female-02'])).toEqual(new Set(['hero-female-01', 'hero-female-02']));
  });
});

describe('choosePortrait: the preferences, in order, each kept only while it leaves one (DL-135 item 3)', () => {
  test('1. the age within apparentAge, over a picture that only reaches the band', () => {
    const content = withPictures('guildmaster', { 'gm-female-01': { apparentAge: [34, 35] }, 'gm-female-02': { apparentAge: [30, 34] } });
    expect(chosen(content, 'guildmaster', guildmaster)).toEqual(new Set(['gm-female-02']));
  });

  test("2. a Guildmaster's: no Calling that clashes with a Trait", () => {
    const content = withPictures('guildmaster', { 'gm-female-01': { callings: ['scholar'] }, 'gm-female-02': { callings: ['soldier'] } });
    expect(chosen(content, 'guildmaster', { ...guildmaster, traitKeys: ['mistrusts-magic'] })).toEqual(new Set(['gm-female-02']));
  });

  test("3. a Guildmaster's: a Calling that suits a Trait", () => {
    const content = withPictures('guildmaster', { 'gm-female-01': { callings: ['scholar'] }, 'gm-female-02': { callings: ['merchant'] } });
    expect(chosen(content, 'guildmaster', { ...guildmaster, traitKeys: ['thrifty'] })).toEqual(new Set(['gm-female-02']));
  });

  test("4. a Hero's: their Background's Station", () => {
    const content = withPictures('hero', { 'hero-female-01': { station: 'common' }, 'hero-female-02': { station: 'gentry' } });
    expect(chosen(content, 'hero', { ...hero, station: 'gentry' })).toEqual(new Set(['hero-female-02']));
  });

  test('5. a Feature that shows a Trait the person holds', () => {
    const content = withPictures('hero', { 'hero-female-01': { features: ['braids'] }, 'hero-female-02': { features: ['scar', 'braids'] } });
    expect(chosen(content, 'hero', { ...hero, traitKeys: ['scarred'] })).toEqual(new Set(['hero-female-02']));
  });

  test('the order: the age before the Callings, the Callings before the Station and the Features', () => {
    // gm-female-01 holds the age and clashes; gm-female-02 only reaches the band, and does not clash.
    const guildmasters = withPictures('guildmaster', {
      'gm-female-01': { apparentAge: [30, 40], callings: ['scholar'] },
      'gm-female-02': { apparentAge: [34, 35], callings: ['soldier'] },
    });
    expect(chosen(guildmasters, 'guildmaster', { ...guildmaster, traitKeys: ['mistrusts-magic'] })).toEqual(new Set(['gm-female-01']));
    // No clash (2) is kept before a suiting Calling (3): scholar clashes, merchant suits, soldier neither.
    const callings = withPictures('guildmaster', {
      'gm-female-01': { callings: ['scholar', 'merchant'] },
      'gm-female-02': { callings: ['soldier'] },
    });
    expect(chosen(callings, 'guildmaster', { ...guildmaster, traitKeys: ['mistrusts-magic', 'thrifty'] })).toEqual(new Set(['gm-female-02']));
    // The Station (4) before a Feature (5).
    const heroes = withPictures('hero', {
      'hero-female-01': { station: 'gentry', features: [] },
      'hero-female-02': { station: 'common', features: ['scar'] },
    });
    expect(chosen(heroes, 'hero', { ...hero, station: 'gentry', traitKeys: ['scarred'] })).toEqual(new Set(['hero-female-01']));
  });

  test('a preference none meets narrows nothing: every picture that fits is still drawn, each by its own seeds', () => {
    const content = withPictures('guildmaster', {
      'gm-female-01': { apparentAge: [20, 25], callings: ['scholar'] },
      'gm-female-02': { apparentAge: [20, 26], callings: ['scholar'] },
    });
    // 33 is within neither, both clash, and neither suits: all three preferences fall back.
    expect(chosen(content, 'guildmaster', { ...guildmaster, traitKeys: ['mistrusts-magic'] })).toEqual(new Set(['gm-female-01', 'gm-female-02']));
  });

  test('ties are drawn among, each equally likely: every picture left is chosen by some seed', () => {
    const content = withPictures('guildmaster', { 'gm-female-01': {}, 'gm-female-02': {}, 'gm-female-03': {} });
    expect(chosen(content, 'guildmaster', guildmaster, [], 60)).toEqual(new Set(['gm-female-01', 'gm-female-02', 'gm-female-03']));
  });
});

describe('the age bands, the age moved into a picture, and the notes (DL-134 item 7)', () => {
  test("ageSpanOf gives the band an age falls in with its ages, the last band's to any age", () => {
    const bands = testContent.descriptions.ageBands;
    expect(ageSpanOf(bands, 21)).toEqual({ key: 'young', from: 0, to: 35 });
    expect(ageSpanOf(bands, 35)).toEqual({ key: 'young', from: 0, to: 35 });
    expect(ageSpanOf(bands, 36)).toEqual({ key: 'older', from: 36, to: Number.POSITIVE_INFINITY });
  });

  test("ageIntoPortrait keeps the drawn age's place in the bounds, within the picture's ages and the bounds", () => {
    // 21 to 50 into [45, 55]: held to 45 to 50, six ages for thirty.
    expect(ageIntoPortrait(21, [45, 55], 21, 50)).toBe(45);
    expect(ageIntoPortrait(50, [45, 55], 21, 50)).toBe(50);
    expect(ageIntoPortrait(35, [45, 55], 21, 50)).toBe(47);
    const moved = Array.from({ length: 30 }, (_, n) => ageIntoPortrait(21 + n, [22, 30], 21, 50));
    expect(new Set(moved)).toEqual(new Set([22, 23, 24, 25, 26, 27, 28, 29, 30]));
    expect(moved).toEqual([...moved].sort((a, b) => a - b));
    // Wholly outside the bounds: the bound nearest.
    expect(ageIntoPortrait(30, [55, 65], 21, 50)).toBe(50);
    expect(ageIntoPortrait(30, [10, 18], 21, 50)).toBe(21);
  });

  test('portraitNotes: the age outside the picture, looking older or younger, and each Calling that clashes with a Trait', () => {
    const content = withPictures('guildmaster', { 'gm-female-01': { apparentAge: [30, 40], callings: ['soldier', 'scholar'] } });
    expect(portraitNotes(content, 'gm-female-01', 35, [])).toEqual([]);
    expect(portraitNotes(content, 'gm-female-01', 25, ['mistrusts-magic'])).toEqual([
      { kind: 'age', portraitKey: 'gm-female-01', age: 25, apparentAge: [30, 40], looks: 'older' },
      { kind: 'calling-clash', portraitKey: 'gm-female-01', callingKey: 'scholar', traitKey: 'mistrusts-magic' },
    ]);
    expect(portraitNotes(content, 'gm-female-01', 45, [])).toMatchObject([{ kind: 'age', looks: 'younger' }]);
    expect(portraitNotes(content, null, 25, ['mistrusts-magic'])).toEqual([]);
    expect(callingClashes(content, 'gm-female-01', ['mistrusts-magic', 'thrifty'])).toEqual([{ callingKey: 'scholar', traitKey: 'mistrusts-magic' }]);
  });
});
