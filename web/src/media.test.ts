// @vitest-environment node
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { GuildId, PortraitRole, Sex } from '@heroesim/engine';
import { describe, expect, test } from 'vitest';
import { content } from './content';
import { media, mediaCatalogue, mediaFiles, mediaPathOf, neutralSilhouette } from './media';

// The `media/` folder's rules (DL-125 items 1, 8, 11 and 12, DL-126 item 1), read from the
// disk rather than from the build's catalogue, so a file the catalogue would not pick up is seen too:
// - every name lower case and hyphens, never renamed once a save may hold it;
// - the folders DL-125 item 1 lays out, and no other, each with its Silhouette;
// - a Silhouette is SVG, one graphite form on the pictures' cream, and a few hundred bytes, under
//   the size the build inlines (vite.config.ts); a picture is WebP;
// - in `media/items/`, a picture is named by an Item's content key;
// - a Portrait's picture has its thumbnail beside it, `<key>.thumb.webp` (DL-135 item 9).
// Three things under `media/` are the portrait tool's and never the page's (DL-135 item 11):
// its register, `portraits/registry.json`; its inbox, `inbox/`, which is ignored but for each
// folder's `.gitkeep`; and any batch of converted Hero pictures kept until it is taken in, a folder
// under each Hero sex's (`portraits/heroes/<sex>/<class>/`, DL-300). None is shipped (src/media.ts),
// and none is held to these rules.

const mediaDir = fileURLToPath(new URL('../../media/', import.meta.url));

/** The portrait tool's own files under `media/`: its register, its inbox, and any converted Hero pictures' folders. */
const toolsOwn = (entry: string): boolean =>
  entry === 'portraits/registry.json' || entry === 'inbox' || entry.startsWith('inbox/') || /^portraits\/heroes\/(?:female|male)\/[^/.]+(?:\/|$)/.test(entry);

/** Every file under `media/`, by its path under it with `/` separators. */
const files = readdirSync(mediaDir, { recursive: true, encoding: 'utf8' })
  .map((entry) => entry.replace(/\\/g, '/'))
  .filter((entry) => !toolsOwn(entry) && statSync(path.join(mediaDir, entry)).isFile())
  .sort();

/** Every folder under `media/`, by its path under it. */
const folders = readdirSync(mediaDir, { recursive: true, encoding: 'utf8' })
  .map((entry) => entry.replace(/\\/g, '/'))
  .filter((entry) => !toolsOwn(entry) && statSync(path.join(mediaDir, entry)).isDirectory())
  .sort();

/** A Portrait's pictures, without their thumbnails. */
const isPortraitPicture = (file: string): boolean => file.startsWith('portraits/') && file.endsWith('.webp') && !file.endsWith('.thumb.webp');

/** The roles a Portrait is drawn for, and each one's folder (DL-125 item 2). */
const roleFolders: Readonly<Record<PortraitRole, string>> = { guildmaster: 'guildmasters', hero: 'heroes', patron: 'patrons' };
const portraitRoles = Object.keys(roleFolders) as PortraitRole[];
const sexes: readonly Sex[] = ['female', 'male'];

/** The folders a picture may be in (DL-125 item 1). */
const pictureFolders = [
  ...['guildmasters', 'heroes', 'patrons'].flatMap((role) => ['female', 'male'].map((sex) => `portraits/${role}/${sex}`)),
  'banners',
  'items',
];

/** A name of lower-case letters and digits in words joined by hyphens (DL-125 item 11). */
const lowerAndHyphens = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** The size under which the build inlines a Silhouette into the script (vite.config.ts). */
const inlineLimit = 1024;

/** The pictures' cream paper and the graphite drawn on it (DL-126 item 1), from the owner's two. */
const cream = '#f3ecdb';
const graphite = '#5a5752';

/**
 * A WebP's width and height, from its header: a lossy (`VP8 `), lossless (`VP8L`) or extended (`VP8X`)
 * file; `null` for anything that is not a WebP.
 */
function webpSize(bytes: Buffer): { width: number; height: number } | null {
  if (bytes.toString('ascii', 0, 4) !== 'RIFF' || bytes.toString('ascii', 8, 12) !== 'WEBP') return null;
  switch (bytes.toString('ascii', 12, 16)) {
    case 'VP8 ':
      return { width: bytes.readUInt16LE(26) & 0x3fff, height: bytes.readUInt16LE(28) & 0x3fff };
    case 'VP8L': {
      const bits = bytes.readUInt32LE(21);
      return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
    }
    case 'VP8X':
      return { width: bytes.readUIntLE(24, 3) + 1, height: bytes.readUIntLE(27, 3) + 1 };
    default:
      return null;
  }
}

