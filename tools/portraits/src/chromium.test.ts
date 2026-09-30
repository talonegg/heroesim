import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { crc32, deflateSync } from 'node:zlib';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { chromiumInstalled, dataUrlOf, dataUrlOfBytes, launchChromium, type Chromium, type Trim } from './chromium.js';
import { run } from './cli.js';
import { convert, picture, Refusal, thumbnail } from './convert.js';
import { distance, fingerprint, hashDistance } from './fingerprint.js';
import { picturePaths, readRegistry } from './registry.js';
import { root } from './test-support.js';
import { webpSize } from './webp.js';

// Conversion and the fingerprint in Chromium, on the pictures committed (v1.1.3-S2), so CI proves
// them without the owner's 40, which owner.test.ts reads where they are. Chromium is Playwright's
// (`npx playwright install chromium`), as the page's specs use; without it these are skipped.

const registry = readRegistry(root);
const { similarWithin } = registry.fingerprint;
const pictures = (['male', 'female'] as const).map((sex) => {
  const key = `gm-${sex}-01`;
  return { key, file: picturePaths(root, 'guildmaster', sex, key).picture, entry: registry.portraits[key] };
});

/** A PNG of random colour, which no quality of WebP can make small: CRC and deflate from Node. */
function noisePng(width: number, height: number): Buffer {
  const chunk = (type: string, data: Buffer): Buffer => {
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([length, body, crc]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 2, 0, 0, 0], 8);
  const rows = Buffer.alloc((width * 3 + 1) * height);
  let seed = 1;
  for (let index = 0; index < rows.length; index += 1) {
    seed = (seed * 1103515245 + 12345) >>> 0;
    rows[index] = index % (width * 3 + 1) === 0 ? 0 : seed >>> 24;
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(rows)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

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
  });
});
