import { describe, expect, it } from 'vitest';
import {
  parseApplicantChoice,
  parseArgs,
  parseCommand,
  parseEndChoice,
  parseHallChoice,
  parsePageChoice,
  parseRivalChoice,
  parseSelection,
  saidYes,
  seedFromClock,
  UsageError,
  type Environment,
} from '../src/input.js';

const NOW: Environment = { now: 1_700_000_000_000 };

describe('parseArgs', () => {
  it('defaults to a seed off the clock, ./.career and full output', () => {
    const options = parseArgs([], NOW);
    expect(options.seed).toBe(seedFromClock(NOW.now));
    expect(options.careerDir).toBe('./.career');
    expect(options.colour).toBeUndefined();
    expect(options.quiet).toBe(false);
    expect(options.years).toBeUndefined();
    expect(options.slot).toBeUndefined();
    expect(options.script).toBeUndefined();
  });

  it('leaves colour to the terminal unless the command line says otherwise', () => {
    expect(parseArgs([], NOW).colour).toBeUndefined();
    expect(parseArgs(['--no-colour'], NOW).colour).toBe(false);
    expect(parseArgs(['--no-color'], NOW).colour).toBe(false);
    expect(parseArgs(['--colour'], NOW).colour).toBe(true);
  });

  it('reads every flag', () => {
    const options = parseArgs(
      [
        '--seed',
        'e2e',
        '--career-dir',
        'C:/tmp/x',
        '--years',
        '3',
        '--slot',
        'one',
        '--script',
        's.txt',
        '--width',
        '40',
        '--quiet',
      ],
      NOW,
    );
    expect(options).toEqual({
      seed: 'e2e',
      careerDir: 'C:/tmp/x',
      years: 3,
      slot: 'one',
      script: 's.txt',
      width: 40,
      quiet: true,
    });
  });

  it('gives the same seed for the same clock reading, so a default run is still reproducible', () => {
    expect(parseArgs([], NOW).seed).toBe(parseArgs([], NOW).seed);
    expect(parseArgs([], NOW).seed).not.toBe(parseArgs([], { ...NOW, now: NOW.now + 1 }).seed);
  });

  it('refuses a flag it does not know', () => {
    expect(() => parseArgs(['--turbo'], NOW)).toThrow(UsageError);
    expect(() => parseArgs(['--turbo'], NOW)).toThrow(/--turbo/);
  });

  it('refuses a flag with nothing after it', () => {
    expect(() => parseArgs(['--seed'], NOW)).toThrow(UsageError);
    expect(() => parseArgs(['--seed', '--quiet'], NOW)).toThrow(/--seed needs a value/);
  });

  it('refuses a number of years that is not a whole number of years', () => {
    expect(() => parseArgs(['--years', 'many'], NOW)).toThrow(UsageError);
    expect(() => parseArgs(['--years', '0'], NOW)).toThrow(UsageError);
    expect(() => parseArgs(['--years', '1.5'], NOW)).toThrow(UsageError);
  });

  it('treats --help as a usage request', () => {
    expect(() => parseArgs(['--help'], NOW)).toThrow(/help/);
  });
});

