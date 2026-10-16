// How the play sweep's counters are read (M2-S12), each from a document's History through its index
// by type, `history.byType`, never by scanning every entry, and joined to the World State only for
// the Guild an entry names; or from the World State as a game is played, by an observer of the play
// loop. Each counter is declared once in `game-counters.ts` (DL-239), which reads it through these.
// The Quests taken by each kind of controller show how contested the Board is (DL-30); DL-34 adds the
// rest of the first counters.
//
// M3's counters (the epic's §2, DL-40) add Levels and declines per Guild-year, Retirements by age,
// growth against decline, and the Improvement grades reached in the first 10 years, from the History as
// before; and two the History cannot give, read from the World State while the game is played: how
// many pool Heroes refuse each Guild for its Fame each morning (`observeFameGate`), and the Rosters'
// Levels and Heroes at Potential as each year begins (`rosterCensus`).
//
// M4's counters (the epic's §2, DL-55) add, from the History, the Encounters' outcomes by kind, the
// Synergies each Quest applied, Injuries by type and the Patrons silent in a year; and, from the
// World State after 10 years, the Relationships within the player's Roster and its
// Guildmaster's Regard, by band, which the History records only as band crossings.
//
// M5's counters (the epic's §2, DL-62) add, from the History, the Wealth each kind of Guild spent by
// category and took from Quests and the Market, the Loot awarded by table, the consumables carried
// and expended, and the gear moved; and, joined to the difficulty of each Quest the player's Guild
// took, which no entry records and the play loop reads as it dispatches, the player's Loot by the
// difficulty of the Quest that won it.
//
// M6's counters (the epic's §2, DL-69) add, from the History, the Transfers by direction, by how a
// Transfer between two Rivals happened and by the selling and the buying Guild, their fees among the
// Wealth flows; the Transfer Offers by the Guild that made them and the Guild asked; and each
// Disposition's Quests, Deaths, recruits, folds, Market purchases and Improvement grades. Two things
// no entry records come from the play loop's sight of each afternoon (`RivalAfternoons`, `seenInPlay`): the
// difficulty of each Quest a Rival took, and whether a Transfer's seller was in debt. From the World
// State as each year begins: each Rival's Roster and Wealth, and the player's Guild's place in the
// Rankings.
//
// M8's counters (DL-78), for a run with modules installed (`HEROESIM_MODULES`), from the History: each
// module event type, `probe.fired` among them, and the core's events each module's effects made,
// which name it as `moduleId`. With no module installed both are empty.
//
// M9-S1's (DL-101), from the History: the nights each kind of Guild fell below the Bankruptcy floor
// (`guild.below-floor`) and was back to it or more (`guild.floor-recovered`).
//
// v1.1.3-S6's (DL-134 item 9, DL-135 item 6), from the World State as each Hero is generated, which the
// play loop reads from the `hero.generated` events of the world's creation and of each `advance`, not
// the History, which records a pool Hero only once hired (DL-211) (`observeHeroes`): every
// Hero generated, with a picture or the Silhouette, those whose picture another Hero on a Roster or in
// the pool already held (a repeat), and the longest Appearance and Biography written; and the save's
// length as each year ends, with the part of it the Heroes' three new fields take (`observeSave`).
// No rule reads a Portrait or a text, so none of these moves a play counter.
//
// v1.1.3-S5's (DL-134 item 9), from the World State: every Guildmaster who entered play, by their
// Guild's controller, with a picture or the Silhouette; of those with a picture, those whose picture's
// `apparentAge` holds the age they entered play at, and those one of whose picture's Callings clashes
// with one of their Traits. No rule reads a Portrait, so none of these moves a play counter.
//
// v1.1.6-S17's (DL-186 item 11, DL-203), from the World State as each year ends (`observeWorld`): its
// size in the save's characters, its rows live and write-once, and the time of the per-Turn copy,
// `copyWorld`, taken there. Measures, not play counters: `compare` leaves them out.
//
// The Targets' (DL-259), what the report's Targets read that no counter gave: from the History, each
// side's Quests taken with the Heroes sent and the Days away, and the Transfers back to a former seller
// within `pingPongDays`; from the World State, the highest Level each side has reached by each year,
// the Rivals at the Roster floor with Wealth to spare and the player's Wealth in months of its Upkeep
// as each year begins, and the Transfers that left their seller below `rivalRosterMin`.

import {
  availableHeroes,
  baseStat,
  bestFourLevel,
  boardTopTier,
  callingClashes,
  compareByCodeUnit,
  copyWorld,
  dayOf,
  dispositionOf,
  encounterKinds,
  fatigueBand,
  hallUpkeepSplit,
  topGrade,
  isEngineEvent,
  isId,
  outOfContract,
  partyPool,
  playerGuild,
  portraitRowOf,
  questBands,
  rankings,
  regardBandCounts,
  regardBandNames,
  relationshipBandCounts,
  relievesHurt,
  restBandOf,
  timeOfDay,
  turnsPerDay,
  underOffer,
  unlockedTier,
  unsignableHeroes,
  upkeep,
  writeOnce,
  yearOf,
  type Controller,
  type EncounterKind,
  type EncounterOutcome,
  type EndingReason,
  type EngineDeps,
  type Entry,
  type EventType,
  type FacilityKey,
  type FatigueBand,
  type GearReturnCause,
  type Guild,
  type GuildId,
  type Hero,
  type HeroId,
  type History,
  type ItemSaleCause,
  type QuestBand,
  type RankingMeasure,
  type RegardBand,
  type RegardMap,
  type TimeOfDay,
  type TransferOfferEndCause,
  type World,
  type WorldDocument,
} from '@heroesim/engine';
import { fatigueBandNames } from '@heroesim/words';

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
export function countByController(document: WorldDocument, type: EventType): ByController {
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

/**
 * The Heroes `quest.taken` sends, each once however many Quests they went on, by the kind of
 * controller of the Guild that first sent them (v1.1.4-S7): the Hero careers the Traits earned are
 * counted over.
 *
 * @throws Error on an entry naming no Guild the world holds, or with no list of Heroes
 */
export function questingHeroes(document: WorldDocument): ByController {
  const counts = byController();
  const seen = new Set<unknown>();
  entriesOf(document, 'quest.taken').forEach((entry, index) => {
    const heroIds = payloadField(entry, 'heroIds');
    if (!Array.isArray(heroIds)) throw new Error(`quest.taken entry ${index} has no heroIds`);
    const kind = guildOf(document, entry, `${index}`).controller.kind;
    for (const heroId of heroIds) {
      if (seen.has(heroId)) continue;
      seen.add(heroId);
      counts[kind] += 1;
    }
  });
  return counts;
}

/** The years M3's counters read after: "after 10 years", and the grades reached in them (the epic's §2, DL-40). */
export const countedYear = 10;

/** A number for each year of the game, the first at index 0, for each kind of controller. */
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

/** For each Facility, by its content key, how many Guilds reached each grade: index 0, never built, first. */
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
  /** `hero.trait-gained`, by the Hero's Guild's controller then (v1.1.4-S7, DL-148 item 25). */
  traitsGained: ByController;
  /** `hero.trait-lost`, a Trait an Injury's replaced, by the Hero's Guild's controller then (v1.1.4-S7, DL-150 item 5). */
  traitsLost: ByController;
  /**
   * The Heroes sent on at least one Quest (`quest.taken`'s `heroIds`), each once, by the controller of
   * the Guild that first sent them: the careers the Traits earned are counted over (v1.1.4-S7, the
   * epic's "Rare Traits" gate).
   */
  questingHeroes: ByController;
  /** `hero.trait-gained`, by the Hero's Guild's controller then, then by the Trait's key (v1.1.4-S10). */
  traitsGainedByKey: Record<ControllerKind, Record<string, number>>;
  /**
   * `quest.resolved` by the resolving Guild's controller, then by the size of the Party sent (v1.1.4-S10,
   * for the owner's decision on splitting XP, DL-148 item 19; split by DL-182).
   */
  partySizes: Record<ControllerKind, Record<string, PartySizeTally>>;
  /**
   * `guild.folded`, by the reason the Rival reached its ending. A Rival's Guildmaster's Retirement
   * is met by Succession (DL-102), so `retirement` stays 0 in a game played under its rules.
   */
  rivalFolds: Record<EndingReason, number>;
  /** `guildmaster.succeeded`: the Rival Guildmasters whose Retirement was met by Succession (M9-S2, DL-102). */
  rivalSuccessions: number;
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
   * The Guilds founded in the first `countedYear` years (`guild.founded`, replacement Rivals included), by
   * controller, counted by the highest grade each facility reached in them (`guild.improved`);
   * `null` for a game that stopped before `countedYear` years (DL-38 item 15).
   */
  improvementGrades: Record<ControllerKind, GradeCounts> | null;
  // M4's (DL-55).
  /** `quest.encounter`, by the controller of the Guild it names, then by the Encounter's kind. */
  encounters: Record<ControllerKind, EncounterCounts>;
  /** `quest.resolved`'s `synergyKeys`, by the controller of the resolving Guild. */
  synergies: Record<ControllerKind, SynergyTally>;
  /** `hero.injured`, by the controller of the Hero's Guild then, then by the Injury type's key. */
  injuriesByType: Record<ControllerKind, Record<string, number>>;
  /** For each year played in full, the first at index 0, the Patrons in the world as it began. */
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
  // M6's (DL-69).
  /** `hero.transferred` by direction: into the player's Guild, out of it, or between two Rivals. */
  transfers: Record<TransferDirection, TransferTally>;
  /** Of those between two Rivals, how each happened, as far as the History and the play loop tell. */
  rivalTransfers: Record<RivalTransferWay, TransferTally>;
  /** `hero.transferred` by the selling Guild's side (`sideOf`), then the buying Guild's. */
  transfersBySide: Record<string, Record<string, TransferTally>>;
  /** Transfers that took a Hero to a Guild that had sold them before (DL-60's lock at work). */
  transfersBack: number;
  /** Of those, the Transfers fewer than `pingPongDays` after that Guild's last sale of the Hero (DL-69 item 4, DL-259). */
  transfersBackSoon: number;
  /** `quest.taken` by the taking Guild's side (`sideOf`): the Quests, the Heroes sent and the Days away (DL-259). */
  questWeight: Record<string, QuestWeight>;
  /** Quests by their Tier: offered, and each controller's taken, resolved, paid and looted (DL-262). */
  questTiers: Record<string, TierTally>;
  /** Transfer Offers by the side of the Guild that made them, then of the Guild asked. */
  offers: Record<string, Record<string, OfferTally>>;
  /** Each Disposition's Rivals, by its key: every Disposition content holds, and any other a Rival has. */
  dispositions: Record<string, DispositionTally>;
  /** `item.bought` by the buying Guild's side. */
  marketPurchases: Record<string, MarketTally>;
  /** `improvementGrades`' Rivals again, by Disposition; `null` when it is. */
  improvementGradesByDisposition: Record<string, GradeCounts> | null;
  // M8's (DL-78).
  /** Each module event type in the History (`isModuleEvent`), by count: `probe.fired`. Empty with no module. */
  moduleEvents: Record<string, number>;
  /**
   * The core's events a module's effects made, by the module each names as `moduleId`, then by type
   * (`effectEventTypes`). Empty with no module.
   */
  moduleEffects: Record<string, Record<string, number>>;
  // M9-S1's (DL-101).
  /** `guild.below-floor`: the nights a Guild's Wealth fell below the Bankruptcy floor, by the Guild's controller. */
  belowFloor: ByController;
  /** `guild.floor-recovered`: the nights it was back to the floor or more, likewise. */
  floorRecovered: ByController;
  // v1.1.3-S5's (DL-134 item 9).
  /** Every Guildmaster who entered play and their Portraits, by their Guild's controller. */
  portraits: Record<ControllerKind, PortraitTally>;
  // Fatigue's lines (DL-290).
  /** The Days Heroes take to recover at home after a Quest (`recoveryCounters`), by the controller of the Guild that sent them. */
  fatigueRecovery: Record<ControllerKind, Recovery>;
  /** `hero.injured` on a Quest, by the relief of the hurt in play (`reliefCounters`), by the controller of the Hero's Guild then. */
  hurtRelief: Record<ControllerKind, ReliefTally>;
  // The Contracts' lines (DL-321).
  /** The Contracts signed by way and length, expired and released (`contractCounters`), by the controller of the Guild each names. */
  contracts: Record<ControllerKind, ContractTally>;
  /** The free Offers by the side that made them and the side asked, and their ends by a renewal and a taking (`freeOfferCounters`). */
  freeOffers: Record<string, Record<string, FreeOfferTally>>;
}

/** The Guildmasters who entered play, and how their Portraits fit them (v1.1.3-S5, DL-134 item 9). */
export interface PortraitTally {
  guildmasters: number;
  /** With a picture, and with none, the Silhouette. */
  pictured: number;
  silhouettes: number;
  /** Of those with a picture, those whose picture's `apparentAge` holds the age they entered play at. */
  ageHeld: number;
  /** Of those with a picture, those one of whose picture's Callings clashes with one of their Traits. */
  callingClashes: number;
}

