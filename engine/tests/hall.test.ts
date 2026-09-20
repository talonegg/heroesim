/**
 * E3-S4: the Hall, which is the only thing coin buys besides Upkeep.
 *
 * Each improvement gets the same treatment: a value pinned with it and without it, on the
 * same seed and the same world, so what is proved is the improvement's effect and not the
 * dice. Three improvements, bought once each, 700 coin in all.
 */

import { describe, expect, it } from 'vitest';
import {
  advance,
  commitParty,
  defaultConfig,
  deserialiseCareer,
  EngineError,
  hallCost,
  HALL_IMPROVEMENTS,
  improveHall,
  newCareer,
  proposeParty,
  REASON_DRIFTED,
  serialiseCareer,
  type Career,
  type GameConfig,
  type GameEvent,
  type HallImprovement,
} from '../src/index.js';
import { fixtureContent, holdingCoin, hurt, oneVignetteContent } from './fixtures.js';

const content = fixtureContent;
const plain = oneVignetteContent();

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

function boardId(career: Career): string {
  const commission = career.board[0];
  if (commission === undefined) throw new Error('the test expected a Commission on the Board');
  return commission.id;
}

function rejection(run: () => unknown): EngineError {
  try {
    run();
  } catch (thrown) {
    if (thrown instanceof EngineError) return thrown;
    throw thrown;
  }
  throw new Error('the call was expected to be rejected and was not');
}

/** A Career with ample coin and nothing due to happen to it. */
function rich(seed: string, config: Partial<GameConfig> = {}): Career {
  return newCareer(seed, content, {
    startingCoin: 5000,
    upkeepEveryDays: 100_000,
    boardRefreshEveryDays: 10,
    ...config,
  }).career;
}

describe('buying an improvement', () => {
  it('puts it in the Hall, takes the coin, and reports both', () => {
    for (const improvement of HALL_IMPROVEMENTS) {
      const career = rich(`buy-${improvement}`);
      const cost = hallCost(improvement, career.config);
      const step = improveHall(career, improvement);

      expect(step.career.guild.hall).toEqual([improvement]);
      expect(step.career.guild.coin).toBe(career.guild.coin - cost);

      const bought = of(step.events, 'HallImproved');
      expect(bought).toHaveLength(1);
      expect(bought[0]?.improvement).toBe(improvement);
      expect(bought[0]?.cost).toBe(cost);
      expect(bought[0]?.balance).toBe(career.guild.coin - cost);
      expect(bought[0]?.day).toBe(career.day);

      const coin = of(step.events, 'CoinChanged');
      expect(coin).toHaveLength(1);
      expect(coin[0]?.reason).toBe('hall');
      expect(coin[0]?.delta).toBe(-cost);
      expect(coin[0]?.balance).toBe(career.guild.coin - cost);
      // The same movement, reported twice in two shapes and agreeing.
      expect(coin[0]?.balance).toBe(bought[0]?.balance);
    }
  });

  it('costs what GameConfig says it costs, and nothing is a literal', () => {
    const career = rich('buy-cost', {
      hallInfirmaryCost: 7,
      hallTrainingYardCost: 11,
      hallQuartersCost: 13,
    });
    expect(hallCost('infirmary', career.config)).toBe(7);
    expect(hallCost('trainingYard', career.config)).toBe(11);
    expect(hallCost('quarters', career.config)).toBe(13);
    expect(improveHall(career, 'infirmary').career.guild.coin).toBe(career.guild.coin - 7);
    // The shipped defaults, so a change to them is seen here first.
    expect(defaultConfig.hallInfirmaryCost).toBe(200);
    expect(defaultConfig.hallTrainingYardCost).toBe(250);
    expect(defaultConfig.hallQuartersCost).toBe(250);
  });

  it('is legal on any Day, including while a Party is away', () => {
    const career = rich('buy-anytime', { commissionSpanMin: 9, commissionSpanMax: 9 });
    const sent = commitParty(career, boardId(career), [rosterId(career, 0)], content).career;
    const midway = advance(sent, 4, content).career;
    expect(midway.parties).toHaveLength(1);
    expect(improveHall(midway, 'infirmary').career.guild.hall).toEqual(['infirmary']);
  });

  it('keeps all three, in the order they were bought, through a save', () => {
    let career = rich('buy-all');
    for (const improvement of ['quarters', 'infirmary', 'trainingYard'] as HallImprovement[]) {
      career = improveHall(career, improvement).career;
    }
    expect(career.guild.hall).toEqual(['quarters', 'infirmary', 'trainingYard']);
    expect(career.guild.coin).toBe(
      5000 -
        career.config.hallInfirmaryCost -
        career.config.hallTrainingYardCost -
        career.config.hallQuartersCost,
    );
    expect(deserialiseCareer(serialiseCareer(career))).toEqual(career);
    expect(deserialiseCareer(serialiseCareer(career)).guild.hall).toEqual(career.guild.hall);
  });

  it('does not touch the Career it was given', () => {
    const career = rich('buy-immutable');
    const before = serialiseCareer(career);
    improveHall(career, 'infirmary');
    expect(serialiseCareer(career)).toBe(before);
  });
});

