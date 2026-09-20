import { Sheet } from '../ui/Sheet';
import { splitStamp } from '../words';

/**
 * The last five things the player did and what came of them (E7-S2, E8-S6): the browser's
 * half of the rolling window the terminal shows under RECENTLY.
 *
 * **Not one word of an entry is written here.** The entries are made in the reducer by
 * `narrate`'s own `entriesFrom` — the very function the terminal uses, over the same eight
 * kinds of moment — and this only splits the Day stamp back off the paragraph so the stamp
 * can sit above it. The terminal trims an entry to two lines because it has twenty-four
 * rows; the browser wraps and scrolls, so it shows every entry **whole** (DL-26 §4, and
 * DL-27 §6: parity is of information, not of arrangement).
 *
 * Fewer than five renders without padding or placeholder rows, and none renders a sentence
 * saying so rather than an empty box.
 */
export function History({
  history,
  onClose,
}: {
  history: readonly string[];
  onClose: () => void;
}) {
  return (
    <Sheet title="What has happened" onClose={onClose}>
      {history.length === 0 ? (
        <p className="empty" data-testid="history-empty">
          Nothing has been decided yet. Send a Party out, and what came of it will be here.
        </p>
      ) : (
        <ol className="cards" data-testid="history-list">
          {/* Newest last, as the terminal shows it: the block reads downwards in the order
              the Days ran. */}
          {history.map((entry, index) => {
            const { stamp, text } = splitStamp(entry);
            return (
              <li className="card" key={`${String(index)}:${entry}`} data-testid="history-entry">
                {stamp === undefined ? null : (
                  <p className="card__line card__line--quiet" data-testid="history-stamp">
                    {stamp}
                  </p>
                )}
                <p className="card__line" data-testid="history-text">
                  {text}
                </p>
              </li>
            );
          })}
        </ol>
      )}
    </Sheet>
  );
}
