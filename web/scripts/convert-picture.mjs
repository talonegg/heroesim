/**
 * Converts a supplied picture for `media/` (DL-125 item 11, v1.1.2-S4): Chromium, through the
 * Playwright the page's specs already install, draws it to a canvas and writes WebP at about 80.
 * No image package joins the build, which only copies files. Run by hand when a picture is added,
 * never by the build:
 *
 *   node web/scripts/convert-picture.mjs <source> <target.webp> [--size 480x640] [--quality 0.8]
 *
 * A Portrait is 480 × 640 (the default), an Item's picture 256 × 256. The source is cropped, centred,
 * to the target's shape before it is scaled: the owner's 896 × 1200 drawings lose 5⅓ px of height,
 * 2⅔ from the top and 2⅔ from the bottom, both of them paper, so the crop is exactly 3 × 4 (a canvas
 * takes a fractional source rectangle). Prints the target's size in bytes.
 */

/* global document, Image -- the conversion runs in Chromium's page, through `page.evaluate`. */

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';

const usage = 'usage: node web/scripts/convert-picture.mjs <source> <target.webp> [--size 480x640] [--quality 0.8]';

/** The command line's source, target, size and quality. */
function parse(argv) {
  const [source, target, ...rest] = argv;
  if (source === undefined || target === undefined || !target.endsWith('.webp')) throw new Error(usage);
  let size = '480x640';
  let quality = 0.8;
  for (let index = 0; index < rest.length; index += 2) {
    const [flag, value] = [rest[index], rest[index + 1]];
    if (flag === '--size' && value !== undefined && /^\d+x\d+$/.test(value)) size = value;
    else if (flag === '--quality' && value !== undefined && Number(value) > 0 && Number(value) <= 1) quality = Number(value);
    else throw new Error(usage);
  }
  const [width, height] = size.split('x').map(Number);
  return { source, target, width, height, quality };
}

const mimeTypes = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };

async function convert({ source, target, width, height, quality }) {
  const mime = mimeTypes[path.extname(source).toLowerCase()];
  if (mime === undefined) throw new Error(`${source}: a JPEG, PNG or WebP is converted`);
  const dataUrl = `data:${mime};base64,${readFileSync(source).toString('base64')}`;
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    const result = await page.evaluate(
      async ({ dataUrl, width, height, quality }) => {
        const image = new Image();
        image.src = dataUrl;
        await image.decode();
        const [w, h] = [image.naturalWidth, image.naturalHeight];
        // The largest centred rectangle of the target's shape.
        const scale = Math.min(w / width, h / height);
        const [sw, sh] = [width * scale, height * scale];
        const [sx, sy] = [(w - sw) / 2, (h - sh) / 2];
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext('2d');
        context.imageSmoothingEnabled = true;
        context.imageSmoothingQuality = 'high';
        context.drawImage(image, sx, sy, sw, sh, 0, 0, width, height);
        const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/webp', quality));
        if (blob === null || blob.type !== 'image/webp') throw new Error('Chromium wrote no WebP');
        const bytes = new Uint8Array(await blob.arrayBuffer());
        let binary = '';
        for (const byte of bytes) binary += String.fromCharCode(byte);
        return { base64: btoa(binary), crop: { sx, sy, sw, sh }, natural: { w, h } };
      },
      { dataUrl, width, height, quality },
    );
    const bytes = Buffer.from(result.base64, 'base64');
    writeFileSync(target, bytes);
    const { sx, sy, sw, sh } = result.crop;
    console.log(
      `${target}: ${width} × ${height} WebP at ${quality}, ${bytes.length} bytes, from ${result.natural.w} × ${result.natural.h}` +
        ` cropped at ${sx.toFixed(2)}, ${sy.toFixed(2)} to ${sw.toFixed(2)} × ${sh.toFixed(2)}`,
    );
  } finally {
    await browser.close();
  }
}

try {
  await convert(parse(process.argv.slice(2)));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
