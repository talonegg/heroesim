// The Quest Engine (M4-S2, approach §1, R24, DL-42): a Quest resolves as its sequence of typed
// Encounters, each one to four Checks (check.ts) combined by its pass formula into a Degree
// (v1.1.4-S2, degree.ts), with typed consequences by Degree (content-types.ts, `Consequence`).
// For each Encounter in order the Party's living members are checked, and the consequences of its
// Degree are applied to a working outcome: an Injury or a Death drawn, Morale, Regard and Fame
// summed, XP and Wealth factors multiplied. A Hero who dies takes no part in the rest of the
// sequence, and a Party with no one left stops. The Quest's band is read from the share of its
// Encounters at Success or better (`bandBySuccessShare`) and the share of Triumphs
// (`strongTriumphShare`), so M2's Wealth and Fame rules and M3's XP rule still apply through it
// (DL-29 item 4, DL-36 item 5), each then moved by the consequences. The outcome names the
// Synergies that added to any Check (M4-S3, DL-45), once for the Quest.
//
// Every draw is from the `quests` stream, except the sequence of a Quest generated before M4, which
// is drawn from `encounters` (`sequenceFor`). The draws are one for each Check, in the order the
// Encounter lists them, whether or not the formula is already decided (DL-148 item 7), then for
// each of its Degree's consequences in order: an Injury three per `count` (whether it lands, on
// whom, its Days), a Death two (whether, on whom); taken whether or not they land, so tuning a
// chance never shifts a later draw, as `chance` promises for one (rng.ts).
// After the sequence, Loot's two draws for a Quest with a Loot table, whatever the band (M5-S5,
// loot.ts, DL-52).
//
// The consumables the Party carries (M5-S3, DL-50, consumables.ts) add a bonus to every Check of an
// Encounter (DL-148 item 13), roll the Checks of a failed Encounter again, and shorten the Injuries
// once the sequence is over. Only a reroll draws: one more from `quests` for each Check that fell
// short of Success, in the order listed, straight after the Encounter's Checks, so a Party carrying
// none draws as above. The Items used are returned beside the outcome, for `questsConclude` to
// expend.
//
// It reads the World State and changes nothing but the streams: applying the outcome is the night
// phase `questsConclude`'s. Rivals' Parties resolve through it exactly as the player's do
// (ADR-0002 as amended by pre-M0 review A1).

import { configProblems, type GameConfig, type QuestBand } from '../config.js';
import type { CheckKey, Consequence, Degree, Encounter, EncounterKey, EncounterKind, InjuryTypeKey, SynergyKey } from '../content-types.js';
import { compareByCodeUnit, type Guild, type Hero, type HeroId, type Party, type Quest, type World } from '../document.js';
import { streamOf, type Stream } from '../generators/draw.js';
import { healDays } from '../injuries.js';
import { chance, int } from '../rng.js';
import { healFactor } from '../selectors.js';
import { check, type CheckDeps, type CheckResult, type EncounterOutcome } from './check.js';
import { kitOf, type ConsumableUse } from './consumables.js';
import { passDegree, passOf, succeeded } from './degree.js';
import { sequenceFor } from './encounters.js';
import { drawLoot, type LootDraw } from './loot.js';
import { queryParty } from './query.js';
import { synergiesOn } from './synergy.js';

/** An Injury the outcome inflicts: its type and the Days it takes to heal, the infirmary applied. */
export interface QuestInjury {
  heroId: HeroId;
  typeKey: InjuryTypeKey;
  healDays: number;
}

/** One Check of an Encounter, rolled (v1.1.4-S2): its key, then `CheckResult`'s numbers and its Degree. */
export interface CheckRoll {
  key: CheckKey;
  capability: number;
  roll: number;
  target: number;
  margin: number;
  degree: Degree;
}

/** One Encounter of the sequence, checked: what `quest.encounter` records. */
export interface EncounterResult {
  /** Its place in the sequence, from 0. */
  index: number;
  encounterKey: EncounterKey;
  kind: EncounterKind;
  /** The deciding Check's roll, target and margin (v1.1.4-S2), as an Encounter's one Check's were. */
  roll: number;
  target: number;
  margin: number;
  /** `success` at a Success or a Triumph, else `failure`: the Degree as an entry before v1.1.4 has it. */
  outcome: EncounterOutcome;
  /** The Encounter's Degree, by its pass formula (v1.1.4-S2, `passDegree`). */
  degree: Degree;
  /** The Check that set the Degree. */
  decidedBy: CheckKey;
  /** Each Check, in the order the Encounter lists them; a reroll's rolls in place of the first. */
  checks: CheckRoll[];
  /** The Heroes its consequences injured, in the order they were. */
  injured: HeroId[];
  /** The Heroes its consequences killed. */
  died: HeroId[];
}

