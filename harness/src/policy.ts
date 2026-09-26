// The harness's automatic policy (M2-S12, INPUTS 4.14): what the player's Guild does in a harness
// game, chosen as the same `Action` values a front end produces and applied between Turns through
// the real actions. It is the harness's, not a rule of the game, so its own numbers live here
// (`PolicyConfig`) and not in `GameConfig`. The choices INPUTS 4.14 leaves open are DL-34.
//
// Deterministic: it reads the document and draws no random number, so a seed played twice under
// it plays the same game (ADR-0001). It sends Parties through the engine's own staffing rule,
// `partyFor`, the one `steady` uses (DL-30), rather than keeping a copy of it.

import {
  affordableImprovement,
  availableHeroes,
  cheapestUnattached,
  compareByCodeUnit,
  gearChoices,
  gearPurchase,
  offeredQuests,
  offersTo,
  partyFor,
  playerGuild,
  upkeep,
  type EngineDeps,
  type Guild,
  type GuildAction,
  type HeroId,
  type Quest,
  type WorldDocument,
} from '@heroesim/engine';

/** The policy's own numbers (INPUTS 4.14). Not game rules: nothing in the engine reads them. */
export interface PolicyConfig {
  /** Recruit only while Wealth is above this many times the Guild's Upkeep ("exceeds three Upkeeps"). */
  recruitWealthMultiple: number;
  /** Recruit only while the Roster holds fewer Heroes than this ("the Roster is below 8"). */
  rosterLimit: number;
  /**
   * Build the infirmary's next grade only while Wealth is above this many times its cost (M3-S6:
   * "when Wealth exceeds three times its cost", DL-38).
   */
  buildWealthMultiple: number;
  /**
   * Buy a piece of armour only while Wealth is above this many times its price (M5-S4, the M5 risk
   * table: "buy one armour per un-armoured Hero when Wealth allows", DL-51).
   */
  buyWealthMultiple: number;
}

export const defaultPolicyConfig: Readonly<PolicyConfig> = Object.freeze({
  recruitWealthMultiple: 3,
  rosterLimit: 8,
  buildWealthMultiple: 3,
  buyWealthMultiple: 3,
});

/**
 * What the player's Guild does now, in the order to apply them (INPUTS 4.14, DL-34, DL-54, DL-57):
 * decline, equip, dispatch, then one purchase.
 *
 * - **Decline every Transfer Offer** made for one of its Heroes, in offer id order, first (M6 risk
 *   table: "the policy declines all offers in M6"; a smarter policy is a DL after the M6 counters are
 *   seen). Declining moves nothing else, so the choices after it are made on the same document.
 * - **Equip** the gear the Guild holds onto its Heroes whose slot for it is empty, first, while
 *   they are home: the engine's `gearChoices`, the rule `steady` equips by (M5-S2, DL-49).
 * - **Dispatch.** The offered Quests on the Board by reward, highest first, then Quest id; to each
 *   in turn, the strongest Party of the size it requires that the Guild's available Heroes can
 *   make (`partyFor`: `partySizeMin`, or two when a Class and a Skill are required and no one
 *   Hero has both), until no Hero is left or no Quest can be staffed. A Quest it cannot staff is
 *   passed over for the next.
 * - **One purchase a Turn**, the first of these that applies:
 *   - **Build** the infirmary's next grade when Wealth is above `buildWealthMultiple` times its cost
 *     (M3-S6, DL-38), until the infirmary is at its top grade.
 *   - **Buy armour** while the Roster has more Heroes with nothing in their armour slot than the
 *     Guild holds armour to give them (M5-S4, DL-51): one piece, the dearest armour the Market has
 *     for sale whose price Wealth is above `buyWealthMultiple` times, lowest key among equal prices.
 *     The armour bought waits in the Guild's holding for the next Turn's first choice, the equip,
 *     which puts it on a Hero with the slot bare who is home (DL-54).
 *   - **Recruit** when the Roster is below `rosterLimit` and Wealth is above
 *     `recruitWealthMultiple` Upkeeps: the cheapest Hero in the Unattached pool who would sign for
 *     the Guild, lowest id among equal fees (the engine's `cheapestUnattached`, as `steady` recruits,
 *     M3-S5), if Wealth covers the fee. A Hero who would refuse the Guild's Fame is passed over.
 * - **Never transfers** a Hero in or out itself (M6-S2): the harness plays the Guild as INPUTS 4.14
 *   describes it, and Rivals' offers are declined above.
 *
 * Each choice is made on `document` as it stands: equipping moves no Wealth and sends no one, a
 * dispatch moves no Wealth and a purchase sends no one, and there is one purchase, so the choices
 * do not depend on one another, and every one is an action the rules accept on it when applied in
 * order. None once the game has ended, and none for a world without a player's Guild.
 */
