import { afterEach, describe, expect, test, vi } from 'vitest';
import { advance } from './advance.js';
import type { EngineDeps } from './config.js';
import { createWorld } from './create.js';
import type { Entry, GuildId, Guildmaster, GuildmasterId, Hero, HeroId, PatronId, QuestId, WorldDocument } from './document.js';
import { isEngineEvent, isModuleEvent, type ModuleEvent, type TurnEvent } from './events.js';
import { fastForward } from './fast-forward.js';
import { moraleBand } from './morale.js';
import { ModuleError, type Module, type ModuleContext, type ModuleResult, type ReadonlyWorld, type SliceContext } from './modules.js';
import { phases } from './pipeline.js';
import { regardValue } from './regard.js';
import { effectiveStats, offeredQuests, playerGuild, rankings, unattachedHeroes, upkeep } from './selectors.js';
import { deserialise, serialise } from './serialise.js';
import { ageOf, timeOfDay } from './time.js';
import { setup, testDeps, withValid } from './world.test-support.js';

// Phase hooks, effects and stops (ADR-0005 as amended 2026-09-25, data-model §3.4, approach
// §2, DL-77). What a hook is given, what it may change and how, what it returns, and how it stops
// fast forward. Each effect's own rules are effects.test.ts's.

type Hook = NonNullable<Module['onMorning']>;

/** A module with `hooks` and an empty slice; a stream of its own named as it is. */
function moduleWith(id: string, hooks: Partial<Pick<Module, 'onMorning' | 'onAfternoon' | 'onNight'>>): Module {
  return { id, streamName: id, createSlice: () => ({ calls: 0 }), validateSlice: () => [], ...hooks };
}

function withModules(...modules: Module[]): EngineDeps {
  return { ...testDeps(), modules };
}

/** A new world under `deps`, validated. */
function created(seed: string, deps: EngineDeps): WorldDocument {
  return withValid(createWorld(seed, setup, deps).document, deps);
}

/** The saved texts of the worlds some cases share, by key: each case loads a copy of its own (ADR-0008). */
const saved = new Map<string, { text: string; goneId?: HeroId }>();

/** A copy, loaded for `deps`, of the world `make` builds the first time `key` is asked for. */
function loadedCopy(key: string, make: () => { document: WorldDocument; goneId?: HeroId }, deps: EngineDeps): { document: WorldDocument; goneId?: HeroId } {
  let kept = saved.get(key);
  if (kept === undefined) {
    const made = make();
    kept = { text: serialise(made.document), ...(made.goneId === undefined ? {} : { goneId: made.goneId }) };
    saved.set(key, kept);
  }
  const result = deserialise(kept.text, deps);
  if (!result.ok) throw new Error(`Refused: ${JSON.stringify(result)}`);
  return { document: result.document, ...(kept.goneId === undefined ? {} : { goneId: kept.goneId }) };
}

/** A Hero on a Roster in `document`. */
function rosterHero(document: WorldDocument): Hero {
  const hero = Object.values(document.world.heroes).find((row) => row.guildId !== null && row.partyId === null);
  if (hero === undefined) throw new Error('no Hero on a Roster');
  return hero;
}

/** `error` thrown by `work`, which must throw. */
function thrownBy(work: () => unknown): unknown {
  try {
    work();
  } catch (error) {
    return error;
  }
  throw new Error('it did not throw');
}

// ── What a hook is given ─────────────────────────────────────────────────────────────────────

describe('the context a hook is given', () => {
  test("carries the Turn and the core's selectors, reading the Turn's world as the core's selectors read it", () => {
    const seen: Record<string, unknown> = {};
    const reader = moduleWith('reader', {
      onAfternoon: (world, _slice, ctx) => {
        const guildId = Object.keys(world.guilds)[0] as GuildId;
        const hero = Object.values(world.heroes).find((row) => row.guildId !== null) as Hero;
        const patronId = Object.keys(world.patrons)[0] as PatronId;
        Object.assign(seen, {
          turn: ctx.turn,
          guildId,
          heroId: hero.id,
          patronId,
          unattached: ctx.select.unattachedHeroes().map((row) => row.id),
          offered: ctx.select.offeredQuests().map((row) => row.id),
          rankings: ctx.select.rankings('fame'),
          upkeep: ctx.select.upkeep(guildId),
          effectiveStats: ctx.select.effectiveStats(hero.id),
          moraleBand: ctx.select.moraleBand(hero.id),
          regard: ctx.select.regard(patronId, guildId),
          age: ctx.select.age(hero.id),
          guildmasterAge: ctx.select.age(world.guilds[guildId]?.guildmasterId as GuildmasterId),
        });
        return { events: [] };
      },
    });
    const deps = withModules(reader);

    // Turn 1, the first played, is an afternoon, and onAfternoon is its last phase: the world after
    // the Turn is the world the hook read.
    const { document } = advance(created('context', deps), deps);
    const { world } = document;
    const { guildId, heroId, patronId } = seen as { guildId: GuildId; heroId: HeroId; patronId: PatronId };
    const hero = world.heroes[heroId] as Hero;
    const guild = world.guilds[guildId];
    if (guild === undefined) throw new Error('no Guild');

    expect(seen).toEqual({
      turn: 1,
      guildId,
      heroId,
      patronId,
      unattached: unattachedHeroes(world).map((row) => row.id),
      offered: offeredQuests(world).map((row) => row.id),
      rankings: rankings(world, 'fame'),
      upkeep: upkeep(guild, world, deps.config, deps.content),
      effectiveStats: effectiveStats(hero, world, deps.content),
      moraleBand: moraleBand(hero.morale, deps.config),
      regard: regardValue(world.patrons[patronId]?.regard ?? {}, guildId),
      age: ageOf(hero, 1, deps.config),
      guildmasterAge: ageOf(world.guildmasters[guild.guildmasterId] as Guildmaster, 1, deps.config),
    });
  });

  test('a selector throws on an id the world does not hold: a programming error, naming the module', () => {
    const deps = withModules(moduleWith('lost', { onAfternoon: (_world, _slice, ctx) => (ctx.select.upkeep('guild-999999' as GuildId), { events: [] }) }));

    expect(thrownBy(() => advance(created('lost', deps), deps))).toMatchObject({ name: 'ModuleError', moduleId: 'lost' });
  });

  test('has no selector that says which Guild is the player’s: a module is a rule, and no rule asks (ADR-0002)', () => {
    let keys: string[] = [];
    const deps = withModules(moduleWith('keys', { onAfternoon: (_world, _slice, ctx) => ((keys = Object.keys(ctx.select)), { events: [] }) }));
    advance(created('keys', deps), deps);

    expect(keys.sort()).toEqual(['age', 'effectiveStats', 'moraleBand', 'offeredQuests', 'rankings', 'regard', 'unattachedHeroes', 'upkeep']);
  });
});

