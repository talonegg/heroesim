# Delivery

How a story and a release are planned, built, verified, recorded and released here. AGENTS.md routes
to the tools; this page is the process, and the owner's standing rules come first. It replaces the
rules brief each release's agents were given in a session's scratchpad (DL-218).

## Where things live

| What | Where |
| --- | --- |
| How releases follow one another; every release so far; what comes next | `docs/plan.md` §1, §2's release ledger and §3 |
| The open release's epic, and its register | `docs/planning/epics/` |
| Closed epics, and the first build's inputs (`INPUTS n.m`) | `docs/planning/archive/` |
| Decisions (`DL-nn`): the open release's | `docs/decision-log.md`, its header the rules |
| Every decision, its file and what superseded it | `docs/decisions/index.md` |
| The glossary; hard-to-reverse decisions | `CONTEXT.md`; `docs/adr/` |
| Requirements (`R`, `N` numbers); the World State document | `docs/requirements.md`; `docs/data-model.md` |
| Environment variables; the deploy | `docs/environment.md`; `docs/deploy.md` |
| The harness, its commands and the Gate's spec | `harness/README.md`, `harness/gate.json` |
| Coverage, and the measures of the suite, CI and a game | `tools/measure/README.md` |
| The content editor; the portrait tool | `tools/editor/README.md`; `tools/portraits/README.md` |

Read a decision through the index: open its file and search for `## DL-nn `. Never read an archive
file whole. A search leaves the archives out by default (`docs/.rgignore`, DL-221): to search one,
name its path, or use `rg -u`.

## The owner's standing rules

1. **The owner's word** before a push, a merge, a GitHub post, a release, a branch cut, a move of
   Dependabot's `target-branch` (DL-147 item 6) or anything else that leaves this machine. A word
   for one is not a word for the next.
2. **Traits** change only through `npm run edit` or the trait skills (`docs/agents/traits.md`).
   Run `npm run edit -- traits doctor` before the first change and after the last of every story
   that touches `engine/src/` or the content's checks (`content/src/validate.ts` and the content
   kinds, `content/src/kinds/`), and record both readings.
3. **Tuning values** change only through the content editor's config kind
   (`docs/agents/config.md`). A new setting is added by hand as that page says.
4. **A test a config or tuning change fails** is never rewritten to pass. Report it to the owner:
   - its file and name;
   - its kind: a deliberate pin of a default, or a test whose numbers merely rest on one;
   - an assessment of its design, with a recommended fix.

   Take the owner's answer before changing it. A test that reads `configVersion` from the config
   is fine.
5. **Saves** need no backward compatibility until the owner says otherwise: no migrations, no
   loading tests of old saves. `schemaVersion` is raised only when the document's shape changes.
6. **Sweeps** (`npm run harness -- …`) run one at a time, alone, nothing else running.
   - A `gate`, and every sweep but a `neutral`, runs with `HEROESIM_WORKERS=8`.
   - A `neutral` runs with no `HEROESIM_WORKERS`: its profile plays one process a seed up to 10,
     more seeds sharing the 10 (DL-231 Q13, DL-251).
   - Run each in the background and wait for its completion notice; never poll in a loop.
   - A `neutral` run takes about 4 minutes, and a full `gate` about 25.
   - The quick check is `HEROESIM_SEEDS=4 HEROESIM_YEARS=2 npm run harness -- neutral <name>`.
   - A report is committed, with `git add -f`, only where the story says so.
7. **A permission denied is not laundered:** never get the same effect another way. Stop and
   report it.
8. **No git worktrees.** Work on the release's dev branch, and never switch branches mid-story.
9. **Tests first** where the epic says so: red, then green.
10. **The model split:**
    - Opus builds the medium and large stories and does all verification.
    - Sonnet or Haiku take the mechanical steps.
11. **A question to the owner** is one item a message:
    - what it is, with checked facts and file references;
    - what doing it involves;
    - its short- and long-term pros and cons;
    - lettered options, and a recommendation that names the model split.

    The owner answers with a letter.

## Files and words

- **Line endings.** Keep each file's own: check it first (`file <path>`), and never leave a file
  mixed. The repository stores LF, and with `core.autocrlf=true` a working copy may be CRLF. The
  Edit tool keeps a file's endings; a script must write them back as it found them.
- **Comments.** Follow `docs/agents/comments.md`: what and why, citing the deciding DL entry. The
  history goes in the log, never in a comment.
- **Documents.** Follow `docs/agents/documentation.md`: each fact in its one home, a live page
  rewritten to what is true now, never appended to, and history archived with its text kept.
- **Words a player reads.** Follow `docs/agents/ui-text.md`, using the glossary's terms exactly.

## A story

