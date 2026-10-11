// The chance estimate (v1.1.4-S5, DL-148 items 15 and 17, `CONTEXT.md` Chance band): how likely a
// proposed Party is to come through each of a Quest's Encounters, and the Quest, before it is sent.
// A selector: it draws nothing and changes nothing, so it never moves a draw (ADR-0009). It reads
// what a Check reads (check.ts): the Party as it will come home, each Hero's formed Stats from their
// Morale then and their Fatigue on each Encounter's Day (form.ts), their teamwork and Synergies, and
// the consumables they would carry (consumables.ts), and works out exactly what the resolver
// (resolve.ts) leaves to its draws.
//
// *Fatigue, Encounter by Encounter* (DL-280 item 2, Q11 a; DL-284). The Quest clock (clock.ts) gives
// the Day each Encounter falls on and each Hero's Fatigue on it, from the Fatigue they would set out
// with: the proposed Heroes' own, not the copies brought home, whose Fatigue is the Quest's end's. One
// Party is taken for each distinct Day, its members the brought-home ones at that Day's Fatigue
// (`reformed`), each kept by return night, Hero, Fatigue and the Captain's s, however many Parties and
// Quests read them; the Synergies are the Party's on every Day, since no requirement reads a formed
// Stat. The Captain's factor is the proposed Party's own (DL-287): its Guild's Captain's s when the
// Captain is one of it (`partyCaptaincy`), whoever else the pool brought home.
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
// each Hero's Morale toward their baseline, raised their Fatigue, decayed their Regard (so their
// teamwork), and healed an Injury whose night came, perhaps leaving a Trait; and their age is read on
// the return night. None of it draws: the Retirement check, which does, is never due for a Hero away.
// So the estimate reads copies of the Heroes, each night away run on them by the engine's own step
// (`heroNight`, hero-state.ts) as away on the Quest, at the Turn of the return night
// (`returnNightOf`). It reads the Guild as it is when the Party sets out: what the Guild does while
// it is away (a Hall Improvement built, a new Guildmaster) is not foreseen.
//
// It assumes no one falls (`ifNoOneFalls`): no Hero is hurt or killed on the way, and no Morale an
// Encounter costs or gives moves anyone's form, so every Encounter is met by the whole Party as it
// comes home, as the resolver meets it when no harm lands. The front ends say "if no one falls". The
// Encounters are the Quest's own, drawn when it was posted (`storedSequence`); a Quest whose
// Encounters content no longer defines (data-model rule 5) draws its sequence on the way and has no
// estimate. A Party of no one meets none of them, and fails.

import { checkProposedParty, type ConsumableRequest } from '../actions/dispatch.js';
import { bandOf } from '../bands.js';
import { chanceBandNames, type ChanceBand, type GameConfig, type QuestBand } from '../config.js';
import { degrees, type CheckKey, type Degree, type Encounter, type EncounterKey, type EncounterKind } from '../content-types.js';
import { compareByCodeUnit, requireRow, rowOf, type GuildId, type Hero, type HeroId, type Quest, type World } from '../document.js';
import { eventEmitter } from '../emit.js';
import { clamp } from '../generators/draw.js';
import { itemDefinition } from '../items.js';
import { captainHomeLift } from '../morale.js';
import { heroNight } from '../phases/hero-state.js';
import { dayOf, nightOf, returnNightOf, turnsPerDay } from '../time.js';
import { capability, targetOf, type CheckDeps } from './check.js';
import { questClock } from './clock.js';
import { bonusOf, rerollFor, takeBonuses, type Left } from './consumables.js';
import { passDegree, passOf, succeeded } from './degree.js';
import { storedSequence } from './encounters.js';
import { partyCaptaincy, queryParty, reformed, type QueryMember, type QueryParty } from './query.js';
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
  return bandOf(chanceBandNames, config.chanceBands, chance);
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
 * Throws on a programming error, as `resolveQuest` does: a difficulty that is not above 0, an
 * Encounter with no Check, or with several and no pass formula.
 */
export function estimateQuest(
  world: World,
  quest: EstimatedQuest,
  heroes: readonly Hero[],
  deps: CheckDeps,
  carried: readonly ConsumableRequest[] = [],
): QuestEstimate | null {
  return partyEstimator(world, deps)(quest, heroes, { carried });
}

