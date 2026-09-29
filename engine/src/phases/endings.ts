// Night, last: the ending checks (approach §2, M2-S10, INPUTS 4.9, 4.10, pre-M0 review D6, DL-28).
//
// Every Guild in play is checked alike, the player's and each Rival's, in Guild id order
// (ADR-0002): its Guildmaster's Retirement at `guildmasterRetirementAge`; Bankruptcy, once Wealth
// has stayed below the floor for `bankruptcyGraceDays`; and a wiped Roster, no Hero on it and too
// little Wealth to sign the cheapest Hero in the pool, whoever they would sign for (DL-38: a
// refusal for Fame lasts only until the pool turns over). A folded Guild is out of play and skipped.
//
// What an ending does is the one place this phase asks whose Guild it is, one of the three
// exceptions to ADR-0002 the owner accepted (`plan.md` §1): the player's ending ends the game
// (`world.ended`, after which `advance` is a no-op); a Rival's folds that Guild and releases its
// Heroes into the Unattached pool, save its Guildmaster's Retirement, which is met by Succession
// (M9-S2, DL-83 item 19, DL-100 item 3). `rivalReplacementDays` after a fold a new Rival is founded,
// so the Rival count holds; a succeeded Rival has not folded, and none replaces it.

import type { EngineDeps } from '../config.js';
import {
  compareByCodeUnit,
  type EndingReason,
  type Guild,
  type Party,
  type QuestId,
  type TransferOffer,
  type World,
} from '../document.js';
import type { EngineEvent } from '../events.js';
import { returnGear } from '../gear.js';
import { generateRival, generateSuccessor } from '../generators/guilds.js';
import { sellFoldedGuildItems } from '../market.js';
import { sendHome } from '../quest-engine/consumables.js';
import { cheapestUnattached } from '../selectors.js';
import { ageOf, dayOf } from '../time.js';
import { withdrawOffers } from '../transfer.js';
import type { PhaseContext, PhaseRun } from './phase.js';

export const endings: PhaseRun = (world, ctx) => {
  const events: EngineEvent[] = [];
  for (const guild of guildsById(world)) {
    if (guild.foldedOnTurn !== null) continue;
    const reason = endingOf(guild, world, ctx);
    if (reason !== null) events.push(...end(world, guild, reason, ctx));
  }
  events.push(...replaceFolded(world, ctx));
  return events;
};

/**
 * The ending `guild` has reached tonight, or `null`: the first that holds of Retirement,
 * Bankruptcy and Roster wiped, in that order (DL-28). Runs after the Guild State Engine and the
 * pool refresh, so it reads tonight's `belowFloorSince` and tonight's pool.
 */
function endingOf(guild: Guild, world: World, ctx: PhaseContext): EndingReason | null {
  const { config } = ctx;
  const guildmaster = world.guildmasters[guild.guildmasterId];
  if (guildmaster === undefined) throw new RangeError(`${guild.id} names ${guild.guildmasterId}, who has no row`);

  if (ageOf(guildmaster, ctx.turn, config) >= config.guildmasterRetirementAge) return 'retirement';
  if (
    guild.belowFloorSince !== null &&
    dayOf(ctx.turn) >= dayOf(guild.belowFloorSince) + config.bankruptcyGraceDays
  ) {
    return 'bankruptcy';
  }
  if (guild.rosterIds.length === 0 && guild.wealth < cheapestSigningFee(world, guild, ctx)) return 'roster-wiped';
  return null;
}

/**
 * The lowest signing fee `guild` would pay in the Unattached pool (`cheapestUnattached`, its
 * Guildmaster's Negotiation applied from M4-S5), whoever the Hero would sign for. With nobody in
 * the pool no Hero can be signed at any price, so it is infinite, and a Guild with an empty Roster
 * is wiped whatever its Wealth.
 *
 * Fame is not asked (DL-38). An ending is for good, and a Hero's refusal for Fame is not: every
 * Hero the pool's refill brings is Level 1 and signs for any Guild, and the pool turns over within
 * `unattachedStayDays`. A Guild whose Wealth reaches a Hero who refuses it is waiting, not wiped;
 * it is wiped once its Wealth is short of every fee in the pool.
 */
function cheapestSigningFee(world: World, guild: Guild, deps: Pick<EngineDeps, 'config' | 'content'>): number {
  return cheapestUnattached(world, deps, guild, false)?.fee ?? Number.POSITIVE_INFINITY;
}

