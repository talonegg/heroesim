// The play sweep as a Markdown report (M2-S12, DL-34): its frame (what was played, under what policy
// and on what machine; the Summary's lines of the sweep itself; the Gate; the Targets, `targets.ts`'s
// (DL-259); each section's heading; the Measures; and the refusals listed), and between them every
// counter's own rows and lines, as its declaration gives them (`counter.ts`, DL-239), in the counters'
// order.

import { configVersion, schemaVersion, type EngineDeps } from '@heroesim/engine';
import { sections, sweepTotals, type ReportContext, type Section } from './counter.js';
import { harnessSetup } from './creation.js';
import { copyTimes, gateSection, readGateSpec, type GateResult, type GateSpec } from './gate.js';
import { defaultYears } from './play.js';
import { fixed, localTimestamp, markdownTable, whole, type Machine } from './report.js';
import { summarise, type Summary } from './stats.js';
import { sweepFingerprint, type PlaySweep } from './sweep.js';
import { targetsOf, targetsSection, type TargetsReport } from './targets.js';

export interface PlayReportContext {
  deps: EngineDeps;
  machine: Machine;
  startedAt: Date;
  /** The milestone whose run this is, as its report is named: `m3`. */
  milestone: string;
  /** The draft content files and folders played in place of the core's (`loadDrafts`); none when absent. */
  drafted?: string[];
  /** The config values played in place of `defaultConfig`'s (`HEROESIM_CONFIG`); none when absent. */
  configured?: Readonly<Record<string, unknown>>;
  /** The policy's values played in place of `defaultPolicyConfig`'s (`HEROESIM_POLICY`); none when absent. */
  policyChanged?: Readonly<Record<string, unknown>>;
  /** The Gate's spec the save's target is read from: `harness/gate.json` unless given (DL-186 item 21, DL-188). */
  spec?: GateSpec;
  /** The run checked against the Gate (`checkGate`), for a profile's run; none when absent. */
  gate?: GateResult | null;
  /** The Targets, as the JSON report holds them (DL-259); read against no baseline when absent. */
  targets?: TargetsReport;
}

/**
 * The first build's provisional targets, to set the measures against (DL-08, DL-84). The save's is the Gate's
 * (`harness/gate.json`, DL-186 item 21, DL-188).
 */
const targets = {
  advanceMs: 5,
  yearMs: 1000,
  loadMs: 1000,
  harnessMinutesPerThousand: 10,
};

/** The years those targets are set on: "1,000 games of 20 years", "a save after 20 years" (DL-08). */
const targetYears = 20;

const listed = 20;

/** A length in characters as MiB, two places. */
const mebibytes = (length: number): string => fixed(length / 1024 / 1024, 2);

/** Each section's heading, and the words that open it before its counters' lines. */
const headings: Record<Section, readonly string[]> = {
  counters: ['## Counters', '', "Read from each game's History through `history.byType`; an entry counts for the Guild it names.", ''],
  progression: [
    '## Progression, Fame and the Hall (M3)',
    '',
    'A Guild is in play from the Turn it was founded until it folds or the game stops; a Guild-year is a ' +
      'year of one Guild in play. Entries count for the Guild they name.',
    '',
  ],
  'quest-engine': ['## The Quest Engine (M4)', ''],
  items: ['## Items (M5)', ''],
  rivals: [
    '## Rivals (M6)',
    '',
    "Read from each game's History as before, a Transfer counting for both its Guilds (`hero.transferred`'s " +
      '`fromGuildId`, the seller, and `toGuildId`, the buyer); a side is the player\'s Guild or a Rival\'s Disposition. ' +
      'What no entry records the play loop reads from the world each `advance` begins with: the difficulty of each Quest ' +
      "a Rival takes, and whether an afternoon Transfer's seller was in debt.",
    '',
  ],
  fatigue: ['## Fatigue and the Captain (DL-290)', ''],
  portraits: ['## Portraits (v1.1.3-S5)', ''],
  heroes: ['## Heroes described (v1.1.3-S6)', ''],
  worlds: ['## The World State and its copy (v1.1.6-S17)', ''],
};

