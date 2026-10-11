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
   *Superseded in part by DL-271, 2026-10-11: the Tiers up to the highest any Guild in play has unlocked by its best four, the lower kept; the Fame minimum stands. The record: [superseded/DL-257.md](decisions/archive/superseded/DL-257.md).*
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
- The highest Level by year 20 is the mean of the player's highest over the games still in play at
  year 20 (corrected at the close, DL-270). The greatest of any game is in the by-year table.
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
   hold each row whole (`tierRowProblems`) and its band not below the Tier's beneath, its Days free to
   overlap, as tuning (corrected at the close, DL-270).
   `lootDifficultyThreshold` is gone, a Tier's `loot` in its place. Config version 19.
   *Superseded in part by DL-271, 2026-10-11: `levelsPerTier` gone, each Tier's `unlockLevel` and `unlockHeroes` in its place. The record: [superseded/DL-262.md](decisions/archive/superseded/DL-262.md).*
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
   *Superseded in part by DL-271, 2026-10-11: the Tier drawn up to the Board's top Tier by its distance below it, not around the centre. The record: [superseded/DL-262.md](decisions/archive/superseded/DL-262.md).*
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
(`wealth.player.questRewards`), the factors working as decided, a Party-Day neutral: each Tier's
Wealth a Party-Day is v1.1.9's for its band times the share paid (0.94, 1.00, 1.02, 1.07), and the
21% is Party-Days ×1.144 (11,981 → 13,707: per-Quest overheads, Days home and Injuries 93 → 47,
spread over longer Quests; Parties smaller, alone 44% → 51%) times Wealth a Party-Day ×1.057 (more
of the Days in the better-paid Tiers 2–3, ×1.031; paid 80.1% → 81.9%).

