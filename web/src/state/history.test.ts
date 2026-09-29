import {
  advance,
  append,
  createHistory,
  createWorld,
  dayOf,
  defaultConfig,
  entriesBetween,
  entriesFor,
  holdings,
  milestoneTypes,
  playerGuild,
  timeOfDay,
  type EngineEventOf,
  type Entry,
  type Guild,
  type GuildId,
  type HeroId,
  type TurnEvent,
  type WorldDocument,
} from '@heroesim/engine';
import { describe, expect, test } from 'vitest';
import { content } from '../content';
import { cameHome, played as playedState, started, withPartyOut, withTheGone, withWorldNews } from './game.test-support';
import {
  findInHistory,
  historyChoices,
  historyFilter,
  historySearchLimit,
  historyTitle,
  historyView,
  pageOfEntry,
  routineKinds,
  type HistoryLine,
  type HistoryRow,
  type HistoryView,
} from './history';
import { listed } from './narrate';
import { historyPageSize } from './selectors';

// The History as the one place to read what happened (M9-S5, DL-105): a page of it grouped by Day
// and time of day, newest first, each group in the order it happened; a Party's Encounters folded
// under its outcome, each Rival's routine under one line a Guild; every line marked whose it is,
// whether the last play appended it and, for an outcome, how it went. Every expectation is read from
// the engine's own History readers (`entriesBetween`, `entriesFor`), never worked out as the
// selector works it out.

const deps = { config: defaultConfig, content };
const setup = { guildName: 'The Lantern', guildmasterName: 'Ada Vell', createdAt: '2026-09-27T09:00:00.000Z' };

/** A new game from `seed`, then `turns` Turns, and the events of the last of them. */
function played(turns: number, seed = 'history-view'): { document: WorldDocument; log: TurnEvent[] } {
  let document = createWorld(seed, setup, deps).document;
  let log: TurnEvent[] = [];
  for (let turn = 0; turn < turns; turn += 1) {
    const result = advance(document, deps);
    document = result.document;
    log = result.events;
  }
  return { document, log };
}

function playerOf(document: WorldDocument): Guild {
  const guild = playerGuild(document.world);
  if (guild === undefined) throw new Error('no player');
  return guild;
}

/** The History entry a line is, by its key: its place in the History. */
function entryOf(document: WorldDocument, line: HistoryLine): Entry {
  const entry = document.history.entries[Number(line.key)];
  if (entry === undefined) throw new Error(`no entry at ${line.key}`);
  return entry;
}

/** Every line of a row: the steps folded under an outcome, then the outcome; or a routine fold's lines. */
function linesOf(row: HistoryRow): HistoryLine[] {
  return row.kind === 'entry' ? [...row.steps, row.line] : row.lines;
}

/** Every entry a page shows, folded or not. */
function entriesOn(document: WorldDocument, view: HistoryView): Entry[] {
  return view.groups.flatMap((group) => group.rows.flatMap(linesOf)).map((line) => entryOf(document, line));
}

// ── The History's scopes (M9-F4, DL-111 item 4, DL-112 item 7, DL-113 item 1) ────────────────

/** What the player's Guild's History leaves out: the owner's list (DL-111 item 4). */
const leftOutOfYours = [
  'hero.xp-gained',
  'hero.morale-changed',
  'patron.regard-changed',
  'guildmaster.regard-changed',
  'hero.regard-changed',
  'guild.upkeep-paid',
  'item.bought',
  'item.sold',
];

/** What a Rival's History leaves out (DL-111 item 4). */
const leftOutOfARival = ['guild.upkeep-paid', 'item.bought', 'item.sold'];

/** What the World History takes (DL-112 item 7, DL-113 item 1). */
const worldTypes = [
  'world.created',
  'world.rules-adopted',
  'guild.founded',
  'guild.folded',
  'guildmaster.succeeded',
  'game.ended',
  'quest.taken',
  'quest.resolved',
  'patron.regard-changed',
];

/** Every page of `whose` History in `document`. */
function pagesOf(document: WorldDocument, log: readonly TurnEvent[], whose: Parameters<typeof historyView>[2]): HistoryView[] {
  const { pages } = historyView(document, log, whose, 0);
  return Array.from({ length: pages }, (_, page) => historyView(document, log, whose, page));
}

/** Every entry `whose` History shows, folded or not, over all its pages, by its place in the History, newest first. */
function shownIn(document: WorldDocument, log: readonly TurnEvent[], whose: Parameters<typeof historyView>[2]): Entry[] {
  return pagesOf(document, log, whose)
    .flatMap((view) => view.groups.flatMap((group) => group.rows.flatMap(linesOf)))
    .sort((a, b) => Number(b.key) - Number(a.key))
    .map((line) => entryOf(document, line));
}

/** `entityId`'s entries, newest first, less the types `leftOut` names. */
function entriesLeaving(document: WorldDocument, entityId: Parameters<typeof entriesFor>[1], leftOut: readonly string[]): Entry[] {
  return entriesFor(document.history, entityId).filter((entry) => !leftOut.includes(entry.type));
}

/**
 * The parts of the player's Guild's returns, which its History gathers under each return's one entry
 * (M9-F5, DL-111 item 2, DL-113 item 1): each Encounter and consumable used, each Injury and Death
 * the Quest names, and, that night, its Heroes' Levels and the gear of its dead back to the Guild.
 */
function returnParts(document: WorldDocument, guildId: GuildId): Set<Entry> {
  const parts = new Set<Entry>();
  for (const outcome of entriesFor(document.history, guildId).filter((entry) => entry.type === 'quest.resolved')) {
    const { questId, heroIds, deaths } = (outcome as EngineEventOf<'quest.resolved'>).payload;
    for (const entry of entriesFor(document.history, questId)) {
      if (['quest.encounter', 'item.expended', 'hero.injured', 'hero.died'].includes(entry.type)) parts.add(entry);
    }
    for (const entry of entriesBetween(document.history, outcome.turn, outcome.turn + 1)) {
      const { heroId, cause } = entry.payload as { heroId?: HeroId; cause?: string };
      if (heroId === undefined) continue;
      if (entry.type === 'hero.levelled' && heroIds.includes(heroId)) parts.add(entry);
      if (entry.type === 'item.returned' && cause === 'died' && deaths.includes(heroId)) parts.add(entry);
    }
  }
  return parts;
}

