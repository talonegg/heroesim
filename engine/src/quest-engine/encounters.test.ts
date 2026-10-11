import { describe, expect, test } from 'vitest';
import { defaultConfig } from '../config.js';
import type { ContentSet, Encounter, EncounterKind, QuestBeat, QuestTemplate } from '../content-types.js';
import type { World } from '../document.js';
import { sortedRows, streamOf } from '../generators/draw.js';
import { next, pick } from '../rng.js';
import { plannedStreams, testContent, testDeps, testWorld } from '../world.test-support.js';
import { beatPlan, drawBeats, endsWithFinale, finaleKeys, sequenceFor, tagWeight } from './encounters.js';

// How a Quest's Encounters are drawn by its template's Beats, at generation or, for a Quest whose
// Encounters content no longer defines, when it resolves (DL-42, DL-262, data-model rule 5): one from
// each Beat its Tier plays, none twice, weighted by the tags an Encounter shares with its template
// (DL-160), and a template's Finale, always last (DL-148 items 22 and 23).

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

/** A Beat drawing an Encounter of `kind`, its line `line`. */
const beatOf = (kind: EncounterKind, line = `A ${kind} Beat.`): QuestBeat => ({ line, pool: { kinds: [kind] } });

/** The keys of a kind's Encounters in `content`, in key order. */
const ofKind = (content: ContentSet, kind: EncounterKind): string[] => sortedRows(content.encounters, (it) => it.kind === kind).map((it) => it.key);