describe('parseCommand', () => {
  it('reads a Commission number', () => {
    expect(parseCommand('1')).toEqual({ kind: 'pick', index: 1 });
    expect(parseCommand('  6 ')).toEqual({ kind: 'pick', index: 6 });
  });

  it('reads the single-letter commands', () => {
    expect(parseCommand('n')).toEqual({ kind: 'advance' });
    expect(parseCommand('a')).toEqual({ kind: 'applicants' });
    expect(parseCommand('A')).toEqual({ kind: 'applicants' });
    expect(parseCommand('i')).toEqual({ kind: 'hall' });
    expect(parseCommand('I')).toEqual({ kind: 'hall' });
    expect(parseCommand('h')).toEqual({ kind: 'help' });
    expect(parseCommand('q')).toEqual({ kind: 'quit' });
    expect(parseCommand('Q')).toEqual({ kind: 'quit' });
  });

  it('opens each read-only view on its own letter (E7-S3)', () => {
    expect(parseCommand('r')).toEqual({ kind: 'view', view: 'roster' });
    expect(parseCommand('p')).toEqual({ kind: 'view', view: 'patrons' });
    expect(parseCommand('g')).toEqual({ kind: 'view', view: 'league' });
    expect(parseCommand('f')).toEqual({ kind: 'view', view: 'former' });
    expect(parseCommand('o')).toEqual({ kind: 'rivals' });
  });

  it('saves to autosave unless a slot is named', () => {
    expect(parseCommand('s')).toEqual({ kind: 'save', slot: 'autosave' });
    expect(parseCommand('s one')).toEqual({ kind: 'save', slot: 'one' });
  });

  it('lists with l alone and loads with l and a slot', () => {
    expect(parseCommand('l')).toEqual({ kind: 'list' });
    expect(parseCommand('l one')).toEqual({ kind: 'load', slot: 'one' });
  });

  it('needs a slot to delete', () => {
    expect(parseCommand('d one')).toEqual({ kind: 'delete', slot: 'one' });
    expect(parseCommand('d').kind).toBe('unknown');
  });

  it('ignores an empty line and reports anything else', () => {
    expect(parseCommand('')).toEqual({ kind: 'nothing' });
    expect(parseCommand('   ')).toEqual({ kind: 'nothing' });
    expect(parseCommand('go north')).toEqual({ kind: 'unknown', text: 'go north' });
  });
});

describe('parseApplicantChoice', () => {
  it('reads a bare number as taking somebody on', () => {
    expect(parseApplicantChoice('1')).toEqual({ kind: 'accept', index: 1 });
    expect(parseApplicantChoice(' 3 ')).toEqual({ kind: 'accept', index: 3 });
  });

  it('needs the letter d to send somebody away, so the two cannot be confused', () => {
    expect(parseApplicantChoice('d1')).toEqual({ kind: 'decline', index: 1 });
    expect(parseApplicantChoice('d 2')).toEqual({ kind: 'decline', index: 2 });
    expect(parseApplicantChoice('D 2')).toEqual({ kind: 'decline', index: 2 });
  });

  it('goes back on Enter, on q and on cancel', () => {
    expect(parseApplicantChoice('')).toEqual({ kind: 'cancel' });
    expect(parseApplicantChoice('  ')).toEqual({ kind: 'cancel' });
    expect(parseApplicantChoice('q')).toEqual({ kind: 'cancel' });
    expect(parseApplicantChoice('cancel')).toEqual({ kind: 'cancel' });
  });

  it('says so when it cannot make sense of the line', () => {
    expect(parseApplicantChoice('Nerys')).toEqual({ kind: 'unknown', text: 'nerys' });
    expect(parseApplicantChoice('d')).toEqual({ kind: 'unknown', text: 'd' });
    expect(parseApplicantChoice('-1')).toEqual({ kind: 'unknown', text: '-1' });
  });
});

describe('parseSelection', () => {
  it('commits on an empty line', () => {
    expect(parseSelection('')).toEqual({ kind: 'commit' });
    expect(parseSelection('   ')).toEqual({ kind: 'commit' });
  });

  it('goes back on q', () => {
    expect(parseSelection('q')).toEqual({ kind: 'cancel' });
    expect(parseSelection('cancel')).toEqual({ kind: 'cancel' });
  });

  it('toggles one letter or several', () => {
    expect(parseSelection('a')).toEqual({ kind: 'toggle', letters: ['a'] });
    expect(parseSelection('ab')).toEqual({ kind: 'toggle', letters: ['a', 'b'] });
    expect(parseSelection('a b, c')).toEqual({ kind: 'toggle', letters: ['a', 'b', 'c'] });
    expect(parseSelection('A')).toEqual({ kind: 'toggle', letters: ['a'] });
  });

  it('reports a letter outside the Roster', () => {
    expect(parseSelection('z')).toEqual({ kind: 'unknown', text: 'z' });
    expect(parseSelection('1')).toEqual({ kind: 'unknown', text: '1' });
  });
});

