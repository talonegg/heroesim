import { describe, expect, test } from 'vitest';
import * as historyModule from './history.js';
import {
  append,
  count,
  createHistory,
  emptyDocument,
  entriesBetween,
  entriesFor,
  makeId,
  type EntityId,
  type Entry,
  type EventType,
  type History,
  type Meta,
  type World,
} from './index.js';
import { deepFreeze } from './world.test-support.js';

// ── Fixtures ─────────────────────────────────────────────────────────────────────────────────

const hero = (n: number): EntityId => makeId('heroes', n);
const guild = (n: number): EntityId => makeId('guilds', n);

/** An entry of `type` at `turn` naming `participants`, each labelled. */
function entry(
  turn: number,
  type: EventType,
  participants: EntityId[],
  extra: { milestone?: boolean; payload?: unknown } = {},
): Entry {
  return {
    turn,
    type,
    participants,
    labels: Object.fromEntries(participants.map((id) => [id, `Name of ${id}`])),
    milestone: extra.milestone ?? false,
    payload: extra.payload ?? {},
  };
}

const types: EventType[] = ['hero.generated', 'quest.resolved', 'hero.injured', 'guild.founded'];

/**
 * `n` entries, four to a Turn, mixing types, Milestones, entries with no participant and
 * entries that list one entity twice.
 */
function mixedEntries(n: number): Entry[] {
  return Array.from({ length: n }, (_, i) => {
    const participants: EntityId[] = [];
    if (i % 11 !== 0) participants.push(hero(1 + ((i * 7) % 13)));
    if (i % 3 === 0) participants.push(guild(1 + (i % 4)));
    const first = participants[0];
    if (i % 17 === 0 && first !== undefined) participants.push(first);
    return entry(Math.floor(i / 4), types[i % types.length] ?? 'hero.generated', participants, {
      milestone: i % 9 === 0,
      payload: { n: i, heroIds: participants.filter((id) => id.startsWith('hero-')) },
    });
  });
}

function historyOf(entries: Entry[]): History {
  const history = createHistory();
  for (const e of entries) append(history, e);
  return history;
}

/** The indexes recomputed from scratch by scanning every entry: what `append` must maintain. */
function recountIndexes(entries: Entry[]): Omit<History, 'entries'> {
  const byEntity: Record<string, number[]> = {};
  const byType: Record<string, number[]> = {};
  const milestones: number[] = [];
  entries.forEach((e, position) => {
    for (const id of new Set(e.participants)) (byEntity[id] ??= []).push(position);
    (byType[e.type] ??= []).push(position);
    if (e.milestone) milestones.push(position);
  });
  return { byEntity, byType, milestones };
}

const turnsOf = (entries: Entry[]): number[] => entries.map((e) => e.turn);

// ── createHistory ────────────────────────────────────────────────────────────────────────────

describe('createHistory', () => {
  test('is empty, and the same History an empty document starts with', () => {
    const empty = { entries: [], byEntity: {}, byType: {}, milestones: [] };
    expect(createHistory()).toEqual(empty);
    // Only the History is compared, so meta and the stream states do not matter here.
    expect(emptyDocument({} as Meta, {} as World['rng']).history).toEqual(createHistory());
  });

  test('returns a new History each call', () => {
    expect(createHistory()).not.toBe(createHistory());
    expect(createHistory().entries).not.toBe(createHistory().entries);
  });
});

// ── append ───────────────────────────────────────────────────────────────────────────────────

