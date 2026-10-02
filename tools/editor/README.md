# The content editor

`tools/editor` is the owner's content editor (DL-150 items 7 to 12, v1.1.4-S12): a local page and
the commands under it. Traits are its first kind, and in v1.1.4 its only one; Encounters and the
rest come when the owner asks. It is never built into the game or deployed. The guardrails, and the
register of every use of a Trait, are in [`docs/agents/traits.md`](../../docs/agents/traits.md).

```sh
npm run edit                                        # the page, at http://127.0.0.1:4180/
npm run edit -- traits <command> [--root <dir>] [--json]
```

- **`--root <dir>`** works on another copy of the repository; this one by default. It must hold a
  `package.json`, so that "Finish"'s `npm test` runs there and never climbs above it.
- **`--json`** prints one JSON object on stdout, for a skill to read. A skill runs
  `npm run --silent edit -- traits <command> --json`: without `--silent`, npm writes its own lines
  before the JSON.
- **`--port <n>`** serves the page on another port.
- **Exit codes:** `0` done; `1` a check failed, or a change was refused or undone, so nothing
  changed; `2` a command line the editor could not read.
- **A failure in JSON** is `{ "ok": false, "kind": "usage" | "refused" | "busy" | "undone" |
  "not-undone" | "failed", "problems": ["…"], "uses"?: [...] }`. A removal refused while the Trait is
  used carries `uses`, each `{ entry, file, path, at, blocksRemoval }`. `busy` is a call made while
  "Finish" runs.
- **`recovered`**, in any command's JSON, lists the files it first put back from a "Finish" cut off.

## Pending edits

Each `add`, `change`, `remove`, `assign` and `unassign` is checked with the content's own checks
(`@heroesim/content`) as it is made, and held as pending in `.editor/traits.json` under the root, which git ignores, written
whole or not at all. The file holds each edit as it was made: a row added whole, a change as the
fields it gave (so it never carries an exclusion another edit wrote into it), a removal by its key,
an assignment by its entry and target, an unassignment by its entry and place.
Whenever it is read, the edits are made again on the content as it is on disk, so the page and
separate command lines share them, and nothing in the content's files changes before `finish`. Every
list of edits is checked before it is saved, a removal's and a discard's too. An edit that no longer
applies, because the content changed under it, is named, to be dropped with `discard`; a file that
cannot be read is dropped whole by `discard`. The doctor holds the pending edits to the content's
checks and names their problems.

## Commands

| Command | What it does |
| --- | --- |
| `traits list` | Every Trait of both lists, with the pending edits made: fields, effects in words, uses, the rules that read it |
| `traits show <key>` | One Trait |
| `traits find <text>` | The Traits whose key, name, effects or uses hold the text, ignoring case, each with what matched |
| `traits uses <key>` | Every use in content, through the register, and the rules that read the Trait |
| `traits add <list> <key>` | Adds a Trait to `guildmaster` or `hero`. Its key, lower case and hyphens, is fixed from now on |
| `traits change <key>` | Changes the fields given; the key never changes |
| `traits remove <key>` | Removes a Trait; refused while it is used, naming every use |
| `traits assign <key> <entry> [<field>=<value> ...]` | Adds a use of a Trait in other content, through the register's entry; `--target <json or @file>` gives the fields too |
| `traits unassign <key> <entry> <at>` | Takes a use out, by its place as `uses` gives it (`injuries.json: deep-cut.leavesTrait`, or `deep-cut.leavesTrait`) |
| `traits pending` | The pending edits |
| `traits discard [<key>]` | Drops one Trait's pending edits, or all |
| `traits finish` | Writes the pending edits, raises the content version, runs `npm test` |
| `traits doctor` | The drift and freshness checks, the content's checks, and whether the pending edits apply |
| `traits recover` | Puts back the files of a "Finish" cut off; every command does it first |
| `traits doc` | Writes `docs/agents/traits.md`'s register part from the register |

