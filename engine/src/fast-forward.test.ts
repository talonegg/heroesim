import { describe, expect, test } from 'vitest';
import { dispatch } from './actions/dispatch.js';
import { advance } from './advance.js';
import type { EngineDeps } from './config.js';
import { partyFor, staffableQuests } from './controllers/rival.js';
import { createWorld } from './create.js';
import type { Guild, Hero, Party, Quest, WorldDocument } from './document.js';
import type { EngineEvent } from './events.js';
import { fastForward } from './fast-forward.js';
import { playerGuild } from './selectors.js';
import { serialise } from './serialise.js';
import { alwaysStops, stopConditions, type StopCondition } from './stops.js';
import { timeOfDay } from './time.js';
import { testDeps, withValid } from './world.test-support.js';

const setup = { guildmasterName: 'Ada', guildName: 'The Test', createdAt: 'test' };

function created(seed: string, deps: EngineDeps): WorldDocument {
  return withValid(createWorld(seed, setup, deps).document, deps);
}

function player(document: WorldDocument): Guild {
  const guild = playerGuild(document.world);
  if (guild === undefined) throw new Error('No player Guild');
  return guild;
}

function ofType<Type extends EngineEvent['type']>(events: readonly EngineEvent[], type: Type) {
  return events.filter((event): event is Extract<EngineEvent, { type: Type }> => event.type === type);
}

/**
 * Sends the player's whole Roster on the longest Quest it can staff, so that no Hero is left idle
 * and no decision can be needed until the Party comes home. Returns the document and the Party.
 */
function sendEveryone(document: WorldDocument, deps: EngineDeps): { document: WorldDocument; party: Party } {
  const guild = player(document);
  const quests = staffableQuests(document.world, guild, deps.content).filter(
    (quest) => quest.requirements.partySizeMax >= guild.rosterIds.length,
  );
  const quest = quests.sort((a, b) => b.durationTurns - a.durationTurns)[0];
  if (quest === undefined) throw new Error('No Quest takes the whole Roster');
  const sent = dispatch(document, { guildId: guild.id, questId: quest.id, heroIds: [...guild.rosterIds] }, deps);
  if (!sent.ok) throw new Error(`Rejected ${sent.rejection.reason}`);
  const party = Object.values(sent.document.world.parties).find((row) => row.guildId === guild.id);
  if (party === undefined) throw new Error('No Party');
  return { document: withValid(sent.document, deps), party };
}

describe('fastForward: a Party returning (always on)', () => {
  // Rivals act here on purpose: their Parties come home on earlier nights, and must not stop the
  // fast forward, which watches the player's Guild only. Two Heroes, both sent, so no decision
  // can be needed while they are away.
  const deps = testDeps({ startingRosterSize: 2 });

  test.each(['ff-1', 'ff-2', 'ff-3'])(
    'until ["party-returned"] stops on the exact Turn the Party returns, not on a Rival\'s (seed %s)',
    (seed) => {
      const { document, party } = sendEveryone(created(seed, deps), deps);
      const guildId = player(document).id;
      const entries = document.history.entries.length;

      const result = fastForward(document, { guildId, until: ['party-returned'], maxTurns: 1080 }, deps);

      const after = withValid(result.document, deps);
      expect(after.world.turn).toBe(party.returnsOnTurn);
      expect(timeOfDay(after.world.turn)).toBe('night');
      expect(result.stoppedBecause).toEqual({ kind: 'party-returned', guildId, partyIds: [party.id] });
      expect(after.world.parties[party.id]).toBeUndefined();
      // Rival Parties came home earlier and did not stop it.
      const rivalReturns = ofType(result.events, 'quest.resolved').filter((event) => event.payload.guildId !== guildId);
      expect(rivalReturns.some((event) => event.turn < party.returnsOnTurn)).toBe(true);
      // Every event since the call, in order, as the History holds them.
      expect(after.history.entries.slice(entries)).toEqual(result.events);
    },
  );

  test('stops there with no condition listed too: party-returned is always on', () => {
    const { document, party } = sendEveryone(created('ff-1', deps), deps);

    const result = fastForward(document, { guildId: player(document).id, until: [], maxTurns: 1080 }, deps);

    expect(result.document.world.turn).toBe(party.returnsOnTurn);
    expect(result.stoppedBecause.kind).toBe('party-returned');
  });

  test('plays exactly the Turns advance plays: the same document, Turn for Turn', () => {
    const first = sendEveryone(created('ff-2', deps), deps);
    const second = sendEveryone(created('ff-2', deps), deps);

    const forwarded = fastForward(first.document, { guildId: player(first.document).id, until: [], maxTurns: 1080 }, deps);
    let stepped = second.document;
    while (stepped.world.turn < forwarded.document.world.turn) stepped = advance(stepped, deps).document;

    expect(serialise(forwarded.document)).toBe(serialise(stepped));
  });
});