export const noPortraits = (): PortraitTally => ({ guildmasters: 0, pictured: 0, silhouettes: 0, ageHeld: 0, callingClashes: 0 });

/**
 * v1.1.3-S5's counters: every Guildmaster row of the world, the player's, the Rivals' founding and
 * replacing ones and every successor, retired or folded or in office, by their Guild's controller.
 * A picture content has no row for counts as pictured, holding no age and clashing with nothing.
 */
export function portraitCounters(document: WorldDocument, deps: EngineDeps): Record<ControllerKind, PortraitTally> {
  const tallies = { player: noPortraits(), rival: noPortraits() };
  const { world } = document;
  for (const guildmaster of Object.values(world.guildmasters)) {
    const guild = Object.hasOwn(world.guilds, guildmaster.guildId) ? world.guilds[guildmaster.guildId] : undefined;
    if (guild === undefined) throw new Error(`${guildmaster.id} names ${guildmaster.guildId}, which has no row`);
    const tally = tallies[guild.controller.kind];
    tally.guildmasters += 1;
    if (guildmaster.portraitKey === null) {
      tally.silhouettes += 1;
      continue;
    }
    tally.pictured += 1;
    const [from, to] = portraitRowOf(deps.content, guildmaster.portraitKey)?.apparentAge ?? [1, 0];
    if (guildmaster.ageAtEntry >= from && guildmaster.ageAtEntry <= to) tally.ageHeld += 1;
    if (callingClashes(deps.content, guildmaster.portraitKey, guildmaster.traits).length > 0) tally.callingClashes += 1;
  }
  return tallies;
}

/**
 * The core's event types a module's effect makes (effects.ts, M8-S2, DL-77), each naming the module
 * as `moduleId`: the types `moduleEffects` reads. A test holds it to every event the probe's effects make.
 */
export const effectEventTypes = [
  'hero.morale-changed',
  'guild.wealth-changed',
  'patron.regard-changed',
  'guildmaster.regard-changed',
  'hero.regard-changed',
  'hero.injured',
  'quest.offered',
] as const satisfies readonly EventType[];

/**
 * M8's counters (DL-78): each module event type the History indexes, by count, in code-unit order of
 * type; and, from the entries of `effectEventTypes`, those that name a module, by module and type.
 */
export function moduleCounters(document: WorldDocument): Pick<GameCounters, 'moduleEvents' | 'moduleEffects'> {
  const moduleEvents: Record<string, number> = {};
  for (const type of Object.keys(document.history.byType).sort(compareByCodeUnit)) {
    if (isEngineEvent({ type: type as EventType })) continue;
    moduleEvents[type] = document.history.byType[type as EventType]?.length ?? 0;
  }
  const moduleEffects: Record<string, Record<string, number>> = {};
  for (const type of effectEventTypes) {
    entriesOf(document, type).forEach((entry, index) => {
      const moduleId = payloadField(entry, 'moduleId');
      if (moduleId === undefined) return;
      if (typeof moduleId !== 'string') throw new Error(`${type} entry ${index} has a moduleId that is not an id`);
      const byType = (moduleEffects[moduleId] ??= {});
      byType[type] = (byType[type] ?? 0) + 1;
    });
  }
  return { moduleEvents, moduleEffects };
}

// ── M5's shapes (DL-62) ─────────────────────────────────────────────────────────────────────

/** Why Items went to the Market (M5-S4): a sale, or a folding Guild's (DL-51). */
export const saleCauses = ['sale', 'fold'] as const satisfies readonly ItemSaleCause[];

/** Why gear went back to a Guild without an `unequip` (M5-S2, DL-49), or to the selling Guild with a transferred Hero (M6-S2, DL-57). */
export const gearReturnCauses = ['died', 'retired', 'guild-folded', 'transferred', 'released'] as const satisfies readonly GearReturnCause[];

/** What a consumable did when it was expended (M5-S3, DL-50). */
export const consumableEffects = ['bonus', 'reroll', 'heal'] as const;

export type ConsumableEffectName = (typeof consumableEffects)[number];

/**
 * A kind of Guild's Wealth: spent on signing fees (`hero.recruited`'s `fee`), Transfer fees
 * (`hero.transferred`'s `fee`, for the buying Guild, M6), release payouts (`hero.released`'s `payout`, DL-317),
 * Items bought from the Market
 * (`item.bought`'s `cost`), Improvements (`guild.improved`'s `cost`) and the Upkeep's two charges, the
 * wages (`guild.wages-paid`'s `amount`) and the Hall's upkeep (`guild.hall-upkeep-paid`'s `amount`), split
 * between the Hall's and the Improvements' by `hallUpkeepSplit`, as the Treasury splits it (DL-298,
 * DL-302, DL-304); taken from
 * Quests (`quest.resolved`'s `wealthDelta`), from Transfer fees (the same `fee`, for the selling Guild,
 * M6) and from the Market (`item.sold`'s `proceeds`, by its `cause`).
 */
