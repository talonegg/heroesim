/**
 * E4's gate: *a Career survives losing half its Roster — Applicants arrive, are accepted,
 * and the Guild keeps working.*
 *
 * Nothing is arranged except the loss itself, which is the premise. The Career is opened
 * from a seed at the shipped defaults, half the Roster is taken off it the way E2 and E3
 * take people off it, and it is played to its end through the public API by a policy that
 * takes on whoever it can afford.
 *
 * Beneath the gate sit the definition of done and the 200-seed smoke run: the Roster cap,
 * the ids, the coin, the ledger, and the promise that recruitment is entirely optional.
 */

import { describe, expect, it } from 'vitest';
import {
  acceptApplicant,
  acceptRefusal,
  advanceUntilAttention,
  availableHeroes,
  commitParty,
  declineApplicant,
  hallCost,
  HALL_IMPROVEMENTS,
  improveHall,
  newCareer,
  proposeParty,
  upkeepDue,
  type Career,
  type GameEvent,
  type Hero,
} from '../src/index.js';
import { fixtureContent, gone, walkedOut } from './fixtures.js';

const content = fixtureContent;
const strength = (hero: Hero): number =>
  hero.stats.Might + hero.stats.Craft + hero.stats.Nerve + hero.stats.Guile;

/** What a policy does with the people waiting in the Hall. */
type Recruiting = 'accept' | 'decline' | 'ignore';

/**
 * The best available Heroes to the best-paying work, two at a time, buying a Hall
 * improvement when there is comfortably enough coin — E3's policy, with one addition: it
 * answers the door. It takes on whoever the engine says it can, keeping a full
 * `startingCoin` of runway back so that recruiting is never what makes it insolvent.
 */
function play(
  start: Career,
  recruiting: Recruiting,
): { career: Career; events: GameEvent[] } {
  let career = start;
  const events: GameEvent[] = [];
  let guard = 0;
  while (career.ended === undefined) {
    guard += 1;
    if (guard > 100_000) throw new Error('the policy never reached the end of the Career');

    for (const applicant of [...career.applicants]) {
      if (recruiting === 'ignore') break;
      if (recruiting === 'decline') {
        const sent = declineApplicant(career, applicant.id);
        career = sent.career;
        events.push(...sent.events);
        continue;
      }
      if (acceptRefusal(career, applicant.id) !== undefined) continue;
      // Short-handed, it takes whoever it can pay for, because a Guild with nobody on the
      // Roster cannot earn its way to a comfortable balance. Once it is up to the floor it
      // keeps a full `startingCoin` of runway back, so recruiting never makes it insolvent.
      const shortHanded = career.guild.roster.length < career.config.rosterFloor;
      if (!shortHanded && career.guild.coin < applicant.askingFee + career.config.startingCoin) {
        continue;
      }
      const taken = acceptApplicant(career, applicant.id);
      career = taken.career;
      events.push(...taken.events);
    }

    for (const improvement of HALL_IMPROVEMENTS) {
      if (career.guild.hall.includes(improvement)) continue;
      if (career.guild.coin < hallCost(improvement, career.config) + career.config.startingCoin) {
        continue;
      }
      const bought = improveHall(career, improvement);
      career = bought.career;
      events.push(...bought.events);
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
      const step = commitParty(career, commission.id, party, content);
      career = step.career;
      events.push(...step.events);
      for (const id of party) used.add(id);
    }

    const step = advanceUntilAttention(career, content);
    career = step.career;
    events.push(...step.events);
  }
  return { career, events };
}

function of<T extends GameEvent['type']>(
  events: readonly GameEvent[],
  type: T,
): Extract<GameEvent, { type: T }>[] {
  return events.filter((event): event is Extract<GameEvent, { type: T }> => event.type === type);
}

