// What a Check reads (v1.1.4-S5, DL-148 item 16, ADR-0010): a typed account of a Query, for the front
// ends to word ("Strength of the strongest Warrior"). The engine returns no prose (ADR-0003): each
// node of the account names what it is, what it aggregates, the Set it reads and its filters, the
// Stats it reads with their weights where it is a weighting, and the Skills, Classes, Backgrounds
// and Traits by key, which a front end names from content. Every operator a Query has
// (content-types.ts) has its node here. Pure: it reads only the Query.

import type {
  BackgroundKey,
  ClassKey,
  HeroQuery,
  NumQuery,
  PredQuery,
  QueryComparison,
  SetQuery,
  SkillKey,
  StatKey,
  TraitKey,
  ValQuery,
} from '../content-types.js';
import type { Sex } from '../document.js';

/** Some of the Party's Heroes. */
export type SetAccount =
  | { kind: 'party' }
  /** Those of `of` for whom `filter` holds. */
  | { kind: 'where'; of: SetAccount; filter: PredAccount }
  /** The `count` of `of` with the most (`top`) or the least (`bottom`) of `by`. */
  | { kind: 'top' | 'bottom'; of: SetAccount; count: number; by: ValAccount };

/** One Hero of a Set: the one with the most (`best`) or the least (`worst`) of `by`. */
export interface HeroAccount {
  kind: 'best' | 'worst';
  of: SetAccount;
  by: ValAccount;
}

/** A number read of one Hero. */
export type ValAccount =
  | { kind: 'number'; value: number }
  | { kind: 'stat'; statKey: StatKey }
  | { kind: 'skill'; skillKey: SkillKey }
  | { kind: 'level' | 'morale' | 'age' }
  /** The Stats it weighs, each with its weight, in the order written. */
  | { kind: 'weighted'; stats: { statKey: StatKey; weight: number }[] }
  | { kind: 'arithmetic'; operator: '+' | '-' | '*'; operands: ValAccount[] };

/** A fact of one Hero: a filter. */
export type PredAccount =
  | { kind: 'class'; classKeys: ClassKey[] }
  | { kind: 'background'; backgroundKeys: BackgroundKey[] }
  | { kind: 'sex'; sex: Sex }
  /** Holding `skillKey` at a rating of `atLeast` or more. */
  | { kind: 'has-skill'; skillKey: SkillKey; atLeast: number }
  | { kind: 'has-trait'; traitKey: TraitKey }
  | { kind: 'hurt' }
  | { kind: 'compare'; comparison: QueryComparison; left: ValAccount; right: ValAccount }
  | { kind: 'and' | 'or'; operands: PredAccount[] }
  | { kind: 'not'; operand: PredAccount };

/** A number of the Party: what a Check's score reads. */
export type QueryAccount =
  | { kind: 'number'; value: number }
  /** `value` of each Hero of `of`, summed, averaged, or the highest or lowest. */
  | { kind: 'aggregate'; aggregate: 'sum' | 'avg' | 'max' | 'min'; of: SetAccount; value: ValAccount }
  | { kind: 'count'; of: SetAccount }
  /** `value` of the Heroes of `of`, the highest first, each times its place's weight. */
  | { kind: 'ranked'; of: SetAccount; value: ValAccount; weights: number[] }
  /** `value` of one Hero. */
  | { kind: 'hero'; hero: HeroAccount; value: ValAccount }
  | { kind: 'arithmetic'; operator: '+' | '-' | '*' | 'least' | 'greatest'; operands: QueryAccount[] };

/** The account of `query`, a Num: a Check's score or a side of a Synergy's requirement. Throws on an operator no Num has. */
export function describeQuery(query: NumQuery): QueryAccount {
  if (typeof query === 'number') return { kind: 'number', value: query };
  switch (query[0]) {
    case 'sum':
    case 'avg':
    case 'max':
    case 'min':
      return { kind: 'aggregate', aggregate: query[0], of: setAccount(query[1]), value: valAccount(query[2]) };
    case 'count':
      return { kind: 'count', of: setAccount(query[1]) };
    case 'ranked':
      return { kind: 'ranked', of: setAccount(query[1]), value: valAccount(query[2]), weights: [...query[3]] };
    case 'of':
      return { kind: 'hero', hero: heroAccount(query[1]), value: valAccount(query[2]) };
    case '+':
    case '-':
    case '*':
    case 'least':
    case 'greatest':
      return { kind: 'arithmetic', operator: query[0], operands: (query.slice(1) as NumQuery[]).map(describeQuery) };
    default:
      return unknown(query, 'a Num');
  }
}

