import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import { run } from './cli.js';
import { corpus } from './corpus.js';
import { diffJson, diffRun } from './diff.js';
import { writeRun } from './runs.js';
import { cli, readJson, removeAfterTest, root, scratch, status, writeJson } from './test-support.js';

// `corpus` and `diff`: what the `portrait-analyse` and `portrait-apply` skills read. Each
// counts or compares, and changes nothing.


type Appearances = { features: Record<string, unknown>; portraits: Record<string, Record<string, unknown>> };
type Descriptions = { biography: { temperClosings: Record<string, string[]> }; tempers: string[] };

/** A run's draft: the content's three files, changed. */
function runDraft(dir: string, change: (files: { portraits: Record<string, Record<string, string[]>>; portraitAppearances: Appearances; descriptions: Descriptions }) => void) {
  const files = {
    portraits: readJson<Record<string, Record<string, string[]>>>(dir, 'content/portraits.json'),
    portraitAppearances: readJson<Appearances>(dir, 'content/portrait-appearances.json'),
    descriptions: readJson<Descriptions>(dir, 'content/descriptions.json'),
  };
  change(files);
  return { report: 'The analysis.', ...files };
}

describe('corpus', () => {
  test('lists each picture in the game with its files, row and bands, and counts them by role, sex and band', () => {
    const result = corpus(root);
    expect(result.source).toBe('content/');
    expect(result.bands).toEqual([
      { key: 'young', from: 0, to: 30 },
      { key: 'middle', from: 31, to: 40 },
      { key: 'older', from: 41, to: null },
    ]);
    // The game holds 40 pictures: gm-female-01..20 and gm-male-01..20.
    const pictures = result.pictures.map((picture) => [picture.key, picture.status, picture.listed, picture.bands, picture.picture, picture.row?.temper]);
    const numbered = (prefix: string): string[] => Array.from({ length: 20 }, (_, index) => `${prefix}-${String(index + 1).padStart(2, '0')}`);
    expect(pictures.map((picture) => picture[0])).toEqual([...numbered('gm-female'), ...numbered('gm-male')]);
    expect(pictures).toContainEqual(['gm-female-01', 'live', true, ['young'], { file: 'media/portraits/guildmasters/female/gm-female-01.webp', exists: true }, 'composed']);
    expect(pictures).toContainEqual(['gm-male-01', 'live', true, ['older'], { file: 'media/portraits/guildmasters/male/gm-male-01.webp', exists: true }, 'stern']);
    expect(result.pictures.every((picture) => picture.status === 'live' && picture.listed && picture.picture.exists)).toBe(true);
    expect(result.counts.guildmaster).toEqual({ female: { young: 10, middle: 13, older: 10 }, male: { young: 8, middle: 14, older: 12 } });
    expect(result.counts.hero.warrior).toEqual({ female: { young: 0, middle: 0, older: 0 }, male: { young: 0, middle: 0, older: 0 } });
    expect(result.gaps).toContainEqual({ role: 'hero', sex: 'female', band: 'older', class: 'healer', count: 0 });
    expect(result.gaps.filter((gap) => gap.role === 'guildmaster')).toHaveLength(0);
    expect(result.gaps.filter((gap) => gap.role === 'hero')).toHaveLength(24);
  });

  test('names the unused vocabulary, the sentence keys short of three, and the content passing with its warnings', () => {
    const result = corpus(root);
    expect(result.vocabulary.tempers.used.stern).toEqual(['gm-male-01', 'gm-male-04', 'gm-male-09', 'gm-male-18']);
    expect(result.vocabulary.tempers.unused).toEqual([]);
    expect(result.vocabulary.features.unused).toEqual(['eyepatch']);
    expect(result.vocabulary.stations.unused).toEqual([]);
    expect(result.sentences.wanted).toBe(3);
    const keys = result.sentences.lists.map((each) => `${each.list}${each.key === '' ? '' : `.${each.key}`}`);
    for (const key of [
      'biography.origins.young',
      'biography.stationOrigins.trade',
      'biography.callingCareers.lawyer.older',
      'biography.temperClosings.wry',
      'biography.traits.miser',
      'biography.backgrounds.old-charter',
      'biography.successors',
      'heroBiography.backgrounds.fallen-gentry',
      'heroBiography.classes.healer.middle',
      'heroBiography.traits.one-eyed',
      'heroBiography.closings.older',
    ]) {
      expect(keys).toContain(key);
    }
    // No key is short of three; one cut back to a sentence is named.
    expect(result.sentences.short).toEqual([]);
    const dir = scratch();
    const descriptions = readJson<Descriptions>(dir, 'content/descriptions.json');
    descriptions.biography.temperClosings.wry = descriptions.biography.temperClosings.wry?.slice(0, 1) ?? [];
    writeJson(dir, 'content/descriptions.json', descriptions);
    expect(corpus(dir).sentences.short).toEqual([{ list: 'biography.temperClosings', key: 'wry', count: 1 }]);
    expect(result.overBounds).toEqual([]);
    expect(result.similar).toEqual([]);
    expect(result.content).toMatchObject({ ok: true, problems: [] });
    expect(result.content.warnings).toHaveLength(8);
    expect(result.content.longest?.biography).toBeLessThanOrEqual(result.content.bounds.biography);
  });

  test('finds texts over their bounds, and similar pictures in the register, and reports the content failing', () => {
    const dir = scratch();
    const appearances = readJson<Appearances>(dir, 'content/portrait-appearances.json');
    const row = appearances.portraits['gm-male-01'] ?? {};
    row.narrative = `A face${', lined'.repeat(50)}.`;
    row.hooks = ['{He} once ' + 'walked far, '.repeat(14) + 'and home.', 'One.', 'Two.'];
    writeJson(dir, 'content/portrait-appearances.json', appearances);
    const registry = readJson<{ portraits: Record<string, { hash: string; trimmed: string[] }> }>(dir, 'media/portraits/registry.json');
    const male = registry.portraits['gm-male-01'];
    const female = registry.portraits['gm-female-01'];
    if (male === undefined || female === undefined) throw new Error('the register lacks its two pictures');
    female.hash = male.hash;
    writeJson(dir, 'media/portraits/registry.json', registry);

    const result = corpus(dir);
    expect(result.overBounds).toEqual([
      { key: 'gm-male-01', field: 'narrative', length: 357, limit: 260 },
      { key: 'gm-male-01', field: 'hooks', length: 3, limit: 2 },
      { key: 'gm-male-01', field: 'hooks.0', length: 185, limit: 160 },
    ]);
    expect(result.similar).toEqual([{ a: 'gm-female-01', b: 'gm-male-01', distance: 0 }]);
    expect(result.content.ok).toBe(false);
    expect(result.content.problems).toContain('portraitAppearances.portraits.gm-male-01.narrative is 357 characters; a narrative holds at most 260');
  });

  test("with --run, counts an analysis run's files in place of the content's, and changes nothing", async () => {
    const dir = scratch();
    const written = await writeRun(
      dir,
      runDraft(dir, (files) => {
        files.descriptions.biography.temperClosings.wry?.push('{He} laughs last.', '{He} laughs first.');
      }),
      { date: '2026-10-02' },
    );
    const before = status(dir);
    const { code, json } = await cli('corpus', '--run', written.run, '--root', dir);
    expect(code).toBe(0);
    expect(json.source).toBe('docs/portraits/analysis/2026-10-02/');
    const sentences = json.sentences as { lists: { list: string; key: string; count: number }[] };
    // The content's wry holds three sentences; the run's, two more.
    expect(sentences.lists).toContainEqual({ list: 'biography.temperClosings', key: 'wry', count: 5 });
    expect(corpus(dir).sentences.lists).toContainEqual({ list: 'biography.temperClosings', key: 'wry', count: 3 });
    expect(status(dir)).toBe(before);
  });

  test('with --draft, counts a write-run draft before it is written, and write-run refuses a draft that fails the content checks', async () => {
    const dir = scratch();
    const outside = mkdtempSync(path.join(tmpdir(), 'heroesim-draft-'));
    removeAfterTest(() => rmSync(outside, { recursive: true, force: true }));
    const good = path.join(outside, 'good.json');
    writeFileSync(good, JSON.stringify(runDraft(dir, (files) => void files.descriptions.biography.temperClosings.wry?.push('{He} laughs last.'))));
    const counted = await cli('corpus', '--draft', good, '--root', dir);
    expect(counted.code).toBe(0);
    expect(counted.json.source).toBe(good);
    expect((counted.json.sentences as { lists: unknown[] }).lists).toContainEqual({ list: 'biography.temperClosings', key: 'wry', count: 4 });

    const bad = path.join(outside, 'bad.json');
    writeFileSync(
      bad,
      JSON.stringify(
        runDraft(dir, (files) => {
          const row = files.portraitAppearances.portraits['gm-male-01'] ?? {};
          row.temper = 'cheerful';
        }),
      ),
    );
    const checked = await cli('corpus', '--draft', bad, '--root', dir);
    expect(checked.json.content).toMatchObject({ ok: false, problems: ['portraitAppearances.portraits.gm-male-01.temper: "cheerful" is not a temper defined in descriptions.tempers'] });
    const refused = await cli('write-run', bad, '--root', dir);
    expect(refused).toMatchObject({
      code: 1,
      json: {
        ok: false,
        kind: 'refused',
        problems: ['the recommended content fails its checks: portraitAppearances.portraits.gm-male-01.temper: "cheerful" is not a temper defined in descriptions.tempers'],
      },
    });
    expect(status(dir)).toBe('');
    expect(await cli('corpus', '--draft', good, '--run', '2026-10-02', '--root', dir)).toMatchObject({ code: 1, json: { kind: 'refused' } });
  });

  test('refuses a run that is not there', async () => {
    const dir = scratch();
    const { code, json } = await cli('corpus', '--run', '2026-10-09', '--root', dir);
    expect(code).toBe(1);
    expect(json).toMatchObject({ ok: false, kind: 'refused' });
    expect(json.problems).toContain('docs/portraits/analysis/2026-10-09/portraits.json does not exist');
  });
});

