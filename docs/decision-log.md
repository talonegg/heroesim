# Decision log

Significant decisions taken during the build, recorded before or alongside implementation.
Append a new entry; never edit an accepted one — supersede it with a later entry that names it.
Every entry says who decided: the owner, or an agent when the epic left a choice open or a
genuine contradiction forced one. Architecture decisions taken during the design session live in
[`./adr/`](./adr/) and are not repeated here.

Format (from DL-215, held by `npm test`; DL-219): `## DL-nn — title`, then
- a line `**Status:** … · **Date:** YYYY-MM-DD · **Decided by:** …`;
- **Context.**, why a decision was needed;
- **Decision.**, in numbered items;
- *Judgement calls, for the owner to see*, where an agent chose what was left open;
- **Consequences.**;
- **Evidence.**, a few lines naming the commits, the reports, the checks and the epic's boxes.

An entry is at most 6 KB. Checks with their counts, mutation runs, the doctor's readings, sweep
figures and a verification's findings go in the commit messages and the harness's reports, which the
Evidence names. An entry before DL-215 is as it was written.

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

## DL-217 — `INPUTS-REQUIRED.md` archived once its live parts moved out, and the README an entry page with the deploy its own document

**Status:** Accepted · **Date:** 2026-10-08 · **Decided by:** the owner ("implement findings #8 and
#9" of the documentation audit)

**Context.** The audit of 2026-10-08 (the v1.1.8 epic, §5, F4 and F6) found `INPUTS-REQUIRED.md`, 48 KB,
frozen at `m8-modules`, with three parts still live:
- its §9, the one list of the environment variables, cited by six comments;
- its §8, the instruction that Random Events' epic open with three blocking questions;
- its row 7.8, which `web/src/deploy.test.ts` read for the Worker's address.

The README was 12.3 KB. Its introduction stopped at `v1.1.0`, and 7.9 KB of it was the deploy, whose
first step still said that work lands on the line's dev branch, though patches are built on their own.

**Decision.**

1. **The environment variables** move from §9 to `docs/environment.md`, still the one place each
   is listed, checked against the variables the code names: every one is listed. Two cells are
   made current: the Cloudflare credentials serve CI's deploy (DL-124), and `HEROESIM_LIVE_URL`
   replaces the addresses in `docs/deploy.md`. The six comments citing "INPUTS §9" and the
   harness README now name `docs/environment.md`.
2. **§8's instruction** moves to `plan.md` §4's Random Events item: its epic opens with a table of
   the owner's inputs, three rows of which, the catalogue, the rate and whom they befall, block
   its build story. The item also carries what DL-82 already answers.
3. **The deploy** moves from the README to `docs/deploy.md`. Its first step is corrected: work lands
   on the line's dev branch or a patch's own, and the release branch is moved to it. A line that
   named INPUTS 7.8 as a place to correct the Worker's address now names this document, as does
   `web/scripts/deploy.mjs`'s message. `deploy.test.ts` reads the guide where it read the README
   and row 7.8, and also checks that the README links it.
4. **`INPUTS-REQUIRED.md` is archived** by `git mv` to `docs/planning/archive/`, its text unchanged.
   215 lines outside `docs/` cite its rows by number, as `INPUTS 7.6`. They stay as they are, like
   citations by DL id, and the archive's index, the epics README and AGENTS.md say where those
   rows are.
5. **The README is an entry page:** what the game is, a status that points at the release ledger
   rather than naming versions, Play, the tools, a line to the deploy, and a complete list of
   documents.

**Consequences.** The README falls from 12,285 bytes to 4,435. The epics README's convention on
tunables now says `engine/src/config.json` and the editor's config kind (DL-204), in place of
`defaultConfig`. Two items of the epic's S5, ADR-0009's random streams and `data-model.md` §7's
history, are not part of these findings and wait.

**Evidence.** `deploy.test.ts` red first on the guide and the README's link (3 tests), then green.
The variables were compared with every `HEROESIM_*`, `CLOUDFLARE_*` and `WRANGLER_*` name in the
code. A scripted check of every relative link in the repository's Markdown: 0 broken. Lint,
typecheck and `npm test` pass.

## DL-218 — A delivery guide in the repository; generated files and applied runs out of the tree; the instructions agents follow made current

**Status:** Accepted · **Date:** 2026-10-08 · **Decided by:** the owner ("implement findings #1, 2, 3
and 4" of the documentation audit), which answers the v1.1.8 epic's Q2 for the review page

**Context.** The audit of 2026-10-08 (the v1.1.8 epic, §5, F2, F5, F6 and F8) found four problems:
- The rules every story agent followed lived only in a session's scratchpad, rewritten for each
  release. Three of the owner's standing rules lived only in an agent's memory.
- Two generated files dominated every search: `docs/quests/calibration.json`, 903 KB on one line
  and stale (content version 31), and `docs/quests/v1.1.4-review.html`, 454 KB.
- The applied portrait runs' folders copied the content and doubled its search hits.
- The instructions agents follow were out of date: the epics README's §3 described the v1.0 flow,
  `approach.md`'s layout lacked `tools/` and `media/`, and `domain.md` and `issue-tracker.md`
  were templates naming skills this repository does not have.

**Decision.**

1. **The delivery guide**, `docs/agents/delivery.md`, linked first from AGENTS.md. It is drawn from
   the v1.1.7 brief and the owner's standing rules, made general to any release, and holds:
   - where things live;
   - the owner's eleven standing rules;
   - line endings, comments and words;
   - a story: read, build, check, record, verify, the epic, commit;
   - a release: plan, close, release by DL-124, record.

   A new DL entry is appended at the log's end (DL-215). The epics README's §3 now points at the
   guide, its old text kept in the archive's index.
2. **The link check.** `tools/decisions`' tests and `npm run decisions -- check` fail on a relative
   link in the repository's Markdown that leads to no file. It was red first on a planted link.
3. **Generated files.** `calibration.json` and `v1.1.4-review.html` are attached to the `v1.1.4`
   GitHub Release, byte for byte (902,839 and 453,861 bytes), removed from the tree and ignored.
   - `calibration.md` stays as the record.
   - The drafts stay: `calibrate.test.ts` reads them.
   - `npm run quest-review` now says to run `calibrate` first when no calibration is there.
4. **Applied runs.** `docs/portraits/analysis/2026-10-01/` and `2026-10-02/` are removed: both
   runs are applied (content versions 19 and 20), and the content and git hold their files. Their
   reports stay. `portrait-apply` and the portrait tool's README now remove an applied run's
   folder in the commit that records it.
5. **Current instructions.**
   - `approach.md` §5's layout gains `tools/` and `media/`, `web/` names both hosts, and §8's
     tunables are `config.json`'s.
   - The epics README's packages include `words/` and the tools.
   - `domain.md` describes this repository's one context, with the decision index.
   - `issue-tracker.md` loses the `/triage` and `/wayfinder` sections.

**Consequences.** A search for "Quest" no longer returns the review page's 213 KB, and a
case-insensitive one no longer returns the 903 KB calibration line. The scratchpad brief is no
longer needed. The guide's rules are the owner's, so a new release's agents read them in the
repository, and the owner's agent memory need not carry them.

**Evidence.**
- The Release's assets match the removed files' sizes.
- `npm run quest-review` without a calibration names the command to run.
- `npm run decisions -- check`, lint, typecheck and `npm test` pass.

## DL-219 — The lean entry held by a test; story ids out of the comments by a rule and a baseline; the Traits' rules, register and editor each told once

**Status:** Accepted · **Date:** 2026-10-08 · **Decided by:** the owner ("implement findings 10, 11
and 12" of the documentation audit; for 11, a ratchet, as the finding says, which answers the v1.1.8
epic's Q4)

**Context.** The audit (the v1.1.8 epic, §5, F1, F7 and F9) found three problems:
- Entries had grown into build journals, about 20 KB each in v1.1.7.
- 1,766 source lines cited a story id, and 109 of them told history by one ("since v1.1.4-S2").
- `docs/agents/traits.md` restated the editor's README, held a 16 KB generated register, and its
  two skills repeated the doctor and Finish steps word for word.

**Decision.**

1. **The lean entry.** The log's header gives the template and a 6 KB cap. Checks, counts,
   mutations, the doctor's readings and sweep figures go in commit messages and reports. A
   verification adds one line to the Evidence. `tools/decisions` holds every entry from DL-215 on
   to the cap, the Status line and the four paragraphs. `docs/agents/delivery.md` says the same.
2. **Story ids.** An agent rewrote 109 lines in 57 files to cite the deciding entry, comments
   only, every fact about old saves, reports or content kept. Six lines wrapped across a line
   break were fixed by hand. A check now refuses a comment that tells history by a story, across
   a line break too. It also holds the lines still citing a story id at or under
   `tools/decisions/story-citations.json`, 1,801 today, counting the M9 follow-ons, to be lowered
   as they go. `comments.md` says so.
3. **The Traits' docs.**
   - The register moves to `docs/agents/traits-register.md`, which `traits doc`, the freshness
     check and the doctor now name.
   - `traits.md` keeps the rules and the steps every session shares, and the two skills point at
     them.
   - The editor's README is the one account of how the editor works. Its advice to change a test
     that pins a default now follows the owner's rule: report it.

**Consequences.**
- `traits.md` falls from 26,057 bytes to 5,852.
- A new entry, or a comment that narrates by a story, fails `npm test`.
- About 1,800 story citations remain, to fall by the baseline.
- The pre-M0 `CONTEXT.md` provenance, the S7 item that goes with it, waits.

**Evidence.**
- Each check was red first: the lean template on its fixtures, the story rule on a planted source
  file, the freshness test on the new file's message.
- The Traits doctor reads no drift before and after.
- The register's part was compared byte for byte before its move.
- Lint, typecheck and `npm test` pass.
