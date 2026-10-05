// Night, straight after Quests conclude: Level-ups (M3-S1, INPUTS 5.2, 5.3, DL-36). Every Hero
// whose XP has reached the next Level gains it, as many Levels in a night as their XP reaches, never
// past `levelCap`; each Level applies its growth (progression.ts) and emits `hero.levelled`, a
// Milestone. It follows the night's training and Quest XP, so both are levelled on the night they
// are earned.
//
// It covers every living Hero on the Roster of a Guild that has not folded, in Guild id order and
// Roster order, the player's and the Rivals' alike (ADR-0002), those away on a Quest included:
// Level follows XP wherever the Hero is. The Unattached pool is left alone: a pool Hero earns no
// XP, and an entry naming them would keep their row for good (data-model rule 8).
//
// The `progression` stream is the only one this phase moves, `growthPointsPerLevel` draws for each
// Level gained, and none on a night no Hero gains one.

import type { EngineEvent } from '../events.js';
import { streamOf } from '../generators/draw.js';
import { growOneLevel, levelsDue } from '../progression.js';
import type { PhaseRun } from './phase.js';
import { activeRosterHeroes } from './roster-walk.js';

export const levelUps: PhaseRun = (world, ctx) => {
  const events: EngineEvent[] = [];
  for (const { guild, hero } of activeRosterHeroes(world)) {
    const due = levelsDue(hero, ctx.config);
    for (let gained = 0; gained < due; gained += 1) {
      const { statDeltas, pointsLost } = growOneLevel(hero, streamOf(world, 'progression'), ctx);
      hero.level += 1;
      events.push(
        ctx.emit({
          type: 'hero.levelled',
          participants: [hero.id],
          payload: { heroId: hero.id, guildId: guild.id, level: hero.level, statDeltas, pointsLost },
        }),
      );
    }
  }
  return events;
};
