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

## DL-279 — v1.2.1: the live check allows Cloudflare's Web Analytics beacon on Pages alone

**Status:** Accepted · **Date:** 2026-10-11 · **Decided by:** the owner, answering on 2026-10-11 (b)
on DL-278's failure and (a) on how the patch is cut; the test's shape by the agent, marked below

**Context.** v1.2.0's live check failed on Pages (DL-278): with Web Analytics on, Pages adds
Cloudflare's beacon at the edge, and the page then asks `static.cloudflareinsights.com` for its
script and reports to `cloudflareinsights.com`. The test's rule that nothing leaves the page's
origin (DL-75) cannot tell the beacon from the page's own requests. The owner chose (b), to let the
test allow the beacon in a patch, over (a), turning Web Analytics off, and (c), leaving it recorded.

**Decision.**

1. **The patch is `v1.2.1`,** built on `v1.2.1-dev`, cut on this machine from `v1.2.0`'s record
   (`cacc87a`) on the owner's answer (a). It carries that record, so no separate "Record (no
   release)" pull request is raised. Like `v1.1.1`, it has no epic and no Gate: no play changes.
   *Superseded in part by DL-280, 2026-10-11: `v1.2.1` is the epic Fatigue and the Captain, with its Gate, and ships this patch. The record: [superseded/DL-279.md](decisions/archive/superseded/DL-279.md).*
2. **`leavesThePage(baseURL, url)`** in `web/scripts/deploy.mjs`, beside the addresses it reads,
   decides for `web/e2e/deployed.live.ts` whether a request leaves the page. Any other origin does,
   except the beacon's two origins, `https://static.cloudflareinsights.com` and
   `https://cloudflareinsights.com`, when the page is on Pages, its production address or a
   deployment's subdomain of it.
3. **The Worker stays strict.** The beacon there, or any other origin on either address, still
   fails the check.
4. **`plan.md` §3 moves on.** The short term's releases are renumbered: Fatigue and the Captain is
   `v1.2.2`, Rivals who compete `v1.2.3`. `docs/deploy.md` names the allowance.
   *Superseded in part by DL-280, 2026-10-11: Fatigue and the Captain is `v1.2.1`, Rivals who compete `v1.2.2`. The record: [superseded/DL-279.md](decisions/archive/superseded/DL-279.md).*

*Judgement calls, for the owner to see.*
- The allowance is by exact origin, so `http:` and look-alike hosts are still refused. It is not
  by path, so a change of the beacon's file name passes.
- A Pages deployment's own address (`<id>.heroesims.pages.dev`) counts as Pages. It is what
  `HEROESIM_LIVE_URL` may name.
- The scheduled watch of 2026-10-10 had failed on Pages with 2-minute timeouts. This patch does not
  address them; the run named below met none.

**Consequences.** The live check proves the page's own requests stay at home on both addresses,
and Pages may keep its analytics. Merging `v1.2.1` tags and deploys it, a page no player can tell
from `v1.2.0`'s, and the live check runs again on both addresses. Dependabot's `target-branch` stays
on `v1.2.0-dev` until the owner's word moves it.

**Evidence.** The commit `v1.2.1 (DL-279)`. Its tests are in `web/src/deploy.test.ts`'s "the live
check". `npm run e2e:live -w web` against the deployed `v1.2.0` passed all four projects, where CI's
release run 38109053584 had failed both Pages projects.
Verified 2026-10-11 at `c2c9b07`: the allowance is exact and narrow, but a page on `http:`, a
beacon on another port and the page's host on another scheme or port went untested, so four
mutations survived; tests now refuse each.

