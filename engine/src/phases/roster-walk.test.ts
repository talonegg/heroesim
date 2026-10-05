import { describe, expect, test } from 'vitest';
import type { EngineDeps } from '../config.js';
import { createWorld } from '../create.js';
import type { Hero, HeroId, World } from '../document.js';
import type { EngineEvent } from '../events.js';
import { xpForLevel } from '../progression.js';
import { nightOf } from '../time.js';
import { testDeps } from '../world.test-support.js';
import { ageing } from './ageing.js';
import { heroState } from './hero-state.js';
import { levelUps } from './level-ups.js';
import { phaseContext, type PhaseRun } from './phase.js';
import { activeRosterHeroes } from './roster-walk.js';
import { training } from './training.js';

// v1.1.6-S8 (DL-186 item 26, SF10): the Roster walk the night phases share, `activeRosterHeroes`.
// The order is a draw order: `ageing`, `heroState` and `levelUps` each draw from a stream for each
// Hero in turn (ADR-0009), so the walk is pinned here, and each phase is held to the order it had
// before the walk was shared: the Guilds in play by id, each Roster in its own order, the dead, the
// retired and an id the world lacks skipped.

const setup = { guildmasterName: 'Ada', guildName: 'The Test', createdAt: 'test' };

/**
 * A created world with Rivals, made awkward for a walk: the Guilds inserted in reverse id order,
 * each Roster reversed, a dead and a retired Hero left on Rosters, an id the world lacks on one, and
 * a folded Guild that keeps its Roster. Every Hero has an anniversary tonight, is past the
 * Retirement age and the decline age, and has the XP for one more Level.
 */
function awkwardWorld(deps: EngineDeps): World {
  const { world } = createWorld('roster-walk', setup, deps).document;
  world.turn = nightOf(400);
  world.guilds = Object.fromEntries(Object.entries(world.guilds).reverse());
  const guilds = Object.values(world.guilds);
  for (const guild of guilds) guild.rosterIds.reverse();
  for (const hero of Object.values(world.heroes)) {
    hero.enteredTurn = world.turn - deps.config.turnsPerYear;
    hero.ageAtEntry = 70;
    hero.xp = xpForLevel(hero.level + 1, deps.config);
  }
  const [first, second, third] = guilds;
  const dead = first?.rosterIds[1] as HeroId;
  (world.heroes[dead] as Hero).diedOnTurn = world.turn - 1;
  const retired = second?.rosterIds[0] as HeroId;
  (world.heroes[retired] as Hero).retiredOnTurn = world.turn - 1;
  second?.rosterIds.splice(1, 0, 'hero-999999' as HeroId);
  if (third !== undefined) third.foldedOnTurn = world.turn - 1;
  return world;
}

/** The walk as each phase wrote it before v1.1.6-S8: the reference the shared walk is held to. */
function walkBefore(world: World): HeroId[] {
  const order: HeroId[] = [];
  const guildIds = Object.keys(world.guilds).sort();
  for (const guildId of guildIds) {
    const guild = world.guilds[guildId as keyof World['guilds']];
    if (guild === undefined || guild.foldedOnTurn !== null) continue;
    for (const heroId of guild.rosterIds) {
      const hero = Object.hasOwn(world.heroes, heroId) ? world.heroes[heroId] : undefined;
      if (hero === undefined || hero.diedOnTurn !== null || hero.retiredOnTurn !== null) continue;
      order.push(heroId);
    }
  }
  return order;
}

const deps = testDeps({
  rivalCount: 3,
  declineAge: 0,
  heroRetirementAge: 0,
  heroRetirementChancePerYear: 1,
});

/** The Heroes the events of `type` name, in the order the phase emitted them. */
function heroesNamed(events: readonly EngineEvent[], type: EngineEvent['type']): HeroId[] {
  return events.filter((event) => event.type === type).map((event) => (event.payload as { heroId: HeroId }).heroId);
}

function run(phase: PhaseRun): { world: World; before: HeroId[]; events: EngineEvent[] } {
  const world = awkwardWorld(deps);
  const before = walkBefore(world);
  expect(before.length).toBeGreaterThan(8);
  return { world, before, events: phase(world, phaseContext(world, deps)) };
}

describe('activeRosterHeroes', () => {
  test('walks the Guilds in play by id, each Roster in its order, skipping the dead, the retired and an id the world lacks', () => {
    const world = awkwardWorld(deps);
    const walked = activeRosterHeroes(world);

    expect(walked.map(({ hero }) => hero.id)).toEqual(walkBefore(world));
    expect(walked.length).toBeGreaterThan(8);
    for (const { guild, hero } of walked) {
      expect(guild.foldedOnTurn).toBeNull();
      expect(guild.rosterIds).toContain(hero.id);
      expect(hero).toBe(world.heroes[hero.id]);
      expect(guild).toBe(world.guilds[guild.id]);
    }
  });

  test('is in Guild id order whatever order the Guilds were inserted in', () => {
    const world = awkwardWorld(deps);
    const guildIds = activeRosterHeroes(world).map(({ guild }) => guild.id);

    expect(guildIds).toEqual([...guildIds].sort());
    expect(Object.keys(world.guilds)).not.toEqual(Object.keys(world.guilds).sort());
  });
});

describe('each night phase walks the Roster in the order it walked before', () => {
  test('levelUps: a Level for each Hero, in the walk, its draws in that order', () => {
    const { before, events } = run(levelUps);

    expect(heroesNamed(events, 'hero.levelled')).toEqual(before);
  });

  test('ageing: a decline for each Hero, in the walk, its draws in that order', () => {
    const { before, events } = run(ageing);

    expect(heroesNamed(events, 'hero.declined')).toEqual(before);
  });

  test("heroState: a Retirement for each Hero, in the walk, the Roster's own changes not cutting it short", () => {
    const { world, before, events } = run(heroState);

    expect(heroesNamed(events, 'hero.retired')).toEqual(before);
    for (const heroId of before) expect(world.heroes[heroId]?.retiredOnTurn).toBe(world.turn);
  });

  test("training: the Day's XP for each Hero in the walk, and no other (it draws nothing, so its order moves no draw)", () => {
    const world = awkwardWorld(deps);
    world.guilds = Object.fromEntries(
      Object.entries(world.guilds).map(([id, guild]) => [id, { ...guild, hall: { ...guild.hall, trainingYard: 1 } }]),
    );
    const before = new Map(Object.values(world.heroes).map((hero) => [hero.id, hero.xp]));
    const walked = new Set(walkBefore(world));

    training(world, phaseContext(world, deps));

    for (const hero of Object.values(world.heroes)) {
      const gained = hero.xp - (before.get(hero.id) ?? 0);
      if (walked.has(hero.id)) expect(gained).toBeGreaterThan(0);
      else expect(gained).toBe(0);
    }
  });
});
