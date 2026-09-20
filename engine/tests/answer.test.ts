/**
 * E6-S3: answering a Party that has sent word. What each of the three kinds does, what
 * each `effect` does, what the timeout does, and what happens when the call is wrong.
 */

import { describe, expect, it } from 'vitest';
import {
  advance,
  answerParty,
  awaitingParties,
  EngineError,
  serialiseCareer,
  wordOffer,
  type Career,
  type GameEvent,
} from '../src/index.js';
import {
  ASK_THE_GUIDE,
  aPartyWaiting,
  decisionContent,
  edit,
  of,
  openRich,
  sendEverybody,
  untilWord,
  withDecisions,
} from './e6-fixtures.js';

/** A Career on the Day a Party sent word, with plenty of coin. */
function waiting(seed: string, config?: Record<string, number>): { career: Career; partyId: string } {
  const found = aPartyWaiting(seed, decisionContent, { decisionChancePerBeat: 1, ...config });
  return { career: found.career, partyId: found.party.id };
}

describe('answerParty refuses what it cannot do, and touches nothing when it does', () => {
  const { career, partyId } = waiting('a-refuse');
  const before = serialiseCareer(career);

  function refused(call: () => unknown, code: string): void {
    expect(call).toThrow(EngineError);
    try {
      call();
    } catch (error) {
      expect((error as EngineError).code).toBe(code);
    }
    expect(serialiseCareer(career)).toBe(before);
  }

  it('throws NoSuchParty for a Party that is not away', () => {
    refused(() => answerParty(career, 'p999.1', 'press-on', decisionContent), 'NoSuchParty');
  });

  it('throws NotAwaitingWord for a Party that has sent none', () => {
    const quiet = edit(career, (draft) => {
      for (const party of draft.parties) delete party.pendingWord;
    });
    expect(() => answerParty(quiet, partyId, 'press-on', decisionContent)).toThrow(EngineError);
    try {
      answerParty(quiet, partyId, 'press-on', decisionContent);
    } catch (error) {
      expect((error as EngineError).code).toBe('NotAwaitingWord');
    }
  });

  it('throws NoSuchOption for an id this Decision does not offer', () => {
    refused(() => answerParty(career, partyId, 'run-away', decisionContent), 'NoSuchOption');
  });

  it('throws InsufficientCoin for an option the Guild cannot pay for, and refuses it by id', () => {
    const broke = edit(career, (draft) => (draft.guild.coin = 12));
    const written = serialiseCareer(broke);
    expect(() => answerParty(broke, partyId, 'send-coin', decisionContent)).toThrow(EngineError);
    try {
      answerParty(broke, partyId, 'send-coin', decisionContent);
    } catch (error) {
      expect((error as EngineError).code).toBe('InsufficientCoin');
    }
    expect(serialiseCareer(broke)).toBe(written);
  });

  it('throws CareerEnded once the Career is over', () => {
    const over = edit(career, (draft) => {
      draft.ended = { reason: 'insolvency', onDay: draft.day, reckoning: draft.ended?.reckoning ?? {
        years: 0,
        heroesOnRoster: 0,
        heroesLost: 0,
        heroesRetired: 0,
        heroesRecruited: 0,
        heroesPoachedFromUs: 0,
        commissionsCompleted: 0,
        commissionsFailed: 0,
        peakCoin: 0,
        finalCoin: 0,
        standing: 0,
        guildmasterStats: {
          start: draft.guild.guildmaster.startingStats,
          end: draft.guild.guildmaster.stats,
        },
      } };
    });
    expect(() => answerParty(over, partyId, 'press-on', decisionContent)).toThrow(EngineError);
  });
});

