// The Query operators (v1.1.6-S10, DL-186 item 6, ADR-0010): one row for each operator of each type,
// its `signature`, the arguments it takes, and its `evaluate`, how it reads the Party. The evaluator
// below walks a Query by these rows, and content's checks read the same signatures through
// `queryProblems` (problems.ts), so that a new operator is a row here, its sign in problems.ts, its
// account in describe.ts and its words in both front ends; the types it is written in are
// content-types.ts', and a row missing for one of their operators fails to compile.
//
// The evaluator is pure and draws nothing. The Party is the members still in the sequence, in Party
// order (`queryParty`, query.ts). Ties in `best`, `worst`, `top`, `bottom` and `ranked` go to the
// earlier Hero in Party order, and sums run in Party order, so the same Party always reads the same
// to the last bit. An empty Set gives 0 to every Num, and no Hero gives 0. A Stat, Skill, Class,
// Background or Trait that content no longer defines reads 0 or matches no one (data-model rule 5).
//
// It reads only the Party's own Heroes and their state on the Quest: never the Guild's leader nor
// the Guild's dealings (M4's third risk; the Check's test reads this file to hold it so), nor Regard
// between particular Heroes (DL-148 item 5).
//
// Form (DL-148 items 9 to 11, DL-284, form.ts). A Check's score is read with each Hero's form
// (`evaluate`'s `withForm`), a Synergy's requirements without. With form, only the Stat values a Hero
// adds into the score are formed: each `stat`, and each Stat within a `weighted` and within the `+`,
// `-` and `*` of Vals, reads its Hero's formed Stat (`QueryMember.formed`); a number, a Skill rating,
// Level, Morale and age are not. Every choice of a Hero reads them as they are: `best`, `worst`, `top`, `bottom`, `ranked`'s order,
// and the Hero whose value `max` or `min` adds, which are `of best` and `of worst`. So do every filter
// and every count. A hurt Warrior is still the strongest Warrior, and adds less.

import type {
  HeroQuery,
  NumQuery,
  PartyCondition,
  PredQuery,
  QueryComparison,
  SetQuery,
  ValQuery,
} from '../../content-types.js';
import { rowOf, type Hero } from '../../document.js';
import type { QueryContent, QueryMember, QueryParty } from '../query.js';

/** The five types of Query, and a condition on the Party, which a Synergy's requirement lists. */
export type QueryType = 'set' | 'hero' | 'val' | 'pred' | 'num' | 'condition';

/**
 * What an argument of an operator is: a Query of a type; a key content defines (a Hero Stat, a
 * Skill, a Class, a Hero Background, a Hero Trait) or a sex; or a number or list of its own (`top`'s
 * and `bottom`'s n, `has-skill`'s least rating, `ranked`'s weights, `weighted`'s pairs).
 */
export type QueryArgument =
  | QueryType
  | 'stat'
  | 'skill'
  | 'class'
  | 'background'
  | 'trait'
  | 'sex'
  | 'heroes'
  | 'rating'
  | 'weights'
  | 'pairs';

/**
 * An operator's arguments, in order, each of its kind; the last may be `kind?`, which it may leave
 * out, or `kind...`, one or more of it.
 */
export type Signature = readonly (QueryArgument | `${QueryArgument}?` | `${QueryArgument}...`)[];

/** One operator of a type: the arguments it takes, and how it reads the Party. */
export interface Operator<Evaluate> {
  readonly signature: Signature;
  readonly evaluate: Evaluate;
}

/** The operators a type of Query is written with: the first of each of its lists. */
export type OperatorOf<Query> = Query extends readonly [infer Name, ...unknown[]] ? Name : never;

/** The lists of a type of Query whose operator is `Name`. */
type NodeOf<Query, Name> = Query extends readonly [infer First, ...infer Rest] ? (Name extends First ? [Name, ...Rest] : never) : never;

