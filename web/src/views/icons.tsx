// The page's icons (M9-S3, DL-103; the review's D3): a small set drawn inline as SVG in one stroke
// style, on a 24-unit grid with rounded ends, in the text's own colour. They ship in the bundle and
// request nothing (principle 12, the bundle gate). Each is decoration beside a word or a name that
// says the same, so it is hidden from assistive technology: colour or a glyph is never the only cue.

import type { ReactNode } from 'react';

/** The strokes of each icon. */
const paths = {
  // What the Guild counts.
  wealth: (
    <>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="4.25" />
    </>
  ),
  fame: <path d="M12 3.6l2.5 5.2 5.7.8-4.1 4 1 5.7L12 16.6l-5.1 2.7 1-5.7-4.1-4 5.7-.8z" />,
  // The time of day.
  morning: (
    <>
      <path d="M3 18h18" />
      <path d="M7 18a5 5 0 0 1 10 0" />
      <path d="M12 6.5v3M5.9 10.9l1.8 1.8M18.1 10.9l-1.8 1.8" />
    </>
  ),
  afternoon: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M5.5 18.5l1.7-1.7M16.8 7.2l1.7-1.7" />
    </>
  ),
  night: <path d="M19.5 14.6A7.8 7.8 0 1 1 9.4 4.5a6.2 6.2 0 0 0 10.1 10.1z" />,
  // The kinds of Encounter.
  combat: (
    <>
      <path d="M4.5 4.5l9.5 9.5M12.2 16.6l4.4-4.4M15.2 15.2l4.3 4.3" />
      <path d="M19.5 4.5L10 14M11.8 16.6l-4.4-4.4M8.8 15.2l-4.3 4.3" />
    </>
  ),
  travel: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M15.2 8.8l-1.9 4.5-4.5 1.9 1.9-4.5z" />
    </>
  ),
  stealth: (
    <>
      <path d="M3 12s3.4-5.5 9-5.5S21 12 21 12s-3.4 5.5-9 5.5S3 12 3 12z" />
      <circle cx="12" cy="12" r="2.4" />
      <path d="M4.5 4.5l15 15" />
    </>
  ),
  arcane: <path d="M12 3c.9 4.6 4.4 8.1 9 9-4.6.9-8.1 4.4-9 9-.9-4.6-4.4-8.1-9-9 4.6-.9 8.1-4.4 9-9z" />,
  social: <path d="M4.5 5h11a2.5 2.5 0 0 1 2.5 2.5v5a2.5 2.5 0 0 1-2.5 2.5H10l-4.5 3.5V15h-1A2.5 2.5 0 0 1 2 12.5v-5A2.5 2.5 0 0 1 4.5 5z" />,
  // A Hero's state.
  morale: <path d="M12 20s-7.5-4.6-7.5-10.3A4.2 4.2 0 0 1 12 7.3a4.2 4.2 0 0 1 7.5 2.4C19.5 15.4 12 20 12 20z" />,
  injury: <path d="M9.5 4h5v5.5H20v5h-5.5V20h-5v-5.5H4v-5h5.5z" />,
  // The Guild's own.
  build: (
    <>
      <path d="M4 20l8.5-8.5" />
      <path d="M11 8.5l4-4 5 5-4 4z" />
    </>
  ),
  history: (
    <>
      <path d="M3 5.5h5.5A3.5 3.5 0 0 1 12 9v11a2.5 2.5 0 0 0-2.5-2.5H3z" />
      <path d="M21 5.5h-5.5A3.5 3.5 0 0 0 12 9v11a2.5 2.5 0 0 1 2.5-2.5H21z" />
    </>
  ),
  // The shell's controls.
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  close: <path d="M6.5 6.5l11 11M17.5 6.5l-11 11" />,
  guild: (
    <>
      <path d="M6 21V3.5" />
      <path d="M6 4.5h12l-2.5 4 2.5 4H6" />
    </>
  ),
  board: (
    <>
      <rect x="4.5" y="3.5" width="15" height="17" rx="1.5" />
      <path d="M8 8.5h8M8 12.5h8M8 16.5h5" />
    </>
  ),
  roster: (
    <>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3 20a6 6 0 0 1 12 0" />
      <circle cx="17" cy="9" r="2.6" />
      <path d="M15.8 14.2A5 5 0 0 1 21 19" />
    </>
  ),
  hall: (
    <>
      <path d="M3 10l9-6 9 6" />
      <path d="M5 9.5V20h14V9.5" />
      <path d="M10 20v-5h4v5" />
    </>
  ),
  rankings: (
    <>
      <path d="M4 20v-6h5v6M9 20V9h6v11M15 20v-8h5v8" />
      <path d="M3 20h18" />
    </>
  ),
  more: (
    <>
      <circle cx="6" cy="12" r="1.3" />
      <circle cx="12" cy="12" r="1.3" />
      <circle cx="18" cy="12" r="1.3" />
    </>
  ),
  about: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 11v5.5M12 7.8v.2" />
    </>
  ),
  alert: (
    <>
      <path d="M12 4l9 16H3z" />
      <path d="M12 10v4.5M12 17.2v.2" />
    </>
  ),
  check: <path d="M5 12.5l4.5 4.5L19 7" />,
  cross: <path d="M7 7l10 10M17 7L7 17" />,
  chevron: <path d="M6.5 9.5l5.5 5.5 5.5-5.5" />,
  back: <path d="M14.5 6l-6 6 6 6" />,
  go: <path d="M9.5 6l6 6-6 6" />,
  advance: (
    <>
      <path d="M7 5.5l10 6.5-10 6.5z" />
    </>
  ),
  forward: (
    <>
      <path d="M3.5 6l8 6-8 6zM12.5 6l8 6-8 6z" />
    </>
  ),
  stop: <rect x="7" y="7" width="10" height="10" rx="1.5" />,
  search: (
    <>
      <circle cx="10.5" cy="10.5" r="6" />
      <path d="M15 15l5 5" />
    </>
  ),
  load: <path d="M12 16V4.5M7 9l5-5 5 5M5 20h14" />,
  save: <path d="M12 4.5V16M7 11l5 5 5-5M5 20h14" />,
  new: <path d="M12 5v14M5 12h14" />,
  up: <path d="M12 19V5M6 11l6-6 6 6" />,
  down: <path d="M12 5v14M6 13l6 6 6-6" />,
} satisfies Record<string, ReactNode>;

export type IconName = keyof typeof paths;

/** Every icon's name: the test draws each one. */
export const iconNames = Object.freeze(Object.keys(paths)) as readonly IconName[];

/** One icon, sized to the text around it unless a class says otherwise; always decoration. */
export function Icon({ name, className }: { name: IconName; className?: string }) {
  return (
    <svg
      className={className === undefined ? 'icon' : `icon ${className}`}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {paths[name]}
    </svg>
  );
}
