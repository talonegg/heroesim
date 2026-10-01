import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'vitest';
import { chromiumInstalled, launchChromium, type Chromium } from './chromium.js';
import { check } from './check.js';
import { run } from './cli.js';
import { contentChecks } from './content-checks.js';
import { readContentVersion } from './content-version.js';
import { DraftError, Undone } from './errors.js';
import { editJson } from './json-edit.js';
import { picturePaths, type Registry } from './registry.js';
import { apply, writeRun } from './runs.js';
import { git, noisePng, readJson, root, scratchRepository, status, upload, writeJson } from './test-support.js';
import { writeRows } from './write-rows.js';

// `write-rows` and `apply` (v1.1.3-S2): each one transaction on a scratch copy of the repository,
// made a git repository so that `git status` shows what each left behind.

const committedMale = picturePaths(root, 'guildmaster', 'male', 'gm-male-01').picture;
const committedFemale = picturePaths(root, 'guildmaster', 'female', 'gm-female-01').picture;

const scratches: (() => void)[] = [];
afterEach(() => {
  for (const remove of scratches.splice(0)) remove();
});
function scratch(): string {
  const { dir, remove } = scratchRepository();
  scratches.push(remove);
  return dir;
}

/**
 * A scratch copy held back to the owner's two pictures of v1.1.2, gm-female-01 and gm-male-01, and
 * committed: since v1.1.3-S4 the game holds gm-female-01..20 and gm-male-01..20, and these tests
 * take gm-male-02 or gm-female-02 as the next key. Each file keeps its layout, `portraits.json` the
 * one of v1.1.2, a role's lists on one line.
 */
function ownersTwo(): string {
  const dir = scratch();
  const owners = ['gm-female-01', 'gm-male-01'];
  const registry = readJson<Registry>(dir, 'media/portraits/registry.json');
  for (const [key, each] of Object.entries(registry.portraits)) {
    if (owners.includes(key)) continue;
    const paths = picturePaths(dir, each.role, each.sex, key);
    rmSync(paths.picture);
    rmSync(paths.thumbnail);
    delete registry.portraits[key];
  }
  writeJson(dir, 'media/portraits/registry.json', registry);
  const portraits = readJson<Record<string, Record<string, string[]>>>(dir, 'content/portraits.json');
  for (const sexes of Object.values(portraits)) {
    for (const [sex, keys] of Object.entries(sexes)) sexes[sex] = keys.filter((key) => owners.includes(key));
  }
  writeJson(dir, 'content/portraits.json', portraits);
  const file = path.join(dir, 'content/portrait-appearances.json');
  const text = readFileSync(file, 'utf8');
  const appearances = JSON.parse(text) as { portraits: Record<string, unknown> };
  for (const key of Object.keys(appearances.portraits)) if (!owners.includes(key)) delete appearances.portraits[key];
  writeFileSync(file, editJson(text, appearances));
  git(dir, 'add', '--all');
  git(dir, 'commit', '--quiet', '-m', "the owner's two");
  return dir;
}

/** A row that passes the content's checks, whatever their shape: a copy of a picture's own. */
function goodRow(dir: string, key = 'gm-male-01'): Record<string, unknown> {
  const row = readJson<{ portraits: Record<string, Record<string, unknown>> }>(dir, 'content/portrait-appearances.json').portraits[key];
  if (row === undefined) throw new Error(`${key} has no row`);
  return structuredClone(row);
}

/** A row that breaks a content check: a narrative far past any bound. */
function badRow(dir: string): Record<string, unknown> {
  return { ...goodRow(dir), narrative: 'A face. '.repeat(250) };
}

/** Lines added and removed in each changed file of a scratch repository, by `git diff --numstat`. */
function numstat(dir: string): Record<string, [number, number]> {
  return Object.fromEntries(
    git(dir, 'diff', '--numstat')
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const [added, removed, file] = line.split('\t');
        return [file ?? '', [Number(added), Number(removed)] as [number, number]];
      }),
  );
}

