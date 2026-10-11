// The harness's automatic policy (M2-S12, INPUTS 4.14): what the player's Guild does in a harness
// game, chosen as the same `Action` values a front end produces and applied between Turns through
// the real actions. It is the harness's, not a rule of the game, so its own numbers live here
// (`PolicyConfig`) and not in `GameConfig`. The choices INPUTS 4.14 leaves open are DL-34.
//
// Deterministic: it reads the document and draws no random number, so a seed played twice under
// it plays the same game (ADR-0001). It sends Parties through the engine's own staffing rule,
// the Best Party, the one the Rivals send (DL-30; by the chance estimate, DL-157), at the player's
// margin, `playerPartyMargin`: the Party the Board gives as "Your best Party". It chooses its Quests
// by that Party's chance (DL-168 item 2, DL-176): of the Quests it can staff from the Heroes still
// free, the likeliest first, ties to the higher reward, then the Quest id, and then again from the
// Heroes left. One Best Party module serves a call (DL-237), so a Quest asked again from the Heroes
// left weighs only the Parties it has not weighed, and keeps its Party when none of it was sent.

import {
  affordableImprovement,
  bestParties,
  captainChoice,
  cheapestUnattached,
  compareByCodeUnit,
  fameRefusal,
  gearChoices,
  gearPurchase,
  holdings,
  itemDefinition,
  marketStock,
  offeredQuests,
  offersTo,
  partyPool,
  playerGuild,
  upkeep,
  type BestParties,
  type ConsumableRequest,
  type EngineDeps,
  type Guild,
  type GuildAction,
  type Hero,
  type HeroId,
  type ItemDefinitionKey,
  type Quest,
  type World,
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
  /**
   * Keep this many of each consumable, at home and carried by the Guild's Parties together, buying
   * toward it when nothing else is bought (the M5 close, DL-62). Its price is read with
   * `buyWealthMultiple`, as armour's is.
   */
  consumableStock: number;
  /**
   * Buy consumables only from Wealth the Guild can spare: the purchase leaves more than this many
   * Upkeeps (DL-62), so that a Guild earning little over its Upkeep keeps its margin for its wages.
   */
  consumableReserveUpkeeps: number;
}

export const defaultPolicyConfig: Readonly<PolicyConfig> = Object.freeze({
  recruitWealthMultiple: 3,
  rosterLimit: 8,
  buildWealthMultiple: 3,
  buyWealthMultiple: 3,
  consumableStock: 2,
  consumableReserveUpkeeps: 20,
});

