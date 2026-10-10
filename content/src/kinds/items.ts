// The Item definitions (DL-48; `items.json`): the fields every Item has, then its `kind`'s.
// Gear has a `slot`, one of the three, and Stat modifiers; a consumable an effect, one of a closed
// union of kinds with exactly its fields. A row with the other kind's field is refused as it is read,
// naming the field and why; the rules catch the same in a set built in memory.

import type {
  ConsumableDefinition,
  ConsumableEffect,
  EncounterKind,
  GearDefinition,
  ItemDefinition,
  ItemKind,
  SlotKey,
} from '@heroesim/engine/content';
import { encounterKinds, gearSlotKeys } from '@heroesim/engine/content';
import {
  boolean,
  choicesOf,
  integer,
  integerOrNull,
  number,
  numbers,
  oneOf,
  oneOfEach,
  oneOfKinds,
  readFields,
  strings,
  table,
  text,
  type Fields,
  type RowShape,
  type Union,
} from './read.js';
import { checkEncounterKinds, checkRowKeys, checkTags, type KindRules } from './rules.js';

const encounterKindChoices: Record<EncounterKind, true> = choicesOf(encounterKinds);
const itemKinds: Record<ItemKind, true> = { gear: true, consumable: true };

/** A consumable's effect (DL-48): one of the closed union's kinds with exactly its fields. */
const consumableEffect: Union<ConsumableEffect['kind'], ConsumableEffect> = {
  by: 'kind',
  kinds: {
    reroll: { kinds: oneOfEach(encounterKindChoices) },
    bonus: { flat: number, kinds: oneOfEach(encounterKindChoices) },
    heal: { days: integer },
  },
  what: (kind) => `a ${kind} effect`,
};

type Common = Omit<GearDefinition, 'key' | 'kind' | 'slot' | 'statModifiers'>;
const common: Fields<Common> = { name: text, unique: boolean, buyPrice: integerOrNull, tags: strings };
const gear: Fields<Pick<GearDefinition, 'slot' | 'statModifiers'>> = { slot: oneOf<SlotKey>(choicesOf(gearSlotKeys)), statModifiers: numbers };
const consumable: Fields<Pick<ConsumableDefinition, 'effect'>> = { effect: oneOfKinds(consumableEffect) };

/** An Item's row: its common fields, its `kind`, then that kind's, refusing the other kind's by name. */
const itemRow: RowShape<Omit<ItemDefinition, 'key'>> = {
  read(row) {
    const shared = readFields(row, common);
    const kind = row.oneOf('kind', itemKinds);
    let item: Omit<ItemDefinition, 'key'>;
    switch (kind) {
      case 'gear':
        row.forbid('effect', 'is not a field of gear: only a consumable has an effect');
        item = { ...shared, kind, ...readFields(row, gear) };
        break;
      case 'consumable':
        row.forbid('slot', 'is not a field of a consumable: only gear has a slot');
        row.forbid('statModifiers', 'is not a field of a consumable: only gear modifies Stats');
        item = { ...shared, kind, ...readFields(row, consumable) };
        break;
    }
    row.refuseUnknown('an Item');
    return item;
  },
  holds: [common, gear, consumable],
};

export const itemsKind = table<'items', ItemDefinition>('items', 'items.json', itemRow);

/**
 * The Items' rules (DL-48). Every Item: a price that is a whole number above 0, or `null` for
 * Loot only; tags in kebab-case, none twice. Gear: a slot of the three and no effect; Stat modifiers,
 * at least one, each on a Hero Stat, each a whole number other than 0. A consumable: not unique, since
 * it is expended from a stack; no slot and no modifiers; an effect within its kind's bounds.
 */
export const itemsRules: KindRules = {
  key: 'items',
  check(set, problems, known) {
    checkRowKeys('items', set.items, problems);
    for (const [key, item] of Object.entries(set.items)) {
      const where = `items.${key}`;
      const { buyPrice } = item;
      if (buyPrice !== null && !(Number.isInteger(buyPrice) && buyPrice > 0)) {
        problems.push(`${where}.buyPrice is ${buyPrice}; it is a whole number above 0, or null for an Item found only as Loot`);
      }
      checkTags(`${where}.tags`, item.tags, problems);
      switch (item.kind) {
        case 'gear': {
          if (!(gearSlotKeys as readonly string[]).includes(item.slot)) {
            problems.push(`${where}.slot: "${item.slot}" is not a gear slot (${gearSlotKeys.join(', ')})`);
          }
          if (Reflect.has(item, 'effect')) problems.push(`${where}.effect: gear has no effect; only a consumable has one`);
          const modifiers = Object.entries(item.statModifiers);
          if (modifiers.length === 0) problems.push(`${where}.statModifiers is empty: gear modifies at least one Stat`);
          for (const [statKey, delta] of modifiers) {
            if (!known.heroStats.has(statKey)) problems.push(`${where}.statModifiers: "${statKey}" is not a Hero Stat`);
            if (!(Number.isInteger(delta) && delta !== 0)) {
              problems.push(`${where}.statModifiers.${statKey} is ${delta}; it is a whole number other than 0`);
            }
          }
          break;
        }
        case 'consumable':
          if (item.unique) problems.push(`${where}.unique is true; a consumable is common, expended from a stack`);
          if (Reflect.has(item, 'slot')) problems.push(`${where}.slot: a consumable has no slot; only gear has one`);
          if (Reflect.has(item, 'statModifiers')) problems.push(`${where}.statModifiers: a consumable modifies no Stat`);
          checkConsumableEffect(`${where}.effect`, item.effect, problems);
          break;
        default:
          problems.push(`${where}.kind is ${JSON.stringify((item as { kind: unknown }).kind)}; it is gear or consumable`);
      }
    }
  },
};

/** A consumable's effect: Encounter kinds named, `flat` above 0, `days` a whole number from 1. */
function checkConsumableEffect(where: string, effect: ConsumableEffect, problems: string[]): void {
  const kinds = (listed: readonly string[]): void => {
    if (listed.length === 0) problems.push(`${where}.kinds is empty: the effect works on the Encounter kinds it names`);
    checkEncounterKinds(`${where}.kinds`, listed, encounterKinds, problems);
  };
  switch (effect.kind) {
    case 'reroll':
      kinds(effect.kinds);
      return;
    case 'bonus':
      if (!(Number.isFinite(effect.flat) && effect.flat > 0)) problems.push(`${where}.flat is ${effect.flat}; it is a number above 0`);
      kinds(effect.kinds);
      return;
    case 'heal':
      if (!(Number.isInteger(effect.days) && effect.days >= 1)) problems.push(`${where}.days is ${effect.days}; it is a whole number from 1`);
      return;
    default:
      problems.push(`${where}.kind is ${JSON.stringify((effect as { kind: unknown }).kind)}; it is reroll, bonus or heal`);
  }
}
