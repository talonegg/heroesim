// The module contract (M8-S1, ADR-0005 as amended 2026-09-25, data-model §3.4, approach §2, N6,
// DL-76): what a module is, how it registers, and where the World Engine calls it. A module owns a
// slice of the World State under its id, may register a random stream of its own, and is called at
// the three positions approach §2 marks `[modules: on…]` in the Turn pipeline.
//
// At a hook (M8-S2, DL-77) a module reads the World State through a read-only view (read-only.ts)
// and the core's selectors (`ctx.select`), changes its own slice in place, changes a core table only
// through its effects (`ctx.effects`, effects.ts), emits events of its own typed by itself
// (`ctx.emit`, `ModuleEvent`), and may ask fast forward to stop (`{ kind: 'module', moduleId }`). It
// returns every event it made, its effects' included, in the order it wants them in the History.
//
// This is the one file of the core that touches the slices: it creates them, hands each to its own
// module, and asks each module to migrate and validate its own. It never reads inside one; a test
// (modules.test.ts) holds every other source file of the engine to not naming the World's slices.
//
// With no module installed, which is every game the front ends and the harness play, nothing here
// draws, writes or emits: the engine plays byte for byte as it did before M8 (DL-76).

import type { EngineDeps, GameConfig, MoraleBand } from './config.js';
import type { ContentSet } from './content-types.js';
import {
  requireRow,
  type EntityId,
  type GuildId,
  type GuildmasterId,
  type Hero,
  type HeroId,
  type ModuleId,
  type Quest,
  type StatValues,
  type Turn,
  type World,
} from './document.js';
import { applyEffect, effectsApi, type ModuleEffects } from './effects.js';
import { eventEmitter, moduleEventEmitter, type ModuleEmit } from './emit.js';
import type { EngineEvent, TurnEvent } from './events.js';
import { formatPath } from './json-safe.js';
import { moraleBand } from './morale.js';
import type { PhaseContext } from './phases/phase.js';
import { readOnlyView, type ReadonlyDeep } from './read-only.js';
import { regardValue } from './regard.js';
import { chance, createStreams, int, next, pick, shuffle, streamNames, weightedPick, type StreamName } from './rng.js';
import { effectiveStats, offeredQuests, rankings, unattachedHeroes, upkeep, type Ranking, type RankingMeasure } from './selectors.js';
import type { SavedDocument } from './serialise.js';
import type { ModuleStopReason } from './stops.js';
import { ageOf } from './time.js';
import type { ValidationFailure, ValidationWarning } from './validate.js';

// ── The contract ─────────────────────────────────────────────────────────────────────────────

/** The three positions in the Turn pipeline where modules are called (approach §2). */
export const hookNames = ['onMorning', 'onAfternoon', 'onNight'] as const;

export type HookName = (typeof hookNames)[number];

/**
 * A module's own random stream, drawn as a core stream is (rng.ts), one draw per call but
 * `shuffle`'s. It is the only randomness a module has: a module that draws moves no core stream.
 */
export interface ModuleRandom {
  next(): number;
  int(min: number, max: number): number;
  chance(p: number): boolean;
  pick<T>(items: readonly T[]): T;
  shuffle<T>(items: readonly T[]): T[];
  weightedPick<T>(items: readonly T[], weights: readonly number[]): T;
}

/** The World State as a hook sees it: read-only all the way down (read-only.ts, M8-S2). */
export type ReadonlyWorld = ReadonlyDeep<World>;

/** What a module is given when its slice is made. */
export interface SliceContext {
  /** The rules in force, `deps.config`, read-only. */
  config: ReadonlyDeep<GameConfig>;
  /** The content, `deps.content`, read-only. */
  content: ReadonlyDeep<ContentSet>;
  /** The Turn of the world the slice is made in: 0 at `createWorld`. */
  turn: Turn;
  /** The module's own stream; every draw throws for a module that registered none. */
  rng: ModuleRandom;
}

/**
 * The core's selectors over the Turn's World State, as it stands at the call (an effect applied a
 * moment ago included), for a hook to read derived values the way the core reads them (M8-S2). A row
 * one returns is read-only, as the world is. Each throws on an id the world does not hold. None
 * says which Guild is the player's: a module is a rule, and no rule asks (ADR-0002 and its listed exceptions).
 */
