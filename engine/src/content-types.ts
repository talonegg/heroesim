// The shape of content belongs to the engine, because the engine is what reads it by key
// (ADR-0006). `@heroesim/content` imports these types and only parses and validates text into
// them; the engine imports nothing from content (pre-M0 review A3).
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
/** A tag a Quest template carries (M2-S3). */
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
 * are, so content validation refuses a slot no Hero could have. Which of them a Hero has is
 * `GameConfig.gearSlots` (all three by default). A new slot is an engine change (DL-48).
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
  /**
   * The Hero Stats the work asks for, each with a weight; the weights sum to 1 (DL-06). A Party is
   * chosen by them (`partyFor`); from M4-S2 the Check reads its Encounters' demands instead.
   */
  demands: [statKey: StatKey, weight: number][];
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
}

/** The kinds of Encounter (M4-S1): the flavour of a Check, and what a Quest template draws from. */
export const encounterKinds = ['combat', 'travel', 'social', 'arcane', 'stealth'] as const;

export type EncounterKind = (typeof encounterKinds)[number];

/**
 * How a Check reads the Party's Stats on an Encounter's demands (M4-S2): `best` takes the best
 * Hero's value of each Stat, `sum` the Party's sum of it.
 */
export type EncounterAggregate = 'best' | 'sum';

/**
 * Up to `count` Heroes of the Party are injured with `typeKey`, each with probability `chance`,
 * each among the living who carry no Injury from this Quest yet.
 */
export interface InjuryConsequence {
  kind: 'injury';
  typeKey: InjuryTypeKey;
  chance: number;
  count: number;
}

/** With probability `chance` one living Hero of the Party dies, and takes no part in what follows. */
export interface DeathConsequence {
  kind: 'death';
  chance: number;
}

/** Each Hero who comes home has their Morale moved by `delta`. */
export interface MoraleConsequence {
  kind: 'morale';
  delta: number;
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

/** What an Encounter's outcome does (M4-S1): a closed union, so a new kind is an engine change. */
export type Consequence =
  | InjuryConsequence
  | DeathConsequence
  | MoraleConsequence
  | RegardConsequence
  | XpConsequence
  | WealthConsequence
  | FameConsequence;

export type ConsequenceKind = Consequence['kind'];

/**
 * One typed step of a Quest (M4-S1, `encounters.json`), resolved by a Check (M4-S2): the Party's
 * capability on the weighted `demands`, aggregated by `aggregate`, with a bonus for the best rating
 * held of each of `skillKeys`, against `difficultyFactor` times the Quest's difficulty. Its
 * `consequences` are applied by outcome.
 */
export interface Encounter {
  key: EncounterKey;
  name: string;
  kind: EncounterKind;
  /** Hero Stats with weights summing to 1, as a Quest template's demands. */
  demands: [statKey: StatKey, weight: number][];
  aggregate: EncounterAggregate;
  /** The Skills that help; may be none. */
  skillKeys: SkillKey[];
  /** The Check's target is this times the Quest's difficulty; above 0. */
  difficultyFactor: number;
  consequences: { success: Consequence[]; failure: Consequence[] };
}

/**
 * What a Party must hold for a Synergy to apply (M4-S3): at least `count` members of each Class
 * named, and each Skill named held, at any rating, by at least one member. At least one Class or
 * Skill in all; content validation refuses a count below 1.
 */
export interface SynergyRequires {
  classes?: Record<ClassKey, number>;
  skills?: SkillKey[];
}

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
 * A Synergy (R26, CONTEXT.md; `synergies.json`, M4-S3): an authored bonus for a Party holding a
 * combination of Classes or Skills, added to each Check of an Encounter of one of its `kinds`, or
 * of every kind when it names none. Relationship between the members is teamwork's, apart (M4-S4).
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
   * by difficulty, 0 the easiest and 1 the hardest (M6-S1). `steady`'s 0 is DL-30's "easiest".
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
 * - `reroll`: the first failed Check of an Encounter of one of `kinds` is rolled again, once;
 * - `bonus`: `flat` is added to the capability of the first Check of an Encounter of one of `kinds`;
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