// ── The frozen-world test ──────────────────────────────────────────────────────

describe('the effects API is the only way a module can change a Hero: the frozen-world test', () => {
  test('a module that assigns world.heroes[id].morale directly fails the Turn, naming it, and changes nothing', () => {
    const plain = created('frozen', testDeps());
    const heroId = rosterHero(plain).id;
    const meddler = moduleWith('meddler', {
      onAfternoon: (world) => {
        const hero = world.heroes[heroId];
        if (hero !== undefined) {
          // @ts-expect-error: the World State a hook is given is read-only, in the types as at run time
          hero.morale = 0;
        }
        return { events: [] };
      },
    });
    const deps = withModules(meddler);
    const document = created('frozen', deps);
    const before = serialise(document);

    const thrown = thrownBy(() => advance(document, deps));

    expect(thrown).toBeInstanceOf(ModuleError);
    expect(thrown).toMatchObject({ moduleId: 'meddler', during: 'onAfternoon' });
    expect((thrown as ModuleError).cause).toBeInstanceOf(TypeError);
    expect(serialise(document)).toBe(before);
    expect(document.world.heroes[heroId]?.morale).toBe(plain.world.heroes[heroId]?.morale);
  });

  test('the same change through ctx.effects.adjustMorale is made, with its event', () => {
    const plain = created('frozen', testDeps());
    const hero = rosterHero(plain);
    const mender = moduleWith('mender', {
      onAfternoon: (_world, _slice, ctx) => {
        const result = ctx.effects.adjustMorale({ heroId: hero.id, delta: -hero.morale });
        return { events: result.ok ? result.events : [] };
      },
    });
    const deps = withModules(mender);

    const turn = advance(created('frozen', deps), deps);

    expect(withValid(turn.document, deps).world.heroes[hero.id]?.morale).toBe(0);
    expect(turn.events.filter((event) => event.type === 'hero.morale-changed')).toEqual([
      expect.objectContaining({ payload: expect.objectContaining({ heroId: hero.id, cause: 'module', after: 0, moduleId: 'mender' }) }),
    ]);
  });

  /** A Hero on a Roster in `world`, as the hook sees it. */
  const heroIn = (world: ReadonlyWorld): NonNullable<ReadonlyWorld['heroes'][HeroId]> => {
    const hero = Object.values(world.heroes).find((row) => row.guildId !== null && row.partyId === null);
    if (hero === undefined) throw new Error('no Hero on a Roster');
    return hero;
  };

  /** What `Object.getOwnPropertyDescriptor` (or `Reflect`'s) gives for `key` of `of`: its value, untyped. */
  const described = (of: object, key: string): { value: Record<string, unknown> } =>
    Object.getOwnPropertyDescriptor(of, key) as { value: Record<string, unknown> };

  const writes: [string, (world: ReadonlyWorld, ctx: ModuleContext) => void][] = [
    ['pushing a Quest onto the Board', (world) => (world.board as QuestId[]).push('quest-999999' as QuestId)],
    ['sorting the Board in place', (world) => (world.board as QuestId[]).sort()],
    ['deleting a Quest', (world) => delete (world.quests as Record<string, unknown>)[world.board[0] as string]],
    ["adding to a Guild's Wealth", (world) => ((Object.values(world.guilds)[0] as { wealth: number }).wealth += 100)],
    ['replacing a table', (world) => ((world as { heroes: unknown }).heroes = {})],
    ["writing another module's slice through the world", (world) => ((world.modules as Record<string, unknown>).other = {})],
    ['writing into a row a selector returned', (_world, ctx) => ((ctx.select.unattachedHeroes()[0] as { morale: number }).morale = 0)],
    ['writing to the rules', (_world, ctx) => ((ctx.config as { boardSize: number }).boardSize = 99)],
    ['writing to the content', (_world, ctx) => ((ctx.content as { id: string }).id = 'mine')],
    // DL-77 item 1's other refusals: a define, a prototype change and an extensibility change.
    ["defining a Hero's Morale", (world) => Object.defineProperty(heroIn(world), 'morale', { value: 0 })],
    ["changing a Hero's prototype", (world) => Object.setPrototypeOf(heroIn(world), null)],
    ["preventing extensions of a Hero's Regard", (world) => Object.preventExtensions(heroIn(world).regard)],
    ["freezing a Guild's Roster", (world) => Object.freeze(Object.values(world.guilds)[0]?.rosterIds)],
    // A property read through its descriptor is a view too (M8 verification, DL-80).
    ["writing a Hero's Morale through Object.getOwnPropertyDescriptor", (world) => (described(world.heroes, heroIn(world).id).value.morale = 1)],
    ["writing a Hero's Morale through Reflect.getOwnPropertyDescriptor", (world) => {
      (Reflect.getOwnPropertyDescriptor(world.heroes, heroIn(world).id) as { value: { morale: number } }).value.morale = 1;
    }],
    ["writing every Guild's Wealth through Object.getOwnPropertyDescriptors", (world) => {
      for (const { value } of Object.values(Object.getOwnPropertyDescriptors(world.guilds))) (value as { wealth: number }).wealth = 777;
    }],
    ['moving a core stream through its descriptor', (world) => ((described(world, 'rng').value.quests as Record<number, number>)[0] = 42)],
    ["writing another module's slice through its descriptor", (world) => (described(world, 'modules').value.other = {})],
    ["writing into a shallow clone of a Hero's row, whose Regard is the row's", (world) => {
      const hero = heroIn(world);
      const clone = Object.create(Object.getPrototypeOf(hero) as object, Object.getOwnPropertyDescriptors(hero)) as { regard: Record<string, unknown> };
      clone.regard['hero-999999'] = { value: 1, since: 0, reason: 'writer' };
    }],
  ];

  test.each(writes)('%s fails the Turn too, naming the module', (_what, write) => {
    const deps = withModules(moduleWith('writer', { onAfternoon: (world, _slice, ctx) => (write(world, ctx), { events: [] }) }));
    const { document } = loadedCopy('writes', () => ({ document: created('writes', deps) }), deps);
    const before = serialise(document);

    const thrown = thrownBy(() => advance(document, deps));

    expect(thrown).toMatchObject({ name: 'ModuleError', moduleId: 'writer', during: 'onAfternoon' });
    expect((thrown as ModuleError).cause).toBeInstanceOf(TypeError);
    expect(serialise(document)).toBe(before);
    expect(deps.config.boardSize).toBe(testDeps().config.boardSize);
  });

  // ADR-0011, DL-203: a write-once row is frozen and shared by the per-Turn copy. The view
  // hands back a frozen object's own properties as they are, as a Proxy must, so a module reads such a
  // row whole; and a write to it, through the view or into what it handed back, still fails the Turn.
  /** A new world under `deps` whose first pool Hero has left the pool, their row kept: written once. */
  const withGone = (deps: EngineDeps): { document: WorldDocument; goneId: HeroId } => {
    const id = deps.modules?.[0]?.id ?? '';
    const { document, goneId } = loadedCopy(`gone-${id}`, () => {
      const made = created('gone', deps);
      const gone = Object.values(made.world.heroes).find((row) => row.unattachedSince !== null) as Hero;
      Object.assign(gone, { unattachedSince: null, leftPoolOnTurn: 0 });
      return { document: made, goneId: gone.id };
    }, deps);
    return { document, goneId: goneId as HeroId };
  };

  test('a module reads a write-once row, frozen and shared, through the view as it is', () => {
    let goneId = '' as HeroId;
    let read = '';
    let parts: string[] = [];
    const reader = moduleWith('reader', {
      onAfternoon: (world) => {
        const hero = world.heroes[goneId] as NonNullable<ReadonlyWorld['heroes'][HeroId]>;
        read = JSON.stringify(hero);
        parts = [
          ...Object.keys(Object.getOwnPropertyDescriptors(hero)),
          ...Object.keys(hero.stats),
          String(hero.traits.length),
          String(Reflect.getOwnPropertyDescriptor(hero, 'regard')?.value === hero.regard),
        ];
        return { events: [] };
      },
    });
    const deps = withModules(reader);
    const given = withGone(deps);
    goneId = given.goneId;
    const row = given.document.world.heroes[goneId] as Hero;

    const { document: next } = advance(given.document, deps);

    expect(Object.isFrozen(row) && Object.isFrozen(row.stats) && Object.isFrozen(row.regard)).toBe(true);
    expect(next.world.heroes[goneId]).toBe(row);
    expect(read).toBe(JSON.stringify(row));
    expect(parts).toEqual([...Object.keys(row), ...Object.keys(row.stats), String(row.traits.length), 'true']);
  });

  test.each<[string, (hero: NonNullable<ReadonlyWorld['heroes'][HeroId]>) => void]>([
    ["the row's Morale, through the view", (hero) => ((hero as { morale: number }).morale = 0)],
    ['a Stat, in the frozen Stats the view handed back', (hero) => ((hero.stats as Record<string, number>).strength = 1)],
    ['a Trait, pushed onto the frozen list the view handed back', (hero) => (hero.traits as string[]).push('brave')],
    ['a Regard, in the frozen map the view handed back', (hero) => ((hero.regard as Record<string, unknown>)['hero-999999'] = { value: 1, since: 0, reason: 'writer' })],
  ])('writing a write-once row, %s, fails the Turn, naming the module', (_what, write) => {
    let goneId = '' as HeroId;
    const deps = withModules(moduleWith('writer', { onAfternoon: (world) => (write(world.heroes[goneId] as NonNullable<ReadonlyWorld['heroes'][HeroId]>), { events: [] }) }));
    const given = withGone(deps);
    goneId = given.goneId;
    const before = serialise(given.document);

    const thrown = thrownBy(() => advance(given.document, deps));

    expect(thrown).toMatchObject({ name: 'ModuleError', moduleId: 'writer', during: 'onAfternoon' });
    expect((thrown as ModuleError).cause).toBeInstanceOf(TypeError);
    expect(serialise(given.document)).toBe(before);
  });

  // A front end's rules and content are not frozen: the CLI spreads a save's rules over the defaults,
  // and loadContent's content is shared by every game in the process. Neither may be changed through
  // a descriptor (M8 verification, DL-80).
  test.each<[string, (ctx: ModuleContext) => void, (deps: EngineDeps) => unknown]>([
    [
      'the rules, through a descriptor',
      (ctx) => (described(ctx.config, 'moraleBands').value.elated = 21),
      (deps) => deps.config.moraleBands.elated,
    ],
    [
      'the content, through a descriptor',
      (ctx) => {
        const injuries = described(ctx.content, 'injuries').value;
        (injuries[Object.keys(injuries)[0] as string] as { healDaysMax: number }).healDaysMax = 1;
      },
      (deps) => Object.values(deps.content.injuries)[0]?.healDaysMax,
    ],
  ])('writing to %s fails the Turn when neither is frozen, and changes neither', (_what, write, read) => {
    const plain = testDeps();
    const deps: EngineDeps = {
      config: structuredClone(plain.config),
      content: structuredClone(plain.content),
      modules: [moduleWith('writer', { onAfternoon: (_world, _slice, ctx) => (write(ctx), { events: [] }) })],
    };
    const was = read(deps);

    expect(thrownBy(() => advance(created('writes-deps', deps), deps))).toMatchObject({ name: 'ModuleError', moduleId: 'writer' });
    expect(read(deps)).toBe(was);
  });

  test('reading through a descriptor reads the world as it stands, and a view reads equal to itself', () => {
    let seen: unknown[] = [];
    const deps = withModules(
      moduleWith('reader', {
        onAfternoon: (world) => {
          const hero = heroIn(world);
          const viaDescriptor = described(world.heroes, hero.id).value;
          seen = [viaDescriptor === hero, viaDescriptor.morale, hero.morale];
          return { events: [] };
        },
      }),
    );

    advance(created('descriptor-reads', deps), deps);

    expect(seen[0]).toBe(true);
    expect(seen[1]).toBe(seen[2]);
  });

  test('a module still changes its own slice in place, and reads the world as it stands', () => {
    const counter = moduleWith('counter', {
      onAfternoon: (world, slice, ctx) => {
        const own = slice as { calls: number; turn?: number };
        own.calls += 1;
        own.turn = world.turn;
        expect(world.heroes).toBe(world.heroes);
        expect(ctx.turn).toBe(world.turn);
        return { events: [] };
      },
    });
    const deps = withModules(counter);

    const { document } = advance(created('slice', deps), deps);

    expect(withValid(document, deps).world.modules.counter).toEqual({ calls: 1, turn: 1 });
  });
});

