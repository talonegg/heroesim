import { describe, expect, test } from 'vitest';
import type { EngineDeps } from './config.js';
import { consumablePurchase, consumablesToCarry, type ConsumableKeeping } from './consumable-choices.js';
import { createWorld } from './create.js';
import { makeId, type Guild, type HeroId, type World } from './document.js';
import { addStack, holdings } from './items.js';
import { marketHolder } from './market.js';
import { playerGuild, upkeep } from './selectors.js';
import { deepFreeze, setup, testDeps } from './world.test-support.js';

// What a controller buys and carries of the consumables (DL-62, DL-288), through the two choices'
// own interface, on the test content's six: two of each effect, `whetstone` (bonus, combat),
// `lockpicks` (bonus, stealth), `grappling-line` (reroll, travel and stealth), `blessed-candle`
// (reroll, arcane and social), `healing-draught` (heal, 30) and `physicians-kit` (heal, 70).

const deps: EngineDeps = testDeps({ rivalCount: 0 });

/** The player's Guild of a new world, rich, its own holding empty, and a Market holding `stacks` alone. */
function scene(seed: string, stacks: readonly (readonly [string, number])[] = []): { world: World; guild: Guild } {
  const { world } = createWorld(seed, setup, deps).document;
  const guild = playerGuild(world) as Guild;
  guild.wealth = 10_000;
  for (const holder of [marketHolder, { kind: 'guild', id: guild.id } as const]) {
    const held = holdings(world, holder);
    for (const stack of held.stacks) delete world.stacks[stack.id];
    for (const item of held.items) delete world.items[item.id];
  }
  for (const [definitionKey, quantity] of stacks) addStack(world, definitionKey, quantity, marketHolder);
  return { world, guild };
}

const everyEffect = ['bonus', 'reroll', 'heal'] as const;
const vaultOf = (guild: Guild) => ({ kind: 'guild', id: guild.id }) as const;
const keysOf = (requests: readonly { definitionKey: string; quantity: number }[]) => requests.map((it) => `${it.definitionKey}×${it.quantity}`);

/** A Party (the `n`th) of `guild`'s first Hero, away, holding `stacks`. */
function partyAway(world: World, guild: Guild, stacks: readonly (readonly [string, number])[], n = 77): void {
  const heroId = guild.rosterIds[0] as HeroId;
  const partyId = makeId('parties', n);
  world.parties[partyId] = { id: partyId, questId: makeId('quests', n), guildId: guild.id, heroIds: [heroId], departedOnTurn: 0, returnsOnTurn: 5, fatigueAtDispatch: { [heroId]: 0 } };
  for (const [definitionKey, quantity] of stacks) addStack(world, definitionKey, quantity, { kind: 'party', id: partyId });
}

describe('consumablesToCarry: what a Party carries (DL-62, DL-288)', () => {
  const fight = { encounterKeys: ['ambush-on-the-road', 'the-long-march'] }; // combat, travel
  const word = { encounterKeys: ['a-hostile-reeve', 'the-patrons-steward'] }; // social, social

  test('one of each consumable held that serves the Quest, in key order: a bonus or reroll of its kinds, any heal', () => {
    const { world, guild } = scene('carry-serves');
    for (const [key, quantity] of [['whetstone', 3], ['lockpicks', 3], ['grappling-line', 1], ['blessed-candle', 2], ['healing-draught', 1]] as const) {
      addStack(world, key, quantity, vaultOf(guild));
    }
    const carry = consumablesToCarry(world, guild, everyEffect, deps);

    expect(keysOf(carry(fight, guild.rosterIds))).toEqual(['grappling-line×1', 'healing-draught×1', 'whetstone×1']);
    // The second Party sent is given what the first left: no line, no draught.
    expect(keysOf(carry(fight, guild.rosterIds))).toEqual(['whetstone×1']);
    expect(keysOf(carry(word, guild.rosterIds))).toEqual(['blessed-candle×1']);
    expect(keysOf(carry(word, guild.rosterIds))).toEqual(['blessed-candle×1']);
    expect(carry(word, guild.rosterIds)).toEqual([]);
  });

  test('only the effects given: a Rival keeping heal Items carries them to any Quest, and nothing else it holds', () => {
    const { world, guild } = scene('carry-heal');
    for (const [key, quantity] of [['whetstone', 3], ['physicians-kit', 1], ['healing-draught', 2]] as const) addStack(world, key, quantity, vaultOf(guild));
    const carry = consumablesToCarry(world, guild, ['heal'], deps);

    expect(keysOf(carry(fight, guild.rosterIds))).toEqual(['healing-draught×1', 'physicians-kit×1']);
    expect(keysOf(carry(word, guild.rosterIds))).toEqual(['healing-draught×1']);
    expect(carry(fight, guild.rosterIds)).toEqual([]);
  });

  test("none for a Party of no one, which takes nothing from what is left; none of a Party's or another Guild's", () => {
    const { world, guild } = scene('carry-none');
    addStack(world, 'healing-draught', 1, vaultOf(guild));
    partyAway(world, guild, [['physicians-kit', 1]]);
    const carry = consumablesToCarry(world, guild, everyEffect, deps);

    expect(carry(fight, [])).toEqual([]);
    expect(keysOf(carry(fight, guild.rosterIds))).toEqual(['healing-draught×1']);
  });

  test('reads the world once, as it stands, and changes nothing in it', () => {
    const { world, guild } = scene('carry-pure');
    addStack(world, 'whetstone', 2, vaultOf(guild));
    const before = structuredClone(world);
    deepFreeze(world);

    expect(keysOf(consumablesToCarry(world, guild, everyEffect, deps)(fight, guild.rosterIds))).toEqual(['whetstone×1']);
    expect(world).toEqual(before);
  });
});

