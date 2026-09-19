import type { Career, Content } from '@heroesim/engine';
import { Board } from '../panes/Board';
import { Report } from '../panes/Report';
import { Roster } from '../panes/Roster';
import {
  daysUntilRefresh,
  daysUntilUpkeep,
  hasEnded,
  standing,
  upkeepDue,
} from '../state/selectors';
import { formatDay, reckoningLines, type Paragraph } from '../words';

/** Which pane the bottom bar has in front. Only meaningful under 600px (E8-S3). */
export type PaneName = 'board' | 'roster' | 'report';

const PANES: readonly { name: PaneName; label: string }[] = [
  { name: 'board', label: 'Board' },
  { name: 'roster', label: 'Roster' },
  { name: 'report', label: 'Report' },
];

/**
 * The three layouts, chosen by CSS alone (`styles.css`): one pane at a time with a
 * bottom bar under 600px, Board and Roster side by side with the Report below to
 * 1023px, and all three at once above that. Nothing here measures the viewport.
 */
export function Shell({
  career,
  content,
  paragraphs,
  pane,
  onPane,
  onAdvance,
  onSend,
  onOpenSaves,
  onNewCareer,
  busy,
}: {
  career: Career;
  content: Content;
  paragraphs: readonly Paragraph[];
  pane: PaneName;
  onPane: (pane: PaneName) => void;
  onAdvance: () => void;
  onSend: (commissionId: string) => void;
  onOpenSaves: () => void;
  onNewCareer: () => void;
  busy: boolean;
}) {
  const ended = hasEnded(career);

  return (
    <div className="app" data-pane={pane}>
      <header className="header">
        <h1 className="header__name" data-testid="guild-name">
          {career.guild.name}
        </h1>
        <div className="header__actions">
          {ended ? null : (
            <>
              <button
                type="button"
                className="button--primary"
                data-testid="advance"
                disabled={busy}
                onClick={onAdvance}
              >
                Advance
              </button>
              <button type="button" data-testid="open-saves" onClick={onOpenSaves}>
                Saves
              </button>
            </>
          )}
          <button type="button" data-testid="new-career" onClick={onNewCareer}>
            New Career
          </button>
        </div>
        <ul className="header__facts">
          <li data-testid="day">{formatDay(career.day, career)}</li>
          <li>
            Coin <b data-testid="coin">{career.guild.coin}</b>
          </li>
          <li>
            Standing <b data-testid="standing">{standing(career)}</b>
          </li>
          <li>
            Next Upkeep <b>{upkeepDue(career)} coin</b> in {daysUntilUpkeep(career)} Days
          </li>
          <li>Board refreshes in {daysUntilRefresh(career)} Days</li>
        </ul>
      </header>

      {career.ended === undefined ? null : (
        <section className="notice" aria-label="Reckoning" data-testid="reckoning">
          <ul className="reckoning">
            {reckoningLines(career.ended.reckoning, career).map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </section>
      )}

      <main className="panes">
        <Board career={career} content={content} onSend={onSend} busy={busy} ended={ended} />
        <Roster career={career} />
        <Report paragraphs={paragraphs} />
      </main>

      <nav className="bar" aria-label="Panes" data-testid="pane-bar">
        {PANES.map((entry) => (
          <button
            type="button"
            key={entry.name}
            aria-pressed={pane === entry.name}
            className={pane === entry.name ? 'button--on' : undefined}
            data-testid={`bar-${entry.name}`}
            onClick={() => {
              onPane(entry.name);
            }}
          >
            {entry.label}
          </button>
        ))}
      </nav>
    </div>
  );
}
