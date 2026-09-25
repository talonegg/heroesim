import { describe, expect, test } from 'vitest';
import { advance } from '../advance.js';
import type { EngineDeps } from '../config.js';
import { createWorld } from '../create.js';
import type { GuildId, PatronId, QuestId, World, WorldDocument } from '../document.js';
import type { EngineEvent } from '../events.js';
import { count, entriesFor } from '../history.js';
import { createStreams } from '../rng.js';
import { dayOf, timeOfDay } from '../time.js';
import { plannedStreams, testContent, testDeps, withValid } from '../world.test-support.js';
import { boardRefresh } from './board-refresh.js';
import { phaseContext } from './phase.js';

const setup = { guildmasterName: 'Ada', guildName: 'The Test', createdAt: 'test' };

function created(seed: string, deps: EngineDeps = testDeps()): WorldDocument {
  return withValid(createWorld(seed, setup, deps).document, deps);
}

/** Plays Turns until `turn`, checking every document, and returns the last and every event. */
function playTo(document: WorldDocument, turn: number, deps: EngineDeps): { document: WorldDocument; events: EngineEvent[] } {
  const events: EngineEvent[] = [];
  let current = document;
  while (current.world.turn < turn) {
    const result = advance(current, deps);
    current = withValid(result.document, deps);
    events.push(...result.events);
  }
  return { document: current, events };
}

/**
 * No Rivals: from M2-S9 they take Quests each afternoon, and the tests that play Turns watch the
 * Board's own refresh.
 */
const noRivals = { rivalCount: 0 };

/** Takes `n` Quests off the Board and out of the world, as a Guild taking them would. */
function takeFromBoard(world: World, n: number): void {
  for (const questId of world.board.splice(0, n)) delete world.quests[questId];
}

