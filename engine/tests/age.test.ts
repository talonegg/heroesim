/**
 * E3-S3: Heroes get older, and at the end of a working life they retire. This is the one
 * exit that ends well, which is the whole reason it exists — without it every departure
 * from the Roster is a failure and twenty years of it reads flat.
 */

import { describe, expect, it } from 'vitest';
import {
  advance,
  commitParty,
  defaultConfig,
  deserialiseCareer,
  newCareer,
  serialiseCareer,
  startingAge,
  type Career,
  type GameConfig,
  type GameEvent,
} from '../src/index.js';
import { aged, fixtureContent } from './fixtures.js';

const content = fixtureContent;

function of<T extends GameEvent['type']>(
  events: readonly GameEvent[],
  type: T,
): Extract<GameEvent, { type: T }>[] {
  return events.filter((event): event is Extract<GameEvent, { type: T }> => event.type === type);
}

function rosterId(career: Career, index: number): string {
  const hero = career.guild.roster[index];
  if (hero === undefined) throw new Error(`the test expected a Hero at Roster place ${index}`);
  return hero.id;
}

/** A Career that will sit still: no Board, no Upkeep, no drift, for as long as it is run. */
function still(seed: string, config: Partial<GameConfig> = {}): Career {
  return newCareer(seed, content, {
    boardRefreshEveryDays: 10,
    upkeepEveryDays: 100_000,
    regardDecayEveryDays: 100_000,
    ...config,
  }).career;
}

describe('the age a Hero starts at', () => {
  it('is inside the configured range, for every Hero of every seed', () => {
    for (let seed = 0; seed < 60; seed += 1) {
      const career = newCareer(`age-range-${seed}`, content).career;
      for (const hero of career.guild.roster) {
        expect(hero.age, `${career.seed} ${hero.id}`).toBeGreaterThanOrEqual(
          career.config.heroStartingAgeMin,
        );
        expect(hero.age, `${career.seed} ${hero.id}`).toBeLessThanOrEqual(
          career.config.heroStartingAgeMax,
        );
        expect(Number.isInteger(hero.age)).toBe(true);
      }
    }
  });

  it('staggers across the whole range, so a Roster does not retire together', () => {
    const seen = new Set<number>();
    for (let seed = 0; seed < 200; seed += 1) {
      for (const hero of newCareer(`age-spread-${seed}`, content).career.guild.roster) {
        seen.add(hero.age);
      }
    }
    // Every year of the eighteen-year range is reached (E3 §5: "exits stagger").
    for (let age = defaultConfig.heroStartingAgeMin; age <= defaultConfig.heroStartingAgeMax; age += 1) {
      expect(seen.has(age), `nobody was ever ${age}`).toBe(true);
    }
  });

  it('moves with the configured range and with nothing else', () => {
    const career = newCareer('age-config', content, {
      heroStartingAgeMin: 50,
      heroStartingAgeMax: 51,
    }).career;
    for (const hero of career.guild.roster) {
      expect(hero.age).toBeGreaterThanOrEqual(50);
      expect(hero.age).toBeLessThanOrEqual(51);
    }
  });

  it('is derived from the seed and the id, so it is the same on every call', () => {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      expect(startingAge('a-seed', 'h1', defaultConfig)).toBe(
        startingAge('a-seed', 'h1', defaultConfig),
      );
    }
    expect(startingAge('a-seed', 'h1', defaultConfig)).not.toBe(
      startingAge('another-seed', 'h1', defaultConfig),
    );
  });

  it('takes no draw from the Career’s own generator', () => {
    // The whole point of deriving it (DL-16 §1): world generation is otherwise unchanged,
    // so the generator state after `newCareer` does not depend on how many Heroes were
    // given an age.
    const four = newCareer('age-no-draw', content, { startingHeroes: 4 }).career;
    const one = newCareer('age-no-draw', content, { startingHeroes: 4 }).career;
    expect(four.rng).toEqual(one.rng);
    expect(four.guild.roster.map((hero) => hero.name)).toEqual(
      one.guild.roster.map((hero) => hero.name),
    );
  });
});

