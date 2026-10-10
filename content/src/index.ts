// @heroesim/content: the core content set as JSON files, parsed and validated into the
// engine's `ContentSet` (ADR-0006). The shapes are the engine's; this package imports them, and the
// engine's lists and bounds it checks against, from the engine's content entry (DL-243), and holds
// only the text and its kinds: how each is read and its rules (pre-M0 review A3 as refined by DL-186
// item 6).
//
// This entry is pure — text in, content out — so a browser can use it (M7-S1). The Node entry,
// `@heroesim/content/node`, reads the files from disk and calls it.

export { contentSetId, contentSources, isFolder, parseContent, placeOf, readContent, rowFile, rowFilesIn, sourceFiles, type ContentSource } from './parse.js';
export { validateContent } from './validate.js';
export { ContentError } from './kinds/error.js';
export { growthSumTolerance } from './kinds/classes.js';
export { longestDescriptions, type LongestDescriptions } from './kinds/descriptions.js';
export { contentWarnings, hookMaxLength, hooksMax, narrativeMaxLength, picturesWanted } from './kinds/portrait-appearances.js';
export { guildmasterTraitEffects, heroTraitEffects, type EffectField } from './kinds/trait-effects.js';
export { contentFieldNames, rowFields } from './kinds/index.js';
