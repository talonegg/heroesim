// Transfers (M6-S2, R28, INPUTS 7.6, pre-M0 review D5, DL-57): a Hero moving from one Guild's Roster
// to another's for a fee, and the Transfer Offers that wait for an answer. What a Transfer does is
// here, once, for every way one is made — `transferIn`, `transferOut`, `acceptTransfer` — and for
// every Guild alike (ADR-0002); the actions (actions/transfer.ts) check whether it may be made, and
// the Rival controllers (controllers/rival.ts) say whether a Guild consents to one.
//
// Nothing here draws a random number or reads the History.

import { leaveRoster } from './captain.js';
import { regardBandNames, type EngineDeps, type GameConfig } from './config.js';
import {
  compareByCodeUnit,
  rowOf,
  type Guild,
  type Hero,
  type HeroId,
  type OfferId,
  type TransferOffer,
  type Turn,
  type World,
} from './document.js';
import type { Emit } from './emit.js';
import type { EngineEvent, OfferTerms, TransferOfferEndCause } from './events.js';
import { returnGear } from './gear.js';
import { moraleBand, moraleChanged } from './morale.js';
import { regardBand, regardOnTransferDeal, regardValue } from './regard.js';
import { dayOf, nightOf, turnsPerDay } from './time.js';

/** A Transfer to be made: who moves, from which Guild to which, for how much, and the offer accepted. */
export interface Deal {
  hero: Hero;
  /** The Guild the Hero leaves, which is paid the fee. */
  from: Guild;
  /** The Guild the Hero joins, which pays it. */
  to: Guild;
  fee: number;
  /** The Transfer Offer accepted, for `acceptTransfer`; `null` for `transferIn` and `transferOut`. */
  offerId: OfferId | null;
}

/**
 * Makes the Transfer `deal` names, on `world` in place, for every Guild alike, and returns its
 * events in the order it makes them:
 *
 * 1. the gear the Hero carries goes back to the holding of the Guild they leave (`returnGear`, DL-49
 *    item 8), `item.returned` for `transferred`, while the Hero is still that Guild's;
 * 2. the Guild they join pays the fee to the Guild they leave, so the two hold as much Wealth
 *    together as before;
 * 3. the Hero leaves the one Roster, its post empty if they were its Captain (`leaveRoster`, DL-287),
 *    and joins the end of the other, their `transferredOnTurn` set to
 *    this Turn (the lock, `transferLock`, DL-60), and `hero.transferred`, a Milestone, names the Hero,
 *    both Guilds and the offer accepted;
 * 4. each Hero left on the Roster they leave whose own Regard for the Hero is in `transferRegardBand`
 *    or above loses `transferMoraleCost` Morale, in Roster order, with `hero.morale-changed` only
 *    when a band is crossed (pre-M0 review D5: pairwise; the epic's rule for this cost); nobody
 *    else's Morale moves;
 * 5. the two Guildmasters' Regard for each other rises (`regardOnTransferDeal`);
 * 6. the offer accepted is removed, and any other offer for the Hero is withdrawn with
 *    `guild.transfer-offer-expired` for `hero-left`, since its Hero is no longer on that Roster.
 *
 * The caller has checked that the deal may be made (the Hero on `from`'s Roster, in no Party, not
 * held by a recent Transfer, and `to` able to pay): this changes the world as told and throws only on
 * a Hero carrying gear with no Guild, which no rule makes.
 */
export function makeTransfer(world: World, deal: Deal, deps: Pick<EngineDeps, 'config' | 'content'>, emit: Emit): EngineEvent[] {
  const { hero, from, to, fee, offerId } = deal;
  const { config, content } = deps;
  const events: EngineEvent[] = [...returnGear(world, hero, 'transferred', emit)];

  to.wealth -= fee;
  from.wealth += fee;
  leaveRoster(from, hero.id);
  to.rosterIds.push(hero.id);
  hero.guildId = to.id;
  hero.transferredOnTurn = world.turn;
  events.push(
    emit({
      type: 'hero.transferred',
      participants: [hero.id, from.id, to.id, ...(offerId === null ? [] : [offerId])],
      payload: { heroId: hero.id, fromGuildId: from.id, toGuildId: to.id, fee, offerId },
    }),
  );

  events.push(...transferMoraleCost(world, from, hero.id, config, emit));
  events.push(...regardOnTransferDeal(world, { config, content, turn: world.turn, emit }, from, to));

  if (offerId !== null) delete world.offers[offerId];
  events.push(...withdrawOffers(world, (offer) => (offer.heroId === hero.id ? 'hero-left' : null), emit));
  return events;
}

/**
 * The Morale cost of a Transfer out (R28, pre-M0 review D5, INPUTS 7.6): each Hero on `from`'s
 * Roster, in Roster order, whose own Regard for `heroId` is in `transferRegardBand` or above, loses
 * `transferMoraleCost`, held inside `moraleMin` to `moraleMax`. A Hero who held the transferred Hero
 * in lower Regard, or held none, is untouched, as is the transferred Hero's own Regard for them:
 * Regard is held one way. Emits `hero.morale-changed` (`transfer`) only for a Hero whose band the cost
 * crossed, as the epic asks of this cost.
 */
