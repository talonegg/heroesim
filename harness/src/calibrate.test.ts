import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { contentDir, readSource } from '@heroesim/content/node';
import { defaultConfig, degrees, describeQuery, estimateQuest, offeredTiers, type EngineDeps, type NumQuery, type Quest } from '@heroesim/engine';
import { afterAll, describe, expect, test } from 'vitest';
import {
  calibrate,
  calibrateTemplates,
  checksAtLeast,
  coverageGrid,
  defaultCalibration,
  difficultyRange,
  draftsDir,
  encounterDegrees,
  formatJson,
  heroPool,
  kindsAtLeast,
  loadDrafts,
  statsAdded,
  thirdOf,
  tunedFactors,
  writeTunedEncounters,
} from './calibrate.js';
import { drawer } from './estimate.js';
import { coreDeps as deps, twentyDays as years } from './harness.test-support.js';
import { recordGame } from './play.js';
import { defaultPolicyConfig } from './policy.js';
import { runShard } from './shard.js';

// DL-162: the calibration's parts, on small samples. The calibration proper is
// `npm run harness -- calibrate` (calibrate.harness.test.ts), which writes docs/quests/calibration.md.

const scratch = mkdtempSync(join(tmpdir(), 'heroesim-calibrate-'));

/** The rows of the folder `source` in the content directory `dir`, by key (DL-260). */
function rowsOf(dir: string, source: `${string}/`): Record<string, unknown> {
  return Object.fromEntries(Object.entries(readSource(dir, source)).map(([name, text]) => [name.slice(source.length, -'.json'.length), JSON.parse(text) as unknown]));
}

/** `rows` written into the folder `source` of `dir`, a file a row. */
function writeRows(dir: string, source: `${string}/`, rows: Record<string, unknown>): void {
  mkdirSync(join(dir, source), { recursive: true });
  for (const [key, row] of Object.entries(rows)) writeFileSync(join(dir, source, `${key}.json`), JSON.stringify(row), 'utf8');
}

afterAll(() => rmSync(scratch, { recursive: true, force: true }));

