import { describe, expect, test } from 'vitest';
import type { EngineDeps } from '../config.js';
import { createWorld } from '../create.js';
import type { Guild, Hero, HeroId, Holder, ItemId, Quest, QuestId, StackId, WorldDocument } from '../document.js';
import type { ItemEquipped, ItemUnequipped } from '../events.js';
import { addStack, createItem, holdings } from '../items.js';
import { effectiveStats, playerGuild } from '../selectors.js';
import { serialise } from '../serialise.js';
import { testDeps, withValid } from '../world.test-support.js';
import { applyAction, applyGuildAction } from './action.js';
import { dispatch } from './dispatch.js';
import { equip, unequip, type EquipRejection, type EquipRequest, type UnequipRejection } from './equip.js';

// M5-S2: `equip` and `unequip` (DL-49). Worlds are made by `createWorld` with no Rivals, and the
// player's Guild is handed the Items a test needs; every document a test makes is held to the
// validator, and the config a test relies on is pinned.

const setup = { guildmasterName: 'Ada', guildName: 'The Test', createdAt: 'test' };

/**
 * No Rivals, the three slots pinned (INPUTS 7.1), and an empty Market (M5-S4), so that the only
 * stacks of a definition are the ones a test hands the Guild.
 */
const deps = testDeps({ rivalCount: 0, gearSlots: ['weapon', 'armour', 'trinket'], marketSize: 0 });

interface Scene {
  document: WorldDocument;
  guild: Guild;
  /** The first Hero on the Roster, every Stat 8, and the second. */
  hero: Hero;
  other: Hero;
  /** Three Masterwork blades (Weaponry +3, Strength +2) in the Guild's holding. */
  blades: StackId;
  /** The Barrow King's blade, unique, in the Guild's holding. */
  relic: ItemId;
  /** Two whetstones, a consumable, in the Guild's holding. */
  whetstones: StackId;
}

/**
 * A new world whose player's Guild holds three Masterwork blades, the Barrow King's blade and two
 * whetstones, its Guildmaster has no Trait (whose Class Stat bonus would blur the Stats read), and
 * its first Hero has every Stat at 8.
 */
function scene(seed = 'equip', with_: EngineDeps = deps): Scene {
  const { document } = createWorld(seed, setup, with_);
  const { world } = document;
  const guild = playerGuild(world) as Guild;
  for (const guildmaster of Object.values(world.guildmasters)) guildmaster.traits = [];
  const [hero, other] = guild.rosterIds.map((id) => world.heroes[id] as Hero) as [Hero, Hero];
  hero.stats = Object.fromEntries(Object.keys(hero.stats).map((key) => [key, 8]));
  const vault: Holder = { kind: 'guild', id: guild.id };
  const blades = addStack(world, 'masterwork-blade', 3, vault);
  const relic = createItem(world, 'barrow-kings-blade', vault);
  const whetstones = addStack(world, 'whetstone', 2, vault);
  return { document: withValid(document, with_), guild, hero, other, blades, relic, whetstones };
}

function equipped(document: WorldDocument, request: EquipRequest, with_: EngineDeps = deps): WorldDocument {
  const result = equip(document, request, with_);
  if (!result.ok) throw new Error(`Refused: ${result.rejection.reason}`);
  return withValid(result.document, with_);
}

const heroSlot = (heroId: HeroId, slot: 'weapon' | 'armour' | 'trinket'): Holder => ({ kind: 'hero', id: heroId, slot });

