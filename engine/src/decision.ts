/**
 * Decisions: the one place the player's attention snaps back mid-Commission (E6).
 *
 * Rarely, a Party stops part-way through the work and sends word. The Beat that would
 * have fired that Day does not; the Party waits; and the Guildmaster tells them to press
 * on, sends coin up the road, or brings them home. Nobody answering is itself an answer —
 * the Decision's `default` is taken after `config.wordTimeoutDays`, so a Career can never
 * deadlock on a Party nobody spoke to.
 *
 * **There is no inventory here.** The epic keeps the name "Chips" from the build plan, and
 * the thing is a Decision: a moment, not a token. Nothing is held between Commissions and
 * nothing is spent but coin (DL-23 §1).
 *
 * **Where the randomness comes from.** Whether a Decision fires, which one, and who its
 * slot Hero is all draw from a stream derived from the Career's seed, the Party and the
 * Beat — `"<seed>:decision:<partyId>:<beatIndex>"` — and never from `career.rng`, exactly
 * as `startingAge`, a batch of Applicants and a Rival's Roster draw from their own
 * (DL-16 §1, DL-19 §1, DL-21 §1). A Career whose content holds no Decision, or whose
 * `decisionChancePerBeat` is zero, is therefore bit for bit the Career E5 played: not one
 * extra draw is taken from the shared generator. The stream is fresh for each Party and
 * Beat, so nothing else draws from it and a conditional draw inside it can shift nothing
 * (DL-23 §2). The Beat the Decision displaced still draws its Vignette and its d20 from
 * `career.rng` — on the Day the Party is answered.
 *
 * Selection mirrors Vignette selection exactly, by sharing it: the same `conditionsHold`,
 * the same `pickByWeight`, the same `fillHeroSlot` (E6-S2).
 */

import { applyConsequence, resolveBeat } from './beat.js';
import { traitIndex, type TraitDefIndex } from './check.js';
import { cloneCareer } from './clone.js';
import { clamp, type GameConfig } from './config.js';
import type { Content, DecisionDef, DecisionOption, DecisionOptionKind } from './content.js';
import { EngineError } from './errors.js';
import type { BeatSlots, GameEvent, WordOptionOffered } from './events.js';
import { rngOn, seedRng, type Rng } from './rng.js';
import { changeCoin, findHero, requirePatron } from './state.js';
import type { Career, Hero, Party, PendingWord, Step } from './types.js';
import { conditionsHold, fillHeroSlot, pickByWeight } from './vignette.js';

/** Why an option cannot be taken as the Guild stands. One code, because there is one. */
export interface WordRefusal {
  /** The very `EngineErrorCode` {@link answerParty} would throw for it. */
  code: 'InsufficientCoin';
  /** Coin still needed. */
  shortfall: number;
}

/**
 * What calling this Commission off would come to, worked out before the player chooses it
 * rather than reported after (F11). Neither front end could assemble `turnBackFee`'s four
 * arguments without restating a rule, which DL-18 forbids; so the outcome rides on the
 * offer, from the very expression `answerParty` then applies.
 */
export interface TurnBackOutcome {
  /** What the Patron would actually pay, pro rata for the share of the work that is done. */
  feePaid: number;
  /** What the Commission pays when it is finished, so the shortfall is readable. */
  fullFee: number;
  /** Beats already resolved. */
  beatsResolved: number;
  /** Beats the Commission was taken on. */
  beatCount: number;
}

/** One option of a pending Decision, as a front end offers it (E6-S4). */
export interface WordOption {
  id: string;
  kind: DecisionOptionKind;
  /** Coin it costs. Set on a `sendCoin` option and absent on the other two. */
  cost?: number;
  /** Whether the Guild can take it **now**, against the coin it holds now (DL-23 §8). */
  affordable: boolean;
  /** Why it cannot be taken now, or absent when it can. */
  refusal?: WordRefusal;
  /** Whether this is the option the timeout will take. Exactly one option carries it. */
  isDefault: boolean;
  /** What taking it would pay. Set on a `turnBack` option and absent on the other two. */
  outcome?: TurnBackOutcome;
}

/**
 * Everything a front end needs about one Party waiting for word, without computing a rule
 * of its own (DL-18's rule, E7 §4). It carries ids, kinds and numbers: the prompt and the
 * labels are authored content, and `narrate`'s `wordProse` fills them.
 */
