# Implementation plan — epics

**Companion to:** [`docs/plan.md`](../../plan.md) (the delivery plan) · **Baselined:** 2026-09-25
**Build model:** session-sized increments grouped into milestones; working software after every increment

One epic per milestone of the delivery plan, M0 to M8, and, after the first build, one per release
that needs a plan of its own: v1.0.1 (added 2026-09-28, DL-92), v1.1.2 (added 2026-09-30, DL-125), v1.1.3 (added 2026-10-01, DL-135), v1.1.4 (added 2026-10-02, DL-148 to DL-150) v1.1.5 (added 2026-10-03, DL-168 and DL-169), v1.1.6 (added 2026-10-05, DL-186) and v1.1.7 (added 2026-10-06, DL-206). Each epic turns a milestone's
increment list into stories with acceptance boxes, the files and functions each story lands, the
tests that prove it, the configuration fields it introduces and the harness counters it must report.
The inputs the build needs from the owner are gathered in
[`INPUTS-REQUIRED.md`](./INPUTS-REQUIRED.md), ordered by when they are needed, each beside the
value in force at `m8-modules` and the owner's answer.

**Who decided what.** The milestone order, the "done" bars and the ten decisions in
`plan.md` §5 are the owner's. Everything below that — story boundaries, function names, file
layout, event names, the defaults offered for every tunable — is an agent's proposal made on
2026-09-25 from the design documents and from what the v1 proof of concept on `feature/poc`
proved to work (v1.0.1's on 2026-09-28, from the open issues and the owner's four answers in
DL-92). Nothing had been built when this plan was written; the first build has since been
completed, to `m8-modules` (§1, *What the first build actually took*). Where a story can be done
two ways, the epic says which and why; disagree in the milestone's GitHub issue before the story
starts.

## 1. Epic register

