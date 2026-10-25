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
- Both packages publish CommonJS from `dist`. `"type": "module"` belongs to the private root package only, for its tool configs.

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

Finish every change with `pnpm run checks`. It runs typecheck, lint, format, knip, tests, size, ratchet, and sync, and prints only what failed. The change is done when it prints no failure.

The tools enforce most rules, listed in the table at the end. The sections below hold the rules no tool checks.

### Comments

Say it in code. A constraint belongs in a type, a lint rule, or a test. A public item's contract belongs in TSDoc (`/** */`) on that item. The only other comments are lint directives that name their rules, `@ts-expect-error <reason>`, `SAFETY: <reason>` above a type assertion, `/*!` license headers, and bundler or formatter directives.

### Tests

Hold every test you write or keep to this checklist:

- Name the wrong implementation this test fails on. A test with no answer is deleted, not kept.
- No test reads the file it tests. Drive the behaviour through the public interface.
- An invariant over many files is a lint rule, not a test.

### Debt

`guardrails.ratchet.json` records the lint findings and oversize files this repository already had. Its numbers only go down. After you remove debt, run `pnpm run ratchet:update` and commit the lowered file. A rule listed there is off for `oxlint`. The ratchet counts it instead, and the pre-commit hook rejects it on every line you add.

### What enforces what

| Rule                                                                           | Enforced by                               |
| ------------------------------------------------------------------------------ | ----------------------------------------- |
| Formatting                                                                     | oxfmt                                     |
| Lint findings are errors; no rule warns                                        | oxlint preset                             |
| Comments are TSDoc, directives, or `SAFETY:` only                              | `antelopejs/no-comments`                  |
| Every test asserts                                                             | `antelopejs/require-assertion`            |
| Tests read no files outside fixtures, helpers, locales                         | `antelopejs/no-fs-read-in-tests`          |
| No assertion that restates a constant                                          | `antelopejs/no-constant-value-assertion`  |
| No test whose only check is "is a function"                                    | `antelopejs/no-typeof-function-only-test` |
| Params ≤ 5, function ≤ 120 lines, file ≤ 500 lines, depth ≤ 4, complexity ≤ 20 | `eslint/max-*`, `eslint/complexity`       |
| Files ≤ 20,000 bytes, tests included                                           | `antelopejs-check-size` (pre-commit)      |
| Existing debt only shrinks                                                     | `antelopejs-ratchet`                      |
| Types check                                                                    | `tsc` (pre-push)                          |
| No dead files, exports, or dependencies                                        | knip                                      |
| Managed files match the pack                                                   | `antelopejs-sync --check`                 |
| A test names the wrong implementation it catches                               | review; no tool                           |

<!-- antelopejs-guardrails:end -->
