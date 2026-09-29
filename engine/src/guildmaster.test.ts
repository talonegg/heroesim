import { describe, expect, test } from 'vitest';
import { applyDispatch } from './actions/dispatch.js';
import { applyRecruit } from './actions/recruit.js';
import type { GameConfig } from './config.js';
import type { ContentSet, TraitKey } from './content-types.js';
import type { Guild, Guildmaster, Hero, HeroId, Patron, Quest, World } from './document.js';
import type { EngineEvent } from './events.js';
import { guildmasterStatKeys, guildmasterTraitsOf, judgedHintBands, type GuildmasterRule } from './guildmaster.js';
import { moraleBaselineFor } from './morale.js';
import { guildState } from './phases/guild-state.js';
import { phaseContext } from './phases/phase.js';
import { training } from './phases/training.js';
import { potentialHint } from './potential.js';
import { regardOnQuestResolved, regardValue } from './regard.js';
import { cheapestUnattached, effectiveStats, signingFee, upkeep } from './selectors.js';
import { nightOf } from './time.js';
import { buildDocument, testContent, testDeps } from './world.test-support.js';

// M4-S5: the Guildmaster's five Stat rules and the closed union of Trait effects (R8, pre-M0 review
// B2, B6, D9, INPUTS 6.5, DL-43). Every value these tests rely on is pinned here.

const pinned: Partial<GameConfig> = {
  negotiationRange: 0.1,
  inspirationMoraleShift: 10,
  coachingFactor: 0.5,
  influenceFactor: 0.5,
  judgementHintSharpening: 0.25,
  potentialHintBands: { modest: 0, promising: 6, exceptional: 10 },
  moraleBaseline: 60,
  quartersMoraleBonus: 5,
  moraleMin: 0,
  moraleMax: 100,
  xpPerTrainingDay: 2,
  patronRegardOnSuccess: 2,
  wagePerLevel: 20,
  hallMaintenancePerGrade: 10,
  signingFeeBase: 50,
  signingFeePerLevel: 25,
  signingFeeStatDivisor: 4,
  fameRequiredPerLevel: 10,
};
const deps = testDeps(pinned);

/** Content's Guildmaster Stats range 1 to 20 (DL-17 item 6). */
const bottom = 1;
const top = 20;
const middle = 10;

/** The fixture world, its player's Guild and Guildmaster with every Stat at `middle` and no Traits. */
function scene(): { world: World; ids: ReturnType<typeof buildDocument>['ids']; guild: Guild; guildmaster: Guildmaster } {
  const { document, ids } = buildDocument({ rosterSize: 3, unattached: 2 });
  const { world } = document;
  const guild = world.guilds[ids.playerGuild] as Guild;
  guild.hall.trainingYard = 2;
  const guildmaster = world.guildmasters[guild.guildmasterId] as Guildmaster;
  guildmaster.traits = [];
  for (const key of Object.values(guildmasterStatKeys)) guildmaster.stats[key] = middle;
  for (const patron of Object.values(world.patrons)) patron.regard = {};
  return { world, ids, guild, guildmaster };
}

/** Everything a Guildmaster Stat could bear on, each read through the rule or selector that owns it. */
interface Footprint {
  /** The reward `dispatch` agrees for the fixture's offered Quest. */
  reward: number;
  /** The fee `recruit` charges for the first Hero in the pool. */
  fee: number;
  /** A Roster Hero's Morale baseline. */
  baseline: number;
  /** An idle Hero's XP from one night in the training yard. */
  trainingXp: number;
  /** The Patron's Regard for the Guild after one success. */
  regardGain: number;
  /** The hint bands the Guildmaster reads. */
  hintBands: Readonly<Record<string, number>>;
}

