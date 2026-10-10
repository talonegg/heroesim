import { describe, expect, test } from 'vitest';
import { defaultConfig, type GameConfig, type TierRow } from './config.js';
import type { Consequence, ContentSet, Encounter, QuestBeat, QuestTemplate } from './content-types.js';
import type { Guild, Hero, Quest, World } from './document.js';
import {
  beatsDrawn,
  beatsPlayed,
  centreTier,
  daysAt,
  deathScaleOf,
  difficultyBand,
  inBeatPool,
  isDeadly,
  meanLevel,
  offeredTiers,
  scaledDeathChance,
  shortBeats,
  tierFigures,
  tierWeights,
} from './tiers.js';

// DL-257 items 1 to 3, DL-262: the Tier a Quest is drawn at, and the figures it is drawn and paid by.

/** A ladder of `count` Tiers, Tier n's band from 10 + 20(n − 1), its days from 2n, n + 1 Beats. */
function ladder(count: number): TierRow[] {
  return Array.from({ length: count }, (_, index) => ({
    difficultyMin: 10 + 20 * index,
    difficultyMax: 30 + 20 * index,
    daysMin: 2 * (index + 1),
    daysMax: 2 * (index + 1) + 4,
    beats: index + 2,
    loot: index >= 2,
    rewardFactor: 1 + index,
    xpFactor: 2 + index,
    deathScale: index >= 3 ? 1 : 0,
    fameMinimum: 0,
  }));
}

const config = (overrides: Partial<GameConfig> = {}): GameConfig => ({ ...defaultConfig, tiers: ladder(5), ...overrides });

/** A world of Guilds, each `[folded, levels of its Roster]`, and Heroes off every Roster at `pool`'s Levels. */
function worldOf(guilds: [folded: boolean, levels: number[]][], pool: number[] = []): Pick<World, 'guilds' | 'heroes'> {
  const heroes: Record<string, Pick<Hero, 'id' | 'level'>> = {};
  let made = 0;
  const hero = (level: number): string => {
    made += 1;
    const id = `hero-${String(made).padStart(6, '0')}`;
    heroes[id] = { id: id as Hero['id'], level };
    return id;
  };
  const rows = guilds.map(([folded, levels], index): Pick<Guild, 'id' | 'rosterIds' | 'foldedOnTurn'> => ({
    id: `guild-${String(index + 1).padStart(6, '0')}` as Guild['id'],
    rosterIds: levels.map(hero) as Hero['id'][],
    foldedOnTurn: folded ? 30 : null,
  }));
  for (const level of pool) hero(level);
  return { guilds: Object.fromEntries(rows.map((row) => [row.id, row])), heroes } as unknown as Pick<World, 'guilds' | 'heroes'>;
}

describe('meanLevel', () => {
  test('is the mean Level of every Hero on the Roster of a Guild in play, the player and the Rivals alike', () => {
    expect(meanLevel(worldOf([[false, [1, 2, 3]], [false, [6]]]))).toBe(3);
  });

  test('leaves out a folded Guild and the Unattached pool', () => {
    expect(meanLevel(worldOf([[false, [2, 4]], [true, [20, 20]]], [30, 30]))).toBe(3);
  });

  test('is 0 with no Hero on a Roster in play', () => {
    expect(meanLevel(worldOf([]))).toBe(0);
    expect(meanLevel(worldOf([[false, []], [true, [9]]], [9]))).toBe(0);
  });
});

describe('centreTier', () => {
  test('is 1 + the floor of the mean Level over levelsPerTier', () => {
    const at = (mean: number): number => centreTier(mean, config({ levelsPerTier: 3 }));
    expect([0, 1, 2.99, 3, 5.99, 6, 9, 12].map(at)).toEqual([1, 1, 1, 2, 2, 3, 4, 5]);
  });

  test("is the ladder's last at most", () => {
    expect(centreTier(100, config({ levelsPerTier: 3 }))).toBe(5);
    expect(centreTier(100, config({ tiers: ladder(2) }))).toBe(2);
    expect(centreTier(4, config({ levelsPerTier: 1.5 }))).toBe(3);
  });
});

