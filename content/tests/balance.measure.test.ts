/**
 * The E1 balance harness (DL-13). It plays a fleet of twenty-year Careers under the same
 * automatic policy the two contract suites use, over the real authored content, and
 * prints the numbers the balance pass is tuned against.
 *
 * It is not part of the normal suite: three hundred twenty-year Careers take minutes, and
 * a measurement is not an assertion. Run it deliberately:
 *
 *   HEROESIM_BALANCE=1 npx vitest run content/tests/balance.measure.test.ts
 *
 * `HEROESIM_BALANCE_SEEDS` overrides the fleet size; `HEROESIM_BALANCE_CONFIG` takes a
 * JSON object of `GameConfig` overrides, so a candidate default can be measured without
 * editing the engine first.
 */

import { describe, expect, it } from 'vitest';
import {
  advanceUntilAttention,
  availableHeroes,
  commitParty,
  newCareer,
  type Career,
  type Content,
  type GameConfig,
  type GameEvent,
  type Hero,
} from '@heroesim/engine';
import { loadContentFromDisk } from '../src/node.js';

const content: Content = loadContentFromDisk();

const ENABLED = process.env['HEROESIM_BALANCE'] !== undefined;
const SEEDS = Number(process.env['HEROESIM_BALANCE_SEEDS'] ?? 300);
const OVERRIDES: Partial<GameConfig> = JSON.parse(
  process.env['HEROESIM_BALANCE_CONFIG'] ?? '{}',
) as Partial<GameConfig>;

const strength = (hero: Hero): number =>
  hero.stats.Might + hero.stats.Craft + hero.stats.Nerve + hero.stats.Guile;

/** The automatic policy: the best Heroes to the best-paying work, two at a time. */
function bestFirst(career: Career): { commissionId: string; heroIds: string[] }[] {
  const free = [...availableHeroes(career)].sort((one, other) => strength(other) - strength(one));
  const byFee = [...career.board].sort((one, other) => other.fee - one.fee);
  const commitments: { commissionId: string; heroIds: string[] }[] = [];
  let taken = 0;
  for (const commission of byFee) {
    const party = free.slice(taken, taken + 2).map((hero) => hero.id);
    if (party.length === 0) break;
    commitments.push({ commissionId: commission.id, heroIds: party });
    taken += party.length;
  }
  return commitments;
}

/**
 * A deliberately bad Guildmaster: one Commission at a time, the hardest on the Board,
 * and the weakest free Hero sent alone to it. This is the Career that fails about half
 * its work; "Coin is tight" means it should not survive twenty years of it.
 */
function worstFirst(career: Career): { commissionId: string; heroIds: string[] }[] {
  if (career.parties.length > 0) return [];
  const free = [...availableHeroes(career)].sort((one, other) => strength(one) - strength(other));
  const hardest = [...career.board].sort((one, other) => other.difficulty - one.difficulty)[0];
  const hero = free[0];
  if (hardest === undefined || hero === undefined) return [];
  return [{ commissionId: hardest.id, heroIds: [hero.id] }];
}

type Policy = (career: Career) => { commissionId: string; heroIds: string[] }[];

/** What one played Career looked like. */
interface Run {
  reason: 'retirement' | 'insolvency';
  endedOnDay: number;
  years: number;
  finalCoin: number;
  beats: Record<'failure' | 'success' | 'critical', number>;
  marginTotal: number;
  patronsAtFloor: number;
  patronCount: number;
  refreshes: number;
  emptyRefreshes: number;
  committed: number;
  commissionsCompleted: number;
  commissionsFailed: number;
  feeIncome: number;
  consequenceCoin: number;
  upkeepPaid: number;
  /** Commissions taken and finished inside the first two years, and how many failed. */
  earlyTaken: number;
  earlyFailed: number;
}

