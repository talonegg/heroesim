import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { advance } from './advance.js';
import type { EngineDeps, GameConfig } from './config.js';
import type { ContentSet } from './content-types.js';
import { createWorld } from './create.js';
import { makeId, type Guild, type GuildId, type Hero, type HeroId, type Party, type Quest, type QuestId, type RegardMap, type World, type WorldDocument } from './document.js';
import type { EngineEventOf, EngineEventType, TurnEvent } from './events.js';
import {
  decayHeroRegard,
  heroRegardDecayStep,
  heroRegardDecays,
  meanPairwiseRelationship,
  regardOnSharedQuest,
  relationship,
  relationshipBandCounts,
  relationshipBetween,
  sharedQuestRegardDelta,
} from './hero-regard.js';
import { heroState } from './phases/hero-state.js';
import { phaseContext } from './phases/phase.js';
import { questsConclude } from './phases/quests-conclude.js';
import { phases } from './pipeline.js';
import { regardBand, regardValue } from './regard.js';
import { serialise } from './serialise.js';
import { playerGuild } from './selectors.js';
import { nightOf } from './time.js';
import {
  buildDocument,
  certainHarmContent,
  harmlessContent,
  testContent,
  testDeps,
  withEncounters,
  withValid,
} from './world.test-support.js';
import { applyAction } from './actions/action.js';

// Regard between Heroes, its writer on a shared Quest and its nightly decay, and
// Relationship, computed and never stored (DL-46). The values these tests rely on are pinned here,
// never read from the defaults; Rivals are stilled where the player's Parties are the subject.

const pinned: Partial<GameConfig> = {
  regardMin: -20,
  regardMax: 20,
  regardBands: { hostile: -20, cool: -12, neutral: -4, warm: 4, close: 12 },
  regardPerSharedQuest: 1,
  regardOnSuccessBonus: 0.5,
  regardDecayPerYear: 0.25,
  turnsPerYear: 1080,
  checkVariance: 0.2,
  skillBonusPerRating: 2,
  bandBySuccessShare: { successAbove: 0.5, strongAtLeast: 1 },
};

/** The pinned config with no Rivals and, unless given, the test content. */
function soloDeps(overrides: Partial<GameConfig> = {}, content: ContentSet = testContent): EngineDeps {
  return testDeps({ rivalCount: 0, ...pinned, ...overrides }, content);
}

const setup = { guildmasterName: 'Ada', guildName: 'The Test', createdAt: 'test' };

afterEach(() => {
  vi.restoreAllMocks();
});

const ofType = <Type extends EngineEventType>(events: readonly TurnEvent[], type: Type): EngineEventOf<Type>[] =>
  events.filter((event): event is EngineEventOf<Type> => event.type === type);

const hero = (world: World, id: HeroId): Hero => world.heroes[id] as Hero;

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

/** A created world whose Guildmasters hold no Traits, so no Class Stat bonus or Morale shift blurs a test. */
function created(seed: string, deps: EngineDeps): WorldDocument {
  const { document } = createWorld(seed, setup, deps);
  for (const guildmaster of Object.values(document.world.guildmasters)) guildmaster.traits = [];
  return document;
}

/** The first Quest on the Board a Party of `size` may take: no Class or Skill asked, the size allowed. */
function openQuest(world: World, size: number): Quest | undefined {
  return world.board
    .map((id) => world.quests[id] as Quest)
    .find(({ requirements: { classKey, skillKey, partySizeMin, partySizeMax } }) =>
      classKey === undefined && skillKey === undefined && partySizeMin <= size && size <= partySizeMax,
    );
}

/**
 * Sends `heroIds` of `guildId` on the first open Quest, from this Turn or the first morning one is
 * on the Board, at `difficulty` and through `encounterKeys` when given; returns the document just
 * after dispatch and the Party.
 */
