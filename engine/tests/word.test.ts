/**
 * E6-S2's pending state: what happens on the Day a Party sends word, what a stretch of
 * Days does about it, how two Parties wait at once, and how the whole of it survives a
 * save.
 */

import { describe, expect, it } from 'vitest';
import {
  advance,
  advanceUntilAttention,
  answerParty,
  awaitingParties,
  commitParty,
  deserialiseCareer,
  projectedReturn,
  serialiseCareer,
  turnBackOutcome,
  wordOffer,
  wordOffers,
  type Career,
} from '../src/index.js';
import { deepFreeze } from './fixtures.js';
import {
  aPartyWaiting,
  decisionContent,
  edit,
  of,
  openRich,
  sendEverybody,
  untilWord,
  withDecisions,
} from './e6-fixtures.js';

/** A Career on the Day a Party sent word, on a seed that reliably produces one. */
function waiting(seed = 'w-basic'): { career: Career; partyId: string } {
  const found = aPartyWaiting(seed, decisionContent, { decisionChancePerBeat: 1 });
  return { career: found.career, partyId: found.party.id };
}

describe('the Day a Party sends word', () => {
  const { career, partyId } = waiting();
  const party = career.parties.find((entry) => entry.id === partyId);

  it('does not resolve that Day’s Beat', () => {
    // The Decision displaced Beat 2, and Beat 2 has not happened.
    expect(party?.pendingWord?.beatIndex).toBe(2);
    expect(party?.beatsResolved).toHaveLength(1);
  });

  it('sets pendingWord with both clocks, the slots and every option offered', () => {
    const word = party?.pendingWord;
    expect(word?.decisionId).toBe('ask-the-guide');
    expect(word?.askedOn).toBe(career.day);
    expect(word?.timesOutOn).toBe(career.day + career.config.wordTimeoutDays);
    expect(word?.slots.heroId).toBeDefined();
    // Every option, in authored order — including the one the Guild might not afford,
    // because an option that was never offered cannot be refused by id (DL-23 §8).
    expect(word?.optionIds).toEqual(['press-on', 'send-coin', 'turn-back']);
  });

  it('marks the Commission as having stopped once, and counts it in the ledger', () => {
    expect(party?.decisionUsed).toBe(true);
    expect(career.ledger.wordsSent).toBe(1);
  });

  it('carries option ids, kinds, costs and affordability on the event, and nothing else', () => {
    const fresh = sendEverybody(
      openRich('w-event', decisionContent, { decisionChancePerBeat: 1 }),
      decisionContent,
    );
    const run = untilWord(fresh.career, decisionContent);
    const event = of(run.events, 'PartyAwaitingWord')[0];
    expect(event?.options).toEqual([
      { id: 'press-on', kind: 'pressOn', affordable: true },
      { id: 'send-coin', kind: 'sendCoin', cost: 40, affordable: true },
      { id: 'turn-back', kind: 'turnBack', affordable: true },
    ]);
  });

  it('is what awaitingParties and wordOffers answer with', () => {
    expect(awaitingParties(career).map((entry) => entry.id)).toEqual([partyId]);
    const offer = wordOffer(career, partyId, decisionContent);
    expect(offer?.decisionId).toBe('ask-the-guide');
    expect(offer?.daysWaited).toBe(0);
    expect(offer?.daysLeft).toBe(career.config.wordTimeoutDays);
    expect(offer?.defaultOptionId).toBe('press-on');
    expect(offer?.options.map((option) => option.id)).toEqual([
      'press-on',
      'send-coin',
      'turn-back',
    ]);
    expect(wordOffers(career, decisionContent)).toHaveLength(1);
  });
});

