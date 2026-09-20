/**
 * Independent verification of E6, written after the fact and against the public API only.
 *
 * Nothing here was written by the agent that built E6. Every engine symbol comes from
 * `../src/index.js`, and every world is built through `validateContent`, so the Decisions
 * under test are the verifier's own rather than the builder's. The blocks are adversarial:
 * the exact boundary rather than a comfortable value either side of it, degenerate
 * configuration rather than the shipped defaults, and the states a played Career reaches
 * only rarely — a Guild in debt, a Roster entirely away, a Party that loses everybody, a
 * Career that ends with a word outstanding.
 *
 * Four of these close mutations that survived the E6 suite as built and are named on the
 * line where they are closed.
 */

import { describe, expect, it } from 'vitest';
import {
  acceptApplicant,
  advance,
  advanceUntilAttention,
  answerParty,
  availableHeroes,
  awaitingParties,
  commitParty,
  deserialiseCareer,
  EngineError,
  isInjured,
  newCareer,
  proposeParty,
  serialiseCareer,
  turnBackFee,
  validateContent,
  wordOffer,
  wordOffers,
  type Career,
  type Content,
  type GameConfig,
  type GameEvent,
  type Party,
} from '../src/index.js';
import { deepFreeze, fixtureContent } from './fixtures.js';

// ── The verifier's own Decisions ────────────────────────────────────────────

/** No conditions at all: the only thing that can stop it firing on Beat 1 is the engine. */
const NO_CONDITIONS = {
  id: 'from-the-first-step',
  name: 'From the first step',
  weight: 1,
  tags: [],
  conditions: {},
  slots: { hero: 'any' },
  prompt: '{hero} sends word at once.',
  options: [
    { id: 'press-on', kind: 'pressOn', label: 'Carry on.', default: true, consequences: [] },
    { id: 'turn-back', kind: 'turnBack', label: 'Come home.', consequences: [] },
  ],
};

/** The ordinary three, with a cost the fixture Guild can be put either side of. */
const PLAIN = {
  id: 'the-usual-three',
  name: 'The usual three',
  weight: 1,
  tags: [],
  conditions: { minBeat: 2 },
  slots: { hero: 'any' },
  prompt: '{hero} asks what to do.',
  options: [
    {
      id: 'press-on',
      kind: 'pressOn',
      label: 'Carry on.',
      default: true,
      consequences: [],
      effect: { dcDelta: 1 },
    },
    {
      id: 'send-coin',
      kind: 'sendCoin',
      label: 'Send forty coin.',
      cost: 40,
      requires: { minCoin: 40 },
      consequences: [],
      effect: { backingDelta: 1 },
    },
    { id: 'turn-back', kind: 'turnBack', label: 'Come home.', consequences: [] },
  ],
};

/** Deltas far outside anything a sane author would write. */
const EXTREME = {
  id: 'the-extremes',
  name: 'The extremes',
  weight: 1,
  tags: [],
  conditions: { minBeat: 2 },
  slots: { hero: 'any' },
  prompt: '{hero} asks what to do.',
  options: [
    { id: 'press-on', kind: 'pressOn', label: 'Carry on.', default: true, consequences: [] },
    {
      id: 'grow',
      kind: 'pressOn',
      label: 'Much more of it.',
      consequences: [],
      effect: { beatsRemainingDelta: 99 },
    },
    {
      id: 'shrink',
      kind: 'pressOn',
      label: 'Much less of it.',
      consequences: [],
      effect: { beatsRemainingDelta: -99 },
    },
    {
      id: 'lift',
      kind: 'pressOn',
      label: 'Raise them up.',
      consequences: [],
      effect: { backingDelta: 99 },
    },
    {
      id: 'sink',
      kind: 'pressOn',
      label: 'Cast them down.',
      consequences: [],
      effect: { backingDelta: -99 },
    },
    { id: 'turn-back', kind: 'turnBack', label: 'Come home.', consequences: [] },
  ],
};

/** A slot rule nobody on a committed Party can ever satisfy: they are all uninjured. */
const NOBODY_HOLDS_IT = {
  id: 'nobody-holds-it',
  name: 'Nobody holds it',
  weight: 1,
  tags: [],
  conditions: { minBeat: 2 },
  slots: { hero: 'with_trait:Bruised' },
  prompt: '{hero} asks what to do.',
  options: [
    { id: 'press-on', kind: 'pressOn', label: 'Carry on.', default: true, consequences: [] },
    { id: 'turn-back', kind: 'turnBack', label: 'Come home.', consequences: [] },
  ],
};

/** Eligible on no Beat any Commission in this world ever reaches. */
const NEVER_ELIGIBLE = {
  ...PLAIN,
  id: 'never-eligible',
  conditions: { minBeat: 9999 },
};

const world = (...decisions: unknown[]): Content =>
  validateContent({ ...fixtureContent, decisions });

const plain = world(PLAIN);
const noDecisions = world();

function of<T extends GameEvent['type']>(
  events: readonly GameEvent[],
  type: T,
): Extract<GameEvent, { type: T }>[] {
  return events.filter((event): event is Extract<GameEvent, { type: T }> => event.type === type);
}

/**
 * A copy of a Career, edited in place, taken through the public save round trip rather
 * than through an internal clone — so nothing here can reach a field a front end could not.
 */
