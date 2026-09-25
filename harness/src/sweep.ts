// The play sweep across seeds (M2-S12): play each seed under the automatic policy, keep only its
// record (counters and measures, never the document), and replay one seed to check that the same
// seed under the same policy serialises byte for byte alike. `sweepPlay` plays in this
// process; `sweepPlayInParallel` shares the seeds among child processes (`shard.ts`), since a
// 20-year game takes most of a minute. `playReport` writes the result as Markdown. DL-34 records
// the method and the numbers.

import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { availableParallelism, tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { serialise, type EngineDeps, type QuestBand } from '@heroesim/engine';
import { controllerKinds, endingReasons, type ByController, type ControllerKind } from './counters.js';
import { harnessSetup } from './creation.js';
import { defaultPolicyConfig, type PolicyConfig } from './policy.js';
import { defaultYears, playGame, type GameRecord, type PlayOptions } from './play.js';
import { fixed, localTimestamp, markdownTable, whole, type Machine } from './report.js';
import { playSeeds, type PlayedSeeds, type ShardJob, type ShardResult } from './shard.js';
import { summarise, type Summary } from './stats.js';

export interface PlaySweep {
  seeds: readonly string[];
  years: number;
  validated: boolean;
  policy: Readonly<PolicyConfig>;
  /** Processes the games were shared among: 1 when played in this one. */
  workers: number;
  games: GameRecord[];
  /** Milliseconds per `advance`, every Turn of every game. */
  advance: Summary;
  /** Milliseconds per validation after an `advance`, when validating. */
  validation: Summary;
  /**
   * One seed played twice more in this process, after the sweep: the first to have run its full
   * length, or the first seed when none did. Whether the two last documents serialise alike, and
   * the first replay's `advance` per Turn, taken with nothing else of the sweep running.
   */
  replay: { seed: string; identical: boolean; length: number; advance: Summary } | null;
  /** Milliseconds for the whole sweep, the replay included. */
  totalMs: number;
  /**
   * Wall-clock milliseconds for playing and recording the seeds, without the replay: the policy,
   * `advance`, validation when asked for, counting, and saving and loading each last document.
   */
  gamesMs: number;
}

export interface SweepOptions extends PlayOptions {
  /** A millisecond clock for the sweep's own wall-clock timings. */
  now?: () => number;
}

/** Plays `seed` twice in this process and compares the two last documents, timing the first. */
function replay(seed: string | undefined, deps: EngineDeps, options: PlayOptions): PlaySweep['replay'] {
  if (seed === undefined) return null;
  const once = playGame(seed, deps, { ...options, validate: false });
  const a = serialise(once.document);
  const b = serialise(playGame(seed, deps, { ...options, validate: false }).document);
  return { seed, identical: a === b, length: a.length, advance: summarise(once.advanceMs) };
}

function sweepOf(
  seeds: readonly string[],
  played: PlayedSeeds,
  deps: EngineDeps,
  options: SweepOptions,
  timing: { workers: number; started: number; gamesMs: number; now: () => number },
): PlaySweep {
  // The longest game makes the most of the comparison, and its timing the fairest of one game.
  const replayed = replay(played.games.find((game) => game.ranFullLength)?.seed ?? seeds[0], deps, options);
  return {
    seeds,
    years: options.years ?? defaultYears,
    validated: options.validate ?? false,
    policy: options.policy ?? defaultPolicyConfig,
    workers: timing.workers,
    games: played.games,
    advance: summarise(played.advanceMs),
    validation: summarise(played.validateMs),
    replay: replayed,
    totalMs: timing.now() - timing.started,
    gamesMs: timing.gamesMs,
  };
}

/**
 * Plays every seed in `seeds` in this process under `deps` and the options, then plays one of them
 * twice more (`PlaySweep.replay`) and compares the two last documents' serialisations. Never
 * throws on what it finds.
 */
export function sweepPlay(seeds: readonly string[], deps: EngineDeps, options: SweepOptions = {}): PlaySweep {
  const now = options.now ?? (() => performance.now());
  const started = now();
  const played = playSeeds(seeds, deps, options);
  return sweepOf(seeds, played, deps, options, { workers: 1, started, gamesMs: now() - started, now });
}

/** Processes a parallel sweep uses by default: half the logical processors, one a core with SMT. */
export function defaultWorkers(): number {
  return Math.max(1, Math.floor(availableParallelism() / 2));
}

const shardModule = fileURLToPath(new URL('./shard.ts', import.meta.url));
const repositoryRoot = fileURLToPath(new URL('../../', import.meta.url));

/** Runs one shard in a child process under tsx; resolves when it has written its result. */
function runChild(jobPath: string, resultPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--import', 'tsx', shardModule, jobPath, resultPath], {
      cwd: repositoryRoot,
      stdio: ['ignore', 'inherit', 'inherit'],
    });
    child.on('error', reject);
    child.on('exit', (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`A play shard exited with ${signal ?? `code ${code}`}: ${jobPath}`));
    });
  });
}

