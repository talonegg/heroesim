import { afterEach, describe, expect, test, vi } from 'vitest';
import { advance } from '../advance.js';
import type { GameConfig } from '../config.js';
import { createWorld } from '../create.js';
import type { Guild, Guildmaster, World } from '../document.js';
import type { EngineEventOf, TurnEvent } from '../events.js';
import { phases } from '../pipeline.js';
import { hallUpkeepParts, nextHallUpkeepDay, nextWagesDay, wages } from '../selectors.js';
import { dayOf, nightOf } from '../time.js';
import { testDeps, withFacilityUpkeep, withValid } from '../world.test-support.js';
import { guildState } from './guild-state.js';
import { phaseContext } from './phase.js';

const setup = { guildmasterName: 'Aldith Barrowby', guildName: 'The Salt Road Guild', createdAt: 'test' };

afterEach(() => {
  vi.restoreAllMocks();
});

/** Each Facility's upkeep a month at grade 1, pinned in content. */
const priced = withFacilityUpkeep({ infirmary: 10, 'training-yard': 10, quarters: 10 });

/** The figures these tests reason by hand with: wages 5 a Level, the Hall 30, 5 a Hero, every 10 and 30 Days. */
const charges: Partial<GameConfig> = {
  wagePerLevel: 5,
  upkeepEveryDays: 10,
  hallUpkeepEveryDays: 30,
  hallBaseUpkeep: 30,
  hallUpkeepPerHero: 5,
  hallUpkeepHeroExponent: 1,
  improvementUpkeepGradeFactor: 2,
};

/** Every Guildmaster's Traits cleared, so that no factor bears on the Hall's upkeep. */
function untraited(world: World): void {
  for (const guildmaster of Object.values(world.guildmasters) as Guildmaster[]) guildmaster.traits = [];
}

/** A world small enough to reason about by hand: the player and one Rival, one Hero each. */
function smallWorld(overrides: Partial<GameConfig> = {}) {
  const deps = testDeps(
    {
      rivalCount: 1,
      startingRosterSize: 1,
      rivalRosterMin: 1,
      rivalRosterMax: 1,
      ...charges,
      bankruptcyFloor: 0,
      fameFloor: 0,
      ...overrides,
    },
    priced,
  );
  const { document } = createWorld('guild-state', setup, deps);
  untraited(document.world);
  return { world: document.world, deps };
}

/** The entries of `type` among `events`. */
function ofType<Type extends 'guild.wages-paid' | 'guild.hall-upkeep-paid' | 'guild.below-floor' | 'guild.floor-recovered'>(
  events: readonly TurnEvent[],
  type: Type,
) {
  return events.filter((event): event is EngineEventOf<Type> => event.type === type);
}

