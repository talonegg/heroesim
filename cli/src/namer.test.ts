import {
  createWorld,
  defaultConfig,
  milestoneTypes,
  playerGuild,
  type Guild,
  type Hero,
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
// commands take. `words/src/narrate.test.ts` holds every sentence's words and slots; here, every
// type's line, one sentence end to end, and each slot in the CLI's words (DL-231 item 4, DL-248).

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
  'guild.founded': event('guild.founded', [guildId, guildmasterId], { guildId, guildmasterId: guildmasterId as never, wealth: 500 }),
  'guildmaster.generated': event('guildmaster.generated', [guildmasterId, guildId], { guildmasterId: guildmasterId as never, guildId }),
  'hero.generated': event('hero.generated', [heroId], { heroId, guildId: null, classKey: 'rogue' }),
  'patron.generated': event('patron.generated', [patronId], { patronId: patronId as never, sphereKey: 'crown' }),
  'world.rules-adopted': event('world.rules-adopted', [], { oldConfigVersion: 1, newConfigVersion: 2 }),
  'guild.upkeep-paid': event('guild.upkeep-paid', [guildId], { guildId, amount: 40, wealthAfter: 460 }),
  'guild.below-floor': event('guild.below-floor', [guildId], { guildId, wealth: -35, floor: 0, dueDay: 34 }),
  'guild.floor-recovered': event('guild.floor-recovered', [guildId], { guildId, wealth: 12, floor: 0, belowFloorSince: 5 }),
  'hero.recruited': event('hero.recruited', [heroId, guildId], { heroId, guildId, fee: 110 }),
  'hero.left-pool': event('hero.left-pool', [heroId], { heroId }),
  'quest.offered': event('quest.offered', [questId, patronId], { questId, patronId: patronId as never, templateKey: 'clear-the-barrow', tier: 2 }),
  'quest.expired': event('quest.expired', [questId, patronId], { questId, patronId: patronId as never, templateKey: 'clear-the-barrow' }),
  'quest.taken': event('quest.taken', [questId, partyId, heroId, guildId], {
    questId,
    partyId,
    guildId,
    heroIds: [heroId],
    returnsOnTurn: 23,
    tier: 2,
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
    degree: 'failure',
    decidedBy: 'steel',
    checks: [{ key: 'steel', capability: 15, roll: 14.5, target: 18, margin: -3.5, degree: 'failure' }],
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
    questId,
    before: 45,
    after: 35,
    bandBefore: 'steady',
    bandAfter: 'low',
  }),
  'hero.fatigue-changed': event('hero.fatigue-changed', [heroId], { heroId, before: 48, after: 54, bandBefore: 'weary', bandAfter: 'tired' }),
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
    questId,
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
    questId,
    before: 3.5,
    after: 4.5,
    bandBefore: 'neutral',
    bandAfter: 'warm',
  }),
  'hero.regard-changed': event('hero.regard-changed', [heroId, otherHeroId, guildId], {
    heroId,
    entityId: otherHeroId,
    cause: 'shared-quest',
    questId,
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

  // One sentence end to end (DL-231 item 4): `words` holds every sentence's words and slots, and
  // the Namer's table below each slot in the CLI's words.
  test('reads a sentence end to end: content keys by content, a Hero by name and the id the commands take', () => {
    expect(narrateLine(samples['hero.healed'], content, calendar)).toBe(
      `Brenna Ashcombe (hero-000007) recovered from ${content.injuries['deep-cut']?.name}, left ${content.heroTraits['scarred']?.name}.`,
    );
  });

  test('says a Level gained without naming the points Potential took', () => {
    const allLost = event('hero.levelled', [heroId, guildId], { heroId, guildId, level: 20, statDeltas: {}, pointsLost: 3 });

    expect(narrateLine(allLost, content, calendar)).toBe('Brenna Ashcombe (hero-000007) reached Level 20.');
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
    // A stop's slots (DL-209): its Parties, and the command that answers it.
    ["a stop's one Party, as a noun", { kind: 'parties', ids: [partyId], form: 'noun' }, 'Party'],
    ["a stop's Parties, as a noun", { kind: 'parties', ids: [partyId, 'party-000009' as PartyId], form: 'noun' }, 'Parties'],
    ["a stop's Parties, by the ids the commands take", { kind: 'parties', ids: [partyId, 'party-000009' as PartyId], form: 'ids' }, ': party-000004 and party-000009'],
    ["a stop's Parties, none", { kind: 'parties', ids: [], form: 'ids' }, ''],
    ['the Board to look at', { kind: 'command', command: 'show-board' }, ' (show board)'],
    ['the pool to look at', { kind: 'command', command: 'show-pool' }, ' (show pool)'],
    ['an Offer to answer', { kind: 'command', command: 'answer-offer' }, ' Answer with accept --offer <id> or decline --offer <id> (show offers).'],
    // Every other command a refusal points to (DL-240), which the refusals' table holds in words alone (DL-248).
    ["another Guild's Roster to look at", { kind: 'command', command: 'show-rosters' }, ' (show roster <guildId>)'],
    ['the Market to look at', { kind: 'command', command: 'show-market' }, ' (show market)'],
    ['the Offers to look at', { kind: 'command', command: 'show-offers' }, ' (show offers)'],
    ['what the Roster holds', { kind: 'command', command: 'roster-holds' }, ': show roster lists what it holds'],
    ['what the Market holds', { kind: 'command', command: 'market-holds' }, ' (show market lists what it holds)'],
    ['who the pool holds', { kind: 'command', command: 'pool-holds' }, '; show pool lists who is'],
    ["the Guildmaster's name to give", { kind: 'command', command: 'name-guildmaster' }, ': --master <name>'],
    ['a Portrait of the Sex to choose', { kind: 'command', command: 'portrait-sex' }, ': choose a Portrait of that Sex, or leave out --sex'],
  ])('names %s', (_name, slot, words) => {
    expect(cliNamer(slot)).toBe(words);
  });
});

