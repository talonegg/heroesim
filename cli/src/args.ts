// The command line, `heroesim <command> [flags]`, parsed into a typed command or refused with a
// reason. Nothing here reads a save or the content: whether a Guild Background or an id exists
// is the command's to check, once the save and the content are open. Whether a word has the form
// of an id is checked here, by the engine's `isId`.

import {
  gearSlotKeys,
  isId,
  type ConsumableRequest,
  type FacilityKey,
  type GearRef,
  type HeroId,
  type ItemDefinitionKey,
  type ItemId,
  type QuestId,
  type RankingMeasure,
  type SlotKey,
  type StackId,
  type StopCondition,
} from '@heroesim/engine';
import { currentSave } from './saves.js';

export const usage = `Usage: heroesim <command> [flags]

Commands:
  new --guild <name> --master <name> [--seed <seed>] [--background <key>] [--force]
      Create a world and make it the save. Without --seed a readable seed is made up.
      Without --background the Guild's Background is drawn from the seed. An existing
      save is replaced only with --force.
  show [guilds | roster [guildId] | hall [guildId] | pool | patrons | board
        | rankings [--by fame|wealth] | hero <heroId> | guildmaster [guildId] | market
        | history [entityId]]
      Print the save: with no view, the Turn, the Guilds and counts; roster shows the
      player's Guild unless given another, and so does hall, each facility's grade and
      what the next grade costs; pool marks the Heroes who will not yet sign for the
      player's Guild's Fame; patrons shows each Patron's Regard for the player's Guild;
      board shows the Quests on offer; rankings orders the Guilds in play by Fame, or by
      Wealth with --by wealth; guildmaster shows the player's Guildmaster, or another
      Guild's, with their Stats, Traits and Regard; market shows what the Market has for
      sale and at what price, and what the player's Guild holds and what each would sell
      for; history shows the whole History unless given an id.
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
  preview --quest <questId> --heroes <heroId,heroId,...> [--consumables <key:n,...>]
      Say what a Party of the player's Heroes would meet on a Quest from the Board before it
      is sent: each requirement met or missed, any Hero who cannot go, the Synergies it
      would have and on how many of the Quest's Encounters, the consumables it would
      carry, the reward the Guildmaster would agree, and whether dispatch would send it.
      Changes nothing.
  dispatch --quest <questId> --heroes <heroId,heroId,...> [--consumables <key:n,...>]
      Send a Party of the player's Heroes on a Quest from the Board, within the current
      Turn, and print the Party, the reward agreed and the Day it returns. With
      --consumables the Party carries n of each consumable key from the Guild's holding;
      what it does not use comes home with it. Rivals take Quests from the Board each
      afternoon.
  build --facility <infirmary | training-yard | quarters>
      Raise a facility of the player's Guild's Hall by one grade, for the next grade's
      cost, and print what was built, the Wealth left and what the next grade costs.
  equip --hero <heroId> (--item <itemId> | --stack <stackId>)
      Put gear the player's Guild holds, listed with its ids by show roster, into its slot
      on one of the Guild's Heroes: a unique Item by --item, or one from a stack by --stack.
      The slot must be empty. Prints the Hero's effective Stats the gear changed.
  unequip --hero <heroId> --slot <weapon | armour | trinket>
      Take the gear in a slot of one of the player's Heroes back into the Guild's holding.
  buy --item <key> [--quantity <n>]
      Buy n of an Item the Market has for sale, 1 unless given, named by the key show
      market lists, for its price each, and print the cost and the Wealth left.
  sell --stack <stackId> [--quantity <n>]      or      sell --item <itemId>
      Sell n Items of a stack the player's Guild holds, 1 unless given, or one of its unique
      Items, to the Market for what show market says each sells for. An Item a Hero carries
      is unequipped first. The Market's stock is drawn afresh each morning.
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
  | { kind: 'hall'; guildId?: string }
  | { kind: 'pool' }
  | { kind: 'patrons' }
  | { kind: 'board' }
  | { kind: 'rankings'; by: RankingMeasure }
  | { kind: 'hero'; heroId: string }
  | { kind: 'guildmaster'; guildId?: string }
  | { kind: 'market' }
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
  | { name: 'preview'; save: string; quest: QuestId; heroes: HeroId[]; consumables?: ConsumableRequest[] }
  | { name: 'dispatch'; save: string; quest: QuestId; heroes: HeroId[]; consumables?: ConsumableRequest[] }
  | { name: 'build'; save: string; facility: FacilityKey }
  | { name: 'equip'; save: string; hero: HeroId; gear: GearRef }
  | { name: 'unequip'; save: string; hero: HeroId; slot: SlotKey }
  | { name: 'buy'; save: string; item: ItemDefinitionKey; quantity: number }
  | { name: 'sell'; save: string; stack: StackId; quantity: number }
  | { name: 'sell'; save: string; item: ItemId }
  | { name: 'rebase'; save: string }
  | { name: 'save'; save: string; as: string }
  | { name: 'load'; save: string; file: string };

export type Parsed = { ok: true; command: Command } | { ok: false; problem: string };

/** The flags each command takes, and whether each takes a value. */
const flagsOf: Record<Command['name'], Record<string, 'value' | 'switch'>> = {
  help: {},
  new: { save: 'value', seed: 'value', guild: 'value', master: 'value', background: 'value', force: 'switch' },
  show: { save: 'value', by: 'value' },
  advance: { save: 'value', turns: 'value', until: 'value', max: 'value' },
  recruit: { save: 'value', hero: 'value' },
  preview: { save: 'value', quest: 'value', heroes: 'value', consumables: 'value' },
  dispatch: { save: 'value', quest: 'value', heroes: 'value', consumables: 'value' },
  build: { save: 'value', facility: 'value' },
  equip: { save: 'value', hero: 'value', item: 'value', stack: 'value' },
  unequip: { save: 'value', hero: 'value', slot: 'value' },
  buy: { save: 'value', item: 'value', quantity: 'value' },
  sell: { save: 'value', stack: 'value', item: 'value', quantity: 'value' },
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

/** The words `--facility` takes, and the Hall facility each names (M3-S6). */
const facilityWords: Readonly<Record<string, FacilityKey>> = Object.freeze({
  infirmary: 'infirmary',
  'training-yard': 'trainingYard',
  quarters: 'quarters',
});

/** `--facility`: one of the Hall's facilities, in the CLI's words. */
function facility(value: string): FacilityKey {
  if (!Object.hasOwn(facilityWords, value)) {
    refuse(`--facility takes ${Object.keys(facilityWords).join(', ')}; got "${value}"`);
  }
  return facilityWords[value] as FacilityKey;
}

/** `--hero` for `equip` and `unequip`: one Hero id (M5-S2). */
function heroId(value: string): HeroId {
  return isId('heroes', value) ? value : refuse(`--hero needs a Hero id such as hero-000001; got "${value}"`);
}

/** `--slot`: one of the gear slots (M5-S2). */
function slotKey(value: string): SlotKey {
  const slots: readonly string[] = gearSlotKeys;
  return slots.includes(value) ? (value as SlotKey) : refuse(`--slot takes ${gearSlotKeys.join(', ')}; got "${value}"`);
}

/** `equip`'s gear: a unique Item by `--item`, or a stack by `--stack`, and one of them only (M5-S2). */
function gearRef(flags: Map<string, string>): GearRef {
  const item = flags.get('item');
  const stack = flags.get('stack');
  if ((item === undefined) === (stack === undefined)) refuse('equip needs --item or --stack, and one of them only');
  if (item !== undefined) {
    return isId('items', item) ? { itemId: item } : refuse(`--item needs an Item id such as item-000001; got "${item}"`);
  }
  const id = stack ?? '';
  return isId('stacks', id) ? { stackId: id } : refuse(`--stack needs a stack id such as stack-000001; got "${id}"`);
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

/**
 * `--consumables` (M5-S3): a consumable's key and how many, `key:n`, joined by commas, each key
 * once. Whether the key names a consumable the Guild holds is `dispatch`'s to say.
 */
function consumableList(value: string): ConsumableRequest[] {
  const pairs = value.split(',').map((word) => word.trim());
  const requests = pairs.map((word): ConsumableRequest => {
    const match = /^([a-z0-9]+(?:-[a-z0-9]+)*):(\d+)$/.exec(word);
    if (match?.[1] === undefined || match[2] === undefined) {
      refuse(`--consumables needs key:n pairs such as healing-draught:2, joined by commas; got "${word}"`);
    }
    return { definitionKey: match[1], quantity: wholeFromOne(`--consumables ${match[1]}`, match[2]) };
  });
  const keys = requests.map((request) => request.definitionKey);
  const twice = keys.find((key, index) => keys.indexOf(key) !== index);
  if (twice !== undefined) refuse(`--consumables names ${twice} twice`);
  return requests;
}

function atMost(positional: readonly string[], count: number, command: string): void {
  if (positional.length > count) refuse(`${command} does not take "${positional[count] ?? ''}"`);
}

/** The words `--by` takes: the measures the Rankings order by (M3-S5). */
const rankingMeasures: Readonly<Record<RankingMeasure, true>> = Object.freeze({ fame: true, wealth: true });

/** `show rankings --by`: `fame` unless given. */
function rankingMeasure(by: string | undefined): RankingMeasure {
  if (by === undefined) return 'fame';
  if (!Object.hasOwn(rankingMeasures, by)) {
    refuse(`--by takes ${Object.keys(rankingMeasures).join(' or ')}; got "${by}"`);
  }
  return by as RankingMeasure;
}

function parseView(positional: readonly string[], by: string | undefined): View {
  const [view, id] = positional;
  if (by !== undefined && view !== 'rankings') refuse('--by is taken by show rankings alone');
  switch (view) {
    case undefined:
      return { kind: 'summary' };
    case 'guilds':
    case 'pool':
    case 'patrons':
    case 'board':
    case 'market':
      atMost(positional, 1, `show ${view}`);
      return { kind: view };
    case 'roster':
      atMost(positional, 2, 'show roster');
      return id === undefined ? { kind: 'roster' } : { kind: 'roster', guildId: id };
    case 'hall':
      atMost(positional, 2, 'show hall');
      return id === undefined ? { kind: 'hall' } : { kind: 'hall', guildId: id };
    case 'rankings':
      atMost(positional, 1, 'show rankings');
      return { kind: 'rankings', by: rankingMeasure(by) };
    case 'hero':
      atMost(positional, 2, 'show hero');
      return id === undefined ? refuse('show hero needs a Hero id') : { kind: 'hero', heroId: id };
    case 'guildmaster':
      atMost(positional, 2, 'show guildmaster');
      return id === undefined ? { kind: 'guildmaster' } : { kind: 'guildmaster', guildId: id };
    case 'history':
      atMost(positional, 2, 'show history');
      return id === undefined ? { kind: 'history' } : { kind: 'history', entityId: id };
    default:
      return refuse(`show has no view "${view}"`);
  }
}

/** `sell`: `--stack` with an optional `--quantity`, or `--item`, never both (M5-S4). */
function sale(save: string, flags: Map<string, string>): Extract<Command, { name: 'sell' }> {
  const stack = flags.get('stack');
  const item = flags.get('item');
  const quantity = flags.get('quantity');
  if (stack !== undefined && item !== undefined) refuse('sell takes --stack or --item, not both');
  if (item !== undefined) {
    if (quantity !== undefined) refuse('sell --item sells one unique Item; --quantity goes with --stack');
    if (!isId('items', item)) refuse(`--item needs a unique Item's id such as item-000001; got "${item}"`);
    return { name: 'sell', save, item };
  }
  if (stack === undefined) refuse('sell needs --stack or --item');
  if (!isId('stacks', stack)) refuse(`--stack needs a stack id such as stack-000001; got "${stack}"`);
  return { name: 'sell', save, stack, quantity: quantity === undefined ? 1 : wholeFromOne('--quantity', quantity) };
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
      return { name, save, view: parseView(positional, flags.get('by')) };
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
    case 'preview':
    case 'dispatch': {
      atMost(positional, 0, name);
      const quest = required(flags, name, 'quest');
      if (!isId('quests', quest)) refuse(`--quest needs a Quest id such as quest-000001; got "${quest}"`);
      const consumables = flags.get('consumables');
      return {
        name,
        save,
        quest,
        heroes: heroList(required(flags, name, 'heroes')),
        ...(consumables === undefined ? {} : { consumables: consumableList(consumables) }),
      };
    }
    case 'build':
      atMost(positional, 0, 'build');
      return { name, save, facility: facility(required(flags, name, 'facility')) };
    case 'equip':
      atMost(positional, 0, 'equip');
      return { name, save, hero: heroId(required(flags, name, 'hero')), gear: gearRef(flags) };
    case 'unequip':
      atMost(positional, 0, 'unequip');
      return { name, save, hero: heroId(required(flags, name, 'hero')), slot: slotKey(required(flags, name, 'slot')) };
    case 'buy': {
      atMost(positional, 0, 'buy');
      const quantity = flags.get('quantity');
      const item = required(flags, name, 'item');
      return { name, save, item, quantity: quantity === undefined ? 1 : wholeFromOne('--quantity', quantity) };
    }
    case 'sell':
      atMost(positional, 0, 'sell');
      return sale(save, flags);
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
