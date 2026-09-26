// The Quest Engine (M4-S2, approach §1, R24, DL-42): a Quest resolves as its sequence of typed
// Encounters, each a Check (check.ts) with typed consequences (content-types.ts, `Consequence`).
// For each Encounter in order the Party's living members are checked, and the consequences of the
// outcome are applied to a working outcome: an Injury or a Death drawn, Morale, Regard and Fame
// summed, XP and Wealth factors multiplied. A Hero who dies takes no part in the rest of the
// sequence, and a Party with no one left stops. The Quest's band is read from the share of its
// Encounters succeeded (`bandBySuccessShare`), so M2's Wealth and Fame rules and M3's XP rule still
// apply through it (DL-29 item 4, DL-36 item 5), each then moved by the consequences. The outcome
// names the Synergies that added to any Check (M4-S3, DL-45), once for the Quest.
//
// Every draw is from the `quests` stream, except the sequence of a Quest generated before M4, which
// is drawn from `encounters` (`sequenceFor`). The draws are a Check's one, then for each of the
// outcome's consequences in order: an Injury three per `count` (whether it lands, on whom, its
// Days), a Death two (whether, on whom); taken whether or not they land, so tuning a chance never
// shifts a later draw, as `chance` promises for one (rng.ts).
//
// The consumables the Party carries (M5-S3, DL-50, consumables.ts) add a bonus to a Check, roll a
// failed Check again, and shorten the Injuries once the sequence is over. Only a reroll draws: one
// more from `quests`, straight after the Check it rolls again, so a Party carrying none draws as
// above. The Items used are returned beside the outcome, for `questsConclude` to expend.
//
// It reads the World State and changes nothing but the streams: applying the outcome is the night
// phase `questsConclude`'s. Rivals' Parties resolve through it exactly as the player's do
// (ADR-0002 as amended by pre-M0 review A1).

import type { GameConfig, QuestBand } from '../config.js';
import type { Consequence, EncounterKey, EncounterKind, InjuryTypeKey, SynergyKey } from '../content-types.js';
import { compareByCodeUnit, type Guild, type Hero, type HeroId, type Party, type Quest, type World } from '../document.js';
import { streamOf, type Stream } from '../generators/draw.js';
import { chance, int } from '../rng.js';
import { check, type CheckDeps, type EncounterOutcome } from './check.js';
import { kitOf, type ConsumableUse } from './consumables.js';
import { sequenceFor } from './encounters.js';
import { synergiesOn } from './synergy.js';

/** An Injury the outcome inflicts: its type and the Days it takes to heal, the infirmary applied. */
export interface QuestInjury {
  heroId: HeroId;
  typeKey: InjuryTypeKey;
  healDays: number;
}

/** One Encounter of the sequence, checked: what `quest.encounter` records. */
export interface EncounterResult {
  /** Its place in the sequence, from 0. */
  index: number;
  encounterKey: EncounterKey;
  kind: EncounterKind;
  roll: number;
  target: number;
  margin: number;
  outcome: EncounterOutcome;
  /** The Heroes its consequences injured, in the order they were. */
  injured: HeroId[];
  /** The Heroes its consequences killed. */
  died: HeroId[];
}

/** What a Quest's resolution comes to (DL-29's outcome, its score and ratio now the Encounters'). */
export interface QuestOutcome {
  band: QuestBand;
  /** Encounters whose Check succeeded. */
  successes: number;
  /** Encounters in the sequence, those a Party wiped out never reached included. */
  encounterCount: number;
  /** Wealth to the Guild: the reward times the Encounters' wealth factors on a success, nothing on a failure. */
  wealthDelta: number;
  /** Fame to the Guild: the Fame effect, gained on a success and lost on a failure, plus the Encounters' Fame. */
  fameDelta: number;
  /** XP to each Hero who comes home alive: M3-S2's by band, times the Encounters' XP factors. */
  xpPerHero: number;
  /** Morale to each Hero who comes home alive, summed over the Encounters; 0 moves no one. */
  moraleDelta: number;
  /** Regard between every pair of the Party, summed over the Encounters; applied from M4-S4. */
  regardDelta: number;
  /** At most one per Hero, and none on a Hero who died. */
  injuries: QuestInjury[];
  deaths: HeroId[];
  /**
   * The Synergies that added to at least one Check of the sequence (M4-S3, DL-45): each met by the
   * members checked on an Encounter of one of its kinds, once however many, in key order.
   */
  synergyKeys: SynergyKey[];
}

