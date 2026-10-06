// The views of the wider world (M7-S3 part 2, DL-73): every Guild, the Rankings, another Guild's
// page (its Roster with the Transfer fee the player's Guild would pay, its Hall, its Guildmaster),
// a Hall, a Guildmaster and the Patrons. The History, and anyone in it found by name, are
// `history.ts`'s (M9-S5).
// The CLI's `show guilds`, `show rankings`, `show roster <guildId>`, `show hall`, `show guildmaster`
// and `show patrons`, in its words (`cli/src/render.ts`), less the ids a command line takes.
//
// Nothing here computes a rule (ADR-0007, principle 12): every number is a document field or an
// engine selector's answer (`rankingPlaces`, `upkeep`, `nextImprovement`, `transferFee`, `ageOf`,
// `retirementTurn`, `baseStat`, `regardBand` over `regardValue`, `patronRegardFor` and `guildmasterRegardForGuild`).
// Regard is shown as its band, never its number (M4-S5); Potential not at all.

import {
  ageOf,
  baseStat,
  compareByCodeUnit,
  dayOf,
  descriptiveAttributeLabels,
  descriptiveAttributes,
  facilityKeys,
  guildmasterOf,
  guildmasterRegardForGuild,
  nextImprovement,
  patronRegardFor,
  playerGuild,
  rankingPlaces,
  regardBand,
  regardValue,
  retirementTurn,
  retiresOn,
  transferFee,
  upkeep,
  yearOf,
  type FacilityKey,
  type GameConfig,
  type Guild,
  type GuildId,
  type GuildmasterId,
  type HeroId,
  type RankingMeasure,
  type RegardBand,
  type Sex,
  type WorldDocument,
  type ClassIcon,
  type ClassKey,
} from '@heroesim/engine';
import { capitalised, dateOfTurn, endingWords, facilityNames, nameIn, nightOfTurn, traitEffectWords, type Calendar } from '@heroesim/words';
import { content } from '../content';
import { classMarkOf, controllerWords, placeWords, rowOf } from './names';
import { playDeps } from './reducer';

/** The Guild named, or the player's when none is. */
function guildOf(document: WorldDocument, guildId: GuildId | undefined): Guild | undefined {
  return guildId === undefined ? playerGuild(document.world) : rowOf(document.world.guilds, guildId);
}

// ── Every Guild, and the Rankings ───────────────────────────────────────────────────────────

/**
 * A column the Guilds' table can be sorted by (M9-S6, the review's B4). By Fame or by Wealth, it is
 * the Rankings (R10) in the engine's order, each Guild at its place; by any other, an order for
 * display only, ties in the Rankings' order by Fame.
 */
export type GuildSort = RankingMeasure | 'name' | 'disposition' | 'heroes' | 'upkeep';

/** One Guild as a row of the Guilds' table. */
export interface GuildRow {
  guildId: GuildId;
  name: string;
  /** The player's own Guild. */
  mine: boolean;
  /**
   * Its Guildmaster's sex and Portrait's key, for the thumbnail beside its name (v1.1.3-S7, DL-135
   * item 9); `null` for a Guild with no Guildmaster, which shows none.
   */
  guildmaster: { sex: Sex; portraitKey: string | null } | null;
  /**
   * `1st`, or `Joint 2nd` for a place Guilds share: the engine's `rankingPlaces` in words (DL-95),
   * by the table's measure; `null` for a folded Guild, which is out of the Rankings (DL-28).
   */
  place: string | null;
  /** `Yours`, or the name of the Disposition that makes a Rival's choices. */
  disposition: string;
  fame: number;
  wealth: number;
  /** How many Heroes are on its Roster. */
  heroes: number;
  /** Its Upkeep, the engine's `upkeep`. */
  upkeep: number;
  /** `Folded on Year 1 Day 13`, or `null` for a Guild in play (DL-28, DL-33, DL-210). */
  folded: string | null;
}