describe('pressing on', () => {
  const { career, partyId } = waiting('a-press');
  const step = answerParty(career, partyId, 'press-on', decisionContent);
  const party = step.career.parties.find((entry) => entry.id === partyId);

  it('reports the answer, and that it was not taken by default', () => {
    const answered = of(step.events, 'PartyAnswered')[0];
    expect(answered?.optionId).toBe('press-on');
    expect(answered?.byDefault).toBe(false);
    expect(answered?.decisionId).toBe('ask-the-guide');
    expect(answered?.slots.heroId).toBe(career.parties[0]?.pendingWord?.slots.heroId);
  });

  it('clears the pending word and applies the option’s consequences', () => {
    expect(party?.pendingWord).toBeUndefined();
    expect(awaitingParties(step.career)).toEqual([]);
    expect(
      of(step.events, 'ConsequenceApplied').some(
        (event) => event.consequence.kind === 'score' && event.consequence.delta === -1,
      ),
    ).toBe(true);
  });

  it('resolves the displaced Beat that Day, so beatCount is honoured', () => {
    const beats = of(step.events, 'BeatResolved').filter((event) => event.partyId === partyId);
    expect(beats).toHaveLength(1);
    expect(beats[0]?.beatIndex).toBe(2);
    expect(beats[0]?.day).toBe(step.career.day);
    expect(party?.beatsResolved).toHaveLength(2);
  });

  it('raises every remaining Beat’s DC by effect.dcDelta', () => {
    expect(party?.dcDelta).toBe(1);
    // One Beat, resolved twice from the same Career and the same generator state, with the
    // accumulated dcDelta and without it. Same Vignette both times, so the two DCs are
    // the same number with and without the point the answer added.
    const soon = step.career.day + 1;
    const carrying = edit(step.career, (draft) => {
      for (const entry of draft.parties) {
        if (entry.id !== partyId) continue;
        entry.commission.beatCount += 1;
        entry.beatDays = [...entry.beatDays.filter((day) => day <= draft.day), soon];
      }
    });
    const plain = edit(carrying, (draft) => {
      for (const entry of draft.parties) if (entry.id === partyId) entry.dcDelta = 0;
    });
    const withDelta = of(advance(carrying, 1, decisionContent).events, 'BeatResolved').find(
      (event) => event.partyId === partyId,
    );
    const without = of(advance(plain, 1, decisionContent).events, 'BeatResolved').find(
      (event) => event.partyId === partyId,
    );
    if (withDelta === undefined || without === undefined) {
      throw new Error('the test expected a Beat on both paths');
    }
    expect(withDelta.vignetteId).toBe(without.vignetteId);
    expect(without.dc).toBeLessThan(career.config.dcMax);
    expect(withDelta.dc).toBe(without.dc + 1);
  });

  it('leaves what is left of the work inside what is left of the span', () => {
    // The Days a Party spends waiting are not a price it pays: the Beats the waiting
    // stranded are spread over the Days that remain, and the Day they are due back moves
    // only as far as it must to leave room for them (DL-23 §4).
    const sent = sendEverybody(
      openRich('a-shift', decisionContent, { decisionChancePerBeat: 1 }),
      decisionContent,
    );
    const found = untilWord(sent.career, decisionContent);
    const before = found.career.parties[0];
    if (before === undefined || found.party === undefined) throw new Error('expected a Party');
    const later = advance(found.career, 3, decisionContent).career;
    const answered = answerParty(later, found.party.id, 'press-on', decisionContent);
    const after = answered.career.parties.find((party) => party.id === before.id);
    if (after === undefined) throw new Error('the Party came home too early');

    const left = after.commission.beatCount - after.beatsResolved.length;
    const toCome = after.beatDays.filter((day) => day > answered.career.day);
    expect(toCome).toHaveLength(left);
    for (const day of toCome) expect(day).toBeLessThanOrEqual(after.returnsOn);
    expect(after.returnsOn).toBeGreaterThanOrEqual(answered.career.day + left);
    // Room enough on this seed, so the Day they are due back did not move at all.
    expect(after.returnsOn).toBe(before.returnsOn);
  });

  it('costs nothing at all when it is answered the Day the word arrives', () => {
    const { career: fresh, partyId: id } = waiting('a-same-day');
    const before = fresh.parties.find((party) => party.id === id);
    const answered = answerParty(fresh, id, 'press-on', decisionContent);
    const after = answered.career.parties.find((party) => party.id === id);
    expect(after?.returnsOn).toBe(before?.returnsOn);
  });
});