describe('the E4 gate, on one fixed seed', () => {
  // Half the Roster gone before the first Day of work: one walked out, one did not come
  // back. Four Heroes is the shipped starting Roster, so this leaves two.
  const opened = newCareer('e4-gate-1', content).career;
  const ids = opened.guild.roster.map((hero) => hero.id);
  const halved = gone(walkedOut(opened, ids[0] ?? '', 1), ids[1] ?? '', 'death', 1);
  const run = play(halved, 'accept');

  it('starts having lost half the Roster', () => {
    expect(opened.guild.roster).toHaveLength(4);
    expect(halved.guild.roster).toHaveLength(2);
    expect(halved.guild.formerHeroes.map((hero) => hero.exit?.kind).sort()).toEqual([
      'death',
      'departure',
    ]);
  });

  it('brings Applicants, and the Guild takes some of them on', () => {
    const arrived = of(run.events, 'ApplicantsArrived');
    const accepted = of(run.events, 'ApplicantAccepted');
    const joined = of(run.events, 'HeroJoined');
    expect(arrived.length).toBeGreaterThan(0);
    expect(accepted.length).toBeGreaterThan(0);
    expect(joined).toHaveLength(accepted.length);
    for (const [index, event] of accepted.entries()) {
      expect(joined[index]?.heroId).toBe(event.heroId);
    }
    expect(run.career.ledger.applicantsAccepted).toBe(accepted.length);
  });

  it('keeps working: the Roster recovers past where it started', () => {
    expect(run.career.guild.roster.length).toBeGreaterThan(halved.guild.roster.length);
    expect(of(run.events, 'PartyCommitted').length).toBeGreaterThan(50);
    expect(run.career.ledger.commissionsCompleted).toBeGreaterThan(0);
  });

  it('reaches an ending, and the reckoning counts who was taken on', () => {
    expect(run.career.ended).toBeDefined();
    expect(run.career.ended?.reckoning.heroesRecruited).toBe(run.career.ledger.applicantsAccepted);
    expect(run.career.ended?.reckoning.heroesRecruited).toBeGreaterThan(0);
  });

  it('never carries more than the cap, and never pays for somebody twice', () => {
    expect(run.career.guild.roster.length).toBeLessThanOrEqual(run.career.config.rosterCap);
    const accepted = of(run.events, 'ApplicantAccepted').map((event) => event.applicantId);
    expect(new Set(accepted).size).toBe(accepted.length);
  });
});

describe('the definition of done', () => {
  it('lets a player who declines everything reach an ending', () => {
    for (const seed of ['optional-1', 'optional-2', 'optional-3']) {
      const run = play(newCareer(seed, content).career, 'decline');
      expect(run.career.ended, seed).toBeDefined();
      expect(of(run.events, 'ApplicantDeclined').length).toBeGreaterThan(0);
      expect(of(run.events, 'ApplicantAccepted')).toHaveLength(0);
      expect(run.career.guild.roster.length).toBeLessThanOrEqual(4);
      expect(run.career.ended?.reckoning.heroesRecruited).toBe(0);
    }
  });

  it('lets a player who ignores everything reach the same ending', () => {
    // Declining and ignoring must be the same world, because neither takes a draw from
    // the Career's own generator (DL-19 §1). Only the `ApplicantDeclined` events differ.
    const declined = play(newCareer('ignored', content).career, 'decline');
    const ignored = play(newCareer('ignored', content).career, 'ignore');
    expect(ignored.career.ended?.onDay).toBe(declined.career.ended?.onDay);
    expect(ignored.career.guild.coin).toBe(declined.career.guild.coin);
    expect(ignored.career.ledger.commissionsCompleted).toBe(
      declined.career.ledger.commissionsCompleted,
    );
  });

  it('recovers a Roster driven to zero, without a special case', () => {
    let career = newCareer('emptied', content).career;
    for (const hero of [...career.guild.roster]) career = walkedOut(career, hero.id, 1);
    expect(career.guild.roster).toHaveLength(0);
    expect(upkeepDue(career)).toBe(career.config.upkeepBase);

    const run = play(career, 'accept');
    expect(of(run.events, 'HeroJoined').length).toBeGreaterThan(0);
    expect(run.career.ended).toBeDefined();
    expect(run.career.guild.roster.length).toBeGreaterThan(0);
    expect(run.career.ledger.commissionsCompleted).toBeGreaterThan(0);
  });

  it('brings Applicants sooner and in larger batches while the Roster is empty', () => {
    let career = newCareer('emptied-cadence', content).career;
    for (const hero of [...career.guild.roster]) career = walkedOut(career, hero.id, 1);
    const run = advanceUntilAttention(career, content);
    const arrived = of(run.events, 'ApplicantsArrived');
    expect(arrived).toHaveLength(1);
    expect(arrived[0]?.day).toBe(career.config.applicantsEveryDaysBelowFloor);
    expect(arrived[0]?.applicantIds).toHaveLength(career.config.applicantBatchMax);
  });
});