/** What the estimate reads of a Quest. */
export type EstimatedQuest = Pick<Quest, 'difficulty' | 'encounterKeys' | 'durationTurns' | 'tier'>;

/**
 * `estimateQuest` on `world` for any Party on any Quest, carrying `carried` (none by default).
 * Asked of a Hero not yet home for the Quest's return night, it brings home every Hero of `pool` not
 * yet home for it, `heroes` among them, at once.
 */
export type PartyEstimator = (
  quest: EstimatedQuest,
  heroes: readonly Hero[],
  options?: { carried?: readonly ConsumableRequest[]; pool?: readonly Hero[] },
) => QuestEstimate | null;

/**
 * `estimateQuest` on `world`, many times over (the Best Party module's, DL-237): each Hero is brought
 * home for a return night (`homecoming`), and read as a Query reads them (`queryParty`: their
 * effective Stats, Morale and age, each of their own alone), once, and at each Fatigue an
 * Encounter's Day meets them at, in a Party with its Captain or without (`reformed`), once, however
 * many Parties and Quests of that return night are estimated; each estimate equals `estimateQuest`'s
 * for the same Quest, Party and consumables. `world` must not change while it is used, which the Best
 * Party module holds its callers to. Throws as `estimateQuest` does, at the call.
 */
export function partyEstimator(world: World, deps: CheckDeps): PartyEstimator {
  const { config, content } = deps;
  // By return night and the Guilds whose Captain the Party takes away with it (`captainsAmong`), whose
  // Heroes miss the Captain's lift to their Morale's baseline on the nights away (DL-287): a world that
  // holds every Hero brought home for it, each of them as a Party's member, and each of those at each
  // Fatigue an Encounter's Day has met them at, under each Captain's s a Party has given them (DL-284).
  const homes = new Map<string, { world: World; members: Map<HeroId, QueryMember>; byFatigue: Map<HeroId, Map<string, QueryMember>> }>();
  // By Encounter: the Degree its pass formula gives each combination of its Checks' Degrees, as read.
  const passes: Passes = new Map();
  return (quest, heroes, { carried = [], pool = heroes } = {}) => {
    if (!(quest.difficulty > 0)) throw new RangeError(`A Quest of difficulty ${quest.difficulty} has no estimate; it is above 0`);
    checkProposedParty(heroes.map((hero) => hero.id), carried);
    const sequence = storedSequence(quest, content);
    if (sequence.length === 0) return null;
    if (heroes.length === 0) return noOne(sequence, config);
    const night = returnNightOf(world.turn, quest);
    const captainsAway = captainsAmong(heroes, world);
    const homeKey = `${night}|${captainsAway.join()}`;
    let home = homes.get(homeKey);
    if (home === undefined || heroes.some((hero) => !home?.members.has(hero.id))) {
      const known = home?.members;
      const away = [...pool, ...heroes].filter((hero, at, all) => known?.has(hero.id) !== true && all.findIndex((other) => other.id === hero.id) === at);
      const brought = homecoming(world, away, quest, deps, captainsAway);
      const members = queryParty(brought.heroes, brought.world, deps).members;
      if (home === undefined) {
        home = { world: brought.world, members: new Map(), byFatigue: new Map() };
        homes.set(homeKey, home);
      } else {
        // Each Hero comes home of their own alone, so the copies join the world the first brought home.
        for (const hero of brought.heroes) home.world.heroes[hero.id] = hero;
      }
      for (const member of members) home.members.set(member.hero.id, member);
    }
    const { members, byFatigue } = home;
    const proposed = heroes.map((hero) => members.get(hero.id) as QueryMember);
    // The Captain's s of this Party, read from the world as it is, not the pool's the members were
    // brought home in (DL-287).
    const captaincy = partyCaptaincy(proposed, world, content);
    // Each brought-home member at `fatigue` under `captaincy`, kept by Hero, Fatigue and s for the return night.
    const atDay = (member: QueryMember, fatigue: number): QueryMember => {
      let known = byFatigue.get(member.hero.id);
      if (known === undefined) {
        known = new Map();
        byFatigue.set(member.hero.id, known);
      }
      const key = `${fatigue}:${captaincy}`;
      let found = known.get(key);
      if (found === undefined) {
        found = reformed(member, { fatigue, captaincy }, deps);
        known.set(key, found);
      }
      return found;
    };
    // The base each Day's Party meets its Synergies as, which read no formed Stat (synergy.ts).
    const party: QueryParty = { members: proposed, content };
    // The Fatigue each proposed Hero would set out with: their own, never a brought-home copy's (DL-282's verification).
    const setOut = new Map(heroes.map((hero) => [hero.id, hero.fatigue]));
    const clock = questClock(quest, sequence.length, config);
    const byDay = new Map<number, QueryParty>();
    const parties = sequence.map((_, index): QueryParty => {
      const day = clock.encounterDay(index);
      let onDay = byDay.get(day);
      if (onDay === undefined) {
        onDay = { members: party.members.map((member) => atDay(member, clock.fatigueAt(index, setOut.get(member.hero.id) ?? 0))), content, base: party };
        byDay.set(day, onDay);
      }
      return onDay;
    });
    return estimateFor(parties, home.world, quest, sequence, deps, carried, passes);
  };
}