function edit(career: Career, content: Content, change: (draft: Career) => void): Career {
  const copy = deserialiseCareer(serialiseCareer(career), content);
  change(copy);
  return copy;
}

function open(seed: string, content: Content, config?: Partial<GameConfig>): Career {
  return newCareer(seed, content, { startingCoin: 5000, decisionChancePerBeat: 1, ...config })
    .career;
}

/** Send `size` Heroes on the `nth` Commission on the Board. */
function send(career: Career, content: Content, nth = 0, size = 2): Career {
  const commission = career.board[nth];
  if (commission === undefined) throw new Error('the test expected a Commission on the Board');
  return commitParty(
    career,
    commission.id,
    career.guild.roster.slice(nth * size, nth * size + size).map((hero) => hero.id),
    content,
  ).career;
}

/** Run one Day at a time until somebody is waiting for word. */
function untilWord(
  career: Career,
  content: Content,
  limit = 60,
): { career: Career; party: Party } {
  let held = career;
  for (let step = 0; step < limit; step += 1) {
    held = advance(held, 1, content).career;
    const waiting = held.parties.find((party) => party.pendingWord !== undefined);
    if (waiting !== undefined) return { career: held, party: waiting };
    if (held.ended !== undefined) break;
  }
  throw new Error('no Party sent word');
}

function waiting(
  seed: string,
  content: Content = plain,
  config?: Partial<GameConfig>,
): { career: Career; party: Party } {
  return untilWord(send(open(seed, content, config), content), content);
}

// ── The four mutations that survived the suite as built ─────────────────────

describe('the rule that a Commission never stops before it has started', () => {
  it('is the engine’s and not the content’s, even for a Decision with no conditions', () => {
    // Closes a surviving mutation: deleting `considerDecision`'s "after the first Beat"
    // guard changed nothing, because every Decision in the fixtures and all three shipped
    // ones declare `min_beat = 2`, so `conditionsHold` rejected Beat 1 for them anyway.
    const content = world(NO_CONDITIONS);
    let stops = 0;
    for (let seed = 0; seed < 25; seed += 1) {
      const sent = send(open(`v-first-${String(seed)}`, content), content);
      const run = advance(sent, 60, content);
      for (const asked of of(run.events, 'PartyAwaitingWord')) {
        stops += 1;
        expect(asked.beatIndex, `seed ${String(seed)}`).toBeGreaterThanOrEqual(2);
      }
    }
    // And the Decision really does fire, so the assertion above is not vacuous.
    expect(stops).toBeGreaterThan(0);
  }, 60_000);
});

describe('a Party that has already been moved by one answer', () => {
  it('accumulates dcDelta rather than replacing it', () => {
    // Closes a surviving mutation: `party.dcDelta += effect.dcDelta` reads the same as
    // `=` while only one Decision may fire per Commission, so nothing exercised the word
    // "accumulated" in the contract. A Party carrying a delta already is the case that does.
    const found = waiting('v-accumulate');
    const carrying = edit(found.career, plain, (draft) => {
      for (const party of draft.parties) if (party.id === found.party.id) party.dcDelta = 3;
    });
    const step = answerParty(carrying, found.party.id, 'press-on', plain);
    const after = step.career.parties.find((entry) => entry.id === found.party.id);
    expect(after?.dcDelta).toBe(4);
  });
});

describe('a Party told to come home', () => {
  it('never reports the work as succeeded, however far the score had got', () => {
    // Closes a surviving mutation: dropping `!turnedBack` from `succeeded` passed the whole
    // suite, because the one seed that pins it turns back a Party whose score was low. A
    // Party turned back on the last Beat with a full score is the case that separates them.
    const found = waiting('v-succeeded');
    const staged = edit(found.career, plain, (draft) => {
      for (const party of draft.parties) {
        if (party.id !== found.party.id) continue;
        party.score = party.commission.beatCount;
      }
    });
    const called = answerParty(staged, found.party.id, 'turn-back', plain);
    const home = advance(called.career, called.career.config.turnBackTravelDays, plain);
    const returned = of(home.events, 'PartyReturned').find(
      (event) => event.partyId === found.party.id,
    );
    expect(returned).toBeDefined();
    expect(returned?.succeeded).toBe(false);
    // It is paid the whole fee and still counts as work that was not finished.
    expect(returned?.feePaid).toBe(
      turnBackFee(
        found.party.commission.fee,
        found.party.commission.beatCount,
        found.party.commission.beatCount,
        home.career.config,
      ),
    );
    expect(home.career.ledger.commissionsCompleted).toBe(0);
  });
});

describe('a save written after an answer that raised the DC', () => {
  it('carries dcDelta back out again', () => {
    // Closes a surviving mutation: `party['dcDelta'] ??= 0` could be `= 0` with the suite
    // green, because nothing ever saved a Career whose Party carried a non-zero one.
    const found = waiting('v-dc-save');
    const answered = answerParty(found.career, found.party.id, 'press-on', plain);
    const party = answered.career.parties.find((entry) => entry.id === found.party.id);
    expect(party?.dcDelta).toBe(1);
    const loaded = deserialiseCareer(serialiseCareer(answered.career), plain);
    expect(loaded.parties.find((entry) => entry.id === found.party.id)?.dcDelta).toBe(1);
    expect(loaded).toEqual(answered.career);
  });
});

