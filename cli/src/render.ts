// Everything the CLI prints about a world, as plain lines: aligned text tables, no colour, no
// cursor control, nothing that waits for a key.
//
// The CLI holds no rule. Every number printed here is a document field (Wealth, Fame, Level, XP,
// Morale, a Turn, a Hall grade), a content row's field (an Improvement's cost), the size of a
// document table or list, or the result of an engine selector (`baseStat`, `rankingPlaces`,
// `bankruptcyCountdown`, `unattachedHeroes`, `nextImprovement`, `holdings`); every name is a
// document field or a content row's display name. Where the engine has no selector for something a
// view needs, the selector goes into the engine, not here.
//
// A Hero, a Roster's and the pool's rows and the Board are the readings of `@heroesim/words`
// (DL-241), laid out here: the readings hold what the player sees, what their Guildmaster sees and
// pays (R8), Potential never (data-model rule 9) and Regard as its band (DL-46).

import {
  ageOf,
  bankruptcyCountdown,
  baseStat,
  descriptiveAttributeLabels,
  descriptiveAttributes,
  guildmasterOf,
  guildmasterRegardForGuild,
  holdings,
  itemDefinition,
  patronRegardFor,
  facilityGrade,
  facilityUpkeep,
  hallUpkeepParts,
  nextHallUpkeepDay,
  nextImprovement,
  nextWagesDay,
  playerGuild,
  regardBand,
  regardValue,
  rankingPlaces,
  unattachedHeroes,
  upkeep,
  wages,
  type EngineDeps,
  type Entry,
  type FacilityKey,
  type Guild,
  type Guildmaster,
  type Patron,
  type RankingMeasure,
  type WorldDocument,
} from '@heroesim/engine';
import {
  bestPartyReading,
  boardReading,
  capitalised,
  chanceWords,
  coinLetters,
  coinWords,
  dateOfDay,
  dateOfTurn,
  deadlyWords,
  facilityDoes,
  facilityName,
  kindWords,
  listed,
  modifierWords,
  nameIn,
  noBestPartyWords,
  nightOfDay,
  nightOfTurn,
  poolNote,
  poolReading,
  questClosed,
  readsAsOne,
  rosterReading,
  rowOf,
  signsWords,
  traitEffectWords,
  whenOfTurn,
  type BestPartyReading,
  type Calendar,
  type HeroReading,
  type HeroRow,
  type PlayerReading,
  type PoolRowReading,
  type QuestReading,
  type RosterRowReading,
} from '@heroesim/words';
import { refusalLine } from './namer.js';

// ── Tables ───────────────────────────────────────────────────────────────────────────────────

export interface Column {
  heading: string;
  /** Numbers read best right-aligned. */
  align?: 'left' | 'right';
}

const gap = '  ';

/** A table: a heading row, a rule of dashes under each heading, then the rows, columns aligned. */
export function table(columns: readonly Column[], rows: readonly (readonly string[])[]): string[] {
  const widths = columns.map((column, index) =>
    Math.max(column.heading.length, ...rows.map((row) => (row[index] ?? '').length)),
  );
  const line = (cells: readonly string[]): string =>
    columns
      .map((column, index) => {
        const cell = cells[index] ?? '';
        const width = widths[index] ?? 0;
        return column.align === 'right' ? cell.padStart(width) : cell.padEnd(width);
      })
      .join(gap)
      .trimEnd();
  return [
    line(columns.map((column) => column.heading)),
    line(widths.map((width) => '-'.repeat(width))),
    ...rows.map(line),
  ];
}

/** Label and value pairs, the labels padded to one width. */
function fields(pairs: readonly (readonly [string, string])[]): string[] {
  const width = Math.max(...pairs.map(([label]) => label.length));
  return pairs.map(([label, value]) => `${label.padEnd(width)}${gap}${value}`.trimEnd());
}

// ── Names ────────────────────────────────────────────────────────────────────────────────────
// A content row's name, an Item's kind and what it does, a Trait's effects: `@heroesim/words`
// (v1.1.6-S11, DL-186 item 1).

function none(list: readonly string[]): string {
  return list.length === 0 ? 'None' : list.join(', ');
}

// ── Time ─────────────────────────────────────────────────────────────────────────────────────

/**
 * The Turn and its date with the time of day, `Turn 3 (Year 1 Day 2, morning)`: the CLI keeps its
 * Turn beside the date a player reads (DL-206 item 33, DL-210), the date from the calendar of
 * `@heroesim/words` under the rules the save plays under.
 */
