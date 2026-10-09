import {
  configVersion,
  createWorld,
  defaultConfig,
  milestoneTypes,
  playerGuild,
  type Guild,
  type Hero,
  type CheckRoll,
  type Encounter,
  type EncounterCheck,
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
  type ModuleEvent,
} from '@heroesim/engine';
import { loadContent } from '@heroesim/content/node';
import { describe, expect, test } from 'vitest';
import type { Calendar, Refusal, Slot } from '@heroesim/words';
import { cliNamer, narrateLine, refusalLine } from './namer.js';

const content = loadContent();

/** The game's calendar, a Year of 360 Days, for the narration's dates (DL-210). */
const calendar: Calendar = { turnsPerYear: 1080 };

// DL-186 item 1: the CLI's Namer fills the slots of the narration's sentences
// (`@heroesim/words`): a Hero by label and id, an Item, an Offer, a Quest and a Party by the ids the
// commands take. Every line below is the CLI's as it was before the narration moved, word for word,
// but the capitals settled to the page's ("'s Offer for", "The probe Module").

const guildId = 'guild-000002' as GuildId;
const heroId = 'hero-000007' as HeroId;
const questId = 'quest-000003' as QuestId;
const partyId = 'party-000004' as PartyId;
const patronId = 'patron-000005';
const guildmasterId = 'guildmaster-000002';
/** A Rival Guildmaster's successor. */
const successorId = 'guildmaster-000007';
const otherHeroId = 'hero-000009' as HeroId;
const stackId = 'stack-000004' as StackId;
const itemId = 'item-000002' as ItemId;
const rivalId = 'guild-000003' as GuildId;
const offerId = 'offer-000001' as OfferId;
/** A Transfer Offer's terms: the Rival asks The Kestrel Guild for Brenna. */
const terms = { offerId, fromGuildId: guildId, toGuildId: rivalId, heroId, fee: 420 };

const labels: Record<string, string> = {
  [guildId]: 'The Kestrel Guild',
  [heroId]: 'Brenna Ashcombe',
  [patronId]: 'Lady Maud',
  [guildmasterId]: 'Osric Vane',
  [successorId]: 'Wenna Tolley',
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
  'guild.below-floor': event('guild.below-floor', [guildId], { guildId, wealth: -35, floor: 0, dueDay: 34 }),
  'guild.floor-recovered': event('guild.floor-recovered', [guildId], { guildId, wealth: 12, floor: 0, belowFloorSince: 5 }),
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
  'hero.trait-gained': event('hero.trait-gained', [heroId, questId], {
    heroId,
    traitKey: 'scarred',
    questId,
    encounterIndex: 1,
    encounterKey: 'ambush-on-the-road',
  }),
  'hero.trait-lost': event('hero.trait-lost', [heroId], { heroId, traitKey: 'lame', replacedBy: 'scarred' }),
  'hero.retired': event('hero.retired', [heroId, guildId], { heroId, guildId, age: 51 }),
  'hero.declined': event('hero.declined', [heroId, guildId], { heroId, statKey: 'endurance', delta: -1, age: 41 }),
  'game.ended': event('game.ended', [guildId, guildmasterId], { guildId, reason: 'bankruptcy' }),
  'guild.folded': event('guild.folded', [guildId, guildmasterId], { guildId, reason: 'roster-wiped' }),
  'guildmaster.succeeded': event('guildmaster.succeeded', [guildId, guildmasterId, successorId], {
    guildId,
    guildmasterId: guildmasterId as never,
    successorId: successorId as never,
    age: 65,
  }),
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
  'guild.wealth-changed': event('guild.wealth-changed', [guildId], { guildId, moduleId: 'probe', before: 500, after: 750 }),
};

