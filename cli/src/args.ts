// The command line, `heroesim <command> [flags]`, parsed into a typed command or refused with a
// reason. Nothing here reads a save or the content: whether a Guild Background or an id exists
// is the command's to check, once the save and the content are open.

import { currentSave } from './saves.js';

export const usage = `Usage: heroesim <command> [flags]

Commands:
  new --guild <name> --master <name> [--seed <seed>] [--background <key>] [--force]
      Create a world and make it the save. Without --seed a readable seed is made up.
      Without --background the Guild's Background is drawn from the seed. An existing
      save is replaced only with --force.
  show [guilds | roster [guildId] | pool | patrons | board | hero <heroId> | history [entityId]]
      Print the save: with no view, the Turn, the Guilds and counts; roster shows the
      player's Guild unless given another; board shows the Quests on offer; history shows
      the whole History unless given an id.
  advance [--turns <n>]
      Play the next n Turns, 1 unless given, and print what happened. Time moves only
      here; every other command acts within the current Turn. Stops early if the game ends.
  rebase
      Adopt this release's default rules. A save plays under the rules it was created
      with until it is rebased; the History records when it was.
  save --as <file>
      Copy the save to <file>.
  load <file>
      Check <file> and, if it loads, make it the save.
  help
      Print this message.

Every command takes --save <file>, the save it reads and writes: "${currentSave}" unless given.
A <file> with no slash and no ".json" is <file>.json in the save directory, .saves/ in the
working directory or HEROESIM_SAVE_DIR if set; anything else is a path.
`;

export type View =
  | { kind: 'summary' }
  | { kind: 'guilds' }
  | { kind: 'roster'; guildId?: string }
  | { kind: 'pool' }
  | { kind: 'patrons' }
  | { kind: 'board' }
  | { kind: 'hero'; heroId: string }
  | { kind: 'history'; entityId?: string };

export type Command =
  | { name: 'help' }
  | {
      name: 'new';
      save: string;
      guild: string;
      master: string;
      seed?: string;
      background?: string;
      force: boolean;
    }
  | { name: 'show'; save: string; view: View }
  | { name: 'advance'; save: string; turns: number }
  | { name: 'rebase'; save: string }
  | { name: 'save'; save: string; as: string }
  | { name: 'load'; save: string; file: string };

export type Parsed = { ok: true; command: Command } | { ok: false; problem: string };

/** The flags each command takes, and whether each takes a value. */
const flagsOf: Record<Command['name'], Record<string, 'value' | 'switch'>> = {
  help: {},
  new: { save: 'value', seed: 'value', guild: 'value', master: 'value', background: 'value', force: 'switch' },
  show: { save: 'value' },
  advance: { save: 'value', turns: 'value' },
  rebase: { save: 'value' },
  save: { save: 'value', as: 'value' },
  load: { save: 'value' },
};

function isCommandName(name: string): name is Command['name'] {
  return Object.hasOwn(flagsOf, name);
}

class Refusal extends Error {}

function refuse(problem: string): never {
  throw new Refusal(problem);
}

/** Splits the words after the command into flags and positional arguments. */
function split(command: Command['name'], words: readonly string[]): { flags: Map<string, string>; positional: string[] } {
  const known = flagsOf[command];
  const flags = new Map<string, string>();
  const positional: string[] = [];
  for (let index = 0; index < words.length; index += 1) {
    const word = words[index] ?? '';
    if (!word.startsWith('--')) {
      positional.push(word);
      continue;
    }
    const equals = word.indexOf('=');
    const name = word.slice(2, equals === -1 ? undefined : equals);
    const kind = Object.hasOwn(known, name) ? known[name] : undefined;
    if (kind === undefined) refuse(`${command} takes no flag --${name}`);
    if (flags.has(name)) refuse(`--${name} is given twice`);
    if (kind === 'switch') {
      if (equals !== -1) refuse(`--${name} takes no value`);
      flags.set(name, '');
      continue;
    }
    const value = equals === -1 ? words[(index += 1)] : word.slice(equals + 1);
    if (value === undefined || value === '' || (equals === -1 && value.startsWith('--'))) {
      refuse(`--${name} needs a value`);
    }
    flags.set(name, value);
  }
  return { flags, positional };
}

function required(flags: Map<string, string>, command: string, name: string): string {
  return flags.get(name) ?? refuse(`${command} needs --${name}`);
}

/** `value` as a whole number from 1, written in digits. */
function wholeFromOne(flag: string, value: string): number {
  const n = Number(value);
  return /^\d+$/.test(value) && Number.isSafeInteger(n) && n >= 1
    ? n
    : refuse(`${flag} needs a whole number from 1; got "${value}"`);
}

function atMost(positional: readonly string[], count: number, command: string): void {
  if (positional.length > count) refuse(`${command} does not take "${positional[count] ?? ''}"`);
}

function parseView(positional: readonly string[]): View {
  const [view, id] = positional;
  switch (view) {
    case undefined:
      return { kind: 'summary' };
    case 'guilds':
    case 'pool':
    case 'patrons':
    case 'board':
      atMost(positional, 1, `show ${view}`);
      return { kind: view };
    case 'roster':
      atMost(positional, 2, 'show roster');
      return id === undefined ? { kind: 'roster' } : { kind: 'roster', guildId: id };
    case 'hero':
      atMost(positional, 2, 'show hero');
      return id === undefined ? refuse('show hero needs a Hero id') : { kind: 'hero', heroId: id };
    case 'history':
      atMost(positional, 2, 'show history');
      return id === undefined ? { kind: 'history' } : { kind: 'history', entityId: id };
    default:
      return refuse(`show has no view "${view}"`);
  }
}

/** The command `argv` names, or the problem with it. */
export function parseArgs(argv: readonly string[]): Parsed {
  try {
    return { ok: true, command: parse(argv) };
  } catch (error) {
    if (error instanceof Refusal) return { ok: false, problem: error.message };
    throw error;
  }
}

function parse(argv: readonly string[]): Command {
  const [name, ...words] = argv;
  if (name === undefined) refuse('No command given');
  if (name === '--help' || name === '-h') return { name: 'help' };
  if (!isCommandName(name)) refuse(`Unknown command "${name}"`);

  const { flags, positional } = split(name, words);
  const save = flags.get('save') ?? currentSave;
  switch (name) {
    case 'help':
      atMost(positional, 0, 'help');
      return { name };
    case 'new': {
      atMost(positional, 0, 'new');
      const seed = flags.get('seed');
      const background = flags.get('background');
      return {
        name,
        save,
        guild: required(flags, name, 'guild'),
        master: required(flags, name, 'master'),
        ...(seed === undefined ? {} : { seed }),
        ...(background === undefined ? {} : { background }),
        force: flags.has('force'),
      };
    }
    case 'show':
      return { name, save, view: parseView(positional) };
    case 'advance': {
      atMost(positional, 0, 'advance');
      const turns = flags.get('turns');
      return { name, save, turns: turns === undefined ? 1 : wholeFromOne('--turns', turns) };
    }
    case 'rebase':
      atMost(positional, 0, 'rebase');
      return { name, save };
    case 'save':
      atMost(positional, 0, 'save');
      return { name, save, as: required(flags, name, 'as') };
    case 'load': {
      atMost(positional, 1, 'load');
      const [file] = positional;
      return file === undefined ? refuse('load needs a file') : { name, save, file };
    }
  }
}
