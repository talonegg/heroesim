// Rival controllers (M2-S9, ADR-0002, INPUTS 4.12 and 7.5): what a Rival Guild chooses, as the same
// `Action` values a player's front end produces. The afternoon's `rivalControllers` phase applies
// them through the rules the player's actions run (`applyGuildAction`), so a Rival plays by the
// player's rules and meets the player's rejections. A Disposition is a content row of weights
// (`dispositions.json`), and one rule reads them for every Rival (M6-S1, DL-56): four named
// Dispositions are four rows, not four code paths, and a fifth row plays with no change here. The
// choices were DL-30's for `steady`; DL-56 turns them into weights. M6-S2 adds Transfers: a Rival
// seeks a Hero from another Guild, lets one go when in debt, and answers a Transfer asked of it by its
// Disposition (`transferAnswer`, DL-57). M6-S4 has it build every facility of its Hall and buy gear
// at the Market, armour first, by its `buildThreshold` and `gearThreshold` (DL-58). M6-S3's Transfer
// Generator asks `transferBid` which of two Rivals bids for which Hero of the other (DL-59).
//
// A rule reads the world and writes nothing to it but the draws it takes from the `rivals`
// stream, `world.rng.rivals`, and from no other (ADR-0009).

import type { GuildAction } from '../actions/action.js';
import { dispatchRefusal, unavailability, type DispatchAction } from '../actions/dispatch.js';
import type { TransferInAction } from '../actions/transfer.js';
import type { EngineDeps } from '../config.js';
import type { ContentSet, Disposition, SlotKey } from '../content-types.js';
import { compareByCodeUnit, facilityKeys, type Guild, type Hero, type HeroId, type Quest, type World } from '../document.js';
import { gearChoices, gearPurchase } from '../gear.js';
import { streamOf } from '../generators/draw.js';
import { guildmasterOf } from '../guildmaster.js';
import { questEstimator, type QuestEstimate } from '../quest-engine/estimate.js';
import { chance, pick } from '../rng.js';
import { transferLock } from '../transfer.js';
import {
  affordableImprovement,
  cheapestUnattached,
  dispositionOf,
  offeredQuests,
  transferFee,
  upkeep,
} from '../selectors.js';

/**
 * The actions `guild` takes this afternoon, in the order to apply them, by the one rule every
 * Disposition shares, reading the weights of its row (M6-S1, DL-56):
 *
 * 1. put the gear its Guild holds on its Heroes with the slot empty (`gearChoices`, M5-S2, DL-49),
 *    which moves no Wealth and sends no one;
 * 2. dispatch to the Quest its `questRiskAppetite` prefers among those it can staff
 *    (`preferredQuest`), drawing from `rivals` to choose among Quests of the same difficulty;
 * 3. make one purchase, the first of these that applies:
 *    - build the next grade of the first facility of its Hall, in the Hall's order (the infirmary,
 *      the training yard, the quarters), whose next grade's cost its Wealth is above `buildThreshold`
 *      times (`hallBuild`: M3-S6 built the infirmary alone, M6-S4 every facility);
 *    - buy one piece of gear at the Market for its Heroes who lack it, armour first, then the other
 *      slots in `config.gearSlots`'s order: the dearest whose price its Wealth is above `gearThreshold`
 *      times (`gearBuy`, the engine's `gearPurchase`, M6-S4);
 *    - while it would hire (`hiringBudget`: its Wealth above `recruitThreshold` times its Upkeep, or
 *      its Roster below `rivalRosterMin` with `rivalHireReserveUpkeeps` Upkeeps to keep, DL-60) and its
 *      Roster has room enough by `transferAppetite`, seek the Hero it wants from another Guild with the
 *      chance `transferAppetite`, one draw from `rivals` (`transferChoice`, M6-S2): `transferIn` from a
 *      Guild whose Disposition consents, or a Transfer Offer to a Guild whose controller answers for
 *      itself;
 *    - recruit the cheapest Unattached Hero who would sign while it would hire, for no more than it
 *      would spend (`cheapestHire`);
 *    - while it is in debt (`belowFloorSince`), transfer its dearest Hero at home to the Guild that
 *      pays most for them and consents (`debtTransfer`, `transferOut`, M6-S2).
 *
 * At most one dispatch and one purchase an afternoon. The dispatch and the purchase do not depend on
 * each other: a dispatch moves no Wealth and a purchase sends no one, so both are chosen on the same
 * world (a Hero is transferred out only if the dispatch leaves them at home); one purchase, so that the second
 * never finds the Wealth the first spent. The gear bought waits in the Guild's holding for the next
 * afternoon's first choice, the equip, as the policy's does (DL-54).
 *
 * None for the player's Guild, whose choices are the player's; none for a folded Guild, which has
 * left play (M2-S10); and none for a Disposition content does not define (data-model rule 5: the
 * validator warns, rules ignore it). It changes nothing in `world` but `world.rng.rivals`, which
 * advances one draw for each dispatch it chooses and one each time it weighs a Transfer.
 */
