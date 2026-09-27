// The play sweep's game (M2-S12): create a world and play it under the automatic policy
// (`policy.ts`) until the game ends or the years run out, applying the policy's actions between
// Turns through the real actions and timing every `advance`. Counters come from the History
// (`counters.ts`), and what it cannot give from the World State before the policy acts on each
// Turn (`observe`, M3, DL-40) and, for each Quest the policy sends a Party on, from the Quest's row
// as it dispatches (its difficulty, M5, DL-62); and, for the Rivals' afternoons, from the world as
// each `advance` found it: the difficulty of each Quest a Rival took, and whether the seller of each
// Transfer was in debt (M6, DL-69). Measures from the harness's clock. DL-34 records the method.
//
// One harness assertion is checked after every `advance` (M6-S3, DL-59, DL-69): under the automatic
// policy, which declines every Transfer Offer and never transfers, no `hero.transferred` may name the
// player's Guild, since the Transfer Generator never takes from it. A breach stops the game and is
// reported as a validator's refusal is.
//
// The harness may read the clock and the environment: it is not the engine (ADR-0001 binds the
// engine only).

import { createHash } from 'node:crypto';
import {
  advance,
  applyAction,
  createWorld,
  deserialise,
  isId,
  playerGuild,
  serialise,
  timeOfDay,
  validate,
  type ActionRejection,
  type EngineDeps,
  type GuildAction,
  type GuildId,
  type QuestId,
  type ValidationResult,
  type WorldDocument,
  type WorldSetup,
} from '@heroesim/engine';
import { harnessSetup } from './creation.js';
import { countGame, emptyObservations, observe, takeCensus, type GameCounters, type GameObservations } from './counters.js';
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
  /**
   * The player's choices on each Turn: `automaticPolicy` unless a test gives its own, as the one
   * that shows the harness assertion stops a game (DL-69). A sweep's child processes play the policy.
   */
  choose?: (document: WorldDocument, deps: EngineDeps, policy: Readonly<PolicyConfig>) => GuildAction[];
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

/**
 * A harness assertion a game broke (M6-S3's, DL-59, DL-69), in a validator failure's shape: the
 * Turn of the offending entry, the assertion (`player-transferred`: a `hero.transferred` naming the
 * player's Guild), the entry's place in the History, and prose.
 */
export interface AssertionFailure {
  turn: number;
  check: 'player-transferred';
  id: string;
  detail: string;
}

/**
 * The first `hero.transferred` entry from the `from`th of its type on (`history.byType`) that names
 * the player's Guild, as an `AssertionFailure`; `null` when none does.
 */
export function playerTransferred(document: WorldDocument, from = 0): AssertionFailure | null {
  const guildId = playerGuild(document.world)?.id;
  if (guildId === undefined) return null;
  const positions = document.history.byType['hero.transferred'] ?? [];
  for (const position of positions.slice(from)) {
    const entry = document.history.entries[position];
    const payload = entry?.payload as { fromGuildId?: unknown; toGuildId?: unknown } | undefined;
    if (entry === undefined || (payload?.fromGuildId !== guildId && payload?.toGuildId !== guildId)) continue;
    return {
      turn: entry.turn,
      check: 'player-transferred',
      id: `$.history.entries[${position}]`,
      detail: `A Hero was transferred ${payload?.toGuildId === guildId ? 'into' : 'out of'} the player's Guild, which the policy never does`,
    };
  }
  return null;
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
  /** The harness assertion the game broke, which stopped it; `null` when it broke none (DL-69). */
  assertion: AssertionFailure | null;
  /** What the World State showed before the policy acted on each Turn, and at the last (`observe`). */
  observations: GameObservations;
  /**
   * The difficulty of each Quest the policy's Guild took, by Quest id, read from the Quest's row as
   * each accepted dispatch was applied: no entry of the History records it (M5, DL-62).
   */
  playerQuestDifficulty: Map<string, number>;
  /**
   * The difficulty of each Quest a Rival took, by Quest id, from the Quest's row in the world the
   * `advance` that took it began with (M6, DL-69).
   */
  rivalQuestDifficulty: Map<string, number>;
  /**
   * The History positions of the `hero.transferred` entries of an afternoon whose selling Guild was in
   * debt (`belowFloorSince` set) in the world that afternoon's `advance` began with (M6, DL-69).
   */
  sellerInDebt: Set<number>;
}

/** Where the History stood before an `advance`: how many entries of each type `readAdvance` reads. */
export interface HistoryMark {
  taken: number;
  transferred: number;
}

/** Marks where `document`'s History stands, before an `advance`, which appends to the same History (ADR-0008). */
export function markHistory(document: WorldDocument): HistoryMark {
  const { byType } = document.history;
  return { taken: byType['quest.taken']?.length ?? 0, transferred: byType['hero.transferred']?.length ?? 0 };
}

/**
 * What an `advance` from `before`, whose History stood at `mark`, to `after` did that no entry
 * records (M6, DL-69), added to `rivalQuestDifficulty` and `sellerInDebt`: each Quest it took (the
 * player's are taken between Turns, never in it), with the Quest's difficulty in `before`; and, when
 * the Turn it played is an afternoon, each Transfer whose seller was in debt in `before`, when a
 * Rival's `debtTransfer` may sell (DL-57 item 5). `before` is the world the afternoon's Rivals read:
 * `advance` plays the Turn after it on a copy, and nothing but the night's Guild State Engine sets
 * or clears a debt.
 */