describe('an improvement that cannot be bought', () => {
  it('throws InsufficientCoin and leaves the Career byte-identical', () => {
    const career = holdingCoin(rich('poor'), defaultConfig.hallInfirmaryCost - 1);
    const before = serialiseCareer(career);
    const error = rejection(() => improveHall(career, 'infirmary'));
    expect(error.code).toBe('InsufficientCoin');
    expect(error.name).toBe('EngineError');
    expect(serialiseCareer(career)).toBe(before);

    // One coin more and it goes through, so the boundary is where it says it is.
    const exact = holdingCoin(career, defaultConfig.hallInfirmaryCost);
    expect(improveHall(exact, 'infirmary').career.guild.coin).toBe(0);
  });

  it('throws AlreadyImproved and leaves the Career byte-identical', () => {
    const career = improveHall(rich('twice'), 'quarters').career;
    const before = serialiseCareer(career);
    const error = rejection(() => improveHall(career, 'quarters'));
    expect(error.code).toBe('AlreadyImproved');
    expect(serialiseCareer(career)).toBe(before);
    // The other two are still buyable.
    expect(improveHall(career, 'infirmary').career.guild.hall).toEqual(['quarters', 'infirmary']);
  });

  it('throws CareerEnded and leaves the Career byte-identical', () => {
    const ended = advance(
      newCareer('hall-ended', content, { careerYears: 1, daysPerYear: 10, startingCoin: 5000 }).career,
      40,
      content,
    ).career;
    expect(ended.ended).toBeDefined();
    const before = serialiseCareer(ended);
    expect(rejection(() => improveHall(ended, 'infirmary')).code).toBe('CareerEnded');
    expect(serialiseCareer(ended)).toBe(before);
  });

  it('is refused for all three, and for every reason, with nothing spent', () => {
    for (const improvement of HALL_IMPROVEMENTS) {
      const broke = holdingCoin(rich(`refused-${improvement}`), 0);
      expect(rejection(() => improveHall(broke, improvement)).code).toBe('InsufficientCoin');
      expect(broke.guild.coin).toBe(0);
      expect(broke.guild.hall).toEqual([]);
    }
  });
});