export function rivalChoices(world: World, guild: Guild, deps: EngineDeps): GuildAction[] {
  if (guild.foldedOnTurn !== null) return [];
  const disposition = chooser(guild, deps.content);
  if (disposition === 'own' || disposition === null) return [];

  const choices: GuildAction[] = [...gearChoices(world, guild, deps)];
  const quest = preferredQuest(world, guild, disposition, deps);
  if (quest !== null) choices.push(quest);
  const purchase =
    hallBuild(guild, disposition, deps) ??
    gearBuy(world, guild, disposition, deps) ??
    transferChoice(world, guild, disposition, deps) ??
    cheapestHire(world, guild, deps) ??
    debtTransfer(world, guild, new Set(quest?.heroIds ?? []), deps);
  if (purchase !== null) choices.push(purchase);
  return choices;
}

/**
 * What makes `guild`'s choices: its Disposition's row; `'own'` for a Guild with no Disposition,
 * whose controller makes its own choices through the actions (the player's, ADR-0002); or `null` for
 * a Disposition content does not define (data-model rule 5). The one place the Rival controllers
 * read where a Guild's choices come from (`dispositionOf`, `plan.md` §1), for their own choices and
 * for a Guild's answer to a Transfer asked of it (`transferAnswer`), which is a choice too.
 */
function chooser(guild: Pick<Guild, 'controller'>, content: Pick<ContentSet, 'dispositions'>): Disposition | 'own' | null {
  const key = dispositionOf(guild);
  if (key === null) return 'own';
  return Object.hasOwn(content.dispositions, key) ? (content.dispositions[key] as Disposition) : null;
}

// ── Transfers (M6-S2, R28, DL-57) ──────────────────────────────────────────────────────────────

/**
 * Which way a Transfer asked of a Guild would go for it: `out`, a Hero of its Roster leaving it (what
 * `transferIn` asks of the other Guild), or `in`, a Hero joining it (what `transferOut` asks).
 */
export type TransferSide = 'out' | 'in';

/**
 * Why a Guild refuses a Transfer asked of it:
 * - `roster-size`: the Heroes it would keep through the deal times its `transferAppetite` are fewer
 *   than one, too few for its appetite (an appetite of 0 never deals);
 * - `wealth`: asked to take a Hero in, it would not hire now (`hiringBudget`): its Wealth not above
 *   `recruitThreshold` times its Upkeep, nor its Roster below `rivalRosterMin` with Wealth to spare;
 * - `unknown-disposition`: its Disposition is not one content defines, and makes no choice (rule 5);
 * - `answers-offers`: it has no Disposition; its controller answers for itself, through a Transfer
 *   Offer (`offerTransfer`, then `acceptTransfer` or `declineTransfer`), never at once.
 */
export type TransferRefusalReason = 'roster-size' | 'wealth' | 'unknown-disposition' | 'answers-offers';

/** How a Guild answers a Transfer asked of it now: it consents, or refuses and says why. */
export type TransferAnswer = { consents: true } | { consents: false; because: TransferRefusalReason };

/**
 * Whether `guild` consents now to the `side` of a Transfer (M6-S2: "its disposition's
 * `transferAppetite` and its Roster size allow", DL-57). A Guild with a Disposition answers by its
 * row, the one rule for every Disposition:
 *
 * - it deals only while the Heroes it keeps through the deal (its Roster less the Hero when one goes
 *   out, its whole Roster when one comes in) times `transferAppetite` reach one: an appetite of 0.25
 *   lets a Hero go from a Roster of five and takes one into a Roster of four, 0.75 from three and into
 *   two, and 1 lets any Hero go but its last;
 * - it takes a Hero in only while it would hire (`hiringBudget`, as `cheapestHire` reads it: its
 *   Wealth above `recruitThreshold` times its Upkeep, or its Roster below `rivalRosterMin` and its
 *   Wealth above `rivalHireReserveUpkeeps` Upkeeps, DL-60). Whether it can pay the fee is the action's
 *   to check.
 *
 * A Guild with no Disposition answers `answers-offers`: its controller answers for itself, through an
 * offer (ADR-0002: what differs is the controller). Reads, never writes, and draws nothing.
 */
