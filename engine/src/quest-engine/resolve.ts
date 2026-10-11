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
// Every draw is from the `quests` stream, except the sequence of a Quest whose Encounters content no
// longer defines (data-model rule 5), which is drawn from `encounters` (`sequenceFor`). The draws are one for each Check, in the order the
// Encounter lists them, whether or not the formula is already decided (DL-148 item 7), then for
// each of its Degree's consequences in order: an Injury three per `count` (whether it lands, on
// whom, its Days), a Death two (whether, on whom); taken whether or not they land, so tuning a
// chance never shifts a later draw, as `chance` promises for one (rng.ts).
//
// Harm reads the Stats (v1.1.4-S4, DL-148 item 14). Who an Injury or a Death falls on, whether it
// lands, and each Hero's share of a Morale loss `steadiedBy` some Stats are harm.ts's (`strike`,
// `moraleOf`; v1.1.6-S9, DL-186 item 4): this file asks, then applies. An Injury falls on the unhurt
// living Heroes, a Death on the living Party, of them those its `among` names (v1.1.5-S4, DL-178), by
// exposure and guard; so each Hero's Morale on the Quest, and what they bring home (`moraleByHero`),
// is their own.
// Heroes earn Traits (v1.1.4-S7, DL-148 item 25, DL-150 item 5): a `trait` consequence takes two
// draws in its place, whether it lands and on whom, whether or not it lands, before Loot's; who it
// falls on is harm.ts's (`chooseEarner`). A positive Trait, on a Triumph's list, falls among the Party
// still in the sequence and is held until the band is known, granted only on a strong success; a
// negative one, on a Failure's, falls only among the Heroes the same Encounter injured, and stands in
// the place of a positive one its Hero drew (DL-159's verification). The Traits are the resolution's
// `traits`, for `questsConclude` to grant, at most one a Hero, a Hero who died taking none.
// After the sequence, Loot's two draws for a Quest with a Loot table, whatever the band (M5-S5,
// loot.ts, DL-52), and whatever its Finale did: a Quest ending with its template's Finale has Loot
// only if the Finale ended a Triumph (v1.1.4-S8, DL-148 item 23).
//
// Each Hero brings their form to the Checks (v1.1.4-S3, form.ts): Morale's factor, a line through the
// baseline (DL-283) read at their Morale on the Quest, their Morale as they set out plus the Morale
// consequences applied so far, held to the scale; and less once they are hurt on the Quest. Their stored Morale
// still changes only on the return (`questsConclude`). Form draws nothing. An Encounter says form
// decided it (`formDecided`) only when, with every form at 1 and the same rolls, its pass formula
// would have put it on the other side of the Success line (v1.1.4-S3's verification).
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

import type { GameConfig, QuestBand } from '../config.js';
import type {
  CheckKey,
  Consequence,
  Degree,
  Encounter,
  EncounterKey,
  EncounterKind,
  InjuryTypeKey,
  PassFormula,
  SynergyKey,
  TraitKey,
} from '../content-types.js';
import {
  compareByCodeUnit,
  requireRow,
  rowOf,
  type Guild,
  type Hero,
  type HeroId,
  type Party,
  type Quest,
  type World,
} from '../document.js';
import { streamOf, type Stream } from '../generators/draw.js';
import { healDays } from '../injuries.js';
import { int } from '../rng.js';
import { healFactor } from '../selectors.js';
import { check, type CheckDeps, type CheckResult, type EncounterOutcome, type FormDecided } from './check.js';
import { kitOf, type ConsumableUse } from './consumables.js';
import { passDegree, passOf, succeeded } from './degree.js';
import { endsWithFinale, sequenceFor } from './encounters.js';
import { chooseEarner, moraleOf, strike, type Candidates } from './harm.js';
import { drawLoot, type FinaleOutcome, type LootDraw } from './loot.js';
import { queryParty, type OnQuest, type QueryParty } from './query.js';
import { synergiesOn } from './synergy.js';
import { deathScaleOf, scaledDeathChance, tierFigures } from '../tiers.js';

