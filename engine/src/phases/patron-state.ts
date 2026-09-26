// Night: the Patron State Engine (approach §1, M4-S5, pre-M0 review B5, DL-43). Each Patron's Regard
// for each Guild in play moves toward neutral by `patronRegardRecoveryPerYear` of the scale's reach
// a year, an even share each night, and stops at neutral, where its entry goes (absence means
// neutral). So a bad year with a Patron is not permanent, and nor is a good one: any value, even
// the scale's end, is neutral again within 1 / `patronRegardRecoveryPerYear` years of no dealings.
//
// A drift under data-model rule 10: no event but `patron.regard-changed` on the night it takes a
// value from one band into another. Patrons in id order, Guilds in id order; a folded Guild is out of
// play and its entries are left as they stand. It draws nothing.

import { compareByCodeUnit, type GuildId } from '../document.js';
import type { EngineEvent } from '../events.js';
import { patronRegardChanged, recoverRegard, regardReach } from '../regard.js';
import { turnsPerDay } from '../time.js';
import type { PhaseRun } from './phase.js';

export const patronState: PhaseRun = (world, ctx) => {
  const { config } = ctx;
  const nightsPerYear = config.turnsPerYear / turnsPerDay;
  const step = (config.patronRegardRecoveryPerYear * regardReach(config)) / nightsPerYear;
  if (!(step > 0)) return [];

  const events: EngineEvent[] = [];
  const patrons = Object.values(world.patrons).sort((a, b) => compareByCodeUnit(a.id, b.id));
  for (const patron of patrons) {
    const guildIds = (Object.keys(patron.regard) as GuildId[]).sort(compareByCodeUnit);
    for (const guildId of guildIds) {
      const guild = Object.hasOwn(world.guilds, guildId) ? world.guilds[guildId] : undefined;
      if (guild === undefined || guild.foldedOnTurn !== null) continue;
      const change = recoverRegard(patron.regard, guildId, step, config);
      events.push(...patronRegardChanged(ctx, patron.id, guildId, 'recovery', change));
    }
  }
  return events;
};
