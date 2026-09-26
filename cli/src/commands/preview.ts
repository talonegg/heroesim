// `preview --quest <id> --heroes <id,id>` (M4-S5, pre-M0 review E6): what a proposed Party of the
// player's Heroes would meet on a Quest from the Board, before it is sent. It changes nothing and
// writes nothing.
//
// The CLI holds no rule: each requirement met or missed is the engine's `unmetRequirements`, each
// Hero who cannot go its `unavailability`, the Synergies the Party would have its `synergiesFor`
// and on which of the Quest's Encounters its `appliesOn` (M4-S3, DL-45), the reward its
// `negotiatedReward` for the player's Guildmaster, and the verdict is `dispatch`'s own rule,
// `applyDispatch`, run on a copy of the world and thrown away. The preview is a list of sections.

import {
  appliesOn,
  applyDispatch,
  guildmasterOf,
  negotiatedReward,
  playerGuild,
  synergiesFor,
  unavailability,
  unmetRequirements,
  type EncounterKind,
  type EngineDeps,
  type Guild,
  type Hero,
  type Quest,
  type Synergy,
  type WorldDocument,
} from '@heroesim/engine';
import type { Command } from '../args.js';
import { nameIn, rowIn } from '../render.js';
import { explain, requirementWords, unavailableWords } from './dispatch.js';

/** A Hero as the CLI names one: `Brenna Ashcombe (hero-000003)`. */
function heroName(hero: Hero): string {
  return `${hero.name} (${hero.id})`;
}

/** What a proposed Party gives the preview to say. */
interface Proposal {
  document: WorldDocument;
  deps: EngineDeps;
  guild: Guild;
  quest: Quest;
  /** The Heroes named that have rows, in the order named. */
  heroes: Hero[];
}

/** Each of the Quest's requirements, met or missed by the Party. */
function requirementLines({ quest, heroes, deps }: Proposal): string[] {
  const { content } = deps;
  const { partySizeMin, partySizeMax, classKey, skillKey } = quest.requirements;
  const unmet = unmetRequirements(quest, heroes);
  const missed = (kind: string): boolean => unmet.some((it) => it.requirement === kind);
  const lines = [`  A Party of ${partySizeMin} to ${partySizeMax}: ${missed('party-size') ? 'missed' : 'met'} (${heroes.length} named)`];
  if (classKey !== undefined) lines.push(`  A ${nameIn(content.classes, classKey)}: ${missed('class') ? 'missed' : 'met'}`);
  if (skillKey !== undefined) lines.push(`  A Hero with ${nameIn(content.skills, skillKey)}: ${missed('skill') ? 'missed' : 'met'}`);
  return ['Requirements', ...lines];
}

/** Each Hero named who is not the Guild's or cannot go, by dispatch's own test. */
function heroLines({ guild, heroes }: Proposal, named: readonly string[]): string[] {
  const lines: string[] = [];
  for (const heroId of named) {
    const hero = heroes.find((it) => it.id === heroId);
    if (hero === undefined || hero.guildId !== guild.id) {
      lines.push(`  ${hero === undefined ? heroId : heroName(hero)} is not on the Roster of ${guild.name}.`);
      continue;
    }
    const because = unavailability(hero);
    if (because !== null) lines.push(`  ${heroName(hero)} ${unavailableWords[because]} and cannot go.`);
  }
  return lines.length === 0 ? [] : ['Heroes', ...lines];
}

/** A list in words: `combat`, `combat and travel`, `combat, travel and stealth`. */
function listWords(words: readonly string[]): string {
  return words.length <= 1 ? words.join('') : `${words.slice(0, -1).join(', ')} and ${words.at(-1) ?? ''}`;
}

/** A Synergy's bonus in words: `+2`, `×1.15`, or both. */
function bonusWords({ flat, factor }: Synergy['bonus']): string {
  return listWords([...(flat === undefined ? [] : [`+${flat}`]), ...(factor === undefined ? [] : [`×${factor}`])]);
}

