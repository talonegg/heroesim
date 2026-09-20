/**
 * Making a person, and reading how good one is. The pieces here are shared by world
 * generation (E1), by an Applicant at the door (E4) and by the people on a Rival's Roster
 * (E5), so that "four Stats adding up to N" and "what a calibre is worth" have one
 * definition each rather than three.
 *
 * Nothing here draws from a Career: every function takes the generator it is to use, so
 * the caller decides which stream a person is made from.
 */

import { clamp, type GameConfig } from './config.js';
import type { Content } from './content.js';
import { EngineError } from './errors.js';
import type { Rng } from './rng.js';
import { CALIBRES, STATS, type Calibre, type Career, type Pronouns, type Stats } from './types.js';

/** The pronoun sets a generated person may take. */
export const PRONOUNS: readonly Pronouns[] = ['she', 'he', 'they'];

/**
 * Four Stats within the configured range, totalling `total`. Every point above
 * `statMin × 4` is placed one at a time on a Stat that still has room, so the total is
 * exact and no Stat ever falls outside `statMin`..`statMax`.
 */
export function distributeStats(total: number, config: GameConfig, rng: Rng): Stats {
  const stats: Stats = { Might: 0, Craft: 0, Nerve: 0, Guile: 0 };
  for (const stat of STATS) stats[stat] = config.statMin;
  let remaining = total - config.statMin * STATS.length;
  while (remaining > 0) {
    const room = STATS.filter((stat) => stats[stat] < config.statMax);
    if (room.length === 0) break;
    stats[rng.pick(room)] += 1;
    remaining -= 1;
  }
  return stats;
}

/** The four Stats added up: what `calibreOfStats` reads to price somebody. */
export function statTotal(stats: Stats): number {
  return stats.Might + stats.Craft + stats.Nerve + stats.Guile;
}

/** The Stat total a calibre is generated against. */
export function calibreStatBudget(calibre: Calibre, config: GameConfig): number {
  switch (calibre) {
    case 1:
      return config.calibreStatBudget1;
    case 2:
      return config.calibreStatBudget2;
    case 3:
      return config.calibreStatBudget3;
    default: {
      const unreachable: never = calibre;
      throw new EngineError('InternalError', `no Stat budget for calibre ${String(unreachable)}`);
    }
  }
}

/** What an Applicant of this calibre asks for. */
export function applicantFee(calibre: Calibre, config: GameConfig): number {
  return config.applicantFeeBase + config.applicantFeePerCalibre * calibre;
}

/**
 * The calibre a set of Stats already earns: the highest budget the total reaches. Used
 * for somebody coming back, whose Stats are theirs and are not generated again (DL-19 §7),
 * and for anybody who was on a Roster before `calibre` was a field on a person (E5).
 */
export function calibreOfStats(total: number, config: GameConfig): Calibre {
  let earned: Calibre = 1;
  for (const calibre of CALIBRES) {
    if (total >= calibreStatBudget(calibre, config)) earned = calibre;
  }
  return earned;
}

/**
 * The best calibre a Standing reaches. High Standing widens the range the people who
 * come to a Guild are drawn from rather than guaranteeing the top of it (E4-S1). It takes
 * the number rather than a Career because a Rival's Standing is stored and the player's
 * is derived, and the rule is the same for both (E5-S1).
 */
export function maxCalibreFor(standing: number, config: GameConfig): Calibre {
  const steps =
    1 +
    (standing >= config.calibre2Standing ? 1 : 0) +
    (standing >= config.calibre3Standing ? 1 : 0);
  return clamp(steps, 1, CALIBRES.length) as Calibre;
}

/**
 * A calibre in `1..ceiling`, uniformly, taking **exactly one** draw whatever the ceiling
 * is. That matters wherever the stream is a derived one: a `between(1, 1)` draws nothing,
 * so a ceiling that moves would silently reshuffle every draw after it (DL-20's "E5 must
 * know"). One `float()` costs the same at every ceiling.
 */
