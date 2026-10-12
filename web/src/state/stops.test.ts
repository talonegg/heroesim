// @vitest-environment node
import { applyAction, createWorld, defaultConfig, playerGuild, type OfferId, type PartyId, type QuestId, type StopReason } from '@heroesim/engine';
import { describe, expect, test } from 'vitest';
import { coinWords, nightOfTurn } from '@heroesim/words';
import { content } from '../content';
import { expectASentence } from './game.test-support';
import { readingOf } from './reading';
import { stopText } from './stops';

// Why time stopped, in the page's words: the narration's sentence (`narrateStop` in
// `@heroesim/words`, DL-209) through the page's Namer, no id and no command, a sentence each.

const partyId = 'party-000004' as PartyId;
const offerId = 'offer-000001' as OfferId;

describe('stopText', () => {
  const { document } = createWorld('narrate-stop', { guildName: 'The Lantern', guildmasterName: 'Ada Vell', createdAt: 'test' }, { config: defaultConfig, content });
  const player = playerGuild(document.world);
  if (player === undefined) throw new Error('no player');
  const quest = document.world.board[0] as QuestId;
  const poolHero = Object.values(document.world.heroes).find((hero) => hero.unattachedSince !== null);
  // The stops whose sentence the page's Namer fills in a way of its own: one Party by its Guild's name, a
  // date by the game's calendar, an Offer since withdrawn. The others' words are `words`' (narrate.test.ts's
  // stops), and the Quest's and the Hero's names the test below holds exactly.
  const stops: [StopReason, RegExp][] = [
    [{ kind: 'party-returned', guildId: player.id, partyIds: [partyId] }, /^Stopped: The Lantern's Party came home\.$/],
    [
      { kind: 'below-floor', guildId: player.id, dueDay: 34 },
      /^Stopped: The Lantern fell below the Bankruptcy floor: Bankruptcy on the night of Year 1 Day 35 unless its Wealth recovers by then\.$/,
    ],
    [{ kind: 'transfer-offer', guildId: player.id, offerIds: [offerId] }, /^Stopped: a Transfer Offer: an Offer since withdrawn\.$/],
  ];

  test.each(stops)('puts %j in words', (stop, words) => {
    const line = stopText(stop, document, 1080, readingOf(document).narration);

    expect(line).toMatch(words);
    expectASentence(line);
  });

  test('counts the Parties, names each Quest and Hero, and gives no command, the button standing for it (DL-209)', () => {
    const narration = readingOf(document).narration;
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

    const line = stopText({ kind: 'transfer-offer', guildId: player.id, offerIds: [offer.id] }, offered.document, 1080, readingOf(offered.document).narration);

    expect(offer.toGuildId).toBe(rival.id);
    expect(line).toBe(
      `Stopped: a Transfer Offer: ${rival.name} offers ${coinWords(offer.fee)} for ${offered.document.world.heroes[heroId]?.name} ` +
        `until ${nightOfTurn(offer.expiresOnTurn, offered.document.meta.config)}.`,
    );
  });
});
