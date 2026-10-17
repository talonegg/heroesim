# Heroesim — delivery plan

How the game is delivered from here: in releases, each a line of §2's ledger, in the order §3 gives.
What is being built is in [`requirements.md`](./requirements.md); why it is shaped this way is in
[`principles.md`](./principles.md); the vocabulary is [`../CONTEXT.md`](../CONTEXT.md). How a story
and a release are run, step by step, is [`agents/delivery.md`](./agents/delivery.md).

## 1. How delivery works

**Background: the first build.** The game was first built in nine milestones, M0 Skeleton to M8
Modules, each a run of session-sized increments ending in passing tests, a harness run and a CLI
command. The owner settled its order on 2026-09-25 (DL-01 to DL-10). It was completed on
2026-09-28 at `m8-modules` and released as `v1.0.0` (DL-81, DL-86). Two of its orders still shape
the work: Rivals play from the loop, so no rule is tuned against an uncontested Board (ADR-0002, whose
accepted exceptions are listed there), and modules plug into a settled Turn pipeline (ADR-0005). Its
plan, milestones and increments are archived in
[`planning/archive/first-build-plan.md`](./planning/archive/first-build-plan.md), beside its epics
and the owner's inputs.

**Versions.** A release is `v<major>.<minor>.<patch>`.

| Unit | What it is | Example |
| --- | --- | --- |
| A line, `v1.N` | A run of releases with one theme; a new line opens when a release changes what the game is | `v1.1`, the page redesigned and the patches after it |
| A release, `v1.N.P` | The increment: one epic, built on its own dev branch, closed, released to `main` and recorded | `v1.1.7`, then `v1.1.8` |
| A story, `v1.N.P-Sk` | The sub-increment: a session or two, test first, recorded in a DL entry and verified | `v1.1.8-S3` |

**A release, one after another.** `v1.1.N` is followed by `v1.1.N+1` until a release opens the next
line, whose first release is `v1.2.0`, and so on: `v1.2.0`, `v1.2.1`, … then `v1.3.0`. Each release:
- is planned as an epic in [`planning/epics/`](./planning/epics/README.md), from the owner's
  answers, with a Gate it must meet;
- is built on `v<line>.<patch>-dev`, cut from the previous release's record on the owner's word;
- leaves working software: every check passing, and play proved by the harness's `gate` where it could
  move, or by `neutral --expect` where it cannot;
- is released through `v<line>-release` as a pull request to `main`, which is production; the owner's
  merge tags it and deploys it to both addresses (DL-124, [`deploy.md`](./deploy.md));
- is recorded once, as a row of §2's ledger and its epic's Status line, after which its epic and its
  DL entries are archived.

**Tracked by release alone** (DL-228). Delivery is named and tracked by release number,
`v<major>.<minor>.<patch>`, and by story within it. No milestone number (`M<n>`) or milestone tag is
given to future work, in an epic, a branch, a tag, a harness report or a DL entry; those of the first
build and M9 stay in the record. A feature larger than one release is planned as several releases,
each its own epic. Whether a feature is a module or a change to the core is decided per feature, in
its epic (DL-89). A major version, `v2`, is not planned.

## 2. Releases

The release ledger: each release's one record, written at its close. The epics are in
[`planning/archive/`](./planning/archive/README.md), the decisions in
[`decisions/index.md`](./decisions/index.md). The `v1.0` line is frozen and never deployed again
(DL-86, DL-109).