describe('drawBeats', () => {
  test("takes one draw a Beat played, each Beat's Encounter from its pool, with its line, in order", () => {
    const state = streamOf(testWorld('draws', testDeps()), 'encounters');
    const twin = structuredClone(state);

    const { keys, lines } = drawBeats(state, beatPlan(barrow, testContent), 3, config);
    for (let draw = 0; draw < 3; draw += 1) next(twin);

    expect(state).toEqual(twin);
    expect(keys.map((key) => testContent.encounters[key]?.kind)).toEqual(['combat', 'stealth', 'travel']);
    expect(lines).toEqual(barrow.beats.map((beat) => beat.line));
  });

  test("plays the template's first count Beats, and every one at a count past them", () => {
    const deps = testDeps();
    for (const count of [1, 2, 3, 5]) {
      const state = streamOf(testWorld(`count-${count}`, deps), 'encounters');
      const twin = structuredClone(state);
      const { keys, lines } = drawBeats(state, beatPlan(barrow, testContent), count, config);
      const played = Math.min(count, barrow.beats.length);
      expect(keys).toHaveLength(played);
      expect(lines).toEqual(barrow.beats.slice(0, played).map((beat) => beat.line));
      for (let draw = 0; draw < played; draw += 1) next(twin);
      expect(state).toEqual(twin);
    }
  });

  test('never draws an Encounter twice, Beats sharing a pool drawing each in turn among those left', () => {
    // Three Beats of one pool of three: every Quest draws all three, in some order.
    const content = withRows([tagged('first', 'lore'), tagged('second', 'lore'), tagged('third', 'lore')]);
    const template: QuestTemplate = { ...barrow, beats: [beatOf('lore'), beatOf('lore'), beatOf('lore')] };
    const plan = beatPlan(template, content);
    const orders = new Set<string>();
    for (let seed = 0; seed < 200; seed += 1) {
      const { keys } = drawBeats(streamOf(testWorld(`twice-${seed}`, testDeps()), 'encounters'), plan, 3, config);
      expect([...keys].sort()).toEqual(['first', 'second', 'third']);
      orders.add(keys.join());
    }
    expect(orders.size).toBe(6);
  });

  test('with no tag shared, draws the Encounter of each Beat that a pick among its pool draws', () => {
    const deps = testDeps();
    for (let seed = 0; seed < 20; seed += 1) {
      const state = streamOf(testWorld(`pick-${seed}`, deps), 'encounters');
      const twin = structuredClone(state);
      const { keys } = drawBeats(state, beatPlan(barrow, testContent), 3, { encounterTagWeight: 1 });
      expect(keys).toEqual((['combat', 'stealth', 'travel'] as const).map((kind) => pick(twin, ofKind(testContent, kind))));
    }
  });

  test('over 20,000 draws, an Encounter sharing one tag with its template is drawn about three times as often as one sharing none', () => {
    // One Beat, three Encounters: `shared` shares `fight` with the template, the other two nothing.
    const content = withRows([tagged('shared', 'lore', ['fight', 'crypt']), tagged('plain', 'lore', ['crypt']), tagged('untagged', 'lore')]);
    const template: QuestTemplate = { ...barrow, tags: ['fight'], beats: [beatOf('lore')] };
    const state = streamOf(testWorld('three-to-one', testDeps()), 'encounters');
    const plan = beatPlan(template, content);

    const counts = new Map<string, number>();
    for (let draw = 0; draw < 20_000; draw += 1) {
      const [key = ''] = drawBeats(state, plan, 1, config).keys;
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

  test('a Finale is always the last, with its line, after one Beat fewer than the count, drawn as before', () => {
    const vault = tagged('the-vaults-heart', 'arcane');
    const content = withRows([vault], [{ ...barrow, finale: 'the-vaults-heart', finaleLine: 'The heart of it.' }]);
    const template = content.questTemplates['clear-the-barrow'] as QuestTemplate;
    const deps = testDeps();
    for (let seed = 0; seed < 50; seed += 1) {
      for (const count of [1, 2, 4]) {
        const state = streamOf(testWorld(`finale-${seed}`, deps), 'encounters');
        const twin = structuredClone(state);
        const { keys, lines } = drawBeats(state, beatPlan(template, content), count, config);
        const before = drawBeats(twin, beatPlan(barrow, testContent), count - 1, config);
        expect(keys).toEqual([...before.keys, 'the-vaults-heart']);
        expect(lines).toEqual([...before.lines, 'The heart of it.']);
        expect(state).toEqual(twin);
      }
    }
  });

  test('an Encounter some template names as its Finale is in no pool, on that Quest or another', () => {
    // A combat Finale of one template, which the barrow's combat Beat would otherwise draw.
    const finale = tagged('the-last-stand', 'combat', ['fight']);
    const fort = testContent.questTemplates['hold-the-border-fort'] as QuestTemplate;
    const content = withRows([finale], [{ ...fort, finale: 'the-last-stand', finaleLine: 'The last of it.' }]);
    expect(finaleKeys(content)).toEqual(new Set(['the-last-stand']));
    const state = streamOf(testWorld('no-finale-drawn', testDeps()), 'encounters');
    const twin = structuredClone(state);
    const plan = beatPlan(barrow, content);
    const drawn = Array.from({ length: 300 }, () => drawBeats(state, plan, 3, config).keys).flat();
    expect(drawn).not.toContain('the-last-stand');
    // And the barrow draws as it did before the Finale was written.
    expect(drawn).toEqual(Array.from({ length: 300 }, () => drawBeats(twin, beatPlan(barrow, testContent), 3, config).keys).flat());
  });
});

describe('beatPlan', () => {
  test("is each Beat's line and pool in key order, the template's tags, and its Finale with its line, or null", () => {
    const plan = beatPlan(barrow, testContent);
    expect(plan.beats.map(({ line, pool }) => [line, pool.map((it) => it.key)])).toEqual(
      barrow.beats.map(({ line, pool }) => [line, ofKind(testContent, pool.kinds?.[0] as EncounterKind)]),
    );
    expect(plan.tags).toEqual(barrow.tags);
    expect(plan.finale).toBeNull();
    const content = withRows([], [{ ...barrow, finale: 'hold-the-line', finaleLine: 'Hold.' }]);
    expect(beatPlan(content.questTemplates['clear-the-barrow'] as QuestTemplate, content).finale).toEqual({ key: 'hold-the-line', line: 'Hold.' });
  });

  test('pools by kind and tag together, and by name, as inBeatPool holds them', () => {
    const content = withRows([tagged('wild-ambush', 'combat', ['wilds']), tagged('wild-ford', 'travel', ['wilds'])]);
    const template: QuestTemplate = {
      ...barrow,
      beats: [{ line: 'Out in the wilds.', pool: { kinds: ['combat'], tags: ['wilds'], encounters: ['the-long-march'] } }],
    };
    expect(beatPlan(template, content).beats[0]?.pool.map((it) => it.key)).toEqual(['the-long-march', 'wild-ambush']);
  });

  test('throws on a Beat too small to draw from, an empty one among them, and on a Finale content does not define', () => {
    const lore = tagged('a-riddle', 'lore');
    const empty = withRows([lore], [{ ...barrow, beats: [beatOf('lore')], finale: 'a-riddle', finaleLine: 'A riddle.' }]);
    expect(() => beatPlan(empty.questTemplates['clear-the-barrow'] as QuestTemplate, empty)).toThrow(/Beat 1 may draw 0 Encounters/);
    // The test content has two arcane Encounters: three arcane Beats are one too many.
    const three: QuestTemplate = { ...barrow, beats: [beatOf('arcane'), beatOf('arcane'), beatOf('arcane')] };
    expect(() => beatPlan(three, testContent)).toThrow(/Beat 3 may draw 2 Encounters, none a Finale; it needs 3/);
    expect(() => beatPlan({ ...barrow, beats: [] }, testContent)).toThrow(/no Beat/);
    expect(() => beatPlan({ ...barrow, finale: 'gone', finaleLine: 'Gone.' }, testContent)).toThrow(/gone/);
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

    const sequence = sequenceFor(at, { templateKey: 'clear-the-barrow', tier: 3, encounterKeys: keys }, deps);

    expect(sequence.map((encounter) => encounter.key)).toEqual(keys);
    expect(at.rng).toEqual(before);
  });

  test('for a Quest with no Encounter that content still defines, is drawn from the encounters stream as the Quest Generator draws it', () => {
    const at = world();
    const twin = world();
    const before = structuredClone(at.rng) as Record<string, unknown>;

    const sequence = sequenceFor(at, { templateKey: 'clear-the-barrow', tier: 3, encounterKeys: ['gone'] }, deps);

    // At Tier 3, the barrow's three Beats (DL-262).
    const expected = drawBeats(streamOf(twin, 'encounters'), beatPlan(barrow, testContent), deps.config.tiers[2]?.beats ?? 0, deps.config);
    expect(sequence.map((encounter) => encounter.key)).toEqual(expected.keys);
    expect(sequence).toHaveLength(3);
    const after = at.rng as Record<string, unknown>;
    for (const name of plannedStreams) {
      if (name === 'encounters') expect(after[name], name).not.toEqual(before[name]);
      else expect(after[name], name).toEqual(before[name]);
    }
  });

  test('leaves out a stored key content no longer defines, and draws afresh when none is left', () => {
    const at = world();
    const kept = sequenceFor(at, { templateKey: 'clear-the-barrow', tier: 3, encounterKeys: ['gone', 'hold-the-line'] }, deps);
    expect(kept.map((encounter) => encounter.key)).toEqual(['hold-the-line']);

    const drawn = sequenceFor(at, { templateKey: 'clear-the-barrow', tier: 1, encounterKeys: ['gone'] }, deps);
    expect(drawn).toHaveLength(deps.config.tiers[0]?.beats ?? 0);
  });

  test('for a template content no longer defines, is one Encounter drawn among all of content', () => {
    const sequence = sequenceFor(world(), { templateKey: 'long-gone', tier: 3, encounterKeys: ['gone'] }, deps);
    expect(sequence).toHaveLength(1);
    expect(Object.keys(testContent.encounters)).toContain(sequence[0]?.key);
  });
});
