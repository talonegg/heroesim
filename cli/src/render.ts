// Everything the CLI prints about a world, as plain lines: aligned text tables, no colour, no
// cursor control, nothing that waits for a key.
//
// The CLI holds no rule. Every number printed here is a document field (Wealth, Fame, Level, XP,
// Morale, a Turn, a Hall grade), a content row's field (an Improvement's cost), the size of a
// document table or list, or the result of an engine selector (`ageOf`, `baseStat`,
// `effectiveStats`, `signingFee`, `transferFee`, `signingRefusal`, `rankingPlaces`,
// `bankruptcyCountdown`, `unattachedHeroes`, `nextImprovement`, `holdings`, `carriedGear`); every
// name is a document field or a content row's display name. Where the engine has no selector for
// something a view needs, the selector goes into the engine, not here.
//
// Potential is stored plainly and never shown (data-model rule 9): no view reads
// `hero.potential`, only the engine's `potentialHint` word for it, and main.test.ts checks the
// printed Hero for it. Regard is shown as its band, never its number (M4-S5): no view prints a
// `RegardEntry`'s value, only the engine's `regardBand` word for it, nor a Relationship's (M4-S4).
//
// What the player sees is what the player's Guildmaster sees and pays (M4-S5): fees at their
// Negotiation, hints through their Judgement.

import {
  ageOf,
  availableHeroes,
  bankruptcyCountdown,
  bestParty,
  baseStat,
  carriedGear,
  descriptiveAttributeLabels,
  descriptiveAttributes,
  effectiveStats,
  gearSlotKeys,
  guildmasterOf,
  guildmasterRegardForGuild,
  holdings,
  itemDefinition,
  judgedHintBands,
  patronRegardFor,
  facilityKeys,
  nextImprovement,
  playerGuild,
  regardBand,
  regardValue,
  rankingPlaces,
  signingFee,
  signingRefusal,
  skillsThatHelp,
  transferFee,
  durationDaysOf,
  potentialHint,
  relationship,
  unattachedHeroes,
  upkeep,
  type ContentSet,
  type EngineDeps,
  type Entry,
  type FacilityKey,
  type Guild,
  type Guildmaster,
  type Hero,
  type Patron,
  type Quest,
  type RankingMeasure,
  type Stack,
  type UniqueItem,
  type WorldDocument,
} from '@heroesim/engine';
import {
  capitalised,
  chanceWords,
  dateOfDay,
  dateOfTurn,
  encounterReadings,
  facilityNames,
  kindWords,
  modifierWords,
  nameIn,
  nightOfDay,
  nightOfTurn,
  readsAsOne,
  shownPercent,
  traitEffectWords,
  whenOfTurn,
  type Calendar,
} from '@heroesim/words';

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

/**
 * The row of `rows` keyed by `id`, or `undefined` when there is none: an ordinary lookup that
 * does not fall through to `Object.prototype` for a key such as `constructor`.
 */
export function rowIn<Row>(rows: Readonly<Record<string, Row>>, id: string): Row | undefined {
  return Object.hasOwn(rows, id) ? rows[id] : undefined;
}

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
      rowIn(world.guildmasters, guild.guildmasterId)?.name ?? guild.guildmasterId,
      // Every Guildmaster's picture by its key (v1.1.3-S5), or the Silhouette where none fits them.
      portraitWords(rowIn(world.guildmasters, guild.guildmasterId)?.portraitKey ?? null),
      nameIn(content.backgrounds, guild.backgroundKey),
      String(guild.rosterIds.length),
      String(guild.wealth),
      String(guild.fame),
      String(upkeep(guild, world, config, content)),
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
      `${nightOfDay(countdown.dueDay, deps.config)} unless Wealth is back to ${deps.config.bankruptcyFloor} or more on a night by then, after any Upkeep due.`,
  ];
}

