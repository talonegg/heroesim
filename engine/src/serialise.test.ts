import { describe, expect, test, vi } from 'vitest';
import {
  defaultConfig,
  deserialise,
  migrate,
  migrations,
  schemaVersion,
  serialise,
  type EngineDeps,
  type GameConfig,
  type Hero,
  type LoadResult,
  type Migration,
  type SavedDocument,
  type WorldDocument,
} from './index.js';
import { getHeapStatistics } from 'node:v8';
import { createWorld } from './create.js';
import type { EntityId } from './document.js';
import { append } from './history.js';
import { buildDocument, testContent, testDeps, withValid } from './world.test-support.js';

const setup = { guildmasterName: 'Ada', guildName: 'The Test', createdAt: 'test' };

/** The bytes this process's heap has allocated so far; `undefined` on a Node whose V8 does not count them. */
const allocatedBytes = (): number | undefined => (getHeapStatistics() as { total_allocated_bytes?: number }).total_allocated_bytes;

// M1-S8: canonical serialisation (data-model rule 7) and a versioned, validated load (§6).

// ── Fixtures ─────────────────────────────────────────────────────────────────────────────────

/** The deps a test plays its documents under; a load reads only their content and modules. */
const deps: EngineDeps = { config: defaultConfig, content: testContent };

const built = (): WorldDocument => withValid(buildDocument().document, deps);

/** A deep copy with every object's keys in reverse insertion order; arrays keep their order. */
function reversedKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(reversedKeys);
  if (typeof value !== 'object' || value === null) return value;
  const entries = Object.entries(value).reverse();
  return Object.fromEntries(entries.map(([key, inner]) => [key, reversedKeys(inner)]));
}

/** A deep copy with sorted keys, written independently of serialise.ts to check it against. */
function sortedKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortedKeys);
  if (typeof value !== 'object' || value === null) return value;
  const entries = Object.entries(value).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return Object.fromEntries(entries.map(([key, inner]) => [key, sortedKeys(inner)]));
}

function loaded(result: LoadResult): WorldDocument {
  if (!result.ok) throw new Error(`Refused: ${result.reason.message}`);
  return result.document;
}

function refusal(result: LoadResult) {
  if (result.ok) throw new Error('Loaded, where a refusal was expected');
  return result.reason;
}

const withVersion = (document: WorldDocument, version: number): string =>
  serialise({ ...document, meta: { ...document.meta, version } });


// ── serialise ────────────────────────────────────────────────────────────────────────────────