export function transferAnswer(
  world: Pick<World, 'heroes' | 'guildmasters'>,
  guild: Guild,
  side: TransferSide,
  deps: Pick<EngineDeps, 'config' | 'content'>,
): TransferAnswer {
  const disposition = chooser(guild, deps.content);
  if (disposition === 'own') return { consents: false, because: 'answers-offers' };
  if (disposition === null) return { consents: false, because: 'unknown-disposition' };
  const kept = side === 'out' ? guild.rosterIds.length - 1 : guild.rosterIds.length;
  if (!(kept * disposition.transferAppetite >= 1)) return { consents: false, because: 'roster-size' };
  if (side === 'in' && hiringBudget(world, guild, disposition, deps) === null) return { consents: false, because: 'wealth' };
  return { consents: true };
}

/**
 * The most `guild` would spend on one hire now, from the pool or by Transfer, or `null` when it would
 * hire no one (DL-56, DL-60). Two reasons to hire, one rule for every Disposition:
 *
 * - **choice**: while its Wealth is above its Disposition's `recruitThreshold` times its Upkeep, it
 *   hires as its row says, spending up to all its Wealth (DL-56's rule);
 * - **need**: while its Roster is below `rivalRosterMin`, the fewest Heroes a Rival is founded with,
 *   it hires back towards it with what it holds above `rivalHireReserveUpkeeps` times its Upkeep, so
 *   that a Rival whose threshold its Levels and Hall have raised out of reach (DL-58) still replaces
 *   the Heroes it loses, and keeps enough to pay its way.
 *
 * Reads, never writes, and draws nothing.
 */
function hiringBudget(
  world: Pick<World, 'heroes'>,
  guild: Guild,
  disposition: Disposition,
  deps: Pick<EngineDeps, 'config' | 'content'>,
): number | null {
  const upkeepNow = upkeep(guild, world, deps.config, deps.content);
  if (guild.wealth > disposition.recruitThreshold * upkeepNow) return guild.wealth;
  if (guild.rosterIds.length >= deps.config.rivalRosterMin) return null;
  const spare = guild.wealth - deps.config.rivalHireReserveUpkeeps * upkeepNow;
  return spare > 0 ? spare : null;
}

/** `hiringBudget` for a Guild whatever its controller: `null` for one with no Disposition content defines. */
function budgetOf(world: Pick<World, 'heroes'>, guild: Guild, deps: Pick<EngineDeps, 'config' | 'content'>): number | null {
  const disposition = chooser(guild, deps.content);
  return disposition === 'own' || disposition === null ? null : hiringBudget(world, guild, disposition, deps);
}

/** The Guilds in play but `guild`, in id order. */
function otherGuilds(world: Pick<World, 'guilds'>, guild: Pick<Guild, 'id'>): Guild[] {
  return Object.values(world.guilds)
    .filter((other) => other.id !== guild.id && other.foldedOnTurn === null)
    .sort((a, b) => compareByCodeUnit(a.id, b.id));
}

/**
 * The Heroes on `guild`'s Roster a Transfer could move now, in Roster order: those in no Party and not
 * held by a recent Transfer (`transferLock`, DL-60), so that a Rival never names a Hero the Transfer
 * actions refuse, and no Rival buys back, or sells on, a Hero bought within the lock.
 */
function transferable(world: Pick<World, 'heroes' | 'turn'>, guild: Pick<Guild, 'rosterIds'>, config: EngineDeps['config']): Hero[] {
  return guild.rosterIds.flatMap((heroId) => {
    const hero = Object.hasOwn(world.heroes, heroId) ? world.heroes[heroId] : undefined;
    return hero !== undefined && hero.partyId === null && transferLock(hero, world.turn, config) === null ? [hero] : [];
  });
}

/**
 * A Transfer `guild` seeks this afternoon, or `null` (M6-S2, DL-57). Only while it would hire by
 * its own answer (`transferAnswer`, `in`) and has no Transfer Offer of its own awaiting an answer.
 * The Hero it wants is the dearest it would pay for (`transferFee` at its Guildmaster's
 * Negotiation, no more than `hiringBudget`, the lowest Hero id among equal fees) among the Heroes a
 * Transfer could move now on the Rosters of the other Guilds in play that would part with one: a
 * Guild whose Disposition consents to let one go, or one that answers offers. When there is such a
 * Hero, a draw from `rivals` decides, with the chance `transferAppetite`, whether it seeks them
 * this afternoon, so that its appetite is the share of its hiring it does by Transfer; it does so
 * by `transferIn` from a consenting Guild, or by a Transfer Offer to one that answers for itself
 * (`offerTransfer`). No draw when there is no such Hero.
 */
