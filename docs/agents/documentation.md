# Documentation

How to keep the documents and the comments lean as releases land: one place for each fact, live
pages that state what is true now, and history moved to the archives with its text kept (DL-227).
The v1.1.8 audit found the docs agents read growing faster than the game: a decision log of 2.4 MB,
a plan of stacked amendment notes and a release recorded in four places. These rules keep it from
growing back.

## One place for each fact

Write a fact in its home, and link to it from anywhere else. Never copy it.

| The fact | Its home |
| --- | --- |
| A decision and its reasons | A DL entry, appended to `docs/decision-log.md` |
| A decision that is hard to reverse, surprising later and a real trade-off | An ADR in `docs/adr/` |
| What a word means | `CONTEXT.md` |
| What the game is and does | `docs/requirements.md`; the save's shape, `docs/data-model.md` |
| What the open line builds toward | `docs/management-model.md` |
| A tuning value; a content value | `engine/src/config.json`; `content/` |
| How a story or a release is run | `docs/agents/delivery.md` |
| A tool's commands and mechanics | Its README: `harness/`, `tools/editor/`, `tools/portraits/`, `tools/measure/` |
| Environment variables; the deploy | `docs/environment.md`; `docs/deploy.md` |
| A release's plan, stories and boxes | Its epic in `docs/planning/epics/` |
| A release's record | One row of `docs/plan.md` §2, and its epic's Status line |
| What comes next | `docs/plan.md` §3 |
| Test counts, sweep figures, a verification's findings | The commit message and the harness's reports |

## Writing a live page

A live page is any document outside the archives. It says what is true now.

- **Rewrite, do not append.** When a decision changes a page, rewrite the sentence to the new truth
  and cite the entry: "Saves are gzipped (DL-67)". Do not add "*Amended <date>:* … originally …";
  the entry that decided the change holds the old text and the reason.
- **Cite, do not narrate.** No "since", "until", "from v1.1.4" or "moved here by"; no story ids. The
  index leads from an entry's id to its history.
- **Link, do not restate.** One sentence and a link to the fact's home. A second copy goes stale the
  day the first changes.
- **No figures that rot.** Test counts, byte sizes, fingerprints and timings belong in a record: an
  entry's Evidence, a commit, a report. A live page states a limit, never the last measure.
- **ADRs are amended, then restated.** An ADR takes a dated amendment note, since it records a
  decision. Once three notes stack, restate the ADR as it now stands from every entry that bears on
  it, and archive its old wording (as DL-222 did ADR-0009).
- **An epic stays a plan.** A box's note names its DL entry in a line, and the Status line names
  each story's state and entry, never the build's narrative. The narrative goes in the entry.
- **Budgets.** A DL entry is at most 6 KB, which `npm test` holds. The pages an agent reads to start
  a story (AGENTS.md, the delivery guide, `plan.md`, the current epic, the decision index and the
  open log) stay under 250 KB in total. Measure them at a release's close.

## Comments

`docs/agents/comments.md` holds the rules: what and why, citing the deciding entry; no history and
no story ids; no value that the data holds. `npm test` refuses a comment that tells history by a
story, and holds the lines that still cite a story id to the baseline in
`tools/decisions/story-citations.json`. When a rewrite lowers the count, lower the baseline to it in
the same commit, since `check` fails below it as well as above (DL-226).

## Archiving

An archive keeps a document's text word for word, so that nothing is lost and the live page can
shrink. What is archived is changed only to re-point its links. Every move is recorded in a DL entry
and checked by a script before its commit, which compares the archived text with the original.

The archives are `docs/decisions/archive/`, `docs/planning/archive/` and `docs/adr/archive/`.
`docs/.rgignore` leaves them out of a search: read one through its index, by path.

### A superseded decision

The log's header has the rules. In the same commit as the superseding entry:

1. In the earlier entry, write a one-line stub for an item superseded in full, or a note beneath an
   item superseded in part. Name the superseding entry and its item.
2. In `docs/decisions/archive/superseded/DL-nn.md`, created if it does not exist with the header the
   others have, write the record:
   - `## DL-nn item N — superseded by DL-mm`, or `— in part, by DL-mm`;
   - a line saying what changed;
   - the superseded text, quoted.

   Spell each id as its entry's heading does.
3. Run `npm run decisions -- index`, then `npm run decisions -- check`.

### A release's decisions

At the release's record, move its entries, word for word, from `docs/decision-log.md` to
`docs/decisions/archive/DL-<first>-<last>-<release>.md`. The log keeps its header. Then re-point two
kinds of link:
- a stub's or a note's link into `superseded/`, which then begins `superseded/`;
- a record's header link to its entry's file, which then names the archive file.

The link check catches the first but not the second. Run the index and the check.

### A closed epic

At the release's record:

1. `git mv` the epic to `docs/planning/archive/`, with its Status line filled.
2. Add its row to `docs/planning/archive/README.md`: the release, its decisions and a note.
3. Remove its row from the register in `docs/planning/epics/README.md`.
4. Re-point every link to it; the link check finds them.

### A page or a section that is no longer live

1. Move the text word for word to the archive nearest its kind: a plan, an inputs list or a review
   to `docs/planning/archive/`, an ADR's old wording to `docs/adr/archive/`.
2. Head it with what it is, when and why it moved (its DL entry), and "only links are re-pointed".
3. Re-point its links from its new place.
4. Leave the live page a one-line pointer, or nothing, where nothing live needs it.
5. Re-point the live references to it. A reference by section number, such as `plan.md` §4, is
   found by searching, not by the link check.

### Generated files and reports

- **Generated files** (a calibration's data, a review page) stay out of the tree: `.gitignore` names
  them. One kept as a record goes to its release's GitHub Release as an asset, on the owner's word
  (DL-218).
- **Harness reports** are committed only where an entry cites them. At a release's record, the ones
  nothing live cites leave the tree. The harness README names the commit to read them from (DL-223).
- **The baselines.** A release that changes play makes its closing full `gate` the baseline of
  `harness/gate.json`, the one report the spec names, in its close's DL entry. The previous
  baseline's report then leaves the tree. A release that changes no play keeps the baseline, proves
  it with `neutral --expect`, and its `neutral` report becomes the harness README's reference. A
  report's name is its release, `v1.1.9-gate` (DL-228, DL-229).

## The checks

`npm run decisions -- check`, which `npm test` runs too, holds:
- the index, current;
- every cited `DL-nn`, an entry;
- every relative link in the Markdown, a file git lists;
- the open log's entries, lean;
- the comments, free of story history, at their baseline.

`tools/decisions/src/search.test.ts` holds `.rgignore` to the archives. A move is checked by comparing
the text before and after. Run the check after any change to a page or a comment, before the commit.
