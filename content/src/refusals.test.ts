import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type {
  Background,
  Class,
  Descriptions,
  Disposition,
  Encounter,
  InjuryType,
  Names,
  PortraitAppearance,
  PortraitAppearances,
  Portraits,
  QuestTemplate,
  Skill,
  Sphere,
  LootTable,
  Stat,
  Synergy,
  Trait,
} from '@heroesim/engine';
import { describe, expect, test } from 'vitest';
import { ContentError, contentFiles, contentWarnings, longestDescriptions, parseContent, validateContent } from './index.js';
import { contentDir, loadContent } from './node.js';

// Each refusal of the content schema (M1-S4), triggered by a fixture made from the real files
// with one thing broken. Every refusal throws a ContentError whose message names the offending
// key, so an author can find it.

type Rows<Row> = Record<string, Omit<Row, 'key'>>;

interface Files {
  'stats.json': Rows<Stat>;
  'classes.json': Rows<Class>;
  'skills.json': Rows<Skill>;
  'traits.json': Rows<Trait>;
  'backgrounds.json': Rows<Background>;
  'spheres.json': Rows<Sphere>;
  'names.json': Names;
  'quest-templates.json': Rows<QuestTemplate>;
  'injuries.json': Rows<InjuryType>;
  'dispositions.json': Rows<Disposition>;
  'encounters.json': Rows<Encounter>;
  'synergies.json': Rows<Synergy>;
  /** Written loosely: a row is gear or a consumable, and the tests give one the other's fields. */
  'items.json': Record<string, Record<string, unknown>>;
  'loot-tables.json': Rows<LootTable>;
  'portraits.json': Portraits;
  'portrait-appearances.json': PortraitAppearances;
  'descriptions.json': Descriptions;
}

function realFiles(): Record<string, string> {
  return Object.fromEntries(
    contentFiles.map((name) => [name, readFileSync(join(contentDir, name), 'utf8')]),
  );
}

/** The real files with one of them changed as JSON. */
function withJson<File extends keyof Files>(
  file: File,
  change: (json: Files[File]) => void,
): Record<string, string> {
  return changed(realFiles(), file, change);
}

/** `files` with one of them changed as JSON, so that several may be changed in turn. */
function changed<File extends keyof Files>(
  files: Record<string, string>,
  file: File,
  change: (json: Files[File]) => void,
): Record<string, string> {
  const json = JSON.parse(files[file] ?? '') as Files[File];
  change(json);
  return { ...files, [file]: JSON.stringify(json, null, 2) };
}

/** A picture's row, as it is written in `portrait-appearances.json` (v1.1.3-S1). */
type PictureRow = Record<string, unknown>;

/** A Guildmaster's picture's row that passes every check: its role's fields and no other's (DL-134 item 3). */
const guildmasterRow = (): PictureRow => ({
  apparentAge: [33, 44],
  station: 'trade',
  callings: ['merchant'],
  temper: 'calculating',
  narrative: 'A narrow, clever face.',
});

/** A Hero's picture's row that passes every check: `classes` in the place of `callings` (DL-135 item 2). */
const heroRow = (): PictureRow => ({
  apparentAge: [24, 32],
  station: 'common',
  temper: 'steady',
  classes: ['warrior'],
  features: ['scar'],
  narrative: 'A plain, open face.',
});

/**
 * `files` with a picture of `role` and `sex` listed in `portraits.json` under `key`, and its row, if
 * one is given, in `portrait-appearances.json`.
 */
function withPicture(
  files: Record<string, string>,
  role: keyof Portraits,
  sex: 'female' | 'male',
  key: string,
  row: PictureRow | undefined,
): Record<string, string> {
  const listed = changed(files, 'portraits.json', (json) => {
    json[role][sex].push(key);
  });
  if (row === undefined) return listed;
  return changed(listed, 'portrait-appearances.json', (json) => {
    (json.portraits as unknown as Record<string, PictureRow>)[key] = row;
  });
}

/** The row of `key` in a `portrait-appearances.json` being changed, loosely typed, so a test may break it. */
const rowOf = (json: PortraitAppearances, key: string): PictureRow => (json.portraits as unknown as Record<string, PictureRow>)[key] ?? {};

/** The real files with one of them replaced by raw text. */
function withText(file: keyof Files, text: string): Record<string, string> {
  return { ...realFiles(), [file]: text };
}

function refusalOf(run: () => unknown): ContentError {
  try {
    run();
  } catch (error) {
    if (error instanceof ContentError) return error;
    throw error;
  }
  throw new Error('expected a ContentError, but the content was accepted');
}

const warrior = (json: Files['classes.json']) => json['warrior'] as Omit<Class, 'key'>;
const barrow = (json: Files['quest-templates.json']) => json['clear-the-barrow'] as Template;

type Template = Omit<QuestTemplate, 'key'>;
const stat = (json: Files['stats.json'], key: string) => json[key] as Omit<Stat, 'key'>;

describe('the real content', () => {
  test('is accepted', () => {
    expect(() => parseContent(realFiles())).not.toThrow();
  });
});

describe('a Class naming a Stat or Skill that does not exist', () => {
  test('is refused for an unknown leading Stat, naming the Class and the Stat', () => {
    const files = withJson('classes.json', (json) => warrior(json).leadingStats.push('strenght'));

    expect(refusalOf(() => parseContent(files)).message).toMatch(/warrior.*"strenght"/);
  });

  test('is refused for a Guildmaster Stat among its leading Stats', () => {
    const files = withJson('classes.json', (json) => warrior(json).leadingStats.push('inspiration'));

    expect(refusalOf(() => parseContent(files)).message).toMatch(/warrior.*"inspiration"/);
  });

  test('is refused for an unknown Stat in its growth', () => {
    const files = withJson('classes.json', (json) => {
      const growth = warrior(json).growth;
      growth['luck'] = growth['strength'] ?? 0;
      delete growth['strength'];
    });

    expect(refusalOf(() => parseContent(files)).message).toMatch(/warrior.*"luck"/);
  });

  test('is refused for an unknown Skill, naming the Class and the Skill', () => {
    const files = withJson('classes.json', (json) => warrior(json).gatedSkills.push('axemanship'));

    expect(refusalOf(() => parseContent(files)).message).toMatch(/warrior.*"axemanship"/);
  });

  test('is refused for a Skill it gates twice', () => {
    const files = withJson('classes.json', (json) => warrior(json).gatedSkills.push('tactics'));

    expect(refusalOf(() => parseContent(files)).message).toMatch(/warrior.*"tactics"/);
  });
});

describe('a Stat', () => {
  test('with min greater than max is refused, naming the Stat', () => {
    const files = withJson('stats.json', (json) => {
      stat(json, 'strength').min = 21;
    });

    expect(refusalOf(() => parseContent(files)).message).toContain(
      'stats.strength: min 21 is greater than max 20',
    );
  });

  test('with its default outside its range is refused, naming the Stat', () => {
    const files = withJson('stats.json', (json) => {
      stat(json, 'wits').default = 0;
    });

    expect(refusalOf(() => parseContent(files)).message).toContain(
      'stats.wits: default 0 is outside 1 to 20',
    );
  });
});

