// @heroesim/engine/content: content's own entry into the engine (DL-243). The shape of content is the
// engine's (ADR-0006): its types and lists, the bounds content checks its text against, and
// `queryProblems`, which holds a Query to its operators' own signatures (DL-186 item 6), and the Tier
// ladder a Quest template's Tiers and overrides are checked against, with the Beats a Tier draws
// (DL-262, DL-267). The content package, the words and the content editor take content's vocabulary
// here; the main entry, `@heroesim/engine`, keeps what the front ends and the harness play and read
// with, and names only the content types they take (`testing.test.ts` holds both).

import { defaultConfig, type TierRow } from './config.js';

export * from './content-types.js';
export { fatigueBandNames, tierFields, tierOverrideFields, type FatigueBand, type TierOverride, type TierRow } from './config.js';
export { tierRowProblems } from './config-check.js';
export { biographyTraitSentences, heroBiographyTraitSentences } from './descriptions.js';
export { descriptiveAttributeMaxLength, type Sex } from './document.js';
export { sexes } from './generators/draw.js';
export { queryProblems, type QueryKeys, type QueryPlace } from './quest-engine/query/problems.js';
export { beatsDrawn, inBeatPool, shortBeats } from './tiers.js';

/**
 * The default Tier ladder, `config.json`'s `tiers` (DL-262): what content's check holds a Quest
 * template's Tiers, Beats and overrides to. A game plays under its own config's ladder, whose Tiers the
 * engine clips and caps a template's to, so content checked against this one stays playable under another.
 */
export const tierLadder: readonly TierRow[] = defaultConfig.tiers;