| ID | Epic | Gate | Sessions | Depends on |
| --- | --- | --- | --- | --- |
| [M0](./M0-skeleton.md) | Skeleton | `npm test` and `npm run lint` pass in CI; the lint rule fails a deliberate `Math.random` in `engine/`; the decision log exists | 3–4 | — |
| [M1](./M1-world-state.md) | World State | A seeded world is created, validated, saved, loaded and shown from the CLI; 1,000 worlds byte-identical across two runs | 12–14 | M0 |
| [M2](./M2-the-loop.md) | The loop | The harness plays whole games to an ending under an automatic policy; a human advances, dispatches and recruits from the CLI | 12–16 | M1 |
| [M3](./M3-progression.md) | Progression | Heroes gain Levels toward Potential and decline with age; Rankings by Fame and Wealth; Hall Improvements are bought | 6–7 | M2 |
| [M4](./M4-quest-engine.md) | Quest Engine | The stub is replaced by typed encounters and checks reading Skills, Relationship and Synergies | 7–9 | M3 |
| [M5](./M5-items.md) | Items | Gear, consumables, Market and Loot exist and are bought, sold, equipped and expended | 6–8 | M4 |
| [M6](./M6-rivals.md) | Rivals | Named dispositions; Transfers both ways; Rivals transfer among themselves | 4–6 | M5 |
| [M7](./M7-web.md) | Web | The browser front end is served from a Cloudflare Pages URL with saves in IndexedDB | 6–8 | M6 |
| [M8](./M8-modules.md) | Modules | The module contract exists and a probe module proves every part of it; the core runs with none installed, byte-identical to M7 | 4–6 | M7 |
| [v1.0.1](./v1.0.1-release.md) | Workers beside Pages, and three page fixes; complete as of its tag, `v1.0.1`, on 2026-09-28 (DL-97) | `v1.0.1` deployed from a clean checkout of its tag to the Worker `heroesim` and to Pages, `e2e:live` passing on both; M8's and v1.0.1's deploys recorded; a core-only 50 × 20 sweep with `v1.0.0`'s fingerprint | 5–7 | v1.0.0 |
| [M9](./M9-redesign.md) | The page redesigned, the Guildmaster's setup (#30) and two fast-forward stops (#32); the v1.1 line (DL-99, DL-100) | The page as views in a shell at 360, 820 and 1280px with the journeys through it; the History for any entity; the Guildmaster set up within a Trait budget from both front ends; Succession for a Rival Guildmaster; the Bankruptcy and staffable-Quest stops; a 50 × 20 sweep with every difference from `v1.0.1`'s explained | 12–16 | v1.0.1 |
| [M9, follow-on](./M9-feedback.md) | The owner's player test of M9: a Quest's return as one entry with a report on the Guild's home, the History's scopes with a World History, the Guild in four parts, the Market and the Guildmaster as views, every Guildmaster 21 to 50 and retiring at 61 (DL-111, DL-112, DL-113); built and verified on `v1.1-dev` 2026-09-30 (DL-119), the owner's answers on the close built as M9-F7 (DL-120, DL-121), the release, M9-S9 (DL-123), deployed from CI (DL-122) as `v1.1.0` on 2026-09-30 | Each of DL-111's nine points driven by a test through the page or the CLI; the seven views at 360, 820 and 1280px with the journeys through them; `configVersion` 12 with a 50 × 20 sweep against `d476deb`'s, every difference explained, and a Succession probe of a Rival Guildmaster at 50 over 12 years | 8.5–11 | M9-S8 |
| [v1.1.2](./v1.1.2-release.md) | Portraits, Guild Banners and Unique Items' pictures from a `media/` folder, the player's Guildmaster's Portrait chosen or drawn, the Guildmaster described from content, and every standalone text beginning with a capital, as one v1.1.x patch on `v1.1.2-dev` (DL-125); built and verified on `v1.1.2-dev` 2026-09-30 (DL-133); v1.1.2-S7, renaming the Portrait stream `gm-portraits`, added and built 2026-10-01 (DL-135, DL-137); released as `v1.1.2` on 2026-10-01 (pull request #45) | DL-125's items met through the page and the CLI; the built page opening from `file://` with its pictures; a core-only 50 × 20 sweep's counters equal to `v1.1.1`'s; the guard test over every view; `v1.1.2` deployed from CI | 7–9 | v1.1.1 |
| [v1.1.3](./v1.1.3-release.md) | Portraits that follow the person: a Portrait for every Guildmaster and Hero chosen to fit them, on `gm-portraits` and `hero-portraits`, the Silhouette where none fits; a Guildmaster's Biography from their picture; Heroes gaining an Appearance and a Biography; schema 6; and a portrait tool with its skills and agents for intake, analysis and apply (DL-134, DL-135); planned 2026-10-01; built and verified on `v1.1.3-dev` 2026-10-02 (DL-138 to DL-147); released as `v1.1.3` on 2026-10-02 (pull request #47) | DL-134's and DL-135's items met through the page, the CLI and the tool; the owner's pictures taken in by `portrait-intake`; a core-only 50 × 20 sweep's play counters equal to `v1.1.2`'s; the limits held by checks; `v1.1.3` deployed from CI | 11–14 | v1.1.2 |
| [v1.1.4](./v1.1.4-release.md) | Richer Quests: a Check's score written in content as a Query over the Party, one to four named Checks to an Encounter with Degrees, each Hero's form, harm that reads the Stats, the chances shown as words and the Rivals choosing by them, Hero Traits with effects and rarely earned, the Encounters widened so every Hero Stat is read by three Checks (DL-148), the Guildmaster's setup, "Choose for me" or the player's own sex, age, picture and Stats (DL-149), and Traits in two lists of effect lists with a local content editor and Claude Code skills for Traits that a CI-checked register keeps current (DL-150); planned 2026-10-02; built and verified on `v1.1.4-dev` 2026-10-03 (DL-151 to DL-167); released as `v1.1.4` on 2026-10-03 (pull request #50) | DL-148's items met through the page and the CLI; a parity sweep after S1 equal to `v1.1.3`'s; the player's Quests failing 20 to 30% and strong at most 50%, deferred by the owner (DL-165) and measured unmet in the closing 50 × 20 sweep; every Hero Stat read by three Checks across two kinds; the estimate within 2 points of the resolver; both ways of the setup driven through the page; the Traits' move playing the same games; the editor and the skills driven by tests, the drift and freshness tests passing; `v1.1.4` deployed from CI | 22–27 | v1.1.3 |
| [v1.1.5](./v1.1.5-release.md) | The owner's answers to v1.1.4's open questions (DL-168): one 20-year game's memory profiled and its main cause fixed with the same games; the harness's automatic player choosing its Quests by their chance, and a new 50 × 20 baseline; an Injury on the next-weakest unhurt Hero, and the positive earned Traits back at 0.05, each with its own sweep; `partyFor` adding a Hero only for a real gain; the estimate's harness test with Morale's consequences in; the words of the Earned Trait and the Chance band; an information-only split-XP sweep; and, added the same day (DL-169), the Board's Party builder listing the Heroes who cannot go last with chips of "Away" and "Injured", and the Roster as Tiles or a Table of effective Stats, its columns chosen, sorted by any of them, with each Hero's Traits and Items; the screens and the words built first, then the engine's chain with one fingerprint sweep for S1 and S6 and the replay on the baseline and the close only; planned 2026-10-03; built, verified and closed on `v1.1.5-dev` 2026-10-04 (DL-170 to DL-181), the closing sweep's 12 of 50 Bankruptcies naming the economy pass first, as `v1.1.6` (DL-168 item 16); reopened the same day by the owner's answers (DL-182): the XP split shipped as S13, Unique Items on the Roster with a thin gold glow as S14, then a short re-close, the economy pass deferred to the backlog and what follows `v1.1.5` to be decided; S14 and S13 built and verified (DL-183, DL-184) and re-closed (DL-185), #52's judgement calls 4 and 6 built, no Guild's Roster capped, S13's sweep the closing sweep; the release awaiting the owner | The Board's unavailable Heroes last and the Roster's Tiles, Table, columns, sort, Traits and Items through the page, remembered in the browser only; S1's and S6's sweep equal to `v1.1.4`'s close by fingerprint; the new player measured against it; each play change measured alone; Traits earned a career read against S5's baseline of 2.32 (the owner's steer, DL-179); the estimate within 2 points with no one falling and 3 with Morale's consequences in; the words fixed; the split-XP trial recorded, and the XP split then shipped as S13, its closing sweep playing the trial's games; on the Roster's Tiles a Unique Item's picture and a thin gold glow, on the Table the glow alone, passing contrast in light and dark; DL-168's rule applied, its outcome overridden by the owner (DL-182); the script under 850 kB, or 900 kB if S12 needs it; `v1.1.5` deployed from CI; released 2026-10-04 (#54) | 12–15 | v1.1.4 |
| [v1.1.6](./v1.1.6-release.md) | Deeper modules, less duplication, and tuning as checked data, from an architecture review after v1.1.5 (DL-186): a sweep's totals by one fold, the run's settings in one parser with `gate` and `neutral` profiles, a JSON report, `compare` and a declared Gate spec, the replay played once; the content version as data and the editor's `update`, content importing the engine's values, `playDeps` checking every setting, the old content form and the Quests' `demands` gone, the tuning values as data with the editor's config kind; harm targeting in `harm.ts`, one Query operator table, a Stat's breakdown, the engine's interface narrowed, the write-once data outside the per-Turn copy; one set of words for the CLI and the page; whether a Hero can go, the Party builder, a declared Class order, breakpoints and remembered preferences; draw weights and the Rivals' orders defaulting to today's play. No new gameplay.; planned 2026-10-05; built and verified on `v1.1.6-dev` 2026-10-05 to 2026-10-06 (DL-187 to DL-205), no play counter moved; the Gate met: the closing full `gate`, run again alone on the owner's answer, meeting every line, the per-Turn copy's time 0.826 ms (1.350 ms on the first run, the machine's speed and not the code) (DL-205); released as `v1.1.6` on 2026-10-06 (pull request #56, merged as `7fda66e`): the tag, the deploy and the GitHub Release by CI, `e2e:live` 4 of 4 on both addresses | Every game unchanged by each story, by `gate --expect` on the `neutral` profile or a full `gate`; S7's and S17's new fingerprints with `compare` showing no play counter moved against S3's baseline; the close's full `gate` meeting `harness/gate.json` line by line, its first spec approved by the owner; the save after 20 years under 30 MiB gzipped on the mean, no growth guard (amended, DL-188); the Traits doctor without drift; the script under 850 kB | 22–27 | v1.1.5 |
| [v1.1.7](./v1.1.7-release.md) | The owner's answers to v1.1.6's open items and to four features (DL-206): the Gate's copy line as the copy's share of a Turn; a new Guild's deals and a Guildmaster's sex drawn by weight; one "why it stopped" for the CLI and the page; every date a player reads as "Year Y Day D", the Year from 1 and the Day from 1 to 360, a Year a whole number of Days; no History entry for a Hero never hired from the Unattached pool; a Class icon, chosen in content, before a Hero's name wherever a Hero is listed with their Class; one filter element of several choices for every filter on the page, and the Roster filtered by Class and by At the Hall, Injured and Away. No play changed; planned 2026-10-06 | Every game unchanged, by `neutral --expect` or, where a story moves the fingerprint, by a quick check with the versions put back or `compare` showing no play counter moved; the close's full `gate` meeting `harness/gate.json`; the four icons approved by the owner; the Traits doctor without drift; the script under 850 kB | 9–12 | v1.1.6 |

**Total: 60–78 sessions** of two to three hours, against no calendar. That sum is stated only
here. It is the first build's, M0 to M8; v1.0.1's row is outside it (added 2026-09-28, DL-92).

A session is the unit of the estimate because it is the unit the owner has: intermittent
hours. A story that will not fit in two sessions is split before it starts, not during.

### What the first build actually took

The first build was not made in human sessions. Agents built it between 2026-09-25 and 2026-09-27
(M0's first commit is 2026-09-26 00:41 at UTC+10, the afternoon of 2026-09-25 in UTC), working the
stories this plan sets out, with the owner's decisions (the pre-M0 review, the answers in
INPUTS-REQUIRED) taken before and during it. So there is no count of sessions to set beside the
estimate; what can be counted is the wall clock.

| Milestone | Planned sessions | At 2–3 h a session | First commit | Last commit | Wall-clock span |
| --- | --- | --- | --- | --- | --- |
| M0 | 3–4 | 6–12 h | 2026-09-26 00:41 | 2026-09-26 01:06 | 0 h 25 min |
| M1 | 12–14 | 24–42 h | 2026-09-26 01:02 | 2026-09-26 02:35 | 1 h 33 min |
| M2 | 12–16 | 24–48 h | 2026-09-26 02:39 | 2026-09-26 07:10 | 4 h 32 min |
| M3 | 6–7 | 12–21 h | 2026-09-26 06:48 | 2026-09-26 14:00 | 7 h 12 min |
| M4 | 7–9 | 14–27 h | 2026-09-26 07:56 | 2026-09-26 19:33 | 11 h 37 min |
| M5 | 6–8 | 12–24 h | 2026-09-26 10:59 | 2026-09-27 00:12 | 13 h 13 min |
| M6 | 4–6 | 8–18 h | 2026-09-26 14:43 | 2026-09-27 13:56 | 23 h 13 min |
| M7 | 6–8 | 12–24 h | 2026-09-26 14:41 | 2026-09-27 17:51 | 27 h 10 min |
| M8 | 4–6 | 8–18 h | 2026-09-27 20:13 | 2026-09-28 07:26 | 11 h 13 min, M8-S1's work before 20:13 not counted |
| **All** | **60–78** | **120–234 h** | 2026-09-26 00:41 | 2026-09-28 07:26 | **54 h 45 min** elapsed |

**How it was counted.** From `git log --all`, by committer date in the commits' own time zone
(UTC+10). A milestone's commits are those whose subject begins with its name: its stories
(`M3-S2: …`), its verification (`M3 verify: …`) and its close (`M3 close: …`). Merges are not
counted; the release merge that carries each tag falls within a minute of the milestone's last
commit. A span runs from the first of them to the last, so it leaves out the work before a
milestone's first commit, which is its first story's: a story is committed when it is done. For M8
that is about 2 h 20 min, M8-S1 being built with its two 200 × 20 sweeps (128.9 minutes, DL-76)
before its commit at 20:13. M8's runs to its close, the first build's tagged run (DL-81); M8-S4
wrote this table to M8-S3 and the orchestrator brought it to the close at the tag.

**What the spans are not.** They are not effort, and they do not add up. Agents worked several
stories, and several milestones, at once, each in a worktree of its own: M7-S1 began while M4 was
still open. The nine spans sum to 100 h 07 min; the build's clock ran 54 h 45 min from M0's first
commit to M8's close, and for 52 h 19 min of that at least one milestone's span was open. The other
2 h 26 min falls before a milestone's first commit, 4 minutes before M2's and 142 minutes, from
M7's close, before M8-S1's: that is M8-S1 being built, not idle time. A span also holds
waiting as well as work: the harness sweeps, from M3 on 200 seeds × 20 years, which take 40 to 75
minutes each on this machine; balance passes run overnight (M6's close, from its counters to its
run, spans 02:36 to 11:46 on 2026-09-27; the first build's 1,000 × 20 tagged run, 00:50 to 07:02 on
2026-09-28, is most of M8's); and any time in which no agent was running. No record of
agents' working time or of compute was kept, so neither is reported.

**Beside the estimate.** The plan counted 60–78 sessions, 120–234 hours of one person's time
against no calendar. The build took 55 hours of wall clock, made by agents in parallel. The two are
not the same unit, and the table says nothing about how long a story takes a person; the estimate
stands as the plan's for work a person does.

## 2. Sequence

```mermaid
graph LR
    M0["M0 Skeleton"] --> M1["M1 World State"] --> M2["M2 The loop"] --> M3["M3 Progression"]
    M3 --> M4["M4 Quest Engine"] --> M5["M5 Items"] --> M6["M6 Rivals"] --> M7["M7 Web"] --> M8["M8 Modules"]
```

Strictly linear. `plan.md` §1 gives the reasons for the two orderings that were open: Rivals
act from M2 with one trivial disposition so nothing is ever tuned against an uncontested Board;
the module contract comes last so the pipeline's phases are settled by use before they become an
interface (ADR-0005 as amended).

Why the middle runs Progression → Quest Engine → Items → Rivals: growth is the pull
(principle 2), so Levels and Potential land first and are tuned against the stub; the real
Quest Engine then has Skills and Levels to read; Items and Loot are consumed by the Quest Engine
so they follow it; Transfers are the last thing the automatic policy needs to be sensible about.

## 3. How to run a milestone

1. Open the milestone's GitHub issue with `gh issue create`, title `M<n> <name>`, body the
   epic's story list as a checklist. Not before the milestone starts.
2. Work the stories in order unless the epic says a story is independent. Each story ends with
   its tests green and, where it names one, its CLI command working on a real save.
3. Record every decision the epic left open, and every default changed, in
   `docs/decision-log.md` as a `DL-nn` entry, before or alongside the change.
4. Run the harness at the milestone's end and write the measured counters into the epic under
   a **Measured** heading, with the seed count and years.
5. Merge `v1.0-dev` into `v1.0-release`, tag that merge `m<n>-<name>`, close the issue, and
   set the status and date in the milestone table of `docs/plan.md`.

**After the first build (DL-86).** The first build ends at `m8-modules`, which is also tagged
`v1.0.0`. Work after it continues on the v1.1 line: stories are built on `v1.1-dev`, a milestone
completes by merging `v1.1-dev` into `v1.1-release` and tagging that merge, and the milestone tags
go on from `m9-random-events`. Read step 5 with those branch names. `v1.0-dev` and `v1.0-release`
are frozen but for v1.0.x hotfix releases, the first of which moves the deploy to Cloudflare
Workers (DL-88, DL-91). That release is v1.0.1, with three page fixes beside the move, planned in
[its epic](./v1.0.1-release.md); it begins by fast-forwarding `v1.0-dev` to the commit that
recorded its plan, and is deployed only from a clean checkout of its tag (added 2026-09-28, DL-92).

*Amended 2026-09-29 (DL-99).* The v1.1 line's milestone is M9, the page redesigned. It carries #30
and #32 and is tagged `m9-redesign`. Random Events moves to the v1.2 line as M10
(`m10-random-events`), built on `v1.2-dev`, which is created from `v1.1-release` at `v1.1.0`. Read
step 5 with `v1.2-dev` and `v1.2-release` for it. M9's epic is
[M9-redesign.md](./M9-redesign.md), in the register above (DL-100).

## 4. Conventions the epics assume

- Packages are `@heroesim/engine`, `@heroesim/content`, `@heroesim/harness`, `@heroesim/cli`,
  `@heroesim/web`, in directories of the same short name (approach §5).
- Every tunable is a field on `GameConfig` with a value in `defaultConfig` (principle 8). Each
  story lists the fields it adds; the defaults are the agent's and are inputs the owner may
  change (INPUTS-REQUIRED). The owner ratified those in force at `m8-modules` in DL-90, except
  those DL-82 to DL-89 change or leave for proposals.
- Events are typed records `{ type, turn, participants, labels, milestone, payload }` with
  `type` in the form `<entity>.<what-happened>`: `hero.recruited`, `quest.resolved`. Each story
  lists the event types it adds.
- Engine functions never throw for a rule violation: an action returns
  `{ ok: true, document, events } | { ok: false, rejection }` with a typed `rejection`. They do
  throw on programming errors, such as an id that the validator would refuse.
- Every engine entry point takes one `deps = { config, content, modules }` object and rules
  read `deps.config`; a front end passes the document's `meta.config`, the harness passes its
  own, and `rebase` is how a game adopts new defaults (approach §3, data-model §2).
- Tests sit beside the code as `*.test.ts` and assert on events and state, never on strings.
- The vocabulary is `CONTEXT.md`, exactly, in code identifiers too: `rosterIds`, not `teamIds`.
