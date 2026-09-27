import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type {
  Background,
  Class,
  Disposition,
  Encounter,
  InjuryType,
  Names,
  QuestTemplate,
  Skill,
  Sphere,
  LootTable,
  Stat,
  Synergy,
  Trait,
} from '@heroesim/engine';
import { describe, expect, test } from 'vitest';
import { ContentError, contentFiles, parseContent, validateContent } from './index.js';
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
  const files = realFiles();
  const json = JSON.parse(files[file] ?? '') as Files[File];
  change(json);
  return { ...files, [file]: JSON.stringify(json, null, 2) };
}

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
