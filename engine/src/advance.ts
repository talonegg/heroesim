// `advance` (M2-S1, approach §3, data-model §1): the World Engine moves time on by one Turn. It
// takes no player input: every player action is a standalone call in any Turn, and `advance` only
// moves time (pre-M0 review D2).

import type { EngineDeps } from './config.js';
import type { WorldDocument } from './document.js';
import type { EngineEvent } from './events.js';
import { append } from './history.js';
import { phaseContext } from './phases/phase.js';
import { runTurn } from './pipeline.js';
import { ensureStreams } from './rng.js';

/**
 * Why time stopped: what fast forward (M2-S11) stops on, and what `advance` reports for the Turn it
 * played. `ended` and `party-returned` always stop fast forward; `pool-refreshed` only when the
 * caller asks for it (approach §2, pre-M0 review B7); `max-turns` is fast forward's own. M2-S11
 * adds what `advance` detects beyond `ended`, and may give a reason fields of its own.
 */
export type StopReason =
  | { kind: 'party-returned' }
  | { kind: 'ended' }
  | { kind: 'decision-needed' }
  | { kind: 'max-turns' }
  | { kind: 'pool-refreshed' };

export type StopReasonKind = StopReason['kind'];

export interface AdvanceResult {
  /** A new document: a new `world`, the same `meta` and `history`. */
  document: WorldDocument;
  /** The Turn's events in the order they happened, each also appended to the History. */
  events: EngineEvent[];
  /** Why time should stop after this Turn, or `null` when nothing asks it to. */
  stoppedBecause: StopReason | null;
}

/**
 * Plays the next Turn (data-model §1): copies `world` once with `structuredClone`, gives the copy
 * any core random stream it lacks (`ensureStreams`), advances its Turn by one, runs the pipeline's phases for the new Turn's time of day on the copy under
 * `deps.config` and `deps.content`, appends every event to the History through `append`, and
 * returns a document with the new `world` that shares `meta` and `history` with the old one. The
 * old document's `world` is left as it was; its `history` sees the new entries too (ADR-0008).
 *
 * On an ended world (`world.ended` set, M2-S10) nothing happens: the same document comes back,
 * with no events and `stoppedBecause: { kind: 'ended' }`. The Turn whose phases end the game
 * reports `ended` too.
 */
export function advance(document: WorldDocument, deps: EngineDeps): AdvanceResult {
  if (document.world.ended !== null) return { document, events: [], stoppedBecause: { kind: 'ended' } };

  const world = structuredClone(document.world);
  // A save made before a stream existed gains it here, seeded as a new world's (DL-25).
  ensureStreams(world, document.meta.seed);
  world.turn += 1;
  const events = runTurn(world, phaseContext(world, deps, document.history));
  for (const event of events) append(document.history, event);

  return {
    document: { meta: document.meta, world, history: document.history },
    events,
    stoppedBecause: world.ended === null ? null : { kind: 'ended' },
  };
}
