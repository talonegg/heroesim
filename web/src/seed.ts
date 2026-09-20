/**
 * Seeds are made here, in the front end, and handed to the engine as a plain string —
 * the engine has no random of its own (ADR-0001). A seed that reads like words is easier
 * to write down and to say out loud than a hex blob, and easier to spot in a test.
 */

const FIRST = [
  'amber',
  'ash',
  'bramble',
  'cinder',
  'copper',
  'fen',
  'flint',
  'frost',
  'gale',
  'harrow',
  'iron',
  'kestrel',
  'lantern',
  'marsh',
  'oak',
  'quarry',
  'raven',
  'salt',
  'thorn',
  'willow',
];

const SECOND = [
  'bridge',
  'crossing',
  'ford',
  'gate',
  'hollow',
  'keep',
  'mire',
  'reach',
  'ridge',
  'road',
  'run',
  'shore',
  'span',
  'stair',
  'watch',
  'well',
];

/** Random whole numbers below `bound`, preferring the platform's own generator. */
function randomBelow(bound: number): number {
  const crypto = globalThis.crypto;
  if (crypto?.getRandomValues) {
    const buffer = new Uint32Array(1);
    crypto.getRandomValues(buffer);
    return (buffer[0] ?? 0) % bound;
  }
  return Math.floor(Math.random() * bound);
}

/** A fresh, random-looking seed such as `thorn-hollow-4712`. */
export function randomSeed(): string {
  const first = FIRST[randomBelow(FIRST.length)] ?? 'thorn';
  const second = SECOND[randomBelow(SECOND.length)] ?? 'hollow';
  const number = String(randomBelow(10000)).padStart(4, '0');
  return `${first}-${second}-${number}`;
}