/**
 * What the player's Guild does now, in the order to apply them (INPUTS 4.14, DL-34, DL-54, DL-57,
 * DL-287): decline, name a Captain, equip, dispatch, then one purchase.
 *
 * - **Decline every Transfer Offer** made for one of its Heroes, in offer id order, first (M6 risk
 *   table: "the policy declines all offers in M6"; a smarter policy is a DL after the M6 counters are
 *   seen). Declining moves nothing else, so the choices after it are made on the same document.
 * - **Name a Captain** to an empty post, as a Rival does: its Hero highest in the captaincy Stat, the
 *   first in Roster order among those tied (the engine's `captainChoice`, DL-287), so that a harness
 *   game meets the Captain's effects. It never changes a Captain it has. Naming moves no Wealth and
 *   sends no one, so the choices after it are made on the same document.
 * - **Equip** the gear the Guild holds onto its Heroes whose slot for it is empty, first, while
 *   they are home: the engine's `gearChoices`, the rule `steady` equips by (M5-S2, DL-49).
 * - **Dispatch, the likeliest Quest first** (v1.1.5-S2, DL-168 item 2; `likeliest`). To each offered
 *   Quest on the Board its Party is the one the engine would send from the Guild's pool, its Heroes
 *   still free whom `playerRestBand` does not keep home (`partyPool`, DL-286): the Best Party, those
 *   the requirements take, then whoever most raises the estimated chance of success up to
 *   `partySizeMin`, then while each raises it by more than `playerPartyMargin` (v1.1.4-S6). Of the
 *   Quests it can staff, it sends the one whose Party has the highest chance of success by that estimate (the Best Party's), ties to the higher reward, then the lower Quest id;
 *   then chooses again, each Quest's Party and chance asked again of the Heroes left, until no Hero is
 *   left or no Quest can be staffed. A Quest it cannot staff is passed over, and a Quest of a Tier
 *   whose Fame minimum is above the Guild's Fame, which it may not take (`fameRefusal`, DL-264). Each Party **carries one
 *   of each consumable** the Guild holds that could serve its Quest (`consumablesFor`, DL-62), while
 *   the Guild has one left after the Parties before it; the chance it is chosen by is the Party's
 *   carrying nothing, as the Best Party weighs it.
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
 *   - **Buy consumables** toward `consumableStock` of each (DL-62): of the consumables the Market
 *     has for sale, the one the Guild has fewest of, lowest key among equals, as many as it lacks
 *     and the Market has, when Wealth is above `buyWealthMultiple` times their cost and would stay
 *     above `consumableReserveUpkeeps` Upkeeps after paying it.
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

  const captain = captainChoice(world, guild, deps);
  const actions: GuildAction[] = [
    ...offersTo(world, guild.id).map((offer): GuildAction => ({ kind: 'declineTransfer', guildId: guild.id, offerId: offer.id })),
    ...(captain === null ? [] : [captain]),
    ...gearChoices(world, guild, deps),
  ];
  // The world does not change in this call, so one Best Party module answers every question (DL-237).
  const best = bestParties(world, guild, deps);
  let available = partyPool(world, guild, deps);
  // A Quest of a Tier whose Fame minimum is above the Guild's Fame is passed over: dispatch would refuse it (DL-264).
  let choices = staffed(best, offeredQuests(world).filter((quest) => fameRefusal(guild, quest, deps) === null), available);
  const left = heldConsumables(world, guild, deps);
  for (let choice = likeliest(choices); choice !== undefined; choice = likeliest(choices)) {
    const { quest, heroIds } = choice;
    const consumables = consumablesFor(quest, heroIds, left, deps);
    actions.push({ kind: 'dispatch', guildId: guild.id, questId: quest.id, heroIds, ...(consumables.length > 0 ? { consumables } : {}) });
    const sent = new Set<HeroId>(heroIds);
    available = available.filter((hero) => !sent.has(hero.id));
    // Each Quest left is staffed and estimated again from the Heroes left; one it could not staff it
    // cannot from fewer.
    choices = staffed(best, choices.filter((other) => other !== choice).map((other) => other.quest), available);
  }

  const purchase =
    infirmaryBuild(guild, deps, policy) ??
    armourPurchase(document, guild, deps, policy) ??
    recruitment(world, guild, deps, policy) ??
    consumablePurchase(world, guild, deps, policy);
  if (purchase !== null) actions.push(purchase);
  return actions;
}

/**
 * A recruit when the Roster is below `rosterLimit` and Wealth above `recruitWealthMultiple` Upkeeps:
 * the cheapest Hero in the pool who would sign (`cheapestUnattached`), if Wealth covers the fee;
 * `null` otherwise.
 */
function recruitment(world: World, guild: Guild, deps: EngineDeps, policy: Readonly<PolicyConfig>): GuildAction | null {
  if (guild.rosterIds.length >= policy.rosterLimit) return null;
  if (guild.wealth <= policy.recruitWealthMultiple * upkeep(guild, world, deps.config, deps.content)) return null;
  const cheapest = cheapestUnattached(world, deps, guild);
  return cheapest !== null && cheapest.fee <= guild.wealth ? { kind: 'recruit', guildId: guild.id, heroId: cheapest.hero.id } : null;
}

/** Whether content defines `definitionKey` as a consumable. */
function isConsumable(definitionKey: ItemDefinitionKey, deps: EngineDeps): boolean {
  return itemDefinition(deps.content, definitionKey)?.kind === 'consumable';
}

/** How many of each consumable the Guild's own holding has, by definition. */
function heldConsumables(world: World, guild: Guild, deps: EngineDeps): Map<ItemDefinitionKey, number> {
  const held = new Map<ItemDefinitionKey, number>();
  for (const stack of holdings(world, { kind: 'guild', id: guild.id }).stacks) {
    if (isConsumable(stack.definitionKey, deps)) held.set(stack.definitionKey, (held.get(stack.definitionKey) ?? 0) + stack.quantity);
  }
  return held;
}

/**
 * What a Party of `heroIds` sent on `quest` carries (DL-62): one of each consumable in `left`, in key
 * order, that could serve the Quest — a `bonus` or a `reroll` whose kinds hold the kind of one of its
 * Encounters, and any `heal` — taking each from `left`, so that the Parties sent the same Turn never
 * ask for more than the Guild holds. None when the Party is empty of such needs or the Guild of them.
 */