function playOne(seed: string, policy: Policy, config: Partial<GameConfig>): Run {
  const opened = newCareer(seed, content, config);
  let career = opened.career;
  const run: Run = {
    reason: 'retirement',
    endedOnDay: 0,
    years: 0,
    finalCoin: 0,
    beats: { failure: 0, success: 0, critical: 0 },
    marginTotal: 0,
    patronsAtFloor: 0,
    patronCount: career.patrons.length,
    refreshes: 0,
    emptyRefreshes: 0,
    committed: 0,
    commissionsCompleted: 0,
    commissionsFailed: 0,
    feeIncome: 0,
    consequenceCoin: 0,
    upkeepPaid: 0,
    earlyTaken: 0,
    earlyFailed: 0,
  };
  const twoYears = career.config.daysPerYear * 2;

  const read = (events: readonly GameEvent[]): void => {
    for (const event of events) {
      switch (event.type) {
        case 'BeatResolved':
          run.beats[event.result] += 1;
          run.marginTotal += event.total - event.dc;
          break;
        case 'BoardRefreshed':
          run.refreshes += 1;
          if (event.commissionIds.length === 0) run.emptyRefreshes += 1;
          break;
        case 'PartyCommitted':
          run.committed += 1;
          break;
        case 'PartyReturned':
          if (event.day <= twoYears) {
            run.earlyTaken += 1;
            if (!event.succeeded) run.earlyFailed += 1;
          }
          break;
        case 'CoinChanged':
          if (event.reason === 'fee') run.feeIncome += event.delta;
          if (event.reason === 'consequence') run.consequenceCoin += event.delta;
          if (event.reason === 'upkeep') run.upkeepPaid -= event.delta;
          break;
        default:
          break;
      }
    }
  };

  read(opened.events);
  let guard = 0;
  while (career.ended === undefined) {
    guard += 1;
    if (guard > 100_000) throw new Error('the automatic policy never reached the end of the Career');
    for (const { commissionId, heroIds } of policy(career)) {
      const step = commitParty(career, commissionId, heroIds, content);
      career = step.career;
      read(step.events);
    }
    const step = advanceUntilAttention(career, content);
    career = step.career;
    read(step.events);
  }

  const floor = career.config.patronPostsAboveRegard;
  run.reason = career.ended.reason;
  run.endedOnDay = career.ended.onDay;
  run.years = (career.ended.onDay - 1) / career.config.daysPerYear;
  run.finalCoin = career.guild.coin;
  run.patronsAtFloor = career.patrons.filter((patron) => patron.regardForGuild.value <= floor).length;
  run.patronCount = career.patrons.length;
  run.commissionsCompleted = career.ledger.commissionsCompleted;
  run.commissionsFailed = career.ledger.commissionsFailed;
  return run;
}

function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((one, other) => one - other);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle] ?? 0;
  return ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
}

const sum = (values: readonly number[]): number => values.reduce((total, value) => total + value, 0);
const mean = (values: readonly number[]): number =>
  values.length === 0 ? 0 : sum(values) / values.length;
const percent = (part: number, whole: number): string =>
  whole === 0 ? '   n/a' : `${((part / whole) * 100).toFixed(1)}%`;
const coin = (value: number): string => Math.round(value).toLocaleString('en-GB');

