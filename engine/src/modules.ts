// The module contract (M8-S1, ADR-0005 as amended 2026-09-25, data-model §3.4, approach §2, N6,
// DL-76): what a module is, how it registers, and where the World Engine calls it. A module owns a
// slice of the World State under its id, may register a random stream of its own, and is called at
// the three positions approach §2 marks `[modules: on…]` in the Turn pipeline.
//
// This is the one file of the core that touches the slices: it creates them, hands each to its own
// module, and asks each module to migrate and validate its own. It never reads inside one; a test
// (modules.test.ts) holds every other source file of the engine to not naming the World's slices.
//
// With no module installed, which is every game the front ends and the harness play, nothing here
// draws, writes or emits: the engine plays byte for byte as it did before M8 (DL-76).

import type { EngineDeps, GameConfig } from './config.js';
import type { ContentSet } from './content-types.js';
import type { ModuleId, Turn, World } from './document.js';
import { eventEmitter, type Emit } from './emit.js';
import type { EngineEvent } from './events.js';
import { formatPath } from './json-safe.js';
import type { PhaseContext, PhaseRun } from './phases/phase.js';
import { chance, createStreams, int, next, pick, shuffle, streamNames, weightedPick, type StreamName } from './rng.js';
import type { SavedDocument } from './serialise.js';
import type { StopReason } from './stops.js';
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

/** What a module is given when its slice is made. */
export interface SliceContext {
  /** The rules in force: `deps.config`. */
  config: GameConfig;
  content: ContentSet;
  /** The Turn of the world the slice is made in: 0 at `createWorld`. */
  turn: Turn;
  /** The module's own stream; every draw throws for a module that registered none. */
  rng: ModuleRandom;
}

/**
 * What a module is given at a hook, beside the World State and its slice. The minimal context of
 * M8-S1: M8-S2 adds the read-only selectors and the `effects` API.
 */
export interface ModuleContext extends SliceContext {
  /** The Turn being played. */
  turn: Turn;
  /** The pipeline's `emit`, reading the Turn's world (emit.ts). */
  emit: Emit;
}

/**
 * What a hook returns: the events it made, which join the Turn's at the hook's position, and a
 * reason for fast forward to stop. M8-S1 plays the events; the stop is M8-S2's to report.
 */
export interface ModuleResult {
  events: EngineEvent[];
  stop?: StopReason;
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
 * Every method is called with the module as `this`. A hook, `createSlice` or `validateSlice` that
 * throws is a programming error in the module: `ModuleError` names it (`migrateSlice` and
 * `validateSlice` reading a save refuse the load instead, since a save is outside the engine's
 * control).
 */
export interface Module<Slice = unknown> {
  /** The key of its slice, unique among the installed modules. */
  readonly id: ModuleId;
  /**
   * The name of its random stream, when it draws: unique, neither a core stream's name nor empty,
   * and without `:`. Seeded from the master seed and this name alone, as a core stream is.
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
  onMorning?(world: Readonly<World>, slice: Slice, ctx: ModuleContext): ModuleResult;
  onAfternoon?(world: Readonly<World>, slice: Slice, ctx: ModuleContext): ModuleResult;
  onNight?(world: Readonly<World>, slice: Slice, ctx: ModuleContext): ModuleResult;
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
export function installedModules(deps: EngineDeps): readonly Module[] {
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
    const ctx: SliceContext = { config: deps.config, content: deps.content, turn: world.turn, rng: randomOf(module, world) };
    world.modules[id] = guarded(module, 'createSlice', () => module.createSlice(ctx));
  }
}

/** Runs `work` for `module`, throwing a `ModuleError` naming it and `during` if it throws. */
function guarded<Result>(module: Module, during: HookName | 'createSlice', work: () => Result): Result {
  try {
    return work();
  } catch (error) {
    throw new ModuleError(module.id, during, error);
  }
}

/** The module's own stream in `world`, bound; one whose every draw throws when it registered none. */
function randomOf(module: Module, world: World): ModuleRandom {
  const { streamName } = module;
  const state = streamName === undefined ? undefined : streamsOf(world)[streamName];
  const stream = (): Stream => {
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
 * registration order, with the Turn's world, its slice and its context, and returns their events
 * in that order. Throws a `ModuleError` naming the first module that throws.
 */
export function hookPhase(hook: HookName): PhaseRun {
  return (world, ctx) => {
    const events: EngineEvent[] = [];
    for (const module of ctx.modules) {
      const run = module[hook];
      if (run === undefined) continue;
      const moduleCtx = moduleContext(module, world, ctx);
      const result = guarded(module, hook, () => run.call(module, world, world.modules[module.id], moduleCtx));
      events.push(...result.events);
    }
    return events;
  };
}

function moduleContext(module: Module, world: World, ctx: PhaseContext): ModuleContext {
  return { config: ctx.config, content: ctx.content, turn: ctx.turn, rng: randomOf(module, world), emit: eventEmitter(world) };
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
  deps: EngineDeps,
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
export function sliceFailures(world: World, deps: EngineDeps): ValidationFailure[] {
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
export function unknownSlices(world: World, deps: EngineDeps): ValidationWarning[] {
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