/** The sweep as a Markdown report. */
export function playReport(sweep: PlaySweep, context: PlayReportContext): string {
  const { deps, machine, startedAt, milestone, drafted = [], configured = {}, policyChanged = {}, gate = null } = context;
  const measured = context.targets ?? targetsOf(sweep, deps.config.turnsPerYear, null);
  const spec = context.spec ?? readGateSpec();
  const { config, content } = deps;
  const totals = sweepTotals(sweep, config.turnsPerYear);
  const report: ReportContext = { deps, sweep };
  const count = sweep.seeds.length;
  const range = count === 0 ? 'no seeds' : `\`${sweep.seeds[0]}\` to \`${sweep.seeds[count - 1]}\``;
  const ms = (value: number): string => fixed(value, 3);

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
  const sizeOf = full.length > 0 ? `the ${whole(full.length)} games that ran ${yearsText} years` : `last documents: no game ran ${yearsText} years`;
  // A run of other than 20 years cannot be set against a 20-year target (DL-186 item 17).
  const comparable = sweep.years === targetYears;
  const notComparable = `not comparable: this run played ${yearsText} ${sweep.years === 1 ? 'year' : 'years'}`;
  const lastSave = sweep.years === targetYears ? totals.saves[targetYears - 1] : undefined;
  const gzipped = summarise(lastSave?.gzipped ?? []);
  const { saveGzipped } = spec.lines;
  // What 1,000 games of 20 years would take at this run's cost per Turn played, all included.
  const turnsPlayed = sweep.games.reduce((sum, game) => sum + game.turnsPlayed, 0);
  const perThousandMinutes =
    turnsPlayed === 0 ? Number.NaN : ((sweep.gamesMs / turnsPlayed) * 20 * config.turnsPerYear * 1000) / 60_000;

  const summaryRow = (label: string, summary: Summary, digits = 2): string[] => [
    label,
    fixed(summary.mean, digits),
    fixed(summary.p50, digits),
    fixed(summary.p99, digits),
    fixed(summary.min, digits),
    fixed(summary.max, digits),
  ];

  // DL-83 item 18's slice is a game's first `defaultYears`; a run of other years says how it stands to it.
  const sliceWords =
    sweep.years === defaultYears
      ? 'the slice measured (DL-83 item 18)'
      : `${sweep.years < defaultYears ? 'short of' : 'past'} DL-83 item 18's slice, their first ${defaultYears}`;
  const lines = [
    `# ${milestone.toUpperCase()} harness report: play`,
    '',
    `Run begun ${localTimestamp(startedAt)} · ${whole(count)} seeds, ${range} · up to ${yearsText} years ` +
      `(${whole(sweep.years * config.turnsPerYear)} Turns) each · the first ${yearsText} years of games that run 20 to 35 years, ${sliceWords} · ` +
      `content \`${content.id}\` version ${content.version}` +
      `${drafted.length === 0 ? '' : ` with the drafts of ${drafted.map((name) => `\`${name}\``).join(', ')}`} · ` +
      `config version ${configVersion}, schema version ${schemaVersion}` +
      `${Object.keys(configured).length === 0 ? '' : `, the defaults changed by \`${JSON.stringify(configured)}\``} · ` +
      `${Object.keys(policyChanged).length === 0 ? '' : `the policy's defaults changed by \`${JSON.stringify(policyChanged)}\` · `}` +
      `\`createdAt: "${harnessSetup.createdAt}"\` · validated after every advance: ${sweep.validated ? 'yes' : 'no'}`,
    '',
    `Policy (INPUTS 4.14): first decline every Transfer Offer made for its Heroes (M6-S2); then the gear it holds ` +
      `onto Heroes with the slot empty (M5-S2); of the Quests it can staff, the one whose Party has the highest ` +
      `chance of success by the estimate, ties to the higher reward, then the Quest id, and again from the Heroes ` +
      `left (v1.1.5-S2), each Party the engine's Best Party by the chance estimate at a margin of ` +
      `${config.playerPartyMargin} (v1.1.4-S6), carrying one of each consumable held that ` +
      `serves the Quest (DL-62); one purchase a Turn: the next grade of the first Facility that heals while Wealth exceeds ` +
      `${sweep.policy.buildWealthMultiple} times its cost (M3-S6), else one armour while a Hero has none and Wealth ` +
      `exceeds ${sweep.policy.buyWealthMultiple} times its price (M5-S4), else the cheapest Hero who would sign while ` +
      `Wealth exceeds ${sweep.policy.recruitWealthMultiple} Upkeeps and the Roster is below ${sweep.policy.rosterLimit}, ` +
      `else consumables toward ${sweep.policy.consumableStock} of each while Wealth exceeds ` +
      `${sweep.policy.buyWealthMultiple} times their cost and, once paid, ${sweep.policy.consumableReserveUpkeeps} ` +
      `Upkeeps (DL-62); never sell; never transfer a Hero in or out.`,
    '',
    `Machine: Node ${machine.node} · ${machine.os} ${machine.arch} · ${machine.cpu} (${machine.cores} logical cores) · ` +
      `games shared among ${sweep.workers} ${sweep.workers === 1 ? 'process' : 'processes'}`,
    '',
    '## Summary',
    '',
    markdownTable(
      ['Measure', 'Result'],
      [
        ...sweep.counters.flatMap((counter) => counter.summary?.(totals, report) ?? []),
        [
          "Byte equality, one seed played once more, alone, against its shard's record",
          sweep.replay === null
            ? '—'
            : `\`${sweep.replay.seed}\`: ${sweep.replay.identical ? 'identical' : 'DIFFERENT'} (${whole(sweep.replay.length)} characters)`,
        ],
        ['Saves that load and serialise back identically', `${whole(roundTrips)} of ${whole(count)}`],
        [
          "Fingerprint of every seed's last save",
          `\`${sweepFingerprint(sweep.games)}\`, each seed's own in the JSON report's \`games[].fingerprint\` (DL-188 item 6)`,
        ],
        ['`advance` per Turn', `mean ${ms(sweep.advance.mean)} ms, p99 ${ms(sweep.advance.p99)} ms`],
        ['Total run time', `${fixed(sweep.totalMs / 1000, 1)} s, the games ${fixed(sweep.gamesMs / 1000, 1)} s of it`],
      ],
    ),
    '',
    ...(gate === null ? [] : gateSection(gate)),
    ...targetsSection(measured),
    ...sections.flatMap((section) => [
      ...headings[section],
      ...sweep.counters.flatMap((counter) => (counter.section === section ? (counter.lines?.(totals, report) ?? []) : [])),
    ]),
    '## Measures',
    '',
    markdownTable(
      ['Per Turn, ms', 'Mean', 'p50', 'p99', 'Min', 'Max'],
      [
        summaryRow('`advance`', sweep.advance, 3),
        ...(sweep.replay === null ? [] : [summaryRow(`\`advance\`, \`${sweep.replay.seed}\` replayed alone`, sweep.replay.advance, 3)]),
        summaryRow("`copyWorld`, `advance`'s copy, timed as each year ended", summarise(copyTimes(totals.worlds ?? [])), 3),
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
    "Against the first build's provisional targets (recorded, not chased: DL-08, DL-84):",
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
          `Harness: 1,000 games of ${targetYears} years`,
          `under ${targets.harnessMinutesPerThousand} min`,
          comparable
            ? `${fixed(perThousandMinutes, 0)} min (this run's wall-clock time per Turn played in ${sweep.workers} ` +
              `${sweep.workers === 1 ? 'process' : 'processes'}, ${sweep.validated ? 'validation' : 'no validation'} ` +
              `included, × ${whole(targetYears * config.turnsPerYear)} Turns × 1,000 games)`
            : notComparable,
        ],
        [
          `Save after ${targetYears} years`,
          `gzipped, the mean under ${fixed(saveGzipped.meanMiB, 0)} MiB (\`harness/gate.json\`)`,
          comparable
            ? `gzipped: mean ${mebibytes(gzipped.mean)} MiB, max ${mebibytes(gzipped.max)} MiB; uncompressed: mean ` +
              `${mebibytes(lengths.mean)} MiB, max ${mebibytes(lengths.max)} MiB (${sizeOf})`
            : notComparable,
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
  const broken = sweep.games.flatMap(({ seed, assertion }) => (assertion === null ? [] : [{ seed, ...assertion }]));
  if (broken.length > 0) {
    lines.push(
      '## Harness assertions broken',
      '',
      markdownTable(
        ['Seed', 'Turn', 'Check', 'Id'],
        broken.slice(0, listed).map(({ seed, turn, check, id }) => [`\`${seed}\``, whole(turn), check, `\`${id}\``]),
      ),
      '',
    );
  }
  return `${lines.join('\n')}\n`;
}