// ── Hook order ─────────────────────────────────────────────────────────────────

describe('hook order among several modules is registration order', () => {
  /** A module whose three hooks are spies, each emitting `<id>.heard`. */
  function spyModule(id: string) {
    const heard: Hook = (_world, _slice, ctx) => ({ events: [ctx.emit({ type: `${id}.heard`, participants: [], payload: { turn: ctx.turn } })] });
    return { id, createSlice: () => ({}), validateSlice: () => [], onMorning: vi.fn(heard), onAfternoon: vi.fn(heard), onNight: vi.fn(heard) };
  }

  test.each([
    ['zeta', 'alpha'],
    ['alpha', 'zeta'],
  ])('registered %s then %s, each hook calls them in that order, and their events follow it', (firstId, secondId) => {
    const first = spyModule(firstId);
    const second = spyModule(secondId);
    const deps = withModules(first, second);
    let document = created('order', deps);
    const types: string[][] = [];

    // Turns 1 to 3: an afternoon, a night and a morning.
    for (let turn = 1; turn <= 3; turn += 1) {
      const played = advance(document, deps);
      document = withValid(played.document, deps);
      types.push(played.events.filter(isModuleEvent).map((event) => event.type));
    }

    for (const hook of ['onMorning', 'onAfternoon', 'onNight'] as const) {
      expect(first[hook], hook).toHaveBeenCalledTimes(1);
      expect(second[hook], hook).toHaveBeenCalledTimes(1);
      const [firstCall] = first[hook].mock.invocationCallOrder;
      const [secondCall] = second[hook].mock.invocationCallOrder;
      expect(firstCall, hook).toBeLessThan(secondCall as number);
    }
    expect(types).toEqual([1, 2, 3].map(() => [`${firstId}.heard`, `${secondId}.heard`]));
    expect([1, 2, 3].map(timeOfDay)).toEqual(['afternoon', 'night', 'morning']);
  });
});

