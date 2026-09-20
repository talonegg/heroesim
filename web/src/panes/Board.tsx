import type { Career, Content } from '@heroesim/engine';
import { difficultyBand, patronOf, sphereName } from '../state/selectors';
import { coin, count } from '../words';

/**
 * The Board: the Commissions currently on offer, one card each. A Patron whose Regard
 * has soured posts less to it, or nothing at all, so an empty Board is a state worth
 * showing rather than an error.
 */
export function Board({
  career,
  content,
  onSend,
  busy,
  ended,
}: {
  career: Career;
  content: Content;
  onSend: (commissionId: string) => void;
  busy: boolean;
  /** A finished Career offers nothing but a new one, so the work is read, not taken. */
  ended: boolean;
}) {
  return (
    <section className="pane pane--board" aria-label="Board" data-testid="pane-board">
      <h2 className="pane__title">Board</h2>
      {career.board.length === 0 ? (
        <p className="empty">Nothing is posted. Advance until the Board refreshes.</p>
      ) : (
        <ul className="cards">
          {career.board.map((commission) => {
            const patron = patronOf(career, commission);
            return (
              <li className="card" key={commission.id} data-testid="commission">
                <h3 className="card__title">{commission.title}</h3>
                <p className="card__line">
                  <b>{patron?.name ?? 'An unnamed Patron'}</b> · {sphereName(content, patron?.sphere)}
                </p>
                {/* The same four terms the terminal's Board row carries, in the same
                    order: fee, difficulty **word**, span and Beats. The raw difficulty
                    number the browser used to print beside the word is gone — parity is of
                    information, the terminal shows a word and never the number, and a bare
                    engine number in brackets is not a thing a player weighs (DL-27 §3). */}
                <p className="card__line">
                  Fee <b>{coin(commission.fee)}</b> · {difficultyBand(career, commission)} ·{' '}
                  <b>{count(commission.spanDays, 'Day', 'Days')}</b> · {commission.beatCount} Beats
                </p>
                {ended ? null : (
                  <button
                    type="button"
                    className="button--primary"
                    disabled={busy}
                    onClick={() => {
                      onSend(commission.id);
                    }}
                  >
                    Send a Party to {commission.title}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
