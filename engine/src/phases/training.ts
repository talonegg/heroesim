// Night, first: the training yard (M3-S2, INPUTS 5.1, DL-36). Every living Hero on the Roster of a
// Guild that has not folded, in no Party and carrying no Injury, gains `xpPerTrainingDay` times the
// Guild's training yard grade, read tonight, times its Guildmaster's Coaching (`coachingMultiplier`,
// 1 to 1 + `coachingFactor`: M4-S5, R8, DL-43), rounded down; grade 0 gives nothing. The player's
// Guild and the Rivals' alike (ADR-0002).
//
// Training XP is a nightly drift (data-model rule 10): no event, recomputable from the Hero's Level
// history and the yard's grade, and recorded by the `hero.levelled` it eventually causes, later
// the same night. `hero.xp-gained` is for Quest XP alone.
//
// It runs before Quests conclude, so it covers the Day just ending as the Hero spent it: a Hero
// whose Party comes home tonight is still in the Party and gains nothing for a Day away, and a Hero
// whose Injury heals tonight (the Hero State Engine, later) spent the Day injured. It draws nothing.

import { coachingMultiplier, guildmasterOf } from '../guildmaster.js';
import type { PhaseRun } from './phase.js';
import { activeRosterHeroes } from './roster-walk.js';

export const training: PhaseRun = (world, ctx) => {
  for (const { guild, hero } of activeRosterHeroes(world)) {
    if (hero.partyId !== null || hero.injury !== null) continue;
    const coached = coachingMultiplier(guildmasterOf(guild, world), ctx.content, ctx.config);
    hero.xp += Math.floor(ctx.config.xpPerTrainingDay * guild.hall.trainingYard * coached);
  }
  return [];
};
