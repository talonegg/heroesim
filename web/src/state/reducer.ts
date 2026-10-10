// The page's one reducer (M7-S2, DL-65): every play the player makes is an engine call made here,
// and nowhere else in `web/` (ADR-0007, principle 12). The state is `{ document, log, rejection,
// busy }` and what the engine's results carry beside them; each play's result replaces the
// document, and a refusal is stored as the typed rejection the engine returned, never thrown.
//
// A play is taken in two steps. `gameReducer` accepts it and marks the state `busy`, running
// nothing; `settle` runs the engine on it and stores the result. A second play that arrives while
// busy is dropped, so two taps on Advance drive one engine call, and `useGame` lets the browser
// paint the busy state before the engine runs, so a year's fast forward is not a silent freeze.
//
// The engine is not called inside React's own reducer: the History is shared and appended to in
// place (ADR-0008), so an engine call cannot be repeated, and React calls a reducer twice under
// StrictMode, as it may when it replays updates. `useGame` runs `gameReducer` itself, once per
// play, and hands React the state it made.
//
// The rules a game plays under are the CLI's (data-model §2, pre-M0 review D3): a save is read by the
// engine's `deserialise`, which compares and migrates its schema version (DL-20) and refuses a save
// whose config breaks a rule, naming the setting; it is played under the engine's `playDeps`, its
// own config filled forward with the current defaults and checked (v1.1.6-S7, DL-186 item 12,
// DL-193), the page making no merge of its own; a new game starts under `defaultConfig`; `rebase`
// adopts `defaultConfig`.
//
// The modules installed are the reducer's deps beside the state (M8-S4, DL-79): the page's address
// names them (`modules.ts`, a test switch), `useGame` is given them, and every engine call a play
// makes installs them, none unless given, so a page without the switch plays as it did before M8.
//
// A fast forward is settled in steps (v1.0.1-S5, DL-96): each `settle` makes one `fastForward` call
// of at most `fastForwardStepTurns` Turns, and a step that stops on `max-turns` with Turns of the
// cap left leaves the rest pending, so `useGame` settles it after the next paint, as it settles any
// play. Between steps `forwarding` holds the game as the last step left it and every step's events,
// and the page shows how far it has come; the game in hand and the log stay as they were until the
// fast forward ends, when they become its game and its events, as one call's would. `stop`, a
// control action like `settle` and `dismiss`, ends it between steps with the game and the events
// the last step left; a play meanwhile is dropped as busy. `engine/src/stops.ts` detects every
// reason to stop from the Turn alone, so the steps end where one call would, with the same game.

import { useCallback, useEffect, useReducer, useRef } from 'react';
import {
  advance,
  applyAction,
  createWorld,
  defaultConfig,
  deserialise,
  fastForward,
  playDeps as enginePlayDeps,
  playerGuild,
  setupRefusal,
  type ActionRejection,
  type BackgroundKey,
  type EngineDeps,
  type TurnEvent,
  type GuildAction,
  type GuildId,
  type LoadRefusal,
  type Module,
  type PortraitKey,
  type RebaseAction,
  type Rejection,
  type Sex,
  type StatValues,
  type StopCondition,
  type StopReason,
  type TraitKey,
  type ValidationWarning,
  type WorldDocument,
  type WorldSetup,
} from '@heroesim/engine';
import type { GameEnded as AnyGameEnded, NewGameRejection, NoPlayerGuild as AnyNoPlayerGuild } from '@heroesim/words';
import { content } from '../content';

// ── Plays ────────────────────────────────────────────────────────────────────────────────────

/** A Guild's action as the player takes it: the engine's own, less the Guild, always the player's. */
export type PlayerAction = GuildAction extends infer Action
  ? Action extends GuildAction
    ? Omit<Action, 'guildId'>
    : never
  : never;

/**
 * Starts a game from a seed and the player's choices. The seed and the clock are the caller's.
 * The Guildmaster's setup is the engine's `WorldSetup`'s (M9-S2, the CLI's `new` flags): whatever is
 * left out is drawn from the seed.
 */
