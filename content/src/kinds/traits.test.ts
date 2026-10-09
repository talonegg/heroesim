import { describe, expect, test } from 'vitest';
import { validateContent } from '../index.js';
import { shipped, realFiles, parse, withJson, refusalOf, type Files } from './content.test-support.js';

// The Traits' refusals, both lists' and their effects' (DL-243). Each is triggered by content built in memory from the shipped files with one
// thing broken, read and checked as `parseContent` does, and names the offending key, so an author
// can find it.

describe('a file', () => {
  // M4-S5, v1.1.4-S7: a Guildmaster Trait carries one effect or more, each of the closed union (DL-43,
  // DL-150 item 2), in `guildmaster-traits.json`.
  const traitRefusals: [string, (json: Files['guildmaster-traits.json']) => void, RegExp][] = [
    [
      'an effect of no kind the union knows',
      (json) => Object.assign(json['miser'] ?? {}, { effects: [{ upkeepFactor: 0.9 }] }),
      /guildmaster-traits\.json: miser\.effects\.0\.kind.*classStatBonus, guildMoraleShift, upkeepFactor/,
    ],
    [
      'an effect with a field its kind does not have',
      (json) => Object.assign(json['miser'] ?? {}, { effects: [{ kind: 'guildMoraleShift', delta: -5, factor: 2 }] }),
      /guildmaster-traits\.json: miser\.effects\.0\.factor is not a field/,
    ],
    [
      'a classStatBonus naming an unknown Class',
      (json) => Object.assign(json['old-soldier'] ?? {}, { effects: [{ kind: 'classStatBonus', classKey: 'paladin', statKey: 'weaponry', delta: 1 }] }),
      /guildmasterTraits\.old-soldier\.effects\.0\.classKey: "paladin" is not a Class/,
    ],
    [
      'a classStatBonus naming a Stat that is no Hero Stat',
      (json) => Object.assign(json['old-soldier'] ?? {}, { effects: [{ kind: 'classStatBonus', classKey: 'warrior', statKey: 'judgement', delta: 1 }] }),
      /guildmasterTraits\.old-soldier\.effects\.0\.statKey: "judgement" is not a Hero Stat/,
    ],
    [
      'a classStatBonus of 0',
      (json) => Object.assign(json['old-soldier'] ?? {}, { effects: [{ kind: 'classStatBonus', classKey: 'warrior', statKey: 'weaponry', delta: 0 }] }),
      /guildmasterTraits\.old-soldier\.effects\.0\.delta is 0/,
    ],
    [
      'an upkeepFactor of 0',
      (json) => Object.assign(json['thrifty'] ?? {}, { effects: [{ kind: 'upkeepFactor', factor: 0 }] }),
      /guildmasterTraits\.thrifty\.effects\.0\.factor is 0/,
    ],
    [
      'a second effect that breaks its rule, each effect of the list held to its own',
      (json) => Object.assign(json['thrifty'] ?? {}, { effects: [{ kind: 'upkeepFactor', factor: 0.9 }, { kind: 'upkeepFactor', factor: -1 }] }),
      /guildmasterTraits\.thrifty\.effects\.1\.factor is -1/,
    ],
    [
      'no effect',
      (json) => Object.assign(json['well-liked'] ?? {}, { effects: [] }),
      /guildmasterTraits\.well-liked\.effects is empty; a Guildmaster Trait carries one effect or more/,
    ],
    [
      'its effect written as before, one `effect`',
      (json) => {
        const miser = json['miser'] as unknown as Record<string, unknown>;
        miser.effect = (miser.effects as unknown[])[0];
        delete miser.effects;
      },
      /guildmaster-traits\.json: miser\.effects is missing; expected a list of objects[\s\S]*miser\.effect is not a field of a Guildmaster Trait/,
    ],
    ['an owner, which the list now says', (json) => Object.assign(json['miser'] ?? {}, { owner: 'guildmaster' }), /guildmaster-traits\.json: miser\.owner is not a field of a Guildmaster Trait/],
  ];

  test.each(traitRefusals)('with %s is refused, naming the Trait (M4-S5, v1.1.4-S7)', (_, change, message) => {
    expect(refusalOf(() => parse(withJson('guildmaster-traits.json', change))).message).toMatch(message);
  });

  // M9-S2: a Guildmaster Trait's cost against the Trait budget is a whole number, and its
  // exclusions name Guildmaster Traits and hold both ways (DL-100 item 3, DL-102).
  const costAndExclusionRefusals: [string, (json: Files['guildmaster-traits.json']) => void, RegExp][] = [
    ['a cost missing', (json) => Reflect.deleteProperty(json['miser'] ?? {}, 'cost'), /guildmaster-traits\.json: miser\.cost is missing; expected a whole number/],
    ['a cost that is not a whole number', (json) => Object.assign(json['miser'] ?? {}, { cost: -1.5 }), /guildmaster-traits\.json: miser\.cost is -1\.5; expected a whole number/],
    ['exclusions missing', (json) => Reflect.deleteProperty(json['miser'] ?? {}, 'excludes'), /guildmaster-traits\.json: miser\.excludes is missing; expected a list of strings/],
    [
      'an exclusion that does not hold both ways',
      (json) => Object.assign(json['thrifty'] ?? {}, { excludes: ['spendthrift', 'old-soldier'] }),
      /guildmasterTraits\.thrifty\.excludes: "old-soldier" does not exclude "thrifty" in return/,
    ],
    [
      'an exclusion naming a Trait content lacks',
      (json) => Object.assign(json['thrifty'] ?? {}, { excludes: ['spendthrift', 'cursed'] }),
      /guildmasterTraits\.thrifty\.excludes: "cursed" is not a Guildmaster Trait/,
    ],
    [
      'an exclusion naming a Hero Trait',
      (json) => Object.assign(json['thrifty'] ?? {}, { excludes: ['spendthrift', 'scarred'] }),
      /guildmasterTraits\.thrifty\.excludes: "scarred" is not a Guildmaster Trait/,
    ],
    ['a Trait excluding itself', (json) => Object.assign(json['old-soldier'] ?? {}, { excludes: ['old-soldier'] }), /guildmasterTraits\.old-soldier\.excludes: a Trait cannot exclude itself/],
    [
      'an exclusion listed twice',
      (json) => Object.assign(json['thrifty'] ?? {}, { excludes: ['spendthrift', 'spendthrift'] }),
      /guildmasterTraits\.thrifty\.excludes: "spendthrift" is listed twice/,
    ],
  ];

  test.each(costAndExclusionRefusals)('with %s is refused, naming the Trait (M9-S2)', (_, change, message) => {
    expect(refusalOf(() => parse(withJson('guildmaster-traits.json', change))).message).toMatch(message);
  });

  // v1.1.4-S7: a Hero Trait in `hero-traits.json` has no cost, effects of its own list's kinds, and
  // exclusions of Hero Traits, both ways (DL-150 items 1 to 3 and 8).
  const heroTraitRefusals: [string, (json: Files['hero-traits.json']) => void, RegExp][] = [
    [
      "an effect of a Guildmaster Trait's kind",
      (json) => Object.assign(json['scarred'] ?? {}, { effects: [{ kind: 'guildMoraleShift', delta: -1 }] }),
      /hero-traits\.json: scarred\.effects\.0\.kind is "guildMoraleShift"; expected one of statModifiers, encounterBonus/,
    ],
    [
      'a statModifiers naming a Stat content lacks',
      (json) => Object.assign(json['lame'] ?? {}, { effects: [{ kind: 'statModifiers', modifiers: { agility: -2 } }] }),
      /heroTraits\.lame\.effects\.0\.modifiers: "agility" is not a Hero Stat/,
    ],
    [
      'a statModifiers naming a Guildmaster Stat',
      (json) => Object.assign(json['lame'] ?? {}, { effects: [{ kind: 'statModifiers', modifiers: { judgement: -2 } }] }),
      /heroTraits\.lame\.effects\.0\.modifiers: "judgement" is not a Hero Stat/,
    ],
    [
      'a statModifiers by a part of a point',
      (json) => Object.assign(json['lame'] ?? {}, { effects: [{ kind: 'statModifiers', modifiers: { dexterity: -1.5 } }] }),
      /heroTraits\.lame\.effects\.0\.modifiers\.dexterity is -1\.5; it is a whole number other than 0/,
    ],
    [
      'a statModifiers by 0',
      (json) => Object.assign(json['lame'] ?? {}, { effects: [{ kind: 'statModifiers', modifiers: { dexterity: 0 } }] }),
      /heroTraits\.lame\.effects\.0\.modifiers\.dexterity is 0; it is a whole number other than 0/,
    ],
    [
      'a statModifiers that moves no Stat',
      (json) => Object.assign(json['lame'] ?? {}, { effects: [{ kind: 'statModifiers', modifiers: {} }] }),
      /heroTraits\.lame\.effects\.0\.modifiers is empty: a statModifiers effect moves at least one Stat/,
    ],
    [
      "a statModifiers with an Encounter bonus's field",
      (json) => Object.assign(json['lame'] ?? {}, { effects: [{ kind: 'statModifiers', modifiers: { dexterity: -2 }, flat: 2 }] }),
      /hero-traits\.json: lame\.effects\.0\.flat is not a field of a statModifiers effect/,
    ],
    [
      'an encounterBonus naming no kind and no tag',
      (json) => Object.assign(json['scarred'] ?? {}, { effects: [{ kind: 'encounterBonus', flat: 2 }] }),
      /heroTraits\.scarred\.effects\.0 names no Encounter kind and no tag: it adds to the Encounters it names/,
    ],
    [
      'an encounterBonus of 0',
      (json) => Object.assign(json['scarred'] ?? {}, { effects: [{ kind: 'encounterBonus', flat: 0, kinds: ['combat'] }] }),
      /heroTraits\.scarred\.effects\.0\.flat is 0; it is a number other than 0/,
    ],
    [
      'an encounterBonus on a kind that is not one',
      (json) => Object.assign(json['scarred'] ?? {}, { effects: [{ kind: 'encounterBonus', flat: 2, kinds: ['naval'] }] }),
      /hero-traits\.json: scarred\.effects\.0\.kinds is \["naval"\]; expected a list, each one of combat, travel, social, arcane, stealth, lore/,
    ],
    [
      'an encounterBonus naming a kind twice',
      (json) => Object.assign(json['scarred'] ?? {}, { effects: [{ kind: 'encounterBonus', flat: 2, kinds: ['combat', 'combat'] }] }),
      /heroTraits\.scarred\.effects\.0\.kinds: "combat" is listed twice/,
    ],
    [
      'an encounterBonus on a tag that is not kebab-case',
      (json) => Object.assign(json['scarred'] ?? {}, { effects: [{ kind: 'encounterBonus', flat: 2, tags: ['Undead'] }] }),
      /heroTraits\.scarred\.effects\.0\.tags: "Undead" is not kebab-case/,
    ],
    [
      'an encounterBonus naming a tag twice',
      (json) => Object.assign(json['scarred'] ?? {}, { effects: [{ kind: 'encounterBonus', flat: 2, tags: ['undead', 'undead'] }] }),
      /heroTraits\.scarred\.effects\.0\.tags: "undead" is listed twice/,
    ],
    ['effects missing', (json) => Reflect.deleteProperty(json['scarred'] ?? {}, 'effects'), /hero-traits\.json: scarred\.effects is missing; expected a list of objects/],
    ['a cost, which only a Guildmaster Trait has', (json) => Object.assign(json['scarred'] ?? {}, { cost: 0 }), /hero-traits\.json: scarred\.cost is not a field of a Hero Trait/],
    ['an owner, which the list now says', (json) => Object.assign(json['scarred'] ?? {}, { owner: 'hero' }), /hero-traits\.json: scarred\.owner is not a field of a Hero Trait/],
    [
      'an exclusion that does not hold both ways',
      (json) => Object.assign(json['scarred'] ?? {}, { excludes: ['lame'] }),
      /heroTraits\.scarred\.excludes: "lame" does not exclude "scarred" in return/,
    ],
    [
      'an exclusion naming a Guildmaster Trait',
      (json) => Object.assign(json['scarred'] ?? {}, { excludes: ['miser'] }),
      /heroTraits\.scarred\.excludes: "miser" is not a Hero Trait/,
    ],
    ['a Trait excluding itself', (json) => Object.assign(json['lame'] ?? {}, { excludes: ['lame'] }), /heroTraits\.lame\.excludes: a Trait cannot exclude itself/],
    [
      'a key that is also a Guildmaster Trait',
      (json) => Object.assign(json, { miser: { name: 'Miser', excludes: [], effects: [] } }),
      /heroTraits\.miser: "miser" is also a Guildmaster Trait; a Trait's key is in guildmaster-traits\.json or hero-traits\.json, not both/,
    ],
  ];

  test.each(heroTraitRefusals)('with %s is refused, naming the Trait (v1.1.4-S7)', (_, change, message) => {
    expect(refusalOf(() => parse(withJson('hero-traits.json', change))).message).toMatch(message);
  });

  test("a Hero Trait's effects of both kinds load as written: Stat changes naming several Stats, and an Encounter bonus by kinds, by tags or both (v1.1.4-S7)", () => {
    const effects = [
      { kind: 'statModifiers', modifiers: { dexterity: -2, endurance: -1 } },
      { kind: 'encounterBonus', flat: -3, kinds: ['combat', 'travel'] },
      { kind: 'encounterBonus', flat: 2, tags: ['undead'] },
      { kind: 'encounterBonus', flat: 1, kinds: ['social'], tags: ['court'] },
    ];
    const files = withJson('hero-traits.json', (json) => void Object.assign(json['lame'] ?? {}, { effects }));
    expect(parse(files).heroTraits.lame?.effects).toEqual(effects);
  });

  test('a Hero Trait may exclude another that excludes it in return (v1.1.4-S7, DL-150 item 3)', () => {
    const files = withJson('hero-traits.json', (json) => {
      Object.assign(json['scarred'] ?? {}, { excludes: ['lame'] });
      Object.assign(json['lame'] ?? {}, { excludes: ['scarred'] });
    });

    expect(parse(files).heroTraits.scarred?.excludes).toEqual(['lame']);
  });

  test('the old `traits.json` is not read, and the two lists are wanted in its place (v1.1.4-S7)', () => {
    const files = realFiles();
    const old = { scarred: { name: 'Scarred', owner: 'hero', cost: 0, excludes: [], effect: null } };
    delete files['hero-traits.json'];

    const { message } = refusalOf(() => parse({ ...files, 'traits.json': JSON.stringify(old) }));

    expect(message).toContain('hero-traits.json: missing');
    expect(message).not.toMatch(/(^|\s)traits\.json/);
  });
});

