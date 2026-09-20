/**
 * Every English sentence in this client comes from `@heroesim/narrate`, the same package
 * the terminal front end uses, so both say the same thing about the same events (DL-01,
 * ADR-0002). Nothing in `web/` writes prose about the world; this module exists so that
 * the single import point is obvious and a stray one is easy to spot.
 */

export {
  atRiskSentence,
  coin,
  count,
  difficultyWord,
  entriesFrom,
  errorSentence,
  exitReason,
  exitWords,
  formatDay,
  groupDigits,
  narrateEvents,
  noneCanBeTakenReason,
  remember,
  splitStamp,
  postingNothingSentence,
  reckoningLines,
  returnerSentence,
  turnBackSentence,
  wordProse,
  wrongedRivalSentence,
  DIFFICULTY_BANDS,
  HISTORY_KEPT,
  STANDING_EXPLAINED,
  WORTH_REMEMBERING,
} from '@heroesim/narrate';
export type { Paragraph, ParagraphKind, WordProse } from '@heroesim/narrate';