export interface GuildsTable {
  /** What Place reads by: Wealth when the table is sorted by Wealth, and Fame otherwise. */
  measure: RankingMeasure;
  /** The Guilds in play, in the order asked for. */
  rows: GuildRow[];
  /** The Guilds that have folded, in the world's order, each with its date. */
  folded: GuildRow[];
}

/** How each column other than Fame and Wealth orders the Guilds: highest first for a number, A to Z for words. */
const guildOrders: Readonly<Record<Exclude<GuildSort, RankingMeasure>, (a: GuildRow, b: GuildRow) => number>> = {
  name: (a, b) => compareByCodeUnit(a.name, b.name),
  // The player's own first, then the Rivals by their Disposition's name.
  disposition: (a, b) => Number(b.mine) - Number(a.mine) || compareByCodeUnit(a.disposition, b.disposition),
  heroes: (a, b) => b.heroes - a.heroes,
  upkeep: (a, b) => b.upkeep - a.upkeep,
};

/**
 * `show guilds` and `show rankings` as one table (M9-S6, the review's B4): every Guild in play with
 * its place, Disposition, Fame, Wealth, Heroes and Upkeep, sorted by `sort`; then the folded ones.
 * Place is the engine's `rankingPlaces` (DL-95) by Wealth when sorted by Wealth, and by Fame
 * otherwise, so Guilds level on the measure share a place (DL-91). Sorting changes nothing in the
 * world.
 */
export function guildsTable(document: WorldDocument, sort: GuildSort): GuildsTable {
  const { world } = document;
  const { config } = playDeps(document);
  const measure: RankingMeasure = sort === 'wealth' ? 'wealth' : 'fame';
  const places = new Map(rankingPlaces(world, measure).map((ranking) => [ranking.guildId, capitalised(placeWords(ranking))]));
  const rowFor = (guild: Guild): GuildRow => ({
    guildId: guild.id,
    name: guild.name,
    mine: guild.controller.kind === 'player',
    guildmaster: picturedOf(guildmasterOf(guild, world)),
    place: places.get(guild.id) ?? null,
    disposition: guild.controller.kind === 'player' ? 'Yours' : nameIn(content.dispositions, guild.controller.disposition),
    fame: guild.fame,
    wealth: guild.wealth,
    heroes: guild.rosterIds.length,
    upkeep: upkeep(guild, world, config, content),
    folded: foldedWords(guild, config),
  });
  // The Rankings' order by the measure; by another column, a stable sort keeps it for ties.
  const rows = rankingPlaces(world, sort === 'wealth' ? 'wealth' : 'fame').flatMap((ranking) => {
    const guild = rowOf(world.guilds, ranking.guildId);
    return guild === undefined ? [] : [rowFor(guild)];
  });
  if (sort !== 'fame' && sort !== 'wealth') rows.sort(guildOrders[sort]);
  const folded = Object.values(world.guilds)
    .filter((guild) => guild.foldedOnTurn !== null)
    .map(rowFor);
  return { measure, rows, folded };
}

/** A Guildmaster's sex and Portrait's key, for their thumbnail; `null` for none. */
function picturedOf(guildmaster: { sex: Sex; portraitKey: string | null } | undefined): GuildRow['guildmaster'] {
  return guildmaster === undefined ? null : { sex: guildmaster.sex, portraitKey: guildmaster.portraitKey };
}

/** `Folded on Year 1 Day 13`, as a cell or a Guild's line says it, by the game's calendar; `null` for a Guild in play. */
function foldedWords(guild: Pick<Guild, 'foldedOnTurn'>, calendar: Calendar): string | null {
  return guild.foldedOnTurn === null ? null : `Folded on ${dateOfTurn(guild.foldedOnTurn, calendar)}`;
}

// ── A Hall ───────────────────────────────────────────────────────────────────────────────────

/** What each facility does, in the CLI's words (`show hall`), after its name. */
const facilityDoes: Readonly<Record<FacilityKey, string>> = Object.freeze({
  infirmary: 'shortens the Days an Injury takes to heal',
  trainingYard: 'gives every Hero on the Roster who is home and unhurt XP each night',
  quarters: 'raise the Morale the Roster settles toward',
});

