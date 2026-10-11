// The Quest scene the resolver's tests share (DL-42): a created world's player Guild sends its
// Roster, every Stat set to 8, on a Quest whose Encounters a test writes into content. Shared by
// `resolve.test.ts`, in `npm test`, and `resolve.harness.test.ts`, the harm box's 20,000 draws, run
// apart by `npm run harness` as DL-230's boxes are (DL-246).

import { defaultConfig, type EngineDeps } from '../config.js';
import type { Consequence, ContentSet, Encounter } from '../content-types.js';
import { createWorld } from '../create.js';
import { makeId, type Guild, type Hero, type Party, type Quest, type World } from '../document.js';
import { playerGuild } from '../selectors.js';
import { demandsCheck, heroStatKeys, testContent, testDeps } from '../world.test-support.js';

export const setup = { guildmasterName: 'Ada', guildName: 'The Test', createdAt: 'test' };

/** The config the scenes' numbers were worked out under. */
export const pinned = {
  rivalCount: 0,
  checkVariance: 0,
  skillBonusPerRating: 2,
  bandBySuccessShare: { successAbove: 0.5, strongAtLeast: 1 },
  // DL-148's Degrees and DL-154's hurt factor, which these scenes' numbers were worked out under;
  // the balance pass moved the defaults (DL-166). Morale's factor, a line (DL-283), is read through
  // `moraleFactor` at the defaults.
  checkDegrees: { triumph: 1.25, success: 1, setback: 0.75 },
  strongTriumphShare: 0.5,
  hurtCheckFactor: 0.85,
  xpPerDifficultyPoint: 1,
  xpBandFactor: { fail: 0.5, success: 1, strong: 1 },
  // Every Tier's XP and Death at a factor of 1, as the scenes' XP and harm were worked out before
  // Tiers (DL-262, DL-265).
  tiers: defaultConfig.tiers.map((tier) => ({ ...tier, xpFactor: 1, deathScale: 1 })),
  deathFactor: 1,
  infirmaryHealFactor: [1, 1 / 2, 1 / 3],
};

/** An Encounter keyed `key`: one Stat, `sum`, no Skills, which `pass` or fail any Party of 8s, with `success`/`failure`. */
export function encounter(key: string, pass: boolean, failure: Consequence[] = [], success: Consequence[] = []): Encounter {
  return {
    key,
    name: key,
    kind: 'combat',
    checks: [demandsCheck(key, key, 'sum', [['strength', 1]], [], pass ? 0.001 : 1000)],
    consequences: { success, failure },
  };
}

/** The test content with `encounters` beside its own. */
export function contentWith(...encounters: Encounter[]): ContentSet {
  return { ...testContent, encounters: { ...testContent.encounters, ...Object.fromEntries(encounters.map((it) => [it.key, it])) } };
}

export interface Scene {
  world: World;
  guild: Guild;
  heroes: Hero[];
  quest: Quest;
  party: Party;
  deps: EngineDeps;
}

/**
 * The player's first `size` Heroes, Stats all 8, sent through `keys` on a Quest of `difficulty`. A
 * `size` above the starting Roster's 4 starts the Roster with `size` Heroes.
 */
export function scene(seed: string, content: ContentSet, keys: string[], { size = 3, difficulty = 40 } = {}): Scene {
  const deps = testDeps({ ...pinned, ...(size > 4 ? { startingRosterSize: size } : {}) }, content);
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
    fatigueAtDispatch: Object.fromEntries(heroes.map((hero) => [hero.id, hero.fatigue])),
  };
  return { world, guild, heroes, quest, party, deps };
}
