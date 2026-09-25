# M0 — Skeleton

**Objective:** a repository in which the first engine test can be written and will fail for the right reason
**Sessions:** 3–4 · **Depends on:** nothing · **Implements:** `plan.md` M0; ADR-0007
**Gate:** `npm test` and `npm run lint` pass locally and in CI; a deliberate `Math.random()` in `engine/` fails lint; `docs/decision-log.md` exists with DL-01 to DL-10

**Status:** in progress — M0-S1 and M0-S2 done

## 0. What lands in M0

- npm workspaces: `engine/`, `content/`, `harness/`, `cli/`, `web/`, each with a
  `package.json`, `tsconfig.json`, `src/` and one placeholder test.
- TypeScript strict, ES2022, NodeNext; Vitest with one project per package; ESLint with the
  engine rules from ADR-0001 and ADR-0007.
- A GitHub Actions workflow running lint and tests on push and pull request.
- `.gitignore`, `.editorconfig`, `.node-version`, `.npmrc`.
- `docs/decision-log.md` with the plan's decisions as its first entries.

**Deliberately deferred:** Vite, React, Playwright and `web/` beyond a placeholder (M7);
Cloudflare (M7); any content file (M1); Prettier (INPUTS 2.1); a coverage gate (INPUTS 2.4).

**Harvested from v1.** The `eslint.config.js`, `vitest.config.ts` with per-package projects,
`tsconfig.base.json` and the workspace shape on `feature/poc` were built and used for eight
epics. They are copied and trimmed rather than redesigned: `narrate/` is dropped (the front ends
narrate; there is no shared prose package in v2 until two front ends want the same sentence),
`harness/` is added, and the React parts of the Vitest config wait for M7.

**Inputs:** 1.1–1.5 before starting; 2.1–2.4 during.

## 1. Stories

### M0-S0 · Branches · 0.25 session

