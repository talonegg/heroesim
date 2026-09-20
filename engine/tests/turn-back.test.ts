/**
 * E6-S3's third option: bringing a Party home part-way through. The work is not done, but
 * the people are, and everything a return normally settles is settled on the Day they
 * arrive — because there is no second return path (DL-22's first "E6 must know", DL-23 §5).
 */

import { describe, expect, it } from 'vitest';
import {
  advance,
  answerParty,
  REASON_DRIFTED,
  REASON_TALKED_ROUND,
  turnBackFee,
  type Career,
  type GameConfig,
} from '../src/index.js';
import { defaultConfig } from '../src/index.js';
import {
  aPartyWaiting,
  decisionContent,
  edit,
  of,
  openRich,
  sendEverybody,
  untilWord,
} from './e6-fixtures.js';

function waiting(seed: string, config?: Partial<GameConfig>): { career: Career; partyId: string } {
  const found = aPartyWaiting(seed, decisionContent, { decisionChancePerBeat: 1, ...config });
  return { career: found.career, partyId: found.party.id };
}

describe('the fee a Commission called off part-way through pays', () => {
  it('is the fee scaled by the share of the work done, at four Beats', () => {
    // A table, so the arithmetic is pinned rather than inferred from a played Career.
    const fee = 100;
    const table: { score: number; paid: number }[] = [
      { score: 0, paid: 0 },
      { score: 1, paid: 25 },
      { score: 3, paid: 75 },
    ];
    for (const row of table) {
      expect(turnBackFee(fee, row.score, 4, defaultConfig), `score ${String(row.score)}`).toBe(
        row.paid,
      );
    }
  });

  it('is never below nothing, however badly the work went', () => {
    expect(turnBackFee(100, -3, 4, defaultConfig)).toBe(0);
    expect(turnBackFee(100, -1, 3, defaultConfig)).toBe(0);
  });

  it('is scaled by turnBackFeeFactor, which the default cannot reproduce', () => {
    const half: GameConfig = { ...defaultConfig, turnBackFeeFactor: 0.5 };
    expect(turnBackFee(100, 1, 4, half)).toBe(13);
    expect(turnBackFee(100, 3, 4, half)).toBe(38);
    const nothing: GameConfig = { ...defaultConfig, turnBackFeeFactor: 0 };
    expect(turnBackFee(100, 3, 4, nothing)).toBe(0);
  });

  it('is what the Party is actually paid on the Day it comes home', () => {
    const { career, partyId } = waiting('t-fee', { turnBackFeeFactor: 0.5 });
    const party = career.parties.find((entry) => entry.id === partyId);
    if (party === undefined) throw new Error('expected a Party');
    const step = answerParty(career, partyId, 'turn-back', decisionContent);
    const home = advance(step.career, career.config.turnBackTravelDays, decisionContent);
    const returned = of(home.events, 'PartyReturned').find((event) => event.partyId === partyId);
    expect(returned?.succeeded).toBe(false);
    expect(returned?.feePaid).toBe(
      turnBackFee(
        party.commission.fee,
        step.career.parties.find((entry) => entry.id === partyId)?.score ?? 0,
        party.commission.beatCount,
        home.career.config,
      ),
    );
    // And the coin actually landed.
    const paid = of(home.events, 'CoinChanged').filter((event) => event.reason === 'fee');
    if ((returned?.feePaid ?? 0) > 0) expect(paid[0]?.delta).toBe(returned?.feePaid);
  });
});

