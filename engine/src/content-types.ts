// The shape of content belongs to the engine, because the engine is what reads it by key
// (ADR-0006). `@heroesim/content` imports these types, and the lists here it checks against, and
// only parses and validates text into them; the engine imports nothing from content (pre-M0 review
// A3 as refined by DL-186 item 6).
//
// M1-S1 defined the keys the World State stores and the content set's identity; M1-S4 the row
// types (`Stat`, `Class`, `Skill`, `Trait`, `Background`, `Sphere`, `Names`) and their tables in
// `ContentSet`; M2-S3 `QuestTemplate`; M2-S5 `InjuryType`; M2-S9 `Disposition`; M3-S6
// `Improvement`; M4-S1 `Encounter`; M4-S3 `Synergy`; M5-S1 `ItemDefinition`; M5-S5 `LootTable`.
// Later milestones add theirs.
//
// Content is read, never written: nothing in the engine mutates a row.

import type { FacilityKey, Sex } from './document.js';

// Content keys. A key names a content row; the World State stores keys, never rows. They are
// plain strings: type safety over them comes from content validation at load, not from the
// compiler (ADR-0006), and a key the current content does not define is kept and warned about
// (data-model rule 5).

export type StatKey = string;
export type ClassKey = string;
export type SkillKey = string;
export type TraitKey = string;
export type BackgroundKey = string;
export type SphereKey = string;

// Keys the World State already has fields for, whose content arrives with a later milestone.

/** A Quest template (M2-S3). */
export type QuestTemplateKey = string;
/**
 * A tag a Quest template carries (M2-S3), and from v1.1.4-S8 an Encounter: an Encounter sharing one
 * with its template is likelier drawn (`encounterTagWeight`).
 */
export type QuestTagKey = string;
/** A type of Injury (M2-S5, `injuries.json`). */
export type InjuryTypeKey = string;
/** A Rival Guild's Disposition: `steady` from M2, `ambitious`, `miserly` and `reckless` from M6-S1. */
export type DispositionKey = string;
/** An Encounter a Quest is drawn with (M4). */
export type EncounterKey = string;
/** A Loot table (M5-S5, `loot-tables.json`). */
export type LootTableKey = string;
/** An Item definition, for unique Items and common stacks alike (M5-S1, `items.json`). */
export type ItemDefinitionKey = string;
/** A tag an Item definition carries (M5-S1): a kebab-case word for display and later rules. */
export type ItemTagKey = string;

/**
 * The gear slots an Item can be made for (M5-S1, INPUTS 7.1): a closed list, as the Encounter kinds
 * are, so content validation refuses a slot no Hero could have. Every Hero has all of them, in this
 * order, the order a front end lists them (DL-193). A new slot is an engine change (DL-48).
 */
export const gearSlotKeys = ['weapon', 'armour', 'trinket'] as const;

/** A gear slot on a Hero: one of `gearSlotKeys` (M5-S1). */
export type SlotKey = (typeof gearSlotKeys)[number];
/** A Hall Improvement, one grade of one facility (M3-S6, `improvements.json`). */
export type ImprovementKey = string;
/** A Synergy, a bonus for a combination of Classes or Skills in a Party (M4-S3, `synergies.json`). */
export type SynergyKey = string;

/** The four areas a Stat belongs to, used for display (R14). */
export type StatArea = 'physical' | 'mental' | 'magical' | 'social';

/** Whose Stat it is. No Stat is both (pre-M0 review D4), so a Stat key names one thing. */
export type StatOwner = 'hero' | 'guildmaster';

/** A Stat (R8, R14; `stats.json`). Values are integers in `[min, max]`. */
export interface Stat {
  key: StatKey;
  name: string;
  area: StatArea;
  min: number;
  max: number;
  /** What a Stat missing from a Hero or Guildmaster reads as (data-model rule 5). */
  default: number;
  owner: StatOwner;
}

/** A Hero's Class (R13; `classes.json`). */
export interface Class {
  key: ClassKey;
  name: string;
  /** The Hero Stats the Class biases at generation (M1-S5) and favours in growth. */
  leadingStats: StatKey[];
  /** The only Skills a Hero of this Class may hold (M1-S5). */
  gatedSkills: SkillKey[];
  /**
   * How a Level's Stat points fall across the Hero Stats (M3-S1): non-negative weights summing
   * to 1 within content validation's tolerance, so a rule draws in proportion to them. A Stat
   * left out gets none.
   */
  growth: Record<StatKey, number>;
}

/** A Skill, rated 1 to 5 on a Hero (R15; `skills.json`). */
export interface Skill {
  key: SkillKey;
  name: string;
}

/**
 * What a Guildmaster Trait does (M4-S5, R8, pre-M0 review B2, DL-43): each effect is one of a closed
 * union, applied inside the one selector that already works its quantity out, for every Guild alike
 * (ADR-0002). A new kind is an engine change and earns a decision-log entry (DL-150 item 8).
 *
 * - `classStatBonus`: `delta` added to the Stat `statKey` of each Hero of the Class `classKey` on
 *   the Guildmaster's Guild, in `effectiveStats`, held inside the Stat's range;
 * - `guildMoraleShift`: `delta` added to the Morale baseline of the Guild's Heroes, in
 *   `moraleBaselineFor`;
 * - `upkeepFactor`: the Guild's Upkeep multiplied by `factor`, in `upkeep`.
 */
export type GuildmasterTraitEffect =
  | { kind: 'classStatBonus'; classKey: ClassKey; statKey: StatKey; delta: number }
  | { kind: 'guildMoraleShift'; delta: number }
  | { kind: 'upkeepFactor'; factor: number };

/** The kinds of `GuildmasterTraitEffect`. */
export type GuildmasterTraitEffectKind = GuildmasterTraitEffect['kind'];