describe('an option the Guild cannot pay for', () => {
  it('is offered, and says so with its cost and the shortfall', () => {
    const { career, partyId } = waiting('w-poor');
    const broke = edit(career, (draft) => (draft.guild.coin = 12));
    const offer = wordOffer(broke, partyId, decisionContent);
    const send = offer?.options.find((option) => option.id === 'send-coin');
    expect(send?.cost).toBe(40);
    expect(send?.affordable).toBe(false);
    expect(send?.refusal).toEqual({ code: 'InsufficientCoin', shortfall: 28 });
    // And the other two are still open, so the Party is never stuck.
    expect(offer?.options.filter((option) => option.affordable).map((option) => option.id)).toEqual([
      'press-on',
      'turn-back',
    ]);
  });

  it('never closes an option that asks for nothing, even to a Guild in debt', () => {
    // A played Career goes negative whenever Upkeep outruns the fees, and pressing on or
    // coming home costs nothing at all — the default must be takeable whatever the purse
    // says, because it is what the timeout takes (DL-23 §3).
    const { career, partyId } = waiting('w-in-debt');
    const owing = edit(career, (draft) => (draft.guild.coin = -400));
    const offer = wordOffer(owing, partyId, decisionContent);
    expect(offer?.options.filter((option) => option.affordable).map((option) => option.id)).toEqual([
      'press-on',
      'turn-back',
    ]);
    expect(offer?.options.find((option) => option.id === offer.defaultOptionId)?.affordable).toBe(
      true,
    );
    expect(() => answerParty(owing, partyId, 'press-on', decisionContent)).not.toThrow();
  });

  it('is worked out fresh, so coin arriving while they wait opens it again', () => {
    const { career, partyId } = waiting('w-coin-moves');
    const broke = edit(career, (draft) => (draft.guild.coin = 12));
    const rich = edit(broke, (draft) => (draft.guild.coin = 400));
    const before = wordOffer(broke, partyId, decisionContent);
    const after = wordOffer(rich, partyId, decisionContent);
    expect(before?.options[1]?.affordable).toBe(false);
    expect(after?.options[1]?.affordable).toBe(true);
    // The offer itself never changed: the Career holds the ids, not the affordability.
    expect(broke.parties[0]?.pendingWord?.optionIds).toEqual(
      rich.parties[0]?.pendingWord?.optionIds,
    );
  });
});

describe('a stretch of Days', () => {
  it('stops on the Day the word arrives, having advanced zero Days after it', () => {
    const sent = sendEverybody(
      openRich('w-stop', decisionContent, { decisionChancePerBeat: 1 }),
      decisionContent,
    );
    const run = advance(sent.career, 1000, decisionContent);
    const asked = of(run.events, 'PartyAwaitingWord')[0];
    expect(asked).toBeDefined();
    expect(run.career.day).toBe(asked?.day);
    expect(run.career.ended).toBeUndefined();
    // Every event in the step happened on or before that Day: nothing was simulated after.
    for (const event of run.events) expect(event.day).toBeLessThanOrEqual(run.career.day);
  });

  it('treats an awaiting Party as attention', () => {
    const sent = sendEverybody(
      openRich('w-attention', decisionContent, { decisionChancePerBeat: 1 }),
      decisionContent,
    );
    let career = sent.career;
    let stoppedOnWord = false;
    for (let step = 0; step < 20 && !stoppedOnWord; step += 1) {
      const run = advanceUntilAttention(career, decisionContent);
      career = run.career;
      stoppedOnWord = of(run.events, 'PartyAwaitingWord').length > 0;
      if (stoppedOnWord) {
        expect(career.parties.some((party) => party.pendingWord !== undefined)).toBe(true);
      }
    }
    expect(stoppedOnWord).toBe(true);
  });

  it('runs on past a Party that is already waiting, and the Party stands still', () => {
    // The next stretch does pass Days — which is what keeps a Career from deadlocking on
    // somebody nobody answered (DL-23 §3). The waiting Party resolves no Beat and does not
    // come home while it waits.
    const { career, partyId } = waiting('w-runs-on');
    const before = career.parties.find((entry) => entry.id === partyId);
    const run = advance(career, 2, decisionContent);
    const after = run.career.parties.find((entry) => entry.id === partyId);
    expect(run.career.day).toBe(career.day + 2);
    expect(after?.beatsResolved).toEqual(before?.beatsResolved);
    expect(after?.returnsOn).toBe(before?.returnsOn);
    expect(after?.pendingWord).toEqual(before?.pendingWord);
    expect(of(run.events, 'BeatResolved').filter((event) => event.partyId === partyId)).toEqual([]);
    expect(of(run.events, 'PartyReturned').filter((event) => event.partyId === partyId)).toEqual([]);
  });
});