export function renderTime(turn: number, config: Calendar): string {
  return `Turn ${turn} (${whenOfTurn(turn, config)})`;
}

/**
 * The date of a Turn with the Turn beside it, `Year 3 Day 13 (Turn 2198)`: when a thing happened,
 * as a Hero's death (DL-206 item 33, DL-210). The Turn is printed as every number the CLI prints.
 */
export function renderDate(turn: number, config: Calendar): string {
  return `${dateOfTurn(turn, config)} (Turn ${turn})`;
}

// ── Guilds and the summary ───────────────────────────────────────────────────────────────────

/**
 * Who makes a Guild's choices: `Player`, or a Rival with its Disposition by its name in content,
 * `Rival (Steady)`, as the page's Guilds' table names it (v1.1.2-S6); a key content lacks as it is.
 */
function controllerOf(guild: Guild, content: EngineDeps['content']): string {
  return guild.controller.kind === 'player' ? 'Player' : `Rival (${nameIn(content.dispositions, guild.controller.disposition)})`;
}

/**
 * The Guilds as a table. When any has folded, a last column marks each folded one with the date it
 * folded (DL-28, DL-33, DL-210): its row stays, out of play, with an empty Roster.
 */
function guildTable(guilds: readonly Guild[], document: WorldDocument, deps: EngineDeps): string[] {
  const { world } = document;
  const { content, config } = deps;
  const anyFolded = !guilds.every(inPlay);
  return table(
    [
      { heading: 'Id' },
      { heading: 'Guild' },
      { heading: 'Controller' },
      { heading: 'Guildmaster' },
      { heading: 'Portrait' },
      { heading: 'Background' },
      { heading: 'Roster', align: 'right' },
      { heading: 'Wealth', align: 'right' },
      { heading: 'Fame', align: 'right' },
      { heading: 'Upkeep', align: 'right' },
      ...(anyFolded ? [{ heading: 'Folded' }] : []),
    ],
    guilds.map((guild) => [
      guild.id,
      guild.name,
      controllerOf(guild, content),
      rowOf(world.guildmasters, guild.guildmasterId)?.name ?? guild.guildmasterId,
      // Every Guildmaster's picture by its key (v1.1.3-S5), or the Silhouette where none fits them.
      portraitWords(rowOf(world.guildmasters, guild.guildmasterId)?.portraitKey ?? null),
      nameIn(content.backgrounds, guild.backgroundKey),
      String(guild.rosterIds.length),
      coinLetters(guild.wealth),
      String(guild.fame),
      coinLetters(upkeep(guild, world, config, content)),
      ...(anyFolded ? [guild.foldedOnTurn === null ? '' : `on ${dateOfTurn(guild.foldedOnTurn, config)}`] : []),
    ]),
  );
}

/** A Guildmaster's Portrait in a table: its picture's key, or the Silhouette (v1.1.3-S5). */
function portraitWords(portraitKey: string | null): string {
  return portraitKey ?? 'Silhouette';
}

function inPlay(guild: Guild): boolean {
  return guild.foldedOnTurn === null;
}

/**
 * The player's Guild's Bankruptcy countdown as a line (v1.0.1-S4, DL-95), from the engine's
 * `bankruptcyCountdown` under the save's own rules; none while its `belowFloorSince` is null, and
 * none once the game has ended. It stands after Wealth rises during a Day, until that night's
 * check clears it, as the rule does. Printed by `show` and after `advance`.
 */
export function renderCountdown(document: WorldDocument, deps: EngineDeps): string[] {
  const { world } = document;
  const guild = playerGuild(world);
  if (guild === undefined || world.ended !== null) return [];
  const countdown = bankruptcyCountdown(guild, deps.config);
  if (countdown === null) return [];
  return [
    `${guild.name} has been below the Bankruptcy floor since ${dateOfDay(countdown.sinceDay, deps.config)}: Bankruptcy on ` +
      `${nightOfDay(countdown.dueDay, deps.config)} unless Wealth is back to ${coinWords(deps.config.bankruptcyFloor)} or more on a night by then, after any Upkeep due.`,
  ];
}

/**
 * `show`: the seed, the Turn, the Bankruptcy countdown while the player's Guild is below the floor,
 * the Guilds in play, how many of everything there are, the player's Hall, and the Upkeep's two charges
 * with the night each is next paid (DL-298, DL-304). A folded Guild is counted, and listed
 * by `show guilds` (DL-33).
 */
