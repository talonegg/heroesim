// The Roster (M7-S3; the CLI's `show roster` and `show hero`): the player's Heroes, and one Hero's
// page in their place when chosen. No router (M7 §0): which Hero is open is this view's own state,
// and "Back to the Roster" closes the page. A Hero's page offers equip, unequip and transfer out
// (part 2, DL-73).
//
// A view of the shell (M9-S3, DL-103), with the Transfer Offers, only while one stands, and the
// Unattached pool as its parts. The Hero cards' redesign is M9-S6's.

import type { HeroId, WorldDocument } from '@heroesim/engine';
import { useMemo, useState } from 'react';
import type { GameAction } from '../state/reducer';
import { rosterView } from '../state/selectors';
import { HeroPage } from './hero-page';
import { Offers } from './offers';
import { Pool } from './pool';
import { View } from './section';

export function Roster({ document, busy, play }: { document: WorldDocument; busy: boolean; play: (action: GameAction) => void }) {
  const rows = useMemo(() => rosterView(document), [document]);
  const [open, setOpen] = useState<HeroId | null>(null);
  if (open !== null) {
    return (
      <View id="roster">
        <HeroPage key={open} document={document} heroId={open} onBack={() => setOpen(null)} play={play} busy={busy} />
      </View>
    );
  }
  return (
    <View id="roster">
      <p className="view__lead">{rows.length === 0 ? 'The Roster is empty.' : `${rows.length} ${rows.length === 1 ? 'Hero' : 'Heroes'} on the Roster.`}</p>
      {rows.length === 0 ? null : (
        <ul className="cards cards--grid" aria-label="Heroes on the Roster">
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
      )}
      <Offers document={document} busy={busy} play={play} />
      <Pool document={document} busy={busy} play={play} />
    </View>
  );
}