export function drawCalibre(ceiling: Calibre, rng: Rng): Calibre {
  const drawn = 1 + Math.floor(rng.float() * ceiling);
  return clamp(drawn, 1, ceiling) as Calibre;
}

/** Whether the people waiting at the door count among the names in use. */
export type DoorNames = 'with-the-door' | 'without-the-door';

/**
 * Every name somebody alive in this Career answers to, so that no two people the player
 * could meet at the same moment are told apart only by which Guild they work for
 * (finding F6, DL-22 §1). **One definition**, used by a batch at the door (E4) and by a
 * Rival's own generator (E5) alike, because the two were reading different halves of the
 * world and a name free on one side was not free on the other.
 *
 * It counts the **Guildmaster**, everybody on **your Roster**, everybody on **every
 * Rival's Roster**, and every former Hero who **walked out** — a Departure may knock
 * again, and a returner comes back under their own name, which is the one case where a
 * name must be reused rather than avoided (E4-S4, DL-19 §6). The **dead and the retired**
 * do not count: neither ever comes back, and holding their names for the length of a
 * twenty-year Career would drain the pool for somebody nobody will meet again.
 *
 * **The door is an argument, and that is not an oversight.** Declining an Applicant and
 * ignoring one must give the same Career (E4's definition of done, DL-19 §1), and the two
 * differ in exactly one thing: whether a name is still sitting in `career.applicants`. A
 * batch may read it, because a batch is the one thing the door's own contents can
 * legitimately move. A Rival's generator must not, or a churned-in Hero would take a
 * different name depending on a decision the player made about somebody else entirely,
 * and every Rival Roster in the save would diverge from that Day on.
 */
export function namesInUse(career: Career, door: DoorNames): Set<string> {
  const names = new Set<string>([
    career.guild.guildmaster.name,
    ...career.guild.roster.map((hero) => hero.name),
    ...career.rivals.flatMap((rival) => rival.roster.map((hero) => hero.name)),
    ...career.guild.formerHeroes
      .filter((hero) => hero.exit?.kind === 'departure')
      .map((hero) => hero.name),
  ]);
  if (door === 'with-the-door') {
    for (const applicant of career.applicants) names.add(applicant.name);
  }
  return names;
}

/**
 * A name nobody alive in this Career is already using, so that no two people the player
 * could meet are told apart only by their Guild. An epithet is added on the chance world
 * generation uses, and again where the plain name is taken.
 *
 * **Where the pool cannot supply one**, every first name is tried against every epithet in
 * content order — no further draw is taken for it — and only when all of those are taken
 * too does this hand back a name somebody already answers to. At the shipped seventy first
 * names and thirty-six epithets that is unreachable; with a pool small enough to exhaust,
 * it is what happens, and it is deterministic (DL-22 §1).
 *
 * **Exactly one `pick` is spent on the first name whatever `taken` holds**, so widening
 * the set of names to avoid changes *which* name is drawn and never *how many* draws are
 * taken — everything after it on the same stream stays where it was.
 */
export function freeName(
  content: Content,
  config: GameConfig,
  rng: Rng,
  taken: ReadonlySet<string>,
): string {
  const free = content.names.heroFirst.filter((name) => !taken.has(name));
  const first = rng.pick(free.length > 0 ? free : content.names.heroFirst);
  const epithets = content.names.heroEpithets;
  const named = epithets.length > 0 && rng.chance(config.heroEpithetChance);
  const chosen = named ? `${first} ${rng.pick(epithets)}` : first;
  if (!taken.has(chosen)) return chosen;
  for (const epithet of epithets) {
    const tried = `${first} ${epithet}`;
    if (!taken.has(tried)) return tried;
  }
  for (const candidate of content.names.heroFirst) {
    if (!taken.has(candidate)) return candidate;
    for (const epithet of epithets) {
      const tried = `${candidate} ${epithet}`;
      if (!taken.has(tried)) return tried;
    }
  }
  return chosen;
}
