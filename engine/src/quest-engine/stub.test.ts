import { describe, expect, test } from 'vitest';
import { defaultConfig, type GameConfig } from '../config.js';
import type { Guild, Hero, HeroId, Party, PartyId, Quest, QuestId, SkillRating, World } from '../document.js';
import { createStreams, next } from '../rng.js';
import { buildDocument, heroStatKeys, plannedStreams, testDeps } from '../world.test-support.js';
import { questBand, resolveQuest, stubScore } from './stub.js';

// M2-S5: the stub Quest Engine (DL-06, pre-M0 review A4, DL-29). Worlds come from the shared
// fixture; the Quest and the Party are made here, since the stub reads them as it is given them.

const noHarm = { fail: 0, success: 0, strong: 0 };

/** A built world whose player Roster is four Heroes with every Stat at `stat` and no Skills. */
function world(stat = 10): { world: World; heroIds: HeroId[]; guild: Guild } {
  const { document, ids } = buildDocument({ rosterSize: 4 });
  const guild = document.world.guilds[ids.playerGuild] as Guild;
  for (const heroId of guild.rosterIds) {
    const hero = document.world.heroes[heroId] as Hero;
    hero.stats = Object.fromEntries(heroStatKeys.map((key) => [key, stat]));
    hero.skills = {};
  }
  return { world: document.world, heroIds: [...guild.rosterIds], guild };
}

function quest(fields: Partial<Quest> = {}): Quest {
  return {
    id: 'quest-000900' as QuestId,
    templateKey: 'clear-the-barrow',
    patronId: 'patron-000001' as Quest['patronId'],
    difficulty: 40,
    tags: [],
    reward: 160,
    fameEffect: 3,
    durationTurns: 9,
    demands: [['strength', 0.5], ['courage', 0.5]],
    skillKeys: ['swordcraft', 'benediction'],
    encounterKeys: [],
    requirements: { partySizeMin: 1, partySizeMax: 4 },
    lootTableKey: null,
    status: 'taken',
    offeredOnTurn: 0,
    expiresOnTurn: 8,
    partyIds: ['party-000900' as PartyId],
    ...fields,
  };
}

function party(guild: Guild, heroIds: HeroId[]): Party {
  return { id: 'party-000900' as PartyId, questId: 'quest-000900' as QuestId, guildId: guild.id, heroIds, departedOnTurn: 0, returnsOnTurn: 8 };
}

/**
 * INPUTS 4.3's bands, which these tests are written against: fail below 0.8, strong above 1.2. The
 * default moved in the first balance pass (DL-35), so they are pinned here.
 */
const inputsBands = { successAtLeast: 0.8, strongAbove: 1.2 };

/** INPUTS 5.1's Quest XP, pinned: 1 a difficulty point on a success, half on a failure (DL-36). */
const inputsXp = { xpPerDifficultyPoint: 1, xpBandFactor: { fail: 0.5, success: 1, strong: 1 } };

function deps(overrides: Partial<GameConfig> = {}) {
  return testDeps({ stubVariance: 0, stubBands: inputsBands, ...inputsXp, ...overrides });
}