| Release | Date | Pull request | Merge commit | Decisions | Epic |
| --- | --- | --- | --- | --- | --- |
| `v1.0.0` | 2026-09-28 | — | `70508c6`, into `v1.0-release` | DL-01 to DL-85 | [M0](./planning/archive/M0-skeleton.md) to [M8](./planning/archive/M8-modules.md) |
| `v1.0.1` | 2026-09-28 | — | `5b0d66e`, into `v1.0-release` | DL-86 to DL-98 | [v1.0.1](./planning/archive/v1.0.1-release.md) |
| `v1.1.0` | 2026-09-30 | — | `4ec857f`, into `v1.1-release` | DL-99 to DL-123 | [M9](./planning/archive/M9-redesign.md), [its follow-on](./planning/archive/M9-feedback.md) |
| `v1.1.1` | 2026-09-30 | #42 | `a1b4178` | DL-124 | None: the release flow, no play changed |
| `v1.1.2` | 2026-10-01 | #45 | `800a402` | DL-125 to DL-133, DL-137 | [v1.1.2](./planning/archive/v1.1.2-release.md) |
| `v1.1.3` | 2026-10-02 | #47 | `18ab6a6` | DL-134 to DL-147 but DL-137 | [v1.1.3](./planning/archive/v1.1.3-release.md) |
| `v1.1.4` | 2026-10-03 | #50 | `75ee77f` | DL-148 to DL-167 | [v1.1.4](./planning/archive/v1.1.4-release.md) |
| `v1.1.5` | 2026-10-04 | #54 | `8bca6b9` | DL-168 to DL-185 | [v1.1.5](./planning/archive/v1.1.5-release.md) |
| `v1.1.6` | 2026-10-06 | #56 | `7fda66e` | DL-186 to DL-205 | [v1.1.6](./planning/archive/v1.1.6-release.md) |
| `v1.1.7` | 2026-10-07 | #58 | `25f8fa0` | DL-206 to DL-214 | [v1.1.7](./planning/archive/v1.1.7-release.md) |
| `v1.1.8` | 2026-10-09 | #59 | `10f17aa` | DL-215 to DL-230 | [v1.1.8](./planning/archive/v1.1.8-release.md) |
| `v1.1.9` | 2026-10-10 | #60 | `4fa8d0e` | DL-231 to DL-254 | [v1.1.9](./planning/archive/v1.1.9-release.md) |
| `v1.2.0` | 2026-10-11 | #63 | `9fdb0a8` | DL-257 to DL-278 | [v1.2.0](./planning/archive/v1.2.0-release.md); its live check failed on Pages, on Cloudflare's beacon (DL-278), allowed from `v1.2.1` (DL-279) |
| `v1.2.1` | 2026-10-12 | #66 | `72d14e9` | DL-279 to DL-293 | [v1.2.1](./planning/archive/v1.2.1-release.md); released as is, its economy broken since S4 and its closing Gate failing the save line (DL-292, DL-293) |
| `v1.2.2` | 2026-10-16 | #68 | `a7c644a` | DL-294 to DL-310 | [v1.2.2](./planning/archive/v1.2.2-release.md); its closing Gate failing the save line only, no game lasting 20 years (DL-305); the live check left CI (DL-309) |

A release's close adds its row here and fills its epic's Status line, and nothing else records it.

## 3. Next

What comes next, in order. Releases already made are §2's ledger. The record of how this list came
to its order is in [`planning/archive/`](./planning/archive/README.md).