describe('narrateLine', () => {
  test.each(Object.keys(milestoneTypes) as EngineEventType[])('gives %s one short line in the CLI\'s words', (type) => {
    const line = narrateLine(samples[type], content, calendar);

    expect(line).toMatch(/^\S.*\.$/);
    expect(line).not.toContain('\n');
    expect(line).not.toMatch(/undefined|null|\[object/);
    // Short enough for a line, with a date's Year in it (DL-210).
    expect(line.length).toBeLessThan(170);
    // Someone is called by name when the event names anyone.
    const named = samples[type].participants.flatMap((id) => labels[id] ?? []);
    if (named.length > 0) expect(named.some((label) => line.includes(label)), line).toBe(true);
  });

  test('names the Guild, the retired Guildmaster and the successor of a Succession', () => {
    expect(narrateLine(samples['guildmaster.succeeded'], content, calendar)).toBe(
      'Osric Vane retired at 65 as Guildmaster of The Kestrel Guild, and Wenna Tolley succeeded them.',
    );
  });

  test('names content keys by content, and Heroes by name and id', () => {
    expect(narrateLine(samples['quest.offered'], content, calendar)).toBe(
      `Lady Maud offered ${content.questTemplates['clear-the-barrow']?.name} (quest-000003).`,
    );
    expect(narrateLine(samples['hero.healed'], content, calendar)).toBe('Brenna Ashcombe (hero-000007) recovered from Deep cut, left Scarred.');
    // An earned Trait, and one an Injury's Trait replaced.
    expect(narrateLine(samples['hero.trait-gained'], content, calendar)).toBe('Brenna Ashcombe (hero-000007) earned the Trait Scarred on quest-000003, at Ambush on the road.');
    expect(narrateLine(samples['hero.trait-lost'], content, calendar)).toBe('Brenna Ashcombe (hero-000007) lost the Trait Lame, replaced by Scarred.');
    expect(narrateLine(samples['hero.declined'], content, calendar)).toBe('Brenna Ashcombe (hero-000007), at 41, lost 1 Endurance to age.');
    expect(narrateLine(samples['quest.resolved'], content, calendar)).toMatch(/and failed: Wealth 0, Fame -2\.$/);
    // The Synergies that applied, by name, when any did; none, or an entry written without them, says nothing.
    const withSynergies = { ...samples['quest.resolved'], payload: { ...samples['quest.resolved'].payload, synergyKeys: ['shield-wall', 'sword-and-salve'] } };
    expect(narrateLine(withSynergies, content, calendar)).toMatch(/and failed: Wealth 0, Fame -2\. Synergies: Shield wall, Sword and salve\.$/);
    expect(narrateLine({ ...withSynergies, payload: { ...withSynergies.payload, synergyKeys: [] } }, content, calendar)).toMatch(/Fame -2\.$/);
    // The sample is an entry written before an Encounter's Degree: it reads as its outcome, a Failure or a Success.
    expect(narrateLine(samples['quest.encounter'], content, calendar)).toBe(
      `party-000004 failed at ${content.encounters['ambush-on-the-road']?.name} (Encounter 2), a Failure: Brenna Ashcombe (hero-000007) was injured.`,
    );
    expect(narrateLine({ ...samples['quest.encounter'], payload: { ...samples['quest.encounter'].payload, outcome: 'success', injured: [] } }, content, calendar)).toBe(
      `party-000004 came through ${content.encounters['ambush-on-the-road']?.name} (Encounter 2), a Success.`,
    );
    expect(narrateLine(samples['guild.improved'], content, calendar)).toBe(
      `The Kestrel Guild built ${content.improvements['training-yard-2']?.name} for 500 Wealth: its training yard is now grade 2.`,
    );
    const quarters = event('guild.improved', [guildId], { guildId, facility: 'quarters', grade: 1, improvementKey: 'quarters-1', cost: 200 });
    expect(narrateLine(quarters, content, calendar)).toBe(
      `The Kestrel Guild built ${content.improvements['quarters-1']?.name} for 200 Wealth: its quarters are now grade 1.`,
    );
    expect(narrateLine(samples['hero.levelled'], content, calendar)).toBe(
      'Brenna Ashcombe (hero-000007) reached Level 3: Courage +2, Strength +1.',
    );
    // A unique Item by name and id; a common one by name, quantity and the stack it joined.
    expect(narrateLine(samples['quest.loot'], content, calendar)).toBe(
      `The Kestrel Guild found Loot on quest-000003: ${content.items['barrow-kings-blade']?.name} (item-000006).`,
    );
    const common = { ...samples['quest.loot'].payload, definitionKey: 'healing-draught', quantity: 3, itemId: null, stackId: 'stack-000008' as StackId };
    expect(narrateLine({ ...samples['quest.loot'], payload: common }, content, calendar)).toBe(
      `The Kestrel Guild found Loot on quest-000003: 3 × ${content.items['healing-draught']?.name} (stack-000008).`,
    );
    // One common Item is named without a count, as a purchase is.
    expect(narrateLine({ ...samples['quest.loot'], payload: { ...common, quantity: 1 } }, content, calendar)).toBe(
      `The Kestrel Guild found Loot on quest-000003: ${content.items['healing-draught']?.name} (stack-000008).`,
    );
  });

  test("gives an Encounter's Degree and, of several Checks, the name of the one that decided it", () => {
    const ambush = content.encounters['ambush-on-the-road'] as Encounter;
    const [front] = ambush.checks as [EncounterCheck];
    const several = {
      ...content,
      encounters: { ...content.encounters, [ambush.key]: { ...ambush, checks: [front, { ...front, key: 'nerve', name: 'Nerve' }], pass: ['and', front.key, 'nerve'] } },
    } satisfies typeof content;
    const roll = { capability: 15, roll: 14.5, target: 18, margin: -3.5 };
    const payload = {
      ...samples['quest.encounter'].payload,
      degree: 'setback' as const,
      decidedBy: 'nerve',
      checks: [
        { key: front.key, ...roll, roll: 30, margin: 12, degree: 'triumph' as const },
        { key: 'nerve', ...roll, degree: 'setback' as const },
      ],
    };

    expect(narrateLine({ ...samples['quest.encounter'], payload }, several, calendar)).toBe(
      `party-000004 failed at ${ambush.name} (Encounter 2), a Setback, decided by Nerve: Brenna Ashcombe (hero-000007) was injured.`,
    );
    // One Check named as its Encounter names none: it is the Encounter's own (the old form's).
    const one = { ...payload, decidedBy: front.key, degree: 'triumph' as const, outcome: 'success' as const, injured: [], checks: payload.checks.slice(0, 1) };
    const own = { ...content, encounters: { ...content.encounters, [ambush.key]: { ...ambush, checks: [{ ...front, name: ambush.name }] } } } satisfies typeof content;
    expect(narrateLine({ ...samples['quest.encounter'], payload: one }, own, calendar)).toBe(`party-000004 came through ${ambush.name} (Encounter 2), a Triumph.`);
    // One Check named otherwise is named (DL-152).
    const renamed = { ...content, encounters: { ...content.encounters, [ambush.key]: { ...ambush, checks: [{ ...front, name: 'Steel' }] } } } satisfies typeof content;
    expect(narrateLine({ ...samples['quest.encounter'], payload: one }, renamed, calendar)).toBe(`party-000004 came through ${ambush.name} (Encounter 2), a Triumph, decided by Steel.`);
  });

  test("says once, for the Party, when form decided whether the Encounter succeeded, exactly when its formDecided is set, naming no Hero", () => {
    const roll = { capability: 15, roll: 14.5, target: 18, margin: -3.5 };
    const front: CheckRoll = { key: 'front', ...roll, degree: 'setback' };
    const base = { ...samples['quest.encounter'].payload, degree: 'setback' as const, decidedBy: 'front', checks: [front] };
    const line = (payload: EngineEventOf<'quest.encounter'>['payload']) => narrateLine({ ...samples['quest.encounter'], payload }, content, calendar);
    const plain = line(base);

    expect(plain).not.toMatch(/spirits/);
    // Lowered from a Success to a Setback: the Encounter failed by form.
    expect(line({ ...base, formDecided: 'lowered', checks: [{ ...front, formDecided: 'lowered' }] })).toBe(`${plain} Low spirits told against them.`);
    // Raised from a Setback to a Success: the Encounter succeeded by form.
    const won = { ...base, outcome: 'success' as const, degree: 'success' as const, injured: [], checks: [{ ...front, degree: 'success' as const }] };
    expect(line({ ...won, formDecided: 'raised', checks: [{ ...front, degree: 'success', formDecided: 'raised' }] })).toBe(`${line(won)} Their high spirits carried them through.`);
    // A Check form moved across the Success line, in an Encounter it did not decide: no sentence.
    const other: CheckRoll = { key: 'other', ...roll, degree: 'success', formDecided: 'raised' };
    expect(line({ ...base, checks: [other, front] })).toBe(plain);
    // An entry written before the Degree and form were recorded has no such sentence.
    const older = { ...base };
    Reflect.deleteProperty(older, 'checks');
    expect(line(older)).not.toMatch(/spirits/);
    for (const sentence of ['Low spirits told against them.', 'Their high spirits carried them through.']) {
      expect(sentence).not.toMatch(/Brenna|hero-/);
    }
  });

  test('says a Regard band crossed, never the number, and what moved a Patron', () => {
    const patron = narrateLine(samples['patron.regard-changed'], content, calendar);
    const guildmaster = narrateLine(samples['guildmaster.regard-changed'], content, calendar);

    expect(patron).toBe("Lady Maud's Regard for The Kestrel Guild fell from neutral to cool after a Quest of theirs failed.");
    // A Hero a Guildmaster's Regard is for is named as a Hero, with the id a command takes (DL-209).
    expect(guildmaster).toBe("Osric Vane's Regard for Brenna Ashcombe (hero-000007) rose from neutral to warm.");
    expect(patron).not.toMatch(/\d/);
    // An Offer, a glossary term, in the page's capitals (DL-186 item 1).
    const untaken = { ...samples['patron.regard-changed'], payload: { ...samples['patron.regard-changed'].payload, cause: 'offer-expired' as const } };
    expect(narrateLine(untaken, content, calendar)).toMatch(/ when an Offer of theirs went untaken\.$/);
  });

  test("says a Hero's Regard for another Hero crossed a band, never the number, and what moved it", () => {
    const shared = narrateLine(samples['hero.regard-changed'], content, calendar);
    const decayed = narrateLine(
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
      calendar,
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

  test('says what a Party carried, and each consumable it used, by name, counting Encounters from 1', () => {
    const ids = { questId, partyId, guildId, stackId: 'stack-000006' as never };
    const used = (payload: EngineEventOf<'item.expended'>['payload']) => narrateLine(event('item.expended', [questId, partyId, guildId], payload), content, calendar);

    expect(narrateLine(samples['quest.taken'], content, calendar)).toBe(
      'The Kestrel Guild sent party-000004 on quest-000003, back on the night of Year 1 Day 8, carrying Whetstone ×2.',
    );
    const bare = { ...samples['quest.taken'], payload: { ...samples['quest.taken'].payload, consumables: [] } };
    expect(narrateLine(bare, content, calendar)).toBe('The Kestrel Guild sent party-000004 on quest-000003, back on the night of Year 1 Day 8.');
    expect(used({ ...ids, definitionKey: 'whetstone', effect: 'bonus', encounterIndex: 1, flat: 3 })).toBe(
      "The Kestrel Guild's party-000004 used one Whetstone on Encounter 2: +3 to its Check.",
    );
    expect(used({ ...ids, definitionKey: 'grappling-line', effect: 'reroll', encounterIndex: 0, firstRoll: 12.5 })).toBe(
      "The Kestrel Guild's party-000004 used one Grappling line to try Encounter 1 again.",
    );
    expect(narrateLine(samples['item.expended'], content, calendar)).toBe(
      "The Kestrel Guild's party-000004 used one Healing draught on Brenna Ashcombe (hero-000007): their Injury heals 5 Days sooner.",
    );
  });

  test('names gear by content and by the id equip and unequip take, and says why it went back', () => {
    expect(narrateLine(samples['item.equipped'], content, calendar)).toBe(
      "The Kestrel Guild put Arming sword (stack-000004) in Brenna Ashcombe (hero-000007)'s weapon slot.",
    );
    expect(narrateLine(samples['item.unequipped'], content, calendar)).toBe(
      `The Kestrel Guild took ${content.items['lantern-of-stannary']?.name} (item-000002) from Brenna Ashcombe (hero-000007)'s trinket slot.`,
    );
    expect(narrateLine(samples['item.returned'], content, calendar)).toBe(
      'Mail shirt (stack-000004) went back to The Kestrel Guild from Brenna Ashcombe (hero-000007), who died.',
    );
    const folded = { ...samples['item.returned'], payload: { ...samples['item.returned'].payload, cause: 'guild-folded' as const } };
    expect(narrateLine(folded, content, calendar)).toMatch(/from Brenna Ashcombe \(hero-000007\) as the Guild folded\.$/);
  });

  test('says a Level gained without naming the points Potential took', () => {
    const allLost = event('hero.levelled', [heroId, guildId], { heroId, guildId, level: 20, statDeltas: {}, pointsLost: 3 });

    expect(narrateLine(allLost, content, calendar)).toBe('Brenna Ashcombe (hero-000007) reached Level 20.');
  });
});

describe('the Bankruptcy floor (DL-101)', () => {
  test('names the Guild, its Wealth, the floor and the night Bankruptcy falls on; and says when it is back', () => {
    expect(narrateLine(samples['guild.below-floor'], content, calendar)).toBe(
      "The Kestrel Guild's Wealth, -35, fell below the Bankruptcy floor of 0: Bankruptcy on the night of Year 1 Day 35 unless it is back " +
        'to 0 or more on a night by then.',
    );
    expect(narrateLine(samples['guild.floor-recovered'], content, calendar)).toBe(
      "The Kestrel Guild's Wealth, 12, is back to the Bankruptcy floor of 0 or more, after falling below it on Year 1 Day 2: no Bankruptcy is due.",
    );
    // A floor that is not 0 is named as it is, so a save playing under other rules reads true.
    const other = { ...samples['guild.below-floor'], payload: { guildId, wealth: 40, floor: 50, dueDay: 13 } };
    expect(narrateLine(other, content, calendar)).toBe(
      "The Kestrel Guild's Wealth, 40, fell below the Bankruptcy floor of 50: Bankruptcy on the night of Year 1 Day 14 unless it is back " +
        'to 50 or more on a night by then.',
    );
  });
});

describe('Transfers', () => {
  test('names who moved, between which Guilds, for how much, and what became of each offer', () => {
    expect(narrateLine(samples['hero.transferred'], content, calendar)).toBe(
      'The Iron Wardens took Brenna Ashcombe (hero-000007) from The Kestrel Guild for 420 Wealth, accepting offer-000001.',
    );
    const direct = { ...samples['hero.transferred'], payload: { ...samples['hero.transferred'].payload, offerId: null } };
    expect(narrateLine(direct, content, calendar)).toBe('The Iron Wardens took Brenna Ashcombe (hero-000007) from The Kestrel Guild for 420 Wealth.');
    expect(narrateLine(samples['guild.transfer-offered'], content, calendar)).toBe(
      'The Iron Wardens offered The Kestrel Guild 420 Wealth for Brenna Ashcombe (hero-000007) (offer-000001), until the night of Year 1 Day 8.',
    );
    expect(narrateLine(samples['guild.transfer-offer-declined'], content, calendar)).toBe(
      "The Kestrel Guild declined The Iron Wardens's Offer for Brenna Ashcombe (hero-000007) (offer-000001).",
    );
    const expired = (cause: 'expired' | 'hero-left' | 'guild-folded') =>
      narrateLine({ ...samples['guild.transfer-offer-expired'], payload: { ...samples['guild.transfer-offer-expired'].payload, cause } }, content, calendar);
    expect(expired('expired')).toBe("The Iron Wardens's Offer for Brenna Ashcombe (hero-000007) (offer-000001) expired unanswered.");
    expect(expired('hero-left')).toMatch(/lapsed: the Hero left that Roster\.$/);
    expect(expired('guild-folded')).toMatch(/lapsed as a Guild folded\.$/);
    const transferred = { ...samples['item.returned'], payload: { ...samples['item.returned'].payload, cause: 'transferred' as const } };
    expect(narrateLine(transferred, content, calendar)).toMatch(/from Brenna Ashcombe \(hero-000007\), who was transferred\.$/);
  });

  test("words what a module's effects did", () => {
    const patron = samples['patron.regard-changed'];
    const hero = samples['hero.regard-changed'];
    const byModule = <E extends { payload: object }>(sample: E): E => ({ ...sample, payload: { ...sample.payload, cause: 'module', moduleId: 'probe' } });

    expect(narrateLine(samples['guild.wealth-changed'], content, calendar)).toBe("The Kestrel Guild's Wealth went from 500 to 750.");
    expect(narrateLine(byModule(patron), content, calendar)).toMatch(/ through a Module\.$/);
    expect(narrateLine(byModule(hero), content, calendar)).toMatch(/ through a Module\.$/);
  });
});

describe("a module's own event: one generic sentence for any type, never a crash", () => {
  /** An event a module made, as the History holds it: the CLI knows neither its type nor its payload. */
  function moduleEvent(type: string, participants: string[], payload: unknown, extraLabels: Record<string, string> = {}): ModuleEvent {
    const named = Object.fromEntries(participants.flatMap((id) => {
      const label = extraLabels[id] ?? labels[id];
      return label === undefined ? [] : [[id, label]];
    }));
    return { type, turn: 9, participants, labels: named, milestone: false, payload } as unknown as ModuleEvent;
  }

  test("names the module, from its type's namespace, the type, and who it concerns, a Hero with the id the commands take", () => {
    const fired = moduleEvent('probe.fired', [heroId, patronId, guildId], { roll: 0.01, effects: [] });

    expect(narrateLine(fired, content, calendar)).toBe('The probe Module recorded probe.fired for Brenna Ashcombe (hero-000007), Lady Maud and The Kestrel Guild.');
  });

  test.each([
    ['a module the CLI has never heard of, concerning no one', moduleEvent('weather.storm-broke', [], null), 'The weather Module recorded weather.storm-broke.'],
    ['a payload of any shape', moduleEvent('ledger.balanced', [guildId], [1, 'two', { three: null }]), 'The ledger Module recorded ledger.balanced for The Kestrel Guild.'],
    ['a participant with no label, by its id', moduleEvent('probe.fired', ['hero-000099'], undefined), 'The probe Module recorded probe.fired for hero-000099.'],
    ['a type outside any namespace', moduleEvent('mystery', [heroId], {}), 'A Module recorded mystery for Brenna Ashcombe (hero-000007).'],
  ])('%s', (_name, event, sentence) => {
    expect(narrateLine(event, content, calendar)).toBe(sentence);
  });
});

describe('the Market', () => {
  test('names what was bought and sold, how many, and the Wealth that changed hands', () => {
    const sold = narrateLine(
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
      calendar,
    );

    expect(narrateLine(samples['item.bought'], content, calendar)).toBe('The Kestrel Guild bought 3 × Whetstone at the Market for 75 Wealth.');
    expect(sold).toBe('The Kestrel Guild sold Healing draught at the Market for 15 Wealth.');
    expect(narrateLine(samples['item.sold'], content, calendar)).toBe(
      `The Kestrel Guild's ${content.items['barrow-kings-blade']?.name} (item-000002) went to the Market for 300 Wealth as the Guild folded.`,
    );
  });
});

describe("the CLI's Namer", () => {
  test.each<[string, Slot, string]>([
    ['a Hero, by label and the id the commands take', { kind: 'hero', table: 'heroes', id: heroId, label: 'Brenna Ashcombe' }, 'Brenna Ashcombe (hero-000007)'],
    ['a Hero with no label, by id', { kind: 'hero', table: 'heroes', id: heroId, label: undefined }, 'hero-000007'],
    ['someone else, by label alone, a Hero among them', { kind: 'name', table: 'heroes', id: heroId, label: 'Brenna Ashcombe' }, 'Brenna Ashcombe'],
    ['someone with no label, by id', { kind: 'name', table: 'guilds', id: guildId, label: undefined }, 'guild-000002'],
    ['a Quest by its template and id', { kind: 'quest', id: questId, template: 'Clear the barrow' }, 'Clear the barrow (quest-000003)'],
    ['a Quest by id alone', { kind: 'quest', id: questId, template: undefined }, 'quest-000003'],
    ['a Party by id, whatever the page calls it', { kind: 'party', id: partyId, guild: { kind: 'name', table: 'guilds', id: guildId, label: 'The Kestrel Guild' } }, 'party-000004'],
    ['an Offer accepted, by id', { kind: 'offer', id: offerId }, 'offer-000001'],
    ['the ids a command takes, after what they name', { kind: 'ids', ids: [itemId, 'item-000003'] }, ' (item-000002, item-000003)'],
    ['no ids, nothing', { kind: 'ids', ids: [] }, ''],
    ['a date, with its Turn beside it (DL-240)', { kind: 'date', turn: 540, date: 'Year 1 Day 181' }, 'Year 1 Day 181 (Turn 540)'],
    ["an entry of a new game's setup, by its flag", { kind: 'entry', field: 'sex', value: 'other' }, '--sex other'],
    ['a number entered, by its flag', { kind: 'entry', field: 'age', value: 51 }, '--age 51'],
    ["a Stat entered, by its flag's key and value", { kind: 'entry', field: 'stats', value: 16, key: 'negotiation' }, '--stats negotiation=16'],
    ['a command to run', { kind: 'command', command: 'show-roster' }, ' (show roster)'],
    ['a flag to give', { kind: 'command', command: 'name-guild' }, ': --guild <name>'],
  ])('names %s', (_name, slot, words) => {
    expect(cliNamer(slot)).toBe(words);
  });
});

// The refusals' table (`@heroesim/words`, DL-240) in the CLI's words: a Hero and an Item by name and
// the id the commands take, and the command or the flag to use. `words/src/refusals.test.ts` holds
// the table's words and slots for every kind, and the commands' tests that each command refuses
// with them.
describe("the CLI's words for a refusal", () => {
  const { document } = createWorld(
    'rejection-words',
    { guildName: 'The Lantern', guildmasterName: 'Ada Vell', createdAt: '2026-09-27T09:00:00.000Z' },
    { config: defaultConfig, content },
  );
  const { world } = document;
  const player = playerGuild(world) as Guild;
  const rival = Object.values(world.guilds).find((guild) => guild.id !== player.id) as Guild;
  const hero = world.heroes[player.rosterIds[0] as Hero['id']] as Hero;
  const rivalHero = world.heroes[rival.rosterIds[0] as Hero['id']] as Hero;
  const quest = Object.values(world.quests)[0];
  const stack = Object.values(world.stacks)[0];
  if (quest === undefined || stack === undefined) throw new Error('the world has no Quest or no stack');
  const named = (rows: Readonly<Record<string, { name: string }>>, key: string): string => rows[key]?.name ?? key;

  const brenna = `${hero.name} (${hero.id})`;
  const stranger = `${rivalHero.name} (${rivalHero.id})`;
  const held = `${named(content.items, stack.definitionKey)} (${stack.id})`;
  const questName = `${named(content.questTemplates, quest.templateKey)} (${quest.id})`;
  const whetstone = named(content.items, 'whetstone');
  const sword = named(content.items, 'arming-sword');
  const fee = { guildId: player.id, fee: 180, wealth: 40 };
  const backgrounds = Object.values(content.backgrounds)
    .filter((row) => row.owner === 'guild')
    .map((row) => `${row.name} (${row.key})`)
    .join(', ');

  test.each<[Refusal, string]>([
    [{ action: 'buy', reason: 'no-player-guild' }, "The save has no player's Guild."],
    [{ action: 'advance', reason: 'game-ended', ending: { turn: 540, reason: 'bankruptcy' } }, 'The game ended on Year 1 Day 181 (Turn 540): The Lantern went bankrupt. No Turn follows.'],
    [
      { action: 'buy', reason: 'game-ended', ending: { turn: 540, reason: 'retirement' } },
      'The game ended on Year 1 Day 181 (Turn 540): The Lantern lost its Guildmaster to Retirement. Nothing more can be done in it.',
    ],
    [{ action: 'newGame', reason: 'guild-name-blank' }, 'The Guild needs a name: --guild <name>.'],
    [{ action: 'newGame', reason: 'guildmaster-name-blank' }, 'The Guildmaster needs a name: --master <name>.'],
    [{ action: 'newGame', reason: 'unknown-background', backgroundKey: 'nope' }, `No Guild Background is called "nope". Choose one of: ${backgrounds}.`],
    [{ action: 'newGame', reason: 'unknown-sex', sex: 'other' }, "A Guildmaster's Sex is female or male; --sex other is not."],
    [{ action: 'newGame', reason: 'age-out-of-range', age: 51, min: 21, max: 50 }, 'A Guildmaster starts aged 21 to 50, in whole Years; --age 51 is not.'],
    [{ action: 'newGame', reason: 'stats-incomplete', missing: ['coaching', 'judgement'] }, 'Every Guildmaster Stat is chosen, or none; Coaching and Judgement are not.'],
    [
      { action: 'newGame', reason: 'stat-out-of-range', statKey: 'negotiation', value: 16, min: 5, max: 15 },
      "A Guildmaster's Negotiation is 5 to 15 when chosen, in whole numbers; --stats negotiation=16 is not.",
    ],
    [{ action: 'newGame', reason: 'stats-over-points', spent: 55, points: 50 }, 'Those Stats spend 55 points, and the Stat points are 50: lower one to raise another.'],
    [{ action: 'newGame', reason: 'unknown-trait', traitKey: 'brave' }, 'No Guildmaster Trait is called "brave".'],
    [{ action: 'newGame', reason: 'repeated-trait', traitKey: 'miser' }, `${named(content.guildmasterTraits, 'miser')} is chosen twice.`],
    [{ action: 'newGame', reason: 'too-many-traits', count: 3, max: 2 }, 'A Guildmaster holds at most 2 Traits; 3 are chosen.'],
    [{ action: 'newGame', reason: 'text-too-long', attribute: 'appearance', length: 281, max: 280 }, 'The Appearance is 281 characters long; it holds at most 280.'],
    [{ action: 'newGame', reason: 'unknown-portrait', portraitKey: 'gm-male-09' }, 'No Guildmaster Portrait is called "gm-male-09".'],
    [
      { action: 'newGame', reason: 'portrait-of-another-sex', portraitKey: 'gm-male-01', sex: 'female', portraitSex: 'male' },
      "That Portrait is of a male Guildmaster, and your Guildmaster's Sex is female: choose a Portrait of that Sex, or leave out --sex.",
    ],
    [{ action: 'rebase', reason: 'already-current', configVersion }, `This game already plays under this release's rules, configVersion ${configVersion}.`],
    [{ action: 'dispatch', reason: 'quest-not-offered', questId: quest.id }, `${questName} is not on the Board: it has been taken or has expired, or was never offered.`],
    [
      { action: 'dispatch', reason: 'quest-not-offered', questId: 'quest-999999' as QuestId },
      'quest-999999 is not on the Board: it has been taken or has expired, or was never offered.',
    ],
    [{ action: 'dispatch', reason: 'hero-not-on-roster', heroId: rivalHero.id, guildId: player.id }, `${stranger} is not on the Roster of The Lantern.`],
    [{ action: 'dispatch', reason: 'hero-not-on-roster', heroId: 'hero-999999' as HeroId, guildId: player.id }, 'hero-999999 is not on the Roster of The Lantern.'],
    [
      { action: 'dispatch', reason: 'requirement-unmet', questId: quest.id, unmet: [{ requirement: 'class', classKey: 'healer' }] },
      `${questName} needs a ${named(content.classes, 'healer')} in the Party.`,
    ],
    [{ action: 'dispatch', reason: 'not-consumable', definitionKey: 'arming-sword' }, `${sword} is Gear, not a Consumable: a Party carries Consumables only.`],
    [{ action: 'recruit', reason: 'hero-not-unattached', heroId: hero.id }, `${brenna} is not in the Unattached pool; show pool lists who is.`],
    [{ action: 'recruit', reason: 'insufficient-wealth', fee: 900, wealth: 500 }, 'The signing fee is 900 Wealth; The Lantern has 500.'],
    [{ action: 'build', reason: 'max-grade', facility: 'quarters', grade: 3 }, "The Lantern's quarters are at grade 3, the highest there is."],
    [{ action: 'equip', reason: 'hero-not-on-roster', heroId: rivalHero.id, guildId: player.id }, `${stranger} is not on The Lantern's Roster (show roster).`],
    [{ action: 'equip', reason: 'not-held-by-guild', itemId: null, stackId: stack.id }, `The Lantern does not hold ${held}: show roster lists what it holds.`],
    [
      { action: 'equip', reason: 'not-held-by-guild', itemId: null, stackId: 'stack-999999' as StackId },
      'The Lantern does not hold stack-999999: show roster lists what it holds.',
    ],
    [{ action: 'equip', reason: 'not-gear', definitionKey: 'whetstone' }, `${whetstone} is not Gear, and is carried in no slot.`],
    [
      { action: 'equip', reason: 'wrong-slot', definitionKey: 'arming-sword', slot: 'weapon', gearSlot: 'weapon', heroSlots: ['armour'] },
      `${sword} is weapon Gear, and Heroes have no weapon slot in this game.`,
    ],
    [{ action: 'equip', reason: 'slot-occupied', heroId: hero.id, slot: 'weapon', occupant: stack.id }, `${brenna}'s weapon slot holds ${held}: unequip it first.`],
    [{ action: 'unequip', reason: 'slot-empty', heroId: hero.id, slot: 'trinket' }, `${brenna}'s trinket slot is empty.`],
    [{ action: 'buy', reason: 'not-in-market', definitionKey: 'runed-circlet' }, `The Market has no ${named(content.items, 'runed-circlet')} for sale (show market).`],
    [{ action: 'sell', reason: 'not-held-by-guild', id: stack.id }, `The Lantern holds no ${held} to sell (show market lists what it holds).`],
    [{ action: 'sell', reason: 'equipped', id: stack.id, heroId: hero.id, slot: 'weapon' }, `${brenna} carries ${held} as their weapon; unequip it first.`],
    [{ action: 'sell', reason: 'insufficient-quantity', stackId: stack.id, quantity: 4, available: 2 }, `That stack of ${held} holds 2; 4 cannot be sold from it.`],
    [{ action: 'transferIn', reason: 'hero-not-on-roster', heroId: hero.id }, `${brenna} is on no other Guild's Roster (show roster <guildId>).`],
    [{ action: 'transferOut', reason: 'hero-not-on-roster', heroId: rivalHero.id }, `${stranger} is not on The Lantern's Roster (show roster).`],
    [
      { action: 'transferOut', reason: 'hero-in-party', heroId: hero.id, partyId: 'party-000001' as PartyId },
      `${brenna} is away with a Party (party-000001); a Hero is transferred only from the Hall.`,
    ],
    [
      { action: 'transferOut', reason: 'recently-transferred', heroId: hero.id, transferredOnTurn: 30, untilTurn: 300 },
      `${brenna} was transferred on Year 1 Day 11 and cannot be transferred again before Year 1 Day 101.`,
    ],
    [
      { action: 'transferIn', reason: 'transfer-refused', guildId: rival.id, heroId: rivalHero.id, side: 'out', because: 'wealth' },
      `${rival.name} will not part with ${stranger}: it is not rich enough to hire now.`,
    ],
    [{ action: 'transferIn', reason: 'insufficient-wealth', ...fee }, 'The fee is 180 Wealth; The Lantern has 40.'],
    [
      { action: 'acceptTransfer', reason: 'offer-not-found', offerId: 'offer-000001' as OfferId },
      "No such Transfer Offer (offer-000001) stands for The Lantern's Heroes (show offers).",
    ],
  ])('%j', (refusal, words) => {
    expect(refusalLine(refusal, { world, content, calendar: defaultConfig })).toBe(words);
  });
});