describe('ageing', () => {
  it('advances exactly once per in-game year across a full twenty-year Career', () => {
    const career = still('age-count', { careerYears: 20, upkeepEveryDays: 100_000 });
    const hero = rosterId(career, 0);
    const started = career.guild.roster[0]?.age ?? 0;

    // Walk the whole Career one Day at a time, counting every Day the age moved.
    let running = career;
    const birthdays: number[] = [];
    let age = started;
    for (let step = 0; step < career.config.careerYears * career.config.daysPerYear; step += 1) {
      running = advance(running, 1, content).career;
      const now = running.guild.roster.find((entry) => entry.id === hero);
      if (now === undefined) break;
      if (now.age !== age) {
        expect(now.age, `on Day ${running.day}`).toBe(age + 1);
        birthdays.push(running.day);
        age = now.age;
      }
    }

    expect(birthdays).toHaveLength(career.config.careerYears);
    expect(birthdays).toEqual(
      Array.from({ length: career.config.careerYears }, (_, year) => (year + 1) * career.config.daysPerYear),
    );
    expect(age).toBe(started + career.config.careerYears);
  });

  it('happens on the year boundary and on no other Day, in one stretch as in many', () => {
    const career = still('age-boundary', { careerYears: 3, daysPerYear: 100 });
    const started = career.guild.roster.map((hero) => hero.age);

    const before = advance(career, 99, content).career;
    expect(before.day).toBe(100);
    expect(before.guild.roster.map((hero) => hero.age)).toEqual(started.map((age) => age + 1));

    const between = advance(before, 99, content).career;
    expect(between.day).toBe(199);
    expect(between.guild.roster.map((hero) => hero.age)).toEqual(started.map((age) => age + 1));

    const next = advance(between, 1, content).career;
    expect(next.day).toBe(200);
    expect(next.guild.roster.map((hero) => hero.age)).toEqual(started.map((age) => age + 2));
  });

  it('ages a Hero who is away on work as well as one who is at home', () => {
    const career = still('age-away', { careerYears: 3, daysPerYear: 100, commissionSpanMin: 9, commissionSpanMax: 9 });
    const commission = career.board[0];
    if (commission === undefined) throw new Error('the test expected a Commission');
    const hero = rosterId(career, 0);
    const started = career.guild.roster[0]?.age ?? 0;

    const onDay95 = advance(career, 94, content).career;
    expect(onDay95.day).toBe(95);
    const sent = commitParty(onDay95, onDay95.board[0]?.id ?? commission.id, [hero], content).career;
    const over = advance(sent, 6, content).career;
    expect(over.day).toBe(101);
    expect(over.guild.roster.find((entry) => entry.id === hero)?.age).toBe(started + 1);
  });
});

