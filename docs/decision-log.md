# Decision log

Significant decisions taken during the build, recorded before or alongside implementation.
Append a new entry; never edit an accepted one — supersede it with a later entry that names it.
Every entry says who decided: the owner, or an agent when the epic left a choice open or a
genuine contradiction forced one. Architecture decisions taken during the design session live in
[`./adr/`](./adr/) and are not repeated here.

Format: `## DL-nn — title`, then **Status**, **Date**, **Decided by**, **Context**, **Decision**,
**Consequences**.

**Where the entries are** (DL-215). This file holds the open release's entries, and a new entry is
appended at its end. Every earlier entry is in [`./decisions/archive/`](./decisions/archive/), one
file per release, and the Pre-M0 review decisions are in
[`./decisions/archive/pre-m0-review.md`](./decisions/archive/pre-m0-review.md). At a release's
close its entries move to an archive file of their own, `DL-<first>-<last>-<release>.md`, with the
text unchanged.

- *An item superseded in full* is a one-line stub in its entry, naming the entry that superseded it.
  Its text is in [`./decisions/archive/superseded/`](./decisions/archive/superseded/), in a file
  named for its entry.
- *An item superseded in part* keeps its text, with a note beneath it. The same file in
  `superseded/` records what superseded it.
- *When a new entry supersedes an earlier item,* the same commit writes the stub or the note and the
  record in `superseded/`. These, a move with the text unchanged, and a dated note are the only
  changes made to an accepted entry.

[`./decisions/index.md`](./decisions/index.md) lists every entry: its date, its title, what
superseded it and the file that holds it. `npm run decisions -- index` writes it after an entry is
added, moved or superseded. `npm test` fails when it is stale, or when a `DL-nn` cited anywhere in
the repository is no entry. To read an entry, find its file in the index, then search the file for
`## DL-nn `.

---

## DL-215 — The decision log archived by release, superseded items set apart, and an index made from its headings

**Status:** Accepted · **Date:** 2026-10-08 · **Decided by:** the owner ("implement findings #5",
with superseded decisions in a folder of their own under the archive), choosing whole items as what
moves, from three ways offered

**Context.** The documentation audit of 2026-10-08 (the v1.1.8 epic, §5, F1) found this file at
2,358,736 bytes in 27,161 lines: 214 entries and the Pre-M0 review decisions, with no index. An
agent found an entry by searching for its heading and could not read the file whole. A
supersession was written only in the later entry, and almost always of one item, or of a clause of
one, rather than of a whole entry.

**Decision.**

1. **The archive.** DL-01 to DL-214 move to `docs/decisions/archive/`, in nine files by release,
   and the Pre-M0 review decisions to a tenth, `pre-m0-review.md`. Their text is unchanged except
   as item 2 says. This file keeps its header and the open release's entries. A new entry is
   appended at its end, no longer before the Pre-M0 section. At each release's close its entries
   move to an archive file of their own.
2. **Superseded items.** An item a later entry superseded in full moves to
   `archive/superseded/DL-nn.md`, under `## DL-nn item N — superseded by DL-mm`, leaving a one-line
   stub in its entry. An item superseded in part keeps its text, with a note beneath it naming the
   superseding entry and what it changed. Its record, `## DL-nn item N — in part, by DL-mm`, is in
   the same file. The supersessions were read from the log's own words: "supersedes", the
   "*Superseded:*" lists, and "replaces", "reverses" or "in place of" where they meant the same.
   There are 85 records over 55 entries and one Pre-M0 item: 6 items in full, DL-64 item 4,
   DL-88 item 10, DL-105 item 9, DL-111 item 10, DL-112 item 11 and DL-134 item 12, and 79 in part.
   An agent read every one against both texts. Some phrases stay as they are:
   - supersessions of something outside the log (`plan.md`, INPUTS, the requirements, an epic's
     order);
   - restatements of an earlier supersession;
   - amendments worded as such.
3. **The header's rule.** "Never edit an accepted one" now allows a move with the text unchanged,
   item 2's stub and note, and the dated notes v1.1.7 began. Nothing else in an accepted entry
   changes.
