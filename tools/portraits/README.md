# The portrait tool

`tools/portraits` converts, registers, fingerprints and checks the Portraits' pictures, and takes
them into the content (DL-135 item 11, v1.1.3-S2). It also counts the corpus and compares an
analysis run with the content (v1.1.3-S3). It does the mechanical steps; the judgement,
what a picture shows and whether an upload is already in the game, is the portrait skills' and
agents' (v1.1.3-S3, `docs/agents/portraits.md`), which call it for every change to a file.

```sh
npm run portraits -- <command> [--root <dir>] [--json]
```

- **Chromium draws every picture,** through the Playwright the page's specs install
  (`npx playwright install chromium`). No image package joins the repository.
- **`--root <dir>`** works on another copy of the repository; this one by default.
- **`--json`** prints one JSON object on stdout, for a skill to read. Without it, the tool writes
  lines for a person.
- **Exit codes:** `0` done; `1` a check failed, or a change was refused or undone, so nothing
  changed; `2` a command line the tool could not read.
- **A failure in JSON** is `{ "ok": false, "kind": "usage" | "refused" | "undone" | "not-undone" |
  "failed", "problems": ["…"] }`, each problem naming its file, key or field. `not-undone` (exit 1)
  is a failure some of whose changes could not be put back: every other file was, and each one left
  is named "not put back" (v1.1.3-S8).

## Files

| Path | What it holds |
| --- | --- |
| `media/portraits/<role folder>/<sex>/<key>.webp` | A picture: 480 × 640 WebP, at most 120 kB |
| `media/portraits/<role folder>/<sex>/<key>.thumb.webp` | Its thumbnail: 160 × 213 WebP, at most 12 kB (about 10 kB) |
| `media/portraits/registry.json` | The register: every key ever issued |
| `media/inbox/guildmaster/`, `media/inbox/hero/` | Uploads, ignored by git; each may hold `male/` and `female/` |
| `content/version.json` | The content version and its changelog, raised by an intake and an apply (v1.1.6-S4) |
| `docs/portraits/intake/<run>.md` | An intake's report |
| `docs/portraits/analysis/<run>.md`, `<run>/` | An analysis run: its report, and its recommended `portraits.json`, `portrait-appearances.json` and `descriptions.json`. Once a run is applied its folder is removed, the content holding its files and git their history; the report stays (DL-218) |

A run is named by its date, `2026-10-02`, and a second run on a day is `2026-10-02-2`.

The roles are `guildmaster` (keys `gm-<sex>-<nn>`, folder `guildmasters/`) and `hero` (keys
`hero-<sex>-<nn>`, folder `heroes/`). A third role is one row of `roles` in `src/registry.ts`.

## The register

```json
{
  "fingerprint": { "method": "…", "bits": 512, "similarWithin": 104, "tuning": "…" },
  "portraits": {
    "gm-male-01": { "role": "guildmaster", "sex": "male", "status": "live", "hash": "<128 hex>", "trimmed": ["<128 hex>", "… 9 in all"] }
  }
}
```

- **Keys are never reused.** `nextKey(role, sex)` is one past the highest number ever issued to
  that role and sex, `live` or `retired`, so a retired picture's key is never given again. Saves
  hold keys.
- **The fingerprint** is a difference hash (dHash) drawn in Chromium:
  1. the picture is cropped to 3 × 4, drawn at 192 × 256, turned grey and blurred;
  2. it is averaged to 17 × 16 and 16 × 17 cells;
  3. each bit says whether a cell is brighter than the next across (256 bits) or down (256 bits).
- **`trimmed`** holds the same hash of the picture with 5% trimmed: all round, from each edge and
  from each corner.
- **The distance** between two pictures is the fewest bits between one's `hash` and the other's
  `hash` or `trimmed`, either way round. They are **similar** within `similarWithin` bits.