// ── A module's stop ─────────────────────────────────────────

describe("a module's stop", () => {
  /** A module asking for a stop at every afternoon from Turn `from` on. */
  function alarm(id = 'alarm', from = 1): Module {
    return moduleWith(id, {
      onAfternoon: (_world, _slice, ctx): ModuleResult => (ctx.turn >= from ? { events: [], stop: { kind: 'module', moduleId: id } } : { events: [] }),
    });
  }

  function forward(document: WorldDocument, deps: EngineDeps, maxTurns = 60) {
    const guildId = playerGuild(document.world)?.id;
    if (guildId === undefined) throw new Error('no player Guild');
    return fastForward(document, { guildId, until: [], maxTurns }, deps);
  }

  test('halts fast forward after the Turn whose hook asked, with { kind: module, moduleId }', () => {
    const plainDeps = testDeps();
    const deps = withModules(alarm());

    const without = forward(created('alarm', plainDeps), plainDeps);
    const result = forward(created('alarm', deps), deps);

    // Without the module the same fast forward plays past Turn 1, the first afternoon, and stops for
    // a reason of its own; with it, it stops after Turn 1, for the module.
    expect(without.document.world.turn).toBeGreaterThan(1);
    expect(without.stoppedBecause.kind).not.toBe('module');
    expect(result.stoppedBecause).toEqual({ kind: 'module', moduleId: 'alarm' });
    expect(withValid(result.document, deps).world.turn).toBe(1);
    expect(timeOfDay(1)).toBe('afternoon');
  });

  test('a later stop halts it later: the Turn it was asked in, and no other', () => {
    const deps = withModules(alarm('alarm', 7));
    let document = created('alarm-later', deps);
    const guildId = playerGuild(document.world)?.id as GuildId;
    const stops: [number, string][] = [];

    // Fast forward again and again, as a player would, until the module's stop comes.
    for (let tries = 0; tries < 20 && document.world.turn < 7; tries += 1) {
      const result = fastForward(document, { guildId, until: [], maxTurns: 60 }, deps);
      document = result.document;
      stops.push([document.world.turn, result.stoppedBecause.kind]);
    }

    expect(stops.at(-1)).toEqual([7, 'module']);
    expect(stops.slice(0, -1).every(([, kind]) => kind !== 'module')).toBe(true);
  });

  test('stops it whether or not the caller lists module in until, and advance reports it for anyone watching', () => {
    const deps = withModules(alarm());
    const document = created('alarm', deps);
    const guildId = playerGuild(document.world)?.id as GuildId;

    const listed = fastForward(document, { guildId, until: ['module'], maxTurns: 10 }, deps);
    const played = advance(document, deps);

    expect(listed.stoppedBecause).toEqual({ kind: 'module', moduleId: 'alarm' });
    expect(played.stoppedBecause).toEqual({ kind: 'module', moduleId: 'alarm' });
  });

  test('the first module to ask, in registration order, is the one named', () => {
    const deps = withModules(alarm('first'), alarm('second'));

    expect(forward(created('two-alarms', deps), deps).stoppedBecause).toEqual({ kind: 'module', moduleId: 'first' });
  });

  test.each([
    ["another module's", { kind: 'module', moduleId: 'someone-else' }],
    ['another kind of', { kind: 'ended' }],
  ])("a hook asking for %s stop fails the Turn, naming the module", (_what, stop) => {
    const deps = withModules(moduleWith('liar', { onAfternoon: () => ({ events: [], stop } as unknown as ModuleResult) }));

    expect(thrownBy(() => advance(created('liar', deps), deps))).toMatchObject({ name: 'ModuleError', moduleId: 'liar' });
  });
});

