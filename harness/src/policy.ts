// The harness's automatic policy (M2-S12, INPUTS 4.14): what the player's Guild does in a harness
// game, chosen as the same `Action` values a front end produces and applied between Turns through
// the real actions. It is the harness's, not a rule of the game, so its own numbers live here
// (`PolicyConfig`) and not in `GameConfig`. The choices INPUTS 4.14 leaves open are DL-34.
//
// Deterministic: it reads the document and draws no random number, so a seed played twice under
// it plays the same game (ADR-0001). It sends Parties through the engine's own staffing rule,
// `partyFor`, the one `steady` uses (DL-30), rather than keeping a copy of it.

import {
  availableHeroes,
  compareByCodeUnit,
  partyFor,
  playerGuild,
  signingFee,
  signingRefusal,
  unattachedHeroes,
  upkeep,
  type EngineDeps,
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
}

export const defaultPolicyConfig: Readonly<PolicyConfig> = Object.freeze({
  recruitWealthMultiple: 3,
  rosterLimit: 8,
});

/**
 * What the player's Guild does now, in the order to apply them (INPUTS 4.14, DL-34):
 *
 * - **Dispatch.** The offered Quests on the Board by reward, highest first, then Quest id; to each
 *   in turn, the strongest Party of the size it requires that the Guild's available Heroes can
 *   make (`partyFor`: `partySizeMin`, or two when a Class and a Skill are required and no one
 *   Hero has both), until no Hero is left or no Quest can be staffed. A Quest it cannot staff is
 *   passed over for the next.
 * - **Recruit.** When the Roster is below `rosterLimit` and Wealth is above
 *   `recruitWealthMultiple` Upkeeps: the cheapest Hero in the Unattached pool who would sign for
 *   the Guild (the engine's `signingRefusal`, M3-S5), lowest id among equal fees, if Wealth covers
 *   the fee. One a Turn. A Hero who would refuse the Guild's Fame is passed over, never asked.
 * - **Never transfer** (until M6).
 *
 * Each choice is made on `document` as it stands: a dispatch moves no Wealth and a recruit sends
 * no one, so the choices do not depend on one another, and every one is an action the rules
 * accept on it when applied in order. None once the game has ended, and none for a world without
 * a player's Guild.
 */
export function automaticPolicy(
  document: WorldDocument,
  deps: EngineDeps,
  policy: Readonly<PolicyConfig> = defaultPolicyConfig,
): GuildAction[] {
  const { world } = document;
  const guild = playerGuild(world);
  if (world.ended !== null || guild === undefined || guild.foldedOnTurn !== null) return [];

  const actions: GuildAction[] = [];
  let available = availableHeroes(world, guild);
  for (const quest of byReward(document)) {
    if (available.length === 0) break;
    const heroIds = partyFor(quest, available, deps.content);
    if (heroIds === null) continue;
    actions.push({ kind: 'dispatch', guildId: guild.id, questId: quest.id, heroIds });
    const sent = new Set<HeroId>(heroIds);
    available = available.filter((hero) => !sent.has(hero.id));
  }

  if (
    guild.rosterIds.length < policy.rosterLimit &&
    guild.wealth > policy.recruitWealthMultiple * upkeep(guild, world, deps.config)
  ) {
    let cheapest: { heroId: HeroId; fee: number } | null = null;
    for (const hero of unattachedHeroes(world)) {
      if (signingRefusal(guild, hero, deps.config) !== null) continue;
      const fee = signingFee(hero, deps);
      if (cheapest === null || fee < cheapest.fee) cheapest = { heroId: hero.id, fee };
    }
    if (cheapest !== null && cheapest.fee <= guild.wealth) {
      actions.push({ kind: 'recruit', guildId: guild.id, heroId: cheapest.heroId });
    }
  }
  return actions;
}

/** The offered Quests on the Board, highest reward first, ties by Quest id. */
function byReward({ world }: WorldDocument): Quest[] {
  const offered: Quest[] = [];
  for (const questId of world.board) {
    const quest = Object.hasOwn(world.quests, questId) ? world.quests[questId] : undefined;
    if (quest !== undefined && quest.status === 'offered') offered.push(quest);
  }
  return offered.sort((a, b) => b.reward - a.reward || compareByCodeUnit(a.id, b.id));
}