Per INPUTS 1.2: create `v1.0-release` from the current tip of `planv2` (it carries the design
set this plan was built from — `CONTEXT.md`, `docs/requirements.md`, `docs/principles.md`,
`docs/approach.md`, `docs/data-model.md`, `docs/adr/`, `docs/plan.md`, this `planning/epics/`
folder — and nothing of v1's code). Create `v1.0-dev` from `v1.0-release` and switch to it; all
M0 onward work happens there. `v1.0-release` receives only milestone-completion merges and
tags; nobody commits to it directly. `master`, `dev`, `feature/poc`, `design-v2` and `v01_poc`
are left untouched as v1's history.

**Acceptance:**

- [ ] `v1.0-release` exists on GitHub and its tree matches `planv2`'s at the moment of creation
- [ ] `v1.0-dev` exists, tracks `origin/v1.0-dev`, and is the checked-out branch
- [ ] The repository's default branch on GitHub is left as `master` unless the owner asks
      otherwise (asked separately; not assumed by this story)

### M0-S1 · Workspaces and TypeScript · 1 session

Root `package.json` with `workspaces`, `engines` from INPUTS 1.1, `"type": "module"`, scripts
`test`, `test:watch`, `typecheck` (`tsc -b`), `lint`, `harness`, `play`. `tsconfig.base.json`
as v1's (strict, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, composite);
`tsconfig.json` at the root referencing the five packages. Each package: `src/index.ts`
exporting nothing yet, `package.json` named per INPUTS 1.5 with `"exports": "./src/index.ts"`
resolved through `tsx` in development, and one `src/placeholder.test.ts` asserting `true`.

Dev dependencies, pinned exactly: `typescript`, `vitest`, `tsx`, `@types/node`, `eslint`,
`@eslint/js`, `typescript-eslint`, `globals`. Nothing else. `engine/package.json` has no
`dependencies` key at all, and a test in M0-S2 asserts that.

**Acceptance:**

- [x] `npm install` then `npm test` runs five placeholder tests, one per package, and passes
- [x] `npm run typecheck` passes with no emitted files committed (`dist/` ignored)
- [x] `engine/package.json` has no `dependencies` and no `devDependencies`
- [x] `.node-version`, `.npmrc` (`save-exact=true`, `engine-strict=true`), `.editorconfig`
      (2-space, LF, final newline) and `.gitignore` (`node_modules/`, `dist/`, `coverage/`,
      `.saves/`, `web/dist/`, `test-results/`, `playwright-report/`, `harness/samples/`,
      `.wrangler/`) exist

### M0-S2 · The engine's boundary, enforced · 1 session

`eslint.config.js` from v1, trimmed to `engine/`, `content/`, `harness/`, `cli/`, `web/`:

- `engine/**`: `no-restricted-properties` on `Math.random` and `Date.now`;
  `no-restricted-syntax` on `new Date()` and `Date.*` calls; `no-console`;
  `no-restricted-imports` on `@heroesim/*`, `node:*`, `fs`, `path` and any `../<package>/`
  path.
- `content/**`: may import `@heroesim/engine` types only; the Node entry may import `node:fs`.
- `cli/**` and `web/**`: import `engine` and `content` by package name only, never a subpath or
  a relative path into another package; `cli` may not import `web` nor `web` `cli`.

A test, `engine/src/boundary.test.ts`, writes a temporary file containing `Math.random()` under
`engine/src/`, runs ESLint on it through the Node API, asserts one error with the ADR-0001
message, and deletes the file in `finally`. A second test reads `engine/package.json` and
asserts no dependency keys.

**Acceptance:**

- [x] `npm run lint` passes on the skeleton
- [x] The boundary test fails lint on `Math.random`, `Date.now()`, `new Date()`, `console.log`,
      `import fs from "node:fs"` and `import x from "@heroesim/content"` inside `engine/`, each
      with the message naming the ADR
- [x] `npm test` runs the boundary test as part of the ordinary run

### M0-S3 · CI · 0.5–1 session

`.github/workflows/check.yml`: on push to `v1.0-dev` and `v1.0-release` (INPUTS 1.2) and on
pull request targeting either;
a matrix of Node 22 and the version in `.node-version` (26), `actions/setup-node` with npm
cache; `npm ci`; `npm run lint`;
`npm run typecheck`; `npm test`. No Playwright, no deploy, no secrets.

**Acceptance:**

- [ ] The workflow is green on the first push after this story
- [ ] A pushed commit that breaks the boundary test turns CI red (tried once, then reverted, and
      the two commits named in DL-11)
- [ ] The workflow file contains no `secrets.` reference

### M0-S4 · Decision log · 0.5 session

`docs/decision-log.md` in the v1 format (INPUTS 2.3): a header stating the rules (append only,
supersede never edit, say who decided), then DL-01 to DL-10, one per decision in `plan.md` §5,
each dated 2026-09-25 and marked *decided by the owner*. `plan.md` §5 is then replaced by a
pointer to the log. README's map gains the log.

**Acceptance:**

- [ ] `docs/decision-log.md` exists with ten entries matching `plan.md` §5 as it stood
- [ ] `plan.md` §5 points at the log and repeats nothing
- [ ] `README.md` lists the log

## 2. Configuration and events introduced

None. M0 has no engine code.

## 3. Risks

| Risk | Mitigation |
| --- | --- |
| Node 26 versus the documented Node 22 diverge on an API the engine uses | The engine uses none: no `fs`, no `Date`, no `crypto`. `structuredClone` and `JSON` are the same on both. CI runs both 22 and 26 (A8), so a divergence in the CLI, harness or web tooling fails a push rather than a user |
| ESLint's flat config or `typescript-eslint` moved since v1 | Versions pinned exactly; the boundary test is the proof, not the config's shape |
| The lint rule is bypassed with `globalThis.Math.random` | Accepted. The rule catches the honest mistake; the harness's byte-equality test in M1-S10 catches the dishonest one |
