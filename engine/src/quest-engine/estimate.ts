// The chance estimate (v1.1.4-S5, DL-148 items 15 and 17, `CONTEXT.md` Chance band): how likely a
// proposed Party is to come through each of a Quest's Encounters, and the Quest, before it is sent.
// A selector: it draws nothing and changes nothing, so it never moves a draw (ADR-0009). It reads
// what a Check reads (check.ts): the Party as it will come home, each Hero's form from their Morale
// then (form.ts), their teamwork and Synergies, and the consumables they would carry (consumables.ts),
// and works out exactly what the resolver (resolve.ts) leaves to its draws.
//
// - *One Check.* Its roll is C × (1 + v × (2u − 1)), u a draw from 0 up to 1, never below 0, so the
//   chance it reaches x is 1 − clamp((x ÷ C − 1 + v) ÷ 2v, 0, 1); at v = 0 it is a step, 1 when C
//   reaches x and else 0. Each Degree's chance follows from its threshold times the target
//   (`degreeOf`).
// - *An Encounter.* Its Checks roll independently, so every combination of their Degrees, at most
//   4⁴ = 256, is read through its pass formula (`passDegree`). A reroll the Party would use is folded
//   in as the resolver rolls one: when the Encounter falls short of Success, each Check that did is
//   rolled again, and the new roll stands.
// - *The Quest.* A reroll used on one Encounter is not there for the next, and a bonus is spent
//   whatever the rolls. So the Encounters are walked in order, keeping the chance of each count of
//   Successes and Triumphs with each stock of rerolls left, and the Quest band is `questBand`'s of
//   each count.
//
// *The night home* (v1.1.4-S5's verification). The resolver meets the Party on the night it comes
// home (`questsConclude`), not as it sets out: on each night away the Hero State Engine has moved
// each Hero's Morale toward their baseline, decayed their Regard (so their teamwork), and healed an
// Injury whose night came, perhaps leaving a Trait; and their age is read on the return night. None
// of it draws: the Retirement check, which does, is never due for a Hero away. So the estimate reads
// copies of the Heroes, each night away run on them by the engine's own step (`heroNight`,
// hero-state.ts), at the Turn of the return night (`returnNightOf`). It reads the Guild as it is when
// the Party sets out: what the Guild does while it is away (a Hall Improvement built, a new
// Guildmaster) is not foreseen.
//
// It assumes no one falls (`ifNoOneFalls`): no Hero is hurt or killed on the way, and no Morale an
// Encounter costs or gives moves anyone's form, so every Encounter is met by the whole Party as it
// comes home, as the resolver meets it when no harm lands. The front ends say "if no one falls". The
// Encounters are the Quest's own, drawn when it was posted (`storedSequence`); a Quest without
// them, generated before M4, draws its sequence on the way and has no estimate. A Party of no one
// meets none of them, and fails.

import { checkProposedParty, type ConsumableRequest } from '../actions/dispatch.js';
import { chanceBandNames, configProblems, type ChanceBand, type GameConfig, type QuestBand } from '../config.js';
import { degrees, type CheckKey, type Degree, type Encounter, type EncounterKey, type EncounterKind } from '../content-types.js';
import { compareByCodeUnit, type Hero, type HeroId, type Quest, type World } from '../document.js';
import { eventEmitter } from '../emit.js';
import { clamp } from '../generators/draw.js';
import { itemDefinition } from '../items.js';
import { heroNight } from '../phases/hero-state.js';
import { dayOf, nightOf, returnNightOf, turnsPerDay } from '../time.js';
import { capability, targetOf, type CheckDeps } from './check.js';
import { bonusOf, rerollFor, takeBonuses, type Left } from './consumables.js';
import { passDegree, passOf, succeeded } from './degree.js';
import { storedSequence } from './encounters.js';
import { queryParty, type QueryMember, type QueryParty } from './query.js';
import { questBand } from './resolve.js';

