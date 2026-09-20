/**
 * E2-S4: the Hero nobody sends out. Drift is evaluated at the Board refresh, so what a
 * stretch of neglect actually costs depends on both `regardDecayEveryDays` and how often
 * the Board comes round — and both readings are pinned here, one at a refresh every Day
 * and one at the ten-Day cadence the game is played at.
 *
 * Where drift alone is being measured the Departure thresholds are put out of reach, so
 * that nothing talks anybody round in the middle of a count.
 */

import { describe, expect, it } from 'vitest';
import { advance, commitParty } from '../src/career.js';
import type { GameConfig } from '../src/config.js';
import type { GameEvent } from '../src/events.js';
import { REASON_DRIFTED } from '../src/regard.js';
import { newCareer } from '../src/world.js';
import { fixtureContent, thinking } from './fixtures.js';

/**
 * Nobody is checked for Departure, nobody runs out of coin and nobody comes to the door,
 * so only drift moves. The two Applicant intervals are switched off for the same reason
 * the Departure thresholds are put out of reach: this file measures one rule, and an
 * arriving batch is another one happening in the middle of the count (E4).
 */
const DRIFT_ALONE: Partial<GameConfig> = {
  refusalRegardThreshold: -100,
  departureRegardThreshold: -100,
  startingCoin: 100_000,
  applicantsEveryDays: 0,
  applicantsEveryDaysBelowFloor: 0,
  // And a Rival's Roster never churns, for the third time for the same reason: this file
  // measures one rule, and `RivalRosterChanged` arriving at a Board refresh is another one
  // happening in the middle of the count (E5).
  rivalChurnChance: 0,
};

interface Drift {
  day: number;
  delta: number;
  value: number;
}

function drifts(events: readonly GameEvent[], heroId: string): Drift[] {
  return events
    .filter(
      (event) =>
        event.type === 'HeroRegardForGuildmasterChanged' &&
        event.reason === REASON_DRIFTED &&
        event.heroId === heroId,
    )
    .map((event) => ({
      day: event.day,
      delta: (event as Extract<GameEvent, { type: 'HeroRegardForGuildmasterChanged' }>).delta,
      value: (event as Extract<GameEvent, { type: 'HeroRegardForGuildmasterChanged' }>).value,
    }));
}

describe('what neglect costs', () => {
  it('costs exactly one Regard at thirty idle Days, two at sixty, and not a point before', () => {
    // A Board that comes round every Day, so the count is the idle stretch and nothing else.
    const opened = newCareer('decay-daily', fixtureContent, {
      ...DRIFT_ALONE,
      boardRefreshEveryDays: 1,
      regardDecayEveryDays: 30,
    }).career;
    const hero = opened.guild.roster[0]?.id ?? '';
    const idle = thinking(opened, hero, 5);

    const shortOf = advance(idle, 29, fixtureContent);
    expect(shortOf.career.day).toBe(30);
    expect(drifts(shortOf.events, hero)).toEqual([]);

    const thirty = advance(idle, 30, fixtureContent);
    expect(thirty.career.day).toBe(31);
    expect(drifts(thirty.events, hero)).toEqual([{ day: 31, delta: -1, value: 4 }]);

    const sixty = advance(idle, 60, fixtureContent);
    expect(drifts(sixty.events, hero)).toEqual([
      { day: 31, delta: -1, value: 4 },
      { day: 61, delta: -1, value: 3 },
    ]);
  });

  it('walks two hundred Days at the ten-Day cadence and drifts on exactly these Days', () => {
    const opened = newCareer('decay-cadence', fixtureContent, DRIFT_ALONE).career;
    const hero = opened.guild.roster[0]?.id ?? '';
    const run = advance(thinking(opened, hero, 5), 200, fixtureContent);

    expect(run.career.config.regardDecayEveryDays).toBe(30);
    expect(run.career.config.boardRefreshEveryDays).toBe(10);
    expect(drifts(run.events, hero)).toEqual([
      { day: 40, delta: -1, value: 4 },
      { day: 70, delta: -1, value: 3 },
      { day: 100, delta: -1, value: 2 },
      { day: 130, delta: -1, value: 1 },
      { day: 160, delta: -1, value: 0 },
      { day: 190, delta: -1, value: -1 },
    ]);
    expect(run.career.guild.roster.find((entry) => entry.id === hero)?.regardDecayedOn).toBe(190);
    expect(run.career.guild.roster.find((entry) => entry.id === hero)?.regardForGuildmaster.value).toBe(-1);
  });

  it('reports drift as a Regard movement and introduces no event of its own', () => {
    const opened = newCareer('decay-events', fixtureContent, DRIFT_ALONE).career;
    const run = advance(opened, 200, fixtureContent);

    const carrying = run.events.filter(
      (event) => 'reason' in event && event.reason === REASON_DRIFTED,
    );
    expect(carrying.length).toBeGreaterThan(0);
    expect(carrying.every((event) => event.type === 'HeroRegardForGuildmasterChanged')).toBe(true);
    expect([...new Set(run.events.map((event) => event.type))].sort()).toEqual([
      'BoardRefreshed',
      'CoinChanged',
      'CommissionExpired',
      'CommissionPosted',
      'CommissionTakenByRival',
      'HeroRegardForGuildmasterChanged',
      'PatronRegardChanged',
      'UpkeepOwed',
    ]);
  });

  it('is switched off by a decay interval of zero', () => {
    const opened = newCareer('decay-off', fixtureContent, {
      ...DRIFT_ALONE,
      regardDecayEveryDays: 0,
    }).career;
    const run = advance(opened, 200, fixtureContent);
    expect(run.events.filter((event) => 'reason' in event && event.reason === REASON_DRIFTED)).toEqual([]);
  });
});

