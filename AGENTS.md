# heroesim

## Agent skills

### Issue tracker

Issues are tracked in GitHub Issues on `talonegg/heroesim`, using the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

The five default labels: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one root `CONTEXT.md` plus ADRs in `docs/adr/`. See `docs/agents/domain.md`.

### The page's words

Standalone text begins with a capital, and glossary terms are capitalised wherever they stand. See `docs/agents/ui-text.md`.

### Portraits

Pictures come into the game, and their rows and sentences are analysed and applied, through the skills `portrait-intake`, `portrait-analyse` and `portrait-apply` and the portrait tool's commands only. See `docs/agents/portraits.md`.

### Traits

Traits are added, changed, removed and assigned to other content only through the content editor (`npm run edit`), its commands, or the skills `trait-find`, `trait-edit` and `trait-assign`; never by hand, and never in a saved game. Run `npm run edit -- traits doctor` before and after, and at the close of every story that touches the engine (`engine/src/`) or the content's checks (`content/src/validate.ts`). See `docs/agents/traits.md`.

### Tuning values

The game's tuning values are data, `engine/src/config.json`, in sections, with the config version and its changelog. A value changes only through the content editor's config kind (`npm run edit -- config show`, `config set <setting> <value>`, `config finish --reason "<why> (DL-NNN)"`), which checks it with the engine's `checkConfig`, raises the config version and runs the tests; never by hand. See `docs/agents/config.md`.

### Comments

A comment says what a thing is and why, citing the deciding DL entry; the history of past values and stories belongs in the decision log. See `docs/agents/comments.md`.