describe('offeredTiers', () => {
  test("is the template's Tiers, from tierMin to tierMax", () => {
    expect(offeredTiers({ tierMin: 2, tierMax: 4 }, config())).toEqual([2, 3, 4]);
    expect(offeredTiers({ tierMin: 3, tierMax: 3 }, config())).toEqual([3]);
  });

  test('is held on the ladder, one Tier at least', () => {
    expect(offeredTiers({ tierMin: 4, tierMax: 7 }, config())).toEqual([4, 5]);
    expect(offeredTiers({ tierMin: 6, tierMax: 7 }, config())).toEqual([5]);
    expect(offeredTiers({ tierMin: 0, tierMax: 1 }, config())).toEqual([1]);
  });
});

describe('tierWeights', () => {
  test('weighs each Tier offered by its distance from the centre', () => {
    const weights = config({ tierDrawWeights: [1, 0.5, 0.2] });
    expect(tierWeights([1, 2, 3, 4, 5], 3, weights)).toEqual([0.2, 0.5, 1, 0.5, 0.2]);
    expect(tierWeights([2, 3, 4], 2, weights)).toEqual([1, 0.5, 0.2]);
  });

  test('gives a Tier past the list a weight of 0', () => {
    expect(tierWeights([1, 2, 3, 4, 5], 1, config({ tierDrawWeights: [1, 0.5] }))).toEqual([1, 0.5, 0, 0, 0]);
  });

  test('holds the centre inside the Tiers offered, so the nearest weighs the centre’s', () => {
    const weights = config({ tierDrawWeights: [1, 0.5, 0.2] });
    expect(tierWeights([3], 1, weights)).toEqual([1]);
    expect(tierWeights([3, 4, 5], 1, weights)).toEqual([1, 0.5, 0.2]);
    expect(tierWeights([1, 2], 5, weights)).toEqual([0.5, 1]);
  });
});

describe('tierFigures', () => {
  const rows = ladder(5);

  test("is the ladder's row for the Tier", () => {
    expect(tierFigures({}, 3, config())).toEqual(rows[2]);
    expect(tierFigures(undefined, 1, config())).toEqual(rows[0]);
  });

  test("takes each figure the template overrides for that Tier, and the ladder's for the rest", () => {
    const template: Pick<QuestTemplate, 'overrides'> = { overrides: { '3': { beats: 6, rewardFactor: 0.5, loot: false } } };
    expect(tierFigures(template, 3, config())).toEqual({ ...rows[2], beats: 6, rewardFactor: 0.5, loot: false });
    expect(tierFigures(template, 2, config())).toEqual(rows[1]);
  });

  test("reads a Tier past the ladder as the ladder's last, and one below it as the first", () => {
    expect(tierFigures({}, 9, config())).toEqual(rows[4]);
    expect(tierFigures({ overrides: { '5': { xpFactor: 9 } } }, 9, config()).xpFactor).toBe(9);
    expect(tierFigures({}, 0, config())).toEqual(rows[0]);
  });
});