// ── A module's own events (DL-77) ────────────────────────────────────────────────────────────

describe("a module's own events", () => {
  test("ctx.emit makes the module's event, typed <id>.<what>, labelled as the engine labels, not a Milestone unless asked", () => {
    let heroId = '' as HeroId;
    const herald = moduleWith('herald', {
      onAfternoon: (world, _slice, ctx) => {
        const hero = Object.values(world.heroes).find((row) => row.guildId !== null) as Hero;
        heroId = hero.id;
        return {
          events: [
            ctx.emit({ type: 'herald.cried', participants: [hero.id], payload: { heroId: hero.id } }),
            ctx.emit({ type: 'herald.crowned', participants: [], payload: {}, milestone: true }),
          ],
        };
      },
    });
    const deps = withModules(herald);

    const turn = advance(created('herald', deps), deps);
    const document = withValid(turn.document, deps);

    const hero = document.world.heroes[heroId] as Hero;
    const guildId = hero.guildId as GuildId;
    const [cried, crowned] = turn.events.filter(isModuleEvent);
    expect(cried).toEqual({
      turn: 1,
      type: 'herald.cried',
      participants: [heroId, guildId],
      labels: { [heroId]: hero.name, [guildId]: document.world.guilds[guildId]?.name },
      milestone: false,
      payload: { heroId },
    });
    expect(crowned).toMatchObject({ type: 'herald.crowned', milestone: true });
    const { history } = document;
    expect(history.byType['herald.cried']?.map((position) => history.entries[position])).toEqual([cried]);
    expect(history.milestones.map((position) => history.entries[position])).toContain(crowned);
  });

  test.each(['world.created', 'hero.died', 'other.fired', 'herald.', 'heraldic.cried'])(
    'ctx.emit refuses the type %s, outside its namespace or the engine’s: a programming error, naming the module',
    (type) => {
      const deps = withModules(moduleWith('herald', { onAfternoon: (_world, _slice, ctx) => ({ events: [ctx.emit({ type: type as `${string}.${string}`, participants: [], payload: {} })] }) }));

      expect(thrownBy(() => advance(created('refused', deps), deps))).toMatchObject({ name: 'ModuleError', moduleId: 'herald' });
    },
  );

  // A module may be named as an engine namespace is: its namespace check then passes an engine type,
  // and only the check that the type is not one of the engine's refuses it (DL-77 item 4).
  test.each([
    ['hero', 'hero.died'],
    ['guild', 'guild.wealth-changed'],
    ['world', 'world.created'],
  ])('a module named %s is refused the engine’s own %s, naming the module', (id, type) => {
    const deps = withModules(moduleWith(id, { onAfternoon: (_world, _slice, ctx) => ({ events: [ctx.emit({ type: type as `${string}.${string}`, participants: [], payload: {} })] }) }));
    const document = created('engine-namespace', deps);
    const before = serialise(document);

    const thrown = thrownBy(() => advance(document, deps));

    expect(thrown).toMatchObject({ name: 'ModuleError', moduleId: id, during: 'onAfternoon' });
    expect((thrown as Error).message).toContain(type);
    expect(serialise(document)).toBe(before);
  });

  test("isEngineEvent and isModuleEvent tell the engine's events from a module's, in the Turn and in the History", () => {
    const deps = withModules(moduleWith('herald', { onAfternoon: (_world, _slice, ctx) => ({ events: [ctx.emit({ type: 'herald.cried', participants: [], payload: {} })] }) }));

    const turn = advance(created('told-apart', deps), deps);

    const typed = (event: TurnEvent | Entry) => (isEngineEvent(event) ? 'engine' : 'module');
    expect(turn.events.filter(isModuleEvent).map((event) => event.type)).toEqual(['herald.cried']);
    expect(turn.events.filter(isEngineEvent).length).toBe(turn.events.length - 1);
    expect(turn.document.history.entries.filter((entry) => typed(entry) === 'module').map((entry) => entry.type)).toEqual(['herald.cried']);
  });

  test('a module types its own events, and narrows them by its own type', () => {
    type Cried = ModuleEvent<'herald.cried', { times: number }>;
    let made: Cried | undefined;
    const deps = withModules(
      moduleWith('herald', {
        onAfternoon: (_world, _slice, ctx) => {
          made = ctx.emit({ type: 'herald.cried', participants: [], payload: { times: 3 } });
          return { events: [made] };
        },
      }),
    );

    advance(created('typed', deps), deps);

    expect(made?.type === 'herald.cried' && made.payload.times).toBe(3);
  });
});