describe('validateContent on a set built in memory', () => {
  test("refuses a Hero Trait's encounterBonus on a kind of Encounter that is not one, which the parser cannot see in memory (v1.1.4-S14)", () => {
    const content = structuredClone(shipped);
    Object.assign(content.heroTraits['battle-tried']?.effects[0] ?? {}, { kinds: ['combat', 'naval'] });

    expect(refusalOf(() => validateContent(content)).message).toMatch(/heroTraits\.battle-tried\.effects\.0\.kinds: "naval" is not a kind of Encounter/);
  });

  test('refuses a Trait cost that is not a whole number, which the parser cannot see in memory (M9-S2)', () => {
    const content = structuredClone(shipped);
    Object.assign(content.guildmasterTraits['thrifty'] ?? {}, { cost: 1.5 });

    expect(refusalOf(() => validateContent(content)).message).toMatch(/guildmasterTraits\.thrifty\.cost is 1\.5; it is a whole number/);
  });

  test('accepts a Guildmaster Trait of two effects, a list of effects being one or more (v1.1.4-S7, DL-150 item 2)', () => {
    const content = structuredClone(shipped);
    content.guildmasterTraits['miser']?.effects.push({ kind: 'upkeepFactor', factor: 0.95 });

    expect(validateContent(content).guildmasterTraits['miser']?.effects).toHaveLength(2);
  });

});
