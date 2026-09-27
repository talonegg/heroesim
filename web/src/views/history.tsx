// The History (M7-S3 part 2; the CLI's `show history [entityId]`): the whole History of the world,
// or a Guild's, newest first, a page at a time, each entry a sentence from the front end's own
// `narrate.ts`. A Hero's History is on their page. Nothing is dropped (principle 11): a folded
// Guild's History can still be read.

import type { GuildId, WorldDocument } from '@heroesim/engine';
import { useMemo, useState } from 'react';
import { historyChoices, historyView } from '../state/world-views';
import { Lines } from './hero-page';
import { Section } from './section';

export function History({ document }: { document: WorldDocument }) {
  const [whose, setWhose] = useState<GuildId | null>(null);
  const [page, setPage] = useState(0);
  const choices = useMemo(() => historyChoices(document), [document]);
  const view = useMemo(() => historyView(document, whose, page), [document, whose, page]);
  return (
    <Section
      id="history"
      title="History"
      help="Everything the world has recorded, or one Guild’s part of it, newest first, a page at a time. A Hero’s History is on their page."
    >
      <label className="field">
        <span>Whose History</span>
        <select
          value={whose ?? ''}
          onChange={(event) => {
            setWhose(event.target.value === '' ? null : (event.target.value as GuildId));
            setPage(0);
          }}
        >
          <option value="">The whole History</option>
          {choices.map((choice) => (
            <option key={choice.guildId} value={choice.guildId}>
              {choice.name}
            </option>
          ))}
        </select>
      </label>
      <h3>{view.title}</h3>
      <p className="subtle">
        Page {view.page + 1} of {view.pages}, {view.entries} {view.entries === 1 ? 'entry' : 'entries'} in all, newest first.
      </p>
      <Lines lines={view.lines} empty="Nothing yet." />
      <div className="actions">
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
    </Section>
  );
}
