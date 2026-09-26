// The play sweep's counters (M2-S12), each read from a document's History through its index by
// type, `history.byType`, never by scanning every entry, and joined to the World State only for
// the Guild an entry names. M2-S9 added the first, the Quests taken by each kind of controller,
// which shows how contested the Board is (DL-30); M2-S12 adds the rest (DL-34).
//
// M3's counters (the epic's §2, DL-40) add Levels and declines per Guild-year, Retirements by age,
// growth against decline, and the Improvement grades reached by year 10, from the History as
// before; and two the History cannot give, read from the World State while the game is played
// (`observe`): how many pool Heroes refuse each Guild for its Fame each morning, and the Rosters'
// Levels and Heroes at Potential as each year begins.
//
// M4's counters (the epic's §2, DL-55) add, from the History, the Encounters' outcomes by kind, the
// Synergies each Quest applied, Injuries by type and the Patrons silent in a year; and, from the
// World State as year 10 begins, the Relationships within the player's Roster and its
// Guildmaster's Regard, by band, which the History records only as band crossings.
//
// M5's counters (the epic's §2, DL-62) add, from the History, the Wealth each kind of Guild spent by
// category and took from Quests and the Market, the Loot awarded by table, the consumables carried
// and expended, and the gear moved; and, joined to the difficulty of each Quest the player's Guild
// took, which no entry records and the play loop reads as it dispatches, the player's Loot by the
// difficulty of the Quest that won it.

import {
  baseStat,
  encounterKinds,
  facilityKeys,
  isId,
  playerGuild,
  questBands,
  regardBandCounts,
  regardBandNames,
  relationshipBandCounts,
  timeOfDay,
  unsignableHeroes,
  yearOf,
  type Controller,
  type EncounterKind,
  type EncounterOutcome,
  type EndingReason,
  type EngineDeps,
  type Entry,
  type EventType,
  type FacilityKey,
  type GearReturnCause,
  type Guild,
  type GuildId,
  type Hero,
  type ItemSaleCause,
  type QuestBand,
  type RegardBand,
  type RegardMap,
  type World,
  type WorldDocument,
} from '@heroesim/engine';

/** Whose choices a Guild's are: the player's or a Rival's Disposition's (ADR-0002). */
export type ControllerKind = Controller['kind'];

export const controllerKinds = ['player', 'rival'] as const satisfies readonly ControllerKind[];

/** Every way a Guild's game ends (M2-S10), in the order the endings are checked. */
export const endingReasons = ['retirement', 'bankruptcy', 'roster-wiped'] as const satisfies readonly EndingReason[];

/** A count for each kind of controller. */
export type ByController = Record<ControllerKind, number>;

const byController = (): ByController => ({ player: 0, rival: 0 });

/** An entry and its position in the History, which is its sequence number. */
interface Positioned {
  entry: Entry;
  position: number;
}

/** The entries of `type` with their positions, oldest first, read through `history.byType`. */
function positionedEntriesOf({ history }: WorldDocument, type: EventType): Positioned[] {
  const found: Positioned[] = [];
  for (const position of history.byType[type] ?? []) {
    const entry = history.entries[position];
    if (entry === undefined) throw new Error(`byType["${type}"] names position ${position}, outside the History`);
    found.push({ entry, position });
  }
  return found;
}

/** The entries of `type`, oldest first, read through `history.byType`. */
function entriesOf(document: WorldDocument, type: EventType): Entry[] {
  return positionedEntriesOf(document, type).map(({ entry }) => entry);
}

/** `field` of an entry's payload, or `undefined` when the payload has none. */
function payloadField(entry: Entry, field: string): unknown {
  const { payload } = entry;
  return typeof payload === 'object' && payload !== null ? Reflect.get(payload, field) : undefined;
}

/**
 * The Guild an entry is about: its payload's `guildId`, or else the first Guild among its
 * participants, where `emit` puts the Guild of any Hero it names at the time (DL-24 item 3), so a
 * Hero's Injury counts for the Guild they were on then, whatever became of them since. The row is
 * read from the World State, whose Guild rows are never removed (DL-27).
 *
 * @throws Error on an entry naming no Guild the world holds: the document is not one the engine made
 */
function guildOf(document: WorldDocument, entry: Entry, position: string): Guild {
  const { guilds } = document.world;
  const fromPayload = payloadField(entry, 'guildId');
  const guildId: unknown = isId('guilds', fromPayload)
    ? fromPayload
    : entry.participants.find((participant) => isId('guilds', participant));
  const guild = isId('guilds', guildId) && Object.hasOwn(guilds, guildId) ? guilds[guildId as GuildId] : undefined;
  if (guild === undefined) throw new Error(`${entry.type} entry ${position} names no Guild in the world`);
  return guild;
}

/** The entries of `type` counted by the kind of controller of the Guild each is about. */
function countByController(document: WorldDocument, type: EventType): ByController {
  const counts = byController();
  entriesOf(document, type).forEach((entry, index) => {
    counts[guildOf(document, entry, `${index}`).controller.kind] += 1;
  });
  return counts;
}

/**
 * The Quests taken in `document`'s History, one per `quest.taken` entry, counted by the kind of
 * controller of the Guild that took each, which the entry's payload names.
 *
 * @throws Error on an entry naming no Guild the world holds: the document is not one the engine made
 */
export function questsTakenByController(document: WorldDocument): ByController {
  return countByController(document, 'quest.taken');
}

/** The year M3's counters read at: "after 10 years" and "by year 10" (the epic's §2, DL-40). */
export const countedYear = 10;

/** A number for each year of the game, year 0 (the first) first, for each kind of controller. */
export type ByYear = Record<ControllerKind, number[]>;