export function renderSummary(document: WorldDocument, deps: EngineDeps): string[] {
  const { meta, world, history } = document;
  const heroes = Object.keys(world.heroes).length;
  const guilds = Object.values(world.guilds);
  const playing = guilds.filter(inPlay);
  const folded = guilds.length - playing.length;
  const counts = [
    `${playing.length} Guilds in play${folded === 0 ? '' : ` and ${folded} folded (show guilds lists them)`}`,
    `${heroes} Heroes (${unattachedHeroes(world).length} Unattached)`,
    `${Object.keys(world.patrons).length} Patrons`,
    `${history.entries.length} History entries`,
  ];
  const player = playerGuild(world);
  const hall =
    player === undefined
      ? []
      : [
          `${player.name}'s Hall: ` +
            Object.keys(deps.content.facilities)
              .map((facility) => `${facilityName(deps.content, facility)} grade ${facilityGrade(player.hall, facility)}`)
              .join(', ') +
            ' (show hall gives each grade and what the next costs).',
        ];
  // The wages and the Hall's upkeep, as `build` words them, none once the Guild has folded or the game has ended (DL-304).
  const { config } = deps;
  const charges =
    player === undefined || !inPlay(player) || world.ended !== null
      ? []
      : [
          `Wages ${coinLetters(wages(player, world))} every ${config.upkeepEveryDays} Days, ` +
            `next paid on ${nightOfDay(nextWagesDay(world.turn, config), config)}.`,
          `Hall upkeep ${coinLetters(hallUpkeepParts(player, world, config, deps.content).total)} every ${config.hallUpkeepEveryDays} Days, ` +
            `next paid on ${nightOfDay(nextHallUpkeepDay(world.turn, config), config)}.`,
        ];
  return [
    `Seed ${meta.seed}, ${renderTime(world.turn, deps.config)}, created ${meta.createdAt}`,
    ...renderCountdown(document, deps),
    '',
    ...guildTable(playing, document, deps),
    '',
    counts.join(', '),
    ...hall,
    ...charges,
  ];
}

/** `show guilds`: every Guild, a folded one marked with the date it folded. */
export function renderGuilds(document: WorldDocument, deps: EngineDeps): string[] {
  return ['Guilds', '', ...guildTable(Object.values(document.world.guilds), document, deps)];
}

// ── The Hall ─────────────────────────────────────────────────────────────────────────────────

/**
 * `show hall [guildId]`: each Facility of the Guild's Hall, its grade, the Improvement built at it and
 * its upkeep there (`facilityUpkeep`), and the next grade's Improvement, cost (`nextImprovement`) and
 * upkeep, or that it is at the top; then what the Facilities do, in words read from their effects
 * (`facilityDoes`). Each upkeep is the Facility's part of the Hall's before the Guildmaster's Traits, as
 * the page's Hall gives it (DL-303). The player's Guild unless given another.
 */
export function renderHall(guild: Guild, deps: EngineDeps): string[] {
  const { content, config } = deps;
  const builtAt = (facility: FacilityKey, grade: number): string =>
    Object.values(content.improvements).find((row) => row.facility === facility && row.grade === grade)?.name ?? '';
  const facilities = Object.keys(content.facilities);
  const rows = Object.values(content.facilities).map((def) => {
    const facility = def.key;
    const grade = facilityGrade(guild.hall, facility);
    const next = nextImprovement(guild, facility, content);
    return [
      capitalised(facilityName(content, facility)),
      String(grade),
      grade === 0 ? 'None' : builtAt(facility, grade),
      coinLetters(facilityUpkeep(def, grade, config)),
      next === null ? 'None: the top grade' : next.name,
      next === null ? '' : coinLetters(next.cost),
      next === null ? '' : coinLetters(facilityUpkeep(def, next.grade, config)),
    ];
  });
  const does = facilities.map((facility) => `the ${facilityName(content, facility)} ${facilityDoes(content, facility)}`).join('; ');
  return [
    `Hall of ${guild.name} (${guild.id})`,
    '',
    ...table(
      [
        { heading: 'Facility' },
        { heading: 'Grade', align: 'right' },
        { heading: 'Built' },
        { heading: 'Upkeep', align: 'right' },
        { heading: 'Next grade' },
        { heading: 'Cost', align: 'right' },
        { heading: 'Next upkeep', align: 'right' },
      ],
      rows,
    ),
    '',
    ...wrapped(`${capitalised(does)}.`),
    ...wrapped(`Each grade does more and costs more to keep, its upkeep paid with the Hall's every ${config.hallUpkeepEveryDays} Days.`),
  ];
}