export interface WordOffer {
  partyId: string;
  commissionId: string;
  decisionId: string;
  /** The Beat this Decision displaced. It fires on the Day the Party is answered. */
  beatIndex: number;
  /** What the Decision's slots resolved to, exactly as a Beat's do. */
  slots: BeatSlots;
  /** The Day the Party sent word. */
  askedOn: number;
  /** The Day the `default` is taken if nobody answers. */
  timesOutOn: number;
  /** Days the Party has been waiting. Zero on the Day the word arrived. */
  daysWaited: number;
  /** Days before the default is taken. Never below zero. */
  daysLeft: number;
  /** The option the timeout will take. */
  defaultOptionId: string;
  /** Every option offered, in the order they were authored. */
  options: WordOption[];
}

/** A Decision in content, by id. */
export function decisionById(content: Content, id: string): DecisionDef | undefined {
  return content.decisions.find((decision) => decision.id === id);
}

/**
 * The coin the Guild must hold before this option can be taken: its `requires.minCoin`,
 * and the cost it would actually pay. One expression, read by the offer, by the event and
 * by `answerParty`, so the three can never disagree.
 */
function coinNeeded(option: DecisionOption): number {
  return Math.max(
    option.requires?.minCoin ?? 0,
    option.kind === 'sendCoin' ? (option.cost ?? 0) : 0,
  );
}

/**
 * Whether the Guild can take this option as things stand. An option that asks for nothing
 * is always open — including to a Guild whose coin has gone negative, which is a state a
 * played Career reaches every time Upkeep outruns the fees. The default asks for nothing
 * by construction (`validateContent` refuses one that does not), which is what makes the
 * timeout something that can always be taken (DL-23 §3).
 */
function canAfford(option: DecisionOption, coin: number): boolean {
  const needed = coinNeeded(option);
  return needed <= 0 || coin >= needed;
}

/** The stream a Decision is decided on. Fresh for each Party and each Beat (DL-23 §2). */
function decisionStream(seed: string, partyId: string, beatIndex: number): Rng {
  return rngOn({ rng: seedRng(`${seed}:decision:${partyId}:${beatIndex}`) });
}

/** How this option looked at the moment the word arrived. An event is a past-tense fact. */
function offered(option: DecisionOption, coin: number): WordOptionOffered {
  const entry: WordOptionOffered = {
    id: option.id,
    kind: option.kind,
    affordable: canAfford(option, coin),
  };
  if (option.cost !== undefined) entry.cost = option.cost;
  return entry;
}

/** The Heroes of a Party who are still on the Roster, in the order the Party names them. */
function membersOf(career: Career, party: Party): Hero[] {
  return party.heroIds
    .map((id) => findHero(career, id))
    .filter((hero): hero is Hero => hero !== undefined);
}

/**
 * Consider stopping this Commission to ask, on a Beat Day after its first.
 *
 * @returns true when word was sent, in which case the Day's Beat is **not** resolved.
 */
export function considerDecision(
  draft: Career,
  party: Party,
  content: Content,
  events: GameEvent[],
): boolean {
  const { config } = draft;
  // Two independent brakes, and both are rules rather than hopes: a hard cap of one per
  // Commission, and the chance itself. Either at zero means a Commission never stops, and
  // no stream is even created — so a Career with Decisions switched off takes not one draw
  // that a Career without them would not (E6 §5, DL-23 §2).
  if (config.decisionsPerCommission < 1) return false;
  if (content.decisions.length === 0) return false;
  if (party.decisionUsed) return false;
  if (party.pendingWord !== undefined) return false;
  if (party.turnedBackOn !== undefined) return false;
  // "After the first Beat": a Commission never stops before it has started.
  if (party.beatsResolved.length === 0) return false;
  const heroes = membersOf(draft, party);
  if (heroes.length === 0) return false;

  const beatIndex = party.beatsResolved.length + 1;
  const patron = requirePatron(draft, party.commission.patronId);
  const rng = decisionStream(draft.seed, party.id, beatIndex);
  // Drawn before the candidates are filtered, and therefore unconditionally: adding a
  // Decision to content must not change **whether** an existing one fires (DL-23 §2).
  if (!rng.chance(config.decisionChancePerBeat)) return false;

  const candidates = content.decisions.filter((decision) =>
    conditionsHold(decision, {
      beatIndex,
      commissionTags: party.commission.tags,
      sphereId: patron.sphere,
      heroes,
      used: [],
    }, false),
  );
  // A Commission with no eligible Decision simply never stops (E6-S2). There is no
  // relaxed second pass as there is for a Vignette: a Beat must be filled and a Decision
  // need not be.
  if (candidates.length === 0) return false;

  const decision = pickByWeight(candidates, rng);
  const slot = fillHeroSlot(decision, heroes, rng);
  const slots: BeatSlots =
    slot.trait === undefined
      ? { heroId: slot.hero.id, patronId: patron.id, sphereId: patron.sphere }
      : { heroId: slot.hero.id, patronId: patron.id, sphereId: patron.sphere, trait: slot.trait };
  const timesOutOn = draft.day + Math.max(1, Math.round(config.wordTimeoutDays));

  const word: PendingWord = {
    decisionId: decision.id,
    beatIndex,
    askedOn: draft.day,
    timesOutOn,
    slots,
    // The offer as it was made, in authored order. Whether the Guild can pay is worked
    // out again every time anybody asks, because coin moves while a Party waits (DL-23 §8).
    optionIds: decision.options.map((option) => option.id),
  };
  party.decisionUsed = true;
  party.pendingWord = word;
  draft.ledger.wordsSent += 1;

  events.push({
    type: 'PartyAwaitingWord',
    day: draft.day,
    partyId: party.id,
    commissionId: party.commission.id,
    decisionId: decision.id,
    beatIndex,
    timesOutOn,
    options: decision.options.map((option) => offered(option, draft.guild.coin)),
    slots,
  });
  return true;
}

