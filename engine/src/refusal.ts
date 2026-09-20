/**
 * Who will not go, and why (E2). A Hero refuses for exactly two reasons — what they think
 * of the Guildmaster, or a Trait that says *not this, not for them* — and both are
 * declarative: a state value against a configured threshold, and a `refusal` block on a
 * TraitDef. No Trait gets a branch in this file.
 *
 * `proposeParty` answers, `commitParty` decides, and neither is ever the only way to
 * learn what the other will do.
 */

import type { GameConfig } from './config.js';
import type { TraitDefIndex } from './check.js';
import type { RefusalReason } from './events.js';
import { isInjured } from './state.js';
import type { Career, Commission, Hero } from './types.js';

export type { RefusalReason };

/** Why a Hero on the Roster cannot be sent out at all today (E3-S2). */
export type UnavailableReason = 'away' | 'injured';

/** One Hero who cannot be sent, and why, so a front end can say what it is greying out. */
export interface Unavailable {
  heroId: string;
  reason: UnavailableReason;
}

/** One Hero's refusal, with everything a front end needs to explain it. */
export interface Refusal {
  heroId: string;
  reason: RefusalReason;
  /** The Trait that refused. Set only when `reason` is `'trait'`. */
  trait?: string;
  /** What they think of the Guildmaster. Carried for both reasons, so the CLI can show it. */
  regardValue: number;
}

/** What a Party would be, asked without committing to it. */
export interface PartyProposal {
  commissionId: string;
  /** The Heroes as they were named, in that order. */
  heroIds: string[];
  /**
   * The Backing this Party would have as the world stands. Insisting on a refusing Hero
   * costs them Regard first, so a Party committed against a refusal is backed by less
   * than this — which is the point of the price.
   */
  backing: number;
  /** One entry per refusing Hero, in the order the Heroes were named. Empty is the usual case. */
  refusals: Refusal[];
  /**
   * Everybody on the Roster who cannot be sent at all today, in Roster order, whether or
   * not this proposal named them — a front end greys out the names it is not going to be
   * allowed to send, so the list has to cover the whole Roster (E3-S2, DL-16 §8).
   */
  unavailable: Unavailable[];
}

/**
 * Who on the Roster cannot be sent, and why. A Hero who is both away and injured is
 * reported as away, because that is the fact that stops them being picked today.
 */
export function unavailableAmong(career: Career): Unavailable[] {
  const away = new Set(career.parties.flatMap((party) => party.heroIds));
  const out: Unavailable[] = [];
  for (const hero of career.guild.roster) {
    if (away.has(hero.id)) out.push({ heroId: hero.id, reason: 'away' });
    else if (isInjured(hero)) out.push({ heroId: hero.id, reason: 'injured' });
  }
  return out;
}

/**
 * Does this Trait's refusal match this Commission? Both fields absent means it refuses
 * everything; otherwise the tags matching **or** the difficulty being reached is enough.
 */
function refusalMatches(
  refusal: { tags?: string[]; minDifficulty?: number },
  commission: Commission,
): boolean {
  if (refusal.tags === undefined && refusal.minDifficulty === undefined) return true;
  if (refusal.tags !== undefined && refusal.tags.some((tag) => commission.tags.includes(tag))) {
    return true;
  }
  return refusal.minDifficulty !== undefined && commission.difficulty >= refusal.minDifficulty;
}

/**
 * Whether this Hero would decline this Commission, and on what grounds. Pure: it reads
 * the Hero and the Commission and changes nothing.
 *
 * Regard is tried first, so a Hero who would refuse on both counts yields one Refusal
 * blaming the relationship rather than the Trait — which is what the narration should say.
 */
export function refusalFor(
  hero: Hero,
  commission: Commission,
  config: GameConfig,
  traits: TraitDefIndex,
): Refusal | undefined {
  const regardValue = hero.regardForGuildmaster.value;
  if (regardValue <= config.refusalRegardThreshold) {
    return { heroId: hero.id, reason: 'regard', regardValue };
  }
  for (const held of hero.traits) {
    const refusal = traits.get(held.name)?.refusal;
    if (refusal === undefined) continue;
    if (!refusalMatches(refusal, commission)) continue;
    return { heroId: hero.id, reason: 'trait', trait: held.name, regardValue };
  }
  return undefined;
}

/** Every refusal among a Party, in the order the Heroes were named. */
export function refusalsAmong(
  heroes: readonly Hero[],
  commission: Commission,
  config: GameConfig,
  traits: TraitDefIndex,
): Refusal[] {
  const refusals: Refusal[] = [];
  for (const hero of heroes) {
    const refusal = refusalFor(hero, commission, config, traits);
    if (refusal !== undefined) refusals.push(refusal);
  }
  return refusals;
}
