// What the views read (DL-66): each function takes the game in hand and returns plain rows
// of words and numbers for a component to lay out. Nothing in `web/` computes a rule (ADR-0007,
// principle 12), so every number here is a document field or the answer of an engine selector
// (`rankingPlaces`, `bankruptcyCountdown`, `statBreakdown`, `carriedGear`, `previewDispatch`,
// `skillsThatHelp`); where a view needed an answer no selector gave, the selector went
// into the engine (`previewDispatch`, `skillsThatHelp`, `dispatchRefusal`, `rankingPlaces`,
// `bankruptcyCountdown`), never here.
//
// Each reads the document through the player's reading (`reading.ts`, DL-241), derived once for it.
// A Hero, a Roster's rows and the Board are the readings of `@heroesim/words` that the CLI's `show`
// lays out too, laid out here for the page, which adds what is its own: a Class's mark, where a Hero
// is, the actions and the Milestones.
//
// Potential is never in a view (data-model rule 9, M3-S3): a Hero's page carries each Stat's hint,
// the word `potentialHint` gives through the bands the player's Guildmaster reads, and no row type
// here has a field that could hold the number.
//
// Components may import this module; it and the rest of `state/` alone import the engine's values.

import {
  ageOf,
  bankruptcyCountdown,
  carriedGear,
  classComparator,
  compareByCodeUnit,
  dayOf,
  defaultConfig,
  descriptiveAttributeLabels,
  descriptiveAttributeMaxLength,
  descriptiveAttributes,
  guildmasterOf,
  guildmasterTraitCost,
  guildmasterTraitsOf,
  holdings,
  itemDefinition,
  previewDispatch,
  rankingPlaces,
  sexes,
  skillsThatHelp,
  statBreakdown,
  statsRead,
  timeOfDay,
  transferFee,
  type ConsumableRequest,
  type ContentSet,
  type DescriptiveAttribute,
  type EngineEventOf,
  type TurnEvent,
  type Entry,
  type GameConfig,
  type Guild,
  type GuildId,
  type Hero,
  type HeroId,
  type ItemDefinitionKey,
  type ItemId,
  type FatigueBand,
  type MoraleBand,
  type PotentialHint,
  type QuestEstimate,
  type QuestId,
  type RegardBand,
  type Sex,
  type SlotKey,
  type StatKey,
  type StackId,
  type StopCondition,
  type StopReason,
  type Synergy,
  type TimeOfDay,
  type TraitKey,
  type Unavailability,
  type World,
  type WorldDocument,
} from '@heroesim/engine';
import {
  atHallWords,
  bestPartyReading,
  boardReading,
  captainPost,
  capitalised,
  chanceWords,
  dateOfDay,
  dateOfTurn,
  consumableEffectWords,
  endedSentence,
  fatigueBandNames,
  formEffectWords,
  heroReading,
  heroSkills,
  heroTraits,
  kindWords,
  listed,
  modifierWords,
  moraleBandNames,
  nameIn,
  namingWords,
  nightOfDay,
  nightOfTurn,
  partyFloorWords,
  questClosed,
  readsAsOne,
  reliefWords,
  rosterReading,
  rowOf,
  shownPercent,
  signed,
  signsWords,
  statPartsWords,
  statSourcesMoving,
  tierWords,
  traitEffectWords,
  unavailableChipWords,
  unavailableWords,
  whenOfTurn,
  type EncounterReading,
  type HeroReading,
} from '@heroesim/words';
import { availabilityOf } from './availability';
import { content } from '../content';
import { narrateText, questNamer, rejectionSentence, sentenceWords, type Narration } from './namer';
import type { Facets } from './facets';
import { newestEntries } from './history-reader';
import { classMarkOf, type ClassMarked, placeWords, transferCostWords } from './names';
import { readingOf, type PageReading } from './reading';
import type { GameState } from './reducer';
import { stopText } from './stops';

// ── The header ───────────────────────────────────────────────────────────────────────────────

export interface HeaderView {
  /** The player's Guild, whose Banner stands beside its name (DL-125 item 7). */
  guildId: GuildId;
  guildName: string;
  /** The player's Guildmaster's name, the navigation's label for the Guildmaster view (M9-F2); `null` with none. */
  guildmasterName: string | null;
  wealth: number;
  fame: number;
  /** `Year 1 Day 2, afternoon`: the date and the time of day, the Year shown at every width (DL-206 item 32, DL-210). */
  time: string;
  /** The time of day alone, for the status bar's sun or moon (M9-S3, DL-103). */
  timeOfDay: TimeOfDay;
  /**
   * `3rd of 5 by Fame`, `Joint 1st of 5 by Fame` for a place Guilds share (`rankingPlaces`,
   * DL-95), or that the Guild has folded and is not ranked.
   */
  rankings: string;
  /**
   * `rankings` in two parts, `Joint 1st of 5` and `by Fame`, the second empty for a folded Guild: a
   * phone's status bar shows the first (M9-S3, DL-103).
   */
  place: string;
  measure: string;
  /** The seed the world was made from: a game is reproducible from it (N1). */
  seed: string;
  /** The Bankruptcy countdown while the Guild is below the floor (`countdownView`); `null` otherwise. */
  countdown: string | null;
  /**
   * The same countdown in a few words for the status bar's pill, `Bankruptcy on the night of Year 1 Day 31`
   * (M9-S3, DL-103); `null` exactly while `countdown` is.
   */
  due: string | null;
  /** How the game ended, when it has. */
  ended: string | null;
}

/** The player's Guild at a glance; `null` for a save with no player's Guild. */
export function headerView(document: WorldDocument): HeaderView | null {
  const { world } = document;
  const reading = readingOf(document);
  const { guild } = reading;
  if (guild === undefined) return null;
  const { config } = reading.deps;
  const byFame = rankingPlaces(world, 'fame');
  const place = byFame.find((ranking) => ranking.guildId === guild.id);
  const { ended } = world;
  const standing = place === undefined ? 'Not ranked: the Guild has folded' : `${capitalised(placeWords(place))} of ${byFame.length}`;
  const measure = place === undefined ? '' : 'by Fame';
  return {
    guildId: guild.id,
    guildName: guild.name,
    guildmasterName: reading.guildmaster?.name ?? null,
    wealth: guild.wealth,
    fame: guild.fame,
    time: whenOfTurn(world.turn, config),
    timeOfDay: timeOfDay(world.turn),
    seed: document.meta.seed,
    rankings: measure === '' ? standing : `${standing} ${measure}`,
    place: standing,
    measure,
    countdown: countdownView(document),
    due: dueView(document),
    // How it ended, as a refusal after it says it (DL-241).
    ended: ended === null ? null : sentenceWords(endedSentence(ended, { world, content: reading.content, calendar: config })),
  };
}

/**
 * The Bankruptcy countdown of the player's Guild as a sentence (v1.0.1-S4, DL-95), from the
 * engine's `bankruptcyCountdown` under the game's own rules; `null` while its `belowFloorSince` is,
 * and once the game has ended. It stands after Wealth rises during a Day, until that night's check
 * clears it, as the rule does. The home view says it in full, the status bar's pill gives its Day
 * (`HeaderView.due`, M9-S3), and the status bar's time controls show it between the steps of a fast
 * forward too (v1.0.1-S5).
 */
export function countdownView(document: WorldDocument): string | null {
  const { guild, deps } = readingOf(document);
  if (guild === undefined || document.world.ended !== null) return null;
  const { config } = deps;
  const countdown = bankruptcyCountdown(guild, config);
  if (countdown === null) return null;
  return (
    `${guild.name} has been below the Bankruptcy floor since ${dateOfDay(countdown.sinceDay, config)}: Bankruptcy on ` +
    `${nightOfDay(countdown.dueDay, config)} unless Wealth is back to ${config.bankruptcyFloor} or more on a night by then, after any Upkeep due.`
  );
}

/** The countdown's Day, `Bankruptcy on the night of Year 1 Day 31`: when `countdownView` gives a sentence, and only then. */
function dueView(document: WorldDocument): string | null {
  const { guild, deps } = readingOf(document);
  if (guild === undefined || document.world.ended !== null) return null;
  const { config } = deps;
  const countdown = bankruptcyCountdown(guild, config);
  return countdown === null ? null : `Bankruptcy on ${nightOfDay(countdown.dueDay, config)}`;
}

// ── The Board ────────────────────────────────────────────────────────────────────────────────

