// Read-only selectors over the World State, shared by the front ends and the rules (approach §3):
// what a front end would otherwise work out for itself. They never write, and each reads only the
// part of the world it names, so a caller may pass a partial world.
//
// M1-S9 adds the first three, for the CLI's views; later stories add Rankings, Upkeep and the
// rest beside them. Time's selectors, `ageOf` among them, are in time.ts.

import type { EngineDeps, GameConfig } from './config.js';
import type { ContentSet, DispositionKey, Improvement, Stat } from './content-types.js';
import {
  compareByCodeUnit,
  type FacilityKey,
  type Guild,
  type GuildId,
  type Guildmaster,
  type Hero,
  type Quest,
  type StatValues,
  type World,
} from './document.js';
import { gearModifiers } from './gear.js';
import { feeFactor, guildmasterOf, traitStatBonuses, traitUpkeepFactor } from './guildmaster.js';

/** The Guild the player controls; `undefined` in a world without one. */
export function playerGuild(world: Pick<World, 'guilds'>): Guild | undefined {
  return Object.values(world.guilds).find((guild) => guild.controller.kind === 'player');
}

/**
 * The Disposition that makes `guild`'s choices, or `null` for the Guild whose choices the player
 * makes. Where a Guild's choices come from is one of `plan.md` §1's three accepted exceptions to
 * ADR-0002, and this is the one place the Rival controllers read it (M2-S9, DL-30).
 */
export function dispositionOf(guild: Pick<Guild, 'controller'>): DispositionKey | null {
  return guild.controller.kind === 'rival' ? guild.controller.disposition : null;
}

/**
 * The Unattached pool, in id order: every Hero with `unattachedSince` set. A Hero on no Roster who
 * has left the pool, and whose row an entry kept (data-model rule 8), is not in it (DL-27).
 */
export function unattachedHeroes(world: Pick<World, 'heroes'>): Hero[] {
  return Object.values(world.heroes)
    .filter((hero) => hero.unattachedSince !== null)
    .sort((a, b) => compareByCodeUnit(a.id, b.id));
}

/**
 * What a Guild pays to sign `hero` from the Unattached pool (INPUTS 4.7, DL-27): `signingFeeBase`,
 * plus `signingFeePerLevel` for each Level, plus the sum of the Hero's base Stats divided by
 * `signingFeeStatDivisor`, times the buying Guildmaster's Negotiation (1 − `negotiation`, M4-S5,
 * pre-M0 review B6), rounded down once, at the end, to a whole number. The sum runs over content's
 * Hero Stats through `baseStat`, so a Stat content no longer defines is ignored and one the row
 * lacks reads as the content's default (data-model rule 5).
 *
 * The one place a fee is computed, so every caller pays the same price (R8): `recruit` and
 * `cheapestUnattached` pass the buying Guild's Guildmaster as `buyer`, and so do the front ends
 * when they show the player a fee. With no `buyer` it is the list price, which no Guild pays.
 */
export function signingFee(
  hero: Pick<Hero, 'level' | 'stats'>,
  deps: Pick<EngineDeps, 'config' | 'content'>,
  buyer?: Pick<Guildmaster, 'stats'>,
): number {
  return heroFee(hero, 1, deps, buyer);
}

/**
 * What `buyer`'s Guild pays another Guild to take `hero` from its Roster (M6-S2, R28, INPUTS 7.6,
 * DL-57): the Hero's signing fee before Negotiation times `transferFeeFactor`, times the buying
 * Guildmaster's Negotiation exactly as `signingFee` applies it (DL-43), rounded down once, at the
 * end. The one core both fees share (`heroFee`), so a Transfer is priced by the rule a signing is.
 *
 * `transferIn`, `transferOut` and a Rival's Transfer Offer pass the buying Guild's Guildmaster; with
 * no `buyer` it is the list price, which no Guild pays.
 */
export function transferFee(
  hero: Pick<Hero, 'level' | 'stats'>,
  buyer: Pick<Guildmaster, 'stats'> | undefined,
  deps: Pick<EngineDeps, 'config' | 'content'>,
): number {
  return heroFee(hero, deps.config.transferFeeFactor, deps, buyer);
}

/**
 * The one fee core (DL-43, DL-57): `signingFeeBase`, plus `signingFeePerLevel` for each Level, plus
 * the sum of the Hero's base Stats over `signingFeeStatDivisor`, times `factor` (1 for a signing,
 * `transferFeeFactor` for a Transfer), times the buyer's Negotiation (1 − `negotiation`), rounded
 * down once, at the end.
 */
