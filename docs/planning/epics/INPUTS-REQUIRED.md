# Inputs required from the owner

**Part of:** [the epics](./README.md) · **Baselined:** 2026-09-25

Everything the build needs from you that cannot be read from the design or the code, ordered by
when it is needed. Every row has a default; a row marked **blocking** stops the named story
until you answer, every other row proceeds on its default and can be changed later without
rework. Answer in the milestone's GitHub issue or by editing the **Answer** column here; the
answer is then recorded in `docs/decision-log.md` when the story that uses it starts.

## The headline

**M0 needs five answers and no secrets.** The engine is a pure library with a seeded random
source; nothing before M7 touches a network, an account or a credential. M7 needs one
Cloudflare login, which is interactive and never stored in the repository.

The facts already checked on 2026-09-25 on this machine: Node 26.9.0, npm 11.19.1, Playwright
1.63.0, `gh` authenticated as `talonegg`, no `wrangler` installed, no `.github/`, no
`.gitignore`, no `package.json`.

## 1. Before M0 (blocking for M0)

| # | Input | Why | Default if you say nothing | Answer |
| --- | --- | --- | --- | --- |
| 1.1 | **Node version to pin** | The docs say Node 22; the machine runs 26.9.0. `engines` and `.node-version` must agree with CI | `engines: ">=22"`, `.node-version: 26.9.0`, CI on `26` — the version that will actually run the tests | Default, plus CI on 22 as well so the floor is tested (pre-M0 review A8; ADR-0007 amended) |
| 1.2 | **Build branch and merge policy** | The plan sits on `planv2`; `master` is the default branch and holds v1's history; `dev` and `feature/poc` are v1's | Merge `planv2` to `master` and build on `master` directly, one maintainer, milestone tags on `master`. Branches only for an experiment you may throw away | **`v1.0-dev` is the working branch; milestone completions merge into `v1.0-release`.** Tags land on `v1.0-release`. `v1.0-release` is created from `planv2`'s tip and `v1.0-dev` from it (M0-S0); a milestone completes by merging `v1.0-dev` into `v1.0-release` and tagging that merge |
| 1.3 | **CI provider** | The M0 gate needs somewhere to run `npm test` on push. GitHub Actions gives a private repository 2,000 minutes a month free; unit tests and lint will use a few minutes a week | GitHub Actions, one workflow, on push to `master` and on pull requests; Node from `.node-version`; no Playwright in CI (see 7.10) | Default, retargeted to `v1.0-dev` and `v1.0-release` per 1.2 |
| 1.4 | **Where these planning files live** | You asked for a `planning/epics` folder; v1 kept them at `docs/planning/epics/`, which is where this file is | `docs/planning/epics/`, so all documents stay under `docs/`. Say the word and it is one `git mv` | Default |
| 1.5 | **Package scope** | Workspace packages import each other by name | `@heroesim/engine`, `@heroesim/content`, `@heroesim/harness`, `@heroesim/cli`, `@heroesim/web`, all `private: true`, never published | Default |

## 2. M0 — Skeleton (non-blocking)

| # | Input | Why | Default | Answer |
| --- | --- | --- | --- | --- |
| 2.1 | **Formatter** | v1 had `.editorconfig` and ESLint only | The same: no Prettier. Formatting is not worth a dependency and a hook for one maintainer | |
| 2.2 | **Licence file** | A private repository needs none | None. Add one only if the repository is made public | |
| 2.3 | **Decision log format** | `docs/decision-log.md` starts in M0-S4 | v1's format: `## DL-nn — title`, then Status, Date, Decided by, Context, Decision, Consequences. Append only; supersede, never edit | |
| 2.4 | **Coverage threshold** | Vitest can fail the run under a percentage | None. Coverage is reported, not gated; a gate on a number invites tests that exist for the number | |

## 3. M1 — World State (non-blocking unless marked)

