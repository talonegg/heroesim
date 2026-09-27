// A section of the page (M7-S3): a labelled region with its heading, which a button can move the
// keyboard to, and a sentence saying what the section is for and what its controls do. That
// sentence is the page's `help` (the CLI's usage text, `cli/src/args.ts`, adapted): each section
// says what it does where it is, and a test holds every section to it (DL-73).

import type { ReactNode } from 'react';

/** A section of the page a button can take the player to. */
export type SectionId =
  | 'new-game'
  | 'rules'
  | 'time'
  | 'board'
  | 'roster'
  | 'offers'
  | 'pool'
  | 'market'
  | 'hall'
  | 'guildmaster'
  | 'patrons'
  | 'rankings'
  | 'guilds'
  | 'log'
  | 'history'
  | 'game';

export function Section({
  id,
  title,
  help,
  className,
  children,
}: {
  id: SectionId;
  title: string;
  /** What the section is for and what its controls do. */
  help: string;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <section id={id} className={className === undefined ? 'panel' : `panel ${className}`} aria-labelledby={`${id}-heading`} aria-describedby={`${id}-help`}>
      <h2 id={`${id}-heading`} tabIndex={-1}>
        {title}
      </h2>
      <p id={`${id}-help`} className="note">
        {help}
      </p>
      {children}
    </section>
  );
}

/** A heading at `level`, for a part that sits at different depths: a Hall in its section, or on a Guild's page. */
export function Heading({ level, id, children }: { level: 3 | 4 | 5 | 6; id?: string; children: ReactNode }) {
  const Tag = `h${level}` as const;
  return <Tag id={id}>{children}</Tag>;
}

/** Label and value pairs. */
export function Terms({ pairs }: { pairs: readonly (readonly [string, string | number])[] }) {
  return (
    <dl className="terms">
      {pairs.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}
