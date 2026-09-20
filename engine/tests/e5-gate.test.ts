/**
 * E5's gate: *a Career in which the player Transfers one Hero, Poaches another, and loses
 * one to a soured Rival's retaliation.*
 *
 * Nothing is arranged. The Career is opened from a seed at the shipped defaults and played
 * to its end through the public API by a policy that answers the door, buys the Hall and
 * — once each — brings somebody over above board and takes somebody who had had enough of
 * the Guild paying them. The retaliation is not arranged at all: it is what the poaching
 * costs, and it falls on whichever of the player's own Heroes has been left alone longest.
 *
 * Beneath the gate sit the definition of done and the smoke run: two hundred Careers
 * checked at every state a player could observe, and twenty-five checked on every single
 * Day, against every invariant E5 adds.
 */

import { describe, expect, it } from 'vitest';
import {
  acceptApplicant,
  acceptRefusal,
  advance,
  advanceUntilAttention,
  availableHeroes,
  commitParty,
  employerRegard,
  hallCost,
  HALL_IMPROVEMENTS,
  improveHall,
  league,
  newCareer,
  poachHero,
  proposeParty,
  rivalOffers,
  serialiseCareer,
  transferHero,
  type AnyHero,
  type Career,
  type GameEvent,
  type Hero,
  type Step,
} from '../src/index.js';
import { fixtureContent } from './fixtures.js';

const content = fixtureContent;
const strength = (hero: Hero): number =>
  hero.stats.Might + hero.stats.Craft + hero.stats.Nerve + hero.stats.Guile;

function of<T extends GameEvent['type']>(
  events: readonly GameEvent[],
  type: T,
): Extract<GameEvent, { type: T }>[] {
  return events.filter((event): event is Extract<GameEvent, { type: T }> => event.type === type);
}

/** What the policy is allowed to do about the other Guilds. */
interface Appetite {
  /** How many Heroes it will bring over above board, over the whole Career. */
  transfers: number;
  /** How many it will take without asking. */
  poaches: number;
  /**
   * How large a Roster it will recruit to. Eight by default, which is where DL-20 §3
   * measured the sweet spot — and, for this file, which leaves room on the Roster for
   * somebody to be brought over at all.
   */
  recruitTo?: number;
  /**
   * Ask for a move whether or not the engine says it would go through. The player's own
   * finger on the key: it is how a refusal is produced at all, since a front end reading
   * `rivalOffers` would never ask for one.
   */
  askAnyway?: boolean;
}

/**
 * The E4 policy with one addition: it deals with the other Guilds. It brings somebody over
 * when it can comfortably afford to and takes somebody who has had enough of the Guild
 * paying them when it can, keeping a full `startingCoin` of runway back either way — so
 * neither is ever what makes it insolvent, and what the poaching costs is felt on the
 * Board rather than in the purse.
 *
 * @param watch called with every Career this policy ever sees, which is every state a
 * player could observe: after each action, and at each attention stop.
 */