function heroFee(
  hero: Pick<Hero, 'level' | 'stats'>,
  factor: number,
  deps: Pick<EngineDeps, 'config' | 'content'>,
  buyer: Pick<Guildmaster, 'stats'> | undefined,
): number {
  const { config, content } = deps;
  let statSum = 0;
  for (const stat of Object.values(content.stats)) {
    if (stat.owner === 'hero') statSum += baseStat(hero.stats, stat);
  }
  const list = config.signingFeeBase + config.signingFeePerLevel * hero.level + statSum / config.signingFeeStatDivisor;
  return Math.floor(list * factor * feeFactor(buyer, content, config));
}

/** Why an Unattached Hero refuses to sign for a Guild: its Fame is short of what their Level asks. */
export interface SigningRefusal {
  /** The Fame the Hero asks of a Guild: `fameRequiredPerLevel × (level − 1)`. */
  fameRequired: number;
  /** The Guild's Fame. */
  fame: number;
  /** The Fame the Guild lacks, `fameRequired − fame`: always above 0. */
  shortfall: number;
}

/**
 * Whether `hero` would sign for `guild`: `null` when they would, or why they refuse (M3-S5, R10 as
 * amended, pre-M0 review B4, INPUTS 5.6, DL-38). A Hero refuses a Guild whose Fame is below
 * `fameRequiredPerLevel × (level − 1)`, so a Level 1 Hero signs anywhere; Fame at the threshold is
 * enough. Every Guild is asked alike (ADR-0002).
 *
 * The one test of it: `recruit` refuses `signing-refused` on it, `steady` and the harness's policy
 * pass over the Heroes it refuses (through `cheapestUnattached`), and the CLI's `show pool` marks
 * them. It asks nothing of Wealth, which is the fee's business. The Roster wiped ending does not
 * ask it: a refusal for Fame lasts only until the pool turns over (DL-38).
 */
export function signingRefusal(
  guild: Pick<Guild, 'fame'>,
  hero: Pick<Hero, 'level'>,
  config: Pick<GameConfig, 'fameRequiredPerLevel'>,
): SigningRefusal | null {
  const fameRequired = config.fameRequiredPerLevel * Math.max(0, hero.level - 1);
  if (guild.fame >= fameRequired) return null;
  return { fameRequired, fame: guild.fame, shortfall: fameRequired - guild.fame };
}

/**
 * The Unattached Heroes who would refuse to sign for `guild` (`signingRefusal`), in id order:
 * what the M3 harness counts as signings refused by Fame (DL-38), whether or not the Guild asked.
 */
export function unsignableHeroes(
  world: Pick<World, 'heroes'>,
  guild: Pick<Guild, 'fame'>,
  config: Pick<GameConfig, 'fameRequiredPerLevel'>,
): Hero[] {
  return unattachedHeroes(world).filter((hero) => signingRefusal(guild, hero, config) !== null);
}

/** A Hero in the Unattached pool and the signing fee they ask. */
export interface Hire {
  hero: Hero;
  fee: number;
}

/**
 * The cheapest Hero in the Unattached pool and their fee (`signingFee`), the lowest id among equal
 * fees; `null` when there is none. Given `guild`, the fee is the one it would pay, its
 * Guildmaster's Negotiation applied (M4-S5), and unless `heedFame` is false only a Hero who would
 * sign for it counts (`signingRefusal`), so one who would refuse its Fame is passed over, never
 * asked (M3-S5).
 *
 * The one statement of "the cheapest Hero" (DL-38): `steady` and the harness's policy recruit it
 * for their Guild; the Roster wiped ending asks it for the Guild at the Guild's price with
 * `heedFame` false, pricing a way back by the cheapest Hero in the pool whoever they would sign
 * for, since a refusal for Fame lasts only until the pool turns over (DL-38).
 */
export function cheapestUnattached(
  world: Pick<World, 'heroes' | 'guildmasters'>,
  deps: Pick<EngineDeps, 'config' | 'content'>,
  guild?: Pick<Guild, 'fame' | 'guildmasterId'>,
  heedFame = true,
): Hire | null {
  const buyer = guild === undefined ? undefined : guildmasterOf(guild, world);
  let cheapest: Hire | null = null;
  for (const hero of unattachedHeroes(world)) {
    if (guild !== undefined && heedFame && signingRefusal(guild, hero, deps.config) !== null) continue;
    const fee = signingFee(hero, deps, buyer);
    // The pool is in id order, so a strict comparison keeps the lowest id among equal fees.
    if (cheapest === null || fee < cheapest.fee) cheapest = { hero, fee };
  }
  return cheapest;
}

/**
 * The Quests on offer on the Board, in the Board's order: each id on the Board whose row is there
 * and `offered`. What every chooser of a Quest starts from, `steady` (and fast forward's
 * `decision-needed` through `staffableQuests`) and the harness's policy alike (DL-38).
 */