describe('a duplicate key, found in the raw text because JSON.parse keeps only the last', () => {
  test('among the rows of a file is refused, naming the key and its line', () => {
    const text = realFiles()['stats.json']?.replace(
      /^\{/,
      '{\n  "strength": { "name": "Strength", "area": "physical", "min": 1, "max": 20, "default": 10, "owner": "hero" },',
    );
    const files = withText('stats.json', text ?? '');

    expect(refusalOf(() => parseContent(files)).message).toMatch(
      /stats\.json: duplicate key "strength" at the top level \(line \d+\)/,
    );
  });

  test('inside a row is refused, naming the key and where it is', () => {
    const text = realFiles()['classes.json']?.replace(
      '"strength": 0.1667,',
      '"strength": 0.1667, "strength": 0.1667,',
    );
    const files = withText('classes.json', text ?? '');

    expect(refusalOf(() => parseContent(files)).message).toMatch(
      /classes\.json: duplicate key "strength" in warrior\.growth/,
    );
  });
});

describe('a name list', () => {
  test.each([
    ['given.female', (json: Names) => void (json.given.female = [])],
    ['given.male', (json: Names) => void (json.given.male = [])],
    ['family', (json: Names) => void (json.family = [])],
    ['guild', (json: Names) => void (json.guild = [])],
    ['patron', (json: Names) => void (json.patron = [])],
  ])('that is empty is refused, naming the list: %s', (list, change) => {
    const files = withJson('names.json', change);

    expect(refusalOf(() => parseContent(files)).message).toContain(`names.${list} is empty`);
  });

  test('that repeats a name is refused, naming the name', () => {
    const files = withJson('names.json', (json) => json.family.push('Wray'));

    expect(refusalOf(() => parseContent(files)).message).toMatch(/names\.family.*"Wray"/);
  });
});

describe("a Patron's name (v1.1.2-S3, DL-125 item 5)", () => {
  test('without its sex is refused, naming where it is', () => {
    const files = withJson('names.json', (json) => {
      json.patron[3] = { name: 'Denholm Crane' } as Names['patron'][number];
    });

    expect(refusalOf(() => parseContent(files)).message).toContain('names.json: patron.3.sex is missing');
  });

  test('written as a bare name, as before, is refused', () => {
    const files = withJson('names.json', (json) => {
      (json.patron as unknown[])[0] = 'Aldous Fairweather';
    });

    expect(refusalOf(() => parseContent(files)).message).toContain('names.json: patron.0 is "Aldous Fairweather"; expected an object');
  });

  test('with a sex that is not female or male is refused', () => {
    const files = withJson('names.json', (json) => {
      json.patron[0] = { name: 'Aldous Fairweather', sex: 'body' as Names['patron'][number]['sex'] };
    });

    expect(refusalOf(() => parseContent(files)).message).toMatch(/names\.json: patron\.0\.sex is "body"; expected one of female, male/);
  });

  test('listed twice is refused, naming the name', () => {
    const files = withJson('names.json', (json) => json.patron.push({ name: 'Jocelyn Pike', sex: 'female' }));

    expect(refusalOf(() => parseContent(files)).message).toMatch(/names\.patron: "Jocelyn Pike" is listed twice/);
  });
});

describe('the Portraits (v1.1.2-S3, DL-125 item 3)', () => {
  test('are required as a file, which may list none', () => {
    const files = realFiles();
    delete files['portraits.json'];

    expect(refusalOf(() => parseContent(files)).message).toContain('portraits.json: missing');
  });

  // A Guildmaster's and a Hero's picture has its row since v1.1.3-S1 (DL-134 item 10); a Patron's none yet.
  test('are accepted with a picture of each role and sex', () => {
    let files = withPicture(realFiles(), 'guildmaster', 'female', 'gm-female-02', guildmasterRow());
    files = withPicture(files, 'guildmaster', 'male', 'gm-male-02', guildmasterRow());
    files = withPicture(files, 'hero', 'female', 'hero-female-01', heroRow());
    files = withPicture(files, 'patron', 'male', 'patron-male-01', undefined);

    expect(parseContent(files).portraits.guildmaster).toEqual({ female: ['gm-female-01', 'gm-female-02'], male: ['gm-male-01', 'gm-male-02'] });
  });

  test.each([
    ['a key not in lower case and hyphens', (json: Portraits) => json.guildmaster.male.push('gm-Male-01'), /portraits\.guildmaster\.male: "gm-Male-01" is not lower case and hyphens/],
    ["a key without its role's prefix", (json: Portraits) => json.guildmaster.male.push('hero-male-01'), /portraits\.guildmaster\.male: "hero-male-01" does not begin "gm-"/],
    ['a key listed twice', (json: Portraits) => {
      json.guildmaster.male.push('gm-01');
      json.guildmaster.female.push('gm-01');
    }, /portraits: "gm-01" is listed twice/],
  ])('are refused with %s', (_, change, message) => {
    const files = withJson('portraits.json', change);

    expect(refusalOf(() => parseContent(files)).message).toMatch(message);
  });

  test('are refused with a role or a sex not laid out', () => {
    const files = withJson('portraits.json', (json) => {
      (json as unknown as Record<string, unknown>)['rival'] = { female: [], male: [] };
      (json.hero as unknown as Record<string, unknown>)['other'] = [];
    });

    const { message } = refusalOf(() => parseContent(files));
    expect(message).toContain('portraits.json: rival is not a field of the Portraits');
    expect(message).toContain('portraits.json: hero.other is not a field of');
  });

  test('are refused with a picture given as its file, as the epic first wrote it', () => {
    const files = withJson('portraits.json', (json) => {
      (json.guildmaster.male as unknown[]).push({ key: 'gm-male-01', file: 'gm-male-01.webp' });
    });

    expect(refusalOf(() => parseContent(files)).message).toContain('portraits.json: guildmaster.male');
  });
});

// v1.1.2-S4 parses the file and holds its keys to the pictures; v1.1.2-S5 adds the rest of DL-127's
// checks; v1.1.3-S1 gives each row its role's fields, and `features` in the place of `keywords`
// (DL-134 items 3 and 10, DL-135 item 2).
describe('the Appearances mapped to pictures (v1.1.2-S4, DL-126 item 2, DL-127)', () => {
  test('are required as a file', () => {
    const files = realFiles();
    delete files['portrait-appearances.json'];
    expect(refusalOf(() => parseContent(files)).message).toContain('portrait-appearances.json: missing');
  });

  test("are refused with a row whose key names no picture, another role's included", () => {
    const files = withJson('portrait-appearances.json', (json) => {
      (json.portraits as unknown as Record<string, PictureRow>)['gm-male-09'] = guildmasterRow();
    });
    expect(refusalOf(() => parseContent(files)).message).toContain('portraitAppearances.portraits: "gm-male-09" names no picture in portraits.json');

    const mapped = withPicture(realFiles(), 'hero', 'female', 'hero-female-01', heroRow());
    expect(Object.keys(parseContent(mapped).portraitAppearances.portraits)).toEqual(['gm-male-01', 'gm-female-01', 'hero-female-01']);
  });

  test('are refused with a field missing or unknown, keywords as v1.1.2 wrote them, or a row that is no object', () => {
    const files = withJson('portrait-appearances.json', (json) => {
      (json.features['beard'] as unknown as Record<string, unknown>)['maleOnly'] = 'yes';
      (json.features['scar'] as unknown as Record<string, unknown>)['slot'] = 'mark';
      delete rowOf(json, 'gm-male-01')['narrative'];
      rowOf(json, 'gm-male-01')['dress'] = 'a coat';
      rowOf(json, 'gm-male-01')['apparentAge'] = 'old';
      (json.portraits as unknown as Record<string, unknown>)['gm-female-01'] = 'long dark hair';
      (json as unknown as Record<string, unknown>)['keywords'] = {};
    });

    const { message } = refusalOf(() => parseContent(files));
    expect(message).toContain('portrait-appearances.json: features.beard.maleOnly is "yes"; expected true or false');
    expect(message).toContain('portrait-appearances.json: features.scar.slot is not a field of a feature');
    expect(message).toContain('portrait-appearances.json: portraits.gm-male-01.narrative is missing');
    expect(message).toContain("portrait-appearances.json: portraits.gm-male-01.dress is not a field of a picture's row");
    expect(message).toContain('portrait-appearances.json: portraits.gm-male-01.apparentAge is "old"; expected a list of numbers');
    expect(message).toContain('portrait-appearances.json: portraits.gm-female-01 must be an object');
    expect(message).toContain('portrait-appearances.json: keywords is not a field of the Appearances mapped to pictures');
  });
});

describe("a picture's row (v1.1.3-S1, DL-134 items 3 and 10, DL-135 item 2)", () => {
  test("is required for every Guildmaster's and Hero's picture, each named, and a Patron's picture has none yet", () => {
    let files = withPicture(realFiles(), 'guildmaster', 'male', 'gm-male-02', undefined);
    files = withPicture(files, 'hero', 'female', 'hero-female-01', undefined);
    files = withPicture(files, 'patron', 'female', 'patron-female-01', guildmasterRow());

    const { message } = refusalOf(() => parseContent(files));
    expect(message).toContain('portraitAppearances.portraits: "gm-male-02", a picture in portraits.json, has no row');
    expect(message).toContain('portraitAppearances.portraits: "hero-female-01", a picture in portraits.json, has no row');
    expect(message).toContain("portraitAppearances.portraits.patron-female-01: a Patron's picture has no row yet (DL-135 item 10)");

    const patron = withPicture(realFiles(), 'patron', 'female', 'patron-female-01', undefined);
    expect(parseContent(patron).portraits.patron.female).toEqual(['patron-female-01']);
  });

  test("has exactly its role's fields: a Guildmaster's one or two callings and no classes, a Hero's one or more classes and no callings", () => {
    let files = withPicture(realFiles(), 'hero', 'female', 'hero-female-01', { ...heroRow(), classes: undefined, callings: ['soldier'] });
    files = withPicture(files, 'hero', 'male', 'hero-male-01', { ...heroRow(), classes: [] });
    files = changed(files, 'portrait-appearances.json', (json) => {
      delete rowOf(json, 'gm-male-01')['callings'];
      rowOf(json, 'gm-male-01')['classes'] = ['warrior'];
      rowOf(json, 'gm-female-01')['callings'] = ['soldier', 'scholar', 'mage'];
    });

    const { message } = refusalOf(() => parseContent(files));
    expect(message).toContain("portraitAppearances.portraits.gm-male-01.callings is missing: a Guildmaster's picture has one or two");
    expect(message).toContain("portraitAppearances.portraits.gm-male-01.classes: a Guildmaster's picture has callings, not classes");
    expect(message).toContain("portraitAppearances.portraits.gm-female-01.callings has 3; a Guildmaster's picture has one or two");
    expect(message).toContain("portraitAppearances.portraits.hero-female-01.classes is missing: a Hero's picture has one or more");
    expect(message).toContain("portraitAppearances.portraits.hero-female-01.callings: a Hero's picture has classes, not callings");
    expect(message).toContain("portraitAppearances.portraits.hero-male-01.classes has 0; a Hero's picture has one or more");
  });

  test('is refused with a field no role has, such as the backgrounds DL-134 first gave a Hero, or a required field missing', () => {
    const files = withPicture(realFiles(), 'hero', 'female', 'hero-female-01', { ...heroRow(), backgrounds: ['farm-born'], station: undefined });
    const { message } = refusalOf(() => parseContent(files));
    expect(message).toContain("portrait-appearances.json: portraits.hero-female-01.backgrounds is not a field of a picture's row");
    expect(message).toContain('portrait-appearances.json: portraits.hero-female-01.station is missing');
  });

  test('is refused with a station, temper, calling, Class or feature that is not defined, or one listed twice, each named', () => {
    let files = withPicture(realFiles(), 'hero', 'male', 'hero-male-01', { ...heroRow(), classes: ['warrior', 'bard', 'warrior'] });
    files = changed(files, 'portrait-appearances.json', (json) => {
      const row = rowOf(json, 'gm-male-01');
      row['station'] = 'noble';
      row['temper'] = 'grim';
      row['callings'] = ['soldier', 'priest'];
      row['features'] = ['beard', 'tattoo', 'beard'];
      rowOf(json, 'gm-female-01')['callings'] = ['soldier', 'soldier'];
    });

    const { message } = refusalOf(() => parseContent(files));
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
      rowOf(json, 'gm-female-01')['features'] = ['braids', 'beard'];
      const scar = json.features['scar'];
      if (scar !== undefined) scar.shows = ['scarred', 'brave', 'thrifty'];
      json.features['Grey_Hair'] = { maleOnly: false, shows: [] };
    });

    const { message } = refusalOf(() => parseContent(files));
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
      rowOf(json, 'gm-male-01')['apparentAge'] = [55, 45];
      rowOf(json, 'gm-female-01')['apparentAge'] = [22.5, 30];
    });

    const { message } = refusalOf(() => parseContent(files));
    const rule = 'it is two whole numbers from 0, the first no greater than the second';
    expect(message).toContain(`portraitAppearances.portraits.gm-male-01.apparentAge is [55,45]; ${rule}`);
    expect(message).toContain(`portraitAppearances.portraits.gm-female-01.apparentAge is [22.5,30]; ${rule}`);
    expect(message).toContain(`portraitAppearances.portraits.hero-female-01.apparentAge is [20]; ${rule}`);
    expect(message).toContain(`portraitAppearances.portraits.hero-male-01.apparentAge is [-1,5]; ${rule}`);

    const one = withJson('portrait-appearances.json', (json) => {
      rowOf(json, 'gm-male-01')['apparentAge'] = [40, 40];
    });
    expect(parseContent(one).portraitAppearances.portraits['gm-male-01']?.apparentAge).toEqual([40, 40]);
  });

  test('is refused with a narrative past 260 characters or empty, a hook past 160, a third hook, or a hook that is no sentence or names a Birthplace', () => {
    const files = withJson('portrait-appearances.json', (json) => {
      const male = rowOf(json, 'gm-male-01');
      male['narrative'] = `A${'x'.repeat(259)}.`;
      male['hooks'] = [`A${'x'.repeat(159)}.`, 'a hook in lower case.', '{He} left {birthplace}.'];
      rowOf(json, 'gm-female-01')['narrative'] = '  ';
    });

    const { message } = refusalOf(() => parseContent(files));
    const at = 'portraitAppearances.portraits.gm-male-01';
    expect(message).toContain(`${at}.narrative is 261 characters; a narrative holds at most 260`);
    expect(message).toContain('portraitAppearances.portraits.gm-female-01.narrative is empty');
    expect(message).toContain(`${at}.hooks has 3; a picture has at most two`);
    expect(message).toContain(`${at}.hooks.0 is 161 characters; a hook holds at most 160`);
    expect(message).toContain(`${at}.hooks.1 is no sentence: trimmed, a capital first and a full stop last`);
    expect(message).toContain(`${at}.hooks.2: {birthplace} is not a slot; the slots are {he}`);
  });

  // A narrative is shown as written (DL-127 item 4), so a slot in it would show as braces
  // (DL-138's open point, closed by v1.1.3-S5); a hook is filled, and a stray brace in one is refused.
  test('is refused with a narrative holding a slot or a brace, or a hook with a brace that is no slot', () => {
    const files = withJson('portrait-appearances.json', (json) => {
      rowOf(json, 'gm-male-01')['narrative'] = '{His} face is weathered.';
      rowOf(json, 'gm-female-01')['narrative'] = 'A strong face } with a stray brace.';
      rowOf(json, 'gm-female-01')['hooks'] = ['{He keeps a secret.'];
    });

    const { message } = refusalOf(() => parseContent(files));
    const rule = 'a narrative is shown as written, so it has no slot and no brace';
    expect(message).toContain(`portraitAppearances.portraits.gm-male-01.narrative holds "{"; ${rule}`);
    expect(message).toContain(`portraitAppearances.portraits.gm-female-01.narrative holds "}"; ${rule}`);
    expect(message).toContain('portraitAppearances.portraits.gm-female-01.hooks.0 has a brace that is no slot');
  });

  test("accepts a narrative of exactly 260 characters and a hook of exactly 160, filled with its picture's pronouns", () => {
    const files = withJson('portrait-appearances.json', (json) => {
      const male = rowOf(json, 'gm-male-01');
      male['narrative'] = `A${'x'.repeat(258)}.`;
      // "{He}" is written "He" for a man's picture: 2 + 158 = 160.
      male['hooks'] = [`{He}${'x'.repeat(157)}.`, '{He} keeps {his} counsel.'];
    });
    const row = parseContent(files).portraitAppearances.portraits['gm-male-01'];
    expect([...(row?.narrative ?? '')]).toHaveLength(260);
    expect(row?.hooks).toHaveLength(2);
  });
});