function send(
  document: WorldDocument,
  guildId: GuildId,
  heroIds: HeroId[],
  deps: EngineDeps,
  { difficulty, encounterKeys }: { difficulty?: number; encounterKeys?: string[] } = {},
): { document: WorldDocument; party: Party; events: TurnEvent[] } {
  let current = document;
  const events: TurnEvent[] = [];
  let open = openQuest(current.world, heroIds.length);
  for (let tries = 0; open === undefined || heroIds.some((id) => hero(current.world, id).partyId !== null); tries += 1) {
    if (tries > 60) throw new Error('No open Quest in 60 Turns');
    const result = advance(current, deps);
    current = withValid(result.document, deps);
    events.push(...result.events);
    open = openQuest(current.world, heroIds.length);
  }
  const sent = applyAction(current, { kind: 'dispatch', guildId, questId: open.id, heroIds }, deps);
  if (!sent.ok) throw new Error(`Refused: ${sent.rejection.reason}`);
  const quest = sent.document.world.quests[open.id] as Quest;
  if (difficulty !== undefined) quest.difficulty = difficulty;
  if (encounterKeys !== undefined) quest.encounterKeys = [...encounterKeys];
  const party = sent.document.world.parties[quest.partyIds[0] as Party['id']] as Party;
  return { document: withValid(sent.document, deps), party: structuredClone(party), events };
}

/** Stills every Rival's controller until the spy is restored, for a test whose subject is a Rival's own Party. */
function stillRivalControllers(): void {
  const rivalControllers = phases.find((phase) => phase.name === 'rivalControllers');
  if (rivalControllers === undefined) throw new Error('No rivalControllers phase');
  vi.spyOn(rivalControllers, 'run').mockReturnValue([]);
}

/** Runs `questsConclude` alone on a copy of `eve`'s world moved on to the Party's return night. */
function concludeAlone(eve: WorldDocument, party: Party, deps: EngineDeps): { world: World; events: TurnEvent[] } {
  const world = structuredClone(eve.world);
  world.turn = party.returnsOnTurn;
  const events = questsConclude(world, phaseContext(world, deps, eve.history));
  return { world, events };
}

// ── The first box ────────────────────────────────────────────────────────────────────────────

