/**
 * E4-S4: they come back. A Hero who walked out (E2) is the most interesting Applicant
 * there is — they arrive with their Traits, their Scars and their age brought forward,
 * and they remember exactly why they went.
 *
 * Death and Retirement never return, which is the assertion the epic asks for and the
 * only thing standing between "a Hero left" and "nobody ever really leaves".
 */

import { describe, expect, it } from 'vitest';
import { advance } from '../src/career.js';
import { acceptApplicant, declineApplicant, REASON_CAME_BACK } from '../src/applicant.js';
import type { GameConfig } from '../src/config.js';
import type { GameEvent } from '../src/events.js';
import { deserialiseCareer, serialiseCareer } from '../src/save.js';
import { isInjured } from '../src/state.js';
import type { Applicant, Career } from '../src/types.js';
import { newCareer } from '../src/world.js';
import { autoPlay, fixtureContent, gone, holdingCoin, patronsThinking, walkedOut } from './fixtures.js';

const content = fixtureContent;

/** Rich, and certain: every eligible former Hero takes a slot the moment they may. */
const SURELY: Partial<GameConfig> = { startingCoin: 1_000_000, returnAsApplicantChance: 1 };

function returners(career: Career): Applicant[] {
  return career.applicants.filter((applicant) => applicant.formerHeroId !== undefined);
}

function arrivalDays(events: readonly GameEvent[]): number[] {
  return events.filter((event) => event.type === 'ApplicantsArrived').map((event) => event.day);
}

/** A Career in which one Hero walked out on `onDay`, and nobody else has gone. */
function afterADeparture(seed: string, onDay: number, config?: Partial<GameConfig>): Career {
  const opened = newCareer(seed, content, { ...SURELY, ...config }).career;
  const hero = opened.guild.roster[0];
  if (hero === undefined) throw new Error('the test expected a Roster');
  return walkedOut(opened, hero.id, onDay);
}

describe('the cooldown', () => {
  it('pins the earliest Day somebody who walked out can be asking again', () => {
    const career = afterADeparture('cooldown', 1);
    const cooldown = career.config.returnCooldownDays;
    const interval = career.config.applicantsEveryDaysBelowFloor;
    // Three Heroes left, which is below `rosterFloor`, so batches come every ten Days.
    expect(career.guild.roster).toHaveLength(3);
    expect(cooldown).toBe(60);
    expect(interval).toBe(10);

    const run = advance(career, 100, content);
    const back = run.events.filter(
      (event) => event.type === 'ApplicantsArrived' && event.applicantIds.includes('h1'),
    );
    // Day 60 is the first arrival Day on which `day − exit.onDay` reaches the cooldown:
    // 60 − 1 = 59 falls short, so it is Day 70, and a test that only asserted "after the
    // cooldown" would not have caught the difference.
    // Day 70, and then again on Day 90: their first offer runs out at the start of that
    // Day, which puts them back among the former Heroes who could be asked again.
    expect(back.map((event) => event.day)).toEqual([70, 90]);
    expect(arrivalDays(run.events)).toEqual([10, 20, 30, 40, 50, 60, 70, 80, 90, 100]);
  });

  it('is never shortened, on any Day a batch arrives', () => {
    for (const onDay of [1, 3, 11, 25]) {
      const career = afterADeparture(`cooldown-${onDay}`, onDay);
      const run = advance(career, 200, content);
      const first = run.events.find(
        (event) => event.type === 'ApplicantsArrived' && event.applicantIds.includes('h1'),
      );
      expect(first, `a Departure on Day ${onDay}`).toBeDefined();
      expect((first?.day ?? 0) - onDay).toBeGreaterThanOrEqual(career.config.returnCooldownDays);
    }
  });

  it('moves with the configured cooldown and with nothing else', () => {
    const soon = advance(afterADeparture('cooldown-short', 1, { returnCooldownDays: 20 }), 100, content);
    const firstSoon = soon.events.find(
      (event) => event.type === 'ApplicantsArrived' && event.applicantIds.includes('h1'),
    );
    expect(firstSoon?.day).toBe(30);

    const never = advance(afterADeparture('cooldown-never', 1, { returnCooldownDays: 10_000 }), 400, content);
    expect(returners(never.career)).toEqual([]);
  });

  it('never fires at all when the chance is zero, and always when it is one', () => {
    const cold = advance(afterADeparture('chance-nil', 1, { returnAsApplicantChance: 0 }), 400, content);
    expect(returners(cold.career)).toEqual([]);
    for (const event of cold.events) {
      if (event.type === 'ApplicantsArrived') expect(event.applicantIds).not.toContain('h1');
    }

    const warm = advance(afterADeparture('chance-sure', 1), 70, content);
    expect(returners(warm.career).map((applicant) => applicant.id)).toEqual(['h1']);
  });
});