describe('serialise', () => {
  test('sorts keys at every depth, keeps arrays in order, and writes no whitespace', () => {
    const document = built();
    const text = serialise(document);
    expect(text).toBe(JSON.stringify(sortedKeys(document)));
    expect(text).not.toBe(JSON.stringify(document));
    expect(text.startsWith('{"history":{"byEntity":{')).toBe(true);
    expect(JSON.parse(text)).toEqual(document);
  });

  test('two documents differing only in key insertion order serialise identically', () => {
    const document = built();
    const reordered = reversedKeys(document) as WorldDocument;
    expect(JSON.stringify(reordered)).not.toBe(JSON.stringify(document));
    expect(serialise(reordered)).toBe(serialise(document));
  });

  test('keeps arrays in their order: a reordered Roster is a different document', () => {
    const document = built();
    const reordered = structuredClone(document);
    const [guildId, guild] = Object.entries(reordered.world.guilds)[0] ?? [];
    const roster = guild?.rosterIds.reverse();
    expect(serialise(reordered)).not.toBe(serialise(document));
    const written = JSON.parse(serialise(reordered)) as { world: { guilds: Record<string, { rosterIds: string[] }> } };
    expect(written.world.guilds[guildId ?? '']?.rosterIds).toEqual(roster);
  });

  test('throws, naming the path, on a document that is not JSON-safe', () => {
    const document = built();
    const hero = Object.values(document.world.heroes)[0] as Hero;
    hero.morale = Number.NaN;
    expect(() => serialise(document)).toThrow(`$.world.heroes["${hero.id}"].morale is nan`);
  });

  // v1.1.5-S1 (DL-174): JSON.stringify writes an object's array-index keys first, in ascending
  // number, and cannot be handed an own `__proto__` key by assignment; the save sorts every key by
  // its code units all the same.
  test('sorts array-index keys and an own __proto__ key by their code units like every other key', () => {
    const odd = JSON.parse('{"b":1,"10":2,"9":3,"__proto__":4,"a":5,"01":6}') as unknown;
    const document = { ...built(), odd } as WorldDocument;
    const text = serialise(document);
    expect(text).toContain('"odd":{"01":6,"10":2,"9":3,"__proto__":4,"a":5,"b":1}');
    expect(text).toBe(serialise(JSON.parse(text) as WorldDocument));
  });

  // v1.1.5-S1's verification (DL-174): each such key alone in its object, so that no other key
  // brings the old writer in: the first and the last array index, the first number that is not one,
  // and an own `__proto__` holding an object, which a copy would take as its prototype.
  test('sorts each array-index key and an own __proto__ key by its code units when it is the only one in its object', () => {
    const cases: [written: string, sorted: string][] = [
      ['{"~":1,"0":2,"!":3}', '{"!":3,"0":2,"~":1}'],
      ['{"~":1,"4294967294":2,"!":3}', '{"!":3,"4294967294":2,"~":1}'],
      ['{"~":1,"4294967295":2,"!":3}', '{"!":3,"4294967295":2,"~":1}'],
      ['{"~":1,"__proto__":{"b":2,"a":1},"!":3}', '{"!":3,"__proto__":{"a":1,"b":2},"~":1}'],
    ];
    for (const [written, sorted] of cases) {
      const document = { ...built(), odd: JSON.parse(written) as unknown } as WorldDocument;
      expect(serialise(document)).toContain(`"odd":${sorted}`);
    }
  });

  // v1.1.5-S1 (DL-174): a 20-year game's save of 116 MB was built from a string for every value at
  // every depth, each copied into its parent's, and allocated 22 times its length, the garbage that
  // grew a sweep's process to 1.65 GB. The text is now written in one pass.
  test.skipIf(allocatedBytes() === undefined)('writes a long History in one pass: it allocates a few times the text, not a string per value at every depth', () => {
    const document = built();
    const heroIds = Object.keys(document.world.heroes).slice(0, 3) as EntityId[];
    const turn = document.history.entries.at(-1)?.turn ?? 0;
    for (let n = 0; n < 20_000; n += 1) {
      append(document.history, {
        turn,
        type: 'quest.encounter',
        participants: heroIds,
        labels: Object.fromEntries(heroIds.map((id) => [id, `Name of ${id}`])),
        milestone: false,
        payload: { questId: 'quest-000001', step: n, outcome: n % 3 === 0 ? 'triumph' : 'success', scores: { might: n % 17, wits: n % 13 }, heroIds },
      });
    }
    // Measured once the code is warm, as a game's yearly saves find it.
    const warm = serialise(document);
    const before = allocatedBytes() ?? 0;
    const text = serialise(document);
    const allocated = (allocatedBytes() ?? 0) - before;
    expect(text).toBe(warm);
    expect(text.length).toBeGreaterThan(5_000_000);
    expect(allocated).toBeLessThan(8 * text.length);
  });
});

// ── deserialise ──────────────────────────────────────────────────────────────────────────────

