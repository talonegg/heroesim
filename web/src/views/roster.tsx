// The Roster with Hero pages (M7-S3; the CLI's `show roster` and `show hero`): the player's Heroes
// and what the Guild holds, and one Hero's page in their place when chosen. No router (M7 §0):
// which Hero is open is this section's own state, and "Back to the Roster" closes the page.

import type { HeroId, WorldDocument } from '@heroesim/engine';
import { useMemo, useState } from 'react';
import { heldView, rosterView } from '../state/selectors';
import { HeroPage } from './hero-page';

export function Roster({ document }: { document: WorldDocument }) {
  const rows = useMemo(() => rosterView(document), [document]);
  const held = useMemo(() => heldView(document), [document]);
  const [open, setOpen] = useState<HeroId | null>(null);
  return (
    <section id="roster" className="panel" aria-labelledby="roster-heading">
      <h2 id="roster-heading" tabIndex={-1}>
        Roster
      </h2>
      {open === null ? (
        <>
          <p>
            {rows.length === 0 ? 'The Roster is empty.' : `${rows.length} ${rows.length === 1 ? 'Hero' : 'Heroes'} on the Roster.`}
          </p>
          <ul className="cards">
            {rows.map((row) => (
              <li key={row.heroId} className="card hero-row">
                <button type="button" className="link" onClick={() => setOpen(row.heroId)}>
                  {row.name}
                </button>
                <p>
                  {row.className}, Level {row.level}, age {row.age}. Morale {row.morale}.
                </p>
                <p className="subtle">{row.whereabouts}</p>
              </li>
            ))}
          </ul>
          <h3>What the Guild holds</h3>
          {held.length === 0 ? (
            <p>Nothing.</p>
          ) : (
            <ul>
              {held.map((row) => (
                <li key={row.key}>
                  {row.quantity === 1 ? row.name : `${row.quantity} × ${row.name}`}
                  {row.kind === '' ? '' : `, ${row.kind}`}
                  {row.modifies === '' ? '' : ` (${row.modifies})`}
                </li>
              ))}
            </ul>
          )}
        </>
      ) : (
        <HeroPage key={open} document={document} heroId={open} onBack={() => setOpen(null)} />
      )}
    </section>
  );
}