describe('fastForward: a decision needed (always on)', () => {
  // No Rivals: they would take the Board each afternoon. Four idle Heroes and a full Board, which
  // is not drawn again until the morning of Day 3, when the first offers expire.
  const deps = testDeps({ rivalCount: 0 });

  test('stops on the morning new Quests the idle Roster could staff reach the Board, and not before', () => {
    const document = created('ff-decide', deps);
    const guild = player(document);
    // Quests the Roster could staff stand on the Board from the start: the caller has seen them.
    expect(staffableQuests(document.world, guild, deps.content).length).toBeGreaterThan(0);

    const result = fastForward(document, { guildId: guild.id, until: [], maxTurns: 1080 }, deps);

    const after = withValid(result.document, deps);
    const { turn } = after.world;
    expect(result.stoppedBecause.kind).toBe('decision-needed');
    if (result.stoppedBecause.kind !== 'decision-needed') return;
    expect(timeOfDay(turn)).toBe('morning');
    expect(turn).toBeGreaterThan(document.world.turn + 1);
    // The first morning anything was offered since the call.
    const offered = ofType(result.events, 'quest.offered');
    expect(offered.length).toBeGreaterThan(0);
    expect(Math.min(...offered.map((event) => event.turn))).toBe(turn);
    // Each Quest named is new this morning, on the Board, and one `dispatch` accepts a Party for.
    const { guildId, questIds } = result.stoppedBecause;
    expect(guildId).toBe(guild.id);
    expect(questIds.length).toBeGreaterThan(0);
    const newToday = new Set(offered.filter((event) => event.turn === turn).map((event) => event.payload.questId));
    for (const questId of questIds) {
      expect(newToday.has(questId), questId).toBe(true);
      const quest = after.world.quests[questId] as Quest;
      const heroIds = partyFor(quest, player(after).rosterIds.map((id) => after.world.heroes[id]!), deps.content);
      expect(heroIds, questId).not.toBeNull();
      expect(dispatch(after, { guildId, questId, heroIds: heroIds ?? [] }, deps).ok, questId).toBe(true);
    }
  });

  test('never stops while the whole Roster is away, though new Quests reach the Board', () => {
    const roster = testDeps({ rivalCount: 0, startingRosterSize: 2 });
    const { document, party } = sendEveryone(created('ff-1', roster), roster);
    const guildId = player(document).id;
    const eve = party.returnsOnTurn - 1 - document.world.turn;

    const result = fastForward(document, { guildId, until: [], maxTurns: eve }, roster);

    withValid(result.document, roster);
    expect(ofType(result.events, 'quest.offered').length).toBeGreaterThan(0);
    expect(result.stoppedBecause).toEqual({ kind: 'max-turns' });
    expect(result.document.world.turn).toBe(party.returnsOnTurn - 1);
  });

  test('never stops while a Party is out, though the Heroes at home could staff new Quests', () => {
    const document = created('ff-2', deps);
    const guild = player(document);
    // Two of the four go on the longest Quest a pair can take; two stay at home.
    const pairs = staffableQuests(document.world, guild, deps.content).filter(
      (quest) => quest.requirements.partySizeMin <= 2 && quest.requirements.partySizeMax >= 2 && quest.durationTurns >= 12,
    );
    const quest = pairs.sort((a, b) => b.durationTurns - a.durationTurns)[0];
    if (quest === undefined) throw new Error('No long Quest a pair can take');
    const available = guild.rosterIds.map((id) => document.world.heroes[id] as Hero);
    const going = partyFor({ ...quest, requirements: { ...quest.requirements, partySizeMin: 2 } }, available, deps.content);
    if (going === null) throw new Error('No pair for the Quest');
    const sent = dispatch(document, { guildId: guild.id, questId: quest.id, heroIds: going }, deps);
    if (!sent.ok) throw new Error(`Rejected ${sent.rejection.reason}`);
    const party = Object.values(sent.document.world.parties)[0] as Party;

    const result = fastForward(withValid(sent.document, deps), { guildId: guild.id, until: [], maxTurns: 1080 }, deps);

    expect(result.stoppedBecause).toEqual({ kind: 'party-returned', guildId: guild.id, partyIds: [party.id] });
    expect(result.document.world.turn).toBe(party.returnsOnTurn);
    // New Quests reached the Board while the Party was out, and the two at home could staff some.
    const offered = new Set(ofType(result.events, 'quest.offered').map((event) => event.payload.questId));
    expect(offered.size).toBeGreaterThan(0);
    // Replayed Turn by Turn from the same seed, on a History of its own.
    const again = dispatch(created('ff-2', deps), { guildId: guild.id, questId: quest.id, heroIds: going }, deps);
    if (!again.ok) throw new Error(`Rejected ${again.rejection.reason}`);
    let replay = again.document;
    let couldStaffNew = false;
    while (replay.world.turn < party.returnsOnTurn) {
      replay = advance(replay, deps).document;
      if (staffableQuests(replay.world, player(replay), deps.content).some((row) => offered.has(row.id))) couldStaffNew = true;
    }
    expect(couldStaffNew).toBe(true);
  });
});

