import { chanceBand, chanceBandNames, defaultConfig, describeQuery, type NumQuery } from '@heroesim/engine';
import { describe, expect, test } from 'vitest';
import { content } from '../content';
import { chanceWords, encounterReadings, shownPercent, queryWords, readsAsOne } from './query-words';

// v1.1.4-S5 (DL-156): the page words every operator of a Query through the engine's account of it
// (`describeQuery`), and every chance band, as the CLI does (cli/src/query-words.test.ts).

/** Each operator of every Query type (content-types.ts), in a Check's score, and its words. */
const worded: [string, NumQuery, string][] = [
  ['a number', 12, '12'],
  ['sum', ['sum', 'party', ['stat', 'strength']], 'the total Strength of the Party'],
  ['avg, of a Class filter', ['avg', ['where', 'party', ['class', 'mage', 'healer']], ['stat', 'intelligence']], 'the average Intelligence of the Mages and Healers'],
  ['max', ['max', 'party', ['stat', 'wits']], 'the highest Wits in the Party'],
  // v1.1.4-S9's verification (DL-162): of a Set less than the Party, among it.
  ['max, of a Skill filter', ['max', ['where', 'party', ['has-skill', 'lockpicking']], ['stat', 'dexterity']], 'the highest Dexterity among the Heroes who have Lockpicking'],
  ['min, of a weighting', ['min', 'party', ['weighted', [['wits', 0.6], ['perception', 0.4]]]], 'the lowest (0.6 Wits + 0.4 Perception) in the Party'],
  ['count of the Party', ['count', 'party'], 'the size of the Party'],
  ['count, of a comparison', ['count', ['where', 'party', ['>=', ['stat', 'strength'], 12]]], 'the number of Heroes whose Strength is at least 12'],
  ['ranked', ['ranked', 'party', ['stat', 'strength'], [1, 0.5, 0.25]], 'the Strength of the Party, highest first, weighted 1, 0.5 and 0.25'],
  ['of best, of a Class', ['of', ['best', ['where', 'party', ['class', 'warrior']], ['stat', 'strength']], ['stat', 'strength']], 'Strength of the Warrior with the highest Strength'],
  ['of worst', ['of', ['worst', 'party', ['stat', 'dexterity']], ['stat', 'wits']], 'Wits of the Hero with the lowest Dexterity'],
  ['of best, of another Set', ['of', ['best', ['where', 'party', ['hurt']], ['level']], ['morale']], 'Morale of the one of the Heroes who are hurt with the highest Level'],
  [
    "the Nums' + and *, the old form",
    ['+', ['*', 0.5, ['sum', 'party', ['stat', 'strength']]], ['*', 0.5, ['max', 'party', ['stat', 'wits']]]],
    '0.5 × the total Strength of the Party + 0.5 × the highest Wits in the Party',
  ],
  ["the Nums' -", ['-', ['*', 2, ['count', 'party']], ['+', 1, 2]], '2 × the size of the Party − (1 + 2)'],
  ["the Nums' least", ['least', ['count', 'party'], 3], 'the least of the size of the Party and 3'],
  ["the Nums' greatest", ['greatest', ['max', 'party', ['age']], 20, 30], 'the greatest of the highest Age in the Party, 20 and 30'],
  ['the Vals skill, level and morale', ['+', ['sum', 'party', ['skill', 'stealth']], ['max', 'party', ['level']], ['min', 'party', ['morale']]], 'the total Stealth of the Party + the highest Level in the Party + the lowest Morale in the Party'],
  ["the Vals' +, - and *", ['sum', 'party', ['+', ['stat', 'strength'], ['-', ['skill', 'swordcraft'], 1], ['*', 2, ['level']]]], 'the total (Strength + (Swordcraft − 1) + (2 × Level)) of the Party'],
  ['a weighting of one', ['sum', 'party', ['weighted', [['strength', 1]]]], 'the total Strength of the Party'],
  ['top', ['sum', ['top', 'party', 2, ['stat', 'strength']], ['stat', 'wits']], 'the total Wits of the 2 Heroes with the highest Strength'],
  ['bottom, of a Class', ['sum', ['bottom', ['where', 'party', ['class', 'warrior']], 1, ['stat', 'strength']], ['stat', 'wits']], 'the total Wits of the 1 Hero of the Warriors with the lowest Strength'],
  ['background', ['count', ['where', 'party', ['background', 'farm-born', 'river-folk']]], 'the number of Heroes who are of the Farm-born or River folk Background'],
  ['sex', ['sum', ['where', 'party', ['sex', 'female']], ['stat', 'charisma']], 'the total Charisma of the Heroes who are Female'],
  ['has-skill', ['count', ['where', 'party', ['has-skill', 'stealth']]], 'the number of Heroes who have Stealth'],
  ['has-skill at a rating', ['count', ['where', 'party', ['has-skill', 'stealth', 3]]], 'the number of Heroes who have Stealth at 3 or more'],
  ['has-trait', ['count', ['where', 'party', ['has-trait', 'scarred']]], 'the number of Heroes who have the Scarred Trait'],
  ['>, < and =', ['count', ['where', 'party', ['and', ['>', ['level'], 2], ['<', ['age'], 40], ['=', ['morale'], 60]]]], 'the number of Heroes whose Level is above 2 and whose Age is below 40 and whose Morale is 60'],
  ['<= and or', ['count', ['where', 'party', ['or', ['<=', ['stat', 'wits'], 5], ['hurt']]]], 'the number of Heroes whose Wits is at most 5 or who are hurt'],
  ['not', ['count', ['where', 'party', ['not', ['hurt']]]], 'the number of Heroes who are not hurt'],
  ['not of and', ['count', ['where', 'party', ['not', ['and', ['hurt'], ['has-skill', 'stealth']]]]], 'the number of Heroes who are not hurt or who lack Stealth'],
  ['not of or, and a Class not at the Party', ['count', ['where', ['where', 'party', ['class', 'mage']], ['not', ['or', ['has-trait', 'lame'], ['class', 'rogue']]]]], 'the number of Mages who lack the Lame Trait and who are not Rogues'],
  [
    'an or within an and, bracketed',
    ['count', ['where', 'party', ['and', ['or', ['hurt'], ['has-skill', 'stealth']], ['>', ['level'], 2]]]],
    'the number of Heroes (who are hurt or who have Stealth) and whose Level is above 2',
  ],
  [
    'an and within an or, bracketed',
    ['count', ['where', 'party', ['or', ['and', ['hurt'], ['has-skill', 'stealth']], ['sex', 'female']]]],
    'the number of Heroes (who are hurt and who have Stealth) or who are Female',
  ],
  [
    'the negation of an and of an or, bracketed',
    ['count', ['where', 'party', ['not', ['and', ['or', ['hurt'], ['has-skill', 'stealth']], ['>', ['level'], 2]]]]],
    'the number of Heroes (who are not hurt and who lack Stealth) or whose Level is not above 2',
  ],
  [
    'an and of one part, and a not within an or, unbracketed',
    ['count', ['where', 'party', ['or', ['and', ['hurt']], ['not', ['hurt']]]]],
    'the number of Heroes who are hurt or who are not hurt',
  ],
  ['a key content lacks', ['sum', 'party', ['stat', 'luck']], 'the total luck of the Party'],
];

