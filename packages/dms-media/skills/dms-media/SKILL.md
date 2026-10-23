---
name: dms-media
description: Media library with the @antelopejs/dms-media module of the AntelopeJS DMS. Use when installing or configuring dms-media, adding an image or file field to a DMS form with AssetType, binding a field to a folder and its permissions (permissionsFromPage, permissionMapping, rootAcl), shipping folders and files as code (EnsureMediaFolder, ImportMediaAsset, seeding demo content), serving images in a given size (presets, /media URLs), or debugging uploads refused by CORS, type, quota or folder rights.
icon: i-lucide-images
category: content
tags: [media, assets, uploads, images, permissions, dms-module]
---

# dms-media

Asset library: folders with per-folder ACL, direct-to-storage uploads, stable `/media` URLs, lazy image sizes, crop/rotate.
Owner pages under `/modules/media` (overview, files, uploads, file, editor, activity, presets). Members never open them:
they reach media through `AssetType` fields on project pages. User docs: `docs/` of this package, published at
https://dms.antelopejs.com/docs/modules/media.
Overview, uploads and activity are `live` pages (shared `rememberKey: "media"`) opening on the DMS `pageToolbar({ period: false })`
(last read + Direct / Pause, block id `toolbar`); the upload history table is `liveHold`. Needs interface-dms with `base/page-toolbar`.
Every data block carries `realtimeTopic: MEDIA_LIBRARY_TOPIC`; custom components refresh through `onLibraryChange` (DMS
`usePageLiveRefresh`, so Pause holds them). Announcements are coalesced and carry `payload.count` (changes they stand for).

## Setup

- Media 0.5 requires `@antelopejs/dms` >=0.9 (interface-dms >=0.7.2, renderer `@antelopejs/dms-frontend` 0.6)
  and `@antelopejs/interface-dms-media` >=0.3.0 <0.4.0. Media 0.4 uses media interface 0.2; Media 0.3 is the DMS 0.8 line.
- `ajs project modules add @antelopejs/dms-media`, plus an `interface-file-storage` module (`file-storage-local`).
- Set the storage's `baseUrl` and the module's `publicBaseUrl` to `${@api.API_PUBLIC_BASE_URL}`, and list every
  dashboard origin in the api module's `cors.allowedOrigins`: the browser `PUT`s files straight to the storage.
- Options: `storage`, `rootAcl` (default empty), `allowedMimetypes` (HTML/XHTML/PHP always refused),
  `storageQuotaBytes`, `publicBaseUrl`, `presets` (`{ id, width?, height?, fit, format, quality }`; keep `thumb`).

## Reference files from a page

Put the field in a DMS `Form` block of a backend-declared page; no custom Vue is needed.

```typescript
import { AssetType } from "@antelopejs/interface-dms-media"; // in the module's dependencies

static form = Form({
  fields: [{
    id: "cover",
    label: "$app.articles.cover",
    type: new AssetType({
      mimetypes: ["image/*"],          // multiple / max for galleries
      binding: { id: "articles.cover", folderName: "Article covers", permissionsFromPage: ArticlesPage },
    }),
  }],
});
```

- The value is an asset id (an array with `multiple`). The `binding` provisions a linked folder under `Content`
  (idempotent on `id`); its rights derive from the page's permission. Explicit `permissionMapping`
  (`{ read: [...], write: [...] }`) wins per right.
- Per-record layout under a field's folder (one folder per project): `binding: { id, subfolders: true }`, then
  `EnsureMediaFolder({ tenantId, key, name, parent: { binding: id } })` or owner-created subfolders.
- Only an explicit role grant of the page counts: `memberAccess` / `publicAccess` pages grant no folder right.
- Rights: `manage` ⇒ `write` ⇒ `read`. Upload needs `write`; folder structure needs `manage`; visibility is owner-only.

## Ship content as code