describe('Regard between Heroes on shared Quests', () => {
  test('two Heroes after ten shared successful Quests are close; the event fired at each band crossing and not otherwise', { timeout: 60_000 }, () => {
    // Harmless Encounters, so no Regard consequence, Injury or Death; difficulty 1, so every Check
    // succeeds; Wealth enough that no Upkeep ends the game.
    const deps = soloDeps({ startingWealth: 1_000_000 }, harmlessContent);
    let document = created('ten-quests', deps);
    const guild = playerGuild(document.world) as Guild;
    const [a, b] = guild.rosterIds as [HeroId, HeroId];
    const resolvedOn: number[] = [];
    const questOn: QuestId[] = [];
    const crossings: EngineEventOf<'hero.regard-changed'>[] = [];

    for (let quest = 1; quest <= 10; quest += 1) {
      const sent = send(document, guild.id, [a, b], deps, { difficulty: 1 });
      crossings.push(...ofType(sent.events, 'hero.regard-changed'));
      const home = playTo(sent.document, sent.party.returnsOnTurn, deps);
      document = home.document;
      const resolved = ofType(home.events, 'quest.resolved');
      expect(resolved.map((event) => event.payload.band)).toEqual(['strong']);
      resolvedOn.push(sent.party.returnsOnTurn);
      questOn.push(sent.party.questId);
      crossings.push(...ofType(home.events, 'hero.regard-changed'));
    }

    // 1.5 a Quest: 4.5 after the third crosses into warm, 12 after the eighth into close, 15 after ten.
    const { world } = document;
    expect(regardValue(hero(world, a).regard, b)).toBe(15);
    expect(regardValue(hero(world, b).regard, a)).toBe(15);
    expect(regardBand(relationship(a, b, world, deps.config), deps.config)).toBe('close');
    const at = (n: number) => resolvedOn[n - 1];
    // Each crossing names the Quest that made it.
    const q = (n: number) => questOn[n - 1] as QuestId;
    expect(crossings.map(({ turn, participants, milestone, payload }) => ({ turn, participants, milestone, payload }))).toEqual([
      { turn: at(3), participants: [a, b, q(3), guild.id], milestone: false, payload: { heroId: a, entityId: b, cause: 'shared-quest', questId: q(3), before: 3, after: 4.5, bandBefore: 'neutral', bandAfter: 'warm' } },
      { turn: at(3), participants: [b, a, q(3), guild.id], milestone: false, payload: { heroId: b, entityId: a, cause: 'shared-quest', questId: q(3), before: 3, after: 4.5, bandBefore: 'neutral', bandAfter: 'warm' } },
      { turn: at(8), participants: [a, b, q(8), guild.id], milestone: false, payload: { heroId: a, entityId: b, cause: 'shared-quest', questId: q(8), before: 10.5, after: 12, bandBefore: 'warm', bandAfter: 'close' } },
      { turn: at(8), participants: [b, a, q(8), guild.id], milestone: false, payload: { heroId: b, entityId: a, cause: 'shared-quest', questId: q(8), before: 10.5, after: 12, bandBefore: 'warm', bandAfter: 'close' } },
    ]);
    // In the History too, and nowhere else.
    expect((document.history.byType['hero.regard-changed'] ?? []).map((position) => document.history.entries[position]?.turn)).toEqual(
      [at(3), at(3), at(8), at(8)],
    );
    // Relationship is never stored: nothing in the saved document is called so.
    expect(serialise(document).toLowerCase()).not.toContain('relationship');
  });

  test('one change a pair a Quest: regardPerSharedQuest, the success bonus on a success, and the Encounters\' Regard', () => {
    const deps = soloDeps();
    expect(sharedQuestRegardDelta(true, 0, deps.config)).toBe(1.5);
    expect(sharedQuestRegardDelta(false, 0, deps.config)).toBe(1);
    expect(sharedQuestRegardDelta(true, 2, deps.config)).toBe(3.5);
    expect(sharedQuestRegardDelta(false, -3, deps.config)).toBe(-2);
    expect(sharedQuestRegardDelta(true, 1, soloDeps({ regardPerSharedQuest: 2, regardOnSuccessBonus: 1 }).config)).toBe(4);
  });

  test.each([
    // What the Party does, the difficulty that makes it so, the band, the Encounters' Regard, and
    // the one change: regardPerSharedQuest 1, the success bonus 0.5 on a success, and the Encounter's.
    ['succeeds', 1, 'strong', 2, 1 + 0.5 + 2],
    ['fails', 5000, 'fail', -3, 1 - 3],
  ] as const)("a Party that %s applies the Encounters' Regard with the Quest's, once, each Hero for each other", (_, difficulty, band, regardDelta, delta) => {
    // One Encounter whose success raises Regard between the Party by 2 and whose failure lowers it by 3.
    const content = withEncounters({
      success: [{ kind: 'regard', between: 'party', delta: 2 }],
      failure: [{ kind: 'regard', between: 'party', delta: -3 }],
    });
    const deps = soloDeps({ startingWealth: 1_000_000 }, content);
    const start = created(`encounter-regard-${band}`, deps);
    const guild = playerGuild(start.world) as Guild;
    const heroIds = guild.rosterIds.slice(0, 3);
    const sent = send(start, guild.id, heroIds, deps, { difficulty, encounterKeys: ['the-flooded-ford'] });
    const eve = playTo(sent.document, sent.party.returnsOnTurn - 1, deps).document;

    const { world, events } = concludeAlone(eve, sent.party, deps);

    const [resolved] = ofType(events, 'quest.resolved');
    expect(resolved?.payload).toMatchObject({ band, regardDelta });
    for (const holder of heroIds) {
      const others = heroIds.filter((id) => id !== holder);
      expect(hero(world, holder).regard).toEqual(
        Object.fromEntries(others.map((id) => [id, { value: delta, since: sent.party.returnsOnTurn, reason: 'quest.resolved' }])),
      );
    }
    // Within the neutral band either way: no event.
    expect(ofType(events, 'hero.regard-changed')).toEqual([]);
    withValid({ ...eve, world }, deps);
  });

  test('the dead take no part: the survivors gain Regard for each other, none for the dead, and the dead none', () => {
    // Every failed Check kills one Hero and injures another, certainly.
    const deps = soloDeps({ startingWealth: 1_000_000 }, certainHarmContent);
    const start = created('dead-take-no-part', deps);
    const guild = playerGuild(start.world) as Guild;
    const heroIds = guild.rosterIds.slice(0, 3);
    const sent = send(start, guild.id, heroIds, deps, { difficulty: 5000, encounterKeys: ['ambush-on-the-road'] });
    const eve = playTo(sent.document, sent.party.returnsOnTurn - 1, deps).document;

    const { world, events } = concludeAlone(eve, sent.party, deps);

    const [died] = ofType(events, 'hero.died').map((event) => event.payload.heroId);
    if (died === undefined) throw new Error('Nobody died');
    const survivors = heroIds.filter((id) => id !== died);
    expect(hero(world, died).regard).toEqual({});
    for (const holder of survivors) {
      const [other] = survivors.filter((id) => id !== holder);
      expect(Object.keys(hero(world, holder).regard)).toEqual([other]);
      expect(regardValue(hero(world, holder).regard, other as HeroId)).toBe(1);
    }
    withValid({ ...eve, world }, deps);
  });

  test("a Rival's Party gains Regard exactly as the player's does", () => {
    const deps = testDeps({ rivalCount: 1, ...pinned, startingWealth: 1_000_000 }, harmlessContent);
    stillRivalControllers();
    const start = created('rival-regard', deps);
    const rival = Object.values(start.world.guilds).find((guild) => guild.controller.kind === 'rival') as Guild;
    const heroIds = rival.rosterIds.slice(0, 2) as [HeroId, HeroId];
    const sent = send(start, rival.id, heroIds, deps, { difficulty: 1 });
    const eve = playTo(sent.document, sent.party.returnsOnTurn - 1, deps).document;

    const { world } = concludeAlone(eve, sent.party, deps);

    expect(regardValue(hero(world, heroIds[0]).regard, heroIds[1])).toBe(1.5);
    expect(regardValue(hero(world, heroIds[1]).regard, heroIds[0])).toBe(1.5);
    withValid({ ...eve, world }, deps);
  });
});

