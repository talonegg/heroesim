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
import { unavailability, type DispatchAction } from '../actions/dispatch.js';
import type { TransferInAction } from '../actions/transfer.js';
import type { EngineDeps } from '../config.js';
import type { ContentSet, Disposition, SlotKey } from '../content-types.js';
import { compareByCodeUnit, facilityKeys, type Guild, type Hero, type HeroId, type Quest, type World } from '../document.js';
import { gearChoices, gearPurchase } from '../gear.js';
import { streamOf } from '../generators/draw.js';
import { guildmasterOf } from '../guildmaster.js';
import { chance, pick } from '../rng.js';
import {
  affordableImprovement,
  baseStat,
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
 *    - while it would hire (its Wealth above `recruitThreshold` times its Upkeep and its Roster room
 *      enough by `transferAppetite`), seek the Hero it wants from another Guild with the chance
 *      `transferAppetite`, one draw from `rivals` (`transferChoice`, M6-S2): `transferIn` from a Guild
 *      whose Disposition consents, or a Transfer Offer to a Guild whose controller answers for itself;
 *    - recruit the cheapest Unattached Hero who would sign while its Wealth is above
 *      `recruitThreshold` times its Upkeep;
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
  const quest = preferredQuest(world, guild, disposition, deps.content);
  if (quest !== null) choices.push(quest);
  const purchase =
    hallBuild(guild, disposition, deps) ??
    gearBuy(world, guild, disposition, deps) ??
    transferChoice(world, guild, disposition, deps) ??
    cheapestHire(world, guild, disposition, deps) ??
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
 * - `wealth`: asked to take a Hero in, its Wealth is not above `recruitThreshold` times its Upkeep,
 *   so it would not hire now;
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
 * - it takes a Hero in only while it would recruit: its Wealth above `recruitThreshold` times its
 *   Upkeep, as `cheapestHire` reads it. Whether it can pay the fee is the action's to check.
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
  if (side === 'in' && !(guild.wealth > disposition.recruitThreshold * upkeep(guild, world, deps.config, deps.content))) {
    return { consents: false, because: 'wealth' };
  }
  return { consents: true };
}

/** The Guilds in play but `guild`, in id order. */
function otherGuilds(world: Pick<World, 'guilds'>, guild: Pick<Guild, 'id'>): Guild[] {
  return Object.values(world.guilds)
    .filter((other) => other.id !== guild.id && other.foldedOnTurn === null)
    .sort((a, b) => compareByCodeUnit(a.id, b.id));
}

/** The Heroes on `guild`'s Roster a Transfer could move now, in Roster order: those in no Party. */
function transferable(world: Pick<World, 'heroes'>, guild: Pick<Guild, 'rosterIds'>): Hero[] {
  return guild.rosterIds.flatMap((heroId) => {
    const hero = Object.hasOwn(world.heroes, heroId) ? world.heroes[heroId] : undefined;
    return hero !== undefined && hero.partyId === null ? [hero] : [];
  });
}

/**
 * A Transfer `guild` seeks this afternoon, or `null` (M6-S2, DL-57). Only while it would hire by its
 * own answer (`transferAnswer`, `in`) and has no Transfer Offer of its own awaiting an answer. The
 * Hero it wants is the dearest it can pay for (`transferFee` at its Guildmaster's Negotiation, the
 * lowest Hero id among equal fees) among the Heroes in no Party on the Rosters of the other Guilds in
 * play that would part with one: a Guild whose Disposition consents to let one go, or one that answers
 * offers. When there is such a Hero, a draw from `rivals` decides, with the chance `transferAppetite`,
 * whether it seeks them this afternoon, so that its appetite is the share of its hiring it does by
 * Transfer; it does so by `transferIn` from a consenting Guild, or by a Transfer Offer to one that
 * answers for itself (`offerTransfer`). No draw when there is no such Hero.
 */
function transferChoice(world: World, guild: Guild, disposition: Disposition, deps: EngineDeps): GuildAction | null {
  if (!transferAnswer(world, guild, 'in', deps).consents) return null;
  if (Object.values(world.offers).some((offer) => offer.toGuildId === guild.id)) return null;
  const sellers = otherGuilds(world, guild).flatMap((other) => {
    const answer = transferAnswer(world, other, 'out', deps);
    return answer.consents || answer.because === 'answers-offers' ? [{ guild: other, byOffer: !answer.consents }] : [];
  });
  const wanted = dearestWanted(world, guild, sellers, deps);
  if (wanted === null || !chance(streamOf(world, 'rivals'), disposition.transferAppetite)) return null;
  const heroId = wanted.hero.id;
  return wanted.byOffer ? { kind: 'offerTransfer', guildId: guild.id, heroId } : { kind: 'transferIn', guildId: guild.id, heroId };
}

