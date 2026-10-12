// The Guild's Stores (M9-F3, DL-111 item 5, DL-112 item 6, DL-116): everything the Guild owns, wherever
// it is, in one table: Item, Kind, where it is, Quantity, and what a held Item sells for. Its filters, by
// kind and by where, take several choices each, display only (DL-206 item 27, DL-213). A Hero's name opens their page,
// through the shell's links, as a name in the History does. Read only for now (DL-113 item 2): Sell is
// the Market's, a way away, and gear moves on a Hero's page. Every word and number is `storesView`'s.
// A Unique Item shows its picture before its name (v1.1.2-S2, DL-125 item 8).

import type { WorldDocument } from '@heroesim/engine';
import { useMemo } from 'react';
import { storesView, type StoresView } from '../state/stores';
import { Coins } from './coins';
import { Names } from './history-entries';
import { Icon } from './icons';
import { ItemPicture } from './pictures';
import type { SectionId } from './section';
import { FilterChips, StickyTableBox, useFacets } from './ui';

/** The Guild's Stores part. */
export function Stores({ document, onGo }: { document: WorldDocument; onGo: (target: SectionId) => void }) {
  const view = useMemo(() => storesView(document), [document]);
  return view === null ? <p>The save has no player’s Guild.</p> : <Owned view={view} onGo={onGo} />;
}

/** Everything the Guild owns, filtered: the filters' choices this part's own (`useFacets`). */
function Owned({ view, onGo }: { view: StoresView; onGo: (target: SectionId) => void }) {
  // A kind or place the Guild no longer has is let go (`chosenOf`).
  const { rows, filters } = useFacets(view.rows, view.facets);
  const owns = view.rows.length > 0;
  // Only what the Guild holds is the Market's to buy (code review).
  const holds = view.rows.some((row) => row.where === 'held');

  return (
    <div className="stores">
      <p>{view.summary}</p>
      {owns ? (
        <>
          <FilterChips {...filters.kind} />
          <FilterChips {...filters.where} />
        </>
      ) : null}
      {!owns ? null : rows.length === 0 ? (
        <p className="subtle">Nothing {view.guildName} owns matches the filters.</p>
      ) : (
        <StickyTableBox>
          <table className="table table--first-sticky trade-table" aria-label={`Everything ${view.guildName} owns`}>
            <thead>
              <tr>
                <th scope="col">Item</th>
                <th scope="col">Kind</th>
                <th scope="col">Where</th>
                <th scope="col" className="number">
                  Quantity
                </th>
                <th scope="col" className="number">
                  Sells for
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.key} data-testid="owned">
                  <th scope="row" className="trade__name">
                    {row.unique ? <ItemPicture definitionKey={row.definitionKey} /> : null}
                    {row.name}
                  </th>
                  <td>{row.kind}</td>
                  <td>
                    <Names segments={row.whereSegments} />
                  </td>
                  <td className="number">{row.quantity}</td>
                  <td className="number">{row.sellsFor === null ? <span className="subtle">—</span> : <Coins silver={row.sellsFor} />}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </StickyTableBox>
      )}
      {holds ? (
        <div className="actions">
          <button type="button" onClick={() => onGo('sell')}>
            <Icon name="market" />
            <span>Sell at the Market</span>
          </button>
        </div>
      ) : null}
    </div>
  );
}