describe('media/', () => {
  test('names every folder and file in lower case and hyphens', () => {
    const badFolders = folders.filter((folder) => !folder.split('/').every((part) => lowerAndHyphens.test(part)));
    const badFiles = files.filter((file) => {
      const name = path.posix.basename(file).replace(/\.thumb\.webp$/, '.webp');
      const dot = name.lastIndexOf('.');
      return dot < 0 || !lowerAndHyphens.test(name.slice(0, dot));
    });
    expect(badFolders).toEqual([]);
    expect(badFiles).toEqual([]);
  });

  test('keeps pictures only in the folders laid out, each of which has its Silhouette', () => {
    const outside = files.filter((file) => !pictureFolders.includes(path.posix.dirname(file)));
    const without = pictureFolders.filter((folder) => !files.includes(`${folder}/silhouette.svg`));
    expect(outside).toEqual([]);
    expect(without).toEqual([]);
  });

  test('holds a Silhouette as SVG and a picture as WebP, and nothing else', () => {
    const others = files.filter((file) => {
      const name = path.posix.basename(file);
      return name !== 'silhouette.svg' && path.posix.extname(name) !== '.webp';
    });
    expect(others).toEqual([]);
  });

  test('draws each Silhouette as one graphite form on the cream, in a few hundred bytes the build inlines', () => {
    const silhouettes = files.filter((file) => file.endsWith('/silhouette.svg'));
    expect(silhouettes).toHaveLength(pictureFolders.length);
    for (const file of silhouettes) {
      const svg = readFileSync(path.join(mediaDir, file), 'utf8');
      expect(Buffer.byteLength(svg), file).toBeLessThanOrEqual(inlineLimit);
      expect(svg, file).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 \d+ \d+">/);
      // The cream behind, then one form of graphite: no second colour, no text, no reference out.
      expect([...svg.matchAll(/fill="(#[0-9a-f]{6})"/g)].map(([, fill]) => fill), file).toEqual([cream, graphite]);
      expect(svg.match(/<path /g), file).toHaveLength(1);
      expect(svg, file).not.toMatch(/<text|<image|href=|url\(/);
    }
  });

  test("draws a Portrait's Silhouette 3 × 4, the Banner's 2 × 3 and the Item's 1 × 1", () => {
    const viewBox = (file: string): string => /viewBox="([^"]+)"/.exec(readFileSync(path.join(mediaDir, file), 'utf8'))?.[1] ?? '';
    for (const folder of pictureFolders.filter((each) => each.startsWith('portraits/'))) {
      expect(viewBox(`${folder}/silhouette.svg`), folder).toBe('0 0 30 40');
    }
    expect(viewBox('banners/silhouette.svg')).toBe('0 0 20 30');
    expect(viewBox('items/silhouette.svg')).toBe('0 0 20 20');
  });

  // `content/portraits.json` and `media/portraits/` hold the same pictures (DL-125 item 3):
  // content lists each by its key, and the file is `<key>.webp` in its role's folder of its sex, so a
  // key a save holds always finds its picture. Content reads no files, so the page's test holds both.
  test("holds each Portrait content lists as <key>.webp in its role's folder of its sex, and no picture content does not list", () => {
    const listed = portraitRoles.flatMap((role) =>
      sexes.flatMap((sex) => content.portraits[role][sex].map((key) => `portraits/${roleFolders[role]}/${sex}/${key}.webp`)),
    );
    const onDisk = files.filter(isPortraitPicture);
    expect(listed.filter((file) => !files.includes(file))).toEqual([]);
    expect(onDisk.filter((file) => !listed.includes(file))).toEqual([]);
  });

  // DL-125 items 11 and 12: a Portrait's picture is WebP, 480 × 640, converted once, and
  // small enough to load at once, held by the portrait tool, `tools/portraits`, within
  // 120 kB (DL-134 item 9), which `npm run portraits -- check` holds too.
  test('holds each Portrait picture as WebP, 480 × 640, of at most 120 kB', () => {
    const pictures = files.filter(isPortraitPicture);
    for (const file of pictures) {
      const bytes = readFileSync(path.join(mediaDir, file));
      expect(bytes.length, file).toBeLessThanOrEqual(120_000);
      expect(webpSize(bytes), file).toEqual({ width: 480, height: 640 });
    }
  });

  // DL-135 item 9: each picture's thumbnail, for the lists and the setup grid.
  test('holds beside each Portrait picture its thumbnail, <key>.thumb.webp, 160 × 213, of about 10 kB, and no thumbnail without its picture', () => {
    const pictures = files.filter(isPortraitPicture);
    const thumbnails = files.filter((file) => file.endsWith('.thumb.webp'));
    expect(thumbnails).toEqual(pictures.map((file) => file.replace(/\.webp$/, '.thumb.webp')));
    for (const file of thumbnails) {
      const bytes = readFileSync(path.join(mediaDir, file));
      expect(bytes.length, file).toBeLessThanOrEqual(12_000);
      expect(webpSize(bytes), file).toEqual({ width: 160, height: 213 });
    }
  });

  test("names each Item's picture by an Item's content key", () => {
    const unknown = files
      .filter((file) => file.startsWith('items/') && file !== 'items/silhouette.svg')
      .map((file) => path.posix.basename(file, '.webp'))
      .filter((key) => !Object.hasOwn(content.items, key));
    expect(unknown).toEqual([]);
  });
});

