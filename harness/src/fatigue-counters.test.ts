import {
  compareByCodeUnit,
  createWorld,
  milestoneTypes,
  type EngineDeps,
  type EngineEventType,
  type EntityId,
  type Guild,
  type Hero,
  type HeroId,
  type PartyId,
  type QuestId,
  type WorldDocument,
} from '@heroesim/engine';
import { append, makeId } from '@heroesim/engine/testing';
import { describe, expect, test } from 'vitest';
import { harnessSetup } from './creation.js';
import { counterOf, type Counter } from './counter.js';
import { noDispatchFatigue, observeDispatches, observeRestKept, type DispatchFatigue } from './counters.js';
import { gameCounters } from './game-counters.js';
import { content, coreDeps, countGame, observerOf } from './harness.test-support.js';

// Fatigue's lines (DL-290), each derived over a small hand-built History or World State:
// the player's Guild and the Rivals counted apart. The default config: Fatigue's bands start at 0, 25,
// 50 and 75, the player's rest band is tired, and a Day is three Turns.

const deps = coreDeps;

/** The game's counter `key` alone, read from a History that holds only the entries it reads. */
const only = (key: string): Counter[] => [counterOf(gameCounters, key) as Counter];

interface Fixture {
  document: WorldDocument;
  player: Guild;
  /** The first Rival, a Disposition that rests its Heroes at exhausted. */
  rival: Guild;
}

function fixture(seed: string): Fixture {
  const { document } = createWorld(seed, harnessSetup, deps);
  const guilds = Object.values(document.world.guilds).sort((a, b) => compareByCodeUnit(a.id, b.id));
  const player = guilds.find((guild) => guild.controller.kind === 'player');
  const rival = guilds.find((guild) => guild.controller.kind === 'rival');
  if (player === undefined || rival === undefined) throw new Error('Not a player and a Rival');
  rival.controller = { kind: 'rival', disposition: 'ambitious' };
  expect(content.dispositions['ambitious']?.restBand).toBe('exhausted');
  return { document, player, rival };
}

/** Appends an entry of `type` at `turn`, naming `participants`. */
function add(document: WorldDocument, turn: number, type: EngineEventType, participants: EntityId[], payload: object): void {
  append(document.history, { turn, type, participants, labels: {}, milestone: milestoneTypes[type], payload });
}

const heroesOf = (document: WorldDocument, guild: Guild): Hero[] =>
  guild.rosterIds.map((heroId) => document.world.heroes[heroId] as Hero);

/** Sets each Hero of `guild`'s Class to a Warrior, so that no Healer stands in a Party unless a test makes one. */
function warriors(document: WorldDocument, guild: Guild): void {
  for (const hero of heroesOf(document, guild)) hero.classKey = 'warrior';
}

const questId = (n: number): QuestId => makeId('quests', n);

