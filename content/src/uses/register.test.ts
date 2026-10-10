import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { contentFiles, parseContent, type ContentFileName } from '../index.js';
import { contentDir } from '../node.js';
import { generatedPart, registerDoc, withGeneratedPart, docBegins, docEnds } from './doc.js';
import { at, pathText, setAt, UseRefusal, type ContentJson } from './json.js';
import { contentEntries, engineEntriesOf, register, rulesFor, usesOf, type ContentEntry, type TraitUse } from './register.js';

// The register of a Trait's uses (DL-150 item 14): each content entry finds the uses the
// shipped content holds, adds one where it says how, and takes it out again, the content passing its
// checks after each. The drift and freshness checks are the editor's (tools/editor).

/** The shipped content as JSON, by file. */
function shipped(): Record<ContentFileName, unknown> {
  return Object.fromEntries(contentFiles.map((file) => [file, JSON.parse(readFileSync(join(contentDir, file), 'utf8'))])) as Record<ContentFileName, unknown>;
}

/**
 * The shipped content with an Encounter and a Synergy in the new form, whose Queries
 * a `has-trait` may filter: `ambush-on-the-road` one Check scored by the strongest Warrior, and
 * `shield-wall` requiring three Warriors. The Encounter has no Triumph list of its own, so that its
 * Triumph reads its Success list.
 */
function withQueries(): Record<ContentFileName, unknown> {
  const content = shipped();
  const encounters = content['encounters.json'] as Record<string, Record<string, unknown>>;
  const ambush = encounters['ambush-on-the-road'] as Record<string, unknown>;
  encounters['ambush-on-the-road'] = {
    name: ambush.name,
    kind: ambush.kind,
    checks: [{ key: 'front', name: 'The front', score: ['max', ['where', 'party', ['class', 'warrior']], ['stat', 'strength']], skills: [], difficultyFactor: 0.2 }],
    consequences: { success: (ambush.consequences as Record<string, unknown>).success, failure: (ambush.consequences as Record<string, unknown>).failure },
  };
  const synergies = content['synergies.json'] as Record<string, Record<string, unknown>>;
  (synergies['shield-wall'] as Record<string, unknown>).requires = [['>=', ['count', ['where', 'party', ['class', 'warrior']]], 3]];
  return content;
}

/** Whether content of these values passes its checks; throws naming the problems where it does not. */
function passes(content: ContentJson): true {
  parseContent(Object.fromEntries(Object.entries(content).map(([file, value]) => [file, JSON.stringify(value)])));
  return true;
}

/** Each Biography sentence of a key, as its use's place: `descriptions.json: heroBiography.traits.scarred.0`. */
function sentences(content: Record<ContentFileName, unknown>, place: 'biography' | 'heroBiography', key: string): string[] {
  const list = (content['descriptions.json'] as Record<string, { traits: Record<string, string[]> }>)[place]?.traits[key] ?? [];
  return list.map((_, index) => `descriptions.json: ${place}.traits.${key}.${index}`);
}

function entry(id: string): ContentEntry {
  const found = contentEntries().find((each) => each.id === id);
  if (found === undefined) throw new Error(`no entry ${id}`);
  return found;
}