describe('fastForward: the pool refreshing (opt-in)', () => {
  // Unattached Heroes leave after two Days, so the pool refills most nights whether or not the
  // Rivals recruit (which the balance pass, DL-35, made rare).
  const deps = testDeps({ startingRosterSize: 2, unattachedStayDays: 2 });

  test('never stops unless listed in until', () => {
    const { document, party } = sendEveryone(created('ff-3', deps), deps);

    const result = fastForward(document, { guildId: player(document).id, until: [], maxTurns: 1080 }, deps);

    const arrivals = ofType(result.events, 'hero.generated').filter((event) => event.payload.guildId === null);
    expect(arrivals.length).toBeGreaterThan(0);
    // The pool refreshes at night, the return night included: no refresh before it stopped the run.
    expect(arrivals.some((event) => event.turn < party.returnsOnTurn)).toBe(true);
    expect(arrivals.every((event) => event.turn <= party.returnsOnTurn)).toBe(true);
    expect(result.stoppedBecause.kind).toBe('party-returned');
  });

  test('stops on the first night Heroes enter the pool when listed, naming them', () => {
    const { document } = sendEveryone(created('ff-3', deps), deps);

    const result = fastForward(document, { guildId: player(document).id, until: ['pool-refreshed'], maxTurns: 1080 }, deps);

    const after = withValid(result.document, deps);
    const arrivals = ofType(result.events, 'hero.generated').filter((event) => event.payload.guildId === null);
    expect(arrivals.length).toBeGreaterThan(0);
    expect(arrivals.every((event) => event.turn === after.world.turn)).toBe(true);
    expect(result.stoppedBecause).toEqual({ kind: 'pool-refreshed', heroIds: arrivals.map((event) => event.payload.heroId) });
  });
});

