import type { Career } from '@heroesim/engine';
import { formerCards, signedRegard } from '../state/selectors';
import { Sheet } from '../ui/Sheet';
import { Stats } from '../ui/Stats';
import { TraitChips } from '../ui/TraitChips';

/**
 * The Heroes who are no longer on the Roster (E7-S3, E8-S6): who left, how, when, and
 * what was last said about it. A page of its own, never shown on the Roster — a dead or
 * departed Hero leaves the Roster but not the Guild's history (CONTEXT.md).
 *
 * **Somebody another Guild took is not here**, and that is the engine's arrangement rather
 * than an omission: a poached Hero is working down the road, so `moveHero` takes them off
 * `formerHeroes` and puts them on that Guild's Roster, where the other Guilds sheet shows
 * them. The reckoning counts them on its own line, "Taken by another Guild: N Heroes."
 * The terminal's former-Heroes view says exactly the same three kinds (DL-27 §7).
 */
export function Former({ career, onClose }: { career: Career; onClose: () => void }) {
  const gone = formerCards(career);
  return (
    <Sheet title="Former Heroes" onClose={onClose}>
      {gone.length === 0 ? (
        <p className="empty" data-testid="former-empty">
          Nobody has left the Guild yet.
        </p>
      ) : (
        <ul className="cards">
          {gone.map((card) => (
            <li className="card" key={card.hero.id} data-testid="former">
              <h3 className="card__title">{card.hero.name}</h3>
              <p className="card__line" data-testid="former-exit">
                Age <b>{card.hero.age}</b> · {card.how}
                {card.when === undefined ? '' : `, ${card.when}`}
                {card.reason === undefined ? '' : `: ${card.reason}`}
              </p>
              <Stats stats={card.hero.stats} />
              {/* Their Regard stays readable: what they thought of the Guildmaster when
                  they went is the whole of why a Departure happened (E7-S3). */}
              <p className="card__line" data-testid="former-regard">
                Regard <b>{signedRegard(card.hero.regardForGuildmaster.value)}</b> ·{' '}
                {card.hero.regardForGuildmaster.reason}
              </p>
              <TraitChips
                traits={card.hero.traits}
                label={`Traits of ${card.hero.name}`}
                career={career}
              />
            </li>
          ))}
        </ul>
      )}
    </Sheet>
  );
}
