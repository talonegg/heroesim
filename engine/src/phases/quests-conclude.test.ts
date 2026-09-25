import { describe, expect, test } from 'vitest';
import { dispatch } from '../actions/dispatch.js';
import { advance } from '../advance.js';
import type { EngineDeps } from '../config.js';
import { createWorld } from '../create.js';
import type { Guild, GuildId, Hero, HeroId, Party, Quest, World, WorldDocument } from '../document.js';
import type { EngineEvent, EngineEventOf, EngineEventType } from '../events.js';
import { count, entriesFor } from '../history.js';
import { createStreams } from '../rng.js';
import { playerGuild } from '../selectors.js';
import { dayOf, nightOf, timeOfDay } from '../time.js';
import { plannedStreams, testDeps, withValid } from '../world.test-support.js';
import { phaseContext } from './phase.js';
import { questsConclude } from './quests-conclude.js';

// M2-S5: the night's `questsConclude` (DL-29). Parties are sent by `dispatch` from created worlds
// and played to the afternoon before they come home; a test then plays the return night through
// `advance`, or runs the phase alone on a copy when other night phases would blur what it checks
// (the Guild State Engine's Upkeep and Fame floor).

const setup = { guildmasterName: 'Ada', guildName: 'The Test', createdAt: 'test' };
const noHarm = { fail: 0, success: 0, strong: 0 };
const certainHarm = { stubDeathChance: { ...noHarm, fail: 1 }, stubInjuryChance: { ...noHarm, fail: 1 } };

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
 * when given, played to the afternoon before the Party comes home.
 */
function sentAway(
  seed: string,
  deps: EngineDeps,
  { size = 2, rival = false, difficulty }: { size?: number; rival?: boolean; difficulty?: number } = {},
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
  const party = sent.document.world.parties[quest.partyIds[0] as Party['id']] as Party;
  const { document: eve, events } = playTo(withValid(sent.document, deps), party.returnsOnTurn - 1, deps);
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
    const deps = testDeps();
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
    const deps = testDeps();
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
    const deps = testDeps(certainHarm);
    const { eve, party, guildId, heroIds } = sentAway('death', deps, { difficulty: 5000 });

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
    const deps = testDeps(certainHarm);
    const { eve, guildId } = sentAway('roster-death', deps, { difficulty: 5000 });

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
    const injureOnly = testDeps({ stubInjuryChance: { ...noHarm, fail: 1 } });
    const healDays = (grade: number): { days: number; heroId: HeroId; typeKey: string; world: World; night: number } => {
      const { eve, guildId, party } = sentAway('injury', injureOnly, { difficulty: 5000 });
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
    const deps = testDeps();
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

  test('emits, in order, quest.resolved, then Injuries, Deaths, XP and Morale changes', () => {
    const deps = testDeps(certainHarm);
    const { eve } = sentAway('order', deps, { size: 3, difficulty: 5000 });

    const { events } = concludeAlone(eve, deps);

    const order = events.map((event) => event.type).filter((type, index, all) => all.indexOf(type) === index);
    expect(order).toEqual(['quest.resolved', 'hero.injured', 'hero.died', 'hero.xp-gained', 'hero.morale-changed']);
  });

  test("resolves a Rival's Party through the same engine, moving the Rival's Wealth and Fame", () => {
    const deps = testDeps();
    const { eve, guildId, heroIds } = sentAway('rival', deps, { rival: true, difficulty: 1 });
    expect(guildOf(eve.world, guildId).controller.kind).toBe('rival');

    const { world, events } = concludeAlone(eve, deps);

    const [resolved] = ofType(events, 'quest.resolved');
    expect(resolved?.payload).toMatchObject({ guildId, heroIds, band: 'strong' });
    expect(guildOf(world, guildId).wealth).toBe(guildOf(eve.world, guildId).wealth + (resolved?.payload.wealthDelta ?? NaN));
  });

  test("leaves a folded Guild's Party alone, as every per-Guild rule skips a folded Guild", () => {
    const deps = testDeps();
    const { eve, guildId, party } = sentAway('folded', deps);
    guildOf(eve.world, guildId).foldedOnTurn = eve.world.turn;

    const { world, events } = concludeAlone(eve, deps);

    expect(events).toEqual([]);
    expect(world.parties[party.id]).toEqual(party);
  });

  test('advances the quests stream and no other', () => {
    const deps = testDeps(certainHarm);
    const { eve } = sentAway('streams', deps, { difficulty: 5000 });
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

  test('over many returns, every Quest a Party took resolves once, and the documents stay valid', () => {
    const deps = testDeps();
    const { eve, party } = sentAway('many', deps);
    const { document } = playTo(eve, party.returnsOnTurn + 30, deps);

    expect(count(document.history, 'quest.resolved')).toBe(count(document.history, 'quest.taken'));
    expect(Object.keys(document.world.parties)).toEqual([]);
  });
});
