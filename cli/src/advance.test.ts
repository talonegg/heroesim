import type { GuildId, HeroId, OfferId, PartyId, QuestId, StopReason, WorldDocument } from '@heroesim/engine';
import { describe, expect, test } from 'vitest';
import { stopLine } from './advance.js';

// Why a fast forward stopped, in the CLI's words (DL-101, DL-209): the narration's sentence
// (`narrateStop` in `@heroesim/words`, DL-209) with the ids the CLI's commands take and the command
// that answers.

const guildId = 'guild-000002' as GuildId;
const heroId = 'hero-000007' as HeroId;
const questId = 'quest-000003' as QuestId;
const partyId = 'party-000004' as PartyId;
const rivalId = 'guild-000003' as GuildId;
const offerId = 'offer-000001' as OfferId;
const terms = { offerId, fromGuildId: guildId, toGuildId: rivalId, heroId, fee: 420 };

describe('stopLine', () => {
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
      'Stopped: a Transfer Offer: The Iron Wardens offers 420 Wealth for Brenna Ashcombe (hero-000007) until the night of Year 1 Day 8 ' +
        '(offer-000001). Answer with accept --offer <id> or decline --offer <id> (show offers).',
    ],
    [
      { kind: 'transfer-offer', guildId, offerIds: ['offer-000002' as OfferId, offerId] },
      'Stopped: a Transfer Offer: offer-000002 and The Iron Wardens offers 420 Wealth for Brenna Ashcombe (hero-000007) until the night of ' +
        'Year 1 Day 8 (offer-000001). Answer with accept --offer <id> or decline --offer <id> (show offers).',
    ],
    [
      { kind: 'below-floor', guildId, dueDay: 34 },
      'Stopped: The Kestrel Guild fell below the Bankruptcy floor: Bankruptcy on the night of Year 1 Day 35 unless its Wealth recovers by then.',
    ],
    [
      { kind: 'quest-staffable', guildId, questIds: [questId, 'quest-000008' as QuestId] },
      "Stopped: a Quest to staff: The Kestrel Guild's Heroes at home could go on quest-000003 and quest-000008 (show board).",
    ],
    [{ kind: 'module', moduleId: 'probe' }, 'Stopped: the probe Module asked to stop.'],
    [{ kind: 'max-turns' }, 'Stopped: played the most Turns allowed, 1080.'],
    [{ kind: 'pool-refreshed', heroIds: [heroId] }, 'Stopped: new in the Unattached pool: Brenna Ashcombe (hero-000007) (show pool).'],
  ])('puts %j in words', (stop, line) => {
    expect(stopLine(stop, document, 1080, { turnsPerYear: 1080 })).toBe(line);
  });
});
