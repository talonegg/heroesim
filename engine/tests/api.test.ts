/**
 * The API contract suite (DL-04). The engine has no HTTP surface by design; its API is
 * the functions it exports, so this is where determinism, immutability, the typed
 * rejections and the full-Career smoke runs are proved.
 */

import { describe, expect, it } from 'vitest';
import {
  advance,
  advanceUntilAttention,
  availableHeroes,
  commissionById,
  commitParty,
  heroById,
  standing,
} from '../src/career.js';
import type { GameConfig } from '../src/config.js';
import { EngineError } from '../src/errors.js';
import type { GameEvent } from '../src/events.js';
import { deserialiseCareer, serialiseCareer } from '../src/save.js';
import type { Career } from '../src/types.js';
import { newCareer } from '../src/world.js';
import { autoPlay, deepFreeze, fixtureContent } from './fixtures.js';

const content = deepFreeze(fixtureContent);

function play(seed: string, config?: Partial<GameConfig>): { career: Career; events: GameEvent[] } {
  const events: GameEvent[] = [];
  const opened = newCareer(seed, content, config);
  events.push(...opened.events);
  const career = autoPlay(opened.career, content, {
    onEvents: (produced) => events.push(...produced),
  });
  return { career, events };
}

describe('determinism', () => {
  it('tells the same story twice from the same seed and the same decisions', () => {
    const once = play('determinism', { careerYears: 1, daysPerYear: 180 });
    const twice = play('determinism', { careerYears: 1, daysPerYear: 180 });
    expect(twice.events).toEqual(once.events);
    expect(twice.career).toEqual(once.career);
  });

  it('tells a different story from a different seed', () => {
    const one = play('determinism-a', { careerYears: 1, daysPerYear: 180 });
    const other = play('determinism-b', { careerYears: 1, daysPerYear: 180 });
    expect(other.events).not.toEqual(one.events);
  });

  it('is unaffected by a save and load along the way', () => {
    const opened = newCareer('resumable', content, { careerYears: 1, daysPerYear: 120 }).career;
    const midway = advance(opened, 55, content).career;
    const straightOn = autoPlay(midway, content);
    const afterLoad = autoPlay(deserialiseCareer(serialiseCareer(midway)), content);
    expect(afterLoad).toEqual(straightOn);
  });
});

describe('immutability', () => {
  const frozen = deepFreeze(newCareer('immutable', content).career);

  it('does not touch the Career handed to newCareer’s successors', () => {
    const snapshot = serialiseCareer(frozen);
    advance(frozen, 12, content);
    advanceUntilAttention(frozen, content);
    availableHeroes(frozen);
    standing(frozen);
    expect(serialiseCareer(frozen)).toBe(snapshot);
  });

  it('does not touch the Career or the Hero list handed to commitParty', () => {
    const snapshot = serialiseCareer(frozen);
    const commission = frozen.board[0];
    if (commission === undefined) throw new Error('the test expected a Commission');
    const heroIds = Object.freeze(frozen.guild.roster.slice(0, 2).map((hero) => hero.id));
    const step = commitParty(frozen, commission.id, [...heroIds], content);
    expect(serialiseCareer(frozen)).toBe(snapshot);
    expect(step.career).not.toBe(frozen);
    expect(step.career.parties).toHaveLength(1);
    expect(frozen.parties).toHaveLength(0);
  });

  it('returns a Career that shares nothing with the one it was given', () => {
    const step = advance(frozen, 3, content);
    expect(step.career.guild).not.toBe(frozen.guild);
    expect(step.career.guild.roster[0]).not.toBe(frozen.guild.roster[0]);
    expect(step.career.config).not.toBe(frozen.config);
    expect(step.career.rng).not.toBe(frozen.rng);
  });
});

