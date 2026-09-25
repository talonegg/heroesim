// The stub Quest Engine (M2-S5, DL-06, pre-M0 review A4, DL-29): until M4's Encounters, a Quest is
// resolved in one assessment. The Party's Stats are weighed against the Quest's demands, its Skills
// on the Quest's list add a flat bonus per rating (R15), a single roll scales the score, and the
// ratio of score to difficulty falls in one of three bands (INPUTS 4.3), which set the reward, the
// Fame, the XP and the chances of harm (INPUTS 4.4).
//
// Every draw is from the `quests` stream, and a resolution always takes the same seven draws, in
// this order, whatever the Party, the band or the config: the roll; whether a Hero dies and which;
// whether a Hero is injured and which; the Injury's type and its Days to heal. So tuning a chance
// never shifts the draws after it, as `chance` promises for one draw (rng.ts).
//
// It reads the World State and changes nothing but the stream: applying the outcome is the night
// phase `questsConclude`'s. Rivals' Parties resolve through it exactly as the player's do
// (ADR-0002 as amended by pre-M0 review A1).

import type { EngineDeps, QuestBand } from '../config.js';
import type { InjuryTypeKey } from '../content-types.js';
import type { Guild, Hero, HeroId, Party, Quest, World } from '../document.js';
import { sortedRows, streamOf } from '../generators/draw.js';
import { chance, int, next, pick } from '../rng.js';
import { baseStat } from '../selectors.js';

/** An Injury the outcome inflicts: its type and the Days it takes to heal, the infirmary applied. */
export interface QuestInjury {
  heroId: HeroId;
  typeKey: InjuryTypeKey;
  healDays: number;
}

/** What a Quest's resolution comes to: the epic's outcome, with the score and ratio it came from. */
export interface QuestOutcome {
  band: QuestBand;
  /** The Party's score before the roll (`stubScore`). */
  score: number;
  /** The score after the roll, divided by the Quest's difficulty: what the band is read from. */
  ratio: number;
  /** Wealth to the Guild: the Quest's reward on a success, nothing on a failure. */
  wealthDelta: number;
  /** Fame to the Guild: the Quest's Fame effect, gained on a success and lost on a failure. */
  fameDelta: number;
  /** XP to each Hero who comes home alive. */
  xpPerHero: number;
  /** At most one, on a Hero who does not die. */
  injuries: QuestInjury[];
  /** At most one. */
  deaths: HeroId[];
}

/** What the stub reads from the rules and the content. */
export type StubDeps = Pick<EngineDeps, 'config' | 'content'>;

/**
 * The Party's score on `quest`: for each demand, its weight times the sum of that Stat across the
 * Party, plus `stubSkillBonusPerRating` times the ratings, summed across the Party, of the Skills
 * the Quest lists (M2-S5, pre-M0 review A4). Stats are base values read through `baseStat`; a
 * demand on a Stat, or a Skill, that content no longer defines counts for nothing (data-model rule 5).
 */
export function stubScore(
  quest: Pick<Quest, 'demands' | 'skillKeys'>,
  heroes: readonly Pick<Hero, 'stats' | 'skills'>[],
  deps: StubDeps,
): number {
  const { config, content } = deps;
  let score = 0;
  for (const [statKey, weight] of quest.demands) {
    const stat = Object.hasOwn(content.stats, statKey) ? content.stats[statKey] : undefined;
    if (stat === undefined || stat.owner !== 'hero') continue;
    let sum = 0;
    for (const hero of heroes) sum += baseStat(hero.stats, stat);
    score += weight * sum;
  }
  let ratings = 0;
  for (const skillKey of quest.skillKeys) {
    if (!Object.hasOwn(content.skills, skillKey)) continue;
    for (const hero of heroes) ratings += Object.hasOwn(hero.skills, skillKey) ? (hero.skills[skillKey] ?? 0) : 0;
  }
  return score + config.stubSkillBonusPerRating * ratings;
}

