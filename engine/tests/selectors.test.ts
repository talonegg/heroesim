/**
 * DL-18: four read-only selectors the front ends were restating, now exported from the
 * public entry point. Each test proves the exported answer against what the engine
 * itself actually does — the next Upkeep it pays, the Day its own schedule next fires
 * on, or the arithmetic `buildReckoning` already carried — rather than against a second
 * copy of the same formula.
 */

import { describe, expect, it } from 'vitest';
import {
  advance,
  commitParty,
  dayOfYear,
  daysUntilBoardRefresh,
  daysUntilUpkeep,
  defaultConfig,
  newCareer,
  serialiseCareer,
  unavailableAmong,
  upkeepDue,
  yearOf,
  type Career,
  type GameConfig,
  type GameEvent,
  type GameEventType,
} from '../src/index.js';
import { deepFreeze, fixtureContent, hurt } from './fixtures.js';

function of<T extends GameEventType>(
  events: readonly GameEvent[],
  type: T,
): Extract<GameEvent, { type: T }>[] {
  return events.filter((event): event is Extract<GameEvent, { type: T }> => event.type === type);
}

// ── Upkeep due ──────────────────────────────────────────────────────────────

describe('upkeepDue', () => {
  it('equals the magnitude of the CoinChanged the engine actually pays at the next Upkeep', () => {
    for (const startingHeroes of [0, 1, 4]) {
      const career = newCareer(`upkeep-due-${String(startingHeroes)}`, fixtureContent, {
        startingHeroes,
      }).career;
      expect(career.guild.roster).toHaveLength(startingHeroes);

      const due = upkeepDue(career);
      const step = advance(career, daysUntilUpkeep(career), fixtureContent);
      const paid = of(step.events, 'CoinChanged').filter((event) => event.reason === 'upkeep');
      expect(paid).toHaveLength(1);
      expect(Math.abs(paid[0]?.delta ?? 0)).toBe(due);

      const owed = of(step.events, 'UpkeepOwed');
      expect(owed).toHaveLength(1);
      expect(owed[0]?.amount).toBe(due);
    }
  });

  it('is the configured base alone for an empty Roster', () => {
    const alone = newCareer('upkeep-due-alone', fixtureContent, { startingHeroes: 0 }).career;
    expect(upkeepDue(alone)).toBe(alone.config.upkeepBase);
  });
});

// ── The two countdowns ───────────────────────────────────────────────────────

/**
 * Walk a Career forward in jumps of exactly what `promiseFor` says, for at least
 * `minDays` Days in all, and on every jump assert that `eventType` fires on exactly the
 * Day the jump lands on — not on any Day before it, and not zero times either. Advancing
 * `promised` Days in one call and checking the whole span, rather than only the last Day
 * of it, is what proves "not before" as well as "on time".
 */
function walkCountdown(
  seed: string,
  overrides: Partial<GameConfig>,
  minDays: number,
  promiseFor: (career: Career) => number,
  eventType: GameEventType,
): void {
  let career = newCareer(seed, fixtureContent, overrides).career;
  let walked = 0;
  let guard = 0;
  while (walked < minDays) {
    guard += 1;
    if (guard > 1000) throw new Error('the walk did not reach its target');
    const startDay = career.day;
    const promised = promiseFor(career);
    expect(promised).toBeGreaterThan(0);

    const step = advance(career, promised, fixtureContent);
    const landedOn = of(step.events, eventType).map((event) => event.day);
    expect(landedOn, `Day ${String(startDay)}, promised ${String(promised)}`).toEqual([
      startDay + promised,
    ]);

    career = step.career;
    walked += promised;
  }
}

describe('daysUntilUpkeep', () => {
  it('promises exactly the Day UpkeepOwed lands on, at the default interval', () => {
    walkCountdown('countdown-upkeep-default', {}, 45, daysUntilUpkeep, 'UpkeepOwed');
  });

  it('promises exactly the Day UpkeepOwed lands on, at a non-default interval', () => {
    walkCountdown('countdown-upkeep-seven', { upkeepEveryDays: 7 }, 45, daysUntilUpkeep, 'UpkeepOwed');
  });
});

