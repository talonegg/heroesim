import { afterEach, describe, expect, test, vi } from 'vitest';
import { dispatch } from '../actions/dispatch.js';
import { advance } from '../advance.js';
import type { EngineDeps, GameConfig } from '../config.js';
import type { ContentSet } from '../content-types.js';
import { createWorld } from '../create.js';
import type { Guild, GuildId, Guildmaster, Hero, HeroId, Party, Patron, Quest, World, WorldDocument } from '../document.js';
import type { EngineEvent, EngineEventOf, EngineEventType } from '../events.js';
import { entriesFor } from '../history.js';
import { phases } from '../pipeline.js';
import { encounterCount } from '../quest-engine/encounters.js';
import { regardValue } from '../regard.js';
import { createStreams } from '../rng.js';
import { playerGuild } from '../selectors.js';
import { dayOf, nightOf, timeOfDay } from '../time.js';
import {
  certainHarmContent,
  harmlessContent,
  plannedStreams,
  testContent,
  testDeps,
  withEncounters,
  withValid,
} from '../world.test-support.js';
import { phaseContext } from './phase.js';
import { questsConclude } from './quests-conclude.js';

// M2-S5: the night's `questsConclude` (DL-29), through M4-S2's Quest Engine (DL-42). Parties are
// sent by `dispatch` from created worlds and played to the afternoon before they come home; a test
// then plays the return night through `advance`, or runs the phase alone on a copy when other night
// phases would blur what it checks (the Guild State Engine's Upkeep and Fame floor). A test of harm
// gives its Quest one Encounter and content whose failures harm for certain.

const setup = { guildmasterName: 'Ada', guildName: 'The Test', createdAt: 'test' };

afterEach(() => {
  vi.restoreAllMocks();
});

/**
 * The test config with no Rivals: from M2-S9 they take Quests and send Parties every afternoon
 * (DL-30), and a test whose subject is one Party stills them (DL-30 item 11). The Check's variance
 * and Skill bonus and the bands are pinned (M4-S2), and `content` is the test content unless given.
 */
function soloDeps(overrides: Partial<GameConfig> = {}, content: ContentSet = testContent): EngineDeps {
  return testDeps(
    {
      rivalCount: 0,
      checkVariance: 0.2,
      skillBonusPerRating: 2,
      bandBySuccessShare: { successAbove: 0.5, strongAtLeast: 1 },
      ...overrides,
    },
    content,
  );
}

/** One Encounter, so a test of harm meets one failed Check: one Death and one Injury under certainHarmContent. */
const oneEncounter = ['ambush-on-the-road'];

/** Stills every Rival's controller until the spy is restored, for a test whose subject is a Rival's own Party. */
function stillRivalControllers(): void {
  const rivalControllers = phases.find((phase) => phase.name === 'rivalControllers');
  if (rivalControllers === undefined) throw new Error('No rivalControllers phase');
  vi.spyOn(rivalControllers, 'run').mockReturnValue([]);
}

/** Advances to Turn `turn`, validating every document, and returns the events of the Turns played. */
function playTo(document: WorldDocument, turn: number, deps: EngineDeps): { document: WorldDocument; events: EngineEvent[] } {
  let current = document;
  const events: EngineEvent[] = [];
  while (current.world.turn < turn) {
    const result = advance(current, deps);
    current = withValid(result.document, deps);
    events.push(...result.events);
  }
  return { document: current, events };
}

const ofType = <Type extends EngineEventType>(events: readonly EngineEvent[], type: Type): EngineEventOf<Type>[] =>
  events.filter((event): event is EngineEventOf<Type> => event.type === type);

interface Away {
  /** The document on the afternoon before the Party's return night. */
  eve: WorldDocument;
  party: Party;
  quest: Quest;
  guildId: GuildId;
  heroIds: HeroId[];
  /** Everything played before the eve. */
  events: EngineEvent[];
}

/**
 * A world created from `seed` whose Guild (the player's, or the first Rival's) sends its first
 * `size` Heroes on the first Quest on the Board that asks for no Class or Skill, at `difficulty`
 * and through `encounterKeys` when given, played to the afternoon before the Party comes home, or
 * daysEarly Days before that.
 */
