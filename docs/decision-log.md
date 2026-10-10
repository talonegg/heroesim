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

## DL-255 — A merge of docs, records and the release pipeline alone releases nothing: no tag, no deploy

**Status:** Accepted · **Date:** 2026-10-10 · **Decided by:** the owner, answering on 2026-10-10
"record-only merges": (c) change the pipeline, by rule (a); how it is built by the agent, marked
below

**Context.** After v1.1.9 was released and recorded, `v1.1-release` was fast-forwarded to its
record, and CI opened #62, "Release v1.1.10 from v1.1-release", holding only docs and records.
Every merge into `main` released its line's next patch (DL-124 item 3), so merging the record would
have tagged and deployed v1.1.10, a tree no player could tell from v1.1.9. The owner wants #62
merged with no new tag, v1.1.9 staying the release.

**Decision.**

1. **The rule** (the owner's). A merge into `main` releases nothing (no tag, no deploy, no GitHub
   Release) when every path that differs between the newest release tag and the merge's tree lies
   in `docs/`, `harness/reports/` or `.github/`, is a Markdown file (`*.md`), or is
   `web/scripts/release.mjs` or its test. Anything else releases as before.
2. **The judgement.** `isRecordOnly(paths)` in `web/scripts/release.mjs` applies the rule, and
   `release.mjs record <commit> [base]` prints `record` or `release`, the base by default the newest
   release tag. It reads `git diff --name-only --no-renames -z`, so a rename counts both its paths.
   With no release tag it prints `release`; a git failure fails the step.
3. **The pull request.** `release-pr.yml`, when the branch's tip is a record, titles its pull request
   "Record from `<branch>` (no release)", with a body saying its merge releases nothing, and edits an
   open one's title and body alike. Otherwise it is unchanged.
4. **The merge.** `release.yml` keeps every refusal: one merged pull request, its tree the merge's,
   and `next`'s refusal of a branch that is no release branch or an older line's. A merge its tag
   already marks is deployed again, as before. Then, for a record, it makes no tag, writes the
   output `tag` empty and says so in the run's summary; the `deploy` job runs only when `tag` is not
   empty, and no tag is pushed, so `deploy.yml` is not reached.
5. **The docs.** `docs/deploy.md` says when a merge is a record, and the README's line says
   merging releases unless it holds records alone.

*Judgement calls, for the owner to see:*
- **`release.d.mts` counts as `release.mjs`.** The function's type is declared there for web's
  typecheck; without it #62, which carries this change, would release. It ships nothing.
- **The workflow's tests are in `release.test.ts`**, not beside DL-124's in `deploy.test.ts`, which
  is not a record path: adding them there would make this change release.
- **No change is a record.** A merge whose tree is the newest release's makes no tag; before, it
  made a new tag of the same tree.