describe('stubScore', () => {
  test('is the demands weighed against the Party summed Stats: weight × Σ Stat across the Party', () => {
    const { world: w, heroIds } = world(10);
    const heroes = heroIds.slice(0, 2).map((id) => w.heroes[id] as Hero);
    (heroes[0] as Hero).stats.strength = 14;
    (heroes[1] as Hero).stats.courage = 6;

    // 0.5 × (14 + 10) + 0.5 × (10 + 6), and no Skill.
    expect(stubScore(quest(), heroes, deps())).toBe(20);
  });

  test("differs between two Parties of identical Stats by exactly stubSkillBonusPerRating × the difference in their Quest Skills' summed ratings", () => {
    const { world: w, heroIds } = world(10);
    const [a, b, c, d] = heroIds.map((id) => w.heroes[id] as Hero) as [Hero, Hero, Hero, Hero];
    const rate = (hero: Hero, skills: Record<string, SkillRating>) => void (hero.skills = skills);
    // Party one holds 3 + 2 of the Quest's Skills and a rating of another Skill, which does not count.
    rate(a, { swordcraft: 3, tactics: 5 });
    rate(b, { benediction: 2 });
    // Party two holds 1.
    rate(c, { benediction: 1 });
    rate(d, {});

    for (const bonus of [2, 3.5, 0]) {
      const withBonus = deps({ stubSkillBonusPerRating: bonus });
      const one = stubScore(quest(), [a, b], withBonus);
      const two = stubScore(quest(), [c, d], withBonus);

      expect(one - two).toBe(bonus * (5 - 1));
      expect(two - stubScore(quest(), [d, d], withBonus)).toBe(bonus * 1);
    }
  });

  test('ignores a demand on a Stat, or a Skill, content does not define (data-model rule 5)', () => {
    const { world: w, heroIds } = world(10);
    const hero = w.heroes[heroIds[0] as HeroId] as Hero;
    hero.skills = { juggling: 4 };
    const odd = quest({ demands: [['strength', 0.5], ['luck', 0.5]], skillKeys: ['juggling'] });

    expect(stubScore(odd, [hero], deps())).toBe(5);
  });
});

describe('questBand', () => {
  test('defaults to INPUTS 4.3 scaled by 0.325 since the first balance pass: 0.26 and 0.39 (DL-35)', () => {
    expect(defaultConfig.stubBands).toEqual({ successAtLeast: 0.26, strongAbove: 0.39 });
    const { successAtLeast, strongAbove } = defaultConfig.stubBands;
    expect(strongAbove / successAtLeast).toBeCloseTo(inputsBands.strongAbove / inputsBands.successAtLeast, 10);
    expect([0.25, 0.26, 0.39, 0.4].map((ratio) => questBand(ratio, defaultConfig))).toEqual([
      'fail',
      'success',
      'success',
      'strong',
    ]);
  });

  test('fails below 0.8, succeeds from 0.8 to 1.2 inclusive, succeeds strongly above 1.2 (INPUTS 4.3)', () => {
    const { config } = deps();

    expect(config.stubBands).toEqual({ successAtLeast: 0.8, strongAbove: 1.2 });
    expect([0, 0.79, 0.8, 1, 1.2, 1.21, 3].map((ratio) => questBand(ratio, config))).toEqual([
      'fail',
      'fail',
      'success',
      'success',
      'success',
      'strong',
      'strong',
    ]);
  });
});

