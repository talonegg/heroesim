// `recruit` (M2-S8, R27, DL-27): a Guild signs a Hero from the Unattached pool for the signing
// fee. Every Guild recruits through this one rule, `applyRecruit`, the player's front end by
// `applyAction` and a Rival's controller on the Turn's copy (ADR-0002, DL-30), so every Guild pays
// the same price by the same rule.

import type { EngineDeps } from '../config.js';
import {
  rowOf,
  type Guild,
  type GuildId,
  type Hero,
  type HeroId,
  type World,
} from '../document.js';
import { eventEmitter } from '../emit.js';
import { signingFee, signingRefusal, type SigningRefusal } from '../selectors.js';
import type { Rejection, WorldActionResult } from './result.js';

export interface RecruitAction {
  kind: 'recruit';
  /** The Guild that signs the Hero and pays the fee. */
  guildId: GuildId;
  /** A Hero in the Unattached pool. */
  heroId: HeroId;
}

/** The Guild has folded (M2-S10): it has left play and never gains a Roster again. */
export interface GuildFoldedRejection extends Rejection<'recruit', 'guild-folded'> {
  guildId: GuildId;
}

/** The Hero is on a Roster, has left the pool, or has no row: not in the Unattached pool. */
export interface HeroNotUnattachedRejection extends Rejection<'recruit', 'hero-not-unattached'> {
  heroId: HeroId;
}

/**
 * The Hero refuses to sign for the Guild, whose Fame is below what the Hero's Level asks (M3-S5,
 * pre-M0 review B4): the Fame asked, the Guild's, and the shortfall (`signingRefusal`).
 */
export interface SigningRefusedRejection extends Rejection<'recruit', 'signing-refused'>, SigningRefusal {
  heroId: HeroId;
}

/** The Guild's Wealth is below the Hero's signing fee. */
export interface InsufficientWealthRejection extends Rejection<'recruit', 'insufficient-wealth'> {
  fee: number;
  wealth: number;
}

/** Why a Guild could not sign a Hero. */
export type RecruitRejection =
  | GuildFoldedRejection
  | HeroNotUnattachedRejection
  | SigningRefusedRejection
  | InsufficientWealthRejection;

/**
 * `guildId` signs `heroId` from the Unattached pool: deducts exactly `signingFee(hero, deps,
 * guildmaster)`, the fee at the Guild's Guildmaster's Negotiation (M4-S5), from the Guild's Wealth,
 * sets the Hero's `guildId`, takes them out of the pool (`unattachedSince`
 * null), appends them to the Roster, and emits `hero.recruited`, a Milestone naming the Hero and
 * the Guild. Wealth equal to the fee is enough.
 *
 * Refused, changing nothing: `guild-folded`, `hero-not-unattached` (a Hero with no row included,
 * since a Hero who left the pool has an id the History still shows), `signing-refused` (the Hero
 * asks more Fame of the Guild than it has, M3-S5), `insufficient-wealth`, in that order: a Hero
 * who will not sign refuses whatever the Guild could pay (DL-38). Throws only on a Guild id the world does not hold: Guild rows are never removed,
 * so no front end or controller can offer one, and it is a programming error.
 *
 * Changes `world` in place and returns its events rather than appending them: `applyAction` runs
 * it on a copy of a document's world, a Rival controller on the Turn's copy (DL-30).
 */
export function applyRecruit(
  world: World,
  { guildId, heroId }: Pick<RecruitAction, 'guildId' | 'heroId'>,
  deps: EngineDeps,
): WorldActionResult<RecruitRejection> {
  const guild: Guild | undefined = rowOf(world.guilds, guildId);
  if (guild === undefined) throw new RangeError(`No Guild in the world has the id ${guildId}`);
  if (guild.foldedOnTurn !== null) {
    return { ok: false, rejection: { action: 'recruit', reason: 'guild-folded', guildId } };
  }
  const hero: Hero | undefined = rowOf(world.heroes, heroId);
  if (hero === undefined || hero.unattachedSince === null) {
    return { ok: false, rejection: { action: 'recruit', reason: 'hero-not-unattached', heroId } };
  }
  const refusal = signingRefusal(guild, hero, deps.config);
  if (refusal !== null) {
    return { ok: false, rejection: { action: 'recruit', reason: 'signing-refused', heroId, ...refusal } };
  }
  // The fee this Guild pays: its Guildmaster's Negotiation applied (M4-S5, R8).
  const buyer = rowOf(world.guildmasters, guild.guildmasterId);
  const fee = signingFee(hero, deps, buyer);
  if (guild.wealth < fee) {
    return { ok: false, rejection: { action: 'recruit', reason: 'insufficient-wealth', fee, wealth: guild.wealth } };
  }

  guild.wealth -= fee;
  hero.guildId = guildId;
  hero.unattachedSince = null;
  guild.rosterIds.push(heroId);

  const recruited = eventEmitter(world)({
    type: 'hero.recruited',
    participants: [heroId, guildId],
    payload: { heroId, guildId, fee },
  });
  return { ok: true, events: [recruited] };
}
