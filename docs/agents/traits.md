# Traits: the editor, the register and their rules

How Traits are found, added, changed, removed and used in other content (DL-150 items 7 to 16,
v1.1.4-S12). The content editor, `tools/editor` (its README has every command), makes each change
to a Trait. The register, `content/src/uses/`, lists every place a Trait is used, in content and in
the engine; the editor finds a Trait's uses through it. The part of this file after the guardrails
is written from the register; the rest is written by hand.

```sh
npm run edit                                   # the page, on this machine only
npm run edit -- traits <command> [--root <dir>] [--json]
```

## Guardrails

- **Every change to a Trait goes through the editor:** its page or its commands. No Trait file,
  and no use of a Trait in other content, is edited by hand.
- **A key is fixed once made** (DL-150 item 9). Its name, effects, excludes and a Guildmaster
  Trait's cost change; a new key is a new Trait.
- **Each edit is checked as it is made** with the content's own checks, and held as pending in
  `.editor/traits.json`, which git ignores, until "Finish".
- **"Finish" runs `npm test`** (DL-150 item 11). It writes the files and raises the content version
  by one; if any test fails, every file is put back and the edits stay pending. It takes as long as
  the suite, a few minutes.
- **Nothing is committed or pushed** by the editor. Read `git diff`, and commit it yourself.
- **A Trait in use is not removed** (DL-150 item 10). The refusal names every use; change each
  first. Other Traits' `excludes` do not count: the editor takes the Trait out of them itself.
- **An exclusion is held both ways.** Setting a Trait's `excludes` writes the other Trait's too.
- **The effects offered are each list's known kinds** (DL-150 item 8). A new kind is an engine
  change, made on request.
- **Content only** (DL-150 item 16). The editor changes what the game ships, never a saved game.
- **The doctor first.** `npm run edit -- traits doctor` runs the drift and freshness checks and the
  content's checks. When it reports drift, update the register (`content/src/uses/register.ts`), run
  `npm run edit -- traits doc`, and include both in the change.
- **A trial** runs on a scratch copy: every command takes `--root <dir>`, a copy holding a
  `package.json`.
- **For a skill,** `npm run --silent edit -- traits <command> --json`: stdout is then one JSON object.
- **While "Finish" runs** every other command is refused as `busy`. A "Finish" cut off by a crash or
  a kill is put back by the next command, which says so (`recovered`).

<!-- The register's part begins: written by `npm run edit -- traits doc` from content/src/uses/register.ts. Do not edit it by hand. -->

## The register

Every place a Trait is used: 8 in content, where a Trait's key stands, and 12 rules of the engine and checks of the content that read a Trait. The editor's `uses` and `find` read the first; the drift test holds the second to the code.

| Entry | Where | Holds | Refuses removal | Add | Remove |
| --- | --- | --- | --- | --- | --- |
| `excludes` | guildmaster-traits.json, hero-traits.json | guildmaster, hero | no | yes | yes |
| `injury-leaves-trait` | injuries.json | hero | yes | yes | yes |
| `encounter-trait` | encounters.json | hero | yes | yes | yes |
| `encounter-has-trait` | encounters.json | hero | yes | yes | yes |
| `synergy-has-trait` | synergies.json | hero | yes | yes | yes |
| `biography-sentences` | descriptions.json | guildmaster, hero | yes | yes | yes |
| `portrait-callings` | descriptions.json | guildmaster | yes | yes | yes |
| `portrait-features` | portrait-appearances.json | hero | yes | yes | yes |

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
- **Adding a use:** Each Trait's `excludes` names the other, both ways, as the content's checks hold. The target: `trait`, the other Trait's key, of the same list.
- **Removing a use:** The key is taken out of that Trait's `excludes`, and that Trait out of the key's, both ways.

### `injury-leaves-trait`: An Injury's leavesTrait

- **Where:** `content/injuries.json`, holding Hero Traits' keys.
- **What reads it:** The Hero Trait an Injury leaves as it heals (R16), replacing any it conflicts with (DL-150 item 5): read by the Hero State Engine (`injury-traits`).
- **Its uses of a key:** Each Injury whose `leavesTrait` is the key.
- **Removal:** a use here refuses the Trait's removal, naming it.
- **Adding a use:** The Injury's `leavesTrait` is set to the key; an Injury that leaves another Trait is refused. The target: `injury`, the Injury's key.
- **Removing a use:** The Injury's `leavesTrait` is set to `null`: it leaves no Trait.

### `encounter-trait`: An Encounter's trait consequence

