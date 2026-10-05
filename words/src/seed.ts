// A readable seed for a new game (INPUTS 3.1): `amber-fox-4821`, for the CLI's `new` without `--seed`
// and the page's new-game form (M7-S3), one copy since v1.1.6-S11 (DL-186 item 1). The engine takes
// any string as a seed; this only makes one a person can read back and type. It draws from the
// `random` it is given, `Math.random` in play, which is allowed outside the engine (N1, ADR-0001).

const adjectives = [
  'amber', 'ashen', 'bold', 'brisk', 'copper', 'dusky', 'gilded', 'grey',
  'hollow', 'iron', 'mossy', 'quiet', 'russet', 'silver', 'stony', 'wild',
] as const;

const animals = [
  'badger', 'boar', 'crow', 'eagle', 'fox', 'hare', 'heron', 'hound',
  'lynx', 'otter', 'owl', 'raven', 'stag', 'stoat', 'wolf', 'wren',
] as const;

/** A draw in `[0, 1)`, as `Math.random` returns. */
export type Random = () => number;

function pick<T>(random: Random, items: readonly T[]): T {
  const item = items[Math.floor(random() * items.length)];
  if (item === undefined) throw new RangeError('A random draw must lie in [0, 1)');
  return item;
}

/** `<adjective>-<animal>-<four digits>`: one of 2,560,000 seeds. */
export function readableSeed(random: Random): string {
  const adjective = pick(random, adjectives);
  const animal = pick(random, animals);
  const digits = String(Math.floor(random() * 10_000)).padStart(4, '0');
  return `${adjective}-${animal}-${digits}`;
}
