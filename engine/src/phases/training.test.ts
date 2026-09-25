import { describe, expect, test } from 'vitest';
import { dispatch } from '../actions/dispatch.js';
import { advance } from '../advance.js';
import type { EngineDeps, GameConfig } from '../config.js';
import { createWorld } from '../create.js';
import type { Guild, Hero, HeroId, Quest, World, WorldDocument } from '../document.js';
import type { EngineEvent, EngineEventOf, EngineEventType } from '../events.js';
import { playerGuild } from '../selectors.js';
import { nightOf, timeOfDay } from '../time.js';
import { testDeps, withValid } from '../world.test-support.js';
import { phaseContext } from './phase.js';
import { training } from './training.js';

// M3-S2: the night phase `training`, the training yard's XP (DL-36). The yard's grade is set on the
// Hall directly: M3-S6's `build` raises it in play.

const setup = { guildmasterName: 'Ada', guildName: 'The Test', createdAt: 'test' };

/**
 * INPUTS 5.1's training XP and 5.2's curve, pinned. No Rivals, whose Parties would blur what a test
 * watches (DL-30 item 11); Wealth enough that no Upkeep bankrupts the Guild in a year; and no
 * Retirement, of a Hero or the Guildmaster, to take a Hero off the Roster.
 */
function soloDeps(overrides: Partial<GameConfig> = {}): EngineDeps {
  return testDeps({
    rivalCount: 0,
    turnsPerYear: 1080,
    startingWealth: 10_000_000,
    heroRetirementChancePerYear: 0,
    guildmasterRetirementAge: 200,
    xpPerTrainingDay: 2,
    xpCurveBase: 100,
    xpCurveExponent: 2,
    ...overrides,
  });
}

const ofType = <Type extends EngineEventType>(events: readonly EngineEvent[], type: Type): EngineEventOf<Type>[] =>
  events.filter((event): event is EngineEventOf<Type> => event.type === type);

const hero = (world: World, id: HeroId): Hero => world.heroes[id] as Hero;
const player = (world: World): Guild => playerGuild(world) as Guild;

/** Advances to Turn `turn`, validating the document it stops at, and returns the events of the Turns played. */
function playTo(document: WorldDocument, turn: number, deps: EngineDeps): { document: WorldDocument; events: EngineEvent[] } {
  let current = document;
  const events: EngineEvent[] = [];
  while (current.world.turn < turn) {
    const result = advance(current, deps);
    current = result.document;
    events.push(...result.events);
  }
  return { document: withValid(current, deps), events };
}

/** A created world whose player's training yard is at `grade`. */
function withYard(seed: string, grade: number, deps: EngineDeps): WorldDocument {
  const { document } = createWorld(seed, setup, deps);
  player(document.world).hall.trainingYard = grade;
  return withValid(document, deps);
}

/** Runs the phase alone on `world` on the night of Day `day`. */
function night(world: World, day: number, deps: EngineDeps): EngineEvent[] {
  world.turn = nightOf(day);
  return training(world, phaseContext(world, deps));
}

const xpOf = (world: World, ids: readonly HeroId[]): number[] => ids.map((id) => hero(world, id).xp);

