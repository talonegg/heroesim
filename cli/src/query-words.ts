// What a Check reads, and how likely a Party is to pass it, in the CLI's words (v1.1.4-S5, DL-148
// items 15 and 16): the engine's typed account of a Query (`describeQuery`) worded, "Strength of the
// Warrior with the highest Strength", and a chance band's key as the word DL-148 item 15 gives it. The
// page words them the same (web/src/state/query-words.ts). Words only; no rule. S6 shows them in
// `preview` and on the Board.

import type { ChanceBand, ContentSet, PredAccount, QueryAccount, SetAccount, ValAccount } from '@heroesim/engine';
import { nameIn } from './render.js';

/** A chance band in words (DL-148 item 15). */
export const chanceWords: Readonly<Record<ChanceBand, string>> = {
  hopeless: 'Hopeless',
  unlikely: 'Unlikely',
  even: 'Even',
  likely: 'Likely',
  'near-certain': 'Near certain',
};

/** The content a Query's keys are named from. */
export type QueryNames = Pick<ContentSet, 'stats' | 'skills' | 'classes' | 'backgrounds' | 'traits'>;

/** `a`, `a and b`, `a, b and c`; or with `or`. */
function joined(items: readonly string[], word = 'and'): string {
  return items.length <= 1 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} ${word} ${items.at(-1) ?? ''}`;
}

const signs = { '+': ' + ', '-': ' − ', '*': ' × ' } as const;
const comparisons = { '>=': 'at least ', '>': 'above ', '<': 'below ', '<=': 'at most ', '=': '' } as const;

/**
 * `account`, a Check's score, in words: "the total Intelligence of the Mages and Healers", "Strength
 * of the Warrior with the highest Strength", "0.5 × the total Strength of the Party + 0.5 × the highest
 * Wits in the Party". A key content does not define is shown as it is (data-model rule 5).
 */
export function queryWords(account: QueryAccount, names: QueryNames): string {
  const val = (it: ValAccount): string => {
    switch (it.kind) {
      case 'number':
        return String(it.value);
      case 'stat':
        return nameIn(names.stats, it.statKey);
      case 'skill':
        return nameIn(names.skills, it.skillKey);
      case 'level':
        return 'Level';
      case 'morale':
        return 'Morale';
      case 'age':
        return 'Age';
      case 'weighted': {
        const [only, ...more] = it.stats;
        if (only !== undefined && more.length === 0 && only.weight === 1) return nameIn(names.stats, only.statKey);
        return `(${it.stats.map(({ statKey, weight }) => `${weight} ${nameIn(names.stats, statKey)}`).join(' + ')})`;
      }
      case 'arithmetic':
        return `(${it.operands.map(val).join(signs[it.operator])})`;
    }
  };
  const plurals = (keys: readonly string[]): string[] => keys.map((key) => `${nameIn(names.classes, key)}s`);
  // Each filter as a clause, and as the clause of those it leaves out.
  const clause = (it: PredAccount): [string, string] => {
    switch (it.kind) {
      case 'class':
        return [`who are ${joined(plurals(it.classKeys), 'or')}`, `who are not ${joined(plurals(it.classKeys), 'or')}`];
      case 'background': {
        const which = joined(it.backgroundKeys.map((key) => nameIn(names.backgrounds, key)), 'or');
        return [`who are of the ${which} Background`, `who are not of the ${which} Background`];
      }
      case 'sex': {
        const sex = it.sex === 'female' ? 'Female' : 'Male';
        return [`who are ${sex}`, `who are not ${sex}`];
      }
      case 'has-skill': {
        const skill = nameIn(names.skills, it.skillKey);
        return it.atLeast === 1 ? [`who have ${skill}`, `who lack ${skill}`] : [`who have ${skill} at ${it.atLeast} or more`, `who have ${skill} below ${it.atLeast}`];
      }
      case 'has-trait': {
        const trait = nameIn(names.traits, it.traitKey);
        return [`who have the ${trait} Trait`, `who lack the ${trait} Trait`];
      }
      case 'hurt':
        return ['who are hurt', 'who are not hurt'];
      case 'compare': {
        const [left, right] = [val(it.left), `${comparisons[it.comparison]}${val(it.right)}`];
        return [`whose ${left} is ${right}`, `whose ${left} is not ${right}`];
      }
      case 'and':
      case 'or': {
        // A part that is itself an `and` or an `or` is bracketed, so that "(a or b) and c" reads as one.
        const parts = it.operands.map((operand): [string, string] => {
          const [pos, neg] = clause(operand);
          return compound(operand) ? [`(${pos})`, `(${neg})`] : [pos, neg];
        });
        const [yes, no] = it.kind === 'and' ? ['and', 'or'] : ['or', 'and'];
        return [parts.map(([pos]) => pos).join(` ${yes} `), parts.map(([, neg]) => neg).join(` ${no} `)];
      }
      case 'not': {
        const [pos, neg] = clause(it.operand);
        return [neg, pos];
      }
    }
  };
  // Whether a filter joins several clauses, as an `and` or an `or` of two or more, or the negation of one, does.
  const compound = (it: PredAccount): boolean =>
    it.kind === 'and' || it.kind === 'or' ? it.operands.length > 1 : it.kind === 'not' && compound(it.operand);
  // A Set without its "the": none for the Party itself.
  const core = (it: SetAccount): string | undefined => {
    switch (it.kind) {
      case 'party':
        return undefined;
      case 'where':
        if (it.of.kind === 'party' && it.filter.kind === 'class') return joined(plurals(it.filter.classKeys));
        return `${core(it.of) ?? 'Heroes'} ${clause(it.filter)[0]}`;
      case 'top':
      case 'bottom': {
        const within = core(it.of);
        return `${it.count} ${it.count === 1 ? 'Hero' : 'Heroes'}${within === undefined ? '' : ` of the ${within}`} with the ${it.kind === 'top' ? 'highest' : 'lowest'} ${val(it.by)}`;
      }
    }
  };
  const set = (it: SetAccount): string => {
    const words = core(it);
    return words === undefined ? 'the Party' : `the ${words}`;
  };
  // `within`, the operator of the arithmetic it stands in: a sum or a difference is bracketed in a product or a difference.
  const num = (it: QueryAccount, within?: string): string => {
    switch (it.kind) {
      case 'number':
        return String(it.value);
      case 'aggregate': {
        const of = set(it.of);
        const value = val(it.value);
        return { sum: `the total ${value} of ${of}`, avg: `the average ${value} of ${of}`, max: `the highest ${value} in ${of}`, min: `the lowest ${value} in ${of}` }[it.aggregate];
      }
      case 'count': {
        const words = core(it.of);
        return words === undefined ? 'the size of the Party' : `the number of ${words}`;
      }
      case 'ranked':
        return `the ${val(it.value)} of ${set(it.of)}, highest first, weighted ${joined(it.weights.map(String))}`;
      case 'hero': {
        const { kind, of, by } = it.hero;
        const most = `with the ${kind === 'best' ? 'highest' : 'lowest'} ${val(by)}`;
        const who =
          of.kind === 'party'
            ? `the Hero ${most}`
            : of.kind === 'where' && of.of.kind === 'party' && of.filter.kind === 'class'
              ? `the ${joined(of.filter.classKeys.map((key) => nameIn(names.classes, key)), 'or')} ${most}`
              : `the one of ${set(of)} ${most}`;
        return `${val(it.value)} of ${who}`;
      }
      case 'arithmetic': {
        if (it.operator === 'least' || it.operator === 'greatest') return `the ${it.operator} of ${joined(it.operands.map((operand) => num(operand)))}`;
        const words = it.operands.map((operand) => num(operand, it.operator)).join(signs[it.operator]);
        return (within === '*' || within === '-') && it.operator !== '*' ? `(${words})` : words;
      }
    }
  };
  return num(account);
}