/** The Hall's own prompt (E3-S4): a number buys, and anything else goes back. */
describe('parseHallChoice', () => {
  it('reads a number as the improvement to buy', () => {
    expect(parseHallChoice('1')).toEqual({ kind: 'buy', index: 1 });
    expect(parseHallChoice(' 3 ')).toEqual({ kind: 'buy', index: 3 });
    expect(parseHallChoice('9')).toEqual({ kind: 'buy', index: 9 });
  });

  it('goes back on Enter, on q and on cancel', () => {
    expect(parseHallChoice('')).toEqual({ kind: 'cancel' });
    expect(parseHallChoice('  ')).toEqual({ kind: 'cancel' });
    expect(parseHallChoice('q')).toEqual({ kind: 'cancel' });
    expect(parseHallChoice('Q')).toEqual({ kind: 'cancel' });
    expect(parseHallChoice('cancel')).toEqual({ kind: 'cancel' });
  });

  it('says so when it cannot make sense of the line', () => {
    expect(parseHallChoice('infirmary')).toEqual({ kind: 'unknown', text: 'infirmary' });
    expect(parseHallChoice('-1')).toEqual({ kind: 'unknown', text: '-1' });
  });
});

/** Reading a paging view: two things to do, and nothing else (E7-S3). */
describe('parsePageChoice', () => {
  it('goes back on Enter and on q, and turns the page on m', () => {
    expect(parsePageChoice('')).toEqual({ kind: 'back' });
    expect(parsePageChoice('q')).toEqual({ kind: 'back' });
    expect(parsePageChoice('cancel')).toEqual({ kind: 'back' });
    expect(parsePageChoice('m')).toEqual({ kind: 'more' });
    expect(parsePageChoice('more')).toEqual({ kind: 'more' });
    expect(parsePageChoice('x')).toEqual({ kind: 'unknown', text: 'x' });
  });
});

describe('parseRivalChoice', () => {
  it('needs a letter and a number, because both moves spend coin', () => {
    expect(parseRivalChoice('t 1')).toEqual({ kind: 'transfer', index: 1 });
    expect(parseRivalChoice('p3')).toEqual({ kind: 'poach', index: 3 });
    expect(parseRivalChoice('m')).toEqual({ kind: 'more' });
    expect(parseRivalChoice('q')).toEqual({ kind: 'cancel' });
    expect(parseRivalChoice('1')).toEqual({ kind: 'unknown', text: '1' });
  });
});

/**
 * A Career that has ended offers exactly two things, and beginning a new one is
 * deliberately **not** `n`: a player who has been pressing `n` to let the Days run must
 * not start a new Career by muscle memory the moment this one ends (DL-25 §13).
 */
describe('parseEndChoice', () => {
  it('takes b for a new Career and q for leaving', () => {
    expect(parseEndChoice('b')).toEqual({ kind: 'new' });
    expect(parseEndChoice('begin')).toEqual({ kind: 'new' });
    expect(parseEndChoice('q')).toEqual({ kind: 'quit' });
    expect(parseEndChoice('')).toEqual({ kind: 'quit' });
  });

  it('does not take n for a new Career', () => {
    expect(parseEndChoice('n')).toEqual({ kind: 'unknown', text: 'n' });
  });
});

/** Every coin spend takes a confirming keypress, and only y is a yes (DL-25 §3). */
describe('saidYes', () => {
  it('takes y and nothing else', () => {
    expect(saidYes('y')).toBe(true);
    expect(saidYes(' Y ')).toBe(true);
    expect(saidYes('yes')).toBe(false);
    expect(saidYes('n')).toBe(false);
    expect(saidYes('')).toBe(false);
    expect(saidYes(undefined)).toBe(false);
  });
});
