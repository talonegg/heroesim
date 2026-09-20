/**
 * Rivals (E5): other Guilds, with people and opinions of their own. A Rival is **not** a
 * Guild (ADR-0003) — no Hall, no Board, no coin, no Guildmaster — and it is never
 * simulated: it takes work off the Board and its Roster churns, and it runs no Beats. If
 * a Rival ever needs a decision made for it, the scope has slipped (E5 §5).
 *
 * **Where the randomness comes from.** A Rival's opening Roster is drawn from a stream
 * derived from the Career's seed and that Rival's id, and churn from one derived from the
 * seed and the Day — exactly as `startingAge` and a batch of Applicants are (DL-16 §1,
 * DL-19 §1). Nothing in this file touches `career.rng`, so E5 moved no seeded expectation
 * E1, E2, E3 or E4 had pinned, and the Rosters a save is populated with at load are the
 * ones a Career on that seed would have generated.
 *
 * Retaliation takes no draw at all, from any stream: the Rival is chosen by their Regard
 * for you and the Hero by theirs for the Guildmaster, worst first, which is the whole of
 * the rule (E5-S4).
 */

import { startingAge } from './age.js';
import { clamp, type GameConfig } from './config.js';
import type { Content } from './content.js';
import { EngineError } from './errors.js';
import type { GameEvent } from './events.js';
import {
  distributeStats,
  drawCalibre,
  freeName,
  maxCalibreFor,
  calibreStatBudget,
  namesInUse,
  PRONOUNS,
} from './people.js';
import { rngOn, seedRng, type Rng } from './rng.js';
import { standingOf } from './state.js';
import type {
  AnyHero,
  Career,
  Hero,
  HeroTrait,
  LeagueRow,
  Regard,
  Rival,
  RivalHero,
} from './types.js';

/** Why a Hero and a newcomer hold the Regard for one another that they start with. */
export const REASON_NEW_TO_THE_GUILD = 'new to the Guild';
/** Why a Rival thinks what it thinks of your Guild before anything has passed between you. */
export const REASON_NOTHING_BETWEEN_YOU = 'nothing has passed between you';
/** Why one of a Rival's own Heroes thinks what they think of the Guild that employs them. */
export const REASON_WHO_THEY_WORK_FOR = 'this is who they work for';
/** Why a Hero brought over from a Rival thinks what they think of the Guildmaster. */
export const REASON_BROUGHT_OVER = 'you brought them over from another Guild';
/** Why a Hero a Rival took thinks what they think of their new employer. */
export const REASON_TOOK_ANOTHER_OFFER = 'they took another Guild’s offer';
/** Why a Rival's Regard for your Guild moves when you go behind their back. */
export const REASON_POACHED_FROM_THEM = 'you took somebody off their Roster';

/** The Regard two people who have just met hold for one another. */
export function newcomerRegard(config: GameConfig): Regard {
  return {
    value: clamp(config.joiningRegardAmongHeroes, config.regardMin, config.regardMax),
    reason: REASON_NEW_TO_THE_GUILD,
    nature: 'neutral',
  };
}

// ── Reading the world ───────────────────────────────────────────────────────

/** A Rival by id, or `undefined` if this Career has none of that id. */
export function rivalById(career: Career, id: string): Rival | undefined {
  return career.rivals.find((rival) => rival.id === id);
}

/** A Rival the engine believes must exist. */
export function requireRival(career: Career, id: string): Rival {
  const rival = rivalById(career, id);
  if (rival === undefined) throw new EngineError('InternalError', `no Rival with id "${id}" exists`);
  return rival;
}

/** One of a Rival's Heroes, with the Rival who employs them. */
export function rivalHeroById(
  career: Career,
  heroId: string,
): { rival: Rival; hero: RivalHero } | undefined {
  for (const rival of career.rivals) {
    const hero = rival.roster.find((candidate) => candidate.id === heroId);
    if (hero !== undefined) return { rival, hero };
  }
  return undefined;
}

/**
 * What this person thinks of whoever employs them: the Guildmaster if they are yours, the
 * Rival if they are not (E5-S1). **The only way either is read by the movement rules**,
 * so that poaching in the two directions is literally one predicate applied twice rather
 * than two rules that agree by convention.
 *
 * `undefined` for somebody nobody employs — a former Hero of yours, or an id nobody holds.
 */
