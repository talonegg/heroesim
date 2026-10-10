import { beforeAll, describe, expect, test } from 'vitest';
import { advance } from './advance.js';
import { createWorld } from './create.js';
import { makeId, type EntityId, type Entry, type History, type WorldDocument } from './document.js';
import type { EngineEventOf } from './events.js';
import { append, createHistory, entriesFor } from './history.js';
import { nightsReturnOf, returnOf } from './returns.js';
import { certainHarmContent, deepFreeze, testDeps } from './world.test-support.js';

// A return's entries (DL-242): those naming its Quest, and the two parts that name none, a Level of
// its Heroes and its dead's gear, on its night.

const quest = makeId('quests', 1);
const party = makeId('parties', 1);
const guild = makeId('guilds', 1);
const [ada, bo, cy] = [makeId('heroes', 1), makeId('heroes', 2), makeId('heroes', 3)];
const night = 5;

function entry(turn: number, type: string, participants: EntityId[], payload: object): Entry {
  return { turn, type: type as Entry['type'], participants, labels: {}, milestone: false, payload };
}

function resolved(turn: number, ids: { questId?: EntityId; partyId?: EntityId; heroIds: EntityId[]; deaths?: EntityId[] }): Entry {
  const { questId = quest, partyId = party, heroIds, deaths = [] } = ids;
  return entry(turn, 'quest.resolved', [questId, partyId, ...heroIds, guild], { questId, partyId, guildId: guild, heroIds, deaths });
}

function levelled(turn: number, heroId: EntityId, level: number): Entry {
  return entry(turn, 'hero.levelled', [heroId, guild], { heroId, guildId: guild, level });
}

function gearBack(turn: number, heroId: EntityId, cause: string): Entry {
  return entry(turn, 'item.returned', [heroId, guild], { heroId, guildId: guild, cause });
}

/** A History holding `entries` in order. */
function historyOf(...entries: Entry[]): History {
  const history = createHistory();
  for (const each of entries) append(history, each);
  return history;
}

describe('returnOf', () => {
  test("reads the outcome, the entries naming the Quest in order, and on its night its Heroes' Levels and its dead's gear", () => {
    const history = historyOf(
      entry(1, 'quest.offered', [quest], { questId: quest }),
      entry(2, 'quest.taken', [quest, party, ada, bo, guild], { questId: quest, partyId: party }),
      entry(night, 'quest.encounter', [quest, party, guild, bo], { questId: quest, partyId: party }),
      resolved(night, { heroIds: [ada, bo], deaths: [bo] }),
      entry(night, 'hero.died', [bo, quest], { heroId: bo, questId: quest }),
      entry(night, 'hero.xp-gained', [ada, quest], { heroId: ada, questId: quest }),
      levelled(night, cy, 4),
      levelled(night, ada, 2),
      levelled(night, ada, 3),
      gearBack(night, bo, 'died'),
      gearBack(night, ada, 'transferred'),
      levelled(night + 3, ada, 4),
    );

    // A reader: it reads a frozen History, and what it gives is its own to change.
    const read = returnOf(deepFreeze(history), { partyId: party, questId: quest });
    returnOf(history, { partyId: party, questId: quest })?.ofQuest.splice(0);

    expect(read?.position).toBe(3);
    expect(read?.outcome).toBe(history.entries[3]);
    expect(read?.ofQuest).toEqual(entriesFor(history, quest).reverse());
    expect(read?.ofQuest.map((each) => each.type)).toEqual(['quest.offered', 'quest.taken', 'quest.encounter', 'quest.resolved', 'hero.died', 'hero.xp-gained']);
    // Cy levelled at home that night, and Ada again three nights on: neither is the return's.
    expect(read?.levels.map((each) => each.payload.level)).toEqual([2, 3]);
    expect(read?.levels[0]).toBe(history.entries[7]);
    // Only a dead Hero's gear: Ada's going back for another cause is not.
    expect(read?.gear).toEqual([history.entries[9]]);
  });

  test("finds the Party's own outcome, the newest; and none for a Party or a Quest the History has no return of", () => {
    const other = makeId('parties', 2);
    const history = historyOf(resolved(night, { heroIds: [ada] }), resolved(night, { partyId: other, heroIds: [bo] }), levelled(night, bo, 2), levelled(night, ada, 2));

    expect(returnOf(history, { partyId: other, questId: quest })?.levels).toEqual([history.entries[2]]);
    expect(returnOf(history, { partyId: party, questId: quest })?.levels).toEqual([history.entries[3]]);
    expect(returnOf(history, { partyId: makeId('parties', 9), questId: quest })).toBeNull();
    expect(returnOf(history, { partyId: party, questId: makeId('quests', 9) })).toBeNull();
  });

  test("of two outcomes of the Party on the Quest, reads the newest; and nothing of its night before the outcome, nor its dead's gear back for another cause", () => {
    const history = historyOf(
      resolved(night, { heroIds: [ada] }),
      levelled(night + 3, ada, 2),
      resolved(night + 3, { heroIds: [ada, bo], deaths: [bo] }),
      gearBack(night + 3, bo, 'retired'),
      levelled(night + 3, ada, 3),
      gearBack(night + 3, bo, 'died'),
    );
    const read = returnOf(history, { partyId: party, questId: quest });

    expect(read?.position).toBe(2);
    expect(read?.levels).toEqual([history.entries[4]]);
    expect(read?.gear).toEqual([history.entries[5]]);
  });
});

