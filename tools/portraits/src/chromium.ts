// Chromium draws every picture the tool makes or reads (DL-135 item 11): the Playwright the page's
// specs install is the one image library, so no image package joins the repository. A canvas crops
// and scales a picture and writes WebP or PNG, or hands back its pixels for a fingerprint.

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { chromium, type Browser, type Page } from '@playwright/test';

/** The kinds of picture the tool reads, by extension. */
const mimeTypes: Readonly<Record<string, string>> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
};

/** Whether a file is a picture the tool reads, by its extension. */
export function isPicture(file: string): boolean {
  return Object.hasOwn(mimeTypes, path.extname(file).toLowerCase());
}

/** A picture file as Chromium is handed it: a `data:` URL. */
export function dataUrlOf(file: string): string {
  const mime = mimeTypes[path.extname(file).toLowerCase()];
  if (mime === undefined) throw new Error(`${file}: a JPEG, PNG or WebP is read, and this is none`);
  return dataUrlOfBytes(readFileSync(file), mime);
}

/** Bytes of a picture as a `data:` URL. */
export function dataUrlOfBytes(bytes: Buffer, mime: string): string {
  return `data:${mime};base64,${bytes.toString('base64')}`;
}

/**
 * The fraction of each edge trimmed before the picture is cropped to its drawing's shape: nothing,
 * for a picture as it is; 5% in all for the fingerprint's trimmed hashes and the tests' crops.
 */