/** `text` in lines of at most `width` characters, broken between words. */
function wrapped(text: string, width = 100): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(' ')) {
    if (line !== '' && line.length + 1 + word.length > width) {
      lines.push(line);
      line = word;
    } else {
      line = line === '' ? word : `${line} ${word}`;
    }
  }
  return line === '' ? lines : [...lines, line];
}

// ── Heroes ───────────────────────────────────────────────────────────────────────────────────
// A Hero, a Roster's or the pool's rows and the Board are the readings of `@heroesim/words`
// (`heroReading`, `rosterReading`, `poolReading`, `boardReading`, DL-241), laid out here as tables.

/** A column a view adds to the Hero table, after the others: its heading and each row's cell. */
interface HeroColumn<Row extends HeroRow> extends Column {
  cell: (row: Row) => string;
}

function heroTable<Row extends HeroRow>(rows: readonly Row[], more: readonly HeroColumn<Row>[] = []): string[] {
  return table(
    [
      { heading: 'Id' },
      { heading: 'Name' },
      { heading: 'Class' },
      { heading: 'Level', align: 'right' },
      { heading: 'Age', align: 'right' },
      { heading: 'Morale', align: 'right' },
      { heading: 'Fatigue', align: 'right' },
      { heading: 'Background' },
      ...more,
    ],
    rows.map((row) => [
      row.id,
      row.name,
      row.className,
      String(row.level),
      String(row.age),
      String(row.morale),
      String(row.fatigue),
      row.background,
      ...more.map((column) => column.cell(row)),
    ]),
  );
}

/**
 * `show roster [guildId]`: the Guild's Roster in its own order, then what the Guild holds (M5-S2):
 * each unique Item and stack in its holding, with the id `equip` takes. Another Guild's Roster adds
 * each Hero's Transfer fee, what the player's Guild would pay to take them (`transfer --in`), shown
 * before it is paid (`rosterReading`).
 */
export function renderRoster(reading: PlayerReading, guild: Guild): string[] {
  const { world, content } = reading;
  // The Captain marked beside the others (DL-289), then another Guild's Transfer fee.
  const fees: HeroColumn<RosterRowReading>[] = [
    { heading: 'Captain', cell: (row) => (row.captain ? 'Yes' : '') },
    ...(reading.guild === undefined || reading.guild.id === guild.id
      ? []
      : [{ heading: 'Transfer fee', align: 'right' as const, cell: (row: RosterRowReading) => (row.transferFee === null ? '' : coinLetters(row.transferFee)) }]),
  ];
  const held = holdings(world, { kind: 'guild', id: guild.id });
  const rows = [...held.items, ...held.stacks].map((row) => {
    const definition = itemDefinition(content, row.definitionKey);
    return [
      row.id,
      nameIn(content.items, row.definitionKey),
      definition === undefined ? '' : kindWords(definition),
      'quantity' in row ? String(row.quantity) : '1',
      definition?.kind === 'gear' ? modifierWords(definition, content) : '',
    ];
  });
  return [
    `Roster of ${guild.name} (${guild.id})`,
    '',
    ...heroTable(rosterReading(reading, guild), fees),
    '',
    `Held by ${guild.name}`,
    ...(rows.length === 0
      ? ['Nothing']
      : table(
          [{ heading: 'Id' }, { heading: 'Item' }, { heading: 'Kind' }, { heading: 'Quantity', align: 'right' }, { heading: 'Modifies' }],
          rows,
        )),
  ];
}

/**
 * `show pool`: the Unattached Heroes, each with the signing fee and, when there is a player's Guild,
 * whether they would sign for it: `Yes`, or the Fame they ask of it, since a Hero of a higher
 * Level will not sign for a Guild whose Fame is below what their Level asks (`poolReading`).
 */
export function renderPool(reading: PlayerReading): string[] {
  const columns: HeroColumn<PoolRowReading>[] = [{ heading: 'Fee', align: 'right', cell: (row) => coinLetters(row.fee) }];
  if (reading.guild !== undefined) {
    columns.push({ heading: 'Signs', cell: (row) => (row.signs === null ? '' : capitalised(signsWords(row.signs))) });
  }
  const note = poolNote(reading);
  return ['Unattached pool', '', ...heroTable(poolReading(reading), columns), ...(note === null ? [] : ['', note])];
}

