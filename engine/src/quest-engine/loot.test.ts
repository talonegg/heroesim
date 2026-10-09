import { afterEach, describe, expect, test, vi } from 'vitest';
import { advance } from '../advance.js';
import { questBands, type EngineDeps, type GameConfig, type QuestBand } from '../config.js';
import type { ContentSet, Degree, LootTable } from '../content-types.js';
import { bestParties } from '../best-party.js';
import { availableHeroes, staffableQuests } from '../controllers/rival.js';
import { createWorld } from '../create.js';
import type { Guild, GuildId, Party, Quest, WorldDocument } from '../document.js';
import type { EngineEventOf, EngineEventType, TurnEvent } from '../events.js';
import { streamOf } from '../generators/draw.js';
import { createItem, holdings } from '../items.js';
import { phases } from '../pipeline.js';
import { next } from '../rng.js';
import { playerGuild } from '../selectors.js';
import { nightOf } from '../time.js';
import { plannedStreams, testContent, testDeps, testWorld, withEncounters, withValid } from '../world.test-support.js';
import { drawLoot } from './loot.js';
import { applyAction } from '../actions/action.js';

// M5-S5: Loot (DL-52). `drawLoot` is tested on its own for the bands, the draws and uniqueness; the
// night's `questsConclude` for the award, played through `advance` from created worlds whose Party is
// sent on a Quest given the table the test needs; and a month of play for the harness's counter.

const setup = { guildmasterName: 'Ada', guildName: 'The Test', createdAt: 'test' };

afterEach(() => {
  vi.restoreAllMocks();
});

/** A Loot table of `entries`, each `[definitionKey, weight, quantityMin, quantityMax]`. */
function table(key: string, ...entries: [string, number, number, number][]): LootTable {
  return {
    key,
    entries: entries.map(([definitionKey, weight, quantityMin, quantityMax]) => ({ definitionKey, weight, quantityMin, quantityMax })),
  };
}

/** `content` (the test content) with `tables` beside its own two. */
function withTables(content: ContentSet, ...tables: LootTable[]): ContentSet {
  return { ...content, lootTables: { ...content.lootTables, ...Object.fromEntries(tables.map((it) => [it.key, it])) } };
}

const blade = table('the-blade', ['barrow-kings-blade', 1, 1, 1]);
const whetstones = table('whetstones', ['whetstone', 1, 2, 2]);
const bladeOrWhetstones = table('blade-or-whetstones', ['barrow-kings-blade', 1, 1, 1], ['whetstone', 1, 3, 3]);

/** Every Check succeeds, and no outcome costs anything: every Quest is a strong success. */
const everyCheckPasses = withEncounters({ difficultyFactor: 0.001, success: [], failure: [] });
/** Every Check fails, at no cost: every Quest is a failure. */
const everyCheckFails = withEncounters({ difficultyFactor: 1000, success: [], failure: [] });

/**
 * The test config with no Rivals (DL-30: a test whose subject is one Party stills them), Loot's
 * fields and the Quest Engine's pinned, and `overrides` on it.
 */
function lootDeps(overrides: Partial<GameConfig> = {}, content: ContentSet = testContent): EngineDeps {
  return testDeps(
    {
      rivalCount: 0,
      lootDifficultyThreshold: 25,
      lootOnBands: ['strong'],
      checkVariance: 0.2,
      skillBonusPerRating: 2,
      bandBySuccessShare: { successAbove: 0.5, strongAtLeast: 1 },
      ...overrides,
    },
    content,
  );
}

const ofType = <Type extends EngineEventType>(events: readonly TurnEvent[], type: Type): EngineEventOf<Type>[] =>
  events.filter((event): event is EngineEventOf<Type> => event.type === type);

// ── drawLoot ─────────────────────────────────────────────────────────────────────────────────

