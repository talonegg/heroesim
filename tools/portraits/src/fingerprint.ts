// The fingerprint (DL-135 item 11, v1.1.3-S2): difference hashes (dHash) of a picture drawn small in
// Chromium, so that an upload already in the game is found, whatever its format, size or crop.
//
// - *The drawing.* The picture is cropped to 3 × 4, as a converted one is, so an original and its
//   WebP draw the same part of the drawing, and drawn at 192 × 256. It is turned grey and blurred.
// - *The hash.* The grey is averaged to a grid of 17 × 16 and one of 16 × 17. Each of the 512 bits
//   says whether a cell is brighter than the one to its right, or the one below.
// - *The trimmed hashes.* A dHash is thrown by a crop that moves the drawing, so the picture is also
//   hashed with 5% trimmed: all round, from each edge and from each corner. Two pictures' distance
//   is the fewest bits in which one's hash differs from the other's, or from a trimmed hash of it.
//
// Two pictures are similar within the register's `similarWithin` bits, tuned on the owner's 40
// (DL-136) and written in the register.

import type { Chromium, Trim } from './chromium.js';

/** The hash grid's side: 16, so 256 bits across and 256 down. */
export const hashSide = 16;

/** A hash's length in bits. */
export const hashBits = 2 * hashSide * hashSide;

/** The size a picture is drawn at to be hashed: 3 × 4. */
export const drawnWidth = 192;
export const drawnHeight = 256;

/** The blur's radius in drawn pixels: a box blur twice over, near enough a Gaussian. */
const blurRadius = 3;

/**
 * The trims hashed besides the whole picture: 5% all round (2½% from each edge), from each edge, and
 * from each corner (5% from each of its two edges).
 */
export const fingerprintTrims: readonly Trim[] = Object.freeze([
  { left: 0.025, top: 0.025, right: 0.025, bottom: 0.025 },
  { left: 0.05, top: 0, right: 0, bottom: 0 },
  { left: 0, top: 0.05, right: 0, bottom: 0 },
  { left: 0, top: 0, right: 0.05, bottom: 0 },
  { left: 0, top: 0, right: 0, bottom: 0.05 },
  { left: 0.05, top: 0.05, right: 0, bottom: 0 },
  { left: 0, top: 0.05, right: 0.05, bottom: 0 },
  { left: 0, top: 0, right: 0.05, bottom: 0.05 },
  { left: 0.05, top: 0, right: 0, bottom: 0.05 },
]);

/** A picture's fingerprint: the hash of the whole, and the hashes of its trims, in hexadecimal. */
export interface Fingerprint {
  hash: string;
  trimmed: string[];
}

/** Greys of RGBA pixels, by the luma weights of Rec. 601. */
function greys(pixels: Uint8Array): Float64Array {
  const grey = new Float64Array(pixels.length / 4);
  for (let index = 0; index < grey.length; index += 1) {
    grey[index] = 0.299 * (pixels[index * 4] ?? 0) + 0.587 * (pixels[index * 4 + 1] ?? 0) + 0.114 * (pixels[index * 4 + 2] ?? 0);
  }
  return grey;
}

/** One pass of a box blur, across or down, the edges averaging what lies inside. */
function boxPass(source: Float64Array, width: number, height: number, across: boolean): Float64Array {
  const out = new Float64Array(source.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let sum = 0;
      let count = 0;
      for (let step = -blurRadius; step <= blurRadius; step += 1) {
        const [sx, sy] = across ? [x + step, y] : [x, y + step];
        if (sx < 0 || sy < 0 || sx >= width || sy >= height) continue;
        sum += source[sy * width + sx] ?? 0;
        count += 1;
      }
      out[y * width + x] = sum / count;
    }
  }
  return out;
}

function blur(grey: Float64Array, width: number, height: number): Float64Array {
  let out = grey;
  for (let pass = 0; pass < 2; pass += 1) out = boxPass(boxPass(out, width, height, true), width, height, false);
  return out;
}