/**
 * `show hero <id>`: the Hero's reading laid out (`heroReading`): their Attributes, Portrait,
 * Appearance and Biography, State, Stats, gear, Skills and, on a Roster, Relationships. Each Stat's
 * base and the effective value a Quest's Check reads, then its Potential hint under "Outlook", never
 * Potential (rule 9); Regard and Relationships as bands, never as numbers (DL-46); and for a
 * Hero on another Guild's Roster, the Transfer fee the player's Guild would pay to take them.
 * Its dates by `calendar`, each with its Turn (DL-210).
 */
export function renderHero(hero: HeroReading, calendar: Calendar): string[] {
  const attributes: [string, string][] = [
    ['Sex', capitalised(hero.sex)],
    // The picture by its key, which the page finds in `media/`; none shows the Silhouette.
    ['Portrait', hero.portraitKey ?? 'None: the Silhouette'],
    ['Age', String(hero.age)],
    ['Class', hero.className],
    ['Background', hero.background],
    ['Guild', hero.guild === null ? (hero.unattached ? 'Unattached' : 'None') : `${hero.guild.name ?? hero.guild.id} (${hero.guild.id})`],
    // A post a Hero holds only on a Roster (DL-289).
    ...(hero.relationships === null ? [] : [['Captain', hero.captain ? 'Yes' : 'No'] as [string, string]]),
    ['Level', String(hero.level)],
    ['XP', String(hero.xp)],
    ['Morale', `${hero.morale}, ${hero.moraleBand}`],
    ['Fatigue', `${hero.fatigue}, ${hero.fatigueBand}`],
    [
      'Injury',
      hero.injury === null
        ? 'None'
        : `${hero.injury.name}, healing on ${nightOfTurn(hero.injury.healsOnTurn, calendar)} (Turn ${hero.injury.healsOnTurn})`,
    ],
    // Each Trait with what it does: `Lame (-2 Dexterity, -1 Endurance)`.
    ['Traits', none(hero.traits.map((trait) => `${trait.name} (${trait.effect})`))],
    ...hero.texts.map(({ label, words }): [string, string] => [label, words]),
  ];
  if (hero.transferFee !== null) attributes.push(['Transfer fee', coinLetters(hero.transferFee)]);
  if (hero.partyId !== null) attributes.push(['Party', hero.partyId]);
  if (hero.died !== null) attributes.push(['Died', renderDate(hero.died, calendar)]);
  if (hero.retired !== null) attributes.push(['Retired', renderDate(hero.retired, calendar)]);
  if (hero.leftPool !== null) attributes.push(['Left the pool', renderDate(hero.leftPool, calendar)]);

  const stats = hero.stats.map((stat, index) => [
    stat.area === hero.stats[index - 1]?.area ? '' : stat.area,
    stat.name,
    String(stat.base),
    String(stat.value),
    capitalised(stat.outlook),
  ]);
  const gear = hero.gear.map(({ slot, item }) => [capitalised(slot), item?.name ?? 'None', item?.id ?? '', item?.modifies ?? '']);
  const skills = hero.skills.map((skill) => [skill.name, String(skill.rating)]);
  const mates = (hero.relationships ?? []).map((mate) => [mate.id, mate.name, mate.className, capitalised(mate.regard), capitalised(mate.relationship)]);
  const relationships =
    hero.relationships === null
      ? []
      : [
          '',
          'Relationships on the Roster',
          ...(mates.length === 0
            ? ['None']
            : table([{ heading: 'Id' }, { heading: 'Hero' }, { heading: 'Class' }, { heading: 'Regard' }, { heading: 'Relationship' }], mates)),
        ];

  return [
    `${hero.name} (${hero.id})`,
    '',
    ...fields(attributes),
    '',
    'Stats',
    ...table(
      [
        { heading: 'Area' },
        { heading: 'Stat' },
        { heading: 'Base', align: 'right' },
        { heading: 'Effective', align: 'right' },
        { heading: 'Outlook' },
      ],
      stats,
    ),
    '',
    'Gear',
    ...table([{ heading: 'Slot' }, { heading: 'Item' }, { heading: 'Id' }, { heading: 'Modifies' }], gear),
    '',
    'Skills',
    ...(skills.length === 0 ? ['None'] : table([{ heading: 'Skill' }, { heading: 'Rating', align: 'right' }], skills)),
    ...relationships,
  ];
}