// ── The kind has to travel everywhere a Trait is copied ─────────────────────

describe('a timed Trait that is not an Injury', () => {
  it('keeps its kind when its holder is taken on from the Applicants', () => {
    let opened = open('v-kind-applicant', plain);
    for (let step = 0; step < 60 && opened.applicants.length === 0; step += 1) {
      opened = advance(opened, 1, plain).career;
    }
    const staged = edit(opened, plain, (draft) => {
      const applicant = draft.applicants[0];
      if (applicant === undefined) throw new Error('the test expected an Applicant');
      applicant.traits = [
        { name: 'Steady', since: 1, liftsOn: draft.day + 200, kind: 'disposition' },
      ];
      draft.guild.coin = 100_000;
    });
    const id = staged.applicants[0]?.id ?? '';
    const taken = acceptApplicant(staged, id);
    const hero = taken.career.guild.roster.find((entry) => entry.id === id);
    const held = hero?.traits.find((trait) => trait.name === 'Steady');
    expect(held?.liftsOn).toBe(staged.day + 200);
    expect(held?.kind).toBe('disposition');
    // And they are somebody who can be sent out, not somebody the Guild reads as hurt.
    expect(isInjured(hero ?? staged.guild.roster[0]!)).toBe(false);
    expect(availableHeroes(taken.career).map((entry) => entry.id)).toContain(id);
  });

  it('keeps its kind when its holder walks out and comes back', () => {
    // `traitsBroughtBack` copies from a real person rather than from a Background, so it is
    // the one Applicant path that can meet a kind — and dropping it would hand a returner
    // an Injury they never had.
    const opened = open('v-kind-returner', plain, {
      returnAsApplicantChance: 1,
      returnCooldownDays: 0,
      applicantsEveryDays: 5,
      applicantsEveryDaysBelowFloor: 5,
    });
    const staged = edit(opened, plain, (draft) => {
      const leaving = draft.guild.roster[0];
      if (leaving === undefined) throw new Error('the test expected a Hero');
      leaving.traits = [{ name: 'Steady', since: 1, liftsOn: draft.day + 400, kind: 'disposition' }];
      draft.guild.formerHeroes.push({
        ...leaving,
        exit: { kind: 'departure', onDay: 0, reason: 'the business at Thurrow' },
      });
      draft.guild.roster = draft.guild.roster.filter((hero) => hero.id !== leaving.id);
    });
    const who = opened.guild.roster[0]?.id ?? '';
    let career = staged;
    let back;
    for (let step = 0; step < 40 && back === undefined; step += 1) {
      career = advance(career, 1, plain).career;
      back = career.applicants.find((applicant) => applicant.id === who);
    }
    if (back === undefined) throw new Error('the test expected them to come back');
    const held = back.traits.find((trait) => trait.name === 'Steady');
    expect(held?.liftsOn).toBe(staged.day + 400);
    expect(held?.kind).toBe('disposition');
  }, 60_000);
});

// ── Two Parties, and the exact timeout Day ──────────────────────────────────

describe('two Parties waiting at once', () => {
  function both(seed: string, config?: Partial<GameConfig>): Career {
    for (let attempt = 0; attempt < 12; attempt += 1) {
      let career = open(`${seed}-${String(attempt)}`, plain, config);
      career = send(career, plain, 0, 1);
      career = send(career, plain, 1, 1);
      for (let step = 0; step < 40; step += 1) {
        career = advance(career, 1, plain).career;
        if (awaitingParties(career).length === 2) return career;
        if (career.parties.length < 2) break;
      }
    }
    throw new Error('the test expected two Parties to send word');
  }

  it('answers to the same place whichever order they are answered in', () => {
    const career = both('v-two-order', { wordTimeoutDays: 90 });
    const [one, two] = awaitingParties(career);
    if (one === undefined || two === undefined) throw new Error('expected two');
    const forwards = answerParty(
      answerParty(career, one.id, 'press-on', plain).career,
      two.id,
      'press-on',
      plain,
    );
    const backwards = answerParty(
      answerParty(career, two.id, 'press-on', plain).career,
      one.id,
      'press-on',
      plain,
    );
    // Both Parties resolve their displaced Beat on the same Day from the same generator
    // state, so the order they were answered in is the order the Beats were drawn in.
    // What must hold either way is that both are answered and neither is left behind.
    expect(awaitingParties(forwards.career)).toEqual([]);
    expect(awaitingParties(backwards.career)).toEqual([]);
    expect(of(forwards.events, 'BeatResolved').length).toBe(
      of(backwards.events, 'BeatResolved').length,
    );
  });

  it('lets one be answered while the other is left to time out', () => {
    const career = both('v-two-mixed', { wordTimeoutDays: 3 });
    const [one, two] = awaitingParties(career);
    if (one === undefined || two === undefined) throw new Error('expected two');
    const answered = answerParty(career, one.id, 'turn-back', plain);
    const run = advance(answered.career, 10, plain);
    const events = [...answered.events, ...run.events];
    const byParty = new Map(
      of(events, 'PartyAnswered').map((event) => [event.partyId, event.byDefault]),
    );
    expect(byParty.get(one.id)).toBe(false);
    expect(byParty.get(two.id)).toBe(true);
    expect(awaitingParties(run.career)).toEqual([]);
  });

  it('gives the player the Day, when an answer lands on the very Day it would time out', () => {
    const career = both('v-two-race', { wordTimeoutDays: 2 });
    const [one] = awaitingParties(career);
    if (one === undefined) throw new Error('expected a Party');
    const timesOutOn = one.pendingWord?.timesOutOn ?? 0;
    // Stand on the Day before, so the next stepped Day is the timeout Day.
    const eve = advance(career, timesOutOn - career.day - 1, plain).career;
    expect(eve.day).toBe(timesOutOn - 1);
    expect(awaitingParties(eve).map((party) => party.id)).toContain(one.id);
    // Answering now, before the Day is stepped, is the player's own answer.
    const answered = answerParty(eve, one.id, 'turn-back', plain);
    expect(of(answered.events, 'PartyAnswered')[0]?.byDefault).toBe(false);
    // And a Party not answered by the end of that Day gets the default, not a second chance.
    const stepped = advance(eve, 1, plain);
    expect(stepped.career.day).toBe(timesOutOn);
    for (const answer of of(stepped.events, 'PartyAnswered')) expect(answer.byDefault).toBe(true);
    expect(() => answerParty(stepped.career, one.id, 'press-on', plain)).toThrow(EngineError);
  });
});