describe('observeDispatches: the Parties sent, as they set out', () => {
  /** A Party row of `heroIds` at `fatigue`, sent by `guild`. */
  function send(document: WorldDocument, guild: Guild, n: number, fatigue: Record<string, number>): PartyId {
    const id = makeId('parties', n);
    document.world.parties[id] = {
      id,
      questId: questId(n),
      guildId: guild.id,
      heroIds: Object.keys(fatigue) as HeroId[],
      departedOnTurn: 1,
      returnsOnTurn: 8,
      fatigueAtDispatch: fatigue as Record<HeroId, number>,
    };
    return id;
  }

  test('a Party with a Hero tired or worse counts as tired, by its most tired Hero, and the mean Fatigue is over Heroes sent', () => {
    const { document, player, rival } = fixture('fatigue-sent');
    const [a, b, c] = player.rosterIds;
    const [r] = rival.rosterIds;
    if (a === undefined || b === undefined || c === undefined || r === undefined) throw new Error('Rosters too short');
    // 24 is weary's edge below, 50 tired's start: the band is the highest start reached.
    send(document, player, 1, { [a]: 10, [b]: 50 });
    send(document, player, 2, { [c]: 24 });
    send(document, rival, 3, { [r]: 80 });
    const taken = { player: noDispatchFatigue(), rival: noDispatchFatigue() };

    observeDispatches(taken, new Set(), document.world, deps.config);

    expect(taken.player).toEqual<DispatchFatigue>({
      parties: 2,
      tired: 1,
      byWorstBand: { fresh: 1, weary: 0, tired: 1, exhausted: 0 },
      heroes: 3,
      fatigue: 84,
      captainNamed: 0,
      captained: 0,
    });
    expect(taken.rival).toEqual<DispatchFatigue>({
      parties: 1,
      tired: 1,
      byWorstBand: { fresh: 0, weary: 0, tired: 0, exhausted: 1 },
      heroes: 1,
      fatigue: 80,
      captainNamed: 0,
      captained: 0,
    });
  });

  test("a Party counts the Guild's Captain only when the Captain is among its Heroes, and a Party is counted once", () => {
    const { document, player, rival } = fixture('fatigue-captain');
    const [a, b] = player.rosterIds;
    const [r, s] = rival.rosterIds;
    if (a === undefined || b === undefined || r === undefined || s === undefined) throw new Error('Rosters too short');
    player.captainId = a;
    rival.captainId = s;
    send(document, player, 1, { [a]: 0, [b]: 0 });
    send(document, player, 2, { [b]: 0 });
    send(document, rival, 3, { [r]: 0 });
    const taken = { player: noDispatchFatigue(), rival: noDispatchFatigue() };
    const seen = new Set<string>();

    observeDispatches(taken, seen, document.world, deps.config);
    observeDispatches(taken, seen, document.world, deps.config);

    expect([taken.player.parties, taken.player.captainNamed, taken.player.captained]).toEqual([2, 2, 1]);
    expect([taken.rival.parties, taken.rival.captainNamed, taken.rival.captained]).toEqual([1, 1, 0]);
  });

  test("the counter's observer meets a Party after the advance that left it out, and a Guild with no Captain is not counted as one", () => {
    const { document, player } = fixture('fatigue-observer');
    const [a] = player.rosterIds;
    if (a === undefined) throw new Error('Roster too short');
    send(document, player, 1, { [a]: 60 });
    const observer = observerOf('dispatchFatigue');

    observer.advanced?.({ before: document, after: document, events: [], from: 0, deps });
    observer.advanced?.({ before: document, after: document, events: [], from: 0, deps });

    expect(observer.value().player).toMatchObject({ parties: 1, tired: 1, captainNamed: 0, captained: 0 });
  });
});

describe('observeRestKept: the free Heroes a rest band keeps home', () => {
  test("the player's tired and worse are left out of the pool; a Rival's rest band is its own; a Hero away is not free", () => {
    const { document, player, rival } = fixture('fatigue-rest');
    const fatigues = [0, 30, 55, 90];
    heroesOf(document, player).forEach((hero, at) => (hero.fatigue = fatigues[at] as number));
    // The Rival rests at exhausted: of its four, only the one at 90 is kept home; a fifth is away, and so not free.
    heroesOf(document, rival).forEach((hero, at) => (hero.fatigue = fatigues[at] as number));
    for (const guild of Object.values(document.world.guilds)) {
      if (guild.id === player.id || guild.id === rival.id) continue;
      for (const hero of heroesOf(document, guild)) hero.fatigue = 0;
    }
    // Turn 2 is a night, the player's sample; Turn 3 a morning, before the Rivals' afternoon.
    const taken = { player: { guildDays: 0, guildDaysKept: 0, free: 0, kept: 0 }, rival: { guildDays: 0, guildDaysKept: 0, free: 0, kept: 0 } };
    document.world.turn = 2;
    observeRestKept(taken, document.world, deps);
    document.world.turn = 3;
    observeRestKept(taken, document.world, deps);

    const guilds = Object.values(document.world.guilds);
    const rivals = guilds.filter((guild) => guild.controller.kind === 'rival');
    expect(taken.player).toEqual({ guildDays: 1, guildDaysKept: 1, free: 4, kept: 2 });
    expect(taken.rival.guildDays).toBe(rivals.length);
    expect(taken.rival.guildDaysKept).toBe(1);
    expect(taken.rival.free).toBe(rivals.reduce((total, guild) => total + guild.rosterIds.length, 0));
    expect(taken.rival.kept).toBe(1);
  });

  test('a Hero away in a Party is not free; the player is sampled only on a night, the Rivals only on a morning', () => {
    const { document, player } = fixture('fatigue-rest-away');
    const [away] = heroesOf(document, player);
    if (away === undefined) throw new Error('Roster too short');
    away.partyId = makeId('parties', 1);
    for (const hero of heroesOf(document, player)) hero.fatigue = 60;
    const taken = { player: { guildDays: 0, guildDaysKept: 0, free: 0, kept: 0 }, rival: { guildDays: 0, guildDaysKept: 0, free: 0, kept: 0 } };
    const rivals = Object.values(document.world.guilds).filter((guild) => guild.controller.kind === 'rival').length;

    // The player's policy sends its Parties from the world a night leaves, as its Heroes come home and rest.
    document.world.turn = 5;
    observeRestKept(taken, document.world, deps);
    expect(taken.player).toEqual({ guildDays: 1, guildDaysKept: 1, free: 3, kept: 3 });
    expect(taken.rival.guildDays).toBe(0);

    // A morning is the world a Rival's afternoon chooses from, after the player has sent its Parties; an afternoon adds nothing.
    document.world.turn = 6;
    observeRestKept(taken, document.world, deps);
    document.world.turn = 7;
    observeRestKept(taken, document.world, deps);
    expect(taken.player.guildDays).toBe(1);
    expect(taken.rival.guildDays).toBe(rivals);
  });
});

