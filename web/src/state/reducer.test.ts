import type * as Engine from '@heroesim/engine';
import {
  advance,
  applyAction,
  availableHeroes,
  createWorld,
  defaultConfig,
  deserialise,
  fastForward,
  holdings,
  isModuleEvent,
  makeId,
  offeredQuests,
  partyFor,
  playerGuild,
  probe,
  rebase,
  serialise,
  unattachedHeroes,
  type EngineDeps,
  type FastForwardResult,
  type Guild,
  type Module,
  type StopCondition,
  type StopReason,
  type WorldDocument,
} from '@heroesim/engine';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { content } from '../content';
import { changed, started as startedFrom, withPartyOut, withRosterReleased } from './game.test-support';
import {
  fastForwardStepTurns,
  gameReducer,
  initialGameState,
  noModules,
  playDeps,
  type GameAction,
  type GameState,
  type Play,
} from './reducer';
import { stopView } from './selectors';

// The one reducer (M7-S2). The engine's entry points the reducer calls are wrapped in spies that
// call the real ones, so a test can count the engine calls a play makes and read the deps it
// passed, and every other test plays the real engine.
vi.mock('@heroesim/engine', async (importOriginal) => {
  const engine = await importOriginal<typeof Engine>();
  return {
    ...engine,
    advance: vi.fn(engine.advance),
    applyAction: vi.fn(engine.applyAction),
    createWorld: vi.fn(engine.createWorld),
    deserialise: vi.fn(engine.deserialise),
    fastForward: vi.fn(engine.fastForward),
    rebase: vi.fn(engine.rebase),
  };
});

beforeEach(() => {
  vi.clearAllMocks();
});

const newGame: Play = {
  kind: 'newGame',
  seed: 'reducer-test',
  guildName: 'The Lantern',
  guildmasterName: 'Ada Vell',
  createdAt: '2026-09-27T09:00:00.000Z',
};

/** Plays `action` as the page does: accepted, then settled, a fast forward step by step. */
function play(state: GameState, action: Play): GameState {
  let next = gameReducer(state, action);
  while (next.pending !== null) next = gameReducer(next, { kind: 'settle' });
  return next;
}

function started(): GameState {
  return play(initialGameState, newGame);
}

function documentOf(state: GameState): WorldDocument {
  if (state.document === null) throw new Error('expected a game in hand');
  return state.document;
}

function playerOf(state: GameState): Guild {
  const guild = playerGuild(documentOf(state).world);
  if (guild === undefined) throw new Error("expected the player's Guild");
  return guild;
}

/** A save's text with `change` made to its parsed JSON: an older save, or a damaged one. */
function saveText(state: GameState, change: (saved: { meta: Record<string, unknown>; world: Record<string, unknown> }) => void): string {
  const saved = JSON.parse(serialise(documentOf(state))) as { meta: Record<string, unknown>; world: Record<string, unknown> };
  change(saved);
  return JSON.stringify(saved);
}

/** The deps an engine spy was last given: every entry point takes them last. */
function lastDeps(spy: unknown): EngineDeps {
  return (spy as { mock: { calls: unknown[][] } }).mock.calls.at(-1)?.at(-1) as EngineDeps;
}

describe('a new game', () => {
  test('starts under the current defaults; its log is the History it starts with', () => {
    const state = started();
    const document = documentOf(state);

    expect(document.meta.config).toEqual(defaultConfig);
    expect(document.meta.seed).toBe('reducer-test');
    expect(state.log).toEqual(document.history.entries);
    expect(state.log[0]?.type).toBe('world.created');
    expect(state).toMatchObject({ rejection: null, busy: false, pending: null, stoppedBecause: null, warnings: [] });
  });

  test('takes the names trimmed, and a Guild Background by its key', () => {
    const background = Object.values(content.backgrounds).find((row) => row.owner === 'guild');
    if (background === undefined) throw new Error('the content has no Guild Background');
    const state = play(initialGameState, { ...newGame, guildName: '  The Lantern  ', backgroundKey: background.key });

    expect(playerOf(state)).toMatchObject({ name: 'The Lantern', backgroundKey: background.key });
  });

  test.each([
    ['a blank Guild name', { guildName: '   ' }, { action: 'newGame', reason: 'guild-name-blank' }],
    ['a blank Guildmaster name', { guildmasterName: '' }, { action: 'newGame', reason: 'guildmaster-name-blank' }],
    ['a Background no content defines', { backgroundKey: 'no-such' }, { reason: 'unknown-background', backgroundKey: 'no-such' }],
  ])('refuses %s, storing the refusal and creating nothing', (_name, change, refusal) => {
    const state = play(initialGameState, { ...newGame, ...change });

    expect(state.rejection).toMatchObject(refusal);
    expect(state.document).toBeNull();
    expect(state.busy).toBe(false);
  });

  test("refuses a Hero's Background for a Guild", () => {
    const heroBackground = Object.values(content.backgrounds).find((row) => row.owner === 'hero');
    if (heroBackground === undefined) throw new Error('the content has no Hero Background');

    expect(play(initialGameState, { ...newGame, backgroundKey: heroBackground.key }).rejection).toMatchObject({
      reason: 'unknown-background',
    });
  });
});