describe('loadDrafts', () => {
  test('takes each content file the directory holds in place of the core file of its name, and validates the whole', () => {
    const drafts = mkdtempSync(join(scratch, 'skills-'));
    const skills = JSON.parse(readFileSync(join(contentDir, 'skills.json'), 'utf8')) as Record<string, { name: string }>;
    (skills['stealth'] as { name: string }).name = 'Stealth in the drafts';
    writeFileSync(join(drafts, 'skills.json'), JSON.stringify(skills), 'utf8');
    writeFileSync(join(drafts, 'notes.json'), '{}', 'utf8');
    const { content, drafted } = loadDrafts(drafts);
    expect(drafted).toEqual(['skills.json']);
    expect(content.skills['stealth']?.name).toBe('Stealth in the drafts');
    expect(content.questTemplates).toEqual(deps.content.questTemplates);
  });

  // DL-260: a folder drafted is taken whole, in place of the core's.
  test("takes a folder the directory holds in place of the core's folder of its name, whole", () => {
    const drafts = mkdtempSync(join(scratch, 'encounters-'));
    const encounters = rowsOf(contentDir, 'encounters/') as Record<string, { name: string }>;
    (encounters['ambush-on-the-road'] as { name: string }).name = 'Ambush in the drafts';
    writeRows(drafts, 'encounters/', encounters);
    const { content, drafted } = loadDrafts(drafts);
    expect(drafted).toEqual(['encounters/']);
    expect(content.encounters['ambush-on-the-road']?.name).toBe('Ambush in the drafts');
    expect(Object.keys(content.encounters)).toEqual(Object.keys(deps.content.encounters));
    expect(content.questTemplates).toEqual(deps.content.questTemplates);

    const fewer = mkdtempSync(join(scratch, 'fewer-'));
    writeRows(fewer, 'items/', Object.fromEntries(Object.entries(rowsOf(contentDir, 'items/')).filter(([key]) => key !== 'short-sword')));
    expect(loadDrafts(fewer).content.items['short-sword']).toBeUndefined();
  });

  // The verification (DL-162): a directory named in error would otherwise run the core content as the drafts.
  test('refuses a directory that does not exist', () => {
    expect(() => loadDrafts(join(scratch, 'no-such-directory'))).toThrow(/no-such-directory.*is not a directory/);
  });

  test('refuses a directory that holds no content file', () => {
    const empty = mkdtempSync(join(scratch, 'empty-'));
    writeFileSync(join(empty, 'notes.json'), '{}', 'utf8');
    expect(() => loadDrafts(empty)).toThrow(/empty-.*holds no content file \(stats\.json, /);
  });

  // The verification (DL-162): the automatic buyer (`gearPurchase`) takes the dearest piece for a slot,
  // the lowest key on a tie, and the harness's player buys armour alone; so a new piece in the armour
  // slot, or at a core piece's price, would take the place of the Constitution armour it buys.
  test("the gear the drafts added, the core's now, never takes the armour slot, nor ties another piece's price in its slot", () => {
    const core = deps.content.items;
    const drafted = loadDrafts(draftsDir).content.items;
    const added = ['commonplace-book', 'reading-glass', 'signet-ring', 'officers-sash', 'courtiers-brooch', 'scholars-almanac'];
    for (const key of added) {
      const it = core[key] ?? expect.fail(key);
      expect(drafted[key], key).toEqual(it);
      if (it.kind !== 'gear') continue;
      expect(it.slot, key).not.toBe('armour');
      const prices = Object.values(core).filter((other) => other.kind === 'gear' && other.slot === it.slot && other.key !== key).map((other) => other.buyPrice);
      expect(prices, key).not.toContain(it.buyPrice);
    }
  });

  test('with no directory, is the core content', () => {
    const { content, drafted } = loadDrafts(null);
    expect(drafted).toEqual([]);
    expect(content).toEqual(deps.content);
  });

  test("the drafts in docs/quests/drafts load and meet the coverage gate (the epic's S9)", () => {
    const { content, drafted } = loadDrafts(draftsDir);
    expect(drafted).toContain('encounters/');
    expect(coverageGrid(content).filter((it) => !it.met).map((it) => it.statKey)).toEqual([]);
  });
});

// Three games of twenty Days, two through a shard, under the whole suite's load given long (DL-164):
// the drafts' Checks, twice as hard, differ from the core's once the first Quest resolves.
describe('a play shard with drafts (HEROESIM_DRAFTS)', { timeout: 60_000 }, () => {
  test('plays the content with the drafts its job names, as this process plays it, and otherwise the core', async () => {
    const job = { seeds: ['seed-0001'], config: deps.config, years, validate: false, policy: defaultPolicyConfig };
    // Drafts that differ from the core, which holds the drafts' gear: every Check twice as hard.
    const dir = mkdtempSync(join(scratch, 'harder-'));
    const encounters = rowsOf(contentDir, 'encounters/') as Record<string, { checks: { difficultyFactor: number }[] }>;
    for (const encounter of Object.values(encounters)) for (const check of encounter.checks) check.difficultyFactor *= 2;
    writeRows(dir, 'encounters/', encounters);
    const drafted = await runShard({ ...job, drafts: dir });
    const here = await recordGame('seed-0001', { config: deps.config, content: loadDrafts(dir).content }, { years });
    expect(drafted.games[0]?.measures.fingerprint).toBe(here.record.measures.fingerprint);
    expect((await runShard(job)).games[0]?.measures.fingerprint).not.toBe(here.record.measures.fingerprint);
  });
});

describe('statsAdded', () => {
  const added = (query: NumQuery) => statsAdded(describeQuery(query));

  test('reads the Stats a score adds, not those it chooses or filters by', () => {
    // "Wits of the least agile Hero" (DL-148's example): adds Wits; Dexterity only chooses.
    expect(added(['of', ['worst', 'party', ['stat', 'dexterity']], ['stat', 'wits']])).toEqual(['wits']);
    expect(added(['max', ['where', 'party', ['>=', ['stat', 'courage'], 12]], ['stat', 'strength']])).toEqual(['strength']);
    expect(added(['sum', ['top', 'party', 2, ['stat', 'intelligence']], ['stat', 'knowledge']])).toEqual(['knowledge']);
    expect(added(['count', ['where', 'party', ['>=', ['stat', 'strength'], 12]]])).toEqual([]);
  });

  test('reads a weighting by its Stats of a weight other than 0, arithmetic, rankings and Nums', () => {
    expect(added(['avg', 'party', ['weighted', [['wits', 0.5], ['perception', 0], ['charisma', 0.5]]]])).toEqual(['wits', 'charisma']);
    expect(added(['ranked', 'party', ['+', ['stat', 'power'], ['level']], [1, 0.5]])).toEqual(['power']);
    expect(added(['+', ['max', 'party', ['stat', 'arcana']], ['*', 0.5, ['min', 'party', ['stat', 'arcana']]], ['sum', 'party', ['stat', 'spirit']]])).toEqual(['arcana', 'spirit']);
  });
});

describe('coverageGrid', () => {
  test("counts each Hero Stat's Checks by kind, and the gate of three Checks across two kinds", () => {
    expect([checksAtLeast, kindsAtLeast]).toEqual([3, 2]);
    const grid = coverageGrid(deps.content);
    expect(grid.map((it) => it.statKey)).toEqual(Object.values(deps.content.stats).filter((it) => it.owner === 'hero').map((it) => it.key));
    // The core content: every Stat meets the gate.
    expect(grid.filter((it) => !it.met)).toEqual([]);
    // Three Encounters alone, whatever else the content holds (DL-272): Endurance read by Hold the line's
    // Stamina and The last assault's Holding out (combat) and The long march's Pace (travel), meeting it.
    const three = Object.fromEntries(['hold-the-line', 'the-last-assault', 'the-long-march'].map((key) => [key, deps.content.encounters[key] ?? expect.fail(key)]));
    const endurance = coverageGrid({ ...deps.content, encounters: three }).find((it) => it.statKey === 'endurance');
    expect(endurance?.byKind.combat).toEqual(['hold-the-line/stamina', 'the-last-assault/holding-out']);
    expect(endurance?.byKind.travel).toEqual(['the-long-march/pace']);
    expect([endurance?.checks, endurance?.kinds, endurance?.met]).toEqual([3, 2, true]);
    // One Encounter alone meets it for no Stat: Ambush on the road's Steel reads Strength once, in combat.
    const ambush = deps.content.encounters['ambush-on-the-road'] ?? expect.fail('ambush-on-the-road');
    const alone = coverageGrid({ ...deps.content, encounters: { 'ambush-on-the-road': ambush } });
    const strength = alone.find((it) => it.statKey === 'strength');
    expect(strength?.byKind.combat).toEqual(['ambush-on-the-road/steel']);
    expect([strength?.checks, strength?.kinds, strength?.met]).toEqual([1, 1, false]);
    expect(alone.filter((it) => it.met)).toEqual([]);
  });
});

describe('difficultyRange', () => {
  test('runs from the bottom of the lowest Tier a template offers to the top of the highest, its overrides read (DL-262)', () => {
    const barrow = deps.content.questTemplates['clear-the-barrow'] ?? expect.fail('clear-the-barrow');
    const [, second, third] = deps.config.tiers;
    expect(difficultyRange({ ...barrow, tierMin: 2, tierMax: 3 }, deps.config)).toEqual({ difficultyMin: second?.difficultyMin, difficultyMax: third?.difficultyMax });
    expect(difficultyRange({ ...barrow, tierMin: 2, tierMax: 3, overrides: { '3': { difficultyMax: 99 } } }, deps.config)).toEqual({
      difficultyMin: second?.difficultyMin,
      difficultyMax: 99,
    });
  });
});

describe('thirdOf', () => {
  test("is the third of a template's difficulty range a difficulty falls in", () => {
    const template = { difficultyMin: 30, difficultyMax: 60 };
    expect([30, 39, 40, 49, 50, 60].map((d) => thirdOf(template, d))).toEqual(['low', 'low', 'mid', 'mid', 'high', 'high']);
    expect(thirdOf({ difficultyMin: 40, difficultyMax: 40 }, 40)).toBe('low');
  });
});

describe('formatJson', () => {
  test('writes JSON that reads back as written, a Query on one line', () => {
    const { content } = loadDrafts(draftsDir);
    const json = rowsOf(draftsDir, 'encounters/');
    const text = formatJson(json);
    expect(JSON.parse(text)).toEqual(json);
    const score = JSON.stringify(content.encounters['the-strongroom']?.checks[0]?.score);
    expect(text.split('\n').some((line) => line.includes(`"score": ${score}`))).toBe(true);
  });
});

// DL-162's tuning writes each drafted Encounter's file back (DL-260): with a final newline, as the
// drafts are written, and a file whose numbers the tuning keeps byte for byte as it was.
describe('writeTunedEncounters', () => {
  test('writes each tuned file ending in a newline, its numbers in, and leaves a file it does not tune as it was', () => {
    const dir = join(scratch, 'tuned-drafts');
    const rows = rowsOf(draftsDir, 'encounters/') as Record<string, { checks: { key: string; flat?: number; difficultyFactor: number }[] }>;
    const [kept, moved, untuned] = Object.keys(rows).sort();
    if (kept === undefined || moved === undefined || untuned === undefined) throw new Error('fewer than three drafted Encounters');
    mkdirSync(join(dir, 'encounters'), { recursive: true });
    // The untuned file in a layout the write-back would not give it, so that rewriting it shows.
    const texts = Object.fromEntries([kept, moved, untuned].map((key) => [key, key === untuned ? `${JSON.stringify(rows[key], null, 4)}\n` : `${formatJson(rows[key])}\n`]));
    for (const [key, text] of Object.entries(texts)) writeFileSync(join(dir, 'encounters', `${key}.json`), text);
    const keptChecks = Object.fromEntries((rows[kept]?.checks ?? []).map((it) => [it.key, { difficultyFactor: it.difficultyFactor, ...(it.flat === undefined ? {} : { flat: it.flat }) }]));
    const movedChecks = Object.fromEntries((rows[moved]?.checks ?? []).map((it) => [it.key, { difficultyFactor: 0.123 }]));

    writeTunedEncounters(dir, { [kept]: keptChecks, [moved]: movedChecks });

    const read = (key: string): string => readFileSync(join(dir, 'encounters', `${key}.json`), 'utf8');
    expect(read(kept)).toBe(texts[kept]);
    expect(read(untuned)).toBe(texts[untuned]);
    expect(read(moved).endsWith('}\n')).toBe(true);
    expect((JSON.parse(read(moved)) as { checks: { difficultyFactor: number }[] }).checks.every((it) => it.difficultyFactor === 0.123)).toBe(true);
  });

  test("refuses a drafts directory without an encounters folder, naming it", () => {
    const dir = join(scratch, 'no-encounters');
    mkdirSync(dir, { recursive: true });
    expect(() => writeTunedEncounters(dir, {})).toThrow(/no encounters\/ folder/);
  });
});

// Tunings and a calibration over a pool of Heroes, each Encounter estimated over many Parties: up to three
// seconds a test alone, more than the default 5 s under the whole suite's load (DL-164).
describe('the rates', { timeout: 60_000 }, () => {
  const { content } = loadDrafts(draftsDir);
  const drafts: EngineDeps = { config: { ...defaultConfig }, content };
  const pool = heroPool('calibrate-test', 5, 40, drafts);

  test("encounterDegrees is the estimate's own Encounter, of every pass formula, Check by Check", () => {
    const draw = drawer('calibrate-test-parties');
    const template = pool.world.quests[pool.world.board[0] as Quest['id']] as Quest;
    for (const encounter of Object.values(content.encounters)) {
      const heroes = Array.from(new Set(Array.from({ length: 3 }, () => pool.heroes[Math.floor(draw() * pool.heroes.length)]!)));
      const quest = { ...template, difficulty: 55, encounterKeys: [encounter.key], durationTurns: 3 };
      const estimate = estimateQuest(pool.world, quest, heroes, drafts)?.encounters[0];
      if (estimate === undefined) throw new Error(encounter.key);
      const worked = encounterDegrees(encounter, estimate.checks.map((it) => it.capability), estimate.checks.map((it) => it.target), drafts);
      for (const degree of degrees) expect(worked[degree], `${encounter.key} ${degree}`).toBeCloseTo(estimate.degrees[degree], 12);
    }
  });

  /** The content with each Check's tuning in place of its own: its factor, and its flat term or none. */
  const tunedDeps = (tuning: ReturnType<typeof tunedFactors>): EngineDeps => ({
    ...drafts,
    content: {
      ...content,
      encounters: Object.fromEntries(
        Object.entries(content.encounters).map(([key, it]) => [
          key,
          {
            ...it,
            checks: it.checks.map(({ flat, ...check }) => {
              const tuned = tuning[key]?.[check.key];
              return tuned === undefined ? { ...check, ...(flat === undefined ? {} : { flat }) } : { ...check, ...tuned };
            }),
          },
        ]),
      ),
    },
  });
  /** The drafts with `keys`' Encounters alone, for a tuning of those alone. */
  const only = (keys: readonly string[]): EngineDeps => ({ ...drafts, content: { ...content, encounters: Object.fromEntries(keys.map((key) => [key, content.encounters[key]!])) } });
  /** The Party set the tuning drew for `size`, read again. */
  const partiesOf = (level: number, size: number): (typeof pool.heroes)[] => {
    const draw = drawer(`calibrate-tune-${level}-${size}`);
    return Array.from({ length: 60 }, () => {
      const party: typeof pool.heroes = [];
      while (party.length < size) {
        const hero = pool.heroes[Math.floor(draw() * pool.heroes.length)]!;
        if (!party.includes(hero)) party.push(hero);
      }
      return party;
    });
  };
  /** The mean chance of a Success or better at `encounterKey` alone, at `difficulty`, over `parties`. */
  const successOf = (deps: EngineDeps, encounterKey: string, difficulty: number, parties: (typeof pool.heroes)[]): number => {
    const template = pool.world.quests[pool.world.board[0] as Quest['id']] as Quest;
    const quest = { ...template, difficulty, encounterKeys: [encounterKey], durationTurns: 3 };
    return parties.reduce((total, party) => total + (estimateQuest(pool.world, quest, party, deps)?.encounters[0]?.success ?? 0), 0) / Math.max(1, parties.length);
  };

  test('tunedFactors sets each Encounter so that Parties at the aim succeed with its chance', () => {
    const aim = { level: 5, size: 3, difficulty: 60, chance: 0.6 };
    const tuning = tunedFactors(pool, aim, 60, drafts);
    expect(Object.keys(tuning).sort()).toEqual(Object.keys(content.encounters).sort());
    for (const checks of Object.values(tuning)) for (const it of Object.values(checks)) expect(it.flat).toBeUndefined();
    // An Encounter every Party can score on is at the aim.
    expect(successOf(tunedDeps(tuning), 'ambush-on-the-road', aim.difficulty, partiesOf(aim.level, aim.size))).toBeCloseTo(aim.chance, 2);
  });

  // DL-162: a flat term, so the target grows more slowly than the difficulty.
  test('with a flat share, puts that share of each target at the aim into its flat term, and keeps the aim', () => {
    const aim = { level: 5, size: 3, difficulty: 60, chance: 0.6, flatShare: 0.5 };
    // Tuned over the one Encounter, to keep the test short.
    const tuning = tunedFactors(pool, aim, 60, only(['ambush-on-the-road']));
    for (const it of Object.values(tuning['ambush-on-the-road'] ?? {})) {
      expect((it.flat ?? 0) / ((it.flat ?? 0) + it.difficultyFactor * aim.difficulty)).toBeCloseTo(0.5, 2);
    }
    expect(successOf(tunedDeps(tuning), 'ambush-on-the-road', aim.difficulty, partiesOf(aim.level, aim.size))).toBeCloseTo(aim.chance, 2);
  });

  test("aims each Finale at the middle of its template's difficulties, with Parties of a size the template allows", () => {
    const aim = { level: 5, size: 3, difficulty: 60, chance: 0.6 };
    const finales = Object.values(content.questTemplates).flatMap((it) => (it.finale === undefined ? [] : [it.finale]));
    const tuning = tunedFactors(pool, aim, 60, only(finales));
    const tuned = tunedDeps(tuning);
    for (const template of Object.values(content.questTemplates).filter((it) => it.finale !== undefined)) {
      const range = difficultyRange(template, drafts.config);
      const middle = Math.round((range.difficultyMin + range.difficultyMax) / 2);
      const size = Math.max(aim.size, template.partySizeMin);
      const parties = partiesOf(aim.level, size);
      const finale = content.encounters[template.finale as string]!;
      const tunable = finale.checks.map((check) => check.raw !== true && check.difficultyFactor > 0);
      // At the aim over every Party, or over those that score on each Check where the aim is beyond the rest.
      const all = successOf(tuned, finale.key, middle, parties);
      const template0 = pool.world.quests[pool.world.board[0] as Quest['id']] as Quest;
      const quest = { ...template0, difficulty: middle, encounterKeys: [finale.key], beatLines: ['The last of it.'], durationTurns: 3 };
      const scoring = parties.filter((party) => estimateQuest(pool.world, quest, party, tuned)?.encounters[0]?.checks.every((it, at) => !tunable[at] || it.capability > 0));
      const near = Math.min(Math.abs(all - aim.chance), Math.abs(successOf(tuned, finale.key, middle, scoring) - aim.chance));
      expect(near, `${finale.key} at ${middle}`).toBeLessThan(0.01);
    }
  });

  test("draws each template's Quests over its whole difficulty range, every Tier it offers, whatever the pool's world has unlocked (DL-271)", () => {
    // The pool's world is a new one, its Guilds' best fours at Level 1, its Board's top Tier 1.
    const settings = { ...defaultCalibration, sizes: [2], parties: 10, questsPerTemplate: 24 };
    const spread = Object.values(content.questTemplates).filter((it) => offeredTiers(it, drafts.config).length >= 3);
    expect(spread.length).toBeGreaterThan(0);
    const results = calibrateTemplates([pool], settings, { ...drafts, content: { ...content, questTemplates: Object.fromEntries(spread.map((it) => [it.key, it])) } });
    for (const result of results) {
      if (result.rows.length === 0) continue;
      expect(new Set(result.rows.map((row) => row.third)), result.key).toEqual(new Set(['low', 'mid', 'high']));
    }
    expect(results.some((result) => result.rows.length > 0)).toBe(true);
  });

  test('a small calibration has every cell, each a chance of each Degree, and its spot-check holds to the resolver', () => {
    const settings = { ...defaultCalibration, levels: [1, 5], sizes: [1, 3], difficulties: [30, 70], pool: 30, parties: 6, questsPerTemplate: 2, spotSamples: 2, spotSeeds: 400 };
    const result = calibrate(settings, drafts, ['encounters/']);
    expect(result.encounters).toHaveLength(Object.keys(content.encounters).length);
    for (const encounter of result.encounters) {
      expect(encounter.cells).toHaveLength(2 * 2 * 2);
      for (const cell of [...encounter.cells, ...encounter.checks.flatMap((it) => it.cells)]) {
        expect(degrees.reduce((total, degree) => total + cell.degrees[degree], 0)).toBeCloseTo(1, 9);
      }
    }
    expect(result.templates.map((it) => it.key)).toEqual(Object.keys(content.questTemplates));
    expect(result.coverage.every((it) => it.met)).toBe(true);
    expect(result.spot.compared).toBeGreaterThan(0);
    expect(result.spot.widestErrors).toBeLessThan(5);
  });
});
