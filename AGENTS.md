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

- The module implements the interface, so it caps the interface range below the next minor (`>=<floor> <0.<minor+1>.0`), and that range accepts the interface version in the tree. The `dependency:ranges` step of `pnpm run checks` caps every other `@antelopejs/*` range below the next minor of its floor.
- `release.yml` releases both packages: a preview of each on a push to `next`, and one stable package per dispatch of the release train. Release the interface before the module, since the module's floor on the interface must be on npm for the module to install.
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

CI runs `pnpm run checks` in full on every pull request and reports what failed. The commit hook formats and lints the staged files. Locally, run only the fast check for what you touched:

- `pnpm run typecheck` after you change types or signatures.
- `pnpm exec oxlint <files>` and `pnpm exec oxfmt <files>` on the files you changed.
- One test file, not the suite. In a module that tests with `ajs module test`: `pnpm run build`, then `pnpm exec ajs module test . -f dist/<path>.test.js`.

Prove a change works with the verification skill in [`.agents/skills/verify-dms-media/SKILL.md`](.agents/skills/verify-dms-media/SKILL.md) before you call it done.

### Comments

Say it in code: a constraint in a type, a lint rule or a test, a public item's contract in TSDoc. Other comments are lint directives naming their rules, `@ts-expect-error <reason>`, `SAFETY: <reason>` above a type assertion, and license or tool directives. A reason states what the code does now.

### Tests

Each test names the wrong implementation it fails on, or is deleted. Drive behaviour through the public interface. An invariant over many files is a lint rule.

### Review

No tool checks these:

- A type guard checks the nested elements and values it claims.
- A no-upward import rule rejects same-tier peers; probe it with an import.
- A finding only an evasion or a patched internal can trigger goes under Attention and never blocks.

### Suppressions

`guardrails.suppressions.json` caps lint directives, `@ts-expect-error`, `SAFETY:` comments and rules a lint config turns off. Over a cap, fix the code or remove another suppression of that kind; only the operator raises a number. After removing suppressions, run `pnpm run suppressions:update` and commit the file.

<!-- antelopejs-guardrails:end -->
