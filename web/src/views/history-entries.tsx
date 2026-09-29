// A page of the History as the page draws it (M9-S5, DL-105): groups by Day and time of day, newest
// first, each in the order it happened; a Party's Encounters folded under its outcome, and each
// Rival's routine under one line for its Guild, each fold opened by a button; every line marked
// whose it is, new when the last play appended it, and on an outcome how the Quest went, with an
// icon and a word, never colour alone. The History view shows it, and so does a Hero's page.
//
// A name in a line opens whom it names, through the shell's `HistoryLinks`: a Hero's page, a
// Guild's page, or anyone else's History. The names are marked by the narration, from the event's
// own ids (`narrateSegments`), never found in the sentence. Where no shell gives links (a Hero's page
// drawn alone), a name is words. Every line and word comes from `state/history.ts`.

import type { EntityId, TurnEvent, WorldDocument } from '@heroesim/engine';
import { createContext, Fragment, useContext, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { historyView, type HistoryGroup, type HistoryLine, type HistoryRow, type HistoryView, type HistoryWhose } from '../state/history';
import type { Segment } from '../state/narrate';
import { Icon } from './icons';
import { Heading } from './section';
import { Chip, VisuallyHidden } from './ui';

/** A name in a line, which opens whom it names. */
export type NameSegment = Extract<Segment, { kind: 'name' }>;

/** What the shell gives the History wherever it is drawn: what is new, and where a name goes. */
export interface HistoryLinks {
  /** The last play's events: the History's newest entries, marked new. */
  log: readonly TurnEvent[];
  /** Opens whom a name names: a Hero's page, a Guild's page, or a Guildmaster's or a Patron's History. */
  onName: (name: NameSegment) => void;
  /** Opens `whose` History in the History view. */
  onHistory: (whose: HistoryWhose) => void;
}

export const HistoryLinksContext = createContext<HistoryLinks | null>(null);

/** The shell's links, or `null` where there is no shell. */
export function useHistoryLinks(): HistoryLinks | null {
  return useContext(HistoryLinksContext);
}

/** A line's words, each name a button that opens whom it names. */
export function Names({ segments }: { segments: readonly Segment[] }) {
  const links = useHistoryLinks();
  return (
    <>
      {segments.map((segment, index) =>
        segment.kind === 'text' || links === null ? (
          <Fragment key={index}>{segment.text}</Fragment>
        ) : (
          <button key={index} type="button" className="name" onClick={() => links.onName(segment)}>
            {segment.text}
          </button>
        ),
      )}
    </>
  );
}

/** The heading levels a group can take: one below where the History is drawn. */
type GroupLevel = 4 | 5 | 6;

/**
 * A page of the History, with what it says of itself above it and its pages below. The page's top
 * takes the keyboard when the page changes, so "Newest" returns to the top.
 */
export function HistoryPage({ view, level, onPage, heading }: { view: HistoryView; level: GroupLevel; onPage: (page: number) => void; heading?: ReactNode }) {
  const top = useRef<HTMLDivElement>(null);
  const turned = useRef(false);
  useEffect(() => {
    if (!turned.current) return;
    turned.current = false;
    top.current?.scrollIntoView?.({ block: 'start' });
    top.current?.focus({ preventScroll: true });
  }, [view.page]);
  const go = (page: number): void => {
    turned.current = true;
    onPage(page);
  };
  const { page, pages, entries, fresh } = view;
  // The debug view says each entry's event type (M9-F4).
  const types = view.scope === 'whole';
  return (
    <>
      <div className="history__top" ref={top} tabIndex={-1}>
        {heading}
        <p className="subtle">
          Page {page + 1} of {pages}, {entries} {entries === 1 ? 'entry' : 'entries'} in all, newest first.
          {fresh === 0 ? '' : ` ${fresh} new since your last action.`}
        </p>
      </div>
      {view.groups.length === 0 ? <p className="subtle">Nothing yet.</p> : view.groups.map((group) => <Group key={group.key} group={group} level={level} types={types} />)}
      {pages <= 1 ? null : (
        <div className="actions actions--pages">
          <button type="button" disabled={page === 0} onClick={() => go(0)}>
            Newest
          </button>
          <button type="button" disabled={page === 0} onClick={() => go(page - 1)}>
            Newer
          </button>
          <button type="button" disabled={page >= pages - 1} onClick={() => go(page + 1)}>
            Older
          </button>
          <button type="button" disabled={page >= pages - 1} onClick={() => go(pages - 1)}>
            Oldest
          </button>
        </div>
      )}
    </>
  );
}

/** An entity's History a page at a time, where it is drawn inside a page of its own: a Hero's. */
export function EntityHistory({ document, whose, level }: { document: WorldDocument; whose: EntityId; level: GroupLevel }) {
  const links = useHistoryLinks();
  const log = links?.log;
  const [page, setPage] = useState(0);
  const view = useMemo(() => historyView(document, log ?? [], whose, page), [document, log, whose, page]);
  return <HistoryPage view={view} level={level} onPage={setPage} />;
}

/** One Turn's entries, under its Day and time of day; with `types`, each with its event type. */
function Group({ group, level, types }: { group: HistoryGroup; level: GroupLevel; types: boolean }) {
  const id = useId();
  return (
    <div className="history-group">
      <Heading level={level} id={id}>
        <span className="history-group__when">
          <Icon name={group.timeOfDay} />
          <span>{group.when}</span>
        </span>
      </Heading>
      <ol className="entries" aria-labelledby={id}>
        {group.rows.map((row) => (
          <Row key={row.key} row={row} types={types} />
        ))}
      </ol>
    </div>
  );
}

function classes(...names: (string | false)[]): string {
  return names.filter((name) => name !== false).join(' ');
}

function Row({ row, types }: { row: HistoryRow; types: boolean }) {
  if (row.kind === 'routine') {
    return (
      <li className={classes('entry', 'entry--rival', 'entry--routine', row.fresh && 'is-new')}>
        <div className="entry__line">
          {row.fresh ? <span className="new-tag">New</span> : null}
          <span className="entry__text">
            <Names segments={row.segments} />
          </span>
        </div>
        <Fold label={`${row.lines.length} entries`} lines={row.lines} />
      </li>
    );
  }
  const { line, steps, stepsWords } = row;
  return (
    <li
      id={line.anchor ?? undefined}
      tabIndex={line.anchor === null ? undefined : -1}
      className={classes('entry', `entry--${line.side}`, line.fresh && 'is-new', line.milestone && 'is-milestone')}
    >
      <Line line={line} types={types} />
      {steps.length === 0 ? null : <Fold label={stepsWords} lines={steps} />}
    </li>
  );
}

/** A line's marks, then its words: new, how a Quest went, a Milestone; with `types`, its event type after them. */
function Line({ line, types = false }: { line: HistoryLine; types?: boolean }) {
  return (
    <div className="entry__line">
      {line.fresh ? <span className="new-tag">New</span> : null}
      {line.outcome === null ? null : (
        <Chip tone={line.outcome.band === 'fail' ? 'bad' : 'good'} icon={line.outcome.band === 'fail' ? 'cross' : 'check'}>
          {line.outcome.words}
        </Chip>
      )}
      {line.milestone ? (
        <span className="entry__milestone">
          <Icon name="fame" />
          <VisuallyHidden>Milestone: </VisuallyHidden>
        </span>
      ) : null}
      <span className="entry__text">
        <Names segments={line.segments} />
      </span>
      {types ? <code className="entry__type">{line.type}</code> : null}
    </div>
  );
}

/** What is folded under a line, behind a button that opens and closes it. */
function Fold({ label, lines }: { label: string; lines: readonly HistoryLine[] }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <>
      <button type="button" className="button--quiet fold" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}>
        <Icon name="chevron" className="fold__mark" />
        <span>{label}</span>
      </button>
      <ol id={id} className="entries entries--folded" hidden={!open}>
        {lines.map((line) => (
          <li key={line.key} className={classes('entry', `entry--${line.side}`, line.fresh && 'is-new', line.milestone && 'is-milestone')}>
            <Line line={line} />
          </li>
        ))}
      </ol>
    </>
  );
}