/**
 * `sweepPlay`, with the seeds dealt in turn among `workers` child processes (`shard.ts`), each
 * loading the core content and playing under `deps.config`; the records come back in seed order
 * and the replay is played in this process once they are done. The children load the core content
 * themselves, so `deps.content` must be it: a child that loads another refuses the sweep.
 *
 * @throws Error when a child fails or played with other content: a broken run, not a finding
 */
export async function sweepPlayInParallel(
  seeds: readonly string[],
  deps: EngineDeps,
  options: SweepOptions & { workers?: number } = {},
): Promise<PlaySweep> {
  const now = options.now ?? (() => performance.now());
  const workers = Math.max(1, Math.min(options.workers ?? defaultWorkers(), seeds.length));
  const started = now();
  const dir = mkdtempSync(join(tmpdir(), 'heroesim-play-'));
  try {
    const shards = Array.from({ length: workers }, (_, shard) => seeds.filter((_, index) => index % workers === shard));
    const paths = shards.map((shardSeeds, shard) => {
      const job: ShardJob = {
        seeds: shardSeeds,
        config: deps.config,
        years: options.years ?? defaultYears,
        validate: options.validate ?? false,
        policy: options.policy ?? defaultPolicyConfig,
      };
      const jobPath = join(dir, `job-${shard}.json`);
      writeFileSync(jobPath, JSON.stringify(job), 'utf8');
      return { jobPath, resultPath: join(dir, `result-${shard}.json`) };
    });
    await Promise.all(paths.map(({ jobPath, resultPath }) => runChild(jobPath, resultPath)));
    const results = paths.map(({ resultPath }) => JSON.parse(readFileSync(resultPath, 'utf8')) as ShardResult);
    const gamesMs = now() - started;

    const played: PlayedSeeds = { games: [], advanceMs: [], validateMs: [] };
    for (const result of results) {
      if (result.content.id !== deps.content.id || result.content.version !== deps.content.version) {
        throw new Error(`A play shard loaded content ${result.content.id} ${result.content.version}, not the sweep's`);
      }
      for (const ms of result.advanceMs) played.advanceMs.push(ms);
      for (const ms of result.validateMs) played.validateMs.push(ms);
    }
    // Seed i went to shard i mod workers, as its (i div workers)th game.
    played.games = seeds.map((seed, index) => {
      const game = results[index % workers]?.games[Math.floor(index / workers)];
      if (game?.seed !== seed) throw new Error(`A play shard returned no record for ${seed}`);
      return game;
    });
    return sweepOf(seeds, played, deps, options, { workers, started, gamesMs, now });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// ── Totals ───────────────────────────────────────────────────────────────────────────────────

/** Sums of each counter across the sweep's games. */
export interface SweepTotals {
  games: number;
  questsTaken: ByController;
  questsResolved: Record<ControllerKind, Record<QuestBand, number>>;
  heroesInjured: ByController;
  heroesDied: ByController;
  heroesRecruited: ByController;
  heroesRetired: ByController;
  rivalFolds: Record<string, number>;
  /** Games by how they ended; `survived` for a game that ran its full length. */
  endings: Record<string, number>;
  /** Years each game lasted: to its ending, or its full length. */
  yearsSurvived: Summary;
  /** Games whose ending fell in each year, 0 first, up to the sweep's length. */
  endedInYear: number[];
  refusals: number;
  invalidGames: number;
}

const zero = (): ByController => ({ player: 0, rival: 0 });

export function sweepTotals(sweep: PlaySweep, turnsPerYear: number): SweepTotals {
  const totals: SweepTotals = {
    games: sweep.games.length,
    questsTaken: zero(),
    questsResolved: { player: { fail: 0, success: 0, strong: 0 }, rival: { fail: 0, success: 0, strong: 0 } },
    heroesInjured: zero(),
    heroesDied: zero(),
    heroesRecruited: zero(),
    heroesRetired: zero(),
    rivalFolds: Object.fromEntries(endingReasons.map((reason) => [reason, 0])),
    endings: { ...Object.fromEntries(endingReasons.map((reason) => [reason, 0])), survived: 0 },
    yearsSurvived: summarise(sweep.games.map((game) => game.counters.lastTurn / turnsPerYear)),
    endedInYear: Array.from({ length: Math.max(1, Math.ceil(sweep.years)) }, () => 0),
    refusals: 0,
    invalidGames: 0,
  };
  for (const { counters, refusals, invalid } of sweep.games) {
    for (const kind of controllerKinds) {
      totals.questsTaken[kind] += counters.questsTaken[kind];
      totals.heroesInjured[kind] += counters.heroesInjured[kind];
      totals.heroesDied[kind] += counters.heroesDied[kind];
      totals.heroesRecruited[kind] += counters.heroesRecruited[kind];
      totals.heroesRetired[kind] += counters.heroesRetired[kind];
      for (const [band, n] of Object.entries(counters.questsResolved[kind])) {
        totals.questsResolved[kind][band as QuestBand] += n;
      }
    }
    for (const [reason, n] of Object.entries(counters.rivalFolds)) totals.rivalFolds[reason] = (totals.rivalFolds[reason] ?? 0) + n;
    const ending = counters.ending ?? 'survived';
    totals.endings[ending] = (totals.endings[ending] ?? 0) + 1;
    if (counters.ending !== null) {
      const year = Math.min(Math.floor(counters.lastTurn / turnsPerYear), totals.endedInYear.length - 1);
      totals.endedInYear[year] = (totals.endedInYear[year] ?? 0) + 1;
    }
    totals.refusals += refusals.length;
    if (invalid !== null) totals.invalidGames += 1;
  }
  return totals;
}

// ── The report ───────────────────────────────────────────────────────────────────────────────

export interface PlayReportContext {
  deps: EngineDeps;
  machine: Machine;
  startedAt: Date;
}

/** data-model §7's targets, provisional, to set the measures against (DL-08). */
const targets = {
  advanceMs: 5,
  yearMs: 1000,
  saveBytes: 20 * 1024 * 1024,
  loadMs: 1000,
  harnessMinutesPerThousand: 10,
};

const listed = 20;

/** The sweep as a Markdown report. */
export function playReport(sweep: PlaySweep, { deps, machine, startedAt }: PlayReportContext): string {
  const { config, content } = deps;
  const totals = sweepTotals(sweep, config.turnsPerYear);
  const count = sweep.seeds.length;
  const range = count === 0 ? 'no seeds' : `\`${sweep.seeds[0]}\` to \`${sweep.seeds[count - 1]}\``;
  const ms = (value: number): string => fixed(value, 3);
  const perGame = (n: number): string => (totals.games === 0 ? '—' : fixed(n / totals.games, 2));
  const share = (n: number, of: number): string => (of === 0 ? '—' : `${fixed((100 * n) / of, 1)}%`);

  const yearsText = Number.isInteger(sweep.years) ? whole(sweep.years) : fixed(sweep.years, 2);
  const full = sweep.games.filter((game) => game.ranFullLength);
  const fullOrAll = full.length > 0 ? full : sweep.games;
  const entries = summarise(fullOrAll.map((game) => game.measures.historyEntries));
  const lengths = summarise(fullOrAll.map((game) => game.measures.serialisedLength));
  const saveMs = summarise(fullOrAll.map((game) => game.measures.serialiseMs));
  const loadMs = summarise(fullOrAll.map((game) => game.measures.deserialiseMs));
  const roundTrips = sweep.games.filter((game) => game.measures.roundTrips).length;
  const sizeBasis =
    full.length > 0
      ? `the ${whole(full.length)} games that ran the full ${yearsText} years`
      : `every game's last document (no game ran the full ${yearsText} years)`;
  // A player's fast forward runs alone, so the replay's own `advance`, where there is one.
  const alone = sweep.replay?.advance ?? sweep.advance;
  const yearMs = alone.mean * config.turnsPerYear;
  const load = sweep.workers === 1 ? '' : ` under ${sweep.workers} processes' load`;
  const aloneText =
    sweep.replay === null || sweep.workers === 1
      ? ''
      : `; mean ${ms(alone.mean)} ms, p99 ${ms(alone.p99)} ms alone (\`${sweep.replay.seed}\` replayed)`;
  const sizeOf = full.length > 0 ? `the ${whole(full.length)} games that ran 20 years` : 'last documents: no game ran 20 years';
  // What 1,000 games of 20 years would take at this run's cost per Turn played, all included.
  const turnsPlayed = sweep.games.reduce((sum, game) => sum + game.turnsPlayed, 0);
  const perThousandMinutes =
    turnsPlayed === 0 ? Number.NaN : ((sweep.gamesMs / turnsPlayed) * 20 * config.turnsPerYear * 1000) / 60_000;

  const resolvedRow = (kind: ControllerKind): string[] => {
    const bands = totals.questsResolved[kind];
    const all = bands.fail + bands.success + bands.strong;
    return [
      kind === 'player' ? "The player's Guild" : 'The Rivals',
      whole(totals.questsTaken[kind]),
      whole(all),
      `${whole(bands.fail)} (${share(bands.fail, all)})`,
      `${whole(bands.success)} (${share(bands.success, all)})`,
      `${whole(bands.strong)} (${share(bands.strong, all)})`,
    ];
  };
  const heroRow = (label: string, counts: ByController): string[] => [
    label,
    whole(counts.player),
    perGame(counts.player),
    whole(counts.rival),
    perGame(counts.rival),
  ];
  const summaryRow = (label: string, summary: Summary, digits = 2): string[] => [
    label,
    fixed(summary.mean, digits),
    fixed(summary.p50, digits),
    fixed(summary.p99, digits),
    fixed(summary.min, digits),
    fixed(summary.max, digits),
  ];
  const totalFolds = Object.values(totals.rivalFolds).reduce((sum, n) => sum + n, 0);

  const lines = [
    '# M2 harness report: play',
    '',
    `Run begun ${localTimestamp(startedAt)} · ${whole(count)} seeds, ${range} · up to ${yearsText} years ` +
      `(${whole(sweep.years * config.turnsPerYear)} Turns) each · content \`${content.id}\` version ${content.version} · ` +
      `config version ${config.configVersion}, schema version ${config.schemaVersion} · ` +
      `\`createdAt: "${harnessSetup.createdAt}"\` · validated after every advance: ${sweep.validated ? 'yes' : 'no'}`,
    '',
    `Policy (INPUTS 4.14): the highest-reward Quest it can staff, the strongest Party of the size it requires; ` +
      `recruit the cheapest Hero while Wealth exceeds ${sweep.policy.recruitWealthMultiple} Upkeeps and the Roster ` +
      `is below ${sweep.policy.rosterLimit}; never transfer.`,
    '',
    `Machine: Node ${machine.node} · ${machine.os} ${machine.arch} · ${machine.cpu} (${machine.cores} logical cores) · ` +
      `games shared among ${sweep.workers} ${sweep.workers === 1 ? 'process' : 'processes'}`,
    '',
    '## Summary',
    '',
    markdownTable(
      ['Measure', 'Result'],
      [
        ['Games played', whole(count)],
        [
          'Games ended',
          endingReasons.map((reason) => `${reason} ${whole(totals.endings[reason] ?? 0)}`).join(', ') +
            `; ran the full ${yearsText} years ${whole(totals.endings.survived ?? 0)}`,
        ],
        [
          'Years survived',
          `mean ${fixed(totals.yearsSurvived.mean)}, min ${fixed(totals.yearsSurvived.min)}, ` +
            `max ${fixed(totals.yearsSurvived.max)} (a game that ran its full length counts its length)`,
        ],
        ['Rival folds', `${whole(totalFolds)}, ${perGame(totalFolds)} a game`],
        ['Policy actions the rules refused', whole(totals.refusals)],
        ['Games the validator refused', sweep.validated ? whole(totals.invalidGames) : 'not validated'],
        [
          'Byte equality, one seed played twice',
          sweep.replay === null
            ? '—'
            : `\`${sweep.replay.seed}\`: ${sweep.replay.identical ? 'identical' : 'DIFFERENT'} (${whole(sweep.replay.length)} characters)`,
        ],
        ['Saves that load and serialise back identically', `${whole(roundTrips)} of ${whole(count)}`],
        ['`advance` per Turn', `mean ${ms(sweep.advance.mean)} ms, p99 ${ms(sweep.advance.p99)} ms`],
        ['Total run time', `${fixed(sweep.totalMs / 1000, 1)} s, the games ${fixed(sweep.gamesMs / 1000, 1)} s of it`],
      ],
    ),
    '',
    '## Counters',
    '',
    'Read from each game\'s History through `history.byType`; an entry counts for the Guild it names.',
    '',
    markdownTable(
      ['Quests', 'Taken', 'Resolved', 'Failed', 'Succeeded', 'Strong success'],
      [resolvedRow('player'), resolvedRow('rival')],
      ['left', 'right', 'right', 'right', 'right', 'right'],
    ),
    '',
    markdownTable(
      ['Heroes', "Player's", 'a game', "Rivals'", 'a game'],
      [
        heroRow('`hero.injured`', totals.heroesInjured),
        heroRow('`hero.died`', totals.heroesDied),
        heroRow('`hero.recruited`', totals.heroesRecruited),
        heroRow('`hero.retired`', totals.heroesRetired),
      ],
      ['left', 'right', 'right', 'right', 'right'],
    ),
    '',
    markdownTable(
      ['Ending', '`game.ended` (the player)', '`guild.folded` (Rivals)'],
      endingReasons.map((reason) => [reason, whole(totals.endings[reason] ?? 0), whole(totals.rivalFolds[reason] ?? 0)]),
      ['left', 'right', 'right'],
    ),
    '',
    `Games ending in each year (year 0 is the first): ${totals.endedInYear.map((n, year) => `${year}: ${n}`).join(', ')}.`,
    '',
    '## Measures',
    '',
    markdownTable(
      ['Per Turn, ms', 'Mean', 'p50', 'p99', 'Min', 'Max'],
      [
        summaryRow('`advance`', sweep.advance, 3),
        ...(sweep.replay === null ? [] : [summaryRow(`\`advance\`, \`${sweep.replay.seed}\` replayed alone`, sweep.replay.advance, 3)]),
        ...(sweep.validated ? [summaryRow('`validate` after it', sweep.validation, 3)] : []),
      ],
      ['left', 'right', 'right', 'right', 'right', 'right'],
    ),
    '',
    `The last document, over ${sizeBasis}:`,
    '',
    markdownTable(
      ['Per game', 'Mean', 'p50', 'p99', 'Min', 'Max'],
      [
        summaryRow('`history.entries.length`', entries, 0),
        summaryRow('`serialise(document).length`', lengths, 0),
        summaryRow('`serialise`, ms', saveMs, 1),
        summaryRow('`deserialise` (parse, migrate, validate), ms', loadMs, 1),
      ],
      ['left', 'right', 'right', 'right', 'right', 'right'],
    ),
    '',
    "Against data-model §7's provisional targets (recorded, not chased: DL-08):",
    '',
    markdownTable(
      ['Measure', 'Target', 'Measured'],
      [
        [
          'Advance one Turn',
          `under ${targets.advanceMs} ms`,
          `mean ${ms(sweep.advance.mean)} ms, p99 ${ms(sweep.advance.p99)} ms${load}${aloneText}`,
        ],
        [
          'Fast forward a year',
          `under ${targets.yearMs / 1000} s`,
          `${fixed(yearMs, 0)} ms (mean \`advance\`${sweep.replay === null ? '' : ' alone'} × ${whole(config.turnsPerYear)} Turns)`,
        ],
        [
          'Harness: 1,000 games of 20 years',
          `under ${targets.harnessMinutesPerThousand} min`,
          `${fixed(perThousandMinutes, 0)} min (this run's wall-clock time per Turn played in ${sweep.workers} ` +
            `${sweep.workers === 1 ? 'process' : 'processes'}, ${sweep.validated ? 'validation' : 'no validation'} ` +
            `included, × ${whole(20 * config.turnsPerYear)} Turns × 1,000 games)`,
        ],
        [
          'Save after 20 years',
          'under 20 MB',
          `mean ${fixed(lengths.mean / 1024 / 1024, 2)} MB, max ${fixed(lengths.max / 1024 / 1024, 2)} MB (${sizeOf})`,
        ],
        ['Load a save', `under ${targets.loadMs / 1000} s`, `mean ${fixed(loadMs.mean, 0)} ms, max ${fixed(loadMs.max, 0)} ms${load} (${sizeOf})`],
      ],
    ),
    '',
  ];

  const refused = sweep.games.flatMap((game) => game.refusals.map((refusal) => ({ seed: game.seed, ...refusal })));
  if (refused.length > 0) {
    lines.push(
      '## Refused policy actions',
      '',
      markdownTable(
        ['Seed', 'Turn', 'Action', 'Rejection'],
        refused
          .slice(0, listed)
          .map(({ seed, turn, action, rejection }) => [`\`${seed}\``, whole(turn), action.kind, rejection.reason]),
      ),
      '',
    );
  }
  const invalid = sweep.games.filter((game) => game.invalid !== null);
  if (invalid.length > 0) {
    lines.push(
      '## Validator refusals',
      '',
      markdownTable(
        ['Seed', 'Turn', 'Check', 'Id'],
        invalid
          .flatMap(({ seed, invalid: found }) => {
            if (found === null) return [];
            const { turn, result } = found;
            const named = result.ok ? result.warnings : result.failures;
            return named.map(({ check, id }) => [`\`${seed}\``, whole(turn), check, `\`${id}\``]);
          })
          .slice(0, listed),
      ),
      '',
    );
  }
  return `${lines.join('\n')}\n`;
}
