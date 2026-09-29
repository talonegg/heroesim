// Transfer Offers (M7-S3 part 2; the CLI's `show offers`, `accept` and `decline`, M6-S2): each
// offer a Rival has made for one of the player's Heroes, with who offers what for whom and until
// when, and the two answers. The engine's `acceptTransfer` and `declineTransfer` decide.
//
// A part of the Roster (M9-S3, DL-103), drawn only while an offer stands: when none does, the
// navigation's Roster carries no dot, and the part says nothing (the review's A5). Accept asks first
// (M9-S6, DL-106; the review's E4), as a Transfer out does: the confirmation states the fee and what
// letting the Hero go costs, in the words `offersView` gives.

import type { OfferId, WorldDocument } from '@heroesim/engine';
import { useMemo, useRef, useState } from 'react';
import type { GameAction } from '../state/reducer';
import { offersView, type OfferRow } from '../state/trade-views';
import { Part } from './section';
import { Confirm } from './ui';

export function Offers({ document, busy, play }: { document: WorldDocument; busy: boolean; play: (action: GameAction) => void }) {
  const view = useMemo(() => offersView(document), [document]);
  const [asking, setAsking] = useState<OfferId | null>(null);
  if (view === null || view.offers.length === 0) return null;
  return (
    <Part id="offers" className="part--notice">
      <ul className="cards">
        {view.offers.map((offer) => (
          <li key={offer.offerId} className="card">
            <Offer offer={offer} asking={asking === offer.offerId} onAsk={setAsking} busy={busy} play={play} />
          </li>
        ))}
      </ul>
    </Part>
  );
}

function Offer({
  offer,
  asking,
  onAsk,
  busy,
  play,
}: {
  offer: OfferRow;
  asking: boolean;
  onAsk: (offerId: OfferId | null) => void;
  busy: boolean;
  play: (action: GameAction) => void;
}) {
  // "Keep them" puts the keyboard back on "Accept…" once it is drawn again.
  const returning = useRef(false);
  const whose = `${offer.guildName}'s offer for ${offer.heroName}`;
  return (
    <>
      <p>{offer.sentence}</p>
      {asking ? (
        <Confirm
          label={`Accept ${whose}?`}
          confirm="Accept the offer"
          confirmLabel={`Accept ${whose}`}
          busy={busy}
          onConfirm={() => play({ kind: 'acceptTransfer', offerId: offer.offerId })}
          onKeep={() => {
            returning.current = true;
            onAsk(null);
          }}
        >
          <p>{offer.confirm}</p>
        </Confirm>
      ) : (
        <div className="actions">
          <button
            type="button"
            className="button--primary"
            ref={(button) => {
              if (button !== null && returning.current) {
                returning.current = false;
                button.focus();
              }
            }}
            aria-label={`Accept ${whose}…`}
            disabled={busy}
            onClick={() => onAsk(offer.offerId)}
          >
            Accept…
          </button>
          <button type="button" aria-label={`Decline ${whose}`} disabled={busy} onClick={() => play({ kind: 'declineTransfer', offerId: offer.offerId })}>
            Decline
          </button>
        </div>
      )}
    </>
  );
}