describe('sending coin', () => {
  const { career, partyId } = waiting('a-coin');
  const step = answerParty(career, partyId, 'send-coin', decisionContent);

  it('deducts the cost, and says what the coin was for', () => {
    const paid = of(step.events, 'CoinChanged').filter((event) => event.reason === 'sendCoin');
    expect(paid).toHaveLength(1);
    expect(paid[0]?.delta).toBe(-40);
    expect(step.career.guild.coin).toBe(career.guild.coin - 40);
  });

  it('then behaves as pressing on: the displaced Beat fires and the work goes on', () => {
    expect(of(step.events, 'BeatResolved').filter((event) => event.partyId === partyId)).toHaveLength(1);
    expect(step.career.parties.find((party) => party.id === partyId)).toBeDefined();
  });

  it('adjusts the Party’s fixed Backing by effect.backingDelta, within the clamp', () => {
    const before = career.parties.find((party) => party.id === partyId)?.backing ?? 0;
    const after = step.career.parties.find((party) => party.id === partyId)?.backing ?? 0;
    expect(after).toBe(Math.min(career.config.backingMax, before + 1));
  });
});

describe('an option that lengthens or shortens the run', () => {
  const longer = withDecisions({
    ...ASK_THE_GUIDE,
    options: ASK_THE_GUIDE.options.map((option) =>
      option.id === 'press-on'
        ? { ...option, effect: { beatsRemainingDelta: 2 }, consequences: [] }
        : option,
    ),
  });
  const shorter = withDecisions({
    ...ASK_THE_GUIDE,
    options: ASK_THE_GUIDE.options.map((option) =>
      option.id === 'press-on'
        ? { ...option, effect: { beatsRemainingDelta: -99 }, consequences: [] }
        : option,
    ),
  });

  it('lengthens it, and finds Days for the Beats it added', () => {
    const found = aPartyWaiting('a-longer', longer, { decisionChancePerBeat: 1 });
    const was = found.party.commission.beatCount;
    const step = answerParty(found.career, found.party.id, 'press-on', longer);
    const party = step.career.parties.find((entry) => entry.id === found.party.id);
    expect(party?.commission.beatCount).toBe(was + 2);
    // Every Beat still to come has a Day, and every one of them is in the future.
    const left = (party?.commission.beatCount ?? 0) - (party?.beatsResolved.length ?? 0);
    expect(party?.beatDays.filter((day) => day > step.career.day)).toHaveLength(left);
    expect(party?.returnsOn).toBeGreaterThanOrEqual(step.career.day + left);
  });

  it('never shortens it below the work already done plus the Beat being answered', () => {
    const found = aPartyWaiting('a-shorter', shorter, { decisionChancePerBeat: 1 });
    const step = answerParty(found.career, found.party.id, 'press-on', shorter);
    const party = step.career.parties.find((entry) => entry.id === found.party.id);
    // One Beat was resolved before the word and the displaced one has just fired, so the
    // floor is two — and the Commission is over rather than impossible.
    expect(party?.commission.beatCount ?? step.career.recentCommissions[0]?.beatCount).toBe(2);
  });
});

describe('the timeout', () => {
  it('fires on the exact Day, takes the default, and says it was by default', () => {
    const { career, partyId } = waiting('a-timeout', { wordTimeoutDays: 2 });
    const word = career.parties.find((party) => party.id === partyId)?.pendingWord;
    expect(word?.timesOutOn).toBe(career.day + 2);

    const oneDay = advance(career, 1, decisionContent);
    expect(of(oneDay.events, 'PartyAnswered')).toEqual([]);
    expect(awaitingParties(oneDay.career)).toHaveLength(1);

    const twoDays = advance(oneDay.career, 1, decisionContent);
    const answered = of(twoDays.events, 'PartyAnswered')[0];
    expect(answered?.day).toBe(word?.timesOutOn);
    expect(answered?.byDefault).toBe(true);
    expect(answered?.optionId).toBe('press-on');
    expect(awaitingParties(twoDays.career)).toEqual([]);
  });

  it('resolves the displaced Beat on the Day it fires', () => {
    const { career, partyId } = waiting('a-timeout-beat', { wordTimeoutDays: 1 });
    const run = advance(career, 1, decisionContent);
    const beats = of(run.events, 'BeatResolved').filter((event) => event.partyId === partyId);
    expect(beats).toHaveLength(1);
    expect(beats[0]?.beatIndex).toBe(2);
  });

  it('is a stop worth the player’s attention', () => {
    const { career } = waiting('a-timeout-attention', { wordTimeoutDays: 1 });
    const run = advance(career, 1, decisionContent);
    expect(of(run.events, 'PartyAnswered')).toHaveLength(1);
  });

  it('pins wordTimeoutDays at a value its default cannot reproduce', () => {
    const { career, partyId } = waiting('a-timeout-pin', { wordTimeoutDays: 2 });
    expect(career.config.wordTimeoutDays).toBe(2);
    expect(career.parties.find((party) => party.id === partyId)?.pendingWord?.timesOutOn).toBe(
      career.day + 2,
    );
  });
});