function footprint(stats: Partial<Record<GuildmasterRule, number>>): Footprint {
  const { world, ids, guild, guildmaster } = scene();
  for (const [rule, value] of Object.entries(stats)) guildmaster.stats[guildmasterStatKeys[rule as GuildmasterRule]] = value;
  const [, first, second] = guild.rosterIds as [HeroId, HeroId, HeroId];

  const dispatching = structuredClone(world);
  const sent = applyDispatch(dispatching, { guildId: guild.id, questId: ids.offeredQuest, heroIds: [first, second] }, deps);
  if (!sent.ok) throw new Error(`Refused ${sent.rejection.reason}`);

  const recruiting = structuredClone(world);
  const heroId = ids.unattachedHero as HeroId;
  const signed = applyRecruit(recruiting, { guildId: guild.id, heroId }, deps);
  if (!signed.ok) throw new Error(`Refused ${signed.rejection.reason}`);
  const fee = signed.events[0]?.type === 'hero.recruited' ? signed.events[0].payload.fee : NaN;

  const trainingWorld = structuredClone(world);
  trainingWorld.turn = nightOf(20);
  const before = (trainingWorld.heroes[first] as Hero).xp;
  training(trainingWorld, phaseContext(trainingWorld, deps));

  const regardWorld = structuredClone(world);
  const regardGuild = regardWorld.guilds[guild.id] as Guild;
  regardOnQuestResolved(regardWorld, phaseContext(regardWorld, deps), { questId: ids.takenQuest, patronId: ids.patron, guild: regardGuild, heroIds: [], succeeded: true });

  return {
    reward: (dispatching.quests[ids.offeredQuest] as Quest).reward,
    fee,
    baseline: moraleBaselineFor(world.heroes[first] as Hero, world, deps.config, deps.content),
    trainingXp: (trainingWorld.heroes[first] as Hero).xp - before,
    regardGain: regardValue((regardWorld.patrons[ids.patron] as Patron).regard, guild.id),
    hintBands: judgedHintBands(guildmaster, deps.content, deps.config),
  };
}

describe('the Guildmaster Stats, each at the bottom and the top of its range (M4-S5, R8)', () => {
  const at = (rule: GuildmasterRule, value: number): Footprint => footprint({ [rule]: value });
  /** What each rule's own footprint is, at the bottom and at the top, on the fixture's numbers. */
  const { world, ids } = scene();
  const offered = (world.quests[ids.offeredQuest] as Quest).reward;
  // The list price before it is rounded down (INPUTS 4.7): 50 + 25 × Level + the Stats' sum ÷ 4.
  const pooled = world.heroes[ids.unattachedHero as HeroId] as Hero;
  const heroStats = Object.values(testContent.stats).filter((stat) => stat.owner === 'hero');
  const listFee = 50 + 25 * pooled.level + heroStats.reduce((sum, stat) => sum + (pooled.stats[stat.key] ?? 0), 0) / 4;
  expect(Math.floor(listFee)).toBe(signingFee(pooled, deps));
  const own: Record<GuildmasterRule, [Partial<Footprint>, Partial<Footprint>, (keyof Footprint)[]]> = {
    // INPUTS 6.5: ±10% across the range, the reward up and the fee down as Negotiation rises.
    negotiation: [
      { reward: Math.round(offered * 0.9), fee: Math.floor(listFee * 1.1) },
      { reward: Math.round(offered * 1.1), fee: Math.floor(listFee * 0.9) },
      ['reward', 'fee'],
    ],
    inspiration: [{ baseline: 60 }, { baseline: 70 }, ['baseline']],
    coaching: [{ trainingXp: 4 }, { trainingXp: 6 }, ['trainingXp']],
    influence: [{ regardGain: 2 }, { regardGain: 3 }, ['regardGain']],
    judgement: [
      { hintBands: { modest: 0, promising: 6, exceptional: 10 } },
      { hintBands: { modest: 0, promising: 4.5, exceptional: 7.5 } },
      ['hintBands'],
    ],
  };

  test.each(Object.keys(own) as GuildmasterRule[])('%s shows its effect at the bottom and the top, and no other', (rule) => {
    const [low, high, fields] = own[rule];
    const atBottom = at(rule, bottom);
    const atTop = at(rule, top);
    const atMiddle = footprint({});

    expect(atBottom).toMatchObject(low);
    expect(atTop).toMatchObject(high);
    for (const field of Object.keys(atMiddle) as (keyof Footprint)[]) {
      if (fields.includes(field)) continue;
      // Every other quantity is as it is with every Stat at the middle.
      expect(atBottom[field], `${rule} at the bottom moved ${field}`).toEqual(atMiddle[field]);
      expect(atTop[field], `${rule} at the top moved ${field}`).toEqual(atMiddle[field]);
    }
  });

  test('Judgement sharpens the hint the Guildmaster reads through potentialHint, which is unchanged', () => {
    const hero = { stats: { strength: 5 }, potential: { strength: 10 } };
    const read = (value: number): string => potentialHint(hero, 'strength', { potentialHintBands: footprint({ judgement: value }).hintBands });

    expect(read(bottom)).toBe('modest');
    expect(read(top)).toBe('promising');
  });

  test('Negotiation sets every price by one rule: recruit, cheapestUnattached and signingFee agree, for a Rival as for the player', () => {
    const { world: shared, ids } = scene();
    for (const guildId of [ids.playerGuild, ids.rivalGuild]) {
      const world = structuredClone(shared);
      const guild = world.guilds[guildId] as Guild;
      const guildmaster = world.guildmasters[guild.guildmasterId] as Guildmaster;
      guildmaster.stats['negotiation'] = top;
      guild.wealth = 10_000;
      const cheapest = cheapestUnattached(world, deps, guild);
      if (cheapest === null) throw new Error('An empty pool');
      expect(cheapest.fee).toBe(signingFee(cheapest.hero, deps, guildmaster));
      expect(cheapest.fee).toBeLessThan(signingFee(cheapest.hero, deps));
      const signed = applyRecruit(world, { guildId, heroId: cheapest.hero.id }, deps);
      expect(signed.ok && signed.events[0]?.payload).toMatchObject({ fee: cheapest.fee });
    }
  });
});

