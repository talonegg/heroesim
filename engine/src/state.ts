/**
 * The small operations that move world state and report what they did. Everything here
 * works on a Career *draft* — a private copy a public engine function already made — so
 * mutation here never reaches a caller's Career.
 */

import type { TraitDefIndex } from './check.js';
import { clamp, type GameConfig } from './config.js';
import type { GameEvent, CoinReason } from './events.js';
import { EngineError } from './errors.js';
import { HALL_INFIRMARY } from './types.js';
import type { Career, Hero, HeroTrait, Patron, Reckoning, Regard, Rival, TraitKind } from './types.js';

/** The Day a Career ends in Retirement. */
export function retirementDay(config: GameConfig): number {
  return config.careerYears * config.daysPerYear + 1;
}

/** The next Day on which the Board refreshes, strictly after `day`. */
export function nextRefreshDay(day: number, config: GameConfig): number {
  const every = config.boardRefreshEveryDays;
  return (Math.floor(day / every) + 1) * every;
}

/**
 * The Year a Day falls in, counting from one (DL-18). `narrate`'s `formatDay` and the
 * reckoning's `years` both read this, so there is one definition of a Year rather than
 * two copies of the same arithmetic.
 */
export function yearOf(day: number, config: GameConfig): number {
  return Math.floor((day - 1) / config.daysPerYear) + 1;
}

/** The Day within its Year, counting from one — the "47" of "Year 3, Day 47" (DL-18). */
export function dayOfYear(day: number, config: GameConfig): number {
  return ((day - 1) % config.daysPerYear) + 1;
}

/** The Guild's Standing: mean Patron Regard, scaled. Derived, never stored. */
export function standingOf(career: Career): number {
  if (career.patrons.length === 0) return 0;
  const total = career.patrons.reduce((sum, patron) => sum + patron.regardForGuild.value, 0);
  return Math.round((total / career.patrons.length) * career.config.standingScale);
}

/** A Hero on the Roster, by id. */
export function findHero(career: Career, id: string): Hero | undefined {
  return career.guild.roster.find((hero) => hero.id === id);
}

/**
 * Whether one held Trait is an Injury: timed, and of the Injury kind.
 *
 * Until E6 a Trait carrying `liftsOn` simply *was* an Injury, because nothing gave a
 * timed Trait that was not one (DL-16 §5, DL-21 §5). A Decision's option can now, so the
 * kind is copied onto the Trait when it is given and read back here. A timed Trait that
 * carries no kind at all is an Injury, because that is what every document written before
 * E6 means: E5 gave nobody a timed Trait that was not an Injury (DL-21 §5), so the
 * fallback is a fact about those documents rather than a guess about them. Nothing fills
 * it at load: a fill would rewrite the Traits of a Career that had done nothing, and
 * `advance(career, 0)` must stand still (DL-23 §10).
 */
export function isInjuryTrait(trait: HeroTrait): boolean {
  return trait.liftsOn !== undefined && (trait.kind === undefined || trait.kind === 'injury');
}

/**
 * Whether this Hero is still injured — the test `availableHeroes`, `injuredHeroes` and
 * `unavailableAmong` are built on, and the one `commitParty` refuses on. It takes a Hero
 * and no content, which is why the kind travels on the Trait (DL-23 §10).
 */
export function isInjured(hero: Hero): boolean {
  return hero.traits.some(isInjuryTrait);
}

/** The Day the Hero's last Injury lifts, or `undefined` if they carry none. */
export function injuredUntil(hero: Hero): number | undefined {
  let latest: number | undefined;
  for (const trait of hero.traits) {
    if (!isInjuryTrait(trait) || trait.liftsOn === undefined) continue;
    if (latest === undefined || trait.liftsOn > latest) latest = trait.liftsOn;
  }
  return latest;
}

/** A Patron, by id. */
export function findPatron(career: Career, id: string): Patron | undefined {
  return career.patrons.find((patron) => patron.id === id);
}

/** A Hero the engine believes must exist. */
export function requireHero(career: Career, id: string): Hero {
  const hero = findHero(career, id);
  if (hero === undefined) throw new EngineError('InternalError', `no Hero with id "${id}" is on the Roster`);
  return hero;
}

