import type { Career, Hero, UnavailableReason } from '@heroesim/engine';
import {
  commissionTitle,
  injuredUntil,
  injuriesOf,
  lastingTraitsOf,
  partyOf,
  projectedReturn,
  rosterRisks,
  signedRegard,
  unavailableAmong,
} from '../state/selectors';
import { Stats } from '../ui/Stats';
import { TraitChips } from '../ui/TraitChips';
import { formatDay } from '../words';

/**
 * Where a Hero is, in words. Away on work, still hurt, or free to be sent — never colour
 * alone, because a name is greyed out for a reason and the reason is the interesting part
 * (E3-S2).
 *
 * `reason` comes from the engine's own `unavailableAmong` (DL-18): away-versus-injured is
 * its precedence to keep, not this component's to decide.
 */
function whereLine(career: Career, hero: Hero, reason: UnavailableReason | undefined) {
  if (reason === 'away') {
    const away = partyOf(career, hero);
    // A Party standing still on a word is not due back when it was due back: the Beats the
    // waiting strands are re-spread on the Day it is answered, and the return moves with
    // them. `projectedReturn` is the engine's own answer to "when can they be home"; this
    // only chooses the words for it (F11, DL-18).
    const due =
      away === undefined ? career.day : (projectedReturn(career, away.id) ?? away.returnsOn);
    const waiting = away?.pendingWord !== undefined;
    return (
      <p className="away" data-testid="hero-where">
        Away on {commissionTitle(career, away?.commissionId ?? '')}
        {waiting ? ', waiting on your word — back no sooner than ' : ' until '}
        {formatDay(due, career)}
      </p>
    );
  }
  if (reason === 'injured') {
    // The Day they are fit again is the engine's own answer, not a maximum worked out here.
    const lifts = injuredUntil(hero) ?? career.day;
    return (
      <p className="injured" data-testid="hero-where">
        Injured — cannot be sent until {formatDay(lifts, career)}
      </p>
    );
  }
  return (
    <p className="available" data-testid="hero-where">
      Available
    </p>
  );
}

/**
 * The Roster, with the Guildmaster at the top. The Guildmaster is not a member of it
 * (ADR-0007) — they are shown first because their Stats and Traits are what a Party's
 * Backing is computed from.
 *
 * Each Hero carries their age, the Injuries they are carrying with the Day each one
 * lifts, and the Traits they keep for good — a Background, a disposition or a Scar (E3).
 */
export function Roster({ career }: { career: Career }) {
  const { guildmaster, roster } = career.guild;
  // Asked once for the whole Roster, so every row reads the same moment (E8-S2).
  const unavailable = new Map(unavailableAmong(career).map((entry) => [entry.heroId, entry.reason]));
  // Who another Guild could take, and which Guilds are minded to — the engine's own
  // answer, put into a sentence in `state/` and only rendered here (finding C9, DL-22 §2).
  const atRisk = rosterRisks(career);
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
            const injuries = injuriesOf(hero);
            const lasting = lastingTraitsOf(hero);
            return (
              <li className="card" key={hero.id} data-testid="hero">
                <h3 className="card__title">{hero.name}</h3>
                <p className="card__line" data-testid="hero-age">
                  Age <b>{hero.age}</b> · {hero.background}
                </p>
                <Stats stats={hero.stats} />
                <p className="card__line" data-testid="hero-regard">
                  Regard <b>{signedRegard(hero.regardForGuildmaster.value)}</b> ·{' '}
                  {hero.regardForGuildmaster.reason}
                </p>
                {injuries.length === 0 ? null : (
                  <div data-testid="hero-injuries">
                    <p className="card__line">Injuries</p>
                    <TraitChips
                      traits={injuries}
                      label={`Injuries of ${hero.name}`}
                      career={career}
                    />
                  </div>
                )}
                {/* Each Trait with the summary content gives it: what a Trait means is
                    the whole of why it is on the card, and the terminal's Roster has
                    always shown it (E7-S3, E8-S6). */}
                <TraitChips
                  traits={lasting}
                  label={`Traits of ${hero.name}`}
                  career={career}
                  summaries
                />
                {atRisk.get(hero.id) === undefined ? null : (
                  <p className="card__flag" data-testid="hero-at-risk">
                    {atRisk.get(hero.id)}
                  </p>
                )}
                {whereLine(career, hero, unavailable.get(hero.id))}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
