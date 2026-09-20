/**
 * The balance harness (DL-13, extended for E2 by DL-14). It plays a fleet of twenty-year
 * Careers under the same automatic policy the two contract suites use, over the real
 * authored content, and prints the numbers the balance pass is tuned against.
 *
 * It is not part of the normal suite: three hundred twenty-year Careers take minutes, and
 * a measurement is not an assertion. Run it deliberately:
 *
 *   HEROESIM_BALANCE=1 npx vitest run content/tests/balance.measure.test.ts
 *
 * `HEROESIM_BALANCE_SEEDS` overrides the fleet size; `HEROESIM_BALANCE_CONFIG` takes a
 * JSON object of `GameConfig` overrides, so a candidate default can be measured without
 * editing the engine first.
 */

import { describe, expect, it } from 'vitest';
import {
  acceptApplicant,
  acceptRefusal,
  advanceUntilAttention,
  answerParty,
  availableHeroes,
  commitParty,
  hallCost,
  HALL_IMPROVEMENTS,
  improveHall,
  newCareer,
  poachHero,
  proposeParty,
  rivalOffers,
  transferHero,
  wordOffers,
  REASON_DRIFTED,
  type Career,
  type Content,
  type GameConfig,
  type GameEvent,
  type HallImprovement,
  type Hero,
  type WordOffer,
} from '@heroesim/engine';
import { loadContentFromDisk } from '../src/node.js';

const content: Content = loadContentFromDisk();

const ENABLED = process.env['HEROESIM_BALANCE'] !== undefined;
const SEEDS = Number(process.env['HEROESIM_BALANCE_SEEDS'] ?? 300);
const OVERRIDES: Partial<GameConfig> = JSON.parse(
  process.env['HEROESIM_BALANCE_CONFIG'] ?? '{}',
) as Partial<GameConfig>;

const strength = (hero: Hero): number =>
  hero.stats.Might + hero.stats.Craft + hero.stats.Nerve + hero.stats.Guile;

/**
 * The automatic policy: the best Heroes to the best-paying work, two at a time. It never
 * insists (E2) — it asks who would refuse, sends somebody else, and leaves a Commission
 * nobody will take. So every refusal these numbers count is one the policy walked away
 * from, and the insistence count is zero by construction.
 */
function bestFirst(career: Career, run: Run): { commissionId: string; heroIds: string[] }[] {
  const free = [...availableHeroes(career)].sort((one, other) => strength(other) - strength(one));
  const byFee = [...career.board].sort((one, other) => other.fee - one.fee);
  const commitments: { commissionId: string; heroIds: string[] }[] = [];
  const used = new Set<string>();
  for (const commission of byFee) {
    const left = free.filter((hero) => !used.has(hero.id));
    if (left.length === 0) break;
    const refusals = proposeParty(
      career,
      commission.id,
      left.map((hero) => hero.id),
      content,
    ).refusals;
    run.refusals += refusals.length;
    for (const refusal of refusals) run.refusalsBy[refusal.reason] += 1;
    const refusing = new Set(refusals.map((refusal) => refusal.heroId));
    const party = left
      .filter((hero) => !refusing.has(hero.id))
      .slice(0, 2)
      .map((hero) => hero.id);
    if (party.length === 0) {
      run.commissionsNobodyWouldTake += 1;
      continue;
    }
    commitments.push({ commissionId: commission.id, heroIds: party });
    for (const id of party) used.add(id);
  }
  return commitments;
}

/**
 * A deliberately bad Guildmaster: one Commission at a time, the hardest on the Board,
 * and the weakest free Hero sent alone to it. This is the Career that fails about half
 * its work; "Coin is tight" means it should not survive twenty years of it.
 */
function worstFirst(career: Career, run: Run): { commissionId: string; heroIds: string[] }[] {
  if (career.parties.length > 0) return [];
  const free = [...availableHeroes(career)].sort((one, other) => strength(one) - strength(other));
  const hardest = [...career.board].sort((one, other) => other.difficulty - one.difficulty)[0];
  if (hardest === undefined || free.length === 0) return [];
  const refusals = proposeParty(
    career,
    hardest.id,
    free.map((candidate) => candidate.id),
    content,
  ).refusals;
  run.refusals += refusals.length;
  for (const refusal of refusals) run.refusalsBy[refusal.reason] += 1;
  const refusing = new Set(refusals.map((refusal) => refusal.heroId));
  const hero = free.find((candidate) => !refusing.has(candidate.id));
  if (hero === undefined) {
    run.commissionsNobodyWouldTake += 1;
    return [];
  }
  return [{ commissionId: hardest.id, heroIds: [hero.id] }];
}

type Policy = (career: Career, run: Run) => { commissionId: string; heroIds: string[] }[];

