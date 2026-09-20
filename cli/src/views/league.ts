/**
 * The League (E5-S6, E7-S3): every Guild ordered by Standing, your row marked with a
 * leading `>` and **not moved** for it, with Standing's derivation in the footer so that
 * nobody reads it as a score. `league(career)` is a view of something already modelled;
 * nothing here orders, scores or ranks anything.
 */

import { league, type Career } from '@heroesim/engine';
import { STANDING_EXPLAINED } from '@heroesim/narrate';
import { hanging, heading, pad, padLeft, wrap, wrapAt, WIDE } from '../screen.js';

/** Every Guild by Standing, yours marked, with the footer that says what Standing is. */
export function leagueLines(career: Career, width: number): string[] {
  const lines = [heading('The League', 'League', width)];
  const rows = league(career);
  const widest = rows.reduce((most, row) => Math.max(most, row.name.length), 0);
  for (const row of rows) {
    const mark = row.isPlayer ? '>' : ' ';
    const size = `${row.rosterSize} on the Roster`;
    const wide = `  ${mark} ${pad(row.name, widest)}  ${padLeft(String(row.standing), 4)}  ${size}`;
    if (width >= WIDE && wide.length <= width) {
      lines.push(wide);
      continue;
    }
    // Below 80 the table becomes stacked label-and-value lines rather than being cut.
    // The marker keeps its column, which a plain wrap would collapse.
    lines.push(...hanging(`${mark} `, row.name, width));
    lines.push(...wrapAt(`Standing ${row.standing}, ${size}`, width, 4));
  }
  lines.push('');
  for (const line of wrap(STANDING_EXPLAINED, width)) lines.push(line);
  return lines;
}