describe('a play is taken once', () => {
  test('accepting a play marks the state busy and runs nothing; settling it calls the engine', () => {
    const before = started();
    const accepted = gameReducer(before, { kind: 'advance' });

    expect(accepted).toMatchObject({ busy: true, pending: { kind: 'advance' }, document: before.document });
    expect(advance).not.toHaveBeenCalled();

    const after = gameReducer(accepted, { kind: 'settle' });

    expect(advance).toHaveBeenCalledTimes(1);
    expect(documentOf(after).world.turn).toBe(documentOf(before).world.turn + 1);
    expect(after).toMatchObject({ busy: false, pending: null });
  });

  test('two taps on Advance before the first settles drive one engine call', () => {
    const before = started();
    // The History is shared by the documents of successive Turns (ADR-0008): count it now.
    const entries = documentOf(before).history.entries.length;
    const once = gameReducer(before, { kind: 'advance' });
    const twice = gameReducer(once, { kind: 'advance' });

    expect(twice).toBe(once);

    const settled = gameReducer(twice, { kind: 'settle' });

    expect(advance).toHaveBeenCalledTimes(1);
    expect(documentOf(settled).world.turn).toBe(documentOf(before).world.turn + 1);
    // One Turn's events, appended once.
    expect(settled.log.length).toBeGreaterThan(0);
    expect(documentOf(settled).history.entries.slice(entries)).toEqual(settled.log);
  });

  test('any play arriving while busy is dropped, whatever it is', () => {
    const accepted = gameReducer(started(), { kind: 'advance' });
    const plays: Play[] = [newGame, { kind: 'load', text: '{}' }, { kind: 'rebase' }, { kind: 'build', facility: 'infirmary' }];

    for (const next of plays) expect(gameReducer(accepted, next)).toBe(accepted);
  });

  test('once settled, the next play is taken as normal', () => {
    const first = play(started(), { kind: 'advance' });
    const second = play(first, { kind: 'advance' });

    expect(documentOf(second).world.turn).toBe(documentOf(first).world.turn + 1);
    expect(advance).toHaveBeenCalledTimes(2);
  });

  test('settling with nothing accepted, and dismissing with nothing refused, change nothing', () => {
    const state = started();

    expect(gameReducer(state, { kind: 'settle' })).toBe(state);
    expect(gameReducer(state, { kind: 'dismiss' })).toBe(state);
  });
});

describe('the rules a game plays under', () => {
  /** A save made under older rules: `configVersion` 1, a field it predates, a field it changed. */
  function olderRules(state: GameState): string {
    return saveText(state, ({ meta }) => {
      const config = meta['config'] as Record<string, unknown>;
      config['configVersion'] = 1;
      config['boardSize'] = defaultConfig.boardSize - 1;
      delete config['transferLockDays'];
    });
  }

  test("are the save's own, filled forward with the current defaults: { ...defaultConfig, ...meta.config }", () => {
    const loaded = play(started(), { kind: 'load', text: olderRules(started()) });
    const expected = { ...defaultConfig, configVersion: 1, boardSize: defaultConfig.boardSize - 1 };

    const advanced = play(loaded, { kind: 'advance' });
    expect(lastDeps(advance)).toEqual({ config: expected, content });

    const fastForwarded = play(advanced, { kind: 'fastForward', until: [], maxTurns: 2 });
    expect(lastDeps(fastForward)).toEqual({ config: expected, content });

    const heroId = playerOf(fastForwarded).rosterIds[0];
    if (heroId === undefined) throw new Error('expected a Hero on the Roster');
    play(fastForwarded, { kind: 'unequip', heroId, slot: 'weapon' });
    expect(lastDeps(applyAction)).toEqual({ config: expected, content });
    expect(lastDeps(applyAction).content).toBe(content);
  });

  test('a save is read with the engine’s own config, so an older schema is migrated (DL-20)', () => {
    // A schema version 2 save, as M5 wrote it: no Hero carries `transferredOnTurn` (DL-60), and its
    // config names the schema it was made under. Merging that config before the load would compare
    // version 2 with version 2 and skip the migration.
    const text = saveText(started(), ({ meta, world }) => {
      meta['version'] = 2;
      (meta['config'] as Record<string, unknown>)['schemaVersion'] = 2;
      for (const hero of Object.values(world['heroes'] as Record<string, Record<string, unknown>>)) {
        delete hero['transferredOnTurn'];
      }
    });
    const loaded = play(initialGameState, { kind: 'load', text });

    expect(deserialise).toHaveBeenCalledWith(text, { config: defaultConfig, content });
    expect(loaded.rejection).toBeNull();
    expect(documentOf(loaded).meta.version).toBe(defaultConfig.schemaVersion);
    expect(Object.values(documentOf(loaded).world.heroes).every((hero) => hero.transferredOnTurn === null)).toBe(true);
    expect(loaded).toMatchObject({ log: [], stoppedBecause: null, warnings: [] });
  });

  test("rebase adopts the current defaults, not the save's own; a second rebase is refused", () => {
    const loaded = play(started(), { kind: 'load', text: olderRules(started()) });
    const rebased = play(loaded, { kind: 'rebase' });

    expect(lastDeps(rebase)).toEqual({ config: defaultConfig, content });
    expect(documentOf(rebased).meta.config).toEqual(defaultConfig);
    expect(rebased.log.map((event) => event.type)).toEqual(['world.rules-adopted']);

    const again = play(rebased, { kind: 'rebase' });
    expect(again.rejection).toEqual({ action: 'rebase', reason: 'already-current', configVersion: defaultConfig.configVersion });
    expect(again.document).toBe(rebased.document);
  });
});

describe("a loaded save's warnings, the CLI's notice of content keys this content lacks (rule 5, DL-65)", () => {
  /** A save one of whose Heroes has a Background this content does not define, as the CLI's rule-5 test has. */
  function withUnknownBackground(state: GameState): string {
    return saveText(state, ({ world }) => {
      const [first] = Object.values(world['heroes'] as Record<string, Record<string, unknown>>);
      if (first === undefined) throw new Error('expected a Hero');
      first['backgroundKey'] = 'sea-born';
    });
  }

  test('are stored by the load, and kept by the plays that follow, a refusal among them', () => {
    const loaded = play(initialGameState, { kind: 'load', text: withUnknownBackground(started()) });

    expect(loaded.rejection).toBeNull();
    expect(loaded.warnings).toEqual([expect.objectContaining({ key: 'sea-born' })]);
    const advanced = play(loaded, { kind: 'advance' });
    expect(advanced.warnings).toEqual(loaded.warnings);
    const refused = play(advanced, { kind: 'rebase' });
    expect(refused.rejection).not.toBeNull();
    expect(refused.warnings).toEqual(loaded.warnings);
  });

  test('go with the game: a new game has none, and a clean save loaded in its place has none', () => {
    const loaded = play(initialGameState, { kind: 'load', text: withUnknownBackground(started()) });

    expect(loaded.warnings).toHaveLength(1);
    expect(play(loaded, newGame).warnings).toEqual([]);
    expect(play(loaded, { kind: 'load', text: serialise(documentOf(started())) }).warnings).toEqual([]);
  });
});

