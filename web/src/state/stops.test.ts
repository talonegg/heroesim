import { applyAction, createWorld, dayOf, defaultConfig, playerGuild, type OfferId, type PartyId, type QuestId, type StopReason } from '@heroesim/engine';
import { describe, expect, test } from 'vitest';
import { content } from '../content';
import { narrationFor } from './namer';
import { narrateStop } from './stops';

// Why time stopped, in the page's words (M7-S3): the CLI's adapted, no id and no command, a sentence
// each (v1.1.6-S12 moved it beside the page's Namer, its words the same).

const partyId = 'party-000004' as PartyId;
const offerId = 'offer-000001' as OfferId;
/** An entity id, which a sentence here never shows: the player types none. */
const anId = /\b(guild|guildmaster|hero|patron|quest|party|offer|item|stack)-\d{6}\b/;

/** What a sentence in the page must be: one line, a full stop, no id, nothing left unfilled. */
function expectASentence(line: string): void {
  expect(line).toMatch(/^[A-Z0-9].*\.$/);
  expect(line).not.toContain('\n');
  expect(line).not.toMatch(/undefined|null|NaN|\[object/);
  expect(line).not.toMatch(anId);
}

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
    const offered = applyAction(rich, { kind: 'offerTransfer', guildId: rival.id, heroId }, deps);
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
