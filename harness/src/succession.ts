// The Succession probe (M9-F1, DL-113 item 7): the first Rival's Guildmaster, in id order, is set to
// 50 at founding, after `createWorld` and before the first Turn, and each seed is played for 12
// years under the automatic policy, the core content and the config given. Founded on Turn 0, the
// Guildmaster turns 61 on the morning of Turn 11,880 and retires that night, Turn 11,882
// (`retirementTurn`), leaving the last year to show the successor. It is test-only: no player's
// world holds this Guildmaster, and the play sweep does not use it; 50 is inside the range a
// Guildmaster starts in, so the age is a legal one, set rather than drawn.
//
// Each game is reduced to a `ProbeGame`: the Successions and their Turns; the Rival on the eve of
// its Succession, the night after and at the game's last Turn (Roster, Wealth, Fame and Hall); the
// Regard held for the Guild through its Guildmaster, which starts neutral with the successor; and the
// Rival's fold, if any, after the Succession, beside the other Rivals'. `successionReport` writes
// them as Markdown. M9-F1 builds the option; M9-F6 runs it (`npm run harness -- succession`,
// succession.harness.test.ts) and records it in harness/reports/.

import {
  compareByCodeUnit,
  guildmasterRegardForGuild,
  patronRegardFor,
  regardValue,
  retirementTurn,
  type EndingReason,
  type EngineDeps,
  type EntityId,
  type EventType,
  type Guild,
  type GuildId,
  type Guildmaster,
  type World,
  type WorldDocument,
} from '@heroesim/engine';
import { runShardJobs } from './children.js';
import { harnessSetup } from './creation.js';
import { playGame } from './play.js';
import { defaultPolicyConfig, type PolicyConfig } from './policy.js';
import { fixed, localTimestamp, markdownTable, percent, whole, type Machine } from './report.js';
import type { ShardJob } from './shard.js';

/** The age the first Rival's Guildmaster is set to at founding (DL-113 item 7). */
export const successionProbeAge = 50;
/** Seeds the probe plays when `HEROESIM_SEEDS` is unset. */
export const defaultProbeSeedCount = 50;
/** Years each probe game lasts at most when `HEROESIM_YEARS` is unset. */
export const defaultProbeYears = 12;

/** The Rivals of `world`, in id order. */
function rivalsById(world: Pick<World, 'guilds'>): Guild[] {
  return Object.values(world.guilds)
    .filter((guild) => guild.controller.kind === 'rival')
    .sort((a, b) => compareByCodeUnit(a.id, b.id));
}

/**
 * Sets the first Rival's Guildmaster, in id order, to `age` at founding, and returns the Rival's
 * id. Changes nothing else. Throws on an age outside `guildmasterStartingAgeMin` to `Max`, since the
 * probe sets a legal age, and on a world with no Rival.
 */
export function setFirstRivalGuildmasterAge(document: WorldDocument, age: number, deps: Pick<EngineDeps, 'config'>): GuildId {
  const { guildmasterStartingAgeMin: min, guildmasterStartingAgeMax: max } = deps.config;
  if (!Number.isSafeInteger(age) || age < min || age > max) {
    throw new RangeError(`A Guildmaster starts aged ${min} to ${max}; the probe cannot set ${age}`);
  }
  const [rival] = rivalsById(document.world);
  if (rival === undefined) throw new RangeError('The world has no Rival to probe');
  const guildmaster = document.world.guildmasters[rival.guildmasterId];
  if (guildmaster === undefined) throw new RangeError(`${rival.id} names ${rival.guildmasterId}, who has no row`);
  guildmaster.ageAtEntry = age;
  return rival.id;
}

/** The Rival as it stood at one Turn. */
export interface GuildSnapshot {
  turn: number;
  guildmasterId: string;
  roster: number;
  wealth: number;
  fame: number;
  /** Its Hall's grades, summed over the facilities. */
  hallGrades: number;
  /**
   * The Regard the other Guildmasters in play hold for the Guild, read through its Guildmaster
   * (`guildmasterRegardForGuild`): how many there are, how many hold one other than neutral, and
   * the mean.
   */
  regardThroughGuildmaster: { of: number; held: number; mean: number };
  /** How many entries of the Guild's own Guildmaster's Regard are other than neutral. */
  guildmasterRegardHeld: number;
  /** The Patrons' mean Regard for the Guild, which the Guild keeps across a Succession. */
  patronRegardMean: number;
}