/** The player's Guild's entries as its History shows them, newest first: less the types it leaves out, and less its returns' parts. */
function inYourGuild(document: WorldDocument, guildId: GuildId): Entry[] {
  const parts = returnParts(document, guildId);
  return entriesLeaving(document, guildId, leftOutOfYours).filter((entry) => !parts.has(entry));
}

describe("the Guilds' filters (M9-F4, DL-111 item 4)", () => {
  // A purchase and its sale, then a Party sent and fifty Days played: every type the filters name.
  const bought = playedState(started('app-test'), { kind: 'buy', definitionKey: 'padded-jack', quantity: 1 });
  const guildId = playerOf(bought.document as WorldDocument).id;
  const jack = holdings((bought.document as WorldDocument).world, { kind: 'guild', id: guildId }).stacks.find((stack) => stack.definitionKey === 'padded-jack');
  const sold = playedState(bought, { kind: 'sell', stackId: jack?.id ?? ('stack-000000' as never), quantity: 1 });
  const state = playedState(withPartyOut(sold), { kind: 'advance', turns: 150 });
  // Games share their History as it is appended (ADR-0008), so another game for a Party's return.
  const home = cameHome(started('history-home'));
  const document = state.document as WorldDocument;
  const guild = playerOf(document);
  const rivals = Object.values(document.world.guilds).filter((each) => each.controller.kind === 'rival');

  test('the game holds what the filters leave out, for the player and the Rivals', () => {
    expect(bought.rejection).toBeNull();
    expect(sold.rejection).toBeNull();
    const yours = new Set(entriesFor(document.history, guild.id).map((entry) => entry.type));
    for (const type of ['hero.xp-gained', 'hero.morale-changed', 'guild.upkeep-paid', 'item.bought', 'item.sold']) expect(yours, type).toContain(type);
    const theirs = new Set(rivals.flatMap((rival) => entriesFor(document.history, rival.id).map((entry) => entry.type)));
    for (const type of ['guild.upkeep-paid', 'item.bought']) expect(theirs, type).toContain(type);
  });

  test("the player's Guild's History leaves out exactly XP, Morale, the three Regards, Upkeep, purchases and sales, and a return's parts (M9-F5)", () => {
    expect(shownIn(document, state.log, null)).toEqual(inYourGuild(document, guild.id));
    expect(historyView(document, state.log, null, 0).entries).toBe(inYourGuild(document, guild.id).length);
  });

  test("a return's line carries its entry in the player's Guild's History, and in no other History (M9-F5)", () => {
    const home = cameHome(started('history-parts'));
    const homeDocument = home.document as WorldDocument;
    const lines = (whose: Parameters<typeof historyView>[2]): HistoryLine[] =>
      pagesOf(homeDocument, home.log, whose).flatMap((view) => view.groups.flatMap((group) => group.rows.flatMap(linesOf)));
    const outcomes = lines(null).filter((line) => line.type === 'quest.resolved');

    expect(outcomes.length).toBeGreaterThan(0);
    for (const line of outcomes) {
      const { partyId, questId } = entryOf(homeDocument, line).payload as { partyId: string; questId: string };
      expect(line.questReturn?.key).toEqual({ partyId, questId });
    }
    expect(lines(null).filter((line) => line.type !== 'quest.resolved').every((line) => line.questReturn === null)).toBe(true);
    for (const whose of ['all', 'world', ...home.document!.world.guilds[guild.id]!.rosterIds] as const) {
      expect(lines(whose as never).every((line) => line.questReturn === null), String(whose)).toBe(true);
    }
  });

  test("a return's parts are gathered under its entry: its Encounters, consumables, Injuries and Deaths, and its Heroes' Levels that night (M9-F5)", () => {
    const home = cameHome(started('history-parts'));
    const homeDocument = home.document as WorldDocument;
    const parts = returnParts(homeDocument, guild.id);
    expect([...parts].some((entry) => entry.type === 'quest.encounter')).toBe(true);
    const shown = new Set(shownIn(homeDocument, home.log, null));
    for (const part of parts) expect(shown.has(part), part.type).toBe(false);
    // They stay in the Quest's own History, a Hero's, and the debug view.
    for (const part of parts) expect(historyFilter(homeDocument, 'all')(part)).toBe(true);
    expect(shownIn(homeDocument, home.log, 'all').filter((entry) => parts.has(entry))).toHaveLength(parts.size);
  });

  test("a Rival's History leaves out exactly Upkeep, purchases and sales", () => {
    for (const rival of rivals) {
      expect(shownIn(document, state.log, rival.id), rival.name).toEqual(entriesLeaving(document, rival.id, leftOutOfARival));
      expect(historyView(document, state.log, rival.id, 0).entries).toBe(entriesLeaving(document, rival.id, leftOutOfARival).length);
    }
  });

  test("a Hero's, a Patron's, a Quest's and a Guildmaster's History leave out nothing", () => {
    const hero = Object.values(document.world.heroes).find((each) => guild.rosterIds.includes(each.id) && entriesFor(document.history, each.id).some((entry) => entry.type === 'hero.xp-gained'));
    const patron = Object.values(document.world.patrons).find((each) => entriesFor(document.history, each.id).some((entry) => entry.type === 'patron.regard-changed'));
    const master = document.world.guildmasters[guild.guildmasterId];
    const quest = document.history.entries.find((entry) => entry.type === 'quest.resolved' && entry.participants.includes(guild.id));
    const questId = (quest?.payload as { questId: string } | undefined)?.questId;
    if (hero === undefined || patron === undefined || master === undefined || questId === undefined) throw new Error('no Hero, Patron, Guildmaster or Quest');

    for (const entityId of [hero.id, patron.id, master.id]) {
      expect(shownIn(document, state.log, entityId), entityId).toEqual(entriesFor(document.history, entityId));
    }
    // A Quest's History has no view of its own yet; its filter keeps all.
    const keeps = historyFilter(document, questId as never);
    expect(entriesFor(document.history, questId as never).length).toBeGreaterThan(0);
    expect(entriesFor(document.history, questId as never).every(keeps)).toBe(true);
  });

  test('no page is empty, and every page but the last holds a full page, in the filtered Histories', () => {
    for (const [whose, inScope] of [
      [null, inYourGuild(document, guild.id)],
      ...rivals.map((rival) => [rival.id, entriesLeaving(document, rival.id, leftOutOfARival)] as const),
    ] as const) {
      expectExactPages(document, whose, inScope);
    }
  });

  test('the count of new counts only what the filter leaves: a sale is not new in your History', () => {
    // A play that was a sale, or a purchase, names the Guild, and is left out of its History.
    expect(sold.log.some((event) => event.type === 'item.sold' && event.participants.includes(guild.id))).toBe(true);
    expect(historyView(sold.document as WorldDocument, sold.log, null, 0).fresh).toBe(0);
    expect(historyView(bought.document as WorldDocument, bought.log, null, 0).fresh).toBe(0);
    // A Party home: its return is new, and its XP and Morale are not counted.
    const homeDocument = home.document as WorldDocument;
    const shown = new Set<object>(inYourGuild(homeDocument, guild.id));
    const expected = home.log.filter((event) => shown.has(event)).length;
    expect(expected).toBeGreaterThan(0);
    expect(historyView(homeDocument, home.log, null, 0).fresh).toBe(expected);
    for (const line of shownIn(homeDocument, home.log, null)) expect(leftOutOfYours).not.toContain(line.type);
  });
});

