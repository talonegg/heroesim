import { createHash } from 'node:crypto';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { dispatch } from '../actions/dispatch.js';
import { advance } from '../advance.js';
import type { EngineDeps, GameConfig } from '../config.js';
import type { Consequence, ContentSet, Encounter } from '../content-types.js';
import { createWorld } from '../create.js';
import type { Entry, Guild, GuildId, Guildmaster, Hero, HeroId, Party, Patron, Quest, World, WorldDocument } from '../document.js';
import type { EngineEvent, EngineEventOf, EngineEventType, TurnEvent } from '../events.js';
import { append, createHistory, entriesFor } from '../history.js';
import { deserialise, serialise } from '../serialise.js';
import { addStack, holdings } from '../items.js';
import { phases } from '../pipeline.js';
import { xpForLevel } from '../progression.js';
import { encounterCount } from '../quest-engine/encounters.js';
import { regardValue } from '../regard.js';
import { createStreams } from '../rng.js';
import { effectiveStats, playerGuild } from '../selectors.js';
import { dayOf, nightOf, timeOfDay } from '../time.js';
import {
  certainHarmContent,
  harmlessContent,
  plannedStreams,
  testContent,
  testDeps,
  withDispositions,
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
function playTo(document: WorldDocument, turn: number, deps: EngineDeps): { document: WorldDocument; events: TurnEvent[] } {
  let current = document;
  const events: TurnEvent[] = [];
  while (current.world.turn < turn) {
    const result = advance(current, deps);
    current = withValid(result.document, deps);
    events.push(...result.events);
  }
  return { document: current, events };
}

const ofType = <Type extends EngineEventType>(events: readonly TurnEvent[], type: Type): EngineEventOf<Type>[] =>
  events.filter((event): event is EngineEventOf<Type> => event.type === type);

interface Away {
  /** The document on the afternoon before the Party's return night. */
  eve: WorldDocument;
  party: Party;
  quest: Quest;
  guildId: GuildId;
  heroIds: HeroId[];
  /** Everything played before the eve. */
  events: TurnEvent[];
}

/**
 * A world created from `seed` whose Guild (the player's, or the first Rival's) sends its first
 * `size` Heroes on the first Quest on the Board that asks for no Class or Skill, at `difficulty`
 * and through `encounterKeys` when given, played to the afternoon before the Party comes home, or
 * daysEarly Days before that. The Guild is given each of `consumables` (definition key and quantity)
 * and the Party carries them (M5-S3).
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
    consumables = [],
  }: {
    size?: number;
    rival?: boolean;
    difficulty?: number;
    encounterKeys?: string[];
    daysEarly?: number;
    consumables?: [string, number][];
  } = {},
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
  for (const [definitionKey, quantity] of consumables) addStack(start.world, definitionKey, quantity, { kind: 'guild', id: guild.id });
  const carried = consumables.map(([definitionKey, quantity]) => ({ definitionKey, quantity }));
  const sent = dispatch(start, { guildId: guild.id, questId: open.id, heroIds, consumables: carried }, deps);
  if (!sent.ok) throw new Error(`Refused: ${sent.rejection.reason}`);
  const quest = sent.document.world.quests[open.id] as Quest;
  if (difficulty !== undefined) quest.difficulty = difficulty;
  if (encounterKeys !== undefined) quest.encounterKeys = [...encounterKeys];
  const party = sent.document.world.parties[quest.partyIds[0] as Party['id']] as Party;
  const { document: eve, events } = playTo(withValid(sent.document, deps), party.returnsOnTurn - 1 - 3 * daysEarly, deps);
  return { eve, party: structuredClone(party), quest: structuredClone(quest), guildId: guild.id, heroIds, events };
}

/** Runs the phase alone on a copy of `eve`'s world moved on to the return night. */
function concludeAlone(eve: WorldDocument, deps: EngineDeps): { world: World; events: TurnEvent[] } {
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

  // v1.1.4-S4 (DL-148 item 14, DL-155): a Morale loss `steadiedBy` some Stats is each Hero's own.
  test("each Hero home takes their own Morale from the Encounters, a loss steadiedBy their Stats less for the steadier", () => {
    const deps = soloDeps(
      { moraleMin: 0, moraleMax: 100 },
      withEncounters({ success: [], failure: [{ kind: 'morale', delta: -10, steadiedBy: ['courage'] }, { kind: 'morale', delta: 4, steadiedBy: ['courage'] }] }),
    );
    const { eve, heroIds } = sentAway('steadied', deps, { size: 3, difficulty: 5000, encounterKeys: ['hold-the-line'] });
    const heroes = heroIds.map((id) => eve.world.heroes[id] as Hero);
    for (const [hero, courage] of heroes.map((hero, index) => [hero, [20, 1, 11][index] as number] as const)) {
      hero.stats['courage'] = courage;
      hero.morale = 50;
    }
    // The loss is times 1 − guardRange × the share of Courage's range; the gain as written; the total rounded.
    const own = (hero: Hero): number => {
      const courage = effectiveStats(hero, eve.world, deps.content)['courage'] ?? Number.NaN;
      return Math.round(-10 * (1 - deps.config.guardRange * ((courage - 1) / 19)) + 4);
    };

    const { world, events } = concludeAlone(eve, deps);

    const [resolved] = ofType(events, 'quest.resolved');
    expect(resolved?.payload.moraleDelta).toBe(-6);
    expect(resolved?.payload.moraleByHero).toEqual(Object.fromEntries(heroes.map((hero) => [hero.id, own(hero)])));
    expect(Object.keys(resolved?.payload.moraleByHero ?? {})).toEqual(heroIds);
    expect(heroes.map(own)).toEqual([-1, -6, -3]);
    const changes = ofType(events, 'hero.morale-changed').filter((event) => event.payload.cause === 'encounters');
    expect(changes.map(({ payload }) => [payload.heroId, payload.before, payload.after])).toEqual(heroes.map((hero) => [hero.id, 50, 50 + own(hero)]));
    withValid({ ...eve, world }, deps);
  });

  // v1.1.4-S7 (DL-148 items 25 and 27): a Trait earned on the Quest joins the Hero's, a Milestone.
  test('a Trait earned joins the Hero\'s Traits with hero.trait-gained, a Milestone naming the Hero, the Trait, the Quest and the Encounter', () => {
    const deps = soloDeps(
      {},
      withEncounters({ success: [], failure: [{ kind: 'injury', typeKey: 'deep-cut', chance: 1, count: 1 }, { kind: 'trait', traitKey: 'one-eyed', chance: 1 }] }),
    );
    const { eve, quest } = sentAway('earned', deps, { size: 2, difficulty: 5000, encounterKeys: ['hold-the-line'] });

    const { world, events } = concludeAlone(eve, deps);

    const [encounter] = ofType(events, 'quest.encounter');
    const heroId = encounter?.payload.injured[0] as HeroId;
    const gained = ofType(events, 'hero.trait-gained');
    expect(gained.map((event) => [event.payload, event.milestone])).toEqual([
      [{ heroId, traitKey: 'one-eyed', questId: quest.id, encounterIndex: 0, encounterKey: 'hold-the-line' }, true],
    ]);
    expect(gained[0]?.participants.slice(0, 2)).toEqual([heroId, quest.id]);
    // After the Injuries and Deaths, before the XP.
    const order = events.map((event) => event.type);
    expect(order.indexOf('hero.trait-gained')).toBeGreaterThan(order.indexOf('hero.injured'));
    expect(order.indexOf('hero.trait-gained')).toBeLessThan(order.indexOf('hero.xp-gained'));
    expect(hero(world, heroId).traits).toContain('one-eyed');
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
    const deps = soloDeps({ rivalCount: 2 }, withDispositions({ recruitThreshold: 1000 }));
    let document = createWorld('bands', setup, deps).document;
    const events: TurnEvent[] = [];
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
// M5-S3 (DL-50): the consumables a Party carried, expended or sent home to the Guild on its return.
describe('questsConclude and the consumables a Party carried', () => {
  /** Each stack `holder` holds, as its definition and quantity. */
  const heldBy = (world: World, holder: Parameters<typeof holdings>[1]): [string, number][] =>
    holdings(world, holder)
      .stacks.map(({ definitionKey, quantity }): [string, number] => [definitionKey, quantity])
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));

  // M5-S3's second and third boxes.
  test('expends those used, each an item.expended between the Encounters and quest.resolved, and the rest are back with the Guild after', () => {
    const deps = soloDeps({}, certainHarmContent);
    // One failed combat Check: a whetstone adds to it, one Hero dies and one comes home injured, whom
    // a draught heals; the grappling line is for travel and stealth, and goes home unused.
    const consumables: [string, number][] = [
      ['whetstone', 2],
      ['grappling-line', 1],
      ['healing-draught', 2],
    ];
    const { eve, party, quest, guildId } = sentAway('carried', deps, { size: 3, difficulty: 5000, encounterKeys: oneEncounter, consumables });
    expect(heldBy(eve.world, { kind: 'guild', id: guildId })).toEqual([]);
    expect(heldBy(eve.world, { kind: 'party', id: party.id })).toEqual([...consumables].sort(([a], [b]) => (a < b ? -1 : 1)));

    const { document, events } = playTo(eve, party.returnsOnTurn, deps);

    const order = events.map((event) => event.type).filter((type) => type.startsWith('quest.') || type === 'item.expended');
    expect(order).toEqual(['quest.encounter', 'item.expended', 'item.expended', 'quest.resolved']);
    const expended = ofType(events, 'item.expended');
    const [resolved] = ofType(events, 'quest.resolved');
    const [injury] = resolved?.payload.injuries ?? [];
    if (injury === undefined) throw new Error('Nobody came home injured');
    expect(expended.map((event) => event.payload)).toEqual([
      expect.objectContaining({ questId: quest.id, partyId: party.id, guildId, definitionKey: 'whetstone', effect: 'bonus', encounterIndex: 0, flat: 3 }),
      expect.objectContaining({ questId: quest.id, partyId: party.id, guildId, definitionKey: 'healing-draught', effect: 'heal', heroId: injury.heroId, days: 5 }),
    ]);
    expect(expended[1]?.participants).toEqual([quest.id, party.id, guildId, injury.heroId]);
    expect(expended.every((event) => !event.milestone)).toBe(true);
    // The Injury comes home shortened: broken-arm heals in 15 to 25 Days, 5 fewer with the draught.
    const [injured] = ofType(events, 'hero.injured');
    expect(injured?.payload.healsOnTurn).toBe(nightOf(dayOf(party.returnsOnTurn) + injury.healDays));
    expect(injury.healDays).toBeGreaterThanOrEqual(10);
    expect(injury.healDays).toBeLessThanOrEqual(20);
    // The Party holds nothing and is gone; the Guild holds what was not used (playTo validates each Turn).
    const { world } = document;
    expect(world.parties).not.toHaveProperty(party.id);
    expect(heldBy(world, { kind: 'party', id: party.id })).toEqual([]);
    expect(heldBy(world, { kind: 'guild', id: guildId })).toEqual([
      ['grappling-line', 1],
      ['healing-draught', 1],
      ['whetstone', 1],
    ]);
  });

  // M5-S3's first box, in the world: the reroll's second roll is consumables.test.ts's.
  test('a reroll used on a failed Check is gone after: expended, and no stack of it anywhere', () => {
    // An empty Market (M5-S4), so that the only grappling line in the world is the one carried.
    const deps = soloDeps({ marketSize: 0 }, harmlessContent);
    const { eve, party, guildId } = sentAway('rerolled', deps, {
      difficulty: 5000,
      encounterKeys: ['the-flooded-ford'],
      consumables: [['grappling-line', 1]],
    });

    const { document, events } = playTo(eve, party.returnsOnTurn, deps);

    expect(ofType(events, 'item.expended').map((event) => event.payload)).toEqual([
      expect.objectContaining({ definitionKey: 'grappling-line', effect: 'reroll', encounterIndex: 0, partyId: party.id, guildId }),
    ]);
    expect(ofType(events, 'quest.encounter')).toHaveLength(1);
    expect(Object.values(document.world.stacks).filter((stack) => stack.definitionKey === 'grappling-line')).toEqual([]);
  });

  test("sends a Rival's Party's consumables home to the Rival as the player's are", () => {
    const deps = soloDeps({ rivalCount: 1 }, harmlessContent);
    stillRivalControllers();
    const { eve, party, guildId } = sentAway('rival-carried', deps, { rival: true, consumables: [['physicians-kit', 1]] });

    const { document } = playTo(eve, party.returnsOnTurn, deps);

    expect(heldBy(document.world, { kind: 'guild', id: guildId })).toEqual([['physicians-kit', 1]]);
  });
});

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

  // A success is any band but `fail` (DL-43 item 4, DL-46 item 2), so a plain success, two
  // Encounters of three, writes every success amount; and only the Heroes home alive are written
  // (DL-43 item 4, DL-46 item 3). Every amount is pinned apart from the others (M4 verification).
  test("a plain success writes every Regard's success amount, and only for the Heroes home alive", () => {
    const base = harmlessContent.encounters['ambush-on-the-road'] as Encounter;
    const row = (key: string, difficultyFactor: number, failure: Consequence[]): Encounter => ({
      ...structuredClone(base),
      key,
      name: key,
      checks: base.checks.map((it) => ({ ...structuredClone(it), difficultyFactor })),
      consequences: { success: [], failure },
    });
    const content: ContentSet = {
      ...harmlessContent,
      encounters: {
        ...harmlessContent.encounters,
        'sure-pass': row('sure-pass', 1e-6, []),
        'sure-death': row('sure-death', 1e6, [{ kind: 'death', chance: 1 }]),
      },
    };
    const deps = soloDeps(
      {
        ...regardPins,
        guildmasterRegardOnPatronSuccess: 2,
        guildmasterRegardOnPatronFailure: -3,
        guildmasterRegardOnHeroSuccess: 0.5,
        guildmasterRegardOnHeroFailure: -0.25,
        regardPerSharedQuest: 1,
        regardOnSuccessBonus: 0.5,
      },
      content,
    );
    const { eve, quest, guildId, heroIds } = sentAway('regard-plain-success', deps, {
      size: 3,
      encounterKeys: ['sure-pass', 'sure-death', 'sure-pass'],
    });
    const before = structuredClone(eve.world);

    const { world, events } = concludeAlone(eve, deps);

    expect(ofType(events, 'quest.resolved').map((event) => event.payload.band)).toEqual(['success']);
    const [died] = ofType(events, 'hero.died').map((event) => event.payload.heroId);
    if (died === undefined) throw new Error('Nobody died');
    const home = heroIds.filter((id) => id !== died);
    const moved = (read: (world: World) => number): number => read(world) - read(before);
    const guildmasterOf = (at: World): Guildmaster => at.guildmasters[guildOf(at, guildId).guildmasterId] as Guildmaster;
    expect(moved((at) => regardValue((at.patrons[quest.patronId] as Patron).regard, guildId))).toBe(1);
    expect(moved((at) => regardValue(guildmasterOf(at).regard, quest.patronId))).toBe(2);
    for (const id of home) expect(moved((at) => regardValue(guildmasterOf(at).regard, id))).toBe(0.5);
    expect(Object.hasOwn(guildmasterOf(world).regard, died)).toBe(Object.hasOwn(guildmasterOf(before).regard, died));
    const [a, b] = home as [HeroId, HeroId];
    expect(moved((at) => regardValue(hero(at, a).regard, b))).toBe(1.5);
    expect(moved((at) => regardValue(hero(at, b).regard, a))).toBe(1.5);
    withValid({ ...eve, world }, deps);
  });
});

