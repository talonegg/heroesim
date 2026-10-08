// What content's checks find wrong with a Query (v1.1.4-S1, DL-148 items 4 to 6, ADR-0010), held by
// the engine beside its operators (DL-186 item 6, DL-196): content's checker calls
// `queryProblems` and holds no table of its own. A Query is held to its type at every node, by each
// operator's signature in the table (operators.ts), to the keys content defines, and to a size; Sex
// is held to filters, so that it decides who takes part and never a value; and a Check's score read
// with form turns no Stat a Hero adds against itself. Every problem names the Query's path, each
// argument by its place in its array, as `encounters.<key>.checks.0.score.1.2`. The page never
// checks a Query, so none of this module is in its script.

import type { NumQuery, ValQuery } from '../../content-types.js';
import { rowOf } from '../../document.js';
import { sexes } from '../../generators/draw.js';
import { operators, type OperatorOf, type QueryArgument, type QueryType, type Signature } from './operators.js';

/** The most nodes a Query may hold: each operator, each number and each `"party"` (v1.1.4-S1). */
export const queryNodesMax = 64;

/** How deep a Query may nest, an operator's node one below it (v1.1.4-S1). */
export const queryDepthMax = 12;

/** The keys a Query may name: content's Hero Stats, Skills, Classes, Hero Backgrounds and Hero Traits. */
export interface QueryKeys {
  heroStats: ReadonlySet<string>;
  skills: ReadonlySet<string>;
  classes: ReadonlySet<string>;
  heroBackgrounds: ReadonlySet<string>;
  heroTraits: ReadonlySet<string>;
}

/**
 * Where a Query stands in content, which sets its type and what it may read:
 * - `score`, a Check's score: a Num, read with each Hero's form (v1.1.4-S3), so it turns no Stat a
 *   Hero adds against itself; Sex may filter it.
 * - `raw score`, a raw Check's score: a Num read without form, so held to its type, keys and size
 *   alone; Sex may filter it.
 * - `requirement`, a Synergy's requirement: a condition on the Party, and a gate, so that any reading
 *   of Sex in it would be a value, and Sex stands nowhere in it (DL-151's verification).
 * - `among`, an Injury's, a Death's or an earned Trait's `among` (v1.1.4-S4, v1.1.4-S7): a Set, which
 *   Sex may filter, since it decides who takes part in the harm.
 */
export type QueryPlace = 'score' | 'raw score' | 'requirement' | 'among';

/**
 * Every problem with `query`, standing at `place` and named `where` (its path in content), in the
 * order found: each node an operator of its type with its arguments, or a number where a Val or a
 * Num stands, or `"party"` where a Set does; each key one of `keys`; at most `queryNodesMax` nodes
 * and `queryDepthMax` deep; `["sex", …]` only as a filter's Pred, and never in a requirement; no Set
 * filtered by Sex counted, by `count` or by a value that reads nothing of a Hero; and, in a `score`,
 * no Stat a Hero adds turned against the score. None when it is sound.
 */
export function queryProblems(query: unknown, place: QueryPlace, keys: QueryKeys, where: string): string[] {
  const problems: string[] = [];
  const type: QueryType = place === 'requirement' ? 'condition' : place === 'among' ? 'set' : 'num';
  const { nodes, depth } = queryNode(where, query, type, { keys, sexFilters: place !== 'requirement' }, problems);
  if (nodes > queryNodesMax) problems.push(`${where} has ${nodes} nodes; a Query has at most ${queryNodesMax}`);
  if (depth > queryDepthMax) problems.push(`${where} is ${depth} deep; a Query is at most ${queryDepthMax} deep`);
  if (place === 'score') checkInversions(where, query, 'num', problems);
  return problems;
}

const typeNames: Readonly<Record<QueryType, string>> = {
  set: 'a Set',
  hero: 'a Hero',
  val: 'a Val',
  pred: 'a Pred',
  num: 'a Num',
  condition: 'a condition on the Party',
};

