/**
 * E5 in English: a Hero brought over, a Hero taken without asking, a Hero the other Guild
 * took back, a refusal, and the Rosters down the road moving of their own accord.
 *
 * Two rules govern the whole of it. **Nothing is said twice**: the transaction, the coin
 * and the Roster gaining a person are three events and one moment, told on `HeroJoined`,
 * exactly as an offer taken is (E4 §4, DL-19 §5). And **a Hero is never taken from a
 * Regard the player has not watched fall**: the sentence that reports a retaliation leads
 * with the number that made them takeable, because that number is the whole of the warning.
 */

import { describe, expect, it } from 'vitest';
import {
  advance,
  newCareer,
  poachHero,
  transferHero,
  type Career,
  type GameConfig,
  type Step,
} from '@heroesim/engine';
import { narrateEvents, type Paragraph } from '../src/index.js';
import { content } from './helpers.js';

const RICH: Partial<GameConfig> = { startingCoin: 1_000_000 };

function textOf(paragraphs: readonly Paragraph[]): string {
  return paragraphs.map((paragraph) => paragraph.text).join('\n');
}

function said(step: Step): string {
  return textOf(narrateEvents(step.events, step.career, content));
}

/** A Career with a Rival who has people, and the first of them. */
function withRivals(seed: string, config?: Partial<GameConfig>): Career {
  const career = newCareer(seed, content, { ...RICH, ...config }).career;
  if ((career.rivals[0]?.roster.length ?? 0) === 0) throw new Error('the test expected a Roster');
  return career;
}

/** A copy in which one of a Rival's Heroes thinks exactly this much of them. */
function souring(career: Career, heroId: string, value: number): Career {
  return {
    ...career,
    rivals: career.rivals.map((rival) => ({
      ...rival,
      roster: rival.roster.map((hero) =>
        hero.id === heroId
          ? { ...hero, regardForRival: { ...hero.regardForRival, value } }
          : hero,
      ),
    })),
  };
}

/** A copy in which one Rival thinks exactly this much of your Guild. */
function rivalThinking(career: Career, rivalId: string, value: number): Career {
  return {
    ...career,
    rivals: career.rivals.map((rival) =>
      rival.id === rivalId
        ? { ...rival, regardForGuild: { ...rival.regardForGuild, value } }
        : rival,
    ),
  };
}

describe('a Hero brought over above board', () => {
  const career = withRivals('narrate-transfer');
  const rival = career.rivals[0];
  const hero = rival?.roster[0];
  if (rival === undefined || hero === undefined) throw new Error('the test expected a Rival Hero');
  const step = transferHero(career, rival.id, hero.id);
  const prose = said(step);

  it('names the person, the Guild they came from, their age and what it cost', () => {
    expect(prose).toContain(hero.name);
    expect(prose).toContain(rival.name);
    expect(prose).toContain(String(hero.age));
    expect(prose).toContain('coin');
    expect(prose).toContain('nobody has been wronged by it');
  });

  it('says it once: the transaction, the coin and the joining are one moment', () => {
    const paragraphs = narrateEvents(step.events, step.career, content);
    expect(paragraphs).toHaveLength(1);
    // The fee appears exactly once, not once on the transaction and again on the coin.
    const fee = String(step.events.find((event) => event.type === 'HeroTransferred')?.fee ?? 0);
    expect(prose.split(`${fee} coin`)).toHaveLength(2);
    expect(prose).not.toContain('It cost the Guild');
  });
});

describe('a Hero taken without asking', () => {
  const opened = withRivals('narrate-poach');
  const rival = opened.rivals[0];
  const hero = rival?.roster[0];
  if (rival === undefined || hero === undefined) throw new Error('the test expected a Rival Hero');
  const career = souring(opened, hero.id, -3);
  const step = poachHero(career, rival.id, hero.id);
  const prose = said(step);

  it('reads differently from a Transfer, and says nobody asked them', () => {
    expect(prose).toContain(hero.name);
    expect(prose).toContain(rival.name);
    expect(prose).toContain('without anybody asking them');
    expect(prose).not.toContain('nobody has been wronged by it');
  });

  it('says what it cost besides coin, and what it will go on costing', () => {
    expect(prose).toContain('will not forget it');
    expect(prose).toContain(`${career.config.poachRivalRegardCost} Regard`);
    expect(prose).toContain('taking more off your Board');
  });

  it('still says it once', () => {
    expect(narrateEvents(step.events, step.career, content)).toHaveLength(1);
  });
});