/** A Quest resolved: its outcome, and each Encounter checked, in sequence order. */
export interface Resolution {
  outcome: QuestOutcome;
  encounters: EncounterResult[];
  /**
   * The consumables the Party used, one entry an Item, in the order used (M5-S3, consumables.ts):
   * for `questsConclude` to expend. None when it carried none, or none applied.
   */
  consumables: ConsumableUse[];
}

/**
 * The band `successes` of `encounterCount` Encounters come to (M4-S2): `strong` when their share is
 * at least `strongAtLeast`, `success` when it is above `successAbove`, else `fail`. No Encounters is
 * a share of 0.
 */
export function questBand(
  successes: number,
  encounterCount: number,
  config: Pick<GameConfig, 'bandBySuccessShare'>,
): QuestBand {
  const share = encounterCount > 0 ? successes / encounterCount : 0;
  const { successAbove, strongAtLeast } = config.bandBySuccessShare;
  if (share >= strongAtLeast) return 'strong';
  if (share > successAbove) return 'success';
  return 'fail';
}

/** The outcome as it builds up over the sequence. */
interface Working {
  /** The Party's members still in the sequence, in Party order. */
  alive: Hero[];
  injuries: QuestInjury[];
  deaths: HeroId[];
  xpFactor: number;
  wealthFactor: number;
  fameDelta: number;
  moraleDelta: number;
  regardDelta: number;
}

/**
 * Resolves `party`'s attempt at `quest` (M4-S2) through its Encounter sequence (`sequenceFor`): for
 * each Encounter in order, a Check of the members still alive, then the consequences of its outcome
 * applied in the order content lists them. The band follows the share succeeded
 * (`questBand`); the Wealth is the reward times the wealth factors, rounded, on a success and
 * nothing on a failure; the Fame the Fame effect, won or lost by the band, plus the Encounters'; the
 * XP the difficulty × `xpPerDifficultyPoint` × the band's `xpBandFactor` × the XP factors, rounded
 * down. An Injury's Days are drawn from its type's range and multiplied by `infirmaryHealFactor` at
 * the Guild's infirmary grade now, rounded to the nearest Day and at least 1 (INPUTS 4.5). The
 * consumables the Party carries add to a Check, roll a failed one again, and then shorten the
 * Injuries (M5-S3, DL-50, `kitOf`); the Items used are the resolution's `consumables`.
 *
 * Changes nothing but the streams. Throws on a programming error: a Hero or Guild not in the world, a
 * difficulty that is not above 0, an Injury type content lacks, or a world without the `quests`
 * stream.
 */
