import {
  advance,
  createWorld,
  dayOf,
  defaultConfig,
  milestoneTypes,
  offerTransfer,
  playerGuild,
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
  type ModuleEvent,
  type StackId,
  type StopReason,
  type WorldDocument,
} from '@heroesim/engine';
import { describe, expect, test } from 'vitest';
import { content } from '../content';
import { narrate, narratedTypes, narrateSegments, narrateStop, narrationFor, questNamer, textOf, type Narration, type Segment } from './narrate';

// The log's words (M7-S3's first box): every event type in the engine's union has a sentence. The
// samples table's type is derived from the union, so a type the engine adds fails `npm run
// typecheck` here, as it does in the map, until both have it; at run time the union is enumerated
// by the engine's `milestoneTypes`, a record keyed by every event type.

const guildId = 'guild-000002' as GuildId;
const heroId = 'hero-000007' as HeroId;
const questId = 'quest-000003' as QuestId;
const partyId = 'party-000004' as PartyId;
const patronId = 'patron-000005';
const guildmasterId = 'guildmaster-000002';
/** A Rival Guildmaster's successor (M9-S2). */
const successorId = 'guildmaster-000007';
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
  [successorId]: 'Wenna Tolley',
  [rivalId]: 'The Iron Wardens',
  [otherHeroId]: 'Aldred Barrowby',
};

const barrow = content.questTemplates['clear-the-barrow']?.name ?? 'clear-the-barrow';