export function offeredQuests(world: Pick<World, 'board' | 'quests'>): Quest[] {
  const offered: Quest[] = [];
  for (const questId of world.board) {
    const quest = Object.hasOwn(world.quests, questId) ? world.quests[questId] : undefined;
    if (quest !== undefined && quest.status === 'offered') offered.push(quest);
  }
  return offered;
}

/** A Guild statistic the Rankings order by (R10). */
export type RankingMeasure = 'fame' | 'wealth';

/** One Guild's place in the Rankings. */
export interface Ranking {
  guildId: GuildId;
  /** The Guild's Fame or Wealth, whichever the Rankings are by. */
  value: number;
  /** 1 for the first place; each Guild has its own, ties being ordered by Guild id. */
  rank: number;
}

/**
 * The Rankings (R10, `CONTEXT.md`): every Guild in play, the player's and each Rival's alike,
 * ordered by `by` from highest to lowest, ties by Guild id in code-unit order. A folded Guild is
 * not in them (pre-M0 review D6). Computed, never stored (data-model rule 1).
 *
 * Pulled forward from M3-S5 by M2-S10, whose acceptance needs a folded Rival to be absent from
 * them (DL-28); M3-S5 adds the CLI's `show rankings`. Rankings are read, not narrated: no event
 * marks a change of rank, until a front end asks for one (DL-38).
 */
export function rankings(world: Pick<World, 'guilds'>, by: RankingMeasure): Ranking[] {
  return Object.values(world.guilds)
    .filter((guild) => guild.foldedOnTurn === null)
    .sort((a, b) => b[by] - a[by] || compareByCodeUnit(a.id, b.id))
    .map((guild, index) => ({ guildId: guild.id, value: guild[by], rank: index + 1 }));
}

/**
 * A base Stat as the rules read it: the stored value, or the content's default for a Stat the
 * row lacks, such as one added to content after the save was made (data-model rule 5).
 */
export function baseStat(values: StatValues, stat: Pick<Stat, 'key' | 'default'>): number {
  return Object.hasOwn(values, stat.key) ? (values[stat.key] ?? stat.default) : stat.default;
}

/**
 * A Guild's Upkeep (M2-S7, INPUTS 4.6): `wagePerLevel` for each Level of each living Hero on the
 * Roster — a Hero away on a Quest still draws wages, since leaving is what takes a Hero off the
 * Roster (`CONTEXT.md`, Roster) — plus `hallMaintenancePerGrade` for each grade summed over every
 * Hall facility; the sum multiplied by the Guildmaster's `upkeepFactor` Traits (M4-S5, pre-M0
 * review B2) and rounded to a whole Wealth. Computed from the Roster, the Hall and the Guildmaster,
 * never stored (data-model §3.2, rule 1). Filters the Roster to Heroes with neither `diedOnTurn`
 * nor `retiredOnTurn` set: belt and braces over the invariant that a dead or retired Hero already
 * left the Roster (`CONTEXT.md`, Roster; data-model rule 8).
 *
 * The Guild State Engine charges it, and every controller and front end reads it, with `content`,
 * whose Trait rows it needs. Without `content`, or given a Guild or world that lacks its
 * Guildmaster, no Trait applies: the Upkeep as it stood before M4-S5, which tests written before
 * it still ask for (DL-43).
 */
export function upkeep(
  guild: Pick<Guild, 'rosterIds' | 'hall'> & Partial<Pick<Guild, 'guildmasterId'>>,
  world: Pick<World, 'heroes'> & Partial<Pick<World, 'guildmasters'>>,
  config: Pick<GameConfig, 'wagePerLevel' | 'hallMaintenancePerGrade'>,
  content?: Pick<ContentSet, 'traits'>,
): number {
  const wages = guild.rosterIds.reduce((total, heroId) => {
    const hero = Object.hasOwn(world.heroes, heroId) ? world.heroes[heroId] : undefined;
    if (hero === undefined || hero.diedOnTurn !== null || hero.retiredOnTurn !== null) return total;
    return total + config.wagePerLevel * hero.level;
  }, 0);
  const hallGrades = Object.values(guild.hall).reduce((total, grade) => total + grade, 0);
  const listed = wages + config.hallMaintenancePerGrade * hallGrades;
  const { guildmasterId } = guild;
  const { guildmasters } = world;
  if (content === undefined || guildmasters === undefined || guildmasterId === undefined) return listed;
  return Math.round(listed * traitUpkeepFactor(guildmasterOf({ guildmasterId }, { guildmasters }), content));
}