function consumablesFor(quest: Quest, heroIds: readonly HeroId[], left: Map<ItemDefinitionKey, number>, deps: EngineDeps): ConsumableRequest[] {
  if (heroIds.length === 0) return [];
  const kinds = new Set(
    quest.encounterKeys.flatMap((key) => (Object.hasOwn(deps.content.encounters, key) ? [deps.content.encounters[key]?.kind] : [])),
  );
  const carried: ConsumableRequest[] = [];
  for (const definitionKey of [...left.keys()].sort(compareByCodeUnit)) {
    const definition = itemDefinition(deps.content, definitionKey);
    if (definition?.kind !== 'consumable' || (left.get(definitionKey) ?? 0) === 0) continue;
    const { effect } = definition;
    const serves = effect.kind === 'heal' || effect.kinds.some((kind) => kinds.has(kind));
    if (!serves) continue;
    carried.push({ definitionKey, quantity: 1 });
    left.set(definitionKey, (left.get(definitionKey) ?? 0) - 1);
  }
  return carried;
}

/**
 * Consumables to buy toward `consumableStock` of each (DL-62): the Guild's count of a definition is
 * its own holding's and its Parties' together, since what a Party carries comes home unless used. Of
 * the consumables on the Market it has fewer of, the one it has fewest of, lowest key among equals,
 * as many as it lacks and the Market has, when Wealth is above `buyWealthMultiple` times their cost
 * and, once it is paid, above `consumableReserveUpkeeps` Upkeeps, so that consumables are bought from
 * what the Guild can spare; `null` when none is lacking, for sale or affordable.
 */
function consumablePurchase(world: World, guild: Guild, deps: EngineDeps, policy: Readonly<PolicyConfig>): GuildAction | null {
  const owned = heldConsumables(world, guild, deps);
  for (const party of Object.values(world.parties)) {
    if (party.guildId !== guild.id) continue;
    for (const stack of holdings(world, { kind: 'party', id: party.id }).stacks) {
      if (isConsumable(stack.definitionKey, deps)) owned.set(stack.definitionKey, (owned.get(stack.definitionKey) ?? 0) + stack.quantity);
    }
  }
  const reserve = policy.consumableReserveUpkeeps * upkeep(guild, world, deps.config, deps.content);
  const [best] = marketStock(world, deps)
    .filter(({ definition }) => definition.kind === 'consumable')
    .map(({ definition, quantity, price }) => {
      const have = owned.get(definition.key) ?? 0;
      return { key: definition.key, have, quantity: Math.min(quantity, policy.consumableStock - have), price };
    })
    .filter(
      ({ quantity, price }) =>
        quantity > 0 && guild.wealth > policy.buyWealthMultiple * price * quantity && guild.wealth - price * quantity > reserve,
    )
    .sort((a, b) => a.have - b.have || compareByCodeUnit(a.key, b.key));
  return best === undefined ? null : { kind: 'buy', guildId: guild.id, definitionKey: best.key, quantity: best.quantity };
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

/** A Quest the policy could send a Party on, the Party (the Best Party) and its chance of success. */
interface Choice {
  quest: Quest;
  heroIds: HeroId[];
  chance: number;
}

/**
 * Each Quest of `quests` for which `best` names a Best Party from `available`, with its Party and that
 * Party's chance of success by the estimate it was chosen by (carrying nothing, held to at most 1 as
 * the Best Party holds it; none for a Quest whose Encounters are drawn on the way, read as 0). None
 * when no Hero is available.
 */
function staffed(best: BestParties, quests: readonly Quest[], available: readonly Hero[]): Choice[] {
  if (available.length === 0) return [];
  return quests.flatMap((quest) => {
    const party = best.party(quest, available);
    return party === null ? [] : [{ quest, heroIds: party.heroIds, chance: Math.min(1, party.estimate?.success ?? 0) }];
  });
}

/**
 * The Quest to send a Party on next (v1.1.5-S2, DL-168 item 2): of `choices`, the Quests the policy
 * can staff from the Heroes still free, the one whose Party has the highest chance of success, ties
 * to the higher reward, then the lower Quest id; `undefined` when there is none.
 */
function likeliest(choices: readonly Choice[]): Choice | undefined {
  let chosen: Choice | undefined;
  for (const choice of choices) if (chosen === undefined || before(choice, chosen)) chosen = choice;
  return chosen;
}

/** Whether `choice` goes before `other`: the higher chance, then the higher reward, then the lower Quest id. */
function before(choice: Choice, other: Choice): boolean {
  if (choice.chance !== other.chance) return choice.chance > other.chance;
  if (choice.quest.reward !== other.quest.reward) return choice.quest.reward > other.quest.reward;
  return compareByCodeUnit(choice.quest.id, other.quest.id) < 0;
}
