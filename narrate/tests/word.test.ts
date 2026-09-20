/**
 * E6-S4's half of narration: the `word` paragraph a Party's question becomes, the `answer`
 * paragraph the reply becomes, and `wordProse`, which both front ends read an option's
 * label off. The engine carries ids and numbers; every word here is authored content
 * filled through the same token filler a Vignette's narrative goes through (ADR-0002).
 */

import { describe, expect, it } from 'vitest';
import {
  advance,
  answerParty,
  awaitingParties,
  commitParty,
  newCareer,
  wordOffer,
  type Career,
} from '@heroesim/engine';
import { narrateEvents, wordProse, type Paragraph } from '../src/index.js';
import { content, playCareer } from './helpers.js';

/**
 * The first Commission on the Board that some Decision could actually stop. Since every
 * Decision names the work it belongs to (DL-24 §A3), `board[0]` is no longer certain to be
 * one — and a Commission with nothing eligible simply never stops, which is E6-S2's own
 * rule rather than a seed going wrong. Asked of content rather than pinned to a seed, so
 * this file goes on reading E6's prose on the seeds it always read it on.
 */
function stoppable(career: Career) {
  return (
    career.board.find((commission) =>
      content.decisions.some((decision) =>
        (decision.conditions.tags ?? []).some((tag) => commission.tags.includes(tag)),
      ),
    ) ?? career.board[0]
  );
}

/** A Career on the Day a Party sent word, over the authored content. */
function waiting(seed: string): { career: Career; partyId: string; said: Paragraph[] } {
  const opened = newCareer(seed, content, { startingCoin: 5000, decisionChancePerBeat: 1 });
  const commission = stoppable(opened.career);
  const hero = opened.career.guild.roster[0];
  if (commission === undefined || hero === undefined) throw new Error('expected work and a Hero');
  let career = commitParty(opened.career, commission.id, [hero.id], content).career;
  const said: Paragraph[] = [];
  for (let day = 0; day < 60; day += 1) {
    const run = advance(career, 1, content);
    career = run.career;
    said.push(...narrateEvents(run.events, career, content));
    const party = awaitingParties(career)[0];
    if (party !== undefined) return { career, partyId: party.id, said };
  }
  throw new Error(`no Party sent word on seed "${seed}"`);
}

describe('a Party that has sent word', () => {
  const { career, partyId, said } = waiting('narrate-word');
  const word = said.filter((entry) => entry.kind === 'word');

  it('becomes a paragraph of its own kind, tagged with the Party', () => {
    expect(word).toHaveLength(1);
    expect(word[0]?.partyId).toBe(partyId);
    expect(word[0]?.day).toBe(career.day);
  });

  it('reads as the authored prompt, with every token filled', () => {
    const offer = wordOffer(career, partyId, content);
    if (offer === undefined) throw new Error('expected an offer');
    const prose = wordProse(offer, career, content);
    expect(word[0]?.text.startsWith(prose.prompt)).toBe(true);
    expect(word[0]?.text).not.toContain('{');
    expect(word[0]?.text).not.toContain('undefined');
  });

  it('says when they will stop waiting', () => {
    expect(word[0]?.text).toMatch(/waiting on your word.*after Year \d+, Day \d+\./);
  });

  it('never lists the options: those are a decision, not a paragraph', () => {
    const offer = wordOffer(career, partyId, content);
    if (offer === undefined) throw new Error('expected an offer');
    for (const label of Object.values(wordProse(offer, career, content).labels)) {
      expect(word[0]?.text).not.toContain(label);
    }
  });
});

describe('wordProse', () => {
  const { career, partyId } = waiting('narrate-prose');
  const offer = wordOffer(career, partyId, content);
  if (offer === undefined) throw new Error('expected an offer');
  const prose = wordProse(offer, career, content);

  it('fills a label for every option the offer carries', () => {
    expect(Object.keys(prose.labels).sort()).toEqual(offer.options.map((option) => option.id).sort());
    for (const label of Object.values(prose.labels)) {
      expect(label.length).toBeGreaterThan(0);
      expect(label).not.toContain('{');
    }
  });

  it('keeps the tone plain: no emoji, no exclamation marks, and coin never abbreviated', () => {
    for (const text of [prose.prompt, ...Object.values(prose.labels)]) {
      expect(text).not.toContain('!');
      expect(text).not.toMatch(/\p{Extended_Pictographic}/u);
      expect(text).not.toMatch(/\b\d+\s?c\b/);
    }
  });

  it('refuses to invent words for a Decision that is not loaded', () => {
    expect(() =>
      wordProse({ ...offer, decisionId: 'no-such-decision' }, career, content),
    ).toThrow(/no Decision with id "no-such-decision" is loaded/);
  });
});

describe('the answer', () => {
  const { career, partyId } = waiting('narrate-answer');
  const offer = wordOffer(career, partyId, content);
  if (offer === undefined) throw new Error('expected an offer');
  const labels = wordProse(offer, career, content).labels;

  it('becomes an answer paragraph carrying the option’s own label', () => {
    const step = answerParty(career, partyId, 'turn-back', content);
    const said = narrateEvents(step.events, step.career, content);
    const answer = said.filter((entry) => entry.kind === 'answer');
    expect(answer).toHaveLength(1);
    expect(answer[0]?.partyId).toBe(partyId);
    expect(answer[0]?.text).toContain(labels['turn-back'] ?? '');
    expect(answer[0]?.text).not.toContain('{');
  });

  it('says plainly when nobody answered and the Party decided for itself', () => {
    const run = advance(career, career.config.wordTimeoutDays, content);
    const said = narrateEvents(run.events, run.career, content);
    const answer = said.find((entry) => entry.kind === 'answer');
    expect(answer?.text.startsWith('No word went back in time')).toBe(true);
  });

  it('folds what sending coin cost into the same paragraph', () => {
    const step = answerParty(career, partyId, 'send-coin', content);
    const said = narrateEvents(step.events, step.career, content);
    const answer = said.find((entry) => entry.kind === 'answer');
    // Both figures grouped: this package writes one number format (DL-27 §1), so a
    // four-figure balance carries its separator here exactly as it does in the header.
    expect(answer?.text).toMatch(/It cost the Guild [\d,]+ coin; -?[\d,]+ coin remains\./);
  });

  it('tells a turn-back as a note about the work, not as a second answer', () => {
    const step = answerParty(career, partyId, 'turn-back', content);
    const said = narrateEvents(step.events, step.career, content);
    const note = said.find((entry) => entry.kind === 'note' && entry.text.includes('is called off'));
    expect(note?.text).toMatch(/is called off\. They come home with \d+ of \d+ of it behind them\./);
  });
});

describe('a played Career', () => {
  it('produces both new kinds, and never leaves a token unfilled in either', () => {
    const { paragraphs } = playCareer('narrate-word-career', { careerYears: 2 });
    const word = paragraphs.filter((entry) => entry.kind === 'word');
    const answer = paragraphs.filter((entry) => entry.kind === 'answer');
    expect(word.length).toBeGreaterThan(0);
    expect(answer.length).toBe(word.length);
    for (const entry of [...word, ...answer]) {
      expect(entry.text).not.toContain('{');
      expect(entry.text).not.toContain('undefined');
      expect(entry.text.trim().length).toBeGreaterThan(0);
      expect(entry.partyId).toBeDefined();
    }
  }, 60_000);
});
