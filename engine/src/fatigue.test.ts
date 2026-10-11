import { describe, expect, test } from 'vitest';
import type { GameConfig } from './config.js';
import { requireRow, type Guild, type Hero, type World } from './document.js';
import { eventEmitter } from './emit.js';
import { fatigueBand } from './fatigue.js';
import { heroNight } from './phases/hero-state.js';
import { nightOf } from './time.js';
import { buildDocument, ofType, testDeps } from './world.test-support.js';

// Fatigue (DL-280 item 2, DL-282): a State from 0 to `fatigueMax`, rising each night a Hero is away by
// the Quest's Tier, falling each night at home by the quarters grade, read in bands. The Hero State
// Engine's night (`heroNight`) is its one writer.

const config: Partial<GameConfig> = {
  fatigueMax: 100,
  fatigueBands: { fresh: 0, weary: 25, tired: 50, exhausted: 75 },
  fatigueRiseByTier: [4, 5, 6, 7, 8],
  fatigueFallByQuarters: [5, 6, 7, 8],
};
const deps = testDeps(config);

/** The fixture's Hero away in its Party on its taken Quest, and one at home, each at `fatigue`. */
function scene(fatigue = 0) {
  const { document, ids } = buildDocument({ rosterSize: 3 });
  const { world } = document;
  world.turn = nightOf(20);
  const away = requireRow(world.heroes, ids.partyHero);
  const home = requireRow(world.heroes, ids.idleHero ?? ids.partyHero);
  away.fatigue = fatigue;
  home.fatigue = fatigue;
  const quest = requireRow(world.quests, ids.takenQuest);
  const guild = requireRow(world.guilds, ids.playerGuild);
  return { world, away, home, quest, guild };
}

/** One night of `hero`'s State, its events. */
function night(hero: Hero, world: World, awayOn?: { tier: number }) {
  return heroNight(hero, world, { ...deps, turn: world.turn, emit: eventEmitter(world) }, awayOn);
}

describe('a night away', () => {
  test("Fatigue rises by the Quest's Tier, Tier 1's figure first, a Tier past the list reading the last", () => {
    const rises = [1, 2, 3, 4, 5, 6].map((tier) => {
      const { world, away, quest } = scene(10);
      quest.tier = tier;
      night(away, world);
      return away.fatigue - 10;
    });
    expect(rises).toEqual([4, 5, 6, 7, 8, 8]);
  });

  test('Fatigue is held at fatigueMax', () => {
    const { world, away, quest } = scene(97);
    quest.tier = 5;
    night(away, world);
    expect(away.fatigue).toBe(100);
    night(away, world);
    expect(away.fatigue).toBe(100);
  });

  test("a Hero with no Party, marked away on a Quest, rises by its Tier: the estimate's homecoming", () => {
    const { world, home } = scene(10);
    night(home, world, { tier: 3 });
    expect(home.fatigue).toBe(16);
  });
});

describe('a night at home', () => {
  test("Fatigue falls by the Guild's quarters grade, grade 0's figure first, a grade past the list reading the last", () => {
    const falls = [0, 1, 2, 3, 4].map((grade) => {
      const { world, home, guild } = scene(50);
      guild.hall.quarters = grade;
      night(home, world);
      return 50 - home.fatigue;
    });
    expect(falls).toEqual([5, 6, 7, 8, 8]);
  });

  test('Fatigue is held at 0', () => {
    const { world, home, guild } = scene(3);
    (guild as Guild).hall.quarters = 3;
    night(home, world);
    expect(home.fatigue).toBe(0);
    night(home, world);
    expect(home.fatigue).toBe(0);
  });
});

describe('a band crossed', () => {
  test('a night that crosses a band emits one hero.fatigue-changed, naming the Hero, the figures and the bands', () => {
    const { world, away, quest } = scene(22);
    quest.tier = 1;
    const events = night(away, world);
    const changed = ofType(events, 'hero.fatigue-changed');
    expect(changed).toHaveLength(1);
    expect(changed[0]?.payload).toEqual({ heroId: away.id, before: 22, after: 26, bandBefore: 'fresh', bandAfter: 'weary' });
    expect(changed[0]?.participants[0]).toBe(away.id);
    expect(changed[0]?.milestone).toBe(false);
  });

  test('a night that crosses none emits nothing of Fatigue, rising or falling', () => {
    const rising = scene(26);
    expect(ofType(night(rising.away, rising.world), 'hero.fatigue-changed')).toEqual([]);
    expect(rising.away.fatigue).toBe(26 + 5);
    const falling = scene(56);
    expect(ofType(night(falling.home, falling.world), 'hero.fatigue-changed')).toEqual([]);
    expect(falling.home.fatigue).toBe(51);
  });

  test('a night at home that falls into a lower band emits it too', () => {
    const { world, home } = scene(52);
    const [changed] = ofType(night(home, world), 'hero.fatigue-changed');
    expect(changed?.payload).toMatchObject({ before: 52, after: 47, bandBefore: 'tired', bandAfter: 'weary' });
  });
});

describe('fatigueBand', () => {
  test("is the highest band whose start the Fatigue has reached", () => {
    expect([0, 24, 25, 49, 50, 74, 75, 100].map((fatigue) => fatigueBand(fatigue, deps.config))).toEqual([
      'fresh',
      'fresh',
      'weary',
      'weary',
      'tired',
      'tired',
      'exhausted',
      'exhausted',
    ]);
  });
});
