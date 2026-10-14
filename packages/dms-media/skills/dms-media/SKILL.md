---
name: dms-media
description: Media library with the @antelopejs/dms-media module of the AntelopeJS DMS. Use when installing or configuring dms-media, adding an image or file field to a DMS form with AssetType, binding a field to a folder and its permissions (permissionsFromPage, permissionMapping, rootAcl), serving images in a given size (presets, /media URLs), or debugging uploads refused by CORS, type, quota or folder rights.
icon: i-lucide-images
category: content
tags: [media, assets, uploads, images, permissions, dms-module]
---

# dms-media

Asset library: folders with per-folder ACL, direct-to-storage uploads, stable `/media` URLs, lazy image sizes, crop/rotate.
Owner pages under `/modules/media` (overview, files, uploads, file, editor, activity, presets). Members never open them:
they reach media through `AssetType` fields on project pages. User docs: `docs/` of this package, published at
https://dms.antelopejs.com/docs/modules/media.

## Setup

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
- Only an explicit role grant of the page counts: `memberAccess` / `publicAccess` pages grant no folder right.
- Rights: `manage` ⇒ `write` ⇒ `read`. Upload needs `write`; folder structure needs `manage`; visibility is owner-only.

## Delivery

- `GET /media/<assetId>/<filename>` and `/media/<assetId>/<presetId>/<filename>` (302 to a signed URL; stable
  across edits, renames and visibility changes). Private files need a token.
- Authenticated: `GET /api/media/assets/:id/read-url?preset=`.

## Gotchas

- Upload refusals answer `{ reason }`: `type_not_allowed` / `field_type` (415), `quota` (413), `invalid_image` (422).
- Linked folders cannot be renamed, moved, deleted, re-ACLed or hold subfolders (403 `bound_parent`).
- Names are unique per folder, case aside (409 `name_taken`).
- Editing an image changes it everywhere it is used; there is no per-usage crop and no usage tracking yet.