/**
 * `hero`'s effective Stats (data-model rule 1: a selector, never stored; `hero.stats` keeps base
 * values only): each of content's Hero Stats, its base value (`baseStat`, a Stat the row lacks
 * reading content's default), plus the `classStatBonus` Traits of the Guildmaster of the Hero's
 * Guild for the Hero's Class (M4-S5, DL-43), plus the Stat modifiers of the gear the Hero carries in
 * its own slots (`gearModifiers`, M5-S2), held inside the Stat's content range once, after every
 * modifier is added, so the order they are added in never matters (DL-49). A Hero on no Roster has
 * no Guildmaster's bonus; gear counts wherever it is rightly placed, a misplaced Item or one content
 * does not define counting for nothing. Every Guild alike (ADR-0002), so a Rival's Guildmaster's
 * Traits and a Rival's gear work on the Rival's Heroes as the player's work on the player's.
 *
 * The one statement of a Hero's Stats as a Quest assesses them: the Quest Engine's Check reads it
 * (M4-S2, `quest-engine/check.ts`'s `capability`), and `show hero` shows it beside the base. It keeps
 * the epic's signature `(hero, world, content)` and so reads no config: `equip` alone asks which
 * slots `config.gearSlots` lists (DL-49). Any later modifier belongs here too (DL-42 item 9, DL-43
 * item 8, DL-44). Nothing Guild-side reads it: fees, Upkeep and growth read base Stats.
 */
export function effectiveStats(
  hero: Pick<Hero, 'id' | 'stats' | 'classKey' | 'guildId'>,
  world: Pick<World, 'guilds' | 'guildmasters' | 'items' | 'stacks'>,
  content: Pick<ContentSet, 'stats' | 'traits' | 'items'>,
): StatValues {
  const guild = hero.guildId !== null && Object.hasOwn(world.guilds, hero.guildId) ? world.guilds[hero.guildId] : undefined;
  const bonuses = guild === undefined ? {} : traitStatBonuses(guildmasterOf(guild, world), hero.classKey, content);
  const gear = gearModifiers(hero.id, world, content);
  const effective: StatValues = {};
  for (const stat of Object.values(content.stats)) {
    if (stat.owner !== 'hero') continue;
    const bonus = Object.hasOwn(bonuses, stat.key) ? (bonuses[stat.key] ?? 0) : 0;
    const worn = Object.hasOwn(gear, stat.key) ? (gear[stat.key] ?? 0) : 0;
    effective[stat.key] = Math.min(stat.max, Math.max(stat.min, baseStat(hero.stats, stat) + bonus + worn));
  }
  return effective;
}

/**
 * The Improvement that would raise `guild`'s `facility` one grade (M3-S6): content's row for that
 * facility whose grade is the facility's grade now plus one, or `null` when content has none, the
 * facility being at its top grade. `build` builds it and charges its cost; a controller reads its
 * cost before choosing to build.
 */
export function nextImprovement(
  guild: Pick<Guild, 'hall'>,
  facility: FacilityKey,
  content: Pick<ContentSet, 'improvements'>,
): Improvement | null {
  const grade = guild.hall[facility] + 1;
  return Object.values(content.improvements).find((row) => row.facility === facility && row.grade === grade) ?? null;
}

/**
 * What an Injury's Days to heal are multiplied by when it is inflicted on a Hero of `guild`
 * (INPUTS 4.5): `infirmaryHealFactor` at the Guild's infirmary grade now, index 0 being no
 * infirmary, and a grade past the list reading its last factor (DL-29 item 8). The Quest Engine
 * reads it; the defaults give every grade content defines a factor of its own (DL-53).
 */
export function healFactor(guild: Pick<Guild, 'hall'>, config: Pick<GameConfig, 'infirmaryHealFactor'>): number {
  const factors = config.infirmaryHealFactor;
  return factors[Math.min(Math.max(0, guild.hall.infirmary), factors.length - 1)] ?? 1;
}

/**
 * The next Improvement of `facility` (`nextImprovement`) when `guild`'s Wealth is above
 * `wealthMultiple` times its cost and covers it; `null` otherwise, and at the top grade. How a
 * controller decides to build: a Rival with its Disposition's `buildThreshold` (M6-S1, DL-56), the
 * harness's policy with its own multiple (M3-S6, DL-38).
 */
export function affordableImprovement(
  guild: Pick<Guild, 'hall' | 'wealth'>,
  facility: FacilityKey,
  wealthMultiple: number,
  content: Pick<ContentSet, 'improvements'>,
): Improvement | null {
  const next = nextImprovement(guild, facility, content);
  if (next === null || !(guild.wealth > wealthMultiple * next.cost) || guild.wealth < next.cost) return null;
  return next;
}
