import {
  createWorld,
  defaultConfig,
  describeGuildmaster,
  descriptiveAttributeMaxLength,
  descriptiveAttributes,
  sexes,
  type DescriptiveAttribute,
} from '@heroesim/engine';
import { type PortraitAppearance } from '@heroesim/engine/content';
import { describeHero } from '@heroesim/engine/testing';
import { describe, expect, test } from 'vitest';
import { longestDescriptions } from '../index.js';
import { shipped, parse, withJson, changed, refusalOf, heroRow, pictureRowOf } from './content.test-support.js';

// The descriptions' refusals, and the longest texts they write (DL-243). Each is triggered by content built in memory from the shipped files with one
// thing broken, read and checked as `parseContent` does, and names the offending key, so an author
// can find it.

describe('the vocabulary a picture is read in (DL-134 item 4)', () => {
  test('is refused with a station, temper or calling out of lower case and hyphens, listed twice, or none at all, each named', () => {
    const files = withJson('descriptions.json', (json) => {
      json.stations.push('Trade', 'common');
      json.tempers = [];
      json.callings['Sea_Captain'] = { suits: [], clashes: [] };
    });

    const { message } = refusalOf(() => parse(files));
    expect(message).toContain('descriptions.stations: "Trade" is not lower case and hyphens');
    expect(message).toContain('descriptions.stations: "common" is listed twice');
    expect(message).toContain('descriptions.tempers is empty');
    expect(message).toContain('descriptions.callings: "Sea_Captain" is not lower case and hyphens');
  });

  test('is refused with a calling that suits or clashes with what is no Guildmaster Trait, or both suits and clashes with one', () => {
    const files = withJson('descriptions.json', (json) => {
      const { soldier, merchant } = json.callings;
      if (soldier !== undefined) soldier.suits.push('scarred');
      if (merchant !== undefined) merchant.clashes.push('thrifty', 'bold');
    });

    const { message } = refusalOf(() => parse(files));
    expect(message).toContain('descriptions.callings.soldier.suits: "scarred" is not a Guildmaster Trait');
    expect(message).toContain('descriptions.callings.merchant.clashes: "bold" is not a Guildmaster Trait');
    expect(message).toContain('descriptions.callings.merchant: "thrifty" both suits and clashes');

    const unknown = withJson('descriptions.json', (json) => {
      (json.callings['lawyer'] as unknown as Record<string, unknown>)['favours'] = [];
    });
    expect(refusalOf(() => parse(unknown)).message).toContain('descriptions.json: callings.lawyer.favours is not a field of a calling');
  });

  test("is refused with a Hero Background's station missing or undefined, or a Guild Background's given (DL-135 item 5)", () => {
    const files = withJson('backgrounds.json', (json) => {
      const rows = json as unknown as Record<string, Record<string, unknown>>;
      const farm = rows['farm-born'];
      if (farm !== undefined) farm['station'] = 'serf';
      delete rows['levy-soldier']?.['station'];
      const charter = rows['old-charter'];
      if (charter !== undefined) charter['station'] = 'gentry';
    });

    const { message } = refusalOf(() => parse(files));
    expect(message).toContain('backgrounds.farm-born.station: "serf" is not a station defined in descriptions.stations');
    expect(message).toContain('backgrounds.levy-soldier.station is missing: a Hero Background has one');
    expect(message).toContain('backgrounds.old-charter.station: a Guild Background has none');
  });
});

