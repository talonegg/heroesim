/**
 * Everything the panes need to read off a Career, in one place (E8-S2: "nothing in
 * `web/` computes a rule"). The engine owns the rules; what is left here is arithmetic
 * over `career.config` for the header's countdowns, which the engine exposes no selector
 * for. Every number comes from a named config field — never a literal (CLAUDE.md
 * invariant 8).
 */

import {
  availableHeroes,
  commissionById,
  standing,
  STATS,
  type Career,
  type Commission,
  type Content,
  type Hero,
  type Party,
  type Patron,
  type Stat,
} from '@heroesim/engine';

export { availableHeroes, commissionById, standing, STATS };
export type { Stat };

/** Days from now until the next Day that is a multiple of `every`. Never zero. */
function daysUntilMultiple(day: number, every: number): number {
  const into = day % every;
  return into === 0 ? every : every - into;
}

/** Days until Upkeep next falls due. */
export function daysUntilUpkeep(career: Career): number {
  return daysUntilMultiple(career.day, career.config.upkeepEveryDays);
}

/** Days until the Board next refreshes. */
export function daysUntilRefresh(career: Career): number {
  return daysUntilMultiple(career.day, career.config.boardRefreshEveryDays);
}

/** What the next Upkeep will cost, at the current Roster size. */
export function upkeepDue(career: Career): number {
  return career.config.upkeepBase + career.config.upkeepPerHero * career.guild.roster.length;
}

/** The Patron who posted a Commission. */
export function patronOf(career: Career, commission: Commission): Patron | undefined {
  return career.patrons.find((patron) => patron.id === commission.patronId);
}

/** The display name of a Sphere, by its id. */
export function sphereName(content: Content, sphereId: string | undefined): string {
  if (sphereId === undefined) return '';
  return content.spheres.find((sphere) => sphere.id === sphereId)?.name ?? sphereId;
}

/** The three bands a Commission's difficulty is reported in, easiest first. */
export const DIFFICULTY_BANDS = ['Gentle', 'Testing', 'Grim'] as const;

/** Which band a Commission's difficulty falls in, scaled to this Career's own range. */
export function difficultyBand(career: Career, commission: Commission): string {
  const { difficultyMin, difficultyMax } = career.config;
  const span = Math.max(1, difficultyMax - difficultyMin);
  const share = (commission.difficulty - difficultyMin) / span;
  const index = Math.min(
    DIFFICULTY_BANDS.length - 1,
    Math.max(0, Math.floor(share * DIFFICULTY_BANDS.length)),
  );
  return DIFFICULTY_BANDS[index] ?? DIFFICULTY_BANDS[0];
}

/** The Party a Hero is away with, if they are away. */
export function partyOf(career: Career, hero: Hero): Party | undefined {
  return career.parties.find((party) => party.heroIds.includes(hero.id));
}

/** The title of the Commission a Party is working. */
export function commissionTitle(career: Career, commissionId: string): string {
  return commissionById(career, commissionId)?.title ?? commissionId;
}

/** Whether the Career has finished, one way or the other. */
export function hasEnded(career: Career): boolean {
  return career.ended !== undefined;
}
