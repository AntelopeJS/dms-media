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
pnpm test:frontend  # typechecks the frontend layer against the DMS layer
```

To run the playground, install it too: it is a project of its own, outside the
workspace, and links the interface package from the tree. Then start it with
MongoDB running on `localhost:27017` (or `MONGO_URL` set):

```bash
pnpm --dir packages/dms-media/playground install --frozen-lockfile --ignore-workspace
pnpm dev        # builds the interface, the module and the playground in order, then starts the backend
```
