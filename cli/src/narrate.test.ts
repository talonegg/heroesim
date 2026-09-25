import {
  milestoneTypes,
  type EngineEventOf,
  type EngineEventType,
  type EntityId,
  type GuildId,
  type HeroId,
  type PartyId,
  type QuestId,
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

const labels: Record<string, string> = {
  [guildId]: 'The Kestrel Guild',
  [heroId]: 'Brenna Ashcombe',
  [patronId]: 'Lady Maud',
  [guildmasterId]: 'Osric Vane',
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
    expect(narrate(samples['quest.resolved'], content)).toContain('and failed: Wealth 0, Fame -2.');
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
  });

  test('says a Regard band crossed, never the number, and what moved a Patron (M4-S5)', () => {
    const patron = narrate(samples['patron.regard-changed'], content);
    const guildmaster = narrate(samples['guildmaster.regard-changed'], content);

    expect(patron).toBe("Lady Maud's Regard for The Kestrel Guild fell from neutral to cool after a Quest of theirs failed.");
    expect(guildmaster).toBe("Osric Vane's Regard for Brenna Ashcombe rose from neutral to warm.");
    for (const line of [patron, guildmaster]) expect(line).not.toMatch(/\d/);
  });

  test('says a Level gained without naming the points Potential took', () => {
    const allLost = event('hero.levelled', [heroId, guildId], { heroId, guildId, level: 20, statDeltas: {}, pointsLost: 3 });

    expect(narrate(allLost, content)).toBe('Brenna Ashcombe (hero-000007) reached Level 20.');
  });
});

describe('narrateStop', () => {
  const document = {
    world: {
      guilds: { [guildId]: { name: 'The Kestrel Guild' } },
      heroes: { [heroId]: { name: 'Brenna Ashcombe' } },
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
    [{ kind: 'max-turns' }, 'Stopped: played the most Turns allowed, 1080.'],
    [{ kind: 'pool-refreshed', heroIds: [heroId] }, 'Stopped: new in the Unattached pool: Brenna Ashcombe (hero-000007) (show pool).'],
  ])('puts %j in words', (stop, line) => {
    expect(narrateStop(stop, document, 1080)).toBe(line);
  });
});