/**
 * Where the Beats of a lengthened or shortened run fall, spread evenly over the Days that
 * are left. Deterministic and draw-free: a Decision's `effect` must not consume anything
 * from any generator, or answering would move what follows in a Career that took a
 * different option (E6-S3).
 */
function spreadBeatDays(from: number, until: number, count: number): number[] {
  if (count <= 0) return [];
  const first = from + 1;
  const slots = Math.max(1, until - first + 1);
  const days: number[] = [];
  for (let index = 0; index < count; index += 1) {
    days.push(first + Math.min(Math.floor((index * slots) / count), slots - 1));
  }
  return days;
}

/**
 * What is left of a Commission once a Party asked on `askedOn` and answered on `on` has
 * resolved the Beat the Decision displaced.
 *
 * **One expression, two readers.** `applyOption` writes it into the Party; `projectedReturn`
 * reads it to tell the player when they can expect anybody home. Restating either half in
 * a front end — or here, twice — is how the two come to disagree (F11, DL-18).
 */
interface Continuation {
  /** Beats resolved once the displaced one has fired. */
  resolvedAfter: number;
  /** The Commission's whole run of Beats, after the option's own `beatsRemainingDelta`. */
  beatCount: number;
  /** Beats still to come after that. */
  remaining: number;
  /** The Day the Party is then due home — never earlier than it was already due. */
  returnsOn: number;
}

function continuationOf(
  party: Party,
  askedOn: number,
  on: number,
  beatsRemainingDelta: number,
): Continuation {
  // How many Beats the Decision displaced. A Decision only ever fires on a Beat Day, so
  // this is at least one, and it is what the answer resolves so `beatCount` is honoured.
  const displaced = Math.max(1, party.beatDays.filter((day) => day === askedOn).length);
  const resolvedAfter = party.beatsResolved.length + displaced;
  // The floor is the work already done plus the Beat this answer is about to resolve: a
  // Commission can be shortened, and it can never be shortened into the past (E6-S3).
  const beatCount = Math.max(resolvedAfter, party.commission.beatCount + beatsRemainingDelta);
  const remaining = beatCount - resolvedAfter;
  // What is left of the work is spread over what is left of the span, and the Day they are
  // due back moves **only as far as it must** to leave room for it — which is nowhere at
  // all in the ordinary case (DL-23 §4).
  return { resolvedAfter, beatCount, remaining, returnsOn: Math.max(party.returnsOn, on + remaining) };
}

/**
 * What a Commission called off part-way through pays: the fee, scaled by the share of the
 * work that was done, never below nothing (E6-S3). `config.turnBackFeeFactor` is E6 §4's
 * `turnBackPaysProRata` as a number — 1 is its `true` and 0 is its `false` (DL-23 §6).
 */
export function turnBackFee(fee: number, score: number, beatCount: number, config: GameConfig): number {
  if (beatCount <= 0) return 0;
  return Math.max(0, Math.round((fee * config.turnBackFeeFactor * score) / beatCount));
}