export interface WealthFlows {
  signing: number;
  transferFeesPaid: number;
  /** The release payouts (`hero.released`), a line of their own and never among the other expenses (Q19, DL-317). */
  releasePayouts: number;
  items: number;
  /** The Items `item.bought` moved, summed over its `quantity`. */
  itemsBought: number;
  improvements: number;
  /** The wages (`guild.wages-paid`). */
  wages: number;
  /** The Hall's upkeep alone (`guild.hall-upkeep-paid`), base and Heroes, the Guildmaster's factor applied. */
  hallUpkeep: number;
  /** The Improvements' upkeep (`guild.hall-upkeep-paid`), each Facility's charge with the Guildmaster's factor applied. */
  improvementUpkeep: number;
  questRewards: number;
  transferFeesTaken: number;
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
  transferFeesPaid: 0,
  releasePayouts: 0,
  items: 0,
  itemsBought: 0,
  improvements: 0,
  wages: 0,
  hallUpkeep: 0,
  improvementUpkeep: 0,
  questRewards: 0,
  transferFeesTaken: 0,
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

export const noGear = (): GearTally => ({ equipped: 0, unequipped: 0, returned: { died: 0, retired: 0, 'guild-folded': 0, transferred: 0, released: 0 } });

export const noDifficulty = (): DifficultyTally => ({ quests: 0, difficulty: 0, strong: 0, loot: 0, unique: 0 });

// ── M6's shapes (DL-69) ─────────────────────────────────────────────────────────────────────

/** The player's Guild's side; every other side is a Rival's Disposition's key. */
export const playerSide = 'player';

/** Whose a Guild is, for M6's counters: `playerSide` for the player's, else its Disposition's key. */
export function sideOf(guild: Guild): string {
  return dispositionOf(guild) ?? playerSide;
}

/** Which way a Transfer went (the epic's §2): into the player's Guild, out of it, or between two Rivals. */
export const transferDirections = ['in', 'out', 'rival-to-rival'] as const;

export type TransferDirection = (typeof transferDirections)[number];

/**
 * How a Transfer between two Rivals happened, as far as the History and the play loop tell (DL-69).
 * `accepted-offer`: the entry names the offer (`offerId`), accepted or, free, taken (DL-319). `generator`: on a night, when only the
 * Transfer Generator moves Heroes (DL-59; Rivals choose in the afternoon). The afternoon's are the
 * buyer's `transferChoice` or the seller's `debtTransfer` (DL-57 item 5), and no entry says which
 * action made a Transfer: `afternoon-seller-in-debt` when the play loop saw the seller in debt as the
 * afternoon began, where either could have made it; `afternoon` when it saw it out of debt, where only
 * the buyer's choice could, and for every afternoon Transfer when the play loop's record is not given.
 */
export const rivalTransferWays = ['afternoon', 'afternoon-seller-in-debt', 'generator', 'accepted-offer'] as const;

export type RivalTransferWay = (typeof rivalTransferWays)[number];

/** Transfers, and their fees summed. */
export interface TransferTally {
  transfers: number;
  fees: number;
}

export const noTransfers = (): TransferTally => ({ transfers: 0, fees: 0 });

/** Why a Transfer Offer ended unanswered (DL-57 item 6): a free Offer by a renewal or taken too (DL-319). */
export const offerEndCauses = ['expired', 'hero-left', 'guild-folded', 'renewed', 'taken'] as const satisfies readonly TransferOfferEndCause[];

/**
 * Transfer Offers from one side to another: made (`guild.transfer-offered`), with the fees offered
 * summed; accepted (a `hero.transferred` naming the offer, but a free Offer's taking); declined
 * (`guild.transfer-offer-declined`); and ended unanswered (`guild.transfer-offer-expired`) by its
 * `cause`, a free Offer's taking among them. What none of these counts was still standing when the
 * game stopped.
 */
export interface OfferTally {
  made: number;
  fees: number;
  accepted: number;
  declined: number;
  ended: Record<TransferOfferEndCause, number>;
}

export const noOffers = (): OfferTally => ({ made: 0, fees: 0, accepted: 0, declined: 0, ended: { expired: 0, 'hero-left': 0, 'guild-folded': 0, renewed: 0, taken: 0 } });

/** One Disposition's Rivals: what the balance pass reads its character by (DL-69). */
export interface DispositionTally {
  /** Rivals of it the world holds, replacements founded after a fold included, and their years in play. */
  guilds: number;
  guildYears: number;
  /** `quest.taken`; of those, the Quests whose difficulty the play loop recorded, and their difficulty summed. */
  questsTaken: number;
  questsWithDifficulty: number;
  difficulty: number;
  /** `quest.resolved` by band. */
  questsResolved: Record<QuestBand, number>;
  /** `hero.died`, the Guild the Hero was on; `hero.recruited`; `guild.folded` by its reason. */
  deaths: number;
  recruits: number;
  folds: Record<EndingReason, number>;
}

export const noDisposition = (): DispositionTally => ({
  guilds: 0,
  guildYears: 0,
  questsTaken: 0,
  questsWithDifficulty: 0,
  difficulty: 0,
  questsResolved: { fail: 0, success: 0, strong: 0 },
  deaths: 0,
  recruits: 0,
  folds: { retirement: 0, bankruptcy: 0, 'roster-wiped': 0 },
});

/** One side's Market purchases: `item.bought` entries, the Items they moved (`quantity`) and their `cost`. */
export interface MarketTally {
  purchases: number;
  items: number;
  cost: number;
}

export const noPurchases = (): MarketTally => ({ purchases: 0, items: 0, cost: 0 });

/**
 * What the play loop saw of the Rivals' afternoons that no entry records (DL-69), for the counters' reading:
 * the difficulty of each Quest a Rival took, by Quest id, from the Quest's row as the afternoon began;
 * and the History positions of the `hero.transferred` entries of an afternoon whose selling Guild was
 * in debt (`belowFloorSince` set) as it began, which is when a Rival's `debtTransfer` may sell.
 */
export interface RivalAfternoons {
  questDifficulty: ReadonlyMap<string, number>;
  sellerInDebt: ReadonlySet<number>;
}

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

/** Every Encounter kind's Checks at 0 (one source of the empty tallies with the sweep's totals, v1.1.6-S1, DL-187). */
export const noEncounters = (): EncounterCounts =>
  Object.fromEntries(encounterKinds.map((kind) => [kind, { success: 0, failure: 0, injured: 0, died: 0 }])) as EncounterCounts;

export const noSynergies = (): SynergyTally => ({ quests: 0, withAny: 0, applied: 0, byKey: {} });

/**
 * A kind of Guild's resolved Quests sent with Parties of one size (v1.1.4-S10, DL-148 item 19): each
 * Hero who comes home takes `xpPerHero`, the Quest's XP split across the Party sent,
 * its Dead counted, rounded down (DL-182).
 */
export interface PartySizeTally {
  /** Quests resolved, and those that failed and that were strong successes. */
  quests: number;
  fail: number;
  strong: number;
  /** `xpPerHero`, summed over the Quests. */
  xpPerHero: number;
  /** The Heroes who came home (the Party less its Deaths), and the XP they took, summed. */
  heroesHome: number;
  xpTaken: number;
}

export const noPartySize = (): PartySizeTally => ({ quests: 0, fail: 0, strong: 0, xpPerHero: 0, heroesHome: 0, xpTaken: 0 });

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

/** A Facility's key as an entry names it: any string, content's or not (DL-297). */
function isFacility(value: unknown): value is FacilityKey {
  return typeof value === 'string';
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

export function noGrowth(): GrowthAgainstDecline {
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
export function progressionCounters(
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

/**
 * A grade count for each of `content`'s Facilities, as long as its grades of it go, all zero; without
 * `content`, none, as the sweep's totals begin before a game adds its counts (DL-187, DL-297).
 */
export function noGrades(content?: EngineDeps['content']): GradeCounts {
  if (content === undefined) return {};
  return Object.fromEntries(Object.keys(content.facilities).map((facility) => [facility, Array.from({ length: topGrade(facility, content) + 1 }, () => 0)]));
}

/** A grade count for each Disposition content holds, each as `noGrades`. */
function noGradesByDisposition(content: EngineDeps['content']): Record<string, GradeCounts> {
  return Object.fromEntries(Object.keys(content.dispositions).map((key) => [key, noGrades(content)]));
}

/**
 * The Guilds founded in the first `countedYear` years, by controller and, for the Rivals, by Disposition too
 * (M6, DL-69), counted by the highest grade each facility reached in them; `null` when the game
 * stopped before their end (DL-38 item 15).
 */
export function improvementGrades(
  document: WorldDocument,
  deps: EngineDeps,
  lastTurn: number,
): { byController: Record<ControllerKind, GradeCounts>; byDisposition: Record<string, GradeCounts> } | null {
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
  const byDisposition = noGradesByDisposition(deps.content);
  const founded = new Set<GuildId>();
  entriesOf(document, 'guild.founded').forEach((entry, index) => {
    if (entry.turn >= cutoff) return;
    const guild = guildOf(document, entry, `${index}`);
    if (founded.has(guild.id)) return;
    founded.add(guild.id);
    const disposition = dispositionOf(guild);
    for (const facility of Object.keys(deps.content.facilities)) {
      const grade = highest.get(`${guild.id} ${facility}`) ?? 0;
      addAt((grades[guild.controller.kind][facility] ??= []), grade, 1);
      if (disposition !== null) addAt(((byDisposition[disposition] ??= noGrades(deps.content))[facility] ??= []), grade, 1);
    }
  });
  return { byController: grades, byDisposition };
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
export function encounterCounters(document: WorldDocument): Record<ControllerKind, EncounterCounts> {
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
export function synergyCounters(document: WorldDocument): Record<ControllerKind, SynergyTally> {
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

/** `quest.resolved` by controller and the size of the Party sent, with its band, XP and Deaths (v1.1.4-S10). */
export function partySizeCounters(document: WorldDocument): Record<ControllerKind, Record<string, PartySizeTally>> {
  const counts: Record<ControllerKind, Record<string, PartySizeTally>> = { player: {}, rival: {} };
  entriesOf(document, 'quest.resolved').forEach((entry, index) => {
    const what = `quest.resolved entry ${index}`;
    const band = payloadField(entry, 'band');
    if (!isBand(band)) throw new Error(`${what} has no band`);
    const size = listLength(entry, 'heroIds', what);
    // The engine writes both; an entry without them (a test's) took no XP and lost no one.
    const xp = payloadField(entry, 'xpPerHero') === undefined ? 0 : numberField(entry, 'xpPerHero', what);
    const home = size - (payloadField(entry, 'deaths') === undefined ? 0 : listLength(entry, 'deaths', what));
    const sizes = counts[guildOf(document, entry, `${index}`).controller.kind];
    const tally = (sizes[size] ??= noPartySize());
    tally.quests += 1;
    if (band === 'fail') tally.fail += 1;
    if (band === 'strong') tally.strong += 1;
    tally.xpPerHero += xp;
    tally.heroesHome += home;
    tally.xpTaken += xp * home;
  });
  return counts;
}

/** `hero.trait-gained` by the controller of the Hero's Guild then (`guildOf`), and the Trait (v1.1.4-S10). */
export function traitsGainedByKey(document: WorldDocument): Record<ControllerKind, Record<string, number>> {
  const counts: Record<ControllerKind, Record<string, number>> = { player: {}, rival: {} };
  entriesOf(document, 'hero.trait-gained').forEach((entry, index) => {
    const key = payloadField(entry, 'traitKey');
    if (typeof key !== 'string') throw new Error(`hero.trait-gained entry ${index} has no traitKey`);
    const byKey = counts[guildOf(document, entry, `${index}`).controller.kind];
    byKey[key] = (byKey[key] ?? 0) + 1;
  });
  return counts;
}

/** `hero.injured` by the controller of the Hero's Guild then (`guildOf`), and the Injury type. */
export function injuryCounters(document: WorldDocument): Record<ControllerKind, Record<string, number>> {
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
export function patronSilence(
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
export function wealthCounters(document: WorldDocument): Record<ControllerKind, WealthFlows> {
  const flows = { player: noWealth(), rival: noWealth() };
  const each = (type: EventType, apply: (into: WealthFlows, entry: Entry, what: string) => void): void => {
    entriesOf(document, type).forEach((entry, index) => {
      apply(flows[guildOf(document, entry, `${index}`).controller.kind], entry, `${type} entry ${index}`);
    });
  };
  each('hero.recruited', (into, entry, what) => {
    into.signing += numberField(entry, 'fee', what);
  });
  each('hero.released', (into, entry, what) => {
    into.releasePayouts += numberField(entry, 'payout', what);
  });
  each('item.bought', (into, entry, what) => {
    into.items += numberField(entry, 'cost', what);
    into.itemsBought += numberField(entry, 'quantity', what);
  });
  each('guild.improved', (into, entry, what) => {
    into.improvements += numberField(entry, 'cost', what);
  });
  each('guild.wages-paid', (into, entry, what) => {
    into.wages += numberField(entry, 'amount', what);
  });
  each('guild.hall-upkeep-paid', (into, entry, what) => {
    const amount = numberField(entry, 'amount', what);
    const facilities = payloadField(entry, 'facilities');
    if (typeof facilities !== 'object' || facilities === null) throw new Error(`${what} has no facilities`);
    for (const charge of Object.values(facilities)) {
      if (typeof charge !== 'number') throw new Error(`${what} has a Facility's charge that is no number`);
    }
    const factor = typeof payloadField(entry, 'traitFactor') === 'number' ? (payloadField(entry, 'traitFactor') as number) : 1;
    const { hall, improvements } = hallUpkeepSplit({ amount, facilities: facilities as Record<string, number>, traitFactor: factor });
    into.hallUpkeep += hall;
    into.improvementUpkeep += improvements;
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
  // A Transfer names two Guilds: the fee is spent by the one the Hero joins and taken by the one they leave (M6).
  entriesOf(document, 'hero.transferred').forEach((entry, index) => {
    const { from, to, fee } = transferOf(document, entry, `hero.transferred entry ${index}`);
    flows[to.controller.kind].transferFeesPaid += fee;
    flows[from.controller.kind].transferFeesTaken += fee;
  });
  return flows;
}

/** `quest.loot` by controller and `lootTableKey`: awards, Items, and the unique among them. */
export function lootCounters(document: WorldDocument): Record<ControllerKind, Record<string, LootTally>> {
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

/** A `quest.taken` entry's consumables carried, summed over their quantities; none when absent (before DL-50). */
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
export function consumableCounters(document: WorldDocument): Record<ControllerKind, ConsumableTally> {
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
export function gearCounters(document: WorldDocument): Record<ControllerKind, GearTally> {
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
export function playerDifficulty(
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

// ── M6's counters from the History (DL-69) ──────────────────────────────────────────────────

/**
 * The Guild whose id is an entry's payload `field`.
 *
 * @throws Error when it names no Guild the world holds
 */
function guildNamed(document: WorldDocument, entry: Entry, field: string, what: string): Guild {
  const id = payloadField(entry, field);
  const guild = isId('guilds', id) && Object.hasOwn(document.world.guilds, id) ? document.world.guilds[id as GuildId] : undefined;
  if (guild === undefined) throw new Error(`${what} has no ${field} naming a Guild in the world`);
  return guild;
}

/** A `hero.transferred` entry's two Guilds, fee, Hero and offer. */
function transferOf(document: WorldDocument, entry: Entry, what: string): { from: Guild; to: Guild; fee: number; heroId: string; offerId: unknown } {
  const heroId = payloadField(entry, 'heroId');
  if (typeof heroId !== 'string') throw new Error(`${what} has no heroId`);
  return {
    from: guildNamed(document, entry, 'fromGuildId', what),
    to: guildNamed(document, entry, 'toGuildId', what),
    fee: numberField(entry, 'fee', what),
    heroId,
    offerId: payloadField(entry, 'offerId') ?? null,
  };
}

function addTransfer(tally: TransferTally, fee: number): void {
  tally.transfers += 1;
  tally.fees += fee;
}

/** A Transfer back to a Guild that had sold the Hero fewer Days than this after that sale is ping-pong (DL-69 item 4). */
export const pingPongDays = 90;

/**
 * `hero.transferred` by direction, by how a Transfer between two Rivals happened (`rivalTransferWays`),
 * by the selling and the buying side, and the Transfers between Rivals that took a Hero to a Rival that
 * had sold them before, and of those the ones fewer than `pingPongDays` after its last sale of them:
 * DL-69 item 4's lines are the Rivals' (DL-270).
 */
export function transferCounters(
  document: WorldDocument,
  afternoons: RivalAfternoons | undefined,
): Pick<GameCounters, 'transfers' | 'rivalTransfers' | 'transfersBySide' | 'transfersBack' | 'transfersBackSoon'> {
  const transfers = { in: noTransfers(), out: noTransfers(), 'rival-to-rival': noTransfers() };
  const rivalTransfers = Object.fromEntries(rivalTransferWays.map((way) => [way, noTransfers()])) as Record<RivalTransferWay, TransferTally>;
  const transfersBySide: Record<string, Record<string, TransferTally>> = {};
  let transfersBack = 0;
  let transfersBackSoon = 0;
  // Each Hero's sellers, and the Turn each last sold them.
  const soldBy = new Map<string, Map<GuildId, number>>();
  positionedEntriesOf(document, 'hero.transferred').forEach(({ entry, position }, index) => {
    const { from, to, fee, heroId, offerId } = transferOf(document, entry, `hero.transferred entry ${index}`);
    const direction: TransferDirection =
      to.controller.kind === 'player' ? 'in' : from.controller.kind === 'player' ? 'out' : 'rival-to-rival';
    addTransfer(transfers[direction], fee);
    if (direction === 'rival-to-rival') {
      const way: RivalTransferWay =
        offerId !== null
          ? 'accepted-offer'
          : timeOfDay(entry.turn) === 'night'
            ? 'generator'
            : afternoons?.sellerInDebt.has(position) === true
              ? 'afternoon-seller-in-debt'
              : 'afternoon';
      addTransfer(rivalTransfers[way], fee);
    }
    addTransfer(((transfersBySide[sideOf(from)] ??= {})[sideOf(to)] ??= noTransfers()), fee);
    const sellers = soldBy.get(heroId) ?? new Map<GuildId, number>();
    const sold = sellers.get(to.id);
    if (sold !== undefined && direction === 'rival-to-rival') {
      transfersBack += 1;
      if (dayOf(entry.turn) - dayOf(sold) < pingPongDays) transfersBackSoon += 1;
    }
    sellers.set(from.id, entry.turn);
    soldBy.set(heroId, sellers);
  });
  return { transfers, rivalTransfers, transfersBySide, transfersBack, transfersBackSoon };
}

function isOfferEndCause(value: unknown): value is TransferOfferEndCause {
  return (offerEndCauses as readonly unknown[]).includes(value);
}

/**
 * Transfer Offers by the side of the Guild that made them (the terms' `toGuildId`, which would pay)
 * and of the Guild asked (`fromGuildId`, whose Roster the Hero is on), from their four events.
 */
export function offerCounters(document: WorldDocument): Record<string, Record<string, OfferTally>> {
  const offers: Record<string, Record<string, OfferTally>> = {};
  const tallyOf = (entry: Entry, what: string): OfferTally => {
    const maker = guildNamed(document, entry, 'toGuildId', what);
    const asked = guildNamed(document, entry, 'fromGuildId', what);
    return ((offers[sideOf(maker)] ??= {})[sideOf(asked)] ??= noOffers());
  };
  entriesOf(document, 'guild.transfer-offered').forEach((entry, index) => {
    const what = `guild.transfer-offered entry ${index}`;
    const tally = tallyOf(entry, what);
    tally.made += 1;
    tally.fees += numberField(entry, 'fee', what);
  });
  entriesOf(document, 'guild.transfer-offer-declined').forEach((entry, index) => {
    tallyOf(entry, `guild.transfer-offer-declined entry ${index}`).declined += 1;
  });
  const taken = new Set<unknown>();
  entriesOf(document, 'guild.transfer-offer-expired').forEach((entry, index) => {
    const what = `guild.transfer-offer-expired entry ${index}`;
    const cause = payloadField(entry, 'cause');
    if (!isOfferEndCause(cause)) throw new Error(`${what} has no cause`);
    tallyOf(entry, what).ended[cause] += 1;
    if (cause === 'taken') taken.add(payloadField(entry, 'offerId'));
  });
  entriesOf(document, 'hero.transferred').forEach((entry, index) => {
    const what = `hero.transferred entry ${index}`;
    const offerId = payloadField(entry, 'offerId') ?? null;
    if (offerId !== null && !taken.has(offerId)) tallyOf(entry, what).accepted += 1;
  });
  return offers;
}

/**
 * Each Disposition's Rivals: how many the world holds and their years in play, from the World State;
 * the Quests they took (with the difficulty `afternoons` recorded) and resolved, their Heroes' Deaths,
 * their recruits and their folds, from the History. Every Disposition content holds is listed.
 */
export function dispositionCounters(
  document: WorldDocument,
  deps: EngineDeps,
  lastTurn: number,
  afternoons: RivalAfternoons | undefined,
): Record<string, DispositionTally> {
  const tallies: Record<string, DispositionTally> = Object.fromEntries(Object.keys(deps.content.dispositions).map((key) => [key, noDisposition()]));
  const tallyOf = (guild: Guild): DispositionTally | undefined => {
    const disposition = dispositionOf(guild);
    return disposition === null ? undefined : (tallies[disposition] ??= noDisposition());
  };
  for (const guild of Object.values(document.world.guilds)) {
    const tally = tallyOf(guild);
    if (tally === undefined) continue;
    tally.guilds += 1;
    tally.guildYears += Math.max(0, inPlayUntil(guild, lastTurn) - guild.foundedTurn) / deps.config.turnsPerYear;
  }
  const each = (type: EventType, apply: (tally: DispositionTally, entry: Entry, what: string) => void): void => {
    entriesOf(document, type).forEach((entry, index) => {
      const tally = tallyOf(guildOf(document, entry, `${index}`));
      if (tally !== undefined) apply(tally, entry, `${type} entry ${index}`);
    });
  };
  each('quest.taken', (tally, entry, what) => {
    tally.questsTaken += 1;
    const questId = payloadField(entry, 'questId');
    if (typeof questId !== 'string') throw new Error(`${what} has no questId`);
    const difficulty = afternoons?.questDifficulty.get(questId);
    if (difficulty === undefined) return;
    tally.questsWithDifficulty += 1;
    tally.difficulty += difficulty;
  });
  each('quest.resolved', (tally, entry, what) => {
    const band = payloadField(entry, 'band');
    if (!isBand(band)) throw new Error(`${what} has no band`);
    tally.questsResolved[band] += 1;
  });
  each('hero.died', (tally) => {
    tally.deaths += 1;
  });
  each('hero.recruited', (tally) => {
    tally.recruits += 1;
  });
  each('guild.folded', (tally, entry, what) => {
    const reason = payloadField(entry, 'reason');
    if (!isReason(reason)) throw new Error(`${what} has no reason`);
    tally.folds[reason] += 1;
  });
  return tallies;
}

/** `item.bought` by the buying Guild's side: the purchases, the Items they moved and their cost. */
export function marketPurchaseCounters(document: WorldDocument): Record<string, MarketTally> {
  const purchases: Record<string, MarketTally> = {};
  entriesOf(document, 'item.bought').forEach((entry, index) => {
    const what = `item.bought entry ${index}`;
    const tally = (purchases[sideOf(guildOf(document, entry, `${index}`))] ??= noPurchases());
    tally.purchases += 1;
    tally.items += numberField(entry, 'quantity', what);
    tally.cost += numberField(entry, 'cost', what);
  });
  return purchases;
}

// ── The game's ending, its length and the rest of DL-34's and DL-40's ───────────────────────

/** `quest.resolved` by the resolving Guild's controller, then by band. */
export function questsResolvedByController(document: WorldDocument): GameCounters['questsResolved'] {
  const questsResolved: GameCounters['questsResolved'] = {
    player: { fail: 0, success: 0, strong: 0 },
    rival: { fail: 0, success: 0, strong: 0 },
  };
  entriesOf(document, 'quest.resolved').forEach((entry, index) => {
    const band = payloadField(entry, 'band');
    if (!isBand(band)) throw new Error(`quest.resolved entry ${index} has no band`);
    questsResolved[guildOf(document, entry, `${index}`).controller.kind][band] += 1;
  });
  return questsResolved;
}

/** `guild.folded` by the reason the Rival reached its ending. */
export function rivalFoldCounters(document: WorldDocument): Record<EndingReason, number> {
  const rivalFolds = byReason();
  entriesOf(document, 'guild.folded').forEach((entry, index) => {
    const reason = payloadField(entry, 'reason');
    if (!isReason(reason)) throw new Error(`guild.folded entry ${index} has no reason`);
    rivalFolds[reason] += 1;
  });
  return rivalFolds;
}

/** `guildmaster.succeeded`: the Rival Guildmasters whose Retirement was met by Succession (DL-102). */
export function successionCount(document: WorldDocument): number {
  return entriesOf(document, 'guildmaster.succeeded').length;
}

/**
 * `game.ended`'s reason, or `null` when the player's game has not ended.
 *
 * @throws Error on a History of more than one `game.ended`, or one without a reason
 */
export function endingOf(document: WorldDocument): EndingReason | null {
  const endings = entriesOf(document, 'game.ended');
  if (endings.length > 1) throw new Error(`The History holds ${endings.length} game.ended entries`);
  const reason = endings[0] === undefined ? null : payloadField(endings[0], 'reason');
  if (reason !== null && !isReason(reason)) throw new Error('The game.ended entry has no reason');
  return reason;
}

/** The Turn the game ended on, or the world's Turn when it has not. */
export function lastTurnOf({ world }: WorldDocument): number {
  return world.ended?.turn ?? world.turn;
}

/** The years the game lasted, a year begun counting whole: the length of each counter by year. */
const yearsOf = (document: WorldDocument, turnsPerYear: number): number => Math.ceil(lastTurnOf(document) / turnsPerYear);

/** The years each kind of Guild was in play in each year of the game, summed over its Guilds. */
export function guildYearCounters(document: WorldDocument, turnsPerYear: number): ByYear {
  const lastTurn = lastTurnOf(document);
  const guildYears = byYear();
  for (const guild of Object.values(document.world.guilds)) {
    addGuildYears(guildYears[guild.controller.kind], guild.foundedTurn, inPlayUntil(guild, lastTurn), turnsPerYear);
  }
  return padTo(guildYears, yearsOf(document, turnsPerYear));
}

/** `hero.levelled` and `hero.declined` by controller and year, each series as long as the game's years. */
export function levelsAndDeclines(document: WorldDocument, turnsPerYear: number): Pick<GameCounters, 'levelsGained' | 'declines'> {
  const { levelsGained, declines } = progressionCounters(document, turnsPerYear, lastTurnOf(document));
  const years = yearsOf(document, turnsPerYear);
  return { levelsGained: padTo(levelsGained, years), declines: padTo(declines, years) };
}

/** `hero.retired`, by controller, then by the age retired at. */
export function retirementAgeCounters(document: WorldDocument): GameCounters['retirementAges'] {
  const retirementAges: GameCounters['retirementAges'] = { player: {}, rival: {} };
  entriesOf(document, 'hero.retired').forEach((entry, index) => {
    const age = payloadField(entry, 'age');
    if (typeof age !== 'number') throw new Error(`hero.retired entry ${index} has no age`);
    const ages = retirementAges[guildOf(document, entry, `${index}`).controller.kind];
    ages[age] = (ages[age] ?? 0) + 1;
  });
  return retirementAges;
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
 * The player's Guild's Regard after `countedYear` years (M4, DL-55), by band, every band listed:
 * what the History, which records a Regard only when it crosses a band, cannot give.
 */
export interface RegardSnapshot {
  /** Each unordered pair of the player's Roster once, by the band of their Relationship (`relationshipBandCounts`). */
  relationships: Record<RegardBand, number>;
  /** The player's Guildmaster's Regard entries (`regardBandCounts`), for Patrons and for Heroes apart. */
  guildmasterForPatrons: Record<RegardBand, number>;
  guildmasterForHeroes: Record<RegardBand, number>;
}

/** A Rival in play as a year begins (M6, DL-69): its Disposition, its Roster's size and its Wealth. */
export interface RivalAtYearStart {
  disposition: string;
  heroes: number;
  wealth: number;
}

/**
 * The player's Guild's place in the Rankings as a year begins (M6, DL-69), by the engine's `rankings`:
 * 1 the first, by Fame and by Wealth, among `guilds` Guilds in play.
 */
export interface PlayerRanking {
  fame: number;
  wealth: number;
  guilds: number;
}

/**
 * What a game's observers gathered from its World State while it was played: what its History cannot
 * give, each counter's by its key (`game-counters.ts`, DL-239).
 */
export interface GameObservations {
  fameGate: Record<ControllerKind, FameGate>;
  /** The Rosters as each year begins, before the policy acts: index k is after k years, 0 the new world. */
  rosters: Record<ControllerKind, RosterCensus>[];
  /** Taken with the census after `countedYear` years; `null` until then, and for a game that stopped first. */
  regardAtCountedYear: RegardSnapshot | null;
  /** Each Rival in play, in Guild order, as each year begins: index as `rosters` (M6, DL-69). */
  rivalYearStarts: RivalAtYearStart[][];
  /** The player's Guild's place in the Rankings as each year begins; `null` for a world without it. */
  rankings: (PlayerRanking | null)[];
  /** Every Hero generated, and their Portraits and texts (v1.1.3-S6): `observeHeroes`. */
  heroes: HeroTally;
  /** The save as each year ended (`observeSave`, v1.1.3-S6): index k is after k + 1 years. */
  saves: SaveSize[];
  /** The World State as each year ended (`observeWorld`, v1.1.6-S17): index k is after k + 1 years. */
  worlds: WorldSize[];
  /** The highest Level each side's Heroes have reached by each year (`observeHighestLevels`, DL-259). */
  highestLevels: HighestLevels;
  /** Each Disposition's Rivals at the Roster floor as each year begins (`rivalsAtFloor`, DL-259): index as `rosters`. */
  rivalsAtFloor: Record<string, FloorTally>[];
  /** The player's Wealth in months of its Upkeep as each year begins (`playerWealthMonths`, DL-259): index as `rosters`. */
  playerWealthMonths: (number | null)[];
  /** The Board's top Tier and each side's best four as each year begins (`tierUnlocks`, DL-271): index as `rosters`. */
  tierUnlocks: TierUnlocks[];
  /** The Transfers that left a Rival seller's Roster below `rivalRosterMin` (`transfersShort`, DL-259). */
  transfersShort: number;
  /** The Parties sent, by the Fatigue of their Heroes as they set out and whether the Captain went (`observeDispatches`, DL-290). */
  dispatchFatigue: Record<ControllerKind, DispatchFatigue>;
  /** The free Heroes a rest band left out of their Guild's pool, sampled once a Day (`observeRestKept`, DL-290). */
  restKept: Record<ControllerKind, RestKept>;
  /** The Heroes Out of Contract and Under Offer, and the wages in force by Level, sampled as each Day begins (`observeContractDays`, DL-321). */
  contractDays: Record<ControllerKind, ContractDays>;
}

/** Every Hero generated in a game, and their Portraits and texts (v1.1.3-S6; DL-134 item 9, DL-135 item 6). */
export interface HeroTally {
  generated: number;
  /** With a picture, and with none, the Silhouette. */
  pictured: number;
  silhouettes: number;
  /** Of those with a picture, those whose picture another Hero on a Roster or in the pool held as they were given it. */
  repeats: number;
  /** The longest Appearance and Biography written, in characters (code points), and how many Heroes had either empty. */
  longestAppearance: number;
  longestBiography: number;
  blank: number;
}

export const noHeroes = (): HeroTally => ({ generated: 0, pictured: 0, silhouettes: 0, repeats: 0, longestAppearance: 0, longestBiography: 0, blank: 0 });

/** The save's size as a year ended (v1.1.3-S6). */
export interface SaveSize {
  /** `serialise(document).length`, in UTF-16 code units: its bytes while it is ASCII. */
  length: number;
  /** The part of it the Heroes' `portraitKey`, `appearance` and `biography` take, keys and quotes included. */
  heroFields: number;
  /**
   * Its length gzipped, as the page keeps it (DL-67): measured for the last year only, by `recordGame`
   * from the save it writes once the game stops (v1.1.5-S1), else `null`.
   */
  gzipped: number | null;
}

/** Rows of a table: those in play, and those out of play for good, written once (the engine's `writeOnce`). */
export interface RowCount {
  live: number;
  writeOnce: number;
}

/** The World State as a year ended (v1.1.6-S17, DL-203): its size, its rows and the per-Turn copy's time. */
export interface WorldSize {
  /** `world`'s length in the save, in characters (`savedLength`). */
  characters: number;
  /** The Heroes (dead, retired or gone from the pool written once), the Guildmasters (retired) and the Guilds (folded). */
  heroes: RowCount;
  guildmasters: RowCount;
  guilds: RowCount;
  /** The rows of every other table: Patrons, Quests, Parties, Items, stacks and Transfer Offers. */
  otherRows: number;
  /** The mean milliseconds of `copyWorld(world)`, the copy `advance` makes of it, over `copiesTimed` copies. */
  copyMs: number;
}

export const noFameGate = (): FameGate => ({ heroDays: 0, guildDays: 0, guildDaysWithAny: 0 });
export const noCensus = (): RosterCensus => ({ guilds: 0, wealth: 0, heroes: 0, levels: 0, atPotential: 0 });

/** The Heroes generated so far, and the last Turn whose `hero.generated` events were read, `null` before any. */
export interface HeroesSeen {
  tally: HeroTally;
  turnsRead: number | null;
}

/**
 * Reads each `hero.generated` among `events`, a batch: the world's creation's or one `advance`'s
 * (v1.1.3-S6, DL-211), with the Hero's row as `world` holds it just after the Turn that generated them: whether they have a picture
 * or the Silhouette, whether another Hero on a Roster or in the pool held the same picture as they were
 * given it (a repeat), and their texts' lengths, into `seen`'s tally. A pool Hero leaves before the
 * refill of the same night, so no Hero is gone the Turn they are generated; one whose row is gone is
 * not counted. Called once the world is created and after each `advance`.
 *
 * The holders are read once a batch, as the World State stands after it, less the batch's own Heroes,
 * who are added in the order they were generated: so the first holder of a picture is no repeat, and
 * each later one is (v1.1.3-S8). A holder who died or left within the same batch is not seen.
 *
 * Each batch is of one Turn, later than the last: an event of a Turn already read (`turnsRead`) is not
 * counted again.
 */
export function observeHeroes(seen: HeroesSeen, world: World, events: readonly Entry[]): void {
  const { tally } = seen;
  const read = seen.turnsRead;
  const fresh = events.filter((event) => event.type === 'hero.generated' && (read === null || event.turn > read));
  for (const { turn } of fresh) seen.turnsRead = Math.max(seen.turnsRead ?? turn, turn);
  const batch = fresh
    .map(({ payload }) => (typeof payload === 'object' && payload !== null ? Reflect.get(payload, 'heroId') : undefined));
  let heldBy: Map<string, number> | null = null;
  for (const heroId of batch) {
    const hero = typeof heroId === 'string' && Object.hasOwn(world.heroes, heroId) ? world.heroes[heroId as HeroId] : undefined;
    if (hero === undefined) continue;
    tally.generated += 1;
    const appearance = [...hero.appearance].length;
    const biography = [...hero.biography].length;
    tally.longestAppearance = Math.max(tally.longestAppearance, appearance);
    tally.longestBiography = Math.max(tally.longestBiography, biography);
    if (appearance === 0 || biography === 0) tally.blank += 1;
    if (hero.portraitKey === null) {
      tally.silhouettes += 1;
      continue;
    }
    tally.pictured += 1;
    heldBy ??= portraitHolders(world, new Set(batch.filter((id): id is string => typeof id === 'string')));
    const holders = heldBy.get(hero.portraitKey) ?? 0;
    if (holders > 0) tally.repeats += 1;
    heldBy.set(hero.portraitKey, holders + 1);
  }
}

/** How many Heroes on a Roster or in the pool hold each picture, those in `leaving` aside. */
function portraitHolders(world: World, leaving: ReadonlySet<string>): Map<string, number> {
  const held = new Map<string, number>();
  const count = (hero: Hero | undefined): void => {
    if (hero !== undefined && leaving.has(hero.id)) return;
    if (hero?.portraitKey !== null && hero?.portraitKey !== undefined) held.set(hero.portraitKey, (held.get(hero.portraitKey) ?? 0) + 1);
  };
  for (const guild of Object.values(world.guilds)) for (const heroId of guild.rosterIds) count(Object.hasOwn(world.heroes, heroId) ? world.heroes[heroId] : undefined);
  for (const hero of Object.values(world.heroes)) if (hero.unattachedSince !== null) count(hero);
  return held;
}

/** The characters the Heroes' three v1.1.3-S6 fields take in `world`'s save: each `"key":value` and its comma. */
export function heroFieldsLength(world: World): number {
  let length = 0;
  for (const { portraitKey, appearance, biography } of Object.values(world.heroes)) {
    // The three members and their two commas, less the braces, and the comma joining them to the rest.
    length += JSON.stringify({ portraitKey, appearance, biography }).length - 2 + 1;
  }
  return length;
}

/**
 * Adds to `saves` the save's size as a year ends (v1.1.3-S6): its text's `length`,
 * `serialise(document).length` or `savedLength(document)`, the Heroes' new fields' share, and, when
 * `gzipped` is given, its gzipped length.
 */
export function observeSave(saves: SaveSize[], world: World, length: number, gzipped: number | null = null): void {
  saves.push({ length, heroFields: heroFieldsLength(world), gzipped });
}

/** How many times `observeWorld` copies the World State to time the copy: their mean is the year's. */
export const copiesTimed = 3;

/** `rows`, counted live and written once by `isWriteOnce`. */
function countRows<Row>(rows: Readonly<Record<string, Row>>, isWriteOnce: (row: Row) => boolean): RowCount {
  const count: RowCount = { live: 0, writeOnce: 0 };
  for (const row of Object.values(rows)) count[isWriteOnce(row) ? 'writeOnce' : 'live'] += 1;
  return count;
}

/**
 * Adds to `worlds` the World State as a year ends (v1.1.6-S17, DL-203): its characters in the save,
 * its rows live and written once, and the per-Turn copy's time, the mean of `copiesTimed` copies of it
 * by the engine's `copyWorld` on the clock `now`. The copies are made and dropped: the copy leaves
 * `world` as it was, but for freezing its write-once rows, as the next `advance`'s copy would
 * (ADR-0011), so the game plays on as it would have. `characters` is `savedLength(world)`, given when
 * already counted.
 */
export function observeWorld(worlds: WorldSize[], world: World, now: () => number, characters = savedLength(world)): void {
  const started = now();
  for (let copy = 0; copy < copiesTimed; copy += 1) copyWorld(world);
  const copyMs = (now() - started) / copiesTimed;
  const { heroes, guildmasters, guilds, patrons, quests, parties, items, stacks, offers } = world;
  worlds.push({
    characters,
    heroes: countRows(heroes, writeOnce.heroes),
    guildmasters: countRows(guildmasters, writeOnce.guildmasters),
    guilds: countRows(guilds, writeOnce.guilds),
    otherRows: [patrons, quests, parties, items, stacks, offers].reduce((sum, table) => sum + Object.keys(table).length, 0),
    copyMs,
  });
}

/** A character JSON writes as an escape: a quote, a backslash, a control character or a surrogate, lone or not. */
// eslint-disable-next-line no-control-regex -- the control characters are what it looks for
const escaped = /["\\\u0000-\u001f\ud800-\udfff]/;

/**
 * `serialise(value).length`, counted without writing the text (v1.1.5-S1, DL-174), for the save the
 * play loop measures as each year ends: a 20-year game's save is 116 MB, and writing it at each
 * year's end took a sixth of the game's time and most of its memory. The order of keys
 * does not change the length, so none are sorted. For a JSON-safe value, as `serialise` requires: a
 * string is its length and two quotes unless it holds a character JSON escapes, when it is
 * `JSON.stringify`'s; a number is as `JSON.stringify` writes it.
 */
export function savedLength(value: unknown): number {
  if (typeof value === 'string') return escaped.test(value) ? JSON.stringify(value).length : value.length + 2;
  if (typeof value === 'number') return Number.isSafeInteger(value) && value >= 0 ? digits(value) : JSON.stringify(value).length;
  if (typeof value === 'boolean') return value ? 4 : 5;
  if (value === null) return 4;
  if (typeof value !== 'object') throw new TypeError(`Only a JSON-safe value has a save's length, not a ${typeof value}`);
  if (Array.isArray(value)) {
    // The brackets and a comma between each two items.
    let length = Math.max(2, value.length + 1);
    for (const item of value as unknown[]) length += savedLength(item);
    return length;
  }
  const object = value as Record<string, unknown>;
  const keys = Object.keys(object);
  // The braces, a comma between each two members, and each member's colon.
  let length = Math.max(2, keys.length + 1) + keys.length;
  for (const key of keys) length += savedLength(key) + savedLength(object[key]);
  return length;
}

/** A list's or an object's length in the save from its members' count and their characters: the brackets or braces, and a comma between each two. */
const enclosed = (members: number, characters: number): number => Math.max(2, members + 1) + characters;

/** A History index's members' length in the save: its keys counted and each list's positions. */
interface IndexLength {
  /** Each key's list: the positions counted, and their characters. */
  lists: Map<string, { positions: number; characters: number }>;
  /** Each member's key, colon and list. */
  characters: number;
}

/**
 * A count of a History's length in the save, `savedLength(history)`, kept as the History grows (DL-238):
 * the History is append-only (ADR-0008), so each call reads only the entries appended since the
 * last, each once, and of the indexes only the lists of the types and the entities those entries
 * name, from the positions it last counted. The play loop's yearly save is counted so, rather than
 * walked whole.
 *
 * @throws RangeError when asked of a History other than the one it began with
 */
export function historyLengthCounter(): (history: Readonly<History>) => number {
  let counting: Readonly<History> | null = null;
  let entries = 0;
  let entryCharacters = 0;
  let milestones = 0;
  let milestoneCharacters = 0;
  const indexes: Record<'byEntity' | 'byType', IndexLength> = {
    byEntity: { lists: new Map(), characters: 0 },
    byType: { lists: new Map(), characters: 0 },
  };
  /** Adds to `index` the positions its list for each of `keys` holds beyond those counted. */
  const grow = (index: IndexLength, lists: Readonly<Record<string, readonly number[]>>, keys: ReadonlySet<string>): void => {
    for (const key of keys) {
      const list = lists[key] ?? [];
      const was = index.lists.get(key);
      const now = { positions: was?.positions ?? 0, characters: was?.characters ?? 0 };
      for (; now.positions < list.length; now.positions += 1) now.characters += savedLength(list[now.positions]);
      // A new member is its key and colon too; a member counted before, its list anew.
      index.characters += was === undefined ? savedLength(key) + 1 : -enclosed(was.positions, was.characters);
      index.characters += enclosed(now.positions, now.characters);
      index.lists.set(key, now);
    }
  };
  return (history) => {
    counting ??= history;
    if (counting !== history) throw new RangeError("A count of a History's length follows the one History it began with");
    const named = new Set<string>();
    const types = new Set<string>();
    for (; entries < history.entries.length; entries += 1) {
      const entry = history.entries[entries] as Entry;
      entryCharacters += savedLength(entry);
      for (const id of entry.participants) named.add(id);
      types.add(entry.type);
    }
    grow(indexes.byEntity, history.byEntity, named);
    grow(indexes.byType, history.byType, types);
    for (; milestones < history.milestones.length; milestones += 1) milestoneCharacters += savedLength(history.milestones[milestones]);

    const sections: Record<keyof History, number> = {
      entries: enclosed(entries, entryCharacters),
      byEntity: enclosed(indexes.byEntity.lists.size, indexes.byEntity.characters),
      byType: enclosed(indexes.byType.lists.size, indexes.byType.characters),
      milestones: enclosed(milestones, milestoneCharacters),
    };
    const keys = Object.keys(history);
    let length = enclosed(keys.length, keys.length);
    for (const key of keys) length += savedLength(key) + (Object.hasOwn(sections, key) ? sections[key as keyof History] : savedLength(history[key as keyof History]));
    return length;
  };
}

/**
 * `document`'s length in the save, `savedLength(document)`, from its History's as `counted` keeps it
 * and its World State's, `world`, already counted: what the play loop observes as each year ends.
 */
export function savedDocumentLength(document: WorldDocument, counted: (history: Readonly<History>) => number, world: number): number {
  const keys = Object.keys(document);
  let length = enclosed(keys.length, keys.length);
  for (const key of keys) {
    const value: unknown = document[key as keyof WorldDocument];
    length += savedLength(key) + (key === 'history' ? counted(document.history) : key === 'world' ? world : savedLength(value));
  }
  return length;
}

/** The digits of a whole number from 0, as `JSON.stringify` writes it. */
function digits(whole: number): number {
  let count = 1;
  for (let rest = whole; rest >= 10; rest = Math.floor(rest / 10)) count += 1;
  return count;
}

/** The player's Guild's place in `world`'s Rankings by Fame and by Wealth (`rankings`); `null` when it is in neither. */
export function playerRanking(world: World): PlayerRanking | null {
  const guild = playerGuild(world);
  if (guild === undefined) return null;
  const placeBy = (by: RankingMeasure): { rank: number | undefined; guilds: number } => {
    const ranked = rankings(world, by);
    return { rank: ranked.find((ranking) => ranking.guildId === guild.id)?.rank, guilds: ranked.length };
  };
  const fame = placeBy('fame');
  const wealth = placeBy('wealth');
  if (fame.rank === undefined || wealth.rank === undefined) return null;
  return { fame: fame.rank, wealth: wealth.rank, guilds: fame.guilds };
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
 * Whether `world` stands on the first Turn of a year after the `taken` year-starts a census has
 * counted (the new world's the first): a census counts each year-start once, and none but those, so
 * it may be asked as the world is created and as each year ends.
 */
export function isYearStart(world: World, taken: number, deps: EngineDeps): boolean {
  return world.turn === taken * deps.config.turnsPerYear;
}

/** Every Roster of a Guild in play in `world`, by the Guild's controller: the Guilds, their Wealth, Heroes and Levels, and the Heroes at Potential. */
export function rosterCensus(world: World, deps: EngineDeps): Record<ControllerKind, RosterCensus> {
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
  return census;
}

/** Each Rival in play in `world`, in Guild order: its Disposition, its Roster's size and its Wealth (M6, DL-69). */
export function rivalsInPlay(world: World): RivalAtYearStart[] {
  const rivals: RivalAtYearStart[] = [];
  for (const guild of guildsInPlay(world)) {
    const disposition = dispositionOf(guild);
    if (disposition !== null) rivals.push({ disposition, heroes: guild.rosterIds.length, wealth: guild.wealth });
  }
  return rivals;
}

/**
 * Adds to `gate`, on a morning, the Fame gate: the pool Heroes who would refuse each Guild in play
 * (DL-38 item 9), read from `world` as it stands before the policy acts; nothing on any other Turn.
 */
export function observeFameGate(gate: Record<ControllerKind, FameGate>, world: World, deps: EngineDeps): void {
  if (timeOfDay(world.turn) !== 'morning') return;
  for (const guild of guildsInPlay(world)) {
    const refusing = unsignableHeroes(world, guild, deps.config).length;
    const tally = gate[guild.controller.kind];
    tally.heroDays += refusing;
    tally.guildDays += 1;
    if (refusing > 0) tally.guildDaysWithAny += 1;
  }
}

// ── The Targets' readings (DL-259) ───────────────────────────────────────────────────────────

/** One side's Quests taken: how many, the Heroes sent on them and the Days they were away (DL-259). */
export interface QuestWeight {
  quests: number;
  heroes: number;
  days: number;
}

export const noQuestWeight = (): QuestWeight => ({ quests: 0, heroes: 0, days: 0 });

/**
 * `quest.taken` by the taking Guild's side (`sideOf`): the Quests, the Heroes sent (`heroIds`) and
 * the Days away, from the Day it was taken to the Day of the night it comes home (`returnsOnTurn`).
 *
 * @throws Error on an entry naming no Guild the world holds, or without its Heroes or return
 */
export function questWeightCounters(document: WorldDocument): Record<string, QuestWeight> {
  const weights: Record<string, QuestWeight> = {};
  entriesOf(document, 'quest.taken').forEach((entry, index) => {
    const what = `quest.taken entry ${index}`;
    const heroIds = payloadField(entry, 'heroIds');
    if (!Array.isArray(heroIds)) throw new Error(`${what} has no heroIds`);
    const weight = (weights[sideOf(guildOf(document, entry, `${index}`))] ??= noQuestWeight());
    weight.quests += 1;
    weight.heroes += heroIds.length;
    weight.days += dayOf(numberField(entry, 'returnsOnTurn', what)) - dayOf(entry.turn);
  });
  return weights;
}

// ── The Tiers' readings (DL-262) ─────────────────────────────────────────────────────────────

/** One controller's Quests of one Tier (DL-262): those taken, and those of them resolved. */
export interface TierSideTally {
  /** `quest.taken`: the Quests, the Heroes sent and the Days away, as `questWeightCounters` counts them. */
  taken: number;
  heroes: number;
  days: number;
  /** `quest.resolved`, the Days away of those Quests, and each by its band. */
  resolved: number;
  resolvedDays: number;
  fail: number;
  success: number;
  strong: number;
  /** The Wealth they paid, the XP their Heroes home took (`xpPerHero` each), and the Loot they left (`quest.loot`). */
  wealth: number;
  xp: number;
  loot: number;
  /** The Heroes who died on them (`quest.resolved`'s `deaths`): Death by Tier (DL-257 item 5, DL-265). */
  deaths: number;
}

/** A Tier's Quests: those offered, every Guild's Board alike, and each controller's taken (DL-262). */
export interface TierTally {
  offered: number;
  byController: Partial<Record<ControllerKind, TierSideTally>>;
}

export const noTierSide = (): TierSideTally => ({
  taken: 0,
  heroes: 0,
  days: 0,
  resolved: 0,
  resolvedDays: 0,
  fail: 0,
  success: 0,
  strong: 0,
  wealth: 0,
  xp: 0,
  loot: 0,
  deaths: 0,
});

/**
 * Quests by their Tier (DL-262), by the Tier's number: `quest.offered`, which names it; `quest.taken`,
 * which names it too, by the controller of the taking Guild, with the Heroes sent and the Days away
 * (from the Day it was taken to the Day of the night it comes home); and `quest.resolved` and
 * `quest.loot`, which name the Quest, joined to its Tier and Days through its `quest.taken`; the Deaths
 * are `quest.resolved`'s (DL-265). The engine names every Quest's Tier, which the validator holds; an
 * entry naming none, a test's, or the return of a Quest whose taking names none, is left out.
 *
 * @throws Error on an entry of a Quest of a Tier without its Heroes, return, band or XP, or naming no
 * Guild the world holds
 */
export function questTierCounters(document: WorldDocument): Record<string, TierTally> {
  const tiers: Record<string, TierTally> = {};
  const tierOf = (tier: number): TierTally => (tiers[tier] ??= { offered: 0, byController: {} });
  const tierIn = (entry: Entry): number | undefined => {
    const tier = payloadField(entry, 'tier');
    return typeof tier === 'number' ? tier : undefined;
  };
  for (const entry of entriesOf(document, 'quest.offered')) {
    const tier = tierIn(entry);
    if (tier !== undefined) tierOf(tier).offered += 1;
  }
  const taken = new Map<unknown, { tier: number; days: number }>();
  entriesOf(document, 'quest.taken').forEach((entry, index) => {
    const what = `quest.taken entry ${index}`;
    const tier = tierIn(entry);
    if (tier === undefined) return;
    const days = dayOf(numberField(entry, 'returnsOnTurn', what)) - dayOf(entry.turn);
    const side = (tierOf(tier).byController[guildOf(document, entry, `${index}`).controller.kind] ??= noTierSide());
    side.taken += 1;
    side.heroes += listLength(entry, 'heroIds', what);
    side.days += days;
    taken.set(payloadField(entry, 'questId'), { tier, days });
  });
  /** The controller's tally of the Quest an entry names, as its `quest.taken` set it. */
  const sideOfQuest = (entry: Entry, what: string): { side: TierSideTally; days: number } | undefined => {
    const quest = taken.get(payloadField(entry, 'questId'));
    if (quest === undefined) return undefined;
    const side = (tierOf(quest.tier).byController[guildOf(document, entry, what).controller.kind] ??= noTierSide());
    return { side, days: quest.days };
  };
  entriesOf(document, 'quest.resolved').forEach((entry, index) => {
    const what = `quest.resolved entry ${index}`;
    const quest = sideOfQuest(entry, what);
    if (quest === undefined) return;
    const { side, days } = quest;
    const band = payloadField(entry, 'band');
    if (!isBand(band)) throw new Error(`${what} has no band`);
    const deaths = listLength(entry, 'deaths', what);
    const home = listLength(entry, 'heroIds', what) - deaths;
    side.resolved += 1;
    side.resolvedDays += days;
    side[band] += 1;
    side.wealth += numberField(entry, 'wealthDelta', what);
    side.xp += numberField(entry, 'xpPerHero', what) * home;
    side.deaths += deaths;
  });
  entriesOf(document, 'quest.loot').forEach((entry, index) => {
    const quest = sideOfQuest(entry, `quest.loot entry ${index}`);
    if (quest !== undefined) quest.side.loot += 1;
  });
  return tiers;
}

/**
 * The highest Level each side's Heroes have reached by each year, by side (`sideOf`): index k by the
 * end of year k + 1, `null` in the years before the side had a Hero on a Roster, and carried on to
 * the game's end once it had (DL-83 items 20 and 22).
 */
export type HighestLevels = Record<string, (number | null)[]>;

/** The year a world standing on `turn` has played into: the year of its last Turn played, the first for a new world. */
const yearPlayed = (turn: number, turnsPerYear: number): number => Math.floor(Math.max(0, turn - 1) / turnsPerYear);

/** `series` lengthened to reach `year`, each new year the last's, or `null` before any. */
function carriedTo(series: (number | null)[], year: number): void {
  while (series.length <= year) series.push(series.at(-1) ?? null);
}

/**
 * Raises `highest`, as a game stands at `world`, to the Levels of every Hero on a Roster of a Guild
 * in play and to each `hero.levelled` among `events`, the Turn's own, so that a Hero who levelled and
 * left a Roster on the same Turn counts for the side they levelled on.
 */
export function observeHighestLevels(highest: HighestLevels, world: World, events: readonly Entry[], turnsPerYear: number): void {
  const year = yearPlayed(world.turn, turnsPerYear);
  const raise = (guild: Guild, level: number): void => {
    const series = (highest[sideOf(guild)] ??= []);
    carriedTo(series, year);
    series[year] = Math.max(series[year] ?? 0, level);
  };
  for (const guild of guildsInPlay(world)) {
    for (const heroId of guild.rosterIds) {
      const hero = Object.hasOwn(world.heroes, heroId) ? world.heroes[heroId] : undefined;
      if (hero !== undefined) raise(guild, hero.level);
    }
  }
  for (const entry of events) {
    if (entry.type !== 'hero.levelled') continue;
    const guildId = payloadField(entry, 'guildId');
    const guild = isId('guilds', guildId) && Object.hasOwn(world.guilds, guildId) ? world.guilds[guildId as GuildId] : undefined;
    if (guild !== undefined) raise(guild, numberField(entry, 'level', 'A hero.levelled entry'));
  }
}

/** Every series of `highest` carried on to the year a world standing on `turn` has played into: the game's end. */
export function carryHighestLevels(highest: HighestLevels, turn: number, turnsPerYear: number): void {
  const year = yearPlayed(turn, turnsPerYear);
  for (const series of Object.values(highest)) carriedTo(series, year);
}

/** Upkeeps in hand above which a Rival at the Roster floor hoards (DL-69 item 4, DL-300). */
export const hoardingUpkeeps = 20 / 3;

/** One Disposition's Rivals as a year begins: how many, and how many at the Roster floor with more than `hoardingUpkeeps` Upkeeps in hand. */
export interface FloorTally {
  starts: number;
  hoarding: number;
}

/**
 * Each Disposition's Rivals in play in `world`, and those at the Roster floor, `rivalRosterMin`
 * Heroes or fewer, holding more Wealth than `hoardingUpkeeps` of their Upkeeps (`upkeep`): hoarding
 * with a starving Roster (DL-69 item 4).
 */
export function rivalsAtFloor(world: World, deps: EngineDeps): Record<string, FloorTally> {
  const tallies: Record<string, FloorTally> = {};
  for (const guild of guildsInPlay(world)) {
    const disposition = dispositionOf(guild);
    if (disposition === null) continue;
    const tally = (tallies[disposition] ??= { starts: 0, hoarding: 0 });
    tally.starts += 1;
    if (guild.rosterIds.length <= deps.config.rivalRosterMin && guild.wealth > hoardingUpkeeps * upkeep(guild, world, deps.config, deps.content)) tally.hoarding += 1;
  }
  return tallies;
}

/** One side's Guilds in play as a year begins (DL-271): how many, their best fours' Levels summed, and how many had unlocked each Tier, index k Tier k + 1. */
export interface UnlockTally {
  guilds: number;
  levels: number;
  unlocked: number[];
}

/** The Board's top Tier as a year begins, and each side's Guilds' best fours and the Tiers they had unlocked (DL-271). */
export interface TierUnlocks {
  top: number;
  sides: Record<string, UnlockTally>;
}

/**
 * The Board's top Tier in `world` (`boardTopTier`), and for each side (`sideOf`: the player's Guild, and
 * each Disposition's Rivals) its Guilds in play, the mean Level of each one's best four
 * (`bestFourLevel`) and the Tier it unlocks (`unlockedTier`, DL-271).
 */
export function tierUnlocks(world: World, deps: EngineDeps): TierUnlocks {
  const sides: Record<string, UnlockTally> = {};
  for (const guild of guildsInPlay(world)) {
    const level = bestFourLevel(guild, world, deps.config);
    const tally = (sides[sideOf(guild)] ??= { guilds: 0, levels: 0, unlocked: deps.config.tiers.map(() => 0) });
    tally.guilds += 1;
    tally.levels += level;
    const tier = unlockedTier(level, deps.config);
    tally.unlocked[tier - 1] = (tally.unlocked[tier - 1] ?? 0) + 1;
  }
  return { top: boardTopTier(world, deps.config), sides };
}

/**
 * The player's Wealth in months of its Upkeep (`upkeep`), one Upkeep a month of costs (DL-83 item 7,
 * DL-294 item 4, DL-300); `null` with no player's Guild in play or no Upkeep owed.
 */
export function playerWealthMonths(world: World, deps: EngineDeps): number | null {
  const guild = playerGuild(world);
  if (guild === undefined || guild.foldedOnTurn !== null) return null;
  const owed = upkeep(guild, world, deps.config, deps.content);
  return owed <= 0 ? null : guild.wealth / owed;
}

/**
 * The Transfers among `events`, an `advance`'s, that left a Rival seller's Roster below
 * `rivalRosterMin` (DL-69 item 4): each Roster followed from `before`, the world the Turn began
 * with, through the Turn's entries in order, a Hero recruited or transferred in adding one and a Hero
 * transferred out, dead (on the Roster the Turn's entries left them on), retired or gone from a
 * folded Guild taking one. A Guild not in `before` is not followed.
 */
export function transfersShort(before: World, events: readonly Entry[], config: EngineDeps['config']): number {
  if (!events.some((entry) => entry.type === 'hero.transferred')) return 0;
  const sizes = new Map<unknown, number>();
  const move = (guildId: unknown, by: number): number => {
    const guild = isId('guilds', guildId) && Object.hasOwn(before.guilds, guildId) ? before.guilds[guildId as GuildId] : undefined;
    if (guild === undefined) return Number.POSITIVE_INFINITY;
    const size = (sizes.get(guildId) ?? guild.rosterIds.length) + by;
    sizes.set(guildId, size);
    return size;
  };
  // Each Hero's Guild as the Turn's entries move them: `hero.died` names the Hero and the Quest, not the Guild.
  const movedTo = new Map<unknown, unknown>();
  const heroGuild = (heroId: unknown): unknown =>
    movedTo.has(heroId) ? movedTo.get(heroId) : isId('heroes', heroId) && Object.hasOwn(before.heroes, heroId) ? before.heroes[heroId as HeroId]?.guildId : undefined;
  let short = 0;
  for (const entry of events) {
    if (entry.type === 'hero.recruited') {
      move(payloadField(entry, 'guildId'), 1);
      movedTo.set(payloadField(entry, 'heroId'), payloadField(entry, 'guildId'));
    } else if (entry.type === 'hero.retired' || entry.type === 'hero.left-guild' || entry.type === 'hero.released') move(payloadField(entry, 'guildId'), -1);
    else if (entry.type === 'hero.died') move(heroGuild(payloadField(entry, 'heroId')), -1);
    else if (entry.type === 'hero.transferred') {
      move(payloadField(entry, 'toGuildId'), 1);
      movedTo.set(payloadField(entry, 'heroId'), payloadField(entry, 'toGuildId'));
      const fromGuildId = payloadField(entry, 'fromGuildId');
      const seller = isId('guilds', fromGuildId) && Object.hasOwn(before.guilds, fromGuildId) ? before.guilds[fromGuildId as GuildId] : undefined;
      if (move(fromGuildId, -1) < config.rivalRosterMin && seller?.controller.kind === 'rival') short += 1;
    }
  }
  return short;
}

// ── Fatigue's lines (DL-290) ─────────────────────────────────────────────────────
// Read from the History or the World State, drawing nothing, so that play is as it was without them
// (DL-239): the Party's Fatigue and Captain as it set out are the world's, which no entry records.

/** The lowest Fatigue band the lines call "tired or worse": the player's rest band by default, and steady's and miserly's (DL-286). */
export const tiredBand: FatigueBand = 'tired';

const bandRank = (band: FatigueBand): number => fatigueBandNames.indexOf(band);

/** The Parties a kind of Guild sent, with the Fatigue of their Heroes as each set out and whether the Guild's Captain went (DL-290). */
export interface DispatchFatigue {
  parties: number;
  /** Of those, the Parties with a Hero at `tiredBand` or past it as they set out. */
  tired: number;
  /** The Parties by the band of their most tired Hero. */
  byWorstBand: Record<FatigueBand, number>;
  /** The Heroes sent, and their Fatigue as they set out, summed: the mean Fatigue at dispatch. */
  heroes: number;
  fatigue: number;
  /** The Parties of a Guild with a Captain named as they set out, and of those the Parties that included the Captain. */
  captainNamed: number;
  captained: number;
}

export const noDispatchFatigue = (): DispatchFatigue => ({
  parties: 0,
  tired: 0,
  byWorstBand: { fresh: 0, weary: 0, tired: 0, exhausted: 0 },
  heroes: 0,
  fatigue: 0,
  captainNamed: 0,
  captained: 0,
});

/**
 * Tallies into `taken`, by the controller of the Guild, each Party in `world` not in `seen`, and adds
 * it to `seen`: its `fatigueAtDispatch` (DL-282) read by `fatigueBand`, and whether its Guild's Captain
 * is among its Heroes. Told after each `advance`, it meets a Party the Turn it set out: the player's
 * from the policy's actions before the Turn, a Rival's from its afternoon in it, and a Party stays out
 * a Day at least. The Guild's Captain is as that Turn left it: a Captain at home who retires that night,
 * or a Rival's sold the same afternoon, leaves the Party out of `captainNamed`, which is rare (DL-291).
 */
export function observeDispatches(
  taken: Record<ControllerKind, DispatchFatigue>,
  seen: Set<string>,
  world: World,
  config: EngineDeps['config'],
): void {
  for (const party of Object.values(world.parties)) {
    if (seen.has(party.id)) continue;
    seen.add(party.id);
    const guild = Object.hasOwn(world.guilds, party.guildId) ? world.guilds[party.guildId] : undefined;
    if (guild === undefined) continue;
    const tally = taken[guild.controller.kind];
    let worst = 0;
    for (const heroId of party.heroIds) {
      const fatigue = party.fatigueAtDispatch[heroId] ?? 0;
      tally.heroes += 1;
      tally.fatigue += fatigue;
      worst = Math.max(worst, bandRank(fatigueBand(fatigue, config)));
    }
    tally.parties += 1;
    tally.byWorstBand[fatigueBandNames[worst] as FatigueBand] += 1;
    if (worst >= bandRank(tiredBand)) tally.tired += 1;
    if (guild.captainId !== null) {
      tally.captainNamed += 1;
      if (party.heroIds.includes(guild.captainId)) tally.captained += 1;
    }
  }
}

/** The free Heroes of the Guilds in play, and how many a rest band left out of their pool (`partyPool`), sampled once a Day (DL-290). */
export interface RestKept {
  /** Guild-Days sampled, and of those the ones on which the rest band left at least one free Hero out. */
  guildDays: number;
  guildDaysKept: number;
  /** The free Heroes (`availableHeroes`) over the samples, and of them those left out of the pool. */
  free: number;
  kept: number;
}

export const noRestKept = (): RestKept => ({ guildDays: 0, guildDaysKept: 0, free: 0, kept: 0 });

/** The Turn each kind of Guild's pool is sampled on, by its time of day (`observeRestKept`). */
const restSampledOn: Record<ControllerKind, TimeOfDay> = { player: 'night', rival: 'morning' };

/**
 * Samples into `taken`, once a Day, each Guild in play in the world it sends its Parties from (DL-290):
 * the player's on a night's Turn, as the policy chooses after the night has brought its Heroes home and
 * rested them, before it sends them; a Rival's on a morning's, the world its afternoon reads. A morning
 * would read the player's pool after the night's sending, the rested gone and the kept left. A Guild's
 * free Heroes and the ones its rest band leaves out of its pool; any other Turn adds nothing.
 */
export function observeRestKept(taken: Record<ControllerKind, RestKept>, world: World, deps: Pick<EngineDeps, 'config' | 'content'>): void {
  const now = timeOfDay(world.turn);
  for (const guild of guildsInPlay(world)) {
    if (restSampledOn[guild.controller.kind] !== now) continue;
    const free = availableHeroes(world, guild).length;
    const kept = free - partyPool(world, guild, deps).length;
    const tally = taken[guild.controller.kind];
    tally.guildDays += 1;
    tally.free += free;
    tally.kept += kept;
    if (kept > 0) tally.guildDaysKept += 1;
  }
}

/** Recoveries to one band: spells begun at a homecoming, and how each ended (DL-290). */
export interface RecoveryTally {
  /** Homecomings at or past the band the spell ends below. */
  spells: number;
  /** Spells that ended as Fatigue fell below it, and the Days they took, summed. */
  done: number;
  doneDays: number;
  /** Spells cut short as the Hero was sent again first, and the Days they had run, summed. */
  sent: number;
  sentDays: number;
  /** Spells ended as the Hero left every Roster, by a Retirement or their Guild's fold, where no night rests them (DL-291). */
  left: number;
  /** Spells still running when the game stopped. */
  open: number;
}

export const noRecoveryTally = (): RecoveryTally => ({ spells: 0, done: 0, doneDays: 0, sent: 0, sentDays: 0, left: 0, open: 0 });

/** A kind of Guild's Heroes' recoveries at home: to below their Guild's rest band, and to fresh. */
export interface Recovery {
  toRest: RecoveryTally;
  toFresh: RecoveryTally;
}

export const noRecovery = (): Recovery => ({ toRest: noRecoveryTally(), toFresh: noRecoveryTally() });

/** A recovery running: where it began and what ends it. */
interface Spell {
  tally: RecoveryTally;
  since: number;
  /** The band rank Fatigue must fall below. */
  below: number;
}

/**
 * The Days Heroes take to recover at home (DL-290), from `hero.fatigue-changed` (the band a Hero is
 * in, which a night records only on crossing one), `quest.taken`, `quest.resolved`, `hero.retired`,
 * `hero.left-guild` and `hero.released`, in the order of the History. A recovery begins when a Hero comes home alive from a
 * Quest in a band at or past the one it ends below, for the Guild that sent them; it ends when a night
 * takes them below it, or is cut short when they are sent again, or ends as left when they leave every
 * Roster, retired, released or sent to the pool at a fold, where no night moves their Fatigue (DL-291), or is left
 * open at the game's end. The two bands are the Guild's
 * rest band (`restBandOf`; a Guild with none begins none) and fresh. The Days are the Turns between
 * the Quest's return and the night that ends it, over `turnsPerDay`: 0 for a night the Hero fell on
 * the very night they came home, as the Hero State Engine runs after the Quest concludes.
 */
export function recoveryCounters(document: WorldDocument, deps: Pick<EngineDeps, 'config' | 'content'>): Record<ControllerKind, Recovery> {
  const counts = { player: noRecovery(), rival: noRecovery() };
  const events = (['hero.fatigue-changed', 'quest.taken', 'quest.resolved', 'hero.retired', 'hero.left-guild', 'hero.released'] as const)
    .flatMap((type) => positionedEntriesOf(document, type))
    .sort((a, b) => a.position - b.position);
  const bands = new Map<string, number>();
  const running = new Map<string, Spell[]>();
  const days = (from: number, to: number): number => (to - from) / turnsPerDay;
  for (const { entry, position } of events) {
    const what = `${entry.type} entry ${position}`;
    if (entry.type === 'hero.fatigue-changed') {
      const heroId = payloadField(entry, 'heroId');
      const after = fatigueBandNames.indexOf(payloadField(entry, 'bandAfter') as FatigueBand);
      if (typeof heroId !== 'string' || after < 0) throw new Error(`${what} has no heroId or no bandAfter`);
      bands.set(heroId, after);
      const left = (running.get(heroId) ?? []).filter((spell) => {
        if (after >= spell.below) return true;
        spell.tally.done += 1;
        spell.tally.doneDays += days(spell.since, entry.turn);
        return false;
      });
      running.set(heroId, left);
    } else if (entry.type === 'hero.retired' || entry.type === 'hero.left-guild' || entry.type === 'hero.released') {
      const heroId = payloadField(entry, 'heroId');
      if (typeof heroId !== 'string') throw new Error(`${what} has no heroId`);
      for (const spell of running.get(heroId) ?? []) spell.tally.left += 1;
      running.delete(heroId);
    } else if (entry.type === 'quest.taken') {
      const heroIds = payloadField(entry, 'heroIds');
      if (!Array.isArray(heroIds)) throw new Error(`${what} has no heroIds`);
      for (const heroId of heroIds as string[]) {
        for (const spell of running.get(heroId) ?? []) {
          spell.tally.sent += 1;
          spell.tally.sentDays += days(spell.since, entry.turn);
        }
        running.delete(heroId);
      }
    } else {
      const heroIds = payloadField(entry, 'heroIds');
      if (!Array.isArray(heroIds)) throw new Error(`${what} has no heroIds`);
      const deaths = payloadField(entry, 'deaths');
      const dead = new Set<unknown>(Array.isArray(deaths) ? deaths : []);
      const guild = guildOf(document, entry, `${position}`);
      const recovery = counts[guild.controller.kind];
      const restBand = restBandOf(guild, deps);
      const begin = (tally: RecoveryTally, below: number, band: number, heroId: string): void => {
        if (band < below) return;
        tally.spells += 1;
        running.set(heroId, [...(running.get(heroId) ?? []), { tally, since: entry.turn, below }]);
      };
      for (const heroId of heroIds as string[]) {
        if (dead.has(heroId)) continue;
        const band = bands.get(heroId) ?? 0;
        if (restBand !== null) begin(recovery.toRest, bandRank(restBand), band, heroId);
        begin(recovery.toFresh, 1, band, heroId);
      }
    }
  }
  for (const spells of running.values()) for (const spell of spells) spell.tally.open += 1;
  return counts;
}

/** The Injuries taken on a Quest and the hurt's relief in play for each: by a Healer, by a heal Item, by both, or by neither (DL-290). */
export interface ReliefTally {
  injuries: number;
  healer: number;
  item: number;
  both: number;
  neither: number;
  /** Of those, the Injuries taken at the last Encounter the Quest reached, with none after it for the relief to ease. */
  atLast: number;
}

export const noRelief = (): ReliefTally => ({ injuries: 0, healer: 0, item: 0, both: 0, neither: 0, atLast: 0 });

/** What a Quest's `quest.encounter` entries say of whom they harmed. */
interface QuestHarm {
  /** The last Encounter reached. */
  last: number;
  /** The Encounters each Hero was injured at, in order. */
  injured: Map<string, number[]>;
  /** The Encounter each Hero died at. */
  died: Map<string, number>;
}

/**
 * Each `hero.injured` of a Quest, by the controller of the Hero's Guild then, classed by the relief
 * of the hurt it brought (DL-285, DL-290): relieved by a Healer when another Hero of the Party, of a
 * Class content marks `relievesHurt` (`relievesHurt`), had not died by the end of the Encounter the
 * Injury was taken at and an Encounter followed it, since the engine eases the hurt from the next
 * Encounter on with the Healers then alive; and by a heal Item when an `item.expended` heal names the
 * Hero, the Quest and that Encounter, which shortens the Injury whether or not one follows. The
 * Encounter is the first `quest.encounter` of the Quest whose `injured` names the Hero, not yet
 * matched to an earlier Injury of theirs. An Injury at the Quest's last Encounter reached is counted
 * in `atLast` too.
 * An Injury off a Quest (`questId` null) is none of a Party's, and is left out.
 */
export function reliefCounters(document: WorldDocument, deps: Pick<EngineDeps, 'content'>): Record<ControllerKind, ReliefTally> {
  const counts = { player: noRelief(), rival: noRelief() };
  const parties = new Map<string, string[]>();
  entriesOf(document, 'quest.taken').forEach((entry, index) => {
    const [questId, heroIds] = [payloadField(entry, 'questId'), payloadField(entry, 'heroIds')];
    if (typeof questId !== 'string' || !Array.isArray(heroIds)) throw new Error(`quest.taken entry ${index} has no questId or heroIds`);
    parties.set(questId, heroIds as string[]);
  });
  const harm = new Map<string, QuestHarm>();
  entriesOf(document, 'quest.encounter').forEach((entry, index) => {
    const what = `quest.encounter entry ${index}`;
    const questId = payloadField(entry, 'questId');
    const [injured, died] = [payloadField(entry, 'injured'), payloadField(entry, 'died')];
    if (typeof questId !== 'string' || !Array.isArray(injured) || !Array.isArray(died)) throw new Error(`${what} has no questId, injured or died`);
    const at = numberField(entry, 'index', what);
    const quest = harm.get(questId) ?? { last: -1, injured: new Map(), died: new Map() };
    quest.last = Math.max(quest.last, at);
    for (const heroId of injured as string[]) quest.injured.set(heroId, [...(quest.injured.get(heroId) ?? []), at]);
    for (const heroId of died as string[]) quest.died.set(heroId, quest.died.get(heroId) ?? at);
    harm.set(questId, quest);
  });
  const healed = new Set<string>();
  for (const entry of entriesOf(document, 'item.expended')) {
    if (payloadField(entry, 'effect') !== 'heal') continue;
    healed.add(`${String(payloadField(entry, 'questId'))}|${String(payloadField(entry, 'heroId'))}|${String(payloadField(entry, 'encounterIndex'))}`);
  }
  const { heroes } = document.world;
  const isHealer = (heroId: string): boolean =>
    Object.hasOwn(heroes, heroId) && relievesHurt((heroes[heroId as HeroId] as Hero).classKey, deps.content);
  entriesOf(document, 'hero.injured').forEach((entry, index) => {
    const [heroId, questId] = [payloadField(entry, 'heroId'), payloadField(entry, 'questId')];
    // An Injury off a Quest has no Party to relieve it.
    if (typeof heroId !== 'string' || typeof questId !== 'string') return;
    const party = parties.get(questId) ?? [];
    const quest = harm.get(questId);
    // The engine writes an Encounter for every Injury; one without (a test's) was relieved by neither.
    const at = quest?.injured.get(heroId)?.shift();
    const byHealer =
      quest !== undefined &&
      at !== undefined &&
      at < quest.last &&
      party.some((other) => other !== heroId && isHealer(other) && (quest.died.get(other) ?? Number.POSITIVE_INFINITY) > at);
    const byItem = at !== undefined && healed.has(`${questId}|${heroId}|${at}`);
    const tally = counts[guildOf(document, entry, `${index}`).controller.kind];
    tally.injuries += 1;
    if (byHealer && byItem) tally.both += 1;
    else if (byHealer) tally.healer += 1;
    else if (byItem) tally.item += 1;
    else tally.neither += 1;
    if (quest !== undefined && at !== undefined && at >= quest.last) tally.atLast += 1;
  });
  return counts;
}

// ── The Contracts' lines (DL-321) ────────────────────────────────────────────────────────────
// Reported with no band (v1.2.4 proposes any). Read from the History or the World State, drawing
// nothing, so that play is as it was without them (DL-239).

/** The ways a Contract is signed, each a signing event that carries its terms (DL-315, DL-316). */
export const signingKinds = ['recruited', 'transferred', 'renewed'] as const;

export type SigningKind = (typeof signingKinds)[number];

/** A kind of Guild's Contracts: those signed by the way and the years of their term, those that ended, and the Heroes let go. */
export interface ContractTally {
  /** `hero.recruited`, `hero.transferred` (for the Guild the Hero joins) and `hero.contract-renewed`, by the length signed, in years. */
  signed: Record<SigningKind, Record<string, number>>;
  /** `hero.contract-expired`. */
  expired: number;
  /** `hero.released`; its payout is among the Wealth flows (`WealthFlows.releasePayouts`). */
  released: number;
}

export const noContracts = (): ContractTally => ({ signed: { recruited: {}, transferred: {}, renewed: {} }, expired: 0, released: 0 });

/** The Contracts signed, expired and released, by the controller of the Guild each event names (the Guild that signs, for a Transfer). */
export function contractCounters(document: WorldDocument): Record<ControllerKind, ContractTally> {
  const counts = { player: noContracts(), rival: noContracts() };
  const sign = (kind: SigningKind, type: EventType, guildField: string): void =>
    entriesOf(document, type).forEach((entry, index) => {
      const what = `${type} entry ${index}`;
      const signed = counts[guildNamed(document, entry, guildField, what).controller.kind].signed[kind];
      const years = String(numberField(entry, 'years', what));
      signed[years] = (signed[years] ?? 0) + 1;
    });
  sign('recruited', 'hero.recruited', 'guildId');
  sign('transferred', 'hero.transferred', 'toGuildId');
  sign('renewed', 'hero.contract-renewed', 'guildId');
  entriesOf(document, 'hero.contract-expired').forEach((entry, index) => {
    counts[guildNamed(document, entry, 'guildId', `hero.contract-expired entry ${index}`).controller.kind].expired += 1;
  });
  entriesOf(document, 'hero.released').forEach((entry, index) => {
    counts[guildNamed(document, entry, 'guildId', `hero.released entry ${index}`).controller.kind].released += 1;
  });
  return counts;
}

/** The free Offers (Q8, DL-319) made by a side for the Heroes of another's Roster, and how they ended. */
export interface FreeOfferTally {
  made: number;
  /** Ended by the Hero's Guild renewing them (`guild.transfer-offer-expired`, cause `renewed`). */
  renewed: number;
  /** Ended by the Hero being taken (cause `taken`). */
  taken: number;
}

/**
 * The free Offers by the side of the Guild that made them and of the Guild asked, as `offerCounters`
 * keys its Offers. An Offer is free when its Hero was Out of Contract as it was made: since
 * their `hero.contract-expired`, with no signing (`hero.recruited`, `hero.transferred`,
 * `hero.contract-renewed`) or release of theirs after, the History's order (`freeOffer` reads the Hero's
 * Contract as it stood, which only the World State holds). A priced Offer of a fee of 0 is not free.
 */
export function freeOfferCounters(document: WorldDocument): Record<string, Record<string, FreeOfferTally>> {
  const offers: Record<string, Record<string, FreeOfferTally>> = {};
  const free = new Set<unknown>();
  const outOfContractHeroes = new Set<unknown>();
  const tallyOf = (entry: Entry, what: string): FreeOfferTally =>
    ((offers[sideOf(guildNamed(document, entry, 'toGuildId', what))] ??= {})[sideOf(guildNamed(document, entry, 'fromGuildId', what))] ??= { made: 0, renewed: 0, taken: 0 });
  const types = ['hero.contract-expired', 'hero.contract-renewed', 'hero.recruited', 'hero.transferred', 'hero.released', 'guild.transfer-offered'] as const;
  types
    .flatMap((type) => positionedEntriesOf(document, type))
    .sort((a, b) => a.position - b.position)
    .forEach(({ entry }) => {
      const heroId = payloadField(entry, 'heroId');
      if (entry.type === 'hero.contract-expired') outOfContractHeroes.add(heroId);
      else if (entry.type !== 'guild.transfer-offered') outOfContractHeroes.delete(heroId);
      else if (outOfContractHeroes.has(heroId)) {
        free.add(payloadField(entry, 'offerId'));
        tallyOf(entry, 'guild.transfer-offered entry').made += 1;
      }
    });
  for (const entry of entriesOf(document, 'guild.transfer-offer-expired')) {
    const cause = payloadField(entry, 'cause');
    if (free.has(payloadField(entry, 'offerId')) && (cause === 'renewed' || cause === 'taken')) tallyOf(entry, 'guild.transfer-offer-expired entry')[cause] += 1;
  }
  return offers;
}

/**
 * A kind of Guild's Roster Heroes sampled once a Day (`observeContractDays`): the Hero-Days, those Out
 * of Contract and those Under Offer, the Guild-Days with at least one of each, and the wage in force
 * by Level.
 */
export interface ContractDays {
  guildDays: number;
  heroDays: number;
  outOfContractDays: number;
  guildDaysOutOfContract: number;
  underOfferDays: number;
  guildDaysUnderOffer: number;
  /** For each Level, the Hero-Days of Heroes with a Contract and their wages summed (a Hero Out of Contract on the wage repriced). */
  wages: Record<string, { heroDays: number; wage: number }>;
}

export const noContractDays = (): ContractDays => ({
  guildDays: 0,
  heroDays: 0,
  outOfContractDays: 0,
  guildDaysOutOfContract: 0,
  underOfferDays: 0,
  guildDaysUnderOffer: 0,
  wages: {},
});

/**
 * Samples into `taken`, once a Day, each Guild in play as the Day begins, on a morning's Turn before the
 * policy acts (DL-321): its Roster's Heroes, the ones Out of Contract (`outOfContract`) and Under Offer
 * (`underOffer`: at home, an Offer standing, free or priced), and each Contract's wage by the Hero's
 * Level. An Offer a Rival's answer or the afternoon ends before a morning is never seen, so the Days
 * Under Offer are those that stand over a night; any other Turn adds nothing.
 */
export function observeContractDays(taken: Record<ControllerKind, ContractDays>, world: World): void {
  if (timeOfDay(world.turn) !== 'morning') return;
  for (const guild of guildsInPlay(world)) {
    const tally = taken[guild.controller.kind];
    const heroes = guild.rosterIds.map((heroId) => world.heroes[heroId] as Hero);
    const out = heroes.filter((hero) => outOfContract(hero, world.turn)).length;
    const under = heroes.filter((hero) => underOffer(world, hero)).length;
    tally.guildDays += 1;
    tally.heroDays += heroes.length;
    tally.outOfContractDays += out;
    tally.underOfferDays += under;
    if (out > 0) tally.guildDaysOutOfContract += 1;
    if (under > 0) tally.guildDaysUnderOffer += 1;
    for (const hero of heroes) {
      if (hero.contract === null) continue;
      const level = (tally.wages[String(hero.level)] ??= { heroDays: 0, wage: 0 });
      level.heroDays += 1;
      level.wage += hero.contract.wage;
    }
  }
}
