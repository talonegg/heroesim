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

## DL-220 — `plan.md` cut to the delivery of releases; the first build's plan archived

**Status:** Accepted · **Date:** 2026-10-08 · **Decided by:** the owner ("update plan.md such that:
section 1 - focus on structure of delivery going forward by release increments and sub increments
… section 3, remove section and archive the details of M0 to M8")

**Context.** `plan.md` was still the first build's plan with a ledger and a "Next" list added: §1
described milestones, issues and tags no release uses, §2 held the M0 to M9 milestone table, §3 the
M0 to M8 increments (11 KB), and §5 pointed at DL-01 to DL-10. Its §1 was also where code and
ADR-0002 found the accepted exceptions to ADR-0002.

**Decision.**

1. **§1, How delivery works:** a short background of the first build, M0 to M8 to `v1.0.0`; then
   the units of delivery, a line (`v1.N`), a release (`v1.N.P`, the increment) and a story
   (`v1.N.P-Sk`, the sub-increment); how one release follows another, `v1.1.N` to `v1.1.N+1` and a
   new line's `v1.2.0`; and a feature larger than a release keeping a milestone number, as M9 did
   and M10 will.
2. **Archived:** the old §1, §2's milestone table and its notes, §3's increments and §5, word for word,
   in `docs/planning/archive/first-build-plan.md`, with a row in the archive's index.
3. **Renumbered:** §2 is the release ledger, now titled Releases, and the old §4 is §3, Next.
4. **The accepted exceptions** move to ADR-0002, amended, and the engine's comments and
   `controller-reads.test.ts` cite it in place of `plan.md` §1.
5. **References** to `plan.md`'s sections are re-pointed: `delivery.md`, the README, the epics
   README, the archive's index, ADR-0005, `approach.md` §6, `data-model.md` and `requirements.md`.
   Closed epics and earlier entries keep the numbers they cited.

*Judgement calls, for the owner to see:*
- The milestone table in §2 was archived with §3, being M0 to M9 detail. M9's row is in the
  ledger as `v1.1.0`.
- The new §1 names a line's branches `v<line>.<patch>-dev` and `v<line>-release`, by DL-124. DL-99
  had named one `v1.2-dev` for M10, before DL-124 gave each release its own branch. The M10 epic
  settles it.
- "Measure before tune" and the twenty-year slice are archived, not restated. DL-84, DL-83, the
  Gate and `harness/README.md` hold them live.

**Consequences.** `plan.md` falls from 20,719 bytes to 8,369 and is read forward. A release's
record is unchanged: the ledger's row and the epic's Status line. The first build's plan is read
from the archive.

**Evidence.**
- The archived text compared equal, line for line, to `plan.md` at `b6d455c`.
- `npm run decisions -- check` passes (links, citations, the index and the lean entry).
- Lint, typecheck and `npm test` pass.

## DL-221 — The delivery guide accepted; the archives out of a search; ADR-0009 and data-model §7 trimmed

**Status:** Accepted · **Date:** 2026-10-08 · **Decided by:** the owner ("I can accept delivery.md.
Can you action the next 2 actions: the search target of under 50 KB …; S5's ADR-0009 and
data-model.md §7 trims")

**Context.** Three boxes of the v1.1.8 epic were open. S1's guide waited for the owner's reading. S2's
search for `Quest` in `docs/` returned 318 KB, 274 KB of it from the two archives, against a target
under 50 KB; whether a search skips them was the owner's (the epic's S2). S5's trims waited: ADR-0009
carried five amendments (about 2.9 KB) that are a list of streams, and `data-model.md` §7 carried the
targets' rebaseline history, which `harness/gate.json` now holds live.

**Decision.**

1. **The guide** `docs/agents/delivery.md` is accepted as written (DL-218).
2. **The archives out of a search.** `docs/.rgignore` names `decisions/archive/` and
   `planning/archive/`, so ripgrep, and the agents' search built on it, leaves them out by default.
   A search that names an archive's path, or runs `rg -u`, still reads it, and the indexes lead to
   them. A test holds the file to the two folders, each existing. `.rgignore`, not `.ignore`, so that
   only ripgrep skips them, and an editor's search does not. The guide and AGENTS.md say so.
   *Superseded in part by DL-222 item 2, 2026-10-08: a third folder, `adr/archive/`, and the test
   holds three; the record is in [superseded/DL-221.md](./decisions/archive/superseded/DL-221.md).*
3. **ADR-0009.** *Superseded by DL-222 item 1, 2026-10-08; its text is in [superseded/DL-221.md](./decisions/archive/superseded/DL-221.md).*
4. **`data-model.md` §3.1** gives the streams as a table, in `streamNames`' order, each with what
   draws from it and the decision, checked against `engine/src/rng.ts`, and the accepted exceptions
   in a paragraph.
5. **`data-model.md` §7** points at `harness/gate.json` for the targets, keeps the save's 30 MiB
   gzipped mean, and keeps the levers as they stand. The first targets, the M8 rebaseline's table and
   the sizes at each close are left to DL-08, DL-81, DL-84, DL-184 and the reports.

*Judgement calls, for the owner to see:*
- Archiving the ADR's amendment text word for word was not done; each amendment's decision is its DL
  entry, and the text is in git at `b6d455c`.
- No test holds the 50 KB budget itself, since the live documents grow; the measure is the epic's.

**Consequences.** A search of `docs/` for `Quest` returns 44 KB; the same in the archives, by path,
returns 274 KB. Glob still finds archive files by pattern. ADR-0009 falls from 3,980 bytes to 1,859,
and `data-model.md` §7 from 3,932 to 1,448.

**Evidence.**
- The `.rgignore` test was red on a planted removal, then green.
- `npm run decisions -- check`, lint, typecheck and `npm test` pass.

## DL-222 — ADR-0009 restated from every decision on streams, its old wording archived

**Status:** Accepted · **Date:** 2026-10-08 · **Decided by:** the owner ("archive adr-0009 old
wording, and provide, succinctly and clearly the latest version of the ADR based on the cumulation of
all subsequent DLs")

**Context.** DL-221 item 3 cut ADR-0009's five amendments to a summary and left their text to git.
The ADR still read as its first decision plus that summary; the rules agents follow on streams were
spread over some twenty entries, from DL-12 to DL-208.

**Decision.**

1. **ADR-0009 restated** as the decision now stands. Its decision paragraph names the generator and
   seeding (DL-12), and seven rules follow:
   - a rule draws from its component's stream only;
   - a new component gets a new stream, appended last;
   - draw counts are fixed by the rule, never by what is chosen or written;
   - the accepted exceptions;
   - a module's own stream;
   - a save gaining a stream it lacks;
   - draws outside the world.

   Its Consequences add the indirect shift DL-185 found and what a change to the generator needs. It
   supersedes DL-221 item 3 in full; the stub and the record are written.
2. **The old wording**, the ADR as it stood at `b6d455c`, is archived word for word in
   `docs/adr/archive/0009-named-random-streams-per-subsystem.md`, linked from the ADR. `docs/.rgignore`
   leaves `adr/archive/` out of a search, as it does the others, and its test names it.
3. **`data-model.md` §3.1's table** adds a Rival replacement and a Succession to `generation`
   (DL-28, DL-102).

*Judgement calls, for the owner to see:*
- The ADR's file name is kept, so that no link moves. Its title now says "component", the word the
  2026-09-28 amendment chose.
- The decisions the ADR rests on were found by reading every entry that names a stream, 58 in all.
  Those that only re-proved "no draw moves" for one story are not cited.

**Consequences.** ADR-0009 is the one place the rules on streams are stated, at 3,969 bytes. `data-model.md`
§3.1 lists the streams, and the decision log holds each rule's history.

**Evidence.**
- The archived text compared equal to `b6d455c`'s, but for one re-pointed link.
- The `.rgignore` test was red with the third folder unlisted, then green.
- `npm run decisions -- check`, lint and typecheck pass. `npm test` passed 229 of 231 files twice:
  two twenty-year engine tests (`rivals-build-and-buy`, `transfer-generator`) timed out at their
  300 s hook under the full run's load, and pass alone (225 s for both). Since the last green run
  only docs, comments and test strings changed. Reported to the owner, the timeouts unchanged.

## DL-223 — The owner's answers to Q3 and Q5: M9's table stays archived; the harness's reports pruned to those cited live

**Status:** Accepted · **Date:** 2026-10-08 · **Decided by:** the owner, in a walk through the v1.1.8
epic's open questions: Q3, "archive this page, it is out of date and not referenced by anything"; Q5,
"c"

**Context.** Two of the epic's questions (§6) were open.
- Q3: M9-redesign's §3, a table of every CLI command's control in the browser, already sits in the
  archive with its epic (DL-216). It was last ticked at M9-F6, and six releases have changed the page
  since. Nothing live cites it.
- Q5: `harness/reports/` tracked 94 files (6.9 MB). Ten are cited by a test, `gate.json`, a live
  document or the open log, 50 only by archived entries and epics, and 34 by nothing. The folder is
  ignored, so it costs no search, and history keeps every file whatever the tree holds.

**Decision.**

1. **Q3.** The table stays archived with its epic, with no live copy and no parity test. The archive's
   index says so.
2. **Q5 (c).** The 84 reports nothing live cites leave the tree; none is uploaded. The ten kept are
   `gate.json`'s baseline and sources, the reports `gate.test.ts`, `run-report.ts` and `report.ts`
   read, and the two the Quest drafts' notes name. The harness README says how to read the others
   from git history at `b6d455c`.
3. **From now on** a release's record removes the reports nothing live cites any more
   (`docs/agents/delivery.md`).

*Judgement calls, for the owner to see:*
- "Cited live" was read as cited outside `harness/reports/` and the two archives. So `m9-v117-s8`,
  v1.1.7's closing sweep, which only its archived entry names, left the tree with the rest, though the
  epic's S8 had listed it to keep.

**Consequences.** `harness/reports/` tracks 10 files, 1.3 MB. A path to a report in an archived entry
no longer opens in a checkout; `git show b6d455c:<path>` prints it. The clone is no smaller.

**Evidence.**
- The 84 were found by searching the repository, the reports and archives aside, for each file's
  name; each is present at `b6d455c`.
- `npm run decisions -- check`, lint, typecheck and the harness's tests pass.

## DL-224 — The owner's answers to Q6: `origin/HEAD` on `main`, #34 closed, #33 corrected, the agent's memory pruned

**Status:** Accepted · **Date:** 2026-10-08 · **Decided by:** the owner, answering the v1.1.8 epic's Q6
one part at a time: "b", "a", "a", "a"

**Context.** The audit's F10 found four things outside the documents. The local `origin/HEAD` still
named `master`, a branch of one commit already in `main`, so tools took `master` for the main branch.
Issue #34 was open and `ready-for-agent` though v1.1.6 built it. Issue #33 was open with one criterion
met and one moot. The agent's memory repeated release status the repository holds, with stale
instructions among it.

**Decision.**

1. **`origin/HEAD`** is set to `main` (`git remote set-head origin -a`). `master` is to be deleted,
   locally and on GitHub. The agent's permissions refused the deletion, so it is left to the owner.
2. **#34 is closed** as done, with a comment naming DL-174, DL-203 and ADR-0011. Its schema
   criterion gave way to the owner's same-shape design (DL-203).
3. **#33 stays open, its body corrected.** The §7 criterion is ticked, met by the Gate's save line
   (DL-188); the harness's part is moot, since it writes no saves. What remains, the CLI's gzip saves
   and a content change recorded on load, is in `plan.md` §3's backlog by issue number.
4. **The agent's memory** keeps the owner's preferences, each pointing at its rule in
   `docs/agents/delivery.md`, the open release's note, and two facts the repository lacks: the
   picture inbox's path and how to merge a Dependabot pull request while a retarget is unreleased.
   The four release-history files are deleted.

**Consequences.** Tools read `main` as the main branch. No `ready-for-agent` issue asks for finished
work. The memory falls from 28.6 KB to 6.2 KB, with no instruction that contradicts the guide.

**Evidence.**
- `git symbolic-ref refs/remotes/origin/HEAD` reads `refs/remotes/origin/main`.
- #34 reads CLOSED; #33's body carries three notes dated 2026-10-08.
- `npm run decisions -- check` passes.

## DL-225 — v1.1.8-S7 closed: CONTEXT.md's story ids replaced by their entries, and `neutral --expect` passing

**Status:** Accepted · **Date:** 2026-10-09 · **Decided by:** the owner ("run s7"); the rewriting an
agent's, by the comment rule

**Context.** S7's rule and baseline were built in DL-219. Two items waited: `CONTEXT.md`'s story
provenance, 48 lines citing a story id, and the `neutral --expect` proof that no play moved.

**Decision.**

1. **CONTEXT.md** cites no story id. Where a DL citation stood beside one, the id is dropped. A story
   id standing alone is replaced by the entry that recorded the story's build, read from the index.
   A sentence that told history by a story ("Since v1.1.3-S5 …") now states the current fact with its
   entry. The Stat entry, which `content/src/content.test.ts` reads, is unchanged.
2. **The play proof.** `HEROESIM_WORKERS=8 npm run harness -- neutral m9-v118-s7-neutral --expect
   29c09fb4…` ran alone and passed. The fingerprint is v1.1.7-S6's (DL-212), the content and config
   versions being unchanged since. The report is kept in the tree, as an open entry cites it.

*Judgement calls, for the owner to see:*
- Where a story has two entries, the "built" one is cited: v1.1.4-S7 as DL-159, not DL-158.
- Form's "a loss may be steadied" cited v1.1.4-S4 alone; it now cites DL-155, that story's entry. The
  agent's first choice, DL-154, was corrected in verification.

**Consequences.** S7 is complete. CONTEXT.md's history is in the log, and no story id is left for a
reader to look up.

**Evidence.**
- Rewritten by a Sonnet agent and verified by Opus: each of the 25 entries cited checked against its
  story's row in the index, and every changed passage read against its old text.
- The report `harness/reports/m9-v118-s7-neutral-2026-10-08.md` and its JSON.
- `npm run decisions -- check`, lint, typecheck and the content tests pass. `npm test`: 230 of 231
  files; `transfer-generator`'s twenty-year hook timed out at 300 s under the full run's load, as in
  DL-222, and is reported, not changed.

## DL-226 — v1.1.8-S8 closed: the close's review, its fourteen findings fixed, and the Gate met

**Status:** Accepted · **Date:** 2026-10-09 · **Decided by:** the owner ("start s8"); the findings'
fixes the agents', by the review

**Context.** S8 closes v1.1.8: the reports pruned (DL-223), a review of every change since `v1.1.7`'s
merge, its findings fixed test first, every check, the Gate, and the record brought up to date. The
release waits for the owner's word (DL-124).

**Decision.**

1. **The review** (an Opus agent over `origin/main` to the working tree) found no blocker and no change
   to play, and fourteen findings, all fixed:
   - `tools/decisions`: a heading begun as an entry but malformed is a problem, not left out (log,
     lean); the link check reads titles, angle brackets and reference links, skips code, resolves `/`
     from the root, reports a bad escape, and takes targets from git's file list, case-exact; a
     record must spell its entries as their headings do; the story baseline is a ratchet, failing
     below it as above, and read only as a whole number; history told by a story is found in any case
     and spacing and after a verb of change and "by"; `.mts` and the ignore files are read for
     citations.
   - Six comments that told history by a story rewritten to cite their entries; the baseline lowered
     from 1,801 to 1,795.
   - `quest-review`'s missing-calibration message names the run that writes the drafts' calibration
     elsewhere, so `calibration.md`, the kept record, is not rewritten; held by a test.
   - Docs and comments: the register's path, ADR-0002 for the accepted exceptions, DL-08 and DL-84 for
     the first targets, "ADR-0009" without the archived dates, "component" for "subsystem"; the guide's
     release step re-points the links an archived entry carries; DL-221 item 2's note and record.
2. **Verified** by a second Opus agent: each fix re-derived and eighteen mutations tried. Two survived,
   the ratchet's exit code and a fractional baseline; tests for both were added, red under the
   mutation, then green.

**Consequences.** The Gate is met:
- *Play unchanged:* against `25f8fa0`, nothing under `engine/src/` or `content/` changes but comments;
  `neutral --expect 29c09fb4…` passes.
- *Nothing lost:* the citation and link checks pass, and every move is in the archives or at
  `b6d455c`.
- *Every check:* as in the Evidence.
- *Smaller to read:* AGENTS.md, the guide, `plan.md`, the epic, the index and the open log total
  127,237 bytes, against about 2.5 MB at the audit.

**Evidence.**
- `npm test`: 232 files, 6,107 tests, alone. Lint, typecheck, `npm run decisions -- check`, the build
  with check-bundle (827,430 bytes of 850 kB) and `npm run e2e -w web` (115) pass. The traits doctor
  reads no drift (107 reads).
- `harness/reports/m9-v118-s8-neutral-2026-10-09.md` and its JSON: 10 games of 20 years, alone, 389 s.
- The earlier timeouts of two twenty-year engine tests (DL-222, DL-225) did not recur on a run alone.
