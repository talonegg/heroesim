// The report of a module run (M8-S3, DL-78): the same seeds played twice, with the modules
// `HEROESIM_MODULES` names installed and with none, and what the modules changed. It states each
// module event type the modules emitted (`probe.fired`), the core's events their effects made, and
// the delta on every core counter the modules moved, directly or through what their effects led to:
// the games with a module installed are other games from the first effect on, while no core stream
// moves because a module drew (M8-S1's box 2).

import { dayOf, timeOfDay, type EngineDeps } from '@heroesim/engine';
import { endingReasons } from './counters.js';
import { harnessSetup } from './creation.js';
import type { GameRecord } from './play.js';
import { fixed, localTimestamp, markdownTable, whole, type Machine } from './report.js';
import { sweepFingerprint, sweepTotals, type PlaySweep, type SweepTotals } from './sweep.js';

/** The fields of `SweepTotals` that are the modules' own counters, left out of the core's. */
const modulesOwn: readonly (keyof SweepTotals)[] = ['moduleEvents', 'moduleEffects'];

/** Adds every number in `value` to `into` by its path from `path`; a list's entries share the list's path and `[]`. */
function addLeaves(into: Map<string, number>, value: unknown, path: string): void {
  if (typeof value === 'number') {
    into.set(path, (into.get(path) ?? 0) + value);
  } else if (Array.isArray(value)) {
    for (const item of value) addLeaves(into, item, `${path}[]`);
  } else if (typeof value === 'object' && value !== null) {
    for (const [key, inner] of Object.entries(value)) addLeaves(into, inner, path === '' ? key : `${path}.${key}`);
  }
}

/**
 * Every core counter in `totals`, by its path: `heroesInjured.player`, `wealth.rival.sales.fold`.
 * The entries of a list (years, bands, places in the Rankings, Rivals) are summed into one number at
 * the list's path followed by `[]`: `levelsGained.player[]`, `rosters[].player.wealth`. The modules'
 * own counters (`moduleEvents`, `moduleEffects`) are left out. In the order `sweepTotals` gives them.
 */
export function coreCounters(totals: SweepTotals): Map<string, number> {
  const counters = new Map<string, number>();
  for (const [key, value] of Object.entries(totals)) {
    if (!modulesOwn.includes(key as keyof SweepTotals)) addLeaves(counters, value, key);
  }
  return counters;
}

/** A core counter the modules moved: its value over the sweep with none installed, and with them. */
export interface CounterDelta {
  counter: string;
  without: number;
  with: number;
}

/**
 * The core counters whose value differs between `without` (no module) and `installed` (the modules),
 * a counter one sweep lacks counting 0 there; and how many are the same. In `coreCounters`' order,
 * `without`'s first, then any only `installed` has.
 */
export function counterDeltas(without: SweepTotals, installed: SweepTotals): { moved: CounterDelta[]; unchanged: number } {
  const before = coreCounters(without);
  const after = coreCounters(installed);
  const moved: CounterDelta[] = [];
  let unchanged = 0;
  for (const counter of new Set([...before.keys(), ...after.keys()])) {
    const delta = { counter, without: before.get(counter) ?? 0, with: after.get(counter) ?? 0 };
    if (delta.with === delta.without) unchanged += 1;
    else moved.push(delta);
  }
  return { moved, unchanged };
}

/** The nights among the Turns a game played, Turns 1 to `turnsPlayed`: a night hook's calls. */
export function nightsPlayed(turnsPlayed: number): number {
  return turnsPlayed === 0 ? 0 : dayOf(turnsPlayed) + (timeOfDay(turnsPlayed) === 'night' ? 1 : 0);
}

export interface ModuleReportContext {
  /** The rules and content both sweeps played under; its modules are not read. */
  deps: EngineDeps;
  /** The ids of the modules the first sweep installed, in their order. */
  moduleIds: readonly string[];
  machine: Machine;
  startedAt: Date;
}