describe('nightsReturnOf', () => {
  const history = historyOf(
    resolved(night, { heroIds: [ada, bo], deaths: [bo] }),
    levelled(night, ada, 2),
    levelled(night, cy, 4),
    gearBack(night, bo, 'died'),
    gearBack(night, cy, 'retired'),
    levelled(night + 3, ada, 3),
  );
  const [outcome, adas, cys, bos, retired, later] = history.entries as Entry[];

  test("names the return whose night brought a Level of one of its Heroes, or its dead's gear", () => {
    expect(nightsReturnOf(history, adas as Entry)).toEqual({ partyId: party, questId: quest });
    expect(nightsReturnOf(history, bos as Entry)).toEqual({ partyId: party, questId: quest });
  });

  test("names none for a Level at home, one on another night, gear back for another cause, or an entry naming the Quest", () => {
    for (const each of [cys, retired, later, outcome]) expect(nightsReturnOf(history, each as Entry), each?.type).toBeNull();
  });

  test('names none for a Level gained at home before the Hero goes on a Quest that comes home on a later night', () => {
    const atHome = levelled(night - 2, cy, 2);
    const home = historyOf(atHome, resolved(night, { heroIds: [cy] }));
    expect(nightsReturnOf(home, atHome)).toBeNull();
  });
});

describe('the Turns the engine played, every Death certain on a failed Check', () => {
  const deps = testDeps({}, certainHarmContent);
  let document: WorldDocument;
  let entries: Entry[];
  let outcomes: EngineEventOf<'quest.resolved'>[];

  // Played once, read by the one test below. A Level and a dead Hero's gear on a night a Party came home
  // were both met by Turn 88; 180 Turns is twice that.
  beforeAll(() => {
    document = createWorld('returns', { guildmasterName: 'Ada', guildName: 'The Test', createdAt: 'test' }, deps).document;
    for (let turn = 0; turn < 180; turn += 1) document = advance(document, deps).document;
    entries = document.history.entries;
    outcomes = entries.filter((each): each is EngineEventOf<'quest.resolved'> => each.type === 'quest.resolved');
  });

  test("each Level and dead Hero's gear on a night a Party came home is that return's, and no other is", () => {
    const parts = new Map<Entry, string>();
    for (const { payload } of outcomes) {
      const read = returnOf(document.history, payload);
      for (const part of [...(read?.levels ?? []), ...(read?.gear ?? [])]) {
        expect(parts.has(part)).toBe(false);
        parts.set(part, payload.partyId);
      }
    }
    for (const each of entries) {
      const key = nightsReturnOf(document.history, each);
      expect(key?.partyId, each.type).toBe(parts.get(each));
      // A Level that night is a returning Hero's, gained from the Quest's XP (pipeline.ts).
      if (each.type === 'hero.levelled' && key === null) {
        const heroId = (each as EngineEventOf<'hero.levelled'>).payload.heroId;
        expect(outcomes.some((outcome) => outcome.turn === each.turn && outcome.payload.heroIds.includes(heroId))).toBe(false);
      }
    }
    // The year met both parts.
    expect([...parts.keys()].some((each) => each.type === 'hero.levelled')).toBe(true);
    expect([...parts.keys()].some((each) => each.type === 'item.returned')).toBe(true);
  });
});
