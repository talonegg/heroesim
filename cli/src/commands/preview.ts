// `preview --quest <id> --heroes <id,id> [--consumables <key:n,...>]` (M4-S5, pre-M0 review E6; M5-S3's
// consumables): what a proposed Party of the player's Heroes would meet on a Quest from the Board,
// and what it would carry, before it is sent, after the Quest's narrative, its Beats' lines (DL-269).
// It changes nothing and writes nothing.
//
// The CLI holds no rule: what the Party would meet is the engine's `previewDispatch` (DL-66,
// so the browser shows the same): each requirement met or missed, each
// Hero who cannot go, the Synergies the Party would have and on how many of the Quest's Encounters
// (M4-S3, DL-45), what it would carry, the reward its `negotiatedReward` for the player's
// Guildmaster, and the verdict `dispatch`'s own checks. The preview is a list of sections of words.
// One line for the Party's Morale, from its mean form, naming no Hero (DL-148 item 12, DL-154); then each
// Hero's Fatigue with its band and the Captain marked, and what would relieve the hurt (DL-289).
// The chance of each Encounter and of the Quest in a word, with its percentage floored to 5, if no
// one falls: the engine's estimate (`estimateQuest`, through the preview; DL-148 item 15, DL-157).

import {
  playerGuild,
  previewDispatch,
  unmetRequirements,
  type ChanceBand,
  type DispatchPreview,
  type EngineDeps,
  type Hero,
  type Synergy,
  type WorldDocument,
} from '@heroesim/engine';
import {
  chanceWords,
  consumableEffectWords,
  formEffectWords,
  listed,
  nameIn,
  partyFloorWords,
  playerReading,
  reliefWords,
  requirementWords,
  rosterReading,
  shownPercent,
  unavailableWords,
  type RosterRowReading,
} from '@heroesim/words';
import type { Command } from '../args.js';
import { refusalLine } from '../namer.js';

/** A Hero as the CLI names one: `Brenna Ashcombe (hero-000003)`. */
function heroName(hero: Hero): string {
  return `${hero.name} (${hero.id})`;
}

/** The Quest's narrative: its Beats' lines in the order it plays them (`Quest.beatLines`), as the page's Party builder opens on them (DL-269). */
function beatLines({ quest }: DispatchPreview): string[] {
  return ['Beats', ...quest.beatLines.map((line) => `  ${line}`)];
}