describe('the modules installed (M8-S4): none unless the page is given some', () => {
  /** Plays `action` as the page does with `modules` installed: accepted, then settled, a fast forward step by step. */
  function withModules(modules: readonly Module[], state: GameState, action: Play): GameState {
    let next = gameReducer(state, action, modules);
    while (next.pending !== null) next = gameReducer(next, { kind: 'settle' }, modules);
    return next;
  }
  const withProbe = (state: GameState, action: Play): GameState => withModules([probe], state, action);

  test('with none, a new game has no slice of a module and every engine call is made without one', () => {
    const state = started();

    expect(documentOf(state).world.modules).toEqual({});
    expect(lastDeps(createWorld)).toEqual({ config: defaultConfig, content });
    play(state, { kind: 'advance' });
    expect(lastDeps(advance)).toEqual({ config: defaultConfig, content });
  });

  test('with the probe, a new game has its slice and stream, and every play on it is the engine’s with the probe installed', () => {
    const state = withProbe(initialGameState, newGame);
    const expected = { config: defaultConfig, content, modules: [probe] };

    expect(lastDeps(createWorld)).toEqual(expected);
    expect(documentOf(state).world.modules).toEqual({ probe: expect.objectContaining({ version: 1, lastStopTurn: null }) });
    expect(Object.keys(documentOf(state).world.rng)).toContain('probe');

    const advanced = withProbe(state, { kind: 'advance' });
    expect(lastDeps(advance)).toEqual(expected);
    const forwarded = withProbe(advanced, { kind: 'fastForward', until: [], maxTurns: 2 });
    expect(lastDeps(fastForward)).toEqual(expected);
    const heroId = playerOf(forwarded).rosterIds[0];
    if (heroId === undefined) throw new Error('expected a Hero on the Roster');
    withProbe(forwarded, { kind: 'unequip', heroId, slot: 'weapon' });
    expect(lastDeps(applyAction)).toEqual(expected);
    withProbe(forwarded, { kind: 'rebase' });
    expect(lastDeps(rebase)).toEqual(expected);
    withProbe(initialGameState, { kind: 'load', text: serialise(documentOf(state)) });
    expect(lastDeps(deserialise)).toEqual(expected);
  });

  test('a probe.fired event is in the log of the Turn the probe fires on, on a seed known to fire one', () => {
    // Seed `modules`: the probe's stream first draws below 0.02 on the eleventh Turn, the night of Day 3.
    let state = withProbe(initialGameState, { ...newGame, seed: 'modules' });
    for (let turn = 1; turn <= 10; turn += 1) {
      state = withProbe(state, { kind: 'advance' });
      expect(state.log.filter(isModuleEvent)).toEqual([]);
    }

    state = withProbe(state, { kind: 'advance' });

    const fired = state.log.filter(isModuleEvent);
    expect(fired).toEqual([expect.objectContaining({ type: 'probe.fired', turn: 11 })]);
    expect(documentOf(state).history.byType['probe.fired']).toHaveLength(1);
    // The same Turns without the probe make no module event, and leave the world without its slice.
    let plain = play(initialGameState, { ...newGame, seed: 'modules' });
    plain = play(plain, { kind: 'advance', turns: 11 });
    expect(documentOf(plain).history.byType['probe.fired']).toBeUndefined();
    expect(documentOf(plain).world.modules).toEqual({});
  });

  test("a save with the probe's slice loads cleanly with the probe; without it, with the engine's warning, the slice kept", () => {
    const text = serialise(documentOf(withProbe(initialGameState, newGame)));

    const installed = withProbe(initialGameState, { kind: 'load', text });
    const not = play(initialGameState, { kind: 'load', text });

    expect(installed).toMatchObject({ rejection: null, warnings: [] });
    expect(not.rejection).toBeNull();
    expect(not.warnings).toEqual([expect.objectContaining({ check: 'unknown-module', key: 'probe' })]);
    expect(documentOf(not).world.modules).toEqual(documentOf(installed).world.modules);
  });
});

describe('the games put in hand', () => {
  test('are counted: each new game and each load is one more; any other play, or a refusal, is not (DL-74)', () => {
    expect(initialGameState.games).toBe(0);
    const first = started();
    expect(first.games).toBe(1);
    const advanced = play(first, { kind: 'advance' });
    expect(advanced.games).toBe(1);
    expect(play(advanced, { ...newGame, guildName: ' ' }).games).toBe(1);
    expect(play(advanced, { kind: 'load', text: 'not a save' }).games).toBe(1);
    const loaded = play(advanced, { kind: 'load', text: serialise(documentOf(advanced)) });
    expect(loaded.rejection).toBeNull();
    expect(loaded.games).toBe(2);
    expect(play(loaded, newGame).games).toBe(3);
  });
});

