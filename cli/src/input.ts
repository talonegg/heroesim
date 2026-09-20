/**
 * What the player typed, and what they asked for on the command line. Both are pure
 * functions over strings so that the loop in `main.ts` is the only place that reads a
 * terminal, and `screen.ts` the only place that reads the environment.
 */

import { defaultConfig, type GameConfig } from '@heroesim/engine';
import { AUTOSAVE_SLOT } from './slots.js';

/** The flags the CLI takes. */
export interface Options {
  /** The string the world is generated from. */
  seed: string;
  /** Where save slots live. */
  careerDir: string;
  /** Overrides `config.careerYears` when given. */
  years?: number;
  /**
   * Overrides for any other `GameConfig` field, from `--config key=value`. Every tunable
   * is a named field (CLAUDE.md invariant 8), so this is how a rule is tried out — and
   * how a test puts the world in a state that a seed alone cannot reach.
   */
  config?: Partial<GameConfig>;
  /** Whether to use ANSI colour. Unset means "whatever the terminal says". */
  colour?: boolean;
  /** Force the pure-ASCII output a terminal with no Unicode needs. */
  ascii?: boolean;
  /** Lay out at this many columns instead of asking the terminal. */
  width?: number;
  /** A slot to load instead of starting a new Career. */
  slot?: string;
  /** Read commands from this file instead of the terminal. */
  script?: string;
  /** Suppress the screen redraw between commands, leaving only the narration. */
  quiet: boolean;
}

