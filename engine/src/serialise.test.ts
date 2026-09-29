import { describe, expect, test, vi } from 'vitest';
import {
  defaultConfig,
  deserialise,
  migrate,
  migrations,
  serialise,
  type EngineDeps,
  type GameConfig,
  type Hero,
  type LoadResult,
  type Migration,
  type SavedDocument,
  type WorldDocument,
} from './index.js';
import { transferIn, transferOut } from './actions/transfer.js';
import { advance } from './advance.js';
import { createWorld } from './create.js';
import type { HeroId } from './document.js';
import { playerGuild } from './selectors.js';
import { buildDocument, testContent, testDeps, withDispositions, withValid } from './world.test-support.js';

const setup = { guildmasterName: 'Ada', guildName: 'The Test', createdAt: 'test' };

// M1-S8: canonical serialisation (data-model rule 7) and a versioned, validated load (§6).

// ── Fixtures ─────────────────────────────────────────────────────────────────────────────────

/** A loading front end's deps: the engine's own config, not one merged from the save (DL-20). */
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

/** A Guildmaster row as a save before version 4 wrote it: no descriptive Attribute, no Retirement (DL-102). */
function withoutVersion4(guildmaster: object): void {
  for (const field of ['birthplace', 'appearance', 'biography', 'retiredOnTurn']) Reflect.deleteProperty(guildmaster, field);
}

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
    expect(result).toEqual({ ok: true, document, warnings: [] });
  });

  test('a document with meta.version 999 is refused, naming both versions', () => {
    expect(refusal(deserialise(withVersion(built(), 999), deps))).toMatchObject({
      kind: 'unsupported-version',
      documentVersion: 999,
      schemaVersion: defaultConfig.schemaVersion,
    });
  });

  test('an older version with no migration is refused, naming both versions', () => {
    expect(refusal(deserialise(withVersion(built(), 0), deps))).toMatchObject({
      kind: 'unsupported-version',
      documentVersion: 0,
      schemaVersion: defaultConfig.schemaVersion,
    });
  });

  test('the version compared is the one in deps.config', () => {
    const later: GameConfig = { ...defaultConfig, schemaVersion: defaultConfig.schemaVersion + 1 };
    expect(refusal(deserialise(serialise(built()), { ...deps, config: later }))).toMatchObject({
      kind: 'unsupported-version',
      documentVersion: defaultConfig.schemaVersion,
      schemaVersion: later.schemaVersion,
    });
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
    const reason = refusal(deserialise('{"meta":{"version":1},"world":[],"history":null}', deps));
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

  test('holds three steps, from version 1 (M2-S8), version 2 (DL-60) and version 3 (DL-102), with schemaVersion 4', () => {
    expect(Object.keys(migrations)).toEqual(['1', '2', '3']);
    expect(defaultConfig.schemaVersion).toBe(4);
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

// ── Version 1 to 2: the pool's Hero fields (M2-S8, DL-27) ─────────────────────────────────────

describe('a version-1 save', () => {
  /** `document` as a version-1 save wrote it: `meta.version` 1, and no Hero with the pool fields or version 3's, nor Guildmaster with version 4's. */
  function asVersion1(document: WorldDocument): string {
    const parsed = JSON.parse(serialise(document)) as SavedDocument & { world: { heroes: Record<string, object>; guildmasters: Record<string, object> } };
    parsed.meta.version = 1;
    for (const hero of Object.values(parsed.world.heroes)) {
      Reflect.deleteProperty(hero, 'unattachedSince');
      Reflect.deleteProperty(hero, 'leftPoolOnTurn');
      Reflect.deleteProperty(hero, 'transferredOnTurn');
    }
    for (const guildmaster of Object.values(parsed.world.guildmasters)) withoutVersion4(guildmaster);
    return JSON.stringify(parsed);
  }

  const created = (): WorldDocument => createWorld('version-1', setup, testDeps()).document;

  test.each([
    ['a created world', created],
    ['the fixture, with a dead Hero and a departed one', built],
  ])('%s loads as the document the engine writes now', (_, make) => {
    const document = make();

    const result = loaded(deserialise(asVersion1(document), deps));

    // Pool Heroes entered at enteredTurn, every other Hero has neither field, none has left.
    expect(result).toEqual(document);
    expect(result.meta.version).toBe(4);
  });

  test('the step leaves its input alone, and a save it cannot read to the validator', () => {
    const saved = JSON.parse(asVersion1(created())) as SavedDocument;
    const before = structuredClone(saved);
    const step = migrations[1] as Migration;

    step(saved);
    expect(saved).toEqual(before);

    const damaged = { ...saved, world: { heroes: 'none' } };
    expect(step(damaged)).toBe(damaged);
    expect(refusal(deserialise(JSON.stringify(damaged), deps))).toMatchObject({ kind: 'invalid' });
  });
});

// ── Version 2 to 3: the Transfer lock's Hero field (DL-60) ────────────────────────────────────

describe('a version-2 save', () => {
  /** `document` as a version-2 save wrote it: `meta.version` 2, no Hero with `transferredOnTurn`, and no Guildmaster with version 4's fields. */
  function asVersion2(document: WorldDocument): string {
    const parsed = JSON.parse(serialise(document)) as SavedDocument & { world: { heroes: Record<string, object>; guildmasters: Record<string, object> } };
    parsed.meta.version = 2;
    for (const hero of Object.values(parsed.world.heroes)) Reflect.deleteProperty(hero, 'transferredOnTurn');
    for (const guildmaster of Object.values(parsed.world.guildmasters)) withoutVersion4(guildmaster);
    return JSON.stringify(parsed);
  }

  /**
   * A world in which the player took a Rival's first Hero on Turn 0 and sent them back on Turn 4, and
   * took its second on Turn 4: a History with two Transfers of one Hero and one of another.
   */
  function withTransfers(): WorldDocument {
    const dealing = testDeps({ transferLockDays: 0, marketSize: 0 }, withDispositions({ transferAppetite: 1, recruitThreshold: 0, buildThreshold: 1_000_000, gearThreshold: 1_000_000 }));
    let document = createWorld('version-2', setup, dealing).document;
    const player = playerGuild(document.world);
    if (player === undefined) throw new Error("No player's Guild");
    const playerId = player.id;
    player.wealth = 100_000;
    const rival = Object.values(document.world.guilds).find((guild) => guild.id !== playerId);
    if (rival === undefined) throw new Error('No Rival');
    const [first] = rival.rosterIds as [HeroId];
    const take = (heroId: HeroId) => {
      const result = transferIn(document, { guildId: playerId, heroId }, dealing);
      if (!result.ok) throw new Error(JSON.stringify(result.rejection));
      document = result.document;
    };
    take(first);
    while (document.world.turn < 4) document = advance(document, dealing).document;
    const back = transferOut(document, { guildId: playerId, heroId: first, toGuildId: rival.id }, dealing);
    if (!back.ok) throw new Error(JSON.stringify(back.rejection));
    document = back.document;
    // A second Hero of the Rival's, one at home (the Rivals have been sending Parties out).
    const second = document.world.guilds[rival.id]?.rosterIds.find((heroId) => heroId !== first && document.world.heroes[heroId]?.partyId === null);
    if (second === undefined) throw new Error('No Hero at home');
    take(second);
    return withValid(document, dealing);
  }

  test.each([
    ['a created world', () => createWorld('version-2', setup, testDeps()).document],
    ['the fixture', built],
  ])('%s, with no Transfer in its History, loads as the document the engine writes now', (_, make) => {
    const document = make();

    const result = loaded(deserialise(asVersion2(document), deps));

    expect(result).toEqual(document);
    expect(Object.values(result.world.heroes).every((hero) => hero.transferredOnTurn === null)).toBe(true);
    expect(result.meta.version).toBe(4);
  });

  test("a Hero's transferredOnTurn is the Turn of the last hero.transferred naming them, read from the History", () => {
    const document = withTransfers();
    // What the engine wrote as the Transfers were made: each Hero's field is the Turn of their last.
    const turns = new Map<string, number[]>();
    for (const entry of document.history.entries) {
      if (entry.type !== 'hero.transferred') continue;
      const { heroId } = entry.payload as { heroId: string };
      turns.set(heroId, [...(turns.get(heroId) ?? []), entry.turn]);
    }
    for (const hero of Object.values(document.world.heroes)) expect(hero.transferredOnTurn, hero.id).toBe(turns.get(hero.id)?.at(-1) ?? null);
    expect([...turns.values()]).toContainEqual([0, 4]);

    const result = loaded(deserialise(asVersion2(document), { ...deps, content: withDispositions({}) }));

    expect(result).toEqual(document);
  });

  test('the step leaves its input alone, and a save it cannot read to the validator', () => {
    const saved = JSON.parse(asVersion2(withTransfers())) as SavedDocument;
    const before = structuredClone(saved);
    const step = migrations[2] as Migration;

    step(saved);
    expect(saved).toEqual(before);

    const damaged = { ...saved, world: { heroes: 'none' } };
    expect(step(damaged)).toBe(damaged);
    expect(refusal(deserialise(JSON.stringify(damaged), deps))).toMatchObject({ kind: 'invalid' });
    const noHistory = { ...saved, history: 'none' };
    const { heroes } = (step(noHistory) as unknown as { world: { heroes: Record<string, Hero> } }).world;
    expect(Object.values(heroes).every((hero) => hero.transferredOnTurn === null)).toBe(true);
  });
});

// ── Version 3 to 4: the Guildmaster's descriptive Attributes and Retirement (M9-S2, DL-102) ────

describe('a version-3 save', () => {
  /** `document` as a version-3 save wrote it: `meta.version` 3, and no Guildmaster with version 4's fields. */
  function asVersion3(document: WorldDocument): string {
    const parsed = JSON.parse(serialise(document)) as SavedDocument & { world: { guildmasters: Record<string, object> } };
    parsed.meta.version = 3;
    for (const guildmaster of Object.values(parsed.world.guildmasters)) withoutVersion4(guildmaster);
    return JSON.stringify(parsed);
  }

  test.each([
    ['a created world', () => createWorld('version-3', setup, testDeps()).document],
    ['the fixture', built],
  ])('%s loads with every Guildmaster in office and no descriptive Attribute, their Traits as they were (DL-100 item 4)', (_, make) => {
    const document = make();

    const result = loaded(deserialise(asVersion3(document), deps));

    expect(result).toEqual(document);
    expect(result.meta.version).toBe(4);
    for (const guildmaster of Object.values(result.world.guildmasters)) {
      expect(guildmaster).toMatchObject({ birthplace: '', appearance: '', biography: '', retiredOnTurn: null });
      expect(guildmaster.traits).toEqual(document.world.guildmasters[guildmaster.id]?.traits);
    }
  });

  test('the step leaves its input alone, and a save it cannot read to the validator', () => {
    const saved = JSON.parse(asVersion3(createWorld('version-3', setup, testDeps()).document)) as SavedDocument;
    const before = structuredClone(saved);
    const step = migrations[3] as Migration;

    step(saved);
    expect(saved).toEqual(before);

    const damaged = { ...saved, world: { guildmasters: 'none' } };
    expect(step(damaged)).toBe(damaged);
    expect(refusal(deserialise(JSON.stringify(damaged), deps))).toMatchObject({ kind: 'invalid' });
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
