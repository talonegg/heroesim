import { loadContent } from '@heroesim/content/node';
import type { ConsumableEffect, ItemDefinition, TraitEffect } from '@heroesim/engine/content';
import { describe, expect, test } from 'vitest';
import { consumableEffectWords, itemEffectWords, kindOf, kindWords, modifierWords, traitEffectWords } from './effects.js';

// DL-186 item 1: what a Trait and an Item do, the CLI's words and the page's, one table.
// The CLI's `render.test.ts` and the page's `names.test.ts` hold none of the Trait's cases, and the
// CLI's "no effect" is the page's "No effect".

const content = loadContent();

const sword: ItemDefinition = {
  key: 'test-sword',
  name: 'Test sword',
  kind: 'gear',
  slot: 'weapon',
  statModifiers: { weaponry: 2, strength: 1, charisma: -1 },
  unique: false,
  buyPrice: 10,
  tags: [],
};
const blade: ItemDefinition = { ...sword, key: 'test-blade', unique: true };
const consumable = (effect: ConsumableEffect): ItemDefinition => ({ key: 'test', name: 'Test', kind: 'consumable', effect, unique: false, buyPrice: 5, tags: [] });

describe("a Trait's effects", () => {
  test.each<[string, TraitEffect[], string]>([
    ['none, standing alone', [], 'No effect'],
    [
      'several, of either list, each worded and joined by commas, in order',
      [
        { kind: 'statModifiers', modifiers: { dexterity: -2, endurance: -1 } },
        { kind: 'encounterBonus', flat: 2, kinds: ['combat', 'travel'] },
        { kind: 'encounterBonus', flat: -1, tags: ['undead'] },
        { kind: 'encounterBonus', flat: 3, kinds: ['social'], tags: ['court'] },
        { kind: 'classStatBonus', classKey: 'warrior', statKey: 'weaponry', delta: 1 },
        { kind: 'upkeepFactor', factor: 0.9 },
      ],
      '-2 Dexterity, -1 Endurance, +2 to every Check of combat or travel Encounters, -1 to every Check of Encounters tagged undead, ' +
        '+3 to every Check of social Encounters or Encounters tagged court, +1 Weaponry to Warriors, Upkeep ×0.9',
    ],
    ['a Morale baseline', [{ kind: 'guildMoraleShift', delta: -5 }], 'Morale baseline -5'],
    [
      'the lore kind by its key, and a tag as written',
      [
        { kind: 'encounterBonus', flat: 2, kinds: ['lore'] },
        { kind: 'encounterBonus', flat: 1, kinds: ['arcane', 'lore'], tags: ['delve'] },
      ],
      '+2 to every Check of lore Encounters, +1 to every Check of arcane or lore Encounters or Encounters tagged delve',
    ],
    ['a key content lacks, as it is', [{ kind: 'classStatBonus', classKey: 'bard', statKey: 'luck', delta: 2 }], '+2 luck to bards'],
  ])('%s', (_, effects, words) => {
    expect(traitEffectWords(effects, content)).toBe(words);
  });
});

describe('what an Item does, and its kind', () => {
  test.each<[string, string, string]>([
    ["Gear's Stat modifiers", modifierWords({ statModifiers: { weaponry: 2, strength: 1 } }, content), 'Weaponry +2, Strength +1'],
    ['a key content lacks, as it is', modifierWords({ statModifiers: { luck: -1 } }, content), 'luck -1'],
    // A Party's preview, after the Consumable's name: it continues a sentence (DL-50).
    ['a bonus, in a preview', consumableEffectWords({ kind: 'bonus', flat: 3, kinds: ['combat'] }), '+3 to a Check on combat Encounters, one a Check'],
    [
      'a reroll, in a preview',
      consumableEffectWords({ kind: 'reroll', kinds: ['combat', 'travel', 'arcane'] }),
      'a failed Check on combat, travel and arcane Encounters rolled again, one a Check',
    ],
    ['a heal, in a preview', consumableEffectWords({ kind: 'heal', days: 5 }), 'an Injury taken on the Quest weighs less on the rest of it and heals 5 Days sooner, one an Injury'],
    // The Market's cell, which stands alone (DL-125 item 9).
    ["Gear, in the Market's cell", itemEffectWords(sword, content), 'Weaponry +2, Strength +1, Charisma -1'],
    ["a bonus, in the Market's cell", itemEffectWords(consumable({ kind: 'bonus', flat: 3, kinds: ['combat', 'social'] }), content), '+3 on a combat or social Encounter'],
    ["a reroll, in the Market's cell", itemEffectWords(consumable({ kind: 'reroll', kinds: ['travel'] }), content), 'Rolls a failed travel Encounter again'],
    ["a heal, in the Market's cell", itemEffectWords(consumable({ kind: 'heal', days: 5 }), content), 'An Injury on the Quest weighs less and heals 5 Days sooner'],
    ["Gear's kind, by its slot", kindWords(sword), 'Weapon Gear'],
    ["a Consumable's kind", kindWords(consumable({ kind: 'heal', days: 1 })), 'Consumable'],
    ['a common Item, in the Market', kindOf(sword), 'Weapon Gear'],
    ['a Unique Item, in the Market', kindOf(blade), 'Weapon Gear, Unique Item'],
  ])('%s', (_, words, expected) => {
    expect(words).toBe(expected);
  });

  test("every Item in content has words for what it does and its kind, each beginning as a cell's must", () => {
    for (const definition of Object.values(content.items)) {
      expect(itemEffectWords(definition, content), definition.key).toMatch(/^[A-Z+-]/);
      expect(kindOf(definition), definition.key).toMatch(/^[A-Z]/);
    }
  });
});
