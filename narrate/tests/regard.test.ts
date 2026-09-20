/**
 * E2 in English: refusal, insistence, drift and Departure. The engine reports them as
 * typed facts (ADR-0002) and this is the only place they become sentences, so this is
 * where the sentences are checked.
 *
 * The Career is driven by a policy that insists, over the real authored content, so the
 * paragraphs asserted on here are ones a player would actually read.
 */

import { describe, expect, it } from 'vitest';
import {
  advanceUntilAttention,
  availableHeroes,
  commitParty,
  newCareer,
  proposeParty,
  type Career,
  type GameConfig,
  type GameEvent,
  type Hero,
} from '@heroesim/engine';
import { narrateEvents, type Paragraph } from '../src/index.js';
import { content } from './helpers.js';

const strength = (hero: Hero): number =>
  hero.stats.Might + hero.stats.Craft + hero.stats.Nerve + hero.stats.Guile;

/** Play a Career through, insisting whenever somebody says no, and narrate every step. */
function playInsisting(seed: string, config?: Partial<GameConfig>) {
  const opened = newCareer(seed, content, config);
  let career: Career = opened.career;
  const paragraphs: Paragraph[] = [...narrateEvents(opened.events, career, content)];
  const events: GameEvent[] = [...opened.events];
  let guard = 0;

  while (career.ended === undefined) {
    guard += 1;
    if (guard > 100_000) throw new Error('the insisting policy never reached the end');
    const free = [...availableHeroes(career)].sort((one, other) => strength(other) - strength(one));
    const used = new Set<string>();
    for (const commission of [...career.board].sort((one, other) => other.fee - one.fee)) {
      const left = free.filter((hero) => !used.has(hero.id));
      if (left.length === 0) break;
      const party = left.slice(0, 2).map((hero) => hero.id);
      const proposal = proposeParty(career, commission.id, party, content);
      const step = commitParty(career, commission.id, party, content, {
        insist: proposal.refusals.length > 0,
      });
      career = step.career;
      events.push(...step.events);
      paragraphs.push(...narrateEvents(step.events, career, content));
      for (const id of party) used.add(id);
    }
    const step = advanceUntilAttention(career, content);
    career = step.career;
    events.push(...step.events);
    paragraphs.push(...narrateEvents(step.events, career, content));
  }
  return { career, events, paragraphs };
}

// This file is about E2's Regard arc, and Decisions are incidental to it. E6 first moved
// the seed to dodge a Decision that fired on `narrate-regard` and changed which Commissions
// the policy took; the seed is restored here and the rule that disturbed it is switched off
// instead, exactly as `engine/tests/decay.test.ts` switches off Applicants and Rival churn
// to measure drift alone. Not one assertion below changes, and what they assert is E2's,
// measured on E2's own seed (DL-24 §A6).
const played = playInsisting('narrate-regard', { careerYears: 4, decisionChancePerBeat: 0 });
const said = played.paragraphs.map((entry) => entry.text).join('\n');

describe('a Career in which the Guildmaster insists', () => {
  it('reaches an end with every kind of E2 event in it', () => {
    expect(played.career.ended).toBeDefined();
    for (const type of ['CommissionRefused', 'InsistenceApplied', 'HeroDeparted'] as const) {
      expect(played.events.some((event) => event.type === type), type).toBe(true);
    }
  });

  it('never leaves a token unfilled or an empty paragraph behind', () => {
    for (const entry of played.paragraphs) {
      expect(entry.text).not.toContain('{');
      expect(entry.text.trim().length).toBeGreaterThan(0);
    }
  });

  it('says who would not go, and why, in the player’s own terms', () => {
    const refused = played.events.find((event) => event.type === 'CommissionRefused');
    expect(refused).toBeDefined();
    expect(said).toMatch(/would not take .+: Regard for you stands at -\d\./);
  });

  it('says what insisting cost, and names the Hero it cost it of', () => {
    expect(said).toMatch(/You insisted, and .+ goes anyway/);
    const insisted = played.events.filter((event) => event.type === 'InsistenceApplied');
    const paid = insisted.find((event) => event.delta !== 0);
    expect(paid).toBeDefined();
    expect(said).toMatch(/it cost \d Regard, leaving [+-]?\d\./);
  });

  it('says a Hero has left, how far their Regard had fallen, and what moved it last', () => {
    const departed = played.events.filter((event) => event.type === 'HeroDeparted');
    expect(departed.length).toBeGreaterThan(0);
    expect(said).toMatch(/has left the Guild\. Regard for you had fallen to -\d/);
    for (const event of departed) {
      const gone = played.career.guild.formerHeroes.find((hero) => hero.id === event.heroId);
      expect(gone).toBeDefined();
      expect(said).toContain(`${gone?.name ?? ''} has left the Guild.`);
    }
  });

  it('never prints a minus sign at the player where a Backing should be', () => {
    expect(said).not.toMatch(/with Backing of -/);
  });
});