/** An Injury the outcome inflicts: its type and the Days it takes to heal, the infirmary applied. */
export interface QuestInjury {
  heroId: HeroId;
  typeKey: InjuryTypeKey;
  healDays: number;
}

/**
 * One Check of an Encounter, rolled (v1.1.4-S2): its key, then `CheckResult`'s numbers and its Degree,
 * and, only when form decided its Degree, which way (v1.1.4-S3).
 */
export interface CheckRoll {
  key: CheckKey;
  capability: number;
  roll: number;
  target: number;
  margin: number;
  degree: Degree;
  formDecided?: FormDecided;
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
  /**
   * Set when form decided whether the Encounter succeeded (v1.1.4-S3): with every form at 1 and the
   * same rolls, its pass formula would have given the other side of the Success line. `raised` when
   * it succeeded by form, `lowered` when it failed by it. Absent otherwise.
   */
  formDecided?: FormDecided;
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
  /** Encounters at Success or better (DL-152). */
  successes: number;
  /** Encounters in the sequence, those a Party wiped out never reached included. */
  encounterCount: number;
  /** Wealth to the Guild: the reward times the Encounters' wealth factors on a success, nothing on a failure. */
  wealthDelta: number;
  /** Fame to the Guild: the Fame effect, gained on a success and lost on a failure, plus the Encounters' Fame. */
  fameDelta: number;
  /**
   * XP to each Hero who comes home alive: M3-S2's by band, times the Encounters' XP factors, split
   * across the Party sent and rounded down (v1.1.5-S13, DL-182). A Hero who dies counts in the split
   * and takes nothing, so their share is lost.
   */
  xpPerHero: number;
  /**
   * The Encounters' Morale consequences as written, summed; 0 moves no one. What each Hero brings
   * home is `moraleByHero`'s, which differs from this only by a loss `steadiedBy` their Stats.
   */
  moraleDelta: number;
  /**
   * Morale to each Hero who comes home alive, by id in Party order (v1.1.4-S4, DL-148 item 14): the
   * Encounters' Morale consequences summed, each loss `steadiedBy` some Stats times their guard, and
   * the total rounded once to a whole number (v1.1.4-S4's verification). 0 moves them not at all.
   */
  moraleByHero: Record<HeroId, number>;
  /** Regard between every pair of the Party, summed over the Encounters and applied (DL-46). */
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

/**
 * A Trait a Hero earned on the Quest (v1.1.4-S7, DL-148 item 25): the Hero, the Hero Trait, and the
 * Encounter whose consequence gave it, by its place in the sequence and its key.
 */
export interface EarnedTrait {
  heroId: HeroId;
  traitKey: TraitKey;
  encounterIndex: number;
  encounterKey: EncounterKey;
}

/** A Quest resolved: its outcome, and each Encounter checked, in sequence order. */
export interface Resolution {
  outcome: QuestOutcome;
  encounters: EncounterResult[];
  /**
   * The Traits Heroes earned (v1.1.4-S7), in the order drawn, at most one a Hero: a positive one only
   * on a strong success and only to a Hero who gained no negative one, and none for a Hero who died.
   * For `questsConclude` to grant.
   */
  traits: EarnedTrait[];
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
  /**
   * Each Hero's own Morale consequences so far, by id (v1.1.4-S4): `moraleDelta`'s, a loss steadied
   * for some. Not rounded until the outcome, so that small steadied losses add up, and their Morale on
   * the Quest reads it as it is.
   */
  moraleByHero: Record<HeroId, number>;
  regardDelta: number;
  /** The Traits drawn so far (v1.1.4-S7), each a positive one held for the band or a negative one. */
  earned: (EarnedTrait & { positive: boolean })[];
}

/**
 * Resolves `party`'s attempt at `quest` (M4-S2) through its Encounter sequence (`sequenceFor`): for
 * each Encounter in order, each of its Checks of the members still alive, then the consequences of
 * its Degree (v1.1.4-S2) applied in the order content lists them. The band follows the shares at
 * Success or better and of Triumphs (`questBand`); the Wealth is the reward times the wealth factors, rounded, on a success and
 * nothing on a failure; the Fame the Fame effect, won or lost by the band, plus the Encounters'; the
 * XP the difficulty × `xpPerDifficultyPoint` × the band's `xpBandFactor` × its Tier's `xpFactor`
 * (`tierFigures`, DL-262) × the Encounters' XP factors, divided by
 * the size of the Party sent, its Dead counted, and rounded down: each Hero who comes home takes that
 * share (v1.1.5-S13, DL-182). An Injury's Days are drawn from its type's range and multiplied by `infirmaryHealFactor` at
 * the Guild's infirmary grade now (`healFactor`, DL-53), rounded to the nearest Day and at least 1
 * (INPUTS 4.5). The consumables the Party carries add to each Check, roll a failed Encounter's again,
 * and then shorten the Injuries (M5-S3, DL-50, `kitOf`); the Items used are the resolution's `consumables`.
 *
 * Changes nothing but the streams. Throws on a programming error: a Hero or Guild not in the world, a
 * difficulty that is not above 0, an Encounter with no Check, or with several and no pass formula, or a formula naming a Check it
 * lacks, an Injury type content lacks, or a world without the `quests` stream.
 */
export function resolveQuest(world: World, quest: Quest, party: Party, deps: CheckDeps): Resolution {
  const { config } = deps;
  if (!(quest.difficulty > 0)) throw new RangeError(`${quest.id} has difficulty ${quest.difficulty}; it is above 0`);
  const heroes = party.heroIds.map((heroId) => requireRow(world.heroes, heroId, 'heroes'));
  const guild = requireRow<Guild>(world.guilds, party.guildId, 'guilds');
  const state = streamOf(world, 'quests');
  const sequence = sequenceFor(world, quest, deps);
  const kit = kitOf(world, party, deps.content);
  const deathScale = deathScaleOf(quest, deps.content, config);

  const working: Working = {
    alive: [...heroes],
    injuries: [],
    deaths: [],
    xpFactor: 1,
    wealthFactor: 1,
    fameDelta: 0,
    moraleDelta: 0,
    moraleByHero: Object.fromEntries(heroes.map((hero) => [hero.id, 0])),
    regardDelta: 0,
    earned: [],
  };
  const encounters: EncounterResult[] = [];
  const synergyKeys = new Set<SynergyKey>();
  for (const [index, encounter] of sequence.entries()) {
    if (working.alive.length === 0) break;
    // The members as the Queries read them on this Encounter (DL-151): their effective Stats read
    // once, their Morale on the Quest and their form from the harm so far (DL-154), and each Hero's
    // own Morale consequences (DL-155).
    const party = queryParty(working.alive, world, deps, onQuestOf(working));
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
    const applying: Applying = { state, guild, world, encounterIndex: index, encounterKey: encounter.key, degree: decided.degree, deathScale };
    for (const consequence of consequencesOf(encounter, decided.degree)) {
      apply(consequence, working, harm, applying, deps);
    }
    const deciding = rollOf(encounter, results, decided.decidedBy);
    const formDecided = formDecidedOf(encounter, pass, results, decided.degree);
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
      ...(formDecided === undefined ? {} : { formDecided }),
      checks: encounter.checks.map(({ key }, at) => {
        const { capability, roll, target, margin, degree, formDecided } = results[at] as CheckResult;
        return { key, capability, roll, target, margin, degree, ...(formDecided === undefined ? {} : { formDecided }) };
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
  // v1.1.4-S7: a positive Trait held for a strong success, unless its Hero gained a negative one; none for a Hero who died.
  const marked = new Set(working.earned.filter((it) => !it.positive).map((it) => it.heroId));
  const traits = working.earned
    .filter((it) => (!it.positive || (band === 'strong' && !marked.has(it.heroId))) && !working.deaths.includes(it.heroId))
    .map(({ heroId, traitKey, encounterIndex, encounterKey }) => ({ heroId, traitKey, encounterIndex, encounterKey }));
  // The Tier's XP factor, read from the template and the game's config as it resolves (DL-262).
  const tierXp = tierFigures(rowOf(deps.content.questTemplates, quest.templateKey), quest.tier, config).xpFactor;
  const xp = quest.difficulty * config.xpPerDifficultyPoint * config.xpBandFactor[band] * tierXp * working.xpFactor;
  return {
    outcome: {
      band,
      successes,
      encounterCount: sequence.length,
      wealthDelta: paid ? Math.round(quest.reward * working.wealthFactor) : 0,
      // `0 -` rather than unary minus: a Fame effect of 0 then loses 0, not −0, which is not JSON-safe.
      fameDelta: (paid ? quest.fameEffect : 0 - quest.fameEffect) + working.fameDelta,
      // v1.1.5-S13 (DL-182 item 1): split across the Party sent, its Dead counted, so a dead Hero's share is lost.
      // A Party of no one, which the estimate's test resolves, takes 0, not Infinity, which is not JSON-safe.
      xpPerHero: heroes.length === 0 ? 0 : Math.floor(xp / heroes.length),
      moraleDelta: working.moraleDelta,
      moraleByHero: Object.fromEntries(working.alive.map((hero) => [hero.id, whole(working.moraleByHero[hero.id] ?? 0)])),
      regardDelta: working.regardDelta,
      injuries: working.injuries,
      deaths: working.deaths,
      synergyKeys: [...synergyKeys].sort(compareByCodeUnit),
    },
    encounters,
    traits,
    consumables: kit.used,
    // M5-S5: Loot, the sequence's last draws (loot.ts, DL-52), needing its Finale at a Degree in `lootOnFinaleDegrees` (v1.1.4-S8, DL-202).
    loot: drawLoot(world, quest, band, deps, finaleOf(quest, sequence, encounters, deps)),
  };
}

/**
 * How `quest`'s Finale went (v1.1.4-S8): `none` when its `sequence` does not end with its template's
 * Finale (`endsWithFinale`); else the Degree the last of `results` ended at, or `unmet` when the
 * Party fell before it.
 */
function finaleOf(quest: Quest, sequence: readonly Encounter[], results: readonly EncounterResult[], deps: CheckDeps): FinaleOutcome {
  if (!endsWithFinale(quest.templateKey, sequence, deps.content)) return 'none';
  const last = results.at(-1);
  return last !== undefined && last.index === sequence.length - 1 ? last.degree : 'unmet';
}

/** Each of `encounter`'s Checks' Degrees in `results`, by its key. */
function degreesOf(encounter: Pick<Encounter, 'checks'>, results: readonly CheckResult[]): Record<CheckKey, Degree> {
  return Object.fromEntries(encounter.checks.map(({ key }, at) => [key, (results[at] as CheckResult).degree]));
}

/**
 * Whether form decided whether `encounter` succeeded, at `degree` by `pass` (v1.1.4-S3's
 * verification): its Degree read again with every form at 1 and the same rolls. A Check form raised
 * across the Success line was below it, one it lowered at or above it, and every other on its own
 * side. Whether a formula of `and`, `or` and `at-least` succeeds hangs only on which of its Checks
 * did, so a Failure and a Success stand for each.
 */
function formDecidedOf(
  encounter: Pick<Encounter, 'checks'>,
  pass: PassFormula,
  results: readonly CheckResult[],
  degree: Degree,
): FormDecided | undefined {
  if (!results.some((result) => result.formDecided !== undefined)) return undefined;
  const atOne = Object.fromEntries(
    encounter.checks.map(({ key }, at): [CheckKey, Degree] => {
      const { formDecided, degree: rolled } = results[at] as CheckResult;
      return [key, formDecided === 'raised' ? 'failure' : formDecided === 'lowered' ? 'success' : rolled];
    }),
  );
  if (succeeded(passDegree(pass, atOne).degree) === succeeded(degree)) return undefined;
  return succeeded(degree) ? 'raised' : 'lowered';
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

/** Where a consequence is applied: the `quests` stream, the Party's Guild and the world, and the Encounter and its Degree. */
interface Applying {
  state: Stream;
  guild: Guild;
  world: World;
  encounterIndex: number;
  encounterKey: EncounterKey;
  degree: Degree;
  /** What a Death's chance is multiplied by on this Quest: `deathFactor` × its Tier's `deathScale` (`deathScaleOf`, DL-265). */
  deathScale: number;
}

/** What has happened to the Party so far, as the Queries read it: who is hurt, and each Hero's Morale. */
function onQuestOf(working: Working): OnQuest {
  return { hurt: new Set(working.injuries.map((injury) => injury.heroId)), moraleByHero: working.moraleByHero };
}

/**
 * Applies one consequence to the working outcome, recording in `harm` whom it injured or killed, and
 * taking its draws whether or not it lands.
 */
function apply(consequence: Consequence, working: Working, harm: Harm, at: Applying, deps: CheckDeps): void {
  const { config, content } = deps;
  const { state } = at;
  switch (consequence.kind) {
    case 'injury': {
      const type = rowOf(content.injuries, consequence.typeKey);
      if (type === undefined) throw new RangeError(`Content defines no Injury type ${JSON.stringify(consequence.typeKey)}`);
      const factor = healFactor(at.guild, config);
      for (let time = 0; time < consequence.count; time += 1) {
        // Whether it lands and on whom, two draws (harm.ts), then its Days, a third, whether or not it lands.
        const hurt = strike(consequence, candidatesOf(working, harm), () => partyNow(working, at, deps), state, deps);
        const days = int(state, type.healDaysMin, type.healDaysMax);
        if (hurt !== undefined) {
          working.injuries.push({ heroId: hurt.id, typeKey: type.key, healDays: healDays(days, factor) });
          harm.injured.push(hurt.id);
        }
      }
      return;
    }
    case 'death': {
      // The chance times the Quest's Death scale, held at 1, before the Hero's guard (DL-265); a scale
      // of 0 kills no one, its two draws taken all the same, so the Tier never shifts a later draw.
      const scaled = { ...consequence, chance: scaledDeathChance(consequence.chance, at.deathScale) };
      const dead = strike(scaled, candidatesOf(working, harm), () => partyNow(working, at, deps), state, deps);
      if (dead !== undefined) {
        working.deaths.push(dead.id);
        working.alive = working.alive.filter((hero) => hero.id !== dead.id);
        working.injuries = working.injuries.filter((injury) => injury.heroId !== dead.id);
        harm.died.push(dead.id);
      }
      return;
    }
    case 'morale': {
      working.moraleDelta += consequence.delta;
      // v1.1.4-S4: a loss steadied by some Stats is each Hero's own, times their guard; a gain is as written.
      for (const [heroId, own] of moraleOf(consequence, working.alive, () => partyNow(working, at, deps), deps)) {
        working.moraleByHero[heroId] = (working.moraleByHero[heroId] ?? 0) + own;
      }
      return;
    }
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
    case 'trait': {
      // v1.1.4-S7: whether it lands and on whom, two draws whether or not it does (harm.ts).
      const earner = chooseEarner(consequence, at.degree, candidatesOf(working, harm), working.earned, () => partyNow(working, at, deps), state, deps);
      if (earner !== undefined) {
        const { encounterIndex, encounterKey } = at;
        working.earned.push({ heroId: earner.hero.id, traitKey: consequence.traitKey, encounterIndex, encounterKey, positive: earner.positive });
      }
      return;
    }
  }
}

/** A Hero's Morale from the Quest, rounded to a whole number, and never −0, which is not JSON-safe. */
function whole(delta: number): number {
  return Math.round(delta) + 0;
}

/**
 * Who harm may fall on as `working` and this Encounter's `harm` stand (harm.ts, `Candidates`): the
 * living in Party order, those carrying an Injury from the Quest, and those this Encounter injured.
 */
function candidatesOf(working: Working, harm: Harm): Candidates<Hero> {
  return { living: working.alive, hurt: new Set(working.injuries.map((injury) => injury.heroId)), injuredHere: harm.injured };
}

/** The Party's living members as the Queries read them now, its harm so far applied. */
function partyNow(working: Working, at: Applying, deps: CheckDeps): QueryParty {
  return queryParty(working.alive, at.world, deps, onQuestOf(working));
}
