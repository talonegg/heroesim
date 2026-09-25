// What every action returns (epics README §4, approach §3): the new document and the events that
// explain it, or a typed rejection. An action never throws for a rule it refuses, only for a
// programming error. A rejection is data, never prose: a front end narrates it (ADR-0003).

import type { WorldDocument } from '../document.js';
import type { EngineEvent } from '../events.js';

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