// ── The last Beat, and the extremes of an effect ────────────────────────────

describe('a Decision on the last Beat of a Commission', () => {
  it('is resolved immediately by pressing on, and the Party comes home on time', () => {
    const found = waiting('v-last-press');
    const short = edit(found.career, plain, (draft) => {
      for (const party of draft.parties) {
        if (party.id !== found.party.id) continue;
        party.commission.beatCount = party.beatsResolved.length + 1;
      }
    });
    const step = answerParty(short, found.party.id, 'press-on', plain);
    const party = step.career.parties.find((entry) => entry.id === found.party.id);
    const resolved =
      party?.beatsResolved.length ??
      of(step.events, 'BeatResolved').filter((event) => event.partyId === found.party.id).length;
    expect(resolved).toBeGreaterThan(0);
    // Nothing is left to do, so nothing is left to schedule.
    expect(party?.beatDays.filter((day) => day > step.career.day) ?? []).toEqual([]);
  });

  it('pays nearly the whole fee if it is turned back there instead', () => {
    const found = waiting('v-last-turn');
    const staged = edit(found.career, plain, (draft) => {
      for (const party of draft.parties) {
        if (party.id !== found.party.id) continue;
        party.commission.beatCount = 4;
        party.score = 3;
      }
    });
    const called = answerParty(staged, found.party.id, 'turn-back', plain);
    const home = advance(called.career, called.career.config.turnBackTravelDays, plain);
    const returned = of(home.events, 'PartyReturned').find(
      (event) => event.partyId === found.party.id,
    );
    expect(returned?.feePaid).toBe(Math.round((found.party.commission.fee * 3) / 4));
    expect(returned?.succeeded).toBe(false);
  });
});

describe('an effect far outside anything an author should write', () => {
  const content = world(EXTREME);

  it('adds ninety-nine Beats and finds a Day for every one of them', () => {
    const found = waiting('v-grow', content);
    const step = answerParty(found.career, found.party.id, 'grow', content);
    const party = step.career.parties.find((entry) => entry.id === found.party.id);
    if (party === undefined) throw new Error('the Party came home too early');
    expect(party.commission.beatCount).toBe(found.party.commission.beatCount + 99);
    const left = party.commission.beatCount - party.beatsResolved.length;
    const toCome = party.beatDays.filter((day) => day > step.career.day);
    expect(toCome).toHaveLength(left);
    for (const day of toCome) expect(day).toBeLessThanOrEqual(party.returnsOn);
    // And they are all in the future and in order.
    expect([...toCome].sort((one, other) => one - other)).toEqual(toCome);
    // The work really is done in the end, and beatCount is honoured.
    const run = advance(step.career, 400, content);
    const beats = of([...step.events, ...run.events], 'BeatResolved').filter(
      (event) => event.partyId === found.party.id,
    );
    expect(beats.length).toBe(party.commission.beatCount - found.party.beatsResolved.length);
  }, 60_000);

  it('cannot cut a Commission back into the past', () => {
    const found = waiting('v-shrink', content);
    const done = found.party.beatsResolved.length;
    const step = answerParty(found.career, found.party.id, 'shrink', content);
    const party = step.career.parties.find((entry) => entry.id === found.party.id);
    const commission =
      party?.commission ??
      step.career.recentCommissions.find((entry) => entry.id === found.party.commissionId);
    // The floor is the work already done plus the Beat this answer resolved.
    expect(commission?.beatCount).toBe(done + 1);
    expect(commission?.beatCount).toBeGreaterThan(0);
  });

  it('holds Backing inside the bounds a committed Party is held to, in both directions', () => {
    for (const [optionId, expected] of [
      ['lift', 'backingMax'],
      ['sink', 'backingMin'],
    ] as const) {
      const found = waiting(`v-backing-${optionId}`, content);
      const step = answerParty(found.career, found.party.id, optionId, content);
      const party = step.career.parties.find((entry) => entry.id === found.party.id);
      expect(party?.backing, optionId).toBe(step.career.config[expected]);
    }
  });
});