describe('deserialise', () => {
  test('serialise(deserialise(serialise(d))) equals serialise(d) byte for byte', () => {
    const text = serialise(built());
    expect(serialise(loaded(deserialise(text, deps)))).toBe(text);
  });

  test('returns an equal document and no warnings', () => {
    const document = built();
    const result = deserialise(serialise(document), deps);
    expect(result).toEqual({ ok: true, document, warnings: [], deps: { config: defaultConfig, content: testContent } });
  });

  test('a document with meta.version 999 is refused, naming both versions', () => {
    expect(refusal(deserialise(withVersion(built(), 999), deps))).toMatchObject({
      kind: 'unsupported-version',
      documentVersion: 999,
      schemaVersion,
    });
  });

  test('an older version with no migration is refused, naming both versions', () => {
    expect(refusal(deserialise(withVersion(built(), 0), deps))).toMatchObject({
      kind: 'unsupported-version',
      documentVersion: 0,
      schemaVersion,
    });
  });

  test("the version compared is the engine's own, never one the save's config holds (DL-193)", () => {
    const document = built();
    document.meta = { ...document.meta, config: { ...document.meta.config, schemaVersion: 999 } as GameConfig };
    const result = deserialise(serialise(document), deps);
    expect(result.ok).toBe(true);
    expect(result.ok && result.deps.config).not.toHaveProperty('schemaVersion');
  });

  test('gives the deps to play the save under: its own config filled forward, the content and the modules', () => {
    const document = built();
    const saved: Partial<GameConfig> = { ...document.meta.config, boardSize: 3 };
    delete saved.marketSize;
    document.meta = { ...document.meta, config: saved as GameConfig };
    const result = deserialise(serialise(document), { content: testContent });
    expect(result.ok && result.deps).toEqual({ config: { ...defaultConfig, boardSize: 3 }, content: testContent });
  });

  test.each([
    ['checkVariance', 2],
    ['boardSize', 1.5],
    ['regardBands', { hostile: -20, cool: -4, neutral: -12, warm: 4, close: 12 }],
  ])('a save whose %s breaks its rule is refused as unsound-config, naming it (DL-193)', (setting, value) => {
    const document = built();
    document.meta = { ...document.meta, config: { ...document.meta.config, [setting]: value } };
    const reason = refusal(deserialise(serialise(document), deps));
    expect(reason).toMatchObject({ kind: 'unsound-config', problems: [{ setting }] });
    expect(reason.message).toMatch(new RegExp(`^The game's config is unsound: ${setting} is `));
  });

  test.each([
    ['empty text', ''],
    ['truncated JSON', serialise(buildDocument().document).slice(0, 200)],
    ['a trailing comma', '{"meta":{"version":1},}'],
  ])('malformed JSON (%s) is a typed refusal, not a throw', (_, text) => {
    expect(refusal(deserialise(text, deps)).kind).toBe('malformed-json');
  });

  test.each([
    ['null', 'null'],
    ['an array', '[]'],
    ['a string', '"hero-000001"'],
    ['no meta', '{"world":{}}'],
    ['no version', '{"meta":{}}'],
    ['a fractional version', '{"meta":{"version":1.5}}'],
    ['a version in a string', '{"meta":{"version":"1"}}'],
  ])('JSON that is not a document (%s) is refused', (_, text) => {
    expect(refusal(deserialise(text, deps)).kind).toBe('not-a-document');
  });

  test('a document the validator refuses is refused with its failures', () => {
    const document = built();
    const [player, rival] = Object.values(document.world.guilds);
    const heroId = player?.rosterIds[1] ?? ('' as Hero['id']);
    rival?.rosterIds.push(heroId);
    const reason = refusal(deserialise(serialise(document), deps));
    expect(reason.kind).toBe('invalid');
    const failures = reason.kind === 'invalid' ? reason.failures.map(({ check, id }) => ({ check, id })) : [];
    expect(failures).toContainEqual({ check: 'hero-on-two-rosters', id: heroId });
  });

  test('a structurally broken document is refused, not thrown on', () => {
    const reason = refusal(deserialise('{"meta":{"version":7},"world":[],"history":null}', deps));
    expect(reason.kind).toBe('invalid');
  });

  test('unknown keys at the top level, in meta.config and in a row survive a round trip (rule 5)', () => {
    const document = built();
    const extended = {
      ...document,
      notes: { kept: true },
      meta: { ...document.meta, config: { ...document.meta.config, futureTunable: 7 } },
    };
    const hero = Object.values(extended.world.heroes)[0] as Hero & { nickname?: string };
    hero.nickname = 'the Lantern';
    const text = serialise(extended);

    const back = loaded(deserialise(text, deps)) as typeof extended;

    expect(back.notes).toEqual({ kept: true });
    expect(back.meta.config).toMatchObject({ futureTunable: 7 });
    expect((back.world.heroes[hero.id] as typeof hero).nickname).toBe('the Lantern');
    expect(serialise(back)).toBe(text);
  });

  test('an unknown content key loads, with its warning', () => {
    const document = built();
    const hero = Object.values(document.world.heroes)[0] as Hero;
    hero.stats.luck = 7;
    const result = deserialise(serialise(document), deps);
    const warnings = result.ok ? result.warnings.map(({ check, key }) => ({ check, key })) : [];
    expect(warnings).toEqual([{ check: 'unknown-stat', key: 'luck' }]);
    expect(loaded(result).world.heroes[hero.id]?.stats.luck).toBe(7);
  });
});

