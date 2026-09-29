// The Guild's Treasury (M9-F3, DL-111 item 5, DL-112 item 6, DL-116): its accounts. The Wealth; the
// Upkeep, its next payment with its night and its parts (the sentence the Hall gave until now); the
// Bankruptcy floor, and the countdown while the Wealth is below it; and the ledger, every change to the
// Wealth read from the History, newest first, a page at a time, with the totals of what is shown, opening
// with the Wealth the Guild was founded with (M9-F7, DL-120 item 4). Chips
// show income or expense, and one category, display only. A name in a row opens whom it names, through
// the shell's links, as in the History. Every word and number is `treasuryView`'s.

import type { WorldDocument } from '@heroesim/engine';
import { useMemo, useState } from 'react';
import { treasuryView, type LedgerCategory, type LedgerFlow } from '../state/treasury';
import { Names } from './history-entries';
import { Icon } from './icons';
import { Terms } from './section';
import { Banner, FilterChips } from './ui';

const flows: readonly { key: Exclude<LedgerFlow, 'both'>; label: string }[] = [
  { key: 'income', label: 'Income' },
  { key: 'expense', label: 'Expense' },
];

/** The Guild's Treasury part. */
export function Treasury({ document }: { document: WorldDocument }) {
  const [flow, setFlow] = useState<LedgerFlow>('both');
  const [category, setCategory] = useState<LedgerCategory | null>(null);
  const [page, setPage] = useState(0);
  const view = useMemo(() => treasuryView(document, { flow, category }, page), [document, flow, category, page]);
  if (view === null) return <p>The save has no player’s Guild.</p>;
  const { upkeep, ledger } = view;
  const filtered = (change: () => void): void => {
    change();
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
      {ledger.categories.length === 0 ? <p className="subtle">No change to the Wealth of {view.guildName} yet.</p> : null}
      {ledger.categories.length === 0 && !ledger.opens ? null : (
        <>
          {ledger.categories.length === 0 ? null : (
            <>
              <FilterChips
            label="Show income or expense"
            options={flows}
            shown={flow === 'both' ? null : flow}
            onShow={(key) => filtered(() => setFlow(key ?? 'both'))}
                all="Both"
              />
              <FilterChips label="Show of category" options={ledger.categories} shown={category} onShow={(key) => filtered(() => setCategory(key))} />
              <p className="treasury__totals" data-testid="totals">
                Income {ledger.totals.incomeWords} · Expense {ledger.totals.expenseWords} · Net {ledger.totals.netWords}
              </p>
            </>
          )}
          {ledger.rows.length === 0 ? (
            <p className="subtle">No change to the Wealth of {view.guildName} is of that kind.</p>
          ) : (
            <>
              {ledger.categories.length === 0 ? null : (
                <p className="subtle">
                  Page {ledger.page + 1} of {ledger.pages}, {ledger.shown} {ledger.shown === 1 ? 'change' : 'changes'} in all
                  {ledger.opens ? ' since the founding' : ''}, newest first.
                </p>
              )}
              <div className="table-wrap">
                <table className="table ledger-table" aria-label={`The ledger of ${view.guildName}`}>
                  <thead>
                    <tr>
                      <th scope="col">Day</th>
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
