import { describe, expect, test } from 'vitest';
import type { QuestTemplate } from '../content-types.js';
import type { World } from '../document.js';
import { streamOf } from '../generators/draw.js';
import { next } from '../rng.js';
import { plannedStreams, testContent, testDeps, testWorld } from '../world.test-support.js';
import { drawSequence, encounterCount, encounterPools, sequenceFor } from './encounters.js';

// M4-S1: how many Encounters a Quest has, and how its sequence is drawn, at generation or, for a
// Quest generated before M4, when it resolves (DL-42).

const barrow = testContent.questTemplates['clear-the-barrow'] as QuestTemplate;

describe('encounterCount', () => {
  const config = { questDifficultyMin: 10, questDifficultyMax: 100 };
  const template = { ...barrow, difficultyMin: 30, difficultyMax: 70, encountersMin: 2, encountersMax: 4 };

  test("rises with difficulty from encountersMin at the bottom of the template's range to encountersMax at the top (INPUTS 6.1)", () => {
    expect([30, 39, 40, 50, 59, 60, 70].map((difficulty) => encounterCount(template, difficulty, config))).toEqual([
      2, 2, 3, 3, 3, 4, 4,
    ]);
  });

  test("reads the range the difficulty was drawn over, held inside the config's scale", () => {
    const narrowed = { questDifficultyMin: 50, questDifficultyMax: 60 };
    expect(encounterCount(template, 50, narrowed)).toBe(2);
    expect(encounterCount(template, 55, narrowed)).toBe(3);
    expect(encounterCount(template, 60, narrowed)).toBe(4);
  });

  test('gives encountersMin for a range of one value, and never leaves the count range', () => {
    expect(encounterCount({ ...template, difficultyMin: 40, difficultyMax: 40 }, 40, config)).toBe(2);
    expect(encounterCount(template, 5, config)).toBe(2);
    expect(encounterCount(template, 500, config)).toBe(4);
  });
});

describe('drawSequence', () => {
  test('takes two draws an Encounter, a kind of the template then an Encounter of that kind', () => {
    const deps = testDeps();
    const world = testWorld('draws', deps);
    const state = streamOf(world, 'encounters');
    const twin = structuredClone(state);
    const pools = encounterPools(barrow, testContent);

    const keys = drawSequence(state, pools, 3);
    for (let draw = 0; draw < 6; draw += 1) next(twin);

    expect(keys).toHaveLength(3);
    expect(state).toEqual(twin);
    for (const key of keys) expect(barrow.encounterKinds).toContain(testContent.encounters[key]?.kind);
  });
});

describe('sequenceFor', () => {
  const deps = testDeps();
  const world = (): World => testWorld('sequence', deps, plannedStreams);

  test("is a Quest's own sequence when it has one, drawing nothing", () => {
    const at = world();
    const before = structuredClone(at.rng);
    const keys = ['hold-the-line', 'past-the-watch'];

    const sequence = sequenceFor(at, { templateKey: 'clear-the-barrow', difficulty: 50, encounterKeys: keys }, deps);

    expect(sequence.map((encounter) => encounter.key)).toEqual(keys);
    expect(at.rng).toEqual(before);
  });

  test('for a Quest generated before M4, with none, is drawn from the encounters stream as the Quest Generator draws it', () => {
    const at = world();
    const twin = world();
    const before = structuredClone(at.rng) as Record<string, unknown>;

    const sequence = sequenceFor(at, { templateKey: 'clear-the-barrow', difficulty: 70, encounterKeys: [] }, deps);

    const expected = drawSequence(streamOf(twin, 'encounters'), encounterPools(barrow, testContent), 4);
    expect(sequence.map((encounter) => encounter.key)).toEqual(expected);
    const after = at.rng as Record<string, unknown>;
    for (const name of plannedStreams) {
      if (name === 'encounters') expect(after[name], name).not.toEqual(before[name]);
      else expect(after[name], name).toEqual(before[name]);
    }
  });

  test('leaves out a stored key content no longer defines, and draws afresh when none is left', () => {
    const at = world();
    const kept = sequenceFor(at, { templateKey: 'clear-the-barrow', difficulty: 30, encounterKeys: ['gone', 'hold-the-line'] }, deps);
    expect(kept.map((encounter) => encounter.key)).toEqual(['hold-the-line']);

    const drawn = sequenceFor(at, { templateKey: 'clear-the-barrow', difficulty: 30, encounterKeys: ['gone'] }, deps);
    expect(drawn).toHaveLength(2);
  });

  test('for a template content no longer defines, is one Encounter drawn among all of content', () => {
    const sequence = sequenceFor(world(), { templateKey: 'long-gone', difficulty: 30, encounterKeys: [] }, deps);
    expect(sequence).toHaveLength(1);
    expect(Object.keys(testContent.encounters)).toContain(sequence[0]?.key);
  });
});