function report(label: string, runs: readonly Run[]): void {
  const finalCoin = runs.map((run) => run.finalCoin);
  const beats = {
    failure: sum(runs.map((run) => run.beats.failure)),
    success: sum(runs.map((run) => run.beats.success)),
    critical: sum(runs.map((run) => run.beats.critical)),
  };
  const allBeats = beats.failure + beats.success + beats.critical;
  const refreshes = sum(runs.map((run) => run.refreshes));
  const empty = sum(runs.map((run) => run.emptyRefreshes));
  const patrons = sum(runs.map((run) => run.patronCount));
  const atFloor = sum(runs.map((run) => run.patronsAtFloor));
  const retired = runs.filter((run) => run.reason === 'retirement').length;
  const broke = runs.filter((run) => run.reason === 'insolvency');
  const lines = [
    ``,
    `── ${label} — ${runs.length} seeds ──────────────────────────────`,
    `retirement rate        ${percent(retired, runs.length)}  (${retired}/${runs.length}; ${runs.length - retired} insolvent)`,
    `insolvency  median yr  ${median(broke.map((run) => run.years)).toFixed(1)}`,
    `            inside yr2 ${percent(broke.filter((run) => run.years <= 2).length, runs.length)} of all Careers`,
    `mean years reached     ${mean(runs.map((run) => run.years)).toFixed(1)}`,
    `final coin  mean       ${coin(mean(finalCoin))}`,
    `            median     ${coin(median(finalCoin))}`,
    `            min / max  ${coin(Math.min(...finalCoin))} / ${coin(Math.max(...finalCoin))}`,
    `Beat mix    failure    ${percent(beats.failure, allBeats)}`,
    `            success    ${percent(beats.success, allBeats)}`,
    `            critical   ${percent(beats.critical, allBeats)}`,
    `mean margin over DC    ${(sum(runs.map((run) => run.marginTotal)) / Math.max(1, allBeats)).toFixed(2)}`,
    `Patrons at/below floor ${percent(atFloor, patrons)}  (${atFloor}/${patrons} at the end)`,
    `empty Board refreshes  ${percent(empty, refreshes)}  (${empty}/${refreshes})`,
    `Commissions per year   ${(sum(runs.map((run) => run.committed)) / Math.max(1, sum(runs.map((run) => run.years)))).toFixed(1)}`,
    `Commission success     ${percent(
      sum(runs.map((run) => run.commissionsCompleted)),
      sum(runs.map((run) => run.commissionsCompleted + run.commissionsFailed)),
    )}`,
    `coin per year   fees   ${coin(sum(runs.map((run) => run.feeIncome)) / Math.max(1, sum(runs.map((run) => run.years))))}`,
    `             outcomes  ${coin(sum(runs.map((run) => run.consequenceCoin)) / Math.max(1, sum(runs.map((run) => run.years))))}`,
    `               Upkeep  −${coin(sum(runs.map((run) => run.upkeepPaid)) / Math.max(1, sum(runs.map((run) => run.years))))}`,
    `first two years failed ${percent(
      sum(runs.map((run) => run.earlyFailed)),
      sum(runs.map((run) => run.earlyTaken)),
    )}`,
    ``,
  ];
  console.log(lines.join('\n'));
}

describe.skipIf(!ENABLED)('the balance of the authored world', () => {
  it(
    'measures the automatic policy over twenty years',
    () => {
      const runs: Run[] = [];
      for (let seed = 0; seed < SEEDS; seed += 1) {
        runs.push(playOne(`balance-${seed}`, bestFirst, OVERRIDES));
      }
      report('automatic policy', runs);
      expect(runs).toHaveLength(SEEDS);
    },
    1_800_000,
  );

  it(
    'measures a Guildmaster who sends one weak Hero at the hardest work',
    () => {
      const runs: Run[] = [];
      const halved = Math.max(1, Math.round(SEEDS / 3));
      for (let seed = 0; seed < halved; seed += 1) {
        runs.push(playOne(`balance-${seed}`, worstFirst, OVERRIDES));
      }
      report('the failing Guildmaster', runs);
      const failedHalf = runs.filter((run) => run.earlyFailed * 2 >= run.earlyTaken);
      const insolvent = failedHalf.filter((run) => run.reason === 'insolvency');
      console.log(
        `of ${failedHalf.length} Careers that failed half their first two years' work, ` +
          `${insolvent.length} went insolvent (${percent(insolvent.length, failedHalf.length)}), ` +
          `median on Day ${median(insolvent.map((run) => run.endedOnDay))}\n`,
      );
      expect(runs).toHaveLength(halved);
    },
    1_800_000,
  );
});
