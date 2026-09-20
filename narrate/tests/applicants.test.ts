/**
 * E4 in English: people at the door, an offer taken, an offer turned down, and somebody
 * coming back. The rule the whole of it is written against is the one in E4's risk table —
 * **calibre is never printed as stars or a grade** — so nothing here says how good anybody
 * is. The player reads the person, their Background and their Traits, and what they ask for.
 *
 * The other rule is that nothing is said twice: `ApplicantAccepted`, the `CoinChanged`
 * that pays for it and `HeroJoined` are three events and one moment (E4 §4, DL-19 §5).
 */

import { describe, expect, it } from 'vitest';
import {
  acceptApplicant,
  advance,
  declineApplicant,
  newCareer,
  type Career,
  type GameConfig,
} from '@heroesim/engine';
import { narrateEvents, type Paragraph } from '../src/index.js';
import { content } from './helpers.js';

const RICH: Partial<GameConfig> = { startingCoin: 1_000_000 };

function textOf(paragraphs: readonly Paragraph[]): string {
  return paragraphs.map((paragraph) => paragraph.text).join('\n');
}

/** A Career with a batch waiting, and the prose of the Day they turned up. */
function aBatch(seed: string, config?: Partial<GameConfig>): { career: Career; said: string } {
  const opened = newCareer(seed, content, { ...RICH, ...config }).career;
  const run = advance(opened, 10, content);
  if (run.career.applicants.length === 0) throw new Error('the test expected a batch');
  return { career: run.career, said: textOf(narrateEvents(run.events, run.career, content)) };
}

describe('a batch turning up', () => {
  const { career, said } = aBatch('narrate-arrival');

  it('says how many came, names them, and says how long they will wait', () => {
    expect(said).toContain('looking for work');
    for (const applicant of career.applicants) expect(said).toContain(applicant.name);
    expect(said).toMatch(/will wait until Year \d+, Day \d+/);
    expect(said).toContain(String(career.applicants.length));
  });

  it('never prints a calibre, a star or a grade', () => {
    const everything = said.toLowerCase();
    expect(everything).not.toContain('calibre');
    expect(said).not.toContain('★');
    expect(said).not.toContain('*');
    expect(said).not.toMatch(/\bgrade\b/i);
    expect(said).not.toMatch(/\b[A-F][+-]?\brating/);
  });

  it('reads as one paragraph rather than one per person', () => {
    const run = advance(newCareer('narrate-one-line', content, RICH).career, 10, content);
    const said = narrateEvents(run.events, run.career, content);
    const mentioning = said.filter((paragraph) => paragraph.text.includes('looking for work'));
    expect(mentioning).toHaveLength(1);
    expect(mentioning[0]?.kind).toBe('note');
    expect(mentioning[0]?.day).toBe(10);
  });
});

describe('an offer taken', () => {
  const { career } = aBatch('narrate-accept');
  const applicant = career.applicants[0];
  if (applicant === undefined) throw new Error('the test expected an Applicant');
  const step = acceptApplicant(career, applicant.id);
  const paragraphs = narrateEvents(step.events, step.career, content);
  const said = textOf(paragraphs);

  it('is one moment for the reader: the name, the age and the fee, said once', () => {
    expect(paragraphs).toHaveLength(1);
    expect(said).toContain(applicant.name);
    expect(said).toContain(String(applicant.age));
    expect(said).toContain(`${applicant.askingFee} coin`);
    expect(said).toContain('joins the Roster');
  });

  it('does not tell the coin a second time', () => {
    const mentions = said.split(String(applicant.askingFee)).length - 1;
    expect(mentions).toBe(1);
    expect(said).not.toContain('It cost the Guild');
    expect(said).not.toContain('coin remains');
  });

  it('never says what calibre they were', () => {
    expect(said.toLowerCase()).not.toContain('calibre');
    expect(said).not.toContain('★');
  });
});

