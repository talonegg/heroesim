/**
 * Moving a Hero the other way: off a Rival's Roster and onto yours (E5-S2, E5-S3).
 *
 * Two transactions, one move. A **Transfer** is above board — you pay a fee and the Rival
 * consents, if their Regard for you allows it, and their Regard is untouched afterwards
 * because you did it properly. A **Poaching** is cheaper, needs the Hero's own Regard for
 * their employer to have soured, and costs you that Rival's goodwill — which is felt on
 * your Board, where a soured Rival takes more of the work you leave (E5-S5).
 *
 * **A refusal is an event, not a thrown error.** A Rival saying no, a Hero who is not
 * disaffected enough, a full Roster and an empty purse are all things that happened in the
 * world, and the front ends narrate them. Only a programming error throws: an id nobody
 * holds, or a Career that has ended.
 */

import { cloneCareer } from './clone.js';
import { clamp } from './config.js';
import { EngineError } from './errors.js';
import type { GameEvent, TransferRefusedReason } from './events.js';
import {
  isPoachable,
  moveHero,
  poachFee,
  REASON_BROUGHT_OVER,
  REASON_POACHED_FROM_THEM,
  rivalById,
  transferFee,
} from './rival.js';
import { changeCoin, changeRivalRegard } from './state.js';
import type { Career, Hero, Rival, RivalHero, Step } from './types.js';

/** Which of the two transactions is being asked about. */
export type MoveKind = 'transfer' | 'poach';

/** Why a move would be refused today, with the number that would answer it. */
export interface MoveRefusal {
  reason: TransferRefusedReason;
  /** Coin still needed. Set only when the reason is `'coin'`. */
  shortfall?: number;
}

/**
 * One of a Rival's Heroes as a front end offers them (E5-S2): what each of the two moves
 * would cost, and why each would be refused if it would be. The same answers
 * `transferHero` and `poachHero` give, asked before the coin is spent rather than after —
 * so no front end ever has to decide for itself what "they will not deal with you" means.
 */
export interface RivalHeroOffer {
  hero: RivalHero;
  /** The Rival who employs them. */
  rivalId: string;
  transferFee: number;
  poachFee: number;
  /** Why a Transfer would be refused today, or absent when it would go through. */
  transferRefusal?: MoveRefusal;
  /** Why a Poaching would be refused today, or absent when it would go through. */
  poachRefusal?: MoveRefusal;
}

/** What the move costs, whichever it is. */
export function moveFee(hero: RivalHero, kind: MoveKind, career: Career): number {
  return kind === 'transfer'
    ? transferFee(hero, career.config)
    : poachFee(hero, career.config);
}

/**
 * Why this move would be refused, or `undefined` when it would go through. Read-only: it
 * touches nothing and is safe to ask after every keypress.
 *
 * **Where several reasons hold at once**, the one named is the first of: the Rival
 * declining to deal with you at all; a Hero not disaffected enough to be approached
 * behind their employer's back; your own Roster at its cap; and the Guild unable to pay.
 * The obstacle hardest to shift is named first, so the player is never told to find fifty
 * coin for somebody who was never going to come.
 *
 * The first two are exclusive by construction: a Transfer needs the Rival's consent and
 * never the Hero's, and a Poaching needs the Hero's disaffection and never the Rival's
 * consent — the Rival is not asked.
 */
export function moveRefusal(
  career: Career,
  rival: Rival,
  hero: RivalHero,
  kind: MoveKind,
): MoveRefusal | undefined {
  const { config } = career;
  if (kind === 'transfer' && rival.regardForGuild.value < config.transferConsentRegard) {
    return { reason: 'regard' };
  }
  if (kind === 'poach' && !isPoachable(hero.regardForRival, config)) {
    return { reason: 'heroRegard' };
  }
  if (career.guild.roster.length >= config.rosterCap) return { reason: 'rosterFull' };
  const fee = moveFee(hero, kind, career);
  if (career.guild.coin < fee) {
    return { reason: 'coin', shortfall: fee - career.guild.coin };
  }
  return undefined;
}