/** A game with the World History's news in its first Days (`withWorldNews`), played `turns` Turns in one play. */
function worldNews(seed = 'history-world', turns = 120): { document: WorldDocument; log: TurnEvent[] } {
  const state = playedState(withWorldNews(started(seed)), { kind: 'advance', turns });
  return { document: state.document as WorldDocument, log: state.log };
}

describe('the World History (M9-F4, DL-112 item 7, DL-113 item 1)', () => {
  const { document, log } = worldNews();
  const world = document.history.entries.filter((entry) => worldTypes.includes(entry.type)).reverse();

  test('the game holds a fold, a Succession, a Quest taken and resolved by a Rival, and a Patron’s band change', () => {
    const types = new Set(world.map((entry) => entry.type));
    for (const type of ['guild.folded', 'guildmaster.succeeded', 'patron.regard-changed', 'world.created']) expect(types, type).toContain(type);
    const rival = (entry: Entry): boolean => {
      const { guildId } = entry.payload as { guildId?: string };
      return document.world.guilds[guildId as never]?.controller.kind === 'rival';
    };
    expect(world.some((entry) => entry.type === 'quest.taken' && rival(entry))).toBe(true);
    expect(world.some((entry) => entry.type === 'quest.resolved' && rival(entry))).toBe(true);
    // A Guild founded after the world was made: the folded Rival's replacement.
    expect(world.some((entry) => entry.type === 'guild.founded' && entry.turn > 0)).toBe(true);
  });

  test('takes exactly its events, for every Guild, newest first', () => {
    expect(shownIn(document, log, 'world')).toEqual(world);
    const view = historyView(document, log, 'world', 0);
    expect(view).toMatchObject({ title: 'The World History', name: null, entityId: null, mine: false, scope: 'world', entries: world.length });
    // Every Guild's Quests: the player's are there too.
    const guildsOfQuests = new Set(world.filter((entry) => entry.type === 'quest.taken').map((entry) => (entry.payload as { guildId: string }).guildId));
    expect(guildsOfQuests.size).toBeGreaterThan(2);
  });

  test('leaves out a Guild below the floor, and every other type', () => {
    const shown = new Set(shownIn(document, log, 'world').map((entry) => entry.type));
    expect(shown.has('guild.below-floor')).toBe(false);
    for (const type of shown) expect(worldTypes).toContain(type);
  });

  test('is grouped by Day and time of day with no folds, and pages exactly', () => {
    const views = expectExactPages(document, 'world', world);
    for (const view of views) {
      for (const group of view.groups) {
        for (const row of group.rows) {
          expect(row.kind).toBe('entry');
          if (row.kind === 'entry') expect(row.steps).toEqual([]);
        }
      }
    }
  });

  test('counts as new what the last play appended of its events', () => {
    expect(historyView(document, log, 'world', 0).fresh).toBe(log.filter((event) => worldTypes.includes(event.type)).length);
  });
});

describe('the whole History, the debug view (M9-F4, DL-112 item 7)', () => {
  const { document, log } = worldNews('history-debug', 60);

  test('shows every entry, unfolded, each line with its event type', () => {
    const views = expectExactPages(document, 'all', document.history.entries);
    expect(historyView(document, log, 'all', 0)).toMatchObject({ title: 'Debug: the whole History', name: null, entityId: null, scope: 'whole', fresh: log.length });
    expect(log.length).toBeGreaterThan(0);
    const rows = views.flatMap((view) => view.groups.flatMap((group) => group.rows));
    expect(rows.every((row) => row.kind === 'entry' && row.steps.length === 0)).toBe(true);
    for (const row of rows) if (row.kind === 'entry') expect(row.line.type).toBe(entryOf(document, row.line).type);
    // A Party's steps and a Rival's routine stand as lines of their own.
    expect(rows.some((row) => row.kind === 'entry' && row.line.type === 'quest.encounter')).toBe(true);
  });

  test('is not among the choices; the world is, after the player’s Guild', () => {
    const guild = playerOf(document);
    const rivals = Object.values(document.world.guilds).filter((each) => each.id !== guild.id && each.foldedOnTurn === null);

    expect(historyChoices(document)).toEqual([
      { whose: null, label: 'The Lantern', mine: true },
      { whose: 'world', label: 'The world', mine: false },
      ...rivals.map((rival) => ({ whose: rival.id, label: rival.name, mine: false })),
    ]);
  });

  test('the search still finds anyone in the whole History', () => {
    const [folded] = Object.values(document.world.guilds).filter((guild) => guild.foldedOnTurn !== null);
    const hero = Object.values(document.world.heroes).find((each) => each.guildId !== playerOf(document).id);
    if (folded === undefined || hero === undefined) throw new Error('no folded Guild or Rival’s Hero');
    expect(findInHistory(document, folded.name).names).toContainEqual({ entityId: folded.id, name: folded.name, what: 'Guild, folded' });
    expect(findInHistory(document, hero.name).names.map((name) => name.entityId)).toContain(hero.id);
  });
});

