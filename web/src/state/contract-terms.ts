// A Contract's terms before it is signed (DL-315 item 4): the first wage the player's Guild would
// pay a Hero at each length the config offers, the engine's `contractWage`. Words only; no rule.

import { contractWage, type Hero } from '@heroesim/engine';
import type { PlayerReading } from '@heroesim/words';

/** A length a Contract may take, in years, and the wage the player's Guild would sign the Hero for at it. */
export interface ContractTerm {
  years: number;
  wage: number;
}

/** `hero`'s terms at each length offered (`contractLengthsYears`); none in a save with no player's Guild. */
export function contractTerms(reading: PlayerReading, hero: Hero): ContractTerm[] {
  const { guild, world, deps } = reading;
  if (guild === undefined) return [];
  return deps.config.contractLengthsYears.map((years) => ({ years, wage: contractWage(world, hero, guild, years, deps) }));
}