/** What `parseArgs` needs from the world, so that tests can hand it a fixed one. */
export interface Environment {
  /** Milliseconds since the epoch, used for the default seed. */
  now: number;
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
 * Read one `--config key=value` pair. Every `GameConfig` field is a number, so anything
 * that is not one is a mistake worth stopping for rather than quietly ignoring.
 *
 * @throws UsageError on a field this game has no such tunable for, or a value that is not
 * a finite number.
 */
export function parseConfigOverride(raw: string): { key: keyof GameConfig; value: number } {
  const at = raw.indexOf('=');
  if (at <= 0) throw new UsageError(`--config wants key=value, not "${raw}"`);
  const key = raw.slice(0, at);
  if (!Object.hasOwn(defaultConfig, key)) {
    throw new UsageError(`--config: there is no tunable called "${key}"`);
  }
  const value = Number(raw.slice(at + 1));
  if (!Number.isFinite(value)) {
    throw new UsageError(`--config ${key} wants a number, not "${raw.slice(at + 1)}"`);
  }
  return { key: key as keyof GameConfig, value };
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
      case '--width': {
        const raw = nextValue(argv, index, '--width');
        const width = Number(raw);
        if (!Number.isInteger(width) || width < 20) {
          throw new UsageError(`--width wants a whole number of columns, 20 or more, not "${raw}"`);
        }
        options.width = width;
        index += 1;
        break;
      }
      case '--config': {
        const { key, value } = parseConfigOverride(nextValue(argv, index, '--config'));
        options.config = { ...options.config, [key]: value };
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
      case '--ascii':
        options.ascii = true;
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
  '  --config key=value   override one balance tunable (repeatable)',
  '  --slot <name>        load this slot instead of starting a new Career',
  '  --width <n>          lay out at this many columns instead of asking the terminal',
  '  --no-colour          plain text only (the default when output is not a terminal)',
  '  --ascii              pure ASCII, for a terminal that cannot show a dash',
  '  --script <file>      read commands from a file, one per line',
  '  --quiet              narration only, without the screen between commands',
].join('\n');

/** The read-only views, each one keypress away and one keypress back (E7-S3). */
export type ViewName = 'roster' | 'patrons' | 'league' | 'former';

/** A command typed at the main screen. */
export type Command =
  | { kind: 'pick'; index: number }
  | { kind: 'view'; view: ViewName }
  | { kind: 'applicants' }
  | { kind: 'rivals' }
  | { kind: 'hall' }
  | { kind: 'word' }
  | { kind: 'advance' }
  | { kind: 'save'; slot: string }
  | { kind: 'list' }
  | { kind: 'load'; slot: string }
  | { kind: 'delete'; slot: string }
  | { kind: 'help' }
  | { kind: 'quit' }
  | { kind: 'nothing' }
  | { kind: 'unknown'; text: string };

/** Read a line typed at the main screen. */
export function parseCommand(line: string): Command {
  const trimmed = line.trim();
  if (trimmed.length === 0) return { kind: 'nothing' };

  const [word = '', ...rest] = trimmed.split(/\s+/);
  const argument = rest.join(' ');

  if (/^\d+$/.test(word)) return { kind: 'pick', index: Number(word) };

  switch (word.toLowerCase()) {
    case 'r':
      return { kind: 'view', view: 'roster' };
    case 'p':
      return { kind: 'view', view: 'patrons' };
    case 'g':
      return { kind: 'view', view: 'league' };
    case 'f':
      return { kind: 'view', view: 'former' };
    case 'a':
      return { kind: 'applicants' };
    case 'o':
      return { kind: 'rivals' };
    case 'i':
      return { kind: 'hall' };
    case 'w':
      return { kind: 'word' };
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

/** A line typed while reading one of the paging views (E7-S3). */
export type PageChoice = { kind: 'more' } | { kind: 'back' } | { kind: 'unknown'; text: string };

/** Read a line typed at a read-only view. Enter or q goes back; m shows more. */
export function parsePageChoice(line: string): PageChoice {
  const trimmed = line.trim().toLowerCase();
  if (trimmed.length === 0 || trimmed === 'q' || trimmed === 'cancel') return { kind: 'back' };
  if (trimmed === 'm' || trimmed === 'more') return { kind: 'more' };
  return { kind: 'unknown', text: trimmed };
}

/** A line typed at the Hall (E3-S4). */
export type HallChoice =
  | { kind: 'buy'; index: number }
  | { kind: 'more' }
  | { kind: 'cancel' }
  | { kind: 'unknown'; text: string };

/** Read a line typed at the Hall. Enter on its own goes back, as q does. */
export function parseHallChoice(line: string): HallChoice {
  const trimmed = line.trim().toLowerCase();
  if (trimmed.length === 0 || trimmed === 'q' || trimmed === 'cancel') return { kind: 'cancel' };
  if (trimmed === 'm' || trimmed === 'more') return { kind: 'more' };
  if (/^\d+$/.test(trimmed)) return { kind: 'buy', index: Number(trimmed) };
  return { kind: 'unknown', text: trimmed };
}

/**
 * A line typed at the Applicants (E4-S3). A bare number takes somebody on, because that
 * is the decision the view exists for — and from E7 it is followed by a confirming
 * keypress, because it spends coin (DL-20 §6, DL-25 §3); sending somebody away is `d` and
 * the number, so the two cannot be confused with one another by a slip of the finger.
 */
export type ApplicantChoice =
  | { kind: 'accept'; index: number }
  | { kind: 'decline'; index: number }
  | { kind: 'more' }
  | { kind: 'cancel' }
  | { kind: 'unknown'; text: string };

/** Read a line typed at the Applicants. Enter on its own goes back, as q does. */
export function parseApplicantChoice(line: string): ApplicantChoice {
  const trimmed = line.trim().toLowerCase();
  if (trimmed.length === 0 || trimmed === 'q' || trimmed === 'cancel') return { kind: 'cancel' };
  if (trimmed === 'm' || trimmed === 'more') return { kind: 'more' };
  if (/^\d+$/.test(trimmed)) return { kind: 'accept', index: Number(trimmed) };
  const declining = /^d\s*(\d+)$/.exec(trimmed);
  if (declining !== null) return { kind: 'decline', index: Number(declining[1]) };
  return { kind: 'unknown', text: trimmed };
}

/**
 * A line typed at the Word view (DL-26 §2), where every waiting Party's prompt and options
 * are shown whole. The options are numbered straight through every Party, so one number is
 * one answer wherever it sits, exactly as it is on the main screen's full form.
 */
export type WordChoice =
  | { kind: 'answer'; index: number }
  | { kind: 'more' }
  | { kind: 'cancel' }
  | { kind: 'unknown'; text: string };

/** Read a line typed at the Word view. Enter on its own goes back, as q does. */
export function parseWordChoice(line: string): WordChoice {
  const trimmed = line.trim().toLowerCase();
  if (trimmed.length === 0 || trimmed === 'q' || trimmed === 'cancel') return { kind: 'cancel' };
  if (trimmed === 'm' || trimmed === 'more') return { kind: 'more' };
  if (/^\d+$/.test(trimmed)) return { kind: 'answer', index: Number(trimmed) };
  return { kind: 'unknown', text: trimmed };
}

/**
 * A line typed at the other Guilds (E5-S2). `t <n>` brings somebody over and `p <n>` takes
 * them without asking; neither is a bare number, because both spend coin and the two are
 * not the same transaction — one leaves the other Guild's goodwill where it was and the
 * other does not.
 */
export type RivalChoice =
  | { kind: 'transfer'; index: number }
  | { kind: 'poach'; index: number }
  | { kind: 'more' }
  | { kind: 'cancel' }
  | { kind: 'unknown'; text: string };

/** Read a line typed at the other Guilds. Enter on its own goes back, as q does. */
export function parseRivalChoice(line: string): RivalChoice {
  const trimmed = line.trim().toLowerCase();
  if (trimmed.length === 0 || trimmed === 'q' || trimmed === 'cancel') return { kind: 'cancel' };
  if (trimmed === 'm' || trimmed === 'more') return { kind: 'more' };
  const transferring = /^t\s*(\d+)$/.exec(trimmed);
  if (transferring !== null) return { kind: 'transfer', index: Number(transferring[1]) };
  const poaching = /^p\s*(\d+)$/.exec(trimmed);
  if (poaching !== null) return { kind: 'poach', index: Number(poaching[1]) };
  return { kind: 'unknown', text: trimmed };
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

/**
 * A line typed at a Career that has ended (E7-S4). There are exactly two things left to
 * do, and anything else is not one of them.
 */
export type EndChoice = { kind: 'new' } | { kind: 'quit' } | { kind: 'unknown'; text: string };

/** Read a line typed at an ended Career. */
export function parseEndChoice(line: string): EndChoice {
  const trimmed = line.trim().toLowerCase();
  // Deliberately **not** `n`: a player who has been pressing `n` to let the Days run must
  // not begin a new Career by muscle memory the moment this one ends.
  if (trimmed === 'b' || trimmed === 'begin' || trimmed === 'new') return { kind: 'new' };
  if (trimmed.length === 0 || trimmed === 'q' || trimmed === 'quit') return { kind: 'quit' };
  return { kind: 'unknown', text: trimmed };
}

/** Whether a confirming keypress said yes. Everything else is a no (E7, DL-25 §3). */
export function saidYes(line: string | undefined): boolean {
  return line !== undefined && line.trim().toLowerCase() === 'y';
}
