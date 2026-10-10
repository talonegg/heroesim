import { afterEach, describe, expect, test, vi } from 'vitest';
import { applyAction } from './actions/action.js';
import type { EquipRequest } from './actions/equip.js';
import { advance } from './advance.js';
import type { EngineDeps } from './config.js';
import type { SlotKey } from './content-types.js';
import { rivalChoices } from './controllers/rival.js';
import { createWorld } from './create.js';
import type { Guild, Hero, HeroId, Holder, Party, Quest, QuestId, World, WorldDocument } from './document.js';
import type { TurnEvent } from './events.js';
import { gearChoices, gearModifiers, gearPurchase } from './gear.js';
import { addStack, createItem, holdings } from './items.js';
import { phaseContext } from './phases/phase.js';
import { gearReturn } from './phases/gear-return.js';
import { phases } from './pipeline.js';
import { capability, check } from './quest-engine/check.js';
import { queryParty } from './quest-engine/query.js';
import { effectiveStats, playerGuild } from './selectors.js';
import { nightOf } from './time.js';
import { certainHarmContent, deepFreeze, demandsCheck, ofType, setEncounters, setup, testDeps, withValid } from './world.test-support.js';

// Gear in effective Stats, in the Check, going back to the Guild, and chosen by the
// controllers (DL-49). Worlds come from `createWorld`; every document a test makes is held to the
// validator, and the config values a test relies on are pinned.

/** No Rivals, the Check without variance, and the three slots (INPUTS 7.1). */
const deps = testDeps({ rivalCount: 0, checkVariance: 0 });

afterEach(() => {
  vi.restoreAllMocks();
});

/** Stills every Rival's controller until the spy is restored (DL-30 item 11). */
function stillRivalControllers(): void {
  const rivalControllers = phases.find((phase) => phase.name === 'rivalControllers');
  if (rivalControllers === undefined) throw new Error('No rivalControllers phase');
  vi.spyOn(rivalControllers, 'run').mockReturnValue([]);
}

/** A new world, its player's Guild with no Guildmaster Trait, and the Heroes on its Roster, every Stat at 8 and no Skill. */
function scene(seed: string, with_: EngineDeps = deps): { document: WorldDocument; guild: Guild; heroes: Hero[] } {
  const { document } = createWorld(seed, setup, with_);
  const guild = playerGuild(document.world) as Guild;
  for (const guildmaster of Object.values(document.world.guildmasters)) guildmaster.traits = [];
  const heroes = guild.rosterIds.map((id) => document.world.heroes[id] as Hero);
  for (const hero of heroes) {
    hero.stats = Object.fromEntries(Object.keys(hero.stats).map((key) => [key, 8]));
    hero.skills = {};
  }
  return { document, guild, heroes };
}

const slotOf = (heroId: HeroId, slot: 'weapon' | 'armour' | 'trinket'): Holder => ({ kind: 'hero', id: heroId, slot });

function equipped(document: WorldDocument, request: EquipRequest, with_: EngineDeps = deps): WorldDocument {
  const result = applyAction(document, { kind: 'equip', ...request }, with_);
  if (!result.ok) throw new Error(`Refused: ${result.rejection.reason}`);
  return withValid(result.document, with_);
}

