import { type Sphere } from '@heroesim/engine/content';
import { describe, expect, test } from 'vitest';
import { contentSources, isFolder } from './index.js';
import { realFiles, parse, withJson, withSourceJson, withText, withoutLoot, refusalOf, shipped } from './kinds/content.test-support.js';

// The reading of content's files as a whole: the content as shipped, a file missing, not JSON, or with a key twice, and a field no kind knows (DL-243). Each is triggered by content built in memory from the shipped files with one
// thing broken, read and checked as `parseContent` does, and names the offending key, so an author
// can find it.

describe('the real content', () => {
  test('is accepted', () => {
    expect(() => parse(realFiles())).not.toThrow();
  });
});

describe('a duplicate key, found in the raw text because JSON.parse keeps only the last', () => {
  test('among the rows of a file is refused, naming the key and its line', () => {
    const text = realFiles()['stats.json']?.replace(
      /^\{/,
      '{\n  "strength": { "name": "Strength", "area": "physical", "min": 1, "max": 20, "default": 10, "owner": "hero" },',
    );
    const files = withText('stats.json', text ?? '');

    expect(refusalOf(() => parse(files)).message).toMatch(
      /stats\.json: duplicate key "strength" at the top level \(line \d+\)/,
    );
  });

  test('inside a row is refused, naming the key and where it is', () => {
    const text = realFiles()['classes.json']?.replace(
      '"strength": 0.1667,',
      '"strength": 0.1667, "strength": 0.1667,',
    );
    const files = withText('classes.json', text ?? '');

    expect(refusalOf(() => parse(files)).message).toMatch(
      /classes\.json: duplicate key "strength" in warrior\.growth/,
    );
  });
});

describe('a file', () => {
  test.each(contentSources.filter((source) => !isFolder(source)))('%s that is missing is refused, naming the file', (name) => {
    const files = realFiles();
    delete files[name];

    expect(refusalOf(() => parse(files)).message).toContain(`${name}: missing`);
  });

  test('that is not JSON is refused, naming the file', () => {
    const files = withText('skills.json', '{ "stealth": { "name": "Stealth" }, }');

    expect(refusalOf(() => parse(files)).message).toContain('skills.json: not valid JSON');
  });

  test('whose row lacks a field is refused, naming the row and the field', () => {
    const files = withJson('spheres.json', (json) => {
      delete (json as Record<string, Partial<Sphere>>)['crown']?.name;
    });

    expect(refusalOf(() => parse(files)).message).toMatch(/spheres\.json: crown\.name/);
  });

  test('whose row has a field the schema does not know is refused, naming it', () => {
    const files = withJson('skills.json', (json) => {
      Object.assign(json['stealth'] ?? {}, { colour: 'grey' });
    });

    expect(refusalOf(() => parse(files)).message).toMatch(/skills\.json: stealth\.colour/);
  });

  test("whose row has a value outside its field's choices is refused, naming them", () => {
    const files = withJson('stats.json', (json) => {
      Object.assign(json['wits'] ?? {}, { area: 'emotional' });
    });

    expect(refusalOf(() => parse(files)).message).toMatch(/stats\.json: wits\.area.*"emotional"/);
  });

});

// DL-260: a folder of one file a row, each named by its row's key.
describe("a folder's row", () => {
  test('is read from its own file, its key from the file name, in key order', () => {
    const files = realFiles();
    files['loot-tables/z-loot.json'] = JSON.stringify({ entries: [{ definitionKey: 'whetstone', weight: 1, quantityMin: 1, quantityMax: 1 }] });
    files['loot-tables/a-loot.json'] = JSON.stringify({ entries: [{ definitionKey: 'lockpicks', weight: 2, quantityMin: 1, quantityMax: 1 }] });

    const set = parse(files);

    expect(Object.keys(set.lootTables)).toEqual(['a-loot', 'greater-loot', 'lesser-loot', 'z-loot']);
    expect(set.lootTables['a-loot']).toEqual({ key: 'a-loot', entries: [{ definitionKey: 'lockpicks', weight: 2, quantityMin: 1, quantityMax: 1 }] });
  });

  test('that is missing a field is refused, naming its file and the field', () => {
    const files = withJson('items/', (json) => void delete json['short-sword']?.['name']);

    expect(refusalOf(() => parse(files)).problems).toContain('items/short-sword.json: name is missing; expected a string');
  });

  test('that is not JSON is refused, naming its file', () => {
    const files = withText('encounters/the-long-march.json', '{ "name": "The long march", }');

    expect(refusalOf(() => parse(files)).message).toContain('encounters/the-long-march.json: not valid JSON');
  });

  test('with a key twice is refused, naming its file and the line', () => {
    const files = withText('items/whetstone.json', '{\n  "name": "Whetstone",\n  "name": "Whetstone"\n}\n');

    expect(refusalOf(() => parse(files)).message).toMatch(/items\/whetstone\.json: duplicate key "name" at the top level \(line 3\)/);
  });

  test('that is no object is refused, naming its file', () => {
    const files = withText('quest-templates/clear-the-barrow.json', '[]');

    expect(refusalOf(() => parse(files)).problems).toContain('quest-templates/clear-the-barrow.json: must be an object');
  });

  test('in a folder of its own inside the folder is not read', () => {
    const files = { ...realFiles(), 'items/old/short-sword.json': '{}' };

    expect(parse(files).items).toEqual(shipped.items);
  });
});

describe('a folder with no row', () => {
  test('holds none, as git keeps no empty folder: the Items when no Loot table and no template names one', () => {
    expect(parse(withSourceJson(withoutLoot(), 'items/', {})).items).toEqual({});
  });

  test("is refused by the rules of the kinds that need its rows: the Quest templates' Encounters", () => {
    expect(refusalOf(() => parse(withSourceJson(realFiles(), 'encounters/', {}))).message).toContain('no Encounter is of kind');
  });
});
