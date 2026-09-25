// The creation sweep (M1-S10): create a world from each seed, validate it, describe it, then
// create every world a second time and compare the two serialisations byte for byte. The
// determinism measure is DL-13. M2-S12's play sweep starts from the same `createWorld` call and
// reuses the world description and the report's helpers.

import { createHash } from 'node:crypto';
import {
  createWorld,
  serialise,
  validate,
  type EngineDeps,
  type ValidationFailure,
  type WorldDocument,
  type WorldSetup,
} from '@heroesim/engine';
import { fixed, localTimestamp, markdownTable, whole, type Machine } from './report.js';
import { summarise, tally, type Summary } from './stats.js';

/**
 * The player's choices in every harness world. `createdAt` is fixed so that `meta`, and so the
 * whole document, compares byte for byte (pre-M0 review D10.1); the Guild's Background is left
 * to the seed.
 */
export const harnessSetup: Readonly<WorldSetup> = Object.freeze({
  guildmasterName: 'Aldith Barrowby',
  guildName: 'The Harness Guild',
  createdAt: 'harness',
});

/** What one world holds, in the numbers a report summarises. */
export interface WorldDescription {
  playerRoster: number;
  rivalRosters: number[];
  pool: number;
  patrons: number;
  heroes: number;
  /** Heroes of each Class. */
  heroesByClass: Record<string, number>;
  /** Every Hero's value of every Stat they hold, by Class key then Stat key. */
  heroStats: Record<string, Record<string, number[]>>;
}

/** Counts and Hero Stat values in `document`, read from its tables. */
export function describeWorld(document: WorldDocument): WorldDescription {
  const { world } = document;
  const guilds = Object.values(world.guilds);
  const heroes = Object.values(world.heroes);
  const heroStats: Record<string, Record<string, number[]>> = {};
  for (const hero of heroes) {
    const byStat = (heroStats[hero.classKey] ??= {});
    for (const [statKey, value] of Object.entries(hero.stats)) (byStat[statKey] ??= []).push(value);
  }
  return {
    heroesByClass: tally(heroes.map((hero) => hero.classKey)),
    playerRoster: guilds
      .filter((guild) => guild.controller.kind === 'player')
      .reduce((sum, guild) => sum + guild.rosterIds.length, 0),
    rivalRosters: guilds.filter((guild) => guild.controller.kind === 'rival').map((guild) => guild.rosterIds.length),
    pool: heroes.filter((hero) => hero.guildId === null).length,
    patrons: Object.keys(world.patrons).length,
    heroes: heroes.length,
    heroStats,
  };
}

/** One Hero Stat's values across the sweep, by Class. */
export interface StatByClass {
  key: string;
  name: string;
  area: string;
  min: number;
  max: number;
  byClass: Record<string, Summary>;
}

/** A Class whose Heroes took a Stat outside its content range somewhere in the sweep. */
export interface OutOfRange {
  classKey: string;
  statKey: string;
  min: number;
  max: number;
}

export interface CreationSweep {
  seeds: readonly string[];
  /** Every world the validator refused, with its failures. The run fails unless this is empty. */
  refused: { seed: string; failures: ValidationFailure[] }[];
  /** Warnings across every world, by check. */
  warnings: Record<string, number>;
  worldsWithWarnings: number;
  /** Worlds whose second creation serialised byte for byte as their first. */
  identical: number;
  /** Worlds whose second creation differed, and the first code unit where it did. */
  mismatches: { seed: string; offset: number }[];
  /**
   * SHA-256 of every world's serialisation in seed order, each followed by a newline: two runs,
   * on any machine, that print the same fingerprint created the same worlds.
   */
  fingerprint: string;
  /** Length of each world's serialisation, in UTF-16 code units (its bytes, while it is ASCII). */
  serialisedLength: Summary;
  /** Milliseconds per `createWorld` call, in the first pass and the second. */
  firstCreation: Summary;
  secondCreation: Summary;
  /** Milliseconds for the whole sweep: both passes, validation and description. */
  totalMs: number;
  playerRoster: Summary;
  rivalRoster: Summary;
  rivals: Summary;
  pool: Summary;
  patrons: Summary;
  heroes: Summary;
  /** Heroes of each Class across the sweep, in content order. */
  heroesByClass: Record<string, number>;
  /** Every Hero Stat in content order. */
  heroStats: StatByClass[];
  outOfRange: OutOfRange[];
}

