import type { TraitEffect } from '@heroesim/engine';
import { describe, expect, test } from 'vitest';
import { content } from '../content';
import { traitEffectWords } from './names';

// v1.1.4-S7: a Trait's effects in words, each in the Trait's order and joined by commas, the CLI's
// `traitEffectWords` in the page's words: the Guildmaster's page's, the new-game form's and a Hero's page's.
describe('traitEffectWords', () => {
  test('several effects, of either list, are each worded and joined by commas, in order', () => {
    const effects: TraitEffect[] = [
      { kind: 'statModifiers', modifiers: { dexterity: -2, endurance: -1 } },
      { kind: 'encounterBonus', flat: 2, kinds: ['combat', 'travel'] },
      { kind: 'encounterBonus', flat: -1, tags: ['undead'] },
      { kind: 'encounterBonus', flat: 3, kinds: ['social'], tags: ['court'] },
      { kind: 'classStatBonus', classKey: 'warrior', statKey: 'weaponry', delta: 1 },
      { kind: 'upkeepFactor', factor: 0.9 },
    ];
    expect(traitEffectWords(effects, content)).toBe(
      '-2 Dexterity, -1 Endurance, +2 to every Check of combat or travel Encounters, -1 to every Check of Encounters tagged undead, ' +
        '+3 to every Check of social Encounters or Encounters tagged court, +1 Weaponry to Warriors, Upkeep ×0.9',
    );
  });

  test('none is "No effect"', () => {
    expect(traitEffectWords([], content)).toBe('No effect');
  });

  test('each Injury Trait in content says its Stat changes', () => {
    const words = Object.fromEntries(Object.values(content.heroTraits).map((trait) => [trait.key, traitEffectWords(trait.effects, content)]));
    expect(words).toEqual({
      scarred: '+1 Courage, -1 Charisma',
      lame: '-2 Dexterity, -1 Endurance',
      'one-eyed': '-2 Perception, -1 Weaponry',
      'short-winded': '-2 Endurance, -1 Constitution',
    });
  });
});
