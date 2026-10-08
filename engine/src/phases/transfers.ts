// Night, after the Guild State Engine: the Transfer Generator moves Heroes between Rivals as time
// passes (M6-S3, approach §1, DL-59). On the night of every `transferGeneratorEveryDays`-th Day, for
// each pair of Rivals in play, one draw from `rivals` decides with the chance
// `transferGeneratorChance` whether the one of the pair with the greater `transferAppetite` bids for
// a Hero of the other (`transferBid`, controllers/rival.ts); the bid is made through `transferIn`'s
// own rule, so consent, fee and everything a Transfer does are the one rule every Transfer keeps
// (DL-57).
//
// It iterates only the Guilds whose controller is a Rival's: the player is never the source here,
// and their Heroes move only through their own `transferOut` or an offer they accept. This is the
// third of the three accepted exceptions to ADR-0002 (ADR-0002, exception 3; the owner, 2026-09-25), and the
// read below is the one `controller-reads.test.ts` allows this file.

import { applyTransferIn } from '../actions/transfer.js';
import type { EngineDeps } from '../config.js';
import { transferBid } from '../controllers/rival.js';
import { compareByCodeUnit } from '../document.js';
import type { EngineEvent } from '../events.js';
import { streamOf } from '../generators/draw.js';
import { chance } from '../rng.js';
import { dayOf } from '../time.js';
import type { PhaseRun } from './phase.js';

/**
 * On its night, each pair of Rivals in play (not folded), in Guild id order — the first with each
 * later one, then the second with each later one, and so on — takes one draw from `rivals`; when it
 * falls under `transferGeneratorChance`, the pair's bid (`transferBid`) is applied through
 * `applyTransferIn` on the world as the pairs before it left it. A pair with no bid to make still
 * takes its draw, so the Generator advances `rivals` by exactly one draw for each pair on its nights,
 * whatever the Rivals hold, and none on other nights. A refused bid is dropped, leaving the world as
 * it was, as the Rival controllers drop theirs (DL-30): `transferBid` names only what `transferIn`
 * accepts. Returns the Transfers' events in the order they were made.
 */
export const transfers: PhaseRun = (world, ctx) => {
  const every = ctx.config.transferGeneratorEveryDays;
  if (dayOf(ctx.turn) % every !== every - 1) return [];
  const deps: EngineDeps = { config: ctx.config, content: ctx.content };
  const rivals = Object.values(world.guilds)
    .filter((guild) => guild.controller.kind === 'rival' && guild.foldedOnTurn === null)
    .sort((a, b) => compareByCodeUnit(a.id, b.id));
  const events: EngineEvent[] = [];
  for (const [index, first] of rivals.entries()) {
    for (const second of rivals.slice(index + 1)) {
      if (!chance(streamOf(world, 'rivals'), ctx.config.transferGeneratorChance)) continue;
      const bid = transferBid(world, [first, second], deps);
      if (bid === null) continue;
      const result = applyTransferIn(world, bid, deps);
      if (result.ok) events.push(...result.events);
    }
  }
  return events;
};