describe.skipIf(!chromiumInstalled())('write-rows', () => {
  let chromium: Chromium;
  beforeAll(async () => {
    chromium = await launchChromium();
  });
  afterAll(async () => {
    await chromium?.close();
  });

  test('with a row that breaks a content check, leaves the tree as it was, and the upload in the inbox', async () => {
    const dir = ownersTwo();
    const source = upload(dir, committedFemale, 'media/inbox/guildmaster/male/1790740777932.webp');
    const draft = { date: '2026-10-02', report: 'One picture, badly read.', pictures: [{ source, row: badRow(dir) }] };

    const failure = await writeRows(dir, draft, chromium).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(Undone);
    expect((failure as Undone).problems.some((problem) => problem.includes('gm-male-02'))).toBe(true);
    expect(status(dir)).toBe('');
    expect(existsSync(path.join(dir, source))).toBe(true);
    expect(existsSync(path.join(dir, 'docs'))).toBe(false);
    expect(existsSync(picturePaths(dir, 'guildmaster', 'male', 'gm-male-02').picture)).toBe(false);
  });

  test('with an upload that cannot fit second in the list, leaves the tree as it was, the first taken in and put back, and both uploads kept', async () => {
    const dir = ownersTwo();
    const first = upload(dir, committedMale, 'media/inbox/guildmaster/male/g.webp');
    const second = 'media/inbox/guildmaster/male/noise.png';
    mkdirSync(path.dirname(path.join(dir, second)), { recursive: true });
    writeFileSync(path.join(dir, second), noisePng(480, 640));
    const draft = { date: '2026-10-02', report: 'Two pictures.', pictures: [{ source: first, row: goodRow(dir) }, { source: second, row: goodRow(dir) }] };

    const failure = await writeRows(dir, draft, chromium).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(Undone);
    expect((failure as Undone).problems).toEqual([expect.stringMatching(/^media\/inbox\/guildmaster\/male\/noise\.png: its picture is \d+ bytes at quality 0\.5, over the 120000 allowed; it is refused$/)]);
    expect(status(dir)).toBe('');
    expect(existsSync(path.join(dir, first))).toBe(true);
    expect(existsSync(path.join(dir, second))).toBe(true);
    expect(existsSync(picturePaths(dir, 'guildmaster', 'male', 'gm-male-02').picture)).toBe(false);
    expect(existsSync(picturePaths(dir, 'guildmaster', 'male', 'gm-male-02').thumbnail)).toBe(false);
    expect(existsSync(path.join(dir, 'docs'))).toBe(false);
  });

  test('through the command line, says it was undone, in JSON, with exit code 1', async () => {
    const dir = scratch();
    const source = upload(dir, committedFemale, 'media/inbox/guildmaster/female/a.webp');
    const draftFile = path.join(dir, 'media', 'inbox', 'draft.json');
    writeJson(dir, 'media/inbox/draft.json', { report: 'Bad.', pictures: [{ source, row: badRow(dir) }] });
    let out = '';
    const code = await run(['write-rows', draftFile, '--root', dir, '--json'], { out: (text) => (out += text), err: () => undefined });
    expect(code).toBe(1);
    expect(JSON.parse(out)).toMatchObject({ ok: false, kind: 'undone' });
    expect(status(dir)).toBe('');
  });

  test('takes an upload in: its picture, thumbnail, register entry and rows, the content version, the report, and the upload deleted', async () => {
    const dir = ownersTwo();
    const before = readContentVersion(dir);
    const source = upload(dir, committedMale, 'media/inbox/guildmaster/male/1790763974495.webp');
    const row = goodRow(dir);
    const draft = { report: 'The reader read {{key:0}} as a man of middle years; the checker agreed.', pictures: [{ source, row }] };

    const intake = await writeRows(dir, draft, chromium, { date: '2026-10-02' });

    expect(intake.run).toBe('2026-10-02');
    expect(intake.pictures.map((each) => each.key)).toEqual(['gm-male-02']);
    expect(intake.contentVersion).toEqual({ from: before, to: before + 1 });
    expect(readContentVersion(dir)).toBe(before + 1);
    expect(readFileSync(path.join(dir, 'content/src/content.test.ts'), 'utf8')).toContain(`expect(content.version).toBe(${before + 1});`);
    const registry = readJson<Registry>(dir, 'media/portraits/registry.json');
    expect(registry.portraits['gm-male-02']).toMatchObject({ role: 'guildmaster', sex: 'male', status: 'live' });
    expect(readJson<Record<string, Record<string, string[]>>>(dir, 'content/portraits.json').guildmaster?.male).toEqual(['gm-male-01', 'gm-male-02']);
    expect(readJson<{ portraits: Record<string, unknown> }>(dir, 'content/portrait-appearances.json').portraits['gm-male-02']).toEqual(row);
    const report = readFileSync(path.join(dir, 'docs/portraits/intake/2026-10-02.md'), 'utf8');
    expect(report).toContain('# Portrait intake 2026-10-02');
    expect(report).toContain('The reader read gm-male-02 as a man of middle years');
    expect(report).toContain('| `media/inbox/guildmaster/male/1790763974495.webp` | `gm-male-02` | Guildmaster | Male |');
    expect(existsSync(path.join(dir, source))).toBe(false);
    expect(check(dir)).toMatchObject({ ok: true, live: 3 });
    expect(contentChecks(dir)).toEqual({ ok: true, problems: [] });
    expect(status(dir).split('\n').filter(Boolean).sort()).toEqual(
      [
        ' M content/portrait-appearances.json',
        ' M content/portraits.json',
        ' M content/src/content.test.ts',
        ' M content/src/parse.ts',
        ' M media/portraits/registry.json',
        '?? docs/portraits/intake/2026-10-02.md',
        '?? media/portraits/guildmasters/male/gm-male-02.thumb.webp',
        '?? media/portraits/guildmasters/male/gm-male-02.webp',
      ].sort(),
    );
    // Each content file keeps its layout: the key joins its role's line, and the row is added below
    // the last, whose closing brace alone gains a comma (a row copied from the one above may show as
    // its lines added whole, the comma sliding with them). A field on a line each, and the hooks, which
    // gm-male-01's row has since v1.1.3-S4, opened out a sentence to a line.
    const hooks = Array.isArray(row.hooks) ? row.hooks.length + 1 : 0;
    const rowLines = Object.keys(row).length + 2 + hooks;
    const changed = numstat(dir);
    expect(changed['content/portraits.json']).toEqual([1, 1]);
    const [added, removed] = changed['content/portrait-appearances.json'] ?? [0, 0];
    expect(added - removed).toBe(rowLines);
    expect(removed).toBeLessThanOrEqual(1);

    // A second intake that day is its -2, and takes the next key.
    const second = upload(dir, committedFemale, 'media/inbox/guildmaster/b.webp');
    const again = await writeRows(dir, { report: 'Another.', pictures: [{ source: second, sex: 'female', row: goodRow(dir, 'gm-female-01') }] }, chromium, { date: '2026-10-02' });
    expect(again.run).toBe('2026-10-02-2');
    expect(again.pictures.map((each) => each.key)).toEqual(['gm-female-02']);
  });

  test('never gives a retired key again: the next is past it', async () => {
    const dir = ownersTwo();
    const registry = readJson<Registry>(dir, 'media/portraits/registry.json');
    const male = registry.portraits['gm-male-01'];
    if (male === undefined) throw new Error('no gm-male-01');
    registry.portraits['gm-male-02'] = { ...male, status: 'retired' };
    writeJson(dir, 'media/portraits/registry.json', registry);
    const source = upload(dir, committedMale, 'media/inbox/guildmaster/male/c.webp');

    const intake = await writeRows(dir, { report: 'After a retirement.', pictures: [{ source, row: goodRow(dir) }] }, chromium, { date: '2026-10-02' });

    expect(intake.pictures.map((each) => each.key)).toEqual(['gm-male-03']);
    expect(readJson<Registry>(dir, 'media/portraits/registry.json').portraits['gm-male-02']?.status).toBe('retired');
  });

  test('records where the draft reads a sex other than its inbox folder says', async () => {
    const dir = ownersTwo();
    const source = upload(dir, committedFemale, 'media/inbox/guildmaster/male/d.webp');
    const intake = await writeRows(dir, { report: 'Read as a woman.', pictures: [{ source, sex: 'female', row: goodRow(dir, 'gm-female-01') }] }, chromium, { date: '2026-10-02' });
    expect(intake.pictures[0]).toMatchObject({ key: 'gm-female-02', folderSex: 'male' });
    expect(readFileSync(path.join(dir, intake.report), 'utf8')).toContain('| Female (its folder says male) |');
  });

  test('with no picture to take, writes only the report', async () => {
    const dir = scratch();
    const intake = await writeRows(dir, { report: 'Both uploads are duplicates of gm-male-01 and gm-female-01, left in the inbox.', pictures: [] }, chromium, { date: '2026-10-02' });
    expect(intake).toMatchObject({ run: '2026-10-02', contentVersion: null, pictures: [] });
    expect(status(dir)).toBe('?? docs/portraits/intake/2026-10-02.md\n');
  });

  test('refuses a draft it cannot take before changing anything, naming each problem', async () => {
    const dir = scratch();
    upload(dir, committedMale, 'media/inbox/guildmaster/e.webp');
    upload(dir, committedMale, 'media/f.webp');
    const failure = await writeRows(
      dir,
      {
        report: '',
        pictures: [
          { source: 'media/inbox/guildmaster/e.webp', row: goodRow(dir) },
          { source: 'media/f.webp', sex: 'male', row: goodRow(dir) },
          { source: 'media/inbox/hero/missing.webp', sex: 'male', row: {} },
          { source: 'media/inbox/guildmaster/e.webp', sex: 'female', role: 'hero', row: 'no' },
        ],
      },
      chromium,
    ).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(DraftError);
    expect((failure as DraftError).problems).toEqual([
      "report: the report's text is wanted",
      'pictures[0].sex: wanted, since its inbox folder has no male/ or female/',
      'pictures[1].source: media/f.webp is not in media/inbox/<role>/, which says its role',
      'pictures[2].source: media/inbox/hero/missing.webp does not exist',
      'pictures[3].source: media/inbox/guildmaster/e.webp is named twice',
      'pictures[3].role: hero, and its inbox folder says guildmaster',
      "pictures[3].row: the picture's row, an object, is wanted",
    ]);
    expect(status(dir)).toBe('?? media/f.webp\n');
  });
});