/**
 * What a Hero Trait does (v1.1.4-S7, DL-148 items 24 and 26, DL-150 item 8): a closed union like a
 * Guildmaster Trait's, so a new kind is an engine change.
 *
 * - `statModifiers`: each Hero Stat `modifiers` names moved by its whole number, in `effectiveStats`,
 *   as gear's are (DL-148 item 24), so the change shows wherever a Stat shows. One effect may name
 *   several Stats.
 * - `encounterBonus`: `flat` added to the capability of every Check of an Encounter of one of its
 *   `kinds`, or sharing one of its `tags` (an Encounter's, from v1.1.4-S8), when any Hero still in
 *   the sequence holds the Trait: once for the Party however many hold it (DL-148 item 26), and never
 *   to a raw Check, which is its score alone (DL-152), as a consumable's bonus is not.
 */
export type HeroTraitEffect =
  | { kind: 'statModifiers'; modifiers: Record<StatKey, number> }
  | { kind: 'encounterBonus'; flat: number; kinds?: EncounterKind[]; tags?: string[] };

/** The kinds of `HeroTraitEffect`. */
export type HeroTraitEffectKind = HeroTraitEffect['kind'];

/** An effect of either list's Traits. */
export type TraitEffect = GuildmasterTraitEffect | HeroTraitEffect;

/** The kinds of `TraitEffect`. */
export type TraitEffectKind = TraitEffect['kind'];

/**
 * A Guildmaster Trait (R8; `guildmaster-traits.json`, v1.1.4-S7, DL-150 item 1): a Guildmaster's
 * buff or penalty, chosen at setup or drawn on the budget. Its key is no Hero Trait's.
 */
export interface GuildmasterTrait {
  key: TraitKey;
  name: string;
  /**
   * Its cost against the Trait budget, `guildmasterTraitBudget` (DL-88 item 4, DL-100 item 3): a
   * whole number, positive for a buff and negative for a penalty, which refunds points.
   */
  cost: number;
  /**
   * The Guildmaster Traits a Guildmaster holding this one may not also hold (DL-87 item 5, DL-100
   * item 3). Each exclusion holds both ways: every Trait listed lists this one. Content validation
   * holds both rules.
   */
  excludes: TraitKey[];
  /**
   * What it does, each effect applied in turn (DL-150 item 2): one or more; content holds one each
   * for now.
   */
  effects: GuildmasterTraitEffect[];
}

/**
 * A Hero Trait (R16; `hero-traits.json`, v1.1.4-S7, DL-150 item 1): a Hero's lasting mark, such as
 * the one an Injury leaves. Its key is no Guildmaster Trait's.
 */
export interface HeroTrait {
  key: TraitKey;
  name: string;
  /**
   * The Hero Traits a Hero holding this one may not also hold (DL-150 items 3 and 5), each exclusion
   * both ways, as a Guildmaster Trait's. A Trait an Injury leaves replaces any it excludes; an earned
   * one is never granted beside one it excludes (DL-150 item 5).
   */
  excludes: TraitKey[];
  /** What it does (DL-150 items 2 and 8): none or more, each applied in turn. */
  effects: HeroTraitEffect[];
}

/** A Trait of either list. */
export type Trait = GuildmasterTrait | HeroTrait;

/** Whose Background it is: a Hero's, or the narrative history of a Guild (INPUTS 3.10). */
export type BackgroundOwner = 'hero' | 'guild';

/** A Background: a display name, with no effect in the first build (`backgrounds.json`). */
export interface Background {
  key: BackgroundKey;
  name: string;
  owner: BackgroundOwner;
  /**
   * A Hero Background's Station, the walk of life a Hero of it was born to (v1.1.3-S1, DL-135 item 5):
   * one of `Descriptions.stations`. A Hero's Biography writes from the Background, and a Hero's
   * Portrait prefers a picture of its Station. A Guild Background has none.
   */
  station?: StationKey;
}

/** The walk of life a Patron belongs to (INPUTS 3.8; `spheres.json`). */
export interface Sphere {
  key: SphereKey;
  name: string;
}

/** What a Party must include to take a Quest: a Hero of a Class, a Hero with a Skill, or both. */
export interface QuestTemplateRequires {
  classKey?: ClassKey;
  skillKey?: SkillKey;
}

/**
 * A kind of Quest a Patron offers (R21; `quest-templates.json`, M2-S3). A Patron's templates are
 * the ones whose `sphereKeys` hold the Patron's Sphere, looked up when the Board is drawn and
 * never stored (pre-M0 review D3). The Quest Generator copies what a Quest carries from its
 * template, so a template may change under a live save without altering Quests already offered.
 * Every range is inclusive and drawn with `int`.
 */
