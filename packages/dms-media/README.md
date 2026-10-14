# @antelopejs/dms-media

<div align="center">
<a href="https://www.npmjs.com/package/@antelopejs/dms-media"><img alt="NPM version" src="https://img.shields.io/npm/v/@antelopejs/dms-media.svg?style=for-the-badge&labelColor=000000"></a>
<a href="./LICENSE"><img alt="License" src="https://img.shields.io/badge/license-Apache--2.0-blue?style=for-the-badge&labelColor=000000"></a>
<a href="https://discord.gg/sjK28QHrA7"><img src="https://img.shields.io/badge/Discord-18181B?logo=discord&style=for-the-badge&color=000000" alt="Discord"></a>
<a href="https://antelopejs.com"><img src="https://img.shields.io/badge/Docs-18181B?style=for-the-badge&color=000000" alt="Documentation"></a>
</div>

AntelopeJS DMS module providing an asset/media library: upload, folders, delivery derivatives and light image editing, with per-folder permissions that reuse the DMS authorization system. Ships a Finder-style file explorer and an `AssetType` field to reference library assets from forms.

![The Media library explorer](./docs/images/library.png)

**Documentation: [dms.antelopejs.com/docs/modules/media](https://dms.antelopejs.com/docs/modules/media)** (sources in [`docs/`](./docs); design notes in [`docs/design/`](./docs/design)).

See [AGENTS.md](../../AGENTS.md) for code conventions.

## Installation

```bash
ajs project modules add @antelopejs/dms-media
```

The browser uploads straight to the storage: list the dashboard's origins in the api module's `cors.allowedOrigins`. See [Installation](https://dms.antelopejs.com/docs/modules/media/installation) and [Configuration](https://dms.antelopejs.com/docs/modules/media/configuration).

```ts
import { AssetType } from "@antelopejs/interface-dms-media";

new AssetType({
  mimetypes: ["image/*"],
  binding: { id: "articles.cover", folderName: "Article covers", permissionsFromPage: ArticlesPage },
});
```

## Claude Code skill

The package ships the `dms-media` skill in [`skills/`](./skills), declared in `package.json` under `antelopeJs.skills`.

## Development

The module lives in `packages/dms-media` of a pnpm workspace, next to the interface package it implements (`packages/interface-dms-media`). Run these from `packages/dms-media`:

```bash
pnpm install        # whole workspace; the interface resolves to the sibling package
pnpm build          # builds the interface, then the module
pnpm dev            # backend, via playground (ajs project run -w -p playground)
pnpm frontend:dev   # Vue 3 Inertia frontend, from playground (ajs dms dev)
pnpm test           # build + full mocha suite (unit + HTTP integration)
pnpm test:unit      # build + unit tests only (no HTTP)
pnpm test:reload    # hot reload of a consumer and of the module, in a real project
```

The playground is a project of its own, outside the workspace: install it with `pnpm --dir playground install --ignore-workspace` before `pnpm dev`. It links `@antelopejs/interface-dms-media` from `packages/interface-dms-media`, and `pnpm dev` builds the interface, the module and the playground in that order before starting the backend.

The playground's Media demo page (`/media-demo`) holds every flavour of the `AssetType` picker: a single cover image with a linked folder, a gallery with a maximum, a PDF-only spec sheet, documents restricted to PDF, Word and text files in their own linked folder, and a free attachment.

The playground connects to MongoDB at `mongodb://localhost:27017` by default. Set `MONGO_URL` to point it at another instance, e.g. `MONGO_URL=mongodb://127.0.0.1:27019 pnpm dev`.

The frontend entry is `frontend-vue/dms.frontend.ts`. It declares `componentPrefix: "DmsMedia"` and registers the blocks of `app/components/*.vue` by file name (`Explorer` is served as `DmsMediaExplorer`); the parts in subfolders are imported by path. `dms.frontend.build.ts` auto-imports `app/composables` and `app/utils`. Use relative imports for module-local files because the Inertia adapter copies the frontend separately from the backend. The adapter discovers locale files and `app/config/shortcuts-registry.ts`; no Nuxt installation is required.

The blocks read the data they render with the DMS's `useApiData` (`@antelopejs/dms` 0.9, `@antelopejs/interface-dms` 0.7, `@antelopejs/dms-frontend` 0.6): a server render reads it and hands it to the browser with the page. The explorer's folder tree is the same read, and its file listing one `useApiPagedData` read keyed by the location and the filters ("Load more" appends a page, a library change reads every loaded page again). The reads that follow the library's realtime changes on their own opt out of the page's refreshes. Writes, downloads, and the reads of the asset field's entries, the dialogs and the image editor's canvas, stay `$authFetch` calls in the browser.

The file links (`/media/<id>/<name>`) are served by the backend. The module declares `/media/**` as a backend prefix (`backendProxies`, with the session), so that a link on the dashboard's origin reaches the backend and a private file opens for a signed-in member.

The playground uses the `@antelopejs/dms-frontend` CLI. Run `pnpm --dir frontend-vue install` and `pnpm --dir frontend-vue test` for frontend tests; `tests/serverRender.test.ts` renders the blocks on the server with the renderer and the DMS layer the package installs. `pnpm test:frontend` typechecks the layer against the DMS layer (`ajs dms verify-source`), without a running backend; CI runs it.