function sentAway(
  seed: string,
  deps: EngineDeps,
  {
    size = 2,
    rival = false,
    difficulty,
    encounterKeys,
    daysEarly = 0,
  }: { size?: number; rival?: boolean; difficulty?: number; encounterKeys?: string[]; daysEarly?: number } = {},
): Away {
  const start = createWorld(seed, setup, deps).document;
  const guilds = Object.values(start.world.guilds);
  const guild = (rival ? guilds.find((it) => it.controller.kind === 'rival') : playerGuild(start.world)) as Guild;
  const heroIds = guild.rosterIds.slice(0, size);
  const open = start.world.board
    .map((id) => start.world.quests[id] as Quest)
    .find(({ requirements: { classKey, skillKey, partySizeMin, partySizeMax } }) =>
      classKey === undefined && skillKey === undefined && partySizeMin <= size && size <= partySizeMax,
    );
  if (open === undefined) throw new Error(`No open Quest for ${size} on ${seed}'s first Board`);
  const sent = dispatch(start, { guildId: guild.id, questId: open.id, heroIds }, deps);
  if (!sent.ok) throw new Error(`Refused: ${sent.rejection.reason}`);
  const quest = sent.document.world.quests[open.id] as Quest;
  if (difficulty !== undefined) quest.difficulty = difficulty;
  if (encounterKeys !== undefined) quest.encounterKeys = [...encounterKeys];
  const party = sent.document.world.parties[quest.partyIds[0] as Party['id']] as Party;
  const { document: eve, events } = playTo(withValid(sent.document, deps), party.returnsOnTurn - 1 - 3 * daysEarly, deps);
  return { eve, party: structuredClone(party), quest: structuredClone(quest), guildId: guild.id, heroIds, events };
}

/** Runs the phase alone on a copy of `eve`'s world moved on to the return night. */
function concludeAlone(eve: WorldDocument, deps: EngineDeps): { world: World; events: EngineEvent[] } {
  const world = structuredClone(eve.world);
  world.turn += 1;
  const events = questsConclude(world, phaseContext(world, deps, eve.history));
  return { world, events };
}

const hero = (world: World, id: HeroId): Hero => world.heroes[id] as Hero;
const guildOf = (world: World, id: GuildId): Guild => world.guilds[id] as Guild;

