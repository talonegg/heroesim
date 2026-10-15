import { describe, expect, test } from 'vitest';
import type { Guild, Hero, World } from './document.js';
import { eventEmitter } from './emit.js';
import { changeMorale, moraleBaselineFor } from './morale.js';
import { buildDocument, testDeps, withCaptaincy, withFacilityEffect } from './world.test-support.js';

// `changeMorale`, the writer of a discrete change of Morale (DL-29). DL-112 item 2:
// a change a Quest's return causes names the Quest; any other names none.

describe('changeMorale', () => {
  const { config } = testDeps();

  function scene() {
    const { document, ids } = buildDocument({ rosterSize: 3 });
    const hero = document.world.heroes[ids.partyHero] as Hero;
    hero.morale = 50;
    return { world: document.world, hero, questId: ids.takenQuest, emit: eventEmitter(document.world) };
  }

  test('a change a Quest caused carries its questId, and the Quest is a participant', () => {
    for (const cause of ['encounters', 'strong-success', 'roster-death'] as const) {
      const { hero, questId, emit } = scene();

      const event = changeMorale(hero, 5, cause, config, emit, questId);

      expect(event.payload).toMatchObject({ heroId: hero.id, cause, questId, before: 50, after: 55 });
      expect(event.participants).toEqual([hero.id, questId, hero.guildId]);
    }
  });

  test('a change nothing named a Quest for carries no questId, and names the Hero and their Guild', () => {
    const { hero, emit } = scene();

    const event = changeMorale(hero, -5, 'module', config, emit);

    expect(event.payload).not.toHaveProperty('questId');
    expect(event.participants).toEqual([hero.id, hero.guildId]);
  });

  // A Quest's cause without its Quest, or another cause with one, is a writer's mistake (DL-246).
  test("throws on a Quest's cause with no Quest, and on another cause naming one", () => {
    const { hero, questId, emit } = scene();

    expect(() => changeMorale(hero, 5, 'encounters', config, emit)).toThrow(RangeError);
    expect(() => changeMorale(hero, 5, 'module', config, emit, questId)).toThrow(RangeError);
  });
});

// DL-280 item 6, Q12 a; DL-287 (R40): while a Guild's Captain is at home, the Morale baseline of every
// Hero of its Roster, the Captain's own included, is captainHomeBaselineBonus higher at their captaincy
// Stat's most, nothing at its least, a share in a line between, rounded with the rest of the baseline.
describe("moraleBaselineFor and the Captain at home", () => {
  const deps = testDeps({ captainHomeBaselineBonus: 5, moraleBaseline: 50, inspirationMoraleShift: 0 }, withFacilityEffect('quarters', 'moraleBaseline', [0], withCaptaincy()));

  function scene(leadership: number) {
    const { document, ids } = buildDocument({ rosterSize: 3 });
    const { world } = document;
    const guild = world.guilds[ids.playerGuild] as Guild;
    for (const guildmaster of Object.values(world.guildmasters)) guildmaster.traits = [];
    const [captain, other] = guild.rosterIds.filter((id) => id !== ids.partyHero).map((id) => world.heroes[id] as Hero) as [Hero, Hero];
    captain.traits = [];
    captain.stats['leadership'] = leadership;
    guild.captainId = captain.id;
    const away = world.heroes[ids.partyHero] as Hero;
    return { world, guild, captain, other, away };
  }
  const baselines = (world: World, ...heroes: Hero[]): number[] => heroes.map((hero) => moraleBaselineFor(hero, world, deps.config, deps.content));

  test("at the Stat's most, every Hero of the Roster, the Captain and those away included, has captainHomeBaselineBonus more", () => {
    const { world, captain, other, away } = scene(20);
    expect(baselines(world, captain, other, away)).toEqual([55, 55, 55]);
  });

  test("at the Stat's least nothing, and between a share, rounded with the baseline", () => {
    expect(baselines(scene(1).world, scene(1).captain)).toEqual([50]);
    const half = scene(10.5);
    expect(baselines(half.world, half.other)).toEqual([Math.round(50 + 2.5)]);
    const some = scene(5);
    expect(baselines(some.world, some.other)).toEqual([Math.round(50 + (5 * 4) / 19)]);
  });

  test('nothing while the Captain is away on a Quest, nor with the post empty, nor where content marks no captaincy Stat', () => {
    const { world, guild, captain, other, away } = scene(20);
    guild.captainId = away.id;
    away.stats['leadership'] = 20;
    expect(baselines(world, captain, other)).toEqual([50, 50]);
    guild.captainId = null;
    expect(baselines(world, captain, other)).toEqual([50, 50]);
    guild.captainId = captain.id;
    expect(moraleBaselineFor(other, world, deps.config, testDeps(deps.config).content)).toBe(50);
  });

  test("another Guild's Captain lifts no Hero of this one", () => {
    const { world, captain, other } = scene(20);
    const rival = Object.values(world.guilds).find((guild) => guild.id !== captain.guildId) as Guild;
    const theirs = rival.rosterIds.map((id) => world.heroes[id] as Hero);
    expect(theirs.length).toBeGreaterThan(0);
    for (const hero of theirs) expect(moraleBaselineFor(hero, world, deps.config, deps.content), hero.id).toBeLessThan(55);
    expect(baselines(world, other)).toEqual([55]);
  });
});
