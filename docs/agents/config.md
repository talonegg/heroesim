# The tuning values

The game's tuning values, every setting of `GameConfig` (`engine/src/config.ts`), have their defaults
in one data file, `engine/src/config.json` (v1.1.6-S18, DL-186 item 15, DL-204). It holds:

- **`sections`**: the settings grouped by what they tune (`world`, `heroes`, `guildmasters`,
  `guilds`, `recruitment`, `board`, `questTiers`, `quest`, `heroState`, `fatigue`, `captain`, `ageing`, `endings`,
  `progression`, `regard`, `patrons`, `guildmasterStats`, `guildmasterRegard`, `transfers`, `loot`,
  `market`). The engine reads them flat, as `defaultConfig`: each setting is in one section, once,
  and the sections hold every setting of `GameConfig` and nothing else (`engine/src/config.test.ts`).
- **`version`**: the config version, written into each new game's `meta.configVersion`, raised
  whenever a default changes, so that `rebase` can offer a game the new defaults (DL-193).
- **`changelog`**: a line for each raise, saying why, citing its decision-log entry.

What each setting is, and why, is said on its field of `GameConfig`; every setting has a rule in
`configRules` (`engine/src/config-check.ts`) that `checkConfig` holds it to.

## Changing a value

A tuning value changes through the content editor's config kind, never by hand:

```sh
npm run edit -- config show [<section>]          # the values, with any pending edits
npm run edit -- config set <setting> <value>     # pending, checked with checkConfig
npm run edit -- config pending                   # what is pending
npm run edit -- config discard [<setting>]       # drop one edit, or all
npm run edit -- config finish --reason "<why> (DL-NNN)"
```

- **`set`** reads the value as JSON where it is JSON (`25`, `0.5`, `{"female":1,"male":3}`,
  `["strong"]`) and as text where not (`warm`), an object's keys in the file's order whatever order
  they are given in. A list is set whole: the Tier ladder as `config set tiers '[{…}, …]'`, every
  Tier's eleven fields given (DL-262, DL-271). Each edit is checked at once with the engine's
  `checkConfig`, with every pending edit made, and refused, naming the
  setting, where a rule refuses it: `boardSizeStart is -1; it is a whole number, at least 0`. A setting
  another's rule reads is named too: a Min set above its Max names the Max. A Tier ladder changed is
  held to the Quest templates on disk as well, by the content's own ladder rules: a Tier past the
  ladder, an override unsound once merged, a Tier playing more Beats than a template has
  (`questTemplates.x: Tier 1 plays 4 Beats, more than its 3 Beats`; DL-270). Edits pending in the
  `quests` kind are not read here, nor a pending ladder by `quests doctor`: with both pending, only
  the second "Finish"'s tests hold them together, so finish one kind before editing the other.
  Nothing is written to the file before `finish`; the edits are held in
  `.editor/config.json`, which git ignores.
- **`finish`** checks the settings again, writes `config.json` in its own layout (only the changed
  values, the version and the changelog's new line change), raises `version` by one with the line
  `<version> from <reason>: <setting> <was> to <value>, ….`, and runs `npm test`. If a test fails, the
  file is put back and the edits stay pending. It never commits. It is the content editor's edit
  session's "Finish", as the Traits' is, sharing its journal and lock (`tools/editor/README.md`).
- **Write the decision first.** A default changed is a balance decision: give it a decision-log
  entry, and cite it in `--reason`.
- **A test whose expected numbers rest on the old value** fails "Finish" for that setting. No test
  pins a default for its own sake: such a pin is removed, and a test that rests on a default either
  passes the value through `testDeps` or changes with it (DL-231 Q10 b). Change those tests in the
  same story, then finish again.
- **Every game's fingerprint moves** with a raise: each save records `meta.configVersion` and the
  whole `meta.config`. Say so in the story's DL entry, with the new fingerprints.

## Adding or removing a setting

That is an engine change, not a tuning one, made by the story that needs it: the field on
`GameConfig` with its what and why, its rule in `configRules`, its value in the right section of
`config.json`, and the config version raised with a changelog line. Keep `config.json`'s sections in
`GameConfig`'s order, since the flat config follows the file (`config.test.ts` holds it).