/**
 * The band a ratio of score to difficulty falls in (INPUTS 4.3): `fail` below
 * `stubBands.successAtLeast`, `strong` above `stubBands.strongAbove`, `success` from the one up to
 * and including the other.
 */
export function questBand(ratio: number, config: Pick<EngineDeps['config'], 'stubBands'>): QuestBand {
  if (ratio < config.stubBands.successAtLeast) return 'fail';
  if (ratio > config.stubBands.strongAbove) return 'strong';
  return 'success';
}

/**
 * Resolves `party`'s attempt at `quest` (M2-S5): the score (`stubScore`), scaled by `1 + roll` where
 * the roll is drawn from −`stubVariance` up to +`stubVariance`, over the difficulty gives the ratio
 * and the band. The band gives the Wealth (the reward, or nothing on a failure), the Fame (the
 * Fame effect, lost on a failure), the XP (`stubXpPerDifficulty` of the difficulty, rounded down),
 * and the chances that one Hero dies (`stubDeathChance`) and one survivor is injured
 * (`stubInjuryChance`), each Hero equally likely. An Injury's type is drawn uniformly from content,
 * in key order, and its Days from the type's range, multiplied by `infirmaryHealFactor` at the
 * Guild's infirmary grade now, rounded to the nearest Day and at least 1 (INPUTS 4.5).
 *
 * Draws seven times from `world.rng.quests` and changes nothing else. Throws on a programming
 * error: a Hero or Guild not in the world, a difficulty that is not above 0, no Injury types, or a
 * world without the `quests` stream.
 */
export function resolveQuest(world: World, quest: Quest, party: Party, deps: StubDeps): QuestOutcome {
  const { config, content } = deps;
  if (!(quest.difficulty > 0)) throw new RangeError(`${quest.id} has difficulty ${quest.difficulty}; it is above 0`);
  const heroes = party.heroIds.map((heroId) => row(world.heroes, heroId, 'heroes'));
  const guild = row<Guild>(world.guilds, party.guildId, 'guilds');
  const types = sortedRows(content.injuries);
  if (types.length === 0) throw new RangeError('Content defines no Injury type for the stub to inflict');
  const state = streamOf(world, 'quests');

  const score = stubScore(quest, heroes, deps);
  const roll = (next(state) * 2 - 1) * config.stubVariance;
  const ratio = (score * (1 + roll)) / quest.difficulty;
  const band = questBand(ratio, config);

  const dies = chance(state, config.stubDeathChance[band]);
  const dead = heroes[int(state, 0, Math.max(0, heroes.length - 1))];
  const deaths = dies && dead !== undefined ? [dead.id] : [];

  const survivors = heroes.filter((hero) => !deaths.includes(hero.id));
  const injured = chance(state, config.stubInjuryChance[band]);
  const hurt = survivors[int(state, 0, Math.max(0, survivors.length - 1))];
  const type = pick(state, types);
  const days = int(state, type.healDaysMin, type.healDaysMax);
  const factors = config.infirmaryHealFactor;
  const factor = factors[Math.min(Math.max(0, guild.hall.infirmary), factors.length - 1)] ?? 1;
  const injuries =
    injured && hurt !== undefined
      ? [{ heroId: hurt.id, typeKey: type.key, healDays: Math.max(1, Math.round(days * factor)) }]
      : [];

  const succeeded = band !== 'fail';
  return {
    band,
    score,
    ratio,
    wealthDelta: succeeded ? quest.reward : 0,
    // `0 -` rather than unary minus: a Fame effect of 0 then loses 0, not −0, which is not JSON-safe.
    fameDelta: succeeded ? quest.fameEffect : 0 - quest.fameEffect,
    xpPerHero: Math.floor(quest.difficulty * config.stubXpPerDifficulty[band]),
    injuries,
    deaths,
  };
}

/** The row `id` names in `rows`, which must be there. */
function row<Row>(rows: Readonly<Record<string, Row>>, id: string, table: string): Row {
  const found = Object.hasOwn(rows, id) ? rows[id] : undefined;
  if (found === undefined) throw new RangeError(`${id} is not in world.${table}`);
  return found;
}
