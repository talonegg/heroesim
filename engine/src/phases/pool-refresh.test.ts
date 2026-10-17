import { afterEach, describe, expect, test, vi } from 'vitest';
import { advance } from '../advance.js';
import type { EngineDeps, GameConfig } from '../config.js';
import { createWorld } from '../create.js';
import type { Entry, HeroId, WorldDocument } from '../document.js';
import type { EngineEvent } from '../events.js';
import { append, count, entriesFor } from '../history.js';
import type { Module } from '../modules.js';
import { phases } from '../pipeline.js';
import { createStreams } from '../rng.js';
import { playerGuild, unattachedHeroes } from '../selectors.js';
import { nightOf } from '../time.js';
import { ofType, plannedStreams, playWith, setup, streamsOutOfPlace, testDeps, withValid } from '../world.test-support.js';
import { phaseContext } from './phase.js';
import { poolRefresh } from './pool-refresh.js';
import { applyAction } from '../actions/action.js';

/** Advances to a Turn, validating the document it stops at. */
const playTo = playWith(advance, { validate: 'last' });

// The night's pool refresh (DL-27). Documents are held to the validator after every advance
// a test inspects.

/**
 * The test deps with no Rivals: they recruit from the pool each afternoon, and these
 * tests watch the pool's own refresh.
 */
function quietDeps(overrides: Partial<GameConfig> = {}): EngineDeps {
  return testDeps({ rivalCount: 0, ...overrides });
}

