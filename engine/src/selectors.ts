// Read-only selectors over the World State, shared by the front ends and the rules (approach §3):
// what a front end would otherwise work out for itself. They never write, and each reads only the
// part of the world it names, so a caller may pass a partial world.
//
// M1-S9 adds the first three, for the CLI's views; later stories add Rankings, Upkeep and the
// rest beside them. Time's selectors, `ageOf` among them, are in time.ts.

import type { EngineDeps, GameConfig } from './config.js';
import type { DispositionKey, Stat } from './content-types.js';
import { compareByCodeUnit, type Guild, type Hero, type StatValues, type World } from './document.js';

/** The Guild the player controls; `undefined` in a world without one. */
export function playerGuild(world: Pick<World, 'guilds'>): Guild | undefined {
  return Object.values(world.guilds).find((guild) => guild.controller.kind === 'player');
}

/**
 * The Disposition that makes `guild`'s choices, or `null` for the Guild whose choices the player
 * makes. Where a Guild's choices come from is one of `plan.md` §1's three accepted exceptions to
 * ADR-0002, and this is the one place the Rival controllers read it (M2-S9, DL-30).
 */
export function dispositionOf(guild: Pick<Guild, 'controller'>): DispositionKey | null {
  return guild.controller.kind === 'rival' ? guild.controller.disposition : null;
}

/**
 * The Unattached pool, in id order: every Hero with `unattachedSince` set. A Hero on no Roster who
 * has left the pool, and whose row an entry kept (data-model rule 8), is not in it (DL-27).
 */
export function unattachedHeroes(world: Pick<World, 'heroes'>): Hero[] {
  return Object.values(world.heroes)
    .filter((hero) => hero.unattachedSince !== null)
    .sort((a, b) => compareByCodeUnit(a.id, b.id));
}

/**
 * What a Guild pays to sign `hero` from the Unattached pool (INPUTS 4.7, DL-27): `signingFeeBase`,
 * plus `signingFeePerLevel` for each Level, plus the sum of the Hero's base Stats divided by
 * `signingFeeStatDivisor`, rounded down once, at the end, to a whole number. The sum runs over
 * content's Hero Stats through `baseStat`, so a Stat content no longer defines is ignored and one
 * the row lacks reads as the content's default (data-model rule 5).
 *
 * The one place a fee is computed: M4-S5 scales it by the buying Guildmaster's Negotiation here,
 * and gives it the argument that needs, so every caller pays the same price.
 */
export function signingFee(hero: Pick<Hero, 'level' | 'stats'>, deps: Pick<EngineDeps, 'config' | 'content'>): number {
  const { config, content } = deps;
  let statSum = 0;
  for (const stat of Object.values(content.stats)) {
    if (stat.owner === 'hero') statSum += baseStat(hero.stats, stat);
  }
  return Math.floor(
    config.signingFeeBase + config.signingFeePerLevel * hero.level + statSum / config.signingFeeStatDivisor,
  );
}

/**
 * A base Stat as the rules read it: the stored value, or the content's default for a Stat the
 * row lacks, such as one added to content after the save was made (data-model rule 5).
 */
export function baseStat(values: StatValues, stat: Pick<Stat, 'key' | 'default'>): number {
  return Object.hasOwn(values, stat.key) ? (values[stat.key] ?? stat.default) : stat.default;
}

/**
 * A Guild's Upkeep (M2-S7, INPUTS 4.6): `wagePerLevel` for each Level of each living Hero on the
 * Roster — a Hero away on a Quest still draws wages, since leaving is what takes a Hero off the
 * Roster (`CONTEXT.md`, Roster) — plus `hallMaintenancePerGrade` for each grade summed over every
 * Hall facility. Computed from the Roster and the Hall, never stored (data-model §3.2, rule 1).
 * Filters the Roster to Heroes with neither `diedOnTurn` nor `retiredOnTurn` set: belt and braces
 * over the invariant that a dead or retired Hero already left the Roster (`CONTEXT.md`, Roster;
 * data-model rule 8).
 */
export function upkeep(
  guild: Pick<Guild, 'rosterIds' | 'hall'>,
  world: Pick<World, 'heroes'>,
  config: Pick<GameConfig, 'wagePerLevel' | 'hallMaintenancePerGrade'>,
): number {
  const wages = guild.rosterIds.reduce((total, heroId) => {
    const hero = Object.hasOwn(world.heroes, heroId) ? world.heroes[heroId] : undefined;
    if (hero === undefined || hero.diedOnTurn !== null || hero.retiredOnTurn !== null) return total;
    return total + config.wagePerLevel * hero.level;
  }, 0);
  const hallGrades = Object.values(guild.hall).reduce((total, grade) => total + grade, 0);
  return wages + config.hallMaintenancePerGrade * hallGrades;
}
