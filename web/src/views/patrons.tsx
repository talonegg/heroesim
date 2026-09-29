// The Patrons (M7-S3 part 2; the CLI's `show patrons`, M4-S5): each Patron, their Sphere, and their
// Regard for the player's Guild as a band, which weighs on how often they post to the Board.
// A part of the Rankings (M9-S3, DL-103); the one Patrons table is M9-S6's.

import type { WorldDocument } from '@heroesim/engine';
import { useMemo } from 'react';
import { patronsView } from '../state/world-views';
import { Part } from './section';

export function Patrons({ document, guildName }: { document: WorldDocument; guildName: string }) {
  const rows = useMemo(() => patronsView(document), [document]);
  return (
    <Part id="patrons">
      {rows.length === 0 ? (
        <p>No Patron yet.</p>
      ) : (
        <ul>
          {rows.map((row) => (
            <li key={row.patronId}>
              {row.name}, of the {row.sphere}
              {row.regard === null ? '' : `: Regard for ${guildName} ${row.regard}`}
            </li>
          ))}
        </ul>
      )}
    </Part>
  );
}
