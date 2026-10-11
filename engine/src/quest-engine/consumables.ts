// A Party's consumables (M5-S3, R23, R30, DL-50): the stacks whose holder is the Party (data-model
// §3.3), moved there from its Guild's holding by `dispatch`. The Quest Engine uses them as it
// resolves the Party's Encounters (resolve.ts), through the kit `kitOf` makes of them:
//
// - a `bonus` adds its `flat` to the capability of every Check of an Encounter of one of its kinds
//   (DL-148 item 13): one Item of each such definition an Encounter, so a second Item goes to the
//   next one;
// - a `reroll` has a failed Encounter of one of its kinds rolled again, once: one Item, and one more
//   draw from `quests` for each of its Checks that fell short of Success, in the order listed,
//   straight after its Checks; the new rolls stand (v1.1.4-S2);
// - a `heal` is spent at the moment of an Injury, one Item an Injury while any is left, the one healing
//   most Days first (DL-280 item 4, Q15 a; DL-285): it relieves `healItemHurtRelief` of the hurt's gap
//   for the rest of the Quest (form.ts, `hurtRelief`), and shortens the Injury by its `days`, to no
//   fewer than 1 Day, which the return applies. Spent on a Hero who then dies, it is lost (DL-280).
//
// Which Items an Encounter takes is `takeBonuses`' and `rerollFor`'s, which the chance estimate reads
// too (v1.1.4-S5, estimate.ts), so that it spends them as the kit does.
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
 * `days` Days off, 0 for an Injury at 1 Day, and the Encounter the Injury was taken at (DL-285).
 */
export type ConsumableUse = { stackId: StackId; definitionKey: ItemDefinitionKey } & (
  | { effect: 'bonus'; encounterIndex: number; flat: number }
  | { effect: 'reroll'; encounterIndex: number; firstRoll: number }
  | { effect: 'heal'; heroId: HeroId; days: number; encounterIndex: number }
);

/** An Injury as the kit reads and shortens it: `resolve.ts`'s `QuestInjury`. */
interface Healable {
  heroId: HeroId;
  healDays: number;
}

/** What a Party carries into its Quest, and uses as it goes: made by `kitOf`. */
export interface Kit {
  /**
   * The flat bonus each Check of Encounter `index`, of `kind`, gains: one Item of each bonus
   * definition carried that has one left and names `kind`, each Item's `flat` summed. 0 when none.
   */
  bonus(kind: EncounterKind, index: number): number;
  /**
   * Whether the failed Encounter `index`, of `kind`, is rolled again: true when a reroll definition
   * carried has an Item left and names `kind`, the first in key order giving it. The caller rolls
   * again, once, each Check that fell short of Success; `firstRoll` is the failed roll of the Check
   * that decided the Encounter (v1.1.4-S2), which the use records.
   */
  reroll(kind: EncounterKind, index: number, firstRoll: number): boolean;
  /**
   * Spends a heal Item on `injury`, just taken at Encounter `index` (DL-285): of the heal definitions
   * carried with an Item left, the one healing most Days (ties by key). It shortens the Injury in
   * place by its `days`, to no fewer than 1, and the Hero is relieved for the rest of the Quest. False
   * when none is left.
   */
  heal(injury: Healable, index: number): boolean;
  /** Every Item used so far, in the order used. */
  readonly used: ConsumableUse[];
}

/** A consumable carried, with how many of it are left to use: what the kit's rules read, and the estimate's (estimate.ts). */
export interface Left {
  effect: ConsumableEffect;
  left: number;
}

/** A stack the Party carries, with how many of it are left to use. */
interface Carried extends Left {
  stackId: StackId;
  definitionKey: ItemDefinitionKey;
}

/**
 * The bonus Items an Encounter of `kind` uses of `carried`, in key order: one of each bonus
 * definition that has one left and names `kind`, each taken from its `left` (DL-148 item 13).
 */
export function takeBonuses<Each extends Left>(carried: readonly Each[], kind: EncounterKind): Each[] {
  const taken = carried.filter(({ effect, left }) => effect.kind === 'bonus' && left > 0 && effect.kinds.includes(kind));
  for (const it of taken) it.left -= 1;
  return taken;
}

/** The reroll a failed Encounter of `kind` would use of `carried`: the first in key order with an Item left that names `kind`. */
export function rerollFor<Each extends Left>(carried: readonly Each[], kind: EncounterKind): Each | undefined {
  return carried.find(({ effect, left }) => effect.kind === 'reroll' && left > 0 && effect.kinds.includes(kind));
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
      for (const it of takeBonuses(carried, kind)) {
        const bonus = bonusOf(it);
        flat += bonus;
        used.push({ stackId: it.stackId, definitionKey: it.definitionKey, effect: 'bonus', encounterIndex: index, flat: bonus });
      }
      return flat;
    },
    reroll(kind, index, firstRoll) {
      const it = rerollFor(carried, kind);
      if (it === undefined) return false;
      it.left -= 1;
      used.push({ stackId: it.stackId, definitionKey: it.definitionKey, effect: 'reroll', encounterIndex: index, firstRoll });
      return true;
    },
    heal(injury, index) {
      // `carried` is in key order, so the first of the most Days is the first by key.
      const it = carried
        .filter((each) => each.effect.kind === 'heal' && each.left > 0)
        .reduce<Carried | undefined>((best, each) => (best === undefined || healDays(each) > healDays(best) ? each : best), undefined);
      if (it === undefined) return false;
      const after = Math.max(1, injury.healDays - healDays(it));
      const days = injury.healDays - after;
      injury.healDays = after;
      it.left -= 1;
      used.push({ stackId: it.stackId, definitionKey: it.definitionKey, effect: 'heal', heroId: injury.heroId, days, encounterIndex: index });
      return true;
    },
  };
}

/** The flat a bonus definition adds; 0 for any other effect. */
export function bonusOf({ effect }: Left): number {
  return effect.kind === 'bonus' ? effect.flat : 0;
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
