// The play sweep's game (M2-S12): create a world and play it under the automatic policy
// (`policy.ts`) until the game ends or the years run out, applying the policy's actions between
// Turns through the real actions and timing every `advance`. Counters come from the History
// (`counters.ts`), measures from the harness's clock. DL-34 records the method and the result.
//
// The harness may read the clock and the environment: it is not the engine (ADR-0001 binds the
// engine only).

import {
  advance,
  applyAction,
  createWorld,
  deserialise,
  serialise,
  validate,
  type ActionRejection,
  type EngineDeps,
  type GuildAction,
  type ValidationResult,
  type WorldDocument,
  type WorldSetup,
} from '@heroesim/engine';
import { harnessSetup } from './creation.js';
import { countGame, type GameCounters } from './counters.js';
import { automaticPolicy, defaultPolicyConfig, type PolicyConfig } from './policy.js';

/** Years a harness game is played for when it does not end first (INPUTS 4.13). */
export const defaultYears = 20;

/**
 * Whether `HEROESIM_VALIDATE` asks for the validator after every `advance` (INPUTS §9): `1` or
 * `true` does, unset, blank, `0` or `false` does not. Throws on anything else, so a mistyped flag
 * fails the run rather than silently not validating.
 */
export function validatingEveryTurn(value: string | undefined = process.env.HEROESIM_VALIDATE): boolean {
  const flag = (value ?? '').trim().toLowerCase();
  if (flag === '' || flag === '0' || flag === 'false') return false;
  if (flag === '1' || flag === 'true') return true;
  throw new RangeError(`HEROESIM_VALIDATE is 1 or 0, not ${JSON.stringify(value)}`);
}

export interface PlayOptions {
  /** Years to play unless the game ends first: `years × turnsPerYear` Turns at most. */
  years?: number;
  /**
   * Validate after every `advance` (`HEROESIM_VALIDATE`): the World State in full and the History
   * from where the last validation left it, then the whole document once the game stops (DL-34).
   * A refusal stops the game.
   */
  validate?: boolean;
  policy?: Readonly<PolicyConfig>;
  setup?: WorldSetup;
  /** A millisecond clock: `performance.now` unless a test gives its own. */
  now?: () => number;
}

/** A policy action the rules refused: a bug in the policy, since it chooses only what they accept. */
export interface PolicyRefusal {
  turn: number;
  action: GuildAction;
  rejection: ActionRejection;
}

/** A validation that refused the document or warned about it, and the Turn it stood at. */
export interface Invalid {
  turn: number;
  result: ValidationResult;
}

/** One seed's game, played. */
export interface PlayedGame {
  seed: string;
  /** The document as the game left it: ended, out of years, or refused by the validator. */
  document: WorldDocument;
  /** `advance` calls made. */
  turnsPlayed: number;
  /** Milliseconds per `advance` call, in Turn order. */
  advanceMs: number[];
  /** Milliseconds per validation after an `advance`, in Turn order; empty unless validating. */
  validateMs: number[];
  /** Milliseconds for the validation of the whole document once the game stopped; `null` unless validating. */
  wholeValidateMs: number | null;
  refusals: PolicyRefusal[];
  /** The first validation that refused the document or warned about it; `null` when none did. */
  invalid: Invalid | null;
}

/** A validation's result is a problem when it refuses or warns: the engine's worlds warn of nothing. */
const troubled = (result: ValidationResult): boolean => !result.ok || result.warnings.length > 0;

/**
 * Creates `seed`'s world and plays it: before each Turn the policy's actions, applied in order
 * through `applyAction`; then `advance`, timed; then, when validating, the validator from the
 * History's length at its last run (`historyFrom`), so that validating every Turn stays linear
 * in the History; and once the game stops, the validator over the whole document. Stops when the
 * game ends, when `years × turnsPerYear` Turns have been reached, or at a validator refusal or
 * warning. Never throws on what it finds: a refused action or document is recorded.
 */
