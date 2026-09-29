// The History rail (M9-S3, DL-103; the review's A1 and D6): from 1100px the view sits beside the
// player's Guild's latest entries, those the last play appended marked new, so a result is read
// beside the decision that caused it (DL-99 item 1). By CSS alone, as the navigation is: under
// 1100px, and while the History view itself is open, it is not drawn. The lines are `railView`'s.
// "Open the History" opens the History on the player's Guild, at its newest, where what the last play
// added is marked new (M9-S5, DL-105).

import { useMemo } from 'react';
import { railView } from '../state/digest';
import type { GameState } from '../state/reducer';
import { Icon } from './icons';

export function Rail({ state, onOpenHistory }: { state: Pick<GameState, 'document' | 'log'>; onOpenHistory: () => void }) {
  const { document, log } = state;
  // Read again only when the game or the log changes: not between the steps of a fast forward.
  const view = useMemo(() => railView({ document, log }), [document, log]);
  if (view === null) return null;
  return (
    <aside className="rail" aria-labelledby="rail-heading">
      <div className="rail__head">
        <h2 id="rail-heading">Latest for {view.guildName}</h2>
        {view.fresh === 0 ? null : <span className="chip chip--accent">{view.fresh} new</span>}
      </div>
      <ol className="lines lines--rail">
        {view.lines.map((line) => (
          <li key={line.key} className={[line.fresh ? 'is-new' : '', line.milestone ? 'milestone' : ''].join(' ').trim() || undefined}>
            <span className="when">
              {line.when}
              {line.fresh ? <span className="new-tag">New</span> : null}
            </span>{' '}
            {line.sentence}
          </li>
        ))}
      </ol>
      <div className="actions">
        <button type="button" className="button--quiet" onClick={onOpenHistory}>
          <Icon name="history" />
          <span>Open the History</span>
        </button>
      </div>
    </aside>
  );
}
