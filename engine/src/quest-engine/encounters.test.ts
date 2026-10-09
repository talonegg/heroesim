import { describe, expect, test } from 'vitest';
import { defaultConfig } from '../config.js';
import type { ContentSet, Encounter, EncounterKind, QuestTemplate } from '../content-types.js';
import type { World } from '../document.js';
import { sortedRows, streamOf } from '../generators/draw.js';
import { next, pick } from '../rng.js';
import { plannedStreams, testContent, testDeps, testWorld } from '../world.test-support.js';
import { drawSequence, encounterCount, endsWithFinale, finaleKeys, sequenceFor, sequencePlan, tagWeight } from './encounters.js';

// How many Encounters a Quest has, and how its sequence is drawn, at generation or, for a
// Quest generated before M4, when it resolves (DL-42). DL-160: the draw within a kind weighted by
// the tags an Encounter shares with its template, and a template's Finale, always last (DL-148 items
// 22 and 23).

const barrow = testContent.questTemplates['clear-the-barrow'] as QuestTemplate;
const config = { encounterTagWeight: defaultConfig.encounterTagWeight };

/** The test content with `encounters` beside its own and `templates` over its own. */
function withRows(encounters: Encounter[], templates: QuestTemplate[] = []): ContentSet {
  return {
    ...testContent,
    encounters: { ...testContent.encounters, ...Object.fromEntries(encounters.map((it) => [it.key, it])) },
    questTemplates: { ...testContent.questTemplates, ...Object.fromEntries(templates.map((it) => [it.key, it])) },
  };
}

/** An Encounter of `kind` with `tags`, its Check and consequences the ambush's. */
function tagged(key: string, kind: EncounterKind, tags?: string[]): Encounter {
  const ambush = testContent.encounters['ambush-on-the-road'] as Encounter;
  return { ...structuredClone(ambush), key, name: key, kind, ...(tags === undefined ? {} : { tags }) };
}

/** The sequence as it was drawn before DL-160: a kind by `pick`, then an Encounter of it by `pick`. */
function drawnBefore(state: Parameters<typeof pick>[0], template: QuestTemplate, content: ContentSet, count: number): string[] {
  const pools = template.encounterKinds.map((kind) => sortedRows(content.encounters, (it) => it.kind === kind));
  return Array.from({ length: count }, () => pick(state, pick(state, pools)).key);
}

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

    const keys = drawSequence(state, sequencePlan(barrow, testContent), 3, config);
    for (let draw = 0; draw < 6; draw += 1) next(twin);

    expect(keys).toHaveLength(3);
    expect(state).toEqual(twin);
    for (const key of keys) expect(barrow.encounterKinds).toContain(testContent.encounters[key]?.kind);
  });

  test('with no tag shared, draws exactly what the draw before DL-160 drew, a kind then an Encounter by pick, over 20 seeds of every template', () => {
    const deps = testDeps();
    for (let seed = 0; seed < 20; seed += 1) {
      const stream = streamOf(testWorld(`before-${seed}`, deps), 'encounters');
      for (const template of sortedRows(testContent.questTemplates)) {
        const state = structuredClone(stream);
        const twin = structuredClone(state);
        const count = template.encountersMax;
        expect(drawSequence(state, sequencePlan(template, testContent), count, config), template.key).toEqual(
          drawnBefore(twin, template, testContent, count),
        );
        expect(state).toEqual(twin);
      }
    }
  });

  test('tags at encounterTagWeight 1 draw exactly what no tags draw', () => {
    const content = withRows([tagged('ambush-on-the-road', 'combat', ['fight'])]);
    const state = streamOf(testWorld('weight-1', testDeps()), 'encounters');
    const twin = structuredClone(state);
    const keys = Array.from({ length: 50 }, () => drawSequence(state, sequencePlan(barrow, content), 4, { encounterTagWeight: 1 }));
    const before = Array.from({ length: 50 }, () => drawnBefore(twin, barrow, content, 4));
    expect(keys).toEqual(before);
  });

  test('over 20,000 draws, an Encounter sharing one tag with its template is drawn about three times as often as one sharing none', () => {
    // One kind, three Encounters: `shared` shares `fight` with the template, the other two nothing.
    const content = withRows([tagged('shared', 'lore', ['fight', 'crypt']), tagged('plain', 'lore', ['crypt']), tagged('untagged', 'lore')]);
    const template: QuestTemplate = { ...barrow, tags: ['fight'], encounterKinds: ['lore'] };
    const state = streamOf(testWorld('three-to-one', testDeps()), 'encounters');
    const plan = sequencePlan(template, content);

    const counts = new Map<string, number>();
    for (let draw = 0; draw < 20_000; draw += 1) {
      const [key = ''] = drawSequence(state, plan, 1, config);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }

    const shared = counts.get('shared') ?? 0;
    // 3 ÷ 5 of the draws, and three times either other's.
    expect(shared / 20_000).toBeGreaterThan(0.58);
    expect(shared / 20_000).toBeLessThan(0.62);
    for (const other of ['plain', 'untagged']) {
      const ratio = shared / (counts.get(other) ?? 1);
      expect(ratio, other).toBeGreaterThan(2.8);
      expect(ratio, other).toBeLessThan(3.2);
    }
  });

  test('each tag shared multiplies the weight again: two shared are encounterTagWeight squared', () => {
    const twice = tagged('twice', 'lore', ['fight', 'crypt']);
    const once = tagged('once', 'lore', ['crypt']);
    expect(tagWeight(twice, ['fight', 'crypt', 'dark'], config)).toBe(9);
    expect(tagWeight(once, ['fight', 'crypt', 'dark'], config)).toBe(3);
    expect(tagWeight(once, ['fight'], config)).toBe(1);
    expect(tagWeight(tagged('none', 'lore'), ['fight'], config)).toBe(1);
    expect(tagWeight(twice, ['fight', 'crypt'], { encounterTagWeight: 1 })).toBe(1);
  });

  test('a Finale is always the last, the count unchanged, and the places before it drawn as before: two draws fewer', () => {
    const vault = tagged('the-vaults-heart', 'arcane');
    const content = withRows([vault], [{ ...barrow, finale: 'the-vaults-heart' }]);
    const template = content.questTemplates['clear-the-barrow'] as QuestTemplate;
    const deps = testDeps();
    for (let seed = 0; seed < 50; seed += 1) {
      for (const count of [1, 2, 4]) {
        const state = streamOf(testWorld(`finale-${seed}`, deps), 'encounters');
        const twin = structuredClone(state);
        const keys = drawSequence(state, sequencePlan(template, content), count, config);
        expect(keys).toHaveLength(count);
        expect(keys.at(-1)).toBe('the-vaults-heart');
        expect(keys.slice(0, -1)).toEqual(drawnBefore(twin, barrow, testContent, count - 1));
        expect(state).toEqual(twin);
      }
    }
  });

  test('an Encounter some template names as its Finale is drawn into no place, on that Quest or another', () => {
    // A combat Finale of one template, which the barrow's combat places would otherwise draw.
    const finale = tagged('the-last-stand', 'combat', ['fight']);
    const fort = testContent.questTemplates['hold-the-border-fort'] as QuestTemplate;
    const content = withRows([finale], [{ ...fort, finale: 'the-last-stand' }]);
    expect(finaleKeys(content)).toEqual(new Set(['the-last-stand']));
    const state = streamOf(testWorld('no-finale-drawn', testDeps()), 'encounters');
    const twin = structuredClone(state);
    const plan = sequencePlan(barrow, content);
    const drawn = Array.from({ length: 300 }, () => drawSequence(state, plan, 4, config)).flat();
    expect(drawn).not.toContain('the-last-stand');
    // And the barrow draws as it did before the Finale was written.
    expect(drawn).toEqual(Array.from({ length: 300 }, () => drawnBefore(twin, barrow, testContent, 4)).flat());
  });

});