export function employerRegard(career: Career, heroId: string): Regard | undefined {
  const hero = career.guild.roster.find((candidate) => candidate.id === heroId);
  if (hero !== undefined) return hero.regardForGuildmaster;
  return rivalHeroById(career, heroId)?.hero.regardForRival;
}

/**
 * Whether somebody holding this Regard for their employer can be approached without that
 * employer's consent. One exported predicate, used in both directions — you poaching from
 * a Rival, and a soured Rival poaching from you (E5-S4).
 */
export function isPoachable(regard: Regard, config: GameConfig): boolean {
  return regard.value <= config.poachRegardThreshold;
}

/**
 * Whether this Rival is presently minded to take somebody back off your Roster: you have
 * wronged them to `config.retaliationRegardThreshold` or past it (E5-S4). `retaliate` asks
 * exactly this, so nothing that reports on it can disagree with what the engine then does.
 */
export function isRetaliating(rival: Rival, config: GameConfig): boolean {
  return rival.regardForGuild.value <= config.retaliationRegardThreshold;
}

/**
 * Whether this Rival has anywhere to put another person. A soured Rival whose own Roster is
 * already at `config.rivalRosterMax` is completely harmless until somebody leaves it, which
 * is what keeps `roster.length <= rivalRosterMax` a genuine invariant on every Day rather
 * than something churn tidies up afterwards (DL-21 §7). `retaliate` asks exactly this.
 */
export function hasRoomForAnother(rival: Rival, config: GameConfig): boolean {
  return rival.roster.length < config.rivalRosterMax;
}

/** One Hero of yours another Guild could take, and the Guilds presently minded to try. */
export interface RetaliationRisk {
  heroId: string;
  /** What they think of the Guildmaster: the number that made them takeable. */
  regardValue: number;
  /**
   * The Rivals both soured enough to try and with room to put somebody. Empty means
   * takeable in principle, with nobody presently minded to.
   */
  rivalIds: string[];
}

/**
 * Who on **your** Roster another Guild could take as things stand, and by whom (finding
 * C9, DL-22 §2). Pure, read-only, and safe to ask after every keypress.
 *
 * A Hero appears exactly when `isPoachable` says so — the same predicate a Rival is
 * judged by, applied the other way — and the list is in the order a refresh would work
 * through it: worst Regard first, ties by id. `rivalIds` is every Rival for whom both
 * `isRetaliating` and `hasRoomForAnother` hold. All three predicates are the ones
 * {@link retaliate} itself uses, shared rather than restated, so this can never promise
 * something the next Board refresh then contradicts.
 *
 * **Somebody away on a Commission is listed.** They are as takeable as anybody; the
 * attempt they are owed is simply deferred to the Day they come home (DL-14 §4), and a
 * player who cannot see the risk until they are back cannot act on it.
 */
export function retaliationRisks(career: Career): RetaliationRisk[] {
  const { config } = career;
  const rivalIds = career.rivals
    .filter((rival) => isRetaliating(rival, config) && hasRoomForAnother(rival, config))
    .map((rival) => rival.id);
  return career.guild.roster
    .filter((hero) => isPoachable(hero.regardForGuildmaster, config))
    .sort((one, other) =>
      one.regardForGuildmaster.value - other.regardForGuildmaster.value !== 0
        ? one.regardForGuildmaster.value - other.regardForGuildmaster.value
        : one.id.localeCompare(other.id),
    )
    .map((hero) => ({
      heroId: hero.id,
      regardValue: hero.regardForGuildmaster.value,
      rivalIds: [...rivalIds],
    }));
}

/** What a Rival charges for one of their people, above board. */
export function transferFee(hero: AnyHero, config: GameConfig): number {
  return config.transferFeeBase + config.transferFeePerCalibre * hero.calibre;
}

/** What going behind a Rival's back costs instead. Always less than the Transfer (E5-S3). */
export function poachFee(hero: AnyHero, config: GameConfig): number {
  return Math.round(transferFee(hero, config) * config.poachFeeFactor);
}

/** The Rivals who have been wronged enough to take more off your Board (E5-S5). */
export function souredRivals(career: Career): Rival[] {
  return career.rivals.filter(
    (rival) => rival.regardForGuild.value <= career.config.souredRivalThreshold,
  );
}

/**
 * Every Guild ordered by Standing, highest first, ties broken by name (E5-S6). Pure: it
 * takes no generator, emits no event and computes nothing that is not already modelled —
 * the player's Standing is derived from Patron Regard and a Rival's is stored, and this
 * reads both and orders them.
 *
 * Your row is marked and is **not** special-cased in the ordering: a Guild at the bottom
 * of the League is at the bottom of the League.
 */