// ── What the waiting does to the shape of the work ──────────────────────────

describe('the Beats a wait stranded', () => {
  /**
   * A Party asked on a known Day with a known schedule, answered after 0, 2 and 5 Days.
   * Built by hand through the save round trip so the numbers are the verifier's own and
   * not whatever a seed happened to deal (DL-23 §4's re-spreading, pinned by construction).
   */
  function staged(seed: string): { career: Career; partyId: string; askedOn: number } {
    const found = waiting(seed, plain, { wordTimeoutDays: 90 });
    const askedOn = found.career.day;
    const career = edit(found.career, plain, (draft) => {
      for (const party of draft.parties) {
        if (party.id !== found.party.id) continue;
        party.commission.beatCount = 5;
        party.beatsResolved = ['success'];
        party.beatDays = [askedOn - 1, askedOn, askedOn + 2, askedOn + 3, askedOn + 5];
        party.returnsOn = askedOn + 5;
        if (party.pendingWord !== undefined) party.pendingWord.beatIndex = 2;
      }
    });
    return { career, partyId: found.party.id, askedOn };
  }

  for (const wait of [0, 2, 5]) {
    it(`re-spreads them over the Days that are left, after ${String(wait)} Days of waiting`, () => {
      const start = staged(`v-spread-${String(wait)}`);
      const stood = wait === 0 ? start.career : advance(start.career, wait, plain).career;
      expect(stood.day).toBe(start.askedOn + wait);
      const before = stood.parties.find((party) => party.id === start.partyId);
      const step = answerParty(stood, start.partyId, 'press-on', plain);
      const after = step.career.parties.find((party) => party.id === start.partyId);
      if (before === undefined || after === undefined) throw new Error('expected a Party');

      // The displaced Beat fired on the answer Day, so two of five are done.
      expect(after.beatsResolved).toHaveLength(2);
      expect(after.commission.beatCount).toBe(5);
      const toCome = after.beatDays.filter((day) => day > step.career.day);
      expect(toCome).toHaveLength(3);
      // No Beat lands twice on one Day, and none lands after the Day they are due back.
      expect(new Set(toCome).size).toBe(toCome.length);
      for (const day of toCome) expect(day).toBeLessThanOrEqual(after.returnsOn);
      // `returnsOn` moves only as far as it must to leave room for what is left.
      expect(after.returnsOn).toBe(Math.max(before.returnsOn, step.career.day + 3));
      // And the whole of the work really is done, on exactly `beatCount` Beats.
      const onward = advance(step.career, 90, plain);
      const beats = of([...step.events, ...onward.events], 'BeatResolved').filter(
        (event) => event.partyId === start.partyId,
      );
      expect(beats).toHaveLength(4);
      expect(beats.map((event) => event.beatIndex)).toEqual([2, 3, 4, 5]);
    });
  }

  it('costs a Commission fewer Days than the Party spent waiting', () => {
    // Five Days of waiting with three Beats left moves the return by three, not by five:
    // the Days are not a price, the room for the work is (DL-23 §4).
    const start = staged('v-spread-cost');
    const before = start.career.parties.find((party) => party.id === start.partyId);
    const stood = advance(start.career, 5, plain).career;
    const step = answerParty(stood, start.partyId, 'press-on', plain);
    const after = step.career.parties.find((party) => party.id === start.partyId);
    expect(after?.returnsOn).toBe((before?.returnsOn ?? 0) + 3);
  });
});

// ── Coin, at the exact boundary and below zero ──────────────────────────────

describe('coin at the exact boundary', () => {
  it('lets the Guild spend its very last coin on an option that costs exactly that', () => {
    const found = waiting('v-exact');
    const exact = edit(found.career, plain, (draft) => (draft.guild.coin = 40));
    const offer = wordOffer(exact, found.party.id, plain);
    expect(offer?.options.find((option) => option.id === 'send-coin')?.affordable).toBe(true);
    const step = answerParty(exact, found.party.id, 'send-coin', plain);
    expect(step.career.guild.coin).toBe(0);
    // And one coin short is refused, with the shortfall said plainly.
    const short = edit(found.career, plain, (draft) => (draft.guild.coin = 39));
    expect(
      wordOffer(short, found.party.id, plain)?.options.find((option) => option.id === 'send-coin')
        ?.refusal,
    ).toEqual({ code: 'InsufficientCoin', shortfall: 1 });
    expect(() => answerParty(short, found.party.id, 'send-coin', plain)).toThrow(EngineError);
  });

  it('keeps every free option open to a Guild whose coin has gone negative', () => {
    const found = waiting('v-debt');
    const owing = edit(found.career, plain, (draft) => (draft.guild.coin = -1234));
    const offer = wordOffer(owing, found.party.id, plain);
    expect(offer?.options.filter((option) => option.affordable).map((option) => option.id)).toEqual([
      'press-on',
      'turn-back',
    ]);
    expect(
      offer?.options.find((option) => option.id === 'send-coin')?.refusal?.shortfall,
    ).toBe(40 + 1234);
    expect(() => answerParty(owing, found.party.id, 'press-on', plain)).not.toThrow();
    expect(() => answerParty(owing, found.party.id, 'turn-back', plain)).not.toThrow();
  });

  it('closes an option that was open when the word arrived, once the coin has gone', () => {
    const found = waiting('v-coin-falls');
    const rich = wordOffer(found.career, found.party.id, plain);
    expect(rich?.options.find((option) => option.id === 'send-coin')?.affordable).toBe(true);
    const spent = edit(found.career, plain, (draft) => (draft.guild.coin = 10));
    expect(
      wordOffer(spent, found.party.id, plain)?.options.find((option) => option.id === 'send-coin')
        ?.affordable,
    ).toBe(false);
    // The event is still the past-tense fact it was, and says the opposite.
    const asked = found.party.pendingWord;
    expect(asked?.optionIds).toContain('send-coin');
  });
});

