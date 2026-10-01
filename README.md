# dms-media

Workspace holding the AntelopeJS DMS media module and the interface package it
implements.

| Package | Directory | Published as |
|---|---|---|
| Media module | [`packages/dms-media`](packages/dms-media) | `@antelopejs/dms-media` |
| Media interface | [`packages/interface-dms-media`](packages/interface-dms-media) | `@antelopejs/interface-dms-media` |

Both are published publicly on npm under the `@antelopejs` scope (npm trusted
publishing, with provenance) and released independently from
`.github/workflows/release.yml` and `.github/workflows/release-interface.yml`.
Release the interface first: the module release checks that the interface
version in the tree is already on npm.

Start with the module's own [README](packages/dms-media/README.md). See
[AGENTS.md](AGENTS.md) for code conventions.

## Development

```bash
pnpm install --frozen-lockfile
pnpm --dir packages/dms-media/frontend-vue install --frozen-lockfile
pnpm build      # builds the interface, then the module
pnpm lint       # oxlint + oxfmt, both packages, then eslint over frontend-vue
pnpm typecheck  # tsc over both packages
pnpm knip       # unused dependencies, both packages
pnpm test       # module backend suite
```