*Note, 2026-10-11 (the owner's answer (a)).* Dependabot's two `target-branch`es move to `v1.2.1-dev`
(DL-147 item 6), taking effect when `v1.2.1` is merged.

*Note, 2026-10-11 (the owner's word).* The owner made `v1.2.0`'s GitHub Release a full release, the
latest, in place of the pre-release CI had made when the live check failed. Its first line now says
the check failed on Pages only on the beacon (DL-278); the deploy record beneath it is unchanged.

## DL-280 — v1.2.1 planned: Fatigue and the Captain, Morale's form a line, the hurt relieved, rest bands, the Rivals' heal Items

**Status:** Accepted · **Date:** 2026-10-11 · **Decided by:** the owner, answering Q1–Q16 on
2026-10-11 and setting Fatigue's, Morale's and the hurt's formulas; the code's shape by the agent,
from the architecture review of the same day, marked below

**Context.** `v1.2.0`'s playtest said neither of its sentences (DL-276), and its Targets were left
untuned (DL-277). DL-256 items 13, 19 and 20 put Fatigue, the Captain and the Roster's layers next.
`v1.2.1` had been planned as DL-279's patch alone; the owner chose to make it this epic instead.

**Decision.**

1. **`v1.2.1` is the epic** [Fatigue and the Captain](planning/epics/v1.2.1-release.md), on
   `v1.2.1-dev`, shipping DL-279's patch with it (Q1 a). Rivals who compete become `v1.2.2`.
2. **Fatigue** is a State from 0 to 100, rising each Day away by Tier and falling each night at home
   by quarters grade (Q2 a), read Day by Day on a Quest and projected by the estimate (Q11 a). With f
   the Fatigue and FS `fatigueScaling` (0.4, from 0 to 1, no floor; Q13, Q14 c): Physical and Magical
   Stats × (1 − FS·f/100), Mental and Social × (1 − (FS/2)·f/100); a Hero's Injury chance
   × (1 + FS·f/100) and Death chance × (1 + (FS/2)·f/100) (Q13 a).
3. **Morale's form** is 1 + (m − `moraleBaseline`) ÷ (2 × (`moraleMax` − `moraleMin`)) on every Stat,
   `moraleCheckFactor` removed; `moraleBaseline` 50, the bands' starts 0, 11, 35, 66 and 90,
   `moraleOnRosterDeath` −20; every other Morale bonus unchanged.
4. **The hurt:** `hurtCheckFactor` 0.6, its gap taken whole by Physical Stats and half by the others;
   relieved by half by a Healer in the Party and by half by a heal Item, now spent at the Injury
   (Q15 a). Field surgery's scaling is in the backlog.
5. **Rest bands** for every Guild: a Disposition's `restBand`, the player's `playerRestBand` (Q4 a).
6. **The Captain:** one a Guild, named freely; its effects scaled by Leadership; a change costs the
   outgoing Captain Morale and locks the post (Q3 c); each figure a setting (Q12).
7. **The Rivals buy and carry heal Items** (Q16 b), the consumables part of #25.
8. **The page:** part 11's layers for what exists (Q5 a); the script budget 900 kB (Q6 a).
9. **Tuning:** Fatigue's settings to bands the owner approves; DL-83's Targets reported (Q8 a).
   #51's form-factor item closes at the close (Q9). No riders (Q10 d): #41 returns to `plan.md` §3.
10. **The sentences aimed at:** 1 and 3 (Q7 b).

*Judgement calls, for the owner to see.*
- The architecture review's candidates 1 to 7 shape the stories (the epic's *How it is built*):
  a form module of formed Stats by area, a Quest clock shared by the resolver and the estimate, the
  Party's pool in the Best Party module, consumable choices in the engine, roles marked in content
  (ADR-0006), one band function, and Roster groups that say their kind. Candidate 8, one Encounter
  step for the estimate and the resolver, is not adopted; a parity test stands in.
- Fatigue and the hurt do not move a Hero's Exposure or Guard (`CONTEXT.md` Form).
- A heal Item spent on a Hero who later dies on the Quest is lost.
- A post left empty by a Death, a Retirement or a departure is filled without cost or lock.
- A tired Hero is never an Unavailability: the player may send anyone (DL-256 part 2).

**Consequences.** Sending a Hero costs the next Quest, so a Guild must rotate, and Morale, the Hall's
quarters and the Guildmaster's Inspiration now move Checks by up to a quarter. Every Target moves; the
report shows by how much. The saves of `v1.2.0` do not load (schema 10, then 11).

**Evidence.** The epic `docs/planning/epics/v1.2.1-release.md`, its §6 the answers; `plan.md` §3; the
architecture review of 2026-10-11 (outside the repository).

## DL-281 — v1.2.1-S1 built: the words, Fatigue, Fatigue band and Captain, and the Synergy renamed "Under a strong leader"

**Status:** Accepted · **Date:** 2026-10-11 · **Decided by:** the agent, on the owner's answers in DL-280

**Context.** DL-280 item 6 and Q3 make the Captain a post a Guild names. The content already had a
Synergy "Under a captain", for a Party of three or more with a Hero of Leadership 14 or more, which
would give one word two meanings. The glossary and the requirements had no Fatigue, Fatigue band or
Captain (the epic's S1; principle 13, the words first).

**Decision.**

1. `CONTEXT.md` gains **Fatigue** (a State, 0 to 100, rising each Day away by Tier, falling each night
   at home by the quarters, never an Unavailability), **Fatigue band** (fresh, weary, tired,
   exhausted; the names a rest band and the page read) and **Captain** (one a Guild, named freely by
   its Guildmaster's controller, a change costing Morale and locking the post, a vacancy filled
   free). **State** lists Fatigue. **Form** is rewritten as factors that multiply: Morale's line
   around the baseline, Fatigue's by Stat area, the hurt's gap by area and its relief, the Captain's,
   and Fatigue's raising of the Injury and Death chances, leaving Exposure and Guard alone. The new
   parts say "to be built" until the stories that build them remove it. **Synergy** says the Captain
   is a post, not a Synergy.
2. The Synergy is renamed "Under a strong leader" and its key `under-a-captain` becomes
   `under-a-strong-leader`, in `content/synergies.json`, in place (its order, requirements, bonus and
   kinds unchanged). The content editor has no Synergy kind (its kinds are Traits, config, Quest
   templates and Encounters), so the file was edited by hand and the content version raised by hand
   to 42 with a changelog line in the form `content/version.json` keeps.
3. `requirements.md`: §2 rows for Fatigue and the Captain, "To be built, v1.2.1 (DL-280)"; §3.3 R39
   (Fatigue) and R40 (the Captain), new numbers and no renumbering; R18 lists Fatigue.
4. The epic: S1's boxes ticked, its Status set, the key named.

*Judgement calls, for the owner to see.*
- *The key changed with the name.* The epic and the brief leaned to keeping `under-a-captain`. I
  changed it because identifiers use the glossary exactly (`CONTEXT.md`) and a key reading
  `captain` would be found by every search for the post S7 builds. Nothing but the file reads the
  key (no code, test, doc or save cites it), so the change costs nothing; the key can be put back
  with one edit if the owner prefers it kept.
- *Hand edit of a Synergy.* No editor command covers Synergies, so neither the rule that Traits,
  Quest templates and Encounters change only through the editor nor `quests doctor` applies; the
  doctors were run before and after all the same.
- *"To be built" marks* in the glossary and the requirements follow the glossary's own convention
  for a decision the build does not carry yet. S2 to S7 each remove the marks for what they build.
- *Left as they are:* `docs/quests/drafts/synergies.json` and `notes.json` (v1.1.4-S9's review
  drafts, historic, already unlike the content in layout), the harness reports, the archived entries
  and the epic's §5 fact about v1.2.0, all of which name the old Synergy as it was.
- The **Morale band** entry still says Form reads the bands; S3 rewrites it with the line.

**Consequences.** A Party meeting the Synergy's requirements gets the bonus it did. The play is
unchanged; the content version is 42, so a game created under 41 differs only in that name.
Later stories use the three words by these entries.

**Evidence.** The commit `v1.2.1-S1 (DL-281)`. The epic's S1 boxes. `quests doctor` and
`traits doctor` read the same before and after; the readings and the checks' counts are in the commit
message.
Verified 2026-10-11 at 22b446f: the key's rename is safe (no code, test, fixture or save names it,
only historic reports and drafts) and the changelog check catches a broken raise; fixed in the words,
Form claiming the hurt by Stat area as built and drawing Morale's line around the Guild's baseline
rather than `moraleBaseline`, Fatigue capitalising Unavailability (no glossary term), the Captain
leading "its Parties", and R39 reading the effect by band.

## DL-282 — v1.2.1-S2 built: Fatigue, its bands and the Quest clock

**Status:** Accepted · **Date:** 2026-10-11 · **Decided by:** the agent, on the owner's answers in DL-280

**Context.** DL-280 item 2 makes Fatigue a State that rises each Day away by Tier and falls each night
at home by the quarters, read Day by Day on a Quest (Q11 a). The resolver meets a Party on its return
night, after every night away has run (`pipeline.ts`), so a Hero's stored Fatigue is the Quest's end's
(the architecture review's candidate 2). Three copies of one band loop stood where Fatigue's band and
S6's rest band would add more (candidate 6). Nothing reads Fatigue for play until S4.

**Decision.**

1. **The State.** A Hero's `fatigue`, 0 for a Hero generated. A `fatigue` config section after
   `heroState`: `fatigueMax` 100 (the scale from 0), `fatigueBands` fresh 0, weary 25, tired 50,
   exhausted 75, `fatigueRiseByTier` 4, 5, 6, 7, 8 and `fatigueFallByQuarters` 5, 6, 7, 8, each with
   its rule in `configRules`; the config version 22.
2. **The night.** `heroNight` gains a Fatigue step after Morale's drift (`fatigue.ts`): a Hero away
   rises by the Party's Quest's Tier, one at home falls by their Guild's quarters grade, held inside 0
   to `fatigueMax`, with `hero.fatigue-changed` (heroId, before, after, both bands) only when a band
   is crossed. The return night is a night at home, `questsConclude` having freed the Party first.
   The estimate's homecoming passes the Quest to `heroNight`, so its copies, in no Party, rise.
3. **The Party** records each Hero's Fatigue at dispatch, `fatigueAtDispatch`.
4. **The Quest clock**, `quest-engine/clock.ts`: `questClock(quest, encounters, config)` gives
   `days`, `encounterDay(i)` and `fatigueAt(i, atDispatch)`. Day k of a Quest comes after k − 1 of
   its nights away. The first Encounter falls on Day 1, the last on the last Day, the i-th of n on
   Day 1 + round(i(D − 1) ÷ (n − 1)), half up; a lone Encounter on the last Day. The Fatigue on Day k
   is the Fatigue at dispatch plus the Tier's rise × (k − 1), held at `fatigueMax`. Nothing reads it
   yet; S4's form module will, in the resolver and the estimate alike.
   *Changed 2026-10-11 by the owner: the last Encounter falls on Day L = ceil(2D ÷ 3), worked out in
   whole numbers as (2D + 2) div 3, a lone one there too, and the i-th of n on Day
   1 + round(i(L − 1) ÷ (n − 1)); the Days after L are the Heroes' trip home, Fatigue rising on them
   as on any night away. The clock gives `lastEncounterDay`. This replaces the judgement call below
   that put the last Encounter on the last Day; the 2/3 is the clock's, no setting.*
5. **Bands**, `bands.ts`: `bandOf(names, starts, value)` and `atOrPast(names, band, threshold)`.
   `moraleBand`, `regardBand`, `chanceBand`, `potentialHint` and the new `fatigueBand` are adapters
   over it; their loops are gone.
6. **The save:** `schemaVersion` 10, no migration. The validator holds a Hero's `fatigue` a number
   and a Party's `fatigueAtDispatch` a map of numbers naming exactly its Heroes
   (`party-member-mismatch`).
7. **The words:** the event narrated as Morale's is ("…'s Fatigue went from a to b, tired."), routine
   ("Fatigue"), left out of the player's Guild's History as Morale is, in no World History, never a
   Milestone. `CONTEXT.md`, `requirements.md`, `data-model.md`, `approach.md` and `config.md` say
   what is built; the effect on Form and the rest band stay "to be built".

*Judgement calls, for the owner to see.*
- *The scale* is `fatigueMax` alone, from a fixed 0: a Hero generated is rested, and a floor above 0
  would mean nothing.
- *The lists* are not tied to the ladder's length or the content's grades: one past the end reads the
  last, as `infirmaryHealFactor` does, so a sixth Tier needs no second edit.
- *The Encounter's Day.* The last on the last Day, so a Finale meets the Party at its most tired;
  the first on Day 1, at the Fatigue the Hero set out with. A Party sent before the night is away D nights, one more
  than the last Encounter's Day reads: the walk home, which the stored Fatigue carries.
- *A fourth loop.* `potentialHint` had the same loop; it is read through `bandOf` too.
- *The event* names no Quest and has no cause: only a night moves Fatigue.
- *Not exported* from the engine's entry yet: `fatigueBand` and the clock wait for S4 and S9.

**Consequences.** Play is unchanged: no rule reads Fatigue. Every History gains Fatigue's band
crossings, and every save the two fields; saves of schema 9 do not load. S4 reads the clock, S6
`atOrPast`.

**Evidence.** The commit `v1.2.1-S2 (DL-282)`; the epic's S2 boxes. The 120-Day History fingerprints
of `quests-conclude.test.ts` hold with Fatigue's events set aside. A quick run before the change and
one after, `compare` moving none of their play counters, and the doctors' readings are in the commit
message; the reports are not committed.
Verified 2026-10-11 at e22e4f1: the clock's Days hold against play (a Party sent before the night
is away its Days in nights, its last Encounter one rise short of the stored Fatigue, the walk home;
one sent at night a night fewer, the two equal; the return night rests), the band readers are the
old loops exactly, and the save grows by the band crossings alone (+26 KB gzipped a game in two
years, 2%; some 0.3 MiB on the Gate's 16.31 MiB mean at twenty years, under 30); of 30 mutations
one survives, the estimate's copies marked away, unseen until S4 reads Fatigue (which must take
the set-out Fatigue from the Heroes proposed, not the brought-home copies, cached by return night
whatever the Tier); tests added for a Quest played against the clock, a Hero generated rested and
a Quest of no Days.

## DL-283 — v1.2.1-S3 built: Morale's form made continuous, a line through the baseline

**Status:** Accepted · **Date:** 2026-10-11 · **Decided by:** the agent, on the owner's answers in DL-280

**Context.** DL-280 item 3 makes Morale's part of a Hero's form a line, 1 + (m − `moraleBaseline`) ÷
(2 × (`moraleMax` − `moraleMin`)), in place of the band factors `moraleCheckFactor` (DL-148 item 9,
DL-154, DL-168 item 9), with the owner's Morale values: `moraleBaseline` 50, the bands' starts 0, 11,
35, 66 and 90, `moraleOnRosterDeath` −20. Form stays one number a Hero carries until S4's module.

**Decision.**

1. **The line.** `moraleFactor(morale, config)` in `quest-engine/form.ts`: 1 at `moraleBaseline`, a
   quarter more half the scale above it and a quarter less half the scale below, the same for every
   Guild. `formOf` is it, times `hurtCheckFactor` once hurt; `queryParty`, so the resolver, the
   estimate and the Party builder, reads it there and nowhere else. The Morale bands' rule keeps the
   scale it divides by wider than 0.
   *Superseded in part by DL-284 items 1 and 2, 2026-10-11: `formOf`, Morale's factor times `hurtCheckFactor` once hurt; now `formedStats`, Morale's factor on every Stat times Fatigue's and the hurt's by area. The record: [superseded/DL-283.md](decisions/archive/superseded/DL-283.md).*
2. **`moraleCheckFactor` removed** from `GameConfig`, `config.json`, `configRules` and the tests, by
   hand as `config.md` says for a setting removed; the config version 23 with its changelog line.
3. **The Party builder's line** keeps its meaning: "lowers a little" down to the line's value at the
   low band's start (`formEffect`), below it "badly"; above 1 it raises, at 1 none. The thresholds live
   in `formEffect` alone; the page's and the CLI's maps only word its four effects, unchanged.
4. **The owner's values are pending.** `config set` took `moraleBaseline` 50, the bands' starts 0,
   11, 35, 66 and 90 and `moraleOnRosterDeath` −20, and `config finish` ran the tests: 15 failed in
   9 files, each pinning or resting on the old values, so the file was put back and the edits
   discarded. The defaults stay 60, 0/20/40/75/90 and −10 until the owner rules on those tests
   (delivery.md rule 4); then the three `config set`s and `finish` raise the config to 24.
   *Applied 2026-10-11 on the owner's answer to Q18 (fix each test by its kind): the three values through
   `config set` and `config finish`, the config version 26. The scenes worked out at the baseline 60 pin
   `moraleBaseline: 60` (the resolver's `pinned`, so its hurt, formDecided and 300-seed tests, and the
   20-day drift test beside its bands), their Morale lines worked out from that pin; the Party builder's
   "Makes no difference" rows (CLI, selectors) take the config's baseline; the Roster's "wretched"
   Morale is the low band's start less one; the Death's cost and the band after it, in the return and
   report tests, are worked out from the document's `moraleOnRosterDeath` and bands; the estimate's
   Morale test asserts over the baseline, the low band's start and 10. The 120-Day History's three
   fingerprints are re-recorded, the old in its comment. Of the 15, none fails after these changes.*
5. **The words.** `CONTEXT.md`'s Morale band and Form say what is built; `config.ts`, `resolve.ts`
   and the estimate probe's comments read the line.
6. **Superseded in part:** DL-148 item 9 and DL-154 item 1 (each Hero's band's factor) and DL-168
   item 9 (`moraleCheckFactor`'s provisional values), with their notes and records.

*Judgement calls, for the owner to see.*
- *Tests that pinned `moraleCheckFactor` or the band rule* are rewritten through `moraleFactor` over
  the deps' config or set at the baseline (form, query, resolve, preview, check, estimate, the
  harness's Morale-in test, the page's and the CLI's Morale lines), so they change with a default
  rather than pin it (DL-231 Q10 b). The 120-Day History fingerprints and the resolver's 300 seeds
  cannot be made form-neutral by any setting now: re-recorded, the old values in their comments.
  Tests the line did not fail were left as they were, so the owner's values meet them as they stand;
  the harness's Morale-in test, rewritten here, is among the 15 (its 500 rolls cross no threshold at
  the baseline 50), reported, not rewritten again.
- *"Raises" and "none".* Any mean above 1 raises the odds, however slightly; only a Party at the
  baseline makes none. Under the bands most Heroes were steady at 1; under the line almost none are.
- *The estimate probe* still counts the Heroes whose Morale band moved on the way home; every Morale
  change now moves form. Left to S4, which measures the probe.

**Consequences.** Morale's form spans 0.7 to 1.2 at the baseline 60, 0.75 to 1.25 at the owner's 50,
against 0.93 to 1.06, and every Morale change moves it. Heroes above the baseline gain: the Rivals,
who build quarters, most. In a quick run (4 × 2 years) the Rivals' strong successes rise from 55.5%
to 62.9% of their Quests and their failures fall from 8.2% to 5.8%; the player's strong successes
from 76.9% to 78.9%. A trial of the owner's values on the same seeds (`HEROESIM_CONFIG`) gives 62.5%
and 5.7%, and the player's 77.6%. Every save's `meta.config` loses one setting.

**Evidence.** The commit `v1.2.1-S3 (DL-283)`; the epic's S3 boxes. The quick runs before and after
and `compare`, the doctors' readings and the checks' counts are in the commit message; the reports
are not committed.
Verified 2026-10-11 at 92fa6b7: the line is the epic's formula in every path (`formOf` through
`queryParty` for the resolver, both estimates and the Party builder; the CLI and the page only word
`formEffect`), nothing live reads `moraleCheckFactor` or a band's factor, the rewritten tests follow
the rule change without weakening, and all 21 mutations of the line, the hurt, `formEffect`'s
thresholds and the bands' guard go red; DL-154 items 5 and 7 (the factors' rule, the builder's
thresholds) gained their supersession notes and records, and a stale test comment and two lines'
wrapping were fixed.

