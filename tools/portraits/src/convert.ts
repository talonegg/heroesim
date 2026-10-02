// Conversion (DL-135 item 11, v1.1.3-S2), moved here from v1.1.2's `web/scripts/convert-picture.mjs`
// and its cropping to 3 × 4 kept: each upload becomes a picture of 480 × 640 within 120 kB, and a
// thumbnail of 160 × 213 of about 10 kB, both WebP, drawn in Chromium.

import type { Chromium, Drawn } from './chromium.js';

/** A Portrait's picture, and the most it may weigh (DL-134 item 9). */
export const picture = { width: 480, height: 640, maxBytes: 120_000 } as const;

/** A Portrait's thumbnail, `<key>.thumb.webp`, of about 10 kB (DL-135 item 9). */
export const thumbnail = { width: 160, height: 213, maxBytes: 12_000 } as const;

/** The qualities tried, from 0.8 down, until the WebP fits; below 0.5 a drawing loses too much. */
export const qualities: readonly number[] = [0.8, 0.75, 0.7, 0.65, 0.6, 0.55, 0.5];

/** An upload the tool cannot make fit, with the size it came to at the lowest quality. */
export class Refusal extends Error {
  constructor(
    message: string,
    readonly bytes: number,
  ) {
    super(message);
    this.name = 'Refusal';
  }
}

/** An upload converted: its picture and its thumbnail. */
export interface Converted {
  picture: Drawn;
  thumbnail: Drawn;
}

/**
 * Converts an upload, given as a `data:` URL: cropped, centred, to 3 × 4, then written at 480 × 640
 * and 160 × 213, each at the first quality that fits. Where the upload is named, `name` says so.
 *
 * @throws Refusal where either cannot fit, naming its size at the lowest quality
 */
export async function convert(chromium: Chromium, dataUrl: string, name: string): Promise<Converted> {
  const drawn = async (size: { width: number; height: number; maxBytes: number }, what: string): Promise<Drawn> => {
    const result = await chromium.draw(dataUrl, {
      width: size.width,
      height: size.height,
      aspect: 3 / 4,
      output: { kind: 'webp', qualities, maxBytes: size.maxBytes },
    });
    if (!result.fits) {
      throw new Refusal(
        `${name}: its ${what} is ${result.bytes.length} bytes at quality ${result.quality}, over the ${size.maxBytes} allowed; ` +
          'it is refused',
        result.bytes.length,
      );
    }
    return result;
  };
  return { picture: await drawn(picture, 'picture'), thumbnail: await drawn(thumbnail, 'thumbnail') };
}
