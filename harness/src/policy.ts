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
  offeredQuests,
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
}

export const defaultPolicyConfig: Readonly<PolicyConfig> = Object.freeze({
  recruitWealthMultiple: 3,
  rosterLimit: 8,
  buildWealthMultiple: 3,
});

/**
 * What the player's Guild does now, in the order to apply them (INPUTS 4.14, DL-34):
 *
 * - **Dispatch.** The offered Quests on the Board by reward, highest first, then Quest id; to each
 *   in turn, the strongest Party of the size it requires that the Guild's available Heroes can
 *   make (`partyFor`: `partySizeMin`, or two when a Class and a Skill are required and no one
 *   Hero has both), until no Hero is left or no Quest can be staffed. A Quest it cannot staff is
 *   passed over for the next.
 * - **One purchase a Turn**, the first of these that applies:
 *   - **Build** the infirmary's next grade when Wealth is above `buildWealthMultiple` times its cost
 *     (M3-S6, DL-38), until the infirmary is at its top grade.
 *   - **Recruit** when the Roster is below `rosterLimit` and Wealth is above
 *     `recruitWealthMultiple` Upkeeps: the cheapest Hero in the Unattached pool who would sign for
 *     the Guild, lowest id among equal fees (the engine's `cheapestUnattached`, as `steady` recruits,
 *     M3-S5), if Wealth covers the fee. A Hero who would refuse the Guild's Fame is passed over.
 * - **Never transfer** (until M6).
 *
 * Each choice is made on `document` as it stands: a dispatch moves no Wealth and a purchase sends
 * no one, and there is one purchase, so the choices do not depend on one another, and every one
 * is an action the rules accept on it when applied in order. None once the game has ended, and
 * none for a world without a player's Guild.
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

  const build = infirmaryBuild(guild, deps, policy);
  if (build !== null) {
    actions.push(build);
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

/** The offered Quests on the Board (the engine's `offeredQuests`), highest reward first, ties by Quest id. */
function byReward({ world }: WorldDocument): Quest[] {
  return offeredQuests(world).sort((a, b) => b.reward - a.reward || compareByCodeUnit(a.id, b.id));
}
