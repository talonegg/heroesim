import type { Career } from '@heroesim/engine';
import { applicantCards } from '../state/selectors';
import { Sheet } from '../ui/Sheet';
import { Stats } from '../ui/Stats';
import { TraitChips } from '../ui/TraitChips';
import { coin, count, returnerSentence } from '../words';

/**
 * The people waiting at the door (E4-S3). The Background summary and the Traits come
 * **first** and the Stats second, because an Applicant read as a spreadsheet row is the
 * risk E4 §5 names; and calibre is never shown at all, as stars, a grade or a number. The
 * asking fee is what a calibre buys, and the fee is what the player is shown.
 *
 * Nothing here works out a rule: `applicantCards` asks the engine whether each offer can
 * be taken and why not, and the reducer asks the engine to take it (E8-S2).
 */
export function Applicants({
  career,
  onAccept,
  onDecline,
  onClose,
  disabled,
}: {
  career: Career;
  onAccept: (applicantId: string) => void;
  onDecline: (applicantId: string) => void;
  onClose: () => void;
  disabled: boolean;
}) {
  const cards = applicantCards(career);
  return (
    <Sheet title="Applicants" onClose={onClose}>
      <p className="card__line" data-testid="applicants-coin">
        The Guild holds <b>{coin(career.guild.coin)}</b> and has{' '}
        <b>
          {career.guild.roster.length} of {career.config.rosterCap}
        </b>{' '}
        places on the Roster taken.
      </p>
      {cards.length === 0 ? (
        <p className="empty" data-testid="applicants-empty">
          Nobody is waiting. Advance a stretch of Days and see who comes.
        </p>
      ) : (
        <ul className="cards">
          {cards.map((card) => (
            <li className="card" key={card.applicant.id} data-testid="applicant">
              <h3 className="card__title">{card.applicant.name}</h3>
              {card.returning ? (
                <p className="card__flag" data-testid="applicant-returning">
                  {/* `narrate`'s sentence, word for word with the terminal's (DL-27 §2). */}
                  {returnerSentence}
                </p>
              ) : null}
              <p className="card__line" data-testid="applicant-background">
                <b>{card.applicant.background}</b>
                {card.summary === '' ? '' : ` — ${card.summary}`}
              </p>
              <TraitChips
                traits={card.applicant.traits}
                label={`Traits of ${card.applicant.name}`}
                career={career}
              />
              <Stats stats={card.applicant.stats} />
              <p className="card__line" data-testid="applicant-terms">
                Age <b>{card.applicant.age}</b> · asks <b>{coin(card.applicant.askingFee)}</b> ·
                waiting <b>{count(card.daysLeft, 'more Day', 'more Days')}</b>
              </p>
              {/* Both halves of the price before the tap, exactly as the terminal's
                  confirming keypress states them: the fee once, and what their place adds
                  to every Upkeep from now on (DL-25 §3, DL-27 §5). */}
              <p className="card__line" data-testid="applicant-price">
                {card.price}
              </p>
              {card.why === undefined ? null : (
                <p className="card__line" data-testid="applicant-why">
                  {card.why}
                </p>
              )}
              <div className="sheet__actions">
                <button
                  type="button"
                  className={card.canAccept ? 'button--primary' : undefined}
                  data-testid={`accept-${card.applicant.id}`}
                  data-state={card.canAccept ? 'ready' : 'refused'}
                  disabled={disabled || !card.canAccept}
                  onClick={() => {
                    onAccept(card.applicant.id);
                  }}
                >
                  Take {card.applicant.name} on for {coin(card.applicant.askingFee)}
                </button>
                <button
                  type="button"
                  data-testid={`decline-${card.applicant.id}`}
                  disabled={disabled}
                  onClick={() => {
                    onDecline(card.applicant.id);
                  }}
                >
                  Send them away
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Sheet>
  );
}
