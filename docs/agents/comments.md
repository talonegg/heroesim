# Comments

A comment says what a thing is and why it is so, citing the decision-log entry that decided it
(`DL-NNN`, with its item where it has one). The history of past values and of the stories that made
or changed a thing belongs in the decision log, `docs/decision-log.md`, not in the code (v1.1.6-S18,
DL-186 item 27, DL-204).

- **Say what and why.** `/** Days a Transfer Offer stands, the Day it is made included. */`, and
  where the reason is not plain, the reason with its entry: `A season, so that no Hero goes back to a
  Guild that sold them within one (DL-69).`
- **Cite, do not narrate.** Not `90 since the M6 close, for 30` or `0.85 until v1.1.4-S10's balance
  pass, then 0.93`: the log already holds each change and why. A comment's citation is enough to
  find it.
- **No value in a comment that the data holds.** A tuning value lives in `engine/src/config.json`
  (docs/agents/config.md) and a content value in `content/`; a comment that repeats one goes stale
  the day the value changes. Say what the value is for instead.
- **Changelogs are data.** The content version's and the config version's histories are the
  `changelog` lists of `content/version.json` and `engine/src/config.json`, a line for each raise.
- **When a comment's history goes,** check that the log holds it first (search the log for the
  setting or the name). Where it does not, write the gist into the comment as a citation of the entry
  that comes nearest, or into a new entry, rather than lose it.
