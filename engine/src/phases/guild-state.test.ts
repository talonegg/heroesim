import { describe, expect, test } from 'vitest';
import { advance } from '../advance.js';
import type { GameConfig } from '../config.js';
import { createWorld } from '../create.js';
import type { Guild } from '../document.js';
import { dayOf, nightOf } from '../time.js';
import { testDeps, withValid } from '../world.test-support.js';
import { guildState } from './guild-state.js';
import { phaseContext } from './phase.js';

const setup = { guildmasterName: 'Aldith Barrowby', guildName: 'The Salt Road Guild', createdAt: 'test' };

/** A world small enough to reason about by hand: the player and one Rival, one Hero each. */
function smallWorld(overrides: Partial<GameConfig> = {}) {
  const deps = testDeps({
    rivalCount: 1,
    startingRosterSize: 1,
    rivalRosterMin: 1,
    rivalRosterMax: 1,
    wagePerLevel: 5,
    hallMaintenancePerGrade: 10,
    upkeepEveryDays: 10,
    bankruptcyFloor: 0,
    fameFloor: 0,
    ...overrides,
  });
  const { document } = createWorld('guild-state', setup, deps);
  return { world: document.world, deps };
}

describe('guildState', () => {
  test('on the Upkeep Day, deducts Upkeep from every Guild alike and emits guild.upkeep-paid', () => {
    const { world, deps } = smallWorld();
    world.turn = nightOf(9); // Day 9: 9 % 10 === 10 - 1 (DL-26)
    const before = structuredClone(world.guilds);
    const ctx = phaseContext(world, deps);

    const events = guildState(world, ctx);

    const guilds = Object.values(world.guilds);
    expect(events).toHaveLength(guilds.length);
    for (const guild of guilds) {
      const was = before[guild.id] as Guild;
      // Every starting Hero is Level 1 and every Hall grade is 0 (INPUTS 4.6): wages alone.
      const expectedAmount = 5 * was.rosterIds.length;
      expect(guild.wealth).toBe(was.wealth - expectedAmount);
      const event = events.find((candidate) => candidate.type === 'guild.upkeep-paid' && candidate.payload.guildId === guild.id);
      expect(event?.payload).toEqual({ guildId: guild.id, amount: expectedAmount, wealthAfter: guild.wealth });
      expect(event?.participants).toContain(guild.id);
    }
  });

  test('deducts Upkeep from the player and a Rival on the same Day, driven through advance', () => {
    const deps = testDeps({
      rivalCount: 1,
      startingRosterSize: 1,
      rivalRosterMin: 1,
      rivalRosterMax: 1,
      wagePerLevel: 5,
      hallMaintenancePerGrade: 10,
      upkeepEveryDays: 10,
    });
    let document = createWorld('guild-state-advance', setup, deps).document;
    const startingWealth: Record<string, number> = Object.fromEntries(
      Object.values(document.world.guilds).map((guild): [string, number] => [guild.id, guild.wealth]),
    );

    const target = nightOf(9); // the first Upkeep Day's night Turn
    let allEvents: { type: string }[] = [];
    for (let turn = 1; turn <= target; turn += 1) {
      const result = advance(document, deps);
      document = withValid(result.document, deps);
      allEvents = allEvents.concat(result.events);
    }

    expect(dayOf(document.world.turn)).toBe(9);
    const paidEvents = allEvents.filter((event) => event.type === 'guild.upkeep-paid');
    const guilds = Object.values(document.world.guilds);
    expect(paidEvents).toHaveLength(guilds.length);
    for (const guild of guilds) {
      const before = startingWealth[guild.id] as number;
      expect(guild.wealth).toBe(before - 5); // one Hero each, Level 1, no Hall grade
    }
  });

  test('makes no deduction and no event on a Day that is not an Upkeep Day', () => {
    const { world, deps } = smallWorld();
    world.turn = nightOf(3); // 3 % 10 !== 9
    const before = structuredClone(world.guilds);
    const ctx = phaseContext(world, deps);

    const events = guildState(world, ctx);

    expect(events).toEqual([]);
    for (const guild of Object.values(world.guilds)) {
      expect(guild.wealth).toBe((before[guild.id] as Guild).wealth);
    }
  });

  test('sets belowFloorSince to this Turn when Wealth falls below the floor, and clears it on recovery', () => {
    const { world, deps } = smallWorld({ bankruptcyFloor: 0 });
    const [guild] = Object.values(world.guilds);
    if (guild === undefined) throw new Error('no Guild');
    guild.wealth = 2; // less than the 5 Wealth the single Hero's wage costs
    world.turn = nightOf(9);

    guildState(world, phaseContext(world, deps));
    expect(guild.wealth).toBeLessThan(0);
    expect(guild.belowFloorSince).toBe(nightOf(9));

    // A later Turn, off the Upkeep Day, where Wealth has recovered above the floor.
    guild.wealth = 50;
    world.turn = nightOf(10);
    guildState(world, phaseContext(world, deps));

    expect(guild.belowFloorSince).toBeNull();
  });

  test('does not move belowFloorSince a second time while Wealth stays below the floor', () => {
    const { world, deps } = smallWorld({ bankruptcyFloor: 0 });
    const [guild] = Object.values(world.guilds);
    if (guild === undefined) throw new Error('no Guild');
    guild.wealth = -100;
    world.turn = nightOf(3);
    guildState(world, phaseContext(world, deps));
    expect(guild.belowFloorSince).toBe(nightOf(3));

    guild.wealth = -200; // still below the floor
    world.turn = nightOf(4);
    guildState(world, phaseContext(world, deps));

    expect(guild.belowFloorSince).toBe(nightOf(3)); // unchanged: it was already set
  });

  test('clamps Fame at fameFloor and leaves Fame above it untouched', () => {
    const { world, deps } = smallWorld({ fameFloor: 0 });
    const [low, ...rest] = Object.values(world.guilds);
    const high = rest[0];
    if (low === undefined || high === undefined) throw new Error('need two Guilds');
    low.fame = -7;
    high.fame = 12;
    world.turn = nightOf(3); // not an Upkeep Day: the clamp still runs every night

    guildState(world, phaseContext(world, deps));

    expect(low.fame).toBe(0);
    expect(high.fame).toBe(12);
  });

  test('skips a folded Guild entirely: no Upkeep, no belowFloorSince, no Fame clamp', () => {
    const { world, deps } = smallWorld({ bankruptcyFloor: 0, fameFloor: 0 });
    const [folded] = Object.values(world.guilds);
    if (folded === undefined) throw new Error('no Guild');
    folded.foldedOnTurn = 1;
    folded.wealth = 2;
    folded.fame = -9;
    const wealthBefore = folded.wealth;
    world.turn = nightOf(9); // an Upkeep Day, so a non-folded Guild would be charged

    const events = guildState(world, phaseContext(world, deps));

    expect(folded.wealth).toBe(wealthBefore);
    expect(folded.belowFloorSince).toBeNull();
    expect(folded.fame).toBe(-9);
    expect(events.some((event) => event.type === 'guild.upkeep-paid' && event.payload.guildId === folded.id)).toBe(false);
  });
});
