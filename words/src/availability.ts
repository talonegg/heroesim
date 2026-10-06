// Why a Hero cannot go, in words (v1.1.6-S11, DL-186 item 1): after their name, as a refusal and a
// Party's preview say it; as the Board's chip says it; and why their Gear cannot be changed. The
// reasons are the engine's (`unavailability`, `gearUnavailability`); the words only name them. The
// CLI's `dispatch.ts` and `equip.ts` and the page's `rejections.ts` and `selectors.ts` each held a
// copy until v1.1.6-S11; the CLI's "their gear" became the page's "their Gear", a glossary term.

import type { GearUnavailability, Unavailability } from '@heroesim/engine';

/** Why a Hero cannot go on a Quest, after their name: `is injured`, then `and cannot go`. */
export const unavailableWords: Readonly<Record<Unavailability, string>> = Object.freeze({
  injured: 'is injured',
  dead: 'is dead',
  retired: 'has retired',
  'in-party': 'is away with a Party',
});

/**
 * Where a Hero who can go is, beside the Board's chip words for one who cannot: a Hero's whereabouts,
 * and the first choice of the Roster's filter by availability (DL-206 items 12 and 25, DL-213),
 * capitalised where it is made.
 */
export const atHallWords = 'at the Hall';

/** The short word of the Board's chip for a Hero who cannot go (v1.1.5-S11, DL-169 item 2), capitalised where it is made. */
export const unavailableChipWords: Readonly<Record<Unavailability, string>> = Object.freeze({
  injured: 'injured',
  dead: 'dead',
  retired: 'retired',
  'in-party': 'away',
});

/** Why a Hero's Gear cannot be changed, after their name (`equip`, `unequip`). */
export const gearUnavailableWords: Readonly<Record<GearUnavailability, string>> = Object.freeze({
  dead: 'is dead',
  retired: 'has retired',
  'in-party': 'is away on a Quest, and their Gear is with them',
});
