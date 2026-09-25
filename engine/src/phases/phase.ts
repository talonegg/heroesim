// What a phase of the Turn pipeline is and what it is given (M2-S2, approach §2). Each phase has
// its own file in this directory; pipeline.ts puts them in order.

import type { EngineDeps, GameConfig } from '../config.js';
import type { ContentSet } from '../content-types.js';
import type { Turn, World } from '../document.js';
import { eventEmitter, type Emit } from '../emit.js';
import type { EngineEvent } from '../events.js';
import type { TimeOfDay } from '../time.js';

/** What every phase is given beside the World State it changes. */
export interface PhaseContext {
  /** The rules in force: `deps.config`, never `meta.config` (data-model §2). */
  config: GameConfig;
  content: ContentSet;
  /** The Turn being played: `world.turn`, already advanced. */
  turn: Turn;
  /**
   * Makes an event stamped with the Turn, its participants' labels and their Heroes' Guilds, and
   * its Milestone flag (emit.ts). The phase returns what it makes.
   */
  emit: Emit;
}

/**
 * A phase's rule: changes `world`, the per-Turn copy, in place and returns the events that explain
 * the change, in the order they happened. It reads the World State, not the History, which holds
 * this Turn's events only once the whole Turn has run.
 */
export type PhaseRun = (world: World, ctx: PhaseContext) => EngineEvent[];

export interface Phase {
  name: string;
  /** The one time of day the phase runs on. */
  timeOfDay: TimeOfDay;
  run: PhaseRun;
}

/** The context the phases of `world`'s Turn run with, under `deps`. */
export function phaseContext(world: World, deps: EngineDeps): PhaseContext {
  return { config: deps.config, content: deps.content, turn: world.turn, emit: eventEmitter(world) };
}
