/**
 * E3 in English: an Injury, its lifting, a Scar, a Death, a Retirement and the Hall.
 *
 * The engine reports all six as typed facts (ADR-0002) and this is the only place they
 * become sentences, so this is where the sentences are checked. Two things matter beyond
 * the words themselves: nothing is said twice — `TraitGained` still fires beside a
 * `HeroInjured`, and only one of them speaks — and no `{token}` ever survives.
 */

import { describe, expect, it } from 'vitest';
import {
  advance,
  commitParty,
  improveHall,
  newCareer,
  type Career,
  type GameConfig,
  type GameEvent,
  type HallImprovement,
} from '@heroesim/engine';
import { groupDigits, hallName, narrateEvents, type Paragraph } from '../src/index.js';
import { content } from './helpers.js';

/** Every Check fails, so the Beat that follows is certain to be a failed one. */
const ALWAYS_FAILS: Partial<GameConfig> = { dcMin: 40, dcMax: 40 };

function textOf(paragraphs: readonly Paragraph[]): string {
  return paragraphs.map((paragraph) => paragraph.text).join('\n');
}

function of<T extends GameEvent['type']>(
  events: readonly GameEvent[],
  type: T,
): Extract<GameEvent, { type: T }>[] {
  return events.filter((event): event is Extract<GameEvent, { type: T }> => event.type === type);
}

/** Send one Hero on one Commission under a forced config, and narrate the whole of it. */
function work(
  seed: string,
  config: Partial<GameConfig>,
): { career: Career; events: GameEvent[]; paragraphs: Paragraph[] } {
  const opened = newCareer(seed, content, {
    commissionSpanMin: 6,
    commissionSpanMax: 6,
    beatsMin: 3,
    beatsMax: 3,
    boardRefreshEveryDays: 400,
    upkeepEveryDays: 400,
    ...config,
  });
  const commission = opened.career.board[0];
  if (commission === undefined) throw new Error('the test expected a Commission');
  const sent = commitParty(
    opened.career,
    commission.id,
    [opened.career.guild.roster[0]?.id ?? ''],
    content,
  );
  const run = advance(sent.career, 400, content);
  const events = [...sent.events, ...run.events];
  return {
    career: run.career,
    events,
    paragraphs: narrateEvents(events, run.career, content),
  };
}

describe('an Injury', () => {
  const run = work('narrate-injury', {
    ...ALWAYS_FAILS,
    criticalMargin: 100,
    injuryChanceOnFailure: 1,
    injurySpanMin: 20,
    injurySpanMax: 20,
  });
  const injured = of(run.events, 'HeroInjured')[0];
  const said = textOf(run.paragraphs);

  it('names the Hero, the Injury and the Day they are fit again', () => {
    expect(injured).toBeDefined();
    if (injured === undefined) return;
    const hero = run.career.guild.roster.find((entry) => entry.id === injured.heroId);
    const name =
      hero?.name ?? run.career.guild.formerHeroes.find((entry) => entry.id === injured.heroId)?.name;
    expect(name).toBeDefined();
    expect(said).toContain(name ?? '');
    expect(said).toContain(injured.trait);
    expect(said).toMatch(/no work until Year \d+, Day \d+/);
  });

  it('does not say it twice, although TraitGained fires beside it', () => {
    expect(injured).toBeDefined();
    if (injured === undefined) return;
    // The engine reports both; only one of them speaks (E3 §4, DL-16).
    expect(
      of(run.events, 'TraitGained').filter(
        (event) => event.day === injured.day && event.trait === injured.trait,
      ).length,
    ).toBeGreaterThan(0);
    const lines = said.split('\n').filter((line) => line.includes(injured.trait));
    for (const line of lines) {
      expect(line).not.toContain('carries');
    }
  });

  it('says when it lifts, and how long it was borne', () => {
    const lifted = of(run.events, 'InjuryLifted')[0];
    expect(lifted).toBeDefined();
    if (lifted === undefined) return;
    expect(said).toContain(`is over ${lifted.trait}`);
    expect(said).toContain(`${lifted.daysBorne} Days`);
    expect(said).toContain('can be sent out again');
    // And `TraitLifted`'s own sentence is not used for an Injury.
    expect(said).not.toContain(`is clear of ${lifted.trait}`);
  });

  it('leaves no unfilled token anywhere in the run', () => {
    expect(said).not.toContain('{');
    expect(said).not.toContain('undefined');
    expect(run.paragraphs.every((paragraph) => paragraph.text.length > 0)).toBe(true);
  });
});

describe('a Scar', () => {
  const run = work('narrate-scar', {
    ...ALWAYS_FAILS,
    criticalMargin: 1,
    deathChanceOnCriticalFailure: 0,
    scarChanceOnCriticalFailure: 1,
  });
  const scarred = of(run.events, 'HeroScarred')[0];
  const said = textOf(run.paragraphs);

  it('says it is for the rest of it, and quotes what the Trait is', () => {
    expect(scarred).toBeDefined();
    if (scarred === undefined) return;
    expect(said).toContain(`will carry ${scarred.trait} for the rest of`);
    const summary = content.traits.find((trait) => trait.name === scarred.trait)?.summary;
    expect(summary).toBeDefined();
    expect(said).toContain(summary ?? '');
  });

  it('does not also say the Trait was gained', () => {
    expect(scarred).toBeDefined();
    if (scarred === undefined) return;
    expect(said).not.toContain(`carries ${scarred.trait} from now on`);
    expect(said).not.toContain('{');
  });
});

