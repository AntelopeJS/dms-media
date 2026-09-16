# @antelopejs/dms-media

<div align="center">
<a href="https://www.npmjs.com/package/@antelopejs/dms-media"><img alt="NPM version" src="https://img.shields.io/npm/v/@antelopejs/dms-media.svg?style=for-the-badge&labelColor=000000"></a>
<a href="./LICENSE"><img alt="License" src="https://img.shields.io/badge/license-Apache--2.0-blue?style=for-the-badge&labelColor=000000"></a>
<a href="https://discord.gg/sjK28QHrA7"><img src="https://img.shields.io/badge/Discord-18181B?logo=discord&style=for-the-badge&color=000000" alt="Discord"></a>
<a href="https://antelopejs.com"><img src="https://img.shields.io/badge/Docs-18181B?style=for-the-badge&color=000000" alt="Documentation"></a>
</div>

AntelopeJS DMS module providing an asset/media library: upload, folders, delivery derivatives and light image editing, with per-folder permissions that reuse the DMS authorization system. Ships a Finder-style file explorer (frontend) and an `AssetType` field to reference library assets from forms.

See [docs/PRD.md](./docs/PRD.md) for the architecture and product spec, and [AGENTS.md](./AGENTS.md) for code conventions.

## Installation

```bash
ajs project modules add @antelopejs/dms-media
```

## Features

- **Folder tree with per-folder ACL** — every folder can carry its own ACL (`AclEntry[]`), otherwise it inherits from its parent (root falls back to the configurable `rootAcl`). Entries grant `read`/`write`/`manage` rights to either a **permission id** (anyone holding e.g. `articles.page.table.edit`) or a **role id**. Rights imply weaker ones (`manage ⇒ write ⇒ read`). Ancestors of a readable folder are returned as **traverse-only shells** (name visible, content never listed).
- **Single data path** — listing, search, picker and delivery all resolve the same `readable`/`writable`/`manageable` sets per request; nothing bypasses the ACL.
- **Direct-to-storage uploads** — `presign` (staged) → client `PUT` → `confirm` (promote + DB row + sharp dimension probe). Bytes never transit through Node.
- **Stable delivery URLs** — `GET /media/:assetId/:filename` 302-redirects to a signed storage URL: long-lived and CDN-cacheable for public assets, short-lived `no-store` after auth + folder read check for private ones. Visibility (asset override → folder → private) is a flag flip; URLs never change.
- **Lazy image derivatives** — named presets (config) rendered by sharp on first request, cached in storage under a config-hashed cache key, served via `GET /media/:assetId/:presetId/:filename` and the authenticated `read-url` endpoint. Changing a preset invalidates naturally (new hash); a daily cron sweeps stale keys.
- **Server-side image editing** — `transform` (normalized crop, 90° rotations) and `revert`; the pristine original is preserved on first edit and derivatives are invalidated.
- **`AssetType` form field** — registers the `asset` data type whose widget (`DmsMediaAssetPicker`) opens the Finder as a picker. Declaring a `binding` auto-provisions a linked folder under the `Content` root (idempotency key = binding id) whose ACL derives from the declared permission mapping; linked folders cannot be renamed, moved, deleted or re-ACLed through the API.
- **Media page** — root `Media` nav category with the `Library` page (full-page Finder), guarded by the `media.access` permission.

## Static permissions

| Permission | Effect |
|---|---|
| `media.access` | See the Media page; grants `read` at the root via the default root ACL |
| `media.upload` | Grants `write` at the root via the default root ACL |
| `media.folders.manage` | Grants `manage` at the root via the default root ACL; always kept in control of linked folders |
| `media.permissions.manage` | Global gate for editing folder ACLs and flipping visibility |

Per-folder rights are the single authority for operations: upload requires `write` on the target folder, folder structure changes require `manage`, ACL/visibility edits additionally require `media.permissions.manage`.

## Module configuration

