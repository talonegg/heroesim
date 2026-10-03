import { loadContent } from '@heroesim/content/node';
import { defaultConfig, passOf, type EngineDeps } from '@heroesim/engine';
import { describe, expect, test } from 'vitest';
import { compareSample, drawSample, estimateMoraleTolerance, estimateProbe, estimateReport, estimateTolerance, harmless, moraleIn, questsStream, unhurt, widest } from './estimate.js';
import { machine } from './report.js';

// v1.1.4-S5 (DL-156): the estimate probe's parts, and the probe over a few samples. The probe proper,
// 200 samples × 20,000 seeds held within 2 points, is `HEROESIM_PROBE=estimate npm run harness`.
// v1.1.5-S7 (DL-173): its second measure, the same samples with Morale's consequences left in, held
// within 3 points.

const deps: EngineDeps = { config: { ...defaultConfig }, content: loadContent() };

// Samples estimated and resolved over thousands of seeds: up to two seconds a test alone, more than the
// default 5 s under the whole suite's load (DL-164).
describe('the estimate probe', { timeout: 60_000 }, () => {
  test('takes every Injury, Death and Morale out of the content, and keeps the rest', () => {
    const kept = harmless(deps.content);
    const all = Object.values(kept.encounters).flatMap(({ consequences }) => Object.values(consequences).flat());
    expect(all.some((it) => it.kind === 'injury' || it.kind === 'death' || it.kind === 'morale')).toBe(false);
    expect(all.length).toBeGreaterThan(0);
    expect(Object.keys(kept.encounters)).toEqual(Object.keys(deps.content.encounters));
  });

  test('draws the same sample from the same seed, its Checks combined by formulas that name each once', () => {
    const base = { ...deps, content: harmless(deps.content) };
    const [a, b] = [drawSample('estimate-0007', base), drawSample('estimate-0007', base)];
    expect(a.quest).toEqual(b.quest);
    expect(a.estimate).toEqual(b.estimate);
    expect(a.world.heroes).toEqual(b.world.heroes);
    // Sent, and met on the night home: the Party away, the Quest taken, the Turn its return night.
    expect(a.world.turn).toBe(a.party.returnsOnTurn);
    expect(a.party.returnsOnTurn - a.party.departedOnTurn).toBeGreaterThan(3);
    expect(a.party.heroIds.every((id) => a.world.heroes[id]?.partyId === a.party.id)).toBe(true);
    for (let n = 1; n <= 20; n += 1) {
      const { quest, deps: sampled } = drawSample(`estimate-${n}`, base);
      for (const key of quest.encounterKeys) {
        const encounter = sampled.content.encounters[key];
        if (encounter === undefined) throw new Error(`No ${key}`);
        const named = JSON.stringify(passOf(encounter)).match(/"c\d"/g) ?? [];
        if (key.startsWith('probe-')) expect([...named].sort()).toEqual(encounter.checks.map((it) => `"${it.key}"`).sort());
      }
    }
    expect(questsStream('seed-0001')).toEqual(questsStream('seed-0001'));
    expect(questsStream('seed-0001')).not.toEqual(questsStream('seed-0002'));
  });

  test('takes every Injury and Death out of the content, and keeps Morale and the rest', () => {
    const kept = unhurt(deps.content);
    const all = Object.values(kept.encounters).flatMap(({ consequences }) => Object.values(consequences).flat());
    expect(all.some((it) => it.kind === 'injury' || it.kind === 'death')).toBe(false);
    const morale = (content: typeof kept) => Object.values(content.encounters).flatMap(({ consequences }) => Object.values(consequences).flat()).filter((it) => it.kind === 'morale');
    expect(morale(kept).length).toBeGreaterThan(0);
    expect(morale(kept)).toEqual(morale(deps.content));
    expect(Object.keys(kept.encounters)).toEqual(Object.keys(deps.content.encounters));
  });

  test("puts Morale back into a sample: the core's Encounters as shipped, less harm, and each written one a core Encounter's of its kind", () => {
    const base = { ...deps, content: harmless(deps.content) };
    const drawn = drawSample('estimate-0003', base);
    const sampled = moraleIn(drawn, deps.content);
    const written = drawn.quest.encounterKeys.filter((key) => key.startsWith('probe-'));
    const core = drawn.quest.encounterKeys.filter((key) => !key.startsWith('probe-'));
    expect(written.length).toBeGreaterThan(0);
    const lists = (encounter: { consequences: Record<string, unknown> } | undefined) => Object.values(encounter?.consequences ?? {}).flat() as { kind: string }[];
    for (const key of core) expect(sampled.content.encounters[key]).toEqual(unhurt(deps.content).encounters[key]);
    for (const key of written) {
      const before = drawn.deps.content.encounters[key];
      const after = sampled.content.encounters[key];
      // The Checks and formula are the sample's own; only Morale is added, and nothing that harms.
      expect({ ...after, consequences: undefined }).toEqual({ ...before, consequences: undefined });
      expect(lists(after).filter((it) => it.kind !== 'morale')).toEqual(expect.arrayContaining(lists(before)));
      expect(lists(after).some((it) => it.kind === 'injury' || it.kind === 'death')).toBe(false);
    }
    // Over a few samples, some written Encounter carries Morale, as most of the core's do.
    const carrying = Array.from({ length: 20 }, (_, n) => {
      const it = drawSample(`estimate-${n + 1}`, base);
      const content = moraleIn(it, deps.content).content;
      return it.quest.encounterKeys.filter((key) => key.startsWith('probe-') && lists(content.encounters[key]).some((c) => c.kind === 'morale')).length;
    });
    expect(carrying.reduce((a, b) => a + b, 0)).toBeGreaterThan(0);
    // The world and the estimate are the sample's: the same samples, measured twice.
    expect(sampled.config).toBe(drawn.deps.config);
  });

  test('holds the estimate near the resolver over a few samples, met on the night home, and reports both measures', () => {
    const samples = estimateProbe(6, 2_000, deps);
    expect(samples.some((sample) => sample.bandsMoved > 0)).toBe(true);
    const most = widest(samples);
    expect(most?.gap).toBeLessThan(0.04);
    // The second measure: the same chances, compared with the resolver's rate with Morale in.
    for (const sample of samples) {
      expect(sample.moraleIn.map(({ of, what, estimate }) => ({ of, what, estimate }))).toEqual(sample.compared.map(({ of, what, estimate }) => ({ of, what, estimate })));
    }
    expect(samples.some((sample) => sample.moraleEncounters > 0)).toBe(true);
    expect(widest(samples, 'moraleIn')?.gap).toBeLessThan(0.05);
    const report = estimateReport(samples, { runs: 2_000, machine: machine(), startedAt: new Date(0), seconds: 1 });
    expect(report).toContain('6 samples × 2,000 seeds');
    expect(report).toContain('## No one falls');
    expect(report).toContain('## Morale in');
    expect(report.match(/The widest gap/g)).toHaveLength(2);
    expect(report.match(/Widest gap \(standard errors\)/g)).toHaveLength(2);
    expect(report.match(/\| Beyond the limit \|/g)).toHaveLength(2);
    expect(report).toContain('the limit of 2 points');
    expect(report).toContain('the limit of 3 points');
  });

  test("measures Morale's consequences: a loss that moves a Hero's band moves the resolver's rates, and nothing else does", () => {
    const base = { ...deps, content: harmless(deps.content) };
    const rates = (seed: string) => {
      const drawn = drawSample(seed, base);
      const seeds = Array.from({ length: 500 }, (_, at) => questsStream(`${seed}/seed-${String(at + 1).padStart(4, '0')}`));
      const sample = compareSample(seed, drawn, seeds, moraleIn(drawn, deps.content));
      return sample.moraleIn.map((it, at) => it.rate - (sample.compared[at]?.rate ?? 0));
    };
    // estimate-0023: a Morale loss on the way takes a Hero below a band's floor, and their form with it.
    expect(rates('estimate-0023').some((gap) => gap !== 0)).toBe(true);
    // estimate-0003: every resolution loses Morale, and no Hero's band moves, so nothing changes; a
    // Morale consequence draws nothing, and the seeds meet the same rolls.
    expect(rates('estimate-0003').every((gap) => gap === 0)).toBe(true);
  });

  test('names its limits: 2 points with no one falling, 3 with Morale in', () => {
    expect(estimateTolerance).toBe(0.02);
    expect(estimateMoraleTolerance).toBe(0.03);
  });
});
