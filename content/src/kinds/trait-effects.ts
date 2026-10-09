// The effect kinds of a Trait, each described once by its fields (DL-243): what each field holds, its
// bounds or choices, whether it may be left out, and its label in the content editor's form. How an
// effect is read, the rules it is held to, the editor's forms (`tools/editor`, `traits-kind.ts`) and
// the editor's scan of the code for the kinds (`reads.ts`) all derive from it. Each list is keyed by
// the engine's union and each kind's fields by its type, so a kind or a field the engine adds and
// this misses fails to compile. What an effect does is the engine's rule, and how a player reads it
// the words' (ADR-0003); a new kind is an engine change (DL-150 item 8).

import type { EncounterKind, GuildmasterTraitEffect, HeroTraitEffect } from '@heroesim/engine/content';
import { encounterKinds } from '@heroesim/engine/content';
import { choicesOf, integer, number, numbers, oneOfEach, optional, strings, text, type Field, type Union } from './read.js';
import { checkEncounterKinds, checkTags, type Known } from './rules.js';

/** A number: whole or not, other than 0 or above a bound, as its rule holds it. */
export interface NumberField {
  type: 'integer' | 'number';
  otherThan0?: true;
  above?: number;
}

/** A key content defines: a Class's or a Hero Stat's. */
export interface KeyField {
  type: 'key';
  of: 'classes' | 'heroStats';
}

/** Hero Stats each moved by a whole number other than 0, at least one. */
export interface StatChangesField {
  type: 'stat-changes';
}

/** Kinds of Encounter, the engine's, each once. */
export interface EncounterKindsField {
  type: 'encounter-kinds';
}

/** Tags, each kebab-case and once. */
export interface TagsField {
  type: 'tags';
}

/** The description a field of the engine's type `Value` takes. */
type FieldFor<Value> = [Value] extends [number]
  ? NumberField
  : [Value] extends [string]
    ? KeyField
    : [Value] extends [EncounterKind[]]
      ? EncounterKindsField
      : [Value] extends [string[]]
        ? TagsField
        : [Value] extends [Record<string, number>]
          ? StatChangesField
          : never;

/** A field, with its label in the editor's form; `optional` exactly where the engine's type has it optional. */
export type EffectFieldOf<Value, Optional extends boolean> = FieldFor<Value> & { label: string } & (Optional extends true
    ? { optional: true }
    : { optional?: never });

/** One effect kind: its label in the editor's form, its fields in the order they are written, and the fields of which it names one or more. */
export interface EffectKind<Effect> {
  label: string;
  fields: {
    [Name in Exclude<keyof Effect, 'kind'>]-?: Pick<Effect, Name> extends Required<Pick<Effect, Name>>
      ? EffectFieldOf<Effect[Name], false>
      : EffectFieldOf<Exclude<Effect[Name], undefined>, true>;
  };
  /** Fields of which the effect names at least one, and the words after its path when it names none. */
  namesOneOf?: { fields: readonly Exclude<keyof Effect, 'kind'>[]; words: string };
}

/** Each kind of a list's effects, keyed by the engine's union. */
export type EffectKinds<Effect extends { kind: string }> = { [Kind in Effect['kind']]: EffectKind<Extract<Effect, { kind: Kind }>> };

/** A Guildmaster Trait's effects (M4-S5, DL-43). */
export const guildmasterTraitEffects: EffectKinds<GuildmasterTraitEffect> = {
  classStatBonus: {
    label: 'A Class Stat bonus',
    fields: {
      classKey: { type: 'key', of: 'classes', label: 'Class' },
      statKey: { type: 'key', of: 'heroStats', label: 'Stat' },
      delta: { type: 'integer', otherThan0: true, label: 'By' },
    },
  },
  guildMoraleShift: { label: 'A Morale shift', fields: { delta: { type: 'number', otherThan0: true, label: 'By' } } },
  upkeepFactor: { label: 'An Upkeep factor', fields: { factor: { type: 'number', above: 0, label: 'Times' } } },
};

/** A Hero Trait's effects (DL-150 item 8): a `statModifiers` moves Stats as gear's do (DL-148 item 24); an `encounterBonus` adds to a Check, a bonus or a penalty (DL-148 item 26). */
export const heroTraitEffects: EffectKinds<HeroTraitEffect> = {
  statModifiers: { label: 'Stat changes', fields: { modifiers: { type: 'stat-changes', label: 'Stats' } } },
  encounterBonus: {
    label: 'An Encounter bonus',
    fields: {
      flat: { type: 'number', otherThan0: true, label: 'Bonus' },
      kinds: { type: 'encounter-kinds', label: 'Encounter kinds', optional: true },
      tags: { type: 'tags', label: 'Encounter tags', optional: true },
    },
    namesOneOf: { fields: ['kinds', 'tags'], words: 'names no Encounter kind and no tag: it adds to the Encounters it names' },
  },
};

/** Any effect field, as the reader, the rules and the editor's forms take it. */
export type EffectField = (NumberField | KeyField | StatChangesField | EncounterKindsField | TagsField) & { label: string; optional?: true };

