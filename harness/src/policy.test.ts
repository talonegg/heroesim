import { loadContent } from '@heroesim/content/node';
import {
  addStack,
  advance,
  applyAction,
  availableHeroes,
  createWorld,
  defaultConfig,
  gearChoices,
  holdings,
  makeId,
  marketHolder,
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
import { afterEach, describe, expect, test, vi } from 'vitest';
import { harnessSetup } from './creation.js';
import { automaticPolicy, defaultPolicyConfig, type PolicyConfig } from './policy.js';

// M2-S12: the harness's automatic policy (INPUTS 4.14, DL-34) against the core content. The
// Upkeep and fee numbers these tests rely on are pinned here, not read from the defaults. The
// Market is empty (`marketSize: 0`) unless a test stocks it, so that the armour and consumables it
// would buy (M5-S4, DL-62) stay out of the tests of building and recruiting.

const content = loadContent();
const deps: EngineDeps = {
  config: { ...defaultConfig, wagePerLevel: 5, hallMaintenancePerGrade: 10, signingFeeBase: 50, marketSize: 0 },
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
const builds = (actions: GuildAction[]) => actions.filter((action) => action.kind === 'build');

/**
 * The policy with building out of reach: from M3-S6 its one purchase a Turn is the infirmary's next
 * grade whenever Wealth is three times its cost, which the recruiting tests' Wealth is.
 */
const noBuilding: PolicyConfig = { ...defaultPolicyConfig, buildWealthMultiple: Number.POSITIVE_INFINITY };

afterEach(() => {
  vi.restoreAllMocks();
});

describe('automaticPolicy', () => {
  test('draws no random number and changes nothing: the document serialises as before, and it chooses alike twice', () => {
    const { document, guild } = scene();
    // Every kind of choice on offer: Parties to send, a purchase to make.
    document.world.guilds[guild.id] = { ...guild, wealth: 10_000 };
    const random = vi.spyOn(Math, 'random');
    const before = serialise(document);

    const actions = automaticPolicy(document, deps);
    const noBuild = automaticPolicy(document, deps, noBuilding);

    expect(dispatches(actions).length).toBeGreaterThan(0);
    expect(builds(actions)).toHaveLength(1);
    expect(recruits(noBuild)).toHaveLength(1);
    expect(random).not.toHaveBeenCalled();
    expect(serialise(document)).toBe(before);
    expect(automaticPolicy(document, deps)).toEqual(actions);
    expect(automaticPolicy(document, deps, noBuilding)).toEqual(noBuild);
  });

  test('breaks a tie of rewards by the lower Quest id, and a tie of fees by the lower Hero id, whatever the order it meets them in', () => {
    const { document, guild, quests } = scene();
    openBoard(quests);
    for (const quest of quests) quest.reward = 100;
    // The Board in reverse id order, so that its own order would give the other answer.
    document.world.board = [...document.world.board].sort().reverse();
    const pool = unattachedHeroes(document.world);
    const [lowest] = pool;
    for (const hero of pool) hero.stats = { ...lowest?.stats };
    document.world.guilds[guild.id] = { ...guild, wealth: 500 };
    const random = vi.spyOn(Math, 'random');

    const actions = automaticPolicy(document, deps, noBuilding);

    expect(random).not.toHaveBeenCalled();
    const byId = [...quests].sort((a, b) => (a.id < b.id ? -1 : 1)).map((quest) => quest.id);
    expect(dispatches(actions).map((action) => action.questId)).toEqual(byId.slice(0, dispatches(actions).length));
    expect(recruits(actions)).toEqual([{ kind: 'recruit', guildId: guild.id, heroId: lowest?.id }]);
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

  test('chooses only what the rules accept, applied in order: a build, or with building out of reach a recruit', () => {
    for (const seed of ['policy-a', 'policy-b', 'policy-c']) {
      for (const [policy, purchase] of [
        [defaultPolicyConfig, 'build'],
        [noBuilding, 'recruit'],
      ] as const) {
        let { document } = scene(seed);
        const guild = playerGuild(document.world) as Guild;
        document.world.guilds[guild.id] = { ...guild, wealth: 10_000 };
        const actions = automaticPolicy(document, deps, policy);
        expect(dispatches(actions).length).toBeGreaterThan(0);
        expect([...recruits(actions), ...builds(actions)].map((action) => action.kind)).toEqual([purchase]);
        for (const action of actions) {
          const result = applyAction(document, action, deps);
          expect(result.ok).toBe(true);
          if (result.ok) document = result.document;
        }
      }
    }
  });

  describe('recruits (building out of reach)', () => {
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

      expect(automaticPolicy(document, deps, noBuilding)).toEqual([{ kind: 'recruit', guildId: guild.id, heroId: expected?.id }]);
    });

    test('only when Wealth is strictly above the threshold and covers the fee', () => {
      const at = recruiting(0);
      at.guild.wealth = at.threshold;
      expect(defaultPolicyConfig.recruitWealthMultiple).toBe(3);
      expect(at.threshold).toBe(60);
      expect(automaticPolicy(at.document, deps, noBuilding)).toEqual([]);

      const above = recruiting(61);
      const fees = unattachedHeroes(above.document.world).map((hero) => signingFee(hero, deps));
      expect(Math.min(...fees)).toBeGreaterThan(61);
      expect(automaticPolicy(above.document, deps, noBuilding)).toEqual([]);
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

      expect(automaticPolicy(document, gated, noBuilding)).toEqual([{ kind: 'recruit', guildId: guild.id, heroId: second.id }]);

      guild.fame = 20;
      expect(automaticPolicy(document, gated, noBuilding)).toEqual([{ kind: 'recruit', guildId: guild.id, heroId: first.id }]);

      guild.fame = 0;
      for (const hero of pool) hero.level = 2;
      expect(automaticPolicy(document, gated, noBuilding)).toEqual([]);
    });

    test('only while the Roster is below the limit, 8 unless the policy says otherwise', () => {
      expect(defaultPolicyConfig.rosterLimit).toBe(8);
      const { document, guild } = recruiting(10_000);
      expect(guild.rosterIds).toHaveLength(4);
      expect(automaticPolicy(document, deps, { ...noBuilding, rosterLimit: 5 })).toHaveLength(1);
      expect(automaticPolicy(document, deps, { ...noBuilding, rosterLimit: 4 })).toEqual([]);
    });
  });

  describe('builds (M3-S6)', () => {
    /** The player's Guild with `wealth`, its infirmary at `grade`, and an empty Board. */
    function building(wealth: number, grade = 0) {
      const { document, guild } = scene();
      document.world.board = [];
      guild.wealth = wealth;
      guild.hall.infirmary = grade;
      return { document, guild };
    }

    test("the infirmary's next grade, in place of a recruit, only while Wealth exceeds three times its cost", () => {
      expect(defaultPolicyConfig.buildWealthMultiple).toBe(3);
      const at = building(3 * 200);
      expect(automaticPolicy(at.document, deps).map((action) => action.kind)).toEqual(['recruit']);

      const above = building(3 * 200 + 1);
      expect(automaticPolicy(above.document, deps)).toEqual([{ kind: 'build', guildId: above.guild.id, facility: 'infirmary' }]);

      const second = building(3 * 500 + 1, 1);
      expect(automaticPolicy(second.document, deps)).toEqual([{ kind: 'build', guildId: second.guild.id, facility: 'infirmary' }]);
      expect(automaticPolicy(building(3 * 500, 1).document, deps).map((action) => action.kind)).toEqual(['recruit']);
    });

    test('nothing past the top grade, and no other facility: then it recruits', () => {
      const { document } = building(1_000_000, 3);
      expect(automaticPolicy(document, deps).map((action) => action.kind)).toEqual(['recruit']);
    });

    test('reads its own multiple, not the game’s', () => {
      const { document, guild } = building(1_000);
      expect(automaticPolicy(document, deps, { ...defaultPolicyConfig, buildWealthMultiple: 5 })).not.toContainEqual(
        expect.objectContaining({ kind: 'build' }),
      );
      const game = { ...deps, config: { ...deps.config, buildWealthMultiple: 100 } };
      expect(automaticPolicy(document, game)).toContainEqual({ kind: 'build', guildId: guild.id, facility: 'infirmary' });
    });
  });

  test('equips the gear its Guild holds first, by the engine’s gearChoices, before sending anyone away (M5-S2, DL-49)', () => {
    const scened = scene('policy-gear');
    const { guild, quests } = scened;
    let { document } = scened;
    openBoard(quests);
    const vault = { kind: 'guild', id: guild.id } as const;
    addStack(document.world, 'mail-shirt', 2, vault);
    addStack(document.world, 'short-sword', 1, vault);

    const actions = automaticPolicy(document, deps, noBuilding);
    const gear = gearChoices(document.world, guild, deps);

    expect(gear).toHaveLength(3);
    expect(actions.slice(0, gear.length)).toEqual(gear);
    expect(dispatches(actions).length).toBeGreaterThan(0);
    // Applied in order, every one is accepted: the equipped Heroes are still home to be sent.
    for (const action of actions) {
      const result = applyAction(document, action, deps);
      expect(result.ok, action.kind).toBe(true);
      if (result.ok) document = result.document;
    }
    expect(holdings(document.world, vault)).toEqual({ items: [], stacks: [] });
  });

  describe('buys armour (M5-S4)', () => {
    /**
     * The player's Guild with `wealth`, its infirmary at the top grade so that it builds nothing, an
     * empty Board, and a Market holding two of each common armour and nothing else.
     */
    function shopping(wealth: number) {
      const { document, guild } = scene();
      document.world.board = [];
      guild.wealth = wealth;
      guild.hall.infirmary = 3;
      for (const key of ['padded-jack', 'mail-shirt', 'plate-harness', 'short-sword']) {
        addStack(document.world, key, 2, marketHolder);
      }
      return { document, guild };
    }

    const buying = (guildId: string, definitionKey: string) => ({ kind: 'buy', guildId, definitionKey, quantity: 1 });

    test('one piece, the dearest armour on the Market whose price Wealth is above three times, in place of a recruit', () => {
      expect(defaultPolicyConfig.buyWealthMultiple).toBe(3);
      const rich = shopping(3 * 300 + 1);
      expect(automaticPolicy(rich.document, deps)).toEqual([buying(rich.guild.id, 'plate-harness')]);
      const at = shopping(3 * 300);
      expect(automaticPolicy(at.document, deps)).toEqual([buying(at.guild.id, 'mail-shirt')]);
      const poor = shopping(3 * 40);
      expect(automaticPolicy(poor.document, deps)).not.toContainEqual(expect.objectContaining({ kind: 'buy' }));
    });

    test('is a purchase the rules accept', () => {
      const { document, guild } = shopping(1_000);
      const [action] = automaticPolicy(document, deps);

      const result = action === undefined ? null : applyAction(document, action, deps);

      expect(result?.ok).toBe(true);
      expect(result?.ok && playerGuild(result.document.world)?.wealth).toBe(1_000 - 300);
      expect(guild.rosterIds.length).toBeGreaterThan(0);
    });

    test('a build comes first, and nothing once every Hero is armoured or has armour waiting', () => {
      const { document, guild } = shopping(10_000);
      guild.hall.infirmary = 0;
      expect(automaticPolicy(document, deps)).toEqual([{ kind: 'build', guildId: guild.id, facility: 'infirmary' }]);
      guild.hall.infirmary = 3;

      // Armour held for all but one Hero, then worn by that one: then it recruits. The armour held
      // is put on first, by gearChoices (M5-S2, DL-54), and the purchase is for the Hero left bare.
      const [first, ...rest] = guild.rosterIds;
      addStack(document.world, 'padded-jack', rest.length, { kind: 'guild', id: guild.id });
      const held = gearChoices(document.world, guild, deps);
      expect(held).toHaveLength(rest.length);
      expect(automaticPolicy(document, deps)).toEqual([...held, buying(guild.id, 'plate-harness')]);
      if (first === undefined) throw new Error('An empty Roster');
      addStack(document.world, 'mail-shirt', 1, { kind: 'hero', id: first, slot: 'armour' });
      const worn = gearChoices(document.world, guild, deps);
      expect(worn.map((action) => action.heroId)).toEqual(rest);
      expect(automaticPolicy(document, deps).map((action) => action.kind)).toEqual([...worn.map(() => 'equip'), 'recruit']);
    });

    test('the armour it buys is worn: its first choice the next Turn puts it on a bare Hero (DL-54)', () => {
      const { document, guild } = shopping(3 * 300 + 1);
      const [first] = guild.rosterIds;
      if (first === undefined) throw new Error('An empty Roster');
      let current = document;
      const apply = (actions: GuildAction[]) => {
        for (const action of actions) {
          const result = applyAction(current, action, deps);
          expect(result.ok, action.kind).toBe(true);
          if (result.ok) current = result.document;
        }
      };

      apply(automaticPolicy(current, deps));
      const [bought] = holdings(current.world, { kind: 'guild', id: guild.id }).stacks;
      expect(bought?.definitionKey).toBe('plate-harness');
      current = advance(current, deps).document;
      const next = automaticPolicy(current, deps);
      apply(next);

      expect(next[0]).toEqual({ kind: 'equip', guildId: guild.id, heroId: first, stackId: bought?.id });
      const armour = holdings(current.world, { kind: 'hero', id: first, slot: 'armour' });
      expect(armour.stacks.map((stack) => stack.definitionKey)).toEqual(['plate-harness']);
    });

    test('nothing when the Market has no armour, or it reads its own multiple', () => {
      const { document, guild } = scene();
      document.world.board = [];
      guild.wealth = 10_000;
      guild.hall.infirmary = 3;
      addStack(document.world, 'short-sword', 2, marketHolder);
      expect(automaticPolicy(document, deps).map((action) => action.kind)).toEqual(['recruit']);

      addStack(document.world, 'padded-jack', 1, marketHolder);
      const choices = automaticPolicy(document, deps, { ...defaultPolicyConfig, buyWealthMultiple: 1_000 });
      expect(choices.map((action) => action.kind)).toEqual(['recruit']);
    });
  });

  describe('carries and buys consumables (the M5 close, DL-62)', () => {
    test('each Party carries one of each consumable held that serves its Quest, never more than the Guild holds that Turn', () => {
      const scened = scene('policy-consumables');
      const { guild, quests } = scened;
      let { document } = scened;
      openBoard(quests);
      // Two Quests at the top of the Board, highest reward first: a fight on the road, then a quiet word.
      const [second, first] = quests.slice(-2);
      if (first === undefined || second === undefined) throw new Error('Fewer than two Quests');
      first.encounterKeys = ['ambush-on-the-road', 'the-long-march'];
      second.encounterKeys = ['a-hostile-reeve', 'the-patrons-steward'];
      const vault = { kind: 'guild', id: guild.id } as const;
      addStack(document.world, 'whetstone', 3, vault); // combat: the fight's
      addStack(document.world, 'lockpicks', 3, vault); // stealth: neither's
      addStack(document.world, 'grappling-line', 1, vault); // travel: the fight's
      addStack(document.world, 'blessed-candle', 2, vault); // social: the quiet word's
      addStack(document.world, 'healing-draught', 1, vault); // a heal serves any Quest: the first sent

      const actions = automaticPolicy(document, deps, noBuilding);

      const sent = dispatches(actions);
      expect(sent.slice(0, 2).map((action) => action.questId)).toEqual([first.id, second.id]);
      expect(sent[0]?.consumables).toEqual([
        { definitionKey: 'grappling-line', quantity: 1 },
        { definitionKey: 'healing-draught', quantity: 1 },
        { definitionKey: 'whetstone', quantity: 1 },
      ]);
      expect(sent[1]?.consumables).toEqual([{ definitionKey: 'blessed-candle', quantity: 1 }]);
      // Applied in order, every one is accepted, and what was not carried stays at home.
      for (const action of actions) {
        const result = applyAction(document, action, deps);
        expect(result.ok, action.kind).toBe(true);
        if (result.ok) document = result.document;
      }
      const home = holdings(document.world, vault).stacks.map((stack) => [stack.definitionKey, stack.quantity]);
      expect(home).toEqual(
        expect.arrayContaining([
          ['whetstone', 2],
          ['lockpicks', 3],
          ['blessed-candle', 1],
        ]),
      );
      expect(home.map(([key]) => key)).not.toContain('healing-draught');
    });

    test('a Party of a Guild holding no consumable carries none, and its dispatch names none', () => {
      const { document, quests } = scene('policy-consumables-none');
      openBoard(quests);
      for (const action of dispatches(automaticPolicy(document, deps, noBuilding))) {
        expect(Object.hasOwn(action, 'consumables')).toBe(false);
      }
    });

    /**
     * The player's Guild with `wealth`, nothing to build, no one to recruit and no armour to buy: its
     * infirmary at the top grade, every Hero in a padded jack, a Roster at the policy's limit, an
     * empty Board, and a Market holding `stock`.
     */
    function stocking(wealth: number, stock: [string, number][]) {
      const { document, guild } = scene('policy-stocking');
      document.world.board = [];
      guild.wealth = wealth;
      guild.hall.infirmary = 3;
      for (const heroId of guild.rosterIds) addStack(document.world, 'padded-jack', 1, { kind: 'hero', id: heroId, slot: 'armour' });
      for (const [key, quantity] of stock) addStack(document.world, key, quantity, marketHolder);
      const policy: PolicyConfig = { ...defaultPolicyConfig, rosterLimit: guild.rosterIds.length };
      return { document, guild, policy };
    }

    test('buys, when nothing else is bought, the consumable it has fewest of, as many as it lacks and the Market has', () => {
      expect(defaultPolicyConfig.consumableStock).toBe(2);
      const { document, guild, policy } = stocking(10_000, [
        ['whetstone', 5],
        ['healing-draught', 1],
        ['physicians-kit', 4],
      ]);
      const vault = { kind: 'guild', id: guild.id } as const;
      addStack(document.world, 'healing-draught', 1, vault);
      addStack(document.world, 'physicians-kit', 1, vault);
      // Fewest held: whetstone, none; two lacking, and the Market has five.
      expect(automaticPolicy(document, deps, policy)).toEqual([{ kind: 'buy', guildId: guild.id, definitionKey: 'whetstone', quantity: 2 }]);

      // With two whetstones held, the healing draught and the physician's kit each lack one: the lower key.
      addStack(document.world, 'whetstone', 2, vault);
      const [action] = automaticPolicy(document, deps, policy);
      expect(action).toEqual({ kind: 'buy', guildId: guild.id, definitionKey: 'healing-draught', quantity: 1 });
      const result = action === undefined ? null : applyAction(document, action, deps);
      expect(result?.ok).toBe(true);
    });

    test('counts what its Parties carry, buys nothing once stocked, and reads its own multiple and stock', () => {
      const { document, guild, policy } = stocking(10_000, [['whetstone', 5]]);
      const vault = { kind: 'guild', id: guild.id } as const;
      addStack(document.world, 'whetstone', 1, vault);
      // A Party away with one more makes two: stocked.
      const [heroId] = guild.rosterIds;
      if (heroId === undefined) throw new Error('An empty Roster');
      const partyId = makeId('parties', 77);
      document.world.parties[partyId] = { id: partyId, questId: makeId('quests', 77), guildId: guild.id, heroIds: [heroId], departedOnTurn: 0, returnsOnTurn: 5 };
      addStack(document.world, 'whetstone', 1, { kind: 'party', id: partyId });
      expect(automaticPolicy(document, deps, policy)).toEqual([]);

      expect(automaticPolicy(document, deps, { ...policy, consumableStock: 4 })).toEqual([
        { kind: 'buy', guildId: guild.id, definitionKey: 'whetstone', quantity: 2 },
      ]);
      // Two whetstones cost 50: Wealth must be above three times that.
      guild.wealth = 150;
      expect(automaticPolicy(document, deps, { ...policy, consumableStock: 4 })).toEqual([]);
      guild.wealth = 151;
      expect(automaticPolicy(document, deps, { ...policy, consumableStock: 4 })).toHaveLength(1);
    });

    test('a recruit comes first', () => {
      const { document, guild, policy } = stocking(10_000, [['whetstone', 5]]);
      const choices = automaticPolicy(document, deps, { ...policy, rosterLimit: 8 });
      expect(choices).toEqual([expect.objectContaining({ kind: 'recruit', guildId: guild.id })]);
    });
  });

  test('chooses nothing once the game has ended', () => {
    const { document, quests } = scene();
    openBoard(quests);
    document.world.ended = { turn: 0, reason: 'bankruptcy' };
    expect(automaticPolicy(document, deps)).toEqual([]);
  });
});