## DL-284 — v1.2.1-S4 built: the form module, formed Stats by area, and Fatigue on Checks and harm

**Status:** Accepted · **Date:** 2026-10-11 · **Decided by:** the agent, on the owner's answers in DL-280

**Context.** DL-280 items 2 and 4 make Fatigue and the hurt act by Stat area, with no floor (Q13,
Q14 c, Q15), and Fatigue raise a Hero's Injury and Death chances (Q13 a). Form was one number a Hero
carried into a Check (DL-283); the architecture review's candidate 1 puts each member's formed Stats
in one module, read where `queryParty` builds the member, from the Quest clock's Fatigue (DL-282).

**Decision.**

1. **The form module**, `quest-engine/form.ts`: `formedStats(stats, { morale, fatigue, hurt }, deps)`
   is each Stat times Morale's factor, Fatigue's by its area (1 − FS·f ÷ `fatigueMax` on the Physical
   and Magical, half that on the Mental and Social) and the hurt's by its area (`hurtCheckFactor` on
   the Physical, 1 − (1 − it) ÷ 2 on the rest), multiplied; the area is content's. `fatigueHarm(f)`
   gives the Injury's 1 + FS·f ÷ `fatigueMax` and the Death's 1 + (FS ÷ 2)·f ÷ `fatigueMax`.