- **The base is the newest release tag, not the last record** (26cd276 was v1.1.8's): the tag's tree
  is production's, and what differs from it is what a merge would deploy. Records merged after a
  release are judged against it again, so the first merge that changes anything else releases them
  all with it.
- **`*.md` is matched by its lower-case ending**, anywhere; a case that does not match releases.

**Consequences.** #62, once this is pushed to `v1.1-release`, is retitled "Record from
v1.1-release (no release)"; merging it moves `main` and leaves v1.1.9 the newest tag and production.
A record's merge still runs `check` on its push to the release branch. A change to `.github/` alone
deploys nothing, so a workflow's change is first exercised by the next release.

**Evidence.** The commit `v1.1.9 (DL-255)`, whose message holds the checks and the dry runs on this
repository.
Verified 2026-10-10 at 4a3d70f: 21 mutations red (one survivor closed by a test), and a scratch repository's tag, record merges and code merge dry-run through both workflows' blocks, found item 2's "a git failure fails the step" untrue (inside `[ "$(...)" = record ]` a failing judgement fell through to tagging and deploying), so both workflows now take the verdict as a statement of their own, test first; added a test that the base is the newest tag by number, and the record's pull request to delivery.md.

## DL-256 — The `v1.2` line: the Guild as an institution, from an independent design brief; the owner's answers and the backlog

**Status:** Accepted · **Date:** 2026-10-10 · **Decided by:** the owner, answering four rounds on
2026-10-10; the agent's drafting marked below

**Context.** The owner commissioned an independent design brief for a guild-management game,
preferring its "Football Manager fantasy" and "dynasty or club" loops, and asked for it to be assessed
against the build. The build already holds most of the brief's first prototype. What it lacks is cost:
the `v1.1.9` gate (`harness/reports/v1.1.9-gate-2026-10-10.md`, the automatic player) measured about
403 Quests a Guild-year at a mean Party of 1.55, with no fatigue, benching cost, contracts or
ambitions, and development automatic. Success snowballed outside DL-83's bands: first by Fame at 91.6%
of year-starts (40–60%), no Bankruptcy in 50 games (5–15%), 4.28 Deaths a game (25–40) and 6.8% of
Quests failed (20–30%). Of the brief's nine playtest sentences, one could be said and three partly.

**Decision.**

1. **The charter.** A new line, `v1.2`. Requirements §1's five pulls become the brief's six pillars,
   and principle 2 is restated; Loot and Campaigns serve Reputation and History. The brief's twelve
   parts are drafted as `docs/management-model.md`, to be refined.
2. **Scarcity, then Fatigue.** Fewer, longer, weightier Quests, Party minimums of three or more, a
   cap on Parties out and XP undivided; Fatigue in the next release. In time, a Guild's Quests grow
   with its Fame and its Patrons' Regard.
   *Superseded in part by DL-257, 2026-10-10: a floor of two; no cap; XP divided. The record: [superseded/DL-256.md](decisions/archive/superseded/DL-256.md).*
3. **The ending.** The game ends at the Guildmaster's Retirement (R34) with a Legacy review. There is
   no dynasty.
4. **The playtest** closes each epic, scored by the nine sentences.
5. **Private offers** from a Patron at warm Regard or better, more with Fame, beside the shared Board.
6. **Pushback.** Competent Rivals first (reward, Fame and Patron weighed; the best Hero they can
   afford; a dispatch whenever staffed; the first pick shared), then Fame raising the stakes.
7. **Contracts** for every Hero in every Guild: a wage and a length, renewal or the pool, and release
   with a payout.
8. **Development.** A Training focus, with Skills growing, first; Mentors after.
9. **The talent market.** Unattached Heroes of every age and Level, Stats as ranges until scouted,
   scouting an Outing, and Judgement setting the hints' resolution.
10. **Death** is rare, falls on the hardest Quests, and its danger is shown; DL-83's band is lowered
    to about 3–8 a game, its figure set in `v1.2.0`'s inputs. One config setting, the Death factor,
    scales every content Death chance, so the rate is tuned without code (the owner's addition).
11. **Success.** The Legacy review, then an Aim chosen at setup and judged there.
12. **Random Events** wait until the line's core is built, their catalogue drawn from it.
13. **The Captain**, one a Guild. Their Party gains Morale and effectiveness, and the Roster a little
    Morale while they are at home.
14. **Ambitions**, one a Hero, from a simple, configurable list in content that later expansions
    enrich.
15. **Poaching**, after Contracts and Ambitions: approaches during a Contract, answered by a raise, a
    sale or a refusal at a Morale cost.
16. **Fame stays one total.** A Guild's Reputation in a Sphere aggregates the Regard of that Sphere's
    Patrons for it.
17. **Workers**: a retiring Hero may stay on in a post, as a later feature.
18. **Regard moves both ways**, its bands shown in the Party builder.
19. **Fatigue** is a State, rising on Quests and falling at home.
20. **The page** keeps the 20 Stats.
    - Tiles: a Captain icon, and Morale and Fatigue indicators. Area scores and the wage are
      designed later.
    - Table: the icon, and filterable columns for Morale, Fatigue, Ambition and Contract.
    - Phone: the icon by the name, and those four as a category opened like the Stat areas.
21. **Culture** is named from the record and read by no rule now; rules that read it come later.
22. **Career stages** are worked out and shown, and read by Ambitions and the Legacy review.
23. **The record.** This entry, the model page, the charter, `plan.md` §3 and delivery.md's playtest
    go on `v1.2.0-dev`, cut from `main`, released as records alone (DL-255).

*Judgement calls, for the owner to see.*
- The backlog's order in `plan.md` §3 is the agent's. It was put to the owner, who changed nothing.
- Five planned words clash with the glossary: Contract, Reputation, Career stage, the owner's
  "staff" and a "rivals" Regard band. The model page lists them, and each enters CONTEXT.md, its
  clash resolved, in the epic that builds it. "Squad" and "team" stay Party, and a "recruit" an
  Unattached Hero.
- The model page is a new home, registered in documentation.md's table.
- `loot.ts`'s comment citing principle 2's fourth pull is left for the release that touches it, so
  that this change stays records alone. The epics README's citation of the old principle 2 is cut.

**Consequences.** `v1.2.0` is next, and its epic opens with an inputs table. Its plan entry
supersedes, with their records, the items it changes, among them DL-182's XP split and DL-83's band
for Deaths. #51 is spread across the releases that change what it tunes. GitHub's issues are
re-labelled only on the owner's word.

**Evidence.** The commit `v1.2.0 (DL-256)`. The assessment's figures are from the gate report named
above.

*Note, 2026-10-10 (the owner's answers on three glossary clashes).* On the live pages, item 9's
"talent market" is Scouting and a deeper Unattached pool (the glossary avoids Talent and keeps Market
for Items); the model page is the Guild Management Design, `docs/management-design.md` (the glossary
avoids Model for the World State); and item 20's area scores are a summary figure for each Stat area,
named when the tile is designed.

## DL-257 — v1.2.0 planned: fewer, weightier Quests as tiered Quest templates with Beats, Death by Tier, a Party floor of two, and content built to grow; nothing tuned

**Status:** Accepted · **Date:** 2026-10-10 · **Decided by:** the owner, answering Q1–Q26 on
2026-10-10 (the epic's §6); the defaults, the stories and their order are the agent's, approved by
Q24 and Q26

**Context.** DL-256 made `v1.2.0` the line's first release: fewer, longer, weightier Quests, Party
minimums, the Death factor, rewards rebalanced. The engine at `0443c58` refills a Board of 6 each
morning, draws durations apart from difficulty and prices a Quest by difficulty alone. Party sizes
live in the templates, from 1–2 to 3–5. XP is divided by the Party, and no setting scales Death. The
owner was grilled in four rounds.

**Decision.**

1. **Tiers** (Q4, Q9, Q13, Q24). A template offers consecutive Tiers of a five-row ladder in config:
   for each, a difficulty band, days, Beats, Loot, `rewardFactor`, `xpFactor`, `deathScale` and
   `fameMinimum`. A template may override any figure for any Tier. A Quest's days sit in its Tier's at
   the place its difficulty sits in its band. Built in full now, for much more content later.
2. **Beats** (Q14). A template is an ordered list of Beats, each a narrative line and an Encounter
   pool by kind, tag or name. A Quest plays its Tier's count of them, one Encounter drawn from each,
   none twice; a Finale is last.
3. **The Board** (Q7, Q15, #22). Tiers are drawn around 1 + ⌊the world's mean Level ÷
   `levelsPerTier`⌋, the same for every Guild. A Guild below a Tier's `fameMinimum` may not take it;
   the minimums are 0.
4. **The growing Board** (Q3, Q10). Its size is the smaller of a cap and a start plus growth by the
   Year, at 6, 0 and 6: the rule built, play unchanged.
5. **Death** (Q5, Q17). An Encounter's Death chance × `deathFactor` (1) × its Tier's `deathScale`: 0
   for Tiers 1–3, 1 for 4–5. A Quest that can kill is marked Deadly on the Board card (Q18), with no
   figure in the Party builder.
6. **Parties** (Q1, Q2, Q8). Templates at a minimum of 1 are written at 2, and the rest keep theirs.
   No template has a maximum, and nothing caps the Parties out. XP stays divided by the Party sent
   (DL-182 stands).
7. **Nothing tuned** (Q6, Q11, Q12, Q23).
   - Every DL-83 band is reported against v1.1.9's figure, none to be met.
   - `gate.json` drops the player's Bankruptcies for the Targets and keeps its correctness and
     performance lines.
   - The reward and XP factors keep a Party's Wealth and XP a Day away at v1.1.9's.
   - The player's Deaths are reported against DL-256 item 10's 3–8 a game, which supersedes DL-83
     item 6's 25–40.
   - #51 and #22's premium wait for the release that tunes the economy.
8. **Content built to grow** (Q16, Q19, Q22). Quest templates, Encounters, Items and Loot tables move
   to one file per row, through a loader any kind can use. Editor commands and the skills
   `quest-draft` and `encounter-draft` are the only way Quest templates and Encounters change, with
   `quests doctor`.
9. **Words** (Q21). Tier and Beat enter the glossary, the entries avoiding them rewritten, with
   Deadly and Death factor.
10. **The aim** (Q20): "He needs another year of development" and "I need to give him a chance".
11. **The backlog** gains Parties below the floor at a penalty, Unique Items from the hardest Tiers,
    and tuning the Board's growth and the Fame minimums.
12. **The plan**: the epic `docs/planning/epics/v1.2.0-release.md`, S1–S13, with #19 and #40.

*Judgement calls, for the owner to see.*
- The world's mean Level is that of every Hero on a Roster, the player's and the Rivals' alike.
- A Tier's Loot flag replaces `lootDifficultyThreshold`, the ladder's Tier 3 starting above its 35.
- The Board card shows the name, Tier, Deadly, days and reward; the narrative is in the Party builder.
- DL-256's Consequences said this entry would supersede DL-182's XP split and DL-83's Deaths band.
  The split stands (Q8). The band becomes item 10's 3–8, its figure taken as written, reported only.

**Consequences.** DL-256 item 2 is superseded in part, and DL-83 item 6 in full. `plan.md` §3 makes `v1.2.0` "Now".
Play changes from S5. A playtest that cannot reach its second year is the owner's to decide at the
close.

**Evidence.** The commit `v1.2.0 (DL-257)`. The epic's §5 lists the facts checked at `0443c58`.


## DL-258 — v1.2.0-S1 built: the glossary's Tier, Beat, Deadly and Death factor

**Status:** Accepted · **Date:** 2026-10-10 · **Decided by:** the owner's answers (DL-257); the agent's build

**Context.** DL-257 item 9 (Q21 a) put Tier and Beat in the glossary, with Deadly and Death factor,
before any code reads them (principle 13). Five entries avoided "Tier" for another thing, and
Encounter avoided "Beat".

**Decision.**

1. **Four entries** in `CONTEXT.md`: Tier and Beat after Quest template, Deadly and Death factor
   after Finale, each marked "To be built" and citing DL-257.
2. **Quest template's entry** names its Tiers and its Beats as to be built, in the place of its ranges
   of difficulty and duration and its kinds of Encounter.
3. **Five avoid lists**: Level's, Morale band's, Regard band's and Degree's read "Tier (a Quest's is
   another thing)", Quest band's "Tier (the one a Quest is posted at is another thing)". Encounter's
   drops Beat.
4. **The Guild Management Design's table of words** gains Tier and Beat with their clashes, its count
   of clashes five to seven, and Deadly in the words that raise none.
5. **No other live page** lists Tier or Beat as a word to avoid: `docs/agents/ui-text.md` and the
   rest hold none. No code changes.

*Judgement calls, for the owner to see.*
- Tier and Beat each avoid a few near words (Grade, Rank, Scene, Step), and Beat avoids
  Encounter, the step it draws. Deadly avoids Lethal, Dangerous and Fatal, Death factor Death rate,
  Mortality and Lethality.
- Milestone's "a Campaign beat" is left as it is: lower case, a Campaign's own, no glossary term.

**Consequences.** S2 onwards may use the four words in docs, comments and text. A word's "To be built"
goes at the story that builds it (S5 for Tier and Beat, S7 for Deadly and the Death factor, S12 for the page).

**Evidence.** The commit `v1.2.0-S1 (DL-258)`. The epic's S1 boxes are ticked.
Verified 2026-10-10 at 1c08a21: the Quest template's entry claimed Tiers and Beats it does not carry yet
and now marks them to be built; Quest band's avoid list, Tier's "grades" (Grade is avoided, and an
Improvement raises a grade) and Beat's "Stage" (a clash for the line's Career stage) were reworded or
dropped; no live page or player-facing text uses "tier" or "beat" in another sense.

## DL-259 — v1.2.0-S2 built: the harness's Targets, their counters and the baseline they read, and the player's Bankruptcies out of the Gate

**Status:** Accepted · **Date:** 2026-10-10 · **Decided by:** the owner's answers (DL-257); the agent's build

**Context.** DL-257 item 7 (Q6, Q11 a) reports every DL-83 band against v1.1.9's figure, none to be
met, and takes the player's Bankruptcies out of `harness/gate.json`. #19 asked for the bands in the
report, a highest-Level counter, DL-69 item 4's scratch measures as counters, the Rankings without
the new world's tie, the twenty-year slice named and per-seed fingerprints. The epic adds the Quest
weight.

**Decision.**

1. **The Targets** (`harness/src/targets.ts`), each declared once with its source and band: the
   player's Bankruptcy or wiped Roster (DL-83 item 2), first in the Rankings by Fame and by Wealth
   (item 3, DL-91 item 2), Quests failed and strong (item 4), Rival folds (item 5), the player's
   Deaths at 3 to 8 a game (DL-256 item 10), Wealth in months of Upkeep (item 7), the mean Level
   after 10 years (item 21), the highest Level by year 20 (item 22), and DL-69 item 4's lines:
   each Disposition's hoarding, Transfers back, back within 90 Days, and sellers left short.
   - Each is a ratio of two sums of the totals: measured, its standard error over the games (each
     game totalled alone, a cluster), the baseline's value, and inside or outside its band.
   - Nothing fails a run. The section follows the Summary and the Gate; the JSON holds `targets`.
2. **The baseline** is the run report `HEROESIM_BASELINE` names, a path or a name in
   `harness/reports/`: v1.1.9's closing gate unless set, `none` for none. A target whose counter
   the baseline's report lacks reads a dash there.
3. **The Quest weight**: Quests a Guild-year, the mean Party and the mean Days away, the player's
   and each Disposition's, beside the bands.
4. **Six counters**, each declared once (DL-239) with a fixture test written first: `highestLevels`
   (the Rosters every Turn and each `hero.levelled`), `playerWealthMonths` and `rivalsAtFloor` (as
   each year begins), `questWeight` and `transfersBackSoon` (from the History), and
   `transfersShort` (each seller's Roster followed through the Turn).
5. **The rest of #19.** The Rankings tables gain a row "After 1 year or more", which says it leaves
   the new world's tie out, as the Targets do. The header names the slice measured (DL-83 item 18).
   The Summary names where each seed's fingerprint is: the JSON's `games[].fingerprint` (DL-188
   item 6).
6. **The Gate.** `playerBankruptcies` leaves `gate.json`, `GateSpec` and `checkGate`, and a note
   cites DL-257.

*Judgement calls, for the owner to see.*
- A month of Upkeep is a twelfth of a year's Upkeeps, 3 of the 36 due every 10 Days, at the Upkeep
  owed as the year begins. The band reads the mean over year-starts after 2 years or more (#19 left
  the month to the owner).
- The Rankings' shares count every year-start after 1 year or more, the census after the last year
  among them.
- The highest Level by year 20 is the mean over the games of the player's highest. The greatest of
  any game is in the by-year table.
- Hoarding counts a Rival at `rivalRosterMin` Heroes or fewer, DL-69's "4 or fewer". Ping-pong is
  fewer than 90 Days after the buyer's last sale of the Hero, DL-69 item 6's "(< 90)". A Guild
  founded on the Turn of a Transfer is not followed.
- DL-69's "none" lines read as at most 0 a game, and its hoarding line as under 50%.
- S2 plays v1.1.9's games, so its gate's values for the new counters are v1.1.9's too.

**Consequences.** S5 to S13 set their Targets and `compare` against S2's gate
(`HEROESIM_BASELINE=v1.2.0-s2-gate-2026-10-10`). The bands stay reported, not gated, in v1.2.0. A Bankruptcy
fails no run.

**Evidence.** The commit `v1.2.0-S2 (DL-259)`. The reports `harness/reports/v1.2.0-s2-neutral-2026-10-10` and
`harness/reports/v1.2.0-s2-gate-2026-10-10`, the latter committed as the baseline. The epic's S2 boxes.
Verified 2026-10-10 at 0f6d53e: the bands and sources, the standard error and the baseline read (all
47 reports, none crashing) held, and the counters matched a hand count of a three-year game;
`transfersShort` sought a dead Hero's Guild in `hero.died`'s participants, which name only the Hero and
the Quest, and now follows the Hero, its fixture corrected, with tests killing the ten mutants that
survived; no reading moved (the Generator keeps its seller at `rivalRosterMin`, the quick run identical).

## DL-260 — v1.2.0-S3 built: content in folders, Quest templates, Encounters, Items and Loot tables a file a row

**Status:** Accepted · **Date:** 2026-10-10 · **Decided by:** the owner's answers (DL-257); the agent's build

**Context.** DL-257 item 8 (Q19 b, Q22 b) moves Quest templates, Encounters, Items and Loot tables to
one file per row, through a loader any kind can use, so that S9's editor commands and S10's skills
write a row without touching the rest. Each kind's content was one JSON file, the page's bundle taking
`content/*.json` and the editor writing whole files (DL-243, DL-244).

**Decision.**

1. **A kind declares its source** (`content/src/files.ts`, `kinds/`): one file, `stats.json`, or a
   folder of one file a row named by its key, `items/`. `contentSources`, derived from the kinds,
   replaces the list of files; moving a kind later is its one line. Content's files are named by their
   path in the content directory, `items/short-sword.json`.
2. **The readers.** A folder's rows are read as one object by key, a refusal naming the row's file:
   `items/short-sword.json: slot is missing`. The Node entry reads a folder's `.json` files
   (`readSource`, `readContentDir`), a drafted folder taken whole in place of the core's (`loadDrafts`).
   The page's bundle finds them by `import.meta.glob`'s pattern, `../../content/*/*.json`, no list kept;
   the build compacts and validates them as before.
3. **The row order.** A folder has none, so its rows are read in key order, by code unit, the order
   the engine draws in (DL-19 item 3). The old files were in authored order.
4. **The editor** writes a folder's rows each to its own file through the edit session: a row changed
   in its file, added as a new file (`formatJson`), removed by deleting its file, a key changed by
   both. The journal holds every such file's bytes or its absence, so a test that fails or a "Finish"
   cut off puts every file back. A use's place names the row's file:
   `encounters/hold-the-line.json: consequences.failure.2`; the path alone still finds it.
5. **The move,** by a script run once: each row's text kept, two spaces in; a row on one line opened
   out a field a line, each field's text kept; LF. The drafts in `docs/quests/drafts/` moved the same.
   136 files: 12 Quest templates, 29 Encounters, 26 Items, 2 Loot tables and the drafts' 67.
6. **Words.** `approach.md` §4, the Content kind entry, the editor's README, the register, the
   `trait-assign` skill and `HEROESIM_DRAFTS` say what is true now.

*Judgement calls, for the owner to see.*
- **Key order, not the authored order** (item 3). Play is unchanged: the engine sorts every draw by key
  (`neutral --expect` identical). Three things read content's order and now read key order: the
  harness's `estimate` and `calibrate` samples, which draw by index, and the order of the Items' and
  Loot tables' rows in a run report. A list beside the rows would have kept the old order, at the cost
  of a file every addition must touch.
- **A folder with no row holds none,** as git keeps no empty folder: `items/: missing` is no refusal,
  where `items.json: missing` was. Items and Loot tables may hold none; a missing `encounters/` or
  `quest-templates/` is refused by their rules ("no Quest template names it", "no Encounter is of
  kind").
- The rules' refusals name the table and key, `items.short-sword.buyPrice`, as before, not the file.
- A row in a folder within a folder (`items/old/x.json`) is not read.
- The result's `changed` names the files written, `encounters/hold-the-line.json`, as it named
  `encounters.json`.

**Consequences.** S9's Quest template and Encounter commands are kinds whose list is a folder. A
merge of two drafts touches only their rows' files.

**Evidence.** The commit `v1.2.0-S3 (DL-260)`. The content read at `08387a7` and after the move: deep-equal,
and identical with the four tables in key order, the drafts too. `neutral --expect` identical alone:
`harness/reports/v1.2.0-s3-neutral-2026-10-10`. The epic's S3 boxes. Verified 2026-10-11 at 9f054b3: the content read by 08387a7's own code deep-equal to the content now, the four tables in key order, the drafts too; every missing folder still refused through the rules, a stray non-JSON file or a nested folder ignored as the bundle's pattern ignores it; 18 mutants, five surviving until tests of a row that is not JSON, a folder's non-JSON files, a source of the wrong shape and the build's gate over a folder's row killed four, the fifth equivalent; found that the key order moves the estimate probe's samples, its Morale-in limit 1.61 points in the authored order and 4.84 in key order, beyond its 3, left for the owner.

## DL-261 — v1.2.0-S4 built: the growing Board, `boardSizeStart`, `boardGrowthPerYear` and `boardSizeMax` in place of `boardSize`, and the founding Fame, `foundingFame`; config version 18

**Status:** Accepted · **Date:** 2026-10-11 · **Decided by:** the owner's answers (DL-257); the agent's build

**Context.** DL-257 item 4 (Q3, Q10 a) builds the growing Board with neutral defaults: the smaller of
a cap and a start plus growth by the Year, at 6, 0 and 6. #40 (N9) asks for the Fame a Guild is
founded with as a setting, in place of the constant `foundingFame = 0` in
`engine/src/generators/guilds.ts`. The Board held `boardSize`, 6, each morning.

**Decision.**

1. **The Board's size** is `boardSizeAt(turn, config)` (`engine/src/phases/board-refresh.ts`): the
   floor of `boardSizeStart` + `boardGrowthPerYear` × the Years played, never above `boardSizeMax`.
   - *The Years played* are `yearOf(turn)`, the whole Years since Turn 0, as ages count them. A Year
     begins on a morning (DL-210), so the Board grows at the first refresh of each Year; a new world
     opens on `boardSizeStart`.
   - *Growth may be a part of a Quest*: at 0.5 a Year the Board gains a Quest every second Year.
2. **`boardSize` is gone,** its three settings in the `board` section in its place. Their rules:
   `boardSizeStart` a whole number of 0 or more, `boardGrowthPerYear` a finite number of 0 or more,
   `boardSizeMax` a whole number at least `boardSizeStart`, so a start above the cap names the cap:
   `boardSizeMax is 6; it is a whole number, at least boardSizeStart (7)`.
3. **`foundingFame`,** 0, in the `guilds` section after `fameFloor`, is the Fame of every Guild the
   Guild Generator founds: the player's, each founding Rival's and a folded Rival's replacement. Its
   rule: a whole number at least `fameFloor`. The constant is gone; it draws nothing.
4. **Config version 18,** its changelog line citing this entry. A save of 17 plays with its
   `boardSize` left out and the four settings at their defaults (`playConfig`).
5. **Readers and words.** The engine's tests read `boardSizeAt`; the tests that used `boardSize` as a
   sample setting (the CLI's, the page's, the harness's, the editor's) use `boardSizeStart` or
   `boardSizeMax`; `docs/agents/config.md`, the editor's README, R22 and the harness's Rankings note
   say what is true now. The Patron Regard box pins the three at 6, 0 and 6.

*Judgement calls, for the owner to see.*
- **A Board of 0 stays allowed,** as `boardSize`'s rule allowed it (a count is a whole number of 0 or
  more) and a test of the first Board's draw uses one. The brief named "sizes below 1" as nonsense;
  refusing them is a one-line change to the two rules.
- **The floor of the sum,** not of the growth alone; the same while the start is whole. A growth not
  exactly a binary fraction (1.16 × 25 is 28.999…) is counted whole within 1e-9, so the Board gains
  its Quest in the Year the decimal parts make one (the verification).
- **`foundingFame` at least `fameFloor`,** where a lower one would be raised the first night: so
  `fameFloor`'s own case allows 0 only, its edges above 0 held beside `foundingFame`'s.
- **The neutral fingerprint moves by construction:** each save records `configVersion` and the
  whole `meta.config`, as DL-202 and DL-208 found. Play is shown unchanged instead (Evidence).

**Consequences.** A later release tunes the Board's growth and cap and the founding Fame in config
(DL-257 item 11). `harness/README.md`'s `neutral` baseline is S4's; the full `gate`'s moves with its
next run, and S5 onward compare with S2's gate.

**Evidence.** The commit `v1.2.0-S4 (DL-261)`. `neutral v1.2.0-s4-neutral --expect 29c09fb4…` alone
(`harness/reports/v1.2.0-s4-neutral-2026-10-11`): every line PASS but the fingerprint,
`661789f1d2811cfac869463d6dd1a0164874e3222f13690ba6adf9c43bdf2d6f`; `compare` with S3's: the config's
five keys alone, 0 counters moved of 547, the saves 12,400 bytes longer. With the settings put back (version 17,
`boardSize` 6, the rules, `boardSizeAt` given 6, 0 and 6, Fame 0) the 4 × 2 quick check gave
`38d1c0d4…`, the baseline, the files then restored by SHA-256; at the build, `7ae6defa…`. The epic's
S4 boxes.
Verified 2026-10-11 at 3344e92: play unchanged, every one of the 208 year-end saves of the S4 `neutral` and a
4 × 2 quick check exactly 62 characters longer than S3's and S2's verifier's, the config's five keys,
547 and 481 counters the same, and the quick check's `7ae6defa…` and the `neutral` `661789f1…` reproduced;
fixed, test first: the Board floored a Quest short at decimal growths (1,331 of 804,000 tried, growths
in hundredths to 10, Years to 200, four starts), and a test kills a surviving mutant counting part of a
Year; two stale comments. The put-back was not repeated: its temporary edit was denied.

## DL-262 — v1.2.0-S5 built: the Tier engine, the `questTiers` ladder with `levelsPerTier` and `tierDrawWeights`, Quest templates in Tiers and Beats, `schemaVersion` 8; config version 19, content 38

**Status:** Accepted · **Date:** 2026-10-11 · **Decided by:** the owner's answers (DL-257); the agent's build

**Context.** DL-257 items 1–3 (Q4, Q13–Q15, Q23, Q24) build #22's Board scaling: a ladder of Tiers,
templates offering Tiers and played as Beats, the Tier drawn around the world's mean Level, its
factors neutral a Party-Day against v1.1.9. A template held its own difficulty, Days and Encounter
counts, and `lootDifficultyThreshold` gave Loot.

**Decision.**

1. **The ladder,** `tiers` in a `questTiers` section after `board` (§2's figures), one row a Tier
   (`TierRow`, `tierFields`), with `levelsPerTier` 3 and `tierDrawWeights` 1, 0.5, 0.2. The rules
   (`tierRowProblems`) hold each row whole and its band and Days not below the Tier's beneath.
   `lootDifficultyThreshold` is gone, a Tier's `loot` in its place. Config version 19.
2. **The template** (`content/src/kinds/quest-templates.ts`): `tierMin`/`tierMax` within the ladder;
   `beats`, each a line and a pool (kinds, tags or named Encounters; a Finale in none); `finale` with
   `finaleLine`; `overrides` by Tier, each merged row held by the ladder's rules. A pool too small to
   draw its Beats none twice is refused, naming the Beat. Twelve templates and their drafts converted
   by a script (content version 38): Tiers from the midpoints of the Tier bands their difficulty spans,
   a Beat a kind with a working line, S11's to write.
3. **The Generator** (`engine/src/tiers.ts`, `generators/quests.ts`): the centre 1 + ⌊mean Level ÷
   `levelsPerTier`⌋, the Tier drawn by its distance among those the template offers; the difficulty
   within the band, the Days at its place in the Tier's Days; the first k−1 Beats and the Finale, or
   the first k; reward × `rewardFactor`; Loot by `loot`. XP × `xpFactor`, read live at resolution.
4. **The Quest** carries `tier` and `beatLines`; `schemaVersion` 8, a save of 7 refused (rule 5); the
   validator holds a line an Encounter. `quest.offered` and `quest.taken` name the Tier.
5. **The factors** (Q23 a), each v1.1.9's figure a Day at the Tier's difficulties over v1.2.0's at
   factor 1 (the epic's §2): reward 1.36, 1.64, 2.04, 2.43, 2.55; XP 1.40, 1.64, 2.04, 2.42, 2.51.
6. **The report** reads Quests by Tier and controller (`questTiers`): offered, taken, Party, Days,
   bands, Wealth and XP a Party-Day, Loot a Quest.

*Judgement calls, for the owner to see.*
- **Three templates offer fewer than three Tiers:** the Sickness and the Tithe Tier 1 alone, the Quiet
  word 1–2, their v1.1.9 difficulties narrow. Q25 asked for three or more; S11's content to widen.
- **The section is `questTiers`,** not `tiers`, as a setting's key stands once in the config's text.
- **`daysMax` whole,** as `daysMin`; no draw span is asked of a band, the scale clamping it.
- **A Tier is given only with its template,** refused before any draw (the CLI's and tests' Quests).
- **A pool's empty list, and a tag no Encounter carries, are refused**, as a typo would be.
- **The factors rounded to two places:** the design's 2.05 (Tier 3 reward) and 2.43 (Tier 4 XP) are
  2.04 and 2.42 by the arithmetic.
- **The counter splits by controller,** player and Rivals; its Deaths column waits for S7.
- **The Board's templates, Patrons and stream are unchanged** (still three draws a Quest), so seed
  pins moved only in their figures: the Board pin (`quests.test.ts`), three History prints and the
  harm fingerprint (`quests-conclude`, `resolve`), the estimate's seed (0023 → 0011, the
  first Board's Quest drawn anew), web tests' Day of return, and fixtures given a Tier and Beats. No test pinned a
  default this story changed.

**Consequences.** S6 and S7 read the ladder's `fameMinimum` and `deathScale`; S11
writes the Beats' lines and widens the Tiers; DL-257 item 11 tunes. The quick run's moves (Evidence)
are the owner's to read against S2's: the player's Quest rewards 21% more over two Years
(`wealth.player.questRewards`), its cause not yet read.

**Evidence.** The commit `v1.2.0-S5 (DL-262)`. The doctor before and after: no drift, 104 reads.
`neutral v1.2.0-s5-quick` (4 × 2, `harness/reports/v1.2.0-s5-quick-2026-10-11`): refusals 0,
invalid 0, the replay identical, `7e0eed8f…`. `compare` with S2's gate: the config's keys, 568
counters moved of 662, the run's shape apart; with S2's 4 × 2 quick check, the same shape, 391 of 590,
S2 → S5: the player's Quests a Guild-year 378 → 284, its Party 1.66 → 1.54, Days away 3.96 → 6.04,
failed 19.9% → 18.1%, Deaths a game 1.75 → 1.25, Wealth at Year 2 15.6 → 22.3 months of Upkeep;
Bankruptcies 0 and 0. Offered by Tier: 20.9%, 38.6%, 29.4%, 9.9%, 1.1%; the player took 35.8%,
48.3%, 14.9%, 0.9%, 0. Tests 6,192 (6,188 passed, 4 skipped); lint, typecheck and the build pass.