describe('append', () => {
  test('after N appends entries.length is N and every index position points at an entry of its entity or type', () => {
    const entries = mixedEntries(500);
    const history = createHistory();
    entries.forEach((e, i) => expect(append(history, e)).toBe(i));

    expect(history.entries.length).toBe(500);
    history.entries.forEach((stored, i) => expect(stored).toBe(entries[i]));
    for (const [id, positions] of Object.entries(history.byEntity)) {
      for (const p of positions) expect(history.entries[p]?.participants).toContain(id);
    }
    for (const [type, positions] of Object.entries(history.byType)) {
      for (const p of positions) expect(history.entries[p]?.type).toBe(type);
    }
    for (const p of history.milestones) expect(history.entries[p]?.milestone).toBe(true);

    // Nothing missing, nothing doubled, every list ascending: the indexes equal a recount.
    const { byEntity, byType, milestones } = history;
    expect({ byEntity, byType, milestones }).toEqual(recountIndexes(entries));
    expect(history.milestones.length).toBeGreaterThan(0);
  });

  test('indexes an entity listed twice in one entry once', () => {
    const history = createHistory();
    append(history, entry(0, 'hero.injured', [hero(1)]));
    append(history, entry(1, 'quest.resolved', [hero(1), guild(1), hero(1), guild(1)]));
    expect(history.byEntity).toEqual({ [hero(1)]: [0, 1], [guild(1)]: [1] });
    expect(entriesFor(history, hero(1))).toHaveLength(2);
  });

  test('indexes an entry with no participant by type only', () => {
    const history = createHistory();
    append(history, entry(0, 'world.created', [], { milestone: true }));
    expect(history.byEntity).toEqual({});
    expect(history.byType).toEqual({ 'world.created': [0] });
    expect(history.milestones).toEqual([0]);
  });

  test('accepts an entry at the same Turn as the last', () => {
    const history = createHistory();
    append(history, entry(3, 'hero.injured', [hero(1)]));
    expect(append(history, entry(3, 'hero.healed', [hero(1)]))).toBe(1);
  });

  describe('throws on a programming error and leaves the History as it was', () => {
    function expectRefused(bad: Entry, error: typeof RangeError | typeof TypeError): void {
      const history = historyOf([entry(5, 'hero.injured', [hero(1)], { milestone: true })]);
      const before = structuredClone(history);
      expect(() => append(history, bad)).toThrow(error);
      expect(history).toEqual(before);
      expect(Object.getPrototypeOf(history.byEntity)).toBe(Object.prototype);
      expect(Object.getPrototypeOf(history.byType)).toBe(Object.prototype);
    }

    test('an entry with a lower Turn than the last', () => {
      expectRefused(entry(4, 'hero.injured', [hero(1)]), RangeError);
      expectRefused(entry(0, 'hero.healed', [hero(2)]), RangeError);
    });

    test.each([-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])('a Turn of %s', (turn) => {
      expectRefused(entry(turn, 'hero.injured', [hero(1)]), RangeError);
      expect(() => append(createHistory(), entry(turn, 'hero.injured', []))).toThrow(RangeError);
    });

    // A type always has a dot and an id is always `<table>-<six digits>`, so no key an index is
    // written under can be one of Object.prototype's, such as `__proto__`.
    test.each(['__proto__', 'constructor', 'hero', ''])('a type %j not of the form <entity>.<what-happened>', (type) => {
      expectRefused(entry(6, type as EventType, [hero(1)]), TypeError);
    });

    test.each(['__proto__', 'constructor', 'hero-1', 'villain-000001', ''])('a participant %j that is not an id', (id) => {
      expectRefused(entry(6, 'hero.injured', [hero(1), id as EntityId]), TypeError);
    });
  });
});

// ── Immutability: append is the only writer ──────────────────────────────────────────────────

