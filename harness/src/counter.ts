// A harness counter, declared once (DL-239): how a game gives it, where the sweep's total of it starts,
// how each game folds into that total, what kind of number it is, and its lines in the play report.
// The play loop's observers gather what a game is seen to do (`play.ts`), the sweep folds every game's
// counters by their declarations (`sweepTotals`), the report renders their lines (`play-report.ts`),
// and `compare` and the module report read their kinds. A counter added to a list of declarations
// reaches every one of those with nothing else written. The core's counters are `gameCounters`
// (`game-counters.ts`).

import type { EngineDeps, WorldDocument } from '@heroesim/engine';
import type { RivalAfternoons } from './counters.js';
import type { SweepTotals } from './game-counters.js';
import type { DocumentMeasures, GameRecord, PlayObserver } from './play.js';
import type { PlaySweep } from './sweep.js';

/**
 * What a counter is (DL-239), which `compare` and the module report read:
 * - `play`, what the games did: a play-neutral story leaves every one as it was (DL-231 Q2);
 * - `measure`, a size of what the games wrote, which a change of the save's shape or of its
 *   `meta.config` moves while no play counter does (DL-205): `compare` lists one apart;
 * - `timing`, which differs between two runs of the same game, as a copy's time does (DL-203):
 *   `compare` and the module report leave it out, as they leave out the run's timings;
 * - `module`, a module's own, empty with no module installed (DL-78): the module report states it
 *   apart from the core's counters, and `compare` leaves it out.
 */
export type CounterKind = 'play' | 'measure' | 'timing' | 'module';

/** The kinds the module report counts as the core's (DL-78): `compare` lists the measures apart. */
export const coreKinds: readonly CounterKind[] = ['play', 'measure'];

/**
 * How a game's number folds into the sweep's total: `sum` adds it, `greatest` keeps the greater, and
 * `joined` keeps each game's numbers, a list of them joined into one list (for the report's medians and
 * maxima). A list's entries fold by index, a record's by key.
 */
export type Fold = 'sum' | 'greatest' | 'joined';

/** What the play loop saw that no entry of the History records (M5, DL-62; M6, DL-69). */
export interface Seen {
  /** The difficulty of each Quest the policy's Guild took, by Quest id, read as it dispatched. */
  playerQuestDifficulty?: ReadonlyMap<string, number>;
  /** The Rivals' afternoons as each `advance` began. */
  afternoons?: RivalAfternoons;
}

/** A counter's observer of one game: the moments it watches, and the game's value once it has stopped. */
export interface Gatherer<Game> extends PlayObserver {
  /** Once the game's last save is measured, what a counter of the save reads of it (its gzipped length). */
  measured?(measures: DocumentMeasures): void;
  value(): Game;
}

/** What the totals of a sweep are read with: its length in years, and a year's Turns. */
export interface TotalsSweep {
  years: number;
  turnsPerYear: number;
}

/** The play report's sections a counter's lines stand in, in the report's order (`play-report.ts`). */
export const sections = ['counters', 'progression', 'quest-engine', 'items', 'rivals', 'contracts', 'fatigue', 'portraits', 'heroes', 'worlds'] as const;

export type Section = (typeof sections)[number];

/** What a counter's report lines may read beside the totals: the rules and content played, and the sweep. */
export interface ReportContext {
  deps: EngineDeps;
  sweep: PlaySweep;
}

/**
 * One counter (DL-239). It is gathered one way: read from a game's History once the game has stopped
 * (`read`, a value of the record's `counters`), or by an observer of its own as the game is played
 * (`observe`, a value of its `observations`); a counter with neither is read from the game's record by
 * its `total`. A counter with a `zero` is totalled over the sweep; one without is the game's alone (its
 * ending and last Turn, which other counters total). The callbacks are written as methods so that a
 * declaration reads its own types.
 */
export interface Counter<Game = unknown, Total = unknown> {
  /** Its key in a game's record and in the sweep's totals. */
  readonly key: string;
  readonly kind: CounterKind;
  /** Read from the History once the game has stopped, with what the loop saw (`seen`). */
  read?(document: WorldDocument, deps: EngineDeps, seen: Seen): Game;
  /** Its observer of one game, made new for each game. */
  observe?(): Gatherer<Game>;
  /** Where the sweep's total starts, before any game. */
  zero?(sweep: TotalsSweep): Total;
  /** What a game adds to the total, shaped as it: the game's value unless given. `null` adds nothing. */
  total?(game: GameRecord, sweep: TotalsSweep): unknown;
  /** A total read from every game at once, as a summary is, in place of a fold. */
  of?(games: readonly GameRecord[], sweep: TotalsSweep): Total;
  /** How its numbers fold: one way throughout, or by the name of a field wherever it stands, a field not named summed. */
  readonly fold?: Fold | Readonly<Record<string, Fold>>;
  /** The rows it gives the report's Summary table, in order. */
  summary?(totals: unknown, report: ReportContext): string[][];
  /** The report's section its `lines` stand in. */
  readonly section?: Section;
  /** Its lines in its section, a blank line after each block; a counter shown in another's table gives none. */
  lines?(totals: unknown, report: ReportContext): string[];
}

/** The counter of `key` among `counters`; `undefined` for a key none declares. */
export function counterOf(counters: readonly Counter[], key: string): Counter | undefined {
  return counters.find((counter) => counter.key === key);
}

/** The kind of the counter of `key`: `play` for a key none declares, so a counter a report holds and no declaration names is still compared. */
export function kindOf(counters: readonly Counter[], key: string): CounterKind {
  return counterOf(counters, key)?.kind ?? 'play';
}

