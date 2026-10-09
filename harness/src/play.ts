// The play sweep's game (M2-S12): create a world and play it under the automatic policy
// (`policy.ts`) until the game ends or the years run out, applying the policy's actions between
// Turns through the real actions and timing every `advance`. DL-34 records the method.
//
// The loop announces its moments to a list of observers (DL-239): the world created, each Turn
// before the policy chooses, each action applied, each `advance`, each year's end, and the game's
// end. A counter's observer gathers what the History cannot give (`game-counters.ts`), and a probe's
// watches what it probes (the Succession probe, `succession.ts`). A game played with no observer is
// played bare, as the replay is (DL-189): the same game, with nothing gathered about it.
//
// One harness assertion is checked after every `advance` (M6-S3, DL-59, DL-69): under the automatic
// policy, which declines every Transfer Offer and never transfers, no `hero.transferred` may name the
// player's Guild, since the Transfer Generator never takes from it. A breach stops the game and is
// reported as a validator's refusal is.
//
// The harness may read the clock and the environment: it is not the engine (ADR-0001 binds the
// engine only).
//
// A game plays under the deps a front end would give it, the engine's `playDeps` over its own
// `meta.config`, checked before its first Turn; and a run's `HEROESIM_CONFIG` is checked by the
// engine's `playConfig` before any game starts (`runConfig`), so a bad setting is refused by name
// (DL-186 item 12, DL-193).

import { createHash } from 'node:crypto';
import { gzip } from 'node:zlib';
import {
  advance,
  applyActions,
  createWorld,
  deserialise,
  isId,
  playConfig,
  playDeps,
  playerGuild,
  serialise,
  timeOfDay,
  validate,
  type ActionRejection,
  type EngineDeps,
  type Entry,
  type GameConfig,
  type GuildAction,
  type GuildId,
  type QuestId,
  type ValidationResult,
  type WorldActionResult,
  type WorldDocument,
  type WorldSetup,
} from '@heroesim/engine';
import { gatherers, readCounters, type Counter, type Seen } from './counter.js';
import { savedLength, type GameCounters, type GameObservations } from './counters.js';
import { harnessSetup } from './creation.js';
import { gameCounters } from './game-counters.js';
import { automaticPolicy, defaultPolicyConfig, type PolicyConfig } from './policy.js';

/**
 * The config a run plays: `defaultConfig` with `HEROESIM_CONFIG`'s values over it (`configured`),
 * every setting checked by the engine's `playConfig` (DL-193).
 *
 * @throws RangeError naming each setting refused, as `HEROESIM_CONFIG: <problem>`, before any game
 */
export function runConfig(configured: Readonly<Partial<GameConfig>>): GameConfig {
  const played = playConfig(configured);
  if (!played.ok) throw new RangeError(played.refusal.problems.map((problem) => `HEROESIM_CONFIG: ${problem.message}`).join('; '));
  return played.config;
}

/**
 * The deps `document` plays under, as a front end's: the engine's `playDeps` over its own config,
 * `given`'s content and modules (DL-193).
 *
 * @throws RangeError naming each setting refused: the run's config was not checked by `runConfig`
 */
function playedDeps(document: WorldDocument, given: EngineDeps): EngineDeps {
  const played = playDeps(document, given.content, given.modules);
  if (!played.ok) throw new RangeError(played.refusal.message);
  return played.deps;
}

/** Years a harness game is played for when it does not end first (INPUTS 4.13). */
export const defaultYears = 20;

// ── The moments a game announces (DL-239) ──────────────────────────────────────────────────────

/** A document as it stands at a moment, and the deps it plays under. */
export interface Moment {
  document: WorldDocument;
  deps: EngineDeps;
}

/** The world created, before its first Turn, and the events of its creation (its Heroes generated among them). */
export interface Created extends Moment {
  events: readonly Entry[];
}

/** One action of the policy's list, applied: the document the list began from, which it leaves as it was, and its outcome. */
export interface ActionApplied {
  before: WorldDocument;
  action: GuildAction;
  result: WorldActionResult;
  deps: EngineDeps;
}