/**
 * The Levels a kind of Guild's Heroes gained before and after the first decline on its Roster
 * (M3-S4's third box, DL-40), over the Guilds on whose Roster a Hero declined at least once.
 */
export interface GrowthAgainstDecline {
  /** Guilds on whose Roster a Hero declined at least once. */
  guilds: number;
  /** Those Guilds' years in play before their first decline, and the Levels gained in them. */
  guildYearsBefore: number;
  levelsBefore: number;
  /** Their years in play from the first decline on, and the Levels gained in them. */
  guildYearsAfter: number;
  levelsAfter: number;
  /** The Stat points those later Levels added (`statDeltas`), and the points declines took. */
  pointsGrownAfter: number;
  pointsDeclinedAfter: number;
}

/** For each facility, how many Guilds reached each grade: index 0, never built, first. */
export type GradeCounts = Record<FacilityKey, number[]>;

/** Everything a harness game's History is counted by (M2-S12's counters, DL-34; M3's, DL-40). */
export interface GameCounters {
  questsTaken: ByController;
  /** `quest.resolved` by the resolving Guild's controller, then by band. */
  questsResolved: Record<ControllerKind, Record<QuestBand, number>>;
  heroesInjured: ByController;
  heroesDied: ByController;
  heroesRecruited: ByController;
  heroesRetired: ByController;
  /** `guild.folded`, by the reason the Rival reached its ending. */
  rivalFolds: Record<EndingReason, number>;
  /** `game.ended`'s reason, or `null` when the player's game has not ended. */
  ending: EndingReason | null;
  /** The Turn the game ended on, or the world's Turn when it has not. */
  lastTurn: number;
  /**
   * The years each kind of Guild was in play in each year of the game, summed over its Guilds: a
   * Guild is in play from its `foundedTurn` until it folds or the game stops. The denominator of
   * every per-Guild-year counter.
   */
  guildYears: ByYear;
  /** `hero.levelled`, by the controller of the Guild it names and the year of its Turn. */
  levelsGained: ByYear;
  /** `hero.declined`, likewise; the Guild is the one `emit` named beside the Hero. */
  declines: ByYear;
  /** `hero.retired`, by controller, then by the age retired at. */
  retirementAges: Record<ControllerKind, Record<string, number>>;
  growthAgainstDecline: Record<ControllerKind, GrowthAgainstDecline>;
  /**
   * The Guilds founded before year `countedYear` (`guild.founded`, replacement Rivals included), by
   * controller, counted by the highest grade each facility reached before it (`guild.improved`);
   * `null` for a game that stopped before year `countedYear` (DL-38 item 15).
   */
  improvementGrades: Record<ControllerKind, GradeCounts> | null;
  // M4's (DL-55).
  /** `quest.encounter`, by the controller of the Guild it names, then by the Encounter's kind. */
  encounters: Record<ControllerKind, EncounterCounts>;
  /** `quest.resolved`'s `synergyKeys`, by the controller of the resolving Guild. */
  synergies: Record<ControllerKind, SynergyTally>;
  /** `hero.injured`, by the controller of the Hero's Guild then, then by the Injury type's key. */
  injuriesByType: Record<ControllerKind, Record<string, number>>;
  /** For each year played in full, 0 first, the Patrons in the world as it began. */
  patronYears: number[];
  /** Of those, the Patrons that offered no Quest in the year (no `quest.offered` naming them). */
  silentPatronYears: number[];
  // M5's (DL-62).
  /** Wealth spent by category, and taken from Quests and the Market, by the controller of the Guild. */
  wealth: Record<ControllerKind, WealthFlows>;
  /** `quest.loot` by the controller of the Guild awarded, then by the table drawn from. */
  loot: Record<ControllerKind, Record<string, LootTally>>;
  /** The consumables Parties carried and expended, by the controller of the Party's Guild. */
  consumables: Record<ControllerKind, ConsumableTally>;
  /** Gear moved between a Hero's slots and the Guild's holding, by controller. */
  gear: Record<ControllerKind, GearTally>;
  /**
   * The player's resolved Quests whose difficulty the play loop recorded at dispatch, by the
   * difficulty's band of `difficultyBandWidth` (index 0 is 0 to 9), and by the year resolved in;
   * `null` when no difficulties were given.
   */
  playerQuestsByDifficulty: DifficultyTally[] | null;
  playerQuestsByYear: DifficultyTally[] | null;
}

// ── M5's shapes (DL-62) ─────────────────────────────────────────────────────────────────────

/** Why Items went to the Market (M5-S4): a sale, or a folding Guild's (DL-51). */
export const saleCauses = ['sale', 'fold'] as const satisfies readonly ItemSaleCause[];

/** Why gear went back to a Guild without an `unequip` (M5-S2, DL-49), or to the selling Guild with a transferred Hero (M6-S2, DL-57). */
export const gearReturnCauses = ['died', 'retired', 'guild-folded', 'transferred'] as const satisfies readonly GearReturnCause[];

/** What a consumable did when it was expended (M5-S3, DL-50). */
export const consumableEffects = ['bonus', 'reroll', 'heal'] as const;

export type ConsumableEffectName = (typeof consumableEffects)[number];

/**
 * A kind of Guild's Wealth: spent on signing fees (`hero.recruited`'s `fee`), Items bought from the
 * Market (`item.bought`'s `cost`), Improvements (`guild.improved`'s `cost`) and Upkeep
 * (`guild.upkeep-paid`'s `amount`); taken from Quests (`quest.resolved`'s `wealthDelta`) and from
 * the Market (`item.sold`'s `proceeds`, by its `cause`). Transfers have no event until M6.
 */
export interface WealthFlows {
  signing: number;
  items: number;
  /** The Items `item.bought` moved, summed over its `quantity`. */
  itemsBought: number;
  improvements: number;
  upkeep: number;
  questRewards: number;
  sales: Record<ItemSaleCause, number>;
  /** The Items `item.sold` moved, by cause. */
  itemsSold: Record<ItemSaleCause, number>;
}

