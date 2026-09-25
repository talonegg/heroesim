import { loadContent } from '@heroesim/content/node';
import {
  applyAction,
  availableHeroes,
  createWorld,
  defaultConfig,
  partyFor,
  playerGuild,
  serialise,
  signingFee,
  signingRefusal,
  unattachedHeroes,
  upkeep,
  type EngineDeps,
  type Guild,
  type GuildAction,
  type Quest,
  type WorldDocument,
} from '@heroesim/engine';
import { describe, expect, test } from 'vitest';
import { harnessSetup } from './creation.js';
import { automaticPolicy, defaultPolicyConfig } from './policy.js';

// M2-S12: the harness's automatic policy (INPUTS 4.14, DL-34) against the core content. The
// Upkeep and fee numbers these tests rely on are pinned here, not read from the defaults.

const content = loadContent();
const deps: EngineDeps = {
  config: { ...defaultConfig, wagePerLevel: 5, hallMaintenancePerGrade: 10, signingFeeBase: 50 },
  content,
};

function scene(seed = 'policy'): { document: WorldDocument; guild: Guild; quests: Quest[] } {
  const { document } = createWorld(seed, harnessSetup, deps);
  const guild = playerGuild(document.world);
  if (guild === undefined) throw new Error('No player');
  const quests = document.world.board.map((questId) => {
    const quest = document.world.quests[questId];
    if (quest === undefined) throw new Error(`No Quest ${questId}`);
    return quest;
  });
  return { document, guild, quests };
}

/** Opens every Quest on the Board to a Party of `min` to 4, rewards rising in Board order. */
function openBoard(quests: Quest[], min = 2): void {
  quests.forEach((quest, index) => {
    quest.requirements = { partySizeMin: min, partySizeMax: 4 };
    quest.reward = 100 + 10 * index;
  });
}

const dispatches = (actions: GuildAction[]) => actions.filter((action) => action.kind === 'dispatch');
const recruits = (actions: GuildAction[]) => actions.filter((action) => action.kind === 'recruit');