/**
 * Everybody on one Rival's Roster, with both fees and both refusals (E5-S2). An unknown
 * Rival, or a Career that has ended, offers nobody — a front end asking about a Rival that
 * is not there gets an empty list rather than an exception in the middle of a render.
 */
export function rivalOffers(career: Career, rivalId: string): RivalHeroOffer[] {
  const rival = rivalById(career, rivalId);
  if (rival === undefined || career.ended !== undefined) return [];
  return rival.roster.map((hero) => {
    const offer: RivalHeroOffer = {
      hero,
      rivalId: rival.id,
      transferFee: transferFee(hero, career.config),
      poachFee: poachFee(hero, career.config),
    };
    const refusedTransfer = moveRefusal(career, rival, hero, 'transfer');
    const refusedPoach = moveRefusal(career, rival, hero, 'poach');
    if (refusedTransfer !== undefined) offer.transferRefusal = refusedTransfer;
    if (refusedPoach !== undefined) offer.poachRefusal = refusedPoach;
    return offer;
  });
}

/** One offer, by Rival and Hero. `undefined` where either id is not in the world today. */
export function rivalHeroOffer(
  career: Career,
  rivalId: string,
  heroId: string,
): RivalHeroOffer | undefined {
  return rivalOffers(career, rivalId).find((offer) => offer.hero.id === heroId);
}

/** The checks both transactions share, so that asking and deciding are refused alike. */
function requireMove(
  career: Career,
  rivalId: string,
  heroId: string,
): { rival: Rival; hero: RivalHero } {
  if (career.ended !== undefined) {
    throw new EngineError('CareerEnded', 'the Career has ended; nobody else can be brought over');
  }
  const rival = rivalById(career, rivalId);
  if (rival === undefined) {
    throw new EngineError('NoSuchRival', `no Rival with id "${rivalId}" is in this Career`);
  }
  const hero = rival.roster.find((candidate) => candidate.id === heroId);
  if (hero === undefined) {
    throw new EngineError('NoSuchHero', `no Hero with id "${heroId}" is on ${rival.name}'s Roster`);
  }
  return { rival, hero };
}

/** A refused move: the Career it was given back untouched, and the fact that it happened. */
function refused(
  career: Career,
  rivalId: string,
  heroId: string,
  refusal: MoveRefusal,
): Step {
  return {
    career: cloneCareer(career),
    events: [
      { type: 'TransferRefused', day: career.day, rivalId, heroId, reason: refusal.reason },
    ],
  };
}

/**
 * Bring a Hero over from a Rival, above board (E5-S2).
 *
 * The fee is `config.transferFeeBase + config.transferFeePerCalibre × calibre`, and the
 * Rival consents while their Regard for your Guild is at or above
 * `config.transferConsentRegard`. Their Regard is not touched by it either way: a Transfer
 * is a transaction, not an injury.
 *
 * On success the Hero crosses keeping their id, their age, their Traits and what they
 * think of the people they worked with; what they think of a Rival is dropped, and
 * `config.transferJoiningRegard` is what they start out thinking of you.
 *
 * @throws EngineError `CareerEnded`, `NoSuchRival` or `NoSuchHero`. Every in-world refusal
 * is a `TransferRefused` event and a Career byte-identical to the one passed in.
 */