1. **Read** these before building:
   - AGENTS.md and this page;
   - the `docs/agents/` pages the story touches: `comments.md` and `documentation.md` always, and
     `config.md`, `traits.md`, `ui-text.md` or `portraits.md` as it touches them;
   - the epic's §0, the story, §2 and §4;
   - the decisions the story cites.
2. **Build** test first. Run single test files and `npm run typecheck` as you go.
3. **Check** at the end:
   - `npm run lint`, `npm run typecheck` and `npm test`;
   - `npm run build`, check-bundle and `npm run e2e -w web` where the story names them;
   - the doctor, by rule 2.

   Long commands run in the background, or with a timeout of up to 600,000 ms.
4. **Record** it in a DL entry, appended at the end of `docs/decision-log.md` with the next
   number:
   - the heading `## DL-nn — v1.1.N-Sk built: <what>`;
   - the line `**Status:** Accepted · **Date:** <from date> · **Decided by:** <who>`;
   - **Context.**;
   - **Decision.**, in numbered items;
   - *Judgement calls, for the owner to see*, where the agent chose what the epic left open;
   - **Consequences.**;
   - **Evidence.**: a few lines naming the commits, the reports and the epic's boxes.

   An entry is at most 6 KB (the log's header; `npm test` holds it, DL-219). The doctor's readings,
   the checks with their counts, the bundle's bytes, the `e2e` count and the sweeps' fingerprints go
   in the commit message, and the sweeps' in their reports.

   Then run `npm run decisions -- index`. An entry that supersedes an earlier item also writes the
   stub or the note, and the record in `docs/decisions/archive/superseded/`, in the same commit (the
   log's header).
5. **Verify** with a second Opus agent:
   - it re-derives what the story claims;
   - it tries mutations, each red and then restored;
   - it fixes what it finds, test first;
   - it records all of that in its commit message, and adds one line to the entry's Evidence:
     `Verified <date> at <sha>: <what it found and fixed, in a sentence>.`
6. **The epic:** tick the story's boxes as they are met, and set its Status line.
7. **Commit** to the release's dev branch only:
   - the message is `v1.1.N-Sk (DL-nn): <what was built>`, then
     `v1.1.N-Sk (DL-nn): verified: <what was checked; what was fixed>`, ending with the
     attribution lines the session gives;
   - stage only the files changed, never `git add -A`;
   - use `git commit -F -` with a heredoc.

## A release

1. **Plan.**
   - Take the owner's answers, by rule 11.
   - Write the epic, `docs/planning/epics/v1.1.N-release.md`: the objective, the Gate, §0's story
     table, the stories with their acceptance, and §2 to §4.
   - Add its row to the epics README's register, and make it §3's "Now" in `plan.md`.
   - Its DL entry records the answers and the plan.
   - On the owner's word, cut the dev branch from the previous release's record and move
     Dependabot to it.
2. **Close.**
   - A review of the release's commits, its findings fixed test first, and every check.
   - Prove play: a full `gate` alone meeting `harness/gate.json` where play could move, and
     `neutral --expect` where it cannot. The baseline moves as `documentation.md` says. Where play
     could move, run the engine's twenty-year boxes too, alone:
     `npm run harness -- rivals-build-and-buy transfer-generator` (DL-230).
   - Run the engine's boxes kept apart at full size alone, `npm run harness -- resolve.harness
     patron-offers.harness` (DL-246).
   - Run the tests of a time limit alone, `npm run harness -- speed` (DL-233).
   - The owner's playtest: a few in-game years of the release's build, scored by which of the
     [Guild Management Model](../management-model.md)'s nine sentences the player finds themselves
     saying, the epic naming the sentence it aimed at (DL-256).
   - Bring the epic up to date.
3. **Release** (DL-124), on the owner's word:
   - `v1.1-release` is fast-forwarded to the dev branch and pushed;
   - CI raises the pull request to `main`, naming its tag;
   - the owner merges it with a merge commit;
   - CI tags the release, deploys it to both addresses, runs `e2e:live` and publishes the GitHub
     Release.

   `docs/deploy.md` has the detail.
4. **Record**, and nothing else records a release:
   - the ledger's row in `plan.md` §2: date, pull request, merge commit, decisions, epic;
   - the epic's Status line.

   The record, pushed to the release branch on the owner's word, raises a pull request "Record
   from `<branch>` (no release)", whose merge releases nothing (`docs/deploy.md`, DL-255).

   Then archive, by the steps in `docs/agents/documentation.md`:
   - the epic, to `docs/planning/archive/`;
   - the release's DL entries, to `docs/decisions/archive/`;
   - the committed harness reports that nothing live cites any more.

   And `plan.md` §3's "Now" moves on.
