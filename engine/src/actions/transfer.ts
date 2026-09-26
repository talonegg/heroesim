// Transfers (M6-S2, R28, INPUTS 7.6, DL-57): a Hero moves between two Guilds' Rosters for a fee.
// Five actions, each a world-level rule and a document-level wrapper (DL-30), which every Guild takes
// alike, a front end by the wrapper and a Rival's controller by the rule (ADR-0002):
//
// - `transferIn`: a Guild takes a Hero from another Guild's Roster, if that Guild consents now;
// - `transferOut`: a Guild sends one of its Heroes to another Guild, if that Guild consents now;
// - `offerTransfer`: a Guild offers a fee for a Hero of a Guild that answers for itself, writing a
//   Transfer Offer (data-model §3.2) that waits for an answer;
// - `acceptTransfer` and `declineTransfer`: the Guild asked answers an offer.
//
// Whether a Guild consents now is its controller's choice (`transferAnswer`, controllers/rival.ts):
// a Disposition answers by its row; a Guild with none (the player's) answers only offers, by the
// last two actions. What a Transfer does is `makeTransfer` (transfer.ts), whichever action makes it.

import type { EngineDeps } from '../config.js';
import { transferAnswer, type TransferRefusalReason, type TransferSide } from '../controllers/rival.js';
import {
  takeId,
  type Guild,
  type GuildId,
  type Hero,
  type HeroId,
  type OfferId,
  type PartyId,
  type TransferOffer,
  type World,
  type WorldDocument,
} from '../document.js';
import { eventEmitter } from '../emit.js';
import { guildmasterOf } from '../guildmaster.js';
import { transferFee } from '../selectors.js';
import { makeTransfer, offerExpiresOnTurn, offerParticipants, offerTerms } from '../transfer.js';
import { applyToCopy, type ActionResult, type Rejection, type WorldActionResult } from './result.js';

// ── Actions ──────────────────────────────────────────────────────────────────────────────────

export interface TransferInAction {
  kind: 'transferIn';
  /** The Guild that takes the Hero and pays the fee. */
  guildId: GuildId;
  /** A Hero on another Guild's Roster. */
  heroId: HeroId;
}

export interface TransferOutAction {
  kind: 'transferOut';
  /** The Guild that parts with the Hero and is paid the fee. */
  guildId: GuildId;
  /** A Hero on `guildId`'s Roster. */
  heroId: HeroId;
  /** The Guild that takes the Hero and pays. */
  toGuildId: GuildId;
}

export interface OfferTransferAction {
  kind: 'offerTransfer';
  /** The Guild that offers the fee. */
  guildId: GuildId;
  /** A Hero on the Roster of a Guild that answers offers. */
  heroId: HeroId;
}

export interface AcceptTransferAction {
  kind: 'acceptTransfer';
  /** The Guild the offer asks: the one whose Roster the Hero is on. */
  guildId: GuildId;
  offerId: OfferId;
}

export interface DeclineTransferAction {
  kind: 'declineTransfer';
  /** The Guild the offer asks: the one whose Roster the Hero is on. */
  guildId: GuildId;
  offerId: OfferId;
}

/** Every Transfer action, and the `kind` each rejection names. */
export type TransferAction =
  | TransferInAction
  | TransferOutAction
  | OfferTransferAction
  | AcceptTransferAction
  | DeclineTransferAction;

type Kind = TransferAction['kind'];

// ── Rejections ───────────────────────────────────────────────────────────────────────────────

/** A Guild of the Transfer has folded (M2-S10) and deals no more: the one acting, or the other. */
export interface TransferGuildFolded<Action extends Kind = Kind> extends Rejection<Action, 'guild-folded'> {
  guildId: GuildId;
}

/**
 * The Hero is not on the Roster the action needs: another Guild's, for `transferIn` and
 * `offerTransfer`, the acting Guild's for `transferOut`. A Hero with no row, in the pool, dead or
 * retired is on none.
 */
export interface TransferHeroNotOnRoster<Action extends Kind = Kind> extends Rejection<Action, 'hero-not-on-roster'> {
  heroId: HeroId;
}

/** Both sides of the Transfer are the same Guild: its own Hero asked for, or sent to itself. */
export interface TransferSameGuild<Action extends Kind = Kind> extends Rejection<Action, 'same-guild'> {
  guildId: GuildId;
}

/** The Hero is away in a Party: a Hero moves only from the Hall (the epic: `partyId` must be null). */
export interface TransferHeroInParty<Action extends Kind = Kind> extends Rejection<Action, 'hero-in-party'> {
  heroId: HeroId;
  partyId: PartyId;
}