export interface NewGame {
  kind: 'newGame';
  seed: string;
  guildName: string;
  guildmasterName: string;
  /** A Guild Background; drawn as a Rival's is when omitted. */
  backgroundKey?: BackgroundKey;
  guildmasterSex?: Sex;
  /**
   * A Guildmaster picture in content, of the sex chosen (v1.1.2-S4, DL-125 item 3): with no sex
   * chosen, the Guildmaster is of the picture's. Drawn from the pictures of the sex when omitted.
   */
  guildmasterPortraitKey?: PortraitKey;
  /** A whole number of years from `guildmasterStartingAgeMin` to `Max`. */
  guildmasterAge?: number;
  /** The Traits chosen, within the budget; drawn when omitted, none when empty. */
  guildmasterTraitKeys?: readonly TraitKey[];
  /** Every Guildmaster Stat chosen, within the Stat points (v1.1.4-S11); drawn when omitted. */
  guildmasterStats?: Readonly<StatValues>;
  /** The descriptive Attributes, trimmed by the engine and held to their bounds. */
  guildmasterBirthplace?: string;
  guildmasterAppearance?: string;
  guildmasterBiography?: string;
  /** Stored in `meta` and never read by a rule: the browser's clock (D10.1). */
  createdAt: string;
}

/** Makes a save's text the game: the uncompressed canonical JSON the CLI writes. */
export interface Load {
  kind: 'load';
  text: string;
  /**
   * The save of this browser the text was read from, by its name, when it was one (v1.1.2-S3): a
   * refusal carries it, so the page says why beside that save.
   */
  from?: string;
}

/** Plays `turns` Turns, one unless given, stopping early if the game ends: the CLI's `advance`. */
export interface Advance {
  kind: 'advance';
  turns?: number;
}

/** Plays Turns until a reason to stop: the CLI's `advance --until`, for at most a year by default. */
export interface FastForward {
  kind: 'fastForward';
  /** The opt-in stops as well as the always-on ones. */
  until: readonly StopCondition[];
  maxTurns?: number;
}

/** Everything that calls the engine: one per engine action, and `advance`, `fastForward`, `newGame`, `load`. */
export type Play = NewGame | Load | Advance | FastForward | RebaseAction | PlayerAction;

/** A play on the game in hand: every play but the two that make one. */
export type DocumentPlay = Exclude<Play, NewGame | Load>;

export type DocumentPlayKind = DocumentPlay['kind'];

/** Runs the engine on the play accepted: dispatched by `useGame` once the busy state is painted. */
export interface Settle {
  kind: 'settle';
}

/** Puts a rejection away. */
export interface Dismiss {
  kind: 'dismiss';
}

/**
 * The player's Stop (v1.0.1-S5, DL-96): ends a fast forward between its steps, leaving the game
 * and the log as the last step left them. Not a play, so it is taken while busy.
 */
export interface Stop {
  kind: 'stop';
}

export type GameAction = Play | Settle | Dismiss | Stop;

/**
 * The most Turns one step of a fast forward plays (v1.0.1-S5, DL-96): the page's pacing, how
 * often it paints its progress and a Stop can be taken, and not a rule, so a constant here and
 * not a `GameConfig` field.
 */
export const fastForwardStepTurns = 30;

// ── Rejections ───────────────────────────────────────────────────────────────────────────────

/**
 * A new game's setup that breaks a rule, checked before `createWorld`, which throws on it: the
 * engine's `SetupRefusal`, by its reason, with what it names (DL-102; the refusals' words, DL-240).
 */
export type { NewGameRejection };

/** The Background asked for is not a Guild Background of the content. */
export type UnknownBackground = Extract<NewGameRejection, { reason: 'unknown-background' }>;

/**
 * A save that does not load: the engine's `LoadRefusal`, by its kind, with the rest of it (its
 * message, and an `unsupported-version`'s two versions, v1.1.2-S3); and the save of this browser it
 * was read from, when it was one.
 */
export type LoadRejection = LoadRefusal extends infer Refusal
  ? Refusal extends LoadRefusal
    ? Rejection<'load', Refusal['kind']> & Omit<Refusal, 'kind'> & { from?: string }
    : never
  : never;

/** A play on a game before one is started or loaded. */
export type NoGame = Rejection<DocumentPlayKind, 'no-game'>;