/** What one played Career looked like. */
interface Run {
  reason: 'retirement' | 'insolvency';
  endedOnDay: number;
  years: number;
  finalCoin: number;
  beats: Record<'failure' | 'success' | 'critical', number>;
  marginTotal: number;
  patronsAtFloor: number;
  patronCount: number;
  refreshes: number;
  emptyRefreshes: number;
  committed: number;
  commissionsCompleted: number;
  commissionsFailed: number;
  feeIncome: number;
  consequenceCoin: number;
  upkeepPaid: number;
  /** Commissions taken and finished inside the first two years, and how many failed. */
  earlyTaken: number;
  earlyFailed: number;
  // ── E2 (DL-14) ──
  /** Heroes who walked out over low Regard. */
  departures: number;
  /** Times the policy was told somebody would refuse, and on what grounds. */
  refusals: number;
  refusalsBy: Record<'regard' | 'trait', number>;
  /** Commissions the policy left alone because nobody on the Roster would take them. */
  commissionsNobodyWouldTake: number;
  /** Times the policy insisted. Zero by construction, and reported so that it stays zero. */
  insistences: number;
  /** Heroes drifting: Regard lost to neglect rather than to anything that happened. */
  driftEvents: number;
  /** What the Roster thought of the Guildmaster at the end, and the Backing that follows. */
  finalRegard: number[];
  backingTotal: number;
  backingCount: number;
  // ── E3 (DL-16) ──
  /** Injuries and Scars given, Heroes who did not come back, and Heroes who retired. */
  injuries: number;
  scars: number;
  deaths: number;
  retirements: number;
  /** Days of the Career on which at least one Hero on the Roster was too injured to be sent. */
  daysWithSomebodyInjured: number;
  /** Which Hall improvements the policy bought, and the Day it bought the first one. */
  hallBought: HallImprovement[];
  firstHallDay: number;
  // ── E4 (DL-19) ──
  /** Applicants who turned up, were taken on, were sent away and gave up waiting. */
  applicantsSeen: number;
  applicantsAccepted: number;
  applicantsDeclined: number;
  applicantsExpired: number;
  /** Applicants who had worked for the Guild before, and how many of those were taken back. */
  returnersSeen: number;
  returnersAccepted: number;
  /** Coin spent on joining fees, and the Roster at the end. */
  joiningFees: number;
  finalRoster: number;
  /** Days of the Career on which the Roster sat below `config.rosterFloor`. */
  daysBelowFloor: number;
  // ── E5 (DL-21) ──
  /** Heroes brought over above board, and what they cost. */
  transfers: number;
  transferFees: number;
  /** Heroes taken without asking, and what they cost in coin. */
  poaches: number;
  poachFees: number;
  /** Moves the world would not allow, by the reason it gave. */
  movesRefused: number;
  /** Heroes a soured Rival took back off the Roster. */
  poachedFromUs: number;
  /** Commissions Rivals took off the Board, and the refreshes they took them at. */
  takenByRivals: number;
  /** What the other Guilds thought of yours at the end, and how many were soured. */
  finalRivalRegard: number[];
  souredAtTheEnd: number;
  /** The sizes of every Rival's Roster at the end. */
  rivalRosters: number[];
  // ── E6 (DL-23) ──
  /** Commissions that stopped to ask, and the Commissions taken, so the rate can be read. */
  wordsSent: number;
  /** Words the Guildmaster answered, and words nobody answered in time. */
  wordsAnswered: number;
  wordsByDefault: number;
  /** What was chosen, by the option's own kind. */
  optionsTaken: Record<'pressOn' | 'sendCoin' | 'turnBack', number>;
  /** Commissions called off part-way through, and the pro-rata fees they were paid. */
  turnedBack: number;
  turnBackFees: number;
  /** Coin sent up the road to a Party that asked for it. */
  coinSentToParties: number;
  // ── What actually sours another Guild (DL-24 §B3) ──
  /**
   * Beats that came from a Vignette able to move a Rival's Regard, and the Regard those
   * moves added up to in each direction. Read off content rather than off an id written
   * in here, so authoring a second such Vignette is counted without an edit.
   */
  souringBeats: number;
  rivalRegardDown: number;
  rivalRegardUp: number;
}

/** The Vignettes whose outcomes can move a Rival's Regard, by id (E5's `rivalRegard`). */
const SOURING_VIGNETTES = new Set(
  content.vignettes
    .filter((vignette) =>
      (['failure', 'success', 'critical'] as const).some((result) =>
        vignette.outcomes[result].consequences.some(
          (consequence) => consequence.kind === 'rivalRegard',
        ),
      ),
    )
    .map((vignette) => vignette.id),
);

/** What the arms of the measurement switch on and off (DL-19 §10, DL-21). */
interface Arm {
  /** Whether the policy buys Hall improvements when it can comfortably afford one (E3). */
  buyHall: boolean;
  /** Whether the policy answers the door (E4). */
  recruit: boolean;
  /**
   * Whether the policy deals with the other Guilds (E5): one Transfer and one Poaching a
   * year, cheapest first, and only with a full `startingCoin` of runway to spare. Off by
   * default, so that the arms above go on measuring exactly the world they measured.
   */
  deal?: boolean;
  /**
   * What the policy says to a Party that has sent word (E6). Left out, it says nothing at
   * all and every word times out into the Decision's own default — which is the arm the
   * other five have always measured, because a policy that knows nothing about answering
   * is exactly what they are.
   *
   * `in-turn` takes the three kinds strictly in rotation and is a deliberately bad policy
   * (DL-23): it calls off a sixth of every Commission the Guild takes. `default` takes the
   * option the timeout would have taken, at once — so the difference between it and saying
   * nothing is the price of the **waiting** alone, with the option held constant.
   * `sensible` is the policy a player would actually have (DL-24 §B1).
   */
  answer?: 'in-turn' | 'default' | 'sensible';
  /**
   * Recruit and deal up to this Roster size and then stop, rather than taking on whoever
   * the Guild can pay for. DL-20 §3 measured the optimum at about eight, and every arm
   * above this one holds the Guild at `rosterFloor` — which is why they overstate what
   * E6 costs a Guild that plays well (DL-24 §B1). Left out, nothing changes.
   */
  rosterTarget?: number;
}

/**
 * What a player who is paying attention says to a Party that has sent word.
 *
 * Turn back when the work is going badly and there is enough of it left for that to
 * matter; send coin when the Guild can plainly afford it; otherwise press on. Nothing
 * clever, and nothing a front end could not show: the score, the Beats left and the coin
 * are all on the offer or on the Party (DL-24 §B1).
 */
function sensibleAnswer(career: Career, offer: WordOffer): string | undefined {
  const party = career.parties.find((entry) => entry.id === offer.partyId);
  const open = offer.options.filter((option) => option.affordable);
  const ofKind = (kind: 'pressOn' | 'sendCoin' | 'turnBack') =>
    open.find((option) => option.kind === kind);
  if (party !== undefined) {
    const beatsLeft = party.commission.beatCount - party.beatsResolved.length;
    const back = ofKind('turnBack');
    if (party.score < 0 && beatsLeft >= 2 && back !== undefined) return back.id;
  }
  const paid = ofKind('sendCoin');
  if (paid !== undefined && career.guild.coin >= 3 * (paid.cost ?? 0) + career.config.startingCoin) {
    return paid.id;
  }
  return (ofKind('pressOn') ?? open[0])?.id;
}