/** Quests by the name of the one template the samples use. */
const narration: Narration = { content, questName: (id) => (id === questId ? barrow : 'a Quest') };

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
  'quest.taken': event('quest.taken', [questId, partyId, heroId, otherHeroId, guildId], {
    questId,
    partyId,
    guildId,
    heroIds: [heroId, otherHeroId],
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

/** Every event type in the engine's union, enumerated by a record the engine keys by each. */
const union = Object.keys(milestoneTypes).sort() as EngineEventType[];

/** An entity id, which a sentence here never shows: the player types none. */
const anId = /\b(guild|guildmaster|hero|patron|quest|party|offer|item|stack)-\d{6}\b/;

/** What a sentence in the page must be: one line, a full stop, no id, nothing left unfilled. */
function expectASentence(line: string): void {
  expect(line).toMatch(/^[A-Z0-9].*\.$/);
  expect(line).not.toContain('\n');
  expect(line).not.toMatch(/undefined|null|NaN|\[object/);
  expect(line).not.toMatch(anId);
}

describe('every event type in the engine\'s union has a sentence', () => {
  test('the map has words for exactly the union, which the samples cover', () => {
    expect([...narratedTypes].sort()).toEqual(union);
    expect(Object.keys(samples).sort()).toEqual(union);
    expect(union.length).toBeGreaterThanOrEqual(40);
  });

  test.each(union)('%s reads as one sentence, naming whom it names and showing no id', (type) => {
    const line = narrate(samples[type], narration);

    expectASentence(line);
    const named = samples[type].participants.flatMap((id) => labels[id] ?? []);
    if (named.length > 0) expect(named.some((label) => line.includes(label)), line).toBe(true);
  });
});

/** Content's name for `key` in `rows`: the test reads the names content gives, as the sentence does. */
function named(rows: Readonly<Record<string, { name: string }>>, key: string): string {
  const row = rows[key];
  if (row === undefined) throw new Error(`the content has no ${key}`);
  return row.name;
}

/**
 * Every sample's sentence, word for word: the CLI's (`cli/src/narrate.ts`) with the ids a command
 * takes left out and a Party called its Guild's (DL-66 item 3). Pinned whole, so a sentence that
 * swaps who did what, or two numbers, or says one word for another, fails (M7 verification, DL-74).
 */
const exactly: { [Type in EngineEventType]: string } = {
  'world.created': 'The world was made from seed demo.',
  'guild.founded': 'The Kestrel Guild was founded.',
  'guildmaster.generated': 'Osric Vane leads The Kestrel Guild.',
  'hero.generated': `Brenna Ashcombe, ${named(content.classes, 'rogue')}, joined the Unattached pool.`,
  'patron.generated': `Lady Maud of the ${named(content.spheres, 'crown')} became a Patron.`,
  'world.rules-adopted': 'The rules moved from configVersion 1 to 2.',
  'guild.upkeep-paid': 'The Kestrel Guild paid 40 Upkeep, leaving 460 Wealth.',
  'guild.below-floor':
    "The Kestrel Guild's Wealth, -35, fell below the Bankruptcy floor of 0: Bankruptcy on the night of Day 34 unless it is back to 0 or more on a night by then.",
  'guild.floor-recovered':
    "The Kestrel Guild's Wealth, 12, is back to the Bankruptcy floor of 0 or more, after falling below it on Day 1: no Bankruptcy is due.",
  'hero.recruited': 'The Kestrel Guild signed Brenna Ashcombe for 110 Wealth.',
  'hero.left-pool': 'Brenna Ashcombe left the Unattached pool.',
  'quest.offered': `Lady Maud offered ${barrow}.`,
  'quest.expired': `Lady Maud's ${barrow} expired untaken.`,
  'quest.taken': `The Kestrel Guild sent Brenna Ashcombe and Aldred Barrowby on ${barrow}, back on the night of Day 7, carrying ${named(content.items, 'whetstone')} ×2.`,
  'quest.encounter': `The Kestrel Guild's Party failed at ${named(content.encounters, 'ambush-on-the-road')} (Encounter 2), a Failure: Brenna Ashcombe was injured.`,
  'quest.resolved': `The Kestrel Guild's Party came home from ${named(content.questTemplates, 'guard-the-caravan')} and failed: Wealth 0, Fame -2.`,
  'quest.loot': `The Kestrel Guild found Loot on ${barrow}: ${named(content.items, 'barrow-kings-blade')}.`,
  'hero.injured': `Brenna Ashcombe was injured (${named(content.injuries, 'deep-cut')}), healing on the night of Day 13.`,
  'hero.died': `Brenna Ashcombe died on ${barrow}.`,
  'hero.xp-gained': 'Brenna Ashcombe gained 30 XP.',
  'hero.morale-changed': "Brenna Ashcombe's Morale went from 45 to 35, low.",
  'hero.healed': `Brenna Ashcombe recovered from ${named(content.injuries, 'deep-cut')}, left ${named(content.traits, 'scarred')}.`,
  'hero.retired': 'Brenna Ashcombe retired from The Kestrel Guild at 51.',
  'hero.declined': `Brenna Ashcombe, at 41, lost 1 ${named(content.stats, 'endurance')} to age.`,
  'game.ended': 'The game ended: The Kestrel Guild went bankrupt.',
  'guild.folded': 'The Kestrel Guild had its Roster wiped out and folded.',
  'guildmaster.succeeded': 'Osric Vane retired at 65 as Guildmaster of The Kestrel Guild, and Wenna Tolley succeeded them.',
  'hero.left-guild': 'Brenna Ashcombe left The Kestrel Guild for the Unattached pool.',
  'guild.improved': `The Kestrel Guild built ${named(content.improvements, 'training-yard-2')} for 500 Wealth: its training yard is now grade 2.`,
  'hero.levelled': `Brenna Ashcombe reached Level 3: ${named(content.stats, 'courage')} +2, ${named(content.stats, 'strength')} +1.`,
  'patron.regard-changed': "Lady Maud's Regard for The Kestrel Guild fell from neutral to cool after a Quest of theirs failed.",
  'guildmaster.regard-changed': "Osric Vane's Regard for Brenna Ashcombe rose from neutral to warm.",
  'hero.regard-changed': "Brenna Ashcombe's Regard for Aldred Barrowby rose from warm to close after a Quest together.",
  'item.expended': `The Kestrel Guild's Party used one ${named(content.items, 'healing-draught')} on Brenna Ashcombe: their Injury heals 5 Days sooner.`,
  'item.equipped': `The Kestrel Guild put ${named(content.items, 'arming-sword')} in Brenna Ashcombe's weapon slot.`,
  'item.unequipped': `The Kestrel Guild took ${named(content.items, 'lantern-of-stannary')} from Brenna Ashcombe's trinket slot.`,
  'item.returned': `${named(content.items, 'mail-shirt')} went back to The Kestrel Guild from Brenna Ashcombe, who died.`,
  'item.bought': `The Kestrel Guild bought 3 × ${named(content.items, 'whetstone')} at the Market for 75 Wealth.`,
  'item.sold': `The Kestrel Guild's ${named(content.items, 'barrow-kings-blade')} went to the Market for 300 Wealth as the Guild folded.`,
  'hero.transferred': 'The Iron Wardens took Brenna Ashcombe from The Kestrel Guild for 420 Wealth, accepting its Transfer Offer.',
  'guild.transfer-offered': 'The Iron Wardens offered The Kestrel Guild 420 Wealth for Brenna Ashcombe, until the night of Day 7.',
  'guild.transfer-offer-declined': "The Kestrel Guild declined The Iron Wardens's Offer for Brenna Ashcombe.",
  'guild.transfer-offer-expired': "The Iron Wardens's Offer for Brenna Ashcombe expired unanswered.",
  'guild.wealth-changed': "The Kestrel Guild's Wealth went from 500 to 750.",
};

describe('every sample in so many words', () => {
  test.each(union)('%s says exactly what the CLI says, less its ids', (type) => {
    expect(narrate(samples[type], narration)).toBe(exactly[type]);
  });

  /** A sample of `type` with its payload changed. */
  function varied<Type extends EngineEventType>(type: Type, change: Partial<EngineEventOf<Type>['payload']>): EngineEventOf<Type> {
    const sample = samples[type] as EngineEventOf<Type>;
    return { ...sample, payload: { ...sample.payload, ...change } } as EngineEventOf<Type>;
  }

  const rest = content.questTemplates['guard-the-caravan']?.name ?? '';
  const draught = named(content.items, 'healing-draught');

  test.each([
    ['a Quest that succeeded', varied('quest.resolved', { band: 'success', wealthDelta: 120, fameDelta: 3 }), `The Kestrel Guild's Party came home from ${rest} and succeeded: Wealth +120, Fame +3.`],
    ['a Quest that succeeded strongly', varied('quest.resolved', { band: 'strong', wealthDelta: 150, fameDelta: 5 }), `The Kestrel Guild's Party came home from ${rest} and succeeded strongly: Wealth +150, Fame +5.`],
    ['a consumable that healed a Day sooner', varied('item.expended', { days: 1 } as never), `The Kestrel Guild's Party used one ${draught} on Brenna Ashcombe: their Injury heals 1 Day sooner.`],
    [
      'a consumable that bonused a Check',
      varied('item.expended', { effect: 'bonus', encounterIndex: 2, flat: 3 } as never),
      `The Kestrel Guild's Party used one ${draught} on Encounter 3: +3 to its Check.`,
    ],
    [
      'a consumable that tried an Encounter again',
      varied('item.expended', { effect: 'reroll', encounterIndex: 0, firstRoll: 4 } as never),
      `The Kestrel Guild's Party used one ${draught} to try Encounter 1 again.`,
    ],
    ["the player's own sale", varied('item.sold', { cause: 'sale', quantity: 2, proceeds: 600 }), `The Kestrel Guild sold 2 × ${named(content.items, 'barrow-kings-blade')} at the Market for 600 Wealth.`],
    ['a Transfer with no offer', varied('hero.transferred', { offerId: null }), 'The Iron Wardens took Brenna Ashcombe from The Kestrel Guild for 420 Wealth.'],
    ['an offer lapsed as its Hero left', varied('guild.transfer-offer-expired', { cause: 'hero-left' }), "The Iron Wardens's Offer for Brenna Ashcombe lapsed: the Hero left that Roster."],
    ['an offer lapsed as a Guild folded', varied('guild.transfer-offer-expired', { cause: 'guild-folded' }), "The Iron Wardens's Offer for Brenna Ashcombe lapsed as a Guild folded."],
    ['a Guild folded by Retirement', varied('guild.folded', { reason: 'retirement' }), 'The Kestrel Guild lost its Guildmaster to Retirement and folded.'],
    ['a Guild folded bankrupt', varied('guild.folded', { reason: 'bankruptcy' }), 'The Kestrel Guild went bankrupt and folded.'],
    ['the game ended by Retirement', varied('game.ended', { reason: 'retirement' }), 'The game ended: The Kestrel Guild lost its Guildmaster to Retirement.'],
    ['a Hero made on a Roster', event('hero.generated', [heroId, guildId], { heroId, guildId, classKey: 'rogue' }), `Brenna Ashcombe, ${named(content.classes, 'rogue')}, joined The Kestrel Guild.`],
    ['a Hero healed who kept no Trait', varied('hero.healed', { traitKey: null }), `Brenna Ashcombe recovered from ${named(content.injuries, 'deep-cut')}.`],
    ['gear back from a retired Hero', varied('item.returned', { cause: 'retired' }), `${named(content.items, 'mail-shirt')} went back to The Kestrel Guild from Brenna Ashcombe, who retired.`],
    ['gear back as the Guild folded', varied('item.returned', { cause: 'guild-folded' }), `${named(content.items, 'mail-shirt')} went back to The Kestrel Guild from Brenna Ashcombe as the Guild folded.`],
    ['Morale that rose', varied('hero.morale-changed', { before: 35, after: 45, bandAfter: 'steady' }), "Brenna Ashcombe's Morale went from 35 to 45, steady."],
    [
      "a Patron's Regard a module moved",
      varied('patron.regard-changed', { cause: 'module', moduleId: 'probe' }),
      "Lady Maud's Regard for The Kestrel Guild fell from neutral to cool through a Module.",
    ],
    ["a Hero's Regard a module moved", varied('hero.regard-changed', { cause: 'module', moduleId: 'probe' }), /^Brenna Ashcombe's Regard for .+ through a Module\.$/],
  ] as const)('%s', (_name, event, sentence) => {
    if (typeof sentence === 'string') expect(narrate(event, narration)).toBe(sentence);
    else expect(narrate(event, narration)).toMatch(sentence);
  });
});

/** The names a line marks, in its order: whom each opens, and the words it shows. */
function namesIn(segments: readonly Segment[]): [string, string][] {
  return segments.flatMap((segment) => (segment.kind === 'name' ? [[segment.entityId, segment.text] as [string, string]] : []));
}

describe('a line as segments: its words, and the names in it the page can open (M9-S5)', () => {
  test.each(union)('%s reads word for word as its sentence, and marks only names of whom the event names', (type) => {
    const segments = narrateSegments(samples[type], narration);

    expect(textOf(segments)).toBe(exactly[type]);
    for (const [entityId, text] of namesIn(segments)) {
      expect(samples[type].participants).toContain(entityId);
      expect(text).toBe(labels[entityId]);
    }
  });

  test('marks each name from the id the sentence reads, in the order the sentence gives them', () => {
    expect(namesIn(narrateSegments(samples['quest.taken'], narration))).toEqual([
      [guildId, 'The Kestrel Guild'],
      [heroId, 'Brenna Ashcombe'],
      [otherHeroId, 'Aldred Barrowby'],
    ]);
    expect(namesIn(narrateSegments(samples['hero.transferred'], narration))).toEqual([
      [rivalId, 'The Iron Wardens'],
      [heroId, 'Brenna Ashcombe'],
      [guildId, 'The Kestrel Guild'],
    ]);
    expect(namesIn(narrateSegments(samples['guildmaster.regard-changed'], narration))).toEqual([
      [guildmasterId, 'Osric Vane'],
      [heroId, 'Brenna Ashcombe'],
    ]);
    expect(namesIn(narrateSegments(samples['patron.regard-changed'], narration))).toEqual([
      [patronId, 'Lady Maud'],
      [guildId, 'The Kestrel Guild'],
    ]);
    expect(namesIn(narrateSegments(samples['quest.encounter'], narration))).toEqual([
      [guildId, 'The Kestrel Guild'],
      [heroId, 'Brenna Ashcombe'],
    ]);
    // M9-S2's Succession, each Guildmaster a name that opens their History.
    expect(namesIn(narrateSegments(samples['guildmaster.succeeded'], narration))).toEqual([
      [guildmasterId, 'Osric Vane'],
      [guildId, 'The Kestrel Guild'],
      [successorId, 'Wenna Tolley'],
    ]);
    // What each name is, for the page to know where it opens.
    const [guild, hero] = narrateSegments(samples['hero.recruited'], narration).filter((segment) => segment.kind === 'name');
    expect(guild).toMatchObject({ table: 'guilds' });
    expect(hero).toMatchObject({ table: 'heroes' });
  });

  test('never finds a name by reading its own sentence: two of one name are told apart by their ids', () => {
    // A Hero who shares the Guild's name: the sentence reads the same twice, the ids do not.
    const twin = { ...samples['hero.recruited'], labels: { [guildId]: 'Wren', [heroId]: 'Wren' } };

    expect(textOf(narrateSegments(twin, narration))).toBe('Wren signed Wren for 110 Wealth.');
    expect(namesIn(narrateSegments(twin, narration))).toEqual([
      [guildId, 'Wren'],
      [heroId, 'Wren'],
    ]);
  });

  test('leaves as words someone the event has no label for, capitalised where the line opens with them', () => {
    const unlabelled = { ...samples['hero.recruited'], labels: {} };

    expect(narrateSegments(unlabelled, narration)).toEqual([{ kind: 'text', text: 'A Guild signed a Hero for 110 Wealth.' }]);
  });

  test("marks the names in a module's own event too, from its participants", () => {
    const fired = { type: 'probe.fired', turn: 9, participants: [heroId, patronId], labels: { [heroId]: labels[heroId], [patronId]: labels[patronId] }, milestone: false, payload: {} } as unknown as ModuleEvent;

    expect(textOf(narrateSegments(fired, narration))).toBe('The probe Module recorded probe.fired for Brenna Ashcombe and Lady Maud.');
    expect(namesIn(narrateSegments(fired, narration))).toEqual([
      [heroId, 'Brenna Ashcombe'],
      [patronId, 'Lady Maud'],
    ]);
  });
});

describe("a module's own event: one generic sentence for any type, never a crash (M8-S4)", () => {
  /** An event a module made, as the History holds it: the page knows neither its type nor its payload. */
  function moduleEvent(type: string, participants: string[], payload: unknown): ModuleEvent {
    const named = Object.fromEntries(participants.flatMap((id) => (labels[id] === undefined ? [] : [[id, labels[id]]])));
    return { type, turn: 9, participants, labels: named, milestone: false, payload } as unknown as ModuleEvent;
  }

  test("names the module, from its type's namespace, the type, and who it concerns, by name alone", () => {
    const fired = moduleEvent('probe.fired', [heroId, patronId, guildId], { roll: 0.01, effects: [] });

    expect(narrate(fired, narration)).toBe('The probe Module recorded probe.fired for Brenna Ashcombe, Lady Maud and The Kestrel Guild.');
  });

  test.each([
    ['a module the page has never heard of, concerning no one', moduleEvent('weather.storm-broke', [], null), 'The weather Module recorded weather.storm-broke.'],
    ['a payload of any shape', moduleEvent('ledger.balanced', [guildId], [1, 'two', { three: null }]), 'The ledger Module recorded ledger.balanced for The Kestrel Guild.'],
    ['a participant with no label, by what it is', moduleEvent('probe.fired', ['hero-000099', 'not-an-id'], undefined), 'The probe Module recorded probe.fired for a Hero and someone.'],
    ['a type outside any namespace', moduleEvent('mystery', [heroId], {}), 'A Module recorded mystery for Brenna Ashcombe.'],
  ])('%s', (_name, event, sentence) => {
    expect(narrate(event, narration)).toBe(sentence);
  });
});

describe("the CLI's words, adapted for the page", () => {
  test('names content keys by content, Heroes by name, and Quests by their template', () => {
    expect(narrate(samples['quest.offered'], narration)).toBe(`Lady Maud offered ${barrow}.`);
    expect(narrate(samples['hero.healed'], narration)).toBe('Brenna Ashcombe recovered from Deep cut, left Scarred.');
    expect(narrate(samples['hero.declined'], narration)).toBe('Brenna Ashcombe, at 41, lost 1 Endurance to age.');
    expect(narrate(samples['hero.died'], narration)).toBe(`Brenna Ashcombe died on ${barrow}.`);
    expect(narrate(samples['quest.taken'], narration)).toBe(
      `The Kestrel Guild sent Brenna Ashcombe and Aldred Barrowby on ${barrow}, back on the night of Day 7, carrying Whetstone ×2.`,
    );
    // An entry written before v1.1.4-S2 reads as its outcome, a Failure or a Success.
    expect(narrate(samples['quest.encounter'], narration)).toBe(
      `The Kestrel Guild's Party failed at ${content.encounters['ambush-on-the-road']?.name} (Encounter 2), a Failure: Brenna Ashcombe was injured.`,
    );
    expect(narrate(samples['quest.resolved'], narration)).toMatch(/came home from .+ and failed: Wealth 0, Fame -2\.$/);
    expect(narrate(samples['item.bought'], narration)).toBe('The Kestrel Guild bought 3 × Whetstone at the Market for 75 Wealth.');
    expect(narrate(samples['hero.transferred'], narration)).toBe(
      'The Iron Wardens took Brenna Ashcombe from The Kestrel Guild for 420 Wealth, accepting its Transfer Offer.',
    );
  });

  test("gives an Encounter's Degree and, of several Checks, the name of the one that decided it (v1.1.4-S2)", () => {
    const ambush = content.encounters['ambush-on-the-road'] as Encounter;
    const [front] = ambush.checks as [EncounterCheck];
    const several: Narration = {
      ...narration,
      content: {
        ...content,
        encounters: { ...content.encounters, [ambush.key]: { ...ambush, checks: [front, { ...front, key: 'nerve', name: 'Nerve' }], pass: ['and', front.key, 'nerve'] } },
      },
    };
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

    expect(narrate({ ...samples['quest.encounter'], payload }, several)).toBe(
      `The Kestrel Guild's Party failed at ${ambush.name} (Encounter 2), a Setback, decided by Nerve: Brenna Ashcombe was injured.`,
    );
    const one = { ...payload, decidedBy: front.key, degree: 'triumph' as const, outcome: 'success' as const, injured: [], checks: payload.checks.slice(0, 1) };
    expect(narrate({ ...samples['quest.encounter'], payload: one }, narration)).toBe(`The Kestrel Guild's Party came through ${ambush.name} (Encounter 2), a Triumph.`);
    // One Check named otherwise than its Encounter is named (v1.1.4-S2's verification, DL-152).
    const renamed: Narration = {
      ...narration,
      content: { ...content, encounters: { ...content.encounters, [ambush.key]: { ...ambush, checks: [{ ...front, name: 'Steel' }] } } },
    };
    expect(narrate({ ...samples['quest.encounter'], payload: one }, renamed)).toBe(
      `The Kestrel Guild's Party came through ${ambush.name} (Encounter 2), a Triumph, decided by Steel.`,
    );
  });

  test("says once, for the Party, when form decided whether the Encounter succeeded, exactly when its formDecided is set, naming no Hero (v1.1.4-S3)", () => {
    const roll = { capability: 15, roll: 14.5, target: 18, margin: -3.5 };
    const front: CheckRoll = { key: 'front', ...roll, degree: 'setback' };
    const base = { ...samples['quest.encounter'].payload, degree: 'setback' as const, decidedBy: 'front', checks: [front] };
    const line = (payload: EngineEventOf<'quest.encounter'>['payload']) => narrate({ ...samples['quest.encounter'], payload }, narration);
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
    // An entry written before v1.1.4-S3, or before v1.1.4-S2, has no such sentence.
    const older = { ...base };
    Reflect.deleteProperty(older, 'checks');
    expect(line(older)).not.toMatch(/spirits/);
    // The sentence is words alone: no Hero's name is a segment of it.
    const segments = narrateSegments({ ...samples['quest.encounter'], payload: { ...base, formDecided: 'lowered' as const } }, narration);
    const after = segments.slice(segments.findIndex((segment) => segment.text.includes('Low spirits')));
    expect(after.length).toBeGreaterThan(0);
    expect(namesIn(after)).toEqual([]);
    for (const sentence of ['Low spirits told against them.', 'Their high spirits carried them through.']) {
      expect(sentence).not.toMatch(/Brenna|hero-/);
    }
  });

  test('says a Regard band crossed, never the number', () => {
    for (const type of ['patron.regard-changed', 'guildmaster.regard-changed', 'hero.regard-changed'] as const) {
      expect(narrate(samples[type], narration)).not.toMatch(/\d/);
    }
    expect(narrate(samples['patron.regard-changed'], narration)).toBe(
      "Lady Maud's Regard for The Kestrel Guild fell from neutral to cool after a Quest of theirs failed.",
    );
  });

  test('says a Level gained without the points Potential took', () => {
    const allLost = event('hero.levelled', [heroId, guildId], { heroId, guildId, level: 20, statDeltas: {}, pointsLost: 3 });

    expect(narrate(allLost, narration)).toBe('Brenna Ashcombe reached Level 20.');
    expect(narrate(samples['hero.levelled'], narration)).toBe('Brenna Ashcombe reached Level 3: Courage +2, Strength +1.');
  });

  test('calls someone with no label by what they are, never by id', () => {
    const unlabelled = { ...samples['hero.recruited'], labels: {} };

    expect(narrate(unlabelled, narration)).toBe('A Guild signed a Hero for 110 Wealth.');
  });
});

describe('a played game narrates', () => {
  /** A new game, then a month of Turns in which the Rivals take and resolve Quests. */
  function played(): WorldDocument {
    const deps = { config: defaultConfig, content };
    let { document } = createWorld('narrate-played', { guildName: 'The Lantern', guildmasterName: 'Ada Vell', createdAt: 'test' }, deps);
    for (let turn = 0; turn < 90; turn += 1) document = advance(document, deps).document;
    return document;
  }

  test('every entry of its History as a sentence, Quests named from the History once their rows are gone', () => {
    const document = played();
    const narrated = narrationFor(document, content);
    const types = new Set(document.history.entries.map((entry) => entry.type));

    for (const entry of document.history.entries) expectASentence(narrate(entry as never, narrated));
    // The month reached Quests resolved and their rows removed, so the History named them.
    expect(types).toContain('quest.resolved');
    expect(document.history.entries.some((entry) => entry.type === 'quest.taken')).toBe(true);
  });

  test('questNamer reads a row, then the History, and says `a Quest` for an id neither knows', () => {
    const document = played();
    const name = questNamer(document, content);
    const onTheBoard = document.world.board[0];
    const resolved = document.history.entries.find((entry) => entry.type === 'quest.resolved');
    const gone = (resolved?.payload as { questId: QuestId; templateKey: string } | undefined) ?? null;

    if (onTheBoard !== undefined) {
      const row = document.world.quests[onTheBoard];
      expect(name(onTheBoard)).toBe(content.questTemplates[row?.templateKey ?? '']?.name);
    }
    expect(gone).not.toBeNull();
    expect(Object.hasOwn(document.world.quests, gone?.questId ?? '')).toBe(false);
    expect(name(gone?.questId as QuestId)).toBe(content.questTemplates[gone?.templateKey ?? '']?.name);
    expect(name('quest-999999' as QuestId)).toBe('a Quest');
  });
});

describe('narrateStop', () => {
  const { document } = createWorld('narrate-stop', { guildName: 'The Lantern', guildmasterName: 'Ada Vell', createdAt: 'test' }, { config: defaultConfig, content });
  const player = playerGuild(document.world);
  if (player === undefined) throw new Error('no player');
  const quest = document.world.board[0] as QuestId;
  const poolHero = Object.values(document.world.heroes).find((hero) => hero.unattachedSince !== null);
  const stops: { [Kind in StopReason['kind']]: [Extract<StopReason, { kind: Kind }>, RegExp] } = {
    ended: [{ kind: 'ended' }, /^Stopped: the game is over\.$/],
    'party-returned': [{ kind: 'party-returned', guildId: player.id, partyIds: [partyId] }, /^Stopped: The Lantern's Party came home\.$/],
    'decision-needed': [
      { kind: 'decision-needed', guildId: player.id, questIds: [quest] },
      /^Stopped: a decision is needed: The Lantern has no Party out, and could send one on [A-Z][^.]+\.$/,
    ],
    'below-floor': [
      { kind: 'below-floor', guildId: player.id, dueDay: 34 },
      /^Stopped: The Lantern fell below the Bankruptcy floor: Bankruptcy on the night of Day 34 unless its Wealth recovers by then\.$/,
    ],
    'quest-staffable': [
      { kind: 'quest-staffable', guildId: player.id, questIds: [quest] },
      /^Stopped: a Quest to staff: The Lantern's Heroes at home could go on [A-Z][^.]+\.$/,
    ],
    'transfer-offer': [{ kind: 'transfer-offer', guildId: player.id, offerIds: [offerId] }, /^Stopped: a Transfer Offer: an Offer since withdrawn\.$/],
    module: [{ kind: 'module', moduleId: 'probe' }, /^Stopped: the probe Module asked to stop\.$/],
    'max-turns': [{ kind: 'max-turns' }, /^Stopped: played the most Turns allowed, 1080\.$/],
    'pool-refreshed': [{ kind: 'pool-refreshed', heroIds: poolHero === undefined ? [] : [poolHero.id] }, /^Stopped: new in the Unattached pool: [A-Z].*\.$/],
  };

  test.each(Object.values(stops))('puts %j in words', (stop, words) => {
    const line = narrateStop(stop, document, 1080, narrationFor(document, content));

    expect(line).toMatch(words);
    expectASentence(line);
  });

  test('names a Transfer Offer standing by the Guild that makes it, its fee, the Hero and its last night (DL-74)', () => {
    const deps = { config: defaultConfig, content };
    const rival = Object.values(document.world.guilds).find((guild) => guild.id !== player.id);
    const heroId = player.rosterIds[0];
    if (rival === undefined || heroId === undefined) throw new Error('no Rival or Hero');
    const rich = structuredClone(document);
    (rich.world.guilds[rival.id] as { wealth: number }).wealth = 100_000;
    const offered = offerTransfer(rich, { guildId: rival.id, heroId }, deps);
    if (!offered.ok) throw new Error(`offerTransfer refused: ${offered.rejection.reason}`);
    const [offer] = Object.values(offered.document.world.offers);
    if (offer === undefined) throw new Error('no offer');

    const line = narrateStop({ kind: 'transfer-offer', guildId: player.id, offerIds: [offer.id] }, offered.document, 1080, narrationFor(offered.document, content));

    expect(offer.toGuildId).toBe(rival.id);
    expect(line).toBe(
      `Stopped: a Transfer Offer: ${rival.name} offers ${offer.fee} Wealth for ${offered.document.world.heroes[heroId]?.name} ` +
        `until the night of Day ${dayOf(offer.expiresOnTurn)}.`,
    );
  });
});