/** One Loot table's awards (M5-S5): how many, how many Items they gave, and how many were unique. */
export interface LootTally {
  awards: number;
  /** The Items awarded, summed over each award's `quantity`. */
  items: number;
  /** Awards of a unique Item (`itemId` not null), counted apart as well as among `awards`. */
  unique: number;
}

/** A kind of Guild's consumables (M5-S3). */
export interface ConsumableTally {
  /** Quests resolved (`quest.resolved`), the denominator. */
  quests: number;
  /** Items the Parties carried from the Guild's holding (`quest.taken`'s `consumables`, by quantity). */
  carried: number;
  /** Items expended, one `item.expended` each. */
  expended: number;
  /** The Quests on which one or more was expended. */
  questsWithAny: number;
  byEffect: Record<ConsumableEffectName, number>;
  /** Items expended, by definition. */
  byDefinition: Record<string, number>;
}

/** A kind of Guild's gear moves (M5-S2): `item.equipped`, `item.unequipped`, `item.returned` by cause. */
export interface GearTally {
  equipped: number;
  unequipped: number;
  returned: Record<GearReturnCause, number>;
}

/** The player's Quests in a band of difficulty, or a year: resolved, strong, their difficulty summed, and the Loot they won. */
export interface DifficultyTally {
  quests: number;
  difficulty: number;
  strong: number;
  /** `quest.loot` awards, and the unique among them. */
  loot: number;
  unique: number;
}

/** The width of the player's difficulty bands (M5-S5's third box): 0 to 9, 10 to 19, and so on. */
export const difficultyBandWidth = 10;

export const noWealth = (): WealthFlows => ({
  signing: 0,
  items: 0,
  itemsBought: 0,
  improvements: 0,
  upkeep: 0,
  questRewards: 0,
  sales: { sale: 0, fold: 0 },
  itemsSold: { sale: 0, fold: 0 },
});

export const noConsumables = (): ConsumableTally => ({
  quests: 0,
  carried: 0,
  expended: 0,
  questsWithAny: 0,
  byEffect: { bonus: 0, reroll: 0, heal: 0 },
  byDefinition: {},
});

export const noGear = (): GearTally => ({ equipped: 0, unequipped: 0, returned: { died: 0, retired: 0, 'guild-folded': 0, transferred: 0 } });

export const noDifficulty = (): DifficultyTally => ({ quests: 0, difficulty: 0, strong: 0, loot: 0, unique: 0 });

/** The two outcomes of an Encounter's Check (M4-S2). */
export const encounterOutcomes = ['success', 'failure'] as const satisfies readonly EncounterOutcome[];

/** One kind of Encounter's Checks: how many went each way, and the harm their consequences did. */
export interface EncounterTally extends Record<EncounterOutcome, number> {
  /** Heroes its consequences injured (the entries' `injured`), and killed (`died`). */
  injured: number;
  died: number;
}

export type EncounterCounts = Record<EncounterKind, EncounterTally>;

/** The Synergies a kind of Guild's resolved Quests applied (M4-S3, DL-45). */
export interface SynergyTally {
  /** Quests resolved. */
  quests: number;
  /** Those that applied at least one Synergy. */
  withAny: number;
  /** Synergies applied, summed over the Quests: each Quest names a Synergy once. */
  applied: number;
  /** How many Quests applied each Synergy, by its key. */
  byKey: Record<string, number>;
}

const noEncounters = (): EncounterCounts =>
  Object.fromEntries(encounterKinds.map((kind) => [kind, { success: 0, failure: 0, injured: 0, died: 0 }])) as EncounterCounts;

const noSynergies = (): SynergyTally => ({ quests: 0, withAny: 0, applied: 0, byKey: {} });

/** A count for each ending. */
function byReason(): Record<EndingReason, number> {
  return { retirement: 0, bankruptcy: 0, 'roster-wiped': 0 };
}

function isReason(value: unknown): value is EndingReason {
  return (endingReasons as readonly unknown[]).includes(value);
}

function isBand(value: unknown): value is QuestBand {
  return (questBands as readonly unknown[]).includes(value);
}

function isFacility(value: unknown): value is FacilityKey {
  return (facilityKeys as readonly unknown[]).includes(value);
}

const byYear = (): ByYear => ({ player: [], rival: [] });

/** Adds `amount` to `series[index]`, lengthening the series with zeros to reach it. */
function addAt(series: number[], index: number, amount: number): void {
  while (series.length <= index) series.push(0);
  series[index] = (series[index] ?? 0) + amount;
}

/** Lengthens each series of `counts` with zeros to `years`. */
function padTo(counts: ByYear, years: number): ByYear {
  for (const kind of controllerKinds) {
    while (counts[kind].length < years) counts[kind].push(0);
  }
  return counts;
}

/** The Turn a Guild stops being in play: the Turn it folded, or the game's last. */
function inPlayUntil(guild: Guild, lastTurn: number): number {
  return Math.min(guild.foldedOnTurn ?? lastTurn, lastTurn);
}

/** Adds to `series` the part of each year that the Turns from `from` up to `to` cover. */
function addGuildYears(series: number[], from: number, to: number, turnsPerYear: number): void {
  for (let year = Math.floor(from / turnsPerYear); year * turnsPerYear < to; year += 1) {
    const covered = Math.min(to, (year + 1) * turnsPerYear) - Math.max(from, year * turnsPerYear);
    if (covered > 0) addAt(series, year, covered / turnsPerYear);
  }
}

function noGrowth(): GrowthAgainstDecline {
  return {
    guilds: 0,
    guildYearsBefore: 0,
    levelsBefore: 0,
    guildYearsAfter: 0,
    levelsAfter: 0,
    pointsGrownAfter: 0,
    pointsDeclinedAfter: 0,
  };
}

