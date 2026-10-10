// @heroesim/engine/content: content's own entry into the engine (DL-243). The shape of content is the
// engine's (ADR-0006): its types and lists, the bounds content checks its text against, and
// `queryProblems`, which holds a Query to its operators' own signatures (DL-186 item 6). The content
// package, the words and the content editor take content's vocabulary here; the main entry,
// `@heroesim/engine`, keeps what the front ends and the harness play and read with, and names only
// the content types they take (`testing.test.ts` holds both).

export * from './content-types.js';
export { biographyTraitSentences, heroBiographyTraitSentences } from './descriptions.js';
export { descriptiveAttributeMaxLength, facilityKeys, type FacilityKey, type Sex } from './document.js';
export { sexes } from './generators/draw.js';
export { queryProblems, type QueryKeys, type QueryPlace } from './quest-engine/query/problems.js';