// The refusals' table (`@heroesim/words`, DL-240) in the CLI's words, a row for each kind of slot
// the CLI words its own way: a Hero by name and the id the commands take, a command to use, and an
// entry of `new` by its flag (DL-248). `words/src/refusals.test.ts` holds the table's words and slots
// for every kind, the Namer's table above each slot, and the commands' tests that each command
// refuses with them.
describe("the CLI's words for a refusal", () => {
  const { document } = createWorld(
    'rejection-words',
    { guildName: 'The Lantern', guildmasterName: 'Ada Vell', createdAt: '2026-09-27T09:00:00.000Z' },
    { config: defaultConfig, content },
  );
  const { world } = document;
  const player = playerGuild(world) as Guild;
  const hero = world.heroes[player.rosterIds[0] as Hero['id']] as Hero;
  const [questId] = world.board;
  const quest = world.quests[questId as QuestId];
  const questName = quest === undefined ? '' : content.questTemplates[quest.templateKey]?.name;

  test.each<[Refusal, string]>([
    // DL-264: a Quest by its name and the id the commands take.
    [
      { action: 'dispatch', reason: 'fame-below-minimum', guildId: player.id, questId: questId as QuestId, tier: 3, fameMinimum: 20, fame: 12 },
      `${questName} (${questId}) is a Tier 3 Quest, open to a Guild of 20 Fame or more; The Lantern has 12, 8 short.`,
    ],
    [{ action: 'unequip', reason: 'slot-empty', heroId: hero.id, slot: 'trinket' }, `${hero.name} (${hero.id})'s trinket slot is empty.`],
    [{ action: 'newGame', reason: 'guild-name-blank' }, 'The Guild needs a name: --guild <name>.'],
    [{ action: 'newGame', reason: 'age-out-of-range', age: 51, min: 21, max: 50 }, 'A Guildmaster starts aged 21 to 50, in whole Years; --age 51 is not.'],
  ])('%j', (refusal, words) => {
    expect(refusalLine(refusal, { world, content, calendar: defaultConfig })).toBe(words);
  });
});
