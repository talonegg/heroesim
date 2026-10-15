// The page's widths, named once (v1.1.6-S15, DL-186 item 23): the style sheet's `@media` queries
// each stand on one of these, and its `@container` queries on one of a part's widths
// (`breakpoints.test.ts` holds it); the script asks the browser about the same widths through them.

/** The widths, in px, at which the page's layout changes. */
export const breakpoints = { small: 420, phone: 600, wide: 900, rail: 1100 } as const;

/**
 * The widths, in rem, at which a part laid out by its own width (`@container`) changes: the Hero's
 * page's Stats two by two, and the Hall's Facilities and the Guildmaster's grid set out wide. A
 * part's width, not the page's, and in rem as the part's content follows the type.
 */
export const containerBreakpoints = { pairs: 34, wide: 46 } as const;

/** A phone's width, as the style sheet's own breakpoint writes it: under `phone`. */
export const narrowQuery = `(max-width: ${breakpoints.phone - 1}px)`;