/** The chance of each Degree, which sum to 1. */
export type DegreeChances = Record<Degree, number>;

/** One Check of an Encounter, estimated: one roll's chance of each Degree. */
export interface CheckEstimate {
  key: CheckKey;
  /** The Party's capability, as the Check reads it (`capability`), with the bonus the Party carries. */
  capability: number;
  /** What the roll must reach (`targetOf`). */
  target: number;
  /** One roll's chance of each Degree. */
  degrees: DegreeChances;
}

/** One Encounter of the Quest, estimated. */
export interface EncounterEstimate {
  /** Its place in the sequence, from 0. */
  index: number;
  encounterKey: EncounterKey;
  kind: EncounterKind;
  /** Each Check's first roll, in the order the Encounter lists them. */
  checks: CheckEstimate[];
  /** The chance the Encounter ends at each Degree, by its pass formula, a reroll the Party would have then folded in. */
  degrees: DegreeChances;
  /** The chance it ends at Success or better. */
  success: number;
  /** `success` in a word (`chanceBand`). */
  chance: ChanceBand;
}

/** A Quest, estimated for a proposed Party (`estimateQuest`). */
export interface QuestEstimate {
  /** Always true: the estimate assumes no one is hurt, killed or moved in Morale on the way, and says so. */
  ifNoOneFalls: true;
  /** Each of its Encounters, in the order the Party meets them. */
  encounters: EncounterEstimate[];
  /** The chance of each Quest band. */
  bands: Record<QuestBand, number>;
  /** The chance of a success or a strong success. */
  success: number;
  /** `success` in a word (`chanceBand`). */
  chance: ChanceBand;
}

/** The word a chance is shown in (DL-148 item 15): the highest of `chanceBands` whose start it reaches, else `hopeless`. */
export function chanceBand(chance: number, config: Pick<GameConfig, 'chanceBands'>): ChanceBand {
  let band: ChanceBand = 'hopeless';
  for (const name of chanceBandNames.slice(1) as Exclude<ChanceBand, 'hopeless'>[]) {
    if (chance >= config.chanceBands[name]) band = name;
  }
  return band;
}

/**
 * The chance a roll of `capable` spread by `variance` reaches `x` (check.ts): 1 − clamp((x ÷ C − 1 +
 * v) ÷ 2v, 0, 1) for a capability above 0, a step at a variance of 0, and for no capability the
 * chance a roll of 0 reaches `x`.
 */
export function chanceToReach(capable: number, variance: number, x: number): number {
  if (!(capable > 0)) return x <= 0 ? 1 : 0;
  if (variance === 0) return capable >= x ? 1 : 0;
  return 1 - clamp((x / capable - 1 + variance) / (2 * variance), 0, 1);
}

/**
 * How likely `heroes`, a proposed Party in the order named (which breaks the Queries' ties), as they
 * set out carrying `carried`, are to come through `quest` (v1.1.4-S5): each Encounter's chance of each
 * Degree and of Success or better, and the chance of each Quest band, each worked out exactly from
 * what the resolver draws, with a word for each chance. It assumes no one falls (`ifNoOneFalls`).
 * `null` for a Quest whose Encounters are drawn on the way, which content defines none of its
 * `encounterKeys`. A carried key that is no consumable carries nothing (data-model
 * rule 5). Draws nothing, and changes nothing.
 *
 * Throws on a programming error, as `resolveQuest` does: a configuration with a problem
 * (`configProblems`), a difficulty that is not above 0, an Encounter with no Check, or with several
 * and no pass formula.
 */
export function estimateQuest(
  world: World,
  quest: Pick<Quest, 'difficulty' | 'encounterKeys' | 'durationTurns'>,
  heroes: readonly Hero[],
  deps: CheckDeps,
  carried: readonly ConsumableRequest[] = [],
): QuestEstimate | null {
  return questEstimator(world, quest, heroes, deps)(heroes, carried);
}