export interface QuestTemplate {
  key: QuestTemplateKey;
  name: string;
  /** The Spheres whose Patrons offer it; at least one. */
  sphereKeys: SphereKey[];
  tags: QuestTagKey[];
  /** Drawn inside the config's difficulty scale (`questDifficultyMin/Max`). */
  difficultyMin: number;
  difficultyMax: number;
  durationDaysMin: number;
  durationDaysMax: number;
  /** A Quest's reward is its difficulty times this, rounded to a whole Wealth. */
  rewardPerDifficulty: number;
  /** The Fame a Quest of this kind moves, won or lost (M2-S5). */
  fameEffect: number;
  partySizeMin: number;
  partySizeMax: number;
  /** The Skills that help on this kind of work (R15, pre-M0 review A4). */
  skillKeys: SkillKey[];
  requires: QuestTemplateRequires;
  /**
   * The Loot table a Quest of this kind awards from on a band in `lootOnBands` (M5-S5, INPUTS 7.4,
   * DL-52): a table content defines, chosen by the template's difficulty band, or `null` for none.
   * The Quest Generator copies it onto a Quest only when `difficultyMin` is above
   * `lootDifficultyThreshold`, so the threshold is config's and the table content's.
   */
  lootTableKey: LootTableKey | null;
  /**
   * The kinds of Encounter a Quest of this kind is drawn with (M4-S1): each of its Encounters is
   * of one of these, at least one listed, none twice, and content holding an Encounter of each.
   */
  encounterKinds: EncounterKind[];
  /**
   * How many Encounters a Quest of this kind is drawn with, from `encountersMin` at the bottom of
   * its difficulty range to `encountersMax` at the top (INPUTS 6.1: 2 to 5 by difficulty); each at
   * least 1.
   */
  encountersMin: number;
  encountersMax: number;
  /**
   * Its Finale (v1.1.4-S8, DL-148 items 22 and 23): an Encounter content defines, of any kind, always
   * the last of a Quest's Encounters, in the last of its `encounterCount` places, the places before it
   * drawn as before. An Encounter some template names as its Finale is never drawn into a place. On a
   * Quest with one, Loot also needs the Finale to end a Triumph.
   */
  finale?: EncounterKey;
}

/**
 * The kinds of Encounter (M4-S1): the flavour of a Check, and what a Quest template draws from.
 * `lore`, for Intelligence and Knowledge, riddles, records and clues, from v1.1.4-S8 (DL-148 item 21).
 */
export const encounterKinds = ['combat', 'travel', 'social', 'arcane', 'stealth', 'lore'] as const;

export type EncounterKind = (typeof encounterKinds)[number];

// Queries (v1.1.4-S1, DL-148 items 4 to 6, ADR-0010): how content reads the Party. A Query is a JSON
// array, operator first, of one of five types, each read where its type is expected. A Set is some
// of the Party's Heroes; a Hero one of them, or none; a Val a number read of the current Hero; a Pred
// a fact of the current Hero; a Num a number of the Party. A number is a Val or a Num, as `+`, `-` and
// `*` are, by where they stand. The engine evaluates them by a table of their operators, a row
// each (`quest-engine/query/operators.ts`, v1.1.6-S10); content validation holds their shape, keys
// and size, and where Sex may stand, by the engine's `queryProblems`, which reads the same rows.

/** Some of the Party's Heroes, in Party order: `"party"` is every member still in the sequence. */
export type SetQuery =
  | 'party'
  | ['where', SetQuery, PredQuery]
  | ['top', SetQuery, number, ValQuery]
  | ['bottom', SetQuery, number, ValQuery];

/** One Hero of a Set, the earlier in Party order on a tie; none of an empty Set. */
export type HeroQuery = ['best', SetQuery, ValQuery] | ['worst', SetQuery, ValQuery];

/** A number read of the current Hero: an effective Stat, a Skill's rating, their Level, Morale or age. */
export type ValQuery =
  | number
  | ['stat', StatKey]
  | ['skill', SkillKey]
  | ['level']
  | ['morale']
  | ['age']
  | ['weighted', [statKey: StatKey, weight: number][]]
  | ['+', ...ValQuery[]]
  | ['-', ValQuery, ValQuery]
  | ['*', ...ValQuery[]];

/** How two numbers compare, in a Pred or a Party-level condition. */
export type QueryComparison = '>=' | '>' | '<' | '<=' | '=';

/** A fact of the current Hero. `sex` stands only in a `where` filter (DL-148 item 6). */
export type PredQuery =
  | ['class', ...ClassKey[]]
  | ['background', ...BackgroundKey[]]
  | ['sex', Sex]
  | ['has-skill', SkillKey]
  | ['has-skill', SkillKey, number]
  | ['has-trait', TraitKey]
  | ['hurt']
  | [QueryComparison, ValQuery, ValQuery]
  | ['and', ...PredQuery[]]
  | ['or', ...PredQuery[]]
  | ['not', PredQuery];

/** A number of the Party. Every Num of an empty Set, or of no Hero, is 0. */
export type NumQuery =
  | number
  | ['sum' | 'avg' | 'max' | 'min', SetQuery, ValQuery]
  | ['count', SetQuery]
  | ['ranked', SetQuery, ValQuery, number[]]
  | ['of', HeroQuery, ValQuery]
  | ['+', ...NumQuery[]]
  | ['-', NumQuery, NumQuery]
  | ['*', ...NumQuery[]]
  | ['least', ...NumQuery[]]
  | ['greatest', ...NumQuery[]];

/** A condition on the Party: one Num compared with another, such as `[">=", ["count", "party"], 3]`. */
export type PartyCondition = [QueryComparison, NumQuery, NumQuery];

/** A Check of an Encounter (v1.1.4-S1): its key, unique within its Encounter. */
export type CheckKey = string;

/**
 * One Check of an Encounter (v1.1.4-S1, DL-148 item 7): the Party's capability is its `score`, a
 * Num Query, plus a bonus for the best rating held of each of its `skills`, against its target,
 * `flat` plus `difficultyFactor` times the Quest's difficulty. An Encounter has one to four since
 * v1.1.4-S2, combined by its `pass`.
 */
export interface EncounterCheck {
  key: CheckKey;
  name: string;
  score: NumQuery;
  /** The Skills that help; may be none. */
  skills: SkillKey[];
  /** The target's part that grows with the Quest's difficulty: this times it; 0 or more. */
  difficultyFactor: number;
  /** The target's part that ignores the difficulty (v1.1.4-S2), 0 when absent: "at least one Hero with Strength 12". */
  flat?: number;
  /** The roll's spread for this Check in place of `checkVariance` (v1.1.4-S2); 0 makes a gate with no luck in it. */
  variance?: number;
  /**
   * A raw Check's capability is its score alone (v1.1.4-S2's verification, DL-152): no Skill term,
   * Synergy, teamwork or consumable's bonus, so that a count against a `flat` is a true gate. It
   * lists no `skills`.
   */
  raw?: boolean;
}