/** A play that needs the player's Guild, on a save that has none. */
export type NoPlayerGuild = AnyNoPlayerGuild<DocumentPlayKind>;

/** A Turn or an action after the player's game has ended: the world stands (DL-28, DL-53). */
export type GameEnded = AnyGameEnded<DocumentPlayKind>;

/** The refusals any play on a game can meet, whichever it is. */
export type GameRefusal = NoGame | NoPlayerGuild | GameEnded;

/** Every way a play can be refused: the engine's rejections and the front end's own, in their shape. */
export type PlayRejection = ActionRejection | NewGameRejection | LoadRejection | GameRefusal;

/**
 * The save of this browser whose load `rejection` refused, by its name: the page says why beside
 * that save, in the list the player chose it from. `null` for any other refusal, and for a file
 * loaded from the player's disk.
 */
export function refusedSave(rejection: PlayRejection | null): string | null {
  return rejection !== null && rejection.action === 'load' && 'from' in rejection ? (rejection.from ?? null) : null;
}

// ── State ────────────────────────────────────────────────────────────────────────────────────

/** How far a fast forward has come over its steps (v1.0.1-S5, DL-96). */
export interface FastForwardProgress {
  /** The opt-in stops it was asked for: "Fast forward again" after a Stop asks for them again. */
  until: readonly StopCondition[];
  /** The Turns its steps have played. */
  turnsPlayed: number;
}

/** A fast forward between its steps (v1.0.1-S5, DL-96): how far it has come, and what it has made. */
export interface Forwarding extends FastForwardProgress {
  /** The game as the last step left it: the next step plays on from it, and a Stop keeps it. */
  document: WorldDocument;
  /** Every step's events, in order: the log once it ends or is stopped. */
  events: TurnEvent[];
}

export interface GameState {
  /** The game in hand, or `null` before one is started or loaded. */
  document: WorldDocument | null;
  /**
   * The events of the last play the engine carried out, in order: a Turn's, an action's; a Turn's
   * include an installed module's own (M8-S2).
   */
  log: TurnEvent[];
  /** Why the last play was refused, or `null`; cleared by the next play carried out, or `dismiss`. */
  rejection: PlayRejection | null;
  /** From a play accepted until its result is stored: a play arriving meanwhile is dropped. */
  busy: boolean;
  /** The play accepted and not yet run: set exactly while `busy`. */
  pending: Play | null;
  /**
   * Why the last `advance` or `fastForward` stopped; `null` after any other play, while a fast
   * forward is between its steps, and after the player's Stop.
   */
  stoppedBecause: StopReason | null;
  /**
   * While a fast forward is between its steps, how far it has come and the game its last step left;
   * `null` otherwise. Set exactly while its rest is `pending` (v1.0.1-S5, DL-96).
   */
  forwarding: Forwarding | null;
  /** The fast forward the player stopped, and how far it came; `null` after any other play. */
  stopped: FastForwardProgress | null;
  /** The loaded save's content keys this content lacks (data-model rule 5); none for a new game. */
  warnings: ValidationWarning[];
  /**
   * How many games have been put in hand, each new game or load one more. The page keys what it
   * shows of a game by it, so a Hero's page or a Guild opened in one game is not open in the next
   * (DL-74).
   */
  games: number;
}

export const initialGameState: GameState = Object.freeze({
  document: null,
  log: [],
  rejection: null,
  busy: false,
  pending: null,
  stoppedBecause: null,
  forwarding: null,
  stopped: null,
  warnings: [],
  games: 0,
});

/** No module installed: the page's default, without its test switch. */
export const noModules: readonly Module[] = Object.freeze([]);

/**
 * The one reducer. A play arriving while idle is accepted: the state is marked `busy` with the
 * play `pending`, and nothing else changes. A play arriving while busy is dropped: the same state
 * comes back. `settle` runs the engine on the pending play, with `modules` installed (M8-S4), and
 * stores the result, a fast forward one step at a time (v1.0.1-S5); `dismiss` puts a rejection
 * away; `stop` ends a fast forward between its steps. Programming errors throw; a refusal never does.
 */