describe('the vocabulary a picture is read in (v1.1.3-S1, DL-134 item 4)', () => {
  test('is refused with a station, temper or calling out of lower case and hyphens, listed twice, or none at all, each named', () => {
    const files = withJson('descriptions.json', (json) => {
      json.stations.push('Trade', 'common');
      json.tempers = [];
      json.callings['Sea_Captain'] = { suits: [], clashes: [] };
    });

    const { message } = refusalOf(() => parseContent(files));
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

    const { message } = refusalOf(() => parseContent(files));
    expect(message).toContain('descriptions.callings.soldier.suits: "scarred" is not a Guildmaster Trait');
    expect(message).toContain('descriptions.callings.merchant.clashes: "bold" is not a Guildmaster Trait');
    expect(message).toContain('descriptions.callings.merchant: "thrifty" both suits and clashes');

    const unknown = withJson('descriptions.json', (json) => {
      (json.callings['lawyer'] as unknown as Record<string, unknown>)['favours'] = [];
    });
    expect(refusalOf(() => parseContent(unknown)).message).toContain('descriptions.json: callings.lawyer.favours is not a field of a calling');
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

    const { message } = refusalOf(() => parseContent(files));
    expect(message).toContain('backgrounds.farm-born.station: "serf" is not a station defined in descriptions.stations');
    expect(message).toContain('backgrounds.levy-soldier.station is missing: a Hero Background has one');
    expect(message).toContain('backgrounds.old-charter.station: a Guild Background has none');
  });
});