- **The tuning** is on the owner's 40 (DL-136):
  - the two originals are 8 and 5 bits from their WebP;
  - a 5% crop of any of the 40 is at most 74 bits from its picture;
  - the other 38 are at least 133 bits from either picture in the game, and any two of the 40 are
    at least 132 apart.

  So 104 sits midway between 74 and 133.

## Commands

### `convert <source>... [--out <dir>]`

Converts each upload for a trial, and changes nothing else.

- **What it writes.** `<name>.webp` and `<name>.thumb.webp`, beside the source or in `--out`.
- **How.** The upload is cropped, centred, to 3 × 4, then written at the first quality from 0.8
  down to 0.5 at which it fits.
- **A refusal.** An upload that does not fit at 0.5 is refused with its size (exit 1).
- **A WebP source** needs `--out`, since its picture would write over it.
- **JSON:** `{ "converted": [{ "source", "picture": { "file", "bytes", "quality" }, "thumbnail": { … }, "natural": { "width", "height" } }] }`.

### `fingerprint <file or folder>... [--nearest <n>]`

Fingerprints each picture named, or every picture in a folder, however deep: the inbox, say. It
compares each with the register and with the others named, and changes nothing.

```json
{
  "bits": 512,
  "similarWithin": 104,
  "files": [
    {
      "file": "C:\\…\\media\\inbox\\guildmaster\\male\\1790740777932.jpg",
      "hash": "<128 hex>",
      "similar": ["gm-male-01"],
      "nearest": [{ "key": "gm-male-01", "role": "guildmaster", "sex": "male", "status": "live", "distance": 8, "similar": true }],
      "similarUploads": [{ "file": "…", "distance": 40 }]
    }
  ]
}
```

- **`nearest`** gives the `--nearest` closest keys (5 by default), retired ones among them.
- **`similar`** names those within `similarWithin`.
- **`similarUploads`** names the other files of this call that are similar to this one.
- **An exact copy** of a picture in the game is some bits away, not 0, since a JPEG and its WebP
  draw a little differently. The skill's reader decides each near match: a duplicate, a variant
  or different (DL-135 item 11).

### `check`

The tool's own checks, alone.

- **The register and `media/`.**
  - Every `live` key has its picture and thumbnail.
  - Every picture and thumbnail has its key, `live`, in its role's and sex's folder.
- **The register and the content.**
  - Every `live` key is listed in `content/portraits.json` under its role and sex.
  - Every key listed there is `live`.
  - Every `live` key has a row in `content/portrait-appearances.json`.
- **The sizes.** Each picture is 480 × 640 within 120 kB, and each thumbnail 160 × 213 within 12 kB.

It exits 1 on any failure, and names each.

**JSON:** `{ "ok", "live", "failures": [{ "code", "message", "key"?, "file"? }] }`. The codes are
`register`, `missing-picture`, `missing-thumbnail`, `unregistered-file`, `retired-file`,
`misplaced-file`, `unlisted-key`, `listed-not-live`, `missing-row`, `oversized`, `wrong-size` and
`content-file`.

### `write-rows <draft.json> [--date YYYY-MM-DD]`

The rest of intake, once the agents have agreed each upload's row. It is one transaction, and on
any failure every file is put back as it was, and every file and folder it made is removed:

1. it converts each upload;
2. it names each by `nextKey`, and registers it with the fingerprint of its WebP;
3. it lists the key in `content/portraits.json`, and adds the row to
   `content/portrait-appearances.json`, each file keeping its layout (see **The content's layout**);
4. it raises the content version in `content/version.json`, with a line of its changelog
   (v1.1.6-S4);
5. it runs the content's own checks (`@heroesim/content`) and `check`;
6. it writes the report, `docs/portraits/intake/<run>.md`, and deletes the uploads it took in.

A draft with no pictures writes only the report: for an intake whose uploads were all duplicates
or variants, left in the inbox. `write-rows` does not look for duplicates itself. `fingerprint`
comes first.

**The draft:**

```json
{
  "date": "2026-10-02",
  "report": "Markdown: what was read from each picture and why, every disagreement, and each duplicate and variant left in the inbox. {{key:0}} is the key the first picture is given.",
  "pictures": [
    {
      "source": "media/inbox/guildmaster/male/1790763974495.jpg",
      "sex": "male",
      "row": { "apparentAge": [34, 44], "…": "the picture's row in portrait-appearances.json" }
    }
  ]
}
```

| Field | Required | What it is |
| --- | --- | --- |
| `date` | no | The run's date, `YYYY-MM-DD`. `--date` comes before it, and today where neither is given |
| `report` | yes | The report's text, in Markdown. `{{key:<n>}}` becomes the key given to `pictures[n]` |
| `pictures[].source` | yes | The upload, relative to the root: under `media/inbox/<role>/`, whose folder says its role |
| `pictures[].sex` | where the folder has no `male/` or `female/` | The agents' reading. Where it differs from the folder's, the report says so |
| `pictures[].role` | no | Must agree with the inbox folder where given |
| `pictures[].row` | yes | The row, as `portrait-appearances.json` holds it under `portraits.<key>`. The tool adds it as it is, and the content's checks judge it |

A draft that cannot be taken is refused before anything changes (exit 1, `kind: "refused"`),
each problem named by its field: `pictures[2].source: … does not exist`.

**The report** is `# Portrait intake <run>`, then the draft's text, then a table of each upload,
its key, role and sex, and its picture's and thumbnail's bytes and quality, then the content
version's change.

**JSON:** `{ "ok": true, "run", "report", "contentVersion": { "from", "to" } | null, "pictures": [{ "source", "key", "role", "sex", "folderSex", "picture": { "bytes", "quality" }, "thumbnail": { … }, "hash" }] }`.

### `write-run <draft.json> [--date YYYY-MM-DD]`

Writes an analysis run from the agents' draft. Nothing live changes.

- **The draft:** `{ "date"?, "report", "portraits", "portraitAppearances", "descriptions" }`.
  - `report` is Markdown, and its heading `# Portrait analysis <run>` is added where it has none.
  - The other three are the recommended `portraits.json`, `portrait-appearances.json` and
    `descriptions.json`, whole. Each is written in the live file's layout, so it differs from it
    only where it changes.
- **A refusal.** A draft whose three files fail the content's own checks (v1.1.3-S3), or the tool's
  `check` as `apply` runs it (v1.1.3-S8), is refused before anything is written (exit 1), each
  problem named: a run that could not be applied is never written.
- **JSON:** `{ "ok": true, "run", "report", "files": [...] }`.

### `corpus [--run <run> | --draft <draft.json>]`

Counts the corpus, for the `portrait-analyse` skill, and changes nothing.

- **`--run <run>`** reads an analysis run's three files in place of the content's, so a run is
  counted before it is applied.
- **`--draft <draft.json>`** reads a `write-run` draft's three in their place, so a draft is counted
  and checked before it is written.

- **`pictures`.** Each picture `content/portraits.json` lists, and each key the register holds
  `live`: its role, sex, `status` (`live`, `retired` or `unregistered`), whether it is `listed`,
  its `picture` and `thumbnail` files relative to the root with whether each `exists`, its `row`
  (or `null`), and the age `bands` its `apparentAge` touches.
- **`counts`.** Guildmaster pictures by sex and band, and Hero pictures by Class, sex and band. A
  picture counts in every band it touches, and a Hero's in each of its Classes.
- **`gaps`.** Each of those cells with fewer than three pictures: `{ role, sex, band, class?, count }`.
- **`overBounds`.** Each narrative over 260 characters, hook over 160 with its sex's pronouns, and
  picture with more than two hooks: `{ key, field, length, limit }`.
- **`vocabulary`.** For the Stations, Tempers, Callings, Features and Classes, the pictures `used`
  by each term, and the terms `unused`.
- **`sentences`.** Every key of the sentence lists the Biographies draw from, with its count, and
  those `short` of `wanted`, three:
  - `biography`: `origins`, `careers` and `closings` by band; `backgrounds` by Guild Background;
    `traits` by Guildmaster Trait; `successors`; `stationOrigins` by Station; `callingCareers` by
    Calling and band; `temperClosings` by Temper;
  - `heroBiography`: `backgrounds` by Hero Background; `classes` by Class and band; `traits` by Hero
    Trait; `closings` by band.
- **`similar`.** Each pair of keys in the register, `live` or `retired`, within `similarWithin`.
- **`content`.** Whether the content's own checks pass on these files, their `problems` and
  `warnings`, and the `longest` Birthplace, Appearance and Biographies they can write, beside
  their `bounds`.

A run or draft that is not there, or both at once, is refused (exit 1). `source` says where the
three files were read.

### `diff <run>`

What `apply <run>` would change, by each JSON path rather than by line, so a file the run rewrites
in another layout shows only what differs. It changes nothing.

- **An object** is compared key by key.
- **A list of strings or numbers** is compared by its items: each item `added` or `removed` is
  named. The same items in another order are `reordered`, since a list's order chooses which
  picture a draw gives.
- **Any other value** that differs is `changed`, whole.

**JSON:** `{ "run", "files": [{ "file", "from", "changes": [{ "path", "kind", "before"?, "after"? }] }] }`.
The text marks each change `+`, `-`, `~` or `↕`.

### `apply <run>`

Puts an analysis run's three files in place of the content's, as one transaction:

1. it writes the run's value of each file that differs into the live file, keeping its layout;
2. it raises the content version;
3. it runs the content's checks and `check`.

It is undone as a whole on any failure. A run that is the content already changes nothing.

**JSON:** `{ "ok": true, "run", "changed": [...], "contentVersion": { "from", "to" } | null }`.

## The content's layout

The content's JSON is laid out by hand: the Features' values aligned, a sentence list opened out
even where it would fit on a line, and a role's picture lists on one line while they fit (the
Heroes' and Patrons') and a key to a line once they do not (the Guildmasters', since v1.1.3-S4).
`write-rows`, `write-run` and `apply` write a changed value into the file's own text (`editJson`, of
content's write module, `@heroesim/content/write`, which the content editor shares since v1.1.6-S4,
with the transaction, the content's checks and the version's raise), so `git diff` shows only what
changed:

