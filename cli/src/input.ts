/**
 * What the player typed, and what they asked for on the command line. Both are pure
 * functions over strings so that the loop in `index.ts` is the only place that reads a
 * terminal.
 */

import { AUTOSAVE_SLOT } from './saves.js';

/** The flags the CLI takes. */
export interface Options {
  /** The string the world is generated from. */
  seed: string;
  /** Where save slots live. */
  careerDir: string;
  /** Overrides `config.careerYears` when given. */
  years?: number;
  /** Whether to use ANSI colour. Off when stdout is not a terminal or `--no-colour`. */
  colour: boolean;
  /** A slot to load instead of starting a new Career. */
  slot?: string;
  /** Read commands from this file instead of the terminal. */
  script?: string;
  /** Suppress the Board redraw between commands, leaving only the narration. */
  quiet: boolean;
}

/** What `parseArgs` needs from the world, so that tests can hand it a fixed one. */
export interface Environment {
  /** Milliseconds since the epoch, used for the default seed. */
  now: number;
  /** Whether stdout is a terminal. */
  isTty: boolean;
}

/** A command line the CLI could not make sense of. */
export class UsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UsageError';
  }
}

/** The default seed: the Career is still reproducible, it just was not named. */
export function seedFromClock(now: number): string {
  return `run-${Math.floor(now).toString(36)}`;
}

function nextValue(argv: readonly string[], index: number, flag: string): string {
  const value = argv[index + 1];
  if (value === undefined || value.startsWith('--')) {
    throw new UsageError(`${flag} needs a value`);
  }
  return value;
}

/**
 * Read the command line.
 *
 * @throws UsageError on an unknown flag or a flag with nothing after it
 */
export function parseArgs(argv: readonly string[], environment: Environment): Options {
  const options: Options = {
    seed: seedFromClock(environment.now),
    careerDir: './.career',
    colour: environment.isTty,
    quiet: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === undefined) continue;
    switch (argument) {
      case '--seed':
        options.seed = nextValue(argv, index, '--seed');
        index += 1;
        break;
      case '--career-dir':
        options.careerDir = nextValue(argv, index, '--career-dir');
        index += 1;
        break;
      case '--years': {
        const raw = nextValue(argv, index, '--years');
        const years = Number(raw);
        if (!Number.isInteger(years) || years < 1) {
          throw new UsageError(`--years wants a whole number of years, not "${raw}"`);
        }
        options.years = years;
        index += 1;
        break;
      }
      case '--slot':
        options.slot = nextValue(argv, index, '--slot');
        index += 1;
        break;
      case '--script':
        options.script = nextValue(argv, index, '--script');
        index += 1;
        break;
      case '--no-colour':
      case '--no-color':
        options.colour = false;
        break;
      case '--colour':
      case '--color':
        options.colour = true;
        break;
      case '--quiet':
        options.quiet = true;
        break;
      case '--help':
      case '-h':
        throw new UsageError('help');
      default:
        throw new UsageError(`"${argument}" is not a flag this program knows`);
    }
  }

  return options;
}

/** The usage text, printed for `--help` and for a command line that did not parse. */
export const USAGE = [
  'heroesim - run a Guild of heroes.',
  '',
  '  --seed <string>      generate the world from this seed',
  '  --career-dir <path>  where save slots live (default ./.career)',
  '  --years <n>          how many years the Career runs',
  '  --slot <name>        load this slot instead of starting a new Career',
  '  --no-colour          plain text only (the default when output is not a terminal)',
  '  --script <file>      read commands from a file, one per line',
  '  --quiet              narration only, without the Board between commands',
].join('\n');

/** A command typed at the Board. */
export type Command =
  | { kind: 'pick'; index: number }
  | { kind: 'advance' }
  | { kind: 'save'; slot: string }
  | { kind: 'list' }
  | { kind: 'load'; slot: string }
  | { kind: 'delete'; slot: string }
  | { kind: 'help' }
  | { kind: 'quit' }
  | { kind: 'nothing' }
  | { kind: 'unknown'; text: string };

/** Read a line typed at the Board. */
export function parseCommand(line: string): Command {
  const trimmed = line.trim();
  if (trimmed.length === 0) return { kind: 'nothing' };

  const [word = '', ...rest] = trimmed.split(/\s+/);
  const argument = rest.join(' ');

  if (/^\d+$/.test(word)) return { kind: 'pick', index: Number(word) };

  switch (word.toLowerCase()) {
    case 'n':
      return { kind: 'advance' };
    case 's':
      return { kind: 'save', slot: argument.length > 0 ? argument : AUTOSAVE_SLOT };
    case 'l':
      return argument.length > 0 ? { kind: 'load', slot: argument } : { kind: 'list' };
    case 'd':
      return argument.length > 0
        ? { kind: 'delete', slot: argument }
        : { kind: 'unknown', text: 'd needs the name of a slot to delete' };
    case 'h':
    case '?':
      return { kind: 'help' };
    case 'q':
      return { kind: 'quit' };
    default:
      return { kind: 'unknown', text: trimmed };
  }
}

/** A line typed while choosing who to send. */
export type Selection =
  | { kind: 'toggle'; letters: string[] }
  | { kind: 'commit' }
  | { kind: 'cancel' }
  | { kind: 'unknown'; text: string };

/** The letters the Roster is labelled with, a to l. */
export const ROSTER_LETTERS = 'abcdefghijkl';

/** Read a line typed while choosing a Party. Enter on its own commits. */
export function parseSelection(line: string): Selection {
  const trimmed = line.trim().toLowerCase();
  if (trimmed.length === 0) return { kind: 'commit' };
  if (trimmed === 'q' || trimmed === 'cancel') return { kind: 'cancel' };

  const letters = trimmed.split(/[\s,]+/).flatMap((part) => [...part]);
  if (letters.every((letter) => ROSTER_LETTERS.includes(letter))) {
    return { kind: 'toggle', letters };
  }
  return { kind: 'unknown', text: trimmed };
}
