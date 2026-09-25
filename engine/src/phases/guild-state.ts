// Night: the Guild State Engine — Upkeep on its Day, the Bankruptcy floor and the Fame floor
// (approach §2, M2-S7, INPUTS 4.6, 4.9, pre-M0 review D10.3, ADR-0002).
//
// Runs the same rule over every Guild alike, player and Rival (ADR-0002), skipping a folded one
// (`foldedOnTurn` set — M2-CONTEXT: every per-Guild rule skips a folded Guild). On the Day
// `upkeepEveryDays` names (DL-26 says which Days precisely), deducts `upkeep` (selectors.ts)
// from Wealth — which may go negative — and emits `guild.upkeep-paid`. Every night, whether or
// not it is an Upkeep Day, a Guild whose Wealth is now below `bankruptcyFloor` has
// `belowFloorSince` set to this Turn if it was not already set, and one at or above the floor
// has it cleared; `bankruptcyGraceDays` is not applied here, it is read by the ending (M2-S10).
// Fame is moved by Quest outcomes elsewhere; this phase only clamps it at `config.fameFloor`,
// every night, so it never reads negative.

import type { EngineEvent } from '../events.js';
import { upkeep } from '../selectors.js';
import { dayOf } from '../time.js';
import type { PhaseRun } from './phase.js';

export const guildState: PhaseRun = (world, ctx) => {
  const events: EngineEvent[] = [];
  const isUpkeepDay = dayOf(ctx.turn) % ctx.config.upkeepEveryDays === ctx.config.upkeepEveryDays - 1;

  for (const guild of Object.values(world.guilds)) {
    if (guild.foldedOnTurn !== null) continue;

    if (isUpkeepDay) {
      const amount = upkeep(guild, world, ctx.config);
      guild.wealth -= amount;
      events.push(
        ctx.emit({
          type: 'guild.upkeep-paid',
          participants: [guild.id],
          payload: { guildId: guild.id, amount, wealthAfter: guild.wealth },
        }),
      );
    }

    if (guild.wealth < ctx.config.bankruptcyFloor) {
      if (guild.belowFloorSince === null) guild.belowFloorSince = ctx.turn;
    } else {
      guild.belowFloorSince = null;
    }

    guild.fame = Math.max(guild.fame, ctx.config.fameFloor);
  }

  return events;
};