/**
 * `estimateQuest` for any Party of `pool` on `quest`, many times over (v1.1.4-S6, the Rivals'
 * `partyFor`): each Hero of the pool is brought home, and read as a Query reads them (`queryParty`:
 * their effective Stats, Morale, age and form, each of their own alone), once, however many Parties
 * are estimated, and each estimate equals `estimateQuest`'s for the same Party and consumables. A
 * Hero outside the pool is brought home on each call. Throws as `estimateQuest` does: on a configuration
 * with a problem or a difficulty not above 0 at once, and on a Party or consumables `dispatch` would
 * throw on, or a malformed Encounter, at the call.
 */
export function questEstimator(
  world: World,
  quest: Pick<Quest, 'difficulty' | 'encounterKeys' | 'durationTurns'>,
  pool: readonly Hero[],
  deps: CheckDeps,
): (heroes: readonly Hero[], carried?: readonly ConsumableRequest[]) => QuestEstimate | null {
  const { config, content } = deps;
  const [problem] = configProblems(config);
  if (problem !== undefined) throw new RangeError(`The Quest Engine's configuration: ${problem}`);
  if (!(quest.difficulty > 0)) throw new RangeError(`A Quest of difficulty ${quest.difficulty} has no estimate; it is above 0`);
  const sequence = storedSequence(quest, content);
  // Brought home only when a Party is first estimated, since a Quest of no known Encounters needs none.
  // A member of a Party is read of the Hero alone, so each is read once and the Parties are made of them.
  let pooled: { world: World; members: Map<HeroId, QueryMember> } | undefined;
  return (heroes, carried = []) => {
    checkProposedParty(heroes.map((hero) => hero.id), carried);
    if (sequence.length === 0) return null;
    if (heroes.length === 0) return noOne(sequence, config);
    if (pooled === undefined) {
      const home = homecoming(world, pool, quest, deps);
      pooled = { world: home.world, members: new Map(queryParty(home.heroes, home.world, deps).members.map((member) => [member.hero.id, member])) };
    }
    const { world: poolWorld, members } = pooled;
    if (heroes.every((hero) => members.has(hero.id))) {
      const party = { members: heroes.map((hero) => members.get(hero.id) as QueryMember), content };
      return estimateFor(party, poolWorld, quest, sequence, deps, carried);
    }
    const home = homecoming(world, heroes, quest, deps);
    return estimateFor(queryParty(home.heroes, home.world, deps), home.world, quest, sequence, deps, carried);
  };
}

