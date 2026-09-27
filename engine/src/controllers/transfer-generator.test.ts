import { afterEach, beforeAll, describe, expect, test } from 'vitest';
import type { EngineDeps } from '../config.js';
import type { DispositionKey } from '../content-types.js';
import { createWorld } from '../create.js';
import type { Guild, GuildId, Guildmaster, World, WorldDocument } from '../document.js';
import { append } from '../history.js';
import { phaseContext, type Phase } from '../phases/phase.js';
import { phases, runTurn } from '../pipeline.js';
import { dispositionOf, playerGuild } from '../selectors.js';
import { nightOf } from '../time.js';
import { validate } from '../validate.js';
import { testDeps, withEncounters } from '../world.test-support.js';

// M6-S3's two boxes (DL-59):
//
// 1. over 100 seeds × 20 years, Rival-to-Rival Transfers occur, and the Roster-size distribution
//    across Rivals stays within the range a Rival is generated with (`rivalRosterMin` to
//    `rivalRosterMax`);
// 2. the player's Roster is never changed by the Transfer Generator's phase.
//
// The sweep: each seed is a default world, four Rivals dealt the four Dispositions (DL-56), the player
// idle and rich (its Guildmaster young enough not to retire), played Turn by Turn on the one world, in
// place, as M6-S1's and M6-S4's tests are (DL-56, DL-58). The `transfers` phase is watched: each run
// of it is bracketed by a snapshot of the player's Guild, its Guildmaster and its Heroes, and the
// Transfers it makes are the Generator's, told from the afternoon's (M6-S2's `transferChoice`) by the
// phase that made them. One pin besides the Generator's own numbers, as in M6-S4's test: every
// Encounter's Check asks 0.15 of the Quest's difficulty, under which the test content's Rivals live
// off their Quests as the core's do (DL-58).
//
// A twenty-year seed takes about five seconds on an idle machine, so the box's 100 seeds are some nine
// minutes (36 were measured beside another sweep): `npm test` plays four seeds × 20 years, and the
// whole box runs with the harness flag set (`HEROESIM_HARNESS=1 npx vitest run
// engine/src/controllers/transfer-generator.test.ts`); DL-59 records the run. A Rival bids only while it would hire (DL-59), which the test content's Rivals
// seldom would: the Generator dealt in 20 of the 100 seeds, 24 times. So the four seeds of `npm test`
// may hold none of its Transfers, and the Generator's own count is asserted over the hundred; `npm
// test` asserts the Rival-to-Rival Transfers of either kind, and the Generator's own over 100 seeds
// of Rivals that would hire, below, where the second box is tested on the phase alone.

const harness = (process.env['HEROESIM_HARNESS'] ?? '') !== '';
const years = 20;
const seeds = Array.from({ length: harness ? 100 : 4 }, (_, index) => `transfer-generator-${index + 1}`);
const setup = { guildmasterName: 'Ada', guildName: 'The Test', createdAt: 'test' };
const pins = {
  rivalCount: 4,
  rivalRosterMin: 4,
  rivalRosterMax: 8,
  transferGeneratorEveryDays: 7,
  transferGeneratorChance: 0.5,
};
const deps: EngineDeps = testDeps(pins, withEncounters({ difficultyFactor: 0.15 }));

const transfersPhase = phases.find((phase) => phase.name === 'transfers') as Phase;
const generatorRun = transfersPhase.run;

afterEach(() => {
  unwatchPhase();
});

/** The Rivals in play. */
const rivalsInPlay = (world: World): Guild[] =>
  Object.values(world.guilds).filter((guild) => guild.foldedOnTurn === null && dispositionOf(guild) !== null);

/** What a run of the phase may not change: the player's Guild, its Guildmaster and its Heroes, as JSON. */
function playerRows(world: World): string {
  const player = playerGuild(world) as Guild;
  return JSON.stringify([
    player,
    world.guildmasters[player.guildmasterId],
    player.rosterIds.map((heroId) => world.heroes[heroId]),
  ]);
}

/** A Transfer the Generator made, with both Rosters' sizes just after it and both Dispositions. */
interface GeneratorTransfer {
  turn: number;
  from: { id: GuildId; size: number; disposition: DispositionKey | null };
  to: { id: GuildId; size: number; disposition: DispositionKey | null };
}

/** What the phase did in a seed. */
interface Watch {
  seed: string;
  playerId: GuildId;
  /** Runs of the phase, one each night whether or not it is the Generator's. */
  runs: number;
  /** Runs after which the player's rows differed from before. */
  playerChanged: number;
  /** The Generator's Transfers. */
  transfers: GeneratorTransfer[];
}

/**
 * The phase's rule wrapped to watch it: the player's rows before and after each run, and the Rosters'
 * sizes as each of its Transfers is made, replayed from the sizes before the run.
 */
