// A Party's consumables (M5-S3, R23, R30, DL-50): the stacks whose holder is the Party (data-model
// §3.3), moved there from its Guild's holding by `dispatch`. The Quest Engine uses them as it
// resolves the Party's Encounters (resolve.ts), through the kit `kitOf` makes of them:
//
// - a `bonus` adds its `flat` to the capability of the first Check of an Encounter of one of its
//   kinds: one Item of each such definition a Check, so a second Item goes to the next one;
// - a `reroll` has the first failed Check of an Encounter of one of its kinds rolled again, once: one
//   Item, and one more draw from `quests`, straight after the failed roll; the second roll stands;
// - a `heal`, once the sequence is over, shortens an Injury the Quest inflicted by its `days`, to no
//   fewer than 1 Day: the longest Injury first, one Item an Injury.
//
// The kit only records what it used; the world changes as the Party comes home. `questsConclude`
// expends the Items used from their stacks, emitting `item.expended` (`expendUsed`), and sends the
// rest home to the Guild's holding (`sendHome`), as a fold does for a Party it disbands (M2-S10,
// DL-28), so no stack is ever held by a removed Party.
//
// A consumable is the Party's own: nothing here reads the Guild's leader or its dealings, which live
// in Guild-side phases and actions (M4's third risk); a test reads this file to hold it so, as it
// does `check.ts`.

import type { ConsumableEffect, ContentSet, EncounterKind, ItemDefinitionKey } from '../content-types.js';
import { compareByCodeUnit, type HeroId, type Party, type Quest, type StackId, type World } from '../document.js';
import type { Emit } from '../emit.js';
import type { EngineEvent } from '../events.js';
import { holdings, itemDefinition, moveItem, moveStack, removeFromStack } from '../items.js';

/**
 * One Item of a stack the Party carried, used on its Quest (DL-50 items 4 to 6): what `item.expended`
 * records. A `bonus` names the Encounter it added `flat` to, by its place in the sequence; a `reroll`
 * the Encounter whose failed roll, `firstRoll`, it replaced; a `heal` the Hero whose Injury it took
 * `days` Days off.
 */
export type ConsumableUse = { stackId: StackId; definitionKey: ItemDefinitionKey } & (
  | { effect: 'bonus'; encounterIndex: number; flat: number }
  | { effect: 'reroll'; encounterIndex: number; firstRoll: number }
  | { effect: 'heal'; heroId: HeroId; days: number }
);

/** An Injury as the kit reads and shortens it: `resolve.ts`'s `QuestInjury`. */
interface Healable {
  heroId: HeroId;
  healDays: number;
}

/** What a Party carries into its Quest, and uses as it goes: made by `kitOf`. */
export interface Kit {
  /**
   * The flat bonus the Check of Encounter `index`, of `kind`, gains: one Item of each bonus
   * definition carried that has one left and names `kind`, each Item's `flat` summed. 0 when none.
   */
  bonus(kind: EncounterKind, index: number): number;
  /**
   * Whether the failed Check of Encounter `index`, of `kind`, is rolled again: true when a reroll
   * definition carried has an Item left and names `kind`, the first in key order giving it. The
   * caller rolls again, once; `firstRoll` is the failed roll, which the use records.
   */
  reroll(kind: EncounterKind, index: number, firstRoll: number): boolean;
  /**
   * Shortens `injuries` in place, the heal Items carried given out one at a time, the definition
   * healing most Days first (ties by key), each to the Injury with the most Days not yet treated
   * (ties to the first), by its `days`, to no fewer than 1. An Injury at 1 Day takes none.
   */
  heal(injuries: Healable[]): void;
  /** Every Item used so far, in the order used. */
  readonly used: ConsumableUse[];
}

/** A stack the Party carries, with how many of it are left to use. */
interface Carried {
  stackId: StackId;
  definitionKey: ItemDefinitionKey;
  effect: ConsumableEffect;
  left: number;
}

/**
 * The kit of the consumables `party` carries: the stacks it holds whose definition content defines
 * as a consumable, in key order (a stack of anything else is carried for nothing, data-model rule 5,
 * and goes home). Reads `world` and changes nothing: every use is recorded on the kit.
 */