// ── The migration chain ──────────────────────────────────────────────────────────────────────

describe('the migration chain', () => {
  const saved = (version: number): SavedDocument => ({ meta: { version }, steps: [] as number[] });

  /** A step that records its own version in the document. */
  const recording =
    (from: number): Migration =>
    (document) => ({ ...document, steps: [...(document.steps as number[]), from] });

  test('holds no step, so a save of a schema before 7 is refused, not migrated (v1.1.2-S3, DL-125 item 10.2; v1.1.3-S6, DL-135 item 7; v1.1.6-S7, DL-193)', () => {
    expect(Object.keys(migrations)).toEqual([]);
    expect(schemaVersion).toBe(7);
    expect(defaultConfig).not.toHaveProperty('schemaVersion');
  });

  test('runs forward one step per version, in order, setting meta.version after each', () => {
    const chain = { 1: recording(1), 2: recording(2), 3: recording(3) };
    const result = migrate(saved(1), 4, chain);
    expect(result).toEqual({ ok: true, document: { meta: { version: 4 }, steps: [1, 2, 3] } });
  });

  test('starts from the document’s own version', () => {
    const chain = { 1: recording(1), 2: recording(2), 3: recording(3) };
    expect(migrate(saved(2), 4, chain)).toEqual({ ok: true, document: { meta: { version: 4 }, steps: [2, 3] } });
  });

  test('leaves a current document alone', () => {
    const document = saved(3);
    expect(migrate(document, 3, { 3: recording(3) })).toEqual({ ok: true, document });
  });

  test('a gap in the chain refuses, naming both versions, and runs no step', () => {
    const first = vi.fn(recording(1));
    const result = migrate(saved(1), 4, { 1: first, 3: recording(3) });
    expect(result).toMatchObject({
      ok: false,
      reason: { kind: 'unsupported-version', documentVersion: 1, schemaVersion: 4 },
    });
    expect(first).not.toHaveBeenCalled();
  });

  test('never runs backwards', () => {
    expect(migrate(saved(5), 4, { 4: recording(4) })).toMatchObject({
      ok: false,
      reason: { kind: 'unsupported-version', documentVersion: 5, schemaVersion: 4 },
    });
  });
});

// ── Older saves: refused (v1.1.2-S3, DL-125 item 10.2; v1.1.3-S6, DL-135 item 7; DL-193) ────