/** Call the Party home. Remaining Beats are skipped, so no further harm can come to them. */
function turnBack(draft: Career, party: Party, events: GameEvent[]): void {
  party.turnedBackOn = draft.day;
  // Nothing further is due: the Day loop matches a Beat Day exactly, and a Beat that
  // cannot fire is a Hero who cannot be hurt (E6-S3).
  party.beatDays = party.beatDays.filter((day) => day < draft.day);
  party.returnsOn = draft.day + Math.max(0, Math.round(draft.config.turnBackTravelDays));
  draft.ledger.turnedBack += 1;
  events.push({
    type: 'PartyTurnedBack',
    day: draft.day,
    partyId: party.id,
    commissionId: party.commission.id,
    beatsResolved: party.beatsResolved.length,
    beatCount: party.commission.beatCount,
  });
}

/**
 * Take an option on a Party that is waiting, and carry on. The one place an answer is
 * applied, so the Guildmaster's own and the timeout's are the same code.
 */
function applyOption(
  draft: Career,
  party: Party,
  decision: DecisionDef,
  option: DecisionOption,
  byDefault: boolean,
  content: Content,
  rng: Rng,
  traits: TraitDefIndex,
  events: GameEvent[],
): void {
  const word = party.pendingWord;
  if (word === undefined) {
    throw new EngineError('InternalError', 'an option was applied to a Party that is not waiting');
  }
  const { config } = draft;
  const askedOn = word.askedOn;
  const slots = word.slots;
  // The slot Hero is away on the work and cannot have died, departed, retired or been
  // taken while the Party waited — no Beat of theirs fired, and every one of those rules
  // skips a Hero who is away (DL-22, E2 §4). The fallback is for a Party that has lost
  // them some other way, which nothing in the game can currently do.
  const members = membersOf(draft, party);
  const hero = members.find((member) => member.id === slots.heroId) ?? members[0];

  events.push({
    type: 'PartyAnswered',
    day: draft.day,
    partyId: party.id,
    commissionId: party.commission.id,
    decisionId: decision.id,
    optionId: option.id,
    byDefault,
    slots,
  });
  if (option.kind === 'sendCoin' && option.cost !== undefined && option.cost !== 0) {
    changeCoin(draft, -option.cost, 'sendCoin', events);
  }
  delete party.pendingWord;

  if (hero !== undefined) {
    for (const consequence of option.consequences) {
      applyConsequence(draft, party, hero, consequence, events, traits);
    }
  }

  const effect = option.effect;
  if (effect?.backingDelta !== undefined) {
    party.backing = clamp(party.backing + effect.backingDelta, config.backingMin, config.backingMax);
  }
  if (effect?.dcDelta !== undefined) party.dcDelta += effect.dcDelta;

  if (option.kind === 'turnBack') {
    turnBack(draft, party, events);
    return;
  }

  // The Beats the waiting stranded have to be moved somewhere, because the Day loop
  // matches a Beat Day exactly and one left in the past would never fire again; the Days
  // themselves are not a price the waiting pays, and making them one cost about a third of
  // a Guild's Commissions a year, which is a rebalancing E6 was not asked to do.
  const carried = continuationOf(party, askedOn, draft.day, effect?.beatsRemainingDelta ?? 0);
  const displaced = carried.resolvedAfter - party.beatsResolved.length;
  party.commission.beatCount = carried.beatCount;
  party.returnsOn = carried.returnsOn;
  // Strictly before today: a Beat Day that fell while the Party stood still is part of
  // what is left, and one that happens to land on the answer Day itself must not fire a
  // second time beside the Beat the Decision displaced.
  party.beatDays = [
    ...party.beatDays.filter((day) => day < draft.day),
    ...spreadBeatDays(draft.day, party.returnsOn, carried.remaining),
  ];

  // And the Beat that did not happen happens now (E6-S2).
  for (let beat = 0; beat < displaced; beat += 1) {
    if (party.beatsResolved.length >= party.commission.beatCount) break;
    if (party.heroIds.length === 0) break;
    resolveBeat(draft, party, content, rng, events, traits);
  }
}

/**
 * Take the `default` for every Party whose Day has come, at the start of the Day and
 * before any Beat, so the Beat it displaced can fire on the timeout Day itself.
 *
 * This is what makes "a Career never deadlocks" true (E6 §2): a stretch of Days stops when
 * word arrives, and the **next** stretch runs on past it to here (DL-23 §3). Content
 * guarantees the default can always be taken — `validateContent` refuses a Decision whose
 * default carries a cost or a `requires` — so nothing here can fail for want of coin.
 */
