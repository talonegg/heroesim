// Every action as a value (M2-S1, pre-M0 review D2): what the harness's policy (M2-S12) and a
// Rival's controller (M2-S9) choose, and what the web's reducer (M7) dispatches, all applied
// through the same functions a front end calls one by one. Each action's file defines its action
// and its rejection; a story adding an action adds both to the unions here and a case to
// `applyAction` (M2-S4 `dispatch`, M2-S8 `recruit`).

import type { EngineDeps } from '../config.js';
import type { WorldDocument } from '../document.js';
import { dispatch, type DispatchAction, type DispatchRejection } from './dispatch.js';
import { rebase, type RebaseAction, type RebaseRejection } from './rebase.js';
import type { ActionResult } from './result.js';

/** Every action, told apart by `kind`. */
export type Action = RebaseAction | DispatchAction;

export type ActionKind = Action['kind'];

/** Every way an action can be refused, told apart by `action` and then `reason`. */
export type ActionRejection = RebaseRejection | DispatchRejection;

/** Applies `action` to `document` through the action's own function. */
export function applyAction(document: WorldDocument, action: Action, deps: EngineDeps): ActionResult<ActionRejection> {
  switch (action.kind) {
    case 'rebase':
      return rebase(document, deps);
    case 'dispatch':
      return dispatch(document, action, deps);
  }
}