describe('a save of an older schema', () => {
  /**
   * `document` as `v1.1.5` wrote it, schema 6: `meta.version` 6, the two versions and the gear slots
   * in its config and none in `meta`, and each Quest with its template's `demands` (v1.1.6-S7).
   */
  function asVersion6(document: WorldDocument): string {
    const parsed = JSON.parse(serialise(document)) as SavedDocument & {
      meta: { config: Record<string, unknown> };
      world: { quests: Record<string, Record<string, unknown>> };
    };
    parsed.meta.version = 6;
    Object.assign(parsed.meta.config, { schemaVersion: 6, configVersion: 13, gearSlots: ['weapon', 'armour', 'trinket'] });
    Reflect.deleteProperty(parsed.meta, 'configVersion');
    for (const quest of Object.values(parsed.world.quests)) quest['demands'] = [['strength', 1]];
    return JSON.stringify(parsed);
  }

  test('of schema 6, as v1.1.5 wrote it, is refused as unsupported-version, naming both versions, not as invalid (DL-193)', () => {
    const text = asVersion6(createWorld('version-6', setup, testDeps()).document);

    expect(refusal(deserialise(text, deps))).toMatchObject({ kind: 'unsupported-version', documentVersion: 6, schemaVersion: 7 });
  });

  /**
   * `document` as `v1.1.2` wrote it, schema 5: `meta.version` 5, and no Hero with a Portrait, an
   * Appearance or a Biography (v1.1.3-S6).
   */
  function asVersion5(document: WorldDocument): string {
    const parsed = JSON.parse(serialise(document)) as SavedDocument & { world: { heroes: Record<string, object> } };
    parsed.meta.version = 5;
    for (const hero of Object.values(parsed.world.heroes)) {
      for (const field of ['portraitKey', 'appearance', 'biography']) Reflect.deleteProperty(hero, field);
    }
    return JSON.stringify(parsed);
  }

  test('of schema 5, as v1.1.2 wrote it, is refused as unsupported-version, naming both versions, not as invalid (DL-135 item 7)', () => {
    const text = asVersion5(createWorld('version-5', setup, testDeps()).document);

    expect(refusal(deserialise(text, deps))).toMatchObject({ kind: 'unsupported-version', documentVersion: 5, schemaVersion: 7 });
  });

  test("of schema 5 with a Hero's three fields is refused the same way: the version, not the shape, refuses it", () => {
    expect(refusal(deserialise(withVersion(built(), 5), deps))).toMatchObject({ kind: 'unsupported-version', documentVersion: 5, schemaVersion: 7 });
  });

  /**
   * `document` as `v1.1.1` wrote it, schema 4: `meta.version` 4, no Guildmaster with a Portrait and
   * no Patron with a sex.
   */
  function asVersion4(document: WorldDocument): string {
    const parsed = JSON.parse(serialise(document)) as SavedDocument & {
      world: { guildmasters: Record<string, object>; patrons: Record<string, object> };
    };
    parsed.meta.version = 4;
    for (const guildmaster of Object.values(parsed.world.guildmasters)) Reflect.deleteProperty(guildmaster, 'portraitKey');
    for (const patron of Object.values(parsed.world.patrons)) Reflect.deleteProperty(patron, 'sex');
    return JSON.stringify(parsed);
  }

  test('of schema 4, as v1.1.1 wrote it, is refused as unsupported-version, naming both versions, not as invalid', () => {
    const text = asVersion4(createWorld('version-4', setup, testDeps()).document);

    expect(refusal(deserialise(text, deps))).toMatchObject({ kind: 'unsupported-version', documentVersion: 4, schemaVersion: 7 });
  });

  test.each([1, 2, 3])('of schema %i is refused the same way: no migration leads from it', (version) => {
    expect(refusal(deserialise(withVersion(built(), version), deps))).toMatchObject({
      kind: 'unsupported-version',
      documentVersion: version,
      schemaVersion: 7,
    });
  });
});

// ── structuredClone and JSON agree (rule 6) ──────────────────────────────────────────────────

describe('a document is JSON-safe', () => {
  test('structuredClone(world) and JSON.parse(JSON.stringify(world)) deep-equal', () => {
    const { world } = built();
    expect(structuredClone(world)).toStrictEqual(JSON.parse(JSON.stringify(world)));
  });

  test('so do the whole document and its History', () => {
    const document = built();
    expect(structuredClone(document)).toStrictEqual(JSON.parse(JSON.stringify(document)));
    expect(structuredClone(document.history)).toStrictEqual(JSON.parse(serialise(document)).history);
  });
});
