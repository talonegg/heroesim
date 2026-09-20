/**
 * The words E7 moved into this package, because two front ends were keeping identical
 * copies of them (DL-25 §15), and the two sentences E7 asked for (DL-25 §1, §4).
 *
 * `narrate` is where shared words live: a sentence held in one front end and copied into
 * the other is a sentence the two will eventually come to say differently.
 */

import { describe, expect, it } from 'vitest';
import { defaultConfig, newCareer, type Career } from '@heroesim/engine';
import {
  atRiskSentence,
  coin,
  difficultyWord,
  exitReason,
  exitWords,
  groupDigits,
  noneCanBeTakenReason,
  narrateEvents,
  postingNothingSentence,
  reckoningLines,
  returnerSentence,
  turnBackSentence,
  wrongedRivalSentence,
  DIFFICULTY_BANDS,
  STANDING_EXPLAINED,
} from '../src/index.js';
import { content, playCareer } from './helpers.js';

describe('the difficulty band', () => {
  it('reads across the whole vocabulary over the range the config allows', () => {
    const bands = new Set(
      Array.from(
        { length: defaultConfig.difficultyMax - defaultConfig.difficultyMin + 1 },
        (_, step) => difficultyWord(defaultConfig.difficultyMin + step, defaultConfig),
      ),
    );
    expect(bands).toEqual(new Set(DIFFICULTY_BANDS));
  });

  it('bands the ends of the range as the easiest and the grimmest', () => {
    expect(difficultyWord(defaultConfig.difficultyMin, defaultConfig)).toBe('easy');
    expect(difficultyWord(defaultConfig.difficultyMax, defaultConfig)).toBe('grim');
  });

  it('scales to a Career played at a different range', () => {
    const narrow = { ...defaultConfig, difficultyMin: 20, difficultyMax: 28 };
    expect(difficultyWord(20, narrow)).toBe('easy');
    expect(difficultyWord(28, narrow)).toBe('grim');
  });

  /**
   * The two ends and the set of words were pinned; the **edges** were not, so scaling the
   * share by three or by five instead of four — which moves where every band begins —
   * passed. The bands are what both front ends print over one engine number (DL-25 §5), so
   * the whole mapping is written out at the shipped range.
   */
  it('puts every difficulty in the same band it did, across the shipped range', () => {
    const said = Array.from(
      { length: defaultConfig.difficultyMax - defaultConfig.difficultyMin + 1 },
      (_, step) =>
        `${defaultConfig.difficultyMin + step}=${difficultyWord(
          defaultConfig.difficultyMin + step,
          defaultConfig,
        )}`,
    ).join(' ');
    expect(said).toBe('8=easy 9=easy 10=fair 11=fair 12=hard 13=hard 14=grim 15=grim');
  });

  it('reads no balance number out of thin air when the range is a single point', () => {
    expect(difficultyWord(11, { ...defaultConfig, difficultyMin: 11, difficultyMax: 11 })).toBe(
      'fair',
    );
  });
});

describe('the sentence that says another Guild could take somebody', () => {
  it('names one Guild in the singular and several in a list', () => {
    expect(atRiskSentence(['The Kestrel Guild'])).toBe(
      'Another Guild could take them. The Kestrel Guild is minded to.',
    );
    expect(atRiskSentence(['A', 'B', 'C'])).toBe(
      'Another Guild could take them. A, B and C are minded to.',
    );
  });

  it('says so even when nobody is presently minded to try', () => {
    expect(atRiskSentence([])).toBe(
      'Another Guild could take them, though none is minded to just now.',
    );
  });
});

describe('what turning back would pay', () => {
  it('names both figures and the Beats, with coin never abbreviated', () => {
    expect(
      turnBackSentence({ feePaid: 19, fullFee: 1075, beatsResolved: 1, beatCount: 4 }),
      // Both figures grouped, because this package holds the one number format and every
      // sentence it writes uses it (DL-27 §1). `1075` here read as a fourth convention on
      // a screen that already showed `1,140 coin` in the terminal's header.
    ).toBe('Calling them home pays 19 coin of the 1,075 the work is worth, for 1 of 4 Beats done.');
  });
});

describe('what Standing is', () => {
  it('says it is not a score and names the only way to climb', () => {
    expect(STANDING_EXPLAINED).toContain('It is not a score');
    expect(STANDING_EXPLAINED).toContain('the only way to climb is to earn their Regard');
  });
});

describe('the reckoning', () => {
  const { career } = playCareer('e7-reckoning', { careerYears: 1 });

  it('counts harm as Injuries and Scars, never as a number of people', () => {
    const end = career.ended;
    if (end === undefined) throw new Error('the Career did not end');
    const line = reckoningLines(end.reckoning, career).find((entry) => entry.startsWith('Harm:'));
    expect(line).toBeDefined();
    expect(line).toMatch(/^Harm: \d+ (Injury|Injuries) and \d+ (Scar|Scars) between them\.$/);
    expect(line).not.toContain('Heroes injured');
  });

  it('reads the counts off the ledger, which is where they live', () => {
    const end = career.ended;
    if (end === undefined) throw new Error('the Career did not end');
    const pretend: Career = {
      ...career,
      ledger: { ...career.ledger, heroesInjured: 470, heroesScarred: 1 },
    };
    expect(reckoningLines(end.reckoning, pretend)).toContain(
      'Harm: 470 Injuries and 1 Scar between them.',
    );
  });
});