/**
 * The other Guild does not consent now (`transferAnswer`): it names the Guild, the side it was asked
 * to take, and why: its Roster too small for its appetite, its Wealth too low to hire, a Disposition
 * content lacks, or a controller that answers only offers.
 */
export interface TransferRefused<Action extends Kind = Kind> extends Rejection<Action, 'transfer-refused'> {
  guildId: GuildId;
  heroId: HeroId;
  side: TransferSide;
  because: TransferRefusalReason;
}

/** The Guild that would take the Hero in, `guildId`, cannot pay the fee. */
export interface TransferInsufficientWealth<Action extends Kind = Kind> extends Rejection<Action, 'insufficient-wealth'> {
  guildId: GuildId;
  fee: number;
  wealth: number;
}

/** A Transfer Offer the Guild would make stands already: its own, for the same Hero. */
export interface OfferPending extends Rejection<'offerTransfer', 'offer-pending'> {
  offerId: OfferId;
}

/**
 * The Hero's Guild answers a Transfer at once by its Disposition, so `transferIn` asks it: an offer
 * would wait for an answer that never comes.
 */
export interface NoOfferNeeded extends Rejection<'offerTransfer', 'no-offer-needed'> {
  guildId: GuildId;
}

/** No pending offer has the id, or it asks another Guild than the one answering. */
export interface OfferNotFound<Action extends 'acceptTransfer' | 'declineTransfer'> extends Rejection<Action, 'offer-not-found'> {
  offerId: OfferId;
}

/** Why `transferIn` was refused, in the order it checks. */
export type TransferInRejection =
  | TransferGuildFolded<'transferIn'>
  | TransferHeroNotOnRoster<'transferIn'>
  | TransferSameGuild<'transferIn'>
  | TransferHeroInParty<'transferIn'>
  | TransferRefused<'transferIn'>
  | TransferInsufficientWealth<'transferIn'>;

/** Why `transferOut` was refused, in the order it checks. */
export type TransferOutRejection =
  | TransferGuildFolded<'transferOut'>
  | TransferSameGuild<'transferOut'>
  | TransferHeroNotOnRoster<'transferOut'>
  | TransferHeroInParty<'transferOut'>
  | TransferRefused<'transferOut'>
  | TransferInsufficientWealth<'transferOut'>;

/** Why `offerTransfer` was refused, in the order it checks. */
export type OfferTransferRejection =
  | TransferGuildFolded<'offerTransfer'>
  | TransferHeroNotOnRoster<'offerTransfer'>
  | TransferSameGuild<'offerTransfer'>
  | TransferHeroInParty<'offerTransfer'>
  | NoOfferNeeded
  | OfferPending
  | TransferInsufficientWealth<'offerTransfer'>;

/** Why `acceptTransfer` was refused, in the order it checks. */
export type AcceptTransferRejection =
  | TransferGuildFolded<'acceptTransfer'>
  | OfferNotFound<'acceptTransfer'>
  | TransferHeroInParty<'acceptTransfer'>
  | TransferInsufficientWealth<'acceptTransfer'>;

/** Why `declineTransfer` was refused. */
export type DeclineTransferRejection = TransferGuildFolded<'declineTransfer'> | OfferNotFound<'declineTransfer'>;

/** Every way a Transfer action can be refused. */
export type TransferRejection =
  | TransferInRejection
  | TransferOutRejection
  | OfferTransferRejection
  | AcceptTransferRejection
  | DeclineTransferRejection;

// ── Shared checks ────────────────────────────────────────────────────────────────────────────

/** The Guild `guildId` names; throws on one the world lacks, since Guild rows are never removed. */
function guildOf(world: Pick<World, 'guilds'>, guildId: GuildId): Guild {
  const guild = Object.hasOwn(world.guilds, guildId) ? world.guilds[guildId] : undefined;
  if (guild === undefined) throw new RangeError(`No Guild in the world has the id ${guildId}`);
  return guild;
}

/** The Hero and the Guild whose Roster they are on, or `undefined` when they are on none. */
function onRoster(world: Pick<World, 'heroes' | 'guilds'>, heroId: HeroId): { hero: Hero; guild: Guild } | undefined {
  const hero = Object.hasOwn(world.heroes, heroId) ? world.heroes[heroId] : undefined;
  if (hero === undefined || hero.guildId === null) return undefined;
  const guild = Object.hasOwn(world.guilds, hero.guildId) ? world.guilds[hero.guildId] : undefined;
  if (guild === undefined || !guild.rosterIds.includes(heroId)) return undefined;
  return { hero, guild };
}