export interface QuestCard {
  questId: QuestId;
  name: string;
  patron: string;
  /** Its Tier, `Tier 3`: the card's first term, before Deadly, the Days and the reward (DL-257, DL-269). */
  tier: string;
  /** Whether it is Deadly (`QuestReading.deadly`, DL-265): the card's mark, with no figure (Q18 b). */
  deadly: boolean;
  /** Its narrative, its Beats' lines in the order it plays them (`QuestReading.beats`): the Party builder's, not the card's (DL-269). */
  beats: string[];
  difficulty: number;
  days: number;
  reward: number;
  fame: number;
  /** `2 or more Heroes`: a Party has no most (DL-266). */
  party: string;
  /** The Class and the Skill it requires beyond its Party size, `a Mage`, `a Hero with Lockpicking`: none, often. */
  needs: string[];
  /** The last Day it stays on offer, as the engine counts it, which the Board sorts by. */
  lastDay: number;
  /** That Day as the Board's chip says it, `Until Year 1 Day 6` (DL-210). */
  until: string;
  /** Whether that Day is the Day in hand: the next morning's refresh takes it off, if no Guild has (M9-S4). */
  leavesToday: boolean;
  /** The Skills its Encounters' Checks read (`skillsThatHelp`, DL-70), by name. */
  skills: string[];
  /**
   * Its Encounters, drawn when it was posted, in the order it meets them, each with its Checks' names
   * and what they read (v1.1.4-S6, DL-148 item 16), in place of the template's demands, which no view
   * shows: one or more (DL-248).
   */
  encounters: EncounterView[];
  /**
   * Where its difficulty sits among the Quests on the Board now (M9-S4, the review's C6): display
   * only, and never called a band, which is how a Quest went (`CONTEXT.md`).
   */
  meter: DifficultyMeter;
  /** The same in words: `3rd hardest of the 6 Quests on the Board`, `the only Quest on the Board`. */
  hardness: string;
}

/** One of a Quest's Encounters as its card shows it: `encounterReadings`', and whether its one Check is named as it is. */
export interface EncounterView extends EncounterReading {
  /** One Check of the Encounter's own name, as an Encounter in the old form loaded until DL-192: the card says what it reads beside the name. */
  one: boolean;
}

/**
 * The Party the engine would send from the player's pool (the Best Party, DL-148 item 17; DL-286), as the card
 * gives it: its chance in a word and the Heroes' names; its chance `null` while the Quest's
 * Encounters are drawn on the way; when the Guild may not take the Quest, why, in the refusal's words
 * (`questClosed`, DL-264); or, when no Party of them meets the Quest's requirements, `null`.
 */
export type BestPartyView = { chance: string | null; names: string } | { refused: string } | null;

/** A Quest's difficulty placed against the Quests on the Board now, for a meter to draw. */
export interface DifficultyMeter {
  /** The difficulty of the easiest and of the hardest Quest on the Board now. */
  lowest: number;
  highest: number;
  /** Where this Quest's falls, from the lowest, 0, to the highest, 1; the middle when they are one. */
  at: number;
  /** Where each other Quest on the Board falls, in the Board's order. */
  others: number[];
}

/**
 * How the player may order the Board (M9-S4, the review's B2): as it was posted; by reward, highest
 * first; by difficulty, easiest first; or by the Day each leaves, soonest first. Display only: the
 * Board's own order is the World State's, which no play changes.
 */
export type BoardOrder = 'posted' | 'reward' | 'difficulty' | 'leaves';

/** Each order's key, smallest first; ties keep the Board's order. */
const orderKeys: Readonly<Record<Exclude<BoardOrder, 'posted'>, (card: QuestCard) => number>> = {
  reward: (card) => -card.reward,
  difficulty: (card) => card.difficulty,
  leaves: (card) => card.lastDay,
};

/** `show board`: the Quests on offer, in the Board's order or in `order`. */
export function boardView(document: WorldDocument, order: BoardOrder = 'posted'): QuestCard[] {
  const cards = questCards(document);
  if (order === 'posted') return cards;
  const key = orderKeys[order];
  return [...cards].sort((a, b) => key(a) - key(b));
}

/** The Quests on offer as cards, in the Board's order: the Board's readings (`boardReading`, DL-241) laid out. */
function questCards(document: WorldDocument): QuestCard[] {
  const reading = readingOf(document);
  const { calendar } = reading;
  const today = dayOf(document.world.turn);
  const quests = boardReading(reading);
  const difficulties = quests.map((quest) => quest.difficulty);
  const lowest = Math.min(...difficulties);
  const highest = Math.max(...difficulties);
  const along = (difficulty: number): number => (highest === lowest ? 0.5 : (difficulty - lowest) / (highest - lowest));
  return quests.map((quest, index): QuestCard => ({
    questId: quest.id,
    name: quest.name,
    patron: quest.patron ?? 'a Patron',
    tier: tierWords(quest.tier),
    deadly: quest.deadly,
    beats: quest.beats,
    difficulty: quest.difficulty,
    days: quest.days,
    reward: quest.reward,
    fame: quest.fame,
    party: `${quest.partySizeMin} or more Heroes`,
    needs: [...(quest.classRequired === null ? [] : [`a ${quest.classRequired}`]), ...(quest.skillRequired === null ? [] : [`a Hero with ${quest.skillRequired}`])],
    lastDay: dayOf(quest.expiresOnTurn),
    until: `Until ${dateOfTurn(quest.expiresOnTurn, calendar)}`,
    leavesToday: dayOf(quest.expiresOnTurn) === today,
    skills: quest.skills,
    encounters: quest.encounters.map((encounter) => ({ ...encounter, one: readsAsOne(encounter) })),
    meter: { lowest, highest, at: along(quest.difficulty), others: difficulties.filter((_, other) => other !== index).map(along) },
    hardness: hardnessWords(quest.difficulty, difficulties),
  }));
}

/**
 * "Your best Party" for each Quest on the Board, by Quest id in the Board's order (v1.1.4-S6): the
 * Best Party of the player's pool (`bestPartyReading`, DL-286), its chance the estimate the rule chose
 * it by, every question asked of the document's reading's one Best Party module (DL-237, DL-241);
 * for a Quest the player's Guild may not take, why (`questClosed`, DL-264). The Board's alone, since it estimates many Parties of each Quest: `boardView`'s cards, which the
 * digest and the stop read too, carry none (v1.1.4-S6's verification, DL-157).
 */
export function bestPartyView(document: WorldDocument): ReadonlyMap<QuestId, BestPartyView> {
  const { world } = document;
  const reading = readingOf(document);
  return new Map(
    world.board.flatMap((questId): [QuestId, BestPartyView][] => {
      const quest = rowOf(world.quests, questId);
      if (quest === undefined) return [];
      const closed = questClosed(reading, quest);
      if (closed !== null) return [[questId, { refused: rejectionSentence(closed, document, reading.content) }]];
      const best = bestPartyReading(reading, quest);
      if (best === null) return [[questId, null]];
      return [[questId, { chance: best.chance === null ? null : chanceWords[best.chance.band], names: listed(best.names) }]];
    }),
  );
}

/** Where `difficulty` ranks among `difficulties`, its own among them, hardest first, in words. */
function hardnessWords(difficulty: number, difficulties: readonly number[]): string {
  const { length } = difficulties;
  if (length === 1) return 'the only Quest on the Board';
  const place = 1 + difficulties.filter((each) => each > difficulty).length;
  const joint = difficulties.filter((each) => each === difficulty).length > 1;
  const of = `of the ${length} Quests on the Board`;
  if (place === 1) return `${joint ? 'joint' : 'the'} hardest ${of}`;
  // No Quest easier: the easiest, alone or joint, where Quests share the lowest difficulty (M9-F6).
  if (difficulties.every((each) => each >= difficulty)) return `${joint ? 'joint' : 'the'} easiest ${of}`;
  return `${placeWords({ place, joint })} hardest ${of}`;
}

// ── The default order of Heroes ──────────────────────────────────────────────────────────────

/**
 * The default order of the player's Heroes (v1.1.5-S11, DL-169 item 5): Class in the content's
 * declared order (`content/class-order.json`: Warrior, Rogue, Mage, Healer), Level highest first, Age youngest
 * first, Name A–Z, then the Hero's id, so that any two Heroes have one order. The Board's Party
 * builder lists by it, and the Roster; it breaks the ties of every other order they sort by. For
 * display only: the engine's `rosterIds` keeps the order the Heroes joined, and the save is unchanged.
 * Age is the Age the page shows (`ageOf`), and a Class the content does not define comes last.
 */
