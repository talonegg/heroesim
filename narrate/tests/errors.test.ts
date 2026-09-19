/**
 * Every `EngineErrorCode` has a sentence. The map below is `satisfies
 * Record<EngineErrorCode, true>`, so adding a code to the engine fails the type check
 * here until somebody writes its sentence — the exhaustive switch in `errorSentence`
 * fails at the same moment.
 */

import { describe, expect, it } from 'vitest';
import { commitParty, EngineError, newCareer, type EngineErrorCode } from '@heroesim/engine';
import { errorSentence, formatDay, reckoningLines } from '../src/index.js';
import { content, playCareer } from './helpers.js';

const CODES = {
  CommissionNotOnBoard: true,
  HeroNotAvailable: true,
  EmptyParty: true,
  CareerEnded: true,
  InternalError: true,
} satisfies Record<EngineErrorCode, true>;

const ALL = Object.keys(CODES) as EngineErrorCode[];

describe('errorSentence', () => {
  it('has a sentence for every code', () => {
    for (const code of ALL) {
      const text = errorSentence(code);
      expect(text.length).toBeGreaterThan(0);
      expect(text).toMatch(/\.$/);
      expect(text).not.toContain(code);
    }
  });

  it('gives each code its own sentence', () => {
    expect(new Set(ALL.map((code) => errorSentence(code))).size).toBe(ALL.length);
  });

  it('uses the specifics it is given', () => {
    expect(errorSentence('CommissionNotOnBoard', { commission: 'The tithe barge' })).toContain(
      'The tithe barge',
    );
    expect(errorSentence('HeroNotAvailable', { hero: 'Brenna' })).toContain('Brenna');
  });

  it('answers what the engine actually throws', () => {
    const { career } = newCareer('error-sentences', content);
    const hero = career.guild.roster[0];
    if (hero === undefined) throw new Error('no Roster');

    const thrown: EngineError[] = [];
    const attempt = (run: () => unknown): void => {
      try {
        run();
      } catch (error) {
        if (error instanceof EngineError) thrown.push(error);
        else throw error;
      }
    };

    attempt(() => commitParty(career, 'no-such-commission', [hero.id], content));
    attempt(() => commitParty(career, career.board[0]?.id ?? '', [], content));
    attempt(() => commitParty(career, career.board[0]?.id ?? '', ['no-such-hero'], content));

    expect(thrown.map((error) => error.code)).toEqual([
      'CommissionNotOnBoard',
      'EmptyParty',
      'HeroNotAvailable',
    ]);
    for (const error of thrown) {
      expect(errorSentence(error.code).length).toBeGreaterThan(0);
    }
  });
});

describe('formatDay', () => {
  const { career } = newCareer('format-day', content);

  it('counts years and Days from one', () => {
    expect(formatDay(1, career)).toBe('Year 1, Day 1');
    expect(formatDay(career.config.daysPerYear, career)).toBe(
      `Year 1, Day ${career.config.daysPerYear}`,
    );
    expect(formatDay(career.config.daysPerYear + 1, career)).toBe('Year 2, Day 1');
    expect(formatDay(career.config.daysPerYear * 2 + 47, career)).toBe('Year 3, Day 47');
  });
});

describe('reckoningLines', () => {
  const { career } = playCareer('reckoning-lines', { careerYears: 1 });

  it('names the Guild, the Guildmaster and what the Guild became', () => {
    const end = career.ended;
    if (end === undefined) throw new Error('the Career did not end');
    const lines = reckoningLines(end.reckoning, career);

    expect(lines.length).toBeGreaterThan(5);
    expect(lines[0]).toContain(career.guild.name);
    expect(lines[0]).toContain(career.guild.guildmaster.name);
    expect(lines.some((line) => line.startsWith('Commissions:'))).toBe(true);
    expect(lines.some((line) => line.startsWith('Heroes:'))).toBe(true);
    expect(lines.some((line) => line.startsWith('Coin:'))).toBe(true);
    expect(lines.some((line) => line.startsWith('Standing:'))).toBe(true);
    expect(lines.some((line) => line.includes('Might'))).toBe(true);
    for (const line of lines) {
      expect(line).not.toContain('{');
      expect(line).not.toContain('undefined');
    }
  });
});