4. **The index.** `docs/decisions/index.md` has one row per entry: its date, its title cut to about
   100 characters, what superseded it and its file. `npm run decisions -- index`, a new workspace
   package (`tools/decisions`), writes it from the entries' headings and the records' headings.
   It is never edited by hand.
5. **The checks.** The tool's tests hold the index current. They also hold every `DL-nn` cited in
   the repository's text files (git's list, tracked or new) to an entry. A test that planted
   a fictional id as a config change's reason (`tools/editor/src/config-kind.test.ts`) now builds
   it, so the check reads none there.

**Consequences.** This file falls from 2.36 MB to under 10 KB. Reading an entry costs the index, about
50 KB, and the entry's archive file. The references to `docs/decision-log.md` by path still lead
here, and this header names the index. The citations by id, 4,336 in code, need no change. AGENTS.md
and CONTEXT.md name the index and the Pre-M0 file. The audit's other findings stay in the v1.1.8
epic.

**Evidence.** The split was verified by rebuilding each of the 215 blocks, the 214 entries and the
Pre-M0 section, from the archive and `superseded/`, undoing every stub and note: all 215 are equal
to the log at `70b83b1`. The supersessions were classified with line ranges (scratch files, not
committed). `npm test`, lint and typecheck pass.

## DL-216 — The closed epics archived, and `plan.md` §2 the one release ledger

**Status:** Accepted · **Date:** 2026-10-08 · **Decided by:** the owner ("implement findings #6 and
#7" of the documentation audit)

**Context.** The audit of 2026-10-08 (the v1.1.8 epic, §5, F3 and F4) found each release recorded
in four places: the epic's Status line, `plan.md` §4, the epics README's register and the DL entry.
It also found about 535 KB of epics and reviews closed and only history, linked only from
`plan.md` and the log. `plan.md` was 35 KB, with a release paragraph and stacked amendment notes for
each release, and the epics README 22.5 KB, 11.9 KB of it the register's release narrative.

**Decision.**

1. **The archive.** The epics of M0 to M8, M9 and its follow-on, v1.0.1 and v1.1.2 to v1.1.7 move
   to `docs/planning/archive/`, with `docs/web-ui-review-2026-09-29.md`, by `git mv`, their text
   unchanged. The archive's `README.md` lists each epic: the release it became, its decisions and
   any box left open (M7's twenty-year save, the owner's). `docs/planning/epics/` keeps the open
   release's epic, `INPUTS-REQUIRED.md` and its README.
2. **The record kept.** What the live documents no longer carry stays word for word in the
   archive's `README.md`, only its links re-pointed:
   - the register's rows;
   - the first build's clock, "What the first build actually took";
   - `plan.md` §2's M9 row and release narrative;
   - `plan.md` §4 as it stood at v1.1.7's release.
3. **One release ledger.** `plan.md` §2 gains a table, one row per release from `v1.0.0` to
   `v1.1.7`: date, pull request, merge commit, its decisions and its epic. The tags, merges and pull
   requests were read from git and GitHub. A short paragraph states the release flow in force
   (DL-124) in place of its history from DL-86 to DL-109. A release's close adds its row and fills
   its epic's Status line, and nothing else records it.
4. **`plan.md` §4 looks forward only**, in order:
   - now `v1.1.8`;
   - then Random Events, M10 (#12, its groundwork #15 and #17);
   - the list after it, unchanged;
   - the backlog, each item stated as it now stands, with its decisions and its issue where it has
     one.
5. **The epics README's register** holds the open epic's row alone. A closed epic's row moves to the
   archive's index.

**Consequences.** `plan.md` falls from 35,488 bytes to 20,349, and the epics README from 22,533 to
7,266. The decision log's archive still names the moved epics by their old paths in its text. Their
file names are unchanged, and the archive's index finds them. M9-redesign's §3, the CLI's commands
in the browser, is archived with its epic until the owner answers the v1.1.8 epic's Q3. The audit's
remaining findings stay in that epic.

**Evidence.** A scripted check of every relative link in the repository's Markdown: 0 broken.
`npm run decisions -- check`, lint, typecheck and `npm test` pass.
