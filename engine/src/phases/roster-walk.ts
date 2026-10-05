// The Roster walk the night phases share (v1.1.6-S8, DL-186 item 26): `ageing`, `heroState`,
// `levelUps` and `training` each visit every Hero on the Roster of a Guild in play. The order is a
// draw order, since three of them draw from a stream for each Hero in turn (ADR-0009): the Guilds
// in play by id, each Roster in its own order.

import { compareByCodeUnit, rowOf, type Guild, type Hero, type World } from '../document.js';

/** A Hero on a Roster, with the Guild whose Roster it is. */
export interface RosterHero {
  guild: Guild;
  hero: Hero;
}

/**
 * Every living, unretired Hero on the Roster of a Guild that has not folded, with its Guild: the
 * Guilds by id in code-unit order, each Roster in its own order. An id the world lacks is skipped.
 * The list is taken before a phase changes anything, so a Hero who leaves a Roster during the walk
 * (a Retirement) does not cut it short.
 */
export function activeRosterHeroes(world: Pick<World, 'guilds' | 'heroes'>): RosterHero[] {
  const walked: RosterHero[] = [];
  const guilds = Object.values(world.guilds)
    .filter((guild) => guild.foldedOnTurn === null)
    .sort((a, b) => compareByCodeUnit(a.id, b.id));
  for (const guild of guilds) {
    for (const heroId of guild.rosterIds) {
      const hero = rowOf(world.heroes, heroId);
      if (hero === undefined || hero.diedOnTurn !== null || hero.retiredOnTurn !== null) continue;
      walked.push({ guild, hero });
    }
  }
  return walked;
}
