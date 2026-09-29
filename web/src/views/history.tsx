// The History (M7-S3 part 2; the CLI's `show history [entityId]`): the whole History of the world,
// or a Guild's, newest first, a page at a time, each entry a sentence from the front end's own
// `narrate.ts`. Nothing is dropped (principle 11): a folded Guild's History can still be read.
//
// Anyone else the History names is found by name (DL-74): a Hero, dead, retired or gone from the
// world, a Guildmaster or a Patron, as the CLI reaches any of them by id. A Hero the world still
// holds opens on their page, the CLI's `show hero`, with their Milestones first; anyone else's
// entries are listed as a Guild's are.
//
// A view of the shell (M9-S3, DL-103), with "Since your last action" above it as its part, one
// above the other until M9-S5 folds them into one. Whose History is shown is the shell's, so the
// choice holds while the game is in hand, whichever view is open (DL-74 item 8).

import type { EntityId, WorldDocument } from '@heroesim/engine';
import { useMemo, useState } from 'react';
import type { GameAction, GameState } from '../state/reducer';
import { findInHistory, historyChoices, historySearchLimit, historyView } from '../state/world-views';
import { HeroPage, Lines } from './hero-page';
import { Icon } from './icons';
import { Log } from './log';
import { View } from './section';

export function History({
  state,
  document,
  busy,
  play,
  guildName,
  whose,
  onWhose,
  mine,
  onMine,
}: {
  state: GameState;
  document: WorldDocument;
  busy: boolean;
  play: (action: GameAction) => void;
  guildName: string;
  /** Whose History is shown: the whole History when `null`. */
  whose: EntityId | null;
  onWhose: (whose: EntityId | null) => void;
  /** Whether "Since your last action" keeps to the player's Guild. */
  mine: boolean;
  onMine: (mine: boolean) => void;
}) {
  const [page, setPage] = useState(0);
  const [query, setQuery] = useState('');
  const choices = useMemo(() => historyChoices(document), [document]);
  const view = useMemo(() => historyView(document, whose, page), [document, whose, page]);
  const found = useMemo(() => findInHistory(document, query), [document, query]);
  const chosen = view.name === null ? '' : (whose ?? '');
  const choose = (entityId: EntityId | null): void => {
    onWhose(entityId);
    setPage(0);
  };
  return (
    <View id="history">
      <Log state={state} guildName={guildName} mine={mine} onMine={onMine} />
      <div className="history__controls">
      <label className="field">
        <span>Whose History</span>
        <select value={chosen} onChange={(event) => choose(event.target.value === '' ? null : (event.target.value as EntityId))}>
          <option value="">The whole History</option>
          {choices.map((choice) => (
            <option key={choice.guildId} value={choice.guildId}>
              {choice.name}
            </option>
          ))}
          {chosen === '' || choices.some((choice) => choice.guildId === chosen) ? null : <option value={chosen}>{view.name}</option>}
        </select>
      </label>
      <label className="field">
        <span>Find someone in the History by name</span>
        <span className="search">
          <Icon name="search" />
          <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} />
        </span>
      </label>
      </div>
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
                      choose(name.entityId);
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
      {view.hero === null ? (
        <>
          <h3>{view.title}</h3>
          <p className="subtle">
            Page {view.page + 1} of {view.pages}, {view.entries} {view.entries === 1 ? 'entry' : 'entries'} in all, newest first.
          </p>
          <Lines lines={view.lines} empty="Nothing yet." />
          <div className="actions actions--pages">
            <button type="button" disabled={view.page === 0} onClick={() => setPage(0)}>
              Newest
            </button>
            <button type="button" disabled={view.page === 0} onClick={() => setPage(view.page - 1)}>
              Newer
            </button>
            <button type="button" disabled={view.page >= view.pages - 1} onClick={() => setPage(view.page + 1)}>
              Older
            </button>
            <button type="button" disabled={view.page >= view.pages - 1} onClick={() => setPage(view.pages - 1)}>
              Oldest
            </button>
          </div>
        </>
      ) : (
        <HeroPage key={view.hero} document={document} heroId={view.hero} onBack={() => choose(null)} backLabel="Back to the whole History" play={play} busy={busy} />
      )}
    </View>
  );
}