The `v1.2` line builds the [Guild Management Design](./management-design.md) (DL-256): first choices
that cost something, then the management core, then reputation and legacy. Each release is its own
epic. It opens with a table of the owner's inputs (its numbers, each a question with an agent's
default, as the first build's `INPUTS-REQUIRED.md` §8 asked), names the design's sentence it aims at,
and closes with the owner's playtest ([`agents/delivery.md`](./agents/delivery.md)). The economy is
redesigned in `v1.2.2` and `v1.2.3` and tuned in `v1.2.4`, its pass (#51; DL-294).

- **Now: [`v1.2.3`, Contracts](./planning/epics/v1.2.3-release.md)** (DL-294 item 6), on
  `v1.2.3-dev`, cut from `v1.2.2`'s record, S1 to S9 built and verified (DL-314 to DL-323), the
  close's review, checks and Gate recorded (DL-324), S11 built on the owner's ruling (DL-325), its
  verification, the Gate again, the owner's playtest and the release to come: a Contract on every Hero, its wage set at signing and its length chosen;
  renewal, release with a payout, fee-0 Offers for expired Heroes, and the Transfer fee from the
  wages left; the Rivals and the harness's policy deciding renewals (#20). It takes in #51's wage. `v1.2.2`, Coin and the Hall, was released (§2): Wealth in whole Silver, the
  Hall's Facilities as content, its upkeep every 30 Days apart from the wages every 10, one Upkeep a
  month of costs, the surplus sold and the Treasury's lines; its close's costs against `v1.2.1`'s are
  in [the outcomes](./planning/epics/gate-outcomes-monitoring.md), and every one of the player's games
  is still bankrupt before 20 years (DL-305).
- **Short term: the economy, then choices that cost something.**
  1. [`v1.2.4`, the economy pass](./planning/epics/v1.2.4-release.md) (#51), planned, deferred by
     the owner (DL-293) and placed here by DL-294: Guilds that can live with `v1.2.1`'s Fatigue and
     form and the redesign's rules, each setting changed measured alone in a full Gate against the
     bands the owner approves first and [the outcomes](./planning/epics/gate-outcomes-monitoring.md).
     It restores the player's solvency (bankrupt in every game at `v1.2.1`, none at `v1.2.0`), the
     Rivals' failed Quests (22.3% against 5.6%), their recruiting (2.56 Heroes a game against 85.6)
     and their folds (10.94 a game against DL-83's 1.5 to 3.5), and games that reach 20 years, so
     that the save is measured there; then Fatigue's tuning to DL-290's bands (DL-292).
  2. `v1.2.5`, Rivals who compete, and Fame raising the stakes. It takes in #21, the rest of #25 (gear
     upgraded) and #51's Rival income.
- **Medium term: the management core,** in this order:
  - Development: the Training focus, Skill growth, and Decline lowering Potential (#29, #35).
  - Scouting and a deeper Unattached pool: Heroes of every age and Level, and hidden information.
    The Outing limit comes with scouting and applies to every Guild (R4, pre-M0 review
    B1, DL-89). It takes in the Guildmaster Trait that sharpens Potential hints (requirements §2,
    pre-M0 review D9; #31), #24 and #49.
  - Ambitions and Career stages.
  - Relationships that can sour (#26).
  - A Party smaller than its template's floor, sent at a greater difficulty or cost (DL-257).
  - Unique Items as a rare drop of the hardest Tiers (DL-257).
  - Poaching (#27), then Mentors.
  - Career statistics and the Rankings' history.
- **Long term: reputation and legacy.**
  - Private offers, growing with Fame, and Reputation by Sphere. Patron visits, the second kind of
    Outing. Hostile Patrons refusing a Guild (#28).
  - The Legacy review, then the Aim chosen at setup, then the Guild's culture named.
  - **Random Events** (#12; its groundwork #15 and #17), the first real module (DL-228), its
    catalogue drawn from the systems above (DL-256). Random Events never produce Quests (DL-82).
    Its epic's inputs table has three rows that block the build story until the owner answers: the
    catalogue of events, their rate, and whom they befall. DL-82 already answers some of it. Random
    Events befall the player's Guild only, and the harness reports their effects on that Guild alone.
    Morale's band edges are among their inputs. An agent proposes the harness's acceptance bands,
    and the owner approves them before the run. When their installation lands, the probe module
    leaves the public page.
  - Workers, a retiring Hero kept on in a post, and the Hall's grades 4 to 6 as late-game Wealth
    sinks (#23, DL-83), content rows once Facilities are content (`v1.2.2`).
  - The economy's later lines (DL-294 item 8): negotiation of wages, Contract lengths and sale prices,
    by what each Hero wants and more factors behind a Guildmaster's preferred length; the wage read
    from a Hero's and the Guild's reputation, personality, Regard and comparable teammates' wages;
    competing bids for an Unattached Hero, weighed by signing fee, wage and Regard; a Guildmaster's
    premium on a Hero; Rivals renewing early; a Hero rejecting an Offer made for them (the owner,
    `v1.2.3`'s Q-G); a choosable starting Hall, with its bonuses and base upkeep; selling Hall
    assets; patronage by Sphere; investments, gambling, and Random and Inciting Events as income or
    cost; borrowing and debt; Campaigns and Scenarios with economic stakes.
  - Scenarios; Campaigns, with the Inciting Event generator beside them (DL-82); Contacts;
    Factions; Loot's content (#36).
  - Rival encounters during Quests; direct contests between Guilds, a separate later feature
    (DL-89). Guild Battle, the owner's diagram's term, keeps the meaning CONTEXT gives it: Rival
    encounters during Quests and the deferred ending Defeated by a Rival (DL-89).
  - Several Guilds' Parties on one Quest, as a candidate (DL-89).
  - Mid-Quest reports, the afternoon reporting a Quest's progress (M4's deferral); the Guildmaster
    in a Party; the deferred endings.
  - Patron pictures, drawn on a `patron-portraits` stream, through the portrait tool (DL-135
    item 10).
- **Alongside, their place decided as each release closes:**
  - The targets reset and tuned against, once more of the line is built (DL-257): DL-83's bands as
    restated; #51's Quests' volume, Wealth and the Market's size or draws by slot (DL-168 items 9 and
    12); #22's strong-success premium; the Death band (DL-256 item 10); the Tiers' factors, the
    Board's growth and the Fame minimums; the Rivals' Rosters and Wealth, a Rival hiring with no
    Roster cap while its Wealth exceeds its Disposition's `recruitThreshold` Upkeeps (R1, DL-270,
    DL-274).
  - Taken into the release that touches their code: #16, #41, #46 and #52.
  - A Healer's relief of the hurt growing with their Field surgery rating, with the Development
    release's Skill growth (DL-280).
  - The Transfer Generator's Roster bound removed: its own bids keep a Rival's Roster at or below
    `rivalRosterMax` (DL-59), kept only as a development measure to constrain testing load
    (DL-185).
  - The History's size and the save's compression: after 20 years the History holds about 265,000
    entries a game and the save about 141 million characters, 17.5 MiB gzipped (DL-211). The Gate
    holds the gzipped mean under 30 MiB (DL-186 item 31, DL-188).
  - Saves (#33): the CLI's saves gzipped, as the page's are, and a content change recorded on load,
    a `world.content-changed` Milestone with `meta.content` updated (DL-84 items 2 and 5).
  - A Hero's page showing a Stat's sources, as the Roster's tooltip does (DL-186 item 31).
  - The weighted draws updated: a deal at creation that keeps to the weights' proportions when
    they are not all 1 (DL-210's review).
  - Morale-aware estimating: the game's chance estimate following each Encounter's Morale
    consequences into the form of the Encounters after it, an engine change that moves play, so that
    the estimate probe's Morale-in limit can return to 3 points from 5 (DL-275).
