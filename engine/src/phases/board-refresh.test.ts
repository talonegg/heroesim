import { describe, expect, test } from 'vitest';
import { advance } from '../advance.js';
import type { EngineDeps } from '../config.js';
import { createWorld } from '../create.js';
import { compareByCodeUnit, type GuildId, type PatronId, type QuestId, type World, type WorldDocument } from '../document.js';
import { count, entriesFor } from '../history.js';
import { generateQuest } from '../generators/quests.js';
import { patronBoardWeight } from '../regard.js';
import { createStreams, pick } from '../rng.js';
import { dayOf, timeOfDay } from '../time.js';
import { plannedStreams, playWith, setup, streamsOutOfPlace, testContent, testDeps, withValid } from '../world.test-support.js';
import { boardRefresh } from './board-refresh.js';
import { phaseContext } from './phase.js';

/** Advances to a Turn, validating every document. */
const playTo = playWith(advance);

function created(seed: string, deps: EngineDeps = testDeps()): WorldDocument {
  return withValid(createWorld(seed, setup, deps).document, deps);
}

/**
 * No Rivals: they take Quests each afternoon, and the tests that play Turns watch the
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

    for (let turn = 1; turn <= 30; turn += 1) {
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
    // The morning's Market refresh draws from `market`: a Market of size 0 draws nothing.
    const deps = testDeps({ ...noRivals, marketSize: 0 });
    const document = created('streams', deps);
    const others = plannedStreams.filter((name) => !Object.hasOwn(document.world.rng, name));
    Object.assign(document.world.rng, createStreams(document.meta.seed, others));
    const night = playTo(withValid(document, deps), 8, deps).document;
    const before = structuredClone(night.world.rng) as Record<string, unknown>;

    const morning = playTo(night, 9, deps).document;

    expect(count(morning.history, 'quest.expired')).toBe(deps.config.boardSize);
    expect(streamsOutOfPlace(before, morning.world.rng, ['board', 'encounters'])).toEqual([]);
  });

  /** How many Quests each Patron offers over `rounds` refreshes of an emptied Board, run alone. */
  function tallyOffers(world: World, deps: EngineDeps, rounds: number): Map<string, number> {
    const tally = new Map<string, number>();
    for (let round = 0; round < rounds; round += 1) {
      takeFromBoard(world, world.board.length);
      for (const event of boardRefresh(world, phaseContext(world, deps))) {
        const patronId = event.participants[1] ?? '';
        tally.set(patronId, (tally.get(patronId) ?? 0) + 1);
      }
    }
    return tally;
  }

  test("weights each Patron by their mean Regard across the Guilds in play (R22): twice as often at the scale's top, never at its bottom", () => {
    const deps = testDeps({ regardMin: -20, regardMax: 20, boardRegardWeight: 1 });
    const { world } = created('weighted', deps);
    const [favoured, shunned, ...rest] = Object.values(world.patrons);
    if (favoured === undefined || shunned === undefined) throw new Error('Too few Patrons');
    const guildIds = Object.keys(world.guilds) as GuildId[];
    expect(guildIds.length).toBeGreaterThan(1);
    for (const guildId of guildIds) {
      favoured.regard[guildId] = { value: 20, since: 0, reason: 'test' };
      shunned.regard[guildId] = { value: -20, since: 0, reason: 'test' };
    }
    // Weights 2, 0 and 1 for each of the rest: a draw in twelve Patrons' worth.
    const rounds = 2000;
    const total = 2 + rest.length;

    const tally = tallyOffers(world, deps, rounds);

    const drawn = rounds * deps.config.boardSize;
    expect(tally.get(shunned.id) ?? 0).toBe(0);
    expect(Math.abs((tally.get(favoured.id) ?? 0) / drawn - 2 / total)).toBeLessThan(0.015);
    for (const patron of rest) expect(Math.abs((tally.get(patron.id) ?? 0) / drawn - 1 / total), patron.id).toBeLessThan(0.01);
    // The mean is across the Guilds in play: one Guild's Regard alone moves it by its share.
    for (const guildId of guildIds.slice(1)) delete favoured.regard[guildId];
    expect(patronBoardWeight(favoured, world, deps.config)).toBeCloseTo(1 + 1 / guildIds.length, 10);
  });

  /**
   * The Boards `boardRefresh` offers `world` emptied, `rounds` times, and the Boards `pick` over the
   * Patrons gives, with the streams each leaves. Many Boards, not one: a Patron weighed a little off
   * uniform moves only the rare draw near a bucket's edge, which a single Board seldom meets (DL-246).
   */
  function offeredAndUniform(world: World, deps: EngineDeps, rounds = 200) {
    const again = structuredClone(world);
    const patrons = Object.values(again.patrons).sort((a, b) => compareByCodeUnit(a.id, b.id));
    const offered: (string | undefined)[] = [];
    const uniform: string[] = [];
    for (let round = 0; round < rounds; round += 1) {
      takeFromBoard(world, world.board.length);
      takeFromBoard(again, again.board.length);
      offered.push(...boardRefresh(world, phaseContext(world, deps)).map((event) => event.participants[1]));
      // The same draws by `pick`, as DL-25's refresh made them: one draw for the Patron, then the Quest's.
      const state = again.rng.board;
      while (again.board.length < deps.config.boardSize) {
        const patron = pick(state, patrons);
        uniform.push(generateQuest(again, patron, deps).events[0]?.participants[1] ?? '');
      }
    }
    return { offered, uniform, stream: world.rng.board, uniformStream: again.rng.board };
  }

  test('draws uniformly whatever the Regard when boardRegardWeight is 0: the very Boards a uniform draw gives, refresh after refresh', () => {
    const deps = testDeps({ boardRegardWeight: 0 });
    const { world } = created('unweighted', deps);
    const [favoured] = Object.values(world.patrons);
    if (favoured === undefined) throw new Error('No Patrons');
    for (const guildId of Object.keys(world.guilds) as GuildId[]) favoured.regard[guildId] = { value: 20, since: 0, reason: 'test' };

    const { offered, uniform, stream, uniformStream } = offeredAndUniform(world, deps);

    expect(offered).toEqual(uniform);
    expect(stream).toEqual(uniformStream);
  });

  test('draws, with every Patron at neutral, the very Boards a uniform draw gives, refresh after refresh: a new world opens on the Board it opened on before Patron Regard weighed the draw (DL-43)', () => {
    const deps = testDeps();
    const { world } = created('same-board', deps);

    const { offered, uniform, stream, uniformStream } = offeredAndUniform(world, deps);

    expect(offered).toEqual(uniform);
    expect(stream).toEqual(uniformStream);
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
});
