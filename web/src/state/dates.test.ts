// @vitest-environment node
import { bankruptcyCountdown, nextUpkeepDay, playerGuild, retiresOn, type EngineEventOf, type Entry, type Guild, type Hero, type WorldDocument } from '@heroesim/engine';
import { describe, expect, test } from 'vitest';
import { content } from '../content';
import { partiesOutView } from './digest';
import { changed, played, started, withOffer, withPartyOut, withReturn } from './game.test-support';
import { saveFileName } from './game-file';
import { historyView } from './history';
import { narrationFor } from './namer';
import { questReturn } from './quest-return';
import { playDeps, type GameState } from './reducer';
import { rejectionSentence } from './rejections';
import { boardView, countdownView, headerView, heroPage, linesOf, partyRows, rosterRows, sentView } from './selectors';
import { offersView } from './trade-views';
import { ledgerPage, treasuryAccounts } from './treasury';
import { guildmasterView, guildsTable } from './world-views';

// Every date the page shows is by the game's own calendar, its `meta.config.turnsPerYear`, never
// this release's (DL-206 items 30 to 33, DL-210). Each view is read in a game whose Year is two
// Days, where a date past the second Day falls in another Year than a 1,080-Turn year gives it, so
// a view that reads this release's calendar, or the engine's Day from 0, fails here.

const turnsPerYear = 6;
/** The date of `turn` as a player reads it, counted here apart from the calendar the page uses. */
const dateIn = (turn: number): string => `Year ${Math.floor(turn / turnsPerYear) + 1} Day ${Math.floor((turn % turnsPerYear) / 3) + 1}`;
const nightIn = (turn: number): string => `the night of ${dateIn(turn)}`;
const times = ['morning', 'afternoon', 'night'] as const;
const whenIn = (turn: number): string => `${dateIn(turn)}, ${times[turn % 3]}`;

/** The Treasury's Upkeep and its ledger's first page, no filter chosen, as its page reads them (DL-214). */
function treasuryOf(document: WorldDocument) {
  const accounts = treasuryAccounts(document);
  return accounts === null ? null : { next: accounts.upkeep.next, rows: ledgerPage(accounts.ledger, { rows: accounts.ledger.changes, filtered: false }, 0).rows };
}

/** A new game whose Year is two Days. */
function shortYear(seed = 'dates'): GameState {
  return changed(started(seed), (document) => {
    document.meta.config = { ...document.meta.config, turnsPerYear };
  });
}

function documentOf(state: GameState): WorldDocument {
  if (state.document === null) throw new Error('no game in hand');
  return state.document;
}

function player(document: WorldDocument): Guild {
  return playerGuild(document.world) as Guild;
}

/** `state` played Turn by Turn until the world stands at `turn`. */
function playedTo(state: GameState, turn: number): GameState {
  let next = state;
  while (documentOf(next).world.turn < turn) next = played(next, { kind: 'advance' });
  return next;
}