// ── What a hook returns ──────────────────────────────────────────────────────────────────────

describe('what a hook returns', () => {
  test("a hook that applies an effect and leaves out its event fails the Turn: a core row changed with nothing to explain it", () => {
    const heroId = rosterHero(created('silent', testDeps())).id;
    const silent = moduleWith('silent', {
      onAfternoon: (_world, _slice, ctx) => {
        ctx.effects.adjustMorale({ heroId, delta: -1 });
        return { events: [] };
      },
    });
    const deps = withModules(silent);
    const document = created('silent', deps);
    const before = serialise(document);

    expect(thrownBy(() => advance(document, deps))).toMatchObject({ name: 'ModuleError', moduleId: 'silent', during: 'onAfternoon' });
    expect(serialise(document)).toBe(before);
  });

  test('a hook that returns an event it did not make in that call, or one twice, fails the Turn', () => {
    let kept: TurnEvent | undefined;
    const hoarder = moduleWith('hoarder', {
      onAfternoon: (_world, _slice, ctx) => {
        kept = ctx.emit({ type: 'hoarder.kept', participants: [], payload: {} });
        return { events: [kept] };
      },
      onNight: () => ({ events: kept === undefined ? [] : [kept] }),
    });
    const twice = moduleWith('twice', {
      onAfternoon: (_world, _slice, ctx) => {
        const event = ctx.emit({ type: 'twice.said', participants: [], payload: {} });
        return { events: [event, event] };
      },
    });
    const hoarding = withModules(hoarder);
    const afternoon = advance(created('hoard', hoarding), hoarding);

    expect(thrownBy(() => advance(afternoon.document, hoarding))).toMatchObject({ name: 'ModuleError', moduleId: 'hoarder', during: 'onNight' });
    expect(thrownBy(() => advance(created('twice', withModules(twice)), withModules(twice)))).toMatchObject({ moduleId: 'twice' });
  });

  test("a hook returns its own events and its effects' in the order it chooses, which the History keeps", () => {
    const heroId = rosterHero(created('ordered', testDeps())).id;
    const teller = moduleWith('teller', {
      onAfternoon: (_world, _slice, ctx) => {
        const told = ctx.emit({ type: 'teller.began', participants: [], payload: {} });
        const result = ctx.effects.adjustMorale({ heroId, delta: -1 });
        return { events: [told, ...(result.ok ? result.events : []), ctx.emit({ type: 'teller.ended', participants: [], payload: {} })] };
      },
    });
    const deps = withModules(teller);

    const turn = advance(created('ordered', deps), deps);

    const types = turn.events.map((event) => event.type as string);
    const at = types.indexOf('teller.began');
    expect(types.slice(at, at + 3)).toEqual(['teller.began', 'hero.morale-changed', 'teller.ended']);
    const { entries } = turn.document.history;
    expect(entries.slice(-types.length).map((entry) => entry.type)).toEqual(types);
  });
});

// ── What a hook is handed back is the History's (M8 verification, DL-80) ─────────────────────

