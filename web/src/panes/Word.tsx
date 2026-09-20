import { useState } from 'react';
import type { Career } from '@heroesim/engine';
import { wordCards } from '../state/selectors';
import { coin, formatDay } from '../words';

/**
 * A Party that has stopped part-way through its Commission and sent word (E6-S4, E8-S3).
 * It takes over the Report pane while it stands, because it is the one thing in the client
 * that cannot be left for later.
 *
 * Nothing here works out a rule. `wordCards` asks the engine what each option costs, which
 * of them the Guild can take as things stand, what calling the Party home would pay, and
 * how long is left before the Party decides for itself, and asks `narrate` for the words;
 * the reducer asks the engine to take one (E8-S2). An option the Guild cannot pay for is
 * shown **with its cost and the reason in text**, disabled rather than hidden, and the
 * default is marked in words rather than by colour.
 *
 * **Leaving it to them.** The engine has always let the Days run past a waiting Party —
 * that is what keeps a Career from deadlocking (DL-23 §3) — and until DL-24 §A1 the browser
 * had no way to do it at all, so a player who genuinely wanted the default still had to
 * click it. The control below is the parity: deliberately secondary, and behind the two
 * taps E2's insistence has used since it was built, because it passes Days the player
 * cannot get back. The main Advance stays guarded.
 */
export function Word({
  career,
  onAnswer,
  onLetTheDaysRun,
  disabled,
}: {
  career: Career;
  onAnswer: (partyId: string, optionId: string) => void;
  onLetTheDaysRun: () => void;
  disabled: boolean;
}) {
  const cards = wordCards(career);
  // Which set of Parties the second tap was armed for. Any change to who is waiting puts
  // it back behind two taps, exactly as changing a Party disarms the Commit screen.
  const [armedFor, setArmedFor] = useState<string | null>(null);
  if (cards.length === 0) return null;
  const key = cards.map((card) => card.partyId).join('|');
  const armed = armedFor === key;

  return (
    <section className="pane pane--word" aria-label="Waiting on your word" data-testid="pane-word">
      <h2 className="pane__title">Waiting on your word</h2>
      <div className="word">
        {cards.map((card) => (
          <article className="card card--word" key={card.partyId} data-testid={`word-${card.partyId}`}>
            <h3 className="card__name" data-testid="word-title">
              {card.names.join(', ')}, on {card.title}
            </h3>
            <p className="card__line" data-testid="word-prompt">
              {card.prompt}
            </p>
            <p className="card__line card__line--quiet" data-testid="word-clock">
              They have waited <b>{card.daysWaited}</b>{' '}
              {card.daysWaited === 1 ? 'Day' : 'Days'} and act on their own judgement in{' '}
              <b>{card.daysLeft}</b> {card.daysLeft === 1 ? 'Day' : 'Days'}. The Guild holds{' '}
              <b>{coin(career.guild.coin)}</b>.
            </p>
            <ul className="word__options">
              {card.options.map((option) => (
                <li key={option.id} className="word__option">
                  <button
                    type="button"
                    className={option.isDefault ? 'button--primary' : undefined}
                    data-testid={`answer-${card.partyId}-${option.id}`}
                    disabled={disabled || !option.affordable}
                    onClick={() => {
                      onAnswer(card.partyId, option.id);
                    }}
                  >
                    {option.label}
                    {option.cost === undefined ? '' : ` — ${coin(option.cost)}`}
                  </button>
                  {option.outcome === undefined ? null : (
                    <p
                      className="card__line card__line--quiet"
                      data-testid={`outcome-${option.id}`}
                    >
                      {option.outcome}
                    </p>
                  )}
                  {option.isDefault ? (
                    <p className="card__line card__line--quiet" data-testid={`default-${option.id}`}>
                      With no word from you, this is what they will do.
                    </p>
                  ) : null}
                  {option.why === undefined ? null : (
                    <p className="card__line card__line--warning" data-testid={`cannot-${option.id}`}>
                      {option.why}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </article>
        ))}
      </div>

      <div className="word__leave">
        <button
          type="button"
          data-testid="leave-it"
          disabled={disabled}
          onClick={() => {
            if (armed) {
              setArmedFor(null);
              onLetTheDaysRun();
              return;
            }
            setArmedFor(key);
          }}
        >
          {armed
            ? 'Yes — let the Days run'
            : 'Leave it to their judgement and let the Days run'}
        </button>
        {armed ? (
          <div data-testid="leave-it-explained">
            <p className="card__line card__line--quiet">
              The Days will run. Everything else carries on, and{' '}
              {cards.length === 1 ? 'this Party stands' : 'these Parties stand'} still until{' '}
              {cards.length === 1 ? 'it decides' : 'they decide'} for{' '}
              {cards.length === 1 ? 'itself' : 'themselves'}.
            </p>
            <ul className="word__leave-list">
              {cards.map((card) => (
                <li key={card.partyId} className="card__line card__line--quiet">
                  {/* One name is one person, and reads as one: a Party of two stands
                      still, a Hero on their own stands still (E6-S4's plain voice). */}
                  {card.names.join(', ')} {card.names.length === 1 ? 'stands' : 'stand'} still
                  until{' '}
                  <b>{formatDay(card.decidesOn, career)}</b> — in <b>{card.daysLeft}</b>{' '}
                  {card.daysLeft === 1 ? 'Day' : 'Days'} — and then{' '}
                  {card.names.length === 1 ? 'takes' : 'take'} it on themselves:{' '}
                  {card.options.find((option) => option.id === card.defaultOptionId)?.label ??
                    'Answer them'}
                </li>
              ))}
            </ul>
            <p className="card__line card__line--quiet">Tap again to let the Days run.</p>
          </div>
        ) : null}
      </div>
    </section>
  );
}