- **Where:** `content/encounters.json`, holding Hero Traits' keys.
- **What reads it:** A Trait earned on a Quest (DL-148 item 25): positive in a `triumph` list, granted on a strong success; negative in a `failure` list, on a Hero that Encounter injured. Read by the resolver (`earned-trait`).
- **Its uses of a key:** Each `{ "kind": "trait" }` consequence, in any of an Encounter's lists, whose `traitKey` is the key.
- **Removal:** a use here refuses the Trait's removal, naming it.
- **Adding a use:** A `{ "kind": "trait", "traitKey", "chance", "among"? }` is added at the end of the Encounter's `triumph` or `failure` list. An Encounter with no `triumph` list, whose Triumph reads its `success` list, is given one copied from it first, so a Triumph brings what it brought. The target: `encounter`, the Encounter's key; `degree`, `triumph` (a positive Trait) or `failure` (a negative one); `chance`, the chance, above 0 and at most 1; `among`, optional: a Set Query of who may take it.
- **Removing a use:** The consequence is taken out of its list.

### `encounter-has-trait`: has-trait in an Encounter's Queries

- **Where:** `content/encounters.json`, holding Hero Traits' keys.
- **What reads it:** A `["has-trait", key]` predicate in any Query of an Encounter: a Check's score, a harm's `among`, a trait consequence's `among`. Read by the Query evaluator (`has-trait`).
- **Its uses of a key:** Each `["has-trait", key]` anywhere in an Encounter.
- **Removal:** a use here refuses the Trait's removal, naming it.
- **Adding a use:** The Set Query at the path is filtered to the Heroes holding the key: `["where", <Set>, ["has-trait", key]]`. The target: `encounter`, the Encounter's key; `path`, the path, within the Encounter, of a Set Query: `checks.0.score.1`.
- **Removing a use:** Where it filters a `where`, the `where` becomes its Set unfiltered; in an `and` or `or`, it is taken out (one of two left stands alone). Anywhere else it is refused, to be changed by hand.

### `synergy-has-trait`: has-trait in a Synergy's requires

- **Where:** `content/synergies.json`, holding Hero Traits' keys.
- **What reads it:** A `["has-trait", key]` predicate in a Synergy's conditions on the Party (DL-148 item 20). Read by the Query evaluator (`has-trait`).
- **Its uses of a key:** Each `["has-trait", key]` anywhere in a Synergy.
- **Removal:** a use here refuses the Trait's removal, naming it.
- **Adding a use:** With a path, the Set Query there is filtered as an Encounter's is. Without one, the condition `[">=", ["count", ["where", "party", ["has-trait", key]]], 1]` is added to `requires`, which must be written as Queries. The target: `synergy`, the Synergy's key; `path`, optional: the path, within the Synergy, of a Set Query.
- **Removing a use:** Where it filters a `where`, the `where` becomes its Set unfiltered; in an `and` or `or`, it is taken out (one of two left stands alone). Anywhere else it is refused, to be changed by hand.

### `biography-sentences`: Biography sentences by Trait

- **Where:** `content/descriptions.json`, holding Guildmaster and Hero Traits' keys.
- **What reads it:** The sentences a Biography draws for a Trait held: a Guildmaster's under `biography.traits`, a Hero's under `heroBiography.traits` (v1.1.3-S1). Read by the Biography (`biography-and-portrait`).
- **Its uses of a key:** The key's list of sentences under `biography.traits` or `heroBiography.traits`.
- **Removal:** a use here refuses the Trait's removal, naming it.
- **Adding a use:** The sentence is added at the end of the key's list, under its own list's place, which is made where there is none. The target: `sentence`, the sentence, with the slots a Biography fills: `{He}`, `{his}`.
- **Removing a use:** The key's list of sentences is taken out, every sentence in it.

### `portrait-callings`: A Calling's suits and clashes

- **Where:** `content/descriptions.json`, holding Guildmaster Traits' keys.
- **What reads it:** A Guildmaster Trait a picture's Calling suits or clashes with (v1.1.3-S1, DL-134 item 4). Read by the Portrait choice (`biography-and-portrait`).
- **Its uses of a key:** Each Calling whose `suits` or `clashes` names the key.
- **Removal:** a use here refuses the Trait's removal, naming it.
- **Adding a use:** The key is added at the end of the Calling's `suits` or `clashes`; one already in the other is refused. The target: `calling`, the Calling's key; `side`, `suits` or `clashes`.
- **Removing a use:** The key is taken out of that list.

### `portrait-features`: A Feature's shows

