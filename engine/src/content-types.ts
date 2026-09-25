// The shape of content belongs to the engine, because the engine is what reads it by key
// (ADR-0006). `@heroesim/content` imports these types and only parses and validates text into
// them; the engine imports nothing from content (pre-M0 review A3).
//
// M1-S1 defines the keys the World State stores and the content set's identity. M1-S4 adds the
// row types (`Stat`, `Class`, `Skill`, `Trait`, `Background`, `Sphere`) and their tables to
// `ContentSet`; later milestones add theirs.

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
/** A type of Injury (M2). */
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

/** A loaded, validated set of content. */
export interface ContentSet {
  /** Which content set: `"core"` for the one this repository ships. */
  id: string;
  /** Raised when the content set changes; recorded in `meta.content` at creation. */
  version: number;
}

/** What a document records of the content set it was created under (`meta.content`). */
export type ContentRef = Pick<ContentSet, 'id' | 'version'>;