/** The keys a Query may name, and whether Sex may filter it at all. */
interface Allowed {
  keys: QueryKeys;
  sexFilters: boolean;
}

/** What a Query's node comes to, for the checks above it. */
interface QueryShape {
  nodes: number;
  depth: number;
  /** A Set, or the Hero of one, filtered by Sex somewhere within. */
  bySex: boolean;
  /**
   * A Val that reads something of the Hero: not a number alone, nor a read of the Hero only times a
   * literal 0, nor a `weighted` of no weight but 0.
   */
  readsHero: boolean;
}

const leaf: QueryShape = { nodes: 1, depth: 1, bySex: false, readsHero: false };

/** A signature read: the arguments always taken, those that may be left out, and the kind of which one or more may follow. */
interface Arguments {
  fixed: readonly QueryArgument[];
  optional: readonly QueryArgument[];
  rest: QueryArgument | undefined;
}

/** `signature` as the arguments it takes. */
function argumentsOf(signature: Signature): Arguments {
  const fixed: QueryArgument[] = [];
  const optional: QueryArgument[] = [];
  let rest: QueryArgument | undefined;
  for (const slot of signature) {
    if (slot.endsWith('...')) rest = slot.slice(0, -'...'.length) as QueryArgument;
    else if (slot.endsWith('?')) optional.push(slot.slice(0, -'?'.length) as QueryArgument);
    else fixed.push(slot as QueryArgument);
  }
  return { fixed, optional, rest };
}

/** The signature of `type`'s operator `operator`, its own row's; `undefined` when `type` has none of that name. */
function signatureOf(type: QueryType, operator: string): Signature | undefined {
  return rowOf<{ signature: Signature }>(operators[type], operator)?.signature;
}

/** Whether `operator` is one of `type`'s. */
function isOperatorOf<Type extends 'val' | 'num'>(type: Type, operator: unknown): operator is keyof (typeof operators)[Type] {
  return typeof operator === 'string' && signatureOf(type, operator) !== undefined;
}

/** One node of a Query, and every node below it. */
function queryNode(where: string, query: unknown, type: QueryType, allowed: Allowed, problems: string[]): QueryShape {
  if (typeof query === 'number') {
    if (type !== 'val' && type !== 'num') problems.push(`${where} is ${query}; a number stands for a Val or a Num, not ${typeNames[type]}`);
    else if (!Number.isFinite(query)) problems.push(`${where} is ${query}; a number in a Query is finite`);
    return leaf;
  }
  if (query === 'party') {
    if (type !== 'set') problems.push(`${where} is "party", a Set; ${typeNames[type]} stands here`);
    return leaf;
  }
  const [operator, ...args] = Array.isArray(query) ? (query as unknown[]) : [];
  if (typeof operator !== 'string') {
    problems.push(`${where} is ${JSON.stringify(query)}; expected ${typeNames[type]}, a list with its operator first`);
    return leaf;
  }
  const signature = signatureOf(type, operator);
  if (signature === undefined) {
    problems.push(`${where}: ${misplaced(operator, type)}`);
    return leaf;
  }
  const { fixed, optional, rest } = argumentsOf(signature);
  const most = rest === undefined ? fixed.length + optional.length : Infinity;
  const least = rest === undefined ? fixed.length : fixed.length + 1;
  if (args.length < least || args.length > most) {
    problems.push(`${where}: "${operator}" takes ${arity(least, most)}; it has ${args.length}`);
    return leaf;
  }
  const shapes = args.map((arg, index) => {
    const kind = fixed[index] ?? optional[index - fixed.length] ?? rest ?? 'num';
    return queryArgument(`${where}.${index + 1}`, arg, kind, operator, allowed, problems);
  });
  const below = shapes.filter((shape): shape is QueryShape => shape !== null);
  const shape: QueryShape = {
    nodes: 1 + below.reduce((total, it) => total + it.nodes, 0),
    depth: 1 + Math.max(0, ...below.map((it) => it.depth)),
    bySex: below.some((it) => it.bySex),
    readsHero: type === 'val' && readsHero(operator as OperatorOf<ValQuery>, args, below),
  };
  if (operator === 'sex') {
    if (!allowed.sexFilters) {
      problems.push(`${where}: ["sex", …] stands in no Synergy's requirement: a requirement is a condition on the Party, and Sex decides only who takes part in a Check (DL-148 item 6)`);
    }
    return { ...shape, bySex: true };
  }
  if (type === 'set' || type === 'hero' || type === 'pred') return shape;
  // A Num of a Set (or of its Hero) filtered by Sex: counted, if it reads nothing of a Hero.
  const [of, value] = below;
  if (type === 'num' && of?.bySex === true && (operator === 'count' || value?.readsHero === false)) {
    problems.push(`${where}: a Set filtered by Sex is counted; Sex decides who takes part, never a number (DL-148 item 6)`);
  }
  return { ...shape, bySex: false };
}