describe('only append writes', () => {
  test('entries frozen after append read back unchanged, and JSON and structuredClone still round-trip', () => {
    const entries = mixedEntries(300);
    const expected = structuredClone(entries);
    const history = createHistory();
    for (const e of entries) {
      append(history, e);
      deepFreeze(e);
    }

    expect(history.entries).toEqual(expected);
    history.entries.forEach((stored, i) => {
      expect(stored).toBe(entries[i]);
      expect(Object.isFrozen(stored) && Object.isFrozen(stored.participants) && Object.isFrozen(stored.payload)).toBe(true);
    });
    expect(entriesBetween(history, Number.NEGATIVE_INFINITY, Number.POSITIVE_INFINITY)).toEqual(expected);
    for (const id of Object.keys(history.byEntity) as EntityId[]) {
      expect(entriesFor(history, id)).toEqual(expected.filter((e) => e.participants.includes(id)).reverse());
    }
    for (const type of types) expect(count(history, type)).toBe(expected.filter((e) => e.type === type).length);

    // Copies of a frozen History are ordinary data, and append works on them.
    const viaJson = JSON.parse(JSON.stringify(history)) as History;
    const cloned = structuredClone(history);
    for (const copy of [viaJson, cloned]) {
      expect(copy).toEqual(history);
      expect(append(copy, entry(1000, 'hero.healed', [hero(1)]))).toBe(300);
      expect(entriesFor(copy, hero(1))[0]?.turn).toBe(1000);
    }
    expect(history.entries).toHaveLength(300);
  });

  test('the module exports append and no other mutator', () => {
    expect(Object.keys(historyModule).sort()).toEqual([
      'append',
      'count',
      'createHistory',
      'entriesBetween',
      'entriesFor',
    ]);
  });

  test('every reader works on a deep-frozen History, on which append alone throws', () => {
    const history = historyOf(mixedEntries(200));
    const before = structuredClone(history);
    deepFreeze(history);

    for (const id of Object.keys(history.byEntity) as EntityId[]) {
      entriesFor(history, id);
      entriesFor(history, id, { from: 1, limit: 2 });
    }
    for (const type of types) count(history, type);
    entriesBetween(history, 3, 30);
    expect(history).toEqual(before);

    expect(() => append(history, entry(100, 'hero.healed', [hero(1)]))).toThrow(TypeError);
  });

  test('readers return new arrays, so changing one leaves the History alone', () => {
    const history = historyOf(mixedEntries(40));
    const forHero = entriesFor(history, hero(1));
    const between = entriesBetween(history, 0, 5);
    const lengths = [forHero.length, between.length];
    forHero.length = 0;
    between.push(entry(99, 'hero.healed', []));
    expect(between).not.toBe(history.entries);
    expect([entriesFor(history, hero(1)).length, entriesBetween(history, 0, 5).length]).toEqual(lengths);
    expect(history.entries).toHaveLength(40);
  });
});

// ── entriesFor ───────────────────────────────────────────────────────────────────────────────