describe("the Biography's sentences from a picture, and a Hero's (DL-134 items 4 and 6, DL-135 item 6)", () => {
  test('are refused with a key that is no station, calling, age band, temper, Hero Background, Class or Hero Trait, each named', () => {
    const files = withJson('descriptions.json', (json) => {
      json.biography.stationOrigins['noble'] = ['{He} was born noble.'];
      json.biography.callingCareers['priest'] = { young: ['{He} prayed.'] };
      const soldier = json.biography.callingCareers['soldier'];
      if (soldier !== undefined) soldier['ancient'] = ['{He} fought long ago.'];
      json.biography.temperClosings['grim'] = ['{He} is grim.'];
      json.heroBiography.backgrounds['old-charter'] = ['{He} kept a charter.'];
      json.heroBiography.classes['bard'] = { young: ['{He} sang.'] };
      const warrior = json.heroBiography.classes['warrior'];
      if (warrior !== undefined) warrior['ancient'] = ['{He} fought long ago.'];
      json.heroBiography.traits['thrifty'] = ['{He} saves.'];
      delete json.heroBiography.closings['older'];
    });

    const { message } = refusalOf(() => parse(files));
    expect(message).toContain('descriptions.biography.stationOrigins: "noble" is not a station');
    expect(message).toContain('descriptions.biography.callingCareers: "priest" is not a calling');
    expect(message).toContain('descriptions.biography.callingCareers.soldier: "ancient" is not an age band');
    expect(message).toContain('descriptions.biography.temperClosings: "grim" is not a temper');
    expect(message).toContain('descriptions.heroBiography.backgrounds: "old-charter" is not a Hero Background');
    expect(message).toContain('descriptions.heroBiography.classes: "bard" is not a Class');
    expect(message).toContain('descriptions.heroBiography.classes.warrior: "ancient" is not an age band');
    expect(message).toContain('descriptions.heroBiography.traits: "thrifty" is not a Hero Trait');
    expect(message).toContain('descriptions.heroBiography.closings: the age band "older" is missing');
  });

  test("are refused with a list empty, a sentence that is no sentence, or a Birthplace in a Hero's or a temper's sentence, since a Hero has none", () => {
    const files = withJson('descriptions.json', (json) => {
      json.biography.stationOrigins['trade'] = [];
      json.biography.temperClosings['stern']?.push('{He} never went back to {birthplace}.');
      json.heroBiography.backgrounds['farm-born']?.push('{He} left {birthplace}.', 'a farm hand.');
    });

    const { message } = refusalOf(() => parse(files));
    expect(message).toContain('descriptions.biography.stationOrigins.trade is empty');
    expect(message).toMatch(/descriptions\.biography\.temperClosings\.stern\.\d+: \{birthplace\} is not a slot; the slots are \{he\}/);
    expect(message).toMatch(/descriptions\.heroBiography\.backgrounds\.farm-born\.\d+: \{birthplace\} is not a slot/);
    expect(message).toMatch(/descriptions\.heroBiography\.backgrounds\.farm-born\.\d+ is no sentence/);
  });

  test("are refused with a field missing or unknown, each named", () => {
    const files = withJson('descriptions.json', (json) => {
      delete (json.biography as unknown as Record<string, unknown>)['temperClosings'];
      (json.heroBiography as unknown as Record<string, unknown>)['origins'] = {};
      delete (json as unknown as Record<string, unknown>)['stations'];
    });

    const { message } = refusalOf(() => parse(files));
    expect(message).toContain('descriptions.json: biography.temperClosings is missing');
    expect(message).toContain("descriptions.json: heroBiography.origins is not a field of a Hero's Biography sentences");
    expect(message).toContain('descriptions.json: stations is missing; expected a list of strings');
  });

  test("are refused when a Guildmaster's longest Biography with a picture, hooks included, or a Hero's passes 1,000 characters", () => {
    const long = (start: string) => `${start}${' and on and on'.repeat(18)}.`;
    let files = withJson('descriptions.json', (json) => {
      // A Guildmaster's: the picture's station, calling and temper, each far longer than the band's.
      json.biography.stationOrigins['common']?.push(long('{He} was born in {birthplace}'));
      json.biography.callingCareers['soldier']?.['older']?.push(long('{He} soldiered'));
      json.biography.temperClosings['stern']?.push(long('{He} is stern'));
      // A Hero's: a Background, a Class at a band and two Traits.
      json.heroBiography.backgrounds['farm-born']?.push(long('{He} farmed'));
      json.heroBiography.classes['warrior']?.['young']?.push(long('{He} fought'));
      json.heroBiography.traits['scarred']?.push(long('{He} is scarred'));
      json.heroBiography.traits['lame']?.push(long('{He} is lame'));
    });
    files = changed(files, 'portrait-appearances.json', (json) => {
      pictureRowOf(json, 'gm-male-01')['hooks'] = [`{He}${' and on'.repeat(20)}.`];
    });

    const { message } = refusalOf(() => parse(files));
    expect(message).toMatch(/descriptions\.biography: the longest Biography it can write is 1\d{3} characters; it holds at most 1000/);
    expect(message).toMatch(/descriptions\.heroBiography: the longest Hero's Biography it can write is 1\d{3} characters; it holds at most 1000/);
  });

  test("measure a Guildmaster's Biography by their picture, a hook standing in a career's place, and a Hero's by S6's shape", () => {
    const set = structuredClone(shipped);
    // The owner's two pictures alone, gm-female-01 without the hooks the others have.
    const tiny = {
      ...set,
      portraits: { ...set.portraits, guildmaster: { female: ['gm-female-01'], male: ['gm-male-01'] } },
      portraitAppearances: {
        ...set.portraitAppearances,
        portraits: {
          'gm-male-01': { ...(set.portraitAppearances.portraits['gm-male-01'] as PortraitAppearance), hooks: ['A hook, much longer than that.'] },
          'gm-female-01': { ...(set.portraitAppearances.portraits['gm-female-01'] as PortraitAppearance), hooks: [] },
        },
      },
      descriptions: {
        ...set.descriptions,
        biography: {
          origins: { young: ['O.'], middle: ['O.'], older: ['O.'] },
          careers: { young: ['C.'], middle: ['C.'], older: ['C.'] },
          backgrounds: {},
          traits: { thrifty: ['Tt.'], miser: ['Mmm.'], spendthrift: ['S.'] },
          closings: { young: ['E.'], middle: ['E.'], older: ['E.'] },
          successors: ['Su.'],
          stationOrigins: { gentry: ['Born to the land.'] },
          callingCareers: { soldier: { young: ['A soldier.'] } },
          temperClosings: { stern: ['Stern.'] },
        },
        heroBiography: {
          backgrounds: { 'farm-born': ['Farm.'], 'river-folk': ['Barge.'] },
          classes: { warrior: { young: ['Warrior.'] }, mage: { older: ['A Mage.'] } },
          traits: { scarred: ['Scarred.'], lame: ['Lame.'], 'one-eyed': ['One eye.'] },
          closings: { young: ['Hc.'], middle: ['Hc.'], older: ['Hc.'] },
        },
      },
    };
    const longest = longestDescriptions(tiny);
    // gm-male-01 (common, soldier and adventurer, stern) with its hook: "O." 2, the hook 30, "Su." 3,
    // "Mmm." 4 and "Tt." 3, "Stern." 6, and five spaces. Without the hook the longest would be
    // gm-female-01's (gentry, soldier, composed): 17 + 10 + 3 + 4 + 3 + "E." 2 + 5 = 44.
    expect(longest.biography).toBe(2 + 30 + 3 + 4 + 3 + 6 + 5);
    // No Hero has a picture: "Barge." 6, "Warrior." 8, "Scarred." 8 and "One eye." 8, "Hc." 3, four spaces.
    expect(longest.heroBiography).toBe(6 + 8 + 8 + 8 + 3 + 4);

    // A Hero's picture of a Mage, stern: its Class's sentence or its hook at any band, and its temper's
    // closing, which content has.
    const pictured = {
      ...tiny,
      portraits: { ...tiny.portraits, hero: { female: ['hero-female-01'], male: [] } },
      portraitAppearances: {
        ...tiny.portraitAppearances,
        portraits: {
          ...tiny.portraitAppearances.portraits,
          'hero-female-01': { ...(heroRow() as unknown as PortraitAppearance), classes: ['mage'], temper: 'stern', hooks: ['{He} keeps a long secret of it.'] },
        },
      },
    };
    // "Barge." 6, the hook "She keeps a long secret of it." 30, 8 + 8, "Stern." 6, four spaces.
    expect(longestDescriptions(pictured).heroBiography).toBe(6 + 30 + 8 + 8 + 6 + 4);
  });
});

describe("what a Guildmaster's descriptive Attributes are written from (DL-125 item 6)", () => {
  test('are refused with a field missing, unknown or of the wrong type, each named', () => {
    const files = withJson('descriptions.json', (json) => {
      const young = json.appearance.female['young'] as unknown as Record<string, unknown>;
      delete young['eyes'];
      young['dress'] = ['A plain dress.'];
      (json.biography as unknown as Record<string, unknown>)['endings'] = {};
      (json as unknown as Record<string, unknown>)['birthplaces'] = 'Saltcote';
      (json.ageBands[0] as unknown as Record<string, unknown>)['from'] = 'birth';
    });

    const { message } = refusalOf(() => parse(files));
    expect(message).toContain('descriptions.json: appearance.female.young.eyes is missing');
    expect(message).toContain("descriptions.json: appearance.female.young.dress is not a field of an age band's Appearance phrases");
    expect(message).toContain("descriptions.json: biography.endings is not a field of the Biography's sentences");
    expect(message).toContain('descriptions.json: birthplaces is "Saltcote"; expected a list of strings');
    expect(message).toContain('descriptions.json: ageBands.0.from is "birth"; expected a whole number');
  });

  test('are refused with age bands that leave an age without one, go backwards, or are missing from a part', () => {
    const files = withJson('descriptions.json', (json) => {
      json.ageBands = [
        { key: 'young', from: 18 },
        { key: 'Middle', from: 41 },
        { key: 'older', from: 41 },
      ];
      delete json.biography.closings['older'];
      json.biography.origins['ancient'] = ['{He} is ancient.'];
    });

    const { message } = refusalOf(() => parse(files));
    expect(message).toContain('descriptions.ageBands.0.from is 18; the first band is from 0, so every age has one');
    expect(message).toContain('descriptions.ageBands.1.key "Middle" is not lower case and hyphens');
    expect(message).toContain('descriptions.ageBands.2.from is 41; each band begins after the one before, from 41');
    expect(message).toContain('descriptions.biography.closings: the age band "older" is missing');
    expect(message).toContain('descriptions.biography.origins: "ancient" is not an age band');
    expect(message).toContain('descriptions.appearance.female: "middle" is not an age band');
  });

  test("are refused with facialHair on a female's, a male's missing, a slot empty, or a phrase that is no sentence or has a slot", () => {
    const files = withJson('descriptions.json', (json) => {
      const female = json.appearance.female['young'];
      if (female !== undefined) female.facialHair = ['A beard.'];
      const male = json.appearance.male['older'];
      if (male !== undefined) {
        delete male.facialHair;
        male.mark = [];
        male.bearing = ['he moves slowly.', 'He moves slowly', '{He} moves slowly.'];
      }
    });

    const { message } = refusalOf(() => parse(files));
    expect(message).toContain("descriptions.appearance.female.young.facialHair: facialHair is a male's only");
    expect(message).toContain('descriptions.appearance.male.older.facialHair is missing');
    expect(message).toContain('descriptions.appearance.male.older.mark is empty');
    expect(message).toContain('descriptions.appearance.male.older.bearing.0 is no sentence');
    expect(message).toContain('descriptions.appearance.male.older.bearing.1 is no sentence');
    expect(message).toContain('descriptions.appearance.male.older.bearing.2 has a brace that is no slot: an Appearance has no slot');
  });

  test("are refused with a Biography's key that is no Guild Background or Guildmaster Trait, a slot unknown, or pronouns that differ by sex", () => {
    const files = withJson('descriptions.json', (json) => {
      json.biography.backgrounds['farm-born'] = ['{He} grew up on a farm.'];
      json.biography.traits['scarred'] = ['{He} is scarred.'];
      json.biography.careers['young']?.push('{He} served {guild} well.', '{she} was a clerk.');
      json.pronouns.female['hers'] = 'hers';
      json.pronouns.male['birthplace'] = 'here';
    });

    const { message } = refusalOf(() => parse(files));
    expect(message).toContain('descriptions.biography.backgrounds: "farm-born" is not a Guild Background');
    expect(message).toContain('descriptions.biography.traits: "scarred" is not a Guildmaster Trait');
    expect(message).toMatch(/descriptions\.biography\.careers\.young\.5: \{guild\} is not a slot; the slots are \{birthplace\}, \{he\}/);
    expect(message).toMatch(/descriptions\.biography\.careers\.young\.6: \{she\} is not a slot/);
    expect(message).toContain('descriptions.pronouns: every sex has the same slots');
    expect(message).toContain('descriptions.pronouns.male.birthplace: a pronoun\'s slot is a word of letters, and not "birthplace"');
  });

  // A successor's sentences, and a Birthplace closed in its sentence.
  test("are refused with a successor's sentences missing or empty, or a Birthplace left open in a sentence", () => {
    const missing = withJson('descriptions.json', (json) => {
      delete (json.biography as unknown as Record<string, unknown>)['successors'];
    });
    expect(refusalOf(() => parse(missing)).message).toContain('descriptions.json: biography.successors is missing');

    const files = withJson('descriptions.json', (json) => {
      json.biography.successors = [];
      json.biography.origins['young']?.push('{He} left {birthplace} young.');
    });
    const { message } = refusalOf(() => parse(files));
    // The sentence added is the last of the shipped list's.
    const added = shipped.descriptions.biography.origins['young']?.length;
    expect(message).toContain('descriptions.biography.successors is empty');
    expect(message).toContain(
      `descriptions.biography.origins.young.${added}: {birthplace} is followed by a comma or a full stop, since a Birthplace may hold a comma`,
    );
  });

  test('are refused with a Birthplace past 60 characters, blank or in lower case, or listed twice', () => {
    const files = withJson('descriptions.json', (json) => {
      json.birthplaces.push(`Saltcote${', by the sea'.repeat(5)}`, 'the Crane Marshes', ' ', "Hob's Ferry");
    });

    const { message } = refusalOf(() => parse(files));
    // The four added follow the shipped list's last.
    const first = shipped.descriptions.birthplaces.length;
    expect(message).toContain(`descriptions.birthplaces.${first} is 68 characters; a Birthplace holds at most 60`);
    expect(message).toContain(`descriptions.birthplaces.${first + 1} is "the Crane Marshes"; it is a place's name, trimmed, beginning with a capital`);
    expect(message).toContain(`descriptions.birthplaces.${first + 2} is " "`);
    expect(message).toContain('descriptions.birthplaces: "Hob\'s Ferry" is listed twice');
  });

  test('are refused when the longest combination passes 280 or 1,000 characters, though every phrase and sentence is short', () => {
    const files = withJson('descriptions.json', (json) => {
      // Each phrase is well under the bound, but the longest of each slot together passes 280.
      const male = json.appearance.male['middle'];
      if (male !== undefined) male.build.push(`Big${' and broad'.repeat(7)}.`);
      // And a long Background, two long Traits and the longest parts pass 1,000 together.
      const long = (start: string) => `${start}${' and on and on'.repeat(14)}.`;
      json.biography.backgrounds['inherited']?.push(long('{He} inherited it'));
      json.biography.traits['thrifty']?.push(long('{He} saves'));
      json.biography.traits['miser']?.push(long('{He} hoards'));
      json.biography.origins['older']?.push(long('{He} was born in {birthplace}'));
    });

    const { message } = refusalOf(() => parse(files));
    expect(message).toMatch(/descriptions\.appearance: the longest Appearance it can write is 301 characters; it holds at most 280/);
    expect(message).toMatch(/descriptions\.biography: the longest Biography it can write is 1\d{3} characters; it holds at most 1000/);
  });

  test("measure what the engine writes: a Birthplace's slot as long as the bound, the longer sex's pronouns, and only two Traits", () => {
    const set = structuredClone(shipped);
    const owner = (key: string) => ({ ...(set.portraitAppearances.portraits[key] as PortraitAppearance), hooks: [] });
    const tiny = {
      ...set,
      // The owner's two pictures alone, without the hooks the others have.
      portraits: { ...set.portraits, guildmaster: { female: ['gm-female-01'], male: ['gm-male-01'] } },
      portraitAppearances: { ...set.portraitAppearances, portraits: { 'gm-male-01': owner('gm-male-01'), 'gm-female-01': owner('gm-female-01') } },
      descriptions: {
        ...set.descriptions,
        biography: {
          origins: { young: ['{He} was born in {birthplace}.'], middle: ['M.'], older: ['O.'] },
          careers: { young: ['C.'], middle: ['C.'], older: ['C.'] },
          backgrounds: {},
          traits: { thrifty: ['Tt.'], miser: ['Mmm.'], spendthrift: ['S.'] },
          closings: { young: ['E.'], middle: ['E.'], older: ['E.'] },
          successors: ['Su.'],
          // No sentence by a picture's station, calling or temper, so the pictures take the band's.
          stationOrigins: {},
          callingCareers: {},
          temperClosings: {},
        },
      },
    };
    // "She was born in " 16 + 60 + "." 1 = 77; then "C.", "Su." (a successor's, in the Background's
    // place), "Mmm." "Tt." "E." and five spaces.
    expect(longestDescriptions(tiny).biography).toBe(77 + 2 + 3 + 4 + 3 + 2 + 5);
  });
});

// The engine writing over the shipped content, where both packages meet (DL-125 item 6, DL-135
// item 6): the validator reads the engine's bounds and its count of Trait sentences (DL-186 item 6)
// to prove nothing written passes them; these hold the engine's writing to the validator's longest.
describe('what the engine writes over the shipped content', () => {
  const deps = { config: defaultConfig, content: shipped };
  const longest = longestDescriptions(shipped);
  const backgroundsOf = (owner: 'guild' | 'hero') => Object.values(shipped.backgrounds).filter((row) => row.owner === owner).map((row) => row.key);

  test("a Guildmaster's: nothing past the longest the validator proves, of every sex, each age band's first and last age, Background and Trait", () => {
    const { guildmasterStartingAgeMin: youngest, guildmasterStartingAgeMax: oldest } = defaultConfig;
    // Each band's first and last age a new Guildmaster may have.
    const ages = shipped.descriptions.ageBands.flatMap((band, at, bands) => {
      const next = bands[at + 1];
      const from = Math.max(band.from, youngest);
      const to = Math.min(next === undefined ? oldest : next.from - 1, oldest);
      return from <= to ? [from, to] : [];
    });
    const guildBackgrounds = backgroundsOf('guild');
    const guildmasterTraits = Object.keys(shipped.guildmasterTraits);
    const seen: Record<DescriptiveAttribute, number> = { birthplace: 0, appearance: 0, biography: 0 };
    let index = 0;
    for (const sex of sexes) {
      for (const age of ages) {
        for (const backgroundKey of guildBackgrounds) {
          for (const n of [0, 1, 2, 3, 4]) {
            index += 1;
            const traitKeys = [guildmasterTraits[index % guildmasterTraits.length], guildmasterTraits[(index + 3) % guildmasterTraits.length]].filter(
              (key) => key !== undefined,
            );
            const written = describeGuildmaster({ seed: `core-${index}`, n, sex, age, backgroundKey, traitKeys, portraitKey: null }, deps);
            for (const attribute of descriptiveAttributes) {
              const length = [...written[attribute]].length;
              expect(length, `${attribute} of ${JSON.stringify({ sex, age, backgroundKey, n })}`).toBeGreaterThan(0);
              expect(length).toBeLessThanOrEqual(longest[attribute]);
              seen[attribute] = Math.max(seen[attribute], length);
            }
            expect(written.biography).not.toMatch(/[{}]/);
          }
        }
      }
    }
    expect(index).toBe(sexes.length * ages.length * guildBackgrounds.length * 5);
    // The longest proved are bounds, not the lengths met: a sample comes near them.
    expect(seen.appearance).toBeGreaterThan(longest.appearance - 60);
    expect(longest.appearance).toBeLessThanOrEqual(descriptiveAttributeMaxLength.appearance);
    expect(longest.biography).toBeLessThanOrEqual(descriptiveAttributeMaxLength.biography);
  });

  test("a Hero's: nothing past the longest the validator proves, of every sex, age, Background and Class, with and without Traits", () => {
    const heroBackgrounds = backgroundsOf('hero');
    const heroTraits = Object.keys(shipped.heroTraits);
    const seen = { appearance: 0, biography: 0 };
    let index = 0;
    // One world's stream, drawn on from request to request, as the pool's Heroes are described.
    const state = createWorld('hero-bounds', { guildName: 'G', guildmasterName: 'M', createdAt: 'test' }, deps).document.world.rng['hero-descriptions'];
    for (const sex of sexes) {
      for (let age = 16; age <= 60; age += 4) {
        for (const backgroundKey of heroBackgrounds) {
          for (const classKey of Object.keys(shipped.classes)) {
            index += 1;
            const traitKeys = [heroTraits[index % heroTraits.length], heroTraits[(index + 1) % heroTraits.length]].filter((key) => key !== undefined).slice(0, index % 3);
            const { appearance, biography } = describeHero(state, shipped, { sex, age, backgroundKey, classKey, traitKeys, portraitKey: null });
            expect(appearance).not.toBe('');
            expect(biography).not.toBe('');
            expect(biography).not.toMatch(/[{}]/);
            expect([...appearance].length).toBeLessThanOrEqual(longest.appearance);
            expect([...biography].length).toBeLessThanOrEqual(longest.heroBiography);
            seen.appearance = Math.max(seen.appearance, [...appearance].length);
            seen.biography = Math.max(seen.biography, [...biography].length);
          }
        }
      }
    }
    expect(index).toBe(sexes.length * 12 * heroBackgrounds.length * Object.keys(shipped.classes).length);
    expect(longest.heroBiography).toBeLessThanOrEqual(descriptiveAttributeMaxLength.biography);
    expect(seen.biography).toBeGreaterThan(0);
  });

  test('every Guildmaster and Hero of 10 new games has three texts within their bounds, a Guildmaster with a picture that fits or none, a Hero the Silhouette (DL-135 item 8)', () => {
    let pictured = 0;
    for (let index = 0; index < 10; index += 1) {
      const { document } = createWorld(`world-${index}`, { guildName: 'G', guildmasterName: 'M', createdAt: 'test' }, deps);
      for (const guildmaster of Object.values(document.world.guildmasters)) {
        // A picture's narrative is the Appearance (DL-127 item 4); every Guildmaster may have one.
        if (guildmaster.portraitKey !== null) {
          pictured += 1;
          expect(guildmaster.appearance).toBe(shipped.portraitAppearances.portraits[guildmaster.portraitKey]?.narrative);
        }
        for (const attribute of descriptiveAttributes) {
          expect(guildmaster[attribute]).not.toBe('');
          expect([...guildmaster[attribute]].length).toBeLessThanOrEqual(descriptiveAttributeMaxLength[attribute]);
        }
      }
      for (const hero of Object.values(document.world.heroes)) {
        expect(hero.portraitKey).toBeNull();
        expect(hero.appearance).not.toBe('');
        expect(hero.biography).not.toBe('');
        expect([...hero.appearance].length).toBeLessThanOrEqual(descriptiveAttributeMaxLength.appearance);
        expect([...hero.biography].length).toBeLessThanOrEqual(longest.heroBiography);
      }
    }
    expect(pictured).toBeGreaterThan(10);
  });
});