/**
 * An `advance`: the document it began from, whose World State it left as it was, the one it gave, the
 * Turn's events, and `from`, the History's length before it: the History is appended to in place
 * (ADR-0008), so the entries from `from` on are the `advance`'s.
 */
export interface Advanced {
  before: WorldDocument;
  after: WorldDocument;
  events: readonly Entry[];
  from: number;
  deps: EngineDeps;
}

/** A year's last Turn played: the clock, and the World State's length in the save, walked once however many ask (DL-238). */
export interface YearEnded extends Moment {
  now: () => number;
  worldLength(): number;
}

/**
 * What watches a game (DL-239): each moment it announces, in play order. An observer reads the
 * document it is given and changes nothing, so a game plays the same with any observers or none.
 */
export interface PlayObserver {
  /** The world created and arranged (`prepare`), before its first Turn. */
  created?(moment: Created): void;
  /** A Turn about to be chosen for: the World State as the policy sees it. */
  beforeChoices?(moment: Moment): void;
  /** Each of the policy's actions, in order, once its list is applied on one copy (DL-238). */
  actionApplied?(moment: ActionApplied): void;
  /** Each `advance`. */
  advanced?(moment: Advanced): void;
  /** The last Turn of a year played: `turnsPerYear` Turns from the world's creation, and every such Turn after. */
  yearEnded?(moment: YearEnded): void;
  /** The game stopped: ended, out of years, refused by the validator or stopped by the harness assertion. */
  ended?(moment: Moment): void;
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
  /**
   * Called once on the created world, before its observers are told of it: a probe's arrangement,
   * such as the Succession probe's Rival Guildmaster at 50 (DL-113 item 7). The one call that may
   * change the document.
   */
  prepare?: (document: WorldDocument) => void;
  /** What watches the game, told of each moment in this order (DL-239); none plays it bare. */
  observers?: readonly PlayObserver[];
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
 * A harness assertion a game broke (DL-59, DL-69), in a validator failure's shape: the Turn of the
 * offending entry, the assertion (`player-transferred`: a `hero.transferred` naming the player's
 * Guild), the entry's place in the History, and prose.
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
}

/** The positions in `positions`, ascending, from `from` on: read from the end, so a Turn's reading is its own entries' length. */
function since(positions: readonly number[] | undefined, from: number): number[] {
  const found: number[] = [];
  for (let at = (positions?.length ?? 0) - 1; at >= 0 && (positions?.[at] ?? -1) >= from; at -= 1) found.push(positions?.[at] as number);
  return found.reverse();
}

/**
 * What an `advance` from `before` to `after` did that no entry records (DL-69), its entries those from
 * the History's position `from` on, added to `rivalQuestDifficulty` and `sellerInDebt`: each Quest it
 * took (the player's are taken between Turns, never in it), with the Quest's difficulty in `before`;
 * and, when the Turn it played is an afternoon, each Transfer whose seller was in debt in `before`,
 * when a Rival's `debtTransfer` may sell (DL-57 item 5). `before` is the world the afternoon's Rivals
 * read: `advance` plays the Turn after it on a copy, and nothing but the night's Guild State Engine
 * sets or clears a debt.
 */
export function readAdvance(
  before: WorldDocument,
  from: number,
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
  for (const position of since(byType['quest.taken'], from)) {
    const questId = field(position, 'questId');
    const quest = isId('quests', questId) && Object.hasOwn(quests, questId) ? quests[questId as QuestId] : undefined;
    if (quest !== undefined) rivalQuestDifficulty.set(quest.id, quest.difficulty);
  }
  if (timeOfDay(after.world.turn) !== 'afternoon') return;
  for (const position of since(byType['hero.transferred'], from)) {
    const fromGuildId = field(position, 'fromGuildId');
    const seller = isId('guilds', fromGuildId) && Object.hasOwn(guilds, fromGuildId) ? guilds[fromGuildId as GuildId] : undefined;
    if (seller !== undefined && seller.belowFloorSince !== null) sellerInDebt.add(position);
  }
}

