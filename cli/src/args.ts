// The command line, `heroesim <command> [flags]`, parsed into a typed command or refused with a
// reason. Nothing here reads a save or the content: whether a Guild Background or an id exists
// is the command's to check, once the save and the content are open. Whether a word has the form
// of an id is checked here, by the engine's `isId`.

import {
  defaultConfig,
  descriptiveAttributeMaxLength as bounds,
  gearSlotKeys,
  guildmasterStatKeys,
  isId,
  sexes,
  type ConsumableRequest,
  type FacilityKey,
  type GearRef,
  type GuildId,
  type HeroId,
  type ItemDefinitionKey,
  type ItemId,
  type OfferId,
  type QuestId,
  type RankingMeasure,
  type Sex,
  type SlotKey,
  type StackId,
  type StopCondition,
} from '@heroesim/engine';
import { listed } from '@heroesim/words';
import { cliModules, isCliModule } from './modules.js';
import { currentSave } from './saves.js';

/** The Guildmaster Stats' keys, the rules' own, in words: `negotiation, inspiration, ... and judgement`. */
const statKeysWords = listed(Object.values(guildmasterStatKeys));

export const usage = `Usage: heroesim <command> [flags]

Commands:
  new --guild <name> --master <name> [--seed <seed>] [--background <key>] [--force]
      [--sex ${sexes.join('|')}] [--age <years>] [--traits <key,key,...> | --traits none]
      [--birthplace <text>] [--appearance <text>] [--biography <text>] [--portrait <key>]
      [--stats <stat=n,stat=n,...>]
      Create a world and make it the save. Without --seed a readable seed is made up.
      Without --background the Guild's Background is drawn from the seed. An existing
      save is replaced only with --force.
      The rest sets up the Guildmaster, and whatever is left out is drawn from the seed:
      their sex; their age, ${defaultConfig.guildmasterStartingAgeMin} to ${defaultConfig.guildmasterStartingAgeMax} (a Guildmaster retires at ${defaultConfig.guildmasterRetirementAge}); their Traits, by
      key, within the Trait budget (a buff costs points and a penalty refunds them, and
      two Traits that exclude each other cannot be held together), or none; and their
      Birthplace, Appearance and Biography, short texts no rule reads (at most ${bounds.birthplace}, ${bounds.appearance}
      and ${bounds.biography.toLocaleString('en-GB')} characters). --portrait names a Guildmaster picture by its key, of the
      sex given, or making the Guildmaster of its sex, whatever it fits; without --age,
      their age is drawn within the picture's. Left out, one is chosen to fit them, and
      where none fits the Guildmaster shows its Silhouette. --stats sets every
      Guildmaster Stat or none, by key, as inspiration=12,influence=8,...: each ${defaultConfig.guildmasterStatMin} to
      ${defaultConfig.guildmasterStatMax}, sharing ${defaultConfig.guildmasterStatPoints} Stat points in all, and any left over are lost. The keys
      are ${statKeysWords}.
  show [guilds | roster [guildId] | hall [guildId] | pool | patrons | board
        | rankings [--by fame|wealth] | hero <heroId> | guildmaster [guildId] | market
        | offers | history [entityId]]
      Print the save: with no view, the Turn, the Guilds and counts, the player's Hall,
      and its wages and the Hall's upkeep with the night each is next paid; roster shows the
      player's Guild unless given another, each Hero's Morale and Fatigue and who its
      Captain is; hall shows the player's Guild unless given another too, each
      facility's grade and upkeep, and what the next grade costs and its upkeep;
      pool marks the Heroes who will not yet sign for the player's Guild's Fame;
      patrons shows each Patron's Regard for the player's Guild; board shows the Quests
      on offer, each with its Tier and whether it is Deadly, each Encounter's Checks and
      what they read, and the best Party of your rested Heroes, those free at home whom
      your rest band does not keep there, with its chance; rankings orders the Guilds in play
      by Fame, or by Wealth with --by wealth; guildmaster shows the player's
      Guildmaster, or another Guild's, with their Stats, Traits and Regard; market shows
      what the Market has for sale and at what price, and what the player's Guild holds
      and what each would sell for; offers shows the Transfer Offers Rivals have made
      for the player's Heroes; history shows the whole History unless given an id.
  advance [--turns <n>]
      Play the next n Turns, 1 unless given, and print what happened. Time moves only
      here; every other command acts within the current Turn. Stops early if the game ends
      or an installed module asks to stop.
  advance --until <stops> [--max <n>]      or      advance --max <n>
      Fast forward: play Turns until one gives a reason to stop, then print the reason and
      what happened. These always stop it: the player's Guild falls below the
      Bankruptcy floor, a Party of the player's comes home, a decision is needed (no Party
      is out, and a Quest the Guild's rested Heroes could take reaches the Board), a
      Rival makes a Transfer Offer for one of the player's Heroes, an installed module
      asks to stop, and the game ends.
      <stops> names any of party-returns, decision, staffable, transfer-offer,
      below-floor, ended and pool-refreshed, joined by commas. Two stop it only when named:
      staffable (a Quest the rested Heroes at home could take reaches the Board, even
      with a Party out) and pool-refreshed (new Heroes in the Unattached pool). --max
      caps the Turns played: one year of Turns unless given.
  recruit --hero <heroId>
      Sign an Unattached Hero to the player's Guild for their signing fee, shown by
      show pool, and print the fee and the new Roster size.
  preview --quest <questId> --heroes <heroId,heroId,...> [--consumables <key:n,...>]
      Say what a Party of the player's Heroes would meet on a Quest from the Board before it
      is sent: the Quest's Beats, its narrative in the order it plays them; each
      requirement met or missed, the least Party among them; any Hero who cannot go;
      the Synergies it would have and on how many of the Quest's Encounters, what its
      Morale does to the odds, each Hero's Fatigue and the Captain among them, what
      would relieve the hurt (a Healer in the Party, a heal Item carried), its chances
      of each Encounter and of the Quest if no one falls, the consumables it would
      carry, the reward the Guildmaster would agree, and whether dispatch would send
      it. Changes nothing.
  dispatch --quest <questId> --heroes <heroId,heroId,...> [--consumables <key:n,...>]
      Send a Party of the player's Heroes on a Quest from the Board, within the current
      Turn, and print the Party, the reward agreed and the Day it returns. With
      --consumables the Party carries n of each consumable key from the Guild's holding;
      what it does not use comes home with it. Rivals take Quests from the Board each
      afternoon.
  build --facility <key>
      Raise a Facility of the player's Guild's Hall by one grade, for the next grade's
      cost, and print what was built, the Wealth left, the wages and the Hall's upkeep
      after it, each with its Days, and what the next grade costs. The key is the
      Facility's in content: infirmary, training-yard or quarters in the core.
  captain --hero <heroId>
      Name one of the player's Heroes, at home or away, the Guild's Captain. To an empty
      post it is free; in another Captain's place, the one replaced loses Morale and the
      post is locked for a time. A post left by a Death, a Retirement or a Transfer is
      empty again.
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
  transfer --hero <heroId> --to <guildId>      or      transfer --hero <heroId> --in
      Transfer a Hero for a fee, twice their signing fee at the buying Guildmaster's
      Negotiation. --to sends one of the player's Heroes to another Guild, which pays; --in
      takes a Hero from another Guild's Roster, and the player's Guild pays the fee show
      roster <guildId> and show hero <heroId> give for them. The other Guild
      must be willing, by its Disposition's appetite for Transfers, its Roster and, to buy,
      its Wealth. The Hero must be at the Hall; their gear stays with the Guild they leave,
      and the Heroes left behind who held them in high Regard lose Morale.
  accept --offer <offerId>      decline --offer <offerId>
      Answer a Transfer Offer a Rival made for one of the player's Heroes, listed by show
      offers: accept transfers the Hero for the fee offered; decline refuses it. An offer
      not answered expires on the night show offers gives.
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

new, load and advance take --modules <ids>, modules to install, joined by commas: none unless
given. The only one is ${Object.keys(cliModules).join(', ')}, which tests the module contract. A save
made with a module keeps its part for it; a command run without the module warns of that part and
leaves it as it is.
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
  | { kind: 'offers' }
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
      modules?: string[];
      /** The Guildmaster's setup (M9-S2): whatever is absent is drawn. */
      sex?: Sex;
      age?: number;
      /** Trait keys as given, `[]` for `--traits none`; whether they keep the rules is the engine's to say. */
      traits?: string[];
      birthplace?: string;
      appearance?: string;
      biography?: string;
      /** The Portrait's key (v1.1.2-S3); whether content has it, and of which sex, is the engine's to say. */
      portrait?: string;
      /**
       * The Guildmaster's Stats by key (v1.1.4-S11, DL-149 item 9), each a whole number as given; which
       * keys content has, whether every one is given, the range and the points are `new`'s and the
       * engine's to say.
       */
      stats?: Record<string, number>;
    }
  | { name: 'show'; save: string; view: View }
  | { name: 'advance'; save: string; turns: number; modules?: string[] }
  | { name: 'advance'; save: string; until: StopCondition[]; max?: number; modules?: string[] }
  | { name: 'recruit'; save: string; hero: string }
  | { name: 'preview'; save: string; quest: QuestId; heroes: HeroId[]; consumables?: ConsumableRequest[] }
  | { name: 'dispatch'; save: string; quest: QuestId; heroes: HeroId[]; consumables?: ConsumableRequest[] }
  | { name: 'build'; save: string; facility: FacilityKey }
  | { name: 'captain'; save: string; hero: HeroId }
  | { name: 'equip'; save: string; hero: HeroId; gear: GearRef }
  | { name: 'unequip'; save: string; hero: HeroId; slot: SlotKey }
  | { name: 'buy'; save: string; item: ItemDefinitionKey; quantity: number }
  | { name: 'sell'; save: string; stack: StackId; quantity: number }
  | { name: 'sell'; save: string; item: ItemId }
  | { name: 'transfer'; save: string; hero: HeroId; to: GuildId }
  | { name: 'transfer'; save: string; hero: HeroId; in: true }
  | { name: 'accept'; save: string; offer: OfferId }
  | { name: 'decline'; save: string; offer: OfferId }
  | { name: 'rebase'; save: string }
  | { name: 'save'; save: string; as: string }
  | { name: 'load'; save: string; file: string; modules?: string[] };

export type Parsed = { ok: true; command: Command } | { ok: false; problem: string };

/** The flags each command takes, and whether each takes a value. */
const flagsOf: Record<Command['name'], Record<string, 'value' | 'switch'>> = {
  help: {},
  new: {
    save: 'value',
    seed: 'value',
    guild: 'value',
    master: 'value',
    background: 'value',
    force: 'switch',
    modules: 'value',
    sex: 'value',
    age: 'value',
    traits: 'value',
    birthplace: 'value',
    appearance: 'value',
    biography: 'value',
    portrait: 'value',
    stats: 'value',
  },
  show: { save: 'value', by: 'value' },
  advance: { save: 'value', turns: 'value', until: 'value', max: 'value', modules: 'value' },
  recruit: { save: 'value', hero: 'value' },
  preview: { save: 'value', quest: 'value', heroes: 'value', consumables: 'value' },
  dispatch: { save: 'value', quest: 'value', heroes: 'value', consumables: 'value' },
  build: { save: 'value', facility: 'value' },
  captain: { save: 'value', hero: 'value' },
  equip: { save: 'value', hero: 'value', item: 'value', stack: 'value' },
  unequip: { save: 'value', hero: 'value', slot: 'value' },
  buy: { save: 'value', item: 'value', quantity: 'value' },
  sell: { save: 'value', stack: 'value', item: 'value', quantity: 'value' },
  transfer: { save: 'value', hero: 'value', to: 'value', in: 'switch' },
  accept: { save: 'value', offer: 'value' },
  decline: { save: 'value', offer: 'value' },
  rebase: { save: 'value' },
  save: { save: 'value', as: 'value' },
  load: { save: 'value', modules: 'value' },
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
  // M9-S1: a Quest the Heroes at home can staff (opt-in), and the Bankruptcy floor (always on).
  staffable: 'quest-staffable',
  'transfer-offer': 'transfer-offer',
  'below-floor': 'below-floor',
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

/**
 * `--modules` (M8-S4): the ids of modules the CLI may install, joined by commas, each once, in the
 * order their hooks are to run.
 */
function moduleList(value: string): string[] {
  const ids = value.split(',').map((id) => id.trim());
  for (const id of ids) {
    if (!isCliModule(id)) refuse(`--modules takes ${Object.keys(cliModules).join(', ')}, joined by commas; got "${id}"`);
  }
  const twice = ids.find((id, index) => ids.indexOf(id) !== index);
  if (twice !== undefined) refuse(`--modules names ${twice} twice`);
  return ids;
}

/** `{ modules }` when `--modules` is given, else nothing: a command without it reads as before M8. */
function modulesFlag(flags: Map<string, string>): { modules?: string[] } {
  const modules = flags.get('modules');
  return modules === undefined ? {} : { modules: moduleList(modules) };
}

/** `--sex` (M9-S2): one of the engine's `sexes`, those a person is generated with. */
function sexFlag(value: string): Sex {
  return sexes.find((sex) => sex === value) ?? refuse(`--sex takes ${sexes.join(' or ')}; got "${value}"`);
}

/** `--age` (M9-S2): a whole number of years, in digits; whether it is in range is the engine's to say. */
function ageFlag(value: string): number {
  const n = Number(value);
  return /^\d+$/.test(value) && Number.isSafeInteger(n) ? n : refuse(`--age needs a whole number of years; got "${value}"`);
}

/**
 * `--traits` (M9-S2): Trait keys joined by commas, in the order given, or `none` for no Trait. Each
 * word has a key's form; which keys the content has, a repeat, and the budget are the engine's to
 * say (`setupRefusal`), in its own words.
 */
function traitList(value: string): string[] {
  if (value.trim() === 'none') return [];
  const keys = value.split(',').map((word) => word.trim());
  for (const key of keys) {
    if (!/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/.test(key) || key === 'none') {
      refuse(`--traits needs Trait keys such as old-soldier, joined by commas, or none; got "${key}"`);
    }
  }
  return keys;
}

/**
 * `--stats` (v1.1.4-S11, DL-149 item 9): `key=value` pairs joined by commas, each key in a key's form and
 * named once, each value a whole number in digits. Which keys content has, whether every Guildmaster
 * Stat is given, each one's range and the points are for `new` and the engine to say.
 */
function statList(value: string): Record<string, number> {
  const stats: Record<string, number> = {};
  for (const pair of value.split(',').map((word) => word.trim())) {
    const [, key = '', digits = ''] = /^([a-z][a-z0-9]*(?:-[a-z0-9]+)*)=(\d+)$/.exec(pair) ?? [];
    const n = Number(digits);
    if (key === '' || !Number.isSafeInteger(n)) {
      refuse(`--stats needs each Guildmaster Stat as key=number, such as inspiration=12, joined by commas; got "${pair}"`);
    }
    if (Object.hasOwn(stats, key)) refuse(`--stats names ${key} twice`);
    stats[key] = n;
  }
  return stats;
}

/** The Guildmaster's setup flags `new` was given (M9-S2), as the command's fields. */
function guildmasterFlags(flags: Map<string, string>): Partial<Extract<Command, { name: 'new' }>> {
  const sex = flags.get('sex');
  const age = flags.get('age');
  const traits = flags.get('traits');
  const portrait = flags.get('portrait');
  const stats = flags.get('stats');
  const texts = (['birthplace', 'appearance', 'biography'] as const).flatMap((flag) => {
    const text = flags.get(flag);
    return text === undefined ? [] : [[flag, text]];
  });
  return {
    ...(sex === undefined ? {} : { sex: sexFlag(sex) }),
    ...(age === undefined ? {} : { age: ageFlag(age) }),
    ...(traits === undefined ? {} : { traits: traitList(traits) }),
    // Any value: whether content lists it, and of which sex, is the engine's to say (`setupRefusal`, v1.1.2-S6).
    ...(portrait === undefined ? {} : { portrait }),
    ...(stats === undefined ? {} : { stats: statList(stats) }),
    ...Object.fromEntries(texts),
  };
}

/**
 * `--facility`: a Facility's key, the CLI's word for it (DL-297). The word has a key's form; whether
 * content has the Facility is `build`'s to say, once the save and its content are open.
 */
function facility(value: string): FacilityKey {
  return /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/.test(value) ? value : refuse(`--facility needs a Facility's key such as training-yard; got "${value}"`);
}

