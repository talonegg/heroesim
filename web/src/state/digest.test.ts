import { entriesFor, playerGuild, type Guild, type WorldDocument } from '@heroesim/engine';
import { describe, expect, test } from 'vitest';
import { leavingTodayView, navCounts, outcomesView, partiesOutView, railView } from './digest';
import { cameHome as partyHome, changed, namesakes, played, started, withNamesakesHurt, withOffer, withPartyOut } from './game.test-support';
import { initialGameState, type GameState } from './reducer';
import { boardView, rosterView, whenOf } from './selectors';
import { historyView, leftOutOfYourGuild } from './history';
import { narrate, narrationFor } from './narrate';
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
  return state.log.map((event) => narrate(event, narration));
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

    const bought = played(started(), { kind: 'buy', definitionKey: 'padded-jack', quantity: 1 });
    expect(bought.rejection).toBeNull();
    expect(bought.log.map((event) => event.type)).toEqual(['item.bought']);
    expect(navCounts(bought).fresh).toBe(0);
  });

  test('counts a Party home as its History does: not its Heroes’ XP and Morale (M9-F4)', () => {
    const state = partyHome(started('reducer-test'));
    const guild = playerOf(state);
    const naming = state.log.filter((event) => event.participants.includes(guild.id));
    // The owner's list: XP, Morale, the Regards, Upkeep, purchases and sales.
    const leftOut = ['hero.xp-gained', 'hero.morale-changed', 'patron.regard-changed', 'guildmaster.regard-changed', 'hero.regard-changed', 'guild.upkeep-paid', 'item.bought', 'item.sold'];
    expect(naming.some((event) => event.type === 'hero.xp-gained')).toBe(true);

    expect(navCounts(state).fresh).toBe(naming.filter((event) => !leftOut.includes(event.type)).length);
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
    const away = rosterView(documentOf(state)).filter((hero) => hero.whereabouts === `away with a Party, back on ${row?.returns}`);
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
    // The first on offer through tonight, Day 0's night (Turn 2); the second through tomorrow's (Turn 5).
    const lastDays = changed(state, (document) => {
      const quests = document.world.quests;
      Object.assign(quests[first.questId] ?? {}, { expiresOnTurn: 2 });
      Object.assign(quests[second.questId] ?? {}, { expiresOnTurn: 5 });
    });

    expect(leavingTodayView(documentOf(lastDays))).toEqual([{ questId: first.questId, name: first.name, patron: first.patron, reward: first.reward }]);
  });
});

