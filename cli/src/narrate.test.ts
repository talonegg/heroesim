import {
  milestoneTypes,
  type EngineEventOf,
  type EngineEventType,
  type EntityId,
  type GuildId,
  type HeroId,
  type ItemId,
  type OfferId,
  type PartyId,
  type QuestId,
  type StackId,
  type StopReason,
  type WorldDocument,
} from '@heroesim/engine';
import { loadContent } from '@heroesim/content/node';
import { describe, expect, test } from 'vitest';
import { narrate, narrateStop } from './narrate.js';

const content = loadContent();

const guildId = 'guild-000002' as GuildId;
const heroId = 'hero-000007' as HeroId;
const questId = 'quest-000003' as QuestId;
const partyId = 'party-000004' as PartyId;
const patronId = 'patron-000005';
const guildmasterId = 'guildmaster-000002';
const otherHeroId = 'hero-000009' as HeroId;
const stackId = 'stack-000004' as StackId;
const itemId = 'item-000002' as ItemId;
const rivalId = 'guild-000003' as GuildId;
const offerId = 'offer-000001' as OfferId;
/** A Transfer Offer's terms (M6-S2): the Rival asks The Kestrel Guild for Brenna. */
const terms = { offerId, fromGuildId: guildId, toGuildId: rivalId, heroId, fee: 420 };

const labels: Record<string, string> = {
  [guildId]: 'The Kestrel Guild',
  [heroId]: 'Brenna Ashcombe',
  [patronId]: 'Lady Maud',
  [guildmasterId]: 'Osric Vane',
  [rivalId]: 'The Iron Wardens',
  [otherHeroId]: 'Aldred Barrowby',
};

/** An event of `type` as the engine would make it, labelled from `labels`. */
function event<Type extends EngineEventType>(type: Type, participants: string[], payload: EngineEventOf<Type>['payload']): EngineEventOf<Type> {
  const named = Object.fromEntries(participants.flatMap((id) => (labels[id] === undefined ? [] : [[id, labels[id]]])));
  return {
    type,
    turn: 9,
    participants: participants as EntityId[],
    labels: named,
    milestone: milestoneTypes[type],
    payload,
  } as EngineEventOf<Type>;
}

const outcome = { successes: 1, encounterCount: 3, xpPerHero: 30, moraleDelta: 0, regardDelta: 0, injuries: [], deaths: [] };

