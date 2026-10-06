// `advance` (M2-S1, approach §3, data-model §1): the World Engine moves time on by one Turn. It
// takes no player input: every player action is a standalone call in any Turn, and `advance` only
// moves time (pre-M0 review D2).

import type { EngineDeps } from './config.js';
import type { WorldDocument } from './document.js';
import type { TurnEvent } from './events.js';
import { record } from './record.js';
import { ensureModules } from './modules.js';
import { phaseContext } from './phases/phase.js';
import { runTurn } from './pipeline.js';
import { ensureStreams } from './rng.js';
import { endedStop, type StopReason } from './stops.js';
import { copyWorld } from './world-copy.js';

export interface AdvanceResult {
  /** A new document: a new `world`, the same `meta` and `history`. */
  document: WorldDocument;
  /**
   * The Turn's events in the order they happened: the engine's, and with a module installed the
   * modules' own (M8-S2, DL-77). Each is appended to the History but the pool's comings and goings
   * of a Hero no entry names (`record`, DL-211).
   */
  events: TurnEvent[];
  /**
   * Why time should stop after this Turn, whoever is watching, or `null`: `ended` when the game is
   * over, and otherwise `module` when an installed module's hook asked for a stop, the first to ask
   * (M8-S2, DL-77). The reasons that belong to one Guild (`below-floor`, `party-returned`,
   * `decision-needed`, `quest-staffable`) and the opt-in `pool-refreshed` are fast forward's to
   * report, from the same detectors (stops.ts, DL-33, DL-101).
   */
  stoppedBecause: StopReason | null;
}

/**
 * Plays the next Turn (data-model §1): copies `world` once (`copyWorld`), gives the copy
 * any core random stream it lacks (`ensureStreams`) and any installed module's stream and slice it
 * lacks (`ensureModules`), advances its Turn by one, runs the pipeline's phases for the new Turn's
 * time of day on the copy under `deps.config`, `deps.content` and `deps.modules`, whose hooks run
 * at their three positions, appends the events the History records to it (`record`, DL-211),
 * removes the row of each Hero who left the pool whom no entry names (data-model rule 8), and
 * returns a document with the new `world` that shares `meta` and `history` with the old one. The
 * old document's `world` is left as it was, its write-once rows frozen and shared with the new one
 * (ADR-0011); its `history` sees the new entries too (ADR-0008).
 *
 * On an ended world (`world.ended` set, M2-S10) nothing happens: the same document comes back,
 * with no events and `stoppedBecause: { kind: 'ended' }`. The Turn whose phases end the game
 * reports `ended` too.
 *
 * Throws a `ModuleError` naming the module when an installed module throws (M8-S1): modules are
 * code, so that is a programming error. The document given is left as it was.
 */
export function advance(document: WorldDocument, deps: EngineDeps): AdvanceResult {
  const ended = endedStop(document.world);
  if (ended !== null) return { document, events: [], stoppedBecause: ended };

  const world = copyWorld(document.world);
  // A save made before a stream existed gains it here, seeded as a new world's (DL-25); one made
  // before a module was installed gains its stream and slice likewise (DL-76).
  ensureStreams(world, document.meta.seed);
  ensureModules(world, document.meta.seed, deps);
  world.turn += 1;
  const ctx = phaseContext(world, deps, document.history);
  const events = runTurn(world, ctx);
  // A Hero who left the pool tonight and whom no entry names goes from the table (data-model rule 8).
  for (const heroId of record(document.history, events)) delete world.heroes[heroId];

  return {
    document: { meta: document.meta, world, history: document.history },
    events,
    stoppedBecause: endedStop(world) ?? ctx.moduleStops[0] ?? null,
  };
}
