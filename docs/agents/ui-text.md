# The page's words: capitals

The rule for every text the page and the CLI show (DL-125 item 9). `CONTEXT.md` decides which
words are terms; this decides how they, and the words around them, are written.

## The rule

1. **Standalone text begins with a capital.** This covers headings, titles, buttons, links, table
   headers and cells, chips, legends, labels, `dt`s, options, and an `aria-label` that names a
   control. A number may begin it instead, as in "3 new".
2. **Glossary terms are capitalised wherever they stand,** in the headword's own case: Guild, Hero,
   Quest report, Trait budget, Fast forward, Fast-forward stop.
3. **Everything else is lower case.** Write sentence case, never Title Case: "Skills that help",
   not "Skills That Help".
4. **Inside a sentence, data keeps its case:** "retired at age 65", "a strong success" (DL-112
   item 4). The capital belongs to text that stands on its own.

## The words settled

| Write | Not | Why |
| --- | --- | --- |
| Offer | offer | Short for Transfer Offer on the page (DL-125) |
| Fast forward | fast forward | The glossary's term (DL-125) |
| Year 3 | year 3 | Year is a term beside Day and Turn (DL-125) |
| Age, Sex, Male, Female | age, sex | Labels and values (DL-111 item 9, DL-112 item 4) |
| Unattached pool | Unattached Pool | "Pool" is no term; Unattached Hero is |
| Debug: Whole History | Debug: whole History | The owner's wording (DL-120) |
| an Offer, a Module, their Gear | an offer, a module, their gear | Terms, in the CLI as on the page (v1.1.6-S11, DL-197; the narration's, one for both, v1.1.6-S12, DL-198) |
| No effect | no effect | A Trait's effects stand alone (v1.1.6-S11, DL-197) |
| Year 2 Day 45 | Day 404, Year 1; Year 02 Day 45; Day 45 | A date: the Year from 1, the Day of the Year from 1 to 360, no padding, the Year always with it (2026-10-06, DL-206 items 30 to 33, DL-210) |
| Year 2 Day 45, afternoon | Day 404, afternoon, Year 1 | A date with the time of day, after a comma (DL-206 item 32, DL-210) |
| the night of Year 2 Day 45 | the night of Day 404 | A night, mid-sentence; "The night of …" where it stands alone (DL-206 item 32, DL-210) |

**Dates** (2026-10-06, DL-206 items 30 to 33, DL-210) are written by one calendar in
`@heroesim/words` (`dateOfTurn`, `whenOfTurn`, `nightOfTurn`, `dateOfDay`, `nightOfDay`,
`fileDateOfTurn`), never by a view's own arithmetic. The CLI keeps the Turn beside a date where it
shows one: "Turn 3 (Year 1 Day 2, morning)". The engine's Turn, Day and Year count from 0; only the
words count from 1.

## How

- **Capitalise data in the selector that builds the text,** with `capitalised()` (`@heroesim/words`,
  which the CLI reads too), so that each text is made in one place and reads the same wherever it is
  shown.
- **Never with CSS `text-transform: capitalize`,** which capitalises every word.
- **The tracked capitals of small labels stay a style** (DL-103 item 11): table headers, `dt`s,
  legends, `h6`s and captions render in capitals. The source under them still follows the rule, for
  screen readers and copying.
- **A guard test** renders every view and fails any standalone text that begins with a lower-case
  letter (`web/src/views/capitals.test.tsx`, v1.1.2-S1, DL-128). A new view, or a new part of one,
  is opened there too.
  It reads each element whole, and each leaf `span`, `strong` and `em` inside one, except a part that
  continues a sentence (the words before it end in a letter, a digit, a comma or a colon) and the words
  only assistive technology reads. It reads no sentence's inside, so a term written lower case mid-sentence
  is found by eye and by `grep`, not by the guard.
