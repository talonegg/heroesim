# Closed epics

The epics of finished milestones and releases, M0 to v1.1.7, and the web UI review M9 was built
from. They were moved here from `docs/planning/epics/` (and the review from `docs/`) when v1.1.8
opened, with their text unchanged (the v1.1.8 epic, S4). The first build's inputs followed once
their live parts had moved out (S5, DL-217). Each release, its date, pull request and
merge commit are a row of [`plan.md`](../../plan.md) §2's ledger. The decision log's archive
names these files at their old paths; the file names are unchanged. In the copies below, only
links are re-pointed to where their files now are.

| Epic | Released as | Decisions | Note |
| --- | --- | --- | --- |
| [M0](M0-skeleton.md) | `m0-skeleton`, in `v1.0.0` | DL-01 to DL-85, the first build |  |
| [M1](M1-world-state.md) | `m1-world-state`, in `v1.0.0` |  |  |
| [M2](M2-the-loop.md) | `m2-the-loop`, in `v1.0.0` |  |  |
| [M3](M3-progression.md) | `m3-progression`, in `v1.0.0` |  |  |
| [M4](M4-quest-engine.md) | `m4-quest-engine`, in `v1.0.0` |  |  |
| [M5](M5-items.md) | `m5-items`, in `v1.0.0` |  |  |
| [M6](M6-rivals.md) | `m6-rivals`, in `v1.0.0` |  |  |
| [M7](M7-web.md) | `m7-web`, in `v1.0.0` |  | One box open: the twenty-year save's measure, left to the owner |
| [M8](M8-modules.md) | `m8-modules` and `v1.0.0` |  | The first build's close |
| [v1.0.1](v1.0.1-release.md) | `v1.0.1` | DL-86 to DL-98 | DL-86 to DL-91 are the v1.0.0 review |
| [M9](M9-redesign.md) | `m9-redesign` and `v1.1.0` | DL-99 to DL-123 | Its §3, the CLI's commands in the browser, stays here, out of date since M9-F6 (the v1.1.8 epic, Q3) |
| [M9, follow-on](M9-feedback.md) | `v1.1.0` | DL-111 to DL-121 | M9-F1 to M9-F7 |
| [v1.1.2](v1.1.2-release.md) | `v1.1.2` | DL-125 to DL-133, DL-137 |  |
| [v1.1.3](v1.1.3-release.md) | `v1.1.3` | DL-134 to DL-147 but DL-137 |  |
| [v1.1.4](v1.1.4-release.md) | `v1.1.4` | DL-148 to DL-167 |  |
| [v1.1.5](v1.1.5-release.md) | `v1.1.5` | DL-168 to DL-185 |  |
| [v1.1.6](v1.1.6-release.md) | `v1.1.6` | DL-186 to DL-205 |  |
| [v1.1.7](v1.1.7-release.md) | `v1.1.7` | DL-206 to DL-214 |  |
| [v1.1.8](v1.1.8-release.md) | `v1.1.8` | DL-215 to DL-230 | The documentation slimmed |
| [v1.1.9](v1.1.9-release.md) | `v1.1.9` | DL-231 to DL-254 | The tests and the harness made faster and leaner, the code's modules deepened; its measures, the baseline and the after-report, are [v1.1.9-measures](v1.1.9-measures.md) |
| [v1.2.0](v1.2.0-release.md) | `v1.2.0` | DL-257 to DL-278 | Fewer, weightier Quests: tiered Quest templates with Beats, Death by Tier, a Party floor of two, and the tools to write the content; released untuned, its live check failed on Pages (DL-278) |
| [Inputs required from the owner](INPUTS-REQUIRED.md) | the first build's inputs | DL-82 to DL-90 | Frozen at `m8-modules`; code cites its rows as `INPUTS n.m`. Its §9 is now [`docs/environment.md`](../../environment.md), its §8 is `plan.md` §3's Random Events item, and row 7.8's addresses are in [`docs/deploy.md`](../../deploy.md) (DL-217) |
| [The first build's plan](first-build-plan.md) | `v1.0.0` | DL-01 to DL-10 | `plan.md`'s §1, milestones, increments and §5, moved here when the plan was cut to the delivery of releases (DL-220) |
| [The web UI review](web-ui-review-2026-09-29.md) | built by M9 | DL-99 | Moved from `docs/`; its findings decided in DL-99 |

The rest of this page is the record the live plan no longer carries, word for word as it stood at
v1.1.7's release: the epic register's rows, the first build's clock and "How to run a milestone",
from the epics README, and `plan.md`'s release narrative, from its §2 and §4.

## The epic register, as it stood at v1.1.7's release

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
| [v1.1.7](./v1.1.7-release.md) | The owner's answers to v1.1.6's open items and to four features (DL-206): the Gate's copy line as the copy's share of a Turn; a new Guild's deals and a Guildmaster's sex drawn by weight; one "why it stopped" for the CLI and the page; every date a player reads as "Year Y Day D", the Year from 1 and the Day from 1 to 360, a Year a whole number of Days; no History entry for a Hero never hired from the Unattached pool; a Class icon, chosen in content, before a Hero's name wherever a Hero is listed with their Class; one filter element of several choices for every filter on the page, and the Roster filtered by Class and by At the Hall, Injured and Away. No play changed; planned 2026-10-06; built and verified 2026-10-06 to 2026-10-07 (DL-207 to DL-214), the close review's findings fixed, the Gate met by the closing full `gate` (`m9-v117-s8`, DL-214); released as `v1.1.7` on 2026-10-07 (pull request #58, merged as `25f8fa0`): the tag, the deploy and the GitHub Release by CI, its live check re-run after its phone runs first met the earlier deploy, then `e2e:live` 4 of 4 on both addresses | Every game unchanged, by `neutral --expect` or, where a story moves the fingerprint, by a quick check with the versions put back or `compare` showing no play counter moved; the close's full `gate` meeting `harness/gate.json`; the four icons approved by the owner; the Traits doctor without drift; the script under 850 kB | 9–12 | v1.1.6 |

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

## The epics README's §3, "How to run a milestone", as it stood at v1.1.7's release

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

## `plan.md` §2, as it stood at v1.1.7's release

Its M9 row:

| # | Milestone | Done when | Status |
| --- | --- | --- | --- |
| M9 | The page redesigned | The page as views in a shell, the History for any entity, a Party builder with each Hero's availability and attributes, a new style; the Guildmaster's setup within a Trait budget and Succession for a Rival (#30); the Bankruptcy and staffable-Quest stops (#32). The v1.1 line (DL-99, DL-100) | Built and verified 2026-09-29 on `v1.1-dev` (DL-108), with the owner's answers built (DL-109, DL-110); released as `v1.1.0` on 2026-09-30 from CI (DL-122, DL-123) after the owner's player test added a follow-on, M9-F1 to M9-F6 (DL-111, DL-112), planned 2026-09-29, approved as amended the same day (DL-113: every Guildmaster 21 to 50 and retiring at 61), built (DL-114 to DL-118) and verified 2026-09-30 on `v1.1-dev` (DL-119); the owner's answers on the close built as M9-F7 (DL-120, DL-121); `m9-redesign` and `v1.1.0` wait for the owner's steps (M9-S9, #37, DL-123, deployed from CI by DL-122) |

Its release narrative:

The first build is complete: M8 was tagged `m8-modules` on 2026-09-28. The next work is Random
Events (§4): the first real module, and the test of whether the module contract fits a real
feature (ADR-0005 as amended). Before it comes one small v1.0.x release, the move to Cloudflare
Workers static assets, which now heads §4's list (amended 2026-09-28, DL-88; originally "the
first line of §4"). That release is v1.0.1: the move, M8's deploy and its own recorded, and three
page fixes that change no play, planned in
[`planning/epics/v1.0.1-release.md`](./v1.0.1-release.md) (amended 2026-09-28,
DL-92). v1.0.1 is complete as of its tag, `v1.0.1`, on 2026-09-28 (amended 2026-09-28, DL-97).

**Releases after the first build** (amended 2026-09-28, DL-86; 2026-09-29, DL-109). The first build is released as
`v1.0.0`, tagged at `m8-modules`. New work is on `v1.1-dev` and is released by merging into
`v1.1-release`; milestone tags continue (`m9-random-events`); `v1.0-dev` and `v1.0-release` are
frozen but for v1.0.x hotfix releases, each committed on `v1.0-dev`, tagged on `v1.0-release`
and merged into `v1.1-dev` (DL-91); the first is the Workers move (DL-88). Production
serves the latest release: `v1.0.0` stays live until `v1.1-release`'s first release, when the
Pages production branch and the deploy script move to `v1.1-release`. GitHub's default branch
follows the same rule: `v1.0-release` from 2026-09-28, `v1.1-release` at its first release
(DL-88). The owner's decision to cut v1.0 now and open a new line, where
the agents recommended making Random Events M9 on the v1.0 line.

*Amended 2026-09-28 (DL-92).* The first v1.0.x release is `v1.0.1`: the Workers move, M8's deploy
and its own recorded, and three page fixes the owner added against the recommendation (tied
Rankings as a shared place, the Bankruptcy countdown, fast forward in steps with a Stop), amending
DL-91 item 4 for these three alone. Before its work, `v1.0-dev` is fast-forwarded to the commit
that recorded its plan, so the v1.0 line carries DL-82 onwards; then DL-91's flow applies. It is
deployed only from a clean checkout of its tag, to the Worker and then to Pages. From its deploy,
`v1.0.1`, not `v1.0.0`, is what production serves until `v1.1-release`'s first release.

*Amended 2026-09-28 (DL-94).* From `v1.0.1` the page is served at two addresses: the Worker
`heroesim` on Cloudflare Workers static assets, at <https://heroesim.magical-potato.workers.dev>,
and the Pages project `heroesims` at <https://heroesims.pages.dev>, which alone served the page
from M7 to `v1.0.0` (corrected 2026-09-28, DL-97). `npm run deploy` runs only from a clean
checkout of a release tag (`v*`) and refuses anything else before it builds; it builds once,
uploads that build to the Worker and then to Pages, stopping at the first failure, and prints the
record the release's decision-log entry keeps. `npm run e2e:live -w web` then checks both
addresses at both widths.

*Amended 2026-09-29 (DL-99).* The v1.1 line is the page redesigned.
- *M9, the redesign.* It is built on `v1.1-dev` with #30 (the Guildmaster's setup) and #32 (the
  Bankruptcy and staffable-Quest stops) as stories. It is tagged `m9-redesign` and released as
  `v1.1.0`, when #37 moves production and GitHub's default branch to `v1.1-release`.
- *Random Events moves to the v1.2 line.* It becomes M10, tagged `m10-random-events` in place of
  `m9-random-events`, on `v1.2-dev`, which is created from `v1.1-release` at `v1.1.0`. Every other
  open issue goes with it, in the order it had against Random Events.
- *The v1.1 line after `v1.1.0`.* It is frozen but for v1.1.x hotfixes, merged forward into
  `v1.2-dev`, as the v1.0 line is. Production moves to `v1.2-release` at its first release.

The order is the owner's decision. The branch and tag names are an agent's proposal (DL-99
item 10).

*Amended 2026-09-29 (DL-109).* The v1.0 line is never deployed again once `v1.1.0` is live. A
Worker has no branches, so a v1.0.x deploy would replace v1.1 at the workers.dev address. A fix
after `v1.1.0` goes out as v1.1.x on the v1.1 branches, merged forward, which amends DL-91 item 4's
flow for v1.0 from then on. The owner's decision (DL-109 item 5).

## `plan.md` §4, as it stood at v1.1.7's release

Modules, in whatever order the module contract makes cheapest: Random Events (the smallest,
and the first real module; the next work, the first build being complete), Scenarios,
Campaigns, Contacts, Factions, Scouting and hidden information, Workers, Skill growth, the
Guildmaster in a Party, the deferred endings. They are not sequenced here; the first build will
show which is cheapest to prove next.

*Amended 2026-09-28 (DL-89).* The list is completed with the deferrals recorded elsewhere, and
it is ordered after Random Events: Random Events' close picks what comes next. Whether a later
feature is a module or a change to the core is decided per feature, in its epic, with no general
rule, so "Modules" above no longer decides it for any line below (the owner's decision, where
the agents recommended that story features be modules and rule extensions core increments).

- **First, before Random Events:** the move to Cloudflare Workers static assets, as the first
  v1.0.x release, on v1.0; it deploys to both the new `*.workers.dev` address and Pages, and
  Pages stays until Cloudflare retires it (DL-88). It is `v1.0.1`, with three page fixes beside
  the move and the Worker named `heroesim` (amended 2026-09-28, DL-92).
- **Next:** the page redesigned, M9, on `v1.1-dev`, with #30 and #32, released as `v1.1.0`
  (§2). Views in a shell, the History for any Guild, Hero or Patron, a Party builder showing each
  Hero's availability and attributes, and a new visual style (DL-99). Autosave and keyboard
  shortcuts come after it (DL-99 items 4 and 5). *Amended 2026-09-29 (DL-99): the owner put the
  redesign before Random Events.* *Amended 2026-09-29 (DL-111): the owner's player test of M9 adds a
  follow-on inside `v1.1.0` (`docs/planning/epics/M9-feedback.md`).*
- **Then, inside the v1.1 line:** Portraits, Guild Banners and Unique Items' pictures, the
  Guildmaster described from content, and every standalone text beginning with a capital, as the
  patch `v1.1.2`, built on `v1.1.2-dev` from `main` (`docs/planning/epics/v1.1.2-release.md`).
  *Added 2026-09-30 (DL-125).* *Built and verified on `v1.1.2-dev` 2026-09-30 (DL-133); S7, which
  renames the Portrait stream `gm-portraits`, was built 2026-10-01 (DL-137). Released as `v1.1.2`
  on 2026-10-01.*
- **Then, inside the v1.1 line:** Portraits that follow the person, as the patch `v1.1.3`, built on
  `v1.1.3-dev` from `main` (`docs/planning/epics/v1.1.3-release.md`):
  - a Portrait for every Guildmaster and Hero, chosen to fit them, with the Silhouette where none
    fits;
  - Guildmasters' Portraits drawn on `gm-portraits`, which `v1.1.2` names in its S7, and Heroes' on
    `hero-portraits`;
  - Heroes gaining an Appearance and a Biography;
  - a portrait tool, with its skills, for intake, analysis and apply.

  *Added 2026-10-01 (DL-134, DL-135).* *Built and verified on `v1.1.3-dev` 2026-10-02 (DL-138 to
  DL-147). Released as `v1.1.3` on 2026-10-02 (pull request #47).*
- **Then, inside the v1.1 line:** Richer Quests, as the patch `v1.1.4`, built on `v1.1.4-dev` from
  `main` (`docs/planning/epics/v1.1.4-release.md`):
  - a Check's score written in content as a Query over the Party's Heroes, and a Synergy's
    requirements too;
  - one to four named Checks to an Encounter, with Degrees from Triumph to Failure, and a strong
    success needing Triumphs;
  - each Hero's form, from their Morale and any wound taken on the Quest, and harm that falls by
    the Stats;
  - the chances shown as words on the Board and in the Party builder, and the Rivals choosing their
    Parties by the same estimate;
  - Guildmaster and Hero Traits in two lists, each Trait a list of effects; Hero Traits with
    effects, and Traits rarely earned on Quests;
  - the Encounters widened, with a `lore` kind and finales, so that every Hero Stat is read by at
    least three Checks;
  - the Guildmaster's setup: "Choose for me" for the whole Guildmaster, or the player's own sex,
    age, picture and Stats from a pool of points;
  - a local content editor for the owner, Traits its first kind, and Claude Code skills for Traits,
    kept current by a register of every use of a Trait that CI checks.

  *Added 2026-10-02 (DL-148): the owner put it inside the v1.1 line, before Random Events. The
  setup (DL-149), and Traits with their editor and skills (DL-150), added the same day.* *Built and verified on
  `v1.1.4-dev` 2026-10-03 (DL-151 to DL-167), the Quest target deferred by the owner and recorded
  unmet (DL-165, DL-166). Released as `v1.1.4` on 2026-10-03 (pull request #50).*
- **Then, inside the v1.1 line:** the owner's answers to v1.1.4's open questions, as the patch
  `v1.1.5`, built on `v1.1.5-dev` from `main` (`docs/planning/epics/v1.1.5-release.md`):
  - one 20-year game's memory profiled, and its main cause fixed with the same games;
  - the harness's automatic player choosing its Quests by their chance, not the highest reward it
    can staff, and a new 50 × 20 baseline, with no rule of the game changed for it;
  - an Injury falling on the next-weakest unhurt Hero, and the positive earned Traits back at a
    chance of 0.05, each measured by its own sweep;
  - `partyFor` adding a Hero only for a real gain, the estimate's harness test with Morale's
    consequences in, and the words of the Earned Trait and the Chance band;
  - an information-only sweep with the XP split across the Party, for the owner's decision;
  - on the Board, the Heroes who cannot go, Away or Injured, listed last in the Party builder, their
    chips reading just "Away" and "Injured";
  - the Roster as Tiles or a Table of each Hero's effective Stats, its columns chosen, sorted by any
    of them, with each Hero's Traits and Items.

  *Added 2026-10-03 (DL-168); the Board and the Roster added the same day, and the build order
  optimised: the screens and the words first, then the engine's chain (DL-169).* At its close, the owner's rule picks
  what follows (DL-168 item 16): if the new harness player brings the player's Bankruptcies within
  5 to 15% of games, Random Events next and the economy pass (#51) after; if not, the economy pass
  first, as `v1.1.6`. *Built, verified and closed on `v1.1.5-dev` 2026-10-04 (DL-170 to DL-181), the
  release awaiting the owner. The closing sweep's player Bankruptcies, 12 of 50 (24%; S3's baseline
  13), fall outside 3 to 7, so the economy pass comes first, as `v1.1.6` (DL-181).* *Reopened
  2026-10-04 by the owner's answers at the close (DL-182): the XP split across the Party, each Hero
  who comes home taking the Quest's XP divided by the Party's size, ships in `v1.1.5` (S13), and the
  Roster's Tiles show a Unique Item's picture with a thin gold glow around its Hero, the Table the glow
  alone (S14); then a short re-close. The rule's outcome is overridden: the economy pass goes to the
  backlog, and what follows `v1.1.5` is to be decided.* *Re-closed 2026-10-04 (DL-183 to DL-185): S14 and
  S13 built and verified, S13's sweep the closing sweep (0 of 50 player Guilds bankrupt); #52's
  judgement calls 4 and 6 built; no Guild's Roster capped; the release awaiting the owner.*
- **The economy pass (#51), in the backlog:** after other game balances and features, by the owner's
  answer at v1.1.5's close (DL-182): the late Bankruptcies, the DL-83 targets, the wage's shape, Rival
  income, the form factors, and the Market's size and draws by slot (DL-168 items 2, 9 and 12). The
  XP split is no longer in it: it ships in `v1.1.5`. *Added 2026-10-04 (DL-181) as the patch
  `v1.1.6`, before Random Events, by DL-168 item 16's rule; amended the same day (DL-182): not
  `v1.1.6`, but deferred to the backlog by the owner, its place to be decided.*
- **The Transfer Generator's Roster bound removed, in the backlog:** its own bids keep a Rival's
  Roster at or below `rivalRosterMax` (DL-59), kept for now only as a development measure to
  constrain testing load; no Guild's Roster is otherwise capped, each growing as far as its finances
  support. *Added 2026-10-04 (DL-185), by the owner's answer at v1.1.5's re-close: "the transfer
  generator cap stays purely for development and constraining testing load for now, will remove
  this in the future".*
- **The History's size and the save's compression investigated, in the backlog:** the save after 20
  years has grown from 47.1 MiB (M7) to 136.7 MiB uncompressed (v1.1.5-S13), most of it History, about
  11,700 entries a year at about 475 characters each; shorter entries, or compressed saves, to be
  weighed. `v1.1.6`'s growth guard (S2) watches it meanwhile. *Added 2026-10-05 (DL-186 item 31), the
  owner's yes. Amended 2026-10-05 (DL-188): no growth guard, by the owner's answer; the Gate holds the
  gzipped mean under 30 MiB and the harness's report prints the uncompressed size.* *Amended 2026-10-06
  (DL-206 items 20, 21): `v1.1.7`-S5 stops recording a never-hired Hero's pool entries, about 4% of
  the History's entries; the rest of this note stands.* *Amended 2026-10-07 (DL-206's consequences,
  DL-214): S5's full gate measured it: the History after 20 years 276,933 entries a game on the mean at
  `v1.1.6`'s close, 265,423 at S5 (4.2% fewer), the save 143.3 million characters to 141.0 (1.6%),
  gzipped 17.95 MiB to 17.51 (DL-211); `v1.1.7`'s closing gate the same.*
- **A Hero's page showing a Stat's sources, in the backlog:** the Roster's tooltip ("Base 12, +2 from
  Gear…") on a Hero's page too, once `v1.1.6`'s `statBreakdown` exists. *Added 2026-10-05 (DL-186
  item 31): A3's option (b), not chosen for `v1.1.6`.*
- **The weighted draws updated, in the backlog:** a deal at creation (a Guild's starting Roster, the
  Patrons' Spheres) is even only while every weight is 1 and is drawn place by place otherwise, so
  weights all equal but not 1, or one nudged from 1, lose "every Class once before any twice" though
  the proportions barely change; a deal that keeps to the weights' proportions (rounds by weight, or a
  weighted shuffle) to be weighed. *Added 2026-10-06 (DL-210's review), the owner's words: "b, put
  update weighting random draws on the backlog".*
- **Then, inside the v1.1 line: `v1.1.6`, deeper modules, less duplication, and tuning as checked data**, on `v1.1.6-dev`
  ([epic](./v1.1.6-release.md), DL-186). The owner's answers to an architecture review
  after `v1.1.5`, every candidate and small fix in scope, no new gameplay, 19 stories:
  - the harness's tooling: a sweep's totals by one fold; one parser of the run's settings with
    profiles (`gate`, `neutral`); a JSON report, `compare`, and a declared Gate spec
    (`harness/gate.json`) a `gate` run checks; the replay played once against the shard's record;
  - content and configuration as checked data: the content version as a data file and the editor's
    `update` for a use; content importing the engine's values; `playDeps` checking all 121 settings;
    the old content form and the Quests' `demands` gone; the tuning values in `engine/src/config.json`
    with the editor's config kind;
  - deeper engine modules: harm targeting in `harm.ts`; one Query operator table; a Stat's breakdown;
    the engine's interface narrowed; the write-once data outside the per-Turn copy (ADR-0011);
  - one set of words for the CLI and the page, and the page's plumbing: whether a Hero can go, the
    Party builder, a declared Class order, breakpoints and remembered preferences;
  - new knobs defaulting to today's play: draw weights, the sex weight, the Rivals' orders and the
    Finale's loot.

  *Added 2026-10-05 (DL-186). What follows `v1.1.5` had been left to the owner (DL-182 item 2).*
  *Built and verified on `v1.1.6-dev` 2026-10-05 to 2026-10-06 (DL-187 to DL-205), no play counter
  moved; the Gate met: the closing full `gate`, run again alone on the owner's answer, meets every
  line, the per-Turn copy's time 0.826 ms (1.350 ms on the first run, the machine's speed and not
  the code) (DL-205); released as `v1.1.6` on 2026-10-06 (pull request #56, merged as `7fda66e`): the tag, the deploy and the GitHub Release by CI, `e2e:live` 4 of 4 on both addresses.*
- **Next: `v1.1.7`, v1.1.6's open items, a calendar, Class icons, Roster filters and a History of
  those hired**, on `v1.1.7-dev` ([epic](./v1.1.7-release.md), DL-206). The owner's
  answers to v1.1.6's open items and to four features, no play changed, eight stories:
  - the Gate's copy line as the copy's share of a Turn; weighted deals at creation and a
    Guildmaster's sex weight; one "why it stopped" for the CLI and the page;
  - every date a player reads as "Year 2 Day 45, afternoon", the Year from 1 and the Day from 1 to
    360; a Year a whole number of Days;
  - no History entry for a Hero who passes through the Unattached pool and is never hired;
  - a Class icon before a Hero's name wherever a Hero is listed with their Class, chosen in content;
  - one filter element of several choices for every filter on the page, and the Roster filtered by
    Class and by At the Hall, Injured and Away.

  *Added 2026-10-06 (DL-206). What follows `v1.1.6` had been left to the owner (DL-205).*
  *Built and verified on `v1.1.7-dev` 2026-10-06 to 2026-10-07 (DL-207 to DL-214), no play counter
  moved; the close review's findings fixed; the Gate met: the closing full `gate`, alone, meets every
  line of `harness/gate.json`, its baseline now `v1.1.6`'s close, the copy's share of a Turn 0.2342
  (DL-214); released as `v1.1.7` on 2026-10-07 (pull request #58, merged as `25f8fa0`): the tag, the deploy and the GitHub Release by CI, its live check re-run after its phone runs first met the earlier deploy, then `e2e:live` 4 of 4 on both addresses.*
- **Then:** Random Events, M10, on `v1.2-dev` (§2), with its groundwork and the issues ordered
  against it. Random Events never produce Quests (DL-82). *Amended 2026-09-29 (DL-99): it was
  "Next", on `v1.1-dev`.* *Amended 2026-10-03 (DL-168): after `v1.1.5`, or after a `v1.1.6`
  economy pass, by DL-168 item 16's rule.* *Amended 2026-10-04 (DL-181): after `v1.1.6`, the rule
  having named the economy pass first.* *Amended 2026-10-04 (DL-182): there is no `v1.1.6` economy
  pass; when Random Events comes is the owner's to decide.* *Amended 2026-10-05 (DL-186): `v1.1.6` is the
  architecture work, with no gameplay; when Random Events comes is still the owner's to decide.*
  *Amended 2026-10-07 (DL-214): next after `v1.1.7`, as this list orders it; when it starts is the
  owner's.*
- **After Random Events, in an order chosen at its close:**
  - Scenarios; Campaigns, with the Inciting Event generator beside them (DL-82); Contacts;
    Factions; Scouting and hidden information.
  - Patron visits. The Outing limit comes with the first of Patron visits and scouting, as
    pre-M0 review B1 decided, and applies to every Guild (R4, DL-89).
  - Poaching; Rival encounters during Quests; direct contests between Guilds, a separate later
    feature (DL-89). Guild Battle, the owner's diagram's term, keeps the meaning CONTEXT gives
    it: Rival encounters during Quests and the deferred ending Defeated by a Rival (DL-89).
  - Several Guilds' Parties on one Quest, as a candidate (DL-89).
  - The Guildmaster Trait that sharpens Potential hints (requirements §2, pre-M0 review D9);
    mid-Quest reports, the afternoon reporting a Quest's progress (M4's deferral).
  - Workers; Skill growth; the Guildmaster in a Party; the deferred endings.
  - Patron pictures, drawn on a `patron-portraits` stream, through the portrait tool (DL-135
    item 10).