/** Every operator of each type (content-types.ts's `SetQuery` to `NumQuery`, and `PartyCondition`), each read as its type is. */
export interface Operators {
  readonly set: { readonly [Name in OperatorOf<SetQuery>]: Operator<(node: NodeOf<SetQuery, Name>, party: QueryParty) => QueryMember[]> };
  readonly hero: { readonly [Name in OperatorOf<HeroQuery>]: Operator<(node: NodeOf<HeroQuery, Name>, party: QueryParty) => QueryMember | undefined> };
  readonly val: {
    readonly [Name in OperatorOf<ValQuery>]: Operator<
      (node: NodeOf<ValQuery, Name>, member: QueryMember, content: QueryContent, withForm: boolean) => number
    >;
  };
  readonly pred: {
    readonly [Name in OperatorOf<PredQuery>]: Operator<(node: NodeOf<PredQuery, Name>, member: QueryMember, content: QueryContent) => boolean>;
  };
  readonly num: { readonly [Name in OperatorOf<NumQuery>]: Operator<(node: NodeOf<NumQuery, Name>, party: QueryParty, withForm: boolean) => number> };
  readonly condition: { readonly [Name in OperatorOf<PartyCondition>]: Operator<(node: NodeOf<PartyCondition, Name>, party: QueryParty) => boolean> };
}

/** A row of the table. */
const row = <Evaluate>(signature: Signature, evaluate: Evaluate): Operator<Evaluate> => ({ signature, evaluate });

/** A Pred's comparison of two Vals of the current Hero, one row for the five comparisons. */
const valsCompared = row(['val', 'val'], ([comparison, left, right]: [QueryComparison, ValQuery, ValQuery], member: QueryMember, content: QueryContent) =>
  compare(comparison, valueOf(left, member, content), valueOf(right, member, content)),
);

/** A condition's comparison of two Nums of the Party, one row for the five comparisons. */
const numsCompared = row(['num', 'num'], ([comparison, left, right]: PartyCondition, party: QueryParty) =>
  compare(comparison, evaluate(left, party), evaluate(right, party)),
);

