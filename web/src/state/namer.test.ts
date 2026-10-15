// @vitest-environment node
import {
  advance,
  createWorld,
  defaultConfig,
  milestoneTypes,
  type EngineEventOf,
  type EngineEventType,
  type EntityId,
  type GuildId,
  type HeroId,
  type ItemId,
  type ModuleEvent,
  type OfferId,
  type PartyId,
  type QuestId,
  type StackId,
  type WorldDocument,
} from '@heroesim/engine';
import { narrate as sentenceOf, type Slot } from '@heroesim/words';
import { beforeAll, describe, expect, test } from 'vitest';
import { content } from '../content';
import { anId, expectASentence } from './game.test-support';
import { narrateSegments, narrateText, pageNamer, questNamer, resolvedWords, textOf, type Narration, type Segment } from './namer';
import { readingOf } from './reading';

// The page's Namer (DL-186 item 1) filling the narration's sentences (`@heroesim/words`):
// every sentence below is the page's as it was before the narration moved, word for word.
//
// The log's words: every event type in the engine's union has a sentence. The
// samples table's type is derived from the union, so a type the engine adds fails `npm run
// typecheck` here, as it does in the map, until both have it; at run time the union is enumerated
// by the engine's `milestoneTypes`, a record keyed by every event type.

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

const barrow = content.questTemplates['clear-the-barrow']?.name ?? 'clear-the-barrow';

/** Quests by the name of the one template the samples use. */
const narration: Narration = { content, questName: (id) => (id === questId ? barrow : 'a Quest'), calendar: { turnsPerYear: 1080 } };

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
  'guild.wages-paid': event('guild.wages-paid', [guildId], { guildId, amount: 40, wealthAfter: 460 }),
  'guild.hall-upkeep-paid': event('guild.hall-upkeep-paid', [guildId], {
    guildId,
    amount: 120,
    wealthAfter: 340,
    base: 30,
    heroCount: 6,
    heroes: 30,
    facilities: { infirmary: 60 },
    traitFactor: 1,
  }),
  'guild.below-floor': event('guild.below-floor', [guildId], { guildId, wealth: -35, floor: 0, dueDay: 34 }),
  'guild.floor-recovered': event('guild.floor-recovered', [guildId], { guildId, wealth: 12, floor: 0, belowFloorSince: 5 }),
  'hero.recruited': event('hero.recruited', [heroId, guildId], { heroId, guildId, fee: 110 }),
  'hero.left-pool': event('hero.left-pool', [heroId], { heroId }),
  'quest.offered': event('quest.offered', [questId, patronId], { questId, patronId: patronId as never, templateKey: 'clear-the-barrow', tier: 2 }),
  'quest.expired': event('quest.expired', [questId, patronId], { questId, patronId: patronId as never, templateKey: 'clear-the-barrow' }),
  'quest.taken': event('quest.taken', [questId, partyId, heroId, otherHeroId, guildId], {
    questId,
    partyId,
    guildId,
    heroIds: [heroId, otherHeroId],
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
    facility: 'training-yard',
    grade: 2,
    improvementKey: 'training-yard-2',
    cost: 500,
  }),
  'guild.captain-named': event('guild.captain-named', [guildId, heroId], { guildId, heroId, replacedId: null, lockedUntilTurn: null }),
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
    encounterIndex: 1,
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