describe('a refusal', () => {
  const opened = withRivals('narrate-refused');
  const rival = opened.rivals[0];
  const hero = rival?.roster[0];
  if (rival === undefined || hero === undefined) throw new Error('the test expected a Rival Hero');

  it('reads differently for each of its four reasons', () => {
    const regard = said(transferHero(rivalThinking(opened, rival.id, -1), rival.id, hero.id));
    const heroRegard = said(poachHero(souring(opened, hero.id, 2), rival.id, hero.id));
    const coin = said(
      transferHero({ ...opened, guild: { ...opened.guild, coin: 0 } }, rival.id, hero.id),
    );
    const full = said(
      transferHero(
        { ...opened, config: { ...opened.config, rosterCap: opened.guild.roster.length } },
        rival.id,
        hero.id,
      ),
    );

    expect(regard).toContain('will not deal with you');
    expect(regard).toContain('-1');
    expect(heroRegard).toContain('content enough at');
    expect(coin).toContain('cannot pay');
    expect(full).toContain('no room on the Roster');

    // Four reasons, four sentences: none of them says what another says.
    const all = [regard, heroRegard, coin, full];
    expect(new Set(all).size).toBe(4);
    for (const sentence of all) {
      expect(sentence).toContain(hero.name);
      expect(sentence.endsWith('.')).toBe(true);
    }
  });

  it('is a thing that happened, not an error message', () => {
    const prose = said(transferHero(rivalThinking(opened, rival.id, -1), rival.id, hero.id));
    expect(prose.toLowerCase()).not.toContain('error');
    expect(prose.toLowerCase()).not.toContain('refused');
    expect(prose.toLowerCase()).not.toContain('cannot be');
  });
});

describe('a Hero the other Guild took back', () => {
  it('leads with how far their Regard had fallen', () => {
    const opened = newCareer('narrate-retaliation', content, RICH).career;
    const mine = opened.guild.roster[0];
    if (mine === undefined) throw new Error('the test expected a Roster');
    const soured: Career = {
      ...opened,
      // Every Rival wronged, one of your own Heroes sliding, and nobody else touched.
      rivals: opened.rivals.map((rival) => ({
        ...rival,
        regardForGuild: { ...rival.regardForGuild, value: -5 },
        roster: rival.roster.slice(0, 1),
      })),
      guild: {
        ...opened.guild,
        roster: opened.guild.roster.map((hero) =>
          hero.id === mine.id
            ? { ...hero, regardForGuildmaster: { ...hero.regardForGuildmaster, value: -4 } }
            : hero,
        ),
      },
      config: { ...opened.config, refusalRegardThreshold: -100, regardDecayAmount: 0 },
    };
    const run = advance(soured, soured.config.boardRefreshEveryDays, content);
    const prose = textOf(narrateEvents(run.events, run.career, content));
    expect(prose).toContain(mine.name);
    expect(prose).toContain('has gone to');
    expect(prose).toContain('Regard for you had fallen to -4');
    expect(prose).toContain('somebody else was willing to ask');
  });
});

describe('the other Guilds going about their business', () => {
  it('reads as one line of background rather than as four', () => {
    const career = newCareer('narrate-churn', content, { ...RICH, rivalChurnChance: 1 }).career;
    const run = advance(career, career.config.boardRefreshEveryDays, content);
    const paragraphs = narrateEvents(run.events, run.career, content);
    const mentioning = paragraphs.filter(
      (paragraph) =>
        paragraph.text.includes('has taken on') || paragraph.text.includes('Hero lighter'),
    );
    expect(mentioning).toHaveLength(1);
    // Every Rival that moved is named in it, and nothing says a calibre.
    const line = mentioning[0]?.text ?? '';
    expect(line.toLowerCase()).not.toContain('calibre');
    expect(line.endsWith('.')).toBe(true);
  });

  it('says when one of their people has had enough, and names the Guild it was', () => {
    const opened = newCareer('narrate-rival-retire', content, {
      ...RICH,
      rivalChurnChance: 0,
    }).career;
    const rival = opened.rivals[0];
    const hero = rival?.roster[0];
    if (rival === undefined || hero === undefined) throw new Error('the test expected a Rival Hero');
    const old: Career = {
      ...opened,
      rivals: opened.rivals.map((entry) =>
        entry.id === rival.id
          ? {
              ...entry,
              roster: entry.roster.map((person) =>
                person.id === hero.id
                  ? { ...person, age: opened.config.heroRetirementAge }
                  : person,
              ),
            }
          : entry,
      ),
    };
    const run = advance(old, old.config.boardRefreshEveryDays, content);
    const prose = textOf(narrateEvents(run.events, run.career, content));
    // Somebody else's Hero, who has left the world with the Guild that employed them, so
    // there is no name left to give — and the line does not pretend they served with you.
    expect(prose).toContain(`Somebody at another Guild has had enough of it at ${old.config.heroRetirementAge}`);
    expect(prose).not.toContain(`${hero.name} has had enough`);
    expect(prose).not.toContain('one of the Party has had enough');
  });

  it('names the Guild that took work off your Board, rather than printing an object at it', () => {
    const career = newCareer('narrate-rival-took', content, RICH).career;
    const run = advance(career, career.config.boardRefreshEveryDays, content);
    const prose = textOf(narrateEvents(run.events, run.career, content));
    expect(prose).not.toContain('[object Object]');
    expect(prose).toMatch(/ took /);
    const names = career.rivals.map((entry) => entry.name);
    expect(names.some((name) => prose.includes(`${name} took `))).toBe(true);
  });
});

