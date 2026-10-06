import { applyAction, createWorld, defaultConfig, playerGuild, type OfferId, type PartyId, type QuestId, type StopReason } from '@heroesim/engine';
import { describe, expect, test } from 'vitest';
import { nightOfTurn } from '@heroesim/words';
import { content } from '../content';
import { narrationFor } from './namer';
import { stopText } from './stops';

// Why time stopped, in the page's words (M7-S3): the narration's sentence (`narrateStop` in
// `@heroesim/words`, DL-209) through the page's Namer, no id and no command, a sentence each.

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

describe('stopText', () => {
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
      /^Stopped: The Lantern fell below the Bankruptcy floor: Bankruptcy on the night of Year 1 Day 35 unless its Wealth recovers by then\.$/,
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
    const line = stopText(stop, document, 1080, narrationFor(document, content));

    expect(line).toMatch(words);
    expectASentence(line);
  });

  test('counts the Parties, names each Quest and Hero, and gives no command, the button standing for it (DL-209)', () => {
    const narration = narrationFor(document, content);
    const said = (stop: StopReason): string => stopText(stop, document, 1080, narration);
    const parties = ['party-000004', 'party-000005', 'party-000006'] as PartyId[];

    expect(said({ kind: 'party-returned', guildId: player.id, partyIds: parties })).toBe("Stopped: The Lantern's 3 Parties came home.");
    expect(said({ kind: 'decision-needed', guildId: player.id, questIds: [quest] })).toBe(
      `Stopped: a decision is needed: The Lantern has no Party out, and could send one on ${narration.questName(quest)}.`,
    );
    expect(said({ kind: 'quest-staffable', guildId: player.id, questIds: [quest] })).toBe(
      `Stopped: a Quest to staff: The Lantern's Heroes at home could go on ${narration.questName(quest)}.`,
    );
    if (poolHero === undefined) throw new Error('no Hero in the pool');
    expect(said({ kind: 'pool-refreshed', heroIds: [poolHero.id] })).toBe(`Stopped: new in the Unattached pool: ${poolHero.name}.`);
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

    const line = stopText({ kind: 'transfer-offer', guildId: player.id, offerIds: [offer.id] }, offered.document, 1080, narrationFor(offered.document, content));

    expect(offer.toGuildId).toBe(rival.id);
    expect(line).toBe(
      `Stopped: a Transfer Offer: ${rival.name} offers ${offer.fee} Wealth for ${offered.document.world.heroes[heroId]?.name} ` +
        `until ${nightOfTurn(offer.expiresOnTurn, offered.document.meta.config)}.`,
    );
  });
});