// DL-298: two charges, the wages every `upkeepEveryDays` and the Hall's upkeep with its Improvements'
// every `hallUpkeepEveryDays`, each for what is there that night, in full, both before the floor.
describe('guildState: the wages and the Hall’s upkeep', () => {
  test('on a wages Day that is not the Hall’s, charges every Guild its wages alone and emits guild.wages-paid', () => {
    const { world, deps } = smallWorld();
    world.turn = nightOf(9); // Day 9: 9 % 10 === 10 - 1 (DL-26)
    const before = structuredClone(world.guilds);

    const events = guildState(world, phaseContext(world, deps));

    const guilds = Object.values(world.guilds);
    expect(events.map((event) => event.type)).toEqual(guilds.map(() => 'guild.wages-paid'));
    for (const guild of guilds) {
      const was = before[guild.id] as Guild;
      // One Hero each, at Level 1.
      expect(guild.wealth).toBe(was.wealth - 5);
      const [event] = ofType(events, 'guild.wages-paid').filter((candidate) => candidate.payload.guildId === guild.id);
      expect(event?.payload).toEqual({ guildId: guild.id, amount: 5, wealthAfter: guild.wealth });
      expect(event?.participants).toEqual([guild.id]);
      expect(event?.milestone).toBe(false);
    }
  });

  test('on Day 29 charges the wages, then the Hall’s upkeep with its parts: the base, the Heroes’ share and each built Facility’s', () => {
    const { world, deps } = smallWorld();
    const [player, rival] = Object.values(world.guilds) as [Guild, Guild];
    player.hall = { infirmary: 2, 'training-yard': 0, quarters: 1 };
    world.turn = nightOf(29);
    const before = { player: player.wealth, rival: rival.wealth };

    const events = guildState(world, phaseContext(world, deps));

    const mine = events.filter((event) => event.participants.includes(player.id));
    expect(mine.map((event) => event.type)).toEqual(['guild.wages-paid', 'guild.hall-upkeep-paid']);
    // The infirmary at grade 2, 10 × 2; the quarters at 1, 10; the training yard at 0, nothing.
    expect(mine[1]?.payload).toEqual({
      guildId: player.id,
      amount: 30 + 5 + 20 + 10,
      wealthAfter: before.player - 5 - 65,
      base: 30,
      heroCount: 1,
      heroes: 5,
      facilities: { infirmary: 20, quarters: 10 },
      traitFactor: 1,
    });
    expect(mine[1]?.milestone).toBe(false);
    expect(player.wealth).toBe(before.player - 5 - 65);
    // A new Guild pays its base and its Heroes' share.
    expect(rival.wealth).toBe(before.rival - 5 - 35);
  });

  test('charges the Hall what the selectors say tonight, the Guildmaster’s factor on the Hall alone, the wages unscaled', () => {
    const { world, deps } = smallWorld();
    const [player] = Object.values(world.guilds) as [Guild];
    player.hall = { infirmary: 3, 'training-yard': 1, quarters: 0 };
    (world.guildmasters[player.guildmasterId] as Guildmaster).traits = ['spendthrift'];
    world.turn = nightOf(59);
    const owedWages = wages(player, world, deps.config);
    const parts = hallUpkeepParts(player, world, deps.config, deps.content);
    const before = player.wealth;

    const events = guildState(world, phaseContext(world, deps)).filter((event) => event.participants.includes(player.id));

    expect(parts.traitFactor).toBe(1.1);
    expect(ofType(events, 'guild.wages-paid')[0]?.payload.amount).toBe(owedWages);
    expect(owedWages).toBe(5);
    const { total, ...named } = parts;
    expect(ofType(events, 'guild.hall-upkeep-paid')[0]?.payload).toEqual({ guildId: player.id, amount: total, wealthAfter: player.wealth, ...named });
    expect(parts.total).toBe(Math.round((30 + 5 + 40 + 10) * 1.1));
    expect(player.wealth).toBe(before - owedWages - parts.total);
  });

  test('charges in full for what is there that night: a Hero signed and a grade built that Day, with no share of the month taken off', () => {
    const { world, deps } = smallWorld();
    const [player, rival] = Object.values(world.guilds) as [Guild, Guild];
    // The Rival's Hero moves to the player's Roster, and the infirmary is built, on Day 29 itself.
    const moved = rival.rosterIds.pop() as Guild['rosterIds'][number];
    player.rosterIds.push(moved);
    player.hall = { ...player.hall, infirmary: 1 };
    world.turn = nightOf(29);
    const before = player.wealth;

    const events = guildState(world, phaseContext(world, deps));

    expect(ofType(events, 'guild.wages-paid').find((event) => event.payload.guildId === player.id)?.payload.amount).toBe(10);
    expect(ofType(events, 'guild.hall-upkeep-paid').find((event) => event.payload.guildId === player.id)?.payload).toMatchObject({
      heroCount: 2,
      heroes: 10,
      facilities: { infirmary: 10 },
      amount: 30 + 10 + 10,
    });
    expect(player.wealth).toBe(before - 10 - 50);
  });

  test('makes no charge and no event on a Day that is neither', () => {
    const { world, deps } = smallWorld();
    world.turn = nightOf(3);
    const before = structuredClone(world.guilds);

    expect(guildState(world, phaseContext(world, deps))).toEqual([]);
    for (const guild of Object.values(world.guilds)) expect(guild.wealth).toBe((before[guild.id] as Guild).wealth);
  });

  test('clamps Fame at fameFloor and leaves Fame above it untouched', () => {
    const { world, deps } = smallWorld({ fameFloor: 0 });
    const [low, high] = Object.values(world.guilds) as [Guild, Guild];
    low.fame = -7;
    high.fame = 12;
    world.turn = nightOf(3); // no charge: the clamp still runs every night

    guildState(world, phaseContext(world, deps));

    expect(low.fame).toBe(0);
    expect(high.fame).toBe(12);
  });

  test('skips a folded Guild entirely: no charge, no belowFloorSince, no Fame clamp', () => {
    const { world, deps } = smallWorld({ bankruptcyFloor: 0, fameFloor: 0 });
    const [folded] = Object.values(world.guilds) as [Guild];
    folded.foldedOnTurn = 1;
    folded.wealth = 2;
    folded.fame = -9;
    world.turn = nightOf(29); // both charges fall, so a Guild in play would pay both

    const events = guildState(world, phaseContext(world, deps));

    expect(folded.wealth).toBe(2);
    expect(folded.belowFloorSince).toBeNull();
    expect(folded.fame).toBe(-9);
    expect(events.some((event) => event.participants.includes(folded.id))).toBe(false);
  });

  test('driven through advance, every Guild pays its wages on Days 9, 19 and 29 and the Hall’s upkeep on Day 29, on the same Turns', () => {
    // The Rival's controller is stilled: it recruits and dispatches each afternoon, moving the Wealth
    // this test watches the charges alone move.
    const rivalControllers = phases.find((phase) => phase.name === 'rivalControllers');
    if (rivalControllers === undefined) throw new Error('No rivalControllers phase');
    vi.spyOn(rivalControllers, 'run').mockReturnValue([]);
    const deps = testDeps({ rivalCount: 1, startingRosterSize: 1, rivalRosterMin: 1, rivalRosterMax: 1, ...charges }, priced);
    let document = createWorld('guild-state-advance', setup, deps).document;
    untraited(document.world);
    const startingWealth = Object.fromEntries(Object.values(document.world.guilds).map((guild): [string, number] => [guild.id, guild.wealth]));

    const events: TurnEvent[] = [];
    while (document.world.turn < nightOf(29)) {
      const result = advance(document, deps);
      document = withValid(result.document, deps);
      events.push(...result.events);
    }

    expect(dayOf(document.world.turn)).toBe(29);
    const guilds = Object.values(document.world.guilds);
    // A Rival paying a Day early, or on another Turn of the Day, fails this.
    expect(ofType(events, 'guild.wages-paid').map((event) => event.turn)).toEqual([9, 19, 29].flatMap((day) => guilds.map(() => nightOf(day))));
    expect(ofType(events, 'guild.hall-upkeep-paid').map((event) => event.turn)).toEqual(guilds.map(() => nightOf(29)));
    for (const guild of guilds) expect(guild.wealth).toBe((startingWealth[guild.id] as number) - 3 * 5 - 35);
  });
});