describe('a refusal is stored, never thrown', () => {
  test("the engine's rejection is kept with the document as it was, and the log of the last play", () => {
    const before = play(started(), { kind: 'advance' });
    const heroId = playerOf(before).rosterIds[0];
    if (heroId === undefined) throw new Error('expected a Hero on the Roster');
    const refused = play(before, { kind: 'recruit', heroId });

    expect(refused.rejection).toEqual({ action: 'recruit', reason: 'hero-not-unattached', heroId });
    expect(refused.document).toBe(before.document);
    expect(refused.log).toBe(before.log);
    expect(refused).toMatchObject({ busy: false, pending: null });
  });

  test('the next play carried out clears it; so does dismiss', () => {
    const refused = play(started(), { kind: 'rebase' });
    expect(refused.rejection).not.toBeNull();

    expect(play(refused, { kind: 'advance' }).rejection).toBeNull();
    expect(gameReducer(refused, { kind: 'dismiss' })).toEqual({ ...refused, rejection: null });
  });

  test.each([
    ['not JSON', 'not a save', 'malformed-json'],
    ['not a document', '{"meta":{}}', 'not-a-document'],
    ['a newer schema', '{"meta":{"version":99}}', 'unsupported-version'],
    ['damaged', '{"meta":{"version":3},"world":{},"history":{}}', 'invalid'],
  ])('a save that is %s does not load, and the game in hand stays', (_name, text, reason) => {
    const before = started();
    const refused = play(before, { kind: 'load', text });

    expect(refused.rejection).toMatchObject({ action: 'load', reason, message: expect.any(String) as string });
    expect(refused.document).toBe(before.document);
  });

  test('a play on a game before there is one is refused', () => {
    const plays: Play[] = [{ kind: 'advance' }, { kind: 'fastForward', until: [] }, { kind: 'rebase' }, { kind: 'build', facility: 'infirmary' }];

    for (const next of plays) {
      expect(play(initialGameState, next).rejection).toEqual({ action: next.kind, reason: 'no-game' });
    }
  });

  test('after the end the world stands: a Turn and an action are refused, rebase is not (DL-28, DL-53)', () => {
    const state = started();
    const document = documentOf(state);
    const ending = { turn: document.world.turn, reason: 'bankruptcy' } as const;
    const over: GameState = { ...state, document: { ...document, world: { ...document.world, ended: ending } } };

    for (const next of [{ kind: 'advance' }, { kind: 'fastForward', until: [] }, { kind: 'build', facility: 'quarters' }] as const) {
      expect(play(over, next).rejection).toEqual({ action: next.kind, reason: 'game-ended', ending });
    }
    expect(advance).not.toHaveBeenCalled();
    expect(play(over, { kind: 'rebase' }).rejection).toMatchObject({ action: 'rebase', reason: 'already-current' });
  });

  test("a play for the player's Guild is refused on a save that has none; a Turn is not", () => {
    const state = started();
    const document = documentOf(state);
    const guild = playerOf(state);
    const guilds = { ...document.world.guilds, [guild.id]: { ...guild, controller: { kind: 'rival', disposition: 'steady' } } };
    const nobody: GameState = { ...state, document: { ...document, world: { ...document.world, guilds } as typeof document.world } };

    expect(play(nobody, { kind: 'build', facility: 'infirmary' }).rejection).toEqual({ action: 'build', reason: 'no-player-guild' });
    expect(play(nobody, { kind: 'fastForward', until: [] }).rejection).toEqual({ action: 'fastForward', reason: 'no-player-guild' });
    expect(play(nobody, { kind: 'advance' }).rejection).toBeNull();
  });
});

describe('each play is the engine’s', () => {
  test("a Guild's action is the engine's own, for the player's Guild", () => {
    const state = started();
    const guild = playerOf(state);
    play(state, { kind: 'buy', definitionKey: 'whetstone', quantity: 1 });

    expect(applyAction).toHaveBeenCalledWith(
      state.document,
      { kind: 'buy', guildId: guild.id, definitionKey: 'whetstone', quantity: 1 },
      expect.anything(),
    );
  });

  test('advance plays the Turns asked, one by default, and logs every event of them', () => {
    const state = started();
    const turn = documentOf(state).world.turn;
    const one = play(state, { kind: 'advance' });
    const entries = documentOf(one).history.entries.length;
    const three = play(one, { kind: 'advance', turns: 3 });

    expect(documentOf(one).world.turn).toBe(turn + 1);
    expect(documentOf(three).world.turn).toBe(turn + 4);
    expect(three.log.length).toBeGreaterThan(0);
    expect(three.log.every((event) => event.turn > turn + 1 && event.turn <= turn + 4)).toBe(true);
    expect(documentOf(three).history.entries.slice(entries)).toEqual(three.log);
    expect(three.stoppedBecause).toBeNull();
  });

  test("fast forward watches the player's Guild, for a year unless told, a step at a time, and keeps why it stopped", () => {
    const state = started();
    const guild = playerOf(state);
    const forward = play(state, { kind: 'fastForward', until: ['pool-refreshed'] });

    // A year, played in steps (v1.0.1-S5, DL-96): a new game stops in its first, one call of the
    // first 30 Turns of the year.
    expect(fastForward).toHaveBeenCalledTimes(1);
    expect(fastForward).toHaveBeenCalledWith(
      state.document,
      { guildId: guild.id, until: ['pool-refreshed'], maxTurns: fastForwardStepTurns },
      expect.anything(),
    );
    expect(forward.stoppedBecause).not.toBeNull();

    const capped = play(forward, { kind: 'fastForward', until: [], maxTurns: 1 });
    expect(documentOf(capped).world.turn).toBe(documentOf(forward).world.turn + 1);
    expect(capped.stoppedBecause).not.toBeNull();

    // A refusal leaves the stop as it was; any other play carried out clears it.
    expect(play(capped, { kind: 'rebase' }).stoppedBecause).toBe(capped.stoppedBecause);
    expect(play(capped, { kind: 'load', text: serialise(documentOf(capped)) }).stoppedBecause).toBeNull();
  });
});

// ── Fast forward in steps (v1.0.1-S5, DL-96) ─────────────────────────────────────────────────

/** Accepts `action` and settles it as `useGame` does, a step a settle, with `modules` installed: the state after each step. */
function stepped(state: GameState, action: Play, modules: readonly Module[] = noModules): GameState[] {
  const states: GameState[] = [];
  let next = gameReducer(state, action, modules);
  while (next.pending !== null) {
    next = gameReducer(next, { kind: 'settle' }, modules);
    states.push(next);
  }
  return states;
}