export function defaultHeroOrder(document: WorldDocument): (a: Hero, b: Hero) => number {
  const { turn } = document.world;
  const { config } = readingOf(document).deps;
  return (a, b) =>
    byClass(a, b) ||
    b.level - a.level ||
    ageOf(a, turn, config) - ageOf(b, turn, config) ||
    compareByCodeUnit(a.name, b.name) ||
    compareByCodeUnit(a.id, b.id);
}

/** Two Heroes by Class in the content's declared order (`classComparator`, v1.1.6-S14, DL-186 item 24). */
function byClass(a: Hero, b: Hero): number {
  return classComparator(content)(a.classKey, b.classKey);
}

// ── Choosing a Party ─────────────────────────────────────────────────────────────────────────

/**
 * A Hero on the Roster as the Party builder shows them for one Quest (M9-S4, DL-99 item 3): whether
 * they can go, and when not why and until when; their Class and Level; the effective values of the
 * Stats the Quest's Checks read (`statsRead`, v1.1.4-S6, in place of the template's demands); and
 * the Skills the Quest names that they have. Every value is one the
 * Roster, a Hero's page and the Board already give: no fit and no odds. No Hero's Morale: the
 * builder says what the Party's does in one line (v1.1.4-S3's verification, DL-148 item 12). Their
 * Fatigue is said by its band, since a rest band keeps the tired home (DL-286), and the Captain marked
 * (DL-289).
 */
export interface PartyRow extends ClassMarked {
  heroId: HeroId;
  name: string;
  level: number;
  /** The engine's `unavailability`: why the Hero cannot go now, or `null` when they can. */
  why: Unavailability | null;
  /** The same with until when, as the Roster words it: `Injured, healing on the night of Year 1 Day 7`. The chip's tooltip and its screen reader's words. */
  unavailable: string | null;
  /** The Board's chip, short (v1.1.5-S11, DL-169 item 2): `Away` or `Injured`; `null` when the Hero can go. */
  chip: string | null;
  /** Their Fatigue's band, as the Roster's rows read it (`rosterReading`). */
  fatigueBand: FatigueBand;
  /** Whether they are the Guild's Captain. */
  captain: boolean;
  /** Each Stat the Quest's Checks read (`statsRead`), in the order it meets them, at the value a Check reads (`statBreakdown`'s effective value). */
  stats: { name: string; value: number }[];
  /** The Skill the Quest requires, then those that help (`skillsThatHelp`), that the Hero has. */
  skills: { name: string; rating: number }[];
}

/**
 * The player's Roster as the Heroes a Party for `questId` may be chosen from; `null` for a Quest not
 * on the Board. Those who can go come first, in the default order; below them those who cannot,
 * the soonest free first, a Hero with no Day to read last, ties in the default order (v1.1.5-S11,
 * DL-169 item 4).
 */
export function partyRows(document: WorldDocument, questId: QuestId): PartyRow[] | null {
  const { world } = document;
  const reading = readingOf(document);
  const { guild, calendar } = reading;
  const quest = rowOf(world.quests, questId);
  if (guild === undefined || quest === undefined || !world.board.includes(questId)) return null;
  // Each Hero's Fatigue band and whether they are the Captain are the Roster's rows' own (DL-289).
  const rowsRead = new Map(rosterReading(reading, guild).map((row) => [row.id, row]));
  const { skillKey } = quest.requirements;
  const named = [...new Set([...(skillKey === undefined ? [] : [skillKey]), ...skillsThatHelp(quest, content)])];
  const read = statsRead(quest, content);
  const order = defaultHeroOrder(document);
  const onRoster = guild.rosterIds.flatMap((heroId) => {
    const hero = rowOf(world.heroes, heroId);
    return hero === undefined ? [] : [hero];
  });
  const availability = new Map(onRoster.map((hero) => [hero.id, availabilityOf(hero, world, calendar)]));
  const soonest = (a: Hero, b: Hero): number => compareNumbers(availability.get(a.id)?.freeOnTurn ?? Infinity, availability.get(b.id)?.freeOnTurn ?? Infinity);
  return onRoster
    .sort((a, b) => soonest(a, b) || order(a, b))
    .map((hero): PartyRow => {
      const values = statValues(hero, world);
      const held = heroSkills(content, hero);
      const { why, until, chip } = availability.get(hero.id) ?? availabilityOf(hero, world, calendar);
      const row = rowsRead.get(hero.id);
      return {
        heroId: hero.id,
        name: hero.name,
        ...classMarkOf(content, hero.classKey),
        level: hero.level,
        why,
        unavailable: until,
        chip,
        fatigueBand: row?.fatigueBand ?? 'fresh',
        captain: row?.captain ?? false,
        stats: read.map((key) => ({ name: nameIn(content.stats, key), value: values.get(key)?.effective ?? 0 })),
        skills: named.flatMap((key) => held.filter((skill) => skill.key === key).map(({ name, rating }) => ({ name, rating }))),
      };
    });
}

export interface ConsumableChoice {
  definitionKey: ItemDefinitionKey;
  name: string;
  /** How many the Guild holds: the most a Party can carry. */
  held: number;
  /** What one does, in words. */
  does: string;
}

/** The consumables the player's Guild holds, which a Party may carry (M5-S3). */
export function consumableChoices(document: WorldDocument): ConsumableChoice[] {
  const { guild } = readingOf(document);
  if (guild === undefined) return [];
  return holdings(document.world, { kind: 'guild', id: guild.id }).stacks.flatMap((stack): ConsumableChoice[] => {
    const definition = itemDefinition(content, stack.definitionKey);
    if (definition?.kind !== 'consumable') return [];
    return [{ definitionKey: stack.definitionKey, name: definition.name, held: stack.quantity, does: consumableEffectWords(definition.effect) }];
  });
}

/** A Synergy's bonus in words: `+2`, `×1.15`, or both. */
function bonusWords({ flat, factor }: Synergy['bonus']): string {
  return listed([...(flat === undefined ? [] : [`+${flat}`]), ...(factor === undefined ? [] : [`×${factor}`])]);
}

export interface PreviewView {
  requirements: { words: string; met: boolean }[];
  /** Each Hero chosen who cannot go. */
  problems: string[];
  /** Each Synergy the Party would have, or that it has none. */
  synergies: string[];
  /** What the Party's Morale does to its odds, one line for the Party naming no Hero (DL-148 item 12); `null` for no one chosen. */
  morale: string | null;
  /**
   * What relieves the hurt on the Quest: a Healer among the Party and the heal Items carried, or that there
   * is none (DL-285, DL-289); none for no one chosen.
   */
  relief: string[];
  /**
   * How likely the Party is to come through each Encounter and the Quest (v1.1.4-S6, DL-148 item 15):
   * each a word, and in the detail its percentage floored to 5, if no one falls; `null` for no one chosen, or
   * a Quest whose Encounters are drawn on the way.
   */
  chances: ChancesView | null;
  /** What the Party would carry. */
  consumables: string[];
  /** The reward agreed on a success and the reward offered. */
  reward: string;
  /** Whether `dispatch` would send the Party, and if not, why not: the rule's own verdict. */
  verdict: { sends: boolean; words: string };
}

/**
 * What a Party of `heroIds` carrying `consumables` would meet on `questId`: the engine's
 * `previewDispatch`, in the CLI's `preview`'s words. `null` when the Quest is no longer on the
 * Board, or the save has no player's Guild.
 */
