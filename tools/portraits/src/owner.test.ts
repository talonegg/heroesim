import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { chromiumInstalled, dataUrlOf, dataUrlOfBytes, launchChromium, type Chromium, type Trim } from './chromium.js';
import { convert } from './convert.js';
import { distance, fingerprint, type Fingerprint } from './fingerprint.js';
import { readRegistry } from './registry.js';
import { root } from './test-support.js';
import { webpSize } from './webp.js';

// The owner's 40 Guildmaster pictures (DL-136), kept outside the repository, in the folder
// HEROESIM_OWNER_PICTURES names (`C:\JHH\source\heroesim-inbox\guildmaster` on the owner's machine).
// They run only when it is set, a run apart from `npm test`, whose tail they were (DL-234); set, a
// folder without the 40 fails them. chromium.test.ts proves the same on the pictures committed in
// every run. Two of the 40 are the originals of the pictures in the game:
// - each of the 40 converts within 120 kB, with a thumbnail of 160 × 213;
// - the two originals are similar to gm-male-01 and gm-female-01, and none of the other 38 to either;
// - each picture is similar to a 5% crop of itself.

const source = process.env.HEROESIM_OWNER_PICTURES ?? '';
const originals: Readonly<Record<string, string>> = {
  'gm-male-01': path.join(source, 'male', '1790740777932.jpg'),
  'gm-female-01': path.join(source, 'female', '1790741002208.jpg'),
};
const files = ['male', 'female'].flatMap((sex) => {
  const dir = path.join(source, sex);
  return existsSync(dir) ? readdirSync(dir).filter((name) => /\.(jpe?g|png|webp)$/i.test(name)).map((name) => path.join(dir, name)) : [];
});
const present = files.length === 40 && Object.values(originals).every((file) => existsSync(file));

/** The crops tried: 5% all round, at an edge, at a corner, and unevenly; one per picture in turn. */
const crops: readonly Trim[] = [
  { left: 0.05, top: 0, right: 0, bottom: 0 },
  { left: 0, top: 0.05, right: 0, bottom: 0 },
  { left: 0, top: 0, right: 0.05, bottom: 0.05 },
  { left: 0.05, top: 0.05, right: 0, bottom: 0 },
  { left: 0.01, top: 0.04, right: 0.03, bottom: 0.01 },
  { left: 0.04, top: 0, right: 0.01, bottom: 0.03 },
  { left: 0, top: 0.02, right: 0.05, bottom: 0.03 },
  { left: 0.03, top: 0.05, right: 0, bottom: 0 },
];
const allRound: Trim = { left: 0.025, top: 0.025, right: 0.025, bottom: 0.025 };

describe.skipIf(source === '' || !chromiumInstalled())("the owner's 40 (DL-136)", () => {
  let chromium: Chromium;
  const prints = new Map<string, Fingerprint>();
  const registry = readRegistry(root);
  const { similarWithin } = registry.fingerprint;

  beforeAll(async () => {
    if (!present) throw new Error(`HEROESIM_OWNER_PICTURES is ${source}, which does not hold the owner's 40 in male\\ and female\\`);
    chromium = await launchChromium();
    for (const file of files) prints.set(file, await fingerprint(chromium, dataUrlOf(file)));
  }, 300_000);
  afterAll(async () => {
    await chromium?.close();
  });

  test('each converts to a picture of 480 × 640 within 120 kB, and a thumbnail of 160 × 213 of about 10 kB', async () => {
    const sizes: number[] = [];
    for (const file of files) {
      const converted = await convert(chromium, dataUrlOf(file), file);
      expect(webpSize(converted.picture.bytes), file).toEqual({ width: 480, height: 640 });
      expect(converted.picture.bytes.length, file).toBeLessThanOrEqual(120_000);
      expect(webpSize(converted.thumbnail.bytes), file).toEqual({ width: 160, height: 213 });
      expect(converted.thumbnail.bytes.length, file).toBeLessThanOrEqual(12_000);
      sizes.push(converted.picture.bytes.length);
    }
    expect(sizes).toHaveLength(40);
  }, 300_000);

  test('finds the two originals similar to gm-male-01 and gm-female-01, and none of the other 38 similar to either', () => {
    const distances: Record<string, number> = {};
    for (const [key, original] of Object.entries(originals)) {
      const entry = registry.portraits[key];
      if (entry === undefined) throw new Error(`${key} is not in the register`);
      distances[key] = distance(prints.get(original) ?? { hash: '', trimmed: [] }, entry);
      expect(distances[key], key).toBeLessThanOrEqual(similarWithin);
    }
    const others: number[] = [];
    for (const file of files.filter((each) => !Object.values(originals).includes(each))) {
      for (const key of Object.keys(originals)) {
        const entry = registry.portraits[key];
        if (entry === undefined) continue;
        const apart = distance(prints.get(file) ?? { hash: '', trimmed: [] }, entry);
        expect(apart, `${file} against ${key}`).toBeGreaterThan(similarWithin);
        others.push(apart);
      }
    }
    expect(others).toHaveLength(76);
    console.info(`the owner's 40: the originals ${JSON.stringify(distances)} from their WebP; the 38 others at least ${Math.min(...others)} from either (within ${similarWithin} is similar)`);
  });

  test('finds each picture similar to a 5% crop of itself, taken all round and one other way', async () => {
    const found: number[] = [];
    for (const [index, file] of files.entries()) {
      const whole = prints.get(file);
      if (whole === undefined) throw new Error(`${file} has no fingerprint`);
      for (const crop of [allRound, crops[index % crops.length] ?? allRound]) {
        const cropped = await chromium.draw(dataUrlOf(file), { width: 480, height: 640, output: { kind: 'webp', qualities: [0.9], maxBytes: Infinity } }, crop);
        const apart = distance(await fingerprint(chromium, dataUrlOfBytes(cropped.bytes, 'image/webp')), whole);
        expect(apart, `${file} cropped ${JSON.stringify(crop)}`).toBeLessThanOrEqual(similarWithin);
        found.push(apart);
      }
    }
    console.info(`the owner's 40, each cropped by 5% twice: at most ${Math.max(...found)} from itself`);
  }, 300_000);

  test('finds no two of the 40 similar to each other', () => {
    const list = [...prints.entries()];
    let least = Infinity;
    for (const [index, [file, print]] of list.entries()) {
      for (const [other, otherPrint] of list.slice(index + 1)) {
        const apart = distance(print, otherPrint);
        least = Math.min(least, apart);
        expect(apart, `${file} and ${other}`).toBeGreaterThan(similarWithin);
      }
    }
    console.info(`the owner's 40: any two at least ${least} apart`);
  });
});