function created(seed: string, deps: EngineDeps): WorldDocument {
  return createWorld(seed, setup, deps).document;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('departures', () => {
  test('a Hero leaves on the night of the Day unattachedStayDays after the Day they entered, and not before', () => {
    const deps = quietDeps({ unattachedStayDays: 3 });
    const start = created('stay', deps);
    const first = unattachedHeroes(start.world).map((hero) => hero.id);

    // Entered on Day 0: still here on the night of Day 2, gone on the night of Day 3.
    const early = playTo(start, nightOf(2), deps);
    expect(ofType(early.events, 'hero.left-pool')).toEqual([]);
    const { document, events } = playTo(early.document, nightOf(3), deps);

    const left = ofType(events, 'hero.left-pool');
    expect(left.map((event) => event.payload.heroId)).toEqual(first);
    expect(left.every((event) => event.turn === nightOf(3) && !event.milestone)).toBe(true);
    // Their replacements entered that night and leave three Days later.
    const replacements = unattachedHeroes(document.world);
    expect(replacements.every((hero) => hero.unattachedSince === nightOf(3))).toBe(true);
    const later = playTo(document, nightOf(6), deps);
    expect(ofType(later.events, 'hero.left-pool').map((event) => [event.turn, event.payload.heroId])).toEqual(
      replacements.map((hero) => [nightOf(6), hero.id]),
    );
  });

  test('a pool Hero who leaves unhired is gone, with no entry and no byEntity key; their arrival and leaving are still events (DL-211)', () => {
    const deps = quietDeps({ unattachedStayDays: 1 });
    const creation = createWorld('passive', setup, deps);
    const start = creation.document;
    const [hero] = unattachedHeroes(start.world);
    if (hero === undefined) throw new Error('The pool is empty');

    const { document, events } = playTo(start, nightOf(1), deps);

    expect(document.world.heroes).not.toHaveProperty(hero.id);
    expect(entriesFor(document.history, hero.id)).toEqual([]);
    expect(Object.hasOwn(document.history.byEntity, hero.id)).toBe(false);
    expect(count(document.history, 'hero.left-pool')).toBe(0);
    // Emitted all the same, for the Turn's log, the pool's stop and the harness, with their labels.
    const arrival = ofType(creation.events, 'hero.generated').find((event) => event.payload.heroId === hero.id);
    const leaving = ofType(events, 'hero.left-pool').find((event) => event.payload.heroId === hero.id);
    for (const event of [arrival, leaving]) {
      expect(event?.participants).toEqual([hero.id]);
      expect(event?.labels).toEqual({ [hero.id]: hero.name });
    }
    // Their replacements' arrivals too, none recorded.
    const replacements = ofType(events, 'hero.generated');
    expect(replacements.length).toBeGreaterThan(0);
    for (const event of replacements) expect(Object.hasOwn(document.history.byEntity, event.payload.heroId)).toBe(false);
  });

  test("a hired pool Hero's History begins at their signing (DL-206 item 21)", () => {
    const deps = quietDeps({ unattachedStayDays: 1 });
    const start = created('hired', deps);
    const guild = playerGuild(start.world);
    const [hero] = unattachedHeroes(start.world);
    if (guild === undefined || hero === undefined) throw new Error('The world is incomplete');

    const recruited = applyAction(start, { kind: 'recruit', guildId: guild.id, heroId: hero.id, years: 2 }, deps);
    if (!recruited.ok) throw new Error(`Refused: ${recruited.rejection.reason}`);
    const { document } = playTo(recruited.document, nightOf(1), deps);

    const entries = entriesFor(document.history, hero.id).reverse();
    expect(entries[0]?.type).toBe('hero.recruited');
    expect(entries.map((entry) => entry.type)).not.toContain('hero.generated');
    expect(document.world.heroes[hero.id]?.guildId).toBe(guild.id);
  });

  test("a pool Hero a module's event names has their leaving recorded, and keeps their row", () => {
    const herald: Module = {
      id: 'herald',
      streamName: 'herald',
      createSlice: () => ({}),
      validateSlice: () => [],
      onMorning: (_world, _slice, ctx) => {
        // The first of the pool the world was made with, in id order.
        const [first] = ctx.select.unattachedHeroes().filter((row) => row.unattachedSince === 0);
        return { events: first === undefined ? [] : [ctx.emit({ type: 'herald.cried', participants: [first.id], payload: {} })] };
      },
    };
    const deps: EngineDeps = { ...quietDeps({ unattachedStayDays: 1 }), modules: [herald] };
    const start = created('cried', deps);
    const [named, unnamed] = unattachedHeroes(start.world);
    if (named === undefined || unnamed === undefined) throw new Error('The pool is too small');

    const { document } = playTo(start, nightOf(1), deps);

    expect(entriesFor(document.history, named.id).map((entry) => entry.type)).toEqual(['hero.left-pool', 'herald.cried']);
    expect(document.world.heroes[named.id]?.leftPoolOnTurn).toBe(nightOf(1));
    expect(document.world.heroes).not.toHaveProperty(unnamed.id);
    expect(Object.hasOwn(document.history.byEntity, unnamed.id)).toBe(false);
  });

  test('a pool Hero an earlier phase of the same Turn names keeps their row as they leave, and the save validates', () => {
    const deps = quietDeps({ unattachedStayDays: 1 });
    const start = created('earlier', deps);
    const [named, unnamed] = unattachedHeroes(start.world);
    if (named === undefined || unnamed === undefined) throw new Error('The pool is too small');
    // A night phase before the pool refresh, emitting an entry that names the Hero on the night
    // they leave: their leaving is then recorded, and the row must stay with it (data-model rule 8).
    const before = phases.find((phase) => phase.name === 'patronState');
    if (before === undefined) throw new Error('No patronState phase');
    const run = before.run;
    vi.spyOn(before, 'run').mockImplementation((world, ctx) => {
      const events = run(world, ctx);
      if (ctx.turn !== nightOf(1)) return events;
      const noticed = { turn: ctx.turn, type: 'hero.noticed', participants: [named.id], labels: { [named.id]: named.name }, milestone: false, payload: {} };
      return [...events, noticed as unknown as EngineEvent];
    });

    const { document } = playTo(start, nightOf(1), deps);

    expect(entriesFor(document.history, named.id).map((entry) => entry.type)).toEqual(['hero.left-pool', 'hero.noticed']);
    expect(document.world.heroes[named.id]?.leftPoolOnTurn).toBe(nightOf(1));
    expect(document.world.heroes).not.toHaveProperty(unnamed.id);
  });

  test('a pool Hero a module names after they leave, the same night, keeps their row and has their leaving recorded, and the save validates', () => {
    const herald: Module = {
      id: 'herald',
      streamName: 'herald',
      createSlice: () => ({}),
      validateSlice: () => [],
      onNight: (world, _slice, ctx) => {
        // The first of the pool the world was made with, gone from it tonight.
        const first = Object.values(world.heroes).find((row) => row.leftPoolOnTurn !== null);
        return { events: first === undefined ? [] : [ctx.emit({ type: 'herald.cried', participants: [first.id], payload: {} })] };
      },
    };
    const deps: EngineDeps = { ...quietDeps({ unattachedStayDays: 1 }), modules: [herald] };
    const start = created('after', deps);
    const [named] = unattachedHeroes(start.world);
    if (named === undefined) throw new Error('The pool is empty');

    const { document } = playTo(start, nightOf(1), deps);

    // Their leaving is recorded, decided over the whole night's events: the row and the History agree (rule 8).
    expect(entriesFor(document.history, named.id).map((entry) => entry.type)).toEqual(['herald.cried', 'hero.left-pool']);
    expect(document.world.heroes[named.id]?.leftPoolOnTurn).toBe(nightOf(1));
  });

  test('a Hero any other entry names leaves the pool but keeps their row, once, and is out of play', () => {
    const deps = quietDeps({ unattachedStayDays: 1 });
    const start = created('named', deps);
    const [passive, named] = unattachedHeroes(start.world);
    if (passive === undefined || named === undefined) throw new Error('The pool is too small');
    // A synthetic non-passive entry: the release that names a pool Hero arrives in M6.
    const noticed: Entry = {
      turn: 0,
      type: 'hero.noticed',
      participants: [named.id],
      labels: { [named.id]: named.name },
      milestone: false,
      payload: {},
    };
    append(start.history, noticed);

    const { document } = playTo(start, nightOf(1), deps);

    expect(document.world.heroes).not.toHaveProperty(passive.id);
    expect(document.world.heroes[named.id]).toMatchObject({
      guildId: null,
      unattachedSince: null,
      leftPoolOnTurn: nightOf(1),
    });
    expect(unattachedHeroes(document.world).map((hero) => hero.id)).not.toContain(named.id);
    expect(unattachedHeroes(document.world)).toHaveLength(deps.config.unattachedPoolSize);

    // The next nights pass them by: they left once.
    const after = playTo(document, nightOf(4), deps);
    const leftPool = entriesFor(after.document.history, named.id).filter((entry) => entry.type === 'hero.left-pool');
    expect(leftPool).toHaveLength(1);
    expect(after.document.world.heroes[named.id]?.leftPoolOnTurn).toBe(nightOf(1));
  });
});

// The owner, 2026-10-17: a released Hero stays a Year in the pool (DL-325).
describe('a released Hero', () => {
  test('stays releasedStayDays from the Day of their release, not unattachedStayDays, beside the pool size and not in it', () => {
    const deps = quietDeps({ unattachedStayDays: 1, releasedStayDays: 4 });
    const start = created('released-stay', deps);
    const guild = playerGuild(start.world);
    const heroId = guild?.rosterIds[0];
    if (guild === undefined || heroId === undefined) throw new Error('The world is incomplete');
    const released = applyAction(start, { kind: 'release', guildId: guild.id, heroId }, deps);
    if (!released.ok) throw new Error(`Refused: ${released.rejection.reason}`);

    // Released on Day 0: still in the pool on the night of Day 3, the pool's own Heroes long gone, and beside the usual
    // unattachedPoolSize new recruits, not one of them (the owner, 2026-10-17: released Heroes do not count toward the size).
    const early = playTo(released.document, nightOf(3), deps);
    expect(ofType(early.events, 'hero.left-pool').map((event) => event.payload.heroId)).not.toContain(heroId);
    expect(unattachedHeroes(early.document.world).map((hero) => hero.id)).toContain(heroId);
    expect(unattachedHeroes(early.document.world)).toHaveLength(deps.config.unattachedPoolSize + 1);
    const { events } = playTo(early.document, nightOf(4), deps);
    expect(ofType(events, 'hero.left-pool').filter((event) => event.payload.heroId === heroId).map((event) => event.turn)).toEqual([nightOf(4)]);
  });

  test('signed again and back in the pool another way, as at a fold, stays unattachedStayDays', () => {
    const deps = quietDeps({ unattachedStayDays: 1, releasedStayDays: 4 });
    const start = created('released-again', deps);
    const guild = playerGuild(start.world);
    const heroId = guild?.rosterIds[0];
    if (guild === undefined || heroId === undefined) throw new Error('The world is incomplete');
    const released = applyAction(start, { kind: 'release', guildId: guild.id, heroId }, deps);
    if (!released.ok) throw new Error(`Refused: ${released.rejection.reason}`);
    const night = (since: number): HeroId[] => {
      const world = structuredClone(released.document.world);
      const hero = world.heroes[heroId];
      if (hero === undefined) throw new Error('No row');
      hero.unattachedSince = since;
      world.turn = nightOf(2);
      return ofType(poolRefresh(world, phaseContext(world, deps, released.document.history)), 'hero.left-pool').map((event) => event.payload.heroId);
    };

    // In the pool since their release: stays. Since a later Turn, as a fold of the Guild that signed them again: the pool's stay.
    expect(night(0)).not.toContain(heroId);
    expect(night(nightOf(1))).toContain(heroId);
  });

  test('is no part of the pool for the refill, while a Hero back by a fold is', () => {
    const deps = quietDeps({ unattachedStayDays: 100, releasedStayDays: 100 });
    const start = created('released-refill', deps);
    const guild = playerGuild(start.world);
    const heroId = guild?.rosterIds[0];
    if (guild === undefined || heroId === undefined) throw new Error('The world is incomplete');
    const released = applyAction(start, { kind: 'release', guildId: guild.id, heroId }, deps);
    if (!released.ok) throw new Error(`Refused: ${released.rejection.reason}`);
    // One of the pool's own Heroes is gone, so the pool holds unattachedPoolSize with the Hero in it.
    const generatedOn = (since: number): number => {
      const world = structuredClone(released.document.world);
      const other = unattachedHeroes(world).find((hero) => hero.id !== heroId);
      const hero = world.heroes[heroId];
      if (other === undefined || hero === undefined) throw new Error('No row');
      delete world.heroes[other.id];
      hero.unattachedSince = since;
      world.turn = nightOf(1);
      return ofType(poolRefresh(world, phaseContext(world, deps, released.document.history)), 'hero.generated').length;
    };

    // Released this Turn: not counted, so the refill brings one. Back by a fold on a later Turn: counted, so none.
    expect(generatedOn(0)).toBe(1);
    expect(generatedOn(nightOf(1))).toBe(0);
  });

  test('signed again and released again is released by the later release: the stay and the refill read it', () => {
    const deps = quietDeps({ unattachedStayDays: 1, releasedStayDays: 4 });
    const start = created('released-twice', deps);
    const guild = playerGuild(start.world);
    const heroId = guild?.rosterIds[0];
    if (guild === undefined || heroId === undefined) throw new Error('The world is incomplete');
    const first = applyAction(start, { kind: 'release', guildId: guild.id, heroId }, deps);
    if (!first.ok) throw new Error(`Refused: ${first.rejection.reason}`);
    const signed = applyAction(first.document, { kind: 'recruit', guildId: guild.id, heroId, years: 1 }, deps);
    if (!signed.ok) throw new Error(`Refused: ${signed.rejection.reason}`);
    const later = playTo(signed.document, nightOf(1) + 1, deps).document;
    const again = applyAction(later, { kind: 'release', guildId: guild.id, heroId }, deps);
    if (!again.ok) throw new Error(`Refused: ${again.rejection.reason}`);
    expect(entriesFor(again.document.history, heroId).filter((entry) => entry.type === 'hero.released')).toHaveLength(2);

    // Two nights after the second release, past unattachedStayDays: still in the pool, and beside its size.
    const { document, events } = playTo(again.document, nightOf(4), deps);
    expect(ofType(events, 'hero.left-pool').map((event) => event.payload.heroId)).not.toContain(heroId);
    expect(unattachedHeroes(document.world).map((hero) => hero.id)).toContain(heroId);
    expect(unattachedHeroes(document.world)).toHaveLength(deps.config.unattachedPoolSize + 1);
  });
});

describe('the refill', () => {
  test('refills the pool to unattachedPoolSize the night a Hero is recruited, with Unattached Heroes', () => {
    const deps = quietDeps();
    const start = created('refill', deps);
    const guild = playerGuild(start.world);
    const [hero] = unattachedHeroes(start.world);
    if (guild === undefined || hero === undefined) throw new Error('The world is incomplete');
    const recruited = applyAction(start, { kind: 'recruit', guildId: guild.id, heroId: hero.id, years: 2 }, deps);
    if (!recruited.ok) throw new Error(`Refused: ${recruited.rejection.reason}`);
    expect(unattachedHeroes(recruited.document.world)).toHaveLength(deps.config.unattachedPoolSize - 1);

    const { document, events } = playTo(recruited.document, nightOf(0), deps);

    const generated = ofType(events, 'hero.generated');
    expect(generated).toHaveLength(1);
    const newcomer = generated[0]?.payload.heroId as HeroId;
    expect(generated[0]).toMatchObject({ turn: nightOf(0), participants: [newcomer], payload: { guildId: null } });
    expect(document.world.heroes[newcomer]?.unattachedSince).toBe(nightOf(0));
    expect(unattachedHeroes(document.world)).toHaveLength(deps.config.unattachedPoolSize);
  });

  test("advances only the pool stream, and each new Hero's own two, hero-portraits and hero-descriptions", () => {
    const deps = quietDeps({ unattachedStayDays: 0 });
    const document = created('streams', deps);
    const world = structuredClone(document.world);
    // Every planned stream, so that each can be seen to stand still.
    Object.assign(world.rng, createStreams(document.meta.seed, plannedStreams), structuredClone(world.rng));
    world.turn = nightOf(0);
    const before = structuredClone(world.rng);

    const events = poolRefresh(world, phaseContext(world, deps, document.history));

    expect(ofType(events, 'hero.left-pool')).toHaveLength(deps.config.unattachedPoolSize);
    expect(streamsOutOfPlace(before, world.rng, ['pool', 'hero-portraits', 'hero-descriptions'])).toEqual([]);
  });
});

// The pool turns over every unattachedStayDays, so a leaked row shows within the first year; two years of it.
describe('over two years with no recruitment', () => {
  test('world.heroes never holds more Heroes on no Roster than unattachedPoolSize', () => {
    // Only the pool refresh runs: no Rival recruits, no ending stops the game, nothing else moves.
    for (const phase of phases) if (phase.name !== 'poolRefresh') vi.spyOn(phase, 'run').mockReturnValue([]);
    const deps = quietDeps();
    let document = created('two-years', deps);
    const onRosters = Object.values(document.world.heroes).filter((hero) => hero.guildId !== null).length;
    const years = 2;
    const turns = years * deps.config.turnsPerYear;

    let most = 0;
    let departures = 0;
    for (let turn = 0; turn < turns; turn += 1) {
      const result = advance(document, deps);
      document = result.document;
      departures += ofType(result.events, 'hero.left-pool').length;
      let guildless = 0;
      for (const hero of Object.values(document.world.heroes)) if (hero.guildId === null) guildless += 1;
      most = Math.max(most, guildless);
    }

    withValid(document, deps);
    expect(document.world.turn).toBe(turns);
    expect(most).toBe(deps.config.unattachedPoolSize);
    expect(Object.keys(document.world.heroes)).toHaveLength(onRosters + deps.config.unattachedPoolSize);
    // Every departure removed its row: about one a night, and each replaced. None of the pool's
    // comings and goings is recorded: no one was hired (DL-211).
    expect(departures).toBeGreaterThan((turns / 3) * 0.7);
    expect(count(document.history, 'hero.left-pool')).toBe(0);
    expect(count(document.history, 'hero.generated')).toBe(onRosters);
  });
});