/**
 * How an Encounter's Checks combine (v1.1.4-S2, DL-148 items 7 and 8): a Check's key, or `and`
 * (the worst of its parts' Degrees), `or` (the best) or `at-least` k (the k-th best) of two or
 * more parts. Every Check of the Encounter is named in it once.
 */
export type PassFormula =
  | CheckKey
  | ['and', ...PassFormula[]]
  | ['or', ...PassFormula[]]
  | ['at-least', number, ...PassFormula[]];

/**
 * How a Check, or an Encounter, came out (v1.1.4-S2, DL-148 item 8, `CONTEXT.md` Degree), worst
 * first: a Failure, a Setback (a Failure by a narrow margin), a Success or a Triumph (a Success by
 * a wide one), read from the roll against the target by `checkDegrees`.
 */
export const degrees = ['failure', 'setback', 'success', 'triumph'] as const;

export type Degree = (typeof degrees)[number];

/**
 * Who harm falls on, and who shrugs it off (v1.1.4-S4, DL-148 item 14), for an Injury and a Death;
 * each optional, and with none of them every Hero is as likely to be hit, and the chance is as
 * written.
 */
export interface HarmReads {
  /**
   * The Heroes it may fall on, a Set Query read over those it can fall on: an Injury's over the
   * unhurt living Heroes, so `bottom` 1 takes the weakest unhurt (v1.1.5-S4, DL-178), a Death's over
   * the living Party. When it names no one, it falls on any of them, so that leaving the front rank
   * at home never dodges its harm.
   */
  among?: SetQuery;
  /** Stats whose weakness draws the harm: the less of their range a Hero has, the likelier it is them (`exposureRange`). */
  exposedBy?: StatKey[];
  /** Stats whose strength shrugs it off: the chance is less for a Hero with more of their range (`guardRange`). */
  guardedBy?: StatKey[];
}

/**
 * Up to `count` Heroes of the Party are injured with `typeKey`, each with probability `chance`,
 * each among the living who carry no Injury from this Quest yet, and of them `among` (v1.1.4-S4),
 * read over them (v1.1.5-S4).
 */
export interface InjuryConsequence extends HarmReads {
  kind: 'injury';
  typeKey: InjuryTypeKey;
  chance: number;
  count: number;
}

/**
 * With probability `chance` one living Hero of the Party dies, and takes no part in what follows;
 * of them `among` (v1.1.4-S4).
 */
export interface DeathConsequence extends HarmReads {
  kind: 'death';
  chance: number;
}

/**
 * Each Hero who comes home has their Morale moved by `delta`. A loss is less for a Hero with more of
 * the range of the Stats it is `steadiedBy`, by `guardRange` (v1.1.4-S4, DL-148 item 14); a gain is
 * as written.
 */
export interface MoraleConsequence {
  kind: 'morale';
  delta: number;
  steadiedBy?: StatKey[];
}

/** Every pair in the Party has its Regard for each other moved by `delta` (applied from M4-S4). */
export interface RegardConsequence {
  kind: 'regard';
  between: 'party';
  delta: number;
}

/** The Quest's XP for each Hero is multiplied by `factor`. */
export interface XpConsequence {
  kind: 'xp';
  factor: number;
}

/** The Quest's reward, paid only if the Quest succeeds, is multiplied by `factor`. */
export interface WealthConsequence {
  kind: 'wealth';
  factor: number;
}

/** The Guild's Fame moves by `delta`, beside the Quest's own Fame effect. */
export interface FameConsequence {
  kind: 'fame';
  delta: number;
}

/**
 * A Hero earns the Hero Trait `traitKey` with probability `chance` (v1.1.4-S7, DL-148 item 25,
 * `CONTEXT.md` Earned Trait): one Hero, drawn from those `among` names (a Set Query read over the
 * Trait's own pool, the Party still in the sequence for a positive one and those the Encounter
 * injured for a negative one, so that a `bottom` or a `top` ranks only the Heroes it can fall on, as
 * an Injury's does: v1.1.5's re-close, DL-185; every one of them when absent), and of those only
 * the Heroes who may take it: who do not hold it, hold none it excludes or that excludes it (DL-150
 * item 5), and have drawn no other on this Quest, save that a negative one may fall on a Hero holding
 * a positive one, and is then granted in its place: at most one is granted a Hero a Quest (DL-159).
 * When `among` names none of them it falls on no one. Where it is listed says what it is:
 *
 * - in an Encounter's `triumph` list, a positive Trait: drawn on the Triumph, held, and granted only
 *   if the Quest ends a strong success;
 * - in its `failure` list, a negative one: it falls only among the Heroes this same Encounter
 *   injured, so it follows an Injury in that list, and lands only at the Failure Degree.
 *
 * It is listed nowhere else (`validateContent`). Two draws from `quests`, whether it lands and on whom,
 * taken whether or not it lands.
 */
export interface TraitConsequence {
  kind: 'trait';
  traitKey: TraitKey;
  chance: number;
  among?: SetQuery;
}

/** What an Encounter's outcome does (M4-S1): a closed union, so a new kind is an engine change. */
export type Consequence =
  | InjuryConsequence
  | DeathConsequence
  | MoraleConsequence
  | RegardConsequence
  | XpConsequence
  | WealthConsequence
  | FameConsequence
  | TraitConsequence;

export type ConsequenceKind = Consequence['kind'];