/** An effect kind as the reader and the rules take it, whatever its list. */
interface AnyEffectKind {
  label: string;
  fields: object;
  namesOneOf?: { fields: readonly string[]; words: string };
}

/** An effect kind's fields as the reader and the rules take them. */
function fieldsOf(kind: AnyEffectKind): [string, EffectField][] {
  return Object.entries(kind.fields) as [string, EffectField][];
}

const encounterKindChoices = choicesOf(encounterKinds);

/** The reader of a field described so. */
function readerOf(field: EffectField): Field<unknown> {
  const read: Field<unknown> = (() => {
    switch (field.type) {
      case 'integer':
        return integer;
      case 'number':
        return number;
      case 'key':
        return text;
      case 'stat-changes':
        return numbers;
      case 'encounter-kinds':
        return oneOfEach(encounterKindChoices);
      case 'tags':
        return strings;
    }
  })();
  return field.optional === true ? optional(read) : read;
}

/** How a list's effects are read: one of its kinds, with exactly that kind's fields. */
export function effectUnion<Effect extends { kind: string }>(kinds: EffectKinds<Effect>): Union<Effect['kind'], Effect> {
  return {
    by: 'kind',
    kinds: Object.fromEntries(
      Object.entries(kinds).map(([kind, described]) => [kind, Object.fromEntries(fieldsOf(described as AnyEffectKind).map(([name, field]) => [name, readerOf(field)]))]),
    ) as Union<Effect['kind'], Effect>['kinds'],
    what: (kind) => `a ${kind} effect`,
  };
}

/** The kinds of a list, in words: "classStatBonus, guildMoraleShift or upkeepFactor". */
export function kindsInWords(kinds: Readonly<Record<string, unknown>>): string {
  const names = Object.keys(kinds);
  return names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} or ${names.at(-1) ?? ''}`;
}

/** The words a number's rule asks for: "a whole number other than 0", "a number above 0". */
function numberWords(field: NumberField): string {
  const bounds = [...(field.otherThan0 === true ? ['other than 0'] : []), ...(field.above === undefined ? [] : [`above ${field.above}`])];
  return `it is a ${field.type === 'integer' ? 'whole ' : ''}number${bounds.length === 0 ? '' : ` ${bounds.join(' and ')}`}`;
}

/** Whether a number is one `field` allows. */
function allows(field: NumberField, value: unknown): boolean {
  const ofType = field.type === 'integer' ? Number.isInteger(value) : Number.isFinite(value);
  return ofType && (field.otherThan0 !== true || value !== 0) && (field.above === undefined || (value as number) > field.above);
}

/**
 * The rules of an effect at `at` of a list described by `kinds`: a kind of the list, each field held to
 * its description, and at least one of the fields it names one of. Every kind is held by its fields,
 * so a kind is checked once it is described (DL-243).
 */
export function checkEffect(at: string, effect: { kind: string }, kinds: Readonly<Record<string, AnyEffectKind>>, known: Known, problems: string[]): void {
  const described = Object.hasOwn(kinds, effect.kind) ? kinds[effect.kind] : undefined;
  if (described === undefined) {
    problems.push(`${at}.kind is ${JSON.stringify(effect.kind)}; it is ${kindsInWords(kinds)}`);
    return;
  }
  const values = effect as unknown as Readonly<Record<string, unknown>>;
  for (const [name, field] of fieldsOf(described)) {
    const value = values[name];
    if (value === undefined && field.optional === true) continue;
    const where = `${at}.${name}`;
    switch (field.type) {
      case 'integer':
      case 'number':
        if (!allows(field, value)) problems.push(`${where} is ${String(value)}; ${numberWords(field)}`);
        break;
      case 'key': {
        const [keys, what] = field.of === 'classes' ? [known.classes, 'a Class'] : [known.heroStats, 'a Hero Stat'];
        if (!keys.has(value as string)) problems.push(`${where}: "${String(value)}" is not ${what}`);
        break;
      }
      case 'stat-changes': {
        const changes = Object.entries(value as Record<string, number>);
        if (changes.length === 0) problems.push(`${where} is empty: a ${effect.kind} effect moves at least one Stat`);
        for (const [statKey, delta] of changes) {
          if (!known.heroStats.has(statKey)) problems.push(`${where}: "${statKey}" is not a Hero Stat`);
          if (!(Number.isInteger(delta) && delta !== 0)) problems.push(`${where}.${statKey} is ${delta}; it is a whole number other than 0`);
        }
        break;
      }
      case 'encounter-kinds':
        checkEncounterKinds(where, value as readonly string[], encounterKinds, problems);
        break;
      case 'tags':
        checkTags(where, value as readonly string[], problems);
        break;
    }
  }
  const { namesOneOf } = described;
  if (namesOneOf !== undefined && namesOneOf.fields.every((name) => ((values[name] as readonly unknown[] | undefined) ?? []).length === 0)) {
    problems.push(`${at} ${namesOneOf.words}`);
  }
}