export function kitOf(world: Pick<World, 'items' | 'stacks'>, party: Pick<Party, 'id'>, content: Pick<ContentSet, 'items'>): Kit {
  const carried: Carried[] = [];
  for (const stack of holdings(world, { kind: 'party', id: party.id }).stacks) {
    const definition = itemDefinition(content, stack.definitionKey);
    if (definition?.kind !== 'consumable') continue;
    carried.push({ stackId: stack.id, definitionKey: stack.definitionKey, effect: definition.effect, left: stack.quantity });
  }
  carried.sort((a, b) => compareByCodeUnit(a.definitionKey, b.definitionKey));
  const used: ConsumableUse[] = [];

  return {
    used,
    bonus(kind, index) {
      let flat = 0;
      for (const it of carried) {
        const { effect } = it;
        if (effect.kind !== 'bonus' || it.left === 0 || !effect.kinds.includes(kind)) continue;
        it.left -= 1;
        flat += effect.flat;
        used.push({ stackId: it.stackId, definitionKey: it.definitionKey, effect: 'bonus', encounterIndex: index, flat: effect.flat });
      }
      return flat;
    },
    reroll(kind, index, firstRoll) {
      const it = carried.find(({ effect, left }) => effect.kind === 'reroll' && left > 0 && effect.kinds.includes(kind));
      if (it === undefined) return false;
      it.left -= 1;
      used.push({ stackId: it.stackId, definitionKey: it.definitionKey, effect: 'reroll', encounterIndex: index, firstRoll });
      return true;
    },
    heal(injuries) {
      const heals = carried
        .filter((it) => it.effect.kind === 'heal')
        .sort((a, b) => healDays(b) - healDays(a) || compareByCodeUnit(a.definitionKey, b.definitionKey));
      const treated = new Set<Healable>();
      for (const it of heals) {
        while (it.left > 0) {
          const longest = injuries
            .filter((injury) => !treated.has(injury) && injury.healDays > 1)
            .reduce<Healable | undefined>((best, injury) => (best === undefined || injury.healDays > best.healDays ? injury : best), undefined);
          if (longest === undefined) return;
          const after = Math.max(1, longest.healDays - healDays(it));
          const days = longest.healDays - after;
          longest.healDays = after;
          treated.add(longest);
          it.left -= 1;
          used.push({ stackId: it.stackId, definitionKey: it.definitionKey, effect: 'heal', heroId: longest.heroId, days });
        }
      }
    },
  };
}

/** The Days a heal definition takes off; 0 for any other effect. */
function healDays({ effect }: Carried): number {
  return effect.kind === 'heal' ? effect.days : 0;
}

/**
 * Expends each Item `used` records from its stack (`removeFromStack`, which removes an emptied
 * stack) and returns one `item.expended` for each, in the order used, naming the Quest, the Party,
 * the Guild and, for a heal, the Hero. `questsConclude` calls it while the Party's and the Quest's
 * rows are still there to name.
 */
export function expendUsed(
  world: Pick<World, 'stacks'>,
  emit: Emit,
  { party, quest }: { party: Pick<Party, 'id' | 'guildId'>; quest: Pick<Quest, 'id'> },
  used: readonly ConsumableUse[],
): EngineEvent[] {
  return used.map((use) => {
    removeFromStack(world, use.stackId, 1);
    const ids = { questId: quest.id, partyId: party.id, guildId: party.guildId };
    return emit({
      type: 'item.expended',
      participants: [quest.id, party.id, party.guildId, ...(use.effect === 'heal' ? [use.heroId] : [])],
      payload: { ...ids, ...use },
    });
  });
}

/**
 * Sends everything `party` holds home to its Guild's holding: each stack joins the Guild's stack of
 * its definition or becomes one (`moveStack`), and a unique Item, which no rule gives a Party,
 * changes holder all the same. Emits nothing: the Party's return is its `quest.resolved`, and a
 * fold's disbanding its `guild.folded` (DL-50 item 7).
 */
export function sendHome(world: Pick<World, 'items' | 'stacks' | 'counters'>, party: Pick<Party, 'id' | 'guildId'>): void {
  const home = { kind: 'guild', id: party.guildId } as const;
  const held = holdings(world, { kind: 'party', id: party.id });
  for (const stack of held.stacks) moveStack(world, stack.id, stack.quantity, home);
  for (const item of held.items) moveItem(world, item.id, home);
}