`add` and `change` take the fields as flags: `--name <text>`, `--cost <n>` (a Guildmaster Trait's),
`--excludes a,b` or `--no-excludes`, `--effects <json>`, or all at once as `--row <json>` or
`--row @file.json`; a flag wins over the same field of the row.

```sh
npm run edit -- traits add hero brave --name Brave --excludes scarred \
  --effects '[{ "kind": "encounterBonus", "flat": 2, "kinds": ["combat"] }]'
```

- **The effects** are each list's known kinds (DL-150 item 8), a new kind being an engine change.
  Each is an object with its `kind` and these fields, as the content's checks hold them:

  | List | `kind` | Fields | Example |
  | --- | --- | --- | --- |
  | Guildmaster | `classStatBonus` | `classKey`, a Class; `statKey`, a Hero Stat; `delta`, a whole number other than 0 | `{ "kind": "classStatBonus", "classKey": "warrior", "statKey": "weaponry", "delta": 1 }` |
  | Guildmaster | `guildMoraleShift` | `delta`, a number other than 0, added to the Morale baseline | `{ "kind": "guildMoraleShift", "delta": 5 }` |
  | Guildmaster | `upkeepFactor` | `factor`, above 0, times Upkeep | `{ "kind": "upkeepFactor", "factor": 0.9 }` |
  | Hero | `statModifiers` | `modifiers`, Hero Stats each with a whole number other than 0 | `{ "kind": "statModifiers", "modifiers": { "dexterity": -2, "endurance": -1 } }` |
  | Hero | `encounterBonus` | `flat`, a number other than 0 added to every Check; `kinds`, Encounter kinds, and `tags`, kebab-case Encounter tags, one of them at least | `{ "kind": "encounterBonus", "flat": 2, "kinds": ["combat"] }` |

  A Guildmaster Trait's `cost` follows DL-100 item 3: a buff costs, and a penalty refunds.
- **An exclusion is held both ways,** as the content's checks require: setting a Trait's `excludes`
  writes the other Trait's too, and removing a Trait takes it out of every other's.
- **A Trait added and removed** in one session goes with its edits, as if never made, where the
  edits left pass the content's checks; where another edit still names it, its removal is held
  after them.

## Assigning a use

A Trait's key stands in other content: an Injury's `leavesTrait`, an Encounter's `trait` consequence,
a `has-trait` in a Check, a harm or a Synergy, the Biography sentences, a Calling's `suits` and
`clashes`, a Feature's `shows`, and other Traits' `excludes`. `assign` and `unassign` (v1.1.4-S13,
DL-150 item 13) add and take out such a use through the register's entry for it, which says how, and
are pending edits like the rest: checked with the content's checks as they are made, written by
"Finish". [`docs/agents/traits.md`](../../docs/agents/traits.md) gives each entry, what it does and its
target's fields, as `traits assign <key> <entry> <field>=…`.

```sh
npm run edit -- traits assign lame injury-leaves-trait injury=broken-arm
npm run edit -- traits assign scarred encounter-trait encounter=ambush-on-the-road degree=triumph chance=0.05
npm run edit -- traits assign short-winded biography-sentences "sentence={He} wheezes on the stairs."
npm run edit -- traits unassign lame injury-leaves-trait shattered-knee.leavesTrait
```

- **A field's value** is read as JSON where it is JSON (`chance=0.05`) and as text where it is not
  (`path=checks.0.score.1`). A value of JSON with quotes in it (`among`) goes through a file:
  `--target @target.json`, the shell then having nothing to strip.
- **A field the entry does not name** is refused, as is a Trait of the other list (an Injury leaves a
  Hero Trait), and anything the content's checks refuse.
- **Taking out a `has-trait`** the register cannot take out with its Query keeping a meaning (one
  inside a `not`, say) is refused: the owner decides how that Query is rewritten.

## Finish

1. It writes each changed file into its own layout (the portrait tool's `editJson`, keeping a row on
   one line where it was), so `git diff` shows only what changed.
2. It raises the content version by one, with a line in its comment naming the edits.
3. It runs `npm test`, its lines shown as they come (on stderr, or on the page).
4. If any test fails, every file is put back and the edits stay pending; the failures are reported.
   Otherwise the edits it read are cleared.

It never commits: read `git diff`, and commit it yourself. The test run is a dependency
(`TestRunner`, `npm test` by default), so the editor's own tests run a planted `npm test` in their
scratch copy rather than the whole suite inside itself.

- **Its journal is a lock.** Before it writes a file it writes `.editor/finish.json`, whole or not at
  all: the bytes of every file it will write, the content version and its process. While that process
  runs, every command and every call of the page's API is refused as `busy`, and the page's controls
  wait. The journal goes when "Finish" ends, passed or put back.
- **Cut off,** by a crash or a kill, it leaves the content written and untested, and its journal. The
  next command, whichever it is, the doctor included, first puts every file back from the journal and
  says so (`recovered`); `traits recover` does only that. Ctrl+C and SIGTERM put the files back at
  once, before the process ends.

## The page

`npm run edit` serves `page/` from the repository on 127.0.0.1, at desktop widths, through a small
JSON API (`src/server.ts`) over the same core as the commands. A table of each list shows each
Trait's effects, excludes, cost, uses and the rules that read it; forms add and change a Trait, the
effects offered from its list's kinds and its key fixed once made; Remove names every use when it is
refused; "Finish" shows the test run's lines and its result, every control waiting while it runs.

Only its own page may call the API: a request whose Host is not `127.0.0.1:<port>` or
`localhost:<port>` (a name rebound to this machine) or whose Origin is another page's is refused
(403), and a request that changes anything must be sent as `application/json` (415), which no other
site's form can send without asking first.

## The register and its checks

- **The register** (`content/src/uses/`) lists every place a Trait's key stands in content, and how a
  use is found, added and removed there, and every rule of the engine and check of the content that
  reads a Trait.
- **The drift test** (`src/drift.test.ts`) reads `engine/src/` and `content/src/validate.ts`, tests
  left out, with TypeScript's parser (`src/reads.ts`), a call of one of the register's Trait helpers
  counting as a read, and fails on a read of a Trait in a
  declaration the register does not list, on a listed declaration that reads none, and on a
  declaration the register runs through that is gone.
- **The freshness test** (`src/freshness.test.ts`) fails when `docs/agents/traits.md`'s register
  part is not what the register makes now; `traits doc` writes it.

## Tests

`npm test` runs them with the rest, each on a scratch copy of the repository made a git repository,
so that `git status` shows what each command left behind. The page's one pass in Chromium, through
the Playwright the page's specs install, is skipped where Chromium is not installed.