// A Rival's fold (M2-S10, DL-28 item 3) disbands its Parties at the end of the night; questsConclude
// runs first. So a folded Guild never has a Party for questsConclude to find: one away when its
// Guild folds is abandoned unresolved, and one home on the night of the fold is resolved first.
describe("a folded Rival's Party", () => {
  /**
   * A Rival's Party sent away as `sentAway` sends it, played to the afternoon `daysEarly` Days
   * before its return night, the Rival then made bankrupt that night: Wealth far below the floor,
   * under no grace. (Until M9-S2 its Guildmaster's Retirement folded it; now that is met by
   * Succession, DL-102.)
   */
  function foldingRival(seed: string, daysEarly: number) {
    const deps = testDeps({ rivalCount: 1, bankruptcyGraceDays: 0 });
    stillRivalControllers();
    const away = sentAway(seed, deps, { rival: true, daysEarly });
    guildOf(away.eve.world, away.guildId).wealth = -1_000_000;
    return { deps, ...away };
  }

  test('is disbanded by a fold before its return night and never resolved, nor left behind', () => {
    // The Rival folds the night before its Party is due.
    const { deps, eve, party, quest, guildId } = foldingRival('fold-away', 1);
    expect(eve.world.parties[party.id]).toEqual(party);

    const { document, events } = playTo(eve, party.returnsOnTurn + 3, deps);

    expect(ofType(events, 'guild.folded').map((event) => event.turn)).toEqual([party.returnsOnTurn - 3]);
    expect(guildOf(document.world, guildId).foldedOnTurn).toBe(party.returnsOnTurn - 3);
    expect(ofType(events, 'quest.resolved').filter((event) => event.payload.partyId === party.id)).toEqual([]);
    expect(document.world.parties).not.toHaveProperty(party.id);
    expect(document.world.quests).not.toHaveProperty(quest.id);
  });

  // M5-S3 (DL-50): a disbanded Party holds nothing after. What it carried goes home to the Guild,
  // whose stacks the fold then discards (M5-S4, DL-51; the fold's order is DL-54's, endings.test.ts).
  test("is disbanded with its consumables sent back to the Guild's holding: no stack is left held by the removed Party", () => {
    // An empty Market (M5-S4), so that the only whetstones in the world are the ones carried.
    const deps = testDeps({ rivalCount: 1, marketSize: 0, bankruptcyGraceDays: 0 });
    stillRivalControllers();
    const away = sentAway('fold-carried', deps, { rival: true, daysEarly: 1, consumables: [['whetstone', 2]] });
    guildOf(away.eve.world, away.guildId).wealth = -1_000_000;
    const { eve, party, guildId } = away;
    expect(holdings(eve.world, { kind: 'party', id: party.id }).stacks).toHaveLength(1);

    const { document, events } = playTo(eve, party.returnsOnTurn - 3, deps);

    expect(ofType(events, 'guild.folded')).toHaveLength(1);
    expect(document.world.parties).not.toHaveProperty(party.id);
    expect(holdings(document.world, { kind: 'party', id: party.id })).toEqual({ items: [], stacks: [] });
    // Sent home, then discarded with the folded Guild's stacks: no whetstone is left anywhere.
    expect(holdings(document.world, { kind: 'guild', id: guildId })).toEqual({ items: [], stacks: [] });
    expect(Object.values(document.world.stacks).filter((it) => it.definitionKey === 'whetstone')).toEqual([]);
    expect(ofType(events, 'item.expended')).toEqual([]);
  });

  test('home on the night its Guild folds is resolved first, then the fold finds no Party', () => {
    // The Rival folds on the night its Party comes home.
    const { deps, eve, party, guildId } = foldingRival('fold-home', 0);

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

// M9-F1 (DL-112 item 2, DL-114): what a return causes names its Quest. Four event types carry an
// optional `questId` for their Quest causes, and the Quest is a participant of those and of
// `hero.xp-gained`, so the Quest's own History holds its whole return. Nothing else moves.
describe('the Quest named on what its return causes (M9-F1)', () => {
  /** The types that name the Quest from M9-F1, and the causes for which they do. */
  const namedCauses: Record<string, readonly string[] | null> = {
    'hero.xp-gained': null,
    'hero.morale-changed': ['encounters', 'strong-success', 'roster-death'],
    'patron.regard-changed': ['quest-success', 'quest-failure'],
    'guildmaster.regard-changed': ['quest-success', 'quest-failure'],
    'hero.regard-changed': ['shared-quest'],
  };

  /**
   * Seeded games of 120 Days with every Rival sending Parties. The player's Guild is idle and rich,
   * so no Bankruptcy ends a game early, and a failed Encounter may kill and costs Morale, so every
   * cause above comes up. The Guildmasters' ages are those before DL-113, and the band's rule the one
   * before v1.1.4-S2, with no share of Triumphs asked for a strong success (DL-152), so that the
   * fingerprints below, recorded at `86c7afa` before M9-F1, still hold: with that rule, an Encounter's
   * Checks, Degrees and formula, on content in the old form, draw and resolve as one Check did. Every
   * form factor is 1, as before v1.1.4-S3 (DL-154), so that form is shown to change nothing else.
   */
  const deps = testDeps(
    {
      guildmasterStartingAgeMin: 30,
      guildmasterStartingAgeMax: 45,
      guildmasterRetirementAge: 65,
      startingWealth: 100_000,
      strongTriumphShare: 0,
      moraleCheckFactor: { wretched: 1, low: 1, steady: 1, high: 1, elated: 1 },
      hurtCheckFactor: 1,
    },
    withEncounters({ failure: [{ kind: 'death', chance: 0.15 }, { kind: 'morale', delta: -2 }] }),
  );
  const seeds = ['named-a', 'named-b', 'named-c'] as const;
  const played = new Map(
    seeds.map((seed) => {
      let document = createWorld(seed, setup, deps).document;
      while (document.world.turn < nightOf(120)) document = advance(document, deps).document;
      return [seed, withValid(document, deps)] as const;
    }),
  );

  /**
   * A History entry as it was before M9-F1: the new `questId` and the Quest's participation taken out;
   * from M9-F7 (DL-120 item 4, DL-121), a founding's Wealth; from v1.1.4-S2 (DL-152), an
   * Encounter's Degree, the Check that decided it and its Checks; and from v1.1.4-S4 (DL-155), each
   * Hero's own Morale from the Encounters, which with no `steadiedBy` is every Hero's `moraleDelta`.
   */
  function unnamed(entry: WorldDocument['history']['entries'][number]): object {
    if (entry.type === 'quest.resolved') {
      const payload = { ...(entry.payload as Record<string, unknown>) };
      delete payload.moraleByHero;
      return { ...entry, payload };
    }
    if (entry.type === 'quest.encounter') {
      const payload = { ...(entry.payload as Record<string, unknown>) };
      delete payload.degree;
      delete payload.decidedBy;
      delete payload.checks;
      return { ...entry, payload };
    }
    if (entry.type === 'guild.founded') {
      const payload = { ...(entry.payload as Record<string, unknown>) };
      delete payload.wealth;
      return { ...entry, payload };
    }
    if (!(entry.type in namedCauses)) return entry;
    const payload = { ...(entry.payload as Record<string, unknown>) };
    const questId = payload.questId;
    if (entry.type !== 'hero.xp-gained') delete payload.questId;
    return { ...entry, participants: entry.participants.filter((id) => id !== questId), payload };
  }

  test('the games hold every type and Quest cause named, so the fingerprints below cover them', () => {
    const entries = seeds.flatMap((seed) => (played.get(seed) as WorldDocument).history.entries);
    for (const [type, causes] of Object.entries(namedCauses)) {
      const ofIt = entries.filter((entry) => entry.type === type);
      if (causes === null) expect(ofIt.length, type).toBeGreaterThan(0);
      else for (const cause of causes) expect(ofIt.filter((entry) => (entry.payload as { cause: string }).cause === cause).length, `${type} ${cause}`).toBeGreaterThan(0);
    }
  });

  test("each event of a Quest's return carries its questId and names the Quest; the other causes name none", () => {
    let named = 0;
    for (const seed of seeds) {
      const { history } = played.get(seed) as WorldDocument;
      const resolved = new Map(
        history.entries.filter((entry) => entry.type === 'quest.resolved').map((entry) => [(entry.payload as { questId: string }).questId, entry]),
      );
      for (const entry of history.entries) {
        const causes = namedCauses[entry.type];
        if (causes === undefined) continue;
        const payload = entry.payload as { questId?: string; cause?: string; heroId?: string; guildId?: string };
        if (causes !== null && !causes.includes(payload.cause as string)) {
          expect(payload, `${entry.type} ${payload.cause}`).not.toHaveProperty('questId');
          continue;
        }
        named += 1;
        const questId = payload.questId as string;
        expect(entry.participants, entry.type).toContain(questId);
        // The Quest resolved that night, for the Guild the event is of.
        const home = resolved.get(questId);
        expect(home?.turn, entry.type).toBe(entry.turn);
        const { heroIds, guildId } = home?.payload as { heroIds: string[]; guildId: string };
        expect(entry.participants, entry.type).toContain(guildId);
        if (payload.guildId !== undefined) expect(payload.guildId, entry.type).toBe(guildId);
        if (payload.cause !== 'roster-death' && payload.heroId !== undefined) expect(heroIds, entry.type).toContain(payload.heroId);
      }
    }
    expect(named).toBeGreaterThan(0);
  });

  test("a Level a Party's Hero gains on the night of the return follows the Quest's XP: away, they trained for none", () => {
    const deps = soloDeps();
    const { eve, heroIds, quest } = sentAway('levelled-home', deps, { difficulty: 1 });
    // One XP short of Level 2 on the eve, so only the Quest's XP brings the Level.
    for (const heroId of heroIds) hero(eve.world, heroId).xp = xpForLevel(2, deps.config) - 1;

    const { document, events } = playTo(withValid(eve, deps), eve.world.turn + 1, deps);

    const gained = ofType(events, 'hero.xp-gained');
    const levelled = ofType(events, 'hero.levelled');
    expect(levelled.map((event) => event.payload.heroId).sort()).toEqual([...heroIds].sort());
    for (const heroId of heroIds) {
      const xp = gained.find((event) => event.payload.heroId === heroId);
      const level = levelled.find((event) => event.payload.heroId === heroId);
      expect(xp?.payload.questId).toBe(quest.id);
      expect(xp?.participants).toContain(quest.id);
      expect(level?.turn).toBe(xp?.turn);
      expect(events.indexOf(level as TurnEvent)).toBeGreaterThan(events.indexOf(xp as TurnEvent));
      // Nothing but the Quest's XP moved theirs that night.
      expect(hero(document.world, heroId).xp).toBe(xpForLevel(2, deps.config) - 1 + (xp?.payload.amount ?? 0));
    }
  });

  test("every founding in the games names its Guild's founding Wealth, the player's, the Rivals' and any replacement's (M9-F7)", () => {
    for (const seed of seeds) {
      const document = played.get(seed) as WorldDocument;
      const founded = document.history.entries.filter((entry) => entry.type === 'guild.founded');
      expect(founded.length, seed).toBe(Object.keys(document.world.guilds).length);
      for (const entry of founded) expect(entry.payload, seed).toHaveProperty('wealth', expect.any(Number));
    }
  });

  test('a History written before M9-F1, with none of the three, still validates and loads', () => {
    const document = played.get('named-a') as WorldDocument;
    const history = createHistory();
    for (const entry of document.history.entries) append(history, unnamed(entry) as Entry);

    const loaded = deserialise(serialise({ ...document, history }), deps);

    expect(loaded.ok && loaded.warnings).toEqual([]);
  });

  test("nothing else moves: the same seed gives the History of 86c7afa, entry for entry, but for the new fields and participants (M9-F1's questId, M9-F7's founding Wealth) and the Rivals' Parties (v1.1.4-S6)", () => {
    const fingerprints = seeds.map((seed) => {
      const { history } = played.get(seed) as WorldDocument;
      return createHash('sha256').update(JSON.stringify(history.entries.map(unnamed))).digest('hex');
    });
    // SHA-256 of each seed's History, recorded at 86c7afa (v1.1-dev before M9-F1), where the
    // stripping above took nothing out. M9-F7 added the founding Wealth to the stripping, not new
    // values: with it set aside, the History is unchanged (DL-121). v1.1.4-S2 added an Encounter's
    // Degree, deciding Check and Checks, and, under the band's rule before it, nothing else (DL-152).
    // v1.1.4-S6's Rivals choose their Parties by the chance estimate (DL-157), which changes who goes:
    // these are its fingerprints. With M2-S9's rule by the demands put back in its place, for one run
    // and not kept, the three were 86c7afa's again: a85e889a…, c5afab2d… and 55432d24….
    expect(fingerprints).toEqual([
      '00de1d954f3c7cf0c11cfdb770ac0336a9da9004139da1b3134d2f7e4213e377',
      'db199b7cf4d2ef8326060e4d3f21c5bae3726ad0631e6e8fc522d51134be663e',
      'c5519e6731b18cacb6cd5e1b9929e57351185c9435fc2fb0e695be137223e180',
    ]);
  });

  test('what v1.1.4-S2 added to each Encounter of the games says what its one Check said: decided by it, its Degree its outcome (DL-152)', () => {
    const encounters = seeds.flatMap((seed) =>
      (played.get(seed) as WorldDocument).history.entries.filter((entry): entry is EngineEventOf<'quest.encounter'> => entry.type === 'quest.encounter'),
    );
    expect(encounters.length).toBeGreaterThan(100);
    for (const { payload } of encounters) {
      const { encounterKey, roll, target, margin, outcome, degree, decidedBy, checks } = payload;
      expect(decidedBy).toBe(encounterKey);
      expect(checks).toEqual([{ key: encounterKey, capability: expect.any(Number), roll, target, margin, degree }]);
      expect(degree === 'success' || degree === 'triumph').toBe(outcome === 'success');
    }
    expect(new Set(encounters.map((entry) => entry.payload.degree))).toEqual(new Set(['triumph', 'success', 'setback', 'failure']));
  });
});