function play(
  start: Career,
  appetite: Appetite,
  watch?: (career: Career, events: readonly GameEvent[]) => void,
): { career: Career; events: GameEvent[] } {
  let career = start;
  const events: GameEvent[] = [];
  let transfersLeft = appetite.transfers;
  let poachesLeft = appetite.poaches;
  const recruitTo = appetite.recruitTo ?? start.config.rosterFloor + 2;
  let guard = 0;

  const take = (step: Step): void => {
    career = step.career;
    events.push(...step.events);
    watch?.(career, step.events);
  };

  while (career.ended === undefined) {
    guard += 1;
    if (guard > 100_000) throw new Error('the policy never reached the end of the Career');

    for (const applicant of [...career.applicants]) {
      if (career.guild.roster.length >= recruitTo) break;
      if (acceptRefusal(career, applicant.id) !== undefined) continue;
      const shortHanded = career.guild.roster.length < career.config.rosterFloor;
      if (!shortHanded && career.guild.coin < applicant.askingFee + career.config.startingCoin) {
        continue;
      }
      take(acceptApplicant(career, applicant.id));
    }

    for (const improvement of HALL_IMPROVEMENTS) {
      if (career.guild.hall.includes(improvement)) continue;
      if (career.guild.coin < hallCost(improvement, career.config) + career.config.startingCoin) {
        continue;
      }
      take(improveHall(career, improvement));
    }

    // The other Guilds. Cheapest first in both cases, and only with runway to spare.
    for (const rival of career.rivals) {
      if (poachesLeft <= 0 && transfersLeft <= 0) break;
      const offers = rivalOffers(career, rival.id);
      const ask = appetite.askAnyway === true;
      if (poachesLeft > 0) {
        const takeable = offers
          .filter((offer) => ask || offer.poachRefusal === undefined)
          .sort((one, other) => one.poachFee - other.poachFee)[0];
        if (
          takeable !== undefined &&
          (ask || career.guild.coin >= takeable.poachFee + career.config.startingCoin)
        ) {
          const step = poachHero(career, rival.id, takeable.hero.id);
          take(step);
          if (of(step.events, 'HeroPoached').length > 0) {
            poachesLeft -= 1;
            continue;
          }
        }
      }
      if (transfersLeft > 0) {
        const buyable = offers
          .filter((offer) => ask || offer.transferRefusal === undefined)
          .sort((one, other) => one.transferFee - other.transferFee)[0];
        if (
          buyable !== undefined &&
          (ask || career.guild.coin >= buyable.transferFee + career.config.startingCoin)
        ) {
          const step = transferHero(career, rival.id, buyable.hero.id);
          take(step);
          if (of(step.events, 'HeroTransferred').length > 0) transfersLeft -= 1;
        }
      }
    }

    const free = [...availableHeroes(career)].sort((one, other) => strength(other) - strength(one));
    const used = new Set<string>();
    for (const commission of [...career.board].sort((one, other) => other.fee - one.fee)) {
      const left = free.filter((hero) => !used.has(hero.id));
      if (left.length === 0) break;
      const refusing = new Set(
        proposeParty(
          career,
          commission.id,
          left.map((hero) => hero.id),
          content,
        ).refusals.map((refusal) => refusal.heroId),
      );
      const party = left
        .filter((hero) => !refusing.has(hero.id))
        .slice(0, 2)
        .map((hero) => hero.id);
      if (party.length === 0) continue;
      take(commitParty(career, commission.id, party, content));
      for (const id of party) used.add(id);
    }

    take(advanceUntilAttention(career, content));
  }
  return { career, events };
}

describe('the E5 gate, on one fixed seed', () => {
  const opened = newCareer('e5-gate-1', content);
  const run = play(opened.career, { transfers: 1, poaches: 1 });
  const all = [...opened.events, ...run.events];

  it('brings one Hero over above board, and the Rival is not wronged by it', () => {
    const transferred = of(all, 'HeroTransferred');
    expect(transferred).toHaveLength(1);
    const one = transferred[0];
    if (one === undefined) throw new Error('the test expected a Transfer');
    expect(one.fee).toBeGreaterThan(0);
    // Their Regard for the Guild never moved for it. The only thing that soured anybody in
    // this Career is the Poaching below.
    const soured = of(all, 'HeroPoached').map((event) => event.fromRivalId);
    if (!soured.includes(one.fromRivalId)) {
      expect(
        run.career.rivals.find((rival) => rival.id === one.fromRivalId)?.regardForGuild.value,
      ).toBe(opened.career.config.rivalStartingRegard);
    }
  });

  it('takes one without asking, and pays for it in the other Guild’s goodwill', () => {
    const poached = of(all, 'HeroPoached');
    expect(poached).toHaveLength(1);
    const one = poached[0];
    if (one === undefined) throw new Error('the test expected a Poaching');
    expect(one.rivalRegardDelta).toBe(-opened.career.config.poachRivalRegardCost);
    expect(one.rivalRegardValue).toBeLessThanOrEqual(opened.career.config.souredRivalThreshold);
    // Cheaper than the Transfer of the same Career, which is the bargain being struck.
    expect(one.fee).toBeLessThan(of(all, 'HeroTransferred')[0]?.fee ?? 0);
  });

  it('loses one to that soured Rival’s retaliation, and never to a Regard it had not watched fall', () => {
    const taken = of(all, 'RivalPoachedHero');
    expect(taken.length).toBeGreaterThan(0);
    for (const event of taken) {
      expect(event.regardValue).toBeLessThanOrEqual(opened.career.config.poachRegardThreshold);
    }
    // The Rival who took somebody is one the player had soured.
    const soured = new Set(of(all, 'HeroPoached').map((event) => event.fromRivalId));
    expect(taken.some((event) => soured.has(event.toRivalId))).toBe(true);
    expect(run.career.ledger.heroesPoachedFromUs).toBe(taken.length);
  });

  it('feels it on the Board: the soured Rival takes more of the work left on it', () => {
    const poachedOn = of(all, 'HeroPoached')[0]?.day ?? 0;
    const between = (from: number, to: number): { refreshes: number; perDay: number[] } => {
      const days = new Set(
        of(all, 'BoardRefreshed')
          .filter((event) => event.day > from && event.day <= to)
          .map((event) => event.day),
      );
      const perDay = new Map<number, number>();
      for (const day of days) perDay.set(day, 0);
      for (const event of of(all, 'CommissionTakenByRival')) {
        if (perDay.has(event.day)) perDay.set(event.day, (perDay.get(event.day) ?? 0) + 1);
      }
      return { refreshes: days.size, perDay: [...perDay.values()] };
    };
    const before = between(0, poachedOn);
    const after = between(poachedOn, run.career.day);
    expect(before.refreshes).toBeGreaterThan(0);
    // Before anybody was wronged, E1's rule exactly: never more than one a refresh — and
    // fewer on a refresh where the player had taken all the work themselves.
    expect(Math.max(0, ...before.perDay)).toBeLessThanOrEqual(
      opened.career.config.rivalTakesPerRefresh,
    );
    // Afterwards, refreshes that cost more than one, which is where the price of poaching
    // is actually paid: on the Board, which is the resource the whole Career runs on.
    expect(Math.max(0, ...after.perDay)).toBeGreaterThan(
      opened.career.config.rivalTakesPerRefresh,
    );
  });

  it('reaches an ending, and the reckoning counts what it lost to the other Guilds', () => {
    expect(run.career.ended).toBeDefined();
    expect(run.career.ended?.reckoning.heroesPoachedFromUs).toBe(
      run.career.ledger.heroesPoachedFromUs,
    );
    expect(run.career.ledger.heroesTransferredIn).toBe(1);
    expect(run.career.ledger.heroesPoachedIn).toBe(1);
  });
});