/** The estimate for `party`, brought home on `world` (`homecoming`), meeting `sequence` on `quest`. */
function estimateFor(
  party: QueryParty,
  world: World,
  quest: Pick<Quest, 'difficulty'>,
  sequence: readonly Encounter[],
  deps: CheckDeps,
  carried: readonly ConsumableRequest[],
): QuestEstimate {
  const { config, content } = deps;
  const kit = carried
    .flatMap(({ definitionKey, quantity }) => {
      const definition = itemDefinition(content, definitionKey);
      return definition?.kind === 'consumable' ? [{ definitionKey, effect: definition.effect, left: quantity }] : [];
    })
    .sort((a, b) => compareByCodeUnit(a.definitionKey, b.definitionKey));
  // A bonus is spent on each Encounter of its kinds while it lasts, whatever the rolls (resolve.ts).
  const rolled = sequence.map((encounter) => {
    const bonus = takeBonuses(kit, encounter.kind).reduce((total, it) => total + bonusOf(it), 0);
    const checks = checksOf(party, encounter, quest, world, deps, bonus);
    return { encounter, checks, ...foldedIn(encounter, checks) };
  });

  // The walk: the chance of each count of Successes and Triumphs so far, with each stock of rerolls left.
  const rerolls = kit.filter((it) => it.effect.kind === 'reroll');
  let walk = new Map<string, Walked>([[keyOf(0, 0, rerolls.map((it) => it.left)), { successes: 0, triumphs: 0, lefts: rerolls.map((it) => it.left), chance: 1 }]]);
  const encounters = rolled.map(({ encounter, checks, plain, rerolled }, index): EncounterEstimate => {
    const reached = noChance();
    const after = new Map<string, Walked>();
    for (const at of walk.values()) {
      const stock: Left[] = rerolls.map((it, n) => ({ effect: it.effect, left: at.lefts[n] as number }));
      const reroll = rerollFor(stock, encounter.kind);
      const used = reroll === undefined ? at.lefts : at.lefts.map((left, n) => (stock[n] === reroll ? left - 1 : left));
      for (const degree of degrees) {
        // Without a reroll, the first rolls stand; with one, a Success stands and anything short of it is rolled again.
        const outcomes: [number, number[]][] =
          reroll === undefined ? [[plain[degree], at.lefts]] : [[succeeded(degree) ? plain[degree] : 0, at.lefts], [rerolled[degree], used]];
        for (const [chance, lefts] of outcomes) {
          if (chance === 0) continue;
          reached[degree] += at.chance * chance;
          const successes = at.successes + (succeeded(degree) ? 1 : 0);
          const triumphs = at.triumphs + (degree === 'triumph' ? 1 : 0);
          const key = keyOf(successes, triumphs, lefts);
          const walked = after.get(key);
          if (walked === undefined) after.set(key, { successes, triumphs, lefts, chance: at.chance * chance });
          else walked.chance += at.chance * chance;
        }
      }
    }
    walk = after;
    const success = reached.success + reached.triumph;
    return { index, encounterKey: encounter.key, kind: encounter.kind, checks, degrees: reached, success, chance: chanceBand(success, config) };
  });

  const bands: Record<QuestBand, number> = { fail: 0, success: 0, strong: 0 };
  for (const { successes, triumphs, chance } of walk.values()) bands[questBand(successes, triumphs, sequence.length, config)] += chance;
  const success = bands.success + bands.strong;
  return { ifNoOneFalls: true, encounters, bands, success, chance: chanceBand(success, config) };
}

/**
 * `heroes`, sent on `quest` now, as they come home on its return night (`returnNightOf`): copies of
 * them, each night away from the first night after `world.turn` run on them by the Hero State
 * Engine's own step (`heroNight`), and a world that holds the copies at the return night's Turn.
 * `world` and `heroes` are left as they are.
 */
function homecoming(world: World, heroes: readonly Hero[], quest: Pick<Quest, 'durationTurns'>, deps: CheckDeps): { world: World; heroes: Hero[] } {
  const away = heroes.map((hero) => copyOf(hero));
  const home: World = { ...world, heroes: { ...world.heroes, ...Object.fromEntries(away.map((hero) => [hero.id, hero])) } };
  const returns = returnNightOf(world.turn, quest);
  const first = nightOf(dayOf(world.turn));
  for (let night = first > world.turn ? first : first + turnsPerDay; night < returns; night += turnsPerDay) {
    home.turn = night;
    const ctx = { ...deps, turn: night, emit: eventEmitter(home) };
    for (const hero of away) heroNight(hero, home, ctx);
  }
  home.turn = returns;
  return { world: home, heroes: away };
}

/**
 * A deep copy of `value`, JSON-safe as the document is (data-model rule 6), equal to `structuredClone`'s
 * at a third of its cost: the Rivals' `partyFor` brings its free Heroes home every afternoon (DL-164).
 */
function copyOf<T>(value: T): T {
  if (typeof value !== 'object' || value === null) return value;
  if (Array.isArray(value)) return value.map((item: unknown) => copyOf(item)) as T;
  const copy: Record<string, unknown> = {};
  for (const key in value) copy[key] = copyOf(value[key]);
  return copy as T;
}

