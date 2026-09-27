// The Unattached pool (M7-S3 part 2; the CLI's `show pool` and `recruit`): each Hero on no Roster
// with the signing fee the player's Guild would pay and whether they would sign for its Fame, a
// Recruit button, and their page when opened, which says the same beside their Stats and hints.

import type { HeroId, WorldDocument } from '@heroesim/engine';
import { useMemo, useState } from 'react';
import type { GameAction } from '../state/reducer';
import { poolView } from '../state/trade-views';
import { HeroPage } from './hero-page';
import { Section } from './section';

export function Pool({ document, busy, play }: { document: WorldDocument; busy: boolean; play: (action: GameAction) => void }) {
  const view = useMemo(() => poolView(document), [document]);
  const [open, setOpen] = useState<HeroId | null>(null);
  return (
    <Section
      id="pool"
      title="Unattached pool"
      help={
        'Heroes on no Roster, whom any Guild may sign for a signing fee. A Hero of a higher Level will not sign for a ' +
        'Guild whose Fame is below what their Level asks. Recruit signs one to your Roster for the fee; open a Hero to ' +
        'see their Stats first.'
      }
    >
      {open === null ? (
        <>
          <p>{view.rows.length === 0 ? 'The pool is empty.' : `${view.rows.length} ${view.rows.length === 1 ? 'Hero' : 'Heroes'} in the pool.`}</p>
          {view.note === null ? null : <p className="subtle">{view.note}</p>}
          <ul className="cards">
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
                  <button type="button" disabled={busy} onClick={() => play({ kind: 'recruit', heroId: row.heroId })}>
                    Recruit {row.name}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <HeroPage key={open} document={document} heroId={open} onBack={() => setOpen(null)} backLabel="Back to the pool" play={play} busy={busy} />
      )}
    </Section>
  );
}
