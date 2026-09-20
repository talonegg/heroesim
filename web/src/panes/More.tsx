import { Sheet } from '../ui/Sheet';

/**
 * The secondary views, listed in words (E8-S6). The header already carried seven controls
 * and wrapped to two rows at 360px; Patrons, former Heroes and the history would have
 * taken it to three, and a header three rows deep pushes the Board off a phone screen
 * before a single Commission has been read.
 *
 * So one control opens this, and this names the three in words with a line saying what
 * each one holds — never an icon, and never a row of initials. It is a sheet like every
 * other secondary view, so it costs no new mechanism and no new breakpoint: the layout is
 * still CSS alone (DL-27 §8).
 */
export function More({
  onOpenPatrons,
  onOpenFormer,
  onOpenHistory,
  onClose,
}: {
  onOpenPatrons: () => void;
  onOpenFormer: () => void;
  onOpenHistory: () => void;
  onClose: () => void;
}) {
  const entries: { testid: string; label: string; says: string; open: () => void }[] = [
    {
      testid: 'open-patrons',
      label: 'Patrons',
      says: 'Who buys the work, by Sphere: their Regard, why it stands there, and what each has on the Board.',
      open: onOpenPatrons,
    },
    {
      testid: 'open-former',
      label: 'Former Heroes',
      says: 'Everybody who has left the Roster: how they went, when, and what they were.',
      open: onOpenFormer,
    },
    {
      testid: 'open-history',
      label: 'What has happened',
      says: 'The last five things you decided, and what came of them.',
      open: onOpenHistory,
    },
  ];

  return (
    <Sheet title="More" onClose={onClose}>
      <ul className="cards">
        {entries.map((entry) => (
          <li className="card" key={entry.testid}>
            <button
              type="button"
              className="button--primary"
              data-testid={entry.testid}
              // The line under the control is what it opens, so it is tied to the control
              // rather than merely sitting beside it: a player who hears the button read
              // out hears what it holds, not only its name.
              aria-describedby={`${entry.testid}-says`}
              onClick={entry.open}
            >
              {entry.label}
            </button>
            <p className="card__line card__line--quiet" id={`${entry.testid}-says`}>
              {entry.says}
            </p>
          </li>
        ))}
      </ul>
    </Sheet>
  );
}
