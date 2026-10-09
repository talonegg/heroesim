import { describe, expect, test } from 'vitest';
import { contentWarnings } from '../index.js';
import { realFiles, parse, withJson, changed, refusalOf, guildmasterRow, heroRow, withPicture, ownersTwo, pictureRowOf, type PictureRow } from './content.test-support.js';

// The pictures' rows' refusals, and the warnings of pictures short (DL-243). Each is triggered by content built in memory from the shipped files with one
// thing broken, read and checked as `parseContent` does, and names the offending key, so an author
// can find it.

// The file is parsed and its keys held to the pictures, with the rest of DL-127's checks; each row has
// its role's fields, and `features` in the place of `keywords`
// (DL-134 items 3 and 10, DL-135 item 2).
describe('the Appearances mapped to pictures (DL-126 item 2, DL-127)', () => {
  test('are required as a file', () => {
    const files = realFiles();
    delete files['portrait-appearances.json'];
    expect(refusalOf(() => parse(files)).message).toContain('portrait-appearances.json: missing');
  });

  test("are refused with a row whose key names no picture, another role's included", () => {
    const files = changed(ownersTwo(realFiles()), 'portrait-appearances.json', (json) => {
      (json.portraits as unknown as Record<string, PictureRow>)['gm-male-09'] = guildmasterRow();
    });
    expect(refusalOf(() => parse(files)).message).toContain('portraitAppearances.portraits: "gm-male-09" names no picture in portraits.json');

    const mapped = withPicture(ownersTwo(realFiles()), 'hero', 'female', 'hero-female-01', heroRow());
    expect(Object.keys(parse(mapped).portraitAppearances.portraits)).toEqual(['gm-male-01', 'gm-female-01', 'hero-female-01']);
  });

  test('are refused with a field missing or unknown, keywords as v1.1.2 wrote them, or a row that is no object', () => {
    const files = withJson('portrait-appearances.json', (json) => {
      (json.features['beard'] as unknown as Record<string, unknown>)['maleOnly'] = 'yes';
      (json.features['scar'] as unknown as Record<string, unknown>)['slot'] = 'mark';
      delete pictureRowOf(json, 'gm-male-01')['narrative'];
      pictureRowOf(json, 'gm-male-01')['dress'] = 'a coat';
      pictureRowOf(json, 'gm-male-01')['apparentAge'] = 'old';
      (json.portraits as unknown as Record<string, unknown>)['gm-female-01'] = 'long dark hair';
      (json as unknown as Record<string, unknown>)['keywords'] = {};
    });

    const { message } = refusalOf(() => parse(files));
    expect(message).toContain('portrait-appearances.json: features.beard.maleOnly is "yes"; expected true or false');
    expect(message).toContain('portrait-appearances.json: features.scar.slot is not a field of a feature');
    expect(message).toContain('portrait-appearances.json: portraits.gm-male-01.narrative is missing');
    expect(message).toContain("portrait-appearances.json: portraits.gm-male-01.dress is not a field of a picture's row");
    expect(message).toContain('portrait-appearances.json: portraits.gm-male-01.apparentAge is "old"; expected a list of numbers');
    expect(message).toContain('portrait-appearances.json: portraits.gm-female-01 must be an object');
    expect(message).toContain('portrait-appearances.json: keywords is not a field of the Appearances mapped to pictures');
  });
});