// ── Rankings ─────────────────────────────────────────────────────────────────────────────────

/**
 * `show rankings [--by wealth]` (M3-S5, R10): every Guild in play, the player's among them, in the
 * order the engine's `rankings` gives, by Fame unless by Wealth. Guilds level on the measure share
 * a Rank, marked `joint` (`rankingPlaces`, v1.0.1-S4, DL-95). A folded Guild is not ranked.
 */
export function renderRankings(document: WorldDocument, deps: EngineDeps, by: RankingMeasure): string[] {
  const { world } = document;
  const measure = by === 'fame' ? 'Fame' : 'Wealth';
  const rows = rankingPlaces(world, by).map((ranking) => {
    const guild = rowOf(world.guilds, ranking.guildId);
    return [
      ranking.joint ? `joint ${ranking.place}` : String(ranking.place),
      ranking.guildId,
      guild?.name ?? ranking.guildId,
      guild === undefined ? '' : controllerOf(guild, deps.content),
      by === 'wealth' ? coinLetters(ranking.value) : String(ranking.value),
    ];
  });
  return [
    `Rankings by ${measure}, ${renderTime(world.turn, deps.config)}`,
    '',
    ...table(
      [
        { heading: 'Rank', align: 'right' },
        { heading: 'Id' },
        { heading: 'Guild' },
        { heading: 'Controller' },
        { heading: measure, align: 'right' },
      ],
      rows,
    ),
  ];
}

// ── Patrons ──────────────────────────────────────────────────────────────────────────────────

/**
 * `show patrons`: each Patron, their Sex (v1.1.2-S3), their Sphere and, when there is a player's Guild, their Regard for
 * it as a band (M4-S5), which weighs on how often they post to the Board and recovers toward
 * neutral with time.
 */
export function renderPatrons(document: WorldDocument, deps: EngineDeps): string[] {
  const patrons: Patron[] = Object.values(document.world.patrons);
  const guild = playerGuild(document.world);
  const regard = (patron: Patron): string[] =>
    guild === undefined ? [] : [capitalised(regardBand(patronRegardFor(patron, guild.id), deps.config))];
  const columns: Column[] = [{ heading: 'Id' }, { heading: 'Patron' }, { heading: 'Sex' }, { heading: 'Sphere' }];
  if (guild !== undefined) columns.push({ heading: 'Regard for us' });
  return [
    'Patrons',
    '',
    ...table(
      columns,
      patrons.map((patron) => [
        patron.id,
        patron.name,
        // The sex that came with the name (v1.1.2-S3); a body has none.
        patron.sex === null ? 'None' : capitalised(patron.sex),
        nameIn(deps.content.spheres, patron.sphereKey),
        ...regard(patron),
      ]),
    ),
  ];
}

// ── The Guildmaster ──────────────────────────────────────────────────────────────────────────

/** What each Guildmaster Stat's rule bears on (R8, M4-S5), by the Stat's content key. */
const guildmasterRules: Readonly<Record<string, string>> = Object.freeze({
  negotiation: 'The reward agreed and the fees paid',
  inspiration: 'The Morale baseline of the Heroes',
  coaching: 'The training XP the Hall gives',
  influence: "The Regard a Patron's Quest earns",
  judgement: 'How sharp the Potential hints read',
});

/**
 * `show guildmaster [guildId]` (M4-S5, R8, R9): the Guildmaster of the player's Guild, or of the
 * Guild named; their Stats and what each bears on, their Traits and what each does, and their
 * Regard for every Patron, for each Hero on their Roster and for each other Guild in play, as
 * bands and never as numbers (pre-M0 review B3). Regard for another Guild is Regard for its
 * Guildmaster (`guildmasterRegardForGuild`), which nothing writes before M6.
 */