describe('somebody coming back', () => {
  const start = afterADeparture('returner', 1);
  const run = advance(start, 70, content);
  const back = returners(run.career)[0];
  const before = start.guild.formerHeroes.find((hero) => hero.id === 'h1');

  it('is the person who left, under the id they left with', () => {
    expect(back, 'the test expected a returner').toBeDefined();
    expect(back?.id).toBe('h1');
    expect(back?.formerHeroId).toBe('h1');
    expect(back?.name).toBe(before?.name);
    expect(back?.pronouns).toBe(before?.pronouns);
    expect(back?.stats).toEqual(before?.stats);
    expect(back?.background).toBe(before?.background);
    // And they are in exactly two places: still readable in the Guild's history, and
    // standing in the Hall waiting for an answer (DL-19 §2).
    expect(run.career.guild.formerHeroes.map((hero) => hero.id)).toContain('h1');
    expect(run.career.guild.roster.map((hero) => hero.id)).not.toContain('h1');
  });

  it('takes one of the batch’s slots rather than adding to it', () => {
    const arrival = run.events.find(
      (event) => event.type === 'ApplicantsArrived' && event.applicantIds.includes('h1'),
    );
    if (arrival?.type !== 'ApplicantsArrived') throw new Error('the test expected the batch');
    expect(arrival.applicantIds).toHaveLength(run.career.config.applicantBatchMax);
    expect(arrival.applicantIds[0]).toBe('h1');
    // `ApplicantsArrived` does not distinguish returners: the offer itself does (E4-S4).
    expect(Object.keys(arrival).sort()).toEqual(
      ['type', 'day', 'applicantIds', 'calibres', 'expiresOn'].sort(),
    );
  });

  it('brings their age forward by the whole years since they went', () => {
    const early = afterADeparture('aged', 1, { daysPerYear: 30 });
    const veteran = early.guild.formerHeroes[0];
    if (veteran === undefined) throw new Error('the test expected a former Hero');
    const played = advance(early, 80, content);
    const asking = returners(played.career)[0];
    expect(asking, 'the veteran should have come back').toBeDefined();
    // Gone on Day 1, back on Day 70, at thirty Days to the year: two whole years older.
    expect(asking?.arrivedOn).toBe(70);
    expect(asking?.age).toBe(veteran.age + 2);
    // Never re-derived from the id, which would hand them the age they *started* at.
    expect(asking?.age).not.toBe(veteran.age);
  });

  it('is never handed the age the seed would have started them at', () => {
    // The defect this test exists to catch: `startingAge(seed, 'h1', config)` is what
    // world generation gave them, and re-deriving it here would silently undo every
    // birthday they ever had (DL-17, DL-19 §6).
    const early = afterADeparture('not-re-derived', 1, { daysPerYear: 30 });
    const veteran = early.guild.formerHeroes[0];
    if (veteran === undefined) throw new Error('the test expected a former Hero');
    const wasGiven = veteran.age;
    veteran.age = wasGiven + 17;
    const played = advance(early, 80, content);
    const asking = returners(played.career)[0];
    expect(asking?.age).toBe(wasGiven + 17 + 2);
    expect(asking?.age).not.toBe(wasGiven);
  });

  it('keeps their Scars, and an Injury that has not run out keeps its own Day', () => {
    const start = afterADeparture('scarred', 1);
    const veteran = start.guild.formerHeroes[0];
    if (veteran === undefined) throw new Error('the test expected a former Hero');
    veteran.traits = [
      { name: 'Never the water', since: 1 },
      { name: 'Bruised', since: 65, liftsOn: 95 },
      { name: 'Cut hand', since: 20, liftsOn: 40 },
    ];
    const played = advance(start, 70, content);
    const asking = returners(played.career)[0];
    expect(asking?.traits).toEqual([
      { name: 'Never the water', since: 1 },
      // Unexpired, so it keeps its original `liftsOn` and they may join still hurt.
      { name: 'Bruised', since: 65, liftsOn: 95 },
      // The one whose Day passed while they were away healed; it does not come back.
    ]);

    const taken = acceptApplicant(holdingCoin(played.career, 10_000), 'h1');
    const rejoined = taken.career.guild.roster.find((hero) => hero.id === 'h1');
    expect(rejoined?.traits.map((trait) => trait.name)).toEqual(['Never the water', 'Bruised']);
    expect(isInjured(rejoined ?? { traits: [] } as never)).toBe(true);
    // Still injured, so the shortcut `availableHeroes` takes leaves them out (DL-16 §5).
    expect(taken.career.guild.roster.filter((hero) => isInjured(hero)).map((h) => h.id)).toEqual([
      'h1',
    ]);
    const lifted = advance(taken.career, 95 - taken.career.day, content);
    expect(lifted.events.some((event) => event.type === 'InjuryLifted' && event.heroId === 'h1')).toBe(
      true,
    );
  });

  it('may come back carrying a Scar that refuses everything, and the Guild bears it', () => {
    const start = afterADeparture('worn', 1);
    const veteran = start.guild.formerHeroes[0];
    if (veteran === undefined) throw new Error('the test expected a former Hero');
    veteran.traits = [{ name: 'Worn', since: 30 }];
    const played = advance(start, 70, content);
    const taken = acceptApplicant(holdingCoin(played.career, 10_000), 'h1');
    expect(taken.career.guild.roster.find((hero) => hero.id === 'h1')?.traits).toEqual([
      { name: 'Worn', since: 30 },
    ]);
    // The Career goes on; a Roster place spent on somebody who will not work is an
    // opportunity cost, not a crash (DL-17 §4).
    expect(autoPlay(taken.career, content).ended).toBeDefined();
  });
});