export function previewView(
  document: WorldDocument,
  questId: QuestId,
  heroIds: readonly HeroId[],
  consumables: readonly ConsumableRequest[],
): PreviewView | null {
  const { world } = document;
  const { guild, deps } = readingOf(document);
  if (guild === undefined) return null;
  const request = { guildId: guild.id, questId, heroIds: [...heroIds], consumables: [...consumables] };
  const preview = previewDispatch(world, request, deps);
  if (preview === null) return null;
  const reach = (encounters: number | null): string =>
    encounters === null ? "this Quest's Encounters are drawn on the way" : `${encounters} of this Quest's ${preview.encounterKinds.length}`;

  return {
    requirements: preview.requirements.map((status) => {
      switch (status.requirement) {
        case 'party-size':
          return { words: `${partyFloorWords(status.partySizeMin)} (${status.size} chosen)`, met: status.met };
        case 'class':
          return { words: `A ${nameIn(content.classes, status.classKey)}`, met: status.met };
        case 'skill':
          return { words: `A Hero with ${nameIn(content.skills, status.skillKey)}`, met: status.met };
      }
    }),
    problems: preview.problems.map(({ hero, because }) =>
      because === 'not-on-roster'
        ? `${hero?.name ?? 'That Hero'} is not on the Roster of ${guild.name}.`
        : `${hero?.name ?? 'That Hero'} ${unavailableWords[because]} and cannot go.`,
    ),
    synergies:
      preview.synergies.length === 0
        ? ['None: this Party meets no Synergy.']
        : preview.synergies.map(({ synergy, encounters }) => {
            const where = synergy.kinds === undefined ? 'on every Encounter' : `on ${listed(synergy.kinds)} Encounters`;
            return `${synergy.name}: ${bonusWords(synergy.bonus)} ${where}; ${reach(encounters)}.`;
          }),
    morale: preview.form === null ? null : `${formEffectWords[preview.form.effect]}.`,
    relief: preview.form === null ? [] : reliefWords(preview.heroes, preview.consumables, content),
    chances: preview.chances === null ? null : chancesView(preview.chances),
    consumables:
      preview.consumables.length === 0
        ? ['None carried.']
        : preview.consumables.map(({ definitionKey, quantity, consumable, held, encounters }) => {
            if (consumable === undefined) return `${nameIn(content.items, definitionKey)} ×${quantity}: not a Consumable.`;
            const where = consumable.effect.kind === 'heal' ? '' : `; ${reach(encounters)}`;
            return `${consumable.name} ×${quantity}, of ${held} the Guild holds: ${consumableEffectWords(consumable.effect)}${where}.`;
          }),
    reward: `Reward agreed on a success: ${preview.agreedReward} Wealth, ${preview.offeredReward} offered.`,
    verdict:
      preview.refusal === null
        ? { sends: true, words: 'Dispatch would send this Party.' }
        : { sends: false, words: `Dispatch would refuse it: ${rejectionSentence(preview.refusal, document, content)}` },
  };
}

/** A chance as the Party builder shows it: what it is of, its word, and its percentage floored to 5 (`shownPercent`) for the detail. */
export interface ChanceLine {
  name: string;
  chance: string;
  percent: number;
}

/** Each Encounter's chance, then the Quest's (v1.1.4-S6). */
export interface ChancesView {
  encounters: ChanceLine[];
  quest: ChanceLine;
}

/** `estimate` in the builder's words: each Encounter by name, and the Quest. */
function chancesView(estimate: QuestEstimate): ChancesView {
  const line = (name: string, it: { chance: QuestEstimate['chance']; success: number }): ChanceLine => ({
    name,
    chance: chanceWords[it.chance],
    percent: shownPercent(it.success),
  });
  return {
    encounters: estimate.encounters.map((it) => line(nameIn(content.encounters, it.encounterKey), it)),
    quest: line('The Quest', estimate),
  };
}

/** The Party the player sent by the last play, as the Board confirms it (M9-S4, the review's E1). */
export interface SentView {
  questId: QuestId;
  /** The Quest's name, as the Board named it. */
  quest: string;
  /** Who went, by name, in the Party's order: `Finn, Vigdis and Arne`. */
  heroes: string;
  /** `the night of Year 1 Day 6`: when the Party comes home, as the home view's Parties out says it. */
  returns: string;
}

/**
 * The Party of the player's that the last play the engine carried out sent (its `quest.taken`),
 * or `null` when that play sent none: an advance, whose Parties are the Rivals', or before a game.
 * A dispatch sends one Party, so there is one at most. Names are the event's labels, written when
 * it was sent.
 */
export function sentView(state: Pick<GameState, 'document' | 'log'>): SentView | null {
  const { document, log } = state;
  const guild = document === null ? undefined : readingOf(document).guild;
  if (document === null || guild === undefined) return null;
  const taken = log.filter((event): event is Taken => event.type === 'quest.taken' && (event as Taken).payload.guildId === guild.id).at(-1);
  if (taken === undefined) return null;
  const { payload, labels } = taken;
  return {
    questId: payload.questId,
    quest: questNamer(document, content)(payload.questId),
    heroes: listed(payload.heroIds.map((heroId) => labels[heroId] ?? rowOf(document.world.heroes, heroId)?.name ?? 'a Hero')),
    returns: nightOfTurn(payload.returnsOnTurn, readingOf(document).calendar),
  };
}

type Taken = EngineEventOf<'quest.taken'>;

// ── The Roster ───────────────────────────────────────────────────────────────────────────────

/**
 * A Hero's Stat as the Roster's Table shows it (v1.1.5-S12, DL-169 item 8): its base, the effective
 * value a Check reads, and each source that changes it, the engine's `statBreakdown` (v1.1.6-S13,
 * DL-186 item 3) in words. `change` is the net change, the value
 * less the base after the Stat's bounds: `up`, `down`, or `null` at nothing. Never its Potential.
 */
export interface RosterStat {
  key: StatKey;
  name: string;
  base: number;
  value: number;
  change: 'up' | 'down' | null;
  /** Each source that moves the Stat, in the order `statBreakdown` adds them; none that moves it by nothing. */
  sources: { from: string; change: number }[];
  /** The base and each source in words, `Base 10, +2 from Gear`, and the bound when it holds the value; `null` when nothing moves it. */
  words: string | null;
}

/**
 * An Item a Hero on the Roster carries: by name, with what it does; and whether it is a Unique Item,
 * with its content key, so that its picture stands before its name on their tile (v1.1.5-S14, DL-182 item 4).
 */
export interface RosterItem {
  name: string;
  effect: string;
  definitionKey: ItemDefinitionKey;
  unique: boolean;
}

export interface RosterRow extends ClassMarked {
  heroId: HeroId;
  name: string;
  /** Their sex and Portrait's key, for the thumbnail beside their name (v1.1.3-S7, DL-135 item 9). */
  sex: Sex;
  portraitKey: string | null;
  level: number;
  age: number;
  morale: number;
  moraleBand: MoraleBand;
  /** Their Fatigue and its band, read as Morale is, from the words' reading (DL-289). */
  fatigue: number;
  fatigueBand: FatigueBand;
  /** Whether they are the Guild's Captain: an icon beside their name (DL-289). */
  captain: boolean;
  /** The engine's `unavailability`: why the Hero is not at the Hall to be sent, or `null` (M9-S6). */
  why: Unavailability | null;
  /** Where the Hero is: at the Hall, injured, or away with a Party, and until when: `At the Hall`. */
  whereabouts: string;
  /** Each Trait the Hero holds, by name, with what it does, as their page gives it (v1.1.5-S12, DL-169 item 9). */
  traits: { name: string; effect: string }[];
  /** Their Items: the Gear they carry, by name, with what it does (DL-169 item 9, the agent's reading). */
  items: RosterItem[];
  /** Whether they carry any Unique Item: their tile and their row in the Table glow gold (v1.1.5-S14, DL-182 item 4). */
  carriesUnique: boolean;
  /** The 20 Stats in content's order, for the Table (DL-169 item 8); the tiles show none (Q12). */
  stats: RosterStat[];
}

/**
 * Which way a list is sorted: A to Z, lowest first, or the content's order; or the other way. The
 * page's one such type: the views' sorting headings (`SortHeader`) take it too (v1.1.5-S10).
 */
export type SortDirection = 'ascending' | 'descending';

/** What the Roster sorts by (DL-169 item 10): the default order, a Hero's field, when they are free, or a Stat by its key. */
export type RosterSortKey = 'default' | 'name' | 'class' | 'level' | 'age' | 'morale' | 'fatigue' | 'free' | StatKey;

/** The Roster's sort: one value, which the "Sort by" dropdown and the Table's headings share. */
export interface RosterOrder {
  key: RosterSortKey;
  direction: SortDirection;
}

/** The Roster as it first opens: the default order (DL-169 item 5). */
export const defaultRosterOrder: RosterOrder = { key: 'default', direction: 'ascending' };

/** A choice of "Sort by": its words, the direction it first sorts in, and a Stat's area, for its group. */
export interface RosterSortChoice {
  key: RosterSortKey;
  label: string;
  first: SortDirection;
  /** `Physical`, for a Stat; `null` for the rest. */
  area: string | null;
}

/** The sorts that are not a Stat's, in the dropdown's order, with their first directions (DL-169 item 10). */
const heroSorts: readonly RosterSortChoice[] = [
  { key: 'default', label: 'Default', first: 'ascending', area: null },
  { key: 'name', label: 'Name', first: 'ascending', area: null },
  { key: 'class', label: 'Class', first: 'ascending', area: null },
  { key: 'level', label: 'Level', first: 'descending', area: null },
  { key: 'age', label: 'Age', first: 'ascending', area: null },
  { key: 'morale', label: 'Morale', first: 'descending', area: null },
  { key: 'fatigue', label: 'Fatigue', first: 'descending', area: null },
  { key: 'free', label: 'When free', first: 'ascending', area: null },
];