describe("every date the page shows is by the game's own calendar (DL-210)", () => {
  test('the status bar: its date, the ending, the countdown and its pill', () => {
    const below = changed(shortYear(), (_, guild) => {
      guild.wealth = -5_000;
      guild.belowFloorSince = 13;
    });
    const document = documentOf(below);
    const countdown = bankruptcyCountdown(player(document), playDeps(document).config);
    if (countdown === null) throw new Error('no countdown');
    const due = nightIn(countdown.dueDay * 3);

    expect(headerView(document)?.due).toBe(`Bankruptcy on ${due}`);
    expect(countdownView(document)).toMatch(new RegExp(`since ${dateIn(12)}: Bankruptcy on ${due} unless`));

    const ended = changed(below, (each) => {
      each.world.turn = 13;
      each.world.ended = { turn: 13, reason: 'bankruptcy' };
    });
    expect(headerView(documentOf(ended))?.time).toBe(whenIn(13));
    expect(headerView(documentOf(ended))?.ended).toMatch(new RegExp(`^The game ended on ${dateIn(13)}: `));
  });

  test('the Board, a Party out, the Roster, the Party builder and a Hero', () => {
    const out = withPartyOut(shortYear());
    const document = documentOf(out);
    for (const card of boardView(document)) {
      const quest = document.world.quests[card.questId];
      if (quest === undefined) throw new Error(`no Quest ${card.questId}`);
      expect(card.until).toBe(`Until ${dateIn(quest.expiresOnTurn)}`);
    }
    const party = Object.values(document.world.parties).find((each) => each.guildId === player(document).id);
    if (party === undefined) throw new Error('no Party out');
    expect(party.returnsOnTurn).toBeGreaterThanOrEqual(turnsPerYear);
    expect(sentView(out)?.returns).toBe(nightIn(party.returnsOnTurn));
    expect(partiesOutView(document)[0]?.returns).toBe(nightIn(party.returnsOnTurn));
    const away = party.heroIds[0] as Hero['id'];
    const other = boardView(document)[0]?.questId;
    if (other === undefined) throw new Error('no Quest on the Board');
    expect(partyRows(document, other)?.find((row) => row.heroId === away)?.unavailable).toBe(`Away with a Party, back on ${nightIn(party.returnsOnTurn)}`);
    expect(heroPage(document, away)?.where.words).toBe(`Away with a Party, back on ${nightIn(party.returnsOnTurn)}`);
    expect(rosterRows(document).entries.find((entry) => entry.hero.id === away)?.row.whereabouts).toBe(`Away with a Party, back on ${nightIn(party.returnsOnTurn)}`);

    const injured = changed(shortYear(), (each, guild) => {
      (each.world.heroes[guild.rosterIds[0] as Hero['id']] as Hero).injury = { typeKey: 'sprained-ankle', healsOnTurn: 11 };
    });
    const hurt = documentOf(injured);
    expect(heroPage(hurt, player(hurt).rosterIds[0] as Hero['id'])?.where.words).toBe(`Injured, healing on ${nightIn(11)}`);
  });

  test('the History, its lines and the save’s file name, a Turn into the second Year', () => {
    const state = playedTo(shortYear(), 7);
    const document = documentOf(state);
    const { groups } = historyView(document, state.log, 'all', 0);
    expect(groups.length).toBeGreaterThan(0);
    for (const group of groups) expect(group.when).toBe(whenIn(Number(group.key)));
    expect(groups.some((group) => Number(group.key) >= turnsPerYear)).toBe(true);
    const entries: Entry[] = document.history.entries.filter((entry) => entry.turn >= turnsPerYear);
    expect(entries.length).toBeGreaterThan(0);
    for (const [index, line] of linesOf(entries, narrationFor(document, content)).entries()) expect(line.when).toBe(whenIn((entries[index] as Entry).turn));
    // A sentence's own date: a Party sent on the first afternoon comes back in another Year than this release's would say.
    const sent = document.history.entries
      .filter((entry): entry is EngineEventOf<'quest.taken'> => entry.type === 'quest.taken')
      .find((entry) => entry.payload.returnsOnTurn >= turnsPerYear);
    if (sent === undefined) throw new Error('no Party sent');
    expect(linesOf([sent], narrationFor(document, content))[0]?.sentence).toContain(`back on ${nightIn(sent.payload.returnsOnTurn)}`);
    expect(saveFileName(document)).toBe(`heroesim-dates-year-2-day-1.json`);
  });

  test("a Quest's report and the Treasury", () => {
    const written = withReturn(withPartyOut(shortYear()), { band: 'success', wealth: 10, xp: 5, injuries: [{ hero: 0, typeKey: 'sprained-ankle', healsOnTurn: 23 }] });
    const document = documentOf(written.state);
    const night = written.turn;
    expect(document.world.turn).toBe(night);
    expect(night).toBeGreaterThanOrEqual(turnsPerYear);
    const report = questReturn(document, { partyId: written.party.partyId, questId: written.party.questId });
    expect(report?.when).toBe(whenIn(night));
    expect(report?.night).toBe(nightIn(night));
    expect(JSON.stringify(report)).toContain(nightIn(23));

    const treasury = treasuryOf(document);
    expect(treasury?.next).toBe(nightIn(nextUpkeepDay(night, playDeps(document).config) * 3));
    expect(treasury?.rows.some((row) => row.when === whenIn(night))).toBe(true);

    // The opening row of a Guild founded later, as a replacement Rival is: its `guild.founded` moved to Turn 13.
    const later = changed(written.state, (each, guild) => {
      const founded = each.history.entries.find((entry) => entry.type === 'guild.founded' && entry.participants.includes(guild.id));
      if (founded === undefined) throw new Error('no founding');
      founded.turn = 13;
    });
    expect(treasuryOf(documentOf(later))?.rows.at(-1)).toMatchObject({ categoryWords: 'Opening balance', when: whenIn(13) });
  });

  test('an Offer, a fold, a Retirement and a refusal', () => {
    const offered = withOffer(shortYear());
    const offer = Object.values(documentOf(offered).world.offers)[0];
    if (offer === undefined) throw new Error('no Offer');
    expect(offersView(documentOf(offered))?.offers[0]?.sentence).toContain(`until ${nightIn(offer.expiresOnTurn)}.`);

    const folded = changed(shortYear(), (document, guild) => {
      const rival = Object.values(document.world.guilds).find((each) => each.id !== guild.id) as Guild;
      for (const heroId of rival.rosterIds) Object.assign(document.world.heroes[heroId] as Hero, { guildId: null, unattachedSince: 0 });
      rival.rosterIds = [];
      rival.foldedOnTurn = 13;
    });
    expect(guildsTable(documentOf(folded), 'fame').folded[0]?.folded).toBe(`Folded on ${dateIn(13)}`);

    const document = documentOf(shortYear());
    const guildmaster = document.world.guildmasters[player(document).guildmasterId];
    if (guildmaster === undefined) throw new Error('no Guildmaster');
    const night = retiresOn(guildmaster, document.world.turn, playDeps(document).config);
    expect(night).toBeGreaterThanOrEqual(turnsPerYear);
    expect(guildmasterView(document)?.retirement).toContain(`on ${nightIn(night)}:`);
    const over = changed(shortYear(), (each) => {
      each.world.turn = 13;
      each.world.ended = { turn: 13, reason: 'bankruptcy' };
    });
    expect(guildmasterView(documentOf(over))?.retirement).toBe(`Never retired: the game ended in Bankruptcy on ${dateIn(13)}.`);

    const heroId = player(document).rosterIds[0] as Hero['id'];
    expect(rejectionSentence({ action: 'transferOut', reason: 'recently-transferred', heroId, transferredOnTurn: 0, untilTurn: 90 }, document, content)).toContain(
      `was transferred on ${dateIn(0)} and cannot be transferred again before ${dateIn(90)}.`,
    );
    expect(rejectionSentence({ action: 'recruit', reason: 'game-ended', ending: { turn: 13, reason: 'bankruptcy' } }, document, content)).toMatch(
      new RegExp(`^The game ended on ${dateIn(13)}: `),
    );
  });
});