/**
 * What reaching an ending does: the one read of `controller.kind` in this phase, and one of the
 * three the owner accepted (`plan.md` §1). The player's ending ends the game; a Rival's folds it,
 * save Retirement, which a Rival meets by Succession (M9-S2): the Guild carries on under a
 * successor, and its other endings are checked again that night under them, so a Rival that is
 * also bankrupt or wiped folds as it would have, its successor the Guildmaster it folds with.
 */
function end(world: World, guild: Guild, reason: EndingReason, ctx: PhaseContext): EngineEvent[] {
  if (guild.controller.kind === 'player') return endGame(world, guild, reason, ctx);
  if (reason !== 'retirement') return fold(world, guild, reason, ctx);
  const events = succeed(world, guild, ctx);
  const then = endingOf(guild, world, ctx);
  return then === null || then === 'retirement' ? events : [...events, ...fold(world, guild, then, ctx)];
}

/**
 * Succession (M9-S2, DL-83 item 19, DL-100 item 3): the Rival's Guildmaster retires, their row kept
 * with `retiredOnTurn` and their History, and a successor drawn from `generation` as a founding
 * Rival's Guildmaster is (`generateSuccessor`) takes over. The Guild keeps its Roster, Wealth,
 * Fame, Hall and Items. `guildmaster.succeeded`, a Milestone, names the Guild, the retired
 * Guildmaster and the successor, whose row exists by then. Regard others held for the retired
 * Guildmaster stays keyed to them, so Regard for the Guild, read through its Guildmaster, starts
 * neutral with the successor, as the successor's own does.
 */
function succeed(world: World, guild: Guild, ctx: PhaseContext): EngineEvent[] {
  const retiring = world.guildmasters[guild.guildmasterId];
  if (retiring === undefined) throw new RangeError(`${guild.id} names ${guild.guildmasterId}, who has no row`);
  const age = ageOf(retiring, ctx.turn, ctx.config);
  const successor = generateSuccessor(world, { config: ctx.config, content: ctx.content }, guild, { stream: 'generation' });
  retiring.retiredOnTurn = ctx.turn;
  guild.guildmasterId = successor.id;
  return [
    ctx.emit({
      type: 'guildmaster.succeeded',
      participants: [guild.id, retiring.id, successor.id],
      payload: { guildId: guild.id, guildmasterId: retiring.id, successorId: successor.id, age },
    }),
  ];
}

/**
 * The game is over: `world.ended` is set, once, and `game.ended` names the Guild and its
 * Guildmaster. The Guild is not folded and keeps its Roster: the world stops as it stands.
 */
function endGame(world: World, guild: Guild, reason: EndingReason, ctx: PhaseContext): EngineEvent[] {
  const event = ctx.emit({
    type: 'game.ended',
    participants: [guild.id, guild.guildmasterId],
    payload: { guildId: guild.id, reason },
  });
  world.ended ??= { turn: ctx.turn, reason };
  return [event];
}

/**
 * A Rival folds (pre-M0 review D6, DL-28), in one order for every Guild (DL-54):
 *
 * 1. Its Parties in flight are disbanded, in id order: each member's `partyId` cleared, the Party
 *    taken off its Quest, what it carried sent home to the Guild's holding (`sendHome`, M5-S3,
 *    DL-50), and its row removed; a Quest left with no Party is removed unresolved, from the world
 *    and the Board, since nobody is left to finish it or be paid.
 * 2. The gear each Hero on the Roster carries goes back to the Guild's holding, in Roster order,
 *    with `item.returned` for `guild-folded` (`returnGear`, M5-S2, DL-49). The gear of its dead and
 *    retired Heroes went back earlier tonight (`gearReturn`), so the Guild now holds all it had.
 * 3. Its unique Items are sold to the Market, one `item.sold` (`cause: 'fold'`) each in id order,
 * 4. and its stacks are discarded (`sellFoldedGuildItems`, M5-S4, DL-51).
 * 5. Every pending Transfer Offer naming the Guild, made by it or asking it (and so every offer for
 *    one of its Heroes), is withdrawn, in id order, with `guild.transfer-offer-expired` for
 *    `guild-folded` (M6-S2, DL-57): no offer outlives the Guild it names.
 * 6. Its Heroes are released to the Unattached pool, in Roster order, each with `hero.left-guild`,
 *    keeping their Injuries, Levels and Morale; the Roster is emptied and `foldedOnTurn` set.
 * 7. `guild.folded`, a Milestone naming the Guild, its Guildmaster, each Party it disbanded and each
 *    Quest it abandoned, closes the fold. It is made first, while those rows still exist (an event
 *    names only rows the world has, `emit`), and told last.
 *
 * The Guild and its Guildmaster keep their rows, as a record no rule reads again.
 */
