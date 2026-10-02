// The Query evaluator (v1.1.4-S1, ADR-0010, DL-148 items 4 to 6): how a Check's score and a
// Synergy's requirements read the Party. A Query is content, a JSON array operator first
// (content-types.ts, `NumQuery` and the four types it is built of); this file only evaluates it, so
// a new way to read the Party is a content change unless it needs a new operator (ADR-0006).
//
// It is pure and draws nothing. The Party is the members still in the sequence, in Party order
// (`queryParty`), each Hero's effective Stats read once, through `effectiveStats`, when the Party is
// taken for an Encounter. Ties in `best`, `worst`, `top`, `bottom` and `ranked` go to the earlier
// Hero in Party order, and sums run in Party order, so the same Party always reads the same to the
// last bit. An empty Set gives 0 to every Num, and no Hero gives 0. A Stat, Skill, Class, Background
// or Trait that content no longer defines reads 0 or matches no one (data-model rule 5).
//
// It reads only the Party's own Heroes and their state on the Quest: never the Guild's leader nor
// the Guild's dealings (M4's third risk; the Check's test reads this file to hold it so), nor Regard
// between particular Heroes (DL-148 item 5).
//
// Form (v1.1.4-S3, DL-148 items 9 to 11, form.ts). A Check's score is read with each Hero's form
// (`evaluate`'s `withForm`), a Synergy's requirements without. With form, only the Stat values a Hero
// adds into the score are scaled: each `stat`, and each Stat within a `weighted` and within the `+`,
// `-` and `*` of Vals, is times its Hero's form; a number, a Skill rating, Level, Morale and age are
// not. Every choice of a Hero reads them unscaled: `best`, `worst`, `top`, `bottom`, `ranked`'s order,
// and the Hero whose value `max` or `min` adds, which are `of best` and `of worst`. So do every filter
// and every count. A hurt Warrior is still the strongest Warrior, and adds less.

import type { EngineDeps } from '../config.js';
import type {
  ContentSet,
  HeroQuery,
  NumQuery,
  PartyCondition,
  PredQuery,
  QueryComparison,
  SetQuery,
  ValQuery,
} from '../content-types.js';
import type { Hero, HeroId, StatValues, World } from '../document.js';
import { effectiveStats } from '../selectors.js';
import { ageOf } from '../time.js';
import { formOf, workingMorale } from './form.js';

/** One member of the Party as a Query reads them on an Encounter. */
export interface QueryMember {
  hero: Hero;
  /** Their effective Stats (`effectiveStats`), read once when the Party is taken. */
  stats: StatValues;
  /** Their Morale on the Quest (`workingMorale`): what `["morale"]` reads, and what sets their form's band. */
  morale: number;
  /** Their age in whole years at the Turn the Party is taken (`ageOf`). */
  age: number;
  /** Whether they are hurt on this Quest: what `["hurt"]` reads. */
  hurt: boolean;
  /** Their form (v1.1.4-S3, `formOf`): the factor on the Stat values they add into a Check's score. */
  form: number;
}

/** What has happened to the Party on the Quest so far, as the Queries read it (v1.1.4-S3). */
export interface OnQuest {
  /** The Heroes hurt earlier on the Quest; none when absent. */
  hurt?: ReadonlySet<HeroId>;
  /**
   * The Morale consequences applied so far to each Hero, by id: their own since v1.1.4-S4, a loss
   * `steadiedBy` their Stats being less for some (harm.ts). 0 for a Hero absent, and for all when absent.
   */
  moraleByHero?: Readonly<Record<HeroId, number>>;
}

/** What a Query reads of content: whether a key it names is still defined. */
export type QueryContent = Pick<ContentSet, 'skills' | 'classes' | 'backgrounds' | 'traits'>;

/** The Party a Query is evaluated over: its members in Party order, and the content they are read by. */
export interface QueryParty {
  members: readonly QueryMember[];
  content: QueryContent;
}

/**
 * `heroes`, the members still in the sequence in Party order, as Queries read them on one Encounter:
 * each Hero's effective Stats read once (`effectiveStats`); their Morale on the Quest, their stored
 * Morale plus their own of `onQuest.moraleByHero` held to the scale (`workingMorale`); their age at `world.turn`;
 * whether `onQuest.hurt` holds their id; and their form from those two (`formOf`, v1.1.4-S3). With
 * nothing `onQuest`, the Party as it sets out.
 */
