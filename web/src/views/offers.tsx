// Transfer Offers (M7-S3 part 2; the CLI's `show offers`, `accept` and `decline`, M6-S2): each
// offer a Rival has made for one of the player's Heroes, with who offers what for whom and until
// when, and the two answers. The engine's `acceptTransfer` and `declineTransfer` decide.

import type { WorldDocument } from '@heroesim/engine';
import { useMemo } from 'react';
import type { GameAction } from '../state/reducer';
import { offersView } from '../state/trade-views';
import { Section } from './section';

export function Offers({ document, busy, play }: { document: WorldDocument; busy: boolean; play: (action: GameAction) => void }) {
  const view = useMemo(() => offersView(document), [document]);
  return (
    <Section
      id="offers"
      title="Transfer Offers"
      help={
        'A Rival’s bid for one of your Heroes waits here until you accept it, decline it or it expires. Accepting sends ' +
        'the Hero to that Guild for the fee; their gear stays with you, and the Heroes left behind who held them in high ' +
        'Regard lose Morale.'
      }
    >
      {view === null || view.offers.length === 0 ? (
        <p>No Transfer Offer stands for {view?.guildName ?? 'your Guild'}’s Heroes.</p>
      ) : (
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
      )}
    </Section>
  );
}
