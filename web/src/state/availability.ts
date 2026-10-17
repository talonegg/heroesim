// Whether a Hero can go and where they are (v1.1.6-S14, DL-186 item 2): one reading of a Hero and
// their Party for the Roster, a Hero's page and the Party builder, which each read it apart until
// now (`freeFrom`, `whereabouts`, `unavailableUntil`). Not the engine's: the reason is the engine's
// `unavailability`, what `dispatch` refuses by, and the rest is how the page says it.

import { unavailability, type Hero, type Unavailability, type World } from '@heroesim/engine';
import { atHallWords, capitalised, dateOfTurn, nightOfTurn, rowOf, unavailableChipWords, type Calendar } from '@heroesim/words';

export interface Availability {
  /** The engine's `unavailability`: why the Hero cannot go now, or `null` when they can. */
  why: Unavailability | null;
  /**
   * When the Hero is free to go, for the Party builder's order and the Roster's (DL-169 item 4):
   * `-Infinity` for one who can go now; the Turn the Injury heals, the Party returns or the last Offer
   * for them ends at the latest (Under Offer, DL-319); `null` for
   * one with no Day to read (the dead, the retired, and one whose Party the world no longer holds),
   * who sorts last.
   */
  freeOnTurn: number | null;
  /**
   * Where the Hero is, in words that stand on their own: `At the Hall`, `Injured, healing on the night
   * of Year 1 Day 7`, `Died on Year 3 Day 12`, each date by the game's calendar (DL-210).
   */
  where: string;
  /** Why they cannot go and until when, the same words; `null` when they can. */
  until: string | null;
  /** The Board's chip, short (DL-169 item 2): `Away` or `Injured`; `null` when they can go. */
  chip: string | null;
}

/**
 * `hero`'s availability in `world`, its dates by the game's `calendar` (DL-210). The Party is looked
 * up once, and a Party the world no longer holds reads one way everywhere: away all the same, with no
 * Day to be free (v1.1.5-S10). The engine reads an Injury before a Party; no world holds both (the
 * test of `availability.test.ts`).
 */
export function availabilityOf(hero: Hero, world: World, calendar: Calendar): Availability {
  const why = unavailability(hero, world);
  // An Offer for them stands until its night at the latest (DL-319); the latest of them, if several.
  const offerEnds = Object.values(world.offers).flatMap((offer) => (offer.heroId === hero.id ? [offer.expiresOnTurn] : []));
  const party = hero.partyId === null ? undefined : rowOf(world.parties, hero.partyId);
  const wording = (): string | null => {
    switch (why) {
      case null:
        return null;
      case 'dead':
        return `Died on ${dateOfTurn(hero.diedOnTurn ?? 0, calendar)}`;
      case 'retired':
        return `Retired on ${dateOfTurn(hero.retiredOnTurn ?? 0, calendar)}`;
      case 'injured':
        return `Injured, healing on ${nightOfTurn(hero.injury?.healsOnTurn ?? 0, calendar)}`;
      case 'in-party':
        return party === undefined ? 'Away with a Party' : `Away with a Party, back on ${nightOfTurn(party.returnsOnTurn, calendar)}`;
      case 'under-offer':
        return `Under Offer, until ${nightOfTurn(Math.max(...offerEnds), calendar)} at the latest`;
    }
  };
  const until = wording();
  const freeOn: Record<Unavailability, number | null> = {
    dead: null,
    retired: null,
    injured: hero.injury?.healsOnTurn ?? null,
    'in-party': party?.returnsOnTurn ?? null,
    'under-offer': offerEnds.length === 0 ? null : Math.max(...offerEnds),
  };
  return {
    why,
    freeOnTurn: why === null ? -Infinity : freeOn[why],
    // A Hero on no Roster is at no Hall; one who is dead or retired says so first.
    where: why === 'dead' || why === 'retired' || hero.guildId !== null ? (until ?? capitalised(atHallWords)) : hero.unattachedSince === null ? 'On no Roster' : 'In the Unattached pool',
    until,
    chip: why === null ? null : capitalised(unavailableChipWords[why]),
  };
}