describe('a page grouped by Day and time of day (M9-S5)', () => {
  const { document, log } = played(40);

  test('groups newest first, each headed by its Day and time of day, and each holding the entries of its Turn as they happened', () => {
    const view = historyView(document, log, 'all', 0);
    const turns = view.groups.map((group) => entryOf(document, linesOf(group.rows[0] as HistoryRow)[0] as HistoryLine).turn);

    expect(view.groups.length).toBeGreaterThan(1);
    expect(turns).toEqual([...turns].sort((a, b) => b - a));
    expect(new Set(turns).size).toBe(turns.length);
    view.groups.forEach((group, index) => {
      const turn = turns[index] as number;
      expect(group.when).toBe(`Day ${dayOf(turn)}, ${timeOfDay(turn)}`);
      expect(group.timeOfDay).toBe(timeOfDay(turn));
      const shown = group.rows.flatMap(linesOf).map((line) => entryOf(document, line));
      const ofTheTurn = entriesBetween(document.history, turn, turn + 1);
      // Every entry of the Turn, save the oldest group's, which the page's edge may cut: its newest.
      if (index < view.groups.length - 1) expect(new Set(shown)).toEqual(new Set(ofTheTurn));
      else for (const entry of shown) expect(ofTheTurn).toContain(entry);
      // Each row where its first entry happened: the rows read in the order of the Turn.
      const firsts = group.rows.map((row) => ofTheTurn.indexOf(entryOf(document, linesOf(row)[0] as HistoryLine)));
      expect(firsts).toEqual([...firsts].sort((a, b) => a - b));
    });
  });

  test("pages a Hero's History too, as their page shows it", () => {
    const { document, log } = played(240, 'history-hero');
    // The busiest Hero of the world: a Rival's, whose Guild sends Parties while the player's rests.
    const hero = Object.values(document.world.heroes).reduce((most, each) =>
      entriesFor(document.history, each.id).length > entriesFor(document.history, most.id).length ? each : most,
    );
    const all = entriesFor(document.history, hero.id);
    const first = historyView(document, log, hero.id, 0);
    const second = historyView(document, log, hero.id, 1);

    expect(all.length).toBeGreaterThan(historyPageSize);
    expect(first).toMatchObject({ page: 0, entries: all.length, pages: expectExactPages(document, hero.id, all).length, hero: hero.id });
    for (const entry of all.slice(0, historyPageSize)) expect(entriesOn(document, first)).toContain(entry);
    for (const entry of entriesOn(document, second)) expect(entriesOn(document, first)).not.toContain(entry);
    expect(historyView(document, log, hero.id, 999).page).toBe(first.pages - 1);
  });

  test('pages twenty entries at a time from the newest, and reads a page past the last as the last', () => {
    const total = document.history.entries.length;
    const first = historyView(document, log, 'all', 0);
    const pages = expectExactPages(document, 'all', document.history.entries).length;

    expect(first).toMatchObject({ page: 0, pages, entries: total, title: 'Debug: the whole History', name: null, entityId: null });
    expect(entriesOn(document, first).length).toBeGreaterThanOrEqual(historyPageSize);
    // The newest twenty are on the first page.
    for (const entry of document.history.entries.slice(-historyPageSize)) expect(entriesOn(document, first)).toContain(entry);
    const last = historyView(document, log, 'all', 9_999);
    expect(last.page).toBe(pages - 1);
    // Its last group is the oldest Turn's, which opens with the History's first entry.
    const oldest = last.groups.at(-1)?.rows[0];
    expect(oldest === undefined ? undefined : entryOf(document, linesOf(oldest)[0] as HistoryLine)).toBe(document.history.entries[0]);
  });
});

/** A Party's steps on a Quest, which fold under its outcome: its Encounters and the consumables it used. */
const stepTypes: readonly string[] = ['quest.encounter', 'item.expended'];

describe("a Party's Encounters, folded under its outcome (M9-S5)", () => {
  // A Party of the player's sent, then fifty Days in one play: it comes home, and so do the Rivals'.
  const state = playedState(withPartyOut(started('history-folds')), { kind: 'advance', turns: 150 });
  const { document, log } = { document: state.document as WorldDocument, log: state.log };
  const guild = playerOf(document);

  /** Every page of `whose`'s History. */
  function everyPage(whose: Parameters<typeof historyView>[2]): HistoryView[] {
    const { pages } = historyView(document, log, whose, 0);
    return Array.from({ length: pages }, (_, page) => historyView(document, log, whose, page));
  }

  // The Rival whose History holds the most outcomes.
  const busiest = Object.values(document.world.guilds)
    .filter((each) => each.controller.kind === 'rival')
    .reduce((most, each) => (outcomesOf(each.id) > outcomesOf(most.id) ? each : most));
  function outcomesOf(guildId: Guild['id']): number {
    return entriesFor(document.history, guildId).filter((entry) => entry.type === 'quest.resolved').length;
  }

  test.each([
    ["the player's Guild's", null, leftOutOfYours],
    ["a Rival's", 'rival', leftOutOfARival],
  ] as const)("in %s, every entry is on one page and one only, and each outcome holds its Party's steps, in the order they happened", (_name, which, leftOut) => {
    const whose = which === 'rival' ? busiest.id : null;
    const views = everyPage(whose);
    const inScope = (whose === null ? inYourGuild(document, guild.id) : entriesLeaving(document, whose, leftOut)).reverse();
    const shown = views.flatMap((view) => entriesOn(document, view));

    expect(shown.length).toBe(inScope.length);
    expect(new Set(shown)).toEqual(new Set(inScope));
    let outcomes = 0;
    for (const row of views.flatMap((view) => view.groups.flatMap((group) => group.rows))) {
      if (row.kind !== 'entry') continue;
      const entry = entryOf(document, row.line);
      // No step stands alone where its Party's outcome is in the History.
      if (stepTypes.includes(entry.type)) {
        const { partyId } = entry.payload as { partyId: string };
        expect(entriesFor(document.history, partyId as never).some((each) => each.type === 'quest.resolved')).toBe(false);
      }
      if (entry.type !== 'quest.resolved') continue;
      outcomes += 1;
      const { partyId } = entry.payload as { partyId: string };
      const steps = entriesFor(document.history, partyId as never)
        .reverse()
        .filter((each) => stepTypes.includes(each.type) && inScope.includes(each));
      expect(row.steps.map((line) => entryOf(document, line))).toEqual(steps);
      const encounters = steps.filter((each) => each.type === 'quest.encounter').length;
      const used = steps.length - encounters;
      expect(row.stepsWords).toBe(
        [
          ...(encounters === 0 ? [] : [`${encounters} ${encounters === 1 ? 'Encounter' : 'Encounters'}`]),
          ...(used === 0 ? [] : [`${used} ${used === 1 ? 'consumable' : 'consumables'} used`]),
        ].join(' and '),
      );
    }
    expect(outcomes).toBeGreaterThan(0);
  });

  test('says on which page an entry stands, that the home view can open it there, and null where it is not', () => {
    for (const whose of ['all' as const, null]) {
      everyPage(whose).forEach((view, page) => {
        for (const line of view.groups.flatMap((group) => group.rows.flatMap((row) => (row.kind === 'entry' ? [row.line] : [])))) {
          expect(pageOfEntry(document, whose, entryOf(document, line))).toBe(page);
        }
      });
    }
    const rivalsOnly = document.history.entries.find((entry) => entry.type === 'quest.resolved' && !entry.participants.includes(guild.id));
    expect(rivalsOnly).toBeDefined();
    expect(pageOfEntry(document, null, rivalsOnly as Entry)).toBeNull();
    expect(pageOfEntry(document, null, { ...(rivalsOnly as Entry) })).toBeNull();
  });

  test("a page that ends on an outcome takes its Party's steps with it, and the next page starts after them", () => {
    const views = everyPage(busiest.id);
    const sizes = views.map((view) => entriesOn(document, view).length);

    // The page's edge fell among a Party's steps somewhere in this game, and they stayed together.
    expect(sizes.some((size) => size > historyPageSize)).toBe(true);
    expect(sizes.reduce((sum, size) => sum + size, 0)).toBe(entriesLeaving(document, busiest.id, leftOutOfARival).length);
  });
});