```json
{
	"dms-media": {
		"config": {
			"storage": "media",
			"rootAcl": [
				{ "subject": { "kind": "permission", "id": "media.access" }, "rights": ["read"] }
			],
			"presets": [
				{ "id": "thumb", "width": 300, "height": 300, "fit": "cover", "format": "webp", "quality": 80 }
			]
		}
	}
}
```

All keys are optional: `storage` selects a named `interface-file-storage` backend (default storage otherwise), `rootAcl` replaces the default root ACL, `presets` replaces the default `thumb`/`preview` presets. Keep a `thumb` preset — the Finder uses it for grid thumbnails.

## Declaring an AssetType field

```ts
import { AssetType } from "@antelopejs/dms-media";

new AssetType({
	multiple: true,
	max: 4,
	mimetypes: ["image/*"],
	binding: {
		id: "articles.cover",
		folderName: "Article covers",
		permissionMapping: {
			read: ["articles.page"],
			write: ["articles.page.table.edit", "articles.page.table.add"],
		},
	},
});
```

When the field lives on a DMS page, `permissionsFromPage` derives the mapping from that page's effective permission instead of duplicating its id — pass the page class itself (`permissionsFromPage: ArticlesPage`); resolution happens lazily at folder provisioning, and explicit `permissionMapping` entries still win per right (an empty array opts that right out of the fallback).

Consumer modules should declare `@antelopejs/dms-media` as an AntelopeJS dependency so imports resolve to the runtime singleton (the module lists itself in `antelopeJs.implements`).

## HTTP surface

- `GET /api/media/tree`, `GET /api/media/folders/:id/assets|acl`
- `POST /api/media/folders`, `POST /api/media/folders/:id/rename|move|visibility`, `PUT /api/media/folders/:id/acl`, `DELETE /api/media/folders/:id`
- `GET /api/media/assets`, `GET /api/media/assets/search`, `GET /api/media/assets/:id`, `GET /api/media/assets/:id/read-url?preset=`
- `POST /api/media/assets/:id/update|move|visibility|transform|revert`, `DELETE /api/media/assets/:id`
- `POST /api/media/upload/presign`, `POST /api/media/upload/confirm`, `POST /api/media/previews`
- Public delivery: `GET /media/:assetId/:filename`, `GET /media/:assetId/:presetId/:filename`

## Development

```bash
pnpm install
pnpm dev            # backend, via playground (ajs project run -w -p playground)
pnpm frontend:dev   # Vue 3 Inertia frontend, from playground (ajs-dms dev)
pnpm test           # build + full mocha suite (unit + HTTP integration)
pnpm test:unit      # resolver / bindings / derivatives unit tests only
```

The frontend entry is `frontend-vue/dms.frontend.ts`. It registers the existing `DmsMedia` and nested `Finder` component names. Use relative imports for module-local files because the Inertia adapter copies the frontend separately from the backend. The adapter discovers locale files and `app/config/shortcuts-registry.ts`; no Nuxt installation is required.

The playground uses the `@antelopejs/dms-frontend` CLI. Run `pnpm --dir frontend-vue install` and `pnpm --dir frontend-vue test` for frontend tests. Set `DMS_FRONTEND_WORKSPACE` to the generated Inertia workspace before running `pnpm --dir frontend-vue typecheck`.

## Known limitations (v1)

- Abandoned staged uploads are expired by the storage backend (e.g. S3 lifecycle rule on the `__staging__/` prefix), not by this module — `interface-file-storage` exposes no listing.
- Multi-user ACL scenarios are covered by resolver unit tests; HTTP integration tests run as the owner because the DMS invite flow does not expose invite tokens over HTTP (see the DMS module's `TESTING.md` for the matching upstream limitation).
- Folder visibility applies to the folder's direct assets (no recursive visibility inheritance); assets inherit or override individually.
- Cover cropping is centred (no focal point) and reference counting ("used in N records") is out of scope — see the PRD's v2 list.