describe('effectiveStats with gear (DL-49)', () => {
  test('adds the modifiers of the gear a Hero carries in its own slots, to every Stat each names', () => {
    const { document, guild, heroes } = scene('gear-sum');
    const [hero] = heroes as [Hero];
    const { world } = document;
    createItem(world, 'barrow-kings-blade', slotOf(hero.id, 'weapon')); // Weaponry +4, Strength +2, Courage +1
    addStack(world, 'plate-harness', 1, slotOf(hero.id, 'armour')); // Constitution +3, Endurance +2, Dexterity −1
    withValid(document, deps);

    expect(gearModifiers(hero.id, world, deps.content)).toEqual({
      weaponry: 4,
      strength: 2,
      courage: 1,
      constitution: 3,
      endurance: 2,
      dexterity: -1,
    });
    expect(effectiveStats(hero, world, deps.content)).toMatchObject({
      weaponry: 12,
      strength: 10,
      courage: 9,
      constitution: 11,
      endurance: 10,
      dexterity: 7,
      arcana: 8,
    });
    expect(guild.rosterIds).toContain(hero.id);
  });

  test('an Item in a slot not its own, or of a definition content lacks, counts for nothing', () => {
    const { document, heroes } = scene('gear-misplaced');
    const [hero] = heroes as [Hero];
    const bare = effectiveStats(hero, document.world, deps.content);
    addStack(document.world, 'short-sword', 1, slotOf(hero.id, 'armour'));
    addStack(document.world, 'whetstone', 1, slotOf(hero.id, 'weapon'));
    createItem(document.world, 'lost-relic', slotOf(hero.id, 'trinket'));
    // The validator warns of each (misplaced-item, unknown-item), as rule 5 has it.
    withValid(document, deps, { allowWarnings: true });

    expect(effectiveStats(hero, document.world, deps.content)).toEqual(bare);
  });

  test("a Rival's Heroes' gear works on them as the player's works on the player's (ADR-0002)", () => {
    const withRival = testDeps({ rivalCount: 1 });
    const { document } = createWorld('gear-rival', setup, withRival);
    const rival = Object.values(document.world.guilds).find((guild) => guild.controller.kind === 'rival') as Guild;
    for (const guildmaster of Object.values(document.world.guildmasters)) guildmaster.traits = [];
    const hero = document.world.heroes[rival.rosterIds[0] as HeroId] as Hero;
    const base = hero.stats['strength'] ?? 0;
    addStack(document.world, 'masterwork-blade', 1, slotOf(hero.id, 'weapon'));

    expect(effectiveStats(hero, withValid(document, withRival).world, withRival.content)['strength']).toBe(Math.min(20, base + 2));
  });
});

describe('the Check reads gear through effectiveStats (DL-44, DL-49)', () => {
  /** Strength alone, summed over the Party, no Skill: the capability is the Party's effective Strength. */
  const strength = demandsCheck('hold-the-line', 'Hold the line', 'sum', [['strength', 1]], [], 1);
  const combat = { kind: 'combat' } as const;

  test('a geared Party beats an identical bare one, with no variance', () => {
    const { document, guild, heroes } = scene('gear-check');
    const [a, b, c, d] = heroes as [Hero, Hero, Hero, Hero];
    const vault: Holder = { kind: 'guild', id: guild.id };
    const blades = addStack(document.world, 'masterwork-blade', 2, vault); // Strength +2 each
    let geared = equipped(withValid(document, deps), { guildId: guild.id, heroId: a.id, stackId: blades });
    geared = equipped(geared, { guildId: guild.id, heroId: b.id, stackId: blades });
    const { world } = geared;
    const members = (...ids: HeroId[]) => ids.map((id) => world.heroes[id] as Hero);
    const withGear = members(a.id, b.id);
    const without = members(c.id, d.id);
    // Identical but for the gear: the same Stats, Skills and Class.
    for (const [one, other] of [[a, c], [b, d]] as const) {
      (world.heroes[other.id] as Hero).classKey = one.classKey;
      expect(world.heroes[other.id]?.stats).toEqual(world.heroes[one.id]?.stats);
    }
    const quest = { difficulty: 18 };

    const partyOf = (heroes: Hero[], at: World) => queryParty(heroes, at, deps);

    expect(capability(partyOf(without, world), combat, strength, world, deps)).toBe(16);
    expect(capability(partyOf(withGear, world), combat, strength, world, deps)).toBe(20);
    const apart = [structuredClone(world), structuredClone(world)] as const;
    expect(check(partyOf(without, apart[0]), combat, strength, quest, apart[0], deps)).toMatchObject({ roll: 16, target: 18, outcome: 'failure' });
    expect(check(partyOf(withGear, apart[1]), combat, strength, quest, apart[1], deps)).toMatchObject({ roll: 20, target: 18, outcome: 'success' });
  });
});

