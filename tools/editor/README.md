# The content editor

`tools/editor` is the owner's content editor (DL-150 items 7 to 12, v1.1.4-S12): a local page and
the commands under it. Traits are its first kind, and in v1.1.4 its only one; Encounters and the
rest come when the owner asks. It is never built into the game or deployed. The guardrails, and the
register of every use of a Trait, are in [`docs/agents/traits.md`](../../docs/agents/traits.md).

```sh
npm run edit                                        # the page, at http://127.0.0.1:4180/
npm run edit -- traits <command> [--root <dir>] [--json]
```

- **`--root <dir>`** works on another copy of the repository; this one by default.
- **`--json`** prints one JSON object on stdout, for a skill to read.
- **`--port <n>`** serves the page on another port.
- **Exit codes:** `0` done; `1` a check failed, or a change was refused or undone, so nothing
  changed; `2` a command line the editor could not read.
- **A failure in JSON** is `{ "ok": false, "kind": "usage" | "refused" | "undone" | "not-undone" |
  "failed", "problems": ["…"], "uses"?: [...] }`. A removal refused while the Trait is used carries
  `uses`, each `{ entry, file, path, at, blocksRemoval }`.

## Pending edits

Each `add`, `change` and `remove` is checked with the content's own checks (`@heroesim/content`) as
it is made, and held as pending in `.editor/traits.json` under the root, which git ignores. The file
holds each edit as it was made, a row whole; whenever it is read, the edits are made again on the
content as it is on disk, so the page and separate command lines share them, and nothing in the
content's files changes before `finish`. An edit that no longer applies, because the content changed
under it, is named, to be dropped with `discard`.

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
| `traits pending` | The pending edits |
| `traits discard [<key>]` | Drops one Trait's pending edits, or all |
| `traits finish` | Writes the pending edits, raises the content version, runs `npm test` |
| `traits doctor` | The drift and freshness checks, the content's checks, and whether the pending edits apply |
| `traits doc` | Writes `docs/agents/traits.md`'s register part from the register |

`add` and `change` take the fields as flags: `--name <text>`, `--cost <n>` (a Guildmaster Trait's),
`--excludes a,b` or `--no-excludes`, `--effects <json>`, or all at once as `--row <json>` or
`--row @file.json`; a flag wins over the same field of the row.

```sh
npm run edit -- traits add hero brave --name Brave --excludes scarred \
  --effects '[{ "kind": "encounterBonus", "flat": 2, "kinds": ["combat"] }]'
```

- **The effects** are each list's known kinds (DL-150 item 8): a Guildmaster Trait's
  `classStatBonus`, `guildMoraleShift` and `upkeepFactor`; a Hero Trait's `statModifiers` and
  `encounterBonus`. A new kind is an engine change.
- **An exclusion is held both ways,** as the content's checks require: setting a Trait's `excludes`
  writes the other Trait's too, and removing a Trait takes it out of every other's.
- **A Trait added and removed** in one session goes with its edits, as if never made.

## Finish

1. It writes each changed file into its own layout (the portrait tool's `editJson`, keeping a row on
   one line where it was), so `git diff` shows only what changed.
2. It raises the content version by one, with a line in its comment naming the edits.
3. It runs `npm test`, its lines shown as they come (on stderr, or on the page).
4. If any test fails, every file is put back and the edits stay pending; the failures are reported.
   Otherwise the edits are cleared.

It never commits: read `git diff`, and commit it yourself. The test run is a dependency
(`TestRunner`, `npm test` by default), so the editor's own tests run a planted `npm test` in their
scratch copy rather than the whole suite inside itself.

## The page

`npm run edit` serves `page/` from the repository on 127.0.0.1, at desktop widths, through a small
JSON API (`src/server.ts`) over the same core as the commands. A table of each list shows each
Trait's effects, excludes, cost, uses and the rules that read it; forms add and change a Trait, the
effects offered from its list's kinds and its key fixed once made; Remove names every use when it is
refused; "Finish" shows the test run's lines and its result.

## The register and its checks

- **The register** (`content/src/uses/`) lists every place a Trait's key stands in content, and how a
  use is found, added and removed there, and every rule of the engine and check of the content that
  reads a Trait.
- **The drift test** (`src/drift.test.ts`) reads `engine/src/` and `content/src/validate.ts`, tests
  left out, with TypeScript's parser (`src/reads.ts`), and fails on a read of a Trait in a
  declaration the register does not list, on a listed declaration that reads none, and on a
  declaration the register runs through that is gone.
- **The freshness test** (`src/freshness.test.ts`) fails when `docs/agents/traits.md`'s register
  part is not what the register makes now; `traits doc` writes it.

## Tests

`npm test` runs them with the rest, each on a scratch copy of the repository made a git repository,
so that `git status` shows what each command left behind. The page's one pass in Chromium, through
the Playwright the page's specs install, is skipped where Chromium is not installed.
