// The command line, `heroesim <command> [flags]`, parsed into a typed command or refused with a
// reason. Nothing here reads a save or the content: whether a Guild Background or an id exists
// is the command's to check, once the save and the content are open. Whether a word has the form
// of an id is checked here, by the engine's `isId`.

import { isId, type HeroId, type QuestId, type StopCondition } from '@heroesim/engine';
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
  advance --until <stops> [--max <n>]      or      advance --max <n>
      Fast forward: play Turns until one gives a reason to stop, then print the reason and
      what happened. These always stop it: a Party of the player's comes home, a decision
      is needed (no Party is out, and a Quest the Guild could take reaches the Board), and
      the game ends. <stops> names any of party-returns, decision, ended and
      pool-refreshed, joined by commas; pool-refreshed (new Heroes in the Unattached pool)
      stops it only when named. --max caps the Turns played: one year of Turns unless
      given.
  recruit --hero <heroId>
      Sign an Unattached Hero to the player's Guild for their signing fee, shown by
      show pool, and print the fee and the new Roster size.
  dispatch --quest <questId> --heroes <heroId,heroId,...>
      Send a Party of the player's Heroes on a Quest from the Board, within the current
      Turn, and print the Party and the Day it returns. Rivals take Quests from the Board
      each afternoon.
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
  | { name: 'advance'; save: string; until: StopCondition[]; max?: number }
  | { name: 'recruit'; save: string; hero: string }
  | { name: 'dispatch'; save: string; quest: QuestId; heroes: HeroId[] }
  | { name: 'rebase'; save: string }
  | { name: 'save'; save: string; as: string }
  | { name: 'load'; save: string; file: string };

export type Parsed = { ok: true; command: Command } | { ok: false; problem: string };

/** The flags each command takes, and whether each takes a value. */
const flagsOf: Record<Command['name'], Record<string, 'value' | 'switch'>> = {
  help: {},
  new: { save: 'value', seed: 'value', guild: 'value', master: 'value', background: 'value', force: 'switch' },
  show: { save: 'value' },
  advance: { save: 'value', turns: 'value', until: 'value', max: 'value' },
  recruit: { save: 'value', hero: 'value' },
  dispatch: { save: 'value', quest: 'value', heroes: 'value' },
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

/** The words `--until` takes, and the engine's stop condition each names (DL-33). */
const untilWords: Readonly<Record<string, StopCondition>> = Object.freeze({
  'party-returns': 'party-returned',
  decision: 'decision-needed',
  ended: 'ended',
  'pool-refreshed': 'pool-refreshed',
});

/** `--until`: stop conditions by the CLI's words, joined by commas, each once. */
function stopList(value: string): StopCondition[] {
  const words = value.split(',').map((word) => word.trim());
  for (const word of words) {
    if (!Object.hasOwn(untilWords, word)) {
      refuse(`--until takes ${Object.keys(untilWords).join(', ')}, joined by commas; got "${word}"`);
    }
  }
  const twice = words.find((word, index) => words.indexOf(word) !== index);
  if (twice !== undefined) refuse(`--until names ${twice} twice`);
  return words.map((word) => untilWords[word] as StopCondition);
}

/** `--heroes`: Hero ids joined by commas, each once. */
function heroList(value: string): HeroId[] {
  const heroes = value.split(',').map((word) => word.trim());
  for (const word of heroes) {
    if (!isId('heroes', word)) refuse(`--heroes needs Hero ids such as hero-000001, joined by commas; got "${word}"`);
  }
  const twice = heroes.find((word, index) => heroes.indexOf(word) !== index);
  if (twice !== undefined) refuse(`--heroes names ${twice} twice`);
  return heroes as HeroId[];
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
      const until = flags.get('until');
      const max = flags.get('max');
      if (until === undefined && max === undefined) {
        return { name, save, turns: turns === undefined ? 1 : wholeFromOne('--turns', turns) };
      }
      if (turns !== undefined) refuse('advance takes --turns, or --until and --max, not both');
      return {
        name,
        save,
        until: until === undefined ? [] : stopList(until),
        ...(max === undefined ? {} : { max: wholeFromOne('--max', max) }),
      };
    }
    case 'recruit':
      atMost(positional, 0, 'recruit');
      return { name, save, hero: required(flags, name, 'hero') };
    case 'dispatch': {
      atMost(positional, 0, 'dispatch');
      const quest = required(flags, name, 'quest');
      if (!isId('quests', quest)) refuse(`--quest needs a Quest id such as quest-000001; got "${quest}"`);
      return { name, save, quest, heroes: heroList(required(flags, name, 'heroes')) };
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
