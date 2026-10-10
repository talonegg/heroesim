import { passOf, type Hero } from '@heroesim/engine';
import { describe, expect, test } from 'vitest';
import { compareSample, drawSample, estimateChecks, estimateMoraleTolerance, estimateProbe, estimateReport, estimateTolerance, harmless, moraleHeld, moraleIn, questsStream, unhurt, widest, type Compared, type Drawn, type Sample } from './estimate.js';
import { coreDeps as deps } from './harness.test-support.js';
import { machine } from './report.js';

// DL-156: the estimate probe's parts, and the probe over a few samples. The probe proper,
// 200 samples × 20,000 seeds held within 2 points, is `HEROESIM_PROBE=estimate npm run harness`.
// DL-173: its second measure, the same samples with Morale's consequences left in, held
// within 3 points; owner's answer 2026-10-04: held on the Quest's chances only, each Encounter's reported.

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
    // Five samples: probe Encounters among them, each formula naming each of its Checks once.
    let probed = 0;
    for (let n = 1; n <= 5; n += 1) {
      const { quest, deps: sampled } = drawSample(`estimate-${n}`, base);
      for (const key of quest.encounterKeys) {
        const encounter = sampled.content.encounters[key];
        if (encounter === undefined) throw new Error(`No ${key}`);
        const named = JSON.stringify(passOf(encounter)).match(/"c\d"/g) ?? [];
        if (key.startsWith('probe-')) {
          probed += 1;
          expect([...named].sort()).toEqual(encounter.checks.map((it) => `"${it.key}"`).sort());
        }
      }
    }
    expect(probed).toBeGreaterThan(0);
    expect(questsStream('seed-0001')).toEqual(questsStream('seed-0001'));
    expect(questsStream('seed-0001')).not.toEqual(questsStream('seed-0002'));
  });

  // DL-264's verification: the probe measures the estimate, not whether its Guild may take the Quest, so
  // a Fame minimum above the Guild's Fame neither refuses its Party nor changes what is measured.
  test("sends its Party whatever the Fame minimum of its Quest's Tier, the sample as with none", () => {
    const base = { ...deps, content: harmless(deps.content) };
    const tiers = base.config.tiers.map((row) => ({ ...row, fameMinimum: 50 }));
    const closed = { ...base, config: { ...base.config, tiers } };
    const [open, shut] = [drawSample('estimate-0001', base), drawSample('estimate-0001', closed)];
    expect(shut.quest).toEqual(open.quest);
    expect(shut.estimate).toEqual(open.estimate);
    expect(shut.party).toEqual(open.party);
    expect(shut.party.heroIds.map((id) => shut.world.heroes[id])).toEqual(open.party.heroIds.map((id) => open.world.heroes[id]));
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
    expect(widest(samples, 'moraleIn', 'quest')?.gap).toBeLessThan(0.05);
    const report = estimateReport(samples, { runs: 2_000, machine: machine(), startedAt: new Date(0), seconds: 1 });
    expect(report).toContain('6 samples × 2,000 seeds');
    expect(report).toContain('## No one falls');
    expect(report).toContain('## Morale in');
    expect(report.match(/The widest gap/g)).toHaveLength(2);
    expect(report.match(/Widest gap \(standard errors\)/g)).toHaveLength(2);
    expect(report.match(/\| Beyond the limit \|/g)).toHaveLength(2);
    expect(report).toContain('the limit of 2 points');
    expect(report).toContain('the limit of 3 points');
    expect(report).toContain('reported, not held');
  });

  test("measures Morale's consequences: a loss that moves a Hero's band moves the resolver's rates, and nothing else does", () => {
    const base = { ...deps, content: harmless(deps.content) };
    const sum = (values: readonly number[]) => values.reduce((total, value) => total + value, 0);
    /** The most Morale each of `drawn`'s Encounters moves a Hero by, its Morale consequences put back: the largest of its Degrees'. */
    const moraleMoved = (drawn: Drawn) => {
      const { content } = moraleIn(drawn, deps.content);
      return drawn.quest.encounterKeys.map((key) =>
        Math.max(0, ...Object.values(content.encounters[key]?.consequences ?? {}).map((list) => sum((list ?? []).flatMap((it) => (it.kind === 'morale' ? [Math.abs(it.delta)] : []))))),
      );
    };
    // The first sample whose Quest carries a Morale consequence in an Encounter before its last, so that a
    // band it moves is read by the Checks after it: chosen by that, not by its seed (DL-273).
    const seed = Array.from({ length: 40 }, (_, at) => `estimate-${String(at + 1).padStart(4, '0')}`).find((each) => moraleMoved(drawSample(each, base)).slice(0, -1).some((moved) => moved > 0));
    if (seed === undefined) throw new Error('No sample of 40 carries a Morale consequence before its last Encounter');
    /** The gaps between the resolver's rates with Morale in and with none, every Hero of the Party at `morale` as they set out. */
    const rates = (morale: number) => {
      const drawn = drawSample(seed, base);
      for (const heroId of drawn.party.heroIds) (drawn.world.heroes[heroId] as Hero).morale = morale;
      const seeds = Array.from({ length: 500 }, (_, at) => questsStream(`${seed}/seed-${String(at + 1).padStart(4, '0')}`));
      const sample = compareSample(seed, drawn, seeds, moraleIn(drawn, deps.content));
      return sample.moraleIn.map((it, at) => it.rate - (sample.compared[at]?.rate ?? 0));
    };
    const { steady, high } = deps.config.moraleBands;
    // At the steady band's floor: a Morale loss on the way takes a Hero below it, and their form with it.
    expect(rates(steady).some((gap) => gap !== 0)).toBe(true);
    // Midway up the band, further from either floor than every Morale consequence of the Quest together: no
    // Hero's band moves, so nothing changes; a Morale consequence draws nothing, and the seeds meet the same rolls.
    const middle = Math.floor((steady + high) / 2);
    expect(sum(moraleMoved(drawSample(seed, base)))).toBeLessThan(Math.min(middle - steady, high - middle));
    expect(rates(middle).every((gap) => gap === 0)).toBe(true);
  });

  // S7's verification (DL-173): the Morale check and its report read the second measure, not the first,
  // and a gap of exactly the limit is beyond it, as the check's strict `<` holds. The owner's answer
  // (2026-10-04): the Morale check holds the Quest's chances only; each Encounter's are reported.
  test("reads each measure's own gaps: the widest, its report and the chances beyond its limit", () => {
    const sample = (seed: string, compared: Compared[], moraleIn: Compared[]): Sample => ({ seed, heroes: 1, encounters: 1, checks: 1, several: 0, carried: 0, bandsMoved: 0, moraleEncounters: 1, compared, moraleIn });
    const at = (what: string, estimate: number, rate: number): Compared => ({ of: 0, what, estimate, rate });
    const quest = (what: string, estimate: number, rate: number): Compared => ({ of: 'quest', what, estimate, rate });
    const samples = [
      sample('estimate-0001', [at('failure', 0, 0.01)], [quest('fail', 0, estimateMoraleTolerance)]),
      sample('estimate-0002', [at('setback', 0, estimateTolerance)], [quest('strong', 0, 0.05), at('setback', 0, 0.2)]),
    ];
    expect(widest(samples)).toMatchObject({ sample: 'estimate-0002', compared: { rate: estimateTolerance } });
    expect(widest(samples, 'moraleIn')).toMatchObject({ sample: 'estimate-0002', compared: { rate: 0.2 } });
    expect(widest(samples, 'moraleIn', 'quest')).toMatchObject({ sample: 'estimate-0002', compared: { rate: 0.05 } });
    const report = estimateReport(samples, { runs: 2_000, machine: machine(), startedAt: new Date(0), seconds: 1 });
    const [first, second] = report.split('## Morale in') as [string, string];
    // No one falls: gaps of 1 and 2 points, the 2 beyond its limit of 2; Morale in: the Quest's 3 and 5,
    // both beyond 3 and held; the Encounter's 20, beyond 3 and reported only.
    expect(first).toContain("| Each Encounter's Degrees | 2 | 0 | 2.00 | 1.500 | 0.00 | 1 |");
    expect(first).toContain('estimate-0002, Encounter 1, setback: estimated 0.00%, resolved 2.00%, 2.00 points, beyond the limit of 2 points.');
    expect(second).toContain("| The Quest's bands | 2 | 0 | 5.00 | 4.000 | 0.00 | 2 |");
    expect(second).toContain("| Each Encounter's Degrees, reported, not held | 1 | 0 | 20.00 | 20.000 | 0.00 | 1 |");
    expect(second).toContain('The widest gap held: estimate-0002, the Quest, strong: estimated 0.00%, resolved 5.00%, 5.00 points, beyond the limit of 3 points.');
    expect(second).toContain("The widest Encounter gap, reported, not held (DL-173, the owner's answer): estimate-0002, Encounter 1, setback: estimated 0.00%, resolved 20.00%, 20.00 points, beyond 3 points.");
  });

  test("holds the Morale check to the Quest's chances: an Encounter's gap above 3 points does not fail it, the Quest's does", () => {
    const sample = (moraleIn: Compared[]): Sample => ({ seed: 'estimate-0001', heroes: 1, encounters: 1, checks: 1, several: 0, carried: 0, bandsMoved: 0, moraleEncounters: 1, compared: [], moraleIn });
    const encounter: Compared[] = [
      { of: 0, what: 'failure', estimate: 0.1, rate: 0.4 },
      { of: 0, what: 'succeeded', estimate: 0.5, rate: 0.45 },
      { of: 'quest', what: 'success', estimate: 0.5, rate: 0.52 },
    ];
    expect(widest([sample(encounter)], 'moraleIn')?.gap).toBeGreaterThan(estimateMoraleTolerance);
    expect(moraleHeld([sample(encounter)])).toBeLessThan(estimateMoraleTolerance);
    const planted: Compared[] = [...encounter, { of: 'quest', what: 'succeeded', estimate: 0.5, rate: 0.535 }];
    expect(moraleHeld([sample(planted)])).toBeGreaterThanOrEqual(estimateMoraleTolerance);
    expect(moraleHeld([])).toBe(0);
  });

  // The owner's answer verified (DL-173): the harness test's two checks are `estimateChecks`, so that their
  // scopes and strict `<` fail here, not only in a probe's run; and the report's held and reported lines
  // read a gap of exactly 3 points as beyond, as the check does.
  test("makes the probe's two checks: no one falls on every chance below 2 points, Morale in on the Quest's below 3, each strictly", () => {
    const sample = (compared: Compared[], moraleIn: Compared[]): Sample => ({ seed: 'estimate-0001', heroes: 1, encounters: 1, checks: 1, several: 0, carried: 0, bandsMoved: 0, moraleEncounters: 1, compared, moraleIn });
    const at = (of: Compared['of'], what: string, gap: number): Compared => ({ of, what, estimate: 0, rate: gap });
    const within = [sample([at(0, 'failure', 0.019), at('quest', 'fail', 0.019)], [at(0, 'failure', 0.3), at('quest', 'succeeded', 0.029)])];
    expect(estimateChecks(within)).toEqual({
      noOneFalls: { gap: 0.019, limit: estimateTolerance, within: true },
      moraleIn: { gap: 0.029, limit: estimateMoraleTolerance, within: true },
    });
    // An Encounter's chance beyond 2 points fails the first check; the Quest's within it does not save it.
    expect(estimateChecks([sample([at(0, 'succeeded', 0.025), at('quest', 'fail', 0)], [])]).noOneFalls).toEqual({ gap: 0.025, limit: estimateTolerance, within: false });
    // Exactly the limit is beyond it, in either check.
    const exactly = [sample([at(1, 'setback', estimateTolerance)], [at('quest', 'strong', estimateMoraleTolerance)])];
    expect(estimateChecks(exactly)).toEqual({
      noOneFalls: { gap: estimateTolerance, limit: estimateTolerance, within: false },
      moraleIn: { gap: estimateMoraleTolerance, limit: estimateMoraleTolerance, within: false },
    });
    expect(estimateChecks([])).toEqual({ noOneFalls: { gap: 0, limit: estimateTolerance, within: true }, moraleIn: { gap: 0, limit: estimateMoraleTolerance, within: true } });
    const report = estimateReport([sample([], [at(0, 'failure', estimateMoraleTolerance), at('quest', 'succeeded', estimateMoraleTolerance)])], { runs: 2_000, machine: machine(), startedAt: new Date(0), seconds: 1 });
    expect(report).toContain('The widest gap held: estimate-0001, the Quest, succeeded: estimated 0.00%, resolved 3.00%, 3.00 points, beyond the limit of 3 points.');
    expect(report).toContain("The widest Encounter gap, reported, not held (DL-173, the owner's answer): estimate-0001, Encounter 1, failure: estimated 0.00%, resolved 3.00%, 3.00 points, beyond 3 points.");
    // The Encounters' scope takes in no chance of the Quest's, however wide.
    const questWider = [sample([], [at('quest', 'fail', 0.05), at(0, 'failure', 0.01)])];
    expect(widest(questWider, 'moraleIn', 'encounters')).toMatchObject({ compared: { of: 0, what: 'failure' } });
    expect(estimateReport(questWider, { runs: 2_000, machine: machine(), startedAt: new Date(0), seconds: 1 })).toContain("The widest Encounter gap, reported, not held (DL-173, the owner's answer): estimate-0001, Encounter 1, failure: estimated 0.00%, resolved 1.00%, 1.00 points, within 3 points.");
  });

});