describe('a Vignette that sours a Rival', () => {
  it('says which Guild thinks worse of yours, and why', () => {
    const career = newCareer('narrate-rival-regard', content, RICH).career;
    const rival = career.rivals[1];
    if (rival === undefined) throw new Error('the test expected a Rival');
    const step: Step = {
      career,
      events: [
        {
          type: 'RivalRegardChanged',
          day: career.day,
          rivalId: rival.id,
          delta: -1,
          value: -1,
          reason: 'your people talked where theirs were listening',
        },
      ],
    };
    const prose = said(step);
    expect(prose).toContain(rival.name);
    expect(prose).toContain('thinks worse of the Guild');
    expect(prose).toContain('your people talked where theirs were listening');
  });

  it('says nothing at all when the Regard was already at the end of the scale', () => {
    const career = newCareer('narrate-rival-regard-clamped', content, RICH).career;
    const rival = career.rivals[0];
    if (rival === undefined) throw new Error('the test expected a Rival');
    const step: Step = {
      career,
      events: [
        {
          type: 'RivalRegardChanged',
          day: career.day,
          rivalId: rival.id,
          delta: 0,
          value: -5,
          reason: 'nothing moved',
        },
      ],
    };
    expect(narrateEvents(step.events, step.career, content)).toEqual([]);
  });
});

describe('the reckoning at the end of a Career', () => {
  it('says how many Heroes another Guild took, apart from the losses', () => {
    // E5-S4's acceptance box says `ledger.heroesPoachedFromUs` "increments **and the
    // reckoning reports it**", and architecture §3 says the same. The field was set and
    // asserted equal to the ledger, and then never printed: `reckoningLines` named the
    // years, the Commissions, the Heroes on the Roster, lost and retired, the Applicants
    // taken on, the favourite Patron, the coin, the Standing and the Guildmaster's
    // Stats — and said nothing at all about the people another Guild walked off with.
    const opened = newCareer('narrate-reckoning-taken', content, {
      ...RICH,
      careerYears: 1,
      daysPerYear: 40,
      regardDecayAmount: 0,
      refusalRegardThreshold: -100,
    }).career;
    const soured: Career = {
      ...opened,
      rivals: opened.rivals.map((rival) => ({
        ...rival,
        regardForGuild: { ...rival.regardForGuild, value: -5 },
        roster: rival.roster.slice(0, 1),
      })),
      guild: {
        ...opened.guild,
        roster: opened.guild.roster.map((hero) => ({
          ...hero,
          regardForGuildmaster: { ...hero.regardForGuildmaster, value: -4 },
        })),
      },
    };
    const run = advance(soured, 100, content);
    const taken = run.career.ended?.reckoning.heroesPoachedFromUs ?? 0;
    expect(taken).toBeGreaterThan(0);
    const prose = textOf(narrateEvents(run.events, run.career, content));
    expect(prose).toContain(
      `Taken by another Guild: ${String(taken)} ${taken === 1 ? 'Hero' : 'Heroes'}.`,
    );
  });

  it('says so even when nobody was taken, so the shape of a reckoning never changes', () => {
    const quiet = newCareer('narrate-reckoning-quiet', content, {
      ...RICH,
      careerYears: 1,
      daysPerYear: 40,
    }).career;
    const run = advance(quiet, 100, content);
    expect(run.career.ended?.reckoning.heroesPoachedFromUs).toBe(0);
    expect(textOf(narrateEvents(run.events, run.career, content))).toContain(
      'Taken by another Guild: 0 Heroes.',
    );
  });
});