/**
 * One typed step of a Quest (M4-S1, `encounters.json`), resolved by its Checks (M4-S2; v1.1.4-S2).
 * Its `consequences` are applied by its Degree: a Triumph's are `triumph`, or `success` when it has
 * none, and a Setback's `setback`, or `failure` when it has none, so an Encounter written before
 * v1.1.4 runs as it did.
 */
export interface Encounter {
  key: EncounterKey;
  name: string;
  kind: EncounterKind;
  /**
   * Its tags (v1.1.4-S8, DL-148 item 22), as a Quest template's are written: within its kind, it is
   * drawn `encounterTagWeight` times as often for each it shares with the template. None when absent.
   */
  tags?: QuestTagKey[];
  /** Its Checks, one to four (v1.1.4-S2), each rolled every time, in this order. */
  checks: EncounterCheck[];
  /** How its Checks combine into its Degree (v1.1.4-S2); may be absent when it has one Check, which then decides. */
  pass?: PassFormula;
  consequences: { success: Consequence[]; failure: Consequence[]; triumph?: Consequence[]; setback?: Consequence[] };
}

/**
 * What a Party must hold for a Synergy to apply (M4-S3; v1.1.4-S1, DL-148 item 20): Party-level
 * conditions, at least one, every one of which must hold.
 */
export type SynergyRequires = PartyCondition[];

/**
 * What a Synergy adds to a Check's capability (M4-S3, DL-45): `flat` added as it stands, and
 * `factor` multiplying the capability's Stats and Skills (`base`), as every `factor` in content
 * multiplies. At least one of the two; `flat` above 0 and `factor` above 1, a Synergy being a bonus.
 */
export interface SynergyBonus {
  flat?: number;
  factor?: number;
}

/**
 * A Synergy (R26, CONTEXT.md; `synergies.json`, M4-S3): an authored bonus for a Party that meets its
 * requirements, Queries over the Party since v1.1.4-S1, added to each Check of an Encounter of one
 * of its `kinds`, or of every kind when it names none. Relationship between the members is
 * teamwork's, apart (M4-S4).
 */
export interface Synergy {
  key: SynergyKey;
  name: string;
  requires: SynergyRequires;
  bonus: SynergyBonus;
  /** The Encounter kinds it applies on, at least one and none twice; absent for every kind. */
  kinds?: EncounterKind[];
}

/**
 * A type of Injury (`injuries.json`, M2-S5): how long it takes to heal, before an infirmary
 * shortens it (INPUTS 4.5), and the Hero Trait it leaves once healed, if any (R16). An
 * Encounter's injury consequence names the type it inflicts (M4-S1).
 */
export interface InjuryType {
  key: InjuryTypeKey;
  name: string;
  /** Days to heal, an inclusive range drawn with `int`, each at least 1. */
  healDaysMin: number;
  healDaysMax: number;
  /** A Hero Trait the Hero gains when the Injury heals, or `null` for one that leaves no mark. */
  leavesTrait: TraitKey | null;
}

/**
 * A Rival Guild's Disposition (R7, INPUTS 4.12 and 7.5; `dispositions.json`, M2-S9, M6-S1): the
 * named rule set that makes its choices, as weights that one rule reads (`rivalChoices` in
 * `controllers/rival.ts`, DL-56). A Disposition is a row, never a code path: a new row with other
 * weights plays with no engine change (principle 6).
 */
export interface Disposition {
  key: DispositionKey;
  name: string;
  /**
   * Which of the Quests it can staff it takes, from 0 to 1: its place along those Quests ranked
   * by difficulty, 0 the easiest and 1 the hardest (M6-S1). 0 is DL-30's "easiest", `steady`'s until
   * the M6 close moved it to the middle, 0.5 (DL-69).
   */
  questRiskAppetite: number;
  /**
   * It recruits only while its Wealth is above this many times its Upkeep (M6-S1: M2-S9's
   * `recruitWealthMultiple`, which the row replaces, DL-56). 0 or more.
   */
  recruitThreshold: number;
  /**
   * It builds a facility's next grade only while its Wealth is above this many times that
   * grade's cost (M6-S1: M3-S6's `buildWealthMultiple`, which the row replaces, DL-56; every
   * facility of the Hall from M6-S4, DL-58). 0 or more.
   */
  buildThreshold: number;
  /**
   * It buys a piece of gear at the Market only while its Wealth is above this many times the price
   * (M6-S4, DL-58: a piece an afternoon for its Heroes who lack one, armour first, the dearest within
   * those means; `gearPurchase`). 0 or more.
   */
  gearThreshold: number;
  /** How readily it deals in Transfers, from 0 to 1 (M6-S2 and M6-S3 read it). */
  transferAppetite: number;
  /**
   * How much more than this a Hero must raise the estimated chance of success to be added to its
   * Party past the Quest's `partySizeMin`, from 0 to 1 (v1.1.4-S6, DL-148 item 17, `partyFor`; more
   * than, v1.1.5-S6, DL-175): 0 sends every Hero who raises it at all, up to `partySizeMax`; 1 never
   * more than the fewest the Quest allows.
   */
  partyMargin: number;
}

/**
 * A Hall Improvement (R33, INPUTS 7.3; `improvements.json`, M3-S6): one grade of one facility, and
 * what it costs to build. `build` raises a facility from grade g to g + 1 at the cost of the row
 * whose `grade` is g + 1; a facility's grades run 1, 2, 3, … with no gap, and its top grade is the
 * highest content defines.
 */
export interface Improvement {
  key: ImprovementKey;
  name: string;
  /** The Hall facility the Improvement raises. */
  facility: FacilityKey;
  /** The grade it raises the facility to, from 1. */
  grade: number;
  /** The Wealth it costs, a whole number above 0. */
  cost: number;
}

/** An Item is permanent gear a Hero carries in a slot, or a consumable that is used up (R30). */
export type ItemKind = 'gear' | 'consumable';

