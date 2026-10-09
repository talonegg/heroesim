import type { ContentSet, Encounter } from '@heroesim/engine/content';
import { describe, expect, test } from 'vitest';
import { ContentError, validateContent } from './index.js';
import { loadContent } from './node.js';

// v1.1.6-S10 (DL-196): every refusal content gives for a Query, word for word. Written against the
// checker as it stood in `validate.ts` before the engine took it over (`queryProblems`), and passing
// there, so that the words an author reads are the same after: each type at a node of another, each
// operator's number of arguments, each key, number and list an argument names, Sex outside a filter,
// counted or in a Synergy's requirement, the size, and a Check's score that turns a Stat a Hero adds
// against itself. Each Query stands in the one place given (a Check's score, a raw Check's, a
// Synergy's requirement, an Injury's, a Death's or an earned Trait's `among`) of content otherwise as
// shipped, and the refusals are all there are, in order, each after the path of its place.

/** Where a Query stands in the content: the place it is checked as. */
type Place = 'score' | 'raw' | 'requirement' | 'among' | 'death' | 'earned';

/** The path each place's Query is named by. */
const paths: Readonly<Record<Place, string>> = {
  score: 'encounters.ambush-on-the-road.checks.0.score',
  raw: 'encounters.ambush-on-the-road.checks.0.score',
  requirement: 'synergies.sword-and-salve.requires.0',
  among: 'encounters.ambush-on-the-road.consequences.failure.0.among',
  death: 'encounters.ambush-on-the-road.consequences.failure.0.among',
  earned: 'encounters.ambush-on-the-road.consequences.triumph.0.among',
};

const shipped = loadContent();

/** The content as shipped with `query` at `place`, built in memory as a test or a tool may. */
function withQuery(place: Place, query: unknown): ContentSet {
  const content = structuredClone(shipped);
  const ambush = content.encounters['ambush-on-the-road'] as Encounter;
  const [steel] = ambush.checks as [Encounter['checks'][number]];
  switch (place) {
    case 'score':
      Object.assign(steel, { score: query });
      break;
    case 'raw':
      Object.assign(steel, { score: query, skills: [], raw: true });
      break;
    case 'requirement':
      Object.assign(content.synergies['sword-and-salve'] ?? {}, { requires: [query] });
      break;
    case 'among':
      Object.assign(ambush.consequences, { failure: [{ kind: 'injury', typeKey: 'deep-cut', chance: 0.2, count: 1, among: query }] });
      break;
    case 'death':
      Object.assign(ambush.consequences, { failure: [{ kind: 'death', chance: 0.1, among: query }] });
      break;
    case 'earned':
      Object.assign(ambush.consequences, { triumph: [{ kind: 'trait', traitKey: 'battle-tried', chance: 0.5, among: query }] });
      break;
  }
  return content;
}

/** Every problem `validateContent` finds in `content`, in order; none when it is accepted. */
function problemsOf(content: ContentSet): readonly string[] {
  try {
    validateContent(content);
    return [];
  } catch (error) {
    if (error instanceof ContentError) return error.problems;
    throw error;
  }
}

