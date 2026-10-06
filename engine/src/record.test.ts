import { describe, expect, test } from 'vitest';
import { makeId, type EntityId, type Entry, type EventType } from './document.js';
import { append, createHistory, entriesFor, names } from './history.js';
import { record, recorded } from './record.js';

// v1.1.7-S5 (DL-206 items 20 and 21, DL-211): what the History records of a play's events. The
// Unattached pool's comings and goings of a Hero no entry names are emitted and not recorded.

const hero = (n: number): EntityId => makeId('heroes', n);
const guild = (n: number): EntityId => makeId('guilds', n);

function entry(type: EventType, participants: EntityId[], payload: unknown, turn = 3): Entry {
  return { turn, type, participants, labels: {}, milestone: false, payload };
}

/** A Hero generated into the pool, or onto `guildId`'s Roster. */
const generated = (heroId: EntityId, guildId: EntityId | null = null): Entry =>
  entry('hero.generated', guildId === null ? [heroId] : [heroId, guildId], { heroId, guildId, classKey: 'warrior' });
const leftPool = (heroId: EntityId): Entry => entry('hero.left-pool', [heroId], { heroId });
const recruited = (heroId: EntityId, guildId: EntityId): Entry =>
  entry('hero.recruited', [heroId, guildId], { heroId, guildId, fee: 50 });

describe('recorded', () => {
  test("a Hero's arrival in the pool is not recorded; one dealt onto a Roster is", () => {
    const history = createHistory();
    expect(recorded(history, generated(hero(1)))).toBe(false);
    expect(recorded(history, generated(hero(2), guild(1)))).toBe(true);
  });

  test('a hero.left-pool is recorded when an entry names the Hero, and not when none does', () => {
    const history = createHistory();
    expect(recorded(history, leftPool(hero(1)))).toBe(false);
    append(history, entry('hero.left-guild', [hero(1), guild(1)], { heroId: hero(1), guildId: guild(1) }));
    expect(recorded(history, leftPool(hero(1)))).toBe(true);
    expect(recorded(history, leftPool(hero(2)))).toBe(false);
  });

  test('every other event is recorded, whoever it names', () => {
    const history = createHistory();
    expect(recorded(history, recruited(hero(1), guild(1)))).toBe(true);
    expect(recorded(history, entry('herald.cried', [hero(1)], { heroId: hero(1) }))).toBe(true);
    expect(recorded(history, entry('world.created', [], { seed: 's' }))).toBe(true);
  });
});

describe('record', () => {
  test('appends, in order, every event but the pool comings and goings of a Hero no entry names', () => {
    const history = createHistory();
    const events = [
      generated(hero(1)),
      generated(hero(2), guild(1)),
      generated(hero(3)),
      leftPool(hero(1)),
      recruited(hero(3), guild(1)),
    ];
    record(history, events);

    expect(history.entries).toEqual([events[1], events[4]]);
    expect(history.entries[0]).toBe(events[1]);
    expect(names(history, hero(1))).toBe(false);
    expect(Object.hasOwn(history.byEntity, hero(1))).toBe(false);
    // A hired Hero's History begins at their signing (item 21).
    expect(entriesFor(history, hero(3)).map((it) => it.type)).toEqual(['hero.recruited']);
  });

  test('reads the History as it grows: an event earlier in the same batch naming a pool Hero records their leaving', () => {
    const history = createHistory();
    const cried = entry('herald.cried', [hero(1)], { heroId: hero(1) });
    record(history, [generated(hero(1)), cried, leftPool(hero(1))]);

    expect(entriesFor(history, hero(1)).map((it) => it.type)).toEqual(['hero.left-pool', 'herald.cried']);
  });
});

describe('names', () => {
  test('is whether an entry names the entity, reading no key of Object.prototype', () => {
    const history = JSON.parse(JSON.stringify(createHistory())) as ReturnType<typeof createHistory>;
    append(history, generated(hero(4), guild(2)));
    expect(names(history, hero(4))).toBe(true);
    expect(names(history, guild(2))).toBe(true);
    expect(names(history, hero(5))).toBe(false);
    expect(names(history, 'constructor' as EntityId)).toBe(false);
  });
});