describe('write-run and apply', () => {
  /** A run's draft: the content's own three files, the given one changed. */
  function runDraft(dir: string, change: (files: { portraits: Record<string, Record<string, string[]>>; portraitAppearances: { portraits: Record<string, Record<string, unknown>> }; descriptions: unknown }) => void) {
    const files = {
      portraits: readJson<Record<string, Record<string, string[]>>>(dir, 'content/portraits.json'),
      portraitAppearances: readJson<{ portraits: Record<string, Record<string, unknown>> }>(dir, 'content/portrait-appearances.json'),
      descriptions: readJson<unknown>(dir, 'content/descriptions.json'),
    };
    change(files);
    return { report: 'The analysis.', ...files };
  }

  test('write-run writes a report and its three files, naming a second run on a day -2, and changes nothing live', async () => {
    const dir = scratch();
    const first = await writeRun(dir, runDraft(dir, () => undefined), { date: '2026-10-02' });
    const second = await writeRun(dir, runDraft(dir, () => undefined), { date: '2026-10-02' });
    expect(first.run).toBe('2026-10-02');
    expect(second.run).toBe('2026-10-02-2');
    expect(second.files).toEqual([
      'docs/portraits/analysis/2026-10-02-2.md',
      'docs/portraits/analysis/2026-10-02-2/portraits.json',
      'docs/portraits/analysis/2026-10-02-2/portrait-appearances.json',
      'docs/portraits/analysis/2026-10-02-2/descriptions.json',
    ]);
    expect(readFileSync(path.join(dir, second.report), 'utf8')).toBe('# Portrait analysis 2026-10-02-2\n\nThe analysis.\n');
    expect(status(dir).split('\n').filter(Boolean).every((line) => line.startsWith('?? docs/portraits/analysis/'))).toBe(true);
  });

  test('apply puts a run in place and raises the content version', async () => {
    const dir = scratch();
    const before = readContentVersion(dir);
    const written = await writeRun(
      dir,
      runDraft(dir, (files) => {
        const row = files.portraitAppearances.portraits['gm-male-01'];
        if (row !== undefined) row.narrative = 'A weathered face, and eyes that have seen the road.';
      }),
      { date: '2026-10-02' },
    );
    const applied = await apply(dir, written.run);
    expect(applied).toEqual({ run: '2026-10-02', changed: ['content/portrait-appearances.json'], contentVersion: { from: before, to: before + 1 } });
    expect(readJson<{ portraits: Record<string, { narrative: string }> }>(dir, 'content/portrait-appearances.json').portraits['gm-male-01']?.narrative).toBe(
      'A weathered face, and eyes that have seen the road.',
    );
    expect(readFileSync(path.join(dir, 'content/src/parse.ts'), 'utf8')).toContain(
      `${before + 1} from the portrait tool's apply of analysis run 2026-10-02 (\`docs/portraits/analysis/2026-10-02.md\`).`,
    );
    // The same run again changes nothing.
    expect(await apply(dir, written.run)).toEqual({ run: '2026-10-02', changed: [], contentVersion: null });
  });

  test("apply keeps each file's layout: a run equal to the content in another layout changes nothing, and one sentence more changes only the lines about it", async () => {
    const dir = scratch();
    const same = await writeRun(dir, runDraft(dir, () => undefined), { date: '2026-10-02' });
    for (const name of ['portraits.json', 'portrait-appearances.json', 'descriptions.json']) {
      const file = path.join(dir, 'docs/portraits/analysis', same.run, name);
      writeFileSync(file, JSON.stringify(JSON.parse(readFileSync(file, 'utf8')), null, 4));
    }
    expect(await apply(dir, same.run)).toMatchObject({ changed: [], contentVersion: null });
    expect(git(dir, 'diff')).toBe('');

    const more = await writeRun(
      dir,
      runDraft(dir, (files) => {
        const closings = (files.descriptions as { biography: { temperClosings: Record<string, string[]> } }).biography.temperClosings;
        closings.stern = [...(closings.stern ?? []), '{He} keeps {his} word, and expects the same of everyone.'];
      }),
      { date: '2026-10-02' },
    );
    // Through the command line, as the portrait-apply skill calls it.
    let out = '';
    expect(await run(['apply', more.run, '--root', dir, '--json'], { out: (text) => (out += text), err: () => undefined })).toBe(0);
    expect(JSON.parse(out)).toMatchObject({ ok: true, run: more.run, changed: ['content/descriptions.json'] });
    expect(numstat(dir)).toEqual({
      'content/descriptions.json': [2, 1],
      'content/src/content.test.ts': [1, 1],
      'content/src/parse.ts': [2, 1],
    });
  });

  test("write-run writes a run's files in the content's own layout, so each differs from it only where it changes", async () => {
    const dir = scratch();
    const written = await writeRun(dir, runDraft(dir, () => undefined), { date: '2026-10-02' });
    for (const name of ['portraits.json', 'portrait-appearances.json', 'descriptions.json']) {
      expect(readFileSync(path.join(dir, 'docs/portraits/analysis', written.run, name), 'utf8')).toBe(readFileSync(path.join(dir, 'content', name), 'utf8'));
    }
  });

  /** Drops gm-female-01, live in the register, from the list and the rows: `check` refuses it. */
  const dropFemale01 = (files: Parameters<Parameters<typeof runDraft>[1]>[0]) => {
    files.portraits.guildmaster = { ...files.portraits.guildmaster, female: (files.portraits.guildmaster?.female ?? []).filter((key) => key !== 'gm-female-01') };
    delete files.portraitAppearances.portraits['gm-female-01'];
  };

  test("write-run refuses a run that apply would undo for the tool's check, writing nothing (v1.1.3-S8)", async () => {
    const dir = scratch();
    const before = status(dir);
    const refused = writeRun(dir, runDraft(dir, dropFemale01), { date: '2026-10-02' });
    await expect(refused).rejects.toBeInstanceOf(DraftError);
    await expect(refused).rejects.toThrow(/gm-female-01 is live in the register, and content\/portraits\.json does not list it/);
    expect(status(dir)).toBe(before);
  });

  test("apply takes a run that differs from the content only in a row's order of fields as no change, as diff does (v1.1.3-S8)", async () => {
    const dir = scratch();
    const written = await writeRun(
      dir,
      runDraft(dir, (files) => {
        const row = files.portraitAppearances.portraits['gm-male-01'] ?? {};
        files.portraitAppearances.portraits['gm-male-01'] = Object.fromEntries(Object.entries(row).reverse());
      }),
      { date: '2026-10-02' },
    );
    const before = status(dir);
    await expect(apply(dir, written.run)).resolves.toEqual({ run: written.run, changed: [], contentVersion: null });
    expect(status(dir)).toBe(before);
  });

  test('apply of a run that breaks a check is undone, leaving the tree as it was', async () => {
    const dir = scratch();
    // Written whole, then edited on disk, since write-run refuses such a run (v1.1.3-S8).
    const written = await writeRun(dir, runDraft(dir, () => undefined), { date: '2026-10-02' });
    const broken = runDraft(dir, dropFemale01);
    for (const [name, value] of [['portraits.json', broken.portraits], ['portrait-appearances.json', broken.portraitAppearances]] as const) {
      writeFileSync(path.join(dir, 'docs/portraits/analysis', written.run, name), `${JSON.stringify(value, null, 2)}\n`);
    }
    const before = status(dir);
    let out = '';
    const code = await run(['apply', written.run, '--root', dir, '--json'], { out: (text) => (out += text), err: () => undefined });
    expect(code).toBe(1);
    const json = JSON.parse(out) as { ok: boolean; kind: string; problems: string[] };
    expect(json).toMatchObject({ ok: false, kind: 'undone' });
    expect(json.problems).toContain('gm-female-01 is live in the register, and content/portraits.json does not list it under guildmaster.female');
    expect(status(dir)).toBe(before);
  });

  test('apply refuses a run that is not there, or not named by a date', async () => {
    const dir = scratch();
    await expect(apply(dir, '2026-10-09')).rejects.toThrow(/docs\/portraits\/analysis\/2026-10-09\/portraits\.json does not exist/);
    await expect(apply(dir, 'latest')).rejects.toThrow(/a run is named by its date/);
  });
});