describe("a picture's row (DL-134 items 3 and 10, DL-135 item 2)", () => {
  test("is required for every Guildmaster's and Hero's picture, each named, and a Patron's picture has none yet", () => {
    let files = withPicture(ownersTwo(realFiles()), 'guildmaster', 'male', 'gm-male-02', undefined);
    files = withPicture(files, 'hero', 'female', 'hero-female-01', undefined);
    files = withPicture(files, 'patron', 'female', 'patron-female-01', guildmasterRow());

    const { message } = refusalOf(() => parse(files));
    expect(message).toContain('portraitAppearances.portraits: "gm-male-02", a picture in portraits.json, has no row');
    expect(message).toContain('portraitAppearances.portraits: "hero-female-01", a picture in portraits.json, has no row');
    expect(message).toContain("portraitAppearances.portraits.patron-female-01: a Patron's picture has no row yet (DL-135 item 10)");

    const patron = withPicture(realFiles(), 'patron', 'female', 'patron-female-01', undefined);
    expect(parse(patron).portraits.patron.female).toEqual(['patron-female-01']);
  });

  test("has exactly its role's fields: a Guildmaster's one or two callings and no classes, a Hero's one or more classes and no callings", () => {
    let files = withPicture(realFiles(), 'hero', 'female', 'hero-female-01', { ...heroRow(), classes: undefined, callings: ['soldier'] });
    files = withPicture(files, 'hero', 'male', 'hero-male-01', { ...heroRow(), classes: [] });
    files = changed(files, 'portrait-appearances.json', (json) => {
      delete pictureRowOf(json, 'gm-male-01')['callings'];
      pictureRowOf(json, 'gm-male-01')['classes'] = ['warrior'];
      pictureRowOf(json, 'gm-female-01')['callings'] = ['soldier', 'scholar', 'mage'];
    });

    const { message } = refusalOf(() => parse(files));
    expect(message).toContain("portraitAppearances.portraits.gm-male-01.callings is missing: a Guildmaster's picture has one or two");
    expect(message).toContain("portraitAppearances.portraits.gm-male-01.classes: a Guildmaster's picture has callings, not classes");
    expect(message).toContain("portraitAppearances.portraits.gm-female-01.callings has 3; a Guildmaster's picture has one or two");
    expect(message).toContain("portraitAppearances.portraits.hero-female-01.classes is missing: a Hero's picture has one or more");
    expect(message).toContain("portraitAppearances.portraits.hero-female-01.callings: a Hero's picture has classes, not callings");
    expect(message).toContain("portraitAppearances.portraits.hero-male-01.classes has 0; a Hero's picture has one or more");
  });

  test('is refused with a field no role has, such as the backgrounds DL-134 first gave a Hero, or a required field missing', () => {
    const files = withPicture(realFiles(), 'hero', 'female', 'hero-female-01', { ...heroRow(), backgrounds: ['farm-born'], station: undefined });
    const { message } = refusalOf(() => parse(files));
    expect(message).toContain("portrait-appearances.json: portraits.hero-female-01.backgrounds is not a field of a picture's row");
    expect(message).toContain('portrait-appearances.json: portraits.hero-female-01.station is missing');
  });

  test('is refused with a station, temper, calling, Class or feature that is not defined, or one listed twice, each named', () => {
    let files = withPicture(realFiles(), 'hero', 'male', 'hero-male-01', { ...heroRow(), classes: ['warrior', 'bard', 'warrior'] });
    files = changed(files, 'portrait-appearances.json', (json) => {
      const row = pictureRowOf(json, 'gm-male-01');
      row['station'] = 'noble';
      row['temper'] = 'grim';
      row['callings'] = ['soldier', 'priest'];
      row['features'] = ['beard', 'tattoo', 'beard'];
      pictureRowOf(json, 'gm-female-01')['callings'] = ['soldier', 'soldier'];
    });

    const { message } = refusalOf(() => parse(files));
    const at = 'portraitAppearances.portraits.gm-male-01';
    expect(message).toContain(`${at}.station: "noble" is not a station defined in descriptions.stations`);
    expect(message).toContain(`${at}.temper: "grim" is not a temper defined in descriptions.tempers`);
    expect(message).toContain(`${at}.callings: "priest" is not a calling defined in descriptions.callings`);
    expect(message).toContain(`${at}.features: "tattoo" is not a feature defined under features`);
    expect(message).toContain(`${at}.features: "beard" is listed twice`);
    expect(message).toContain('portraitAppearances.portraits.gm-female-01.callings: "soldier" is listed twice');
    expect(message).toContain('portraitAppearances.portraits.hero-male-01.classes: "bard" is not a Class');
    expect(message).toContain('portraitAppearances.portraits.hero-male-01.classes: "warrior" is listed twice');
  });

  test("is refused with a maleOnly feature on a female picture's, and a feature showing what is no Hero Trait or keyed out of lower case and hyphens", () => {
    let files = withPicture(realFiles(), 'hero', 'female', 'hero-female-01', { ...heroRow(), features: ['beard'] });
    files = changed(files, 'portrait-appearances.json', (json) => {
      pictureRowOf(json, 'gm-female-01')['features'] = ['braids', 'beard'];
      const scar = json.features['scar'];
      if (scar !== undefined) scar.shows = ['scarred', 'brave', 'thrifty'];
      json.features['Grey_Hair'] = { maleOnly: false, shows: [] };
    });

    const { message } = refusalOf(() => parse(files));
    expect(message).toContain('portraitAppearances.portraits.gm-female-01.features: "beard" is maleOnly, and this is a female picture');
    expect(message).toContain('portraitAppearances.portraits.hero-female-01.features: "beard" is maleOnly, and this is a female picture');
    expect(message).toContain('portraitAppearances.features.scar.shows: "brave" is not a Hero Trait');
    expect(message).toContain('portraitAppearances.features.scar.shows: "thrifty" is not a Hero Trait');
    expect(message).toContain('portraitAppearances.features: "Grey_Hair" is not lower case and hyphens');
    expect(message).not.toContain('"scarred" is not a Hero Trait');
  });

  test('is refused with an apparentAge that is not two whole numbers from 0 in order', () => {
    let files = withPicture(realFiles(), 'hero', 'female', 'hero-female-01', { ...heroRow(), apparentAge: [20] });
    files = withPicture(files, 'hero', 'male', 'hero-male-01', { ...heroRow(), apparentAge: [-1, 5] });
    files = changed(files, 'portrait-appearances.json', (json) => {
      pictureRowOf(json, 'gm-male-01')['apparentAge'] = [55, 45];
      pictureRowOf(json, 'gm-female-01')['apparentAge'] = [22.5, 30];
    });

    const { message } = refusalOf(() => parse(files));
    const rule = 'it is two whole numbers from 0, the first no greater than the second';
    expect(message).toContain(`portraitAppearances.portraits.gm-male-01.apparentAge is [55,45]; ${rule}`);
    expect(message).toContain(`portraitAppearances.portraits.gm-female-01.apparentAge is [22.5,30]; ${rule}`);
    expect(message).toContain(`portraitAppearances.portraits.hero-female-01.apparentAge is [20]; ${rule}`);
    expect(message).toContain(`portraitAppearances.portraits.hero-male-01.apparentAge is [-1,5]; ${rule}`);

    const one = withJson('portrait-appearances.json', (json) => {
      pictureRowOf(json, 'gm-male-01')['apparentAge'] = [40, 40];
    });
    expect(parse(one).portraitAppearances.portraits['gm-male-01']?.apparentAge).toEqual([40, 40]);
  });

  test('is refused with a narrative past 260 characters or empty, a hook past 160, a third hook, or a hook that is no sentence or names a Birthplace', () => {
    const files = withJson('portrait-appearances.json', (json) => {
      const male = pictureRowOf(json, 'gm-male-01');
      male['narrative'] = `A${'x'.repeat(259)}.`;
      male['hooks'] = [`A${'x'.repeat(159)}.`, 'a hook in lower case.', '{He} left {birthplace}.'];
      pictureRowOf(json, 'gm-female-01')['narrative'] = '  ';
    });

    const { message } = refusalOf(() => parse(files));
    const at = 'portraitAppearances.portraits.gm-male-01';
    expect(message).toContain(`${at}.narrative is 261 characters; a narrative holds at most 260`);
    expect(message).toContain('portraitAppearances.portraits.gm-female-01.narrative is empty');
    expect(message).toContain(`${at}.hooks has 3; a picture has at most two`);
    expect(message).toContain(`${at}.hooks.0 is 161 characters; a hook holds at most 160`);
    expect(message).toContain(`${at}.hooks.1 is no sentence: trimmed, a capital first and a full stop last`);
    expect(message).toContain(`${at}.hooks.2: {birthplace} is not a slot; the slots are {he}`);
  });

  // A narrative is shown as written (DL-127 item 4), so a slot in it would show as braces
  // (DL-138's open point, closed by DL-141); a hook is filled, and a stray brace in one is refused.
  test('is refused with a narrative holding a slot or a brace, or a hook with a brace that is no slot', () => {
    const files = withJson('portrait-appearances.json', (json) => {
      pictureRowOf(json, 'gm-male-01')['narrative'] = '{His} face is weathered.';
      pictureRowOf(json, 'gm-female-01')['narrative'] = 'A strong face } with a stray brace.';
      pictureRowOf(json, 'gm-female-01')['hooks'] = ['{He keeps a secret.'];
    });

    const { message } = refusalOf(() => parse(files));
    const rule = 'a narrative is shown as written, so it has no slot and no brace';
    expect(message).toContain(`portraitAppearances.portraits.gm-male-01.narrative holds "{"; ${rule}`);
    expect(message).toContain(`portraitAppearances.portraits.gm-female-01.narrative holds "}"; ${rule}`);
    expect(message).toContain('portraitAppearances.portraits.gm-female-01.hooks.0 has a brace that is no slot');
  });

  test("accepts a narrative of exactly 260 characters and a hook of exactly 160, filled with its picture's pronouns", () => {
    const files = withJson('portrait-appearances.json', (json) => {
      const male = pictureRowOf(json, 'gm-male-01');
      male['narrative'] = `A${'x'.repeat(258)}.`;
      // "{He}" is written "He" for a man's picture: 2 + 158 = 160.
      male['hooks'] = [`{He}${'x'.repeat(157)}.`, '{He} keeps {his} counsel.'];
    });
    const row = parse(files).portraitAppearances.portraits['gm-male-01'];
    expect([...(row?.narrative ?? '')]).toHaveLength(260);
    expect(row?.hooks).toHaveLength(2);
  });
});

