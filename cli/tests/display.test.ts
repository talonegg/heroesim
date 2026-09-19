/**
 * The screen is 80 columns and prose wraps at 78, whatever the Guild has managed to name
 * itself. The Career here is deliberately given absurd names so that the columns are
 * tested against the worst case rather than the one the generator happens to produce.
 */

import { describe, expect, it } from 'vitest';
import { newCareer, type Career, type Content } from '@heroesim/engine';
import { loadContentFromDisk } from '@heroesim/content/node';
import type { Paragraph } from '@heroesim/narrate';
import {
  ansiPalette,
  cell,
  clip,
  days,
  difficultyBand,
  helpLines,
  narrationLines,
  nextDayOn,
  plainPalette,
  screenLines,
  selectionLines,
  slotLines,
  wrap,
  WIDTH,
} from '../src/display.js';

const content: Content = loadContentFromDisk();
const opened = newCareer('display', content);

const LONG = 'Bartholomew Grimsditch-Wetherby of the Nine Fords and the Far Weir';

/** The same Career with every name as long as anything could plausibly be. */
function stretched(career: Career): Career {
  return {
    ...career,
    guild: {
      ...career.guild,
      name: `${LONG} Guild of the Grand and Ancient Company of Hired Swords`,
      roster: career.guild.roster.map((hero) => ({
        ...hero,
        name: LONG,
        traits: [
          { name: `${LONG} the Unlucky`, since: 1 },
          { name: 'Another very long Trait indeed', since: 1 },
        ],
      })),
    },
    patrons: career.patrons.map((patron) => ({ ...patron, name: `${LONG}, Patron` })),
    board: career.board.map((commission) => ({
      ...commission,
      title: `${LONG} and the matter of the missing tithe barge, urgently`,
    })),
  };
}

const wide = stretched(opened.career);

function longest(lines: readonly string[]): number {
  return lines.reduce((most, line) => Math.max(most, line.length), 0);
}

describe('wrap', () => {
  it('never returns a line wider than asked for', () => {
    const text = 'The quick brown fox jumps over the lazy dog, and then does it again. '.repeat(8);
    for (const line of wrap(text, 78)) expect(line.length).toBeLessThanOrEqual(78);
  });

  it('breaks a word that is wider than the line rather than running over', () => {
    const lines = wrap('x'.repeat(200), 40);
    expect(longest(lines)).toBeLessThanOrEqual(40);
    expect(lines.join('')).toBe('x'.repeat(200));
  });

  it("keeps the author's own line breaks", () => {
    expect(wrap('one\ntwo', 78)).toEqual(['one', 'two']);
    expect(wrap('one\n\ntwo', 78)).toEqual(['one', '', 'two']);
  });

  it('loses no words', () => {
    const text = 'a bb ccc dddd eeeee ffffff ggggggg';
    expect(wrap(text, 10).join(' ').split(/\s+/)).toEqual(text.split(' '));
  });
});

describe('clip and cell', () => {
  it('marks where a string was cut', () => {
    expect(clip('abcdefghij', 10)).toBe('abcdefghij');
    expect(clip('abcdefghij', 6)).toBe('abc...');
    expect(clip('abcdefghij', 6).length).toBe(6);
  });

  it('pads a cell out to its width', () => {
    expect(cell('ab', 5)).toBe('ab   ');
    expect(cell('abcdefgh', 5).length).toBe(5);
  });
});

describe('difficultyBand', () => {
  const config = opened.career.config;

  it('bands the configured range from easy to grim', () => {
    expect(difficultyBand(config.difficultyMin, config)).toBe('easy');
    expect(difficultyBand(config.difficultyMax, config)).toBe('grim');
    const bands = new Set(
      Array.from({ length: config.difficultyMax - config.difficultyMin + 1 }, (_, step) =>
        difficultyBand(config.difficultyMin + step, config),
      ),
    );
    expect(bands).toEqual(new Set(['easy', 'fair', 'hard', 'grim']));
  });

  it('never reads a balance number out of thin air when the range is a single point', () => {
    expect(difficultyBand(11, { ...config, difficultyMin: 11, difficultyMax: 11 })).toBe('fair');
  });
});

describe('days and the clocks', () => {
  it('counts Days in British English', () => {
    expect(days(1)).toBe('1 Day');
    expect(days(4)).toBe('4 Days');
  });

  it('finds the next Day a cycle falls due, never the one just passed', () => {
    expect(nextDayOn(1, 10)).toBe(10);
    expect(nextDayOn(9, 10)).toBe(10);
    expect(nextDayOn(10, 10)).toBe(20);
    expect(nextDayOn(11, 10)).toBe(20);
  });
});

