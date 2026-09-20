import { useState } from 'react';
import type { Career, Commission } from '@heroesim/engine';
import {
  availableHeroes,
  commissionTitle,
  injuredUntil,
  injuriesOf,
  partyOf,
  partyPreview,
  signedRegard,
  traitSummary,
} from '../state/selectors';
import { Sheet } from '../ui/Sheet';
import { coin, count, formatDay } from '../words';

/**
 * Who to send. The Heroes not already away are toggles; the Commit button sends them.
 * The Guildmaster is deliberately absent — they never join a Party (ADR-0007).
 *
 * Refusals are shown live as Heroes are toggled, because the player has to know who will
 * not go, and why, before paying anything for it (E2). Committing over a refusal takes a
 * second, deliberate tap with the price on the button.
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
  onCommit: (heroIds: string[], insist: boolean) => void;
  onClose: () => void;
  disabled: boolean;
}) {
  const [chosen, setChosen] = useState<string[]>([]);
  const [armed, setArmed] = useState(false);
  const available = availableHeroes(career);
  // One question to the engine, one answer: who refuses, and who cannot go at all (E3-S2).
  const { refusals, unavailable } = partyPreview(career, commission.id, chosen);
  const cost = Math.abs(career.config.insistenceRegardCost);

  /** Why a name is on the list but cannot be tapped, in words (E3-S2). */
  function whyNot(heroId: string, reason: 'away' | 'injured'): string {
    const hero = career.guild.roster.find((candidate) => candidate.id === heroId);
    if (hero === undefined) return 'cannot go';
    if (reason === 'away') {
      const party = partyOf(career, hero);
      return party === undefined
        ? 'away on a Commission'
        : `away on ${commissionTitle(career, party.commissionId)} until ${formatDay(
            party.returnsOn,
            career,
          )}`;
    }
    const named = injuriesOf(hero)
      .map((trait) => trait.name)
      .join(', ');
    // The Day they are fit again is the engine's answer; it says `injured` only of a Hero
    // carrying one, so there is always a Day here.
    const lifts = injuredUntil(hero);
    return lifts === undefined
      ? `injured (${named})`
      : `injured (${named}) until ${formatDay(lifts, career)}`;
  }

  function toggle(id: string): void {
    // Any change to the Party puts the insistence back behind two taps.
    setArmed(false);
    setChosen((held) => (held.includes(id) ? held.filter((kept) => kept !== id) : [...held, id]));
  }

  function label(): string {
    if (refusals.length === 0) {
      return `Commit ${chosen.length === 0 ? 'a Party' : `${String(chosen.length)} to the work`}`;
    }
    if (!armed) return 'Insist and send';
    return `Insist — ${String(cost)} Regard from ${
      refusals.length === 1 ? 'them' : `each of ${String(refusals.length)}`
    }`;
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
          data-armed={refusals.length > 0 && armed ? 'yes' : 'no'}
          disabled={disabled || chosen.length === 0}
          onClick={() => {
            if (refusals.length > 0 && !armed) {
              setArmed(true);
              return;
            }
            onCommit(chosen, refusals.length > 0);
          }}
        >
          {label()}
        </button>
      }
    >
      <p className="card__line">
        Fee <b>{coin(commission.fee)}</b> · <b>{count(commission.spanDays, 'Day', 'Days')}</b> away
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

      {unavailable.length === 0 ? null : (
        <section
          className="refusals"
          aria-label="Who cannot go at all"
          data-testid="unavailable"
        >
          <h3 className="pane__title">Who cannot go at all</h3>
          <ul className="cards">
            {unavailable.map((entry) => {
              const hero = career.guild.roster.find((candidate) => candidate.id === entry.heroId);
              return (
                <li
                  className="card"
                  key={entry.heroId}
                  data-testid="unavailable-hero"
                  data-reason={entry.reason}
                >
                  <h4 className="card__title">{hero?.name ?? 'Somebody'}</h4>
                  <p className="card__line">
                    Not {entry.reason === 'away' ? 'here' : 'fit'}: {whyNot(entry.heroId, entry.reason)}
                    .
                  </p>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {refusals.length === 0 ? null : (
        <section className="refusals" aria-label="Who will not go" data-testid="refusals">
          <h3 className="pane__title">Who will not go</h3>
          <ul className="cards">
            {refusals.map((refusal) => {
              const hero = career.guild.roster.find((candidate) => candidate.id === refusal.heroId);
              const summary = refusal.trait === undefined ? undefined : traitSummary(refusal.trait);
              return (
                <li className="card" key={refusal.heroId} data-testid="refusal">
                  <h4 className="card__title">{hero?.name ?? 'Somebody'}</h4>
                  <p className="card__line">
                    {refusal.reason === 'regard' || refusal.trait === undefined ? (
                      <>
                        Regard for you stands at <b>{signedRegard(refusal.regardValue)}</b>.
                      </>
                    ) : (
                      <>
                        <b>{refusal.trait}</b>
                        {summary === undefined ? '' : ` — ${summary}`}
                      </>
                    )}
                  </p>
                </li>
              );
            })}
          </ul>
          <p className="card__line" data-testid="insist-cost">
            Insisting costs each of them <b>{cost} Regard</b>, and at{' '}
            <b>{signedRegard(career.config.departureRegardThreshold)}</b> a Hero may walk out.
            {armed ? ' Tap again to send them anyway.' : ''}
          </p>
        </section>
      )}
    </Sheet>
  );
}