describe('the infirmary', () => {
  const forced: Partial<GameConfig> = {
    dcMin: 40,
    dcMax: 40,
    criticalMargin: 100,
    injuryChanceOnFailure: 1,
    injurySpanMin: 21,
    injurySpanMax: 21,
    commissionSpanMin: 6,
    commissionSpanMax: 6,
    beatsMin: 1,
    beatsMax: 1,
    boardRefreshEveryDays: 1000,
    upkeepEveryDays: 1000,
    startingCoin: 5000,
  };

  /** The span of the first Injury this Career's first Beat gives. */
  function spanOf(career: Career): number {
    const commission = career.board[0];
    if (commission === undefined) throw new Error('the test expected a Commission');
    const sent = commitParty(career, commission.id, [rosterId(career, 0)], plain).career;
    const run = advance(sent, 6, plain);
    const injury = of(run.events, 'HeroInjured')[0];
    if (injury === undefined) throw new Error('the test expected an Injury');
    return injury.liftsOn - injury.day;
  }

  it('halves the span of a future Injury, pinned with it and without it', () => {
    const without = newCareer('infirmary-pin', plain, forced).career;
    const withIt = improveHall(without, 'infirmary').career;
    expect(spanOf(without)).toBe(21);
    // ceil(21 × 0.5) = 11.
    expect(spanOf(withIt)).toBe(11);
    expect(Math.ceil(21 * withIt.config.infirmaryInjuryFactor)).toBe(11);
  });

  it('moves with infirmaryInjuryFactor', () => {
    for (const [infirmaryInjuryFactor, expected] of [
      [1, 21],
      [0.5, 11],
      [0.25, 6],
    ] as const) {
      const career = improveHall(
        newCareer('infirmary-factor', plain, { ...forced, infirmaryInjuryFactor }).career,
        'infirmary',
      ).career;
      expect(spanOf(career), `factor ${infirmaryInjuryFactor}`).toBe(expected);
    }
  });

  it('does not shorten an Injury already borne', () => {
    const career = newCareer('infirmary-later', content, {
      startingCoin: 5000,
      boardRefreshEveryDays: 1000,
      upkeepEveryDays: 1000,
    }).career;
    const hero = rosterId(career, 0);
    const injured = hurt(career, hero, 'Bruised', 1, 41);
    const bought = improveHall(injured, 'infirmary').career;
    expect(
      bought.guild.roster.find((entry) => entry.id === hero)?.traits.find((held) => held.name === 'Bruised')
        ?.liftsOn,
    ).toBe(41);
    const run = advance(bought, 45, content);
    expect(of(run.events, 'InjuryLifted')[0]?.day).toBe(41);
  });

  it('shortens an authored Injury as well as one the engine drew', () => {
    // The infirmary is bought once and helps everyone, so it reaches the spans content
    // asked for too: `night-watch`'s failure gives Bruised for six Days.
    const authored = oneVignetteContent([{ kind: 'trait', trait: 'Bruised', days: 6 }]);
    const base: Partial<GameConfig> = {
      ...forced,
      injuryChanceOnFailure: 0,
      startingCoin: 5000,
    };
    const span = (career: Career): number => {
      const sent = commitParty(career, boardId(career), [rosterId(career, 0)], authored).career;
      const run = advance(sent, 6, authored);
      const gained = of(run.events, 'TraitGained')[0];
      if (gained?.liftsOn === undefined) throw new Error('the test expected an authored Injury');
      return gained.liftsOn - gained.day;
    };
    const without = newCareer('infirmary-authored', authored, base).career;
    expect(span(without)).toBe(6);
    expect(span(improveHall(without, 'infirmary').career)).toBe(3);
  });
});

