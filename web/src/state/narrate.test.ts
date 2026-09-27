import {
  advance,
  createWorld,
  defaultConfig,
  milestoneTypes,
  playerGuild,
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
import { describe, expect, test } from 'vitest';
import { content } from '../content';
import { narrate, narratedTypes, narrateStop, narrationFor, questNamer, type Narration } from './narrate';

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

describe("the CLI's words, adapted for the page", () => {
  test('names content keys by content, Heroes by name, and Quests by their template', () => {
    expect(narrate(samples['quest.offered'], narration)).toBe(`Lady Maud offered ${barrow}.`);
    expect(narrate(samples['hero.healed'], narration)).toBe('Brenna Ashcombe recovered from Deep cut, left Scarred.');
    expect(narrate(samples['hero.declined'], narration)).toBe('Brenna Ashcombe, at 41, lost 1 Endurance to age.');
    expect(narrate(samples['hero.died'], narration)).toBe(`Brenna Ashcombe died on ${barrow}.`);
    expect(narrate(samples['quest.taken'], narration)).toBe(
      `The Kestrel Guild sent Brenna Ashcombe and Aldred Barrowby on ${barrow}, back on the night of Day 7, carrying Whetstone ×2.`,
    );
    expect(narrate(samples['quest.encounter'], narration)).toBe(
      `The Kestrel Guild's Party failed at ${content.encounters['ambush-on-the-road']?.name} (Encounter 2): Brenna Ashcombe was injured.`,
    );
    expect(narrate(samples['quest.resolved'], narration)).toMatch(/came home from .+ and failed: Wealth 0, Fame -2\.$/);
    expect(narrate(samples['item.bought'], narration)).toBe('The Kestrel Guild bought 3 × Whetstone at the Market for 75 Wealth.');
    expect(narrate(samples['hero.transferred'], narration)).toBe(
      'The Iron Wardens took Brenna Ashcombe from The Kestrel Guild for 420 Wealth, accepting its Transfer Offer.',
    );
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
    'transfer-offer': [{ kind: 'transfer-offer', guildId: player.id, offerIds: [offerId] }, /^Stopped: a Transfer Offer: an offer since withdrawn\.$/],
    'max-turns': [{ kind: 'max-turns' }, /^Stopped: played the most Turns allowed, 1080\.$/],
    'pool-refreshed': [{ kind: 'pool-refreshed', heroIds: poolHero === undefined ? [] : [poolHero.id] }, /^Stopped: new in the Unattached pool: [A-Z].*\.$/],
  };

  test.each(Object.values(stops))('puts %j in words', (stop, words) => {
    const line = narrateStop(stop, document, 1080, narrationFor(document, content));

    expect(line).toMatch(words);
    expectASentence(line);
  });
});