/**
 * `show`: the seed, the Turn, the Bankruptcy countdown while the player's Guild is below the floor,
 * the Guilds in play, and how many of everything there are. A folded Guild is counted, and listed
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
            facilityKeys.map((facility) => `${facilityNames[facility]} grade ${player.hall[facility]}`).join(', ') +
            ' (show hall gives each grade and what the next costs).',
        ];
  return [
    `Seed ${meta.seed}, ${renderTime(world.turn, deps.config)}, created ${meta.createdAt}`,
    ...renderCountdown(document, deps),
    '',
    ...guildTable(playing, document, deps),
    '',
    counts.join(', '),
    ...hall,
  ];
}

/** `show guilds`: every Guild, a folded one marked with the date it folded. */
export function renderGuilds(document: WorldDocument, deps: EngineDeps): string[] {
  return ['Guilds', '', ...guildTable(Object.values(document.world.guilds), document, deps)];
}

// ── The Hall ─────────────────────────────────────────────────────────────────────────────────

/**
 * `show hall [guildId]`: each facility of the Guild's Hall, its grade and the Improvement built at
 * it, and the next grade's Improvement and cost (`nextImprovement`), or that it is at the top; then
 * what the facilities do, in words. The player's Guild unless given another.
 */
export function renderHall(guild: Guild, deps: EngineDeps): string[] {
  const { content } = deps;
  const builtAt = (facility: FacilityKey, grade: number): string =>
    Object.values(content.improvements).find((row) => row.facility === facility && row.grade === grade)?.name ?? '';
  const rows = facilityKeys.map((facility) => {
    const grade = guild.hall[facility];
    const next = nextImprovement(guild, facility, content);
    return [
      capitalised(facilityNames[facility]),
      String(grade),
      grade === 0 ? 'None' : builtAt(facility, grade),
      next === null ? 'None: the top grade' : next.name,
      next === null ? '' : String(next.cost),
    ];
  });
  return [
    `Hall of ${guild.name} (${guild.id})`,
    '',
    ...table(
      [
        { heading: 'Facility' },
        { heading: 'Grade', align: 'right' },
        { heading: 'Built' },
        { heading: 'Next grade' },
        { heading: 'Cost', align: 'right' },
      ],
      rows,
    ),
    '',
    'The infirmary shortens the Days an Injury takes to heal; the training yard gives every Hero on',
    'the Roster who is home and unhurt XP each night; the quarters raise the Morale the Roster settles',
    'toward. Each grade does more than the one below it, and each adds to the Upkeep.',
  ];
}

// ── Heroes ───────────────────────────────────────────────────────────────────────────────────

/** A column a view adds to the Hero table, after the others: its heading and each Hero's cell. */
interface HeroColumn extends Column {
  cell: (hero: Hero) => string;
}

function heroTable(
  heroes: readonly Hero[],
  document: WorldDocument,
  deps: EngineDeps,
  more: readonly HeroColumn[] = [],
): string[] {
  const { content, config } = deps;
  const { turn } = document.world;
  return table(
    [
      { heading: 'Id' },
      { heading: 'Name' },
      { heading: 'Class' },
      { heading: 'Level', align: 'right' },
      { heading: 'Age', align: 'right' },
      { heading: 'Morale', align: 'right' },
      { heading: 'Background' },
      ...more,
    ],
    heroes.map((hero) => [
      hero.id,
      hero.name,
      nameIn(content.classes, hero.classKey),
      String(hero.level),
      String(ageOf(hero, turn, config)),
      String(hero.morale),
      nameIn(content.backgrounds, hero.backgroundKey),
      ...more.map((column) => column.cell(hero)),
    ]),
  );
}

/**
 * `show roster [guildId]`: the Guild's Roster in its own order, then what the Guild holds (M5-S2):
 * each unique Item and stack in its holding, with the id `equip` takes. Another Guild's Roster adds
 * each Hero's Transfer fee, what the player's Guild would pay to take them (`transfer --in`): the
 * engine's `transferFee` at the player's Guildmaster's Negotiation (M6-S2), shown before it is paid.
 */