/**
 * What a consumable does when the Quest Engine expends it (M5-S1, M5-S3): a closed union, so a new
 * kind is an engine change and earns a decision (M5 risks).
 *
 * - `reroll`: the first failed Encounter of one of `kinds` has each Check that fell short of Success
 *   rolled again, once (v1.1.4-S2);
 * - `bonus`: `flat` is added to the capability of every Check of the first Encounter of one of
 *   `kinds` (v1.1.4-S2, DL-148 item 13);
 * - `heal`: an Injury taken on the Quest heals `days` Days sooner.
 *
 * `kinds` holds one or more Encounter kinds, none twice; `flat` is above 0; `days` a whole number
 * from 1.
 */
export type ConsumableEffect =
  | { kind: 'reroll'; kinds: EncounterKind[] }
  | { kind: 'bonus'; flat: number; kinds: EncounterKind[] }
  | { kind: 'heal'; days: number };

/** The kinds of `ConsumableEffect`. */
export type ConsumableEffectKind = ConsumableEffect['kind'];

/** What every Item definition has, gear or consumable. */
interface ItemDefinitionBase {
  key: ItemDefinitionKey;
  name: string;
  /**
   * A Unique Item is an individual with one holder, a row of `world.items`; a Common Item is held in
   * stacks with a quantity, rows of `world.stacks` (data-model §3.3). Only gear may be unique.
   */
  unique: boolean;
  /**
   * The Wealth one costs at the Market, a whole number above 0; `null` for an Item the Market never
   * stocks, found only as Loot. The Market's refresh draws stacks, so it never stocks a unique Item,
   * whatever its price (DL-48).
   */
  buyPrice: number | null;
  /** Kebab-case words, none twice; may be none. */
  tags: ItemTagKey[];
}

/** Permanent gear (R30): carried by a Hero in its slot, it adds its modifiers to their Stats (M5-S2). */
export interface GearDefinition extends ItemDefinitionBase {
  kind: 'gear';
  slot: SlotKey;
  /** Whole numbers other than 0 by Hero Stat, at least one; a penalty is negative. */
  statModifiers: Record<StatKey, number>;
}

/** A consumable (R30): always common, taken on a Quest by a Party and expended by the Quest Engine (M5-S3). */
export interface ConsumableDefinition extends ItemDefinitionBase {
  kind: 'consumable';
  effect: ConsumableEffect;
}

/**
 * An Item definition (M5-S1, `items.json`): the row a unique Item or a stack names by
 * `definitionKey`. Gear has a slot and Stat modifiers and no effect; a consumable an effect and no
 * slot. Content validation refuses a row with the other kind's fields.
 */
export type ItemDefinition = GearDefinition | ConsumableDefinition;

/**
 * One entry of a Loot table (M5-S5, DL-52): an Item definition content defines, its weight in the
 * draw, and the quantity awarded, an inclusive range drawn with `int`.
 */
export interface LootEntry {
  definitionKey: ItemDefinitionKey;
  /** Drawn in proportion to it among the table's entries: a number above 0. */
  weight: number;
  /** Whole numbers from 1, `quantityMin` at most `quantityMax`; both 1 for a unique Item. */
  quantityMin: number;
  quantityMax: number;
}

/**
 * A Loot table (M5-S5, R32, INPUTS 7.4, `loot-tables.json`): what a Quest whose template names it
 * may leave behind. The Quest Engine draws one entry on a band in `lootOnBands` and the Guild's
 * holding receives it (`quest-engine/loot.ts`). At least one entry, each definition once.
 */
export interface LootTable {
  key: LootTableKey;
  entries: LootEntry[];
}

/** The name lists the generators draw from (INPUTS 3.9; `names.json`). No list is empty. */
export interface Names {
  /** Given names for Heroes and Guildmasters, by sex. */
  given: Record<Sex, string[]>;
  family: string[];
  guild: string[];
  /** A Patron's whole name, each with the sex it reads as (v1.1.2-S3, DL-125 item 5). */
  patron: PatronName[];
}

/** A Patron's name and the sex that comes with it when it is drawn (v1.1.2-S3, DL-125 item 5). */
export interface PatronName {
  name: string;
  sex: Sex;
}

/**
 * Whose pictures a Portrait is drawn from (v1.1.2-S3, DL-125 items 2 and 3): each role has its
 * pictures by sex, as `media/portraits/` has a folder per role and sex.
 */
export type PortraitRole = 'guildmaster' | 'hero' | 'patron';

/**
 * A Portrait's key: a picture's name without its extension, lower case and hyphens, never renamed
 * once a save may hold it, and unique across the roles by their prefixes, `gm-`, `hero-` and
 * `patron-` (DL-125 item 11, DL-126 item 2). The page finds the picture by it in `media/`.
 */
export type PortraitKey = string;

/** The pictures of each role and sex, by key, in the order listed (`portraits.json`, v1.1.2-S3). */
export type Portraits = Record<PortraitRole, Record<Sex, PortraitKey[]>>;

/**
 * The parts of a person's looks the Appearance is written in, but `build` (DL-127 item 3): what a head
 * and shoulders can show. No clothing (DL-127 item 2).
 */
export type AppearanceSlot = 'face' | 'hair' | 'facialHair' | 'eyes' | 'mark' | 'bearing';

/** A Station's key, such as `common` (`descriptions.json`'s `stations`, v1.1.3-S1, DL-134 item 4). */
export type StationKey = string;
/** A Temper's key, such as `stern` (`descriptions.json`'s `tempers`, v1.1.3-S1, DL-134 item 4). */
export type TemperKey = string;
/** A Calling's key, such as `soldier` (`descriptions.json`'s `callings`, v1.1.3-S1, DL-134 item 4). */
export type CallingKey = string;
/** A Feature's key, such as `beard` (`portrait-appearances.json`'s `features`, v1.1.3-S1, DL-134 item 4). */
export type FeatureKey = string;