/** The table: every operator of each type, in the order the types are named (`misplaced` lists them so). */
export const operators: Operators = {
  set: {
    where: row(['set', 'pred'], ([, set, pred], party) => membersOf(set, party).filter((member) => is(pred, member, party.content))),
    top: row(['set', 'heroes', 'val'], ([, set, count, val], party) => chosen(set, count, val, party, 'highest')),
    bottom: row(['set', 'heroes', 'val'], ([, set, count, val], party) => chosen(set, count, val, party, 'lowest')),
  },
  hero: {
    best: row(['set', 'val'], ([, set, val], party) => ranking(membersOf(set, party), val, party.content, 'highest')[0]?.member),
    worst: row(['set', 'val'], ([, set, val], party) => ranking(membersOf(set, party), val, party.content, 'lowest')[0]?.member),
  },
  val: {
    stat: row(['stat'], ([, statKey], member, _content, withForm) => statOf(member, statKey, withForm)),
    skill: row(['skill'], ([, skillKey], member, content) => ratingOf(member.hero, skillKey, content)),
    level: row([], (_node, member) => member.hero.level),
    morale: row([], (_node, member) => member.morale),
    age: row([], (_node, member) => member.age),
    weighted: row(['pairs'], ([, pairs], member, _content, withForm) =>
      pairs.reduce((total, [statKey, weight]) => total + weight * statOf(member, statKey, withForm), 0),
    ),
    '+': row(['val...'], ([, ...operands], member, content, withForm) =>
      operands.reduce<number>((total, operand) => total + valueOf(operand, member, content, withForm), 0),
    ),
    '-': row(['val', 'val'], ([, left, right], member, content, withForm) => valueOf(left, member, content, withForm) - valueOf(right, member, content, withForm)),
    '*': row(['val...'], ([, ...operands], member, content, withForm) =>
      operands.reduce<number>((total, operand) => total * valueOf(operand, member, content, withForm), 1),
    ),
  },
  pred: {
    class: row(['class...'], ([, ...classKeys], { hero }, content) => Object.hasOwn(content.classes, hero.classKey) && classKeys.includes(hero.classKey)),
    background: row(['background...'], ([, ...backgroundKeys], { hero }, content) =>
      Object.hasOwn(content.backgrounds, hero.backgroundKey) && backgroundKeys.includes(hero.backgroundKey),
    ),
    sex: row(['sex'], ([, sex], { hero }) => hero.sex === sex),
    'has-skill': row(['skill', 'rating?'], (node, { hero }, content) => ratingOf(hero, node[1], content) >= (node[2] ?? 1)),
    'has-trait': row(['trait'], ([, traitKey], { hero }, content) => Object.hasOwn(content.heroTraits, traitKey) && hero.traits.includes(traitKey)),
    hurt: row([], (_node, member) => member.hurt),
    '>=': valsCompared,
    '>': valsCompared,
    '<': valsCompared,
    '<=': valsCompared,
    '=': valsCompared,
    and: row(['pred...'], ([, ...operands], member, content) => operands.every((operand) => is(operand, member, content))),
    or: row(['pred...'], ([, ...operands], member, content) => operands.some((operand) => is(operand, member, content))),
    not: row(['pred'], ([, operand], member, content) => !is(operand, member, content)),
  },
  num: {
    sum: row(['set', 'val'], ([, set, val], party, withForm) => valuesOf(set, val, party, withForm).reduce((total, value) => total + value, 0)),
    avg: row(['set', 'val'], ([, set, val], party, withForm) => {
      const values = valuesOf(set, val, party, withForm);
      return values.length === 0 ? 0 : values.reduce((total, value) => total + value, 0) / values.length;
    }),
    max: row(['set', 'val'], ([, set, val], party, withForm) => extreme(set, val, party, withForm, 'highest')),
    min: row(['set', 'val'], ([, set, val], party, withForm) => extreme(set, val, party, withForm, 'lowest')),
    count: row(['set'], ([, set], party) => membersOf(set, party).length),
    ranked: row(['set', 'val', 'weights'], ([, set, val, weights], party, withForm) => {
      const ranked = ranking(membersOf(set, party), val, party.content, 'highest');
      const added = ({ member, value }: { member: QueryMember; value: number }): number =>
        withForm ? valueOf(val, member, party.content, true) : value;
      return ranked.slice(0, weights.length).reduce((total, it, index) => total + (weights[index] ?? 0) * added(it), 0);
    }),
    of: row(['hero', 'val'], ([, hero, val], party, withForm) => {
      const member = heroOf(hero, party);
      return member === undefined ? 0 : valueOf(val, member, party.content, withForm);
    }),
    '+': row(['num...'], ([, ...operands], party, withForm) => operands.reduce<number>((total, operand) => total + evaluate(operand, party, withForm), 0)),
    '-': row(['num', 'num'], ([, left, right], party, withForm) => evaluate(left, party, withForm) - evaluate(right, party, withForm)),
    '*': row(['num...'], ([, ...operands], party, withForm) => operands.reduce<number>((total, operand) => total * evaluate(operand, party, withForm), 1)),
    least: row(['num...'], ([, ...operands], party, withForm) => Math.min(...operands.map((operand) => evaluate(operand, party, withForm)))),
    greatest: row(['num...'], ([, ...operands], party, withForm) => Math.max(...operands.map((operand) => evaluate(operand, party, withForm)))),
  },
  condition: {
    '>=': numsCompared,
    '>': numsCompared,
    '<': numsCompared,
    '<=': numsCompared,
    '=': numsCompared,
  },
};

/**
 * `query`'s value for `party`: a number of the Party, 0 for an empty Set or no Hero. `withForm`, for
 * a Check's score (DL-284), reads each Stat value a Hero adds into it formed; without it, as for a
 * Synergy's requirements, every Hero is read as they are.
 */
export function evaluate(query: NumQuery, party: QueryParty, withForm = false): number {
  if (typeof query === 'number') return query;
  return operatorOf(operators.num, query, 'a Num').evaluate(query as never, party, withForm);
}

/** Whether `condition` holds for `party`: its two Nums compared. */
export function holds(condition: PartyCondition, party: QueryParty): boolean {
  return operatorOf(operators.condition, condition, 'a condition on the Party').evaluate(condition as never, party);
}

/** The members `set` names, in Party order. */
export function membersOf(set: SetQuery, party: QueryParty): QueryMember[] {
  if (set === 'party') return [...party.members];
  return operatorOf(operators.set, set, 'a Set').evaluate(set as never, party);
}

/** The member `query` names: the best or worst of its Set by its Val, the earlier on a tie; none of an empty Set. */
export function heroOf(query: HeroQuery, party: QueryParty): QueryMember | undefined {
  return operatorOf(operators.hero, query, 'a Hero').evaluate(query as never, party);
}