export function renderRoster(guild: Guild, document: WorldDocument, deps: EngineDeps): string[] {
  const heroes = guild.rosterIds.flatMap((id) => rowIn(document.world.heroes, id) ?? []);
  const player = playerGuild(document.world);
  const buyer = player === undefined ? undefined : guildmasterOf(player, document.world);
  const fees: HeroColumn[] =
    player === undefined || player.id === guild.id
      ? []
      : [{ heading: 'Transfer fee', align: 'right', cell: (hero) => String(transferFee(hero, buyer, deps)) }];
  const held = holdings(document.world, { kind: 'guild', id: guild.id });
  const rows = [...held.items, ...held.stacks].map((row) => {
    const definition = itemDefinition(deps.content, row.definitionKey);
    return [
      row.id,
      nameIn(deps.content.items, row.definitionKey),
      definition === undefined ? '' : kindWords(definition),
      'quantity' in row ? String(row.quantity) : '1',
      definition?.kind === 'gear' ? modifierWords(definition, deps.content) : '',
    ];
  });
  return [
    `Roster of ${guild.name} (${guild.id})`,
    '',
    ...heroTable(heroes, document, deps, fees),
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
 * The gear a Hero carries (M5-S2): a row for each gear slot (`gearSlotKeys`), the Item in it or
 * `none`, then any Item held in a slot that is no gear slot, as the engine's `carriedGear` gives.
 */
function gearRows(hero: Hero, document: WorldDocument, deps: EngineDeps): string[][] {
  const carried: (UniqueItem | Stack)[] = carriedGear(document.world, hero.id);
  const slotOf = (row: UniqueItem | Stack): string => (row.holder.kind === 'hero' ? row.holder.slot : '');
  const line = (slot: string, row: UniqueItem | Stack): string[] => {
    const definition = itemDefinition(deps.content, row.definitionKey);
    return [
      slot,
      nameIn(deps.content.items, row.definitionKey),
      row.id,
      definition?.kind === 'gear' ? modifierWords(definition, deps.content) : '',
    ];
  };
  const listed: string[] = [...gearSlotKeys];
  return [
    ...listed.flatMap((slot) => {
      const inSlot = carried.filter((row) => slotOf(row) === slot);
      return inSlot.length === 0 ? [[slot, 'none', '', '']] : inSlot.map((row) => line(slot, row));
    }),
    ...carried.filter((row) => !listed.includes(slotOf(row))).map((row) => line(slotOf(row), row)),
  ];
}

/**
 * `show pool`: the Unattached Heroes, each with the signing fee the engine's selector gives and,
 * when there is a player's Guild, whether they would sign for it: `yes`, or the Fame they ask of
 * it (M3-S5, `signingRefusal`), since a Hero of a higher Level will not sign for a Guild whose Fame
 * is below what their Level asks.
 */
export function renderPool(document: WorldDocument, deps: EngineDeps): string[] {
  const guild = playerGuild(document.world);
  // The fee the player's Guild would pay: its Guildmaster's Negotiation applied (M4-S5).
  const buyer = guild === undefined ? undefined : guildmasterOf(guild, document.world);
  const columns: HeroColumn[] = [{ heading: 'Fee', align: 'right', cell: (hero) => String(signingFee(hero, deps, buyer)) }];
  if (guild !== undefined) {
    columns.push({
      heading: 'Signs',
      cell: (hero) => {
        const refusal = signingRefusal(guild, hero, deps.config);
        return refusal === null ? 'Yes' : `Needs Fame ${refusal.fameRequired}`;
      },
    });
  }
  const note =
    guild === undefined
      ? []
      : ['', `${guild.name} has ${guild.fame} Fame. A Hero who needs more will not sign for it until it has that much.`];
  return ['Unattached pool', '', ...heroTable(unattachedHeroes(document.world), document, deps, columns), ...note];
}

/** A Hero's descriptive Attributes, in the order a Guildmaster's are shown: no Birthplace (v1.1.3-S6). */
const heroAttributes = ['appearance', 'biography'] as const;

/**
 * `show hero <id>`: the Hero's Attributes, their Portrait, Appearance and Biography (v1.1.3-S6), State, Stats, gear and Skills. Never Potential (rule 9):
 * each Stat's base value, read through `baseStat`, and beside it its effective value, the engine's
 * `effectiveStats` with the Guildmaster's Class bonus, the Hero's gear (M5-S2) and their Hero Traits'
 * Stat changes (v1.1.4-S7), which is what a
 * Quest's Check reads; then its Potential hint under "Outlook", the word `potentialHint` gives (M3-S3) through the bands the player's
 * Guildmaster reads, narrowed by their Judgement (`judgedHintBands`, M4-S5). For a Hero on a
 * Roster, each other Hero on it with the Hero's Regard for them and the Relationship between the
 * two, as bands and never as numbers (M4-S4, DL-46): what the teamwork of a Party reads. For a Hero
 * on another Guild's Roster, the Transfer fee the player's Guild would pay to take them (M6-S2).
 */
export function renderHero(hero: Hero, document: WorldDocument, deps: EngineDeps): string[] {
  const { content, config } = deps;
  const { world } = document;
  const guild = hero.guildId === null ? undefined : rowIn(world.guilds, hero.guildId);
  const player = playerGuild(world);
  const reader = player === undefined ? undefined : guildmasterOf(player, world);
  const bands = { potentialHintBands: judgedHintBands(reader, content, config) };

  const attributes: [string, string][] = [
    ['Sex', capitalised(hero.sex)],
    // The picture by its key (v1.1.3-S6), which the page finds in `media/`; none shows the Silhouette.
    ['Portrait', hero.portraitKey ?? 'None: the Silhouette'],
    ['Age', String(ageOf(hero, world.turn, config))],
    ['Class', nameIn(content.classes, hero.classKey)],
    ['Background', nameIn(content.backgrounds, hero.backgroundKey)],
    ['Guild', hero.guildId === null ? (hero.unattachedSince === null ? 'None' : 'Unattached') : `${guild?.name ?? hero.guildId} (${hero.guildId})`],
    ['Level', String(hero.level)],
    ['XP', String(hero.xp)],
    ['Morale', String(hero.morale)],
    [
      'Injury',
      hero.injury === null
        ? 'none'
        : `${nameIn(content.injuries, hero.injury.typeKey)}, healing on ${nightOfTurn(hero.injury.healsOnTurn, config)} ` +
          `(Turn ${hero.injury.healsOnTurn})`,
    ],
    // Each Trait with what it does (v1.1.4-S7): `Lame (-2 Dexterity, -1 Endurance)`.
    ['Traits', none(hero.traits.map((key) => `${nameIn(content.heroTraits, key)} (${traitEffectWords(rowIn(content.heroTraits, key)?.effects ?? [], content)})`))],
    // A Hero's two descriptive Attributes, written as they were generated (v1.1.3-S6); none is shown when empty.
    ...heroAttributes.flatMap((attribute): [string, string][] => (hero[attribute] === '' ? [] : [[descriptiveAttributeLabels[attribute], hero[attribute]]])),
  ];
  // A Hero on another Guild's Roster: what the player's Guild would pay to take them (M6-S2).
  if (player !== undefined && guild !== undefined && guild.id !== player.id && guild.rosterIds.includes(hero.id)) {
    attributes.push(['Transfer fee', String(transferFee(hero, reader, deps))]);
  }
  if (hero.partyId !== null) attributes.push(['Party', hero.partyId]);
  if (hero.diedOnTurn !== null) attributes.push(['Died', renderDate(hero.diedOnTurn, config)]);
  if (hero.retiredOnTurn !== null) attributes.push(['Retired', renderDate(hero.retiredOnTurn, config)]);
  if (hero.leftPoolOnTurn !== null) attributes.push(['Left the pool', renderDate(hero.leftPoolOnTurn, config)]);

  let lastArea = '';
  const effective = effectiveStats(hero, world, content);
  const stats = Object.values(content.stats)
    .filter((stat) => stat.owner === 'hero')
    .map((stat) => {
      const area = stat.area === lastArea ? '' : capitalised(stat.area);
      lastArea = stat.area;
      return [
        area,
        stat.name,
        String(baseStat(hero.stats, stat)),
        String(effective[stat.key] ?? baseStat(hero.stats, stat)),
        potentialHint(hero, stat.key, bands),
      ];
    });

  const skillKeys = Object.keys(hero.skills);
  const inContentOrder = [
    ...Object.keys(content.skills).filter((key) => skillKeys.includes(key)),
    ...skillKeys.filter((key) => !Object.hasOwn(content.skills, key)),
  ];
  const skills = inContentOrder.map((key) => [nameIn(content.skills, key), String(hero.skills[key])]);

  // Relationships on the Roster (M4-S4): bands only.
  const onRoster = guild?.rosterIds.includes(hero.id) === true;
  const mates = (onRoster ? (guild?.rosterIds ?? []) : []).flatMap((id) => {
    const mate = id === hero.id ? undefined : rowIn(world.heroes, id);
    if (mate === undefined) return [];
    return [
      [
        mate.id,
        mate.name,
        nameIn(content.classes, mate.classKey),
        regardBand(regardValue(hero.regard, mate.id), config),
        regardBand(relationship(hero.id, mate.id, world, config), config),
      ],
    ];
  });
  const relationships = onRoster
    ? [
        '',
        'Relationships on the Roster',
        ...(mates.length === 0
          ? ['None']
          : table([{ heading: 'Id' }, { heading: 'Hero' }, { heading: 'Class' }, { heading: 'Regard' }, { heading: 'Relationship' }], mates)),
      ]
    : [];

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
    ...table([{ heading: 'Slot' }, { heading: 'Item' }, { heading: 'Id' }, { heading: 'Modifies' }], gearRows(hero, document, deps)),
    '',
    'Skills',
    ...(skills.length === 0
      ? ['None']
      : table([{ heading: 'Skill' }, { heading: 'Rating', align: 'right' }], skills)),
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
    const guild = rowIn(world.guilds, ranking.guildId);
    return [
      ranking.joint ? `joint ${ranking.place}` : String(ranking.place),
      ranking.guildId,
      guild?.name ?? ranking.guildId,
      guild === undefined ? '' : controllerOf(guild, deps.content),
      String(ranking.value),
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
    guild === undefined ? [] : [regardBand(patronRegardFor(patron, guild.id), deps.config)];
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
  coaching: 'The XP of the training yard',
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
  const band = (value: number): string => regardBand(value, config);

  const stats = Object.values(content.stats)
    .filter((stat) => stat.owner === 'guildmaster')
    .map((stat) => [stat.name, String(baseStat(guildmaster.stats, stat)), guildmasterRules[stat.key] ?? '']);
  const traits = guildmaster.traits.map((key) => [
    nameIn(content.guildmasterTraits, key),
    traitEffectWords(rowIn(content.guildmasterTraits, key)?.effects ?? [], content),
  ]);
  const patrons = Object.values(world.patrons).map((patron) => [
    patron.id,
    patron.name,
    nameIn(content.spheres, patron.sphereKey),
    band(regardValue(guildmaster.regard, patron.id)),
  ]);
  const heroes = guild.rosterIds.flatMap((heroId) => {
    const hero = rowIn(world.heroes, heroId);
    if (hero === undefined) return [];
    return [[hero.id, hero.name, nameIn(content.classes, hero.classKey), band(regardValue(guildmaster.regard, hero.id))]];
  });
  const others = Object.values(world.guilds)
    .filter((other) => other.id !== guild.id && other.foldedOnTurn === null)
    .map((other) => [
      other.id,
      other.name,
      rowIn(world.guildmasters, other.guildmasterId)?.name ?? other.guildmasterId,
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

/** What a Quest requires beyond its Party size: a Class, a Skill, both, or nothing. */
function requiredOf(quest: Quest, content: ContentSet): string {
  const { classKey, skillKey } = quest.requirements;
  const needs = [
    ...(classKey === undefined ? [] : [nameIn(content.classes, classKey)]),
    ...(skillKey === undefined ? [] : [nameIn(content.skills, skillKey)]),
  ];
  return needs.join(', ');
}

/**
 * `show board`: the Quests on offer in the Board's order, each with its template's name, its
 * Patron, its terms and the last date it stays on offer; then the Skills that help in its Encounters'
 * Checks and the kinds of those Encounters (M4-S1, M4 verification); then each Quest's Encounters
 * with each Check's name and what it reads, and the player's best Party with its chance (v1.1.4-S6,
 * DL-148 items 15 to 17), where M2-S3's demands stood, which no view shows now.
 */
export function renderBoard(document: WorldDocument, deps: EngineDeps): string[] {
  const { world } = document;
  const { content } = deps;
  const quests = world.board.flatMap((id) => rowIn(world.quests, id) ?? []);
  const heading = `Board: ${quests.length} ${quests.length === 1 ? 'Quest' : 'Quests'} on offer, ${renderTime(world.turn, deps.config)}`;
  if (quests.length === 0) return [heading, '', 'The Board is empty.'];
  return [
    heading,
    '',
    ...table(
      [
        { heading: 'Id' },
        { heading: 'Quest' },
        { heading: 'Patron' },
        { heading: 'Difficulty', align: 'right' },
        { heading: 'Days', align: 'right' },
        { heading: 'Reward', align: 'right' },
        { heading: 'Fame', align: 'right' },
        { heading: 'Party' },
        { heading: 'Requires' },
        { heading: 'On offer through' },
      ],
      quests.map((quest) => [
        quest.id,
        nameIn(content.questTemplates, quest.templateKey),
        rowIn(world.patrons, quest.patronId)?.name ?? quest.patronId,
        String(quest.difficulty),
        String(durationDaysOf(quest)),
        String(quest.reward),
        String(quest.fameEffect),
        `${quest.requirements.partySizeMin} to ${quest.requirements.partySizeMax}`,
        requiredOf(quest, content),
        dateOfTurn(quest.expiresOnTurn, deps.config),
      ]),
    ),
    '',
    ...table(
      [{ heading: 'Id' }, { heading: 'Skills that help' }, { heading: 'Encounters' }],
      quests.map((quest) => [quest.id, skillsThatHelpWords(quest, content), encounterKindsOf(quest, content)]),
    ),
    ...quests.flatMap((quest) => ['', ...questReadings(document, quest, deps)]),
  ];
}

/**
 * A Quest's Encounters as the Board gives them (v1.1.4-S6): each with its kind and each Check's name
 * and what it reads, an Encounter of one Check of its own name on one line; then the Party the engine
 * would send from the player's free Heroes (`partyFor`) and its chance, if no one falls.
 */
function questReadings(document: WorldDocument, quest: Quest, deps: EngineDeps): string[] {
  const { content } = deps;
  const readings = encounterReadings(quest, content);
  const lines = readings.flatMap((reading) => {
    const kind = reading.kind === null ? '' : ` (${reading.kind})`;
    if (readsAsOne(reading)) return [`  ${reading.name}${kind}: ${reading.checks[0]?.reads ?? ''}`];
    return [`  ${reading.name}${kind}`, ...reading.checks.map((it) => `    ${it.name}: ${it.reads}`)];
  });
  return [
    `${quest.id}, ${nameIn(content.questTemplates, quest.templateKey)}`,
    ...(readings.length === 0 ? ['  Its Encounters are drawn on the way.'] : lines),
    `  ${bestPartyWords(document, quest, deps)}`,
  ];
}

/** "Your best Party": the Party `partyFor` names from the player's free Heroes, its chance in a word and floored to 5%, or why there is none. */
function bestPartyWords(document: WorldDocument, quest: Quest, deps: EngineDeps): string {
  const { world } = document;
  const guild = playerGuild(world);
  const available = guild === undefined ? [] : availableHeroes(world, guild);
  const best = guild === undefined ? null : bestParty(world, guild, quest, available, deps);
  if (best === null) return 'No Party of your free Heroes meets its requirements.';
  const names = best.heroIds.flatMap((id) => rowIn(world.heroes, id)?.name ?? []).join(', ');
  // The estimate the rule chose the Party by, which is `estimateQuest`'s for it: not worked out again.
  const { estimate } = best;
  if (estimate === null) return `Your best Party: ${names}; its chance is not known until its Encounters are drawn.`;
  return `Your best Party: ${chanceWords[estimate.chance]} (${shownPercent(estimate.success)}% if no one falls), ${names}.`;
}

/** The Skills that help on a Quest, by name: the engine's `skillsThatHelp` (DL-70; moved there by M7-S3, DL-66). */
function skillsThatHelpWords(quest: Pick<Quest, 'encounterKeys' | 'skillKeys'>, content: ContentSet): string {
  return none(skillsThatHelp(quest, content).map((key) => nameIn(content.skills, key)));
}

/**
 * The kinds of a Quest's Encounters in the order it meets them (M4-S1), so the player can see what
 * kind of work it is; a Quest drawn before M4 has its sequence drawn when it resolves (DL-42).
 */
function encounterKindsOf(quest: Pick<Quest, 'encounterKeys'>, content: ContentSet): string {
  if (quest.encounterKeys.length === 0) return 'drawn on the way';
  return quest.encounterKeys.map((key) => rowIn(content.encounters, key)?.kind ?? key).join(', ');
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
