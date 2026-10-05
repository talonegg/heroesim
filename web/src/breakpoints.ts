// The page's widths, named once (v1.1.6-S15, DL-186 item 23): the style sheet's `@media` queries
// each stand on one of these (`breakpoints.test.ts` holds it), and the script asks the browser
// about the same widths through them.

/** The widths, in px, at which the page's layout changes. */
export const breakpoints = { small: 420, phone: 600, wide: 900, rail: 1100 } as const;

/** A phone's width, as the style sheet's own breakpoint writes it: under `phone`. */
export const narrowQuery = `(max-width: ${breakpoints.phone - 1}px)`;