describe('the definition of done', () => {
  it('makes Departure and poaching visibly one mechanism', () => {
    // The Hero somebody else approached is the Hero who was walking out: both rules read
    // the same Regard, and every Hero a Rival ever took was at or below the very threshold
    // E2 checks for Departure over.
    const broken: string[] = [];
    for (let seed = 0; seed < 25; seed += 1) {
      const opened = newCareer(`e5-one-mechanism-${seed}`, content);
      const run = play(opened.career, { transfers: 2, poaches: 2 });
      for (const event of of(run.events, 'RivalPoachedHero')) {
        if (event.regardValue > run.career.config.poachRegardThreshold) {
          broken.push(`seed ${seed}: ${event.heroId} taken at ${event.regardValue}`);
        }
        if (event.regardValue > run.career.config.refusalRegardThreshold + 1) {
          // Wider still: everybody taken was already inside the band E2 checks over.
          broken.push(`seed ${seed}: ${event.heroId} was not yet sliding`);
        }
      }
    }
    expect(broken.slice(0, 5)).toEqual([]);
  }, 120_000);

  it('runs every Hero movement through one piece of bookkeeping', () => {
    // Four ways onto or off a Roster — an offer taken, a Transfer, a Poaching and a
    // Rival's retaliation — and every one of them leaves the same six marks, because
    // there is one `moveHero` and they all go through it. (The static half of this claim
    // is `content/tests/e5-one-move.test.ts`, which counts the pushes in `engine/src`.)
    const opened = newCareer('e5-one-move', content);
    const run = play(opened.career, { transfers: 2, poaches: 2 });
    const all = [...opened.events, ...run.events];
    expect(of(all, 'ApplicantAccepted').length).toBeGreaterThan(0);
    expect(of(all, 'HeroTransferred').length).toBeGreaterThan(0);
    expect(of(all, 'HeroPoached').length).toBeGreaterThan(0);
    expect(of(all, 'RivalPoachedHero').length).toBeGreaterThan(0);

    // Whoever is on the Roster at the end arrived through it: their three timers were set
    // to the Day they joined, they hold a Regard for the Guildmaster and none for a Rival,
    // the Guildmaster holds one for them, and nobody is in the Guild's history as well.
    for (const hero of run.career.guild.roster) {
      expect(hero.lastCommittedOn, hero.id).toBeGreaterThanOrEqual(hero.joinedOn);
      expect(hero.regardDecayedOn, hero.id).toBeGreaterThanOrEqual(hero.joinedOn);
      expect(hero.regardForGuildmaster, hero.id).toBeDefined();
      expect(hero.regardForRival, hero.id).toBeUndefined();
      expect(run.career.guild.guildmaster.regardFor[hero.id], hero.id).toBeDefined();
      for (const other of run.career.guild.roster) {
        if (other.id === hero.id) continue;
        expect(hero.regardFor[other.id], `${hero.id} of ${other.id}`).toBeDefined();
      }
    }
    // And whoever a Rival took is on their Roster the same way round.
    for (const rival of run.career.rivals) {
      for (const hero of rival.roster) {
        expect(hero.regardForRival, hero.id).toBeDefined();
        expect(hero.regardForGuildmaster, hero.id).toBeUndefined();
      }
    }
  });

  it('makes every refusal an event, and throws only for a programming error', () => {
    // Played with an appetite it cannot possibly satisfy: every Transfer and Poaching the
    // policy asks for that the world will not allow comes back as a `TransferRefused` and
    // never as an exception.
    const opened = newCareer('e5-refusals-are-events', content);
    const greedy = play(opened.career, { transfers: 999, poaches: 999, askAnyway: true });
    const refused = of(greedy.events, 'TransferRefused');
    expect(refused.length).toBeGreaterThan(0);
    for (const event of refused) {
      expect(['regard', 'heroRegard', 'rosterFull', 'coin']).toContain(event.reason);
    }
    expect(greedy.career.ended).toBeDefined();
  }, 60_000);

  it('never writes a League position, however far a Career is played', () => {
    const run = play(newCareer('e5-league-never-written', content).career, {
      transfers: 2,
      poaches: 2,
    });
    const rows = league(run.career);
    expect(rows).toHaveLength(run.career.rivals.length + 1);
    expect(serialiseCareer(run.career)).not.toContain('"rank"');
    expect(serialiseCareer(run.career)).not.toContain('"position"');
  });
});

