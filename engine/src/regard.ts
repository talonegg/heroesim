/**
 * What Regard for the Guildmaster does when nobody is looking (E2): it drifts down for a
 * Hero who is never sent out, and at the bottom of it a Hero walks out of the Guild.
 *
 * Both are evaluated at the Board refresh, drift first, so that a Hero the drift pushes
 * under the Departure threshold is checked against the value it has just reached. A Hero
 * away on a Commission is untouched by either; the Departure check they were owed is
 * taken on the Day they come home.
 *
 * Every movement here goes through `HeroRegardForGuildmasterChanged`, with a reason that
 * tells the three apart. Departure is not a Regard movement and has its own event.
 */

import { traitModifiers, type TraitDefIndex } from './check.js';
import type { Content } from './content.js';
import type { GameEvent } from './events.js';
import type { Rng } from './rng.js';
import { changeHeroRegardForGuildmaster } from './state.js';
import { HALL_QUARTERS } from './types.js';
import type { Career, Hero } from './types.js';

/** The reason a Hero's Regard moves because they have been left in the hall. */
export const REASON_DRIFTED = 'you have not sent them out in a long while';
/** The reason a Hero's Regard moves when they were sent against their wishes. */
export const REASON_INSISTED = 'you sent them anyway';
/** The reason a Hero's Regard moves when the Guildmaster kept them from walking out. */
export const REASON_TALKED_ROUND = 'you talked them round';

export { HALL_QUARTERS };

/** How much longer drift takes in this Guild. One, until the Hall has quarters. */
export function quartersFactor(career: Career): number {
  return career.guild.hall.includes(HALL_QUARTERS) ? career.config.regardDecayQuartersFactor : 1;
}

/** The Heroes currently out on work. Neither drift nor Departure reaches them. */
function heroesAway(career: Career): ReadonlySet<string> {
  return new Set(career.parties.flatMap((party) => party.heroIds));
}

/**
 * A Hero nobody sends out thinks less of the Guildmaster for it. The clock runs from the
 * later of the last commit and the last time drift told, so sending someone out resets it
 * and drift never fires twice for the same neglected stretch.
 */
export function decayRegard(draft: Career, events: GameEvent[]): void {
  const every = draft.config.regardDecayEveryDays * quartersFactor(draft);
  if (every <= 0 || draft.config.regardDecayAmount === 0) return;
  const away = heroesAway(draft);
  for (const hero of draft.guild.roster) {
    if (away.has(hero.id)) continue;
    const since = Math.max(hero.lastCommittedOn, hero.regardDecayedOn);
    if (draft.day - since < every) continue;
    hero.regardDecayedOn = draft.day;
    changeHeroRegardForGuildmaster(
      draft,
      hero,
      -Math.abs(draft.config.regardDecayAmount),
      REASON_DRIFTED,
      events,
    );
  }
}

/** Move one Hero off the Roster and into the Guild's history, with the reason intact. */
function depart(draft: Career, hero: Hero, events: GameEvent[]): void {
  draft.guild.roster = draft.guild.roster.filter((candidate) => candidate.id !== hero.id);
  hero.exit = {
    kind: 'departure',
    onDay: draft.day,
    reason: hero.regardForGuildmaster.reason,
  };
  draft.guild.formerHeroes.push(hero);
  draft.ledger.departures += 1;
  events.push({
    type: 'HeroDeparted',
    day: draft.day,
    heroId: hero.id,
    regardValue: hero.regardForGuildmaster.value,
    reason: 'regard',
  });
}

/**
 * Settle the Heroes whose Regard has slid far enough to matter. This is the Guildmaster's
 * Stats doing their second job (ADR-0007), and it is one Guile Check against
 * `config.departureDc` with two possible costs of failing it:
 *
 * - **At or below `refusalRegardThreshold`** a Hero is refusing every Commission, so they
 *   can no longer be sent anywhere to earn any goodwill back. The Guildmaster tries to
 *   talk them round; failing, they stay and stay sullen.
 * - **At or below `departureRegardThreshold`** failing the same Check loses them.
 *
 * The wider band is what keeps the bottom of the scale from being a trap that swallows
 * every Roster (DL-14): without it, one bad stretch put a Hero beyond reach of anything
 * that could repair the relationship, and the only exit left was the door.
 *
 * @param only when given, the ids of the Heroes to settle rather than the whole Roster —
 * the ones who have just come home on a Day the Board is not refreshing. A Hero is never
 * checked twice on the same Day.
 */
export function settleSlidingRegard(
  draft: Career,
  content: Content,
  rng: Rng,
  traits: TraitDefIndex,
  only: readonly string[] | undefined,
  events: GameEvent[],
): void {
  const away = heroesAway(draft);
  const wanted = only === undefined ? undefined : new Set(only);
  const { guildmaster } = draft.guild;
  for (const hero of [...draft.guild.roster]) {
    if (away.has(hero.id)) continue;
    if (wanted !== undefined && !wanted.has(hero.id)) continue;
    if (hero.regardForGuildmaster.value > draft.config.refusalRegardThreshold) continue;

    const roll = rng.int(draft.config.diceSides) + 1;
    const total =
      roll + guildmaster.stats.Guile + traitModifiers(guildmaster, 'Guile', [], content, traits);
    if (total >= draft.config.departureDc) {
      changeHeroRegardForGuildmaster(
        draft,
        hero,
        draft.config.talkedRoundRegardGain,
        REASON_TALKED_ROUND,
        events,
      );
      continue;
    }
    if (hero.regardForGuildmaster.value <= draft.config.departureRegardThreshold) {
      depart(draft, hero, events);
    }
  }
}