function fold(world: World, guild: Guild, reason: EndingReason, ctx: PhaseContext): EngineEvent[] {
  const parties = Object.values(world.parties)
    .filter((party) => party.guildId === guild.id)
    .sort((a, b) => compareByCodeUnit(a.id, b.id));
  const abandoned = abandonedQuests(world, parties);
  const folded = ctx.emit({
    type: 'guild.folded',
    participants: [guild.id, guild.guildmasterId, ...parties.map((party) => party.id), ...abandoned],
    payload: { guildId: guild.id, reason },
  });
  const events: EngineEvent[] = [];

  // 1. The Parties in flight, and what they carried home.
  for (const party of parties) {
    for (const heroId of party.heroIds) {
      const member = world.heroes[heroId];
      if (member !== undefined) member.partyId = null;
    }
    const quest = world.quests[party.questId];
    if (quest !== undefined) quest.partyIds = quest.partyIds.filter((partyId) => partyId !== party.id);
    sendHome(world, party);
    delete world.parties[party.id];
  }
  for (const questId of abandoned) delete world.quests[questId];
  world.board = world.board.filter((questId) => !abandoned.includes(questId));

  // 2. The Roster's gear.
  const roster = guild.rosterIds.map((heroId) => {
    const hero = world.heroes[heroId];
    if (hero === undefined) throw new RangeError(`${guild.id}'s Roster names ${heroId}, who has no row`);
    return hero;
  });
  for (const hero of roster) events.push(...returnGear(world, hero, 'guild-folded', ctx.emit));

  // 3 and 4. Its unique Items to the Market, its stacks discarded.
  events.push(...sellFoldedGuildItems(world, guild, ctx.emit, ctx));

  // 5. Its Transfer Offers, either way.
  const named = (offer: TransferOffer) => offer.fromGuildId === guild.id || offer.toGuildId === guild.id;
  events.push(...withdrawOffers(world, (offer) => (named(offer) ? 'guild-folded' : null), ctx.emit));

  // 6. Its Heroes to the pool.
  for (const hero of roster) {
    events.push(
      ctx.emit({ type: 'hero.left-guild', participants: [hero.id, guild.id], payload: { heroId: hero.id, guildId: guild.id } }),
    );
    hero.guildId = null;
    hero.unattachedSince = ctx.turn;
  }
  guild.rosterIds = [];
  guild.foldedOnTurn = ctx.turn;

  // 7. The fold itself.
  events.push(folded);
  return events;
}

/** The Quests that `parties` are the only Parties on, in id order: disbanding them abandons these. */
function abandonedQuests(world: World, parties: readonly Party[]): QuestId[] {
  const disbanded = new Set(parties.map((party) => party.id));
  const questIds = new Set(parties.map((party) => party.questId));
  return [...questIds]
    .filter((questId) => world.quests[questId]?.partyIds.every((partyId) => disbanded.has(partyId)) ?? false)
    .sort(compareByCodeUnit);
}

/**
 * Founds one new Rival for each Guild that folded `rivalReplacementDays` Days ago tonight, in the
 * folded Guilds' id order, through the Guild Generator as `createWorld` makes its Rivals, drawing
 * from `generation` (DL-28). The new Rival takes the controller of the one it replaces, so it has
 * that Rival's Disposition and a world keeps every Disposition it was dealt (M6-S1, DL-56). Only a
 * Rival folds, so this asks nothing of the folded Guild but when, and copies its controller
 * without reading it.
 */
function replaceFolded(world: World, ctx: PhaseContext): EngineEvent[] {
  const today = dayOf(ctx.turn);
  const due = guildsById(world).filter(
    (guild) => guild.foldedOnTurn !== null && dayOf(guild.foldedOnTurn) + ctx.config.rivalReplacementDays === today,
  );
  const deps = { config: ctx.config, content: ctx.content };
  return due.flatMap((folded) => generateRival(world, deps, { stream: 'generation', controller: folded.controller }).events);
}

/** Every Guild, in id order. */
function guildsById(world: World): Guild[] {
  return Object.values(world.guilds).sort((a, b) => compareByCodeUnit(a.id, b.id));
}