/** What the play loop sees that no entry records, as `Seen` gives it to the counters read from the History. */
export interface InPlay extends PlayObserver {
  playerQuestDifficulty: Map<string, number>;
  afternoons: { questDifficulty: Map<string, number>; sellerInDebt: Set<number> };
}

/**
 * An observer of what the play loop sees that no entry records (M5, DL-62; M6, DL-69): the difficulty
 * of each Quest the policy's Guild took, read from the Quest's row as each accepted dispatch was
 * applied; and, of the Rivals' afternoons (`readAdvance`), the difficulty of each Quest a Rival took
 * and the Transfers whose seller was in debt.
 */
export function seenInPlay(): InPlay {
  const playerQuestDifficulty = new Map<string, number>();
  const afternoons = { questDifficulty: new Map<string, number>(), sellerInDebt: new Set<number>() };
  return {
    playerQuestDifficulty,
    afternoons,
    actionApplied({ before, action, result }) {
      const quest = result.ok && action.kind === 'dispatch' ? before.world.quests[action.questId] : undefined;
      if (quest !== undefined) playerQuestDifficulty.set(quest.id, quest.difficulty);
    },
    advanced({ before, after, from }) {
      readAdvance(before, from, after, afternoons.questDifficulty, afternoons.sellerInDebt);
    },
  };
}

/** A validation's result is a problem when it refuses or warns: the engine's worlds warn of nothing. */
const troubled = (result: ValidationResult): boolean => !result.ok || result.warnings.length > 0;

/**
 * Creates `seed`'s world and plays it: before each Turn, the policy's actions, applied in order on one
 * copy through `applyActions` (DL-238); then `advance`, timed; then, when validating, the validator from
 * the History's length at its last run (`historyFrom`), so that validating every Turn stays linear in
 * the History; and once the game stops, the validator over the whole document. After each `advance`,
 * the harness assertion (`playerTransferred`). Stops when the game ends, when `years × turnsPerYear`
 * Turns have been reached, at a validator refusal or warning, or at a broken assertion. Tells
 * `observers` of each moment (`PlayObserver`). Never throws on what it finds: a refused action or
 * document, or a broken assertion, is recorded.
 */
export function playGame(seed: string, given: EngineDeps, options: PlayOptions = {}): PlayedGame {
  const {
    years = defaultYears,
    validate: validating = false,
    policy = defaultPolicyConfig,
    choose = automaticPolicy,
    setup = harnessSetup,
    prepare,
    observers = [],
    now = () => performance.now(),
  } = options;
  const creation = createWorld(seed, setup, given);
  let { document } = creation;
  prepare?.(document);
  const deps = playedDeps(document, given);
  const lastTurn = years * deps.config.turnsPerYear;
  const advanceMs: number[] = [];
  const validateMs: number[] = [];
  const refusals: PolicyRefusal[] = [];
  let invalid: Invalid | null = null;
  let assertion: AssertionFailure | null = null;
  let validated = 0;
  let transfersAsserted = 0;

  /** Validates from `from`, timing it into `times`; records and reports a problem. */
  const check = (from: number, times: number[]): boolean => {
    const started = now();
    const result = validate(document, deps, { historyFrom: from });
    times.push(now() - started);
    validated = document.history.entries.length;
    if (troubled(result)) invalid = { turn: document.world.turn, result };
    return invalid === null;
  };

  for (const observer of observers) observer.created?.({ document, deps, events: creation.events });
  if (!validating || check(0, [])) {
    while (document.world.ended === null && document.world.turn < lastTurn) {
      for (const observer of observers) observer.beforeChoices?.({ document, deps });
      const actions = choose(document, deps, policy);
      // The actions are read with the document they began from, which they leave as it was.
      const before = document;
      const applied = applyActions(before, actions, deps);
      applied.results.forEach((result, at) => {
        const action = actions[at] as GuildAction;
        if (!result.ok) refusals.push({ turn: before.world.turn, action, rejection: result.rejection });
        for (const observer of observers) observer.actionApplied?.({ before, action, result, deps });
      });
      document = applied.document;

      const unadvanced = document;
      const from = document.history.entries.length;
      const started = now();
      const advanced = advance(document, deps);
      advanceMs.push(now() - started);
      document = advanced.document;
      for (const observer of observers) observer.advanced?.({ before: unadvanced, after: document, events: advanced.events, from, deps });
      const { turn } = document.world;
      if (turn % deps.config.turnsPerYear === 0) {
        // The World State walked once a year, however many observers ask (DL-238).
        let walked: number | null = null;
        const worldLength = (): number => (walked ??= savedLength(document.world));
        for (const observer of observers) observer.yearEnded?.({ document, deps, now, worldLength });
      }

      if (validating && !check(validated, validateMs)) break;
      // The M6-S3 harness assertion, over every Transfer since the last Turn's check, the policy's own included.
      assertion = playerTransferred(document, transfersAsserted);
      transfersAsserted = document.history.byType['hero.transferred']?.length ?? 0;
      if (assertion !== null) break;
    }
  }
  for (const observer of observers) observer.ended?.({ document, deps });

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
  /** Whether the load gave back the same text when serialised again: its length and fingerprint the same. */
  roundTrips: boolean;
  /**
   * SHA-256 of `serialise(document)`, in hex: equal for two games only when their saves are byte for
   * byte equal, so a run's games compare with another run's without keeping either's documents
   * (DL-76). Not a counter: it changes none.
   */
  fingerprint: string;
  /** Its length gzipped, as the page keeps it (DL-67), when asked for; else `null`. */
  gzipped: number | null;
}