describe('taking somebody back', () => {
  const start = afterADeparture('taken-back', 1);
  const run = advance(start, 70, content);
  const step = acceptApplicant(run.career, 'h1');
  const rejoined = step.career.guild.roster.find((hero) => hero.id === 'h1');

  it('sets the returning Regard, with the reason recorded', () => {
    expect(rejoined?.regardForGuildmaster.value).toBe(step.career.config.returningRegard);
    expect(rejoined?.regardForGuildmaster.reason).toBe(REASON_CAME_BACK);
    expect(rejoined?.formerHeroId).toBe('h1');
    expect(rejoined?.joinedOn).toBe(step.career.day);
  });

  it('takes them out of formerHeroes, so they are in one place only', () => {
    expect(run.career.guild.formerHeroes.map((hero) => hero.id)).toContain('h1');
    expect(step.career.guild.formerHeroes.map((hero) => hero.id)).not.toContain('h1');
    expect(step.career.applicants.map((entry) => entry.id)).not.toContain('h1');
    expect(step.career.guild.roster.filter((hero) => hero.id === 'h1')).toHaveLength(1);
  });

  it('says on HeroJoined who it was that came back', () => {
    const joined = step.events.find((event) => event.type === 'HeroJoined');
    if (joined?.type !== 'HeroJoined') throw new Error('the test expected HeroJoined');
    expect(joined.formerHeroId).toBe('h1');
    expect(joined.heroId).toBe('h1');
    expect(step.events.map((event) => event.type)).toEqual([
      'ApplicantAccepted',
      'CoinChanged',
      'HeroJoined',
    ]);
  });

  it('remembers who they used to work with, and meets whoever is new', () => {
    const departed = start.guild.formerHeroes.find((hero) => hero.id === 'h1');
    const remembered = Object.entries(departed?.regardFor ?? {});
    expect(remembered.length).toBeGreaterThan(0);
    for (const [id, regard] of remembered) {
      expect(rejoined?.regardFor[id], `what they still think of ${id}`).toEqual(regard);
    }
    for (const hero of run.career.guild.roster) {
      expect(rejoined?.regardFor[hero.id]).toBeDefined();
      expect(
        step.career.guild.roster.find((entry) => entry.id === hero.id)?.regardFor['h1'],
      ).toBeDefined();
    }
  });

  it('counts as an offer in the ledger the moment they arrive, and as a returner only once taken on', () => {
    // Before acceptance: offered, but nobody has come back yet (finding C7).
    expect(run.career.ledger.returnersOffered).toBeGreaterThan(0);
    expect(run.career.ledger.returners).toBe(0);
    // After acceptance: the offer is still on the books, and now somebody has come back.
    expect(step.career.ledger.returnersOffered).toBe(run.career.ledger.returnersOffered);
    expect(step.career.ledger.returners).toBe(1);
    expect(step.career.ledger.applicantsAccepted).toBe(1);
    const played = autoPlay(step.career, content);
    expect(played.ended?.reckoning.heroesRecruited).toBe(played.ledger.applicantsAccepted);
  });
});

