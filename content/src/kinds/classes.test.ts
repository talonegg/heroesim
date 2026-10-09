import { classIcons, type Class } from '@heroesim/engine/content';
import { describe, expect, test } from 'vitest';
import { shippedTexts, realFiles, parse, withJson, withText, refusalOf, warrior } from './content.test-support.js';

// The Classes' refusals, and their order's (DL-243). Each is triggered by content built in memory from the shipped files with one
// thing broken, read and checked as `parseContent` does, and names the offending key, so an author
// can find it.

// The Classes' order, declared (v1.1.6-S14, DL-186 item 24): each Class once, in the order every list shows them.
describe("the Classes' order", () => {
  test('is the Warrior, Rogue, Mage and Healer, kept when classes.json lists its keys in another order', () => {
    expect(parse(realFiles()).classOrder).toEqual(['warrior', 'rogue', 'mage', 'healer']);
    const reordered = withText(
      'classes.json',
      JSON.stringify(Object.fromEntries(Object.entries(JSON.parse(shippedTexts['classes.json']) as Record<string, unknown>).reverse()), null, 2),
    );
    const set = parse(reordered);

    expect(Object.keys(set.classes)).toEqual(['healer', 'mage', 'rogue', 'warrior']);
    expect(set.classOrder).toEqual(['warrior', 'rogue', 'mage', 'healer']);
  });

  test.each([
    ['a Class missing', (json: string[]) => void json.pop(), 'classOrder: "healer" is a Class and is not in the order; list each Class once'],
    ['a Class twice', (json: string[]) => void json.push('mage'), 'classOrder: "mage" is listed twice; list each Class once'],
    ['a key that is no Class', (json: string[]) => void json.push('bard'), 'classOrder: "bard" is not a Class'],
  ])('is refused with %s, naming it', (_name, change, problem) => {
    expect(refusalOf(() => parse(withJson('class-order.json', change))).message).toContain(problem);
  });

  test('is refused without its file, or as anything but a list of keys', () => {
    const { 'class-order.json': _order, ...files } = realFiles();
    void _order;

    expect(refusalOf(() => parse(files)).message).toContain('class-order.json: missing');
    expect(refusalOf(() => parse(withText('class-order.json', '{"warrior": 1}'))).message).toContain('class-order.json: must be a list of Class keys');
  });
});

describe('a Class naming a Stat or Skill that does not exist', () => {
  test('is refused for an unknown leading Stat, naming the Class and the Stat', () => {
    const files = withJson('classes.json', (json) => warrior(json).leadingStats.push('strenght'));

    expect(refusalOf(() => parse(files)).message).toMatch(/warrior.*"strenght"/);
  });

  test('is refused for a Guildmaster Stat among its leading Stats', () => {
    const files = withJson('classes.json', (json) => warrior(json).leadingStats.push('inspiration'));

    expect(refusalOf(() => parse(files)).message).toMatch(/warrior.*"inspiration"/);
  });

  test('is refused for an unknown Stat in its growth', () => {
    const files = withJson('classes.json', (json) => {
      const growth = warrior(json).growth;
      growth['luck'] = growth['strength'] ?? 0;
      delete growth['strength'];
    });

    expect(refusalOf(() => parse(files)).message).toMatch(/warrior.*"luck"/);
  });

  test('is refused for an unknown Skill, naming the Class and the Skill', () => {
    const files = withJson('classes.json', (json) => warrior(json).gatedSkills.push('axemanship'));

    expect(refusalOf(() => parse(files)).message).toMatch(/warrior.*"axemanship"/);
  });

  test('is refused for a Skill it gates twice', () => {
    const files = withJson('classes.json', (json) => warrior(json).gatedSkills.push('tactics'));

    expect(refusalOf(() => parse(files)).message).toMatch(/warrior.*"tactics"/);
  });
});

describe("a Class's growth", () => {
  test('whose weights do not sum to 1 is refused, naming the Class and the sum', () => {
    const files = withJson('classes.json', (json) => {
      (json['rogue'] as Omit<Class, 'key'>).growth['dexterity'] = 0.5;
    });

    expect(refusalOf(() => parse(files)).message).toMatch(/classes\.rogue\.growth.*sum to 1\.33/);
  });

  test('with a negative weight is refused, naming the Stat', () => {
    const files = withJson('classes.json', (json) => {
      const growth = (json['mage'] as Omit<Class, 'key'>).growth;
      growth['arcana'] = -0.1667;
      growth['power'] = 0.5001;
    });

    expect(refusalOf(() => parse(files)).message).toMatch(/classes\.mage\.growth.*"arcana"/);
  });
});

describe("a Class's icon", () => {
  // v1.1.7-S6 (DL-212): one of `classIcons`, or absent for the plain mark; the check names the Class.
  test('is named by each shipped Class, each a different one of the set, and a Class without one reads as having none', () => {
    const set = parse(realFiles());
    expect(Object.values(set.classes).map((it) => it.icon)).toEqual(['sword-and-shield', 'crossed-daggers', 'tome', 'palm']);
    const files = withJson('classes.json', (json) => void delete (json['rogue'] as { icon?: string }).icon);
    expect(parse(files).classes['rogue']?.icon).toBeUndefined();
  });

  test.each(classIcons)('%s is accepted on a Class', (icon) => {
    const files = withJson('classes.json', (json) => void Object.assign(json['mage'] as object, { icon }));
    expect(parse(files).classes['mage']?.icon).toBe(icon);
  });

  test('a name not in the set is refused, naming the Class and the set', () => {
    const files = withJson('classes.json', (json) => void Object.assign(json['rogue'] as object, { icon: 'x' }));
    expect(refusalOf(() => parse(files)).message).toContain(
      `classes.rogue.icon is "x"; it is one of ${classIcons.join(', ')}, or absent for the plain mark`,
    );
  });

  test('that is not a text is refused, naming the Class', () => {
    const files = withJson('classes.json', (json) => void Object.assign(json['rogue'] as object, { icon: 3 }));
    expect(refusalOf(() => parse(files)).message).toContain('rogue.icon is 3; expected a string');
  });
});
