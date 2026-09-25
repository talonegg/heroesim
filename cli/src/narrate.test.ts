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

const outcome = { score: 40, ratio: 1.1, xpPerHero: 30, injuries: [], deaths: [] };

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
