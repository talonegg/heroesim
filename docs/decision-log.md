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

## DL-295 — v1.2.2-S1 built: the words, Gold, Silver and Facility, and Wealth, Hall, Upkeep and Treasury rewritten

**Status:** Accepted · **Date:** 2026-10-12 · **Decided by:** the agent, on the owner's answers in DL-294

**Context.** DL-294 makes Wealth whole Silver shown in two coins, the Hall's Facilities content with an
upkeep, the Hall a charge of its own every 30 Days, one Upkeep a month and the Treasury income and
expenses. The glossary had no Gold, Silver or Facility; it listed Gold under Wealth's _Avoid_ and
Facilities under the Hall's, and the requirements had no row for any of them (the epic's S1;
principle 13, the words first).

**Decision.**

1. `CONTEXT.md` gains **Gold** (the larger coin, 100 Silver, a way of showing Wealth and never a unit
   held), **Silver** (the smaller coin and the unit Wealth is held in) and **Facility** (a part of
   the Hall defined in content: its upkeep at its first grade, its effects from a closed set, its
   grades as Improvements). **Wealth** says it is held in whole Silver and shown in both coins, and
   drops Gold from its _Avoid_ list; **Hall** names its Facilities and its upkeep and drops
   Facilities from its own; **Improvement** and **Worker** say Facility; **Upkeep** is wages every
   10 Days and the Hall's upkeep every 30, one Upkeep a month of them; **Treasury** reads income and
   expenses, a line and a total for each. Each part not yet built says "to be built", citing DL-294,
   until the story that builds it removes the mark: the coins and the whole Silver at S2, Facilities
   as content at S3, the Hall's upkeep at S4, one Upkeep a month at S5, the ledger at S7.
