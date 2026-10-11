import { describe, expect, test } from 'vitest';
import { applyAction } from './actions/action.js';
import { advance } from './advance.js';
import type { GameConfig } from './config.js';
import { createWorld } from './create.js';
import { requireRow, type Guild, type Hero, type Party, type Quest, type World, type WorldDocument } from './document.js';
import { eventEmitter } from './emit.js';
import { fatigueBand, fatigueFall, fatigueRise } from './fatigue.js';
import { heroNight } from './phases/hero-state.js';
import { questClock } from './quest-engine/clock.js';
import { playerGuild } from './selectors.js';
import { durationDaysOf, nightOf, timeOfDay } from './time.js';
import { buildDocument, harmlessContent, ofType, setup, testDeps, withValid } from './world.test-support.js';

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

describe('a Quest played, against the Quest clock (the verification of DL-282)', () => {
  // No Rivals, and Encounters that harm no one, so the Party comes home whole.
  const played = testDeps({ rivalCount: 0 }, harmlessContent);
  /** `value` held inside 0 to `fatigueMax`, as a night holds it. */
  const held = (value: number): number => Math.min(played.config.fatigueMax, Math.max(0, value));

  /**
   * A created world played to `sendAt`, two of the player's Heroes at Fatigue 0 sent then on the first
   * Quest of the Board two may take, and played on to the return night (the Party freed, the Hero
   * State Engine's night not yet run, as the resolver meets them) and through it.
   */
  function quest(sendAt: number) {
    let document: WorldDocument = withValid(createWorld('fatigue-clock', setup, played).document, played);
    while (document.world.turn < sendAt) document = withValid(advance(document, played).document, played);
    const guild = playerGuild(document.world) as Guild;
    const heroIds = guild.rosterIds.slice(0, 2);
    for (const id of heroIds) requireRow(document.world.heroes, id).fatigue = 0;
    const open = document.world.board.map((id) => requireRow(document.world.quests, id)).find(({ requirements }) => requirements.classKey === undefined && requirements.skillKey === undefined && requirements.partySizeMin <= 2);
    if (open === undefined) throw new Error('No open Quest for two on the Board');
    const sent = applyAction(document, { kind: 'dispatch', guildId: guild.id, questId: open.id, heroIds }, played);
    if (!sent.ok) throw new Error(`Refused: ${sent.rejection.reason}`);
    document = withValid(sent.document, played);
    const taken = requireRow(document.world.quests, open.id) as Quest;
    const party = requireRow(document.world.parties, taken.partyIds[0] as Party['id']);
    expect(party.fatigueAtDispatch).toEqual(Object.fromEntries(heroIds.map((id) => [id, 0])));
    while (document.world.turn < party.returnsOnTurn - 1) document = withValid(advance(document, played).document, played);
    const beforeReturn = heroIds.map((id) => requireRow(document.world.heroes, id).fatigue);
    document = withValid(advance(document, played).document, played);
    const afterReturn = heroIds.map((id) => requireRow(document.world.heroes, id).fatigue);
    const clock = questClock(taken, taken.encounterKeys.length, played.config);
    const rise = fatigueRise(taken.tier, played.config);
    const fall = fatigueFall(requireRow(document.world.guilds, guild.id).hall.quarters, played.config);
    return { days: durationDaysOf(taken), encounters: taken.encounterKeys.length, clock, rise, fall, beforeReturn, afterReturn, heroIds, document };
  }

  test("sent before the night, the Party is away its Quest's Days in nights: the last Encounter's Fatigue one rise short of the stored, the walk home; the return night rests", () => {
    const { days, encounters, clock, rise, fall, beforeReturn, afterReturn } = quest(0);
    expect(timeOfDay(0)).toBe('morning');
    expect(clock.days).toBe(days);
    expect(clock.encounterDay(encounters - 1)).toBe(days);
    expect(beforeReturn).toEqual(Array(2).fill(held(days * rise)));
    expect(beforeReturn).toEqual(Array(2).fill(held(clock.fatigueAt(encounters - 1, 0) + rise)));
    expect(afterReturn).toEqual(Array(2).fill(held(held(days * rise) - fall)));
  });

  test("sent after the night, the Party is away one night fewer: the last Encounter's Fatigue is the stored one", () => {
    const { days, encounters, clock, rise, beforeReturn } = quest(nightOf(1));
    expect(beforeReturn).toEqual(Array(2).fill(held((days - 1) * rise)));
    expect(beforeReturn).toEqual(Array(2).fill(clock.fatigueAt(encounters - 1, 0)));
  });
});
