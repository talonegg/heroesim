import { describe, expect, test } from 'vitest';
import { defaultConfig, type EngineDeps } from '../config.js';
import type { Consequence, ContentSet, Encounter } from '../content-types.js';
import { createWorld } from '../create.js';
import { makeId, type Guild, type Hero, type Party, type Quest, type World } from '../document.js';
import { streamOf } from '../generators/draw.js';
import { next } from '../rng.js';
import { playerGuild } from '../selectors.js';
import { heroStatKeys, testContent, testDeps } from '../world.test-support.js';
import { capability } from './check.js';
import { questBand, resolveQuest } from './resolve.js';
import { synergyBonus } from './synergy.js';
import { teamwork } from './teamwork.js';

// M4-S2: a Quest resolved as its sequence of Encounters (DL-42). A created world's player Guild
// sends its Roster, every Stat set to 8, on a Quest whose Encounters a test writes into content.

const setup = { guildmasterName: 'Ada', guildName: 'The Test', createdAt: 'test' };
const pinned = {
  rivalCount: 0,
  checkVariance: 0,
  skillBonusPerRating: 2,
  bandBySuccessShare: { successAbove: 0.5, strongAtLeast: 1 },
  xpPerDifficultyPoint: 1,
  xpBandFactor: { fail: 0.5, success: 1, strong: 1 },
  infirmaryHealFactor: [1, 1 / 2, 1 / 3],
};

/** An Encounter keyed `key`: one Stat, `sum`, no Skills, which `pass` or fail any Party of 8s, with `success`/`failure`. */
function encounter(key: string, pass: boolean, failure: Consequence[] = [], success: Consequence[] = []): Encounter {
  return {
    key,
    name: key,
    kind: 'combat',
    demands: [['strength', 1]],
    aggregate: 'sum',
    skillKeys: [],
    difficultyFactor: pass ? 0.001 : 1000,
    consequences: { success, failure },
  };
}

/** The test content with `encounters` beside its own. */
function contentWith(...encounters: Encounter[]): ContentSet {
  return { ...testContent, encounters: { ...testContent.encounters, ...Object.fromEntries(encounters.map((it) => [it.key, it])) } };
}

interface Scene {
  world: World;
  guild: Guild;
  heroes: Hero[];
  quest: Quest;
  party: Party;
  deps: EngineDeps;
}

/** The player's first `size` Heroes, Stats all 8, sent through `keys` on a Quest of `difficulty`. */
function scene(seed: string, content: ContentSet, keys: string[], { size = 3, difficulty = 40 } = {}): Scene {
  const deps = testDeps(pinned, content);
  const { world } = createWorld(seed, setup, deps).document;
  const guild = playerGuild(world) as Guild;
  const heroes = guild.rosterIds.slice(0, size).map((id) => world.heroes[id] as Hero);
  for (const hero of heroes) {
    hero.stats = Object.fromEntries(heroStatKeys.map((key) => [key, 8]));
    hero.skills = {};
  }
  const offered = world.quests[world.board[0] as Quest['id']] as Quest;
  const quest: Quest = { ...structuredClone(offered), difficulty, reward: 200, fameEffect: 3, encounterKeys: keys };
  const party: Party = {
    id: makeId('parties', 99),
    questId: quest.id,
    guildId: guild.id,
    heroIds: heroes.map((hero) => hero.id),
    departedOnTurn: 0,
    returnsOnTurn: 5,
  };
  return { world, guild, heroes, quest, party, deps };
}

describe('questBand', () => {
  const config = { bandBySuccessShare: { successAbove: 0.5, strongAtLeast: 1 } };

  test('is strong when every Encounter succeeded, success for a majority, and fail for half or fewer', () => {
    expect([0, 1, 2].map((n) => questBand(n, 2, config))).toEqual(['fail', 'fail', 'strong']);
    expect([0, 1, 2, 3].map((n) => questBand(n, 3, config))).toEqual(['fail', 'fail', 'success', 'strong']);
    expect([0, 1, 2, 3, 4].map((n) => questBand(n, 4, config))).toEqual(['fail', 'fail', 'fail', 'success', 'strong']);
    expect([2, 3, 4, 5].map((n) => questBand(n, 5, config))).toEqual(['fail', 'success', 'success', 'strong']);
  });

  test('reads bandBySuccessShare, and no Encounters is a share of 0', () => {
    const lenient = { bandBySuccessShare: { successAbove: 0.3, strongAtLeast: 0.75 } };
    expect([1, 2, 3, 4].map((n) => questBand(n, 4, lenient))).toEqual(['fail', 'success', 'strong', 'strong']);
    expect(questBand(0, 0, config)).toBe('fail');
  });
});