/** A Succession in a probe game: `guildmaster.succeeded`. */
export interface SuccessionRecord {
  turn: number;
  guildId: string;
  guildmasterId: string;
  successorId: string;
  age: number;
}

/** One probe game, reduced to what the report needs. JSON-safe, so a child process returns it. */
export interface ProbeGame {
  seed: string;
  /** The first Rival, in id order, and its Guildmaster at founding. */
  rivalId: string;
  guildmasterId: string;
  /** The Turn that Guildmaster retires on (`retirementTurn`). */
  retirementTurn: number;
  turnsPlayed: number;
  /** The player's game's ending, if it ended. */
  ended: { turn: number; reason: EndingReason } | null;
  /** When the first Rival folded, if it did. */
  rivalFoldedOnTurn: number | null;
  /** Every Succession of the game, every Guild's, in order. */
  successions: SuccessionRecord[];
  /** The first Rival on the eve of its Succession, the night after it, and at the game's last Turn. */
  eve: GuildSnapshot | null;
  after: GuildSnapshot | null;
  atEnd: GuildSnapshot | null;
  /** The other Rivals in play on the eve of the first Rival's Succession. */
  otherRivalsInPlay: number;
  /** How many of those Rivals folded from the night of the Succession to the game's last Turn. */
  otherRivalFoldsAfter: number;
  /** Policy actions the rules refused, and whether the validator refused the game. */
  refusals: number;
  invalid: boolean;
}

/** How a probe game is played. */
export interface ProbeOptions {
  /** Years each game lasts at most: `defaultProbeYears` unless given. */
  years?: number;
  /** The first Rival's Guildmaster's age at founding: `successionProbeAge` unless given. */
  age?: number;
  validate?: boolean;
  policy?: Readonly<PolicyConfig>;
}

/** `guildId` in `world` as a snapshot. */
function snapshot(world: World, guildId: GuildId): GuildSnapshot {
  const guild = world.guilds[guildId];
  if (guild === undefined) throw new RangeError(`${guildId} is not in the world`);
  const others = Object.values(world.guilds)
    .filter((other) => other.id !== guildId && other.foldedOnTurn === null)
    .map((other) => world.guildmasters[other.guildmasterId])
    .filter((guildmaster) => guildmaster !== undefined);
  const regard = others.map((guildmaster) => guildmasterRegardForGuild(guildmaster, guildId, world));
  const own = world.guildmasters[guild.guildmasterId];
  const patrons = Object.values(world.patrons);
  return {
    turn: world.turn,
    guildmasterId: guild.guildmasterId,
    roster: guild.rosterIds.length,
    wealth: guild.wealth,
    fame: guild.fame,
    hallGrades: Object.values(guild.hall).reduce((sum, grade) => sum + grade, 0),
    regardThroughGuildmaster: {
      of: regard.length,
      held: regard.filter((value) => value !== 0).length,
      mean: regard.length === 0 ? 0 : regard.reduce((sum, value) => sum + value, 0) / regard.length,
    },
    guildmasterRegardHeld:
      own === undefined ? 0 : Object.keys(own.regard).filter((id) => regardValue(own.regard, id as EntityId) !== 0).length,
    patronRegardMean: patrons.length === 0 ? 0 : patrons.reduce((sum, patron) => sum + patronRegardFor(patron, guildId), 0) / patrons.length,
  };
}

/** The payloads of every `type` entry in `document`'s History, with their Turns. */
function entriesOf<Payload>(document: WorldDocument, type: EventType): { turn: number; payload: Payload }[] {
  const { entries, byType } = document.history;
  return (byType[type] ?? []).map((position) => {
    const entry = entries[position];
    if (entry === undefined) throw new RangeError(`History position ${position} is empty`);
    return { turn: entry.turn, payload: entry.payload as Payload };
  });
}

/**
 * How many of the Guilds `guildIds` folded on or after Turn `fromTurn`, read from `document`'s
 * History: the Rivals in play on the eve of a Succession, and not those founded later in the place
 * of a fold, so the probe compares like with like.
 */
export function foldedAmong(document: WorldDocument, guildIds: readonly string[], fromTurn: number): number {
  const named = new Set(guildIds);
  return entriesOf<{ guildId: string }>(document, 'guild.folded').filter(({ turn, payload }) => turn >= fromTurn && named.has(payload.guildId)).length;
}

