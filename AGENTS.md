# dms-media

## Layout

A pnpm workspace with two published packages. The root holds the tool configs, the CI workflows and the orb setup; the code lives in the packages.

| Path                                  | What it is                                                                                                                                  |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/dms-media`                  | `@antelopejs/dms-media`, the DMS media module: uploads, folders with per-folder permissions, derivatives and image editing                  |
| `packages/dms-media/frontend-vue`     | The Vue layer, shipped as source. ESLint and Prettier own it, not oxlint and oxfmt. It keeps its own lockfile for standalone consumers      |
| `packages/dms-media/playground`       | An AntelopeJS project that runs the module against MongoDB. It is not a workspace package: install it with `--ignore-workspace`               |
| `packages/dms-media/skills`           | Agent skills published with the module                                                                                                      |
| `packages/interface-dms-media`        | `@antelopejs/interface-dms-media`, the interface the module implements: the `AssetType` field, folder bindings and declared content         |

Run a package script from its own directory: `pnpm --dir packages/dms-media <script>`.

## Versioning

- The module implements the interface, so it caps the interface range below the next minor (`>=<floor> <0.<minor+1>.0`), and that range accepts the interface version in the tree. `release.yml` refuses any other shape. `antelopejs-check-interface-ranges` (part of `pnpm lint`) checks the other `@antelopejs/interface-*` ranges.
- Release the interface (`release-interface.yml`) before the module (`release.yml`). The module release fails until the interface version in the tree is on npm.
- `frontend-vue/package.json` pins the `@antelopejs/dms-frontend` minor it builds against in `engines`. Move it together with the `@antelopejs/dms-frontend` versions in `packages/dms-media/package.json` and `playground/package.json` and the compatibility table in `packages/dms-media/README.md`.
- Both published packages compile to CommonJS in `dist`. Of the root and those two, only the private root sets `"type": "module"`, for its tool configs. `frontend-vue` is ESM source and keeps its own `"type": "module"`.

## What `pnpm run checks` does not run

`pnpm test` runs only the `frontend-vue` unit tests. Run the rest when your change touches them. CI runs all of them except `knip:all`:

- `pnpm --dir packages/dms-media test`: the unit and integration suites, in one boot of the DMS stack against an in-memory MongoDB. `test:unit` and `test:integration` run one folder.
- `pnpm --dir packages/dms-media test:exports` (after a build) and `test:reload`: the exports map, and hot reload of a consumer and of the module in a real project.
- `pnpm test:frontend`: typechecks the Vue layer against the DMS layer (`ajs dms verify-source`).
- `pnpm build`: the module and the interface. `typecheck` only builds the interface.
- `pnpm --dir packages/interface-dms-media check:exports`, after a build of the interface (`pnpm typecheck` builds it).
- `pnpm --dir packages/dms-media knip:all` and `pnpm --dir packages/interface-dms-media knip:all`. `pnpm knip` checks dependencies only; `knip:all` also reports unused files and exports. Confirm each finding before you remove the code.

The documentation check runs in CI only. Its TypeScript project, `packages/interface-dms-media/docs/tsconfig.json`, maps the interface onto `src`, so it needs no build.

## Orb

`.agents/setup` belongs to the guardrail pack. `.agents/playground` switches the system Node to the `.nvmrc` major, installs the AntelopeJS CLI and MongoDB, builds the module and installs the playground. The `dms-media-backend` service runs it before it starts.

<!-- antelopejs-guardrails:start -->
<!-- Managed by @antelopejs/tooling-configs. `antelopejs-sync` rewrites everything between these markers; write repository-specific guidance outside them. -->

## Guardrails

Finish every change with `pnpm run checks`. It runs typecheck, lint, format, knip, tests, size, ratchet, suppressions, and sync, and prints only what failed. The change is done when it prints no failure.

The tools enforce most rules, listed in the table at the end. The sections below hold the rules no tool checks.

### Comments

Say it in code. A constraint belongs in a type, a lint rule, or a test. A public item's contract belongs in TSDoc (`/** */`) on that item. The only other comments are lint directives that name their rules, `@ts-expect-error <reason>`, `SAFETY: <reason>` above a type assertion, `/*!` license headers, and bundler or formatter directives.

Before suppressing a type rule, try inference or a type derived from its owner with `Parameters`, `ReturnType`, or indexed access. A private alias can still appear in a published declaration. Keep a suppression only after checking the published contract and the unchecked boundary it protects.

Check each directive reason against the current line and its callers. Returning a value is not the same as awaiting and discarding it. A reason must describe what the code does now.

### Tests

Hold every test you write or keep to this checklist:

- Name the wrong implementation this test fails on. A test with no answer is deleted, not kept.
- No test reads the file it tests. Drive the behaviour through the public interface.
- An invariant over many files is a lint rule, not a test.

### Cleanup proof

A behaviour-preserving cleanup PR shows `antelopejs-api-diff <base-ref>` passing. Published declarations and built runtime exports stay unchanged; pass `--allow-added <glob>` (repeatable, e.g. `'**/internal/**'`) to let added entries under that glob pass when their module is `@internal`, and copy its "Added (allowed)" list. A comment-only PR shows `antelopejs-comment-proof <base-ref>` passing instead of a verifier. Both compare committed HEAD.

Copy counts from the proof's base and HEAD table. Never type counts by hand. Keep the command and the committed head beside the copied output. The table counts a lint directive once per rule it names, inline directives included.

Pass `--probe <file.cjs>` to api-diff when changing receivers, positional calls, or modules that no published entry reaches. The same captured script runs against both worktree roots, supplied as `argv[2]`, and prints JSON observations. Matching metadata alone does not prove those behaviours.

An entry-only rule exempts only its own module. Add a second module entry rather than exempting another importer. A no-upward rule must reject peers in the same tier as well as higher tiers. Probe the rank decision with an import, not just a reading of the configuration.

Moving a method body into a function keeps how it is called: the same receiver, argument count, read order and laziness.

Verify a boundary against the imports a developer or agent would plausibly write: static and dynamic imports, re-exports, Vue `src`, CSS `@import`, and worker or child-process entries in normally named files. A construction only an evasion would write, an edit to resolution configuration (`package.json` `browser`, `exports`, `main` or `imports`, bundler aliases, tsconfig `paths`), and a difference observable only by patching private fields or internal methods go under Attention and never block. Public API and ordinary subclass behaviour stay part of the contract.

### Suppression budget

`guardrails.suppressions.json` caps the suppressions in authored code: lint directives per rule they name (`*` for none), `@ts-expect-error`, `@ts-ignore` and `SAFETY:` comments. A suppression over its ceiling fails: fix the code, or remove another suppression of the same kind. A rule that keeps needing suppressions should be changed in the preset. Never raise or remove a number in that file: the check fails a ceiling higher than on the pull request base, and only the operator approves a raise. A directive disabling `anti-slop/require-safety-comment-for-type-assertion` is burn-down debt: remove the assertion, or, where it holds, replace the directive with `SAFETY: <why it holds>`, which takes over its room without a raise. After you remove suppressions, run `pnpm run suppressions:update` and commit the lowered file.

### Debt

`guardrails.ratchet.json` records the lint findings and oversize files this repository already had. Its numbers only go down. After you remove debt, run `pnpm run ratchet:update` and commit the lowered file. A rule listed there is off for `oxlint`. The ratchet counts it instead, and the pre-commit hook rejects it on every line you add.

### What enforces what

| Rule                                                                           | Enforced by                                         |
| ------------------------------------------------------------------------------ | --------------------------------------------------- |
| Formatting                                                                     | oxfmt                                               |
| Lint findings are errors; no rule warns                                        | oxlint preset                                       |
| Comments are TSDoc, directives, or `SAFETY:` only                              | `antelopejs/no-comments`                            |
| Every test asserts                                                             | `antelopejs/require-assertion`                      |
| Tests read no files outside fixtures, helpers, locales                         | `antelopejs/no-fs-read-in-tests`                    |
| Tests import the code under test from local source, not their own package name | `antelopejs/no-self-import-in-tests`                |
| No assertion that restates a constant                                          | `antelopejs/no-constant-value-assertion`            |
| No test whose only check is "is a function"                                    | `antelopejs/no-typeof-function-only-test`           |
| Params ≤ 5, function ≤ 120 lines, file ≤ 500 lines, depth ≤ 4, complexity ≤ 20 | `eslint/max-*`, `eslint/complexity`                 |
| Cleanup preserves declarations and built runtime export metadata               | `antelopejs-api-diff <base-ref>`                    |
| Comment-only changes preserve JavaScript emit                                  | `antelopejs-comment-proof <base-ref>`               |
| PR-body counts come from tracked code files                                    | api-diff and comment-proof tables                   |
| Receiver, positional and unpublished-module behaviour                          | `antelopejs-api-diff <base-ref> --probe <file.cjs>` |
| Directive and `SAFETY:` reasons are true of the code                           | review; no tool                                     |
| Evasion-only and patched-internal findings go under Attention                  | review; no tool                                     |
| No-upward rules reject same-tier peers                                         | review and import probes                            |
| No `@ts-ignore`                                                                | `typescript/ban-ts-comment`                         |
| Files ≤ 20,000 bytes, tests included                                           | `antelopejs-check-size` (pre-commit)                |
| Suppressions stay within `guardrails.suppressions.json`                        | `antelopejs-suppressions` (pre-commit, checks)      |
| No added directive disables the `SAFETY:`, comment or test rules               | `antelopejs-suppressions` (pre-commit, checks)      |
| An added suppression gives a specific reason                                   | `antelopejs-suppressions` (pre-commit, checks)      |
| A block disable is closed in its file                                          | `antelopejs-suppressions` (pre-commit, checks)      |
| Types check                                                                    | `tsc` (pre-push)                                    |
| No dead files, exports, or dependencies                                        | knip                                                |
| Managed files match the pack                                                   | `antelopejs-sync --check`                           |
| Entry-only rules exempt no tracked outsider                                    | `antelopejs-sync --check`                           |
| A test names the wrong implementation it catches                               | review; no tool                                     |
| Existing debt only shrinks                                                     | `antelopejs-ratchet`                                |

<!-- antelopejs-guardrails:end -->