export interface HallRow {
  facility: FacilityKey;
  /** `Training yard`. */
  name: string;
  grade: number;
  /** The top grade, the highest content defines (`improvements.json`): the pips' count (M9-S6, the review's B9). */
  top: number;
  /** The Improvement built at its grade, or `none`. */
  built: string;
  /** `The training yard gives …`. */
  does: string;
  /** The next grade's Improvement and cost (`nextImprovement`), or `null` at the top grade. */
  next: { name: string; cost: number } | null;
}

export interface HallView {
  guildId: GuildId;
  guildName: string;
  /** The player's own Hall, where `build` can raise a grade. */
  mine: boolean;
  facilities: HallRow[];
}

/** `show hall [guildId]`: the Hall of the Guild named, or of the player's; `null` for a Guild the world lacks. */
export function hallView(document: WorldDocument, guildId?: GuildId): HallView | null {
  const guild = guildOf(document, guildId);
  if (guild === undefined) return null;
  const builtAt = (facility: FacilityKey, grade: number): string =>
    Object.values(content.improvements).find((row) => row.facility === facility && row.grade === grade)?.name ?? 'none';
  const topOf = (facility: FacilityKey): number =>
    Math.max(0, ...Object.values(content.improvements).flatMap((row) => (row.facility === facility ? [row.grade] : [])));
  return {
    guildId: guild.id,
    guildName: guild.name,
    mine: guild.controller.kind === 'player',
    facilities: facilityKeys.map((facility) => {
      const grade = guild.hall[facility];
      const next = nextImprovement(guild, facility, content);
      return {
        facility,
        name: capitalised(facilityNames[facility]),
        grade,
        top: topOf(facility),
        built: grade === 0 ? 'none' : builtAt(facility, grade),
        does: `The ${facilityNames[facility]} ${facilityDoes[facility]}.`,
        next: next === null ? null : { name: next.name, cost: next.cost },
      };
    }),
  };
}

// ── A Guildmaster ────────────────────────────────────────────────────────────────────────────

/**
 * What each Guildmaster Stat's rule bears on (R8, M4-S5), by the Stat's content key: the CLI's words,
 * beginning with a capital as a cell does (DL-125 item 9). The new-game form says them beside each
 * Stat chosen (v1.1.4-S11).
 */
export const guildmasterStatBearsOn: Readonly<Record<string, string>> = Object.freeze({
  negotiation: 'The reward agreed and the fees paid',
  inspiration: 'The Morale baseline of the Heroes',
  coaching: 'The XP of the training yard',
  influence: "The Regard a Patron's Quest earns",
  judgement: 'How sharp the Potential hints read',
});

/** One entity a Guildmaster holds a Regard for: its name, a detail (a Sphere, a Class, a Guildmaster) and the band. */
export interface RegardRow {
  name: string;
  detail: string;
  regard: RegardBand;
  /** The band as its chip says it, `Warm` (DL-125 item 9). */
  regardWords: string;
  /** The band is neutral: the page folds such rows under a count (M9-S6, the review's C8). */
  neutral: boolean;
}

/** A Regard row for `name`, its `detail` and the Regard `value` in `config`'s bands. */
function regardRow(name: string, detail: string, value: number, config: Pick<GameConfig, 'regardBands'>): RegardRow {
  const regard = regardBand(value, config);
  return { name, detail, regard, regardWords: capitalised(regard), neutral: regard === 'neutral' };
}