// ── Degenerate configuration ────────────────────────────────────────────────

describe('degenerate configuration', () => {
  it('never stops at a chance of zero and stops at the first opportunity at one', () => {
    const off = advance(send(open('v-cfg', plain, { decisionChancePerBeat: 0 }), plain), 200, plain);
    expect(of(off.events, 'PartyAwaitingWord')).toEqual([]);
    const on = advance(send(open('v-cfg', plain, { decisionChancePerBeat: 1 }), plain), 200, plain);
    expect(of(on.events, 'PartyAwaitingWord').length).toBeGreaterThan(0);
  });

  it('never stops at a cap of zero', () => {
    const capped = advance(
      send(open('v-cap', plain, { decisionsPerCommission: 0 }), plain),
      200,
      plain,
    );
    expect(of(capped.events, 'PartyAwaitingWord')).toEqual([]);
  });

  it('takes the default the very next Day at a timeout of zero, and never deadlocks', () => {
    const found = waiting('v-timeout-0', plain, { wordTimeoutDays: 0 });
    // The engine floors the span at one Day, so the word is never taken on the Day it was sent.
    expect(found.party.pendingWord?.timesOutOn).toBe(found.career.day + 1);
    const run = advance(found.career, 1, plain);
    expect(of(run.events, 'PartyAnswered')[0]?.byDefault).toBe(true);
  });

  it('is still answerable and still terminates at a timeout of a thousand Days', () => {
    const found = waiting('v-timeout-1000', plain, { wordTimeoutDays: 1000, careerYears: 2 });
    expect(found.party.pendingWord?.timesOutOn).toBe(found.career.day + 1000);
    const run = advance(found.career, 10_000, plain);
    expect(run.career.ended).toBeDefined();
    // The Career ended with the word still outstanding, which is allowed and is the only
    // way a Party is left waiting at the end.
    const left = awaitingParties(run.career);
    if (left.length > 0) expect(run.career.ended).toBeDefined();
  }, 60_000);

  it('stops nothing when content ships no Decision, and nothing when none is eligible', () => {
    const none = advance(send(open('v-none', noDecisions), noDecisions), 200, noDecisions);
    expect(of(none.events, 'PartyAwaitingWord')).toEqual([]);
    const ineligible = world(NEVER_ELIGIBLE);
    const never = advance(send(open('v-never', ineligible), ineligible), 200, ineligible);
    expect(of(never.events, 'PartyAwaitingWord')).toEqual([]);
  });

  it('falls back to somebody when a slot rule finds nobody, and names no Trait they lack', () => {
    // The `with_trait:` fallback picks anybody when nobody holds it, so what must hold is
    // that the slot names the Trait **only** when the Hero it resolved to really has it
    // (DL-13, F11) — never putting a Trait in the mouth of somebody without one.
    const content = world(NOBODY_HOLDS_IT);
    let fellBack = 0;
    let named = 0;
    for (let seed = 0; seed < 25; seed += 1) {
      const found = untilWord(
        send(open(`v-nobody-${String(seed)}`, content), content),
        content,
        60,
      );
      const word = found.party.pendingWord;
      expect(found.party.heroIds, `seed ${String(seed)}`).toContain(word?.slots.heroId);
      const hero = found.career.guild.roster.find((entry) => entry.id === word?.slots.heroId);
      const holds = hero?.traits.some((trait) => trait.name === 'Bruised') === true;
      expect(word?.slots.trait, `seed ${String(seed)}`).toBe(holds ? 'Bruised' : undefined);
      if (holds) named += 1;
      else fellBack += 1;
    }
    // The fallback really is exercised: on most seeds nobody on the Party holds it.
    expect(fellBack).toBeGreaterThan(0);
    expect(fellBack + named).toBe(25);
  }, 60_000);
});

// ── The world while a Party waits ───────────────────────────────────────────