describe('the events a hook is handed are the History’s own: settled, and no module changes one', () => {
  test("rewriting an effect's event before returning it fails the Turn, naming the module, and changes nothing", () => {
    const heroId = rosterHero(created('forger', testDeps())).id;
    const forger = moduleWith('forger', {
      onAfternoon: (_world, _slice, ctx) => {
        const result = ctx.effects.adjustMorale({ heroId, delta: -1 });
        if (!result.ok) return { events: [] };
        const [event] = result.events as unknown as [{ payload: Record<string, unknown> }];
        event.payload.after = 100;
        event.payload.cause = 'recovery';
        event.payload.moduleId = 'someone-else';
        return { events: result.events };
      },
    });
    const deps = withModules(forger);
    const document = created('forger', deps);
    const before = serialise(document);

    const thrown = thrownBy(() => advance(document, deps));

    expect(thrown).toMatchObject({ name: 'ModuleError', moduleId: 'forger', during: 'onAfternoon' });
    expect((thrown as ModuleError).cause).toBeInstanceOf(TypeError);
    expect(serialise(document)).toBe(before);
  });

  test.each([
    ['its own event to an engine type', 'own'],
    ["an effect's event to another engine type", 'effect'],
  ] as const)('retyping %s fails the Turn, naming the module', (_what, which) => {
    const heroId = rosterHero(created('retyper', testDeps())).id;
    const retyper = moduleWith('retyper', {
      onAfternoon: (_world, _slice, ctx) => {
        const result = ctx.effects.adjustMorale({ heroId, delta: -1 });
        const effectEvents = result.ok ? result.events : [];
        const noted = ctx.emit({ type: 'retyper.noted', participants: [heroId], payload: {} });
        const target = (which === 'own' ? noted : effectEvents[0]) as unknown as { type: string; milestone: boolean };
        target.type = which === 'own' ? 'hero.retired' : 'hero.died';
        target.milestone = true;
        return { events: [noted, ...effectEvents] };
      },
    });
    const deps = withModules(retyper);

    expect(thrownBy(() => advance(created('retyper', deps), deps))).toMatchObject({ name: 'ModuleError', moduleId: 'retyper' });
  });

  test('an event kept from an earlier Turn and rewritten in a later one fails that Turn, and the History keeps what happened', () => {
    const heroId = rosterHero(created('keeper', testDeps())).id;
    let kept: TurnEvent | undefined;
    const keeper = moduleWith('keeper', {
      onAfternoon: (_world, _slice, ctx) => {
        const result = ctx.effects.adjustMorale({ heroId, delta: -1 });
        kept = result.ok ? result.events[0] : undefined;
        return { events: result.ok ? result.events : [] };
      },
      onNight: () => {
        ((kept as TurnEvent).payload as { after: number }).after = 9999;
        return { events: [] };
      },
    });
    const deps = withModules(keeper);
    const afternoon = advance(created('keeper', deps), deps);
    const morale = afternoon.document.world.heroes[heroId]?.morale;
    const saved = serialise(afternoon.document);

    expect(thrownBy(() => advance(afternoon.document, deps))).toMatchObject({ name: 'ModuleError', moduleId: 'keeper', during: 'onNight' });
    expect(serialise(afternoon.document)).toBe(saved);
    const inHistory = afternoon.document.history.entries.find((entry) => entry === kept);
    expect(inHistory?.payload).toMatchObject({ heroId, after: morale, cause: 'module', moduleId: 'keeper' });
  });

  test("a payload the module keeps and changes after emitting it leaves the History's entry as it was emitted", () => {
    const payload = { told: 1 };
    const teller = moduleWith('teller', {
      onAfternoon: (_world, _slice, ctx) => {
        const event = ctx.emit({ type: 'teller.told', participants: [], payload });
        payload.told = 2;
        return { events: [event] };
      },
    });
    const deps = withModules(teller);

    const turn = advance(created('teller', deps), deps);

    expect(payload.told).toBe(2);
    const told = turn.document.history.entries.filter((entry) => entry.type === 'teller.told');
    expect(told.map((entry) => entry.payload)).toEqual([{ told: 1 }]);
    expect(Object.isFrozen(told[0]) && Object.isFrozen(told[0]?.payload)).toBe(true);
  });
});

// ── A hook's context lasts for its call (M8 verification, DL-80) ─────────────────────────────