describe('entriesFor', () => {
  // hero(1) and guild(1) are in every third entry (25 of them, Turns 0, 3 … 72); hero(2) in the rest.
  const history = historyOf(
    Array.from({ length: 75 }, (_, turn) =>
      entry(turn, 'hero.injured', turn % 3 === 0 ? [hero(1), guild(1)] : [hero(2)]),
    ),
  );
  const newestFirst = Array.from({ length: 25 }, (_, i) => 72 - 3 * i);

  test('returns every entry naming the entity, newest first', () => {
    expect(turnsOf(entriesFor(history, hero(1)))).toEqual(newestFirst);
    expect(turnsOf(entriesFor(history, guild(1)))).toEqual(newestFirst);
    expect(entriesFor(history, hero(2))).toHaveLength(50);
  });

  test('pages by offset from the newest', () => {
    expect(turnsOf(entriesFor(history, hero(1), { limit: 10 }))).toEqual(newestFirst.slice(0, 10));
    expect(turnsOf(entriesFor(history, hero(1), { from: 10, limit: 10 }))).toEqual(newestFirst.slice(10, 20));
    expect(turnsOf(entriesFor(history, hero(1), { from: 20, limit: 10 }))).toEqual(newestFirst.slice(20));
    expect(turnsOf(entriesFor(history, hero(1), { from: 5 }))).toEqual(newestFirst.slice(5));
    expect(turnsOf(entriesFor(history, hero(1), { from: 24 }))).toEqual([0]);
  });

  test('pages of any size tile the whole list', () => {
    for (const size of [1, 4, 7, 25, 26]) {
      const pages: Entry[] = [];
      for (let from = 0; from < 25; from += size) pages.push(...entriesFor(history, hero(1), { from, limit: size }));
      expect(turnsOf(pages)).toEqual(newestFirst);
    }
  });

  test('is empty past the end, for a limit of 0, and for an entity with no entries', () => {
    expect(entriesFor(history, hero(1), { from: 25 })).toEqual([]);
    expect(entriesFor(history, hero(1), { from: 30, limit: 5 })).toEqual([]);
    expect(entriesFor(history, hero(1), { limit: 0 })).toEqual([]);
    expect(entriesFor(history, hero(3))).toEqual([]);
    expect(entriesFor(createHistory(), hero(1))).toEqual([]);
  });

  test("reads no key of Object.prototype as an entity's index, even in a History read from JSON", () => {
    const loaded = JSON.parse(JSON.stringify(history)) as History;
    for (const key of ['__proto__', 'constructor', 'toString', 'hasOwnProperty']) {
      expect(entriesFor(history, key as EntityId)).toEqual([]);
      expect(entriesFor(loaded, key as EntityId)).toEqual([]);
    }
  });

  test.each([
    { from: -1 },
    { from: 1.5 },
    { from: Number.NaN },
    { limit: -1 },
    { limit: 2.5 },
    { limit: Number.NaN },
    { limit: Number.POSITIVE_INFINITY },
  ])('throws on a page of %o', (page) => {
    expect(() => entriesFor(history, hero(1), page)).toThrow(RangeError);
  });
});

// ── count ────────────────────────────────────────────────────────────────────────────────────

describe('count', () => {
  test('counts the entries of a type, and 0 for a type never appended', () => {
    const entries = mixedEntries(101);
    const history = historyOf(entries);
    for (const type of types) {
      expect(count(history, type)).toBe(entries.filter((e) => e.type === type).length);
      expect(count(history, type)).toBe(history.byType[type]?.length);
    }
    expect(types.reduce((sum, type) => sum + count(history, type), 0)).toBe(101);
    expect(count(history, 'hero.retired')).toBe(0);
    expect(count(createHistory(), 'hero.injured')).toBe(0);
  });

  test('reads no key of Object.prototype as a type, even in a History read from JSON', () => {
    const history = historyOf(mixedEntries(10));
    const loaded = JSON.parse(JSON.stringify(history)) as History;
    for (const key of ['__proto__', 'constructor', 'toString', 'hasOwnProperty']) {
      expect(count(history, key as EventType)).toBe(0);
      expect(count(loaded, key as EventType)).toBe(0);
    }
  });
});

// ── entriesBetween ───────────────────────────────────────────────────────────────────────────