/** The Hero Stats of `set`, in its order. */
function heroStats(set: ContentSet): ContentSet['stats'][string][] {
  return Object.values(set.stats).filter((stat) => stat.owner === 'hero');
}

/**
 * The choices of "Sort by" (DL-169 item 10): Default, Name, Class, Level, Age, Morale, Fatigue (DL-289),
 * When free, then each of the 20 Stats, highest first. Age first sorts youngest first, a name A to Z, Class in
 * the content's order and when free those at the Hall first.
 */
export function rosterSortChoices(set: ContentSet = content): RosterSortChoice[] {
  return [...heroSorts, ...heroStats(set).map((stat): RosterSortChoice => ({ key: stat.key, label: stat.name, first: 'descending', area: capitalised(stat.area) }))];
}

/**
 * The direction of a sort as it reads inside a sentence: `highest first`, `A to Z`, `Warrior first`.
 * It reads the page's content, as the sort does (`byClass`), so the words say the order shown (DL-205).
 */
function orderPhrase(key: RosterSortKey, direction: SortDirection): string {
  const up = direction === 'ascending';
  switch (key) {
    case 'default':
      return up ? 'default order' : 'reversed';
    case 'name':
      return up ? 'A to Z' : 'Z to A';
    case 'class': {
      // The first and last in the declared order the sort reads (`classComparator`, DL-186 item 24).
      const first = up ? content.classOrder[0] : content.classOrder.at(-1);
      return `${first === undefined ? 'Class' : nameIn(content.classes, first)} first`;
    }
    case 'age':
      return up ? 'youngest first' : 'oldest first';
    case 'free':
      return up ? 'at the Hall first' : 'at the Hall last';
    default:
      return up ? 'lowest first' : 'highest first';
  }
}

/** The direction of a sort in words, as its button says it: `Highest first`, `A to Z`, `Warrior first`. */
export function orderWords(key: RosterSortKey, direction: SortDirection): string {
  return capitalised(orderPhrase(key, direction));
}

/**
 * The direction button's name (#52's judgement call 4, v1.1.5's re-close, DL-185): what it does, then
 * the direction the sort is in, as `Reverse the order, now A to Z`. The shown words stand in it, so a
 * voice that names what it sees finds the button.
 */
export function reverseOrderName(key: RosterSortKey, direction: SortDirection): string {
  return `Reverse the order, now ${orderPhrase(key, direction)}`;
}

/** A column of the Roster's Table: its key, its heading, the sort its heading orders by, and whether it holds a number. */
export interface RosterColumn {
  key: string;
  label: string;
  sort: RosterSortKey | null;
  number: boolean;
}

/**
 * What a group of columns is (DL-289, the architecture review's candidate 7): the Hero's own, their
 * State, or one of the Stat areas. A view that offers the Stat areas alone, as the phone's "Sort by" does,
 * reads them by this and not by where a group stands.
 */
export type RosterColumnKind = 'hero' | 'state' | 'stat-area';

/** A group of the Table's columns, which the Columns panel and the phone's tabs show together: Hero, State, then each area. */
export interface RosterColumnGroup {
  key: string;
  label: string;
  kind: RosterColumnKind;
  columns: RosterColumn[];
}

/**
 * The Table's columns after Name, which always shows (DL-169 item 7): Hero (Class, Level, Age, where
 * the Hero is, Traits, Items), State (Morale, Fatigue; DL-289, Q5 a), then the Stats by area, each area a
 * group, in content's order. The Table draws them in `rosterTableColumns`' order.
 */
export function rosterColumnGroups(set: ContentSet = content): RosterColumnGroup[] {
  const hero: RosterColumnGroup = {
    key: 'hero',
    label: 'Hero',
    kind: 'hero',
    columns: [
      { key: 'class', label: 'Class', sort: 'class', number: false },
      { key: 'level', label: 'Level', sort: 'level', number: true },
      { key: 'age', label: 'Age', sort: 'age', number: true },
      { key: 'where', label: 'Where', sort: 'free', number: false },
      { key: 'traits', label: 'Traits', sort: null, number: false },
      { key: 'items', label: 'Items', sort: null, number: false },
    ],
  };
  const state: RosterColumnGroup = {
    key: 'state',
    label: 'State',
    kind: 'state',
    columns: [
      { key: 'morale', label: 'Morale', sort: 'morale', number: true },
      { key: 'fatigue', label: 'Fatigue', sort: 'fatigue', number: true },
    ],
  };
  const areas: RosterColumnGroup[] = [];
  for (const stat of heroStats(set)) {
    const column: RosterColumn = { key: stat.key, label: stat.name, sort: stat.key, number: true };
    const area = areas.find((each) => each.key === stat.area);
    if (area === undefined) areas.push({ key: stat.area, label: capitalised(stat.area), kind: 'stat-area', columns: [column] });
    else area.columns.push(column);
  }
  return [hero, state, ...areas];
}

/** The columns whose cells are long, the words of where a Hero is and the lists of names, which the wide Table sets last (DL-289, Q21 a). */
const trailingColumns: readonly string[] = ['where', 'traits', 'items'];

/**
 * The wide Table's columns after Name, in the order it draws them (DL-289, the owner's answer (a) to Q21):
 * the Hero group's short columns (Class, Level, Age), then State, then each Stat area, then Where, Traits and
 * Items, whose cells are long and would push Morale and Fatigue off a 1280px screen. The groups keep Hero,
 * State, then the areas, so the Columns panel and the phone's tabs are as they were; a phone's tab draws its
 * own group's columns in this order.
 */
export function rosterTableColumns(groups: readonly RosterColumnGroup[]): RosterColumn[] {
  const columns = groups.flatMap((group) => group.columns);
  return [...columns.filter((column) => !trailingColumns.includes(column.key)), ...columns.filter((column) => trailingColumns.includes(column.key))];
}

/**
 * The Gear a Hero carries in their own slots (`carriedGear` gives only those rows), by name, with its Stat
 * modifiers in words (DL-169 item 9), and whether each is a Unique Item, with its content key (v1.1.5-S14).
 */
function itemsOf(hero: Hero, world: World): RosterItem[] {
  return carriedGear(world, hero.id).map((row) => {
    const definition = itemDefinition(content, row.definitionKey);
    return {
      name: nameIn(content.items, row.definitionKey),
      effect: definition?.kind === 'gear' ? modifierWords(definition, content) : '',
      definitionKey: row.definitionKey,
      unique: definition?.unique === true,
    };
  });
}

/**
 * Each of a Hero's 20 Stats with its base, effective value and sources (DL-169 item 8), the engine's
 * `statBreakdown` in words (v1.1.6-S13, DL-186 item 3): the sources in the order it adds them, the
 * Guildmaster's Class bonus, the Gear and the Hero's Traits, and the value within the Stat's bounds.
 */
function rosterStats(hero: Hero, world: World): RosterStat[] {
  const breakdown = statBreakdown(hero, world, content);
  return heroStats(content).flatMap((stat): RosterStat[] => {
    const parts = rowOf(breakdown, stat.key);
    if (parts === undefined) return [];
    const { base, effective: value } = parts;
    const sources = statSourcesMoving(parts);
    return [{ key: stat.key, name: stat.name, base, value, change: value > base ? 'up' : value < base ? 'down' : null, sources, words: statPartsWords(parts) }];
  });
}

/** Two numbers, lower first, either of which may be infinite. */
function compareNumbers(a: number, b: number): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** A row of the Roster with what its sorts read beside it: the Hero, and when they are free. */
interface RosterEntry {
  hero: Hero;
  row: RosterRow;
  free: number;
}

/**
 * The player's Roster as rows, built once for a document (`rosterRows`) and sorted as often as the
 * player likes (`sortedRoster`) without being built again (v1.1.6-S13, DL-186 item 22). What is in
 * it is the module's own: a view takes it from one and hands it to the other.
 */
export interface RosterRows {
  /** Each Hero on the Roster in the order they joined (`rosterIds`). */
  readonly entries: readonly RosterEntry[];
  /** The default order, read at the document's Turn (DL-169 item 5). */
  readonly byDefault: (a: Hero, b: Hero) => number;
}

/**
 * The rows built for each document, by the document itself (v1.1.6-S13, DL-186 item 22). Every play
 * replaces the document the page holds (`reducer.ts`), so a document's rows never change once built,
 * and a document no longer held is let go with its rows.
 */
const rowsBuilt = new WeakMap<WorldDocument, RosterRows>();

