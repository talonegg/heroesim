// What a Check reads, and how likely a Party is to pass it, in the CLI's words (v1.1.4-S5, DL-148
// items 15 and 16): the engine's typed account of a Query (`describeQuery`) worded, "Strength of the
// Warrior with the highest Strength", and a chance band's key as the word DL-148 item 15 gives it. The
// page words them the same (web/src/state/query-words.ts). Words only; no rule. From v1.1.4-S6,
// `show board` gives each Encounter's Checks and what they read (`encounterReadings`) and "Your best
// Party", and `preview` each chance in a word with its percentage floored to 5 (`shownPercent`).

import {
  describeQuery,
  type ChanceBand,
  type ContentSet,
  type EncounterKind,
  type PredAccount,
  type Quest,
  type QueryAccount,
  type SetAccount,
  type ValAccount,
} from '@heroesim/engine';
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
export type QueryNames = Pick<ContentSet, 'stats' | 'skills' | 'classes' | 'backgrounds' | 'heroTraits'>;

/**
 * A chance as the detail gives it (DL-148 item 15, v1.1.4-S6): its percentage floored to a multiple
 * of 5, and held within 5 to 95 unless the chance is 0 or 1, so that "95%" is never certain and "5%"
 * never impossible. Every chance band starts at a multiple of 5 (`chanceBands`), so the number
 * always falls in its word's band (v1.1.4-S6's verification, DL-157): 0.64 is "Even, 60%", never
 * "Even, 65%". The multiple is found against `k / 20`, as a band's start is written, not by
 * `Math.floor(chance × 20)` alone, whose product can round across a start.
 */
export function shownPercent(chance: number): number {
  if (chance <= 0) return 0;
  if (chance >= 1) return 100;
  let twentieths = Math.floor(chance * 20);
  if ((twentieths + 1) / 20 <= chance) twentieths += 1;
  if (twentieths / 20 > chance) twentieths -= 1;
  return Math.min(95, Math.max(5, twentieths * 5));
}

/** One of a Quest's Encounters as the Board shows it (v1.1.4-S6, DL-148 item 16): each Check's name and what it reads. */
export interface EncounterReading {
  encounterKey: string;
  name: string;
  /** Its kind; `null` for an Encounter content does not define, which reads nothing. */
  kind: EncounterKind | null;
  /** Each Check, in the Encounter's order: its key, its name, and what its score reads (`queryWords`), to stand in a sentence. */
  checks: { key: string; name: string; reads: string }[];
}

/**
 * `quest`'s Encounters, drawn when it was posted, in the order it meets them, each with its Checks'
 * names and what they read (v1.1.4-S6); none while they are drawn on the way. An Encounter content
 * does not define is named by its key and reads nothing (data-model rule 5).
 */
export function encounterReadings(quest: Pick<Quest, 'encounterKeys'>, content: QueryNames & Pick<ContentSet, 'encounters'>): EncounterReading[] {
  return quest.encounterKeys.map((encounterKey) => {
    const encounter = Object.hasOwn(content.encounters, encounterKey) ? content.encounters[encounterKey] : undefined;
    return {
      encounterKey,
      name: encounter?.name ?? encounterKey,
      kind: encounter?.kind ?? null,
      checks: (encounter?.checks ?? []).map((it) => ({ key: it.key, name: it.name, reads: queryWords(describeQuery(it.score), content) })),
    };
  });
}

/** Whether `reading` is one Check named as its Encounter is, as an Encounter in the old form loads: its line says what it reads. */
export function readsAsOne(reading: EncounterReading): boolean {
  return reading.checks.length === 1 && reading.checks[0]?.name === reading.name;
}

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
        const trait = nameIn(names.heroTraits, it.traitKey);
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
        // In the Party; among a Set less than it (v1.1.4-S9's verification, DL-162).
        const among = of === 'the Party' ? 'in' : 'among';
        return { sum: `the total ${value} of ${of}`, avg: `the average ${value} of ${of}`, max: `the highest ${value} ${among} ${of}`, min: `the lowest ${value} ${among} ${of}` }[it.aggregate];
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
