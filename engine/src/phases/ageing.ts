// Night: ageing — the yearly decline of a Hero's Stats with age (approach §2, M3-S4, INPUTS 5.5,
// DL-37).
//
// It runs right after `heroState` and falls on exactly the nights of that phase's Retirement check,
// which it asks rather than repeats (`retirementCheckDue`): the night of each anniversary of the
// Hero's `enteredTurn` if they are home, or the night their Party brings them home if they were
// away over it. Retirement comes first: a Hero who retired tonight has left the Roster, and this
// phase never reaches them. It covers the Heroes `heroState` covers, on the Roster of a Guild that
// has not folded, in Guild id order and Roster order.
//
// Each due check takes one draw from `heroes`, whatever the Hero's age, as each Retirement check
// does, so tuning the age or the areas shifts no later draw. From `declineAge`, the draw picks one
// of content's Hero Stats in `declineAreas`, in key order, among those still above their content
// minimum, and that Stat loses `declinePerYear`, never past the minimum, with `hero.declined`. So
// a Hero loses exactly one Stat a year while any can fall. Potential is untouched, and a Level may
// grow the Stat back (M3-S1).
//
// The `heroes` stream is the only one this phase moves.

import type { Stat, StatArea } from '../content-types.js';
import { compareByCodeUnit, type Hero, type World } from '../document.js';
import type { EngineEvent, HeroDeclined } from '../events.js';
import { sortedRows, streamOf } from '../generators/draw.js';
import { int } from '../rng.js';
import { baseStat } from '../selectors.js';
import { ageOf } from '../time.js';
import { retirementCheckDue } from './hero-state.js';
import type { PhaseContext, PhaseRun } from './phase.js';

export const ageing: PhaseRun = (world, ctx) => {
  const events: EngineEvent[] = [];
  const areas: ReadonlySet<StatArea> = new Set(ctx.config.declineAreas);
  const declining = sortedRows(ctx.content.stats, (stat) => stat.owner === 'hero' && areas.has(stat.area));
  const guilds = Object.values(world.guilds)
    .filter((guild) => guild.foldedOnTurn === null)
    .sort((a, b) => compareByCodeUnit(a.id, b.id));
  for (const guild of guilds) {
    for (const heroId of guild.rosterIds) {
      const hero = Object.hasOwn(world.heroes, heroId) ? world.heroes[heroId] : undefined;
      if (hero === undefined || hero.diedOnTurn !== null || hero.retiredOnTurn !== null) continue;
      if (!retirementCheckDue(hero, ctx)) continue;
      const declined = decline(world, hero, declining, ctx);
      if (declined !== null) events.push(declined);
    }
  }
  return events;
};

/**
 * One yearly check of `hero`: one draw from `heroes` among the Stats of `declining` still above
 * their minimum, and, from `declineAge`, the Stat drawn loses `declinePerYear`, held at its minimum.
 * The event, or `null` when nothing fell: too young, no Stat left to fall, or nothing to take.
 */
function decline(world: World, hero: Hero, declining: readonly Stat[], ctx: PhaseContext): HeroDeclined | null {
  const canFall = declining.filter((stat) => baseStat(hero.stats, stat) > stat.min);
  // The draw is taken whatever the age and however many Stats can fall.
  const stat = canFall[int(streamOf(world, 'heroes'), 0, Math.max(0, canFall.length - 1))];
  const age = ageOf(hero, ctx.turn, ctx.config);
  if (stat === undefined || age < ctx.config.declineAge) return null;
  const before = baseStat(hero.stats, stat);
  const after = Math.max(stat.min, before - ctx.config.declinePerYear);
  if (after >= before) return null;
  hero.stats[stat.key] = after;
  return ctx.emit({
    type: 'hero.declined',
    participants: [hero.id],
    payload: { heroId: hero.id, statKey: stat.key, delta: after - before, age },
  });
}