export interface ModuleSelectors {
  /** The Unattached pool, in id order (`unattachedHeroes`). */
  unattachedHeroes(): ReadonlyDeep<Hero>[];
  /** The Quests on offer, in the Board's order (`offeredQuests`). */
  offeredQuests(): ReadonlyDeep<Quest>[];
  /** The Rankings by Fame or Wealth (`rankings`). */
  rankings(by: RankingMeasure): Ranking[];
  /** A Guild's Upkeep, a month of its costs, the measure every reader of Upkeeps counts in (`upkeep`, DL-300). */
  upkeep(guildId: GuildId): number;
  /** A Hero's effective Stats (`effectiveStats`). */
  effectiveStats(heroId: HeroId): StatValues;
  /** The band a Hero's Morale is in (`moraleBand`). */
  moraleBand(heroId: HeroId): MoraleBand;
  /** The Regard `holderId`'s row holds for `entityId`: 0, neutral, when it holds none (`regardValue`). */
  regard(holderId: EntityId, entityId: EntityId): number;
  /** A Hero's or Guildmaster's age in whole years, this Turn (`ageOf`). */
  age(personId: HeroId | GuildmasterId): number;
}

/**
 * What a module is given at a hook, beside the World State, read-only, and its slice (DL-76,
 * DL-77).
 */
export interface ModuleContext extends SliceContext {
  /** The Turn being played. */
  turn: Turn;
  /**
   * Makes one of the module's own events, typed `<module id>.<what-happened>` and by the module, not
   * the engine (`ModuleEvent`, `moduleEventEmitter`); not a Milestone unless the draft says so. The
   * event is the History's copy, frozen, its payload copied from the draft's (DL-80).
   */
  emit: ModuleEmit;
  /** The core's selectors over the Turn's world. */
  select: ModuleSelectors;
  /**
   * The only way the module changes a core table (effects.ts): each effect runs the core's own rule
   * and returns the core's own events, frozen as the History keeps them (DL-80), which the hook must
   * return among its events.
   */
  effects: ModuleEffects;
}

/**
 * What a hook returns (M8-S2, DL-77):
 *
 * - `events`: every event the hook made, in the order the History is to hold them: its own, from
 *   `ctx.emit`, and each of its effects' events. The core refuses a hook that returns an event it
 *   did not make in that call, or leaves out one its effects made, since then a core row would change
 *   with nothing to explain it.
 * - `stop`: a reason for fast forward to stop after this Turn, `{ kind: 'module', moduleId }` naming
 *   the module itself: always on, whoever is watching.
 */
export interface ModuleResult {
  events: readonly TurnEvent[];
  stop?: ModuleStopReason;
}

/**
 * Why a module refuses its slice: where in the slice (`[]` for the slice itself) and prose. The
 * validator reports it as a `module-slice` failure at `$.world.modules.<id>` followed by `at`.
 */
export interface SliceFailure {
  at: readonly (string | number)[];
  detail: string;
}

/**
 * A module (ADR-0005): code, not content, registered through `deps.modules` in the order its hooks
 * run. It owns its slice: it makes it, migrates and validates it, and at its hooks changes it in
 * place, in the Turn's copy of the World State. The slice is JSON-safe (data-model rule 6).
 *
 * Every method is called with the module as `this`. A hook or `createSlice` that throws is a
 * programming error in the module: `ModuleError` names it. A `migrateSlice` or `validateSlice` that
 * throws refuses the document instead, as a `module-slice` failure naming the module, since the
 * validator never throws and a save is outside the engine's control.
 *
 * What a call is given lasts for that call (M8 verification, DL-80): its `ctx` throws once it has
 * returned, and the events it is handed are the History's own, frozen. A module keeps nothing
 * between calls but its slice, which it reads from its argument each time: a slice, a world or a
 * context kept from an earlier call belongs to a document the engine has already handed back.
 */