export interface Trim {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export const noTrim: Trim = Object.freeze({ left: 0, top: 0, right: 0, bottom: 0 });

/** What a drawing is written as. */
export type Output =
  /** WebP at the first of `qualities` that fits in `maxBytes`, else at the last. */
  | { kind: 'webp'; qualities: readonly number[]; maxBytes: number }
  /** PNG, lossless: a test's cropped copy of a picture. */
  | { kind: 'png' }
  /** The canvas's RGBA bytes, row by row: what a fingerprint is taken from. */
  | { kind: 'pixels' };

/**
 * How a picture is drawn, after any trim: cropped, centred, to the largest rectangle of `aspect`
 * (width over height; the target's own by default), then scaled to `width` × `height`.
 */
export interface Drawing {
  width: number;
  height: number;
  aspect?: number;
  output: Output;
}

/** A picture drawn: its bytes, and for WebP the quality it was written at and whether it fitted. */
export interface Drawn {
  bytes: Buffer;
  /** The quality the WebP was written at; `null` for PNG and pixels. */
  quality: number | null;
  /** Whether the WebP fitted its limit; always true for PNG and pixels. */
  fits: boolean;
  /** The source's own size. */
  natural: { width: number; height: number };
}

interface DrawRequest {
  dataUrl: string;
  width: number;
  height: number;
  aspect: number;
  trims: readonly Trim[];
  output: Output;
}

interface DrawResult {
  base64: string;
  quality: number | null;
  fits: boolean;
  natural: { width: number; height: number };
}

/**
 * What runs in the page, defining `heroesimDraw(request)`. The picture is decoded once, then for each
 * trim it is trimmed, cropped, centred, to the largest rectangle of the aspect, and scaled to the
 * target with the smoothing at its highest. So an upload of 896 × 1200 loses 2⅔ px from its top and
 * bottom and is exactly 3 × 4 (a canvas takes a fractional source rectangle): the cropping v1.1.2's
 * `web/scripts/convert-picture.mjs` did (DL-125 item 11).
 *
 * It is plain JavaScript in a string, not a function handed to `page.evaluate`, because tsx
 * compiles the tool keeping functions' names through a helper the page does not have.
 */
const drawScript = String.raw`
globalThis.heroesimDraw = async ({ dataUrl, width, height, aspect, trims, output }) => {
  const image = new Image();
  image.src = dataUrl;
  await image.decode();
  const [w, h] = [image.naturalWidth, image.naturalHeight];
  const natural = { width: w, height: h };
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';

  const toBase64 = (bytes) => {
    let binary = '';
    for (let index = 0; index < bytes.length; index += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
    }
    return btoa(binary);
  };
  const encode = async (type, quality) => {
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, type, quality));
    if (blob === null || blob.type !== type) throw new Error('Chromium wrote no ' + type);
    return new Uint8Array(await blob.arrayBuffer());
  };

  const results = [];
  for (const trim of trims) {
    const [tx, ty] = [w * trim.left, h * trim.top];
    const [tw, th] = [w * (1 - trim.left - trim.right), h * (1 - trim.top - trim.bottom)];
    const scale = Math.min(tw / aspect, th);
    const [sw, sh] = [aspect * scale, scale];
    const [sx, sy] = [tx + (tw - sw) / 2, ty + (th - sh) / 2];
    context.clearRect(0, 0, width, height);
    context.drawImage(image, sx, sy, sw, sh, 0, 0, width, height);
    if (output.kind === 'pixels') {
      results.push({ base64: toBase64(context.getImageData(0, 0, width, height).data), quality: null, fits: true, natural });
    } else if (output.kind === 'png') {
      results.push({ base64: toBase64(await encode('image/png')), quality: null, fits: true, natural });
    } else {
      let last = null;
      for (const quality of output.qualities) {
        last = { bytes: await encode('image/webp', quality), quality, fits: false };
        if (last.bytes.length <= output.maxBytes) {
          last.fits = true;
          break;
        }
      }
      if (last === null) throw new Error('no quality to write the WebP at');
      results.push({ base64: toBase64(last.bytes), quality: last.quality, fits: last.fits, natural });
    }
  }
  return results;
};
`;

/** A running Chromium, which draws pictures until it is closed. */
export interface Chromium {
  /** Draws a picture, given as a `data:` URL, trimmed by `trim`. */
  draw(dataUrl: string, drawing: Drawing, trim?: Trim): Promise<Drawn>;
  /** Draws a picture once for each trim, decoding it once. */
  drawEach(dataUrl: string, drawing: Drawing, trims: readonly Trim[]): Promise<Drawn[]>;
  close(): Promise<void>;
}

/** Whether Playwright's Chromium is installed (`npx playwright install chromium`). */
export function chromiumInstalled(): boolean {
  try {
    return existsSync(chromium.executablePath());
  } catch {
    return false;
  }
}

/** Launches Chromium, with a pool of worker pages that drawings use. */
export async function launchChromium(concurrency = 1): Promise<Chromium> {
  let browser: Browser;
  try {
    browser = await chromium.launch();
  } catch (error) {
    const reason = error instanceof Error ? error.message.split('\n')[0] : String(error);
    throw new Error(`Chromium did not start (${reason}); install it with \`npx playwright install chromium\``, { cause: error });
  }
  const pages: Page[] = [];
  for (let i = 0; i < Math.max(1, concurrency); i += 1) {
    const page: Page = await browser.newPage();
    await page.evaluate(drawScript);
    pages.push(page);
  }
  const available: Page[] = [...pages];
  const waiters: ((page: Page) => void)[] = [];
  const acquire = (): Promise<Page> => {
    const page = available.pop();
    if (page !== undefined) return Promise.resolve(page);
    return new Promise((resolve) => waiters.push(resolve));
  };
  const release = (page: Page) => {
    const waiter = waiters.shift();
    if (waiter !== undefined) waiter(page);
    else available.push(page);
  };

  const drawEach = async (dataUrl: string, { width, height, aspect = width / height, output }: Drawing, trims: readonly Trim[]): Promise<Drawn[]> => {
    const page = await acquire();
    try {
      const request: DrawRequest = { dataUrl, width, height, aspect, trims, output };
      const results = await page.evaluate(
        (drawn) => (globalThis as unknown as { heroesimDraw(request: DrawRequest): Promise<DrawResult[]> }).heroesimDraw(drawn),
        request,
      );
      return results.map((result) => ({
        bytes: Buffer.from(result.base64, 'base64'),
        quality: result.quality,
        fits: result.fits,
        natural: result.natural,
      }));
    } finally {
      release(page);
    }
  };
  return {
    async draw(dataUrl, drawing, trim = noTrim) {
      const [drawn] = await drawEach(dataUrl, drawing, [trim]);
      if (drawn === undefined) throw new Error('Chromium drew nothing');
      return drawn;
    },
    drawEach,
    async close() {
      await browser.close();
    },
  };
}

/** Runs `work` with a Chromium, and closes it afterwards whatever happens. */
export async function withChromium<T>(work: (chromium: Chromium) => Promise<T>, concurrency = 1): Promise<T> {
  const running = await launchChromium(concurrency);
  try {
    return await work(running);
  } finally {
    await running.close();
  }
}