describe('questsConclude', () => {
  test("resolves a Party on its return night and not before: quest.resolved, the Quest and the Party gone, the Heroes free", () => {
    const deps = soloDeps();
    const { eve, party, quest, heroIds, events: before } = sentAway('return-night', deps);

    expect(timeOfDay(party.returnsOnTurn)).toBe('night');
    expect(ofType(before, 'quest.resolved')).toEqual([]);
    expect(eve.world.parties[party.id]).toEqual(party);

    const { document, events } = playTo(eve, party.returnsOnTurn, deps);

    const [resolved] = ofType(events, 'quest.resolved');
    expect(resolved).toMatchObject({
      turn: party.returnsOnTurn,
      participants: [quest.id, party.id, ...heroIds, party.guildId, quest.patronId],
      milestone: false,
      payload: { questId: quest.id, partyId: party.id, guildId: party.guildId, heroIds, templateKey: quest.templateKey },
    });
    expect(document.world.quests).not.toHaveProperty(quest.id);
    expect(document.world.parties).not.toHaveProperty(party.id);
    const positions = document.history.byType['quest.resolved'] ?? [];
    expect(positions.map((position) => document.history.entries[position])).toContainEqual(resolved);
    // Newest first: offered, taken, then resolved with any Injury or Death that names the Quest.
    const questEntries = entriesFor(document.history, quest.id).map((entry) => entry.type);
    expect(questEntries.slice(-2)).toEqual(['quest.taken', 'quest.offered']);
    expect(questEntries).toContain('quest.resolved');
    for (const heroId of heroIds) {
      if (hero(document.world, heroId).diedOnTurn === null) expect(hero(document.world, heroId).partyId).toBeNull();
    }
  });

  test('moves Wealth, Fame and XP by the outcome, the XP to every Hero who came home', () => {
    const deps = soloDeps();
    for (const difficulty of [1, 40, 5000]) {
      const { eve, guildId, heroIds } = sentAway(`moves-${difficulty}`, deps, { difficulty });
      const guildBefore = guildOf(eve.world, guildId);

      const { world, events } = concludeAlone(eve, deps);

      const [resolved] = ofType(events, 'quest.resolved');
      const outcome = resolved?.payload;
      if (outcome === undefined) throw new Error('Not resolved');
      expect(guildOf(world, guildId).wealth).toBe(guildBefore.wealth + outcome.wealthDelta);
      expect(guildOf(world, guildId).fame).toBe(guildBefore.fame + outcome.fameDelta);
      const survivors = heroIds.filter((id) => !outcome.deaths.includes(id));
      expect(outcome.xpPerHero).toBeGreaterThan(0);
      for (const heroId of survivors) {
        expect(hero(world, heroId).xp).toBe(hero(eve.world, heroId).xp + outcome.xpPerHero);
        expect(hero(world, heroId).level).toBe(1);
      }
      expect(ofType(events, 'hero.xp-gained').map((event) => event.payload)).toEqual(
        survivors.map((heroId) => ({ heroId, questId: outcome.questId, amount: outcome.xpPerHero })),
      );
      withValid({ ...eve, world }, deps);
    }
  });

  test('a Hero who dies leaves the Roster, keeps their row and Guild, and is indexed in the History by the Milestone', () => {
    const deps = soloDeps({}, certainHarmContent);
    const { eve, party, guildId, heroIds } = sentAway('death', deps, { difficulty: 5000, encounterKeys: oneEncounter });

    const { document, events } = playTo(eve, party.returnsOnTurn, deps);

    const [died] = ofType(events, 'hero.died');
    const deadId = died?.payload.heroId as HeroId;
    expect(heroIds).toContain(deadId);
    expect(died).toMatchObject({ milestone: true, participants: [deadId, party.questId, guildId] });
    const dead = hero(document.world, deadId);
    expect(dead).toMatchObject({ diedOnTurn: party.returnsOnTurn, partyId: null, guildId });
    expect(guildOf(document.world, guildId).rosterIds).not.toContain(deadId);
    const position = document.history.entries.indexOf(died as EngineEvent);
    expect(document.history.byEntity[deadId]).toContain(position);
    expect(document.history.milestones).toContain(position);
    expect(document.history.byEntity[guildId]).toContain(position);
  });

  test('a Death costs each Hero left on the Roster moraleOnRosterDeath, and each change is an event', () => {
    const deps = soloDeps({ moraleOnRosterDeath: -10 }, certainHarmContent);
    const { eve, guildId } = sentAway('roster-death', deps, { difficulty: 5000, encounterKeys: oneEncounter });

    const { world, events } = concludeAlone(eve, deps);

    const mates = guildOf(world, guildId).rosterIds;
    const changes = ofType(events, 'hero.morale-changed');
    expect(changes.map((event) => event.payload.heroId)).toEqual(mates);
    for (const { payload } of changes) {
      expect(payload).toMatchObject({ cause: 'roster-death', after: payload.before + deps.config.moraleOnRosterDeath });
      expect(hero(world, payload.heroId).morale).toBe(payload.after);
    }
    expect(deps.config.moraleOnRosterDeath).toBe(-10);
  });

  test('an injured Hero carries the Injury until the night its Days run out, the infirmary at the time shortening it', () => {
    const injureOnly = soloDeps(
      { infirmaryHealFactor: [1, 1 / 2, 1 / 3] },
      withEncounters({ success: [], failure: [{ kind: 'injury', typeKey: 'broken-arm', chance: 1, count: 1 }] }),
    );
    const healDays = (grade: number): { days: number; heroId: HeroId; typeKey: string; world: World; night: number } => {
      const { eve, guildId, party } = sentAway('injury', injureOnly, { difficulty: 5000, encounterKeys: oneEncounter });
      guildOf(eve.world, guildId).hall.infirmary = grade;
      const { world, events } = concludeAlone(eve, injureOnly);
      const [injury] = ofType(events, 'quest.resolved')[0]?.payload.injuries ?? [];
      const [injured] = ofType(events, 'hero.injured');
      if (injury === undefined || injured === undefined) throw new Error('No Injury');
      const healsOnTurn = nightOf(dayOf(party.returnsOnTurn) + injury.healDays);
      expect(injured.payload).toEqual({ heroId: injury.heroId, questId: party.questId, typeKey: injury.typeKey, healsOnTurn });
      expect(hero(world, injury.heroId).injury).toEqual({ typeKey: injury.typeKey, healsOnTurn });
      return { days: injury.healDays, heroId: injury.heroId, typeKey: injury.typeKey, world, night: party.returnsOnTurn };
    };

    const bare = healDays(0);
    const halved = healDays(1);

    expect(halved.typeKey).toBe(bare.typeKey);
    expect(halved.days).toBe(Math.round(bare.days / 2));
    const type = injureOnly.content.injuries[bare.typeKey];
    expect(bare.days).toBeGreaterThanOrEqual(type?.healDaysMin ?? Infinity);
    expect(bare.days).toBeLessThanOrEqual(type?.healDaysMax ?? -Infinity);
  });

  test('a strong success raises the Morale of each Hero who came home by moraleOnStrongSuccess, each an event', () => {
    const deps = soloDeps({ moraleOnStrongSuccess: 5 }, harmlessContent);
    const { eve, heroIds } = sentAway('strong', deps, { difficulty: 1 });

    const { world, events } = concludeAlone(eve, deps);

    expect(ofType(events, 'quest.resolved')[0]?.payload.band).toBe('strong');
    const changes = ofType(events, 'hero.morale-changed');
    expect(changes.map((event) => event.payload.heroId)).toEqual(heroIds);
    for (const { payload } of changes) {
      expect(payload).toMatchObject({ cause: 'strong-success', after: payload.before + 5 });
      expect(hero(world, payload.heroId).morale).toBe(payload.after);
    }
  });

  test('emits, in order, each quest.encounter, quest.resolved, then Injuries, Deaths, XP and Morale changes', () => {
    const deps = soloDeps({}, certainHarmContent);
    const { eve } = sentAway('order', deps, { size: 3, difficulty: 5000, encounterKeys: oneEncounter });

    const { events } = concludeAlone(eve, deps);

    const order = events.map((event) => event.type).filter((type, index, all) => all.indexOf(type) === index);
    expect(order).toEqual([
      'quest.encounter',
      'quest.resolved',
      'hero.injured',
      'hero.died',
      'hero.xp-gained',
      'hero.morale-changed',
    ]);
  });

  // M4-S2's third box.
  test('emits one quest.encounter for each Encounter, in sequence order, on the Quest\'s return night, before quest.resolved', () => {
    const deps = soloDeps({}, harmlessContent);
    const keys = ['the-flooded-ford', 'hold-the-line', 'a-hostile-reeve', 'hold-the-line'];
    const { eve, party, quest, guildId, heroIds } = sentAway('sequence', deps, { difficulty: 30, encounterKeys: keys });

    const { document, events } = playTo(eve, party.returnsOnTurn, deps);

    const encounters = ofType(events, 'quest.encounter');
    expect(encounters.map((event) => [event.turn, event.payload.index, event.payload.encounterKey])).toEqual(
      keys.map((key, index) => [party.returnsOnTurn, index, key]),
    );
    for (const { payload, participants, milestone } of encounters) {
      expect(payload).toMatchObject({ questId: quest.id, partyId: party.id, guildId, injured: [], died: [] });
      expect(payload.kind).toBe(deps.content.encounters[payload.encounterKey]?.kind);
      expect(payload.margin).toBe(payload.roll - payload.target);
      expect(payload.outcome).toBe(payload.roll >= payload.target ? 'success' : 'failure');
      expect(participants).toEqual([quest.id, party.id, guildId]);
      expect(milestone).toBe(false);
    }
    const types = events.map((event) => event.type);
    const lastEncounter = types.lastIndexOf('quest.encounter');
    expect(types.indexOf('quest.resolved')).toBe(lastEncounter + 1);
    const [resolved] = ofType(events, 'quest.resolved');
    expect(resolved?.payload).toMatchObject({
      encounterCount: 4,
      successes: encounters.filter((event) => event.payload.outcome === 'success').length,
      heroIds,
    });
    // In the History too, in order, each indexed under the Quest.
    const positions = document.history.byType['quest.encounter'] ?? [];
    expect(positions.map((position) => document.history.entries[position])).toEqual(encounters);
    for (const position of positions) expect(document.history.byEntity[quest.id]).toContain(position);
  });

  test("a quest.encounter names the Heroes its consequences hurt, and the Encounters' Morale moves each Hero home", () => {
    const deps = soloDeps(
      { moraleMin: 0, moraleMax: 100 },
      withEncounters({ success: [{ kind: 'morale', delta: 2 }], failure: [{ kind: 'death', chance: 1 }, { kind: 'morale', delta: -3 }] }),
    );
    const { eve, heroIds } = sentAway('named', deps, { size: 3, difficulty: 5000, encounterKeys: ['hold-the-line', 'hold-the-line'] });

    const { world, events } = concludeAlone(eve, deps);

    const encounters = ofType(events, 'quest.encounter');
    expect(encounters.map((event) => event.payload.outcome)).toEqual(['failure', 'failure']);
    const [first, second] = encounters;
    const died = [...(first?.payload.died ?? []), ...(second?.payload.died ?? [])];
    expect(died).toHaveLength(2);
    expect(first?.participants).toContain(first?.payload.died[0]);
    const [survivor] = heroIds.filter((id) => !died.includes(id));
    if (survivor === undefined) throw new Error('No survivor');
    const own = ofType(events, 'hero.morale-changed').filter((event) => event.payload.cause === 'encounters');
    expect(own.map((event) => event.payload.heroId)).toEqual([survivor]);
    expect(own[0]?.payload.after).toBe((own[0]?.payload.before ?? NaN) - 6);
    expect(ofType(events, 'quest.resolved')[0]?.payload.moraleDelta).toBe(-6);
    withValid({ ...eve, world }, deps);
  });

  test('resolves a Quest saved before M4, with no Encounters, through a sequence drawn from the encounters stream', () => {
    const deps = soloDeps({}, harmlessContent);
    const { eve, party, quest } = sentAway('pre-m4', deps, { encounterKeys: [] });
    const template = deps.content.questTemplates[quest.templateKey];
    if (template === undefined) throw new Error('No template');
    const encountersBefore = structuredClone(eve.world.rng.encounters);

    const { document, events } = playTo(eve, party.returnsOnTurn, deps);

    const encounters = ofType(events, 'quest.encounter').filter((event) => event.payload.questId === quest.id);
    expect(encounters).toHaveLength(encounterCount(template, quest.difficulty, deps.config));
    for (const { payload } of encounters) expect(template.encounterKinds).toContain(payload.kind);
    expect(document.world.rng.encounters).not.toEqual(encountersBefore);
    expect(ofType(events, 'quest.resolved')[0]?.payload.encounterCount).toBe(encounters.length);
  });

  test("resolves a Rival's Party through the same engine, moving the Rival's Wealth and Fame", () => {
    // One Rival, its controller stilled so that the Party sent here is its only one.
    const deps = testDeps({ rivalCount: 1 });
    stillRivalControllers();
    const { eve, guildId, heroIds } = sentAway('rival', deps, { rival: true, difficulty: 1 });
    expect(guildOf(eve.world, guildId).controller.kind).toBe('rival');

    const { world, events } = concludeAlone(eve, deps);

    const [resolved] = ofType(events, 'quest.resolved');
    expect(resolved?.payload).toMatchObject({ guildId, heroIds, band: 'strong' });
    expect(guildOf(world, guildId).wealth).toBe(guildOf(eve.world, guildId).wealth + (resolved?.payload.wealthDelta ?? NaN));
  });

  test("leaves a folded Guild's Party alone, as every per-Guild rule skips a folded Guild", () => {
    const deps = soloDeps();
    const { eve, guildId, party } = sentAway('folded', deps);
    guildOf(eve.world, guildId).foldedOnTurn = eve.world.turn;

    const { world, events } = concludeAlone(eve, deps);

    expect(events).toEqual([]);
    expect(world.parties[party.id]).toEqual(party);
  });

  test('advances the quests stream and no other, for a Quest drawn with its Encounters', () => {
    const deps = soloDeps({}, certainHarmContent);
    const { eve } = sentAway('streams', deps, { difficulty: 5000, encounterKeys: oneEncounter });
    Object.assign(eve.world.rng, createStreams(eve.meta.seed, plannedStreams), structuredClone(eve.world.rng));
    const before = structuredClone(eve.world.rng) as Record<string, unknown>;

    const { world, events } = concludeAlone(eve, deps);

    expect(ofType(events, 'hero.died')).toHaveLength(1);
    const after = world.rng as Record<string, unknown>;
    for (const name of plannedStreams) {
      if (name === 'quests') expect(after[name], name).not.toEqual(before[name]);
      else expect(after[name], name).toEqual(before[name]);
    }
  });

  // M4-S2's fourth box, in the engine: M2's bands still come out of the Quest Engine, for every
  // Guild, each Quest's Encounters recorded before it (the harness's own tests play the real content).
  test('over a month of Rivals and the player sending Parties, quest.resolved still gives every band, each after its Encounters', () => {
    const deps = soloDeps({ rivalCount: 2, recruitWealthMultiple: 1000 });
    let document = createWorld('bands', setup, deps).document;
    const events: EngineEvent[] = [];
    while (document.world.turn < nightOf(45)) {
      const guild = playerGuild(document.world) as Guild;
      for (const quest of document.world.board.map((id) => document.world.quests[id] as Quest)) {
        const free = guild.rosterIds.filter((id) => {
          const it = document.world.heroes[id] as Hero;
          return it.partyId === null && it.injury === null;
        });
        const size = quest.requirements.partySizeMin;
        if (quest.requirements.classKey !== undefined || quest.requirements.skillKey !== undefined || free.length < size) continue;
        const sent = dispatch(document, { guildId: guild.id, questId: quest.id, heroIds: free.slice(0, size) }, deps);
        if (sent.ok) document = sent.document;
      }
      const result = advance(document, deps);
      document = withValid(result.document, deps);
      events.push(...result.events);
    }

    const resolved = ofType(events, 'quest.resolved');
    const bands = new Set(resolved.map((event) => event.payload.band));
    expect([...bands].sort()).toEqual(['fail', 'strong', 'success']);
    const kinds = new Set(resolved.map((event) => (document.world.guilds[event.payload.guildId] as Guild).controller.kind));
    expect([...kinds].sort()).toEqual(['player', 'rival']);
    for (const event of resolved) {
      const own = ofType(events, 'quest.encounter').filter((it) => it.payload.questId === event.payload.questId);
      // Every Encounter is reached unless the whole Party died on the way.
      const wiped = event.payload.deaths.length === event.payload.heroIds.length;
      if (wiped) expect(own.length).toBeLessThanOrEqual(event.payload.encounterCount);
      else expect(own).toHaveLength(event.payload.encounterCount);
      expect(own.filter((it) => it.payload.outcome === 'success')).toHaveLength(event.payload.successes);
      for (const it of own) expect(events.indexOf(it)).toBeLessThan(events.indexOf(event));
    }
  });

  test('with the Rivals sending Parties every afternoon, each Party resolves once, on its return night, and none is left overdue', () => {
    const deps = testDeps();
    const start = createWorld('many', setup, deps).document;

    const { document, events } = playTo(start, nightOf(15), deps);

    const taken = ofType(events, 'quest.taken');
    const resolved = ofType(events, 'quest.resolved');
    expect(new Set(taken.map((event) => event.payload.guildId)).size).toBeGreaterThan(1);
    for (const { payload } of taken) {
      const home = resolved.filter((event) => event.payload.partyId === payload.partyId);
      if (payload.returnsOnTurn <= document.world.turn) {
        expect(home.map((event) => event.turn), payload.partyId).toEqual([payload.returnsOnTurn]);
      } else {
        expect(home, payload.partyId).toEqual([]);
        expect(document.world.parties[payload.partyId]?.returnsOnTurn).toBe(payload.returnsOnTurn);
      }
    }
    expect(resolved).toHaveLength(taken.filter((event) => event.payload.returnsOnTurn <= document.world.turn).length);
    for (const party of Object.values(document.world.parties)) expect(party.returnsOnTurn).toBeGreaterThan(document.world.turn);
  });
});