/**
 * `show roster`: the player's Roster as rows (v1.1.5-S12, DL-169), built once for each document and
 * then the same rows (v1.1.6-S13, DL-186 item 22), in the order the Heroes joined until
 * `sortedRoster` sorts them. For display only: `rosterIds` keeps the order the Heroes joined.
 */
export function rosterRows(document: WorldDocument): RosterRows {
  const built = rowsBuilt.get(document);
  if (built !== undefined) return built;
  const rows = buildRosterRows(document);
  rowsBuilt.set(document, rows);
  return rows;
}

/** The Roster's rows for `document`, built: what `rosterRows` keeps. */
function buildRosterRows(document: WorldDocument): RosterRows {
  const { world } = document;
  const reading = readingOf(document);
  const { guild } = reading;
  if (guild === undefined) return { entries: [], byDefault: () => 0 };
  const { config } = reading.deps;
  const byDefault = defaultHeroOrder(document);
  // Each Hero on it as a row of a Roster (`rosterReading`, DL-241), and what the Table adds.
  const entries = rosterReading(reading, guild).flatMap((read): RosterEntry[] => {
    const hero = rowOf(world.heroes, read.id);
    if (hero === undefined) return [];
    const items = itemsOf(hero, world);
    const availability = availabilityOf(hero, world, config);
    const row: RosterRow = {
      heroId: read.id,
      name: read.name,
      sex: read.sex,
      portraitKey: read.portraitKey,
      ...classMarkOf(reading.content, read.classKey),
      level: read.level,
      age: read.age,
      morale: read.morale,
      moraleBand: read.moraleBand,
      fatigue: read.fatigue,
      fatigueBand: read.fatigueBand,
      captain: read.captain,
      why: availability.why,
      whereabouts: availability.where,
      traits: heroTraits(content, hero),
      items,
      carriesUnique: items.some((item) => item.unique),
      stats: rosterStats(hero, world),
    };
    return [{ hero, row, free: availability.freeOnTurn ?? Infinity }];
  });
  return { entries, byDefault };
}

/**
 * The Roster's filters (DL-206 items 25 to 29, DL-213): by Class, in the order content declares
 * (`class-order.json`), and by availability, At the Hall, Injured and Away, in the words the Board's
 * chip and a Hero's whereabouts use (`@heroesim/words`, DL-206 item 12), and by the band of their Morale
 * and of their Fatigue (DL-289). A Hero shows when they match every filter. Each group's name, Class, Where,
 * Morale and Fatigue, is shown before its chips (the owner's answer, DL-213).
 * The view filters the rows `rosterRows` keeps, once sorted, and builds none again (DL-199).
 */
export function rosterFacets(
  set: Pick<ContentSet, 'classes' | 'classOrder'> = content,
): Facets<RosterRow, 'class' | 'availability' | 'morale' | 'fatigue'> {
  return {
    class: { label: 'Class', options: set.classOrder.map((key) => ({ key, label: nameIn(set.classes, key) })), of: (row) => row.classKey },
    availability: {
      label: 'Where',
      options: [
        { key: 'hall', label: capitalised(atHallWords) },
        { key: 'injured', label: capitalised(unavailableChipWords.injured) },
        { key: 'in-party', label: capitalised(unavailableChipWords['in-party']) },
      ],
      // No Hero on a Roster is dead or retired: such a row would be of no choice, shown by All alone.
      of: (row) => (row.why === null ? 'hall' : row.why === 'injured' || row.why === 'in-party' ? row.why : null),
    },
    // By the bands a row carries, lowest first (DL-289): the words' names, the rows' own bands.
    morale: { label: 'Morale', options: moraleBandNames.map((key) => ({ key, label: capitalised(key) })), of: (row) => row.moraleBand },
    fatigue: { label: 'Fatigue', options: fatigueBandNames.map((key) => ({ key, label: capitalised(key) })), of: (row) => row.fatigueBand },
  };
}

/**
 * The Roster's rows sorted by `order` (v1.1.5-S12, DL-169 item 10), the default order when none is
 * given, ties always in the default order (DL-169 item 5), whichever way the sort runs. The rows are
 * `rosterRows`' own, sorted and not built again (v1.1.6-S13, DL-186 item 22).
 */
export function sortedRoster(rows: RosterRows, order: RosterOrder = defaultRosterOrder): RosterRow[] {
  const { byDefault } = rows;
  const statOf = (entry: RosterEntry): number => entry.row.stats.find((stat) => stat.key === order.key)?.value ?? 0;
  const primary: (a: RosterEntry, b: RosterEntry) => number =
    order.key === 'default' ? (a, b) => byDefault(a.hero, b.hero)
    : order.key === 'name' ? (a, b) => compareByCodeUnit(a.hero.name, b.hero.name)
    : order.key === 'class' ? (a, b) => byClass(a.hero, b.hero)
    : order.key === 'level' ? (a, b) => a.row.level - b.row.level
    : order.key === 'age' ? (a, b) => a.row.age - b.row.age
    : order.key === 'morale' ? (a, b) => a.row.morale - b.row.morale
    : order.key === 'fatigue' ? (a, b) => a.row.fatigue - b.row.fatigue
    : order.key === 'free' ? (a, b) => compareNumbers(a.free, b.free)
    : (a, b) => statOf(a) - statOf(b);
  const sign = order.direction === 'ascending' ? 1 : -1;
  return [...rows.entries].sort((a, b) => sign * primary(a, b) || byDefault(a.hero, b.hero)).map((entry) => entry.row);
}

// ── A Hero's page ────────────────────────────────────────────────────────────────────────────

export interface StatRow {
  name: string;
  base: number;
  /** What a Check reads: the Guildmaster's Class bonus and the Hero's gear applied (M5-S2). */
  value: number;
  /**
   * What the Hero's gear and the Guildmaster's Traits add to the base, `+2` or `-1`, and whether it
   * lifts it; `null` when the value is the base (M9-S6, the review's B7).
   */
  lift: { words: string; up: boolean } | null;
  /** The Potential hint: a word, never the number (M3-S3). */
  outlook: PotentialHint;
  /** The same as its chip says it, `Promising` (DL-125 item 9). */
  outlookWords: string;
}

/** One of the four areas of a Hero's Stats, `Physical`, and its Stats in content's order (M9-S6). */
export interface StatArea {
  name: string;
  stats: StatRow[];
}

export interface LogLine {
  /** Unique within its list. */
  key: string;
  /** `Year 1 Day 2, afternoon`. */
  when: string;
  sentence: string;
  milestone: boolean;
}

export interface HeroPageView extends ClassMarked {
  heroId: HeroId;
  name: string;
  /**
   * The Hero's sex and Portrait's key, for their Portrait (DL-125 item 2): the key chosen as they were
   * generated (v1.1.3-S6), `null` for the Silhouette of their sex, as every Hero's is while content
   * holds no Hero picture (DL-135 item 8).
   */
  sex: Sex;
  portraitKey: string | null;
  /**
   * Their Appearance and Biography (v1.1.3-S6, DL-135 item 6), each a label and its words, shown under
   * their Portrait (v1.1.3-S7); one written empty, as no Hero's is, is left out.
   */
  texts: [label: string, words: string][];
  /**
   * Who the Hero is, in one line of parts (M9-S6, the review's B7): Class, `Level 3`, `Age 18`, `Female`,
   * Background, and `of The Lantern` while their Guild is known.
   */
  line: string[];
  morale: { value: number; band: MoraleBand };
  /** Their Fatigue and its band (DL-282, DL-289). */
  fatigue: { value: number; band: FatigueBand };
  /** Whether they are their Guild's Captain (DL-287); the player's, a Rival's or none. */
  captain: boolean;
  /** Where the Hero is, in the Roster's words, and the engine's `unavailability`: why they cannot go now. */
  where: { why: Unavailability | null; words: string };
  /** The Injury's name, while they have one; `where` says when it heals. */
  injury: string | null;
  xp: number;
  /** Each Trait the Hero holds, by name, with what its effects do in words (v1.1.4-S7, `traitEffectWords`). */
  traits: { name: string; effect: string }[];
  /** What the player's Guild would pay to take in a Hero on another Guild's Roster (`transferFee`); `null` otherwise. */
  fee: number | null;
  /** The Stats by area, each area a block on the page (M9-S6, the review's B7). */
  areas: StatArea[];
  /**
   * Each gear slot and what is in it; `worn` when an Item is, which `unequip` can take off. What is in
   * it by its content key, `null` in an empty slot, and whether it is a Unique Item, which shows its
   * picture (DL-125 item 8).
   */
  gear: {
    slot: SlotKey;
    slotName: string;
    item: string;
    modifies: string;
    worn: boolean;
    definitionKey: ItemDefinitionKey | null;
    unique: boolean;
  }[];
  skills: { name: string; rating: number }[];
  /**
   * Each other Hero on the Roster, the Hero's Regard for them and the Relationship, as bands; `null`
   * off a Roster. `neutral` when both bands are, which the page folds (M9-S6, the review's C8).
   */
  relationships: { name: string; className: string; regard: RegardBand; relationship: RegardBand; neutral: boolean }[] | null;
  /** The Hero's Milestones, newest first: what a Hero's page always shows first (`CONTEXT.md`). Their History is `historyView`'s (M9-S5). */
  milestones: LogLine[];
  /** What the player can do with the Hero, by where they are; `null` for none. */
  actions: HeroActions | null;
}