describe('a Death', () => {
  const run = work('narrate-death', {
    ...ALWAYS_FAILS,
    criticalMargin: 1,
    deathChanceOnCriticalFailure: 1,
  });
  const died = of(run.events, 'HeroDied')[0];
  const said = textOf(run.paragraphs);

  it('says plainly that they did not come back', () => {
    expect(died).toBeDefined();
    if (died === undefined) return;
    const name = run.career.guild.formerHeroes.find((entry) => entry.id === died.heroId)?.name;
    expect(name).toBeDefined();
    expect(said).toContain(`${name ?? ''} did not come back.`);
    expect(said).not.toContain('{');
  });

  it('still reports the Party coming home, with nobody in it', () => {
    const home = of(run.events, 'PartyReturned')[0];
    expect(home).toBeDefined();
    expect(home?.heroIds).toEqual([]);
    expect(said).toContain('the work was not finished');
    expect(said).toContain('Nothing was paid for it.');
  });
});

describe('a Retirement', () => {
  it('says how old they were and how long they served, and that it ended well', () => {
    const opened = newCareer('narrate-retire', content, { boardRefreshEveryDays: 10 }).career;
    const hero = opened.guild.roster[0];
    if (hero === undefined) throw new Error('the test expected a Hero');
    const old: Career = {
      ...opened,
      guild: {
        ...opened.guild,
        roster: opened.guild.roster.map((entry) =>
          entry.id === hero.id ? { ...entry, age: opened.config.heroRetirementAge } : entry,
        ),
      },
    };
    const run = advance(old, 10, content);
    const retired = of(run.events, 'HeroRetired')[0];
    expect(retired).toBeDefined();
    if (retired === undefined) return;

    const said = textOf(narrateEvents(run.events, run.career, content));
    expect(said).toContain(hero.name);
    expect(said).toContain(`has had enough of it at ${retired.age}`);
    expect(said).toContain('They leave on their own terms.');
    expect(said).not.toContain('{');
  });

  it('is reported apart from the losses in the reckoning', () => {
    const opened = newCareer('narrate-reckoning', content, {
      careerYears: 1,
      daysPerYear: 60,
      boardRefreshEveryDays: 10,
    }).career;
    const hero = opened.guild.roster[0];
    if (hero === undefined) throw new Error('the test expected a Hero');
    const old: Career = {
      ...opened,
      guild: {
        ...opened.guild,
        roster: opened.guild.roster.map((entry) =>
          entry.id === hero.id ? { ...entry, age: opened.config.heroRetirementAge } : entry,
        ),
      },
    };
    const run = advance(old, 100, content);
    const said = textOf(narrateEvents(run.events, run.career, content));
    expect(said).toMatch(/Heroes: \d+ on the Roster at the end, \d+ lost along the way, \d+ retired\./);
    expect(said).toContain('1 retired.');
  });
});

describe('the Hall', () => {
  it('names every improvement in prose', () => {
    const named: HallImprovement[] = ['infirmary', 'trainingYard', 'quarters'];
    for (const improvement of named) {
      expect(hallName(improvement).length).toBeGreaterThan(0);
      expect(hallName(improvement)).not.toBe(improvement);
    }
    expect(new Set(named.map(hallName)).size).toBe(named.length);
  });

  it('says what was bought, what it cost and what is left, once', () => {
    const career = newCareer('narrate-hall', content, { startingCoin: 5000 }).career;
    const step = improveHall(career, 'infirmary');
    const said = textOf(narrateEvents(step.events, step.career, content));
    expect(said).toContain(hallName('infirmary'));
    expect(said).toContain(`${career.config.hallInfirmaryCost} coin`);
    // Grouped: the balance left is a four-figure sum, and this package writes one number
    // format (DL-27 §1).
    expect(said).toContain(groupDigits(5000 - career.config.hallInfirmaryCost));
    // The `CoinChanged` beside it is silent, so the movement is told once and not twice.
    expect(said.split('coin').length - 1).toBe(1);
    expect(said).not.toContain('It cost the Guild');
    expect(said).not.toContain('{');
  });

  it('gives it a paragraph of its own, on the Day it happened', () => {
    const career = newCareer('narrate-hall-day', content, { startingCoin: 5000 }).career;
    const moved = advance(career, 12, content).career;
    const step = improveHall(moved, 'quarters');
    const said = narrateEvents(step.events, step.career, content);
    expect(said).toHaveLength(1);
    expect(said[0]?.day).toBe(moved.day);
    expect(said[0]?.kind).toBe('coin');
  });
});

describe('a whole run of harm', () => {
  it('never leaves a token unfilled and never repeats a Trait in two sentences', () => {
    for (const config of [
      { ...ALWAYS_FAILS, criticalMargin: 100, injuryChanceOnFailure: 1 },
      { ...ALWAYS_FAILS, criticalMargin: 1, scarChanceOnCriticalFailure: 1, deathChanceOnCriticalFailure: 0 },
      { ...ALWAYS_FAILS, criticalMargin: 1, deathChanceOnCriticalFailure: 1 },
    ]) {
      const run = work('narrate-sweep', config);
      const said = textOf(run.paragraphs);
      expect(said).not.toContain('{');
      expect(said).not.toContain('undefined');
      expect(said).not.toContain('NaN');
      for (const paragraph of run.paragraphs) {
        expect(paragraph.text.trim().length).toBeGreaterThan(0);
      }
    }
  });
});