describe("the Biography's sentences from a picture, and a Hero's (v1.1.3-S1, DL-134 items 4 and 6, DL-135 item 6)", () => {
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

    const { message } = refusalOf(() => parseContent(files));
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

    const { message } = refusalOf(() => parseContent(files));
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

    const { message } = refusalOf(() => parseContent(files));
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
      rowOf(json, 'gm-male-01')['hooks'] = [`{He}${' and on'.repeat(20)}.`];
    });

    const { message } = refusalOf(() => parseContent(files));
    expect(message).toMatch(/descriptions\.biography: the longest Biography it can write is 1\d{3} characters; it holds at most 1000/);
    expect(message).toMatch(/descriptions\.heroBiography: the longest Hero's Biography it can write is 1\d{3} characters; it holds at most 1000/);
  });

  test("measure a Guildmaster's Biography by their picture, a hook standing in a career's place, and a Hero's by S6's shape", () => {
    const set = loadContent();
    const tiny = {
      ...set,
      portraitAppearances: {
        ...set.portraitAppearances,
        portraits: {
          ...set.portraitAppearances.portraits,
          'gm-male-01': { ...(set.portraitAppearances.portraits['gm-male-01'] as PortraitAppearance), hooks: ['A hook, much longer than that.'] },
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

describe('the pictures short of three (v1.1.3-S1, DL-134 item 10)', () => {
  test('are warned of, not refused: each sex and band of Guildmaster pictures, and each Class and sex of Hero pictures', () => {
    let files = withPicture(realFiles(), 'guildmaster', 'male', 'gm-male-02', { ...guildmasterRow(), apparentAge: [38, 46] });
    files = withPicture(files, 'guildmaster', 'male', 'gm-male-03', { ...guildmasterRow(), apparentAge: [41, 60] });
    files = withPicture(files, 'hero', 'female', 'hero-female-01', { ...heroRow(), classes: ['warrior', 'rogue'] });

    const set = parseContent(files);
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

describe("what a Guildmaster's descriptive Attributes are written from (v1.1.2-S5, DL-125 item 6)", () => {
  test('are required as a file', () => {
    const files = realFiles();
    delete files['descriptions.json'];
    expect(refusalOf(() => parseContent(files)).message).toContain('descriptions.json: missing');
  });

  test('are refused with a field missing, unknown or of the wrong type, each named', () => {
    const files = withJson('descriptions.json', (json) => {
      const young = json.appearance.female['young'] as unknown as Record<string, unknown>;
      delete young['eyes'];
      young['dress'] = ['A plain dress.'];
      (json.biography as unknown as Record<string, unknown>)['endings'] = {};
      (json as unknown as Record<string, unknown>)['birthplaces'] = 'Saltcote';
      (json.ageBands[0] as unknown as Record<string, unknown>)['from'] = 'birth';
    });

    const { message } = refusalOf(() => parseContent(files));
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

    const { message } = refusalOf(() => parseContent(files));
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

    const { message } = refusalOf(() => parseContent(files));
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

    const { message } = refusalOf(() => parseContent(files));
    expect(message).toContain('descriptions.biography.backgrounds: "farm-born" is not a Guild Background');
    expect(message).toContain('descriptions.biography.traits: "scarred" is not a Guildmaster Trait');
    expect(message).toMatch(/descriptions\.biography\.careers\.young\.5: \{guild\} is not a slot; the slots are \{birthplace\}, \{he\}/);
    expect(message).toMatch(/descriptions\.biography\.careers\.young\.6: \{she\} is not a slot/);
    expect(message).toContain('descriptions.pronouns: every sex has the same slots');
    expect(message).toContain('descriptions.pronouns.male.birthplace: a pronoun\'s slot is a word of letters, and not "birthplace"');
  });

  // v1.1.2-S6: a successor's sentences, and a Birthplace closed in its sentence.
  test("are refused with a successor's sentences missing or empty, or a Birthplace left open in a sentence", () => {
    const missing = withJson('descriptions.json', (json) => {
      delete (json.biography as unknown as Record<string, unknown>)['successors'];
    });
    expect(refusalOf(() => parseContent(missing)).message).toContain('descriptions.json: biography.successors is missing');

    const files = withJson('descriptions.json', (json) => {
      json.biography.successors = [];
      json.biography.origins['young']?.push('{He} left {birthplace} young.');
    });
    const { message } = refusalOf(() => parseContent(files));
    expect(message).toContain('descriptions.biography.successors is empty');
    expect(message).toContain(
      'descriptions.biography.origins.young.5: {birthplace} is followed by a comma or a full stop, since a Birthplace may hold a comma',
    );
  });

  test('are refused with a Birthplace past 60 characters, blank or in lower case, or listed twice', () => {
    const files = withJson('descriptions.json', (json) => {
      json.birthplaces.push(`Saltcote${', by the sea'.repeat(5)}`, 'the Crane Marshes', ' ', "Hob's Ferry");
    });

    const { message } = refusalOf(() => parseContent(files));
    expect(message).toMatch(/descriptions\.birthplaces\.35 is 68 characters; a Birthplace holds at most 60/);
    expect(message).toContain('descriptions.birthplaces.36 is "the Crane Marshes"; it is a place\'s name, trimmed, beginning with a capital');
    expect(message).toContain('descriptions.birthplaces.37 is " "');
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

    const { message } = refusalOf(() => parseContent(files));
    expect(message).toMatch(/descriptions\.appearance: the longest Appearance it can write is 301 characters; it holds at most 280/);
    expect(message).toMatch(/descriptions\.biography: the longest Biography it can write is 1\d{3} characters; it holds at most 1000/);
  });

  test("measure what the engine writes: a Birthplace's slot as long as the bound, the longer sex's pronouns, and only two Traits", () => {
    const set = loadContent();
    const tiny = {
      ...set,
      descriptions: {
        ...set.descriptions,
        biography: {
          origins: { young: ['{He} was born in {birthplace}.'], middle: ['M.'], older: ['O.'] },
          careers: { young: ['C.'], middle: ['C.'], older: ['C.'] },
          backgrounds: {},
          traits: { thrifty: ['Tt.'], miser: ['Mmm.'], spendthrift: ['S.'] },
          closings: { young: ['E.'], middle: ['E.'], older: ['E.'] },
          successors: ['Su.'],
          // No sentence by a picture's station, calling or temper, so the pictures take the band's (v1.1.3-S1).
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

describe('a key that is not kebab-case', () => {
  test.each([
    ['traits.json', 'Old_Soldier'],
    ['skills.json', 'fieldSurgery'],
    ['spheres.json', 'the crown'],
    ['backgrounds.json', '-farm-born'],
    ['dispositions.json', 'Steady'],
  ] as const)('in %s is refused, naming the key: %s', (file, key) => {
    const files = withJson(file, (json) => {
      const rows = json as Record<string, unknown>;
      const [first] = Object.keys(rows);
      rows[key] = rows[first ?? ''];
    });

    expect(refusalOf(() => parseContent(files)).message).toContain(`"${key}" is not kebab-case`);
  });
});

describe("a Class's growth", () => {
  test('whose weights do not sum to 1 is refused, naming the Class and the sum', () => {
    const files = withJson('classes.json', (json) => {
      (json['rogue'] as Omit<Class, 'key'>).growth['dexterity'] = 0.5;
    });

    expect(refusalOf(() => parseContent(files)).message).toMatch(/classes\.rogue\.growth.*sum to 1\.33/);
  });

  test('with a negative weight is refused, naming the Stat', () => {
    const files = withJson('classes.json', (json) => {
      const growth = (json['mage'] as Omit<Class, 'key'>).growth;
      growth['arcana'] = -0.1667;
      growth['power'] = 0.5001;
    });

    expect(refusalOf(() => parseContent(files)).message).toMatch(/classes\.mage\.growth.*"arcana"/);
  });
});

describe('a Quest template', () => {
  test('whose demand weights do not sum to 1 is refused, naming the template and the sum', () => {
    const files = withJson('quest-templates.json', (json) => {
      barrow(json).demands[0] = ['strength', 0.5];
    });

    expect(refusalOf(() => parseContent(files)).message).toMatch(
      /questTemplates\.clear-the-barrow\.demands: weights sum to 1\.2, not 1/,
    );
  });

  test('with a demand of no weight, or no demand at all, is refused', () => {
    const zero = withJson('quest-templates.json', (json) => {
      barrow(json).demands = [['strength', 1], ['courage', 0]];
    });
    const none = withJson('quest-templates.json', (json) => {
      barrow(json).demands = [];
    });

    expect(refusalOf(() => parseContent(zero)).message).toMatch(/clear-the-barrow\.demands.*"courage"/);
    expect(refusalOf(() => parseContent(none)).message).toMatch(/clear-the-barrow\.demands is empty/);
  });

  test.each<[string, (it: Template) => void, RegExp]>([
    ['a demand on a Stat that does not exist', (it) => (it.demands[0] = ['strenght', 0.3]), /demands.*"strenght"/],
    ['a demand on a Guildmaster Stat', (it) => (it.demands[0] = ['negotiation', 0.3]), /demands.*"negotiation"/],
    ['a Skill that does not exist', (it) => void it.skillKeys.push('axemanship'), /skillKeys.*"axemanship"/],
    ['a Sphere that does not exist', (it) => void it.sphereKeys.push('the-sea'), /sphereKeys.*"the-sea"/],
    ['a required Class that does not exist', (it) => (it.requires = { classKey: 'bard' }), /requires\.classKey.*"bard"/],
    ['a required Skill that does not exist', (it) => (it.requires = { skillKey: 'lute' }), /requires\.skillKey.*"lute"/],
    ['a difficulty range upside down', (it) => (it.difficultyMin = 80), /difficultyMin 80 is greater than difficultyMax 70/],
    ['a Party of no Heroes', (it) => (it.partySizeMin = 0), /partySizeMin is 0/],
    ['a tag that is not kebab-case', (it) => void it.tags.push('Dark Places'), /tags: "Dark Places"/],
  ])('with %s is refused, naming the template', (_, change, problem) => {
    const files = withJson('quest-templates.json', (json) => change(barrow(json)));

    const { message } = refusalOf(() => parseContent(files));

    expect(message).toContain('questTemplates.clear-the-barrow');
    expect(message).toMatch(problem);
  });

  test('requiring anything but a Class or a Skill is refused, naming the field', () => {
    const files = withJson('quest-templates.json', (json) => {
      Object.assign(barrow(json).requires, { level: 3 });
    });

    expect(refusalOf(() => parseContent(files)).message).toMatch(
      /quest-templates\.json: clear-the-barrow\.requires\.level is not a field/,
    );
  });

  test('naming a Loot table content lacks is refused, naming the template and the table (M5-S5)', () => {
    const files = withJson('quest-templates.json', (json) => {
      Object.assign(barrow(json), { lootTableKey: 'barrow-hoard' });
    });
    const notAKey = withJson('quest-templates.json', (json) => {
      Object.assign(barrow(json), { lootTableKey: 7 });
    });

    expect(refusalOf(() => parseContent(files)).message).toContain(
      'questTemplates.clear-the-barrow.lootTableKey: "barrow-hoard" is not a Loot table',
    );
    expect(refusalOf(() => parseContent(notAKey)).message).toMatch(
      /quest-templates\.json: clear-the-barrow\.lootTableKey is 7; expected a string or null/,
    );
  });

  test('that leaves a Sphere with none is refused, naming the Sphere', () => {
    const files = withJson('quest-templates.json', (json) => {
      for (const [key, it] of Object.entries(json)) {
        if (it.sphereKeys.includes('villages')) delete json[key];
      }
    });

    expect(refusalOf(() => parseContent(files)).message).toContain(
      'spheres.villages: no Quest template names it in sphereKeys',
    );
  });
});

describe("a Quest template's Encounters (M4-S1)", () => {
  test.each<[string, (it: Template) => void, RegExp]>([
    ['no Encounter kind', (it) => (it.encounterKinds = []), /encounterKinds is empty/],
    ['a kind listed twice', (it) => void it.encounterKinds.push('combat'), /encounterKinds: "combat" is listed twice/],
    ['a count range upside down', (it) => (it.encountersMin = 5), /encountersMin 5 is greater than encountersMax 4/],
    ['a count of no Encounters', (it) => (it.encountersMin = 0), /encountersMin is 0/],
  ])('with %s is refused, naming the template', (_, change, problem) => {
    const files = withJson('quest-templates.json', (json) => change(barrow(json)));

    const { message } = refusalOf(() => parseContent(files));

    expect(message).toContain('questTemplates.clear-the-barrow');
    expect(message).toMatch(problem);
  });

  test('with a kind that is not one of the five is refused, naming the field', () => {
    const files = withJson('quest-templates.json', (json) => {
      Object.assign(barrow(json), { encounterKinds: ['combat', 'naval'] });
    });

    expect(refusalOf(() => parseContent(files)).message).toMatch(/clear-the-barrow\.encounterKinds is \["combat","naval"\]/);
  });

  test('with a kind content has no Encounter of is refused, naming the kind', () => {
    const files = withJson('encounters.json', (json) => {
      for (const [key, it] of Object.entries(json)) if (it.kind === 'stealth') delete json[key];
    });

    expect(refusalOf(() => parseContent(files)).message).toMatch(
      /questTemplates\.clear-the-barrow\.encounterKinds: no Encounter is of kind "stealth"/,
    );
  });
});

// M4-S1's first box: an Encounter naming an unknown Stat, Skill or Injury type is refused.
describe('an Encounter (M4-S1)', () => {
  const ambush = (json: Files['encounters.json']) => json['ambush-on-the-road'] as Omit<Encounter, 'key'>;

  test.each<[string, (it: Omit<Encounter, 'key'>) => void, RegExp]>([
    ['a demand on a Stat that does not exist', (it) => (it.demands[0] = ['strenght', 0.4]), /encounters\.ambush-on-the-road\.demands: "strenght" is not a Hero Stat/],
    ['a demand on a Guildmaster Stat', (it) => (it.demands[0] = ['judgement', 0.4]), /encounters\.ambush-on-the-road\.demands: "judgement" is not a Hero Stat/],
    ['a Skill that does not exist', (it) => void it.skillKeys.push('axemanship'), /encounters\.ambush-on-the-road\.skillKeys: "axemanship" is not a Skill/],
    [
      'an Injury of a type that does not exist',
      (it) => void it.consequences.failure.push({ kind: 'injury', typeKey: 'frostbite', chance: 0.1, count: 1 }),
      /encounters\.ambush-on-the-road\.consequences\.failure\.2\.typeKey: "frostbite" is not an Injury type/,
    ],
    ['demand weights not summing to 1', (it) => (it.demands[0] = ['weaponry', 0.6]), /ambush-on-the-road\.demands: weights sum to 1\.2, not 1/],
    ['a difficulty factor of 0', (it) => (it.difficultyFactor = 0), /ambush-on-the-road\.difficultyFactor is 0/],
    [
      'a chance above 1',
      (it) => void it.consequences.failure.push({ kind: 'death', chance: 1.5 }),
      /ambush-on-the-road\.consequences\.failure\.2\.chance is 1\.5/,
    ],
    [
      'an Injury to no Heroes',
      (it) => void it.consequences.failure.push({ kind: 'injury', typeKey: 'deep-cut', chance: 0.1, count: 0 }),
      /ambush-on-the-road\.consequences\.failure\.2\.count is 0/,
    ],
    [
      'a negative factor',
      (it) => void it.consequences.success.push({ kind: 'wealth', factor: -1 }),
      /ambush-on-the-road\.consequences\.success\.1\.factor is -1/,
    ],
  ])('with %s is refused, naming the Encounter', (_, change, problem) => {
    const files = withJson('encounters.json', (json) => change(ambush(json)));

    expect(refusalOf(() => parseContent(files)).message).toMatch(problem);
  });

  test('with a consequence of an unknown kind, or a field its kind lacks, is refused, naming it', () => {
    const unknown = withJson('encounters.json', (json) => {
      Object.assign(ambush(json).consequences, { success: [{ kind: 'loot', table: 'hoard' }] });
    });
    const extra = withJson('encounters.json', (json) => {
      Object.assign(ambush(json).consequences, { success: [{ kind: 'fame', delta: 1, factor: 2 }] });
    });
    const outcome = withJson('encounters.json', (json) => {
      Object.assign(ambush(json).consequences, { draw: [] });
    });

    expect(refusalOf(() => parseContent(unknown)).message).toMatch(/ambush-on-the-road\.consequences\.success\.0\.kind is "loot"/);
    expect(refusalOf(() => parseContent(extra)).message).toMatch(
      /ambush-on-the-road\.consequences\.success\.0\.factor is not a field of a consequence of kind fame/,
    );
    expect(refusalOf(() => parseContent(outcome)).message).toMatch(/ambush-on-the-road\.consequences\.draw is not a field/);
  });

  test('of a kind or aggregate outside the choices is refused, naming the choices', () => {
    const files = withJson('encounters.json', (json) => {
      Object.assign(ambush(json), { kind: 'naval', aggregate: 'worst' });
    });

    const { message } = refusalOf(() => parseContent(files));

    expect(message).toMatch(/ambush-on-the-road\.kind is "naval"; expected one of combat, travel, social, arcane, stealth/);
    expect(message).toMatch(/ambush-on-the-road\.aggregate is "worst"; expected one of best, sum/);
  });
});

// M4-S3: a Synergy naming an unknown Class, Skill or Encounter kind is refused, as is a count below
// 1, a bonus that is not one, and a requirement of nothing (DL-45).
describe('a Synergy (M4-S3)', () => {
  type Row = Omit<Synergy, 'key'>;
  const salve = (json: Files['synergies.json']) => json['sword-and-salve'] as Row;
  const classes = (it: Row): Record<string, number> => (it.requires.classes ??= {});

  test.each<[string, (it: Row) => void, RegExp]>([
    ['a Class that does not exist', (it) => (classes(it)['paladin'] = 1), /synergies\.sword-and-salve\.requires\.classes: "paladin" is not a Class/],
    ['a Skill that does not exist', (it) => (it.requires.skills = ['axemanship']), /synergies\.sword-and-salve\.requires\.skills: "axemanship" is not a Skill/],
    ['a Skill listed twice', (it) => (it.requires.skills = ['tactics', 'tactics']), /sword-and-salve\.requires\.skills: "tactics" is listed twice/],
    ['a count of 0', (it) => (classes(it)['warrior'] = 0), /sword-and-salve\.requires\.classes\.warrior is 0; a count is a whole number from 1/],
    ['a negative count', (it) => (classes(it)['healer'] = -1), /sword-and-salve\.requires\.classes\.healer is -1; a count is a whole number from 1/],
    ['a count that is not whole', (it) => (classes(it)['warrior'] = 1.5), /sword-and-salve\.requires\.classes\.warrior is 1\.5; a count is a whole number from 1/],
    ['a requirement of nothing', (it) => (it.requires = {}), /sword-and-salve\.requires names no Class and no Skill/],
    ['a requirement listed empty', (it) => (it.requires = { classes: {}, skills: [] }), /sword-and-salve\.requires names no Class and no Skill/],
    ['no bonus', (it) => (it.bonus = {}), /sword-and-salve\.bonus is empty/],
    ['a flat of 0', (it) => (it.bonus = { flat: 0 }), /sword-and-salve\.bonus\.flat is 0; it is a number above 0/],
    ['a factor of 1', (it) => (it.bonus = { factor: 1 }), /sword-and-salve\.bonus\.factor is 1; it multiplies, so it is a number above 1/],
    ['a factor written as a share', (it) => (it.bonus = { flat: 2, factor: 0.1 }), /sword-and-salve\.bonus\.factor is 0\.1/],
    ['no kinds, listed empty', (it) => (it.kinds = []), /sword-and-salve\.kinds is empty/],
    ['a kind listed twice', (it) => (it.kinds = ['combat', 'combat']), /sword-and-salve\.kinds: "combat" is listed twice/],
  ])('with %s is refused, naming the Synergy', (_, change, problem) => {
    const files = withJson('synergies.json', (json) => change(salve(json)));

    expect(refusalOf(() => parseContent(files)).message).toMatch(problem);
  });

  test('with a kind that is not one of the five is refused, naming the field and the choices', () => {
    const files = withJson('synergies.json', (json) => {
      Object.assign(salve(json), { kinds: ['combat', 'naval'] });
    });

    expect(refusalOf(() => parseContent(files)).message).toMatch(
      /synergies\.json: sword-and-salve\.kinds is \["combat","naval"\]; expected a list, each one of combat, travel, social, arcane, stealth/,
    );
  });

  test('with a field its row, requirement or bonus lacks, or a count that is not a number, is refused, naming it', () => {
    const row = withJson('synergies.json', (json) => void Object.assign(salve(json), { chance: 0.5 }));
    const requires = withJson('synergies.json', (json) => void Object.assign(salve(json).requires, { traits: ['scarred'] }));
    const bonus = withJson('synergies.json', (json) => void Object.assign(salve(json).bonus, { delta: 2 }));
    const count = withJson('synergies.json', (json) => void Object.assign(salve(json).requires, { classes: { warrior: 'two' } }));

    expect(refusalOf(() => parseContent(row)).message).toMatch(/synergies\.json: sword-and-salve\.chance is not a field of a Synergy/);
    expect(refusalOf(() => parseContent(requires)).message).toMatch(/sword-and-salve\.requires\.traits is not a field of what a Synergy requires/);
    expect(refusalOf(() => parseContent(bonus)).message).toMatch(/sword-and-salve\.bonus\.delta is not a field of a Synergy's bonus/);
    expect(refusalOf(() => parseContent(count)).message).toMatch(/sword-and-salve\.requires\.classes is \{"warrior":"two"\}; expected an object of numbers/);
  });

  test('with no requires or bonus is refused, and without kinds is accepted, for every kind', () => {
    const missing = withJson('synergies.json', (json) => {
      Reflect.deleteProperty(salve(json), 'requires');
      Reflect.deleteProperty(salve(json), 'bonus');
    });
    const everyKind = withJson('synergies.json', (json) => {
      Reflect.deleteProperty(salve(json), 'kinds');
    });

    const { message } = refusalOf(() => parseContent(missing));
    expect(message).toMatch(/sword-and-salve\.requires is missing/);
    expect(message).toMatch(/sword-and-salve\.bonus is missing/);
    expect(parseContent(everyKind).synergies['sword-and-salve']).not.toHaveProperty('kinds');
  });

  test('the file is required, and may hold none', () => {
    const files = realFiles();
    delete files['synergies.json'];

    expect(refusalOf(() => parseContent(files)).message).toContain('synergies.json: missing');
    expect(parseContent(withText('synergies.json', '{}')).synergies).toEqual({});
  });
});

// M5-S1's third box, and the rest of an Item definition's refusals (DL-48).
describe('an Item definition (M5-S1)', () => {
  type Row = Record<string, unknown>;
  const rowOf = (json: Files['items.json'], key: string): Row => {
    const found = json[key];
    if (found === undefined) throw new Error(`items.json has no ${key}`);
    return found;
  };
  const sword = (json: Files['items.json']) => rowOf(json, 'short-sword');
  const draught = (json: Files['items.json']) => rowOf(json, 'healing-draught');
  const whetstone = (json: Files['items.json']) => rowOf(json, 'whetstone');

  test('of gear without a slot is refused, naming the Item and the slots', () => {
    const files = withJson('items.json', (json) => void Reflect.deleteProperty(sword(json), 'slot'));

    expect(refusalOf(() => parseContent(files)).message).toMatch(
      /items\.json: short-sword\.slot is missing; expected one of weapon, armour, trinket/,
    );
  });

  test('of a consumable with a slot is refused, naming the Item', () => {
    const files = withJson('items.json', (json) => void Object.assign(draught(json), { slot: 'trinket' }));

    expect(refusalOf(() => parseContent(files)).message).toMatch(
      /items\.json: healing-draught\.slot is not a field of a consumable: only gear has a slot/,
    );
  });

  test.each<[string, (json: Files['items.json']) => void, RegExp]>([
    ['a modifier on a Stat that does not exist', (json) => void Object.assign(sword(json), { statModifiers: { luck: 1 } }), /items\.short-sword\.statModifiers: "luck" is not a Hero Stat/],
    ['a modifier on a Guildmaster Stat', (json) => void Object.assign(sword(json), { statModifiers: { coaching: 1 } }), /items\.short-sword\.statModifiers: "coaching" is not a Hero Stat/],
    ['a modifier of 0', (json) => void Object.assign(sword(json), { statModifiers: { weaponry: 0 } }), /items\.short-sword\.statModifiers\.weaponry is 0; it is a whole number other than 0/],
    ['a modifier that is not whole', (json) => void Object.assign(sword(json), { statModifiers: { weaponry: 1.5 } }), /items\.short-sword\.statModifiers\.weaponry is 1\.5/],
    ['no modifiers', (json) => void Object.assign(sword(json), { statModifiers: {} }), /items\.short-sword\.statModifiers is empty: gear modifies at least one Stat/],
    ['a slot that is not one of the three', (json) => void Object.assign(sword(json), { slot: 'belt' }), /items\.json: short-sword\.slot is "belt"; expected one of weapon, armour, trinket/],
    ['an effect', (json) => void Object.assign(sword(json), { effect: { kind: 'heal', days: 1 } }), /items\.json: short-sword\.effect is not a field of gear/],
    ['a negative price', (json) => void Object.assign(sword(json), { buyPrice: -5 }), /items\.short-sword\.buyPrice is -5; it is a whole number above 0, or null/],
    ['a price of 0', (json) => void Object.assign(sword(json), { buyPrice: 0 }), /items\.short-sword\.buyPrice is 0/],
    ['a price that is not whole', (json) => void Object.assign(sword(json), { buyPrice: 39.5 }), /items\.json: short-sword\.buyPrice is 39\.5; expected a whole number or null/],
    ['a tag that is not kebab-case', (json) => void Object.assign(sword(json), { tags: ['Plain Steel'] }), /items\.short-sword\.tags: "Plain Steel" is not kebab-case/],
    ['a tag listed twice', (json) => void Object.assign(sword(json), { tags: ['plain', 'plain'] }), /items\.short-sword\.tags: "plain" is listed twice/],
    ['a kind that is neither', (json) => void Object.assign(sword(json), { kind: 'trade-good' }), /items\.json: short-sword\.kind is "trade-good"; expected one of gear, consumable/],
    ['unique left out', (json) => void Reflect.deleteProperty(sword(json), 'unique'), /items\.json: short-sword\.unique is missing; expected true or false/],
    ['a unique consumable', (json) => void Object.assign(draught(json), { unique: true }), /items\.healing-draught\.unique is true; a consumable is common/],
    ['a consumable with Stat modifiers', (json) => void Object.assign(draught(json), { statModifiers: { spirit: 1 } }), /items\.json: healing-draught\.statModifiers is not a field of a consumable/],
    ['a consumable with no effect', (json) => void Reflect.deleteProperty(draught(json), 'effect'), /items\.json: healing-draught\.effect is missing/],
    ['an effect of a kind the union lacks', (json) => void Object.assign(draught(json), { effect: { kind: 'teleport' } }), /items\.json: healing-draught\.effect\.kind is "teleport"; expected one of reroll, bonus, heal/],
    ['an effect with a field its kind lacks', (json) => void Object.assign(draught(json), { effect: { kind: 'heal', days: 5, flat: 2 } }), /items\.json: healing-draught\.effect\.flat is not a field of a heal effect/],
    ['a heal of no Days', (json) => void Object.assign(draught(json), { effect: { kind: 'heal', days: 0 } }), /items\.healing-draught\.effect\.days is 0; it is a whole number from 1/],
    ['a bonus of 0', (json) => void Object.assign(whetstone(json), { effect: { kind: 'bonus', flat: 0, kinds: ['combat'] } }), /items\.whetstone\.effect\.flat is 0; it is a number above 0/],
    ['an Encounter kind that is not one of the five', (json) => void Object.assign(whetstone(json), { effect: { kind: 'bonus', flat: 3, kinds: ['naval'] } }), /items\.json: whetstone\.effect\.kinds is \["naval"\]; expected a list, each one of combat, travel, social, arcane, stealth/],
    ['no Encounter kinds', (json) => void Object.assign(whetstone(json), { effect: { kind: 'reroll', kinds: [] } }), /items\.whetstone\.effect\.kinds is empty/],
    ['an Encounter kind listed twice', (json) => void Object.assign(whetstone(json), { effect: { kind: 'reroll', kinds: ['travel', 'travel'] } }), /items\.whetstone\.effect\.kinds: "travel" is listed twice/],
  ])('with %s is refused, naming the Item', (_, change, problem) => {
    expect(refusalOf(() => parseContent(withJson('items.json', change))).message).toMatch(problem);
  });

  test('the file is required, and may hold none, when no Loot table names one', () => {
    const files = realFiles();
    delete files['items.json'];

    expect(refusalOf(() => parseContent(files)).message).toContain('items.json: missing');
    expect(parseContent({ ...withoutLoot(), 'items.json': '{}' }).items).toEqual({});
  });

  test('a key that is not kebab-case is refused', () => {
    const files = withJson('items.json', (json) => void (json['Short_Sword'] = sword(json)));

    expect(refusalOf(() => parseContent(files)).message).toContain('items: "Short_Sword" is not kebab-case');
  });
});

/** The real files with no Loot table, and no template naming one. */
function withoutLoot(): Record<string, string> {
  const templates = withJson('quest-templates.json', (json) => {
    for (const it of Object.values(json)) it.lootTableKey = null;
  });
  return { ...templates, 'loot-tables.json': '{}' };
}

// M5-S5's content: a Loot table's refusals (DL-52).
describe('a Loot table (M5-S5)', () => {
  type Entry = LootTable['entries'][number];
  const lesser = (json: Files['loot-tables.json']) => json['lesser-loot'] as Omit<LootTable, 'key'>;
  const first = (json: Files['loot-tables.json']) => lesser(json).entries[0] as Entry;
  const unique = (json: Files['loot-tables.json']) =>
    lesser(json).entries.find((entry) => entry.definitionKey === 'barrow-kings-blade') as Entry;

  test.each<[string, (json: Files['loot-tables.json']) => void, RegExp]>([
    ['an Item content lacks', (json) => void (first(json).definitionKey = 'rope'), /lootTables\.lesser-loot\.entries\.0\.definitionKey: "rope" is not an Item/],
    ['a weight of 0', (json) => void (first(json).weight = 0), /lootTables\.lesser-loot\.entries\.0\.weight is 0; it is a number above 0/],
    ['a negative weight', (json) => void (first(json).weight = -2), /lootTables\.lesser-loot\.entries\.0\.weight is -2; it is a number above 0/],
    ['a quantity of 0', (json) => void (first(json).quantityMin = 0), /lootTables\.lesser-loot\.entries\.0\.quantityMin is 0; it is a whole number from 1/],
    ['a quantity range upside down', (json) => void Object.assign(first(json), { quantityMin: 3, quantityMax: 2 }), /lootTables\.lesser-loot\.entries\.0\.quantityMin 3 is greater than quantityMax 2/],
    ['a quantity that is not whole', (json) => void (first(json).quantityMax = 2.5), /loot-tables\.json: lesser-loot\.entries\.0\.quantityMax is 2\.5; expected a whole number/],
    ['a unique Item more than one at a time', (json) => void (unique(json).quantityMax = 2), /lootTables\.lesser-loot\.entries\.9: barrow-kings-blade is unique, so its quantityMin and quantityMax are 1/],
    ['an Item listed twice', (json) => void lesser(json).entries.push({ ...first(json) }), /lootTables\.lesser-loot\.entries: "whetstone" is listed twice/],
    ['no entries', (json) => void (lesser(json).entries = []), /lootTables\.lesser-loot\.entries is empty/],
    ['a field an entry lacks', (json) => void Object.assign(first(json), { chance: 0.5 }), /loot-tables\.json: lesser-loot\.entries\.0\.chance is not a field of a Loot table entry/],
    ['a field a table lacks', (json) => void Object.assign(lesser(json), { name: 'Lesser loot' }), /loot-tables\.json: lesser-loot\.name is not a field of a Loot table/],
  ])('with %s is refused, naming the table', (_, change, problem) => {
    expect(refusalOf(() => parseContent(withJson('loot-tables.json', change))).message).toMatch(problem);
  });

  test('the file is required, and may hold none when no template names one', () => {
    const files = realFiles();
    delete files['loot-tables.json'];

    expect(refusalOf(() => parseContent(files)).message).toContain('loot-tables.json: missing');
    expect(parseContent(withoutLoot()).lootTables).toEqual({});
  });
});

describe('an Injury type (M2-S5)', () => {
  const deepCut = (json: Files['injuries.json']) => json['deep-cut'] as Omit<InjuryType, 'key'>;

  test.each<[string, (it: Omit<InjuryType, 'key'>) => void, RegExp]>([
    ['leaving a Trait that does not exist', (it) => (it.leavesTrait = 'cursed'), /injuries\.deep-cut\.leavesTrait: "cursed" is not a Hero Trait/],
    ['leaving a Guildmaster Trait', (it) => (it.leavesTrait = 'miser'), /injuries\.deep-cut\.leavesTrait: "miser" is not a Hero Trait/],
    ['healing in no Days', (it) => (it.healDaysMin = 0), /injuries\.deep-cut\.healDaysMin is 0/],
    ['a heal range upside down', (it) => (it.healDaysMax = 3), /injuries\.deep-cut\.healDaysMin 6 is greater than healDaysMax 3/],
  ])('%s is refused, naming the type', (_, change, problem) => {
    const files = withJson('injuries.json', (json) => change(deepCut(json)));

    expect(refusalOf(() => parseContent(files)).message).toMatch(problem);
  });

  test('whose leavesTrait is missing, or neither a key nor null, is refused', () => {
    const missing = withJson('injuries.json', (json) => {
      Reflect.deleteProperty(deepCut(json), 'leavesTrait');
    });
    const wrong = withJson('injuries.json', (json) => {
      Object.assign(deepCut(json), { leavesTrait: 3 });
    });

    expect(refusalOf(() => parseContent(missing)).message).toMatch(/injuries\.json: deep-cut\.leavesTrait is missing/);
    expect(refusalOf(() => parseContent(wrong)).message).toMatch(/injuries\.json: deep-cut\.leavesTrait is 3/);
  });

  test('is required: a set with none is refused', () => {
    expect(refusalOf(() => parseContent(withText('injuries.json', '{}'))).message).toContain('injuries is empty');
  });
});

describe('a Disposition (M6-S1)', () => {
  const reckless = (json: Files['dispositions.json']) => json['reckless'] as Omit<Disposition, 'key'>;

  test.each<[string, (it: Omit<Disposition, 'key'>) => void, RegExp]>([
    ['with a questRiskAppetite above 1', (it) => (it.questRiskAppetite = 1.5), /dispositions\.reckless\.questRiskAppetite is 1\.5; it is a number from 0 to 1/],
    ['with a transferAppetite below 0', (it) => (it.transferAppetite = -0.1), /dispositions\.reckless\.transferAppetite is -0\.1; it is a number from 0 to 1/],
    ['with a negative recruitThreshold', (it) => (it.recruitThreshold = -1), /dispositions\.reckless\.recruitThreshold is -1; it is a number of 0 or more/],
    ['with a negative buildThreshold', (it) => (it.buildThreshold = -2), /dispositions\.reckless\.buildThreshold is -2; it is a number of 0 or more/],
    ['with a negative gearThreshold', (it) => (it.gearThreshold = -3), /dispositions\.reckless\.gearThreshold is -3; it is a number of 0 or more/],
  ])('%s is refused, naming the Disposition and the field', (_, change, problem) => {
    const files = withJson('dispositions.json', (json) => change(reckless(json)));

    expect(refusalOf(() => parseContent(files)).message).toMatch(problem);
  });

  test('without a weight, or with one that is not a number, is refused, naming it', () => {
    const missing = withJson('dispositions.json', (json) => {
      Reflect.deleteProperty(reckless(json), 'buildThreshold');
    });
    const wrong = withJson('dispositions.json', (json) => {
      Object.assign(reckless(json), { questRiskAppetite: 'high' });
    });

    expect(refusalOf(() => parseContent(missing)).message).toMatch(/dispositions\.json: reckless\.buildThreshold is missing/);
    expect(refusalOf(() => parseContent(wrong)).message).toMatch(/dispositions\.json: reckless\.questRiskAppetite is "high"/);
  });

  test('is required: a set with none is refused, since every Rival is dealt one', () => {
    expect(refusalOf(() => parseContent(withText('dispositions.json', '{}'))).message).toContain('dispositions is empty');
  });

  test('may be a fifth, with weights of its own, and is accepted as the four are', () => {
    const files = withJson('dispositions.json', (json) => {
      json['cautious'] = {
        name: 'Cautious',
        questRiskAppetite: 0.1,
        recruitThreshold: 100,
        buildThreshold: 0,
        gearThreshold: 0,
        transferAppetite: 0,
      };
    });

    expect(Object.keys(parseContent(files).dispositions).sort()).toEqual(['ambitious', 'cautious', 'miserly', 'reckless', 'steady']);
  });
});

describe('a file', () => {
  test('that is missing is refused, naming the file', () => {
    const files = realFiles();
    delete files['spheres.json'];

    expect(refusalOf(() => parseContent(files)).message).toContain('spheres.json: missing');
  });

  test('that is not JSON is refused, naming the file', () => {
    const files = withText('skills.json', '{ "stealth": { "name": "Stealth" }, }');

    expect(refusalOf(() => parseContent(files)).message).toContain('skills.json: not valid JSON');
  });

  test('whose row lacks a field is refused, naming the row and the field', () => {
    const files = withJson('spheres.json', (json) => {
      delete (json as Record<string, Partial<Sphere>>)['crown']?.name;
    });

    expect(refusalOf(() => parseContent(files)).message).toMatch(/spheres\.json: crown\.name/);
  });

  test('whose row has a field the schema does not know is refused, naming it', () => {
    const files = withJson('skills.json', (json) => {
      Object.assign(json['stealth'] ?? {}, { colour: 'grey' });
    });

    expect(refusalOf(() => parseContent(files)).message).toMatch(/skills\.json: stealth\.colour/);
  });

  test("whose row has a value outside its field's choices is refused, naming them", () => {
    const files = withJson('stats.json', (json) => {
      Object.assign(json['wits'] ?? {}, { area: 'emotional' });
    });

    expect(refusalOf(() => parseContent(files)).message).toMatch(/stats\.json: wits\.area.*"emotional"/);
  });

  test('whose Disposition has a field the schema does not know is refused, naming it (M2-S9)', () => {
    const files = withJson('dispositions.json', (json) => {
      Object.assign(json['steady'] ?? {}, { riskAppetite: 0.2 });
    });

    expect(refusalOf(() => parseContent(files)).message).toMatch(/dispositions\.json: steady\.riskAppetite/);
  });

  // M4-S5: a Guildmaster Trait carries one effect of the closed union, a Hero Trait none (DL-43).
  const traitRefusals: [string, (json: Files['traits.json']) => void, RegExp][] = [
    [
      'an effect of no kind the union knows',
      (json) => Object.assign(json['miser'] ?? {}, { effect: { upkeepFactor: 0.9 } }),
      /traits\.json: miser\.effect\.kind.*classStatBonus, guildMoraleShift, upkeepFactor/,
    ],
    [
      'an effect with a field its kind does not have',
      (json) => Object.assign(json['miser'] ?? {}, { effect: { kind: 'guildMoraleShift', delta: -5, factor: 2 } }),
      /traits\.json: miser\.effect\.factor is not a field/,
    ],
    [
      'a classStatBonus naming an unknown Class',
      (json) => Object.assign(json['old-soldier'] ?? {}, { effect: { kind: 'classStatBonus', classKey: 'paladin', statKey: 'weaponry', delta: 1 } }),
      /traits\.old-soldier\.effect\.classKey: "paladin" is not a Class/,
    ],
    [
      'a classStatBonus naming a Stat that is no Hero Stat',
      (json) => Object.assign(json['old-soldier'] ?? {}, { effect: { kind: 'classStatBonus', classKey: 'warrior', statKey: 'judgement', delta: 1 } }),
      /traits\.old-soldier\.effect\.statKey: "judgement" is not a Hero Stat/,
    ],
    [
      'a classStatBonus of 0',
      (json) => Object.assign(json['old-soldier'] ?? {}, { effect: { kind: 'classStatBonus', classKey: 'warrior', statKey: 'weaponry', delta: 0 } }),
      /traits\.old-soldier\.effect\.delta is 0/,
    ],
    [
      'an upkeepFactor of 0',
      (json) => Object.assign(json['thrifty'] ?? {}, { effect: { kind: 'upkeepFactor', factor: 0 } }),
      /traits\.thrifty\.effect\.factor is 0/,
    ],
    [
      'a Guildmaster Trait with no effect',
      (json) => Object.assign(json['well-liked'] ?? {}, { effect: null }),
      /traits\.well-liked\.effect: a Guildmaster Trait carries one effect/,
    ],
    [
      'a Hero Trait with an effect',
      (json) => Object.assign(json['scarred'] ?? {}, { effect: { kind: 'guildMoraleShift', delta: -1 } }),
      /traits\.scarred\.effect: a Hero Trait has no effect/,
    ],
  ];

  test.each(traitRefusals)('with %s is refused, naming the Trait (M4-S5)', (_, change, message) => {
    expect(refusalOf(() => parseContent(withJson('traits.json', change))).message).toMatch(message);
  });

  // M9-S2: a Guildmaster Trait's cost against the Trait budget is a whole number, and its
  // exclusions name Guildmaster Traits and hold both ways; a Hero Trait costs 0 and excludes
  // nothing (DL-100 item 3, DL-102).
  const costAndExclusionRefusals: [string, (json: Files['traits.json']) => void, RegExp][] = [
    ['a cost missing', (json) => Reflect.deleteProperty(json['miser'] ?? {}, 'cost'), /traits\.json: miser\.cost is missing; expected a whole number/],
    ['a cost that is not a whole number', (json) => Object.assign(json['miser'] ?? {}, { cost: -1.5 }), /traits\.json: miser\.cost is -1\.5; expected a whole number/],
    ['exclusions missing', (json) => Reflect.deleteProperty(json['miser'] ?? {}, 'excludes'), /traits\.json: miser\.excludes is missing; expected a list of strings/],
    [
      'an exclusion that does not hold both ways',
      (json) => Object.assign(json['thrifty'] ?? {}, { excludes: ['spendthrift', 'old-soldier'] }),
      /traits\.thrifty\.excludes: "old-soldier" does not exclude "thrifty" in return/,
    ],
    [
      'an exclusion naming a Trait content lacks',
      (json) => Object.assign(json['thrifty'] ?? {}, { excludes: ['spendthrift', 'cursed'] }),
      /traits\.thrifty\.excludes: "cursed" is not a Guildmaster Trait/,
    ],
    [
      'an exclusion naming a Hero Trait',
      (json) => Object.assign(json['thrifty'] ?? {}, { excludes: ['spendthrift', 'scarred'] }),
      /traits\.thrifty\.excludes: "scarred" is not a Guildmaster Trait/,
    ],
    ['a Trait excluding itself', (json) => Object.assign(json['old-soldier'] ?? {}, { excludes: ['old-soldier'] }), /traits\.old-soldier\.excludes: a Trait cannot exclude itself/],
    [
      'an exclusion listed twice',
      (json) => Object.assign(json['thrifty'] ?? {}, { excludes: ['spendthrift', 'spendthrift'] }),
      /traits\.thrifty\.excludes: "spendthrift" is listed twice/,
    ],
    ['a Hero Trait with a cost', (json) => Object.assign(json['scarred'] ?? {}, { cost: 1 }), /traits\.scarred\.cost is 1; a Hero Trait is never chosen against the budget, and costs 0/],
    ['a Hero Trait with an exclusion', (json) => Object.assign(json['scarred'] ?? {}, { excludes: ['lame'] }), /traits\.scarred\.excludes: a Hero Trait excludes nothing/],
  ];

  test.each(costAndExclusionRefusals)('with %s is refused, naming the Trait (M9-S2)', (_, change, message) => {
    expect(refusalOf(() => parseContent(withJson('traits.json', change))).message).toMatch(message);
  });
});

describe('validateContent on a set built in memory', () => {
  test('refuses a row whose key differs from its table key, naming both', () => {
    const content = loadContent();
    const strength = content.stats['strength'];
    if (strength) strength.key = 'might';

    expect(refusalOf(() => validateContent(content)).message).toMatch(/stats\.strength.*"might"/);
  });

  test('refuses a Synergy on a kind of Encounter that is not one, which the parser cannot see in memory (M4-S3)', () => {
    const content = loadContent();
    const salve = content.synergies['sword-and-salve'];
    if (salve) Object.assign(salve, { kinds: ['naval'] });

    expect(refusalOf(() => validateContent(content)).message).toMatch(/synergies\.sword-and-salve\.kinds: "naval" is not a kind of Encounter/);
  });

  test('refuses gear of a slot that is not one, and a consumable with a slot, which the parser cannot see in memory (M5-S1)', () => {
    const content = loadContent();
    Object.assign(content.items['short-sword'] ?? {}, { slot: 'belt' });
    Object.assign(content.items['healing-draught'] ?? {}, { slot: 'trinket', statModifiers: { spirit: 1 } });
    Object.assign(content.items['whetstone'] ?? {}, { effect: { kind: 'bonus', flat: 3, kinds: ['naval'] } });

    const { message } = refusalOf(() => validateContent(content));

    expect(message).toMatch(/items\.short-sword\.slot: "belt" is not a gear slot \(weapon, armour, trinket\)/);
    expect(message).toMatch(/items\.healing-draught\.slot: a consumable has no slot/);
    expect(message).toMatch(/items\.healing-draught\.statModifiers: a consumable modifies no Stat/);
    expect(message).toMatch(/items\.whetstone\.effect\.kinds: "naval" is not a kind of Encounter/);
  });

  test('refuses a Trait cost that is not a whole number, which the parser cannot see in memory (M9-S2)', () => {
    const content = loadContent();
    Object.assign(content.traits['thrifty'] ?? {}, { cost: 1.5 });

    expect(refusalOf(() => validateContent(content)).message).toMatch(/traits\.thrifty\.cost is 1\.5; it is a whole number/);
  });

  test('reports every problem at once', () => {
    const content = loadContent();
    content.names.guild = [];
    content.names.patron = [];

    const refusal = refusalOf(() => validateContent(content));

    expect(refusal.problems).toHaveLength(2);
    expect(refusal.message).toContain('names.guild');
    expect(refusal.message).toContain('names.patron');
  });
});
