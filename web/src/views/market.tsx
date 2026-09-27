// The Market (M7-S3 part 2; the CLI's `show market`, `buy` and `sell`, M5-S4): what it has for sale
// and at what price, bought by the quantity asked; and what the player's Guild holds, with what each
// sells for, sold from a stack by the quantity asked or as a unique Item. The Market Engine prices
// (`marketStock`, `sellPrice`), and the engine's `buy` and `sell` decide.

import type { WorldDocument } from '@heroesim/engine';
import { useMemo, useState, type FormEvent } from 'react';
import type { GameAction } from '../state/reducer';
import { marketView, type HeldForSale, type ListingRow } from '../state/trade-views';
import { Section } from './section';

type Play = (action: GameAction) => void;

export function Market({ document, busy, play }: { document: WorldDocument; busy: boolean; play: Play }) {
  const view = useMemo(() => marketView(document), [document]);
  const kinds = `${view.forSale.length} ${view.forSale.length === 1 ? 'kind' : 'kinds'}`;
  return (
    <Section
      id="market"
      title="Market"
      help={
        'Buy Items the Market has for sale at its price each, and sell what your Guild holds for what the Market pays, ' +
        'which is less. Gear a Hero carries is not the Guild’s to sell until it is unequipped. The Market’s stock is ' +
        'drawn afresh each morning.'
      }
    >
      <p>
        {view.forSale.length === 0
          ? 'The Market has nothing for sale.'
          : `${view.totalForSale} ${view.totalForSale === 1 ? 'Item' : 'Items'} for sale, of ${kinds}.`}
      </p>
      <ul className="cards">
        {view.forSale.map((row) => (
          <li key={row.definitionKey} className="card">
            <Listing row={row} busy={busy} play={play} />
          </li>
        ))}
      </ul>
      {view.guildName === null ? null : (
        <>
          <h3>What {view.guildName} holds</h3>
          <p>
            {view.guildName} has {view.wealth} Wealth.
          </p>
          {view.held.length === 0 ? (
            <p>Nothing to sell.</p>
          ) : (
            <ul className="cards">
              {view.held.map((row) => (
                <li key={row.key} className="card">
                  <Held row={row} busy={busy} play={play} />
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </Section>
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
        <strong>{row.name}</strong>, {row.kind}: {row.does}.
      </p>
      <p>
        {row.quantity} for sale at {row.price} Wealth each.
      </p>
      <div className="actions">
        <label className="inline-field">
          <span>How many</span>
          <input
            type="number"
            min={1}
            max={row.quantity}
            step={1}
            inputMode="numeric"
            value={quantity}
            onChange={(event) => setQuantity(Number(event.target.value))}
          />
        </label>
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
        <strong>{row.name}</strong>: {row.held} held;{' '}
        {row.sellsFor === null ? 'the Market cannot price it.' : `each sells for ${row.sellsFor} Wealth.`}
      </p>
      <div className="actions">
        {'stackId' in sale ? (
          <label className="inline-field">
            <span>How many</span>
            <input
              type="number"
              min={1}
              max={row.held}
              step={1}
              inputMode="numeric"
              value={quantity}
              onChange={(event) => setQuantity(Number(event.target.value))}
            />
          </label>
        ) : null}
        <button type="submit" disabled={busy}>
          Sell
        </button>
      </div>
    </form>
  );
}
