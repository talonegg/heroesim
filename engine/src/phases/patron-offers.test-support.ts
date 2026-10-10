// The Patron Regard box (DL-43): "a Patron whose Quests always fail offers fewer over a year than one
// whose succeed". Each seed's world plays a year of the phases that decide what a Patron offers — the
// morning's Board refresh, weighted by Patron Regard, and the night's Patron State Engine — while the
// player's Guild takes every Quest two chosen Patrons offer the morning it is posted, and every one of
// the first Patron's fails and every one of the second's succeeds, through the writer `questsConclude`
// calls. The rest expire untaken. Every value it relies on is pinned. `patron-offers.test.ts` plays
// the first 10 seeds in `npm test`; `patron-offers.harness.test.ts` the box's 50, run apart by
// `npm run harness` as DL-230's boxes are (DL-246).

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

export const pinned: Partial<GameConfig> = {
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
export const deps = testDeps(pinned);
export const setup = { guildmasterName: 'Ada', guildName: 'The Test', createdAt: 'test' };
/** The box's seeds, the first `count` of them. */
export const boxSeeds = (count: number): string[] => Array.from({ length: count }, (_, index) => `offers-${String(index + 1).padStart(4, '0')}`);

/** How many Quests the failing and the succeeding Patron offer over a year of `seed`'s world. */
export function yearOfOffers(seed: string): { failing: number; succeeding: number } {
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
      const succeeded = quest.patronId === succeeding.id;
      regardOnQuestResolved(world, morning, { questId, patronId: quest.patronId, guild, heroIds: [], succeeded });
      world.board = world.board.filter((id) => id !== questId);
      delete world.quests[questId];
    }
    world.turn = 3 * day + 2;
    patronState(world, phaseContext(world, deps));
  }
  return offers;
}

/** The years of `seeds`: what the failing and the succeeding Patron offered in all, and in how many seeds the failing one offered fewer. */
export function offersOver(seeds: readonly string[]): { failing: number; succeeding: number; fewer: number } {
  const years = seeds.map(yearOfOffers);
  return {
    failing: years.reduce((total, year) => total + year.failing, 0),
    succeeding: years.reduce((total, year) => total + year.succeeding, 0),
    fewer: years.filter((year) => year.failing < year.succeeding).length,
  };
}