export function resolveQuest(world: World, quest: Quest, party: Party, deps: CheckDeps): Resolution {
  const { config } = deps;
  if (!(quest.difficulty > 0)) throw new RangeError(`${quest.id} has difficulty ${quest.difficulty}; it is above 0`);
  const heroes = party.heroIds.map((heroId) => row(world.heroes, heroId, 'heroes'));
  const guild = row<Guild>(world.guilds, party.guildId, 'guilds');
  const state = streamOf(world, 'quests');
  const sequence = sequenceFor(world, quest, deps);
  const kit = kitOf(world, party, deps.content);

  const working: Working = {
    alive: [...heroes],
    injuries: [],
    deaths: [],
    xpFactor: 1,
    wealthFactor: 1,
    fameDelta: 0,
    moraleDelta: 0,
    regardDelta: 0,
  };
  const encounters: EncounterResult[] = [];
  const synergyKeys = new Set<SynergyKey>();
  for (const [index, encounter] of sequence.entries()) {
    if (working.alive.length === 0) break;
    // The Synergies the Check adds, from the same members: recorded for the Quest, not the Encounter.
    for (const synergy of synergiesOn(working.alive, encounter, deps.content)) synergyKeys.add(synergy.key);
    // M5-S3: a bonus the Party carries adds to the Check; a reroll it carries rolls a failure again, once.
    const bonus = kit.bonus(encounter.kind, index);
    let result = check(working.alive, encounter, quest, world, deps, bonus);
    if (result.outcome === 'failure' && kit.reroll(encounter.kind, index, result.roll)) {
      result = check(working.alive, encounter, quest, world, deps, bonus);
    }
    const harm: Harm = { injured: [], died: [] };
    for (const consequence of encounter.consequences[result.outcome]) {
      apply(consequence, working, harm, state, guild, deps);
    }
    encounters.push({
      index,
      encounterKey: encounter.key,
      kind: encounter.kind,
      roll: result.roll,
      target: result.target,
      margin: result.margin,
      outcome: result.outcome,
      ...harm,
    });
  }
  // M5-S3: the heals the Party carries shorten the Injuries it comes home with.
  kit.heal(working.injuries);

  const successes = encounters.filter((result) => result.outcome === 'success').length;
  const band = questBand(successes, sequence.length, config);
  const succeeded = band !== 'fail';
  const xp = quest.difficulty * config.xpPerDifficultyPoint * config.xpBandFactor[band] * working.xpFactor;
  return {
    outcome: {
      band,
      successes,
      encounterCount: sequence.length,
      wealthDelta: succeeded ? Math.round(quest.reward * working.wealthFactor) : 0,
      // `0 -` rather than unary minus: a Fame effect of 0 then loses 0, not −0, which is not JSON-safe.
      fameDelta: (succeeded ? quest.fameEffect : 0 - quest.fameEffect) + working.fameDelta,
      xpPerHero: Math.floor(xp),
      moraleDelta: working.moraleDelta,
      regardDelta: working.regardDelta,
      injuries: working.injuries,
      deaths: working.deaths,
      synergyKeys: [...synergyKeys].sort(compareByCodeUnit),
    },
    encounters,
    consumables: kit.used,
  };
}

/** Who one Encounter's consequences hurt. */
type Harm = Pick<EncounterResult, 'injured' | 'died'>;

/**
 * Applies one consequence to the working outcome, recording in `harm` whom it injured or killed, and
 * taking its draws whether or not it lands.
 */
function apply(consequence: Consequence, working: Working, harm: Harm, state: Stream, guild: Guild, deps: CheckDeps): void {
  const { config, content } = deps;
  switch (consequence.kind) {
    case 'injury': {
      const type = Object.hasOwn(content.injuries, consequence.typeKey) ? content.injuries[consequence.typeKey] : undefined;
      if (type === undefined) throw new RangeError(`Content defines no Injury type ${JSON.stringify(consequence.typeKey)}`);
      const factors = config.infirmaryHealFactor;
      const factor = factors[Math.min(Math.max(0, guild.hall.infirmary), factors.length - 1)] ?? 1;
      for (let time = 0; time < consequence.count; time += 1) {
        const lands = chance(state, consequence.chance);
        const unhurt = working.alive.filter((hero) => !working.injuries.some((injury) => injury.heroId === hero.id));
        const hurt = unhurt[int(state, 0, Math.max(0, unhurt.length - 1))];
        const days = int(state, type.healDaysMin, type.healDaysMax);
        if (lands && hurt !== undefined) {
          working.injuries.push({ heroId: hurt.id, typeKey: type.key, healDays: Math.max(1, Math.round(days * factor)) });
          harm.injured.push(hurt.id);
        }
      }
      return;
    }
    case 'death': {
      const lands = chance(state, consequence.chance);
      const dead = working.alive[int(state, 0, Math.max(0, working.alive.length - 1))];
      if (lands && dead !== undefined) {
        working.deaths.push(dead.id);
        working.alive = working.alive.filter((hero) => hero.id !== dead.id);
        working.injuries = working.injuries.filter((injury) => injury.heroId !== dead.id);
        harm.died.push(dead.id);
      }
      return;
    }
    case 'morale':
      working.moraleDelta += consequence.delta;
      return;
    case 'regard':
      working.regardDelta += consequence.delta;
      return;
    case 'xp':
      working.xpFactor *= consequence.factor;
      return;
    case 'wealth':
      working.wealthFactor *= consequence.factor;
      return;
    case 'fame':
      working.fameDelta += consequence.delta;
      return;
  }
}

/** The row `id` names in `rows`, which must be there. */
function row<Row>(rows: Readonly<Record<string, Row>>, id: string, table: string): Row {
  const found = Object.hasOwn(rows, id) ? rows[id] : undefined;
  if (found === undefined) throw new RangeError(`${id} is not in world.${table}`);
  return found;
}