describe('gear goes back to the Guild (DL-49)', () => {
  test("a Hero's gear is back with the Guild the night of their Death, and a survivor keeps theirs", () => {
    const harm = testDeps({ rivalCount: 0, checkVariance: 0 }, certainHarmContent);
    const { document, guild, heroes } = scene('gear-death', harm);
    const [doomed, survivor] = heroes as [Hero, Hero];
    const vault: Holder = { kind: 'guild', id: guild.id };
    const relic = createItem(document.world, 'barrow-kings-blade', vault);
    const shirts = addStack(document.world, 'mail-shirt', 2, vault);
    let current = equipped(withValid(document, harm), { guildId: guild.id, heroId: doomed.id, itemId: relic }, harm);
    current = equipped(current, { guildId: guild.id, heroId: doomed.id, stackId: shirts }, harm);
    current = equipped(current, { guildId: guild.id, heroId: survivor.id, stackId: shirts }, harm);
    expect(holdings(current.world, vault)).toEqual({ items: [], stacks: [] });
    // The doomed Hero's unit is a stack of its own; the survivor's, the last, moved the Guild's stack.
    const doomedShirt = holdings(current.world, slotOf(doomed.id, 'armour')).stacks[0]?.id;
    expect(holdings(current.world, slotOf(survivor.id, 'armour')).stacks[0]?.id).toBe(shirts);

    // The doomed Hero alone, through one Encounter they cannot pass, whose failure kills for certain.
    const offered = current.world.quests[current.world.board[0] as QuestId] as Quest;
    offered.requirements = { partySizeMin: 1, partySizeMax: 4 };
    setEncounters(offered, ['ambush-on-the-road']);
    const sent = applyAction(current, { kind: 'dispatch', guildId: guild.id, questId: offered.id, heroIds: [doomed.id] }, harm);
    if (!sent.ok) throw new Error(`Refused: ${sent.rejection.reason}`);
    (sent.document.world.quests[offered.id] as Quest).difficulty = 5000;
    const party = Object.values(sent.document.world.parties)[0] as Party;
    current = withValid(sent.document, harm);
    const events: TurnEvent[] = [];
    while (current.world.turn < party.returnsOnTurn) {
      const result = advance(current, harm);
      current = withValid(result.document, harm);
      if (current.world.turn < party.returnsOnTurn) {
        // Until the night they die, the Hero carries their gear, away with the Party.
        expect(holdings(current.world, { kind: 'hero', id: doomed.id }).items).toHaveLength(1);
      } else {
        events.push(...result.events);
      }
    }
    const { world } = current;

    expect(ofType(events, 'hero.died').map((event) => event.payload.heroId)).toEqual([doomed.id]);
    const returned = ofType(events, 'item.returned');
    expect(returned.map((event) => [event.turn, event.milestone, event.payload])).toEqual([
      [party.returnsOnTurn, false, { heroId: doomed.id, guildId: guild.id, slot: 'weapon', definitionKey: 'barrow-kings-blade', itemId: relic, stackId: null, cause: 'died' }],
      [party.returnsOnTurn, false, { heroId: doomed.id, guildId: guild.id, slot: 'armour', definitionKey: 'mail-shirt', itemId: null, stackId: doomedShirt, cause: 'died' }],
    ]);
    expect(returned[0]?.participants).toEqual([doomed.id, guild.id, relic]);
    // After the Death, in the order the night runs.
    expect(events.findIndex((event) => event.type === 'item.returned')).toBeGreaterThan(
      events.findIndex((event) => event.type === 'hero.died'),
    );
    expect(holdings(world, { kind: 'hero', id: doomed.id })).toEqual({ items: [], stacks: [] });
    expect(world.items[relic]?.holder).toEqual(vault);
    expect(holdings(world, vault).stacks).toEqual([{ id: doomedShirt, definitionKey: 'mail-shirt', quantity: 1, holder: vault }]);
    expect(holdings(world, { kind: 'hero', id: survivor.id }).stacks.map((stack) => stack.definitionKey)).toEqual(['mail-shirt']);
  });

  test('the gear of a retired Hero goes back that night; a living Hero on the Roster keeps theirs', () => {
    const { document, guild, heroes } = scene('gear-retired');
    const [retiree, active] = heroes as [Hero, Hero];
    const { world } = document;
    const charm = addStack(world, 'lucky-charm', 1, slotOf(retiree.id, 'trinket'));
    addStack(world, 'lucky-charm', 1, slotOf(active.id, 'trinket'));
    world.turn = nightOf(3);
    retiree.retiredOnTurn = world.turn;
    guild.rosterIds = guild.rosterIds.filter((id) => id !== retiree.id);

    const events = gearReturn(world, phaseContext(world, deps));

    expect(events.map((event) => [event.type, event.payload])).toEqual([
      [
        'item.returned',
        { heroId: retiree.id, guildId: guild.id, slot: 'trinket', definitionKey: 'lucky-charm', itemId: null, stackId: charm, cause: 'retired' },
      ],
    ]);
    expect(world.stacks[charm]?.holder).toEqual({ kind: 'guild', id: guild.id });
    expect(holdings(world, { kind: 'hero', id: active.id }).stacks).toHaveLength(1);
    withValid(document, deps);
    // Nothing left to return: a second night returns nothing.
    expect(gearReturn(world, phaseContext(world, deps))).toEqual([]);
  });

  test("a folding Rival's gear goes back to it before it folds, and its Heroes enter the pool carrying nothing", () => {
    const withRival = testDeps({ rivalCount: 1, bankruptcyGraceDays: 0 });
    stillRivalControllers();
    const { document } = createWorld('gear-fold', setup, withRival);
    const { world } = document;
    const rival = Object.values(world.guilds).find((guild) => guild.controller.kind === 'rival') as Guild;
    // It is bankrupt on the first night, under no grace: the Rival folds. (Its
    // Guildmaster's Retirement does not fold it: that is met by Succession, DL-102.)
    rival.wealth = -1_000_000;
    const [first, second] = rival.rosterIds as [HeroId, HeroId];
    const mantle = createItem(world, 'mantle-of-the-fells', slotOf(second, 'armour'));
    const sword = addStack(world, 'short-sword', 1, slotOf(first, 'weapon'));
    withValid(document, withRival);

    let current = document;
    const events: TurnEvent[] = [];
    while (current.world.turn < nightOf(0)) {
      const result = advance(current, withRival);
      current = withValid(result.document, withRival);
      events.push(...result.events);
    }

    const returned = ofType(events, 'item.returned');
    expect(returned.map((event) => [event.payload.heroId, event.payload.cause, event.payload.guildId, event.payload.itemId ?? event.payload.stackId])).toEqual([
      [first, 'guild-folded', rival.id, sword],
      [second, 'guild-folded', rival.id, mantle],
    ]);
    // Before the fold: whatever the fold does with the Guild's holding finds the gear there.
    const folded = events.findIndex((event) => event.type === 'guild.folded');
    expect(folded).toBeGreaterThan(-1);
    for (const event of returned) expect(events.indexOf(event)).toBeLessThan(folded);
    for (const heroId of [first, second]) {
      expect(current.world.heroes[heroId]).toMatchObject({ guildId: null, unattachedSince: nightOf(0) });
      expect(holdings(current.world, { kind: 'hero', id: heroId })).toEqual({ items: [], stacks: [] });
    }
  });
});

