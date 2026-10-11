// Every action as a value (M2-S1, pre-M0 review D2): what the harness's policy (M2-S12) and a
// Rival's controller (M2-S9) choose, what the web's reducer (M7) dispatches and what the CLI's
// commands take, all applied through one dispatch, `applyAction` (v1.1.6-S8, DL-186 item 9). Each
// action's file defines its action, its rejection and its rule; a story adding an action adds the
// first two to the unions here and a case to `applyGuildAction` (M2-S4 `dispatch`, M2-S8 `recruit`,
// M3-S6 `build`, M5-S2 `equip` and `unequip`, M5-S4 `buy` and `sell`, M6-S2 the five Transfer
// actions, `nameCaptain` by DL-287). A Guild's list of actions in a Turn, the harness's policy's and a Rival's, is applied
// on one copy through `applyActions` and `applyGuildActions` (DL-238).

import type { EngineDeps } from '../config.js';
import type { World, WorldDocument } from '../document.js';
import { record } from '../record.js';
import { copyWorld } from '../world-copy.js';
import { applyBuild, type BuildAction, type BuildRejection } from './build.js';
import { applyBuy, type BuyAction, type BuyRejection } from './buy.js';
import { applyNameCaptain, type NameCaptainAction, type NameCaptainRejection } from './captain.js';
import { applyDispatch, type DispatchAction, type DispatchRejection } from './dispatch.js';
import {
  applyEquip,
  applyUnequip,
  type EquipAction,
  type EquipRejection,
  type UnequipAction,
  type UnequipRejection,
} from './equip.js';
import { rebase, type RebaseAction, type RebaseRejection } from './rebase.js';
import { applyRecruit, type RecruitAction, type RecruitRejection } from './recruit.js';
import { applyToCopy, type ActionResult, type Rejection, type WorldActionResult } from './result.js';
import { applySell, type SellAction, type SellRejection } from './sell.js';
import {
  applyAcceptTransfer,
  applyDeclineTransfer,
  applyOfferTransfer,
  applyTransferIn,
  applyTransferOut,
  type TransferAction,
  type TransferRejection,
} from './transfer.js';

/** Every action, told apart by `kind`. */
export type Action =
  | RebaseAction
  | DispatchAction
  | RecruitAction
  | BuildAction
  | EquipAction
  | UnequipAction
  | BuyAction
  | SellAction
  | TransferAction
  | NameCaptainAction;

export type ActionKind = Action['kind'];

/** Every way an action can be refused, told apart by `action` and then `reason`. */
export type ActionRejection =
  | RebaseRejection
  | DispatchRejection
  | RecruitRejection
  | BuildRejection
  | EquipRejection
  | UnequipRejection
  | BuyRejection
  | SellRejection
  | TransferRejection
  | NameCaptainRejection;

/**
 * The actions a Guild takes in the world, which a controller chooses (M2-S9): every action but
 * `rebase`, which changes the save's rules rather than the world and belongs to no Guild.
 */
export type GuildAction =
  | DispatchAction
  | RecruitAction
  | BuildAction
  | EquipAction
  | UnequipAction
  | BuyAction
  | SellAction
  | TransferAction
  | NameCaptainAction;

/** Every way a Guild's action can be refused. */
export type GuildActionRejection =
  | DispatchRejection
  | RecruitRejection
  | BuildRejection
  | EquipRejection
  | UnequipRejection
  | BuyRejection
  | SellRejection
  | TransferRejection
  | NameCaptainRejection;

/** The ways `action` can be refused: the rejections whose `action` is its `kind`. */
export type RejectionOf<A extends Action> = Extract<ActionRejection, Rejection<A['kind']>>;

/**
 * Applies `action` to `document`: the one way a front end takes an action (v1.1.6-S8, DL-186 item
 * 9). `rebase` changes the save's rules to this release's defaults, whatever `deps` holds (DL-205);
 * every other action is a Guild's, its rule (`applyGuildAction`) run on a copy of the document's
 * world by `applyToCopy`, so a document that shares the old world is left as it was (DL-24), and its
 * events appended to the History. A refusal changes nothing. The result's rejection is narrowed to the action's own.
 */