/** The grey averaged over a grid of `columns` × `rows` cells, each weighted by the area it covers. */
function averaged(grey: Float64Array, width: number, height: number, columns: number, rows: number): Float64Array {
  const out = new Float64Array(columns * rows);
  for (let row = 0; row < rows; row += 1) {
    const [y0, y1] = [(row * height) / rows, ((row + 1) * height) / rows];
    for (let column = 0; column < columns; column += 1) {
      const [x0, x1] = [(column * width) / columns, ((column + 1) * width) / columns];
      let sum = 0;
      let area = 0;
      for (let y = Math.floor(y0); y < Math.ceil(y1); y += 1) {
        const dy = Math.min(y + 1, y1) - Math.max(y, y0);
        for (let x = Math.floor(x0); x < Math.ceil(x1); x += 1) {
          const weight = (Math.min(x + 1, x1) - Math.max(x, x0)) * dy;
          sum += (grey[y * width + x] ?? 0) * weight;
          area += weight;
        }
      }
      out[row * columns + column] = sum / area;
    }
  }
  return out;
}

/** Bits as hexadecimal, most significant first. */
function hex(bits: readonly boolean[]): string {
  let out = '';
  for (let index = 0; index < bits.length; index += 4) {
    const nibble = bits.slice(index, index + 4).reduce((value, bit) => (value << 1) | (bit ? 1 : 0), 0);
    out += nibble.toString(16);
  }
  return out;
}

/** The dHash of RGBA pixels `width` × `height`, in hexadecimal: across, row by row, then down. */
export function dHash(pixels: Uint8Array, width: number = drawnWidth, height: number = drawnHeight): string {
  if (pixels.length !== width * height * 4) throw new Error(`${width} × ${height} pixels were wanted, and ${pixels.length / 4} given`);
  const grey = blur(greys(pixels), width, height);
  const side = hashSide;
  const bits: boolean[] = [];
  const across = averaged(grey, width, height, side + 1, side);
  for (let row = 0; row < side; row += 1) {
    for (let column = 0; column < side; column += 1) {
      bits.push((across[row * (side + 1) + column] ?? 0) > (across[row * (side + 1) + column + 1] ?? 0));
    }
  }
  const down = averaged(grey, width, height, side, side + 1);
  for (let row = 0; row < side; row += 1) {
    for (let column = 0; column < side; column += 1) {
      bits.push((down[row * side + column] ?? 0) > (down[(row + 1) * side + column] ?? 0));
    }
  }
  return hex(bits);
}

const popCount = [0, 1, 1, 2, 1, 2, 2, 3, 1, 2, 2, 3, 2, 3, 3, 4];

/** The number of bits two hashes differ in: their Hamming distance. */
export function hashDistance(a: string, b: string): number {
  if (a.length !== b.length) throw new Error(`hashes of ${a.length * 4} and ${b.length * 4} bits cannot be compared`);
  let bits = 0;
  for (let index = 0; index < a.length; index += 1) {
    bits += popCount[Number.parseInt(a[index] ?? '0', 16) ^ Number.parseInt(b[index] ?? '0', 16)] ?? 0;
  }
  return bits;
}

/**
 * Two pictures' distance: the fewest bits in which one's whole hash differs from the other's whole
 * hash or trimmed hashes, either way round. A picture cropped by up to about 5% is near its whole.
 */
export function distance(a: Fingerprint, b: Fingerprint): number {
  let least = hashDistance(a.hash, b.hash);
  for (const trimmed of a.trimmed) least = Math.min(least, hashDistance(trimmed, b.hash));
  for (const trimmed of b.trimmed) least = Math.min(least, hashDistance(a.hash, trimmed));
  return least;
}

/** The fingerprint of a picture, given as a `data:` URL, drawn in Chromium. */
export async function fingerprint(chromium: Chromium, dataUrl: string): Promise<Fingerprint> {
  const drawn = await chromium.drawEach(
    dataUrl,
    { width: drawnWidth, height: drawnHeight, output: { kind: 'pixels' } },
    [{ left: 0, top: 0, right: 0, bottom: 0 }, ...fingerprintTrims],
  );
  const [whole, ...trimmed] = drawn.map((each) => dHash(new Uint8Array(each.bytes)));
  if (whole === undefined) throw new Error('Chromium drew nothing to fingerprint');
  return { hash: whole, trimmed };
}