/** A Patron the engine believes must exist. */
export function requirePatron(career: Career, id: string): Patron {
  const patron = findPatron(career, id);
  if (patron === undefined) throw new EngineError('InternalError', `no Patron with id "${id}" exists`);
  return patron;
}

/** Move the Guild's coin and report it. Tracks the peak for the reckoning. */
export function changeCoin(
  draft: Career,
  delta: number,
  reason: CoinReason,
  events: GameEvent[],
): void {
  draft.guild.coin += delta;
  if (draft.guild.coin > draft.ledger.peakCoin) draft.ledger.peakCoin = draft.guild.coin;
  events.push({
    type: 'CoinChanged',
    day: draft.day,
    delta,
    balance: draft.guild.coin,
    reason,
  });
}

function moveRegard(regard: Regard, delta: number, reason: string, config: GameConfig): number {
  const before = regard.value;
  regard.value = clamp(before + delta, config.regardMin, config.regardMax);
  regard.reason = reason;
  return regard.value - before;
}

/** Move a Patron's Regard for the Guild and report it. The reported delta is the one that landed. */
export function changePatronRegard(
  draft: Career,
  patron: Patron,
  delta: number,
  reason: string,
  events: GameEvent[],
): void {
  const moved = moveRegard(patron.regardForGuild, delta, reason, draft.config);
  events.push({
    type: 'PatronRegardChanged',
    day: draft.day,
    patronId: patron.id,
    delta: moved,
    value: patron.regardForGuild.value,
    reason,
  });
}

/**
 * Move a Rival's Regard for the Guild (E5). Unlike the other two this reports nothing of
 * its own: a Poaching tells it on `HeroPoached`, which carries the delta and the value,
 * and a Vignette's `rivalRegard` Consequence tells it on `RivalRegardChanged`. One fact,
 * told once, by whichever event the player is actually reading.
 *
 * @returns the delta that actually landed, after clamping.
 */
export function changeRivalRegard(
  draft: Career,
  rival: Rival,
  delta: number,
  reason: string,
): number {
  return moveRegard(rival.regardForGuild, delta, reason, draft.config);
}

/** Move a Hero's Regard for the Guildmaster and report it. */
export function changeHeroRegardForGuildmaster(
  draft: Career,
  hero: Hero,
  delta: number,
  reason: string,
  events: GameEvent[],
): void {
  const moved = moveRegard(hero.regardForGuildmaster, delta, reason, draft.config);
  events.push({
    type: 'HeroRegardForGuildmasterChanged',
    day: draft.day,
    heroId: hero.id,
    delta: moved,
    value: hero.regardForGuildmaster.value,
    reason,
  });
}

/**
 * How long an Injury of this many Days actually runs for in this Guild. The infirmary
 * shortens every Injury given after it is bought and none already borne (E3-S4), and it
 * is applied here so that authored harm and engine harm are shortened by the same rule.
 */
export function injurySpan(draft: Career, days: number): number {
  if (!draft.guild.hall.includes(HALL_INFIRMARY)) return days;
  return Math.ceil(days * draft.config.infirmaryInjuryFactor);
}

/**
 * Give a Hero a Trait. `days` makes it a timed Trait that lifts. A Trait they already hold
 * is not duplicated: the later span wins, so a fresh Injury on top of an old one heals
 * from today.
 *
 * @param kind what the TraitDef says this is, where the caller has the content in hand. It
 * travels on the held Trait so that a timed Trait which is **not** an Injury does not make
 * its holder unavailable for work (E6; DL-16 §5's gap, DL-23 §10).
 * @returns the Day it lifts, or `undefined` for a permanent Trait — so a caller reporting
 * an Injury reports the span the infirmary actually left it with.
 */