/**
 * Whether a Val node of `operator` reads something of the Hero: an operand of `+` or `-` that does; a
 * product with one that does and no literal 0 among its factors; a `weighted` with a weight other than
 * 0; and every other operator, which reads the Hero itself.
 */
function readsHero(operator: OperatorOf<ValQuery>, args: readonly unknown[], below: readonly QueryShape[]): boolean {
  switch (operator) {
    case '+':
    case '-':
      return below.some((it) => it.readsHero);
    case '*':
      return !args.includes(0) && below.some((it) => it.readsHero);
    case 'weighted': {
      const [pairs] = args;
      return Array.isArray(pairs) && pairs.some((pair: unknown) => !Array.isArray(pair) || pair[1] !== 0);
    }
    case 'stat':
    case 'skill':
    case 'level':
    case 'morale':
    case 'age':
      return true;
  }
}

/** One argument of `operator`: a Query of its type, with its shape, or a key or number checked here, with none. */
function queryArgument(
  where: string,
  arg: unknown,
  kind: QueryArgument,
  operator: string,
  allowed: Allowed,
  problems: string[],
): QueryShape | null {
  const { keys } = allowed;
  const key = (known: ReadonlySet<string>, what: string): null => {
    if (typeof arg !== 'string' || !known.has(arg)) problems.push(`${where}: ${JSON.stringify(arg)} is not ${what}`);
    return null;
  };
  switch (kind) {
    case 'stat':
      return key(keys.heroStats, 'a Hero Stat');
    case 'skill':
      return key(keys.skills, 'a Skill');
    case 'class':
      return key(keys.classes, 'a Class');
    case 'background':
      return key(keys.heroBackgrounds, 'a Hero Background');
    case 'trait':
      return key(keys.heroTraits, 'a Hero Trait');
    case 'sex':
      return key(new Set<string>(sexes), `a sex: ${sexes.join(' or ')}`);
    case 'heroes':
      if (!(Number.isInteger(arg) && (arg as number) >= 1)) {
        problems.push(`${where} is ${JSON.stringify(arg)}; ${operator}'s n is a whole number from 1`);
      }
      return null;
    case 'rating':
      if (!(Number.isInteger(arg) && (arg as number) >= 1)) {
        problems.push(`${where} is ${JSON.stringify(arg)}; has-skill's least rating is a whole number from 1`);
      }
      return null;
    case 'weights':
      if (!Array.isArray(arg) || arg.length === 0) {
        problems.push(`${where} is ${JSON.stringify(arg)}; ranked's weights are a list of one or more`);
        return null;
      }
      arg.forEach((weight: unknown, index) => {
        if (!(typeof weight === 'number' && Number.isFinite(weight) && weight >= 0)) {
          problems.push(`${where}.${index} is ${String(weight)}; a weight is a finite number of 0 or more`);
        }
      });
      return null;
    case 'pairs':
      if (!Array.isArray(arg) || arg.length === 0) {
        problems.push(`${where} is ${JSON.stringify(arg)}; weighted's Stats are a list of one or more [Stat, weight] pairs`);
        return null;
      }
      arg.forEach((pair: unknown, index) => {
        const [statKey, weight, ...more] = Array.isArray(pair) ? (pair as unknown[]) : [];
        if (!Array.isArray(pair) || more.length > 0 || !(typeof weight === 'number' && Number.isFinite(weight))) {
          problems.push(`${where}.${index} is ${JSON.stringify(pair)}; expected a [Stat, weight] pair, the weight a finite number`);
        } else if (typeof statKey !== 'string' || !keys.heroStats.has(statKey)) {
          problems.push(`${where}.${index}.0: ${JSON.stringify(statKey)} is not a Hero Stat`);
        }
      });
      return null;
    default:
      return queryNode(where, arg, kind, allowed, problems);
  }
}