/** `state` with its `meta.config` lacking `turnsPerYear`, as a save from before a setting: its rules fill it forward (`playDeps`). */
function lacking(state: GameState): GameState {
  return changed(state, (document) => {
    const config: Record<string, unknown> = { ...document.meta.config };
    delete config['turnsPerYear'];
    document.meta.config = config as unknown as WorldDocument['meta']['config'];
  });
}

// The review (DL-210): the page reads its calendar from one place, the config the game plays under,
// `meta.config` checked and filled forward (`playDeps`), never `meta.config` as it stands. A game whose
// `meta.config` lacks `turnsPerYear` plays under this release's; every date site reads the same Year.
describe('every date the page shows reads the config the game plays under, filled forward', () => {
  test("a game whose meta.config lacks turnsPerYear: every date site as in one that holds it", () => {
    const written = withReturn(withPartyOut(started('filled')), { band: 'success', wealth: 10, xp: 5, injuries: [{ hero: 0, typeKey: 'sprained-ankle', healsOnTurn: 23 }] });
    const offered = withOffer(started('filled-offer'));
    const ended = changed(started('filled-ended'), (each, guild) => {
      const rival = Object.values(each.world.guilds).find((other) => other.id !== guild.id) as Guild;
      rival.foldedOnTurn = 13;
      each.world.turn = 13;
      each.world.ended = { turn: 13, reason: 'bankruptcy' };
    });
    const out = withPartyOut(written.state);

    /** Every date the page shows of the four games, as it shows it. */
    const datesOf = (game: { out: GameState; offered: GameState; ended: GameState }): string[] => {
      const document = documentOf(game.out);
      const player_ = player(document);
      const party = Object.values(document.world.parties).find((each) => each.guildId === player_.id);
      if (party === undefined) throw new Error('no Party out');
      const away = party.heroIds[0] as Hero['id'];
      const questId = boardView(document)[0]?.questId;
      if (questId === undefined) throw new Error('no Quest on the Board');
      const over = documentOf(game.ended);
      return [
        headerView(document)?.time ?? '',
        headerView(over)?.ended ?? '',
        ...boardView(document).map((card) => card.until),
        ...partiesOutView(document).map((each) => each.returns),
        sentView(game.out)?.returns ?? '',
        partyRows(document, questId)?.find((row) => row.heroId === away)?.unavailable ?? '',
        heroPage(document, away)?.where.words ?? '',
        ...rosterRows(document).entries.map((entry) => entry.row.whereabouts),
        ...historyView(document, game.out.log, 'all', 0).groups.map((group) => group.when),
        ...linesOf(document.history.entries, narrationFor(document, content)).map((line) => `${line.when}: ${line.sentence}`),
        saveFileName(document),
        JSON.stringify(questReturn(document, { partyId: written.party.partyId, questId: written.party.questId })),
        ...(treasuryOf(document)?.rows.map((row) => row.when) ?? []),
        treasuryOf(document)?.next ?? '',
        ...(offersView(documentOf(game.offered))?.offers.map((offer) => offer.sentence) ?? []),
        ...guildsTable(over, 'fame').folded.map((guild) => guild.folded ?? ''),
        guildmasterView(document)?.retirement ?? '',
        guildmasterView(over)?.retirement ?? '',
        rejectionSentence({ action: 'transferOut', reason: 'recently-transferred', heroId: away, transferredOnTurn: 0, untilTurn: 90 }, document, content) ?? '',
      ];
    };

    const held = datesOf({ out, offered, ended });
    expect(held.filter((date) => /Year 1 Day \d+|year-1-day-\d+/.test(date)).length).toBeGreaterThan(30);
    expect(documentOf(lacking(out)).meta.config).not.toHaveProperty('turnsPerYear');
    expect(datesOf({ out: lacking(out), offered: lacking(offered), ended: lacking(ended) })).toEqual(held);
  });
});
