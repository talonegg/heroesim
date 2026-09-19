/**
 * The loop: Days pass, Beats fire, Parties come back, Upkeep falls due, the Board
 * refreshes, and eventually the Career ends. Every function here is pure — a Career goes
 * in, a new Career and what happened come out, and the argument is never touched.
 */

import { beatDaysFor, resolveBeat } from './beat.js';
import { refreshBoard } from './board.js';
import { backingFor, traitIndex, type TraitDefIndex } from './check.js';
import { cloneCareer } from './clone.js';
import type { Content } from './content.js';
import { EngineError } from './errors.js';
import type { GameEvent } from './events.js';
import { rngOn, type Rng } from './rng.js';
import {
  changeCoin,
  changePatronRegard,
  endCareer,
  findHero,
  liftDueTraits,
  requirePatron,
  retirementDay,
  standingOf,
} from './state.js';
import type { Career, Commission, Hero, Step } from './types.js';

/** The reason a Patron's Regard moves when work was finished. */
export const REASON_WORK_FINISHED = 'the work was finished';
/** The reason a Patron's Regard moves when work was not finished. */
export const REASON_WORK_NOT_FINISHED = 'the work was not finished';
/** The reason a Patron's Regard moves as disappointment fades. */
export const REASON_TIME_PASSED = 'time passed';

/** Events that are worth stopping a stretch of Days for. */
const ATTENTION: ReadonlySet<GameEvent['type']> = new Set<GameEvent['type']>([
  'PartyReturned',
  'BoardRefreshed',
  'CareerEnded',
]);

function fallsDue(day: number, every: number): boolean {
  return every > 0 && day % every === 0;
}

function returnParties(draft: Career, events: GameEvent[]): void {
  const returning = draft.parties.filter((party) => party.returnsOn <= draft.day);
  if (returning.length === 0) return;
  draft.parties = draft.parties.filter((party) => party.returnsOn > draft.day);

  for (const party of returning) {
    const commission = party.commission;
    const succeeded = party.score >= Math.ceil(commission.beatCount / 2);
    const feePaid = succeeded ? commission.fee : 0;
    const patron = requirePatron(draft, commission.patronId);

    events.push({
      type: 'PartyReturned',
      day: draft.day,
      partyId: party.id,
      commissionId: commission.id,
      patronId: patron.id,
      heroIds: [...party.heroIds],
      succeeded,
      score: party.score,
      feePaid,
    });
    if (feePaid !== 0) changeCoin(draft, feePaid, 'fee', events);
    changePatronRegard(
      draft,
      patron,
      succeeded ? draft.config.patronRegardOnSuccess : draft.config.patronRegardOnFailure,
      succeeded ? REASON_WORK_FINISHED : REASON_WORK_NOT_FINISHED,
      events,
    );

    if (succeeded) {
      draft.ledger.commissionsCompleted += 1;
      draft.ledger.commissionsByPatron[patron.id] = (draft.ledger.commissionsByPatron[patron.id] ?? 0) + 1;
    } else {
      draft.ledger.commissionsFailed += 1;
    }

    draft.recentCommissions.unshift(commission);
    if (draft.recentCommissions.length > draft.config.recentCommissionsKept) {
      draft.recentCommissions.length = draft.config.recentCommissionsKept;
    }
  }
}

/**
 * Disappointment fades. A Patron whose Regard for the Guild has gone negative recovers
 * one point towards zero every `config.patronRegardRecoveryEveryDays` Days, so that a
 * Sphere is lost by failing that Patron's work rather than by arithmetic (DL-13, F6).
 * Regard at or above zero is left alone: goodwill is earned, and E2 owns its decay.
 */
function recoverPatronRegard(draft: Career, events: GameEvent[]): void {
  for (const patron of draft.patrons) {
    if (patron.regardForGuild.value >= 0) continue;
    changePatronRegard(draft, patron, 1, REASON_TIME_PASSED, events);
  }
}

function payUpkeep(draft: Career, events: GameEvent[]): void {
  const amount = draft.config.upkeepBase + draft.config.upkeepPerHero * draft.guild.roster.length;
  events.push({
    type: 'UpkeepOwed',
    day: draft.day,
    amount,
    balance: draft.guild.coin - amount,
  });
  changeCoin(draft, -amount, 'upkeep', events);

  const negative = draft.guild.coin < 0;
  const insolvent = negative && draft.ledger.lastUpkeepNegative;
  draft.ledger.lastUpkeepNegative = negative;
  if (insolvent) endCareer(draft, 'insolvency', events);
}

/** One Day of the world, in the order things happen in it. */
function stepDay(
  draft: Career,
  content: Content,
  rng: Rng,
  traits: TraitDefIndex,
  events: GameEvent[],
): void {
  draft.day += 1;
  liftDueTraits(draft, events);
  if (fallsDue(draft.day, draft.config.patronRegardRecoveryEveryDays)) {
    recoverPatronRegard(draft, events);
  }

  for (const party of [...draft.parties]) {
    const due = party.beatDays.filter((day) => day === draft.day).length;
    for (let beat = 0; beat < due; beat += 1) {
      if (party.beatsResolved.length >= party.commission.beatCount) break;
      resolveBeat(draft, party, content, rng, events, traits);
    }
  }

  returnParties(draft, events);

  if (fallsDue(draft.day, draft.config.upkeepEveryDays)) {
    payUpkeep(draft, events);
    if (draft.ended !== undefined) return;
  }
  if (fallsDue(draft.day, draft.config.boardRefreshEveryDays)) {
    refreshBoard(draft, content, rng, events);
  }
  if (draft.day >= retirementDay(draft.config)) {
    endCareer(draft, 'retirement', events);
  }
}

