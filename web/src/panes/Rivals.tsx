import type { Career } from '@heroesim/engine';
import { poachWarning, rivalCards, signedRegard } from '../state/selectors';
import { coin, wrongedRivalSentence } from '../words';
import { Sheet } from '../ui/Sheet';
import { Stats } from '../ui/Stats';
import { TraitChips } from '../ui/TraitChips';

/**
 * The other Guilds (E5-S2, E5-S3): who they are, what they make of your Guild, and
 * everybody in their employ.
 *
 * Each of their Heroes reads the way an Applicant does — Background and Traits first,
 * Stats second — with what they make of the Guild paying them, because that is what
 * decides whether they can be approached at all. Both fees are shown as numbers and every
 * reason a move cannot be made is written out in text beside a disabled control, never
 * left to the greying-out to imply.
 *
 * **A Poaching warns before the tap, not after it.** It costs that Guild's goodwill, and
 * the goodwill is paid for on your Board; the player reads that before their finger
 * moves, not in the report afterwards.
 *
 * Nothing here works out a rule: `rivalCards` asks the engine what each move would cost
 * and why it would be refused, and the reducer asks the engine to make it (E8-S2).
 */
export function Rivals({
  career,
  onTransfer,
  onPoach,
  onClose,
  disabled,
}: {
  career: Career;
  onTransfer: (rivalId: string, heroId: string) => void;
  onPoach: (rivalId: string, heroId: string) => void;
  onClose: () => void;
  disabled: boolean;
}) {
  const cards = rivalCards(career);
  return (
    <Sheet title="The other Guilds" onClose={onClose}>
      <p className="card__line" data-testid="rivals-coin">
        The Guild holds <b>{coin(career.guild.coin)}</b> and has{' '}
        <b>
          {career.guild.roster.length} of {career.config.rosterCap}
        </b>{' '}
        places on the Roster taken.
      </p>
      <p className="card__line" data-testid="poach-warning">
        {poachWarning(career)}
      </p>
      {cards.map((card) => (
        <section className="rival" key={card.rival.id} data-testid="rival">
          <h3 className="card__title" data-testid="rival-name">
            {card.rival.name}
          </h3>
          <p className="card__line" data-testid="rival-standing">
            Standing <b>{card.rival.standing}</b> · <b>{card.people.length}</b> on their
            Roster · Regard for your Guild <b>{signedRegard(card.regard)}</b>
          </p>
          <p className="card__line" data-testid="rival-reason">
            {card.reason}
          </p>
          {card.soured ? (
            <p className="card__flag" data-testid="rival-soured">
              {/* `narrate`'s sentence, word for word with the terminal's (DL-27 §2). */}
              {wrongedRivalSentence(card.hasRoom)}
            </p>
          ) : null}
          {card.people.length === 0 ? (
            <p className="empty">Nobody is on their Roster just now.</p>
          ) : (
            <ul className="cards">
              {card.people.map((person) => (
                <li className="card" key={person.hero.id} data-testid="rival-hero">
                  <h4 className="card__title">{person.hero.name}</h4>
                  <p className="card__line" data-testid="rival-hero-background">
                    <b>{person.hero.background}</b>
                    {person.summary === '' ? '' : ` — ${person.summary}`}
                  </p>
                  <TraitChips
                    traits={person.hero.traits}
                    label={`Traits of ${person.hero.name}`}
                    career={career}
                  />
                  <Stats stats={person.hero.stats} />
                  <p className="card__line" data-testid="rival-hero-terms">
                    Age <b>{person.hero.age}</b> · what they make of {card.rival.name}:{' '}
                    <b>{signedRegard(person.hero.regardForRival.value)}</b> ·{' '}
                    {person.hero.regardForRival.reason}
                  </p>
                  {person.whyNotTransfer === undefined ? null : (
                    <p className="card__line" data-testid="why-not-transfer">
                      {person.whyNotTransfer}
                    </p>
                  )}
                  {person.whyNotPoach === undefined ? null : (
                    <p className="card__line" data-testid="why-not-poach">
                      {person.whyNotPoach}
                    </p>
                  )}
                  <div className="sheet__actions">
                    <button
                      type="button"
                      className={person.canTransfer ? 'button--primary' : undefined}
                      data-testid={`transfer-${person.hero.id}`}
                      data-state={person.canTransfer ? 'ready' : 'refused'}
                      disabled={disabled || !person.canTransfer}
                      onClick={() => {
                        onTransfer(card.rival.id, person.hero.id);
                      }}
                    >
                      Transfer for {coin(person.transferFee)}
                    </button>
                    <button
                      type="button"
                      data-testid={`poach-${person.hero.id}`}
                      data-state={person.canPoach ? 'ready' : 'refused'}
                      disabled={disabled || !person.canPoach}
                      onClick={() => {
                        onPoach(card.rival.id, person.hero.id);
                      }}
                    >
                      Poach for {coin(person.poachFee)}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </Sheet>
  );
}