| # | Input | Why | Default | Answer |
| --- | --- | --- | --- | --- |
| 3.1 | **Seed format** | `meta.seed` is a string; the CLI takes it on the command line | Any string; the CLI generates a readable one (`amber-fox-4821`) when none is given, from `Math.random` in the CLI, which is outside the engine | |
| 3.2 | **Turns per year** | `config.turnsPerYear`; data-model.md offers 1,080 (360 Days) | 1,080 | |
| 3.3 | **Starting Roster size and starting Wealth** | The setup the player's Guild is generated from | 4 Heroes, one per Class; 500 Wealth; opening debt is a Scenario concern and deferred | |
| 3.4 | **Rival Guild count and their starting Roster range** | `config.rivalCount`, `config.rivalRosterMin/Max` | 4 Rivals with 4–8 Heroes each | |
| 3.5 | **Hero starting age range** | `config.heroStartingAgeMin/Max` | 18–36 | |
| 3.6 | **Stat range and Potential range** | Base Stats and hidden ceilings per Stat | Stats 1–20 with a Class bias of +2 to +4 on that Class's leading Stats; Potential = base + 3..12 drawn per Stat, capped at 20 | |
| 3.7 | **Unattached pool size** | `config.unattachedPoolSize` | 8, refilled to that size at night from M2 | |
| 3.8 | **Sphere list for Patrons** | Patron flavour and the Quest templates each draws from (`content/spheres.json`) | Six written by the agent: Crown, Church, Merchants, Villages, Scholars, Underworld. Names only; each maps to template tags in M2 | |
| 3.9 | **Name lists and their flavour** | `content/names.json` for Heroes, Guildmasters, Guilds, Patrons | Invented Anglo-Norse-ish lists of ~60 given names per sex, ~60 family names, ~30 Guild names, written by the agent. Say if you want a particular flavour or your own lists | |
| 3.10 | **Backgrounds** | `content/backgrounds.json`, a key and a display name per Hero and per Guild; no effects in the first build | Eight Hero Backgrounds and four Guild Backgrounds, names only, written by the agent | |
| 3.11 | **Starting Skills** | How many Skills a generated Hero has, and at what rating | 1–2 Skills from the Class's gated list, rated 1–2 | |
| 3.12 | **CLI save location** | Local file saves | `.saves/<name>.json`, gitignored; `--save` on every command, default `.saves/current.json` | |
| 3.13 | **Starter Guildmaster Traits** | `traits.json` rows with `owner: "guildmaster"`; drawn at generation in M1-S6, effects applied from M4-S5 (pre-M0 review B2) | Six written by the agent, three buffs and three penalties, e.g. *Old soldier* (+1 Weaponry to Warriors), *Miser* (Upkeep ×0.9, Morale baseline −5); `guildmasterTraitsMin/Max` 0–2 | |

## 4. M2 — The loop (non-blocking)

All of these are `GameConfig` fields. They are the first balance pass's dials; the harness in
M2-S12 measures them and the measured numbers go in the decision log.

| # | Input | Why | Default | Answer |
| --- | --- | --- | --- | --- |
| 4.1 | **Board size and Quest lifetime** | Quests offered each morning and how long an offer stands | Board refilled to 6 each morning; an offer expires after 3 Days | |
| 4.2 | **Quest duration and reward ranges** | Per template; templates carry ranges, difficulty scales both | 2–10 Days; reward 40–400 Wealth by difficulty; Fame ±1 to ±5 | |
| 4.3 | **Difficulty scale and the stub's outcome bands** | The stub scores the Party's weighted Stats against difficulty | Difficulty 10–100. Score ÷ difficulty: below 0.8 fail, 0.8–1.2 success, above 1.2 strong success | |
| 4.4 | **Harm rates in the stub** | Injury and Death chance by outcome band | Fail: 40% one Hero injured, 5% one Hero dies. Success: 10% injured. Strong success: none | |
| 4.5 | **Injury heal time and infirmary factor** | `injuryHealDaysMin/Max`, `infirmaryHealFactor` per grade | 5–30 Days by type; infirmary grade 1 halves, grade 2 thirds | |
| 4.6 | **Upkeep** | Wage per Hero per Level and Hall maintenance, paid every N Days | 5 Wealth per Hero per Level plus 10 per Hall grade, every 10 Days | |
| 4.7 | **Signing fee formula** | Recruit from the Unattached pool | 50 + 25 × Level + sum of Stats ÷ 4 | |
| 4.8 | **Morale scale and drift** | Morale is a number; drift at night toward a baseline | 0–100, baseline 60, drift ±1 per night; −10 on a Death in the Roster; +5 on a strong success | |
| 4.9 | **Bankruptcy floor and grace** | `bankruptcyFloor`, `bankruptcyGraceDays` | Wealth below 0 for 30 Days | |
| 4.10 | **Guildmaster Retirement age** | Ends the game | 65, with the Guildmaster starting at 30–45 | |
| 4.11 | **Hero Retirement** | Likelier with age and injury | From 45, 2% per year past it, doubled while injured, checked at night once a year | |
| 4.12 | **Rival trivial disposition** | Name and rule for M2's one disposition | `steady`: take the easiest Quest it can staff; recruit the cheapest Hero when Wealth exceeds three Upkeeps | |
| 4.13 | **Harness env flag, seeds and years** | The harness runs under Vitest behind a flag | `HEROESIM_HARNESS=1`; 200 seeds × 20 years for the per-milestone run, 1,000 × 20 for the tagged run | |
| 4.14 | **Automatic policy** | What the harness's player does | Dispatch the strongest available Party of the required size to the highest-reward Quest it can staff; recruit when Wealth exceeds three Upkeeps and the Roster is below 8; never transfer (until M6) | |

## 5. M3 — Progression (non-blocking)