describe('diffJson()', () => {
  test("names each key added, removed and changed by its path, each list item added or removed, and a list's new order", () => {
    expect(
      diffJson(
        { a: { b: 1, c: 'x' }, list: ['one', 'two'], order: ['p', 'q'], rows: [{ n: 1 }], gone: true },
        { a: { b: 2, c: 'x', d: [1] }, list: ['two', 'three'], order: ['q', 'p'], rows: [{ n: 2 }] },
      ),
    ).toEqual([
      { path: 'a.b', kind: 'changed', before: 1, after: 2 },
      { path: 'a.d', kind: 'added', after: [1] },
      { path: 'list', kind: 'removed', before: 'one' },
      { path: 'list', kind: 'added', after: 'three' },
      { path: 'order', kind: 'reordered', before: ['p', 'q'], after: ['q', 'p'] },
      { path: 'rows', kind: 'changed', before: [{ n: 1 }], after: [{ n: 2 }] },
      { path: 'gone', kind: 'removed', before: true },
    ]);
    expect(diffJson({ a: [1, 2] }, { a: [1, 2] })).toEqual([]);
  });
});

describe('diff', () => {
  test("gives what applying a run would change in each file, path by path, and changes nothing", async () => {
    const dir = scratch();
    const written = await writeRun(
      dir,
      runDraft(dir, (files) => {
        const row = files.portraitAppearances.portraits['gm-female-01'] ?? {};
        row.temper = 'wry';
        files.descriptions.biography.temperClosings.wry?.push('{He} laughs last.');
      }),
      { date: '2026-10-02' },
    );
    const before = status(dir);
    expect(diffRun(dir, written.run).files).toEqual([
      { file: 'content/portraits.json', from: 'docs/portraits/analysis/2026-10-02/portraits.json', changes: [] },
      {
        file: 'content/portrait-appearances.json',
        from: 'docs/portraits/analysis/2026-10-02/portrait-appearances.json',
        changes: [{ path: 'portraits.gm-female-01.temper', kind: 'changed', before: 'composed', after: 'wry' }],
      },
      {
        file: 'content/descriptions.json',
        from: 'docs/portraits/analysis/2026-10-02/descriptions.json',
        changes: [{ path: 'biography.temperClosings.wry', kind: 'added', after: '{He} laughs last.' }],
      },
    ]);
    const lines: string[] = [];
    expect(await run(['diff', written.run, '--root', dir], { out: (text) => lines.push(text), err: (text) => lines.push(text) })).toBe(0);
    expect(lines).toEqual([
      'content/portraits.json ← docs/portraits/analysis/2026-10-02/portraits.json: no change',
      'content/portrait-appearances.json ← docs/portraits/analysis/2026-10-02/portrait-appearances.json: 1 change',
      '  ~ portraits.gm-female-01.temper: "composed" → "wry"',
      'content/descriptions.json ← docs/portraits/analysis/2026-10-02/descriptions.json: 1 change',
      '  + biography.temperClosings.wry: "{He} laughs last."',
    ]);
    expect(status(dir)).toBe(before);
  });

  test('follows write-run through the command line, as the portrait-analyse skill calls it, from a draft outside the tree', async () => {
    const dir = scratch();
    const outside = mkdtempSync(path.join(tmpdir(), 'heroesim-draft-'));
    removeAfterTest(() => rmSync(outside, { recursive: true, force: true }));
    const draft = path.join(outside, 'analysis.json');
    writeFileSync(draft, JSON.stringify(runDraft(dir, (files) => void files.descriptions.biography.temperClosings.stern?.push('{He} keeps accounts.'))));
    const written = await cli('write-run', draft, '--date', '2026-10-03', '--root', dir);
    expect(written).toMatchObject({ code: 0, json: { ok: true, run: '2026-10-03', report: 'docs/portraits/analysis/2026-10-03.md' } });
    const diffed = await cli('diff', '2026-10-03', '--root', dir);
    expect(diffed.code).toBe(0);
    expect((diffed.json.files as { changes: unknown[] }[]).map((file) => file.changes)).toEqual([
      [],
      [],
      [{ path: 'biography.temperClosings.stern', kind: 'added', after: '{He} keeps accounts.' }],
    ]);
    expect(status(dir).split('\n').filter(Boolean).every((line) => line.startsWith('?? docs/portraits/analysis/'))).toBe(true);
  });

  test('refuses a run that is not there, or not named by a date, and wants a run', async () => {
    const dir = scratch();
    expect(await cli('diff', '2026-10-09', '--root', dir)).toMatchObject({ code: 1, json: { ok: false, kind: 'refused' } });
    expect(await cli('diff', 'latest', '--root', dir)).toMatchObject({ code: 1, json: { ok: false, kind: 'refused' } });
    expect(await cli('diff', '--root', dir)).toMatchObject({ code: 2, json: { ok: false, kind: 'usage' } });
  });
});