describe('the training yard', () => {
  it('adds its Backing to every Party, pinned with it and without it', () => {
    const career = rich('yard-pin');
    const withIt = improveHall(career, 'trainingYard').career;
    const heroes = [rosterId(career, 0), rosterId(career, 1)];

    const before = proposeParty(career, boardId(career), heroes, content).backing;
    const after = proposeParty(withIt, boardId(withIt), heroes, content).backing;
    expect(after).toBe(before + career.config.trainingYardBacking);

    // And the Party that actually sets out carries it.
    expect(
      of(commitParty(withIt, boardId(withIt), heroes, content).events, 'PartyCommitted')[0]?.backing,
    ).toBe(after);
    expect(
      of(commitParty(career, boardId(career), heroes, content).events, 'PartyCommitted')[0]?.backing,
    ).toBe(before);
  });

  it('is added before the clamp, so it cannot push a Party past backingMax', () => {
    // A Guildmaster whose Backing is already at the ceiling gains nothing from the yard,
    // which is what "before the clamp" means (DL-14 §1 says the same of a Backing Trait).
    const career = rich('yard-clamp', { backingMax: 1, trainingYardBacking: 5 });
    const heroes = [rosterId(career, 0)];
    const withIt = improveHall(career, 'trainingYard').career;
    expect(proposeParty(withIt, boardId(withIt), heroes, content).backing).toBe(
      career.config.backingMax,
    );
  });

  it('lifts a Party off the floor as well, because it is one term of the same sum', () => {
    // The Guildmaster's own Stat term is put out of the way (`backingStatOffset` high
    // enough to clamp it to zero), so what is left is the Regard term at the floor and
    // the yard's contribution to the same sum.
    const career = rich('yard-floor', {
      backingMin: -2,
      trainingYardBacking: 1,
      backingStatOffset: 20,
    });
    const resentful = {
      ...career,
      guild: {
        ...career.guild,
        roster: career.guild.roster.map((hero) => ({
          ...hero,
          regardForGuildmaster: { ...hero.regardForGuildmaster, value: -5 },
        })),
      },
    };
    const heroes = [rosterId(resentful, 0)];
    const before = proposeParty(resentful, boardId(resentful), heroes, content).backing;
    const after = proposeParty(
      improveHall(resentful, 'trainingYard').career,
      boardId(resentful),
      heroes,
      content,
    ).backing;
    expect(before).toBe(resentful.config.backingMin);
    expect(after).toBeGreaterThan(before);
  });

  it('moves with trainingYardBacking', () => {
    for (const trainingYardBacking of [0, 1, 2]) {
      const career = rich(`yard-config-${trainingYardBacking}`, {
        trainingYardBacking,
        backingMax: 9,
      });
      const heroes = [rosterId(career, 0)];
      const before = proposeParty(career, boardId(career), heroes, content).backing;
      const after = proposeParty(
        improveHall(career, 'trainingYard').career,
        boardId(career),
        heroes,
        content,
      ).backing;
      expect(after - before).toBe(trainingYardBacking);
    }
  });
});

describe('the quarters', () => {
  /** The Days on which idleness cost this Career's Roster Regard, over a long quiet run. */
  function driftDays(career: Career): number[] {
    return advance(career, 200, content)
      .events.filter(
        (event) => event.type === 'HeroRegardForGuildmasterChanged' && event.reason === REASON_DRIFTED,
      )
      .map((event) => event.day)
      .filter((day, index, all) => all.indexOf(day) === index);
  }

  it('multiplies the idle threshold, pinned with it and without it', () => {
    const career = rich('quarters-pin', {
      boardRefreshEveryDays: 10,
      regardDecayEveryDays: 30,
      regardDecayQuartersFactor: 2,
    });
    // Without it, drift falls at the first refresh at or after 30 idle Days: Day 40, then
    // every 30 Days after that, at the ten-Day cadence (E2, DL-14 §5).
    expect(driftDays(career)).toEqual([40, 70, 100, 130, 160, 190]);
    // With it, the threshold is 60 Days instead of 30, so neglect takes twice as long.
    expect(driftDays(improveHall(career, 'quarters').career)).toEqual([70, 130, 190]);
  });

  it('moves with regardDecayQuartersFactor', () => {
    const base: Partial<GameConfig> = {
      boardRefreshEveryDays: 10,
      regardDecayEveryDays: 30,
      startingCoin: 5000,
      upkeepEveryDays: 100_000,
    };
    const one = newCareer('quarters-factor', content, {
      ...base,
      regardDecayQuartersFactor: 1,
    }).career;
    const three = newCareer('quarters-factor', content, {
      ...base,
      regardDecayQuartersFactor: 3,
    }).career;
    expect(driftDays(improveHall(one, 'quarters').career)).toEqual([40, 70, 100, 130, 160, 190]);
    expect(driftDays(improveHall(three, 'quarters').career)).toEqual([100, 190]);
  });

  it('does nothing at all until it is bought, which is what E2 measured', () => {
    const career = rich('quarters-unbought', {
      boardRefreshEveryDays: 10,
      regardDecayEveryDays: 30,
      regardDecayQuartersFactor: 2,
    });
    expect(career.guild.hall).toEqual([]);
    expect(driftDays(career)).toEqual([40, 70, 100, 130, 160, 190]);
  });
});
