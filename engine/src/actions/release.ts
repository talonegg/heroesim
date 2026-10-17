// `release` (Q10, the owner's Q-B; DL-294 item 6, DL-317): a Guild lets a Hero of its Roster go. During the
// term it pays `releasePayoutFactor` of the wages left (`releasePayout`), nothing once the Contract has
// ended; the Hero joins the Unattached pool with no Contract and their gear goes back to the Guild's holding,
// as a Transfer's does, and each teammate who held them warmly or better loses the Transfer's Morale cost
// (`transferMoraleCost`). Every Guild releases through this one rule, the player's front
// end by `applyAction` and a Rival's controller on the Turn's copy (ADR-0002, DL-30).

import { leaveRoster } from '../captain.js';
import type { EngineDeps } from '../config.js';
import { rowOf, type GuildId, type HeroId, type PartyId, type World } from '../document.js';
import { eventEmitter } from '../emit.js';
import type { EngineEvent } from '../events.js';
import { returnGear } from '../gear.js';
import { releasePayout } from '../selectors.js';
import { transferMoraleCost, withdrawOffers } from '../transfer.js';
import type { Rejection, WorldActionResult } from './result.js';

export interface ReleaseAction {
  kind: 'release';
  /** The Guild whose Roster the Hero is on, which pays the payout. */
  guildId: GuildId;
  /** A Hero of its Roster. */
  heroId: HeroId;
}

/** The Hero is not on the Guild's Roster: another Guild's, the pool's, dead, retired, or no row. */
export interface ReleaseHeroNotOnRoster extends Rejection<'release', 'hero-not-on-roster'> {
  heroId: HeroId;
  guildId: GuildId;
}

/** The Hero is away in a Party: released once home, as a Transfer and a renewal wait. */
export interface ReleaseHeroInParty extends Rejection<'release', 'hero-in-party'> {
  heroId: HeroId;
  partyId: PartyId;
}

/** Why a Guild could not release a Hero, in the order `applyRelease` checks. */
export type ReleaseRejection = ReleaseHeroNotOnRoster | ReleaseHeroInParty;

/**
 * `guildId` releases `heroId`, of its Roster, in this order: the gear the Hero carries goes back to the
 * Guild's holding (`returnGear`, `item.returned` for `released`); the Guild pays `releasePayout`, which
 * Wealth need not cover, since the night's floor test reads what is left (DL-317); the Hero leaves the
 * Roster, its post empty if they were its Captain (`leaveRoster`), joins the Unattached pool as of this
 * Turn, and `hero.released`, a Milestone, names the Hero, the Guild and the payout; each teammate who held
 * them warmly or better loses the Transfer's Morale cost; and any Transfer Offer for the
 * Hero is withdrawn, `hero-left` (`withdrawOffers`). The Guild's last Hero may be released: the engine
 * refuses nothing for it (`releaseWarning` warns the front ends).
 *
 * Refused, changing nothing: `hero-not-on-roster` (a folded Guild's Roster is empty, and a dead or retired
 * Hero is on none), `hero-in-party`, in that order. Throws only on a Guild id the world does not hold, a
 * programming error.
 *
 * Changes `world` in place and returns its events rather than appending them: `applyAction` runs it on a
 * copy of a document's world, a Rival controller on the Turn's copy (DL-30).
 */
export function applyRelease(world: World, { guildId, heroId }: Omit<ReleaseAction, 'kind'>, deps: EngineDeps): WorldActionResult<ReleaseRejection> {
  const guild = rowOf(world.guilds, guildId);
  if (guild === undefined) throw new RangeError(`No Guild in the world has the id ${guildId}`);
  const hero = rowOf(world.heroes, heroId);
  if (hero === undefined || !guild.rosterIds.includes(heroId) || hero.diedOnTurn !== null || hero.retiredOnTurn !== null) {
    return { ok: false, rejection: { action: 'release', reason: 'hero-not-on-roster', heroId, guildId } };
  }
  if (hero.partyId !== null) return { ok: false, rejection: { action: 'release', reason: 'hero-in-party', heroId, partyId: hero.partyId } };

  const emit = eventEmitter(world);
  const events: EngineEvent[] = [...returnGear(world, hero, 'released', emit)];
  const payout = releasePayout(hero, world.turn, deps.config);
  guild.wealth -= payout;
  leaveRoster(guild, hero);
  hero.guildId = null;
  hero.unattachedSince = world.turn;
  events.push(emit({ type: 'hero.released', participants: [heroId, guildId], payload: { heroId, guildId, payout } }));
  events.push(...transferMoraleCost(world, guild, heroId, deps.config, emit));
  events.push(...withdrawOffers(world, (offer) => (offer.heroId === heroId ? 'hero-left' : null), emit));
  return { ok: true, events };
}