/** `--hero` for `equip`, `unequip` and `transfer`: one Hero id (M5-S2). */
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
    case 'offers':
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
        ...modulesFlag(flags),
        ...guildmasterFlags(flags),
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
        return { name, save, turns: turns === undefined ? 1 : wholeFromOne('--turns', turns), ...modulesFlag(flags) };
      }
      if (turns !== undefined) refuse('advance takes --turns, or --until and --max, not both');
      return {
        name,
        save,
        until: until === undefined ? [] : stopList(until),
        ...(max === undefined ? {} : { max: wholeFromOne('--max', max) }),
        ...modulesFlag(flags),
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
    case 'captain':
      atMost(positional, 0, 'captain');
      return { name, save, hero: heroId(required(flags, name, 'hero')) };
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
    case 'transfer': {
      atMost(positional, 0, 'transfer');
      const hero = heroId(required(flags, name, 'hero'));
      const to = flags.get('to');
      if ((to === undefined) === !flags.has('in')) refuse('transfer takes --to <guildId> or --in, and one of them only');
      if (to === undefined) return { name, save, hero, in: true };
      return isId('guilds', to) ? { name, save, hero, to } : refuse(`--to needs a Guild id such as guild-000002; got "${to}"`);
    }
    case 'accept':
    case 'decline': {
      atMost(positional, 0, name);
      const offer = required(flags, name, 'offer');
      return isId('offers', offer) ? { name, save, offer } : refuse(`--offer needs an offer id such as offer-000001; got "${offer}"`);
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
      return file === undefined ? refuse('load needs a file') : { name, save, file, ...modulesFlag(flags) };
    }
  }
}