export function applyAction<A extends Action>(document: WorldDocument, action: A, deps: EngineDeps): ActionResult<RejectionOf<A>> {
  const result =
    action.kind === 'rebase' ? rebase(document) : applyToCopy(document, (world) => applyGuildAction(world, action, deps));
  // A rule refuses only with its own action's rejections, which `RejectionOf` names.
  return result as ActionResult<RejectionOf<A>>;
}

/** A Guild's list of actions applied at once: the document they left, and each action's outcome in the list's order. */
export interface ActionListResult {
  /**
   * The document given when no action was done; else one with the one copy of its world every
   * action played on, the same `meta`, and the History, appended to (ADR-0008).
   */
  document: WorldDocument;
  /** Each action's outcome, in the list's order: done, with its events, or refused, having changed nothing. */
  results: WorldActionResult<GuildActionRejection>[];
}

/**
 * Applies a Guild's `actions` to `document` in order, on one copy of its world rather than one an
 * action (DL-238, ADR-0011 as amended): what the harness's policy chooses for a Turn. Each action
 * plays on the world the ones before it left, through its rule (`applyGuildActions`); a refused
 * one changes nothing, so the next finds the copy as it was. The done actions' events are then
 * appended to the History an action at a time, in order (`record`): no rule reads the History, so
 * appending them after the list is appending them after each. The result equals the same actions
 * applied one by one through `applyAction`, refusals included, to the byte.
 */
export function applyActions(document: WorldDocument, actions: readonly GuildAction[], deps: EngineDeps): ActionListResult {
  if (actions.length === 0) return { document, results: [] };
  const { meta, history } = document;
  const world = copyWorld(document.world);
  const results = applyGuildActions(world, actions, deps);
  if (!results.some((result) => result.ok)) return { document, results };
  for (const result of results) if (result.ok) record(history, result.events);
  return { document: { meta, world, history }, results };
}

/**
 * Applies a Guild's `actions` to `world` in place, in order, each through its rule
 * (`applyGuildAction`), and returns each one's outcome without appending its events: the Rival
 * phase's on the Turn's copy (DL-30), and `applyActions`' on a document's. Every rule decides a
 * refusal before it writes, so a refused action changes nothing and the next is applied to the
 * world the one before it left.
 */
export function applyGuildActions(
  world: World,
  actions: readonly GuildAction[],
  deps: EngineDeps,
): WorldActionResult<GuildActionRejection>[] {
  return actions.map((action) => applyGuildAction(world, action, deps));
}

/**
 * Applies a Guild's `action` to `world` in place through its rule (`applyDispatch`, `applyRecruit`,
 * `applyBuild`, `applyEquip`, `applyUnequip`, `applyBuy`, `applySell`, the Transfer rules and
 * `applyNameCaptain`),
 * returning the events without appending them: what `applyAction` runs on a copy of a document's
 * world, and what `applyGuildActions` runs for each action of a list (DL-238), on a document's
 * copy or on the Turn's (the Rival controllers, DL-30). A refusal changes nothing.
 */
export function applyGuildAction(
  world: World,
  action: GuildAction,
  deps: EngineDeps,
): WorldActionResult<GuildActionRejection> {
  switch (action.kind) {
    case 'dispatch':
      return applyDispatch(world, action, deps);
    case 'recruit':
      return applyRecruit(world, action, deps);
    case 'build':
      return applyBuild(world, action, deps);
    case 'equip':
      return applyEquip(world, action, deps);
    case 'unequip':
      return applyUnequip(world, action, deps);
    case 'buy':
      return applyBuy(world, action, deps);
    case 'sell':
      return applySell(world, action, deps);
    case 'transferIn':
      return applyTransferIn(world, action, deps);
    case 'transferOut':
      return applyTransferOut(world, action, deps);
    case 'offerTransfer':
      return applyOfferTransfer(world, action, deps);
    case 'acceptTransfer':
      return applyAcceptTransfer(world, action, deps);
    case 'declineTransfer':
      return applyDeclineTransfer(world, action, deps);
    case 'nameCaptain':
      return applyNameCaptain(world, action, deps);
  }
}
