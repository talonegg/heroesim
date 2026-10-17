// Read-only selectors over the World State, shared by the front ends and the rules (approach §3):
// what a front end would otherwise work out for itself. They never write, and each reads only the
// part of the world it names, so a caller may pass a partial world.
//
// M1-S9 adds the first three, for the CLI's views; later stories add Rankings, Upkeep and the
// rest beside them. Time's selectors, `ageOf` among them, are in time.ts.

import type { EngineDeps, GameConfig } from './config.js';
import type { ContentSet, DispositionKey, FacilityKey, Improvement, Stat, StatKey } from './content-types.js';
import {
  compareByCodeUnit,
  rowOf,
  type Guild,
  type GuildId,
  type Guildmaster,
  type Hall,
  type Hero,
  type HeroId,
  type Quest,
  type StatValues,
  type Turn,
  type World,
} from './document.js';
import { facilityGrade, facilityUpkeep, hallEffect } from './facilities.js';
import { gearModifiers } from './gear.js';
import { feeFactor, guildmasterOf, traitStatBonuses, traitUpkeepFactor } from './guildmaster.js';
import { dayOf, nightOf } from './time.js';
import { traitStatModifiers } from './traits.js';

/** The Guild the player controls; `undefined` in a world without one. */
export function playerGuild(world: Pick<World, 'guilds'>): Guild | undefined {
  return Object.values(world.guilds).find((guild) => guild.controller.kind === 'player');
}

/**
 * The Disposition that makes `guild`'s choices, or `null` for the Guild whose choices the player
 * makes. Where a Guild's choices come from is one of the accepted exceptions listed in
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
 * The one place a signing fee is computed, so every caller pays the same price (R8): `recruit` and
 * `cheapestUnattached` pass the buying Guild's Guildmaster as `buyer`, and so do the front ends
 * when they show the player a fee. With no `buyer` it is the list price, which no Guild pays.
 */
export function signingFee(
  hero: Pick<Hero, 'level' | 'stats'>,
  deps: Pick<EngineDeps, 'config' | 'content'>,
  buyer?: Pick<Guildmaster, 'stats'>,
): number {
  const { config, content } = deps;
  const list = config.signingFeeBase + config.signingFeePerLevel * hero.level + heroStatSum(hero, content) / config.signingFeeStatDivisor;
  return Math.floor(list * feeFactor(buyer, content, config));
}

/**
 * What `buyer`'s Guild pays another Guild to take `hero` from its Roster at `turn` (Q11, DL-294 item 6,
 * DL-318; R28): the wages left on the Hero's Contract (`wagesLeft`) times `transferFeeFactor`, times
 * `1 +` the premium (`transferPremium`), times the buying Guildmaster's Negotiation exactly as
 * `signingFee` applies it (DL-43), rounded down once, at the end; 0 once the Contract has ended. The
 * Hero's Level and Stats are in it only through the wage they signed for.
 *
 * `transferIn`, `transferOut` and a Rival's Transfer Offer pass the buying Guild's Guildmaster and the
 * world's Turn; with no `buyer` it is the fee before Negotiation, which no Guild pays.
 */
export function transferFee(
  hero: Pick<Hero, 'id' | 'contract'>,
  buyer: Pick<Guildmaster, 'stats'> | undefined,
  turn: Turn,
  deps: Pick<EngineDeps, 'config' | 'content'>,
): number {
  const { config, content } = deps;
  return Math.floor(wagesLeft(hero, turn, config) * config.transferFeeFactor * (1 + transferPremium(hero)) * feeFactor(buyer, content, config));
}

/**
 * The premium on a Hero's Transfer fee (Q11, DL-318): a rule for each Hero, nothing stored on them,
 * giving 0 for now and ready for a mechanic to set it (DL-294's judgement call). `transferFee` adds it to 1.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- the rule is per Hero, though none reads them yet
export function transferPremium(_hero: Pick<Hero, 'id'>): number {
  return 0;
}

/**
 * The sum of `hero`'s base Stats over content's Hero Stats (`baseStat`), what the fees and the wage rule
 * read: a Stat content no longer defines is ignored, and one the row lacks reads as its default (rule 5).
 */
