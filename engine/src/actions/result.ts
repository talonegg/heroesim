// What every action returns (epics README §4, approach §3): the new document and the events that
// explain it, or a typed rejection. An action never throws for a rule it refuses, only for a
// programming error. A rejection is data, never prose: a front end narrates it (ADR-0003).
//
// An action that changes `world` has one rule, written against a world it changes in place
// (`applyDispatch`, `applyRecruit`). A front end calls `applyAction`, which runs that rule on a copy
// through `applyToCopy`; a Rival controller, inside the Turn pipeline, calls the rule on the Turn's
// own copy (M2-S9, DL-30). One code path either way.

import type { World, WorldDocument } from '../document.js';
import type { EngineEvent } from '../events.js';
import { record } from '../record.js';
import { copyWorld } from '../world-copy.js';

/**
 * Why an action was refused: the action's `kind` and a kebab-case `reason`. Each action's
 * rejection extends this with what its reason names, such as the bounds a Party size missed.
 */
export interface Rejection<Action extends string = string, Reason extends string = string> {
  action: Action;
  reason: Reason;
}

/** An action's outcome: done, with the new document and its events, or refused. */
export type ActionResult<Refusal extends Rejection = Rejection> =
  | { ok: true; document: WorldDocument; events: EngineEvent[] }
  | { ok: false; rejection: Refusal };

/**
 * An action's rule applied to a world it changes in place: done, with the events that explain the
 * change and have not been appended anywhere, or refused, having changed nothing.
 */
export type WorldActionResult<Refusal extends Rejection = Rejection> =
  | { ok: true; events: EngineEvent[] }
  | { ok: false; rejection: Refusal };

/**
 * Runs `rule` on a copy of `document.world` (`copyWorld`; documents share `world`, so an action copies it
 * first, as `advance` does: DL-24) and, when it succeeds, appends the events the History records to it (`record`, DL-211) and
 * returns a document with the copy and the same `meta` and `history`. A refusal is returned as it
 * is, and the copy dropped; the document is left as it was.
 */
export function applyToCopy<Refusal extends Rejection>(
  document: WorldDocument,
  rule: (world: World) => WorldActionResult<Refusal>,
): ActionResult<Refusal> {
  const { meta, history } = document;
  const world = copyWorld(document.world);
  const result = rule(world);
  if (!result.ok) return result;
  record(history, result.events);
  return { ok: true, document: { meta, world, history }, events: result.events };
}