/** One of every event type: the compiler refuses a type left out, or one the engine lacks. */
const samples: { [Type in EngineEventType]: EngineEventOf<Type> } = {
  'world.created': event('world.created', [], { seed: 'demo' }),
  'guild.founded': event('guild.founded', [guildId, guildmasterId], { guildId, guildmasterId: guildmasterId as never }),
  'guildmaster.generated': event('guildmaster.generated', [guildmasterId, guildId], { guildmasterId: guildmasterId as never, guildId }),
  'hero.generated': event('hero.generated', [heroId], { heroId, guildId: null, classKey: 'rogue' }),
  'patron.generated': event('patron.generated', [patronId], { patronId: patronId as never, sphereKey: 'crown' }),
  'world.rules-adopted': event('world.rules-adopted', [], { oldConfigVersion: 1, newConfigVersion: 2 }),
  'guild.upkeep-paid': event('guild.upkeep-paid', [guildId], { guildId, amount: 40, wealthAfter: 460 }),
  'hero.recruited': event('hero.recruited', [heroId, guildId], { heroId, guildId, fee: 110 }),
  'hero.left-pool': event('hero.left-pool', [heroId], { heroId }),
  'quest.offered': event('quest.offered', [questId, patronId], { questId, patronId: patronId as never, templateKey: 'clear-the-barrow' }),
  'quest.expired': event('quest.expired', [questId, patronId], { questId, patronId: patronId as never, templateKey: 'clear-the-barrow' }),
  'quest.taken': event('quest.taken', [questId, partyId, heroId, guildId], {
    questId,
    partyId,
    guildId,
    heroIds: [heroId],
    returnsOnTurn: 23,
    consumables: [{ definitionKey: 'whetstone', quantity: 2 }],
  }),
  'quest.encounter': event('quest.encounter', [questId, partyId, guildId, heroId], {
    questId,
    partyId,
    guildId,
    index: 1,
    encounterKey: 'ambush-on-the-road',
    kind: 'combat',
    roll: 14.5,
    target: 18,
    margin: -3.5,
    outcome: 'failure',
    injured: [heroId],
    died: [],
  }),
  'quest.resolved': event('quest.resolved', [questId, partyId, heroId, guildId], {
    ...outcome,
    band: 'fail',
    wealthDelta: 0,
    fameDelta: -2,
    questId,
    partyId,
    guildId,
    heroIds: [heroId],
    templateKey: 'guard-the-caravan',
  }),
  'quest.loot': event('quest.loot', [questId, partyId, guildId, 'item-000006'], {
    questId,
    partyId,
    guildId,
    lootTableKey: 'lesser-loot',
    definitionKey: 'barrow-kings-blade',
    quantity: 1,
    itemId: 'item-000006' as ItemId,
    stackId: null,
  }),
  'hero.injured': event('hero.injured', [heroId, questId], { heroId, questId, typeKey: 'deep-cut', healsOnTurn: 41 }),
  'hero.died': event('hero.died', [heroId, questId], { heroId, questId }),
  'hero.xp-gained': event('hero.xp-gained', [heroId], { heroId, questId, amount: 30 }),
  'hero.morale-changed': event('hero.morale-changed', [heroId], {
    heroId,
    cause: 'roster-death',
    before: 45,
    after: 35,
    bandBefore: 'steady',
    bandAfter: 'low',
  }),
  'hero.healed': event('hero.healed', [heroId], { heroId, typeKey: 'deep-cut', traitKey: 'scarred' }),
  'hero.retired': event('hero.retired', [heroId, guildId], { heroId, guildId, age: 51 }),
  'hero.declined': event('hero.declined', [heroId, guildId], { heroId, statKey: 'endurance', delta: -1, age: 41 }),
  'game.ended': event('game.ended', [guildId, guildmasterId], { guildId, reason: 'bankruptcy' }),
  'guild.folded': event('guild.folded', [guildId, guildmasterId], { guildId, reason: 'roster-wiped' }),
  'hero.left-guild': event('hero.left-guild', [heroId, guildId], { heroId, guildId }),
  'guild.improved': event('guild.improved', [guildId], {
    guildId,
    facility: 'trainingYard',
    grade: 2,
    improvementKey: 'training-yard-2',
    cost: 500,
  }),
  'hero.levelled': event('hero.levelled', [heroId, guildId], {
    heroId,
    guildId,
    level: 3,
    statDeltas: { strength: 1, courage: 2 },
    pointsLost: 0,
  }),
  'patron.regard-changed': event('patron.regard-changed', [patronId, guildId], {
    patronId: patronId as never,
    guildId,
    cause: 'quest-failure',
    before: -3,
    after: -5,
    bandBefore: 'neutral',
    bandAfter: 'cool',
  }),
  'guildmaster.regard-changed': event('guildmaster.regard-changed', [guildmasterId, heroId, guildId], {
    guildmasterId: guildmasterId as never,
    guildId,
    entityId: heroId,
    cause: 'quest-success',
    before: 3.5,
    after: 4.5,
    bandBefore: 'neutral',
    bandAfter: 'warm',
  }),
  'hero.regard-changed': event('hero.regard-changed', [heroId, otherHeroId, guildId], {
    heroId,
    entityId: otherHeroId,
    cause: 'shared-quest',
    before: 11,
    after: 12.5,
    bandBefore: 'warm',
    bandAfter: 'close',
  }),
  'item.expended': event('item.expended', [questId, partyId, guildId, heroId], {
    questId,
    partyId,
    guildId,
    stackId: 'stack-000006' as never,
    definitionKey: 'healing-draught',
    effect: 'heal',
    heroId,
    days: 5,
  }),
  'item.equipped': event('item.equipped', [heroId, guildId, stackId], {
    heroId,
    guildId,
    slot: 'weapon',
    definitionKey: 'arming-sword',
    itemId: null,
    stackId,
  }),
  'item.unequipped': event('item.unequipped', [heroId, guildId, itemId], {
    heroId,
    guildId,
    slot: 'trinket',
    definitionKey: 'lantern-of-stannary',
    itemId,
    stackId: null,
  }),
  'item.returned': event('item.returned', [heroId, guildId, stackId], {
    heroId,
    guildId,
    slot: 'armour',
    definitionKey: 'mail-shirt',
    itemId: null,
    stackId,
    cause: 'died',
  }),
  'item.bought': event('item.bought', [guildId], {
    guildId,
    definitionKey: 'whetstone',
    quantity: 3,
    unitPrice: 25,
    cost: 75,
    itemIds: [],
  }),
  'item.sold': event('item.sold', [guildId, 'item-000002'], {
    guildId,
    definitionKey: 'barrow-kings-blade',
    quantity: 1,
    unitPrice: 300,
    proceeds: 300,
    itemIds: ['item-000002' as never],
    cause: 'fold',
  }),
  'hero.transferred': event('hero.transferred', [heroId, guildId, rivalId, offerId], {
    heroId,
    fromGuildId: guildId,
    toGuildId: rivalId,
    fee: 420,
    offerId,
  }),
  'guild.transfer-offered': event('guild.transfer-offered', [offerId, heroId, guildId, rivalId], {
    ...terms,
    expiresOnTurn: 23,
  }),
  'guild.transfer-offer-declined': event('guild.transfer-offer-declined', [offerId, heroId, guildId, rivalId], terms),
  'guild.transfer-offer-expired': event('guild.transfer-offer-expired', [offerId, heroId, guildId, rivalId], {
    ...terms,
    cause: 'expired',
  }),
};