/** A game's last save, written: its text, which the load takes and drops, and what writing it cost. */
interface Written {
  text: string | null;
  serialiseMs: number;
  historyEntries: number;
}

/** `document`'s save written, timed on `now`. */
function written(document: WorldDocument, now: () => number): Written {
  const started = now();
  const text = serialise(document);
  return { text, serialiseMs: now() - started, historyEntries: document.history.entries.length };
}

/** `text`'s length gzipped, as the page keeps it (DL-67), compressed in zlib's thread pool (DL-239). */
function gzippedLength(text: string): Promise<number> {
  return new Promise((resolve, reject) => {
    gzip(text, (error, compressed) => (error === null ? resolve(compressed.length) : reject(error)));
  });
}

/**
 * Loads a written save back, timing the load, fingerprints it and, when `gzip` is set, measures it
 * gzipped in zlib's thread pool once it is loaded (DL-239): zlib copies the text, 164 MB at a 20-year
 * game's end, and that copy held through the load raised a game's peak by some 230 MB. The text is
 * dropped once gzipped, and the loaded document serialised again and compared with it by length and
 * fingerprint, so that the two texts are never held at once (DL-174).
 */
async function measureSave(save: Written, deps: EngineDeps, now: () => number, gzip: boolean): Promise<DocumentMeasures> {
  const text = save.text;
  if (text === null) throw new Error('A save is measured once');
  const length = text.length;
  const fingerprint = fingerprintOf(text);
  const started = now();
  const loaded = deserialise(text, deps);
  const deserialiseMs = now() - started;
  const gzipping = gzip ? gzippedLength(text) : null;
  save.text = null;
  const gzipped = gzipping === null ? null : await gzipping;
  const again = loaded.ok ? serialise(loaded.document) : null;
  return {
    historyEntries: save.historyEntries,
    serialisedLength: length,
    serialiseMs: save.serialiseMs,
    deserialiseMs,
    roundTrips: again !== null && again.length === length && fingerprintOf(again) === fingerprint,
    fingerprint,
    gzipped,
  };
}

/** Serialises `document`, loads it back, times both, fingerprints the save and, when `gzip` is set, measures it gzipped. */
export function measureDocument(document: WorldDocument, deps: EngineDeps, now: () => number = () => performance.now(), gzip = false): Promise<DocumentMeasures> {
  return measureSave(written(document, now), deps, now, gzip);
}

