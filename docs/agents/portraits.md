# Portraits: the skills, the agents and their rules

How the Portraits' pictures and their words come into the game (DL-135 item 11, v1.1.3-S3). The
tool, `tools/portraits` (its README has every command), does each change to a file. The skills and
agents read the pictures and write the words.

| Skill | Run it to | It writes |
| --- | --- | --- |
| `portrait-intake` | take the uploads in `media/inbox/` into the game | through `write-rows`: pictures, register, rows, content version, `docs/portraits/intake/<run>.md` |
| `portrait-analyse` | read the whole corpus again, count it, and draft the missing sentences | through `write-run`: `docs/portraits/analysis/<run>.md` and `<run>/`; nothing live |
| `portrait-apply` | put an analysis run the owner has reviewed in place | through `apply`: the three content files, and the content version |

| Agent | Does |
| --- | --- |
| `portrait-reader` (Opus) | reads one picture and drafts its row; compares two pictures |
| `portrait-checker` (Opus) | looks at the picture beside a row and confirms or disputes each field |

## Running them

Ask Claude Code for the skill by name, from the repository root: "run portrait-intake", "run
portrait-analyse", "apply the analysis run 2026-10-02". Each works on the current branch.

- **Intake.** Drop the uploads in `media/inbox/guildmaster/` or `media/inbox/hero/`, in `male/`
  and `female/` where you know the sex. The folder is your word for the role and the sex.
- **Analyse** after an intake, or whenever the corpus or its sentence lists want a look.
- **Apply** only a run you have read: its report and its `diff`.
- **A trial** runs on a scratch copy: every tool command takes `--root <dir>`, and the skills pass
  it on.

After each, read the report and `git diff`, change any row or sentence you wish, and commit, naming
the report. The skills never commit or push.

## Guardrails

- **Every file change is a tool command:** `write-rows`, `write-run` or `apply`. The skills edit no
  content, media or register file by hand. Their drafts are written outside the repository.
- **Nothing is committed or pushed** by a skill.
- **A variant is never added or swapped** without the owner. It stays in the inbox, reported.
- **Every row and sentence the agents write is marked the agent's** in its report, for the owner to
  change.
- **A picture is never held back** for looking modern: it is taken in, and listed (DL-137 item 3).

## The rules for a row

A row in `content/portrait-appearances.json` (DL-127, DL-134 item 3, DL-135 item 2, DL-138). The
content's checks refuse a row that breaks a bound or names an undefined term; the rest is the
agents' to keep.

| Field | Guildmaster | Hero | Rule |
| --- | --- | --- | --- |
| `apparentAge` | required | required | `[from, to]`, whole years the face could pass for, about 8 to 12 apart. The bands it touches are `descriptions.json`'s `ageBands` |
| `station` | required | required | One of `descriptions.stations` |
| `temper` | required | required | One of `descriptions.tempers`: the manner the face shows |
| `callings` | 1 or 2 | none | Keys of `descriptions.callings`: what they did before the chair |
| `classes` | none | 1 or more | Keys of `content/classes.json` |
| `features` | optional | optional | Keys of `features`, each clearly visible; a `maleOnly` one on a male picture only |
| `narrative` | required | required | 2 or 3 sentences, at most 260 characters |
| `hooks` | 0 to 2 | 0 to 2 | Each one sentence, at most 160 characters with the sex's pronouns filled in |

- **The narrative describes the person only:** face, hair, beard, eyes, marks such as scars, and
  bearing. It is written in the third person with the sex's plain pronouns (`she`, `his`), no name
  and no age in years; "fading towards grey" is allowed. Clothing, armour, gear, jewellery,
  spectacles and the room stay out of it (DL-127).
- **No ethnicity.** No field records one, and the narrative names no people, nation, race or skin
  colour. Weathering, lines, freckles and scars are what it describes.
- **A hook** is a Biography sentence for this picture alone, resting on a detail only it shows: a
  map, a medal, a portrait on the wall. It uses the pronoun slots only (`{He}`, `{he}`, `{him}`,
  `{his}`, `{His}`), begins with a capital and ends with a full stop. It suits any name and any age
  within `apparentAge`, and never rests on a modern detail.
- **Terms.** Only terms the content defines go in a row. A new one (a Feature, Temper, Calling) is a
  proposal, reported for `portrait-analyse` to put to the owner.
- **A modern look** (DL-137 item 3): the setting is read as a background, the row is written all the
  same, and the picture is flagged as possibly anachronistic.
- **The sex** is the inbox folder's, the owner's word. A reading that differs is flagged, never
  acted on.
- **The words.** British spelling, the house's plain, dry voice, and the glossary's terms
  capitalised wherever they stand (`docs/agents/ui-text.md`): Quest, Party, Hero, Guild, Mage.

## The rules for a sentence

The sentence lists of `content/descriptions.json`, which `portrait-analyse` drafts (DL-134 items 4
and 6, DL-135 item 11, DL-138 item 3).

- **The form** the content checks: trimmed, a capital first and a full stop last, and no brace but a
  slot's.
- **The slots.** The pronouns' (`{He}`, `{he}`, `{him}`, `{his}`, `{His}`) everywhere. `{birthplace}`
  only in a Guildmaster's `origins` and `stationOrigins`, followed by a comma or a full stop. A
  `temperClosings` sentence is shared by both roles, so it has no `{birthplace}`; a Hero's
  `heroBiography` sentences and a hook have none either.
- **The band.** A sentence keyed by band fits every age in it: a young career is a short one.
- **The length.** About 70 to 150 characters. `corpus`'s `content.longest` keeps the longest
  Biography within 1,000.
- **The words** as for a row: no clothing as a person's description, no ethnicity, British spelling,
  the glossary's terms capitalised.
- **Enough.** Each key holds at least three sentences (v1.1.3-S4), each saying something the others
  do not.

## Fanning out

Each agent reads one picture, so many pictures are read in parallel.

- **Waves of 8.** Send up to 8 Agent calls in one message, each with its own picture. The owner's 40
  are 5 waves of readers, then 5 of checkers. Start a picture's checker as soon as its reader
  returns, where the wave allows.
- **One call per picture per agent**, so no reading leans on another picture's.
- **The answers are JSON**, kept short. Collect them into the draft as they return, outside the
  repository.
- **One transaction.** `write-rows` takes every agreed row of an intake in one call, so an intake
  raises the content version once.
- **Sentences by family.** `portrait-analyse` drafts its sentence lists with one general-purpose
  Opus agent per family (`stationOrigins` with `temperClosings`; `callingCareers`;
  `heroBiography.classes`; the Hero's `backgrounds`, `traits` and `closings`; the Guildmaster's
  `traits`), in one wave.

Where the `portrait-reader` and `portrait-checker` types are not yet registered in a session (a new
file is read when a session starts), spawn a `general-purpose` agent with `model: opus` and pass the
agent file's body as the start of its prompt.
