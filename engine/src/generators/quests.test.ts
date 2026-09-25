import { describe, expect, test } from 'vitest';
import type { EngineDeps } from '../config.js';
import { createWorld } from '../create.js';
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
        encounterKeys: [],
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

  test('draws from the board stream alone, or from the stream its caller names', () => {
    const deps = testDeps();
    const { world, patron } = withPatron('streams', deps, 'crown', plannedStreams);
    const before = structuredClone(world.rng) as Record<string, unknown>;
    const rng = (): Record<string, unknown> => world.rng;

    generateQuest(world, patron, deps);
    for (const name of plannedStreams) {
      if (name === 'board') expect(rng()[name], name).not.toEqual(before[name]);
      else expect(rng()[name], name).toEqual(before[name]);
    }

    const afterBoard = structuredClone(world.rng) as Record<string, unknown>;
    generateQuest(world, patron, deps, { stream: 'generation' });
    expect(rng()['board']).toEqual(afterBoard['board']);
    expect(rng()['generation']).not.toEqual(afterBoard['generation']);
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
});