// DL-112 item 3, DL-298: the phase and the Treasury read one rule for each charge's Day.
describe('the charges’ Days, nextWagesDay and nextHallUpkeepDay', () => {
  test('each charge falls on the night of its next Day from every Turn before it, and on no other night', () => {
    for (const [upkeepEveryDays, hallUpkeepEveryDays] of [
      [10, 30],
      [7, 14],
    ] as const) {
      const { deps } = smallWorld({ upkeepEveryDays, hallUpkeepEveryDays, startingWealth: 100_000 });
      let document = createWorld('charge-days', setup, deps).document;
      const paid = { 'guild.wages-paid': [] as number[], 'guild.hall-upkeep-paid': [] as number[] };
      while (document.world.turn < nightOf(70)) {
        const result = advance(document, deps);
        document = result.document;
        for (const event of result.events) {
          if ((event.type === 'guild.wages-paid' || event.type === 'guild.hall-upkeep-paid') && !paid[event.type].includes(event.turn)) paid[event.type].push(event.turn);
        }
      }
      expect(paid['guild.hall-upkeep-paid'].length).toBeGreaterThan(1);
      expect(paid['guild.wages-paid'].length).toBeGreaterThan(paid['guild.hall-upkeep-paid'].length);
      for (let turn = 0; turn < document.world.turn; turn += 1) {
        const wagesNext = paid['guild.wages-paid'].find((charged) => charged > turn);
        if (wagesNext !== undefined) expect(nightOf(nextWagesDay(turn, deps.config)), `Turn ${turn}`).toBe(wagesNext);
        const hallNext = paid['guild.hall-upkeep-paid'].find((charged) => charged > turn);
        if (hallNext !== undefined) expect(nightOf(nextHallUpkeepDay(turn, deps.config)), `Turn ${turn}`).toBe(hallNext);
      }
    }
  });
});