export function automaticPolicy(
  document: WorldDocument,
  deps: EngineDeps,
  policy: Readonly<PolicyConfig> = defaultPolicyConfig,
): GuildAction[] {
  const { world } = document;
  const guild = playerGuild(world);
  if (world.ended !== null || guild === undefined || guild.foldedOnTurn !== null) return [];

  const actions: GuildAction[] = [
    ...offersTo(world, guild.id).map((offer): GuildAction => ({ kind: 'declineTransfer', guildId: guild.id, offerId: offer.id })),
    ...gearChoices(world, guild, deps),
  ];
  let available = availableHeroes(world, guild);
  for (const quest of byReward(document)) {
    if (available.length === 0) break;
    const heroIds = partyFor(quest, available, deps.content);
    if (heroIds === null) continue;
    actions.push({ kind: 'dispatch', guildId: guild.id, questId: quest.id, heroIds });
    const sent = new Set<HeroId>(heroIds);
    available = available.filter((hero) => !sent.has(hero.id));
  }

  const purchase = infirmaryBuild(guild, deps, policy) ?? armourPurchase(document, guild, deps, policy);
  if (purchase !== null) {
    actions.push(purchase);
  } else if (
    guild.rosterIds.length < policy.rosterLimit &&
    guild.wealth > policy.recruitWealthMultiple * upkeep(guild, world, deps.config, deps.content)
  ) {
    const cheapest = cheapestUnattached(world, deps, guild);
    if (cheapest !== null && cheapest.fee <= guild.wealth) {
      actions.push({ kind: 'recruit', guildId: guild.id, heroId: cheapest.hero.id });
    }
  }
  return actions;
}

/**
 * A build of the infirmary's next grade when Wealth is above the policy's `buildWealthMultiple`
 * times its cost (the engine's `affordableImprovement`, as `steady` decides with the game's);
 * `null` otherwise, and once the infirmary is at its top grade.
 */
function infirmaryBuild(guild: Guild, deps: EngineDeps, policy: Readonly<PolicyConfig>): GuildAction | null {
  const next = affordableImprovement(guild, 'infirmary', policy.buildWealthMultiple, deps.content);
  return next === null ? null : { kind: 'build', guildId: guild.id, facility: 'infirmary' };
}

/**
 * One piece of armour to buy (M5-S4, DL-51): while the Roster's Heroes with an empty armour slot
 * outnumber the armour in the Guild's own holding, the dearest armour on the Market whose price the
 * Guild's Wealth is above `buyWealthMultiple` times, the lowest key among equal prices; `null`
 * when none is wanted or none is affordable, and when Heroes have no armour slot. The engine's
 * `gearPurchase` for the armour slot alone: the rule a Rival buys by too, with its Disposition's
 * `gearThreshold` and every slot, armour first (M6-S4, DL-58).
 */
function armourPurchase(
  { world }: WorldDocument,
  guild: Guild,
  deps: EngineDeps,
  policy: Readonly<PolicyConfig>,
): GuildAction | null {
  return gearPurchase(world, guild, ['armour'], policy.buyWealthMultiple, deps);
}

/** The offered Quests on the Board (the engine's `offeredQuests`), highest reward first, ties by Quest id. */
function byReward({ world }: WorldDocument): Quest[] {
  return offeredQuests(world).sort((a, b) => b.reward - a.reward || compareByCodeUnit(a.id, b.id));
}
