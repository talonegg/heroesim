// A Hero's Stat taken apart, in words (v1.1.6-S13, DL-186 item 3): the engine's `statBreakdown`
// gives each Stat's base, what each source adds, its effective value and whether its range held it;
// these words only name them, so the page's Roster sums no source itself (DL-199).

import type { StatParts, StatSource } from '@heroesim/engine';
import { signed } from './names.js';

/** Each source of a Stat's change, after `from`: `+2 from Gear`. */
export const statSourceWords: Readonly<Record<StatSource, string>> = Object.freeze({
  classBonus: "the Guildmaster's Class bonus",
  gear: 'Gear',
  traits: 'Traits',
});

/** Each source that moves a Stat, in the order the engine adds them, by its words; none that adds 0. */
export function statSourcesMoving(parts: Pick<StatParts, 'sources'>): { from: string; change: number }[] {
  return parts.sources.flatMap(({ source, change }) => (change === 0 ? [] : [{ from: statSourceWords[source], change }]));
}

/**
 * A Stat's base and each source that moves it, and its bound when its range held it:
 * `Base 10, +2 from Gear`, `Base 20, +1 from Gear, held at 20`; `null` when nothing moves it.
 */
export function statPartsWords(parts: StatParts): string | null {
  const moving = statSourcesMoving(parts);
  if (moving.length === 0 && !parts.clamped) return null;
  return [`Base ${parts.base}`, ...moving.map(({ from, change }) => `${signed(change)} from ${from}`), ...(parts.clamped ? [`held at ${parts.effective}`] : [])].join(', ');
}
