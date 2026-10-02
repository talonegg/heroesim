---
name: portrait-intake
description: Takes the Portrait uploads in media/inbox/ into the game through the portrait tool, each read by portrait-reader and checked by portrait-checker, duplicates and variants left in the inbox. Use when the owner has dropped pictures in the inbox, or asks to intake, add or take in Portraits.
---

# Portrait intake

Every upload in `media/inbox/<role>/[male|female]/` is either taken into the game, with its row
read by one agent and checked by a second, or left in the inbox as a duplicate or a variant, with
its reason. The tool makes every change; this skill judges.

Read `docs/agents/portraits.md` first: its guardrails bind every step, and its rules bind every row.

**The root.** Commands run from the repository root. For a trial on a scratch copy, add
`--root <dir>` to every tool command, read the pictures under `<dir>`, and pass `<dir>` to the
agents as the root.

**The draft** is `intake-draft.json` in the session's scratchpad directory, or the system's temp
folder: outside the repository, so it never shows in `git status`.

## 1. The uploads

List the pictures (`.jpg`, `.jpeg`, `.png`, `.webp`) under `media/inbox/guildmaster/` and
`media/inbox/hero/`, however deep. With none, say so and stop. Note `git status`, to report beside
the intake's own changes.

Done when: every upload is listed with its role (its first folder) and its folder's sex, if any.

## 2. Fingerprints

```sh
npm run portraits -- fingerprint <each inbox folder holding a picture> --json
```

Each file's `similar` names the pictures in the register within the fingerprint's distance, and
`similarUploads` the other uploads within it.

Done when: every upload is marked **clear** (no `similar`, no `similarUploads`) or **near**, with the
keys and uploads it is near and their distances.

## 3. Near matches

For each near upload, send `portrait-reader` Task B for each key or upload it is near:

- a key's picture is `media/portraits/<guildmasters|heroes>/<sex>/<key>.webp`;
- a near key that is `retired` has no picture: report the upload as near a retired picture and
  leave it for the owner.

Then:

- **duplicate** of a picture in the game: left in the inbox, reported.
- **variant** of a picture in the game: left in the inbox, reported for the owner, who alone may
  add it or swap it.
- **different** from all it is near: it goes on, as a clear upload.
- **Two uploads** a duplicate or variant of each other: the first by path goes on, and the others
  are left in the inbox, reported as that upload's duplicate or variant.

Done when: every near upload has a verdict for each match, with the reader's reasons.

## 4. Readings

For each upload going on, send `portrait-reader` Task A: the upload's path under the root, its role,
its folder's sex, and the root. Fan out as `docs/agents/portraits.md` says: waves of 8, one picture
to a call.

**Earlier readings.** A decision record may already read some uploads, by what each shows rather
than by its file: DL-134 item 8 reads four of the owner's 40. Find each one's upload by looking at
the pictures with the Read tool, and send its reader that row too, as where the row starts. The
report gives the earlier value beside each field that departs from it. The keys are those intake
gives: a record's are provisional (DL-136 item 4).

Done when: every upload going on has a draft, its `lengths` within the bounds.

## 5. Checks

For each draft, send `portrait-checker` the picture, its role, its folder's sex, the root and the
draft's `row`, `sex` and `anachronism`. Same waves.

Done when: every field of every draft has the checker's verdict.

## 6. Agreement

For each field the checker disputes:

1. A dispute on **the rules** is settled by fixing the row: a bound, an undefined term, clothing or
   an ethnicity in the narrative, a slot in a hook.
2. A dispute on **sight** goes back to the reader once, with the checker's reason. Take the value
   both then agree on.
3. Still apart: keep the value that keeps the rules and is the more cautious (the wider age range,
   the Temper both name, the Feature both see), and record the disagreement for the owner.
4. **The sex** stays the folder's. A differing reading is recorded, with both agents' reasons.

Done when: every upload going on has one row that keeps every rule, and every disagreement is
listed with its resolution.

## 7. The draft

Write the draft (the tool's README, `write-rows`, has its shape):

```json
{
  "report": "…",
  "pictures": [{ "source": "media/inbox/guildmaster/male/1790763974495.jpg", "row": { … } }]
}
```

`source` is relative to the root. Give `sex` only for an upload with no sex folder: the agents'
reading. The report, in Markdown, holds, in this order:

1. **The readings**, one section per picture taken, headed `{{key:<n>}}` and its source. A table of
   every field: the row's value, the reader's reason, the checker's verdict and reason, and the
   resolution. Then the setting, any anachronism flag and any proposal.
2. **Disagreements**: every one, with what each agent said and what was written.
3. **Left in the inbox**: each duplicate and variant, what it matches, the distance and the
   reader's reasons.
4. **Possibly anachronistic**: each picture flagged, taken in all the same (DL-137 item 3).
5. **Proposed terms**, for `portrait-analyse`.
6. The line: "Every row here is the agents' reading, `portrait-reader` checked by
   `portrait-checker`, for the owner to change."

With nothing to take in, `pictures` is `[]`: the tool writes the report alone.

Done when: the draft holds every row agreed in step 6, and its report every item above.

## 8. Write the rows

```sh
npm run portraits -- write-rows <draft> --json
```

- **Exit 0.** Note the keys given, the content version's change and the report's path.
- **Exit 1** (`refused` or `undone`): nothing changed. Fix what each problem names in the draft,
  and run it again. An upload the tool refuses as too large to fit takes no fix: take it out of the
  draft, and list it in the report as left in the inbox, with the tool's words.

Then `npm run portraits -- check`.

Done when: `write-rows` exits 0 and `check` passes.

## 9. Tell the owner

Give the report's path; each key given, with its source; each upload left in the inbox and why; the
disagreements; the pictures flagged as possibly anachronistic; and that `git status` and `git diff`
show the rest, for the owner to review and commit.
