import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import { advance } from './advance.js';
import type { EngineDeps } from './config.js';
import { createWorld } from './create.js';
import type { Entry, World, WorldDocument } from './document.js';
import { fastForward } from './fast-forward.js';
import { ModuleError, type Module, type ModuleContext, type ReadonlyWorld, type SliceContext } from './modules.js';
import { createStreams, next, streamNames } from './rng.js';
import { playerGuild } from './selectors.js';
import { deserialise, serialise } from './serialise.js';
import { timeOfDay } from './time.js';
import { validate } from './validate.js';
import { testDeps, withValid } from './world.test-support.js';

// M8-S1: the Module interface and its registration (ADR-0005 as amended 2026-09-25, data-model
// §3.4, approach §2, N6, DL-76). Test modules only: the probe is M8-S3's.

const setup = { guildmasterName: 'Ada', guildName: 'The Test', createdAt: 'test' };

/** A slice that records what its module was asked to do, and a version of its own. */
interface LogSlice {
  version: number;
  calls: [hook: string, turn: number][];
  draws: number[];
}

/** A module that records every hook it is called at in its slice, and draws nothing. */
function logModule(id = 'log', extra: Partial<Module<LogSlice>> = {}): Module<LogSlice> {
  const record =
    (hook: string) =>
    (_world: ReadonlyWorld, slice: LogSlice, ctx: ModuleContext) => {
      slice.calls.push([hook, ctx.turn]);
      return { events: [] };
    };
  return {
    id,
    createSlice: () => ({ version: 1, calls: [], draws: [] }),
    validateSlice: () => [],
    onMorning: record('onMorning'),
    onAfternoon: record('onAfternoon'),
    onNight: record('onNight'),
    ...extra,
  };
}

/** A module with a stream of its own that draws once in each of its hooks. */
function diceModule(): Module<LogSlice> {
  const roll = (_world: ReadonlyWorld, slice: LogSlice, ctx: ModuleContext) => {
    slice.draws.push(ctx.rng.next());
    return { events: [] };
  };
  return { ...logModule('dice'), streamName: 'dice', onMorning: roll, onAfternoon: roll, onNight: roll };
}

function withModules(...modules: Module<LogSlice>[]): EngineDeps {
  return { ...testDeps(), modules };
}

/** Plays `turns` Turns from a new world of `seed` under `deps`, validating each document. */
function play(seed: string, deps: EngineDeps, turns: number): WorldDocument[] {
  const documents = [withValid(createWorld(seed, setup, deps).document, deps)];
  for (let turn = 1; turn <= turns; turn += 1) {
    documents.push(withValid(advance(documents.at(-1) as WorldDocument, deps).document, deps));
  }
  return documents;
}

/** `document`'s world without the slices and the streams of `moduleStreams`. */
function coreOf(world: World, moduleStreams: readonly string[] = []): unknown {
  const rng = Object.fromEntries(Object.entries(world.rng).filter(([name]) => !moduleStreams.includes(name)));
  return { ...world, rng, modules: {} };
}

function sliceOf(document: WorldDocument, id: string): LogSlice {
  return (document.world.modules as Record<string, LogSlice>)[id] as LogSlice;
}

describe('registration at createWorld', () => {
  test('with no modules, or modules: [], the world has no slice and only the core streams, byte for byte alike', () => {
    const without = createWorld('none', setup, testDeps()).document;
    const empty = createWorld('none', setup, { ...testDeps(), modules: [] }).document;

    expect(without.world.modules).toEqual({});
    expect(Object.keys(without.world.rng)).toEqual([...streamNames]);
    expect(serialise(empty)).toBe(serialise(without));
  });

  test("creates each module's slice and registers its stream, seeded from the master seed and its name", () => {
    const contexts: SliceContext[] = [];
    const dice = diceModule();
    const deps = withModules({
      ...dice,
      createSlice: (ctx) => {
        contexts.push(ctx);
        return dice.createSlice(ctx);
      },
    });

    const { document } = createWorld('registered', setup, deps);

    expect(sliceOf(document, 'dice')).toEqual({ version: 1, calls: [], draws: [] });
    expect((document.world.rng as Record<string, unknown>).dice).toEqual(createStreams('registered', ['dice']).dice);
    expect(contexts).toHaveLength(1);
    expect(contexts[0]).toMatchObject({ config: deps.config, content: deps.content, turn: 0 });
    withValid(document, deps);
  });

  test('changes nothing else: the world without the slice and the stream is the world with no module', () => {
    const plain = createWorld('isolated', setup, testDeps()).document;
    const withDice = createWorld('isolated', setup, withModules(diceModule())).document;

    expect(coreOf(withDice.world, ['dice'])).toEqual(plain.world);
    expect(serialise({ ...withDice, world: coreOf(withDice.world, ['dice']) as World })).toBe(serialise(plain));
  });

  test.each([
    ['two modules with one id', [logModule('twin'), logModule('twin')]],
    ["a stream named as a core stream's", [{ ...logModule('greedy'), streamName: 'board' }]],
    ['two modules with one stream', [{ ...logModule('a'), streamName: 'shared' }, { ...logModule('b'), streamName: 'shared' }]],
    ['an empty id', [logModule('')]],
  ])('refuses %s: a programming error, thrown', (_name, modules) => {
    expect(() => createWorld('bad', setup, { ...testDeps(), modules: modules as Module[] })).toThrow(RangeError);
  });
});

