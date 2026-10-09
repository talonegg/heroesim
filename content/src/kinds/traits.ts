// The Traits (DL-150 items 1 to 3): two lists, the Guildmaster's in `guildmaster-traits.json` and
// the Hero's in `hero-traits.json`, keyed apart, so that a key read anywhere names one Trait. Each
// list's exclusions name Traits of the same list other than the Trait itself, each once, and hold both
// ways, so that a rule reads the same pairs from either side (DL-100 item 3, DL-102). A Guildmaster
// Trait's cost is a whole number, a buff's positive and a penalty's negative, though the sign is the
// author's to choose. A Guildmaster Trait carries one effect or more, a Hero Trait none or more, each
// of its list's kinds (`trait-effects.ts`).

import type { GuildmasterTrait, HeroTrait } from '@heroesim/engine/content';
import { integer, listOfRows, rowOfKinds, strings, table, text } from './read.js';
import { checkRowKeys, repeated, type KindRules } from './rules.js';
import { checkEffect, effectUnion, guildmasterTraitEffects, heroTraitEffects, kindsInWords } from './trait-effects.js';

export const guildmasterTraitsKind = table<'guildmasterTraits', GuildmasterTrait>(
  'guildmasterTraits',
  'guildmaster-traits.json',
  { name: text, cost: integer, excludes: strings, effects: listOfRows(rowOfKinds(effectUnion(guildmasterTraitEffects))) }, 'a Guildmaster Trait',
);

export const heroTraitsKind = table<'heroTraits', HeroTrait>(
  'heroTraits',
  'hero-traits.json',
  { name: text, excludes: strings, effects: listOfRows(rowOfKinds(effectUnion(heroTraitEffects))) }, 'a Hero Trait',
);

export const guildmasterTraitsRules: KindRules = {
  key: 'guildmasterTraits',
  check(set, problems, known) {
    checkRowKeys('guildmasterTraits', set.guildmasterTraits, problems);
    checkExclusions('guildmasterTraits', set.guildmasterTraits, 'a Guildmaster Trait', problems);
    for (const [key, trait] of Object.entries(set.guildmasterTraits)) {
      const where = `guildmasterTraits.${key}`;
      if (!Number.isSafeInteger(trait.cost)) problems.push(`${where}.cost is ${trait.cost}; it is a whole number`);
      if (trait.effects.length === 0) {
        problems.push(`${where}.effects is empty; a Guildmaster Trait carries one effect or more (${kindsInWords(guildmasterTraitEffects)})`);
      }
      trait.effects.forEach((effect, index) => checkEffect(`${where}.effects.${index}`, effect, guildmasterTraitEffects, known, problems));
    }
  },
};

export const heroTraitsRules: KindRules = {
  key: 'heroTraits',
  check(set, problems, known) {
    checkRowKeys('heroTraits', set.heroTraits, problems);
    for (const key of Object.keys(set.heroTraits)) {
      if (Object.hasOwn(set.guildmasterTraits, key)) {
        problems.push(`heroTraits.${key}: "${key}" is also a Guildmaster Trait; a Trait's key is in guildmaster-traits.json or hero-traits.json, not both`);
      }
    }
    checkExclusions('heroTraits', set.heroTraits, 'a Hero Trait', problems);
    for (const [key, trait] of Object.entries(set.heroTraits)) {
      trait.effects.forEach((effect, index) => checkEffect(`heroTraits.${key}.effects.${index}`, effect, heroTraitEffects, known, problems));
    }
  },
};

/** `list`'s exclusions, at `table`: each names another Trait of `list`, once, which excludes it in return. */
function checkExclusions(table: string, list: Readonly<Record<string, { excludes: readonly string[] }>>, what: string, problems: string[]): void {
  for (const [key, trait] of Object.entries(list)) {
    const where = `${table}.${key}.excludes`;
    for (const other of trait.excludes) {
      if (other === key) {
        problems.push(`${where}: a Trait cannot exclude itself`);
      } else if (!Object.hasOwn(list, other)) {
        problems.push(`${where}: "${other}" is not ${what}`);
      } else if (!(list[other]?.excludes.includes(key) ?? false)) {
        problems.push(`${where}: "${other}" does not exclude "${key}" in return`);
      }
    }
    for (const other of repeated(trait.excludes)) problems.push(`${where}: "${other}" is listed twice`);
  }
}
