import { describe, expect, test, vi } from 'vitest';
import { advance } from './advance.js';
import type { EngineDeps } from './config.js';
import { createWorld } from './create.js';
import type { Entry, GuildId, Hero, HeroId, PatronId, QuestId, WorldDocument } from './document.js';
import { isEngineEvent, isModuleEvent, type ModuleEvent, type TurnEvent } from './events.js';
import { fastForward } from './fast-forward.js';
import { moraleBand } from './morale.js';
import { ModuleError, type Module, type ModuleContext, type ModuleResult, type ReadonlyWorld } from './modules.js';
import { regardValue } from './regard.js';
import { effectiveStats, offeredQuests, playerGuild, rankings, unattachedHeroes, upkeep } from './selectors.js';
import { serialise } from './serialise.js';
import { ageOf, timeOfDay } from './time.js';
import { testDeps, withValid } from './world.test-support.js';

// M8-S2: phase hooks, effects and stops (ADR-0005 as amended 2026-09-25, data-model §3.4, approach
// §2, DL-77). What a hook is given, what it may change and how, what it returns, and how it stops
// fast forward. Each effect's own rules are effects.test.ts's.

const setup = { guildmasterName: 'Ada', guildName: 'The Test', createdAt: 'test' };

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

// ── The frozen-world test (M8-S2 box 2) ──────────────────────────────────────────────────────

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
  ];

  test.each(writes)('%s fails the Turn too, naming the module', (_what, write) => {
    const deps = withModules(moduleWith('writer', { onAfternoon: (world, _slice, ctx) => (write(world, ctx), { events: [] }) }));
    const document = created('writes', deps);
    const before = serialise(document);

    const thrown = thrownBy(() => advance(document, deps));

    expect(thrown).toMatchObject({ name: 'ModuleError', moduleId: 'writer', during: 'onAfternoon' });
    expect((thrown as ModuleError).cause).toBeInstanceOf(TypeError);
    expect(serialise(document)).toBe(before);
    expect(deps.config.boardSize).toBe(testDeps().config.boardSize);
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

// ── Hook order (M8-S2 box 3) ─────────────────────────────────────────────────────────────────

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

// ── A module's stop (M8-S2 box 1, the engine's half) ─────────────────────────────────────────

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