/**
 * The Synergies the named Heroes would have together (M4-S3), each with its bonus, the kinds of
 * Encounter it adds to, and how many of this Quest's Encounters those are; or that they have none.
 * A Quest drawn before M4 has no Encounters yet: they are drawn on the way (DL-42 item 7).
 */
function synergyLines({ quest, heroes, deps }: Proposal): string[] {
  const { content } = deps;
  const synergies = synergiesFor(heroes, content);
  if (synergies.length === 0) return ['Synergies', '  None: this Party meets no Synergy.'];
  const kinds: EncounterKind[] = quest.encounterKeys.flatMap((key) => rowIn(content.encounters, key)?.kind ?? []);
  const lines = synergies.map((synergy) => {
    const where = synergy.kinds === undefined ? 'on every Encounter' : `on ${listWords(synergy.kinds)} Encounters`;
    const reach =
      kinds.length === 0
        ? "this Quest's Encounters are drawn on the way"
        : `${kinds.filter((kind) => appliesOn(synergy, kind)).length} of this Quest's ${kinds.length}`;
    return `  ${synergy.name}: ${bonusWords(synergy.bonus)} ${where}; ${reach}.`;
  });
  return ['Synergies', ...lines];
}

/**
 * Previews the named Heroes of the player's Guild on the named Quest under the save's own deps:
 * the requirements, any Hero who cannot go, the Synergies they would have, the reward the player's
 * Guildmaster would agree, and whether `dispatch` would send the Party or why not. The save is left
 * as it was.
 */
export function previewParty(
  command: Extract<Command, { name: 'preview' }>,
  document: WorldDocument,
  deps: EngineDeps,
): { ok: true; lines: string[] } | { ok: false; problem: string } {
  const { world } = document;
  const guild = playerGuild(world);
  if (guild === undefined) return { ok: false, problem: "The save has no player's Guild." };
  const quest = rowIn(world.quests, command.quest);
  if (quest === undefined || quest.status !== 'offered' || !world.board.includes(quest.id)) {
    return { ok: false, problem: `${command.quest} is not on the Board: it has been taken or has expired, or was never offered.` };
  }
  const heroes = command.heroes.flatMap((heroId) => rowIn(world.heroes, heroId) ?? []);
  const proposal: Proposal = { document, deps, guild, quest, heroes };

  const agreed = negotiatedReward(quest.reward, guildmasterOf(guild, world), deps.content, deps.config);
  const request = { guildId: guild.id, questId: quest.id, heroIds: command.heroes };
  // dispatch's own rule, on a copy that is thrown away: the verdict is the rule's, never a copy of it.
  const verdict = applyDispatch(structuredClone(world), request, deps);
  const unmet = unmetRequirements(quest, heroes);

  const sections: string[][] = [
    [
      `Preview: ${quest.id}, ${nameIn(deps.content.questTemplates, quest.templateKey)}, for ${guild.name}.`,
      `Party: ${heroes.length === 0 ? 'nobody' : heroes.map(heroName).join(', ')}.`,
    ],
    requirementLines(proposal),
    heroLines(proposal, command.heroes),
    synergyLines(proposal),
    [`Reward agreed on a success: ${agreed} Wealth, ${quest.reward} offered.`],
    [
      verdict.ok
        ? 'Dispatch would send this Party.'
        : unmet.length > 0 && verdict.rejection.reason === 'requirement-unmet'
          ? `Dispatch would refuse it: it needs ${unmet.map((it) => requirementWords(it, deps.content)).join(' and ')}.`
          : `Dispatch would refuse it: ${explain(verdict.rejection, document, deps.content)}`,
    ],
  ];
  const lines = sections.filter((section) => section.length > 0).flatMap((section, index) => (index === 0 ? section : ['', ...section]));
  return { ok: true, lines };
}
