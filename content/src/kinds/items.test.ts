import { describe, expect, test } from 'vitest';
import { validateContent } from '../index.js';
import { shipped, parse, withJson, withSourceJson, refusalOf, withoutLoot, type Files } from './content.test-support.js';

// The Item definitions' refusals (DL-243). Each is triggered by content built in memory from the shipped files with one
// thing broken, read and checked as `parseContent` does, and names the offending key, so an author
// can find it.

// The refusals of an Item definition (DL-48).
describe('an Item definition', () => {
  type Row = Record<string, unknown>;
  const rowOf = (json: Files['items/'], key: string): Row => {
    const found = json[key];
    if (found === undefined) throw new Error(`items/ has no ${key}`);
    return found;
  };
  const sword = (json: Files['items/']) => rowOf(json, 'short-sword');
  const draught = (json: Files['items/']) => rowOf(json, 'healing-draught');
  const whetstone = (json: Files['items/']) => rowOf(json, 'whetstone');
  const blade = (json: Files['items/']) => rowOf(json, 'barrow-kings-blade');

  test('of gear without a slot is refused, naming the Item and the slots', () => {
    const files = withJson('items/', (json) => void Reflect.deleteProperty(sword(json), 'slot'));

    expect(refusalOf(() => parse(files)).message).toMatch(
      /items\/short-sword\.json: slot is missing; expected one of weapon, armour, trinket/,
    );
  });

  test('of a consumable with a slot is refused, naming the Item', () => {
    const files = withJson('items/', (json) => void Object.assign(draught(json), { slot: 'trinket' }));

    expect(refusalOf(() => parse(files)).message).toMatch(
      /items\/healing-draught\.json: slot is not a field of a consumable: only gear has a slot/,
    );
  });

  test.each<[string, (json: Files['items/']) => void, RegExp]>([
    ['a modifier on a Stat that does not exist', (json) => void Object.assign(sword(json), { statModifiers: { luck: 1 } }), /items\.short-sword\.statModifiers: "luck" is not a Hero Stat/],
    ['a modifier on a Guildmaster Stat', (json) => void Object.assign(sword(json), { statModifiers: { coaching: 1 } }), /items\.short-sword\.statModifiers: "coaching" is not a Hero Stat/],
    ['a modifier of 0', (json) => void Object.assign(sword(json), { statModifiers: { weaponry: 0 } }), /items\.short-sword\.statModifiers\.weaponry is 0; it is a whole number other than 0/],
    ['a modifier that is not whole', (json) => void Object.assign(sword(json), { statModifiers: { weaponry: 1.5 } }), /items\.short-sword\.statModifiers\.weaponry is 1\.5/],
    ['no modifiers', (json) => void Object.assign(sword(json), { statModifiers: {} }), /items\.short-sword\.statModifiers is empty: gear modifies at least one Stat/],
    ['a slot that is not one of the three', (json) => void Object.assign(sword(json), { slot: 'belt' }), /items\/short-sword\.json: slot is "belt"; expected one of weapon, armour, trinket/],
    ['an effect', (json) => void Object.assign(sword(json), { effect: { kind: 'heal', days: 1 } }), /items\/short-sword\.json: effect is not a field of gear/],
    ['a negative price', (json) => void Object.assign(sword(json), { buyPrice: -5 }), /items\.short-sword\.buyPrice is -5; it is a whole number above 0/],
    ['a price of 0', (json) => void Object.assign(sword(json), { buyPrice: 0 }), /items\.short-sword\.buyPrice is 0/],
    ['a price that is not whole', (json) => void Object.assign(sword(json), { buyPrice: 39.5 }), /items\/short-sword\.json: buyPrice is 39\.5; expected a whole number/],
    ['a negative value', (json) => void Object.assign(blade(json), { value: -5 }), /items\.barrow-kings-blade\.value is -5; it is a whole number above 0/],
    ['a value of 0', (json) => void Object.assign(blade(json), { value: 0 }), /items\.barrow-kings-blade\.value is 0/],
    ['a value that is not whole', (json) => void Object.assign(blade(json), { value: 39.5 }), /items\/barrow-kings-blade\.json: value is 39\.5; expected a whole number/],
    ['both buyPrice and value', (json) => void Object.assign(blade(json), { buyPrice: 100 }), /items\.barrow-kings-blade has both buyPrice and value: an Item has exactly one/],
    ['neither buyPrice nor value', (json) => void Reflect.deleteProperty(blade(json), 'value'), /items\.barrow-kings-blade has neither buyPrice nor value: an Item has exactly one/],
    ['a consumable with value', (json) => void Object.assign(draught(json), { value: 100 }), /items\.healing-draught\.value: a consumable has a buyPrice, never a value/],
    ['a tag that is not kebab-case', (json) => void Object.assign(sword(json), { tags: ['Plain Steel'] }), /items\.short-sword\.tags: "Plain Steel" is not kebab-case/],
    ['a tag listed twice', (json) => void Object.assign(sword(json), { tags: ['plain', 'plain'] }), /items\.short-sword\.tags: "plain" is listed twice/],
    ['a kind that is neither', (json) => void Object.assign(sword(json), { kind: 'trade-good' }), /items\/short-sword\.json: kind is "trade-good"; expected one of gear, consumable/],
    ['unique left out', (json) => void Reflect.deleteProperty(sword(json), 'unique'), /items\/short-sword\.json: unique is missing; expected true or false/],
    ['a unique consumable', (json) => void Object.assign(draught(json), { unique: true }), /items\.healing-draught\.unique is true; a consumable is common/],
    ['a consumable with Stat modifiers', (json) => void Object.assign(draught(json), { statModifiers: { spirit: 1 } }), /items\/healing-draught\.json: statModifiers is not a field of a consumable/],
    ['a consumable with no effect', (json) => void Reflect.deleteProperty(draught(json), 'effect'), /items\/healing-draught\.json: effect is missing/],
    ['an effect of a kind the union lacks', (json) => void Object.assign(draught(json), { effect: { kind: 'teleport' } }), /items\/healing-draught\.json: effect\.kind is "teleport"; expected one of reroll, bonus, heal/],
    ['an effect with a field its kind lacks', (json) => void Object.assign(draught(json), { effect: { kind: 'heal', days: 5, flat: 2 } }), /items\/healing-draught\.json: effect\.flat is not a field of a heal effect/],
    ['a heal of no Days', (json) => void Object.assign(draught(json), { effect: { kind: 'heal', days: 0 } }), /items\.healing-draught\.effect\.days is 0; it is a whole number from 1/],
    ['a bonus of 0', (json) => void Object.assign(whetstone(json), { effect: { kind: 'bonus', flat: 0, kinds: ['combat'] } }), /items\.whetstone\.effect\.flat is 0; it is a number above 0/],
    ['an Encounter kind that is not one of the six', (json) => void Object.assign(whetstone(json), { effect: { kind: 'bonus', flat: 3, kinds: ['naval'] } }), /items\/whetstone\.json: effect\.kinds is \["naval"\]; expected a list, each one of combat, travel, social, arcane, stealth, lore/],
    ['no Encounter kinds', (json) => void Object.assign(whetstone(json), { effect: { kind: 'reroll', kinds: [] } }), /items\.whetstone\.effect\.kinds is empty/],
    ['an Encounter kind listed twice', (json) => void Object.assign(whetstone(json), { effect: { kind: 'reroll', kinds: ['travel', 'travel'] } }), /items\.whetstone\.effect\.kinds: "travel" is listed twice/],
  ])('with %s is refused, naming the Item', (_, change, problem) => {
    expect(refusalOf(() => parse(withJson('items/', change))).message).toMatch(problem);
  });

  test('the file may hold none, when no Loot table names one', () => {
    expect(parse(withSourceJson(withoutLoot(), 'items/', {})).items).toEqual({});
  });

  test('a key that is not kebab-case is refused', () => {
    const files = withJson('items/', (json) => void (json['Short_Sword'] = sword(json)));

    expect(refusalOf(() => parse(files)).message).toContain('items: "Short_Sword" is not kebab-case');
  });
});

