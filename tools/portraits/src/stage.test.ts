import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'vitest';
import { chromiumInstalled, dataUrlOf, launchChromium, type Chromium } from './chromium.js';
import { check } from './check.js';
import { run } from './cli.js';
import { picturePaths } from './registry.js';
import { manifestName, stage, stagedFolder, type Manifest } from './stage.js';
import { noisePng, root, scratchRepository, status, upload } from './test-support.js';
import { webpSize } from './webp.js';

// `stage`: the inbox's uploads converted ahead of their reading, on a scratch copy of the
// repository, made a git repository so that `git status` shows the staged pictures are never seen.

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

describe.skipIf(!chromiumInstalled())('stage, in Chromium', () => {
  let chromium: Chromium;
  beforeAll(async () => {
    chromium = await launchChromium();
  });
  afterAll(async () => {
    await chromium?.close();
  });

  /** A committed picture drawn again as a PNG of another size and shape, as an upload. */
  async function png(dir: string, from: string, width: number, height: number, to: string): Promise<string> {
    const drawn = await chromium.draw(dataUrlOf(from), { width, height, output: { kind: 'png' } });
    mkdirSync(path.dirname(path.join(dir, to)), { recursive: true });
    writeFileSync(path.join(dir, to), drawn.bytes);
    return to;
  }

  /** Every file under the inbox's role folders, as `stage` is handed them by default. */
  function inboxFiles(dir: string, ...relative: string[]): string[] {
    return relative.map((each) => path.join(dir, each));
  }

  test("stages each upload under its own path, with its role, sex and Class as its folders say, and changes nothing git or the game sees", async () => {
    const dir = scratch();
    const sources = [
      upload(dir, committedFemale, 'media/inbox/hero/female/mage/a.webp'),
      upload(dir, committedMale, 'media/inbox/hero/male/b.webp'),
      upload(dir, committedMale, 'media/inbox/hero/male/wizard/c.webp'),
      upload(dir, committedFemale, 'media/inbox/guildmaster/d.webp'),
    ];
    sources.push(await png(dir, committedMale, 800, 600, 'media/inbox/hero/male/warrior/wide.png'));
    sources.push(await png(dir, committedMale, 240, 320, 'media/inbox/hero/male/warrior/small.png'));

    const result = await stage(dir, inboxFiles(dir, ...sources), chromium);

    expect(result.out).toBe('media/inbox/staged');
    expect(result.manifest).toBe('media/inbox/staged/stage.json');
    expect(result.counts).toEqual({ uploads: 6, staged: 6, refused: 0, failed: 0, converted: 6, removed: 0 });
    const bySource = new Map(result.uploads.map((each) => [each.source, each]));
    const a = bySource.get('media/inbox/hero/female/mage/a.webp');
    expect(a).toMatchObject({ role: 'hero', sex: 'female', class: 'mage', status: 'staged', problem: null, warnings: [], converted: true });
    expect(a?.picture?.file).toBe('media/inbox/staged/hero/female/mage/a.webp');
    expect(a?.thumbnail?.file).toBe('media/inbox/staged/hero/female/mage/a.thumb.webp');
    expect(a?.similar.map((each) => each.key)).toEqual(['gm-female-01']);
    expect(webpSize(readFileSync(path.join(dir, a?.picture?.file ?? '')))).toEqual({ width: 480, height: 640 });
    expect(webpSize(readFileSync(path.join(dir, a?.thumbnail?.file ?? '')))).toEqual({ width: 160, height: 213 });

    const codes = (source: string): string[] => (bySource.get(source)?.warnings ?? []).map((warning) => warning.code);
    expect(bySource.get('media/inbox/hero/male/b.webp')).toMatchObject({ sex: 'male', class: null });
    expect(codes('media/inbox/hero/male/b.webp')).toEqual(['no-class']);
    expect(codes('media/inbox/hero/male/wizard/c.webp')).toEqual(['not-a-class']);
    expect(bySource.get('media/inbox/hero/male/wizard/c.webp')?.warnings[0]?.message).toBe('its folder wizard/ is no Class: the Classes are warrior, rogue, mage or healer');
    expect(bySource.get('media/inbox/guildmaster/d.webp')).toMatchObject({ role: 'guildmaster', sex: null, class: null });
    expect(codes('media/inbox/guildmaster/d.webp')).toEqual(['no-sex']);
    expect(bySource.get('media/inbox/hero/male/warrior/wide.png')?.warnings).toEqual([
      { code: 'cropped', message: 'it is 800 × 600, not 3 × 4: 43.8% of its width is cropped, half from each side' },
      { code: 'drawn-up', message: 'it is 800 × 600, smaller than 480 × 640: it is drawn up, and may look soft' },
    ]);
    expect(codes('media/inbox/hero/male/warrior/small.png')).toEqual(['drawn-up']);
    // The same drawing, uploaded three times, is near itself each time.
    expect(bySource.get('media/inbox/hero/male/b.webp')?.similarUploads.map((each) => each.source)).toEqual(
      expect.arrayContaining(['media/inbox/hero/male/wizard/c.webp', 'media/inbox/hero/male/warrior/small.png']),
    );

    const manifest = JSON.parse(readFileSync(path.join(dir, stagedFolder, manifestName), 'utf8')) as Manifest;
    expect(manifest.uploads.map((each) => each.source)).toEqual([...sources].sort());
    expect(manifest.uploads.every((each) => each.fingerprint?.trimmed.length === 9)).toBe(true);
    // The uploads stay in the inbox; git, the register and the content see nothing new.
    for (const source of sources) expect(existsSync(path.join(dir, source)), source).toBe(true);
    expect(status(dir)).toBe('');
    expect(check(dir).ok).toBe(true);
  });

  test('goes on past an upload too large to fit, one that cannot be drawn, and two that would be staged alike', async () => {
    const dir = scratch();
    upload(dir, committedFemale, 'media/inbox/hero/female/rogue/a.webp');
    await png(dir, committedFemale, 480, 640, 'media/inbox/hero/female/rogue/a.png');
    writeFileSync(path.join(dir, 'media/inbox/hero/female/rogue/noise.png'), noisePng(480, 640));
    writeFileSync(path.join(dir, 'media/inbox/hero/female/rogue/broken.png'), 'not a picture');
    upload(dir, committedMale, 'media/inbox/hero/male/healer/b.webp');
    const sources = ['a.png', 'a.webp', 'broken.png', 'noise.png'].map((name) => `media/inbox/hero/female/rogue/${name}`);

    const result = await stage(dir, inboxFiles(dir, ...sources, 'media/inbox/hero/male/healer/b.webp'), chromium);

    expect(result.counts).toEqual({ uploads: 5, staged: 2, refused: 1, failed: 2, converted: 2, removed: 0 });
    const bySource = new Map(result.uploads.map((each) => [each.source, each]));
    expect(bySource.get('media/inbox/hero/female/rogue/a.png')?.status).toBe('staged');
    expect(bySource.get('media/inbox/hero/female/rogue/a.webp')?.problem).toBe(
      "media/inbox/hero/female/rogue/a.webp: its staged picture, media/inbox/staged/hero/female/rogue/a.webp, would be the same as the upload media/inbox/hero/female/rogue/a.png's: rename one",
    );
    expect(bySource.get('media/inbox/hero/female/rogue/noise.png')?.status).toBe('refused');
    expect(bySource.get('media/inbox/hero/female/rogue/noise.png')?.problem).toMatch(
      /^media\/inbox\/hero\/female\/rogue\/noise\.png: its picture is \d+ bytes at quality 0\.5, over the 120000 allowed; it is refused$/,
    );
    expect(bySource.get('media/inbox/hero/female/rogue/broken.png')?.problem).toMatch(/^media\/inbox\/hero\/female\/rogue\/broken\.png: it could not be drawn \(/);
    expect(existsSync(path.join(dir, 'media/inbox/staged/hero/female/rogue/noise.webp'))).toBe(false);
    expect(existsSync(path.join(dir, 'media/inbox/staged/hero/male/healer/b.webp'))).toBe(true);
  });

  test('a second run converts only what changed, and drops an entry whose upload has left the inbox, with its files', async () => {
    const dir = scratch();
    const sources = [
      upload(dir, committedFemale, 'media/inbox/hero/female/healer/a.webp'),
      upload(dir, committedMale, 'media/inbox/hero/male/rogue/b.webp'),
      upload(dir, committedMale, 'media/inbox/hero/male/rogue/c.webp'),
    ];
    await stage(dir, inboxFiles(dir, ...sources), chromium);
    const before = readFileSync(path.join(dir, stagedFolder, manifestName), 'utf8');

    const again = await stage(dir, inboxFiles(dir, ...sources), chromium);
    expect(again.counts.converted).toBe(0);
    expect(readFileSync(path.join(dir, stagedFolder, manifestName), 'utf8')).toBe(before);

    // b is replaced by another drawing; c is taken in, so leaves the inbox.
    upload(dir, picturePaths(root, 'guildmaster', 'male', 'gm-male-05').picture, 'media/inbox/hero/male/rogue/b.webp');
    rmSync(path.join(dir, 'media/inbox/hero/male/rogue/c.webp'));
    const third = await stage(dir, inboxFiles(dir, sources[0] ?? '', sources[1] ?? ''), chromium);
    expect(third.counts).toMatchObject({ uploads: 2, converted: 1, removed: 1 });
    expect(third.removed).toEqual(['media/inbox/hero/male/rogue/c.webp']);
    expect(third.uploads.map((each) => [each.source, each.converted])).toEqual([
      ['media/inbox/hero/female/healer/a.webp', false],
      ['media/inbox/hero/male/rogue/b.webp', true],
    ]);
    expect(third.uploads[1]?.similar.map((each) => each.key)).toEqual(['gm-male-05']);
    expect(existsSync(path.join(dir, 'media/inbox/staged/hero/male/rogue/c.webp'))).toBe(false);
    expect(existsSync(path.join(dir, 'media/inbox/staged/hero/male/rogue/c.thumb.webp'))).toBe(false);
  });

  test('the command stages the role folders by default, passes over the staging folder, and refuses an upload outside the inbox', async () => {
    const dir = scratch();
    upload(dir, committedFemale, 'media/inbox/hero/female/warrior/a.webp');
    upload(dir, committedMale, 'media/inbox/guildmaster/male/b.webp');
    let out = '';
    const io = { out: (text: string) => (out += text), err: () => undefined };

    expect(await run(['stage', '--root', dir, '--json'], io)).toBe(0);
    const json = JSON.parse(out) as { ok: boolean; counts: { uploads: number }; uploads: { source: string; fingerprint?: unknown }[] };
    expect(json.ok).toBe(true);
    expect(json.uploads.map((each) => each.source)).toEqual(['media/inbox/guildmaster/male/b.webp', 'media/inbox/hero/female/warrior/a.webp']);
    expect(json.uploads.every((each) => !('fingerprint' in each))).toBe(true);

    // Named whole, the inbox holds the staged pictures too: they are passed over, not staged again.
    out = '';
    expect(await run(['stage', path.join(dir, 'media', 'inbox'), '--root', dir, '--json'], io)).toBe(0);
    expect((JSON.parse(out) as { counts: { uploads: number; converted: number } }).counts).toMatchObject({ uploads: 2, converted: 0 });

    const lines: string[] = [];
    expect(await run(['stage', '--root', dir], { out: (text) => lines.push(text), err: () => undefined })).toBe(0);
    expect(lines.slice(0, 5)).toEqual([
      'Staged in media/inbox/staged/, listed in media/inbox/staged/stage.json: 2 uploads',
      '  This run: 0 converted, 0 removed, since their uploads have left the inbox',
      '  Staged 2, refused 0, failed 0',
      '  Guildmaster, male: all 1',
      '  Hero, female: warrior 1',
    ]);

    writeFileSync(path.join(dir, 'media', 'stray.png'), readFileSync(committedMale));
    out = '';
    expect(await run(['stage', path.join(dir, 'media', 'stray.png'), '--root', dir, '--json'], io)).toBe(1);
    expect(JSON.parse(out)).toEqual({ ok: false, kind: 'failed', problems: ['Only uploads in media/inbox/<role>/ are staged, and these are not:\n  media/stray.png'] });
  });
});
