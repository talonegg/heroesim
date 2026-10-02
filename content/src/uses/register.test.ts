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
      'descriptions.json: heroBiography.traits.scarred',
      'portrait-appearances.json: features.scar.shows.0',
    ]);
    expect(usesOf(content, 'miser').map((use) => use.at)).toEqual([
      'guildmaster-traits.json: well-liked.excludes.0',
      'guildmaster-traits.json: spendthrift.excludes.1',
      'descriptions.json: biography.traits.miser',
      'descriptions.json: callings.merchant.suits.1',
    ]);
    expect(usesOf(content, 'mistrusts-magic').map((use) => use.entry)).toEqual(['biography-sentences', 'portrait-callings', 'portrait-callings']);
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
    // A Biography's use is the key's list of sentences: one is added where the key has none.
    delete ((content['descriptions.json'] as { heroBiography: { traits: Record<string, unknown> } }).heroBiography.traits)['short-winded'];
    const before = usesOf(content, key).filter((use) => use.entry === id);
    const added = { ...content, ...entry(id).add?.apply(content, key, target) };

    expect(passes(added)).toBe(true);
    const found = usesOf(added, key).filter((use) => use.entry === id);
    expect(found.length).toBe(before.length + 1);
    const use = found.find((each) => !before.some((old) => old.at === each.at)) ?? found.at(-1);
    if (use === undefined) throw new Error('no use found');
    const removed = { ...added, ...entry(id).remove?.apply(added, use) };

    expect(passes(removed)).toBe(true);
    expect(usesOf(removed, key).filter((each) => each.entry === id)).toEqual(before);
    // The excludes come back as they were, both ways; every other entry's file exactly so.
    expect(removed).toEqual(content);
  });

  test("a Synergy's condition on the Party added where no path is given", () => {
    const content = withQueries();
    const changed = entry('synergy-has-trait').add?.apply(content, 'lame', { synergy: 'shield-wall' });
    const synergy = (changed?.['synergies.json'] as Record<string, { requires: unknown[] }>)['shield-wall'];
    expect(synergy?.requires.at(-1)).toEqual(['>=', ['count', ['where', 'party', ['has-trait', 'lame']]], 1]);
    expect(passes({ ...content, ...changed })).toBe(true);
    expect(usesOf({ ...content, ...changed }, 'lame').map((use) => use.at)).toContain('synergies.json: shield-wall.requires.1.1.1.2');
  });

  test("a Triumph's list is copied from the Success's before a positive Trait is added to it", () => {
    const content = withQueries();
    const changed = entry('encounter-trait').add?.apply(content, 'scarred', { encounter: 'ambush-on-the-road', degree: 'triumph', chance: 0.05 });
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