/** What a Quest's resolution comes to (DL-29's outcome, its score and ratio now the Encounters'). */
export interface QuestOutcome {
  band: QuestBand;
  /** Encounters at Success or better: whose Check succeeded, before v1.1.4-S2. */
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
  /** The Loot the outcome leaves, drawn last (M5-S5, loot.ts, DL-52); `null` for none. */
  loot: LootDraw | null;
}

/**
 * The band `successes` of `encounterCount` Encounters at Success or better, `triumphs` of them
 * Triumphs, come to (M4-S2, v1.1.4-S2): `strong` when their share is at least `strongAtLeast` and the
 * Triumphs' at least `strongTriumphShare`, `success` when it is above `successAbove`, else `fail`.
 * No Encounters is a share of 0.
 */
export function questBand(
  successes: number,
  triumphs: number,
  encounterCount: number,
  config: Pick<GameConfig, 'bandBySuccessShare' | 'strongTriumphShare'>,
): QuestBand {
  const share = encounterCount > 0 ? successes / encounterCount : 0;
  const triumphShare = encounterCount > 0 ? triumphs / encounterCount : 0;
  const { successAbove, strongAtLeast } = config.bandBySuccessShare;
  if (share >= strongAtLeast && triumphShare >= config.strongTriumphShare) return 'strong';
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
 * each Encounter in order, each of its Checks of the members still alive, then the consequences of
 * its Degree (v1.1.4-S2) applied in the order content lists them. The band follows the shares at
 * Success or better and of Triumphs (`questBand`); the Wealth is the reward times the wealth factors, rounded, on a success and
 * nothing on a failure; the Fame the Fame effect, won or lost by the band, plus the Encounters'; the
 * XP the difficulty × `xpPerDifficultyPoint` × the band's `xpBandFactor` × the XP factors, rounded
 * down. An Injury's Days are drawn from its type's range and multiplied by `infirmaryHealFactor` at
 * the Guild's infirmary grade now (`healFactor`, DL-53), rounded to the nearest Day and at least 1
 * (INPUTS 4.5). The consumables the Party carries add to each Check, roll a failed Encounter's again,
 * and then shorten the Injuries (M5-S3, DL-50, `kitOf`); the Items used are the resolution's `consumables`.
 *
 * Changes nothing but the streams. Throws on a programming error: a Hero or Guild not in the world, a
 * configuration whose Degrees are unsound (`configProblems`), a difficulty that is not above 0, an
 * Encounter with no Check, or with several and no pass formula, or a formula naming a Check it
 * lacks, an Injury type content lacks, or a world without the `quests` stream.
 */
export function resolveQuest(world: World, quest: Quest, party: Party, deps: CheckDeps): Resolution {
  const { config } = deps;
  const [problem] = configProblems(config);
  if (problem !== undefined) throw new RangeError(`The Quest Engine's configuration: ${problem}`);
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
    // v1.1.4-S1: the members as the Queries read them on this Encounter, their effective Stats read once.
    const hurt = new Set(working.injuries.map((injury) => injury.heroId));
    const party = queryParty(working.alive, world, deps, hurt);
    // The Synergies the Check adds, from the same members: recorded for the Quest, not the Encounter.
    for (const synergy of synergiesOn(party, encounter, deps.content)) synergyKeys.add(synergy.key);
    if (encounter.checks.length === 0) throw new RangeError(`Encounter ${JSON.stringify(encounter.key)} has no Check`);
    const pass = passOf(encounter);
    // v1.1.4-S2: every Check rolled, one draw each in the order listed, the bonus the Party carries
    // added to each (M5-S3, DL-148 item 13); a reroll it carries rolls again each Check of a failed
    // Encounter that fell short of Success, once, and the new rolls stand.
    const bonus = kit.bonus(encounter.kind, index);
    let results = encounter.checks.map((it) => check(party, encounter, it, quest, world, deps, bonus));
    let decided = passDegree(pass, degreesOf(encounter, results));
    if (!succeeded(decided.degree) && kit.reroll(encounter.kind, index, rollOf(encounter, results, decided.decidedBy).roll)) {
      results = encounter.checks.map((it, at) => {
        const first = results[at] as CheckResult;
        return succeeded(first.degree) ? first : check(party, encounter, it, quest, world, deps, bonus);
      });
      decided = passDegree(pass, degreesOf(encounter, results));
    }
    const harm: Harm = { injured: [], died: [] };
    for (const consequence of consequencesOf(encounter, decided.degree)) {
      apply(consequence, working, harm, state, guild, deps);
    }
    const deciding = rollOf(encounter, results, decided.decidedBy);
    encounters.push({
      index,
      encounterKey: encounter.key,
      kind: encounter.kind,
      roll: deciding.roll,
      target: deciding.target,
      margin: deciding.margin,
      outcome: deciding.outcome,
      degree: decided.degree,
      decidedBy: decided.decidedBy,
      checks: encounter.checks.map(({ key }, at) => {
        const { capability, roll, target, margin, degree } = results[at] as CheckResult;
        return { key, capability, roll, target, margin, degree };
      }),
      ...harm,
    });
  }
  // M5-S3: the heals the Party carries shorten the Injuries it comes home with.
  kit.heal(working.injuries);

  const successes = encounters.filter((result) => succeeded(result.degree)).length;
  const triumphs = encounters.filter((result) => result.degree === 'triumph').length;
  const band = questBand(successes, triumphs, sequence.length, config);
  const paid = band !== 'fail';
  const xp = quest.difficulty * config.xpPerDifficultyPoint * config.xpBandFactor[band] * working.xpFactor;
  return {
    outcome: {
      band,
      successes,
      encounterCount: sequence.length,
      wealthDelta: paid ? Math.round(quest.reward * working.wealthFactor) : 0,
      // `0 -` rather than unary minus: a Fame effect of 0 then loses 0, not −0, which is not JSON-safe.
      fameDelta: (paid ? quest.fameEffect : 0 - quest.fameEffect) + working.fameDelta,
      xpPerHero: Math.floor(xp),
      moraleDelta: working.moraleDelta,
      regardDelta: working.regardDelta,
      injuries: working.injuries,
      deaths: working.deaths,
      synergyKeys: [...synergyKeys].sort(compareByCodeUnit),
    },
    encounters,
    consumables: kit.used,
    loot: drawLoot(world, quest, band, deps), // M5-S5: Loot, the sequence's last draws (loot.ts, DL-52)
  };
}

