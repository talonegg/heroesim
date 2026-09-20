import type { Career, Content } from '@heroesim/engine';
import { Board } from '../panes/Board';
import { Report } from '../panes/Report';
import { Roster } from '../panes/Roster';
import { Word } from '../panes/Word';
import {
  applicantCue,
  daysUntilRefresh,
  daysUntilUpkeep,
  hasEnded,
  standing,
  upkeepDue,
  wordCue,
} from '../state/selectors';
import { coin, count, formatDay, reckoningLines, type Paragraph } from '../words';

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
  onOpenHall,
  onOpenApplicants,
  onOpenRivals,
  onOpenLeague,
  onOpenMore,
  onNewCareer,
  onAnswer,
  busy,
}: {
  career: Career;
  content: Content;
  paragraphs: readonly Paragraph[];
  pane: PaneName;
  onPane: (pane: PaneName) => void;
  onAdvance: () => void;
  onAnswer: (partyId: string, optionId: string) => void;
  onSend: (commissionId: string) => void;
  onOpenSaves: () => void;
  onOpenHall: () => void;
  onOpenApplicants: () => void;
  onOpenRivals: () => void;
  onOpenLeague: () => void;
  onOpenMore: () => void;
  onNewCareer: () => void;
  busy: boolean;
}) {
  const ended = hasEnded(career);
  // How many are at the door, and how long the first of them will wait: the cue is in
  // words and numbers, never in colour alone (E4-S2).
  const applicants = applicantCue(career);
  // A Party waiting on word takes the Report pane and raises a badge on the bar (E8-S3),
  // and Advance is refused while it stands, so the Days can never pass one silently.
  const word = wordCue(career);
  // A Career that is over has nothing waiting on the player's word: the Days will not run
  // again, so a Party frozen mid-Commission when the Career ended can no longer be
  // answered — `answerParty` refuses it with `CareerEnded` — and the pane that asks, with
  // its options, its countdown and its "let the Days run", would be offering a decision
  // that cannot be taken. It goes with the rest of the decisions (E8-S6 box 2, DL-27 §9).
  const waiting = word.waiting > 0 && !ended;

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
                disabled={busy || waiting}
                onClick={onAdvance}
              >
                Advance
              </button>
              <button
                type="button"
                className={applicants.waiting > 0 ? 'button--on' : undefined}
                data-testid="open-applicants"
                data-waiting={applicants.waiting}
                onClick={onOpenApplicants}
              >
                {applicants.waiting === 0
                  ? 'Applicants'
                  : `Applicants (${applicants.waiting})`}
              </button>
              <button type="button" data-testid="open-rivals" onClick={onOpenRivals}>
                Rivals
              </button>
              <button type="button" data-testid="open-league" onClick={onOpenLeague}>
                League
              </button>
              <button type="button" data-testid="open-hall" onClick={onOpenHall}>
                Hall
              </button>
              <button type="button" data-testid="open-saves" onClick={onOpenSaves}>
                Saves
              </button>
            </>
          )}
          {/* An ended Career offers no decision about itself — no Advance, no Send, no
              Applicants, no Hall, no deal and no word (E8-S6 box 2) — but the League, the
              Patrons, the former Heroes and the five things that just happened are how a
              player reads what the Guild became, so the read-only views stay (DL-27 §9).
              Saves is gone with the rest: the New Career screen carries "Load a saved
              Career", which is where a player goes next. */}
          {ended ? (
            <button type="button" data-testid="open-league" onClick={onOpenLeague}>
              League
            </button>
          ) : null}
          <button type="button" data-testid="open-more" onClick={onOpenMore}>
            More
          </button>
          <button type="button" data-testid="new-career" onClick={onNewCareer}>
            New Career
          </button>
        </div>
        <ul className="header__facts">
          <li data-testid="day">{formatDay(career.day, career)}</li>
          {/* `575 coin`, grouped and never abbreviated, in the one format `narrate` writes
              and the terminal's own header prints — not the label-and-bare-number `Coin
              575` this said until DL-27 §1. */}
          <li>
            <b data-testid="coin">{coin(career.guild.coin)}</b>
          </li>
          <li>
            Standing <b data-testid="standing">{standing(career)}</b>
          </li>
          {/* Both clocks are cues about Days that are still to come, so an ended Career
              shows neither: nothing falls due on a Guild that has finished and the Board
              will never refresh again, and a committed screenshot carried "Next Upkeep 88
              coin in 10 Days · Board refreshes in 10 Days" under a reckoning. The Day, the
              coin and the Standing stay, because those are what the Guild ended with. The
              terminal has never had this fault — its ending screen is the reckoning and two
              keys, and never the main screen (`cli/src/main.ts`'s `readTheEnding`).
              Every span of Days is counted with `narrate`'s `count`, so "in 1 Days" — which
              a committed screenshot also caught — cannot come back (DL-27 §4). */}
          {ended ? null : (
            <>
              <li data-testid="upkeep-cue">
                Next Upkeep <b>{coin(upkeepDue(career))}</b> in{' '}
                {count(daysUntilUpkeep(career), 'Day', 'Days')}
              </li>
              <li data-testid="refresh-cue">
                Board refreshes in {count(daysUntilRefresh(career), 'Day', 'Days')}
              </li>
            </>
          )}
          {waiting ? (
            // What this said until DL-24 §A1 was "the Days will not run until you answer",
            // which was true of this client and false of the engine: a later `advance`
            // passes Days with the awaiting Party frozen until its `timesOutOn` (DL-23 §3).
            // Advance is held, and the Word pane carries the way to let the Days run.
            <li data-testid="word-waiting">
              <b>{word.waiting}</b>{' '}
              {word.waiting === 1 ? 'Party is' : 'Parties are'} waiting on your word · Advance is
              held until you answer, or leave it to them · the first acts on its own judgement
              in <b>{word.daysLeft}</b> {word.daysLeft === 1 ? 'Day' : 'Days'}
            </li>
          ) : null}
          {/* An ended Career shows no cue about a decision it can no longer take: the
              door is closed with the rest of it, and a count of people waiting at a door
              nobody can open is noise rather than information (E8-S6 box 2, DL-27 §9). */}
          {ended || applicants.waiting === 0 ? null : (
            <li data-testid="applicants-waiting">
              {applicants.noneCanBeTaken ? (
                <>
                  <b>{applicants.waiting}</b> waiting at the door · none can be taken on
                  {applicants.why === undefined ? '' : `: ${applicants.why}`}
                </>
              ) : (
                <>
                  <b>{applicants.waiting}</b> waiting at the door · the first goes in{' '}
                  <b>{applicants.daysLeft}</b> {applicants.daysLeft === 1 ? 'Day' : 'Days'}
                </>
              )}
            </li>
          )}
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
        {waiting ? (
          <Word
            career={career}
            onAnswer={onAnswer}
            onLetTheDaysRun={onAdvance}
            disabled={busy}
          />
        ) : (
          <Report paragraphs={paragraphs} />
        )}
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
            {/* The badge is the count and the word, never a dot: colour is never the
                only thing carrying a fact (E8-S3, E6-S4). */}
            {entry.name === 'report' && waiting
              ? `Word (${String(word.waiting)})`
              : entry.label}
          </button>
        ))}
      </nav>
    </div>
  );
}