describe('daysAt', () => {
  const tier = { difficultyMin: 10, difficultyMax: 30, daysMin: 3, daysMax: 7 };

  test("is the Tier's daysMin at the bottom of its band and its daysMax at the top", () => {
    expect(daysAt(10, tier, config())).toBe(3);
    expect(daysAt(30, tier, config())).toBe(7);
  });

  test('sits at the same place in the days as the difficulty in its band, rounded', () => {
    expect(daysAt(20, tier, config())).toBe(5);
    expect(daysAt(15, tier, config())).toBe(4);
    expect(daysAt(12, tier, config())).toBe(3);
    expect(daysAt(13, tier, config())).toBe(4);
  });

  test("holds a difficulty outside the band to the Tier's days, daysMin below it and daysMax above", () => {
    expect(daysAt(5, tier, config())).toBe(3);
    expect(daysAt(45, tier, config())).toBe(7);
  });

  test('is daysMin for a band of one value', () => {
    expect(daysAt(40, { difficultyMin: 40, difficultyMax: 40, daysMin: 6, daysMax: 9 }, config())).toBe(6);
  });

  test('reads the band held inside the difficulty scale, as the draw holds it', () => {
    const scale = config({ questDifficultyMin: 20, questDifficultyMax: 100 });
    expect(difficultyBand(tier, scale)).toEqual([20, 30]);
    expect(daysAt(20, tier, scale)).toBe(3);
    expect(daysAt(25, tier, scale)).toBe(5);
  });
});

describe('beatsPlayed', () => {
  const beat = (line: string): QuestBeat => ({ line, pool: { kinds: ['combat'] } });
  const beats = ['one', 'two', 'three', 'four'].map(beat);

  test('plays the first count Beats of a template without a Finale', () => {
    expect(beatsPlayed({ beats }, 2)).toEqual({ beats: beats.slice(0, 2), finale: null });
    expect(beatsPlayed({ beats }, 4)).toEqual({ beats, finale: null });
  });

  test('plays the first count − 1 and then the Finale', () => {
    expect(beatsPlayed({ beats, finale: 'the-end' }, 3)).toEqual({ beats: beats.slice(0, 2), finale: 'the-end' });
    expect(beatsPlayed({ beats, finale: 'the-end' }, 1)).toEqual({ beats: [], finale: 'the-end' });
  });

  test('never plays more Beats than the template has', () => {
    expect(beatsPlayed({ beats }, 9)).toEqual({ beats, finale: null });
    expect(beatsPlayed({ beats, finale: 'the-end' }, 9)).toEqual({ beats, finale: 'the-end' });
  });

  test('draws count Beats, one fewer for a Finale, never more than the template has nor fewer than none', () => {
    expect([beatsDrawn(4, false, 3), beatsDrawn(4, true, 3)]).toEqual([3, 2]);
    expect([beatsDrawn(4, false, 9), beatsDrawn(4, true, 9)]).toEqual([4, 4]);
    expect([beatsDrawn(4, false, 0), beatsDrawn(4, true, 0)]).toEqual([0, 0]);
  });
});

describe('inBeatPool', () => {
  const wolves: Pick<Encounter, 'key' | 'kind' | 'tags'> = { key: 'wolves', kind: 'combat', tags: ['wilds', 'hunt'] };
  const ford: Pick<Encounter, 'key' | 'kind' | 'tags'> = { key: 'ford', kind: 'travel', tags: ['water'] };
  const reeve: Pick<Encounter, 'key' | 'kind' | 'tags'> = { key: 'reeve', kind: 'social' };

  test('holds an Encounter of a kind it gives', () => {
    expect([wolves, ford, reeve].map((it) => inBeatPool(it, { kinds: ['combat', 'social'] }))).toEqual([true, false, true]);
  });

  test('holds an Encounter sharing a tag it gives', () => {
    expect([wolves, ford, reeve].map((it) => inBeatPool(it, { tags: ['water', 'hunt'] }))).toEqual([true, true, false]);
  });

  test('holds only an Encounter matching every criterion it gives, kind and tag', () => {
    expect([wolves, ford, reeve].map((it) => inBeatPool(it, { kinds: ['combat', 'travel'], tags: ['wilds'] }))).toEqual([true, false, false]);
  });

  test('holds an Encounter it names, whatever the criteria, and none but those when it gives none', () => {
    expect([wolves, ford, reeve].map((it) => inBeatPool(it, { kinds: ['combat'], encounters: ['reeve'] }))).toEqual([true, false, true]);
    expect([wolves, ford, reeve].map((it) => inBeatPool(it, { encounters: ['ford'] }))).toEqual([false, true, false]);
    expect([wolves, ford, reeve].map((it) => inBeatPool(it, {}))).toEqual([false, false, false]);
  });
});