describe('the documented rejections', () => {
  const career = newCareer('rejections', content).career;
  const commission = career.board[0];
  const heroIds = career.guild.roster.map((hero) => hero.id);

  function rejection(run: () => unknown): EngineError {
    try {
      run();
    } catch (thrown) {
      if (thrown instanceof EngineError) return thrown;
      throw thrown;
    }
    throw new Error('the call was expected to be rejected and was not');
  }

  it('refuses an empty Party', () => {
    const error = rejection(() => commitParty(career, commission?.id ?? '', [], content));
    expect(error.code).toBe('EmptyParty');
    expect(error.name).toBe('EngineError');
  });

  it('refuses a Commission that is not on the Board', () => {
    expect(rejection(() => commitParty(career, 'not-a-commission', heroIds, content)).code).toBe(
      'CommissionNotOnBoard',
    );
  });

  it('refuses a Commission that has expired', () => {
    const stale = deserialiseCareer(serialiseCareer(career));
    for (const entry of stale.board) entry.expiresOn = stale.day;
    expect(rejection(() => commitParty(stale, commission?.id ?? '', heroIds, content)).code).toBe(
      'CommissionNotOnBoard',
    );
  });

  it('refuses a Hero who is not on the Roster', () => {
    expect(rejection(() => commitParty(career, commission?.id ?? '', ['nobody'], content)).code).toBe(
      'HeroNotAvailable',
    );
  });

  it('refuses a Hero who is already away', () => {
    const first = career.board[0];
    const second = career.board[1];
    if (first === undefined || second === undefined) throw new Error('the test expected two Commissions');
    const sent = commitParty(career, first.id, heroIds.slice(0, 2), content).career;
    expect(rejection(() => commitParty(sent, second.id, heroIds.slice(0, 2), content)).code).toBe(
      'HeroNotAvailable',
    );
  });

  it('refuses the same Hero twice in one Party', () => {
    const twice = [heroIds[0] ?? '', heroIds[0] ?? ''];
    expect(rejection(() => commitParty(career, commission?.id ?? '', twice, content)).code).toBe(
      'HeroNotAvailable',
    );
  });

  it('refuses anything at all once the Career has ended', () => {
    const ended = advance(
      newCareer('finished', content, { careerYears: 1, daysPerYear: 10 }).career,
      40,
      content,
    ).career;
    expect(ended.ended).toBeDefined();
    const anything = ended.board[0]?.id ?? 'c1.1';
    expect(rejection(() => commitParty(ended, anything, heroIds, content)).code).toBe('CareerEnded');
  });
});

describe('the read-only queries', () => {
  const career = newCareer('queries', content).career;

  it('finds a Hero by id, and nothing for an id that is not one', () => {
    const hero = career.guild.roster[0];
    if (hero === undefined) throw new Error('the test expected a Hero');
    expect(heroById(career, hero.id)).toEqual(hero);
    expect(heroById(career, 'nobody')).toBeUndefined();
  });

  it('finds a Commission on the Board, out with a Party, and after it has come back', () => {
    const commission = career.board[0];
    if (commission === undefined) throw new Error('the test expected a Commission');
    expect(commissionById(career, commission.id)).toEqual(commission);

    const sent = commitParty(career, commission.id, [career.guild.roster[0]?.id ?? ''], content).career;
    expect(sent.board.find((entry) => entry.id === commission.id)).toBeUndefined();
    expect(commissionById(sent, commission.id)?.title).toBe(commission.title);

    const home = advance(sent, commission.spanDays, content).career;
    expect(home.parties).toHaveLength(0);
    expect(commissionById(home, commission.id)?.title).toBe(commission.title);
    expect(commissionById(home, 'nothing')).toBeUndefined();
  });

  it('reports who is free to be sent', () => {
    const commission = career.board[0];
    if (commission === undefined) throw new Error('the test expected a Commission');
    const away = career.guild.roster.slice(0, 2).map((hero) => hero.id);
    const sent = commitParty(career, commission.id, away, content).career;
    expect(availableHeroes(sent).map((hero) => hero.id)).toEqual(
      career.guild.roster.map((hero) => hero.id).filter((id) => !away.includes(id)),
    );
  });
});

describe('a Commission of five Beats', () => {
  it('tells more than one kind of story', () => {
    const fiveBeats: Partial<GameConfig> = {
      beatsMin: 5,
      beatsMax: 5,
      commissionSpanMin: 9,
      commissionSpanMax: 9,
      boardRefreshEveryDays: 40,
    };
    for (let seed = 0; seed < 8; seed += 1) {
      const career = newCareer(`five-${seed}`, content, fiveBeats).career;
      const commission = career.board[0];
      if (commission === undefined) throw new Error('the test expected a Commission');
      const sent = commitParty(
        career,
        commission.id,
        career.guild.roster.map((hero) => hero.id),
        content,
      ).career;
      const run = advance(sent, commission.spanDays, content);
      const used = run.events
        .filter((event) => event.type === 'BeatResolved')
        .map((event) => event.vignetteId);
      expect(used).toHaveLength(5);
      expect(new Set(used).size).toBeGreaterThanOrEqual(3);
    }
  });
});

describe('two hundred Careers', () => {
  it(
    'all reach an ending, and most of them reach Retirement',
    () => {
      const endings = { retirement: 0, insolvency: 0 };
      for (let seed = 0; seed < 200; seed += 1) {
        const career = autoPlay(newCareer(`smoke-${seed}`, content).career, content);
        const end = career.ended;
        expect(end).toBeDefined();
        if (end === undefined) continue;
        endings[end.reason] += 1;
        expect(end.onDay).toBe(career.day);
        expect(end.reckoning.finalCoin).toBe(career.guild.coin);
        expect(end.reckoning.commissionsCompleted).toBe(career.ledger.commissionsCompleted);
        expect(end.reckoning.peakCoin).toBeGreaterThanOrEqual(end.reckoning.finalCoin);
      }
      expect(endings.retirement + endings.insolvency).toBe(200);
      expect(endings.retirement / 200).toBeGreaterThanOrEqual(0.6);
    },
    180_000,
  );
});
