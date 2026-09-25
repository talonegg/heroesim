// `recruit` (M2-S8, R27, DL-27): a Guild signs a Hero from the Unattached pool for the signing
// fee. Every Guild recruits through this one function, the player's front end and a Rival's
// controller alike (ADR-0002), so every Guild pays the same price by the same rule.

import type { EngineDeps } from '../config.js';
import type { Guild, GuildId, Hero, HeroId, WorldDocument } from '../document.js';
import { eventEmitter } from '../emit.js';
import { append } from '../history.js';
import { signingFee } from '../selectors.js';
import type { ActionResult, Rejection } from './result.js';

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

/** The Guild's Wealth is below the Hero's signing fee. */
export interface InsufficientWealthRejection extends Rejection<'recruit', 'insufficient-wealth'> {
  fee: number;
  wealth: number;
}

/** Why a Guild could not sign a Hero. */
export type RecruitRejection = GuildFoldedRejection | HeroNotUnattachedRejection | InsufficientWealthRejection;

/**
 * `guildId` signs `heroId` from the Unattached pool: deducts exactly `signingFee(hero, deps)` from
 * the Guild's Wealth, sets the Hero's `guildId`, takes them out of the pool (`unattachedSince`
 * null), appends them to the Roster, and emits `hero.recruited`, a Milestone naming the Hero and
 * the Guild. Wealth equal to the fee is enough.
 *
 * Refused, changing nothing: `guild-folded`, `hero-not-unattached` (a Hero with no row included,
 * since a Hero who left the pool has an id the History still shows), `insufficient-wealth`, in
 * that order. Throws only on a Guild id the world does not hold: Guild rows are never removed,
 * so no front end or controller can offer one, and it is a programming error.
 *
 * The returned document has a new `world`, a copy, so a document that shares the old one is left
 * as it was (DL-24); `meta` and `history` are shared, and the event is appended to the History.
 */
export function recruit(
  document: WorldDocument,
  { guildId, heroId }: Pick<RecruitAction, 'guildId' | 'heroId'>,
  deps: EngineDeps,
): ActionResult<RecruitRejection> {
  const { meta, world: before, history } = document;
  const known = Object.hasOwn(before.guilds, guildId) ? before.guilds[guildId] : undefined;
  if (known === undefined) throw new RangeError(`No Guild in the world has the id ${guildId}`);
  if (known.foldedOnTurn !== null) {
    return { ok: false, rejection: { action: 'recruit', reason: 'guild-folded', guildId } };
  }
  const candidate = Object.hasOwn(before.heroes, heroId) ? before.heroes[heroId] : undefined;
  if (candidate === undefined || candidate.unattachedSince === null) {
    return { ok: false, rejection: { action: 'recruit', reason: 'hero-not-unattached', heroId } };
  }
  const fee = signingFee(candidate, deps);
  if (known.wealth < fee) {
    return { ok: false, rejection: { action: 'recruit', reason: 'insufficient-wealth', fee, wealth: known.wealth } };
  }

  const world = structuredClone(before);
  const guild = world.guilds[guildId] as Guild;
  const hero = world.heroes[heroId] as Hero;
  guild.wealth -= fee;
  hero.guildId = guildId;
  hero.unattachedSince = null;
  guild.rosterIds.push(heroId);

  const recruited = eventEmitter(world)({
    type: 'hero.recruited',
    participants: [heroId, guildId],
    payload: { heroId, guildId, fee },
  });
  append(history, recruited);
  return { ok: true, document: { meta, world, history }, events: [recruited] };
}
