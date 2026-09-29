// The Market (M7-S3 part 2; the CLI's `show market`, `buy` and `sell`, M5-S4): what it has for sale
// and at what price, bought by the quantity asked; and what the player's Guild holds, with what each
// sells for, sold from a stack by the quantity asked or as a unique Item. The Market Engine prices
// (`marketStock`, `sellPrice`), and the engine's `buy` and `sell` decide.
//
// A part of the Hall (M9-S3, DL-103): quantities are steppers, and the Guild's Wealth is the status
// bar's to say. The tables and the filter chips are M9-S6's.

import type { WorldDocument } from '@heroesim/engine';
import { useMemo, useState, type FormEvent } from 'react';
import type { GameAction } from '../state/reducer';
import { marketView, type HeldForSale, type ListingRow } from '../state/trade-views';
import { Part } from './section';
import { Stepper } from './ui';

type Play = (action: GameAction) => void;

export function Market({ document, busy, play }: { document: WorldDocument; busy: boolean; play: Play }) {
  const view = useMemo(() => marketView(document), [document]);
  const kinds = `${view.forSale.length} ${view.forSale.length === 1 ? 'kind' : 'kinds'}`;
  return (
    <Part id="market">
      <p>
        {view.forSale.length === 0
          ? 'The Market has nothing for sale.'
          : `${view.totalForSale} ${view.totalForSale === 1 ? 'Item' : 'Items'} for sale, of ${kinds}.`}
      </p>
      <ul className="cards cards--grid">
        {view.forSale.map((row) => (
          <li key={row.definitionKey} className="card">
            <Listing row={row} busy={busy} play={play} />
          </li>
        ))}
      </ul>
      {/* Nothing held, nothing to sell: the list is not drawn (the review's A5). */}
      {view.guildName === null || view.held.length === 0 ? null : (
        <>
          <h4>Sell what {view.guildName} holds</h4>
          <ul className="cards cards--grid">
            {view.held.map((row) => (
              <li key={row.key} className="card">
                <Held row={row} busy={busy} play={play} />
              </li>
            ))}
          </ul>
        </>
      )}
    </Part>
  );
}

/**
 * What was typed as a whole number from 1, which is all `buy` and `sell` take (they throw on
 * anything else). More than there is goes to the engine as typed, which refuses it with a sentence.
 */
function howMany(typed: number): number {
  return Number.isSafeInteger(Math.floor(typed)) ? Math.max(1, Math.floor(typed)) : 1;
}

function Listing({ row, busy, play }: { row: ListingRow; busy: boolean; play: Play }) {
  const [quantity, setQuantity] = useState(1);
  function buy(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    play({ kind: 'buy', definitionKey: row.definitionKey, quantity: howMany(quantity) });
  }
  return (
    <form className="trade" onSubmit={buy} aria-label={`Buy ${row.name}`}>
      <p>
        <strong className="trade__name">{row.name}</strong>, {row.kind}: {row.does}.
      </p>
      <p>
        {row.quantity} for sale at {row.price} Wealth each.
      </p>
      <div className="actions">
        <Stepper label="How many" value={quantity} min={1} max={row.quantity} onChange={setQuantity} />
        <button type="submit" disabled={busy}>
          Buy
        </button>
      </div>
    </form>
  );
}

function Held({ row, busy, play }: { row: HeldForSale; busy: boolean; play: Play }) {
  const [quantity, setQuantity] = useState(1);
  const { sale } = row;
  function sell(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    play('stackId' in sale ? { kind: 'sell', stackId: sale.stackId, quantity: howMany(quantity) } : { kind: 'sell', itemId: sale.itemId });
  }
  return (
    <form className="trade" onSubmit={sell} aria-label={`Sell ${row.name}`}>
      <p>
        <strong className="trade__name">{row.name}</strong>: {row.held} held;{' '}
        {row.sellsFor === null ? 'the Market cannot price it.' : `each sells for ${row.sellsFor} Wealth.`}
      </p>
      <div className="actions">
        {'stackId' in sale ? <Stepper label="How many" value={quantity} min={1} max={row.held} onChange={setQuantity} /> : null}
        <button type="submit" disabled={busy}>
          Sell
        </button>
      </div>
    </form>
  );
}