describe('gearChoices: the gear the controllers equip (DL-49)', () => {
  function stocked(seed: string): { document: WorldDocument; guild: Guild; heroes: Hero[]; ids: Record<string, string> } {
    const { document, guild, heroes } = scene(seed);
    const [h1, h2, h3] = heroes as [Hero, Hero, Hero, Hero];
    const { world } = document;
    const vault: Holder = { kind: 'guild', id: guild.id };
    // h1 already wears armour; h2 is away with a Party; h3 is injured, at the Hall.
    addStack(world, 'padded-jack', 1, slotOf(h1.id, 'armour'));
    h3.injury = { typeKey: 'broken-arm', healsOnTurn: 30 };
    const ids = {
      lantern: createItem(world, 'lantern-of-stannary', vault), // trinket, worth 5
      blade: addStack(world, 'masterwork-blade', 1, vault), // weapon, worth 5
      plate: addStack(world, 'plate-harness', 1, vault), // armour, worth 4
      shirts: addStack(world, 'mail-shirt', 2, vault), // armour, worth 3
      whetstones: addStack(world, 'whetstone', 3, vault), // a consumable
    };
    const quest = world.quests[world.board[0] as QuestId] as Quest;
    quest.requirements = { partySizeMin: 1, partySizeMax: 4 };
    const sent = applyAction(withValid(document, deps), { kind: 'dispatch', guildId: guild.id, questId: quest.id, heroIds: [h2.id] }, deps);
    if (!sent.ok) throw new Error(`Refused: ${sent.rejection.reason}`);
    return { document: withValid(sent.document, deps), guild, heroes, ids };
  }

  test('puts the best gear first on the first Hero in Roster order with the slot empty, passing over the away, and equipping the injured', () => {
    const { document, guild, heroes, ids } = stocked('gear-choices');
    const [h1, , h3, h4] = heroes as [Hero, Hero, Hero, Hero];

    const actions = gearChoices(document.world, document.world.guilds[guild.id] as Guild, deps);

    expect(actions).toEqual([
      { kind: 'equip', guildId: guild.id, heroId: h1.id, itemId: ids['lantern'] },
      { kind: 'equip', guildId: guild.id, heroId: h1.id, stackId: ids['blade'] },
      { kind: 'equip', guildId: guild.id, heroId: h3.id, stackId: ids['plate'] },
      { kind: 'equip', guildId: guild.id, heroId: h4.id, stackId: ids['shirts'] },
    ]);
    // Every one is accepted, applied in order; a mail shirt and the whetstones stay in the holding.
    let current = document;
    for (const action of actions) {
      const result = applyAction(current, action, deps);
      if (!result.ok) throw new Error(`Refused: ${result.rejection.reason}`);
      current = withValid(result.document, deps);
    }
    expect(holdings(current.world, { kind: 'guild', id: guild.id }).stacks.map((stack) => [stack.definitionKey, stack.quantity])).toEqual([
      ['mail-shirt', 1],
      ['whetstone', 3],
    ]);
    // Asked again, nothing is left to put on anyone.
    expect(gearChoices(current.world, current.world.guilds[guild.id] as Guild, deps)).toEqual([]);
  });

  test('a stack of several goes to several Heroes, its last unit moving the stack itself', () => {
    const { document, guild, heroes } = scene('gear-stack');
    const stack = addStack(document.world, 'lucky-charm', 3, { kind: 'guild', id: guild.id });
    const actions = gearChoices(document.world, guild, deps);

    expect(actions.map((action) => action.heroId)).toEqual(heroes.slice(0, 3).map((hero) => hero.id));
    let current = withValid(document, deps);
    for (const action of actions) {
      const result = applyAction(current, action, deps);
      if (!result.ok) throw new Error(`Refused: ${result.rejection.reason}`);
      current = withValid(result.document, deps);
    }
    expect(current.world.stacks[stack]?.holder.kind).toBe('hero');
  });

  test('chooses nothing for a folded Guild', () => {
    const { document, guild } = scene('gear-none', deps);
    addStack(document.world, 'short-sword', 1, { kind: 'guild', id: guild.id });
    expect(gearChoices(document.world, guild, deps)).toHaveLength(1);
    guild.foldedOnTurn = 0;
    expect(gearChoices(document.world, guild, deps)).toEqual([]);
  });

  test("steady equips first, by gearChoices, and the afternoon's controllers apply it to a Rival (ADR-0002)", () => {
    const withRival = testDeps({ rivalCount: 1 });
    const { document } = createWorld('gear-steady', setup, withRival);
    const rival = Object.values(document.world.guilds).find((guild) => guild.controller.kind === 'rival') as Guild;
    const shirt = addStack(document.world, 'mail-shirt', 1, { kind: 'guild', id: rival.id });
    const world: World = structuredClone(withValid(document, withRival).world);
    world.turn = 1;

    const choices = rivalChoices(world, rival, withRival);
    const gear = gearChoices(world, rival, withRival);

    expect(gear).toEqual([{ kind: 'equip', guildId: rival.id, heroId: rival.rosterIds[0], stackId: shirt }]);
    expect(choices.slice(0, gear.length)).toEqual(gear);
    const afternoon = advance(document, withRival);
    withValid(afternoon.document, withRival);
    expect(ofType(afternoon.events, 'item.equipped').map((event) => event.payload.guildId)).toEqual([rival.id]);
    expect(afternoon.document.world.stacks[shirt]?.holder).toEqual(slotOf(rival.rosterIds[0] as HeroId, 'armour'));
  });
});

