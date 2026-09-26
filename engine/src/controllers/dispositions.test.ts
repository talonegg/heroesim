import { describe, expect, test } from 'vitest';
import type { EngineDeps } from '../config.js';
import type { DispositionKey } from '../content-types.js';
import { createWorld } from '../create.js';
import type { Guild, GuildId, WorldDocument } from '../document.js';
import type { EngineEvent } from '../events.js';
import { append } from '../history.js';
import { phaseContext } from '../phases/phase.js';
import { runTurn } from '../pipeline.js';
import { dispositionOf, playerGuild } from '../selectors.js';
import { testContent, testDeps, withEncounters, withValid } from '../world.test-support.js';

// M6-S1's first box (INPUTS 7.5, DL-56): over 100 seeds, `reckless` Rivals take higher mean
// difficulty than `miserly` and lose more Heroes, and `ambitious` builds first. The four
// Dispositions are the test content's rows, which mirror the core's, dealt round-robin to a
// default world's four Rivals; nothing here tells a Rival what to do.
//
// Each seed plays a month. A Death is rare under the test content's Encounters (a failure kills
// one time in fifty, in two Encounters of twelve), too rare to count in a month of 100 worlds (4
// `reckless` Deaths against 3 `miserly` in a trial), so the Encounters here kill one time in five
// on every failure and do nothing else: the same Quest Engine and the same rule, with harm common
// enough for a month to show whose Quests are the dangerous ones. The harness counts Deaths by
// Disposition over the core content and twenty years (the M6 close).

const seeds = Array.from({ length: 100 }, (_, index) => `dispositions-${String(index + 1).padStart(3, '0')}`);
const days = 30;
const turnsPerDay = 3;
const setup = { guildmasterName: 'Ada', guildName: 'The Test', createdAt: 'test' };
const dispositions = ['ambitious', 'miserly', 'reckless', 'steady'] as const;

/** A failed Encounter kills a member of the Party one time in five, and costs nothing else. */
const deps: EngineDeps = testDeps({}, withEncounters({ failure: [{ kind: 'death', chance: 0.2 }] }));

interface Tally {
  /** The difficulty of every Quest a Rival of the Disposition took. */
  difficulties: number[];
  /** Heroes of its Rivals who died. */
  deaths: number;
  /** The Turn its first Improvement was built, per seed, or `null` when it built none. */
  firstBuilds: (number | null)[];
}

/**
 * Plays `document` to the end of Day `days`, Turn by Turn, as `advance` plays a Turn but on the
 * one world, in place: `advance` copies the world each Turn so that the caller keeps the old one,
 * which this test has no use for and which would triple its time (DL-56). The events go to the
 * History, as `advance` appends them, and each is shown to `watch` on the world as its Turn left it.
 */
function play(document: WorldDocument, watch: (event: EngineEvent) => void): void {
  const { world } = document;
  while (world.turn < days * turnsPerDay && world.ended === null) {
    world.turn += 1;
    for (const event of runTurn(world, phaseContext(world, deps, document.history))) {
      append(document.history, event);
      watch(event);
    }
  }
}

function sweep(): Record<DispositionKey, Tally> {
  const tallies = Object.fromEntries(
    dispositions.map((disposition) => [disposition, { difficulties: [], deaths: 0, firstBuilds: [] } as Tally]),
  ) as Record<DispositionKey, Tally>;
  seeds.forEach((seed, index) => {
    const document = createWorld(seed, setup, deps).document;
    const { world } = document;
    // The player takes no Quest and must not run out of Wealth: the month is the Rivals'.
    (playerGuild(world) as Guild).wealth = 1_000_000_000;
    const dealt = (guildId: GuildId) => dispositionOf(world.guilds[guildId] as Guild);
    expect(Object.values(world.guilds).map(dispositionOf).filter((key) => key !== null).sort()).toEqual([...dispositions]);

    const firstBuild: Record<DispositionKey, number> = {};
    play(document, (event) => {
      if (event.type === 'quest.taken') {
        // Taken this Turn, so its row is there: a Quest's row goes when it is resolved.
        const disposition = dealt(event.payload.guildId);
        const difficulty = world.quests[event.payload.questId]?.difficulty;
        if (disposition !== null && difficulty !== undefined) tallies[disposition]?.difficulties.push(difficulty);
      } else if (event.type === 'guild.improved') {
        const disposition = dealt(event.payload.guildId);
        if (disposition !== null && firstBuild[disposition] === undefined) firstBuild[disposition] = event.turn;
      }
    });
    if (index % 10 === 0) withValid(document, deps);

    for (const hero of Object.values(world.heroes)) {
      if (hero.diedOnTurn === null || hero.guildId === null) continue;
      const disposition = dealt(hero.guildId);
      const tally = disposition === null ? undefined : tallies[disposition];
      if (tally !== undefined) tally.deaths += 1;
    }
    for (const disposition of dispositions) tallies[disposition]?.firstBuilds.push(firstBuild[disposition] ?? null);
  });
  return tallies;
}

const mean = (values: readonly number[]): number => values.reduce((total, value) => total + value, 0) / values.length;

describe('the four Dispositions over 100 seeds (M6-S1)', () => {
  test('reckless takes higher mean difficulty than miserly and loses more Heroes; ambitious builds first', { timeout: 120_000 }, () => {
    expect(deps.config.rivalCount).toBe(4);
    expect(Object.keys(testContent.dispositions).sort()).toEqual([...dispositions]);

    const { ambitious, miserly, reckless, steady } = sweep() as Record<(typeof dispositions)[number], Tally>;

    // Every Disposition took Quests in every sweep, so each mean is over many.
    for (const tally of [ambitious, miserly, reckless, steady]) expect(tally.difficulties.length).toBeGreaterThan(500);
    // reckless takes the hardest it can staff, miserly a quarter of the way along; and loses more
    // Heroes to them. By a margin, not a hair: two Rivals of the same row differ a little by
    // where they act in the afternoon's order alone, and this is to be the rows' difference.
    expect(mean(reckless.difficulties)).toBeGreaterThan(mean(miserly.difficulties) + 10);
    expect(reckless.deaths).toBeGreaterThan(1.25 * miserly.deaths);

    // ambitious builds first: in every seed it builds, and no Rival of another Disposition builds
    // before it; over the sweep its first Improvement comes earliest on average.
    const never = Number.POSITIVE_INFINITY;
    const firstOf = (tally: Tally, index: number) => tally.firstBuilds[index] ?? never;
    seeds.forEach((seed, index) => {
      const its = firstOf(ambitious, index);
      expect(its, seed).toBeLessThan(never);
      for (const other of [miserly, reckless, steady]) expect(its, seed).toBeLessThanOrEqual(firstOf(other, index));
    });
    const meanFirst = (tally: Tally) => mean(seeds.map((_, index) => Math.min(firstOf(tally, index), days * turnsPerDay + 1)));
    for (const other of [miserly, reckless, steady]) expect(meanFirst(ambitious)).toBeLessThan(meanFirst(other));
  });
});
