# @antelopejs/dms-media

<div align="center">
<a href="https://www.npmjs.com/package/@antelopejs/dms-media"><img alt="NPM version" src="https://img.shields.io/npm/v/@antelopejs/dms-media.svg?style=for-the-badge&labelColor=000000"></a>
<a href="./LICENSE"><img alt="License" src="https://img.shields.io/badge/license-Apache--2.0-blue?style=for-the-badge&labelColor=000000"></a>
<a href="https://discord.gg/sjK28QHrA7"><img src="https://img.shields.io/badge/Discord-18181B?logo=discord&style=for-the-badge&color=000000" alt="Discord"></a>
<a href="https://antelopejs.com"><img src="https://img.shields.io/badge/Docs-18181B?style=for-the-badge&color=000000" alt="Documentation"></a>
</div>

AntelopeJS DMS module providing an asset/media library: upload, folders, delivery derivatives and light image editing, with per-folder permissions that reuse the DMS authorization system. Ships a Finder-style file explorer (frontend) and an `AssetType` field to reference library assets from forms.

See [AGENTS.md](../../AGENTS.md) for code conventions.

## Installation

```bash
ajs project modules add @antelopejs/dms-media
```

## Features

- **Folder tree with per-folder ACL** — a linked folder carries the ACL (`AclEntry[]`) its binding derives, every other folder inherits from its parent (root falls back to the configurable `rootAcl`, which grants nothing by default). Entries grant `read`/`write`/`manage` rights to either a **permission id** (anyone holding e.g. `articles.page.table.edit`) or a **role id**. Rights imply weaker ones (`manage ⇒ write ⇒ read`). Ancestors of a readable folder are returned as **traverse-only shells** (name visible, content never listed).
- **Single data path** — listing, search, picker and delivery all resolve the same `readable`/`writable`/`manageable` sets per request; nothing bypasses the ACL.
- **Direct-to-storage uploads** — `presign` (type and quota checks, staged) → client `PUT` → `confirm` (type check again, sharp decode of declared images, promote + DB row). Bytes never transit through Node. The stored mimetype is the one sharp reads, and the dimensions follow the EXIF orientation. `abort` deletes a staged file, and an hourly cron deletes the ones never confirmed.
- **Stable delivery URLs** — `GET /media/:assetId/:filename` 302-redirects to a signed storage URL. The redirect itself is never cached (`Cache-Control: no-cache` for public assets, with `Access-Control-Allow-Origin: *`; `no-store` for private ones, after auth + folder read check), so an edit or a visibility change shows on the next request; the signed URL it points to is reused for half its lifetime. A link with a stale file name redirects to the canonical one. Active content is the exception: SVG (inline) and HTML, XHTML and XML files (as `attachment`) are served by the API itself with `Content-Security-Policy: sandbox`, `X-Content-Type-Options: nosniff`, ETag/304 and Range support. A browser that opens a private file without a token is redirected to the file's page in the dashboard (`/modules/media/file?asset=`), which signs in and comes back; when the dashboard URL is unknown it gets a 401 HTML page. Visibility (asset override → folder → private) is a flag flip; URLs never change.
- **Lazy image derivatives** — named presets (config) rendered by sharp on first request, cached in storage under a config-hashed cache key, served via `GET /media/:assetId/:presetId/:filename` and the authenticated `read-url` endpoint. Changing a preset invalidates naturally (new hash); a daily cron sweeps stale keys. An image sharp cannot read answers 422, a size that fails to render for another reason 503.
- **Server-side image editing** — `transform` (normalized crop, 90° rotations) overwrites the image everywhere it is used, `transform/copy` saves the edit as a new file next to the untouched source ("Save as copy"), and `revert` restores the original. The pristine original is preserved on first edit (its size counts in the storage), successive edits are rendered from it, and derivatives are invalidated.
- **`AssetType` form field** — registers the `asset` data type whose widget (`DmsMediaAssetPicker`) opens the Finder as a picker. Declaring a `binding` auto-provisions a linked folder under the `Content` root (idempotency key = binding id) whose ACL derives from the declared permission mapping; linked folders cannot be renamed, moved, deleted or re-ACLed through the API.
- **Media module** — registered with `RegisterModule` like every DMS module, so it is listed under Modules and its pages live under `/modules/media` (they are the owner's administration of the library, see [Access model](#access-model)): Library (Overview `/modules/media/overview`, Library `/modules/media/files`, Uploads `/modules/media/uploads`, plus the hidden File `/modules/media/file?asset=`, Edit image `/modules/media/editor?asset=` and Activity `/modules/media/activity` pages) and Settings (Image sizes `/modules/media/presets`). Every page is a backend block tree. Module pages are owner-only (see [Static permissions](#static-permissions)).
- **Explorer** — server-paged listings with facets (type, visibility, modification date, orientation), smart views (recents, starred, missing alt text, largest, public), server search over names, alt text and folders (accents, case and word order ignored), bulk move/visibility/delete, zip download of a selection or of a folder with its subfolders, drag and drop, keyboard shortcuts and a shared upload queue that survives navigation.
- **Unique names** — renaming a file, or creating, renaming or moving a folder, onto a name its folder already holds (case and Unicode form aside) answers 409, and an upload that collides offers "Keep both" (the next free name, `photo (2).jpg`, from `POST /api/media/upload/names`) or "Cancel". A name typed in the library that Windows or macOS cannot save is refused, a subfolder cannot be created in or moved into a linked folder (403), and validation errors answer `$dms_media.errors.*` keys the dashboard translates.
- **Activity** — every write is recorded in `media_events` (kept 90 days) and feeds the overview, the Activity page (filterable by kind of action), the file history and the upload batches.

## Static permissions

The module registers no permission: nothing about media is offered in Settings › Roles, because the Media pages are owner-only and members reach media through the project's pages (see [Access model](#access-model)).

| Permission | Effect |
|---|---|
| `modules.media.library.files` | Page permission of Library. Like every module page permission it is owner-only: it is not listed in Roles and `HasPermission` refuses it to any non-owner. It grants no folder right |

Per-folder rights are the single authority for operations: upload requires `write` on the target folder, folder structure changes require `manage`. The owner holds every right on every folder. Changing a file or folder visibility is owner-only.

## Access model

The module's pages are the **owner's administration** of the library: like the pages of every DMS module they are owner-only, on purpose, and cannot be given to a role.

Members use media **through the component the module exports**: an `AssetType` field placed on the **project's** pages, which are grantable in Settings › Roles. The field opens the "floating" picker and uploader on a folder defined in advance: its `binding` provisions a linked folder, and `permissionsFromPage` derives that folder's rights from the project page that holds the field. A member whose role grants the page can see the linked folder and upload into it from the picker, without ever opening a Media page:

```ts
@RegisterPage()
export class ArticlesPage extends PageController("articles", { displayName: "Articles", category: pagesCategory }) {
	static form = Form({
		fields: [
			{
				id: "cover",
				label: "Cover",
				type: new AssetType({
					mimetypes: ["image/*"],
					binding: { id: "articles.cover", folderName: "Article covers", permissionsFromPage: ArticlesPage },
				}),
			},
		],
	});
}
```

The page permission must be an explicit grant of the role: a page every member opens by default (`memberAccess`, `publicAccess`) grants no folder right, because folder ACL subjects match the permissions a member holds. In a linked folder, the member can upload, describe, rename, move, delete and edit every file of the folder, whoever added it; making a file public or private stays with the owner. The rest of the library stays closed to members: the default root ACL grants nothing, and only a permission or role a project adds to `rootAcl`, opens it to the picker.

## Module configuration

```json
{
	"dms-media": {
		"config": {
			"storage": "media",
			"rootAcl": [{ "subject": { "kind": "permission", "id": "articles.page" }, "rights": ["read"] }],
			"allowedMimetypes": ["image/*", "application/pdf"],
			"storageQuotaBytes": 10000000000,
			"publicBaseUrl": "${@api.API_PUBLIC_BASE_URL}",
			"presets": [
				{ "id": "thumb", "width": 300, "height": 300, "fit": "cover", "format": "webp", "quality": 80 }
			]
		}
	}
}
```

All keys are optional:

- `storage` selects a named `interface-file-storage` backend (default storage otherwise).
- `rootAcl` sets the rights every folder without its own ACL inherits. The default is empty: owners hold every right anyway, and members only reach the linked folders of their pages. An entry you add here opens the whole library to its subject.
- `allowedMimetypes` lists the file types the library accepts (`image/*` matches a prefix). The default is `image/*`, `video/*`, `audio/*`, `application/pdf`, the Office types (`application/msword`, `application/vnd.ms-excel`, `application/vnd.ms-powerpoint`, `application/vnd.openxmlformats-officedocument.*`), OpenDocument (`application/vnd.oasis.opendocument.*`), `application/rtf`, `text/plain`, `text/markdown` and `text/csv`. HTML, XHTML and PHP (`text/html`, `application/xhtml+xml`, the PHP types, and `.htm`, `.html`, `.xhtml`, `.xht`, `.shtml`, `.mht`, `.mhtml`, `.php`, `.php3`–`.php8`, `.phps`, `.pht`, `.phtml`, `.phar` files) are always refused, whatever the list says.
- `storageQuotaBytes` sets the storage plan: the overview measures usage against it, and `presign` refuses an upload that would go past it.
- `publicBaseUrl` is the public URL of the API, the origin serving `/media/...`: "Copy link" in the library and the links of the file page's Delivery tab start with it. Point it at the api module's public base URL (`"${@api.API_PUBLIC_BASE_URL}"`, as `file-storage-local`'s `baseUrl`). Without it, links start with the DMS `apiBaseUrl` (`GetApiBaseUrl`), and stay relative when neither is set; request headers (`Host`, `X-Forwarded-*`) are never read. Links do not use the dashboard's origin: it only relays non-HTML requests to `/media`, so a link opened in a tab would end on its 404.
- `presets` replaces the default `thumb`/`preview` presets. Keep a `thumb` preset — the Finder uses it for grid thumbnails.

A refused upload answers a JSON body `{ "reason": …, "message": … }` the upload queue explains in the member's language: `type_not_allowed` (415, not an accepted type), `field_type` (415, the linked folder feeds a field that accepts fewer types, listed in `accepted`), `quota` (413, the storage plan is full, with `remaining` and `quota`) or `invalid_image` (422 on `confirm`, a declared image that does not decode).

Two crons run with the module: `dms-media-purge-staging`, every hour, deletes the uploads staged more than 24 hours ago and never confirmed, and a daily sweep removes stale derivatives.

## Deployment: allow the dashboard's origin

Files do not go through the dashboard. The browser asks the API to `presign` the upload, then `PUT`s the file straight to the URL the storage returns: with `file-storage-local`, its `baseUrl`, the API's public URL (`${@api.API_PUBLIC_BASE_URL}/file-storage/...`). That is another origin than the dashboard's, so the api module must list every origin the dashboard is served on in `cors.allowedOrigins`:

```json
{
	"api": {
		"config": {
			"cors": {
				"allowedOrigins": ["https://dms.example.com", "http://dms.localhost:3014"]
			}
		}
	},
	"file-storage-local": {
		"config": { "baseUrl": "${@api.API_PUBLIC_BASE_URL}" }
	}
}
```

Without it, the browser blocks the `PUT` (its console shows a CORS error on `/file-storage/...`) while listing and presigning still work. The upload queue, the AssetType field and the toasts then say the storage refused this site's address, naming the origin to add; retrying cannot help until it is allowed. When the storage address itself cannot be reached from the browser (an internal host name as `baseUrl`, for instance), they say so instead: point `baseUrl`, and the module's `publicBaseUrl`, at the public URL of the API.

## Declaring an AssetType field

`AssetType` and the folder bindings it declares live in the interface package [`@antelopejs/interface-dms-media`](../interface-dms-media), which this module implements. Declare the interface in the consumer module's `dependencies` and import from it:

```bash
pnpm add @antelopejs/interface-dms-media
```

```ts
import { AssetType } from "@antelopejs/interface-dms-media";

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

A `binding` is registered through `RegisterAssetBinding` (also exported by the interface, together with `UnregisterAssetBinding`). The registration belongs to the module that declares the field: it is released when that module is destroyed, and replayed to dms-media whenever dms-media reloads.

## HTTP surface

- Library: `GET /api/media/tree` (folders, plus `allowedMimetypes`), `GET /api/media/folders/:id/assets|impact`, `GET /api/media/views/:view` (`recent`, `starred`, `missing-alt`, `largest`, `public`), `GET /api/media/search` (an empty `q` finds nothing), `POST /api/media/favorites`, `POST /api/media/folders/starter`. Folder listings and views take the `type`, `visibility`, `modified` and `orientation` facets; views also take a `folderId` to stay inside one folder
- Overview (owners only, 403 otherwise): `GET /api/media/stats/kpis|storage|attention|recent`, `GET /api/media/activity?type=`
- File: `GET /api/media/assets/:id/details|history|information|delivery|delivery/notice|tab-counts`, `GET /api/media/links/origin` (the origin copied links start with: `publicBaseUrl`, otherwise the DMS `apiBaseUrl`)
- Bulk: `POST /api/media/assets/bulk/move|visibility|delete`, `POST /api/media/assets/zip`, `POST /api/media/folders/:id/zip` (the folder and its subfolders, `read` right)
- Settings: `GET|POST /api/media/upload/batches`, `GET /api/media/presets`, `GET /api/media/presets/config`, `GET /api/media/presets/cache`
- `POST /api/media/folders`, `POST /api/media/folders/:id/rename|move|visibility`, `DELETE /api/media/folders/:id`
- `GET /api/media/assets`, `GET /api/media/assets/search`, `GET /api/media/assets/:id`, `GET /api/media/assets/:id/read-url?preset=`, `POST /api/media/previews`
- `POST /api/media/assets/:id/update|move|visibility|transform|transform/copy|revert`, `DELETE /api/media/assets/:id`
- Upload: `POST /api/media/upload/presign`, `POST /api/media/upload/confirm`, `POST /api/media/upload/abort` (deletes the staged file), `POST /api/media/upload/names` (free names for "Keep both")
- Public delivery: `GET /media/:assetId/:filename`, `GET /media/:assetId/:presetId/:filename`

`GET /api/media/stats/folders` and `GET /api/media/stats/largest` are removed: the overview no longer shows folder cards or the largest files, which the `largest` view lists.

Status codes worth handling:

| Route | Status | Body |
|---|---|---|
| `upload/presign` | 415 | `{ reason: "type_not_allowed", message }`: not in `allowedMimetypes`, or HTML/XHTML/PHP (by type or extension) |
| `upload/presign` | 415 | `{ reason: "field_type", message, accepted }`: the linked folder feeds a field that accepts fewer types |
| `upload/presign` | 413 | `{ reason: "quota", message, remaining, quota }`: the upload would go past `storageQuotaBytes` |
| `upload/confirm` | 422 | `{ reason: "invalid_image", message }`: a declared image that does not decode; the staged file is deleted |
| `assets/:id/update`, `folders`, `folders/:id/rename|move` | 409 | `$dms_media.errors.name_taken` or `folder_name_taken`: the name is taken in that folder, case aside |
| `folders`, `folders/:id/move` | 403 | `$dms_media.errors.bound_parent`: the parent is a linked folder |
| Folder, file and bulk writes | 400 | A `$dms_media.errors.*` key |
| `/media/:assetId/:filename` | 302 | To the signed storage URL (`no-cache` public, `no-store` private), to the canonical file name, or, for a browser without a token on a private file, to the dashboard's File page |
| `/media/:assetId/:filename` | 401 | Private file without a token: bare for scripts, an HTML page for a browser when the dashboard URL is unknown |
| `/media/:assetId/:presetId/:filename` | 422 / 503 | The image cannot be read / the size cannot be rendered right now |

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

## Known limitations (v1)

- Abandoned staged uploads are purged from the `media_uploads` table the module fills at `presign` (`interface-file-storage` exposes no listing).
- The DMS invite flow does not expose invite tokens over HTTP (see the DMS module's `TESTING.md`), so the multi-user HTTP integration tests seed their invites straight into the database (`src/test/helpers/members.ts`).
- Folder visibility applies to the folder's direct assets (no recursive visibility inheritance); assets inherit or override individually.
- Cover cropping is centred (no focal point), and reference counting ("used in N records") is not supported yet.
- The `AssetType` field has no crop button: editing an image changes it everywhere it is used, and a crop per usage comes later.
- Replacing a file, a trash for deleted files and the server-side validation of `AssetType` values are not there yet; each comes in its own release.
