// Everything the CLI prints about a world, as plain lines: aligned text tables, no colour, no
// cursor control, nothing that waits for a key.
//
// The CLI holds no rule. Every number printed here is a document field (Wealth, Fame, Level, XP,
// Morale, a Turn), the size of a document table or list, or the result of an engine selector
// (`ageOf`, `baseStat`, `signingFee`, `unattachedHeroes`); every name is a document field or a
// content row's display name. Where the engine has no selector for something a view needs, the
// selector goes into the engine, not here.
//
// Potential is stored plainly and never shown (data-model rule 9): no view reads
// `hero.potential`, and main.test.ts checks the printed Hero for it.

import {
  ageOf,
  baseStat,
  dayOf,
  signingFee,
  timeOfDay,
  unattachedHeroes,
  upkeep,
  yearOf,
  type EngineDeps,
  type Entry,
  type Guild,
  type Hero,
  type Patron,
  type WorldDocument,
} from '@heroesim/engine';

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

/** A content row's display name; a key the content does not define is shown as it is (rule 5). */
function nameIn(rows: Readonly<Record<string, { name: string }>>, key: string): string {
  return Object.hasOwn(rows, key) ? (rows[key]?.name ?? key) : key;
}

/**
 * The row of `rows` keyed by `id`, or `undefined` when there is none: an ordinary lookup that
 * does not fall through to `Object.prototype` for a key such as `constructor`.
 */
export function rowIn<Row>(rows: Readonly<Record<string, Row>>, id: string): Row | undefined {
  return Object.hasOwn(rows, id) ? rows[id] : undefined;
}