export function renderGuildmaster(guild: Guild, document: WorldDocument, deps: EngineDeps): string[] {
  const { world } = document;
  const { content, config } = deps;
  const guildmaster: Guildmaster | undefined = guildmasterOf(guild, world);
  if (guildmaster === undefined) return [`${guild.name} (${guild.id}) has no Guildmaster.`];
  // A band stands alone in its cell, so it opens with a capital (docs/agents/ui-text.md rule 1, DL-241).
  const band = (value: number): string => capitalised(regardBand(value, config));

  const stats = Object.values(content.stats)
    .filter((stat) => stat.owner === 'guildmaster')
    .map((stat) => [stat.name, String(baseStat(guildmaster.stats, stat)), guildmasterRules[stat.key] ?? '']);
  const traits = guildmaster.traits.map((key) => [
    nameIn(content.guildmasterTraits, key),
    traitEffectWords(rowOf(content.guildmasterTraits, key)?.effects ?? [], content),
  ]);
  const patrons = Object.values(world.patrons).map((patron) => [
    patron.id,
    patron.name,
    nameIn(content.spheres, patron.sphereKey),
    band(regardValue(guildmaster.regard, patron.id)),
  ]);
  const heroes = guild.rosterIds.flatMap((heroId) => {
    const hero = rowOf(world.heroes, heroId);
    if (hero === undefined) return [];
    return [[hero.id, hero.name, nameIn(content.classes, hero.classKey), band(regardValue(guildmaster.regard, hero.id))]];
  });
  const others = Object.values(world.guilds)
    .filter((other) => other.id !== guild.id && other.foldedOnTurn === null)
    .map((other) => [
      other.id,
      other.name,
      rowOf(world.guildmasters, other.guildmasterId)?.name ?? other.guildmasterId,
      band(guildmasterRegardForGuild(guildmaster, other.id, world)),
    ]);
  const regardColumns = (kind: string, detail: string): Column[] => [
    { heading: 'Id' },
    { heading: kind },
    { heading: detail },
    { heading: 'Regard' },
  ];

  return [
    `${guildmaster.name} (${guildmaster.id}), Guildmaster of ${guild.name} (${guild.id})`,
    '',
    ...fields([
      ['Sex', capitalised(guildmaster.sex)],
      // The picture by its key (v1.1.2-S3), which the page finds in `media/`; none shows the Silhouette.
      ['Portrait', guildmaster.portraitKey ?? 'None: the Silhouette'],
      ['Age', String(ageOf(guildmaster, world.turn, config))],
      // The descriptive Attributes written (M9-S2, DL-100 item 3); none is shown when empty.
      ...descriptiveAttributes.flatMap((attribute): [string, string][] =>
        guildmaster[attribute] === '' ? [] : [[descriptiveAttributeLabels[attribute], guildmaster[attribute]]],
      ),
    ]),
    '',
    'Stats',
    ...table([{ heading: 'Stat' }, { heading: 'Value', align: 'right' }, { heading: 'Bears on' }], stats),
    '',
    'Traits',
    ...(traits.length === 0 ? ['None'] : table([{ heading: 'Trait' }, { heading: 'Effect' }], traits)),
    '',
    'Regard for Patrons',
    ...table(regardColumns('Patron', 'Sphere'), patrons),
    '',
    'Regard for Heroes on the Roster',
    ...(heroes.length === 0 ? ['None'] : table(regardColumns('Hero', 'Class'), heroes)),
    '',
    'Regard for the other Guilds, through their Guildmasters',
    ...(others.length === 0 ? ['None'] : table(regardColumns('Guild', 'Guildmaster'), others)),
  ];
}

// ── The Board ────────────────────────────────────────────────────────────────────────────────

/**
 * `show board`: the Quests on offer in the Board's order (`boardReading`), each with its template's
 * name, its Patron, its Tier, whether it is Deadly ("Yes" or "No", no figure), its Days and reward, as
 * its card on the page leads with them (DL-269), the rest of its terms, what it requires and the last
 * date it stays on offer; then the Skills
 * that help in its Encounters' Checks and the kinds of those Encounters; then each Quest's
 * Encounters with each Check's name and what it reads, whether it is Deadly (DL-265), and the
 * player's Best Party with its chance (DL-148 items 15 to 17), every Quest asked of the reading's one Best Party module (DL-237).
 */