/** Plays `seed` as the probe does and reduces it to its `ProbeGame`. */
export function probeGame(seed: string, deps: EngineDeps, options: ProbeOptions = {}): ProbeGame {
  const { years = defaultProbeYears, age = successionProbeAge, validate = false, policy = defaultPolicyConfig } = options;
  let rivalId: GuildId | null = null;
  let founder: Guildmaster | null = null;
  let eve: GuildSnapshot | null = null;
  let after: GuildSnapshot | null = null;
  let otherRivalIds: GuildId[] = [];

  const game = playGame(seed, deps, {
    years,
    validate,
    policy,
    setup: harnessSetup,
    prepare: (document) => {
      rivalId = setFirstRivalGuildmasterAge(document, age, deps);
      const guild = document.world.guilds[rivalId] as Guild;
      founder = structuredClone(document.world.guildmasters[guild.guildmasterId] as Guildmaster);
    },
    afterAdvance: (before, now) => {
      if (rivalId === null || after !== null) return;
      const was = before.world.guilds[rivalId];
      const is = now.world.guilds[rivalId];
      if (was === undefined || is === undefined || was.guildmasterId === is.guildmasterId) return;
      eve = snapshot(before.world, rivalId);
      after = snapshot(now.world, rivalId);
      otherRivalIds = rivalsById(before.world)
        .filter((guild) => guild.id !== rivalId && guild.foldedOnTurn === null)
        .map((guild) => guild.id);
    },
  });

  const { document } = game;
  const probed = rivalId as GuildId | null;
  const founded = founder as Guildmaster | null;
  if (probed === null || founded === null) throw new Error(`${seed}: the probe set no Rival`);
  const rival = document.world.guilds[probed] as Guild;
  const successions = entriesOf<Omit<SuccessionRecord, 'turn'>>(document, 'guildmaster.succeeded').map(({ turn, payload }) => ({
    turn,
    guildId: payload.guildId,
    guildmasterId: payload.guildmasterId,
    successorId: payload.successorId,
    age: payload.age,
  }));
  const settled = after as GuildSnapshot | null;

  return {
    seed,
    rivalId: probed,
    guildmasterId: founded.id,
    retirementTurn: retirementTurn(founded, deps.config),
    turnsPlayed: game.turnsPlayed,
    ended: document.world.ended === null ? null : { turn: document.world.ended.turn, reason: document.world.ended.reason },
    rivalFoldedOnTurn: rival.foldedOnTurn,
    successions,
    eve,
    after,
    atEnd: settled === null ? null : snapshot(document.world, probed),
    otherRivalsInPlay: otherRivalIds.length,
    otherRivalFoldsAfter: settled === null ? 0 : foldedAmong(document, otherRivalIds, settled.turn),
    refusals: game.refusals.length,
    invalid: game.invalid !== null,
  };
}

/** Plays `seeds` in this process, in order. */
export function probeSeeds(seeds: readonly string[], deps: EngineDeps, options: ProbeOptions = {}): ProbeGame[] {
  return seeds.map((seed) => probeGame(seed, deps, options));
}

/**
 * `probeSeeds`, with each seed played in a child process of its own (`shard.ts`), `workers` at once
 * and the next starting as one finishes, as the play sweep's are (v1.1.6-S2, DL-186 item 20: dealt in
 * turn before, a lane of early endings sat idle to the slowest lane's end); each child loads the core
 * content, so `deps.content` must be it. The games come back in seed order and equal the serial
 * run's, since each is seeded.
 *
 * @throws Error when a child fails or played with other content: a broken run, not a finding
 */
export async function probeInParallel(
  seeds: readonly string[],
  deps: EngineDeps,
  options: ProbeOptions & { workers: number },
): Promise<ProbeGame[]> {
  const workers = Math.max(1, Math.min(options.workers, seeds.length));
  const jobs = seeds.map(
    (seed): ShardJob => ({
      seeds: [seed],
      config: deps.config,
      years: options.years ?? defaultProbeYears,
      validate: options.validate ?? false,
      policy: options.policy ?? defaultPolicyConfig,
      probe: { age: options.age ?? successionProbeAge },
    }),
  );
  const results = await runShardJobs(jobs, workers);
  for (const result of results) {
    if (result.content.id !== deps.content.id || result.content.version !== deps.content.version) {
      throw new Error(`A probe shard loaded content ${result.content.id} ${result.content.version}, not the run's`);
    }
  }
  // Seed i was job i's one game.
  return seeds.map((seed, index) => {
    const game = results[index]?.probes?.[0];
    if (game?.seed !== seed) throw new Error(`A probe shard returned no game for ${seed}`);
    return game;
  });
}