describe('an offer turned down', () => {
  it('reads as a decision when the player made it', () => {
    const { career } = aBatch('narrate-decline');
    const applicant = career.applicants[0];
    if (applicant === undefined) throw new Error('the test expected an Applicant');
    const step = declineApplicant(career, applicant.id);
    const said = textOf(narrateEvents(step.events, step.career, content));
    expect(said).toContain(`You send ${applicant.name} away`);
    expect(said).not.toContain('gave up waiting');
  });

  it('reads as something that merely happened when they ran out of patience', () => {
    const { career } = aBatch('narrate-expire');
    const waiting = career.applicants.map((applicant) => applicant.name);
    const run = advance(career, career.config.applicantLingerDays, content);
    const said = textOf(narrateEvents(run.events, run.career, content));
    expect(said).toContain('gave up waiting and went elsewhere');
    expect(said).not.toContain('You send');
    for (const name of waiting) expect(said).toContain(name);
  });

  it('gathers a whole batch giving up into one sentence', () => {
    const { career } = aBatch('narrate-expire-one-line');
    const run = advance(career, career.config.applicantLingerDays, content);
    const said = narrateEvents(run.events, run.career, content);
    const giving = said.filter((paragraph) => paragraph.text.includes('gave up waiting'));
    expect(giving).toHaveLength(1);
    expect(giving[0]?.text.split('gave up waiting')).toHaveLength(2);
  });
});

describe('somebody coming back', () => {
  /** A Career in which the first Hero walked out and has been offered their place again. */
  function aReturner(): { career: Career; name: string } {
    const opened = newCareer('narrate-return', content, {
      ...RICH,
      returnAsApplicantChance: 1,
    }).career;
    const hero = opened.guild.roster[0];
    if (hero === undefined) throw new Error('the test expected a Roster');
    const gone: Career = {
      ...opened,
      guild: {
        ...opened.guild,
        roster: opened.guild.roster.filter((entry) => entry.id !== hero.id),
        formerHeroes: [
          ...opened.guild.formerHeroes,
          { ...hero, exit: { kind: 'departure', onDay: 1, reason: 'you sent them anyway' } },
        ],
      },
    };
    const run = advance(gone, 70, content);
    if (!run.career.applicants.some((applicant) => applicant.formerHeroId === hero.id)) {
      throw new Error('the test expected the veteran to have come back');
    }
    return { career: run.career, name: hero.name };
  }

  it('is named as somebody coming BACK, not as somebody arriving', () => {
    const { career, name } = aReturner();
    const step = acceptApplicant(career, career.guild.formerHeroes[0]?.id ?? '');
    const said = textOf(narrateEvents(step.events, step.career, content));
    expect(said).toContain(name);
    expect(said).toContain('is back on the Roster');
    expect(said).toContain('walking out on you once already');
    expect(said).not.toContain('joins the Roster');
  });

  it('is not given away by the batch they arrive in', () => {
    // `ApplicantsArrived` deliberately does not distinguish returners: the offer does,
    // and so does `HeroJoined` once one is taken (E4-S4).
    const { career, name } = aReturner();
    const run = advance(career, 0, content);
    expect(run.events).toEqual([]);
    expect(career.applicants.some((applicant) => applicant.name === name)).toBe(true);
  });
});

describe('the reckoning', () => {
  it('says how many were taken on, apart from who was lost and who retired', () => {
    const { career } = aBatch('narrate-reckoning', { careerYears: 1, daysPerYear: 30 });
    const applicant = career.applicants[0];
    if (applicant === undefined) throw new Error('the test expected an Applicant');
    const taken = acceptApplicant(career, applicant.id).career;
    const run = advance(taken, 60, content);
    expect(run.career.ended).toBeDefined();
    const said = textOf(narrateEvents(run.events, run.career, content));
    expect(said).toContain('Taken on: 1 Applicant.');
    expect(said).toMatch(/Heroes: \d+ on the Roster at the end/);
  });
});
