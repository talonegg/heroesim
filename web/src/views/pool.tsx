// The Unattached pool (M7-S3 part 2; the CLI's `show pool` and `recruit`): each Hero on no Roster
// with the signing fee the player's Guild would pay and whether they would sign for its Fame, a
// Recruit button, and their page when opened, which says the same beside their Stats and hints.
//
// A part of the Roster (M9-S3, DL-103), as rows (M9-S6, DL-106; the review's B8): Name, Class,
// Level, Age, Background, Fee, whether they sign, and Recruit. The Class and Fee headings order the
// rows, for display only (`poolView`), and the order is kept in this browser. A Hero who will not
// sign is set back, with the pool's own reason, and their Recruit is disabled, the reason describing
// it: the engine's `signingRefusal`, as the row reads it (DL-109 item 2, Q17).
// A Hero's name opens their page in place, and "Back to the pool" returns to their row. Their
// thumbnail stands beside their name (v1.1.3-S7, DL-135 item 9).

import type { HeroId, WorldDocument } from '@heroesim/engine';
import { useEffect, useMemo, useState } from 'react';
import type { GameAction } from '../state/reducer';
import { poolView, type PoolOrder } from '../state/trade-views';
import { HeroPage } from './hero-page';
import { PortraitThumb } from './pictures';
import { rememberChoice, rememberedChoice } from './remembered';
import { Part } from './section';
import { SortHeader, useReturn, VisuallyHidden } from './ui';

const orders: readonly PoolOrder[] = ['listed', 'class', 'fee'];

/** The key this browser keeps the pool's order under. */
export const poolOrderKey = 'heroesim.poolOrder';

/** The id of a row's name, which opens the Hero's page and takes the keyboard back when it closes. */
function rowId(heroId: HeroId): string {
  return `pool-${heroId}`;
}

/** The id of a row's "Signs" cell, which says why a disabled Recruit is disabled. */
function signsId(heroId: HeroId): string {
  return `pool-${heroId}-signs`;
}

export function Pool({ document, busy, play }: { document: WorldDocument; busy: boolean; play: (action: GameAction) => void }) {
  const [order, setOrder] = useState<PoolOrder>(() => rememberedChoice(poolOrderKey, orders, 'listed'));
  const view = useMemo(() => poolView(document, order), [document, order]);
  const [open, setOpen] = useState<HeroId | null>(null);
  const back = useReturn();
  useEffect(() => {
    if (open !== null) globalThis.document.getElementById('hero-name')?.focus();
  }, [open]);

  /** A heading's order, or the pool's own again when it is the one in force. */
  function orderBy(next: Exclude<PoolOrder, 'listed'>): void {
    const chosen = order === next ? 'listed' : next;
    setOrder(chosen);
    rememberChoice(poolOrderKey, chosen);
  }

  if (open !== null) {
    return (
      <Part id="pool">
        <HeroPage
          key={open}
          document={document}
          heroId={open}
          onBack={() => {
            setOpen(null);
            back.closed();
          }}
          backLabel="Back to the pool"
          play={play}
          busy={busy}
          level={4}
        />
      </Part>
    );
  }
  return (
    <Part id="pool">
      <p>
        {view.rows.length === 0 ? 'The pool is empty.' : `${view.rows.length} ${view.rows.length === 1 ? 'Hero' : 'Heroes'} in the pool.`}
        {view.note === null ? null : <span className="subtle"> {view.note}</span>}
      </p>
      {view.rows.length === 0 ? null : (
        <div className="table-wrap">
          <table className="table table--first-sticky pool-table" aria-label="Heroes in the Unattached pool">
            <thead>
              <tr>
                <th scope="col">Name</th>
                <SortHeader label="Class" direction="ascending" active={order === 'class'} onSort={() => orderBy('class')} />
                <th scope="col" className="number">
                  Level
                </th>
                <th scope="col" className="number">
                  Age
                </th>
                <th scope="col">Background</th>
                <SortHeader label="Fee" direction="ascending" active={order === 'fee'} onSort={() => orderBy('fee')} className="number" />
                <th scope="col">Signs</th>
                <th scope="col">
                  <VisuallyHidden>Recruit</VisuallyHidden>
                </th>
              </tr>
            </thead>
            <tbody>
              {view.rows.map((row) => (
                <tr key={row.heroId} className={row.willSign === false ? 'is-set-back' : undefined} data-testid="pool-row">
                  <th scope="row">
                    <span className="named">
                      <PortraitThumb role="hero" sex={row.sex} portraitKey={row.portraitKey} />
                      <button
                        type="button"
                        id={rowId(row.heroId)}
                        className="link"
                        onClick={() => {
                          back.opened(rowId(row.heroId));
                          setOpen(row.heroId);
                        }}
                      >
                        {row.name}
                      </button>
                    </span>
                  </th>
                  <td>{row.className}</td>
                  <td className="number">{row.level}</td>
                  <td className="number">{row.age}</td>
                  <td>{row.background}</td>
                  <td className="number" data-testid="fee">
                    {row.fee}
                  </td>
                  <td data-testid="signs" id={signsId(row.heroId)}>
                    {row.signs}
                  </td>
                  <td>
                    <button
                      type="button"
                      aria-label={`Recruit ${row.name}`}
                      aria-describedby={row.willSign === false ? signsId(row.heroId) : undefined}
                      disabled={busy || row.willSign === false}
                      onClick={() => play({ kind: 'recruit', heroId: row.heroId })}
                    >
                      Recruit
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Part>
  );
}
