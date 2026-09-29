// Transfer Offers (M7-S3 part 2; the CLI's `show offers`, `accept` and `decline`, M6-S2): each
// offer a Rival has made for one of the player's Heroes, with who offers what for whom and until
// when, and the two answers. The engine's `acceptTransfer` and `declineTransfer` decide.
//
// A part of the Roster (M9-S3, DL-103), drawn only while an offer stands: when none does, the
// navigation's Roster carries no dot, and the part says nothing (the review's A5).

import type { WorldDocument } from '@heroesim/engine';
import { useMemo } from 'react';
import type { GameAction } from '../state/reducer';
import { offersView } from '../state/trade-views';
import { Part } from './section';

export function Offers({ document, busy, play }: { document: WorldDocument; busy: boolean; play: (action: GameAction) => void }) {
  const view = useMemo(() => offersView(document), [document]);
  if (view === null || view.offers.length === 0) return null;
  return (
    <Part id="offers" className="part--notice">
      <ul className="cards">
        {view.offers.map((offer) => (
          <li key={offer.offerId} className="card">
            <p>{offer.sentence}</p>
            <div className="actions">
              <button type="button" className="button--primary" disabled={busy} onClick={() => play({ kind: 'acceptTransfer', offerId: offer.offerId })}>
                Accept
              </button>
              <button type="button" disabled={busy} onClick={() => play({ kind: 'declineTransfer', offerId: offer.offerId })}>
                Decline
              </button>
            </div>
          </li>
        ))}
      </ul>
    </Part>
  );
}
