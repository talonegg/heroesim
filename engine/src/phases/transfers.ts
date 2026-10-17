// Night, after the Guild State Engine: the Transfer Generator moves Heroes between Guilds as time
// passes (M6-S3, approach §1, DL-59, DL-319). On the night of every `transferGeneratorEveryDays`-th Day,
// for each pair of Guilds in play, one draw from `rivals` decides with the chance
// `transferGeneratorChance` whether the one of the pair with the greater `transferAppetite` bids for
// a Hero of the other (`transferBid`, controllers/rival.ts); the bid is made through `transferIn`'s or
// `offerTransfer`'s own rule, so consent, fee and everything a Transfer does are the one rule every
// Transfer keeps (DL-57).
//
// The player's Guild is in the pairs, never the bidder: every Guild's Heroes Out of Contract can be
// taken, by a free Offer the player answers by renewing (the owner, Q-C). It never takes a Hero under
// Contract from the player's Guild (ADR-0002, exception 3): `transferBid` bids for one only where the
// Guild's Disposition consents, and a Guild with none answers through Offers. The phase reads no
// controller.

import { applyOfferTransfer, applyTransferIn } from '../actions/transfer.js';
import type { EngineDeps } from '../config.js';
import { transferBid } from '../controllers/rival.js';
import { compareByCodeUnit } from '../document.js';
import type { EngineEvent } from '../events.js';
import { streamOf } from '../generators/draw.js';
import { chance } from '../rng.js';
import { dayOf } from '../time.js';
import type { PhaseRun } from './phase.js';

/**
 * On its night, each pair of Guilds in play (not folded), in Guild id order — the first with each
 * later one, then the second with each later one, and so on — takes one draw from `rivals`; when it
 * falls under `transferGeneratorChance`, the pair's bid (`transferBid`) is applied through
 * `applyTransferIn` or `applyOfferTransfer` on the world as the pairs before it left it. A pair with
 * no bid to make still takes its draw, so the Generator advances `rivals` by exactly one draw for each
 * pair on its nights, whatever the Guilds hold, and none on other nights. A refused bid is dropped,
 * leaving the world as it was, as the Rival controllers drop theirs (DL-30): `transferBid` names only
 * what the two actions accept. Returns the bids' events in the order they were made.
 */
export const transfers: PhaseRun = (world, ctx) => {
  const every = ctx.config.transferGeneratorEveryDays;
  if (dayOf(ctx.turn) % every !== every - 1) return [];
  const deps: EngineDeps = { config: ctx.config, content: ctx.content };
  const guilds = Object.values(world.guilds)
    .filter((guild) => guild.foldedOnTurn === null)
    .sort((a, b) => compareByCodeUnit(a.id, b.id));
  const events: EngineEvent[] = [];
  for (const [index, first] of guilds.entries()) {
    for (const second of guilds.slice(index + 1)) {
      if (!chance(streamOf(world, 'rivals'), ctx.config.transferGeneratorChance)) continue;
      const bid = transferBid(world, [first, second], deps);
      if (bid === null) continue;
      const result = bid.kind === 'transferIn' ? applyTransferIn(world, bid, deps) : applyOfferTransfer(world, bid, deps);
      if (result.ok) events.push(...result.events);
    }
  }
  return events;
};