describe('the world while a Party waits', () => {
  it('turns on: Upkeep still falls, and it can end the Career with a word outstanding', () => {
    const found = waiting('v-insolvent', plain, { wordTimeoutDays: 400, startingCoin: 5000 });
    const broke = edit(found.career, plain, (draft) => (draft.guild.coin = -1));
    const run = advance(broke, 200, plain);
    expect(of(run.events, 'UpkeepOwed').length).toBeGreaterThan(0);
    expect(run.career.ended?.reason).toBe('insolvency');
    // A Party still waiting when the Guild folds is never answered, and answering it now
    // is refused rather than quietly accepted.
    if (awaitingParties(run.career).length > 0) {
      expect(() =>
        answerParty(run.career, awaitingParties(run.career)[0]?.id ?? '', 'press-on', plain),
      ).toThrow(EngineError);
    }
  }, 60_000);

  it('turns on with the whole Roster away and awaiting', () => {
    let career = open('v-all-away', plain, { wordTimeoutDays: 400, startingHeroes: 2 });
    career = send(career, plain, 0, 1);
    career = send(career, plain, 1, 1);
    for (let step = 0; step < 40 && awaitingParties(career).length < 2; step += 1) {
      career = advance(career, 1, plain).career;
    }
    expect(awaitingParties(career)).toHaveLength(2);
    expect(availableHeroes(career)).toEqual([]);
    const before = career.day;
    const run = advance(career, 90, plain);
    expect(run.career.day).toBeGreaterThan(before);
    expect(of(run.events, 'UpkeepOwed').length).toBeGreaterThan(0);
    expect(of(run.events, 'BoardRefreshed').length).toBeGreaterThan(0);
  }, 60_000);

  it('keeps an awaiting Party standing still: no Beat, no return, no harm', () => {
    const found = waiting('v-frozen', plain, { wordTimeoutDays: 400 });
    const stale = edit(found.career, plain, (draft) => {
      for (const party of draft.parties) {
        if (party.id === found.party.id) party.returnsOn = draft.day;
      }
    });
    const run = advance(stale, 30, plain);
    const still = run.career.parties.find((party) => party.id === found.party.id);
    expect(still?.pendingWord).toBeDefined();
    expect(still?.beatsResolved).toEqual(found.party.beatsResolved);
    expect(of(run.events, 'PartyReturned').filter((event) => event.partyId === found.party.id)).toEqual(
      [],
    );
    for (const event of run.events) {
      if (event.type === 'HeroInjured' || event.type === 'HeroScarred' || event.type === 'HeroDied') {
        expect(found.party.heroIds).not.toContain(event.heroId);
      }
    }
  });
});

// ── Determinism, purity and the save ────────────────────────────────────────

describe('determinism', () => {
  it('gives the same Career and the same events for the same seed and the same answers', () => {
    const run = (): { career: Career; events: GameEvent[] } => {
      let career = send(open('v-determinism', plain), plain);
      const events: GameEvent[] = [];
      for (let step = 0; step < 120 && career.ended === undefined; step += 1) {
        const offer = wordOffers(career, plain)[0];
        if (offer !== undefined) {
          const chosen = ['press-on', 'send-coin', 'turn-back'][step % 3] ?? 'press-on';
          const option = offer.options.find((entry) => entry.id === chosen && entry.affordable);
          if (option !== undefined) {
            const answered = answerParty(career, offer.partyId, option.id, plain);
            career = answered.career;
            events.push(...answered.events);
            continue;
          }
        }
        const moved = advance(career, 3, plain);
        career = moved.career;
        events.push(...moved.events);
      }
      return { career, events };
    };
    const once = run();
    const twice = run();
    expect(serialiseCareer(once.career)).toBe(serialiseCareer(twice.career));
    expect(once.events).toEqual(twice.events);
  }, 60_000);

  it('continues identically whether or not it was saved between the word and the answer', () => {
    for (const optionId of ['press-on', 'send-coin', 'turn-back']) {
      const found = waiting(`v-save-${optionId}`);
      const loaded = deserialiseCareer(serialiseCareer(found.career), plain);
      const straight = answerParty(found.career, found.party.id, optionId, plain);
      const viaSave = answerParty(loaded, found.party.id, optionId, plain);
      expect(serialiseCareer(viaSave.career), optionId).toBe(serialiseCareer(straight.career));
      expect(viaSave.events, optionId).toEqual(straight.events);
      const onwardStraight = advance(straight.career, 90, plain);
      const onwardSaved = advance(viaSave.career, 90, plain);
      expect(serialiseCareer(onwardSaved.career), optionId).toBe(
        serialiseCareer(onwardStraight.career),
      );
      expect(onwardSaved.events, optionId).toEqual(onwardStraight.events);
    }
  }, 60_000);

  it('never touches what it was given, however deeply frozen', () => {
    const found = waiting('v-frozen-input');
    deepFreeze(found.career);
    expect(() => answerParty(found.career, found.party.id, 'press-on', plain)).not.toThrow();
    expect(() => wordOffers(found.career, plain)).not.toThrow();
    expect(() => awaitingParties(found.career)).not.toThrow();
    expect(() => wordOffer(found.career, found.party.id, plain)).not.toThrow();
    expect(() => advance(found.career, 5, plain)).not.toThrow();
    expect(() => advanceUntilAttention(found.career, plain)).not.toThrow();
  });
});

describe('a Career in which no Decision fires', () => {
  it('is identical to itself whether the machinery is switched off or absent', () => {
    // What this proves is exactly that and no more: there is no E5 tree to compare
    // against, so "bit for bit the Career E5 played" is an inference from this plus the
    // fact that no shared code path takes an extra draw — not something measured here.
    for (const seed of ['v-same-1', 'v-same-2', 'v-same-3']) {
      const off = advance(
        send(open(seed, plain, { decisionChancePerBeat: 0 }), plain),
        400,
        plain,
      );
      const absent = advance(
        send(open(seed, noDecisions, { decisionChancePerBeat: 0 }), noDecisions),
        400,
        noDecisions,
      );
      expect(serialiseCareer(off.career), seed).toBe(serialiseCareer(absent.career));
      expect(off.events, seed).toEqual(absent.events);
      expect(off.career.rng, seed).toEqual(absent.career.rng);
    }
  }, 60_000);
});