export function settleWordTimeouts(
  draft: Career,
  content: Content,
  rng: Rng,
  traits: TraitDefIndex,
  events: GameEvent[],
): void {
  for (const party of [...draft.parties]) {
    const word = party.pendingWord;
    if (word === undefined || word.timesOutOn > draft.day) continue;
    const decision = decisionById(content, word.decisionId);
    if (decision === undefined) {
      // The Decision has been taken out of content since the word was sent. The Party
      // cannot be left waiting for a question nobody can read, so it comes home.
      delete party.pendingWord;
      turnBack(draft, party, events);
      continue;
    }
    const fallback = decision.options.find((option) => option.default === true);
    if (fallback === undefined) {
      throw new EngineError('InternalError', `Decision "${decision.id}" has no default option`);
    }
    applyOption(draft, party, decision, fallback, true, content, rng, traits, events);
  }
}

/**
 * Answer a Party that has sent word (E6-S3).
 *
 * `pressOn` applies the option's consequences and its `effect` and the Commission carries
 * on; `sendCoin` pays the cost first and then behaves as `pressOn`; `turnBack` ends the
 * Commission on the spot — the remaining Beats are skipped, so no further harm can come to
 * anybody, and the Party comes home through `PartyReturned` like any other, with
 * `succeeded: false` and the pro-rata fee.
 *
 * Deterministic: the same Career and the same option give the same continuation.
 *
 * @throws EngineError `CareerEnded`, `NoSuchParty`, `NotAwaitingWord`, `NoSuchOption` or
 * `InsufficientCoin`. Every rejection leaves the Career byte-identical to the one passed in.
 */
export function answerParty(
  career: Career,
  partyId: string,
  optionId: string,
  content: Content,
): Step {
  if (career.ended !== undefined) {
    throw new EngineError('CareerEnded', 'the Career has ended; there is nobody left to answer');
  }
  const standing = career.parties.find((party) => party.id === partyId);
  if (standing === undefined) {
    throw new EngineError('NoSuchParty', `no Party with id "${partyId}" is away on a Commission`);
  }
  const word = standing.pendingWord;
  if (word === undefined) {
    throw new EngineError('NotAwaitingWord', `Party "${partyId}" has not sent word`);
  }
  const decision = decisionById(content, word.decisionId);
  if (decision === undefined) {
    throw new EngineError(
      'InternalError',
      `no Decision with id "${word.decisionId}" is loaded; the Party cannot be answered`,
    );
  }
  const option = decision.options.find(
    (candidate) => candidate.id === optionId && word.optionIds.includes(candidate.id),
  );
  if (option === undefined) {
    throw new EngineError('NoSuchOption', `"${decision.id}" offers no option called "${optionId}"`);
  }
  const needed = coinNeeded(option);
  if (!canAfford(option, career.guild.coin)) {
    throw new EngineError(
      'InsufficientCoin',
      `"${option.id}" needs ${needed} coin and the Guild holds ${career.guild.coin}`,
    );
  }

  const draft = cloneCareer(career);
  const party = draft.parties.find((entry) => entry.id === partyId);
  if (party === undefined) {
    throw new EngineError('InternalError', 'the Party left between the check and the answer');
  }
  const events: GameEvent[] = [];
  applyOption(draft, party, decision, option, false, content, rngOn(draft), traitIndex(content), events);
  return { career: draft, events };
}

/** Every Party waiting for word, in the order they set out (E6 §4). */
export function awaitingParties(career: Career): Party[] {
  return career.parties.filter((party) => party.pendingWord !== undefined);
}

/**
 * The earliest Day a Party can now be home, which is `returnsOn` for a Party at work and
 * something later for one standing still (E6, F11).
 *
 * Both front ends show `party.returnsOn` and both were showing it while a Party waited,
 * where it is a Day that is going to slip: the Beats the waiting strands are re-spread on
 * the Day the Party is answered, and the return moves as far as it must to leave room for
 * them. So "due back Day 10" on Day 4 quietly becomes Day 11 once the word times out, and
 * nothing said so. This answers it honestly and **shares the arithmetic** with the rule
 * `answerParty` applies rather than restating it: a waiting Party answered today, pressing
 * on or sending coin, is home no sooner than this.
 *
 * Calling them home is sooner, and is the player's to choose — see {@link TurnBackOutcome}.
 *
 * @returns the projected Day, or `undefined` for a Party that is not in the Career
 */
export function projectedReturn(career: Career, partyId: string): number | undefined {
  const party = career.parties.find((entry) => entry.id === partyId);
  if (party === undefined) return undefined;
  const word = party.pendingWord;
  if (word === undefined) return party.returnsOn;
  // No `beatsRemainingDelta`: the options that carry one may shorten the run, so the
  // projection is the plain continuation and the word is "no sooner than".
  return continuationOf(party, word.askedOn, career.day, 0).returnsOn;
}

