// The game menu (M9-S3, DL-103; the review's A6 and B12): what concerns the game rather than play.
// Export, the saves kept in this browser, loading a file, a new game, the rules notice when there is
// one, and the reference facts that left the header and the footer: the seed the world was made
// from and the content set's version. A dialog over the page: the keyboard starts on its heading,
// stays inside it, and Escape or Close put it away and return to the button that opened it.
//
// Last, the debug view (M9-F4, DL-117): "Debug: the whole History" opens the History view on every
// entry, unfiltered and unfolded, with its event type. It is not a choice of the History's own
// (DL-111 item 4), and it sits at the menu's end, after what concerns the game, since it is for
// reading how the engine played rather than for playing.

import type { Module, WorldDocument } from '@heroesim/engine';
import { useEffect, useRef, type KeyboardEvent } from 'react';
import { content } from '../content';
import type { Saves } from '../saves';
import { listed } from '../state/narrate';
import type { GameAction, GameState } from '../state/reducer';
import { GameFile } from './game-file';
import { Icon } from './icons';
import { RulesNotice } from './rules-notice';
import { HelpFor } from './section';

/** `the probe module`, `the probe and weather modules`: what is installed for testing. */
export function installedWords(modules: readonly Module[]): string {
  return `the ${listed(modules.map((module) => module.id))} ${modules.length === 1 ? 'module' : 'modules'}`;
}

/** The controls the keyboard can reach inside `root`, in order. */
function reachable(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, summary, [tabindex]:not([tabindex="-1"])')].filter(
    (element) => !element.hasAttribute('disabled') && element.getAttribute('aria-hidden') !== 'true',
  );
}

export function GameMenu({
  document,
  state,
  saves,
  busy,
  play,
  notice,
  modules,
  onClose,
  onNewGame,
  onDebugHistory,
}: {
  document: WorldDocument;
  state: GameState;
  saves: Saves;
  busy: boolean;
  play: (action: GameAction) => void;
  notice: { from: number; to: number } | null;
  modules: readonly Module[];
  onClose: () => void;
  onNewGame: () => void;
  /** Opens the whole History, the debug view, in the History view. */
  onDebugHistory: () => void;
}) {
  const dialog = useRef<HTMLDivElement>(null);
  useEffect(() => {
    globalThis.document.getElementById('menu-heading')?.focus();
  }, []);

  function keys(event: KeyboardEvent<HTMLDivElement>): void {
    if (event.key === 'Escape') {
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.key !== 'Tab' || dialog.current === null) return;
    // The keyboard stays in the dialog: Tab from its last control goes to its first, and back.
    const controls = reachable(dialog.current);
    const first = controls[0];
    const last = controls.at(-1);
    const active = globalThis.document.activeElement;
    if (event.shiftKey && (active === first || !dialog.current.contains(active))) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first?.focus();
    }
  }

  return (
    <div
      className="dialog-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div ref={dialog} className="dialog" role="dialog" aria-modal="true" aria-labelledby="menu-heading" onKeyDown={keys}>
        <div className="dialog__head">
          <h2 id="menu-heading" tabIndex={-1}>
            Game
          </h2>
          <button type="button" className="button--quiet" onClick={onClose}>
            <Icon name="close" />
            <span>Close</span>
          </button>
        </div>
        <HelpFor ids={notice === null ? ['game'] : ['game', 'rules']} label="About the game menu" />
        <dl className="facts-list">
          <div>
            <dt>Seed</dt>
            <dd data-testid="seed">{document.meta.seed}</dd>
          </div>
          <div>
            <dt>Content set</dt>
            <dd>
              {content.id}, version {content.version}
            </dd>
          </div>
          {modules.length === 0 ? null : (
            <div>
              <dt>Installed for testing</dt>
              <dd>{installedWords(modules)}</dd>
            </div>
          )}
        </dl>
        {notice === null ? null : <RulesNotice notice={notice} busy={busy} play={play} />}
        <GameFile document={document} state={state} saves={saves} busy={busy} play={play} onNewGame={onNewGame} />
        <div className="actions dialog__debug">
          <button type="button" className="button--quiet" onClick={onDebugHistory}>
            <Icon name="history" />
            <span>Debug: the whole History</span>
          </button>
        </div>
      </div>
    </div>
  );
}