describe('turning back', () => {
  const { career, partyId } = waiting('t-basic');
  const step = answerParty(career, partyId, 'turn-back', decisionContent);
  const party = step.career.parties.find((entry) => entry.id === partyId);

  it('reports it, with how much of the work had been done', () => {
    const told = of(step.events, 'PartyTurnedBack')[0];
    expect(told?.partyId).toBe(partyId);
    expect(told?.beatsResolved).toBe(1);
    expect(told?.beatCount).toBe(party?.commission.beatCount);
  });

  it('sets the return for turnBackTravelDays from now, and marks the Day', () => {
    expect(party?.turnedBackOn).toBe(step.career.day);
    expect(party?.returnsOn).toBe(step.career.day + step.career.config.turnBackTravelDays);
  });

  it('skips the remaining Beats, and resolves none of its own', () => {
    expect(of(step.events, 'BeatResolved')).toEqual([]);
    expect(party?.beatDays.filter((day) => day >= step.career.day)).toEqual([]);
  });

  it('counts once in the ledger, and as a Commission that failed', () => {
    const home = advance(step.career, 40, decisionContent);
    expect(home.career.ledger.turnedBack).toBe(1);
    expect(of(home.events, 'PartyTurnedBack')).toEqual([]);
    expect(home.career.ledger.commissionsFailed).toBeGreaterThan(0);
  });

  it('pins turnBackTravelDays at a value its default cannot reproduce', () => {
    const slow = waiting('t-travel', { turnBackTravelDays: 4 });
    const called = answerParty(slow.career, slow.partyId, 'turn-back', decisionContent);
    const going = called.career.parties.find((entry) => entry.id === slow.partyId);
    expect(going?.returnsOn).toBe(called.career.day + 4);
    const tooSoon = advance(called.career, 3, decisionContent);
    expect(of(tooSoon.events, 'PartyReturned').filter((event) => event.partyId === slow.partyId)).toEqual(
      [],
    );
    const home = advance(tooSoon.career, 1, decisionContent);
    expect(of(home.events, 'PartyReturned').some((event) => event.partyId === slow.partyId)).toBe(
      true,
    );
  });
});

describe('no further Beats, therefore no further harm', () => {
  it('cannot injure, scar or kill anybody after the word goes back', () => {
    // Harm comes from a failed Check and from nowhere else (E3-S1), so a Party with no
    // Beats left to resolve cannot be hurt. Proved over a fleet, at the harshest settings
    // the config allows, so it is not one lucky seed.
    const cruel = {
      decisionChancePerBeat: 1,
      injuryChanceOnFailure: 1,
      scarChanceOnCriticalFailure: 1,
      deathChanceOnCriticalFailure: 0.5,
    };
    let turnedBack = 0;
    for (let seed = 0; seed < 40; seed += 1) {
      const sent = sendEverybody(
        openRich(`t-harm-${String(seed)}`, decisionContent, cruel),
        decisionContent,
      );
      const found = untilWord(sent.career, decisionContent);
      if (found.party === undefined) continue;
      turnedBack += 1;
      const step = answerParty(found.career, found.party.id, 'turn-back', decisionContent);
      const who = new Set(found.party.heroIds);
      const after = advance(step.career, 40, decisionContent);
      for (const event of [...step.events, ...after.events]) {
        if (event.type === 'HeroInjured' || event.type === 'HeroScarred' || event.type === 'HeroDied') {
          expect(who.has(event.heroId), `seed ${String(seed)}: ${event.type}`).toBe(false);
        }
      }
    }
    expect(turnedBack).toBeGreaterThan(20);
  }, 60_000);
});

