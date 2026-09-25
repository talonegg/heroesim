import { describe, expect, test } from 'vitest';
import { advance } from '../advance.js';
import type { EngineDeps } from '../config.js';
import { createWorld } from '../create.js';
import { encounterCount } from '../quest-engine/encounters.js';
import type { Patron, Quest, World } from '../document.js';
import { append } from '../history.js';
import type { StreamName } from '../rng.js';
import { dayOf, nightOf, turnsPerDay } from '../time.js';
import { plannedStreams, testContent, testDeps, testWorld, withValid } from '../world.test-support.js';
import { generatePatron } from './patrons.js';
import { generateQuest, templatesFor } from './quests.js';

function withPatron(seed: string, deps: EngineDeps, sphereKey = 'crown', streams?: readonly string[]) {
  const world = testWorld(seed, deps, streams);
  const { patron } = generatePatron(world, deps, { sphereKey });
  return { world, patron };
}

function quests(world: World, patron: Patron, deps: EngineDeps, count: number): Quest[] {
  return Array.from({ length: count }, () => generateQuest(world, patron, deps).quest);
}

describe('generateQuest', () => {
  test("draws each of the Patron's Sphere's templates, and only those (D3)", () => {
    const deps = testDeps();
    const { world, patron } = withPatron('sphere', deps, 'crown');

    const drawn = new Set(quests(world, patron, deps, 60).map((quest) => quest.templateKey));

    expect([...drawn].sort()).toEqual(['clear-the-barrow', 'hold-the-border-fort']);
    expect(templatesFor(testContent, 'crown').map((template) => template.key)).toEqual([...drawn].sort());
  });

  test('copies what the template carries, and draws difficulty and Days inside its ranges', () => {
    const deps = testDeps();
    const { world, patron } = withPatron('copy', deps, 'underworld');

    for (const quest of quests(world, patron, deps, 100)) {
      const template = testContent.questTemplates[quest.templateKey];
      if (template === undefined) throw new Error(`No template ${quest.templateKey}`);
      const days = quest.durationTurns / turnsPerDay;

      expect(quest.difficulty).toBeGreaterThanOrEqual(template.difficultyMin);
      expect(quest.difficulty).toBeLessThanOrEqual(template.difficultyMax);
      expect(Number.isInteger(days) && days >= template.durationDaysMin && days <= template.durationDaysMax).toBe(true);
      expect(quest.reward).toBe(Math.round(quest.difficulty * template.rewardPerDifficulty));
      expect(quest).toMatchObject({
        patronId: patron.id,
        tags: template.tags,
        fameEffect: template.fameEffect,
        demands: template.demands,
        skillKeys: template.skillKeys,
        requirements: { partySizeMin: template.partySizeMin, partySizeMax: template.partySizeMax, ...template.requires },
        lootTableKey: null,
        status: 'offered',
        offeredOnTurn: 0,
        partyIds: [],
      });
      expect(Object.keys(quest.requirements).sort()).toEqual(
        ['partySizeMin', 'partySizeMax', ...Object.keys(template.requires)].sort(),
      );
      // Copies, sharing nothing with content, so a row never changes with its template.
      expect(quest.demands).not.toBe(template.demands);
      expect(quest.demands[0]).not.toBe(template.demands[0]);
      expect(quest.tags).not.toBe(template.tags);
      expect(quest.skillKeys).not.toBe(template.skillKeys);
    }
  });

  test('puts the Quest in world.quests and at the end of the Board, numbering it from the counter', () => {
    const deps = testDeps();
    const { world, patron } = withPatron('board', deps);

    const [first, second] = quests(world, patron, deps, 2);

    expect(first?.id).toBe('quest-000001');
    expect(second?.id).toBe('quest-000002');
    expect(world.board).toEqual(['quest-000001', 'quest-000002']);
    expect(world.quests['quest-000002' as Quest['id']]).toBe(second);
    expect(world.counters.quests).toBe(3);
  });

  test('holds the difficulty inside the config scale, even for a template wholly outside it', () => {
    const narrowed = testDeps({ questDifficultyMin: 50, questDifficultyMax: 60 });
    const { world, patron } = withPatron('scale', narrowed);
    for (const quest of quests(world, patron, narrowed, 50)) {
      expect(quest.difficulty).toBeGreaterThanOrEqual(50);
      expect(quest.difficulty).toBeLessThanOrEqual(60);
    }

    const above = testDeps({ questDifficultyMin: 95, questDifficultyMax: 100 });
    const escort = withPatron('above', above, 'church');
    const tithe = generateQuest(escort.world, escort.patron, above, { templateKey: 'escort-the-tithe' }).quest;
    expect(tithe.difficulty).toBe(95);
  });

  test('stays on offer through the night of its questOfferDays-th Day, whichever Turn it is drawn on', () => {
    const deps = testDeps();
    const { world, patron } = withPatron('expiry', deps);

    for (const turn of [0, 1, 2, 39, 40, 41]) {
      world.turn = turn;
      const quest = generateQuest(world, patron, deps).quest;
      expect(quest.offeredOnTurn).toBe(turn);
      expect(quest.expiresOnTurn).toBe(nightOf(dayOf(turn) + deps.config.questOfferDays - 1));
    }
    const oneDay = testDeps({ questOfferDays: 1 });
    world.turn = 3;
    expect(generateQuest(world, patron, oneDay).quest.expiresOnTurn).toBe(5);
  });

  test('returns quest.offered naming the Quest and the Patron, labelled with the Patron', () => {
    const deps = testDeps();
    const { world, patron } = withPatron('event', deps);

    const { quest, events } = generateQuest(world, patron, deps);

    expect(events).toEqual([
      {
        turn: 0,
        type: 'quest.offered',
        participants: [quest.id, patron.id],
        labels: { [patron.id]: patron.name },
        milestone: false,
        payload: { questId: quest.id, patronId: patron.id, templateKey: quest.templateKey },
      },
    ]);
  });

  test('draws from the board stream, or the stream its caller names, and its Encounter sequence from the encounters stream, and from no other', () => {
    const deps = testDeps();
    const { world, patron } = withPatron('streams', deps, 'crown', plannedStreams);
    const before = structuredClone(world.rng) as Record<string, unknown>;
    const rng = (): Record<string, unknown> => world.rng;

    generateQuest(world, patron, deps);
    for (const name of plannedStreams) {
      if (name === 'board' || name === 'encounters') expect(rng()[name], name).not.toEqual(before[name]);
      else expect(rng()[name], name).toEqual(before[name]);
    }

    const afterBoard = structuredClone(world.rng) as Record<string, unknown>;
    generateQuest(world, patron, deps, { stream: 'generation' });
    expect(rng()['board']).toEqual(afterBoard['board']);
    expect(rng()['generation']).not.toEqual(afterBoard['generation']);
    expect(rng()['encounters']).not.toEqual(afterBoard['encounters']);
  });

  // M4-S1's second box: the sequence is drawn at generation, within the template's kinds and count.
  test("draws every Quest's Encounter sequence within its template's kinds and its count at the Quest's difficulty", () => {
    const deps = testDeps();
    for (const sphere of Object.keys(testContent.spheres)) {
      const { world, patron } = withPatron(`sequence-${sphere}`, deps, sphere);
      const seen = new Map<string, Set<number>>();
      for (const quest of quests(world, patron, deps, 150)) {
        const template = testContent.questTemplates[quest.templateKey];
        if (template === undefined) throw new Error(`No template ${quest.templateKey}`);
        const kinds = quest.encounterKeys.map((key) => testContent.encounters[key]?.kind);

        expect(quest.encounterKeys).toHaveLength(encounterCount(template, quest.difficulty, deps.config));
        expect(quest.encounterKeys.length).toBeGreaterThanOrEqual(template.encountersMin);
        expect(quest.encounterKeys.length).toBeLessThanOrEqual(template.encountersMax);
        for (const kind of kinds) expect(template.encounterKinds).toContain(kind);
        seen.set(template.key, new Set([...(seen.get(template.key) ?? []), quest.encounterKeys.length]));
      }
      // Every count in a template's range is met across 150 Quests, the bottom and top included.
      for (const [key, counts] of seen) {
        const template = testContent.questTemplates[key];
        expect([...counts].sort((a, b) => a - b), key).toEqual(
          Array.from({ length: (template?.encountersMax ?? 0) - (template?.encountersMin ?? 0) + 1 }, (_, i) => (template?.encountersMin ?? 0) + i),
        );
      }
    }
  });

  test('gives each Quest a sequence of its own, sharing no array with content or another Quest', () => {
    const deps = testDeps();
    const { world, patron } = withPatron('own-sequence', deps);
    const [first, second] = quests(world, patron, deps, 2);
    expect(first?.encounterKeys.length).toBeGreaterThan(0);
    expect(first?.encounterKeys).not.toBe(second?.encounterKeys);
  });

  // The encounters stream is new in M4 (ADR-0009 as amended, D7), so the Board a seed produces is
  // the one it produced before M4: pinned from the engine at M3's end (v1.0-dev 8229670) for the
  // test content, no Rivals and no Party sent, over 30 Days of refreshes and expiries.
  test('draws the Board a seed produced before M4, Quest for Quest, and leaves the board stream where M3 left it', () => {
    const deps = testDeps({ rivalCount: 0 });
    let { document } = createWorld('board-a', { guildmasterName: 'Ada', guildName: 'The Test', createdAt: 'test' }, deps);
    const board = (): (string | number)[][] =>
      document.world.board.map((id) => {
        const quest = document.world.quests[id] as Quest;
        return [quest.id, quest.templateKey, quest.patronId, quest.difficulty, quest.durationTurns, quest.reward];
      });

    expect(board().map((row) => row.slice(1))).toEqual([
      ['break-the-sealed-vault', 'patron-000002', 85, 15, 340],
      ['a-quiet-word', 'patron-000012', 34, 12, 136],
      ['recover-the-strongbox', 'patron-000007', 47, 9, 188],
      ['escort-the-tithe', 'patron-000004', 28, 6, 112],
      ['guard-the-caravan', 'patron-000007', 32, 9, 128],
      ['survey-the-old-workings', 'patron-000009', 59, 15, 236],
    ]);
    while (document.world.turn < 90) document = advance(document, deps).document;
    expect(document.history.byType['quest.offered']).toHaveLength(66);
    expect(board()).toEqual([
      ['quest-000061', 'break-the-sealed-vault', 'patron-000009', 90, 24, 360],
      ['quest-000062', 'lay-the-restless-dead', 'patron-000008', 56, 15, 224],
      ['quest-000063', 'recover-the-strongbox', 'patron-000003', 30, 12, 120],
      ['quest-000064', 'the-beast-of-the-fells', 'patron-000010', 63, 9, 252],
      ['quest-000065', 'hold-the-border-fort', 'patron-000011', 68, 18, 272],
      ['quest-000066', 'recover-the-strongbox', 'patron-000003', 43, 6, 172],
    ]);
    expect(document.world.rng.board).toEqual([2576077588, 3546060111, 712059594, 3078924888]);
  });

  test('is the same Quest from the same seed, and another from another', () => {
    const deps = testDeps();
    const tenFrom = (seed: string): Quest[] => {
      const { world, patron } = withPatron(seed, deps);
      return quests(world, patron, deps, 10);
    };

    expect(tenFrom('same')).toEqual(tenFrom('same'));
    expect(tenFrom('other')).not.toEqual(tenFrom('same'));
  });

  test('makes Quests the validator accepts in a created world', () => {
    const deps = testDeps();
    const { document } = createWorld('valid-quests', { guildmasterName: 'Ada', guildName: 'The Test', createdAt: 'test' }, deps);
    for (const patron of Object.values(document.world.patrons)) {
      for (const event of generateQuest(document.world, patron, deps).events) append(document.history, event);
    }

    expect(withValid(document, deps)).toBe(document);
  });

  test('throws, changing nothing, on a Patron not in the world, an unserved Sphere, a template not theirs, or a missing stream', () => {
    const deps = testDeps();
    const { world, patron } = withPatron('refusals', deps);
    const before = structuredClone(world);
    const unserved: EngineDeps = {
      config: deps.config,
      content: { ...testContent, questTemplates: { ...testContent.questTemplates } },
    };
    for (const key of Object.keys(unserved.content.questTemplates)) {
      if (templatesFor(testContent, 'crown').some((template) => template.key === key)) {
        delete unserved.content.questTemplates[key];
      }
    }

    expect(() => generateQuest(world, { ...patron, id: 'patron-000009' as Patron['id'] }, deps)).toThrow(/patron-000009/);
    expect(() => generateQuest(world, patron, unserved)).toThrow(/crown/);
    expect(() => generateQuest(world, patron, deps, { templateKey: 'a-quiet-word' })).toThrow(/a-quiet-word/);
    expect(() => generateQuest(world, patron, deps, { stream: 'market' as string as StreamName })).toThrow(/market/);
    expect(world).toEqual(before);
  });

  test('throws, changing nothing, on a world without the encounters stream or a kind content has no Encounter of', () => {
    const deps = testDeps();
    const { world, patron } = withPatron('encounter-refusals', deps);
    const noStealth: EngineDeps = {
      config: deps.config,
      content: {
        ...testContent,
        encounters: Object.fromEntries(Object.entries(testContent.encounters).filter(([, row]) => row.kind !== 'stealth')),
      },
    };
    const noStream = structuredClone(world);
    delete (noStream.rng as Partial<World['rng']>).encounters;
    const before = structuredClone(world);

    // Crown's templates are clear-the-barrow (combat, stealth, travel) and hold-the-border-fort.
    expect(() => generateQuest(world, patron, noStealth)).toThrow(/stealth/);
    expect(() => generateQuest(world, patron, noStealth, { templateKey: 'hold-the-border-fort' })).toThrow(/stealth/);
    expect(world).toEqual(before);
    const withoutStream = structuredClone(noStream);
    expect(() => generateQuest(noStream, patron, deps)).toThrow(/encounters/);
    expect(noStream).toEqual(withoutStream);
  });
});
