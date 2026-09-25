// Everything the CLI prints about a world, as plain lines: aligned text tables, no colour, no
// cursor control, nothing that waits for a key.
//
// The CLI holds no rule. Every number printed here is a document field (Wealth, Fame, Level, XP,
// Morale, a Turn), the size of a document table or list, or the result of an engine selector
// (`ageOf`, `baseStat`, `signingFee`, `signingRefusal`, `rankings`, `unattachedHeroes`); every
// name is a document field or a content row's display name. Where the engine has no selector for
// something a view needs, the selector goes into the engine, not here.
//
// Potential is stored plainly and never shown (data-model rule 9): no view reads
// `hero.potential`, only the engine's `potentialHint` word for it, and main.test.ts checks the
// printed Hero for it.

import {
  ageOf,
  baseStat,
  dayOf,
  playerGuild,
  rankings,
  signingFee,
  signingRefusal,
  durationDaysOf,
  potentialHint,
  timeOfDay,
  unattachedHeroes,
  upkeep,
  yearOf,
  type ContentSet,
  type EngineDeps,
  type Entry,
  type FacilityKey,
  type Guild,
  type Hero,
  type Patron,
  type Quest,
  type RankingMeasure,
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
export function nameIn(rows: Readonly<Record<string, { name: string }>>, key: string): string {
  return Object.hasOwn(rows, key) ? (rows[key]?.name ?? key) : key;
}

/**
 * The row of `rows` keyed by `id`, or `undefined` when there is none: an ordinary lookup that
 * does not fall through to `Object.prototype` for a key such as `constructor`.
 */
export function rowIn<Row>(rows: Readonly<Record<string, Row>>, id: string): Row | undefined {
  return Object.hasOwn(rows, id) ? rows[id] : undefined;
}

/** A Hall facility as the CLI names one in a sentence (`CONTEXT.md`, Hall). */
export const facilityNames: Readonly<Record<FacilityKey, string>> = Object.freeze({
  infirmary: 'infirmary',
  trainingYard: 'training yard',
  quarters: 'quarters',
});

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

/**
 * The Guilds as a table. When any has folded, a last column marks each folded one with the Day it
 * folded (DL-28, DL-33): its row stays, out of play, with an empty Roster.
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
      controllerOf(guild),
      rowIn(world.guildmasters, guild.guildmasterId)?.name ?? guild.guildmasterId,
      nameIn(content.backgrounds, guild.backgroundKey),
      String(guild.rosterIds.length),
      String(guild.wealth),
      String(guild.fame),
      String(upkeep(guild, world, config)),
      ...(anyFolded ? [guild.foldedOnTurn === null ? '' : `on Day ${dayOf(guild.foldedOnTurn)}`] : []),
    ]),
  );
}

function inPlay(guild: Guild): boolean {
  return guild.foldedOnTurn === null;
}

/**
 * `show`: the seed, the Turn, the Guilds in play, and how many of everything there are. A folded
 * Guild is counted, and listed by `show guilds` (DL-33).
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
  return [
    `Seed ${meta.seed}, ${renderTime(world.turn, deps.config)}, created ${meta.createdAt}`,
    '',
    ...guildTable(playing, document, deps),
    '',
    counts.join(', '),
  ];
}

/** `show guilds`: every Guild, a folded one marked with the Day it folded. */
export function renderGuilds(document: WorldDocument, deps: EngineDeps): string[] {
  return ['Guilds', '', ...guildTable(Object.values(document.world.guilds), document, deps)];
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

/**
 * `show pool`: the Unattached Heroes, each with the signing fee the engine's selector gives and,
 * when there is a player's Guild, whether they would sign for it: `yes`, or the Fame they ask of
 * it (M3-S5, `signingRefusal`), since a Hero of a higher Level will not sign for a Guild whose Fame
 * is below what their Level asks.
 */
export function renderPool(document: WorldDocument, deps: EngineDeps): string[] {
  const guild = playerGuild(document.world);
  const columns: HeroColumn[] = [{ heading: 'Fee', align: 'right', cell: (hero) => String(signingFee(hero, deps)) }];
  if (guild !== undefined) {
    columns.push({
      heading: 'Signs',
      cell: (hero) => {
        const refusal = signingRefusal(guild, hero, deps.config);
        return refusal === null ? 'yes' : `needs Fame ${refusal.fameRequired}`;
      },
    });
  }
  const note =
    guild === undefined
      ? []
      : ['', `${guild.name} has ${guild.fame} Fame. A Hero who needs more will not sign for it until it has that much.`];
  return ['Unattached pool', '', ...heroTable(unattachedHeroes(document.world), document, deps, columns), ...note];
}

/**
 * `show hero <id>`: the Hero's Attributes, State, Stats and Skills. Never Potential (rule 9): the
 * Stats shown are base values, read through `baseStat`, each with its Potential hint beside it
 * under "Outlook", the word `potentialHint` gives (M3-S3).
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
      return [area, stat.name, String(baseStat(hero.stats, stat)), potentialHint(hero, stat.key, config)];
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
    ...table([{ heading: 'Area' }, { heading: 'Stat' }, { heading: 'Value', align: 'right' }, { heading: 'Outlook' }], stats),
    '',
    'Skills',
    ...(skills.length === 0
      ? ['none']
      : table([{ heading: 'Skill' }, { heading: 'Rating', align: 'right' }], skills)),
  ];
}

// ── Rankings ─────────────────────────────────────────────────────────────────────────────────

/**
 * `show rankings [--by wealth]` (M3-S5, R10): every Guild in play, the player's among them, in the
 * order the engine's `rankings` gives, by Fame unless by Wealth. A folded Guild is not ranked.
 */
export function renderRankings(document: WorldDocument, deps: EngineDeps, by: RankingMeasure): string[] {
  const { world } = document;
  const measure = by === 'fame' ? 'Fame' : 'Wealth';
  const rows = rankings(world, by).map((ranking) => {
    const guild = rowIn(world.guilds, ranking.guildId);
    return [
      String(ranking.rank),
      ranking.guildId,
      guild?.name ?? ranking.guildId,
      guild === undefined ? '' : controllerOf(guild),
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
 * Patron, its terms and the last Day it stays on offer; then what each demands and the Skills
 * that help (M2-S3).
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
        `Day ${dayOf(quest.expiresOnTurn)}`,
      ]),
    ),
    '',
    ...table(
      [{ heading: 'Id' }, { heading: 'Demands' }, { heading: 'Skills that help' }],
      quests.map((quest) => [
        quest.id,
        quest.demands.map(([key, weight]) => `${nameIn(content.stats, key)} ${weight}`).join(', '),
        none(quest.skillKeys.map((key) => nameIn(content.skills, key))),
      ]),
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
