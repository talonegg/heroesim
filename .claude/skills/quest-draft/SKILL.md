---
name: quest-draft
description: Drafts a Quest template from the owner's brief - its Tiers (three consecutive at least), its Beats with their lines and pools in the order a lower Tier plays them, any overrides, its Finale and its other fields - through the content editor's quests commands, held as pending and held to quests doctor, then writes a draft for the owner's review and runs "Finish" only on their approval. Use when asked to draft, write, add or extend a Quest template, its Tiers, Beats or narrative lines, or to widen the Tiers a template offers.
---

# Quest draft

Turns a brief ("a village's bell lies drowned in the mere; raise it") into a Quest template held as
pending edits, through the editor's `quests …` commands, then shows the owner a draft of what each
Tier plays before anything is written. The editor makes every change and every check; this skill
decides what to ask it for, and in what order the story is told.

Read `docs/agents/quests.md` first: its guardrails and shared steps bind every step. The words are
`CONTEXT.md`'s (Quest template, Tier, Beat, Encounter, Finale, Deadly); the commands and their forms
are `tools/editor/README.md`'s "Quest templates and Encounters". An Encounter the template needs and
the content lacks is `encounter-draft`'s (step 4).

**The root.** Commands run from the repository's root; for a trial on a scratch copy, add
`--root <dir>` to every command. Every command below is `npm run --silent edit -- quests … --json`.
**The scratchpad** is the session's scratchpad directory, or the system's temp folder, outside the
repository: row files and the review draft go there.
**The shell** is a POSIX one (Claude Code's Bash tool): Windows PowerShell strips the double quotes
from a JSON argument such as `'pool={"kinds":["social"]}'`.

## 1. The doctor

Follow `docs/agents/quests.md`, "The steps every session shares", step 1: `quests doctor --json`.

Done when: it reports `"ok": true`, its notes are named to the owner, and any pending edits are ones
the owner has said to keep.

## 2. The template's fields

- **Its peers.** `quests list --json`, then `quests show <key>` for the two or three nearest the brief
  in Sphere, tags and Tiers: their fields are the model for the ones the brief leaves open.
- **A new template:** `quests show <key> --json` exits 1, `refused`, "is not a Quest template", where the key is free. A key
  is lower case words joined by hyphens, fixed once made. **An existing one** is changed in place
  (step 5); its key and its offered Quests stay.
- **The fields** are `content/src/kinds/quest-templates.ts`'s: `name`; `sphereKeys` and `skillKeys`
  from `content/spheres.json` and `skills.json`; `tags`, the words its Encounters share (an Encounter
  sharing one is drawn `encounterTagWeight` times as often), taken from those Encounters carry;
  `requires` (`classKey`, `skillKey`, or `{}`); `lootTableKey` or `null`; `rewardPerDifficulty` and
  `fameEffect` near its peers'; `partySizeMin`, 2 or more (DL-266).
- **The Tiers** (DL-257 item 1): at least three consecutive (Q25 c), `tierMin` to `tierMax`, where the
  brief's danger and length sit on the ladder. The ladder is `npm run edit -- config show`'s
  `questTiers`: each Tier's difficulty band, Days, Beats, Loot, factors, `deathScale` and
  `fameMinimum`. A Tier with `deathScale` above 0 makes a Quest Deadly where an Encounter it may draw
  has a Death chance (DL-265).

Done when: every field has a value from the brief or a peer, and the owner's brief says nothing the
fields contradict.

## 3. The story, in the order the Tiers play it

A Quest at a Tier of k Beats plays the template's **first** k − 1 Beats and then the Finale, or its
first k without one (DL-262, `beatsPlayed`). So the lowest Tier tells the story's opening and its end,
and each Tier above adds the Beats after. Write the Beats in that order:

1. The Beat count: the most any offered Tier plays, less one for a Finale. A Beat no Tier plays is
   dead text (the doctor notes it).
2. Each Tier's story: write out, for every Tier, its Beats' lines in order and the Finale's last. Each
   must read whole on its own: an opening, a middle where it has one, an end. Reorder or reword until
   every Tier's does. An override of a Tier's `beats` (step 5) changes where its story stops.
3. **A line** is one short sentence the Party builder shows: a capital first, a full stop last, the
   glossary's terms capitalised (`docs/agents/ui-text.md`), no figure, no Hero named.
4. **A pool** is what a Beat may draw, by `kinds`, `tags` and named `encounters` (a kind and a tag
   both given: an Encounter of the kind that shares a tag). `encounters list --json` gives each
   Encounter's kind and tags. A pool must hold one Encounter, and one more for each earlier Beat whose
   pool shares an Encounter with it (`shortBeats`); a Finale is in no pool, not even one whose kinds
   and tags match it (`quests show` leaves it out of the draws).
5. **The Finale** is the Encounter the story ends on, named, with its line. It must be an Encounter no
   pool names: in practice one of its own. An Encounter made a Finale leaves every pool that drew it by
   kind or tag, the shipped templates' too.

Done when: every Tier's story is written out and reads whole, and each Beat has a pool.

## 4. Encounters the content lacks

Hand off to `encounter-draft`, in the same session, before the Beat that needs it, when:
- a pool the story wants is short (the content's check refuses it, naming the Beat and what it needs),
  or holds Encounters that do not fit the line;
- the template ends on a Finale of its own, which no other template or pool uses;
- the brief has a scene no Encounter of any kind plays.

Its edits are held in the same `.editor/quests.json`, so a Beat may name an Encounter still pending.
Run its steps 1 to 3 (the Encounter pending, its targets not yet set), come back to step 5 here with
its key, and run its steps 4 and 5 after step 5 here: its calibration aims a Finale by the template
that ends on it, and the doctor fails an Encounter no Beat or Finale plays.

Done when: every Encounter the pools and the Finale name exists, in content or pending.

## 5. The edits

A new template: write its fields, Tiers, Beats and Finale to `<scratchpad>/<key>.json` as one JSON
object, and pass it whole, so no shell strips its quotes:

```sh
quests add <key> --row @<scratchpad>/<key>.json --json
```

A change to one (or a part after `add`):

```sh
quests change <key> --row @<scratchpad>/<key>-change.json --json      # only the fields that change
quests tiers <key> <min> <max> --json
quests beat add <key> [<at>] "line=<text>" 'pool=<json>' --json
quests beat change <key> <at> ["line=<text>"] ['pool=<json>'] --json
quests beat move <key> <from> <to> --json
quests beat remove <key> <at> --json
quests override set <key> <tier> <figure>=<value> ... --json
quests override clear <key> <tier> [<figure> ...] --json
quests finale set <key> <encounter> "line=<text>" --json
quests finale clear <key> --json
```

- **Exit 0.** The edit is pending; `quests show <key>` gives the template as it now stands.
- **Exit 1, `refused`.** Nothing is held. Fix what each problem names and run it again.
- **An override** only where the brief asks a Tier of this template to differ from the ladder (a
  shorter opening Tier, a Fame minimum): name it in the draft with its reason.

Done when: `quests pending --json` lists the edits, and `quests show <key>` plays every Tier as step 3
wrote it.

## 6. The doctor again, and the draft for review

An Encounter handed off in step 4 has its steps 4 and 5 run first. Then run `quests doctor --json`
(step 1). It must report `"ok": true`; a note on this template is fixed
(a Beat no Tier plays is moved, or taken out) unless the owner wants it.

Then write `<scratchpad>/quest-draft-<key>.md` from `quests show <key>` and `--json`:

- the brief, and the template's fields in a line each;
- **each Tier**: its figures (difficulty band, Days, Beats, Loot, `fameMinimum`, the reward and XP
  factors), the overrides marked as the template's, whether it may be Deadly (`deathScale` above 0
  and an Encounter its Beats or Finale may draw with a Death chance: `encounters show <key>`);
- **the story each Tier plays**: its lines in order, the Finale's last, each with its pool and the
  Encounters it may draw;
- any Encounter `encounter-draft` drafted for it, with its own draft's path, and where its review
  calibration ran, this template's rows in its "## The templates";
- the doctor's reading, and `quests pending`'s list.

Show the owner the draft, and ask: approve, change, or drop it. A change returns to the step it
touches; the draft is written again.

Done when: the owner has approved the draft as it stands, or said to drop it.

## 7. Finish, or discard

**Approved:**

```sh
quests finish --json
```

It writes every pending edit, the Encounters' too, raises the content version once and runs
`npm test`, a few minutes; run it in the background where the session allows, and wait for it. Follow
`docs/agents/quests.md`'s step 3 on `undone`, then run the doctor again (step 1).

**Dropped**, or a trial: `quests discard <key> --json`, and `encounters discard <key> --json` for each
Encounter drafted for it; then `quests pending --json` lists none of them.

Done when: `finish` exits 0 and the doctor after it reports `"ok": true` with no pending edits; or the
edits are discarded.

## 8. Tell the owner

Give the template's key, its Tiers and the story each plays (or the draft's path), the Encounters
drafted with it, the files `changed`, the content version's change and the tests' result; or that
the draft was discarded. Content that changes play is proved as `delivery.md` says: a quick run and
`compare`. `git diff` shows the rest, for the owner to review and commit.