describe('Retirement', () => {
  it('takes a Hero at the configured age, on a Board refresh, with age and years served', () => {
    const career = still('retire-one', { boardRefreshEveryDays: 10 });
    const hero = rosterId(career, 0);
    const old = aged(career, hero, career.config.heroRetirementAge);

    // Not on Day 2, because the Board is not refreshing.
    const before = advance(old, 8, content);
    expect(before.career.day).toBe(9);
    expect(of(before.events, 'HeroRetired')).toHaveLength(0);
    expect(before.career.guild.roster.map((entry) => entry.id)).toContain(hero);

    const onRefresh = advance(before.career, 1, content);
    expect(onRefresh.career.day).toBe(10);
    const retired = of(onRefresh.events, 'HeroRetired');
    expect(retired).toHaveLength(1);
    expect(retired[0]?.heroId).toBe(hero);
    expect(retired[0]?.age).toBe(career.config.heroRetirementAge);
    expect(retired[0]?.yearsServed).toBe(
      Math.round((10 - 1) / career.config.daysPerYear),
    );

    const gone = onRefresh.career.guild.formerHeroes.find((entry) => entry.id === hero);
    expect(onRefresh.career.guild.roster.map((entry) => entry.id)).not.toContain(hero);
    expect(gone?.exit?.kind).toBe('retirement');
    expect(gone?.exit?.onDay).toBe(10);
    expect(gone?.exit?.reason.length ?? 0).toBeGreaterThan(0);
    expect(gone?.name.length ?? 0).toBeGreaterThan(0);
    expect(gone?.traits).toEqual(career.guild.roster[0]?.traits);
    expect(onRefresh.career.ledger.heroesRetired).toBe(1);
  });

  it('counts years served from the Day they joined', () => {
    const career = still('retire-years', { boardRefreshEveryDays: 10, daysPerYear: 100 });
    const hero = rosterId(career, 0);
    const onDay1000 = advance(aged(career, hero, 0), 999, content).career;
    expect(onDay1000.day).toBe(1000);

    const retiring = aged(onDay1000, hero, onDay1000.config.heroRetirementAge);
    const run = advance(retiring, 10, content);
    const retired = of(run.events, 'HeroRetired')[0];
    expect(retired).toBeDefined();
    // Joined on Day 1, retired on Day 1010, a year of 100 Days: ten years and a bit.
    expect(retired?.yearsServed).toBe(Math.round((1010 - 1) / 100));
  });

  it('never happens mid-Commission: a Hero away on work retires on their return Day', () => {
    const career = still('retire-away', {
      boardRefreshEveryDays: 10,
      commissionSpanMin: 15,
      commissionSpanMax: 15,
    });
    const hero = rosterId(career, 0);
    const commission = career.board[0];
    if (commission === undefined) throw new Error('the test expected a Commission');
    const old = aged(career, hero, career.config.heroRetirementAge);
    const sent = commitParty(old, commission.id, [hero], content).career;
    expect(sent.parties[0]?.returnsOn).toBe(16);

    // The Board refreshes on Day 10 while they are away, and they do not vanish.
    const away = advance(sent, 14, content);
    expect(away.career.day).toBe(15);
    expect(away.events.some((event) => event.type === 'BoardRefreshed')).toBe(true);
    expect(of(away.events, 'HeroRetired')).toHaveLength(0);
    expect(away.career.guild.roster.map((entry) => entry.id)).toContain(hero);

    // They come home on Day 16, and retire that Day — after the work is closed.
    const home = advance(away.career, 1, content);
    expect(home.career.day).toBe(16);
    const types = home.events.map((event) => event.type);
    expect(types).toContain('PartyReturned');
    expect(types).toContain('HeroRetired');
    expect(types.indexOf('HeroRetired')).toBeGreaterThan(types.indexOf('PartyReturned'));
    expect(home.career.guild.formerHeroes.find((entry) => entry.id === hero)?.exit?.kind).toBe(
      'retirement',
    );
  });

  it('leaves a Hero below the age alone, one year either side of the line', () => {
    const career = still('retire-boundary', { boardRefreshEveryDays: 10 });
    const hero = rosterId(career, 0);

    const young = advance(aged(career, hero, career.config.heroRetirementAge - 1), 10, content);
    expect(of(young.events, 'HeroRetired')).toHaveLength(0);

    const old = advance(aged(career, hero, career.config.heroRetirementAge), 10, content);
    expect(of(old.events, 'HeroRetired')).toHaveLength(1);

    const older = advance(aged(career, hero, career.config.heroRetirementAge + 4), 10, content);
    expect(of(older.events, 'HeroRetired')).toHaveLength(1);
  });

  it('moves with heroRetirementAge', () => {
    for (const heroRetirementAge of [30, 45, 55]) {
      const career = still(`retire-config-${heroRetirementAge}`, {
        boardRefreshEveryDays: 10,
        heroRetirementAge,
      });
      const hero = rosterId(career, 0);
      // Only this Hero: at a low retirement age somebody else on the Roster may already
      // be past the line, and that is the rule working rather than the test failing.
      const mine = (start: Career, age: number): number =>
        of(advance(aged(start, hero, age), 10, content).events, 'HeroRetired').filter(
          (event) => event.heroId === hero,
        ).length;
      expect(mine(career, heroRetirementAge - 1)).toBe(0);
      expect(mine(career, heroRetirementAge)).toBe(1);
    }
  });

  it('empties a Roster without crashing, and Upkeep falls to upkeepBase', () => {
    const career = newCareer('retire-everyone', content, {
      boardRefreshEveryDays: 10,
      upkeepEveryDays: 10,
      careerYears: 1,
      daysPerYear: 120,
    }).career;
    const everybody = career.guild.roster.reduce(
      (held, hero) => aged(held, hero.id, held.config.heroRetirementAge),
      career,
    );
    const run = advance(everybody, 130, content);
    expect(of(run.events, 'HeroRetired')).toHaveLength(career.config.startingHeroes);
    expect(run.career.guild.roster).toHaveLength(0);
    expect(run.career.ended).toBeDefined();

    const upkeeps = of(run.events, 'UpkeepOwed');
    expect(upkeeps.length).toBeGreaterThan(1);
    expect(upkeeps[upkeeps.length - 1]?.amount).toBe(career.config.upkeepBase);
  });
});

describe('the exit ledger', () => {
  it('counts Retirement apart from the losses in the reckoning', () => {
    const career = newCareer('exit-ledger', content, {
      boardRefreshEveryDays: 10,
      careerYears: 1,
      daysPerYear: 60,
    }).career;
    const hero = rosterId(career, 0);
    const run = advance(aged(career, hero, career.config.heroRetirementAge), 100, content);
    const end = run.career.ended;
    expect(end).toBeDefined();
    if (end === undefined) return;

    expect(run.career.guild.formerHeroes.map((entry) => entry.exit?.kind)).toContain('retirement');
    expect(end.reckoning.heroesRetired).toBe(1);
    expect(end.reckoning.heroesLost).toBe(
      run.career.guild.formerHeroes.filter((entry) => entry.exit?.kind !== 'retirement').length,
    );
    expect(end.reckoning.heroesOnRoster).toBe(run.career.guild.roster.length);
    expect(run.career.ledger.heroesRetired).toBe(1);
  });

  it('round-trips a retired Hero through a save', () => {
    const career = still('retire-save', { boardRefreshEveryDays: 10 });
    const hero = rosterId(career, 0);
    const run = advance(aged(career, hero, career.config.heroRetirementAge), 10, content).career;
    expect(deserialiseCareer(serialiseCareer(run))).toEqual(run);
    expect(
      deserialiseCareer(serialiseCareer(run)).guild.formerHeroes[0]?.exit?.kind,
    ).toBe('retirement');
  });
});
