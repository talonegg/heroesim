import type { Career, Content } from '@heroesim/engine';
import { difficultyBand, patronOf, sphereName } from '../state/selectors';

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
                <p className="card__line">
                  Fee <b>{commission.fee} coin</b> · {difficultyBand(career, commission)} (
                  {commission.difficulty}) · <b>{commission.spanDays}</b> Days ·{' '}
                  {commission.beatCount} Beats
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