describe('boardRefresh', () => {
  test('refills the Board to boardSize every morning, and it never holds more', () => {
    const deps = testDeps(noRivals);
    let document = created('refill', deps);
    expect(document.world.board).toHaveLength(deps.config.boardSize);

    for (let turn = 1; turn <= 90; turn += 1) {
      // Two Quests go each afternoon, as Rivals would take them.
      if (timeOfDay(document.world.turn) === 'afternoon') {
        document = { ...document, world: structuredClone(document.world) };
        takeFromBoard(document.world, 2);
      }
      const before = document.world.board.length;
      document = playTo(document, turn, deps).document;
      const { board } = document.world;

      if (timeOfDay(turn) === 'morning') expect(board, `Turn ${turn}`).toHaveLength(deps.config.boardSize);
      else expect(board.length, `Turn ${turn}`).toBe(before);
      expect(board.length).toBeLessThanOrEqual(deps.config.boardSize);
      for (const questId of board) expect(document.world.quests[questId]?.status).toBe('offered');
    }
  });

  test('draws nothing onto a Board already holding boardSize or more, and removes nothing unexpired', () => {
    const deps = testDeps(noRivals);
    const document = created('full', deps);
    const smaller = testDeps({ ...noRivals, boardSize: 3 });

    const { document: morning, events } = playTo(document, 3, smaller);

    expect(events.filter((event) => event.type === 'quest.offered')).toEqual([]);
    expect(morning.world.board).toEqual(document.world.board);
  });

  test('expires an offered Quest questOfferDays after it was offered, with quest.expired, and removes its row', () => {
    const deps = testDeps(noRivals);
    const document = created('expiry', deps);
    const offered = [...document.world.board];
    const patrons = offered.map((id) => document.world.quests[id]?.patronId);
    const lastNight = 3 * deps.config.questOfferDays - 1;

    const { document: night } = playTo(document, lastNight, deps);
    expect(night.world.board).toEqual(offered);
    expect(count(night.history, 'quest.expired')).toBe(0);

    const { document: morning, events } = playTo(night, lastNight + 1, deps);

    expect(dayOf(morning.world.turn) - dayOf(0)).toBe(deps.config.questOfferDays);
    const expired = events.filter((event) => event.type === 'quest.expired');
    expect(expired.map((event) => event.participants)).toEqual(offered.map((id, i) => [id, patrons[i]]));
    for (const event of expired) {
      const [questId, patronId] = event.participants as [QuestId, PatronId];
      expect(event).toMatchObject({ turn: morning.world.turn, milestone: false });
      expect(event.payload).toEqual({ questId, patronId, templateKey: document.world.quests[questId]?.templateKey });
      expect(event.labels[patronId]).toBe(document.world.patrons[patronId]?.name);
    }
    for (const questId of offered) {
      expect(Object.hasOwn(morning.world.quests, questId)).toBe(false);
      expect(entriesFor(morning.history, questId).map((entry) => entry.type)).toEqual(['quest.expired', 'quest.offered']);
    }
    // Expired first, then the Board refilled from empty.
    expect(events.map((event) => event.type)).toEqual([
      ...offered.map(() => 'quest.expired'),
      ...offered.map(() => 'quest.offered'),
    ]);
    expect(morning.world.board.some((id) => offered.includes(id))).toBe(false);
    expect(morning.world.board).toHaveLength(deps.config.boardSize);
  });

  test('reads questOfferDays from the config it is given', () => {
    const deps = testDeps({ ...noRivals, questOfferDays: 5 });
    const document = created('five-days', deps);

    expect(count(playTo(document, 14, deps).document.history, 'quest.expired')).toBe(0);
    expect(count(playTo(document, 15, deps).document.history, 'quest.expired')).toBe(deps.config.boardSize);
  });

  test("advances the board stream and, for the new Quests' Encounter sequences, the encounters stream, and no other", () => {
    const deps = testDeps(noRivals);
    const document = created('streams', deps);
    const others = plannedStreams.filter((name) => !Object.hasOwn(document.world.rng, name));
    Object.assign(document.world.rng, createStreams(document.meta.seed, others));
    const night = playTo(withValid(document, deps), 8, deps).document;
    const before = structuredClone(night.world.rng) as Record<string, unknown>;

    const morning = playTo(night, 9, deps).document;

    const after = morning.world.rng as Record<string, unknown>;
    expect(count(morning.history, 'quest.expired')).toBe(deps.config.boardSize);
    for (const name of plannedStreams) {
      if (name === 'board' || name === 'encounters') expect(after[name], name).not.toEqual(before[name]);
      else expect(after[name], name).toEqual(before[name]);
    }
  });

  test("weights the Patrons uniformly, whatever their Regard (R22's simplification until M4)", () => {
    const deps = testDeps();
    const document = created('uniform', deps);
    const { world } = document;
    const patrons = Object.keys(world.patrons) as PatronId[];
    const [favoured] = Object.values(world.patrons);
    const [guildId] = Object.keys(world.guilds) as GuildId[];
    if (favoured === undefined || guildId === undefined) throw new Error('No Patrons or no Guild');
    // Regard for a Guild does not weight the draw yet.
    favoured.regard[guildId] = { value: 100, since: 0, reason: 'test' };
    const tally = new Map<string, number>();
    const rounds = 2000;

    for (let round = 0; round < rounds; round += 1) {
      takeFromBoard(world, world.board.length);
      for (const event of boardRefresh(world, phaseContext(world, deps))) {
        const patronId = event.participants[1] ?? '';
        tally.set(patronId, (tally.get(patronId) ?? 0) + 1);
      }
    }

    const expected = (rounds * deps.config.boardSize) / patrons.length;
    expect([...tally.keys()].sort()).toEqual([...patrons].sort());
    for (const [patronId, drawn] of tally) {
      expect(Math.abs(drawn - expected) / expected, patronId).toBeLessThan(0.1);
    }
  });

  test('never draws a Patron whose Sphere no template serves, and leaves the Board empty when none is served', () => {
    const deps = testDeps();
    const document = created('unserved', deps);
    const { world } = document;
    const crownOnly: EngineDeps = {
      config: deps.config,
      content: {
        ...testContent,
        questTemplates: Object.fromEntries(
          Object.entries(testContent.questTemplates).filter(([, template]) => template.sphereKeys.includes('crown')),
        ),
      },
    };

    for (let round = 0; round < 20; round += 1) {
      takeFromBoard(world, world.board.length);
      for (const event of boardRefresh(world, phaseContext(world, crownOnly))) {
        const patronId = event.participants[1] as PatronId;
        expect(world.patrons[patronId]?.sphereKey).toBe('crown');
      }
    }

    const none: EngineDeps = { config: deps.config, content: { ...testContent, questTemplates: {} } };
    takeFromBoard(world, world.board.length);
    expect(boardRefresh(world, phaseContext(world, none))).toEqual([]);
    expect(world.board).toEqual([]);
  });

  test('fills the Board of a save made before the board stream existed, which plays on (DL-25)', () => {
    const deps = testDeps();
    // An M1 save: created with an empty Board, and no board stream.
    const m1 = createWorld('m1-save', setup, testDeps({ boardSize: 0 })).document;
    Reflect.deleteProperty(m1.world.rng, 'board');
    const generation = structuredClone(m1.world.rng.generation);
    withValid(m1, deps);

    const { document: morning, events } = playTo(m1, 3, deps);

    expect(morning.world.board).toHaveLength(deps.config.boardSize);
    expect(events.filter((event) => event.type === 'quest.offered')).toHaveLength(deps.config.boardSize);
    expect(morning.world.rng.generation).toEqual(generation);
    expect(Object.hasOwn(m1.world.rng, 'board')).toBe(false);
    // Its Board is what a world created at M2-S3 with an empty first Board draws on Day 1.
    const later = createWorld('m1-save', setup, testDeps({ boardSize: 0 })).document;
    expect(playTo(later, 3, deps).document.world).toEqual(morning.world);
  });
});
