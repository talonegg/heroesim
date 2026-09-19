import { describe, expect, it } from 'vitest';
import {
  parseArgs,
  parseCommand,
  parseSelection,
  seedFromClock,
  UsageError,
  type Environment,
} from '../src/input.js';

const NOW: Environment = { now: 1_700_000_000_000, isTty: false };

describe('parseArgs', () => {
  it('defaults to a seed off the clock, ./.career, no colour off a terminal and full output', () => {
    const options = parseArgs([], NOW);
    expect(options.seed).toBe(seedFromClock(NOW.now));
    expect(options.careerDir).toBe('./.career');
    expect(options.colour).toBe(false);
    expect(options.quiet).toBe(false);
    expect(options.years).toBeUndefined();
    expect(options.slot).toBeUndefined();
    expect(options.script).toBeUndefined();
  });

  it('turns colour on by default when stdout is a terminal', () => {
    expect(parseArgs([], { ...NOW, isTty: true }).colour).toBe(true);
    expect(parseArgs(['--no-colour'], { ...NOW, isTty: true }).colour).toBe(false);
    expect(parseArgs(['--no-color'], { ...NOW, isTty: true }).colour).toBe(false);
  });

  it('reads every flag', () => {
    const options = parseArgs(
      ['--seed', 'e2e', '--career-dir', 'C:/tmp/x', '--years', '3', '--slot', 'one', '--script', 's.txt', '--quiet'],
      NOW,
    );
    expect(options).toEqual({
      seed: 'e2e',
      careerDir: 'C:/tmp/x',
      years: 3,
      slot: 'one',
      script: 's.txt',
      colour: false,
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
    expect(parseCommand('h')).toEqual({ kind: 'help' });
    expect(parseCommand('q')).toEqual({ kind: 'quit' });
    expect(parseCommand('Q')).toEqual({ kind: 'quit' });
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