function transferChoice(world: World, guild: Guild, disposition: Disposition, deps: EngineDeps): GuildAction | null {
  const budget = hiringBudget(world, guild, disposition, deps);
  if (budget === null || !transferAnswer(world, guild, 'in', deps).consents) return null;
  if (Object.values(world.offers).some((offer) => offer.toGuildId === guild.id)) return null;
  const sellers = otherGuilds(world, guild).flatMap((other) => {
    const answer = transferAnswer(world, other, 'out', deps);
    return answer.consents || answer.because === 'answers-offers' ? [{ guild: other, byOffer: !answer.consents }] : [];
  });
  const wanted = dearestWanted(world, guild, sellers, budget, deps);
  if (wanted === null || !chance(streamOf(world, 'rivals'), disposition.transferAppetite)) return null;
  const heroId = wanted.hero.id;
  return wanted.byOffer ? { kind: 'offerTransfer', guildId: guild.id, heroId } : { kind: 'transferIn', guildId: guild.id, heroId };
}

/**
 * The Hero `buyer` wants of those `sellers` hold, or `null`: the dearest it would pay for
 * (`transferFee` at its Guildmaster's Negotiation, no more than `budget`), the lowest Hero id among
 * equal fees, among the Heroes on the sellers' Rosters a Transfer could move now (`transferable`:
 * in no Party, not held by a recent Transfer). With it, whether their Guild answers only offers
 * (`byOffer`), as the seller was given. Reads, never writes, and draws nothing. The one statement
 * of whom a Rival wants, for its afternoon's `transferChoice` and the Transfer Generator's bid
 * (`transferBid`).
 */
function dearestWanted(
  world: Pick<World, 'heroes' | 'guildmasters' | 'turn'>,
  buyer: Guild,
  sellers: readonly { guild: Guild; byOffer: boolean }[],
  budget: number,
  deps: Pick<EngineDeps, 'config' | 'content'>,
): { hero: Hero; byOffer: boolean } | null {
  const guildmaster = guildmasterOf(buyer, world);
  let wanted: { hero: Hero; fee: number; byOffer: boolean } | null = null;
  for (const { guild, byOffer } of sellers) {
    for (const hero of transferable(world, guild, deps.config)) {
      const fee = transferFee(hero, guildmaster, deps);
      if (fee > budget) continue;
      if (wanted === null || fee > wanted.fee || (fee === wanted.fee && compareByCodeUnit(hero.id, wanted.hero.id) < 0)) {
        wanted = { hero, fee, byOffer };
      }
    }
  }
  return wanted;
}

/**
 * The Transfer Generator's bid between two Rivals (M6-S3, DL-59), or `null`. The one of `pair` whose
 * Disposition has the greater `transferAppetite` is the bidder — of two alike, the one with fewer
 * Heroes on its Roster, then the lower Guild id — and bids by `transferIn` for the Hero of the other
 * it wants (`dearestWanted`: the dearest it would pay for, `hiringBudget`, at home). It bids only when:
 *
 * - the Transfer keeps both Rosters within the range a Rival is generated with: the bidder's below
 *   `rivalRosterMax` and the other's above `rivalRosterMin`, so the Generator's own moves never take a
 *   Roster out of it (the epic's box, DL-59);
 * - both answer as they answer any Transfer asked of them (`transferAnswer`, DL-57), the consent
 *   rule every Transfer keeps: the other lets a Hero go (`out`: its appetite and its Roster size), the
 *   consent `transferIn` itself asks, and the bidder takes one in (`in`: its appetite and its Roster
 *   size, and a Wealth at which it would hire, `hiringBudget`). A bid is a hire, and a Rival
 *   hires only while its Disposition would: M6-S3's measure found a Generator that bid without that
 *   Wealth doubling `ambitious`'s folds over twenty years (DL-59).
 *
 * `null` too when either Guild has no Disposition content defines. Whether the pair deals this night
 * at all is the Generator's draw (phases/transfers.ts), not this rule's: this reads, never writes,
 * and draws nothing.
 */
export function transferBid(world: World, pair: readonly [Guild, Guild], deps: EngineDeps): TransferInAction | null {
  const [a, b] = pair;
  const rowA = chooser(a, deps.content);
  const rowB = chooser(b, deps.content);
  if (rowA === 'own' || rowA === null || rowB === 'own' || rowB === null) return null;
  const aBids =
    rowA.transferAppetite !== rowB.transferAppetite
      ? rowA.transferAppetite > rowB.transferAppetite
      : a.rosterIds.length !== b.rosterIds.length
        ? a.rosterIds.length < b.rosterIds.length
        : compareByCodeUnit(a.id, b.id) < 0;
  const [bidder, seller] = aBids ? [a, b] : [b, a];
  const { rivalRosterMin, rivalRosterMax } = deps.config;
  if (!(bidder.rosterIds.length < rivalRosterMax && seller.rosterIds.length > rivalRosterMin)) return null;
  if (!transferAnswer(world, bidder, 'in', deps).consents || !transferAnswer(world, seller, 'out', deps).consents) return null;
  const budget = hiringBudget(world, bidder, aBids ? rowA : rowB, deps);
  if (budget === null) return null;
  const wanted = dearestWanted(world, bidder, [{ guild: seller, byOffer: false }], budget, deps);
  return wanted === null ? null : { kind: 'transferIn', guildId: bidder.id, heroId: wanted.hero.id };
}

