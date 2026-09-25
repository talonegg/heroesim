import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type {
  Background,
  Class,
  Disposition,
  InjuryType,
  Names,
  QuestTemplate,
  Skill,
  Sphere,
  Stat,
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

  test('with a Loot table before Loot exists is refused', () => {
    const files = withJson('quest-templates.json', (json) => {
      Object.assign(barrow(json), { lootTableKey: 'barrow-hoard' });
    });

    expect(refusalOf(() => parseContent(files)).message).toMatch(/clear-the-barrow\.lootTableKey/);
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