describe('daysUntilBoardRefresh', () => {
  it('promises exactly the Day BoardRefreshed lands on, at the default interval', () => {
    walkCountdown('countdown-board-default', {}, 45, daysUntilBoardRefresh, 'BoardRefreshed');
  });

  it('promises exactly the Day BoardRefreshed lands on, at a non-default interval', () => {
    walkCountdown(
      'countdown-board-thirteen',
      { boardRefreshEveryDays: 13 },
      45,
      daysUntilBoardRefresh,
      'BoardRefreshed',
    );
  });
});

// ── The Year a Day falls in ──────────────────────────────────────────────────

describe('yearOf and dayOfYear', () => {
  const cases: {
    label: string;
    daysPerYear: number;
    days: { day: number; year: number; dayOfYear: number }[];
  }[] = [
    {
      label: 'the default daysPerYear',
      daysPerYear: defaultConfig.daysPerYear,
      days: [
        { day: 1, year: 1, dayOfYear: 1 },
        { day: 360, year: 1, dayOfYear: 360 },
        { day: 361, year: 2, dayOfYear: 1 },
        { day: 7201, year: 21, dayOfYear: 1 },
      ],
    },
    {
      label: 'a non-default daysPerYear',
      daysPerYear: 30,
      days: [
        { day: 1, year: 1, dayOfYear: 1 },
        { day: 30, year: 1, dayOfYear: 30 },
        { day: 31, year: 2, dayOfYear: 1 },
        { day: 7201, year: 241, dayOfYear: 1 },
      ],
    },
  ];

  for (const { label, daysPerYear, days } of cases) {
    it(`counts the Year and the Day within it, for ${label}`, () => {
      const config: GameConfig = deepFreeze({ ...defaultConfig, daysPerYear });
      for (const { day, year, dayOfYear: expected } of days) {
        expect(yearOf(day, config), `Day ${String(day)}`).toBe(year);
        expect(dayOfYear(day, config), `Day ${String(day)}`).toBe(expected);
      }
    });
  }

  it('agrees with the Year the reckoning counts at the end of a Career', () => {
    // `buildReckoning`'s `years` is `yearOf(day, config) − 1`: a Career ending on the
    // first Day of a Year has lived every Year before it and none of this one.
    const short = advance(
      newCareer('year-reckoning', fixtureContent, { careerYears: 1, daysPerYear: 10 }).career,
      50,
      fixtureContent,
    ).career;
    expect(short.ended?.onDay).toBeDefined();
    const onDay = short.ended?.onDay ?? 0;
    expect(short.ended?.reckoning.years).toBe(yearOf(onDay, short.config) - 1);
  });
});

// ── unavailableAmong, now part of the public entry point ────────────────────

describe('unavailableAmong', () => {
  it('answers who cannot be sent, preferring "away" when a Hero is both away and injured', () => {
    const opened = newCareer('unavailable-export', fixtureContent, { startingHeroes: 4 }).career;
    const roster = opened.guild.roster.map((hero) => hero.id);
    const commission = opened.board[0];
    if (commission === undefined) throw new Error('the test expected a Commission');
    const sent = commitParty(opened, commission.id, roster.slice(0, 2), fixtureContent, {
      insist: true,
    }).career;

    // roster[1] is away (sent above) and now hurt too; roster[2] is hurt alone.
    const both = hurt(sent, roster[1] ?? '', 'Bruised', sent.day, sent.day + 20);
    const career = hurt(both, roster[2] ?? '', 'Bruised', sent.day, sent.day + 20);

    expect(unavailableAmong(career)).toEqual([
      { heroId: roster[0], reason: 'away' },
      { heroId: roster[1], reason: 'away' },
      { heroId: roster[2], reason: 'injured' },
    ]);
  });
});

// ── Purity ──────────────────────────────────────────────────────────────────

describe('every selector added by DL-18, over a deep-frozen Career', () => {
  it('changes nothing at all', () => {
    const career = deepFreeze(
      newCareer('selectors-purity', fixtureContent, { startingHeroes: 4 }).career,
    );
    const before = serialiseCareer(career);

    unavailableAmong(career);
    upkeepDue(career);
    daysUntilUpkeep(career);
    daysUntilBoardRefresh(career);

    expect(serialiseCareer(career)).toBe(before);
  });
});