export function giveTrait(
  draft: Career,
  hero: Hero,
  trait: string,
  days: number | undefined,
  events: GameEvent[],
  kind?: TraitKind,
): number | undefined {
  const liftsOn = days === undefined ? undefined : draft.day + injurySpan(draft, days);
  const held = hero.traits.find((existing) => existing.name === trait);
  if (held === undefined) {
    const fresh: HeroTrait = { name: trait, since: draft.day };
    if (liftsOn !== undefined) fresh.liftsOn = liftsOn;
    if (kind !== undefined) fresh.kind = kind;
    hero.traits.push(fresh);
  } else {
    if (liftsOn !== undefined && (held.liftsOn === undefined || held.liftsOn < liftsOn)) {
      held.liftsOn = liftsOn;
    }
    if (held.kind === undefined && kind !== undefined) held.kind = kind;
  }
  events.push(
    liftsOn === undefined
      ? { type: 'TraitGained', day: draft.day, heroId: hero.id, trait }
      : { type: 'TraitGained', day: draft.day, heroId: hero.id, trait, liftsOn },
  );
  return liftsOn;
}

/**
 * Lift every timed Trait whose span is up. Runs at the start of each Day, so an Injury
 * taken on Day 40 with a span of 20 is gone on Day 60 and the Hero is available again.
 *
 * An Injury lifts as `InjuryLifted` and anything else timed as `TraitLifted`, so that
 * narration never has to de-duplicate a pair (E3 §4). The two are told apart by the kind
 * the Trait itself carries, and — for a Trait given before E6 put one there — by the
 * TraitDef's own (E6; architecture §3, DL-23 §10).
 */
export function liftDueTraits(draft: Career, traits: TraitDefIndex, events: GameEvent[]): void {
  for (const hero of draft.guild.roster) {
    if (!hero.traits.some((held) => held.liftsOn !== undefined && held.liftsOn <= draft.day)) continue;
    const kept = hero.traits.filter((held) => held.liftsOn === undefined || held.liftsOn > draft.day);
    for (const lifted of hero.traits) {
      if (lifted.liftsOn === undefined || lifted.liftsOn > draft.day) continue;
      events.push(
        (lifted.kind ?? traits.get(lifted.name)?.kind) === 'injury'
          ? {
              type: 'InjuryLifted',
              day: draft.day,
              heroId: hero.id,
              trait: lifted.name,
              injuredOn: lifted.since,
              daysBorne: draft.day - lifted.since,
            }
          : { type: 'TraitLifted', day: draft.day, heroId: hero.id, trait: lifted.name },
      );
    }
    hero.traits = kept;
  }
}

/** What the Guild became, assembled from the ledger at the end. */
export function buildReckoning(career: Career): Reckoning {
  const { ledger, config } = career;
  let favourite: { id: string; name: string; count: number } | undefined;
  for (const patron of career.patrons) {
    const count = ledger.commissionsByPatron[patron.id] ?? 0;
    if (count > 0 && (favourite === undefined || count > favourite.count)) {
      favourite = { id: patron.id, name: patron.name, count };
    }
  }
  // Death and Departure are losses; Retirement is not one, and is reported apart from
  // them so that a Guild whose people finished well does not read as a Guild that lost
  // them (E3-S3).
  const retired = career.guild.formerHeroes.filter((hero) => hero.exit?.kind === 'retirement');
  const reckoning: Reckoning = {
    years: yearOf(career.day, config) - 1,
    heroesOnRoster: career.guild.roster.length,
    heroesLost: career.guild.formerHeroes.length - retired.length,
    heroesRetired: retired.length,
    heroesRecruited: ledger.applicantsAccepted,
    // Reported apart from the losses above: somebody a Rival took is not dead and has not
    // walked out on you, they are working down the road (E5-S4).
    heroesPoachedFromUs: ledger.heroesPoachedFromUs,
    commissionsCompleted: ledger.commissionsCompleted,
    commissionsFailed: ledger.commissionsFailed,
    peakCoin: ledger.peakCoin,
    finalCoin: career.guild.coin,
    standing: standingOf(career),
    guildmasterStats: {
      start: { ...career.guild.guildmaster.startingStats },
      end: { ...career.guild.guildmaster.stats },
    },
  };
  if (favourite !== undefined) reckoning.favouritePatron = favourite;
  return reckoning;
}

/** End the Career, well or badly, and report the reckoning. */
export function endCareer(
  draft: Career,
  reason: 'retirement' | 'insolvency',
  events: GameEvent[],
): void {
  const reckoning = buildReckoning(draft);
  draft.ended = { reason, onDay: draft.day, reckoning };
  events.push({ type: 'CareerEnded', day: draft.day, reason, reckoning });
}