export function gameReducer(state: GameState, action: GameAction, modules: readonly Module[] = noModules): GameState {
  switch (action.kind) {
    case 'settle':
      return state.pending === null ? state : settled(state, state.pending, modules);
    case 'dismiss':
      return state.rejection === null ? state : { ...state, rejection: null };
    case 'stop':
      return state.forwarding === null ? state : stoppedByPlayer(state, state.forwarding);
    default:
      return state.busy ? state : { ...state, busy: true, pending: action };
  }
}

/**
 * The state after the engine has run `play` with `modules` installed: its result stored, or its
 * refusal. A fast forward's step plays on from the game the last step left, and one that leaves
 * Turns to play stays busy with the rest pending, holding its game and every step's events in
 * `forwarding`; the step that ends it stores them as the game and the log.
 */
function settled(state: GameState, play: Play, modules: readonly Module[]): GameState {
  const { forwarding } = state;
  const outcome = run(forwarding?.document ?? state.document, play, modules);
  if (!outcome.ok) return { ...state, rejection: outcome.rejection, busy: false, pending: null, forwarding: null };
  const events = forwarding === null ? outcome.events : [...forwarding.events, ...outcome.events];
  const { rest } = outcome;
  if (rest !== undefined) {
    const turnsPlayed = (forwarding?.turnsPlayed ?? 0) + rest.turnsPlayed;
    return {
      ...state,
      rejection: null,
      pending: rest.play,
      stoppedBecause: null,
      forwarding: { until: rest.play.until, turnsPlayed, document: outcome.document, events },
      stopped: null,
    };
  }
  return {
    document: outcome.document,
    log: events,
    rejection: null,
    busy: false,
    pending: null,
    stoppedBecause: outcome.stoppedBecause ?? null,
    forwarding: null,
    stopped: null,
    warnings: outcome.warnings ?? state.warnings,
    games: play.kind === 'newGame' || play.kind === 'load' ? state.games + 1 : state.games,
  };
}

/** The player's Stop between steps: the game and the log as the last step left them, and how far it came. */
function stoppedByPlayer(state: GameState, { until, turnsPlayed, document, events }: Forwarding): GameState {
  return { ...state, document, log: events, busy: false, pending: null, forwarding: null, stopped: { until, turnsPlayed } };
}

// ── Running a play ───────────────────────────────────────────────────────────────────────────

type Outcome =
  | {
      ok: true;
      document: WorldDocument;
      events: TurnEvent[];
      stoppedBecause?: StopReason | null;
      /** Replaces the state's warnings when given: a new game's none, a load's own. */
      warnings?: ValidationWarning[];
      /** A fast forward's step that left Turns to play: the Turns it played, and the rest, its next step. */
      rest?: { turnsPlayed: number; play: FastForward };
    }
  | { ok: false; rejection: PlayRejection };

/**
 * The deps each config plays under, by the config itself: a document's config is never changed in
 * place, each play keeping its document's or making a new one (`rebase`), so it is filled forward
 * and checked once (DL-241), and let go with the last document that holds it.
 */
const checkedDeps = new WeakMap<object, EngineDeps>();

/**
 * The deps a game plays under, the engine's `playDeps`: its own config, filled forward with the
 * current defaults (D3) and checked, once a config (`checkedDeps`), and the modules installed, none
 * unless given. The selectors, which run no hook, give none. A game in hand was loaded,
 * checked by `deserialise`, or made or rebased under `defaultConfig`, so its config is sound; one
 * that is not is a bug, and throws.
 */
export function playDeps(document: Pick<WorldDocument, 'meta'>, modules: readonly Module[] = noModules): EngineDeps {
  const { config } = document.meta;
  let deps = checkedDeps.get(config);
  if (deps === undefined) {
    const played = enginePlayDeps(document, content);
    if (!played.ok) throw new Error(played.refusal.message);
    deps = played.deps;
    checkedDeps.set(config, deps);
  }
  return modules.length === 0 ? deps : { ...deps, modules };
}

/**
 * The calendar every date of `document` is read by: the config it plays under, `playDeps`'s, so that
 * a date on the page counts the Year its rules count, a setting the save lacks filled forward (DL-210).
 */