/** Why `operator` cannot stand where a Query of `type` is expected. */
function misplaced(operator: string, type: QueryType): string {
  if (operator === 'sex') return '["sex", …] stands only as the Pred of a where filter: Sex decides who takes part, never a value (DL-148 item 6)';
  const types = (Object.keys(operators) as QueryType[]).filter((it) => signatureOf(it, operator) !== undefined);
  if (types.length === 0) return `"${operator}" is not an operator of a Query`;
  return `"${operator}" makes ${types.map((it) => typeNames[it]).join(' or ')}, where ${typeNames[type]} is expected`;
}

/** How many arguments an operator takes, in words. */
function arity(least: number, most: number): string {
  const count = (n: number): string => (n === 0 ? 'no arguments' : n === 1 ? '1 argument' : `${n} arguments`);
  if (most === Infinity) return `${count(least)} or more`;
  return least === most ? count(least) : `${least} or ${most} arguments`;
}

/**
 * A Check's score turns no Stat a Hero adds against itself (v1.1.4-S3's verification, DL-154;
 * v1.1.4-S9 and its verification, DL-162; ADR-0010). Form scales each Stat a Hero adds into a score
 * (operators.ts), so a Stat that counts against the score would be scaled too, and a wound or low
 * spirits would raise the score.
 *
 * The walk carries the sign each node adds into the score with (its polarity) down to every `stat`
 * and `weighted` pair, multiplying it by the sign of each operand beside it (`signOf`): a `-` flips
 * its right operand, a `*` multiplies by its other operands, a `weighted` or `ranked` by its weights.
 * A Stat whose polarity may be negative is refused, naming the node that last turned it so:
 *
 * - a `-` whose right operand reads the Stat;
 * - a `weighted` that gives the Stat a negative weight;
 * - a `*` whose other operands are, or may be, negative (a count less a number, say);
 * - a `ranked` with a negative weight.
 *
 * So twice negated, a Stat counts for the score again, and is accepted. A raw Check, read without
 * form, and a Synergy's requirement, read as the Heroes are, are not held to it. Run on a score
 * `queryNode` has checked; a node of the wrong shape is that check's to refuse, and passed over here.
 */