// M4-S5's Regard writers (DL-43 item 4) meet M4-S2's Encounter resolution (DL-42) in this phase
// (DL-44): each resolved Quest writes the Patron's Regard for the Guild, and the Guildmaster's for the
// Patron, exactly once, by the band the Encounters gave, for the player's Guild and a Rival's alike.
describe('questsConclude writes Regard once for each resolved Quest (M4-S5, DL-44)', () => {
  const regardPins: Partial<GameConfig> = {
    patronRegardOnSuccess: 1,
    patronRegardOnFailure: -2,
    patronRegardOnExpiry: 0,
    influenceFactor: 0,
    guildmasterRegardOnPatronSuccess: 1,
    guildmasterRegardOnPatronFailure: -1,
  };

  test.each([
    ['player', 1, 'strong', 1, 1],
    ['player', 5000, 'fail', -2, -1],
    ['rival', 1, 'strong', 1, 1],
    ['rival', 5000, 'fail', -2, -1],
  ] as const)("the %s Guild's Party at difficulty %i: band %s, the Patron's Regard moves %i and the Guildmaster's %i", (side, difficulty, band, patronDelta, guildmasterDelta) => {
    const rival = side === 'rival';
    const deps = rival ? testDeps({ rivalCount: 1, ...regardPins }) : soloDeps(regardPins);
    if (rival) stillRivalControllers();
    const { eve, quest, guildId } = sentAway(`regard-${side}-${difficulty}`, deps, { rival, difficulty });
    const patronOf = (world: World) => world.patrons[quest.patronId] as Patron;
    const guildmasterOf = (world: World) => world.guildmasters[guildOf(world, guildId).guildmasterId] as Guildmaster;

    const { world, events } = concludeAlone(eve, deps);

    expect(ofType(events, 'quest.resolved').map((event) => event.payload.band)).toEqual([band]);
    expect(regardValue(patronOf(world).regard, guildId) - regardValue(patronOf(eve.world).regard, guildId)).toBe(patronDelta);
    expect(regardValue(guildmasterOf(world).regard, quest.patronId) - regardValue(guildmasterOf(eve.world).regard, quest.patronId)).toBe(
      guildmasterDelta,
    );
    // No other Guild's Regard moves.
    for (const other of Object.values(world.guilds).map((guild) => guild.id).filter((id) => id !== guildId)) {
      expect(regardValue(patronOf(world).regard, other)).toBe(regardValue(patronOf(eve.world).regard, other));
    }
  });
});