// ── The smoke run ───────────────────────────────────────────────────────────

/** Everything that must be true of a Career, whatever has happened to it. */
function invariantsOf(career: Career, at: string, seen: Map<string, number>): string[] {
  const broken: string[] = [];
  const check = (held: boolean, what: string): void => {
    if (!held) broken.push(`${at}: ${what}`);
  };

  const roster = career.guild.roster;
  const former = career.guild.formerHeroes;
  const rivalRosters = career.rivals.flatMap((rival) => rival.roster);

  // 1. Nobody is in two places at once. The one documented exception is somebody being
  //    offered their old job back, who is in `formerHeroes` and `applicants` (DL-19 §2).
  const where = new Map<string, string>();
  const place = (hero: AnyHero, place_: string): void => {
    const already = where.get(hero.id);
    check(already === undefined, `${hero.id} is on ${String(already)} and ${place_}`);
    where.set(hero.id, place_);
  };
  for (const hero of roster) place(hero, 'the Roster');
  for (const rival of career.rivals) for (const hero of rival.roster) place(hero, rival.id);
  for (const hero of former) place(hero, 'the history');
  for (const applicant of career.applicants) {
    if (applicant.formerHeroId === undefined) {
      check(!where.has(applicant.id), `${applicant.id} is waiting and already somewhere`);
    } else {
      check(where.get(applicant.id) === 'the history', `${applicant.id} came back from nowhere`);
    }
  }

  // 2. Nobody holds Regard for two employers, and everybody in work holds one.
  for (const hero of [...roster, ...rivalRosters]) {
    check(
      (hero.regardForGuildmaster === undefined) !== (hero.regardForRival === undefined),
      `${hero.id} holds Regard for ${hero.regardForGuildmaster === undefined ? 'nobody' : 'two'}`,
    );
    check(employerRegard(career, hero.id) !== undefined, `${hero.id} has no employer Regard`);
  }
  for (const hero of roster) check(hero.regardForRival === undefined, `${hero.id} holds a Rival's`);
  for (const hero of rivalRosters) {
    check(hero.regardForGuildmaster === undefined, `${hero.id} holds the Guildmaster's`);
  }

  // 3. Every Roster is within its bounds.
  check(roster.length <= career.config.rosterCap, `the Roster holds ${roster.length}`);
  for (const rival of career.rivals) {
    check(
      rival.roster.length <= career.config.rivalRosterMax,
      `${rival.id} holds ${rival.roster.length}`,
    );
  }

  // 4. Ages never go backwards, and an id is never handed to a second person.
  for (const hero of [...roster, ...former, ...rivalRosters]) {
    const was = seen.get(hero.id);
    check(was === undefined || hero.age >= was, `${hero.id} grew younger`);
    seen.set(hero.id, hero.age);
  }

  return broken;
}