/**
 * A Transfer out `guild` makes to pay its way while it is in debt (`belowFloorSince` set, M2-S7),
 * or `null` (M6-S2, DL-57): only when its own Disposition would let a Hero go (`transferAnswer`,
 * `out`), its dearest Hero in no Party, not in `dispatched` and not held by a recent Transfer, to
 * the Guild in play that consents to take them in, would pay (`hiringBudget`), and pays most, by
 * `transferOut`: the dearest fee first, then the lowest Hero id, then the lowest Guild id. A Guild
 * that answers offers is never offered one, since that would need an offer the other way, which the
 * first build does not make. Draws nothing.
 */
function debtTransfer(world: World, guild: Guild, dispatched: ReadonlySet<HeroId>, deps: EngineDeps): GuildAction | null {
  if (guild.belowFloorSince === null || !transferAnswer(world, guild, 'out', deps).consents) return null;
  const heroes = transferable(world, guild, deps.config).filter((hero) => !dispatched.has(hero.id));
  let best: { heroId: HeroId; toGuildId: Guild['id']; fee: number } | null = null;
  for (const other of otherGuilds(world, guild)) {
    const budget = budgetOf(world, other, deps);
    if (budget === null || !transferAnswer(world, other, 'in', deps).consents) continue;
    const guildmaster = guildmasterOf(other, world);
    for (const hero of heroes) {
      const fee = transferFee(hero, guildmaster, deps);
      if (fee > budget) continue;
      if (best === null || fee > best.fee || (fee === best.fee && compareByCodeUnit(hero.id, best.heroId) < 0)) {
        best = { heroId: hero.id, toGuildId: other.id, fee };
      }
    }
  }
  return best === null ? null : { kind: 'transferOut', guildId: guild.id, heroId: best.heroId, toGuildId: best.toGuildId };
}

/**
 * The Heroes of `guild` free to go on a Quest, in Roster order: on the Roster and neither dead,
 * retired, injured nor away in a Party, by `dispatch`'s own test (`unavailability`).
 */
export function availableHeroes(world: Pick<World, 'heroes'>, guild: Pick<Guild, 'rosterIds'>): Hero[] {
  const heroes: Hero[] = [];
  for (const heroId of guild.rosterIds) {
    const hero = Object.hasOwn(world.heroes, heroId) ? world.heroes[heroId] : undefined;
    if (hero !== undefined && unavailability(hero) === null) heroes.push(hero);
  }
  return heroes;
}

/**
 * The Quests on offer on the Board that `guild` could staff now, in the Board's order: those for
 * which `dispatch` would send some Party of its Heroes (`staffingParty`). Fast forward's
 * `decision-needed` and `quest-staffable` read it (M2-S11, DL-33; M9-S1, DL-101), so a stop, a
 * Rival and `dispatch` agree on what can be staffed.
 */
export function staffableQuests(world: World, guild: Guild, deps: EngineDeps): Quest[] {
  const available = availableHeroes(world, guild);
  if (available.length === 0) return [];
  return offeredQuests(world).filter((quest) => staffingParty(world, guild, quest, available, deps) !== null);
}

/**
 * A Party of `available`, `guild`'s free Heroes, that `dispatch` would send on `quest` as it stands,
 * or `null` when there is none (M9-S1, DL-101). The search is `partyFor`'s own first step, the Party
 * its requirements take (`requiredParty`), and the verdict is `dispatch`'s own (`dispatchRefusal`,
 * with no consumables), so no second copy of the rule decides what can be staffed: a check
 * `dispatch` gains is a check here at once.
 *
 * It misses no Party: `dispatch` asks of free Heroes on the Roster only the Quest's requirements
 * (`unmetRequirements`: a size, a Class and a Skill), and `requiredParty` names a Party whenever one
 * of `available` meets them, which `stops.test.ts` holds against every Party of a Roster. `partyFor`
 * names a Party exactly when it does, choosing who by the chance estimate (v1.1.4-S6), which cannot
 * change whether a Party can go; so the stops ask no estimate of every Quest on the Board each Turn
 * (DL-157). Reads, never writes, and draws nothing.
 */