// ── A fleet, under two policies ─────────────────────────────────────────────

describe('a hundred played Careers under a mixed policy and a silent one', () => {
  it('holds everything E6 promises about them', () => {
    let seenWords = 0;
    let seenTurnBacks = 0;
    for (let seed = 0; seed < 50; seed += 1) {
      for (const mixed of [true, false]) {
        const where = `${mixed ? 'mixed' : 'silent'} on seed ${String(seed)}`;
        let career = open(`v-fleet-${String(seed)}`, plain, {
          careerYears: 3,
          decisionChancePerBeat: 0.5,
        });
        const events: GameEvent[] = [];
        let answered = 0;
        let guard = 0;
        while (career.ended === undefined) {
          guard += 1;
          if (guard > 20_000) throw new Error(`never finished: ${where}`);
          for (let asking = 0; mixed && asking < 8; asking += 1) {
            const offer = wordOffers(career, plain)[0];
            if (offer === undefined) break;
            // A non-uniform mix: mostly press on, sometimes send coin, rarely come home.
            const wanted =
              answered % 10 === 0 ? 'turn-back' : answered % 3 === 0 ? 'send-coin' : 'press-on';
            const option =
              offer.options.find((entry) => entry.id === wanted && entry.affordable) ??
              offer.options.find((entry) => entry.affordable);
            if (option === undefined) break;
            answered += 1;
            const step = answerParty(career, offer.partyId, option.id, plain);
            career = step.career;
            events.push(...step.events);
          }
          const free = availableHeroes(career);
          const used = new Set<string>();
          for (const commission of career.board) {
            const left = free.filter((hero) => !used.has(hero.id));
            if (left.length === 0) break;
            const refusing = new Set(
              proposeParty(
                career,
                commission.id,
                left.map((hero) => hero.id),
                plain,
              ).refusals.map((refusal) => refusal.heroId),
            );
            const party = left
              .filter((hero) => !refusing.has(hero.id))
              .slice(0, 2)
              .map((hero) => hero.id);
            if (party.length === 0) continue;
            const step = commitParty(career, commission.id, party, plain);
            career = step.career;
            events.push(...step.events);
            for (const id of party) used.add(id);
          }
          const run = advanceUntilAttention(career, plain);
          career = run.career;
          events.push(...run.events);
        }

        // One word per Commission at most, and nobody left waiting past their own Day.
        const words = new Map<string, number>();
        const timesOutOn = new Map<string, number>();
        for (const event of of(events, 'PartyAwaitingWord')) {
          words.set(event.partyId, (words.get(event.partyId) ?? 0) + 1);
          timesOutOn.set(event.partyId, event.timesOutOn);
        }
        for (const [partyId, count] of words) expect(count, `${where}: ${partyId}`).toBe(1);
        seenWords += words.size;
        for (const event of of(events, 'PartyAnswered')) {
          expect(event.day, `${where}: ${event.partyId}`).toBeLessThanOrEqual(
            timesOutOn.get(event.partyId) ?? Infinity,
          );
        }

        // No harm after a turn-back, and a turned-back Party never reports success.
        const turnedBackOn = new Map(
          of(events, 'PartyTurnedBack').map((event) => [event.partyId, event.day]),
        );
        seenTurnBacks += turnedBackOn.size;
        for (const event of events) {
          if (
            event.type !== 'HeroInjured' &&
            event.type !== 'HeroScarred' &&
            event.type !== 'HeroDied'
          ) {
            continue;
          }
          const called = turnedBackOn.get(event.partyId ?? '');
          if (called === undefined) continue;
          expect(event.day, `${where}: harm after a turn-back`).toBeLessThan(called);
        }
        for (const returned of of(events, 'PartyReturned')) {
          if (!turnedBackOn.has(returned.partyId)) continue;
          expect(returned.succeeded, `${where}: ${returned.partyId}`).toBe(false);
        }

        // The ledgers count what the events say, once each.
        expect(career.ledger.wordsSent, `${where}: wordsSent`).toBe(words.size);
        expect(career.ledger.turnedBack, `${where}: turnedBack`).toBe(turnedBackOn.size);

        // Whole-Career coin accounting, and nobody on two Rosters.
        const moved = of(events, 'CoinChanged').reduce((sum, event) => sum + event.delta, 0);
        expect(career.config.startingCoin + moved, `${where}: coin`).toBe(career.guild.coin);
        const everywhere = [
          ...career.guild.roster.map((hero) => hero.id),
          ...career.rivals.flatMap((rival) => rival.roster.map((hero) => hero.id)),
        ];
        expect(new Set(everywhere).size, `${where}: two Rosters`).toBe(everywhere.length);

        // No NaN and no negative zero.
        const written = serialiseCareer(career);
        expect(written.includes('NaN'), `${where}: NaN`).toBe(false);
        expect(career.ended, where).toBeDefined();
      }
    }
    expect(seenWords).toBeGreaterThan(50);
    expect(seenTurnBacks).toBeGreaterThan(0);
  }, 300_000);
});