/**
 * The dearer half, which reads the whole world as text: no NaN, no negative zero, no
 * Standing stored on the Guild and no League position anywhere. Run at the end of every
 * Career rather than at every stop, because serialising a twenty-year world several
 * thousand times is minutes of a test suite for a claim that cannot come and go.
 */
function writtenInvariantsOf(career: Career, at: string): string[] {
  const broken: string[] = [];
  const written = serialiseCareer(career);
  if (written.includes('null')) broken.push(`${at}: a null in the world`);
  if (/-0[,}\]]/.test(written)) broken.push(`${at}: a negative zero in the world`);
  if (/"guild":\{[^}]*"standing"/.test(written)) broken.push(`${at}: the Guild stores a Standing`);
  if (written.includes('"rank"') || written.includes('"position"')) {
    broken.push(`${at}: a League position is stored`);
  }
  return broken;
}

describe('two hundred Careers that deal with the other Guilds', () => {
  it(
    'keeps every promise E5 makes, at every state a player could see',
    () => {
      const broken: string[] = [];
      const transfers: number[] = [];
      const poaches: number[] = [];
      const retaliations: number[] = [];
      const refusals: number[] = [];
      const rosterSizes: number[] = [];
      const takesPerRefresh: number[] = [];
      const endings = { retirement: 0, insolvency: 0 };

      for (let seed = 0; seed < 200; seed += 1) {
        const at = `seed ${seed}`;
        const seen = new Map<string, number>();
        const opened = newCareer(`e5-smoke-${seed}`, content);
        broken.push(...invariantsOf(opened.career, `${at} at the start`, seen));

        const run = play(opened.career, { transfers: 3, poaches: 3 }, (career) => {
          if (broken.length > 20) return;
          broken.push(...invariantsOf(career, `${at} on Day ${career.day}`, seen));
        });
        broken.push(...writtenInvariantsOf(run.career, `${at} at the end`));
        const career = run.career;
        const events = [...opened.events, ...run.events];
        const end = career.ended;
        if (end === undefined) {
          broken.push(`${at}: the Career never ended`);
          continue;
        }
        endings[end.reason] += 1;

        // Coin accounting over the whole Career.
        let moved = 0;
        const byDay = new Map<number, number>();
        for (const event of events) {
          if (event.type === 'CoinChanged') moved += event.delta;
          if (event.type === 'CommissionTakenByRival') {
            byDay.set(event.day, (byDay.get(event.day) ?? 0) + 1);
          }
        }
        if (career.config.startingCoin + moved !== career.guild.coin) {
          broken.push(`${at}: the coin does not add up`);
        }

        // The ledger counts exactly what the events reported, once each.
        const transferred = of(events, 'HeroTransferred');
        const poached = of(events, 'HeroPoached');
        const taken = of(events, 'RivalPoachedHero');
        if (career.ledger.heroesTransferredIn !== transferred.length) {
          broken.push(`${at}: heroesTransferredIn is wrong`);
        }
        if (career.ledger.heroesPoachedIn !== poached.length) {
          broken.push(`${at}: heroesPoachedIn is wrong`);
        }
        if (career.ledger.heroesPoachedFromUs !== taken.length) {
          broken.push(`${at}: heroesPoachedFromUs is wrong`);
        }
        if (end.reckoning.heroesPoachedFromUs !== career.ledger.heroesPoachedFromUs) {
          broken.push(`${at}: the reckoning disagrees with the ledger`);
        }
        // People, once each: no id appears twice in any of the three.
        for (const [what, ids] of [
          ['transferred', transferred.map((event) => event.heroId)],
          ['poached', poached.map((event) => event.heroId)],
        ] as const) {
          if (new Set(ids).size !== ids.length) broken.push(`${at}: ${what} somebody twice`);
        }

        // Every fee actually paid, and paid under its own reason.
        const paid = of(events, 'CoinChanged').filter(
          (event) => event.reason === 'transfer' || event.reason === 'poach',
        );
        if (paid.length !== transferred.length + poached.length) {
          broken.push(`${at}: the fees and the payments do not match`);
        }

        transfers.push(transferred.length);
        poaches.push(poached.length);
        retaliations.push(taken.length);
        refusals.push(of(events, 'TransferRefused').length);
        rosterSizes.push(...career.rivals.map((rival) => rival.roster.length));
        takesPerRefresh.push(...byDay.values());
      }

      const mean = (values: readonly number[]): number =>
        values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
      // Reported rather than asserted tightly: the balance pass is deferred past E6
      // (DL-15 §3), and these are the numbers it starts from.
      const distribution = {
        transfersPerCareer: Number(mean(transfers).toFixed(2)),
        poachesPerCareer: Number(mean(poaches).toFixed(2)),
        retaliationsPerCareer: Number(mean(retaliations).toFixed(2)),
        refusalsPerCareer: Number(mean(refusals).toFixed(1)),
        rivalRosterMean: Number(mean(rosterSizes).toFixed(2)),
        rivalRosterMax: Math.max(...rosterSizes),
        commissionsLostPerRefresh: Number(mean(takesPerRefresh).toFixed(2)),
        retirement: endings.retirement / 200,
      };

      // Measured 2026-09-19 over these two hundred seeds, and recorded in DL-21 rather
      // than asserted tightly, because the balance pass is deferred past E6 (DL-15 §3):
      // 2.90 Transfers, 2.96 Poachings and 4.18 retaliations per Career against an
      // appetite of three each; Rival Rosters a mean of 5.83 and never above 8;
      // 1.20 Commissions lost per Board refresh; 95.5% reaching Retirement.
      expect(broken.slice(0, 10)).toEqual([]);
      expect(endings.retirement + endings.insolvency).toBe(200);
      expect(distribution.transfersPerCareer).toBeGreaterThan(0);
      expect(distribution.poachesPerCareer).toBeGreaterThan(0);
      expect(distribution.retaliationsPerCareer).toBeGreaterThan(0);
      expect(distribution.rivalRosterMax).toBeLessThanOrEqual(8);
      expect(distribution.commissionsLostPerRefresh).toBeGreaterThanOrEqual(1);
    },
    600_000,
  );
});