**Evidence.** The commit `v1.2.0-S5 (DL-262)`. The doctor before and after: no drift, 104 reads.
`neutral v1.2.0-s5-quick` (4 × 2, `harness/reports/v1.2.0-s5-quick-2026-10-11`): refusals 0,
invalid 0, the replay identical, `7e0eed8f…`. `compare` with S2's gate: the config's keys, 568
counters moved of 662, the run's shape apart; with S2's 4 × 2 quick check, the same shape, 391 of 590,
S2 → S5: the player's Quests a Guild-year 378 → 284, its Party 1.66 → 1.54, Days away 3.96 → 6.04,
failed 19.9% → 18.1%, Deaths a game 1.75 → 1.25, Wealth at Year 2 15.6 → 22.3 months of Upkeep;
Bankruptcies 0 and 0. Offered by Tier: 20.9%, 38.6%, 29.4%, 9.9%, 1.1%; the player took 35.8%,
48.3%, 14.9%, 0.9%, 0. Tests 6,192 (6,188 passed, 4 skipped); lint, typecheck and the build pass.
Verified 2026-10-11 at d8c0474: the factors, the midpoints and the Beats re-derived alike, the rise
read as above, 75 mutations red but two, killed by tests (`daysAt` off its band, `beatsDrawn`'s cap).

## DL-263 — v1.2.0: the owner's answers on the estimate probe's sample after S3, and S4's neutral box

**Status:** Accepted · **Date:** 2026-10-11 · **Decided by:** the owner

**Context.** S3's verification (DL-260) found `npm run harness -- estimate`, run alone, failing its
Morale-in limit: a Quest's success out by 4.84 points (sample estimate-0150) against 3 (DL-173),
where the old file order passes at 1.61. Play is unchanged; the probe picks its core Encounter and
lends Morale by position, and S3 read the folders' rows in key order. S4 (DL-261) raised the config
version, so its `neutral` fingerprint moved by the save's config record alone, with play shown
unchanged by `compare` (0 of 547 counters moved) and the year-end saves' lengths.

**Decision.**

1. **The estimate probe keeps the key-order sample** (the owner: "S3 decision: a"). The owner decides
   at the close whether the Morale-in limit is widened or the probe made to account for Morale; S5's
   Tiers move the sample again before then. No test or limit changes until that answer.
2. **S4's `neutral --expect` box is met as play unchanged** (the owner: "accept s4 neutral change"),
   the fingerprint moved by `configVersion` and `meta.config` alone, as DL-202 and DL-208 found.

**Consequences.** S13's Gate reads the estimate's two limits against the owner's answer at the
close. A story that raises the config version proves play unchanged by `compare`, not by the
fingerprint.

**Evidence.** DL-260's Verified line and its reports `v1.2.0-s3v-estimate-2026-10-11` and
`v1.2.0-s3v-estimate-old-order-2026-10-11` (not committed); DL-261's Evidence. The epic's S4 boxes.

## DL-264 — v1.2.0-S6 built: the Fame minimum, `fame-below-minimum` refused by dispatch and passed by by every chooser of a Quest

**Status:** Accepted · **Date:** 2026-10-11 · **Decided by:** the owner's answers (DL-257); the agent's build

**Context.** DL-257 item 3 (Q15 b): a Guild below a Tier's `fameMinimum` may not take its Quests;
the minimums are 0. S5 (DL-262) put `fameMinimum` in every `questTiers` row, read by no rule.

**Decision.**

1. **The rule** (`fameRefusal`, `engine/src/actions/dispatch.ts`): a Guild whose Fame is below the
   Fame minimum of its Quest's Tier, the template's override read (`tierFigures`, live as the XP
   factor is), may not take it. `dispatch` refuses it as `fame-below-minimum`, naming the Guild, the
   Quest, the Tier, the minimum and the Fame, after `quest-not-offered` and before the Heroes, since
   no Party changes it. `previewDispatch` gives it as its verdict, being `dispatch`'s own checks.
2. **Its sentence** (`words/src/refusals.ts`, DL-240): "A quiet word is a Tier 3 Quest, open to a
   Guild of 20 Fame or more; The Lantern has 12, 8 short." The CLI's Namer adds the Quest's id; the
   page's names "that Quest" and "that Guild" with no world.
3. **The choosers pass it by:** a Rival's `preferredQuest` ranks only the Quests it may take; the
   harness's player (`automaticPolicy`) weighs only those; `staffableQuests`, and so the Fast-forward
   stops, by `dispatchRefusal`. The player's reading names no Best Party for it (`PlayerReading.
   bestParty`), and the Board says why in the Best Party's place, in the refusal's words
   (`questClosed` in `words`; the CLI's `show board`, the page's card).
4. **No setting and no version:** the minimums stay 0, so the config version stays 19; with them
   at 0 and Fame never below `fameFloor` (at least 0), no Quest is closed and play is unchanged.

*Judgement calls, for the owner to see.*
- **The Best Party module stays a search of who would go**, the Fame read by each caller that
  offers a Quest; its "null exactly when `requiredParty` is" holds, and the calibration's probes ask
  it of Quests no Guild takes.
- **The Board's line for a closed Quest** is the refusal's sentence, where it said "No Party of your
  free Heroes meets its requirements"; S12 words the card.
- **The order:** after the Quest is found on the Board, before the Heroes; a Party of no one is
  refused for the Fame.
- **The proof's minimums** (0, 10, 40, 100, 200 for Tiers 1–5) are a trial through `HEROESIM_CONFIG`,
  not a proposal; tuning them is DL-257 item 11's.

**Consequences.** A Tier's Fame minimum works when a later release sets it. CONTEXT.md's Tier and
Fame, requirements R23 and the TierRow's field say it.

**Evidence.** The commit `v1.2.0-S6 (DL-264)`. Tests: the refusal, its order, a template's override
and the preview (`dispatch.test.ts`); its words, the CLI's and the page's; a Rival and the harness's
player passing a closed Quest by; the reading, `show board` and the card. `neutral
v1.2.0-s6-quick` (4 × 2): play identical to S5's, `7e0eed8f…`, 0 of 576 counters moved.
`neutral v1.2.0-s6-fame-quick` with the trial minimums: refusals 0, invalid 0, the replay
identical, `cc178d34…`; against the first, 402 of 589 counters moved: the Rivals' Quests taken at
Tiers 1, 3, 4 and 5 918 → 1,195, 1,194 → 1,086, 223 → 137 and 17 → 4, their Bankruptcies 0 → 6.
The epic's S6 boxes.
Verified 2026-10-11 at 30380c3: every chooser of a Quest searched, Fame at the minimum taking it and
none moving between a choice and its dispatch, the sentence per ui-text.md, 20 mutations each red;
fixed, test first: the estimate probe sent its sample's Party whatever the Tier's Fame minimum, which
a non-zero minimum refuses (158 of 200 samples above Tier 1), now raising the Guild's Fame to it.

## DL-265 — v1.2.0-S7 built: Death by Tier, `deathFactor` and each Tier's `deathScale` read, and the Deadly reading; config version 20

**Status:** Accepted · **Date:** 2026-10-11 · **Decided by:** the owner's answers (DL-257); the agent's build

**Context.** DL-257 item 5 (Q5 c, Q17 b, Q18 b): an Encounter's Death chance × `deathFactor` (1) ×
its Tier's `deathScale` (0 for Tiers 1–3, 1 for 4–5); a Quest that can kill marked Deadly, with no
figure in the Party builder. S5 (DL-262) put `deathScale` in every `questTiers` row, read by no rule.

**Decision.**

1. **The setting:** `deathFactor`, a finite number of 0 or more, in `questTiers` after
   `tierDrawWeights`, at 1. Config version 20.
2. **The chance** (`engine/src/tiers.ts`): `deathScaleOf` is `deathFactor` × the Tier's `deathScale`,
   the template's override read through `tierFigures`, live as the XP factor is;
   `scaledDeathChance` is the Encounter's chance times it, held at 1. `resolveQuest` reads the scale
   once a Quest and gives `strike` the scaled chance.
3. **The draws:** `strike` already takes its two draws whether or not a Death lands (DL-186 item 4),
   so a scale of 0 kills no one and shifts no later draw: the Tier changes what a draw decides,
   never how many are taken.
4. **Deadly** (`isDeadly`, exported): the Quest's Death scale is above 0 and one of its Encounters,
   drawn at posting, has a Death chance above 0 at any Degree; an Encounter content no longer defines
   is passed over. The words' `QuestReading.deadly` carries it; the CLI's `show board` says "Deadly: a
   Hero may die on this Quest." after the Quest's Encounters. The page's card is S12's.
5. **The report:** Quests by Tier gain Deaths and Deaths a Quest, by controller, from
   `quest.resolved`'s `deaths` (the same Heroes `hero.died` names, with the Quest's Tier at hand).
6. **The words:** CONTEXT.md's Deadly and Death factor, requirements R24, the harness README's last
   quick fingerprint.

*Judgement calls, for the owner to see.*
- **Held at 1 before the guard:** a chance scaled past 1 is 1, then the Hero's guard by `guardedBy`
  lowers it, so a strong Hero still shrugs some off.
- **Deadly reads a Triumph's or a Success's Death too**, and a chance of 0 is no Death chance.
- **The review page** (`npm run quest-review`) still gives content's chances, unscaled: it reviews
  Encounters, not Quests.
- **Tests whose Deaths fell at Tiers 1–3** (an engine change, not a default's pin) were given Death at
  every Tier, their assertions unchanged: the resolver's shared scene (`pinned`), the consumables' and
  the Synergies' configs, and content's `certainHarmContent` and three Quests of
  `quests-conclude.test.ts` through `deadlyAtEveryTier` (template overrides). They are 8 in
  `resolve.test.ts` (the harm fingerprint of 300 seeds among them), 9 in `quests-conclude.test.ts`
  (the History of 86c7afa among them), and one each in `consumables`, `synergy`, `gear` and
  `hero-regard`. Each passes as before with the scale at 1, which proves the draws unmoved. No test
  pinned a default this story changed.

**Consequences.** Below Tier 4 no Hero dies, and the quick run's player takes almost no Quest of Tier 4
or 5: its Deaths fall to 0 a game against DL-256 item 10's 3–8, reported, not tuned (DL-257 item 7).
`deathFactor` and the scales are DL-257 item 11's to tune; S12 shows Deadly on the card.

**Evidence.** The commit `v1.2.0-S7 (DL-265)`. `neutral v1.2.0-s7-quick` (4 × 2,
`harness/reports/v1.2.0-s7-quick-2026-10-11`): refusals 0, the replay identical, `e919219b…`. `compare`
with S6's quick run: 381 counters moved of 599; Deaths, the player's 5 → 0 and the Rivals' 14 → 1 (that
one at Tier 4); Quests taken, the player's 2,269 → 2,256 and the Rivals' 4,056 → 4,467; Bankruptcies
and folds 0. Deaths by Tier, Tiers 1–5: the player 0, 0, 0, 0, 0 of 801, 1,113, 316, 25 and 1 taken;
the Rivals 0, 0, 0, 1, 0 of 1,009, 1,884, 1,308, 247 and 19. The player's Deaths a game 0.00 (S6 1.25,
S2's quick 1.75, S2's gate 4.28 over 20 years). The epic's S7 boxes.
Verified 2026-10-11 at 3c64efe: `strike` the only path to a Death, so every Death is scaled; the 21
moved tests each red without their Death at every Tier and each about a Death; Deaths by Tier equal
`hero.died` Quest by Quest in played games, none below Tier 4 at the defaults; the quick run
reproduced, `e919219b…`; of 30 mutations 25 red, the default `deathFactor` moved living as no test
pins a default (DL-231 Q10 b), and 4 killed by tests added: Deadly read from a Setback's or a
Success's list alone, a Quest of two Deaths, and Deaths a Quest over those resolved, not taken.

## DL-266 — v1.2.0-S8 built: the Party floor of two, no Party's most, `schemaVersion` 9; content version 39

**Status:** Accepted · **Date:** 2026-10-11 · **Decided by:** the owner's answers (DL-257); the agent's build

**Context.** DL-257 item 6 (Q1 b, Q2, Q8 a): templates at a least Party of 1 are written at 2, the
rest keep theirs; no template has a most; nothing caps the Parties out; XP stays divided by the Party
sent (DL-182). At `639ba67` every template and Quest carried `partySizeMin` and `partySizeMax`,
dispatch refused a Party above the most, and the Best Party (DL-237) stopped there.

**Decision.**

1. **The content.** The four templates at 1 (A quiet word, Escort the tithe, Recover the strongbox,
   The sickness at the mill) are at 2; `partySizeMax` is out of all twelve and their drafts. The
   editor has no Quest-template command yet (S9's), so a script run once made the change, each
   file's text otherwise kept. Content version 39.
2. **The check.** A template's `partySizeMin` is at least 2 (the content kind's `partyFloor`), and
   `partySizeMax` is refused as a field it does not have.
3. **The Quest.** `QuestRequirements` loses `partySizeMax`, so the save's shape changes:
   `schemaVersion` 9, a save of 8 refused (rule 5).
4. **The dispatch.** `unmetRequirements` refuses a Party below `partySizeMin` alone; its
   `party-size` and `previewDispatch`'s carry `size` and `partySizeMin`. The words: "a Party of at
   least 2 Heroes (1 named)" in the refusal, "A Party of at least 2" in the CLI's preview and the
   page's Party builder, "2 or more" in the CLI's Board and "2 or more Heroes" on the card (S12 makes
   the card), "Parties of 2 or more" on the review page.
5. **The Best Party.** It adds the Hero who most raises the chance while that Hero raises it by more
   than the Guild's margin (`playerPartyMargin`, a Disposition's `partyMargin`; no new setting),
   bounded by the Heroes given alone. Still greedy: each Hero added weighs a Party for each Hero left,
   at most n(n + 1)/2 + 1 Parties of n Heroes, never every Party; `requiredParty` names a Party
   whenever the Heroes reach the least.
6. **XP** stays divided by the Party sent: the split's test runs to a Party of 7.
7. **No cap on Parties out** (Q2): none in the engine (`maxPartiesPerQuest` is one Party a Quest),
   the harness's player sends while a Hero and a Quest are left. A Rival's "at most one dispatch an
   afternoon" (`rivalChoices`) is how a Rival chooses, not a cap, and stays.
8. **Every reader** of `partySizeMax`: engine, words, CLI, page, harness (calibrate, estimate),
   CONTEXT.md's Party, Quest template and Best Party, R21, R23, data-model.md.

*Judgement calls, for the owner to see.*
- **The floor in the content check:** 2, a constant of the content kind, not a setting.
- **The test content keeps its least Parties of 1** (engine fixtures, not content); only the most went.
- **`schemaVersion` 9** (rule 5): the Quest's requirements lost a field.
- **Tests moved with the rule** (an engine change, no default changed): the History of 86c7afa's
  prints for two of three seeds (`quests-conclude.test.ts`); a Best Party test's margin 0 to 1 and
  its least 1 to 2, so Parties still share no Hero; a pair sent by the first two of a Best Party
  (`fast-forward.test.ts`); the page's Party out leaving two at home for the stop tests
  (`withPartyOut`'s `atHome`); a Hero signed before the Party leaves (`capitals.test.tsx`); the
  report's seed `report-l` to `report-o`, whose Party still comes home hurt; the Loot counter's
  player sending every free Hero.

**Consequences.** Every Party is two Heroes or more. With the margins at 0.05 and 0.1 the Parties
grow by about half a Hero, not to every Hero free: fewer Quests are taken, more succeed, and Rosters
earn less (reported, not tuned, DL-257 item 7). S12 writes the card's words in full.

**Evidence.** The commit `v1.2.0-S8 (DL-266)`. `neutral v1.2.0-s8-quick` (4 × 2, alone,
`harness/reports/v1.2.0-s8-quick-2026-10-11`): refusals 0, the replay identical, `62fab24b…`.
`compare` with S7's quick run: 377 counters moved of 600; with S2's gate 576 of 683. S7 → S8, the
player: mean Party 1.54 → 2.07, Quests a Guild-year 282.00 → 219.75, failed 18.5% → 5.6%, strong
45.1% → 65.2%, Days away 6.03 → 6.04, Quest rewards 420,989 → 383,422; the Rivals' mean Party
1.65 → 2.13, Quests taken 4,467 → 3,237; Deaths, the player's 0 → 0 and the Rivals' 1 → 2 (Tier 4);
Bankruptcies and folds 0. The profile, one game of 20 years in
one process under `--cpu-prof` (`v1.2.0-s8-profile`): `advance` a mean of 2.803 ms, `copyWorld`
0.876 ms, a share of 0.313 against the line's 0.4875 (v1.1.9's close 1.861 ms and 0.302, before
S5's Tiers); the game 80.5 s, the estimate 29.8%, the Rivals 31.0%, `copyWorld` 28.1%; the quick
run's `advance` 1.768 → 1.534 ms from S7. The epic's S8 boxes.
Verified 2026-10-11 at 3aa2768: the Best Party weighs the estimate's chance of success alone, fills
the floor greedily before the margin, and names no Party below it nor of one free Hero; no reader of
`partySizeMax` is left but the check's refusal; the Rivals and the player send the Best Party, and
nothing else caps one; 18 mutations all red; tests added for the floor at margins 0 and 1 and for at
most n(n + 1)/2 + 1 Parties weighed of 20 Heroes (57 to 90 of 211); the profile reproduced,
`1e68aeb6…`, its rise from v1.1.9 the Rivals' Rosters (a mean of 20 against 10 by Year 10), not code.

## DL-267 — v1.2.0-S9 built: the editor's Quest templates and Encounters, `quests …` and `encounters …`, and `quests doctor`

**Status:** Accepted · **Date:** 2026-10-11 · **Decided by:** the owner's answers (DL-257); the agent's build

**Context.** DL-257 item 8 (Q16 c): editor commands and two skills are the only way Quest templates
and Encounters change, with `quests doctor`. At `d2ddd6d` the editor edited the Traits and the tuning
values; S3 put both kinds in folders (DL-260), and S5–S8 gave a template its Tiers, Beats, overrides,
Finale and a floor of two (DL-262, DL-266).

**Decision.**

1. **One kind, two lists** (`tools/editor/src/quests-kind.ts`): the Quest templates and the
   Encounters, each a folder, keyed apart (`Kind.keysApart`), on the content files' adapter. Their
   edits are held together in `.editor/quests.json`, since a Beat's pool reads the Encounters: an
   Encounter added and a Beat that draws it are checked as one, and either family's `finish` writes
   both and raises the content version once.
2. **The commands** (`quests-commands.ts`, `quests-editor.ts`): `quests list`, `show`, `add`,
   `change`, `remove`, `tiers`, `beat add|change|move|remove`, `override set|clear`,
   `finale set|clear`; `encounters list`, `show`, `add`, `change`, `remove`,
   `check add|change|remove` (with `--pass`), `consequence add|change|remove`; and both families'
   `pending`, `discard`, `finish`, `recover`. The Traits' forms: `--row <json or @file>`, `--name`,
   `<field>=<value>` read as JSON where it is JSON; new `--tags a,b` and `--no-tags`. `null` takes out
   a field a row may leave out. A part's change is held as a change of the fields it touched; a change
   of nothing is not held; places count from 0, as the refusals name them. Every refusal names why:
   the content's checks', or the editor's (a place not there, a figure no Tier has, an Encounter a
   pool or a Finale names, each use listed).
3. **`quests doctor`** (`quests-doctor.ts`): the content's checks; every Beat's pool large enough for
   its draws (`shortBeats`); every Tier offered a Tier of the ladder playing from one Beat to its Beats
   and Finale; every Encounter drawn by some pool or a Finale; every Finale placed (an Encounter, with
   its line, named by no pool, played last); the pending edits held to all of them. A Beat no Tier
   plays is noted, not failed. Exit 1 on a problem.
4. **Both adapters:** the command line and the page's JSON API (`GET` or `POST /api/<family>/<command…>`),
   one core giving the same JSON; each command is tested through both, side by side.
5. **Read for it:** content's `rowFields(source)`, a row's fields in order, each optional or not
   (`Field.optional`); the engine's `beatsDrawn`, exported from `@heroesim/engine/content`. No play
   change, no content change.
6. **The rule:** AGENTS.md's "Quest templates and Encounters", `docs/agents/quests.md`, and
   `delivery.md`'s rule 2 naming `quests doctor`; the editor's README; CONTEXT.md's Content editor and
   Edit session.

*Judgement calls, for the owner to see.*
- **"Both adapters."** In the editor the words name the edit session's two adapters, the content
  files and the config file (DL-244); these commands write content files alone, so the config file's
  cannot carry them. They are read as the commands' two front ends, the command line and the page's
  API. The page has no control for them, as it has none for `assign` or the config kind.
- **One session for both lists:** `pending` lists both families' edits; `discard` drops its own.
- **Keys apart:** an Encounter may share a template's key, as content allows.
- **An emptied Degree list stays** `[]`, since a Degree with no list reads another's.
- **Two notes, not problems:** `escort-the-tithe` beats.2 and `survey-the-old-workings` beats.3 are
  played at no Tier they offer, for S11.
- **The order:** the code was drafted before its tests. Each test was then shown red with the core
  stubbed, and 20 mutations of the code went red, two only once their tests were strengthened.

**Consequences.** S10's skills run these commands, and S11 writes the content through them. Nothing
in content changed, so no sweep: play is unchanged.

**Evidence.** The commit `v1.2.0-S9 (DL-267)`. `tools/editor/src/quests.test.ts` (17 tests, each
command through both adapters), `quests-doctor.test.ts` (8), content's `kinds.test.ts` (`rowFields`,
red first). `quests doctor` clean: 38 Beats of 12 templates, 23 Tiers, 29 Encounters, 4 Finales, two
notes. A scratch session on the repository (a Beat added, an override set, shown, discarded) left
`git diff` of the content empty. The epic's S9 boxes.
Verified 2026-10-11 at 4b14363: every command run on a scratch copy, done and refused, "Finish" (39 to
40), undone and cut off; each kind of the doctor's problem planted, each exit 1; "both adapters" read
as the commands' two front ends, as the repository names a CLI's and a page's adapters, and tested in
DL-244's sense too ("Finish" undone and cut off for this kind); of 58 mutations 39 went red, 2 are
equivalent and 17 were killed by tests added; fixed, test first: the API's one long-lived editor never
named the files a "Finish" cut off put back and its `recover` named them again, now an editor a call
naming `recovered` as the command line does.

## DL-268 — v1.2.0-S10 built: the drafting skills, `quest-draft` and `encounter-draft`, each writing a draft for review before "Finish"

**Status:** Accepted · **Date:** 2026-10-11 · **Decided by:** the owner's answers (DL-257); the agent's build

**Context.** DL-257 item 8 (Q16 c): editor commands and two skills are the only way Quest templates
and Encounters change. S9 built the commands and `quests doctor` (DL-267). The shipped Encounters'
targets were set by the harness's calibration (DL-162), tuned at DL-166 item 2's aim.

**Decision.**

1. **`quest-draft`** (`.claude/skills/quest-draft/SKILL.md`): from a brief, a template's fields from
   its peers; at least three consecutive Tiers (Q25 c); its Beats written in the order the Tiers play
   them, a Tier of k Beats playing the first k − 1 and the Finale (DL-262), each Tier's story written
   out and read whole; lines by `ui-text.md`; pools by kind, tag or name, each large enough
   (`shortBeats`); overrides only where the brief asks, named with their reason; the edits through
   `quests …`; `quests doctor`; a review draft in the scratchpad (each Tier's figures, whether it may
   be Deadly, the story it plays with each Beat's pool and draws); "Finish" only on the owner's
   approval, else `discard`.
2. **The hand-off:** a pool too short or unfitting, a Finale of its own, or a scene no Encounter
   plays goes to `encounter-draft` in the same session: its steps 1–3, then the template, then its
   calibration and doctor, since a Finale is aimed by its template and the doctor fails an Encounter
   nothing plays.
3. **`encounter-draft`** (`.claude/skills/encounter-draft/SKILL.md`): kind, tags, one to four Checks
   with a placeholder target, the pass formula and consequences by Degree from its peers; a Death only
   where the brief kills, scaled by the Tier (DL-265); an earned Trait left to `trait-assign` after
   "Finish". **Its targets by the calibration**, as DL-166 item 2 set the shipped ones: a scratch
   copy of both folders with the pending rows, `HEROESIM_DRAFTS=<copy> HEROESIM_TUNE=0.56
   HEROESIM_FLAT=0.4 HEROESIM_CALIBRATION_OUT=<scratch> npm run harness -- calibrate`, the drafted
   Encounter's numbers alone put in with `encounters check change`; then an untuned run read for its
   rows beside its peers'. Then the doctor, a review draft, and "Finish" or `discard`.
4. **The docs:** `docs/agents/quests.md` names the skills as built; AGENTS.md's line already named
   them.

*Judgement calls, for the owner to see.*
- **The calibration is not a sweep**, but a harness run: it runs alone, as rule 6 says, and always
  with `HEROESIM_CALIBRATION_OUT`, so `docs/quests/calibration.md` is never written over.
- **The tuned numbers go in through the editor,** never by copying the tuned file: the tuning writes
  every Encounter of the copy, the shipped ones retuned under today's config, which are not wanted.
- **Two runs,** tune then read: the review's figures are those of the pending content beside the
  shipped Encounters, not of the retuned copy.
- **No helper code:** the skills drive S9's commands and the harness as they stand.

**Consequences.** S11 writes the content through these skills. Nothing in content, engine or config
changed: no play change, no sweep.

**Evidence.** The commit `v1.2.0-S10 (DL-268)`. The trial on the repository, then discarded: the brief
"Raise the drowned bell" (a fen village's bell tolling under the mere); `encounters add
the-drowned-bell` (travel; The dive, The toll, Raising the bell, at least 2 of 3; a Death of 3% on a
Failure), `quests add raise-the-drowned-bell` (Tiers 2–4, three Beats, the Finale),
`quests override set … 2 beats=2`; tuned at its template's middle, 55: 3.46 + 0.094, 2.36 + 0.064,
5.43 + 0.148 × difficulty, put in by three `check change`s; read: 48% at 60 at Level 5 with Parties
of 3, its travel peers 55% and 57%; `quests doctor` ok with 6 pending edits; both drafts written for
review. `encounters discard` first was refused (the template's Finale names it); `quests discard`
then `encounters discard` left no pending edit, `.editor/` empty and `git diff -- content` empty.
The epic's S10 box.
Verified 2026-10-11 at 4f6355b: both skills followed literally on a second brief (`break-the-smugglers-ring`, Tiers 2–4, tag, kind and named pools, no Finale, Tier 2 `daysMax` 6; `the-tide-ledger`, lore, tuned to 3.18 + 0.08 and 1.61 + 0.04, 57% at 60, its lore peers 54–60%), every command as written, then discarded, `git diff -- content docs/quests` empty; the tuning rewrote all 29 copies, 13 shipped Checks' numbers moved, so the editor route holds; fixed: the shell named (PowerShell strips a JSON argument's quotes), a new Encounter's place in shipped pools and a Finale's leaving them named for the draft, the template's calibration rows added to its draft.

## DL-269 — v1.2.0-S12 built: the Board card's Tier and Deadly mark, the Party builder's Beats, and the CLI's the same through `words`

**Status:** Accepted · **Date:** 2026-10-11 · **Decided by:** the owner's answers (DL-257); the agent's build

**Context.** DL-257's judgement call (Q18 b): the Board card shows the name, Tier, Deadly, days and
reward, and the narrative is in the Party builder. A Quest carries its `tier` and `beatLines` (DL-262),
the reading its Deadly (`QuestReading.deadly`, DL-265, the CLI's line after its Encounters); the card
says why a Quest is closed (DL-264), and the builder "A Party of at least N" (DL-266). No front end
showed the Tier or the Beats, and the card no Deadly.

**Decision.**

1. **The reading** (`words/src/readings.ts`, DL-241): `QuestReading` gains `tier` and `beats`, the
   Quest's `beatLines` in the order it plays them, a Finale's last. The words: `tierWords` ("Tier 3"),
   the page's alone, the CLI's table giving the number under its Tier heading; and, both front ends',
   `deadlyWords` (the mark "Deadly", meaning "a Hero may die on this Quest") and `partyFloorWords`
   ("A Party of at least 2") (corrected at the close, DL-270).
2. **The card** (`board.tsx`; `QuestCard` gains `tier`, `deadly` and `beats`): its chips lead with the
   Tier, Deadly where the Quest can kill (red, the alert icon, its title "A Hero may die on this
   Quest", no figure), the Days and the reward; then, as before, the difficulty, the Fame, the Party
   ("2 or more Heroes"), what else it needs and the Day it leaves. "Your best Party" and the
   closed-Quest line (DL-264) are unchanged.
3. **The Party builder** opens on "Beats", the Quest's lines as an ordered list, before the Heroes.
   The least Party stays the checklist's first line, "A Party of at least 2 (0 chosen): missed", from
   `partyFloorWords`. No Death figure.
4. **The CLI:** `show board`'s table is Id, Quest, Patron, Tier, Deadly ("Yes" or "No"), Days, Reward,
   Difficulty, Fame, Party, Requires, On offer through, the card's order; its Deadly line from
   `deadlyWords`. `preview` gives a "Beats" section after its heading and before the requirements,
   whose first line is `partyFloorWords`'. The usage says both.
5. **e2e** (`web/e2e/board.spec.ts`, at the three widths): a new game whose first Board holds a
   Deadly Quest and one that is not, found seed by seed in the saved content and loaded as a save;
   each card's lead held to its Quest's row; a Deadly Quest's builder: "Beats" first with its lines in
   order, the floor's line missed then met, the chances, and no "Death", "die" or "Deadly".

*Judgement calls, for the owner to see.*
- **The card keeps its other terms** after the five DL-257 names: the difficulty orders the
  Board and the Party chip is DL-266's. Moving them into the unfolded details is the owner's to ask.
- **Deadly is a chip** among the terms, red with the alert icon, its word carrying it (never colour
  alone).
- **No narrative on the card or in `show board`;** the builder and `preview` have it, paired as the
  card and `show board` are.
- **"A Party of at least N" is the checklist's line,** as S8 placed it, not a second line by the Beats.
- **The CLI's Deadly cell is "Yes" or "No",** a table's cell where the page has a mark or none.
- **The e2e finds its seed** rather than pinning one, so that it holds through S11's content.

**Consequences.** Words and the page only: no engine, content or config change, no play change, no
sweep, no doctor. S11's lines replace the working ones the listing shows (The beast of the fells
plays "A hard road." twice).

**Evidence.** The commit `v1.2.0-S12 (DL-269)`. Tests first, 10 red then green: `readings.test.ts`
3, `render.test.ts` 2, `main.test.ts` 1, `selectors.test.ts` 1, `board.test.tsx` 3. The rows before
and after, for the owner (seed `s12-board-5`, Turn 0, at `bcac8d4` and after): Break the sealed vault's
chips `[Difficulty 68] [13 Days away] [661 Wealth] [Fame ±5] [3 or more Heroes] [Needs a Mage] [Until
Year 1 Day 3]` became `[Tier 4] [Deadly] [13 Days away] [661 Wealth] [Difficulty 68] [Fame ±5] …`, and
The beast of the fells is Tier 4 and not Deadly, none of its Encounters killing; `show board` gained
Tier and Deadly after Patron and moved Difficulty after Reward; the first builder opens on "Beats",
"Words to be had." and "Somewhere not to be seen."; `preview` gained its Beats. The epic's S12 box.
Verified 2026-10-11 at fd9421d: the rows re-derived (`s12-board-5`'s `show board` and `preview` as listed), every new word by `ui-text.md` and the glossary, one source in `words` for both front ends (but
`tierWords`, the page's alone, and "2 or more" and "2 or more Heroes", each front end's own: corrected at the close, DL-270), the e2e's seed search (139 of its 200 seeds qualify, seed 0 the first; none found fails naming why); 35 mutations of the reading, card, builder and CLI, 30 red at once, 5 surviving the unit tests (the mark's icon dropped or swapped, a Death figure in a Deadly Quest's builder as text, a tooltip or an `aria-label`) killed by tests added: the builder's no-Death check now on a Deadly Quest, reading tooltips and screen-reader labels too, and the mark's alert icon held; the e2e now holds the card's lead and the Beats visible at each width (the mark and Beats hidden at the phone's width, red there).

## DL-270 — v1.2.0-S13: the release's review and its findings fixed

**Status:** Accepted · **Date:** 2026-10-11 · **Decided by:** the owner's answers (DL-257); the agent's build

**Context.** The close begins with a review of the release's commits, `0badc22..f30f18a`, read only:
2 bugs, 6 risks, 13 findings in the docs and 12 nits, each checked against the code or a report. A
bug is fixed test first; a risk of balance is the owner's. S11's batch stays pending, untouched.

**Decision.**

1. **The bundle's content version.** `compactContent` (now `web/compact-content.ts`) empties the
   changelog of `content/version.json` alone, by its full path; a folder's row keyed `version` is
   bundled as written, where it gained a field the page's reader refuses.
2. **The calibration's write-back.** `writeTunedEncounters` (`calibrate.ts`) writes each tuned
   drafted Encounter with its final newline, leaves an Encounter it does not tune unwritten, and
   refuses a drafts directory with no `encounters/` folder, naming it.
3. **What a Quest meets.** `quests doctor` and `encounters show`'s `drawnBy` read only the Beats a
   Tier of their template plays (`playedBeats`, DL-262 item 3), so an Encounter only a trailing Beat
   draws is one "no Quest meets". The content's check has no such rule; its pool rule, every Beat's,
   and the doctor's stay alike. S11's batch passes it.
4. **A Tier ladder held to the templates.** The content's ladder rules, unchanged, are one function
   (`templateLadderProblems`, `ladderProblems`), which the config kind runs on a changed `tiers`
   against the templates on disk, so `config set tiers` refuses a ladder a template cannot play.
   `config.md` names what is left: a ladder and a `quests` edit pending at once meet only at "Finish".
5. **The Targets' default baseline** is `v1.2.0-s2-gate-2026-10-10`, which holds every counter the
   Targets read (DL-259), in `settings.ts`, `environment.md` and the harness README.
6. **Year 20's highest Level** stays the mean over the games still in play at year 20, now said in
   its row, the by-year table and DL-259: DL-83 item 22 measures the pace of progression, which a game
   ended early does not show, as item 21's year-10 mean reads only the games in play.
7. **The review page's Beats** read each pool whole: its kinds or "Any", tagged its tags, or the
   Encounters it names. A pool of tags or names is listed, and a change of either shown.
8. **Smaller fixes.** `quests finale set` refuses a field but `line`; a key is content's `kebabCase`,
   a letter first; a Transfer back is counted between Rivals only, DL-69 item 4's lines being the
   Rivals'; a run shorter than DL-83 item 18's slice says so; content's test of the Encounters a Tier
   draws reads the overrides.
9. **The words.** Live pages and comments say what is true: a template's live figures (XP factor,
   Death scale, Fame minimum; CONTEXT.md, data-model.md, the engine), the estimate's Party and Days,
   a Quest's Days, `HEROESIM_DRAFTS`, the editor's `null` and `--no-tags`, the encounters commands
   and a Trait's use (`quests.md`), the root README. `loot.ts` cites the pillars (DL-256 item 1) and
   `plan.md` §3's item goes. Three facts of this release's entries are corrected in place, each
   marked: DL-262 item 1 (the ladder's Days may overlap, as `checkConfig` holds), DL-259 (year 20's
   mean) and DL-269 (`tierWords` the page's alone).

*Judgement calls, for the owner to see.*
- **The Rivals' Rosters (R1), not tuned or changed.** A Rival hires while its Wealth exceeds
  `recruitThreshold` Upkeeps, with no Roster cap, a rule this release left alone; its Wealth rose
  (16,121 a Rival at year 2 in S2's quick run, 22,950 in S5's) and S7 took almost every Rival Death
  below Tier 4 away. On S8's one profiled game, `v1.2.0-s8-profile`, the Rivals hold 20.3 Heroes and
  120,829 Wealth each at year 10 (v1.1.9's close profile: 11.3 and 42,738), `ambitious` a mean of
  29.85 Heroes over its year-starts and `steady` 20.95 (7.81 and 5.33 there, where a `reckless` Rival
  grew instead). The world's mean Level counts every Hero on a Roster (DL-257's call), so these
  Rosters set the Board's centre: the Rivals' mean Level 7.05 over 81 Heroes at year 10 against the
  player's 8.38 over 8. The timing is within the spread of identical games, so DL-266's "not code" is
  plausible, not established. For the close: read the full gate's Rival Rosters before its speed
  lines; Rival income or a Roster cap is tuning, reported not tuned (DL-257 item 7).
- **DL-262's Days:** the record corrected, not the rule: `checkConfig` calls overlapping Days tuning.
- **`docs/quests/calibration.md`** is kept as it is: a dated report of content version 31, headed by
  its run, a record DL-218 keeps rather than a live page.
- **Rankings' "Ladder"** is qualified in CONTEXT.md, not made a term.

**Consequences.** No play, content or config change: the engine's edits are comments, and the
harness's are its reports' words and a counter the policy never moves, so no sweep. A drafted
Encounter tuned in place keeps its newline; a ladder that would fail "Finish" fails `config set`.

**Evidence.** The commit `v1.2.0-S13 (DL-270)`. Tests first, 14 red then green: `web/src/content.test.ts`
1, `calibrate.test.ts` 2, `quests-doctor.test.ts` 1, `quests.test.ts` 3, `config-kind.test.ts` 1,
`settings.test.ts` 1, `targets.test.ts` 1, `quest-review.test.ts` 1, `counters.test.ts` 1,
`sweep.test.ts` 1. The review: the session's scratchpad, `s13-review.md`. The epic's S13 Status.
Verified 2026-10-11 at 6154cf3: each fix re-derived (the built script's changelog empty; `playedBeats`
the engine's `beatsDrawn` through `tiersOf`; the S2 gate's `transfersBack` 24, all between Rivals,
so unchanged; R1's figures as its reports give them; the corrections facts); 27 mutations, 20 red,
6 killed by tests added (an untuned file rewritten, a sound ladder refused, the by-year words, an
unescaped name, the 20- and 25-year slice words), 1 equivalent; the flaky test, `release.test.ts`'s
git repositories, 4.3 to 4.6 s of a 5 s default, timing out under load, given 30 s.

## DL-271 — v1.2.0-S14 built: the Board's Tiers unlocked by each Guild's best four, each Tier's `unlockLevel` and `unlockHeroes` in place of `levelsPerTier`; config version 21

**Status:** Accepted · **Date:** 2026-10-11 · **Decided by:** the owner's answer of 2026-10-11 (b, the Board only); the agent's build

**Context.** DL-257 item 3 and DL-262 drew a Quest's Tier around 1 + ⌊the world's mean Level ÷
`levelsPerTier`⌋, the Tiers above the centre weighed as the Tiers below. The owner: "lower tier story
should still be offered through the game, the higher tiers are unlocked based on average level of top
4 heroes per guild"; offered a per-Guild gate (a), the Board only (b) or per-Guild hidden cards (c),
b.

**Decision.**

1. **The unlock** (`engine/src/tiers.ts`). A Guild's best four (`bestFourLevel`) is the mean Level of
   its `unlockHeroes` best Heroes on its Roster, away or injured counted, the sum divided by
   `unlockHeroes` whatever the Roster holds, a missing Hero at Level 0, so one strong Hero unlocks
   nothing alone. It unlocks the highest Tier whose `unlockLevel` that reaches (`unlockedTier`).
2. **The Board's top Tier** (`boardTopTier`): the highest any Guild in play has unlocked, the player's
   and the Rivals' alike; Tier 1 with none. Read once a refresh (`fillBoard`, `QuestOptions.topTier`).
3. **The draw.** A Tier above the top weighs 0; one at or below it `tierDrawWeights` at its distance
   below the top, the last held (`tierWeights`), so the lower Tiers stay on offer. The template is
   drawn among the Patron's open at the top (`templatesOpenAt`); where none is, among all of them, as
   before, each at its lowest Tier. Three `board` draws a Quest, as before. No per-Guild gate; the
   Fame minimum (DL-264) stands.
4. **Settings,** config version 21: each `questTiers` row's `unlockLevel`, at 0, 3, 6, 9 and 12, the
   thresholds `levelsPerTier` 3 gave, whole, Tier 1's 0, none below the Tier's beneath;
   `unlockHeroes` 4, whole, 1 or more; `levelsPerTier` gone. `tierDrawWeights` keeps 1, 0.5, 0.2,
   each now above 0. No template overrides `unlockLevel` (`TierOverride`, `tierOverrideFields`).
5. **The report:** `tierUnlocks`, the Board's top Tier and each side's best four and unlocked Tier as
   each year begins.
6. **Words:** CONTEXT.md's Tier, R21, the management design, `plan.md` §3, `config.md`, the editor's
   README, `quest-draft`. No player's text named the mean Level.

*Judgement calls, for the owner to see.*
- **The fallback, as designed,** offers at the top Tier 1 the Scholars' vault at Tier 4, Deadly, and
  the Crown's fort at 3: 108 and 120 offers in year 1 of the quick run, the Rivals taking 31 at Tier
  4, no Death. A narrower one, the templates whose lowest Tier is the nearest above the top, was built
  and run (no Tier above 2 offered) but moved 9 web tests' seed fixtures; set back, the owner's to
  choose. S11's batch starts the vault at Tier 3, not Deadly.
- **No glossary term:** Tier's entry says "the mean Level of its four best Heroes".
- **Every draw weight above 0**, not only the first, so the rule, not the defaults, keeps the lower
  Tiers offered. `config-check.test.ts`'s cases changed with it.
- **DL-262 items 1 and 3 superseded in part too:** they built DL-257 item 3's centre.
- **Pins moved by the Tier draw,** no default: `quests.test.ts`'s `board-a` Board (its 6th Quest
  Tier 3, difficulty 56 → Tier 2, 38; at Turn 90 quest-000061 Tier 5, 91 → 4, 73, 62 the restless
  dead at 3 → the tithe at 1, 64 the beast at 3 → the sickness at 1; the stream as it was);
  `quests-conclude`'s fingerprints bcbd90c0…, d56833fb…, 209f07bd… → 4aa6fab2…, d59db236…,
  88664527…; `resolve`'s 8d9793bc… → d1d94ff7…;
  `policy.test.ts`'s `likeliestLowest` based at the Board's hardest difficulty, its first Quest now a
  Tier 1 of 21 that the player's margin makes certain beside the rest. Tests whose premise is every
  Tier open unlock them (`levelled`). No test pinned a default this story changed.

**Consequences.** DL-257 item 3 and DL-262 items 1 and 3 are superseded in part. In the quick run no
Tier above 2 is offered after year 1: the best fours reach 4.13 to 5.00 by year 2, Tier 3's 6 not
yet, where S8's spread drew Tier 3 at half the centre's weight. Tuning `unlockLevel` is DL-257 item
11's; S11's wider Tiers open more templates at Tier 1.

**Evidence.** The commit `v1.2.0-S14 (DL-271)`. `neutral v1.2.0-s14-quick` (4 × 2,
`harness/reports/v1.2.0-s14-quick-2026-10-11`): refusals 0, invalid 0, the replay identical,
`e8fc5184…`. `compare` with S8's quick (`62fab24b…`), 388 counters moved of 623: offered by Tier
18.1, 39.9, 29.7, 10.5, 1.7% → 29.6, 67.8, 1.4, 1.2, 0; the player took 33.1, 52.0, 13.9, 0.9, 0.1% →
40.1, 59.6, 0.3, 0, 0; the Rivals 10.0, 49.4, 32.9, 7.2, 0.5% → 19.4, 79.1, 0.8, 0.7, 0. The top Tier
1, 2, 2 at year-starts 0 to 2 in every game; best four at year 1, the player and ambitious, miserly,
reckless, steady, 4.00, 4.00, 3.13, 3.75, 3.75, at year 2 5.00, 4.94, 4.13, 4.75, 4.94. Quests a
Guild-year 219.75 → 267.38 the player's, the Rivals' 112.63, 119.00, 61.38, 111.63 → 147.88, 142.63,
110.88, 145.13; the mean Party 2.07 → 2.02; Deaths 0 → 0 and the Rivals' 2 → 0; Bankruptcies 0 and 0.
The epic's S14 boxes.
Verified 2026-10-11 at bd06abe: the rules and the report re-derived; the calibration drew each template at its lowest Tier only, its world's top Tier 1, so it now draws with every Tier unlocked; tests added where a mutation survived (the Board's refresh reading the top, an `unlockLevel` override in content, the counter's totals and a side's two Guilds, a Tier past the ladder); the web's "game it started from" is the History shared by ADR-0008, the world untouched.

## DL-272 — v1.2.0-S11 built: the content written, twelve Quest templates over three Tiers or more, their Beats' lines and pools; content 40

**Status:** Accepted · **Date:** 2026-10-11 · **Decided by:** the owner's answers (DL-257; the batch "b"; the tests "b"); the agent's build

**Context.** S11 writes the content the Tier engine plays: every template at least three consecutive
Tiers (Q25 c), its Beats' lines and pools in the order a lower Tier plays them. Sonnet drafted the
twelve through `quest-draft`, Opus reviewed them; 43 pending edits. The owner, on the batch's one
question (Tier 1 thin): "b", Guard the caravan and Recover the strongbox widened down to Tier 1. The
first "Finish" failed 21 tests that read the shipped templates and put the files back; asked, the
owner answered "b": make them independent of the shipped content, then Finish again.

**Decision.**

1. **The batch**, through the editor only: each template's `tierMin`/`tierMax`, Beats (lines, pools,
   order) and the four Finale lines. No new Encounter, no override, no other field. Tiers before →
   after: A quiet word 1–2 → 1–3; Escort the tithe 1 → 1–3; The sickness at the mill 1 → 1–4; Clear
   the barrow 2–3 → 2–4; Guard the caravan 2–3 → 1–4; Recover the strongbox 2–3 → 1–5; Survey the old
   workings 2–3 → 2–5; The beast of the fells 2–4 → 2–5; Break the sealed vault 4–5 → 3–5; Hold the
   border fort, Lay the restless dead, The counting-house job 3–4 → 3–5. Templates a Tier: 5, 8, 12,
   10, 7 (were 3, 6, 8, 5, 1). Every Beat played at its template's top Tier; Tiers 1–3 never Deadly.
2. **The tests made independent** (the owner's "b"), each still catching what it caught:
   - content: `barrow` (`content.test-support.ts`) plants the barrow's Tiers and Beats (2 to 3, three
     Beats by kind, no Finale or override); `encounters.test.ts` plants its own Encounters for tags and
     a Finale, and two templates whose Beat draws only a Finale, in place of the arcane pools;
   - editor: `plantQuests` (`test-support.ts`) plants the six templates the commands' tests read;
     the doctor's test plants an Encounter no pool names;
   - web: `firstSeedWhere` and `withPartyHomeInALaterStep` (`game.test-support.ts`) choose a seed by a
     stated condition, as the e2e's Board does: a Party home partway through a later step (the
     reducer's and the page's steps), one home injured (the report), a Party of three and one at home
     (`quest-return`), Heroes injured and away (`availability`); the Roster's filter fixture injures
     the first at home and makes them a Warrior. Turns, Days and the History counted from the game;
   - e2e: `board.spec.ts`'s game carries rules opening every Tier from Level 0, since no first Board
     offers a Deadly Tier now (the fallback's lowest Tiers are 3 at most).
3. **"Finish"** wrote the twelve files, content 39 → 40, its `npm test` passing.

*Judgement calls, for the owner to see.*
- **Open points the owner saw, left:** the Loot gap (eight templates with no Loot table offer Tier 3
  or higher); nine Beats drawing one Encounter (The trapped passage alone makes Clear the barrow's
  Tier 4 and Survey's 4–5 Deadly); no beast Encounter.
- **The other web tests the first Finish failed** (`quest-return` 3, the Roster's filter, the
  report's Injury) passed on S14's Board, but rested on the same content; made independent too.

**Consequences.** The first Board offers no Deadly Quest: in two years no Tier above 3 is offered (S14's
fallback offered the vault at Tier 4, now 3). Tier 3 rises a little, Tier 2 falls; Deaths 0, as at S14.
The bundle is 845,686 bytes of 850,000 (840,728 before).

**Evidence.** The commits `v1.2.0-S11 (DL-272)`: the tests (`ef1313b`), each red under its mutation
and restored; the content. `neutral v1.2.0-s11-quick` (4 × 2, `harness/reports/v1.2.0-s11-quick-2026-10-11`,
`eb2a646d…`): refusals 0, the replay identical. `compare` with S14's quick (`e8fc5184…`), 329 counters
moved: offered by Tier 29.6, 67.8, 1.4, 1.2, 0 → 30.4, 66.7, 2.9, 0, 0%; the player took 40.1, 59.6,
0.3, 0 → 40.6, 57.9, 1.5, 0; the Rivals 19.4, 79.1, 0.8, 0.7 → 22.0, 76.2, 1.8, 0. Quests a Guild-year
267.38 → 259.88 the player's; the Rivals' 147.88, 142.63, 110.88, 145.13 → 148.50, 142.63, 113.25,
151.38. Mean Party 2.02 → 2.03; Deaths 0 and 0; Bankruptcies and folds 0. `compare` with S2's gate too
(`5dbfdaf4…`, 20 years, not like for like). The epic's S11 boxes.
Verified 2026-10-11 at 3aa3235: the twelve templates' Tiers, every Beat's line, pool, draws and place and the four Finale lines are the batch the owner approved with DL-273's two lines, no other field changed, content 41's changelog as the editor writes it; every template three Tiers or more (7, 8, 12, 10, 7 a Tier), both doctors clean, the lines by `ui-text.md`; the tests made independent held to their mutations; a likely next batch (four Encounters, a Tier 1 template, two Loot tables, a pool widened) finished in a scratch copy failed eight more tests resting on the shipped content, each now independent and red under its mutation (a combat pool by a tag no combat Encounter carries, every lore Encounter taken out, Endurance's grid on three Encounters, the editor's draws and doctor counts read from its copy, a named pool too small, a Hero's Milestones planted), with the CLI's two sending a Party on Guard the caravan by name (`openToTwo`); on that batch the suite then failed only on timeouts.

## DL-273 — v1.2.0: Survey the old workings and Clear the barrow offered from Tier 1, on the owner's answers (c, a); content 41

**Status:** Accepted · **Date:** 2026-10-11 · **Decided by:** the owner's answers of 2026-10-11 ("c"; the batch "a"); the agent's build

**Context.** DL-271's fallback draws a Patron with no template open at the Board's top Tier among all
its templates, each at its lowest Tier. After S11 (DL-272) the Scholars and the Crown had none at Tier
1, so while the top Tier was 1 they offered the vault and the fort at Tier 3, the survey and the barrow
at 2. Asked, the owner chose "c": keep the fallback, and give the Scholars and the Crown a Tier 1
template. Sonnet drafted it through `quest-draft`, 4 pending edits; the owner, on the batch: "a",
approve as is, Finish.

**Decision.**

1. **The batch**, through the editor only: Survey the old workings (Scholars) Tiers 2–5 → 1–5, its
   second Beat "An old ward still guards the way into the workings." → "An old ward guards the way into
   the workings, and is read and passed."; Clear the barrow (Crown) 2–4 → 1–4, its second Beat "The
   barrow's mouth is entered quietly, past old traps." → "…, past old traps, and the way within is
   marked out." No pool, override or other field; Tier 1 is the ladder's, 2 Beats, neither Deadly.
   Templates a Tier: 7, 8, 12, 10, 7 (Tier 1 had 5). Every Patron's sphere now has a Tier 1 template, so the
   fallback draws nothing while that holds; DL-271's rule stands.
2. **The tests made independent** (DL-272's "b"): the first "Finish" failed 11 tests that rested on a
   first Board holding a Tier 2 or 3 Quest, or on a seed. Each now chooses its game by a stated
   condition or plants it, its name and intent kept:
   - web: `startedWithEveryTier` (`game.test-support.ts`), a new game under rules opening every Tier,
     as the e2e's Board (DL-272), for a Party home in a later step (reducer, app), a Party of three
     with one at home (`quest-return`) and one at home (the report's Death line); the Board's test
     reads its Quest by the heading's id, two Quests of a template sharing a name; the rebase test
     takes a world the two rules staff differently by the engine's Best Party; the Hero page a world
     with a Hero of two Milestones or more, that Hero;
   - harness: `likeliestLowest` based at the first band top of the ladder the player's margin leaves
     uncertain, not the Board's hardest; the sweep fixture's Tier 5 given the takings of a Tier the
     game took; the estimate's Morale test, on the first sample with a Morale consequence before its
     last Encounter, plants the Party's Morale at the steady floor and midway up the band, in place of
     the seeds estimate-0011 and 0003.
3. **"Finish"** wrote the two files, content 40 → 41, its `npm test` passing.

*Judgement calls, for the owner to see.*
- **One commit** for the tests and the content (S11 made two); each changed test file passes on
  content 40 and on 41.
- **Two mutations survive,** as they did before: a Party mate counted at home (the engine gives them
  no `roster-death`) and a choice kept for a Quest gone (the page shows none).

**Consequences.** Every first Board is Tier 1 (1,200 Quests of 200 new worlds, seven templates), and
in two years no Tier 3 is offered: S11 offered 253 (2.9%), every one the fallback's, since the top Tier
never passed 2. Tier 1's share of offers rises, its Days shorter, so more Quests a Guild-year; Deaths 0,
as at S11. The bundle is 845,738 bytes of 850,000 (845,686 before).

**Evidence.** The commit `v1.2.0 (DL-273)`. `neutral v1.2.0-s14c-quick` (4 × 2,
`harness/reports/v1.2.0-s14c-quick-2026-10-11`, `bf261a18…`): refusals 0, the replay identical, the top
Tier 1, 2, 2 at year-starts 0 to 2. `compare` with S11's quick (`eb2a646d…`), 314 counters moved:
offered by Tier 30.4, 66.7, 2.9% → 46.4, 53.6, 0%; the player took 40.6, 57.9, 1.5 → 56.1, 43.9, 0; the
Rivals 22.0, 76.2, 1.8 → 39.0, 61.0, 0. Quests a Guild-year 259.88 → 290.25 the player's; the Rivals'
148.50, 142.63, 113.25, 151.38 → 164.63, 154.25, 125.00, 161.75. Mean Party 2.03 → 2.02; Deaths 0 and 0;
Bankruptcies and folds 0. Mutations, each red then restored: Morale left out, a Morale consequence
drawing a roll, no Hero's own Morale kept (estimate); reward before chance, a Quest staffed that cannot
be (policy); Tier 5 left untaken (sweep); the steps going on after a stop (reducer, app); the away Hero's
grief, one Hero's fall said "each" (quest-return, report); a Quest never expiring (Board); Milestones
oldest first; a reading kept by world whatever its rules (rebase).
Verified 2026-10-11 at 185f823: the two templates' Tiers and second lines are the batch approved, every Patron's sphere has a Tier 1 template, content 41; the quick run alone reproduces `bf261a18…`, `compare` moving no counter; the tests' rules mutated, each red (the policy's chance order, Morale's form, a mate's Regard, Milestones, a reading kept whatever its rules, red in `reading.test.ts`); of the two said to survive, a choice kept for a Quest gone is red in `party-choices.test.ts` (the Board shows no card for it), and a Party mate counted at home is an equivalent mutant, since `awayAt` leaves out every Hero of the returning Party, whose `quest.taken` comes before the return: no gap, no test added.

## DL-274 — v1.2.0-S13: the close: the Gate line by line

**Status:** Accepted · **Date:** 2026-10-11 · **Decided by:** the owner's answers (DL-257, DL-263); the agent's run, as the delivery guide's close and `documentation.md` say

**Context.** The close runs the epic's Gate at `4220f57`, every story built and verified and the
review's findings fixed (DL-270). Each check and sweep ran alone, in turn, with
`HEROESIM_WORKERS=8` (the `gate`'s setting; the other sweeps read none).

**Decision.**

1. **The checks:** lint and typecheck clean; `npm test` 6,299 passed, 4 skipped, none failed, but
   for a timeout (below); `traits doctor` and `quests doctor` clean.
2. **The full `gate`,** `v1.2.0-gate`, 1,550.9 s, `59d52e71…`: every `gate.json` line met. Refusals,
   invalid (not validated after every advance), stopped, unfinished and round trips 0; the replay
   `seed-0001` identical; the save gzipped a mean of 16.31 MiB (max 22.68) under 30; the copy's share
   0.3882 (3.066 ms over 7.897 ms), at most 0.4875.
3. **The estimate,** 200 × 20,000: no one falling 1.18 points, within 2, met; Morale in 4.84,
   within 3, **not met**: estimate-0150's success, 59.40% estimated, 54.56% resolved, S3's sample
   and figure (DL-263). Its limit and the probe are left for the owner (DL-263 item 1).
4. **The boxes,** each passing: the twenty-year boxes 6 tests (4,138 s), the boxes kept apart 3, the
   speed run 2.
5. **The baseline moves** (`documentation.md`), v1.2.0 changing play: `gate.json`'s baseline is
   `v1.2.0-gate`, its saves' 16.31 and 22.68 MiB, each line's source naming it; the copy line's anchor
   stays 0.390 (DL-252); no limit changes. `v1.1.8-gate` leaves the tree (git at `4220f57`); the
   harness README names the new one.
6. **The Targets, reported, not tuned** (DL-257 item 7), measured against S2's `v1.2.0-s2-gate`:
   9 of 17 inside (S2 10). Outside: the player's Bankruptcy 0.0% (5–15; 0.0); first by Fame 31.9%
   (40–60; 91.2); Quests failed 1.1% (20–30; 6.8); strong 85.2% (≤ 50; 72.7); Deaths 0.24 a game
   (3–8; 4.28); Wealth 36.57 months (6–12; 36.13); highest Level by year 20 11.04 (14–17; 11.58);
   Transfers back 16.4% (< 15; 9.0). Inside: first by Wealth 42.2% (95.2); Rival folds 2.18 (2.74);
   the mean Level at year 10 8.71 (8.34); the four Dispositions at the floor 4.8, 7.0, 0.8, 15.2%;
   the two "none" Transfer lines 0.
7. **The Quests.** A Guild-year, the player 189.4 (S2 403.4), a mean Party 2.04 (1.55), 7.18 Days away
   (3.91); `ambitious`, `miserly`, `reckless`, `steady` 250.4, 163.2, 267.7, 166.3. Offered by Tier 1–5
   12.3, 20.0, 40.9, 26.8, 0%; the player took 28.0, 32.4, 33.9, 5.8%, the Rivals 5.8, 16.5, 43.4,
   34.3%. The Board's top Tier at year-starts 0, 1–2, 4–8, 11–20: 1, 2, 3, 4 (2.20 at 3, 3.90 at 10);
   no Guild unlocked Tier 5. Best four (the player, then the four): year 10 8.98, 8.32, 7.99, 7.68,
   7.97; year 20 11.01, 10.40, 8.67, 8.02, 9.18.
8. **R1, the Rivals' Rosters** (DL-270), a mean by Disposition at year-starts 5, 10, 15, 20:
   `ambitious` 15.8, 29.3, 33.7, 30.5; `miserly` 6.7, 10.7, 12.8, 13.0; `reckless` 31.3, 37.2, 37.3,
   24.3; `steady` 9.1, 14.3, 16.3, 16.9 (S2 at year 10: 11.0, 5.4, 14.2, 6.2). Every Rival 23.0 at
   year 10 (S2 7.7 over all year-starts, now 19.1); Wealth 104,149 a Rival at year 10.
9. **Deaths and Bankruptcies.** The player 12 Deaths (0.24 a game; S2 214), the Rivals 383 (7.66;
   S2 1,233), every one at Tier 4. The player's Bankruptcies 0 of 50; Rival folds 109, all
   Bankruptcy (S2 137).

*Judgement calls, for the owner to see.*
- **The baseline moved with the estimate's Morale-in line failing:** the `gate` met every line it
  checks, and neither of DL-263's answers (a wider limit, or a probe that accounts for Morale) moves
  play. Set back if the owner reads the close otherwise.
- **A timeout, not changed:** `web/src/content.test.ts`'s "fails the build on content the checks
  refuse…" failed 2 of 4 full `npm test` runs at its 5 s default (5,017 and 5,037 ms; 214 ms alone),
  the others passing; as DL-270's `release.test.ts`, a likely fix is a longer timeout, the owner's.
- **S13's first box stays open:** the Morale-in limit is a line of the Gate.

*Open for the owner:* the Morale-in limit (DL-263); R1's Rosters and the Rivals' Wealth (tuning,
DL-257 item 7); Deaths 0.24 a game, Tier 4 the only Deadly Tier played and Tier 5 never unlocked
(`unlockLevel` 12); the Targets outside their bands; the timeout; the playtest and the word.

**Consequences.** Every line but the estimate's Morale-in is met; the release awaits the owner's
answer on it, the playtest and the word (the delivery guide's step 3).

**Evidence.** The commit `v1.2.0-S13 (DL-274)`; `harness/reports/v1.2.0-gate-2026-10-11.md` and its
JSON, committed; the estimate's report `estimate-2026-10-11` (not committed). The epic's S13 Status.
Then, the agent's housekeeping, not an owner's answer (this line corrected at its verification): `web/src/content.test.ts`'s "the content gate" given `{ timeout: 30_000 }`, as DL-270's `release.test.ts` (no assertion changed); the Targets' default baseline `v1.2.0-gate-2026-10-11`, the release's closing gate (`settings.ts`, `environment.md`, the harness README, the settings tests); the `neutral` run `v1.2.0-close-neutral-2026-10-11` (no `HEROESIM_WORKERS`, alone, 10 games of 20 years, 403.4 s, schema 9, config 21, content 41), fingerprint `036f5572ae584d30a558e8665bbcfd66cd80937e47b310d6cd2c26d95c7d8e0e`, the next `--expect` reference, its report committed.
Verified 2026-10-11 at 01d8bc1: each line re-derived from the reports, the estimate's local one (1.18, 4.84) too, the baseline's move and the neutral reference (its 10 seeds the gate's own); this Evidence's "owner's asking" and 404.9 s corrected; a test now holds `gate.json`'s baseline fingerprint and saves to its report (3 survivors killed).

## DL-275 — v1.2.0: the owner's answer on the estimate's Morale-in limit: 5 points; Morale-aware estimating to the backlog

**Status:** Accepted · **Date:** 2026-10-11 · **Decided by:** the owner ("a"); the agent's record

**Context.** The close's estimate run (DL-274 item 3) met the no-one-falls line (1.18 points, within
2) and not the Morale-in line: estimate-0150's success, 59.40% estimated, 54.56% resolved, 4.84
points against DL-173's 3, the figure since S3's key order (DL-263). DL-263 item 1 left the limit to
the owner at the close. Offered: (a) widen the limit to 5 points; (b) make the game's estimate account
for Morale, an engine change that moves play; (c) make the probe's sample order-independent and keep 3.

**Decision.**

1. **The Morale-in limit is 5 points** (the owner: "a"): `harness/gate.json`'s
   `estimate.moraleInQuest.within` 0.05, its source and a note saying so. It still holds the Quest's
   bands and success only, strictly below, each Encounter's gaps reported (DL-173). This supersedes
   DL-173's 3 points in part: the note under its owner's answer and `superseded/DL-173.md`.
2. **Morale-aware estimating goes to the backlog** (`plan.md` §3, Alongside): the estimate following
   each Encounter's Morale into the form of the Encounters after it, so the limit can return to 3.
3. **The estimate is not run again:** its figures are unchanged, only the line; 4.84 is within 5.

*Judgement calls, for the owner to see.*
- **The tests that pinned 3 points moved with the line** (the owner's word given): four tests of
  `harness/src/estimate.test.ts` printed or planted around the limit (the report's "limit of 3
  points", gaps of exactly and beyond it, 3.5 points' plant); each now reads 5, its fixture moved to
  keep its meaning (beyond: 7 and 5.5 points; within: 4.9). No assertion was loosened.
- **A fixed figure found and fixed, test first:** the report's Morale-in note said its rows count
  gaps "beyond 3 points", written in, not read from the spec; it now prints the limit
  (`estimateMoraleTolerance`), a new expectation red first.

**Consequences.** Every line of the Gate is met at the close; S13 awaits the owner's playtest and
word. A Morale-aware estimate would move play and the Rivals' choices, and with it the probe's line.

**Evidence.** The commit `v1.2.0-S13 (DL-275)`; DL-274's estimate report `estimate-2026-10-11`
(not committed). The epic's S13 first box and Status.
Verified 2026-10-11 at 01d8bc1: the line, its source and note, the four moved tests (none loosened) and the note's printed limit re-derived, 5 mutations red; DL-173 item 2's 0.03 found superseded too, its note and record added.

## DL-276 — v1.2.0: the owner's playtest: neither sentence said

**Status:** Accepted · **Date:** 2026-10-11 · **Decided by:** the owner

**Context.** The close (delivery.md, A release) asks for the owner's playtest of a few in-game years of
the release's build, scored by which of the Guild Management Design's sentences the player finds
themselves saying. v1.2.0 aimed at two (the epic's "Aims at", Q20 c): "He needs another year of
development." and "I need to give him a chance." The build at 4f140e2 was played on the local page.

**Decision.**

1. **The playtest is done** (the owner: "playtest done"), and asked which of the two sentences were
   said, from (a) both, (b) the first, (c) the second, (d) neither, the owner answered **"d": neither**.

**Consequences.** The release's aim is not yet felt in play. The causes the close reported are open
for the owner: no Guild unlocks Tier 5 in twenty years and the player's Deaths are 0.24 a game
(DL-274), so a Hero sent too early is rarely punished; the Targets are reported, not tuned (DL-257
item 11). The owner's word to release is a separate answer.

**Evidence.** The epic's S13 box. DL-274's Gate and Targets.