describe('narrate', () => {
  test.each(Object.keys(milestoneTypes) as EngineEventType[])('gives %s one short line in the CLI\'s words', (type) => {
    const line = narrate(samples[type], content);

    expect(line).toMatch(/^\S.*\.$/);
    expect(line).not.toContain('\n');
    expect(line).not.toMatch(/undefined|null|\[object/);
    expect(line.length).toBeLessThan(160);
    // Someone is called by name when the event names anyone.
    const named = samples[type].participants.flatMap((id) => labels[id] ?? []);
    if (named.length > 0) expect(named.some((label) => line.includes(label)), line).toBe(true);
  });

  test('names content keys by content, and Heroes by name and id', () => {
    expect(narrate(samples['quest.offered'], content)).toBe(
      `Lady Maud offered ${content.questTemplates['clear-the-barrow']?.name} (quest-000003).`,
    );
    expect(narrate(samples['hero.healed'], content)).toBe('Brenna Ashcombe (hero-000007) recovered from Deep cut, left Scarred.');
    expect(narrate(samples['hero.declined'], content)).toBe('Brenna Ashcombe (hero-000007), at 41, lost 1 Endurance to age.');
    expect(narrate(samples['quest.resolved'], content)).toMatch(/and failed: Wealth 0, Fame -2\.$/);
    // M4-S3: the Synergies that applied, by name, when any did; none, or an entry from before M4-S3, says nothing.
    const withSynergies = { ...samples['quest.resolved'], payload: { ...samples['quest.resolved'].payload, synergyKeys: ['shield-wall', 'sword-and-salve'] } };
    expect(narrate(withSynergies, content)).toMatch(/and failed: Wealth 0, Fame -2\. Synergies: Shield wall, Sword and salve\.$/);
    expect(narrate({ ...withSynergies, payload: { ...withSynergies.payload, synergyKeys: [] } }, content)).toMatch(/Fame -2\.$/);
    expect(narrate(samples['quest.encounter'], content)).toBe(
      `party-000004 failed at ${content.encounters['ambush-on-the-road']?.name}: Brenna Ashcombe (hero-000007) was injured.`,
    );
    expect(narrate({ ...samples['quest.encounter'], payload: { ...samples['quest.encounter'].payload, outcome: 'success', injured: [] } }, content)).toBe(
      `party-000004 came through ${content.encounters['ambush-on-the-road']?.name}.`,
    );
    expect(narrate(samples['guild.improved'], content)).toBe(
      `The Kestrel Guild built ${content.improvements['training-yard-2']?.name} for 500 Wealth: its training yard is now grade 2.`,
    );
    expect(narrate(samples['hero.levelled'], content)).toBe(
      'Brenna Ashcombe (hero-000007) reached Level 3: Courage +2, Strength +1.',
    );
    // M5-S5: a unique Item by name and id; a common one by name, quantity and the stack it joined.
    expect(narrate(samples['quest.loot'], content)).toBe(
      `The Kestrel Guild found Loot on quest-000003: ${content.items['barrow-kings-blade']?.name} (item-000006).`,
    );
    const common = { ...samples['quest.loot'].payload, definitionKey: 'healing-draught', quantity: 3, itemId: null, stackId: 'stack-000008' as StackId };
    expect(narrate({ ...samples['quest.loot'], payload: common }, content)).toBe(
      `The Kestrel Guild found Loot on quest-000003: ${content.items['healing-draught']?.name} x3 (stack-000008).`,
    );
  });

  test('says a Regard band crossed, never the number, and what moved a Patron (M4-S5)', () => {
    const patron = narrate(samples['patron.regard-changed'], content);
    const guildmaster = narrate(samples['guildmaster.regard-changed'], content);

    expect(patron).toBe("Lady Maud's Regard for The Kestrel Guild fell from neutral to cool after a Quest of theirs failed.");
    expect(guildmaster).toBe("Osric Vane's Regard for Brenna Ashcombe rose from neutral to warm.");
    for (const line of [patron, guildmaster]) expect(line).not.toMatch(/\d/);
  });

  test("says a Hero's Regard for another Hero crossed a band, never the number, and what moved it (M4-S4)", () => {
    const shared = narrate(samples['hero.regard-changed'], content);
    const decayed = narrate(
      event('hero.regard-changed', [heroId, otherHeroId, guildId], {
        heroId,
        entityId: otherHeroId,
        cause: 'decay',
        before: 4,
        after: 3.99,
        bandBefore: 'warm',
        bandAfter: 'neutral',
      }),
      content,
    );

    expect(shared).toBe(
      "Brenna Ashcombe (hero-000007)'s Regard for Aldred Barrowby (hero-000009) rose from warm to close after a Quest together.",
    );
    expect(decayed).toBe(
      "Brenna Ashcombe (hero-000007)'s Regard for Aldred Barrowby (hero-000009) fell from warm to neutral as time passed apart.",
    );
    // The ids are the commands'; no Regard value is printed.
    for (const line of [shared, decayed]) expect(line.replaceAll(/hero-\d{6}/g, '')).not.toMatch(/\d/);
  });

  test('says what a Party carried, and each consumable it used, by name, counting Encounters from 1 (M5-S3)', () => {
    const ids = { questId, partyId, guildId, stackId: 'stack-000006' as never };
    const used = (payload: EngineEventOf<'item.expended'>['payload']) => narrate(event('item.expended', [questId, partyId, guildId], payload), content);

    expect(narrate(samples['quest.taken'], content)).toBe(
      'The Kestrel Guild sent party-000004 on quest-000003, back on the night of Day 7, carrying Whetstone ×2.',
    );
    const bare = { ...samples['quest.taken'], payload: { ...samples['quest.taken'].payload, consumables: [] } };
    expect(narrate(bare, content)).toBe('The Kestrel Guild sent party-000004 on quest-000003, back on the night of Day 7.');
    expect(used({ ...ids, definitionKey: 'whetstone', effect: 'bonus', encounterIndex: 1, flat: 3 })).toBe(
      "The Kestrel Guild's party-000004 used one Whetstone on Encounter 2: +3 to its Check.",
    );
    expect(used({ ...ids, definitionKey: 'grappling-line', effect: 'reroll', encounterIndex: 0, firstRoll: 12.5 })).toBe(
      "The Kestrel Guild's party-000004 used one Grappling line to try Encounter 1 again.",
    );
    expect(narrate(samples['item.expended'], content)).toBe(
      "The Kestrel Guild's party-000004 used one Healing draught on Brenna Ashcombe (hero-000007): their Injury heals 5 Days sooner.",
    );
  });

  test('names gear by content and by the id equip and unequip take, and says why it went back (M5-S2)', () => {
    expect(narrate(samples['item.equipped'], content)).toBe(
      "The Kestrel Guild put Arming sword (stack-000004) in Brenna Ashcombe (hero-000007)'s weapon slot.",
    );
    expect(narrate(samples['item.unequipped'], content)).toBe(
      `The Kestrel Guild took ${content.items['lantern-of-stannary']?.name} (item-000002) from Brenna Ashcombe (hero-000007)'s trinket slot.`,
    );
    expect(narrate(samples['item.returned'], content)).toBe(
      'Mail shirt (stack-000004) went back to The Kestrel Guild from Brenna Ashcombe (hero-000007), who died.',
    );
    const folded = { ...samples['item.returned'], payload: { ...samples['item.returned'].payload, cause: 'guild-folded' as const } };
    expect(narrate(folded, content)).toMatch(/from Brenna Ashcombe \(hero-000007\) as the Guild folded\.$/);
  });

  test('says a Level gained without naming the points Potential took', () => {
    const allLost = event('hero.levelled', [heroId, guildId], { heroId, guildId, level: 20, statDeltas: {}, pointsLost: 3 });

    expect(narrate(allLost, content)).toBe('Brenna Ashcombe (hero-000007) reached Level 20.');
  });
});

describe('Transfers (M6-S2)', () => {
  test('names who moved, between which Guilds, for how much, and what became of each offer', () => {
    expect(narrate(samples['hero.transferred'], content)).toBe(
      'The Iron Wardens took Brenna Ashcombe (hero-000007) from The Kestrel Guild for 420 Wealth, accepting offer-000001.',
    );
    const direct = { ...samples['hero.transferred'], payload: { ...samples['hero.transferred'].payload, offerId: null } };
    expect(narrate(direct, content)).toBe('The Iron Wardens took Brenna Ashcombe (hero-000007) from The Kestrel Guild for 420 Wealth.');
    expect(narrate(samples['guild.transfer-offered'], content)).toBe(
      'The Iron Wardens offered The Kestrel Guild 420 Wealth for Brenna Ashcombe (hero-000007) (offer-000001), until the night of Day 7.',
    );
    expect(narrate(samples['guild.transfer-offer-declined'], content)).toBe(
      "The Kestrel Guild declined The Iron Wardens's offer for Brenna Ashcombe (hero-000007) (offer-000001).",
    );
    const expired = (cause: 'expired' | 'hero-left' | 'guild-folded') =>
      narrate({ ...samples['guild.transfer-offer-expired'], payload: { ...samples['guild.transfer-offer-expired'].payload, cause } }, content);
    expect(expired('expired')).toBe("The Iron Wardens's offer for Brenna Ashcombe (hero-000007) (offer-000001) expired unanswered.");
    expect(expired('hero-left')).toMatch(/lapsed: the Hero left that Roster\.$/);
    expect(expired('guild-folded')).toMatch(/lapsed as a Guild folded\.$/);
    const transferred = { ...samples['item.returned'], payload: { ...samples['item.returned'].payload, cause: 'transferred' as const } };
    expect(narrate(transferred, content)).toMatch(/from Brenna Ashcombe \(hero-000007\), who was transferred\.$/);
  });
});

describe('the Market (M5-S4)', () => {
  test('names what was bought and sold, how many, and the Wealth that changed hands', () => {
    const sold = narrate(
      event('item.sold', [guildId], {
        guildId,
        definitionKey: 'healing-draught',
        quantity: 1,
        unitPrice: 15,
        proceeds: 15,
        itemIds: [],
        cause: 'sale',
      }),
      content,
    );

    expect(narrate(samples['item.bought'], content)).toBe('The Kestrel Guild bought 3 × Whetstone at the Market for 75 Wealth.');
    expect(sold).toBe('The Kestrel Guild sold Healing draught at the Market for 15 Wealth.');
    expect(narrate(samples['item.sold'], content)).toBe(
      `The Kestrel Guild's ${content.items['barrow-kings-blade']?.name} (item-000002) went to the Market for 300 Wealth as the Guild folded.`,
    );
  });
});

describe('narrateStop', () => {
  const document = {
    world: {
      guilds: { [guildId]: { name: 'The Kestrel Guild' }, [rivalId]: { name: 'The Iron Wardens' } },
      heroes: { [heroId]: { name: 'Brenna Ashcombe' } },
      offers: { [offerId]: { id: offerId, kind: 'transfer', ...terms, offeredOnTurn: 16, expiresOnTurn: 23 } },
    },
  } as unknown as WorldDocument;

  test.each<[StopReason, string]>([
    [{ kind: 'ended' }, 'Stopped: the game is over.'],
    [{ kind: 'party-returned', guildId, partyIds: [partyId] }, "Stopped: The Kestrel Guild's Party came home: party-000004."],
    [
      { kind: 'party-returned', guildId, partyIds: [partyId, 'party-000009' as PartyId] },
      "Stopped: The Kestrel Guild's Parties came home: party-000004 and party-000009.",
    ],
    [
      { kind: 'decision-needed', guildId, questIds: [questId, 'quest-000008' as QuestId, 'quest-000009' as QuestId] },
      "Stopped: a decision is needed: The Kestrel Guild has no Party out, and could send one on quest-000003, quest-000008 and quest-000009 (show board).",
    ],
    [
      { kind: 'transfer-offer', guildId, offerIds: [offerId] },
      'Stopped: a Transfer Offer: The Iron Wardens offers 420 Wealth for Brenna Ashcombe (hero-000007) until the night of Day 7 ' +
        '(offer-000001). Answer with accept --offer <id> or decline --offer <id> (show offers).',
    ],
    [{ kind: 'max-turns' }, 'Stopped: played the most Turns allowed, 1080.'],
    [{ kind: 'pool-refreshed', heroIds: [heroId] }, 'Stopped: new in the Unattached pool: Brenna Ashcombe (hero-000007) (show pool).'],
  ])('puts %j in words', (stop, line) => {
    expect(narrateStop(stop, document, 1080)).toBe(line);
  });
});