/** Each of the Quest's requirements, met or missed by the Party. */
function requirementLines({ requirements }: DispatchPreview, deps: EngineDeps): string[] {
  const { content } = deps;
  const lines = requirements.map((status) => {
    const verdict = status.met ? 'met' : 'missed';
    switch (status.requirement) {
      case 'party-size':
        return `  ${partyFloorWords(status.partySizeMin)}: ${verdict} (${status.size} named)`;
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

/** A Synergy's bonus in words: `+2`, `×1.15`, or both. */
function bonusWords({ flat, factor }: Synergy['bonus']): string {
  return listed([...(flat === undefined ? [] : [`+${flat}`]), ...(factor === undefined ? [] : [`×${factor}`])]);
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
    const where = synergy.kinds === undefined ? 'on every Encounter' : `on ${listed(synergy.kinds)} Encounters`;
    return `  ${synergy.name}: ${bonusWords(synergy.bonus)} ${where}; ${reachWords(encounters, preview)}.`;
  });
  return ['Synergies', ...lines];
}

/** The Party's Morale, one line for the Party from its mean form, naming no Hero (DL-148 item 12); none for no one. */
function moraleLines({ form }: DispatchPreview): string[] {
  return form === null ? [] : ['Morale', `  ${formEffectWords[form.effect]}.`];
}

/**
 * Each Hero's Fatigue and its band (DL-282), the Guild's Captain among them marked (DL-287), as the page's
 * builder shows them (DL-289), read from the Roster's rows (`rosterReading`); a Hero not on the Roster is
 * said by `heroLines`, and none for a Party of no one.
 */
function fatigueLines({ heroes }: DispatchPreview, roster: readonly RosterRowReading[]): string[] {
  const lines = heroes.flatMap((hero) => {
    const row = roster.find((each) => each.id === hero.id);
    return row === undefined ? [] : [`  ${heroName(hero)}: ${row.fatigue}, ${row.fatigueBand}${row.captain ? ', the Captain' : ''}`];
  });
  return lines.length === 0 ? [] : ['Fatigue', ...lines];
}

/** What would relieve the hurt on the Quest: a Healer in the Party, the heal Items carried (DL-285, DL-289); none for a Party of no one. */
function reliefLines({ heroes, consumables }: DispatchPreview, deps: EngineDeps): string[] {
  return heroes.length === 0 ? [] : ['Relief from the hurt', ...reliefWords(heroes, consumables, deps.content).map((line) => `  ${line}`)];
}

/**
 * How likely the Party is to come through each Encounter and the Quest (v1.1.4-S6, DL-148 item 15):
 * each in a word and its percentage floored to 5 (`shownPercent`), if no one falls, carrying what it would carry. None for a
 * Party of no one; a line saying so when the Encounters are drawn on the way.
 */
function chanceLines({ chances, heroes }: DispatchPreview, deps: EngineDeps): string[] {
  if (heroes.length === 0) return [];
  if (chances === null) return ['Chances', "  Not known: this Quest's Encounters are drawn on the way."];
  const line = (name: string, chance: ChanceBand, success: number) => `  ${name}: ${chanceWords[chance]}, ${shownPercent(success)}%`;
  return [
    'Chances, if no one falls',
    ...chances.encounters.map((it) => line(nameIn(deps.content.encounters, it.encounterKey), it.chance, it.success)),
    line('The Quest', chances.chance, chances.success),
  ];
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
    return `  ${consumable.name} ×${quantity}, of ${held} the Guild holds: ${consumableEffectWords(effect)}${reach}.`;
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
  const setting = { world, content: deps.content, calendar: deps.config };
  const guild = playerGuild(world);
  // A refusal in the refusals' words, as dispatch says it (DL-240).
  if (guild === undefined) return { ok: false, problem: refusalLine({ action: 'preview', reason: 'no-player-guild' }, setting) };
  const consumables = command.consumables ?? [];
  const request = { guildId: guild.id, questId: command.quest, heroIds: command.heroes, consumables };
  const preview = previewDispatch(world, request, deps);
  if (preview === null) {
    return { ok: false, problem: refusalLine({ action: 'dispatch', reason: 'quest-not-offered', questId: command.quest }, setting) };
  }
  const { quest, heroes, refusal } = preview;
  const unmet = unmetRequirements(quest, heroes);

  const sections: string[][] = [
    [
      `Preview: ${quest.id}, ${nameIn(deps.content.questTemplates, quest.templateKey)}, for ${guild.name}.`,
      `Party: ${heroes.length === 0 ? 'nobody' : heroes.map(heroName).join(', ')}.`,
    ],
    beatLines(preview),
    requirementLines(preview, deps),
    heroLines(preview, guild.name),
    synergyLines(preview),
    moraleLines(preview),
    fatigueLines(preview, rosterReading(playerReading(document, deps), guild)),
    reliefLines(preview, deps),
    chanceLines(preview, deps),
    consumableLines(preview, deps),
    [`Reward agreed on a success: ${preview.agreedReward} Wealth, ${preview.offeredReward} offered.`],
    [
      refusal === null
        ? 'Dispatch would send this Party.'
        : unmet.length > 0 && refusal.reason === 'requirement-unmet'
          ? `Dispatch would refuse it: it needs ${unmet.map((it) => requirementWords(it, deps.content)).join(' and ')}.`
          : `Dispatch would refuse it: ${refusalLine(refusal, setting)}`,
    ],
  ];
  const lines = sections.filter((section) => section.length > 0).flatMap((section, index) => (index === 0 ? section : ['', ...section]));
  return { ok: true, lines };
}
