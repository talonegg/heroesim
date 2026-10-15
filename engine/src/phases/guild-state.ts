// Night: the Guild State Engine — the wages and the Hall's upkeep on their Days, the Bankruptcy floor
// and the Fame floor (approach §2, M2-S7, INPUTS 4.6, 4.9, pre-M0 review D10.3, ADR-0002, DL-298).
//
// Runs the same rule over every Guild alike, player and Rival (ADR-0002), skipping a folded one
// (`foldedOnTurn` set — M2-CONTEXT: every per-Guild rule skips a folded Guild). Two charges, each on
// its own Days (DL-26 says which; `nextWagesDay` and `nextHallUpkeepDay` give them, DL-112 item 3), each
// for the Roster and the Hall there that night, in full, with no share of a span taken off (DL-294
// item 4): the wages (`wages`), emitting `guild.wages-paid`, then the Hall's upkeep with its
// Improvements' (`hallUpkeepParts`), emitting `guild.hall-upkeep-paid` with its parts. Each is deducted
// from Wealth, which may go negative. Every night, after any charge and whether or not one fell, a Guild
// whose Wealth is now below `bankruptcyFloor` has `belowFloorSince` set to this Turn if it was not
// already set, and one at or above the floor has it cleared; `bankruptcyGraceDays` is not applied here,
// it is read by the ending (M2-S10). Fame is moved by Quest outcomes elsewhere; this phase only clamps
// it at `config.fameFloor`, every night, so it never reads negative.
//
// The same check is heard (M9-S1, DL-85 item 6, superseding DL-26 item 3's silence): the night
// `belowFloorSince` is set, `guild.below-floor` names the Guild with the Day its Bankruptcy falls on
// (`bankruptcyCountdown`, the reckoning `endings.ts` rules by); the night it is cleared,
// `guild.floor-recovered`. Nothing is said while it stays set or stays clear.

import type { EngineEvent } from '../events.js';
import { bankruptcyCountdown, hallUpkeepParts, nextHallUpkeepDay, nextWagesDay, wages } from '../selectors.js';
import { dayOf } from '../time.js';
import type { PhaseRun } from './phase.js';

export const guildState: PhaseRun = (world, ctx) => {
  const events: EngineEvent[] = [];
  // Tonight is a charge's night when it is the next one seen from the Turn before: the rules the
  // Treasury reads (`nextWagesDay`, `nextHallUpkeepDay`; DL-112 item 3, DL-298).
  const wagesTonight = nextWagesDay(ctx.turn - 1, ctx.config) === dayOf(ctx.turn);
  const hallTonight = nextHallUpkeepDay(ctx.turn - 1, ctx.config) === dayOf(ctx.turn);

  for (const guild of Object.values(world.guilds)) {
    if (guild.foldedOnTurn !== null) continue;

    if (wagesTonight) {
      const amount = wages(guild, world, ctx.config);
      guild.wealth -= amount;
      events.push(
        ctx.emit({
          type: 'guild.wages-paid',
          participants: [guild.id],
          payload: { guildId: guild.id, amount, wealthAfter: guild.wealth },
        }),
      );
    }

    if (hallTonight) {
      const { total, ...parts } = hallUpkeepParts(guild, world, ctx.config, ctx.content);
      guild.wealth -= total;
      events.push(
        ctx.emit({
          type: 'guild.hall-upkeep-paid',
          participants: [guild.id],
          payload: { guildId: guild.id, amount: total, wealthAfter: guild.wealth, ...parts },
        }),
      );
    }

    const floor = ctx.config.bankruptcyFloor;
    if (guild.wealth < floor) {
      if (guild.belowFloorSince === null) {
        guild.belowFloorSince = ctx.turn;
        const dueDay = bankruptcyCountdown(guild, ctx.config)?.dueDay as number;
        events.push(
          ctx.emit({
            type: 'guild.below-floor',
            participants: [guild.id],
            payload: { guildId: guild.id, wealth: guild.wealth, floor, dueDay },
          }),
        );
      }
    } else if (guild.belowFloorSince !== null) {
      const belowFloorSince = guild.belowFloorSince;
      guild.belowFloorSince = null;
      events.push(
        ctx.emit({
          type: 'guild.floor-recovered',
          participants: [guild.id],
          payload: { guildId: guild.id, wealth: guild.wealth, floor, belowFloorSince },
        }),
      );
    }

    guild.fame = Math.max(guild.fame, ctx.config.fameFloor);
  }

  return events;
};
