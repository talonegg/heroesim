import { describe, expect, test } from 'vitest';
import { validateContent } from './index.js';
import { shipped, parse, withJson, refusalOf, type Files } from './kinds/content.test-support.js';

// The rules every table of content shares: its keys, its draw weights, and every problem reported at once (DL-243). Each is triggered by content built in memory from the shipped files with one
// thing broken, read and checked as `parseContent` does, and names the offending key, so an author
// can find it.

describe('a key that is not kebab-case', () => {
  test.each([
    ['guildmaster-traits.json', 'Old_Soldier'],
    ['hero-traits.json', 'Short_Winded'],
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

    expect(refusalOf(() => parse(files)).message).toContain(`"${key}" is not kebab-case`);
  });
});

describe('validateContent on a set built in memory', () => {
  test('refuses a row whose key differs from its table key, naming both', () => {
    const content = structuredClone(shipped);
    const strength = content.stats['strength'];
    if (strength) strength.key = 'might';

    expect(refusalOf(() => validateContent(content)).message).toMatch(/stats\.strength.*"might"/);
  });

});

describe('validateContent on a set built in memory', () => {
  test('reports every problem at once', () => {
    const content = structuredClone(shipped);
    content.names.guild = [];
    content.names.patron = [];

    const refusal = refusalOf(() => validateContent(content));

    expect(refusal.problems).toHaveLength(2);
    expect(refusal.message).toContain('names.guild');
    expect(refusal.message).toContain('names.patron');
  });
});

// Draw weights and the Rivals' orders (DL-186 item 16, DL-202): a weight above 0 where written,
// and each order a permutation of its keys, where written; the shipped files write neither.
describe('a weight', () => {
  const rowOfEach: [keyof Files, string][] = [
    ['classes.json', 'warrior'],
    ['backgrounds.json', 'farm-born'],
    ['spheres.json', 'crown'],
    ['quest-templates.json', 'clear-the-barrow'],
  ];

  test('is absent from a row that has none, which reads as having none', () => {
    const files = withJson('classes.json', (json) => void delete (json['warrior'] as { weight?: number }).weight);

    expect(parse(files).classes['warrior']?.weight).toBeUndefined();
  });

  test.each(rowOfEach)('is read from a row of %s when it has one, and a positive number is accepted', (file, key) => {
    const files = withJson(file, (json) => void Object.assign((json as Record<string, object>)[key] as object, { weight: 2.5 }));
    const set = parse(files);
    const table = { 'classes.json': set.classes, 'backgrounds.json': set.backgrounds, 'spheres.json': set.spheres, 'quest-templates.json': set.questTemplates }[file as string] as Record<string, { weight?: number }>;

    expect(table[key]?.weight).toBe(2.5);
  });

  test.each([
    ['classes.json', 'classes', 'warrior'],
    ['backgrounds.json', 'backgrounds', 'farm-born'],
    ['spheres.json', 'spheres', 'crown'],
    ['quest-templates.json', 'questTemplates', 'clear-the-barrow'],
  ] as const)('of %s that is 0, negative or not a number is refused, naming it', (file, table, key) => {
    for (const weight of [0, -1]) {
      const files = withJson(file, (json) => void Object.assign((json as Record<string, object>)[key] as object, { weight }));
      expect(refusalOf(() => parse(files)).message).toContain(`${table}.${key}.weight is ${weight}; it is a number above 0, or absent for 1`);
    }
    const text = withJson(file, (json) => void Object.assign((json as Record<string, object>)[key] as object, { weight: 'heavy' }));
    expect(refusalOf(() => parse(text)).message).toContain(`${key}.weight is "heavy"`);
  });
});