describe('automaticPolicy', () => {
  test('draws no random number and changes nothing: the document serialises as before, and it chooses alike twice', () => {
    const { document } = scene();
    const before = serialise(document);
    const actions = automaticPolicy(document, deps);
    expect(actions.length).toBeGreaterThan(0);
    expect(serialise(document)).toBe(before);
    expect(automaticPolicy(document, deps)).toEqual(actions);
  });

  test('sends the strongest Party of the size required, by the engine’s staffing rule, to the highest reward first', () => {
    const { document, guild, quests } = scene();
    openBoard(quests);
    const best = quests.at(-1) as Quest;

    const [first] = automaticPolicy(document, deps);

    const party = partyFor(best, availableHeroes(document.world, guild), content);
    expect(party).toHaveLength(2);
    expect(first).toEqual({ kind: 'dispatch', guildId: guild.id, questId: best.id, heroIds: party });
  });

  test('keeps sending Parties while it has Heroes, each to the next reward, no Hero twice', () => {
    const { document, guild, quests } = scene();
    openBoard(quests);

    const sent = dispatches(automaticPolicy(document, deps));

    expect(guild.rosterIds).toHaveLength(4);
    expect(sent.map((action) => action.questId)).toEqual([quests.at(-1)?.id, quests.at(-2)?.id]);
    const heroIds = sent.flatMap((action) => action.heroIds);
    expect(new Set(heroIds).size).toBe(4);
  });

  test('passes over a Quest it cannot staff for the next, and sends no unavailable Hero', () => {
    const { document, guild, quests } = scene();
    openBoard(quests);
    const [hurt] = guild.rosterIds;
    const hero = hurt === undefined ? undefined : document.world.heroes[hurt];
    if (hurt === undefined || hero === undefined) throw new Error('No Hero');
    hero.injury = { typeKey: 'bruised-ribs', healsOnTurn: 30 };
    (quests.at(-1) as Quest).requirements = { partySizeMin: 4, partySizeMax: 4 };

    const sent = dispatches(automaticPolicy(document, deps));

    expect(sent[0]?.questId).toBe(quests.at(-2)?.id);
    expect(sent.flatMap((action) => action.heroIds)).not.toContain(hurt);
  });

  test('chooses only what the rules accept, applied in order', () => {
    for (const seed of ['policy-a', 'policy-b', 'policy-c']) {
      let { document } = scene(seed);
      const guild = playerGuild(document.world) as Guild;
      document.world.guilds[guild.id] = { ...guild, wealth: 10_000 };
      const actions = automaticPolicy(document, deps);
      expect(recruits(actions)).toHaveLength(1);
      for (const action of actions) {
        const result = applyAction(document, action, deps);
        expect(result.ok).toBe(true);
        if (result.ok) document = result.document;
      }
    }
  });

  describe('recruits', () => {
    /** The player's Guild with `wealth` and an empty Board, so only recruitment is chosen. */
    function recruiting(wealth: number) {
      const { document, guild } = scene();
      document.world.board = [];
      guild.wealth = wealth;
      return { document, guild, threshold: defaultPolicyConfig.recruitWealthMultiple * upkeep(guild, document.world, deps.config) };
    }

    test('the cheapest Unattached Hero, lowest id among equal fees, when Wealth exceeds three Upkeeps', () => {
      const { document, guild } = recruiting(10_000);
      const pool = unattachedHeroes(document.world);
      const cheapest = Math.min(...pool.map((hero) => signingFee(hero, deps)));
      const expected = pool.find((hero) => signingFee(hero, deps) === cheapest);

      expect(automaticPolicy(document, deps)).toEqual([{ kind: 'recruit', guildId: guild.id, heroId: expected?.id }]);
    });

    test('only when Wealth is strictly above the threshold and covers the fee', () => {
      const at = recruiting(0);
      at.guild.wealth = at.threshold;
      expect(defaultPolicyConfig.recruitWealthMultiple).toBe(3);
      expect(at.threshold).toBe(60);
      expect(automaticPolicy(at.document, deps)).toEqual([]);

      const above = recruiting(61);
      const fees = unattachedHeroes(above.document.world).map((hero) => signingFee(hero, deps));
      expect(Math.min(...fees)).toBeGreaterThan(61);
      expect(automaticPolicy(above.document, deps)).toEqual([]);
    });

    test("passing over a Hero who would refuse the Guild's Fame for the cheapest who would sign, by the engine's own test (M3-S5)", () => {
      const gated: EngineDeps = { ...deps, config: { ...deps.config, fameRequiredPerLevel: 10 } };
      const { document, guild } = recruiting(10_000);
      guild.fame = 0;
      const pool = unattachedHeroes(document.world);
      const [first, second] = pool;
      if (first === undefined || second === undefined) throw new Error('A short pool');
      // The first the cheapest by far, at Level 3, which asks Fame 20 of a Guild; the second next.
      const statsAt = (value: number) => Object.fromEntries(Object.keys(first.stats).map((key) => [key, value]));
      for (const hero of pool) hero.stats = statsAt(20);
      first.stats = statsAt(1);
      first.level = 3;
      second.stats = statsAt(12);
      expect(signingFee(first, gated)).toBeLessThan(signingFee(second, gated));
      expect(signingRefusal(guild, first, gated.config)).toEqual({ fameRequired: 20, fame: 0, shortfall: 20 });

      expect(automaticPolicy(document, gated)).toEqual([{ kind: 'recruit', guildId: guild.id, heroId: second.id }]);

      guild.fame = 20;
      expect(automaticPolicy(document, gated)).toEqual([{ kind: 'recruit', guildId: guild.id, heroId: first.id }]);

      guild.fame = 0;
      for (const hero of pool) hero.level = 2;
      expect(automaticPolicy(document, gated)).toEqual([]);
    });

    test('only while the Roster is below the limit, 8 unless the policy says otherwise', () => {
      expect(defaultPolicyConfig.rosterLimit).toBe(8);
      const { document, guild } = recruiting(10_000);
      expect(guild.rosterIds).toHaveLength(4);
      expect(automaticPolicy(document, deps, { ...defaultPolicyConfig, rosterLimit: 5 })).toHaveLength(1);
      expect(automaticPolicy(document, deps, { ...defaultPolicyConfig, rosterLimit: 4 })).toEqual([]);
    });
  });

  test('chooses nothing once the game has ended', () => {
    const { document, quests } = scene();
    openBoard(quests);
    document.world.ended = { turn: 0, reason: 'bankruptcy' };
    expect(automaticPolicy(document, deps)).toEqual([]);
  });
});
