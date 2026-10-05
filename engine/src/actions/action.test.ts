import { describe, expectTypeOf, test } from 'vitest';
import type { EngineDeps } from '../config.js';
import type { GuildId, WorldDocument } from '../document.js';
import { applyAction, type Action, type ActionRejection, type RejectionOf } from './action.js';
import type { BuildAction, BuildRejection } from './build.js';
import type { BuyAction, BuyRejection } from './buy.js';
import type { DispatchAction, DispatchRejection } from './dispatch.js';
import type { EquipAction, EquipRejection, UnequipAction, UnequipRejection } from './equip.js';
import type { RebaseAction, RebaseRejection } from './rebase.js';
import type { RecruitAction, RecruitRejection } from './recruit.js';
import type { ActionResult } from './result.js';
import type { SellAction, SellItemAction, SellRejection } from './sell.js';
import type {
  AcceptTransferAction,
  AcceptTransferRejection,
  DeclineTransferAction,
  DeclineTransferRejection,
  OfferTransferAction,
  OfferTransferRejection,
  TransferInAction,
  TransferInRejection,
  TransferOutAction,
  TransferOutRejection,
} from './transfer.js';

// v1.1.6-S8 (DL-194, the verification): `applyAction` narrows its result's rejection to the
// action's own by one cast, `RejectionOf`. These hold the cast to each action's rejection type, so
// that a rejection named by a front end for one action is never another's. Checked by `tsc`.

describe('RejectionOf, the rejection applyAction narrows to', () => {
  test("is each action's own rejection type", () => {
    expectTypeOf<RejectionOf<RebaseAction>>().toEqualTypeOf<RebaseRejection>();
    expectTypeOf<RejectionOf<DispatchAction>>().toEqualTypeOf<DispatchRejection>();
    expectTypeOf<RejectionOf<RecruitAction>>().toEqualTypeOf<RecruitRejection>();
    expectTypeOf<RejectionOf<BuildAction>>().toEqualTypeOf<BuildRejection>();
    expectTypeOf<RejectionOf<EquipAction>>().toEqualTypeOf<EquipRejection>();
    expectTypeOf<RejectionOf<UnequipAction>>().toEqualTypeOf<UnequipRejection>();
    expectTypeOf<RejectionOf<BuyAction>>().toEqualTypeOf<BuyRejection>();
    expectTypeOf<RejectionOf<SellAction>>().toEqualTypeOf<SellRejection>();
    expectTypeOf<RejectionOf<SellItemAction>>().toEqualTypeOf<SellRejection>();
    expectTypeOf<RejectionOf<TransferInAction>>().toEqualTypeOf<TransferInRejection>();
    expectTypeOf<RejectionOf<TransferOutAction>>().toEqualTypeOf<TransferOutRejection>();
    expectTypeOf<RejectionOf<OfferTransferAction>>().toEqualTypeOf<OfferTransferRejection>();
    expectTypeOf<RejectionOf<AcceptTransferAction>>().toEqualTypeOf<AcceptTransferRejection>();
    expectTypeOf<RejectionOf<DeclineTransferAction>>().toEqualTypeOf<DeclineTransferRejection>();
  });

  test('is every rejection for an action not narrowed, and both for an action of two kinds', () => {
    expectTypeOf<RejectionOf<Action>>().toEqualTypeOf<ActionRejection>();
    expectTypeOf<RejectionOf<AcceptTransferAction | DeclineTransferAction>>().toEqualTypeOf<
      AcceptTransferRejection | DeclineTransferRejection
    >();
  });

  test("is what applyAction's result carries for an action written in place", () => {
    const call = (document: WorldDocument, guildId: GuildId, deps: EngineDeps) =>
      applyAction(document, { kind: 'buy', guildId, definitionKey: 'rope', quantity: 1 }, deps);
    expectTypeOf(call).returns.toEqualTypeOf<ActionResult<BuyRejection>>();
  });
});
