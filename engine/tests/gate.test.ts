/**
 * E2's gate: *a Career can be played to Retirement in which at least one Hero refuses
 * work, is insisted upon, and departs.*
 *
 * Nothing here is arranged. The Career is opened from a seed with the shipped defaults,
 * played to its end through the public API, and the only thing the policy does that the
 * suites elsewhere do not is accept the price when somebody says no. Regard sours on its
 * own — the strongest Heroes take the work, the ones left in the hall drift, and one of
 * them eventually will not go.
 */

import { describe, expect, it } from 'vitest';
import { advanceUntilAttention, availableHeroes, commitParty, proposeParty } from '../src/career.js';
import type { GameEvent } from '../src/events.js';
import type { Career, Hero } from '../src/types.js';
import { newCareer } from '../src/world.js';
import { fixtureContent } from './fixtures.js';

const strength = (hero: Hero): number =>
  hero.stats.Might + hero.stats.Craft + hero.stats.Nerve + hero.stats.Guile;

/**
 * The best Heroes to the best-paying work, two at a time — and when one of the two will
 * not go, the price is paid rather than the Party rearranged. This is the only policy in
 * the suite that insists.
 */
function playInsisting(start: Career): { career: Career; events: GameEvent[] } {
  let career = start;
  const events: GameEvent[] = [];
  let guard = 0;
  while (career.ended === undefined) {
    guard += 1;
    if (guard > 100_000) throw new Error('the insisting policy never reached the end of the Career');
    const free = [...availableHeroes(career)].sort((one, other) => strength(other) - strength(one));
    const used = new Set<string>();
    for (const commission of [...career.board].sort((one, other) => other.fee - one.fee)) {
      const left = free.filter((hero) => !used.has(hero.id));
      if (left.length === 0) break;
      const party = left.slice(0, 2).map((hero) => hero.id);
      const proposal = proposeParty(career, commission.id, party, fixtureContent);
      const step = commitParty(career, commission.id, party, fixtureContent, {
        insist: proposal.refusals.length > 0,
      });
      career = step.career;
      events.push(...step.events);
      for (const id of party) used.add(id);
    }
    const step = advanceUntilAttention(career, fixtureContent);
    career = step.career;
    events.push(...step.events);
  }
  return { career, events };
}

describe('a Career played to Retirement by a Guildmaster who insists', () => {
  const run = playInsisting(newCareer('gate-3', fixtureContent).career);

  it('reaches Retirement rather than insolvency', () => {
    expect(run.career.ended?.reason).toBe('retirement');
    expect(run.career.day).toBe(run.career.config.careerYears * run.career.config.daysPerYear + 1);
  });

  it('loses a Hero who refused, was insisted upon, and walked out', () => {
    const refused = run.events.filter((event) => event.type === 'CommissionRefused');
    const insisted = run.events.filter((event) => event.type === 'InsistenceApplied');
    const departed = run.events.filter((event) => event.type === 'HeroDeparted');

    expect(refused.length).toBeGreaterThan(0);
    expect(insisted.length).toBeGreaterThan(0);
    expect(departed.length).toBeGreaterThan(0);

    const refusedIds = new Set(refused.map((event) => event.heroId));
    const insistedIds = new Set(insisted.map((event) => event.heroId));
    const all = departed.filter((event) => refusedIds.has(event.heroId) && insistedIds.has(event.heroId));
    expect(all.length).toBeGreaterThan(0);

    // The whole arc, on one Hero of one fixed seed, in the order it has to happen in.
    //
    // E3 re-pinned the Hero and the Day and nothing else. Harm draws from the Career's own
    // generator on every failed Check (DL-16 §2), so every seeded outcome after the first
    // failed Beat moved; seed `gate-3` still plays to Retirement under this same policy and
    // still loses a Hero who refused, was insisted upon and walked out, and it is now `h2`
    // on Day 97 rather than `h3` on Day 86. Nothing about the rule changed.
    const gone = all[0];
    if (gone === undefined) throw new Error('the test expected a departed Hero');
    expect(gone.heroId).toBe('h2');
    expect(gone.day).toBe(97);
    expect(gone.regardValue).toBe(run.career.config.departureRegardThreshold);

    const firstRefusal = refused.find((event) => event.heroId === gone.heroId);
    const firstInsistence = insisted.find((event) => event.heroId === gone.heroId);
    expect(firstRefusal?.reason).toBe('regard');
    expect(firstRefusal?.regardValue).toBeLessThanOrEqual(run.career.config.refusalRegardThreshold);
    expect(firstRefusal?.day).toBeLessThan(gone.day);
    expect(firstInsistence?.day).toBeLessThanOrEqual(gone.day);
  });

  it('keeps them readable afterwards, and counts them in the reckoning', () => {
    const departed = run.events.filter((event) => event.type === 'HeroDeparted');
    const ids = departed.map((event) => event.heroId);

    expect(run.career.guild.roster.map((hero) => hero.id)).not.toContain(ids[0]);
    const gone = run.career.guild.formerHeroes.find((hero) => hero.id === ids[0]);
    expect(gone?.exit?.kind).toBe('departure');
    expect(gone?.exit?.onDay).toBe(departed[0]?.day);
    expect(gone?.exit?.reason.length).toBeGreaterThan(0);
    expect(gone?.name.length).toBeGreaterThan(0);
    expect(gone?.regardForGuildmaster.value).toBe(run.career.config.departureRegardThreshold);

    expect(run.career.ledger.departures).toBe(new Set(ids).size);
    // E3's reckoning counts Death and Departure as `heroesLost` and reports Retirement
    // apart as `heroesRetired` — seed `gate-3` happens to retire nobody, but the
    // assertion is written off that split rather than off the whole of `formerHeroes`
    // (finding F9), the way e2-verification.test.ts and e3-gate.test.ts already do.
    expect(run.career.ended?.reckoning.heroesLost).toBe(
      run.career.guild.formerHeroes.filter((hero) => hero.exit?.kind !== 'retirement').length,
    );
    expect(run.career.ended?.reckoning.heroesRetired).toBe(
      run.career.guild.formerHeroes.filter((hero) => hero.exit?.kind === 'retirement').length,
    );
    expect(run.career.ended?.reckoning.heroesOnRoster).toBe(run.career.guild.roster.length);
  });
});