describe('resolveQuest', () => {
  // M4-S2's second box.
  test('a Hero killed in Encounter 2 contributes nothing to Encounter 3', () => {
    const content = contentWith(
      encounter('first', true),
      encounter('deadly', false, [{ kind: 'death', chance: 1 }]),
      { ...encounter('third', true), difficultyFactor: 0.4 },
    );
    const { world, heroes, quest, party, deps } = scene('killed', content, ['first', 'deadly', 'third'], { difficulty: 40 });

    const { encounters, outcome } = resolveQuest(world, quest, party, deps);

    const [dead] = encounters[1]?.died ?? [];
    expect(dead).toBeDefined();
    expect(outcome.deaths).toEqual([dead]);
    const living = heroes.filter((hero) => hero.id !== dead);
    const third = content.encounters['third'] as Encounter;
    // `sum` of Strength: the two living Heroes' 16, not the three's 24, against a target of 16.
    expect(encounters[2]).toMatchObject({ encounterKey: 'third', roll: capability(living, third, world, deps), target: 16 });
    expect(encounters[2]?.roll).toBe(16);
    expect(capability(heroes, third, world, deps)).toBe(24);
    expect(encounters[2]?.outcome).toBe('success');
  });

  test('stops when no one is left, the Encounters it never reached counting as not succeeded', () => {
    const content = contentWith(encounter('wipe', false, [{ kind: 'death', chance: 1 }]), encounter('easy', true));
    const { world, quest, party, deps } = scene('wiped', content, ['wipe', 'easy', 'easy'], { size: 1 });

    const { encounters, outcome } = resolveQuest(world, quest, party, deps);

    expect(encounters.map((it) => it.encounterKey)).toEqual(['wipe']);
    expect(outcome).toMatchObject({ band: 'fail', successes: 0, encounterCount: 3, deaths: party.heroIds });
  });

  test('pays the reward times the wealth factors on a success, nothing on a failure; Fame by the band plus the Encounters; XP by band times the XP factors', () => {
    const rich: Consequence[] = [
      { kind: 'wealth', factor: 1.5 },
      { kind: 'xp', factor: 2 },
      { kind: 'fame', delta: 1 },
    ];
    const content = contentWith(
      encounter('good', true, [], rich),
      encounter('bad', false, [{ kind: 'wealth', factor: 0.5 }, { kind: 'fame', delta: -2 }]),
    );
    const won = scene('won', content, ['good', 'good', 'bad'], { difficulty: 40 });
    const lost = scene('lost', content, ['good', 'bad', 'bad'], { difficulty: 40 });

    const success = resolveQuest(won.world, won.quest, won.party, won.deps).outcome;
    const failure = resolveQuest(lost.world, lost.quest, lost.party, lost.deps).outcome;

    // Two of three: a success, paying 200 × 1.5 × 1.5 × 0.5, gaining 3 + 1 + 1 − 2 Fame and 40 × 1 × 2 × 2 XP.
    expect(success).toMatchObject({ band: 'success', successes: 2, wealthDelta: 225, fameDelta: 3, xpPerHero: 160 });
    // One of three: a failure, paying nothing, losing 3 + 1 + 2 + 2 Fame, and half XP times 2.
    expect(failure).toMatchObject({ band: 'fail', successes: 1, wealthDelta: 0, fameDelta: -6, xpPerHero: 40 });
  });

  test("sums the Encounters' Morale and Regard into the outcome", () => {
    const content = contentWith(
      encounter('cheer', true, [], [{ kind: 'morale', delta: 2 }, { kind: 'regard', between: 'party', delta: 1 }]),
      encounter('gloom', false, [{ kind: 'morale', delta: -5 }, { kind: 'regard', between: 'party', delta: -2 }]),
    );
    const { world, quest, party, deps } = scene('moods', content, ['cheer', 'gloom', 'cheer']);

    expect(resolveQuest(world, quest, party, deps).outcome).toMatchObject({ moraleDelta: -1, regardDelta: 0 });
  });

  test('brings each Hero home with at most one Injury, and none on a Hero who died', () => {
    const content = contentWith(
      encounter('hurt', false, [{ kind: 'injury', typeKey: 'deep-cut', chance: 1, count: 5 }]),
      encounter('kill', false, [{ kind: 'death', chance: 1 }]),
    );
    const { world, heroes, quest, party, deps } = scene('one-each', content, ['hurt', 'kill', 'hurt'], { size: 3 });

    const { encounters, outcome } = resolveQuest(world, quest, party, deps);

    expect(encounters[0]?.injured).toHaveLength(3);
    expect(new Set(encounters[0]?.injured)).toEqual(new Set(heroes.map((hero) => hero.id)));
    expect(encounters[2]?.injured).toEqual([]);
    const [dead] = outcome.deaths;
    expect(outcome.injuries.map((injury) => injury.heroId).sort()).toEqual(
      heroes.map((hero) => hero.id).filter((id) => id !== dead).sort(),
    );
    for (const injury of outcome.injuries) {
      expect(injury.typeKey).toBe('deep-cut');
      expect(injury.healDays).toBeGreaterThanOrEqual(6);
      expect(injury.healDays).toBeLessThanOrEqual(12);
    }
  });

  test("heals an Injury by the infirmary at the Guild's grade when it is inflicted", () => {
    const content = contentWith(encounter('hurt', false, [{ kind: 'injury', typeKey: 'broken-arm', chance: 1, count: 1 }]));
    const bare = scene('infirmary', content, ['hurt'], { size: 1 });
    const kept = scene('infirmary', content, ['hurt'], { size: 1 });
    kept.guild.hall.infirmary = 2;

    const [without] = resolveQuest(bare.world, bare.quest, bare.party, bare.deps).outcome.injuries;
    const [within] = resolveQuest(kept.world, kept.quest, kept.party, kept.deps).outcome.injuries;

    expect(within?.healDays).toBe(Math.max(1, Math.round((without?.healDays ?? NaN) / 3)));
  });

  test("takes one draw a Check, three a count of an Injury and two a Death, whether or not they land, and draws only from quests", () => {
    const harm: Consequence[] = [
      { kind: 'injury', typeKey: 'deep-cut', chance: 0, count: 2 },
      { kind: 'death', chance: 0 },
      { kind: 'fame', delta: 1 },
    ];
    const content = contentWith(encounter('miss', false, harm), encounter('pass', true, harm, harm));
    const { world, quest, party, deps } = scene('draws', content, ['miss', 'pass']);
    const twin = structuredClone(streamOf(world, 'quests'));
    const before = structuredClone(world.rng) as Record<string, unknown>;

    resolveQuest(world, quest, party, deps);

    for (let draw = 0; draw < 2 * (1 + 2 * 3 + 2); draw += 1) next(twin);
    expect(streamOf(world, 'quests')).toEqual(twin);
    const after = world.rng as Record<string, unknown>;
    for (const name of Object.keys(before)) if (name !== 'quests') expect(after[name], name).toEqual(before[name]);
  });

  test('throws on a difficulty not above 0, a Hero not in the world, or an Injury type content lacks', () => {
    const content = contentWith(encounter('odd', false, [{ kind: 'injury', typeKey: 'frostbite', chance: 1, count: 1 }]));
    const { world, quest, party, deps } = scene('throws', content, ['hold-the-line']);

    expect(() => resolveQuest(world, { ...quest, difficulty: 0 }, party, deps)).toThrow(/difficulty/);
    expect(() => resolveQuest(world, quest, { ...party, heroIds: [makeId('heroes', 999)] }, deps)).toThrow(/hero-000999/);
    expect(() => resolveQuest(world, { ...quest, encounterKeys: ['odd'] }, party, deps)).toThrow(/frostbite/);
  });
});

