---
name: portrait-apply
description: Puts a Portrait analysis run the owner names in place of the content's files through the portrait tool, after showing its diff. Use when the owner asks to apply an analysis run.
---

# Portrait apply

Puts the three files of an analysis run, `docs/portraits/analysis/<run>/`, in place of the
content's, raises the content version and runs the checks, as one transaction the tool undoes on
any failure. Only a run the owner names is applied, and only after they have seen its diff.

Read the guardrails of `docs/agents/portraits.md` first. For a trial on a scratch copy, add
`--root <dir>` to every command.

## 1. The run

The owner names the run: `2026-10-02`, or `2026-10-02-2`. Without a name, list the runs under
`docs/portraits/analysis/` and ask which.

```sh
npm run portraits -- corpus --run <run>
```

Done when: the run exists and its content's checks pass. A run that fails them is reported, and
not applied.

## 2. The diff

```sh
npm run portraits -- diff <run>
```

Show the owner every change, file by file. Point out, where there are any:

- a key added to or removed from `portraits.json`, or a list `reordered`: these change which
  picture a person is given. A variant is never added or swapped without the owner's word for it;
- a row's field changed;
- a term added or removed;
- the sentences added, by list.

Then ask the owner to confirm, unless they have already said to apply this run after reading this
diff.

Done when: the owner has confirmed this run.

## 3. Apply

```sh
npm run portraits -- apply <run> --json
npm run portraits -- check
```

- **Exit 0.** Note the files `changed` and the content version's change. A run that is the content
  already changes nothing.
- **Exit 1** (`undone` or `refused`): nothing changed. Report each problem.

Done when: `apply` has exited and `check` has run.

## 4. Tell the owner

Give the files changed, the content version's change, and that `git diff` shows them, for the owner
to commit with a message naming the run's report.