/**
 * Each Encounter's pass formula read for the combinations of its Checks' Degrees met so far: the
 * Degree `passDegree` gives a combination, at its number (`combinations`). A cache whose key is every
 * input of `passDegree`, the Encounter's formula and the Degrees, living as long as the estimator
 * that holds it (DL-237, DL-231 item 3).
 */
type Passes = Map<Encounter, Degree[]>;

/**
 * The estimate for a Party brought home on `world` (`homecoming`), meeting `sequence` on `quest`, the
 * Encounter at each place met by `parties`' Party at the same place, the Party on its Day.
 */
function estimateFor(
  parties: readonly QueryParty[],
  world: World,
  quest: Pick<Quest, 'difficulty'>,
  sequence: readonly Encounter[],
  deps: CheckDeps,
  carried: readonly ConsumableRequest[],
  passes: Passes,
): QuestEstimate {
  const { config, content } = deps;
  const kit = carried
    .flatMap(({ definitionKey, quantity }) => {
      const definition = itemDefinition(content, definitionKey);
      return definition?.kind === 'consumable' ? [{ definitionKey, effect: definition.effect, left: quantity }] : [];
    })
    .sort((a, b) => compareByCodeUnit(a.definitionKey, b.definitionKey));
  // A bonus is spent on each Encounter of its kinds while it lasts, whatever the rolls (resolve.ts).
  const rolled = sequence.map((encounter, index) => {
    const bonus = takeBonuses(kit, encounter.kind).reduce((total, it) => total + bonusOf(it), 0);
    const checks = checksOf(parties[index] as QueryParty, encounter, quest, world, deps, bonus);
    let read = passes.get(encounter);
    if (read === undefined) {
      read = [];
      passes.set(encounter, read);
    }
    return { encounter, checks, ...foldedIn(encounter, checks, read) };
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
 * The Guilds, in id order, whose Captain is one of `heroes` (DL-287): sent with them, the Captain is
 * away, and lifts no Morale baseline of their Roster on the nights away (`moraleBaselineFor`).
 */
function captainsAmong(heroes: readonly Hero[], world: Pick<World, 'guilds'>): GuildId[] {
  const guildIds = new Set<GuildId>();
  for (const hero of heroes) {
    const guild = hero.guildId === null ? undefined : rowOf(world.guilds, hero.guildId);
    if (guild !== undefined && guild.captainId === hero.id) guildIds.add(guild.id);
  }
  return [...guildIds].sort(compareByCodeUnit);
}

/**
 * `heroes`, sent on `quest` now, as they come home on its return night (`returnNightOf`): copies of
 * them, each night away from the first night after `world.turn` run on them by the Hero State
 * Engine's own step (`heroNight`), away on `quest`, and a world that holds the copies at the return
 * night's Turn. The copies are in no Party, so each Guild of `captainsAway`, whose Captain goes with
 * them, holds its post empty in that world, as a Captain away lifts no baseline (DL-287).
 * `world` and `heroes` are left as they are.
 */
function homecoming(
  world: World,
  heroes: readonly Hero[],
  quest: Pick<Quest, 'durationTurns' | 'tier'>,
  deps: CheckDeps,
  captainsAway: readonly GuildId[],
): { world: World; heroes: Hero[] } {
  const away = heroes.map((hero) => copyOf(hero));
  const guilds = captainsAway.length === 0 ? world.guilds : { ...world.guilds };
  for (const guildId of captainsAway) guilds[guildId] = { ...requireRow(world.guilds, guildId), captainId: null };
  const home: World = { ...world, guilds, heroes: { ...world.heroes, ...Object.fromEntries(away.map((hero) => [hero.id, hero])) } };
  const returns = returnNightOf(world.turn, quest);
  const first = nightOf(dayOf(world.turn));
  // Each Guild's Captain's lift as the Captain stands as the Party sets out, held for every night away
  // (DL-287): a Captain the pool brought home stays home, so no copy's night moves it, and the estimate
  // is the same whatever the pool.
  const captainLifts = new Map<GuildId, number>();
  for (const hero of away) {
    const guild = hero.guildId === null ? undefined : rowOf(home.guilds, hero.guildId);
    if (guild !== undefined && !captainLifts.has(guild.id)) captainLifts.set(guild.id, captainHomeLift(guild, home, deps.config, deps.content));
  }
  for (let night = first > world.turn ? first : first + turnsPerDay; night < returns; night += turnsPerDay) {
    home.turn = night;
    const ctx = { ...deps, turn: night, emit: eventEmitter(home), captainLifts };
    // The copies are in no Party, so each is marked away on the Quest, or their Fatigue would fall (DL-282).
    for (const hero of away) heroNight(hero, home, ctx, quest);
  }
  home.turn = returns;
  return { world: home, heroes: away };
}

/**
 * A deep copy of `value`, JSON-safe as the document is (data-model rule 6), equal to `structuredClone`'s
 * at a third of its cost: a Rival's Best Party brings its pool home every afternoon (DL-164).
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
 * The formula's Degree for each combination is read once into `read` (`Passes`), by its number; the
 * combinations are met, and their chances summed, in the same order whether read or not, so the sums
 * are the same to the last bit.
 */
function foldedIn(encounter: Encounter, checks: readonly CheckEstimate[], read: Degree[]): { plain: DegreeChances; rerolled: DegreeChances } {
  if (checks.length === 0) throw new RangeError(`Encounter ${JSON.stringify(encounter.key)} has no Check`);
  const pass = passOf(encounter);
  const decided = (code: number): Degree => {
    const known = read[code];
    if (known !== undefined) return known;
    const byKey: Record<CheckKey, Degree> = {};
    checks.forEach((it, place) => {
      byKey[it.key] = degreeAt(code, place);
    });
    const { degree } = passDegree(pass, byKey);
    read[code] = degree;
    return degree;
  };
  const places = checks.map((_, place) => place);
  const plain = noChance();
  const rerolled = noChance();
  for (const first of combinations(checks, places)) {
    const degree = decided(first.code);
    plain[degree] += first.chance;
    if (succeeded(degree)) continue;
    const short = places.filter((place) => !succeeded(degreeAt(first.code, place)));
    // The Checks that succeeded keep their Degrees; those that fell short are rolled again.
    const kept = short.reduce((code, place) => code - degrees.indexOf(degreeAt(code, place)) * 4 ** place, first.code);
    for (const again of combinations(checks, short)) {
      rerolled[decided(kept + again.code)] += first.chance * again.chance;
    }
  }
  return { plain, rerolled };
}

/**
 * Every combination of the Degrees of the Checks of `checks` at `places`, in their order, with a chance
 * above 0, and its chance. A combination's number holds each Check's Degree at its place in
 * `checks`, in base 4 (`degrees`' order: a Failure 0, a Triumph 3), and 0 at every place not among
 * `places`.
 */
function combinations(checks: readonly CheckEstimate[], places: readonly number[]): { code: number; chance: number }[] {
  let combined = [{ code: 0, chance: 1 }];
  for (const place of places) {
    const chances = (checks[place] as CheckEstimate).degrees;
    const next: { code: number; chance: number }[] = [];
    for (const { code, chance } of combined) {
      degrees.forEach((degree, rank) => {
        if (chances[degree] > 0) next.push({ code: code + rank * 4 ** place, chance: chance * chances[degree] });
      });
    }
    combined = next;
  }
  return combined;
}

/** The Degree at `place` of the combination numbered `code` (`combinations`). */
function degreeAt(code: number, place: number): Degree {
  return degrees[Math.floor(code / 4 ** place) % 4] as Degree;
}