// ── The report ───────────────────────────────────────────────────────────────────────────────

export interface SuccessionReportContext {
  deps: EngineDeps;
  years: number;
  age: number;
  machine: Machine;
  startedAt: Date;
  workers?: number;
  validated?: boolean;
}

const mean = (values: readonly number[]): number => (values.length === 0 ? Number.NaN : values.reduce((sum, value) => sum + value, 0) / values.length);

/** The Markdown report of a Succession probe's games. */
export function successionReport(games: readonly ProbeGame[], context: SuccessionReportContext): string {
  const { deps, years, age, machine, startedAt, workers = 1, validated = false } = context;
  const { config, content } = deps;
  const count = games.length;
  const range = count === 0 ? 'no seeds' : `\`${games[0]?.seed}\` to \`${games[count - 1]?.seed}\``;
  const succeeded = games.filter((game) => game.after !== null);
  const foldedBefore = games.filter((game) => game.after === null && game.rivalFoldedOnTurn !== null);
  const own = (game: ProbeGame) => game.successions.filter((it) => it.guildId === game.rivalId);
  const others = games.flatMap((game) => game.successions.filter((it) => it.guildId !== game.rivalId));
  const rivalFoldsAfter = succeeded.filter((game) => game.rivalFoldedOnTurn !== null && game.after !== null && game.rivalFoldedOnTurn >= game.after.turn);
  const otherRivals = succeeded.reduce((sum, game) => sum + game.otherRivalsInPlay, 0);
  const otherFolds = succeeded.reduce((sum, game) => sum + game.otherRivalFoldsAfter, 0);
  const turnsOf = (list: readonly SuccessionRecord[]): string => {
    const byTurn = new Map<number, number>();
    for (const it of list) byTurn.set(it.turn, (byTurn.get(it.turn) ?? 0) + 1);
    return [...byTurn.entries()].sort((a, b) => a[0] - b[0]).map(([turn, n]) => `Turn ${whole(turn)} × ${whole(n)}`).join(', ') || 'none';
  };
  const snapshots = (pick: (game: ProbeGame) => GuildSnapshot | null) => succeeded.map(pick).filter((it) => it !== null);
  const across = (label: string, read: (snap: GuildSnapshot) => number, digits = 2): string[] => [
    label,
    ...[(game: ProbeGame) => game.eve, (game: ProbeGame) => game.after, (game: ProbeGame) => game.atEnd].map((pick) =>
      fixed(mean(snapshots(pick).map(read)), digits),
    ),
  ];

  const lines = [
    `# M9 harness report: the Succession probe, a Rival Guildmaster at ${age}`,
    '',
    `Run begun ${localTimestamp(startedAt)} · ${whole(count)} seeds, ${range} · up to ${fixed(years, 0)} ${years === 1 ? 'year' : 'years'} ` +
      `(${whole(years * config.turnsPerYear)} Turns) each · the first Rival's Guildmaster, in id order, set to ${age} at ` +
      `founding · content \`${content.id}\` version ${content.version} · config version ${config.configVersion}, schema ` +
      `version ${config.schemaVersion} · \`createdAt: "${harnessSetup.createdAt}"\`, the player's Guildmaster ` +
      `${harnessSetup.guildmasterAge ?? 'drawn'} · the automatic policy · validated after every advance: ${validated ? 'yes' : 'no'}`,
    '',
    `Machine: Node ${machine.node} · ${machine.os} ${machine.arch} · ${machine.cpu} (${machine.cores} logical cores) · ` +
      `games shared among ${workers} ${workers === 1 ? 'process' : 'processes'}`,
    '',
    '## Summary',
    '',
    markdownTable(
      ['Measure', 'Value'],
      [
        ['Games played', whole(count)],
        [
          "The first Rival's Guildmaster retires on (`retirementTurn`)",
          [...new Set(games.map((game) => game.retirementTurn))].map((turn) => `Turn ${whole(turn)}`).join(', ') || '—',
        ],
        ['Games whose first Rival was succeeded', `${whole(succeeded.length)} of ${whole(count)}`],
        ['Games whose first Rival folded before its Retirement', whole(foldedBefore.length)],
        ["Games whose first Rival was succeeded more than once", whole(games.filter((game) => own(game).length > 1).length)],
        ["The player's endings", games.filter((game) => game.ended !== null).map((game) => `${game.seed} ${game.ended?.reason}`).join(', ') || 'none'],
        ['Policy actions the rules refused', whole(games.reduce((sum, game) => sum + game.refusals, 0))],
        ['Games the validator refused', whole(games.filter((game) => game.invalid).length)],
      ],
    ),
    '',
    '## The Successions',
    '',
    `The first Rival's: ${turnsOf(games.flatMap(own))}. Every other Guild's (Guildmasters drawn old enough to reach ` +
      `${config.guildmasterRetirementAge} within ${fixed(years, 0)} years): ${whole(others.length)}, ${turnsOf(others)}.`,
    '',
    markdownTable(
      ['Seed', 'Rival', 'Fate', 'Succeeded on', 'Successor'],
      games.map((game) => {
        const [first] = own(game);
        const fate =
          first !== undefined
            ? game.rivalFoldedOnTurn === null
              ? 'succeeded, in play at the end'
              : `succeeded, folded on Turn ${whole(game.rivalFoldedOnTurn)}`
            : game.rivalFoldedOnTurn !== null
              ? `folded on Turn ${whole(game.rivalFoldedOnTurn)}, before its Retirement`
              : `in play, not yet retired at Turn ${whole(game.turnsPlayed)}`;
        return [game.seed, game.rivalId, fate, first === undefined ? '—' : `Turn ${whole(first.turn)}, at ${first.age}`, first?.successorId ?? '—'];
      }),
    ),
    '',
    '## The Rival across its Succession',
    '',
    `Means over the ${whole(succeeded.length)} Rivals succeeded: on the eve (the afternoon before), the night after, and ` +
      `at the game's last Turn. The Guild keeps its Roster, Wealth, Fame, Hall and Items; the night's Quests, Upkeep and ` +
      `Transfers move what they move.`,
    '',
    markdownTable(
      ['Measure', 'Eve', 'The night after', 'Last Turn'],
      [
        across('Roster', (snap) => snap.roster),
        across('Wealth', (snap) => snap.wealth, 0),
        across('Fame', (snap) => snap.fame, 0),
        across('Hall grades', (snap) => snap.hallGrades),
      ],
      ['left', 'right', 'right', 'right'],
    ),
    '',
    '## Regard for the Guild through its Guildmaster',
    '',
    'The other Guildmasters in play hold Regard for the Guild through its Guildmaster (`guildmasterRegardForGuild`), so ' +
      "it starts neutral with the successor, as the successor's own Regard does. The Patrons' Regard is for the Guild " +
      'and is kept.',
    '',
    markdownTable(
      ['Measure', 'Eve', 'The night after', 'Last Turn'],
      [
        across('Other Guildmasters holding a Regard other than neutral for the Guild', (snap) => snap.regardThroughGuildmaster.held),
        across('Their mean Regard for the Guild', (snap) => snap.regardThroughGuildmaster.mean),
        across("Entries other than neutral in the Guild's Guildmaster's own Regard", (snap) => snap.guildmasterRegardHeld),
        across("The Patrons' mean Regard for the Guild", (snap) => snap.patronRegardMean),
      ],
      ['left', 'right', 'right', 'right'],
    ),
    '',
    '## Folds after the Succession',
    '',
    "From the night of the first Rival's Succession to the game's last Turn, beside the other Rivals in play on its eve; " +
      'a Rival founded later in the place of a fold is not among them.',
    '',
    markdownTable(
      ['Rivals', 'In play', 'Folded after', 'Share'],
      [
        ['The first Rival, succeeded', whole(succeeded.length), whole(rivalFoldsAfter.length), percent(rivalFoldsAfter.length, succeeded.length)],
        ['The other Rivals', whole(otherRivals), whole(otherFolds), percent(otherFolds, otherRivals)],
      ],
      ['left', 'right', 'right', 'right'],
    ),
    '',
  ];
  return lines.join('\n');
}