describe('one person offered again and again, never accepted (finding C7)', () => {
  it('runs returnersOffered up to the number of offers, and leaves returners at nobody', () => {
    // The exact scenario the finding measured: one Hero walks out, and at
    // `returnAsApplicantChance: 1` is offered every time the cooldown and the expiry
    // cycle allow it, over 200 Days, and never accepted.
    const start = afterADeparture('c7-repeated-offer', 1);
    const run = advance(start, 200, content);
    const offers = run.events.filter(
      (event) => event.type === 'ApplicantsArrived' && event.applicantIds.includes('h1'),
    );
    // Pinned: cooldown 60 puts the first offer on Day 70 (DL-19 §4's expiry-then-arrival
    // rule makes every cycle after that exactly `applicantLingerDays` (20) apart), so the
    // seventh and last offer inside 200 Days falls on Day 190 and an eighth would need
    // Day 210. Before this fix, each of these seven offers incremented `ledger.returners`
    // for a person who was never taken on — the defect this test exists to catch.
    expect(offers.map((event) => event.day)).toEqual([70, 90, 110, 130, 150, 170, 190]);
    expect(run.career.ledger.returnersOffered).toBe(7);
    expect(run.career.ledger.returners).toBe(0);

    const taken = acceptApplicant(run.career, 'h1');
    expect(taken.career.ledger.returners).toBe(1);
    // Accepting is not another offer: the count of offers already made does not move.
    expect(taken.career.ledger.returnersOffered).toBe(7);
  });
});