/** The last of `states`: the state a fast forward ended in. */
function lastOf(states: readonly GameState[]): GameState {
  const last = states.at(-1);
  if (last === undefined) throw new Error('expected a step');
  return last;
}

/** The engine's calls to `fastForward` since the mocks were last cleared: each step's document and options. */
function fastForwardCalls(): Parameters<typeof fastForward>[] {
  return vi.mocked(fastForward).mock.calls;
}

describe('fast forward in steps of at most 30 Turns (v1.0.1-S5, DL-96)', () => {
  test('is fastForward calls of at most 30 Turns, a settle each, each from the game the step before it left', () => {
    const before = withRosterReleased(started());
    const guildId = playerOf(before).id;
    const turn = documentOf(before).world.turn;
    const entries = documentOf(before).history.entries.length;
    const year = defaultConfig.turnsPerYear;

    const states = stepped(before, { kind: 'fastForward', until: [] });
    const calls = fastForwardCalls();

    expect(fastForwardStepTurns).toBe(30);
    expect(calls).toHaveLength(year / fastForwardStepTurns);
    expect(states).toHaveLength(calls.length);
    for (const [index, [document, options]] of calls.entries()) {
      expect(options).toEqual({ guildId, until: [], maxTurns: fastForwardStepTurns });
      expect(document.world.turn).toBe(turn + index * fastForwardStepTurns);
      expect(document).toBe(index === 0 ? before.document : states[index - 1]?.forwarding?.document);
    }
    // Between steps: busy, the rest pending, how far it has come held; the game in hand and the log
    // stand as they were until it ends.
    for (const [index, between] of states.slice(0, -1).entries()) {
      const played = (index + 1) * fastForwardStepTurns;
      expect(between).toMatchObject({ busy: true, rejection: null, stoppedBecause: null, stopped: null });
      expect(between.pending).toEqual({ kind: 'fastForward', until: [], maxTurns: year - played });
      expect(between.forwarding).toMatchObject({ until: [], turnsPlayed: played });
      expect(between.forwarding?.document.world.turn).toBe(turn + played);
      expect(between.document).toBe(before.document);
      expect(between.log).toBe(before.log);
    }
    // The step that ends it stores the game it left, and every step's events, in order, as the log.
    const last = lastOf(states);
    expect(last).toMatchObject({ busy: false, pending: null, forwarding: null, stoppedBecause: { kind: 'max-turns' } });
    expect(documentOf(last).world.turn).toBe(turn + year);
    expect(last.log).toEqual(documentOf(last).history.entries.slice(entries));
  });

  test('a cap not a multiple of 30 ends with a step of what is left of it', () => {
    const before = withRosterReleased(started());
    const states = stepped(before, { kind: 'fastForward', until: [], maxTurns: 100 });

    expect(fastForwardCalls().map(([, options]) => options.maxTurns)).toEqual([30, 30, 30, 10]);
    expect(states.map((state) => state.forwarding?.turnsPlayed ?? null)).toEqual([30, 60, 90, null]);
    expect(documentOf(lastOf(states)).world.turn).toBe(documentOf(before).world.turn + 100);
    expect(lastOf(states).stoppedBecause).toEqual({ kind: 'max-turns' });
  });

  test('checks the whole cap as the engine does: one that is not a whole number from 0 throws, and 0 plays nothing', () => {
    for (const maxTurns of [1.5, -1, Number.POSITIVE_INFINITY, Number.NaN]) {
      expect(() => play(started(), { kind: 'fastForward', until: [], maxTurns })).toThrow(RangeError);
    }
    const state = started();
    const none = play(state, { kind: 'fastForward', until: [], maxTurns: 0 });
    expect(documentOf(none).world.turn).toBe(documentOf(state).world.turn);
    expect(none).toMatchObject({ busy: false, stoppedBecause: { kind: 'max-turns' }, log: [] });
  });

  test('between steps a play is dropped as busy; settle plays the next step, and dismiss changes nothing', () => {
    const between = gameReducer(gameReducer(withRosterReleased(started()), { kind: 'fastForward', until: [] }), { kind: 'settle' });
    expect(between.forwarding).not.toBeNull();
    const plays: Play[] = [newGame, { kind: 'load', text: '{}' }, { kind: 'advance' }, { kind: 'fastForward', until: [] }, { kind: 'rebase' }];

    for (const next of plays) expect(gameReducer(between, next)).toBe(between);
    expect(gameReducer(between, { kind: 'dismiss' })).toBe(between);
    expect(gameReducer(between, { kind: 'settle' }).forwarding?.turnsPlayed).toBe(2 * fastForwardStepTurns);
  });

  test("with no cap, plays a year of the game's own rules (v1.0.1-S6, DL-97)", () => {
    const short = changed(withRosterReleased(started()), (document) => {
      document.meta.config = { ...document.meta.config, turnsPerYear: 90 };
    });

    const done = play(short, { kind: 'fastForward', until: [] });

    expect(fastForwardCalls().map(([, options]) => options.maxTurns)).toEqual([30, 30, 30]);
    expect(done.stoppedBecause).toEqual({ kind: 'max-turns' });
    expect(documentOf(done).world.turn).toBe(documentOf(short).world.turn + 90);
  });

  // The play before a fast forward may have left a stop, the player's Stop or a refusal on the
  // page: the first step clears each, so none stands beside the progress (v1.0.1-S6, DL-97).
  test.each([
    ['a stop reason', (state: GameState) => play(state, { kind: 'fastForward', until: [], maxTurns: fastForwardStepTurns })],
    [
      "the player's Stop",
      (state: GameState) => gameReducer(gameReducer(gameReducer(state, { kind: 'fastForward', until: [] }), { kind: 'settle' }), { kind: 'stop' }),
    ],
    ['a refusal', (state: GameState) => play(state, { kind: 'rebase' })],
  ])('between its steps holds none of what the play before it left: %s', (_left, before) => {
    const left = before(withRosterReleased(started()));
    expect([left.stoppedBecause, left.stopped, left.rejection].filter((value) => value !== null)).toHaveLength(1);

    const between = gameReducer(gameReducer(left, { kind: 'fastForward', until: [] }), { kind: 'settle' });

    expect(between.forwarding).not.toBeNull();
    expect(between).toMatchObject({ stoppedBecause: null, stopped: null, rejection: null });
    expect(stopView(between)).toBeNull();
  });
});

