import { describe, expect, test } from 'vitest';
import { advance } from '../advance.js';
import { defaultConfig, type EngineDeps, type TierRow } from '../config.js';
import type { ContentSet, QuestTemplate } from '../content-types.js';
import { createWorld } from '../create.js';
import type { Guild, GuildId, Hero, HeroId, Patron, Quest, World } from '../document.js';
import { append } from '../history.js';
import { next, type StreamName } from '../rng.js';
import { dayOf, nightOf, turnsPerDay } from '../time.js';
import { plannedStreams, testContent, testDeps, testWorld, withValid } from '../world.test-support.js';
import { beatsPlayed, daysAt, meanLevel, offeredTiers, tierFigures } from '../tiers.js';
import { generatePatron } from './patrons.js';
import { generateQuest, templatesFor } from './quests.js';

// The Quest Generator (DL-25), and the Tier, difficulty, Days and Beats it draws a Quest at (DL-257
// items 1 to 3, DL-262).

function withPatron(seed: string, deps: EngineDeps, sphereKey = 'crown', streams?: readonly string[]) {
  const world = testWorld(seed, deps, streams);
  const { patron } = generatePatron(world, deps, { sphereKey });
  return { world, patron };
}

function quests(world: World, patron: Patron, deps: EngineDeps, count: number): Quest[] {
  return Array.from({ length: count }, () => generateQuest(world, patron, deps).quest);
}

/** The default ladder's first Tier with `changes`. */
const tier = (changes: Partial<TierRow>): TierRow => ({ ...(defaultConfig.tiers[0] as TierRow), ...changes });

/** The test content with `changes` made to the template `key`. */
function withTemplate(key: string, changes: Partial<QuestTemplate>): ContentSet {
  const template = testContent.questTemplates[key] as QuestTemplate;
  return { ...testContent, questTemplates: { ...testContent.questTemplates, [key]: { ...template, ...changes } } };
}

/** `world` with a Guild in play whose one Hero is at `level`: the world's mean Level, as the centre reads it. */
function levelled(world: World, level: number): void {
  const heroId = 'hero-999999' as HeroId;
  world.heroes[heroId] = { id: heroId, level } as Hero;
  world.guilds['guild-999999' as GuildId] = { id: 'guild-999999', rosterIds: [heroId], foldedOnTurn: null } as unknown as Guild;
}

/** Pairs of `a` and `b`, as many as the shorter. */
const zip = <A, B>(a: readonly A[], b: readonly B[]): [A, B][] => a.slice(0, b.length).map((item, index) => [item, b[index] as B]);