/**
 * SHA-256 of a save's text, in hex: `DocumentMeasures.fingerprint`'s, and the replay's (`sweep.ts`),
 * which compares two games by it so as not to hold the first game's text (DL-181).
 */
export function fingerprintOf(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

/** One game of a sweep, reduced to what the report needs, so the sweep keeps no document. */
export interface GameRecord {
  seed: string;
  /** The counters read from the game's History once it stopped (`Counter.read`), by key. */
  counters: GameCounters;
  /** The counters its observers gathered as it was played (`Counter.observe`), by key. */
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

/** How a game is recorded: as it is played, but for its observers, which its counters bring. */
export interface RecordOptions extends Omit<PlayOptions, 'observers'> {
  /** The counters gathered: `gameCounters` unless a test declares its own (DL-239). */
  counters?: readonly Counter[];
}

/** A game played and read, its save written: all its record takes but what its save's load measures and its observers gathered. */
interface Played extends Omit<GameRecord, 'seed' | 'observations' | 'measures'> {
  save: Written;
  /** Whether the game stopped at its last year's end, whose save is gzipped. */
  lastYear: boolean;
  advanceMs: number[];
  validateMs: number[];
}

/**
 * Plays `seed` told to `observers` and the loop's sight (`seenInPlay`), reads the counters of
 * `options.counters` its History gives, and writes its save. The game's document is out of reach once
 * this returns, so that it and the document its save loads are never held at once (DL-239): no
 * observer keeps its History past the game's end.
 */
function playedAndRead(seed: string, deps: EngineDeps, options: RecordOptions, observers: readonly PlayObserver[]): Played {
  const { counters: declared = gameCounters, ...playing } = options;
  const lastTurn = (options.years ?? defaultYears) * deps.config.turnsPerYear;
  const seen = seenInPlay();
  const game = playGame(seed, deps, { ...playing, observers: [seen, ...observers] });
  const { document, turnsPlayed, refusals, invalid, assertion, wholeValidateMs, advanceMs, validateMs } = game;
  const sight: Seen = { playerQuestDifficulty: seen.playerQuestDifficulty, afternoons: seen.afternoons };
  const { turn, ended } = document.world;
  return {
    counters: readCounters(declared, document, deps, sight) as unknown as GameCounters,
    turnsPlayed,
    ranFullLength: ended === null && turn >= lastTurn,
    refusals,
    invalid,
    assertion,
    wholeValidateMs,
    save: written(document, options.now ?? (() => performance.now())),
    // The last year's save gzipped, from the save written here (DL-174): a game that reached its last
    // year's end stopped there, so its document is the one that year ended with.
    lastYear: lastTurn > 0 && lastTurn % deps.config.turnsPerYear === 0 && turn === lastTurn,
    advanceMs,
    validateMs,
  };
}

/**
 * Plays `seed` with an observer of each observed counter of `options.counters` (`gameCounters` unless
 * given) and the loop's sight, and reduces the game to its record: the counters read from its
 * History, then its last save loaded back once the game's document is out of reach (DL-239), then the
 * observed counters, which may read the save's measures. Returns the advance and validation times too.
 */
export async function recordGame(
  seed: string,
  deps: EngineDeps,
  options: RecordOptions = {},
): Promise<{ record: GameRecord; advanceMs: number[]; validateMs: number[] }> {
  const observing = gatherers(options.counters ?? gameCounters);
  const { save, lastYear, advanceMs, validateMs, ...read } = playedAndRead(
    seed,
    deps,
    options,
    observing.map(([, gatherer]) => gatherer),
  );
  const measures = await measureSave(save, deps, options.now ?? (() => performance.now()), lastYear);
  const observations: Record<string, unknown> = {};
  for (const [key, gatherer] of observing) {
    gatherer.measured?.(measures);
    observations[key] = gatherer.value();
  }
  return { record: { seed, ...read, observations: observations as unknown as GameObservations, measures }, advanceMs, validateMs };
}