| # | Input | Why | Default | Answer |
| --- | --- | --- | --- | --- |
| 5.1 | **XP per Quest and per training Day** | `xpPerDifficultyPoint`, `xpPerTrainingDay` | 1 XP per difficulty point on success, half on failure; 2 XP per Day in the training yard per grade | |
| 5.2 | **Level curve and cap** | XP to next Level | 100 × Level² ; cap 20 | |
| 5.3 | **Growth profile shape** | Per Class in content: how many Stat points per Level and where | 3 points per Level, weighted 2:1 toward the Class's leading Stats, never past Potential | |
| 5.4 | **Potential hint** | What the front end shows | One of three words per Stat — "modest", "promising", "exceptional" — from the gap between base and Potential | |
| 5.5 | **Ageing decline** | From what age and how fast | From 40, −1 to one Physical Stat per year, drawn from the `heroes` stream | |
| 5.6 | **Fame required to sign a Hero** | `fameRequiredPerLevel`; a pool Hero refuses a Guild whose Fame is below it × (their Level − 1) (R10 as amended, pre-M0 review B4) | 10: a fresh Guild at Fame 0 signs Level 1 Heroes only and needs Fame 40 for a Level 5 | |

## 6. M4 — Quest Engine (non-blocking)

| # | Input | Why | Default | Answer |
| --- | --- | --- | --- | --- |
| 6.1 | **Encounters per Quest** | Template carries a sequence; count by difficulty | 2–5 | |
| 6.2 | **Check model** | How a check resolves | Party's best (or summed, per encounter type) weighted Stats plus Skill rating × 2 plus Synergy bonus, against the encounter's difficulty, with a `quests`-stream roll of ±20% | |
| 6.3 | **Relationship effect** | Teamwork scalar from mean pairwise Relationship | ×0.9 to ×1.1 across the Relationship range | |
| 6.4 | **Starter Synergies** | `content/synergies.json` | Six written by the agent: e.g. Warrior + Healer, Rogue + Mage, three Warriors | |
| 6.5 | **Guildmaster Negotiation effect** | Reward modifier on accepting a Quest | ±10% across the Negotiation range | |

## 7. M5 — Items, M6 — Rivals, M7 — Web (non-blocking unless marked)

| # | Input | Why | Default | Answer |
| --- | --- | --- | --- | --- |
| 7.1 | **Gear slots** | Per Hero | Three: weapon, armour, trinket | |
| 7.2 | **Market size, sell ratio, refresh** | Market rules | 10 stacks, sell at 50% of buy, refreshed each morning from the `market` stream | |
| 7.3 | **Hall Improvement grades and costs** (open item in requirements §5) — needed in **M3-S6**, not M5 (pre-M0 review D8) | `content/improvements.json` | Three grades per facility: 200 / 500 / 1,000 Wealth | |
| 7.4 | **Loot weighting** | How Loot scales with difficulty | Loot on strong success only; table chosen by difficulty band | |
| 7.5 | **Rival disposition names** (open item in requirements §5) | `content/dispositions.json` | Four: `steady`, `ambitious`, `miserly`, `reckless` | |
| 7.6 | **Transfer fee and Morale cost** | Both directions | 2 × signing fee; −15 Morale to Heroes whose Regard for the transferred Hero is high | |
| 7.7 | **Web framework** | v1 used Vite + React, proven | Vite + React again. Say if you want something lighter; the engine does not care | |
| 7.8 | **Cloudflare Pages project name** — **blocking for M7-S5** | `wrangler pages deploy --project-name` | `heroesim`, production branch `master`, at `https://heroesim.pages.dev` if free | **`heroesims`**, production branch `v1.0-release` (per 1.2), at `https://heroesims.pages.dev` |
| 7.9 | **How the deploy authenticates** — **blocking for M7-S5** | Local deploy needs `wrangler login` once, interactive, on this machine; CI deploy needs two repository secrets | Local deploy, as v1 did (DL-30): `npx wrangler login` once, no secrets anywhere. Only if you want CI to deploy: `CLOUDFLARE_API_TOKEN` (Pages: Edit) and `CLOUDFLARE_ACCOUNT_ID` as GitHub Actions secrets, never in the repository | Default: local `npx wrangler login`, no secrets |
| 7.10 | **Playwright in CI** | Installing browsers costs minutes on every run | No: Playwright runs locally before a tag; CI runs unit tests and lint | |

## 8. M8 — Modules (non-blocking)

| # | Input | Why | Default | Answer |
| --- | --- | --- | --- | --- |
| 8.1 | — | Random Events moved after the first build (pre-M0 review A5, owner, 2026-09-25); M8 proves the contract with a test-only probe module and needs no input | | |

## 9. Environment variables, in one place

None are needed before M7, and none are read by the engine, ever.

| Variable | Read by | Needed when | Where it lives |
| --- | --- | --- | --- |
| `HEROESIM_HARNESS` | `harness/` Vitest project | Running the harness (M1 on) | Shell, or `npm run harness` sets it |
| `HEROESIM_SEEDS` | `harness/` | Optional seed count for a harness run (default 1,000; M1-S10) | Shell |
| `HEROESIM_VALIDATE` | `harness/` | Run the validator after every `advance` in a harness run (M2-S12) | Shell |
| `HEROESIM_MODULES` | `harness/` | Comma-separated module ids to install for a harness run (M8-S3) | Shell |
| `HEROESIM_SAVE_DIR` | `cli/` | Optional override of `.saves/` | Shell |
| `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` | `wrangler` | Only if 7.9 chooses CI deploy | GitHub Actions secrets; never a file in the repository |

Nothing else. If a story finds it needs a variable, it is added here first.