describe('everything a return settles is settled for a Party that turned back', () => {
  /** A turned-back Party whose Heroes are in whatever state the caller sets. */
  function comingHome(seed: string, set: (draft: Career) => void, config?: Partial<GameConfig>) {
    const { career, partyId } = waiting(seed, config);
    const staged = edit(career, set);
    const called = answerParty(staged, partyId, 'turn-back', decisionContent);
    const travel = called.career.config.turnBackTravelDays;
    return { partyId, called, home: advance(called.career, travel, decisionContent) };
  }

  it('retires a Hero who has reached the age, on the Day they arrive (E3)', () => {
    const { called, home } = comingHome('t-retire', (draft) => {
      const hero = draft.guild.roster[0];
      if (hero !== undefined) hero.age = draft.config.heroRetirementAge + 1;
    });
    const who = called.career.parties[0]?.heroIds ?? [];
    const retired = of(home.events, 'HeroRetired');
    expect(retired.length).toBeGreaterThan(0);
    expect(who).toContain(retired[0]?.heroId);
    expect(retired[0]?.day).toBe(home.career.day);
  });

  it('puts them back within reach of Regard drift, which skips a Hero who is away (E2)', () => {
    // Drift runs at a Board refresh and skips anybody out on work (`decayRegard`), so what
    // coming home early restores is their place in it: they are drifted at the next
    // refresh like anybody else at home, rather than being skipped for ever.
    const { called, home } = comingHome('t-drift', (draft) => {
      for (const hero of draft.guild.roster) {
        hero.lastCommittedOn = -1000;
        hero.regardDecayedOn = -1000;
      }
    });
    const who = new Set(called.career.parties[0]?.heroIds ?? []);
    expect(home.career.parties.some((party) => party.id === called.career.parties[0]?.id)).toBe(
      false,
    );
    const refresh = home.career.config.boardRefreshEveryDays;
    const onward = advance(home.career, refresh, decisionContent);
    const drifted = of(onward.events, 'HeroRegardForGuildmasterChanged').filter(
      (event) => event.reason === REASON_DRIFTED && who.has(event.heroId),
    );
    expect(drifted.length).toBeGreaterThan(0);
  });

  it('takes the Departure Check for them, on the Day they arrive (E2)', () => {
    const { called, home } = comingHome('t-departure', (draft) => {
      for (const hero of draft.guild.roster) {
        hero.regardForGuildmaster = {
          ...hero.regardForGuildmaster,
          value: draft.config.departureRegardThreshold,
        };
      }
    });
    const who = new Set(called.career.parties[0]?.heroIds ?? []);
    // Either they were talked round or they walked out: both are the Check having run.
    const checked = [
      ...of(home.events, 'HeroDeparted').filter((event) => who.has(event.heroId)),
      ...of(home.events, 'HeroRegardForGuildmasterChanged').filter(
        (event) => who.has(event.heroId) && event.reason === REASON_TALKED_ROUND,
      ),
    ];
    expect(checked.length).toBeGreaterThan(0);
  });

  it('lets a soured Rival take one of them, on the Day they arrive (E5)', () => {
    const { called, home } = comingHome('t-retaliation', (draft) => {
      for (const rival of draft.rivals) {
        rival.regardForGuild = { ...rival.regardForGuild, value: draft.config.regardMin };
      }
      for (const hero of draft.guild.roster) {
        hero.regardForGuildmaster = {
          ...hero.regardForGuildmaster,
          value: draft.config.poachRegardThreshold,
        };
      }
    });
    const who = new Set(called.career.parties[0]?.heroIds ?? []);
    const taken = of(home.events, 'RivalPoachedHero').filter((event) => who.has(event.heroId));
    expect(taken.length).toBeGreaterThan(0);
  });

  it('settles a Board-refresh arrival exactly once', () => {
    // The Day a turned-back Party lands on a refresh Day is the one an old bug would have
    // settled twice — once for coming home and once for the refresh (DL-22).
    const { career, partyId } = waiting('t-refresh', { wordTimeoutDays: 90 });
    const party = career.parties.find((entry) => entry.id === partyId);
    if (party === undefined) throw new Error('expected a Party');
    const travel = career.config.turnBackTravelDays;
    const refresh = career.config.boardRefreshEveryDays;
    // Wait until the Day on which turning back lands exactly on a refresh Day.
    let held = career;
    for (let step = 0; step < refresh + 2; step += 1) {
      if ((held.day + travel) % refresh === 0) break;
      held = advance(held, 1, decisionContent).career;
    }
    expect((held.day + travel) % refresh).toBe(0);
    const staged = edit(held, (draft) => {
      for (const hero of draft.guild.roster) hero.age = draft.config.heroRetirementAge + 1;
    });
    const called = answerParty(staged, partyId, 'turn-back', decisionContent);
    const home = advance(called.career, travel, decisionContent);
    expect(home.career.day % refresh).toBe(0);
    const retired = of(home.events, 'HeroRetired');
    const ids = retired.map((event) => event.heroId);
    expect(new Set(ids).size, 'nobody retired twice').toBe(ids.length);
  });
});
