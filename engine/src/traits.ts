// The two lists of Traits (v1.1.4-S7, DL-150 items 1 and 3): a Guildmaster's in
// `guildmaster-traits.json`, a Hero's in `hero-traits.json`, keyed apart, so a key names a Trait
// of one list or of none. A Guildmaster or a Hero holds 0 or more Traits of their own list, never
// two of which one excludes the other.
//
// A Hero Trait's effects (v1.1.4-S7, DL-148 items 24 to 26, DL-150 items 5 and 8): its Stat changes,
// which `effectiveStats` adds as it adds gear's (`traitStatModifiers`), and its Encounter bonus, which
// a Check's capability adds once for the Party (`traitEncounterBonus`); and the two rules of a
// conflict, read either way round: an earned Trait is not granted beside one it conflicts with
// (`mayEarn`), and one an Injury leaves replaces those it conflicts with (`replacedBy`).

import type { ContentSet, Encounter, HeroTrait, HeroTraitEffect, StatKey, Trait, TraitKey } from './content-types.js';

/** What the Traits are read from: both lists. */
export type TraitContent = Pick<ContentSet, 'guildmasterTraits' | 'heroTraits'>;

/** The Trait keyed `key` in either list, or `undefined` for a key content does not define (rule 5). */
export function traitOf(content: TraitContent, key: TraitKey): Trait | undefined {
  if (Object.hasOwn(content.guildmasterTraits, key)) return content.guildmasterTraits[key];
  return Object.hasOwn(content.heroTraits, key) ? content.heroTraits[key] : undefined;
}

/** Whether one of two Traits excludes the other, read from either side. */
export function excludeEachOther(one: Pick<Trait, 'key' | 'excludes'>, other: Pick<Trait, 'key' | 'excludes'>): boolean {
  return one.excludes.includes(other.key) || other.excludes.includes(one.key);
}

/**
 * The first pair of `rows`, in their order, of which one excludes the other: the earlier row first,
 * each later row tried against it before the next earlier row. `null` when no two do.
 */
export function excludedPair<Row extends Pick<Trait, 'key' | 'excludes'>>(rows: readonly Row[]): [Row, Row] | null {
  for (const [index, row] of rows.entries()) {
    for (const other of rows.slice(index + 1)) if (excludeEachOther(row, other)) return [row, other];
  }
  return null;
}

// ── Hero Traits' effects (v1.1.4-S7, DL-148 items 24 to 26, DL-150 items 5 and 8) ───────────────

/** What a Hero's Traits are read from: the Hero Traits. */
export type HeroTraitContent = Pick<ContentSet, 'heroTraits'>;

/** The Hero Trait keyed `key`, or `undefined` for a key content does not define as one (rule 5). */
function heroTraitOf(content: HeroTraitContent, key: TraitKey): HeroTrait | undefined {
  return Object.hasOwn(content.heroTraits, key) ? content.heroTraits[key] : undefined;
}

/** Every effect of the Hero Traits `traits` lists, in the Traits' order and then each Trait's; a key no Hero Trait has bears on nothing. */
export function heroTraitEffects(traits: readonly TraitKey[], content: HeroTraitContent): HeroTraitEffect[] {
  return traits.flatMap((key) => heroTraitOf(content, key)?.effects ?? []);
}

/**
 * The sum, by Hero Stat, of the `statModifiers` effects of the Hero Traits `hero` holds (DL-148 item
 * 24): what `effectiveStats` adds to the base beside gear. A Stat no Trait moves has no entry.
 */
export function traitStatModifiers(hero: { traits: readonly TraitKey[] }, content: HeroTraitContent): Record<StatKey, number> {
  const total: Record<StatKey, number> = {};
  for (const effect of heroTraitEffects(hero.traits, content)) {
    if (effect.kind !== 'statModifiers') continue;
    for (const [statKey, delta] of Object.entries(effect.modifiers)) {
      total[statKey] = (Object.hasOwn(total, statKey) ? (total[statKey] ?? 0) : 0) + delta;
    }
  }
  return total;
}

/** What an Encounter bonus is matched against: the Encounter's kind, and its tags once Encounters have them (v1.1.4-S8). */
export type BonusTarget = Pick<Encounter, 'kind'> & { tags?: readonly string[] };

/**
 * The flat bonus every Check of `encounter` gains from the Traits of `heroes`, the Party still in the
 * sequence (DL-148 item 26): each Hero Trait any of them holds counted once, however many hold it,
 * and each of its `encounterBonus` effects whose `kinds` name the Encounter's kind, or whose `tags`
 * share one of its tags, adding its `flat`. 0 when none does.
 */
export function traitEncounterBonus(
  heroes: readonly { traits: readonly TraitKey[] }[],
  encounter: BonusTarget,
  content: HeroTraitContent,
): number {
  if (heroes.every((hero) => hero.traits.length === 0)) return 0;
  const held = [...new Set(heroes.flatMap((hero) => hero.traits))];
  const tags = encounter.tags ?? [];
  let bonus = 0;
  for (const effect of heroTraitEffects(held, content)) {
    if (effect.kind !== 'encounterBonus') continue;
    const byKind = effect.kinds?.includes(encounter.kind) ?? false;
    const byTag = effect.tags?.some((tag) => tags.includes(tag)) ?? false;
    if (byKind || byTag) bonus += effect.flat;
  }
  return bonus;
}

/**
 * Whether a Hero holding `traits` may earn the Hero Trait `key` (DL-148 item 25, DL-150 item 5): one
 * content defines, which they do not hold, and which neither excludes one they hold nor is excluded by
 * one.
 */
export function mayEarn(traits: readonly TraitKey[], key: TraitKey, content: HeroTraitContent): boolean {
  const trait = heroTraitOf(content, key);
  if (trait === undefined || traits.includes(key)) return false;
  return !traits.some((held) => {
    const other = heroTraitOf(content, held);
    return other !== undefined && excludeEachOther(trait, other);
  });
}

/**
 * The Traits of `traits` that the Hero Trait `key`, left by an Injury, replaces (DL-150 item 5): each
 * Hero Trait held that it excludes or that excludes it, in the order held. None for a key content does
 * not define as a Hero Trait.
 */
export function replacedBy(traits: readonly TraitKey[], key: TraitKey, content: HeroTraitContent): TraitKey[] {
  const trait = heroTraitOf(content, key);
  if (trait === undefined) return [];
  return traits.filter((held) => {
    const other = heroTraitOf(content, held);
    return held !== key && other !== undefined && excludeEachOther(trait, other);
  });
}
