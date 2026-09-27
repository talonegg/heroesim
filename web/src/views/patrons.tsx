// The Patrons (M7-S3 part 2; the CLI's `show patrons`, M4-S5): each Patron, their Sphere, and their
// Regard for the player's Guild as a band, which weighs on how often they post to the Board.

import type { WorldDocument } from '@heroesim/engine';
import { useMemo } from 'react';
import { patronsView } from '../state/world-views';
import { Section } from './section';

export function Patrons({ document, guildName }: { document: WorldDocument; guildName: string }) {
  const rows = useMemo(() => patronsView(document), [document]);
  return (
    <Section
      id="patrons"
      title="Patrons"
      help={
        'Those who offer Quests, each of a walk of life. A Patron’s Regard for your Guild rises and falls with how their ' +
        'Quests go, weighs on how often they post to the Board, and recovers toward neutral with time.'
      }
    >
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
    </Section>
  );
}
