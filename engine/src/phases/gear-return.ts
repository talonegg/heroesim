// Night, after the Hero State Engine and ageing: the gear of the dead and the retired goes back to
// their Guilds (M5-S2, DL-49). A Hero dies as their Party comes home (`questsConclude`) or retires at
// their yearly check (`heroState`), both earlier tonight; either way they leave the Roster keeping
// their `guildId` (DL-20 item 3), and tonight every Item they carry is moved to that Guild's holding
// with an `item.returned`, so no Turn begins with gear on a Hero who can never carry it again.
//
// Its own phase, so that the rules that kill and retire a Hero stay as they were, and so that one
// sweep catches gear on any dead or retired Hero, however they came to hold it. It runs before the
// ending checks, so a Guild that folds tonight has its dead Heroes' gear back before the fold does
// anything with the Guild's holding. It draws nothing.

import { compareByCodeUnit, rowOf, type HeroId } from '../document.js';
import type { EngineEvent, GearReturnCause } from '../events.js';
import { returnGear } from '../gear.js';
import type { PhaseRun } from './phase.js';

export const gearReturn: PhaseRun = (world, ctx) => {
  const carriers = new Set<HeroId>();
  for (const row of [...Object.values(world.items), ...Object.values(world.stacks)]) {
    if (row.holder.kind === 'hero') carriers.add(row.holder.id);
  }
  const events: EngineEvent[] = [];
  for (const heroId of [...carriers].sort(compareByCodeUnit)) {
    const hero = rowOf(world.heroes, heroId);
    // A Hero on no Roster carries nothing (a fold returns its Heroes' gear first); a Hero with no row
    // is the validator's to refuse.
    if (hero === undefined || hero.guildId === null) continue;
    const cause: GearReturnCause | null = hero.diedOnTurn !== null ? 'died' : hero.retiredOnTurn !== null ? 'retired' : null;
    if (cause !== null) events.push(...returnGear(world, hero, cause, ctx.emit));
  }
  return events;
};