export function heroStatSum(hero: Pick<Hero, 'stats'>, content: Pick<ContentSet, 'stats'>): number {
  let sum = 0;
  for (const stat of Object.values(content.stats)) {
    if (stat.owner === 'hero') sum += baseStat(hero.stats, stat);
  }
  return sum;
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
    const quest = rowOf(world.quests, questId);
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
 * The endings need a folded Rival absent from them (DL-28). Rankings are read, not narrated: no
 * event marks a change of rank, until a front end asks for one (DL-38).
 */
export function rankings(world: Pick<World, 'guilds'>, by: RankingMeasure): Ranking[] {
  return Object.values(world.guilds)
    .filter((guild) => guild.foldedOnTurn === null)
    .sort((a, b) => b[by] - a[by] || compareByCodeUnit(a.id, b.id))
    .map((guild, index) => ({ guildId: guild.id, value: guild[by], rank: index + 1 }));
}

/** One Guild's place in the Rankings, shared with every Guild level with it (v1.0.1-S4, DL-95). */
export interface RankingPlace {
  guildId: GuildId;
  /** The Guild's Fame or Wealth, whichever the Rankings are by. */
  value: number;
  /** 1 for the first place: one more than the Guilds in play with a greater value. */
  place: number;
  /** Whether another Guild in play has the same value, and so the same place. */
  joint: boolean;
}

/**
 * The Rankings as the front ends show them (v1.0.1-S4, DL-95): `rankings`' rows in its order, each
 * Guild's place one more than the Guilds in play with a greater value, so Guilds level on the
 * measure share a place and are marked `joint`. Five Guilds at Fame 0 are all first; Fame 9, 4, 4
 * and 1 place 1st, joint 2nd, joint 2nd and 4th. A folded Guild is not in them, as it is not in
 * `rankings`, which stays as it is: the harness and a module's `ctx.select` read its own ranks.
 */
export function rankingPlaces(world: Pick<World, 'guilds'>, by: RankingMeasure): RankingPlace[] {
  const ranked = rankings(world, by);
  return ranked.map(({ guildId, value }) => ({
    guildId,
    value,
    place: 1 + ranked.filter((other) => other.value > value).length,
    joint: ranked.filter((other) => other.value === value).length > 1,
  }));
}

/** When a Guild below the Bankruptcy floor reaches Bankruptcy, unless its Wealth recovers (DL-95). */
export interface BankruptcyCountdown {
  /** The Day of the night the Guild was first found below the floor: `belowFloorSince`'s Day. */
  sinceDay: number;
  /** The Day on whose night the ending check finds Bankruptcy: `sinceDay` plus `bankruptcyGraceDays`. */
  dueDay: number;
}

/**
 * The Bankruptcy countdown (v1.0.1-S4, DL-95), or `null` while `belowFloorSince` is. It reads only
 * the rule's own input: each night the Guild State Engine, after any Upkeep due, sets
 * `belowFloorSince` to that night's Turn if Wealth is below `bankruptcyFloor` and clears it if not,
 * and later that night the ending check (`endings.ts`) finds Bankruptcy once the Day reaches
 * `sinceDay + bankruptcyGraceDays`. So the countdown stands while Wealth has risen during a Day,
 * until that night's check clears it, and `config` must be the game's own, never a literal: a
 * save plays under its own grace. DL-26 item 3 left `belowFloorSince` silent, with no event, for a
 * front end to read: the front ends read it here.
 */
export function bankruptcyCountdown(
  guild: Pick<Guild, 'belowFloorSince'>,
  config: Pick<GameConfig, 'bankruptcyGraceDays'>,
): BankruptcyCountdown | null {
  if (guild.belowFloorSince === null) return null;
  const sinceDay = dayOf(guild.belowFloorSince);
  return { sinceDay, dueDay: sinceDay + config.bankruptcyGraceDays };
}

/**
 * A base Stat as the rules read it: the stored value, or the content's default for a Stat the
 * row lacks, such as one added to content after the save was made (data-model rule 5).
 */
export function baseStat(values: StatValues, stat: Pick<Stat, 'key' | 'default'>): number {
  return Object.hasOwn(values, stat.key) ? (values[stat.key] ?? stat.default) : stat.default;
}

/**
 * The Heroes a Guild pays for: each living Hero on the Roster, those away on a Quest among them, since
 * leaving is what takes a Hero off the Roster (`CONTEXT.md`, Roster). Filters out a Hero with
 * `diedOnTurn` or `retiredOnTurn` set: belt and braces over the invariant that a dead or retired Hero
 * already left the Roster (data-model rule 8).
 */
function livingRoster(guild: Pick<Guild, 'rosterIds'>, world: Pick<World, 'heroes'>): Hero[] {
  return guild.rosterIds.flatMap((heroId) => {
    const hero = rowOf(world.heroes, heroId);
    return hero === undefined || hero.diedOnTurn !== null || hero.retiredOnTurn !== null ? [] : [hero];
  });
}

/**
 * Each living Hero on the Roster (`livingRoster`) and their Contract's wage, in Roster order: what
 * `guild.wages-paid` names (DL-298, DL-315). The wage was set at signing and is fixed for the term, so a
 * Level gained moves nothing (DL-294 item 6). No Guildmaster Trait scales it (DL-294 item 3, Q17).
 */
export function wageBill(guild: Pick<Guild, 'rosterIds'>, world: Pick<World, 'heroes'>): Record<HeroId, number> {
  const bill: Record<HeroId, number> = {};
  for (const hero of livingRoster(guild, world)) bill[hero.id] = hero.contract?.wage ?? 0;
  return bill;
}

/**
 * A Guild's wages each time they fall due (DL-298, DL-315): the sum of each living Roster Hero's Contract
 * wage (`wageBill`), whole Silver as each is. Computed from the Roster, never stored (data-model §3.2, rule 1).
 */
export function wages(guild: Pick<Guild, 'rosterIds'>, world: Pick<World, 'heroes'>): number {
  return Object.values(wageBill(guild, world)).reduce((total, wage) => total + wage, 0);
}

/** The Hall's upkeep in its parts (`hallUpkeepParts`): what `guild.hall-upkeep-paid` carries and the Treasury shows. */
export interface HallUpkeepParts {
  /** The Guild's own `hallBaseUpkeep`. */
  base: number;
  /** The living Roster, those away included. */
  heroCount: number;
  /** `hallUpkeepPerHero` × `heroCount` ^ `hallUpkeepHeroExponent`, rounded to whole Silver. */
  heroes: number;
  /** Each Facility built, at grade 1 or more, in content's order: its charge (`facilityUpkeep`). */
  facilities: Record<FacilityKey, number>;
  /** The Guildmaster's `upkeepFactor` Traits multiplied together: 1 with none. */
  traitFactor: number;
  /** The parts summed, times the factor, rounded once: what the Guild is charged. */
  total: number;
}

/**
 * A Guild's Hall upkeep with its Improvements', each time it falls due (DL-294 items 2 and 3, DL-298):
 * the Guild's own base; its Heroes' share, `hallUpkeepPerHero` × the living Roster ^
 * `hallUpkeepHeroExponent`, rounded; and each Facility content defines that the Hall has built, its
 * `facilityUpkeep` at its grade, a Facility at grade 0 costing nothing and a Hall key content lacks read
 * by no rule (data-model rule 5). The parts are summed and multiplied by the Guildmaster's `upkeepFactor`
 * Traits, Thrifty and Spendthrift, which scale this alone (Q17), and rounded once to whole Silver, so
 * every part and the total are whole. Computed, never stored; the Guild State Engine charges `total`
 * and the Treasury shows the parts (ADR-0007).
 */
export function hallUpkeepParts(
  guild: Pick<Guild, 'rosterIds' | 'hall' | 'hallBaseUpkeep' | 'guildmasterId'>,
  world: Pick<World, 'heroes' | 'guildmasters'>,
  config: Pick<GameConfig, 'hallUpkeepPerHero' | 'hallUpkeepHeroExponent' | 'improvementUpkeepGradeFactor'>,
  content: Pick<ContentSet, 'facilities' | 'guildmasterTraits'>,
): HallUpkeepParts {
  const base = guild.hallBaseUpkeep;
  const heroCount = livingRoster(guild, world).length;
  const heroes = Math.round(config.hallUpkeepPerHero * heroCount ** config.hallUpkeepHeroExponent);
  const facilities: Record<FacilityKey, number> = {};
  for (const facility of Object.values(content.facilities)) {
    const grade = facilityGrade(guild.hall, facility.key);
    if (grade >= 1) facilities[facility.key] = facilityUpkeep(facility, grade, config);
  }
  const listed = base + heroes + Object.values(facilities).reduce((total, charge) => total + charge, 0);
  const traitFactor = traitUpkeepFactor(guildmasterOf(guild, world), content);
  return { base, heroCount, heroes, facilities, traitFactor, total: Math.round(listed * traitFactor) };
}

/**
 * A Hall upkeep charge, as `guild.hall-upkeep-paid` carries it, split into its two lines of expenses
 * (DL-302, DL-304): the Improvements', the Facilities' charges summed, times the factor, rounded to whole
 * Silver; and the Hall's, the rest of `amount`, so the two sum to the charge exactly. The one split the
 * Treasury's ledger and the harness's wealth counters both read.
 */
export function hallUpkeepSplit({
  amount,
  facilities,
  traitFactor,
}: Pick<HallUpkeepParts, 'facilities' | 'traitFactor'> & { amount: number }): { hall: number; improvements: number } {
  const improvements = Math.round(Object.values(facilities).reduce((total, charge) => total + charge, 0) * traitFactor);
  return { hall: amount - improvements, improvements };
}

/**
 * One Upkeep as every reader of "Upkeeps" counts it (a Rival's hiring budget and reserve, the policy's
 * reserves, the consumables' reserve, the harness's hoarding and months, the Guilds table): a month's
 * costs, three wage charges and one of the Hall's (`hallUpkeepEveryDays` ÷ `upkeepEveryDays` wage charges
 * and one Hall charge), rounded to whole Silver (Q16, DL-294 item 4, DL-300). A measure, not a charge:
 * the Guild State Engine charges `wages` and `hallUpkeepParts`' total, each on its own Day.
 */
export function upkeep(
  guild: Pick<Guild, 'rosterIds' | 'hall' | 'hallBaseUpkeep' | 'guildmasterId'>,
  world: Pick<World, 'heroes' | 'guildmasters'>,
  config: Pick<
    GameConfig,
    'upkeepEveryDays' | 'hallUpkeepEveryDays' | 'hallUpkeepPerHero' | 'hallUpkeepHeroExponent' | 'improvementUpkeepGradeFactor'
  >,
  content: Pick<ContentSet, 'facilities' | 'guildmasterTraits'>,
): number {
  const hall = hallUpkeepParts(guild, world, config, content).total;
  return Math.round((wages(guild, world) * config.hallUpkeepEveryDays) / config.upkeepEveryDays + hall);
}

/**
 * The Day on whose night a charge falling every `every` Days next falls, once Turn `turn` has been
 * played: the first Day from `turn`'s whose night is after `turn` and which ends a run of `every` Days
 * counted from Day 0 (DL-26). On a charge's night itself, once played, it is the next one.
 */
function nextDayOfEvery(turn: Turn, every: number): number {
  const day = dayOf(turn);
  const due = day + ((every - 1 - (day % every)) % every);
  return nightOf(due) > turn ? due : due + every;
}

/**
 * The Day on whose night the wages next fall due, once Turn `turn` has been played (M9-F1, DL-112
 * item 3, DL-298): Days 9, 19, 29 and so on by default (DL-26). The Guild State Engine charges them
 * by this rule, and the Treasury shows it.
 */
export function nextWagesDay(turn: Turn, config: Pick<GameConfig, 'upkeepEveryDays'>): number {
  return nextDayOfEvery(turn, config.upkeepEveryDays);
}

/**
 * The Day on whose night the Hall's upkeep with its Improvements' next falls due, once Turn `turn` has
 * been played (DL-298): Days 29, 59, 89 and so on by default, counted as the wages' are (DL-26), so that
 * Day 29 charges both. The Guild State Engine charges it by this rule, and the Treasury shows it.
 */
export function nextHallUpkeepDay(turn: Turn, config: Pick<GameConfig, 'hallUpkeepEveryDays'>): number {
  return nextDayOfEvery(turn, config.hallUpkeepEveryDays);
}

/**
 * The wages left on `hero`'s Contract at `turn` (DL-317): its wage × the wage charges whose night is still
 * to come and falls before its end Day, since the night of the end Day reprices the wage and charges that
 * (`outOfContractWage`, DL-316). 0 once the Contract has ended, and for a Hero with none. Counted by
 * `nextWagesDay`, so a charge due tonight is still left until the night has been played. Whole Silver, as
 * the wage is. The one count the release payout reads (`releasePayout`), and the Transfer fee after it.
 */
export function wagesLeft(hero: Pick<Hero, 'contract'>, turn: Turn, config: Pick<GameConfig, 'upkeepEveryDays'>): number {
  if (hero.contract === null) return 0;
  const first = nextWagesDay(turn, config);
  const { wage, endDay } = hero.contract;
  return first >= endDay ? 0 : wage * (Math.floor((endDay - 1 - first) / config.upkeepEveryDays) + 1);
}

/**
 * What a Guild pays to release `hero` at `turn` (Q10, DL-294 item 6, DL-317): `releasePayoutFactor` × the
 * wages left (`wagesLeft`), rounded down once, at the end, to whole Silver as a Market sale is (`sellPrice`);
 * 0 once the Contract has ended. The one price the `release` action charges and the front ends show.
 */
export function releasePayout(
  hero: Pick<Hero, 'contract'>,
  turn: Turn,
  config: Pick<GameConfig, 'upkeepEveryDays' | 'releasePayoutFactor'>,
): number {
  return Math.floor(config.releasePayoutFactor * wagesLeft(hero, turn, config));
}

/**
 * What releasing the Guild's last Hero would leave (the owner, Q-B, DL-317): the payout, the Wealth after
 * it, the cheapest signing fee the Guild would then meet and whether that Wealth covers it. The Roster
 * would be empty with Wealth short of every fee in the pool, which is the "Roster wiped" ending
 * (`endings`): for the player's Guild the game ends. The fees read include the released Hero's, who joins
 * the pool tonight, and not the Fame a Hero asks (DL-38), as the ending reads it. `null` unless `hero` is the
 * Guild's only Hero on the Roster. A warning only: the engine refuses nothing for it, and a Rival's or the
 * policy's release is made without asking it.
 */
export interface ReleaseWarning {
  payout: number;
  wealthAfter: number;
  cheapestFee: number;
  covers: boolean;
}

/** `hero`'s release as a warning, or `null` when they are not the Guild's last Hero (`ReleaseWarning`). */
export function releaseWarning(
  world: Pick<World, 'heroes' | 'guildmasters' | 'turn'>,
  deps: Pick<EngineDeps, 'config' | 'content'>,
  guild: Pick<Guild, 'rosterIds' | 'wealth' | 'fame' | 'guildmasterId'>,
  hero: Pick<Hero, 'id' | 'contract' | 'level' | 'stats'>,
): ReleaseWarning | null {
  if (guild.rosterIds.length !== 1 || guild.rosterIds[0] !== hero.id) return null;
  const payout = releasePayout(hero, world.turn, deps.config);
  const wealthAfter = guild.wealth - payout;
  const pooled = cheapestUnattached(world, deps, guild, false)?.fee ?? Number.POSITIVE_INFINITY;
  const cheapestFee = Math.min(pooled, signingFee(hero, deps, guildmasterOf(guild, world)));
  return { payout, wealthAfter, cheapestFee, covers: wealthAfter >= cheapestFee };
}

/** What moves a Hero's Stat from its base (v1.1.6-S13), in the order `statBreakdown` adds them. */
export type StatSource = 'classBonus' | 'gear' | 'traits';

/**
 * One Hero Stat taken apart (v1.1.6-S13, DL-186 item 3): its base, each source with what it adds, in
 * the order added, every source listed though it adds 0, the effective value a Check reads, and
 * whether the Stat's range held it.
 */
export interface StatParts {
  base: number;
  sources: readonly { source: StatSource; change: number }[];
  effective: number;
  /** Whether the base and the sources summed outside the Stat's range, and the effective value is its bound. */
  clamped: boolean;
}

/** A Hero's Stats taken apart, keyed by Stat in content's order: `statBreakdown`'s. */
export type StatBreakdown = Record<StatKey, StatParts>;

/** The value of `key` in a sum by Stat, 0 for a Stat it has no entry for. */
function sumOf(by: Record<StatKey, number>, key: StatKey): number {
  return Object.hasOwn(by, key) ? (by[key] ?? 0) : 0;
}

/**
 * `hero`'s Stats taken apart (v1.1.6-S13, DL-186 item 3; data-model rule 1: a selector, never
 * stored; `hero.stats` keeps base values only): each of content's Hero Stats, its base value
 * (`baseStat`, a Stat the row lacks reading content's default), plus the `classStatBonus` Traits of
 * the Guildmaster of the Hero's Guild for the Hero's Class (M4-S5, DL-43), plus the Stat modifiers of
 * the gear the Hero carries in its own slots (`gearModifiers`, M5-S2), plus the `statModifiers` of the
 * Hero Traits the Hero holds (`traitStatModifiers`, v1.1.4-S7, DL-148 item 24), added in that order
 * and held inside the Stat's content range once, after every source is added (DL-49). A Hero on no
 * Roster has no Guildmaster's bonus; gear counts wherever it is rightly placed, a misplaced Item or
 * one content does not define counting for nothing. Every Guild alike (ADR-0002), so a Rival's
 * Guildmaster's Traits and a Rival's gear work on the Rival's Heroes as the player's work on the
 * player's.
 *
 * `effectiveStats` is its total. The page's Roster and a Hero's page put it in words; nothing else
 * does a source's sum. It keeps the epic's signature `(hero, world, content)` and so reads no config:
 * `equip` alone asks whether a slot is a gear slot (DL-49). Any later modifier belongs here too
 * (DL-42 item 9, DL-43 item 8, DL-44).
 */
export function statBreakdown(
  hero: Pick<Hero, 'id' | 'stats' | 'classKey' | 'guildId' | 'traits'>,
  world: Pick<World, 'guilds' | 'guildmasters' | 'items' | 'stacks'>,
  content: Pick<ContentSet, 'stats' | 'guildmasterTraits' | 'heroTraits' | 'items'>,
): StatBreakdown {
  const guild = hero.guildId !== null ? rowOf(world.guilds, hero.guildId) : undefined;
  const bonuses = guild === undefined ? {} : traitStatBonuses(guildmasterOf(guild, world), hero.classKey, content);
  const gear = gearModifiers(hero.id, world, content);
  const marks = traitStatModifiers(hero, content);
  const breakdown: StatBreakdown = {};
  for (const stat of Object.values(content.stats)) {
    if (stat.owner !== 'hero') continue;
    const base = baseStat(hero.stats, stat);
    const bonus = sumOf(bonuses, stat.key);
    const worn = sumOf(gear, stat.key);
    const marked = sumOf(marks, stat.key);
    // Added left to right and held once, as `effectiveStats` always has: a Check's draws read it.
    const sum = base + bonus + worn + marked;
    const effective = Math.min(stat.max, Math.max(stat.min, sum));
    breakdown[stat.key] = {
      base,
      sources: [
        { source: 'classBonus', change: bonus },
        { source: 'gear', change: worn },
        { source: 'traits', change: marked },
      ],
      effective,
      clamped: effective !== sum,
    };
  }
  return breakdown;
}

/**
 * `hero`'s effective Stats: `statBreakdown`'s total, each Stat's effective value, keyed by Stat in
 * content's order (v1.1.6-S13, DL-186 item 3).
 *
 * The one statement of a Hero's Stats as a Quest assesses them: the Quest Engine's Check reads it
 * (M4-S2, `quest-engine/check.ts`'s `capability`), and `show hero` shows it beside the base. Nothing
 * Guild-side reads it: fees, Upkeep and growth read base Stats.
 */
export function effectiveStats(
  hero: Pick<Hero, 'id' | 'stats' | 'classKey' | 'guildId' | 'traits'>,
  world: Pick<World, 'guilds' | 'guildmasters' | 'items' | 'stacks'>,
  content: Pick<ContentSet, 'stats' | 'guildmasterTraits' | 'heroTraits' | 'items'>,
): StatValues {
  const effective: StatValues = {};
  for (const [key, parts] of Object.entries(statBreakdown(hero, world, content))) effective[key] = parts.effective;
  return effective;
}

/**
 * The Improvement that would raise `guild`'s `facility` one grade: content's row for that Facility
 * whose grade is the Facility's grade now plus one, or `null` when content has none, the Facility
 * being at its top grade. `build` builds it and charges its cost; a controller reads its cost before
 * choosing to build.
 */
export function nextImprovement(
  guild: Pick<Guild, 'hall'>,
  facility: FacilityKey,
  content: Pick<ContentSet, 'improvements'>,
): Improvement | null {
  const grade = facilityGrade(guild.hall, facility) + 1;
  return Object.values(content.improvements).find((row) => row.facility === facility && row.grade === grade) ?? null;
}

/**
 * What an Injury's Days to heal are multiplied by when it is inflicted on a Hero of a Guild with
 * `hall` (INPUTS 4.5): the Hall's `healFactor` effect (`hallEffect`, DL-294 item 3), 1 where no
 * Facility has it. A Hero on no Roster reads an empty Hall. The Quest Engine and the modules' `injure`
 * read it.
 */
export function healFactor(hall: Readonly<Hall>, content: Pick<ContentSet, 'facilities' | 'improvements'>): number {
  return hallEffect(hall, 'healFactor', content);
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