export interface GuildmasterView {
  /** Whose History a Guildmaster's page opens (M9-S5). */
  guildmasterId: GuildmasterId;
  name: string;
  /** Their Guild, whose Banner stands beside "{Name}, Guildmaster of {Guild}" (DL-125 item 7). */
  guildId: GuildId;
  guildName: string;
  /** Their sex and their Portrait's key, `null` for the Silhouette of their sex: their Portrait (DL-125 item 2). */
  sex: Sex;
  portraitKey: string | null;
  attributes: [label: string, value: string][];
  /**
   * When they retire, from the engine's `retiresOn` (M9-F3, DL-113 item 5; M9-F6): `Retires at 61 on
   * the night of Year 32 Day 1: in 31 Years.` (DL-120 item 5, DL-210), the years left counted as the
   * calendar's Years, or `in 359 Days.` once it is less than a year away (M9-F7); once that night has
   * been played, `Retired at 61 on the night of Year 32 Day 1.`; or why none came, the game over or
   * the Guild folded first: `Never retired: the game ended in Bankruptcy on Year 1 Day 301.` (M9-F7,
   * DL-120 item 9).
   */
  retirement: string;
  stats: { name: string; value: number; bearsOn: string }[];
  traits: { name: string; effect: string }[];
  patrons: RegardRow[];
  /** Each Hero on the Guild's Roster. */
  heroes: RegardRow[];
  /** Each other Guild in play, through its Guildmaster (`guildmasterRegardForGuild`). */
  guilds: RegardRow[];
}

/**
 * `show guildmaster [guildId]` (M4-S5, R8, R9): the Guildmaster of the Guild named, or of the
 * player's; `null` for a Guild the world lacks or one with no Guildmaster.
 */
export function guildmasterView(document: WorldDocument, guildId?: GuildId): GuildmasterView | null {
  const guild = guildOf(document, guildId);
  if (guild === undefined) return null;
  const { world } = document;
  const { config } = playDeps(document);
  const guildmaster = guildmasterOf(guild, world);
  if (guildmaster === undefined) return null;

  return {
    guildmasterId: guildmaster.id,
    name: guildmaster.name,
    guildId: guild.id,
    guildName: guild.name,
    sex: guildmaster.sex,
    portraitKey: guildmaster.portraitKey,
    attributes: [
      // The Sex as a word, capitalised, as "Age" is (DL-111 item 9).
      ['Sex', capitalised(guildmaster.sex)],
      ['Age', String(ageOf(guildmaster, world.turn, config))],
      // The descriptive Attributes written (M9-S2, DL-100 item 3); none is shown when empty.
      ...descriptiveAttributes.flatMap((attribute): [string, string][] =>
        guildmaster[attribute] === '' ? [] : [[descriptiveAttributeLabels[attribute], guildmaster[attribute]]],
      ),
    ],
    retirement: retirementWords(guildmaster, guild, world, config),
    stats: Object.values(content.stats)
      .filter((stat) => stat.owner === 'guildmaster')
      .map((stat) => ({ name: stat.name, value: baseStat(guildmaster.stats, stat), bearsOn: guildmasterStatBearsOn[stat.key] ?? '' })),
    traits: guildmaster.traits.map((key) => ({
      name: nameIn(content.guildmasterTraits, key),
      effect: traitEffectWords(rowOf(content.guildmasterTraits, key)?.effects ?? [], content),
    })),
    patrons: Object.values(world.patrons).map((patron) =>
      regardRow(patron.name, nameIn(content.spheres, patron.sphereKey), regardValue(guildmaster.regard, patron.id), config),
    ),
    heroes: guild.rosterIds.flatMap((heroId) => {
      const hero = rowOf(world.heroes, heroId);
      if (hero === undefined) return [];
      return [regardRow(hero.name, nameIn(content.classes, hero.classKey), regardValue(guildmaster.regard, hero.id), config)];
    }),
    guilds: Object.values(world.guilds)
      .filter((other) => other.id !== guild.id && other.foldedOnTurn === null)
      .map((other) =>
        regardRow(other.name, guildmasterOf(other, world)?.name ?? 'no Guildmaster', guildmasterRegardForGuild(guildmaster, other.id, world), config),
      ),
  };
}

/**
 * A Guildmaster's Retirement in words, as `world` stands: when it came; when it will come, and in how
 * many of the calendar's Years, or once it is less than a year away in how many Days (M9-F7, DL-120
 * item 2); or why none came, the Guild folded or the game ended first (DL-120 item 9). The night it
 * will come is the engine's (`retiresOn`), which is the next night to be played for one past the night
 * `retirementTurn` gave, as a save adopting younger rules has.
 */
