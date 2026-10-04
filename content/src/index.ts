// @heroesim/content: the core content set as JSON files, parsed and validated into the
// engine's `ContentSet` (ADR-0006). The shapes are the engine's; this package imports them as
// types and holds only the text and its checks (pre-M0 review A3).
//
// This entry is pure — text in, content out — so a browser can use it (M7-S1). The Node entry,
// `@heroesim/content/node`, reads the files from disk and calls it.

export {
  contentFiles,
  contentSetId,
  parseContent,
  readContent,
  type ContentFileName,
} from './parse.js';
export {
  biographyTraitSentences,
  ContentError,
  contentWarnings,
  demandSumTolerance,
  descriptionBounds,
  growthSumTolerance,
  heroBiographyTraitSentences,
  hookMaxLength,
  hooksMax,
  longestDescriptions,
  narrativeMaxLength,
  picturesWanted,
  validateContent,
  type LongestDescriptions,
} from './validate.js';
