// The Guild's Treasury (M9-F3, DL-111 item 5, DL-112 item 6, DL-116): its accounts. The Wealth; the
// Upkeep's two charges, the wages and the Hall's, each with its next payment and its night, the Hall's
// with its parts (DL-298); the
// Bankruptcy floor, and the countdown while the Wealth is below it; and the ledger, every change to the
// Wealth read from the History, newest first, a page at a time, with the totals of what is shown, opening
// with the Wealth the Guild was founded with (M9-F7, DL-120 item 4). Its filters, income or expense and
// category, take several choices each, display only (DL-206 item 27, DL-213). A name in a row opens whom it names, through
// the shell's links, as in the History. Every word and number is `treasuryAccounts`' and `ledgerPage`'s.

import type { WorldDocument } from '@heroesim/engine';
import { useMemo, useState } from 'react';
import { expenseLines, incomeLines, ledgerPage, lineWords, treasuryAccounts, type LedgerTotals, type TreasuryAccounts, type UpkeepCharge } from '../state/treasury';
import { Names } from './history-entries';
import { Coins } from './coins';
import { Icon } from './icons';
import { Terms } from './section';
import { Banner, FilterChips, useFacets, type FilterChipsProps } from './ui';

/** A filter's chips, as `useFacets` gives them. */
type Chips = FilterChipsProps<'flow'>['flow'];

/** The Guild's Treasury part: its accounts read once a document (DL-213). */
export function Treasury({ document }: { document: WorldDocument }) {
  const view = useMemo(() => treasuryAccounts(document), [document]);
  return view === null ? <p>The save has no player’s Guild.</p> : <Accounts view={view} />;
}

/** One charge of the Upkeep: its sentence, its next payment with its night, and its parts where it has any (DL-298). */
function Charge({ charge, testId }: { charge: UpkeepCharge; testId: string }) {
  return (
    <>
      <p className="upkeep">
        <Icon name="wealth" />
        <span>{charge.sentence}</span>
      </p>
      {charge.next === null ? null : (
        <p data-testid={testId}>
          Next paid on {charge.next}: <Coins silver={charge.total} />.
        </p>
      )}
      {charge.parts.length === 0 ? null : (
        <Terms pairs={charge.parts.map(({ label, value, silver }) => [label, silver === undefined ? value : <Coins silver={silver} />] as const)} />
      )}
    </>
  );
}

/**
 * The ledger's lines with their totals over what the filters show (DL-304 item 4): each section, then
 * its lines, the expense lines, then Other. A row of nothing is left out, so the table follows the
 * filters and stays short on a phone, and a section with no change is left out with its lines.
 */
function LinesTable({ totals, guildName }: { totals: LedgerTotals; guildName: string }) {
  const { income, expense } = totals.sections;
  const shown = [
    { key: 'income', words: 'Income', total: income.total, line: false },
    ...incomeLines.map((key) => ({ key, words: lineWords[key], total: income.lines[key], line: true })),
    { key: 'expense', words: 'Expense', total: expense.total, line: false },
    ...expenseLines.map((key) => ({ key, words: lineWords[key], total: expense.lines[key], line: true })),
    { key: 'other', words: lineWords.other, total: totals.other, line: true },
  ].filter((row) => row.total !== 0);
  if (shown.length === 0) return null;
  return (
    <div className="table-wrap">
      <table className="table lines-table" aria-label={`The lines of ${guildName}`}>
        <thead>
          <tr>
            <th scope="col">Line</th>
            <th scope="col" className="number">
              Total
            </th>
          </tr>
        </thead>
        <tbody>
          {shown.map((row) => (
            <tr key={row.key} className={row.line ? 'lines-table__line' : 'lines-table__section'}>
              <th scope="row">{row.words}</th>
              <td className={`number ledger__amount ${row.total > 0 ? 'is-income' : 'is-expense'}`}>
                <Coins silver={row.total} signed />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * The Guild's accounts and its ledger, filtered and paged. The filters' choices are this part's own
 * (`useFacets`), as the page's other filters' are, so a category no longer in the ledger is let go
 * for good; a chip pressed or a page turned filters the changes read for the document and puts only
 * the page shown in words (DL-213).
 */
function Accounts({ view }: { view: TreasuryAccounts }) {
  const { rows, filters, filtered } = useFacets(view.ledger.changes, view.ledger.facets);
  const [page, setPage] = useState(0);
  const ledger = useMemo(() => ledgerPage(view.ledger, { rows, filtered }, page), [view.ledger, rows, filtered, page]);
  const { upkeep } = view;
  const changed = view.ledger.changes.length > 0;
  /** A filter's chips, a choice made showing the ledger from its first page. */
  const fromFirstPage = (filter: Chips): Chips => ({
    ...filter,
    onChoose: (next) => {
      filter.onChoose(next);
      setPage(0);
    },
  });

  return (
    <div className="treasury">
      <p className="treasury__wealth" data-testid="treasury-wealth">
        <Icon name="wealth" />
        <span>Wealth</span> <strong>
          <Coins silver={view.wealth} />
        </strong>
      </p>
      {view.countdown === null ? null : (
        <Banner tone="warn" icon="alert">
          <p>{view.countdown}</p>
        </Banner>
      )}

      <h3>Upkeep</h3>
      <Charge charge={upkeep.wages} testId="wages-next" />
      <Charge charge={upkeep.hall} testId="hall-upkeep-next" />
      <p className="subtle" data-testid="floor">
        The Bankruptcy floor is <Coins silver={view.floor} />.
      </p>

      <h3>Ledger</h3>
      {changed ? null : <p className="subtle">No change to the Wealth of {view.guildName} yet.</p>}
      {!changed && !ledger.opens ? null : (
        <>
          {!changed ? null : (
            <>
              <FilterChips {...fromFirstPage(filters.flow)} />
              <FilterChips {...fromFirstPage(filters.category)} />
              <p className="treasury__totals" data-testid="totals">
                Income <Coins silver={ledger.totals.income} signed /> · Expense <Coins silver={ledger.totals.expense} signed /> · Net{' '}
                <Coins silver={ledger.totals.net} signed />
              </p>
              <LinesTable totals={ledger.totals} guildName={view.guildName} />
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
                          <Coins silver={row.amount} signed={row.category !== null} />
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
