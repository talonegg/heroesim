/**
 * Heroes get older, and eventually they stop (E3-S3). Without Retirement every exit from
 * the Roster is a failure and the tone of a twenty-year Career flattens: this is the one
 * way out that ends well.
 *
 * Retirement is settled on the same cadence as E2's Departure — at a Board refresh, and on
 * the return Day for somebody who was away — so nobody ever vanishes mid-Commission. It is
 * settled *before* the drift and the Departure check, so a Hero old enough to retire is
 * gone before anything can sour them or lose them (DL-16 §7).
 */

import type { GameConfig } from './config.js';
import type { GameEvent } from './events.js';
import { rngOn, seedRng } from './rng.js';
import type { Career, Hero } from './types.js';

/** Why a Hero left the Roster having reached the end of a working life. */
export const REASON_REACHED_THE_END = 'reached the end of a working life';

/**
 * The age a Hero starts at: drawn from a stream of its own, seeded from the Career's seed
 * and the Hero's id rather than from `career.rng` (DL-16 §1).
 *
 * Two things follow, and both are the reason it is done this way. World generation takes
 * no extra draw, so a Career's names, Stats, Regard, Patrons, Rivals and opening Board are
 * exactly what they were before ages existed. And a save written before `age` was a field
 * can be filled with the same call, so a Hero is given the age they would always have had,
 * loading the same document twice gives the same ages, and the load advances no generator.
 */
export function startingAge(seed: string, heroId: string, config: GameConfig): number {
  const rng = rngOn({ rng: seedRng(`${seed}:age:${heroId}`) });
  return rng.between(config.heroStartingAgeMin, config.heroStartingAgeMax);
}

/** Whether this Day is a year boundary. Day 360, 720, and so on. */
export function isYearBoundary(day: number, config: GameConfig): boolean {
  return config.daysPerYear > 0 && day % config.daysPerYear === 0;
}

/**
 * Everyone in work gets a year older, whether they are at home or away, and on a Rival's
 * Roster as much as on yours — a Hero is a Hero wherever they work (ADR-0003, E5-S1).
 * Silent: a birthday is not a fact worth a paragraph, and `HeroRetired` is where age is
 * reported. Nobody is re-derived from the seed here; the number they already carry goes up
 * by one, so a person who has crossed between Rosters keeps the age they actually are.
 */
export function ageRoster(draft: Career): void {
  if (!isYearBoundary(draft.day, draft.config)) return;
  for (const hero of draft.guild.roster) hero.age += 1;
  for (const rival of draft.rivals) {
    for (const hero of rival.roster) hero.age += 1;
  }
}

/** Whole years on the Roster, as the reckoning and the narration count them. */
export function yearsServed(hero: Hero, draft: Career): number {
  const perYear = draft.config.daysPerYear;
  if (perYear <= 0) return 0;
  return Math.round((draft.day - hero.joinedOn) / perYear);
}

/**
 * Retire everybody who has reached `config.heroRetirementAge`, and report each of them.
 *
 * @param only when given, the ids of the Heroes to settle rather than the whole Roster —
 * the ones who have just come home on a Day the Board is not refreshing, exactly as E2's
 * Departure defers a Hero who was away (DL-14 §4).
 */
export function retireByAge(draft: Career, only: readonly string[] | undefined, events: GameEvent[]): void {
  const away = new Set(draft.parties.flatMap((party) => party.heroIds));
  const wanted = only === undefined ? undefined : new Set(only);
  for (const hero of [...draft.guild.roster]) {
    if (away.has(hero.id)) continue;
    if (wanted !== undefined && !wanted.has(hero.id)) continue;
    if (hero.age < draft.config.heroRetirementAge) continue;

    draft.guild.roster = draft.guild.roster.filter((candidate) => candidate.id !== hero.id);
    hero.exit = { kind: 'retirement', onDay: draft.day, reason: REASON_REACHED_THE_END };
    draft.guild.formerHeroes.push(hero);
    draft.ledger.heroesRetired += 1;
    events.push({
      type: 'HeroRetired',
      day: draft.day,
      heroId: hero.id,
      age: hero.age,
      yearsServed: yearsServed(hero, draft),
    });
  }
}