function staffingParty(world: World, guild: Guild, quest: Quest, available: readonly Hero[], deps: EngineDeps): HeroId[] | null {
  const party = requiredParty(quest, available);
  if (party === null) return null;
  const heroIds = party.map((hero) => hero.id);
  return dispatchRefusal(world, { guildId: guild.id, questId: quest.id, heroIds }, deps) === null ? heroIds : null;
}

// ── The rule's parts ────────────────────────────────────────────────────────────────────────────

/**
 * A dispatch to the Quest `disposition` prefers among those on the Board `guild` can staff now, or
 * `null` when it can staff none. The Quests it can staff are ranked by difficulty, easiest first,
 * and the one `questRiskAppetite` of the way along names the difficulty it wants: 0 the easiest
 * (DL-30's `steady`), 1 the hardest, 0.5 the middle, the place rounded to the nearest. Every Quest
 * it can staff at that difficulty is a candidate, in Quest id order, and one draw from `rivals`
 * picks among them, one draw however many there are. The Party is `partyFor`'s, for the Quest
 * chosen only: which Quests it can staff is `partyFor`'s first step (`requiredParty`), which the
 * estimate cannot change (v1.1.4-S6, DL-157).
 */
function preferredQuest(world: World, guild: Guild, disposition: Disposition, deps: EngineDeps): DispatchAction | null {
  const available = availableHeroes(world, guild);
  if (available.length === 0) return null;
  const staffable = offeredQuests(world).filter((quest) => requiredParty(quest, available) !== null);
  if (staffable.length === 0) return null;
  staffable.sort((a, b) => a.difficulty - b.difficulty || compareByCodeUnit(a.id, b.id));
  const place = Math.round(disposition.questRiskAppetite * (staffable.length - 1));
  const wanted = staffable[place]?.difficulty;
  const candidates = staffable.filter((quest) => quest.difficulty === wanted);
  const quest = pick(streamOf(world, 'rivals'), candidates);
  const heroIds = partyFor(world, guild, quest, available, deps) ?? [];
  return { kind: 'dispatch', guildId: guild.id, questId: quest.id, heroIds };
}

/**
 * A build of the next grade of the first facility of `guild`'s Hall, in the Hall's order
 * (`facilityKeys`: the infirmary, the training yard, the quarters), whose next grade's cost its Wealth
 * is above its Disposition's `buildThreshold` times (`affordableImprovement`); `null` when there is
 * none, every facility being at its top grade or dearer than its Wealth allows (M6-S4, DL-58). The
 * infirmary comes first, as it came alone in M3-S6 (DL-38); a dearer grade of it that is out of reach
 * does not stop a cheaper grade of another facility, so a Rival saving for the Physicians' wing builds
 * its practice yard meanwhile. Draws nothing.
 */
function hallBuild(guild: Guild, disposition: Disposition, deps: EngineDeps): GuildAction | null {
  const facility = facilityKeys.find(
    (key) => affordableImprovement(guild, key, disposition.buildThreshold, deps.content) !== null,
  );
  return facility === undefined ? null : { kind: 'build', guildId: guild.id, facility };
}

/**
 * The slots a Rival buys gear for, in the order it buys: armour first (M6-S4), then the other slots
 * `config.gearSlots` lists, in its order. Armour first because it keeps the Heroes the Guild has alive
 * and on their feet, as the harness's policy buys armour before it recruits (DL-51).
 */
function purchaseOrder(slots: readonly SlotKey[]): SlotKey[] {
  return [...slots.filter((slot) => slot === 'armour'), ...slots.filter((slot) => slot !== 'armour')];
}

/**
 * One piece of gear `guild` buys at the Market this afternoon, or `null` (M6-S4, DL-58): the engine's
 * `gearPurchase` over the slots in `purchaseOrder`, armour first, with its Disposition's
 * `gearThreshold` — for the first slot whose Heroes lacking it outnumber the pieces the Guild holds
 * for them, the dearest piece the Market has for sale whose price its Wealth is above `gearThreshold`
 * times, the lowest key among equal prices. A slot with nothing to buy for it, or nothing within its
 * means, gives way to the next. Draws nothing.
 */
function gearBuy(world: World, guild: Guild, disposition: Disposition, deps: EngineDeps): GuildAction | null {
  return gearPurchase(world, guild, purchaseOrder(deps.config.gearSlots), disposition.gearThreshold, deps);
}