/**
 * Every page of `whose` History in `document`, checked to be exact: none empty, together every entry
 * of the History shown once, each page but the last holding at least `historyPageSize`, a page past
 * the last read as the last, and each entry's page what `pageOfEntry` says.
 */
function expectExactPages(document: WorldDocument, whose: Parameters<typeof historyView>[2], inScope: readonly Entry[]): HistoryView[] {
  const { pages } = historyView(document, [], whose, 0);
  const views = Array.from({ length: pages }, (_, page) => historyView(document, [], whose, page));
  const shown = views.map((view) => entriesOn(document, view));

  expect(shown.map((entries) => entries.length).filter((length) => length === 0), 'empty pages').toEqual([]);
  expect(shown.slice(0, -1).filter((entries) => entries.length < historyPageSize), 'short pages before the last').toEqual([]);
  expect(shown.flat()).toHaveLength(inScope.length);
  expect(new Set(shown.flat())).toEqual(new Set(inScope));
  expect(historyView(document, [], whose, pages + 5).page).toBe(pages - 1);
  // A step stands on its outcome's page, and pageOfEntry says so as it says it of every entry.
  for (const [page, entries] of shown.entries()) {
    for (const entry of entries) expect(pageOfEntry(document, whose, entry), `${entry.type} on page ${page}`).toBe(page);
  }
  return views;
}

describe("the pages' count, from the edges the pages keep (the M9 review)", () => {
  // The same game as the folds': its History has Parties' outcomes, each after its steps.
  const state = playedState(withPartyOut(started('history-folds')), { kind: 'advance', turns: 150 });
  const game = state.document as WorldDocument;
  // A Rival's History, as it shows, oldest first: its Parties' steps fold under their outcomes.
  const rival = Object.values(game.world.guilds)
    .filter((each) => each.controller.kind === 'rival')
    .reduce((most, each) => (entriesFor(game.history, each.id).length > entriesFor(game.history, most.id).length ? each : most));
  const all = entriesLeaving(game, rival.id, leftOutOfARival).reverse();

  /** The game with a History of `entries` alone, in their order, indexed afresh. */
  function holding(entries: readonly Entry[]): WorldDocument {
    const history = createHistory();
    for (const entry of entries) append(history, entry);
    return { ...game, history };
  }

  /** How many steps of the outcome at `position`'s Party come straight before it, in its Turn. */
  function stepsBefore(position: number): number {
    const outcome = all[position] as Entry;
    const partyId = (outcome.payload as { partyId: string }).partyId;
    let steps = 0;
    for (let at = position - 1; at >= 0; at -= 1) {
      const entry = all[at] as Entry;
      if (!stepTypes.includes(entry.type) || entry.turn !== outcome.turn || (entry.payload as { partyId?: string }).partyId !== partyId) break;
      steps += 1;
    }
    return steps;
  }

  // An outcome with at least two steps, with twenty entries after it and ten before its steps.
  let outcomeAt = -1;
  for (let position = all.length - 21; position >= 0 && outcomeAt < 0; position -= 1) {
    if (all[position]?.type === 'quest.resolved' && stepsBefore(position) >= 2 && position - stepsBefore(position) >= 10) outcomeAt = position;
  }
  const steps = stepsBefore(outcomeAt);
  /** The History from `older` entries before the outcome's steps to `newer` entries after the outcome. */
  const around = (older: number, newer: number): WorldDocument => holding(all.slice(outcomeAt - steps - older, outcomeAt + 1 + newer));

  test('the game holds such an outcome', () => {
    expect(outcomeAt).toBeGreaterThan(0);
    expect(steps).toBeGreaterThanOrEqual(2);
  });

  test("a last page's edge falling on an outcome: its steps join the page, and no empty page follows", () => {
    // The review's case: the outcome the twentieth entry from the newest, its steps past the page.
    const document = around(0, 19);
    expect(document.history.entries).toHaveLength(20 + steps);

    const views = expectExactPages(document, rival.id, document.history.entries);
    expect(views).toHaveLength(1);
    expect(views[0]).toMatchObject({ page: 0, pages: 1, entries: 20 + steps });
  });

  test("a page's edge falling among an outcome's steps keeps them together on one page", () => {
    const document = around(0, 18);
    expect(expectExactPages(document, rival.id, document.history.entries)).toHaveLength(1);
  });

  test('an entry older than the steps starts the next page, which holds it alone', () => {
    const document = around(1, 19);
    const views = expectExactPages(document, rival.id, document.history.entries);
    expect(views).toHaveLength(2);
    expect(entriesOn(document, views[1] as HistoryView)).toEqual([document.history.entries[0]]);
  });

  test('an outcome just past the edge opens the next page, with its steps', () => {
    const document = around(0, 20);
    const views = expectExactPages(document, rival.id, document.history.entries);
    expect(views).toHaveLength(2);
    expect(entriesOn(document, views[1] as HistoryView)).toHaveLength(1 + steps);
  });

  test('a Party with more steps than a page holds leaves no empty page between', () => {
    // Its steps repeated to more than a page's worth, between ten older entries and twenty newer.
    const repeated = Array.from({ length: historyPageSize + 5 }, (_, index) => structuredClone(all[outcomeAt - steps + (index % steps)] as Entry));
    const document = holding([...all.slice(outcomeAt - steps - 10, outcomeAt - steps), ...repeated, ...all.slice(outcomeAt, outcomeAt + 20)]);
    const views = expectExactPages(document, rival.id, document.history.entries);

    expect(views).toHaveLength(2);
    expect(entriesOn(document, views[0] as HistoryView)).toHaveLength(20 + historyPageSize + 5);
    const outcome = views[0]?.groups.flatMap((group) => group.rows).find((row) => row.kind === 'entry' && row.steps.length > 0);
    expect(outcome?.kind === 'entry' && outcome.steps).toHaveLength(historyPageSize + 5);
  });

  test("the whole game's History, the player's Guild's and a Rival's, page exactly", () => {
    const guild = playerOf(game);
    expectExactPages(game, 'all', game.history.entries);
    expectExactPages(game, null, inYourGuild(game, guild.id));
    expectExactPages(game, rival.id, entriesLeaving(game, rival.id, leftOutOfARival));
  });
});