/** Which option this arm takes, or `undefined` to say nothing and let the timeout have it. */
function chooseAnswer(career: Career, offer: WordOffer, answered: number, arm: Arm): string | undefined {
  if (arm.answer === undefined) return undefined;
  if (arm.answer === 'sensible') return sensibleAnswer(career, offer);
  if (arm.answer === 'default') {
    const wanted = offer.options.find(
      (option) => option.id === offer.defaultOptionId && option.affordable,
    );
    return (wanted ?? offer.options.find((option) => option.affordable))?.id;
  }
  const kind = ['pressOn', 'sendCoin', 'turnBack'][answered % 3];
  const chosen =
    offer.options.find((option) => option.kind === kind && option.affordable) ??
    offer.options.find((option) => option.affordable);
  return chosen?.id;
}

function playOne(
  seed: string,
  policy: Policy,
  config: Partial<GameConfig>,
  arm: Arm = { buyHall: true, recruit: false },
): Run {
  const opened = newCareer(seed, content, config);
  let career = opened.career;
  const run: Run = {
    reason: 'retirement',
    endedOnDay: 0,
    years: 0,
    finalCoin: 0,
    beats: { failure: 0, success: 0, critical: 0 },
    marginTotal: 0,
    patronsAtFloor: 0,
    patronCount: career.patrons.length,
    refreshes: 0,
    emptyRefreshes: 0,
    committed: 0,
    commissionsCompleted: 0,
    commissionsFailed: 0,
    feeIncome: 0,
    consequenceCoin: 0,
    upkeepPaid: 0,
    earlyTaken: 0,
    earlyFailed: 0,
    wordsSent: 0,
    wordsAnswered: 0,
    wordsByDefault: 0,
    optionsTaken: { pressOn: 0, sendCoin: 0, turnBack: 0 },
    turnedBack: 0,
    turnBackFees: 0,
    coinSentToParties: 0,
    souringBeats: 0,
    rivalRegardDown: 0,
    rivalRegardUp: 0,
    departures: 0,
    refusals: 0,
    refusalsBy: { regard: 0, trait: 0 },
    commissionsNobodyWouldTake: 0,
    insistences: 0,
    driftEvents: 0,
    finalRegard: [],
    backingTotal: 0,
    backingCount: 0,
    injuries: 0,
    scars: 0,
    deaths: 0,
    retirements: 0,
    daysWithSomebodyInjured: 0,
    hallBought: [],
    firstHallDay: 0,
    applicantsSeen: 0,
    applicantsAccepted: 0,
    applicantsDeclined: 0,
    applicantsExpired: 0,
    returnersSeen: 0,
    returnersAccepted: 0,
    joiningFees: 0,
    finalRoster: 0,
    daysBelowFloor: 0,
    transfers: 0,
    transferFees: 0,
    poaches: 0,
    poachFees: 0,
    movesRefused: 0,
    poachedFromUs: 0,
    takenByRivals: 0,
    finalRivalRegard: [],
    souredAtTheEnd: 0,
    rivalRosters: [],
  };
  const twoYears = career.config.daysPerYear * 2;
  /** Which Parties were called home, so the pro-rata fee can be told from an ordinary one. */
  const turnedBackParties = new Set<string>();

  const read = (events: readonly GameEvent[]): void => {
    for (const event of events) {
      switch (event.type) {
        case 'BeatResolved':
          run.beats[event.result] += 1;
          run.marginTotal += event.total - event.dc;
          if (SOURING_VIGNETTES.has(event.vignetteId)) run.souringBeats += 1;
          break;
        case 'RivalRegardChanged':
          if (event.delta < 0) run.rivalRegardDown -= event.delta;
          else run.rivalRegardUp += event.delta;
          break;
        case 'BoardRefreshed':
          run.refreshes += 1;
          if (event.commissionIds.length === 0) run.emptyRefreshes += 1;
          break;
        case 'PartyCommitted':
          run.committed += 1;
          run.backingTotal += event.backing;
          run.backingCount += 1;
          break;
        case 'PartyReturned':
          if (event.day <= twoYears) {
            run.earlyTaken += 1;
            if (!event.succeeded) run.earlyFailed += 1;
          }
          if (turnedBackParties.has(event.partyId)) run.turnBackFees += event.feePaid;
          break;
        case 'CoinChanged':
          if (event.reason === 'fee') run.feeIncome += event.delta;
          if (event.reason === 'consequence') run.consequenceCoin += event.delta;
          if (event.reason === 'upkeep') run.upkeepPaid -= event.delta;
          if (event.reason === 'sendCoin') run.coinSentToParties -= event.delta;
          break;
        case 'InsistenceApplied':
          run.insistences += 1;
          break;
        case 'HeroRegardForGuildmasterChanged':
          if (event.reason === REASON_DRIFTED) run.driftEvents += 1;
          break;
        case 'HeroInjured':
          run.injuries += 1;
          break;
        case 'HeroScarred':
          run.scars += 1;
          break;
        case 'HeroDied':
          run.deaths += 1;
          break;
        case 'HeroRetired':
          run.retirements += 1;
          break;
        case 'HallImproved':
          run.hallBought.push(event.improvement);
          if (run.firstHallDay === 0) run.firstHallDay = event.day;
          break;
        case 'ApplicantsArrived':
          run.applicantsSeen += event.applicantIds.length;
          break;
        case 'ApplicantAccepted':
          run.applicantsAccepted += 1;
          run.joiningFees += event.fee;
          break;
        case 'ApplicantDeclined':
          if (event.reason === 'player') run.applicantsDeclined += 1;
          else run.applicantsExpired += 1;
          break;
        case 'HeroJoined':
          if (event.formerHeroId !== undefined) run.returnersAccepted += 1;
          break;
        case 'HeroTransferred':
          run.transfers += 1;
          run.transferFees += event.fee;
          break;
        case 'HeroPoached':
          run.poaches += 1;
          run.poachFees += event.fee;
          break;
        case 'TransferRefused':
          run.movesRefused += 1;
          break;
        case 'RivalPoachedHero':
          run.poachedFromUs += 1;
          break;
        case 'PartyAwaitingWord':
          run.wordsSent += 1;
          break;
        case 'PartyAnswered': {
          run.wordsAnswered += 1;
          if (event.byDefault) run.wordsByDefault += 1;
          const kind = content.decisions
            .find((decision) => decision.id === event.decisionId)
            ?.options.find((option) => option.id === event.optionId)?.kind;
          if (kind !== undefined) run.optionsTaken[kind] += 1;
          break;
        }
        case 'PartyTurnedBack':
          run.turnedBack += 1;
          turnedBackParties.add(event.partyId);
          break;
        case 'CommissionTakenByRival':
          run.takenByRivals += 1;
          break;
        default:
          break;
      }
    }
  };

  read(opened.events);
  let guard = 0;
  while (career.ended === undefined) {
    guard += 1;
    if (guard > 100_000) throw new Error('the automatic policy never reached the end of the Career');
    // The policy improves the Hall when it can comfortably afford one — the cost plus a
    // full `startingCoin` of runway left over — because an injured Hero cannot be sent and
    // a Guild that never buys the infirmary spends a growing share of twenty years with
    // half its Roster at home (E3). It never commits an injured Hero, which it does not
    // have to remember: `availableHeroes` leaves them out.
    // E4's own arm: the policy answers the door. Short-handed it takes whoever it can pay
    // for, because a Guild with nobody on the Roster cannot earn its way to a comfortable
    // balance; at or above the floor it keeps a full `startingCoin` of runway back, so
    // recruiting is never what makes it insolvent. It never turns anybody away, so the
    // Applicants it does not take are the ones the world would not let it (DL-19 §10).
    for (const applicant of arm.recruit ? [...career.applicants] : []) {
      if (applicant.formerHeroId !== undefined) run.returnersSeen += 1;
      // Inert unless the arm names a target, so every arm written before DL-24 §B1 goes on
      // measuring exactly the world it measured.
      if (arm.rosterTarget !== undefined && career.guild.roster.length >= arm.rosterTarget) {
        continue;
      }
      if (acceptRefusal(career, applicant.id) !== undefined) continue;
      const shortHanded = career.guild.roster.length < career.config.rosterFloor;
      if (!shortHanded && career.guild.coin < applicant.askingFee + career.config.startingCoin) {
        continue;
      }
      const taken = acceptApplicant(career, applicant.id);
      career = taken.career;
      read(taken.events);
    }
    // E5's own arm: the policy brings somebody over and takes somebody, at most once a
    // year each, cheapest first. It keeps a full `startingCoin` of runway back, so neither
    // is ever what makes it insolvent; what the Poaching costs is felt on the Board.
    if (arm.deal === true) {
      const year = Math.floor((career.day - 1) / career.config.daysPerYear);
      for (const rival of career.rivals) {
        if (run.poaches + run.transfers >= (year + 1) * 2) break;
        // A Guild that is already the size it wants to be has nowhere to put anybody.
        if (arm.rosterTarget !== undefined && career.guild.roster.length >= arm.rosterTarget) {
          break;
        }
        const offers = rivalOffers(career, rival.id);
        const takeable = offers
          .filter((offer) => offer.poachRefusal === undefined)
          .sort((one, other) => one.poachFee - other.poachFee)[0];
        if (
          run.poaches <= year &&
          takeable !== undefined &&
          career.guild.coin >= takeable.poachFee + career.config.startingCoin
        ) {
          const step = poachHero(career, rival.id, takeable.hero.id);
          career = step.career;
          read(step.events);
          continue;
        }
        const buyable = offers
          .filter((offer) => offer.transferRefusal === undefined)
          .sort((one, other) => one.transferFee - other.transferFee)[0];
        if (
          run.transfers <= year &&
          buyable !== undefined &&
          career.guild.coin >= buyable.transferFee + career.config.startingCoin
        ) {
          const step = transferHero(career, rival.id, buyable.hero.id);
          career = step.career;
          read(step.events);
        }
      }
    }
    // E6: a Party that has stopped to ask is answered before anything else is decided,
    // because the Days will not run until it is. The three kinds are taken in turn, so
    // the mix is even rather than a policy's preference (DL-23).
    // Asked again after every answer, because sending coin moves the balance the next
    // Party's options are weighed against — an offer read before the coin left the Guild
    // is out of date the moment it does (DL-23 §8).
    for (let guard = 0; arm.answer !== undefined && guard < 16; guard += 1) {
      const offer = wordOffers(career, content)[0];
      if (offer === undefined) break;
      const chosen = chooseAnswer(career, offer, run.wordsAnswered, arm);
      if (chosen === undefined) break;
      const step = answerParty(career, offer.partyId, chosen, content);
      career = step.career;
      read(step.events);
    }
    for (const improvement of HALL_IMPROVEMENTS) {
      if (!arm.buyHall) break;
      if (career.guild.hall.includes(improvement)) continue;
      if (career.guild.coin < hallCost(improvement, career.config) + career.config.startingCoin) {
        continue;
      }
      const bought = improveHall(career, improvement);
      career = bought.career;
      read(bought.events);
    }
    if (career.guild.roster.some((hero) => hero.traits.some((trait) => trait.liftsOn !== undefined))) {
      run.daysWithSomebodyInjured += 1;
    }
    if (career.guild.roster.length < career.config.rosterFloor) run.daysBelowFloor += 1;
    for (const { commissionId, heroIds } of policy(career, run)) {
      const step = commitParty(career, commissionId, heroIds, content);
      career = step.career;
      read(step.events);
    }
    const step = advanceUntilAttention(career, content);
    career = step.career;
    read(step.events);
  }

  const floor = career.config.patronPostsAboveRegard;
  run.reason = career.ended.reason;
  run.endedOnDay = career.ended.onDay;
  run.years = (career.ended.onDay - 1) / career.config.daysPerYear;
  run.finalCoin = career.guild.coin;
  run.patronsAtFloor = career.patrons.filter((patron) => patron.regardForGuild.value <= floor).length;
  run.patronCount = career.patrons.length;
  run.commissionsCompleted = career.ledger.commissionsCompleted;
  run.commissionsFailed = career.ledger.commissionsFailed;
  run.departures = career.ledger.departures;
  run.finalRegard = career.guild.roster.map((hero) => hero.regardForGuildmaster.value);
  run.finalRoster = career.guild.roster.length;
  run.finalRivalRegard = career.rivals.map((rival) => rival.regardForGuild.value);
  run.souredAtTheEnd = career.rivals.filter(
    (rival) => rival.regardForGuild.value <= career.config.souredRivalThreshold,
  ).length;
  run.rivalRosters = career.rivals.map((rival) => rival.roster.length);
  return run;
}