- a value that is unchanged keeps its text, byte for byte, and the file its LF or CRLF line ends;
- a member or item added to an object or list laid over several lines is laid out as the sibling
  beside it: a new row as the rows, a new Feature aligned with the Features, a new sentence on its
  own line. The line before it gains a comma, and nothing else changes;
- any other value that changes is laid out as the tool lays out a new file: on one line where it
  fits within 100 columns, and opened out two spaces deep where it does not.

A run's files may be laid out any way: `apply` takes their value, not their text.

## Tests

`npm test` runs them with the rest.

- **`chromium.test.ts`** converts and fingerprints the committed pictures, re-encoded and cropped.
- **`write-rows.test.ts`** takes uploads into a scratch copy of the repository, made a git
  repository, and reads `git status` to prove a failure leaves it as it was.
- **`write-rows.test.ts`** also proves of `git diff` after an intake and an apply that each content
  file changes only its own lines; content's `src/write/json-edit.test.ts` writes each content file
  unchanged, and adds a sentence, a Feature, a row and a key.
- **`corpus.test.ts`** counts the corpus as shipped and in a scratch copy, with a run's files in
  place of the content's, and diffs a run written through the command line.
- **`owner.test.ts`** reads the owner's 40, from `HEROESIM_OWNER_PICTURES` or
  `..\heroesim-inbox\guildmaster\`, and is skipped where they are absent, as in CI.
- **Chromium.** The Chromium tests are skipped where it is not installed. CI installs it before
  `npm test`.
