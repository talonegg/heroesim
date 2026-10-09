// @vitest-environment node
import { entriesFor, playerGuild, type EngineEventOf, type Guild, type TurnEvent, type WorldDocument } from '@heroesim/engine';
import { describe, expect, test } from 'vitest';
import { leavingTodayView, navCounts, partiesOutView, railView } from './digest';
import { cameHome as partyHome, changed, played, started, withOffer, withPartyOut, withReturn } from './game.test-support';
import { initialGameState, type GameState } from './reducer';
import { boardView, rosterRows, sortedRoster } from './selectors';
import { historyView, leftOutOfYourGuild } from './history';
import { narrateText, narrationFor } from './namer';
import { whenOfTurn } from '@heroesim/words';
import { content } from '../content';

// What the shell reads (M9-S3, DL-103): the counts on the navigation, the home view's digest and the
// History rail. Every number is a document field, an engine selector's answer or the last play's
// events, which the engine appended to the History as they are (ADR-0008).

function documentOf(state: GameState): WorldDocument {
  if (state.document === null) throw new Error('no game in hand');
  return state.document;
}

/** The last play's events, each as the History narrates it. */
function sentencesOf(state: GameState): string[] {
  const narration = narrationFor(documentOf(state), content);
  return state.log.map((event) => narrateText(event, narration));
}

function playerOf(state: GameState): Guild {
  const guild = playerGuild(documentOf(state).world);
  if (guild === undefined) throw new Error("no player's Guild");
  return guild;
}

describe('navCounts', () => {
  test('counts the Quests on offer, the Transfer Offers waiting and, after a new game, all its entries naming the Guild as new', () => {
    const state = started();
    const document = documentOf(state);

    expect(navCounts(state)).toEqual({
      quests: document.world.board.length,
      offers: 0,
      // Everything a new game's History holds came from the play that made it: all its Guild's History shows.
      fresh: historyView(document, state.log, null, 0).entries,
    });
    expect(navCounts(state).quests).toBeGreaterThan(0);
    expect(navCounts(withOffer(state)).offers).toBe(1);
  });

  test("counts as new only the last play's entries that name the player's Guild, as its History shows them: a Party sent is one, a purchase none (M9-F4)", () => {
    const sent = withPartyOut(started());
    expect(navCounts(sent).fresh).toBe(1);

    const bought = played(started(), { kind: 'buy', definitionKey: 'short-sword', quantity: 1 });
    expect(bought.rejection).toBeNull();
    expect(bought.log.map((event) => event.type)).toEqual(['item.bought']);
    expect(navCounts(bought).fresh).toBe(0);
  });

  test('counts a Party home as its History does: not its Heroes’ XP and Morale (M9-F4), nor the parts its one entry gathers (M9-F5)', () => {
    const state = partyHome(started('reducer-test'));
    const guild = playerOf(state);
    const naming = state.log.filter((event) => event.participants.includes(guild.id));
    // The owner's list: XP, Morale, the Regards, Upkeep, purchases and sales.
    const leftOut = ['hero.xp-gained', 'hero.morale-changed', 'patron.regard-changed', 'guildmaster.regard-changed', 'hero.regard-changed', 'guild.upkeep-paid', 'item.bought', 'item.sold'];
    // What a return's entry gathers: its Encounters and consumables; its Heroes' Levels that night; the dead's gear. Its
    // Injuries and Deaths stand out beside it, and count (M9-F7, DL-120 item 6).
    const home = naming.filter((event): event is EngineEventOf<'quest.resolved'> => event.type === 'quest.resolved').flatMap((event) => event.payload.heroIds);
    const gathered = (event: TurnEvent): boolean =>
      ['quest.encounter', 'item.expended'].includes(event.type) ||
      (event.type === 'hero.levelled' && home.includes((event as EngineEventOf<'hero.levelled'>).payload.heroId)) ||
      (event.type === 'item.returned' && (event as EngineEventOf<'item.returned'>).payload.cause === 'died');
    expect(naming.some((event) => event.type === 'hero.xp-gained')).toBe(true);
    expect(naming.some(gathered)).toBe(true);

    expect(navCounts(state).fresh).toBe(naming.filter((event) => !leftOut.includes(event.type) && !gathered(event)).length);
    expect(navCounts(state).fresh).toBe(historyView(documentOf(state), state.log, null, 0).fresh);
    expect([...leftOutOfYourGuild].sort()).toEqual([...leftOut].sort());
  });

  test('counts nothing before a game, and nothing new after a load', () => {
    expect(navCounts(initialGameState)).toEqual({ quests: 0, offers: 0, fresh: 0 });
    expect(navCounts({ ...started(), log: [] }).fresh).toBe(0);
  });
});