describe('fastForward: an ending', () => {
  const deps = testDeps({ rivalCount: 0 });

  test('an ended world stops at once with ended, the document unchanged, whatever maxTurns', () => {
    const document = created('ff-ended', deps);
    document.world.ended = { turn: 0, reason: 'retirement' };
    const guildId = player(document).id;
    const before = serialise(document);

    for (const maxTurns of [0, 1, 1080]) {
      const result = fastForward(document, { guildId, until: ['pool-refreshed'], maxTurns }, deps);
      expect(result).toEqual({ document, events: [], stoppedBecause: { kind: 'ended' } });
      expect(result.document).toBe(document);
    }
    expect(serialise(document)).toBe(before);
  });

  test('stops with ended on the night the game ends', () => {
    // Every Guildmaster is past retiring: the player's retires on the first night.
    const retiring = testDeps({ rivalCount: 0, guildmasterRetirementAge: 1 });
    const document = created('ff-retire', retiring);

    const result = fastForward(document, { guildId: player(document).id, until: [], maxTurns: 1080 }, retiring);

    const after = withValid(result.document, retiring);
    expect(result.stoppedBecause).toEqual({ kind: 'ended' });
    expect(after.world.ended).toEqual({ turn: 2, reason: 'retirement' });
    expect(ofType(result.events, 'game.ended').map((event) => event.turn)).toEqual([2]);
  });
});

describe('fastForward: maxTurns', () => {
  test('0 returns the document unchanged with max-turns', () => {
    const deps = testDeps();
    const document = created('ff-zero', deps);
    const before = serialise(document);

    const result = fastForward(document, { guildId: player(document).id, until: [...stopConditions], maxTurns: 0 }, deps);

    expect(result).toEqual({ document, events: [], stoppedBecause: { kind: 'max-turns' } });
    expect(result.document).toBe(document);
    expect(serialise(document)).toBe(before);
  });

  // Property-style: over seeds, sets of conditions and caps, it always stops within the cap, on a
  // reason it was listening for, and exactly at the cap when it stops for max-turns.
  const untils: StopCondition[][] = [[], ['pool-refreshed'], ['party-returned'], ['ended', 'decision-needed'], [...stopConditions]];
  const caps = [1, 2, 9, 30];
  const cases = ['cap-1', 'cap-2', 'cap-3'].flatMap((seed) =>
    untils.flatMap((until) => caps.map((maxTurns) => ({ seed, until, maxTurns }))),
  );

  test('always terminates within maxTurns', () => {
    const deps = testDeps();
    for (const { seed, until, maxTurns } of cases) {
      const { document } = createWorld(seed, setup, deps);
      const label = `${seed} ${until.join(',')} ${maxTurns}`;

      const result = fastForward(document, { guildId: player(document).id, until, maxTurns }, deps);

      // The longest runs validated; the validator's cost is not what this test measures.
      if (maxTurns === caps.at(-1)) withValid(result.document, deps);
      const played = result.document.world.turn - document.world.turn;
      expect(played, label).toBeGreaterThanOrEqual(1);
      expect(played, label).toBeLessThanOrEqual(maxTurns);
      const { kind } = result.stoppedBecause;
      if (kind === 'max-turns') expect(played, label).toBe(maxTurns);
      else expect(alwaysStops[kind] || until.includes(kind), label).toBe(true);
    }
  });

  test('stops at the cap even when nothing else can stop it', () => {
    // No Rivals, a Party out that returns long after the cap, and nothing opted into.
    const deps = testDeps({ rivalCount: 0, startingRosterSize: 2 });
    const { document, party } = sendEveryone(created('ff-1', deps), deps);
    const maxTurns = Math.min(5, party.returnsOnTurn - document.world.turn - 1);

    const result = fastForward(document, { guildId: player(document).id, until: [], maxTurns }, deps);

    expect(result.stoppedBecause).toEqual({ kind: 'max-turns' });
    expect(result.document.world.turn).toBe(document.world.turn + maxTurns);
  });

  test.each([-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])('throws on maxTurns %s, a programming error', (maxTurns) => {
    const deps = testDeps();
    const document = created('ff-bad', deps);
    expect(() => fastForward(document, { guildId: player(document).id, until: [], maxTurns }, deps)).toThrow(RangeError);
  });

  test('throws on an unknown condition or a Guild not in the world', () => {
    const deps = testDeps();
    const document = created('ff-bad', deps);
    const guildId = player(document).id;
    const unknown = ['returns'] as unknown as StopCondition[];
    expect(() => fastForward(document, { guildId, until: unknown, maxTurns: 3 }, deps)).toThrow(RangeError);
    expect(() => fastForward(document, { guildId: 'guild-000099' as Guild['id'], until: [], maxTurns: 3 }, deps)).toThrow(
      RangeError,
    );
  });
});