function retirementWords(
  guildmaster: Parameters<typeof retirementTurn>[0] & { retiredOnTurn: number | null },
  guild: { foldedOnTurn: number | null; controller: { kind: string } },
  world: Pick<WorldDocument['world'], 'turn' | 'ended' | 'guilds'>,
  config: Pick<GameConfig, 'turnsPerYear' | 'guildmasterRetirementAge'>,
): string {
  // The night as the calendar says it, `the night of Year 32 Day 1` (DL-120 item 5, DL-210).
  const when = (night: number): string => `at ${ageOf(guildmaster, night, config)} on ${nightOfTurn(night, config)}`;
  // A Rival's retired Guildmaster keeps the night; the player's retires as their game ends.
  if (guildmaster.retiredOnTurn !== null) return `Retired ${when(guildmaster.retiredOnTurn)}.`;
  const { ended } = world;
  const mine = guild.controller.kind === 'player';
  if (ended !== null && ended.reason === 'retirement' && mine) return `Retired ${when(ended.turn)}.`;
  if (guild.foldedOnTurn !== null) return `Never retired: the Guild folded on ${dateOfTurn(guild.foldedOnTurn, config)}.`;
  if (ended !== null) return `Never retired: ${neverWords(ended, mine, world, config)}.`;
  const night = retiresOn(guildmaster, world.turn, config);
  return `Retires ${when(night)}: ${timeLeft(night, world.turn, config)}.`;
}

/** How long until `night`, from `turn`: in calendar Years a year or more away, in Days under a year (DL-120 item 2). */
function timeLeft(night: number, turn: number, config: Pick<GameConfig, 'turnsPerYear'>): string {
  if (night - turn >= config.turnsPerYear) {
    const years = yearOf(night, config) - yearOf(turn, config);
    return `in ${years} ${years === 1 ? 'Year' : 'Years'}`;
  }
  const days = dayOf(night) - dayOf(turn);
  return days === 0 ? 'tonight' : `in ${days} ${days === 1 ? 'Day' : 'Days'}`;
}

/**
 * Why a Guildmaster never retired, the game having ended first (DL-120 item 9): for the player's
 * Guildmaster, the ending; for a Rival's, the ending and the player's Guild it befell.
 */
function neverWords(
  ended: NonNullable<WorldDocument['world']['ended']>,
  mine: boolean,
  world: Pick<WorldDocument['world'], 'guilds'>,
  calendar: Calendar,
): string {
  const date = dateOfTurn(ended.turn, calendar);
  if (mine) {
    return ended.reason === 'bankruptcy'
      ? `the game ended in Bankruptcy on ${date}`
      : `the game ended with the Roster wiped out on ${date}`;
  }
  const player = Object.values(world.guilds).find((each) => each.controller.kind === 'player');
  return player === undefined ? `the game ended on ${date}` : `the game ended on ${date}, when ${player.name} ${endingWords[ended.reason]}`;
}

// ── The Patrons ──────────────────────────────────────────────────────────────────────────────

export interface PatronRow {
  patronId: string;
  name: string;
  sphere: string;
  /** Their Regard for the player's Guild, as a band; `null` in a save with no player's Guild. */
  regard: RegardBand | null;
  /** The player's Guildmaster's Regard for them, as a band (M9-S6); `null` with no player's Guildmaster. */
  guildmasterRegard: RegardBand | null;
  /** Each band as its chip says it, `Cool`, or `None` without one (DL-125 item 9). */
  regardWords: string;
  guildmasterRegardWords: string;
  /** How many of their Quests are on the Board now. */
  quests: number;
  /** Both Regards are neutral, or unknown: the page folds such rows under a count (M9-S6, the review's B5). */
  neutral: boolean;
}

/**
 * `show patrons` with the Guildmaster's side (M4-S5; M9-S6, the review's B5): each Patron, their
 * Sphere, their Regard for the player's Guild, the player's Guildmaster's Regard for them, and how
 * many of their Quests are on the Board now.
 */