/**
 * The routine a Rival's entries fold into (M9-S5, DL-105), and the word each kind is summed up by:
 * its Heroes' drift and small changes of State, its Items, its Upkeep, and Regard crossing a band.
 */
const routineWords: Readonly<Record<string, string>> = {
  'guild.upkeep-paid': 'Upkeep',
  'quest.loot': 'Loot',
  'hero.injured': 'Injuries',
  'hero.xp-gained': 'XP',
  'hero.morale-changed': 'Morale',
  'hero.healed': 'healing',
  'hero.declined': 'Decline',
  'patron.regard-changed': 'Regard',
  'guildmaster.regard-changed': 'Regard',
  'hero.regard-changed': 'Regard',
  'item.expended': 'consumables',
  'item.equipped': 'gear',
  'item.unequipped': 'gear',
  'item.returned': 'gear',
  'item.bought': 'purchases',
  'item.sold': 'sales',
};

describe("each Rival's routine, one line a Guild, and the marks on every line (M9-S5)", () => {
  const state = playedState(withPartyOut(started('history-folds')), { kind: 'advance', turns: 150 });
  const { document, log } = { document: state.document as WorldDocument, log: state.log };
  const guild = playerOf(document);
  // Each Rival's History folds its routine (M9-F4: the whole History folds nothing).
  const groups = Object.values(document.world.guilds)
    .filter((each) => each.controller.kind === 'rival')
    .flatMap((rival) => pagesOf(document, log, rival.id))
    .flatMap((view) => view.groups);
  // The whole History, every line as itself.
  const wholeGroups = pagesOf(document, log, 'all').flatMap((view) => view.groups);
  const isGuild = (id: string): boolean => id.startsWith('guild-');

  test('are exactly these kinds, none of them a Milestone', () => {
    expect(Object.keys(routineKinds).sort()).toEqual(Object.keys(milestoneTypes).sort());
    expect(Object.fromEntries(Object.entries(routineKinds).filter(([, word]) => word !== null))).toEqual(routineWords);
    for (const type of Object.keys(routineWords)) expect(milestoneTypes[type as keyof typeof milestoneTypes]).toBe(false);
  });

  test("fold, two or more in a group, into one line for their Guild, never the player's and never a Milestone", () => {
    let folds = 0;
    for (const group of groups) {
      const routine = group.rows.filter((row) => row.kind === 'routine');
      for (const row of routine) {
        folds += 1;
        const entries = row.lines.map((line) => entryOf(document, line));
        const rival = document.world.guilds[row.guildId];
        expect(rival?.controller.kind).toBe('rival');
        expect(row.lines.length).toBeGreaterThanOrEqual(2);
        expect(row.side).toBe('rival');
        for (const entry of entries) {
          expect(Object.keys(routineWords)).toContain(entry.type);
          expect(entry.milestone).toBe(false);
          expect(entry.participants).toContain(row.guildId);
          expect(entry.participants).not.toContain(guild.id);
        }
        // In the order they happened.
        expect(row.lines.map((line) => Number(line.key))).toEqual(row.lines.map((line) => Number(line.key)).sort((a, b) => a - b));
        const kinds = [...new Set(entries.map((entry) => routineWords[entry.type]))];
        expect(row.sentence).toBe(`${rival?.name}: ${entries.length} routine entries (${listed(kinds as string[])}).`);
        expect(row.segments[0]).toEqual({ kind: 'name', text: rival?.name, entityId: row.guildId, table: 'guilds' });
        expect(row.fresh).toBe(entries.some((entry) => log.includes(entry as TurnEvent)));
      }
      // One line a Guild in a group; what stands alone is not another routine entry of a Guild folded there.
      const folded = routine.map((row) => row.guildId);
      expect(new Set(folded).size).toBe(folded.length);
      for (const row of group.rows) {
        if (row.kind !== 'entry') continue;
        const entry = entryOf(document, row.line);
        if (entry.milestone || routineWords[entry.type] === undefined) continue;
        for (const guildId of folded) expect(entry.participants.filter(isGuild)).not.toEqual([guildId]);
      }
    }
    expect(folds).toBeGreaterThan(0);
  });

  test("marks each line the player's, a Rival's or neither, new when the last play appended it, and an outcome by how it went", () => {
    const lines = wholeGroups.flatMap((group) => group.rows.flatMap(linesOf));
    const bands = { fail: 'Failure', success: 'Success', strong: 'Strong success' };
    let outcomes = 0;
    for (const line of lines) {
      const entry = entryOf(document, line);
      const guilds = entry.participants.filter(isGuild);
      expect(line.side).toBe(guilds.includes(guild.id) ? 'mine' : guilds.length > 0 ? 'rival' : 'world');
      expect(line.fresh).toBe(log.includes(entry as TurnEvent));
      expect(line.milestone).toBe(entry.milestone);
      if (entry.type === 'quest.resolved') {
        outcomes += 1;
        const { band } = entry.payload as { band: keyof typeof bands };
        expect(line.outcome).toEqual({ band, words: bands[band] });
      } else {
        expect(line.outcome).toBeNull();
      }
    }
    expect(outcomes).toBeGreaterThan(0);
    expect(lines.some((line) => line.side === 'world')).toBe(true);
    expect(lines.some((line) => line.side === 'mine')).toBe(true);
  });

  test('counts the entries the last play appended, in the History shown', () => {
    expect(historyView(document, log, 'all', 0).fresh).toBe(log.length);
    const shown = new Set<object>(inYourGuild(document, guild.id));
    expect(historyView(document, log, null, 0).fresh).toBe(log.filter((event) => shown.has(event)).length);
    expect(historyView(document, [], null, 0).fresh).toBe(0);
    // The newest are new, and they lead the first page.
    const [first] = historyView(document, log, 'all', 0).groups;
    expect(first?.rows.flatMap(linesOf).every((line) => line.fresh)).toBe(true);
  });
});

