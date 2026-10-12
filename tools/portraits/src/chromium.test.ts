import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { chromiumInstalled, dataUrlOf, dataUrlOfBytes, launchChromium, type Chromium, type Trim } from './chromium.js';
import { run } from './cli.js';
import { convert, picture, Refusal, thumbnail } from './convert.js';
import { distance, fingerprint, hashDistance } from './fingerprint.js';
import { picturePaths, readRegistry } from './registry.js';
import { noisePng, root } from './test-support.js';
import { webpSize } from './webp.js';

// Conversion and the fingerprint in Chromium, on the pictures committed, so CI proves
// them without the owner's 40, which owner.test.ts reads where they are. Chromium is Playwright's
// (`npx playwright install chromium`), as the page's specs use; without it these are skipped.

const registry = readRegistry(root);
const { similarWithin } = registry.fingerprint;
const pictures = (['male', 'female'] as const).map((sex) => {
  const key = `gm-${sex}-01`;
  return { key, file: picturePaths(root, 'guildmaster', sex, key).picture, entry: registry.portraits[key] };
});

describe.skipIf(!chromiumInstalled())('in Chromium', () => {
  let chromium: Chromium;
  let scratch: string;
  beforeAll(async () => {
    chromium = await launchChromium();
    scratch = mkdtempSync(path.join(tmpdir(), 'heroesim-chromium-'));
  });
  afterAll(async () => {
    await chromium?.close();
    rmSync(scratch, { recursive: true, force: true });
  });

  /** A copy of a picture, drawn again: trimmed, and written as WebP at a quality and size. */
  async function redrawn(file: string, trim: Trim, width = 480, quality = 0.9): Promise<string> {
    const drawn = await chromium.draw(dataUrlOf(file), { width, height: (width * 4) / 3, output: { kind: 'webp', qualities: [quality], maxBytes: Infinity } }, trim);
    return dataUrlOfBytes(drawn.bytes, 'image/webp');
  }

  describe('convert()', () => {
    test('writes a picture of 480 × 640 within 120 kB and a thumbnail of 160 × 213 of about 10 kB, from 0.8 down', async () => {
      for (const { file, key } of pictures) {
        const converted = await convert(chromium, dataUrlOf(file), key);
        expect(webpSize(converted.picture.bytes), key).toEqual({ width: picture.width, height: picture.height });
        expect(converted.picture.bytes.length, key).toBeLessThanOrEqual(120_000);
        expect(converted.picture.quality, key).toBe(0.8);
        expect(webpSize(converted.thumbnail.bytes), key).toEqual({ width: thumbnail.width, height: thumbnail.height });
        expect(converted.thumbnail.bytes.length, key).toBeLessThanOrEqual(12_000);
        expect(converted.thumbnail.bytes.length, key).toBeGreaterThan(5_000);
      }
    });

    test('crops an upload of another shape, centred, to 3 × 4', async () => {
      const wide = await chromium.draw(dataUrlOf(pictures[0]?.file ?? ''), { width: 800, height: 600, aspect: 4 / 3, output: { kind: 'png' } });
      const converted = await convert(chromium, dataUrlOfBytes(wide.bytes, 'image/png'), 'a wide upload');
      expect(webpSize(converted.picture.bytes)).toEqual({ width: 480, height: 640 });
    });

    test('refuses an upload that cannot fit, with its size', async () => {
      const noise = dataUrlOfBytes(noisePng(480, 640), 'image/png');
      const refusal = await convert(chromium, noise, 'noise.png').catch((error: unknown) => error);
      expect(refusal).toBeInstanceOf(Refusal);
      expect((refusal as Refusal).bytes).toBeGreaterThan(120_000);
      expect((refusal as Refusal).message).toMatch(/^noise\.png: its picture is \d+ bytes at quality 0\.5, over the 120000 allowed; it is refused$/);
    });
  });

  describe('fingerprint()', () => {
    test("takes each committed picture's fingerprint as the register holds it", async () => {
      for (const { file, key, entry } of pictures) {
        const print = await fingerprint(chromium, dataUrlOf(file));
        // Chromium on another platform may draw a pixel differently: within a few bits.
        expect(hashDistance(print.hash, entry?.hash ?? ''), key).toBeLessThanOrEqual(16);
        expect(print.trimmed, key).toHaveLength(9);
      }
    });

    test('finds a picture re-encoded smaller, and cropped by 5% all round, at an edge, at a corner or unevenly, similar to itself', async () => {
      const crops: Trim[] = [
        { left: 0, top: 0, right: 0, bottom: 0 },
        { left: 0.025, top: 0.025, right: 0.025, bottom: 0.025 },
        { left: 0, top: 0.05, right: 0, bottom: 0 },
        { left: 0, top: 0, right: 0.05, bottom: 0.05 },
        { left: 0.01, top: 0.04, right: 0.03, bottom: 0.01 },
      ];
      for (const { file, key, entry } of pictures) {
        if (entry === undefined) throw new Error(`${key} is not in the register`);
        const distances = [];
        for (const crop of crops) distances.push(distance(await fingerprint(chromium, await redrawn(file, crop, 360, 0.6)), entry));
        expect(Math.max(...distances), `${key}: ${distances.join(', ')}`).toBeLessThanOrEqual(similarWithin);
      }
    });

    test('finds the two pictures in the game far from each other', () => {
      const [male, female] = pictures.map(({ entry }) => entry);
      if (male === undefined || female === undefined) throw new Error('the register lacks a picture');
      expect(distance(male, female)).toBeGreaterThan(similarWithin);
    });
  });

  describe('the command line', () => {
    test('convert writes <name>.webp and <name>.thumb.webp for a trial, and says so in JSON', async () => {
      const source = path.join(scratch, 'upload.png');
      writeFileSync(source, (await chromium.draw(dataUrlOf(pictures[1]?.file ?? ''), { width: 600, height: 800, output: { kind: 'png' } })).bytes);
      let out = '';
      const code = await run(['convert', source, '--json'], { out: (text) => (out += text), err: () => undefined });
      expect(code).toBe(0);
      const json = JSON.parse(out) as { converted: { picture: { file: string; bytes: number }; thumbnail: { file: string } }[] };
      expect(json.converted[0]?.picture.file).toBe(path.join(scratch, 'upload.webp'));
      expect(webpSize(readFileSync(path.join(scratch, 'upload.webp')))).toEqual({ width: 480, height: 640 });
      expect(webpSize(readFileSync(path.join(scratch, 'upload.thumb.webp')))).toEqual({ width: 160, height: 213 });
    });

    test('convert will not write over its source', async () => {
      const source = path.join(scratch, 'same.webp');
      copyFileSync(pictures[0]?.file ?? '', source);
      let err = '';
      expect(await run(['convert', source], { out: () => undefined, err: (text) => (err += text) })).toBe(2);
      expect(err).toContain('its picture would overwrite it; give --out <dir>');
    });

    test('convert will not write over its source whatever the case of its extension, nor two sources to one picture', async () => {
      const source = path.join(scratch, 'upper.WEBP');
      copyFileSync(pictures[0]?.file ?? '', source);
      const before = readFileSync(source);
      let err = '';
      expect(await run(['convert', source], { out: () => undefined, err: (text) => (err += text) })).toBe(2);
      expect(err).toContain('its picture would overwrite it; give --out <dir>');
      expect(readFileSync(source).equals(before)).toBe(true);

      const [png, jpg] = [path.join(scratch, 'twice.png'), path.join(scratch, 'twice.jpg')];
      copyFileSync(pictures[0]?.file ?? '', png);
      copyFileSync(pictures[1]?.file ?? '', jpg);
      err = '';
      expect(await run(['convert', png, jpg, '--out', path.join(scratch, 'twice')], { out: () => undefined, err: (text) => (err += text) })).toBe(2);
      expect(err).toContain('another source given is converted to the same picture');
      expect(existsSync(path.join(scratch, 'twice', 'twice.webp'))).toBe(false);
    });

    test('fingerprint names the pictures in the register an upload is similar to, the nearest first', async () => {
      const upload = path.join(scratch, 'again.webp');
      copyFileSync(pictures[0]?.file ?? '', upload);
      let out = '';
      const code = await run(['fingerprint', upload, '--nearest', '2', '--json'], { out: (text) => (out += text), err: () => undefined });
      expect(code).toBe(0);
      const json = JSON.parse(out) as { similarWithin: number; files: { file: string; similar: string[]; nearest: { key: string; distance: number; similar: boolean }[] }[] };
      expect(json.similarWithin).toBe(similarWithin);
      expect(json.files).toHaveLength(1);
      expect(json.files[0]?.similar).toEqual(['gm-male-01']);
      expect(json.files[0]?.nearest.map((near) => near.key)).toEqual(['gm-male-01', 'gm-female-01']);
      expect(json.files[0]?.nearest[1]?.similar).toBe(false);
    });

    test('fingerprint of an inbox folder reads every picture in it, however deep, and names the uploads similar to each other', async () => {
      // As the portrait-intake skill calls it: the inbox of a role, with its sex subfolders.
      const inbox = path.join(scratch, 'inbox', 'guildmaster');
      mkdirSync(path.join(inbox, 'male'), { recursive: true });
      mkdirSync(path.join(inbox, 'female'), { recursive: true });
      writeFileSync(path.join(inbox, '.gitkeep'), '');
      copyFileSync(pictures[0]?.file ?? '', path.join(inbox, 'male', 'one.webp'));
      writeFileSync(path.join(inbox, 'male', 'two.webp'), Buffer.from((await redrawn(pictures[0]?.file ?? '', { left: 0.05, top: 0, right: 0, bottom: 0 })).split(',')[1] ?? '', 'base64'));
      copyFileSync(pictures[1]?.file ?? '', path.join(inbox, 'female', 'three.webp'));
      copyFileSync(picturePaths(root, 'guildmaster', 'female', 'gm-female-01').thumbnail, path.join(inbox, 'female', 'three.thumb.webp'));
      let out = '';
      const code = await run(['fingerprint', inbox, '--root', root, '--json'], { out: (text) => (out += text), err: () => undefined });
      expect(code).toBe(0);
      const json = JSON.parse(out) as { files: { file: string; similar: string[]; similarUploads: { file: string; distance: number }[] }[] };
      expect(json.files.map((each) => path.relative(inbox, each.file).replace(/\\/g, '/'))).toEqual(['female/three.webp', 'male/one.webp', 'male/two.webp']);
      expect(json.files.map((each) => each.similar)).toEqual([['gm-female-01'], ['gm-male-01'], ['gm-male-01']]);
      expect(json.files.map((each) => each.similarUploads.map((upload) => path.basename(upload.file)))).toEqual([[], ['two.webp'], ['one.webp']]);
    });

    test('convert-tree converts a tree of pictures preserving subfolders, and skips existing unless --overwrite', async () => {
      const src = path.join(scratch, 'tree-src');
      const outDir = path.join(scratch, 'tree-out');
      mkdirSync(path.join(src, 'female', 'healers'), { recursive: true });
      mkdirSync(path.join(src, 'male', 'warriors'), { recursive: true });
      copyFileSync(pictures[1]?.file ?? '', path.join(src, 'female', 'healers', 'cleric.png'));
      copyFileSync(pictures[0]?.file ?? '', path.join(src, 'male', 'warriors', 'knight.png'));

      let out = '';
      const code1 = await run(['convert-tree', src, '--out', outDir, '--json'], { out: (text) => (out += text), err: () => undefined });
      expect(code1).toBe(0);
      const json1 = JSON.parse(out) as { ok: boolean; total: number; converted: { file: string }[]; skipped: unknown[]; failures: unknown[] };
      expect(json1.ok).toBe(true);
      expect(json1.total).toBe(2);
      expect(json1.converted).toHaveLength(2);
      expect(json1.skipped).toHaveLength(0);
      expect(json1.failures).toHaveLength(0);

      expect(existsSync(path.join(outDir, 'female', 'healers', 'cleric.webp'))).toBe(true);
      expect(existsSync(path.join(outDir, 'female', 'healers', 'cleric.thumb.webp'))).toBe(true);
      expect(existsSync(path.join(outDir, 'male', 'warriors', 'knight.webp'))).toBe(true);
      expect(existsSync(path.join(outDir, 'male', 'warriors', 'knight.thumb.webp'))).toBe(true);

      expect(webpSize(readFileSync(path.join(outDir, 'female', 'healers', 'cleric.webp')))).toEqual({ width: 480, height: 640 });
      expect(webpSize(readFileSync(path.join(outDir, 'female', 'healers', 'cleric.thumb.webp')))).toEqual({ width: 160, height: 213 });

      // Run 2: skips existing by default
      out = '';
      const code2 = await run(['convert-tree', src, '--out', outDir, '--json'], { out: (text) => (out += text), err: () => undefined });
      expect(code2).toBe(0);
      const json2 = JSON.parse(out) as { converted: unknown[]; skipped: unknown[] };
      expect(json2.converted).toHaveLength(0);
      expect(json2.skipped).toHaveLength(2);

      // Run 3: with --overwrite, re-converts
      out = '';
      const code3 = await run(['convert-tree', src, '--out', outDir, '--overwrite', '--json'], { out: (text) => (out += text), err: () => undefined });
      expect(code3).toBe(0);
      const json3 = JSON.parse(out) as { converted: unknown[]; skipped: unknown[] };
      expect(json3.converted).toHaveLength(2);
      expect(json3.skipped).toHaveLength(0);
    });

    test('convert-tree reports failures and continues when an image is refused', async () => {
      const src = path.join(scratch, 'tree-fail-src');
      const outDir = path.join(scratch, 'tree-fail-out');
      mkdirSync(path.join(src, 'female', 'mages'), { recursive: true });
      copyFileSync(pictures[1]?.file ?? '', path.join(src, 'female', 'mages', 'good.png'));
      writeFileSync(path.join(src, 'female', 'mages', 'bad.png'), noisePng(480, 640));

      let out = '';
      const code = await run(['convert-tree', src, '--out', outDir, '--json'], { out: (text) => (out += text), err: () => undefined });
      expect(code).toBe(1);
      const json = JSON.parse(out) as { ok: boolean; total: number; converted: { file: string }[]; failures: { file: string; error: string }[] };
      expect(json.ok).toBe(false);
      expect(json.total).toBe(2);
      expect(json.converted).toHaveLength(1);
      expect(json.converted[0]?.file).toBe('female/mages/good.png');
      expect(json.failures).toHaveLength(1);
      expect(json.failures[0]?.file).toBe('female/mages/bad.png');
      expect(json.failures[0]?.error).toContain('it is refused');
    });
  });
});