export function readAdvance(
  before: WorldDocument,
  mark: HistoryMark,
  after: WorldDocument,
  rivalQuestDifficulty: Map<string, number>,
  sellerInDebt: Set<number>,
): void {
  const { byType, entries } = after.history;
  const field = (position: number, name: string): unknown => {
    const payload = entries[position]?.payload;
    return typeof payload === 'object' && payload !== null ? Reflect.get(payload, name) : undefined;
  };
  const { quests, guilds } = before.world;
  for (const position of (byType['quest.taken'] ?? []).slice(mark.taken)) {
    const questId = field(position, 'questId');
    const quest = isId('quests', questId) && Object.hasOwn(quests, questId) ? quests[questId as QuestId] : undefined;
    if (quest !== undefined) rivalQuestDifficulty.set(quest.id, quest.difficulty);
  }
  if (timeOfDay(after.world.turn) !== 'afternoon') return;
  for (const position of (byType['hero.transferred'] ?? []).slice(mark.transferred)) {
    const fromGuildId = field(position, 'fromGuildId');
    const seller = isId('guilds', fromGuildId) && Object.hasOwn(guilds, fromGuildId) ? guilds[fromGuildId as GuildId] : undefined;
    if (seller !== undefined && seller.belowFloorSince !== null) sellerInDebt.add(position);
  }
}

/** A validation's result is a problem when it refuses or warns: the engine's worlds warn of nothing. */
const troubled = (result: ValidationResult): boolean => !result.ok || result.warnings.length > 0;

/**
 * Creates `seed`'s world and plays it: before each Turn, the World State observed (`observe`) and
 * then the policy's actions, applied in order through `applyAction`; then `advance`, timed; then, when validating, the validator from the
 * History's length at its last run (`historyFrom`), so that validating every Turn stays linear
 * in the History; and once the game stops, the year's census if it stopped at a year's start
 * without ending, and the validator over the whole document. After each `advance`, what it did that
 * no entry records (`readAdvance`), and the harness assertion (`playerTransferred`). Stops when the
 * game ends, when `years × turnsPerYear` Turns have been reached, at a validator refusal or
 * warning, or at a broken assertion. Never throws on what it finds: a refused action or document,
 * or a broken assertion, is recorded.
 */
export function playGame(seed: string, deps: EngineDeps, options: PlayOptions = {}): PlayedGame {
  const {
    years = defaultYears,
    validate: validating = false,
    policy = defaultPolicyConfig,
    choose = automaticPolicy,
    setup = harnessSetup,
    now = () => performance.now(),
  } = options;
  const lastTurn = years * deps.config.turnsPerYear;
  let { document } = createWorld(seed, setup, deps);
  const advanceMs: number[] = [];
  const validateMs: number[] = [];
  const refusals: PolicyRefusal[] = [];
  let invalid: Invalid | null = null;
  let assertion: AssertionFailure | null = null;
  let validated = 0;
  let transfersAsserted = 0;
  const observations = emptyObservations();
  const playerQuestDifficulty = new Map<string, number>();
  const rivalQuestDifficulty = new Map<string, number>();
  const sellerInDebt = new Set<number>();

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
      observe(observations, document.world, deps);
      for (const action of choose(document, deps, policy)) {
        const result = applyAction(document, action, deps);
        if (!result.ok) {
          refusals.push({ turn: document.world.turn, action, rejection: result.rejection });
          continue;
        }
        const quest = action.kind === 'dispatch' ? document.world.quests[action.questId] : undefined;
        if (quest !== undefined) playerQuestDifficulty.set(quest.id, quest.difficulty);
        document = result.document;
      }

      const unadvanced = document;
      const mark = markHistory(document);
      const started = now();
      document = advance(document, deps).document;
      advanceMs.push(now() - started);
      readAdvance(unadvanced, mark, document, rivalQuestDifficulty, sellerInDebt);

      if (validating && !check(validated, validateMs)) break;
      // The M6-S3 harness assertion, over every Transfer since the last Turn's check, the policy's own included.
      assertion = playerTransferred(document, transfersAsserted);
      transfersAsserted = document.history.byType['hero.transferred']?.length ?? 0;
      if (assertion !== null) break;
    }
    // The last year's end, when the game ran its full length: the policy does not act on it.
    if (document.world.ended === null) takeCensus(observations, document.world, deps);
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
    assertion,
    observations,
    playerQuestDifficulty,
    rivalQuestDifficulty,
    sellerInDebt,
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
  /**
   * SHA-256 of `serialise(document)`, in hex: equal for two games only when their saves are byte for
   * byte equal, so a run's games compare with another run's without keeping either's documents
   * (M8-S1, DL-76). Not a counter: it changes none.
   */
  fingerprint: string;
}

/** Serialises `document`, loads it back, times both, and fingerprints the save. */
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
    fingerprint: createHash('sha256').update(text).digest('hex'),
  };
}

/** One game of a sweep, reduced to what the report needs, so the sweep keeps no document. */
export interface GameRecord {
  seed: string;
  counters: GameCounters;
  observations: GameObservations;
  turnsPlayed: number;
  /** Whether the game ran to its last Turn without ending. */
  ranFullLength: boolean;
  refusals: PolicyRefusal[];
  invalid: Invalid | null;
  assertion: AssertionFailure | null;
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
      counters: countGame(document, deps, game.playerQuestDifficulty, {
        questDifficulty: game.rivalQuestDifficulty,
        sellerInDebt: game.sellerInDebt,
      }),
      observations: game.observations,
      turnsPlayed: game.turnsPlayed,
      ranFullLength: document.world.ended === null && document.world.turn >= years * deps.config.turnsPerYear,
      refusals: game.refusals,
      invalid: game.invalid,
      assertion: game.assertion,
      wholeValidateMs: game.wholeValidateMs,
      measures: measureDocument(document, deps, options.now),
    },
    advanceMs: game.advanceMs,
    validateMs: game.validateMs,
  };
}