describe('the Bankruptcy floor heard: guild.below-floor and guild.floor-recovered (DL-85 item 6, DL-101)', () => {
  test('emits guild.below-floor on the night Wealth falls below the floor, with the Day Bankruptcy falls on', () => {
    const { world, deps } = smallWorld({ bankruptcyFloor: 20, bankruptcyGraceDays: 12 });
    const [guild] = Object.values(world.guilds) as [Guild];
    guild.wealth = 19;
    world.turn = nightOf(4); // no charge: the floor is checked every night (DL-26 item 2)

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

  test('falls after the wages that take Wealth below the floor, on the same night', () => {
    const { world, deps } = smallWorld({ bankruptcyFloor: 0, bankruptcyGraceDays: 30 });
    const [guild] = Object.values(world.guilds) as [Guild];
    guild.wealth = 2; // less than the 5 the single Hero's wage costs
    world.turn = nightOf(9);

    const events = guildState(world, phaseContext(world, deps));

    const mine = events.filter((event) => event.participants.includes(guild.id)).map((event) => event.type);
    expect(mine).toEqual(['guild.wages-paid', 'guild.below-floor']);
    expect(ofType(events, 'guild.below-floor')[0]?.payload).toEqual({ guildId: guild.id, wealth: -3, floor: 0, dueDay: 39 });
  });

  test('on Day 29 is tested once, after both charges: the Wealth the Hall’s upkeep leaves, though the wages alone kept it above', () => {
    const { world, deps } = smallWorld({ bankruptcyFloor: 0, bankruptcyGraceDays: 30 });
    const [guild] = Object.values(world.guilds) as [Guild];
    guild.wealth = 20; // the wages, 5, leave 15; the Hall's 35 then 20 below
    world.turn = nightOf(29);

    const events = guildState(world, phaseContext(world, deps)).filter((event) => event.participants.includes(guild.id));

    expect(events.map((event) => event.type)).toEqual(['guild.wages-paid', 'guild.hall-upkeep-paid', 'guild.below-floor']);
    expect(ofType(events, 'guild.wages-paid')[0]?.payload.wealthAfter).toBe(15);
    expect(ofType(events, 'guild.below-floor')[0]?.payload).toEqual({ guildId: guild.id, wealth: -20, floor: 0, dueDay: 59 });
    expect(guild.belowFloorSince).toBe(nightOf(29));
  });

  test('on Day 29 is tested once, after both charges: the wages taking Wealth below and the Hall further give one guild.below-floor, at the last Wealth', () => {
    const { world, deps } = smallWorld({ bankruptcyFloor: 0, bankruptcyGraceDays: 30 });
    const [guild] = Object.values(world.guilds) as [Guild];
    guild.wealth = 3;
    world.turn = nightOf(29);

    const events = guildState(world, phaseContext(world, deps)).filter((event) => event.participants.includes(guild.id));

    expect(events.map((event) => event.type)).toEqual(['guild.wages-paid', 'guild.hall-upkeep-paid', 'guild.below-floor']);
    expect(ofType(events, 'guild.below-floor')[0]?.payload.wealth).toBe(3 - 5 - 35);
  });

  test('says nothing more while Wealth stays below the floor, and guild.floor-recovered when it climbs back', () => {
    const { world, deps } = smallWorld({ bankruptcyFloor: 0 });
    const [guild] = Object.values(world.guilds) as [Guild];
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
    const [player, rival] = Object.values(world.guilds) as [Guild, Guild];
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
