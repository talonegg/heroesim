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

import {
  baseStat,
  facilityKeys,
  isId,
  questBands,
  timeOfDay,
  unsignableHeroes,
  yearOf,
  type Controller,
  type EndingReason,
  type EngineDeps,
  type Entry,
  type EventType,
  type FacilityKey,
  type Guild,
  type GuildId,
  type Hero,
  type QuestBand,
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
}

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

/**
 * Every counter of a harness game, read from `document`'s History through `byType` and joined to
 * the World State for the Guild each entry is about.
 *
 * @throws Error on an entry the engine would not have made: one naming no Guild the world holds,
 * a `quest.resolved` without a band, an ending without a reason, a `hero.retired` without an age
 */
export function countGame(document: WorldDocument, deps: EngineDeps): GameCounters {
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
  /** The Guilds in play. */
  guilds: number;
  heroes: number;
  /** Their Levels, summed. */
  levels: number;
  /** How many hold a Stat at its Potential, or at content's maximum where growth stops too (DL-36). */
  atPotential: number;
}

/** What a game's World State showed while it was played: what its History cannot give. */
export interface GameObservations {
  fameGate: Record<ControllerKind, FameGate>;
  /** The Rosters as each year begins, before the policy acts: index k is after k years, 0 the new world. */
  rosters: Record<ControllerKind, RosterCensus>[];
}

const noFameGate = (): FameGate => ({ heroDays: 0, guildDays: 0, guildDaysWithAny: 0 });
const noCensus = (): RosterCensus => ({ guilds: 0, heroes: 0, levels: 0, atPotential: 0 });

export function emptyObservations(): GameObservations {
  return { fameGate: { player: noFameGate(), rival: noFameGate() }, rosters: [] };
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
 * as the next entry of `observations.rosters`; nothing on any other Turn, so it may be asked on
 * every Turn and once more when a game stops.
 */
export function takeCensus(observations: GameObservations, world: World, deps: EngineDeps): void {
  if (world.turn !== observations.rosters.length * deps.config.turnsPerYear) return;
  const census = { player: noCensus(), rival: noCensus() };
  for (const guild of guildsInPlay(world)) {
    const counts = census[guild.controller.kind];
    counts.guilds += 1;
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
