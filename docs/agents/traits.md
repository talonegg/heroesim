# Traits: the editor, the register, the skills and their rules

How Traits are found, added, changed, removed and used in other content (DL-150 items 7 to 16,
v1.1.4-S12 and S13). The content editor, `tools/editor` (its README has every command), makes each
change to a Trait and to each use of one. The register, `content/src/uses/`, lists every place a
Trait is used, in content and in the engine; the editor finds a Trait's uses, and adds, takes out and
changes in place a use (`update`, v1.1.6-S4), through it. The Trait skills drive the editor's
commands for a session. The part of this file after the guardrails is written from the register; the
rest is written by hand.

```sh
npm run edit                                   # the page, on this machine only
npm run edit -- traits <command> [--root <dir>] [--json]
```

| Skill | Run it to | It changes |
| --- | --- | --- |
| `trait-find` | find a Trait by name, effect or use; the content that uses it; the rules and events that read Traits | nothing |
| `trait-edit` | add, change or remove a Trait | the Trait lists, through `add`, `change`, `remove` and `finish` |
| `trait-assign` | add, take out or change in place a Trait's use in other content | the content holding the use, through `assign`, `unassign`, `update` and `finish` |

Ask Claude Code for one by name, or say what you want done to a Trait; each works on the current
branch, from the repository's root.

## Guardrails

- **The only route** (DL-150 item 15). Every Trait is added, changed, removed and assigned through
  the editor: its page, its commands, or the `trait-*` skills, which run the commands. No Trait file,
  and no use of a Trait in other content, is edited by hand or by a script of a session's own.
- **The doctor before and after.** `npm run --silent edit -- traits doctor --json` runs the drift and
  freshness checks, the content's checks, and whether the pending edits apply. A skill runs it before
  it acts, and again after "Finish". It must report `"ok": true` both times.
- **When the doctor reports drift,** the register and the code differ: a rule of the engine or a check
  of the content reads a Trait where the register does not say so, or a listed one no longer does.
  1. Read each problem: its file, line and declaration.
  2. Update the register, `content/src/uses/register.ts`: add the declaration to the engine entry
     whose rule it belongs to (its `sources`, or `through`), or a new entry, or take out a name that
     reads no Trait now. A new place in content where a Trait's key stands is a new content entry,
     with its `find`, and an `add` and `remove` where they are safe.
  3. Regenerate this file's register part: `npm run edit -- traits doc`.
  4. Run the doctor again until it passes, then include both, the register and this file, in the
     change, with the session's other work.

  A stale doc alone is mended by step 3. Content that fails its checks, or pending edits that no
  longer apply, are named by the doctor: fix the content through the editor, or drop the edits with
  `traits discard`.
- **Content only, never a save** (DL-150 item 16). The editor and the skills change what the game
  ships. No saved game, no `.saves/` file and no document of a world is read for an edit or changed:
  every change to a world is an event in its History, made by playing.
- **A key is fixed once made** (DL-150 item 9). Its name, effects, excludes and a Guildmaster
  Trait's cost change; a new key is a new Trait.
- **Each edit is checked as it is made** with the content's own checks, and held as pending in
  `.editor/traits.json`, which git ignores, until "Finish".
- **Each session's edits end with "Finish"** (DL-150 item 11). It writes the files, raises the content
  version by one in its file, `content/version.json`, a line of whose changelog names the edits
  (v1.1.6-S4), and runs `npm test`; if any test fails, every file is put back and the edits stay
  pending. It takes as long as the suite, a few minutes. Edits left pending at a session's end are
  named to the owner, never left silently.
