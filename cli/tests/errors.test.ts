/**
 * E7-S5: every `EngineError` code has a sentence a person can act on, the map is
 * exhaustive over the union, and no sentence names an identifier, a type or a function.
 *
 * **There is one map, and it is `narrate`'s.** `cli/src/errors.ts` is a re-export, not a
 * second copy — E8-S2 moved `errorSentence` into the shared package so that the terminal
 * and the browser say the same thing about the same rejection, and this asserts against
 * that one map through the module the CLI actually imports.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { errorSentence as narrated } from '@heroesim/narrate';
import type { EngineErrorCode } from '@heroesim/engine';
import { errorSentence } from '../src/errors.js';

/**
 * Exhaustive by the type checker rather than by counting: adding a code to the engine
 * fails the build here until somebody writes its sentence.
 */
const EVERY_CODE = {
  CommissionNotOnBoard: true,
  HeroNotAvailable: true,
  EmptyParty: true,
  HeroRefused: true,
  CareerEnded: true,
  InsufficientCoin: true,
  AlreadyImproved: true,
  NoSuchApplicant: true,
  RosterFull: true,
  NoSuchRival: true,
  NoSuchHero: true,
  NoSuchParty: true,
  NotAwaitingWord: true,
  NoSuchOption: true,
  InternalError: true,
} satisfies Record<EngineErrorCode, true>;

const CODES = Object.keys(EVERY_CODE) as EngineErrorCode[];

describe('the one map', () => {
  it('is narrate’s, re-exported and not copied', () => {
    expect(errorSentence).toBe(narrated);
    const source = readFileSync(
      fileURLToPath(new URL('../src/errors.ts', import.meta.url)),
      'utf8',
    );
    // No code at all but the re-export: everything else in the file is a comment.
    const code = source
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith('//'));
    expect(code).toEqual(["export { errorSentence } from '@heroesim/narrate';"]);
  });

  it('has a sentence for every code, and a different one for each', () => {
    for (const code of CODES) expect(errorSentence(code).length).toBeGreaterThan(0);
    expect(new Set(CODES.map((code) => errorSentence(code))).size).toBe(CODES.length);
  });
});

describe('every sentence', () => {
  it('is a sentence: it starts with a capital and ends in a full stop', () => {
    for (const code of CODES) {
      const said = errorSentence(code);
      expect(said, code).toMatch(/^[A-Z"]/);
      expect(said, code).toMatch(/\.$/);
    }
  });

  it('names no identifier, no type and no function', () => {
    for (const code of CODES) {
      const said = errorSentence(code);
      // The code itself, which is the commonest way a front end leaks one.
      expect(said, code).not.toContain(code);
      // camelCase or PascalCase run-together words, a call, a path, or an underscore.
      expect(said, code).not.toMatch(/[a-z][A-Z]/);
      expect(said, code).not.toContain('()');
      expect(said, code).not.toContain('_');
      expect(said, code).not.toContain('`');
      expect(said, code).not.toMatch(/\.[a-z]+\(/);
    }
  });

  it('uses the vocabulary and none of the words it forbids', () => {
    const forbidden = [
      'quest',
      'job',
      'mission',
      'reputation',
      'loyalty',
      'morale',
      'team',
      'squad',
      'roll',
      'turn',
      'rank',
      'leaderboard',
      'score',
    ];
    for (const code of CODES) {
      const said = errorSentence(code).toLowerCase();
      for (const word of forbidden) {
        expect(new RegExp(`\\b${word}\\b`).test(said), `${code}: "${word}"`).toBe(false);
      }
    }
  });

  it('tells the player something they can do about it', () => {
    // Each of these is a rejection a player meets in play, and each one has to say what
    // would change it rather than merely that it was refused.
    expect(errorSentence('InsufficientCoin', { detail: '200 coin' })).toContain('200 coin');
    expect(errorSentence('InsufficientCoin')).toMatch(/Finish more work/);
    expect(errorSentence('RosterFull', { detail: 12 })).toContain('12');
    expect(errorSentence('RosterFull')).toMatch(/until somebody leaves/);
    expect(errorSentence('HeroRefused', { hero: 'Brenna' })).toContain('Brenna');
    expect(errorSentence('HeroRefused')).toMatch(/Insist/);
    expect(errorSentence('HeroNotAvailable', { hero: 'Tam' })).toContain('Tam');
    expect(errorSentence('CommissionNotOnBoard', { commission: 'The tithe barge' })).toContain(
      'The tithe barge',
    );
  });

  it('is plain English at 40 columns: no word is longer than the floor', () => {
    for (const code of CODES) {
      for (const word of errorSentence(code).split(/\s+/)) {
        expect(word.length, `${code}: "${word}"`).toBeLessThanOrEqual(40);
      }
    }
  });
});
