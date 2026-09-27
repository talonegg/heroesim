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
// The rules a game plays under are the CLI's (`cli/src/saves.ts`, data-model §2, pre-M0 review D3):
// a save is read with the engine's own `defaultConfig`, so its schema version is compared and
// migrated (DL-20); it is played with `{ ...defaultConfig, ...meta.config }`; a new game starts
// under `defaultConfig`; `rebase` adopts `defaultConfig`.

import { useCallback, useEffect, useReducer, useRef } from 'react';
import {
  advance,
  applyAction,
  createWorld,
  defaultConfig,
  deserialise,
  fastForward,
  playerGuild,
  rebase,
  type ActionRejection,
  type BackgroundKey,
  type EngineDeps,
  type TurnEvent,
  type Ending,
  type GuildAction,
  type GuildId,
  type LoadRefusal,
  type RebaseAction,
  type Rejection,
  type StopCondition,
  type StopReason,
  type ValidationWarning,
  type WorldDocument,
} from '@heroesim/engine';
import { content } from '../content';

// ── Plays ────────────────────────────────────────────────────────────────────────────────────

/** A Guild's action as the player takes it: the engine's own, less the Guild, always the player's. */
export type PlayerAction = GuildAction extends infer Action
  ? Action extends GuildAction
    ? Omit<Action, 'guildId'>
    : never
  : never;

/** Starts a game from a seed and the player's choices. The seed and the clock are the caller's. */
export interface NewGame {
  kind: 'newGame';
  seed: string;
  guildName: string;
  guildmasterName: string;
  /** A Guild Background; drawn as a Rival's is when omitted. */
  backgroundKey?: BackgroundKey;
  /** Stored in `meta` and never read by a rule: the browser's clock (D10.1). */
  createdAt: string;
}

/** Makes a save's text the game: the uncompressed canonical JSON the CLI writes. */
export interface Load {
  kind: 'load';
  text: string;
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

export type GameAction = Play | Settle | Dismiss;

// ── Rejections ───────────────────────────────────────────────────────────────────────────────

/** A new game's names and Background, checked before `createWorld`, which throws on them. */
export type NewGameRejection =
  | Rejection<'newGame', 'guild-name-blank'>
  | Rejection<'newGame', 'guildmaster-name-blank'>
  | UnknownBackground;

/** The Background asked for is not a Guild Background of the content. */
export interface UnknownBackground extends Rejection<'newGame', 'unknown-background'> {
  backgroundKey: BackgroundKey;
}

/** A save that does not load: the engine's `LoadRefusal`, by its kind, with its message. */
export type LoadRejection = LoadRefusal extends infer Refusal
  ? Refusal extends LoadRefusal
    ? Rejection<'load', Refusal['kind']> & { message: string }
    : never
  : never;

/** A play on a game before one is started or loaded. */
export type NoGame = Rejection<DocumentPlayKind, 'no-game'>;

/** A play that needs the player's Guild, on a save that has none. */
export type NoPlayerGuild = Rejection<DocumentPlayKind, 'no-player-guild'>;

/** A Turn or an action after the player's game has ended: the world stands (DL-28, DL-53). */
export interface GameEnded extends Rejection<DocumentPlayKind, 'game-ended'> {
  ending: Ending;
}

/** The refusals any play on a game can meet, whichever it is. */
export type GameRefusal = NoGame | NoPlayerGuild | GameEnded;

/** Every way a play can be refused: the engine's rejections and the front end's own, in their shape. */
export type PlayRejection = ActionRejection | NewGameRejection | LoadRejection | GameRefusal;

// ── State ────────────────────────────────────────────────────────────────────────────────────

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
  /** Why the last `advance` or `fastForward` stopped; `null` after any other play. */
  stoppedBecause: StopReason | null;
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
  warnings: [],
  games: 0,
});

/**
 * The one reducer. A play arriving while idle is accepted: the state is marked `busy` with the
 * play `pending`, and nothing else changes. A play arriving while busy is dropped: the same state
 * comes back. `settle` runs the engine on the pending play and stores the result; `dismiss` puts
 * a rejection away. Programming errors throw; a refusal never does.
 */
export function gameReducer(state: GameState, action: GameAction): GameState {
  switch (action.kind) {
    case 'settle':
      return state.pending === null ? state : settled(state, state.pending);
    case 'dismiss':
      return state.rejection === null ? state : { ...state, rejection: null };
    default:
      return state.busy ? state : { ...state, busy: true, pending: action };
  }
}

/** The state after the engine has run `play`: its result stored, or its refusal. */
function settled(state: GameState, play: Play): GameState {
  const outcome = run(state.document, play);
  if (!outcome.ok) return { ...state, rejection: outcome.rejection, busy: false, pending: null };
  return {
    document: outcome.document,
    log: outcome.events,
    rejection: null,
    busy: false,
    pending: null,
    stoppedBecause: outcome.stoppedBecause ?? null,
    warnings: outcome.warnings ?? state.warnings,
    games: play.kind === 'newGame' || play.kind === 'load' ? state.games + 1 : state.games,
  };
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
    }
  | { ok: false; rejection: PlayRejection };