/** The sum of a `hero.levelled` entry's `statDeltas`. */
function pointsGrown(entry: Entry, index: number): number {
  const deltas = payloadField(entry, 'statDeltas');
  if (typeof deltas !== 'object' || deltas === null) throw new Error(`hero.levelled entry ${index} has no statDeltas`);
  let sum = 0;
  for (const delta of Object.values(deltas)) {
    if (typeof delta !== 'number') throw new Error(`hero.levelled entry ${index} has a statDelta that is not a number`);
    sum += delta;
  }
  return sum;
}

/**
 * Levels and declines by controller and year, and the Levels gained on each Roster before and after
 * its first decline: an entry counts as after when it stands at or after that decline in the
 * History, so a Level gained on the night of the first decline, whose `levelUps` runs before
 * `ageing`, counts as before.
 */
function progressionCounters(
  document: WorldDocument,
  turnsPerYear: number,
  lastTurn: number,
): Pick<GameCounters, 'levelsGained' | 'declines' | 'growthAgainstDecline'> {
  const year = (entry: Entry): number => yearOf(entry.turn, { turnsPerYear });
  const declines = byYear();
  const growth: Record<ControllerKind, GrowthAgainstDecline> = { player: noGrowth(), rival: noGrowth() };
  const firstDecline = new Map<GuildId, Positioned>();
  positionedEntriesOf(document, 'hero.declined').forEach(({ entry, position }, index) => {
    const guild = guildOf(document, entry, `${index}`);
    const kind = guild.controller.kind;
    addAt(declines[kind], year(entry), 1);
    const delta = payloadField(entry, 'delta');
    if (typeof delta !== 'number') throw new Error(`hero.declined entry ${index} has no delta`);
    growth[kind].pointsDeclinedAfter -= delta;
    if (!firstDecline.has(guild.id)) firstDecline.set(guild.id, { entry, position });
  });

  const levelsGained = byYear();
  positionedEntriesOf(document, 'hero.levelled').forEach(({ entry, position }, index) => {
    const guild = guildOf(document, entry, `${index}`);
    const kind = guild.controller.kind;
    addAt(levelsGained[kind], year(entry), 1);
    const first = firstDecline.get(guild.id);
    if (first === undefined) return;
    if (position < first.position) {
      growth[kind].levelsBefore += 1;
    } else {
      growth[kind].levelsAfter += 1;
      growth[kind].pointsGrownAfter += pointsGrown(entry, index);
    }
  });

  for (const [guildId, { entry }] of firstDecline) {
    const guild = document.world.guilds[guildId] as Guild;
    const counts = growth[guild.controller.kind];
    counts.guilds += 1;
    counts.guildYearsBefore += (entry.turn - guild.foundedTurn) / turnsPerYear;
    counts.guildYearsAfter += (inPlayUntil(guild, lastTurn) - entry.turn) / turnsPerYear;
  }
  return { levelsGained, declines, growthAgainstDecline: growth };
}

/** A grade count for each facility, as long as content's grades of it go, all zero. */
function noGrades(content: EngineDeps['content']): GradeCounts {
  const top = (facility: FacilityKey): number =>
    Object.values(content.improvements).reduce((most, row) => (row.facility === facility ? Math.max(most, row.grade) : most), 0);
  return Object.fromEntries(facilityKeys.map((facility) => [facility, Array.from({ length: top(facility) + 1 }, () => 0)])) as GradeCounts;
}

/**
 * The Guilds founded before year `countedYear`, by controller, counted by the highest grade each
 * facility reached before it; `null` when the game stopped before it (DL-38 item 15).
 */
function improvementGrades(document: WorldDocument, deps: EngineDeps, lastTurn: number): Record<ControllerKind, GradeCounts> | null {
  const cutoff = countedYear * deps.config.turnsPerYear;
  if (lastTurn < cutoff) return null;
  const highest = new Map<string, number>();
  entriesOf(document, 'guild.improved').forEach((entry, index) => {
    if (entry.turn >= cutoff) return;
    const guild = guildOf(document, entry, `${index}`);
    const facility = payloadField(entry, 'facility');
    const grade = payloadField(entry, 'grade');
    if (!isFacility(facility) || typeof grade !== 'number') throw new Error(`guild.improved entry ${index} has no facility or grade`);
    const key = `${guild.id} ${facility}`;
    highest.set(key, Math.max(highest.get(key) ?? 0, grade));
  });

  const grades = { player: noGrades(deps.content), rival: noGrades(deps.content) };
  const founded = new Set<GuildId>();
  entriesOf(document, 'guild.founded').forEach((entry, index) => {
    if (entry.turn >= cutoff) return;
    const guild = guildOf(document, entry, `${index}`);
    if (founded.has(guild.id)) return;
    founded.add(guild.id);
    for (const facility of facilityKeys) {
      addAt(grades[guild.controller.kind][facility], highest.get(`${guild.id} ${facility}`) ?? 0, 1);
    }
  });
  return grades;
}

// ── M4's counters from the History (DL-55) ──────────────────────────────────────────────────

function isEncounterKind(value: unknown): value is EncounterKind {
  return (encounterKinds as readonly unknown[]).includes(value);
}

function isEncounterOutcome(value: unknown): value is EncounterOutcome {
  return (encounterOutcomes as readonly unknown[]).includes(value);
}

/** The length of an entry's payload list `field`. */
function listLength(entry: Entry, field: string, what: string): number {
  const list = payloadField(entry, field);
  if (!Array.isArray(list)) throw new Error(`${what} has no ${field} list`);
  return list.length;
}

