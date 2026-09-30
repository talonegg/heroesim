// The Guild's Stores (M9-F3, DL-111 item 5, DL-112 item 6, DL-116): everything the Guild owns, wherever
// it is, in one table: Item, Kind, where it is, Quantity, and what a held Item sells for. Chips show one
// kind and one place at a time, display only, as the Market's Buy does. A Hero's name opens their page,
// through the shell's links, as a name in the History does. Read only for now (DL-113 item 2): Sell is
// the Market's, a way away, and gear moves on a Hero's page. Every word and number is `storesView`'s.
// A Unique Item shows its picture before its name (v1.1.2-S2, DL-125 item 8).

import type { WorldDocument } from '@heroesim/engine';
import { useMemo, useState } from 'react';
import { storesRowsShown, storesView, type StoresWhere } from '../state/stores';
import type { MarketKind } from '../state/trade-views';
import { Names } from './history-entries';
import { Icon } from './icons';
import { ItemPicture } from './pictures';
import type { SectionId } from './section';
import { FilterChips } from './ui';

/** The Guild's Stores part. */
export function Stores({ document, onGo }: { document: WorldDocument; onGo: (target: SectionId) => void }) {
  const [kind, setKind] = useState<MarketKind | null>(null);
  const [where, setWhere] = useState<StoresWhere | null>(null);
  const everything = useMemo(() => storesView(document, { kind: null, where: null }), [document]);
  // A kind or place the Guild no longer has shows everything again.
  const shownKind = kind !== null && everything?.kinds.some((each) => each.key === kind) === true ? kind : null;
  const shownWhere = where !== null && everything?.wheres.some((each) => each.key === where) === true ? where : null;
  const rows = useMemo(
    () => (everything === null ? [] : storesRowsShown(everything.rows, { kind: shownKind, where: shownWhere })),
    [everything, shownKind, shownWhere],
  );
  if (everything === null) return <p>The save has no player’s Guild.</p>;
  const view = everything;
  const owns = everything.rows.length > 0;
  // Only what the Guild holds is the Market's to buy (code review).
  const holds = everything.wheres.some((each) => each.key === 'held');

  return (
    <div className="stores">
      <p>{view.summary}</p>
      {owns ? (
        <>
          <FilterChips label="Show of kind" options={view.kinds} shown={shownKind} onShow={setKind} />
          <FilterChips label="Show where" options={view.wheres} shown={shownWhere} onShow={setWhere} />
        </>
      ) : null}
      {!owns ? null : rows.length === 0 ? (
        <p className="subtle">Nothing {view.guildName} owns is of that kind and there.</p>
      ) : (
        <div className="table-wrap">
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
                  <td className="number">{row.sellsFor === null ? <span className="subtle">—</span> : row.sellsFor}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