export interface Module<Slice = unknown> {
  /** The key of its slice, unique among the installed modules. */
  readonly id: ModuleId;
  /**
   * The name of its random stream, when it draws: neither a core stream's name nor another
   * installed module's (`installedModules` refuses both), and neither empty nor with `:`
   * (`createStreams` refuses both as it makes the stream). Seeded from the master seed and this name
   * alone, as a core stream is.
   */
  readonly streamName?: string;
  /** Its slice for a world that has none: a new world's, or a save's made before it was installed. */
  createSlice(ctx: SliceContext): Slice;
  /** Its refusals of a slice read from a save, after `migrateSlice`: none when it accepts it. */
  validateSlice(slice: unknown): SliceFailure[];
  /**
   * A slice read from a save brought to the shape this module's code reads, or returned as it is
   * when it already has it. The module keeps any version it needs inside its slice (data-model §3.4)
   * and reads it here: the core, which never reads inside a slice, passes none.
   */
  migrateSlice?(slice: unknown): Slice;
  /**
   * The hooks, each at its position in the Turn (approach §2), with the Turn's World State as a
   * read-only view (`ReadonlyWorld`: assigning to it throws), its slice to change in place, and its
   * context.
   */
  onMorning?(world: ReadonlyWorld, slice: Slice, ctx: ModuleContext): ModuleResult;
  onAfternoon?(world: ReadonlyWorld, slice: Slice, ctx: ModuleContext): ModuleResult;
  onNight?(world: ReadonlyWorld, slice: Slice, ctx: ModuleContext): ModuleResult;
}

/**
 * A module threw: a programming error, since modules are code, not content. Names the module and
 * what it was doing, with what it threw as the `cause`.
 */
export class ModuleError extends Error {
  readonly moduleId: ModuleId;
  readonly during: HookName | 'createSlice';

  constructor(moduleId: ModuleId, during: HookName | 'createSlice', cause: unknown) {
    const why = cause instanceof Error ? cause.message : String(cause);
    super(`The ${moduleId} module threw in ${during}: ${why}`, { cause });
    this.name = 'ModuleError';
    this.moduleId = moduleId;
    this.during = during;
  }
}

// ── Registration ─────────────────────────────────────────────────────────────────────────────

/**
 * `deps.modules`, none when absent, once each id and stream name is known to be usable. Throws a
 * RangeError, a programming error, on an empty id, two modules with one id, or a stream named as
 * a core stream or another module's is.
 */
export function installedModules(deps: Pick<EngineDeps, 'modules'>): readonly Module[] {
  const modules = deps.modules ?? [];
  if (modules.length === 0) return modules;
  const ids = new Set<string>();
  const names = new Set<string>(streamNames);
  for (const module of modules) {
    if (module.id.length === 0) throw new RangeError('A module has an empty id');
    if (ids.has(module.id)) throw new RangeError(`Two modules have the id ${module.id}`);
    ids.add(module.id);
    const { streamName } = module;
    if (streamName === undefined) continue;
    if (names.has(streamName)) {
      throw new RangeError(`The ${module.id} module's stream ${JSON.stringify(streamName)} is a core stream's or another module's`);
    }
    names.add(streamName);
  }
  return modules;
}

/** One stream's state, reached through `world.rng` as the rest of the engine reaches it. */
type Stream = World['rng'][StreamName];

/** Every stream, the modules' beside the core's: a module's is keyed by its own name. */
function streamsOf(world: World): Record<string, Stream> {
  return world.rng;
}

/**
 * Gives `world` each installed module's stream and slice that it lacks, in registration order: the
 * stream seeded from `seed` and its name as `createStreams` seeds a core stream, then the slice
 * `createSlice` makes. Leaves every stream and slice it has alone, a slice no installed module owns
 * included. `createWorld` calls it on the new world, and `advance` on its copy, so a save made
 * before a module was installed gains them the first time it is played, as it gains a core stream
 * (`ensureStreams`, DL-25). With no module installed it changes nothing.
 */
export function ensureModules(world: World, seed: string, deps: EngineDeps): void {
  for (const module of installedModules(deps)) {
    const { id, streamName } = module;
    const streams = streamsOf(world);
    if (streamName !== undefined && !Object.hasOwn(streams, streamName)) {
      Object.assign(streams, createStreams(seed, [streamName]));
    }
    if (Object.hasOwn(world.modules, id)) continue;
    const call = openCall(module);
    const ctx: SliceContext = { ...readOnlyDeps(deps), turn: world.turn, rng: randomOf(module, world, call) };
    try {
      world.modules[id] = guarded(module, 'createSlice', () => module.createSlice(ctx));
    } finally {
      call.close();
    }
  }
}