/** Each of `encounter`'s Checks' Degrees in `results`, by its key. */
function degreesOf(encounter: Pick<Encounter, 'checks'>, results: readonly CheckResult[]): Record<CheckKey, Degree> {
  return Object.fromEntries(encounter.checks.map(({ key }, at) => [key, (results[at] as CheckResult).degree]));
}

/** The result in `results` of `encounter`'s Check `key`. */
function rollOf(encounter: Pick<Encounter, 'checks'>, results: readonly CheckResult[], key: CheckKey): CheckResult {
  return results[encounter.checks.findIndex((it) => it.key === key)] as CheckResult;
}

/**
 * The consequences of `encounter` at `degree` (v1.1.4-S2): a Triumph's own list, or else
 * Success's; a Setback's own, or else Failure's.
 */
function consequencesOf({ consequences }: Pick<Encounter, 'consequences'>, degree: Degree): Consequence[] {
  switch (degree) {
    case 'triumph':
      return consequences.triumph ?? consequences.success;
    case 'success':
      return consequences.success;
    case 'setback':
      return consequences.setback ?? consequences.failure;
    case 'failure':
      return consequences.failure;
  }
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
      const factor = healFactor(guild, config);
      for (let time = 0; time < consequence.count; time += 1) {
        const lands = chance(state, consequence.chance);
        const unhurt = working.alive.filter((hero) => !working.injuries.some((injury) => injury.heroId === hero.id));
        const hurt = unhurt[int(state, 0, Math.max(0, unhurt.length - 1))];
        const days = int(state, type.healDaysMin, type.healDaysMax);
        if (lands && hurt !== undefined) {
          working.injuries.push({ heroId: hurt.id, typeKey: type.key, healDays: healDays(days, factor) });
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
