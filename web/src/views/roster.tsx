// The Roster with Hero pages (M7-S3; the CLI's `show roster` and `show hero`): the player's Heroes
// and what the Guild holds, and one Hero's page in their place when chosen. No router (M7 §0):
// which Hero is open is this section's own state, and "Back to the Roster" closes the page. A
// Hero's page offers equip, unequip and transfer out (part 2, DL-73).

import type { HeroId, WorldDocument } from '@heroesim/engine';
import { useMemo, useState } from 'react';
import type { GameAction } from '../state/reducer';
import { heldView, rosterView } from '../state/selectors';
import { HeroPage } from './hero-page';
import { Section } from './section';

export function Roster({ document, busy, play }: { document: WorldDocument; busy: boolean; play: (action: GameAction) => void }) {
  const rows = useMemo(() => rosterView(document), [document]);
  const held = useMemo(() => heldView(document), [document]);
  const [open, setOpen] = useState<HeroId | null>(null);
  return (
    <Section
      id="roster"
      title="Roster"
      help={
        "Your Heroes and what the Guild holds. Open a Hero's page for their Stats with hints of how far each may grow, " +
        'their gear and their History; from it, put gear the Guild holds on them, take it off, or transfer them to another Guild.'
      }
    >
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
        <HeroPage key={open} document={document} heroId={open} onBack={() => setOpen(null)} play={play} busy={busy} />
      )}
    </Section>
  );
}