/** `deps`' rules and content as a module sees them: read-only. */
function readOnlyDeps(deps: EngineDeps): Pick<SliceContext, 'config' | 'content'> {
  return { config: readOnlyView(deps.config, 'The config'), content: readOnlyView(deps.content, 'The content') };
}

/** Runs `work` for `module`, throwing a `ModuleError` naming it and `during` if it throws. */
function guarded<Result>(module: Module, during: HookName | 'createSlice', work: () => Result): Result {
  try {
    return work();
  } catch (error) {
    throw new ModuleError(module.id, during, error);
  }
}

/**
 * One call of a module's (a hook, or `createSlice`): what it is given works until the call returns
 * and throws after, so a module that keeps its `ctx` cannot use it later, on a world that is by then
 * a document the engine has handed back, or from another module's hook (M8 verification, DL-80).
 */
interface ModuleCall {
  /** Throws once the call has returned. */
  check(): void;
  close(): void;
}

function openCall(module: Module): ModuleCall {
  let open = true;
  return {
    check: () => {
      if (!open) {
        throw new RangeError(`The ${module.id} module's context was used after the call it was given to returned: a ctx lasts for its call`);
      }
    },
    close: () => {
      open = false;
    },
  };
}

/** The module's own stream in `world`, bound for `call`; one whose every draw throws when it registered none. */
function randomOf(module: Module, world: World, call: ModuleCall): ModuleRandom {
  const { streamName } = module;
  const state = streamName === undefined ? undefined : streamsOf(world)[streamName];
  const stream = (): Stream => {
    call.check();
    if (state === undefined) throw new RangeError(`The ${module.id} module registered no stream to draw from`);
    return state;
  };
  return {
    next: () => next(stream()),
    int: (min, max) => int(stream(), min, max),
    chance: (p) => chance(stream(), p),
    pick: (items) => pick(stream(), items),
    shuffle: (items) => shuffle(stream(), items),
    weightedPick: (items, weights) => weightedPick(stream(), items, weights),
  };
}

// ── The hooks ────────────────────────────────────────────────────────────────────────────────

/**
 * The pipeline's phase for `hook` (pipeline.ts): calls each installed module that has the hook, in
 * registration order, with the Turn's world as a read-only view, its slice and its context, and
 * returns their events in that order; a stop a hook asks for joins `ctx.moduleStops`. Throws a
 * `ModuleError` naming the first module that throws, assigns to the World State, or returns what
 * `checkedResult` refuses. With no module installed it does nothing.
 */
export function hookPhase(hook: HookName): (world: World, ctx: PhaseContext) => TurnEvent[] {
  return (world, ctx) => {
    const events: TurnEvent[] = [];
    if (ctx.modules.length === 0) return events;
    const view = readOnlyView(world, 'The World State');
    const deps = readOnlyDeps(ctx);
    for (const module of ctx.modules) {
      const run = module[hook];
      if (run === undefined) continue;
      const made = new Set<TurnEvent>();
      const fromEffects = new Set<EngineEvent>();
      const call = openCall(module);
      const moduleCtx = hookContext(module, world, view, ctx, deps, { made, fromEffects }, call);
      let result: CheckedResult;
      try {
        result = guarded(module, hook, () =>
          checkedResult(module, run.call(module, view, world.modules[module.id], moduleCtx), made, fromEffects),
        );
      } finally {
        call.close();
      }
      events.push(...result.events);
      if (result.stop !== undefined) ctx.moduleStops.push(result.stop);
    }
    return events;
  };
}

/** The events one hook call made: all of them, and those its effects made. */
interface Made {
  made: Set<TurnEvent>;
  fromEffects: Set<EngineEvent>;
}

/**
 * The context `module`'s hook is given on `world`, the Turn's copy, seen as `view`, for `call`: each
 * of its functions throws once the hook has returned.
 *
 * Every event it hands the hook, from `emit` or an effect, is settled (`settled`): the History's own
 * copy, frozen, so what the hook returns is what the core made, and no module can retype or rewrite
 * an event, its own or an effect's, before it returns it or in a later Turn (M8 verification, DL-80).
 */