describe('sequencePlan', () => {
  test("is each kind's Encounters in key order, the template's tags and its Finale, or null", () => {
    const plan = sequencePlan(barrow, testContent);
    expect(plan.pools.map((pool) => pool.map((it) => it.key))).toEqual(
      barrow.encounterKinds.map((kind) => sortedRows(testContent.encounters, (it) => it.kind === kind).map((it) => it.key)),
    );
    expect(plan.tags).toEqual(barrow.tags);
    expect(plan.finale).toBeNull();
    const content = withRows([], [{ ...barrow, finale: 'hold-the-line' }]);
    expect(sequencePlan(content.questTemplates['clear-the-barrow'] as QuestTemplate, content).finale).toBe('hold-the-line');
  });

  test('throws on a kind with no Encounter but Finales, and on a Finale content does not define', () => {
    const lore = tagged('a-riddle', 'lore');
    const content = withRows([lore], [{ ...barrow, encounterKinds: ['lore'], finale: 'a-riddle' }]);
    expect(() => sequencePlan(content.questTemplates['clear-the-barrow'] as QuestTemplate, content)).toThrow(/lore/);
    expect(() => sequencePlan({ ...barrow, finale: 'gone' }, testContent)).toThrow(/gone/);
  });
});

describe('endsWithFinale', () => {
  const content = withRows([], [{ ...barrow, finale: 'hold-the-line' }]);
  const of = (...keys: string[]) => keys.map((key) => ({ key }));

  test("is whether a sequence ends with its template's Finale", () => {
    expect(endsWithFinale('clear-the-barrow', of('past-the-watch', 'hold-the-line'), content)).toBe(true);
    expect(endsWithFinale('clear-the-barrow', of('hold-the-line', 'past-the-watch'), content)).toBe(false);
    expect(endsWithFinale('clear-the-barrow', of(), content)).toBe(false);
  });

  test('is false for a template naming none, or one content no longer defines', () => {
    expect(endsWithFinale('clear-the-barrow', of('hold-the-line'), testContent)).toBe(false);
    expect(endsWithFinale('long-gone', of('hold-the-line'), content)).toBe(false);
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

  test('for a Quest with no Encounter that content still defines, is drawn from the encounters stream as the Quest Generator draws it', () => {
    const at = world();
    const twin = world();
    const before = structuredClone(at.rng) as Record<string, unknown>;

    const sequence = sequenceFor(at, { templateKey: 'clear-the-barrow', difficulty: 70, encounterKeys: [] }, deps);

    const expected = drawSequence(streamOf(twin, 'encounters'), sequencePlan(barrow, testContent), 4, deps.config);
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