describe('the debt a Guild came with', () => {
  it('is said once, at the opening, when there is one', () => {
    const opened = newCareer('e7-debt', content, { startingDebt: 300 });
    const said = narrateEvents(opened.events, opened.career, content)
      .map((entry) => entry.text)
      .join(' ');
    expect(said).toContain('The books open 300 coin down on what the last Guildmaster owed.');
  });

  it('says nothing at all when there is none', () => {
    const opened = newCareer('e7-debt', content);
    const said = narrateEvents(opened.events, opened.career, content)
      .map((entry) => entry.text)
      .join(' ');
    expect(said).not.toContain('books open');
    expect(said).not.toContain('owed');
  });
});

/**
 * The three world sentences DL-25 §15 missed, and the one number format, both settled by
 * DL-27 while E8-S6 brought the browser to parity with the terminal.
 */
describe('the three sentences both front ends were writing separately', () => {
  it('marks somebody coming back, in words and never as a colour', () => {
    expect(returnerSentence).toBe(
      'Coming back: they were on your Roster before, and walked out.',
    );
  });

  it('says a Patron at the floor is posting nothing, and why it will go on', () => {
    expect(postingNothingSentence).toBe(
      'They are posting nothing at all, and will until their Regard for the Guild comes back up.',
    );
  });

  it('says a wronged Guild is taking more work, and whether they have room for a person', () => {
    expect(wrongedRivalSentence(true)).toBe(
      'You have wronged them, and they are taking more of the work you leave on the Board. ' +
        'They have room to take somebody off your Roster.',
    );
    expect(wrongedRivalSentence(false)).toBe(
      'You have wronged them, and they are taking more of the work you leave on the Board. ' +
        'Their own Roster is full, so they can take nobody off yours just now.',
    );
  });

  it('names no identifier and uses none of the words the vocabulary forbids', () => {
    const said = [
      returnerSentence,
      postingNothingSentence,
      wrongedRivalSentence(true),
      wrongedRivalSentence(false),
    ].join(' ');
    for (const forbidden of ['Reputation', 'Competitor', 'Client', 'Job board', 'Stable']) {
      expect(said).not.toContain(forbidden);
    }
    expect(said).not.toMatch(/[a-z]+-[0-9]/);
  });
});

describe('the one number format', () => {
  it('groups a four-figure sum and leaves a three-figure one alone', () => {
    expect(groupDigits(1140)).toBe('1,140');
    expect(groupDigits(575)).toBe('575');
    expect(groupDigits(1_234_567)).toBe('1,234,567');
    expect(groupDigits(-4912)).toBe('-4,912');
    expect(groupDigits(0)).toBe('0');
  });

  it('never abbreviates coin, and never writes it plural', () => {
    expect(coin(1140)).toBe('1,140 coin');
    expect(coin(1)).toBe('1 coin');
    expect(coin(0)).toBe('0 coin');
    expect(coin(1140)).not.toContain('k');
    expect(coin(1140)).not.toContain('coins');
  });

  it('is the format every sentence this package writes prints a four-figure sum in', () => {
    // One played Career, every paragraph, every bare four-or-more-figure run: not one of
    // them may be ungrouped, or a screen shows two conventions at once (DL-27 §1). Opened
    // rich so that the balances, fees and Upkeep lines actually reach four figures.
    const played = playCareer('e8-grouping', { careerYears: 2, startingCoin: 5000 });
    for (const text of played.paragraphs.map((entry) => entry.text)) {
      // A Day, a Year and an id are not sums; only a run of four or more digits standing
      // alone can be one, and `formatDay` never reaches four figures inside a Year.
      expect(text, text).not.toMatch(/(?<![\d,])\d{4,}(?![\d,])/);
    }
  });
});

describe('how a Hero’s going is said', () => {
  it('is the Guild’s own words for every kind the engine records, never its token', () => {
    expect(exitWords('departure')).toBe('walked out');
    expect(exitWords('death')).toBe('did not come back');
    expect(exitWords('retirement')).toBe('reached the end of a working life');
    for (const kind of ['departure', 'death', 'retirement'] as const) {
      expect(exitWords(kind)).not.toContain(kind);
    }
  });

  it('drops a reason that only says the going over again', () => {
    // The engine writes its own `REASON_REACHED_THE_END` into `hero.exit.reason`, so both
    // front ends read "reached the end of a working life, Year 1, Day 20: reached the end
    // of a working life" until this was here.
    expect(exitReason('retirement', 'reached the end of a working life')).toBeUndefined();
    expect(exitReason('retirement', '  reached the end of a working life  ')).toBeUndefined();
    expect(exitReason('death', 'did not come back from the weir')).toBe(
      'did not come back from the weir',
    );
    expect(exitReason('departure', 'had enough of being sent out alone')).toBe(
      'had enough of being sent out alone',
    );
    expect(exitReason('departure', undefined)).toBeUndefined();
  });
});

describe('why nobody at the door can be taken on', () => {
  const offer = (code?: 'RosterFull' | 'InsufficientCoin') =>
    ({ refusal: code === undefined ? undefined : { code } }) as never;

  it('names the one reason that is true of all of them', () => {
    expect(noneCanBeTakenReason([offer('RosterFull'), offer('RosterFull')], 12)).toBe(
      'the Roster is full at 12',
    );
    expect(noneCanBeTakenReason([offer('InsufficientCoin')], 12)).toBe(
      'the Guild cannot pay any of them yet',
    );
  });

  it('gives none where they disagree, rather than saying "none can be taken on" twice', () => {
    // The cue that carries this already says none can be taken on; the generic fallback
    // this used to return made both front ends read it twice in one line.
    expect(noneCanBeTakenReason([offer('RosterFull'), offer('InsufficientCoin')], 12)).toBeUndefined();
    expect(noneCanBeTakenReason([offer()], 12)).toBeUndefined();
    expect(noneCanBeTakenReason([], 12)).toBeUndefined();
  });
});
