// The Market (M7-S3 part 2; the CLI's `show market`, `buy` and `sell`, M5-S4): what it has for sale
// and at what price, bought by the quantity asked; and what the player's Guild holds, with what each
// sells for, sold from a stack by the quantity asked or as a unique Item. The Market Engine prices
// (`marketStock`, `sellPrice`), and the engine's `buy` and `sell` decide.
//
// A part of the Hall (M9-S3, DL-103), and a view of its own since M9-F2 (DL-111 item 6, DL-112
// item 5), with two parts, Buy and Sell: quantities are steppers, and the Guild's Wealth is the
// status bar's to say. As tables (M9-S6, DL-106; the review's B3): Buy, what is for sale, with Item,
// Kind, Effect, Price, Stock, how many and Buy, and the page's filter by kind, one or several, display
// only (DL-206 item 27, DL-213); and Sell, what the Guild holds, with what each sells for, how many and Sell (`Holdings`),
// which is the one list of it, and says so when the Guild holds nothing. A Unique Item held shows its
// picture before its name in Sell (v1.1.2-S2, DL-125 item 8); the Buy never offers one (DL-48).

import type { WorldDocument } from '@heroesim/engine';
import { useMemo, useState } from 'react';
import type { GameAction } from '../state/reducer';
import { marketView, type HeldForSale, type ListingRow, type MarketView } from '../state/trade-views';
import { ItemPicture } from './pictures';
import { Part, View } from './section';
import { FilterChips, Stepper, StickyTableBox, useFacets, VisuallyHidden } from './ui';

type Play = (action: GameAction) => void;

/** The Market view: Buy, then Sell. */
export function Market({ document, busy, play }: { document: WorldDocument; busy: boolean; play: Play }) {
  return (
    <View id="market">
      <Buy document={document} busy={busy} play={play} />
      <Sell document={document} busy={busy} play={play} />
    </View>
  );
}

/** What the Market has for sale, with Buy. */
function Buy({ document, busy, play }: { document: WorldDocument; busy: boolean; play: Play }) {
  const view = useMemo(() => marketView(document), [document]);
  // The lead counts the listings, a kind of Item each, and says "kind" or "kinds" by that number (DL-213).
  const kinds = `${view.forSale.length} ${view.forSale.length === 1 ? 'kind' : 'kinds'}`;
  // A kind no longer for sale is let go (`chosenOf`).
  const { rows: forSale, filters } = useFacets(view.forSale, view.facets);
  return (
    <Part id="buy">
      <p>
        {view.totalForSale === 0
          ? 'The Market has nothing for sale.'
          : `${view.totalForSale} ${view.totalForSale === 1 ? 'Item' : 'Items'} for sale, of ${kinds}.`}
      </p>
      <FilterChips {...filters.kind} />
      {forSale.length === 0 ? null : (
        <StickyTableBox>
          <table className="table table--first-sticky trade-table" aria-label="For sale at the Market">
            <thead>
              <tr>
                <th scope="col">Item</th>
                <th scope="col">Kind</th>
                <th scope="col">Effect</th>
                <th scope="col" className="number">
                  Price
                </th>
                <th scope="col" className="number">
                  Stock
                </th>
                <th scope="col">How many</th>
                <th scope="col">
                  <VisuallyHidden>Buy</VisuallyHidden>
                </th>
              </tr>
            </thead>
            <tbody>
              {forSale.map((row) => (
                <Listing key={row.definitionKey} row={row} busy={busy} play={play} />
              ))}
            </tbody>
          </table>
        </StickyTableBox>
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
  return (
    <tr data-testid="listing">
      <th scope="row" className="trade__name">
        {row.name}
      </th>
      <td>{row.kind}</td>
      <td>{row.does}</td>
      <td className="number">{row.price}</td>
      <td className="number">{row.quantity}</td>
      <td>
        <Stepper label={`How many ${row.name}`} hideLabel value={quantity} min={1} max={row.quantity} onChange={setQuantity} />
      </td>
      <td>
        <button
          type="button"
          aria-label={`Buy ${row.name}`}
          disabled={busy}
          onClick={() => play({ kind: 'buy', definitionKey: row.definitionKey, quantity: howMany(quantity) })}
        >
          Buy
        </button>
      </td>
    </tr>
  );
}

/** What the Guild holds, with Sell; a sentence while it holds nothing (M9-F2). */
function Sell({ document, busy, play }: { document: WorldDocument; busy: boolean; play: Play }) {
  const view = useMemo(() => marketView(document), [document]);
  return (
    <Part id="sell">
      {view.held.length === 0 ? (
        <p className="subtle">
          {view.guildName ?? 'The Guild'} holds nothing to sell. Gear a Hero carries can be sold once it is taken off.
        </p>
      ) : (
        <Holdings view={view} busy={busy} play={play} />
      )}
    </Part>
  );
}

/** What the Guild holds, with what the Market pays for each, how many to sell and Sell: the Market's Sell. */
function Holdings({ view, busy, play }: { view: MarketView; busy: boolean; play: Play }) {
  return (
    <StickyTableBox>
      <table className="table table--first-sticky trade-table" aria-label={`What ${view.guildName ?? 'the Guild'} holds`}>
        <thead>
          <tr>
            <th scope="col">Item</th>
            <th scope="col">Kind</th>
            <th scope="col">Effect</th>
            <th scope="col" className="number">
              Held
            </th>
            <th scope="col" className="number">
              Sells for
            </th>
            <th scope="col">How many</th>
            <th scope="col">
              <VisuallyHidden>Sell</VisuallyHidden>
            </th>
          </tr>
        </thead>
        <tbody>
          {view.held.map((row) => (
            <Held key={row.key} row={row} busy={busy} play={play} />
          ))}
        </tbody>
      </table>
    </StickyTableBox>
  );
}

function Held({ row, busy, play }: { row: HeldForSale; busy: boolean; play: Play }) {
  const [quantity, setQuantity] = useState(1);
  const { sale } = row;
  return (
    <tr data-testid="held">
      <th scope="row" className="trade__name">
        {row.unique ? <ItemPicture definitionKey={row.definitionKey} /> : null}
        {row.name}
      </th>
      <td>{row.kind}</td>
      <td>{row.does}</td>
      <td className="number">{row.held}</td>
      <td className="number">{row.sellsFor === null ? <span className="subtle">Cannot be priced</span> : row.sellsFor}</td>
      <td>
        {'stackId' in sale ? <Stepper label={`How many ${row.name}`} hideLabel value={quantity} min={1} max={row.held} onChange={setQuantity} /> : null}
      </td>
      <td>
        <button
          type="button"
          aria-label={`Sell ${row.name}`}
          disabled={busy}
          onClick={() =>
            play('stackId' in sale ? { kind: 'sell', stackId: sale.stackId, quantity: howMany(quantity) } : { kind: 'sell', itemId: sale.itemId })
          }
        >
          Sell
        </button>
      </td>
    </tr>
  );
}
