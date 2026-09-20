import type { Career } from '@heroesim/engine';
import { patronsBySphere, signedRegard } from '../state/selectors';
import { Sheet } from '../ui/Sheet';
import { coin, postingNothingSentence } from '../words';

/**
 * The Patrons, grouped by Sphere (E7-S3, E8-S6): what each one thinks of the Guild, what
 * last moved it, and what they have on the Board — and, where their Regard has reached the
 * floor, that they are posting nothing at all, because silence is information.
 *
 * The same content the terminal's Patrons view carries, in the arrangement a scrolling
 * sheet wants rather than the terminal's indented block: parity is of information, not of
 * pixels (E8 §3).
 *
 * Nothing here works out a rule. Whether a Patron posts is the engine's own
 * `postingPatrons`, which is what the Board itself asks, and the sentence that says so is
 * `narrate`'s, word for word with the terminal's (DL-25 §2, DL-27 §2).
 */
export function Patrons({ career, onClose }: { career: Career; onClose: () => void }) {
  const groups = patronsBySphere(career);
  return (
    <Sheet title="Patrons" onClose={onClose}>
      {groups.length === 0 ? (
        <p className="empty" data-testid="patrons-empty">
          No Patron holds an opinion of the Guild yet.
        </p>
      ) : (
        groups.map((group) => (
          <section className="sphere" key={group.name} data-testid="sphere">
            <h3 className="card__title" data-testid="sphere-name">
              {group.name}
            </h3>
            <ul className="cards">
              {group.patrons.map((card) => (
                <li className="card" key={card.patron.id} data-testid="patron">
                  <h4 className="card__title" data-testid="patron-name">
                    {card.patron.name}
                  </h4>
                  {/* The number and the reason together: a bare number is never the whole
                      cell (E7-S3). */}
                  <p className="card__line" data-testid="patron-regard">
                    Regard for the Guild <b>{signedRegard(card.regard)}</b> · {card.reason}
                  </p>
                  {!card.posting ? (
                    <p className="card__flag" data-testid="patron-silent">
                      {postingNothingSentence}
                    </p>
                  ) : card.onTheBoard.length === 0 ? (
                    <p className="card__line" data-testid="patron-board">
                      Nothing of theirs is on the Board just now.
                    </p>
                  ) : (
                    <ul className="plain" data-testid="patron-board">
                      {card.onTheBoard.map((commission) => (
                        <li className="card__line" key={commission.id}>
                          On the Board: {commission.title}, <b>{coin(commission.fee)}</b>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </Sheet>
  );
}