2. **The member.** `queryParty` gives each `formed` beside `stats`, and `fatigue`, the Day's from
   `OnQuest.fatigueByHero`, else the stored. `statOf` reads `formed` with form; the scalar `form`,
   `formOf` and the operators' multiplication are gone. `atFatigue` reads a member at another Day's.
3. **The resolver** gives each Encounter its Day's Fatigue from the clock and `fatigueAtDispatch`.
   `strike` takes the chosen Hero's chance: an Injury's times Fatigue's, held at 1; a Death's times
   the Death scale and Fatigue's, held at 1 once, both before the guard. `formDecided` compares the
   formed roll with the raw Stats' roll.
4. **The estimate** takes one Party a distinct Day, each Hero at the clock's Fatigue from the
   proposed Heroes' own (not the brought-home copies'); members kept by return night, Hero and
   Fatigue; a Day's Party meets its `base`'s Synergies, which read no formed Stat.
5. **Config:** `fatigueScaling` 0.4, a share (`checkConfig`), by hand; the config version 24. Then
   `hurtCheckFactor` 0.6, the owner's, through `config set` and `config finish`, every test passing
   at it; the config version 25.
6. **The guards** (`check.test.ts`): `query.ts` imports as values `effectiveStats`, `ageOf`,
   `formedStats` and `workingMorale`; `form.ts` imports only types, the config's, content's and the
   document's.
7. **The estimate probe** counts the Heroes whose Morale moved (`moraleMoved`), any Morale moving
   form; each Hero sets out at a Fatigue drawn from a stream of its own, the rest of a sample as it was.
