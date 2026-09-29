// The Roster (M7-S3; the CLI's `show roster` and `show hero`): the player's Heroes, and one Hero's
// page in their place when chosen. No router (M7 §0): which Hero is open is this view's own state,
// and "Back to the Roster" closes the page. A Hero's page offers equip, unequip and transfer out
// (part 2, DL-73).
//
// A view of the shell (M9-S3, DL-103), with the Transfer Offers, only while one stands, and the
// Unattached pool as its parts. Each Hero is a compact card (M9-S6, DL-106): their name, Class, Level
// and age, a Morale chip, and where they are, injured or away shown by an icon and its words. Their
// page opens with the keyboard on their name, and closing it returns the keyboard to their card.

import type { HeroId, WorldDocument } from '@heroesim/engine';
import { useEffect, useMemo, useState } from 'react';
import type { GameAction } from '../state/reducer';
import { rosterView, type RosterRow } from '../state/selectors';
import { HeroPage } from './hero-page';
import { Offers } from './offers';
import { Pool } from './pool';
import { View } from './section';
import { Chip, moraleTones, useReturn } from './ui';

/** The id of a card's name, which opens the Hero's page and takes the keyboard back when it closes. */
function cardId(heroId: HeroId): string {
  return `roster-${heroId}`;
}

export function Roster({ document, busy, play }: { document: WorldDocument; busy: boolean; play: (action: GameAction) => void }) {
  const rows = useMemo(() => rosterView(document), [document]);
  const [open, setOpen] = useState<HeroId | null>(null);
  const back = useReturn();
  useEffect(() => {
    if (open !== null) globalThis.document.getElementById('hero-name')?.focus();
  }, [open]);
  if (open !== null) {
    return (
      <View id="roster">
        <HeroPage
          key={open}
          document={document}
          heroId={open}
          onBack={() => {
            setOpen(null);
            back.closed();
          }}
          play={play}
          busy={busy}
        />
      </View>
    );
  }
  return (
    <View id="roster">
      <p className="view__lead">{rows.length === 0 ? 'The Roster is empty.' : `${rows.length} ${rows.length === 1 ? 'Hero' : 'Heroes'} on the Roster.`}</p>
      {rows.length === 0 ? null : (
        <ul className="cards hero-cards" aria-label="Heroes on the Roster">
          {rows.map((row) => (
            <li key={row.heroId} className="card hero-card">
              <HeroCard
                row={row}
                onOpen={() => {
                  back.opened(cardId(row.heroId));
                  setOpen(row.heroId);
                }}
              />
            </li>
          ))}
        </ul>
      )}
      <Offers document={document} busy={busy} play={play} />
      <Pool document={document} busy={busy} play={play} />
    </View>
  );
}

/** A Hero on the Roster: who, their Class, Level and age, their Morale, and where they are. */
function HeroCard({ row, onOpen }: { row: RosterRow; onOpen: () => void }) {
  return (
    <>
      <button type="button" id={cardId(row.heroId)} className="link" onClick={onOpen}>
        {row.name}
      </button>
      <p className="hero-card__line">
        {row.className} · Level {row.level} · age {row.age}
      </p>
      <p className="hero-card__state">
        <Chip tone={moraleTones[row.moraleBand]} icon="morale">
          Morale {row.morale}, {row.moraleBand}
        </Chip>
        {row.why === 'injured' ? (
          <Chip tone="warn" icon="injury">
            {row.whereabouts}
          </Chip>
        ) : row.why === 'in-party' ? (
          <Chip tone="accent" icon="travel">
            {row.whereabouts}
          </Chip>
        ) : (
          <Chip icon="hall">{row.whereabouts}</Chip>
        )}
      </p>
    </>
  );
}