describe('partiesOutView', () => {
  test("names no Party before one is sent, and the player's Party once it is: its Quest, who went and the night it returns", () => {
    expect(partiesOutView(documentOf(started()))).toEqual([]);

    const state = withPartyOut(started());
    const rows = partiesOutView(documentOf(state));

    expect(rows).toHaveLength(1);
    const [row] = rows;
    // The History's own sentence for the dispatch names the same Heroes, Quest and night.
    const [sent] = sentencesOf(state);
    expect(sent).toBe(`The Lantern sent ${row?.heroes} on ${row?.quest}, back on ${row?.returns}.`);
    // And the Roster says each of them is away until that night.
    const away = sortedRoster(rosterRows(documentOf(state))).filter((hero) => hero.whereabouts === `Away with a Party, back on ${row?.returns}`);
    expect(away.map((hero) => hero.name).sort()).toEqual([...(row?.names ?? [])].sort());
  });

  test("names only the player's Parties: a Rival's are not the player's to wait for", () => {
    const state = played(withPartyOut(started()), { kind: 'advance', turns: 2 });
    const document = documentOf(state);
    const rivalsOut = Object.values(document.world.parties).filter((party) => party.guildId !== playerOf(state).id);
    expect(rivalsOut.length).toBeGreaterThan(0);

    expect(partiesOutView(document)).toHaveLength(1);
  });
});

describe('leavingTodayView', () => {
  test('names the Quests on the Board whose last Day on offer is today, as the Board names them', () => {
    const state = started();
    const board = boardView(documentOf(state));
    // A new Board's Quests stay on offer for Days to come.
    expect(board.every((card) => card.lastDay > 0)).toBe(true);
    expect(leavingTodayView(documentOf(state))).toEqual([]);

    const [first, second] = board;
    if (first === undefined || second === undefined) throw new Error('expected two Quests on the Board');
    // The first on offer through tonight, the first Day's night (Turn 2); the second through tomorrow's (Turn 5).
    const lastDays = changed(state, (document) => {
      const quests = document.world.quests;
      Object.assign(quests[first.questId] ?? {}, { expiresOnTurn: 2 });
      Object.assign(quests[second.questId] ?? {}, { expiresOnTurn: 5 });
    });

    expect(leavingTodayView(documentOf(lastDays))).toEqual([{ questId: first.questId, name: first.name, patron: first.patron, reward: first.reward }]);
  });
});