export function renderBoard(reading: PlayerReading): string[] {
  const { world, calendar } = reading;
  const quests = boardReading(reading);
  const heading = `Board: ${quests.length} ${quests.length === 1 ? 'Quest' : 'Quests'} on offer, ${renderTime(world.turn, calendar)}`;
  if (quests.length === 0) return [heading, '', 'The Board is empty.'];
  return [
    heading,
    '',
    ...table(
      [
        { heading: 'Id' },
        { heading: 'Quest' },
        { heading: 'Patron' },
        { heading: 'Tier', align: 'right' },
        { heading: 'Deadly' },
        { heading: 'Days', align: 'right' },
        { heading: 'Reward', align: 'right' },
        { heading: 'Difficulty', align: 'right' },
        { heading: 'Fame', align: 'right' },
        { heading: 'Party' },
        { heading: 'Requires' },
        { heading: 'On offer through' },
      ],
      quests.map((quest) => [
        quest.id,
        quest.name,
        quest.patron ?? quest.patronId,
        String(quest.tier),
        quest.deadly ? 'Yes' : 'No',
        String(quest.days),
        coinLetters(quest.reward),
        String(quest.difficulty),
        String(quest.fame),
        `${quest.partySizeMin} or more`,
        [quest.classRequired, quest.skillRequired].filter((name) => name !== null).join(', '),
        dateOfTurn(quest.expiresOnTurn, calendar),
      ]),
    ),
    '',
    ...table(
      [{ heading: 'Id' }, { heading: 'Skills that help' }, { heading: 'Encounters' }],
      quests.map((quest) => [quest.id, none(quest.skills), encounterKindsOf(quest)]),
    ),
    ...quests.flatMap((quest) => ['', ...questLines(quest, reading)]),
  ];
}

/**
 * A Quest's Encounters as the Board gives them: each with its kind and each Check's name and what it
 * reads, an Encounter of one Check of its own name on one line; then whether it is Deadly, with no
 * figure (DL-265); then the Best Party of the player's rested Heroes and its chance, if no one falls,
 * or why the player's Guild may not take the Quest.
 */
function questLines(quest: QuestReading, reading: PlayerReading): string[] {
  const lines = quest.encounters.flatMap((encounter) => {
    const kind = encounter.kind === null ? '' : ` (${encounter.kind})`;
    if (readsAsOne(encounter)) return [`  ${encounter.name}${kind}: ${encounter.checks[0]?.reads ?? ''}`];
    return [`  ${encounter.name}${kind}`, ...encounter.checks.map((it) => `    ${it.name}: ${it.reads}`)];
  });
  const row = rowOf(reading.world.quests, quest.id);
  // A Quest the Guild may not take offers no Party: why, in the refusals' words (DL-264).
  const closed = row === undefined ? null : questClosed(reading, row);
  const { world, content, calendar } = reading;
  return [
    `${quest.id}, ${quest.name}`,
    ...lines,
    ...(quest.deadly ? [`  ${deadlyWords.mark}: ${deadlyWords.meaning}.`] : []),
    `  ${closed !== null ? refusalLine(closed, { world, content, calendar }) : bestPartyWords(row === undefined ? null : bestPartyReading(reading, row))}`,
  ];
}

/** "Your best Party": the Best Party of the player's rested Heroes (`partyPool`, DL-286), its chance in a word and floored to 5%, or why there is none. */
function bestPartyWords(best: BestPartyReading | null): string {
  if (best === null) return noBestPartyWords;
  const names = listed(best.names);
  if (best.chance === null) return `Your best Party: ${names}; its chance is not known until its Encounters are drawn.`;
  return `Your best Party: ${chanceWords[best.chance.band]} (${best.chance.percent}% if no one falls), ${names}.`;
}

/**
 * The kinds of a Quest's Encounters in the order it meets them, so the player can see what
 * kind of work it is. An Encounter content does not define is named by its key (data-model rule 5).
 */
function encounterKindsOf(quest: QuestReading): string {
  return capitalised(quest.encounters.map((encounter) => encounter.kind ?? encounter.encounterKey).join(', '));
}

// ── History ──────────────────────────────────────────────────────────────────────────────────

/**
 * `show history [entityId]`: entries as the engine's History readers return them, under a
 * heading that says which and in what order, each with its Turn and its date (DL-206 item 33,
 * DL-210). Each names its participants by the labels it was written with, so a Hero since removed
 * still reads.
 */
export function renderHistory(heading: string, entries: readonly Entry[], config: Calendar): string[] {
  return [
    heading,
    '',
    ...table(
      [{ heading: 'Turn', align: 'right' }, { heading: 'Date' }, { heading: 'Event' }, { heading: 'Milestone' }, { heading: 'Who' }],
      entries.map((entry) => [
        String(entry.turn),
        whenOfTurn(entry.turn, config),
        entry.type,
        entry.milestone ? 'Yes' : '',
        entry.participants.map((id) => entry.labels[id] ?? id).join(', '),
      ]),
    ),
  ];
}