export function calendarFor(document: Pick<WorldDocument, 'meta'>): EngineDeps['config'] {
  return playDeps(document).config;
}

/** `{ modules }` when there are any: with none, the deps are what they were before M8. */
function withModules(modules: readonly Module[]): Pick<EngineDeps, 'modules'> {
  return modules.length === 0 ? {} : { modules };
}

/** The engine's own deps, with `modules` installed: to start a game, or rebase one (a save is read by `deserialise`, DL-193). */
function engineDeps(modules: readonly Module[]): EngineDeps {
  return { config: defaultConfig, content, ...withModules(modules) };
}

function run(document: WorldDocument | null, play: Play, modules: readonly Module[]): Outcome {
  if (play.kind === 'newGame') return newGame(play, modules);
  if (play.kind === 'load') return load(play, modules);
  if (document === null) return refused(play.kind, 'no-game');
  // `rebase` adopts the engine's own defaults whatever deps it is given (DL-205); an ended game may too.
  if (play.kind === 'rebase') return applyAction(document, play, engineDeps(modules));

  const { ended } = document.world;
  if (ended !== null) return { ok: false, rejection: { action: play.kind, reason: 'game-ended', ending: ended } };
  const deps = playDeps(document, modules);
  if (play.kind === 'advance') return advanceTurns(document, play.turns ?? 1, deps);

  const guild = playerGuild(document.world);
  if (guild === undefined) return refused(play.kind, 'no-player-guild');
  if (play.kind === 'fastForward') return fastForwardStep(document, guild.id, play, deps);
  return applyAction(document, forGuild(play, guild.id), deps);
}

/**
 * One step of a fast forward (v1.0.1-S5, DL-96): one `fastForward` call of at most
 * `fastForwardStepTurns` of the Turns the play allows, a year unless it names a cap. A step that
 * stops on `max-turns` with Turns of the cap left gives the rest, the same stops and the Turns
 * left, as the next step; any other stop, or the cap reached, ends the fast forward. Every reason
 * to stop is detected from the Turn alone (`engine/src/stops.ts`), so the steps play the Turns one
 * call of the whole cap would, and stop where it would.
 */
function fastForwardStep(document: WorldDocument, guildId: GuildId, play: FastForward, deps: EngineDeps): Outcome {
  const cap = play.maxTurns ?? deps.config.turnsPerYear;
  // The engine's own check on the whole cap, which a step's smaller one would not make.
  if (!Number.isSafeInteger(cap) || cap < 0) throw new RangeError(`maxTurns must be a whole number from 0, not ${cap}`);
  const turns = Math.min(fastForwardStepTurns, cap);
  const step = fastForward(document, { guildId, until: play.until, maxTurns: turns }, deps);
  const left = cap - turns;
  if (step.stoppedBecause.kind !== 'max-turns' || left === 0) return { ok: true, ...step };
  return { ok: true, ...step, rest: { turnsPlayed: turns, play: { kind: 'fastForward', until: play.until, maxTurns: left } } };
}

function refused(action: DocumentPlayKind, reason: (NoGame | NoPlayerGuild)['reason']): Outcome {
  const rejection: NoGame | NoPlayerGuild = reason === 'no-game' ? { action, reason } : { action, reason };
  return { ok: false, rejection };
}

/** The engine's action for the player's play: the same fields, and the player's Guild. */
function forGuild(play: PlayerAction, guildId: GuildId): GuildAction {
  return { ...play, guildId } as GuildAction;
}

/** The engine's setup for `play`: the names trimmed, and whatever of the Guildmaster it chose. */
function setupOf(play: NewGame): WorldSetup {
  const setup: WorldSetup & Partial<Pick<NewGame, 'kind' | 'seed'>> = {
    ...play,
    guildName: play.guildName.trim(),
    guildmasterName: play.guildmasterName.trim(),
  };
  delete setup.kind;
  delete setup.seed;
  return setup;
}

/**
 * Why `play` would be refused, or `null` when it keeps the rules: the engine's `setupRefusal` under
 * the current defaults, the rules a new game begins under (M9-S2), as the page's rejection. The
 * reducer's own check before `createWorld`, and a form's before the click, so the form copies no rule.
 */
