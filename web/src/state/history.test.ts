import {
  advance,
  createWorld,
  dayOf,
  defaultConfig,
  entriesBetween,
  entriesFor,
  milestoneTypes,
  playerGuild,
  timeOfDay,
  type Entry,
  type Guild,
  type TurnEvent,
  type WorldDocument,
} from '@heroesim/engine';
import { describe, expect, test } from 'vitest';
import { content } from '../content';
import { played as playedState, started, withPartyOut, withTheGone } from './game.test-support';
import { findInHistory, historyChoices, historySearchLimit, historyTitle, historyView, routineKinds, type HistoryLine, type HistoryRow, type HistoryView } from './history';
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
    expect(first).toMatchObject({ page: 0, entries: all.length, pages: Math.ceil(all.length / historyPageSize), hero: hero.id });
    for (const entry of all.slice(0, historyPageSize)) expect(entriesOn(document, first)).toContain(entry);
    for (const entry of entriesOn(document, second)) expect(entriesOn(document, first)).not.toContain(entry);
    expect(historyView(document, log, hero.id, 999).page).toBe(first.pages - 1);
  });

  test('pages twenty entries at a time from the newest, and reads a page past the last as the last', () => {
    const total = document.history.entries.length;
    const first = historyView(document, log, 'all', 0);
    const pages = Math.ceil(total / historyPageSize);

    expect(first).toMatchObject({ page: 0, pages, entries: total, title: 'The whole History', name: null, entityId: null });
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

  test.each([
    ['the whole History', 'all' as const],
    ["the player's Guild's", null],
  ])("in %s, every entry is on one page and one only, and each outcome holds its Party's steps, in the order they happened", (_name, whose) => {
    const views = everyPage(whose);
    const inScope = whose === 'all' ? document.history.entries : entriesFor(document.history, guild.id).reverse();
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

  test("a page that ends on an outcome takes its Party's steps with it, and the next page starts after them", () => {
    const views = everyPage('all');
    const sizes = views.map((view) => entriesOn(document, view).length);

    // The page's edge fell among a Party's steps somewhere in this game, and they stayed together.
    expect(sizes.some((size) => size > historyPageSize)).toBe(true);
    expect(sizes.reduce((sum, size) => sum + size, 0)).toBe(document.history.entries.length);
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
  const { pages } = historyView(document, log, 'all', 0);
  const views = Array.from({ length: pages }, (_, page) => historyView(document, log, 'all', page));
  const groups = views.flatMap((view) => view.groups);
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
    const lines = groups.flatMap((group) => group.rows.flatMap(linesOf));
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
        const { band, partyId } = entry.payload as { band: keyof typeof bands; partyId: string };
        expect(line.outcome).toEqual({ band, words: bands[band] });
        expect(line.anchor).toBe(`outcome-${partyId}`);
      } else {
        expect(line.outcome).toBeNull();
        expect(line.anchor).toBeNull();
      }
    }
    expect(outcomes).toBeGreaterThan(0);
    expect(lines.some((line) => line.side === 'world')).toBe(true);
    expect(lines.some((line) => line.side === 'mine')).toBe(true);
  });

  test('counts the entries the last play appended, in the History shown', () => {
    expect(historyView(document, log, 'all', 0).fresh).toBe(log.length);
    expect(historyView(document, log, null, 0).fresh).toBe(log.filter((event) => event.participants.includes(guild.id)).length);
    expect(historyView(document, [], null, 0).fresh).toBe(0);
    // The newest are new, and they lead the first page.
    const [first] = historyView(document, log, 'all', 0).groups;
    expect(first?.rows.flatMap(linesOf).every((line) => line.fresh)).toBe(true);
  });
});

describe('whose History (M9-S5)', () => {
  const { document, log } = played(12);
  const guild = playerOf(document);

  test("opens on the player's Guild: its entries, newest first, under its name", () => {
    const view = historyView(document, log, null, 0);
    const own = entriesFor(document.history, guild.id);

    expect(view).toMatchObject({ title: 'The History of The Lantern', name: 'The Lantern', entityId: guild.id, mine: true, hero: null });
    expect(view.entries).toBe(own.length);
    for (const entry of entriesOn(document, view)) expect(entry.participants).toContain(guild.id);
    expect(historyView(document, log, guild.id, 0)).toEqual(view);
  });

  test("gives the whole History, or any Guild's, Hero's, Guildmaster's or Patron's; an id it does not name reads as the whole", () => {
    const rival = Object.values(document.world.guilds).find((each) => each.id !== guild.id) as Guild;
    const patron = Object.values(document.world.patrons)[0];
    const hero = Object.values(document.world.heroes).find((each) => guild.rosterIds.includes(each.id));
    const master = Object.values(document.world.guildmasters).find((each) => each.guildId === guild.id);
    if (patron === undefined || hero === undefined || master === undefined) throw new Error('no Patron, Hero or Guildmaster');

    expect(historyView(document, log, 'all', 0)).toMatchObject({ title: 'The whole History', entityId: null, mine: false });
    expect(historyView(document, log, rival.id, 0)).toMatchObject({ title: `The History of ${rival.name}`, entityId: rival.id, mine: false });
    expect(historyView(document, log, patron.id, 0)).toMatchObject({ title: `The History of ${patron.name}`, hero: null });
    expect(historyView(document, log, master.id, 0)).toMatchObject({ title: `The History of ${master.name}`, entityId: master.id, hero: null });
    // A Hero the world holds opens on their page (DL-74).
    expect(historyView(document, log, hero.id, 0)).toMatchObject({ title: `The History of ${hero.name}`, hero: hero.id });
    for (const entry of entriesOn(document, historyView(document, log, patron.id, 0))) expect(entry.participants).toContain(patron.id);
    expect(historyView(document, log, 'hero-999999' as never, 0)).toMatchObject({ title: 'The whole History', entityId: null });
    // Each title alone, for what leads back to it.
    for (const whose of [null, 'all', rival.id, patron.id, hero.id, master.id, 'hero-999999'] as const) {
      expect(historyTitle(document, whose as never)).toBe(historyView(document, log, whose as never, 0).title);
    }
  });
});

describe('the choices one step away (M9-S5)', () => {
  test("the player's Guild first, where the History opens, then the whole History, then each Rival in play", () => {
    const { document } = played(3);
    const guild = playerOf(document);
    const rivals = Object.values(document.world.guilds).filter((each) => each.id !== guild.id);

    expect(historyChoices(document)).toEqual([
      { whose: null, label: 'The Lantern', mine: true },
      { whose: 'all', label: 'The whole History', mine: false },
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
    expect(historyView(document, [], 'hero-999999' as never, 0)).toMatchObject({ title: 'The whole History', name: null, hero: null });
  });
});
