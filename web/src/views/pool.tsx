// The Unattached pool (M7-S3 part 2; the CLI's `show pool` and `recruit`): each Hero on no Roster
// with the signing fee the player's Guild would pay and whether they would sign for its Fame, a
// Recruit button, and their page when opened, which says the same beside their Stats and hints.
//
// A part of the Roster (M9-S3, DL-103). Its rows, sorted by Class or fee, are M9-S6's.

import type { HeroId, WorldDocument } from '@heroesim/engine';
import { useMemo, useState } from 'react';
import type { GameAction } from '../state/reducer';
import { poolView } from '../state/trade-views';
import { HeroPage } from './hero-page';
import { Part } from './section';

export function Pool({ document, busy, play }: { document: WorldDocument; busy: boolean; play: (action: GameAction) => void }) {
  const view = useMemo(() => poolView(document), [document]);
  const [open, setOpen] = useState<HeroId | null>(null);
  return (
    <Part id="pool">
      {open === null ? (
        <>
          <p>{view.rows.length === 0 ? 'The pool is empty.' : `${view.rows.length} ${view.rows.length === 1 ? 'Hero' : 'Heroes'} in the pool.`}</p>
          {view.note === null ? null : <p className="subtle">{view.note}</p>}
          <ul className="cards cards--grid">
            {view.rows.map((row) => (
              <li key={row.heroId} className="card hero-row">
                <button type="button" className="link" onClick={() => setOpen(row.heroId)}>
                  {row.name}
                </button>
                <p>
                  {row.className}, Level {row.level}, age {row.age}. Morale {row.morale}. {row.background}.
                </p>
                <p>
                  Signing fee {row.fee} Wealth.{row.signs === null ? '' : ` Signs for your Guild: ${row.signs}.`}
                </p>
                <div className="actions">
                  <button type="button" aria-label={`Recruit ${row.name}`} disabled={busy} onClick={() => play({ kind: 'recruit', heroId: row.heroId })}>
                    Recruit
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <HeroPage key={open} document={document} heroId={open} onBack={() => setOpen(null)} backLabel="Back to the pool" play={play} busy={busy} level={4} />
      )}
    </Part>
  );
}