describe('two hundred Careers with a policy that answers the door', () => {
  it(
    'keeps every promise the epic makes, and reaches an ending on every seed',
    () => {
      const seen: number[] = [];
      const accepted: number[] = [];
      const returned: number[] = [];
      const finalRoster: number[] = [];
      let atTheCap = 0;
      const endings = { retirement: 0, insolvency: 0 };
      /**
       * Every promise broken, over the whole fleet. Gathered rather than asserted inside
       * the loops: a twenty-year Career at the Roster cap produces tens of thousands of
       * events, and an `expect` per event turns a half-minute run into a seven-minute one.
       */
      const broken: string[] = [];
      const check = (held: boolean, what: string): void => {
        if (!held) broken.push(what);
      };

      for (let seed = 0; seed < 200; seed += 1) {
        const at = `seed ${seed}`;
        const opened = newCareer(`e4-smoke-${seed}`, content);
        const run = play(opened.career, 'accept');
        const career = run.career;
        const events = [...opened.events, ...run.events];
        const end = career.ended;
        check(end !== undefined, `${at}: the Career never ended`);
        if (end === undefined) continue;
        endings[end.reason] += 1;

        // The cap is never exceeded.
        check(career.guild.roster.length <= career.config.rosterCap, `${at}: over the Roster cap`);
        if (career.guild.roster.length === career.config.rosterCap) atTheCap += 1;

        // Nobody is in two places at once — except somebody being offered their old job
        // back, who is in `formerHeroes` and `applicants` and nowhere else (DL-19 §2).
        const roster = new Set(career.guild.roster.map((hero) => hero.id));
        const former = new Set(career.guild.formerHeroes.map((hero) => hero.id));
        const waiting = new Set(career.applicants.map((entry) => entry.id));
        check(roster.size === career.guild.roster.length, `${at}: a Roster id twice`);
        check(former.size === career.guild.formerHeroes.length, `${at}: a former Hero id twice`);
        check(waiting.size === career.applicants.length, `${at}: an Applicant id twice`);
        for (const id of roster) check(!former.has(id), `${at}: ${id} is on the Roster and gone`);
        for (const applicant of career.applicants) {
          const { id } = applicant;
          if (applicant.formerHeroId === undefined) {
            check(!roster.has(id), `${at}: ${id} is waiting and on the Roster`);
            check(!former.has(id), `${at}: ${id} is waiting and in the Guild's history`);
          } else {
            check(applicant.formerHeroId === id, `${at}: ${id} came back under another id`);
            check(former.has(id), `${at}: ${id} came back from nowhere`);
            check(!roster.has(id), `${at}: ${id} is waiting and already on the Roster`);
            const was = career.guild.formerHeroes.find((hero) => hero.id === applicant.formerHeroId);
            check(was?.exit?.kind === 'departure', `${at}: ${id} did not leave by choice`);
          }
          // Nobody lingers past their Day.
          check(applicant.expiresOn > career.day, `${at}: ${id} is still here after expiring`);
        }

        // One pass over the events for everything the fleet has to be told about them:
        // who left for good, what the coin did, and what the ledger should say.
        const leftForGood = new Map<string, number>();
        let arrived = 0;
        let acceptances = 0;
        let camBack = 0;
        let fees = 0;
        let paidForRecruitment = 0;
        let moved = 0;
        let strangeNumber = '';
        for (const event of events) {
          switch (event.type) {
            case 'HeroDied':
            case 'HeroRetired':
              leftForGood.set(event.heroId, event.day);
              break;
            case 'ApplicantsArrived':
              arrived += event.applicantIds.length;
              for (const id of event.applicantIds) {
                const wentOn = leftForGood.get(id);
                check(
                  wentOn === undefined || event.day <= wentOn,
                  `${at}: ${id} came back after leaving for good on Day ${String(wentOn)}`,
                );
              }
              break;
            case 'ApplicantAccepted':
              acceptances += 1;
              fees += event.fee;
              break;
            case 'HeroJoined':
              if (event.formerHeroId !== undefined) camBack += 1;
              break;
            case 'CoinChanged':
              moved += event.delta;
              if (event.reason === 'recruitment') paidForRecruitment -= event.delta;
              break;
            default:
              break;
          }
          for (const value of Object.values(event)) {
            if (typeof value !== 'number') continue;
            if (!Number.isFinite(value) || Object.is(value, -0)) {
              strangeNumber = `${at}: ${event.type} carries ${String(value)}`;
            }
          }
        }
        check(strangeNumber === '', strangeNumber || 'ok');

        // Coin accounting holds over the whole Career.
        check(
          career.config.startingCoin + moved === career.guild.coin,
          `${at}: the coin does not add up`,
        );
        check(fees === paidForRecruitment, `${at}: the joining fees do not match what was paid`);

        // The ledger counts exactly what the events reported.
        check(career.ledger.applicantsSeen === arrived, `${at}: applicantsSeen is wrong`);
        check(career.ledger.applicantsAccepted === acceptances, `${at}: applicantsAccepted is wrong`);
        check(
          end.reckoning.heroesRecruited === career.ledger.applicantsAccepted,
          `${at}: the reckoning disagrees with the ledger`,
        );
        check(
          career.ledger.returners === camBack,
          `${at}: returners disagrees with the count of HeroJoined events carrying formerHeroId`,
        );

        // No NaN, and no negative zero, anywhere in the world the Career ended in.
        const written = JSON.stringify(career);
        check(!written.includes('null'), `${at}: a null in the world`);
        check(!/-0[,}\]]/.test(written), `${at}: a negative zero in the world`);

        seen.push(career.ledger.applicantsSeen);
        accepted.push(career.ledger.applicantsAccepted);
        returned.push(career.ledger.returners);
        finalRoster.push(career.guild.roster.length);
      }

      expect(broken.slice(0, 10)).toEqual([]);
      expect(endings.retirement + endings.insolvency).toBe(200);
      expect(seen.length).toBe(200);

      const mean = (values: readonly number[]): number =>
        values.reduce((sum, value) => sum + value, 0) / values.length;
      // Reported rather than asserted tightly: the balance pass is deferred past E6
      // (DL-15 §3), and these are the numbers it starts from.
      const distribution = {
        applicantsSeen: Number(mean(seen).toFixed(1)),
        applicantsAccepted: Number(mean(accepted).toFixed(2)),
        returners: Number(mean(returned).toFixed(3)),
        finalRoster: Number(mean(finalRoster).toFixed(2)),
        atTheCap: atTheCap / 200,
        retirement: endings.retirement / 200,
      };
      expect(distribution.applicantsSeen).toBeGreaterThan(0);
      expect(distribution.applicantsAccepted).toBeGreaterThan(0);
      expect(distribution.finalRoster).toBeGreaterThan(0);
      expect(distribution.retirement).toBeGreaterThan(0);
    },
    300_000,
  );
});