/**
 * The Party the engine sends on `quest` from `available`, the free Heroes of `guild`, or `null` when
 * no Party of them meets the Quest's size and requirements (v1.1.4-S6, DL-148 item 17). The rule, by
 * the chance estimate (`questEstimator`: the chance of a success or a strong success, the Party as it
 * comes home, carrying nothing, if no one falls):
 *
 * 1. It starts with the Heroes who meet the Quest's Class and Skill requirements: while one is unmet,
 *    the Hero who most raises the chance among those who meet every requirement still unmet, or,
 *    when no one does, among those who meet one of them. So one Hero who has both goes alone, and
 *    two go only when no one Hero has both.
 * 2. It adds the Hero who most raises the chance until it reaches `partySizeMin`.
 * 3. It keeps adding the Hero who most raises it while that Hero raises it by more than the Guild's
 *    margin (`partyMarginOf`: its Disposition's `partyMargin`), up to `partySizeMax`: by more than
 *    nothing at a margin of 0 (v1.1.5-S6, DL-175).
 *
 * Of Heroes who raise it alike, the one who most raises the chance of a strong success goes, then the
 * lowest Hero id, so the rule is deterministic; a Quest whose Encounters are drawn on the way has no
 * estimate, so its Heroes are added by id. The Party is in the order its Heroes were added, which
 * the Quest's Queries read for their ties (DL-148 item 18). `null` exactly when `requiredParty` is,
 * so `staffableQuests` searches with that and lets `dispatch`'s own checks judge the Party.
 *
 * Exported as the one staffing rule: the Rivals send it, the harness's automatic policy sends it for
 * the player's Guild (M2-S12, DL-34), and the Board shows it as "Your best Party" (`bestParty`, with
 * its estimate). It reads nothing but its arguments and draws nothing.
 */
export function partyFor(
  world: World,
  guild: Pick<Guild, 'controller'>,
  quest: Quest,
  available: readonly Hero[],
  deps: EngineDeps,
): HeroId[] | null {
  return bestParty(world, guild, quest, available, deps)?.heroIds ?? null;
}

/** The Party `partyFor` names, and the estimate it was chosen by (`estimateQuest`'s for it); `null` for no estimate. */
export interface BestParty {
  heroIds: HeroId[];
  estimate: QuestEstimate | null;
}

/**
 * `partyFor`'s Party with the estimate the rule last read of it, which is `estimateQuest`'s for that
 * Party carrying nothing, so that a view showing the Party's chance does not estimate it again
 * (v1.1.4-S6's verification, DL-157). `null` exactly when `partyFor` is.
 */
export function bestParty(
  world: World,
  guild: Pick<Guild, 'controller'>,
  quest: Quest,
  available: readonly Hero[],
  deps: EngineDeps,
): BestParty | null {
  if (requiredParty(quest, available) === null) return null;
  const { partySizeMin, partySizeMax, classKey, skillKey } = quest.requirements;
  const estimate = questEstimator(world, quest, available, deps);
  // Each Party's chance, by its Heroes in order: the Party the search ends on is one `best` weighed
  // already, and an estimate is the rule's whole cost (DL-164). It draws nothing, so asking once is
  // asking as often.
  const weighed = new Map<string, Chance>();
  const chanceOf = (heroes: readonly Hero[]): Chance => {
    const key = heroes.map((hero) => hero.id).join(' ');
    const known = weighed.get(key);
    if (known !== undefined) return known;
    const chance = chanceIn(estimate(heroes));
    weighed.set(key, chance);
    return chance;
  };
  const party: Hero[] = [];
  const left = (): Hero[] => available.filter((hero) => !party.includes(hero));
  // Of `candidates`, the Hero whose joining leaves the Party the best chance, and that chance.
  const best = (candidates: readonly Hero[]): { hero: Hero; chance: Chance } => {
    let chosen: { hero: Hero; chance: Chance } | undefined;
    for (const hero of candidates) {
      const chance = chanceOf([...party, hero]);
      if (chosen === undefined || better(chance, hero, chosen.chance, chosen.hero)) chosen = { hero, chance };
    }
    if (chosen === undefined) throw new RangeError(`partyFor found no Hero to add for ${quest.id}`);
    return chosen;
  };

  const ofClass = (hero: Hero): boolean => hero.classKey === classKey;
  const withSkill = (hero: Hero): boolean => skillKey !== undefined && Object.hasOwn(hero.skills, skillKey);
  const unmet = (): ((hero: Hero) => boolean)[] => [
    ...(classKey !== undefined && !party.some(ofClass) ? [ofClass] : []),
    ...(skillKey !== undefined && !party.some(withSkill) ? [withSkill] : []),
  ];
  for (let needs = unmet(); needs.length > 0; needs = unmet()) {
    const rest = left();
    const every = rest.filter((hero) => needs.every((meets) => meets(hero)));
    party.push(best(every.length > 0 ? every : rest.filter((hero) => needs.some((meets) => meets(hero)))).hero);
  }
  while (party.length < partySizeMin) party.push(best(left()).hero);

  const margin = partyMarginOf(guild, deps);
  let chance = chanceOf(party);
  // No Hero can raise the chance by more than what is left of it below 1, so none is asked once that
  // cannot pass the margin.
  while (party.length < partySizeMax && party.length < available.length && 1 - chance.success > margin) {
    const next = best(left());
    if (!(next.chance.success - chance.success > margin)) break;
    party.push(next.hero);
    chance = next.chance;
  }
  return { heroIds: party.map((hero) => hero.id), estimate: chance.estimate };
}