export interface SweepOptions {
  setup?: WorldSetup;
  /** A millisecond clock: `performance.now` unless a test gives its own. */
  now?: () => number;
}

/** The first code unit at which `a` and `b` differ; -1 when they are equal. */
function firstDifference(a: string, b: string): number {
  if (a === b) return -1;
  const length = Math.min(a.length, b.length);
  for (let i = 0; i < length; i += 1) if (a.charCodeAt(i) !== b.charCodeAt(i)) return i;
  return length;
}

/**
 * Creates a world from each of `seeds` under `deps`, validates and describes it, then creates
 * each again and compares `serialise` output byte for byte. Never throws on what it finds: a
 * refused world or a mismatch is recorded for the report and for the caller to assert on.
 */
export function sweepCreation(seeds: readonly string[], deps: EngineDeps, options: SweepOptions = {}): CreationSweep {
  const { setup = harnessSetup, now = () => performance.now() } = options;
  const { content } = deps;
  const started = now();

  const refused: CreationSweep['refused'] = [];
  const warningChecks: string[] = [];
  let worldsWithWarnings = 0;
  const firstTimes: number[] = [];
  const lengths: number[] = [];
  const first: string[] = [];
  const descriptions: WorldDescription[] = [];
  const hash = createHash('sha256');

  for (const seed of seeds) {
    const before = now();
    const { document } = createWorld(seed, setup, deps);
    firstTimes.push(now() - before);

    const result = validate(document, content);
    if (!result.ok) refused.push({ seed, failures: result.failures });
    else if (result.warnings.length > 0) {
      worldsWithWarnings += 1;
      warningChecks.push(...result.warnings.map(({ check }) => check));
    }

    const text = serialise(document);
    first.push(text);
    lengths.push(text.length);
    hash.update(text).update('\n');
    descriptions.push(describeWorld(document));
  }

  const secondTimes: number[] = [];
  const mismatches: CreationSweep['mismatches'] = [];
  seeds.forEach((seed, i) => {
    const before = now();
    const { document } = createWorld(seed, setup, deps);
    secondTimes.push(now() - before);
    const offset = firstDifference(first[i] ?? '', serialise(document));
    if (offset !== -1) mismatches.push({ seed, offset });
  });

  const classKeys = Object.keys(content.classes);
  const heroStatRows = Object.values(content.stats).filter((stat) => stat.owner === 'hero');
  const heroStats: StatByClass[] = heroStatRows.map((stat) => ({
    key: stat.key,
    name: stat.name,
    area: stat.area,
    min: stat.min,
    max: stat.max,
    byClass: Object.fromEntries(
      classKeys.map((classKey) => [
        classKey,
        summarise(descriptions.flatMap((world) => world.heroStats[classKey]?.[stat.key] ?? [])),
      ]),
    ),
  }));
  const outOfRange = heroStats.flatMap((stat) =>
    Object.entries(stat.byClass)
      .filter(([, summary]) => summary.min < stat.min || summary.max > stat.max)
      .map(([classKey, summary]) => ({ classKey, statKey: stat.key, min: summary.min, max: summary.max })),
  );
  const heroesByClass = Object.fromEntries(
    classKeys.map((classKey) => [
      classKey,
      descriptions.reduce((sum, world) => sum + (world.heroesByClass[classKey] ?? 0), 0),
    ]),
  );

  return {
    seeds,
    refused,
    warnings: tally(warningChecks),
    worldsWithWarnings,
    identical: seeds.length - mismatches.length,
    mismatches,
    fingerprint: hash.digest('hex'),
    serialisedLength: summarise(lengths),
    firstCreation: summarise(firstTimes),
    secondCreation: summarise(secondTimes),
    totalMs: now() - started,
    playerRoster: summarise(descriptions.map((world) => world.playerRoster)),
    rivalRoster: summarise(descriptions.flatMap((world) => world.rivalRosters)),
    rivals: summarise(descriptions.map((world) => world.rivalRosters.length)),
    pool: summarise(descriptions.map((world) => world.pool)),
    patrons: summarise(descriptions.map((world) => world.patrons)),
    heroes: summarise(descriptions.map((world) => world.heroes)),
    heroesByClass,
    heroStats,
    outOfRange,
  };
}

