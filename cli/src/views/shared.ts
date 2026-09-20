/**
 * The readings several views make of a Career, in one place so that two screens can never
 * describe one person differently. Every one of them is an engine selector turned into
 * the words a line needs — `unavailableAmong`, `injuredUntil`, `projectedReturn` and
 * `retaliationRisks` decide the facts, and nothing here decides anything (E7 §4, DL-18).
 *
 * Not a view: it renders nothing and is imported by the ones that do.
 */

import {
  injuredUntil,
  projectedReturn,
  retaliationRisks,
  unavailableAmong,
  type Career,
  type Hero,
  type Party,
} from '@heroesim/engine';
import { formatDay } from '@heroesim/narrate';

/** Where a Hero is, in the order a Roster is sorted by: at hand first, hurt last. */
export type Where = 'available' | 'away' | 'injured';

/** Where one Hero is, and how that is said. */
export interface HeroStatus {
  where: Where;
  /** The whole of it in words: "away until Year 2, Day 58". Never abbreviated (DL-25 §7). */
  text: string;
  /** Sort key: available, then away, then injured. */
  order: number;
}

const ORDER: Record<Where, number> = { available: 0, away: 1, injured: 2 };

/** The Party a Hero is out with, if they are out with one. */
export function partyOf(career: Career, heroId: string): Party | undefined {
  return career.parties.find((party) => party.heroIds.includes(heroId));
}

/**
 * Where every Hero on the Roster is, asked once so that every row of a view reads the
 * same moment. `unavailableAmong` settles away-beats-injured; `projectedReturn` settles
 * the Day a waiting Party can be home, which is a Day that will slip (DL-24 §A2a).
 */
export function heroStatuses(career: Career): Map<string, HeroStatus> {
  const out = new Map<string, HeroStatus>();
  const unavailable = new Map(unavailableAmong(career).map((one) => [one.heroId, one.reason]));
  for (const hero of career.guild.roster) {
    const reason = unavailable.get(hero.id);
    if (reason === 'away') {
      const party = partyOf(career, hero.id);
      const due = party === undefined ? undefined : projectedReturn(career, party.id) ?? party.returnsOn;
      const waiting = party?.pendingWord !== undefined;
      const text =
        due === undefined
          ? 'away on work'
          : waiting
            ? `away, back no sooner than ${formatDay(due, career)}, and later the longer they wait`
            : `away until ${formatDay(due, career)}`;
      out.set(hero.id, { where: 'away', text, order: ORDER.away });
      continue;
    }
    if (reason === 'injured') {
      const lifts = injuredUntil(hero);
      out.set(hero.id, {
        where: 'injured',
        text: lifts === undefined ? 'injured' : `injured until ${formatDay(lifts, career)}`,
        order: ORDER.injured,
      });
      continue;
    }
    out.set(hero.id, { where: 'available', text: 'available', order: ORDER.available });
  }
  return out;
}

/** "3/2/4/1" — Might, Craft, Nerve, Guile, in that order and always that order. */
export function statsOf(hero: { stats: { Might: number; Craft: number; Nerve: number; Guile: number } }): string {
  return `${hero.stats.Might}/${hero.stats.Craft}/${hero.stats.Nerve}/${hero.stats.Guile}`;
}

/** The Traits a person holds, by name, or a dash where they hold none. */
export function traitNames(person: { traits: readonly { name: string }[] }): string {
  const names = person.traits.map((trait) => trait.name).join(', ');
  return names.length === 0 ? '-' : names;
}

/**
 * For each Hero another Guild could take, the Guilds minded to try, by name. The engine's
 * own `retaliationRisks` decides who is on the list; this only turns ids into names.
 */
export function atRisk(career: Career): Map<string, string[]> {
  const guildNames = new Map(career.rivals.map((rival) => [rival.id, rival.name]));
  return new Map(
    retaliationRisks(career).map((risk) => [
      risk.heroId,
      // A Guild whose name cannot be found is "another Guild" and never its identifier.
      risk.rivalIds.map((id) => guildNames.get(id) ?? 'another Guild'),
    ]),
  );
}

/**
 * When a Party can be home, hedged where the hedge is the truth. A Party standing still
 * on a word is not due back when it was due back: the Beats the waiting strands are
 * re-spread on the Day it is answered and the return moves with them, so the engine's own
 * `projectedReturn` answers the **earliest** Day it can now be home (DL-24 §A2a). Said in
 * full here and abbreviated nowhere (DL-25 §7).
 */
export function projectedReturnWords(career: Career, party: Party): string {
  const due = projectedReturn(career, party.id) ?? party.returnsOn;
  const left = due - career.day;
  // "in 0 Days" is not a thing anybody says: a Day that has arrived is simply the Day.
  const when =
    left <= 0
      ? formatDay(due, career)
      : `${formatDay(due, career)} (in ${left} ${left === 1 ? 'Day' : 'Days'})`;
  return party.pendingWord === undefined
    ? `back ${when}`
    : `back no sooner than ${when}, and later the longer they wait`;
}

/**
 * The Heroes of a Party, by name, in the order the Party holds them. A Hero who left the
 * Roster while the Party was still out is looked up among the former Heroes, and a name
 * that cannot be found at all is said in words: **no sentence names an identifier**
 * (E7-S5, DL-26 §3).
 */
export function partyNames(career: Career, party: Party): string[] {
  return party.heroIds.map((id) => {
    const here = career.guild.roster.find((hero) => hero.id === id);
    if (here !== undefined) return here.name;
    return career.guild.formerHeroes.find((hero) => hero.id === id)?.name ?? 'somebody';
  });
}

/** A Hero's row, sorted by where they are and then by name (E7-S3). */
export function rosterInOrder(career: Career, statuses: ReadonlyMap<string, HeroStatus>): Hero[] {
  return [...career.guild.roster].sort((left, right) => {
    const byStatus =
      (statuses.get(left.id)?.order ?? 0) - (statuses.get(right.id)?.order ?? 0);
    return byStatus !== 0 ? byStatus : left.name.localeCompare(right.name);
  });
}
