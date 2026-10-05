import { loadContent } from '@heroesim/content/node';
import { compareByCodeUnit, createWorld, defaultConfig, retirementTurn, type EngineDeps, type Guild } from '@heroesim/engine';
import { append, makeId } from '@heroesim/engine/testing';
import { describe, expect, test } from 'vitest';
import { harnessSetup } from './creation.js';
import { machine } from './report.js';
import { seedNames } from './seeds.js';
import {
  foldedAmong,
  probeInParallel,
  probeSeeds,
  setFirstRivalGuildmasterAge,
  successionProbeAge,
  successionReport,
  type ProbeGame,
} from './succession.js';

// M9-F1 (DL-113 item 7): the Succession probe's option, over a few seeds. The first Rival's
// Guildmaster, in id order, is set to 50 at founding, and the games played. The probe proper, 50
// seeds × 12 years of 1,080 Turns, is M9-F6's to run (`HEROESIM_PROBE=succession npm run harness`);
// here a year is 30 Turns, so a Guildmaster at 50 retires on the night of Turn 330, and twelve
// years are 360 Turns.

const content = loadContent();
const shortYears: EngineDeps = { config: { ...defaultConfig, turnsPerYear: 30, rivalCount: 3 }, content };
const years = 12;

/** The Rivals of a created world, in id order. */
function rivalsOf(world: { guilds: Record<string, Guild> }): Guild[] {
  return Object.values(world.guilds)
    .filter((guild) => guild.controller.kind === 'rival')
    .sort((a, b) => compareByCodeUnit(a.id, b.id));
}

describe('setFirstRivalGuildmasterAge', () => {
  test("sets the first Rival's Guildmaster, in id order, to the age at founding, and changes nothing else", () => {
    const { document } = createWorld('probe-set', harnessSetup, shortYears);
    const before = structuredClone(document);
    const [first] = rivalsOf(document.world) as [Guild];

    expect(setFirstRivalGuildmasterAge(document, successionProbeAge, shortYears)).toBe(first.id);

    expect(document.world.guildmasters[first.guildmasterId]?.ageAtEntry).toBe(50);
    const was = before.world.guildmasters[first.guildmasterId];
    if (was !== undefined) was.ageAtEntry = 50;
    expect(document).toEqual(before);
  });

  test('refuses an age outside the range a Guildmaster starts in: the probe sets a legal age, never an illegal one', () => {
    const { document } = createWorld('probe-set', harnessSetup, shortYears);
    expect(() => setFirstRivalGuildmasterAge(document, 51, shortYears)).toThrow(RangeError);
    expect(() => setFirstRivalGuildmasterAge(document, 20, shortYears)).toThrow(RangeError);
  });
});

describe('foldedAmong', () => {
  test('counts the folds of the Guilds named from the Turn given, the same night included, and no other Guild', () => {
    const { document } = createWorld('probe-folds', harnessSetup, shortYears);
    const [a, b] = rivalsOf(document.world) as [Guild, Guild];
    const replacement = makeId('guilds', 9);
    const fold = (turn: number, guildId: string) =>
      append(document.history, { turn, type: 'guild.folded', participants: [], labels: {}, milestone: true, payload: { guildId, reason: 'bankruptcy' } });
    fold(100, a.id); // before the Turn: not counted
    fold(200, b.id); // on it: counted
    fold(260, replacement); // a Rival founded after: not among those named

    expect(foldedAmong(document, [a.id, b.id], 200)).toBe(1);
    expect(foldedAmong(document, [a.id, b.id], 100)).toBe(2);
    expect(foldedAmong(document, [a.id, b.id, replacement], 201)).toBe(1);
  });
});

describe('the Succession probe over a few seeds', () => {
  const seeds = seedNames(3);
  const games = probeSeeds(seeds, shortYears, { years, age: successionProbeAge });

  test('shows one Succession of the first Rival for each game whose Rival is still in play at 61, on the Turn retirementTurn gives', () => {
    const retires = retirementTurn({ ageAtEntry: 50, enteredTurn: 0 }, shortYears.config);
    expect(retires).toBe(332);
    let succeeded = 0;
    for (const game of games) {
      expect(game.retirementTurn, game.seed).toBe(retires);
      const own = game.successions.filter((succession) => succession.guildId === game.rivalId);
      const inPlay = game.rivalFoldedOnTurn === null || game.rivalFoldedOnTurn >= retires;
      if (inPlay && game.turnsPlayed >= retires) {
        succeeded += 1;
        expect(own.map((it) => [it.turn, it.guildmasterId, it.age]), game.seed).toEqual([[retires, game.guildmasterId, 61]]);
      } else {
        expect(own, game.seed).toEqual([]);
      }
    }
    expect(succeeded).toBeGreaterThan(0);
  });

  test('the Guild carries on across it: its Roster, Wealth, Fame and Hall as they were, and the Regard held for it through its Guildmaster neutral', () => {
    for (const game of games.filter((it) => it.after !== null)) {
      const { eve, after } = game as Required<ProbeGame> & { eve: NonNullable<ProbeGame['eve']>; after: NonNullable<ProbeGame['after']> };
      expect(after.guildmasterId, game.seed).not.toBe(eve.guildmasterId);
      expect(after.turn - eve.turn, game.seed).toBe(1);
      expect(after.regardThroughGuildmaster, game.seed).toEqual({ held: 0, mean: 0, of: after.regardThroughGuildmaster.of });
      expect(after.guildmasterRegardHeld, game.seed).toBe(0);
      // A night's Quests and Upkeep may move Wealth and Fame; the Roster and the Hall are its own.
      expect(after.hallGrades, game.seed).toBe(eve.hallGrades);
    }
  });

  test('reports the Successions, the Guild across them, the Regard and the folds after, beside the other Rivals', () => {
    const report = successionReport(games, {
      deps: shortYears,
      years,
      age: successionProbeAge,
      machine: machine(),
      startedAt: new Date(2026, 8, 29, 12, 0, 0),
    });
    expect(report).toContain('# M9 harness report: the Succession probe, a Rival Guildmaster at 50');
    for (const heading of ['## Summary', '## The Successions', '## The Rival across its Succession', '## Regard for the Guild through its Guildmaster', '## Folds after the Succession']) {
      expect(report).toContain(heading);
    }
    for (const game of games) expect(report).toContain(game.seed);
  });

  // Child processes, each starting tsx and loading the content, as sweep.test.ts's: given as long. Since
  // v1.1.6-S2 (DL-186 item 20) each seed is a child of its own, at most `workers` at once, the next as
  // one ends, as the play sweep's are: three seeds in two processes come back in seed order.
  test('plays the same games shared among child processes, one seed a child, more seeds than processes', { timeout: 120_000 }, async () => {
    const parallel = await probeInParallel(seeds, shortYears, { years, age: successionProbeAge, workers: 2 });
    expect(parallel).toEqual(games);
  });
});