describe('shortBeats', () => {
  test('finds a Beat with no Encounter', () => {
    expect(shortBeats([['a'], []])).toEqual([{ beat: 1, size: 0, needs: 1 }]);
  });

  test('needs one more for each earlier Beat whose pool shares an Encounter with it', () => {
    expect(shortBeats([['a', 'b'], ['b', 'c'], ['a', 'c']])).toEqual([{ beat: 2, size: 2, needs: 3 }]);
    expect(shortBeats([['a', 'b'], ['b', 'c'], ['a', 'c', 'd']])).toEqual([]);
    expect(shortBeats([['a'], ['a']])).toEqual([{ beat: 1, size: 1, needs: 2 }]);
  });

  test('counts no earlier Beat whose pool is apart from it', () => {
    expect(shortBeats([['a'], ['b'], ['c']])).toEqual([]);
    expect(shortBeats([['a', 'b'], ['c'], ['a', 'b']])).toEqual([]);
  });
});

// DL-257 item 5, DL-265: Death by Tier, and the Deadly mark.

/** An Encounter keyed `key` whose Failure carries `failure`, and whose Triumph `triumph` where given. */
function harmful(key: string, failure: Consequence[], triumph?: Consequence[]): Encounter {
  return {
    key,
    name: key,
    kind: 'combat',
    checks: [],
    consequences: { success: [], failure, ...(triumph === undefined ? {} : { triumph }) },
  } as unknown as Encounter;
}

const tierContent = {
  questTemplates: {
    plain: { key: 'plain' },
    spared: { key: 'spared', overrides: { '4': { deathScale: 0 } } },
    doomed: { key: 'doomed', overrides: { '2': { deathScale: 0.5 } } },
  },
  encounters: {
    ambush: harmful('ambush', [{ kind: 'morale', delta: -3 }, { kind: 'death', chance: 0.03 }]),
    brawl: harmful('brawl', [{ kind: 'injury', typeKey: 'deep-cut', chance: 0.5, count: 1 }]),
    harmless: harmful('harmless', [{ kind: 'death', chance: 0 }]),
    glory: harmful('glory', [], [{ kind: 'death', chance: 0.01 }]),
  },
} as unknown as Pick<ContentSet, 'questTemplates' | 'encounters'>;

const questAt = (tier: number, encounterKeys: string[], templateKey = 'plain') => ({ templateKey, tier, encounterKeys }) as unknown as Pick<Quest, 'templateKey' | 'tier' | 'encounterKeys'>;

describe('deathScaleOf', () => {
  test("is deathFactor times the Tier's deathScale", () => {
    expect([1, 2, 3, 4, 5].map((tier) => deathScaleOf(questAt(tier, []), tierContent, config({ deathFactor: 1 })))).toEqual([0, 0, 0, 1, 1]);
    expect([1, 3, 4, 5].map((tier) => deathScaleOf(questAt(tier, []), tierContent, config({ deathFactor: 2.5 })))).toEqual([0, 0, 2.5, 2.5]);
    const scaled = config({ deathFactor: 3, tiers: ladder(5).map((row, index) => ({ ...row, deathScale: index / 2 })) });
    expect([1, 2, 3, 4, 5].map((tier) => deathScaleOf(questAt(tier, []), tierContent, scaled))).toEqual([0, 1.5, 3, 4.5, 6]);
  });

  test("reads the template's override of a Tier's deathScale", () => {
    expect(deathScaleOf(questAt(4, [], 'spared'), tierContent, config({ deathFactor: 2 }))).toBe(0);
    expect(deathScaleOf(questAt(5, [], 'spared'), tierContent, config({ deathFactor: 2 }))).toBe(2);
    expect(deathScaleOf(questAt(2, [], 'doomed'), tierContent, config({ deathFactor: 2 }))).toBe(1);
  });

  test('is 0 for every Tier at a deathFactor of 0', () => {
    expect([1, 2, 3, 4, 5].map((tier) => deathScaleOf(questAt(tier, [], 'doomed'), tierContent, config({ deathFactor: 0 })))).toEqual([0, 0, 0, 0, 0]);
  });
});

