// What a Trait and an Item do, in words (v1.1.6-S11, DL-186 item 1): a Trait's effects (M4-S5,
// v1.1.4-S7), Gear's Stat modifiers (M5-S2), a Consumable's effect as a Party's preview says it
// (M5-S3) and as the Market's cell says it, and an Item's kind. Words only; no rule; one copy for
// the CLI and the page alike (DL-197). "No effect" stands alone, so it begins with a capital
// (docs/agents/ui-text.md).

import type { ConsumableEffect, ContentSet, GearDefinition, ItemDefinition, TraitEffect } from '@heroesim/engine/content';
import { capitalised, listed, nameIn, signed } from './names.js';

/** The content an effect's keys are named from. */
export type EffectNames = Pick<ContentSet, 'stats' | 'classes'>;

/**
 * A Trait's effects in words, each in the Trait's order and joined by commas (v1.1.4-S7): `+1
 * Weaponry to Warriors`, `Morale baseline -5`, `Upkeep ×0.9`, a Hero Trait's `-2 Dexterity, -1
 * Endurance` and `+2 to every Check of combat or travel Encounters`; `No effect` for none.
 */
export function traitEffectWords(effects: readonly TraitEffect[], names: EffectNames): string {
  if (effects.length === 0) return 'No effect';
  return effects.map((effect) => traitEffectPart(effect, names)).join(', ');
}

/** One effect of a Trait in words, as `traitEffectWords` joins them. */
function traitEffectPart(effect: TraitEffect, names: EffectNames): string {
  switch (effect.kind) {
    case 'classStatBonus':
      return `${signed(effect.delta)} ${nameIn(names.stats, effect.statKey)} to ${nameIn(names.classes, effect.classKey)}s`;
    case 'guildMoraleShift':
      return `Morale baseline ${signed(effect.delta)}`;
    case 'upkeepFactor':
      return `Upkeep ×${effect.factor}`;
    case 'statModifiers':
      return Object.entries(effect.modifiers)
        .map(([statKey, delta]) => `${signed(delta)} ${nameIn(names.stats, statKey)}`)
        .join(', ');
    case 'encounterBonus': {
      const kinds = effect.kinds ?? [];
      const tags = effect.tags ?? [];
      const on = [...(kinds.length === 0 ? [] : [`${kinds.join(' or ')} Encounters`]), ...(tags.length === 0 ? [] : [`Encounters tagged ${tags.join(' or ')}`])];
      return `${signed(effect.flat)} to every Check of ${on.join(' or ')}`;
    }
  }
}

/** Gear's Stat modifiers in words, `Weaponry +2, Strength +1` (M5-S2). */
export function modifierWords(gear: Pick<GearDefinition, 'statModifiers'>, names: Pick<ContentSet, 'stats'>): string {
  return Object.entries(gear.statModifiers)
    .map(([statKey, delta]) => `${nameIn(names.stats, statKey)} ${signed(delta)}`)
    .join(', ');
}

/**
 * What a Consumable does, as a Party's preview says it after its name and count (M5-S3, DL-50):
 * `+2 to a Check on combat Encounters, one a Check`. It continues a sentence, so it begins in lower
 * case unless with a sign.
 */
export function consumableEffectWords(effect: ConsumableEffect): string {
  switch (effect.kind) {
    case 'bonus':
      return `+${effect.flat} to a Check on ${listed(effect.kinds)} Encounters, one a Check`;
    case 'reroll':
      return `a failed Check on ${listed(effect.kinds)} Encounters rolled again, one a Check`;
    case 'heal':
      return `an Injury taken on the Quest heals ${effect.days} Days sooner, one an Injury`;
  }
}

/**
 * What an Item does, as the Market's cell says it, standing alone: Gear's Stat modifiers, `Weaponry
 * +2`, or a Consumable's effect, `+2 on a combat Encounter`, `Rolls a failed combat or travel
 * Encounter again`, `An Injury on the Quest heals 3 Days sooner`.
 */
export function itemEffectWords(definition: ItemDefinition, names: Pick<ContentSet, 'stats'>): string {
  if (definition.kind === 'gear') return modifierWords(definition, names);
  const { effect } = definition;
  switch (effect.kind) {
    case 'bonus':
      return `+${effect.flat} on a ${effect.kinds.join(' or ')} Encounter`;
    case 'reroll':
      return capitalised(`rolls a failed ${effect.kinds.join(' or ')} Encounter again`);
    case 'heal':
      return capitalised(`an Injury on the Quest heals ${effect.days} Days sooner`);
  }
}

/** An Item's kind as a cell says it: `Weapon Gear` for Gear of its slot, or `Consumable`. */
export function kindWords(definition: ItemDefinition): string {
  return definition.kind === 'gear' ? `${capitalised(definition.slot)} Gear` : 'Consumable';
}

/**
 * An Item's kind and whether it is a Unique Item, as the Market's and the Stores' cells say it:
 * `Weapon Gear, Unique Item`, its first word the Kind filter's chip (DL-125 item 9).
 */
export function kindOf(definition: ItemDefinition): string {
  const kind = kindWords(definition);
  return definition.unique ? `${kind}, Unique Item` : kind;
}