8. **Superseded in part:** DL-148 item 10 and DL-154 items 1 and 2 (the hurt one factor; form one
   number), DL-168 item 9 (`hurtCheckFactor` 0.93, provisional) and DL-283 item 1 (`formOf`), with
   their notes and records.

*Judgement calls, for the owner to see.*
- *The scale.* f is read over `fatigueMax`, the owner's f ÷ 100 at the default scale of 100.
- *An Injury's chance* is held at 1 too, before the guard, as a Death's is.
- *The Party builder's line* reads each Hero's form as one figure, `formFigure`: Morale's factor
  times the mean over content's Hero Stats of Fatigue's and the hurt's, so a tired Party's line
  lowers; rested and unhurt, Morale's factor exactly, as before.
- *A Stat content does not define* takes Morale's factor alone.
- *Tests not about Fatigue* set `fatigueScaling` 0 through their config (the resolver's and the
  consumables' scenes, the estimate's reroll and drift tests, the Best Party margin test), so they
  hold what they held; the 120-Day History fingerprints are re-recorded, the old in their comment.
- *The Synergies of a Day's Party* are its base's, worked out once.

**Consequences.** A Hero brings less to each Encounter as a Quest's Days pass, and is hurt and
killed more often. Before S11 tunes Fatigue, play moves a long way: in a quick run (4 × 2 years)
against 4040242's, the player's failed Quests rise from 1.7% to 9.2% and strong successes fall from
78.9% to 55.5%; the Rivals' from 5.8% to 26.2% and from 62.9% to 26.0%, their Injuries fivefold,
and, poorer, they recruit no one. A Turn's mean `advance` 1.63 to 1.67 ms. Every save records the
config version 25 and `fatigueScaling`.

**Evidence.** The commit `v1.2.1-S4 (DL-284)`; the epic's S4 boxes. The checks' counts, the
doctors' readings, the quick runs and `compare`, the estimate probe's two lines and the mutations
are in the commit message; the reports are not committed.
Verified 2026-10-11 at 30eba5a (a496124 and the Q18 commit after it): the formed Stats and the harm
multipliers are the epic's §2 table in every path, each chance held at 1 once after Fatigue's factor
and before the guard, the hurt's factor applied once, the resolver reads the clock
and never the stored Fatigue, the estimate's member cache (return night, Hero, Fatigue) is complete and
its parity test genuine, the builder's two caching survivors are speed alone, and the quick run's moves
come from untuned Fatigue with no rest band yet (both sides' Heroes set out at a mean Fatigue of 82 to
88, over 80% exhausted, Fatigue falling at home for every Guild and never rising), not a bug; of 49 mutations five
survived, and tests were added for them: an Injury's chance held at 1 before the guard, the Party
builder's line reading Fatigue, `formDecided`'s raw roll carrying the bonus, and the probe's drawn
Fatigue.

## DL-285 — v1.2.1-S5 built: relief from the hurt, a Healer marked in content and a heal Item spent at the Injury

**Status:** Accepted · **Date:** 2026-10-11 · **Decided by:** the agent, on the owner's answers in DL-280

