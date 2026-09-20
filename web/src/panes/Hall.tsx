import type { Career, HallImprovement } from '@heroesim/engine';
import { hallOffers } from '../state/selectors';
import { Sheet } from '../ui/Sheet';
import { coin } from '../words';

/**
 * The Hall (E3-S4): the only thing coin buys besides Upkeep. Three improvements, bought
 * once each, with the cost and the effect on the card and the reason it cannot be bought
 * written out rather than left to a disabled button to imply.
 *
 * Nothing here works out a rule: `hallOffers` asks the engine what each one costs and the
 * reducer asks the engine to buy it, which is what refuses the purchase if it cannot be
 * made (E8-S2).
 */
export function Hall({
  career,
  onBuy,
  onClose,
  disabled,
}: {
  career: Career;
  onBuy: (improvement: HallImprovement) => void;
  onClose: () => void;
  disabled: boolean;
}) {
  const offers = hallOffers(career);
  return (
    <Sheet title="The Hall" onClose={onClose}>
      <p className="card__line" data-testid="hall-coin">
        The Guild holds <b>{coin(career.guild.coin)}</b>. Each improvement is bought once.
      </p>
      <ul className="cards">
        {offers.map((offer) => (
          <li className="card" key={offer.improvement} data-testid="hall-offer">
            <h3 className="card__title">{offer.name}</h3>
            <p className="card__line">
              <b>{coin(offer.cost)}</b> · {offer.effect}
            </p>
            {offer.why === undefined ? null : (
              <p className="card__line" data-testid="hall-why">
                {offer.why}
              </p>
            )}
            <button
              type="button"
              className={offer.bought ? undefined : 'button--primary'}
              data-testid={`hall-buy-${offer.improvement}`}
              data-state={offer.bought ? 'bought' : offer.affordable ? 'ready' : 'unaffordable'}
              disabled={disabled || offer.bought || !offer.affordable}
              onClick={() => {
                onBuy(offer.improvement);
              }}
            >
              {offer.bought ? `${offer.name}: already built` : `Build the ${offer.name.toLowerCase()}`}
            </button>
          </li>
        ))}
      </ul>
    </Sheet>
  );
}