describe('an offer that is not taken', () => {
  it('leaves somebody who walked out where they were, to be offered again later', () => {
    const start = afterADeparture('declined-returner', 1);
    const run = advance(start, 70, content);
    const declined = declineApplicant(run.career, 'h1');
    expect(declined.career.applicants.map((entry) => entry.id)).not.toContain('h1');
    expect(declined.career.guild.formerHeroes.map((hero) => hero.id)).toContain('h1');

    const later = advance(declined.career, 20, content);
    expect(returners(later.career).map((entry) => entry.id)).toContain('h1');
  });

  it('leaves them there when they give up waiting, too', () => {
    const start = afterADeparture('expired-returner', 1);
    const run = advance(start, 70 + start.config.applicantLingerDays, content);
    expect(
      run.events.some(
        (event) =>
          event.type === 'ApplicantDeclined' &&
          event.applicantId === 'h1' &&
          event.reason === 'expired',
      ),
    ).toBe(true);
    expect(run.career.guild.formerHeroes.map((hero) => hero.id)).toContain('h1');
    const later = advance(run.career, 20, content);
    expect(returners(later.career).map((entry) => entry.id)).toContain('h1');
  });

  it('never offers the same person twice at once, or twice in one batch', () => {
    const start = afterADeparture('twice', 1);
    let career = start;
    for (let step = 0; step < 300; step += 1) {
      career = advance(career, 1, content).career;
      if (career.ended !== undefined) break;
      const ids = career.applicants.map((entry) => entry.id);
      expect(new Set(ids).size, `Day ${career.day}`).toBe(ids.length);
      expect(ids.filter((id) => id === 'h1').length, `Day ${career.day}`).toBeLessThanOrEqual(1);
    }
  });
});

describe('the dead and the retired', () => {
  it('never appear in career.applicants, across two hundred seeds', () => {
    for (let seed = 0; seed < 200; seed += 1) {
      const opened = newCareer(`no-return-${seed}`, content, SURELY).career;
      const ids = opened.guild.roster.map((hero) => hero.id);
      if (ids.length < 3) throw new Error('the test expected a Roster');
      // One of each of the three ways out, so the rule is being tested against a Career
      // that holds all of them at once.
      let world = walkedOut(opened, ids[0] ?? '', 1);
      world = gone(world, ids[1] ?? '', 'death', 1);
      world = gone(world, ids[2] ?? '', 'retirement', 1);
      const run = advance(world, 200, content);

      const everyone = new Set<string>();
      for (const event of run.events) {
        if (event.type === 'ApplicantsArrived') for (const id of event.applicantIds) everyone.add(id);
      }
      expect(everyone.has(ids[1] ?? ''), `seed ${seed}: the dead came back`).toBe(false);
      expect(everyone.has(ids[2] ?? ''), `seed ${seed}: the retired came back`).toBe(false);
      expect(everyone.has(ids[0] ?? ''), `seed ${seed}: the one who walked out did not`).toBe(true);
      for (const applicant of run.career.applicants) {
        expect(applicant.formerHeroId ?? ids[0]).not.toBe(ids[1]);
        expect(applicant.formerHeroId ?? ids[0]).not.toBe(ids[2]);
      }
      // And the two who cannot come back are still readable in the Guild's history.
      const history = run.career.guild.formerHeroes.map((hero) => hero.id);
      expect(history).toContain(ids[1]);
      expect(history).toContain(ids[2]);
    }
  });
});

describe('a returner and the save', () => {
  it('round-trips with their Traits, their age and the id they left with', () => {
    const run = advance(afterADeparture('returner-save', 1), 70, content);
    expect(returners(run.career)).toHaveLength(1);
    const loaded = deserialiseCareer(serialiseCareer(run.career));
    expect(loaded).toEqual(run.career);
    expect(loaded.applicants.find((entry) => entry.id === 'h1')?.formerHeroId).toBe('h1');
    expect(serialiseCareer(loaded)).toBe(serialiseCareer(run.career));

    const taken = acceptApplicant(loaded, 'h1');
    expect(deserialiseCareer(serialiseCareer(taken.career))).toEqual(taken.career);
    expect(
      deserialiseCareer(serialiseCareer(taken.career)).guild.roster.find((hero) => hero.id === 'h1')
        ?.formerHeroId,
    ).toBe('h1');
  });
});

describe('Standing and a returner', () => {
  it('does not stop somebody coming back to a Guild nobody thinks much of', () => {
    const start = patronsThinking(afterADeparture('low-standing-return', 1), -5);
    const run = advance(start, 70, content);
    expect(returners(run.career).map((entry) => entry.id)).toEqual(['h1']);
    expect(returners(run.career)[0]?.calibre).toBe(1);
  });
});
