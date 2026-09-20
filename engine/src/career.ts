/**
 * The loop: Days pass, Beats fire, Parties come back, Upkeep falls due, the Board
 * refreshes, and eventually the Career ends. Every function here is pure — a Career goes
 * in, a new Career and what happened come out, and the argument is never touched.
 */

import { ageRoster, retireByAge } from './age.js';
import { arriveApplicants, expireApplicants } from './applicant.js';
import { beatDaysFor, resolveBeat } from './beat.js';
import { refreshBoard } from './board.js';
import { backingFor, traitIndex, type TraitDefIndex } from './check.js';
import { cloneCareer } from './clone.js';
import type { Content } from './content.js';
import { considerDecision, settleWordTimeouts, turnBackFee } from './decision.js';
import { EngineError } from './errors.js';
import type { GameEvent } from './events.js';
import { decayRegard, REASON_INSISTED, settleSlidingRegard } from './regard.js';
import { refusalsAmong, unavailableAmong, type PartyProposal, type Refusal } from './refusal.js';
import { churnRivals, populateRivalRosters, retaliate, retireRivalHeroes } from './rival.js';
import { rngOn, type Rng } from './rng.js';
import {
  changeCoin,
  changeHeroRegardForGuildmaster,
  changePatronRegard,
  endCareer,
  findHero,
  isInjured,
  liftDueTraits,
  requireHero,
  requirePatron,
  retirementDay,
  standingOf,
} from './state.js';
import type { Career, Commission, Hero, Party, Step } from './types.js';

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
  // People turning up asking for work is exactly what a stretch of Days should stop for
  // (E4-S2). At the shipped defaults it changes nothing, because every arrival Day is
  // already a Board-refresh Day (DL-19 §4).
  'ApplicantsArrived',
  // A Party sending word can land on a Day on which none of the four above happens, so it
  // needs a member of its own: it is the one place the player's attention snaps back
  // mid-Commission, and a stretch that ran past it would be a stretch that ignored it
  // (E6-S2, DL-22). `PartyAnswered` is here for the timeout — the player should see the
  // default being taken for them, on the Day it is taken.
  'PartyAwaitingWord',
  'PartyAnswered',
]);

function fallsDue(day: number, every: number): boolean {
  return every > 0 && day % every === 0;
}

/**
 * Bring home every Party whose Day has come, and report who walked back through the door.
 *
 * A Party that has lost everybody comes home on the Day the last of them died rather than
 * on the Day it was due, and the work is not finished however far the score had got: it
 * cannot be, by people who are not there (E3-S1).
 */