// A year of Turns played twice, in steps and in one call: 3 to 6 s on a loaded machine, past
// Vitest's 5 s default in full runs beside other work (M9-S3, DL-103). The timeout bounds a hang,
// not the speed, as DL-74 item 1 bounded a slow test.
describe('uninterrupted, the steps give what one call gives: byte-equal documents, the same events and stop (v1.0.1-S5, DL-96)', { timeout: 30_000 }, () => {
  /** A Party of the player's out on the longest Quest it can staff, back on the night of Day 10, the 32nd Turn: partway through the second step. */
  const partyOut = (): GameState => withPartyOut(startedFrom('reducer-test'));
  /** A new game with the probe installed and the Roster released: the probe's stop comes on the afternoon of Day 30, the 91st Turn, in the fourth step. */
  const probeGame = (): GameState => {
    const made = gameReducer(gameReducer(initialGameState, { ...newGame, seed: 'reducer-test' }, [probe]), { kind: 'settle' }, [probe]);
    return withRosterReleased(made);
  };
  const released = (): GameState => withRosterReleased(startedFrom('reducer-test'));
  const cases: {
    name: string;
    game: () => GameState;
    until: StopCondition[];
    maxTurns?: number;
    modules: readonly Module[];
    stop: StopReason['kind'];
    turns: number;
  }[] = [
    {
      name: "the player's Roster released to the pool, Wealth to spare: a year to max-turns",
      game: released,
      until: [],
      modules: noModules,
      stop: 'max-turns',
      turns: defaultConfig.turnsPerYear,
    },
    { name: 'a Party out, back partway through a later step', game: partyOut, until: [], modules: noModules, stop: 'party-returned', turns: 32 },
    { name: 'pool-refreshed listed', game: released, until: ['pool-refreshed'], modules: noModules, stop: 'pool-refreshed', turns: 32 },
    { name: 'a cap not a multiple of 30', game: released, until: [], maxTurns: 100, modules: noModules, stop: 'max-turns', turns: 100 },
    { name: 'the probe installed, its module stop in a later step', game: probeGame, until: [], modules: [probe], stop: 'module', turns: 91 },
  ];

  /** A save's game, loaded as the page loads one, with `modules` installed. */
  function loaded(text: string, modules: readonly Module[]): GameState {
    const state = gameReducer(gameReducer(initialGameState, { kind: 'load', text }, modules), { kind: 'settle' }, modules);
    if (state.rejection !== null) throw new Error(`the save does not load: ${state.rejection.reason}`);
    return state;
  }

  /** The same save loaded again and fast forwarded by one call of the whole cap, as the page did before v1.0.1. */
  function oneCall(text: string, until: readonly StopCondition[], maxTurns: number, modules: readonly Module[]): FastForwardResult {
    const document = documentOf(loaded(text, modules));
    const guild = playerGuild(document.world);
    if (guild === undefined) throw new Error("expected the player's Guild");
    return fastForward(document, { guildId: guild.id, until, maxTurns }, playDeps(document, modules));
  }

  // A year's case plays 2,160 Turns, about 4 s alone: past the default 5 s when other suites share
  // the machine, as M9's parallel builds do (M9-S1, DL-101).
  test.each(cases)('$name', { timeout: 30_000 }, ({ game, until, maxTurns, modules, stop, turns }) => {
    const text = serialise(documentOf(game()));
    const start = loaded(text, modules);
    vi.clearAllMocks();

    const states = stepped(start, { kind: 'fastForward', until, ...(maxTurns === undefined ? {} : { maxTurns }) }, modules);
    const steps = fastForwardCalls().length;
    const last = lastOf(states);
    const one = oneCall(text, until, maxTurns ?? defaultConfig.turnsPerYear, modules);

    expect(steps).toBeGreaterThan(1);
    expect(steps).toBe(Math.ceil(turns / fastForwardStepTurns));
    expect(documentOf(last).world.turn - documentOf(start).world.turn).toBe(turns);
    expect(last.stoppedBecause?.kind).toBe(stop);
    expect(serialise(documentOf(last))).toBe(serialise(one.document));
    expect(last.log).toEqual(one.events);
    expect(last.stoppedBecause).toEqual(one.stoppedBecause);
  });

  test('a Party out comes home partway through a step, not at its end', () => {
    const state = partyOut();
    const states = stepped(state, { kind: 'fastForward', until: [] });

    expect(states).toHaveLength(2);
    expect((documentOf(lastOf(states)).world.turn - documentOf(state).world.turn) % fastForwardStepTurns).not.toBe(0);
  });

  test('a new game stops after 3 Turns, inside one step, as one call does', () => {
    const text = serialise(documentOf(started()));
    const start = loaded(text, noModules);
    vi.clearAllMocks();

    const states = stepped(start, { kind: 'fastForward', until: [] });
    const one = oneCall(text, [], defaultConfig.turnsPerYear, noModules);

    expect(states).toHaveLength(1);
    expect(documentOf(lastOf(states)).world.turn - documentOf(start).world.turn).toBe(3);
    expect(serialise(documentOf(lastOf(states)))).toBe(serialise(one.document));
    expect(lastOf(states).log).toEqual(one.events);
    expect(lastOf(states).stoppedBecause).toEqual(one.stoppedBecause);
    expect(one.stoppedBecause.kind).toBe('decision-needed');
  });

  // M9-S1 (DL-101): the new stops, through the reducer's `fastForward` and the page's sentence.
  test("until a Quest the Heroes at home can staff: with a Party out it stops where one call would, before the Party is home", () => {
    const text = serialise(documentOf(withPartyOut(startedFrom('reducer-test'))));
    const start = loaded(text, noModules);
    const party = Object.values(documentOf(start).world.parties)[0];
    vi.clearAllMocks();

    const last = lastOf(stepped(start, { kind: 'fastForward', until: ['quest-staffable'] }));
    const one = oneCall(text, ['quest-staffable'], defaultConfig.turnsPerYear, noModules);

    expect(fastForwardCalls().every(([, options]) => options.until.includes('quest-staffable'))).toBe(true);
    expect(last.stoppedBecause?.kind).toBe('quest-staffable');
    expect(last.stoppedBecause).toEqual(one.stoppedBecause);
    expect(serialise(documentOf(last))).toBe(serialise(one.document));
    expect(documentOf(last).world.turn).toBeLessThan(party?.returnsOnTurn ?? 0);
    // Its Quests are buttons on the home view, as a decision needed's are (M9-S3's merge, DL-103).
    const staffable = last.stoppedBecause?.kind === 'quest-staffable' ? last.stoppedBecause.questIds : [];
    expect(stopView(last)).toEqual({
      kind: 'quest-staffable',
      sentence: expect.stringMatching(/^Stopped: a Quest to staff: The Lantern's Heroes at home could go on [A-Z][^.]+\.$/) as unknown,
      quests: staffable.map((questId) => expect.objectContaining({ questId }) as unknown),
    });
    expect(staffable.length).toBeGreaterThan(0);
    // Unasked, the same game plays on to the Party's return: the always-on decision is unchanged.
    expect(lastOf(stepped(loaded(text, noModules), { kind: 'fastForward', until: [] })).stoppedBecause?.kind).toBe('party-returned');
  });

  test("the player's Guild falling below the floor stops it unasked, where one call would, with the page's sentence", () => {
    const text = serialise(documentOf(changed(startedFrom('reducer-test'), (_, player) => void (player.wealth = -1))));
    const start = loaded(text, noModules);

    const last = lastOf(stepped(start, { kind: 'fastForward', until: [] }));
    const one = oneCall(text, [], defaultConfig.turnsPerYear, noModules);

    const due = defaultConfig.bankruptcyGraceDays;
    expect(last.stoppedBecause).toEqual({ kind: 'below-floor', guildId: playerOf(start).id, dueDay: due });
    expect(last.stoppedBecause).toEqual(one.stoppedBecause);
    expect(serialise(documentOf(last))).toBe(serialise(one.document));
    expect(stopView(last)).toEqual({
      kind: 'below-floor',
      sentence: `Stopped: The Lantern fell below the Bankruptcy floor: Bankruptcy on the night of Day ${due} unless its Wealth recovers by then.`,
    });
  });
});

describe("the player's Stop (v1.0.1-S5, DL-96)", () => {
  test('between steps, ends the fast forward with the game and the log the last step left, and how far it came', () => {
    const before = withRosterReleased(started());
    const entries = documentOf(before).history.entries.length;
    const first = gameReducer(gameReducer(before, { kind: 'fastForward', until: ['pool-refreshed'] }), { kind: 'settle' });
    const held = first.forwarding;
    if (held === null) throw new Error('expected a fast forward between its steps');

    const stopped = gameReducer(first, { kind: 'stop' });

    expect(stopped).toMatchObject({ busy: false, pending: null, forwarding: null, stoppedBecause: null, rejection: null });
    expect(stopped.stopped).toEqual({ until: ['pool-refreshed'], turnsPlayed: fastForwardStepTurns });
    expect(stopped.document).toBe(held.document);
    expect(stopped.log).toBe(held.events);
    expect(documentOf(stopped).world.turn).toBe(documentOf(before).world.turn + fastForwardStepTurns);
    expect(stopped.log).toEqual(documentOf(stopped).history.entries.slice(entries));
  });

  test('a settle scheduled before the Stop runs nothing; the next play is taken, from where it stopped, and clears it', () => {
    const first = gameReducer(gameReducer(withRosterReleased(started()), { kind: 'fastForward', until: ['pool-refreshed'] }), { kind: 'settle' });
    const stopped = gameReducer(first, { kind: 'stop' });
    vi.clearAllMocks();

    expect(gameReducer(stopped, { kind: 'settle' })).toBe(stopped);
    expect(fastForward).not.toHaveBeenCalled();

    // "Fast forward again", with the stops it was asked for: the pool refreshed two Turns on.
    const again = play(stopped, { kind: 'fastForward', until: ['pool-refreshed'] });
    expect(fastForwardCalls()[0]?.[0]).toBe(stopped.document);
    expect(again).toMatchObject({ stopped: null, stoppedBecause: { kind: 'pool-refreshed' } });
    expect(documentOf(again).world.turn).toBe(documentOf(stopped).world.turn + 2);
  });

  test('with no fast forward between its steps, changes nothing', () => {
    const state = started();
    const accepted = gameReducer(withRosterReleased(state), { kind: 'fastForward', until: [] });
    const ended = play(state, { kind: 'fastForward', until: [] });

    expect(gameReducer(state, { kind: 'stop' })).toBe(state);
    expect(gameReducer(accepted, { kind: 'stop' })).toBe(accepted);
    expect(gameReducer(ended, { kind: 'stop' })).toBe(ended);
  });

  test('the next play carried out clears it; a refusal keeps it', () => {
    const first = gameReducer(gameReducer(withRosterReleased(started()), { kind: 'fastForward', until: [] }), { kind: 'settle' });
    const stopped = gameReducer(first, { kind: 'stop' });

    expect(play(stopped, { kind: 'rebase' }).stopped).toBe(stopped.stopped);
    expect(play(stopped, { kind: 'advance' }).stopped).toBeNull();
  });
});

// ── The document is never mutated ────────────────────────────────────────────────────────────

/** Freezes `value` and everything it holds. */
function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const inner of Object.values(value)) deepFreeze(inner);
  }
  return value;
}