describe("a Hero's own History, where a Rival's routine does not fold (DL-109 item 2, Q14)", () => {
  const { document, log } = played(240, 'history-hero');
  const rivals = new Set(Object.values(document.world.guilds).filter((each) => each.controller.kind === 'rival').map((each) => each.id));
  // The busiest Hero on a Rival's Roster: their Guild's routine is among their History's lines.
  const hero = Object.values(document.world.heroes)
    .filter((each) => each.guildId !== null && rivals.has(each.guildId))
    .reduce((most, each) => (entriesFor(document.history, each.id).length > entriesFor(document.history, most.id).length ? each : most));
  const guildId = hero.guildId as string;

  function viewsOf(whose: string): HistoryView[] {
    const { pages } = historyView(document, log, whose as never, 0);
    return Array.from({ length: pages }, (_, page) => historyView(document, log, whose as never, page));
  }

  test("every line of a Rival's Hero's History stands as itself, their Guild's routine among them", () => {
    const views = viewsOf(hero.id);
    const rows = views.flatMap((view) => view.groups.flatMap((group) => group.rows));

    expect(rows.every((row) => row.kind === 'entry')).toBe(true);
    // What a Guild's History folds: two or more of the Guild's routine entries in one group.
    const wouldFold = views
      .flatMap((view) => view.groups)
      .filter((group) => {
        const routine = group.rows.flatMap(linesOf).map((line) => entryOf(document, line));
        return routine.filter((entry) => !entry.milestone && routineWords[entry.type] !== undefined && entry.participants.includes(guildId as never)).length >= 2;
      });
    expect(wouldFold.length).toBeGreaterThan(0);
  });

  test("the Hero's Guild's History still folds it; the whole History folds nothing (M9-F4)", () => {
    expect(viewsOf(guildId).flatMap((view) => view.groups.flatMap((group) => group.rows)).some((row) => row.kind === 'routine')).toBe(true);
    expect(viewsOf('all').flatMap((view) => view.groups.flatMap((group) => group.rows)).some((row) => row.kind === 'routine')).toBe(false);
  });
});

describe('whose History (M9-S5)', () => {
  const { document, log } = played(12);
  const guild = playerOf(document);

  test("opens on the player's Guild: its entries, newest first, under its name", () => {
    const view = historyView(document, log, null, 0);
    const own = inYourGuild(document, guild.id);

    expect(view).toMatchObject({ title: 'The History of The Lantern', name: 'The Lantern', entityId: guild.id, mine: true, hero: null, scope: 'mine' });
    expect(view.entries).toBe(own.length);
    for (const entry of entriesOn(document, view)) expect(entry.participants).toContain(guild.id);
    expect(historyView(document, log, guild.id, 0)).toEqual(view);
  });

  test("gives the whole History, the world's, or any Guild's, Hero's, Guildmaster's or Patron's; an id it does not name reads as the player's Guild's", () => {
    const rival = Object.values(document.world.guilds).find((each) => each.id !== guild.id) as Guild;
    const patron = Object.values(document.world.patrons)[0];
    const hero = Object.values(document.world.heroes).find((each) => guild.rosterIds.includes(each.id));
    const master = Object.values(document.world.guildmasters).find((each) => each.guildId === guild.id);
    if (patron === undefined || hero === undefined || master === undefined) throw new Error('no Patron, Hero or Guildmaster');

    expect(historyView(document, log, 'all', 0)).toMatchObject({ title: 'Debug: the whole History', entityId: null, mine: false, scope: 'whole' });
    expect(historyView(document, log, 'world', 0)).toMatchObject({ title: 'The World History', entityId: null, mine: false, scope: 'world' });
    expect(historyView(document, log, rival.id, 0)).toMatchObject({ title: `The History of ${rival.name}`, entityId: rival.id, mine: false, scope: 'rival' });
    expect(historyView(document, log, patron.id, 0)).toMatchObject({ title: `The History of ${patron.name}`, hero: null });
    expect(historyView(document, log, master.id, 0)).toMatchObject({ title: `The History of ${master.name}`, entityId: master.id, hero: null });
    // A Hero the world holds opens on their page (DL-74).
    expect(historyView(document, log, hero.id, 0)).toMatchObject({ title: `The History of ${hero.name}`, hero: hero.id });
    for (const entry of entriesOn(document, historyView(document, log, patron.id, 0))) expect(entry.participants).toContain(patron.id);
    expect(historyView(document, log, patron.id, 0).scope).toBe('entity');
    expect(historyView(document, log, 'hero-999999' as never, 0)).toMatchObject({ title: 'The History of The Lantern', entityId: guild.id, mine: true });
    // Each title alone, for what leads back to it.
    for (const whose of [null, 'all', 'world', rival.id, patron.id, hero.id, master.id, 'hero-999999'] as const) {
      expect(historyTitle(document, whose as never)).toBe(historyView(document, log, whose as never, 0).title);
    }
  });
});