function checkInversions(
  where: string,
  query: unknown,
  type: 'num' | 'val',
  problems: string[],
  polarity: Sign = positive,
  culprit = '',
): void {
  if (!Array.isArray(query)) return;
  const [operator, ...args] = query as unknown[];
  const inverts = 'form would then raise the score of a hurt or low-spirited Hero';
  const refuse = (problem: string): void => {
    if (!problems.includes(problem)) problems.push(problem);
  };
  // A child's culprit: this node, when it turned the polarity to one that may be negative; else the parent's.
  const turned = (child: Sign, problem: string): string => (child.down && !sameSign(child, polarity) ? problem : culprit);
  if (type === 'val' && operator === 'stat') {
    if (polarity.down) refuse(culprit);
    return;
  }
  if (type === 'val' && operator === 'weighted') {
    if (!Array.isArray(args[0])) return;
    (args[0] as unknown[]).forEach((pair, index) => {
      const [statKey, weight] = Array.isArray(pair) ? (pair as unknown[]) : [];
      if (typeof weight !== 'number') return;
      const child = times(polarity, signOfNumber(weight));
      if (child.down) refuse(turned(child, `${where}.1.${index}.1: weighted gives ${JSON.stringify(statKey)} a negative weight; ${inverts}`));
    });
    return;
  }
  const signs = operator === '*' ? args.map((arg) => signOf(arg, type)) : [];
  for (const [index, arg] of args.entries()) {
    const below = belowOf(operator, index, type);
    if (below === null) continue;
    let child = polarity;
    let problem = culprit;
    if (operator === '-' && index === 1) {
      child = flip(polarity);
      problem = turned(child, `${where}.2: "-" subtracts a Stat a Hero adds; ${inverts}`);
    } else if (operator === '*') {
      const others = signs.reduce<Sign>((product, sign, other) => (other === index ? product : times(product, sign)), positive);
      child = times(polarity, others);
      const by = others.down && !others.up ? 'a negative number' : 'a number that may be negative';
      problem = turned(child, `${where}: "*" multiplies a Stat a Hero adds by ${by}; ${inverts}`);
    } else if (operator === 'ranked') {
      child = times(polarity, signOfWeights(args[2]));
      problem = turned(child, `${where}.3: "ranked" gives a negative weight to a value that reads a Stat a Hero adds; ${inverts}`);
    }
    checkInversions(`${where}.${index + 1}`, arg, below, problems, child, problem);
  }
}

/** Whether a value may be above nought (`up`), and whether it may be below (`down`); a value of nought alone is neither. */
interface Sign {
  readonly up: boolean;
  readonly down: boolean;
}

const positive: Sign = { up: true, down: false };
const anySign: Sign = { up: true, down: true };
const nought: Sign = { up: false, down: false };
const flip = (sign: Sign): Sign => ({ up: sign.down, down: sign.up });
const times = (left: Sign, right: Sign): Sign => ({
  up: (left.up && right.up) || (left.down && right.down),
  down: (left.up && right.down) || (left.down && right.up),
});
const either = (left: Sign, right: Sign): Sign => ({ up: left.up || right.up, down: left.down || right.down });
const sameSign = (left: Sign, right: Sign): boolean => left.up === right.up && left.down === right.down;
const signOfNumber = (value: number): Sign => ({ up: value > 0, down: value < 0 });

/** The signs a list of weights may give: each weight's, together; any sign when it is not a list of numbers. */
function signOfWeights(weights: unknown): Sign {
  if (!Array.isArray(weights)) return anySign;
  return (weights as unknown[]).reduce<Sign>((sign, weight) => either(sign, typeof weight === 'number' ? signOfNumber(weight) : anySign), nought);
}

/**
 * The signs `query`, a Num or a Val, may take for any Party: a constant's own; a Stat, a Skill
 * rating, Level, Morale, age and a count are never below nought; sums, differences, products and
 * the rest follow their operands. An operator of no row of its type may take any sign; each of a
 * row says its own, so a new operator's sign is declared here or this fails to compile.
 */
function signOf(query: unknown, type: 'num' | 'val'): Sign {
  const constant = constantOf(query);
  if (constant !== null) return signOfNumber(constant);
  if (!Array.isArray(query)) return anySign;
  const [operator, ...args] = query as unknown[];
  if (type === 'val') return isOperatorOf('val', operator) ? signOfVal(operator, args) : anySign;
  return isOperatorOf('num', operator) ? signOfNum(operator, args) : anySign;
}

/** The signs a Val of `operator` may take, its arguments `args`. */
function signOfVal(operator: OperatorOf<ValQuery>, args: readonly unknown[]): Sign {
  switch (operator) {
    case '+':
    case '-':
    case '*':
      return signOfArithmetic(operator, args, 'val');
    case 'stat':
    case 'skill':
    case 'level':
    case 'morale':
    case 'age':
      return positive;
    case 'weighted':
      return Array.isArray(args[0])
        ? signOfWeights((args[0] as unknown[]).map((pair) => (Array.isArray(pair) ? (pair as unknown[])[1] : undefined)))
        : anySign;
  }
}

