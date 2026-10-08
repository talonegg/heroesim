import { afterEach, beforeAll, describe, expect, test } from 'vitest';
import type { GuildId, Guild, WorldDocument } from '../document.js';
import { append } from '../history.js';
import { phaseContext } from '../phases/phase.js';
import { runTurn } from '../pipeline.js';
import { dispositionOf } from '../selectors.js';
import { validate } from '../validate.js';
import { createWorld } from '../create.js';
import { deps, newWatch, rivalsInPlay, ruleProblems, setup, stillPlayer, unwatchPhase, watchPhase, type Watch } from './transfer-generator.test-support.js';

// The first of M6-S3's two boxes (DL-59): over 100 seeds × 20 years, Rival-to-Rival Transfers occur,
// and the Roster-size distribution across Rivals stays within the range a Rival is generated with
// (`rivalRosterMin` to `rivalRosterMax`). The second box, that the phase never changes the player's
// Roster, is `transfer-generator.test.ts`, in `npm test`.
//
// The distribution is held, since v1.1.5's re-close (DL-185), by its floor alone: no Guild's Roster is
// capped, and a Roster grows as far as its Guild's finances support (the owner's answer). The
// Generator's own moves are still held within the range (`ruleProblems`), a bound kept for now
// only as a development measure, to constrain testing load, and to be removed (backlog, DL-185).
//
// Each seed is a default world, four Rivals dealt the four Dispositions (DL-56), the player idle and
// rich (its Guildmaster young enough not to retire), played Turn by Turn on the one world, in place,
// as the Dispositions' and the Rivals' building tests are (DL-56, DL-58), the `transfers` phase
// watched. The box, with the four seeds of Rivals building and buying beside it, takes about fifty
// minutes alone: a harness run, `npm run harness -- transfer-generator`, which `npm test` never plays
// (DL-230). A Rival bids only while it would hire (DL-59), which the test content's Rivals seldom
// would: the Generator dealt in 20 of the 100 seeds, 24 times, so its own count is asserted over the
// hundred.

const years = 20;
const seeds = Array.from({ length: 100 }, (_, index) => `transfer-generator-${index + 1}`);

afterEach(() => {
  unwatchPhase();
});

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

describe(`the Transfer Generator over ${seeds.length} seeds × ${years} years (M6-S3)`, () => {
  let tallies: Tally[] = [];
  beforeAll(() => {
    tallies = seeds.map(sweep);
  }, 7_200 * 1000);

  test('Rival-to-Rival Transfers occur; those the Generator makes go to the more transferAppetite-heavy Rival', () => {
    expect(tallies.reduce((sum, tally) => sum + tally.rivalToRival, 0)).toBeGreaterThan(0);
    for (const tally of tallies) expect(ruleProblems(tally, deps)).toEqual([]);
    // The Generator's own, over the hundred seeds: Rivals seldom would hire (DL-59).
    expect(tallies.reduce((sum, tally) => sum + tally.transfers.length, 0)).toBeGreaterThan(0);
  });

  test("the Roster-size distribution across Rivals keeps to the generation range's floor, and is not capped at its top", () => {
    const { rivalRosterMin: min } = deps.config;
    // The Generator's own moves never take a Roster out of the range (`ruleProblems`, above), a
    // bound kept for now only to constrain testing load, to be removed (backlog, DL-185). At every
    // year's end, across the seeds' Rivals in play, the distribution's median lies at the range's floor
    // or above, and so does the mean of every year-end: Deaths, Retirements, the afternoon's Transfers
    // and folds take single Rosters below it, which the Generator does not undo (DL-59), and a Rival
    // below the floor hires back towards it by need (DL-60), so the distribution does not fall below it.
    // Above the range nothing is held: no Guild's Roster is capped, and a Roster grows as far as its
    // Guild's finances support (the owner's answer at v1.1.5's re-close, DL-185). DL-59 read the box as
    // each year's median and mean within the range; v1.1.4-S6 dropped a year's mean (DL-157), v1.1.5-S13
    // the median of the four seeds' years (DL-184), and DL-185 every check at the top. With the XP split
    // (DL-182, DL-184) the Rivals here keep more Heroes: over the box's hundred seeds the mean of every
    // year-end is 9.17 and the largest 33, each year's median reaching 8, the range's top, in years 4 to
    // 7 (S13's verification, DL-184).
    const every: number[] = [];
    for (let year = 0; year < years; year += 1) {
      const sizes = tallies.flatMap((tally) => tally.yearEnds[year] ?? []);
      expect(sizes.length, `year ${year + 1}`).toBeGreaterThan(0);
      expect(median(sizes), `year ${year + 1} median`).toBeGreaterThanOrEqual(min);
      every.push(...sizes);
    }
    expect(median(every)).toBeGreaterThanOrEqual(min);
    expect(mean(every)).toBeGreaterThanOrEqual(min);
  });

  test("the player's Roster is never changed by the phase, on any night of twenty years", () => {
    for (const tally of tallies) {
      // One run each night: a third of the Turns played, which start on a morning (DL-24).
      expect(tally.runs, tally.seed).toBe((years * deps.config.turnsPerYear) / 3);
      expect(tally.playerChanged, tally.seed).toBe(0);
    }
  });
});
