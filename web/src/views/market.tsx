// The Market (M7-S3 part 2; the CLI's `show market`, `buy` and `sell`, M5-S4): what it has for sale
// and at what price, bought by the quantity asked; and what the player's Guild holds, with what each
// sells for, sold from a stack by the quantity asked or as a unique Item. The Market Engine prices
// (`marketStock`, `sellPrice`), and the engine's `buy` and `sell` decide.
//
// A part of the Hall (M9-S3, DL-103), and a view of its own since M9-F2 (DL-111 item 6, DL-112
// item 5), with two parts, Buy and Sell: quantities are steppers, and the Guild's Wealth is the
// status bar's to say. As tables (M9-S6, DL-106; the review's B3): Buy, what is for sale, with Item,
// Kind, Effect, Price, Stock, how many and Buy, and chips that show one kind at a time, display
// only; and Sell, what the Guild holds, with what each sells for, how many and Sell (`Holdings`),
// which is the one list of it, and says so when the Guild holds nothing. A Unique Item held shows its
// picture before its name in Sell (v1.1.2-S2, DL-125 item 8); the Buy never offers one (DL-48).

import type { WorldDocument } from '@heroesim/engine';
import { useMemo, useState } from 'react';
import type { GameAction } from '../state/reducer';
import { marketView, type HeldForSale, type ListingRow, type MarketKind, type MarketView } from '../state/trade-views';
import { ItemPicture } from './pictures';
import { Part, View } from './section';
import { Stepper, VisuallyHidden } from './ui';

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
  const [only, setOnly] = useState<MarketKind | null>(null);
  const view = useMemo(() => marketView(document, only), [document, only]);
  const kinds = `${view.kinds.reduce((sum, kind) => sum + kind.count, 0)} ${view.kinds.length === 1 ? 'kind' : 'kinds'}`;
  // A kind no longer for sale shows everything again.
  const shown = only !== null && !view.kinds.some((kind) => kind.key === only) ? null : only;
  return (
    <Part id="buy">
      <p>
        {view.totalForSale === 0
          ? 'The Market has nothing for sale.'
          : `${view.totalForSale} ${view.totalForSale === 1 ? 'Item' : 'Items'} for sale, of ${kinds}.`}
      </p>
      {view.kinds.length < 2 ? null : (
        <div className="filters" role="group" aria-label="Show for sale">
          <button type="button" className="filter" aria-pressed={shown === null} onClick={() => setOnly(null)}>
            All
          </button>
          {view.kinds.map((kind) => (
            <button key={kind.key} type="button" className="filter" aria-pressed={shown === kind.key} onClick={() => setOnly(kind.key)}>
              {kind.label} <span className="filter__count">{kind.count}</span>
            </button>
          ))}
        </div>
      )}
      {view.forSale.length === 0 ? null : (
        <div className="table-wrap">
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
              {view.forSale.map((row) => (
                <Listing key={row.definitionKey} row={row} busy={busy} play={play} />
              ))}
            </tbody>
          </table>
        </div>
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
    <div className="table-wrap">
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
    </div>
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
