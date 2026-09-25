import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Background, Class, Names, Skill, Sphere, Stat, Trait } from '@heroesim/engine';
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

  test("with a Trait's effect set before any rule reads it is refused", () => {
    const files = withJson('traits.json', (json) => {
      Object.assign(json['miser'] ?? {}, { effect: { upkeepFactor: 0.9 } });
    });

    expect(refusalOf(() => parseContent(files)).message).toMatch(/traits\.json: miser\.effect/);
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