export function queryParty(
  heroes: readonly Hero[],
  world: World,
  deps: Pick<EngineDeps, 'config' | 'content'>,
  onQuest: OnQuest = {},
): QueryParty {
  const { config, content } = deps;
  const { hurt = new Set(), moraleByHero = {} } = onQuest;
  return {
    members: heroes.map((hero) => {
      const delta = Object.hasOwn(moraleByHero, hero.id) ? (moraleByHero[hero.id] ?? 0) : 0;
      const morale = workingMorale(hero.morale, delta, config);
      const isHurt = hurt.has(hero.id);
      return {
        hero,
        stats: effectiveStats(hero, world, content),
        morale,
        age: ageOf(hero, world.turn, config),
        hurt: isHurt,
        form: formOf(morale, isHurt, config),
      };
    }),
    content,
  };
}

/**
 * `query`'s value for `party`: a number of the Party, 0 for an empty Set or no Hero. `withForm`, for
 * a Check's score (v1.1.4-S3), scales each Stat value a Hero adds into it by their form; without it,
 * as for a Synergy's requirements, every Hero is read as they are.
 */
export function evaluate(query: NumQuery, party: QueryParty, withForm = false): number {
  if (typeof query === 'number') return query;
  switch (query[0]) {
    case 'sum':
      return valuesOf(query[1], query[2], party, withForm).reduce((total, value) => total + value, 0);
    case 'avg': {
      const values = valuesOf(query[1], query[2], party, withForm);
      return values.length === 0 ? 0 : values.reduce((total, value) => total + value, 0) / values.length;
    }
    case 'max':
    case 'min': {
      if (withForm) {
        // The Hero `of best` or `of worst` would choose, as they are, adds their value with their form.
        const [first] = ranking(membersOf(query[1], party), query[2], party.content, query[0] === 'max' ? 'highest' : 'lowest');
        return first === undefined ? 0 : valueOf(query[2], first.member, party.content, true);
      }
      const values = valuesOf(query[1], query[2], party, false);
      if (values.length === 0) return 0;
      return query[0] === 'max' ? Math.max(...values) : Math.min(...values);
    }
    case 'count':
      return membersOf(query[1], party).length;
    case 'ranked': {
      const [, set, val, weights] = query;
      const ranked = ranking(membersOf(set, party), val, party.content, 'highest');
      const added = ({ member, value }: { member: QueryMember; value: number }): number =>
        withForm ? valueOf(val, member, party.content, true) : value;
      return ranked.slice(0, weights.length).reduce((total, it, index) => total + (weights[index] ?? 0) * added(it), 0);
    }
    case 'of': {
      const member = heroOf(query[1], party);
      return member === undefined ? 0 : valueOf(query[2], member, party.content, withForm);
    }
    case '+':
      return query.slice(1).reduce<number>((total, operand) => total + evaluate(operand as NumQuery, party, withForm), 0);
    case '-':
      return evaluate(query[1], party, withForm) - evaluate(query[2], party, withForm);
    case '*':
      return query.slice(1).reduce<number>((total, operand) => total * evaluate(operand as NumQuery, party, withForm), 1);
    case 'least':
      return Math.min(...query.slice(1).map((operand) => evaluate(operand as NumQuery, party, withForm)));
    case 'greatest':
      return Math.max(...query.slice(1).map((operand) => evaluate(operand as NumQuery, party, withForm)));
    default:
      return unknownOperator(query, 'a Num');
  }
}

/** Whether `condition` holds for `party`: its two Nums compared. */
export function holds(condition: PartyCondition, party: QueryParty): boolean {
  const [comparison, left, right] = condition;
  return compare(comparison, evaluate(left, party), evaluate(right, party));
}

/** The members `set` names, in Party order. */
export function membersOf(set: SetQuery, party: QueryParty): QueryMember[] {
  if (set === 'party') return [...party.members];
  switch (set[0]) {
    case 'where':
      return membersOf(set[1], party).filter((member) => is(set[2], member, party.content));
    case 'top':
    case 'bottom': {
      const [operator, inner, count, val] = set;
      const within = membersOf(inner, party);
      const chosen = new Set(ranking(within, val, party.content, operator === 'top' ? 'highest' : 'lowest').slice(0, count).map((it) => it.member));
      return within.filter((member) => chosen.has(member));
    }
    default:
      return unknownOperator(set, 'a Set');
  }
}