/**
 * The Hero `buyer` wants of those `sellers` hold, or `null`: the dearest it can pay for (`transferFee`
 * at its Guildmaster's Negotiation, no more than its Wealth), the lowest Hero id among equal fees,
 * among the Heroes in no Party on the sellers' Rosters (`transferable`). With it, whether their Guild
 * answers only offers (`byOffer`), as the seller was given. Reads, never writes, and draws nothing.
 * The one statement of whom a Rival wants, for its afternoon's `transferChoice` and the Transfer
 * Generator's bid (`transferBid`).
 */
function dearestWanted(
  world: Pick<World, 'heroes' | 'guildmasters'>,
  buyer: Guild,
  sellers: readonly { guild: Guild; byOffer: boolean }[],
  deps: Pick<EngineDeps, 'config' | 'content'>,
): { hero: Hero; byOffer: boolean } | null {
  const guildmaster = guildmasterOf(buyer, world);
  let wanted: { hero: Hero; fee: number; byOffer: boolean } | null = null;
  for (const { guild, byOffer } of sellers) {
    for (const hero of transferable(world, guild)) {
      const fee = transferFee(hero, guildmaster, deps);
      if (fee > buyer.wealth) continue;
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
 * it wants (`dearestWanted`: the dearest it can pay for, at home). It bids only when:
 *
 * - the Transfer keeps both Rosters within the range a Rival is generated with: the bidder's below
 *   `rivalRosterMax` and the other's above `rivalRosterMin`, so the Generator's own moves never take a
 *   Roster out of it (the epic's box, DL-59);
 * - both answer as they answer any Transfer asked of them (`transferAnswer`, DL-57), the consent
 *   rule every Transfer keeps: the other lets a Hero go (`out`: its appetite and its Roster size), the
 *   consent `transferIn` itself asks, and the bidder takes one in (`in`: its appetite and its Roster
 *   size, and a Wealth above its `recruitThreshold` times its Upkeep). A bid is a hire, and a Rival
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
  const wanted = dearestWanted(world, bidder, [{ guild: seller, byOffer: false }], deps);
  return wanted === null ? null : { kind: 'transferIn', guildId: bidder.id, heroId: wanted.hero.id };
}

/**
 * A Transfer out `guild` makes to pay its way while it is in debt (`belowFloorSince` set, M2-S7), or
 * `null` (M6-S2, DL-57): only when its own Disposition would let a Hero go (`transferAnswer`, `out`),
 * its dearest Hero in no Party and not in `dispatched`, to the Guild in play that consents to take
 * them in, can pay, and pays most, by `transferOut`: the dearest fee first, then the lowest Hero id,
 * then the lowest Guild id. A Guild that answers offers is never offered one, since that would need
 * an offer the other way, which the first build does not make. Draws nothing.
 */
function debtTransfer(world: World, guild: Guild, dispatched: ReadonlySet<HeroId>, deps: EngineDeps): GuildAction | null {
  if (guild.belowFloorSince === null || !transferAnswer(world, guild, 'out', deps).consents) return null;
  const heroes = transferable(world, guild).filter((hero) => !dispatched.has(hero.id));
  let best: { heroId: HeroId; toGuildId: Guild['id']; fee: number } | null = null;
  for (const other of otherGuilds(world, guild)) {
    if (!transferAnswer(world, other, 'in', deps).consents) continue;
    const guildmaster = guildmasterOf(other, world);
    for (const hero of heroes) {
      const fee = transferFee(hero, guildmaster, deps);
      if (fee > other.wealth) continue;
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
 * which some Party of its available Heroes (`availableHeroes`, `dispatch`'s own test) meets the
 * Quest's size and requirements, as a Rival staffs a Quest (`partyFor`). Fast forward's
 * `decision-needed` reads it (M2-S11, DL-33), so a stop and a Rival agree on what can be staffed.
 */
export function staffableQuests(
  world: Pick<World, 'board' | 'quests' | 'heroes'>,
  guild: Pick<Guild, 'rosterIds'>,
  content: ContentSet,
): Quest[] {
  const available = availableHeroes(world, guild);
  if (available.length === 0) return [];
  return offeredQuests(world).filter((quest) => partyFor(quest, available, content) !== null);
}

// ── The rule's parts ────────────────────────────────────────────────────────────────────────────

/**
 * A dispatch to the Quest `disposition` prefers among those on the Board `guild` can staff now, or
 * `null` when it can staff none. The Quests it can staff are ranked by difficulty, easiest first,
 * and the one `questRiskAppetite` of the way along names the difficulty it wants: 0 the easiest
 * (DL-30's `steady`), 1 the hardest, 0.5 the middle, the place rounded to the nearest. Every Quest
 * it can staff at that difficulty is a candidate, in Quest id order, and one draw from `rivals`
 * picks among them, one draw however many there are. The Party is `partyFor`'s.
 */
function preferredQuest(world: World, guild: Guild, disposition: Disposition, content: ContentSet): DispatchAction | null {
  const available = availableHeroes(world, guild);
  if (available.length === 0) return null;
  const staffable: { quest: Quest; heroIds: HeroId[] }[] = [];
  for (const quest of offeredQuests(world)) {
    const heroIds = partyFor(quest, available, content);
    if (heroIds !== null) staffable.push({ quest, heroIds });
  }
  if (staffable.length === 0) return null;
  staffable.sort((a, b) => a.quest.difficulty - b.quest.difficulty || compareByCodeUnit(a.quest.id, b.quest.id));
  const place = Math.round(disposition.questRiskAppetite * (staffable.length - 1));
  const wanted = staffable[place]?.quest.difficulty;
  const candidates = staffable.filter(({ quest }) => quest.difficulty === wanted);
  const { quest, heroIds } = pick(streamOf(world, 'rivals'), candidates);
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
 * The Party a Rival sends on `quest` from `available`, strongest first, or `null` when no Party
 * of them meets the Quest's size and requirements. It is the fewest Heroes the Quest allows —
 * `partySizeMin`, or two when no one Hero has both a required Class and a required Skill — so
 * the rest stay free for tomorrow's Board. A requirement is met by the strongest Hero who meets
 * it (one who meets both when there is one); the other places go to the strongest of the rest.
 * Strength is the Hero's Stats weighted by the Quest's demands (`strengthFor`), ties by Hero id.
 * `null` exactly when no Party of `available` could go, so `staffableQuests` reads it as the test
 * of whether a Quest can be staffed.
 *
 * Exported as the one staffing rule: the harness's automatic policy (M2-S12, DL-34) sends the
 * Party it names rather than keeping a copy. It reads nothing but its arguments and draws nothing.
 */
export function partyFor(quest: Quest, available: readonly Hero[], content: ContentSet): HeroId[] | null {
  const strength = new Map(available.map((hero) => [hero.id, strengthFor(hero, quest, content)]));
  const ranked = [...available].sort(
    (a, b) => (strength.get(b.id) ?? 0) - (strength.get(a.id) ?? 0) || compareByCodeUnit(a.id, b.id),
  );
  const { partySizeMin, partySizeMax, classKey, skillKey } = quest.requirements;
  const ofClass = (hero: Hero) => classKey === undefined || hero.classKey === classKey;
  const withSkill = (hero: Hero) => skillKey === undefined || Object.hasOwn(hero.skills, skillKey);

  const required: Hero[] = [];
  if (classKey !== undefined || skillKey !== undefined) {
    const both = ranked.find((hero) => ofClass(hero) && withSkill(hero));
    if (both !== undefined) {
      required.push(both);
    } else {
      // Only when both are required and no one Hero meets both: then two Heroes meet one each.
      const classHero = ranked.find(ofClass);
      const skillHero = ranked.find(withSkill);
      if (classHero === undefined || skillHero === undefined) return null;
      required.push(classHero, skillHero);
    }
  }

  const size = Math.max(partySizeMin, required.length);
  if (size > partySizeMax || size > ranked.length) return null;
  const party = new Set(required);
  for (const hero of ranked) {
    if (party.size >= size) break;
    party.add(hero);
  }
  return ranked.filter((hero) => party.has(hero)).map((hero) => hero.id);
}

/**
 * How much `hero` brings to `quest`: each of the Quest's demands' weight times the Hero's base
 * Stat. A Stat content no longer defines counts for nothing (data-model rule 5).
 */
function strengthFor(hero: Hero, quest: Quest, content: ContentSet): number {
  let total = 0;
  for (const [statKey, weight] of quest.demands) {
    const stat = Object.hasOwn(content.stats, statKey) ? content.stats[statKey] : undefined;
    if (stat !== undefined && stat.owner === 'hero') total += weight * baseStat(hero.stats, stat);
  }
  return total;
}

/**
 * A recruit of the cheapest Hero in the Unattached pool who would sign for `guild`
 * (`cheapestUnattached`, M3-S5: DL-38's one statement of the cheapest, the lowest id among equal
 * fees), when `guild`'s Wealth is above its Disposition's `recruitThreshold` times its Upkeep and
 * covers the fee; `null` otherwise, and when no Hero in the pool would sign. A Hero who would refuse
 * the Guild's Fame is passed over, never asked.
 */
function cheapestHire(world: World, guild: Guild, disposition: Disposition, deps: EngineDeps): GuildAction | null {
  const threshold = disposition.recruitThreshold * upkeep(guild, world, deps.config, deps.content);
  if (!(guild.wealth > threshold)) return null;
  const cheapest = cheapestUnattached(world, deps, guild);
  if (cheapest === null || cheapest.fee > guild.wealth) return null;
  return { kind: 'recruit', guildId: guild.id, heroId: cheapest.hero.id };
}