/**
 * What calling a waiting Party home would pay, before the player chooses it (F11).
 *
 * `turnBackFee` has been exported since E6 was built, but a view would have had to
 * assemble its four arguments itself — the Commission's fee, the Party's score with the
 * option's own `score` consequences already applied to it, and the Beat count — which is
 * a rule restated in a front end and DL-18 forbids it. This is the same expression
 * `answerParty` then applies, asked before the coin moves rather than reported after.
 *
 * @returns the outcome, or `undefined` for a Party that is not waiting or whose Decision
 * offers no `turnBack` option that the word actually carried
 */
export function turnBackOutcome(
  career: Career,
  partyId: string,
  content: Content,
): TurnBackOutcome | undefined {
  const party = career.parties.find((entry) => entry.id === partyId);
  const word = party?.pendingWord;
  if (party === undefined || word === undefined) return undefined;
  const decision = decisionById(content, word.decisionId);
  const option = decision?.options.find(
    (candidate) => candidate.kind === 'turnBack' && word.optionIds.includes(candidate.id),
  );
  if (option === undefined) return undefined;
  return outcomeOf(career, party, option);
}

/**
 * The outcome of one `turnBack` option, shared by {@link turnBackOutcome} and by the offer
 * so the two can never disagree.
 *
 * The score is the Party's **after** the option's own consequences: `applyOption` applies
 * them before it calls the Party home, and the fee is worked out on the return Day from
 * whatever the score has become by then. Nothing else can move it — turning back drops
 * every Beat Day still to come, so no further Beat fires.
 */
function outcomeOf(career: Career, party: Party, option: DecisionOption): TurnBackOutcome {
  const score = option.consequences.reduce(
    (total, consequence) => (consequence.kind === 'score' ? total + consequence.delta : total),
    party.score,
  );
  const { fee, beatCount } = party.commission;
  return {
    feePaid: turnBackFee(fee, score, beatCount, career.config),
    fullFee: fee,
    beatsResolved: party.beatsResolved.length,
    beatCount,
  };
}

/**
 * One Party's pending Decision as a front end offers it: the Decision, the slots, both
 * clocks, which option the timeout will take, and every option with its kind, its cost and
 * whether the Guild can take it **now** (E6-S4, DL-23 §9). Pure and read-only, and it
 * carries no prose — `narrate`'s `wordProse` fills the prompt and the labels.
 */
export function wordOffer(career: Career, partyId: string, content: Content): WordOffer | undefined {
  const party = career.parties.find((entry) => entry.id === partyId);
  const word = party?.pendingWord;
  if (party === undefined || word === undefined) return undefined;
  const decision = decisionById(content, word.decisionId);
  if (decision === undefined) return undefined;

  const options: WordOption[] = [];
  for (const id of word.optionIds) {
    const option = decision.options.find((candidate) => candidate.id === id);
    if (option === undefined) continue;
    const needed = coinNeeded(option);
    const affordable = canAfford(option, career.guild.coin);
    const entry: WordOption = {
      id: option.id,
      kind: option.kind,
      affordable,
      isDefault: option.default === true,
    };
    if (option.cost !== undefined) entry.cost = option.cost;
    if (!affordable) {
      entry.refusal = { code: 'InsufficientCoin', shortfall: needed - career.guild.coin };
    }
    // What calling them home would pay, said beside the option that would do it (F11).
    if (option.kind === 'turnBack') entry.outcome = outcomeOf(career, party, option);
    options.push(entry);
  }

  return {
    partyId: party.id,
    commissionId: party.commission.id,
    decisionId: decision.id,
    beatIndex: word.beatIndex,
    slots: word.slots,
    askedOn: word.askedOn,
    timesOutOn: word.timesOutOn,
    daysWaited: Math.max(0, career.day - word.askedOn),
    daysLeft: Math.max(0, word.timesOutOn - career.day),
    defaultOptionId: options.find((option) => option.isDefault)?.id ?? options[0]?.id ?? '',
    options,
  };
}

/** Every Party waiting for word, with its whole offer (E6-S4). */
export function wordOffers(career: Career, content: Content): WordOffer[] {
  return awaitingParties(career)
    .map((party) => wordOffer(career, party.id, content))
    .filter((offer): offer is WordOffer => offer !== undefined);
}