/**
 * Every counter of `counters` read from a finished game's History (`read`), by key, in their order:
 * what a game's record holds as its `counters`.
 *
 * @throws Error on an entry the engine would not have made, as each counter's reading names it
 */
export function readCounters(counters: readonly Counter[], document: WorldDocument, deps: EngineDeps, seen: Seen): Record<string, unknown> {
  const read: Record<string, unknown> = {};
  for (const counter of counters) if (counter.read !== undefined) read[counter.key] = counter.read(document, deps, seen);
  return read;
}

/** Each observed counter of `counters` with a new observer for one game, in their order. */
export function gatherers(counters: readonly Counter[]): [key: string, gatherer: Gatherer<unknown>][] {
  return counters.flatMap((counter) => (counter.observe === undefined ? [] : [[counter.key, counter.observe()] as [string, Gatherer<unknown>]]));
}

// ── The fold ─────────────────────────────────────────────────────────────────────────────────

/** `value` with every number 0 and every list empty: where a total starts that the sweep has none of yet. */
function zeroOf(value: unknown): unknown {
  if (typeof value === 'number') return 0;
  if (Array.isArray(value)) return [];
  if (typeof value === 'object' && value !== null) return Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, zeroOf(inner)]));
  throw new TypeError(`The sweep's totals cannot total ${JSON.stringify(value)}`);
}

/** The fold of the field `key` under `spec`, in a field folded `outer`. */
const foldOf = (spec: Counter['fold'], key: string, outer: Fold): Fold =>
  spec === undefined || typeof spec === 'string' ? outer : (spec[key] ?? outer);

/**
 * Adds `from`, what one game gives, into `into`, the total so far, and returns the total, at the field
 * `key` folded `mode` (DL-186 item 7, DL-187): a number adds, or takes the greater under `greatest`; a
 * list of numbers adds by index, or joins under `joined`; a list of objects and a record merge by index
 * and by key, an entry the total lacks starting at `zeroOf` it; and `null`, a value the game did not
 * give, adds nothing.
 *
 * @throws TypeError on a value it cannot total, such as a string, or on two that differ in shape: a
 * counter of a new kind fails the sweep rather than reading 0
 */
function foldInto(into: unknown, from: unknown, key: string, mode: Fold, spec: Counter['fold']): unknown {
  if (typeof from === 'number' && typeof into === 'number') return mode === 'greatest' ? Math.max(into, from) : into + from;
  if (Array.isArray(from) && Array.isArray(into)) {
    if (mode === 'joined' && from.every((item) => typeof item === 'number')) {
      into.push(...from);
      return into;
    }
    from.forEach((item: unknown, index) => {
      if (item === null) return;
      if (typeof item === 'number') while (into.length < index) into.push(0);
      into[index] = foldInto(into[index] ?? zeroOf(item), item, key, mode, spec);
    });
    return into;
  }
  if (typeof from === 'object' && from !== null && typeof into === 'object' && into !== null && !Array.isArray(from) && !Array.isArray(into)) {
    const total = into as Record<string, unknown>;
    for (const [inner, value] of Object.entries(from)) {
      if (value !== null) total[inner] = foldInto(total[inner] ?? zeroOf(value), value, inner, foldOf(spec, inner, mode), spec);
    }
    return into;
  }
  throw new TypeError(`The sweep's totals cannot add ${JSON.stringify(from)} to ${JSON.stringify(into)} at ${JSON.stringify(key)}`);
}

/** Adds `from` into `into`, summing every number: the report's own sums, across controllers, kinds and sides. */
export function addInto<T extends object>(into: T, from: Readonly<T>): void {
  foldInto(into, from, '', 'sum', undefined);
}

/** A game's value of `counter`: its record's `counters` for one read from the History, else its `observations`. */
function valueIn(game: GameRecord, counter: Counter): unknown {
  const values = (counter.read === undefined ? game.observations : game.counters) as unknown as Record<string, unknown>;
  return values[counter.key];
}

/**
 * The sweep's totals over `sweep.counters` (DL-239): each totalled counter from its `zero`, every game
 * folded in by its fold, or read from the games at once by its `of`; in the counters' order, which is
 * the order the module report lists them in. Typed as the core's; a sweep of other counters holds
 * theirs by their keys.
 *
 * @throws TypeError on a game whose record holds a counter no declaration names, or on a value the fold
 * cannot total: a counter of a new kind fails the sweep rather than reading 0
 */
export function sweepTotals(sweep: Pick<PlaySweep, 'counters' | 'games' | 'years'>, turnsPerYear: number): SweepTotals {
  const { counters, games } = sweep;
  const context: TotalsSweep = { years: sweep.years, turnsPerYear };
  const declared = new Set(counters.map((counter) => counter.key));
  for (const game of games) {
    const undeclared = [...Object.keys(game.counters), ...Object.keys(game.observations)].filter((key) => !declared.has(key));
    if (undeclared.length > 0) throw new TypeError(`${game.seed} gives ${undeclared.join(', ')}, which no counter declares: the sweep cannot total it`);
  }
  const totals: Record<string, unknown> = {};
  for (const counter of counters) {
    if (counter.of !== undefined) totals[counter.key] = counter.of(games, context);
    else if (counter.zero !== undefined) totals[counter.key] = counter.zero(context);
  }
  for (const game of games) {
    for (const counter of counters) {
      if (counter.zero === undefined || counter.of !== undefined) continue;
      const given = counter.total === undefined ? valueIn(game, counter) : counter.total(game, context);
      if (given === null) continue;
      const mode = typeof counter.fold === 'string' ? counter.fold : 'sum';
      totals[counter.key] = foldInto(totals[counter.key], given, counter.key, mode, counter.fold);
    }
  }
  return totals as unknown as SweepTotals;
}