function watching(watch: Watch): Phase['run'] {
  return (world, ctx) => {
    const before = playerRows(world);
    const sizes = new Map(Object.values(world.guilds).map((guild) => [guild.id, guild.rosterIds.length]));
    const events = generatorRun(world, ctx);
    watch.runs += 1;
    if (playerRows(world) !== before) watch.playerChanged += 1;
    for (const event of events) {
      if (event.type !== 'hero.transferred') continue;
      const { fromGuildId, toGuildId } = event.payload;
      sizes.set(fromGuildId, (sizes.get(fromGuildId) ?? 0) - 1);
      sizes.set(toGuildId, (sizes.get(toGuildId) ?? 0) + 1);
      const side = (id: GuildId) => ({ id, size: sizes.get(id) ?? 0, disposition: dispositionOf(world.guilds[id] as Guild) });
      watch.transfers.push({ turn: event.turn, from: side(fromGuildId), to: side(toGuildId) });
    }
    return events;
  };
}

/** A new, empty watch for `world`'s seed. */
const newWatch = (seed: string, world: World): Watch => ({
  seed,
  playerId: (playerGuild(world) as Guild).id,
  runs: 0,
  playerChanged: 0,
  transfers: [],
});

/**
 * Puts the phase's rule, wrapped to fill `watch`, in the pipeline's place for it until `unwatchPhase`,
 * and returns `watch`. A plain wrapper rather than a spy: a spy keeps every call's arguments, and with
 * them every seed's History, which a hundred twenty-year seeds do not fit.
 */
function watchPhase<W extends Watch>(watch: W): W {
  transfersPhase.run = watching(watch);
  return watch;
}

/** Puts the phase's own rule back. */
function unwatchPhase(): void {
  transfersPhase.run = generatorRun;
}

/** The player idle and rich, its Guildmaster young enough not to retire in the years played. */
function stillPlayer(world: World, with_: EngineDeps): void {
  const player = playerGuild(world) as Guild;
  player.wealth = 1_000_000_000;
  (world.guildmasters[player.guildmasterId] as Guildmaster).ageAtEntry = with_.config.guildmasterStartingAgeMin;
}

/** What a seed's twenty years showed. */
interface Tally extends Watch {
  /** Every Rival-to-Rival Transfer, of either kind: the afternoon's and the Generator's. */
  rivalToRival: number;
  /** The Roster size of each Rival in play at each year's end, by year from 1. */
  yearEnds: number[][];
}

/** Plays `seed` for twenty years in place, watching the phase, and validates the end. */
function sweep(seed: string): Tally {
  const document: WorldDocument = createWorld(seed, setup, deps).document;
  const { world } = document;
  stillPlayer(world, deps);
  const tally = watchPhase<Tally>({ ...newWatch(seed, world), rivalToRival: 0, yearEnds: [] });
  const turns = years * deps.config.turnsPerYear;
  let lastYearFrom = 0;
  try {
    while (world.turn < turns && world.ended === null) {
      if (world.turn === turns - deps.config.turnsPerYear) lastYearFrom = document.history.entries.length;
      world.turn += 1;
      for (const event of runTurn(world, phaseContext(world, deps, document.history))) {
        append(document.history, event);
        if (event.type !== 'hero.transferred') continue;
        const { fromGuildId, toGuildId } = event.payload;
        const rival = (id: GuildId) => dispositionOf(world.guilds[id] as Guild) !== null;
        if (rival(fromGuildId) && rival(toGuildId)) tally.rivalToRival += 1;
      }
      if (world.turn % deps.config.turnsPerYear === 0) tally.yearEnds.push(rivalsInPlay(world).map((guild) => guild.rosterIds.length));
    }
  } finally {
    unwatchPhase();
  }
  expect(world.ended, seed).toBeNull();
  // The World State in full and the last year's History (DL-34), neither refused nor warned about.
  const validated = validate(document, deps, { historyFrom: lastYearFrom });
  expect(validated.ok ? validated.warnings : validated.failures, seed).toEqual([]);
  return tally;
}

const median = (values: readonly number[]): number => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? (sorted[middle] as number) : ((sorted[middle - 1] as number) + (sorted[middle] as number)) / 2;
};
const mean = (values: readonly number[]): number => values.reduce((sum, value) => sum + value, 0) / values.length;

/** A Rival's appetite by its Disposition, in `with_`'s content. */
const appetiteOf = (with_: EngineDeps, disposition: DispositionKey | null): number =>
  disposition === null ? Number.NaN : (with_.content.dispositions[disposition]?.transferAppetite ?? Number.NaN);