/** The account of `set`. */
function setAccount(set: SetQuery): SetAccount {
  if (set === 'party') return { kind: 'party' };
  switch (set[0]) {
    case 'where':
      return { kind: 'where', of: setAccount(set[1]), filter: predAccount(set[2]) };
    case 'top':
    case 'bottom':
      return { kind: set[0], of: setAccount(set[1]), count: set[2], by: valAccount(set[3]) };
    default:
      return unknown(set, 'a Set');
  }
}

/** The account of `hero`. */
function heroAccount(hero: HeroQuery): HeroAccount {
  const [kind, set, by] = hero;
  if (kind !== 'best' && kind !== 'worst') return unknown(hero, 'a Hero');
  return { kind, of: setAccount(set), by: valAccount(by) };
}

/** The account of `val`. */
function valAccount(val: ValQuery): ValAccount {
  if (typeof val === 'number') return { kind: 'number', value: val };
  switch (val[0]) {
    case 'stat':
      return { kind: 'stat', statKey: val[1] };
    case 'skill':
      return { kind: 'skill', skillKey: val[1] };
    case 'level':
    case 'morale':
    case 'age':
      return { kind: val[0] };
    case 'weighted':
      return { kind: 'weighted', stats: val[1].map(([statKey, weight]) => ({ statKey, weight })) };
    case '+':
    case '-':
    case '*':
      return { kind: 'arithmetic', operator: val[0], operands: (val.slice(1) as ValQuery[]).map(valAccount) };
    default:
      return unknown(val, 'a Val');
  }
}

/** The account of `pred`. */
function predAccount(pred: PredQuery): PredAccount {
  switch (pred[0]) {
    case 'class':
      return { kind: 'class', classKeys: pred.slice(1) as ClassKey[] };
    case 'background':
      return { kind: 'background', backgroundKeys: pred.slice(1) as BackgroundKey[] };
    case 'sex':
      return { kind: 'sex', sex: pred[1] };
    case 'has-skill':
      return { kind: 'has-skill', skillKey: pred[1], atLeast: pred[2] ?? 1 };
    case 'has-trait':
      return { kind: 'has-trait', traitKey: pred[1] };
    case 'hurt':
      return { kind: 'hurt' };
    case '>=':
    case '>':
    case '<':
    case '<=':
    case '=':
      return { kind: 'compare', comparison: pred[0], left: valAccount(pred[1]), right: valAccount(pred[2]) };
    case 'and':
    case 'or':
      return { kind: pred[0], operands: (pred.slice(1) as PredQuery[]).map(predAccount) };
    case 'not':
      return { kind: 'not', operand: predAccount(pred[1]) };
    default:
      return unknown(pred, 'a Pred');
  }
}

/**
 * Every Stat `account` reads, once each, in the order it names them: in what it adds up, in whom it
 * picks and by what, and in its filters (v1.1.4-S6: the Stats the Party builder shows each Hero's
 * value of, `statsRead`).
 */
export function statsIn(account: QueryAccount): StatKey[] {
  const found: StatKey[] = [];
  const add = (statKey: StatKey): void => {
    if (!found.includes(statKey)) found.push(statKey);
  };
  const val = (it: ValAccount): void => {
    if (it.kind === 'stat') add(it.statKey);
    else if (it.kind === 'weighted') for (const { statKey } of it.stats) add(statKey);
    else if (it.kind === 'arithmetic') it.operands.forEach(val);
  };
  const pred = (it: PredAccount): void => {
    if (it.kind === 'compare') [it.left, it.right].forEach(val);
    else if (it.kind === 'and' || it.kind === 'or') it.operands.forEach(pred);
    else if (it.kind === 'not') pred(it.operand);
  };
  const set = (it: SetAccount): void => {
    if (it.kind === 'party') return;
    set(it.of);
    if (it.kind === 'where') pred(it.filter);
    else val(it.by);
  };
  const num = (it: QueryAccount): void => {
    switch (it.kind) {
      case 'number':
        return;
      case 'aggregate':
      case 'ranked':
        set(it.of);
        return val(it.value);
      case 'count':
        return set(it.of);
      case 'hero':
        set(it.hero.of);
        val(it.hero.by);
        return val(it.value);
      case 'arithmetic':
        return it.operands.forEach(num);
    }
  };
  num(account);
  return found;
}

/** Throws on an operator no type has: content validation refuses it, so only a Query built in memory reaches here. */
function unknown(query: unknown, type: string): never {
  throw new RangeError(`${JSON.stringify(query)} is not ${type} Query`);
}
