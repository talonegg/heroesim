import { afterEach, describe, expect, test, vi } from 'vitest';
import { advance } from '../advance.js';
import type { GameConfig } from '../config.js';
import { createWorld } from '../create.js';
import type { Guild } from '../document.js';
import type { EngineEventOf, TurnEvent } from '../events.js';
import { phases } from '../pipeline.js';
import { nextUpkeepDay } from '../selectors.js';
import { dayOf, nightOf } from '../time.js';
import { testDeps, withValid } from '../world.test-support.js';
import { guildState } from './guild-state.js';
import { phaseContext } from './phase.js';

const setup = { guildmasterName: 'Aldith Barrowby', guildName: 'The Salt Road Guild', createdAt: 'test' };

afterEach(() => {
  vi.restoreAllMocks();
});

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

  test('deducts Upkeep from the player and a Rival on the same Turn, the Upkeep night, driven through advance', () => {
    // The Rival's controller is stilled: it recruits and dispatches each afternoon,
    // moving the Wealth this test watches Upkeep alone move.
    const rivalControllers = phases.find((phase) => phase.name === 'rivalControllers');
    if (rivalControllers === undefined) throw new Error('No rivalControllers phase');
    vi.spyOn(rivalControllers, 'run').mockReturnValue([]);
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

    const target = nightOf(9); // the first Upkeep Day's night Turn (DL-26)
    let allEvents: TurnEvent[] = [];
    for (let turn = 1; turn <= target; turn += 1) {
      const result = advance(document, deps);
      document = withValid(result.document, deps);
      allEvents = allEvents.concat(result.events);
    }

    expect(dayOf(document.world.turn)).toBe(9);
    const paidEvents = allEvents.filter(
      (event): event is EngineEventOf<'guild.upkeep-paid'> => event.type === 'guild.upkeep-paid',
    );
    const guilds = Object.values(document.world.guilds);
    expect(paidEvents).toHaveLength(guilds.length);
    // Every Guild's Upkeep falls on the same Turn, and that Turn is the Upkeep night DL-26's
    // formula gives — not merely the same Day: a Rival paying a Day early must fail this.
    for (const event of paidEvents) {
      expect(event.turn).toBe(target);
    }
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

// DL-112 item 3: the phase and the Treasury read one rule for the Upkeep Day.
describe('the Upkeep Day, nextUpkeepDay', () => {
  test('Upkeep is charged on the night of nextUpkeepDay from every Turn before it, and on no other night', () => {
    for (const upkeepEveryDays of [10, 7]) {
      const { deps } = smallWorld({ upkeepEveryDays, startingWealth: 100_000 });
      let document = createWorld('upkeep-day', setup, deps).document;
      const paid: number[] = [];
      while (document.world.turn < nightOf(40)) {
        const result = advance(document, deps);
        document = result.document;
        for (const event of result.events) if (event.type === 'guild.upkeep-paid' && !paid.includes(event.turn)) paid.push(event.turn);
      }
      expect(paid.length).toBeGreaterThan(2);
      for (let turn = 0; turn < document.world.turn; turn += 1) {
        const next = paid.find((charged) => charged > turn);
        if (next !== undefined) expect(nightOf(nextUpkeepDay(turn, deps.config)), `Turn ${turn}`).toBe(next);
      }
    }
  });
});

describe('the Bankruptcy floor heard: guild.below-floor and guild.floor-recovered (DL-85 item 6, DL-101)', () => {
  /** The events of `type` among `events`. */
  function ofType<Type extends 'guild.below-floor' | 'guild.floor-recovered'>(events: readonly TurnEvent[], type: Type) {
    return events.filter((event): event is EngineEventOf<Type> => event.type === type);
  }

  test('emits guild.below-floor on the night Wealth falls below the floor, with the Day Bankruptcy falls on', () => {
    const { world, deps } = smallWorld({ bankruptcyFloor: 20, bankruptcyGraceDays: 12 });
    const [guild] = Object.values(world.guilds);
    if (guild === undefined) throw new Error('no Guild');
    guild.wealth = 19;
    world.turn = nightOf(4); // not an Upkeep Day: the floor is checked every night (DL-26 item 2)

    const events = guildState(world, phaseContext(world, deps));

    const below = ofType(events, 'guild.below-floor');
    expect(below).toHaveLength(1);
    // Day 4 plus the grace of 12: the night the ending check would end it (endings.ts, DL-95).
    expect(below[0]?.payload).toEqual({ guildId: guild.id, wealth: 19, floor: 20, dueDay: 16 });
    expect(below[0]?.participants).toEqual([guild.id]);
    expect(below[0]?.turn).toBe(nightOf(4));
    expect(below[0]?.milestone).toBe(false);
    expect(guild.belowFloorSince).toBe(nightOf(4));
  });

  test('falls after the Upkeep that takes Wealth below the floor, on the same night', () => {
    const { world, deps } = smallWorld({ bankruptcyFloor: 0, bankruptcyGraceDays: 30 });
    const [guild] = Object.values(world.guilds);
    if (guild === undefined) throw new Error('no Guild');
    guild.wealth = 2; // less than the 5 Wealth the single Hero's wage costs
    world.turn = nightOf(9);

    const events = guildState(world, phaseContext(world, deps));

    const mine = events.filter((event) => event.participants.includes(guild.id)).map((event) => event.type);
    expect(mine).toEqual(['guild.upkeep-paid', 'guild.below-floor']);
    expect(ofType(events, 'guild.below-floor')[0]?.payload).toEqual({ guildId: guild.id, wealth: -3, floor: 0, dueDay: 39 });
  });

  test('says nothing more while Wealth stays below the floor, and guild.floor-recovered when it climbs back', () => {
    const { world, deps } = smallWorld({ bankruptcyFloor: 0 });
    const [guild] = Object.values(world.guilds);
    if (guild === undefined) throw new Error('no Guild');
    guild.wealth = -100;
    world.turn = nightOf(3);
    expect(ofType(guildState(world, phaseContext(world, deps)), 'guild.below-floor')).toHaveLength(1);

    world.turn = nightOf(4);
    guild.wealth = -50;
    expect(guildState(world, phaseContext(world, deps))).toEqual([]);

    // Back to the floor itself: at or above it is not below it.
    world.turn = nightOf(5);
    guild.wealth = 0;
    const events = guildState(world, phaseContext(world, deps));

    expect(events.map((event) => event.type)).toEqual(['guild.floor-recovered']);
    expect(ofType(events, 'guild.floor-recovered')[0]?.payload).toEqual({
      guildId: guild.id,
      wealth: 0,
      floor: 0,
      belowFloorSince: nightOf(3),
    });
    expect(ofType(events, 'guild.floor-recovered')[0]?.milestone).toBe(false);
    expect(guild.belowFloorSince).toBeNull();

    // Above the floor and staying there: nothing.
    world.turn = nightOf(6);
    expect(guildState(world, phaseContext(world, deps))).toEqual([]);
  });

  test('is heard for every Guild alike, the player and a Rival (ADR-0002), and never for a folded Guild', () => {
    const { world, deps } = smallWorld({ bankruptcyFloor: 0 });
    const [player, rival] = Object.values(world.guilds);
    if (player === undefined || rival === undefined) throw new Error('need two Guilds');
    player.wealth = -1;
    rival.wealth = -1;
    world.turn = nightOf(3);

    const both = ofType(guildState(world, phaseContext(world, deps)), 'guild.below-floor');
    expect(both.map((event) => event.payload.guildId).sort()).toEqual([player.id, rival.id].sort());

    rival.foldedOnTurn = nightOf(3);
    rival.wealth = 500;
    player.wealth = 500;
    world.turn = nightOf(4);
    const recovered = ofType(guildState(world, phaseContext(world, deps)), 'guild.floor-recovered');
    expect(recovered.map((event) => event.payload.guildId)).toEqual([player.id]);
  });

  test('played through advance, the Guild named falls below on one night and recovers on another, as belowFloorSince says', () => {
    const deps = testDeps({ bankruptcyFloor: 0, bankruptcyGraceDays: 30 });
    let document = createWorld('guild-state-heard', setup, deps).document;
    const guild = Object.values(document.world.guilds).find((row) => row.controller.kind === 'player') as Guild;
    document = structuredClone(document);
    (document.world.guilds[guild.id] as Guild).wealth = -10;
    const events: TurnEvent[] = [];
    while (document.world.guilds[guild.id]?.belowFloorSince === null) {
      const turn = advance(document, deps);
      document = withValid(turn.document, deps);
      events.push(...turn.events);
    }
    const since = document.world.guilds[guild.id]?.belowFloorSince as number;
    const [below] = ofType(events, 'guild.below-floor').filter((event) => event.payload.guildId === guild.id);
    expect(below?.turn).toBe(since);
    expect(below?.payload.dueDay).toBe(dayOf(since) + 30);

    (document.world.guilds[guild.id] as Guild).wealth = 10_000;
    const night = advance(advance(advance(document, deps).document, deps).document, deps);
    const recovered = ofType(night.events, 'guild.floor-recovered');
    expect(recovered.map((event) => event.payload.guildId)).toEqual([guild.id]);
    expect(withValid(night.document, deps).world.guilds[guild.id]?.belowFloorSince).toBeNull();
    expect(document.history.byType['guild.below-floor']?.length ?? 0).toBeGreaterThan(0);
  });
});
