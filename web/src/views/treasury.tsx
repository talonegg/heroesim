// The Guild's Treasury (M9-F3, DL-111 item 5, DL-112 item 6, DL-116): its accounts. The Wealth; the
// Upkeep, its next payment with its night and its parts (the sentence the Hall gave until now); the
// Bankruptcy floor, and the countdown while the Wealth is below it; and the ledger, every change to the
// Wealth read from the History, newest first, a page at a time, with the totals of what is shown, opening
// with the Wealth the Guild was founded with (M9-F7, DL-120 item 4). Its filters, income or expense and
// category, take several choices each, display only (DL-206 item 27, DL-213). A name in a row opens whom it names, through
// the shell's links, as in the History. Every word and number is `treasuryView`'s.

import type { WorldDocument } from '@heroesim/engine';
import { useMemo, useState } from 'react';
import { treasuryView, type TreasuryFilter } from '../state/treasury';
import { Names } from './history-entries';
import { Icon } from './icons';
import { Terms } from './section';
import { Banner, FilterChips } from './ui';

/** The Guild's Treasury part. */
export function Treasury({ document }: { document: WorldDocument }) {
  const [filter, setFilter] = useState<TreasuryFilter>({});
  const [page, setPage] = useState(0);
  const view = useMemo(() => treasuryView(document, filter, page), [document, filter, page]);
  if (view === null) return <p>The save has no player’s Guild.</p>;
  const { upkeep, ledger } = view;
  // Whether the ledger holds any change: each is of a category.
  const changed = ledger.filters.category.options.length > 0;
  /** A filter's choice made: the ledger from its first page. */
  const choose = (name: keyof TreasuryFilter) => (chosen: string[]) => {
    setFilter((was) => ({ ...was, [name]: chosen }));
    setPage(0);
  };

  return (
    <div className="treasury">
      <p className="treasury__wealth" data-testid="treasury-wealth">
        <Icon name="wealth" />
        <span>Wealth</span> <strong>{view.wealth}</strong>
      </p>
      {view.countdown === null ? null : (
        <Banner tone="warn" icon="alert">
          <p>{view.countdown}</p>
        </Banner>
      )}

      <h3>Upkeep</h3>
      <p className="upkeep">
        <Icon name="wealth" />
        <span>{upkeep.sentence}</span>
      </p>
      {upkeep.next === null ? null : (
        <p data-testid="upkeep-next">
          Next paid on {upkeep.next}: {upkeep.total} Wealth.
        </p>
      )}
      <Terms pairs={upkeep.parts.map(({ label, value }) => [label, value] as const)} />
      <p className="subtle" data-testid="floor">
        The Bankruptcy floor is {view.floor} Wealth.
      </p>

      <h3>Ledger</h3>
      {changed ? null : <p className="subtle">No change to the Wealth of {view.guildName} yet.</p>}
      {!changed && !ledger.opens ? null : (
        <>
          {!changed ? null : (
            <>
              <FilterChips {...ledger.filters.flow} onChoose={choose('flow')} />
              <FilterChips {...ledger.filters.category} onChoose={choose('category')} />
              <p className="treasury__totals" data-testid="totals">
                Income {ledger.totals.incomeWords} · Expense {ledger.totals.expenseWords} · Net {ledger.totals.netWords}
              </p>
            </>
          )}
          {ledger.rows.length === 0 ? (
            <p className="subtle">No change to the Wealth of {view.guildName} matches the filters.</p>
          ) : (
            <>
              {!changed ? null : (
                <p className="subtle">
                  Page {ledger.page + 1} of {ledger.pages}, {ledger.shown} {ledger.shown === 1 ? 'change' : 'changes'} in all
                  {ledger.opens ? ' since the founding' : ''}, newest first.
                </p>
              )}
              <div className="table-wrap">
                <table className="table ledger-table" aria-label={`The ledger of ${view.guildName}`}>
                  <thead>
                    <tr>
                      <th scope="col">Date</th>
                      <th scope="col">What happened</th>
                      <th scope="col">Category</th>
                      <th scope="col" className="number">
                        Amount
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {ledger.rows.map((row) => (
                      <tr key={row.key} data-testid="ledger-row">
                        <td className="ledger__when">{row.when}</td>
                        <td>
                          <Names segments={row.segments} />
                        </td>
                        <td>{row.categoryWords}</td>
                        <td className={`number ledger__amount ${row.category === null ? 'is-opening' : row.amount > 0 ? 'is-income' : 'is-expense'}`}>
                          {row.amountWords}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {ledger.pages <= 1 ? null : (
                <div className="actions actions--pages">
                  <button type="button" disabled={ledger.page === 0} onClick={() => setPage(0)}>
                    Newest
                  </button>
                  <button type="button" disabled={ledger.page === 0} onClick={() => setPage(ledger.page - 1)}>
                    Newer
                  </button>
                  <button type="button" disabled={ledger.page >= ledger.pages - 1} onClick={() => setPage(ledger.page + 1)}>
                    Older
                  </button>
                  <button type="button" disabled={ledger.page >= ledger.pages - 1} onClick={() => setPage(ledger.pages - 1)}>
                    Oldest
                  </button>
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
