// The History (M7-S3 part 2; the CLI's `show history [entityId]`; M9-S5, DL-105): the one place to
// read what happened, to any Guild, Hero, Guildmaster or Patron (DL-99 item 2). What the last play
// appended is its newest, marked new: "Since your last action" is no longer a section of its own.
//
// It opens on the player's Guild. The World History and each Rival's in play are one choice away,
// and the choice is the shell's, so it holds while the game is in hand, whichever view is open
// (DL-74 item 8). Anyone else it names is found by name (DL-74), or opened from their name in a line:
// a Hero the world still holds opens on their page, the CLI's `show hero`, with their Milestones
// first and their History after; anyone else's History is shown as a Guild's is. Nothing is dropped
// (principle 11): a folded Guild's History can still be read.
//
// Each History is a scope (M9-F4, DL-111 item 4): the Guild's leave out what `state/history.ts`
// names, and the World History takes the world's news. The whole History is not a choice: the game
// menu opens it as a debug view, every entry unfolded with its event type, and a choice leaves it.
//
// A page is `HistoryPage`'s (`history-entries.tsx`): groups by Day and time of day, folds, marks and
// names that open whom they name. Every line and word comes from `state/history.ts`.

import type { WorldDocument } from '@heroesim/engine';
import { useMemo, useState } from 'react';
import { findInHistory, historyChoices, historySearchLimit, historyTitle, historyView, type HistoryChoice, type HistoryView, type HistoryWhose } from '../state/history';
import type { GameAction } from '../state/reducer';
import { HeroPage } from './hero-page';
import { HistoryPage, useHistoryLinks } from './history-entries';
import { Icon } from './icons';
import { View } from './section';
import { VisuallyHidden } from './ui';

/** Whether `choice` is the History shown: none is while the whole History, the debug view, is. */
function isShown(choice: HistoryChoice, view: HistoryView): boolean {
  if (choice.mine) return view.mine;
  if (choice.whose === 'world') return view.scope === 'world';
  return view.entityId !== null && view.entityId === choice.whose;
}

export function History({
  document,
  busy,
  play,
  whose,
  onWhose,
}: {
  document: WorldDocument;
  busy: boolean;
  play: (action: GameAction) => void;
  /** Whose History is shown: the player's Guild's when `null`, where it opens. */
  whose: HistoryWhose;
  onWhose: (whose: HistoryWhose) => void;
}) {
  const links = useHistoryLinks();
  const log = links?.log;
  const [page, setPage] = useState(0);
  const [query, setQuery] = useState('');
  // Whose History was shown before this one, which a Hero's page goes back to; a new choice starts at the newest page.
  const [trail, setTrail] = useState<{ whose: HistoryWhose; before: HistoryWhose }>({ whose, before: null });
  if (trail.whose !== whose) {
    setTrail({ whose, before: trail.whose });
    setPage(0);
  }
  const choices = useMemo(() => historyChoices(document), [document]);
  const view = useMemo(() => historyView(document, log ?? [], whose, page), [document, log, whose, page]);
  const found = useMemo(() => findInHistory(document, query), [document, query]);
  const back = trail.before === whose ? null : trail.before;

  return (
    <View
      id="history"
      aside={
        <label className="field history__search">
          <VisuallyHidden>Find someone in the History by name</VisuallyHidden>
          <span className="search">
            <Icon name="search" />
            <input type="search" placeholder="Find by name" value={query} onChange={(event) => setQuery(event.target.value)} />
          </span>
        </label>
      }
    >
      {query.trim() === '' ? null : (
        <div className="found">
          <p className="subtle" role="status">
            {found.matched === 0
              ? 'No one the History names is called that.'
              : found.matched > historySearchLimit
                ? `${found.matched} found; the first ${historySearchLimit} by name are shown.`
                : `${found.matched} found.`}
          </p>
          {found.names.length === 0 ? null : (
            <ul className="rows" aria-label="Found in the History">
              {found.names.map((name) => (
                <li key={name.entityId}>
                  <span>
                    {name.name} <span className="subtle">({name.what})</span>
                  </span>
                  <button
                    type="button"
                    aria-label={`Read ${name.name}`}
                    onClick={() => {
                      onWhose(name.entityId);
                      setQuery('');
                    }}
                  >
                    Read
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      <div className="history__whose chips" role="group" aria-label="Whose History">
        {choices.map((choice) => (
          <button key={String(choice.whose)} type="button" aria-pressed={isShown(choice, view)} onClick={() => onWhose(choice.whose)}>
            {choice.label}
            {choice.mine ? <VisuallyHidden>, your Guild</VisuallyHidden> : null}
          </button>
        ))}
      </div>
      {view.scope === 'whole' ? (
        <p className="subtle history__debug">
          Every entry of the History, unfiltered and unfolded, each with its event type. Choose a History above to leave it.
        </p>
      ) : null}
      {view.hero === null ? (
        <HistoryPage
          view={view}
          level={4}
          onPage={setPage}
          heading={
            <h3 id="history-title" tabIndex={-1}>
              {view.title}
            </h3>
          }
        />
      ) : (
        <HeroPage
          key={view.hero}
          document={document}
          heroId={view.hero}
          onBack={() => onWhose(back)}
          backLabel={`Back to ${historyTitle(document, back).replace(/^The /, 'the ')}`}
          play={play}
          busy={busy}
        />
      )}
    </View>
  );
}

