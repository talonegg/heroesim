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

## DL-315 — v1.2.3-S2 built: the Contract and its wage

**Status:** Accepted · **Date:** 2026-10-16 · **Decided by:** an agent (the epic's S2); the owner, item 8

**Context.** Every Hero on a Roster is to hold a Contract whose wage is set at signing and fixed for its
term, with a length the signer chooses (DL-294 item 6, DL-311). S2 builds the record, the wage rule, the
charge, the signing with a length on the engine, the page and the CLI, and the founding Contracts.

**Decision.**

1. **The record.** `Hero.contract` `{ wage, signedOnTurn, years, endDay }`, null on no Roster;
   `TransferOffer.years`. `schemaVersion` 14, no migration. The validator's `contract-mismatch`: a Roster
   Hero in play holds a sound Contract ending after its signing Day, any other Hero none.
2. **The wage rule.** `contractWage` (`engine/src/contract.ts`): (`wageBase` + `wagePerLevel` × Level +
   Stat sum ÷ `wageStatDivisor` + `wageFameFactor` × the Guild's Fame) × the length's factor × (1 −
   Negotiation), floored once. Config 35 adds `wageBase` 0, `wageStatDivisor` 40, `wageFameFactor` 0,
   `contractLengthsYears` [1, 2, 3] and `contractWageFactors` [1, 0.95, 0.9], held to one length by
   `checkConfig`. It supersedes DL-36 item 10's wage shape.
3. **Charged.** `wages` sums each living Roster Hero's Contract wage, `upkeep` follows, and
   `guild.wages-paid` carries `wages` by Hero (`moneyMaps`). A Level gained no longer moves a wage. It
   supersedes DL-36 item 8.
4. **Signed with a length.** `recruit`, `transferIn` and `offerTransfer` take `years`, one of the list,
   else `length-not-offered`; `transferOut` signs for the taking Guild's `contractYears`.
   `hero.recruited` and `hero.transferred` carry wage, years and end Day. The Pool shows each signing fee
   beside the first wage at each length and a length to choose; the page's Transfers (the Guild's Roster,
   the Hero page) choose one, wages by `contractTerms`; the CLI's `recruit` and `transfer --in` take
   `--years`, required, and `--to` refuses it.
5. **Who chooses.** A Disposition's `contractYears` (content 50): steady 2, ambitious 1, miserly 3,
   reckless 1; the harness policy 2 (a whole setting).
6. **Founding Contracts** draw length and end Day evenly on the stream `contracts`, two draws a Hero,
   so `generation` is unmoved. A Rival founded at a fold draws alike.
7. **Ended** by a Death, a Retirement, a Transfer or a fold.
8. **No refit** (the owner's "a", 2026-10-16). The wages a Guild-year, −64% for the player and −38% for the
   Rivals against S1's baseline, are recorded, not refitted. S3's and S6's runs read them again as
   expiry's repricing and the renewals arrive; the close reports them against `v1.2.2`'s close; `v1.2.4`
   tunes the wage's keys with the rest of the economy, as DL-312 did the fee.

*Judgement calls, for the owner to see.*
- An Offer stores its years and the wage is set at its acceptance, by the buyer's rule then.
- The validator checks only that the end Day falls after the signing Day, since a rebase may change
  `turnsPerYear`.
- A founding Contract is signed at the full-term wage, only its end Day drawn part-way.
- The signing sentence leaves out the length, saying the wage and the end date (the CLI's 170-character
  line); the length shows in the Pool and the Roster.
- `--years` is required on the CLI; a length the list lacks is the engine's refusal, naming those offered.

**Consequences.** Two tests are red for the owner: `quests-conclude.test.ts` "nothing else moves … History
of 86c7afa" (a deliberate pin of play, whose three fingerprints moved from the first wage Day on) and two in
`world-copy.test.ts` (their 240-Turn game no longer ends with a Hero out of play). Both are set up anew;
the owner may overrule. Rival folds 1 → 0, Rival Transfers 0 → 30 and Offers to the player 0 → 14, all
declined. The Pool's table is wider, scrolling in its box on a phone.

*Note, 2026-10-16 (the owner's "a"): both changes confirmed, and made the standing practice
(`delivery.md` rule 4): a pin of play a story moves on purpose is re-recorded, its old values in its
comment, and a test whose setup rests on play has its setup arranged, its assertions unchanged; each is
traced to play, not a bug, and listed in the commit and the entry for the owner to see.*

**Evidence.** Commits `7be4ecb` and this story's; `harness/reports/v1.2.3-s2-quick-2026-10-16` (fingerprint
`cd75566d…`) against `v1.2.3-s1-baseline-quick-2026-10-16`; the epic's S2 boxes and Q-K.
Verified 2026-10-16 at d354646: the wage rule, the record, the charge, every signing and end, and the founding draws held (each created world as at `ef266aa` on five seeds, Contracts aside), the quick run's lower wages are wages fixed at Level 1 (every founding Hero Level 1; validated every advance, each wage Day charging every living Roster Hero, none nothing) and the History pin parts at the first wage Day; fixed: Year written lower case in the Pool, the length's choice and the refusal (`ui-text.md` rule 2), DL-36's record quoting no words of this entry, the data model's year as `÷ 3`, a test helper's comment out of place; the Consequences' red tests now pass, re-recorded and arranged in `d354646`.

## DL-316 — v1.2.3-S3 built: renewal, and the Contract's end

**Status:** Accepted · **Date:** 2026-10-16 · **Decided by:** an agent (the epic's S3)

**Context.** A Contract is to end, and its Guild to renew it (DL-294 item 6, DL-311, Q-A, Q-D). S3 builds
renewal and the end in the engine, and says the stop on the page and the CLI.

**Decision.**

1. **`renew`** `{ guildId, heroId, years }`: the Hero is signed again at `contractWage` now, no fee, a new
   term from that Day and the old one's rest dropped. Refused, in order: `length-not-offered`,
   `hero-not-on-roster`, `hero-in-party` (Q-A). `hero.contract-renewed`, its wage in `moneyFields`.
2. **The end.** On the night of its end Day, inside the Guild State Engine and before that Guild's wages,
   the Hero's wage is repriced and `hero.contract-expired` is emitted, a Milestone for every Guild.
3. **Out of Contract** is the selector `outOfContract(hero, turn)`, not a stored state: the Contract row is
   kept, its wage repriced by `outOfContractWage`, one core with `contractWage`, rounded down once.
   `outOfContractPremium` 0.1 (config 36).
4. **The stop** `contract-expired`, always on, after `transfer-offer` and before `module`. The CLI's
   `--until contract-expired` and the narration ("Stopped: a Contract ended: …" or "Contracts ended: …",
   each "is" or "are" Out of Contract) are one for the page and the CLI; the card's button opens the Roster.
5. **Nobody renews yet.** No Rival or policy renews until S6.

*Judgement calls, for the owner to see.*
- "The 1-year factor" is the shortest length offered's, so a config with no 1-year length never fails.
- Expiry runs inside `guild-state` before the wages, so a wage Day on the end Day charges the repriced wage.
- Renewal is a Milestone, as every signing is; a dead or retired Hero is refused as `hero-not-on-roster`.
- Re-recorded or arranged, for the owner to see (DL-315's note): `world-copy.test.ts`'s setup
  (`bankruptcyFloor`) and `fast-forward.test.ts`'s `created` (end Days moved on), assertions unchanged;
  the History pin in `quests-conclude.test.ts`, re-recorded on the owner's word ("a", 2026-10-16) after the
  permission system refused the builder's edit: named-b first diverges at event 448, Turn 44 (a repricing
  24 → 27), named-c at event 204, Turn 29 (22 → 26), their old values in its comment.

**Consequences.** Quick run, 2 years (`v1.2.3-s3-quick-2026-10-16`, fingerprint `452b483e…`) against S2's:
wages the player 49,887 → 70,977 (+42%), the Rivals 252,423 → 291,865 (+16%). Quick run, 4 years
(`v1.2.3-s3-quick4-2026-10-16`, `f613da04…`) against S1's 4×4 baseline: wages the player 352,420 → 260,813
(−26%), the Rivals 1,072,520 → 1,090,154 (+1.6%); Rival folds 4 → 0; Rival-to-Rival Transfers 0 → 45;
refusals and stopped games 0. Q-K reads the wages again here, against S1's: in the 2-year run the player's are
49% below, the Rivals' 29%, both still outside 10%; in the 4-year run the player's 26% below, the Rivals'
within 10%. In those four seeds' 4 years, replayed with the policy: 223 `hero.contract-expired`
(seed-0001 37, seed-0002 59, seed-0003 89, seed-0004 38; the player's 8 in each), `hero.contract-renewed` 0.

**Evidence.** Commits `f930e13` and this story's; the two reports; the epic's S3 boxes, all three met.
Verified 2026-10-16 at 686900b: the price, the term, the refusals, the night's expiry before the wages for every Guild, once, the repricing (§2's 25), the stop in every map, nobody renewing, and 223 expired and 0 renewed replayed, wages as the report's; the History pin's move is the expiry alone (old values with it off), the arranged setups needed; 21 mutations red, two only after a test of the refusals' order was added; fixed: Q-K's 2-year reading here, the requirements' scope row.

## DL-317 — v1.2.3-S4 built: release, with a payout

**Status:** Accepted · **Date:** 2026-10-16 · **Decided by:** an agent (the epic's S4)

**Context.** A Guild is to let a Hero go before the end of their Contract, for most of the wages left, and
may release its last Hero (DL-294 item 6, DL-311, Q10, Q-B). S4 builds it in the engine, its ledger line
and its counter; the page and the CLI reach it at S9.

**Decision.**

1. **`wagesLeft`** `(hero, turn, config)`: the Contract's wage × the wage charges whose night is still to
   come and falls before the end Day, 0 once expired or with no Contract. The end Day's own night is not
   counted, since it charges the repriced wage (DL-316). One selector, for S5's fee as well.
2. **`release`** `{ guildId, heroId }`: the Guild pays `releasePayout` = `releasePayoutFactor` × `wagesLeft`,
   rounded down once, as a Market sale is; 0 once expired. The gear goes back to the holding
   (`item.returned`, cause `released`); the Hero leaves the Roster by `leaveRoster`, joins the pool as of this
   Turn with no Contract; each teammate warm or better loses `transferMoraleCost` (`transferMoraleCost`,
   exported from `transfer.ts` and reused); any Offer for them lapses `hero-left`. Refused, in order:
   `hero-not-on-roster`, `hero-in-party`. `hero.released` `{ heroId, guildId, payout }`, a Milestone, its
   payout in `moneyFields`, placed in every map keyed by event type.
3. **`releasePayoutFactor`** 0.8 (config 37; a rule of 0 to 1), added by hand as `config.md` says.
4. **The last Hero** (Q-B) may be released. `releaseWarning(world, deps, guild, hero)` is `null` unless they
   are the Roster's only Hero, else `{ payout, wealthAfter, cheapestFee, covers }`. Nothing is refused for
   it: a Guild short of every fee meets "Roster wiped" that night, and the game ends (tested). The ending
   still reads the signing fee.
5. **A payout may take Wealth below the floor**; nothing refuses it, and the night's floor test reads it
   the same night (tested, with and without a grace).
6. **The ledger**: the Treasury's expense line "Release payouts", never Other; the harness's `WealthFlows`
   `releasePayouts`, its own row and a share, in Spent in all. No Rival or policy releases yet (S7).

*Judgement calls, for the owner to see.*
- The gear's return has a cause of its own, `released`, so that the History says ", who was released";
  the teammates' Morale event keeps the cause `transfer`, the cost being the Transfer's, and is not narrated.
- The Hero's departure is `hero.released` alone, not also `hero.left-guild`; the harness's two readers of
  a Hero leaving a Roster (the Rival-seller count, the recoveries) read it too.
- `releaseWarning` counts the released Hero in the pool they would join, as tonight's ending does, so its
  `cheapestFee` is always a number; Fame is not asked (DL-38).
- `wagesLeft`, `releasePayout` and `releaseWarning` are not exported from the engine's index until S9's
  page and CLI use them (`testing.test.ts` holds exports to what production takes).
- Arranged for the owner to see (DL-315's note), assertions unchanged: `web/src/state/treasury.test.ts`'s
  game (`playersMonth`) now has the player and a Rival each release a Hero in month 4, as no Rival releases
  until S7 and the test holds that every line comes up on both sides.

**Consequences.** Quick run, 2 years (`v1.2.3-s4-quick-2026-10-16`): fingerprint `8a58f74a…` against S3's
`452b483e…`, moved by the config alone (36 → 37, `releasePayoutFactor` in every save): `compare` shows 0
counters moved, 606 the same, saves +208 bytes. The payout reads 0 on its own line. Bundle 887,196 bytes.

**Evidence.** Commit of this story; the S4 quick report; the epic's S4 boxes, all three met. Tests:
`release.test.ts`, `selectors.test.ts`, the Treasury's and the counters'.
Verified 2026-10-16 at 3a5e22c: the wages left re-derived against the wage Days and the night's expiry (the end Day's charge out, tonight's in until played, `>=` for `>` equivalent), the payout, the refusals, the effects' order, the warning, the floor the same night, no `hero.left-guild` reader missing a release, nobody releasing and play unchanged (`compare`: 0 counters moved); 27 mutations, 25 red, the Rival-seller count's reading of `hero.released` red only after a test was added; fixed: that test, and the harness README's recovery line.

## DL-318 — v1.2.3-S5 built: the Transfer fee from the wages left

**Status:** Accepted · **Date:** 2026-10-16 · **Decided by:** an agent (the epic's S5); the owner, the factor unfitted (DL-312)

**Context.** The Transfer fee is to be the wages left on the Hero's Contract, not twice the signing fee's list
price (DL-294 item 6, Q11, Q12), and `transferFeeFactor` takes its new meaning at 0.3, unfitted until `v1.2.4`
(Q-F, DL-312). S5 builds it test first and moves every caller.

**Decision.**

1. **`transferFee`** `(hero, buyer, turn, deps)`: `wagesLeft` (DL-317) × `transferFeeFactor` × (1 +
   `transferPremium`) × (1 − the buyer's Negotiation, read by `feeFactor` as `signingFee` reads it), floored once;
   0 once expired or with no Contract. Level and Stats are in it only through the wage signed. Supersedes DL-57
   item 2 in part (its core; the Negotiation, the rounding and an offer's fee fixed when made stand).
2. **`transferPremium(hero)`**: a rule for each Hero giving 0, nothing stored, ready for a mechanic to set it.
3. **Every caller on it**, each passing `world.turn`: `feeFor` (`transferIn`, `transferOut`, `offerTransfer`),
   `dearestWanted` (the Rivals' search and the Generator's `transferBid`), `debtTransfer`, `rosterReading` and
   `heroReading` (the CLI's and the page's readings), the page's `transferTo`. `acceptTransfer` pays the fee the
   Offer fixed. The CLI's usage for `transfer` says the wages left, no longer twice the signing fee.
4. **The signing fee stays** (Q12): `signingFee` holds the list price; the shared `heroFee` is gone.
5. **`transferFeeFactor` 0.3** (from 2) through `config set` and `config finish`: config 37 → 38.

*Judgement calls, for the owner to see.*
- `turn` is the third argument, beside `releasePayout`'s; `heroFee` was inlined into `signingFee`, its one use left.
- A Hero Out of Contract costs 0, so a Rival's search and the Generator may bid for one for nothing (a priced
  `transferIn`, as for any Hero) until S6 builds the free Offer.
- Arranged (DL-315's note), assertions unchanged: `transfer.test.ts`'s `dearest` made by the wage and the longest
  Contract, not by Stats; the pins of `transferFeeFactor: 2` in `transfer.test.ts`, `actions/transfer.test.ts` and
  `phases/transfers.test.ts` now 0.3; `accept-fixed` dears the Hero by a wage rise, not Levels. Rewritten to the
  new rule: `actions/transfer.test.ts`'s fee test. Also arranged: `cli/src/commands/transfer.test.ts`'s offer
  test (the dearest wage, not Stats) and `web/e2e/layout.spec.ts`'s Rival Roster check, which now picks a fee
  with both Gold and Silver, a fee being under a Gold at times. Re-recorded, old values in its comment:
  `quests-conclude.test.ts`'s three fingerprints, moved by each Transfer's new fee. The citations baseline
  1,481 → 1,480, a story line rewritten (`tools/decisions/story-citations.json`).

**Consequences.** Config 38: every game's fingerprint moves (the config in each save). Quick run, 2 years
(`v1.2.3-s5-quick-2026-10-16`, `9de5a850…`) against S4's (`8a58f74a…`), refusals 0, the Gate PASS:
- Rival-to-Rival Transfers 10 → 7, their fees 3,625 → 1,442 (a mean 363 → 206).
- Offers to the player (all declined by the policy) 7 → 11, their fees 2,470 → 1,311 (a mean 353 → 119).
- Rival folds 0 → 0; no game ended, 4 of 4 survived.
- Wages: the player's 70,977 → 70,977, the Rivals' 291,865 → 299,935 (+2.8%, the Rivals' larger Rosters).
- A fee at 0.3 is cheaper than the old twice-list-price at two years in, so the Rivals buy fewer Heroes, hire
  more from the pool (Rival signing 3,097 → 5,749) and spend more on Items. Unfitted (DL-312): `v1.2.4` tunes it.

**Evidence.** Commit of this story; the S5 quick report; the epic's S5 boxes, all three met. The fee's tests were
written first and red against the old code (`selectors.test.ts` 5 failed, `actions/transfer.test.ts` 1), then
green. Tests: `selectors.test.ts`, `actions/transfer.test.ts`, `transfer.test.ts` and the callers'.
Verified 2026-10-16 at f7a4a63: the fee re-derived (§2's Level 1 Hero, 22 × 36 charges × 0.3 = 237, 213 at the best Negotiation), the premium, the signing fee the same for every Hero of five worlds at every Guildmaster, every caller, config 38, the History pin's three games traced to their first change (each a Transfer the fee moved), and a Hero Out of Contract at 0 reaching the player's Guild only by an Offer the policy declines (stopped games 0); 20 mutations, 19 red, the six callers' Turn red only after tests were added, the premium's `1 +` equivalent while it is 0; fixed: those five tests, `rival.test.ts`'s need-budget Hero made dearest by Stats, the CLI usage's wrap and `superseded/DL-57.md`'s quote.

## DL-319 — v1.2.3-S6 built: Out of Contract, the free Offer, and Under Offer

**Status:** Accepted · **Date:** 2026-10-17 · **Decided by:** an agent (the epic's S6); the owner, Q-C, Q-G, Q-H

**Context.** A Hero Out of Contract is to be open to a free Offer their Guild answers only by renewing, and a
Hero any Offer stands for kept from every Party (DL-294 item 6, DL-311, Q8, Q15, Q-C, Q-G, Q-H). S6 builds both,
with the Rivals' and the policy's answer, and restates ADR-0002.

**Decision.**

1. **The free Offer** (Q8). `offerTransfer` for a Hero Out of Contract on any Guild's Roster, at a fee of 0;
   `freeOffer(world, offer)` reads the Hero's Contract at `offeredOnTurn`, nothing
   stored. Two new ends of `guild.transfer-offer-expired`: `renewed` (`renew` withdraws each free Offer for the
   Hero) and `taken` (on its last night, `takeOffer`: the end, then `makeTransfer` naming the Offer, with the
   Transfer's Morale cost, Regard and lock). `declineTransfer` refuses one, `free-offer`; `transferIn` refuses a
   Hero Out of Contract, `out-of-contract`, so the free Offer is the one way to take them (S5's gap closed).
2. **A Rival's answer, at once** (Q15). `renewsOnOffer(world, guild, hero, floor)`: Level at or above the median
   Level of the Roster, the Hero among it, or the Roster at or below the floor; a Rival's floor `rivalRosterMin`,
   its length its `contractYears` (`freeOfferRenewal`). Renewed or taken inside `offerTransfer`; for a Hero away,
   the night they come home (`offerTonight`, the night sweep's one rule).
3. **Under Offer** (Q-G). `underOffer(world, hero)`, a selector. `unavailability(hero, world)` gives
   `under-offer` after `in-party`: `dispatch` refuses `hero-unavailable`, and `availableHeroes`, `partyPool`, the
   preview, the page and the Rivals' search pass over them. Words: "is Under Offer", the chip "Under Offer".
4. **An Offer for a Hero away** (Q-H): `offerTransfer`'s `hero-in-party` goes; `expiresOnTurn` is the night of their return Day + `transferOfferDays`, stored when made (`offerExpiresOnTurn`); `acceptTransfer` still waits for them home. Supersedes DL-57 items 1 and 6 in part.
5. **Who bids** (Q-C). `dearestWanted` weighs a Hero Out of Contract on every Roster, at their fee of 0, by a
   free Offer, beside those under Contract, the dearest wanted as before. The Generator pairs every Guild in play, one draw a pair; the player's Guild never bids, and its Heroes under Contract are never bid for (ADR-0002, exception 3, now in `transferBid` through `chooser`): the phase reads no controller. Supersedes DL-59 item 6 in full, item 3 in part, and its context's box in part.
6. **The policy** declines every priced Offer and answers a free one by `renewsOnOffer` at its `rosterFloor` 4, a
   harness setting, renewing for `contractYears` once the Hero is home; its Parties are chosen from the Heroes
   its answers leave free.
7. **ADR-0002 restated**, its three amendment notes folded in and its old wording archived; exception 3 narrowed
   to Heroes under Contract. With it: `controller-reads.test.ts` (the phase's entry gone, `chooser`'s naming the
   bid), the glossary, `gate.json`'s `stopped` wording, its limit unchanged, and the harness assertion, which
   allows a Transfer naming the player's Guild only as a `taken` free Offer, for no fee. The counters' Offer
   ends gain `renewed` and `taken`; a taken Offer is not counted accepted.

*Judgement calls, for the owner to see.*
- A free Offer cannot be declined (Q8, "only by renewing") but can be accepted: the Hero goes at once.
- A Hero Out of Contract is weighed at their fee of 0, so wanted only when no dearer Hero is: wanting them
  first, tried, spent each Rival's Transfer step on free Offers the seller renewed (Rival-to-Rival
  Transfers 7 → 0 in the quick run); S7 makes a free Hero preferred.
- An Offer for a Hero away counts from the morning after their return: they stand its Days at home.
- The Generator's pairs hold the player's Guild, so `rivals` moves from its first night; DL-59 item 3 is
  superseded in part for it, beyond the epic's list.
- A Rival's search passes over a Hero Under Offer, so a Hero meets one Rival's Offer at a time.
- Re-recorded (DL-315's note), old values in its comment: `quests-conclude.test.ts`'s History pin (named-a,
  named-b and named-c part at Turns 31, 34 and 79, a Rival's Quest drawn from `rivals`, which the new pairs
  moved). Arranged, assertions unchanged: `dispatch.test.ts`'s pair off the fixture's Offer. Rewritten to the
  new rule: the Generator's draw counts and player tests, the Offer refusals' "a Hero away".

**Consequences.** Every game's play moves from the Generator's first night (its new pairs draw `rivals`).
- Quick run, 2 years (`v1.2.3-s6-quick-2026-10-17`, `6acd20e1…`) against S5's: refusals 0, stopped 0, the Gate
  PASS; Rival-to-Rival Transfers 7 → 7, fees 1,442 → 2,364; Offers to the player 11, all priced, declined;
  free Offers 2, Rival to Rival, both renewed.
- Quick run, 4 years (`v1.2.3-s6-quick4-2026-10-17`, `d41f33a7…`) against S3's: refusals 0, stopped 0, the Gate
  PASS; Rival-to-Rival Transfers 45 → 30; free Offers to the player 5, each withdrawn by the policy's renewal,
  none taken; Rival to Rival 5, each renewed at once, none taken; 228 Contracts expired (the player's 32).
  Both answers renew nearly every Hero: Levels tie at the median in a young Roster.
- Q-K's wages a Guild-year: 2 years against S1's, the player −49.5%, the Rivals −27.0%; 4 years against S1's
  4×4, the player −25.9%, the Rivals +9.0% (against S3's, +0.2% and +7.8%).

**Evidence.** This story's commit; the two S6 quick reports; ADR-0002 and its archive; the S6 boxes, all five
met. The new tests were red first; the free moves counted by replaying the four seeds, each save the report's.

Verified 2026-10-17 at e9bb2c2: claims held, the pin traced; six surviving mutations closed by tests (Under Offer after an Injury, never away; a fee-0 priced Offer not free; the assertion on a free Offer in; the policy's Parties, no renewal away); two comments fixed. Q-L: the answer rule kept (the owner).

## DL-320 — v1.2.3-S7 built: in debt, and the Rivals' search

**Status:** Accepted · **Date:** 2026-10-17 · **Decided by:** an agent (the epic's S7); the owner, Q15, Q-L

**Context.** Below its floor a Rival sold its Holding and then made a debt sale, keeping a Hero Out of Contract
on a wage it could stop by letting them go for nothing (DL-294 items 5 and 6, Q15, DL-301). Its search weighed a
free Hero at a fee of 0 inside its Transfer step, and ranking them first sent every Transfer step to free Offers
the seller renewed (Transfers 7 → 0, DL-319). S7 puts the order in debt and the preference in the hiring. Q-L: the
owner kept the answer rule as set; `v1.2.4` tunes its threshold.

**Decision.**

1. **The debt order** (Q15). `debtRelease(world, guild, excluded)` (`controllers/rival.ts`): in debt
   (`belowFloorSince`) with nothing left in the Holding to sell (`surplusChoices` empty), a Rival releases one
   Hero Out of Contract at home, the lowest Level first, the lowest Hero id among equals, not one it sends that
   afternoon. A release pays 0 once the Contract has ended (DL-317) and moves no Wealth, so it is no purchase
   and stands beside the sales; the debt sale (`debtTransfer`) waits an afternoon in which a Hero was released.
   One Hero a step, the shape of `surplusChoices` and `debtTransfer`: each afternoon reads the debt again.
   *Superseded in part by DL-322 item 1, 2026-10-17: the release skips a Hero Under Offer. The record: [superseded/DL-320.md](decisions/archive/superseded/DL-320.md).*
2. **The policy** (`harness/src/policy.ts`) sells its Holding, then releases by the same function, never a Hero
   it sends or renews that Turn. It has no debt sale.
3. **The search.** A Rival's Transfer step seeks only Heroes under Contract (`transferChoice`, `priced`). Its
   hiring step first seeks a Hero Out of Contract on any Roster by a free Offer (`free`), at the same
   `transferAppetite` chance and Roster room (`transferAnswer`, `in`), a second draw from `rivals`, taken only
   when such a Hero is wanted, and only then recruits from the pool (`cheapestHire`). A free Hero never takes a
   real Transfer's place. The Transfer Generator still weighs both together (`dearestWanted`, `all`). Supersedes
   DL-57 item 5 and DL-59 item 5 in part: a Hero Out of Contract is sought whatever the seller says, their Guild
   answering the free Offer.
4. **The hiring budget** reads the Contracts' wages already, through `upkeep` and `wages` (DL-315): nothing
   built, tested (the budget and the reserve move with a Contract's wage alone).

*Judgement calls, for the owner to see.*
- One release a step, not all the Heroes Out of Contract at once: a Guild back above its floor stops.
- No guard on the Roster: a Guild whose every Hero is Out of Contract releases down to none, one an afternoon, and
  meets "Roster wiped". No run reached a release.
- A free Hero is chosen by the lowest id (all fees 0), and one a Rival seller would renew is not passed over, so
  that afternoon's hiring is spent on an Offer renewed at once (Q-L); a refinement for `v1.2.4`.
- Arranged (DL-315's note), assertions unchanged: `transfer.test.ts`'s "in debt, lets go its dearest by the wages
  left", the Rival's other Contracts run past Day 400, a Hero Out of Contract being released first. Re-recorded,
  old values in its comment: `quests-conclude.test.ts`'s History pin, games 2 and 3 (the second draw moves `rivals`).

**Consequences.** Every game's play moves where a free Hero is wanted.
- Quick run, 2 years (`v1.2.3-s7-quick-2026-10-17`, `387107e0…`) against S6's: refusals 0, stopped 0, folds 0,
  the Gate PASS; pool hires by Rivals 51 → 42; Rival-to-Rival Transfers 7 → 9; free Offers 18 (7 to the player),
  all renewed; releases 0; wages a Guild-year, the player 8,792 → 8,833, the Rivals 9,374 → 9,386.
- Quick run, 4 years (`…s7-quick4…`, `c2806185…`) against S6's: refusals 0, stopped 0, folds 0, the Gate PASS;
  pool hires 172 → 169; priced Transfers 30 → 24, free 2; free Offers 10 → 53 (20 to the player), 50 renewed, 2
  taken; releases 0; wages a Guild-year, the player 16,330 → 16,821, the Rivals 18,370 → 17,758.
- The Transfer step runs first and still deals, not 7 → 0 as ranking free Heroes first gave; the free step spends
  hiring on Offers renewed at once. No game reached the debt order: the release is tested, not yet seen in play.

**Evidence.** This story's commit; the two S7 quick reports; the S7 boxes. Tests: `rival.test.ts`,
`transfer.test.ts`, `policy.test.ts`. Red first: the debt order's six, the policy's four and the second draw; the
budget's two and the free step's other six held on the old code. The releases and free moves were counted by
replaying the four seeds.

Verified 2026-10-17 at ed9c9a0: claims held, the pin traced to the search; a surviving mutation (the policy releasing a Hero it sends) closed by a stronger test, a test added of a Rival releasing to an empty Roster and folding, Roster wiped; DL-57's note names items 1 and 3; a 12-year replay reached the order, 28 releases, all free and in order, one Rival wiped.

## DL-321 — v1.2.3-S8 built: the harness's lines

**Status:** Accepted · **Date:** 2026-10-17 · **Decided by:** an agent (the epic's S8)

**Context.** The rules of S2 to S7 are built and the harness reports little of them. S8 counts them, with no band
(`v1.2.4` proposes any), and rounds the Wealth's shares so each side's sum to the whole (DL-305's note).

**Decision.**

1. **`contracts`** (`counters.ts`, `game-counters.ts`), from the History, by side: Contracts signed by way (`hero.recruited`,
   `hero.transferred` for the Guild the Hero joins, `hero.contract-renewed`) and by years; expiries; releases. A release's payout is
   `releasePayouts` (DL-317), shown beside it, not counted again. Founding Contracts have no event and are not signings.
2. **`freeOffers`**, from the History, by the side that made the Offer and the side asked: made, withdrawn by a renewal, taken. An
   Offer is free when its Hero's last event before it is `hero.contract-expired` (no signing or release since), the History's order
   standing for `freeOffer`'s Contract read; a priced Offer at a fee of 0 is not free.
3. **`contractDays`**, observed before the policy acts: on a morning's Turn, Hero-Days and Guild-Days Out of Contract
   (`outOfContract`) and the wage in force by Level over Hero-Days, for the mean wage by Level; at every Turn, Under Offer
   (`underOffer`), each Hero and Guild once a Day.
4. **The mean Transfer fee** is the existing column's; a row beside the Contracts' repeats it for a Hero bought by each side.
5. **The shares** of the Wealth spent and taken, `shares` (`report.ts`), by largest remainder in tenths of a percent, the whole
   remainders compared, earlier first among equals; a whole of nothing reads a dash. A new section, `## Contracts (DL-321)`, holds the lines; no old line moves.
6. **`outOfContract` and `underOffer`** are exported from the engine's index, the only change to `engine/src/`.

*Judgement calls, for the owner to see.*
- Under Offer is read at every Turn's choices, since a Rival offers in the afternoon and the policy answers at its next choice; an
  Offer a Rival answers at once is never seen standing, so the Rivals' read 0.
- The mean wage is the wage in force (a Hero Out of Contract on the repriced wage), not the wage at signing.
- Arranged for the owner to see (DL-315's note), assertions unchanged: `counters.test.ts`'s hand-built `hero.recruited` and
  `hero.transferred` entries gain the terms (`wage`, `years`, `endDay`) the engine's carry, and `sweep.test.ts`'s fixture a value in
  each new counter. Changed with the rule: `sweep.test.ts`'s shares, Improvements' upkeep 3.8% to 3.9%, the naive rounding's 99.9%.

**Consequences.** Play does not move. Quick run, 2 years (`v1.2.3-s8-quick-2026-10-17`, `387107e0…`, S7's): `compare` with S7's
moves 43 paths, all new, and none of the old. The Gate PASS, refusals 0, folds 0.
- The player signed 23 Contracts (16 recruits, 7 renewals, all of 2 years), the Rivals 62 (42 recruits, 9 Transfers, 11 renewals);
  14 and 83 expired; releases 0. Free Offers 18 (7 to the player), all renewed, none taken, as S7's replay counted.
- Out of Contract: 17.9% of the player's Hero-Days and 51.2% of the Rivals', nobody renewing but on a free Offer. Under Offer 21
  of the player's Hero-Days (`v1.2.3-s8v-quick-2026-10-17`, fingerprint the same) and none of the Rivals'.
- The mean wage by Level, Level 1 to 4: the player 21.7, 23.7, 28.0, 39.8; the Rivals 22.1, 27.5, 38.1, 54.1. The mean Transfer fee
  a Rival paid, 410.
- Each side's shares sum to 100.0%. Q-M, the owner's "a" (2026-10-17): a Rival in debt releasing down to an empty Roster, kept as
  built; `v1.2.4` judges a guard or unprompted renewals with the economy (DL-320).

**Evidence.** This story's commit; `harness/reports/v1.2.3-s8-quick-2026-10-17`; the S8 boxes, both met. Red first: the
Contracts' and the free Offers' counters, the observer, the report's lines and the shares (9 tests).
Verified 2026-10-17 at 694302c: the counts re-derived by a replay and the free test found the engine's; Under Offer, read only at a morning, missed the 21 Offers standing at the policy's choices and is now read at every Turn, and equal remainders in the shares now compare equal, test first; two surviving mutations (the payouts doubled, the fee of a Hero sold) closed by tests.

## DL-322 — v1.2.3: in debt the release order skips a Hero Under Offer; the debt sale left for v1.2.4

**Status:** Accepted · **Date:** 2026-10-17 · **Decided by:** the owner (Q-N, Q-O)

**Context.** S7's verification found the policy in debt could release a Hero a free Offer stood for, which it meant to
let run out, so the Offer ended `hero-left` instead of `taken` (Q-N). Its 12-year replay on four seeds also found the
Rivals' debt sale (`debtTransfer`, DL-301) never fires in play: 225 Rival afternoons in debt, no debt sale, since the
releases come first (Q-O).

**Decision.**

1. **The release skips a Hero Under Offer** (Q-N, a). `debtRelease` (`controllers/rival.ts`) passes over a Hero
   `underOffer` (DL-319), for the policy and the Rivals alike: one rule. A Rival answers a free Offer at once, so it
   rarely matters there. Amends DL-320 item 1; item 2's policy takes it through the same function.
2. **The debt sale is left as built** (Q-O, a). `v1.2.4`'s economy pass judges it with Q-M's guard (DL-320), in its
   epic's §0.

**Consequences.** Play is unchanged where the debt order is unreached. Quick runs, 2 years (`v1.2.3-qn-quick`,
fingerprint `387107e0…`, S8's) and 4 years (`v1.2.3-qn-quick4`, `c2806185…`, S7's): both fingerprints the same, `compare`
with S8's moving no counter, the Gate PASS, refusals 0. The reports are not committed.

**Evidence.** This story's commit. Tests: `rival.test.ts` (a Hero Under Offer skipped, the next released, none when the only
one is Under Offer) and `policy.test.ts` (the same, and the Offer then runs out and is `taken`). Red first: all three, as
the old order released the Hero Under Offer. The epic's §6 rows Q-N and Q-O; `v1.2.4`'s §0.
Verified 2026-10-17 at 73e19df: the skip re-derived and its tests bite; the policy read Under Offer from the Offers before its answers, so a Hero whose priced Offer it declined that Turn was not released, and now reads the Offers left standing after them, test first; a test that read the document before the Offer ran out now reads it after; the epic's §7 debt sentence rewritten.

## DL-323 — v1.2.3-S9 built: the Contract on the page and the CLI

**Status:** Accepted · **Date:** 2026-10-17 · **Decided by:** an agent (the epic's S9)

**Context.** S2 to S8 built the Contract, renewal, release, the free Offer and Under Offer in the engine, with the page and
the CLI left to S9: the signing's lengths and the pool's wages (DL-315) were already shown. S4's verification found that
`releaseWarning`'s `covers` reads Wealth after the payout alone, while the night's Hall upkeep (Days 29, 59, …) and the
pool's refresh come before the "Roster wiped" check. The bundle stood at 890,069 of 900,000 bytes after S6.

**Decision.**

1. **The Hero page** of a Hero on the player's Roster has a Contract part: the wage and what is paid every 10 Days, its end
   night and the Days left, or since when the Hero is Out of Contract; Renew at a length chosen, the wage at each length
   listed (`contractTerms`); Release…, which asks first, saying the payout (`releasePayout`, nothing once Out of
   Contract) and for the last Hero the warning. A Hero away has both disabled, the refusals' sentences describing them.
2. **The warning is worded as an estimate**, and the engine's `releaseWarning` is unchanged (`releaseWarningWords`, shared by
   the page and the CLI): "…which covers the cheapest signing fee, … , as an estimate: the night's Hall upkeep and the pool's
   refresh come before the Roster is checked." Subtracting tonight's Hall charge would still miss the pool's refresh, which
   moves the cheapest fee, so the estimate stands whichever selector is read. Amends DL-317's warning, not its figures.
3. **The Roster's Table** has a Contract column: the Days left, Out of Contract, then Under Offer while an Offer stands for
   a Hero at home. It is drawn right after Fatigue in the wide Table, so Morale and Fatigue stay in view at 1280px (DL-289,
   Q21 a), and in the Hero tab on a phone; it has no sort. **The Guilds table** ends with a count of each Guild's Heroes Out
   of Contract; a Guild's page gives each Hero's Contract and, for a Hero Out of Contract, "Offer" (`offerTransfer`, no fee,
   the length chosen) in place of "Take in", which the engine refuses (`out-of-contract`). So does a Rival Hero's page.
4. **The Offers:** a free Offer says it offers no fee, that the Hero is Out of Contract, the night it ends and the Days
   left to renew them; it has Accept… and Renew at a length chosen, and no Decline, which `declineTransfer` refuses.
5. **Days left** are the Days from today to the end Day, the end Day itself "the last Day", its night still counting
   (`daysLeftWords`, `@heroesim/words`), for a Contract and an Offer alike; the Contract cell is `contractWords` on every Hero row (`HeroRow.contract`), once for both front ends.
6. **The CLI:** `renew --hero --years`; `release --hero [--confirm]`, which for the last Hero prints the warning and
   releases only with `--confirm`; the Contract in `show roster` and `show hero`; `show guilds`' Out of Contract column;
   `show offers` marking a free Offer and saying how it is answered; the usage's words for them and for `show guilds`
   (DL-305's note). No `show treasury` (Q-J): `show` keeps its two charge lines, the wages those of the Contracts.
7. **The engine** exports `releasePayout` and `releaseWarning`; nothing else in `engine/src/` changes.

*Judgement calls, for the owner to see.*
- The page asks before every release, as it does before a Transfer, though the epic named the confirmation for the last Hero;
  the CLI asks (`--confirm`) only there.
- The CLI cannot make a free Offer: `transfer --in` refuses a Hero Out of Contract, in words that name an Offer the CLI has no
  command for. S9 lists none; a `transfer --offer` is a small story if the owner wants one.
- Arranged for the owner to see (DL-315's note), assertions unchanged but for the shape: the tests that list the Roster's columns
  (`roster.test.tsx`, `selectors.test.ts`, the phone's tab), the Guilds table's and a Guild page's headings
  (`rankings.test.tsx`), `render.test.ts`'s Roster and Hero layouts, `main.test.ts`'s `show guilds` row and the Roster's help
  (`Sort … any but Contract, Traits and Items`) gain the Contract. `board.spec.ts`'s `savedContent` moved to `e2e/support.ts`.

**Consequences.** The bundle stays within its budget; its bytes are in the commit. The Roster's wide Table is one column
wider; the CLI's `show roster` and `show guilds` lines gain a column, so a script reading them by position moves.

**Evidence.** This story's commit; the S9 boxes: the bundle check met, the e2e box met on the machine, its "green on CI"
half waiting on a push on the owner's word. Tests red first: `contracts.test.ts` (words), the readings' Contract, the Hero
page's, Roster's, Guilds' and Offers' views, `contract.test.ts` (CLI), `args.test.ts`. The three doctors before and after,
unchanged. `e2e/contract.spec.ts` at 360, 820 and 1280 wide.
Verified 2026-10-17 at 9616ae3: the wages, payout, Days left and counts re-derived against the engine, 16 mutations red but the free Offer's length (closed by a test); fixed, test first: "0 Days left" on a last Day still open to renewal, now "the last Day"; a free Offer's card without its wages and its Accept saying "for 0 Silver"; the CLI's stop pointing a free Offer to decline, `release` asking --confirm for a Hero away, and usage promising a wage `show hero` lacks and a Hero Out of Contract taken in.