/** `quest.encounter` by controller and kind: each Check's outcome, and whom its consequences harmed. */
function encounterCounters(document: WorldDocument): Record<ControllerKind, EncounterCounts> {
  const counts = { player: noEncounters(), rival: noEncounters() };
  entriesOf(document, 'quest.encounter').forEach((entry, index) => {
    const what = `quest.encounter entry ${index}`;
    const kind = payloadField(entry, 'kind');
    const outcome = payloadField(entry, 'outcome');
    if (!isEncounterKind(kind) || !isEncounterOutcome(outcome)) throw new Error(`${what} has no kind or outcome`);
    const tally = counts[guildOf(document, entry, `${index}`).controller.kind][kind];
    tally[outcome] += 1;
    tally.injured += listLength(entry, 'injured', what);
    tally.died += listLength(entry, 'died', what);
  });
  return counts;
}

/** `quest.resolved`'s `synergyKeys` by controller: an entry without them applied none (DL-45). */
function synergyCounters(document: WorldDocument): Record<ControllerKind, SynergyTally> {
  const counts = { player: noSynergies(), rival: noSynergies() };
  entriesOf(document, 'quest.resolved').forEach((entry, index) => {
    const keys = payloadField(entry, 'synergyKeys') ?? [];
    if (!Array.isArray(keys) || !keys.every((key) => typeof key === 'string')) {
      throw new Error(`quest.resolved entry ${index} has synergyKeys that are not a list of keys`);
    }
    const tally = counts[guildOf(document, entry, `${index}`).controller.kind];
    tally.quests += 1;
    if (keys.length > 0) tally.withAny += 1;
    tally.applied += keys.length;
    for (const key of keys as string[]) tally.byKey[key] = (tally.byKey[key] ?? 0) + 1;
  });
  return counts;
}

/** `hero.injured` by the controller of the Hero's Guild then (`guildOf`), and the Injury type. */
function injuryCounters(document: WorldDocument): Record<ControllerKind, Record<string, number>> {
  const counts: Record<ControllerKind, Record<string, number>> = { player: {}, rival: {} };
  entriesOf(document, 'hero.injured').forEach((entry, index) => {
    const typeKey = payloadField(entry, 'typeKey');
    if (typeof typeKey !== 'string') throw new Error(`hero.injured entry ${index} has no typeKey`);
    const byType = counts[guildOf(document, entry, `${index}`).controller.kind];
    byType[typeKey] = (byType[typeKey] ?? 0) + 1;
  });
  return counts;
}

/**
 * For each year played in full (its last Turn reached by `lastTurn`), the Patrons generated by the
 * Turn it began (`patron.generated`), and how many of them no `quest.offered` of the year names.
 */
function patronSilence(
  document: WorldDocument,
  turnsPerYear: number,
  lastTurn: number,
): Pick<GameCounters, 'patronYears' | 'silentPatronYears'> {
  const fullYears = Math.floor(lastTurn / turnsPerYear);
  const generatedOn = new Map<string, number>();
  entriesOf(document, 'patron.generated').forEach((entry, index) => {
    const patronId = payloadField(entry, 'patronId');
    if (typeof patronId !== 'string') throw new Error(`patron.generated entry ${index} has no patronId`);
    generatedOn.set(patronId, entry.turn);
  });
  const offered = Array.from({ length: fullYears }, () => new Set<string>());
  entriesOf(document, 'quest.offered').forEach((entry, index) => {
    const patronId = payloadField(entry, 'patronId');
    if (typeof patronId !== 'string') throw new Error(`quest.offered entry ${index} has no patronId`);
    offered[Math.floor(entry.turn / turnsPerYear)]?.add(patronId);
  });
  const patronYears = Array.from({ length: fullYears }, () => 0);
  const silentPatronYears = Array.from({ length: fullYears }, () => 0);
  for (let year = 0; year < fullYears; year += 1) {
    for (const [patronId, turn] of generatedOn) {
      if (turn > year * turnsPerYear) continue;
      patronYears[year] = (patronYears[year] ?? 0) + 1;
      if (!offered[year]?.has(patronId)) silentPatronYears[year] = (silentPatronYears[year] ?? 0) + 1;
    }
  }
  return { patronYears, silentPatronYears };
}

// ── M5's counters from the History (DL-62) ──────────────────────────────────────────────────

/** A number field of an entry's payload. */
function numberField(entry: Entry, field: string, what: string): number {
  const value = payloadField(entry, field);
  if (typeof value !== 'number') throw new Error(`${what} has no ${field}`);
  return value;
}

function isSaleCause(value: unknown): value is ItemSaleCause {
  return (saleCauses as readonly unknown[]).includes(value);
}

function isReturnCause(value: unknown): value is GearReturnCause {
  return (gearReturnCauses as readonly unknown[]).includes(value);
}

function isEffect(value: unknown): value is ConsumableEffectName {
  return (consumableEffects as readonly unknown[]).includes(value);
}

/** Wealth spent and taken by category, by the controller of the Guild each entry names. */
function wealthCounters(document: WorldDocument): Record<ControllerKind, WealthFlows> {
  const flows = { player: noWealth(), rival: noWealth() };
  const each = (type: EventType, apply: (into: WealthFlows, entry: Entry, what: string) => void): void => {
    entriesOf(document, type).forEach((entry, index) => {
      apply(flows[guildOf(document, entry, `${index}`).controller.kind], entry, `${type} entry ${index}`);
    });
  };
  each('hero.recruited', (into, entry, what) => {
    into.signing += numberField(entry, 'fee', what);
  });
  each('item.bought', (into, entry, what) => {
    into.items += numberField(entry, 'cost', what);
    into.itemsBought += numberField(entry, 'quantity', what);
  });
  each('guild.improved', (into, entry, what) => {
    into.improvements += numberField(entry, 'cost', what);
  });
  each('guild.upkeep-paid', (into, entry, what) => {
    into.upkeep += numberField(entry, 'amount', what);
  });
  each('quest.resolved', (into, entry, what) => {
    into.questRewards += numberField(entry, 'wealthDelta', what);
  });
  each('item.sold', (into, entry, what) => {
    const cause = payloadField(entry, 'cause');
    if (!isSaleCause(cause)) throw new Error(`${what} has no cause`);
    into.sales[cause] += numberField(entry, 'proceeds', what);
    into.itemsSold[cause] += numberField(entry, 'quantity', what);
  });
  return flows;
}