describe('training', () => {
  test('a Hero idle at grade 1 for a year has gained 360 × xpPerTrainingDay XP', () => {
    const deps = soloDeps();
    const start = withYard('idle-year', 1, deps);
    const roster = [...player(start.world).rosterIds];
    expect(xpOf(start.world, roster).every((xp) => xp === 0)).toBe(true);

    const { document, events } = playTo(start, deps.config.turnsPerYear, deps);

    // A year of 1,080 Turns from the morning of Day 0 holds the nights of Days 0 to 359.
    const nights = Array.from({ length: deps.config.turnsPerYear }, (_, index) => index + 1).filter(
      (turn) => timeOfDay(turn) === 'night',
    );
    expect(nights).toHaveLength(360);
    // Idle every night: no Party sent, no Injury, and the Roster whole.
    expect(ofType(events, 'quest.taken')).toEqual([]);
    expect(ofType(events, 'hero.injured')).toEqual([]);
    expect(player(document.world).rosterIds).toEqual(roster);
    expect(xpOf(document.world, roster)).toEqual(roster.map(() => 360 * 2));
    // Training XP emits nothing of its own; the Levels it reached are entries (500 XP is Level 3).
    expect(ofType(events, 'hero.xp-gained')).toEqual([]);
    expect(roster.map((id) => hero(document.world, id).level)).toEqual(roster.map(() => 3));
    expect(ofType(events, 'hero.levelled')).toHaveLength(2 * roster.length);
  });

  test('gives xpPerTrainingDay × the grade a night, and nothing at grade 0', () => {
    for (const [grade, perNight] of [
      [0, 0],
      [1, 3],
      [2, 6],
      [3, 9],
    ] as const) {
      const deps = soloDeps({ xpPerTrainingDay: 3 });
      const { world } = withYard(`grade-${grade}`, grade, deps);
      const roster = [...player(world).rosterIds];

      for (let day = 0; day < 5; day += 1) expect(night(world, day, deps)).toEqual([]);

      expect(xpOf(world, roster)).toEqual(roster.map(() => 5 * perNight));
    }
  });

  test('an injured Hero or one in a Party gains no training XP', () => {
    const deps = soloDeps();
    const { world } = withYard('unfit', 2, deps);
    const [injured, away, idle] = player(world).rosterIds as [HeroId, HeroId, HeroId];
    hero(world, injured).injury = { typeKey: 'bruised-ribs', healsOnTurn: nightOf(40) };
    hero(world, away).partyId = 'party-000099' as Hero['partyId'];

    for (let day = 0; day < 10; day += 1) night(world, day, deps);

    expect(xpOf(world, [injured, away, idle])).toEqual([0, 0, 10 * 2 * 2]);
  });

  test('a Hero away on a Quest trains on none of its nights, the night they leave and the night they return included', () => {
    const deps = soloDeps({ stubDeathChance: { fail: 0, success: 0, strong: 0 }, stubInjuryChance: { fail: 0, success: 0, strong: 0 } });
    const start = withYard('away', 1, deps);
    const open = start.world.board
      .map((id) => start.world.quests[id] as Quest)
      .find(({ requirements: { classKey, skillKey, partySizeMin } }) => classKey === undefined && skillKey === undefined && partySizeMin <= 1);
    if (open === undefined) throw new Error('No Quest a lone Hero may take on the Board');
    const [sentId, homeId] = player(start.world).rosterIds as [HeroId, HeroId];
    const sent = dispatch(start, { guildId: player(start.world).id, questId: open.id, heroIds: [sentId] }, deps);
    if (!sent.ok) throw new Error(`Refused: ${sent.rejection.reason}`);
    const returnsOnTurn = Object.values(sent.document.world.parties)[0]?.returnsOnTurn ?? Number.NaN;

    const { document, events } = playTo(sent.document, returnsOnTurn, deps);

    // Away from the night of Day 0 to its return night: only the Quest's XP.
    const questXp = ofType(events, 'hero.xp-gained').reduce((sum, event) => sum + event.payload.amount, 0);
    expect(questXp).toBeGreaterThan(0);
    expect(hero(document.world, sentId).xp).toBe(questXp);
    const nights = (returnsOnTurn - nightOf(0)) / 3 + 1;
    expect(hero(document.world, homeId).xp).toBe(nights * 2);

    // Home, the Hero trains from the next night.
    const next = playTo(document, returnsOnTurn + 3, deps);
    expect(hero(next.document.world, sentId).xp).toBe(questXp + 2);
  });

  test('an Injury healing tonight still keeps the Hero from training tonight; they train from the next', () => {
    const deps = soloDeps();
    const start = withYard('healing', 1, deps);
    const [heroId] = player(start.world).rosterIds as [HeroId];
    hero(start.world, heroId).injury = { typeKey: 'bruised-ribs', healsOnTurn: nightOf(4) };

    const healed = playTo(start, nightOf(4), deps);
    expect(hero(healed.document.world, heroId)).toMatchObject({ injury: null, xp: 0 });

    const after = playTo(healed.document, nightOf(6), deps);
    expect(hero(after.document.world, heroId).xp).toBe(2 * 2);
  });

  test('history.entries grows by zero per night from training', () => {
    // A curve no Hero climbs, so no Level-up entry follows from the XP either, and no maintenance,
    // so the yard's grade does not change what Upkeep takes.
    const deps = soloDeps({ xpCurveBase: 1_000_000, hallMaintenancePerGrade: 0 });
    const idle = withYard('no-entries', 0, deps);
    const trained = withYard('no-entries', 3, deps);
    const roster = [...player(idle.world).rosterIds];

    const without = playTo(idle, nightOf(29), deps);
    const withYardXp = playTo(trained, nightOf(29), deps);

    expect(withYardXp.document.history.entries).toHaveLength(without.document.history.entries.length);
    expect(withYardXp.document.history.entries).toEqual(without.document.history.entries);
    expect(xpOf(without.document.world, roster)).toEqual(roster.map(() => 0));
    expect(xpOf(withYardXp.document.world, roster)).toEqual(roster.map(() => 30 * 3 * 2));
  });

  test('draws from no stream and changes nothing but XP', () => {
    const deps = soloDeps();
    const { world } = withYard('nothing-else', 2, deps);
    const before = structuredClone(world);

    night(world, 0, deps);

    const expected = structuredClone(before);
    expected.turn = world.turn;
    for (const heroId of player(before).rosterIds) hero(expected, heroId).xp += 4;
    expect(world).toEqual(expected);
  });

  test("trains every Guild's Roster alike at its own grade, but not a folded Guild's or the Unattached pool", () => {
    const deps = soloDeps({ rivalCount: 2 });
    const { world } = createWorld('who-trains', setup, deps).document;
    const [rival, folded] = Object.values(world.guilds).filter((guild) => guild.controller.kind === 'rival') as [Guild, Guild];
    player(world).hall.trainingYard = 1;
    rival.hall.trainingYard = 2;
    folded.hall.trainingYard = 3;
    folded.foldedOnTurn = 0;
    const pool = Object.values(world.heroes).filter((row) => row.unattachedSince !== null);
    expect(pool.length).toBeGreaterThan(0);

    night(world, 0, deps);

    expect(xpOf(world, player(world).rosterIds)).toEqual(player(world).rosterIds.map(() => 2));
    expect(xpOf(world, rival.rosterIds)).toEqual(rival.rosterIds.map(() => 4));
    expect(xpOf(world, folded.rosterIds)).toEqual(folded.rosterIds.map(() => 0));
    expect(pool.map((row) => row.xp)).toEqual(pool.map(() => 0));
  });

  test('a Hero whose training XP crosses a threshold levels up that night', () => {
    const deps = soloDeps();
    const start = withYard('crossing', 1, deps);
    const [heroId] = player(start.world).rosterIds as [HeroId];
    hero(start.world, heroId).xp = 99;

    const { document, events } = playTo(start, nightOf(0), deps);

    expect(hero(document.world, heroId)).toMatchObject({ xp: 101, level: 2 });
    expect(ofType(events, 'hero.levelled')).toMatchObject([{ turn: nightOf(0), payload: { heroId, level: 2 } }]);
  });
});
