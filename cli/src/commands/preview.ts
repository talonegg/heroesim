// `preview --quest <id> --heroes <id,id> [--consumables <key:n,...>]` (M4-S5, pre-M0 review E6; M5-S3's
// consumables): what a proposed Party of the player's Heroes would meet on a Quest from the Board,
// and what it would carry, before it is sent. It changes nothing and writes nothing.
//
// The CLI holds no rule: what the Party would meet is the engine's `previewDispatch` (moved there
// from here by M7-S3, DL-66, so the browser shows the same): each requirement met or missed, each
// Hero who cannot go, the Synergies the Party would have and on how many of the Quest's Encounters
// (M4-S3, DL-45), what it would carry, the reward its `negotiatedReward` for the player's
// Guildmaster, and the verdict `dispatch`'s own checks. The preview is a list of sections of words.

import {
  playerGuild,
  previewDispatch,
  unmetRequirements,
  type ConsumableEffect,
  type DispatchPreview,
  type EngineDeps,
  type Hero,
  type Synergy,
  type WorldDocument,
} from '@heroesim/engine';
import type { Command } from '../args.js';
import { nameIn } from '../render.js';
import { explain, requirementWords, unavailableWords } from './dispatch.js';

/** A Hero as the CLI names one: `Brenna Ashcombe (hero-000003)`. */
function heroName(hero: Hero): string {
  return `${hero.name} (${hero.id})`;
}

/** Each of the Quest's requirements, met or missed by the Party. */
function requirementLines({ requirements }: DispatchPreview, deps: EngineDeps): string[] {
  const { content } = deps;
  const lines = requirements.map((status) => {
    const verdict = status.met ? 'met' : 'missed';
    switch (status.requirement) {
      case 'party-size':
        return `  A Party of ${status.partySizeMin} to ${status.partySizeMax}: ${verdict} (${status.size} named)`;
      case 'class':
        return `  A ${nameIn(content.classes, status.classKey)}: ${verdict}`;
      case 'skill':
        return `  A Hero with ${nameIn(content.skills, status.skillKey)}: ${verdict}`;
    }
  });
  return ['Requirements', ...lines];
}

/** Each Hero named who is not the Guild's or cannot go, by dispatch's own test. */
function heroLines({ problems }: DispatchPreview, guildName: string): string[] {
  const lines = problems.map(({ heroId, hero, because }) =>
    because === 'not-on-roster'
      ? `  ${hero === undefined ? heroId : heroName(hero)} is not on the Roster of ${guildName}.`
      : `  ${hero === undefined ? heroId : heroName(hero)} ${unavailableWords[because]} and cannot go.`,
  );
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

/** How many of the Quest's Encounters something reaches, or that they are drawn on the way (DL-42 item 7). */
function reachWords(encounters: number | null, { encounterKinds }: DispatchPreview): string {
  return encounters === null ? "this Quest's Encounters are drawn on the way" : `${encounters} of this Quest's ${encounterKinds.length}`;
}

/**
 * The Synergies the named Heroes would have together (M4-S3), each with its bonus, the kinds of
 * Encounter it adds to, and how many of this Quest's Encounters those are; or that they have none.
 */
function synergyLines(preview: DispatchPreview): string[] {
  if (preview.synergies.length === 0) return ['Synergies', '  None: this Party meets no Synergy.'];
  const lines = preview.synergies.map(({ synergy, encounters }) => {
    const where = synergy.kinds === undefined ? 'on every Encounter' : `on ${listWords(synergy.kinds)} Encounters`;
    return `  ${synergy.name}: ${bonusWords(synergy.bonus)} ${where}; ${reachWords(encounters, preview)}.`;
  });
  return ['Synergies', ...lines];
}

/** What a consumable does, in words (M5-S3, DL-50). */
function effectWords(effect: ConsumableEffect): string {
  switch (effect.kind) {
    case 'bonus':
      return `+${effect.flat} to a Check on ${listWords(effect.kinds)} Encounters, one a Check`;
    case 'reroll':
      return `a failed Check on ${listWords(effect.kinds)} Encounters rolled again, one a Check`;
    case 'heal':
      return `an Injury taken on the Quest heals ${effect.days} Days sooner, one an Injury`;
  }
}

/**
 * What the Party would carry (M5-S3): each consumable named, how many, how many the Guild holds,
 * what it does and, for a bonus or a reroll, on how many of this Quest's Encounters; or, with none
 * named, the consumables the Guild holds that it could carry.
 */
function consumableLines(preview: DispatchPreview, deps: EngineDeps): string[] {
  const { content } = deps;
  if (preview.consumables.length === 0) {
    const holding = preview.held.map((stack) => `${nameIn(content.items, stack.definitionKey)} ×${stack.quantity} (${stack.definitionKey})`);
    return [
      'Consumables',
      '  None carried.',
      ...(holding.length === 0 ? [] : [`  The Guild holds ${holding.join(', ')}: name them with --consumables <key:n,...>.`]),
    ];
  }
  const lines = preview.consumables.map(({ definitionKey, quantity, consumable, held, encounters }) => {
    if (consumable === undefined) return `  ${nameIn(content.items, definitionKey)} ×${quantity}: not a consumable.`;
    const { effect } = consumable;
    const reach = effect.kind === 'heal' ? '' : `; ${reachWords(encounters, preview)}`;
    return `  ${consumable.name} ×${quantity}, of ${held} the Guild holds: ${effectWords(effect)}${reach}.`;
  });
  return ['Consumables', ...lines];
}

/**
 * Previews the named Heroes of the player's Guild on the named Quest under the save's own deps:
 * the requirements, any Hero who cannot go, the Synergies they would have, the consumables they
 * would carry, the reward the player's Guildmaster would agree, and whether `dispatch` would send
 * the Party or why not. The save is left as it was.
 */
export function previewParty(
  command: Extract<Command, { name: 'preview' }>,
  document: WorldDocument,
  deps: EngineDeps,
): { ok: true; lines: string[] } | { ok: false; problem: string } {
  const { world } = document;
  const guild = playerGuild(world);
  if (guild === undefined) return { ok: false, problem: "The save has no player's Guild." };
  const consumables = command.consumables ?? [];
  const request = { guildId: guild.id, questId: command.quest, heroIds: command.heroes, consumables };
  const preview = previewDispatch(world, request, deps);
  if (preview === null) {
    return { ok: false, problem: `${command.quest} is not on the Board: it has been taken or has expired, or was never offered.` };
  }
  const { quest, heroes, refusal } = preview;
  const unmet = unmetRequirements(quest, heroes);

  const sections: string[][] = [
    [
      `Preview: ${quest.id}, ${nameIn(deps.content.questTemplates, quest.templateKey)}, for ${guild.name}.`,
      `Party: ${heroes.length === 0 ? 'nobody' : heroes.map(heroName).join(', ')}.`,
    ],
    requirementLines(preview, deps),
    heroLines(preview, guild.name),
    synergyLines(preview),
    consumableLines(preview, deps),
    [`Reward agreed on a success: ${preview.agreedReward} Wealth, ${preview.offeredReward} offered.`],
    [
      refusal === null
        ? 'Dispatch would send this Party.'
        : unmet.length > 0 && refusal.reason === 'requirement-unmet'
          ? `Dispatch would refuse it: it needs ${unmet.map((it) => requirementWords(it, deps.content)).join(' and ')}.`
          : `Dispatch would refuse it: ${explain(refusal, document, deps.content)}`,
    ],
  ];
  const lines = sections.filter((section) => section.length > 0).flatMap((section, index) => (index === 0 ? section : ['', ...section]));
  return { ok: true, lines };
}