function hookContext(
  module: Module,
  world: World,
  view: ReadonlyWorld,
  ctx: PhaseContext,
  deps: Pick<SliceContext, 'config' | 'content'>,
  { made, fromEffects }: Made,
  call: ModuleCall,
): ModuleContext {
  const moduleEmit = moduleEventEmitter(world, module.id);
  const effectCtx = {
    moduleId: module.id,
    streamName: module.streamName,
    config: ctx.config,
    content: ctx.content,
    turn: ctx.turn,
    emit: eventEmitter(world),
  };
  return {
    ...deps,
    turn: ctx.turn,
    rng: randomOf(module, world, call),
    emit: (draft) => {
      call.check();
      const event = settled(moduleEmit(draft));
      made.add(event);
      return event;
    },
    select: selectorsOver(view, ctx, call),
    effects: effectsApi((effect) => {
      call.check();
      const result = applyEffect(world, effect, effectCtx);
      if (!result.ok) return result;
      const events = result.events.map(settled);
      for (const event of events) {
        made.add(event);
        fromEffects.add(event);
      }
      return { ok: true, effect: result.effect, events };
    }),
  };
}

/**
 * `event` as the History keeps it from a module's hook: a copy of its JSON data (a view of the world
 * in a module's payload read through into plain data), every object and list in it frozen, so that
 * nothing the module keeps can change it. A value that is not JSON data (a `Date`, a function) is
 * left as it is, for the validator to refuse (data-model rule 6, DL-18).
 */
function settled<Event extends TurnEvent>(event: Event): Event {
  return frozenCopy(event) as Event;
}

function frozenCopy(value: unknown): unknown {
  if (typeof value !== 'object' || value === null) return value;
  if (Array.isArray(value)) return Object.freeze(Array.from(value as unknown[], frozenCopy));
  const prototype: unknown = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return value;
  const copy: Record<string, unknown> = {};
  for (const key of Object.keys(value)) copy[key] = frozenCopy((value as Record<string, unknown>)[key]);
  return Object.freeze(copy);
}

/** A hook's result once `checkedResult` has read it: its events and its stop, the core's own copies. */
interface CheckedResult {
  events: TurnEvent[];
  stop?: ModuleStopReason;
}

/**
 * `result` once it keeps the contract (`ModuleResult`): its events each made by this call, once;
 * every event its effects made among them; and its stop, if any, the module's own. Throws otherwise:
 * a programming error in the module, which `hookPhase` reports as a `ModuleError`. Its events are
 * read once and its stop is copied, so nothing the module keeps changes what the Turn reports.
 */
function checkedResult(module: Module, result: ModuleResult, made: Set<TurnEvent>, fromEffects: Set<EngineEvent>): CheckedResult {
  if (typeof result !== 'object' || result === null || !Array.isArray(result.events)) {
    throw new TypeError('A hook returns { events, stop? }');
  }
  const events = [...result.events];
  const returned = new Set<TurnEvent>();
  for (const event of events) {
    if (!made.has(event) || returned.has(event)) {
      throw new RangeError(`It returned an event it did not make in this hook, or one twice: ${String(event?.type)}`);
    }
    returned.add(event);
  }
  for (const event of fromEffects) {
    if (!returned.has(event)) throw new RangeError(`It applied an effect and left out its event ${event.type}`);
  }
  const { stop } = result;
  if (stop === undefined) return { events };
  if (stop.kind !== 'module' || stop.moduleId !== module.id) {
    throw new RangeError(`A module's stop is { kind: 'module', moduleId: '${module.id}' }; got ${JSON.stringify(stop)}`);
  }
  return { events, stop: { kind: 'module', moduleId: module.id } };
}