describe('generateQuest', () => {
  test("draws each of the Patron's Sphere's templates, and only those (D3)", () => {
    const deps = testDeps();
    const { world, patron } = withPatron('sphere', deps, 'crown');

    const drawn = new Set(quests(world, patron, deps, 60).map((quest) => quest.templateKey));

    expect([...drawn].sort()).toEqual(['clear-the-barrow', 'hold-the-border-fort']);
    expect(templatesFor(testContent, 'crown').map((template) => template.key)).toEqual([...drawn].sort());
  });

  test('copies what the template carries, and draws its Tier, difficulty and Days by the Tier (DL-262)', () => {
    const deps = testDeps();
    const { world, patron } = withPatron('copy', deps, 'underworld');

    for (const quest of quests(world, patron, deps, 100)) {
      const template = testContent.questTemplates[quest.templateKey];
      if (template === undefined) throw new Error(`No template ${quest.templateKey}`);
      const figures = tierFigures(template, quest.tier, deps.config);
      const days = quest.durationTurns / turnsPerDay;

      expect(offeredTiers(template, deps.config)).toContain(quest.tier);
      expect(quest.difficulty).toBeGreaterThanOrEqual(figures.difficultyMin);
      expect(quest.difficulty).toBeLessThanOrEqual(figures.difficultyMax);
      expect(days).toBe(daysAt(quest.difficulty, figures, deps.config));
      expect(quest.reward).toBe(Math.round(quest.difficulty * template.rewardPerDifficulty * figures.rewardFactor));
      expect(quest).toMatchObject({
        patronId: patron.id,
        tags: template.tags,
        fameEffect: template.fameEffect,
        skillKeys: template.skillKeys,
        requirements: { partySizeMin: template.partySizeMin, partySizeMax: template.partySizeMax, ...template.requires },
        status: 'offered',
        offeredOnTurn: 0,
        partyIds: [],
      });
      expect(Object.keys(quest.requirements).sort()).toEqual(
        ['partySizeMin', 'partySizeMax', ...Object.keys(template.requires)].sort(),
      );
      // Copies, sharing nothing with content, so a row never changes with its template.
      expect(quest.tags).not.toBe(template.tags);
      expect(quest.skillKeys).not.toBe(template.skillKeys);
    }
  });

  test("draws the difficulty inside the Tier's band, at each end, and the Days at the same place in its days", () => {
    const deps = testDeps({ tiers: [tier({ difficultyMin: 20, difficultyMax: 40, daysMin: 4, daysMax: 8 })] });
    const { world, patron } = withPatron('band', deps, 'church');
    const seen = new Set<number>();
    for (const quest of quests(world, patron, deps, 300)) {
      seen.add(quest.difficulty);
      expect(quest.tier).toBe(1);
      expect(quest.durationTurns / turnsPerDay).toBe(Math.round(4 + ((quest.difficulty - 20) / 20) * 4));
    }
    expect(Math.min(...seen)).toBe(20);
    expect(Math.max(...seen)).toBe(40);
  });

  test("multiplies the reward by the Tier's rewardFactor, rounded", () => {
    const at = (rewardFactor: number): Quest[] => {
      const deps = testDeps({ tiers: [tier({ rewardFactor })] });
      const { world, patron } = withPatron('reward', deps, 'church');
      return quests(world, patron, deps, 20);
    };
    for (const [plain, doubled] of zip(at(1), at(2.5))) {
      expect(doubled.difficulty).toBe(plain.difficulty);
      expect(plain.reward).toBe(plain.difficulty * 4);
      expect(doubled.reward).toBe(Math.round(plain.difficulty * 4 * 2.5));
    }
  });

  // DL-262: a Tier's `loot` in the place of `lootDifficultyThreshold`.
  test("copies the template's Loot table at a Tier whose loot is true, and null otherwise", () => {
    const loot = (flags: boolean[]): Map<string, (string | null)[]> => {
      const deps = testDeps({ tiers: flags.map((flag, index) => tier({ difficultyMin: 10 + 10 * index, difficultyMax: 20 + 10 * index, loot: flag })) });
      const { world, patron } = withPatron('loot', deps, 'underworld');
      const seen = new Map<string, (string | null)[]>();
      for (const quest of quests(world, patron, deps, 60)) {
        const key = `${quest.templateKey} ${quest.tier}`;
        seen.set(key, [...new Set([...(seen.get(key) ?? []), quest.lootTableKey])]);
      }
      return seen;
    };
    // The underworld's two: a-quiet-word (Tiers 1 and 2, no table) and the-counting-house-job (3 and 4, greater-loot).
    expect(Object.fromEntries(loot([true, true, false, true]))).toEqual({
      'a-quiet-word 1': [null],
      'a-quiet-word 2': [null],
      'the-counting-house-job 3': [null],
      'the-counting-house-job 4': ['greater-loot'],
    });
    expect(Object.fromEntries(loot([false, false, true, false]))).toMatchObject({ 'the-counting-house-job 3': ['greater-loot'], 'the-counting-house-job 4': [null] });
  });

  test("draws the Tier around the centre the world's mean Level sets, by tierDrawWeights", () => {
    const tally = (level: number, tierDrawWeights: number[]): Record<number, number> => {
      const deps = testDeps({ levelsPerTier: 3, tierDrawWeights });
      const { world, patron } = withPatron(`centre-${level}`, deps, 'villages');
      levelled(world, level);
      const counts: Record<number, number> = {};
      for (const quest of quests(world, patron, deps, 600)) {
        if (quest.templateKey === 'the-beast-of-the-fells') counts[quest.tier] = (counts[quest.tier] ?? 0) + 1;
      }
      return counts;
    };
    // The beast offers Tiers 2 to 4. At weights [1] alone, every Quest is at the centre held inside them.
    expect(Object.keys(tally(1, [1]))).toEqual(['2']);
    expect(Object.keys(tally(6, [1]))).toEqual(['3']);
    expect(Object.keys(tally(9, [1]))).toEqual(['4']);
    expect(Object.keys(tally(30, [1]))).toEqual(['4']);
    // At the centre 3, Tiers 2 and 4 each about half as often as 3.
    const around = tally(6, [1, 0.5]);
    expect(Object.keys(around)).toEqual(['2', '3', '4']);
    for (const side of [2, 4]) {
      const ratio = (around[side] ?? 0) / (around[3] ?? 1);
      expect(ratio, `Tier ${side}`).toBeGreaterThan(0.35);
      expect(ratio, `Tier ${side}`).toBeLessThan(0.65);
    }
  });

  test('draws a template offering only Tiers above the centre at the nearest of them', () => {
    const deps = testDeps();
    const { world, patron } = withPatron('above', deps, 'scholars');
    expect(meanLevel(world)).toBe(0);
    const tiers = new Set(quests(world, patron, deps, 200).filter((quest) => quest.templateKey === 'break-the-sealed-vault').map((quest) => quest.tier));
    // The vault offers 4 and 5; the centre is 1, held inside them at 4, and 5 is one away.
    expect([...tiers].sort()).toEqual([4, 5]);
    const only: EngineDeps = { config: deps.config, content: withTemplate('break-the-sealed-vault', { tierMin: 3, tierMax: 3 }) };
    const at = withPatron('only-three', only, 'scholars');
    for (const quest of quests(at.world, at.patron, only, 40)) if (quest.templateKey === 'break-the-sealed-vault') expect(quest.tier).toBe(3);
  });

  test('takes exactly three board draws, the template, the Tier and the difficulty; two with a template given; one with a Tier too', () => {
    const deps = testDeps();
    const { world, patron } = withPatron('three-draws', deps, 'crown');
    const drawsOf = (options: Parameters<typeof generateQuest>[3]): number => {
      const before = structuredClone(world.rng.board);
      generateQuest(world, patron, deps, options);
      const twin = structuredClone(before);
      for (let draws = 1; draws <= 5; draws += 1) {
        next(twin);
        if (JSON.stringify(twin) === JSON.stringify(world.rng.board)) return draws;
      }
      return -1;
    };
    for (let made = 0; made < 20; made += 1) {
      expect(drawsOf({})).toBe(3);
      expect(drawsOf({ templateKey: 'clear-the-barrow' })).toBe(2);
      expect(drawsOf({ templateKey: 'clear-the-barrow', tier: 3 })).toBe(1);
    }
  });

  test('draws at the Tier given with its template', () => {
    const deps = testDeps();
    const { world, patron } = withPatron('given-tier', deps, 'crown');
    for (const tier of [2, 3]) {
      for (let made = 0; made < 10; made += 1) {
        const { quest } = generateQuest(world, patron, deps, { templateKey: 'clear-the-barrow', tier });
        expect(quest.tier).toBe(tier);
        expect(quest.encounterKeys).toHaveLength(deps.config.tiers[tier - 1]?.beats ?? 0);
      }
    }
  });

  test("reads the template's override of its Tier's figures, the rest the ladder's", () => {
    const deps = testDeps();
    const content = withTemplate('clear-the-barrow', { overrides: { '3': { difficultyMin: 50, difficultyMax: 50, daysMin: 2, daysMax: 2, beats: 2, rewardFactor: 1 } } });
    const overridden: EngineDeps = { config: deps.config, content };
    const { world, patron } = withPatron('override', overridden, 'crown');
    const three = generateQuest(world, patron, overridden, { templateKey: 'clear-the-barrow', tier: 3 }).quest;
    expect(three).toMatchObject({ difficulty: 50, durationTurns: 2 * turnsPerDay, reward: 200 });
    expect(three.encounterKeys).toHaveLength(2);
    // Loot is the ladder's at Tier 3, which the override leaves.
    expect(three.lootTableKey).toBe('lesser-loot');
    const two = generateQuest(world, patron, overridden, { templateKey: 'clear-the-barrow', tier: 2 }).quest;
    const ladder = deps.config.tiers[1] as TierRow;
    expect(two.difficulty).toBeGreaterThanOrEqual(ladder.difficultyMin);
    expect(two.difficulty).toBeLessThanOrEqual(ladder.difficultyMax);
    expect(two.encounterKeys).toHaveLength(ladder.beats);
  });

  test('puts the Quest in world.quests and at the end of the Board, numbering it from the counter', () => {
    const deps = testDeps();
    const { world, patron } = withPatron('board', deps);

    const [first, second] = quests(world, patron, deps, 2);

    expect(first?.id).toBe('quest-000001');
    expect(second?.id).toBe('quest-000002');
    expect(world.board).toEqual(['quest-000001', 'quest-000002']);
    expect(world.quests['quest-000002' as Quest['id']]).toBe(second);
    expect(world.counters.quests).toBe(3);
  });

  test("holds the difficulty inside the config scale, even for a Tier's band wholly outside it", () => {
    const narrowed = testDeps({ questDifficultyMin: 50, questDifficultyMax: 60 });
    const { world, patron } = withPatron('scale', narrowed);
    for (const quest of quests(world, patron, narrowed, 50)) {
      expect(quest.difficulty).toBeGreaterThanOrEqual(50);
      expect(quest.difficulty).toBeLessThanOrEqual(60);
    }

    const above = testDeps({ questDifficultyMin: 95, questDifficultyMax: 100 });
    const escort = withPatron('above', above, 'church');
    const tithe = generateQuest(escort.world, escort.patron, above, { templateKey: 'escort-the-tithe' }).quest;
    expect(tithe.difficulty).toBe(95);
  });

  test('stays on offer through the night of its questOfferDays-th Day, whichever Turn it is drawn on', () => {
    const deps = testDeps();
    const { world, patron } = withPatron('expiry', deps);

    for (const turn of [0, 1, 2, 39, 40, 41]) {
      world.turn = turn;
      const quest = generateQuest(world, patron, deps).quest;
      expect(quest.offeredOnTurn).toBe(turn);
      expect(quest.expiresOnTurn).toBe(nightOf(dayOf(turn) + deps.config.questOfferDays - 1));
    }
    const oneDay = testDeps({ questOfferDays: 1 });
    world.turn = 3;
    expect(generateQuest(world, patron, oneDay).quest.expiresOnTurn).toBe(5);
  });

  test('returns quest.offered naming the Quest and the Patron, labelled with the Patron, and its Tier', () => {
    const deps = testDeps();
    const { world, patron } = withPatron('event', deps);

    const { quest, events } = generateQuest(world, patron, deps);

    expect(events).toEqual([
      {
        turn: 0,
        type: 'quest.offered',
        participants: [quest.id, patron.id],
        labels: { [patron.id]: patron.name },
        milestone: false,
        payload: { questId: quest.id, patronId: patron.id, templateKey: quest.templateKey, tier: quest.tier },
      },
    ]);
  });

  test('draws from the board stream, or the stream its caller names, and its Encounters from the encounters stream, and from no other', () => {
    const deps = testDeps();
    const { world, patron } = withPatron('streams', deps, 'crown', plannedStreams);
    const before = structuredClone(world.rng) as Record<string, unknown>;
    const rng = (): Record<string, unknown> => world.rng;

    generateQuest(world, patron, deps);
    for (const name of plannedStreams) {
      if (name === 'board' || name === 'encounters') expect(rng()[name], name).not.toEqual(before[name]);
      else expect(rng()[name], name).toEqual(before[name]);
    }

    const afterBoard = structuredClone(world.rng) as Record<string, unknown>;
    generateQuest(world, patron, deps, { stream: 'generation' });
    expect(rng()['board']).toEqual(afterBoard['board']);
    expect(rng()['generation']).not.toEqual(afterBoard['generation']);
    expect(rng()['encounters']).not.toEqual(afterBoard['encounters']);
  });

  test("draws an Encounter from each Beat its Tier plays, in order, none twice, with each Beat's line beside it", () => {
    const deps = testDeps();
    for (const sphere of Object.keys(testContent.spheres)) {
      const { world, patron } = withPatron(`beats-${sphere}`, deps, sphere);
      levelled(world, 6);
      for (const quest of quests(world, patron, deps, 150)) {
        const template = testContent.questTemplates[quest.templateKey];
        if (template === undefined) throw new Error(`No template ${quest.templateKey}`);
        const { beats } = beatsPlayed(template, tierFigures(template, quest.tier, deps.config).beats);

        expect(quest.encounterKeys.map((key) => testContent.encounters[key]?.kind)).toEqual(beats.map((beat) => beat.pool.kinds?.[0]));
        expect(quest.beatLines).toEqual(beats.map((beat) => beat.line));
        expect(new Set(quest.encounterKeys).size).toBe(quest.encounterKeys.length);
      }
    }
  });

  test("ends a Quest of a template naming a Finale with it and its line, one encounters draw a Beat before it", () => {
    const deps = testDeps();
    const finale: EngineDeps = { config: deps.config, content: withTemplate('clear-the-barrow', { finale: 'the-sealed-door', finaleLine: 'The door at last.' }) };
    const { world, patron } = withPatron('finale', finale, 'crown');
    for (let made = 0; made < 60; made += 1) {
      const before = structuredClone(world.rng.encounters);
      const { quest } = generateQuest(world, patron, finale, { templateKey: 'clear-the-barrow' });
      const count = tierFigures(undefined, quest.tier, deps.config).beats;
      expect(quest.encounterKeys).toHaveLength(count);
      expect(quest.encounterKeys.at(-1)).toBe('the-sealed-door');
      expect(quest.beatLines.at(-1)).toBe('The door at last.');
      expect(quest.encounterKeys.slice(0, -1)).not.toContain('the-sealed-door');
      const stepped = structuredClone(before);
      for (let draw = 0; draw < count - 1; draw += 1) next(stepped);
      expect(world.rng.encounters).toEqual(stepped);
    }
  });

  test('gives each Quest Encounters and lines of its own, sharing no array with content or another Quest', () => {
    const deps = testDeps();
    const { world, patron } = withPatron('own-sequence', deps);
    const [first, second] = quests(world, patron, deps, 2);
    expect(first?.encounterKeys.length).toBeGreaterThan(0);
    expect(first?.encounterKeys).not.toBe(second?.encounterKeys);
    expect(first?.beatLines).not.toBe(second?.beatLines);
  });

  // The encounters stream is new in M4 (ADR-0009, D7), and a Quest still takes three board draws, its
  // Tier in the place of its Days (DL-262), so the templates and Patrons a seed draws are the ones it
  // drew before M4: pinned from the engine at M3's end (v1.0-dev 8229670) for the test content, no Rivals
  // and no Party sent, over 30 Days of refreshes and expiries, the board stream left where M3 left it.
  // Each Quest's Tier, difficulty, Days and reward are DL-262's draw at the default ladder. The Board's
  // Regard weighting (DL-43 item 5) is set to 0, DL-25's uniform draw as at M3's end: the
  // expiries move Patron Regard, which with the weighting on moves the Patrons drawn (DL-44).
  test('draws the templates and Patrons a seed drew before M4, Quest for Quest, at their Tiers, and leaves the board stream where M3 left it', () => {
    const deps = testDeps({ rivalCount: 0, boardRegardWeight: 0 });
    let { document } = createWorld('board-a', { guildmasterName: 'Ada', guildName: 'The Test', createdAt: 'test' }, deps);
    const board = (): (string | number)[][] =>
      document.world.board.map((id) => {
        const quest = document.world.quests[id] as Quest;
        return [quest.id, quest.templateKey, quest.patronId, quest.tier, quest.difficulty, quest.durationTurns, quest.reward];
      });

    expect(board().map((row) => row.slice(1))).toEqual([
      ['break-the-sealed-vault', 'patron-000002', 4, 66, 36, 642],
      ['a-quiet-word', 'patron-000012', 1, 24, 15, 131],
      ['recover-the-strongbox', 'patron-000007', 2, 37, 21, 243],
      ['escort-the-tithe', 'patron-000004', 1, 12, 9, 65],
      ['guard-the-caravan', 'patron-000007', 2, 29, 15, 190],
      ['survey-the-old-workings', 'patron-000009', 3, 56, 30, 457],
    ]);
    while (document.world.turn < 90) document = advance(document, deps).document;
    expect(document.history.byType['quest.offered']).toHaveLength(66);
    expect(board()).toEqual([
      ['quest-000061', 'break-the-sealed-vault', 'patron-000009', 5, 91, 54, 928],
      ['quest-000062', 'lay-the-restless-dead', 'patron-000008', 3, 56, 30, 457],
      ['quest-000063', 'recover-the-strongbox', 'patron-000003', 2, 39, 21, 256],
      ['quest-000064', 'the-beast-of-the-fells', 'patron-000010', 3, 46, 24, 375],
      ['quest-000065', 'hold-the-border-fort', 'patron-000011', 3, 52, 27, 424],
      ['quest-000066', 'recover-the-strongbox', 'patron-000003', 2, 32, 18, 210],
    ]);
    expect(document.world.rng.board).toEqual([2576077588, 3546060111, 712059594, 3078924888]);
  });

  test('is the same Quest from the same seed, and another from another', () => {
    const deps = testDeps();
    const tenFrom = (seed: string): Quest[] => {
      const { world, patron } = withPatron(seed, deps);
      return quests(world, patron, deps, 10);
    };

    expect(tenFrom('same')).toEqual(tenFrom('same'));
    expect(tenFrom('other')).not.toEqual(tenFrom('same'));
  });

  test('makes Quests the validator accepts in a created world', () => {
    const deps = testDeps();
    const { document } = createWorld('valid-quests', { guildmasterName: 'Ada', guildName: 'The Test', createdAt: 'test' }, deps);
    for (const patron of Object.values(document.world.patrons)) {
      for (const event of generateQuest(document.world, patron, deps).events) append(document.history, event);
    }

    expect(withValid(document, deps)).toBe(document);
  });

  test('throws, changing nothing, on a Patron not in the world, an unserved Sphere, a template not theirs, or a missing stream', () => {
    const deps = testDeps();
    const { world, patron } = withPatron('refusals', deps);
    const before = structuredClone(world);
    const unserved: EngineDeps = {
      config: deps.config,
      content: { ...testContent, questTemplates: { ...testContent.questTemplates } },
    };
    for (const key of Object.keys(unserved.content.questTemplates)) {
      if (templatesFor(testContent, 'crown').some((template) => template.key === key)) {
        delete unserved.content.questTemplates[key];
      }
    }

    expect(() => generateQuest(world, { ...patron, id: 'patron-000009' as Patron['id'] }, deps)).toThrow(/patron-000009/);
    expect(() => generateQuest(world, patron, unserved)).toThrow(/crown/);
    expect(() => generateQuest(world, patron, deps, { templateKey: 'a-quiet-word' })).toThrow(/a-quiet-word/);
    expect(() => generateQuest(world, patron, deps, { stream: 'a-module' as string as StreamName })).toThrow(/a-module/);
    expect(world).toEqual(before);
  });

  test('throws, changing nothing, on a world without the encounters stream or a Beat whose pool content leaves empty', () => {
    const deps = testDeps();
    const { world, patron } = withPatron('encounter-refusals', deps);
    const noStealth: EngineDeps = {
      config: deps.config,
      content: {
        ...testContent,
        encounters: Object.fromEntries(Object.entries(testContent.encounters).filter(([, row]) => row.kind !== 'stealth')),
      },
    };
    const noStream = structuredClone(world);
    delete (noStream.rng as Partial<World['rng']>).encounters;
    const before = structuredClone(world);

    // Crown's templates are clear-the-barrow, whose second Beat is stealth's, and hold-the-border-fort.
    expect(() => generateQuest(world, patron, noStealth)).toThrow(/clear-the-barrow's Beat 2 may draw 0 Encounters/);
    expect(() => generateQuest(world, patron, noStealth, { templateKey: 'hold-the-border-fort' })).toThrow(/Beat 2 may draw 0/);
    expect(world).toEqual(before);
    const withoutStream = structuredClone(noStream);
    expect(() => generateQuest(noStream, patron, deps)).toThrow(/encounters/);
    expect(noStream).toEqual(withoutStream);
  });

  test('throws, changing nothing, on a Finale content does not define', () => {
    const deps = testDeps();
    const { world, patron } = withPatron('finale-refusals', deps);
    const before = structuredClone(world);
    const barrow = testContent.questTemplates['clear-the-barrow'];
    if (barrow === undefined) throw new Error('No clear-the-barrow');
    const lost: EngineDeps = {
      config: deps.config,
      content: { ...testContent, questTemplates: { ...testContent.questTemplates, 'clear-the-barrow': { ...barrow, finale: 'gone', finaleLine: 'Gone.' } } },
    };
    expect(() => generateQuest(world, patron, lost, { templateKey: 'hold-the-border-fort' })).toThrow(/gone/);
    expect(world).toEqual(before);
  });

  test('throws, changing nothing, on a Tier given without its template, or one its template does not offer', () => {
    const deps = testDeps();
    const { world, patron } = withPatron('tier-refusals', deps);
    const before = structuredClone(world);
    expect(() => generateQuest(world, patron, deps, { tier: 2 })).toThrow(/no template offers no Tier 2/);
    expect(() => generateQuest(world, patron, deps, { templateKey: 'clear-the-barrow', tier: 4 })).toThrow(/clear-the-barrow offers no Tier 4/);
    expect(() => generateQuest(world, patron, deps, { templateKey: 'clear-the-barrow', tier: 1 })).toThrow(/offers no Tier 1/);
    expect(world).toEqual(before);
  });
});