/**
 * Run the world forward, Day by Day. Stops early if the Career ends; it never steps past
 * Retirement.
 *
 * @param career the world as it stands. Not modified.
 * @param days how many Days to run. Fractions and negatives are treated as whole Days from zero.
 * @param content the authored content the Beats come from
 */
export function advance(career: Career, days: number, content: Content): Step {
  const draft = cloneCareer(career);
  const events: GameEvent[] = [];
  if (draft.ended !== undefined) return { career: draft, events };

  const rng = rngOn(draft);
  const traits = traitIndex(content);
  const whole = Math.max(0, Math.floor(days));
  for (let step = 0; step < whole; step += 1) {
    stepDay(draft, content, rng, traits, events);
    if (draft.ended !== undefined) break;
  }
  return { career: draft, events };
}

/**
 * Run the world forward until something wants the player's attention: a Party comes
 * back, the Board refreshes, or the Career ends. Steps one Day at a time and stops after
 * the Day that produced it.
 *
 * @param maxDays the most Days to run if nothing at all happens. Sixty by default.
 */
export function advanceUntilAttention(career: Career, content: Content, maxDays = 60): Step {
  const draft = cloneCareer(career);
  const events: GameEvent[] = [];
  if (draft.ended !== undefined) return { career: draft, events };

  const rng = rngOn(draft);
  const traits = traitIndex(content);
  const limit = Math.max(0, Math.floor(maxDays));
  for (let step = 0; step < limit; step += 1) {
    const before = events.length;
    stepDay(draft, content, rng, traits, events);
    const wantsAttention = events.slice(before).some((event) => ATTENTION.has(event.type));
    if (wantsAttention || draft.ended !== undefined) break;
  }
  return { career: draft, events };
}

/**
 * Send a Party. Its Backing is computed here and fixed for the Commission's duration
 * (ADR-0007), and the Commission leaves the Board.
 *
 * @throws EngineError `CareerEnded`, `EmptyParty`, `CommissionNotOnBoard` or `HeroNotAvailable`.
 */
export function commitParty(
  career: Career,
  commissionId: string,
  heroIds: string[],
  content: Content,
): Step {
  if (career.ended !== undefined) {
    throw new EngineError('CareerEnded', 'the Career has ended; no further Party can be committed');
  }
  if (heroIds.length === 0) {
    throw new EngineError('EmptyParty', 'a Party needs at least one Hero');
  }
  const onBoard = career.board.find((commission) => commission.id === commissionId);
  if (onBoard === undefined || onBoard.expiresOn <= career.day) {
    throw new EngineError(
      'CommissionNotOnBoard',
      `no Commission with id "${commissionId}" is on the Board`,
    );
  }
  const away = new Set(career.parties.flatMap((party) => party.heroIds));
  const named = new Set<string>();
  for (const id of heroIds) {
    if (named.has(id)) {
      throw new EngineError('HeroNotAvailable', `Hero "${id}" was named twice in the same Party`);
    }
    named.add(id);
    const hero = findHero(career, id);
    if (hero === undefined) {
      throw new EngineError('HeroNotAvailable', `no Hero with id "${id}" is on the Roster`);
    }
    if (away.has(id)) {
      throw new EngineError('HeroNotAvailable', `${hero.name} is already away on a Commission`);
    }
  }

  const draft = cloneCareer(career);
  const rng = rngOn(draft);
  const commission = draft.board.find((entry) => entry.id === commissionId);
  if (commission === undefined) {
    throw new EngineError('InternalError', 'the Commission left the Board between check and commit');
  }
  draft.board = draft.board.filter((entry) => entry.id !== commissionId);

  const sameDay = draft.parties.filter((party) => party.departedOn === draft.day).length;
  const returnsOn = draft.day + commission.spanDays;
  const backing = backingFor(draft.guild.guildmaster, content, draft.config);
  const party = {
    id: `p${draft.day}.${sameDay + 1}`,
    commissionId: commission.id,
    commission,
    heroIds: [...heroIds],
    backing,
    departedOn: draft.day,
    returnsOn,
    beatDays: beatDaysFor(draft.day, returnsOn, commission.beatCount, rng),
    beatsResolved: [],
    vignettesUsed: [],
    score: 0,
  };
  draft.parties.push(party);

  return {
    career: draft,
    events: [
      {
        type: 'PartyCommitted',
        day: draft.day,
        partyId: party.id,
        commissionId: commission.id,
        heroIds: [...heroIds],
        backing,
        returnsOn,
      },
    ],
  };
}

/** The Guild's Standing: mean Patron Regard, scaled. Derived from Regard, never set. */
export function standing(career: Career): number {
  return standingOf(career);
}

/** The Heroes who are not away on a Party. */
export function availableHeroes(career: Career): Hero[] {
  const away = new Set(career.parties.flatMap((party) => party.heroIds));
  return career.guild.roster.filter((hero) => !away.has(hero.id));
}

/** A Hero on the Roster, by id. Former Heroes are not searched. */
export function heroById(career: Career, id: string): Hero | undefined {
  return findHero(career, id);
}

/**
 * A Commission by id: on the Board, out with a Party, or recently finished. Work stays
 * readable for `config.recentCommissionsKept` returns after its Party came back.
 */
export function commissionById(career: Career, id: string): Commission | undefined {
  return (
    career.board.find((commission) => commission.id === id) ??
    career.parties.find((party) => party.commissionId === id)?.commission ??
    career.recentCommissions.find((commission) => commission.id === id)
  );
}
