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

## DL-294 — The economy redesigned before its pass: Silver, the Hall's upkeep, Contracts; three releases

**Status:** Accepted · **Date:** 2026-10-12 · **Decided by:** the owner, answering Q1–Q22 on
2026-10-12 from their outline of income and expenses; the defaults and the stories by the agent,
marked below

**Context.** The economy has been broken since v1.2.1-S4 (DL-292), and its pass was deferred (DL-293).
Before tuning it, the owner redesigned what it tunes. Upkeep was one charge every 10 Days, a Hero had
no Contract, and Facilities were fixed in code (`engine/src/document.ts`).

**Decision.**

1. **Coin** (Q1–Q3). Wealth is held in whole Silver, today's figures read as Silver; 100 Silver is a
   Gold. Shown largest Gold first, a zero part left out: coin glyphs on the page (the sentence form as
   their label), "5 Gold 20 Silver" in sentences, `5g 20s` in the CLI. Wealth, the Hall and Transfer
   keep their words; **Gold**, **Silver**, **Contract** and **Facility** enter the glossary.
2. **The Hall's upkeep** (Q4), every 30 Days: the Guild's own `hallBaseUpkeep`, set at founding from
   config, plus `hallUpkeepPerHero` × Heroes ^ `hallUpkeepHeroExponent` (1), Heroes the living Roster.
3. **Facilities are content** (Q5, Q5b): a kind with its base upkeep and its effects from a closed set
   (heal, training XP, Morale, Fatigue fall); each grade row its price, name and effects' values;
   editor commands and a doctor. A Facility's upkeep is its base × `improvementUpkeepGradeFactor` ^ (grade − 1);
   `hallMaintenancePerGrade` goes. Thrifty and Spendthrift scale the Hall's and Improvements' upkeep
   alone (Q17).
4. **Charges** (Q14, Q16, Q19). Wages on Days 9, 19, 29…; the Hall with its Improvements on Days 29,
   59…; whoever and whatever is there that night pays in full; two events, before the floor. One
   Upkeep is a month's costs: every threshold counted in Upkeeps divided by 3. The Treasury and the
   harness read income and expenses, a line for each flow.
5. **Items** (Q13, Q18). `sellRatio` stays; a loot-only Item carries its own `value`, replacing
   `lootOnlyPrice`. Rivals and the policy sell their surplus outside the afternoon's purchase; in
   debt, Holding first, then expired Heroes, then the debt sale.
