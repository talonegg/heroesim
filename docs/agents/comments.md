# Comments

A comment says what a thing is and why it is so, citing the decision-log entry that decided it
(`DL-NNN`, with its item where it has one). The history of past values and of the stories that made
or changed a thing belongs in the decision log, found through `docs/decisions/index.md`, not in the
code (DL-186 item 27, DL-204).

- **Say what and why.** `/** Days a Transfer Offer stands, the Day it is made included. */`, and
  where the reason is not plain, the reason with its entry: `A season, so that no Hero goes back to a
  Guild that sold them within one (DL-69).`
- **Cite, do not narrate.** Not `90 since the M6 close, for 30`, or `0.85 until` a story's balance
  pass, `then 0.93`: the log already holds each change and why. A comment's citation is enough to
  find it.
- **Cite the entry, not the story.** A story's id (a milestone's, a follow-on's or a patch's) names
  when something was built; the DL entry says what was decided and why. `npm test` refuses a comment
  that tells history by a story ("since" or "until" one), and holds the lines that still cite a story
  id at or under the baseline in `tools/decisions/story-citations.json`. A story that rewrites some
  lowers it to the new count, never raises it (DL-219). Tests, their names and their support count as
  source does, but the few files whose story ids are data, which `storyIdsAsData` names (DL-246).
- **No value in a comment that the data holds.** A tuning value lives in `engine/src/config.json`
  (docs/agents/config.md) and a content value in `content/`; a comment that repeats one goes stale
  the day the value changes. Say what the value is for instead.
- **Changelogs are data.** The content version's and the config version's histories are the
  `changelog` lists of `content/version.json` and `engine/src/config.json`, a line for each raise.
- **When a comment's history goes,** check that the log holds it first (search the log for the
  setting or the name). Where it does not, write the gist into the comment as a citation of the entry
  that comes nearest, or into a new entry, rather than lose it.