/**
 * What every Transfer the Generator makes must be, in any world: between two Rivals, the one taking
 * the Hero with the greater appetite or, of two alike, the tie-break's; the Roster it takes from left
 * at `rivalRosterMin` or above and the one it gives to at `rivalRosterMax` or below, so that its own
 * moves never take a Roster out of the generation range.
 */
function expectWithinTheRule(watch: Watch, with_: EngineDeps): void {
  const { rivalRosterMin: min, rivalRosterMax: max } = with_.config;
  for (const transfer of watch.transfers) {
    const where = `${watch.seed} Turn ${transfer.turn}`;
    expect([transfer.from.id, transfer.to.id], where).not.toContain(watch.playerId);
    expect(appetiteOf(with_, transfer.to.disposition), where).toBeGreaterThanOrEqual(appetiteOf(with_, transfer.from.disposition));
    expect(transfer.from.size, where).toBeGreaterThanOrEqual(min);
    expect(transfer.to.size, where).toBeLessThanOrEqual(max);
  }
}

describe(`the Transfer Generator over ${seeds.length} seeds × ${years} years (M6-S3)`, () => {
  let tallies: Tally[] = [];
  beforeAll(() => {
    tallies = seeds.map(sweep);
  }, (harness ? 7_200 : 300) * 1000);

  test('Rival-to-Rival Transfers occur; those the Generator makes go to the more transferAppetite-heavy Rival', () => {
    expect(tallies.reduce((sum, tally) => sum + tally.rivalToRival, 0)).toBeGreaterThan(0);
    for (const tally of tallies) expectWithinTheRule(tally, deps);
    // The Generator's own, over the box's hundred seeds (the harness flag): the four of `npm test` may
    // hold none, as Rivals seldom would hire (DL-59).
    if (harness) expect(tallies.reduce((sum, tally) => sum + tally.transfers.length, 0)).toBeGreaterThan(0);
  });

  test('the Roster-size distribution across Rivals stays within the generation range', () => {
    const { rivalRosterMin: min, rivalRosterMax: max } = deps.config;
    // The Generator's own moves never take a Roster out of the range (`expectWithinTheRule`, above).
    // At every year's end, across the seeds' Rivals in play, the distribution's median and mean lie
    // within the range: Deaths, Retirements, recruits, the afternoon's Transfers and folds move single
    // Rosters out of it, which the Generator does not undo (DL-59), but not the distribution.
    for (let year = 0; year < years; year += 1) {
      const sizes = tallies.flatMap((tally) => tally.yearEnds[year] ?? []);
      expect(sizes.length, `year ${year + 1}`).toBeGreaterThan(0);
      for (const [what, value] of [
        ['median', median(sizes)],
        ['mean', mean(sizes)],
      ] as const) {
        expect(value, `year ${year + 1} ${what}`).toBeGreaterThanOrEqual(min);
        expect(value, `year ${year + 1} ${what}`).toBeLessThanOrEqual(max);
      }
    }
  });

  test("the player's Roster is never changed by the phase, on any night of twenty years", () => {
    for (const tally of tallies) {
      // One run each night: a third of the Turns played, which start on a morning (DL-24).
      expect(tally.runs, tally.seed).toBe((years * deps.config.turnsPerYear) / 3);
      expect(tally.playerChanged, tally.seed).toBe(0);
    }
  });
});

describe("the player's Roster over 100 seeds (M6-S3)", () => {
  test('is never changed by the phase, while the Rivals, rich, deal among themselves on its nights', () => {
    // The phase alone, on each of 100 seeds' worlds, on ten Generator nights in turn: every Rival rich
    // enough to hire and to pay, every pair bidding every week, the player idle and rich too. What the
    // phase leaves each night is the next night's world.
    const eager = testDeps({ ...pins, transferGeneratorChance: 1 }, deps.content);
    const every = eager.config.transferGeneratorEveryDays;
    const nights = 10;
    const watches = Array.from({ length: 100 }, (_, index) => {
      const seed = `player-untouched-${index + 1}`;
      const { world } = createWorld(seed, setup, eager).document;
      stillPlayer(world, eager);
      for (const rival of rivalsInPlay(world)) rival.wealth = 1_000_000;
      const watch = watchPhase(newWatch(seed, world));
      for (let night = 1; night <= nights; night += 1) {
        world.turn = nightOf(night * every - 1);
        transfersPhase.run(world, phaseContext(world, eager));
      }
      unwatchPhase();
      return watch;
    });

    for (const watch of watches) {
      expect(watch.runs, watch.seed).toBe(nights);
      expect(watch.playerChanged, watch.seed).toBe(0);
      expectWithinTheRule(watch, eager);
    }
    // The phase was at work: the Rivals dealt among themselves in most seeds.
    expect(watches.filter((watch) => watch.transfers.length > 0).length).toBeGreaterThan(50);
  });
});
