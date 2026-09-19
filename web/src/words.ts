/**
 * Every English sentence in this client comes from `@heroesim/narrate`, the same package
 * the terminal front end uses, so both say the same thing about the same events (DL-01,
 * ADR-0002). Nothing in `web/` writes prose about the world; this module exists so that
 * the single import point is obvious and a stray one is easy to spot.
 */

export { errorSentence, formatDay, narrateEvents, reckoningLines } from '@heroesim/narrate';
export type { Paragraph, ParagraphKind } from '@heroesim/narrate';