/**
 * Freezes the state and its document: `meta` and `world` whole, and every History entry. The
 * History's own lists stay open: it is the one section appended to in place, by the engine's
 * `append` alone (ADR-0008).
 */
function freeze(state: GameState): GameState {
  const { document } = state;
  if (document !== null) {
    deepFreeze(document.meta);
    deepFreeze(document.world);
    for (const entry of document.history.entries) deepFreeze(entry);
    Object.freeze(document);
  }
  deepFreeze(state.log);
  deepFreeze(state.rejection);
  deepFreeze(state.warnings);
  deepFreeze(state.stoppedBecause);
  return Object.freeze(state);
}

describe('the document is never mutated', () => {
  test('a frozen document, and each one after it, survives twenty plays', () => {
    const plays: ((state: GameState) => GameAction)[] = [
      () => ({ kind: 'buy', definitionKey: 'short-sword', quantity: 1 }),
      (state) => {
        const guild = playerOf(state);
        const sword = holdings(documentOf(state).world, { kind: 'guild', id: guild.id }).stacks.find(
          (stack) => stack.definitionKey === 'short-sword',
        );
        return { kind: 'equip', heroId: guild.rosterIds[0] as Guild['rosterIds'][number], stackId: sword?.id ?? makeId('stacks', 1) };
      },
      (state) => ({ kind: 'unequip', heroId: playerOf(state).rosterIds[0] as Guild['rosterIds'][number], slot: 'weapon' }),
      () => ({ kind: 'buy', definitionKey: 'whetstone', quantity: 1 }),
      (state) => {
        const guild = playerOf(state);
        const sword = holdings(documentOf(state).world, { kind: 'guild', id: guild.id }).stacks.find(
          (stack) => stack.definitionKey === 'short-sword',
        );
        return { kind: 'sell', stackId: sword?.id ?? makeId('stacks', 1), quantity: 1 };
      },
      (state) => {
        const { world } = documentOf(state);
        const available = availableHeroes(world, playerOf(state));
        const quest = offeredQuests(world).find((each) => partyFor(each, available, content) !== null);
        if (quest === undefined) throw new Error('expected a Quest the Roster can staff');
        const heroIds = partyFor(quest, available, content) ?? [];
        return { kind: 'dispatch', questId: quest.id, heroIds, consumables: [{ definitionKey: 'whetstone', quantity: 1 }] };
      },
      () => ({ kind: 'build', facility: 'infirmary' }),
      (state) => ({ kind: 'recruit', heroId: unattachedHeroes(documentOf(state).world)[0]?.id ?? makeId('heroes', 999) }),
      (state) => {
        const { world } = documentOf(state);
        const rival = Object.values(world.guilds).find((guild) => guild.id !== playerOf(state).id && guild.rosterIds.length > 0);
        return { kind: 'transferIn', heroId: rival?.rosterIds[0] ?? makeId('heroes', 999) };
      },
      (state) => {
        const { world } = documentOf(state);
        const rival = Object.values(world.guilds).find((guild) => guild.id !== playerOf(state).id && guild.rosterIds.length > 0);
        return { kind: 'offerTransfer', heroId: rival?.rosterIds[0] ?? makeId('heroes', 999) };
      },
      () => ({ kind: 'acceptTransfer', offerId: makeId('offers', 999) }),
      () => ({ kind: 'declineTransfer', offerId: makeId('offers', 999) }),
      (state) => {
        const { world } = documentOf(state);
        const rival = Object.values(world.guilds).find((guild) => guild.id !== playerOf(state).id);
        const heroId = availableHeroes(world, playerOf(state))[0]?.id ?? makeId('heroes', 999);
        return { kind: 'transferOut', heroId, toGuildId: rival?.id ?? makeId('guilds', 999) };
      },
      () => ({ kind: 'rebase' }),
      () => ({ kind: 'advance' }),
      () => ({ kind: 'advance', turns: 2 }),
      () => ({ kind: 'fastForward', until: [], maxTurns: 6 }),
      () => ({ kind: 'dispatch', questId: makeId('quests', 999), heroIds: [] }),
      (state) => ({ kind: 'load', text: serialise(documentOf(state)) }),
      () => ({ kind: 'fastForward', until: ['pool-refreshed'], maxTurns: 3 }),
    ];
    expect(plays).toHaveLength(20);

    const first = freeze(started());
    const firstMetaAndWorld = JSON.stringify([documentOf(first).meta, documentOf(first).world]);
    const firstEntries = [...documentOf(first).history.entries];
    let state = first;
    let carriedOut = 0;
    let refused = 0;
    for (const next of plays) {
      const before = state;
      const beforeMetaAndWorld = JSON.stringify([documentOf(before).meta, documentOf(before).world]);
      state = freeze(gameReducer(gameReducer(before, next(before)), { kind: 'settle' }));

      if (state.rejection === null) carriedOut += 1;
      else refused += 1;
      expect(JSON.stringify([documentOf(before).meta, documentOf(before).world])).toBe(beforeMetaAndWorld);
    }

    expect(JSON.stringify([documentOf(first).meta, documentOf(first).world])).toBe(firstMetaAndWorld);
    // The History only grew: the entries the first document held are the first entries still.
    expect(documentOf(first).history.entries.slice(0, firstEntries.length)).toEqual(firstEntries);
    expect(documentOf(state).world.turn).toBeGreaterThan(documentOf(first).world.turn);
    // Both kinds of outcome were driven through frozen documents.
    expect(carriedOut).toBeGreaterThanOrEqual(8);
    expect(refused).toBeGreaterThanOrEqual(4);
  });
});