describe('recoveryCounters: the Days a Hero spends recovering at home', () => {
  /** The crossing of `heroId`'s Fatigue into `to` at `turn`. */
  function crossed(document: WorldDocument, turn: number, heroId: HeroId, bandBefore: string, to: string): void {
    add(document, turn, 'hero.fatigue-changed', [heroId], { heroId, before: 0, after: 0, bandBefore, bandAfter: to });
  }
  const taken = (document: WorldDocument, turn: number, guild: Guild, n: number, heroIds: HeroId[]): void =>
    add(document, turn, 'quest.taken', [questId(n), guild.id, ...heroIds], { questId: questId(n), partyId: makeId('parties', n), guildId: guild.id, heroIds });
  const resolved = (document: WorldDocument, turn: number, guild: Guild, n: number, heroIds: HeroId[], deaths: HeroId[] = []): void =>
    add(document, turn, 'quest.resolved', [questId(n), guild.id, ...heroIds], { questId: questId(n), partyId: makeId('parties', n), guildId: guild.id, heroIds, deaths, band: 'success' });

  test('to below the rest band and to fresh, each in whole Days from the return, and a Hero sent first cut short', () => {
    const { document, player } = fixture('fatigue-recovery');
    const [a, b, c, d] = player.rosterIds;
    if (a === undefined || b === undefined || c === undefined || d === undefined) throw new Error('Roster too short');
    // a: out at 3, climbs to exhausted by its return at 14, then falls to tired (20), weary (26) and fresh (35).
    taken(document, 3, player, 1, [a]);
    crossed(document, 6, a, 'fresh', 'weary');
    crossed(document, 9, a, 'weary', 'tired');
    crossed(document, 12, a, 'tired', 'exhausted');
    resolved(document, 14, player, 1, [a]);
    // b: home tired at 20, sent again at 29 before it clears the band.
    crossed(document, 15, b, 'fresh', 'weary');
    // c: home weary, under the rest band, but not fresh; still recovering when the game stops. d died.
    crossed(document, 15, c, 'fresh', 'weary');
    crossed(document, 18, b, 'weary', 'tired');
    crossed(document, 20, a, 'exhausted', 'tired');
    resolved(document, 20, player, 2, [b]);
    resolved(document, 21, player, 4, [c, d], [d]);
    crossed(document, 26, a, 'tired', 'weary');
    taken(document, 29, player, 3, [b]);
    crossed(document, 35, a, 'weary', 'fresh');
    document.world.turn = 40;

    const { fatigueRecovery } = countGame(document, deps, undefined, undefined, only('fatigueRecovery'));

    expect(fatigueRecovery.player.toRest).toEqual({ spells: 2, done: 1, doneDays: 4, sent: 1, sentDays: 3, left: 0, open: 0 });
    expect(fatigueRecovery.player.toFresh).toEqual({ spells: 3, done: 1, doneDays: 7, sent: 1, sentDays: 3, left: 0, open: 1 });
    expect(fatigueRecovery.rival.toRest).toEqual({ spells: 0, done: 0, doneDays: 0, sent: 0, sentDays: 0, left: 0, open: 0 });
  });

  test('a Hero who leaves every Roster while recovering, by a Retirement or a fold, ends the recovery as left, never open nor later sent (DL-291)', () => {
    const { document, player } = fixture('fatigue-recovery-left');
    const [a, b] = player.rosterIds;
    if (a === undefined || b === undefined) throw new Error('Roster too short');
    // Both home tired at 14; a retires that night, b goes to the pool at a fold and is taken again
    // by another Guild 30 Days on, which must not count as a recovery cut short after those Days.
    crossed(document, 9, a, 'fresh', 'tired');
    crossed(document, 9, b, 'fresh', 'tired');
    resolved(document, 14, player, 1, [a, b]);
    add(document, 14, 'hero.retired', [a, player.id], { heroId: a, guildId: player.id, age: 60 });
    add(document, 17, 'hero.left-guild', [b, player.id], { heroId: b, guildId: player.id });
    taken(document, 107, player, 2, [b]);
    document.world.turn = 110;

    const { fatigueRecovery } = countGame(document, deps, undefined, undefined, only('fatigueRecovery'));

    expect(fatigueRecovery.player.toRest).toEqual({ spells: 2, done: 0, doneDays: 0, sent: 0, sentDays: 0, left: 2, open: 0 });
    expect(fatigueRecovery.player.toFresh).toEqual({ spells: 2, done: 0, doneDays: 0, sent: 0, sentDays: 0, left: 2, open: 0 });
  });

  test('a Hero who died on the Quest begins no recovery, though the night before left them as tired as the one who came home', () => {
    const { document, player } = fixture('fatigue-recovery-dead');
    const [a, b] = player.rosterIds;
    if (a === undefined || b === undefined) throw new Error('Roster too short');
    taken(document, 3, player, 1, [a, b]);
    crossed(document, 9, a, 'fresh', 'tired');
    crossed(document, 9, b, 'fresh', 'tired');
    resolved(document, 11, player, 1, [a, b], [b]);
    crossed(document, 17, a, 'tired', 'fresh');
    document.world.turn = 20;

    const { fatigueRecovery } = countGame(document, deps, undefined, undefined, only('fatigueRecovery'));

    expect(fatigueRecovery.player.toRest).toEqual({ spells: 1, done: 1, doneDays: 2, sent: 0, sentDays: 0, left: 0, open: 0 });
    expect(fatigueRecovery.player.toFresh).toEqual({ spells: 1, done: 1, doneDays: 2, sent: 0, sentDays: 0, left: 0, open: 0 });
  });

  test("a Rival's rest band is its Disposition's, and a Guild with none begins no recovery to it", () => {
    const { document, rival } = fixture('fatigue-recovery-rival');
    const [r, s] = rival.rosterIds;
    if (r === undefined || s === undefined) throw new Error('Roster too short');
    // An ambitious Rival rests at exhausted: r is home tired, which it sends again; s is home exhausted and clears it.
    crossed(document, 4, r, 'fresh', 'tired');
    crossed(document, 4, s, 'fresh', 'exhausted');
    resolved(document, 6, rival, 1, [r]);
    resolved(document, 6, rival, 2, [s]);
    crossed(document, 9, s, 'exhausted', 'tired');
    crossed(document, 15, s, 'tired', 'fresh');
    document.world.turn = 20;

    const { fatigueRecovery } = countGame(document, deps, undefined, undefined, only('fatigueRecovery'));

    expect(fatigueRecovery.rival.toRest).toEqual({ spells: 1, done: 1, doneDays: 1, sent: 0, sentDays: 0, left: 0, open: 0 });
    expect(fatigueRecovery.rival.toFresh).toEqual({ spells: 2, done: 1, doneDays: 3, sent: 0, sentDays: 0, left: 0, open: 1 });

    // A Disposition resting no one begins no recovery to its rest band.
    rival.controller = { kind: 'rival', disposition: 'reckless' };
    expect(content.dispositions['reckless']?.restBand).toBeNull();
    const none = countGame(document, deps, undefined, undefined, only('fatigueRecovery')).fatigueRecovery.rival;
    expect(none.toRest.spells).toBe(0);
    expect(none.toFresh.spells).toBe(2);
  });
});