describe('twenty-five Careers, checked on every single Day', () => {
  it(
    'keeps the same promises with no Day of any of them unexamined',
    () => {
      // Three-year Careers rather than twenty, played one Day at a time: this arm exists
      // to see the states a stretch of Days passes through and never hands back, and a
      // Day of a played Career costs the same whichever year it falls in.
      //
      // Every Rival is soured from the start, so retaliation is live on every Day there
      // is anybody to take, and the player deals with the other Guilds throughout.
      const broken: string[] = [];
      for (let seed = 0; seed < 25; seed += 1) {
        const at = `seed ${seed}`;
        const seen = new Map<string, number>();
        const opened = newCareer(`e5-daily-${seed}`, content, { careerYears: 3 }).career;
        const soured: Career = {
          ...opened,
          rivals: opened.rivals.map((rival) => ({
            ...rival,
            regardForGuild: { ...rival.regardForGuild, value: -5 },
          })),
        };
        let career = soured;
        let guard = 0;
        while (career.ended === undefined && broken.length <= 10) {
          guard += 1;
          if (guard > 20_000) throw new Error('a Career that will not end');
          // The player's own decisions, taken on the Days they can be taken on.
          for (const applicant of [...career.applicants]) {
            if (career.guild.roster.length >= career.config.rosterFloor + 2) break;
            if (acceptRefusal(career, applicant.id) !== undefined) continue;
            career = acceptApplicant(career, applicant.id).career;
            broken.push(...invariantsOf(career, `${at} taking somebody on`, seen));
          }
          for (const rival of career.rivals) {
            const offer = rivalOffers(career, rival.id).find(
              (entry) => entry.poachRefusal === undefined,
            );
            if (offer === undefined) continue;
            career = poachHero(career, rival.id, offer.hero.id).career;
            broken.push(...invariantsOf(career, `${at} poaching`, seen));
          }
          const free = availableHeroes(career);
          const commission = career.board[0];
          if (free.length > 0 && commission !== undefined) {
            const party = free
              .filter(
                (hero) =>
                  !proposeParty(career, commission.id, [hero.id], content).refusals.some(
                    (refusal) => refusal.heroId === hero.id,
                  ),
              )
              .slice(0, 2)
              .map((hero) => hero.id);
            if (party.length > 0) {
              career = commitParty(career, commission.id, party, content).career;
              broken.push(...invariantsOf(career, `${at} committing`, seen));
            }
          }
          career = advance(career, 1, content).career;
          broken.push(...invariantsOf(career, `${at} on Day ${career.day}`, seen));
        }
        broken.push(...writtenInvariantsOf(career, `${at} at the end`));
        if (career.ended === undefined && broken.length <= 10) {
          broken.push(`${at}: the Career never ended`);
        }
      }
      expect(broken.slice(0, 10)).toEqual([]);
    },
    600_000,
  );
});
