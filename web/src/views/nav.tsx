// The navigation (M9-S3, DL-103; the review's A1 and A4): the views, the one open marked with
// `aria-current`, each a button that opens its view as React state (no router, R38). Board shows the
// Quests on offer, Roster a dot when a Transfer Offer waits, and History the entries new since the
// last action, each said in words as well (`navCounts`).
//
// Seven views in one order at every width since M9-F2 (DL-111 items 7 and 8, DL-112 item 5, DL-113
// item 1): the Guildmaster at the top, then Guild, Roster, Board, Rankings, Market and History. By
// width, and by CSS alone: under 600px a bottom bar holds Guild, Roster, Board and Rankings, and
// "More" holds the Guildmaster, the Market and the History, in the same order; from 600px a side
// rail holds all seven. The Guildmaster's label is the player's Guildmaster's name, cut with an
// ellipsis where it does not fit, and "Guildmaster" is its accessible description; with no name it
// reads "Guildmaster".

import { useCallback, useId, useRef, useState } from 'react';
import type { NavCounts } from '../state/digest';
import { Icon, type IconName } from './icons';
import { titles, viewIds, type ViewId } from './section';
import { Badge, useDismiss, VisuallyHidden } from './ui';

const icons: Readonly<Record<ViewId, IconName>> = {
  guildmaster: 'guildmaster',
  guild: 'guild',
  roster: 'roster',
  board: 'board',
  rankings: 'rankings',
  market: 'market',
  history: 'history',
};

/** The views "More" holds on a phone, in the navigation's order. */
const underMore: readonly ViewId[] = viewIds.filter((view) => ['guildmaster', 'market', 'history'].includes(view));

function Count({ view, counts }: { view: ViewId; counts: NavCounts }) {
  switch (view) {
    case 'board':
      return <Badge count={counts.quests} words={`${counts.quests} ${counts.quests === 1 ? 'Quest' : 'Quests'} on offer`} />;
    case 'roster':
      if (counts.offers === 0) return null;
      return (
        <>
          <span className="dot" aria-hidden="true" />
          <VisuallyHidden>, {counts.offers === 1 ? 'a Transfer Offer waits' : `${counts.offers} Transfer Offers wait`}</VisuallyHidden>
        </>
      );
    case 'history':
      return <Badge count={counts.fresh} words={`${counts.fresh} new`} />;
    default:
      return null;
  }
}

function Item({
  view,
  current,
  counts,
  guildmasterName,
  onOpen,
}: {
  view: ViewId;
  current: ViewId;
  counts: NavCounts;
  guildmasterName: string | null;
  onOpen: (view: ViewId) => void;
}) {
  const described = useId();
  const named = view === 'guildmaster' && guildmasterName !== null;
  return (
    <>
      <button
        type="button"
        className="nav__button"
        aria-current={current === view ? 'page' : undefined}
        aria-describedby={view === 'guildmaster' ? described : undefined}
        onClick={() => onOpen(view)}
      >
        <Icon name={icons[view]} />
        <span className="nav__label">{named ? guildmasterName : titles[view]}</span>
        <Count view={view} counts={counts} />
      </button>
      {/* The Guildmaster's description, read with the button and never shown. */}
      {view === 'guildmaster' ? (
        <span id={described} hidden>
          {titles.guildmaster}
        </span>
      ) : null}
    </>
  );
}

export function Nav({
  current,
  counts,
  guildmasterName,
  onOpen,
}: {
  current: ViewId;
  counts: NavCounts;
  /** The player's Guildmaster's name, the Guildmaster view's label; "Guildmaster" when `null`. */
  guildmasterName: string | null;
  onOpen: (view: ViewId) => void;
}) {
  const [more, setMore] = useState(false);
  const within = useRef<HTMLLIElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => setMore(false), []);
  useDismiss(more, close, within, trigger);
  const open = (view: ViewId): void => {
    setMore(false);
    onOpen(view);
  };
  return (
    <nav className="nav" aria-label="Views">
      <ul className="nav__list">
        {viewIds.map((view) => (
          <li key={view} className={`nav__item nav__item--${view}${underMore.includes(view) ? ' nav__item--wide' : ''}`}>
            <Item view={view} current={current} counts={counts} guildmasterName={guildmasterName} onOpen={open} />
          </li>
        ))}
        <li className="nav__item nav__item--more" ref={within}>
          <button
            type="button"
            ref={trigger}
            className={underMore.includes(current) ? 'nav__button is-current' : 'nav__button'}
            aria-expanded={more}
            aria-controls="nav-more"
            onClick={() => setMore(!more)}
          >
            <Icon name="more" />
            <span className="nav__label">More</span>
          </button>
          {more ? (
            <div className="popover popover--nav" id="nav-more">
              {underMore.map((view) => (
                <Item key={view} view={view} current={current} counts={counts} guildmasterName={guildmasterName} onOpen={open} />
              ))}
            </div>
          ) : null}
        </li>
      </ul>
    </nav>
  );
}
