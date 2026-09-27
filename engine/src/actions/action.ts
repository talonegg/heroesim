// Every action as a value (M2-S1, pre-M0 review D2): what the harness's policy (M2-S12) and a
// Rival's controller (M2-S9) choose, and what the web's reducer (M7) dispatches, all applied
// through the same functions a front end calls one by one. Each action's file defines its action
// and its rejection; a story adding an action adds both to the unions here and a case to
// `applyAction` (M2-S4 `dispatch`, M2-S8 `recruit`, M3-S6 `build`, M5-S2 `equip` and `unequip`,
// M5-S4 `buy` and `sell`, M6-S2 the five Transfer actions).

import type { EngineDeps } from '../config.js';
import type { World, WorldDocument } from '../document.js';
import { applyBuild, build, type BuildAction, type BuildRejection } from './build.js';
import { applyBuy, buy, type BuyAction, type BuyRejection } from './buy.js';
import { applyDispatch, dispatch, type DispatchAction, type DispatchRejection } from './dispatch.js';
import {
  applyEquip,
  applyUnequip,
  equip,
  unequip,
  type EquipAction,
  type EquipRejection,
  type UnequipAction,
  type UnequipRejection,
} from './equip.js';
import { rebase, type RebaseAction, type RebaseRejection } from './rebase.js';
import { applyRecruit, recruit, type RecruitAction, type RecruitRejection } from './recruit.js';
import type { ActionResult, WorldActionResult } from './result.js';
import { applySell, sell, type SellAction, type SellRejection } from './sell.js';
import {
  acceptTransfer,
  applyAcceptTransfer,
  applyDeclineTransfer,
  applyOfferTransfer,
  applyTransferIn,
  applyTransferOut,
  declineTransfer,
  offerTransfer,
  transferIn,
  transferOut,
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
  | TransferAction;

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
  | TransferRejection;

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
  | TransferAction;

/** Every way a Guild's action can be refused. */
export type GuildActionRejection =
  | DispatchRejection
  | RecruitRejection
  | BuildRejection
  | EquipRejection
  | UnequipRejection
  | BuyRejection
  | SellRejection
  | TransferRejection;

/** Applies `action` to `document` through the action's own function. */
export function applyAction(document: WorldDocument, action: Action, deps: EngineDeps): ActionResult<ActionRejection> {
  switch (action.kind) {
    case 'rebase':
      return rebase(document, deps);
    case 'dispatch':
      return dispatch(document, action, deps);
    case 'recruit':
      return recruit(document, action, deps);
    case 'build':
      return build(document, action, deps);
    case 'equip':
      return equip(document, action, deps);
    case 'unequip':
      return unequip(document, action, deps);
    case 'buy':
      return buy(document, action, deps);
    case 'sell':
      return sell(document, action, deps);
    case 'transferIn':
      return transferIn(document, action, deps);
    case 'transferOut':
      return transferOut(document, action, deps);
    case 'offerTransfer':
      return offerTransfer(document, action, deps);
    case 'acceptTransfer':
      return acceptTransfer(document, action, deps);
    case 'declineTransfer':
      return declineTransfer(document, action, deps);
  }
}

/**
 * Applies a Guild's `action` to `world` in place through the rule its document-level action runs
 * (`applyDispatch`, `applyRecruit`, `applyBuild`, `applyEquip`, `applyUnequip`, `applyBuy`,
 * `applySell`, and the Transfer rules), returning the events without appending them: how a phase of the Turn pipeline
 * takes an action on the Turn's copy of the world (M2-S9's Rival controllers, DL-30). A refusal
 * changes nothing.
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
  }
}