describe('railView', () => {
  test("gives the player's Guild's latest entries, newest first, as its History gives them, each new one marked", () => {
    const state = played(started(), { kind: 'advance', turns: 3 });
    const document = documentOf(state);
    const guild = playerOf(state);
    const narration = narrationFor(document, content);
    const history = entriesFor(document.history, guild.id)
      .filter((entry) => !leftOutOfYourGuild.has(entry.type))
      .map((entry) => ({ when: whenOfTurn(entry.turn, document.meta.config), sentence: narrateText(entry as never, narration) }));
    const rail = railView(state, 8);

    expect(rail?.guildName).toBe('The Lantern');
    // Whose Banner stands beside "Latest for {Guild}" (DL-125 item 7).
    expect(rail?.guildId).toBe(guild.id);
    expect(rail?.lines.map(({ when, sentence }) => ({ when, sentence }))).toEqual(history.slice(0, 8).map(({ when, sentence }) => ({ when, sentence })));
    // The last play was one Turn, the night of the first Day: its entries naming the Guild are the new ones.
    expect(rail?.fresh).toBe(navCounts(state).fresh);
    expect(rail?.lines.filter((line) => line.fresh).every((line) => line.when === 'Year 1 Day 1, night')).toBe(true);
  });

  test('marks a Party sent new and what came before it not, and nothing new after a load', () => {
    const sent = withPartyOut(started());
    const [first, second] = railView(sent, 5)?.lines ?? [];

    expect(first?.sentence).toMatch(/^The Lantern sent .+ on .+, back on the night of Year 1 Day \d+\.$/);
    expect(first?.fresh).toBe(true);
    expect(second?.fresh).toBe(false);
    expect(railView(sent, 5)?.fresh).toBe(1);
    expect(railView({ ...sent, log: [] }, 5)?.lines.some((line) => line.fresh)).toBe(false);
  });

  test("leaves out what the Guild's History leaves out: a purchase is not in it, and nothing is new (M9-F4)", () => {
    const bought = played(started(), { kind: 'buy', definitionKey: 'short-sword', quantity: 1 });
    const rail = railView(bought, 24);

    expect(rail?.lines.some((line) => / bought /.test(line.sentence))).toBe(false);
    expect(rail?.fresh).toBe(0);
    // A Party home: the rail holds its return, and none of its Heroes' XP or Morale.
    const home = partyHome(started('reducer-test'));
    const lines = railView(home, 24)?.lines ?? [];
    expect(lines.some((line) => / Party came home from /.test(line.sentence))).toBe(true);
    expect(lines.some((line) => / gained \d+ XP\.$/.test(line.sentence))).toBe(false);
    expect(lines.some((line) => /Morale/.test(line.sentence))).toBe(false);
    expect(lines).toHaveLength(Math.min(24, historyView(documentOf(home), [], null, 0).entries));
  });

  test('gives no rail before a game', () => {
    expect(railView(initialGameState, 5)).toBeNull();
  });

  test("keys a return's line by its Party, so the key holds as newer lines come in above it (the M9-F5 review)", () => {
    const written = withReturn(withPartyOut(started('rail-return')), { band: 'success', wealth: 10, xp: 5 });
    const keyOf = (state: GameState): string | undefined => railView(state, 24)?.lines.find((line) => line.questReturn !== null)?.key;
    const later = played(written.state, { kind: 'advance', turns: 3 });

    expect(keyOf(written.state)).toBe(`return-${written.party.partyId}`);
    expect(keyOf(later)).toBe(keyOf(written.state));
  });

  test("gives a Party's return as its one entry, the Loot next after it, then its Injuries and Deaths, and no Encounter (M9-F5; M9-F7)", () => {
    const written = withReturn(withPartyOut(started('rail-return')), {
      band: 'success',
      wealth: 150,
      fame: 2,
      xp: 40,
      encounters: [{ outcome: 'success' }, { outcome: 'failure', injured: [0] }],
      injuries: [{ hero: 0, typeKey: 'bruised-ribs', healsOnTurn: 999 }],
      deaths: [1],
      loot: [{ definitionKey: 'whetstone', quantity: 2 }],
    });
    const lines = railView(written.state, 24)?.lines ?? [];
    const at = lines.findIndex((line) => line.questReturn !== null);
    const [returned, next, injured, died] = [lines[at], lines[at + 1], lines[at + 2], lines[at + 3]];
    const [first, second] = written.party.heroIds.map((heroId) => documentOf(written.state).world.heroes[heroId]?.name ?? '');

    expect(returned?.questReturn?.key).toEqual({ partyId: written.party.partyId, questId: written.party.questId });
    expect(returned?.sentence).toMatch(/^The Lantern's Party came home from .+ and succeeded: Wealth \+150, Fame \+2\.$/);
    // The Loot is the next entry, read down the rail as it is in the History's order, though newer.
    expect(next?.sentence).toMatch(/^The Lantern found Loot on .+: 2 × Whetstone\.$/);
    expect(next?.questReturn).toBeNull();
    // Then the Injury and the Death, as they happened, each an entry of its own beside the return (DL-120 item 6).
    expect(injured?.sentence).toMatch(new RegExp(`^${first} was injured `));
    expect(died?.sentence).toMatch(new RegExp(`^${second} died `));
    expect(lines.filter((line) => line.questReturn !== null)).toHaveLength(1);
    expect(lines.some((line) => /\(Encounter \d+\)/.test(line.sentence))).toBe(false);
  });
});
