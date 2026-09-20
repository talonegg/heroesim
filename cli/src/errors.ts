/**
 * The one map from an `EngineErrorCode` to a sentence a person can act on (E7-S5).
 *
 * **There is no map here and there must never be one.** `errorSentence` lives in
 * `@heroesim/narrate`, where E8-S2 moved it so that both front ends say the same thing
 * about the same rejection, with one exhaustive switch over the union and one test that
 * holds it exhaustive. This module is a re-export and nothing else, so that E7 §4's
 * `cli/src/errors.ts` exists where the layout says it does without becoming a second map
 * that can drift from the first.
 */

export { errorSentence } from '@heroesim/narrate';