export function newGameRefusal(play: NewGame): NewGameRejection | null {
  const refusal = setupRefusal(setupOf(play), { config: defaultConfig, content });
  return refusal === null ? null : ({ action: 'newGame', ...refusal } as NewGameRejection);
}

/** A new world under the current defaults, with `modules` installed, from the names trimmed; a setup that breaks a rule is refused. */
function newGame(play: NewGame, modules: readonly Module[]): Outcome {
  const rejection = newGameRefusal(play);
  if (rejection !== null) return { ok: false, rejection };
  const { document, events } = createWorld(play.seed, setupOf(play), engineDeps(modules));
  return { ok: true, document, events, stoppedBecause: null, warnings: [] };
}

/**
 * A save's text read by the engine, its schema compared with the engine's (DL-20; an older one is
 * refused since schema 5, DL-125 item 10.2) and its config checked, every setting (DL-193), with
 * `modules` installed, so each checks its own slice; a slice none owns is warned of and kept.
 */
function load({ text, from }: Load, modules: readonly Module[]): Outcome {
  const loaded = deserialise(text, { content, ...withModules(modules) });
  if (!loaded.ok) {
    const { kind, ...rest } = loaded.reason;
    const rejection = { action: 'load', reason: kind, ...rest, ...(from === undefined ? {} : { from }) } as LoadRejection;
    return { ok: false, rejection };
  }
  return { ok: true, document: loaded.document, events: [], warnings: loaded.warnings };
}

/** Up to `turns` Turns, stopping after the one that ends the game: the CLI's `advance --turns`. */
function advanceTurns(document: WorldDocument, turns: number, deps: EngineDeps): Outcome {
  if (!Number.isSafeInteger(turns) || turns < 1) throw new RangeError(`advance plays a whole number of Turns from 1, not ${turns}`);
  const events: TurnEvent[] = [];
  let current = document;
  let stoppedBecause: StopReason | null = null;
  for (let played = 0; played < turns && stoppedBecause === null; played += 1) {
    const turn = advance(current, deps);
    current = turn.document;
    events.push(...turn.events);
    stoppedBecause = turn.stoppedBecause;
  }
  return { ok: true, document: current, events, stoppedBecause };
}

// ── React ────────────────────────────────────────────────────────────────────────────────────

/** React's reducer: it stores the state `gameReducer` made, so React may call it as often as it likes. */
function stored(_: GameState, next: GameState): GameState {
  return next;
}

/**
 * Runs `task` once the browser has painted what is committed now: after the next frame, as a task
 * of its own. Where there are no frames (a DOM without `requestAnimationFrame`), as the next task.
 * Gives a way to call it off before it runs, the frame or the task, whichever is waiting.
 */
function afterPaint(task: () => void): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  if (typeof requestAnimationFrame !== 'function') {
    timer = setTimeout(task, 0);
    return () => clearTimeout(timer);
  }
  const frame = requestAnimationFrame(() => {
    timer = setTimeout(task, 0);
  });
  return () => {
    cancelAnimationFrame(frame);
    clearTimeout(timer);
  };
}

/**
 * The game's state and the one way to change it. `play` runs `gameReducer` on the latest state,
 * whether React has rendered it yet or not, so a second play in the same batch finds the first
 * accepted and is dropped; an accepted play is settled, calling the engine once with `modules`
 * installed, after the busy state has been painted, and so is each step of a fast forward after
 * the one before it (v1.0.1-S5). A settle called off by a Stop, or by the pending play changing
 * first, never runs. The page gives the same `modules` for its lifetime.
 */
export function useGame(
  initial: GameState = initialGameState,
  modules: readonly Module[] = noModules,
): [GameState, (action: GameAction) => void] {
  const [state, store] = useReducer(stored, initial);
  const latest = useRef(initial);

  const play = useCallback(
    (action: GameAction): void => {
      const next = gameReducer(latest.current, action, modules);
      if (next === latest.current) return;
      latest.current = next;
      store(next);
    },
    [modules],
  );

  const { pending } = state;
  useEffect(() => (pending === null ? undefined : afterPaint(() => play({ kind: 'settle' }))), [pending, play]);

  return [state, play];
}