2. `requirements.md`: three §2 rows (the coins, Facilities, the Hall's upkeep), "To be built, v1.2.2
   (DL-294)"; R41 (the coins) in §3.2 after R11, R42 (Facilities) and R43 (the Hall's upkeep) in
   §3.7 after R33, new numbers and no renumbering; R11 and R33 point to them, and R33 and the Hall
   Improvements row say Facility.
3. The epic: S1's boxes ticked and its Status line set.

*Judgement calls, for the owner to see.*
- **Contract** does not enter, as the epic and DL-294 item 6 say; `v1.2.3` adds it.
- The Hall's and a Facility's "upkeep" are lower case, costs and not the term, as the epic writes
  them; **Upkeep** is the total. The Hall's entry says "a sum each Guild has from its founding", not
  "base", which the Hall's _Avoid_ list refuses.
- **Facility** avoids Room, Amenity and Building. R41 to R43 sit by their subject, as R39 and R40
  sit in §3.3 with the Heroes (DL-281): the coins with Wealth, the Facilities and the upkeep with the
  Hall.
- The Treasury's new lines (income and expenses) and the two charges are described in the glossary
  as the epic plans them; their names may move when S4 and S7 build them.

**Consequences.** S2 to S7 each remove the "to be built" marks for what they build, and the rows' in
`requirements.md`. The glossary and the requirements say Facility from now on, so a page, a
command or a test that says "facility" in prose is found by search at S3 and S8.

**Evidence.** The commit `v1.2.2-S1 (DL-295)`. `quests doctor` and `traits doctor` read alike before
and after (the commit message), the story touching docs alone; the epic's S1 boxes ticked.
Verified 2026-10-12 at a082d8c: the words re-derived against DL-294, the epic and the code (one
charge every 10 Days, three Facilities in code, six ledger categories), the _Avoid_ lists and capitals
clean and the endings CRLF; R41 to R43 moved from §3.3 (Heroes) to §3.2 and §3.7 by subject.

## DL-296 — v1.2.2-S2 built: Wealth in whole Silver, and every amount shown as coins

**Status:** Accepted · **Date:** 2026-10-12 · **Decided by:** the agent, on the owner's answers in DL-294

**Context.** DL-294 items 1 and 2 (Q1, Q2) make Wealth whole Silver, shown in Gold and Silver, before
any new amount exists. S2 is that: it changes no play, and every figure the game holds keeps its value,
read as Silver.

**Decision.**

1. *The unit.* `Guild.wealth`, a Quest's `reward` and a Transfer Offer's `fee` are checked as whole
   numbers by the validator's shapes (`engine/src/validate.ts`), and a Guild's founding names its
   Wealth in whole Silver (`entry-field-missing`). Every money setting was already `whole()` in
   `checkConfig` and every price and cost whole in its content kind; none changes.
2. *The formatter* (`words/src/coins.ts`): `coinParts` (largest Gold first, a zero part left out, `0`
   Silver alone for nothing, a minus leading), `coinWords` ("5 Gold 20 Silver"), `coinLetters`
   (`5g 20s`) and `signedCoins` beside `signed()` (`names.ts`). 100 Silver a Gold is `silverPerGold`.
3. *The words.* The History's sentences, the stops, the refusals and the Quest review's Price column
   say amounts in the sentence form, the amount in place of "N Wealth" ("for 2 Gold", "paid 40 Silver
   in Upkeep, leaving 4 Gold 60 Silver"); a Party's return says "Wealth +1 Gold 50 Silver".
4. *The coins element* (`web/src/views/coins.tsx`): each part's number, then its disc, drawn by the
   stylesheet in two tokens of their own (`--coin-gold`, `--coin-silver`), 3:1 on every surface; the
   sentence in a visually hidden span, the numbers and discs hidden from assistive technology; the
   amount in Silver on `data-silver`.
5. *The page.* The element replaces every bare amount and "N Wealth": the status bar (flashing on the
   Silver, `StatPill`'s `flashKey`), the Treasury (Wealth, the Upkeep's total and parts, the floor, the
   ledger's amounts and totals), the Guilds table and a Guild's page, the Hall, the Board, the Guild's
   home and the stops, the Market, Stores and Pool, the Hero page, the Quest report. The page's own
   sentences (the Treasury's Upkeep and opening row, the countdown, the reward preview, the Transfer
   sentences, the Offers) use `coinWords`. The Treasury's state keeps amounts as numbers; its `…Words`
   fields are gone. `Terms` takes any node as a value. Tables sort on the number.
6. *The CLI.* Its tables and own command lines use `coinLetters` (`Wealth 5g 20s`; Rankings only when
   by Wealth); the words' sentences it prints stay in the sentence form.
7. *The tests.* `page.test-support.ts` reads `data-silver` (`silverOf`, `wealth()`), the sentences
   (`silverOfWords`, `spokenText`) and matches amounts (`coinsPattern`, `amountPattern`); the e2e reads
   `data-silver` the same way (`web/e2e/support.ts`). Every test that asserted amount text asserts the
   new text; no value changed.
8. *The marks.* "To be built" is removed for the coins and the whole Silver in `CONTEXT.md` (Wealth,
   Gold, Silver), `requirements.md` (R41 and its §2 row) and `data-model.md`.

*Judgement calls, for the owner to see.*
- 100 Silver a Gold is a constant of the words, not a config setting: it is how Wealth is shown, not a
  rule of play, and the config version is raised first at S3 to S6.
- The sentence form wherever words reach (the History, stops, refusals, and the CLI's countdown line,
  a sentence like them); the letters form for the CLI's own tables and command lines.
- No thousands separators; a negative amount takes a leading hyphen-minus, as `signed()` does;
  `signedCoins(0)` is "0 Silver", unsigned.
- A non-whole amount throws a `RangeError` in the formatter rather than being rounded: none can be
  stored, so a fraction is a bug to find.
- The accessible structure is the Chip's `spoken` pattern, a hidden sentence, not an `aria-label`,
  which a span with no role does not reliably carry. A button's explicit `aria-label` names the amount
  in the sentence form.
- The Hall's Build button lost its second coin icon, the discs saying it; a chip says "Wealth" or
  "Reward" to a screen reader before its coins.
- The discs are small (0.6em, tight gaps) so that a Rival's Roster at 360px keeps its Transfer fee
  heading clear of the fixed name cell (`layout.spec.ts`).
- *The floor's sentence is shorter.* `guild.below-floor` ends "unless it recovers by then", as its
  stop does, not "back to 0 Silver or more on a night": the coins lengthened it past the CLI's
  one-line limit (`cli/src/namer.test.ts`, DL-210), and the floor is named once already.
- Trait points, Morale costs and factors ("Upkeep ×0.9") are not money and are not formatted. The
  harness reports still print Wealth as bare Silver.

**Consequences.** Later stories show an amount only through `<Coins>`, `coinWords` or `coinLetters`;
the search in the commit message is the check. A sentence with an amount is longer than before.

**Evidence.**
- The commit `v1.2.2-S2 (DL-296)`: the search commands and their readings, the checks with their
  counts, the bundle's bytes, the doctors' readings; the epic's S2 boxes ticked.
- A quick run (`v1.2.2-s2-quick`, 4 seeds, 2 years) gives `290b6d18…`, the fingerprint before the story
  (`v1.2.2-s1-baseline-quick`): play unchanged.
- Verified 2026-10-12 at a800f9a: the unit, the formatter, the element and every amount re-derived and 76
  mutations tried; the six page amounts no test read (the Treasury's Upkeep parts, a Rival's Wealth and
  its Hall's next costs, Home's last-Day reward, a stop's Quest buttons, a Hero's Transfer fee chip) are
  now read by tests, and two stale comments are put right.

## DL-297 — v1.2.2-S3 built: Facilities as content, their effects, the Hall keyed by them, and the editor's facilities

**Status:** Accepted · **Date:** 2026-10-12 · **Decided by:** the agent, on the owner's answers in DL-294

**Context.** DL-294 item 3 (Q5, Q5b) makes the Hall's Facilities content with a base upkeep and effects
from a closed set. The three were a tuple in code, and their four effects config settings. S3 changes
no play.

**Decision.**

1. *The kind.* `facilities.json`: each Facility's key, name, `plural`, `upkeep` (whole Silver, 0 or
   more; S4 charges it) and its effects' values at grade 0, at least one. Each Improvement names a
   Facility content defines, its grades 1 to n with no gap, any n, and holds a value for exactly its
   Facility's effects. Content's order is every Hall's and a Rival's build order.
2. *The effects,* described once as a Trait's are (DL-243): `healFactor`, `trainingXp`,
   `moraleBaseline`, `fatigueFall`, each a number with its bounds. `infirmaryHealFactor`,
   `xpPerTrainingDay`, `quartersMoraleBonus` and `fatigueFallByQuarters` leave config for the rows,
   with today's values; config version 31.
3. *The engine names no Facility.* `facilityKeys` goes; the Hall is a map from a Facility's key to its
   grade, founded with every Facility at 0; healing, training, Morale and Fatigue read `hallEffect`.
   `build` refuses a key content lacks as a programming error; `guild.improved` names the key.
4. *Rivals and the policy.* A Rival builds content's Facilities in content's order, or its
   Disposition's `buildOrder`, now checked against content's keys; the policy builds the first
   Facility with `healFactor`.
5. *Words.* A Facility's name, verb and what it does are read from its row and effects
   (`@heroesim/words`), in the History, the refusals, the page's Hall and the CLI.
6. *The save.* `schemaVersion` 12, no migration; a Hall's grade a whole number from 0; a Hall key
   content lacks warns (`unknown-facility`) and no rule reads it. Every amount an entry carries is
   whole Silver (`moneyFields`), refused at load, so the formatter never meets a fraction (DL-296).
7. *The editor.* `npm run edit -- facilities …` (`tools/editor`): two lists, the Facilities and their
   grades, in one session (`.editor/facilities.json`), the commands `list`, `show`, `add`, `change`,
   `remove`, `grade add|change|remove`, `effect add|set|remove`, `forms`, `doctor`, and the session's.
   Its forms and checks derive from the effects' description (`facility-effects.ts`). Its API is
   `/api/facilities/…`, the quests family's pattern. `facilities doctor` holds the grades to 1..n and
   to their Facility's effects, each grade's cost above the one below, the build orders, and the
   pending edits, and notes a grade that does no more (DL-53) and content with no Facility that heals.
   `docs/agents/facilities.md` and `AGENTS.md` say Facilities change only through it.
8. *Content version* 46.

*Judgement calls, for the owner to see.*
- Two Facilities with one effect join: heal factors multiply, the others add; a Hall with none reads
  the neutral (1, 0, 0, 0). A Hero on no Roster reads an empty Hall, so their Fatigue falls 5 a night at
  home as before. A grade past content's top reads the top's values, as the lists' last did.
- The training yard's key is `training-yard`, the content kind's own rule, as its Improvements already
  were; `compare` shows the harness's grade counters renamed, not play moved. The History's
  fingerprints in `quests-conclude.test.ts` move by that spelling alone.
- `buildOrder` stays, checked against content's keys, rather than removed: a Facility added makes a
  Disposition that writes one fail its check until it lists it. None of the shipped four does.
- The quarters' line now says Fatigue too; each effect's words are derived from the effects.
- An effect is added to or taken from a Facility with its grades' values in one hold (`effect add`),
  since the rules need a value at every grade and no single edit makes that; `change` gives `effects`
  whole. A Facility is added last and cannot be reordered by the editor.
- The doctor fails a grade that costs no more than the one below (a test held it on the shipped
  files) and only notes one that does no more, as DL-53 is a design aim, not a rule.
- Removal of a Facility is refused while a grade or a `buildOrder` names it; a grade is removed from
  the top only. The page has no controls for them, as for the Quest templates (DL-267).

**Consequences.** A Facility or a grade is content alone (the tests' fourth grade and chapel), made
through the editor. Older saves are refused (no compatibility is owed yet). `v1.2.4`'s pass tunes
`fatigueFallByQuarters` and the others as the quarters' rows' values, through these commands. S4 charges
each Facility's `upkeep`.

**Evidence.**
- The commit `v1.2.2-S3 (DL-297)`: the checks with their counts and the doctors' readings, the three
  before and after (`facilities doctor` did not exist before the story); the epic's S3 boxes ticked.
- A quick run (`v1.2.2-s3-quick`, 4 seeds, 2 years) against S2's (`v1.2.2-s2-quick`): `compare` 0
  counters moved, 577 the same; the fingerprint moves with the schema, `389f5232…`.
- Verified 2026-10-12 at 8ee1fe6: of 37 mutations, eight survivors are now killed by new tests (a fourth
  Facility's heal, training XP and Fatigue read at night; a Hero on no Roster at grade 0; the harness's
  grades by content; `discard` with no key), one equivalent; a Quest's taking has its reward checked
  whole; DL-53's test holds the shipped grades again; Coaching names the Hall, not the training yard.

## DL-298 — v1.2.2-S4 built: the Hall's upkeep and its Improvements', charged every 30 Days apart from the wages

**Status:** Accepted · **Date:** 2026-10-12 · **Decided by:** the agent, on the owner's answers in DL-294 and
§2's defaults as the owner set them (each Facility's `upkeep` 10, commit 5a1452b)

**Context.** DL-294 items 2 to 4 (Q4, Q5, Q14, Q17) give the Hall an upkeep of its own every 30 Days, a
base on each Guild, a share for each Hero and each built Facility's upkeep rising with its grade, charged
apart from the wages. Upkeep was one charge every 10 Days, `hallMaintenancePerGrade` × the Hall's grades
with the wages, × the Guildmaster's `upkeepFactor`.

**Decision.**

1. *The Hall's upkeep* (`hallUpkeepParts`, `engine/src/selectors.ts`): the Guild's own `hallBaseUpkeep`,
   set at its founding from config (`generateGuild`, so the player's, each Rival's and a replacement's);
   its Heroes' share, `hallUpkeepPerHero` × the living Roster ^ `hallUpkeepHeroExponent`, those away
   counted; and each built Facility's `facilityUpkeep` (`facilities.ts`), its content `upkeep` ×
   `improvementUpkeepGradeFactor` ^ (grade − 1), nothing at grade 0. `hallMaintenancePerGrade` is gone.
2. *Two charges* (`phases/guild-state.ts`): `wages` (`wagePerLevel` × Level over the living Roster) on
   `nextWagesDay`'s Days, 9, 19, 29…; the Hall's on `nextHallUpkeepDay`'s, 29, 59, 89…, every
   `hallUpkeepEveryDays`, counted as DL-26 counts; each for what is there that night, in full; the wages
   first, then the Hall, then the floor's test, once. `guild.upkeep-paid` gives way to `guild.wages-paid`
   `{ amount, wealthAfter }` and `guild.hall-upkeep-paid` `{ amount, wealthAfter, base, heroCount, heroes,
   facilities, traitFactor }`.
3. *Thrifty and Spendthrift* scale the Hall's upkeep alone; the effect reads "Hall upkeep ×0.9" in the
   words and the editor. No Trait's text needed changing.
4. *Config* 32: `hallUpkeepEveryDays` 30, `hallBaseUpkeep` 30, `hallUpkeepPerHero` 5,
   `hallUpkeepHeroExponent` 1, `improvementUpkeepGradeFactor` 1.73 (at least 1). *Content* 47: each
   Facility's `upkeep` 10, by the editor's `facilities change` and "Finish".
5. *The save*: `schemaVersion` 13; the validator holds `hallBaseUpkeep` whole from 0 and both events'
   amounts whole, each Facility's charge among them (`moneyMaps`).
6. *The readers.* `upkeep` stays the measure every reader of "Upkeeps" counts in, now the wages and the
   Hall's upkeep × `upkeepEveryDays` ÷ `hallUpkeepEveryDays`. The Treasury shows each charge with its
   sentence and next night, the Hall's with its parts; the History, the ledger (both under Upkeep), the
   CLI's `build` line and the harness's wealth table read the two events.
7. *Supersedes in part* DL-26 items 1 and 3 (one Upkeep Day, one event), DL-43 item 8 (the factor on the
   whole Upkeep) and DL-112 item 3 (`upkeepParts`, `nextUpkeepDay`).

*Judgement calls, for the owner to see.*
- *Rounding:* each Facility's charge and the Heroes' share are rounded to whole Silver, the parts summed,
  times the factor, rounded once; the event and the Treasury carry the parts and the factor, so the
  total is re-derived from them. Grades 1 to 3 of an upkeep of 10 cost 10, 17 and 30.
- The Hall's 30 Days is a setting of its own, `hallUpkeepEveryDays`; `upkeepEveryDays` keeps its name as
  the wages'.
- Until S5, one Upkeep reads ten Days: the wages and a third of the Hall's month, so S5's move is what
  changes the Rivals' and the policy's thresholds.
- `hallUpkeepEveryDays` need not be a multiple of `upkeepEveryDays`; at the defaults Day 29 charges both.
- A grade past content's top is charged by the formula at its grade; a Hall key content lacks costs nothing.
- The Treasury labels the Hall's own sum "The Hall", not "base" (the glossary's _Avoid_).
- The harness's wealth table splits Upkeep into the wages, the Hall's and, of it, the Improvements'
  before the factor; `compare` reads `wages` and `hallUpkeep` where `upkeep` was.
- §2's derived figures were recomputed at 10 and corrected in the epic; the editor's "Finish" takes no
  reason, so the content version's line is its own.
- The History's fingerprints in `quests-conclude.test.ts` move, recorded with their old values.

**Consequences.** Every game's fingerprint moves; older saves are refused. In the quick run, against
S3's, the Upkeep a Guild-year moves +3.3% for the player and −1.2% for the Rivals, within Q21's 10%;
the Hall's line alone +15% and −18%, reported for `v1.2.4`, not tuned (the lines in the commit
message). S5 makes one Upkeep a month.

**Evidence.** The commit `v1.2.2-S4 (DL-298)`: the checks with their counts, the doctors' readings, the
quick run `v1.2.2-s4-quick` and its `compare` with `v1.2.2-s3-quick`; the epic's S4 boxes ticked.
- Verified 2026-10-12 at c9ebd92: of 43 mutations, one survivor (the policy's recruit threshold
  reading no Hall upkeep) is now killed by a new test; the Trait factor's comments, the editor README's
  effect row and the Treasury's help, which still read the whole Upkeep or one payment, rewritten.

## DL-299 — The CI minutes: check times out and cancels superseded runs, the watch runs weekly

**Status:** Accepted · **Date:** 2026-10-12 · **Decided by:** the owner, who asked for the saving: the spending limit set to $0 (their own step), then these changes.

**Context.** The repository is private, so its GitHub Actions minutes are billed, and the owner was near the month's limit. The runs of `check` on dev branches and release branches were the bulk of the spend, several failing; the daily `watch` read production every day; and no run had a time cap or a cancel of the run it superseded.

**Decision.**
1. `check.yml`'s `check` job has `timeout-minutes: 20`, as `e2e` has 30, so a hung run cannot run for hours.
2. `check.yml` has a `concurrency` group per ref, and a newer run cancels the older one, except on a release branch (`v*-release`): the deploy reads every run on a release branch's tip (DL-235). Dev branches and pull requests lose superseded runs.
3. `check.yml`'s `pull_request` trigger stays. It is the only trigger for Dependabot's pull requests, whose branches the `push` filter does not name (DL-124 item 11).
4. `watch.yml` runs every Monday at 05:23 UTC, and by hand, not every day. The issue it opens on a failure is unchanged.
5. `dependabot.yml` is not changed: its updates were already monthly and grouped.

*Judgement calls, for the owner to see.*
- Item 2 of the plan assumed a push and a pull request both ran `check` for one commit. The recent run list shows push runs only, and no duplicate pair, so the trigger was kept and only the cancel added.
- The weekly watch means an outage can go unseen for up to a week. The owner can return it to daily, or rely on the manual run before a release.
- Playwright's `install --with-deps` is left as it is: its cache holds only the browsers, so caching the system packages would be a change to CI's image that was not worth its risk here.
- Writing fewer, larger pushes and running lint, typecheck and tests locally before pushing are habits, not changes made to the repository.

**Consequences.** Superseded runs on dev branches stop early and cost less; a hung `check` ends at 20 minutes; the watch runs about 4 times a month instead of about 30. Nothing else changes: the secrets, the deploy, the release and the tests of the workflows' contents keep their meaning.

**Evidence.** Changed: `.github/workflows/check.yml` and `watch.yml`, `docs/deploy.md`, `web/src/deploy.test.ts` (one test retitled, one added), and this entry with the regenerated `docs/decisions/index.md`. Checks: see the commit message.

## DL-300 — v1.2.2-S5 built: one Upkeep a month of costs, and the thresholds divided by 3

**Status:** Accepted · **Date:** 2026-10-12 · **Decided by:** the agent, on the owner's answers in DL-294 (Q16) and §2's defaults

**Context.** DL-294 item 4 (Q16) makes one Upkeep a month of costs: three wage charges and one of the Hall's. Upkeep was previously the wages and the Hall's upkeep for a 10-day span (a third of the Hall's month, DL-298), with Dispositions' `recruitThreshold` (Steady 60, Ambitious 45, Miserly 60, Reckless 30), `rivalHireReserveUpkeeps` (3), policy `recruitWealthMultiple` (3) and `consumableReserveUpkeeps` (20), and the hoarding Target (20) all calibrated to 10 Days.

**Decision.**

1. *The measure* (`upkeep`, `engine/src/selectors.ts`): a month's costs, `wages` × `hallUpkeepEveryDays` ÷ `upkeepEveryDays` plus `hallUpkeepParts`' total, rounded to whole Silver. With the defaults (30 and 10), three wage charges and one of the Hall's. Every reader of "Upkeeps" uses it.
2. *The Dispositions* (`content/dispositions.json`): `recruitThreshold` divided by 3: Steady 20, Ambitious 15, Miserly 20, Reckless 10. *Content* 48.
3. *Config* 33: `rivalHireReserveUpkeeps` 1, from 3, set through `npm run edit -- config`.
4. *The policy* (`harness/src/policy.ts`): `recruitWealthMultiple` 1, from 3; `consumableReserveUpkeeps` 20 ÷ 3, from 20.
5. *The targets and harness* (`harness/src/counters.ts`, `targets.ts`): `hoardingUpkeeps` 20 ÷ 3; `playerWealthMonths` reads `guild.wealth / owed` directly, one Upkeep being a month of costs.
6. *The words* (`CONTEXT.md`): Upkeep entry rewritten to reflect that each reading of reserves in Upkeeps counts a month of costs.

*Judgement calls, for the owner to see.*
- `hoardingUpkeeps` and `consumableReserveUpkeeps` take exact `20 / 3` in code and are reported as 6.67 in descriptions.
- `playerWealthMonths` divides `guild.wealth` by `owed` directly without multiplying by `upkeepsAYear / 12`, as `owed` is now a month of costs.

**Consequences.** Every game's fingerprint moves with the new config and content versions. Thresholds and reserves in Upkeeps align with the month-based definition while preserving the economic behaviour of S4.

**Evidence.** The commit `v1.2.2-S5 (DL-300)`: the checks with their counts, the doctors' readings, the quick run `v1.2.2-s5-quick` and its `compare` with `v1.2.2-s4-quick`; the epic's S5 boxes ticked.
- Verified 2026-10-14 at cf42436: of 36 mutations, three survivors (the measure rounded up, a Rival at the hoarding edge counted, months read with nothing owed) are now killed by new tests, four tuning values surviving by design; the report's policy line printed 6.666666666666667 Upkeeps, now 6.67, the hoarding Target's text reads its constant, and R43, a test's comment and name and the media comments, which still read the old measure or the inbox alone, rewritten.

## DL-301 — v1.2.2-S6 built: Loot-only values, and the surplus sold

**Status:** Accepted · **Date:** 2026-10-13 · **Decided by:** the agent, on the owner's answers in DL-294 (Q13, Q18) and §2's defaults

**Context.** In the first build (DL-48, DL-51), items found only as loot had `buyPrice: null`, and the Market Engine priced them with a single flat config setting `lootOnlyPrice` 600. Rivals and the harness policy never sold items to the Market (DL-51 item 8, DL-58 item 6), causing gear and consumables to pile up in holdings indefinitely (#25). DL-294 item 5 (Q13, Q18) redesigns item values and surplus liquidation.

**Decision.**

1. *Loot-only values* (Q13): An Item definition holds exactly one of `buyPrice` and `value` (a whole number above 0); the five loot-only Items (`barrow-kings-blade`, `vault-wardens-staff`, `mantle-of-the-fells`, `lantern-of-stannary`, `abbots-reliquary`) carry their own `value` (600 each, today's `lootOnlyPrice`). `lootOnlyPrice` leaves config (*config* 34, *content* 49). `marketPrice` returns `buyPrice ?? value ?? null`; a standard sale is `floor(price × sellRatio)`; a folding Guild's unique Items sell at their `value`.
2. *The surplus* (Q18, DL-288, `engine/src/surplus.ts`): Outside the afternoon's one purchase, Rivals and the policy sell surplus from holding:
   - loot-only Items in holding (which no Hero carries);
   - consumables of effects not kept, and excess units above the Guild's stock (`rivalHealItemStock` 2 for Rivals keeping `heal` only; policy keeps every effect to `consumableStock`), counting holding and Parties together;
   - gear in holding no Hero would equip over what they carry (beyond what living Heroes lack in each slot, best pieces kept first).
   Planned equips and dispatches are deducted before surplus is determined.
3. *Debt order* (Q18): When in debt (`belowFloorSince !== null`), a Guild sells its entire holding first; a Rival does not initiate debt transfers while holding items remain to sell.
4. *Supersedes in part* DL-51 items 2, 6, 7 and 8.

*Judgement calls, for the owner to see.*
- Gear ranking uses `worthOf` (sum of stat modifiers), keeping the best pieces in holding for living heroes lacking gear in that slot.
- Dispatched consumables and planned equips in the same turn are reserved and protected from surplus sale.

**Consequences.** Rivals and the policy actively liquidate surplus, preventing holding bloat and providing proceeds to debt-ridden Guilds. The quick run's sales by cause show the Rivals' and none of the policy's: it wins no Loot in two years, so holds no surplus, and sells once Loot comes. Old saves without `value` or with removed `lootOnlyPrice` are refused as allowed by the save policy.

**Evidence.** The commit `v1.2.2-S6 (DL-301)`: the checks with their counts, the doctors' readings, the quick run `v1.2.2-s6-quick`; the epic's S6 boxes.
- Verified 2026-10-14 at 63affe9: the values, the surplus, the debt order and the quick run re-derived (its fingerprint `93c75e85…` played again, refusals 0; the policy's first sales come with Loot, 25 Items in a six-year validated game), 16 of 63 mutations survived and are killed by 13 new tests, and the comments and the report's policy line that still said nothing sells were rewritten.

## DL-302 — v1.2.2-S7 built: The Treasury's income and expenses

**Status:** Accepted · **Date:** 2026-10-13 · **Decided by:** the agent, on the owner's answers in DL-294 (Q19) and the epic

**Context.** In the first build (DL-111 item 5, DL-112 item 6, DL-116), the Treasury's ledger grouped Wealth movements into six broad categories: Upkeep, Quest rewards, Market, Hall, Heroes, and Other. The player and the harness could not distinguish wages from Hall or Improvement upkeep, item purchases from Hall improvements, or signing fees from Transfers. DL-294 item 4 (Q19) restructures the accounts into ten distinct income and expense lines with section totals.

**Decision.**

1. *The ledger lines* (Q19, `web/src/state/treasury.ts`): Read from History:
   - Income lines: Quest rewards (`quest.resolved`), Item sales (`item.sold`), Transfers out (`hero.transferred`, the leaving Guild).
   - Expense lines: Wages (`guild.wages-paid`), the Hall's upkeep (`guild.hall-upkeep-paid` base and Heroes share), the Improvements' upkeep (`guild.hall-upkeep-paid` Facilities share), Item purchases (`item.bought`), Improvements (`guild.improved`), signing fees (`hero.recruited`), Transfers in (`hero.transferred`, the receiving Guild).
   - Other: `guild.wealth-changed`.
   Each a line, each section with its total for the period shown. Release payouts join with `v1.2.3`.
2. *Split charges:* When `guild.hall-upkeep-paid` carries both Hall and Improvement parts, `wealthChangeOf` and `WealthFlows` split it into `'hall-upkeep'` and `'improvement-upkeep'` according to the scaled Facilities upkeep sum, ensuring `hallUpkeep + improvementUpkeep === amount`.
3. *The harness* (`harness/src/counters.ts`, `game-counters.ts`): `WealthFlows` records all ten lines; the report displays the complete breakdown table and reports shares of spending (across the seven expense lines, summing to 100%) and taking (across the three income lines, summing to 100%).
4. *Supersedes in part* DL-111 item 5, DL-112 item 6, and DL-116 items 2 and 5.

*Judgement calls, for the owner to see.*
- Upkeep splitting computes `improvementUpkeep = Math.round(facilitiesSum * traitFactor)` and allocates the remainder `amount - improvementUpkeep` to `hallUpkeep`, ensuring exact conservation of Silver.
- In `web/src/state/history-reader.ts`, `wealthChanges` allows returning a single `WealthChange` or an array of changes, enabling a single History entry to map to multiple ledger lines.

**Consequences.** The Treasury and harness reports clearly separate every economic flow into its constituent income and expense lines, showing where Wealth originates and where it is spent. The quick run confirms all lines and exact 100% share sums.

**Evidence.** The commit `v1.2.2-S7 (DL-302)`: the checks with their counts, the doctors' readings, the quick run `v1.2.2-s7-quick`; the epic's S7 boxes.
- Verified 2026-10-14 at 16d10a4: every Wealth-moving event lands on one line, and the split's two copies agree; of 53 mutations, ten survived, one equivalent, and nine (the split's rounding, another Guild's charge, a lone line of a split, the rows' keys, the lines' words, the shares with sales) are now killed by new tests; a section's total is now its lines' sum, Other apart; the harness's Hall rows are labelled as the parts they are; the supersession notes, CONTEXT.md's Treasury and stale comments rewritten.

## DL-303 — v1.2.2-S8 built: The page and the CLI

**Status:** Accepted · **Date:** 2026-10-14 · **Decided by:** the agent, on the owner's answers in DL-294 and the epic

**Context.** The epic's S8 shows the finished engine's economy on the page and in the CLI: the Hall from content, each Facility with its grade, the next grade's price and the upkeep at each; the Treasury's two sections and its sentences; the Guilds table's Upkeep a month; the stops' and the Hero page's amounts; the CLI's `build` and its render of the Hall and the Treasury. The stories before it built most of this with the engine each one shows. S8 added each Facility's upkeep to the Hall, and its verification found the rest in place, added what was missing and asks the owner about the CLI's Treasury.

**Decision.**

1. *The Hall* (`web/src/views/hall.tsx`, `web/src/state/world-views.ts`). Each Facility's row gives its grade as pips, the Improvement built and its upkeep at its grade, from `facilityUpkeep`, which `@heroesim/engine` now exports (S8). It then gives what the Facility does and the next grade's Improvement and price, with Build on the player's own Hall alone. Beside them is the upkeep at the grade it would reach, "At grade 2, upkeep 17 Silver" (added at verification). The rows have been read from content since S3 (DL-297), the prices in coins since S2 (DL-296).
2. *The CLI's `show hall`* (`cli/src/render.ts`) gives the same: the Upkeep and Next upkeep columns beside Grade, Built, Next grade and Cost, and a line saying that each upkeep is paid with the Hall's every 30 Days (added at verification). `build` prints what was built and its cost, the Wealth, the wages every 10 Days, the Hall's upkeep every 30 and the next grade's cost, as S4 built it (DL-298).
3. *In place before S8, and checked:*
   - The Treasury's two sections, from S4 (DL-298). The Upkeep gives the two charges' sentences, wages every 10 Days and the Hall's upkeep every 30, each with its next night and the Hall's with its parts, then the Bankruptcy floor. The Ledger follows.
   - The Ledger, from S7 (DL-302): each row's line in its Category column, the chips by line with their counts, and the sentence of Income · Expense · Net over what is shown. A table of the lines, each with its total, is S9's (the owner's answer, 2026-10-14).
   - The Guilds table's Upkeep, on the page and in `show guilds`: a month of costs since S5 (DL-300).
   - The amounts on the stops and the Hero page (a Quest's reward, the signing and Transfer fees): in coins since S2 (DL-296).
4. *The words* (`web/src/views/section.tsx`, `cli/src/args.ts`, at verification). The Hall's help gives each Facility's upkeep and the next grade's. The Guilds table's help says an Upkeep is a month of costs. The CLI's usage gives `show hall`'s upkeep and `build`'s two charges.
5. *The journey's e2e* (`web/e2e/journey.spec.ts`) matches the recruitment's ledger row by S7's `Signing fees` line alone. The first build's `Heroes` category no longer exists (corrected at the close; the S8 commit had matched both).
6. *The CLI has no Treasury.* No `show` view gives the wages or the Hall's upkeep; only `build` prints them, and the Bankruptcy countdown is shown while it runs. The epic's "render of ... the Treasury" is left for the owner's answer (the verification's question).
7. *Supersedes in part* DL-112 item 6: the Hall gives each Facility's upkeep, and the Upkeep's two charges stay the Treasury's.

*Judgement calls, for the owner to see.*
- Each upkeep that the Hall and `show hall` give is the Facility's part before the Guildmaster's Traits, as the Treasury's parts give it. The Treasury applies Thrifty's or Spendthrift's factor to the whole charge, which is rounded once (DL-298). Parts scaled one by one would not sum to the charge.
- "The upkeep at each" is read as the upkeep at the Facility's grade and at the next grade, beside that grade's price.
- The Guilds table's heading stays "Upkeep", the glossary's term for a month of costs, and its help says so.

**Consequences.** Before paying for a grade, a player sees what each Facility costs to keep and what building the next grade would add. In the CLI, the two charges are seen only after a `build`, until the owner answers item 6.

**Evidence.** The commit `v1.2.2-S8 (DL-303)` (`cf42436`): the checks with their counts, the doctors' readings, the e2e at 360, 820 and 1280 wide, and the bundle check; the epic's S8 box.
- Verified 2026-10-14 at 6875f18: each S8 item was traced to the commit that built it, and this entry now credits S2, S4, S5 and S7. Four of 43 mutations of the shown code survived (Build on another Guild's Hall, the Facility a button builds, the Treasury's headings, a floor other than 0), and new tests now kill them. The next grade's upkeep was missing from the Hall and every upkeep from `show hall`; both are now built test first (9 more mutations, all killed). The help texts are rewritten, and DL-112 item 6's note and record are written.