describe('scaledDeathChance', () => {
  test('is the chance times the scale', () => {
    expect(scaledDeathChance(0.03, 1)).toBe(0.03);
    expect(scaledDeathChance(0.04, 2)).toBe(0.08);
    expect(scaledDeathChance(0.5, 0.5)).toBe(0.25);
  });

  test('is 0 at a scale of 0, whatever the chance', () => {
    expect([0, 0.03, 1].map((chance) => scaledDeathChance(chance, 0))).toEqual([0, 0, 0]);
  });

  test('is held at 1', () => {
    expect(scaledDeathChance(0.5, 3)).toBe(1);
    expect(scaledDeathChance(1, 1.01)).toBe(1);
    expect(scaledDeathChance(0.05, 1000)).toBe(1);
  });
});

describe('isDeadly', () => {
  test('is a Quest whose Tier scales Death above 0 and one of whose Encounters has a Death chance', () => {
    expect(isDeadly(questAt(4, ['brawl', 'ambush']), tierContent, config())).toBe(true);
    expect(isDeadly(questAt(5, ['ambush']), tierContent, config())).toBe(true);
  });

  test("is not a Quest whose Tier's deathScale is 0, whatever its Encounters", () => {
    expect([1, 2, 3].map((tier) => isDeadly(questAt(tier, ['ambush', 'glory']), tierContent, config()))).toEqual([false, false, false]);
  });

  test('is not a Quest none of whose Encounters has a Death chance above 0', () => {
    expect(isDeadly(questAt(4, ['brawl', 'harmless']), tierContent, config())).toBe(false);
    expect(isDeadly(questAt(5, []), tierContent, config())).toBe(false);
  });

  test("reads a Death in any Degree's list, a Triumph's too", () => {
    expect(isDeadly(questAt(4, ['brawl', 'glory']), tierContent, config())).toBe(true);
  });

  test("reads each Degree's list on its own: a Death at a Triumph, a Success, a Setback or a Failure alone", () => {
    const death: Consequence = { kind: 'death', chance: 0.02 };
    const lists = { triumph: [], success: [], setback: [], failure: [] };
    for (const degree of ['triumph', 'success', 'setback', 'failure'] as const) {
      const only = { key: degree, consequences: { ...lists, [degree]: [death] } } as unknown as Encounter;
      const content = { ...tierContent, encounters: { [degree]: only } } as unknown as Pick<ContentSet, 'questTemplates' | 'encounters'>;
      expect(isDeadly(questAt(4, [degree]), content, config()), degree).toBe(true);
    }
  });

  test("reads the template's override of the Tier's deathScale", () => {
    expect(isDeadly(questAt(4, ['ambush'], 'spared'), tierContent, config())).toBe(false);
    expect(isDeadly(questAt(5, ['ambush'], 'spared'), tierContent, config())).toBe(true);
    expect(isDeadly(questAt(2, ['ambush'], 'doomed'), tierContent, config())).toBe(true);
  });

  test('is no Quest at a deathFactor of 0', () => {
    expect([1, 2, 3, 4, 5].map((tier) => isDeadly(questAt(tier, ['ambush'], 'doomed'), tierContent, config({ deathFactor: 0 })))).toEqual([
      false, false, false, false, false,
    ]);
  });

  test('passes over an Encounter content no longer defines, and a template it no longer defines reads the ladder', () => {
    expect(isDeadly(questAt(4, ['gone']), tierContent, config())).toBe(false);
    expect(isDeadly(questAt(4, ['gone', 'ambush'], 'gone'), tierContent, config())).toBe(true);
  });
});