describe('two Parties waiting at once', () => {
  function bothWaiting(): Career {
    // Two Commissions taken on the same Day by two Parties of one Hero each, and a chance
    // of one, so both stop as soon as each reaches its second Beat.
    const opened = openRich('w-two', decisionContent, { decisionChancePerBeat: 1 });
    const [one, two] = opened.board;
    const [first, second] = opened.guild.roster;
    if (one === undefined || two === undefined || first === undefined || second === undefined) {
      throw new Error('the test expected two Commissions and two Heroes');
    }
    const a = commitParty(opened, one.id, [first.id], decisionContent);
    const b = commitParty(a.career, two.id, [second.id], decisionContent);
    let career = b.career;
    for (let step = 0; step < 40; step += 1) {
      career = advance(career, 1, decisionContent).career;
      if (awaitingParties(career).length === 2) return career;
    }
    throw new Error('the test expected two Parties to send word');
  }

  it('lets both wait, and answers them independently', () => {
    const career = bothWaiting();
    const [one, two] = awaitingParties(career);
    if (one === undefined || two === undefined) throw new Error('expected two');
    const answered = answerParty(career, one.id, 'press-on', decisionContent);
    expect(awaitingParties(answered.career).map((party) => party.id)).toEqual([two.id]);
    expect(
      answered.career.parties.find((party) => party.id === two.id)?.pendingWord,
    ).toBeDefined();
    const both = answerParty(answered.career, two.id, 'turn-back', decisionContent);
    expect(awaitingParties(both.career)).toEqual([]);
  });
});

describe('a save written while a Party is waiting', () => {
  const { career, partyId } = waiting('w-save');

  it('round-trips the pending word exactly', () => {
    const loaded = deserialiseCareer(serialiseCareer(career), decisionContent);
    expect(loaded).toEqual(career);
    expect(loaded.parties.find((party) => party.id === partyId)?.pendingWord).toEqual(
      career.parties.find((party) => party.id === partyId)?.pendingWord,
    );
  });

  it('resumes awaiting, and carries on exactly as if it had not been saved', () => {
    const loaded = deserialiseCareer(serialiseCareer(career), decisionContent);
    expect(awaitingParties(loaded).map((party) => party.id)).toEqual([partyId]);
    const straight = advance(career, 200, decisionContent);
    const viaSave = advance(loaded, 200, decisionContent);
    expect(serialiseCareer(viaSave.career)).toBe(serialiseCareer(straight.career));
    expect(viaSave.events).toEqual(straight.events);
  });

  it('loads twice to the same bytes', () => {
    const written = serialiseCareer(career);
    expect(serialiseCareer(deserialiseCareer(written, decisionContent))).toBe(written);
    expect(serialiseCareer(deserialiseCareer(written, decisionContent))).toBe(written);
  });
});

