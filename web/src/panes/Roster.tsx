import type { Career } from '@heroesim/engine';
import { commissionTitle, partyOf } from '../state/selectors';
import { Stats } from '../ui/Stats';
import { TraitChips } from '../ui/TraitChips';
import { formatDay } from '../words';

/**
 * The Roster, with the Guildmaster at the top. The Guildmaster is not a member of it
 * (ADR-0007) — they are shown first because their Stats and Traits are what a Party's
 * Backing is computed from.
 */
export function Roster({ career }: { career: Career }) {
  const { guildmaster, roster } = career.guild;
  return (
    <section className="pane pane--roster" aria-label="Roster" data-testid="pane-roster">
      <h2 className="pane__title">Roster</h2>

      <article className="card" data-testid="guildmaster">
        <h3 className="card__title">{guildmaster.name}</h3>
        <p className="card__line">
          Guildmaster · <b>{guildmaster.background}</b>
        </p>
        <Stats stats={guildmaster.stats} />
        <TraitChips traits={guildmaster.traits} label={`Traits of ${guildmaster.name}`} />
      </article>

      {roster.length === 0 ? (
        <p className="empty">Nobody is on the Roster.</p>
      ) : (
        <ul className="cards">
          {roster.map((hero) => {
            const away = partyOf(career, hero);
            return (
              <li className="card" key={hero.id} data-testid="hero">
                <h3 className="card__title">{hero.name}</h3>
                <p className="card__line">{hero.background}</p>
                <Stats stats={hero.stats} />
                <TraitChips traits={hero.traits} label={`Traits of ${hero.name}`} />
                {away === undefined ? (
                  <p className="available">Available</p>
                ) : (
                  <p className="away">
                    Away on {commissionTitle(career, away.commissionId)} until{' '}
                    {formatDay(away.returnsOn, career)}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
