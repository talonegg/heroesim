/**
 * A real Career, played by the automatic policy from a fixed seed, narrated the way a
 * front end narrates it. The assertions are on the structure and on the lines `narrate`
 * writes itself; the Vignettes' own prose is deliberately not asserted on, so that
 * rewording a Vignette never breaks a test (ADR-0002).
 */

import { describe, expect, it } from 'vitest';
import type { Paragraph, ParagraphKind } from '../src/index.js';
import { playCareer } from './helpers.js';

const { career, paragraphs } = playCareer('narrate-one-year', { careerYears: 1 });

function kinds(all: readonly Paragraph[]): Set<ParagraphKind> {
  return new Set(all.map((entry) => entry.kind));
}

describe('a one-year Career, narrated', () => {
  it('runs to an end', () => {
    expect(career.ended).toBeDefined();
  });

  it('produces paragraphs', () => {
    expect(paragraphs.length).toBeGreaterThan(50);
  });

  it('produces them in Day order', () => {
    let previous = 0;
    for (const entry of paragraphs) {
      expect(entry.day).toBeGreaterThanOrEqual(previous);
      previous = entry.day;
    }
  });

  it('never produces an empty paragraph', () => {
    for (const entry of paragraphs) {
      expect(entry.text.trim().length).toBeGreaterThan(0);
    }
  });

  it('never leaves a token unfilled', () => {
    for (const entry of paragraphs) {
      expect(entry.text).not.toContain('{');
    }
  });

  it('covers every kind of paragraph the loop can produce', () => {
    // `word` and `answer` join the seven E1–E5 kinds because the authored content now
    // ships Decisions and a one-year Career meets one (E6-S4). The seven before them are
    // unchanged, which is the half of that acceptance box worth guarding.
    expect(kinds(paragraphs)).toEqual(
      new Set<ParagraphKind>([
        'note',
        'board',
        'commit',
        'beat',
        'return',
        'coin',
        'end',
        'word',
        'answer',
      ]),
    );
  });

  it('tags a Party’s Beats and its return with the same partyId, so they read as one report', () => {
    const returns = paragraphs.filter((entry) => entry.kind === 'return');
    expect(returns.length).toBeGreaterThan(0);
    for (const entry of returns) {
      expect(entry.partyId).toBeDefined();
      const beats = paragraphs.filter(
        (other) => other.kind === 'beat' && other.partyId === entry.partyId,
      );
      expect(beats.length).toBeGreaterThan(0);
      for (const beat of beats) expect(beat.day).toBeLessThanOrEqual(entry.day);
    }
  });
});

describe('the lines narrate writes itself', () => {
  it('states Upkeep and what is left, and never abbreviates coin', () => {
    const coin = paragraphs.filter((entry) => entry.kind === 'coin');
    expect(coin.length).toBeGreaterThan(0);
    for (const entry of coin) {
      expect(entry.text).toMatch(/^Upkeep of \d+ coin falls due\. -?\d+ coin remains\.$/);
    }
  });

  it('names the Commission, the Patron, the outcome, the fee and who came back', () => {
    const returns = paragraphs.filter((entry) => entry.kind === 'return');
    for (const entry of returns) {
      expect(entry.text).toMatch(/the work was (not )?finished\./);
      expect(entry.text).toContain('came back.');
      expect(entry.text).toMatch(/(The fee of \d+ coin was paid\.|Nothing was paid for it\.)/);
    }
    expect(returns.some((entry) => entry.text.includes('The fee of'))).toBe(true);
  });

  it('says who set out, with what Backing, and when they are due back', () => {
    const commits = paragraphs.filter((entry) => entry.kind === 'commit');
    expect(commits.length).toBeGreaterThan(0);
    for (const entry of commits) {
      expect(entry.text).toMatch(/set out on /);
      expect(entry.text).toMatch(
        /(with Backing of \d+|with no Backing|worse off by \d+ for what they think of you)/,
      );
      expect(entry.text).toMatch(/due back on Year \d+, Day \d+\./);
    }
  });

  it('reports the Board as what is new, what a Rival took and what lapsed', () => {
    const boards = paragraphs.filter((entry) => entry.kind === 'board');
    expect(boards.length).toBeGreaterThan(0);
    for (const entry of boards) {
      expect(entry.text).toMatch(/(New on the Board: |Nothing new was posted to the Board\.)/);
    }
    expect(boards.some((entry) => entry.text.includes(' took '))).toBe(true);
    expect(boards.some((entry) => entry.text.includes('lapsed unclaimed:'))).toBe(true);
  });

  it('folds Regard movements into a short note rather than a paragraph each', () => {
    const notes = paragraphs.filter((entry) => entry.kind === 'note');
    expect(notes.some((entry) => entry.text.startsWith('You take over '))).toBe(true);
    expect(notes.some((entry) => entry.text.includes('Regard from '))).toBe(true);
    for (const entry of notes) {
      expect(entry.text).not.toContain('ConsequenceApplied');
    }
  });

  it('ends with the reckoning', () => {
    const last = paragraphs[paragraphs.length - 1];
    if (last === undefined) throw new Error('no paragraphs');
    expect(last.kind).toBe('end');
    expect(last.text).toContain('Commissions:');
    expect(last.text).toContain('Standing:');
    expect(last.text).toContain('Coin:');
    expect(last.text.split('\n').length).toBeGreaterThan(5);
  });

  it('keeps the tone plain: no emoji and no exclamation marks in what narrate writes', () => {
    const authored: ParagraphKind[] = ['return', 'board', 'coin', 'commit', 'end', 'note'];
    for (const entry of paragraphs) {
      if (!authored.includes(entry.kind)) continue;
      expect(entry.text).not.toContain('!');
      expect(entry.text).not.toMatch(/\p{Extended_Pictographic}/u);
    }
  });
});

describe('a second seed', () => {
  it('narrates a different Career without a missing name or title', () => {
    const other = playCareer('narrate-one-year-b', { careerYears: 1 });
    expect(other.career.ended).toBeDefined();
    for (const entry of other.paragraphs) {
      expect(entry.text).not.toContain('{');
      expect(entry.text).not.toContain('undefined');
      expect(entry.text.trim().length).toBeGreaterThan(0);
    }
  });
});
