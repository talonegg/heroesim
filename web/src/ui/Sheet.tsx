import { useEffect, useRef, type ReactNode } from 'react';

/**
 * A sheet over the current pane: every secondary view uses it. It is a plain overlay
 * rather than `<dialog>` so that it behaves the same in jsdom, in Chromium and at 320px,
 * where it fills the width.
 *
 * **From the keyboard.** The sheet says it is modal, so it has to behave as one for
 * somebody who is not pointing at it: opening it takes focus into the sheet — where the
 * heading is, rather than leaving it on a control now behind a scrim — and Escape closes
 * it, as it closes every dialog a player has ever met. Closing it puts focus back on the
 * control that opened it, so a player who opens Patrons, reads it and closes it is where
 * they were rather than at the top of the document.
 */
export function Sheet({
  title,
  onClose,
  children,
  actions,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  actions?: ReactNode;
}) {
  const sheet = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Whatever was focused when the sheet opened — the header control that opened it — is
    // given the focus back when it closes.
    const opener = document.activeElement;
    sheet.current?.focus();
    return () => {
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
    };
  }, []);

  return (
    <div className="scrim" onClick={onClose} role="presentation">
      <div
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        ref={sheet}
        // Focusable so that opening the sheet can take the player into it, but never a
        // stop on the way through: Tab goes from here to the controls inside.
        tabIndex={-1}
        onKeyDown={(event) => {
          if (event.key !== 'Escape') return;
          event.stopPropagation();
          onClose();
        }}
        onClick={(event) => {
          event.stopPropagation();
        }}
      >
        <div className="sheet__head">
          <h2 className="sheet__title">{title}</h2>
          <button type="button" onClick={onClose}>
            Close
          </button>
        </div>
        {children}
        {actions === undefined ? null : <div className="sheet__actions">{actions}</div>}
      </div>
    </div>
  );
}
