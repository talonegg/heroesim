import { afterEach, describe, expect, test } from 'vitest';
import { createWorld } from '../create.js';
import { phaseContext } from '../phases/phase.js';
import { nightOf } from '../time.js';
import { testDeps } from '../world.test-support.js';
import { deps, newWatch, pins, rivalsInPlay, ruleProblems, setup, stillPlayer, transfersPhase, unwatchPhase, watchPhase } from './transfer-generator.test-support.js';

// The second of M6-S3's two boxes (DL-59): the player's Roster is never changed by the Transfer
// Generator's phase, run alone on a hundred seeds' worlds, every Rival rich enough to hire and to
// pay. The first box, a hundred seeds played for twenty years, is a harness run,
// `transfer-generator.harness.test.ts` (DL-230).

afterEach(() => {
  unwatchPhase();
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
      expect(ruleProblems(watch, eager)).toEqual([]);
    }
    // The phase was at work: the Rivals dealt among themselves in most seeds.
    expect(watches.filter((watch) => watch.transfers.length > 0).length).toBeGreaterThan(50);
  });
});
