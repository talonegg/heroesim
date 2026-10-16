// `renew` (Q9, DL-294 item 6, DL-316): a Guild signs a Hero of its Roster again, at any time, at the wage
// rule's price for their Level and Stats now and a length it chooses, with no fee. The new term starts
// that Day and the old one's rest is dropped; a Hero Out of Contract is under Contract again. Every Guild
// renews through this one rule, the player's front end by `applyAction` and a Rival's controller on the
// Turn's copy (ADR-0002, DL-30).

import type { EngineDeps } from '../config.js';
import { lengthNotOffered, signContract, type LengthNotOffered } from '../contract.js';
import { rowOf, type GuildId, type HeroId, type PartyId, type World } from '../document.js';
import { eventEmitter } from '../emit.js';
import { freeOffer, withdrawOffers } from '../transfer.js';
import type { Rejection, WorldActionResult } from './result.js';

export interface RenewAction {
  kind: 'renew';
  /** The Guild whose Roster the Hero is on. */
  guildId: GuildId;
  /** A Hero of its Roster. */
  heroId: HeroId;
  /** The new Contract's length in years, the Guild's choice: one of `contractLengthsYears` (DL-294 item 6). */
  years: number;
}

/** The Hero is not on the Guild's Roster: another Guild's, the pool's, dead, retired, or no row. */
export interface RenewHeroNotOnRoster extends Rejection<'renew', 'hero-not-on-roster'> {
  heroId: HeroId;
  guildId: GuildId;
}

/** The Hero is away in a Party: renewed once home (the owner, Q-A), as a Transfer waits. */
export interface RenewHeroInParty extends Rejection<'renew', 'hero-in-party'> {
  heroId: HeroId;
  partyId: PartyId;
}

/** Why a Guild could not renew a Hero, in the order `applyRenew` checks. */
export type RenewRejection = LengthNotOffered<'renew'> | RenewHeroNotOnRoster | RenewHeroInParty;

/**
 * `guildId` signs `heroId`, of its Roster, on a new Contract of `years` from now (`signContract`): the
 * wage by the rule today, no fee, the old term dropped. Emits `hero.contract-renewed`, a Milestone
 * naming the Hero and the Guild, with the new terms; then each free Offer for the Hero is withdrawn,
 * `renewed`, the one answer their Guild has to it (Q8, DL-319). A priced Offer stands.
 *
 * Refused, changing nothing: `length-not-offered`, `hero-not-on-roster` (a folded Guild's Roster is
 * empty, and a dead or retired Hero is on none), `hero-in-party`, in that order. Throws only on a Guild
 * id the world does not hold, a programming error.
 *
 * Changes `world` in place and returns its events rather than appending them: `applyAction` runs it on a
 * copy of a document's world, a Rival controller on the Turn's copy (DL-30).
 */
export function applyRenew(world: World, { guildId, heroId, years }: Omit<RenewAction, 'kind'>, deps: EngineDeps): WorldActionResult<RenewRejection> {
  const guild = rowOf(world.guilds, guildId);
  if (guild === undefined) throw new RangeError(`No Guild in the world has the id ${guildId}`);
  const length = lengthNotOffered('renew', years, deps.config);
  if (length !== null) return { ok: false, rejection: length };
  const hero = rowOf(world.heroes, heroId);
  if (hero === undefined || !guild.rosterIds.includes(heroId) || hero.diedOnTurn !== null || hero.retiredOnTurn !== null) {
    return { ok: false, rejection: { action: 'renew', reason: 'hero-not-on-roster', heroId, guildId } };
  }
  if (hero.partyId !== null) return { ok: false, rejection: { action: 'renew', reason: 'hero-in-party', heroId, partyId: hero.partyId } };

  // Read before the new term is signed: a free Offer is one made while the Hero was Out of Contract.
  const free = new Set(Object.values(world.offers).filter((offer) => offer.heroId === heroId && freeOffer(world, offer)));
  const { wage, endDay } = signContract(world, hero, guild, years, deps);
  const emit = eventEmitter(world);
  const renewed = emit({
    type: 'hero.contract-renewed',
    participants: [heroId, guildId],
    payload: { heroId, guildId, wage, years, endDay },
  });
  return { ok: true, events: [renewed, ...withdrawOffers(world, (offer) => (free.has(offer) ? 'renewed' : null), emit)] };
}