/** The estimate for a Party of no one: it meets none of `sequence`, so no Degree has a chance, and the Quest fails. */
function noOne(sequence: readonly Encounter[], config: Pick<GameConfig, 'chanceBands'>): QuestEstimate {
  const encounters = sequence.map(
    (encounter, index): EncounterEstimate => ({ index, encounterKey: encounter.key, kind: encounter.kind, checks: [], degrees: noChance(), success: 0, chance: chanceBand(0, config) }),
  );
  return { ifNoOneFalls: true, encounters, bands: { fail: 1, success: 0, strong: 0 }, success: 0, chance: chanceBand(0, config) };
}

/** A count of Successes and Triumphs so far, with the stock of each reroll left, and its chance. */
interface Walked {
  successes: number;
  triumphs: number;
  lefts: number[];
  chance: number;
}

function keyOf(successes: number, triumphs: number, lefts: readonly number[]): string {
  return `${successes}/${triumphs}/${lefts.join(',')}`;
}

/** No chance of any Degree. */
function noChance(): DegreeChances {
  return { failure: 0, setback: 0, success: 0, triumph: 0 };
}

/**
 * Each of `encounter`'s Checks for `party` on `quest`, estimated as `check` rolls it: its capability
 * with `bonus` (none to a raw Check), its target, and one roll's chance of each Degree.
 */
function checksOf(
  party: QueryParty,
  encounter: Encounter,
  quest: Pick<Quest, 'difficulty'>,
  world: World,
  deps: CheckDeps,
  bonus: number,
): CheckEstimate[] {
  const { triumph, success, setback } = deps.config.checkDegrees;
  return encounter.checks.map((it): CheckEstimate => {
    const capable = capability(party, encounter, it, world, deps) + (it.raw === true ? 0 : bonus);
    const variance = it.variance ?? deps.config.checkVariance;
    const target = targetOf(it, quest);
    const [atTriumph, atSuccess, atSetback] = [triumph, success, setback].map((threshold) => chanceToReach(capable, variance, threshold * target)) as [
      number,
      number,
      number,
    ];
    const degrees = { failure: 1 - atSetback, setback: atSetback - atSuccess, success: atSuccess - atTriumph, triumph: atTriumph };
    return { key: it.key, capability: capable, target, degrees };
  });
}

/**
 * `encounter`'s chance of each Degree from its Checks' (`checks`), every combination of them read
 * through its pass formula: `plain`, the first rolls standing; and `rerolled`, the chance it first
 * falls short of Success and then, each Check that did rolled again, ends at each Degree (resolve.ts).
 */
function foldedIn(encounter: Encounter, checks: readonly CheckEstimate[]): { plain: DegreeChances; rerolled: DegreeChances } {
  if (checks.length === 0) throw new RangeError(`Encounter ${JSON.stringify(encounter.key)} has no Check`);
  const pass = passOf(encounter);
  const plain = noChance();
  const rerolled = noChance();
  for (const first of combinations(checks)) {
    const { degree } = passDegree(pass, first.byKey);
    plain[degree] += first.chance;
    if (succeeded(degree)) continue;
    for (const again of combinations(checks.filter((it) => !succeeded(first.byKey[it.key] as Degree)))) {
      rerolled[passDegree(pass, { ...first.byKey, ...again.byKey }).degree] += first.chance * again.chance;
    }
  }
  return { plain, rerolled };
}

/** Every combination of `checks`' Degrees with a chance above 0, and its chance. */
function combinations(checks: readonly CheckEstimate[]): { byKey: Record<CheckKey, Degree>; chance: number }[] {
  let combined: { byKey: Record<CheckKey, Degree>; chance: number }[] = [{ byKey: {}, chance: 1 }];
  for (const { key, degrees: chances } of checks) {
    combined = combined.flatMap(({ byKey, chance }) =>
      degrees.filter((degree) => chances[degree] > 0).map((degree) => ({ byKey: { ...byKey, [key]: degree }, chance: chance * chances[degree] })),
    );
  }
  return combined;
}