export function patronsView(document: WorldDocument): PatronRow[] {
  const { world } = document;
  const { config } = playDeps(document);
  const guild = playerGuild(world);
  const guildmaster = guild === undefined ? undefined : guildmasterOf(guild, world);
  const posters = world.board.map((questId) => rowOf(world.quests, questId)?.patronId);
  return Object.values(world.patrons).map((patron) => {
    const regard = guild === undefined ? null : regardBand(patronRegardFor(patron, guild.id), config);
    const guildmasterRegard = guildmaster === undefined ? null : regardBand(regardValue(guildmaster.regard, patron.id), config);
    return {
      patronId: patron.id,
      name: patron.name,
      sphere: nameIn(content.spheres, patron.sphereKey),
      regard,
      guildmasterRegard,
      regardWords: regard === null ? 'None' : capitalised(regard),
      guildmasterRegardWords: guildmasterRegard === null ? 'None' : capitalised(guildmasterRegard),
      quests: posters.filter((patronId) => patronId === patron.id).length,
      neutral: (regard ?? 'neutral') === 'neutral' && (guildmasterRegard ?? 'neutral') === 'neutral',
    };
  });
}

// ── Another Guild ────────────────────────────────────────────────────────────────────────────

export interface OtherRosterRow {
  heroId: HeroId;
  name: string;
  /** Their sex and Portrait's key, for the thumbnail beside their name (DL-147). */
  sex: Sex;
  portraitKey: string | null;
  className: string;
  /** Their Class's key and icon, for the mark before their name (v1.1.7-S6, DL-206 item 23, DL-212). */
  classKey: ClassKey;
  classIcon: ClassIcon | null;
  level: number;
  age: number;
  morale: number;
  background: string;
  /** What the player's Guild would pay to take them in (`transferFee`); `null` with no player's Guild. */
  fee: number | null;
}

export interface GuildPageView {
  guildId: GuildId;
  name: string;
  /** The player's own Guild, which its name in the History or the Guilds' table also opens (M9-S6). */
  mine: boolean;
  controller: string;
  background: string;
  fame: number;
  wealth: number;
  folded: string | null;
  roster: OtherRosterRow[];
  hall: HallView;
  guildmaster: GuildmasterView | null;
}

/**
 * Another Guild's page: `show roster <guildId>` with each Hero's Transfer fee at the player's
 * Guildmaster's Negotiation (M6-S2), shown before it is paid, and its Hall and Guildmaster.
 */
export function guildPage(document: WorldDocument, guildId: GuildId): GuildPageView | null {
  const { world } = document;
  const guild = rowOf(world.guilds, guildId);
  const hall = hallView(document, guildId);
  if (guild === undefined || hall === null) return null;
  const deps = playDeps(document);
  const player = playerGuild(world);
  const buyer = player === undefined ? undefined : guildmasterOf(player, world);
  return {
    guildId: guild.id,
    name: guild.name,
    mine: guild.controller.kind === 'player',
    controller: controllerWords(guild, content),
    background: nameIn(content.backgrounds, guild.backgroundKey),
    fame: guild.fame,
    wealth: guild.wealth,
    folded: foldedWords(guild, deps.config),
    roster: guild.rosterIds.flatMap((heroId) => {
      const hero = rowOf(world.heroes, heroId);
      if (hero === undefined) return [];
      return [
        {
          heroId,
          name: hero.name,
          sex: hero.sex,
          portraitKey: hero.portraitKey,
          className: nameIn(content.classes, hero.classKey),
          ...classMarkOf(content, hero.classKey),
      ...classMarkOf(content, hero.classKey),
          level: hero.level,
          age: ageOf(hero, world.turn, deps.config),
          morale: hero.morale,
          background: nameIn(content.backgrounds, hero.backgroundKey),
          fee: player === undefined || player.id === guild.id ? null : transferFee(hero, buyer, deps),
        },
      ];
    }),
    hall,
    guildmaster: guildmasterView(document, guildId),
  };
}