describe('every event type in the engine\'s union has a sentence', () => {
  test.each(union)('%s reads as one sentence, naming whom it names and showing no id', (type) => {
    const line = narrateText(samples[type], narration);

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
 * The one sentence the page's tests hold end to end (DL-231 item 4): `words` holds every event type's
 * words and slots, and the page's Namer fills each slot in its own way; this sentence passes through
 * every kind the page fills differently, a Guild by its name, a Party by its Heroes, a Quest by its
 * name from the world, Items, and a date by the game's calendar.
 */
const endToEnd = `The Kestrel Guild sent Brenna Ashcombe and Aldred Barrowby on ${barrow}, back on the night of Year 1 Day 8, carrying ${named(content.items, 'whetstone')} ×2.`;

describe('one sentence end to end, through the page', () => {
  test('a Party sent reads word for word, as text and as segments', () => {
    expect(narrateText(samples['quest.taken'], narration)).toBe(endToEnd);
    expect(textOf(narrateSegments(samples['quest.taken'], narration))).toBe(endToEnd);
  });
});

/** The names a line marks, in its order: whom each opens, and the words it shows. */
function namesIn(segments: readonly Segment[]): [string, string][] {
  return segments.flatMap((segment) => (segment.kind === 'name' ? [[segment.entityId, segment.text] as [string, string]] : []));
}

describe('a line as segments: its words, and the names in it the page can open', () => {
  test.each(union)('%s marks only names of whom the event names, each by its label', (type) => {
    const segments = narrateSegments(samples[type], narration);

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
    // A Succession, each Guildmaster a name that opens their History.
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

    expect(textOf(narrateSegments(twin, narration))).toBe('Wren signed Wren for 1 Gold 10 Silver.');
    expect(namesIn(narrateSegments(twin, narration))).toEqual([
      [guildId, 'Wren'],
      [heroId, 'Wren'],
    ]);
  });

  test('leaves as words someone the event has no label for, capitalised where the line opens with them', () => {
    const unlabelled = { ...samples['hero.recruited'], labels: {} };

    expect(narrateSegments(unlabelled, narration)).toEqual([{ kind: 'text', text: 'A Guild signed a Hero for 1 Gold 10 Silver.' }]);
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

describe('a played game narrates', () => {
  /** A new game, then a month of Turns in which the Rivals take and resolve Quests: played once, and only read (ADR-0008). */
  let document: WorldDocument;
  beforeAll(() => {
    const deps = { config: defaultConfig, content };
    document = createWorld('narrate-played', { guildName: 'The Lantern', guildmasterName: 'Ada Vell', createdAt: 'test' }, deps).document;
    for (let turn = 0; turn < 90; turn += 1) document = advance(document, deps).document;
  });

  test('every entry of its History as a sentence, Quests named from the History once their rows are gone', () => {
    const narrated = readingOf(document).narration;
    const types = new Set(document.history.entries.map((entry) => entry.type));

    for (const entry of document.history.entries) expectASentence(narrateText(entry as never, narrated));
    // The month reached Quests resolved and their rows removed, so the History named them.
    expect(types).toContain('quest.resolved');
    expect(document.history.entries.some((entry) => entry.type === 'quest.taken')).toBe(true);
  });

  test('questNamer reads a row, then the History, and says `a Quest` for an id neither knows', () => {
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

describe("the page's Namer", () => {
  const namer = pageNamer(narration.questName);
  const guild: Slot = { kind: 'name', table: 'guilds', id: guildId, label: 'The Kestrel Guild' };
  const brenna: Slot = { kind: 'hero', table: 'heroes', id: heroId, label: 'Brenna Ashcombe' };
  const aldred: Slot = { kind: 'hero', table: 'heroes', id: otherHeroId, label: 'Aldred Barrowby' };
  const text = (words: string): Segment => ({ kind: 'text', text: words });

  test.each<[string, Slot, Segment[]]>([
    ['a Hero, as a name that opens their page, with no id', brenna, [{ kind: 'name', text: 'Brenna Ashcombe', entityId: heroId, table: 'heroes' }]],
    ['a Guild, as a name', guild, [{ kind: 'name', text: 'The Kestrel Guild', entityId: guildId, table: 'guilds' }]],
    ['a Hero with no label, by what they are', { kind: 'hero', table: 'heroes', id: heroId, label: undefined }, [text('a Hero')]],
    ['an id of no table, as someone', { kind: 'name', table: null, id: 'not-an-id' as never, label: undefined }, [text('someone')]],
    ['a labelled entity the page opens no page for, as words', { kind: 'name', table: 'quests', id: questId, label: 'The Long Road' }, [text('The Long Road')]],
    ['a Quest by the template the sentence gives', { kind: 'quest', id: 'quest-000099' as QuestId, template: 'Guard the caravan' }, [text('Guard the caravan')]],
    ['a Quest by its name from the world and the History, never its id', { kind: 'quest', id: questId, template: undefined }, [text(barrow)]],
    ["a Party as its Guild's", { kind: 'party', id: partyId, guild }, [{ kind: 'name', text: 'The Kestrel Guild', entityId: guildId, table: 'guilds' }, text("'s Party")]],
    [
      'a Party by its Heroes, each a name',
      { kind: 'party', id: partyId, heroes: [brenna, aldred] },
      [{ kind: 'name', text: 'Brenna Ashcombe', entityId: heroId, table: 'heroes' }, text(' and '), { kind: 'name', text: 'Aldred Barrowby', entityId: otherHeroId, table: 'heroes' }],
    ],
    ['a Party the sentence has already given its Guild', { kind: 'party', id: partyId }, [text('Party')]],
    ['an Offer accepted, in words', { kind: 'offer', id: offerId }, [text('its Transfer Offer')]],
    ['the ids a command takes, as nothing', { kind: 'ids', ids: [stackId, itemId] }, []],
  ])('names %s', (_name, slot, segments) => {
    expect(namer(slot)).toEqual(segments);
  });

  test("fills every slot of the narration's sentences, leaving no id and nothing unfilled", () => {
    for (const type of union) {
      const sentence = sentenceOf(samples[type], content, narration.calendar);
      const segments = narrateSegments(samples[type], narration);

      // Every name the event's participants give is a slot, never words the sentence wrote.
      for (const label of samples[type].participants.flatMap((id) => labels[id] ?? [])) {
        expect(sentence.some((part) => part.kind === 'text' && part.text.includes(label)), `${type}: ${label}`).toBe(false);
      }
      expect(textOf(segments), type).not.toMatch(anId);
      // Neighbouring words are one segment.
      segments.forEach((segment, index) => {
        if (segment.kind === 'text') expect(segments[index + 1]?.kind, type).not.toBe('text');
      });
    }
  });

  test("cuts a Party's outcome at its band, reading as the History reads it", () => {
    const { lead, band, rest } = resolvedWords(samples['quest.resolved'], narration);

    expect(`${textOf(lead)}${band}${textOf(rest)}`).toBe(narrateText(samples['quest.resolved'], narration));
    expect(band).toBe('failed');
    expect(lead[0]).toEqual({ kind: 'name', text: 'The Kestrel Guild', entityId: guildId, table: 'guilds' });
  });
});