/** A piece of gear the player's Guild holds, which `equip` can put on one of its Heroes. */
export interface GearChoice {
  /** Unique within the list. */
  key: string;
  name: string;
  /** `Weapon Gear`, as the slot's cell says it (DL-125 item 9). */
  kind: string;
  modifies: string;
  /** The Item's content key, and whether it is a Unique Item, which shows its picture (DL-125 item 8). */
  definitionKey: ItemDefinitionKey;
  unique: boolean;
  /** What `equip` takes: the unique Item's id, or the stack's. */
  gear: { itemId: ItemId } | { stackId: StackId };
}

/** Another Guild in play and the fee it would pay the player's Guild to take the Hero (`transferFee`). */
export interface TransferTarget {
  guildId: GuildId;
  name: string;
  fee: number;
  /**
   * What the page asks before the Transfer (M9-S6, the review's E4): the fee, and what it costs in
   * the words the page gives the rule. `The Ashford Guild would pay 120 Wealth for Finn Grimshaw, …`
   */
  sentence: string;
}

/**
 * The Captain's post as a Hero of the player's Roster meets it (DL-287, DL-289): whether the Hero holds it, the
 * words that say so or say what naming them does, and, while a change of Captain still locks the post, the
 * refusal's own words with the date it opens. The page disables "Name Captain" while `locked` stands, as it
 * disables Recruit for a Hero who will not sign; whether it is done is the engine's.
 */
export interface Captaincy {
  is: boolean;
  words: string;
  locked: string | null;
}

/**
 * What the player can do with a Hero (M7-S3, DL-73): on the player's Roster, equip, unequip,
 * transfer out and name Captain (DL-289); on another Guild's Roster, take them in for the Transfer fee; in the Unattached
 * pool, recruit them for the signing fee. The fees are the engine's (`transferFee`, `signingFee`,
 * at the paying Guildmaster's Negotiation); whether it is done is the engine's too, which refuses
 * with a sentence. Whether a Hero in the pool would sign is the engine's `signingRefusal`, as the
 * pool's row reads it (`poolView`), so Recruit can be disabled for one who will not (DL-109 item 2,
 * Q17).
 */
export type HeroActions =
  | { kind: 'own'; equip: GearChoice[]; transferTo: TransferTarget[]; captaincy: Captaincy }
  | { kind: 'rival'; guildName: string; fee: number }
  | { kind: 'pool'; fee: number; signs: string; willSign: boolean };

/** History entries as lines, keyed by their place in the list. */
export function linesOf(entries: readonly Entry[], narration: Narration): LogLine[] {
  return entries.map((entry, index) => ({
    key: `${entry.turn}-${index}`,
    when: whenOfTurn(entry.turn, narration.calendar),
    sentence: narrateText(entry as TurnEvent, narration),
    milestone: entry.milestone,
  }));
}

/**
 * `show hero`: the Hero's reading (`heroReading`, DL-241) laid out for their page: who they are in one
 * line, their State as chips, their Stats by area with what lifts each, their gear, Skills and, on a
 * Roster, Relationships; and what is the page's own, their Class's mark, where they are, what the
 * player can do with them and their Milestones, newest first. Their History, a page at a time, is
 * `historyView`'s (`history.ts`). `null` for a Hero the world does not hold.
 */
export function heroPage(document: WorldDocument, heroId: HeroId): HeroPageView | null {
  const { world, history } = document;
  const hero = rowOf(world.heroes, heroId);
  if (hero === undefined) return null;
  const reading = readingOf(document);
  const read = heroReading(reading, hero);

  // Who the Hero is in one line, and their State as chips. A Hero in the
  // pool or gone from it names no Guild; `where` says where they are.
  const who = [
    read.className,
    `Level ${read.level}`,
    // "Age" as a label and the Sex as a word, capitalised (DL-111 item 9); an age in a sentence stays lowercase.
    `Age ${read.age}`,
    capitalised(read.sex),
    read.background,
    ...(read.guild?.name === undefined ? [] : [`of ${read.guild.name}`]),
  ];

  const areas: StatArea[] = [];
  for (const stat of read.stats) {
    const row: StatRow = {
      name: stat.name,
      base: stat.base,
      value: stat.value,
      lift: stat.value === stat.base ? null : { words: signed(stat.value - stat.base), up: stat.value > stat.base },
      outlook: stat.outlook,
      outlookWords: capitalised(stat.outlook),
    };
    const area = areas.at(-1);
    if (area?.name === stat.area) area.stats.push(row);
    else areas.push({ name: stat.area, stats: [row] });
  }

  const available = availabilityOf(hero, world, reading.calendar);
  return {
    heroId: read.id,
    name: read.name,
    sex: read.sex,
    portraitKey: read.portraitKey,
    texts: read.texts.map(({ label, words }): [string, string] => [label, words]),
    line: who,
    ...classMarkOf(reading.content, read.classKey),
    morale: { value: read.morale, band: read.moraleBand },
    fatigue: { value: read.fatigue, band: read.fatigueBand },
    captain: read.captain,
    where: { why: available.why, words: available.where },
    injury: read.injury?.name ?? null,
    xp: read.xp,
    traits: read.traits,
    fee: read.transferFee,
    areas,
    gear: read.gear.map(({ slot, item }) => ({
      slot: slot as SlotKey,
      slotName: capitalised(slot),
      item: item?.name ?? 'None',
      modifies: item?.modifies ?? '',
      worn: item !== null,
      definitionKey: item?.definitionKey ?? null,
      unique: item?.unique ?? false,
    })),
    skills: read.skills.map(({ name, rating }) => ({ name, rating })),
    relationships:
      read.relationships?.map(({ name, className, regard, relationship }) => ({
        name,
        className,
        regard,
        relationship,
        neutral: regard === 'neutral' && relationship === 'neutral',
      })) ?? null,
    milestones: linesOf(
      newestEntries(history, hero.id, (entry) => entry.milestone),
      reading.narration,
    ),
    actions: heroActions(hero, read, reading, document),
  };
}

/**
 * Each of a Hero's Stats as a Check reads it beside its base, keyed by Stat: the engine's
 * `statBreakdown` (the Guildmaster's Class bonus, the Hero's gear and their Hero Traits' Stat
 * changes applied), what the Party builder shows, as a Hero's page does.
 */
function statValues(hero: Hero, world: World): Map<string, { base: number; effective: number }> {
  return new Map(Object.entries(statBreakdown(hero, world, content)).map(([key, { base, effective }]) => [key, { base, effective }]));
}

/**
 * What the player can do with `hero`, read as `read`: recruit them from the pool for the signing fee,
 * take them in from another Guild's Roster for the Transfer fee, the fees the reading's (DL-241); or,
 * on the player's Roster, equip, unequip, transfer them out and name them Captain (DL-289).
 */
function heroActions(hero: Hero, read: HeroReading, reading: PageReading, document: WorldDocument): HeroActions | null {
  const { world, deps, guild: player } = reading;
  if (player === undefined) return null;
  if (read.signing !== null) {
    const { fee, signs } = read.signing;
    return { kind: 'pool', fee, signs: signsWords(signs), willSign: signs.willSign };
  }
  if (read.transferFee !== null) return { kind: 'rival', guildName: read.guild?.name ?? '', fee: read.transferFee };
  if (read.guild?.id !== player.id || read.relationships === null) return null;
  return {
    kind: 'own',
    equip: gearChoices(world, player),
    captaincy: captaincyOf(hero, read, reading, document),
    transferTo: Object.values(world.guilds)
      .filter((other) => other.id !== player.id && other.foldedOnTurn === null)
      .map((other) => {
        const fee = transferFee(hero, guildmasterOf(other, world), deps);
        const sentence = `${other.name} would pay ${fee} Wealth for ${hero.name}, if it is willing to take them. ${transferCostWords}`;
        return { guildId: other.id, name: other.name, fee, sentence };
      }),
  };
}