describe("the Quest Engine's config (DL-42)", () => {
  test("defaults to INPUTS 6.2's ±20% and Skill rating × 2, all strong and a majority success, and the stub's fields are gone", () => {
    expect(defaultConfig).toMatchObject({
      configVersion: 4,
      checkVariance: 0.2,
      skillBonusPerRating: 2,
      bandBySuccessShare: { successAbove: 0.5, strongAtLeast: 1 },
    });
    for (const field of ['stubBands', 'stubVariance', 'stubSkillBonusPerRating', 'stubInjuryChance', 'stubDeathChance']) {
      expect(Object.hasOwn(defaultConfig, field), field).toBe(false);
    }
    expect(Object.isFrozen(defaultConfig.bandBySuccessShare)).toBe(true);
  });
});

// The two seams M4-S3 and M4-S4 fill (DL-42): neutral until then, and the Synergy term neutral for
// content without Synergies (M4-S3's own tests are synergy.test.ts).
describe("the Check's seams", () => {
  test('the Synergy bonus is 0 and the teamwork scalar 1, whatever the Party', () => {
    const { world, heroes, deps } = scene('seams', { ...testContent, synergies: {} }, []);
    const any = testContent.encounters['ambush-on-the-road'] as Encounter;
    expect(synergyBonus(heroes, any, 30, deps)).toBe(0);
    expect(teamwork(heroes, world, deps)).toBe(1);
  });
});