describe('a save written before Decisions existed', () => {
  it('loads with the defaults, and a Party already away can still be asked', () => {
    // E6's own fields are stripped from a played Career's document, which is what an E5
    // save of the same moment looked like (DL-23 §13).
    const sent = sendEverybody(
      openRich('w-e5-save', decisionContent, { decisionChancePerBeat: 1 }),
      decisionContent,
    );
    const walked = advance(sent.career, 1, decisionContent);
    const document = JSON.parse(serialiseCareer(walked.career)) as Record<string, unknown>;
    for (const party of document['parties'] as Record<string, unknown>[]) {
      delete party['decisionUsed'];
      delete party['dcDelta'];
    }
    const ledger = document['ledger'] as Record<string, unknown>;
    delete ledger['wordsSent'];
    delete ledger['turnedBack'];
    const config = document['config'] as Record<string, unknown>;
    for (const key of [
      'decisionChancePerBeat',
      'decisionsPerCommission',
      'wordTimeoutDays',
      'turnBackTravelDays',
      'turnBackFeeFactor',
    ]) {
      delete config[key];
    }

    const loaded = deserialiseCareer(JSON.stringify(document), decisionContent);
    expect(loaded.parties[0]?.decisionUsed).toBe(false);
    expect(loaded.parties[0]?.dcDelta).toBe(0);
    expect(loaded.parties[0]?.pendingWord).toBeUndefined();
    expect(loaded.ledger.wordsSent).toBe(0);
    expect(loaded.ledger.turnedBack).toBe(0);
    expect(loaded.config.wordTimeoutDays).toBe(5);
    expect(loaded.config.turnBackFeeFactor).toBe(1);
    // Nothing is surprised on the load itself, and the Party can still be asked.
    expect(awaitingParties(loaded)).toEqual([]);
    const run = untilWord(loaded, decisionContent);
    expect(run.party).toBeDefined();
  });
});

// ── Two reads a front end needs and must not compute (F11) ──────────────────

describe('when a waiting Party can be home', () => {
  it('is returnsOn for a Party at work, and later for one standing still', () => {
    const { career, partyId } = waiting('w-projected');
    const party = career.parties.find((entry) => entry.id === partyId);
    if (party === undefined) throw new Error('the test expected a waiting Party');
    // Both front ends show `returnsOn`, and while a Party waits it is a Day that will slip.
    expect(projectedReturn(career, partyId)).toBeGreaterThanOrEqual(party.returnsOn);

    // A Party that is simply at work is due back when it is due back, and nothing is added.
    const onward = answerParty(career, partyId, 'press-on', decisionContent).career;
    const working = onward.parties.find((entry) => entry.id === partyId);
    if (working !== undefined) expect(projectedReturn(onward, partyId)).toBe(working.returnsOn);
  });

  it('is exactly the Day answering now would set, for every option that carries on', () => {
    for (const seed of ['w-proj-1', 'w-proj-2', 'w-proj-3', 'w-proj-4']) {
      const { career, partyId } = waiting(seed);
      const projected = projectedReturn(career, partyId);
      for (const optionId of ['press-on', 'send-coin']) {
        const answered = answerParty(career, partyId, optionId, decisionContent).career;
        const party = answered.parties.find((entry) => entry.id === partyId);
        // A Party whose last Beat has just fired has already come home, and there is
        // nothing left to project; every other one is due back on the projected Day.
        if (party !== undefined) expect(party.returnsOn, `${seed}/${optionId}`).toBe(projected);
      }
    }
  });

  it('slips as the Days pass, and the Party really is home no sooner than it said', () => {
    // Driven for real rather than constructed: word arrives, nobody answers, the timeout
    // takes the default, and the Day they were "due back" turns out not to have been it.
    const { career, partyId } = waiting('w-proj-slips');
    const due = career.parties.find((entry) => entry.id === partyId)?.returnsOn ?? 0;
    const promised = projectedReturn(career, partyId) ?? 0;
    expect(promised).toBeGreaterThanOrEqual(due);

    let held = career;
    let last = promised;
    for (let step = 0; step < 40 && awaitingParties(held).length > 0; step += 1) {
      held = advance(held, 1, decisionContent).career;
      const now = projectedReturn(held, partyId);
      if (now === undefined) break;
      // It only ever moves away from the player, never towards them.
      expect(now).toBeGreaterThanOrEqual(last);
      last = now;
    }
    const run = advance(held, 60, decisionContent);
    const home = of(run.events, 'PartyReturned').find((event) => event.partyId === partyId);
    expect(home, 'the Party should have come home').toBeDefined();
    // The promise the words carry: no sooner than the Day the projection named.
    expect(home?.day).toBeGreaterThanOrEqual(promised);
  });

  it('answers nothing for a Party the Career does not hold, and never touches it', () => {
    const { career, partyId } = waiting('w-proj-frozen');
    deepFreeze(career);
    expect(projectedReturn(career, 'no-such-party')).toBeUndefined();
    expect(() => projectedReturn(career, partyId)).not.toThrow();
    expect(() => turnBackOutcome(career, partyId, decisionContent)).not.toThrow();
    expect(() => wordOffer(career, partyId, decisionContent)).not.toThrow();
  });
});

