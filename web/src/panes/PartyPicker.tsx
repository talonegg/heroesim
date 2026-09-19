import { useState } from 'react';
import type { Career, Commission } from '@heroesim/engine';
import { availableHeroes } from '../state/selectors';
import { Sheet } from '../ui/Sheet';

/**
 * Who to send. The Heroes not already away are toggles; the Commit button sends them.
 * The Guildmaster is deliberately absent — they never join a Party (ADR-0007).
 */
export function PartyPicker({
  career,
  commission,
  onCommit,
  onClose,
  disabled,
}: {
  career: Career;
  commission: Commission;
  onCommit: (heroIds: string[]) => void;
  onClose: () => void;
  disabled: boolean;
}) {
  const [chosen, setChosen] = useState<string[]>([]);
  const available = availableHeroes(career);

  function toggle(id: string): void {
    setChosen((held) => (held.includes(id) ? held.filter((kept) => kept !== id) : [...held, id]));
  }

  return (
    <Sheet
      title={`Send a Party to ${commission.title}`}
      onClose={onClose}
      actions={
        <button
          type="button"
          className="button--primary"
          data-testid="commit-party"
          disabled={disabled || chosen.length === 0}
          onClick={() => {
            onCommit(chosen);
          }}
        >
          Commit {chosen.length === 0 ? 'a Party' : `${String(chosen.length)} to the work`}
        </button>
      }
    >
      <p className="card__line">
        Fee <b>{commission.fee} coin</b> · <b>{commission.spanDays}</b> Days away
      </p>
      {available.length === 0 ? (
        <p className="empty">Everybody is already away.</p>
      ) : (
        <ul className="toggles">
          {available.map((hero) => {
            const on = chosen.includes(hero.id);
            return (
              <li key={hero.id}>
                <button
                  type="button"
                  className={on ? 'button--on' : undefined}
                  aria-pressed={on}
                  data-testid="party-toggle"
                  onClick={() => {
                    toggle(hero.id);
                  }}
                >
                  {on ? '✓ ' : ''}
                  {hero.name} · {hero.background}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Sheet>
  );
}