/** The member `query` names: the best or worst of its Set by its Val, the earlier on a tie; none of an empty Set. */
export function heroOf(query: HeroQuery, party: QueryParty): QueryMember | undefined {
  const [operator, set, val] = query;
  if (operator !== 'best' && operator !== 'worst') return unknownOperator(query, 'a Hero');
  return ranking(membersOf(set, party), val, party.content, operator === 'best' ? 'highest' : 'lowest')[0]?.member;
}

/**
 * `query`'s value for `member`: a number read of the one Hero. `withForm`, for a value they add into a
 * Check's score (v1.1.4-S3), scales each Stat it reads by their form, within a `weighted` and an
 * arithmetic Val too; a number, a Skill rating, Level, Morale and age are read as they are.
 */
export function valueOf(query: ValQuery, member: QueryMember, content: QueryContent, withForm = false): number {
  if (typeof query === 'number') return query;
  switch (query[0]) {
    case 'stat':
      return statOf(member, query[1], withForm);
    case 'skill':
      return ratingOf(member.hero, query[1], content);
    case 'level':
      return member.hero.level;
    case 'morale':
      return member.morale;
    case 'age':
      return member.age;
    case 'weighted':
      return query[1].reduce((total, [statKey, weight]) => total + weight * statOf(member, statKey, withForm), 0);
    case '+':
      return query.slice(1).reduce<number>((total, operand) => total + valueOf(operand as ValQuery, member, content, withForm), 0);
    case '-':
      return valueOf(query[1], member, content, withForm) - valueOf(query[2], member, content, withForm);
    case '*':
      return query.slice(1).reduce<number>((total, operand) => total * valueOf(operand as ValQuery, member, content, withForm), 1);
    default:
      return unknownOperator(query, 'a Val');
  }
}

/** Whether `query` holds of `member`. */
export function is(query: PredQuery, member: QueryMember, content: QueryContent): boolean {
  const { hero } = member;
  switch (query[0]) {
    case 'class':
      return Object.hasOwn(content.classes, hero.classKey) && query.slice(1).includes(hero.classKey);
    case 'background':
      return Object.hasOwn(content.backgrounds, hero.backgroundKey) && query.slice(1).includes(hero.backgroundKey);
    case 'sex':
      return hero.sex === query[1];
    case 'has-skill':
      return ratingOf(hero, query[1], content) >= (query[2] ?? 1);
    case 'has-trait':
      return Object.hasOwn(content.traits, query[1]) && hero.traits.includes(query[1]);
    case 'hurt':
      return member.hurt;
    case '>=':
    case '>':
    case '<':
    case '<=':
    case '=':
      return compare(query[0], valueOf(query[1], member, content), valueOf(query[2], member, content));
    case 'and':
      return query.slice(1).every((operand) => is(operand as PredQuery, member, content));
    case 'or':
      return query.slice(1).some((operand) => is(operand as PredQuery, member, content));
    case 'not':
      return !is(query[1], member, content);
    default:
      return unknownOperator(query, 'a Pred');
  }
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

/** A member's effective value of the Stat `statKey`, times their form `withForm`; 0 for a Stat content does not define. */
function statOf(member: QueryMember, statKey: string, withForm: boolean): number {
  const value = Object.hasOwn(member.stats, statKey) ? (member.stats[statKey] ?? 0) : 0;
  return withForm ? value * member.form : value;
}

/** The rating `hero` holds of the Skill `skillKey`; 0 when none, or for a Skill content does not define. */
function ratingOf(hero: Hero, skillKey: string, content: QueryContent): number {
  return Object.hasOwn(content.skills, skillKey) && Object.hasOwn(hero.skills, skillKey) ? (hero.skills[skillKey] ?? 0) : 0;
}

/** Throws on an operator no type has: content validation refuses it, so only a set built in memory reaches here. */
function unknownOperator(query: unknown, type: string): never {
  throw new RangeError(`${JSON.stringify(query)} is not ${type} Query`);
}