function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((one, other) => one - other);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle] ?? 0;
  return ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
}

const sum = (values: readonly number[]): number => values.reduce((total, value) => total + value, 0);
const mean = (values: readonly number[]): number =>
  values.length === 0 ? 0 : sum(values) / values.length;
const percent = (part: number, whole: number): string =>
  whole === 0 ? '   n/a' : `${((part / whole) * 100).toFixed(1)}%`;
const coin = (value: number): string => Math.round(value).toLocaleString('en-GB');

function report(label: string, runs: readonly Run[]): void {
  const finalCoin = runs.map((run) => run.finalCoin);
  const beats = {
    failure: sum(runs.map((run) => run.beats.failure)),
    success: sum(runs.map((run) => run.beats.success)),
    critical: sum(runs.map((run) => run.beats.critical)),
  };
  const allBeats = beats.failure + beats.success + beats.critical;
  const refreshes = sum(runs.map((run) => run.refreshes));
  const empty = sum(runs.map((run) => run.emptyRefreshes));
  const patrons = sum(runs.map((run) => run.patronCount));
  const atFloor = sum(runs.map((run) => run.patronsAtFloor));
  const retired = runs.filter((run) => run.reason === 'retirement').length;
  const broke = runs.filter((run) => run.reason === 'insolvency');
  const lines = [
    ``,
    `── ${label} — ${runs.length} seeds ──────────────────────────────`,
    `retirement rate        ${percent(retired, runs.length)}  (${retired}/${runs.length}; ${runs.length - retired} insolvent)`,
    `insolvency  median yr  ${median(broke.map((run) => run.years)).toFixed(1)}`,
    `            inside yr2 ${percent(broke.filter((run) => run.years <= 2).length, runs.length)} of all Careers`,
    `mean years reached     ${mean(runs.map((run) => run.years)).toFixed(1)}`,
    `final coin  mean       ${coin(mean(finalCoin))}`,
    `            median     ${coin(median(finalCoin))}`,
    `            min / max  ${coin(Math.min(...finalCoin))} / ${coin(Math.max(...finalCoin))}`,
    `Beat mix    failure    ${percent(beats.failure, allBeats)}`,
    `            success    ${percent(beats.success, allBeats)}`,
    `            critical   ${percent(beats.critical, allBeats)}`,
    `mean margin over DC    ${(sum(runs.map((run) => run.marginTotal)) / Math.max(1, allBeats)).toFixed(2)}`,
    `Patrons at/below floor ${percent(atFloor, patrons)}  (${atFloor}/${patrons} at the end)`,
    `empty Board refreshes  ${percent(empty, refreshes)}  (${empty}/${refreshes})`,
    `Commissions per year   ${(sum(runs.map((run) => run.committed)) / Math.max(1, sum(runs.map((run) => run.years)))).toFixed(1)}`,
    `Commission success     ${percent(
      sum(runs.map((run) => run.commissionsCompleted)),
      sum(runs.map((run) => run.commissionsCompleted + run.commissionsFailed)),
    )}`,
    `coin per year   fees   ${coin(sum(runs.map((run) => run.feeIncome)) / Math.max(1, sum(runs.map((run) => run.years))))}`,
    `             outcomes  ${coin(sum(runs.map((run) => run.consequenceCoin)) / Math.max(1, sum(runs.map((run) => run.years))))}`,
    `               Upkeep  −${coin(sum(runs.map((run) => run.upkeepPaid)) / Math.max(1, sum(runs.map((run) => run.years))))}`,
    `first two years failed ${percent(
      sum(runs.map((run) => run.earlyFailed)),
      sum(runs.map((run) => run.earlyTaken)),
    )}`,
    `departures per Career  ${mean(runs.map((run) => run.departures)).toFixed(2)}  (${sum(
      runs.map((run) => run.departures),
    )} over ${runs.length}; ${percent(
      runs.filter((run) => run.departures > 0).length,
      runs.length,
    )} of Careers lost somebody)`,
    `refusals per Career    ${mean(runs.map((run) => run.refusals)).toFixed(1)}  (${sum(
      runs.map((run) => run.refusalsBy.trait),
    )} over a Trait, ${sum(runs.map((run) => run.refusalsBy.regard))} over Regard)`,
    `work nobody would take ${mean(runs.map((run) => run.commissionsNobodyWouldTake)).toFixed(2)} per Career`,
    `insistences            ${sum(runs.map((run) => run.insistences))}  (the policy never insists)`,
    `drift, Regard lost     ${mean(runs.map((run) => run.driftEvents)).toFixed(1)} per Career`,
    `Hero Regard at the end mean ${mean(runs.flatMap((run) => run.finalRegard)).toFixed(2)}, ` +
      `median ${median(runs.flatMap((run) => run.finalRegard)).toFixed(1)}, ` +
      `${percent(
        runs.flatMap((run) => run.finalRegard).filter((value) => value <= -3).length,
        runs.flatMap((run) => run.finalRegard).length,
      )} refusing`,
    `mean Backing committed ${(
      sum(runs.map((run) => run.backingTotal)) / Math.max(1, sum(runs.map((run) => run.backingCount)))
    ).toFixed(2)}`,
    `harm per Career`,
    `            Injuries   ${mean(runs.map((run) => run.injuries)).toFixed(1)}  (${percent(
      runs.filter((run) => run.injuries > 0).length,
      runs.length,
    )} of Careers had one)`,
    `            Scars      ${mean(runs.map((run) => run.scars)).toFixed(2)}  (${percent(
      runs.filter((run) => run.scars > 0).length,
      runs.length,
    )} of Careers had one)`,
    `            deaths     ${mean(runs.map((run) => run.deaths)).toFixed(3)}  (${sum(
      runs.map((run) => run.deaths),
    )} over ${runs.length}; ${percent(
      runs.filter((run) => run.deaths > 0).length,
      runs.length,
    )} of Careers lost somebody)`,
    `            retirements ${mean(runs.map((run) => run.retirements)).toFixed(2)}  (${percent(
      runs.filter((run) => run.retirements > 0).length,
      runs.length,
    )} of Careers retired somebody)`,
    `exits, all three kinds ${percent(
      runs.filter((run) => run.deaths > 0 && run.retirements > 0 && run.departures > 0).length,
      runs.length,
    )} of Careers`,
    `Hall  improvements     ${mean(runs.map((run) => run.hallBought.length)).toFixed(2)} per Career`,
    `      bought all three ${percent(
      runs.filter((run) => run.hallBought.length === 3).length,
      runs.length,
    )}`,
    `      first one on Day ${median(
      runs.filter((run) => run.firstHallDay > 0).map((run) => run.firstHallDay),
    ).toFixed(0)}  (median; ${percent(
      runs.filter((run) => run.firstHallDay === 0).length,
      runs.length,
    )} never bought one)`,
    `Applicants  seen       ${mean(runs.map((run) => run.applicantsSeen)).toFixed(1)} per Career`,
    `            taken on   ${mean(runs.map((run) => run.applicantsAccepted)).toFixed(2)}  (${percent(
      runs.filter((run) => run.applicantsAccepted > 0).length,
      runs.length,
    )} of Careers took somebody on)`,
    `            expired    ${mean(runs.map((run) => run.applicantsExpired)).toFixed(1)}`,
    `            returners  ${mean(runs.map((run) => run.returnersSeen)).toFixed(3)} offered, ${mean(
      runs.map((run) => run.returnersAccepted),
    ).toFixed(3)} taken back`,
    `            joining fees ${coin(
      sum(runs.map((run) => run.joiningFees)) / Math.max(1, sum(runs.map((run) => run.years))),
    )} per year`,
    `Roster      at the end ${mean(runs.map((run) => run.finalRoster)).toFixed(2)}  (${percent(
      runs.filter((run) => run.finalRoster === 0).length,
      runs.length,
    )} of Careers ended with nobody)`,
    `            below floor ${percent(
      sum(runs.map((run) => run.daysBelowFloor)),
      sum(runs.map((run) => run.daysBelowFloor + 1)),
    )} of the decision points it saw`,
    `the other Guilds`,
    `            Transfers  ${mean(runs.map((run) => run.transfers)).toFixed(2)} per Career, ` +
      `${coin(
        sum(runs.map((run) => run.transferFees)) / Math.max(1, sum(runs.map((run) => run.years))),
      )} coin a year`,
    `            Poachings  ${mean(runs.map((run) => run.poaches)).toFixed(2)} per Career, ` +
      `${coin(
        sum(runs.map((run) => run.poachFees)) / Math.max(1, sum(runs.map((run) => run.years))),
      )} coin a year`,
    `            refused    ${mean(runs.map((run) => run.movesRefused)).toFixed(2)} per Career`,
    `            taken off us ${mean(runs.map((run) => run.poachedFromUs)).toFixed(2)} per Career ` +
      `(${percent(
        runs.filter((run) => run.poachedFromUs > 0).length,
        runs.length,
      )} of Careers lost somebody)`,
    `Board       lost to Rivals ${(
      sum(runs.map((run) => run.takenByRivals)) / Math.max(1, sum(runs.map((run) => run.refreshes)))
    ).toFixed(2)} Commissions per refresh`,
    `Rivals      Regard at end mean ${mean(runs.flatMap((run) => run.finalRivalRegard)).toFixed(2)}, ` +
      `${mean(runs.map((run) => run.souredAtTheEnd)).toFixed(2)} of 4 soured`,
    `            Roster size mean ${mean(runs.flatMap((run) => run.rivalRosters)).toFixed(2)}, ` +
      `max ${Math.max(0, ...runs.flatMap((run) => run.rivalRosters))}`,
    `Decisions   per Career ${mean(runs.map((run) => run.wordsSent)).toFixed(2)}, ` +
      `${(sum(runs.map((run) => run.wordsSent)) / Math.max(1, sum(runs.map((run) => run.committed)))).toFixed(3)} per Commission`,
    `            answered   ${sum(runs.map((run) => run.wordsAnswered))}, of which ` +
      `${percent(sum(runs.map((run) => run.wordsByDefault)), sum(runs.map((run) => run.wordsAnswered)))} by default`,
    `            option mix press-on ${percent(
      sum(runs.map((run) => run.optionsTaken.pressOn)),
      sum(runs.map((run) => run.wordsAnswered)),
    )}, send-coin ${percent(
      sum(runs.map((run) => run.optionsTaken.sendCoin)),
      sum(runs.map((run) => run.wordsAnswered)),
    )}, turn-back ${percent(
      sum(runs.map((run) => run.optionsTaken.turnBack)),
      sum(runs.map((run) => run.wordsAnswered)),
    )}`,
    `            turned back ${mean(runs.map((run) => run.turnedBack)).toFixed(2)} per Career ` +
      `(${percent(
        sum(runs.map((run) => run.turnedBack)),
        sum(runs.map((run) => run.committed)),
      )} of Commissions), paid ${coin(
        sum(runs.map((run) => run.turnBackFees)) / Math.max(1, sum(runs.map((run) => run.turnedBack))),
      )} coin each`,
    `            coin sent up the road ${coin(mean(runs.map((run) => run.coinSentToParties)))} per Career`,
    ``,
  ];
  console.log(lines.join('\n'));
}

