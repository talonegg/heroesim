import type * as Engine from '@heroesim/engine';
import {
  advance,
  applyAction,
  availableHeroes,
  defaultConfig,
  deserialise,
  fastForward,
  holdings,
  makeId,
  offeredQuests,
  partyFor,
  playerGuild,
  rebase,
  serialise,
  unattachedHeroes,
  type EngineDeps,
  type Guild,
  type WorldDocument,
} from '@heroesim/engine';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { content } from '../content';
import { gameReducer, initialGameState, type GameAction, type GameState, type Play } from './reducer';

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

/** Plays `action` as the page does: accepted, then settled. */
function play(state: GameState, action: Play): GameState {
  return gameReducer(gameReducer(state, action), { kind: 'settle' });
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

  test("fast forward watches the player's Guild, for a year unless told, and keeps why it stopped", () => {
    const state = started();
    const guild = playerOf(state);
    const forward = play(state, { kind: 'fastForward', until: ['pool-refreshed'] });

    expect(fastForward).toHaveBeenCalledWith(
      state.document,
      { guildId: guild.id, until: ['pool-refreshed'], maxTurns: defaultConfig.turnsPerYear },
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
