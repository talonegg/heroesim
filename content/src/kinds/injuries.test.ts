import { type InjuryType } from '@heroesim/engine/content';
import { describe, expect, test } from 'vitest';
import { parse, withJson, withText, refusalOf, type Files } from './content.test-support.js';

// The Injury types' refusals (DL-243). Each is triggered by content built in memory from the shipped files with one
// thing broken, read and checked as `parseContent` does, and names the offending key, so an author
// can find it.

describe('an Injury type (M2-S5)', () => {
  const deepCut = (json: Files['injuries.json']) => json['deep-cut'] as Omit<InjuryType, 'key'>;

  test.each<[string, (it: Omit<InjuryType, 'key'>) => void, RegExp]>([
    ['leaving a Trait that does not exist', (it) => (it.leavesTrait = 'cursed'), /injuries\.deep-cut\.leavesTrait: "cursed" is not a Hero Trait/],
    ['leaving a Guildmaster Trait', (it) => (it.leavesTrait = 'miser'), /injuries\.deep-cut\.leavesTrait: "miser" is not a Hero Trait/],
    ['healing in no Days', (it) => (it.healDaysMin = 0), /injuries\.deep-cut\.healDaysMin is 0/],
    ['a heal range upside down', (it) => (it.healDaysMax = 3), /injuries\.deep-cut\.healDaysMin 6 is greater than healDaysMax 3/],
  ])('%s is refused, naming the type', (_, change, problem) => {
    const files = withJson('injuries.json', (json) => change(deepCut(json)));

    expect(refusalOf(() => parse(files)).message).toMatch(problem);
  });

  test('whose leavesTrait is missing, or neither a key nor null, is refused', () => {
    const missing = withJson('injuries.json', (json) => {
      Reflect.deleteProperty(deepCut(json), 'leavesTrait');
    });
    const wrong = withJson('injuries.json', (json) => {
      Object.assign(deepCut(json), { leavesTrait: 3 });
    });

    expect(refusalOf(() => parse(missing)).message).toMatch(/injuries\.json: deep-cut\.leavesTrait is missing/);
    expect(refusalOf(() => parse(wrong)).message).toMatch(/injuries\.json: deep-cut\.leavesTrait is 3/);
  });

  test('is required: a set with none is refused', () => {
    expect(refusalOf(() => parse(withText('injuries.json', '{}'))).message).toContain('injuries is empty');
  });
});