function transferMoraleCost(
  world: Pick<World, 'heroes'>,
  from: Pick<Guild, 'rosterIds'>,
  heroId: HeroId,
  config: Pick<GameConfig, 'regardBands' | 'transferRegardBand' | 'transferMoraleCost' | 'moraleBands' | 'moraleMin' | 'moraleMax'>,
  emit: Emit,
): EngineEvent[] {
  const lowest = regardBandNames.indexOf(config.transferRegardBand);
  const events: EngineEvent[] = [];
  for (const friendId of from.rosterIds) {
    const friend = rowOf(world.heroes, friendId);
    if (friend === undefined) continue;
    const band = regardBand(regardValue(friend.regard, heroId), config);
    if (regardBandNames.indexOf(band) < lowest) continue;
    const before = friend.morale;
    friend.morale = Math.min(config.moraleMax, Math.max(config.moraleMin, before + config.transferMoraleCost));
    if (moraleBand(before, config) !== moraleBand(friend.morale, config)) {
      events.push(moraleChanged(friend, before, 'transfer', config, emit));
    }
  }
  return events;
}

/** A Hero held on their Roster by a recent Transfer: the Turn of it, and the first Turn they may move again. */
export interface TransferLock {
  transferredOnTurn: Turn;
  untilTurn: Turn;
}

/**
 * Whether `hero` is held on their Roster at `turn` by their last Transfer (DL-60): a Hero transferred
 * on Day `d` is not transferred again before the morning of Day `d + transferLockDays`, whichever
 * Guild asks and by whichever action, so no Guild sells a Hero back, or on, the afternoon it bought
 * them. `null` for a Hero free to move: never transferred, or their lock run out (a lock of 0 Days
 * never holds). Reads the Hero only.
 */
export function transferLock(
  hero: Pick<Hero, 'transferredOnTurn'>,
  turn: Turn,
  config: Pick<GameConfig, 'transferLockDays'>,
): TransferLock | null {
  const { transferredOnTurn } = hero;
  if (transferredOnTurn === null) return null;
  const untilTurn = (dayOf(transferredOnTurn) + config.transferLockDays) * turnsPerDay;
  return turn < untilTurn ? { transferredOnTurn, untilTurn } : null;
}

// ── Transfer Offers ──────────────────────────────────────────────────────────────────────────

/** Every pending Transfer Offer, in id order. */
export function pendingOffers(world: Pick<World, 'offers'>): TransferOffer[] {
  return Object.values(world.offers).sort((a, b) => compareByCodeUnit(a.id, b.id));
}

/** The Transfer Offers `guildId` has to answer, for Heroes on its Roster, in id order. */
export function offersTo(world: Pick<World, 'offers'>, guildId: Guild['id']): TransferOffer[] {
  return pendingOffers(world).filter((offer) => offer.fromGuildId === guildId);
}

/**
 * The night a Transfer Offer made on `turn` expires: that of its `transferOfferDays`-th Day, the Day
 * it is made counted as the first (`transferOfferDays` from 1).
 */
export function offerExpiresOnTurn(turn: Turn, config: Pick<GameConfig, 'transferOfferDays'>): Turn {
  return nightOf(dayOf(turn) + Math.max(1, config.transferOfferDays) - 1);
}

/**
 * Whether `offer` is due to go on the night `turn`: its `expiresOnTurn` falls before the next night,
 * so that no Turn begins with it past (the validator's `offer-expired`). An offer a Guild makes
 * expires on a night and goes on that night.
 */
export function offerExpiresBy(offer: Pick<TransferOffer, 'expiresOnTurn'>, turn: Turn): boolean {
  return offer.expiresOnTurn < turn + turnsPerDay;
}

/** What an offer's events carry of it. */
export function offerTerms(offer: TransferOffer): OfferTerms {
  const { id: offerId, fromGuildId, toGuildId, heroId, fee } = offer;
  return { offerId, fromGuildId, toGuildId, heroId, fee };
}

/** The entities an offer's events name: the offer, its Hero and both Guilds. */
export function offerParticipants(offer: TransferOffer): [OfferId, HeroId, Guild['id'], Guild['id']] {
  return [offer.id, offer.heroId, offer.fromGuildId, offer.toGuildId];
}

/**
 * Removes every pending offer for which `why` names a cause, in id order, each with its
 * `guild.transfer-offer-expired` made before its row goes (an event names only rows the world has).
 * The one way an offer ends unanswered: its night comes (`expired`), its Hero leaves the Roster
 * (`hero-left`), or a Guild folds (`guild-folded`).
 */
export function withdrawOffers(
  world: Pick<World, 'offers'>,
  why: (offer: TransferOffer) => TransferOfferEndCause | null,
  emit: Emit,
): EngineEvent[] {
  const events: EngineEvent[] = [];
  for (const offer of pendingOffers(world)) {
    const cause = why(offer);
    if (cause === null) continue;
    events.push(
      emit({ type: 'guild.transfer-offer-expired', participants: offerParticipants(offer), payload: { ...offerTerms(offer), cause } }),
    );
    delete world.offers[offer.id];
  }
  return events;
}

/**
 * Why `offer` can no longer stand in `world`, or `null` while it can: one of its Guilds has folded,
 * or its Hero is no longer on the Roster it was made for (dead, retired or gone). The night's sweep
 * (`offerExpiry`) removes such an offer beside the expired ones.
 */
export function offerLapse(world: Pick<World, 'guilds'>, offer: TransferOffer): TransferOfferEndCause | null {
  const from = rowOf(world.guilds, offer.fromGuildId);
  const to = rowOf(world.guilds, offer.toGuildId);
  if (from === undefined || to === undefined || from.foldedOnTurn !== null || to.foldedOnTurn !== null) return 'guild-folded';
  return from.rosterIds.includes(offer.heroId) ? null : 'hero-left';
}