function returnParties(draft: Career, events: GameEvent[]): string[] {
  // A Party that has sent word is standing still: it does not work and it does not come
  // home until somebody answers, which the timeout guarantees somebody eventually does
  // (E6-S2, DL-23 §3).
  const home = (party: Party): boolean =>
    party.pendingWord === undefined && (party.returnsOn <= draft.day || party.heroIds.length === 0);
  const returning = draft.parties.filter(home);
  if (returning.length === 0) return [];
  draft.parties = draft.parties.filter((party) => !home(party));

  for (const party of returning) {
    const commission = party.commission;
    // A Commission called off part-way through was not finished, however far the score had
    // got, and it pays pro rata rather than nothing: the work is not done, but the people
    // came home. There is no second return path — a turned-back Party comes through here
    // like any other, which is what gives it E2's drift, E2's Departure Check, E3's
    // Retirement and E5's retaliation on the Day it arrives (E6-S3, DL-22, DL-23 §5).
    const turnedBack = party.turnedBackOn !== undefined;
    const succeeded =
      !turnedBack && party.heroIds.length > 0 && party.score >= Math.ceil(commission.beatCount / 2);
    const feePaid = turnedBack
      ? turnBackFee(commission.fee, party.score, commission.beatCount, draft.config)
      : succeeded
        ? commission.fee
        : 0;
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
  return returning.flatMap((party) => party.heroIds);
}

/**
 * Disappointment fades. A Patron whose Regard for the Guild has gone negative recovers
 * `config.patronRegardRecoveryAmount` towards zero every `config.patronRegardRecoveryEveryDays`
 * Days, so that a Sphere is lost by failing that Patron's work rather than by arithmetic
 * (DL-13, F6). Regard at or above zero is left alone: goodwill is earned, and E2 owns its decay.
 */
function recoverPatronRegard(draft: Career, events: GameEvent[]): void {
  for (const patron of draft.patrons) {
    if (patron.regardForGuild.value >= 0) continue;
    changePatronRegard(draft, patron, draft.config.patronRegardRecoveryAmount, REASON_TIME_PASSED, events);
  }
}

function payUpkeep(draft: Career, events: GameEvent[]): void {
  const amount = upkeepDue(draft);
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
  // Injuries lift at the start of the Day, before anything can read who is available, so
  // a Hero whose span is up can be sent out on the Day it ends (E3-S2).
  liftDueTraits(draft, traits, events);
  ageRoster(draft);
  // Recruitment settles at the start of the Day: whoever has given up waiting goes before
  // anybody new arrives, so a fresh batch is never shown beside a stale one. Because
  // neither advancing call ever steps a Day of an ended Career, nothing can turn up after
  // the Career is over without a special case (E4-S2, DL-19 §4).
  expireApplicants(draft, events);
  arriveApplicants(draft, content, events);
  if (fallsDue(draft.day, draft.config.patronRegardRecoveryEveryDays)) {
    recoverPatronRegard(draft, events);
  }

  // A Party nobody answered has waited long enough: the Decision's `default` is taken for
  // them, before any Beat, so the Beat it displaced can fire on this very Day. This is the
  // whole of "a Career never deadlocks" (E6 §2): a stretch of Days stops when word
  // arrives, and the next stretch runs on to here (DL-23 §3).
  settleWordTimeouts(draft, content, rng, traits, events);

  for (const party of [...draft.parties]) {
    // A Party waiting for word does no work, and one that has been called home does none
    // either — which is what makes "no further Beats, therefore no further harm" a fact
    // about the Day loop rather than a promise (E6-S3).
    if (party.pendingWord !== undefined || party.turnedBackOn !== undefined) continue;
    const due = party.beatDays.filter((day) => day === draft.day).length;
    if (due === 0) continue;
    if (party.beatsResolved.length >= party.commission.beatCount) continue;
    // Considered at each Beat Day after the first, at most once per Commission. When word
    // is sent the Day's Beat is **not** resolved: it fires on the Day the Party is
    // answered, so `beatCount` is honoured either way (E6-S2).
    if (considerDecision(draft, party, content, events)) continue;
    for (let beat = 0; beat < due; beat += 1) {
      if (party.beatsResolved.length >= party.commission.beatCount) break;
      resolveBeat(draft, party, content, rng, events, traits);
    }
  }

  const cameHome = returnParties(draft, events);

  if (fallsDue(draft.day, draft.config.upkeepEveryDays)) {
    payUpkeep(draft, events);
    if (draft.ended !== undefined) return;
  }

  // Everyone who is leaving the Roster leaves before the Board is redrawn, so that a Hero
  // who has gone is gone by the time the player is offered work to send them on. The
  // order inside that is Retirement, then drift, then the Departure check, and then — E5
  // — the Rivals' own housekeeping: their people retire, a soured Rival poaches back, and
  // their Rosters churn.
  //
  // Why that order (E5-S4). The player's Roster settles first, in exactly the sequence E2
  // and E3 fixed, so nothing either of them pinned moves: a Hero old enough to retire goes
  // well rather than being soured and then lost (DL-16 §7), and a Hero the drift pushes
  // under the threshold is checked on the value it has just reached (E2). Retaliation
  // comes after all three, so a Rival can only take somebody the Guild still has — never
  // one who has just retired, and never one who was already walking out, which is the
  // player's own failure and not a Rival's success. It comes *after* drift on purpose: a
  // Hero the drift has just soured is takeable in the same refresh, because Regard is what
  // defends a Roster and the player has had the whole of it to watch. Churn comes last, so
  // a Rival who has just gained somebody is at the size churn then reads.
  //
  // A Hero who was away is settled on their return Day instead, for all four (DL-14 §4).
  const refreshing = fallsDue(draft.day, draft.config.boardRefreshEveryDays);
  const settling = refreshing || cameHome.length > 0;
  const only = refreshing ? undefined : cameHome;
  if (settling) retireByAge(draft, only, events);
  if (refreshing) decayRegard(draft, events);
  if (settling) {
    settleSlidingRegard(draft, content, rng, traits, only, events);
  }
  if (refreshing) retireRivalHeroes(draft, events);
  if (settling) retaliate(draft, only, events);
  if (refreshing) churnRivals(draft, content, events);

  if (refreshing) {
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

  // A save written before Rivals had people is populated the first time the engine is
  // handed content, before a single Day is stepped, so that nothing about them arrives in
  // the middle of a stretch (E5 §5, DL-15). Idempotent, and it draws from a stream of its
  // own, so it moves neither `career.rng` nor anything already on a Roster.
  populateRivalRosters(draft, content);
  const rng = rngOn(draft);
  const traits = traitIndex(content);
  const whole = Math.max(0, Math.floor(days));
  for (let step = 0; step < whole; step += 1) {
    const before = events.length;
    stepDay(draft, content, rng, traits, events);
    if (draft.ended !== undefined) break;
    // A stretch of Days stops on the Day a Party sends word, having simulated that Day and
    // not one more. A **later** call runs on past it — the awaiting Party stands still and
    // the rest of the world does not — until the timeout takes the default, which is what
    // keeps `advance` over any number of Days terminating (E6-S2, DL-23 §3).
    if (events.slice(before).some((event) => event.type === 'PartyAwaitingWord')) break;
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

  populateRivalRosters(draft, content);
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
 * The checks `proposeParty` and `commitParty` share, so that asking and deciding are
 * refused for the same reasons and with the same codes.
 *
 * @throws EngineError `CareerEnded`, `EmptyParty`, `CommissionNotOnBoard` or `HeroNotAvailable`.
 */
function requireParty(
  career: Career,
  commissionId: string,
  heroIds: readonly string[],
): { commission: Commission; heroes: Hero[] } {
  if (career.ended !== undefined) {
    throw new EngineError('CareerEnded', 'the Career has ended; no further Party can be committed');
  }
  if (heroIds.length === 0) {
    throw new EngineError('EmptyParty', 'a Party needs at least one Hero');
  }
  const commission = career.board.find((entry) => entry.id === commissionId);
  if (commission === undefined || commission.expiresOn <= career.day) {
    throw new EngineError(
      'CommissionNotOnBoard',
      `no Commission with id "${commissionId}" is on the Board`,
    );
  }
  const away = new Set(career.parties.flatMap((party) => party.heroIds));
  const named = new Set<string>();
  const heroes: Hero[] = [];
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
    if (isInjured(hero)) {
      throw new EngineError(
        'HeroNotAvailable',
        `${hero.name} is still carrying an Injury and cannot be sent out`,
      );
    }
    heroes.push(hero);
  }
  return { commission, heroes };
}

/**
 * Ask what sending these Heroes on this Commission would mean, without sending them
 * (E2). Pure and free: nothing in the Career moves, and nothing is reported.
 *
 * This is the load-bearing half of the pair. Deciding whether to insist means already
 * knowing who refuses and why, and the only way to learn that from a commit-shaped API
 * would be to commit and read the exception.
 *
 * @throws EngineError the same codes `commitParty` throws for a Commission that is not on
 * the Board, a Hero who cannot go, an empty Party or a Career that has ended.
 */
export function proposeParty(
  career: Career,
  commissionId: string,
  heroIds: string[],
  content: Content,
): PartyProposal {
  const { commission, heroes } = requireParty(career, commissionId, heroIds);
  const traits = traitIndex(content);
  return {
    commissionId: commission.id,
    heroIds: [...heroIds],
    backing: backingFor(
      career.guild.guildmaster,
      heroes,
      content,
      career.config,
      traits,
      career.guild.hall,
    ),
    refusals: refusalsAmong(heroes, commission, career.config, traits),
    unavailable: unavailableAmong(career),
  };
}

/** Charge every refusing Hero for being sent anyway, and report each one (E2). */
function applyInsistence(
  draft: Career,
  commission: Commission,
  refusals: readonly Refusal[],
  events: GameEvent[],
): void {
  for (const refusal of refusals) {
    const hero = requireHero(draft, refusal.heroId);
    events.push(
      refusal.trait === undefined
        ? {
            type: 'CommissionRefused',
            day: draft.day,
            heroId: hero.id,
            commissionId: commission.id,
            reason: refusal.reason,
            regardValue: refusal.regardValue,
          }
        : {
            type: 'CommissionRefused',
            day: draft.day,
            heroId: hero.id,
            commissionId: commission.id,
            reason: refusal.reason,
            trait: refusal.trait,
            regardValue: refusal.regardValue,
          },
    );
    const before = hero.regardForGuildmaster.value;
    const cost = -Math.abs(draft.config.insistenceRegardCost);
    changeHeroRegardForGuildmaster(draft, hero, cost, REASON_INSISTED, events);
    events.push({
      type: 'InsistenceApplied',
      day: draft.day,
      heroId: hero.id,
      commissionId: commission.id,
      delta: hero.regardForGuildmaster.value - before,
      value: hero.regardForGuildmaster.value,
    });
  }
}

/**
 * Send a Party. Its Backing is computed here and fixed for the Commission's duration
 * (ADR-0007), and the Commission leaves the Board.
 *
 * A Hero who refuses is never sent by accident: without `options.insist` the call is
 * rejected and the Career is untouched. With it, each refusing Hero is charged
 * `config.insistenceRegardCost` Regard **before** the Backing is worked out, so insisting
 * visibly weakens the Party it creates.
 *
 * @param options `insist` accepts the price the refusals carry. Harmless when nobody refuses.
 * @throws EngineError `CareerEnded`, `EmptyParty`, `CommissionNotOnBoard`,
 * `HeroNotAvailable` or `HeroRefused`.
 */
export function commitParty(
  career: Career,
  commissionId: string,
  heroIds: string[],
  content: Content,
  options?: { insist?: boolean },
): Step {
  const checked = requireParty(career, commissionId, heroIds);
  const traits = traitIndex(content);
  const refusals = refusalsAmong(checked.heroes, checked.commission, career.config, traits);
  if (refusals.length > 0 && options?.insist !== true) {
    const names = refusals
      .map((refusal) => findHero(career, refusal.heroId)?.name ?? refusal.heroId)
      .join(', ');
    throw new EngineError(
      'HeroRefused',
      `${names} will not take this Commission; insist to send them anyway`,
    );
  }

  const draft = cloneCareer(career);
  const rng = rngOn(draft);
  const commission = draft.board.find((entry) => entry.id === commissionId);
  if (commission === undefined) {
    throw new EngineError('InternalError', 'the Commission left the Board between check and commit');
  }
  draft.board = draft.board.filter((entry) => entry.id !== commissionId);

  const events: GameEvent[] = [];
  applyInsistence(draft, commission, refusals, events);

  const members = heroIds.map((id) => requireHero(draft, id));
  for (const hero of members) hero.lastCommittedOn = draft.day;

  const sameDay = draft.parties.filter((party) => party.departedOn === draft.day).length;
  const returnsOn = draft.day + commission.spanDays;
  const backing = backingFor(
    draft.guild.guildmaster,
    members,
    content,
    draft.config,
    traits,
    draft.guild.hall,
  );
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
    decisionUsed: false,
    dcDelta: 0,
  };
  draft.parties.push(party);

  events.push({
    type: 'PartyCommitted',
    day: draft.day,
    partyId: party.id,
    commissionId: commission.id,
    heroIds: [...heroIds],
    backing,
    returnsOn,
  });

  return { career: draft, events };
}

/** The Guild's Standing: mean Patron Regard, scaled. Derived from Regard, never set. */
export function standing(career: Career): number {
  return standingOf(career);
}

/**
 * The Heroes who can be sent out: not away on a Party, and not still injured (E3-S2).
 *
 * An Injury is a Trait carrying `liftsOn`, which is what solution architecture §3 has
 * said since E1 and is the whole of the test where the content is not in hand (DL-16 §5).
 */
export function availableHeroes(career: Career): Hero[] {
  const away = new Set(career.parties.flatMap((party) => party.heroIds));
  return career.guild.roster.filter((hero) => !away.has(hero.id) && !isInjured(hero));
}

/** The Heroes carrying an Injury, whether they are at home or away on work. */
export function injuredHeroes(career: Career): Hero[] {
  return career.guild.roster.filter(isInjured);
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

/**
 * What the next Upkeep will cost, at the current Roster size (DL-18). `payUpkeep` calls
 * this rather than carrying the sum a second time, so there is one expression for it.
 */
export function upkeepDue(career: Career): number {
  return career.config.upkeepBase + career.config.upkeepPerHero * career.guild.roster.length;
}

/**
 * Days from `career.day` until the next Day on which `fallsDue(day, every)` holds,
 * strictly after today. Built on the Day loop's own schedule test rather than a second
 * copy of its arithmetic, so a countdown can never disagree with the Day the thing it
 * counts down to actually happens on (DL-18).
 *
 * `stepDay` settles Upkeep and the Board before a caller ever sees the resulting Career,
 * so a Day that is itself due has already had its turn: this reports the interval to the
 * *following* one rather than zero, matching how both front ends already showed it.
 */
function daysUntil(day: number, every: number): number {
  if (every <= 0) return 0;
  let next = day + 1;
  while (!fallsDue(next, every)) next += 1;
  return next - day;
}

/** Days until Upkeep next falls due, on the definition {@link daysUntil} documents (DL-18). */
export function daysUntilUpkeep(career: Career): number {
  return daysUntil(career.day, career.config.upkeepEveryDays);
}

/** Days until the Board next refreshes, on the definition {@link daysUntil} documents (DL-18). */
export function daysUntilBoardRefresh(career: Career): number {
  return daysUntil(career.day, career.config.boardRefreshEveryDays);
}