export function league(career: Career): LeagueRow[] {
  const rows: LeagueRow[] = [
    {
      guildId: 'player',
      name: career.guild.name,
      standing: standingOf(career),
      rosterSize: career.guild.roster.length,
      isPlayer: true,
    },
    ...career.rivals.map((rival) => ({
      guildId: rival.id,
      name: rival.name,
      standing: rival.standing,
      rosterSize: rival.roster.length,
      isPlayer: false,
    })),
  ];
  return rows.sort((one, other) =>
    other.standing - one.standing !== 0
      ? other.standing - one.standing
      : one.name.localeCompare(other.name),
  );
}

// ── Making a Rival's people ─────────────────────────────────────────────────

/** Every id anybody in this Career holds, so a fresh one can never land on top of it. */
function idsInUse(career: Career): Set<string> {
  return new Set([
    ...career.guild.roster.map((hero) => hero.id),
    ...career.guild.formerHeroes.map((hero) => hero.id),
    ...career.applicants.map((applicant) => applicant.id),
    ...career.rivals.map((rival) => rival.id),
    ...career.rivals.flatMap((rival) => rival.roster.map((hero) => hero.id)),
  ]);
}

/**
 * The next Rival Hero id, `<rivalId>h<n>`, from the Career's own counter. Monotonic, so
 * an id is never reused however much a Roster churns; and defensive, so a document whose
 * counter has been tampered with still cannot mint an id somebody already holds — exactly
 * as an Applicant's `a<n>` is (DL-19 §2).
 */
function takeRivalHeroId(draft: Career, rival: Rival, taken: ReadonlySet<string>): string {
  let id = `${rival.id}h${draft.nextRivalHeroNumber}`;
  while (taken.has(id)) {
    draft.nextRivalHeroNumber += 1;
    id = `${rival.id}h${draft.nextRivalHeroNumber}`;
  }
  draft.nextRivalHeroNumber += 1;
  return id;
}

/**
 * Somebody in a Rival's employ: a name, a Background and its Traits, an age and Stats,
 * and an opinion of the Guild paying them. Their calibre is drawn against that Rival's
 * **stored** Standing by E4's rule, which is Standing's one job — a Guild that has earned
 * a name attracts better people, whoever runs it (CONTEXT · Standing).
 */
function makeRivalHero(
  draft: Career,
  rival: Rival,
  content: Content,
  rng: Rng,
  taken: Set<string>,
  names: Set<string>,
): RivalHero {
  const { config } = draft;
  const calibre = drawCalibre(maxCalibreFor(rival.standing, config), rng);
  const background = rng.pick(content.backgrounds);
  const id = takeRivalHeroId(draft, rival, taken);
  const name = freeName(content, config, rng, names);
  taken.add(id);
  names.add(name);
  const traits: HeroTrait[] = background.traits.map((trait) => ({ name: trait, since: draft.day }));
  return {
    id,
    name,
    pronouns: rng.pick(PRONOUNS),
    stats: distributeStats(calibreStatBudget(calibre, config), config, rng),
    // Derived from the seed and the id, never from the stream making them, so that a
    // person has the same birthday wherever and whenever they are made (DL-16 §1).
    age: startingAge(draft.seed, id, config),
    background: background.name,
    traits,
    calibre,
    regardForRival: {
      value: clamp(
        rng.between(config.rivalHeroRegardMin, config.rivalHeroRegardMax),
        config.regardMin,
        config.regardMax,
      ),
      reason: REASON_WHO_THEY_WORK_FOR,
      nature: 'neutral',
    },
    regardFor: {},
    joinedOn: draft.day,
    lastCommittedOn: draft.day,
    regardDecayedOn: draft.day,
  };
}

/**
 * A whole number in `low..high`, inclusive, taking **exactly one** draw whatever the range
 * — which `rng.between` does not: it takes none at all when `high <= low`. That matters
 * wherever the stream is a derived one, because a draw that is sometimes not taken
 * reshuffles every draw after it on that stream (DL-20's "E5 must know", DL-22). The value
 * is the one `between` gives at every range where `between` draws at all.
 */
function drawBetween(low: number, high: number, rng: Rng): number {
  const span = Math.max(0, high - low);
  return low + Math.min(span, Math.floor(rng.float() * (span + 1)));
}

