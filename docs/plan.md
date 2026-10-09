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

A release's close adds its row here and fills its epic's Status line, and nothing else records it.

## 3. Next

What comes next, in order. Releases already made are §2's ledger. The record of how this list came
to its order is in [`planning/archive/`](./planning/archive/README.md).

- **Now: `v1.1.9`, the tests and the harness made faster and leaner**, on `v1.1.9-dev`
  ([epic](./planning/epics/v1.1.9-release.md)): planned (DL-231), no story started.
- **Next: chosen after `v1.1.9` is released**, among Random Events and the lists below (DL-228).
- **Random Events** (#12; its groundwork #15 and #17) will be the first real module, but is not
  necessarily the next epic: when it starts is the owner's (DL-214, DL-228). Random Events never
  produce Quests (DL-82).
  Its epic opens with a table of the owner's inputs, as the first build's `INPUTS-REQUIRED.md` §8
  asked: rows an agent drafts, each a question with a default and the owner's answer. Three of them
  block the build story until the owner answers: the catalogue of events, their rate, and whom they
  befall. DL-82 already answers some of it. Random Events befall the player's Guild only, and the
  harness reports their effects on that Guild alone. Morale's band edges are among their inputs.
  An agent proposes the harness's acceptance bands, and the owner approves them before the run.
  When their installation lands, the probe module leaves the public page.
- **Other features, in an order chosen as each release closes:**
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
- **In the backlog, their place to be decided:**
  - The economy pass (#51): the late Bankruptcies, the DL-83 targets, the wage's shape, Rival
    income, the form factors, and the Market's size and draws by slot (DL-168 items 2, 9 and 12),
    deferred by the owner after other balances and features (DL-182).
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
