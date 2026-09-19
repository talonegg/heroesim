/**
 * The small operations that move world state and report what they did. Everything here
 * works on a Career *draft* — a private copy a public engine function already made — so
 * mutation here never reaches a caller's Career.
 */

import { clamp, type GameConfig } from './config.js';
import type { GameEvent, CoinReason } from './events.js';
import { EngineError } from './errors.js';
import type { Career, Hero, Patron, Reckoning, Regard } from './types.js';

/** The Day a Career ends in Retirement. */
export function retirementDay(config: GameConfig): number {
  return config.careerYears * config.daysPerYear + 1;
}

/** The next Day on which the Board refreshes, strictly after `day`. */
export function nextRefreshDay(day: number, config: GameConfig): number {
  const every = config.boardRefreshEveryDays;
  return (Math.floor(day / every) + 1) * every;
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
 * Give a Hero a Trait. `days` makes it an Injury that lifts. A Trait they already hold
 * is not duplicated: the later span wins, so a fresh Injury on top of an old one heals
 * from today.
 */
export function giveTrait(
  draft: Career,
  hero: Hero,
  trait: string,
  days: number | undefined,
  events: GameEvent[],
): void {
  const liftsOn = days === undefined ? undefined : draft.day + days;
  const held = hero.traits.find((existing) => existing.name === trait);
  if (held === undefined) {
    hero.traits.push(liftsOn === undefined ? { name: trait, since: draft.day } : { name: trait, since: draft.day, liftsOn });
  } else if (liftsOn !== undefined && (held.liftsOn === undefined || held.liftsOn < liftsOn)) {
    held.liftsOn = liftsOn;
  }
  events.push(
    liftsOn === undefined
      ? { type: 'TraitGained', day: draft.day, heroId: hero.id, trait }
      : { type: 'TraitGained', day: draft.day, heroId: hero.id, trait, liftsOn },
  );
}

/** Lift every Injury whose span is up. Runs at the start of each Day. */
export function liftDueTraits(draft: Career, events: GameEvent[]): void {
  for (const hero of draft.guild.roster) {
    if (!hero.traits.some((held) => held.liftsOn !== undefined && held.liftsOn <= draft.day)) continue;
    const kept = hero.traits.filter((held) => held.liftsOn === undefined || held.liftsOn > draft.day);
    for (const lifted of hero.traits) {
      if (lifted.liftsOn !== undefined && lifted.liftsOn <= draft.day) {
        events.push({ type: 'TraitLifted', day: draft.day, heroId: hero.id, trait: lifted.name });
      }
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
  const reckoning: Reckoning = {
    years: Math.floor((career.day - 1) / config.daysPerYear),
    heroesOnRoster: career.guild.roster.length,
    heroesLost: career.guild.formerHeroes.length,
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
