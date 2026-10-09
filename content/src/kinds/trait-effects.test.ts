import type { GuildmasterTraitEffect, HeroTraitEffect } from '@heroesim/engine/content';
import { describe, expect, test } from 'vitest';
import { validateContent } from '../validate.js';
import { refusalOf, shipped } from './content.test-support.js';
import { guildmasterTraitEffects, heroTraitEffects, type EffectKinds } from './trait-effects.js';

// The effect kinds of a Trait, each described once by its fields (DL-243): the reader, the rules, the
// editor's forms and its scan of the code derive from the description, which the engine's unions
// hold. A kind or a field the engine has and the description misses fails to compile; a kind a set
// built in memory names and the description does not is refused.

describe("the effect kinds' description", () => {
  test('is complete by construction: a kind or a field left out fails to compile', () => {
    // @ts-expect-error -- upkeepFactor, a kind of the engine's union, is not described.
    const missingKind: EffectKinds<GuildmasterTraitEffect> = { classStatBonus: guildmasterTraitEffects.classStatBonus, guildMoraleShift: guildmasterTraitEffects.guildMoraleShift };
    const missingField: EffectKinds<HeroTraitEffect> = {
      statModifiers: heroTraitEffects.statModifiers,
      // @ts-expect-error -- encounterBonus's `tags`, optional in the engine's type, is not described.
      encounterBonus: { label: 'An Encounter bonus', fields: { flat: { type: 'number', label: 'Bonus' }, kinds: { type: 'encounter-kinds', label: 'Kinds', optional: true } } },
    };
    const optionalWrong: EffectKinds<HeroTraitEffect> = {
      statModifiers: heroTraitEffects.statModifiers,
      encounterBonus: {
        label: 'An Encounter bonus',
        fields: {
          // @ts-expect-error -- `flat` is required in the engine's type, so it is never optional.
          flat: { type: 'number', label: 'Bonus', optional: true },
          kinds: { type: 'encounter-kinds', label: 'Kinds', optional: true },
          tags: { type: 'tags', label: 'Tags', optional: true },
        },
      },
    };

    expect([missingKind, missingField, optionalWrong]).toHaveLength(3);
    expect(Object.keys(guildmasterTraitEffects)).toEqual(['classStatBonus', 'guildMoraleShift', 'upkeepFactor']);
    expect(Object.keys(heroTraitEffects)).toEqual(['statModifiers', 'encounterBonus']);
  });

  test("holds every field of every kind to its description, in a set built in memory, naming the field's path", () => {
    const content = structuredClone(shipped);
    Object.assign(content.guildmasterTraits['old-soldier'] ?? {}, {
      effects: [
        { kind: 'classStatBonus', classKey: 'bard', statKey: 'judgement', delta: 0.5 },
        { kind: 'guildMoraleShift', delta: 0 },
        { kind: 'upkeepFactor', factor: -1 },
      ],
    });
    Object.assign(content.heroTraits['battle-tried'] ?? {}, {
      effects: [
        { kind: 'statModifiers', modifiers: { luck: 1, strength: 0 } },
        { kind: 'encounterBonus', flat: 0, kinds: ['naval', 'combat', 'combat'], tags: ['Night'] },
        { kind: 'encounterBonus', flat: 1 },
      ],
    });

    expect(refusalOf(() => validateContent(content)).problems).toEqual([
      'guildmasterTraits.old-soldier.effects.0.classKey: "bard" is not a Class',
      'guildmasterTraits.old-soldier.effects.0.statKey: "judgement" is not a Hero Stat',
      'guildmasterTraits.old-soldier.effects.0.delta is 0.5; it is a whole number other than 0',
      'guildmasterTraits.old-soldier.effects.1.delta is 0; it is a number other than 0',
      'guildmasterTraits.old-soldier.effects.2.factor is -1; it is a number above 0',
      'heroTraits.battle-tried.effects.0.modifiers: "luck" is not a Hero Stat',
      'heroTraits.battle-tried.effects.0.modifiers.strength is 0; it is a whole number other than 0',
      'heroTraits.battle-tried.effects.1.flat is 0; it is a number other than 0',
      'heroTraits.battle-tried.effects.1.kinds: "naval" is not a kind of Encounter',
      'heroTraits.battle-tried.effects.1.kinds: "combat" is listed twice',
      'heroTraits.battle-tried.effects.1.tags: "Night" is not kebab-case',
      'heroTraits.battle-tried.effects.2 names no Encounter kind and no tag: it adds to the Encounters it names',
    ]);
  });

  test('holds an optional field null, in a set built in memory, as left out', () => {
    const content = structuredClone(shipped);
    Object.assign(content.heroTraits['battle-tried'] ?? {}, {
      effects: [
        { kind: 'encounterBonus', flat: 1, kinds: null },
        { kind: 'encounterBonus', flat: 1, kinds: ['combat'], tags: null },
      ],
    });

    expect(refusalOf(() => validateContent(content)).problems).toEqual([
      'heroTraits.battle-tried.effects.0 names no Encounter kind and no tag: it adds to the Encounters it names',
    ]);
  });

  test('refuses a kind the description does not have, in a set built in memory, naming the kinds there are', () => {
    const content = structuredClone(shipped);
    Object.assign(content.guildmasterTraits['old-soldier'] ?? {}, { effects: [{ kind: 'statModifiers', modifiers: { strength: 1 } }] });
    Object.assign(content.heroTraits['battle-tried'] ?? {}, { effects: [{ kind: 'upkeepFactor', factor: 2 }] });

    expect(refusalOf(() => validateContent(content)).problems).toEqual([
      'guildmasterTraits.old-soldier.effects.0.kind is "statModifiers"; it is classStatBonus, guildMoraleShift or upkeepFactor',
      'heroTraits.battle-tried.effects.0.kind is "upkeepFactor"; it is statModifiers or encounterBonus',
    ]);
  });
});