/** What `partyFor` weighs a Party by: its chance of a success or better, and of a strong success; and the estimate they are of. */
interface Chance {
  success: number;
  strong: number;
  estimate: QuestEstimate | null;
}

/**
 * `estimate`'s chances, a success's held to at most 1 against a sum's rounding, so that no Hero raises
 * it by more than is left of it; none for a Quest whose Encounters are drawn on the way.
 */
function chanceIn(estimate: QuestEstimate | null): Chance {
  return estimate === null ? { success: 0, strong: 0, estimate } : { success: Math.min(1, estimate.success), strong: estimate.bands.strong, estimate };
}

/** Whether `hero` joining for `chance` beats `other` joining for `otherChance`: the better success, then strong success, then the lower id. */
function better(chance: Chance, hero: Hero, otherChance: Chance, other: Hero): boolean {
  if (chance.success !== otherChance.success) return chance.success > otherChance.success;
  if (chance.strong !== otherChance.strong) return chance.strong > otherChance.strong;
  return compareByCodeUnit(hero.id, other.id) < 0;
}

/**
 * How much more than this a Hero must raise the chance to join `guild`'s Party past `partySizeMin` (`partyFor`):
 * its Disposition's `partyMargin`; for a Guild with no Disposition, the player's, or with one content
 * does not define, the configuration's `playerPartyMargin` (v1.1.4-S6, DL-157).
 */
function partyMarginOf(guild: Pick<Guild, 'controller'>, deps: Pick<EngineDeps, 'config' | 'content'>): number {
  const disposition = chooser(guild, deps.content);
  return disposition === 'own' || disposition === null ? deps.config.playerPartyMargin : disposition.partyMargin;
}

/**
 * A Party of `available` that meets `quest`'s size and requirements, or `null` when none does: the
 * first of them, in the order given, who meets both a required Class and a required Skill, or, when
 * no one does, the first who meets each; then the first of the rest up to `partySizeMin`. `partyFor`
 * names a Party exactly when this does; who goes is its estimate's to choose. Draws nothing and asks
 * no estimate, so the Board can be searched with it every Turn.
 */
function requiredParty(quest: Pick<Quest, 'requirements'>, available: readonly Hero[]): Hero[] | null {
  const { partySizeMin, partySizeMax, classKey, skillKey } = quest.requirements;
  const ofClass = (hero: Hero): boolean => classKey === undefined || hero.classKey === classKey;
  const withSkill = (hero: Hero): boolean => skillKey === undefined || Object.hasOwn(hero.skills, skillKey);
  const party: Hero[] = [];
  if (classKey !== undefined || skillKey !== undefined) {
    const both = available.find((hero) => ofClass(hero) && withSkill(hero));
    if (both !== undefined) {
      party.push(both);
    } else {
      // Only when both are required and no one Hero meets both: then two Heroes meet one each.
      const classHero = available.find(ofClass);
      const skillHero = available.find(withSkill);
      if (classHero === undefined || skillHero === undefined) return null;
      party.push(classHero, skillHero);
    }
  }
  const size = Math.max(partySizeMin, party.length);
  if (size > partySizeMax || size > available.length) return null;
  for (const hero of available) {
    if (party.length >= size) break;
    if (!party.includes(hero)) party.push(hero);
  }
  return party;
}

/**
 * A recruit of the cheapest Hero in the Unattached pool who would sign for `guild`
 * (`cheapestUnattached`, M3-S5: DL-38's one statement of the cheapest, the lowest id among equal
 * fees), while it would hire and the fee is no more than it would spend (`hiringBudget`: by its
 * Disposition's `recruitThreshold`, or by the need of a Roster below `rivalRosterMin`, DL-60);
 * `null` otherwise, and when no Hero in the pool would sign. A Hero who would refuse the Guild's Fame
 * is passed over, never asked.
 */
function cheapestHire(world: World, guild: Guild, deps: EngineDeps): GuildAction | null {
  const budget = budgetOf(world, guild, deps);
  if (budget === null) return null;
  const cheapest = cheapestUnattached(world, deps, guild);
  if (cheapest === null || cheapest.fee > budget) return null;
  return { kind: 'recruit', guildId: guild.id, heroId: cheapest.hero.id };
}