describe("a hook's context works for the call it was given to, and throws after", () => {
  test("another module's kept effects, used in a later hook of the same Turn, fail that hook, and no core row changes without its event", () => {
    let kept: ModuleContext | undefined;
    const alpha = moduleWith('alpha', {
      onAfternoon: (_world, _slice, ctx) => {
        kept = ctx;
        return { events: [] };
      },
    });
    const beta = moduleWith('beta', {
      onAfternoon: (world) => {
        const result = kept?.effects.adjustWealth({ guildId: Object.keys(world.guilds)[0] as GuildId, delta: 5000 });
        return { events: result?.ok === true ? result.events : [] };
      },
    });
    const deps = withModules(alpha, beta);
    const document = created('kept-effects', deps);
    const before = serialise(document);

    const thrown = thrownBy(() => advance(document, deps));

    expect(thrown).toMatchObject({ name: 'ModuleError', moduleId: 'beta', during: 'onAfternoon' });
    expect((thrown as Error).message).toContain('alpha');
    expect(serialise(document)).toBe(before);
  });

  test('its own kept effects, used at its next hook, fail that Turn and leave the document the caller holds as it was', () => {
    let kept: ModuleContext | undefined;
    const hoarder = moduleWith('hoarder', {
      onAfternoon: (_world, _slice, ctx) => {
        kept = ctx;
        return { events: [] };
      },
      onNight: (world) => {
        const result = kept?.effects.adjustWealth({ guildId: Object.keys(world.guilds)[0] as GuildId, delta: 1_000_000 });
        return { events: result?.ok === true ? result.events : [] };
      },
    });
    const deps = withModules(hoarder);
    const afternoon = advance(created('kept-next', deps), deps).document;
    const held = serialise(afternoon);

    expect(thrownBy(() => advance(afternoon, deps))).toMatchObject({ name: 'ModuleError', moduleId: 'hoarder', during: 'onNight' });
    expect(serialise(afternoon)).toBe(held);
  });

  test('every function of a kept context throws once its hook has returned: emit, rng, select and effects', () => {
    let kept: ModuleContext | undefined;
    let heroId = '' as HeroId;
    const deps = withModules(
      moduleWith('keeper', {
        onAfternoon: (world, _slice, ctx) => {
          kept = ctx;
          heroId = (Object.values(world.heroes).find((row) => row.guildId !== null) as Hero).id;
          return { events: [] };
        },
      }),
    );
    const document = advance(created('kept-context', deps), deps).document;
    const held = serialise(document);
    const ctx = kept as ModuleContext;

    const uses: [string, () => unknown][] = [
      ['emit', () => ctx.emit({ type: 'keeper.late', participants: [], payload: {} })],
      ['rng.next', () => ctx.rng.next()],
      ['rng.pick', () => ctx.rng.pick([1, 2])],
      ['select.moraleBand', () => ctx.select.moraleBand(heroId)],
      ['select.rankings', () => ctx.select.rankings('fame')],
      ['effects.adjustMorale', () => ctx.effects.adjustMorale({ heroId, delta: -1 })],
    ];
    for (const [what, use] of uses) expect(thrownBy(use), what).toBeInstanceOf(RangeError);
    expect(serialise(document)).toBe(held);
  });

  test('the stream createSlice is given throws once createSlice has returned', () => {
    let kept: ModuleContext['rng'] | undefined;
    const deps = withModules({
      ...moduleWith('early', {}),
      createSlice: (ctx) => {
        kept = ctx.rng;
        return { calls: 0 };
      },
    });
    const document = created('kept-slice-rng', deps);
    const held = serialise(document);

    expect(thrownBy(() => kept?.next())).toBeInstanceOf(RangeError);
    expect(serialise(document)).toBe(held);
  });

  test('a stop the hook keeps and changes after it returned does not change what advance reported', () => {
    const stop = { kind: 'module', moduleId: 'alarm' } as { kind: 'module'; moduleId: string };
    const deps = withModules(moduleWith('alarm', { onAfternoon: () => ({ events: [], stop }) }));

    const played = advance(created('kept-stop', deps), deps);
    stop.moduleId = 'someone-else';

    expect(played.stoppedBecause).toEqual({ kind: 'module', moduleId: 'alarm' });
  });
});

// ── The context createSlice is given (DL-76) ──────────────────────────────────────────

describe('the context createSlice is given', () => {
  test('carries the Turn of the world the slice is made in: a save first played with the module, not 0', () => {
    const turns: number[] = [];
    const late: Module = { ...moduleWith('late', {}), createSlice: (ctx) => (turns.push(ctx.turn), { calls: 0 }) };
    let document = created('late-slice', testDeps());
    for (let turn = 1; turn <= 4; turn += 1) document = advance(document, testDeps()).document;
    const deps = withModules(late);

    const played = advance(document, deps);

    expect(turns).toEqual([4]);
    expect(withValid(played.document, deps).world.modules.late).toEqual({ calls: 0 });
  });

  test.each<[string, (ctx: SliceContext) => void]>([
    ['the rules', (ctx) => ((ctx.config as { boardSize: number }).boardSize = 99)],
    ['the content', (ctx) => ((ctx.content as { id: string }).id = 'mine')],
  ])('holds %s read-only: a write fails createWorld, naming the module, and changes nothing', (_what, write) => {
    const deps: EngineDeps = {
      config: structuredClone(testDeps().config),
      content: structuredClone(testDeps().content),
      modules: [{ ...moduleWith('writer', {}), createSlice: (ctx) => (write(ctx), { calls: 0 }) }],
    };
    const [boardSize, id] = [deps.config.boardSize, deps.content.id];

    const thrown = thrownBy(() => createWorld('slice-writes', setup, deps));

    expect(thrown).toMatchObject({ name: 'ModuleError', moduleId: 'writer', during: 'createSlice' });
    expect((thrown as ModuleError).cause).toBeInstanceOf(TypeError);
    expect([deps.config.boardSize, deps.content.id]).toEqual([boardSize, id]);
  });
});

// ── Which stop advance reports (DL-77 item 6) ────────────────────────────────────────────────

describe('when the game ends on the Turn a module asks to stop', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('advance reports the ending, which comes before any module’s stop', () => {
    const endings = phases.find((phase) => phase.name === 'endings');
    if (endings === undefined) throw new Error('no endings phase');
    vi.spyOn(endings, 'run').mockImplementation((world) => {
      world.ended = { turn: world.turn, reason: 'bankruptcy' };
      return [];
    });
    const alarm = moduleWith('alarm', { onNight: () => ({ events: [], stop: { kind: 'module', moduleId: 'alarm' } }) });
    const deps = withModules(alarm);
    const afternoon = advance(created('ending-and-stop', deps), deps).document;

    // Turn 2, a night: the module asks to stop at its hook, then the ending checks end the game.
    const night = advance(afternoon, deps);

    expect(night.document.world.ended).toEqual({ turn: 2, reason: 'bankruptcy' });
    expect(night.stoppedBecause).toEqual({ kind: 'ended' });
  });
});