describe('a Query, held in memory', () => {
  test('the content as shipped is accepted', () => {
    expect(problemsOf(structuredClone(shipped))).toEqual([]);
  });

  // Each case: what it is, where it stands, the Query, and each refusal after its place's path.
  test.each<[string, Place, unknown, readonly string[]]>([
    // A leaf of the wrong type, or a node that is no list with its operator first.
    ['a number where a condition stands', 'requirement', 3, [
      ' is 3; a number stands for a Val or a Num, not a condition on the Party',
    ]],
    ['"party" where a condition stands', 'requirement', 'party', [
      ' is "party", a Set; a condition on the Party stands here',
    ]],
    ['a word where a condition stands', 'requirement', 'three Warriors', [
      ' is "three Warriors"; expected a condition on the Party, a list with its operator first',
    ]],
    ['an empty list where a condition stands', 'requirement', [], [
      ' is []; expected a condition on the Party, a list with its operator first',
    ]],
    ['a list of numbers where a condition stands', 'requirement', [1, 2], [
      ' is [1,2]; expected a condition on the Party, a list with its operator first',
    ]],
    ['an object where a condition stands', 'requirement', { classes: { warrior: 1 } }, [
      ' is {"classes":{"warrior":1}}; expected a condition on the Party, a list with its operator first',
    ]],
    ['null where a condition stands', 'requirement', null, [
      ' is null; expected a condition on the Party, a list with its operator first',
    ]],
    ['a number where a Set stands', 'score', ['count', 3], [
      '.1 is 3; a number stands for a Val or a Num, not a Set',
    ]],
    ['a number where a Hero stands', 'score', ['of', 3, ['level']], [
      '.1 is 3; a number stands for a Val or a Num, not a Hero',
    ]],
    ['a number where a Pred stands', 'score', ['count', ['where', 'party', 1]], [
      '.1.2 is 1; a number stands for a Val or a Num, not a Pred',
    ]],
    ['a number where an among stands', 'among', 2, [
      ' is 2; a number stands for a Val or a Num, not a Set',
    ]],
    ['Infinity as a Num', 'requirement', ['>=', 1, Infinity], [
      '.2 is Infinity; a number in a Query is finite',
    ]],
    ['NaN as a Val', 'requirement', ['>=', ['max', 'party', NaN], 1], [
      '.1.2 is NaN; a number in a Query is finite',
    ]],
    ['-Infinity as a Num in a score', 'score', ['+', ['count', 'party'], -Infinity], [
      '.2 is -Infinity; a number in a Query is finite',
    ]],
    ['"party" where a Hero stands', 'score', ['of', 'party', ['level']], [
      '.1 is "party", a Set; a Hero stands here',
    ]],
    ['"party" where a Val stands', 'score', ['sum', 'party', 'party'], [
      '.2 is "party", a Set; a Val stands here',
    ]],
    ['"party" where a Pred stands', 'score', ['count', ['where', 'party', 'party']], [
      '.1.2 is "party", a Set; a Pred stands here',
    ]],
    ['"party" where a Num stands', 'score', ['+', 'party'], [
      '.1 is "party", a Set; a Num stands here',
    ]],
    ['"party" as a score', 'score', 'party', [
      ' is "party", a Set; a Num stands here',
    ]],
    ['a word where a Set stands', 'score', ['count', 'everyone'], [
      '.1 is "everyone"; expected a Set, a list with its operator first',
    ]],
    ['an object where a Hero stands', 'score', ['of', {}, ['level']], [
      '.1 is {}; expected a Hero, a list with its operator first',
    ]],
    ['an empty list where a Val stands', 'score', ['sum', 'party', []], [
      '.2 is []; expected a Val, a list with its operator first',
    ]],
    ['a list as an operator where a Pred stands', 'score', ['count', ['where', 'party', [['hurt']]]], [
      '.1.2 is [["hurt"]]; expected a Pred, a list with its operator first',
    ]],
    ['true where a Num stands', 'score', ['+', true], [
      '.1 is true; expected a Num, a list with its operator first',
    ]],
    ['a word as an among', 'among', 'the weakest', [
      ' is "the weakest"; expected a Set, a list with its operator first',
    ]],
    // An operator of another type, or of none.
    ['a Num as a condition', 'requirement', ['count', 'party'], [
      ': "count" makes a Num, where a condition on the Party is expected',
    ]],
    ['a Val as a condition', 'requirement', ['stat', 'strength'], [
      ': "stat" makes a Val, where a condition on the Party is expected',
    ]],
    ['a Val where a Num stands', 'requirement', ['>=', ['stat', 'strength'], 1], [
      '.1: "stat" makes a Val, where a Num is expected',
    ]],
    ['a Pred where a Num stands', 'requirement', ['>=', ['class', 'warrior'], 1], [
      '.1: "class" makes a Pred, where a Num is expected',
    ]],
    ['a Set where a Num stands', 'requirement', ['>=', 'party', 1], [
      '.1 is "party", a Set; a Num stands here',
    ]],
    ['a Set operator where a Num stands', 'requirement', ['>=', ['where', 'party', ['hurt']], 1], [
      '.1: "where" makes a Set, where a Num is expected',
    ]],
    ['a Hero where a Num stands', 'requirement', ['>=', ['best', 'party', ['level']], 1], [
      '.1: "best" makes a Hero, where a Num is expected',
    ]],
    ['a comparison where a Num stands', 'requirement', ['>=', ['>=', 1, 1], 1], [
      '.1: ">=" makes a Pred or a condition on the Party, where a Num is expected',
    ]],
    ['an operator no type has', 'requirement', ['>=', ['median', 'party', ['level']], 1], [
      '.1: "median" is not an operator of a Query',
    ]],
    ['a key of Object\'s prototype as an operator', 'requirement', ['>=', ['constructor'], ['toString', 1]], [
      '.1: "constructor" is not an operator of a Query',
      '.2: "toString" is not an operator of a Query',
    ]],
    ['__proto__ as an operator', 'score', ['__proto__', 'party'], [
      ': "__proto__" is not an operator of a Query',
    ]],
    ['a Num where a Set stands', 'score', ['count', ['count', 'party']], [
      '.1: "count" makes a Num, where a Set is expected',
    ]],
    ['a Val where a Set stands', 'score', ['count', ['level']], [
      '.1: "level" makes a Val, where a Set is expected',
    ]],
    ['a Hero where a Set stands', 'score', ['count', ['best', 'party', ['level']]], [
      '.1: "best" makes a Hero, where a Set is expected',
    ]],
    ['an arithmetic operator where a Set stands', 'score', ['count', ['+', 1]], [
      '.1: "+" makes a Val or a Num, where a Set is expected',
    ]],
    ['a Set where a Hero stands', 'score', ['of', ['where', 'party', ['hurt']], ['level']], [
      '.1: "where" makes a Set, where a Hero is expected',
    ]],
    ['a Num where a Val stands', 'score', ['sum', 'party', ['count', 'party']], [
      '.2: "count" makes a Num, where a Val is expected',
    ]],
    ['least where a Val stands', 'score', ['sum', 'party', ['least', 1, 2]], [
      '.2: "least" makes a Num, where a Val is expected',
    ]],
    ['a Pred where a Val stands', 'score', ['sum', 'party', ['hurt']], [
      '.2: "hurt" makes a Pred, where a Val is expected',
    ]],
    ['a Val where a Pred stands', 'score', ['count', ['where', 'party', ['level']]], [
      '.1.2: "level" makes a Val, where a Pred is expected',
    ]],
    ['a Num where a Pred stands', 'score', ['count', ['where', 'party', ['least', 1]]], [
      '.1.2: "least" makes a Num, where a Pred is expected',
    ]],
    ['a Num as an among', 'among', ['count', 'party'], [
      ': "count" makes a Num, where a Set is expected',
    ]],
    ['a Pred as an among', 'death', ['class', 'warrior'], [
      ': "class" makes a Pred, where a Set is expected',
    ]],
    ['a condition as an earned Trait among', 'earned', ['>=', 1, 1], [
      ': ">=" makes a Pred or a condition on the Party, where a Set is expected',
    ]],
    // Sex outside a filter.
    ['sex as a Num', 'requirement', ['>=', ['sex', 'female'], 1], [
      '.1: ["sex", …] stands only as the Pred of a where filter: Sex decides who takes part, never a value (DL-148 item 6)',
    ]],
    ['sex as a condition', 'requirement', ['sex', 'male'], [
      ': ["sex", …] stands only as the Pred of a where filter: Sex decides who takes part, never a value (DL-148 item 6)',
    ]],
    ['sex as a Val', 'score', ['max', 'party', ['sex', 'female']], [
      '.2: ["sex", …] stands only as the Pred of a where filter: Sex decides who takes part, never a value (DL-148 item 6)',
    ]],
    ['sex where a Set stands', 'score', ['count', ['sex', 'male']], [
      '.1: ["sex", …] stands only as the Pred of a where filter: Sex decides who takes part, never a value (DL-148 item 6)',
    ]],
    ['sex where a Hero stands', 'score', ['of', ['sex', 'male'], ['level']], [
      '.1: ["sex", …] stands only as the Pred of a where filter: Sex decides who takes part, never a value (DL-148 item 6)',
    ]],
    ['sex compared, within a filter', 'score', ['count', ['where', 'party', ['>=', ['sex', 'male'], 1]]], [
      '.1.2.1: ["sex", …] stands only as the Pred of a where filter: Sex decides who takes part, never a value (DL-148 item 6)',
    ]],
    ['sex as an among', 'among', ['sex', 'female'], [
      ': ["sex", …] stands only as the Pred of a where filter: Sex decides who takes part, never a value (DL-148 item 6)',
    ]],
    // The number of arguments.
    ['level with an argument', 'score', ['max', 'party', ['level', 'warrior']], [
      '.2: "level" takes no arguments; it has 1',
    ]],
    ['hurt with an argument', 'score', ['count', ['where', 'party', ['hurt', 1]]], [
      '.1.2: "hurt" takes no arguments; it has 1',
    ]],
    ['count of nothing', 'requirement', ['>=', ['count'], 1], [
      '.1: "count" takes 1 argument; it has 0',
    ]],
    ['count of two Sets, one no Set', 'score', ['count', 'party', 'bogus'], [
      ': "count" takes 1 argument; it has 2',
    ]],
    ['stat of nothing', 'score', ['max', 'party', ['stat']], [
      '.2: "stat" takes 1 argument; it has 0',
    ]],
    ['not of nothing', 'score', ['count', ['where', 'party', ['not']]], [
      '.1.2: "not" takes 1 argument; it has 0',
    ]],
    ['sex of nothing', 'score', ['count', ['where', 'party', ['sex']]], [
      '.1.2: "sex" takes 1 argument; it has 0',
    ]],
    ['has-trait of two', 'score', ['count', ['where', 'party', ['has-trait', 'scarred', 'lame']]], [
      '.1.2: "has-trait" takes 1 argument; it has 2',
    ]],
    ['weighted of nothing', 'score', ['max', 'party', ['weighted']], [
      '.2: "weighted" takes 1 argument; it has 0',
    ]],
    ['a condition of one Num', 'requirement', ['>=', ['count', 'party']], [
      ': ">=" takes 2 arguments; it has 1',
    ]],
    ['a condition of three Nums', 'requirement', ['=', 1, 2, 3], [
      ': "=" takes 2 arguments; it has 3',
    ]],
    ['where without its Pred', 'score', ['count', ['where', 'party']], [
      '.1: "where" takes 2 arguments; it has 1',
    ]],
    ['a Val difference of one', 'score', ['sum', 'party', ['-', ['level']]], [
      '.2: "-" takes 2 arguments; it has 1',
    ]],
    ['a Num difference of one', 'score', ['-', ['count', 'party']], [
      ': "-" takes 2 arguments; it has 1',
    ]],
    ['best without its Val', 'score', ['of', ['best', 'party'], ['level']], [
      '.1: "best" takes 2 arguments; it has 1',
    ]],
    ['sum without its Val', 'score', ['sum', 'party'], [
      ': "sum" takes 2 arguments; it has 1',
    ]],
    ['of without its Val', 'score', ['of', ['best', 'party', ['level']]], [
      ': "of" takes 2 arguments; it has 1',
    ]],
    ['top without its Val', 'requirement', ['>=', ['count', ['top', 'party', 2]], 1], [
      '.1.1: "top" takes 3 arguments; it has 2',
    ]],
    ['ranked without its weights', 'score', ['ranked', 'party', ['level']], [
      ': "ranked" takes 3 arguments; it has 2',
    ]],
    ['class naming none', 'score', ['count', ['where', 'party', ['class']]], [
      '.1.2: "class" takes 1 argument or more; it has 0',
    ]],
    ['background naming none', 'score', ['count', ['where', 'party', ['background']]], [
      '.1.2: "background" takes 1 argument or more; it has 0',
    ]],
    ['and of nothing', 'score', ['count', ['where', 'party', ['and']]], [
      '.1.2: "and" takes 1 argument or more; it has 0',
    ]],
    ['or of nothing', 'score', ['count', ['where', 'party', ['or']]], [
      '.1.2: "or" takes 1 argument or more; it has 0',
    ]],
    ['a Val sum of nothing', 'score', ['sum', 'party', ['+']], [
      '.2: "+" takes 1 argument or more; it has 0',
    ]],
    ['a Num sum of nothing', 'requirement', ['>=', ['+'], 1], [
      '.1: "+" takes 1 argument or more; it has 0',
    ]],
    ['a product of nothing', 'score', ['*'], [
      ': "*" takes 1 argument or more; it has 0',
    ]],
    ['least of nothing', 'score', ['least'], [
      ': "least" takes 1 argument or more; it has 0',
    ]],
    ['greatest of nothing', 'score', ['greatest'], [
      ': "greatest" takes 1 argument or more; it has 0',
    ]],
    ['has-skill with two ratings', 'score', ['count', ['where', 'party', ['has-skill', 'tactics', 1, 2]]], [
      '.1.2: "has-skill" takes 1 or 2 arguments; it has 3',
    ]],
    ['has-skill of nothing', 'score', ['count', ['where', 'party', ['has-skill']]], [
      '.1.2: "has-skill" takes 1 or 2 arguments; it has 0',
    ]],
    // A key content does not define.
    ['a Stat that does not exist', 'requirement', ['>=', ['max', 'party', ['stat', 'strenght']], 1], [
      '.1.2.1: "strenght" is not a Hero Stat',
    ]],
    ['a Guildmaster Stat', 'score', ['max', 'party', ['stat', 'judgement']], [
      '.2.1: "judgement" is not a Hero Stat',
    ]],
    ['a Stat that is a number', 'score', ['max', 'party', ['stat', 3]], [
      '.2.1: 3 is not a Hero Stat',
    ]],
    ['a Skill that does not exist', 'score', ['max', 'party', ['skill', 'axemanship']], [
      '.2.1: "axemanship" is not a Skill',
    ]],
    ['has-skill of a Skill that does not exist', 'score', ['count', ['where', 'party', ['has-skill', 'axemanship', 2]]], [
      '.1.2.1: "axemanship" is not a Skill',
    ]],
    ['a Class that does not exist, among others', 'score', ['count', ['where', 'party', ['class', 'warrior', 'paladin', 'mage', 'bard']]], [
      '.1.2.2: "paladin" is not a Class',
      '.1.2.4: "bard" is not a Class',
    ]],
    ['a Guild Background', 'score', ['count', ['where', 'party', ['background', 'old-charter']]], [
      '.1.2.1: "old-charter" is not a Hero Background',
    ]],
    ['a Background that does not exist', 'among', ['where', 'party', ['background', 'farm-born', 'sea-born']], [
      '.2.2: "sea-born" is not a Hero Background',
    ]],
    ['a Guildmaster Trait', 'score', ['count', ['where', 'party', ['has-trait', 'thrifty']]], [
      '.1.2.1: "thrifty" is not a Hero Trait',
    ]],
    ['a Hero Trait that does not exist', 'earned', ['where', 'party', ['not', ['has-trait', 'cursed']]], [
      '.2.1.1: "cursed" is not a Hero Trait',
    ]],
    ['a sex that is not one', 'score', ['count', ['where', 'party', ['sex', 'other']]], [
      '.1.2.1: "other" is not a sex: female or male',
      ': a Set filtered by Sex is counted; Sex decides who takes part, never a number (DL-148 item 6)',
    ]],
    ['a sex that is a number', 'among', ['where', 'party', ['sex', 1]], [
      '.2.1: 1 is not a sex: female or male',
    ]],
    ['a Hero Trait', 'score', ['count', ['where', 'party', ['has-trait', 'battle-tried']]], []],
    // top, bottom, has-skill and ranked's numbers, and weighted's pairs.
    ['top of 0', 'score', ['count', ['top', 'party', 0, ['level']]], [
      '.1.2 is 0; top\'s n is a whole number from 1',
    ]],
    ['bottom of 1.5', 'score', ['count', ['bottom', 'party', 1.5, ['level']]], [
      '.1.2 is 1.5; bottom\'s n is a whole number from 1',
    ]],
    ['top of a word', 'score', ['count', ['top', 'party', 'two', ['level']]], [
      '.1.2 is "two"; top\'s n is a whole number from 1',
    ]],
    ['bottom of -1', 'among', ['bottom', 'party', -1, ['level']], [
      '.2 is -1; bottom\'s n is a whole number from 1',
    ]],
    ['top of Infinity', 'among', ['top', 'party', Infinity, ['level']], [
      '.2 is null; top\'s n is a whole number from 1',
    ]],
    ['top of NaN', 'among', ['top', 'party', NaN, ['level']], [
      '.2 is null; top\'s n is a whole number from 1',
    ]],
    ['has-skill at 0', 'score', ['count', ['where', 'party', ['has-skill', 'tactics', 0]]], [
      '.1.2.2 is 0; has-skill\'s least rating is a whole number from 1',
    ]],
    ['has-skill at 1.5', 'score', ['count', ['where', 'party', ['has-skill', 'tactics', 1.5]]], [
      '.1.2.2 is 1.5; has-skill\'s least rating is a whole number from 1',
    ]],
    ['has-skill at a word', 'score', ['count', ['where', 'party', ['has-skill', 'tactics', '2']]], [
      '.1.2.2 is "2"; has-skill\'s least rating is a whole number from 1',
    ]],
    ['ranked with a negative weight', 'requirement', ['>=', ['ranked', 'party', ['level'], [1, -1]], 1], [
      '.1.3.1 is -1; a weight is a finite number of 0 or more',
    ]],
    ['ranked with no weights', 'requirement', ['>=', ['ranked', 'party', ['level'], []], 1], [
      '.1.3 is []; ranked\'s weights are a list of one or more',
    ]],
    ['ranked with weights that are a number', 'requirement', ['>=', ['ranked', 'party', ['level'], 5], 1], [
      '.1.3 is 5; ranked\'s weights are a list of one or more',
    ]],
    ['ranked with weights that are an object', 'requirement', ['>=', ['ranked', 'party', ['level'], {}], 1], [
      '.1.3 is {}; ranked\'s weights are a list of one or more',
    ]],
    ['ranked with weights not finite, a word and null', 'requirement', ['>=', ['ranked', 'party', ['level'], [Infinity, NaN, '1', null, 0.5]], 1], [
      '.1.3.0 is Infinity; a weight is a finite number of 0 or more',
      '.1.3.1 is NaN; a weight is a finite number of 0 or more',
      '.1.3.2 is 1; a weight is a finite number of 0 or more',
      '.1.3.3 is null; a weight is a finite number of 0 or more',
    ]],
    ['ranked with a weight of 0', 'score', ['ranked', 'party', ['stat', 'wits'], [1, 0]], []],
    ['weighted of a word', 'requirement', ['>=', ['max', 'party', ['weighted', 'strength']], 1], [
      '.1.2.1 is "strength"; weighted\'s Stats are a list of one or more [Stat, weight] pairs',
    ]],
    ['weighted of no pairs', 'requirement', ['>=', ['max', 'party', ['weighted', []]], 1], [
      '.1.2.1 is []; weighted\'s Stats are a list of one or more [Stat, weight] pairs',
    ]],
    ['weighted of bad pairs', 'requirement', ['>=', ['max', 'party', ['weighted', ['strength', ['strength'], ['strength', 1, 2], ['strength', '1'], ['strength', Infinity], ['luck', 1], [3, 1], ['judgement', 1], ['wits', 1]]]], 1], [
      '.1.2.1.0 is "strength"; expected a [Stat, weight] pair, the weight a finite number',
      '.1.2.1.1 is ["strength"]; expected a [Stat, weight] pair, the weight a finite number',
      '.1.2.1.2 is ["strength",1,2]; expected a [Stat, weight] pair, the weight a finite number',
      '.1.2.1.3 is ["strength","1"]; expected a [Stat, weight] pair, the weight a finite number',
      '.1.2.1.4 is ["strength",null]; expected a [Stat, weight] pair, the weight a finite number',
      '.1.2.1.5.0: "luck" is not a Hero Stat',
      '.1.2.1.6.0: 3 is not a Hero Stat',
      '.1.2.1.7.0: "judgement" is not a Hero Stat',
    ]],
    // Sex: in a filter only, never counted (DL-148 item 6); in no Synergy's requirement.
    ['a Set filtered by Sex, counted', 'score', ['count', ['where', 'party', ['sex', 'female']]], [
      ': a Set filtered by Sex is counted; Sex decides who takes part, never a number (DL-148 item 6)',
    ]],
    ['a Set filtered by Sex within another, counted', 'score', ['count', ['top', ['where', 'party', ['and', ['class', 'mage'], ['not', ['sex', 'male']]]], 2, ['level']]], [
      ': a Set filtered by Sex is counted; Sex decides who takes part, never a number (DL-148 item 6)',
    ]],
    ['a Set filtered by Sex, summed as ones', 'score', ['sum', ['where', 'party', ['sex', 'male']], 1], [
      ': a Set filtered by Sex is counted; Sex decides who takes part, never a number (DL-148 item 6)',
    ]],
    ['a Set filtered by Sex, its mean of a number', 'score', ['avg', ['where', 'party', ['sex', 'male']], 2], [
      ': a Set filtered by Sex is counted; Sex decides who takes part, never a number (DL-148 item 6)',
    ]],
    ['a Set filtered by Sex, its most of a number', 'score', ['max', ['where', 'party', ['or', ['sex', 'male'], ['hurt']]], 2], [
      ': a Set filtered by Sex is counted; Sex decides who takes part, never a number (DL-148 item 6)',
    ]],
    ['a Set filtered by Sex, its least of a number', 'score', ['min', ['where', 'party', ['sex', 'male']], 2], [
      ': a Set filtered by Sex is counted; Sex decides who takes part, never a number (DL-148 item 6)',
    ]],
    ['a Set filtered by Sex, ranked by a number', 'score', ['ranked', ['where', 'party', ['sex', 'male']], 3, [1, 0.5]], [
      ': a Set filtered by Sex is counted; Sex decides who takes part, never a number (DL-148 item 6)',
    ]],
    ['a Set filtered by Sex, by a constant disguised with × 0', 'score', ['sum', ['where', 'party', ['sex', 'female']], ['+', 1, ['*', 0, ['level']]]], [
      ': a Set filtered by Sex is counted; Sex decides who takes part, never a number (DL-148 item 6)',
    ]],
    ['a Set filtered by Sex, by a weighted of no weight', 'score', ['sum', ['where', 'party', ['sex', 'female']], ['weighted', [['strength', 0], ['wits', 0]]]], [
      ': a Set filtered by Sex is counted; Sex decides who takes part, never a number (DL-148 item 6)',
    ]],
    ['a Set filtered by Sex, by a × 0 in a difference', 'score', ['avg', ['where', 'party', ['sex', 'male']], ['-', 2, ['*', ['level'], 0]]], [
      ': a Set filtered by Sex is counted; Sex decides who takes part, never a number (DL-148 item 6)',
    ]],
    ['a Set filtered by Sex, by a weighted of no pairs', 'score', ['sum', ['where', 'party', ['sex', 'female']], ['weighted', 'strength']], [
      '.2.1 is "strength"; weighted\'s Stats are a list of one or more [Stat, weight] pairs',
      ': a Set filtered by Sex is counted; Sex decides who takes part, never a number (DL-148 item 6)',
    ]],
    ['a Set filtered by Sex, by a Val that is no Val', 'score', ['sum', ['where', 'party', ['sex', 'female']], 'bogus'], [
      '.2 is "bogus"; expected a Val, a list with its operator first',
      ': a Set filtered by Sex is counted; Sex decides who takes part, never a number (DL-148 item 6)',
    ]],
    ['the Hero of a Set filtered by Sex, read as a number', 'score', ['of', ['best', ['where', 'party', ['sex', 'male']], ['level']], 1], [
      ': a Set filtered by Sex is counted; Sex decides who takes part, never a number (DL-148 item 6)',
    ]],
    ['the Hero of a Set filtered by Sex, read times 0', 'score', ['of', ['worst', ['where', 'party', ['sex', 'male']], ['level']], ['*', 0, ['stat', 'wits']]], [
      ': a Set filtered by Sex is counted; Sex decides who takes part, never a number (DL-148 item 6)',
    ]],
    ['a Set filtered by Sex, counted, within a sum of Nums', 'score', ['+', 1, ['count', ['where', 'party', ['sex', 'female']]]], [
      '.2: a Set filtered by Sex is counted; Sex decides who takes part, never a number (DL-148 item 6)',
    ]],
    ['an among filtered by a comparison of a Val', 'among', ['where', 'party', ['>=', ['level'], 1]], []],
    ['Sex in a requirement, counted', 'requirement', ['>=', ['count', ['where', 'party', ['sex', 'female']]], 1], [
      '.1.1.2: ["sex", …] stands in no Synergy\'s requirement: a requirement is a condition on the Party, and Sex decides only who takes part in a Check (DL-148 item 6)',
      '.1: a Set filtered by Sex is counted; Sex decides who takes part, never a number (DL-148 item 6)',
    ]],
    ['Sex in a requirement, in a sum of a Stat', 'requirement', ['>=', ['sum', ['where', 'party', ['sex', 'female']], ['stat', 'strength']], 10], [
      '.1.1.2: ["sex", …] stands in no Synergy\'s requirement: a requirement is a condition on the Party, and Sex decides only who takes part in a Check (DL-148 item 6)',
    ]],
    ['Sex in a requirement, the max of a Level', 'requirement', ['>', ['max', ['where', 'party', ['sex', 'female']], ['level']], 0], [
      '.1.1.2: ["sex", …] stands in no Synergy\'s requirement: a requirement is a condition on the Party, and Sex decides only who takes part in a Check (DL-148 item 6)',
    ]],
    ['Sex in a requirement, the best Hero\'s Level', 'requirement', ['>', ['of', ['best', ['where', 'party', ['sex', 'female']], ['level']], ['level']], 0], [
      '.1.1.1.2: ["sex", …] stands in no Synergy\'s requirement: a requirement is a condition on the Party, and Sex decides only who takes part in a Check (DL-148 item 6)',
    ]],
    ['Sex in a requirement, of no sex', 'requirement', ['>=', ['sum', ['where', 'party', ['sex', 'other']], ['level']], 1], [
      '.1.1.2.1: "other" is not a sex: female or male',
      '.1.1.2: ["sex", …] stands in no Synergy\'s requirement: a requirement is a condition on the Party, and Sex decides only who takes part in a Check (DL-148 item 6)',
    ]],
    ['a Set filtered by Sex, by a Skill', 'score', ['sum', ['where', 'party', ['sex', 'female']], ['skill', 'tactics']], []],
    ['a Set filtered by Sex, by Morale', 'score', ['avg', ['where', 'party', ['sex', 'female']], ['morale']], []],
    ['a Set filtered by Sex, by age', 'score', ['max', ['where', 'party', ['sex', 'female']], ['age']], []],
    ['a Set filtered by Sex, by a Level plus one', 'score', ['sum', ['where', 'party', ['sex', 'female']], ['+', 1, ['level']]], []],
    ['a Set filtered by Sex, by a Level less one', 'score', ['avg', ['where', 'party', ['sex', 'male']], ['-', ['level'], 1]], []],
    ['a Set filtered by Sex, by a product of numbers', 'score', ['sum', ['where', 'party', ['sex', 'female']], ['*', 2, 3]], [
      ': a Set filtered by Sex is counted; Sex decides who takes part, never a number (DL-148 item 6)',
    ]],
    ['a Set filtered by Sex, a Stat summed, plus one', 'score', ['+', ['sum', ['where', 'party', ['sex', 'female']], ['stat', 'strength']], 1], []],
    ['a Set filtered by Sex, counted, plus one', 'score', ['+', ['count', ['where', 'party', ['sex', 'female']]], 1], [
      '.1: a Set filtered by Sex is counted; Sex decides who takes part, never a number (DL-148 item 6)',
    ]],
    // Size.
    ['more than 64 nodes', 'requirement', ['>=', ['+', ...Array.from({ length: 62 }, () => 1)], 1], [
      ' has 65 nodes; a Query has at most 64',
    ]],
    ['deeper than 12', 'requirement', ['>=', Array.from({ length: 10 }).reduce((inner) => ['+', inner], ['+', 1]), 1], [
      ' is 13 deep; a Query is at most 12 deep',
    ]],
    ['more than 64 nodes and deeper than 12', 'score', Array.from({ length: 12 }).reduce((inner) => ['+', inner, ...Array.from({ length: 5 }, () => 1)], ['+', 1]), [
      ' has 74 nodes; a Query has at most 64',
      ' is 14 deep; a Query is at most 12 deep',
    ]],
    ['more than 64 nodes, some no node', 'score', ['+', ...Array.from({ length: 30 }, () => ['count', ['where', 'party', ['has-skill', 'tactics', 2]]]), ['median']], [
      '.31: "median" is not an operator of a Query',
      ' has 122 nodes; a Query has at most 64',
    ]],
    ['an among more than 64 nodes', 'among', ['where', 'party', ['or', ...Array.from({ length: 31 }, () => ['>=', ['level'], 2])]], [
      ' has 96 nodes; a Query has at most 64',
    ]],
    // A Check's score that turns a Stat a Hero adds against itself (DL-154, DL-162).
    ['a Val subtracting a Stat', 'score', ['sum', 'party', ['-', ['level'], ['stat', 'strength']]], [
      '.2.2: "-" subtracts a Stat a Hero adds; form would then raise the score of a hurt or low-spirited Hero',
    ]],
    ['a Val subtracting a weighted', 'score', ['max', 'party', ['-', 20, ['weighted', [['wits', 1]]]]], [
      '.2.2: "-" subtracts a Stat a Hero adds; form would then raise the score of a hurt or low-spirited Hero',
    ]],
    ['a Val subtracting a sum of Stats', 'score', ['of', ['best', 'party', ['level']], ['-', 10, ['+', 1, ['stat', 'wits']]]], [
      '.2.2: "-" subtracts a Stat a Hero adds; form would then raise the score of a hurt or low-spirited Hero',
    ]],
    ['a Num subtracting a sum of a Stat', 'score', ['-', 40, ['sum', 'party', ['stat', 'strength']]], [
      '.2: "-" subtracts a Stat a Hero adds; form would then raise the score of a hurt or low-spirited Hero',
    ]],
    ['a Num subtracting the best Hero\'s Stat', 'score', ['+', 5, ['-', ['count', 'party'], ['of', ['best', 'party', ['level']], ['stat', 'wits']]]], [
      '.2.2: "-" subtracts a Stat a Hero adds; form would then raise the score of a hurt or low-spirited Hero',
    ]],
    ['a Num subtracting a ranked Stat', 'score', ['-', 30, ['ranked', 'party', ['stat', 'courage'], [1]]], [
      '.2: "-" subtracts a Stat a Hero adds; form would then raise the score of a hurt or low-spirited Hero',
    ]],
    ['a Num subtracting the least of a Stat', 'score', ['-', 30, ['least', 3, ['min', 'party', ['stat', 'courage']]]], [
      '.2: "-" subtracts a Stat a Hero adds; form would then raise the score of a hurt or low-spirited Hero',
    ]],
    ['a Num subtracting the greatest of a mean of a Stat', 'score', ['-', 30, ['greatest', 3, ['avg', 'party', ['stat', 'courage']]]], [
      '.2: "-" subtracts a Stat a Hero adds; form would then raise the score of a hurt or low-spirited Hero',
    ]],
    ['two Stats under one subtraction, refused once', 'score', ['-', 40, ['+', ['sum', 'party', ['stat', 'strength']], ['max', 'party', ['stat', 'wits']]]], [
      '.2: "-" subtracts a Stat a Hero adds; form would then raise the score of a hurt or low-spirited Hero',
    ]],
    ['two subtractions, each refused', 'score', ['+', ['-', 1, ['sum', 'party', ['stat', 'wits']]], ['-', 1, ['sum', 'party', ['stat', 'strength']]]], [
      '.1.2: "-" subtracts a Stat a Hero adds; form would then raise the score of a hurt or low-spirited Hero',
      '.2.2: "-" subtracts a Stat a Hero adds; form would then raise the score of a hurt or low-spirited Hero',
    ]],
    ['a weighted with a negative weight', 'score', ['sum', 'party', ['weighted', [['strength', 0.6], ['wits', -0.4]]]], [
      '.2.1.1.1: weighted gives "wits" a negative weight; form would then raise the score of a hurt or low-spirited Hero',
    ]],
    ['a weighted with two negative weights', 'score', ['sum', 'party', ['weighted', [['strength', -0.6], ['wits', -0.4], ['courage', 1]]]], [
      '.2.1.0.1: weighted gives "strength" a negative weight; form would then raise the score of a hurt or low-spirited Hero',
      '.2.1.1.1: weighted gives "wits" a negative weight; form would then raise the score of a hurt or low-spirited Hero',
    ]],
    ['a weighted of one negative weight, deep in a Num', 'score', ['+', 3, ['max', 'party', ['weighted', [['courage', -1]]]]], [
      '.2.2.1.0.1: weighted gives "courage" a negative weight; form would then raise the score of a hurt or low-spirited Hero',
    ]],
    ['a weighted under a subtraction', 'score', ['-', 10, ['sum', 'party', ['weighted', [['strength', -1], ['wits', 1]]]]], [
      '.2: "-" subtracts a Stat a Hero adds; form would then raise the score of a hurt or low-spirited Hero',
    ]],
    ['a weighted under a product that may be negative', 'score', ['*', ['-', ['count', 'party'], 3], ['sum', 'party', ['weighted', [['wits', -1], ['strength', 1]]]]], [
      ': "*" multiplies a Stat a Hero adds by a number that may be negative; form would then raise the score of a hurt or low-spirited Hero',
    ]],
    ['a weighted of a negative weight as a factor', 'score', ['sum', 'party', ['*', ['weighted', [['strength', -1]]], ['stat', 'wits']]], [
      '.2.1.1.0.1: weighted gives "strength" a negative weight; form would then raise the score of a hurt or low-spirited Hero',
      '.2: "*" multiplies a Stat a Hero adds by a negative number; form would then raise the score of a hurt or low-spirited Hero',
    ]],
    ['a Val of a Stat times a negative number', 'score', ['sum', 'party', ['*', -1, ['stat', 'strength']]], [
      '.2: "*" multiplies a Stat a Hero adds by a negative number; form would then raise the score of a hurt or low-spirited Hero',
    ]],
    ['a Val of a Stat times a negative sum of numbers', 'score', ['avg', 'party', ['*', ['-', 1, 3], ['+', ['stat', 'wits'], 2]]], [
      '.2: "*" multiplies a Stat a Hero adds by a negative number; form would then raise the score of a hurt or low-spirited Hero',
    ]],
    ['a Val of a Stat times a Level less 5', 'score', ['sum', 'party', ['*', ['-', ['level'], 5], ['stat', 'wits']]], [
      '.2: "*" multiplies a Stat a Hero adds by a number that may be negative; form would then raise the score of a hurt or low-spirited Hero',
    ]],
    ['a Num of a sum of a Stat times a negative number', 'score', ['+', 20, ['*', ['sum', 'party', ['stat', 'strength']], -0.5]], [
      '.2: "*" multiplies a Stat a Hero adds by a negative number; form would then raise the score of a hurt or low-spirited Hero',
    ]],
    ['a Num of the best Hero\'s Stat times a negative number', 'score', ['*', -2, ['of', ['best', 'party', ['level']], ['stat', 'wits']]], [
      ': "*" multiplies a Stat a Hero adds by a negative number; form would then raise the score of a hurt or low-spirited Hero',
    ]],
    ['a Stat times minus the count of the Party', 'score', ['*', ['*', -1, ['count', 'party']], ['max', 'party', ['stat', 'wits']]], [
      ': "*" multiplies a Stat a Hero adds by a negative number; form would then raise the score of a hurt or low-spirited Hero',
    ]],
    ['a Stat times nought less the count of the Party', 'score', ['*', ['-', 0, ['count', 'party']], ['max', 'party', ['stat', 'wits']]], [
      ': "*" multiplies a Stat a Hero adds by a negative number; form would then raise the score of a hurt or low-spirited Hero',
    ]],
    ['a Stat times a count less 3', 'score', ['*', ['-', ['count', 'party'], 3], ['max', 'party', ['stat', 'wits']]], [
      ': "*" multiplies a Stat a Hero adds by a number that may be negative; form would then raise the score of a hurt or low-spirited Hero',
    ]],
    ['a Stat negated thrice', 'score', ['*', -1, ['*', -1, ['*', -1, ['max', 'party', ['stat', 'wits']]]]], [
      '.2.2: "*" multiplies a Stat a Hero adds by a negative number; form would then raise the score of a hurt or low-spirited Hero',
    ]],
    ['a Stat negated, then subtracted', 'score', ['-', 10, ['*', -1, ['-', 0, ['max', 'party', ['stat', 'wits']]]]], [
      '.2.2.2: "-" subtracts a Stat a Hero adds; form would then raise the score of a hurt or low-spirited Hero',
    ]],
    ['a ranked with a negative weight', 'score', ['ranked', 'party', ['stat', 'wits'], [1, -0.5]], [
      '.3.1 is -0.5; a weight is a finite number of 0 or more',
      '.3: "ranked" gives a negative weight to a value that reads a Stat a Hero adds; form would then raise the score of a hurt or low-spirited Hero',
    ]],
    ['a ranked whose weights are no list', 'score', ['ranked', 'party', ['stat', 'wits'], 'x'], [
      '.3 is "x"; ranked\'s weights are a list of one or more',
      '.3: "ranked" gives a negative weight to a value that reads a Stat a Hero adds; form would then raise the score of a hurt or low-spirited Hero',
    ]],
    ['a ranked with a weight that is a word', 'score', ['ranked', 'party', ['stat', 'wits'], [1, 'a']], [
      '.3.1 is a; a weight is a finite number of 0 or more',
      '.3: "ranked" gives a negative weight to a value that reads a Stat a Hero adds; form would then raise the score of a hurt or low-spirited Hero',
    ]],
    ['a ranked of a negated Stat, negated', 'score', ['-', 0, ['ranked', 'party', ['stat', 'wits'], [-1]]], [
      '.2.3.0 is -1; a weight is a finite number of 0 or more',
    ]],
    ['a Stat times the least of a negative number', 'score', ['*', ['least', -1, 2], ['max', 'party', ['stat', 'wits']]], [
      ': "*" multiplies a Stat a Hero adds by a negative number; form would then raise the score of a hurt or low-spirited Hero',
    ]],
    ['a Stat times the least of a count and a negative number', 'score', ['*', ['least', ['count', 'party'], -1], ['max', 'party', ['stat', 'wits']]], [
      ': "*" multiplies a Stat a Hero adds by a number that may be negative; form would then raise the score of a hurt or low-spirited Hero',
    ]],
    ['a Stat times an operator no type has', 'score', ['*', ['median'], ['max', 'party', ['stat', 'wits']]], [
      '.1: "median" is not an operator of a Query',
      ': "*" multiplies a Stat a Hero adds by a number that may be negative; form would then raise the score of a hurt or low-spirited Hero',
    ]],
    ['a Stat times a Val operator no type has', 'score', ['sum', 'party', ['*', ['bogus'], ['stat', 'wits']]], [
      '.2.1: "bogus" is not an operator of a Query',
      '.2: "*" multiplies a Stat a Hero adds by a number that may be negative; form would then raise the score of a hurt or low-spirited Hero',
    ]],
    ['a Stat times a difference of three', 'score', ['*', ['-', 1, 2, 3], ['max', 'party', ['stat', 'wits']]], [
      '.1: "-" takes 2 arguments; it has 3',
      ': "*" multiplies a Stat a Hero adds by a number that may be negative; form would then raise the score of a hurt or low-spirited Hero',
    ]],
    ['a difference of three, its third a negated Stat', 'score', ['-', 1, 2, ['sum', 'party', ['*', -1, ['stat', 'wits']]]], [
      ': "-" takes 2 arguments; it has 3',
      '.3.2: "*" multiplies a Stat a Hero adds by a negative number; form would then raise the score of a hurt or low-spirited Hero',
    ]],
    ['a sum, its extra argument a negated Stat', 'score', ['sum', 'party', ['level'], ['*', -1, ['stat', 'wits']]], [
      ': "sum" takes 2 arguments; it has 3',
    ]],
    ['a count less a sum of a Stat no Hero has', 'score', ['-', ['count', 'party'], ['sum', 'party', ['stat', 'strenght']]], [
      '.2.2.1: "strenght" is not a Hero Stat',
      '.2: "-" subtracts a Stat a Hero adds; form would then raise the score of a hurt or low-spirited Hero',
    ]],
    ['a Val where a Num stands, subtracted', 'score', ['-', 10, ['stat', 'wits']], [
      '.2: "stat" makes a Val, where a Num is expected',
    ]],
    ['a weighted of no pairs, subtracted', 'score', ['-', 10, ['sum', 'party', ['weighted', 'x']]], [
      '.2.2.1 is "x"; weighted\'s Stats are a list of one or more [Stat, weight] pairs',
    ]],
    ['a weighted of a weight that is a word, subtracted', 'score', ['-', 10, ['sum', 'party', ['weighted', [['wits', 'a']]]]], [
      '.2.2.1.0 is ["wits","a"]; expected a [Stat, weight] pair, the weight a finite number',
    ]],
    ['a Stat times a product of nothing', 'score', ['*', ['+'], ['max', 'party', ['stat', 'wits']]], [
      '.1: "+" takes 1 argument or more; it has 0',
    ]],
    ['a Stat times a Level', 'score', ['sum', 'party', ['*', ['level'], ['stat', 'wits']]], []],
    ['a Stat times a Level and -5 summed', 'score', ['sum', 'party', ['*', ['+', ['level'], -5], ['stat', 'wits']]], [
      '.2: "*" multiplies a Stat a Hero adds by a number that may be negative; form would then raise the score of a hurt or low-spirited Hero',
    ]],
    ['a Stat times a Level times -1', 'score', ['sum', 'party', ['*', ['*', ['level'], -1], ['stat', 'wits']]], [
      '.2: "*" multiplies a Stat a Hero adds by a negative number; form would then raise the score of a hurt or low-spirited Hero',
    ]],
    ['a Stat times a sum of Levels less 5', 'score', ['*', ['sum', 'party', ['-', ['level'], 5]], ['max', 'party', ['stat', 'wits']]], [
      ': "*" multiplies a Stat a Hero adds by a number that may be negative; form would then raise the score of a hurt or low-spirited Hero',
    ]],
    ['a Stat times a mean of Levels less 5', 'score', ['*', ['avg', 'party', ['-', ['level'], 5]], ['max', 'party', ['stat', 'wits']]], [
      ': "*" multiplies a Stat a Hero adds by a number that may be negative; form would then raise the score of a hurt or low-spirited Hero',
    ]],
    ['a Stat times the most of Levels less 5', 'score', ['*', ['max', 'party', ['-', ['level'], 5]], ['max', 'party', ['stat', 'wits']]], [
      ': "*" multiplies a Stat a Hero adds by a number that may be negative; form would then raise the score of a hurt or low-spirited Hero',
    ]],
    ['a Stat times the least of Levels less 5', 'score', ['*', ['min', 'party', ['-', ['level'], 5]], ['max', 'party', ['stat', 'wits']]], [
      ': "*" multiplies a Stat a Hero adds by a number that may be negative; form would then raise the score of a hurt or low-spirited Hero',
    ]],
    ['a Stat times a ranked of Levels less 5', 'score', ['*', ['ranked', 'party', ['-', ['level'], 5], [1]], ['max', 'party', ['stat', 'wits']]], [
      ': "*" multiplies a Stat a Hero adds by a number that may be negative; form would then raise the score of a hurt or low-spirited Hero',
    ]],
    ['a Stat times the best Hero\'s Level less 5', 'score', ['*', ['of', ['best', 'party', ['level']], ['-', ['level'], 5]], ['max', 'party', ['stat', 'wits']]], [
      ': "*" multiplies a Stat a Hero adds by a number that may be negative; form would then raise the score of a hurt or low-spirited Hero',
    ]],
    ['a Stat times the greatest of a count less 3 and 1', 'score', ['*', ['greatest', ['-', ['count', 'party'], 3], 1], ['max', 'party', ['stat', 'wits']]], [
      ': "*" multiplies a Stat a Hero adds by a number that may be negative; form would then raise the score of a hurt or low-spirited Hero',
    ]],
    ['a Stat times a count and -3 summed', 'score', ['*', ['+', ['count', 'party'], -3], ['max', 'party', ['stat', 'wits']]], [
      ': "*" multiplies a Stat a Hero adds by a number that may be negative; form would then raise the score of a hurt or low-spirited Hero',
    ]],
    ['a Stat times 1 and -2 summed', 'score', ['*', ['+', 1, -2], ['max', 'party', ['stat', 'wits']]], [
      ': "*" multiplies a Stat a Hero adds by a negative number; form would then raise the score of a hurt or low-spirited Hero',
    ]],
    ['a Skill of a subtracted Stat', 'score', ['sum', 'party', ['skill', ['-', 0, ['stat', 'wits']]]], [
      '.2.1: ["-",0,["stat","wits"]] is not a Skill',
    ]],
    ['a Skill of a subtracted Stat, subtracted', 'score', ['-', 10, ['sum', 'party', ['skill', ['-', 0, ['stat', 'wits']]]]], [
      '.2.2.1: ["-",0,["stat","wits"]] is not a Skill',
    ]],
    ['a Level of a subtracted Stat, subtracted', 'score', ['sum', 'party', ['level', ['-', 0, ['stat', 'wits']]]], [
      '.2: "level" takes no arguments; it has 1',
    ]],
    ['a Morale of a subtracted Stat', 'score', ['sum', 'party', ['morale', ['-', 0, ['stat', 'wits']]]], [
      '.2: "morale" takes no arguments; it has 1',
    ]],
    ['an age of a subtracted Stat', 'score', ['sum', 'party', ['age', ['-', 0, ['stat', 'wits']]]], [
      '.2: "age" takes no arguments; it has 1',
    ]],
    ['a count of a subtracted sum of a Stat', 'score', ['count', ['-', 0, ['sum', 'party', ['stat', 'wits']]]], [
      '.1: "-" makes a Val or a Num, where a Set is expected',
    ]],
    ['a Stat that may be negative under a negative', 'score', ['*', -1, ['*', ['-', ['count', 'party'], 3], ['max', 'party', ['stat', 'wits']]]], [
      '.2: "*" multiplies a Stat a Hero adds by a number that may be negative; form would then raise the score of a hurt or low-spirited Hero',
    ]],
    ['a Stat times a word', 'score', ['*', 'x', ['max', 'party', ['stat', 'wits']]], [
      '.1 is "x"; expected a Num, a list with its operator first',
      ': "*" multiplies a Stat a Hero adds by a number that may be negative; form would then raise the score of a hurt or low-spirited Hero',
    ]],
    ['a Stat times a weighted of no pairs', 'score', ['sum', 'party', ['*', ['weighted', 'x'], ['stat', 'wits']]], [
      '.2.1.1 is "x"; weighted\'s Stats are a list of one or more [Stat, weight] pairs',
      '.2: "*" multiplies a Stat a Hero adds by a number that may be negative; form would then raise the score of a hurt or low-spirited Hero',
    ]],
    ['a Stat times a ranked of a negative weight', 'score', ['*', ['ranked', 'party', ['level'], [-1]], ['max', 'party', ['stat', 'wits']]], [
      '.1.3.0 is -1; a weight is a finite number of 0 or more',
      ': "*" multiplies a Stat a Hero adds by a negative number; form would then raise the score of a hurt or low-spirited Hero',
    ]],
    ['a Stat times -1 and a least of nothing', 'score', ['*', -1, ['least'], ['max', 'party', ['stat', 'wits']]], [
      '.2: "least" takes 1 argument or more; it has 0',
    ]],
    ['a Stat times a product of numbers, negative', 'score', ['*', ['*', 2, -0.5], ['max', 'party', ['stat', 'wits']]], [
      ': "*" multiplies a Stat a Hero adds by a negative number; form would then raise the score of a hurt or low-spirited Hero',
    ]],
    ['a Num where a Val stands, of a subtracted Stat', 'score', ['sum', 'party', ['count', ['-', 0, ['stat', 'wits']]]], [
      '.2: "count" makes a Num, where a Val is expected',
    ]],
    ['a Val where a Num stands, of a subtracted sum of a Stat', 'score', ['+', 1, ['level', ['-', 0, ['sum', 'party', ['stat', 'wits']]]]], [
      '.2: "level" makes a Val, where a Num is expected',
    ]],
    ['a Stat times a sum of numbers, the Val negative', 'score', ['*', ['sum', 3, -1], ['max', 'party', ['stat', 'wits']]], [
      '.1.1 is 3; a number stands for a Val or a Num, not a Set',
      ': "*" multiplies a Stat a Hero adds by a negative number; form would then raise the score of a hurt or low-spirited Hero',
    ]],
    // Accepted.
    ['a Stat less a number', 'score', ['sum', 'party', ['-', ['stat', 'strength'], 2]], []],
    ['a sum less a count of Heroes filtered by a Stat', 'score', ['-', ['sum', 'party', ['stat', 'strength']], ['count', ['where', 'party', ['<', ['stat', 'wits'], 8]]]], []],
    ['a sum less the best Hero\'s Skill', 'score', ['-', ['sum', 'party', ['stat', 'strength']], ['of', ['best', 'party', ['stat', 'wits']], ['skill', 'tactics']]], []],
    ['a filter on a Stat subtracted', 'score', ['count', ['where', 'party', ['>=', ['-', 10, ['stat', 'wits']], 1]]], []],
    ['a top by a Stat subtracted', 'score', ['sum', ['top', 'party', 1, ['-', 0, ['stat', 'wits']]], ['level']], []],
    ['a weighted of positive and zero weights', 'score', ['sum', 'party', ['weighted', [['strength', 0.6], ['wits', 0]]]], []],
    ['a Stat times a positive number', 'score', ['sum', 'party', ['*', 0.5, ['stat', 'strength']]], []],
    ['a Stat times a Skill, Morale and age', 'score', ['sum', 'party', ['*', ['skill', 'tactics'], ['morale'], ['age'], ['stat', 'wits']]], []],
    ['a Level times a negative number', 'score', ['+', ['sum', 'party', ['stat', 'strength']], ['sum', 'party', ['*', -1, ['level']]]], []],
    ['a count times a negative number', 'score', ['+', ['sum', 'party', ['stat', 'strength']], ['*', -2, ['count', ['where', 'party', ['<', ['stat', 'wits'], 8]]]]], []],
    ['a Stat times a product of two negative numbers', 'score', ['sum', 'party', ['*', -1, -2, ['stat', 'strength']]], []],
    ['a Stat negated twice', 'score', ['*', -1, ['*', -1, ['sum', 'party', ['stat', 'strength']]]], []],
    ['a Stat subtracted from nought, then negated', 'score', ['*', -1, ['-', 0, ['max', 'party', ['stat', 'wits']]]], []],
    ['a negative weight, negated', 'score', ['*', -1, ['max', 'party', ['weighted', [['wits', -1]]]]], []],
    ['a Stat times the count of the Party', 'score', ['*', ['count', 'party'], ['max', 'party', ['stat', 'wits']]], []],
    ['a Stat times a count less nought', 'score', ['*', ['-', ['count', 'party'], 0], ['max', 'party', ['stat', 'wits']]], []],
    ['a Stat times the greatest of numbers, one negative', 'score', ['*', ['greatest', 1, -2], ['max', 'party', ['stat', 'wits']]], []],
    ['a Stat times nought', 'score', ['*', 0, ['max', 'party', ['stat', 'wits']]], []],
    ['a Stat times a sum of Levels', 'score', ['*', ['sum', 'party', ['level']], ['max', 'party', ['stat', 'wits']]], []],
    ['a Stat times a mean of Levels', 'score', ['*', ['avg', 'party', ['level']], ['max', 'party', ['stat', 'wits']]], []],
    ['a Stat times the most of Levels', 'score', ['*', ['max', 'party', ['level']], ['max', 'party', ['stat', 'wits']]], []],
    ['a Stat times the least of Levels', 'score', ['*', ['min', 'party', ['level']], ['max', 'party', ['stat', 'wits']]], []],
    ['a Stat times the best Hero\'s Level', 'score', ['*', ['of', ['best', 'party', ['level']], ['level']], ['max', 'party', ['stat', 'wits']]], []],
    ['a Stat times the least of 1 and a count', 'score', ['*', ['least', 1, ['count', 'party']], ['max', 'party', ['stat', 'wits']]], []],
    ['a Stat times the greatest of 1 and a count', 'score', ['*', ['greatest', 1, ['count', 'party']], ['max', 'party', ['stat', 'wits']]], []],
    ['a Set filtered by Sex, a Stat summed', 'score', ['sum', ['where', 'party', ['sex', 'female']], ['stat', 'strength']], []],
    ['a Set filtered by Sex, the best Level', 'score', ['max', ['where', 'party', ['sex', 'female']], ['level']], []],
    ['a Set filtered by Sex, its best Hero read', 'score', ['of', ['best', ['where', 'party', ['sex', 'male']], ['level']], ['level']], []],
    ['a Set filtered by Sex, by a weighted pair that is no pair', 'score', ['sum', ['where', 'party', ['sex', 'female']], ['weighted', ['strength']]], [
      '.2.1.0 is "strength"; expected a [Stat, weight] pair, the weight a finite number',
    ]],
    ['every type in one', 'requirement', ['>=', ['greatest', ['of', ['worst', ['top', 'party', 2, ['weighted', [['dexterity', 1]]]], ['age']], ['*', ['morale'], 0.1]], ['ranked', ['bottom', 'party', 3, ['skill', 'stealth']], ['-', ['level'], 1], [1, 0.5]]], ['least', 1, 2]], []],
    ['64 nodes', 'requirement', ['>=', ['+', ...Array.from({ length: 61 }, () => 1)], 1], []],
    ['12 deep', 'requirement', ['>=', Array.from({ length: 9 }).reduce((inner) => ['+', inner], ['+', 1]), 1], []],
    ['a requirement subtracting a Stat', 'requirement', ['>=', ['-', 40, ['sum', 'party', ['stat', 'strength']]], 1], []],
    ['a raw Check weighing a Stat negatively', 'raw', ['+', 30, ['*', -1, ['max', 'party', ['weighted', [['wits', -1]]]]]], []],
    ['a raw Check subtracting a Stat', 'raw', ['-', 40, ['sum', 'party', ['stat', 'strength']]], []],
    ['a raw Check counting a Set filtered by Sex', 'raw', ['count', ['where', 'party', ['sex', 'female']]], [
      ': a Set filtered by Sex is counted; Sex decides who takes part, never a number (DL-148 item 6)',
    ]],
    ['an among filtered by Sex, its top by a Level', 'among', ['top', ['where', 'party', ['and', ['class', 'warrior'], ['sex', 'male']]], 2, ['stat', 'constitution']], []],
    ['a Death among the hurt', 'death', ['where', 'party', ['hurt']], []],
    ['an earned Trait among the bottom by a subtracted Stat', 'earned', ['bottom', 'party', 1, ['-', 0, ['stat', 'wits']]], []],
  ])('%s, as a %s, is refused in these words or accepted', (_, place, query, refusals) => {
    expect(problemsOf(withQuery(place, query))).toEqual(refusals.map((refusal) => `${paths[place]}${refusal}`));
  });
});
