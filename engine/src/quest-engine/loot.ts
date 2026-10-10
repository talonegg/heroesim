// Loot (M5-S5, R32, INPUTS 7.4, principle 2's fourth pull, DL-52): Items awarded by a Quest's
// outcome. A Quest carries the Loot table of its template when its Tier's `loot` is true (the Quest
// Generator's copy, DL-262); on a band in `lootOnBands` one entry
// of it goes to the holding of the Guild whose Party came home. Every Guild alike (ADR-0002).
//
// Two halves, so that the Quest Engine stays a reader (resolve.ts): `drawLoot` is the Quest Engine's
// last step, called once by `resolveQuest` after the Encounters, and changes nothing but the
// `quests` stream; `awardLoot` is applied by the night phase `questsConclude`, which puts the Item
// in the Guild's holding and emits `quest.loot`.
//
// The draws: for a Quest whose table content defines, two from `quests` — the entry
// (`weightedPick`), then its quantity (`int`) — whatever the band, so tuning `lootOnBands` never
// shifts a later draw, as `chance` promises for a probability (rng.ts). A Quest with no table, or one
// content no longer defines (the validator warns, `unknown-loot-table`), draws nothing and awards
// nothing. A unique definition already in `world.items`, whoever holds it, is drawn with weight 0: a
// unique Item is an individual, and a world holds one of it (DL-52). When every entry is such, the
// draw is still taken and awards nothing.
//
// A Finale (v1.1.4-S8, DL-148 item 23): on a Quest whose template names one, Loot also needs the
// Finale to end at a Degree in `lootOnFinaleDegrees`, the Triumph alone by default (DL-202). Loot keeps
// its band rule, and its two draws are taken whatever happens.

import type { EngineDeps, QuestBand } from '../config.js';
import type { Degree, ItemDefinitionKey, LootTableKey } from '../content-types.js';
import type { Guild, Party, Quest, World } from '../document.js';
import type { Emit } from '../emit.js';
import type { QuestLoot } from '../events.js';
import { streamOf } from '../generators/draw.js';
import { addStack, createItem, itemDefinition } from '../items.js';
import { int, weightedPick } from '../rng.js';

/** What the Quest Engine drew for a Quest: an entry of its table, with the quantity to award. */
export interface LootDraw {
  lootTableKey: LootTableKey;
  definitionKey: ItemDefinitionKey;
  /** 1 for a unique Item, whose entry content holds to 1. */
  quantity: number;
  /** Whether the definition is unique: a new row of `world.items`, rather than a stack. */
  unique: boolean;
}

/**
 * How a Quest's Finale went, for Loot (v1.1.4-S8): `none` for a Quest without one; the Degree it ended
 * at; or `unmet` when the Party never reached it, no one being left.
 */
export type FinaleOutcome = 'none' | 'unmet' | Degree;

/**
 * The Loot `quest` leaves on `band` (M5-S5): one entry of its Loot table drawn from the `quests`
 * stream in proportion to the entries' weights, a unique definition already in `world.items` weighted
 * 0, and its quantity drawn from the entry's range; or `null` when the Quest has no table content
 * defines, the band is not in `lootOnBands`, its `finale` did not end at a Degree in `lootOnFinaleDegrees` (v1.1.4-S8, DL-202), or every
 * entry is a unique Item the world already holds. The draws are taken for any band and any Finale
 * (see above). Changes nothing but the `quests` stream. Throws on a
 * programming error: a table with no entries, which content validation refuses.
 */
export function drawLoot(
  world: World,
  quest: Pick<Quest, 'lootTableKey'>,
  band: QuestBand,
  deps: Pick<EngineDeps, 'config' | 'content'>,
  finale: FinaleOutcome = 'none',
): LootDraw | null {
  const { config, content } = deps;
  const lootTableKey = quest.lootTableKey;
  if (lootTableKey === null || !Object.hasOwn(content.lootTables, lootTableKey)) return null;
  const { entries } = content.lootTables[lootTableKey] ?? { entries: [] };
  const held = new Set(Object.values(world.items).map((item) => item.definitionKey));
  const isUnique = (definitionKey: ItemDefinitionKey): boolean => itemDefinition(content, definitionKey)?.unique === true;
  const weights = entries.map((entry) => (isUnique(entry.definitionKey) && held.has(entry.definitionKey) ? 0 : entry.weight));

  const state = streamOf(world, 'quests');
  const drawn = weightedPick(state, entries.map((entry, index) => ({ entry, index })), weights);
  const quantity = int(state, drawn.entry.quantityMin, drawn.entry.quantityMax);

  // Every weight 0 makes the draw uniform, so it may fall on a unique Item the world already holds.
  if (!config.lootOnBands.includes(band) || weights[drawn.index] === 0) return null;
  if (finale !== 'none' && !(config.lootOnFinaleDegrees as readonly FinaleOutcome[]).includes(finale)) return null;
  const { definitionKey } = drawn.entry;
  return { lootTableKey, definitionKey, quantity, unique: isUnique(definitionKey) };
}

/** Whose Loot it is: the Quest, the Party that came home from it, and the Party's Guild. */
export interface LootFinders {
  quest: Pick<Quest, 'id'>;
  party: Pick<Party, 'id'>;
  guild: Pick<Guild, 'id'>;
}

/**
 * Puts `loot` in the Guild's holding and returns its `quest.loot` event, or nothing for no Loot: a
 * unique Item as a new row of `world.items` with a fresh id (`createItem`), a common Item into the
 * Guild's stack of its definition (`addStack`, which merges or creates). Called by `questsConclude`
 * while the Quest and the Party are still rows to name.
 */
export function awardLoot(world: World, emit: Emit, { quest, party, guild }: LootFinders, loot: LootDraw | null): QuestLoot[] {
  if (loot === null) return [];
  const holder = { kind: 'guild', id: guild.id } as const;
  const itemId = loot.unique ? createItem(world, loot.definitionKey, holder) : null;
  const stackId = itemId === null ? addStack(world, loot.definitionKey, loot.quantity, holder) : null;
  const event = emit({
    type: 'quest.loot',
    participants: [quest.id, party.id, guild.id, ...(itemId === null ? [] : [itemId])],
    payload: {
      questId: quest.id,
      partyId: party.id,
      guildId: guild.id,
      lootTableKey: loot.lootTableKey,
      definitionKey: loot.definitionKey,
      quantity: loot.quantity,
      itemId,
      stackId,
    },
  });
  return [event];
}
