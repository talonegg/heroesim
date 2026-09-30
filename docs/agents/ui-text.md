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

## How

- **Capitalise data in the selector that builds the text,** with `capitalised()`
  (`web/src/state/names.ts`), so that each text is made in one place and reads the same wherever
  it is shown.
- **Never with CSS `text-transform: capitalize`,** which capitalises every word.
- **The tracked capitals of small labels stay a style** (DL-103 item 11): table headers, `dt`s,
  legends, `h6`s and captions render in capitals. The source under them still follows the rule, for
  screen readers and copying.
- **A guard test** renders every view and fails any standalone text that begins with a lower-case
  letter (to be built in v1.1.2-S1).
