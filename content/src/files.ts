// The content set's files, as they sit in the content directory. Pure: the page's script reads them
// too (M7-S1).

/** The content set this package holds, as `meta.content` records it. */
export const contentSetId = 'core';

/** The files of a content set, named as they sit in the content directory; the last holds its version (DL-186 item 14). */
export const contentFiles = [
  'stats.json',
  'classes.json',
  'class-order.json',
  'skills.json',
  'guildmaster-traits.json',
  'hero-traits.json',
  'backgrounds.json',
  'spheres.json',
  'names.json',
  'quest-templates.json',
  'dispositions.json',
  'injuries.json',
  'improvements.json',
  'encounters.json',
  'synergies.json',
  'items.json',
  'loot-tables.json',
  'portraits.json',
  'portrait-appearances.json',
  'descriptions.json',
  'version.json',
] as const;

export type ContentFileName = (typeof contentFiles)[number];