describe('consumablePurchase: what a controller buys toward its stock (DL-62, DL-288)', () => {
  const keeping = (fields: Partial<ConsumableKeeping> = {}): ConsumableKeeping => ({ effects: everyEffect, stock: 2, wealthMultiple: 3, ...fields });

  test('the one it has fewest of, the lowest key among equals, as many as it lacks and the Market has', () => {
    const { world, guild } = scene('buy-fewest', [['whetstone', 5], ['healing-draught', 1], ['physicians-kit', 4]]);
    addStack(world, 'healing-draught', 1, vaultOf(guild));
    addStack(world, 'physicians-kit', 1, vaultOf(guild));

    expect(consumablePurchase(world, guild, keeping(), deps)).toEqual({ kind: 'buy', guildId: guild.id, definitionKey: 'whetstone', quantity: 2 });
    addStack(world, 'whetstone', 2, vaultOf(guild));
    expect(consumablePurchase(world, guild, keeping(), deps)).toEqual({ kind: 'buy', guildId: guild.id, definitionKey: 'healing-draught', quantity: 1 });
    // The Market's one draught, though three are lacking toward four.
    expect(consumablePurchase(world, guild, keeping({ stock: 4 }), deps)?.quantity).toBe(1);
  });

  test("counts its Parties' with its own, not another Guild's, and buys nothing once stocked", () => {
    const { world, guild } = scene('buy-stocked', [['whetstone', 5]]);
    addStack(world, 'whetstone', 1, vaultOf(guild));
    expect(consumablePurchase(world, guild, keeping(), deps)?.quantity).toBe(1);
    partyAway(world, { ...guild, id: makeId('guilds', 99) }, [['whetstone', 1]], 78);
    expect(consumablePurchase(world, guild, keeping(), deps)?.quantity).toBe(1);
    partyAway(world, guild, [['whetstone', 1]]);
    expect(consumablePurchase(world, guild, keeping(), deps)).toBeNull();
    expect(consumablePurchase(world, guild, keeping({ stock: 0 }), deps)).toBeNull();
  });

  test('only the effects given: heal Items alone for a Rival, the draught before the dearer kit', () => {
    const { world, guild } = scene('buy-heal', [['whetstone', 5], ['physicians-kit', 5], ['healing-draught', 5]]);
    const heal = keeping({ effects: ['heal'] });
    const bought = () => consumablePurchase(world, guild, heal, deps);

    expect(bought()).toEqual({ kind: 'buy', guildId: guild.id, definitionKey: 'healing-draught', quantity: 2 });
    addStack(world, 'healing-draught', 2, vaultOf(guild));
    expect(bought()).toEqual({ kind: 'buy', guildId: guild.id, definitionKey: 'physicians-kit', quantity: 2 });
    addStack(world, 'physicians-kit', 2, vaultOf(guild));
    expect(bought()).toBeNull(); // the whetstones are not its to keep
  });

  test('within its means: Wealth above the multiple times the cost, and covering it', () => {
    const { world, guild } = scene('buy-means', [['healing-draught', 5]]);
    const heal = (wealthMultiple: number) => keeping({ effects: ['heal'], wealthMultiple });

    // Two draughts cost 60.
    guild.wealth = 3 * 60;
    expect(consumablePurchase(world, guild, heal(3), deps)).toBeNull();
    guild.wealth = 3 * 60 + 1;
    expect(consumablePurchase(world, guild, heal(3), deps)?.quantity).toBe(2);
    // A multiple below 1 still asks that the Wealth cover the cost.
    guild.wealth = 59;
    expect(consumablePurchase(world, guild, heal(0.5), deps)).toBeNull();
    guild.wealth = 60;
    expect(consumablePurchase(world, guild, heal(0.5), deps)?.quantity).toBe(2);
    // What it lacks decides the cost: one draught lacking costs 30.
    addStack(world, 'healing-draught', 1, vaultOf(guild));
    guild.wealth = 3 * 30 + 1;
    expect(consumablePurchase(world, guild, heal(3), deps)?.quantity).toBe(1);
  });

  test('and, where it keeps a reserve, more than that many Upkeeps left once paid', () => {
    const { world, guild } = scene('buy-reserve', [['whetstone', 5]]);
    const reserve = 20 * upkeep(guild, world, deps.config, deps.content);
    expect(reserve).toBeGreaterThan(0);

    guild.wealth = reserve + 50;
    expect(consumablePurchase(world, guild, keeping(), deps)?.quantity).toBe(2);
    expect(consumablePurchase(world, guild, keeping({ reserveUpkeeps: 20 }), deps)).toBeNull();
    guild.wealth = reserve + 51;
    expect(consumablePurchase(world, guild, keeping({ reserveUpkeeps: 20 }), deps)?.quantity).toBe(2);
  });

  test('none for a folded Guild; and it reads the world, changing nothing', () => {
    const { world, guild } = scene('buy-pure', [['lockpicks', 3]]);
    const before = structuredClone(world);
    deepFreeze(world);

    expect(consumablePurchase(world, guild, keeping(), deps)).toEqual({ kind: 'buy', guildId: guild.id, definitionKey: 'lockpicks', quantity: 2 });
    expect(world).toEqual(before);
    expect(consumablePurchase(world, { ...guild, foldedOnTurn: 0 }, keeping(), deps)).toBeNull();
  });
});