/** A number as a report cell: whole when it is, else to two places. */
const cell = (n: number): string => (Number.isInteger(n) ? whole(n) : fixed(n, 2));

/** `n` less `of`, signed. */
const signed = (n: number): string => (n > 0 ? `+${cell(n)}` : n < 0 ? `−${cell(-n)}` : '0');

const ms = (value: number): string => fixed(value, 3);

/** The change from `before` to `after` as a signed share of `before`, to one place; a dash from 0. */
function change(before: number, after: number): string {
  if (before === 0) return '—';
  const share = (100 * (after - before)) / before;
  return `${share > 0 ? '+' : share < 0 ? '−' : ''}${fixed(Math.abs(share), 1)}%`;
}

/**
 * The module run as a Markdown report: `installed`, the seeds played with the modules, against
 * `without`, the same seeds with none. Throws when the two sweeps did not play the same seeds for
 * the same years, which would make every delta meaningless.
 */
export function moduleReport(installed: PlaySweep, without: PlaySweep, { deps, moduleIds, machine, startedAt }: ModuleReportContext): string {
  if (installed.seeds.join() !== without.seeds.join() || installed.years !== without.years) {
    throw new RangeError('A module run compares two sweeps of the same seeds and years');
  }
  const { config, content } = deps;
  const withTotals = sweepTotals(installed, config.turnsPerYear);
  const withoutTotals = sweepTotals(without, config.turnsPerYear);
  const count = installed.seeds.length;
  const range = count === 0 ? 'no seeds' : `\`${installed.seeds[0]}\` to \`${installed.seeds[count - 1]}\``;
  const yearsText = Number.isInteger(installed.years) ? whole(installed.years) : fixed(installed.years, 2);
  const named = moduleIds.map((id) => `\`${id}\``).join(', ');
  const perGame = (n: number): string => (count === 0 ? '—' : fixed(n / count, 2));

  const both = (read: (sweep: PlaySweep, totals: SweepTotals) => string): [string, string] => [
    read(installed, withTotals),
    read(without, withoutTotals),
  ];
  const summaryRows: [string, ...string[]][] = [
    ['Games played', ...both((sweep) => whole(sweep.games.length))],
    [
      'Games ended',
      ...both(
        (_sweep, totals) =>
          endingReasons.map((reason) => `${reason} ${whole(totals.endings[reason] ?? 0)}`).join(', ') +
          `; ran the full ${yearsText} years ${whole(totals.endings.survived ?? 0)}`,
      ),
    ],
    ['Years survived, mean', ...both((_sweep, totals) => fixed(totals.yearsSurvived.mean))],
    ['Turns played', ...both((sweep) => whole(sweep.games.reduce((sum, game) => sum + game.turnsPlayed, 0)))],
    ['Policy actions the rules refused', ...both((_sweep, totals) => whole(totals.refusals))],
    ['Games the validator refused', ...both((sweep, totals) => (sweep.validated ? whole(totals.invalidGames) : 'not validated'))],
    ['Games a harness assertion stopped', ...both((_sweep, totals) => whole(totals.assertionGames))],
    [
      'Byte equality, one seed played twice',
      ...both((sweep) =>
        sweep.replay === null ? '—' : `\`${sweep.replay.seed}\`: ${sweep.replay.identical ? 'identical' : 'DIFFERENT'}`,
      ),
    ],
    [
      'Saves that load and serialise back identically',
      ...both((sweep) => `${whole(sweep.games.filter((game) => game.measures.roundTrips).length)} of ${whole(sweep.games.length)}`),
    ],
    ["Fingerprint of every seed's last save", ...both((sweep) => `\`${sweepFingerprint(sweep.games)}\``)],
    ['`advance` per Turn', ...both((sweep) => `mean ${ms(sweep.advance.mean)} ms, p99 ${ms(sweep.advance.p99)} ms`)],
    ['Run time', ...both((sweep) => `${fixed(sweep.totalMs / 1000, 1)} s`)],
  ];

  const nights = installed.games.reduce((sum, game: GameRecord) => sum + nightsPlayed(game.turnsPlayed), 0);
  const eventRows = Object.entries(withTotals.moduleEvents).map(([type, n]) => [`\`${type}\``, whole(n), perGame(n), fixed(nights === 0 ? Number.NaN : n / nights, 4)]);
  const strayEvents = Object.keys(withoutTotals.moduleEvents).length + Object.keys(withoutTotals.moduleEffects).length;
  const effectRows = Object.entries(withTotals.moduleEffects).flatMap(([moduleId, byType]) =>
    Object.entries(byType).map(([type, n]) => [`\`${moduleId}\``, `\`${type}\``, whole(n), perGame(n)]),
  );
  const { moved, unchanged } = counterDeltas(withoutTotals, withTotals);
  const deltaRows = moved.map(({ counter, without: before, with: after }) => [
    `\`${counter}\``,
    cell(before),
    cell(after),
    signed(after - before),
    change(before, after),
  ]);

  const lines = [
    `# M8 harness report: ${named} against no module`,
    '',
    `Run begun ${localTimestamp(startedAt)} · ${whole(count)} seeds, ${range} · up to ${yearsText} years ` +
      `(${whole(installed.years * config.turnsPerYear)} Turns) each, played twice: with ${named} installed, and with no module · ` +
      `content \`${content.id}\` version ${content.version} · config version ${config.configVersion}, schema version ` +
      `${config.schemaVersion} · \`createdAt: "${harnessSetup.createdAt}"\` · the automatic policy, as in the milestones' ` +
      `play runs · validated after every advance: ${installed.validated && without.validated ? 'yes' : 'no'}`,
    '',
    `Machine: Node ${machine.node} · ${machine.os} ${machine.arch} · ${machine.cpu} (${machine.cores} logical cores) · ` +
      `games shared among ${installed.workers} ${installed.workers === 1 ? 'process' : 'processes'}`,
    '',
    '## Summary',
    '',
    markdownTable(['Measure', `With ${named}`, 'With no module'], summaryRows),
    '',
    '## What the modules did',
    '',
    `Read from each game's History through \`history.byType\`, over ${whole(nights)} nights played with the modules installed.`,
    '',
    eventRows.length === 0
      ? 'The modules emitted no event of their own.'
      : markdownTable(['Module event', 'Count', 'a game', 'a night played'], eventRows, ['left', 'right', 'right', 'right']),
    '',
    effectRows.length === 0
      ? "The modules' effects made no core event."
      : markdownTable(["Core event a module's effect made (its `moduleId`)", 'Type', 'Count', 'a game'], effectRows, [
          'left',
          'left',
          'right',
          'right',
        ]),
    '',
    `With no module installed the History held ${whole(strayEvents)} module event types and effects (0 is right).`,
    '',
    `## Every core counter the modules moved`,
    '',
    `Each counter of the milestones' play report, summed over the sweep as \`sweepTotals\` sums it. A list's entries ` +
      `(years, bands, places, Rivals) are summed at the list's path followed by \`[]\`. The modules' effects touch Morale, ` +
      `Wealth, Regard, Injuries and the Board directly; every other counter below moved because the games went ` +
      `otherwise from the first effect on, not because a module drew from a core stream. ` +
      `**${whole(moved.length)} of ${whole(moved.length + unchanged)} core counters moved; ${whole(unchanged)} did not.**`,
    '',
    deltaRows.length === 0
      ? 'No core counter moved.'
      : markdownTable(['Counter', 'With no module', `With ${named}`, 'Delta', 'Change'], deltaRows, ['left', 'right', 'right', 'right', 'right']),
    '',
  ];
  return `${lines.join('\n')}\n`;
}