// ── Traits ───────────────────────────────────────────────────────────────────────────────────

/** The fixture world with `traits` given to the Guildmaster of `guildId`, every Stat at the middle. */
function withTraits(traits: TraitKey[], guildOf: 'player' | 'rival' = 'player') {
  const built = scene();
  const guildId = guildOf === 'player' ? built.ids.playerGuild : built.ids.rivalGuild;
  const guild = built.world.guilds[guildId] as Guild;
  const guildmaster = built.world.guildmasters[guild.guildmasterId] as Guildmaster;
  guildmaster.traits = traits;
  for (const key of Object.values(guildmasterStatKeys)) guildmaster.stats[key] = middle;
  return { ...built, guild, guildmaster };
}

/** The Guild's Heroes of `classKey`, made so if none is: a Warrior and a Mage for these tests. */
function heroOfClass(world: World, guild: Guild, classKey: string): Hero {
  const hero = guild.rosterIds.map((id) => world.heroes[id] as Hero).find((it) => it.classKey === classKey);
  if (hero !== undefined) return hero;
  const other = world.heroes[guild.rosterIds.at(-1) as HeroId] as Hero;
  other.classKey = classKey;
  return other;
}

/** Everything a Trait could bear on, through the selector that owns each. */
function traitFootprint(world: World, guild: Guild, content: ContentSet = testContent) {
  const warrior = heroOfClass(world, guild, 'warrior');
  const mage = heroOfClass(world, guild, 'mage');
  return {
    warriorStats: effectiveStats(warrior, world, content),
    mageStats: effectiveStats(mage, world, content),
    warriorBase: { ...warrior.stats },
    baseline: moraleBaselineFor(warrior, world, deps.config, content),
    upkeep: upkeep(guild, world, deps.config, content),
    fee: signingFee(warrior, { config: deps.config, content }),
  };
}