describe('the pictures short of three (DL-134 item 10)', () => {
  test('are warned of, not refused: each sex and band of Guildmaster pictures, and each Class and sex of Hero pictures', () => {
    let files = withPicture(ownersTwo(realFiles()), 'guildmaster', 'male', 'gm-male-02', { ...guildmasterRow(), apparentAge: [38, 46] });
    files = withPicture(files, 'guildmaster', 'male', 'gm-male-03', { ...guildmasterRow(), apparentAge: [41, 60] });
    files = withPicture(files, 'hero', 'female', 'hero-female-01', { ...heroRow(), classes: ['warrior', 'rogue'] });

    const set = parse(files);
    const warnings = contentWarnings(set);
    // gm-male-01 (45 to 55), gm-male-02 (38 to 46, touching middle and older) and gm-male-03 make three older men.
    expect(warnings).toContain('portraits.guildmaster.male: 1 picture in the middle band, fewer than 3');
    expect(warnings).toContain('portraits.guildmaster.female: 0 pictures in the older band, fewer than 3');
    expect(warnings).toContain('portraits.hero.female: 1 picture of the Class warrior, fewer than 3');
    expect(warnings).toContain('portraits.hero.female: 1 picture of the Class rogue, fewer than 3');
    expect(warnings).toContain('portraits.hero.male: 0 pictures of the Class healer, fewer than 3');
    expect(warnings.filter((warning) => warning.includes('in the older band'))).toEqual(['portraits.guildmaster.female: 0 pictures in the older band, fewer than 3']);
  });
});
