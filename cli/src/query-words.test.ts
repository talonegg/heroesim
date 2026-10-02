import { loadContent } from '@heroesim/content/node';
import { chanceBandNames, describeQuery, type NumQuery } from '@heroesim/engine';
import { describe, expect, test } from 'vitest';
import { chanceWords, queryWords } from './query-words.js';

// v1.1.4-S5 (DL-156): the CLI words every operator of a Query through the engine's account of it
// (`describeQuery`), and every chance band. The page's words are the same (web/src/state/query-words.test.ts).

const content = loadContent();

/** Each operator of every Query type (content-types.ts), in a Check's score, and its words. */
const worded: [string, NumQuery, string][] = [
  ['a number', 12, '12'],
  ['sum', ['sum', 'party', ['stat', 'strength']], 'the total Strength of the Party'],
  ['avg, of a Class filter', ['avg', ['where', 'party', ['class', 'mage', 'healer']], ['stat', 'intelligence']], 'the average Intelligence of the Mages and Healers'],
  ['max', ['max', 'party', ['stat', 'wits']], 'the highest Wits in the Party'],
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