describe("the page's catalogue of media/", () => {
  test('holds every file under media/, by its path', () => {
    expect(Object.keys(mediaFiles).sort()).toEqual(files);
  });

  test("finds a person's Silhouette by their role and sex, and no picture while they have no Portrait's key", () => {
    const female = media.portrait('hero', 'female', null);
    expect(female.picture).toBeNull();
    expect(female.silhouette).toBe(mediaFiles['portraits/heroes/female/silhouette.svg']);
    expect(media.portrait('guildmaster', 'male', null).silhouette).toBe(mediaFiles['portraits/guildmasters/male/silhouette.svg']);
    expect(media.portrait('patron', 'female', null).silhouette).toBe(mediaFiles['portraits/patrons/female/silhouette.svg']);
  });

  test("finds the picture of every Portrait content lists, by its role, sex and key: the owner's two (DL-131)", () => {
    const missing = portraitRoles.flatMap((role) =>
      sexes.flatMap((sex) => content.portraits[role][sex].filter((key) => media.portrait(role, sex, key).picture === null)),
    );
    expect(missing).toEqual([]);
  });

  test('finds a picture by its key, and none for a key that names no file', () => {
    const catalogue = mediaCatalogue({
      ...mediaFiles,
      'portraits/guildmasters/female/gm-female-01.webp': './assets/gm-female-01-abc.webp',
      'items/barrow-kings-blade.webp': './assets/barrow-kings-blade-def.webp',
    });
    expect(catalogue.portrait('guildmaster', 'female', 'gm-female-01').picture).toBe('./assets/gm-female-01-abc.webp');
    // A picture of the other sex, or another role's, is not found.
    expect(catalogue.portrait('guildmaster', 'male', 'gm-female-01').picture).toBeNull();
    expect(catalogue.portrait('hero', 'female', 'gm-female-01').picture).toBeNull();
    expect(catalogue.item('barrow-kings-blade').picture).toBe('./assets/barrow-kings-blade-def.webp');
    expect(catalogue.item('mantle-of-the-fells')).toEqual({ silhouette: mediaFiles['items/silhouette.svg'], picture: null });
    // Every Guild shows the Banner's Silhouette for now (DL-125 item 7).
    expect(catalogue.banner('guild-000001' as GuildId)).toEqual({ silhouette: mediaFiles['banners/silhouette.svg'], picture: null });
  });

  // DL-135 item 9: a person's thumbnail, beside their name in a list and in the setup grid.
  test("finds a person's thumbnail, <key>.thumb.webp, by their role, sex and key, and the Silhouette of their sex without one", () => {
    const catalogue = mediaCatalogue({
      ...mediaFiles,
      'portraits/heroes/female/hero-female-01.webp': './assets/hero-female-01-abc.webp',
      'portraits/heroes/female/hero-female-01.thumb.webp': './assets/hero-female-01.thumb-abc.webp',
    });
    // A Hero's, under media/portraits/heroes/<sex>/, once a Hero picture exists.
    expect(catalogue.portraitThumbnail('hero', 'female', 'hero-female-01')).toEqual({
      silhouette: mediaFiles['portraits/heroes/female/silhouette.svg'],
      picture: './assets/hero-female-01.thumb-abc.webp',
    });
    expect(catalogue.portraitThumbnail('hero', 'male', 'hero-female-01').picture).toBeNull();
    expect(catalogue.portraitThumbnail('guildmaster', 'female', 'hero-female-01').picture).toBeNull();
    expect(catalogue.portraitThumbnail('hero', 'female', null)).toEqual({ silhouette: mediaFiles['portraits/heroes/female/silhouette.svg'], picture: null });
    // Every Guildmaster picture shipped has its thumbnail, a file of its own.
    for (const sex of sexes) {
      for (const key of content.portraits.guildmaster[sex]) {
        const thumbnail = media.portraitThumbnail('guildmaster', sex, key).picture;
        expect(thumbnail, key).toBe(mediaFiles[`portraits/guildmasters/${sex}/${key}.thumb.webp`]);
        expect(thumbnail, key).not.toBe(media.portrait('guildmaster', sex, key).picture);
      }
    }
    expect(media.portraitThumbnail('guildmaster', 'other' as Sex, 'gm-female-01')).toEqual({ silhouette: neutralSilhouette, picture: null });
  });

  test("gives a person of a sex the folders do not know the neutral Silhouette and no picture, rather than throwing", () => {
    for (const sex of ['other', '', 'Female', 'constructor'] as unknown as Sex[]) {
      expect(media.portrait('guildmaster', sex, 'gm-female-01')).toEqual({ silhouette: neutralSilhouette, picture: null });
    }
    expect(neutralSilhouette).toMatch(/^data:image\/svg\+xml,/);
  });

  test('refuses a place with no Silhouette, which the rules above never let pass', () => {
    expect(() => mediaCatalogue({}).banner('guild-000001' as GuildId)).toThrow('media/banners has no silhouette.svg');
  });

  test("reads a bundler's key as the path under media/", () => {
    expect(mediaPathOf('../../media/items/silhouette.svg')).toBe('items/silhouette.svg');
    expect(mediaPathOf('./media/items/barrow-kings-blade.webp')).toBe('items/barrow-kings-blade.webp');
  });
});