/** The core's selectors bound to `view`, the Turn's world, and `ctx`'s rules and content, for `call`. */
function selectorsOver(view: ReadonlyWorld, ctx: PhaseContext, call: ModuleCall): ModuleSelectors {
  // The selectors read and never write, so the view serves as the world they are written against.
  const world = view as unknown as World;
  const { config, content, turn } = ctx;
  const holderOf = (id: EntityId): { regard: World['heroes'][HeroId]['regard'] } => {
    for (const table of ['patrons', 'guildmasters', 'heroes', 'guilds'] as const) {
      const rows: Readonly<Record<string, { regard: World['heroes'][HeroId]['regard'] }>> = world[table];
      if (Object.hasOwn(rows, id)) return requireRow(rows, id);
    }
    throw new RangeError(`${id} holds no Regard in the world`);
  };
  const selectors: ModuleSelectors = {
    unattachedHeroes: () => unattachedHeroes(world),
    offeredQuests: () => offeredQuests(world),
    rankings: (by) => rankings(world, by),
    upkeep: (guildId) => upkeep(requireRow(world.guilds, guildId), world, config, content),
    effectiveStats: (heroId) => effectiveStats(requireRow(world.heroes, heroId), world, content),
    moraleBand: (heroId) => moraleBand(requireRow(world.heroes, heroId).morale, config),
    regard: (holderId, entityId) => regardValue(holderOf(holderId).regard, entityId),
    age: (personId) => ageOf(Object.hasOwn(world.heroes, personId) ? requireRow(world.heroes, personId) : requireRow(world.guildmasters, personId), turn, config),
  };
  // Each selector works for the call it was given to, as the rest of the context does.
  const bound = Object.entries(selectors).map(([name, select]: [string, (...args: never[]) => unknown]) => [
    name,
    (...args: never[]) => {
      call.check();
      return select(...args);
    },
  ]);
  return Object.fromEntries(bound) as unknown as ModuleSelectors;
}

// ── Loading and validating ───────────────────────────────────────────────────────────────────

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function sliceFailure(id: ModuleId, at: readonly (string | number)[], detail: string): ValidationFailure {
  return { check: 'module-slice', id: formatPath(['world', 'modules', id, ...at]), detail };
}

function thrownMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * A save's slices brought forward by their modules (`migrateSlice`), after the core's migration
 * chain and before the validator: each installed module that has the method is given its slice
 * when the save has one. A module that throws on its slice refuses the load with a `module-slice`
 * failure naming it. Changes nothing it does not recognise, leaving a damaged save for the
 * validator to refuse, and never changes its input.
 */
export function migrateSlices(
  document: SavedDocument,
  deps: Pick<EngineDeps, 'modules'>,
): { ok: true; document: SavedDocument } | { ok: false; failures: ValidationFailure[] } {
  const { world } = document;
  if (!isObject(world) || !isObject(world.modules)) return { ok: true, document };
  const slices: Record<string, unknown> = { ...world.modules };
  const failures: ValidationFailure[] = [];
  for (const module of installedModules(deps)) {
    const { id, migrateSlice } = module;
    if (migrateSlice === undefined || !Object.hasOwn(slices, id)) continue;
    try {
      slices[id] = migrateSlice.call(module, slices[id]);
    } catch (error) {
      failures.push(sliceFailure(id, [], `The ${id} module could not migrate its slice: ${thrownMessage(error)}`));
    }
  }
  if (failures.length > 0) return { ok: false, failures };
  return { ok: true, document: { ...document, world: { ...world, modules: slices } } };
}

/**
 * Each installed module's refusals of its slice in a well-shaped `world` (`validateSlice`), as
 * `module-slice` failures; a module that throws on its slice refuses it. An installed module with
 * no slice is not asked: the world gains it when next played (`ensureModules`).
 */
export function sliceFailures(world: World, deps: Pick<EngineDeps, 'modules'>): ValidationFailure[] {
  const failures: ValidationFailure[] = [];
  for (const module of installedModules(deps)) {
    const { id } = module;
    if (!Object.hasOwn(world.modules, id)) continue;
    try {
      for (const { at, detail } of module.validateSlice(world.modules[id])) failures.push(sliceFailure(id, at, detail));
    } catch (error) {
      failures.push(sliceFailure(id, [], `The ${id} module could not read its slice: ${thrownMessage(error)}`));
    }
  }
  return failures;
}

/**
 * An `unknown-module` warning for each slice in `world` that no installed module owns: kept and
 * never read, as an unknown content key is (data-model rule 5); its module may have been
 * uninstalled.
 */
export function unknownSlices(world: World, deps: Pick<EngineDeps, 'modules'>): ValidationWarning[] {
  const installed = new Set(installedModules(deps).map((module) => module.id));
  return Object.keys(world.modules)
    .filter((id) => !installed.has(id))
    .map((id) => ({
      check: 'unknown-module',
      id: formatPath(['world', 'modules', id]),
      key: id,
      detail: `No installed module owns the slice ${JSON.stringify(id)}: it is kept and never read`,
    }));
}
