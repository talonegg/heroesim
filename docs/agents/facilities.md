# Facilities and their grades: the rules for the editor

How the Hall's Facilities and their grades are added, changed and removed (DL-297, the v1.2.2 story
S3). Two places hold it:
- The content editor, `tools/editor`, makes each change: a Facility, its effects and upkeep, and its
  grades, the Improvements. How it works is [`tools/editor/README.md`](../../tools/editor/README.md):
  its commands, pending edits, "Finish", its journal and `busy`, `recover`, `--root`, JSON and the
  exit codes.
- This page holds the rules.

What a Facility, a grade and an Improvement are is in `CONTEXT.md`; what the Hall reads of them in
`engine/src/facilities.ts`; the kind's checks are `content/src/kinds/facilities.ts`,
`improvements.ts` and `facility-effects.ts`, the effects' description the editor's forms derive from.

```sh
npm run --silent edit -- facilities <command> --json
```

## Guardrails

- **The only route** (DL-297). Every Facility and grade is added, changed and removed through the
  editor's `facilities` commands. `content/facilities.json` and `content/improvements.json` are not
  edited by hand or by a script of a session's own.
- **Content only, never a save.** The editor changes what the game ships. No saved game, `.saves/`
  file or document of a world is read for an edit or changed.
- **One session for both files,** `.editor/facilities.json`: a Facility added and its grades are
  checked as one, and `finish` writes both files, raising the content version once.
- **A key is fixed once made:** a new key is a new row. A grade's is its Facility's and its number,
  `quarters-2`; its Facility and number are fixed too.
- **The order is the Hall's.** Facilities stand in content's order, which is every Hall's and a
  Rival's build order. A Facility added stands last. A Disposition that writes a `buildOrder` must
  list every Facility once, so adding a Facility is refused until it does.
- **A Facility in use is not removed:** a grade or a `buildOrder` that names it is changed first, each
  use named. Take the grades out from the top (`facilities grade remove`).
- **The grades run 1 to n, with no gap, any n,** and each holds a value for exactly its Facility's
  effects. A kind of effect is added to a Facility with `facilities effect add`, with its value at
  grade 0 and at every grade in one hold, and taken out with `effect remove`; a Facility keeps one
  effect at least.
- **A change the content's checks refuse is refused,** naming why: a heal factor not above 0, an upkeep
  not a whole number of 0 or more, a grade with no value for an effect. Nothing is held.
- **A new kind of effect** is an engine change (`engine/src/content-types.ts`'s
  `facilityEffectKinds`, the Hall's reading in `engine/src/facilities.ts`, the description in
  `facility-effects.ts`), made on the owner's request. **A value** is a tuning value of the rows, and
  changes here: the tuning pass (v1.2.4) changes them through these commands.
- **Content that changes play is proved as `delivery.md` says:** a quick run and `compare`.
- **Nothing is committed or pushed** by the editor. Read `git diff`, and commit it yourself.
- **Edits left pending** at a session's end are named to the owner, never left silently.

## The steps every session shares

1. **The doctor.** `npm run --silent edit -- facilities doctor --json` runs the content's checks and
   its own: every grade names a Facility, each Facility's grades run 1 to n and hold its effects,
   each grade costs more than the one below, every build order lists each Facility once; and holds the
   pending edits to all of them. Run it before acting and again after "Finish". It must report
   `"ok": true` both times. Edits already pending are named to the owner before more are added. A note
   (`!`), a grade that does no more than the one below, or content with no Facility that heals (the
   harness's policy builds the first that does), fails nothing: tell the owner. The doctor notes them
   on the files, not on pending edits; and `npm test` refuses a grade that does no more on the shipped
   content (DL-53), so "Finish" fails with one.
2. **When the doctor fails,** read each problem: its file and path (`improvements.json: quarters-2`),
   or the content check's (`improvements.quarters-2.effects`). Fix the content through the commands, or
   drop the edits at fault with `facilities discard`.
3. **"Finish"** ends a session's edits. It writes both files, raises the content version and runs
   `npm test`, a few minutes. When it is undone, read each failure for what it holds:
   - *the edit at fault*: change the edit, or discard it, and finish again;
   - *a test that pins the content as shipped*: show it to the owner, as `delivery.md`'s rule 4 says.
     With their word the test is changed, as code, in the same change, and "Finish" run again;
     without it the edit is discarded.
4. **Tell the owner** the edits finished, the content version's change, and that `git diff` shows
   them.
5. **A new content file is read by the page through Vitest's transform cache.** After a content file
   is added, `web/src/content.test.ts` may read it as missing until `node_modules/.vitest-cache` is
   deleted once.

## Each story's close

- **A story that touches the engine** (`engine/src/`) or the content's checks
  (`content/src/validate.ts` and the content kinds, `content/src/kinds/`) runs
  `npm run edit -- facilities doctor` at its close, beside the traits and quests doctors, and records
  all three readings.
- **A story that changes a Facility or a grade** does it through the editor. Its DL entry names the
  "Finish" and the content version it raised.