- **When Finish is undone,** read each failure for what it holds:
  - *the edit at fault* (a value a rule refuses): change the edit, or discard it, and finish again;
  - *a use the tests want* (`content/src/content.test.ts` holds a Biography sentence for every Hero
    Trait, say): add it with `trait-assign`, and finish again;
  - *a test that pins the content as shipped* (a value a decision fixed, such as the four Injury
    Traits' Stat changes, DL-148 item 24): show it to the owner. With their word the test is changed, as code, in the same
    change, and "Finish" run again; without it the edit is discarded.
- **Nothing is committed or pushed** by the editor or a skill. Read `git diff`, and commit it
  yourself.
- **A Trait in use is not removed** (DL-150 item 10). The refusal names every use; change or unassign
  each first (`trait-assign`). Other Traits' `excludes` do not count: the editor takes the Trait out of
  them itself.
- **A use the register cannot take out** (a `has-trait` inside a `not`, say) is refused: ask the
  owner how that Query is to read without it. The register's entry is where a new safe way is added.
- **An exclusion is held both ways.** Setting a Trait's `excludes` writes the other Trait's too.
- **The effects offered are each list's known kinds** (DL-150 item 8). A new kind is an engine
  change, made on request.
- **A trial** runs on a scratch copy: every command takes `--root <dir>`, a copy holding a
  `package.json`, and the skills pass it on. The register is code the editor imports, so a trial of a
  drift fix runs the editor of a whole working copy from its own folder.
- **For a skill,** `npm run --silent edit -- traits <command> --json`: stdout is then one JSON object,
  and the exit code says how it went (0 done, 1 refused or failed with nothing changed, 2 a line not
  understood).
- **While "Finish" runs** every other command is refused as `busy`. A "Finish" cut off by a crash or
  a kill is put back by the next command, which says so (`recovered`).
- **Busy for ever** (v1.1.4-S14): the lock is the journal's process number, and Windows gives a number
  again, so a journal left by a "Finish" cut off may read as running while an unrelated process holds
  it. The refusal names the journal's process and when it began. Where no "Finish" runs, no editor
  command and no page, `npm run --silent edit -- traits recover --force --json` puts its files back
  whatever its number says. Never while a "Finish" does run: its written content would be put back
  under it.
- **Files not put back.** A failed "Finish" that cannot put a file back (`not-undone`) keeps its
  journal, and the next command tries again: fix what the problem names (a file held open, a folder
  where the file was), then run `traits recover`.

## Each story's close

From v1.1.4-S13 on, in this epic and every one after it (DL-150 item 14):

- **A story that touches the engine** (`engine/src/`) or the content's checks
  (`content/src/validate.ts`) runs `npm run edit -- traits doctor` at its close, and fixes any drift as
  the guardrails say, in the same change.
- **Its DL entry says what changed for Traits:** the register's entries added, changed or taken out
  and why, a new effect kind, event or use in content; or, in so many words, "Nothing changed for
  Traits; the doctor reports no drift."
- **A story that changes a Trait or a use of one** does it through the editor or the skills, and its
  DL entry names the "Finish" and the content version it raised.
- **An epic's close** runs the doctor among its checks, as v1.1.4-S14 does.

<!-- The register's part begins: written by `npm run edit -- traits doc` from content/src/uses/register.ts. Do not edit it by hand. -->

## The register

Every place a Trait is used: 8 in content, where a Trait's key stands, and 12 rules of the engine and checks of the content that read a Trait. The editor's `uses` and `find` read the first; the drift test holds the second to the code.

| Entry | Where | Holds | Refuses removal | Add | Remove | Update |
| --- | --- | --- | --- | --- | --- | --- |
| `excludes` | guildmaster-traits.json, hero-traits.json | guildmaster, hero | no | yes | yes | no |
| `injury-leaves-trait` | injuries.json | hero | yes | yes | yes | no |
| `encounter-trait` | encounters.json | hero | yes | yes | yes | yes |
| `encounter-has-trait` | encounters.json | hero | yes | yes | yes | no |
| `synergy-has-trait` | synergies.json | hero | yes | yes | yes | no |
| `biography-sentences` | descriptions.json | guildmaster, hero | yes | yes | yes | yes |
| `portrait-callings` | descriptions.json | guildmaster | yes | yes | yes | no |
| `portrait-features` | portrait-appearances.json | hero | yes | yes | yes | no |

| Rule | Reads | Effects | Events |
| --- | --- | --- | --- |
| `trait-lists` | guildmaster, hero | - | - |
| `effective-stats` | hero | `statModifiers` | - |
| `encounter-bonus` | hero | `encounterBonus` | - |
| `guildmaster-effects` | guildmaster | `classStatBonus`, `guildMoraleShift`, `upkeepFactor` | - |
| `guildmaster-setup` | guildmaster | - | - |
| `injury-traits` | hero | - | `hero.trait-lost` |
| `earned-trait` | hero | - | `hero.trait-gained` |
| `trait-events` | hero | - | `hero.trait-gained`, `hero.trait-lost` |
| `has-trait` | hero | - | - |
| `biography-and-portrait` | guildmaster, hero | - | - |
| `document-validator` | guildmaster, hero | - | - |
| `content-checks` | guildmaster, hero | `classStatBonus`, `guildMoraleShift`, `upkeepFactor`, `statModifiers`, `encounterBonus` | - |

## In content

### `excludes`: Other Traits' excludes

- **Where:** `content/guildmaster-traits.json`, `content/hero-traits.json`, holding Guildmaster and Hero Traits' keys.
- **What reads it:** A Trait of the same list that this one excludes and that excludes it in return (DL-150 items 3 and 5): read by setup, the drawn Guildmaster, the earned Traits and the Injury Traits.
- **Its uses of a key:** Each other Trait of the key's list whose `excludes` names the key.
- **Removal:** the editor takes the key out itself when the Trait is removed.
- **Adding a use:** Each Trait's `excludes` names the other, both ways, as the content's checks hold. The target: `trait`, the other Trait's key, of the same list. `traits assign <key> excludes trait=…`.
- **Removing a use:** The key is taken out of that Trait's `excludes`, and that Trait out of the key's, both ways. `traits unassign <key> excludes <at>`, its place as `traits uses` gives it.
- **Changing a use:** a use here is the key alone: take it out and add another.

### `injury-leaves-trait`: An Injury's leavesTrait

- **Where:** `content/injuries.json`, holding Hero Traits' keys.
- **What reads it:** The Hero Trait an Injury leaves as it heals (R16), replacing any it conflicts with (DL-150 item 5): read by the Hero State Engine (`injury-traits`).
- **Its uses of a key:** Each Injury whose `leavesTrait` is the key.
- **Removal:** a use here refuses the Trait's removal, naming it.
- **Adding a use:** The Injury's `leavesTrait` is set to the key; an Injury that leaves another Trait is refused. The target: `injury`, the Injury's key. `traits assign <key> injury-leaves-trait injury=…`.
- **Removing a use:** The Injury's `leavesTrait` is set to `null`: it leaves no Trait. `traits unassign <key> injury-leaves-trait <at>`, its place as `traits uses` gives it.
- **Changing a use:** a use here is the key alone: take it out and add another.

### `encounter-trait`: An Encounter's trait consequence

- **Where:** `content/encounters.json`, holding Hero Traits' keys.
- **What reads it:** A Trait earned on a Quest (DL-148 item 25): positive in a `triumph` list, granted on a strong success; negative in a `failure` list, on a Hero that Encounter injured. Read by the resolver (`earned-trait`).
- **Its uses of a key:** Each `{ "kind": "trait" }` consequence, in any of an Encounter's lists, whose `traitKey` is the key.
- **Removal:** a use here refuses the Trait's removal, naming it.
- **Adding a use:** A `{ "kind": "trait", "traitKey", "chance", "among"? }` is added at the end of the Encounter's `triumph` or `failure` list. An Encounter with no `triumph` list, whose Triumph reads its `success` list, is given one copied from it first, so a Triumph brings what it brought. The target: `encounter`, the Encounter's key; `degree`, `triumph` (a positive Trait) or `failure` (a negative one); `chance`, the chance, above 0 and at most 1; `among`, optional: a Set Query of who may take it. `traits assign <key> encounter-trait encounter=… degree=… chance=… [among=…]`.
- **Removing a use:** The consequence is taken out of its list. A `triumph` list left equal to the `success` list goes with it, as the Encounter's Triumph then reads the `success` list. `traits unassign <key> encounter-trait <at>`, its place as `traits uses` gives it.
- **Changing a use:** The consequence's `chance` or `among`, or both, are set in its place; an `among` of `null` takes it out, so that any Hero of the Party may take the Trait. The values: `chance`, optional: the chance, above 0 and at most 1; `among`, optional: a Set Query of who may take it, or `null` for any Hero. `traits update <key> encounter-trait <at> [chance=…] [among=…]`, its place as `traits uses` gives it.

### `encounter-has-trait`: has-trait in an Encounter's Queries

- **Where:** `content/encounters.json`, holding Hero Traits' keys.
- **What reads it:** A `["has-trait", key]` predicate in any Query of an Encounter: a Check's score, a harm's `among`, a trait consequence's `among`. Read by the Query evaluator (`has-trait`).
- **Its uses of a key:** Each `["has-trait", key]` anywhere in an Encounter.
- **Removal:** a use here refuses the Trait's removal, naming it.
- **Adding a use:** The Set Query at the path is filtered to the Heroes holding the key: `["where", <Set>, ["has-trait", key]]`. The target: `encounter`, the Encounter's key; `path`, the path, within the Encounter, of a Set Query: `checks.0.score.1`. `traits assign <key> encounter-has-trait encounter=… path=…`.
- **Removing a use:** Where it filters a `where`, the `where` becomes its Set unfiltered; in an `and` or `or`, it is taken out (one of two left stands alone). Anywhere else it is refused: ask the owner how the Query should read without it. `traits unassign <key> encounter-has-trait <at>`, its place as `traits uses` gives it.
- **Changing a use:** a use here is the key alone: take it out and add another.

### `synergy-has-trait`: has-trait in a Synergy's requires

- **Where:** `content/synergies.json`, holding Hero Traits' keys.
- **What reads it:** A `["has-trait", key]` predicate in a Synergy's conditions on the Party (DL-148 item 20). Read by the Query evaluator (`has-trait`).
- **Its uses of a key:** Each `["has-trait", key]` anywhere in a Synergy.
- **Removal:** a use here refuses the Trait's removal, naming it.
- **Adding a use:** With a path, the Set Query there is filtered as an Encounter's is. Without one, the condition `[">=", ["count", ["where", "party", ["has-trait", key]]], 1]` is added to `requires`, which must be written as Queries. The target: `synergy`, the Synergy's key; `path`, optional: the path, within the Synergy, of a Set Query. `traits assign <key> synergy-has-trait synergy=… [path=…]`.
- **Removing a use:** Where it filters a `where`, the `where` becomes its Set unfiltered; in an `and` or `or`, it is taken out (one of two left stands alone). Anywhere else it is refused: ask the owner how the Query should read without it. The condition `add` makes without a path is taken out of `requires` whole. `traits unassign <key> synergy-has-trait <at>`, its place as `traits uses` gives it.
- **Changing a use:** a use here is the key alone: take it out and add another.

### `biography-sentences`: Biography sentences by Trait

- **Where:** `content/descriptions.json`, holding Guildmaster and Hero Traits' keys.
- **What reads it:** The sentences a Biography draws for a Trait held: a Guildmaster's under `biography.traits`, a Hero's under `heroBiography.traits` (v1.1.3-S1). Read by the Biography (`biography-and-portrait`).
- **Its uses of a key:** Each sentence of the key's list under `biography.traits` or `heroBiography.traits`.
- **Removal:** a use here refuses the Trait's removal, naming it.
- **Adding a use:** The sentence is added at the end of the key's list, under its own list's place, which is made where there is none. The target: `sentence`, the sentence, with the slots a Biography fills: `{He}`, `{his}`. `traits assign <key> biography-sentences sentence=…`.
- **Removing a use:** The sentence is taken out of the key's list, and the list with it once empty. `traits unassign <key> biography-sentences <at>`, its place as `traits uses` gives it.
- **Changing a use:** The sentence is put in place of the one there, keeping its place in the list. The values: `sentence`, the sentence in place of the one there, with the slots a Biography fills: `{He}`, `{his}`. `traits update <key> biography-sentences <at> sentence=…`, its place as `traits uses` gives it.

### `portrait-callings`: A Calling's suits and clashes

- **Where:** `content/descriptions.json`, holding Guildmaster Traits' keys.
- **What reads it:** A Guildmaster Trait a picture's Calling suits or clashes with (v1.1.3-S1, DL-134 item 4). Read by the Portrait choice (`biography-and-portrait`).
- **Its uses of a key:** Each Calling whose `suits` or `clashes` names the key.
- **Removal:** a use here refuses the Trait's removal, naming it.
- **Adding a use:** The key is added at the end of the Calling's `suits` or `clashes`; one already in the other is refused. The target: `calling`, the Calling's key; `side`, `suits` or `clashes`. `traits assign <key> portrait-callings calling=… side=…`.
- **Removing a use:** The key is taken out of that list. `traits unassign <key> portrait-callings <at>`, its place as `traits uses` gives it.
- **Changing a use:** a use here is the key alone: take it out and add another.

### `portrait-features`: A Feature's shows

- **Where:** `content/portrait-appearances.json`, holding Hero Traits' keys.
- **What reads it:** A Hero Trait a picture's Feature shows, a scar Scarred (v1.1.3-S1): a Hero holding it is given a picture with it. Read by the Portrait choice (`biography-and-portrait`).
- **Its uses of a key:** Each Feature whose `shows` names the key.
- **Removal:** a use here refuses the Trait's removal, naming it.
- **Adding a use:** The key is added at the end of the Feature's `shows`, which is made where there is none. The target: `feature`, the Feature's key. `traits assign <key> portrait-features feature=…`.
- **Removing a use:** The key is taken out of the Feature's `shows`, and `shows` with it once empty. `traits unassign <key> portrait-features <at>`, its place as `traits uses` gives it.
- **Changing a use:** a use here is the key alone: take it out and add another.

## In the engine and the content's checks

The Trait helpers, whose call is a read of a Trait to the drift test: `engine/src/traits.ts`: `traitOf`, `excludeEachOther`, `excludedPair`, `heroTraitOf`, `heroTraitEffects`, `traitStatModifiers`, `traitEncounterBonus`, `mayEarn`, `replacedBy`; `engine/src/guildmaster.ts`: `guildmasterTraitsOf`, `traitEffects`, `traitMoraleShift`, `traitUpkeepFactor`, `traitStatBonuses`; `engine/src/create.ts`: `guildmasterTraitCost`.

### `trait-lists`: The two lists, and a key's Trait

- **Reads:** A Trait by its key, in either list or in its own (rule 5: a key no list defines bears on nothing); the Guildmaster Traits in order, for setup and the draw.
- **Traits:** Guildmaster and Hero.
- **Where it reads them:** `engine/src/traits.ts`: `traitOf`, `heroTraitOf`, `heroTraitEffects`, `excludedPair`; `engine/src/guildmaster.ts`: `guildmasterTraitsOf`.
- **Through:** `engine/src/traits.ts`: `excludeEachOther`.

### `effective-stats`: A Hero Trait's Stat changes, in statBreakdown and effectiveStats

- **Reads:** The sum of the `statModifiers` of the Hero Traits a Hero holds, added to the base beside the Guildmaster's Class bonus and gear in `statBreakdown`, whose total is `effectiveStats`, so it shows wherever a Stat shows: every Check, Query, harm share, the estimate, the Roster and a Hero's page (DL-148 item 24, DL-186 item 3).
- **Traits:** Hero; effects `statModifiers`.
- **Where it reads them:** `engine/src/traits.ts`: `traitStatModifiers`; `engine/src/selectors.ts`: `statBreakdown`.

### `encounter-bonus`: The Check's Encounter bonus

- **Reads:** The `flat` of each `encounterBonus` of a Hero Trait any Hero still in the sequence holds, once for the Party, on an Encounter of its `kinds` or `tags`, added to every Check's capability but a raw one's (DL-148 item 26).
- **Traits:** Hero; effects `encounterBonus`.
- **Where it reads them:** `engine/src/traits.ts`: `traitEncounterBonus`; `engine/src/quest-engine/check.ts`: `capability`.

### `guildmaster-effects`: The Guildmaster's Trait readers

- **Reads:** Each effect of the Guildmaster's Traits: a Class Stat bonus in `statBreakdown`, whose total is `effectiveStats`, a Morale shift in the Morale baseline, an Upkeep factor in Upkeep (DL-43, DL-150 item 8).
- **Traits:** Guildmaster; effects `classStatBonus`, `guildMoraleShift`, `upkeepFactor`.
- **Where it reads them:** `engine/src/guildmaster.ts`: `traitEffects`, `traitMoraleShift`, `traitUpkeepFactor`, `traitStatBonuses`; `engine/src/morale.ts`: `moraleBaselineFor`; `engine/src/selectors.ts`: `upkeepParts`, `statBreakdown`.

### `guildmaster-setup`: Setup's Trait budget, and the drawn Guildmaster's Traits

- **Reads:** A Guildmaster Trait's `cost` against `guildmasterTraitBudget`, at most `guildmasterTraitsMax` of them, no two of which exclude each other: refused at setup (`setupRefusal`), drawn whole for a Rival and for "Choose for me" (DL-102, DL-110).
- **Traits:** Guildmaster.
- **Where it reads them:** `engine/src/create.ts`: `guildmasterTraitCost`, `setupRefusal`, `previewGuildmaster`; `engine/src/generators/guilds.ts`: `drawTraits`, `legalTraitSets`.

### `injury-traits`: The Hero State Engine's Injury Traits

- **Reads:** An Injury's `leavesTrait`, given as it heals, replacing each Trait held that it excludes or that excludes it, each with `hero.trait-lost` (R16, DL-150 item 5).
- **Traits:** Hero; events `hero.trait-lost`.
- **Where it reads them:** `engine/src/phases/hero-state.ts`: `heal`; `engine/src/traits.ts`: `replacedBy`.

### `earned-trait`: The earned-Trait consequence

- **Reads:** A `trait` consequence: drawn on a Triumph and granted on a strong success, or falling on a Hero the Encounter injured on a Failure; never one held, one in conflict, or a second on a Quest. Granted at the Quest's end with `hero.trait-gained` (DL-148 item 25).
- **Traits:** Hero; events `hero.trait-gained`.
- **Where it reads them:** `engine/src/quest-engine/resolve.ts`: `apply`; `engine/src/quest-engine/harm.ts`: `chooseEarner`; `engine/src/phases/quests-conclude.ts`: `conclude`; `engine/src/traits.ts`: `mayEarn`.

### `trait-events`: hero.trait-gained and hero.trait-lost

- **Reads:** The two Trait events, both Milestones (DL-148 item 27, DL-150 item 5), emitted by `earned-trait` and `injury-traits`; the front ends word them.
- **Traits:** Hero; events `hero.trait-gained`, `hero.trait-lost`.
- **Where it reads them:** `engine/src/events.ts`: `milestoneTypes`; `engine/src/phases/hero-state.ts`: `heal`; `engine/src/phases/quests-conclude.ts`: `conclude`.

### `has-trait`: has-trait in a Query

- **Reads:** The `["has-trait", key]` predicate: whether the current Hero holds a Hero Trait content defines (v1.1.4-S1), its row of the Query operators (v1.1.6-S10), and its account for the Board.
- **Traits:** Hero.
- **Where it reads them:** `engine/src/quest-engine/query/operators.ts`: `operators`; `engine/src/quest-engine/describe.ts`: `predAccount`.

### `biography-and-portrait`: The Biography and the Portrait choice

- **Reads:** A person's Traits: a Biography draws a sentence for each Trait held, and a picture is chosen whose Calling suits their Guildmaster Traits and clashes with none, or whose Features show their Hero Traits (v1.1.3-S1).
- **Traits:** Guildmaster and Hero.
- **Where it reads them:** `engine/src/descriptions.ts`: `write`, `describeBlanks`, `describeHero`, `describeNewHero`; `engine/src/portraits.ts`: `giveHeroPortrait`; `engine/src/generators/guilds.ts`: `givePortrait`; `engine/src/create.ts`: `previewGuildmaster`.
- **Through:** `engine/src/portraits.ts`: `preferencesFor`, `callingsOf`, `callingClashes`.

### `document-validator`: The document validator's Traits

- **Reads:** A person's Traits in a saved document: a key their list does not define (`unknown-trait`), and two of which one excludes the other (`excluded-traits`), each a warning.
- **Traits:** Guildmaster and Hero.
- **Where it reads them:** `engine/src/validate.ts`: `unknownTrait`, `excludedTraits`.

### `content-checks`: The content's checks

- **Reads:** Every Trait and every use of one in content (`validateContent`): a key in one list only, exclusions held both ways, each effect's values, and each key a use names defined in its list. The editor checks each pending edit with them.
- **Traits:** Guildmaster and Hero; effects `classStatBonus`, `guildMoraleShift`, `upkeepFactor`, `statModifiers`, `encounterBonus`.
- **Where it reads them:** `content/src/validate.ts`: `validateContent`, `checkPortraitAppearances`, `longestDescriptions`, `checkDescriptions`, `checkEncounters`, `checkConsequence`, `checkTraits`, `queryKeys`; `engine/src/quest-engine/query/problems.ts`: `queryArgument`.

<!-- The register's part ends. -->
