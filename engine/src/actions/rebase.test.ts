import { afterEach, describe, expect, test, vi } from 'vitest';
import { advance } from '../advance.js';
import { configVersion, defaultConfig, type EngineDeps, type GameConfig } from '../config.js';
import { playDeps } from '../config-check.js';
import { createWorld } from '../create.js';
import type { WorldDocument } from '../document.js';
import { count } from '../history.js';
import { phases } from '../pipeline.js';
import { deserialise, serialise } from '../serialise.js';
import { testContent, testDeps, withValid } from '../world.test-support.js';
import { applyAction } from './action.js';
import { newRules, rebase } from './rebase.js';

const setup = { guildmasterName: 'Ada', guildName: 'The Test', createdAt: 'test' };

/**
 * A game made under the rules of version 1, `meta.configVersion` (v1.1.6-S7, DL-193), and this
 * release's defaults, at `configVersion`, with one default changed: `turnsPerYear` 12, so that the
 * rules a game plays under show which it has.
 */
function olderGame(seed: string): WorldDocument {
  const { document } = createWorld(seed, setup, testDeps());
  document.meta.configVersion = 1;
  return document;
}
const laterDefaults: GameConfig = { ...defaultConfig, turnsPerYear: 12 };
const later: EngineDeps = { config: laterDefaults, content: testContent };

/** The deps a front end plays a loaded game under: its own config, filled forward (`playDeps`). */
function played(document: WorldDocument): EngineDeps {
  const result = playDeps(document, testContent);
  if (!result.ok) throw new Error(result.refusal.message);
  return result.deps;
}

