import { afterEach, describe, expect, test, vi } from 'vitest';
import { recruit } from '../actions/recruit.js';
import { advance } from '../advance.js';
import type { EngineDeps, GameConfig } from '../config.js';
import { createWorld } from '../create.js';
import type { Entry, HeroId, WorldDocument } from '../document.js';
import type { EngineEvent, TurnEvent } from '../events.js';
import { append, count, entriesFor } from '../history.js';
import { phases } from '../pipeline.js';
import { createStreams } from '../rng.js';
import { playerGuild, unattachedHeroes } from '../selectors.js';
import { nightOf } from '../time.js';
import { plannedStreams, testDeps, withValid } from '../world.test-support.js';
import { phaseContext } from './phase.js';
import { poolRefresh } from './pool-refresh.js';

// M2-S8: the night's pool refresh (DL-27). Documents are held to the validator after every advance
// a test inspects.

const setup = { guildmasterName: 'Ada', guildName: 'The Test', createdAt: 'test' };

/**
 * The test deps with no Rivals: from M2-S9 they recruit from the pool each afternoon, and these
 * tests watch the pool's own refresh.
 */
function quietDeps(overrides: Partial<GameConfig> = {}): EngineDeps {
  return testDeps({ rivalCount: 0, ...overrides });
}

function created(seed: string, deps: EngineDeps): WorldDocument {
  return createWorld(seed, setup, deps).document;
}

/** Advances `document` to Turn `turn`, returning the events of every Turn played. */
function playTo(document: WorldDocument, turn: number, deps: EngineDeps): { document: WorldDocument; events: TurnEvent[] } {
  let current = document;
  const events: TurnEvent[] = [];
  while (current.world.turn < turn) {
    const result = advance(current, deps);
    current = result.document;
    events.push(...result.events);
  }
  return { document: withValid(current, deps), events };
}

const ofType = <Type extends EngineEvent['type']>(events: TurnEvent[], type: Type) =>
  events.filter((event): event is Extract<EngineEvent, { type: Type }> => event.type === type);

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

  test('stays unattachedStayDays, 10 by default: from creation, until the night of Day 10', () => {
    const deps = quietDeps();
    expect(deps.config.unattachedStayDays).toBe(10);
    const { events } = playTo(created('default-stay', deps), nightOf(10), deps);

    expect(new Set(ofType(events, 'hero.left-pool').map((event) => event.turn))).toEqual(new Set([nightOf(10)]));
  });

  test('a Hero with only hero.generated and hero.left-pool entries is gone, and both entries read with their labels', () => {
    const deps = quietDeps({ unattachedStayDays: 1 });
    const start = created('passive', deps);
    const [hero] = unattachedHeroes(start.world);
    if (hero === undefined) throw new Error('The pool is empty');

    const { document } = playTo(start, nightOf(1), deps);

    expect(document.world.heroes).not.toHaveProperty(hero.id);
    const entries = entriesFor(document.history, hero.id);
    expect(entries.map((entry) => entry.type)).toEqual(['hero.left-pool', 'hero.generated']);
    for (const entry of entries) {
      expect(entry.participants).toEqual([hero.id]);
      expect(entry.labels).toEqual({ [hero.id]: hero.name });
    }
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

describe('the refill', () => {
  test('refills the pool to unattachedPoolSize the night a Hero is recruited, with Unattached Heroes', () => {
    const deps = quietDeps();
    const start = created('refill', deps);
    const guild = playerGuild(start.world);
    const [hero] = unattachedHeroes(start.world);
    if (guild === undefined || hero === undefined) throw new Error('The world is incomplete');
    const recruited = recruit(start, { guildId: guild.id, heroId: hero.id }, deps);
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

  test('advances only the pool stream', () => {
    const deps = quietDeps({ unattachedStayDays: 0 });
    const document = created('streams', deps);
    const world = structuredClone(document.world);
    // Every planned stream, so that each can be seen to stand still.
    Object.assign(world.rng, createStreams(document.meta.seed, plannedStreams), structuredClone(world.rng));
    world.turn = nightOf(0);
    const before = structuredClone(world.rng);

    const events = poolRefresh(world, phaseContext(world, deps, document.history));

    expect(ofType(events, 'hero.left-pool')).toHaveLength(deps.config.unattachedPoolSize);
    const rng = world.rng as Record<string, unknown>;
    for (const name of plannedStreams) {
      if (name === 'pool') expect(rng[name], name).not.toEqual(before.pool);
      else expect(rng[name], name).toEqual((before as Record<string, unknown>)[name]);
    }
  });
});

// 21,600 advances: 4.5 to 6 s on the machine that wrote it, about 0.2 ms a Turn, so a generous timeout.
describe('over twenty years with no recruitment', { timeout: 60_000 }, () => {
  test('world.heroes never holds more Heroes on no Roster than unattachedPoolSize', () => {
    // Only the pool refresh runs: no Rival recruits, no ending stops the game, nothing else moves.
    for (const phase of phases) if (phase.name !== 'poolRefresh') vi.spyOn(phase, 'run').mockReturnValue([]);
    const deps = quietDeps();
    let document = created('twenty-years', deps);
    const onRosters = Object.values(document.world.heroes).filter((hero) => hero.guildId !== null).length;
    const years = 20;
    const turns = years * deps.config.turnsPerYear;

    let most = 0;
    for (let turn = 0; turn < turns; turn += 1) {
      document = advance(document, deps).document;
      let guildless = 0;
      for (const hero of Object.values(document.world.heroes)) if (hero.guildId === null) guildless += 1;
      most = Math.max(most, guildless);
    }

    withValid(document, deps);
    expect(document.world.turn).toBe(turns);
    expect(most).toBe(deps.config.unattachedPoolSize);
    expect(Object.keys(document.world.heroes)).toHaveLength(onRosters + deps.config.unattachedPoolSize);
    // Every departure removed its row: about one a night, and each replaced.
    const departures = count(document.history, 'hero.left-pool');
    expect(departures).toBeGreaterThan((turns / 3) * 0.7);
    expect(count(document.history, 'hero.generated')).toBe(onRosters + deps.config.unattachedPoolSize + departures);
  });
});