/**
 * Every arm of one measurement in a single table, so that two of them can actually be
 * compared. `report` above prints one arm at a time down the page, which is the right
 * shape for reading a single world and the wrong one for reading a dial (DL-24 §B1).
 */
function compare(title: string, arms: readonly { label: string; runs: Run[] }[]): void {
  const years = (runs: readonly Run[]): number => Math.max(1, sum(runs.map((run) => run.years)));
  const beats = (runs: readonly Run[], of: 'failure' | 'success' | 'critical'): string =>
    percent(
      sum(runs.map((run) => run.beats[of])),
      sum(runs.map((run) => run.beats.failure + run.beats.success + run.beats.critical)),
    );
  const rows: { name: string; of: (runs: readonly Run[]) => string }[] = [
    {
      name: 'reached Retirement',
      of: (runs) => percent(runs.filter((run) => run.reason === 'retirement').length, runs.length),
    },
    { name: 'mean years reached', of: (runs) => mean(runs.map((run) => run.years)).toFixed(1) },
    { name: 'final coin, mean', of: (runs) => coin(mean(runs.map((run) => run.finalCoin))) },
    { name: 'final coin, median', of: (runs) => coin(median(runs.map((run) => run.finalCoin))) },
    {
      name: 'Commissions per year',
      of: (runs) => (sum(runs.map((run) => run.committed)) / years(runs)).toFixed(1),
    },
    {
      name: 'Commissions succeed',
      of: (runs) =>
        percent(
          sum(runs.map((run) => run.commissionsCompleted)),
          sum(runs.map((run) => run.commissionsCompleted + run.commissionsFailed)),
        ),
    },
    { name: 'Beat failure', of: (runs) => beats(runs, 'failure') },
    { name: 'Beat success', of: (runs) => beats(runs, 'success') },
    { name: 'Beat critical', of: (runs) => beats(runs, 'critical') },
    {
      name: 'Decisions / Commission',
      of: (runs) =>
        (
          sum(runs.map((run) => run.wordsSent)) / Math.max(1, sum(runs.map((run) => run.committed)))
        ).toFixed(3),
    },
    {
      name: 'Decisions per year',
      of: (runs) => (sum(runs.map((run) => run.wordsSent)) / years(runs)).toFixed(1),
    },
    {
      name: 'turned back, of work',
      of: (runs) =>
        percent(sum(runs.map((run) => run.turnedBack)), sum(runs.map((run) => run.committed))),
    },
    {
      name: 'turned back, of words',
      of: (runs) =>
        percent(sum(runs.map((run) => run.turnedBack)), sum(runs.map((run) => run.wordsSent))),
    },
    {
      name: 'taken off us / Career',
      of: (runs) => mean(runs.map((run) => run.poachedFromUs)).toFixed(2),
    },
    {
      name: 'souring Beats / Career',
      of: (runs) => mean(runs.map((run) => run.souringBeats)).toFixed(1),
    },
    {
      name: 'souring Beats, of all',
      of: (runs) =>
        percent(
          sum(runs.map((run) => run.souringBeats)),
          sum(runs.map((run) => run.beats.failure + run.beats.success + run.beats.critical)),
        ),
    },
    {
      name: 'Rival Regard down / up',
      of: (runs) =>
        `${mean(runs.map((run) => run.rivalRegardDown)).toFixed(0)}/${mean(
          runs.map((run) => run.rivalRegardUp),
        ).toFixed(0)}`,
    },
    {
      name: 'Rivals soured at end',
      of: (runs) => mean(runs.map((run) => run.souredAtTheEnd)).toFixed(2),
    },
    { name: 'Transfers / Career', of: (runs) => mean(runs.map((run) => run.transfers)).toFixed(2) },
    { name: 'Poachings / Career', of: (runs) => mean(runs.map((run) => run.poaches)).toFixed(2) },
    {
      name: 'Applicants seen',
      of: (runs) => mean(runs.map((run) => run.applicantsSeen)).toFixed(0),
    },
    {
      name: 'Applicants taken on',
      of: (runs) => mean(runs.map((run) => run.applicantsAccepted)).toFixed(2),
    },
    { name: 'Roster at the end', of: (runs) => mean(runs.map((run) => run.finalRoster)).toFixed(2) },
    { name: 'Injuries / Career', of: (runs) => mean(runs.map((run) => run.injuries)).toFixed(1) },
    { name: 'Scars / Career', of: (runs) => mean(runs.map((run) => run.scars)).toFixed(2) },
    { name: 'deaths / Career', of: (runs) => mean(runs.map((run) => run.deaths)).toFixed(2) },
    {
      name: 'Retirements / Career',
      of: (runs) => mean(runs.map((run) => run.retirements)).toFixed(2),
    },
    { name: 'Departures / Career', of: (runs) => mean(runs.map((run) => run.departures)).toFixed(2) },
    {
      name: 'Patrons at/below floor',
      of: (runs) =>
        percent(sum(runs.map((run) => run.patronsAtFloor)), sum(runs.map((run) => run.patronCount))),
    },
    {
      name: 'empty Board refreshes',
      of: (runs) =>
        percent(sum(runs.map((run) => run.emptyRefreshes)), sum(runs.map((run) => run.refreshes))),
    },
  ];

  const width = 11;
  const lines = [
    ``,
    `══ ${title} — ${arms[0]?.runs.length ?? 0} seeds an arm ${'═'.repeat(40)}`,
    `${'arm'.padEnd(24)}${arms.map((arm) => arm.label.padStart(width)).join('')}`,
    ...rows.map(
      (row) =>
        `${row.name.padEnd(24)}${arms.map((arm) => row.of(arm.runs).padStart(width)).join('')}`,
    ),
    ``,
  ];
  console.log(lines.join('\n'));
}