/** The fee `to` pays for `hero`: `transferFee` at its Guildmaster's Negotiation. */
function feeFor(world: Pick<World, 'guildmasters'>, hero: Hero, to: Guild, deps: EngineDeps): number {
  return transferFee(hero, guildmasterOf(to, world), deps);
}

// ── transferIn ───────────────────────────────────────────────────────────────────────────────

/**
 * `guildId` takes `heroId` from the Roster of the Guild they are on, for `transferFee` at its
 * Guildmaster's Negotiation, paid to that Guild, which must consent now (`transferAnswer`, `out`:
 * its Disposition's `transferAppetite` and its Roster size); then everything `makeTransfer` does.
 *
 * Refused, changing nothing: `guild-folded`, `hero-not-on-roster` (on no other Guild's Roster),
 * `same-guild` (the Guild's own Hero), `hero-in-party`, `transfer-refused` (the other Guild does not
 * consent, or answers only offers), `insufficient-wealth`, in that order. Throws only on a Guild id
 * the world does not hold. The returned document has a new `world`, a copy (DL-24).
 */
export function transferIn(
  document: WorldDocument,
  request: Omit<TransferInAction, 'kind'>,
  deps: EngineDeps,
): ActionResult<TransferInRejection> {
  return applyToCopy(document, (world) => applyTransferIn(world, request, deps));
}

/** `transferIn`'s rule on a world it changes in place (DL-30). A refusal changes nothing. */
export function applyTransferIn(
  world: World,
  { guildId, heroId }: Omit<TransferInAction, 'kind'>,
  deps: EngineDeps,
): WorldActionResult<TransferInRejection> {
  const action = 'transferIn';
  const to = guildOf(world, guildId);
  if (to.foldedOnTurn !== null) return { ok: false, rejection: { action, reason: 'guild-folded', guildId } };
  const found = onRoster(world, heroId);
  if (found === undefined) return { ok: false, rejection: { action, reason: 'hero-not-on-roster', heroId } };
  const { hero, guild: from } = found;
  if (from.id === to.id) return { ok: false, rejection: { action, reason: 'same-guild', guildId } };
  if (hero.partyId !== null) return { ok: false, rejection: { action, reason: 'hero-in-party', heroId, partyId: hero.partyId } };
  const answer = transferAnswer(world, from, 'out', deps);
  if (!answer.consents) {
    return { ok: false, rejection: { action, reason: 'transfer-refused', guildId: from.id, heroId, side: 'out', because: answer.because } };
  }
  const fee = feeFor(world, hero, to, deps);
  if (to.wealth < fee) {
    return { ok: false, rejection: { action, reason: 'insufficient-wealth', guildId, fee, wealth: to.wealth } };
  }
  const emit = eventEmitter(world);
  return { ok: true, events: makeTransfer(world, { hero, from, to, fee, offerId: null }, deps, emit) };
}

// ── transferOut ──────────────────────────────────────────────────────────────────────────────

/**
 * `guildId` sends `heroId`, on its Roster, to `toGuildId`, which must consent now (`transferAnswer`,
 * `in`: its Disposition's `transferAppetite`, its Roster size, and a Wealth at which it would hire)
 * and pays `transferFee` at its own Guildmaster's Negotiation; then everything `makeTransfer` does.
 *
 * Refused, changing nothing: `guild-folded` (either Guild), `same-guild`, `hero-not-on-roster`,
 * `hero-in-party`, `transfer-refused`, `insufficient-wealth` (of the Guild taking the Hero), in that order. Throws only
 * on a Guild id the world does not hold, which a front end checks first.
 */
export function transferOut(
  document: WorldDocument,
  request: Omit<TransferOutAction, 'kind'>,
  deps: EngineDeps,
): ActionResult<TransferOutRejection> {
  return applyToCopy(document, (world) => applyTransferOut(world, request, deps));
}