/** The generator a Rival's own people are drawn from: the seed and that Rival's id. */
function rivalStream(seed: string, rivalId: string): Rng {
  return rngOn({ rng: seedRng(`${seed}:rival:${rivalId}`) });
}

/** The generator a Board refresh's churn is drawn from: the seed and the Day. */
function churnStream(seed: string, day: number): Rng {
  return rngOn({ rng: seedRng(`${seed}:rival-churn:${day}`) });
}

/**
 * Seed what a newcomer and everybody already on the player's Roster think of one another,
 * in both directions and with `??=`, so that a remembered opinion is never overwritten by
 * a fresh neutral one (E4-S3).
 *
 * **Only the player's Roster.** Nothing in the game reads the Regard between two people a
 * Rival employs: Rivals run no Beats, compute no Backing and lose nobody to a Departure
 * Check (E5 §0), so it would be state that could never be seen, acted on or moved — and
 * it would be carried in every copy of every Career, which is the one place a Rival's
 * Roster could genuinely cost something (E5 §5's memory risk). Somebody who crosses onto
 * your Roster is seeded fresh opinions of your Heroes, which is the truth of it: they
 * have not worked with them. Somebody a Rival takes keeps every opinion they had of
 * yours, because that is a person's memory and not a Roster's bookkeeping.
 */
function seedAmong(newcomer: AnyHero, roster: readonly AnyHero[], config: GameConfig): void {
  for (const other of roster) {
    if (other.id === newcomer.id) continue;
    newcomer.regardFor[other.id] ??= newcomerRegard(config);
    other.regardFor[newcomer.id] ??= newcomerRegard(config);
  }
}

/**
 * Give a Rival a Roster. Called at `newCareer` and again at load for a save written
 * before Rivals had people, from the same derived stream either way — so the same
 * document always loads to the same Rosters, and a save from E4 gets the Roster a Career
 * on that seed would have had (E5 §5, and the definition of done's determinism).
 */
function fillRivalRoster(draft: Career, rival: Rival, content: Content): void {
  const rng = rivalStream(draft.seed, rival.id);
  const { config } = draft;
  // One draw whatever the range, as `drawCalibre` is: `rng.between(low, high)` takes **no**
  // draw when `high <= low`, so at `rivalRosterMin === rivalRosterMax` the size cost
  // nothing and the whole of this Rival's stream shifted under a config change — the exact
  // trap DL-20's "E5 must know" named (DL-22). At the shipped 4–8 the value is the same
  // number `between` gave, so nothing E5 pinned moved.
  const wanted = Math.max(0, drawBetween(config.rivalRosterMin, config.rivalRosterMax, rng));
  const taken = idsInUse(draft);
  const names = namesInUse(draft, 'without-the-door');
  for (let index = 0; index < wanted; index += 1) {
    rival.roster.push(makeRivalHero(draft, rival, content, rng, taken, names));
  }
}

/**
 * Give every Rival a Roster, once, in a Career where no Rival has ever employed anybody.
 *
 * **The guard is the id counter, not an empty Roster.** `nextRivalHeroNumber` is 1 in
 * exactly one situation: a Career that has just been generated, or a save written before
 * Rivals had people. A Rival whose Roster has since been emptied — by Retirement, by
 * churn, or by the player taking the last of them — has a counter past 1 and is left
 * alone, because an empty Roster is then a fact about the world rather than a gap in the
 * document, and churn is what fills it again.
 *
 * Deterministic and idempotent: the same document always produces the same Rosters, and a
 * second call changes nothing.
 *
 * **In `career.rivals` order, which is id order** — the order `newCareer` creates them in
 * and the order a save preserves. It is fixed rather than incidental because a Rival's
 * people avoid the names the Rivals before them have taken (DL-22 §1), so the order is
 * part of the answer; nothing a player does can move it.
 */
export function populateRivalRosters(draft: Career, content: Content): void {
  if (draft.nextRivalHeroNumber !== 1) return;
  for (const rival of draft.rivals) {
    if (rival.roster.length > 0) continue;
    fillRivalRoster(draft, rival, content);
  }
}

// ── The one place a person changes employer ─────────────────────────────────

/** Where somebody is coming from, or going to. */
export type Employer = { kind: 'guild' } | { kind: 'rival'; rivalId: string };

/** Where somebody is coming from. An offer at the door is a source and never a destination. */
export type Origin = Employer | { kind: 'applicants' };