/**
 * A Calling (v1.1.3-S1, DL-134 item 4): what a Guildmaster did before the chair, and the Guildmaster
 * Traits it `suits` and `clashes` with, set once for the Calling and not on each picture. A Portrait
 * is preferred whose Callings clash with none of a Guildmaster's Traits, then one whose Calling suits
 * one (DL-135 item 3). No Trait both suits and clashes.
 */
export interface Calling {
  suits: TraitKey[];
  clashes: TraitKey[];
}

/**
 * A Feature (v1.1.3-S1, DL-134 item 4): what can be seen of the body in a picture, such as a beard or
 * a scar. A `maleOnly` Feature is on male pictures only; `shows` names the Hero Traits it shows, such
 * as `scar` for `scarred`, so that a Hero holding one is given a picture that shows it where one fits.
 * Both are read as `false` and none where the file leaves them out.
 */
export interface Feature {
  maleOnly: boolean;
  shows: TraitKey[];
}

/**
 * A picture's row (v1.1.3-S1; DL-127, DL-134 item 3, DL-135 item 2): what it shows of the person, as
 * the agent reads it and the owner corrects it. No rule reads it; a Portrait is chosen by it to fit a
 * person already drawn, and never changes them (DL-134 item 1). Its role is the list `portraits.json`
 * holds it in, and it has that role's fields and no other's:
 * - both roles: `apparentAge`, `station`, `temper` and `narrative`; `features` and up to two `hooks`,
 *   read as none where the file leaves them out;
 * - a Guildmaster's: one or two `callings`;
 * - a Hero's: one or more `classes`, the Classes the picture could be.
 * A Patron's picture has no row yet (DL-135 item 10).
 */
export interface PortraitAppearance {
  /** `[from, to]`, the whole years the face could be, `from` no greater than `to`: the age bands it touches are `Descriptions.ageBands`'. */
  apparentAge: [from: number, to: number];
  /** The Station the picture suggests the person was born to: a Guildmaster's Biography's origin is drawn by it. */
  station: StationKey;
  /** The Temper the face shows: the Biography's closing is drawn by it. */
  temper: TemperKey;
  /** A Guildmaster's picture's Callings, one or two: the Biography's career is drawn by them. */
  callings?: CallingKey[];
  /** A Hero's picture's Classes, one or more: a Hero's Class must be among them. */
  classes?: ClassKey[];
  /** What can be seen of the body, each a Feature defined once, none twice. */
  features: FeatureKey[];
  /**
   * The Appearance of a person with this Portrait, word for word: face, hair, marks and bearing, in the
   * third person with no name, never clothing or an age in years (DL-127, DL-134 item 3), at most 260
   * characters.
   */
  narrative: string;
  /**
   * Up to two sentences written for this picture alone, each at most 160 characters with its sex's
   * pronouns, and no Birthplace: they join the career sentences a Guildmaster's Biography draws from,
   * or a Hero's Class sentences (DL-134 item 3).
   */
  hooks: string[];
}

/**
 * The rows of the pictures (`portrait-appearances.json`, v1.1.2-S4, v1.1.3-S1; DL-126 item 2, DL-127,
 * DL-134 item 3): the Features defined once, and each picture's row by its Portrait's key. Every
 * Guildmaster's and Hero's picture has a row, and every row a picture.
 */
export interface PortraitAppearances {
  features: Record<FeatureKey, Feature>;
  portraits: Record<PortraitKey, PortraitAppearance>;
}

/**
 * The parts a drawn Appearance is written in (v1.1.2-S5, DL-125 item 6, DL-127 item 2): the slots a
 * picture can show and `build`, which it cannot. No clothing, armour, gear or ornaments.
 */
export type DescriptionSlot = AppearanceSlot | 'build';

/** An age band's key: lower case and hyphens, such as `young` (`descriptions.json`, v1.1.2-S5). */
export type AgeBandKey = string;

/** An age band: the ages from `from`, whole years, to the next band's `from`, the last to any age. */
export interface AgeBand {
  key: AgeBandKey;
  from: number;
}

/**
 * The phrases of one sex and age band, each a whole sentence, by slot (v1.1.2-S5). `facialHair` is a
 * male's only; every other slot is in every band.
 */
export type AppearancePhrases = Record<Exclude<DescriptionSlot, 'facialHair'>, string[]> & { facialHair?: string[] };

/**
 * The sentences a Guildmaster's Biography is written from (v1.1.2-S5, DL-125 item 6), each with slots:
 * `{birthplace}` and the pronoun slots of `Descriptions.pronouns`. By age band: `origins`, `careers`
 * and `closings`; by the optional keys: `backgrounds`, by a Guild Background, and `traits`, by a
 * Guildmaster Trait; and `successors`, for a successor, who came to the Guild's chair rather than
 * founding the Guild, in the Background's place (v1.1.2-S6).
 *
 * With a picture (v1.1.3-S1, DL-134 items 4 and 6), each optional by key: the origin is drawn from
 * `stationOrigins` by its Station, the career from `callingCareers` by its Callings and then by age
 * band, together with its hooks, and the closing from `temperClosings` by its Temper; each falls back
 * to the band's list where its own is empty. A Temper's closing may close a Hero's Biography too
 * (`HeroBiographySentences`), so it names no Birthplace.
 */
export interface BiographySentences {
  origins: Record<AgeBandKey, string[]>;
  careers: Record<AgeBandKey, string[]>;
  backgrounds: Record<BackgroundKey, string[]>;
  traits: Record<TraitKey, string[]>;
  closings: Record<AgeBandKey, string[]>;
  successors: string[];
  stationOrigins: Record<StationKey, string[]>;
  callingCareers: Record<CallingKey, Record<AgeBandKey, string[]>>;
  temperClosings: Record<TemperKey, string[]>;
}

