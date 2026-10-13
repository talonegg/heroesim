import { describe, expect, test } from 'vitest';
import { makeId, type Guild, type GuildId, type QuestId, type WorldDocument } from './document.js';
import { addStack, createItem, holdings } from './items.js';
import { surplusChoices, type SurplusKeeping } from './surplus.js';
import { buildDocument, testDeps } from './world.test-support.js';

const deps = testDeps({ rivalCount: 0, sellRatio: 0.5 });

function cleanGuild(document: WorldDocument, guildId: GuildId): Guild {
  const guild = document.world.guilds[guildId] as Guild;
  for (const item of holdings(document.world, { kind: 'guild', id: guildId }).items) delete document.world.items[item.id];
  for (const stack of holdings(document.world, { kind: 'guild', id: guildId }).stacks) delete document.world.stacks[stack.id];
  for (const party of Object.values(document.world.parties)) {
    if (party.guildId === guildId) {
      for (const stack of holdings(document.world, { kind: 'party', id: party.id }).stacks) delete document.world.stacks[stack.id];
    }
  }
  return guild;
}

describe('surplusChoices: what a controller sells from its holding (Q18, DL-301)', () => {
  const keeping: SurplusKeeping = { effects: ['heal'], stock: 2 };

  test('a folded Guild sells nothing', () => {
    const { document, ids } = buildDocument();
    const guild = cleanGuild(document, ids.playerGuild);
    guild.foldedOnTurn = 1;
    createItem(document.world, 'barrow-kings-blade', { kind: 'guild', id: guild.id });
    expect(surplusChoices(document.world, guild, keeping, deps)).toEqual([]);
  });

  describe('loot-only Items in holding', () => {
    test('sells a loot-only Item in holding, since no Hero carries it', () => {
      const { document, ids } = buildDocument();
      const guild = cleanGuild(document, ids.playerGuild);
      const blade = createItem(document.world, 'barrow-kings-blade', { kind: 'guild', id: guild.id });

      const choices = surplusChoices(document.world, guild, keeping, deps);
      expect(choices).toEqual([{ kind: 'sell', guildId: guild.id, itemId: blade }]);
    });

    test('a loot-only Item carried by a Hero is not in the holding and is not sold', () => {
      const { document, ids } = buildDocument();
      const guild = cleanGuild(document, ids.playerGuild);
      const [heroId] = guild.rosterIds;
      createItem(document.world, 'barrow-kings-blade', { kind: 'hero', id: heroId!, slot: 'weapon' });

      const choices = surplusChoices(document.world, guild, keeping, deps);
      expect(choices).toEqual([]);
    });
  });

  describe('consumables', () => {
    test('sells consumables of effects the Guild does not keep', () => {
      const { document, ids } = buildDocument();
      const guild = cleanGuild(document, ids.playerGuild);
      const whetstones = addStack(document.world, 'whetstone', 3, { kind: 'guild', id: guild.id });
      const lockpicks = addStack(document.world, 'lockpicks', 2, { kind: 'guild', id: guild.id });

      // keeping only 'heal'
      const choices = surplusChoices(document.world, guild, keeping, deps);
      expect(choices).toEqual([
        { kind: 'sell', guildId: guild.id, stackId: whetstones, quantity: 3 },
        { kind: 'sell', guildId: guild.id, stackId: lockpicks, quantity: 2 },
      ]);
    });

    test('sells consumables of kept effects above stock, counting what Parties carry', () => {
      const { document, ids } = buildDocument();
      const guild = cleanGuild(document, ids.playerGuild);
      const draughts = addStack(document.world, 'healing-draught', 5, { kind: 'guild', id: guild.id });

      // stock is 2; 5 held -> 3 surplus
      const choices = surplusChoices(document.world, guild, keeping, deps);
      expect(choices).toEqual([{ kind: 'sell', guildId: guild.id, stackId: draughts, quantity: 3 }]);
    });

    test('keeps consumables up to stock, accounting for Parties carrying them', () => {
      const { document, ids } = buildDocument();
      const guild = cleanGuild(document, ids.playerGuild);
      const draughts = addStack(document.world, 'healing-draught', 3, { kind: 'guild', id: guild.id });

      // Party carries 1 healing draught; stock is 2, so at home can keep 2 - 1 = 1; surplus = 3 - 1 = 2
      const party = Object.values(document.world.parties).find((p) => p.guildId === guild.id);
      if (!party) throw new Error('No party');
      addStack(document.world, 'healing-draught', 1, { kind: 'party', id: party.id });

      const choices = surplusChoices(document.world, guild, keeping, deps);
      expect(choices).toEqual([{ kind: 'sell', guildId: guild.id, stackId: draughts, quantity: 2 }]);
    });
  });

  describe('gear in holding', () => {
    test('sells gear in holding when all living Heroes already have that slot equipped', () => {
      const { document, ids } = buildDocument();
      const guild = cleanGuild(document, ids.playerGuild);

      // Equip weapons on all roster heroes:
      for (const heroId of guild.rosterIds) {
        addStack(document.world, 'short-sword', 1, { kind: 'hero', id: heroId, slot: 'weapon' });
      }

      // Add extra swords to guild holding:
      const swords = addStack(document.world, 'short-sword', 2, { kind: 'guild', id: guild.id });
      const masterwork = addStack(document.world, 'masterwork-blade', 1, { kind: 'guild', id: guild.id });

      const choices = surplusChoices(document.world, guild, keeping, deps);
      expect(choices).toEqual([
        { kind: 'sell', guildId: guild.id, stackId: swords, quantity: 2 },
        { kind: 'sell', guildId: guild.id, stackId: masterwork, quantity: 1 },
      ]);
    });

    test('keeps the best gear pieces needed for Heroes with empty slots, selling the rest', () => {
      const { document, ids } = buildDocument({ rosterSize: 4 });
      const guild = cleanGuild(document, ids.playerGuild);

      // Guild has 4 living roster heroes. Equip armour on 2 of them, leaving 2 with empty armour slots.
      const [h0, h1, h2, h3] = guild.rosterIds;
      if (!h0 || !h1 || !h2 || !h3) throw new Error('Need 4 heroes');
      addStack(document.world, 'padded-jack', 1, { kind: 'hero', id: h0, slot: 'armour' });
      addStack(document.world, 'padded-jack', 1, { kind: 'hero', id: h1, slot: 'armour' });

      // Holding has 1 plate-harness (worth 4), 1 mail-shirt (worth 3), 2 padded-jack (worth 1).
      // 2 heroes lack armour. The best 2 pieces (plate-harness and mail-shirt) are kept. Both padded jacks are surplus.
      addStack(document.world, 'plate-harness', 1, { kind: 'guild', id: guild.id });
      addStack(document.world, 'mail-shirt', 1, { kind: 'guild', id: guild.id });
      const jacks = addStack(document.world, 'padded-jack', 2, { kind: 'guild', id: guild.id });

      const choices = surplusChoices(document.world, guild, keeping, deps);
      expect(choices).toEqual([{ kind: 'sell', guildId: guild.id, stackId: jacks, quantity: 2 }]);
    });

    test('keeps a partial stack when part of it is needed for empty slots', () => {
      const { document, ids } = buildDocument({ rosterSize: 4 });
      const guild = cleanGuild(document, ids.playerGuild);

      // 1 hero lacks armour (3 have armour).
      const [h0, h1, h2, h3] = guild.rosterIds;
      if (!h0 || !h1 || !h2 || !h3) throw new Error('Need 4 heroes');
      addStack(document.world, 'padded-jack', 1, { kind: 'hero', id: h0, slot: 'armour' });
      addStack(document.world, 'padded-jack', 1, { kind: 'hero', id: h1, slot: 'armour' });
      addStack(document.world, 'padded-jack', 1, { kind: 'hero', id: h2, slot: 'armour' });

      // Holding has 3 padded-jacks. 1 needed, 2 surplus.
      const jacks = addStack(document.world, 'padded-jack', 3, { kind: 'guild', id: guild.id });

      const choices = surplusChoices(document.world, guild, keeping, deps);
      expect(choices).toEqual([{ kind: 'sell', guildId: guild.id, stackId: jacks, quantity: 2 }]);
    });
  });

  describe('plannedActions in the same turn', () => {
    test('deducts items equipped or dispatched in plannedActions so sales do not conflict', () => {
      const { document, ids } = buildDocument();
      const guild = cleanGuild(document, ids.playerGuild);

      const draughts = addStack(document.world, 'healing-draught', 4, { kind: 'guild', id: guild.id });
      const [h0] = guild.rosterIds;
      if (!h0) throw new Error('Need hero');

      // Planned dispatch takes 1 draught:
      const planned = [
        {
          kind: 'dispatch' as const,
          guildId: guild.id,
          questId: 'quest-000001' as QuestId,
          heroIds: [h0],
          consumables: [{ definitionKey: 'healing-draught', quantity: 1 }],
        },
      ];

      // Total draughts: 4. Planned dispatch takes 1, leaving 3 available in holding.
      // Total owned: 1 in party + 3 in holding = 4. Stock is 2.
      // Surplus is 2.
      const choices = surplusChoices(document.world, guild, keeping, deps, planned);
      expect(choices).toEqual([{ kind: 'sell', guildId: guild.id, stackId: draughts, quantity: 2 }]);
    });
  });

  describe('what is reserved, and the bounds of a sale', () => {
    test('a loot-only Item a planned equip puts on a Hero is kept', () => {
      const { document, ids } = buildDocument();
      const guild = cleanGuild(document, ids.playerGuild);
      const [heroId] = guild.rosterIds;
      if (heroId === undefined) throw new Error('Need hero');
      const blade = createItem(document.world, 'barrow-kings-blade', { kind: 'guild', id: guild.id });
      const planned = [{ kind: 'equip' as const, guildId: guild.id, heroId, itemId: blade }];

      expect(surplusChoices(document.world, guild, keeping, deps, planned)).toEqual([]);
    });

    test("a planned equip of a stack's unit fills that Hero's slot, and the rest of the stack is surplus", () => {
      const { document, ids } = buildDocument({ rosterSize: 4 });
      const guild = cleanGuild(document, ids.playerGuild);
      const [h0, h1, h2, h3] = guild.rosterIds;
      if (!h0 || !h1 || !h2 || !h3) throw new Error('Need 4 heroes');
      for (const heroId of [h0, h1, h2]) addStack(document.world, 'short-sword', 1, { kind: 'hero', id: heroId, slot: 'weapon' });
      const swords = addStack(document.world, 'short-sword', 2, { kind: 'guild', id: guild.id });
      const planned = [{ kind: 'equip' as const, guildId: guild.id, heroId: h3, stackId: swords }];

      // The one Hero who lacks a weapon is given one by the plan: the other sword is wanted by no one.
      expect(surplusChoices(document.world, guild, keeping, deps, planned)).toEqual([
        { kind: 'sell', guildId: guild.id, stackId: swords, quantity: 1 },
      ]);
    });

    test('gear whose modifiers sum to 0 or less is sold, since no controller would put it on (DL-49)', () => {
      const content = {
        ...deps.content,
        items: {
          ...deps.content.items,
          'cracked-charm': {
            key: 'cracked-charm',
            name: 'Cracked charm',
            kind: 'gear' as const,
            unique: false,
            slot: 'trinket' as const,
            statModifiers: { courage: 1, wits: -1 },
            buyPrice: 40,
            tags: [],
          },
          'cracked-crown': {
            key: 'cracked-crown',
            name: 'Cracked crown',
            kind: 'gear' as const,
            unique: true,
            slot: 'trinket' as const,
            statModifiers: { courage: 2, wits: -2 },
            buyPrice: 80,
            tags: [],
          },
        },
      };
      const { document, ids } = buildDocument();
      const guild = cleanGuild(document, ids.playerGuild);
      // Heroes lack a trinket, yet neither the charm nor the crown is any use to them.
      const charms = addStack(document.world, 'cracked-charm', 1, { kind: 'guild', id: guild.id });
      const crown = createItem(document.world, 'cracked-crown', { kind: 'guild', id: guild.id });

      expect(surplusChoices(document.world, guild, keeping, { ...deps, content })).toEqual([
        { kind: 'sell', guildId: guild.id, itemId: crown },
        { kind: 'sell', guildId: guild.id, stackId: charms, quantity: 1 },
      ]);
    });

    test("another Guild's Parties are not counted toward this Guild's stock", () => {
      const { document, ids } = buildDocument();
      const guild = cleanGuild(document, ids.playerGuild);
      const draughts = addStack(document.world, 'healing-draught', 3, { kind: 'guild', id: guild.id });
      const theirs = makeId('parties', 99);
      const ours = Object.values(document.world.parties).find((p) => p.guildId === guild.id);
      if (!ours) throw new Error('No party');
      document.world.parties[theirs] = { ...ours, id: theirs, guildId: ids.rivalGuild, heroIds: [] };
      addStack(document.world, 'healing-draught', 2, { kind: 'party', id: theirs });

      // Stock 2, none carried by its own Parties: 1 of the 3 at home is surplus.
      expect(surplusChoices(document.world, guild, keeping, deps)).toEqual([
        { kind: 'sell', guildId: guild.id, stackId: draughts, quantity: 1 },
      ]);
    });

    test('Parties carrying more than the stock: what is at home is sold, never more than it holds', () => {
      const { document, ids } = buildDocument();
      const guild = cleanGuild(document, ids.playerGuild);
      const draughts = addStack(document.world, 'healing-draught', 2, { kind: 'guild', id: guild.id });
      const party = Object.values(document.world.parties).find((p) => p.guildId === guild.id);
      if (!party) throw new Error('No party');
      addStack(document.world, 'healing-draught', 3, { kind: 'party', id: party.id });

      expect(surplusChoices(document.world, guild, keeping, deps)).toEqual([
        { kind: 'sell', guildId: guild.id, stackId: draughts, quantity: 2 },
      ]);
    });

    test('a consumable a planned dispatch takes all of is not offered for sale', () => {
      const { document, ids } = buildDocument();
      const guild = cleanGuild(document, ids.playerGuild);
      const [h0] = guild.rosterIds;
      if (!h0) throw new Error('Need hero');
      addStack(document.world, 'whetstone', 2, { kind: 'guild', id: guild.id });
      const planned = [
        {
          kind: 'dispatch' as const,
          guildId: guild.id,
          questId: 'quest-000001' as QuestId,
          heroIds: [h0],
          consumables: [{ definitionKey: 'whetstone', quantity: 2 }],
        },
      ];

      // Whetstones are not kept (`heal` alone is), but none is left at home to sell.
      expect(surplusChoices(document.world, guild, keeping, deps, planned)).toEqual([]);
    });
  });

  describe('in debt: the whole holding is sold before the debt sale (DL-301)', () => {
    test("in debt, the turn's planned equips and dispatches are still reserved", () => {
      const { document, ids } = buildDocument();
      const guild = cleanGuild(document, ids.playerGuild);
      guild.belowFloorSince = 10;
      const [h0] = guild.rosterIds;
      if (!h0) throw new Error('Need hero');
      const blade = createItem(document.world, 'barrow-kings-blade', { kind: 'guild', id: guild.id });
      const draughts = addStack(document.world, 'healing-draught', 3, { kind: 'guild', id: guild.id });
      const planned = [
        { kind: 'equip' as const, guildId: guild.id, heroId: h0, itemId: blade },
        {
          kind: 'dispatch' as const,
          guildId: guild.id,
          questId: 'quest-000001' as QuestId,
          heroIds: [h0],
          consumables: [{ definitionKey: 'healing-draught', quantity: 1 }],
        },
      ];

      expect(surplusChoices(document.world, guild, keeping, deps, planned)).toEqual([
        { kind: 'sell', guildId: guild.id, stackId: draughts, quantity: 2 },
      ]);
    });

    test('sells all items and stacks in holding when in debt', () => {
      const { document, ids } = buildDocument();
      const guild = cleanGuild(document, ids.playerGuild);
      guild.belowFloorSince = 10; // in debt!

      const blade = createItem(document.world, 'barrow-kings-blade', { kind: 'guild', id: guild.id });
      const draughts = addStack(document.world, 'healing-draught', 2, { kind: 'guild', id: guild.id });
      const swords = addStack(document.world, 'short-sword', 1, { kind: 'guild', id: guild.id });

      const choices = surplusChoices(document.world, guild, keeping, deps);
      expect(choices).toEqual([
        { kind: 'sell', guildId: guild.id, itemId: blade },
        { kind: 'sell', guildId: guild.id, stackId: draughts, quantity: 2 },
        { kind: 'sell', guildId: guild.id, stackId: swords, quantity: 1 },
      ]);
    });
  });
});