describe('the screen, with the longest names anybody could give', () => {
  const lines = screenLines(wide, content, ['a decision '.repeat(12)], plainPalette);

  it('fits 80 columns', () => {
    expect(longest(lines)).toBeLessThanOrEqual(WIDTH);
  });

  it('numbers the Board and letters the Roster', () => {
    expect(lines.some((line) => line.startsWith('  1  '))).toBe(true);
    expect(lines.some((line) => line.startsWith('  a  '))).toBe(true);
  });

  it('shows the money, the Upkeep clock and the Board clock', () => {
    const joined = lines.join('\n');
    expect(joined).toContain('coin');
    expect(joined).toMatch(/Upkeep of \d+ coin in \d+ Days?\./);
    expect(joined).toMatch(/Board refreshes in \d+ Days?\./);
  });

  it('keeps only the last five decisions', () => {
    const many = Array.from({ length: 9 }, (_, index) => `decision ${index}`);
    const shown = screenLines(wide, content, many.slice(-5), plainPalette);
    expect(shown.filter((line) => line.includes('decision ')).length).toBe(5);
  });

  it('fits 80 columns while a Party is being chosen, too', () => {
    const commission = wide.board[0];
    if (commission === undefined) throw new Error('no Board');
    const hero = wide.guild.roster[0];
    if (hero === undefined) throw new Error('no Roster');
    const chosen = selectionLines(wide, commission, [hero.id], plainPalette);
    expect(longest(chosen)).toBeLessThanOrEqual(WIDTH);
    expect(chosen.some((line) => line.startsWith('  a*'))).toBe(true);
  });

  it('fits 80 columns in the help and the save listing', () => {
    expect(longest(helpLines(plainPalette))).toBeLessThanOrEqual(WIDTH);
    expect(
      longest(
        slotLines(
          [
            { name: 'autosave', day: 1234, seed: LONG, guildName: LONG },
            { name: 'broken', problem: 'the file is not readable' },
          ],
          plainPalette,
        ),
      ),
    ).toBeLessThanOrEqual(WIDTH);
    expect(slotLines([], plainPalette)).toEqual(['Nothing is saved yet.']);
  });

  it('adds nothing but escape codes when colour is on', () => {
    const coloured = screenLines(wide, content, [], ansiPalette);
    const escape = new RegExp(`${String.fromCharCode(27)}\\[\\d+m`, 'g');
    const stripped = coloured.map((line) => line.replaceAll(escape, ''));
    expect(stripped).toEqual(screenLines(wide, content, [], plainPalette));
  });
});

describe('narrationLines', () => {
  const paragraph = (kind: Paragraph['kind'], day: number, text: string): Paragraph => ({
    kind,
    day,
    text,
  });

  it('heads each Day once and wraps the prose', () => {
    const lines = narrationLines(
      [
        paragraph('beat', 3, 'A '.repeat(90).trim()),
        paragraph('note', 3, 'Something else happened.'),
        paragraph('beat', 4, 'Later.'),
      ],
      wide,
      plainPalette,
    );
    expect(lines.filter((line) => line === 'Year 1, Day 3')).toHaveLength(1);
    expect(lines.filter((line) => line === 'Year 1, Day 4')).toHaveLength(1);
    expect(longest(lines)).toBeLessThanOrEqual(WIDTH);
  });

  it('collapses a run of Upkeeps with nothing between them into one line', () => {
    const lines = narrationLines(
      [
        paragraph('coin', 10, 'Upkeep of 50 coin falls due. 450 coin remains.'),
        paragraph('coin', 20, 'Upkeep of 50 coin falls due. 400 coin remains.'),
        paragraph('coin', 30, 'Upkeep of 50 coin falls due. 350 coin remains.'),
      ],
      wide,
      plainPalette,
    );
    const body = lines.filter((line) => line.includes('Upkeep'));
    expect(body).toHaveLength(1);
    expect(body[0]).toContain('(x3)');
    expect(body[0]).toContain('350 coin remains');
    expect(lines).toContain('Year 1, Day 30');
    expect(lines).not.toContain('Year 1, Day 10');
  });

  it('does not collapse Upkeeps that had something between them', () => {
    const lines = narrationLines(
      [
        paragraph('coin', 10, 'Upkeep of 50 coin falls due. 450 coin remains.'),
        paragraph('beat', 15, 'Something happened.'),
        paragraph('coin', 20, 'Upkeep of 50 coin falls due. 400 coin remains.'),
      ],
      wide,
      plainPalette,
    );
    expect(lines.filter((line) => line.includes('Upkeep'))).toHaveLength(2);
  });

  it('keeps the Board and the Upkeep terse and gives prose room to breathe', () => {
    const lines = narrationLines(
      [
        paragraph('coin', 10, 'Upkeep of 50 coin falls due. 450 coin remains.'),
        paragraph('board', 10, 'New on the Board: one thing.'),
        paragraph('return', 10, 'Work, for a Patron: the work was finished.'),
      ],
      wide,
      plainPalette,
    );
    const upkeepAt = lines.findIndex((line) => line.includes('Upkeep'));
    const boardAt = lines.findIndex((line) => line.includes('New on the Board'));
    expect(boardAt).toBe(upkeepAt + 1);
    expect(lines[lines.length - 1]).not.toBe('');
  });

  it('says nothing about nothing', () => {
    expect(narrationLines([], wide, plainPalette)).toEqual([]);
  });
});