/** `quest.loot` by controller and `lootTableKey`: awards, Items, and the unique among them. */
function lootCounters(document: WorldDocument): Record<ControllerKind, Record<string, LootTally>> {
  const counts: Record<ControllerKind, Record<string, LootTally>> = { player: {}, rival: {} };
  entriesOf(document, 'quest.loot').forEach((entry, index) => {
    const what = `quest.loot entry ${index}`;
    const table = payloadField(entry, 'lootTableKey');
    if (typeof table !== 'string') throw new Error(`${what} has no lootTableKey`);
    const byTable = counts[guildOf(document, entry, `${index}`).controller.kind];
    const tally = (byTable[table] ??= { awards: 0, items: 0, unique: 0 });
    tally.awards += 1;
    tally.items += numberField(entry, 'quantity', what);
    if (payloadField(entry, 'itemId') !== null) tally.unique += 1;
  });
  return counts;
}

/** A `quest.taken` entry's consumables carried, summed over their quantities; none when absent (before M5-S3). */
function carriedBy(entry: Entry, what: string): number {
  const carried = payloadField(entry, 'consumables') ?? [];
  if (!Array.isArray(carried)) throw new Error(`${what} has consumables that are not a list`);
  let total = 0;
  for (const it of carried as unknown[]) {
    const quantity = typeof it === 'object' && it !== null ? Reflect.get(it, 'quantity') : undefined;
    if (typeof quantity !== 'number') throw new Error(`${what} carries a consumable without a quantity`);
    total += quantity;
  }
  return total;
}

/** Consumables carried (`quest.taken`) and expended (`item.expended`) against the Quests resolved, by controller. */
function consumableCounters(document: WorldDocument): Record<ControllerKind, ConsumableTally> {
  const counts = { player: noConsumables(), rival: noConsumables() };
  entriesOf(document, 'quest.resolved').forEach((entry, index) => {
    counts[guildOf(document, entry, `${index}`).controller.kind].quests += 1;
  });
  entriesOf(document, 'quest.taken').forEach((entry, index) => {
    counts[guildOf(document, entry, `${index}`).controller.kind].carried += carriedBy(entry, `quest.taken entry ${index}`);
  });
  const quests: Record<ControllerKind, Set<string>> = { player: new Set(), rival: new Set() };
  entriesOf(document, 'item.expended').forEach((entry, index) => {
    const what = `item.expended entry ${index}`;
    const effect = payloadField(entry, 'effect');
    const definitionKey = payloadField(entry, 'definitionKey');
    const questId = payloadField(entry, 'questId');
    if (!isEffect(effect) || typeof definitionKey !== 'string' || typeof questId !== 'string') {
      throw new Error(`${what} has no effect, definitionKey or questId`);
    }
    const kind = guildOf(document, entry, `${index}`).controller.kind;
    const tally = counts[kind];
    tally.expended += 1;
    tally.byEffect[effect] += 1;
    tally.byDefinition[definitionKey] = (tally.byDefinition[definitionKey] ?? 0) + 1;
    quests[kind].add(questId);
  });
  for (const kind of controllerKinds) counts[kind].questsWithAny = quests[kind].size;
  return counts;
}

/** `item.equipped`, `item.unequipped` and `item.returned` by its `cause`, by controller. */
function gearCounters(document: WorldDocument): Record<ControllerKind, GearTally> {
  const counts = { player: noGear(), rival: noGear() };
  entriesOf(document, 'item.equipped').forEach((entry, index) => {
    counts[guildOf(document, entry, `${index}`).controller.kind].equipped += 1;
  });
  entriesOf(document, 'item.unequipped').forEach((entry, index) => {
    counts[guildOf(document, entry, `${index}`).controller.kind].unequipped += 1;
  });
  entriesOf(document, 'item.returned').forEach((entry, index) => {
    const cause = payloadField(entry, 'cause');
    if (!isReturnCause(cause)) throw new Error(`item.returned entry ${index} has no cause`);
    counts[guildOf(document, entry, `${index}`).controller.kind].returned[cause] += 1;
  });
  return counts;
}

/**
 * The player's resolved Quests whose difficulty `difficulties` holds (the play loop's record of each
 * Quest the policy sent a Party on, read from the Quest's row as it dispatched), tallied by the
 * difficulty's band and by the year of the `quest.resolved`, with the `quest.loot` each won counted
 * in the same band and year. A Quest the map does not hold counts in neither.
 */