/** `transferOut`'s rule on a world it changes in place (DL-30). A refusal changes nothing. */
export function applyTransferOut(
  world: World,
  { guildId, heroId, toGuildId }: Omit<TransferOutAction, 'kind'>,
  deps: EngineDeps,
): WorldActionResult<TransferOutRejection> {
  const action = 'transferOut';
  const from = guildOf(world, guildId);
  const to = guildOf(world, toGuildId);
  if (from.foldedOnTurn !== null) return { ok: false, rejection: { action, reason: 'guild-folded', guildId } };
  if (to.foldedOnTurn !== null) return { ok: false, rejection: { action, reason: 'guild-folded', guildId: toGuildId } };
  if (from.id === to.id) return { ok: false, rejection: { action, reason: 'same-guild', guildId } };
  const found = onRoster(world, heroId);
  if (found === undefined || found.guild.id !== from.id) {
    return { ok: false, rejection: { action, reason: 'hero-not-on-roster', heroId } };
  }
  const { hero } = found;
  if (hero.partyId !== null) return { ok: false, rejection: { action, reason: 'hero-in-party', heroId, partyId: hero.partyId } };
  const answer = transferAnswer(world, to, 'in', deps);
  if (!answer.consents) {
    return { ok: false, rejection: { action, reason: 'transfer-refused', guildId: toGuildId, heroId, side: 'in', because: answer.because } };
  }
  const fee = feeFor(world, hero, to, deps);
  if (to.wealth < fee) {
    return { ok: false, rejection: { action, reason: 'insufficient-wealth', guildId: toGuildId, fee, wealth: to.wealth } };
  }
  const emit = eventEmitter(world);
  return { ok: true, events: makeTransfer(world, { hero, from, to, fee, offerId: null }, deps, emit) };
}

// ── offerTransfer ────────────────────────────────────────────────────────────────────────────

/**
 * `guildId` offers `transferFee`, at its Guildmaster's Negotiation, for `heroId`, on the Roster of a
 * Guild whose controller answers for itself (`transferAnswer`: `answers-offers`): a Transfer Offer
 * in `world.offers` (data-model §3.2), standing through the night of its `transferOfferDays`-th Day
 * (`offerExpiresOnTurn`), with `guild.transfer-offered`. The fee is fixed when offered; nothing is
 * paid until the offer is accepted.
 *
 * Refused, changing nothing: `guild-folded`, `hero-not-on-roster`, `same-guild`, `hero-in-party`,
 * `no-offer-needed` (the Hero's Guild answers at once, by its Disposition: `transferIn` asks it),
 * `offer-pending` (the Guild's own offer for the Hero stands), `insufficient-wealth`, in that order.
 */
export function offerTransfer(
  document: WorldDocument,
  request: Omit<OfferTransferAction, 'kind'>,
  deps: EngineDeps,
): ActionResult<OfferTransferRejection> {
  return applyToCopy(document, (world) => applyOfferTransfer(world, request, deps));
}

/** `offerTransfer`'s rule on a world it changes in place (DL-30). A refusal changes nothing. */
export function applyOfferTransfer(
  world: World,
  { guildId, heroId }: Omit<OfferTransferAction, 'kind'>,
  deps: EngineDeps,
): WorldActionResult<OfferTransferRejection> {
  const action = 'offerTransfer';
  const to = guildOf(world, guildId);
  if (to.foldedOnTurn !== null) return { ok: false, rejection: { action, reason: 'guild-folded', guildId } };
  const found = onRoster(world, heroId);
  if (found === undefined) return { ok: false, rejection: { action, reason: 'hero-not-on-roster', heroId } };
  const { hero, guild: from } = found;
  if (from.id === to.id) return { ok: false, rejection: { action, reason: 'same-guild', guildId } };
  if (hero.partyId !== null) return { ok: false, rejection: { action, reason: 'hero-in-party', heroId, partyId: hero.partyId } };
  const answer = transferAnswer(world, from, 'out', deps);
  if (answer.consents || answer.because !== 'answers-offers') {
    return { ok: false, rejection: { action, reason: 'no-offer-needed', guildId: from.id } };
  }
  const pending = Object.values(world.offers).find((offer) => offer.toGuildId === guildId && offer.heroId === heroId);
  if (pending !== undefined) return { ok: false, rejection: { action, reason: 'offer-pending', offerId: pending.id } };
  const fee = feeFor(world, hero, to, deps);
  if (to.wealth < fee) {
    return { ok: false, rejection: { action, reason: 'insufficient-wealth', guildId, fee, wealth: to.wealth } };
  }

  const offer: TransferOffer = {
    id: takeId(world, 'offers'),
    kind: 'transfer',
    fromGuildId: from.id,
    toGuildId: to.id,
    heroId,
    fee,
    offeredOnTurn: world.turn,
    expiresOnTurn: offerExpiresOnTurn(world.turn, deps.config),
  };
  world.offers[offer.id] = offer;
  const offered = eventEmitter(world)({
    type: 'guild.transfer-offered',
    participants: offerParticipants(offer),
    payload: { ...offerTerms(offer), expiresOnTurn: offer.expiresOnTurn },
  });
  return { ok: true, events: [offered] };
}