describe('the Guildmaster Trait effects, each through the selector it lives in and nowhere else (M4-S5, pre-M0 review B2)', () => {
  test('classStatBonus: Old soldier gives the Guild\'s Warriors +1 Weaponry in effectiveStats, and nothing else', () => {
    const plain = withTraits([]);
    const trained = withTraits(['old-soldier']);
    const before = traitFootprint(plain.world, plain.guild);
    const after = traitFootprint(trained.world, trained.guild);

    expect(after.warriorStats['weaponry']).toBe((before.warriorStats['weaponry'] ?? 0) + 1);
    expect({ ...after.warriorStats, weaponry: before.warriorStats['weaponry'] }).toEqual(before.warriorStats);
    // Not the Mage, not the stored base, not the baseline, the Upkeep or a fee.
    expect(after.mageStats).toEqual(before.mageStats);
    expect(after.warriorBase).toEqual(before.warriorBase);
    expect([after.baseline, after.upkeep, after.fee]).toEqual([before.baseline, before.upkeep, before.fee]);
    // Nor another Guild's Warriors.
    const rival = trained.world.guilds[trained.ids.rivalGuild] as Guild;
    const rivalWarrior = heroOfClass(trained.world, rival, 'warrior');
    expect(effectiveStats(rivalWarrior, trained.world, testContent)['weaponry']).toBe(rivalWarrior.stats['weaponry']);
  });

  test('classStatBonus is held inside the Stat\'s range: Mistrusts magic takes 1 Arcana from Mages, never below the minimum', () => {
    const { world, guild } = withTraits(['mistrusts-magic']);
    const mage = heroOfClass(world, guild, 'mage');
    mage.stats['arcana'] = 7;
    expect(effectiveStats(mage, world, testContent)['arcana']).toBe(6);
    mage.stats['arcana'] = 1;
    expect(effectiveStats(mage, world, testContent)['arcana']).toBe(1);
  });

  test('guildMoraleShift: Well liked and Miser move the Morale baseline in moraleBaselineFor, and nothing else', () => {
    const plain = withTraits([]);
    const before = traitFootprint(plain.world, plain.guild);
    for (const [trait, shift] of [
      ['well-liked', 5],
      ['miser', -5],
    ] as const) {
      const shifted = withTraits([trait]);
      const after = traitFootprint(shifted.world, shifted.guild);
      expect(after.baseline, trait).toBe(before.baseline + shift);
      expect([after.warriorStats, after.mageStats, after.upkeep, after.fee]).toEqual([
        before.warriorStats,
        before.mageStats,
        before.upkeep,
        before.fee,
      ]);
    }
  });

  test('upkeepFactor: Thrifty and Spendthrift scale the Upkeep in upkeep, which the Guild State Engine charges, and nothing else', () => {
    const plain = withTraits([]);
    const before = traitFootprint(plain.world, plain.guild);
    for (const [trait, factor] of [
      ['thrifty', 0.9],
      ['spendthrift', 1.1],
    ] as const) {
      const scaled = withTraits([trait]);
      const after = traitFootprint(scaled.world, scaled.guild);
      expect(after.upkeep, trait).toBe(Math.round(before.upkeep * factor));
      expect([after.warriorStats, after.mageStats, after.baseline, after.fee]).toEqual([
        before.warriorStats,
        before.mageStats,
        before.baseline,
        before.fee,
      ]);
      // The Upkeep Day charges what the selector says.
      const { world } = scaled;
      world.turn = nightOf(deps.config.upkeepEveryDays - 1);
      const events: EngineEvent[] = guildState(world, phaseContext(world, deps));
      const paid = events.find((event) => event.type === 'guild.upkeep-paid' && event.payload.guildId === scaled.guild.id);
      expect(paid?.type === 'guild.upkeep-paid' && paid.payload.amount).toBe(after.upkeep);
    }
  });

  test("a Rival Guildmaster's Traits work on the Rival's Heroes the same way (ADR-0002)", () => {
    const plain = withTraits([], 'rival');
    const traited = withTraits(['old-soldier', 'well-liked', 'thrifty'], 'rival');
    const before = traitFootprint(plain.world, plain.guild);
    const after = traitFootprint(traited.world, traited.guild);

    expect(after.warriorStats['weaponry']).toBe((before.warriorStats['weaponry'] ?? 0) + 1);
    expect(after.baseline).toBe(before.baseline + 5);
    expect(after.upkeep).toBe(Math.round(before.upkeep * 0.9));
    // And the player's Guild is untouched by the Rival's Guildmaster.
    const player = traited.world.guilds[traited.ids.playerGuild] as Guild;
    const playerBefore = traitFootprint(plain.world, plain.world.guilds[plain.ids.playerGuild] as Guild);
    expect(traitFootprint(traited.world, player)).toEqual(playerBefore);
  });

  test('a Trait content does not define, or one with no effect, bears on nothing (data-model rule 5)', () => {
    const plain = withTraits([]);
    const unknown = withTraits(['luck-of-the-draw', 'scarred']);
    expect(traitFootprint(unknown.world, unknown.guild)).toEqual(traitFootprint(plain.world, plain.guild));
  });
});

describe('guildmasterTraitsOf (the M9 review)', () => {
  test("gives every Guildmaster Trait of the content in key order, whatever the content's order, and no Hero Trait", () => {
    expect(guildmasterTraitsOf(testContent).map((trait) => trait.key)).toEqual([
      'miser',
      'mistrusts-magic',
      'old-soldier',
      'spendthrift',
      'thrifty',
      'well-liked',
    ]);
    expect(guildmasterTraitsOf(testContent)[0]).toBe(testContent.traits.miser);
    expect(guildmasterTraitsOf({ traits: {} })).toEqual([]);
  });
});