describe('equip', () => {
  test('equipping a +2 Strength weapon raises the effective Stat and not the base', () => {
    const { document, guild, hero, blades } = scene();
    const before = effectiveStats(hero, document.world, deps.content);

    const result = equip(document, { guildId: guild.id, heroId: hero.id, stackId: blades }, deps);
    if (!result.ok) throw new Error(`Refused: ${result.rejection.reason}`);
    const after = withValid(result.document, deps);
    const geared = after.world.heroes[hero.id] as Hero;

    expect(before['strength']).toBe(8);
    expect(effectiveStats(geared, after.world, deps.content)).toEqual({ ...before, strength: 10, weaponry: 11 });
    // The base is untouched (data-model rule 1).
    expect(geared.stats['strength']).toBe(8);
    expect(geared.stats).toEqual(hero.stats);
  });

  test('a common Item takes one unit of the stack; the rest stays in the holding; item.equipped names who and what', () => {
    const { document, guild, hero, blades } = scene();

    const result = equip(document, { guildId: guild.id, heroId: hero.id, stackId: blades }, deps);
    if (!result.ok) throw new Error(`Refused: ${result.rejection.reason}`);
    const { world } = withValid(result.document, deps);

    const [carried] = holdings(world, heroSlot(hero.id, 'weapon')).stacks;
    expect(carried).toMatchObject({ definitionKey: 'masterwork-blade', quantity: 1 });
    expect(world.stacks[blades]).toMatchObject({ quantity: 2, holder: { kind: 'guild', id: guild.id } });
    expect(result.events).toEqual([
      expect.objectContaining<Partial<ItemEquipped>>({
        type: 'item.equipped',
        turn: 0,
        milestone: false,
        participants: [hero.id, guild.id, carried?.id as StackId],
        payload: {
          heroId: hero.id,
          guildId: guild.id,
          slot: 'weapon',
          definitionKey: 'masterwork-blade',
          itemId: null,
          stackId: carried?.id as StackId,
        },
      }),
    ]);
    expect(result.document.history.entries.at(-1)).toEqual(result.events[0]);
    // The old document is left as it was (DL-24).
    expect(document.world.stacks[blades]?.quantity).toBe(3);
  });

  test('a unique Item moves whole, into the slot given or the gear\'s own', () => {
    const { document, guild, hero, other, relic } = scene();

    const one = equipped(document, { guildId: guild.id, heroId: hero.id, itemId: relic, slot: 'weapon' });

    expect(one.world.items[relic]?.holder).toEqual(heroSlot(hero.id, 'weapon'));
    const [event] = one.history.entries.slice(-1);
    expect(event).toMatchObject({ type: 'item.equipped', participants: [hero.id, guild.id, relic] });
    expect(event?.payload).toMatchObject({ itemId: relic, stackId: null, slot: 'weapon' });
    // A second unit of a stack goes to another Hero; the last unit moves the stack itself.
    const blades = Object.values(one.world.stacks).find((stack) => stack.definitionKey === 'masterwork-blade');
    const two = equipped(one, { guildId: guild.id, heroId: other.id, stackId: blades?.id as StackId });
    expect(holdings(two.world, heroSlot(other.id, 'weapon')).stacks).toHaveLength(1);
  });

  test('an injured Hero at the Hall may be equipped', () => {
    const { document, guild, hero, blades } = scene();
    (document.world.heroes[hero.id] as Hero).injury = { typeKey: 'broken-arm', healsOnTurn: 30 };

    expect(equip(document, { guildId: guild.id, heroId: hero.id, stackId: blades }, deps).ok).toBe(true);
  });

  test('applyAction and applyGuildAction run the same rule', () => {
    const { document, guild, hero, blades } = scene();
    const action = { kind: 'equip', guildId: guild.id, heroId: hero.id, stackId: blades } as const;

    const viaDocument = applyAction(document, action, deps);
    const world = structuredClone(document.world);
    const viaWorld = applyGuildAction(world, action, deps);

    if (!viaDocument.ok || !viaWorld.ok) throw new Error('Refused');
    expect(viaWorld.events).toEqual(viaDocument.events);
    expect(world).toEqual(viaDocument.document.world);
  });

  describe('refuses, changing nothing, in the order it checks', () => {
    type Case = [string, (scene: Scene) => { request: EquipRequest; with_?: EngineDeps }, Partial<EquipRejection>];
    const cases: Case[] = [
      [
        'guild-folded',
        ({ guild, hero, blades }) => {
          guild.foldedOnTurn = 0;
          return { request: { guildId: guild.id, heroId: hero.id, stackId: blades } };
        },
        { reason: 'guild-folded' },
      ],
      [
        'hero-not-on-roster: an Unattached Hero',
        ({ document, guild, blades }) => {
          const pooled = Object.values(document.world.heroes).find((it) => it.unattachedSince !== null) as Hero;
          return { request: { guildId: guild.id, heroId: pooled.id, stackId: blades } };
        },
        { reason: 'hero-not-on-roster' },
      ],
      [
        'hero-not-on-roster: no Hero at all',
        ({ guild, blades }) => ({ request: { guildId: guild.id, heroId: 'hero-999999' as HeroId, stackId: blades } }),
        { reason: 'hero-not-on-roster', heroId: 'hero-999999' as HeroId },
      ],
      [
        'hero-unavailable: dead',
        ({ guild, hero, blades }) => {
          hero.diedOnTurn = 0;
          guild.rosterIds = guild.rosterIds.filter((id) => id !== hero.id);
          return { request: { guildId: guild.id, heroId: hero.id, stackId: blades } };
        },
        { reason: 'hero-unavailable', because: 'dead' },
      ],
      [
        'hero-unavailable: retired',
        ({ guild, hero, blades }) => {
          hero.retiredOnTurn = 0;
          guild.rosterIds = guild.rosterIds.filter((id) => id !== hero.id);
          return { request: { guildId: guild.id, heroId: hero.id, stackId: blades } };
        },
        { reason: 'hero-unavailable', because: 'retired' },
      ],
      [
        'not-held-by-guild: the Market\'s',
        ({ document, guild, hero }) => {
          const market = addStack(document.world, 'mail-shirt', 2, { kind: 'market' });
          return { request: { guildId: guild.id, heroId: hero.id, stackId: market } };
        },
        { reason: 'not-held-by-guild', itemId: null },
      ],
      [
        'not-held-by-guild: on another Hero',
        ({ document, guild, hero, other }) => {
          const worn = createItem(document.world, 'mantle-of-the-fells', heroSlot(other.id, 'armour'));
          return { request: { guildId: guild.id, heroId: hero.id, itemId: worn } };
        },
        { reason: 'not-held-by-guild', stackId: null },
      ],
      [
        'not-held-by-guild: no such stack',
        ({ guild, hero }) => ({ request: { guildId: guild.id, heroId: hero.id, stackId: 'stack-999999' as StackId } }),
        { reason: 'not-held-by-guild', stackId: 'stack-999999' as StackId, itemId: null },
      ],
      [
        'not-held-by-guild before not-gear: a consumable the Market holds',
        ({ document, guild, hero }) => {
          const market = addStack(document.world, 'whetstone', 2, { kind: 'market' });
          return { request: { guildId: guild.id, heroId: hero.id, stackId: market } };
        },
        { reason: 'not-held-by-guild', itemId: null },
      ],
      [
        'hero-unavailable before slot-occupied: a dead Hero still carrying a weapon, the night not yet come',
        ({ document, guild, hero, blades }) => {
          createItem(document.world, 'vault-wardens-staff', heroSlot(hero.id, 'weapon'));
          hero.diedOnTurn = 0;
          guild.rosterIds = guild.rosterIds.filter((id) => id !== hero.id);
          return { request: { guildId: guild.id, heroId: hero.id, stackId: blades } };
        },
        { reason: 'hero-unavailable', because: 'dead' },
      ],
      [
        'not-gear: a consumable',
        ({ guild, hero, whetstones }) => ({ request: { guildId: guild.id, heroId: hero.id, stackId: whetstones } }),
        { reason: 'not-gear', definitionKey: 'whetstone' },
      ],
      [
        'wrong-slot: a weapon asked into the armour slot',
        ({ guild, hero, blades }) => ({ request: { guildId: guild.id, heroId: hero.id, stackId: blades, slot: 'armour' } }),
        { reason: 'wrong-slot', slot: 'armour', gearSlot: 'weapon' },
      ],
      [
        'wrong-slot: a game whose Heroes have no weapon slot',
        ({ guild, hero, blades }) => ({
          request: { guildId: guild.id, heroId: hero.id, stackId: blades },
          with_: testDeps({ rivalCount: 0, gearSlots: ['armour', 'trinket'] }),
        }),
        { reason: 'wrong-slot', slot: 'weapon', gearSlot: 'weapon', heroSlots: ['armour', 'trinket'] },
      ],
      [
        'slot-occupied: equip never swaps',
        ({ document, guild, hero, blades }) => {
          createItem(document.world, 'vault-wardens-staff', heroSlot(hero.id, 'weapon'));
          return { request: { guildId: guild.id, heroId: hero.id, stackId: blades } };
        },
        { reason: 'slot-occupied', slot: 'weapon' },
      ],
    ];

    test.each(cases)('%s', (_name, arrange, rejection) => {
      const arranged = scene();
      const { request, with_ = deps } = arrange(arranged);
      const before = serialise(arranged.document);

      const result = equip(arranged.document, request, with_);

      expect(result).toEqual({ ok: false, rejection: expect.objectContaining({ action: 'equip', ...rejection }) });
      expect(serialise(arranged.document)).toBe(before);
    });

    test('hero-unavailable: away with a Party, which has their gear with it', () => {
      const { document, guild, hero, blades } = scene();
      const quest = document.world.quests[document.world.board[0] as QuestId] as Quest;
      quest.requirements = { partySizeMin: 1, partySizeMax: 4 };
      const sent = dispatch(document, { guildId: guild.id, questId: quest.id, heroIds: [hero.id] }, deps);
      if (!sent.ok) throw new Error(`Refused: ${sent.rejection.reason}`);

      expect(equip(sent.document, { guildId: guild.id, heroId: hero.id, stackId: blades }, deps)).toEqual({
        ok: false,
        rejection: { action: 'equip', reason: 'hero-unavailable', heroId: hero.id, because: 'in-party' },
      });
      expect(unequip(sent.document, { guildId: guild.id, heroId: hero.id, slot: 'weapon' }, deps)).toEqual({
        ok: false,
        rejection: { action: 'unequip', reason: 'hero-unavailable', heroId: hero.id, because: 'in-party' },
      });
    });
  });

  test("not-held-by-guild: gear in another Guild's holding, a unique Item or a stack, is not this Guild's to equip", () => {
    const withRival = testDeps({ rivalCount: 1, gearSlots: ['weapon', 'armour', 'trinket'], marketSize: 0 });
    const { document, guild, hero } = scene('equip-rival', withRival);
    const rival = Object.values(document.world.guilds).find((it) => it.controller.kind === 'rival') as Guild;
    const theirs: Holder = { kind: 'guild', id: rival.id };
    const shirt = addStack(document.world, 'mail-shirt', 1, theirs);
    const mantle = createItem(document.world, 'mantle-of-the-fells', theirs);
    withValid(document, withRival);
    const before = serialise(document);

    expect(equip(document, { guildId: guild.id, heroId: hero.id, stackId: shirt }, withRival)).toEqual({
      ok: false,
      rejection: { action: 'equip', reason: 'not-held-by-guild', itemId: null, stackId: shirt },
    });
    expect(equip(document, { guildId: guild.id, heroId: hero.id, itemId: mantle }, withRival)).toEqual({
      ok: false,
      rejection: { action: 'equip', reason: 'not-held-by-guild', itemId: mantle, stackId: null },
    });
    expect(serialise(document)).toBe(before);
  });

  test('throws on a programming error: a Guild not in the world, or neither or both of itemId and stackId', () => {
    const { document, guild, hero, blades, relic } = scene();

    expect(() => equip(document, { guildId: 'guild-999999' as Guild['id'], heroId: hero.id, stackId: blades }, deps)).toThrow(
      RangeError,
    );
    expect(() => equip(document, { guildId: guild.id, heroId: hero.id } as EquipRequest, deps)).toThrow(RangeError);
    expect(() =>
      equip(document, { guildId: guild.id, heroId: hero.id, stackId: blades, itemId: relic } as unknown as EquipRequest, deps),
    ).toThrow(RangeError);
  });
});

