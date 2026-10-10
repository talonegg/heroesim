// The content kinds (DL-243): one module per kind holds its shape, how it is read, its defaults and its
// rules with their refusals. These are the lists the drivers run, `readContent` the readers and
// `validateContent` the rules, each in the order of the content set's places. The readers are kept
// apart from the rules, so the page's script, which reads content and checks none of it (DL-152),
// carries the readers alone.

import type { ContentSet } from '@heroesim/engine/content';
import type { ContentSource } from '../files.js';
import { backgroundsKind, backgroundsRules } from './backgrounds.js';
import { classesKind, classesRules, classOrderKind, classOrderRules } from './classes.js';
import { descriptionsKind, descriptionsRules } from './descriptions.js';
import { dispositionsKind, dispositionsRules } from './dispositions.js';
import { encountersKind, encountersRules } from './encounters.js';
import { improvementsKind, improvementsRules } from './improvements.js';
import { injuriesKind, injuriesRules } from './injuries.js';
import { itemsKind, itemsRules } from './items.js';
import { lootTablesKind, lootTablesRules } from './loot-tables.js';
import { namesKind, namesRules } from './names.js';
import { portraitAppearancesKind, portraitAppearancesRules } from './portrait-appearances.js';
import { portraitsKind, portraitsRules } from './portraits.js';
import { questTemplatesKind, questTemplatesRules } from './quest-templates.js';
import type { Field, KindReader } from './read.js';
import type { KindRules } from './rules.js';
import { skillsKind, skillsRules } from './skills.js';
import { spheresKind, spheresRules } from './spheres.js';
import { statsKind, statsRules } from './stats.js';
import { synergiesKind, synergiesRules } from './synergies.js';
import { guildmasterTraitsKind, guildmasterTraitsRules, heroTraitsKind, heroTraitsRules } from './traits.js';
import { versionKind } from './version.js';

/** A place of the content set that a content file fills: every one but its `id`. */
export type ContentPlace = Exclude<keyof ContentSet, 'id'>;

/** A kind's reader, whatever its place. */
export type AnyKindReader = { [Place in ContentPlace]: KindReader<Place, ContentSet[Place]> }[ContentPlace];

/** Each place's reader, keyed by its place, so a place of the content set no kind reads fails to compile. */
const readers: { [Place in ContentPlace]: KindReader<Place, ContentSet[Place]> } = {
  version: versionKind,
  stats: statsKind,
  classes: classesKind,
  classOrder: classOrderKind,
  skills: skillsKind,
  guildmasterTraits: guildmasterTraitsKind,
  heroTraits: heroTraitsKind,
  backgrounds: backgroundsKind,
  spheres: spheresKind,
  names: namesKind,
  questTemplates: questTemplatesKind,
  dispositions: dispositionsKind,
  injuries: injuriesKind,
  improvements: improvementsKind,
  encounters: encountersKind,
  synergies: synergiesKind,
  items: itemsKind,
  lootTables: lootTablesKind,
  portraits: portraitsKind,
  portraitAppearances: portraitAppearancesKind,
  descriptions: descriptionsKind,
};

/** The readers, in the order of the content set's places. */
export const contentKinds: readonly AnyKindReader[] = Object.values(readers);

/**
 * Where each kind sits in the content directory, as its kind declares (DL-260): one file, or a folder
 * of one file a row. In the order of the content set's places, the content version's file last
 * (DL-186 item 14).
 */
export const contentSources: readonly ContentSource[] = [
  ...contentKinds.filter((kind) => kind.key !== 'version').map((kind) => kind.source),
  readers.version.source,
];

/** The rules, in the order of the content set's places; the content version's are its reader's. */
export const contentRules: readonly KindRules[] = [
  statsRules,
  classesRules,
  classOrderRules,
  skillsRules,
  guildmasterTraitsRules,
  heroTraitsRules,
  backgroundsRules,
  spheresRules,
  namesRules,
  questTemplatesRules,
  dispositionsRules,
  injuriesRules,
  improvementsRules,
  encountersRules,
  synergiesRules,
  itemsRules,
  lootTablesRules,
  portraitsRules,
  portraitAppearancesRules,
  descriptionsRules,
];

/** The name of every field a content kind reads, at any depth: for a tool to tell a field from another name (the editor's scan of the code, DL-243). */
export function contentFieldNames(): Set<string> {
  const names = new Set<string>();
  const visit = (fields: Readonly<Record<string, Field<unknown>>>): void => {
    for (const [name, field] of Object.entries(fields)) {
      names.add(name);
      field.holds.forEach(visit);
    }
  };
  for (const kind of contentKinds) kind.holds.forEach(visit);
  return names;
}