describe('a Party whose Backing has gone negative', () => {
  // Backing is negative only for a Party that thinks little of the Guildmaster, which
  // world generation never deals; the Regard is set here and the Party then committed
  // through the real API, insisting because at that Regard they would refuse.
  // `backingRegardDivisor: 1` makes the Regard term the mean itself, so the shortfall is
  // reached whatever Stats the seed dealt the Guildmaster. The formula is the engine's
  // business; what is being read here is how a Backing below zero is said.
  const opened = newCareer('narrate-backing', content, {
    careerYears: 1,
    backingRegardDivisor: 1,
  }).career;
  const soured = JSON.parse(JSON.stringify(opened)) as Career;
  for (const hero of soured.guild.roster) {
    hero.regardForGuildmaster = { value: -5, reason: 'you sent them anyway', nature: 'neutral' };
  }
  const commission = soured.board[0];
  if (commission === undefined) throw new Error('the test expected a Commission');
  const step = commitParty(
    soured,
    commission.id,
    soured.guild.roster.slice(0, 2).map((hero) => hero.id),
    content,
    { insist: true },
  );
  const text = narrateEvents(step.events, step.career, content)
    .map((entry) => entry.text)
    .join('\n');

  it('is a Party that really is worse off for it', () => {
    const committed = step.events.find((event) => event.type === 'PartyCommitted');
    expect(committed?.backing).toBeLessThan(0);
  });

  it('spells the shortfall out rather than reading as a typing mistake', () => {
    expect(text).toMatch(/worse off by \d for what they think of you/);
    expect(text).not.toMatch(/with Backing of -/);
    expect(text).not.toContain('{');
  });
});

describe('Regard drifting from neglect', () => {
  // One Hero is sent at a time, so the rest of the Roster is left in the hall to drift.
  const quiet = (() => {
    const opened = newCareer('narrate-drift', content, { careerYears: 1, startingCoin: 100_000 });
    let career: Career = opened.career;
    const paragraphs: Paragraph[] = [];
    let guard = 0;
    while (career.ended === undefined) {
      guard += 1;
      if (guard > 100_000) throw new Error('the idle policy never reached the end');
      const step = advanceUntilAttention(career, content);
      career = step.career;
      paragraphs.push(...narrateEvents(step.events, career, content));
    }
    return { career, paragraphs };
  })();

  it('folds a whole Board refresh of drift into one line, naming them all', () => {
    const drifting = quiet.paragraphs.filter((entry) => entry.text.includes('drifting'));
    expect(drifting.length).toBeGreaterThan(0);

    const many = drifting.find((entry) => entry.text.includes(' and '));
    expect(many, 'a refresh in which more than one Hero drifted').toBeDefined();
    expect(many?.text).toMatch(/ are drifting: you have not sent them out in a long while\./);

    // One name reads as one Hero, never as a list of one.
    for (const entry of drifting) {
      expect(entry.text).toMatch(/ (is|are) drifting: /);
      if (!entry.text.includes(' and ')) expect(entry.text).toContain(' is drifting: ');
    }
  });

  it('reports a drifting Hero as a Regard movement, not as an event of its own', () => {
    expect(quiet.paragraphs.every((entry) => entry.kind !== 'end' || entry.text.length > 0)).toBe(true);
    for (const entry of quiet.paragraphs) expect(entry.text).not.toContain('{');
  });
});