describe('drawLoot', () => {
  const content = withTables(testContent, blade, whetstones, bladeOrWhetstones);

  test('awards an entry of the table only on a band in lootOnBands (INPUTS 7.4: strong only by default)', () => {
    const awarded = (lootOnBands: QuestBand[]) =>
      questBands.filter((band) => {
        const deps = lootDeps({ lootOnBands }, content);
        return drawLoot(testWorld(`bands-${band}`, deps), { lootTableKey: 'whetstones' }, band, deps) !== null;
      });

    expect(awarded(['strong'])).toEqual(['strong']);
    expect(awarded(['success', 'strong'])).toEqual(['success', 'strong']);
    expect(awarded([])).toEqual([]);
    const deps = lootDeps({}, content);
    expect(drawLoot(testWorld('entry', deps), { lootTableKey: 'whetstones' }, 'strong', deps)).toEqual({
      lootTableKey: 'whetstones',
      definitionKey: 'whetstone',
      quantity: 2,
      unique: false,
    });
  });

  test('takes two draws from quests for a Quest with a table, whatever the band, and none for one without', () => {
    const deps = lootDeps({}, content);
    for (const band of questBands) {
      const world = testWorld(`draws-${band}`, deps, plannedStreams);
      const twin = structuredClone(streamOf(world, 'quests'));
      const before = structuredClone(world.rng) as Record<string, unknown>;

      drawLoot(world, { lootTableKey: 'blade-or-whetstones' }, band, deps);

      next(twin);
      next(twin);
      expect(streamOf(world, 'quests'), band).toEqual(twin);
      const after = world.rng as Record<string, unknown>;
      for (const name of plannedStreams) if (name !== 'quests') expect(after[name], name).toEqual(before[name]);
    }
    // No table, or one content does not define (the validator warns): nothing drawn, nothing awarded.
    for (const lootTableKey of [null, 'the-lost-hoard']) {
      const world = testWorld('none', deps);
      const before = structuredClone(world.rng);
      expect(drawLoot(world, { lootTableKey }, 'strong', deps)).toBeNull();
      expect(world.rng).toEqual(before);
    }
  });

  test("on a Quest with a Finale, awards only when the Finale ended a Triumph, its two draws taken whatever it did (v1.1.4-S8)", () => {
    const deps = lootDeps({}, content);
    const finales = ['none', 'triumph', 'success', 'setback', 'failure', 'unmet'] as const;
    const awarded = finales.filter((finale) => {
      const world = testWorld(`finale-${finale}`, deps);
      const twin = structuredClone(streamOf(world, 'quests'));
      const loot = drawLoot(world, { lootTableKey: 'whetstones' }, 'strong', deps, finale);
      next(twin);
      next(twin);
      expect(streamOf(world, 'quests'), finale).toEqual(twin);
      return loot !== null;
    });
    expect(awarded).toEqual(['none', 'triumph']);
    // The band's rule still holds: a Finale's Triumph on a plain success awards nothing.
    expect(drawLoot(testWorld('finale-success-band', deps), { lootTableKey: 'whetstones' }, 'success', deps, 'triumph')).toBeNull();
  });

  // v1.1.6-S16 (DL-202): the Degrees a Finale may end at for Loot are `lootOnFinaleDegrees`, the Triumph alone by default.
  test("on a Quest with a Finale, awards when the Finale ended at a Degree in lootOnFinaleDegrees, and always on a Quest with none", () => {
    const awardedFor = (lootOnFinaleDegrees: readonly Degree[]) =>
      (['none', 'triumph', 'success', 'setback', 'failure', 'unmet'] as const).filter((finale) => {
        const deps = lootDeps({ lootOnFinaleDegrees }, content);
        return drawLoot(testWorld(`finale-degrees-${finale}`, deps), { lootTableKey: 'whetstones' }, 'strong', deps, finale) !== null;
      });

    expect(awardedFor(['triumph'])).toEqual(['none', 'triumph']);
    expect(awardedFor(['triumph', 'success'])).toEqual(['none', 'triumph', 'success']);
    expect(awardedFor(['failure', 'setback'])).toEqual(['none', 'setback', 'failure']);
    // A Finale the Party never reached is unmet, which is no Degree: it awards nothing under any list.
    expect(awardedFor(['failure', 'setback', 'success', 'triumph'])).toEqual(['none', 'triumph', 'success', 'setback', 'failure']);
    expect(awardedFor([])).toEqual(['none']);
  });

  test("draws entries in proportion to their weights, each quantity inside its entry's range", () => {
    const deps = lootDeps({}, withTables(testContent, table('three-to-one', ['whetstone', 3, 1, 3], ['lockpicks', 1, 2, 5])));
    const world = testWorld('weights', deps);
    const drawn = Array.from({ length: 2000 }, () => drawLoot(world, { lootTableKey: 'three-to-one' }, 'strong', deps));

    const whetstone = drawn.filter((loot) => loot?.definitionKey === 'whetstone');
    expect(whetstone.length / drawn.length).toBeGreaterThan(0.7);
    expect(whetstone.length / drawn.length).toBeLessThan(0.8);
    for (const loot of drawn) {
      const [min, max] = loot?.definitionKey === 'whetstone' ? [1, 3] : [2, 5];
      expect(loot?.quantity).toBeGreaterThanOrEqual(min);
      expect(loot?.quantity).toBeLessThanOrEqual(max);
    }
    expect(new Set(drawn.map((loot) => loot?.quantity))).toEqual(new Set([1, 2, 3, 4, 5]));
  });

  test('never draws a unique Item the world already holds, whoever holds it; with nothing else left, awards nothing', () => {
    const deps = lootDeps({}, content);
    const world = testWorld('unique', deps);
    const fresh = drawLoot(structuredClone(world), { lootTableKey: 'the-blade' }, 'strong', deps);
    expect(fresh).toEqual({ lootTableKey: 'the-blade', definitionKey: 'barrow-kings-blade', quantity: 1, unique: true });

    createItem(world, 'barrow-kings-blade', { kind: 'market' });
    const drawn = Array.from({ length: 200 }, () => drawLoot(world, { lootTableKey: 'blade-or-whetstones' }, 'strong', deps));
    expect(new Set(drawn.map((loot) => loot?.definitionKey))).toEqual(new Set(['whetstone']));

    const twin = structuredClone(streamOf(world, 'quests'));
    expect(drawLoot(world, { lootTableKey: 'the-blade' }, 'strong', deps)).toBeNull();
    next(twin);
    next(twin);
    expect(streamOf(world, 'quests')).toEqual(twin);
  });
});