describe.skipIf(!ENABLED)('the balance of the authored world', () => {
  it(
    'measures the automatic policy over twenty years',
    () => {
      const runs: Run[] = [];
      for (let seed = 0; seed < SEEDS; seed += 1) {
        runs.push(playOne(`balance-${seed}`, bestFirst, OVERRIDES));
      }
      report('automatic policy', runs);
      expect(runs).toHaveLength(SEEDS);
    },
    1_800_000,
  );

  /**
   * E4 measured against E3-**without**-Applicants, not against E2 (DL-17 §2). Four arms,
   * the same seeds through each: with and without an accepting policy, crossed with and
   * without Hall-buying, so that what Applicants are worth can be read off separately
   * from what the Hall is worth. The first arm is the un-helped E3 baseline the suite
   * otherwise has nowhere.
   */
  it(
    'measures what Applicants are worth, against E3 with and without the Hall',
    () => {
      const arms: { label: string; arm: Arm }[] = [
        { label: 'E3 baseline: no Hall, no Applicants', arm: { buyHall: false, recruit: false } },
        { label: 'E3 with the Hall, no Applicants', arm: { buyHall: true, recruit: false } },
        { label: 'E4: no Hall, taking Applicants on', arm: { buyHall: false, recruit: true } },
        { label: 'E4: the Hall and Applicants both', arm: { buyHall: true, recruit: true } },
        // E5's own pair, measured against the arm directly above it so that what dealing
        // with the other Guilds is worth can be read off on its own (DL-21).
        {
          label: 'E5: the Hall, Applicants and dealing with the other Guilds',
          arm: { buyHall: true, recruit: true, deal: true },
        },
        {
          label: 'E5: dealing with the other Guilds, no Hall and no Applicants',
          arm: { buyHall: false, recruit: false, deal: true },
        },
        // E6's own pair: the same world, once with a policy that answers a Party that has
        // sent word and once with one that never does. Every arm above is the second of
        // the two, because a policy written before Decisions existed answers nothing and
        // every word times out into the Decision's own default (DL-23 §3).
        {
          label: 'E6: the Hall, Applicants, the other Guilds, and answering',
          arm: { buyHall: true, recruit: true, deal: true, answer: 'in-turn' },
        },
        {
          label: 'E6: the same, and never answering a word',
          arm: { buyHall: true, recruit: true, deal: true },
        },
      ];
      for (const { label, arm } of arms) {
        const runs: Run[] = [];
        for (let seed = 0; seed < SEEDS; seed += 1) {
          runs.push(playOne(`balance-${seed}`, bestFirst, OVERRIDES, arm));
        }
        report(label, runs);
        expect(runs).toHaveLength(SEEDS);
      }
    },
    3_600_000,
  );

  /**
   * **The arm a player is actually in** (DL-24 §B1). Every arm above holds the Guild at
   * `rosterFloor` and none of them answers sensibly, so between them they overstate what
   * E6 costs by about threefold and cannot tell the cost of **waiting** from the cost of
   * the **options**. These arms hold the Roster at a target near DL-20 §3's measured
   * optimum, buy the Hall, deal with the other Guilds, and vary only what is said to a
   * Party that has sent word — so `never answers` against `answers with the default` is
   * the price of the waiting alone, with the option held constant.
   *
   * The `wordTimeoutDays` sweep is the other half of the same question, from the side of
   * the player who says nothing at all.
   */
  it(
    'measures a player somebody would actually be, and what waiting costs them',
    () => {
      const target = Number(process.env['HEROESIM_BALANCE_ROSTER'] ?? 8);
      const base: Arm = { buyHall: true, recruit: true, deal: true, rosterTarget: target };
      const arms: { label: string; config: Partial<GameConfig>; arm: Arm }[] = [
        { label: 'off', config: { decisionChancePerBeat: 0 }, arm: base },
        { label: 'silent', config: {}, arm: base },
        { label: 'default', config: {}, arm: { ...base, answer: 'default' } },
        { label: 'sensible', config: {}, arm: { ...base, answer: 'sensible' } },
        // The same player, who never takes anybody without asking. What the other Guilds
        // then take off their Roster is retaliation for nothing they did (DL-24 §B3).
        { label: 'blameless', config: {}, arm: { ...base, deal: false, answer: 'sensible' } },
        { label: 'in-turn', config: {}, arm: { ...base, answer: 'in-turn' } },
        ...[1, 3, 5, 8].map((days) => ({
          label: `t=${String(days)}`,
          config: { wordTimeoutDays: days },
          arm: base,
        })),
      ];
      const measured = arms.map(({ label, config, arm }) => {
        const runs: Run[] = [];
        for (let seed = 0; seed < SEEDS; seed += 1) {
          runs.push(playOne(`balance-${seed}`, bestFirst, { ...OVERRIDES, ...config }, arm));
        }
        return { label, runs };
      });
      compare(`a Roster held at ${String(target)}, Hall, recruiting and dealing`, measured);
      for (const arm of measured) expect(arm.runs).toHaveLength(SEEDS);
    },
    5_400_000,
  );

  it(
    'measures a Guildmaster who sends one weak Hero at the hardest work',
    () => {
      const runs: Run[] = [];
      const halved = Math.max(1, Math.round(SEEDS / 3));
      for (let seed = 0; seed < halved; seed += 1) {
        runs.push(playOne(`balance-${seed}`, worstFirst, OVERRIDES));
      }
      report('the failing Guildmaster', runs);
      const failedHalf = runs.filter((run) => run.earlyFailed * 2 >= run.earlyTaken);
      const insolvent = failedHalf.filter((run) => run.reason === 'insolvency');
      console.log(
        `of ${failedHalf.length} Careers that failed half their first two years' work, ` +
          `${insolvent.length} went insolvent (${percent(insolvent.length, failedHalf.length)}), ` +
          `median on Day ${median(insolvent.map((run) => run.endedOnDay))}\n`,
      );
      expect(runs).toHaveLength(halved);
    },
    1_800_000,
  );
});