export function playGame(seed: string, deps: EngineDeps, options: PlayOptions = {}): PlayedGame {
  const {
    years = defaultYears,
    validate: validating = false,
    policy = defaultPolicyConfig,
    setup = harnessSetup,
    now = () => performance.now(),
  } = options;
  const lastTurn = years * deps.config.turnsPerYear;
  let { document } = createWorld(seed, setup, deps);
  const advanceMs: number[] = [];
  const validateMs: number[] = [];
  const refusals: PolicyRefusal[] = [];
  let invalid: Invalid | null = null;
  let validated = 0;

  /** Validates from `from`, timing it into `times`; records and reports a problem. */
  const check = (from: number, times: number[]): boolean => {
    const started = now();
    const result = validate(document, deps, { historyFrom: from });
    times.push(now() - started);
    validated = document.history.entries.length;
    if (troubled(result)) invalid = { turn: document.world.turn, result };
    return invalid === null;
  };

  const created: number[] = [];
  if (!validating || check(0, created)) {
    while (document.world.ended === null && document.world.turn < lastTurn) {
      for (const action of automaticPolicy(document, deps, policy)) {
        const result = applyAction(document, action, deps);
        if (result.ok) document = result.document;
        else refusals.push({ turn: document.world.turn, action, rejection: result.rejection });
      }

      const before = now();
      document = advance(document, deps).document;
      advanceMs.push(now() - before);

      if (validating && !check(validated, validateMs)) break;
    }
  }

  const whole: number[] = [];
  if (validating && invalid === null) check(0, whole);
  return {
    seed,
    document,
    turnsPlayed: advanceMs.length,
    advanceMs,
    validateMs,
    wholeValidateMs: whole[0] ?? null,
    refusals,
    invalid,
  };
}

/** What a played game's final document measures: its size and the cost of saving and loading it. */
export interface DocumentMeasures {
  historyEntries: number;
  /** Length of `serialise(document)` in UTF-16 code units: its bytes while it is ASCII. */
  serialisedLength: number;
  serialiseMs: number;
  /** `deserialise`, which parses, migrates and validates the whole document (a load). */
  deserialiseMs: number;
  /** Whether the load gave back the same text when serialised again. */
  roundTrips: boolean;
}

/** Serialises `document`, loads it back, and times both. */
export function measureDocument(
  document: WorldDocument,
  deps: EngineDeps,
  now: () => number = () => performance.now(),
): DocumentMeasures {
  const saveStarted = now();
  const text = serialise(document);
  const serialiseMs = now() - saveStarted;
  const loadStarted = now();
  const loaded = deserialise(text, deps);
  const deserialiseMs = now() - loadStarted;
  return {
    historyEntries: document.history.entries.length,
    serialisedLength: text.length,
    serialiseMs,
    deserialiseMs,
    roundTrips: loaded.ok && serialise(loaded.document) === text,
  };
}

/** One game of a sweep, reduced to what the report needs, so the sweep keeps no document. */
export interface GameRecord {
  seed: string;
  counters: GameCounters;
  turnsPlayed: number;
  /** Whether the game ran to its last Turn without ending. */
  ranFullLength: boolean;
  refusals: PolicyRefusal[];
  invalid: Invalid | null;
  /** The validation of the whole document once the game stopped, in ms; `null` unless validating. */
  wholeValidateMs: number | null;
  measures: DocumentMeasures;
}

/** Plays `seed` and reduces the game to its record; returns the advance and validation times too. */
export function recordGame(
  seed: string,
  deps: EngineDeps,
  options: PlayOptions = {},
): { record: GameRecord; advanceMs: number[]; validateMs: number[] } {
  const game = playGame(seed, deps, options);
  const years = options.years ?? defaultYears;
  const { document } = game;
  return {
    record: {
      seed,
      counters: countGame(document),
      turnsPlayed: game.turnsPlayed,
      ranFullLength: document.world.ended === null && document.world.turn >= years * deps.config.turnsPerYear,
      refusals: game.refusals,
      invalid: game.invalid,
      wholeValidateMs: game.wholeValidateMs,
      measures: measureDocument(document, deps, options.now),
    },
    advanceMs: game.advanceMs,
    validateMs: game.validateMs,
  };
}