describe('entriesBetween', () => {
  // Three entries on each even Turn from 0 to 18; the odd Turns hold none.
  const entries = Array.from({ length: 30 }, (_, i) => entry(2 * Math.floor(i / 3), 'hero.injured', [hero(1 + i)]));
  const history = historyOf(entries);
  const expectedBetween = (from: number, to: number): Entry[] => entries.filter((e) => e.turn >= from && e.turn < to);

  test('includes fromTurn and excludes toTurn, like Array.prototype.slice', () => {
    expect(entriesBetween(history, 0, 1)).toEqual(entries.slice(0, 3));
    expect(entriesBetween(history, 2, 4)).toEqual(entries.slice(3, 6));
    expect(entriesBetween(history, 2, 5)).toEqual(entries.slice(3, 9));
    expect(entriesBetween(history, 17, 19)).toEqual(entries.slice(27));
    expect(entriesBetween(history, 0, 19)).toEqual(entries);
    expect(entriesBetween(history, 1.5, 2.5)).toEqual(entries.slice(3, 6));
  });

  test('returns the stored entries themselves, oldest first', () => {
    const found = entriesBetween(history, 4, 8);
    found.forEach((e, i) => expect(e).toBe(entries[6 + i]));
  });

  test('is empty for an empty range, a range with no entries, a reversed range and an empty History', () => {
    expect(entriesBetween(history, 18, 18)).toEqual([]);
    expect(entriesBetween(history, 1, 2)).toEqual([]);
    expect(entriesBetween(history, 17, 18)).toEqual([]);
    expect(entriesBetween(history, -5, 0)).toEqual([]);
    expect(entriesBetween(history, 19, 100)).toEqual([]);
    expect(entriesBetween(history, 8, 4)).toEqual([]);
    expect(entriesBetween(createHistory(), 0, 10)).toEqual([]);
  });

  test('takes unbounded ends as infinities', () => {
    expect(entriesBetween(history, Number.NEGATIVE_INFINITY, Number.POSITIVE_INFINITY)).toEqual(entries);
    expect(entriesBetween(history, 16, Number.POSITIVE_INFINITY)).toEqual(entries.slice(24));
    expect(entriesBetween(history, Number.NEGATIVE_INFINITY, 2)).toEqual(entries.slice(0, 3));
  });

  test('agrees with a scan for every pair of bounds around the History', () => {
    for (let from = -2; from <= 21; from += 1) {
      for (let to = -2; to <= 21; to += 1) expect(entriesBetween(history, from, to)).toEqual(expectedBetween(from, to));
    }
  });

  test('throws on a NaN bound', () => {
    expect(() => entriesBetween(history, Number.NaN, 5)).toThrow(RangeError);
    expect(() => entriesBetween(history, 0, Number.NaN)).toThrow(RangeError);
  });

  describe('on 10,000 entries', () => {
    // Three entries on each even Turn, from Turn 0 to Turn 6,666.
    const big = historyOf(
      Array.from({ length: 10_000 }, (_, i) => entry(2 * Math.floor(i / 3), 'hero.injured', [hero(1 + (i % 50))])),
    );
    const scan = (from: number, to: number): Entry[] => big.entries.filter((e) => e.turn >= from && e.turn < to);

    test('returns the right slice', () => {
      for (const [from, to] of [
        [0, 1095],
        [1095, 2190],
        [1001, 3001],
        [6000, 7000],
        [6666, 6667],
        [-1, 20_000],
      ] as const) {
        expect(entriesBetween(big, from, to)).toEqual(scan(from, to));
      }
    });

    test('runs under 1 ms (median of 100 calls, for a year and for the whole History)', () => {
      for (const [from, to] of [
        [1095, 2190],
        [Number.NEGATIVE_INFINITY, Number.POSITIVE_INFINITY],
      ] as const) {
        for (let i = 0; i < 20; i += 1) entriesBetween(big, from, to);
        const times: number[] = [];
        for (let i = 0; i < 100; i += 1) {
          const start = performance.now();
          entriesBetween(big, from, to);
          times.push(performance.now() - start);
        }
        times.sort((a, b) => a - b);
        expect(times[50]).toBeLessThan(1);
      }
    });

    test('reads a logarithmic number of entries to find a range, not every entry', () => {
      let reads = 0;
      const entriesSpy = new Proxy(big.entries, {
        get(target, key, receiver) {
          if (typeof key === 'string' && /^\d+$/.test(key)) reads += 1;
          return Reflect.get(target, key, receiver) as unknown;
        },
      });
      const found = entriesBetween({ ...big, entries: entriesSpy }, 3000, 3001);
      expect(found).toHaveLength(3);
      // Two binary searches over 10,000 entries read at most 2 × 14, plus the 3 sliced.
      expect(reads).toBeLessThanOrEqual(2 * 14 + 3);
    });
  });
});
