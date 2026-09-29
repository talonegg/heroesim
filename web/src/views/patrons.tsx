// The Patrons (M7-S3 part 2; the CLI's `show patrons`, M4-S5): each Patron, their Sphere, and their
// Regard for the player's Guild as a band, which weighs on how often they post to the Board.
// A part of the Rankings (M9-S3, DL-103); the one Patrons table is M9-S6's. Each Patron opens their
// History (M9-S5, DL-105).

import type { EntityId, WorldDocument } from '@heroesim/engine';
import { useMemo } from 'react';
import { patronsView } from '../state/world-views';
import { useHistoryLinks } from './history-entries';
import { Part } from './section';

export function Patrons({ document, guildName }: { document: WorldDocument; guildName: string }) {
  const rows = useMemo(() => patronsView(document), [document]);
  const links = useHistoryLinks();
  return (
    <Part id="patrons">
      {rows.length === 0 ? (
        <p>No Patron yet.</p>
      ) : (
        <ul className={links === null ? undefined : 'rows'}>
          {rows.map((row) => (
            <li key={row.patronId}>
              <span>
                {row.name}, of the {row.sphere}
                {row.regard === null ? '' : `: Regard for ${guildName} ${row.regard}`}
              </span>
              {links === null ? null : (
                <button type="button" className="button--quiet" aria-label={`Read the History of ${row.name}`} onClick={() => links.onHistory(row.patronId as EntityId)}>
                  History
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </Part>
  );
}