describe('the register', () => {
  test('lists each content place DL-150 item 14 names, and the engine rules, each id once', () => {
    expect(contentEntries().map((each) => each.id)).toEqual([
      'excludes',
      'injury-leaves-trait',
      'encounter-trait',
      'encounter-has-trait',
      'synergy-has-trait',
      'biography-sentences',
      'portrait-callings',
      'portrait-features',
    ]);
    expect(engineEntriesOf().map((each) => each.id)).toEqual(
      expect.arrayContaining(['effective-stats', 'encounter-bonus', 'guildmaster-effects', 'guildmaster-setup', 'injury-traits', 'earned-trait', 'trait-events', 'biography-and-portrait']),
    );
    const ids = register.map((each) => each.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  // The uses of every shipped Trait, whatever the content editor has assigned: each use found
  // stands where it says and names the key, and every place in the files that names the key is
  // within a use found (the Traits' own rows apart).
  test("finds the shipped content's uses of every Trait, and every place that names it", () => {
    const content = shipped();
    const keys = ['hero-traits.json', 'guildmaster-traits.json'].flatMap((file) => Object.keys(content[file as ContentFileName] as object));
    const names = (value: unknown, key: string, file: string, path: (string | number)[] = []): (string | number)[][] => {
      const here = value === key && path.length > 0 ? [path] : [];
      if (Array.isArray(value)) return [...here, ...value.flatMap((item, index) => names(item, key, file, [...path, index]))];
      if (typeof value !== 'object' || value === null) return here;
      return [
        ...here,
        ...Object.entries(value).flatMap(([name, item]) => [
          ...(name === key && !(path.length === 0 && file.endsWith('-traits.json')) ? [[...path, name]] : []),
          ...names(item, key, file, [...path, name]),
        ]),
      ];
    };
    const prefix = (short: readonly (string | number)[], long: readonly (string | number)[]) => short.every((step, index) => long[index] === step);
    const problems: string[] = [];

    expect(keys.length).toBeGreaterThan(0);
    for (const key of keys) {
      const uses = usesOf(content, key);
      for (const use of uses) {
        const value = at(content[use.file], use.path);
        if (use.at !== `${use.file}: ${pathText(use.path)}`) problems.push(`${key}: ${use.at} is not where it stands`);
        if (!use.path.includes(key) && !JSON.stringify(value).includes(`"${key}"`)) problems.push(`${key}: ${use.at} does not name it`);
      }
      for (const file of contentFiles) {
        for (const place of names(content[file], key, file)) {
          if (!uses.some((use) => use.file === file && (prefix(use.path, place) || prefix(place, use.path)))) problems.push(`${key}: ${file}: ${pathText(place)} is no use found`);
        }
      }
    }
    expect(problems).toEqual([]);
    expect(usesOf(content, 'no-such-trait')).toEqual([]);
  });

  test('names the rules that read a Trait by its list and its effects', () => {
    const hero = rulesFor('hero', ['statModifiers']).map((rule) => rule.id);
    expect(hero).toContain('effective-stats');
    expect(hero).not.toContain('encounter-bonus');
    expect(hero).not.toContain('guildmaster-effects');
    expect(rulesFor('guildmaster', ['upkeepFactor']).map((rule) => rule.id)).toEqual(expect.arrayContaining(['guildmaster-effects', 'guildmaster-setup']));
  });
});

describe('a use added and removed', () => {
  // For each content entry: a target the entry adds a use at, for a key of its list. The content
  // passes its checks with the use added, the use is found, and removing it gives the content back.
  const cases: [string, string, Record<string, unknown>][] = [
    ['excludes', 'lame', { trait: 'one-eyed' }],
    ['injury-leaves-trait', 'lame', { injury: 'broken-arm' }],
    ['encounter-trait', 'one-eyed', { encounter: 'ambush-on-the-road', degree: 'failure', chance: 0.1 }],
    ['encounter-has-trait', 'scarred', { encounter: 'ambush-on-the-road', path: 'checks.0.score.1' }],
    ['synergy-has-trait', 'scarred', { synergy: 'shield-wall', path: 'requires.0.1.1' }],
    ['biography-sentences', 'short-winded', { sentence: '{He} wheezes on the stairs.' }],
    ['portrait-callings', 'well-liked', { calling: 'explorer', side: 'suits' }],
    ['portrait-features', 'lame', { feature: 'grey-hair' }],
  ];

  test.each(cases)('%s', (id, key, target) => {
    const content = withQueries();
    const before = usesOf(content, key).filter((use) => use.entry === id);
    const made = entry(id).add?.apply(content, key, target);
    const added = { ...content, ...made?.change };

    expect(passes(added)).toBe(true);
    const found = usesOf(added, key).filter((use) => use.entry === id);
    expect(found.length).toBe(before.length + 1);
    // The use `add` says it made is one the register finds, and the one taken out.
    const use = made?.use;
    if (use === undefined) throw new Error('no use reported');
    expect(found).toContainEqual(use);
    const removed = { ...added, ...entry(id).remove?.apply(added, use) };

    expect(passes(removed)).toBe(true);
    expect(usesOf(removed, key).filter((each) => each.entry === id)).toEqual(before);
    // The excludes come back as they were, both ways; every other entry's file exactly so.
    expect(removed).toEqual(content);
  });

  test("a Synergy's condition on the Party added where no path is given", () => {
    const content = withQueries();
    const changed = entry('synergy-has-trait').add?.apply(content, 'lame', { synergy: 'shield-wall' }).change;
    const synergy = (changed?.['synergies.json'] as Record<string, { requires: unknown[] }>)['shield-wall'];
    expect(synergy?.requires.at(-1)).toEqual(['>=', ['count', ['where', 'party', ['has-trait', 'lame']]], 1]);
    expect(passes({ ...content, ...changed })).toBe(true);
    expect(usesOf({ ...content, ...changed }, 'lame').map((use) => use.at)).toContain('synergies.json: shield-wall.requires.1.1.1.2');
  });

  // A use `add` made without a path, or a list it made,
  // is taken out whole by `remove`, so an assignment and its unassignment leave the content as it was.
  test("a Synergy's condition on the Party, added without a path, is taken out whole", () => {
    const content = withQueries();
    const added = { ...content, ...entry('synergy-has-trait').add?.apply(content, 'lame', { synergy: 'shield-wall' }).change };
    const [use] = usesOf(added, 'lame').filter((each) => each.entry === 'synergy-has-trait');
    if (use === undefined) throw new Error('no use');

    expect({ ...added, ...entry('synergy-has-trait').remove?.apply(added, use) }).toEqual(content);
  });

  test("a Triumph's list copied from the Success's goes again with the Trait added to it", () => {
    const content = withQueries();
    const added = { ...content, ...entry('encounter-trait').add?.apply(content, 'scarred', { encounter: 'ambush-on-the-road', degree: 'triumph', chance: 0.05 }).change };
    const [use] = usesOf(added, 'scarred').filter((each) => each.entry === 'encounter-trait');
    if (use === undefined) throw new Error('no use');

    expect({ ...added, ...entry('encounter-trait').remove?.apply(added, use) }).toEqual(content);
  });

  // A sentence is a use of its own, a use is never added twice in one
  // place, and `add` names the use it made even where an older one moved.
  test('a Biography sentence added is the one taken out, the others standing', () => {
    const content = withQueries();
    const made = entry('biography-sentences').add?.apply(content, 'lame', { sentence: '{He} limps, and does not say why.' });
    if (made === undefined) throw new Error('no add');
    const before = sentences(content, 'heroBiography', 'lame');
    expect(made.use.at).toBe(`descriptions.json: heroBiography.traits.lame.${before.length}`);
    const added = { ...content, ...made.change };

    expect({ ...added, ...entry('biography-sentences').remove?.apply(added, made.use) }).toEqual(content);
  });

  test.each([
    ['encounter-has-trait', 'scarred', { encounter: 'ambush-on-the-road', path: 'checks.0.score.1' }, 'is filtered by "scarred" already'],
    ['synergy-has-trait', 'scarred', { synergy: 'shield-wall' }, 'holds the condition on "scarred" already'],
    ['synergy-has-trait', 'scarred', { synergy: 'shield-wall', path: 'requires.0.1.1' }, 'is filtered by "scarred" already'],
    ['encounter-trait', 'scarred', { encounter: 'ambush-on-the-road', degree: 'failure', chance: 0.1 }, 'gives "scarred" already'],
    ['portrait-callings', 'well-liked', { calling: 'explorer', side: 'suits' }, 'names "well-liked" already'],
    ['portrait-features', 'lame', { feature: 'grey-hair' }, 'names "lame" already'],
    ['excludes', 'lame', { trait: 'one-eyed' }, 'excludes "lame" already'],
  ])('%s refuses the same use twice in one place', (id, key, target, problem) => {
    const content = withQueries();
    const once = { ...content, ...entry(id).add?.apply(content, key, target).change };
    expect(() => entry(id).add?.apply(once, key, target)).toThrow(problem);
  });

  test('names the use it added by where it stands, where it moved an older one of the key', () => {
    const content = withQueries();
    const at = { encounter: 'ambush-on-the-road', path: 'checks.0.score.1' };
    let next: typeof content = content;
    for (const key of ['scarred', 'one-eyed']) next = { ...next, ...entry('encounter-has-trait').add?.apply(next, key, at).change };
    const made = entry('encounter-has-trait').add?.apply(next, 'scarred', at);

    expect(made?.use.at).toBe('encounters.json: ambush-on-the-road.checks.0.score.1.2');
    expect(usesOf({ ...next, ...made?.change }, 'scarred').map((use) => use.at)).toContain('encounters.json: ambush-on-the-road.checks.0.score.1.1.1.2');
  });

  test('refuses an Encounter or a Synergy that is not there', () => {
    const content = shipped();
    expect(() => entry('encounter-has-trait').add?.apply(content, 'lame', { encounter: 'no-such-encounter', path: 'checks.0.score.1' })).toThrow(
      'encounters.json: no-such-encounter is not there',
    );
    expect(() => entry('synergy-has-trait').add?.apply(content, 'lame', { synergy: 'no-such-synergy' })).toThrow('synergies.json: no-such-synergy is not there');
  });

  test("a Triumph's list is copied from the Success's before a positive Trait is added to it", () => {
    const content = withQueries();
    const changed = entry('encounter-trait').add?.apply(content, 'scarred', { encounter: 'ambush-on-the-road', degree: 'triumph', chance: 0.05 }).change;
    const consequences = (changed?.['encounters.json'] as Record<string, { consequences: Record<string, unknown[]> }>)['ambush-on-the-road']?.consequences;
    expect(consequences?.triumph).toEqual([...(consequences?.success ?? []), { kind: 'trait', traitKey: 'scarred', chance: 0.05 }]);
    expect(passes({ ...content, ...changed })).toBe(true);
  });

  test('a has-trait taken out of an and, an or and a where, and refused elsewhere', () => {
    const content = withQueries();
    const encounters = content['encounters.json'] as Record<string, { checks: { score: unknown }[] }>;
    const front = encounters['ambush-on-the-road']?.checks[0];
    if (front === undefined) throw new Error('no Check');
    const remove = (score: unknown): unknown => {
      front.score = score;
      const [use] = usesOf(content, 'scarred').filter((each) => each.entry === 'encounter-has-trait');
      if (use === undefined) throw new Error('no use');
      const changed = entry('encounter-has-trait').remove?.apply(content, use);
      return (changed?.['encounters.json'] as typeof encounters)['ambush-on-the-road']?.checks[0]?.score;
    };
    const warriors = ['class', 'warrior'];
    const scarred = ['has-trait', 'scarred'];
    const strength = ['stat', 'strength'];

    expect(remove(['max', ['where', 'party', ['and', warriors, scarred]], strength])).toEqual(['max', ['where', 'party', warriors], strength]);
    expect(remove(['max', ['where', 'party', ['or', warriors, scarred, ['hurt']]], strength])).toEqual(['max', ['where', 'party', ['or', warriors, ['hurt']]], strength]);
    expect(remove(['max', ['where', 'party', scarred], strength])).toEqual(['max', 'party', strength]);
    expect(() => remove(['max', ['where', 'party', ['not', scarred]], strength])).toThrow(UseRefusal);
  });

  test('refuses a target that is not there or not of the key\'s list, naming why', () => {
    const content = withQueries();
    expect(() => entry('injury-leaves-trait').add?.apply(content, 'lame', { injury: 'deep-cut' })).toThrow('leaves "scarred" already');
    expect(() => entry('injury-leaves-trait').add?.apply(content, 'miser', { injury: 'broken-arm' })).toThrow('is not a Hero Trait');
    expect(() => entry('portrait-callings').add?.apply(content, 'scarred', { calling: 'soldier', side: 'suits' })).toThrow('is not a Guildmaster Trait');
    expect(() => entry('portrait-callings').add?.apply(content, 'spendthrift', { calling: 'merchant', side: 'suits' })).toThrow('clashes names "spendthrift" already');
    expect(() => entry('encounter-has-trait').add?.apply(content, 'lame', { encounter: 'ambush-on-the-road', path: 'checks.0.score.2' })).toThrow('is not a Set Query');
    expect(() => entry('excludes').add?.apply(content, 'lame', { trait: 'miser' })).toThrow('not of the same list');
  });
});

// DL-186 item 14: a use changed in place, where its entry holds values besides the key: a
// trait consequence's chance or among, a Biography sentence's words. Any other entry has none.
describe('a use changed in place', () => {
  /** The shipped use of `key` in `id`, the first. */
  function shippedUse(content: ContentJson, key: string, id: string): TraitUse {
    const found = usesOf(content, key).find((use) => use.entry === id);
    if (found === undefined) throw new Error(`no use of ${key} in ${id}`);
    return found;
  }

  test("a trait consequence's chance changed, the rest of the content as it was, passing its checks", () => {
    const content = shipped();
    const use = shippedUse(content, 'battle-shy', 'encounter-trait');
    const change = entry('encounter-trait').update?.apply(content, use, { chance: 0.12 });
    const changed = { ...content, ...change };

    expect(Object.keys(change ?? {})).toEqual(['encounters.json']);
    expect(at(changed['encounters.json'], use.path)).toEqual({ ...(at(content['encounters.json'], use.path) as object), chance: 0.12 });
    expect(passes(changed)).toBe(true);
    expect(usesOf(changed, 'battle-shy')).toEqual(usesOf(content, 'battle-shy'));
    // Only that value: the file as JSON differs at that place alone.
    const back = structuredClone(changed['encounters.json']);
    setAt(back, [...use.path, 'chance'], (at(content['encounters.json'], use.path) as { chance: number }).chance, 'encounters.json');
    expect(back).toEqual(content['encounters.json']);
  });

  test("a trait consequence's among given, and taken out again with null", () => {
    const content = shipped();
    const use = shippedUse(content, 'battle-shy', 'encounter-trait');
    const among = ['where', 'party', ['class', 'warrior']];
    const given = { ...content, ...entry('encounter-trait').update?.apply(content, use, { among }) };
    expect(at(given['encounters.json'], [...use.path, 'among'])).toEqual(among);
    expect(passes(given)).toBe(true);
    const taken = { ...given, ...entry('encounter-trait').update?.apply(given, use, { among: null }) };
    expect(taken['encounters.json']).toEqual(content['encounters.json']);
  });

  test('a Biography sentence changed in its place, the others standing', () => {
    const content = shipped();
    const use = shippedUse(content, 'lame', 'biography-sentences');
    const changed = { ...content, ...entry('biography-sentences').update?.apply(content, use, { sentence: '{He} limps, and does not say why.' }) };
    expect(at(changed['descriptions.json'], use.path)).toBe('{He} limps, and does not say why.');
    expect(usesOf(changed, 'lame')).toEqual(usesOf(content, 'lame'));
    expect(passes(changed)).toBe(true);
  });

  test('refuses a value of the wrong type, a sentence the list holds already, and a use that is not there, naming why', () => {
    const content = shipped();
    const use = shippedUse(content, 'battle-shy', 'encounter-trait');
    expect(() => entry('encounter-trait').update?.apply(content, use, { chance: 'often' })).toThrow("the chance is wanted: a number");
    expect(() => entry('encounter-trait').update?.apply(content, { ...use, path: [...use.path.slice(0, -1), 99] }, { chance: 0.1 })).toThrow(UseRefusal);
    const sentence = shippedUse(content, 'lame', 'biography-sentences');
    const other = at(content['descriptions.json'], [...sentence.path.slice(0, -1), 1]);
    expect(() => entry('biography-sentences').update?.apply(content, sentence, { sentence: other })).toThrow('holds that sentence already');
  });

  // A chance is "above 0 and at most 1", as the entry's words say, in
  // an update and an assignment alike; the content's checks take 0, a consequence that never comes.
  test.each([0, -0.1, 1.5])('refuses a chance of %s, changed or assigned, naming the bound', (chance) => {
    const content = shipped();
    const use = shippedUse(content, 'battle-shy', 'encounter-trait');
    expect(() => entry('encounter-trait').update?.apply(content, use, { chance })).toThrow(`the chance is ${chance}; it is above 0 and at most 1`);
    expect(() => entry('encounter-trait').add?.apply(content, 'battle-shy', { encounter: 'hold-the-line', degree: 'failure', chance })).toThrow(
      `the target's chance is ${chance}; it is above 0 and at most 1`,
    );
    expect(Object.keys(entry('encounter-trait').update?.apply(content, use, { chance: 1 }) ?? {})).toEqual(['encounters.json']);
  });

  test('is offered only where a use holds values besides the key', () => {
    expect(contentEntries().flatMap((each) => (each.update === null ? [] : [each.id]))).toEqual(['encounter-trait', 'biography-sentences']);
    expect(Object.keys(entry('encounter-trait').update?.fields ?? {})).toEqual(['chance', 'among']);
    expect(Object.keys(entry('biography-sentences').update?.fields ?? {})).toEqual(['sentence']);
  });
});

describe("the doc's generated part", () => {
  test('is written between its markers, and found again in a text of either line end', () => {
    const doc = registerDoc();
    expect(doc.startsWith(`${docBegins}\n`)).toBe(true);
    expect(doc.endsWith(`${docEnds}\n`)).toBe(true);
    for (const entry of register) expect(doc).toContain(`\`${entry.id}\``);

    const crlf = withGeneratedPart('# Traits\r\n\r\nBy hand.\r\n');
    expect(crlf).toContain('\r\n');
    expect(crlf.replace(/\r\n/g, '')).not.toContain('\n');
    expect(generatedPart(crlf)).toBe(doc);
    expect(withGeneratedPart(crlf)).toBe(crlf);
    expect(generatedPart('# Traits\n')).toBeNull();
  });
});