describe('outcomesView', () => {
  /** A Party of the player's sent, and fast forward played until it came home. */
  function cameHome(): GameState {
    let state = withPartyOut(started('reducer-test'));
    for (let tries = 0; tries < 5 && state.stoppedBecause?.kind !== 'party-returned'; tries += 1) {
      state = played(state, { kind: 'fastForward', until: [] });
    }
    expect(state.stoppedBecause?.kind).toBe('party-returned');
    return state;
  }

  test("gives nothing when no Party of the player's came home in the last play", () => {
    expect(outcomesView(started())).toEqual([]);
    expect(outcomesView(withPartyOut(started()))).toEqual([]);
    expect(outcomesView(initialGameState)).toEqual([]);
  });

  test("gives each Party of the player's that came home in the last play: its Quest, band, Wealth, Fame, XP and Injuries, as the log narrates them", () => {
    const state = cameHome();
    const rows = outcomesView(state);
    const sentences = sentencesOf(state);
    const homecomings = sentences.filter((sentence) => sentence.startsWith("The Lantern's Party came home from "));
    // Rivals' Parties came home in the same Turns; only the player's are its outcomes.
    expect(sentences.filter((sentence) => / Party came home from /.test(sentence)).length).toBeGreaterThan(homecomings.length);
    expect(rows).toHaveLength(homecomings.length);

    const bandWords = { fail: ['failed', 'Failure'], success: ['succeeded', 'Success'], strong: ['succeeded strongly', 'Strong success'] } as const;
    rows.forEach((row, index) => {
      const [went, words] = bandWords[row.band];
      expect(row.bandWords).toBe(words);
      const signed = (n: number) => (n > 0 ? `+${n}` : String(n));
      expect(homecomings[index]?.startsWith(`The Lantern's Party came home from ${row.quest} and ${went}: Wealth ${signed(row.wealth)}, Fame ${signed(row.fame)}.`)).toBe(true);
      expect(row.when).toMatch(/^Day \d+, night$/);
      // XP: each Hero who came home alive gained the same, which the log says Hero by Hero.
      for (const name of row.names.filter((each) => !row.deaths.some((death) => death.name === each))) {
        if (row.xp > 0) expect(sentences).toContain(`${name} gained ${row.xp} XP.`);
      }
      // Each Injury, as the log says it: the Hero, the Injury and the night it heals.
      for (const injury of row.injuries) {
        const [, name, rest] = /^(.+): (.+)$/.exec(injury.words) ?? [];
        expect(sentences).toContain(`${name} was injured (${rest?.replace(', healing on ', '), healing on ')}.`);
      }
    });
    const [sent] = partiesOutView(documentOf(withPartyOut(started('reducer-test'))));
    expect(rows[0]?.quest).toBe(sent?.quest);
    expect(rows[0]?.heroes).toBe(sent?.heroes);
  });

  test('tells two Heroes of one name apart: each death and Injury carries its Hero (the M9 review)', () => {
    const [row] = outcomesView(withNamesakesHurt(partyHome(started('reducer-test'))));
    const { died, injured, diedName, injuredName } = namesakes;
    const injury = content.injuries[Object.keys(content.injuries)[0] ?? '']?.name;

    expect(row?.deaths).toEqual([
      { heroId: died[0], name: diedName },
      { heroId: died[1], name: diedName },
    ]);
    expect(row?.injuries).toEqual([
      { heroId: injured[0], words: `${injuredName}: ${injury}, healing in 3 Days` },
      { heroId: injured[1], words: `${injuredName}: ${injury}, healing in 4 Days` },
    ]);
  });

  test("gives where each is read in the player's History: the page it stands on, and its line's anchor (M9-S5)", () => {
    const state = cameHome();
    const rows = outcomesView(state);

    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.page).not.toBeNull();
      const view = historyView(documentOf(state), state.log, null, row.page ?? 0);
      const lines = view.groups.flatMap((group) => group.rows.flatMap((each) => (each.kind === 'entry' ? [each.line] : [])));
      const line = lines.find((each) => each.anchor === row.anchor);
      expect(line?.sentence).toMatch(new RegExp(`^The Lantern's Party came home from ${row.quest} and `));
      expect(line?.fresh).toBe(true);
    }
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
      .map((entry) => ({ when: whenOf(entry.turn), sentence: narrate(entry as never, narration) }));
    const rail = railView(state, 8);

    expect(rail?.guildName).toBe('The Lantern');
    expect(rail?.lines.map(({ when, sentence }) => ({ when, sentence }))).toEqual(history.slice(0, 8).map(({ when, sentence }) => ({ when, sentence })));
    // The last play was one Turn, the night of Day 0: its entries naming the Guild are the new ones.
    expect(rail?.fresh).toBe(navCounts(state).fresh);
    expect(rail?.lines.filter((line) => line.fresh).every((line) => line.when === 'Day 0, night')).toBe(true);
  });

  test('marks a Party sent new and what came before it not, and nothing new after a load', () => {
    const sent = withPartyOut(started());
    const [first, second] = railView(sent, 5)?.lines ?? [];

    expect(first?.sentence).toMatch(/^The Lantern sent .+ on .+, back on the night of Day \d+\.$/);
    expect(first?.fresh).toBe(true);
    expect(second?.fresh).toBe(false);
    expect(railView(sent, 5)?.fresh).toBe(1);
    expect(railView({ ...sent, log: [] }, 5)?.lines.some((line) => line.fresh)).toBe(false);
  });

  test("leaves out what the Guild's History leaves out: a purchase is not in it, and nothing is new (M9-F4)", () => {
    const bought = played(started(), { kind: 'buy', definitionKey: 'padded-jack', quantity: 1 });
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
});