/**
 * The Captain's post as `hero`, of the player's Roster, meets it: that they are the Captain, or what naming
 * them does (`namingWords`) and, while the post is locked, the refusal's sentence for it (DL-289).
 */
function captaincyOf(hero: Hero, read: HeroReading, reading: PageReading, document: WorldDocument): Captaincy {
  const post = captainPost(reading);
  if (post === null || read.captain) return { is: read.captain, words: `${hero.name} is ${reading.guild?.name ?? 'the Guild'}'s Captain.`, locked: null };
  const { lock, captain } = post;
  return {
    is: false,
    words: namingWords(post, hero.name),
    locked:
      lock === null || captain === null
        ? null
        : rejectionSentence({ action: 'nameCaptain', reason: 'captain-locked', captainId: captain.id, ...lock }, document, content),
  };
}

/** The gear `guild` holds itself, unique Items then stacks: what `equip` can put on a Hero. */
function gearChoices(world: World, guild: Guild): GearChoice[] {
  const held = holdings(world, { kind: 'guild', id: guild.id });
  const rows: { id: string; definitionKey: ItemDefinitionKey; gear: GearChoice['gear'] }[] = [
    ...held.items.map((item) => ({ id: item.id, definitionKey: item.definitionKey, gear: { itemId: item.id } })),
    ...held.stacks.map((stack) => ({ id: stack.id, definitionKey: stack.definitionKey, gear: { stackId: stack.id } })),
  ];
  return rows.flatMap(({ id, definitionKey, gear }): GearChoice[] => {
    const definition = itemDefinition(content, definitionKey);
    if (definition?.kind !== 'gear') return [];
    return [
      {
        key: id,
        name: definition.name,
        kind: kindWords(definition),
        modifies: modifierWords(definition, content),
        definitionKey,
        unique: definition.unique,
        gear,
      },
    ];
  });
}

// ── Time ─────────────────────────────────────────────────────────────────────────────────────

export interface StopView {
  /** The engine's reason, or `player` for the player's Stop, the page's own (v1.0.1-S5, DL-96). */
  kind: StopReason['kind'] | 'player';
  sentence: string;
  /** After the player's Stop, the stops the fast forward was asked for, which "Fast forward again" asks for again. */
  until?: readonly StopCondition[];
  /**
   * For a decision needed, each Quest the stop names that is still on the Board, in the stop's
   * order and as the Board names it: the home view makes each a button to its Party (M9-S3, DL-103).
   */
  quests?: readonly StopQuest[];
}

/** A Quest a stop names, as the Board names it, with its reward to tell two of a name apart. */
export interface StopQuest {
  questId: QuestId;
  name: string;
  patron: string;
  reward: number;
}

/**
 * Why the last advance or fast forward stopped, in words, the player's Stop among them; `null`
 * when the last play was neither, and while a fast forward is between its steps.
 */
export function stopView(state: GameState): StopView | null {
  const { document, stoppedBecause, stopped } = state;
  if (document === null) return null;
  // Between steps, so after a step's Turns: never fewer than one.
  if (stopped !== null) return { kind: 'player', sentence: `Stopped: you asked to stop, after ${stopped.turnsPlayed} Turns.`, until: stopped.until };
  if (stoppedBecause === null) return null;
  const reading = readingOf(document);
  const sentence = stopText(stoppedBecause, document, reading.deps.config.turnsPerYear, reading.narration);
  if (stoppedBecause.kind !== 'decision-needed' && stoppedBecause.kind !== 'quest-staffable') return { kind: stoppedBecause.kind, sentence };
  const board = boardView(document);
  const quests = stoppedBecause.questIds.flatMap((questId): StopQuest[] => {
    const card = board.find((each) => each.questId === questId);
    return card === undefined ? [] : [{ questId, name: card.name, patron: card.patron, reward: card.reward }];
  });
  return { kind: stoppedBecause.kind, sentence, quests };
}

export interface ProgressView {
  /** `Played 90 Turns so far. Now Year 1 Day 31, morning.`: the Turns played and the date reached. */
  sentence: string;
  /** The Bankruptcy countdown while the player's Guild is below the floor (`countdownView`); `null` otherwise. */
  countdown: string | null;
}

/**
 * How far a fast forward has come, between its steps (v1.0.1-S5, DL-96): the Turns its steps have
 * played, and from the game its last step left, which the page holds until it ends, the Day they
 * reached and the countdown while the player's Guild is below the floor; `null` while none is
 * under way.
 */
export function progressView(state: GameState): ProgressView | null {
  const { forwarding } = state;
  if (forwarding === null) return null;
  const { document } = forwarding;
  const { turn } = document.world;
  const { calendar } = readingOf(document);
  return {
    sentence: `Played ${forwarding.turnsPlayed} Turns so far. Now ${whenOfTurn(turn, calendar)}.`,
    countdown: countdownView(document),
  };
}

// ── A new game ───────────────────────────────────────────────────────────────────────────────

/** The Guild Backgrounds a new game may choose from (the CLI's `new --background`). */
export function guildBackgrounds(set: ContentSet = content): { key: string; name: string }[] {
  return Object.values(set.backgrounds)
    .filter((row) => row.owner === 'guild')
    .map((row) => ({ key: row.key, name: row.name }));
}

/** A Guildmaster Trait the new-game form offers (M9-S2): what it does, its cost, and what it excludes. */
export interface TraitChoice {
  key: TraitKey;
  name: string;
  /** What it does, in the Guildmaster's page's words: `Upkeep ×0.9`. */
  effect: string;
  /** Its cost against the budget: a buff's positive, a penalty's negative, a refund. */
  cost: number;
  /** The Guildmaster Traits it cannot be held with, in key order. */
  excludes: { key: TraitKey; name: string }[];
}

/** The rules the new-game form sets the Guildmaster up within (M9-S2, R8, DL-100 item 3). */
export interface GuildmasterSetupChoices {
  sexes: readonly Sex[];
  /** The starting ages, whole years, both included. */
  ageMin: number;
  ageMax: number;
  /** `guildmasterRetirementAge`: the age a Guildmaster retires at, which the form says (DL-113 item 5). */
  retirementAge: number;
  /** `guildmasterTraitBudget`: the most the Traits chosen may cost in all. */
  traitBudget: number;
  /** `guildmasterTraitsMax`: the most Traits chosen. */
  traitsMax: number;
  /** Every Guildmaster Trait, in key order. */
  traits: TraitChoice[];
  /** The descriptive Attributes, in the order they are shown, each with its bound in characters. */
  attributes: { attribute: DescriptiveAttribute; label: string; maxLength: number }[];
}

/**
 * What the new-game form offers for the Guildmaster (M9-S2, the CLI's `new` flags): the sexes, the
 * starting ages, the Trait budget and the most Traits under `config` (the current defaults, the
 * rules a new game begins under), each Guildmaster Trait of `set` with its effect, cost and
 * exclusions, and the descriptive Attributes with their bounds. The form's check is the engine's,
 * through `newGameRefusal`; this only says what there is to choose.
 */
export function guildmasterSetupChoices(set: ContentSet = content, config: GameConfig = defaultConfig): GuildmasterSetupChoices {
  const traits = guildmasterTraitsOf(set);
  return {
    sexes,
    ageMin: config.guildmasterStartingAgeMin,
    ageMax: config.guildmasterStartingAgeMax,
    retirementAge: config.guildmasterRetirementAge,
    traitBudget: config.guildmasterTraitBudget,
    traitsMax: config.guildmasterTraitsMax,
    traits: traits.map((trait) => ({
      key: trait.key,
      name: trait.name,
      effect: traitEffectWords(trait.effects, set),
      cost: trait.cost,
      excludes: [...trait.excludes].sort(compareByCodeUnit).map((key) => ({ key, name: nameIn(set.guildmasterTraits, key) })),
    })),
    attributes: descriptiveAttributes.map((attribute) => ({
      attribute,
      label: descriptiveAttributeLabels[attribute],
      maxLength: descriptiveAttributeMaxLength[attribute],
    })),
  };
}

/**
 * What the Traits `chosen` cost (`guildmasterTraitCost`, the engine's sum) and how much of the
 * budget is left, negative when they pass it (M9-S2): the form's running total.
 */
export function traitBudgetView(
  chosen: readonly TraitKey[],
  set: ContentSet = content,
  config: GameConfig = defaultConfig,
): { spent: number; left: number } {
  const spent = guildmasterTraitCost(chosen, set);
  return { spent, left: config.guildmasterTraitBudget - spent };
}