describe('regardOnSharedQuest', () => {
  /** The fixture world with every Regard cleared, and three Heroes of the player's Roster. */
  function scene() {
    const { document, ids } = buildDocument({ rosterSize: 3 });
    const { world } = document;
    for (const row of Object.values(world.heroes)) row.regard = {};
    const guild = world.guilds[ids.playerGuild] as Guild;
    const heroes = guild.rosterIds.map((id) => hero(world, id)) as [Hero, Hero, Hero];
    return { document, world, heroes, questId: ids.takenQuest };
  }

  test('emits hero.regard-changed only for a change that crosses a band, one for each Hero whose Regard crossed, naming the Quest', () => {
    const deps = soloDeps();
    const { document, world, heroes, questId } = scene();
    const [a, b, c] = heroes;
    a.regard[b.id] = { value: 3, since: 0, reason: 'quest.resolved' };
    const ctx = phaseContext(world, deps);

    const events = regardOnSharedQuest([a, b, c], ctx, { questId, succeeded: true, regardDelta: 0 });

    // a's for b goes 3 to 4.5, into warm; every other goes 0 to 1.5, staying neutral.
    expect(events.map((event) => [event.type, event.payload])).toEqual([
      ['hero.regard-changed', { heroId: a.id, entityId: b.id, cause: 'shared-quest', questId, before: 3, after: 4.5, bandBefore: 'neutral', bandAfter: 'warm' }],
    ]);
    expect(events[0]?.participants).toEqual([a.id, b.id, questId, a.guildId]);
    for (const [holder, other, value] of [[a, c, 1.5], [b, a, 1.5], [b, c, 1.5], [c, a, 1.5], [c, b, 1.5]] as const) {
      expect(holder.regard[other.id]).toEqual({ value, since: world.turn, reason: 'quest.resolved' });
    }
    withValid(document, deps);
  });

  test("holds Regard inside the scale, and a Party of one shares nothing", () => {
    const deps = soloDeps();
    const { world, heroes, questId } = scene();
    const [a, b] = heroes;
    a.regard[b.id] = { value: 19.5, since: 0, reason: 'quest.resolved' };
    const ctx = phaseContext(world, deps);

    regardOnSharedQuest([a, b], ctx, { questId, succeeded: true, regardDelta: 5 });
    expect(regardValue(a.regard, b.id)).toBe(20);
    expect(regardValue(b.regard, a.id)).toBe(6.5);

    expect(regardOnSharedQuest([a], ctx, { questId, succeeded: true, regardDelta: 5 })).toEqual([]);
    expect(regardOnSharedQuest([], ctx, { questId, succeeded: true, regardDelta: 5 })).toEqual([]);
    expect(regardValue(a.regard, b.id)).toBe(20);
  });
});