describe('unequip', () => {
  test('takes the gear back into the Guild\'s holding, a stack joining the Guild\'s own, and the effective Stats back to the base', () => {
    const { document, guild, hero, blades } = scene();
    const bare = effectiveStats(hero, document.world, deps.content);
    const geared = equipped(document, { guildId: guild.id, heroId: hero.id, stackId: blades });

    const result = unequip(geared, { guildId: guild.id, heroId: hero.id, slot: 'weapon' }, deps);
    if (!result.ok) throw new Error(`Refused: ${result.rejection.reason}`);
    const { world } = withValid(result.document, deps);

    expect(holdings(world, { kind: 'hero', id: hero.id }).stacks).toEqual([]);
    // One stack of three again: the unit joined the Guild's stack, which kept its id.
    expect(Object.values(world.stacks).filter((stack) => stack.definitionKey === 'masterwork-blade')).toEqual([
      { id: blades, definitionKey: 'masterwork-blade', quantity: 3, holder: { kind: 'guild', id: guild.id } },
    ]);
    expect(effectiveStats(world.heroes[hero.id] as Hero, world, deps.content)).toEqual(bare);
    expect(result.events).toEqual([
      expect.objectContaining<Partial<ItemUnequipped>>({
        type: 'item.unequipped',
        participants: [hero.id, guild.id, blades],
        payload: { heroId: hero.id, guildId: guild.id, slot: 'weapon', definitionKey: 'masterwork-blade', itemId: null, stackId: blades },
      }),
    ]);
  });

  test('a unique Item goes back whole', () => {
    const { document, guild, hero, relic } = scene();
    const geared = equipped(document, { guildId: guild.id, heroId: hero.id, itemId: relic });

    const result = unequip(geared, { guildId: guild.id, heroId: hero.id, slot: 'weapon' }, deps);
    if (!result.ok) throw new Error(`Refused: ${result.rejection.reason}`);

    expect(withValid(result.document, deps).world.items[relic]?.holder).toEqual({ kind: 'guild', id: guild.id });
    expect(result.events.map((event) => event.payload)).toEqual([
      { heroId: hero.id, guildId: guild.id, slot: 'weapon', definitionKey: 'barrow-kings-blade', itemId: relic, stackId: null },
    ]);
  });

  test.each<[string, (scene: Scene) => HeroId, Partial<UnequipRejection>]>([
    ['slot-empty', ({ hero }) => hero.id, { reason: 'slot-empty', slot: 'weapon' }],
    [
      'hero-not-on-roster',
      ({ document }) => (Object.values(document.world.heroes).find((it) => it.unattachedSince !== null) as Hero).id,
      { reason: 'hero-not-on-roster' },
    ],
    [
      'guild-folded',
      ({ guild, hero }) => {
        guild.foldedOnTurn = 0;
        return hero.id;
      },
      { reason: 'guild-folded' },
    ],
  ])('refuses %s, changing nothing', (_name, arrange, rejection) => {
    const arranged = scene();
    const heroId = arrange(arranged);
    const before = serialise(arranged.document);

    const result = unequip(arranged.document, { guildId: arranged.guild.id, heroId, slot: 'weapon' }, deps);

    expect(result).toEqual({ ok: false, rejection: expect.objectContaining({ action: 'unequip', ...rejection }) });
    expect(serialise(arranged.document)).toBe(before);
  });
});