describe('queryWords', () => {
  test.each(worded)('words %s', (_, query, words) => {
    expect(queryWords(describeQuery(query), content)).toBe(words);
  });
});

describe('chanceWords', () => {
  test('words every chance band as DL-148 item 15 does', () => {
    expect(chanceBandNames.map((band) => chanceWords[band])).toEqual(['Hopeless', 'Unlikely', 'Even', 'Likely', 'Near certain']);
  });
});

// v1.1.4-S6: the detail's percentages, and each Encounter's Checks as the Board's card gives them, as the CLI does.
describe('the Board and the detail (v1.1.4-S6)', () => {
  // v1.1.4-S6's verification: floored to a multiple of 5, within 5 to 95 unless certain, so that the
  // number always falls in its word's band, every band starting at a multiple of 5.
  test('a chance is shown floored to a multiple of 5, between 5 and 95 unless it is 0 or 1, and agrees with its word', () => {
    const cases: [number, number, string][] = [
      [0, 0, 'Hopeless'],
      [0.03, 5, 'Hopeless'],
      [0.1, 10, 'Unlikely'],
      [0.349, 30, 'Unlikely'],
      [0.35, 35, 'Even'],
      [0.64, 60, 'Even'],
      [0.65, 65, 'Likely'],
      [0.899, 85, 'Likely'],
      [0.9, 90, 'Near certain'],
      [0.976, 95, 'Near certain'],
      [1, 100, 'Near certain'],
    ];
    for (const [chance, percent, word] of cases) {
      expect(shownPercent(chance), String(chance)).toBe(percent);
      expect(chanceWords[chanceBand(chance, defaultConfig)], String(chance)).toBe(word);
    }
    // Every chance's number lies in its word's band, by hundredths and at the edges a sum's rounding leaves.
    const starts = [0, 0.1, 0.35, 0.65, 0.9];
    for (let at = 0; at <= 10_000; at += 1) {
      for (const chance of [at / 10_000, 0.65 - 1e-15, 0.35 + 1e-15, 1 - 1e-15]) {
        const band = chanceBandNames.indexOf(chanceBand(chance, defaultConfig));
        const shown = shownPercent(chance) / 100;
        expect(shown >= (starts[band] ?? 0) && (band === 4 || shown < (starts[band + 1] ?? 1)), String(chance)).toBe(true);
      }
    }
  });

  test("each of a Quest's Encounters gives each Check's name and what it reads, in order; one content lacks reads nothing", () => {
    const [ambush, unknown] = encounterReadings({ encounterKeys: ['ambush-on-the-road', 'no-such-encounter'] }, content);

    expect(ambush).toEqual({
      encounterKey: 'ambush-on-the-road',
      name: 'Ambush on the road',
      kind: 'combat',
      checks: [{ key: 'ambush-on-the-road', name: 'Ambush on the road', reads: queryWords(describeQuery(content.encounters['ambush-on-the-road']?.checks[0]?.score ?? 0), content) }],
    });
    expect(ambush && readsAsOne(ambush)).toBe(true);
    expect(unknown).toEqual({ encounterKey: 'no-such-encounter', name: 'no-such-encounter', kind: null, checks: [] });
    expect(unknown && readsAsOne(unknown)).toBe(false);
  });
});