// ── The second box: Relationship ─────────────────────────────────────────────────────────────

describe('relationship', () => {
  const config = soloDeps().config;

  /** Two Heroes of the fixture world, their Regard for each other set to `ab` and `ba` (undefined: none held). */
  function pair(ab: number | undefined, ba: number | undefined) {
    const { document } = buildDocument({ rosterSize: 2 });
    const { world } = document;
    const [a, b] = (playerGuild(world) as Guild).rosterIds.map((id) => hero(world, id)) as [Hero, Hero];
    a.regard = ab === undefined ? {} : { [b.id]: { value: ab, since: 0, reason: 'quest.resolved' } };
    b.regard = ba === undefined ? {} : { [a.id]: { value: ba, since: 0, reason: 'quest.resolved' } };
    return { world, a, b };
  }

  test.each([
    [10, 6, 8],
    [-20, 20, 0],
    [15, undefined, 7.5],
    [undefined, -9, -4.5],
    [undefined, undefined, 0],
    [-20, -12, -16],
  ])('is the mean of the two Regards (%s and %s: %s), and the same both ways', (ab, ba, expected) => {
    const { world, a, b } = pair(ab, ba);

    expect(relationship(a.id, b.id, world, config)).toBe(expected);
    expect(relationship(b.id, a.id, world, config)).toBe(expected);
    expect(relationshipBetween(a, b, config)).toBe(expected);
    expect(relationshipBetween(b, a, config)).toBe(expected);
  });

  test('is held inside the scale, as a value saved under a wider one may lie outside it', () => {
    const { world, a, b } = pair(20, 16);
    const narrow = { ...config, regardMin: -10, regardMax: 10 };

    expect(relationship(a.id, b.id, world, narrow)).toBe(10);
    expect(relationship(a.id, b.id, world, config)).toBe(18);
  });

  test('is neutral Regard for an entity the world lacks or that holds no Regard, whose own is read as none', () => {
    const { world, a, b } = pair(12, 4);
    const missing = makeId('heroes', 999_999);
    const quest = makeId('quests', 1);
    a.regard[missing] = { value: 12, since: 0, reason: 'quest.resolved' };

    // Half of a's own Regard for each: the other holds none.
    expect(relationship(a.id, missing, world, config)).toBe(6);
    expect(relationship(missing, a.id, world, config)).toBe(6);
    expect(relationship(a.id, quest, world, config)).toBe(0);
    expect(relationship(b.id, a.id, world, config)).toBe(8);
  });

  test('is never stored: no row of the World State has a field for it', () => {
    const documentTypes = readFileSync(fileURLToPath(new URL('./document.ts', import.meta.url)), 'utf8');

    // No field, optional or not, is named for it: it is computed from two lookups (data-model rule 1).
    expect(documentTypes).not.toMatch(/relationship\w*\s*\??\s*:/i);
    const { world } = pair(12, 4);
    for (const table of ['guilds', 'guildmasters', 'heroes', 'patrons'] as const) {
      for (const row of Object.values(world[table])) expect(Object.keys(row).join(' ')).not.toMatch(/relationship/i);
    }
  });

  test('meanPairwiseRelationship is the mean over every pair, and neutral for fewer than two', () => {
    const { world, a, b } = pair(10, 10);
    const c = Object.values(world.heroes).find((it) => it.id !== a.id && it.id !== b.id) as Hero;
    c.regard = { [a.id]: { value: -20, since: 0, reason: 'quest.resolved' } };
    // a–b 10, a–c −10, b–c 0.
    expect(meanPairwiseRelationship([a, b, c], config)).toBe(0);
    expect(meanPairwiseRelationship([a, b], config)).toBe(10);
    expect(meanPairwiseRelationship([a], config)).toBe(0);
    expect(meanPairwiseRelationship([], config)).toBe(0);
  });

  test('relationshipBandCounts counts each pair once, by the band of its Relationship', () => {
    const { world, a, b } = pair(20, 20);
    const c = Object.values(world.heroes).find((it) => it.id !== a.id && it.id !== b.id) as Hero;
    c.regard = { [a.id]: { value: -16, since: 0, reason: 'quest.resolved' }, [b.id]: { value: 10, since: 0, reason: 'quest.resolved' } };
    // a–b 20 close, a–c −8 cool, b–c 5 warm; an id the world lacks is left out.
    expect(relationshipBandCounts([a.id, b.id, c.id, makeId('heroes', 999_999)], world, config)).toEqual({
      hostile: 0,
      cool: 1,
      neutral: 0,
      warm: 1,
      close: 1,
    });
  });
});

