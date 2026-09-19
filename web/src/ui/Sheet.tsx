import type { ReactNode } from 'react';

/**
 * A sheet over the current pane: the Party picker and the slot picker both use it. It is
 * a plain overlay rather than `<dialog>` so that it behaves the same in jsdom, in
 * Chromium and at 320px, where it fills the width.
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
  return (
    <div className="scrim" onClick={onClose} role="presentation">
      <div
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-label={title}
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
