/**
 * The Heroes who are no longer on the Roster (E7-S3): who left, how, when, and what was
 * last said about it. A separate page, reachable from the Roster and never shown on it —
 * a dead or departed Hero leaves the Roster but not the Guild's history (CONTEXT.md).
 */

import type { Career } from '@heroesim/engine';
import { exitReason, exitWords, formatDay } from '@heroesim/narrate';
import { heading, wrapAt } from '../screen.js';
import { statsOf, traitNames } from './shared.js';

/** Everybody who has left, newest first. */
export function formerLines(career: Career, width: number): string[] {
  const lines = [heading('Former Heroes', 'Former', width)];
  const gone = [...career.guild.formerHeroes].sort(
    (left, right) => (right.exit?.onDay ?? 0) - (left.exit?.onDay ?? 0),
  );
  if (gone.length === 0) {
    lines.push(...wrapAt('Nobody has left the Guild yet.', width, 2));
    return lines;
  }
  for (const hero of gone) {
    lines.push('');
    lines.push(...wrapAt(`${hero.name}, ${hero.age}`, width, 2));
    const exit = hero.exit;
    if (exit !== undefined) {
      // The reason only where it says more than the going already did: a Retirement's
      // reason on the Career *is* the exit words, and this read "reached the end of a
      // working life, Year 1, Day 20: reached the end of a working life" (DL-27).
      const why = exitReason(exit.kind, exit.reason);
      lines.push(
        ...wrapAt(
          `${exitWords(exit.kind)}, ${formatDay(exit.onDay, career)}` +
            `${why === undefined ? '' : `: ${why}`}`,
          width,
          4,
        ),
      );
    }
    lines.push(...wrapAt(`Might/Craft/Nerve/Guile ${statsOf(hero)}`, width, 4));
    lines.push(...wrapAt(`Traits: ${traitNames(hero)}`, width, 4));
  }
  return lines;
}