describe('the clock drift runs on', () => {
  const opened = newCareer('decay-clock', fixtureContent, {
    ...DRIFT_ALONE,
    regardDecayEveryDays: 3,
    commissionSpanMin: 10,
    commissionSpanMax: 10,
  }).career;
  const roster = opened.guild.roster.map((hero) => hero.id);

  it('starts at the commit, not at the return, and leaves a Hero away untouched', () => {
    const commission = opened.board[0];
    if (commission === undefined) throw new Error('the test expected a Commission');
    const sent = commitParty(opened, commission.id, [roster[0] ?? ''], fixtureContent);
    expect(sent.career.guild.roster.find((hero) => hero.id === roster[0])?.lastCommittedOn).toBe(1);
    expect(sent.career.parties[0]?.returnsOn).toBe(11);

    const away = advance(sent.career, 9, fixtureContent);
    expect(away.career.day).toBe(10);
    expect(away.events.some((event) => event.type === 'BoardRefreshed')).toBe(true);

    // Everybody left in the hall has drifted; the one out on the work has not.
    expect(drifts(away.events, roster[0] ?? '')).toEqual([]);
    for (const id of roster.slice(1)) {
      expect(drifts(away.events, id).map((drift) => drift.day)).toEqual([10]);
    }
    const stillOut = away.career.guild.roster.find((hero) => hero.id === roster[0]);
    expect(stillOut?.regardDecayedOn).toBe(1);
    expect(stillOut?.lastCommittedOn).toBe(1);

    // And the Day they come home does not reset the clock either: the commit did that.
    const home = advance(away.career, 1, fixtureContent);
    expect(home.career.parties).toHaveLength(0);
    expect(home.career.guild.roster.find((hero) => hero.id === roster[0])?.lastCommittedOn).toBe(1);
  });
});

describe('drift and Departure in the same refresh', () => {
  it('checks the Hero on the value the drift has just taken them to', () => {
    const opened = newCareer('decay-into-departure', fixtureContent, {
      departureDc: 100,
      startingCoin: 100_000,
    }).career;
    const hero = opened.guild.roster[0]?.id ?? '';
    const sliding = thinking(opened, hero, opened.config.departureRegardThreshold + 1);
    const run = advance(sliding, 40, fixtureContent);

    const drifted = drifts(run.events, hero);
    expect(drifted).toEqual([{ day: 40, delta: -1, value: opened.config.departureRegardThreshold }]);

    const left = run.events.filter((event) => event.type === 'HeroDeparted');
    expect(left).toEqual([
      {
        type: 'HeroDeparted',
        day: 40,
        heroId: hero,
        regardValue: opened.config.departureRegardThreshold,
        reason: 'regard',
      },
    ]);

    const driftAt = run.events.findIndex(
      (event) => 'reason' in event && event.reason === REASON_DRIFTED && event.type === 'HeroRegardForGuildmasterChanged' && event.heroId === hero,
    );
    const departedAt = run.events.findIndex((event) => event.type === 'HeroDeparted');
    expect(driftAt).toBeLessThan(departedAt);
    expect(run.career.guild.formerHeroes.map((entry) => entry.id)).toEqual([hero]);
    expect(run.career.guild.formerHeroes[0]?.exit?.reason).toBe(REASON_DRIFTED);
  });
});