// DL-58: the one rule a controller buys gear by, a Rival with its Disposition's gearThreshold
// and every slot, armour first (controllers/rival.test.ts), the harness's policy with its own multiple
// and the armour slot alone (harness/src/policy.test.ts). Every Guild alike (ADR-0002): here the
// player's.
describe('gearPurchase: which piece of gear a controller buys', () => {
  /** The player's Guild, rich, and a Market holding `stacks` alone. */
  function shopping(seed: string, stacks: readonly (readonly [string, number])[], with_: EngineDeps = deps) {
    const { document, guild, heroes } = scene(seed, with_);
    guild.wealth = 10_000;
    const market = holdings(document.world, { kind: 'market' });
    for (const stack of market.stacks) delete document.world.stacks[stack.id];
    for (const item of market.items) delete document.world.items[item.id];
    for (const [definitionKey, quantity] of stacks) addStack(document.world, definitionKey, quantity, { kind: 'market' });
    return { world: document.world, guild, heroes };
  }
  const keyOf = (action: { definitionKey: string } | null) => action?.definitionKey ?? null;

  test('buys for the first of the slots given, in their order, that wants a piece: the dearest within its means', () => {
    const { world, guild } = shopping('purchase-order', [['plate-harness', 5], ['masterwork-blade', 5], ['short-sword', 5]]);

    expect(gearPurchase(world, guild, ['armour', 'weapon'], 3, deps)).toEqual({
      kind: 'buy',
      guildId: guild.id,
      definitionKey: 'plate-harness',
      quantity: 1,
    });
    expect(keyOf(gearPurchase(world, guild, ['weapon', 'armour'], 3, deps))).toBe('masterwork-blade');
    // Wealth at three times the blade's price, and no more: the sword, the dearest weapon within it.
    guild.wealth = 3 * 300;
    expect(keyOf(gearPurchase(world, guild, ['weapon', 'armour'], 3, deps))).toBe('short-sword');
    // Wealth to cover the plate once but not above one times its price: none.
    guild.wealth = 300;
    expect(gearPurchase(world, guild, ['armour'], 1, deps)).toBeNull();
    guild.wealth = 301;
    expect(keyOf(gearPurchase(world, guild, ['armour'], 1, deps))).toBe('plate-harness');
  });

  test('none for a folded Guild, a slot that is no gear slot, or a slot whose every Hero has a piece', () => {
    const { world, guild, heroes } = shopping('purchase-none', [['padded-jack', 20]]);

    expect(gearPurchase(world, guild, ['belt' as SlotKey], 3, deps)).toBeNull();
    expect(keyOf(gearPurchase(world, guild, ['armour'], 3, deps))).toBe('padded-jack');
    // Every Hero wears a piece but one, for whom the Guild holds one: nothing to buy.
    const [, ...rest] = heroes as [Hero, ...Hero[]];
    for (const hero of rest) addStack(world, 'padded-jack', 1, slotOf(hero.id, 'armour'));
    expect(keyOf(gearPurchase(world, guild, ['armour'], 3, deps))).toBe('padded-jack');
    addStack(world, 'mail-shirt', 1, { kind: 'guild', id: guild.id });
    expect(gearPurchase(world, guild, ['armour'], 3, deps)).toBeNull();
    world.stacks = Object.fromEntries(Object.entries(world.stacks).filter(([, stack]) => stack.holder.kind !== 'guild'));
    expect(keyOf(gearPurchase(world, guild, ['armour'], 3, deps))).toBe('padded-jack');
    guild.foldedOnTurn = 0;
    expect(gearPurchase(world, guild, ['armour'], 3, deps)).toBeNull();
  });

  test('reads the world and changes nothing in it', () => {
    const { world, guild } = shopping('purchase-pure', [['mail-shirt', 3]]);
    const before = structuredClone(world);
    deepFreeze(world);

    expect(keyOf(gearPurchase(world, guild, ['weapon', 'armour', 'trinket'], 3, deps))).toBe('mail-shirt');
    expect(world).toEqual(before);
  });
});