describe('what turning back would pay', () => {
  /** A Decision whose turn-back docks the score, so the fee is not simply read off. */
  const COSTLY_RETREAT = {
    id: 'the-road-is-shut',
    name: 'The road is shut',
    weight: 1,
    tags: [],
    conditions: { minBeat: 2 },
    slots: { hero: 'any' },
    prompt: '{hero} sends word that the road is shut.',
    options: [
      { id: 'press-on', kind: 'pressOn', label: 'Find a way round.', default: true, consequences: [] },
      {
        id: 'turn-back',
        kind: 'turnBack',
        label: 'Come home.',
        consequences: [{ kind: 'score', delta: -1 }],
      },
    ],
  };
  const costly = withDecisions(COSTLY_RETREAT);

  it('rides on the offer, and says the same thing the selector does', () => {
    const { career, partyId } = waiting('w-outcome');
    const offer = wordOffer(career, partyId, decisionContent);
    const option = offer?.options.find((entry) => entry.kind === 'turnBack');
    expect(option?.outcome).toBeDefined();
    expect(option?.outcome).toEqual(turnBackOutcome(career, partyId, decisionContent));
    // The other two kinds carry none: there is nothing to say about a fee they do not move.
    for (const other of offer?.options.filter((entry) => entry.kind !== 'turnBack') ?? []) {
      expect(other.outcome, other.id).toBeUndefined();
    }
    const outcome = option?.outcome;
    expect(outcome?.fullFee).toBeGreaterThan(0);
    expect(outcome?.feePaid).toBeLessThan(outcome?.fullFee ?? 0);
    expect(outcome?.beatsResolved).toBeGreaterThan(0);
    expect(outcome?.beatsResolved).toBeLessThan(outcome?.beatCount ?? 0);
  });

  it('is the coin the Patron then actually pays, across a fleet', () => {
    let checked = 0;
    for (const [content, factor] of [
      [decisionContent, 1],
      [decisionContent, 0.5],
      [decisionContent, 0],
      // And where the option's own consequences move the score the fee is worked out on.
      [costly, 1],
    ] as const) {
      for (let seed = 0; seed < 12; seed += 1) {
        const sent = sendEverybody(
          openRich(`w-outcome-${String(factor)}-${String(seed)}`, content, {
            decisionChancePerBeat: 1,
            turnBackFeeFactor: factor,
          }),
          content,
        );
        const found = untilWord(sent.career, content);
        if (found.party === undefined) continue;
        const said = turnBackOutcome(found.career, found.party.id, content);
        if (said === undefined) continue;
        const answered = answerParty(found.career, found.party.id, 'turn-back', content);
        const run = advance(answered.career, 60, content);
        const home = of([...answered.events, ...run.events], 'PartyReturned').find(
          (event) => event.partyId === found.party?.id,
        );
        expect(home, `seed ${String(seed)} at factor ${String(factor)}`).toBeDefined();
        expect(home?.feePaid, `seed ${String(seed)} at factor ${String(factor)}`).toBe(said.feePaid);
        expect(home?.succeeded).toBe(false);
        checked += 1;
      }
    }
    expect(checked).toBeGreaterThan(30);
  }, 60_000);

  it('answers nothing for a Party that is not waiting', () => {
    const { career, partyId } = waiting('w-outcome-none');
    const onward = answerParty(career, partyId, 'press-on', decisionContent).career;
    expect(turnBackOutcome(onward, partyId, decisionContent)).toBeUndefined();
    expect(turnBackOutcome(career, 'no-such-party', decisionContent)).toBeUndefined();
  });
});