// ── acceptTransfer and declineTransfer ───────────────────────────────────────────────────────

/** The pending offer `offerId` that asks `guildId`, or `undefined`. */
function offerTo(world: Pick<World, 'offers'>, guildId: GuildId, offerId: OfferId): TransferOffer | undefined {
  const offer = Object.hasOwn(world.offers, offerId) ? world.offers[offerId] : undefined;
  return offer?.fromGuildId === guildId ? offer : undefined;
}

/**
 * `guildId` accepts the Transfer Offer `offerId` for a Hero on its Roster: the offering Guild pays the
 * fee it offered, and the Transfer is made (`makeTransfer`), the offer removed and named by
 * `hero.transferred`. The offering Guild's consent was its offer; it is not asked again.
 *
 * Refused, changing nothing and leaving the offer to stand: `guild-folded` (either Guild),
 * `offer-not-found` (no such offer pending, or one asking another Guild), `hero-in-party` (the Hero
 * is away: the offer can be accepted once they are home, until it expires), `insufficient-wealth`
 * (the offering Guild can no longer pay), in that order.
 */
export function acceptTransfer(
  document: WorldDocument,
  request: Omit<AcceptTransferAction, 'kind'>,
  deps: EngineDeps,
): ActionResult<AcceptTransferRejection> {
  return applyToCopy(document, (world) => applyAcceptTransfer(world, request, deps));
}

/** `acceptTransfer`'s rule on a world it changes in place (DL-30). A refusal changes nothing. */
export function applyAcceptTransfer(
  world: World,
  { guildId, offerId }: Omit<AcceptTransferAction, 'kind'>,
  deps: EngineDeps,
): WorldActionResult<AcceptTransferRejection> {
  const action = 'acceptTransfer';
  const from = guildOf(world, guildId);
  if (from.foldedOnTurn !== null) return { ok: false, rejection: { action, reason: 'guild-folded', guildId } };
  const offer = offerTo(world, guildId, offerId);
  const found = offer === undefined ? undefined : onRoster(world, offer.heroId);
  if (offer === undefined || found === undefined || found.guild.id !== guildId) {
    return { ok: false, rejection: { action, reason: 'offer-not-found', offerId } };
  }
  const to = guildOf(world, offer.toGuildId);
  if (to.foldedOnTurn !== null) return { ok: false, rejection: { action, reason: 'guild-folded', guildId: to.id } };
  const { hero } = found;
  if (hero.partyId !== null) return { ok: false, rejection: { action, reason: 'hero-in-party', heroId: hero.id, partyId: hero.partyId } };
  if (to.wealth < offer.fee) {
    return { ok: false, rejection: { action, reason: 'insufficient-wealth', guildId: to.id, fee: offer.fee, wealth: to.wealth } };
  }
  const emit = eventEmitter(world);
  return { ok: true, events: makeTransfer(world, { hero, from, to, fee: offer.fee, offerId }, deps, emit) };
}

/**
 * `guildId` declines the Transfer Offer `offerId`: the offer is removed with
 * `guild.transfer-offer-declined`, and nothing else changes. Refused, changing nothing:
 * `guild-folded`, `offer-not-found` (no such offer pending, or one asking another Guild).
 */
export function declineTransfer(
  document: WorldDocument,
  request: Omit<DeclineTransferAction, 'kind'>,
  deps: EngineDeps,
): ActionResult<DeclineTransferRejection> {
  return applyToCopy(document, (world) => applyDeclineTransfer(world, request, deps));
}

/** `declineTransfer`'s rule on a world it changes in place (DL-30). A refusal changes nothing. */
export function applyDeclineTransfer(
  world: World,
  { guildId, offerId }: Omit<DeclineTransferAction, 'kind'>,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- every action takes deps (epics README §4); this rule reads none
  _deps: EngineDeps,
): WorldActionResult<DeclineTransferRejection> {
  const action = 'declineTransfer';
  const guild = guildOf(world, guildId);
  if (guild.foldedOnTurn !== null) return { ok: false, rejection: { action, reason: 'guild-folded', guildId } };
  const offer = offerTo(world, guildId, offerId);
  if (offer === undefined) return { ok: false, rejection: { action, reason: 'offer-not-found', offerId } };
  const declined = eventEmitter(world)({
    type: 'guild.transfer-offer-declined',
    participants: offerParticipants(offer),
    payload: offerTerms(offer),
  });
  delete world.offers[offerId];
  return { ok: true, events: [declined] };
}