/** What a report says about the run beyond the sweep's own numbers. */
export interface ReportContext {
  deps: EngineDeps;
  machine: Machine;
  /** When the run began, by the harness's clock. */
  startedAt: Date;
}

/** Failures listed in a report before the rest are counted and left out. */
const listedFailures = 50;

/** The sweep as a Markdown report. */
export function creationReport(sweep: CreationSweep, { deps, machine, startedAt }: ReportContext): string {
  const { config, content } = deps;
  const count = sweep.seeds.length;
  const range = count === 0 ? 'no seeds' : `\`${sweep.seeds[0]}\` to \`${sweep.seeds[count - 1]}\``;
  const warningTotal = Object.values(sweep.warnings).reduce((sum, n) => sum + n, 0);
  const refusedTotal = sweep.refused.length;
  const ms = (value: number): string => fixed(value, 3);
  const className = (key: string): string => content.classes[key]?.name ?? key;
  const classKeys = Object.keys(sweep.heroesByClass);

  const summaryRow = (label: string, summary: Summary): string[] => [
    label,
    fixed(summary.mean),
    fixed(summary.sd),
    whole(summary.min),
    whole(summary.max),
  ];
  const timeRow = (label: string, summary: Summary): string[] => [
    label,
    ms(summary.mean),
    ms(summary.p50),
    ms(summary.p99),
    ms(summary.max),
  ];
  const cell = (stat: StatByClass, classKey: string): string => {
    const summary = stat.byClass[classKey];
    if (summary === undefined || summary.count === 0) return '—';
    const mean = fixed(summary.mean, 2);
    const leading = content.classes[classKey]?.leadingStats.includes(stat.key) === true;
    return `${leading ? `**${mean}**` : mean} ± ${fixed(summary.sd, 2)} (${whole(summary.min)}–${whole(summary.max)})`;
  };

  const lines = [
    '# M1 harness report: world creation',
    '',
    `Run begun ${localTimestamp(startedAt)} · ${whole(count)} seeds, ${range} · content \`${content.id}\` ` +
      `version ${content.version} · \`defaultConfig\` (config version ${config.configVersion}, schema ` +
      `version ${config.schemaVersion}) · \`createdAt: "${harnessSetup.createdAt}"\``,
    '',
    `Machine: Node ${machine.node} · ${machine.os} ${machine.arch} · ${machine.cpu} (${machine.cores} logical cores)`,
    '',
    '## Summary',
    '',
    markdownTable(
      ['Measure', 'Result'],
      [
        ['Worlds created', `${whole(count)}, each twice`],
        ['Worlds the validator refused', whole(refusedTotal)],
        ['Validator warnings', `${whole(warningTotal)}, in ${whole(sweep.worldsWithWarnings)} worlds`],
        ['Worlds byte-identical when created again', `${whole(sweep.identical)} of ${whole(count)}`],
        ['Fingerprint (SHA-256 of every world, in seed order)', `\`${sweep.fingerprint}\``],
        [
          'Creation time per world, first pass',
          `mean ${ms(sweep.firstCreation.mean)} ms, p99 ${ms(sweep.firstCreation.p99)} ms`,
        ],
        ['Total run time', `${fixed(sweep.totalMs / 1000, 2)} s`],
        ["Class and Stat pairs outside the Stat's range", whole(sweep.outOfRange.length)],
      ],
    ),
    '',
    '## Validation',
    '',
  ];

  if (refusedTotal === 0) lines.push('The validator accepted every world.');
  else {
    const rows = sweep.refused.flatMap(({ seed, failures }) =>
      failures.map(({ check, id, detail }) => [`\`${seed}\``, check, `\`${id}\``, detail]),
    );
    lines.push(
      `The validator refused ${whole(refusedTotal)} worlds.`,
      '',
      markdownTable(['Seed', 'Check', 'Id', 'Detail'], rows.slice(0, listedFailures)),
    );
    if (rows.length > listedFailures) lines.push('', `…and ${whole(rows.length - listedFailures)} more failures.`);
  }
  lines.push('');
  if (warningTotal === 0) lines.push('No warnings.');
  else {
    lines.push(
      markdownTable(
        ['Warning', 'Count'],
        Object.entries(sweep.warnings).map(([check, n]) => [check, whole(n)]),
        ['left', 'right'],
      ),
    );
  }

  lines.push('', '## Determinism', '');
  if (sweep.mismatches.length === 0) {
    lines.push(`Every world's second creation serialised byte for byte as its first (${whole(count)} of ${whole(count)}).`);
  } else {
    lines.push(
      markdownTable(
        ['Seed', 'First differing code unit'],
        sweep.mismatches.slice(0, listedFailures).map(({ seed, offset }) => [`\`${seed}\``, whole(offset)]),
        ['left', 'right'],
      ),
    );
  }
  lines.push(
    '',
    `A world serialises to ${whole(sweep.serialisedLength.mean)} characters on average ` +
      `(${whole(sweep.serialisedLength.min)} to ${whole(sweep.serialisedLength.max)}).`,
    '',
    '## Creation time',
    '',
    'Milliseconds per `createWorld` call, timed by the harness around the call alone.',
    '',
    markdownTable(
      ['Pass', 'Mean', 'p50', 'p99', 'Max'],
      [timeRow('First', sweep.firstCreation), timeRow('Second', sweep.secondCreation)],
      ['left', 'right', 'right', 'right', 'right'],
    ),
    '',
    '## Worlds',
    '',
    markdownTable(
      ['Per world', 'Mean', 'SD', 'Min', 'Max'],
      [
        summaryRow("The player's Roster", sweep.playerRoster),
        summaryRow("A Rival's Roster", sweep.rivalRoster),
        summaryRow('Rival Guilds', sweep.rivals),
        summaryRow('Unattached pool', sweep.pool),
        summaryRow('Patrons', sweep.patrons),
        summaryRow('Heroes', sweep.heroes),
      ],
      ['left', 'right', 'right', 'right', 'right'],
    ),
    '',
    '## Hero Stats by Class',
    '',
    `Heroes: ${classKeys.map((key) => `${className(key)} ${whole(sweep.heroesByClass[key] ?? 0)}`).join(', ')}. ` +
      "Every Hero in every world, on a Roster or in the pool. Each cell is the mean ± standard deviation " +
      "(min–max); a Class's leading Stats are in bold.",
    '',
    markdownTable(
      ['Stat', 'Area', 'Range', ...classKeys.map(className)],
      sweep.heroStats.map((stat) => [
        stat.name,
        stat.area,
        `${stat.min}–${stat.max}`,
        ...classKeys.map((classKey) => cell(stat, classKey)),
      ]),
    ),
    '',
  );
  if (sweep.outOfRange.length === 0) lines.push('No Class has a Stat outside its range.');
  else {
    lines.push(
      markdownTable(
        ['Class', 'Stat', 'Min seen', 'Max seen'],
        sweep.outOfRange.map(({ classKey, statKey, min, max }) => [className(classKey), statKey, whole(min), whole(max)]),
      ),
    );
  }
  return `${lines.join('\n')}\n`;
}
