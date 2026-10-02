import { loadContent } from '@heroesim/content/node';
import { defaultConfig, passOf, type EngineDeps } from '@heroesim/engine';
import { describe, expect, test } from 'vitest';
import { drawSample, estimateProbe, estimateReport, harmless, questsStream, widest } from './estimate.js';
import { machine } from './report.js';

// v1.1.4-S5 (DL-156): the estimate probe's parts, and the probe over a few samples. The probe proper,
// 200 samples × 20,000 seeds held within 2 points, is `HEROESIM_PROBE=estimate npm run harness`.

const deps: EngineDeps = { config: { ...defaultConfig }, content: loadContent() };

describe('the estimate probe', () => {
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

  test('holds the estimate near the resolver over a few samples, met on the night home, and reports it', () => {
    const samples = estimateProbe(6, 2_000, deps);
    expect(samples.some((sample) => sample.bandsMoved > 0)).toBe(true);
    const most = widest(samples);
    expect(most?.gap).toBeLessThan(0.04);
    const report = estimateReport(samples, { runs: 2_000, machine: machine(), startedAt: new Date(0), seconds: 1 });
    expect(report).toContain('6 samples × 2,000 seeds');
    expect(report).toContain('The widest gap');
  });
});