describe('resolveQuest', () => {
  test('strongly succeeds, variance 0, for a Party whose Stats meet the demands twice over', () => {
    const { world: w, heroIds, guild } = world(10);
    // Two Heroes at 10 in each demanded Stat score 20; the Quest asks 10.
    const outcome = resolveQuest(w, quest({ difficulty: 10, skillKeys: [] }), party(guild, heroIds.slice(0, 2)), deps());

    expect(outcome).toMatchObject({ band: 'strong', score: 20, ratio: 2 });
    // Strong success harms no one (INPUTS 4.4).
    expect(outcome.injuries).toEqual([]);
    expect(outcome.deaths).toEqual([]);
  });

  test('reads the band from the score after one roll of ±stubVariance', () => {
    const { world: w, heroIds, guild } = world(10);
    const onTheLine = quest({ difficulty: 20, skillKeys: [] }); // score 20, ratio 1 before the roll
    const ratios: number[] = [];
    for (let i = 0; i < 500; i += 1) {
      ratios.push(resolveQuest(w, onTheLine, party(guild, heroIds.slice(0, 2)), deps({ stubVariance: 0.3 })).ratio);
    }

    expect(Math.min(...ratios)).toBeGreaterThanOrEqual(0.7);
    expect(Math.max(...ratios)).toBeLessThanOrEqual(1.3);
    expect(Math.min(...ratios)).toBeLessThan(0.75);
    expect(Math.max(...ratios)).toBeGreaterThan(1.25);
  });

  test.each([
    ['fail', 1000, { wealthDelta: 0, fameDelta: -3, xpPerHero: 500 }],
    ['success', 20, { wealthDelta: 160, fameDelta: 3, xpPerHero: 20 }],
    ['strong', 10, { wealthDelta: 160, fameDelta: 3, xpPerHero: 10 }],
  ] as const)('on a %s, pays the reward or nothing, gains or loses the Fame, and gives XP by difficulty', (band, difficulty, moves) => {
    const { world: w, heroIds, guild } = world(10);
    const outcome = resolveQuest(w, quest({ difficulty, skillKeys: [] }), party(guild, heroIds.slice(0, 2)), deps());

    expect(outcome).toMatchObject({ band, ...moves });
  });

  test.each([
    ['fail', 1000, 750],
    ['success', 20, 30],
    ['strong', 10, 20],
  ] as const)(
    'on a %s at difficulty %i, gives difficulty × xpPerDifficultyPoint × xpBandFactor, rounded down (M3-S2): %i',
    (band, difficulty, xp) => {
      const { world: w, heroIds, guild } = world(10);
      const tuned = deps({ xpPerDifficultyPoint: 1.5, xpBandFactor: { fail: 0.5, success: 1, strong: 4 / 3 } });

      const outcome = resolveQuest(w, quest({ difficulty, skillKeys: [] }), party(guild, heroIds.slice(0, 2)), tuned);

      expect(outcome).toMatchObject({ band, xpPerHero: xp });
    },
  );

  test("gives by default the XP the stub gave before M3-S2 replaced stubXpPerDifficulty: INPUTS 5.1's values", () => {
    expect(defaultConfig).toMatchObject(inputsXp);
    expect(defaultConfig).not.toHaveProperty('stubXpPerDifficulty');
    const { world: w, heroIds, guild } = world(10);

    const outcome = resolveQuest(w, quest({ difficulty: 45, skillKeys: [] }), party(guild, heroIds.slice(0, 1)), testDeps({ stubVariance: 0 }));

    expect(outcome).toMatchObject({ band: 'fail', xpPerHero: 22 });
  });

  test('loses no Fame as −0 when the Fame effect is 0, since −0 is not JSON-safe', () => {
    const { world: w, heroIds, guild } = world(1);
    const outcome = resolveQuest(w, quest({ fameEffect: 0 }), party(guild, heroIds.slice(0, 1)), deps());

    expect(outcome.band).toBe('fail');
    expect(Object.is(outcome.fameDelta, 0)).toBe(true);
  });

  test('on a certain Death and Injury, kills one Hero and injures another, drawing the type and Days from content', () => {
    const { world: w, heroIds, guild } = world(1);
    const certain = deps({ stubDeathChance: { ...noHarm, fail: 1 }, stubInjuryChance: { ...noHarm, fail: 1 } });
    const sent = heroIds.slice(0, 3);

    const outcome = resolveQuest(w, quest(), party(guild, sent), certain);

    expect(outcome.band).toBe('fail');
    expect(outcome.deaths).toHaveLength(1);
    expect(sent).toContain(outcome.deaths[0]);
    const [injury] = outcome.injuries;
    expect(outcome.injuries).toHaveLength(1);
    expect(sent).toContain(injury?.heroId);
    expect(injury?.heroId).not.toBe(outcome.deaths[0]);
    const type = certain.content.injuries[injury?.typeKey ?? ''];
    expect(type).toBeDefined();
    expect(injury?.healDays).toBeGreaterThanOrEqual(type?.healDaysMin ?? Infinity);
    expect(injury?.healDays).toBeLessThanOrEqual(type?.healDaysMax ?? -Infinity);
  });

  test('injures no one when the one Hero sent dies', () => {
    const { world: w, heroIds, guild } = world(1);
    const certain = deps({ stubDeathChance: { ...noHarm, fail: 1 }, stubInjuryChance: { ...noHarm, fail: 1 } });

    const outcome = resolveQuest(w, quest(), party(guild, heroIds.slice(0, 1)), certain);

    expect(outcome.deaths).toEqual([heroIds[0]]);
    expect(outcome.injuries).toEqual([]);
  });

  test('injures and kills at about the configured rates (INPUTS 4.4)', () => {
    const { world: w, heroIds, guild } = world(1);
    const sent = party(guild, heroIds.slice(0, 2));
    const runs = 10_000;
    const failed = { injuries: 0, deaths: 0 };
    for (let i = 0; i < runs; i += 1) {
      const outcome = resolveQuest(w, quest(), sent, deps());
      failed.injuries += outcome.injuries.length;
      failed.deaths += outcome.deaths.length;
    }
    const succeeded = { injuries: 0, deaths: 0 };
    for (let i = 0; i < runs; i += 1) {
      const outcome = resolveQuest(w, quest({ difficulty: 2 }), sent, deps());
      succeeded.injuries += outcome.injuries.length;
      succeeded.deaths += outcome.deaths.length;
    }

    // A failure: 5% a Death, 40% an Injury among the survivors (none when a lone Hero died).
    expect(Math.abs(failed.deaths / runs - 0.05)).toBeLessThan(0.01);
    expect(Math.abs(failed.injuries / runs - 0.4)).toBeLessThan(0.02);
    // A success: 10% an Injury, no Death.
    expect(succeeded.deaths).toBe(0);
    expect(Math.abs(succeeded.injuries / runs - 0.1)).toBeLessThan(0.015);
  });

  test("shortens an Injury by the Guild's infirmary grade: halved at 1, a third at 2, the last factor beyond", () => {
    const certain = { stubInjuryChance: { ...noHarm, fail: 1 } };
    const healDays = (grade: number): number => {
      const { world: w, heroIds, guild } = world(1);
      guild.hall.infirmary = grade;
      const [injury] = resolveQuest(w, quest(), party(guild, heroIds.slice(0, 1)), deps(certain)).injuries;
      return injury?.healDays ?? Number.NaN;
    };
    // Every built world's quests stream starts alike, so each draws the same Days.
    const days = healDays(0);

    expect(days).toBeGreaterThanOrEqual(5);
    expect(healDays(1)).toBe(Math.round(days / 2));
    expect(healDays(2)).toBe(Math.max(1, Math.round(days / 3)));
    expect(healDays(7)).toBe(healDays(2));
  });

  test('draws seven times from the quests stream and from no other, whatever the band', () => {
    for (const [difficulty, config] of [
      [1000, {}],
      [1, {}],
      [1000, { stubDeathChance: { ...noHarm, fail: 1 }, stubInjuryChance: { ...noHarm, fail: 1 } }],
    ] as const) {
      const { world: w, heroIds, guild } = world(10);
      Object.assign(w.rng, createStreams('stub-streams', plannedStreams), structuredClone(w.rng));
      const before = structuredClone(w.rng) as Record<string, number[]>;
      const expected = structuredClone(w.rng.quests);
      for (let draw = 0; draw < 7; draw += 1) next(expected);

      resolveQuest(w, quest({ difficulty }), party(guild, heroIds.slice(0, 2)), deps(config));

      const after = w.rng as Record<string, number[]>;
      for (const name of plannedStreams) {
        if (name === 'quests') expect(after[name], name).toEqual(expected);
        else expect(after[name], name).toEqual(before[name]);
      }
    }
  });

  test('changes nothing in the world but the quests stream', () => {
    const { world: w, heroIds, guild } = world(1);
    const before = structuredClone(w);
    const certain = deps({ stubDeathChance: { ...noHarm, fail: 1 }, stubInjuryChance: { ...noHarm, fail: 1 } });

    resolveQuest(w, quest(), party(guild, heroIds.slice(0, 2)), certain);

    expect({ ...w, rng: before.rng }).toEqual(before);
  });

  test('throws on a programming error: a difficulty of 0, a Hero not in the world, no Injury types', () => {
    const { world: w, heroIds, guild } = world(10);

    expect(() => resolveQuest(w, quest({ difficulty: 0 }), party(guild, heroIds), deps())).toThrow(/difficulty/);
    expect(() => resolveQuest(w, quest(), party(guild, ['hero-000999' as HeroId]), deps())).toThrow(/hero-000999/);
    const none = { ...deps(), content: { ...deps().content, injuries: {} } };
    expect(() => resolveQuest(w, quest(), party(guild, heroIds), none)).toThrow(/Injury/);
  });
});