describe('the hooks at the three positions of approach §2', () => {
  test('run once a Turn on their own time of day, with the Turn being played', () => {
    const deps = withModules(logModule());
    const documents = play('hooks', deps, 9);

    const expected = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((turn) => {
      const hook = { morning: 'onMorning', afternoon: 'onAfternoon', night: 'onNight' }[timeOfDay(turn)];
      return [hook, turn];
    });
    expect(sliceOf(documents.at(-1) as WorldDocument, 'log').calls).toEqual(expected);
  });

  test("a hook changes its slice in the Turn's copy: the new document has it, the old one is as it was", () => {
    const deps = withModules(logModule());
    const [created, first] = play('copy', deps, 1) as [WorldDocument, WorldDocument];

    // Turn 0 is a morning whose phases never run (DL-24), so Turn 1 is an afternoon.
    expect(sliceOf(first, 'log').calls).toEqual([['onAfternoon', 1]]);
    expect(sliceOf(created, 'log').calls).toEqual([]);
  });

  test("a hook's events join the Turn's events and the History", () => {
    const announcing: Module<LogSlice> = {
      ...logModule('announcing'),
      onNight: (_world, _slice, ctx) => ({
        events: [ctx.emit({ type: 'announcing.said', participants: [], payload: { seed: 'from a module' } })],
      }),
    };
    const deps = withModules(announcing);
    const { document } = createWorld('events', setup, deps);
    const afternoon = advance(document, deps);

    const night = advance(afternoon.document, deps);

    const said = (events: readonly Entry[]) => events.filter((event) => event.type === 'announcing.said');
    expect(said(afternoon.events)).toEqual([]);
    const fromModule = said(night.events);
    expect(fromModule).toEqual([expect.objectContaining({ turn: 2, payload: { seed: 'from a module' } })]);
    expect(night.document.history.entries).toContain(fromModule[0]);
  });

  test('fast forward plays the hooks, since every Turn is advance’s', () => {
    const deps = withModules(logModule());
    const { document } = createWorld('forward', setup, deps);
    const guildId = playerGuild(document.world)?.id;
    if (guildId === undefined) throw new Error('no player Guild');

    const result = fastForward(document, { guildId, until: [], maxTurns: 6 }, deps);

    expect(sliceOf(result.document, 'log').calls).toHaveLength(result.document.world.turn);
  });
});

describe('a module with a stream (M8-S1 box 2)', () => {
  test('draws from its own stream, seeded as a new stream of its name would be', () => {
    const documents = play('own-stream', withModules(diceModule()), 12);

    const fresh = createStreams('own-stream', ['dice']).dice;
    const expected = Array.from({ length: 12 }, () => next(fresh));
    expect(sliceOf(documents.at(-1) as WorldDocument, 'dice').draws).toEqual(expected);
    expect((documents.at(-1)?.world.rng as Record<string, unknown>).dice).toEqual(fresh);
  });

  test('moves no core stream: every Turn, the core streams and the rest of the world are those of a game with no module', () => {
    const turns = 30;
    const plain = play('no-core-stream', testDeps(), turns);
    const withDice = play('no-core-stream', withModules(diceModule()), turns);

    for (let turn = 0; turn <= turns; turn += 1) {
      const [a, b] = [plain[turn]?.world, withDice[turn]?.world] as [World, World];
      for (const name of streamNames) expect(b.rng[name], `${name} at Turn ${turn}`).toEqual(a.rng[name]);
      expect(coreOf(b, ['dice']), `Turn ${turn}`).toEqual(a);
    }
    expect(serialise({ ...withDice[turns], world: coreOf(withDice[turns]?.world as World, ['dice']) } as WorldDocument)).toBe(
      serialise(plain[turns] as WorldDocument),
    );
  });

  test('a module that declared no stream and draws fails the advance, naming the module', () => {
    const deps = withModules({
      ...logModule('streamless'),
      onMorning: (_world, _slice, ctx) => {
        ctx.rng.next();
        return { events: [] };
      },
    });
    const { document } = createWorld('streamless', setup, deps);
    const night = advance(advance(document, deps).document, deps).document;

    expect(() => advance(night, deps)).toThrow(expect.objectContaining({ name: 'ModuleError', moduleId: 'streamless' }));
  });
});

