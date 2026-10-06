// The page's icons (M9-S3, DL-103; the review's D3): a small set drawn inline as SVG in one stroke
// style, on a 24-unit grid with rounded ends, in the text's own colour. They ship in the bundle and
// request nothing (principle 12, the bundle gate). Each is decoration beside a word or a name that
// says the same, so it is hidden from assistive technology: colour or a glyph is never the only cue.

import type { ClassIcon } from '@heroesim/engine';
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
  // A scroll, for riddles, records and clues (v1.1.4-S8).
  lore: (
    <>
      <path d="M8 6.5a2 2 0 0 1 2-2h8.5a1.5 1.5 0 0 1 0 3H17V18a2 2 0 0 1-2 2H6.5" />
      <path d="M8 6.5V18.5a1.5 1.5 0 0 1-3 0V17h3" />
      <path d="M11 10.5h3M11 14h3" />
    </>
  ),
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
  // M9-F2: the Guildmaster, a figure under a crown, and the Market, a stall under its awning.
  guildmaster: (
    <>
      <path d="M8 7.5L7 3.5l3 2 2-2.5 2 2.5 3-2-1 4z" />
      <circle cx="12" cy="11" r="3" />
      <path d="M5 21a7 7 0 0 1 14 0" />
    </>
  ),
  market: (
    <>
      <path d="M3.5 9l1.5-5h14l1.5 5z" />
      <path d="M3.5 9a2.8 2.8 0 0 0 5.7 0 2.8 2.8 0 0 0 5.6 0 2.8 2.8 0 0 0 5.7 0" />
      <path d="M5 11.5V20h14v-8.5M10 20v-5h4v5" />
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

/**
 * The Class icons (v1.1.7-S6, DL-206 item 22, DL-212), one drawing for each of the engine's
 * `classIcons`, in the same style as the rest; the owner approved the set on 2026-10-06 after five
 * rounds of drawings. A test ties each name to a drawing and each drawing to a name.
 */
const classDrawings = {
  'sword-and-shield': (
    <>
      <path d="M5.25 15V5L6.5 2.75 7.75 5V15" />
      <path d="M3.5 15h6M6.5 15v4.5" />
      <path d="M12 7l4.75-2 4.75 2v4.5c0 3.8-2.2 6.3-4.75 7.5-2.55-1.2-4.75-3.7-4.75-7.5z" />
    </>
  ),
  // Two daggers crossed a little above their guards, points down: the drawing is one dagger twice, turned,
  // then flipped.
  'crossed-daggers': (
    <g transform="translate(0 24) scale(1 -1)">
      <g transform="translate(0 1.6) rotate(45 12 10.5)">
        <path d="M11 13V3.2L12 1.2 13 3.2V13" />
        <path d="M10 13h4M12 13v5" />
      </g>
      <g transform="translate(0 1.6) rotate(-45 12 10.5)">
        <path d="M11 13V3.2L12 1.2 13 3.2V13" />
        <path d="M10 13h4M12 13v5" />
      </g>
    </g>
  ),
  // An open tome, its pages' thickness shown beneath, and a spark above.
  tome: (
    <>
      <path d="M3 8.5c3-1.4 6-1.2 9 .8 3-2 6-2.2 9-.8V17c-3-1.2-6-1-9 .8-3-1.8-6-2-9-.8z" />
      <path d="M12 9.3v8.5" />
      <path d="M3 17v2.5c3-1.2 6-1 9 .8 3-1.8 6-2 9-.8V17" />
      <path d="M12 2c.3 1.3.8 1.8 2 2-1.2.3-1.7.8-2 2-.3-1.2-.8-1.7-2-2 1.2-.2 1.7-.7 2-2z" />
    </>
  ),
  // An open palm, fingers up, without a crease.
  palm: (
    <path d="M8.6 22C8.3 20.3 7.6 19 6.6 17.6L4.3 13.2A1.25 1.25 0 0 1 6.4 11.9L9.4 14.2L9 5.6A1.2 1.2 0 0 1 11.4 5.3L11.7 11.8L11.6 4.3A1.2 1.2 0 0 1 14 4.3L14 11.8L14.3 5.4A1.2 1.2 0 0 1 16.7 5.6L16.4 12.2L16.9 8.4A1.15 1.15 0 0 1 19.2 8.8L18.5 14.4C18.3 17.5 17 19.6 15.6 22" />
  ),
} satisfies Record<ClassIcon, ReactNode>;

/** The mark of a Class that names no icon: a plain diamond. */
const plainMark = <path d="M12 4l8 8-8 8-8-8z" />;

/** Every Class icon drawn: the test sets them beside `classIcons`. */
export const classDrawingNames = Object.freeze(Object.keys(classDrawings)) as readonly string[];

/** The one `<svg>` every icon is drawn in: a 24-unit grid, a 1.75 stroke, round ends, the text's own colour; always decoration. */
function Drawing({ className, children }: { className: string; children: ReactNode }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

/**
 * A Class's mark: its icon, or the plain mark for a Class with none, hidden from assistive technology
 * (the Class's name stays in words where it was) with a tooltip that names the Class (DL-206 item 24,
 * DL-212). It takes the text's colour, so it holds the contrast the text does (DL-103).
 */
export function ClassMark({ icon, className }: { icon: ClassIcon | null; className: string }) {
  return (
    <span className="class-mark" aria-hidden="true" title={className}>
      <Drawing className="icon">{icon === null ? plainMark : classDrawings[icon]}</Drawing>
    </span>
  );
}

/**
 * One Hero's name with their Class's mark before it (DL-206 item 23, DL-212): the one element every
 * place that lists a Hero with their Class uses, so that the mark and the name stand in one place.
 * The mark and the name's first word are one unit that never parts, so the mark is never alone on a
 * line; the later words follow and wrap as words do (the owner's (b), DL-212). `nameClass` styles the
 * name where its place has a style of its own, as the Party builder's does.
 */
export function HeroName({ icon, className, name, nameClass }: { icon: ClassIcon | null; className: string; name: string; nameClass?: string }) {
  const space = name.search(/\s/);
  const [firstWord, rest] = space < 0 ? [name, ''] : [name.slice(0, space), name.slice(space)];
  return (
    <span className={nameClass === undefined ? 'hero-name' : `hero-name ${nameClass}`}>
      <span className="hero-name__lead">
        <ClassMark icon={icon} className={className} />
        <span className="hero-name__first">{firstWord}</span>
      </span>
      {rest}
    </span>
  );
}

export type IconName = keyof typeof paths;

/** Every icon's name: the test draws each one. */
export const iconNames = Object.freeze(Object.keys(paths)) as readonly IconName[];

/** One icon, sized to the text around it unless a class says otherwise; always decoration. */
export function Icon({ name, className }: { name: IconName; className?: string }) {
  return <Drawing className={className === undefined ? 'icon' : `icon ${className}`}>{paths[name]}</Drawing>;
}
