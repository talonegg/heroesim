// The shape of content belongs to the engine, because the engine is what reads it by key
// (ADR-0006). `@heroesim/content` imports these types and only parses and validates text into
// them; the engine imports nothing from content (pre-M0 review A3).
//
// M1-S1 defined the keys the World State stores and the content set's identity; M1-S4 the row
// types (`Stat`, `Class`, `Skill`, `Trait`, `Background`, `Sphere`, `Names`) and their tables in
// `ContentSet`; M2-S3 `QuestTemplate`; M2-S5 `InjuryType`; M2-S9 `Disposition`; M3-S6
// `Improvement`. Later milestones add theirs (M5-S1 Items).
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
/** A tag a Quest template carries (M2-S3). */
export type QuestTagKey = string;
/** A type of Injury (M2-S5, `injuries.json`). */
export type InjuryTypeKey = string;
/** A Rival Guild's Disposition: `steady` from M2, the rest in M6. */
export type DispositionKey = string;
/** An Encounter a Quest is drawn with (M4). */
export type EncounterKey = string;
/** A Loot table (M5). */
export type LootTableKey = string;
/** An Item definition, for unique Items and common stacks alike (M5). */
export type ItemDefinitionKey = string;
/** A gear slot on a Hero (M5). */
export type SlotKey = string;
/** A Hall Improvement, one grade of one facility (M3-S6, `improvements.json`). */
export type ImprovementKey = string;

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

/** Whose Trait it is: a Hero's lasting mark (R16) or a Guildmaster's buff or penalty (R8). */
export type TraitOwner = 'hero' | 'guildmaster';

/**
 * What a Guildmaster Trait does (M4-S5, R8, pre-M0 review B2, DL-43): one effect from a closed
 * union, each applied inside the one selector that already works its quantity out, for every Guild
 * alike (ADR-0002). A new kind is an engine change and earns a decision-log entry.
 *
 * - `classStatBonus`: `delta` added to the Stat `statKey` of each Hero of the Class `classKey` on
 *   the Guildmaster's Guild, in `effectiveStats`, held inside the Stat's range;
 * - `guildMoraleShift`: `delta` added to the Morale baseline of the Guild's Heroes, in
 *   `moraleBaselineFor`;
 * - `upkeepFactor`: the Guild's Upkeep multiplied by `factor`, in `upkeep`.
 */
export type TraitEffect =
  | { kind: 'classStatBonus'; classKey: ClassKey; statKey: StatKey; delta: number }
  | { kind: 'guildMoraleShift'; delta: number }
  | { kind: 'upkeepFactor'; factor: number };

/** The kinds of `TraitEffect`. */
export type TraitEffectKind = TraitEffect['kind'];

/** A Trait (R8, R16; `traits.json`). */
export interface Trait {
  key: TraitKey;
  name: string;
  owner: TraitOwner;
  /**
   * A Guildmaster Trait's one effect (M4-S5); `null` for a Hero Trait, which no rule reads in the
   * first build. Content validation holds each owner to its own.
   */
  effect: TraitEffect | null;
}

/** Whose Background it is: a Hero's, or the narrative history of a Guild (INPUTS 3.10). */
export type BackgroundOwner = 'hero' | 'guild';

/** A Background: a display name, with no effect in the first build (`backgrounds.json`). */
export interface Background {
  key: BackgroundKey;
  name: string;
  owner: BackgroundOwner;
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
  /** The Hero Stats the stub assesses, each with a weight; the weights sum to 1 (DL-06). */
  demands: [statKey: StatKey, weight: number][];
  /** The Skills that help on this kind of work (R15, pre-M0 review A4). */
  skillKeys: SkillKey[];
  requires: QuestTemplateRequires;
  /** `null` until Loot tables exist (M5). */
  lootTableKey: null;
}

/**
 * A type of Injury (`injuries.json`, M2-S5): how long it takes to heal, before an infirmary
 * shortens it (INPUTS 4.5), and the Hero Trait it leaves once healed, if any (R16). The stub
 * Quest Engine draws a type for each Injury it inflicts.
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
 * A Rival Guild's Disposition (R7, INPUTS 4.12; `dispositions.json`, M2-S9): the named rule set
 * that makes its choices. The row is a name only; the rule is engine code keyed by the row's key
 * (approach §4, `controllers/rival.ts`), until M6-S1 gives each row the weights one rule reads.
 */
export interface Disposition {
  key: DispositionKey;
  name: string;
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

/** The name lists the generators draw from (INPUTS 3.9; `names.json`). No list is empty. */
export interface Names {
  /** Given names for Heroes and Guildmasters, by sex. */
  given: Record<Sex, string[]>;
  family: string[];
  guild: string[];
  patron: string[];
}

/** A loaded, validated set of content. Each table is keyed by its rows' kebab-case keys. */
export interface ContentSet {
  /** Which content set: `"core"` for the one this repository ships. */
  id: string;
  /** Raised when the content set changes; recorded in `meta.content` at creation. */
  version: number;
  stats: Record<StatKey, Stat>;
  classes: Record<ClassKey, Class>;
  skills: Record<SkillKey, Skill>;
  traits: Record<TraitKey, Trait>;
  backgrounds: Record<BackgroundKey, Background>;
  spheres: Record<SphereKey, Sphere>;
  names: Names;
  /** The kinds of Quest the Patrons offer, found by Sphere at draw time (M2-S3, DL-20). */
  questTemplates: Record<QuestTemplateKey, QuestTemplate>;
  /** The types of Injury a Quest can leave; at least one (M2-S5). */
  injuries: Record<InjuryTypeKey, InjuryType>;
  /** The Rival Dispositions, each a Rival controller's rule by key (M2-S9). */
  dispositions: Record<DispositionKey, Disposition>;
  /** The Hall Improvements, each one grade of one facility and its cost (M3-S6). */
  improvements: Record<ImprovementKey, Improvement>;
}

/** What a document records of the content set it was created under (`meta.content`). */
export type ContentRef = Pick<ContentSet, 'id' | 'version'>;
