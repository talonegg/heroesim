import { facilityEffectKinds, type ContentSet, type Facility } from '@heroesim/engine/content';
import { describe, expect, test } from 'vitest';
import { facilityDoes, facilityEffectWords, facilityIs, facilityName } from './facilities.js';

// A Facility in words (DL-297): its name, its verb and what it does read from content's row, so a
// Facility content adds is worded with no words of its own. A content built here, not the shipped.

const facility = (key: string, name: string, plural: boolean, effects: Facility['effects']): Facility => ({ key, name, plural, upkeep: 15, effects });

const content: Pick<ContentSet, 'facilities'> = {
  facilities: {
    infirmary: facility('infirmary', 'infirmary', false, { healFactor: 1 }),
    quarters: facility('quarters', 'quarters', true, { fatigueFall: 5, moraleBaseline: 0 }),
    chapel: facility('chapel', 'chapel', false, { moraleBaseline: 0, trainingXp: 0, healFactor: 1 }),
  },
};

describe('a Facility in words', () => {
  test('is named by its row, and a key content lacks as it is', () => {
    expect(facilityName(content, 'quarters')).toBe('quarters');
    expect(facilityName(content, 'stables')).toBe('stables');
  });

  test('takes "are" for a plural name and "is" otherwise', () => {
    expect([facilityIs(content, 'infirmary'), facilityIs(content, 'quarters'), facilityIs(content, 'stables')]).toEqual(['is', 'are', 'is']);
  });

  test("does each of its effects, in the kinds' order, its verbs agreeing with its name", () => {
    expect(facilityDoes(content, 'infirmary')).toBe('shortens the Days an Injury takes to heal');
    expect(facilityDoes(content, 'quarters')).toBe('raise the Morale the Roster settles toward and lower the Fatigue of every Hero at home each night');
    expect(facilityDoes(content, 'chapel')).toBe(
      'shortens the Days an Injury takes to heal, gives every Hero on the Roster who is home and unhurt XP each night and raises the Morale the Roster settles toward',
    );
    expect(facilityDoes(content, 'stables')).toBe('');
  });

  test('has words for every effect kind the engine has', () => {
    expect(Object.keys(facilityEffectWords)).toEqual([...facilityEffectKinds]);
  });
});
