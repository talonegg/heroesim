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

## DL-311 — v1.2.3 planned against v1.2.2's delivery: the owner's answers Q-D to Q-I, the assessment's fixes, CI read after each push

**Status:** Accepted · **Date:** 2026-10-16 · **Decided by:** the owner (answers Q-D to Q-I, "a" to apply the fixes); Claude (the fixes)

**Context.** `v1.2.3`'s epic was planned on 2026-10-12 (DL-294's note), before `v1.2.2` was built. An
assessment of it against `v1.2.2`'s record (Opus, read-only, at `5f0fc84`) found facts the build had
moved and gaps in the stories, and raised questions Q-D to Q-H; `v1.2.2`'s CI had stayed red four days
unseen (DL-310), Q-I. The owner answered on 2026-10-16 and chose to apply the fixes now.

**Decision.**

1. **An expired Hero's wage** (Q-D, c) is repriced at expiry by the wage rule at the 1-year factor ×
   (1 + `outOfContractPremium`), a new setting at 0.1 for `v1.2.4` to tune (the epic's S3, §2).
2. **The founding Contracts** (Q-E, b) start part-way through their terms, each end Day drawn evenly
   over its term, on a new stream, `contracts` (S2).
3. **`transferFeeFactor`.** *Superseded by DL-312 item 1, 2026-10-16; its text is in [superseded/DL-311.md](decisions/archive/superseded/DL-311.md).*
4. **Under Offer** (Q-G; Q-H, c): a Hero any Offer stands for, free or priced, cannot be chosen for a
   Party until it ends; an Offer may be made for a Hero away, who is Under Offer from their return,
   its Days counted from then (S6). A Hero rejecting an Offer is backlog (`plan.md` §3).
5. **CI read after each push** (Q-I, a): a Haiku agent reads the pushed commit's runs and reports a
   red one before the next story (`docs/agents/delivery.md`, A story, step 8).
6. **The assessment's fixes**, in the epic:
   - the save after 20 years fails by absence while no game runs 20 years, not blocking, and the
     baseline stays `v1.2.0`'s (DL-305 items 6 and 8);
   - S1 runs two baseline quick runs, 4×2 and 4×4, that each story's `compare` reads; the close reads
     `v1.2.2-close-gate-2026-10-16`;
   - in debt, the whole Holding first, then the Heroes Out of Contract released, then a Rival's debt
     sale; the policy has none (S7);
   - the release payout's ledger line and `WealthFlows` counter land with release (S4), and one
     selector, `wagesLeft`, serves the payout and the fee;
   - S2 reaches the page's and the CLI's signings, `guild.wages-paid`, the sentences and the
     validator's money maps, and S9 keeps the rest; a new event type reaches every map keyed by
     event type in its own story (§0);
   - a year's Days are read as `turnsPerYear` ÷ `turnsPerDay`, never a constant;
   - the expiry is a Milestone for every Guild's Hero;
   - S6 reaches `controller-reads.test.ts`, `gate.json`'s wording and the glossary's Transfer
     Generator;
   - S1's glossary words, §5's facts restated on `b1d1cad`, S8's shares by largest remainder, S9's
     words for `show guilds`, S10 at 2 sessions, and the wage and fee rules' tests first.
7. **The estimate** rises from 13–17 sessions to 15–19.

*Judgement calls, for the owner to see.*
- **Under Offer is a selector over the Offers, not a field stored on the Hero:** data-model rule 1
  makes availability a selector, and the Offer row already names its Hero. No schema change but S2's.
- A Hero's Under Offer ends when the Offer is declined, lapses, is withdrawn by a renewal or taken.
- A founding Contract's length is drawn on `contracts` too, so no `generation` draw moves.
- ADR-0002 already holds three amendment notes, so S6 restates it and archives its old wording,
  rather than adding a fourth (`docs/agents/documentation.md`).
- The fit's box test reports both rules' means and pins no default (`docs/agents/config.md`).
  *Superseded in part by DL-312 item 1, 2026-10-16: the fit's box test; now no fit, and no box test for it. The record: [superseded/DL-311.md](decisions/archive/superseded/DL-311.md).*
- `show treasury` is put to the owner before S9 (Q-J).
  *Note, 2026-10-16 (the owner's "a"): no `show treasury`; "wages are aggregated in treasury,
  contract updates will not impact the summary of wages" (the epic's S9 and §6).*
- The config version rises at S3, for `outOfContractPremium`, and not at S6, which adds no engine
  setting.

**Consequences.** S2 grows to 3 sessions, S4 to 1.5, S6 to 2.5 and S10 to 2, and S9 falls to 1.5;
S8 stays at 1, its Treasury line moved to S4. S6's record supersedes DL-57 items 1 and 6 in part
(Q-H), with the items the epic's §3 names; this entry supersedes nothing.

**Evidence.** The epic `docs/planning/epics/v1.2.3-release.md`, its §6 the answers; `delivery.md`'s
step 8; the epics' register; `plan.md` §3's backlog (Q-G).

## DL-312 — `transferFeeFactor` unfitted in `v1.2.3`: the economy tuned whole in `v1.2.4`

**Status:** Accepted · **Date:** 2026-10-16 · **Decided by:** the owner

**Context.** DL-311 item 3 had S5 fit `transferFeeFactor` over a fixed World State so the new fee's
mean met `v1.2.2`'s. Asked what that mean should be, the owner revisited Q-F. The fee from the wages
left climbs with Level faster than the list price did: a year into a 2-year Contract, the factor
matching `v1.2.2`'s fee is about 0.28 for a Level 1 Hero and 0.11 for a Level 8 (the epic's §2).

**Decision.**

1. **No fit for now** (the owner: "do not fit for now, the economic model will need to be tuned,
   considering wages and other economic factors"). `transferFeeFactor` takes its new meaning at S5 at
   §2's 0.3, through `npm run edit -- config`, with no box test of a fit. `v1.2.4`'s S5 tunes it with
   the wages and the rest of the economy. Supersedes DL-311 item 3 in full and its judgement call on
   the fit's box test.

*Note, 2026-10-16 (the owner's "a"): with §2's wage rounded down once, at the end, a Level 1 Hero's
wage is 22 and the matching factor about 0.27, not 0.28; the epic's §2 corrected.*

**Consequences.** Until `v1.2.4` a high-Level Hero's fee runs up to about three times `v1.2.2`'s, and
the Rivals' buying and debt sales move with it; `v1.2.3`'s close reports the fee, not blocking. The
Gate's 10% aim covers the wages only.

**Evidence.** The epic `docs/planning/epics/v1.2.3-release.md`: the Gate, S5, §2, §4 and §6's Q-F;
`docs/planning/epics/v1.2.4-release.md` S5; the record `superseded/DL-311.md`.

## DL-313 — CI's runner pinned to `ubuntu-24.04` for `v1.2.3`

**Status:** Accepted · **Date:** 2026-10-16 · **Decided by:** the owner

**Context.** GitHub's annotations on run 38849530300 say `ubuntu-latest` starts moving to Ubuntu 26
on 2026-10-19, during `v1.2.3`'s first stories. Every job in the five workflows ran on
`ubuntu-latest`. The phone layout spec has failed on Linux fonts before (DL-310), and `v1.2.3`'s S9
needs its e2e green on CI as on the machine.

**Decision.**

1. **Pinned** (the owner's "a"). Every job's `runs-on` in `check.yml`, `deploy.yml`, `release.yml`,
   `release-pr.yml` and `watch.yml` (`.github/workflows/`) is `ubuntu-24.04`, the image `v1.2.2` was
   checked and deployed on, so no image change lands in the middle of a release.
2. **Moved on purpose** in `v1.2.4` (its §0): to the current image, in a commit of its own, its CI
   read before the next story.

**Consequences.** A red run in `v1.2.3` is the code's, not the image's. The pin must move before
GitHub retires the 24.04 image.

**Evidence.** The five workflows; `docs/planning/epics/v1.2.4-release.md` §0; run 38849530300's
annotations.

## DL-314 — v1.2.3-S1 built: the Contract's words, and the baselines

**Status:** Accepted · **Date:** 2026-10-16 · **Decided by:** an agent (the epic's S1)

**Context.** `v1.2.3` builds Contracts (DL-294 item 6, DL-311). Its first story changes no play: it
writes the words the later stories build to, in `CONTEXT.md` and `docs/requirements.md`, and records
the two quick runs every later story's `compare` reads.

**Decision.**

1. **New terms.** **Contract**, **Out of Contract** and **Under Offer** enter the glossary (DL-294
   item 6, DL-311 item 4). The Contract's entry says the module contract (ADR-0005) is no term and
   stays lower case, as Effect's does a Trait's effect. "Contract" leaves the Quest's _Avoid_ list.
2. **Rewritten** in `CONTEXT.md`: Transfer, Transfer Offer, Upkeep, Unattached Hero, Treasury and
   Market, each as the rule it will be once built, marked "to be built" with its entry. The Transfer
   Generator's entry is unchanged; S6 changes it.
3. **Requirements.** R44 to R48 in `docs/requirements.md` §3.5 (the Contract, renewal and expiry,
   release, the free Offer, Under Offer), and a §2 scope row, all to be built.
4. **Baselines.** Two quick runs, each alone, for the later stories' `compare`: four seeds of two years
   and four of four years. Committed with `git add -f` in this story's commit.

*Judgement calls, for the owner to see.*
- The Contract's _Avoid_ list is "Deal, Agreement, Lease", words the page does not use; the epic named
  none.
- The Transfer Offer and Upkeep entries name `transferOfferDays` and "the wages the Contracts set", and
  no figure: the values stay in config.

**Consequences.** The glossary and §3.5 state the Contract's rules before the code has them. No page
text names a Contract, so no view changes. S2 to S8 `compare` against the two reports.

**Evidence.** `harness/reports/v1.2.3-s1-baseline-quick-2026-10-16.md` and `.json` (fingerprint
`93c75e85…`) and `harness/reports/v1.2.3-s1-baseline-quick4-2026-10-16.md` and `.json` (fingerprint
`8e5f31e3…`), committed in this story's commit; the doctors' and checks' readings in that message; the
epic's S1 boxes.
Verified 2026-10-16 at 0367bf5: the reports' fingerprints recompute and every claim held but these, fixed in `CONTEXT.md` and `requirements.md`: unbuilt rules stated with no "to be built" (Contract, Under Offer, Upkeep, Treasury, an Offer's new ends), renewal at any time without Q-A's "once home" (the Contract, R45), the Transfer fee called the wages left rather than read from them, the Market's rule cited to DL-305 for DL-301 (and built, not to be built as item 2 says), four _Avoid_ words unqualified that the page uses for Offers, Quests and Items, and §2's row naming no backlog.
