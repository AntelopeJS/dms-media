---
covers:
  - packages/dms-media/package.json
  - packages/dms-media/skills/**
  - packages/dms-media/frontend-vue/package.json
  - packages/dms-media/frontend-vue/i18n/**
  - packages/dms-media/src/frontend-module.ts
docs:
  - packages/dms-media/docs/2.installation.md
  - packages/dms-media/docs/6.faq.md
  - packages/interface-dms-media/docs/1.index.md
---

# Package

What a project installs from the registry: the module with its build, dashboard layer and skill, the interface with its contract, and the ranges the compatibility table names.

## Sub-features

- `the-module-tarball-holds-what-its-manifest-names`: the module's tarball holds the build, the dashboard layer, the agent skill and every path its manifest points at, without build info.
- `the-interface-tarball-exports-the-contract`: the interface's tarball holds its build and its consumer reference, and its root export carries every function, constant and type its README lists.
- `ranges-match-the-compatibility-table`: the README compatibility table lists the interface ranges the module depends on, its interface-dms-media range accepts the interface in the tree, and the dashboard layer pins its renderer minor.

## How to get to it (user POV)

- `ajs project modules add @antelopejs/dms-media`.

## Driving it with dms-control

```bash
dms-control journey "$RUN" package
```

## Gotchas

- The journeys pack with `npm pack --ignore-scripts` into a temporary folder and read the tarball; nothing is published.
