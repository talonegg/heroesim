import { afterEach, describe, expect, test, vi } from 'vitest';
import { advance } from '../advance.js';
import { defaultConfig, type EngineDeps, type GameConfig } from '../config.js';
import { createWorld } from '../create.js';
import type { WorldDocument } from '../document.js';
import { count } from '../history.js';
import { phases } from '../pipeline.js';
import { deserialise, serialise } from '../serialise.js';
import { testContent, testDeps, withValid } from '../world.test-support.js';
import { applyAction } from './action.js';
import { rebase } from './rebase.js';

const setup = { guildmasterName: 'Ada', guildName: 'The Test', createdAt: 'test' };

/**
 * A game's own rules at version 1, and the defaults of a later release at version 2 with one
 * default changed, whatever version `defaultConfig` is at: the versions these tests name are
 * pinned here (DL-35 raised the defaults' own version to 2).
 */
const olderRules = (): EngineDeps => testDeps({ configVersion: 1 });
const laterDefaults: GameConfig = { ...defaultConfig, configVersion: 2, turnsPerYear: 12 };

/** The deps a front end plays a loaded game under: its own config, filled forward (data-model §2). */
function playDeps(document: WorldDocument, defaults: GameConfig): EngineDeps {
  return { config: { ...defaults, ...document.meta.config }, content: testContent };
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
    const created = createWorld('rebase', setup, olderRules()).document;
    expect(created.meta.config.configVersion).toBe(1);

    // Loaded by a release whose defaults are at version 2.
    const loaded = deserialise(serialise(created), { config: laterDefaults, content: testContent });
    if (!loaded.ok) throw new Error(loaded.reason.message);
    let document = loaded.document;

    const before = rulesOfTheNextTurn(document, playDeps(document, laterDefaults));
    expect(before.config).toMatchObject({ configVersion: 1, turnsPerYear: defaultConfig.turnsPerYear });
    document = withValid(before.document, testDeps());
    expect(document.meta.config.configVersion).toBe(1);

    const rebased = rebase(document, { config: laterDefaults, content: testContent });
    if (!rebased.ok) throw new Error(`Rejected ${rebased.rejection.reason}`);
    document = withValid(rebased.document, testDeps());

    expect(document.meta.config).toEqual(laterDefaults);
    expect(count(document.history, 'world.rules-adopted')).toBe(1);
    expect(rebased.events).toEqual([
      {
        turn: 1,
        type: 'world.rules-adopted',
        participants: [],
        labels: {},
        milestone: true,
        payload: { oldConfigVersion: 1, newConfigVersion: 2 },
      },
    ]);
    expect(document.history.entries.at(-1)).toBe(rebased.events[0]);
    expect(document.history.milestones.at(-1)).toBe(document.history.entries.length - 1);

    const after = rulesOfTheNextTurn(document, playDeps(document, laterDefaults));
    expect(after.config).toMatchObject({ configVersion: 2, turnsPerYear: 12 });

    const again = rebase(after.document, { config: laterDefaults, content: testContent });
    expect(again).toEqual({ ok: false, rejection: { action: 'rebase', reason: 'already-current', configVersion: 2 } });
    expect(count(after.document.history, 'world.rules-adopted')).toBe(1);
  });

  test('survives a save and a load under the new rules', () => {
    const created = createWorld('rebase-saved', setup, olderRules()).document;
    const rebased = rebase(created, { config: laterDefaults, content: testContent });
    if (!rebased.ok) throw new Error(`Rejected ${rebased.rejection.reason}`);

    const loaded = deserialise(serialise(rebased.document), { config: laterDefaults, content: testContent });

    expect(loaded.ok && loaded.document.meta.config).toEqual(laterDefaults);
  });
});

describe('rebase', () => {
  test('refuses a game already under the rules it is given, changing nothing', () => {
    const document = createWorld('current', setup, testDeps()).document;
    const before = serialise(document);

    const result = rebase(document, testDeps());

    expect(result).toEqual({
      ok: false,
      rejection: { action: 'rebase', reason: 'already-current', configVersion: defaultConfig.configVersion },
    });
    expect(serialise(document)).toBe(before);
  });

  test('gives the new document a new meta and leaves the old one, which other documents share, alone', () => {
    const document = createWorld('shared-meta', setup, olderRules()).document;
    Object.freeze(document.meta.config);
    Object.freeze(document.meta);

    const result = rebase(document, { config: laterDefaults, content: testContent });

    if (!result.ok) throw new Error(`Rejected ${result.rejection.reason}`);
    expect(result.document.meta).not.toBe(document.meta);
    expect(result.document.meta.config).not.toBe(laterDefaults);
    expect(document.meta.config.configVersion).toBe(1);
    expect(result.document.meta).toEqual({ ...document.meta, config: laterDefaults });
    expect(result.document.world).toBe(document.world);
    expect(result.document.history).toBe(document.history);
  });

  test('rewrites the config whole: a field the new rules lack is gone, and only equal versions are refused', () => {
    const document = createWorld('whole', setup, testDeps()).document;
    const saved = document.meta.config as GameConfig & { retiredField?: number };
    saved.retiredField = 7;
    saved.configVersion = 3;

    const result = rebase(document, olderRules());

    if (!result.ok) throw new Error(`Rejected ${result.rejection.reason}`);
    expect(result.document.meta.config).toEqual({ ...defaultConfig, configVersion: 1 });
    expect(result.events[0]?.payload).toEqual({ oldConfigVersion: 3, newConfigVersion: 1 });
  });

  test('is what applyAction does with a rebase action', () => {
    const one = createWorld('apply', setup, olderRules()).document;
    const two = createWorld('apply', setup, olderRules()).document;
    const deps = { config: laterDefaults, content: testContent };

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