6. **Contracts** (Q6–Q12, Q15). A wage of `wageBase` + `wagePerLevel` × Level + Stat sum ÷
   `wageStatDivisor`, × Negotiation, with a Guild-Fame term at 0, set at signing and fixed; one rule
   reading the whole game. The signer chooses 1, 2 or 3 years at × 1, 0.95 and 0.9; a Disposition its
   length, the policy 2 years, founding Contracts drawn from the list. Renewal at any time, replacing
   the term, with one stop at expiry. An expired Hero keeps charging and playing, and is taken by a
   fee-0 Offer unless renewed within 3 Days; Rivals and the policy hold expired Heroes and decide at an
   Offer (Level at or above the Roster's median, or the Roster at its floor). Release pays 0.8 of the
   wages left, nothing once expired. The Transfer fee is the wage × Days left ÷ 10 ×
   `transferFeeFactor` × (1 + a premium, a rule giving 0) × (1 − Negotiation). The signing fee stays.
7. **Releases** (Q20, Q21). `v1.2.2` Coin and the Hall (items 1–5); `v1.2.3` Contracts (item 6);
   `v1.2.4` the economy pass; `v1.2.5` Rivals who compete. Each new rule's default starts near today's
   cost; each close runs its Gate and records it, not blocking.
   *Supersedes in part* DL-280 item 1 and DL-293 item 2.
8. **The backlog** (the owner's, and from Q6–Q15): negotiation of wages, lengths and sale prices, by
   what a Hero wants; the wage read from a Hero's and the Guild's reputation, personality, Regard and
   teammates' wages; competing bids for an Unattached Hero; a Guildmaster's premium; Rivals renewing
   early; a choosable starting Hall; selling Hall assets; patronage by Sphere; investments, gambling
   and Events; borrowing and debt; Campaigns and Scenarios with economic stakes.

*Judgement calls, for the owner to see.*
- **Contract** enters the glossary with `v1.2.3`, the epic that builds it (principle 13).
- The premium multiplies the fee, a rule per Hero giving 0, nothing stored (Q11 as read).
- A grade's effect at grade 0 is the Facility row's; `v1.2.2` keeps today's wage until `v1.2.3`.
- The items earlier entries hold on Upkeep (DL-26, DL-43), the ledger (DL-116), the Market (DL-51),
  the fee (DL-57) and the wage (DL-36) are superseded by the stories that change them.

**Consequences.** `schemaVersion` rises in both releases; older saves are refused. Two releases ship
on an economy still broken, as `v1.2.1`'s; the pass tunes the finished rules.

**Evidence.** The epic `docs/planning/epics/v1.2.2-release.md`, its §6 the answers; `plan.md` §3.

*Note, 2026-10-12 (the owner's word: "move to 1.2.2").* Dependabot's two `target-branch`es move to
`v1.2.2-dev` (DL-147 item 6), taking effect when the record is merged into `main`.

*Note, 2026-10-12 (the owner's word: "create the 1.2.3 and 1.2.4 epics as well").* Planned from items
6 and 7 and the answers: `planning/epics/v1.2.3-release.md` and `v1.2.4-release.md`. The agent's
defaults and calls are in each epic's §2 and §6, for the owner before the stories they block.

*Note, 2026-10-12 (the owner, on `v1.2.3`'s Q-A to Q-C and its defaults).* A Guild may release its last Hero, the game
warning first; one that cannot sign another meets "Roster wiped". The Transfer Generator can take any
Guild's expired Heroes, the player's included, which keeps ADR-0002's decision; its third exception is
narrowed to Heroes under Contract at `v1.2.3`-S6. On Q-A, a Hero away on a Quest is renewed
once home; the epic's own defaults are approved as starting points, reviewed in `v1.2.4`'s tuning.

*Note, 2026-10-16 (the owner's word: "a", to push the record, `v1.2.3-dev` and Dependabot's move).* `v1.2.3-dev` is cut from `v1.2.2`'s record, and Dependabot's two `target-branch`es move to it (DL-147 item 6), taking effect when the record is merged into `main`.

*Note, 2026-10-17 (the owner's "a").* Likewise `v1.2.4-dev`, from `v1.2.3`'s record.

## DL-327 — CI watched by the orchestrator, one `check` per commit, no browser specs for docs, one record pull request

**Status:** Accepted · **Date:** 2026-10-17 · **Decided by:** the owner ("Implement items 4-7" of a review of
the delivery and CI process, 2026-10-17); Claude (how each is built)

**Context.** The review found four costs. A Haiku agent read each push's CI at about 35 to 40k tokens a
time (DL-311 item 5). `check` ran twice for one commit when the dev branch's push was followed by the release
branch's (`63b3052`, `6394ac5`, `303548e`), the browser specs ran on commits that changed only `docs/`, and a
release's close raised three record pull requests (#72, #73 and a third) where one would do.

**Decision.**

1. **CI watched by the orchestrator** (item 4). After a push on the owner's word, the orchestrator
   watches the commit's runs itself, in the foreground (`gh run watch <id> --exit-status`,
   `gh pr checks <n> --watch`), and reports a red one before the next story. The rule, no red run
   unseen (DL-311 Q-I), stays. This supersedes DL-311 item 5 in part: its Haiku agent. `delivery.md`,
   A story, step 8.
2. **One `check` per commit** (item 5). A `plan` job in `check.yml` runs `web/scripts/plan.mjs` first. On a
   push to a `v*-release` branch it asks GitHub, as `tested.mjs` does for the deploy (DL-235), for a
   completed, successful push run of `check.yml` on the same head commit, not this run. Found, the
   output `duplicate=true` skips `check` and `e2e` by their job-level `if`. A pull request's run, a dev
   branch's and a release push with no such run are never skipped.
3. **No browser specs for docs** (item 6). `plan.mjs` diffs the push's `before` (a pull request's base)
   against the commit, with `--no-renames`, and writes `browser=false` when no changed path is one
   the page or its specs read: `web/`, `engine/`, `content/`, `words/`, `media/`, the root
   `package.json`, `package-lock.json`, `.npmrc`, `.node-version`, `tsconfig*.json` and `check.yml`.
   `e2e` runs unless `browser` is the literal `false`. The lint, the typecheck and `npm test` run on
   every commit.
4. **Anything uncertain runs both.** No record read, a new branch (an all-zero `before`), a base git
   cannot fetch (a force push) or a diff it cannot make, an event that is neither a push nor a pull
   request. Only a literal `true` or `false` skips, so a plan that wrote nothing skips nothing.
5. **One record pull request** (item 7). The record, its archives, the next dev branch's cut, the
   move of Dependabot, any fix to the record and the playtest's answer are committed on the dev
   branch, the owner's questions asked first, and the release branch is fast-forwarded to it and
   pushed once, on the owner's word: one "Record from `<branch>` (no release)" pull request.
   `delivery.md`, the Plan step and Release step 4.

*Judgement calls, for the owner to see:*
- **A `plan` job, not a condition on each step.** A job skipped by its own `if` reports success to a
  required check, where a step condition would repeat on every step; `check` and `e2e` cost the
  runner nothing when skipped. `plan` adds a short job before them.
- **`media/` is on the list**: the build bundles the pictures (`web/src/media.ts`). `cli/`,
  `harness/`, `tools/` and `docs/` are not: neither the page nor its specs import them. A change to
  one of their `package.json` files changes `package-lock.json`, which is.
- **Item 5 is superseded in part, not in full:** the rule stays, only the agent changes.

**Consequences.** `plan.mjs` and `tested.mjs` share one reading of GitHub's record. A commit that
changes `web/scripts/` is a release, not a record (DL-255). A skipped `e2e` makes a green run, so the
deploy's `tested.mjs` may count a green run on a docs-only commit that follows a red `e2e` on the
commit before it; the orchestrator's watch is what sees that red run (item 1). Pushing the release branch
before the dev branch's run finishes finds no passed run and runs the whole `check`, which is the safe
way. Only a CI run proves the workflow, after the owner's word to push.

**Evidence.** `.github/workflows/check.yml`; `web/scripts/plan.mjs` with `plan.d.mts` and
`web/src/plan.test.ts`; `web/src/deploy.test.ts`'s `check.yml` tests; `docs/agents/delivery.md`;
`docs/deploy.md`; `superseded/DL-311.md`.
