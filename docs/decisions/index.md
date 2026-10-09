# Decision index

Every entry of the decision log: its date, its title cut short, what later entries superseded of it
and the file that holds it (DL-215). An item superseded in full is a one-line stub in its entry, its
text in [`archive/superseded/`](archive/superseded/); an item superseded in part keeps its text and
carries a note. To read an entry, open its file and find `## DL-nn `.

Made by `npm run decisions -- index` from the entries' headings; never edited by hand. `npm test`
fails when it is stale, or when a `DL-nn` cited anywhere in the repository is no entry.

| Entry | Date | Title | Superseded | File |
|---|---|---|---|---|
| DL-01 | 2026-09-25 | Session-sized increments grouped into milestones |  | [DL-001-085-first-build](archive/DL-001-085-first-build.md) |
| DL-02 | 2026-09-25 | Harness and a thin CLI from M1 are the bar for working software |  | [DL-001-085-first-build](archive/DL-001-085-first-build.md) |
| DL-03 | 2026-09-25 | Rivals act from M2 with one trivial disposition |  | [DL-001-085-first-build](archive/DL-001-085-first-build.md) |
| DL-04 | 2026-09-25 | Module contract last in the first build |  | [DL-001-085-first-build](archive/DL-001-085-first-build.md) |
| DL-05 | 2026-09-25 | Progression before the Quest Engine before Items before Rivals |  | [DL-001-085-first-build](archive/DL-001-085-first-build.md) |
| DL-06 | 2026-09-25 | The stub Quest Engine scores weighted Stat demands carried on the Quest template |  | [DL-001-085-first-build](archive/DL-001-085-first-build.md) |
| DL-07 | 2026-09-25 | `content/` exists from M1, not extracted later |  | [DL-001-085-first-build](archive/DL-001-085-first-build.md) |
| DL-08 | 2026-09-25 | No timeboxed spikes; measures recorded in the first milestone that can take them |  | [DL-001-085-first-build](archive/DL-001-085-first-build.md) |
| DL-09 | 2026-09-25 | One GitHub issue per milestone, opened lazily; git tag per milestone |  | [DL-001-085-first-build](archive/DL-001-085-first-build.md) |
| DL-10 | 2026-09-25 | Cloudflare Pages deploy is part of M7's done |  | [DL-001-085-first-build](archive/DL-001-085-first-build.md) |
| DL-11 | 2026-09-26 | CI proved to fail on a boundary break |  | [DL-001-085-first-build](archive/DL-001-085-first-build.md) |
| DL-12 | 2026-09-26 | Random streams are xoshiro128\*\* seeded by cyrb128 of `seed:name` |  | [DL-001-085-first-build](archive/DL-001-085-first-build.md) |
| DL-13 | 2026-09-26 | Determinism measured: 1,000 worlds, each created twice, are byte-identical |  | [DL-001-085-first-build](archive/DL-001-085-first-build.md) |
| DL-14 | 2026-09-26 | Toolchain pins and boundary-rule choices made in M0-S1/S2 |  | [DL-001-085-first-build](archive/DL-001-085-first-build.md) |
| DL-15 | 2026-09-26 | Corrections to two transcriptions in this log |  | [DL-001-085-first-build](archive/DL-001-085-first-build.md) |
| DL-16 | 2026-09-26 | Engine lint forbids performance, crypto, process, timers, the global object and dynamic import |  | [DL-001-085-first-build](archive/DL-001-085-first-build.md) |
| DL-17 | 2026-09-26 | Content file layout, schema refusals and the first content values (M1-S4) | item 6 in part by DL-84 | [DL-001-085-first-build](archive/DL-001-085-first-build.md) |
| DL-18 | 2026-09-26 | The History's range bounds and paging, what `append` checks, and no freezing |  | [DL-001-085-first-build](archive/DL-001-085-first-build.md) |
| DL-19 | 2026-09-26 | Generator signatures, draw order and the starting world's defaults (M1-S5, M1-S6) |  | [DL-001-085-first-build](archive/DL-001-085-first-build.md) |
| DL-20 | 2026-09-26 | What the validator checks beyond §6's table, and how a save is written and read |  | [DL-001-085-first-build](archive/DL-001-085-first-build.md) |
| DL-21 | 2026-09-26 | The CLI's command line, save files, and the selectors it reads through (M1-S9) |  | [DL-001-085-first-build](archive/DL-001-085-first-build.md) |
| DL-22 | 2026-09-26 | One fixture module for the engine's tests |  | [DL-001-085-first-build](archive/DL-001-085-first-build.md) |
| DL-23 | 2026-09-26 | M1 verification corrections |  | [DL-001-085-first-build](archive/DL-001-085-first-build.md) |
| DL-24 | 2026-09-26 | `advance`, the Turn pipeline, `emit`, actions and `rebase` (M2-S1, M2-S2) | item 1 in part by DL-206 | [DL-001-085-first-build](archive/DL-001-085-first-build.md) |
| DL-25 | 2026-09-26 | Quest templates, the Board and its first draw, streams for old saves, and dispatch (M2-S3, M2-S4) |  | [DL-001-085-first-build](archive/DL-001-085-first-build.md) |
| DL-26 | 2026-09-26 | Which Day is an Upkeep Day, and what the Guild State Engine leaves silent (M2-S7) | item 3 in part by DL-85 | [DL-001-085-first-build](archive/DL-001-085-first-build.md) |
| DL-27 | 2026-09-26 | Recruitment, the signing fee, and the Unattached pool's lifecycle (M2-S8) | item 3 in part by DL-211 | [DL-001-085-first-build](archive/DL-001-085-first-build.md) |
| DL-28 | 2026-09-26 | Endings: the checks, what a fold does, the replacement Rival, and Rankings pulled forward (M2-S10) | item 1 in part by DL-83; item 3 in part by DL-54; item 10 in part by DL-113 | [DL-001-085-first-build](archive/DL-001-085-first-build.md) |
| DL-29 | 2026-09-26 | The stub Quest Engine, Injury types, Morale bands and the Hero State Engine (M2-S5, M2-S6) | item 4 in part by DL-85 | [DL-001-085-first-build](archive/DL-001-085-first-build.md) |
| DL-30 | 2026-09-26 | The `steady` Disposition, and a Rival acting through the player's actions (M2-S9) | item 4 in part by DL-56; item 7 in part by DL-56 | [DL-001-085-first-build](archive/DL-001-085-first-build.md) |
| DL-31 | 2026-09-26 | Merging M2-S9 with M2-S10: `dispatch` refuses a folded Guild, and the endings' tests still the … |  | [DL-001-085-first-build](archive/DL-001-085-first-build.md) |
| DL-32 | 2026-09-26 | Merging M2-S5/S6 with M2-S9/S10: the content version and stream list DL-29 named |  | [DL-001-085-first-build](archive/DL-001-085-first-build.md) |
| DL-33 | 2026-09-26 | Fast forward: always-on and opt-in stops, the watched Guild, and the CLI's `--until` (M2-S11) |  | [DL-001-085-first-build](archive/DL-001-085-first-build.md) |
| DL-34 | 2026-09-26 | The automatic policy, the play sweep, validating from where the last validation stopped, and the M2 … | in part by DL-39 | [DL-001-085-first-build](archive/DL-001-085-first-build.md) |
| DL-35 | 2026-09-26 | The first balance pass: the stub's bands, the wage, and how much a Rival keeps before it recruits … |  | [DL-001-085-first-build](archive/DL-001-085-first-build.md) |
| DL-36 | 2026-09-26 | XP, Levels and growth; Quest XP and the training yard; the wage for Levels (M3-S1, M3-S2) |  | [DL-001-085-first-build](archive/DL-001-085-first-build.md) |
| DL-37 | 2026-09-26 | Potential hints, and the yearly ageing decline beside the Retirement check (M3-S3, M3-S4) | item 9 in part by DL-83 | [DL-001-085-first-build](archive/DL-001-085-first-build.md) |
| DL-38 | 2026-09-26 | Rankings are read, not narrated; Fame gates who will sign; Hall Improvements are built (M3-S5 … |  | [DL-001-085-first-build](archive/DL-001-085-first-build.md) |
| DL-39 | 2026-09-26 | M2 close: verification, the timing tests, and which harness run a tag carries |  | [DL-001-085-first-build](archive/DL-001-085-first-build.md) |
| DL-40 | 2026-09-26 | M3 close: the M3 counters, what they read, and the M3 run |  | [DL-001-085-first-build](archive/DL-001-085-first-build.md) |
| DL-41 | 2026-09-26 | M3's balance pass: a Rival keeps sixty Upkeeps before it recruits; the wage for Levels stays 20 |  | [DL-001-085-first-build](archive/DL-001-085-first-build.md) |
| DL-42 | 2026-09-26 | Encounters, the drawn sequence, the Check and its two seams, and the Quest Engine's balance (M4-S1 … | item 9 in part by DL-44; in part by DL-70 | [DL-001-085-first-build](archive/DL-001-085-first-build.md) |
| DL-43 | 2026-09-26 | Requirements by reason, Patron Regard and the Board, the Guildmaster's Stats and Traits, and … | item 7 in part by DL-85; item 8 in part by DL-87 | [DL-001-085-first-build](archive/DL-001-085-first-build.md) |
| DL-44 | 2026-09-26 | Merging M4-S2's Quest Engine with M4-S5's Guildmaster rules: one effective Stats selector, content … |  | [DL-001-085-first-build](archive/DL-001-085-first-build.md) |
| DL-45 | 2026-09-26 | Synergies: the row, the match, how a bonus combines, the Quest's record and the preview (M4-S3) |  | [DL-001-085-first-build](archive/DL-001-085-first-build.md) |
| DL-46 | 2026-09-26 | Regard between Heroes: its writer, its decay and the dead; Relationship; the teamwork scalar (M4-S4) | item 9 in part by DL-82 | [DL-001-085-first-build](archive/DL-001-085-first-build.md) |
| DL-47 | 2026-09-26 | Merging M3's close into M4: both version-4 defaults kept, `configVersion` 5 |  | [DL-001-085-first-build](archive/DL-001-085-first-build.md) |
| DL-48 | 2026-09-26 | Item definitions, one holder type, and the primitives that keep one stack per holder (M5-S1) | item 2 in part by DL-49; in part by DL-49 | [DL-001-085-first-build](archive/DL-001-085-first-build.md) |
| DL-49 | 2026-09-26 | Equip and unequip, gear in effective Stats, gear going back to its Guild, and the controllers … | item 7 in part by DL-54 | [DL-001-085-first-build](archive/DL-001-085-first-build.md) |
| DL-50 | 2026-09-26 | Consumables carried at dispatch, used by the Quest Engine, expended or sent home (M5-S3) |  | [DL-001-085-first-build](archive/DL-001-085-first-build.md) |
| DL-51 | 2026-09-26 | The Market: its morning refresh, its prices, `buy` and `sell`, a folding Guild's Items, and the … | item 6 in part by DL-54; item 8 in part by DL-58 | [DL-001-085-first-build](archive/DL-001-085-first-build.md) |
| DL-52 | 2026-09-26 | Loot: the tables, where the threshold is applied, the draw, and one of each unique Item (M5-S5) |  | [DL-001-085-first-build](archive/DL-001-085-first-build.md) |
| DL-53 | 2026-09-26 | M3 verification corrections: the infirmary's third grade does something; the CLI refuses actions … |  | [DL-001-085-first-build](archive/DL-001-085-first-build.md) |
| DL-54 | 2026-09-26 | Merging M5: the fold in one order, the policy's order, and an empty Market where a test is not … | item 3 in part by DL-58 | [DL-001-085-first-build](archive/DL-001-085-first-build.md) |
| DL-55 | 2026-09-26 | M4 close: M3's verification merged (`configVersion` 6), the M4 counters, and the M4 run |  | [DL-001-085-first-build](archive/DL-001-085-first-build.md) |
| DL-56 | 2026-09-26 | Named Dispositions: four rows of weights, one rule, a round-robin deal, and a replacement that … | item 4 in part by DL-69 | [DL-001-085-first-build](archive/DL-001-085-first-build.md) |
| DL-57 | 2026-09-26 | Transfers: one fee core, consent as a controller's choice, what a Transfer does, Rivals' deals and … | item 3 in part by DL-83 | [DL-001-085-first-build](archive/DL-001-085-first-build.md) |
| DL-58 | 2026-09-26 | Rivals build every facility and buy gear, armour first; one gear-buying rule with the policy … |  | [DL-001-085-first-build](archive/DL-001-085-first-build.md) |
| DL-59 | 2026-09-26 | The Transfer Generator: its night, one draw a pair, the bidder and its bid, the generation range … |  | [DL-001-085-first-build](archive/DL-001-085-first-build.md) |
| DL-60 | 2026-09-27 | M6 verification: a Rival below `rivalRosterMin` hires by need, a Transfer holds its Hero for … |  | [DL-001-085-first-build](archive/DL-001-085-first-build.md) |
| DL-61 | 2026-09-26 | Merging the main line's M4 close into M5: `configVersion` 7, content version 11 |  | [DL-001-085-first-build](archive/DL-001-085-first-build.md) |
| DL-62 | 2026-09-26 | M5 close: the M5 counters, the policy's consumables, Loot for hard Quests (`configVersion` 8 … |  | [DL-001-085-first-build](archive/DL-001-085-first-build.md) |
| DL-63 | 2026-09-27 | Merging the main line's M5 close into M6: `configVersion` 9, content version 13, schema version 3 |  | [DL-001-085-first-build](archive/DL-001-085-first-build.md) |
| DL-64 | 2026-09-26 | The web workspace: its pins, a build that opens from the filesystem, the bundle gate and what it … | item 4 by DL-152; item 5 in part by DL-74 | [DL-001-085-first-build](archive/DL-001-085-first-build.md) |
| DL-65 | 2026-09-27 | The web's one reducer: a play accepted then settled, the engine never run inside React's reducer … |  | [DL-001-085-first-build](archive/DL-001-085-first-build.md) |
| DL-66 | 2026-09-27 | The web's views, part 1: one column, the engine's dispatch preview, the front end's own narration … | item 1 in part by DL-99; item 6 in part by DL-99 | [DL-001-085-first-build](archive/DL-001-085-first-build.md) |
| DL-67 | 2026-09-27 | Saves kept in the browser: gzip in IndexedDB, one path from a save's text to the game, the … |  | [DL-001-085-first-build](archive/DL-001-085-first-build.md) |
| DL-68 | 2026-09-27 | The deploy, prepared: one command from this machine, wrangler fetched when it runs, and a test that … | in part by DL-122; item 1 in part by DL-88 | [DL-001-085-first-build](archive/DL-001-085-first-build.md) |
| DL-69 | 2026-09-27 | M6 close: the M6 counters, the Dispositions retuned and a season's Transfer lock (`configVersion` … |  | [DL-001-085-first-build](archive/DL-001-085-first-build.md) |
| DL-70 | 2026-09-26 | M4 verification corrections: the Board names the Skills its Encounters' Checks read; tests that … |  | [DL-001-085-first-build](archive/DL-001-085-first-build.md) |
| DL-71 | 2026-09-27 | M6 close verification corrections: errata to DL-63 and DL-69; tests that kill 32 mutants of the M6 … |  | [DL-001-085-first-build](archive/DL-001-085-first-build.md) |
| DL-72 | 2026-09-27 | Merging the main line (M0 to M6 complete) into M7: both sides kept whole, no version changes |  | [DL-001-085-first-build](archive/DL-001-085-first-build.md) |
| DL-73 | 2026-09-27 | The web's views, part 2: the rest of the CLI in the browser, one engine selector for the rules … | item 4 in part by DL-99; item 8 in part by DL-74 | [DL-001-085-first-build](archive/DL-001-085-first-build.md) |
| DL-74 | 2026-09-27 | M7 verification corrections: anyone the History names found by name, a load that closes the last … |  | [DL-001-085-first-build](archive/DL-001-085-first-build.md) |
| DL-75 | 2026-09-27 | M7 close: the Pages project created on classic Pages, the first deploy, and a check of the deployed … | item 1 in part by DL-88 | [DL-001-085-first-build](archive/DL-001-085-first-build.md) |
| DL-76 | 2026-09-27 | The module contract: the `Module` interface in the engine's own types, slices and streams made by … |  | [DL-001-085-first-build](archive/DL-001-085-first-build.md) |
| DL-77 | 2026-09-27 | Hooks, effects and stops: a read-only world, typed effects through the core's own rules, a module's … | item 6 in part by DL-79 | [DL-001-085-first-build](archive/DL-001-085-first-build.md) |
| DL-78 | 2026-09-27 | The probe module: its tunables on its slice, a stop counted from its last, one draw a night that … | item 1 in part by DL-79 | [DL-001-085-first-build](archive/DL-001-085-first-build.md) |
| DL-79 | 2026-09-27 | Front ends and close-out: `--modules` on `new`, `load` and `advance`, a `?modules=` query parameter … | item 6 in part by DL-80 | [DL-001-085-first-build](archive/DL-001-085-first-build.md) |
| DL-80 | 2026-09-28 | M8 verification corrections: a read-only view by every route of reading, a hook's events settled as … |  | [DL-001-085-first-build](archive/DL-001-085-first-build.md) |
| DL-81 | 2026-09-28 | M8 close: the first build's 1,000 × 20 tagged run, byte identity with `m7-web` read from inside it … |  | [DL-001-085-first-build](archive/DL-001-085-first-build.md) |
| DL-82 | 2026-09-28 | Random Events and the module contract: the owner's inputs as a blocking INPUTS §8 table, the … |  | [DL-001-085-first-build](archive/DL-001-085-first-build.md) |
| DL-83 | 2026-09-28 | Balance targets and the economy: target bands for the automatic policy's games with M8 as the … | item 1 in part by DL-181 | [DL-001-085-first-build](archive/DL-001-085-first-build.md) |
| DL-84 | 2026-09-28 | Saves, History and performance: data-model §7 rebaselined on M8's figures, saves compressed … |  | [DL-001-085-first-build](archive/DL-001-085-first-build.md) |
| DL-85 | 2026-09-28 | Game rules and design gaps: Fame left dormant, the Hero asked before a Transfer, a Board that grows … |  | [DL-001-085-first-build](archive/DL-001-085-first-build.md) |
| DL-86 | 2026-09-28 | Process, harness and documents: v1.0.0 cut at `m8-modules` and new work on `v1.1-dev`, production … | item 2 in part by DL-99 | [DL-086-098-v1.0](archive/DL-086-098-v1.0.md) |
| DL-87 | 2026-09-28 | Content and vocabulary: content keys settled before Random Events, CONTEXT corrected and completed … |  | [DL-086-098-v1.0](archive/DL-086-098-v1.0.md) |
| DL-88 | 2026-09-28 | Front end and deploy: fast forward in chunks with a Stop, names not reused while in use, the … | item 10 by DL-124 | [DL-086-098-v1.0](archive/DL-086-098-v1.0.md) |
| DL-89 | 2026-09-28 | The roadmap and deferred scope: plan §4 completed and ordered after Random Events, modules decided … |  | [DL-086-098-v1.0](archive/DL-086-098-v1.0.md) |
| DL-90 | 2026-09-28 | Ratification: the values in force at `m8-modules` (config version 10, content version 14) accepted … | item 1 in part by DL-124 | [DL-086-098-v1.0](archive/DL-086-098-v1.0.md) |
| DL-91 | 2026-09-28 | Four points the recording left open, settled: the first Upkeep stays on the tenth Day, the Rankings … |  | [DL-086-098-v1.0](archive/DL-086-098-v1.0.md) |
| DL-92 | 2026-09-28 | v1.0.1 planned: the Workers move and the deploy records, with three page fixes the owner added … | item 6 in part by DL-122 | [DL-086-098-v1.0](archive/DL-086-098-v1.0.md) |
| DL-93 | 2026-09-28 | M8's deploy recorded after the fact: the orchestrator's run of 2026-09-27 21:30 UTC, with the … |  | [DL-086-098-v1.0](archive/DL-086-098-v1.0.md) |
| DL-94 | 2026-09-28 | The Worker beside Pages: `web/wrangler.jsonc`, a deploy script that refuses all but a clean … | item 2 in part by DL-124 | [DL-086-098-v1.0](archive/DL-086-098-v1.0.md) |
| DL-95 | 2026-09-28 | Shared places and the Bankruptcy countdown: `rankingPlaces` beside an unchanged `rankings`, shown … |  | [DL-086-098-v1.0](archive/DL-086-098-v1.0.md) |
| DL-96 | 2026-09-28 | Fast forward in steps: `fastForward` calls of at most 30 Turns (`fastForwardStepTurns`), each … |  | [DL-086-098-v1.0](archive/DL-086-098-v1.0.md) |
| DL-97 | 2026-09-28 | v1.0.1 verified and closed: "Export this game" held while a fast forward is between its steps, a … |  | [DL-086-098-v1.0](archive/DL-086-098-v1.0.md) |
| DL-98 | 2026-09-28 | v1.0.1 deployed: the tag's build on the Worker `heroesim` at … |  | [DL-086-098-v1.0](archive/DL-086-098-v1.0.md) |
| DL-99 | 2026-09-29 | The page redesigned: views in a shell in place of one column, the History as the one place to read … | item 10 in part by DL-228 | [DL-099-124-v1.1.0](archive/DL-099-124-v1.1.0.md) |
| DL-100 | 2026-09-29 | M9 planned: the redesign's epic in nine stories, #30's values under the owner's approval given … | item 3 in part by DL-125 | [DL-099-124-v1.1.0](archive/DL-099-124-v1.1.0.md) |
| DL-101 | 2026-09-29 | The Bankruptcy floor heard, and two fast-forward stops: `guild.below-floor` and … |  | [DL-099-124-v1.1.0](archive/DL-099-124-v1.1.0.md) |
| DL-102 | 2026-09-29 | M9-S2 built: Traits with a cost and exclusions (content 15), a Trait budget of 1 spent by every … |  | [DL-099-124-v1.1.0](archive/DL-099-124-v1.1.0.md) |
| DL-103 | 2026-09-29 | The page as views in a shell: a status bar that stays, six views opened as React state and … | item 1 in part by DL-111; item 3 in part by DL-115; item 3 in part by DL-206 | [DL-099-124-v1.1.0](archive/DL-099-124-v1.1.0.md) |
| DL-104 | 2026-09-29 | The Board's Quest cards and the Party builder: two-line cards that unfold to bars, counted … |  | [DL-099-124-v1.1.0](archive/DL-099-124-v1.1.0.md) |
| DL-105 | 2026-09-29 | The History as the one place to read what happened: the last play's entries its newest, marked new … | item 2 in part by DL-111; item 6 in part by DL-112; item 6 in part by DL-117; item 9 by DL-118 | [DL-099-124-v1.1.0](archive/DL-099-124-v1.1.0.md) |
| DL-106 | 2026-09-29 | The Roster, the Hall and the Rankings redesigned: Hero cards, a Hero's page as a line, chips and … |  | [DL-099-124-v1.1.0](archive/DL-099-124-v1.1.0.md) |
| DL-107 | 2026-09-29 | The page's side of #30 and #32: the Guildmaster set up under "Your Guildmaster", each Trait judged … |  | [DL-099-124-v1.1.0](archive/DL-099-124-v1.1.0.md) |
| DL-108 | 2026-09-29 | M9 verified and closed: the code review's seven findings fixed, the 50 × 20 sweep's every … |  | [DL-099-124-v1.1.0](archive/DL-099-124-v1.1.0.md) |
| DL-109 | 2026-09-29 | The owner's answers to M9's open questions: Guildmaster Traits drawn as a whole legal set, eight … | item 2 in part by DL-111; item 3 in part by DL-111 | [DL-099-124-v1.1.0](archive/DL-099-124-v1.1.0.md) |
| DL-110 | 2026-09-29 | DL-109 items 1 and 2 built: a drawn Guildmaster's Traits as one whole legal set by the same draws … |  | [DL-099-124-v1.1.0](archive/DL-099-124-v1.1.0.md) |
| DL-111 | 2026-09-29 | The owner's player test of M9: a Quest's return as one entry with a report on the Guild's home, the … | item 10 by DL-113 | [DL-099-124-v1.1.0](archive/DL-099-124-v1.1.0.md) |
| DL-112 | 2026-09-29 | M9's follow-on planned: six stories, M9-F1 to M9-F6, before the release; the engine naming the … | item 4 in part by DL-113; item 7 in part by DL-120; item 11 by DL-113 | [DL-099-124-v1.1.0](archive/DL-099-124-v1.1.0.md) |
| DL-113 | 2026-09-29 | The follow-on's plan approved as amended: DL-112's readings confirmed, every Guildmaster 21 to 50 … |  | [DL-099-124-v1.1.0](archive/DL-099-124-v1.1.0.md) |
| DL-114 | 2026-09-29 | M9-F1 built: the Quest named on what its return causes, Upkeep's parts and Day exported, every … |  | [DL-099-124-v1.1.0](archive/DL-099-124-v1.1.0.md) |
| DL-115 | 2026-09-29 | M9-F2 built: seven views in one order at every width, the Guildmaster and the Market as views, the … |  | [DL-099-124-v1.1.0](archive/DL-099-124-v1.1.0.md) |
| DL-116 | 2026-09-29 | M9-F3 built: the Guild's Stores and Treasury, the ledger read from the History by six categories … |  | [DL-099-124-v1.1.0](archive/DL-099-124-v1.1.0.md) |
| DL-117 | 2026-09-29 | M9-F4 built: the History's scopes, the player's Guild's and a Rival's History filtered, the rail … | item 5 in part by DL-121 | [DL-099-124-v1.1.0](archive/DL-099-124-v1.1.0.md) |
| DL-118 | 2026-09-29 | M9-F5 built: a Quest's return read from the History by its Party and Quest, one entry in the rail … | item 4 in part by DL-121 | [DL-099-124-v1.1.0](archive/DL-099-124-v1.1.0.md) |
| DL-119 | 2026-09-30 | M9's follow-on verified and closed: the code review's ten findings and the six carried answered … | item 1.1 in part by DL-121; item 2.2 in part by DL-121 | [DL-099-124-v1.1.0](archive/DL-099-124-v1.1.0.md) |
| DL-120 | 2026-09-30 | The owner's answers on the follow-on's close: "Debug: Whole History", Days before a Retirement … | item 5 in part by DL-206 | [DL-099-124-v1.1.0](archive/DL-099-124-v1.1.0.md) |
| DL-121 | 2026-09-30 | M9-F7 built: "Debug: Whole History", the Days before a Retirement under a year and why none came … |  | [DL-099-124-v1.1.0](archive/DL-099-124-v1.1.0.md) |
| DL-122 | 2026-09-30 | A release deploys from CI: pushing a `v*` tag on the release branch runs the checks, `npm run … | item 2 in part by DL-124; item 5 in part by DL-124 | [DL-099-124-v1.1.0](archive/DL-099-124-v1.1.0.md) |
| DL-123 | 2026-09-30 | v1.1.0 released: `v1.1-release` created and tagged `m9-redesign` and `v1.1.0`, deployed from CI to … |  | [DL-099-124-v1.1.0](archive/DL-099-124-v1.1.0.md) |
| DL-124 | 2026-09-30 | Production is `main`: a release branch's PR to `main` is raised by CI, merging it releases the next … |  | [DL-099-124-v1.1.0](archive/DL-099-124-v1.1.0.md) |
| DL-125 | 2026-09-30 | Pictures and words for v1.1.2: a `media/` folder, Portraits of the Guildmaster, Heroes and Patrons … |  | [DL-125-133-v1.1.2](archive/DL-125-133-v1.1.2.md) |
| DL-126 | 2026-09-30 | DL-125's two open items answered: the owner's pictures set the style, and each picture's Appearance … | item 2 in part by DL-127 | [DL-125-133-v1.1.2](archive/DL-125-133-v1.1.2.md) |
| DL-127 | 2026-09-30 | A picture's Appearance in two parts, keywords for the engine and a narrative for the page, with no … |  | [DL-125-133-v1.1.2](archive/DL-125-133-v1.1.2.md) |
| DL-128 | 2026-09-30 | v1.1.2-S1 built: every standalone text begins with a capital, the audit's findings capitalised in … |  | [DL-125-133-v1.1.2](archive/DL-125-133-v1.1.2.md) |
| DL-129 | 2026-09-30 | v1.1.2-S2 built: the `media/` folder and its Silhouettes drawn to the owner's pictures, the build … |  | [DL-125-133-v1.1.2](archive/DL-125-133-v1.1.2.md) |
| DL-130 | 2026-09-30 | v1.1.2-S3 built: the Portrait in the save, chosen or drawn on its own stream, a Patron's sex coming … |  | [DL-125-133-v1.1.2](archive/DL-125-133-v1.1.2.md) |
| DL-131 | 2026-09-30 | v1.1.2-S4 built: the owner's two pictures converted and listed, their Appearances in content, the … |  | [DL-125-133-v1.1.2](archive/DL-125-133-v1.1.2.md) |
| DL-132 | 2026-09-30 | v1.1.2-S5 built: the Guildmaster described from `content/descriptions.json`, every blank written as … |  | [DL-125-133-v1.1.2](archive/DL-125-133-v1.1.2.md) |
| DL-133 | 2026-09-30 | v1.1.2 built, reviewed and verified: the code review's findings and the verifications' fixed test … |  | [DL-125-133-v1.1.2](archive/DL-125-133-v1.1.2.md) |
| DL-134 | 2026-10-01 | Portraits that follow the person: each picture's apparent age, station, callings, temper, features … | item 3 in part by DL-135; item 5 in part by DL-135; item 9 in part by DL-135; item 12 by DL-135 | [DL-134-147-v1.1.3](archive/DL-134-147-v1.1.3.md) |
| DL-135 | 2026-10-01 | DL-134's open items answered, and the plan finished: the stream renamed in v1.1.2, a Hero's row … |  | [DL-134-147-v1.1.3](archive/DL-134-147-v1.1.3.md) |
| DL-136 | 2026-10-01 | The owner's 40 Guildmaster pictures are v1.1.3's source, and the two already in the game are the … |  | [DL-134-147-v1.1.3](archive/DL-134-147-v1.1.3.md) |
| DL-137 | 2026-10-01 | v1.1.2-S7 built: the Guildmaster's Portrait stream named `gm-portraits`, nothing seen changing … |  | [DL-134-147-v1.1.3](archive/DL-134-147-v1.1.3.md) |
| DL-138 | 2026-10-01 | v1.1.3-S1 built: each picture's row, the vocabulary and the sentence lists in content, with their … |  | [DL-134-147-v1.1.3](archive/DL-134-147-v1.1.3.md) |
| DL-139 | 2026-10-01 | v1.1.3-S2 built: the portrait tool converts, registers, fingerprints and checks, and writes rows … |  | [DL-134-147-v1.1.3](archive/DL-134-147-v1.1.3.md) |
| DL-140 | 2026-10-01 | v1.1.3-S3 built: the portrait skills and agents, which read and check each picture and change files … |  | [DL-134-147-v1.1.3](archive/DL-134-147-v1.1.3.md) |
| DL-141 | 2026-10-01 | v1.1.3-S5 built: every Guildmaster's Portrait chosen to fit them on `gm-portraits`, and their … | item 3 in part by DL-144 | [DL-134-147-v1.1.3](archive/DL-134-147-v1.1.3.md) |
| DL-142 | 2026-10-01 | v1.1.3-S6 built: every Hero's Portrait chosen to fit them on `hero-portraits`, their Appearance and … |  | [DL-134-147-v1.1.3](archive/DL-134-147-v1.1.3.md) |
| DL-143 | 2026-10-01 | v1.1.3-S4: the owner's 40 pictures through the tool, 38 taken in and the two originals skipped, and … |  | [DL-134-147-v1.1.3](archive/DL-134-147-v1.1.3.md) |
| DL-144 | 2026-10-02 | The owner's answers to DL-141, DL-142 and DL-143: every living Guildmaster holds their picture, the … |  | [DL-134-147-v1.1.3](archive/DL-134-147-v1.1.3.md) |
| DL-145 | 2026-10-02 | v1.1.3-S7 built: the setup grid of one sex's thumbnails, a thumbnail beside each name in the lists … |  | [DL-134-147-v1.1.3](archive/DL-134-147-v1.1.3.md) |
| DL-146 | 2026-10-02 | v1.1.3 built, reviewed and verified: the code review's findings fixed test first, the 50 × 20 … |  | [DL-134-147-v1.1.3](archive/DL-134-147-v1.1.3.md) |
| DL-147 | 2026-10-02 | The owner's answers to DL-145 and DL-146: a radio button of the setup grid always checked, a … |  | [DL-134-147-v1.1.3](archive/DL-134-147-v1.1.3.md) |
| DL-148 | 2026-10-02 | Richer Quests as v1.1.4: Checks as Queries over the Party, several named Checks to an Encounter … | item 3 in part by DL-181; item 8 in part by DL-168; item 10 in part by DL-168 | [DL-148-168-v1.1.4](archive/DL-148-168-v1.1.4.md) |
| DL-149 | 2026-10-02 | The Guildmaster's setup in v1.1.4: "Choose for me" for the whole Guildmaster, or the player's own … |  | [DL-148-168-v1.1.4](archive/DL-148-168-v1.1.4.md) |
| DL-150 | 2026-10-02 | Traits in two lists, each a list of effects; a content editor for the owner with Traits as its … |  | [DL-148-168-v1.1.4](archive/DL-148-168-v1.1.4.md) |
| DL-151 | 2026-10-02 | v1.1.4-S1 built: Checks scored by Queries over the Party, Synergy requirements written in them, the … |  | [DL-148-168-v1.1.4](archive/DL-148-168-v1.1.4.md) |
| DL-152 | 2026-10-02 | v1.1.4-S2 built: several Checks to an Encounter, combined by a pass formula into a Degree … |  | [DL-148-168-v1.1.4](archive/DL-148-168-v1.1.4.md) |
| DL-153 | 2026-10-02 | v1.1.4-S11 built: "Choose for me" for the whole Guildmaster, or "Choose myself" with the sex, the … |  | [DL-148-168-v1.1.4](archive/DL-148-168-v1.1.4.md) |
| DL-154 | 2026-10-02 | v1.1.4-S3 built: a Hero's form, from the band of their Morale on the Quest and their wounds … | item 5 in part by DL-168 | [DL-148-168-v1.1.4](archive/DL-148-168-v1.1.4.md) |
| DL-155 | 2026-10-02 | v1.1.4-S4 built: harm that reads the Stats, an Injury's and a Death's `among`, `exposedBy` and … | item 3 in part by DL-168 | [DL-148-168-v1.1.4](archive/DL-148-168-v1.1.4.md) |
| DL-156 | 2026-10-02 | v1.1.4-S5 built: the chance estimate, worked out exactly from what the resolver draws, the chance … |  | [DL-148-168-v1.1.4](archive/DL-148-168-v1.1.4.md) |
| DL-157 | 2026-10-02 | v1.1.4-S6 built: the Board's cards show each Encounter and what each Check reads with "Your best … |  | [DL-148-168-v1.1.4](archive/DL-148-168-v1.1.4.md) |
| DL-158 | 2026-10-02 | v1.1.4-S7, first step built: the Traits moved into two lists, `guildmaster-traits.json` and … |  | [DL-148-168-v1.1.4](archive/DL-148-168-v1.1.4.md) |
| DL-159 | 2026-10-02 | v1.1.4-S7 built: Hero Traits that change Stats and give the Party an Encounter bonus, the four … |  | [DL-148-168-v1.1.4](archive/DL-148-168-v1.1.4.md) |
| DL-160 | 2026-10-03 | v1.1.4-S8 built: the Encounter of a kind drawn by the tags it shares with its template, a … |  | [DL-148-168-v1.1.4](archive/DL-148-168-v1.1.4.md) |
| DL-161 | 2026-10-03 | v1.1.4-S12 built: the register of a Trait's uses, the drift and freshness tests, and the content … |  | [DL-148-168-v1.1.4](archive/DL-148-168-v1.1.4.md) |
| DL-162 | 2026-10-03 | v1.1.4-S9 built: a negative weight or factor on a Stat refused in a Check's score, the calibration … |  | [DL-148-168-v1.1.4](archive/DL-148-168-v1.1.4.md) |
| DL-163 | 2026-10-03 | v1.1.4-S13 built: the Trait skills, `assign` and `unassign` for each use the register adds and … |  | [DL-148-168-v1.1.4](archive/DL-148-168-v1.1.4.md) |
| DL-164 | 2026-10-03 | v1.1.4: the test suite's time restored: the Rivals' Party search made cheaper with the same games … |  | [DL-148-168-v1.1.4](archive/DL-148-168-v1.1.4.md) |
| DL-165 | 2026-10-03 | v1.1.4: the owner's answers to S9's review: the Quest target deferred, `checkVariance` 0.4 in … | item 1 in part by DL-168 | [DL-148-168-v1.1.4](archive/DL-148-168-v1.1.4.md) |
| DL-166 | 2026-10-03 | v1.1.4-S10 built: the approved drafts in content, the balance pass tuned for few bankruptcies, the … | item 6 in part by DL-168 | [DL-148-168-v1.1.4](archive/DL-148-168-v1.1.4.md) |
| DL-167 | 2026-10-03 | v1.1.4 built, reviewed and verified: the code review's findings fixed test first, the 50 × 20 … |  | [DL-148-168-v1.1.4](archive/DL-148-168-v1.1.4.md) |
| DL-168 | 2026-10-03 | The owner's answers to v1.1.4's open questions: v1.1.4 released, the harness's player choosing … | item 4 in part by DL-179; item 16 in part by DL-182; in part by DL-169 | [DL-148-168-v1.1.4](archive/DL-148-168-v1.1.4.md) |
| DL-169 | 2026-10-03 | The owner's answers on the Board's unavailable Heroes and the Roster's Table: the Away and the … |  | [DL-169-185-v1.1.5](archive/DL-169-185-v1.1.5.md) |
| DL-170 | 2026-10-03 | v1.1.5-S11 built: the Board's Party builder lists the Heroes who can go first in the default order … |  | [DL-169-185-v1.1.5](archive/DL-169-185-v1.1.5.md) |
| DL-171 | 2026-10-03 | v1.1.5-S12 built: the Roster as Tiles or a Table of effective Stats, its columns chosen in a panel … |  | [DL-169-185-v1.1.5](archive/DL-169-185-v1.1.5.md) |
| DL-172 | 2026-10-03 | v1.1.5-S8 built: the words of the Earned Trait, the Chance band and the configuration's comments … |  | [DL-169-185-v1.1.5](archive/DL-169-185-v1.1.5.md) |
| DL-173 | 2026-10-04 | v1.1.5-S7 built: the estimate probe's second measure with Morale's consequences left in, run on the … |  | [DL-169-185-v1.1.5](archive/DL-169-185-v1.1.5.md) |
| DL-174 | 2026-10-04 | v1.1.5-S1 built: one game's memory profiled, its main cause the save's text written at each year's … |  | [DL-169-185-v1.1.5](archive/DL-169-185-v1.1.5.md) |
| DL-175 | 2026-10-04 | v1.1.5-S6 built (code part): `partyFor` adds a Hero past the minimum only for more than the margin … |  | [DL-169-185-v1.1.5](archive/DL-169-185-v1.1.5.md) |
| DL-176 | 2026-10-04 | v1.1.5-S2 built: the harness's player sends its Parties to the Quests they are likeliest to win … |  | [DL-169-185-v1.1.5](archive/DL-169-185-v1.1.5.md) |
| DL-177 | 2026-10-04 | v1.1.5-S3 built: the new baseline, the player choosing its Quests by their chance over 50 games of … |  | [DL-169-185-v1.1.5](archive/DL-169-185-v1.1.5.md) |
| DL-178 | 2026-10-04 | v1.1.5-S4 built: an Injury's `among` read over the unhurt living Heroes, so it falls on the … |  | [DL-169-185-v1.1.5](archive/DL-169-185-v1.1.5.md) |
| DL-179 | 2026-10-04 | v1.1.5-S5 built: the four positive earned Traits at 0.05 through the content editor's Finish … |  | [DL-169-185-v1.1.5](archive/DL-169-185-v1.1.5.md) |
| DL-180 | 2026-10-04 | v1.1.5-S9 run: the split-XP trial, for information: each Hero of a Party taking the Quest's XP … |  | [DL-169-185-v1.1.5](archive/DL-169-185-v1.1.5.md) |
| DL-181 | 2026-10-04 | v1.1.5-S10, the close: the close review's findings fixed test first, the replay's peak from 1,861 … | in part by DL-182 | [DL-169-185-v1.1.5](archive/DL-169-185-v1.1.5.md) |
| DL-182 | 2026-10-04 | The owner's answers at v1.1.5's close: the XP split in v1.1.5 as S13, Unique Items on the Roster … |  | [DL-169-185-v1.1.5](archive/DL-169-185-v1.1.5.md) |
| DL-183 | 2026-10-04 | v1.1.5-S14 built: Unique Items on the Roster, the Item's picture before its name in its chip on the … |  | [DL-169-185-v1.1.5](archive/DL-169-185-v1.1.5.md) |
| DL-184 | 2026-10-04 | v1.1.5-S13 built: the XP split, each Hero who comes home taking the Quest's XP divided by the size … |  | [DL-169-185-v1.1.5](archive/DL-169-185-v1.1.5.md) |
| DL-185 | 2026-10-04 | v1.1.5's re-close: the owner's answers since DL-182 (the light glow kept, #51's comments posted … |  | [DL-169-185-v1.1.5](archive/DL-169-185-v1.1.5.md) |
| DL-186 | 2026-10-05 | v1.1.6 planned: the owner's answers to an architecture review after v1.1.5, every candidate and … |  | [DL-186-205-v1.1.6](archive/DL-186-205-v1.1.6.md) |
| DL-187 | 2026-10-05 | v1.1.6-S1 built: a sweep's totals by one fold over each game's counters, with a short declared list … |  | [DL-186-205-v1.1.6](archive/DL-186-205-v1.1.6.md) |
| DL-188 | 2026-10-05 | v1.1.6-S2 built: one parser of a run's settings, the `gate` and `neutral` profiles, a JSON report … |  | [DL-186-205-v1.1.6](archive/DL-186-205-v1.1.6.md) |
| DL-189 | 2026-10-05 | v1.1.6-S3 built: the replay plays its seed once, alone and bare, and compares its last save's … |  | [DL-186-205-v1.1.6](archive/DL-186-205-v1.1.6.md) |
| DL-190 | 2026-10-05 | v1.1.6-S4 built: the content version as data, `content/version.json`; one write module for the … |  | [DL-186-205-v1.1.6](archive/DL-186-205-v1.1.6.md) |
| DL-191 | 2026-10-05 | v1.1.6-S5 built: content imports the engine's values as well as its types; the copied tables gone … |  | [DL-186-205-v1.1.6](archive/DL-186-205-v1.1.6.md) |
| DL-192 | 2026-10-05 | v1.1.6-S6 built: the old content form retired; the content version 33; the `neutral` baseline … |  | [DL-186-205-v1.1.6](archive/DL-186-205-v1.1.6.md) |
| DL-193 | 2026-10-05 | v1.1.6-S7 built: one `playDeps` and `checkConfig` over all 118 settings, a rule each; the versions … |  | [DL-186-205-v1.1.6](archive/DL-186-205-v1.1.6.md) |
| DL-194 | 2026-10-05 | v1.1.6-S8 built: the engine's entry narrowed to what its callers use, the test-only names in … |  | [DL-186-205-v1.1.6](archive/DL-186-205-v1.1.6.md) |
| DL-195 | 2026-10-05 | v1.1.6-S9 built: who harm falls on owned by `harm.ts`, `strike`, `chooseEarner` and `moraleOf` with … |  | [DL-186-205-v1.1.6](archive/DL-186-205-v1.1.6.md) |
| DL-196 | 2026-10-05 | v1.1.6-S10 built: one Query operator table, a row for each operator of each type with its signature … |  | [DL-186-205-v1.1.6](archive/DL-186-205-v1.1.6.md) |
| DL-197 | 2026-10-05 | v1.1.6-S11 built: `@heroesim/words`, a sixth package that runs in a browser, holding the Query … |  | [DL-186-205-v1.1.6](archive/DL-186-205-v1.1.6.md) |
| DL-198 | 2026-10-05 | v1.1.6-S12 built: one narration in `@heroesim/words`, its sentences' names as slots a Namer fills … | item call 1 in part by DL-206; item call 2 in part by DL-206 | [DL-186-205-v1.1.6](archive/DL-186-205-v1.1.6.md) |
| DL-199 | 2026-10-05 | v1.1.6-S13 built: the engine's `statBreakdown`, each Hero Stat's base, its three sources in the … |  | [DL-186-205-v1.1.6](archive/DL-186-205-v1.1.6.md) |
| DL-200 | 2026-10-05 | v1.1.6-S14 built: `availabilityOf`, one reading of whether a Hero can go; `partyBuilder`, the … |  | [DL-186-205-v1.1.6](archive/DL-186-205-v1.1.6.md) |
| DL-201 | 2026-10-05 | v1.1.6-S15 built: the page's widths named in `breakpoints`, held to the style sheet by a test; the … |  | [DL-186-205-v1.1.6](archive/DL-186-205-v1.1.6.md) |
| DL-202 | 2026-10-05 | v1.1.6-S16 built: an optional `weight` on a Class, Background, Quest template and Sphere, drawn by … |  | [DL-186-205-v1.1.6](archive/DL-186-205-v1.1.6.md) |
| DL-203 | 2026-10-05 | v1.1.6-S17 built: the per-Turn copy by hand, `copyWorld`, the write-once rows (dead, retired and … |  | [DL-186-205-v1.1.6](archive/DL-186-205-v1.1.6.md) |
| DL-204 | 2026-10-05 | v1.1.6-S18 built: the tuning values as data, `engine/src/config.json` in 18 sections with the … |  | [DL-186-205-v1.1.6](archive/DL-186-205-v1.1.6.md) |
| DL-205 | 2026-10-05 | v1.1.6-S19, the close: the close review's findings fixed: a whole setting a safe integer and each … |  | [DL-186-205-v1.1.6](archive/DL-186-205-v1.1.6.md) |
| DL-206 | 2026-10-06 | v1.1.7 planned: the owner's answers to v1.1.6's open items and to four features; weighted deals and … |  | [DL-206-214-v1.1.7](archive/DL-206-214-v1.1.7.md) |
| DL-207 | 2026-10-06 | v1.1.7-S1 built: the Gate's copy line as the copy's share of a Turn, `copyShare`, the mean per-Turn … |  | [DL-206-214-v1.1.7](archive/DL-206-214-v1.1.7.md) |
| DL-208 | 2026-10-06 | v1.1.7-S2 built: a Guild's starting Roster and the Patrons' Spheres dealt by weight, `dealEvenly`'s … |  | [DL-206-214-v1.1.7](archive/DL-206-214-v1.1.7.md) |
| DL-209 | 2026-10-06 | v1.1.7-S3 built: one "why it stopped" in `@heroesim/words`, its names as slots each front end's … |  | [DL-206-214-v1.1.7](archive/DL-206-214-v1.1.7.md) |
| DL-210 | 2026-10-06 | v1.1.7-S4 built: the calendar: one date in `@heroesim/words`, "Year Y Day D" from a Turn or a Day … |  | [DL-206-214-v1.1.7](archive/DL-206-214-v1.1.7.md) |
| DL-211 | 2026-10-06 | v1.1.7-S5 built: no History entry for a Hero never hired; the pool's arrivals and a never-hired … |  | [DL-206-214-v1.1.7](archive/DL-206-214-v1.1.7.md) |
| DL-212 | 2026-10-06 | v1.1.7-S6 built: Class icons; the owner's five rounds of drawings approved, an optional `icon` on a … |  | [DL-206-214-v1.1.7](archive/DL-206-214-v1.1.7.md) |
| DL-213 | 2026-10-07 | v1.1.7-S7 built: one filter element for the page, several choices to a filter, "All" when none and … |  | [DL-206-214-v1.1.7](archive/DL-206-214-v1.1.7.md) |
| DL-214 | 2026-10-07 | v1.1.7-S8, the close: the close review's findings fixed: a Hero's leaving the pool decided over the … |  | [DL-206-214-v1.1.7](archive/DL-206-214-v1.1.7.md) |
| DL-215 | 2026-10-08 | The decision log archived by release, superseded items set apart, and an index made from its … |  | [DL-215-230-v1.1.8](archive/DL-215-230-v1.1.8.md) |
| DL-216 | 2026-10-08 | The closed epics archived, and `plan.md` §2 the one release ledger | item 4 in part by DL-228 | [DL-215-230-v1.1.8](archive/DL-215-230-v1.1.8.md) |
| DL-217 | 2026-10-08 | `INPUTS-REQUIRED.md` archived once its live parts moved out, and the README an entry page with the … |  | [DL-215-230-v1.1.8](archive/DL-215-230-v1.1.8.md) |
| DL-218 | 2026-10-08 | A delivery guide in the repository; generated files and applied runs out of the tree; the … |  | [DL-215-230-v1.1.8](archive/DL-215-230-v1.1.8.md) |
| DL-219 | 2026-10-08 | The lean entry held by a test; story ids out of the comments by a rule and a baseline; the Traits' … |  | [DL-215-230-v1.1.8](archive/DL-215-230-v1.1.8.md) |
| DL-220 | 2026-10-08 | `plan.md` cut to the delivery of releases; the first build's plan archived | item 1 in part by DL-228 | [DL-215-230-v1.1.8](archive/DL-215-230-v1.1.8.md) |
| DL-221 | 2026-10-08 | The delivery guide accepted; the archives out of a search; ADR-0009 and data-model §7 trimmed | item 2 in part by DL-222; item 3 by DL-222 | [DL-215-230-v1.1.8](archive/DL-215-230-v1.1.8.md) |
| DL-222 | 2026-10-08 | ADR-0009 restated from every decision on streams, its old wording archived |  | [DL-215-230-v1.1.8](archive/DL-215-230-v1.1.8.md) |
| DL-223 | 2026-10-08 | The owner's answers to Q3 and Q5: M9's table stays archived; the harness's reports pruned to those … |  | [DL-215-230-v1.1.8](archive/DL-215-230-v1.1.8.md) |
| DL-224 | 2026-10-08 | The owner's answers to Q6: `origin/HEAD` on `main`, #34 closed, #33 corrected, the agent's memory … |  | [DL-215-230-v1.1.8](archive/DL-215-230-v1.1.8.md) |
| DL-225 | 2026-10-09 | v1.1.8-S7 closed: CONTEXT.md's story ids replaced by their entries, and `neutral --expect` passing | item 2 in part by DL-229 | [DL-215-230-v1.1.8](archive/DL-215-230-v1.1.8.md) |
| DL-226 | 2026-10-09 | v1.1.8-S8 closed: the close's review, its fourteen findings fixed, and the Gate met |  | [DL-215-230-v1.1.8](archive/DL-215-230-v1.1.8.md) |
| DL-227 | 2026-10-09 | How to keep the documents lean, and how to archive, written as one guide |  | [DL-215-230-v1.1.8](archive/DL-215-230-v1.1.8.md) |
| DL-228 | 2026-10-09 | Delivery tracked by release alone; Random Events the first module but not necessarily next |  | [DL-215-230-v1.1.8](archive/DL-215-230-v1.1.8.md) |
| DL-229 | 2026-10-09 | One 50 × 20 baseline on v1.1.8, and the harness's reports cut to those cited live |  | [DL-215-230-v1.1.8](archive/DL-215-230-v1.1.8.md) |
| DL-230 | 2026-10-09 | The engine's two twenty-year boxes out of `npm test`, into `npm run harness` |  | [DL-215-230-v1.1.8](archive/DL-215-230-v1.1.8.md) |
| DL-231 | 2026-10-09 | v1.1.9 planned: the tests and the harness faster and leaner, play and the design unchanged | item 6 in part by DL-235 | [decision-log](../decision-log.md) |
| DL-232 | 2026-10-09 | v1.1.9 widened to the architecture review's twelve candidates |  | [decision-log](../decision-log.md) |
| DL-233 | 2026-10-09 | v1.1.9-S1 built: coverage, the measures, the time limits apart, and the baseline |  | [decision-log](../decision-log.md) |
| DL-234 | 2026-10-09 | v1.1.9-S2 built: the suite's structure |  | [decision-log](../decision-log.md) |
| DL-235 | 2026-10-09 | v1.1.9-S3 built: CI on Node 26 alone, and a deploy that tests a tree once |  | [decision-log](../decision-log.md) |
| DL-236 | 2026-10-09 | v1.1.9: three tests that failed under load fixed on the owner's word |  | [decision-log](../decision-log.md) |
| DL-237 | 2026-10-10 | v1.1.9-S4 built: the Best Party module |  | [decision-log](../decision-log.md) |
| DL-238 | 2026-10-10 | v1.1.9-S5 built: a Guild's actions on one copy, and the save in one walk |  | [decision-log](../decision-log.md) |
| DL-239 | 2026-10-10 | v1.1.9-S6 built: the harness's counters declared once, and play observed |  | [decision-log](../decision-log.md) |
| DL-240 | 2026-10-10 | v1.1.9-S7 built: refusals behind the Namer |  | [decision-log](../decision-log.md) |
| DL-241 | 2026-10-10 | v1.1.9-S8 built: readings in `words`, and the player's reading |  | [decision-log](../decision-log.md) |
| DL-242 | 2026-10-10 | v1.1.9-S9 built: the History reader |  | [decision-log](../decision-log.md) |
| DL-243 | 2026-10-10 | v1.1.9-S10 built: content kinds, effect kinds by their fields, and content's own entry |  | [decision-log](../decision-log.md) |
| DL-244 | 2026-10-10 | v1.1.9-S11 built: the editor's edit session |  | [decision-log](../decision-log.md) |
| DL-245 | 2026-10-10 | v1.1.9-S9's fixture: `withReturn` through the engine, on the owner's word |  | [decision-log](../decision-log.md) |
| DL-246 | 2026-10-10 | v1.1.9-S12 built: the engine's tests pruned, on the owner's batch |  | [decision-log](../decision-log.md) |

## Pre-M0 review decisions

Items A1 to F4, in [pre-m0-review](archive/pre-m0-review.md). Superseded:

- D3: in part by DL-84