- **Where:** `content/portrait-appearances.json`, holding Hero Traits' keys.
- **What reads it:** A Hero Trait a picture's Feature shows, a scar Scarred (v1.1.3-S1): a Hero holding it is given a picture with it. Read by the Portrait choice (`biography-and-portrait`).
- **Its uses of a key:** Each Feature whose `shows` names the key.
- **Removal:** a use here refuses the Trait's removal, naming it.
- **Adding a use:** The key is added at the end of the Feature's `shows`, which is made where there is none. The target: `feature`, the Feature's key.
- **Removing a use:** The key is taken out of the Feature's `shows`, and `shows` with it once empty.

## In the engine and the content's checks

The Trait helpers, whose call is a read of a Trait to the drift test: `engine/src/traits.ts`: `traitOf`, `excludeEachOther`, `excludedPair`, `heroTraitOf`, `heroTraitEffects`, `traitStatModifiers`, `traitEncounterBonus`, `mayEarn`, `replacedBy`; `engine/src/guildmaster.ts`: `guildmasterTraitsOf`, `traitEffects`, `traitMoraleShift`, `traitUpkeepFactor`, `traitStatBonuses`; `engine/src/create.ts`: `guildmasterTraitCost`.

### `trait-lists`: The two lists, and a key's Trait

- **Reads:** A Trait by its key, in either list or in its own (rule 5: a key no list defines bears on nothing); the Guildmaster Traits in order, for setup and the draw.
- **Traits:** Guildmaster and Hero.
- **Where it reads them:** `engine/src/traits.ts`: `traitOf`, `heroTraitOf`, `heroTraitEffects`, `excludedPair`; `engine/src/guildmaster.ts`: `guildmasterTraitsOf`.
- **Through:** `engine/src/traits.ts`: `excludeEachOther`.

### `effective-stats`: A Hero Trait's Stat changes, in effectiveStats

- **Reads:** The sum of the `statModifiers` of the Hero Traits a Hero holds, added to the base beside the Guildmaster's Class bonus and gear, so it shows wherever a Stat shows: every Check, Query, harm share, the estimate and a Hero's page (DL-148 item 24).
- **Traits:** Hero; effects `statModifiers`.
- **Where it reads them:** `engine/src/traits.ts`: `traitStatModifiers`; `engine/src/selectors.ts`: `effectiveStats`.

### `encounter-bonus`: The Check's Encounter bonus

- **Reads:** The `flat` of each `encounterBonus` of a Hero Trait any Hero still in the sequence holds, once for the Party, on an Encounter of its `kinds` or `tags`, added to every Check's capability but a raw one's (DL-148 item 26).
- **Traits:** Hero; effects `encounterBonus`.
- **Where it reads them:** `engine/src/traits.ts`: `traitEncounterBonus`; `engine/src/quest-engine/check.ts`: `capability`.

### `guildmaster-effects`: The Guildmaster's Trait readers

- **Reads:** Each effect of the Guildmaster's Traits: a Class Stat bonus in `effectiveStats`, a Morale shift in the Morale baseline, an Upkeep factor in Upkeep (DL-43, DL-150 item 8).
- **Traits:** Guildmaster; effects `classStatBonus`, `guildMoraleShift`, `upkeepFactor`.
- **Where it reads them:** `engine/src/guildmaster.ts`: `traitEffects`, `traitMoraleShift`, `traitUpkeepFactor`, `traitStatBonuses`; `engine/src/morale.ts`: `moraleBaselineFor`; `engine/src/selectors.ts`: `upkeepParts`, `effectiveStats`.

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
- **Where it reads them:** `engine/src/quest-engine/resolve.ts`: `apply`, `earn`; `engine/src/phases/quests-conclude.ts`: `conclude`; `engine/src/traits.ts`: `mayEarn`.

### `trait-events`: hero.trait-gained and hero.trait-lost

- **Reads:** The two Trait events, both Milestones (DL-148 item 27, DL-150 item 5), emitted by `earned-trait` and `injury-traits`; the front ends word them.
- **Traits:** Hero; events `hero.trait-gained`, `hero.trait-lost`.
- **Where it reads them:** `engine/src/events.ts`: `milestoneTypes`; `engine/src/phases/hero-state.ts`: `heal`; `engine/src/phases/quests-conclude.ts`: `conclude`.

### `has-trait`: has-trait in a Query

- **Reads:** The `["has-trait", key]` predicate: whether the current Hero holds a Hero Trait content defines (v1.1.4-S1), and its account for the Board.
- **Traits:** Hero.
- **Where it reads them:** `engine/src/quest-engine/query.ts`: `is`; `engine/src/quest-engine/describe.ts`: `predAccount`.

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
- **Where it reads them:** `content/src/validate.ts`: `validateContent`, `checkPortraitAppearances`, `longestDescriptions`, `checkDescriptions`, `checkEncounters`, `checkConsequence`, `checkTraits`, `operators`, `queryKeys`, `queryArgument`.

<!-- The register's part ends. -->