/**
 * Move one person from wherever they are to wherever they are going: a Transfer, a
 * Poaching, a Rival's retaliation, or an Applicant taken on. **Every Hero movement in the
 * game runs through here**, so the two poaching directions cannot drift apart and the six
 * pieces of bookkeeping an arrival needs are written once (E5 §2, DL-20's "E5 must know").
 *
 * They keep their id, their age, their Traits, their calibre and what they think of the
 * people they have worked with. What changes is who employs them: the Regard they held
 * for their old employer is dropped and `regard` is what they think of the new one.
 *
 * Emits nothing. The transaction, the coin and the joining are the caller's to report, in
 * that order.
 *
 * @returns the person as they now are, on their new Roster.
 */
export function moveHero(
  draft: Career,
  person: AnyHero,
  from: Origin,
  to: Employer,
  regard: Regard,
): AnyHero {
  // 1. Out of wherever they were.
  if (from.kind === 'applicants') {
    draft.applicants = draft.applicants.filter((entry) => entry.id !== person.id);
  } else if (from.kind === 'guild') {
    draft.guild.roster = draft.guild.roster.filter((entry) => entry.id !== person.id);
  } else {
    const rival = requireRival(draft, from.rivalId);
    rival.roster = rival.roster.filter((entry) => entry.id !== person.id);
  }
  // 2. Somebody in work is not in the Guild's record of people who left it (E4-S4).
  draft.guild.formerHeroes = draft.guild.formerHeroes.filter((entry) => entry.id !== person.id);

  // 3. The same person, holding Regard for their new employer and for nobody else's. The
  //    keys are set in the order `clone.ts` writes them, so a serialised copy of a Career
  //    holding somebody who has moved is byte-identical to the Career itself.
  //    `formerHeroId` travels with them — it is the id they left the player's Roster with
  //    — and `exit` does not, because they are working again.
  const moved: AnyHero = {
    id: person.id,
    name: person.name,
    pronouns: person.pronouns,
    stats: person.stats,
    age: person.age,
    background: person.background,
    traits: person.traits,
    calibre: person.calibre,
    ...(to.kind === 'guild'
      ? { regardForGuildmaster: regard }
      : { regardForRival: regard }),
    regardFor: person.regardFor,
    joinedOn: draft.day,
    lastCommittedOn: draft.day,
    regardDecayedOn: draft.day,
    ...(person.formerHeroId === undefined ? {} : { formerHeroId: person.formerHeroId }),
  } as AnyHero;

  // 4. What they and the Roster they are joining think of one another, both ways, before
  //    they are on it — so nobody is ever seeded an opinion of themselves.
  if (to.kind === 'guild') {
    seedAmong(moved, draft.guild.roster, draft.config);
    draft.guild.guildmaster.regardFor[moved.id] ??= newcomerRegard(draft.config);
  }

  // 5. On.
  if (to.kind === 'guild') draft.guild.roster.push(moved as Hero);
  else requireRival(draft, to.rivalId).roster.push(moved as RivalHero);
  return moved;
}

// ── What a Rival does at each Board refresh ─────────────────────────────────

/**
 * A Rival's Hero who has reached the end of a working life leaves their Roster, exactly as
 * one of yours leaves yours (E5-S1). They leave the world with it: `guild.formerHeroes` is
 * the player's own history and a Rival's Hero was never in it (ADR-0003). `HeroRetired`
 * and the event stream are where the world's memory of them lives.
 *
 * The player's own ledger is deliberately untouched: `ledger.heroesRetired` counts Heroes
 * who retired out of the player's Roster, and somebody else's people are not that.
 */
export function retireRivalHeroes(draft: Career, events: GameEvent[]): void {
  const perYear = draft.config.daysPerYear;
  for (const rival of draft.rivals) {
    const leaving = rival.roster.filter((hero) => hero.age >= draft.config.heroRetirementAge);
    if (leaving.length === 0) continue;
    rival.roster = rival.roster.filter((hero) => hero.age < draft.config.heroRetirementAge);
    for (const hero of leaving) {
      events.push({
        type: 'HeroRetired',
        day: draft.day,
        heroId: hero.id,
        age: hero.age,
        yearsServed: perYear > 0 ? Math.round((draft.day - hero.joinedOn) / perYear) : 0,
      });
    }
  }
}

