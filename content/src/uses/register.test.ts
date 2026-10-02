import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { contentFiles, parseContent, type ContentFileName } from '../index.js';
import { contentDir } from '../node.js';
import { generatedPart, registerDoc, withGeneratedPart, docBegins, docEnds } from './doc.js';
import { UseRefusal, type ContentJson } from './json.js';
import { contentEntries, engineEntriesOf, register, rulesFor, usesOf, type ContentEntry } from './register.js';

// The register of a Trait's uses (v1.1.4-S12, DL-150 item 14): each content entry finds the uses the
// shipped content holds, adds one where it says how, and takes it out again, the content passing its
// checks after each. The drift and freshness checks are the editor's (tools/editor).

/** The shipped content as JSON, by file. */
function shipped(): Record<ContentFileName, unknown> {
  return Object.fromEntries(contentFiles.map((file) => [file, JSON.parse(readFileSync(join(contentDir, file), 'utf8'))])) as Record<ContentFileName, unknown>;
}

/**
 * The shipped content with an Encounter and a Synergy in the new form (v1.1.4-S1, S2), whose Queries
 * a `has-trait` may filter: `ambush-on-the-road` one Check scored by the strongest Warrior, and
 * `shield-wall` requiring three Warriors.
 */
function withQueries(): Record<ContentFileName, unknown> {
  const content = shipped();
  const encounters = content['encounters.json'] as Record<string, Record<string, unknown>>;
  const ambush = encounters['ambush-on-the-road'] as Record<string, unknown>;
  encounters['ambush-on-the-road'] = {
    name: ambush.name,
    kind: ambush.kind,
    checks: [{ key: 'front', name: 'The front', score: ['max', ['where', 'party', ['class', 'warrior']], ['stat', 'strength']], skills: [], difficultyFactor: 0.2 }],
    consequences: ambush.consequences,
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

  test("finds the shipped content's uses of a Trait, entry by entry", () => {
    const content = shipped();
    expect(usesOf(content, 'scarred').map((use) => use.at)).toEqual([
      'injuries.json: deep-cut.leavesTrait',
      ...sentences(content, 'heroBiography', 'scarred'),
      'portrait-appearances.json: features.scar.shows.0',
    ]);
    expect(usesOf(content, 'miser').map((use) => use.at)).toEqual([
      'guildmaster-traits.json: well-liked.excludes.0',
      'guildmaster-traits.json: spendthrift.excludes.1',
      ...sentences(content, 'biography', 'miser'),
      'descriptions.json: callings.merchant.suits.1',
    ]);
    expect(sentences(content, 'heroBiography', 'scarred').length).toBeGreaterThan(1);
    expect(new Set(usesOf(content, 'mistrusts-magic').map((use) => use.entry))).toEqual(new Set(['biography-sentences', 'portrait-callings']));
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

  // The verification of v1.1.4-S13's skill runs: a use `add` made without a path, or a list it made,
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

  // The verification of v1.1.4-S13: a sentence is a use of its own, a use is never added twice in one
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

  test('refuses an Encounter or a Synergy in the old form, saying so and what to do', () => {
    const content = shipped();
    expect(() => entry('encounter-has-trait').add?.apply(content, 'lame', { encounter: 'ambush-on-the-road', path: 'checks.0.score.1' })).toThrow(
      'encounters.json: ambush-on-the-road is an Encounter in the old form, with no Query to filter: ask the owner',
    );
    expect(() => entry('synergy-has-trait').add?.apply(content, 'lame', { synergy: 'shield-wall' })).toThrow('synergies.json: shield-wall is a Synergy in the old form');
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
    expect(() => entry('synergy-has-trait').add?.apply(shipped(), 'lame', { synergy: 'shield-wall' })).toThrow('old form');
    expect(() => entry('excludes').add?.apply(content, 'lame', { trait: 'miser' })).toThrow('not of the same list');
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