describe('a module that throws inside a hook (M8-S1 box 3)', () => {
  const failure = new TypeError('the module is broken');
  const broken = logModule('broken', {
    onAfternoon: () => {
      throw failure;
    },
  });
  const deps = withModules(logModule('bystander'), broken);

  test('fails the advance with a ModuleError naming the module and the hook, the error as its cause', () => {
    // Turn 1, the first played, is an afternoon.
    const { document } = createWorld('throws', setup, deps);

    let thrown: unknown;
    try {
      advance(document, deps);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(ModuleError);
    expect(thrown).toMatchObject({ moduleId: 'broken', during: 'onAfternoon', cause: failure });
    expect((thrown as Error).message).toContain('broken');
  });

  test('leaves the document it was given as it was, its History included', () => {
    const { document } = createWorld('throws', setup, deps);
    const before = serialise(document);

    expect(() => advance(document, deps)).toThrow(ModuleError);
    expect(serialise(document)).toBe(before);
  });

  test('a module that throws creating its slice fails createWorld, naming the module', () => {
    const failing = logModule('unborn', {
      createSlice: () => {
        throw new Error('no slice today');
      },
    });

    expect(() => createWorld('unborn', setup, withModules(failing))).toThrow(
      expect.objectContaining({ moduleId: 'unborn', during: 'createSlice' }),
    );
  });
});

describe('a save made before a module was installed', () => {
  test('loads, and gains the slice and the stream a new world would have had the first time it is played', () => {
    const saved = serialise(play('late', testDeps(), 2).at(-1) as WorldDocument);
    const deps = withModules(diceModule());

    const loaded = deserialise(saved, deps);
    if (!loaded.ok) throw new Error(loaded.reason.message);
    expect(loaded.warnings).toEqual([]);
    const played = withValid(advance(loaded.document, deps).document, deps);

    // Turn 3 is a morning: the slice was made as the Turn began, then drawn from by onMorning.
    const fresh = createStreams('late', ['dice']).dice;
    expect(sliceOf(played, 'dice')).toEqual({ version: 1, calls: [], draws: [next(fresh)] });
    expect((played.world.rng as Record<string, unknown>).dice).toEqual(fresh);
  });
});

describe('a save made before a strict module was installed', () => {
  test('loads without a warning: an installed module whose slice is absent is neither migrated nor validated until it has one', () => {
    const saved = serialise(play('late-strict', testDeps(), 2).at(-1) as WorldDocument);
    const asked: string[] = [];
    const strict = logModule('strict', {
      migrateSlice: (slice) => {
        asked.push('migrateSlice');
        if (typeof slice !== 'object' || slice === null) throw new TypeError('the strict module reads an object');
        return slice as LogSlice;
      },
      validateSlice: (slice) => {
        asked.push('validateSlice');
        return typeof slice === 'object' && slice !== null ? [] : [{ at: [], detail: 'the strict module reads an object' }];
      },
    });
    const deps = withModules(strict);

    const loaded = deserialise(saved, deps);
    if (!loaded.ok) throw new Error(loaded.reason.message);

    expect(loaded.warnings).toEqual([]);
    expect(asked).toEqual([]);
    expect(validate(loaded.document, deps)).toEqual({ ok: true, warnings: [] });
    expect(asked).toEqual([]);
    // Turn 3, a morning: the slice is made as the Turn begins, then onMorning records itself in it.
    const played = withValid(advance(loaded.document, deps).document, deps);
    expect(sliceOf(played, 'strict')).toEqual({ version: 1, calls: [['onMorning', 3]], draws: [] });
    expect(asked).toEqual(['validateSlice']);
  });
});

describe('deserialise with modules', () => {
  const deps = withModules(logModule());
  const savedWith = (slice: unknown): string => {
    const document = createWorld('load', setup, deps).document;
    (document.world.modules as Record<string, unknown>).log = slice;
    return serialise(document);
  };

  test("runs the module's migrateSlice on its slice, then its validateSlice on what that returned", () => {
    const seen: unknown[] = [];
    const migrating = withModules(
      logModule('log', {
        migrateSlice: (slice) => ({ ...(slice as LogSlice), version: 2 }),
        validateSlice: (slice) => {
          seen.push(slice);
          return [];
        },
      }),
    );

    const result = deserialise(savedWith({ version: 1, calls: [], draws: [] }), migrating);

    expect(result.ok).toBe(true);
    const slice = result.ok ? sliceOf(result.document, 'log') : undefined;
    expect(slice).toEqual({ version: 2, calls: [], draws: [] });
    expect(seen).toEqual([{ version: 2, calls: [], draws: [] }]);
  });

  test('refuses a slice its module refuses, naming the module and where in the slice', () => {
    const refusing = withModules(
      logModule('log', {
        validateSlice: (slice) => ((slice as LogSlice).version < 1 ? [{ at: ['version'], detail: 'a version from 1' }] : []),
      }),
    );

    const result = deserialise(savedWith({ version: 0, calls: [], draws: [] }), refusing);

    expect(result.ok).toBe(false);
    const failures = !result.ok && result.reason.kind === 'invalid' ? result.reason.failures : [];
    expect(failures.map(({ check, id }) => ({ check, id }))).toEqual([{ check: 'module-slice', id: '$.world.modules.log.version' }]);
  });

  test.each([
    ['validateSlice', { validateSlice: () => { throw new Error('unreadable'); } }],
    ['migrateSlice', { migrateSlice: () => { throw new Error('unreadable'); } }],
  ])("refuses, and never throws, when a module's %s throws on a save's slice", (_name, extra) => {
    const result = deserialise(savedWith('not a slice'), withModules(logModule('log', extra as Partial<Module<LogSlice>>)));

    expect(result.ok).toBe(false);
    const failures = !result.ok && result.reason.kind === 'invalid' ? result.reason.failures : [];
    expect(failures.map(({ check, id }) => ({ check, id }))).toEqual([{ check: 'module-slice', id: '$.world.modules.log' }]);
  });

  test('warns of a slice no installed module owns, and keeps it byte for byte', () => {
    const text = savedWith({ version: 1, calls: [['onMorning', 1]], draws: [] });

    const result = deserialise(text, testDeps());

    expect(result.ok).toBe(true);
    const warnings = result.ok ? result.warnings.map(({ check, id, key }) => ({ check, id, key })) : [];
    expect(warnings).toEqual([{ check: 'unknown-module', id: '$.world.modules.log', key: 'log' }]);
    expect(result.ok && serialise(result.document)).toBe(text);
  });

  test("the validator reads each installed module's refusals and warns of an uninstalled one's slice", () => {
    const document = play('validate', deps, 3).at(-1) as WorldDocument;

    expect(validate(document, deps)).toEqual({ ok: true, warnings: [] });
    const uninstalled = validate(document, testDeps());
    expect(uninstalled.ok && uninstalled.warnings.map(({ check, key }) => ({ check, key }))).toEqual([
      { check: 'unknown-module', key: 'log' },
    ]);
  });
});

// ── The core never reads inside a slice (data-model §3.4) ────────────────────────────────────

/** A read of the World's module slices: `world.modules`, with optional chaining, spaces or brackets. */
const slicePatterns: readonly RegExp[] = [/\bworld\s*\??\.\s*modules\b/g, /\bworld\s*(?:\?\.)?\s*\[\s*['"`]modules['"`]\s*\]/g];

/** `source` without its comments, so that prose about the slices is not a read. */
function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

function sliceReadsIn(source: string): number {
  const code = withoutComments(source);
  return slicePatterns.reduce((total, pattern) => total + (code.match(pattern)?.length ?? 0), 0);
}

const src = fileURLToPath(new URL('./', import.meta.url));

/** Every source file of the engine that is not a test or a test's support, from `src/`. */
function engineSources(): string[] {
  return readdirSync(src, { recursive: true, encoding: 'utf8' })
    .map((path) => path.replaceAll('\\', '/'))
    .filter((path) => path.endsWith('.ts') && !/\.test(?:-support)?\.ts$/.test(path))
    .filter((path) => !/(^|\/)boundary-probe-/.test(path))
    .sort();
}

describe('world.modules in the engine (data-model §3.4)', () => {
  test('is read in modules.ts and nowhere else', () => {
    const found = engineSources().filter((path) => sliceReadsIn(readFileSync(`${src}${path}`, 'utf8')) > 0);

    expect(found).toEqual(['modules.ts']);
  });

  test.each([
    ['world.modules', 1],
    ['document.world.modules.probe', 1],
    ['world?.modules', 1],
    ['world . modules', 1],
    ["world['modules']", 1],
    ['world?.["modules"]', 1],
    ['world.modulesSeen', 0],
    ['deps.modules', 0],
    ['// the core never reads world.modules', 0],
    ['/* world.modules */ const x = 1;', 0],
  ])('the matcher counts %s as %i', (source, reads) => {
    expect(sliceReadsIn(source)).toBe(reads);
  });
});