describe('validateContent on a set built in memory', () => {
  test('refuses gear of a slot that is not one, and a consumable with a slot, which the parser cannot see in memory', () => {
    const content = structuredClone(shipped);
    Object.assign(content.items['short-sword'] ?? {}, { slot: 'belt' });
    Object.assign(content.items['healing-draught'] ?? {}, { slot: 'trinket', statModifiers: { spirit: 1 } });
    Object.assign(content.items['whetstone'] ?? {}, { effect: { kind: 'bonus', flat: 3, kinds: ['naval'] } });

    const { message } = refusalOf(() => validateContent(content));

    expect(message).toMatch(/items\.short-sword\.slot: "belt" is not a gear slot \(weapon, armour, trinket\)/);
    expect(message).toMatch(/items\.healing-draught\.slot: a consumable has no slot/);
    expect(message).toMatch(/items\.healing-draught\.statModifiers: a consumable modifies no Stat/);
    expect(message).toMatch(/items\.whetstone\.effect\.kinds: "naval" is not a kind of Encounter/);
  });


  test('refuses gear with an effect, which the parser cannot see in memory', () => {
    const content = structuredClone(shipped);
    Object.assign(content.items['short-sword'] ?? {}, { effect: { kind: 'bonus', flat: 3, kinds: ['combat'] } });

    expect(refusalOf(() => validateContent(content)).message).toContain(
      'items.short-sword.effect: gear has no effect; only a consumable has one',
    );
  });
});