**Context.** DL-280 item 4 (Q15 a) relieves the hurt's gap, 1 − `hurtCheckFactor` (DL-284), by a
Healer in the Party and by a heal Item, now spent at the Injury, the two multiplying. The engine names
no Class (ADR-0006), so the Healer is a mark in content (the architecture review's candidate 5).
Heal Items were spent after the sequence, longest Injury first (DL-50 item 6).

**Decision.**

1. **The relief** (form.ts): `hurtFactor(area, { hurt, relief })` takes the gap × (1 − relief), the
   Physical Stats the whole of what is left and the others half; `hurtRelief({ healer, item })` is
   1 − (1 − `healerHurtRelief`) × (1 − `healItemHurtRelief`). `queryParty` gives each member
   `relief`, 0 unhurt; `atFatigue` keeps it.
2. **The Healer:** a Class's `relievesHurt`, true or false on its own row (`classes.json`), read by
   `relievesHurt(classKey, content)`. A member of a marked Class among the members on the Encounter,
   other than the hurt Hero, relieves; several give one relief. The content's checks refuse a mark not
   true or false and a misspelt one (a field no Class has). The Healer is marked by hand (the editor
   has no Class kind); the content version 43. A test holds the engine's source to no Class key.
3. **A heal Item at the Injury:** the kit reaches the Injury's step (`Applying.kit`); as an Injury
   lands, the infirmary applied, `kit.heal(injury, index)` spends the heal definition healing most
   Days (ties by key), one an Injury while any is left, shortening it to no fewer than 1 Day, which
   the return applies, and the Hero joins `OnQuest.relieved` for the rest of the Quest. Spent on a
   Hero who then dies, it is lost. `item.expended` for a heal names its Encounter, `encounterIndex`.
4. **Config:** `healerHurtRelief` and `healItemHurtRelief`, 0.5 each, shares (`checkConfig`), in the
   `quest` section by hand; the config version 27.
5. **The estimate** is unchanged: it assumes no one is hurt, so relief moves nothing there.
6. **The words:** the History says where a heal Item was spent and that it eased the Injury; the heal's
   effect words say so; `CONTEXT.md` (Form, Class) and R30 say what is built.
7. **The script budget** 900 kB (DL-280 item 8, Q6 a), S9's first item brought forward: this story's
   build came to 850,413 bytes, over 850 kB (the epic's §4: the budget rises first).
8. **Superseded:** DL-50 item 6 in full, items 3 and 8 in part, with the stub, notes and record.

*Judgement calls, for the owner to see.*
- *The mark* is a boolean on the Class's row, as the review drew it, not a list of roles (the glossary
  avoids Role for a Class). It can name no Class but its own, so the acceptance's "a role on an
  unknown Class" cannot arise; the checks refuse a malformed or misspelt mark instead.
- *The Healer must be present:* among the members on that Encounter, so a Healer who died relieves
  nothing after. A hurt Healer relieves others, never themself. Several Healers do not stack.
- *An Injury at 1 Day* still takes a heal Item, for its relief, taking 0 Days off (the epic: spent at
  the moment of an Injury); before, it took none.
- *The test content* marks no Class, so the scenes with a Healer keep their numbers; the relief
  tests mark the Class they read, a Warrior among them.
- *The budget* was raised here rather than bytes cut; S9 keeps the rest of its items.

**Consequences.** A hurt Hero with a Healer beside them, or a heal Item spent, keeps 0.8 of a
Physical Stat rather than 0.6, both 0.9. The Rivals carry no heal Item until S8. In a quick run
(4 × 2 years) against aaed35a's, play moves by the noise of changed draws: the player's strong
successes 55.5% to 54.3%, failed Quests 9.2% to 9.5%; the Rivals' strong successes 26.0% to 26.9%.
Every save records the config version 27 and the content version 43.

**Evidence.** The commit `v1.2.1-S5 (DL-285)`; the epic's S5 boxes. The checks' counts, the
doctors' readings and the quick run's `compare` against `v1.2.1-s4-verify-quick` are in the commit
message; the report `v1.2.1-s5-quick` is not committed.
Verified 2026-10-11 at 7f061c0: the relief is the gap times (1 − relief) in `hurtFactor` alone, read once
through `queryParty` (the resolver; the Party builder sees no one hurt; the estimate none), a Healer
present on the Encounter and not the hurt Hero, one relief however many, a heal Item spent at the Injury
after the infirmary, never twice, its Days kept to the return and lost with a Hero who dies; of 38
mutations four survived, one equivalent (`relievesHurt`'s own-key guard), and tests were added for
the rest: a Class marked false relieving nothing, two heals of the same Days spent first by key, and
a Healer who falls relieving no one after; the DL-50 record's quotes made DL-285 item 3's own words.

## DL-286 — v1.2.1-S6 built: rest bands and the Party's pool

**Status:** Accepted · **Date:** 2026-10-11 · **Decided by:** the agent, on the owner's answers in DL-280

**Context.** DL-280 item 5 (Q4 a) gives every Guild a rest band: a Disposition's `restBand` and the
player's `playerRestBand`. Each chooser of a Party built its own pool from `availableHeroes`, which
reads no config, so a band applied in the Best Party alone would let a Rival pick a Quest it then
sends no one on (the architecture review's candidate 3).

**Decision.**

1. **The settings.** A Disposition's `restBand`, content: steady and miserly `tired`, ambitious
   `exhausted`, reckless `null`, none; the content version 44. The config's `playerRestBand`, `tired`,
   in the `fatigue` section, by hand, its rule a Fatigue band or `null`; the config version 28. None is
   `null` in both, read by the content's `oneOfOrNull` field and refused otherwise by its rules.
2. **One per-Guild reader.** `partyMarginOf` becomes `guildSetting(guild, setting, deps)` in
   `best-party.ts`: the Disposition's field, else the player's (`playerPartyMargin`,
   `playerRestBand`) for a Guild with none or one content does not define.
3. **`partyPool(world, guild, deps)`** in the Best Party module: `availableHeroes` (moved there) less
   each Hero whose `fatigueBand` is `atOrPast` the Guild's rest band; all of them for `null`. It reads
   the Hero's Fatigue as it stands at the choice, which is the Fatigue they set out with: a dispatch
   records it before the night.
4. **Every chooser reads it:** a Rival's choice of Quest and its Party (`preferredQuest`),
   `staffableQuests`, the harness's policy and the Board's best Party (`playerReading`). No caller
   builds its own pool; `availableHeroes` leaves the engine's entry for `@heroesim/engine/testing`.
5. **Fatigue is no Unavailability:** `dispatch` sends any free Hero, a tired one by hand included.
6. **The fixture** `disposition(key, weights)` takes its weights named; the engine's test content
   gives its four rows the core's rest bands.
7. **The words:** `CONTEXT.md` (Fatigue, Fatigue band, Disposition, Fast-forward stop) and
   `requirements.md` (R7, R39, the scope row) say what is built.

*Judgement calls, for the owner to see.*
- *None is `null`*, not a fifth word: no band to be at or past, and `config set playerRestBand null`
  writes it.
- *The stops follow the pool.* `staffableQuests` is the player's `decision-needed` and
  `quest-staffable` stops' too, so a fast forward no longer stops for a Quest only a tired Hero could
  staff, and stops when a Hero rests out of the band and makes one staffable.
  *Confirmed 2026-10-11 by the owner (Q19 a): kept as built.*
- *Stored Fatigue at the choice*, not projected: the two are equal, a Party setting out before the
  night's rise.
- *The Board's sentence* for no Party still says "free Heroes"; S9 words the pool.
- *A rest band of `fresh`* is allowed and keeps every Hero home.

**Consequences.** In a quick run (4 × 2 years) against `v1.2.1-s5-quick`, the player's Heroes set out
at a mean Fatigue of 43 (87 before) and none tired or worse (93% before); the Rivals' at 56 (82), 45%
tired or worse (90%), ambitious and reckless sending theirs. Fewer Quests are taken (the player's
2,246 to 1,706, the Rivals' 4,450 to 3,751) and fewer fail: the player's 9.5% to 5.3%, strong
successes 54.3% to 65.5%; the Rivals' 26.4% to 24.5% and 26.9% to 31.7%. Poorer for it, the Rivals
still recruit no one and two fold to Bankruptcy (none before). Every save records the config version
28 and the content version 44.

**Evidence.** The commit `v1.2.1-S6 (DL-286)`; the epic's S6 boxes. The checks' counts, the
doctors' readings and the quick run's fingerprint are in the commit message; the report
`v1.2.1-s6-quick` is not committed.
Verified 2026-10-11 at c67173d: no production chooser builds its own pool, a tired Hero is refused by
no dispatch path, each band edge and `null` keep home whom they should, the re-recorded fingerprints
return exactly with the rest-band filter off, and the stops follow the pool as the epic's candidate 3
names `staffableQuests`; of 21 mutations none survived the suite, and the staffing stops gained tests
of their own for the rest band; stale "free Heroes" comments made the pool's, and S9 given the words a
player reads.

## DL-287 — v1.2.1-S7 built: the Captain

**Status:** Accepted · **Date:** 2026-10-11 · **Decided by:** the agent, on the owner's answers in DL-280

**Context.** DL-280 item 6 (Q3 c, Q12 a) gives each Guild one Captain, named freely, a change costing
the outgoing Captain Morale and locking the post, a vacancy filled free, and three effects scaled by
Leadership. The engine names no Stat (ADR-0006), so the captaincy Stat is a mark in content (the
architecture review's candidate 5); the Captain's factor joins the form module (candidate 1, DL-284).

**Decision.**

1. **The post:** a Guild's `captainId` and `captainChangedOnTurn`, schema 11, no migration; the
   validator's `captain-off-roster` holds the Captain to the Roster. `leaveRoster` (captain.ts) is the
   one way a Hero leaves a Roster, emptying the post, for a Death, a Retirement and a Transfer; a fold
   empties it too.
2. **The action `nameCaptain`:** any Hero of the Roster, at home or away; to an empty post free; in
   another's place the outgoing Captain loses `captainChangeMoraleCost` (`captain-changed`) and the
   post is locked to the morning of Day d + `captainChangeLockDays` (`captainLock`, the Transfer lock's
   pattern). Refusals: `guild-folded`, `hero-not-on-roster`, `already-captain`, `captain-locked`.
   `guild.captain-named`, a Milestone, names the Captain replaced and the lock.
3. **s**, the Captain's effective captaincy Stat from its least, 0, to its most, 1 (`captaincyScale`).
   The Stat is the one content marks `captaincy`, Leadership (content 45); content's check refuses
   none, two, a Guildmaster's, or a malformed or misspelt mark.
4. **The effects**, each times s: every formed Stat of every member on an Encounter with the Captain
   among them × 1 + s·(`captainFormFactor` − 1), in `queryParty` (`partyCaptaincy`, `reformed`); the
   others of the Party coming home with the Captain alive + round(s·`captainHomecomingMorale`)
   (`captain-homecoming`, a Quest's cause); the Roster's baseline + s·`captainHomeBaselineBonus` while
   the Captain is in no Party (`moraleBaselineFor`, its lift kept once a night a Guild).
5. **The estimate** takes the proposed Party's own factor, not its pool's, and its homecoming leaves
   the baseline unlifted for a Guild whose Captain the Party takes away, as the nights away do.
6. **Choosers:** a Rival names to an empty post its Hero highest in the captaincy Stat, ties to Roster
   order, first of its choices, drawing nothing (`captainChoice`); the harness's policy names by the
   same rule.
7. **Config** 29, a `captain` section by hand: `captainFormFactor` 1.05 (at least 1),
   `captainHomecomingMorale` 5, `captainHomeBaselineBonus` 5 (each at least 0),
   `captainChangeMoraleCost` −10 (at most 0), `captainChangeLockDays` 30 (whole, at least 0).
8. **The words:** the History's sentence, the refusals', the CLI's `captain --hero <heroId>`;
   `CONTEXT.md` (Captain, Form), R40 and the data model say what is built.

*Judgement calls, for the owner to see.*
- *No clearing:* the post empties only by a Death, a Retirement, a Transfer or a fold. The Captain
  named again is refused, not charged. A vacancy is filled whatever the lock.
- *The baseline is scaled* by s, as S7's "each scaled" and R40 say; §2's row reads unscaled.
  *Confirmed 2026-10-12 by the owner (Q20 a): scaled, as built.*
- *The homecoming:* the others, not the Captain; none if the Captain fell; on any outcome; rounded
  to a whole number, as a Quest's Morale is.
- *The factor* needs the Captain on that Encounter, so a fallen Captain lifts no one after; it is on
  every Stat, a Stat content does not define too.
- *s reads effective Stats*, Traits and Gear counting.
- *A Rival never changes its Captain*, and names none where content marks no captaincy Stat; the
  test content marks none, so scenes keep their numbers and the Captain's tests mark Leadership.
- *The kind* is `nameCaptain`, camelCase as every action's; the CLI's command is `captain`.
- *The homecoming Morale is not estimated*: it lands after the Quest is resolved.

**Consequences.** Every Guild in a harness game has a Captain from its first afternoon. In a quick
run (4 × 2 years) against `v1.2.1-s6-quick`: the player's failed Quests 5.3% to 3.4%, strong
successes 65.5% to 65.1%; the Rivals' 24.5% to 22.6% and 31.7% to 32.5%, their Quests 3,751 to
3,821, one Bankruptcy fold where there were two. A Turn's mean `advance` 1.54 to 1.80 ms, part the
play's, part the Captain's lift reading the Captain's effective Stats. Every save records the
config version 29, the content version 45 and schema 11.

**Evidence.** The commit `v1.2.1-S7 (DL-287)`; the epic's S7 boxes. The checks' counts, the
doctors' readings and the quick run's fingerprint are in the commit message; the report
`v1.2.1-s7-quick` is not committed.
Verified 2026-10-12 at 830afea: every way off a Roster empties the post, the lock meets the
Transfer lock's arithmetic, the factor applies once and only with the Captain present, and the
quick run's fingerprint holds with both caches off; of 43 mutations nine survived, one equivalent,
three now killed by new tests (a fold, a Stat whose least is its most, the choice by effective
Stats) and five on the night's lift, which reached a stale case: a Captain healed of an Injury
whose Trait moves their captaincy Stat drifted by the lift from before; fixed test first (the lift
forgotten as the Captain's night begins), the estimate made to hold the lift as the Party sets out,
the same whatever its pool, and a Rival's Captain bought away shown replaced.

## DL-288 — v1.2.1-S8 built: the Rivals' heal Items, and the consumable choices in the engine

**Status:** Accepted · **Date:** 2026-10-12 · **Decided by:** the agent, on the owner's answers in DL-280

**Context.** DL-280 item 7 (Q16 b) has the Rivals buy and carry heal Items, the consumables part of
#25. What to buy and carry was the harness's policy's alone (`consumablesFor`, `consumablePurchase`,
DL-62); a Rival bought wearables and carried nothing, so the heal Item spent at the Injury (DL-285)
reached the player's Parties only. The architecture review's candidate 4 lifts both into the engine.

**Decision.**

1. **The choices in the engine,** `consumable-choices.ts` beside `gear.ts`, each reading and drawing
   nothing: `consumablesToCarry(world, guild, effects, deps)` gives each Party sent one of each
   consumable of `effects` the Guild holds that could serve its Quest, in key order, taking it from
   what is left; `consumablePurchase(world, guild, keeping, deps)` buys toward `stock` of each,
   counting the holding and the Guild's Parties, the one it has fewest of, the lowest key among
   equals, as many as it lacks and the Market has, while Wealth is above `wealthMultiple` times the
   cost and covers it, and above `reserveUpkeeps` Upkeeps once paid where one is given.
2. **The policy unchanged:** the harness's two functions are gone; the policy passes every effect and
   its own `consumableStock`, `buyWealthMultiple` and `consumableReserveUpkeeps`. The move alone, the
   Rivals as they were, played `v1.2.1-s7-verify-quick`'s fingerprint `89c4c91f…` exactly.
3. **A Rival buys heal Items in its gear step,** when `gearPurchase` names no wearable:
   `consumablePurchase` for `heal` alone, by its Disposition's `gearThreshold` as gear is bought (Wealth
   above that many times the cost, and covering it), no reserve. No new `purchaseSteps` member.
4. **How many:** `rivalHealItemStock`, 2 of each heal definition, at home and carried together (the
   policy's stock), a setting by hand in the `world` section beside the Rivals' others, whole and at
   least 0, 0 keeping none; the config version 30.
5. **A Rival carries** one of each heal Item it holds on its dispatch, its Best Party chosen carrying
   nothing as the policy's is; the kit spends them at its Heroes' Injuries (DL-285).
6. **Draws:** neither choice draws from any stream. The Rival's own, `rivals` (ADR-0009), moves only
   because an afternoon that buys heal Items does not reach the `transfer` step and its draw.
7. **The words:** R7.

*Judgement calls, for the owner to see.*
- *One setting, not a Disposition field:* every Rival keeps the policy's 2; a Disposition's character
  is in its `gearThreshold`, which prices them as it prices gear.
- *It follows a wearable,* not competing with one: armour first keeps Heroes alive (DL-58), and the gear
  step stays one purchase. A Rival makes one purchase an afternoon (`rivalChoices`), so an afternoon
  that buys heal Items tries no Transfer, recruit or debt Transfer after it (`purchaseSteps`' order);
  it comes again only as Items are spent.
- *No reserve:* a Rival's heal budget is gear's, as the story says, not the policy's 20 Upkeeps.
- *Heal Items alone,* bought and carried: a bonus or a reroll a Rival holds from Loot stays home.
- *Beside `gear.ts`, not in it:* a consumable is no Gear (`CONTEXT.md`), and `gear.ts` reading
  `upkeep` would close an import cycle through `selectors.ts`.

**Consequences.** In a quick run (4 × 2 years) against `v1.2.1-s7-verify-quick`: the Rivals carry
1.41 consumables a Quest (none before) and spend 103 heal Items (93 kits, 10 draughts); their Market
purchases 309 to 462 and the Items' cost 17,860 to 28,415, about 330 a Guild-year of the 16,400 they
spend; their Heroes injured 188 to 150, failed Quests 22.6% to 22.0%; their Wealth a Guild at the
second year's start 6,343 to 6,940; still no recruit, since their Wealth stays far below
`recruitThreshold` times their Upkeep, heal Items or none (the S6 finding, untuned Fatigue's). One
Bankruptcy fold, as before. The player's counters move through the Board and the Market they share.
The History fingerprints in `quests-conclude.test.ts` are re-recorded; `rivalHealItemStock` 0 gives
the old ones. Every save records the config version 30.

**Evidence.** The commit `v1.2.1-S8 (DL-288)`; the epic's S8 boxes. The checks' counts, the doctors'
readings, the quick runs' fingerprints and the twenty-year boxes' result are in the commit message;
the reports `v1.2.1-s8-move-quick` and `v1.2.1-s8-quick` are not committed.
Verified 2026-10-12 at 5f54090: the move maps every branch of the policy's old functions (its every
effect, Parties counted, its reserve, the added "covers it" implied by the reserve), a Rival prices
heal Items by `gearThreshold` as gear and carries one of each from home, unspent Items come home even
from a Party none of whose Heroes return, and a heal purchase pre-empted no transfer, recruit or debt
step in 63,200 Rival afternoons of four 20-year games (691 purchases); of 37 mutations three fell to
a History fingerprint alone, now killed by tests: another Guild's Party counted, a wiped Party's
Items kept or lost.

## DL-289 — v1.2.1-S9 built: the page, the CLI and the words

**Status:** Accepted · **Date:** 2026-10-12 · **Decided by:** the agent, on the owner's answers in DL-280

**Context.** DL-280 item 8 (Q5 a) gives the page part 11's layers for what exists, and S1 to S8 built
Fatigue, the Captain, relief and rest bands in the engine with the CLI's `captain` alone. The page showed
none of them; the form line's words were copied in the page and the CLI, the page read Morale's band again
from the engine, the phone's "Sort by" took every group after the first for a Stat area (the architecture
review's candidate 7), and "free Heroes" was untrue where a rest band keeps tired ones home (DL-286).

**Decision.**

1. **One reading of State.** A `HeroRow` of `@heroesim/words` carries `moraleBand`, `fatigue`,
   `fatigueBand` and `captain`, so a Roster's row, the pool's and a Hero's reading all say them; the page's
   `rosterRows` takes the bands from it and the web's second `moraleBand` call is gone. `moraleBandNames`
   and `fatigueBandNames` are the words' lists. The engine's entry exports `fatigueBand`, `captainLock`
   and `relievesHurt`.
2. **Roster groups say their kind:** `hero`, `state` or `stat-area`. State holds Morale and Fatigue, the
   phone's sixth tab and a Columns group; "Sort by" offers the `stat-area` groups by kind. Sorts: `fatigue`,
   most tired first. Filters: Morale's bands and Fatigue's, each group's name shown.
3. **The Captain's mark** (an icon of a shield) stands before the Class's in `HeroName` on the tile, in the
   Table's Name cell on every tab, and in the builder; its post is read after the name (", Captain").
   A Fatigue chip (tone: plain to weary, warn tired, bad exhausted) stands beside Morale's, with the Table's
   Fatigue column.
4. **The Hero's page:** Fatigue and Captain chips, and a "Captain" part for a Hero of the player's Roster:
   who holds the post, or what naming them does (`namingWords`: free to an empty post, else the outgoing
   Captain's Morale and the lock), "Name Captain" playing `nameCaptain`, disabled while the lock holds with
   the refusal's own sentence (`captain-locked`) said under it.
5. **The Party builder:** each row's Fatigue band, never the figure; the Captain marked; for the Party
   chosen, "Relief from the hurt": the Healer's Classes in the Party and the heal Items carried, or none
   (`reliefWords`, words).
6. **The form line's words** `formEffectWords` live in `words/src/party.ts`, read by the page and the
   CLI; both copies are gone (`imports.test.ts` holds it).
7. **The CLI:** Fatigue beside Morale in every Hero table and `show hero` (with the bands), a Captain
   column in `show roster`, `Captain` in `show hero`, and `preview`'s Fatigue and Relief sections.
8. **The pool's words:** `noBestPartyWords`, "No Party of your rested Heroes meets its requirements.",
   one for the Board and `show board`; the CLI's help, and the page's fast forward "until a Quest your
   rested Heroes can staff appears" with its note and help, say rested; `CONTEXT.md` defines rested.
9. **The script budget** 900 kB: its doc comment and test were confirmed (DL-285); the build is 863,084
   bytes.

*Judgement calls, for the owner to see.*
- *Morale moves in the wide Table* from after Age to after Items, since columns follow their groups.
- *"Rested"*, not "free", as the owner's example had it; it is also said where no rest band is set.
- *The stop sentence* "a Quest to staff: …'s Heroes at home could go on …" is left as it was: it is true
  of any Hero at home, and not in the story's list.
- *The form line's heading* stays "Morale", though the line reads Fatigue and the hurt too (DL-284).
- *The lock disables the button* rather than refuse a click, as Recruit does; no rule is on the page.
- *Fatigue by band on the builder's rows*, Morale's none, as DL-148 item 12 left it.
- *Tones:* fresh and weary plain, so a new game's chips stay quiet.

**Consequences.** The page and the CLI show what S1 to S8 built. No rule, config or content changed: the
config version stays 30, the content version 45, schema 11.

**Evidence.** The commit `v1.2.1-S9 (DL-289)`; the epic's S9 boxes. The checks' counts, the doctors'
readings and the e2e count are in the commit message.
