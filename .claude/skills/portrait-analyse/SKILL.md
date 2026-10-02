---
name: portrait-analyse
description: Reads every Portrait in the game again against its row, counts the corpus, finds gaps, text over bounds, unused terms, duplicates, variants and possibly anachronistic pictures, drafts the missing Biography sentences, and writes a dated analysis run through the portrait tool. Changes nothing live. Use when the owner asks to analyse, review or refresh the Portraits or their sentence lists.
---

# Portrait analysis

A run reads the whole corpus again and writes a dated report beside a recommended
`portraits.json`, `portrait-appearances.json` and `descriptions.json`, for the owner to review
and `portrait-apply`. Nothing live changes: the tool's `write-run` writes only under
`docs/portraits/analysis/`.

Read `docs/agents/portraits.md` first: its guardrails bind every step, and its rules bind every row
and sentence.

**The root.** For a trial on a scratch copy, add `--root <dir>` to every tool command, read the
pictures under `<dir>`, and pass `<dir>` to the agents as the root.

**The draft** is `analysis-draft.json` in the session's scratchpad directory, or the system's temp
folder, outside the repository. It starts as the three live files, whole, and every recommendation
is a change to it.

## 1. The count

```sh
npm run portraits -- corpus --json
npm run portraits -- check
```

`corpus` gives each picture with its files and row, the counts by role, sex, band and Class, the
`gaps`, `overBounds`, the unused `vocabulary`, the `sentences` lists with those `short` of three,
the `similar` pairs, and the content's `warnings`.

Done when: you hold the corpus's JSON and `check` has passed; a failure of `check` is the report's
first finding.

## 2. Every picture read again

For each listed picture, send `portrait-checker` the picture's file, its role, its sex (as its
folder, the owner's word), the root and its current row. Fan out in waves of 8.

- A dispute on **the rules** becomes a recommended change to the row.
- A dispute on **sight** goes to `portrait-reader` Task A for a fresh reading of that field. Where
  both agree the row is wrong, the change is recommended; where they do not, it is listed for the
  owner and the row kept.
- Each `anachronism` flag, and each `proposals` term, is collected, together with the pictures the
  intake reports under `docs/portraits/intake/` list as possibly anachronistic: every one of them
  is listed in this report, whether or not the checker flags it again.

Done when: every listed picture has the checker's verdict on every field, and every dispute is a
recommended change or an item for the owner.

## 3. Duplicates and variants

For each `similar` pair, send `portrait-reader` Task B. A duplicate or a variant is listed for the
owner. Nothing is retired or swapped by this skill.

Done when: every similar pair has a verdict.

## 4. Terms

Gather the proposed terms: from step 2, and from the intake reports under `docs/portraits/intake/`.
A proposal two or more pictures call for goes in the draft, defined, with those pictures' rows
using it; the rest are listed. A new Calling or Temper brings its sentence lists in step 5.

Done when: every proposal is in the draft or listed, with its reason.

## 5. Sentences

For every key in `sentences.short`, and every key a new term adds, draft sentences until it holds
at least three. Fan out by family, as `docs/agents/portraits.md` says: one general-purpose Opus
agent a family, given **The rules for a sentence**, the key's existing sentences, the Traits a
Calling `suits` and `clashes` with, and each band's ages. New sentences are appended; no existing
sentence is changed.

Then check the draft:

```sh
npm run portraits -- corpus --draft <draft> --json
```

Done when: `content.ok` is true, `sentences.short` is empty, `overBounds` is empty, and
`content.longest` is within `content.bounds`. Fix and count again until it is.

## 6. The report

The draft's `report`, in Markdown, holds, in this order:

1. **Summary**: the pictures, the gaps, the changes recommended, the sentences drafted.
2. **The corpus**: tables of Guildmaster pictures by sex and band, and Hero pictures by Class, sex
   and band, from `corpus`.
3. **Gaps**: each cell short of three, and what a person there shows (the Silhouette where none).
4. **Every picture read again**: per picture, the checker's view of each field, and each change
   recommended with its reason.
5. **Text over its bounds**, from `overBounds`.
6. **Unused terms**, from `vocabulary`, and **proposed terms**, adopted or listed.
7. **Duplicates and variants**, with the reader's reasons.
8. **Possibly anachronistic**: each picture flagged and what looks modern. They stay in the game;
   the owner may replace them later (DL-137 item 3).
9. **Sentences drafted**: every new sentence, by list and key, each marked "(agent's)".
10. **Commission next**, in order: the empty cells first, then those with one, then two; within a
    count, Guildmasters before Heroes and the cells S5's and S6's people fall in most (young and
    middle bands). Each entry names the role, sex, band, Class and the kind of person wanted.
11. The line: "Every row change and sentence here is the agents' wording, for the owner to change."

Done when: every section above is written, empty ones saying "None".

## 7. Write the run

```sh
npm run portraits -- write-run <draft> --json
```

Exit 1 (`refused`) names what fails the content's checks; fix the draft and run it again. Then:

```sh
npm run portraits -- corpus --run <run>
npm run portraits -- diff <run>
```

Done when: `write-run` exits 0, `corpus --run` shows no short key, and `git status` shows only the
new files under `docs/portraits/analysis/`.

## 8. Tell the owner

Give the report's path and the run's name; the counts of changes and sentences drafted; the gaps and
the commissions first in order; the pictures flagged; and that `portrait-apply <run>` puts the run
in place once they have read it and its `diff`.
