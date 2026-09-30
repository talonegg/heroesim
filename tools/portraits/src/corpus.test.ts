import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { run } from './cli.js';
import { corpus } from './corpus.js';
import { diffJson, diffRun } from './diff.js';
import { writeRun } from './runs.js';
import { readJson, root, scratchRepository, status, writeJson } from './test-support.js';

// `corpus` and `diff` (v1.1.3-S3): what the `portrait-analyse` and `portrait-apply` skills read. Each
// counts or compares, and changes nothing.

const scratches: (() => void)[] = [];
afterEach(() => {
  for (const remove of scratches.splice(0)) remove();
});
function scratch(): string {
  const { dir, remove } = scratchRepository();
  scratches.push(remove);
  return dir;
}

/** A command line's exit code and JSON. */
async function cli(...argv: string[]): Promise<{ code: number; json: Record<string, unknown> }> {
  let out = '';
  const code = await run([...argv, '--json'], { out: (text) => (out += text), err: () => undefined });
  return { code, json: JSON.parse(out) as Record<string, unknown> };
}

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
    expect(result.pictures.map((picture) => [picture.key, picture.status, picture.listed, picture.bands, picture.picture, picture.row?.temper])).toEqual([
      ['gm-female-01', 'live', true, ['young'], { file: 'media/portraits/guildmasters/female/gm-female-01.webp', exists: true }, 'composed'],
      ['gm-male-01', 'live', true, ['older'], { file: 'media/portraits/guildmasters/male/gm-male-01.webp', exists: true }, 'stern'],
    ]);
    expect(result.counts.guildmaster).toEqual({ female: { young: 1, middle: 0, older: 0 }, male: { young: 0, middle: 0, older: 1 } });
    expect(result.counts.hero.warrior).toEqual({ female: { young: 0, middle: 0, older: 0 }, male: { young: 0, middle: 0, older: 0 } });
    expect(result.gaps).toContainEqual({ role: 'guildmaster', sex: 'male', band: 'young', count: 0 });
    expect(result.gaps).toContainEqual({ role: 'hero', sex: 'female', band: 'older', class: 'healer', count: 0 });
    expect(result.gaps.filter((gap) => gap.role === 'guildmaster')).toHaveLength(6);
    expect(result.gaps.filter((gap) => gap.role === 'hero')).toHaveLength(24);
  });

  test('names the unused vocabulary, the sentence keys short of three, and the content passing with its warnings', () => {
    const result = corpus(root);
    expect(result.vocabulary.tempers.used.stern).toEqual(['gm-male-01']);
    expect(result.vocabulary.tempers.unused).toEqual(['intense', 'calculating', 'wry', 'steady']);
    expect(result.vocabulary.features.unused).toEqual(['eyepatch', 'grey-hair']);
    expect(result.vocabulary.stations.unused).toEqual(['trade']);
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
    expect(result.sentences.short).toContainEqual({ list: 'biography.temperClosings', key: 'wry', count: 1 });
    expect(result.sentences.short.some((each) => each.list === 'biography.origins')).toBe(false);
    expect(result.overBounds).toEqual([]);
    expect(result.similar).toEqual([]);
    expect(result.content).toMatchObject({ ok: true, problems: [] });
    expect(result.content.warnings).toHaveLength(14);
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
    expect(sentences.lists).toContainEqual({ list: 'biography.temperClosings', key: 'wry', count: 3 });
    expect(corpus(dir).sentences.lists).toContainEqual({ list: 'biography.temperClosings', key: 'wry', count: 1 });
    expect(status(dir)).toBe(before);
  });

  test('with --draft, counts a write-run draft before it is written, and write-run refuses a draft that fails the content checks', async () => {
    const dir = scratch();
    const outside = mkdtempSync(path.join(tmpdir(), 'heroesim-draft-'));
    scratches.push(() => rmSync(outside, { recursive: true, force: true }));
    const good = path.join(outside, 'good.json');
    writeFileSync(good, JSON.stringify(runDraft(dir, (files) => void files.descriptions.biography.temperClosings.wry?.push('{He} laughs last.'))));
    const counted = await cli('corpus', '--draft', good, '--root', dir);
    expect(counted.code).toBe(0);
    expect(counted.json.source).toBe(good);
    expect((counted.json.sentences as { lists: unknown[] }).lists).toContainEqual({ list: 'biography.temperClosings', key: 'wry', count: 2 });

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
    scratches.push(() => rmSync(outside, { recursive: true, force: true }));
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