function playerDifficulty(
  document: WorldDocument,
  turnsPerYear: number,
  difficulties: ReadonlyMap<string, number>,
): { byBand: DifficultyTally[]; byYear: DifficultyTally[] } {
  const byBand: DifficultyTally[] = [];
  const byYear: DifficultyTally[] = [];
  const at = (series: DifficultyTally[], index: number): DifficultyTally => {
    while (series.length <= index) series.push(noDifficulty());
    return series[index] as DifficultyTally;
  };
  const placed = new Map<string, DifficultyTally[]>();
  entriesOf(document, 'quest.resolved').forEach((entry, index) => {
    if (guildOf(document, entry, `${index}`).controller.kind !== 'player') return;
    const questId = payloadField(entry, 'questId');
    if (typeof questId !== 'string') throw new Error(`quest.resolved entry ${index} has no questId`);
    const difficulty = difficulties.get(questId);
    if (difficulty === undefined) return;
    const tallies = [at(byBand, Math.floor(difficulty / difficultyBandWidth)), at(byYear, yearOf(entry.turn, { turnsPerYear }))];
    for (const tally of tallies) {
      tally.quests += 1;
      tally.difficulty += difficulty;
      if (payloadField(entry, 'band') === 'strong') tally.strong += 1;
    }
    placed.set(questId, tallies);
  });
  entriesOf(document, 'quest.loot').forEach((entry, index) => {
    if (guildOf(document, entry, `${index}`).controller.kind !== 'player') return;
    const questId = payloadField(entry, 'questId');
    const tallies = typeof questId === 'string' ? placed.get(questId) : undefined;
    for (const tally of tallies ?? []) {
      tally.loot += 1;
      if (payloadField(entry, 'itemId') !== null) tally.unique += 1;
    }
  });
  return { byBand, byYear };
}

/**
 * Every counter of a harness game, read from `document`'s History through `byType` and joined to
 * the World State for the Guild each entry is about.
 *
 * @throws Error on an entry the engine would not have made: one naming no Guild the world holds,
 * a `quest.resolved` without a band, an ending without a reason, a `hero.retired` without an age,
 * a `quest.encounter` without a kind or outcome, a `hero.injured` without a type, and the like.
 * `playerQuestDifficulty`, the difficulty of each Quest the player's Guild took by Quest id, which
 * no entry records (the play loop keeps it), gives the player's Quests by difficulty (M5, DL-62);
 * without it those two counters are `null`.
 */
export function countGame(
  document: WorldDocument,
  deps: EngineDeps,
  playerQuestDifficulty?: ReadonlyMap<string, number>,
): GameCounters {
  const { turnsPerYear } = deps.config;
  const questsResolved: GameCounters['questsResolved'] = {
    player: { fail: 0, success: 0, strong: 0 },
    rival: { fail: 0, success: 0, strong: 0 },
  };
  entriesOf(document, 'quest.resolved').forEach((entry, index) => {
    const band = payloadField(entry, 'band');
    if (!isBand(band)) throw new Error(`quest.resolved entry ${index} has no band`);
    questsResolved[guildOf(document, entry, `${index}`).controller.kind][band] += 1;
  });

  const rivalFolds = byReason();
  entriesOf(document, 'guild.folded').forEach((entry, index) => {
    const reason = payloadField(entry, 'reason');
    if (!isReason(reason)) throw new Error(`guild.folded entry ${index} has no reason`);
    rivalFolds[reason] += 1;
  });

  const endings = entriesOf(document, 'game.ended');
  if (endings.length > 1) throw new Error(`The History holds ${endings.length} game.ended entries`);
  const reason = endings[0] === undefined ? null : payloadField(endings[0], 'reason');
  if (reason !== null && !isReason(reason)) throw new Error('The game.ended entry has no reason');

  const { world } = document;
  const lastTurn = world.ended?.turn ?? world.turn;
  const years = Math.ceil(lastTurn / turnsPerYear);

  const guildYears = byYear();
  for (const guild of Object.values(world.guilds)) {
    addGuildYears(guildYears[guild.controller.kind], guild.foundedTurn, inPlayUntil(guild, lastTurn), turnsPerYear);
  }

  const retirementAges: GameCounters['retirementAges'] = { player: {}, rival: {} };
  entriesOf(document, 'hero.retired').forEach((entry, index) => {
    const age = payloadField(entry, 'age');
    if (typeof age !== 'number') throw new Error(`hero.retired entry ${index} has no age`);
    const ages = retirementAges[guildOf(document, entry, `${index}`).controller.kind];
    ages[age] = (ages[age] ?? 0) + 1;
  });

  const { levelsGained, declines, growthAgainstDecline } = progressionCounters(document, turnsPerYear, lastTurn);
  const difficulty = playerQuestDifficulty === undefined ? undefined : playerDifficulty(document, turnsPerYear, playerQuestDifficulty);
  return {
    questsTaken: questsTakenByController(document),
    questsResolved,
    heroesInjured: countByController(document, 'hero.injured'),
    heroesDied: countByController(document, 'hero.died'),
    heroesRecruited: countByController(document, 'hero.recruited'),
    heroesRetired: countByController(document, 'hero.retired'),
    rivalFolds,
    ending: reason,
    lastTurn,
    guildYears: padTo(guildYears, years),
    levelsGained: padTo(levelsGained, years),
    declines: padTo(declines, years),
    retirementAges,
    growthAgainstDecline,
    improvementGrades: improvementGrades(document, deps, lastTurn),
    encounters: encounterCounters(document),
    synergies: synergyCounters(document),
    injuriesByType: injuryCounters(document),
    ...patronSilence(document, turnsPerYear, lastTurn),
    wealth: wealthCounters(document),
    loot: lootCounters(document),
    consumables: consumableCounters(document),
    gear: gearCounters(document),
    playerQuestsByDifficulty: difficulty?.byBand ?? null,
    playerQuestsByYear: difficulty?.byYear ?? null,
  };
}

// ── Read from the World State while a game is played (M3, DL-40) ────────────────────────────

/** How often the Unattached pool refused a kind of Guild for its Fame, counted each morning (DL-38 item 9). */
export interface FameGate {
  /** Pool Heroes who would refuse the Guild (`unsignableHeroes`), summed over Guilds and mornings. */
  heroDays: number;
  /** Guilds in play, summed over mornings. */
  guildDays: number;
  /** The Guild-Days on which at least one pool Hero would refuse. */
  guildDaysWithAny: number;
}