/** The config the phases of the next Turn are given. */
function rulesOfTheNextTurn(document: WorldDocument, deps: EngineDeps): { document: WorldDocument; config: GameConfig } {
  const seen: GameConfig[] = [];
  const spies = phases.map((phase) =>
    vi.spyOn(phase, 'run').mockImplementation((_world, ctx) => {
      seen.push(ctx.config);
      return [];
    }),
  );
  const next = advance(document, deps).document;
  for (const spy of spies) spy.mockRestore();
  const [config] = seen;
  if (config === undefined) throw new Error('No phase ran');
  return { document: next, config };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('a save under older rules', () => {
  test('plays under its own configVersion until rebase adopts the new defaults, once', () => {
    const created = olderGame('rebase');

    // Loaded by this release.
    const loaded = deserialise(serialise(created), { content: testContent });
    if (!loaded.ok) throw new Error(loaded.reason.message);
    let document = loaded.document;

    const before = rulesOfTheNextTurn(document, played(document));
    expect(before.config).toMatchObject({ turnsPerYear: defaultConfig.turnsPerYear });
    document = withValid(before.document, testDeps());
    expect(document.meta.configVersion).toBe(1);

    const rebased = rebase(document, later);
    if (!rebased.ok) throw new Error(`Rejected ${rebased.rejection.reason}`);
    document = withValid(rebased.document, testDeps());

    expect(document.meta.config).toEqual(laterDefaults);
    expect(document.meta.configVersion).toBe(configVersion);
    expect(count(document.history, 'world.rules-adopted')).toBe(1);
    expect(rebased.events).toEqual([
      {
        turn: 1,
        type: 'world.rules-adopted',
        participants: [],
        labels: {},
        milestone: true,
        payload: { oldConfigVersion: 1, newConfigVersion: configVersion },
      },
    ]);
    expect(document.history.entries.at(-1)).toBe(rebased.events[0]);
    expect(document.history.milestones.at(-1)).toBe(document.history.entries.length - 1);

    const after = rulesOfTheNextTurn(document, played(document));
    expect(after.config).toMatchObject({ turnsPerYear: 12 });

    const again = rebase(after.document, later);
    expect(again).toEqual({ ok: false, rejection: { action: 'rebase', reason: 'already-current', configVersion } });
    expect(count(after.document.history, 'world.rules-adopted')).toBe(1);
  });

  test('survives a save and a load under the new rules', () => {
    const created = olderGame('rebase-saved');
    const rebased = rebase(created, later);
    if (!rebased.ok) throw new Error(`Rejected ${rebased.rejection.reason}`);

    const loaded = deserialise(serialise(rebased.document), { content: testContent });

    expect(loaded.ok && loaded.document.meta.config).toEqual(laterDefaults);
    expect(loaded.ok && loaded.document.meta.configVersion).toBe(configVersion);
    expect(loaded.ok && loaded.deps.config).toEqual(laterDefaults);
  });
});

describe('rebase', () => {
  test('refuses a game already under the rules it is given, changing nothing', () => {
    const document = createWorld('current', setup, testDeps()).document;
    const before = serialise(document);

    const result = rebase(document, testDeps());

    expect(result).toEqual({
      ok: false,
      rejection: { action: 'rebase', reason: 'already-current', configVersion },
    });
    expect(serialise(document)).toBe(before);
  });

  test('gives the new document a new meta and leaves the old one, which other documents share, alone', () => {
    const document = olderGame('shared-meta');
    Object.freeze(document.meta.config);
    Object.freeze(document.meta);

    const result = rebase(document, later);

    if (!result.ok) throw new Error(`Rejected ${result.rejection.reason}`);
    expect(result.document.meta).not.toBe(document.meta);
    expect(result.document.meta.config).not.toBe(laterDefaults);
    expect(document.meta.configVersion).toBe(1);
    expect(result.document.meta).toEqual({ ...document.meta, configVersion, config: laterDefaults });
    expect(result.document.world).toBe(document.world);
    expect(result.document.history).toBe(document.history);
  });

  test('rewrites the config whole: a field the new rules lack is gone, and only equal versions are refused', () => {
    const document = createWorld('whole', setup, testDeps()).document;
    const saved = document.meta.config as GameConfig & { retiredField?: number };
    saved.retiredField = 7;
    document.meta.configVersion = configVersion + 1;

    const result = rebase(document, testDeps());

    if (!result.ok) throw new Error(`Rejected ${result.rejection.reason}`);
    expect(result.document.meta.config).toEqual(defaultConfig);
    expect(result.events[0]?.payload).toEqual({ oldConfigVersion: configVersion + 1, newConfigVersion: configVersion });
  });

  test('is what applyAction does with a rebase action', () => {
    const one = olderGame('apply');
    const two = olderGame('apply');
    const deps = later;

    const direct = rebase(one, deps);
    const applied = applyAction(two, { kind: 'rebase' }, deps);
    expect(direct.ok && applied.ok).toBe(true);

    expect(applied.ok && serialise(applied.document)).toBe(direct.ok && serialise(direct.document));
    // `two`'s meta is untouched, so it is the rebased document that is now current.
    expect(applied.ok && applyAction(applied.document, { kind: 'rebase' }, deps)).toMatchObject({
      ok: false,
      rejection: { action: 'rebase', reason: 'already-current' },
    });
  });
});

describe('newRules', () => {
  test("names the game's rules and the newer ones a rebase would adopt, while the game's are behind", () => {
    const document = olderGame('behind');

    expect(newRules(document.meta)).toEqual({ from: 1, to: configVersion });
  });

  test('is null for a game under the rules it is given, or under later ones than those', () => {
    const current = createWorld('current', setup, testDeps()).document;
    const newer = createWorld('later', setup, testDeps()).document;
    newer.meta.configVersion = configVersion + 1;

    expect(current.meta.configVersion).toBe(configVersion);
    expect(newRules(current.meta)).toBeNull();
    expect(newRules(newer.meta)).toBeNull();
  });

  test('is null after the rebase it offered', () => {
    const document = olderGame('adopted');
    const rebased = rebase(document, later);
    if (!rebased.ok) throw new Error(`Rejected ${rebased.rejection.reason}`);

    expect(newRules(rebased.document.meta)).toBeNull();
  });
});