function capitalised(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

function none(list: readonly string[]): string {
  return list.length === 0 ? 'none' : list.join(', ');
}

// ── Time ─────────────────────────────────────────────────────────────────────────────────────

/**
 * The Turn and where it falls: `Turn 3 (Day 1, morning, Year 0)`. Day and Year count from 0, as
 * the Turn does, and come from the engine's selectors under the rules the save plays under.
 */
export function renderTime(turn: number, config: EngineDeps['config']): string {
  return `Turn ${turn} (Day ${dayOf(turn)}, ${timeOfDay(turn)}, Year ${yearOf(turn, config)})`;
}

// ── Guilds and the summary ───────────────────────────────────────────────────────────────────

function controllerOf(guild: Guild): string {
  return guild.controller.kind === 'player' ? 'Player' : `Rival (${guild.controller.disposition})`;
}

function guildTable(document: WorldDocument, deps: EngineDeps): string[] {
  const { world } = document;
  const { content, config } = deps;
  const guilds = Object.values(world.guilds);
  return table(
    [
      { heading: 'Id' },
      { heading: 'Guild' },
      { heading: 'Controller' },
      { heading: 'Guildmaster' },
      { heading: 'Background' },
      { heading: 'Roster', align: 'right' },
      { heading: 'Wealth', align: 'right' },
      { heading: 'Fame', align: 'right' },
      { heading: 'Upkeep', align: 'right' },
    ],
    guilds.map((guild) => [
      guild.id,
      guild.name,
      controllerOf(guild),
      rowIn(world.guildmasters, guild.guildmasterId)?.name ?? guild.guildmasterId,
      nameIn(content.backgrounds, guild.backgroundKey),
      String(guild.rosterIds.length),
      String(guild.wealth),
      String(guild.fame),
      String(upkeep(guild, world, config)),
    ]),
  );
}

/** `show`: the seed, the Turn, every Guild, and how many of everything there are. */
export function renderSummary(document: WorldDocument, deps: EngineDeps): string[] {
  const { meta, world, history } = document;
  const heroes = Object.keys(world.heroes).length;
  const counts = [
    `${Object.keys(world.guilds).length} Guilds`,
    `${heroes} Heroes (${unattachedHeroes(world).length} Unattached)`,
    `${Object.keys(world.patrons).length} Patrons`,
    `${history.entries.length} History entries`,
  ];
  return [
    `Seed ${meta.seed}, ${renderTime(world.turn, deps.config)}, created ${meta.createdAt}`,
    '',
    ...guildTable(document, deps),
    '',
    counts.join(', '),
  ];
}

/** `show guilds`. */
export function renderGuilds(document: WorldDocument, deps: EngineDeps): string[] {
  return ['Guilds', '', ...guildTable(document, deps)];
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

/** `show roster [guildId]`: the Guild's Roster in its own order. */
export function renderRoster(guild: Guild, document: WorldDocument, deps: EngineDeps): string[] {
  const heroes = guild.rosterIds.flatMap((id) => rowIn(document.world.heroes, id) ?? []);
  return [`Roster of ${guild.name} (${guild.id})`, '', ...heroTable(heroes, document, deps)];
}

/** `show pool`: the Unattached Heroes, each with the signing fee the engine's selector gives. */
export function renderPool(document: WorldDocument, deps: EngineDeps): string[] {
  const fee: HeroColumn = { heading: 'Fee', align: 'right', cell: (hero) => String(signingFee(hero, deps)) };
  return ['Unattached pool', '', ...heroTable(unattachedHeroes(document.world), document, deps, [fee])];
}

/**
 * `show hero <id>`: the Hero's Attributes, State, Stats and Skills. Never Potential (rule 9): the
 * Stats shown are base values, read through `baseStat`.
 */
export function renderHero(hero: Hero, document: WorldDocument, deps: EngineDeps): string[] {
  const { content, config } = deps;
  const { world } = document;
  const guild = hero.guildId === null ? undefined : rowIn(world.guilds, hero.guildId);

  const attributes: [string, string][] = [
    ['Sex', hero.sex],
    ['Age', String(ageOf(hero, world.turn, config))],
    ['Class', nameIn(content.classes, hero.classKey)],
    ['Background', nameIn(content.backgrounds, hero.backgroundKey)],
    ['Guild', hero.guildId === null ? (hero.unattachedSince === null ? 'none' : 'Unattached') : `${guild?.name ?? hero.guildId} (${hero.guildId})`],
    ['Level', String(hero.level)],
    ['XP', String(hero.xp)],
    ['Morale', String(hero.morale)],
    ['Injury', hero.injury === null ? 'none' : `${hero.injury.typeKey}, heals on Turn ${hero.injury.healsOnTurn}`],
    ['Traits', none(hero.traits.map((key) => nameIn(content.traits, key)))],
  ];
  if (hero.partyId !== null) attributes.push(['Party', hero.partyId]);
  if (hero.diedOnTurn !== null) attributes.push(['Died', `Turn ${hero.diedOnTurn}`]);
  if (hero.retiredOnTurn !== null) attributes.push(['Retired', `Turn ${hero.retiredOnTurn}`]);
  if (hero.leftPoolOnTurn !== null) attributes.push(['Left the pool', `Turn ${hero.leftPoolOnTurn}`]);

  let lastArea = '';
  const stats = Object.values(content.stats)
    .filter((stat) => stat.owner === 'hero')
    .map((stat) => {
      const area = stat.area === lastArea ? '' : capitalised(stat.area);
      lastArea = stat.area;
      return [area, stat.name, String(baseStat(hero.stats, stat))];
    });

  const skillKeys = Object.keys(hero.skills);
  const inContentOrder = [
    ...Object.keys(content.skills).filter((key) => skillKeys.includes(key)),
    ...skillKeys.filter((key) => !Object.hasOwn(content.skills, key)),
  ];
  const skills = inContentOrder.map((key) => [nameIn(content.skills, key), String(hero.skills[key])]);

  return [
    `${hero.name} (${hero.id})`,
    '',
    ...fields(attributes),
    '',
    'Stats',
    ...table([{ heading: 'Area' }, { heading: 'Stat' }, { heading: 'Value', align: 'right' }], stats),
    '',
    'Skills',
    ...(skills.length === 0
      ? ['none']
      : table([{ heading: 'Skill' }, { heading: 'Rating', align: 'right' }], skills)),
  ];
}

// ── Patrons ──────────────────────────────────────────────────────────────────────────────────

/** `show patrons`. */
export function renderPatrons(document: WorldDocument, deps: EngineDeps): string[] {
  const patrons: Patron[] = Object.values(document.world.patrons);
  return [
    'Patrons',
    '',
    ...table(
      [{ heading: 'Id' }, { heading: 'Patron' }, { heading: 'Sphere' }],
      patrons.map((patron) => [patron.id, patron.name, nameIn(deps.content.spheres, patron.sphereKey)]),
    ),
  ];
}

// ── History ──────────────────────────────────────────────────────────────────────────────────

/**
 * `show history [entityId]`: entries as the engine's History readers return them, under a
 * heading that says which and in what order. Each names its participants by the labels it was
 * written with, so a Hero since removed still reads.
 */
export function renderHistory(heading: string, entries: readonly Entry[]): string[] {
  return [
    heading,
    '',
    ...table(
      [{ heading: 'Turn', align: 'right' }, { heading: 'Event' }, { heading: 'Milestone' }, { heading: 'Who' }],
      entries.map((entry) => [
        String(entry.turn),
        entry.type,
        entry.milestone ? 'yes' : '',
        entry.participants.map((id) => entry.labels[id] ?? id).join(', '),
      ]),
    ),
  ];
}

// ── Advancing ────────────────────────────────────────────────────────────────────────────────

/** `advance`: how many Turns were played, where time stands now, and the events they made. */
export function renderAdvance(
  played: number,
  events: readonly Entry[],
  document: WorldDocument,
  deps: EngineDeps,
): string[] {
  const { turn, ended } = document.world;
  return [
    `Played ${played} ${played === 1 ? 'Turn' : 'Turns'}. Now ${renderTime(turn, deps.config)}.`,
    ...(ended === null ? [] : [`The game ended on Turn ${ended.turn}: ${ended.reason}.`]),
    '',
    ...(events.length === 0 ? ['No events.'] : renderHistory(`Events: ${events.length}, oldest first`, events)),
  ];
}