export function transferHero(career: Career, rivalId: string, heroId: string): Step {
  const { rival, hero } = requireMove(career, rivalId, heroId);
  const refusal = moveRefusal(career, rival, hero, 'transfer');
  if (refusal !== undefined) return refused(career, rivalId, heroId, refusal);

  const fee = transferFee(hero, career.config);
  const draft = cloneCareer(career);
  const events: GameEvent[] = [];
  const moved = moveHero(
    draft,
    requireRivalHero(draft, rivalId, heroId),
    { kind: 'rival', rivalId },
    { kind: 'guild' },
    {
      value: clamp(
        draft.config.transferJoiningRegard,
        draft.config.regardMin,
        draft.config.regardMax,
      ),
      reason: REASON_BROUGHT_OVER,
      nature: 'neutral',
    },
  ) as Hero;
  draft.ledger.heroesTransferredIn += 1;

  events.push({
    type: 'HeroTransferred',
    day: draft.day,
    heroId: moved.id,
    fromRivalId: rivalId,
    fee,
    balance: draft.guild.coin - fee,
  });
  changeCoin(draft, -fee, 'transfer', events);
  events.push({
    type: 'HeroJoined',
    day: draft.day,
    heroId: moved.id,
    name: moved.name,
    calibre: moved.calibre,
    age: moved.age,
  });
  return { career: draft, events };
}

/**
 * Approach a Hero on a Rival's Roster whose Regard has soured, without that Rival's
 * consent (E5-S3).
 *
 * The fee is `round(transferFee × config.poachFeeFactor)`, so it is always the cheaper of
 * the two. It is legal only while the Hero's Regard for their employer is at or below
 * `config.poachRegardThreshold` — the same predicate a soured Rival uses against your
 * Roster, applied the other way (`isPoachable`). The Rival is not asked, and their Regard
 * for your Guild falls by `config.poachRivalRegardCost` with the reason recorded.
 *
 * @throws EngineError `CareerEnded`, `NoSuchRival` or `NoSuchHero`. Every in-world refusal
 * is a `TransferRefused` event and a Career byte-identical to the one passed in.
 */
export function poachHero(career: Career, rivalId: string, heroId: string): Step {
  const { rival, hero } = requireMove(career, rivalId, heroId);
  const refusal = moveRefusal(career, rival, hero, 'poach');
  if (refusal !== undefined) return refused(career, rivalId, heroId, refusal);

  const fee = poachFee(hero, career.config);
  const draft = cloneCareer(career);
  const events: GameEvent[] = [];
  const moved = moveHero(
    draft,
    requireRivalHero(draft, rivalId, heroId),
    { kind: 'rival', rivalId },
    { kind: 'guild' },
    {
      value: clamp(
        draft.config.transferJoiningRegard,
        draft.config.regardMin,
        draft.config.regardMax,
      ),
      reason: REASON_BROUGHT_OVER,
      nature: 'neutral',
    },
  ) as Hero;
  draft.ledger.heroesPoachedIn += 1;

  // The bill. It travels on `HeroPoached` rather than on a Regard event of its own,
  // because that event carries the delta and the value already and one fact is told once.
  const soured = requireRivalById(draft, rivalId);
  const delta = changeRivalRegard(
    draft,
    soured,
    -Math.abs(draft.config.poachRivalRegardCost),
    REASON_POACHED_FROM_THEM,
  );

  events.push({
    type: 'HeroPoached',
    day: draft.day,
    heroId: moved.id,
    fromRivalId: rivalId,
    fee,
    balance: draft.guild.coin - fee,
    rivalRegardDelta: delta,
    rivalRegardValue: soured.regardForGuild.value,
  });
  changeCoin(draft, -fee, 'poach', events);
  events.push({
    type: 'HeroJoined',
    day: draft.day,
    heroId: moved.id,
    name: moved.name,
    calibre: moved.calibre,
    age: moved.age,
  });
  return { career: draft, events };
}

/** The Rival in the draft, which the checks above already proved is there. */
function requireRivalById(draft: Career, rivalId: string): Rival {
  const rival = rivalById(draft, rivalId);
  if (rival === undefined) {
    throw new EngineError('InternalError', 'the Rival left the world between check and move');
  }
  return rival;
}

/** The Hero in the draft, which the checks above already proved is there. */
function requireRivalHero(draft: Career, rivalId: string, heroId: string): RivalHero {
  const hero = requireRivalById(draft, rivalId).roster.find(
    (candidate) => candidate.id === heroId,
  );
  if (hero === undefined) {
    throw new EngineError('InternalError', 'the Hero left the Roster between check and move');
  }
  return hero;
}
