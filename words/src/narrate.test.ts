import { loadContent } from '@heroesim/content/node';
import {
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
  type StopReason,
  type World,
} from '@heroesim/engine';
import { describe, expect, test } from 'vitest';
import type { Calendar } from './calendar.js';
import { crossed, itemsWords, narrate, narratedTypes, narrateStop, resolvedParts, sentenceText, type Namer, type Sentence, type Slot } from './narrate.js';

// v1.1.6-S12 (DL-186 item 1): the narration, one sentence for each event type, its names as slots.
// Each sentence is read here through a Namer of the test's own, which writes each slot as what it
// holds, `<hero:hero-000007|Brenna Ashcombe>`, so the table pins the words and the slots apart from
// either front end's names for them; `cli/src/namer.test.ts` and `web/src/state/namer.test.ts` hold
// the CLI's and the page's.

const content = loadContent();

/** The game's calendar, a Year of 360 Days: its dates read `Year 1 Day 8` (DL-210). */
const calendar: Calendar = { turnsPerYear: 1080 };

const guildId = 'guild-000002' as GuildId;
const heroId = 'hero-000007' as HeroId;
const questId = 'quest-000003' as QuestId;
const partyId = 'party-000004' as PartyId;
const patronId = 'patron-000005';
const guildmasterId = 'guildmaster-000002';
const successorId = 'guildmaster-000007';
const otherHeroId = 'hero-000009' as HeroId;
const stackId = 'stack-000004' as StackId;
const itemId = 'item-000002' as ItemId;
const rivalId = 'guild-000003' as GuildId;
const offerId = 'offer-000001' as OfferId;
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
  return { type, turn: 9, participants: participants as EntityId[], labels: named, milestone: milestoneTypes[type], payload } as EngineEventOf<Type>;
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
  'quest.encounter': event('quest.encounter', [questId, partyId, guildId, heroId, otherHeroId], {
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
    died: [otherHeroId],
  }),
  'quest.resolved': event('quest.resolved', [questId, partyId, heroId, guildId], {
    ...outcome,
    band: 'strong',
    wealthDelta: 150,
    fameDelta: 5,
    questId,
    partyId,
    guildId,
    heroIds: [heroId],
    templateKey: 'guard-the-caravan',
    synergyKeys: ['shield-wall'],
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
  'hero.morale-changed': event('hero.morale-changed', [heroId], { heroId, cause: 'roster-death', before: 45, after: 35, bandBefore: 'steady', bandAfter: 'low' }),
  'hero.healed': event('hero.healed', [heroId], { heroId, typeKey: 'deep-cut', traitKey: 'scarred' }),
  'hero.trait-gained': event('hero.trait-gained', [heroId, questId], { heroId, traitKey: 'scarred', questId, encounterIndex: 1, encounterKey: 'ambush-on-the-road' }),
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
  'guild.improved': event('guild.improved', [guildId], { guildId, facility: 'quarters', grade: 2, improvementKey: 'quarters-2', cost: 500 }),
  'hero.levelled': event('hero.levelled', [heroId, guildId], { heroId, guildId, level: 3, statDeltas: { strength: 1, courage: 2 }, pointsLost: 0 }),
  'patron.regard-changed': event('patron.regard-changed', [patronId, guildId], {
    patronId: patronId as never,
    guildId,
    cause: 'offer-expired',
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
    cause: 'module',
    moduleId: 'probe',
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
    days: 1,
  }),
  'item.equipped': event('item.equipped', [heroId, guildId, stackId], { heroId, guildId, slot: 'weapon', definitionKey: 'arming-sword', itemId: null, stackId }),
  'item.unequipped': event('item.unequipped', [heroId, guildId, itemId], { heroId, guildId, slot: 'trinket', definitionKey: 'lantern-of-stannary', itemId, stackId: null }),
  'item.returned': event('item.returned', [heroId, guildId, stackId], {
    heroId,
    guildId,
    slot: 'armour',
    definitionKey: 'mail-shirt',
    itemId: null,
    stackId,
    cause: 'guild-folded',
  }),
  'item.bought': event('item.bought', [guildId], { guildId, definitionKey: 'whetstone', quantity: 3, unitPrice: 25, cost: 75, itemIds: [] }),
  'item.sold': event('item.sold', [guildId, 'item-000002'], {
    guildId,
    definitionKey: 'barrow-kings-blade',
    quantity: 1,
    unitPrice: 300,
    proceeds: 300,
    itemIds: ['item-000002' as never],
    cause: 'fold',
  }),
  'hero.transferred': event('hero.transferred', [heroId, guildId, rivalId, offerId], { heroId, fromGuildId: guildId, toGuildId: rivalId, fee: 420, offerId }),
  'guild.transfer-offered': event('guild.transfer-offered', [offerId, heroId, guildId, rivalId], { ...terms, expiresOnTurn: 23 }),
  'guild.transfer-offer-declined': event('guild.transfer-offer-declined', [offerId, heroId, guildId, rivalId], terms),
  'guild.transfer-offer-expired': event('guild.transfer-offer-expired', [offerId, heroId, guildId, rivalId], { ...terms, cause: 'hero-left' }),
  'guild.wealth-changed': event('guild.wealth-changed', [guildId], { guildId, moduleId: 'probe', before: 500, after: 750 }),
};

/** The test's Namer: each slot as what it holds, `<kind:id|label>`. */
const shown: Namer<string> = (slot: Slot): string => {
  switch (slot.kind) {
    case 'hero':
    case 'name':
      return `<${slot.kind}:${slot.id}${slot.label === undefined ? '' : `|${slot.label}`}>`;
    case 'quest':
      return `<quest:${slot.id}${slot.template === undefined ? '' : `|${slot.template}`}>`;
    case 'party': {
      const by = slot.heroes !== undefined ? ` with ${slot.heroes.map(shown).join(', ')}` : slot.guild === undefined ? '' : ` of ${shown(slot.guild)}`;
      return `<party:${slot.id}${by}>`;
    }
    case 'offer':
      return `<offer:${slot.id}${slot.withdrawn === true ? ' withdrawn' : ''}>`;
    case 'ids':
      return `<ids:${slot.ids.join(', ')}>`;
    case 'parties':
      return `<parties:${slot.form}:${slot.ids.join(', ')}>`;
    case 'command':
      return `<command:${slot.command}>`;
    case 'date':
    case 'entry':
      return `<${slot.kind}:unexpected>`;
  }
};

/** Content's name for `key` in `rows`. */
function named(rows: Readonly<Record<string, { name: string }>>, key: string): string {
  const row = rows[key];
  if (row === undefined) throw new Error(`the content has no ${key}`);
  return row.name;
}

const kestrel = `<name:${guildId}|The Kestrel Guild>`;
const wardens = `<name:${rivalId}|The Iron Wardens>`;
const brenna = `<hero:${heroId}|Brenna Ashcombe>`;
const aldred = `<hero:${otherHeroId}|Aldred Barrowby>`;
const maud = `<name:${patronId}|Lady Maud>`;
const osric = `<name:${guildmasterId}|Osric Vane>`;
const barrow = `<quest:${questId}|${named(content.questTemplates, 'clear-the-barrow')}>`;

/** Every event type's sentence: its words, and each slot where it stands. */
const sentences: { [Type in EngineEventType]: string } = {
  'world.created': 'The world was made from seed demo.',
  'guild.founded': `${kestrel} was founded.`,
  'guildmaster.generated': `${osric} leads ${kestrel}.`,
  'hero.generated': `${brenna}, ${named(content.classes, 'rogue')}, joined the Unattached pool.`,
  'patron.generated': `${maud} of the ${named(content.spheres, 'crown')} became a Patron.`,
  'world.rules-adopted': 'The rules moved from configVersion 1 to 2.',
  'guild.upkeep-paid': `${kestrel} paid 40 Upkeep, leaving 460 Wealth.`,
  'guild.below-floor': `${kestrel}'s Wealth, -35, fell below the Bankruptcy floor of 0: Bankruptcy on the night of Year 1 Day 35 unless it is back to 0 or more on a night by then.`,
  'guild.floor-recovered': `${kestrel}'s Wealth, 12, is back to the Bankruptcy floor of 0 or more, after falling below it on Year 1 Day 2: no Bankruptcy is due.`,
  'hero.recruited': `${kestrel} signed ${brenna} for 110 Wealth.`,
  'hero.left-pool': `${brenna} left the Unattached pool.`,
  'quest.offered': `${maud} offered ${barrow}.`,
  'quest.expired': `${maud}'s ${barrow} expired untaken.`,
  'quest.taken': `${kestrel} sent <party:${partyId} with ${brenna}, ${aldred}> on <quest:${questId}>, back on the night of Year 1 Day 8, carrying ${named(content.items, 'whetstone')} ×2.`,
  'quest.encounter': `<party:${partyId} of ${kestrel}> failed at ${named(content.encounters, 'ambush-on-the-road')} (Encounter 2), a Failure: ${brenna} was injured and ${aldred} was killed.`,
  'quest.resolved': `${kestrel}'s <party:${partyId}> came home from <quest:${questId}|${named(content.questTemplates, 'guard-the-caravan')}> and succeeded strongly: Wealth +150, Fame +5. Synergies: ${named(content.synergies, 'shield-wall')}.`,
  'quest.loot': `${kestrel} found Loot on <quest:${questId}>: ${named(content.items, 'barrow-kings-blade')}<ids:item-000006>.`,
  'hero.injured': `${brenna} was injured (${named(content.injuries, 'deep-cut')}), healing on the night of Year 1 Day 14.`,
  'hero.died': `${brenna} died on <quest:${questId}>.`,
  'hero.xp-gained': `${brenna} gained 30 XP.`,
  'hero.morale-changed': `${brenna}'s Morale went from 45 to 35, low.`,
  'hero.healed': `${brenna} recovered from ${named(content.injuries, 'deep-cut')}, left ${named(content.heroTraits, 'scarred')}.`,
  'hero.trait-gained': `${brenna} earned the Trait ${named(content.heroTraits, 'scarred')} on <quest:${questId}>, at ${named(content.encounters, 'ambush-on-the-road')}.`,
  'hero.trait-lost': `${brenna} lost the Trait ${named(content.heroTraits, 'lame')}, replaced by ${named(content.heroTraits, 'scarred')}.`,
  'hero.retired': `${brenna} retired from ${kestrel} at 51.`,
  'hero.declined': `${brenna}, at 41, lost 1 ${named(content.stats, 'endurance')} to age.`,
  'game.ended': `The game ended: ${kestrel} went bankrupt.`,
  'guild.folded': `${kestrel} had its Roster wiped out and folded.`,
  'guildmaster.succeeded': `${osric} retired at 65 as Guildmaster of ${kestrel}, and <name:${successorId}|Wenna Tolley> succeeded them.`,
  'hero.left-guild': `${brenna} left ${kestrel} for the Unattached pool.`,
  'guild.improved': `${kestrel} built ${named(content.improvements, 'quarters-2')} for 500 Wealth: its quarters are now grade 2.`,
  'hero.levelled': `${brenna} reached Level 3: ${named(content.stats, 'courage')} +2, ${named(content.stats, 'strength')} +1.`,
  'patron.regard-changed': `${maud}'s Regard for ${kestrel} fell from neutral to cool when an Offer of theirs went untaken.`,
  // A Hero a Guildmaster's Regard is for is a Hero slot (v1.1.7-S3, DL-209); a Patron or a Guildmaster a name.
  'guildmaster.regard-changed': `${osric}'s Regard for ${brenna} rose from neutral to warm.`,
  'hero.regard-changed': `${brenna}'s Regard for ${aldred} rose from warm to close through a Module.`,
  'item.expended': `${kestrel}'s <party:${partyId}> used one ${named(content.items, 'healing-draught')} on ${brenna}: their Injury heals 1 Day sooner.`,
  'item.equipped': `${kestrel} put ${named(content.items, 'arming-sword')}<ids:${stackId}> in ${brenna}'s weapon slot.`,
  'item.unequipped': `${kestrel} took ${named(content.items, 'lantern-of-stannary')}<ids:${itemId}> from ${brenna}'s trinket slot.`,
  'item.returned': `${named(content.items, 'mail-shirt')}<ids:${stackId}> went back to ${kestrel} from ${brenna} as the Guild folded.`,
  'item.bought': `${kestrel} bought 3 × ${named(content.items, 'whetstone')}<ids:> at the Market for 75 Wealth.`,
  'item.sold': `${kestrel}'s ${named(content.items, 'barrow-kings-blade')}<ids:item-000002> went to the Market for 300 Wealth as the Guild folded.`,
  'hero.transferred': `${wardens} took ${brenna} from ${kestrel} for 420 Wealth, accepting <offer:${offerId}>.`,
  'guild.transfer-offered': `${wardens} offered ${kestrel} 420 Wealth for ${brenna}<ids:${offerId}>, until the night of Year 1 Day 8.`,
  'guild.transfer-offer-declined': `${kestrel} declined ${wardens}'s Offer for ${brenna}<ids:${offerId}>.`,
  'guild.transfer-offer-expired': `${wardens}'s Offer for ${brenna}<ids:${offerId}> lapsed: the Hero left that Roster.`,
  'guild.wealth-changed': `${kestrel}'s Wealth went from 500 to 750.`,
};

/** Every event type in the engine's union, enumerated by a record the engine keys by each. */
const union = Object.keys(milestoneTypes).sort() as EngineEventType[];

/** The event types the narration has no sentence for on purpose: none. A type put here must be argued for. */
const notNarrated: readonly EngineEventType[] = [];

describe('every event type in the engine\'s union has a sentence', () => {
  test('the map has words for exactly the union, less those listed as not narrated, and the table covers them', () => {
    expect([...narratedTypes].sort()).toEqual(union.filter((type) => !notNarrated.includes(type)));
    expect(notNarrated).toEqual([]);
    expect(Object.keys(sentences).sort()).toEqual(union);
    expect(union.length).toBeGreaterThanOrEqual(40);
  });

  test.each(union)('%s: its words, and each name as a slot', (type) => {
    expect(sentenceText(narrate(samples[type], content, calendar), shown)).toBe(sentences[type]);
  });

  test.each(union)('%s: neighbouring words are one piece, and every slot names what the event names', (type) => {
    const sentence = narrate(samples[type], content, calendar);

    sentence.forEach((part, index) => {
      if (part.kind === 'text') expect(sentence[index + 1]?.kind).not.toBe('text');
    });
    for (const part of sentence) {
      if (part.kind === 'name' || part.kind === 'hero' || part.kind === 'quest' || part.kind === 'party' || part.kind === 'offer') {
        expect(samples[type].participants).toContain(part.id);
      }
    }
  });
});

describe('the variations of a sentence', () => {
  /** A sample of `type` with its payload changed. */
  function varied<Type extends EngineEventType>(type: Type, change: Partial<EngineEventOf<Type>['payload']>): EngineEventOf<Type> {
    const sample = samples[type] as EngineEventOf<Type>;
    return { ...sample, payload: { ...sample.payload, ...change } } as EngineEventOf<Type>;
  }
  const said = (event: EngineEventOf<EngineEventType>): string => sentenceText(narrate(event, content, calendar), shown);

  test.each([
    ['a Hero made on a Roster', varied('hero.generated', { guildId }), new RegExp(`joined ${kestrel}\\.$`)],
    ['a Party that came through, carrying nothing', varied('quest.taken', { consumables: [] }), /, back on the night of Year 1 Day 8\.$/],
    ['an Encounter come through, a Triumph decided by a Check its content does not name', varied('quest.encounter', { outcome: 'success', injured: [], died: [], degree: 'triumph', decidedBy: 'no-such-check', checks: [] }), / came through .+ \(Encounter 2\), a Triumph, decided by no-such-check\.$/],
    ['an Encounter form decided', varied('quest.encounter', { formDecided: 'lowered', degree: 'setback', decidedBy: 'x', checks: [{ key: 'x', capability: 1, roll: 1, target: 2, margin: -1, degree: 'setback', formDecided: 'lowered' }] }), /\. Low spirits told against them\.$/],
    ['a common Item found, by its stack', varied('quest.loot', { definitionKey: 'healing-draught', quantity: 3, itemId: null, stackId: 'stack-000008' as StackId }), /: 3 × .+<ids:stack-000008>\.$/],
    ['a Hero healed who kept no Trait', varied('hero.healed', { traitKey: null }), new RegExp(`^${brenna} recovered from [^,]+\\.$`)],
    ['a Level with no Stat risen', varied('hero.levelled', { statDeltas: {} }), new RegExp(`^${brenna} reached Level 3\\.$`)],
    ['a sale of the player\'s own', varied('item.sold', { cause: 'sale' }), new RegExp(`^${kestrel} sold .+<ids:item-000002> at the Market for 300 Wealth\\.$`)],
    ['a Transfer with no Offer', varied('hero.transferred', { offerId: null }), /for 420 Wealth\.$/],
    ['a consumable that bonused a Check', varied('item.expended', { effect: 'bonus', encounterIndex: 2, flat: 3 } as never), /used one .+ on Encounter 3: \+3 to its Check\.$/],
    ['a consumable that tried an Encounter again', varied('item.expended', { effect: 'reroll', encounterIndex: 0, firstRoll: 4 } as never), /used one .+ to try Encounter 1 again\.$/],
    ['gear with neither id', varied('item.equipped', { stackId: null }), /<ids:> in /],
  ] as const)('%s', (_name, event, sentence) => {
    expect(said(event as EngineEventOf<EngineEventType>)).toMatch(sentence);
  });

  test("a module's own event, by its Module, its type and whom it concerns, a Hero as a Hero", () => {
    const moduleEvent = (type: string, participants: string[]): ModuleEvent =>
      ({ type, turn: 9, participants, labels: Object.fromEntries(participants.flatMap((id) => (labels[id] === undefined ? [] : [[id, labels[id]]]))), milestone: false, payload: {} }) as unknown as ModuleEvent;

    expect(sentenceText(narrate(moduleEvent('probe.fired', [heroId, patronId, guildId]), content, calendar), shown)).toBe(`The probe Module recorded probe.fired for ${brenna}, ${maud} and ${kestrel}.`);
    expect(sentenceText(narrate(moduleEvent('weather.storm-broke', []), content, calendar), shown)).toBe('The weather Module recorded weather.storm-broke.');
    expect(sentenceText(narrate(moduleEvent('mystery', ['hero-000099', 'not-an-id']), content, calendar), shown)).toBe('A Module recorded mystery for <hero:hero-000099> and <name:not-an-id>.');
    const parts = narrate(moduleEvent('mystery', ['not-an-id']), content, calendar);
    expect(parts.find((part) => part.kind === 'name')).toMatchObject({ table: null, id: 'not-an-id', label: undefined });
  });
});

describe("a Party's outcome cut at its band", () => {
  test('reads as its sentence, the band apart', () => {
    const { lead, band, rest } = resolvedParts(samples['quest.resolved'], content);
    const whole: Sentence = narrate(samples['quest.resolved'], content, calendar);

    expect(`${sentenceText(lead, shown)}${band}${sentenceText(rest, shown)}`).toBe(sentenceText(whole, shown));
    expect(band).toBe('succeeded strongly');
  });
});

describe('the words beside the sentences', () => {
  test.each([
    ['neutral', 'warm', 'rose from neutral to warm'],
    ['cool', 'hostile', 'fell from cool to hostile'],
    ['close', 'warm', 'fell from close to warm'],
  ] as const)('a Regard band crossed: %s to %s', (before, after, words) => {
    expect(crossed(before, after)).toBe(words);
  });

  test('Items by name and count', () => {
    expect(itemsWords(content, 'whetstone', 1)).toBe(named(content.items, 'whetstone'));
    expect(itemsWords(content, 'whetstone', 3)).toBe(`3 × ${named(content.items, 'whetstone')}`);
    expect(itemsWords(content, 'no-such-item', 2)).toBe('2 × no-such-item');
  });
});

describe("a Guildmaster's Regard names whom it is for by what they are (v1.1.7-S3, DL-209, DL-206 item 13)", () => {
  const regard = samples['guildmaster.regard-changed'];
  const forwhom = (entityId: string): string => sentenceText(narrate({ ...regard, labels: { ...regard.labels, [entityId]: labels[entityId] as string }, payload: { ...regard.payload, entityId: entityId as never } }, content, calendar), shown);

  test('a Hero is a Hero slot, so the CLI adds the id and the page links', () => {
    expect(narrate(regard, content, calendar)).toContainEqual({ kind: 'hero', table: 'heroes', id: heroId, label: 'Brenna Ashcombe' });
  });

  test('a Patron and another Guildmaster are name slots', () => {
    expect(forwhom(patronId)).toBe(`${osric}'s Regard for ${maud} rose from neutral to warm.`);
    expect(forwhom(successorId)).toBe(`${osric}'s Regard for <name:${successorId}|Wenna Tolley> rose from neutral to warm.`);
  });
});

describe('why a fast forward stopped, nine sentences (v1.1.7-S3, DL-209, DL-206 item 2)', () => {
  const offer = { id: offerId, kind: 'transfer', ...terms, offeredOnTurn: 16, expiresOnTurn: 23 };
  const world = {
    guilds: { [guildId]: { name: 'The Kestrel Guild' }, [rivalId]: { name: 'The Iron Wardens' } },
    heroes: { [heroId]: { name: 'Brenna Ashcombe' } },
    offers: { [offerId]: offer },
  } as unknown as Pick<World, 'guilds' | 'heroes' | 'offers'>;
  const kest = `<name:${guildId}|The Kestrel Guild>`;
  const quests = [questId, 'quest-000008' as QuestId, 'quest-000009' as QuestId];
  const questSlots = `<quest:${questId}>, <quest:quest-000008> and <quest:quest-000009>`;

  test.each<[StopReason, string]>([
    [{ kind: 'ended' }, 'Stopped: the game is over.'],
    [{ kind: 'party-returned', guildId, partyIds: [partyId] }, `Stopped: ${kest}'s <parties:noun:${partyId}> came home<parties:ids:${partyId}>.`],
    [
      { kind: 'party-returned', guildId, partyIds: [partyId, 'party-000009' as PartyId] },
      `Stopped: ${kest}'s <parties:noun:${partyId}, party-000009> came home<parties:ids:${partyId}, party-000009>.`,
    ],
    [
      { kind: 'below-floor', guildId, dueDay: 34 },
      `Stopped: ${kest} fell below the Bankruptcy floor: Bankruptcy on the night of Year 1 Day 35 unless its Wealth recovers by then.`,
    ],
    [
      { kind: 'decision-needed', guildId, questIds: quests },
      `Stopped: a decision is needed: ${kest} has no Party out, and could send one on ${questSlots}<command:show-board>.`,
    ],
    [
      { kind: 'quest-staffable', guildId, questIds: [questId, 'quest-000008' as QuestId] },
      `Stopped: a Quest to staff: ${kest}'s Heroes at home could go on <quest:${questId}> and <quest:quest-000008><command:show-board>.`,
    ],
    [
      { kind: 'transfer-offer', guildId, offerIds: [offerId] },
      `Stopped: a Transfer Offer: <name:${rivalId}|The Iron Wardens> offers 420 Wealth for ${brenna} until the night of Year 1 Day 8<ids:${offerId}>.<command:answer-offer>`,
    ],
    [
      { kind: 'transfer-offer', guildId, offerIds: ['offer-000002' as OfferId, offerId] },
      `Stopped: a Transfer Offer: <offer:offer-000002 withdrawn> and <name:${rivalId}|The Iron Wardens> offers 420 Wealth for ${brenna} until the night of Year 1 Day 8<ids:${offerId}>.<command:answer-offer>`,
    ],
    [{ kind: 'module', moduleId: 'probe' }, 'Stopped: the probe Module asked to stop.'],
    [{ kind: 'max-turns' }, 'Stopped: played the most Turns allowed, 1080.'],
    [{ kind: 'pool-refreshed', heroIds: [heroId, 'hero-000008' as HeroId] }, `Stopped: new in the Unattached pool: ${brenna} and <hero:hero-000008><command:show-pool>.`],
  ])('puts %j in words', (stop, line) => {
    expect(sentenceText(narrateStop(stop, world, 1080, calendar), shown)).toBe(line);
  });

  test('a Guild whose row is gone is a name slot with no label', () => {
    const slot = narrateStop({ kind: 'below-floor', guildId: 'guild-000009' as GuildId, dueDay: 3 }, world, 1080, calendar).find((part) => part.kind === 'name');
    expect(slot).toEqual({ kind: 'name', table: 'guilds', id: 'guild-000009', label: undefined });
  });
});

describe("a date in a sentence reads the game's own calendar (DL-210, DL-206 items 30 to 33)", () => {
  const week: Calendar = { turnsPerYear: 21 };
  const nowhere = { guilds: {}, heroes: {}, offers: {} } as unknown as Pick<World, 'guilds' | 'heroes' | 'offers'>;

  test("an event's night, from a Turn, in a Year of 7 Days", () => {
    expect(sentenceText(narrate(samples['hero.injured'], content, week), shown)).toMatch(/, healing on the night of Year 2 Day 7\.$/);
  });

  test("a stop's night, from a Day as the engine counts it, in a Year of 7 Days", () => {
    expect(sentenceText(narrateStop({ kind: 'below-floor', guildId, dueDay: 34 }, nowhere, 1080, week), shown)).toContain('Bankruptcy on the night of Year 5 Day 7 unless');
  });
});