/**
 * `query`'s value for `member`: a number read of the one Hero. `withForm`, for a value they add into a
 * Check's score (DL-284), reads each Stat it reads formed, within a `weighted` and an arithmetic Val
 * too; a number, a Skill rating, Level, Morale and age are read as they are.
 */
export function valueOf(query: ValQuery, member: QueryMember, content: QueryContent, withForm = false): number {
  if (typeof query === 'number') return query;
  return operatorOf(operators.val, query, 'a Val').evaluate(query as never, member, content, withForm);
}

/** Whether `query` holds of `member`. */
export function is(query: PredQuery, member: QueryMember, content: QueryContent): boolean {
  return operatorOf(operators.pred, query, 'a Pred').evaluate(query as never, member, content);
}

/**
 * The row of `rows` for `query`'s operator, its own; throws on an operator the type has not, which
 * content validation refuses, so only a Query built in memory reaches the throw. (Each row is called
 * with its own operator's list, which the cast in each caller stands for.)
 */
function operatorOf<Row>(rows: Readonly<Record<string, Row>>, query: readonly unknown[], type: string): Row {
  const found = typeof query[0] === 'string' ? rowOf(rows, query[0]) : undefined;
  if (found === undefined) throw new RangeError(`${JSON.stringify(query)} is not ${type} Query`);
  return found;
}

/** `a` against `b` by `comparison`. */
function compare(comparison: QueryComparison, a: number, b: number): boolean {
  switch (comparison) {
    case '>=':
      return a >= b;
    case '>':
      return a > b;
    case '<':
      return a < b;
    case '<=':
      return a <= b;
    case '=':
      return a === b;
  }
}

/** `top` or `bottom`: the `count` of `set` highest or lowest by `val`, the earlier on a tie, kept in Party order. */
function chosen(set: SetQuery, count: number, val: ValQuery, party: QueryParty, first: 'highest' | 'lowest'): QueryMember[] {
  const within = membersOf(set, party);
  const taken = new Set(ranking(within, val, party.content, first).slice(0, count).map((it) => it.member));
  return within.filter((member) => taken.has(member));
}

/**
 * `max` or `min`: the highest or lowest value of `val` in `set`, 0 for an empty Set. With form, the
 * Hero `of best` or `of worst` would choose, as they are, adds their value with their form.
 */
function extreme(set: SetQuery, val: ValQuery, party: QueryParty, withForm: boolean, first: 'highest' | 'lowest'): number {
  if (withForm) {
    const [top] = ranking(membersOf(set, party), val, party.content, first);
    return top === undefined ? 0 : valueOf(val, top.member, party.content, true);
  }
  const values = valuesOf(set, val, party, false);
  if (values.length === 0) return 0;
  return first === 'highest' ? Math.max(...values) : Math.min(...values);
}

/** Each of `members`' value of `val`, in Party order, `withForm` or as they are. */
function valuesOf(set: SetQuery, val: ValQuery, party: QueryParty, withForm: boolean): number[] {
  return membersOf(set, party).map((member) => valueOf(val, member, party.content, withForm));
}

/** `members` by their value of `val` as they are, the highest or the lowest first, the earlier in Party order on a tie. */
function ranking(
  members: readonly QueryMember[],
  val: ValQuery,
  content: QueryContent,
  first: 'highest' | 'lowest',
): { member: QueryMember; value: number }[] {
  const sign = first === 'highest' ? -1 : 1;
  return members
    .map((member, index) => ({ member, index, value: valueOf(val, member, content) }))
    .sort((a, b) => sign * (a.value - b.value) || a.index - b.index);
}

/** A member's effective value of the Stat `statKey`, or `withForm` their formed value (DL-284); 0 for a Stat content does not define. */
function statOf(member: QueryMember, statKey: string, withForm: boolean): number {
  const values = withForm ? member.formed : member.stats;
  return Object.hasOwn(values, statKey) ? (values[statKey] ?? 0) : 0;
}

/** The rating `hero` holds of the Skill `skillKey`; 0 when none, or for a Skill content does not define. */
function ratingOf(hero: Hero, skillKey: string, content: QueryContent): number {
  return Object.hasOwn(content.skills, skillKey) && Object.hasOwn(hero.skills, skillKey) ? (hero.skills[skillKey] ?? 0) : 0;
}