describe('the choices one step away (M9-S5)', () => {
  test("the player's Guild first, where the History opens, then the world, then each Rival in play (M9-F4)", () => {
    const { document } = played(3);
    const guild = playerOf(document);
    const rivals = Object.values(document.world.guilds).filter((each) => each.id !== guild.id);

    expect(historyChoices(document)).toEqual([
      { whose: null, label: 'The Lantern', mine: true },
      { whose: 'world', label: 'The world', mine: false },
      ...rivals.map((rival) => ({ whose: rival.id, label: rival.name, mine: false })),
    ]);
  });

  test('leaves out a folded Guild, which is found by name', () => {
    const { document } = played(3);
    const folded = structuredClone(document);
    const rival = Object.values(folded.world.guilds).find((each) => each.controller.kind === 'rival') as Guild;
    rival.foldedOnTurn = folded.world.turn;

    expect(historyChoices(folded).map((choice) => choice.whose)).not.toContain(rival.id);
    expect(findInHistory(folded, rival.name).names).toContainEqual({ entityId: rival.id, name: rival.name, what: 'Guild, folded' });
  });
});

describe('anyone the History names, found by name (DL-74)', () => {
  /** A game a few Turns in with a Hero dead, one retired and one gone from the world. */
  function gone() {
    const { state, ...heroes } = withTheGone(playedState(started('history-search'), { kind: 'advance', turns: 6 }));
    if (state.document === null) throw new Error('no game in hand');
    return { document: state.document, ...heroes };
  }

  test('finds a Hero on no Roster and not in the pool, dead, retired or gone from the world, by any part of their name', () => {
    const { document, dead, retired, gone: left } = gone();

    for (const [hero, what] of [
      [dead, 'Hero, dead'],
      [retired, 'Hero, retired'],
      [left, 'Hero, no longer in the world'],
    ] as const) {
      const part = hero.name.split(' ').at(-1)?.toUpperCase() ?? '';
      const found = findInHistory(document, `  ${part} `);
      expect(found.names).toContainEqual({ entityId: hero.id, name: hero.name, what });
    }
  });

  test('finds the Guilds, Guildmasters and Patrons too, each said for what it is', () => {
    const { document } = gone();
    const lantern = playerOf(document);
    const patron = Object.values(document.world.patrons)[0];
    if (patron === undefined) throw new Error('no Patron');

    expect(findInHistory(document, 'lantern').names).toContainEqual({ entityId: lantern.id, name: 'The Lantern', what: 'Guild' });
    expect(findInHistory(document, 'ada vell').names).toContainEqual({
      entityId: lantern.guildmasterId,
      name: 'Ada Vell',
      what: 'Guildmaster of The Lantern',
    });
    expect(findInHistory(document, patron.name).names).toContainEqual({ entityId: patron.id, name: patron.name, what: 'Patron' });
    const onTheRoster = Object.values(document.world.heroes).find((hero) => lantern.rosterIds.includes(hero.id));
    if (onTheRoster === undefined) throw new Error('no Hero on the Roster');
    expect(findInHistory(document, onTheRoster.name).names).toContainEqual({
      entityId: onTheRoster.id,
      name: onTheRoster.name,
      what: 'Hero of The Lantern',
    });
  });

  test("says a Rival's retired Guildmaster is retired, and their successor the Guildmaster of the Guild now (M9-S2, the M9 review)", () => {
    const start = createWorld('history-succession', setup, deps).document;
    const rival = Object.values(start.world.guilds).find((guild) => guild.controller.kind === 'rival') as Guild;
    const retiring = start.world.guildmasters[rival.guildmasterId];
    if (retiring === undefined) throw new Error('no Guildmaster');
    // Of the age to retire from the start, so the first night's check meets it with Succession.
    retiring.ageAtEntry = defaultConfig.guildmasterRetirementAge;
    let document = start;
    for (let turn = 0; turn < 3; turn += 1) document = advance(document, deps).document;
    const successor = document.world.guildmasters[document.world.guilds[rival.id]?.guildmasterId ?? rival.guildmasterId];
    if (successor === undefined || successor.id === retiring.id) throw new Error('no Succession');

    expect(findInHistory(document, retiring.name).names).toContainEqual({
      entityId: retiring.id,
      name: retiring.name,
      what: `Guildmaster of ${rival.name}, retired`,
    });
    expect(findInHistory(document, successor.name).names).toContainEqual({
      entityId: successor.id,
      name: successor.name,
      what: `Guildmaster of ${rival.name}`,
    });
  });

  test('names no Quest or Party, shows at most a page of names in order, and nothing for a blank or unknown name', () => {
    const { document } = gone();
    const many = findInHistory(document, 'e');

    expect(many.matched).toBeGreaterThan(historySearchLimit);
    expect(many.names).toHaveLength(historySearchLimit);
    expect(many.names.map((name) => name.name)).toEqual(many.names.map((name) => name.name).sort());
    expect(many.names.every((name) => /^(guild|hero|guildmaster|patron)-\d{6}$/.test(name.entityId))).toBe(true);
    const quest = document.history.entries.find((entry) => entry.type === 'quest.offered');
    const template = content.questTemplates[(quest?.payload as { templateKey: string } | undefined)?.templateKey ?? '']?.name ?? '';
    expect(template).not.toBe('');
    expect(findInHistory(document, template).names.filter((name) => !/^(guild|hero|guildmaster|patron)-/.test(name.entityId))).toEqual([]);
    expect(findInHistory(document, '   ')).toEqual({ names: [], matched: 0 });
    expect(findInHistory(document, 'no one is called this')).toEqual({ names: [], matched: 0 });
  });

  test("opens the page of a Hero the world still holds, dead ones included, and anyone else's entries newest first", () => {
    const { document, dead, gone: left } = gone();
    const patron = Object.values(document.world.patrons)[0];
    if (patron === undefined) throw new Error('no Patron');

    expect(historyView(document, [], dead.id, 0)).toMatchObject({ hero: dead.id, name: dead.name, title: `The History of ${dead.name}` });
    const leftView = historyView(document, [], left.id, 0);
    expect(leftView).toMatchObject({ hero: null, name: left.name, title: `The History of ${left.name}` });
    expect(leftView.entries).toBe(entriesFor(document.history, left.id).length);
    expect(leftView.entries).toBeGreaterThan(0);
    const patronView = historyView(document, [], patron.id, 0);
    expect(patronView).toMatchObject({ hero: null, name: patron.name, entries: entriesFor(document.history, patron.id).length });
    expect(entriesOn(document, patronView)).toHaveLength(Math.min(historyPageSize, patronView.entries));
    expect(historyView(document, [], 'hero-999999' as never, 0)).toMatchObject({ title: 'The History of The Lantern', name: 'The Lantern', hero: null });
  });
});
