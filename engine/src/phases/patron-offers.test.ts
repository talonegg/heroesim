import { describe, expect, test } from 'vitest';
import type { GameConfig } from '../config.js';
import { createWorld } from '../create.js';
import { compareByCodeUnit, type Guild, type Patron, type World } from '../document.js';
import type { EngineEvent } from '../events.js';
import { regardOnQuestResolved } from '../regard.js';
import { playerGuild } from '../selectors.js';
import { testDeps } from '../world.test-support.js';
import { boardRefresh } from './board-refresh.js';
import { patronState } from './patron-state.js';
import { phaseContext } from './phase.js';

// M4-S5's acceptance: "a Patron whose Quests always fail offers fewer over a year than one whose
// succeed", over 50 seeds. The epic asks for a harness fixture; this is the same measure at the
// engine's level (DL-43): each seed's world plays a year of the phases that decide what a Patron
// offers — the morning's Board refresh, weighted by Patron Regard, and the night's Patron State
// Engine — while the player's Guild takes every Quest two chosen Patrons offer the morning it is
// posted, and every one of the first Patron's fails and every one of the second's succeeds, through
// the writer `questsConclude` calls. The rest expire untaken. Every value it relies on is pinned.

const pinned: Partial<GameConfig> = {
  rivalCount: 0,
  turnsPerYear: 1080,
  boardSize: 6,
  questOfferDays: 3,
  regardMin: -20,
  regardMax: 20,
  regardBands: { hostile: -20, cool: -12, neutral: -4, warm: 4, close: 12 },
  patronRegardOnSuccess: 1,
  patronRegardOnFailure: -2,
  patronRegardOnExpiry: -1,
  patronRegardRecoveryPerYear: 0.5,
  boardRegardWeight: 1,
  influenceFactor: 0.5,
};
const deps = testDeps(pinned);
const setup = { guildmasterName: 'Ada', guildName: 'The Test', createdAt: 'test' };
const seeds = Array.from({ length: 50 }, (_, index) => `offers-${String(index + 1).padStart(4, '0')}`);

/** How many Quests the failing and the succeeding Patron offer over a year of `seed`'s world. */
function yearOfOffers(seed: string): { failing: number; succeeding: number } {
  const { document } = createWorld(seed, setup, deps);
  const world: World = structuredClone(document.world);
  const guild = playerGuild(world) as Guild;
  const [failing, succeeding] = Object.values(world.patrons).sort((a, b) => compareByCodeUnit(a.id, b.id)) as [Patron, Patron];
  const offers = { failing: 0, succeeding: 0 };
  const days = deps.config.turnsPerYear / 3;

  for (let day = 1; day <= days; day += 1) {
    world.turn = 3 * day;
    const morning = phaseContext(world, deps);
    const events: EngineEvent[] = boardRefresh(world, morning);
    for (const event of events) {
      if (event.type !== 'quest.offered') continue;
      if (event.payload.patronId === failing.id) offers.failing += 1;
      if (event.payload.patronId === succeeding.id) offers.succeeding += 1;
    }
    // The player takes and resolves the two Patrons' Quests; the rest stay to expire untaken.
    for (const questId of [...world.board]) {
      const quest = world.quests[questId];
      if (quest === undefined || (quest.patronId !== failing.id && quest.patronId !== succeeding.id)) continue;
      world.board = world.board.filter((id) => id !== questId);
      delete world.quests[questId];
      const succeeded = quest.patronId === succeeding.id;
      regardOnQuestResolved(world, morning, { patronId: quest.patronId, guild, heroIds: [], succeeded });
    }
    world.turn = 3 * day + 2;
    patronState(world, phaseContext(world, deps));
  }
  return offers;
}

describe('Patron Regard weighs on the Board (M4-S5, R22)', () => {
  test('a Patron whose Quests always fail offers fewer over a year than one whose succeed, over 50 seeds', { timeout: 120_000 }, () => {
    const years = seeds.map(yearOfOffers);
    const failing = years.reduce((total, year) => total + year.failing, 0);
    const succeeding = years.reduce((total, year) => total + year.succeeding, 0);
    const fewer = years.filter((year) => year.failing < year.succeeding).length;

    expect(failing).toBeLessThan(succeeding);
    // Not by a hair: the failing Patron falls silent at the scale's bottom while the other is courted.
    expect(failing).toBeLessThan(succeeding / 2);
    expect(fewer).toBe(seeds.length);
  });
});