// A Rival's fold (M2-S10, DL-28 item 3) disbands its Parties at the end of the night; questsConclude
// runs first. So a folded Guild never has a Party for questsConclude to find: one away when its
// Guild folds is abandoned unresolved, and one home on the night of the fold is resolved first.
describe("a folded Rival's Party", () => {
  /**
   * A Rival's Party sent away as `sentAway` sends it, played to the afternoon `daysEarly` Days
   * before its return night, the Rival's Guildmaster then made old enough to retire that night.
   */
  function retiringRival(seed: string, daysEarly: number) {
    const deps = testDeps({ rivalCount: 1 });
    stillRivalControllers();
    const away = sentAway(seed, deps, { rival: true, daysEarly });
    const guildmaster = away.eve.world.guildmasters[guildOf(away.eve.world, away.guildId).guildmasterId];
    if (guildmaster === undefined) throw new Error('No Guildmaster');
    guildmaster.ageAtEntry = deps.config.guildmasterRetirementAge;
    return { deps, ...away };
  }

  test('is disbanded by a fold before its return night and never resolved, nor left behind', () => {
    // The Rival folds the night before its Party is due.
    const { deps, eve, party, quest, guildId } = retiringRival('fold-away', 1);
    expect(eve.world.parties[party.id]).toEqual(party);

    const { document, events } = playTo(eve, party.returnsOnTurn + 3, deps);

    expect(ofType(events, 'guild.folded').map((event) => event.turn)).toEqual([party.returnsOnTurn - 3]);
    expect(guildOf(document.world, guildId).foldedOnTurn).toBe(party.returnsOnTurn - 3);
    expect(ofType(events, 'quest.resolved').filter((event) => event.payload.partyId === party.id)).toEqual([]);
    expect(document.world.parties).not.toHaveProperty(party.id);
    expect(document.world.quests).not.toHaveProperty(quest.id);
  });

  test('home on the night its Guild folds is resolved first, then the fold finds no Party', () => {
    // The Rival folds on the night its Party comes home.
    const { deps, eve, party, guildId } = retiringRival('fold-home', 0);

    const { document, events } = playTo(eve, party.returnsOnTurn, deps);

    const order = events
      .filter((event) => event.type === 'quest.resolved' || event.type === 'guild.folded')
      .map((event) => [event.type, event.turn]);
    expect(order).toEqual([
      ['quest.resolved', party.returnsOnTurn],
      ['guild.folded', party.returnsOnTurn],
    ]);
    const [fold] = ofType(events, 'guild.folded');
    expect(fold?.participants).not.toContain(party.id);
    expect(guildOf(document.world, guildId).foldedOnTurn).toBe(party.returnsOnTurn);
    expect(Object.values(document.world.parties).filter((it) => it.guildId === guildId)).toEqual([]);
  });
});