/** The deps a game plays under: its own config, filled forward with the current defaults (D3). */
export function playDeps(document: WorldDocument): EngineDeps {
  return { config: { ...defaultConfig, ...document.meta.config }, content };
}

/** The engine's own deps: to read a save (DL-20), start a game, and rebase one. */
const engineDeps: EngineDeps = { config: defaultConfig, content };

function run(document: WorldDocument | null, play: Play): Outcome {
  if (play.kind === 'newGame') return newGame(play);
  if (play.kind === 'load') return load(play.text);
  if (document === null) return refused(play.kind, 'no-game');
  // Not the play deps: under them every save would already be current (the CLI's `rebase`).
  if (play.kind === 'rebase') return rebase(document, engineDeps);

  const { ended } = document.world;
  if (ended !== null) return { ok: false, rejection: { action: play.kind, reason: 'game-ended', ending: ended } };
  const deps = playDeps(document);
  if (play.kind === 'advance') return advanceTurns(document, play.turns ?? 1, deps);

  const guild = playerGuild(document.world);
  if (guild === undefined) return refused(play.kind, 'no-player-guild');
  if (play.kind === 'fastForward') {
    const maxTurns = play.maxTurns ?? deps.config.turnsPerYear;
    return { ok: true, ...fastForward(document, { guildId: guild.id, until: play.until, maxTurns }, deps) };
  }
  return applyAction(document, forGuild(play, guild.id), deps);
}

function refused(action: DocumentPlayKind, reason: (NoGame | NoPlayerGuild)['reason']): Outcome {
  const rejection: NoGame | NoPlayerGuild = reason === 'no-game' ? { action, reason } : { action, reason };
  return { ok: false, rejection };
}

/** The engine's action for the player's play: the same fields, and the player's Guild. */
function forGuild(play: PlayerAction, guildId: GuildId): GuildAction {
  return { ...play, guildId } as GuildAction;
}

/** Whether `key` names a Guild Background: the check `createWorld` would throw on (the CLI's `new`). */
function isGuildBackground(key: BackgroundKey): boolean {
  return Object.hasOwn(content.backgrounds, key) && content.backgrounds[key]?.owner === 'guild';
}

/** A new world under the current defaults, from the names trimmed; blank names are refused. */
function newGame(play: NewGame): Outcome {
  const guildName = play.guildName.trim();
  const guildmasterName = play.guildmasterName.trim();
  if (guildName === '') return { ok: false, rejection: { action: 'newGame', reason: 'guild-name-blank' } };
  if (guildmasterName === '') return { ok: false, rejection: { action: 'newGame', reason: 'guildmaster-name-blank' } };
  const { backgroundKey } = play;
  if (backgroundKey !== undefined && !isGuildBackground(backgroundKey)) {
    return { ok: false, rejection: { action: 'newGame', reason: 'unknown-background', backgroundKey } };
  }
  const setup = { guildName, guildmasterName, createdAt: play.createdAt, ...(backgroundKey === undefined ? {} : { backgroundKey }) };
  const { document, events } = createWorld(play.seed, setup, engineDeps);
  return { ok: true, document, events, stoppedBecause: null, warnings: [] };
}

/** A save's text read with the engine's own config, so an older schema is migrated first (DL-20). */
function load(text: string): Outcome {
  const loaded = deserialise(text, engineDeps);
  if (!loaded.ok) {
    const { kind, message } = loaded.reason;
    return { ok: false, rejection: { action: 'load', reason: kind, message } as LoadRejection };
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
 * of its own. Where there are no frames (a test's DOM), as the next task.
 */
function afterPaint(task: () => void): void {
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => setTimeout(task, 0));
  else setTimeout(task, 0);
}

/**
 * The game's state and the one way to change it. `play` runs `gameReducer` on the latest state,
 * whether React has rendered it yet or not, so a second play in the same batch finds the first
 * accepted and is dropped; an accepted play is settled, calling the engine once, after the busy
 * state has been painted.
 */
export function useGame(initial: GameState = initialGameState): [GameState, (action: GameAction) => void] {
  const [state, store] = useReducer(stored, initial);
  const latest = useRef(initial);

  const play = useCallback((action: GameAction): void => {
    const next = gameReducer(latest.current, action);
    if (next === latest.current) return;
    latest.current = next;
    store(next);
  }, []);

  const { pending } = state;
  useEffect(() => {
    if (pending !== null) afterPaint(() => play({ kind: 'settle' }));
  }, [pending, play]);

  return [state, play];
}