/** The Roster Heroes of one kind of Guild at a moment, the Guilds in play only. */
export interface RosterCensus {
  /** The Guilds in play, and their Wealth summed. */
  guilds: number;
  wealth: number;
  heroes: number;
  /** Their Levels, summed. */
  levels: number;
  /** How many hold a Stat at its Potential, or at content's maximum where growth stops too (DL-36). */
  atPotential: number;
}

/**
 * The player's Guild's Regard as year `countedYear` begins (M4, DL-55), by band, every band listed:
 * what the History, which records a Regard only when it crosses a band, cannot give.
 */
export interface RegardSnapshot {
  /** Each unordered pair of the player's Roster once, by the band of their Relationship (`relationshipBandCounts`). */
  relationships: Record<RegardBand, number>;
  /** The player's Guildmaster's Regard entries (`regardBandCounts`), for Patrons and for Heroes apart. */
  guildmasterForPatrons: Record<RegardBand, number>;
  guildmasterForHeroes: Record<RegardBand, number>;
}

/** What a game's World State showed while it was played: what its History cannot give. */
export interface GameObservations {
  fameGate: Record<ControllerKind, FameGate>;
  /** The Rosters as each year begins, before the policy acts: index k is after k years, 0 the new world. */
  rosters: Record<ControllerKind, RosterCensus>[];
  /** Taken with the census after `countedYear` years; `null` until then, and for a game that stopped first. */
  regardAtCountedYear: RegardSnapshot | null;
}

const noFameGate = (): FameGate => ({ heroDays: 0, guildDays: 0, guildDaysWithAny: 0 });
const noCensus = (): RosterCensus => ({ guilds: 0, wealth: 0, heroes: 0, levels: 0, atPotential: 0 });

export function emptyObservations(): GameObservations {
  return { fameGate: { player: noFameGate(), rival: noFameGate() }, rosters: [], regardAtCountedYear: null };
}

/** Every Regard band at 0. */
export const noBands = (): Record<RegardBand, number> =>
  Object.fromEntries(regardBandNames.map((band) => [band, 0])) as Record<RegardBand, number>;

/** The entries of `map` whose key is an id of `table`. */
function entriesFor(map: Readonly<RegardMap>, table: 'patrons' | 'heroes'): RegardMap {
  return Object.fromEntries(Object.entries(map).filter(([id]) => isId(table, id)));
}

/**
 * The player's Guild's Regard in `world`, by band: the Relationships within its Roster, and its
 * Guildmaster's Regard for Patrons and for Heroes; every band 0 where it has no Roster or
 * Guildmaster row.
 */
export function regardSnapshot(world: World, config: EngineDeps['config']): RegardSnapshot {
  const guild = playerGuild(world);
  const guildmaster =
    guild !== undefined && Object.hasOwn(world.guildmasters, guild.guildmasterId) ? world.guildmasters[guild.guildmasterId] : undefined;
  const regard: Readonly<RegardMap> = guildmaster?.regard ?? {};
  return {
    relationships: guild === undefined ? noBands() : relationshipBandCounts(guild.rosterIds, world, config),
    guildmasterForPatrons: regardBandCounts(entriesFor(regard, 'patrons'), config),
    guildmasterForHeroes: regardBandCounts(entriesFor(regard, 'heroes'), config),
  };
}

/** The Guilds in play: not folded. */
const guildsInPlay = (world: World): Guild[] => Object.values(world.guilds).filter((guild) => guild.foldedOnTurn === null);

/** Whether any of `hero`'s Stats has reached its Potential, or content's maximum: where growth stops (DL-36). */
function hasStatAtPotential(hero: Hero, content: EngineDeps['content']): boolean {
  return Object.values(content.stats).some(
    (stat) => stat.owner === 'hero' && baseStat(hero.stats, stat) >= Math.min(baseStat(hero.potential, stat), stat.max),
  );
}

/**
 * On the first Turn of a year not yet counted, a census of every Roster of a Guild in play, added
 * as the next entry of `observations.rosters`, and after `countedYear` years the player's Guild's
 * Regard (`regardSnapshot`); nothing on any other Turn, so it may be asked on every Turn and once
 * more when a game stops.
 */
export function takeCensus(observations: GameObservations, world: World, deps: EngineDeps): void {
  if (world.turn !== observations.rosters.length * deps.config.turnsPerYear) return;
  if (observations.rosters.length === countedYear) observations.regardAtCountedYear = regardSnapshot(world, deps.config);
  const census = { player: noCensus(), rival: noCensus() };
  for (const guild of guildsInPlay(world)) {
    const counts = census[guild.controller.kind];
    counts.guilds += 1;
    counts.wealth += guild.wealth;
    for (const heroId of guild.rosterIds) {
      const hero = Object.hasOwn(world.heroes, heroId) ? world.heroes[heroId] : undefined;
      if (hero === undefined) continue;
      counts.heroes += 1;
      counts.levels += hero.level;
      if (hasStatAtPotential(hero, deps.content)) counts.atPotential += 1;
    }
  }
  observations.rosters.push(census);
}

/**
 * Reads `world` as it stands on its Turn before the policy acts: on a morning, the Fame gate, the
 * pool Heroes who would refuse each Guild in play (DL-38 item 9); on the first Turn of a year, the
 * Rosters (`takeCensus`). Adds to `observations`.
 */
export function observe(observations: GameObservations, world: World, deps: EngineDeps): void {
  if (timeOfDay(world.turn) === 'morning') {
    for (const guild of guildsInPlay(world)) {
      const refusing = unsignableHeroes(world, guild, deps.config).length;
      const gate = observations.fameGate[guild.controller.kind];
      gate.heroDays += refusing;
      gate.guildDays += 1;
      if (refusing > 0) gate.guildDaysWithAny += 1;
    }
  }
  takeCensus(observations, world, deps);
}