describe('reliefCounters: the hurt relieved at each Injury taken on a Quest', () => {
  const injured = (document: WorldDocument, turn: number, guild: Guild, heroId: HeroId, n: number): void =>
    add(document, turn, 'hero.injured', [heroId, questId(n), guild.id], { heroId, questId: questId(n), typeKey: 'deep-cut', healsOnTurn: turn + 9 });
  const encounter = (document: WorldDocument, guild: Guild, n: number, index: number, hurt: HeroId[], died: HeroId[] = []): void =>
    add(document, 5, 'quest.encounter', [questId(n), guild.id], { questId: questId(n), guildId: guild.id, index, kind: 'combat', outcome: 'success', injured: hurt, died });
  const healed = (document: WorldDocument, guild: Guild, heroId: HeroId, n: number, encounterIndex: number): void =>
    add(document, 5, 'item.expended', [questId(n), guild.id, heroId], {
      questId: questId(n),
      guildId: guild.id,
      effect: 'heal',
      heroId,
      days: 4,
      encounterIndex,
      stackId: makeId('stacks', 1),
      definitionKey: 'bandage',
    });
  const taken = (document: WorldDocument, guild: Guild, n: number, heroIds: HeroId[]): void =>
    add(document, 4, 'quest.taken', [questId(n), guild.id, ...heroIds], { questId: questId(n), partyId: makeId('parties', n), guildId: guild.id, heroIds });

  test('by a Healer who had not died, by a heal Item, by both, by neither, and the last Encounter reached', () => {
    const { document, player, rival } = fixture('relief');
    warriors(document, player);
    warriors(document, rival);
    const [a, b, c, d] = player.rosterIds;
    const [r, s] = rival.rosterIds;
    if (a === undefined || b === undefined || c === undefined || d === undefined || r === undefined || s === undefined) throw new Error('Rosters too short');
    (document.world.heroes[c] as Hero).classKey = 'healer';
    // Quest 1: a hurt at 0 with the Healer c beside them and an Item spent on them (both); b hurt at 1, as c dies there (neither);
    // a hurt again at 2, the last Encounter, the Healer dead (neither, and at the last).
    taken(document, player, 1, [a, b, c]);
    taken(document, player, 2, [d, c]);
    taken(document, rival, 3, [r, s]);
    encounter(document, player, 1, 0, [a]);
    healed(document, player, a, 1, 0);
    encounter(document, player, 1, 1, [b], [c]);
    encounter(document, player, 1, 2, [a]);
    // Quest 2: d hurt at 0 with the Healer c alone (a Healer).
    encounter(document, player, 2, 0, [d]);
    encounter(document, player, 2, 1, []);
    // The Rival's Quest 3: r hurt with an Item and no Healer (an Item); s hurt with nothing (neither).
    encounter(document, rival, 3, 0, [r, s]);
    healed(document, rival, r, 3, 0);
    injured(document, 6, player, a, 1);
    injured(document, 6, player, b, 1);
    injured(document, 6, player, a, 1);
    injured(document, 7, player, d, 2);
    // An Injury off a Quest is none of a Party's.
    add(document, 8, 'hero.injured', [a, player.id], { heroId: a, questId: null, typeKey: 'deep-cut', healsOnTurn: 20 });
    injured(document, 9, rival, r, 3);
    injured(document, 9, rival, s, 3);
    document.world.turn = 20;

    const { hurtRelief } = countGame(document, deps, undefined, undefined, only('hurtRelief'));

    expect(hurtRelief.player).toEqual({ injuries: 4, healer: 1, item: 0, both: 1, neither: 2, atLast: 1 });
    expect(hurtRelief.rival).toEqual({ injuries: 2, healer: 0, item: 1, both: 0, neither: 1, atLast: 2 });
  });

  test('a hurt Healer is not relieved by themselves, only by another Healer of the Party', () => {
    const { document, player } = fixture('relief-healer-hurt');
    warriors(document, player);
    const [a, b, c] = player.rosterIds;
    if (a === undefined || b === undefined || c === undefined) throw new Error('Roster too short');
    (document.world.heroes[a] as Hero).classKey = 'healer';
    (document.world.heroes[c] as Hero).classKey = 'healer';
    // Quest 1: the Healer a hurt beside a Warrior (neither); Quest 2: a hurt beside the Healer c (a Healer).
    taken(document, player, 1, [a, b]);
    taken(document, player, 2, [a, c]);
    encounter(document, player, 1, 0, [a]);
    encounter(document, player, 1, 1, []);
    encounter(document, player, 2, 0, [a]);
    encounter(document, player, 2, 1, []);
    injured(document, 6, player, a, 1);
    injured(document, 12, player, a, 2);

    expect(countGame(document, deps, undefined, undefined, only('hurtRelief')).hurtRelief.player).toEqual({ injuries: 2, healer: 1, item: 0, both: 0, neither: 1, atLast: 0 });
  });

  test("a Healer relieves nothing of an Injury at the Quest's last Encounter reached, as the engine eases the next one on; a heal Item spent there still counts", () => {
    const { document, player } = fixture('relief-at-last');
    warriors(document, player);
    const [a, b, c] = player.rosterIds;
    if (a === undefined || b === undefined || c === undefined) throw new Error('Roster too short');
    (document.world.heroes[c] as Hero).classKey = 'healer';
    // Quest 1, of one Encounter: a and b hurt there, the Healer c beside them, an Item spent on b.
    taken(document, player, 1, [a, b, c]);
    encounter(document, player, 1, 0, [a, b]);
    healed(document, player, b, 1, 0);
    injured(document, 6, player, a, 1);
    injured(document, 6, player, b, 1);

    expect(countGame(document, deps, undefined, undefined, only('hurtRelief')).hurtRelief.player).toEqual({ injuries: 2, healer: 0, item: 1, both: 0, neither: 1, atLast: 2 });
  });

  test('counts an Injury no Encounter names as relieved by neither, as a hand-built History may give one', () => {
    const { document, player } = fixture('relief-malformed');
    const [a] = player.rosterIds;
    if (a === undefined) throw new Error('Roster too short');
    taken(document, player, 1, [a]);
    encounter(document, player, 1, 0, []);
    injured(document, 6, player, a, 1);

    expect(countGame(document, deps, undefined, undefined, only('hurtRelief')).hurtRelief.player).toEqual({ injuries: 1, healer: 0, item: 0, both: 0, neither: 1, atLast: 0 });
  });
});

/** A config with no Fatigue to rise: the lines read 0 where Fatigue moves nothing, a v1.2.0 game's. */
const noFatigue: EngineDeps = { config: { ...deps.config, fatigueRiseByTier: [0] }, content };

describe('the lines in a game played', () => {
  test('with Fatigue rising no night, no Party is sent tired and no Hero is kept home', async () => {
    const { playGame } = await import('./play.js');
    const { gatherers } = await import('./counter.js');
    const { gameCounters } = await import('./game-counters.js');
    const watchers = gatherers(gameCounters).filter(([key]) => key === 'dispatchFatigue' || key === 'restKept');
    playGame('fatigue-none', noFatigue, { years: 30 / noFatigue.config.turnsPerYear, observers: watchers.map(([, gatherer]) => gatherer) });
    const [sent, rest] = watchers.map(([, gatherer]) => gatherer.value()) as [Record<'player' | 'rival', DispatchFatigue>, Record<'player' | 'rival', { kept: number }>];

    expect(sent.player.parties).toBeGreaterThan(0);
    expect(sent.player.tired + sent.rival.tired).toBe(0);
    expect(sent.player.fatigue + sent.rival.fatigue).toBe(0);
    expect(rest.player.kept + rest.rival.kept).toBe(0);
  });
});