/**
 * The sentences a Hero's Biography is written from (v1.1.3-S1, DL-135 item 6), each with the pronoun
 * slots and no `{birthplace}`, since a Hero has no Birthplace: by Hero Background, by Class and then
 * by age band, and by Hero Trait, each optional by key; and a closing by age band, every band, for a
 * Hero with no picture. A Hero with a picture closes with its Temper's
 * (`BiographySentences.temperClosings`), and its hooks join its Class's sentences.
 */
export interface HeroBiographySentences {
  backgrounds: Record<BackgroundKey, string[]>;
  classes: Record<ClassKey, Record<AgeBandKey, string[]>>;
  traits: Record<TraitKey, string[]>;
  closings: Record<AgeBandKey, string[]>;
}

/**
 * What a Guildmaster's descriptive Attributes are written from (`descriptions.json`, v1.1.2-S5;
 * DL-125 item 6, DL-127): the age bands, the pronoun each slot is for each sex, the Birthplaces, the
 * Appearance's phrases by sex and age band, and the Biography's sentences; and since v1.1.3-S1 the
 * vocabulary a picture is read in, its Stations, Tempers and Callings, and a Hero's Biography's
 * sentences (DL-134 item 4, DL-135 item 6). The content validator proves that nothing it can write
 * passes `descriptiveAttributeMaxLength`.
 */
export interface Descriptions {
  /** In order of `from`, the first from 0, so every age has a band. */
  ageBands: AgeBand[];
  /** Each sex's word for each pronoun slot, `{he}` → `she`: the same slots for every sex. */
  pronouns: Record<Sex, Record<string, string>>;
  birthplaces: string[];
  /** The Stations a person may be born to: `common`, `trade` and `gentry` (v1.1.3-S1, DL-134 item 4). */
  stations: StationKey[];
  /** The Tempers a face may show, such as `stern` (v1.1.3-S1, DL-134 item 4). */
  tempers: TemperKey[];
  /** The Callings a Guildmaster may have followed, each with the Traits it suits and clashes with (v1.1.3-S1). */
  callings: Record<CallingKey, Calling>;
  appearance: Record<Sex, Record<AgeBandKey, AppearancePhrases>>;
  biography: BiographySentences;
  /** What a Hero's Biography is written from (v1.1.3-S1, DL-135 item 6): read by no rule yet. */
  heroBiography: HeroBiographySentences;
}

/** A loaded, validated set of content. Each table is keyed by its rows' kebab-case keys. */
export interface ContentSet {
  /** Which content set: `"core"` for the one this repository ships. */
  id: string;
  /** Raised when the content set changes; recorded in `meta.content` at creation. */
  version: number;
  stats: Record<StatKey, Stat>;
  classes: Record<ClassKey, Class>;
  /** The Classes' order, each Class once (v1.1.6-S14, DL-186 item 24): the order every list shows them in (`classComparator`). */
  classOrder: readonly ClassKey[];
  skills: Record<SkillKey, Skill>;
  /** The Guildmaster Traits (v1.1.4-S7, DL-150 item 1), keyed apart from the Hero Traits. */
  guildmasterTraits: Record<TraitKey, GuildmasterTrait>;
  /** The Hero Traits (v1.1.4-S7, DL-150 item 1), keyed apart from the Guildmaster Traits. */
  heroTraits: Record<TraitKey, HeroTrait>;
  backgrounds: Record<BackgroundKey, Background>;
  spheres: Record<SphereKey, Sphere>;
  names: Names;
  /**
   * The pictures a Portrait may show, by role and sex (v1.1.2-S3, DL-125 item 3): a player's
   * Guildmaster's Portrait is chosen from them, and every Guildmaster's chosen to fit them (v1.1.3-S5).
   * Empty lists where a role and sex has none.
   */
  portraits: Portraits;
  /** Each picture's row, what it shows of the person (v1.1.2-S4, v1.1.3-S1; DL-127, DL-134): read by no rule; a Portrait is chosen by it (v1.1.3-S5). */
  portraitAppearances: PortraitAppearances;
  /** What a Guildmaster's blank descriptive Attributes are written from (v1.1.2-S5, DL-125 item 6). */
  descriptions: Descriptions;
  /** The kinds of Quest the Patrons offer, found by Sphere at draw time (M2-S3, DL-20). */
  questTemplates: Record<QuestTemplateKey, QuestTemplate>;
  /** The types of Injury a Quest can leave; at least one (M2-S5). */
  injuries: Record<InjuryTypeKey, InjuryType>;
  /** The Rival Dispositions, each the weights a Rival controller's one rule reads (M2-S9, M6-S1); at least one. */
  dispositions: Record<DispositionKey, Disposition>;
  /** The Hall Improvements, each one grade of one facility and its cost (M3-S6). */
  improvements: Record<ImprovementKey, Improvement>;
  /** The Encounters a Quest's sequence is drawn from, by the kinds its template names (M4-S1). */
  encounters: Record<EncounterKey, Encounter>;
  /** The Synergies a Party's Classes and Skills can earn on a Check (M4-S3). */
  synergies: Record<SynergyKey, Synergy>;
  /** The Item definitions: gear and consumables, common and unique (M5-S1, DL-20's table name). */
  items: Record<ItemDefinitionKey, ItemDefinition>;
  /** The Loot tables Quest templates name, each a weighted list of Item definitions (M5-S5). */
  lootTables: Record<LootTableKey, LootTable>;
}

/** What a document records of the content set it was created under (`meta.content`). */
export type ContentRef = Pick<ContentSet, 'id' | 'version'>;