```typescript
import { EnsureMediaFolder, ImportMediaAsset } from "@antelopejs/interface-dms-media";

// Called by the application's lifecycle with a trusted, explicit tenant.
export async function declareMedia(tenantId: string): Promise<void> {
  await EnsureMediaFolder({ tenantId, key: "helio.procedures", name: "Procedures", visibility: "private" });
  await ImportMediaAsset({
    tenantId,
    key: "helio.procedures.roof",
    folder: { key: "helio.procedures" },   // or { binding: "projects.cover" } for a field's folder
    name: "Roof safety checklist.pdf",
    mimetype: "application/pdf",
    source: { filePath: "/abs/path.pdf" }, // or { bytes: buffer }, or { load: () => bytes }
    version: "2026-10-17",                 // optional: while unchanged, the source is not read
  });
}
```

- Required `tenantId` in types and runtime: omitted/empty/whitespace-only rejects before writes. No fallback;
  an explicitly chosen `DEFAULT_TENANT_ID` remains valid. Idempotent per tenant + kind + key. Returns
  `{ status: "created" | "updated" | "unchanged" | "preserved" | "deleted", id? }`.
- New SaaS tenants: the application registers `RegisterWorkspaceLifecycleConsumer` from
  `@antelopejs/interface-dms-saas/workspace-lifecycle` for `created` before startup reconciliation.
  Delivery follows preparation/payment and is at least once: deduplicate `operationId`, persist resource links
  before returning a receipt, and recover incomplete attempts. Media does not register it or depend on SaaS.
- `start()` is process-global: use it for registration or explicitly scoped global work, not implicit default content.
  Never await declarations in `construct()`. A required tenant does not prove authorization or committed provisioning.
  The prepayment `TENANT_BEING_PROVISIONED` hook has no automatic replay/compensation and is not durable `created`.
- Deployment refresh/backfill is separate: enumerate trusted tenants, require `IsWorkspaceProvisioningCommitted(tenantId)`,
  fail closed on lookup errors, and coordinate writers. Idempotent APIs do not make all effects exactly-once.
  See the [canonical lifecycle guidance](https://dms.antelopejs.com/docs/modules/media/reference#new-saas-tenants-application-owned-durable-lifecycle).
- Generated files: `source: { load }` is called only when the bytes are needed; with a `version` changed whenever the
  bytes change, an unchanged file is not read or generated again on reload. Files a member changed or deleted are never read.
- Dropped content: `PruneMediaDeclarations({ tenantId, prefix: "helio.", keep: declaredKeys })` after declaring retires
  the namespace's other keys (files, then deepest folders); `RetireMediaDeclaration({ tenantId, kind, key })` one key.
  Removed only while still as declared (folders only when empty), else `preserved` and handed to members; never a cascade.
- Never undoes a member: a row changed since its last declaration is `preserved`, a deleted one stays `deleted`;
  only a row still exactly as declared is refreshed. Parents before children, folders before files (await each).
- Same rules as the dashboard (names, unique sibling folders, allowed and field types, quota, decodable images); errors
  name the key (`Media file 'helio.x': ...`). Never write `media_folders` / `media_assets` directly.

## Delivery

- `GET /media/<assetId>/<filename>` and `/media/<assetId>/<presetId>/<filename>` (302 to a signed URL; stable
  across edits, renames and visibility changes). Private files need a token.
- The module declares `/media/**` to the frontend server (`backendProxies`, `auth: "session"`): the same links work on
  the dashboard's origin, a private file opening for a signed-in member. Copied links start with `publicBaseUrl`.
- Authenticated: `GET /api/media/assets/:id/read-url?preset=`.
- An image the dashboard shows uses a relative `/media/...` path or a signed read URL, never a `publicBaseUrl` link:
  the API's origin carries no session cookie, so a private file answers 401 there.

## Gotchas

- Upload refusals answer `{ reason }`: `type_not_allowed` / `field_type` (415), `quota` (413), `invalid_image` (422).
- Linked folders cannot be renamed, moved, deleted or re-ACLed; they hold subfolders only with `subfolders: true`
  on the binding (otherwise 403 `bound_parent`). Subfolders inherit the folder's ACL and the field's accepted types.
- Names are unique per folder, case aside (409 `name_taken`).
- Editing an image changes it everywhere it is used; there is no per-usage crop and no usage tracking yet.