describe('answering is deterministic', () => {
  it('gives the same continuation for the same Career and the same option', () => {
    const { career, partyId } = waiting('a-determinism');
    for (const optionId of ['press-on', 'send-coin', 'turn-back']) {
      const once = answerParty(career, partyId, optionId, decisionContent);
      const twice = answerParty(career, partyId, optionId, decisionContent);
      expect(serialiseCareer(once.career), optionId).toBe(serialiseCareer(twice.career));
      expect(once.events, optionId).toEqual(twice.events);
      const onwardOnce = advance(once.career, 60, decisionContent);
      const onwardTwice = advance(twice.career, 60, decisionContent);
      expect(serialiseCareer(onwardOnce.career), optionId).toBe(
        serialiseCareer(onwardTwice.career),
      );
    }
  });

  it('never touches the Career it was given', () => {
    const { career, partyId } = waiting('a-immutable');
    const written = serialiseCareer(career);
    answerParty(career, partyId, 'turn-back', decisionContent);
    expect(serialiseCareer(career)).toBe(written);
  });
});

describe('the Hero the word named', () => {
  it('is still on the Party when the answer comes, however long it waits', () => {
    // They are away on the work, and every rule that could take them — Retirement, the
    // Departure Check, a Rival's retaliation — skips a Hero who is away (E2 §4, E5-S4).
    // No Beat of theirs fires while the Party waits, so no harm can reach them either.
    let taken = 0;
    for (let seed = 0; seed < 60; seed += 1) {
      const sent = sendEverybody(
        openRich(`a-slot-${String(seed)}`, decisionContent, {
          decisionChancePerBeat: 1,
          wordTimeoutDays: 30,
        }),
        decisionContent,
      );
      const found = untilWord(sent.career, decisionContent);
      if (found.party === undefined) continue;
      const wanted = found.party.pendingWord?.slots.heroId ?? '';
      const later = advance(found.career, 20, decisionContent).career;
      const party = later.parties.find((entry) => entry.id === found.party?.id);
      if (party === undefined) continue;
      taken += 1;
      expect(party.heroIds, `seed ${String(seed)}`).toContain(wanted);
      expect(later.guild.roster.some((hero) => hero.id === wanted)).toBe(true);
    }
    expect(taken).toBeGreaterThan(30);
  }, 60_000);
});

describe('the event stream an answer produces', () => {
  it('reports the answer before what it cost', () => {
    const { career, partyId } = waiting('a-order');
    const step = answerParty(career, partyId, 'send-coin', decisionContent);
    const types = step.events.map((event: GameEvent) => event.type);
    expect(types.indexOf('PartyAnswered')).toBeLessThan(types.indexOf('CoinChanged'));
    expect(types[0]).toBe('PartyAnswered');
  });
});

describe('an option that adjusts the Party’s Backing as a Consequence', () => {
  const backingContent = withDecisions({
    ...ASK_THE_GUIDE,
    options: ASK_THE_GUIDE.options.map((option) =>
      option.id === 'press-on'
        ? { ...option, consequences: [{ kind: 'backing', delta: -2 }], effect: {} }
        : option,
    ),
  });

  it('moves it, clamped exactly as a committed Party’s is', () => {
    const found = aPartyWaiting('a-backing', backingContent, { decisionChancePerBeat: 1 });
    const before = found.party.backing;
    const step = answerParty(found.career, found.party.id, 'press-on', backingContent);
    const after = step.career.parties.find((entry) => entry.id === found.party.id)?.backing;
    expect(after).toBe(Math.max(found.career.config.backingMin, before - 2));
  });
});

describe('wordOffer', () => {
  it('answers nothing for a Party that is not waiting, and nothing for an unknown one', () => {
    const opened = openRich('a-offer', decisionContent);
    expect(wordOffer(opened, 'p1.1', decisionContent)).toBeUndefined();
    const sent = sendEverybody(opened, decisionContent);
    expect(wordOffer(sent.career, sent.career.parties[0]?.id ?? '', decisionContent)).toBeUndefined();
  });
});