// ── The award, through the night's questsConclude ────────────────────────────────────────────

interface Sent {
  document: WorldDocument;
  party: Party;
  quest: Quest;
  guildId: GuildId;
}

/**
 * A world created from `seed` whose player Guild (or first Rival) sends two Heroes on the first
 * Quest on the Board that asks for no Class or Skill, the Quest given `lootTableKey`.
 */
function sent(seed: string, deps: EngineDeps, lootTableKey: string | null, { rival = false } = {}): Sent {
  const start = createWorld(seed, setup, deps).document;
  const guilds = Object.values(start.world.guilds);
  const guild = (rival ? guilds.find((it) => it.controller.kind === 'rival') : playerGuild(start.world)) as Guild;
  const heroIds = guild.rosterIds.slice(0, 2);
  const open = start.world.board
    .map((id) => start.world.quests[id] as Quest)
    .find(({ requirements: { classKey, skillKey, partySizeMin, partySizeMax } }) =>
      classKey === undefined && skillKey === undefined && partySizeMin <= 2 && 2 <= partySizeMax,
    );
  if (open === undefined) throw new Error(`No open Quest on ${seed}'s first Board`);
  const result = applyAction(start, { kind: 'dispatch', guildId: guild.id, questId: open.id, heroIds }, deps);
  if (!result.ok) throw new Error(`Refused: ${result.rejection.reason}`);
  const quest = result.document.world.quests[open.id] as Quest;
  quest.lootTableKey = lootTableKey;
  const party = result.document.world.parties[quest.partyIds[0] as Party['id']] as Party;
  return { document: withValid(result.document, deps), party: structuredClone(party), quest: structuredClone(quest), guildId: guild.id };
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

/** Plays `sent`'s Party home and returns the document and the events of its return night. */
function home({ document, party }: Sent, deps: EngineDeps): { document: WorldDocument; events: TurnEvent[] } {
  const eve = playTo(document, party.returnsOnTurn - 1, deps).document;
  return playTo(eve, party.returnsOnTurn, deps);
}

describe("questsConclude's Loot", () => {
  // M5-S5's first box.
  test('appears only on the configured bands and only from a Quest whose template has a table', () => {
    const content = withTables(everyCheckPasses, whetstones);
    const failing = withTables(everyCheckFails, whetstones);
    const cases: [string, EngineDeps, string | null, boolean][] = [
      ['strong, with a table', lootDeps({}, content), 'whetstones', true],
      ['strong, without a table', lootDeps({}, content), null, false],
      ['fail, with a table', lootDeps({}, failing), 'whetstones', false],
      // Every Check passes, but no share reaches strongAtLeast: a success.
      ['success, strong only', lootDeps({ bandBySuccessShare: { successAbove: 0.5, strongAtLeast: 2 } }, content), 'whetstones', false],
      ['success, success configured', lootDeps({ lootOnBands: ['success', 'strong'], bandBySuccessShare: { successAbove: 0.5, strongAtLeast: 2 } }, content), 'whetstones', true],
      ['strong, no band configured', lootDeps({ lootOnBands: [] }, content), 'whetstones', false],
    ];
    for (const [name, deps, lootTableKey, looted] of cases) {
      const away = sent('bands', deps, lootTableKey);
      const { document, events } = home(away, deps);

      const [resolved] = ofType(events, 'quest.resolved');
      expect(resolved?.payload.band, name).toBe(name.split(',')[0]);
      expect(ofType(events, 'quest.loot'), name).toHaveLength(looted ? 1 : 0);
      const held = holdings(document.world, { kind: 'guild', id: away.guildId }).stacks.filter((it) => it.definitionKey === 'whetstone');
      expect(held.map((it) => it.quantity), name).toEqual(looted ? [2] : []);
    }
  });

  test('puts a common Item in the Guild\'s stack of it with quest.loot, not a Milestone, right after quest.resolved', () => {
    const deps = lootDeps({}, withTables(everyCheckPasses, whetstones));
    const away = sent('common', deps, 'whetstones');

    const { document, events } = home(away, deps);

    const [loot] = ofType(events, 'quest.loot');
    const [stack] = holdings(document.world, { kind: 'guild', id: away.guildId }).stacks;
    expect(stack).toMatchObject({ definitionKey: 'whetstone', quantity: 2, holder: { kind: 'guild', id: away.guildId } });
    expect(loot).toMatchObject({
      participants: [away.quest.id, away.party.id, away.guildId],
      milestone: false,
      payload: {
        questId: away.quest.id,
        partyId: away.party.id,
        guildId: away.guildId,
        lootTableKey: 'whetstones',
        definitionKey: 'whetstone',
        quantity: 2,
        itemId: null,
        stackId: stack?.id,
      },
    });
    const types = events.map((event) => event.type);
    expect(types[types.indexOf('quest.resolved') + 1]).toBe('quest.loot');
    expect(document.history.byType['quest.loot']).toHaveLength(1);
  });

  // M5-S5's second box.
  test('creates a unique Item once in world.items, held by the Guild, a Milestone; the same Item is never awarded again', () => {
    const deps = lootDeps({}, withTables(everyCheckPasses, blade, bladeOrWhetstones));
    const first = sent('unique', deps, 'the-blade');

    const { document, events } = home(first, deps);

    const blades = Object.values(document.world.items).filter((it) => it.definitionKey === 'barrow-kings-blade');
    expect(blades).toHaveLength(1);
    const [item] = blades;
    if (item === undefined) throw new Error('No blade');
    expect(item.holder).toEqual({ kind: 'guild', id: first.guildId });
    const [loot] = ofType(events, 'quest.loot');
    expect(loot).toMatchObject({
      participants: [first.quest.id, first.party.id, first.guildId, item.id],
      milestone: true,
      payload: { definitionKey: 'barrow-kings-blade', quantity: 1, itemId: item.id, stackId: null },
    });
    const position = document.history.byType['quest.loot']?.[0] ?? -1;
    expect(document.history.milestones).toContain(position);
    expect(document.history.byEntity[item.id]).toEqual([position]);

    // A second strong success from a table holding the blade: the blade is weighted 0, and a table of
    // nothing else awards nothing. Each from a copy, since playing on appends to the History in place.
    const guild = document.world.guilds[first.guildId] as Guild;
    const heroIds = guild.rosterIds.filter((id) => document.world.heroes[id]?.partyId === null).slice(0, 2);
    const open = document.world.board
      .map((id) => document.world.quests[id] as Quest)
      .find(({ requirements: r }) => r.classKey === undefined && r.skillKey === undefined && r.partySizeMin <= 2 && 2 <= r.partySizeMax);
    if (open === undefined) throw new Error('No open Quest');
    for (const lootTableKey of ['the-blade', 'blade-or-whetstones']) {
      const again = applyAction(structuredClone(document), { kind: 'dispatch', guildId: first.guildId, questId: open.id, heroIds }, deps);
      if (!again.ok) throw new Error(again.rejection.reason);
      const quest = again.document.world.quests[open.id] as Quest;
      quest.lootTableKey = lootTableKey;
      const party = again.document.world.parties[quest.partyIds[0] as Party['id']] as Party;
      const after = home({ document: again.document, party, quest, guildId: first.guildId }, deps);

      const found = Object.values(after.document.world.items).filter((it) => it.definitionKey === 'barrow-kings-blade');
      expect(found, lootTableKey).toEqual(blades);
      const awarded = ofType(after.events, 'quest.loot').map((event) => event.payload.definitionKey);
      expect(awarded, lootTableKey).toEqual(lootTableKey === 'the-blade' ? [] : ['whetstone']);
    }
  });

  test("awards a Rival's Party exactly as the player's (ADR-0002)", () => {
    const rivalControllers = phases.find((phase) => phase.name === 'rivalControllers');
    if (rivalControllers === undefined) throw new Error('No rivalControllers phase');
    vi.spyOn(rivalControllers, 'run').mockReturnValue([]);
    const deps = lootDeps({ rivalCount: 1 }, withTables(everyCheckPasses, whetstones));
    const away = sent('rival', deps, 'whetstones', { rival: true });

    const { document, events } = home(away, deps);

    expect(ofType(events, 'quest.loot').map((event) => event.payload.guildId)).toEqual([away.guildId]);
    expect(holdings(document.world, { kind: 'guild', id: away.guildId }).stacks.map((it) => it.definitionKey)).toEqual(['whetstone']);
  });
});

// ── The harness's Loot counter (M5-S5's third box) ───────────────────────────────────────────

/** Which Quest the player sends a Party on each afternoon, of those the Guild can staff. */
type Regime = 'easiest' | 'hardest';

/**
 * Plays a world from `seed` for `days` Days, the player sending, each afternoon, every free Hero the
 * Quest allows on the easiest or the hardest Quest on the Board they can staff, and returns the mean
 * difficulty of the Quests the player resolved and the Loot the player's Guild was awarded.
 */
function season(seed: string, regime: Regime, days: number, deps: EngineDeps): { meanDifficulty: number; loot: number } {
  let document = createWorld(seed, setup, deps).document;
  const events: TurnEvent[] = [];
  const difficulty = new Map<string, number>();
  while (document.world.turn < nightOf(days)) {
    const { world } = document;
    const guild = playerGuild(world) as Guild;
    const offered = staffableQuests(world, guild, deps).sort(
      (a, b) => (regime === 'easiest' ? a.difficulty - b.difficulty : b.difficulty - a.difficulty) || a.id.localeCompare(b.id),
    );
    const [quest] = offered;
    if (quest !== undefined && world.ended === null) {
      const available = availableHeroes(world, guild);
      const party = bestParties(world, guild, deps).party(quest, available)?.heroIds ?? [];
      const rest = available.map((hero) => hero.id).filter((id) => !party.includes(id));
      const heroIds = [...party, ...rest].slice(0, quest.requirements.partySizeMax);
      const result = applyAction(document, { kind: 'dispatch', guildId: guild.id, questId: quest.id, heroIds }, deps);
      if (result.ok) {
        document = result.document;
        difficulty.set(quest.id, quest.difficulty);
      }
    }
    const result = advance(document, deps);
    document = result.document;
    events.push(...result.events);
  }
  withValid(document, deps);
  const player = (playerGuild(document.world) as Guild).id;
  const resolved = ofType(events, 'quest.resolved').filter((event) => event.payload.guildId === player);
  const total = resolved.reduce((sum, event) => sum + (difficulty.get(event.payload.questId) ?? 0), 0);
  const loot = ofType(events, 'quest.loot').filter((event) => event.payload.guildId === player).length;
  return { meanDifficulty: resolved.length === 0 ? 0 : total / resolved.length, loot };
}

describe("the harness's Loot counter", () => {
  // The harness counts Loot from M5's close (the counter task); until then this plays the rule the
  // counter will read, over eight seeds and two regimes of the player's own choosing, a season of 90
  // Days each. Measured when written: a mean difficulty of 24 to 27 and 20 Loot in all for the
  // easiest, 46 to 75 and 46 Loot for the hardest.
  test("rises with the player's mean Quest difficulty, over several seeds", { timeout: 60_000 }, () => {
    const deps = lootDeps({ startingWealth: 5000 });
    const seeds = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((letter) => `counter-${letter}`);
    const played = (regime: Regime) => seeds.map((seed) => season(seed, regime, 90, deps));
    const easiest = played('easiest');
    const hardest = played('hardest');
    const sum = (seasons: { loot: number }[]) => seasons.reduce((total, it) => total + it.loot, 0);

    for (const [index, seed] of seeds.entries()) {
      expect(hardest[index]?.meanDifficulty, seed).toBeGreaterThan(easiest[index]?.meanDifficulty ?? Infinity);
    }
    expect(sum(hardest)).toBeGreaterThan(sum(easiest));
    expect(sum(hardest)).toBeGreaterThanOrEqual(seeds.length);
  });
});