// ── The nightly decay ────────────────────────────────────────────────────────────────────────

describe('the Hero State Engine decays Regard between Heroes who have not shared a Quest for a year', () => {
  // A step of exactly 1 a night: 18 of the scale's reach of 20 a year, over 360 nights.
  const fast = soloDeps({ regardDecayPerYear: 18, rivalCount: 1 });
  const entry = (value: number, since: number) => ({ value, since, reason: 'quest.resolved' });

  /** A created world with a Rival, every Hero's Regard cleared, the player's first three and the Rival's first two Heroes. */
  function scene(deps: EngineDeps = fast) {
    const document = created('decay', deps);
    const { world } = document;
    for (const row of Object.values(world.heroes)) row.regard = {};
    const player = playerGuild(world) as Guild;
    const rival = Object.values(world.guilds).find((guild) => guild.controller.kind === 'rival') as Guild;
    const [a, b, c] = player.rosterIds.map((id) => hero(world, id)) as [Hero, Hero, Hero];
    const [r, s] = rival.rosterIds.map((id) => hero(world, id)) as [Hero, Hero];
    return { document, world, player, a, b, c, r, s };
  }

  /** Runs the Hero State Engine alone on `world` on the night of Day `day`. */
  function night(document: WorldDocument, world: World, day: number, deps: EngineDeps = fast): TurnEvent[] {
    world.turn = nightOf(day);
    return heroState(world, phaseContext(world, deps, document.history));
  }

  test('the step is regardDecayPerYear of the scale\'s reach over the year\'s nights', () => {
    expect(heroRegardDecayStep(fast.config)).toBe(1);
    expect(heroRegardDecayStep(soloDeps({ regardDecayPerYear: 0.25 }).config)).toBeCloseTo(5 / 360, 12);
    expect(heroRegardDecayStep(soloDeps({ regardDecayPerYear: 0 }).config)).toBe(0);
  });

  test('from a year after the last shared Quest, not before, toward neutral from either side, emitting only on a band crossing, and the entry goes at neutral', () => {
    const { document, world, a, b, c } = scene();
    const since = nightOf(10);
    a.regard[b.id] = entry(5.5, since);
    a.regard[c.id] = entry(-4.5, since);

    // 359 Days on, a Turn short of a year: nothing moves.
    expect(night(document, world, 10 + 359)).toEqual([]);
    expect(a.regard[b.id]).toEqual(entry(5.5, since));

    // A year on: one step a night; warm to neutral on the second night, cool to neutral on the first.
    const first = night(document, world, 10 + 360);
    expect(a.regard[b.id]).toEqual(entry(4.5, since));
    expect(a.regard[c.id]).toEqual(entry(-3.5, since));
    expect(ofType(first, 'hero.regard-changed').map((event) => event.payload)).toEqual([
      { heroId: a.id, entityId: c.id, cause: 'decay', before: -4.5, after: -3.5, bandBefore: 'cool', bandAfter: 'neutral' },
    ]);
    const second = night(document, world, 10 + 361);
    expect(ofType(second, 'hero.regard-changed').map((event) => event.payload)).toEqual([
      { heroId: a.id, entityId: b.id, cause: 'decay', before: 4.5, after: 3.5, bandBefore: 'warm', bandAfter: 'neutral' },
    ]);
    expect(ofType(second, 'hero.regard-changed')[0]?.participants).toEqual([a.id, b.id, (playerGuild(world) as Guild).id]);

    const quiet: TurnEvent[] = [];
    for (let day = 10 + 362; day <= 10 + 366; day += 1) quiet.push(...night(document, world, day));
    expect(ofType(quiet, 'hero.regard-changed')).toEqual([]);
    expect(a.regard).toEqual({});
    withValid({ ...document, world }, fast);
  });

  test('a pair who shared a Quest within the year keeps its Regard; so do entries for anyone but a Hero', () => {
    const { document, world, a, b, c } = scene();
    const guildmasterId = (playerGuild(world) as Guild).guildmasterId;
    a.regard[b.id] = entry(10, nightOf(100));
    a.regard[c.id] = entry(10, nightOf(0));
    a.regard[guildmasterId] = entry(10, nightOf(0));

    night(document, world, 400);

    expect(a.regard[b.id]).toEqual(entry(10, nightOf(100)));
    expect(a.regard[c.id]).toEqual(entry(9, nightOf(0)));
    expect(a.regard[guildmasterId]).toEqual(entry(10, nightOf(0)));
    // The predicate itself: due a year after the shared Quest, and only for an entry keyed by a Hero.
    expect(heroRegardDecays(entry(10, nightOf(0)), c.id, nightOf(400), fast.config)).toBe(true);
    expect(heroRegardDecays(entry(10, nightOf(100)), b.id, nightOf(400), fast.config)).toBe(false);
    expect(heroRegardDecays(entry(10, nightOf(0)), guildmasterId, nightOf(400), fast.config)).toBe(false);
    withValid({ ...document, world }, fast);
  });

  test("a dead or retired Hero's own Regard stays as it stood; a living Hero's for them decays like any other", () => {
    const { document, world, player, a, b, c } = scene();
    for (const [gone, field] of [[b, 'diedOnTurn'], [c, 'retiredOnTurn']] as const) {
      gone[field] = nightOf(5);
      gone.partyId = null;
      player.rosterIds = player.rosterIds.filter((id) => id !== gone.id);
      gone.regard[a.id] = entry(10, nightOf(0));
      a.regard[gone.id] = entry(10, nightOf(0));
    }

    night(document, world, 400);

    expect(b.regard[a.id]).toEqual(entry(10, nightOf(0)));
    expect(c.regard[a.id]).toEqual(entry(10, nightOf(0)));
    expect(a.regard[b.id]).toEqual(entry(9, nightOf(0)));
    expect(a.regard[c.id]).toEqual(entry(9, nightOf(0)));
  });

  test("every Guild alike: a Rival's Heroes' Regard decays as the player's does", () => {
    const { document, world, a, b, r, s } = scene();
    a.regard[b.id] = entry(10, nightOf(0));
    r.regard[s.id] = entry(10, nightOf(0));

    night(document, world, 400);

    expect(regardValue(a.regard, b.id)).toBe(9);
    expect(regardValue(r.regard, s.id)).toBe(9);
  });

  test('decayHeroRegard visits due entries in id order, whatever order the map holds them in', () => {
    const { document, world, a, b, c } = scene();
    const ctx = phaseContext(world, fast, document.history);
    world.turn = nightOf(400);
    const [first, second] = [b.id, c.id].sort() as [HeroId, HeroId];
    const map: RegardMap = {};
    map[second] = entry(4.5, nightOf(0));
    map[first] = entry(4.5, nightOf(0));
    a.regard = map;

    const events = decayHeroRegard(a, world, { ...ctx, turn: world.turn });

    expect(ofType(events, 'hero.regard-changed').map((event) => event.payload.entityId)).toEqual([first, second]);
  });
});