/** The signs a Num of `operator` may take, its arguments `args`. */
function signOfNum(operator: OperatorOf<NumQuery>, args: readonly unknown[]): Sign {
  switch (operator) {
    case '+':
    case '-':
    case '*':
      return signOfArithmetic(operator, args, 'num');
    case 'count':
      return positive;
    case 'sum':
    case 'avg':
    case 'max':
    case 'min':
    case 'of':
      return signOf(args[1], 'val');
    case 'ranked':
      return times(signOf(args[1], 'val'), signOfWeights(args[2]));
    case 'least':
    case 'greatest':
      return args.reduce<Sign>((sign, arg) => either(sign, signOf(arg, 'num')), nought);
  }
}

/** The signs a sum, difference or product of `type`'s may take, from its operands'. */
function signOfArithmetic(operator: '+' | '-' | '*', args: readonly unknown[], type: 'num' | 'val'): Sign {
  switch (operator) {
    case '+':
      return args.reduce<Sign>((sign, arg) => either(sign, signOf(arg, type)), nought);
    case '-':
      return either(signOf(args[0], type), flip(signOf(args[1], type)));
    case '*':
      return args.reduce<Sign>((sign, arg) => times(sign, signOf(arg, type)), positive);
  }
}

/** The value of `query` when it is a number, or `+`, `-`, `*`, `least` or `greatest` of numbers alone; `null` when it reads anything else. */
function constantOf(query: unknown): number | null {
  if (typeof query === 'number') return query;
  if (!Array.isArray(query)) return null;
  const [operator, ...args] = query as unknown[];
  const values = args.map(constantOf);
  if (values.length === 0 || values.some((value) => value === null)) return null;
  const numbers = values as number[];
  switch (operator) {
    case '+':
      return numbers.reduce((sum, value) => sum + value, 0);
    case '-':
      return numbers.length === 2 ? (numbers[0] as number) - (numbers[1] as number) : null;
    case '*':
      return numbers.reduce((product, value) => product * value, 1);
    case 'least':
      return Math.min(...numbers);
    case 'greatest':
      return Math.max(...numbers);
    default:
      return null;
  }
}

/**
 * What the argument at `index` of a Num's or a Val's `operator` adds into its value: a Num, a Val, or
 * nothing (a Set, a Hero, a key, a weight). Every operand of a sum, difference or product, and of
 * `least` and `greatest`, however many it has; the Val of `sum`, `avg`, `max`, `min`, `ranked` and `of`.
 */
function belowOf(operator: unknown, index: number, type: 'num' | 'val'): 'num' | 'val' | null {
  if (type === 'val') return isOperatorOf('val', operator) ? valBelow(operator) : null;
  return isOperatorOf('num', operator) ? numBelow(operator, index) : null;
}

/** What each argument of a Val of `operator` adds into its value. */
function valBelow(operator: OperatorOf<ValQuery>): 'val' | null {
  switch (operator) {
    case '+':
    case '-':
    case '*':
      return 'val';
    case 'stat':
    case 'skill':
    case 'level':
    case 'morale':
    case 'age':
    case 'weighted':
      return null;
  }
}

/** What the argument at `index` of a Num of `operator` adds into its value. */
function numBelow(operator: OperatorOf<NumQuery>, index: number): 'num' | 'val' | null {
  switch (operator) {
    case '+':
    case '-':
    case '*':
    case 'least':
    case 'greatest':
      return 'num';
    case 'sum':
    case 'avg':
    case 'max':
    case 'min':
    case 'ranked':
    case 'of':
      return index === 1 ? 'val' : null;
    case 'count':
      return null;
  }
}