/**
 * A soured Rival poaches back, by exactly the rule you poach by: your Heroes whose Regard
 * for the Guildmaster has fallen to `config.poachRegardThreshold`, worst first (E5-S4).
 * They pay you nothing, because poaching is without consent.
 *
 * One attempt per soured Rival per Board refresh, in id order. A Rival whose own Roster is
 * already at `config.rivalRosterMax` has nowhere to put anybody and their attempt finds
 * nothing. A Hero away on a Commission is never taken mid-Commission: the attempt they
 * were owed is taken on the Day they come home, which is E2's own cadence (DL-14 §4).
 *
 * @param only when given, the ids to settle rather than the whole Roster — the Heroes who
 * have just come home on a Day the Board is not refreshing.
 */
export function retaliate(
  draft: Career,
  only: readonly string[] | undefined,
  events: GameEvent[],
): void {
  const { config } = draft;
  const away = new Set(draft.parties.flatMap((party) => party.heroIds));
  const wanted = only === undefined ? undefined : new Set(only);
  for (const rival of draft.rivals) {
    // The same two predicates `retaliationRisks` reports on, so the Roster a player reads
    // and the Roster this then takes from can never disagree (DL-22 §2).
    if (!isRetaliating(rival, config)) continue;
    if (!hasRoomForAnother(rival, config)) continue;
    const takeable = draft.guild.roster
      .filter((hero) => !away.has(hero.id))
      .filter((hero) => wanted === undefined || wanted.has(hero.id))
      .filter((hero) => isPoachable(hero.regardForGuildmaster, config))
      .sort((one, other) =>
        one.regardForGuildmaster.value - other.regardForGuildmaster.value !== 0
          ? one.regardForGuildmaster.value - other.regardForGuildmaster.value
          : one.id.localeCompare(other.id),
      );
    const target = takeable[0];
    if (target === undefined) continue;
    const regardValue = target.regardForGuildmaster.value;
    moveHero(
      draft,
      target,
      { kind: 'guild' },
      { kind: 'rival', rivalId: rival.id },
      {
        value: clamp(config.transferJoiningRegard, config.regardMin, config.regardMax),
        reason: REASON_TOOK_ANOTHER_OFFER,
        nature: 'neutral',
      },
    );
    draft.ledger.heroesPoachedFromUs += 1;
    events.push({
      type: 'RivalPoachedHero',
      day: draft.day,
      heroId: target.id,
      toRivalId: rival.id,
      regardValue,
    });
  }
}

/**
 * Rival Rosters gain and lose people of their own accord (E5-S5). A Rival at or below
 * `rivalRosterMin` can only gain and one at or above `rivalRosterMax` can only lose, so
 * churn never pushes a Roster outside its bounds.
 *
 * Somebody churned in is made the way a Rival's opening Roster is made — a person the
 * player has never met, taken on by a Guild the player does not run. Somebody churned out
 * is the one who thought least of the Rival employing them, which is E2's Departure seen
 * from the other side, and they leave the world rather than the player's history.
 */
export function churnRivals(draft: Career, content: Content, events: GameEvent[]): void {
  const { config } = draft;
  const rng = churnStream(draft.seed, draft.day);
  for (const rival of draft.rivals) {
    // Both draws are taken for every Rival, whatever happens next, so that a Rival who
    // churns cannot shift the draws of the Rivals after them (DL-20's "E5 must know").
    const churns = rng.chance(config.rivalChurnChance);
    const wantsToGain = rng.chance(config.rivalChurnGainChance);
    if (!churns) continue;

    const gains =
      rival.roster.length <= config.rivalRosterMin
        ? true
        : rival.roster.length >= config.rivalRosterMax
          ? false
          : wantsToGain;

    const joinedHeroIds: string[] = [];
    const leftHeroIds: string[] = [];
    if (gains) {
      if (rival.roster.length >= config.rivalRosterMax) continue;
      const taken = idsInUse(draft);
      const names = namesInUse(draft, 'without-the-door');
      const hero = makeRivalHero(draft, rival, content, rng, taken, names);
      rival.roster.push(hero);
      joinedHeroIds.push(hero.id);
    } else {
      const leaving = [...rival.roster].sort((one, other) =>
        one.regardForRival.value - other.regardForRival.value !== 0
          ? one.regardForRival.value - other.regardForRival.value
          : one.id.localeCompare(other.id),
      )[0];
      if (leaving === undefined) continue;
      rival.roster = rival.roster.filter((hero) => hero.id !== leaving.id);
      leftHeroIds.push(leaving.id);
    }
    events.push({
      type: 'RivalRosterChanged',
      day: draft.day,
      rivalId: rival.id,
      joinedHeroIds,
      leftHeroIds,
    });
  }
}
