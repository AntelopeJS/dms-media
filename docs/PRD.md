# PRD: Asset management module (Media / Finder) for AntelopeJS DMS

## Overview

A standalone AntelopeJS module, distributed in its own repository (`dms-media`), that adds a library of reusable assets to the DMS: upload, folder organization, image derivatives (thumbnails/resize/webp), light editing (crop, rotation) and per-folder permissions. It reuses the Finder component (file explorer) already prototyped in PR #128 of the DMS repository, rebased into the module's nuxt layer. The structuring constraint is clean permission handling, with per-folder access restriction.

## Problem Statement

The DMS can currently handle **record files**: a file attached to a row through the `FileType`/`ImageType` data types (staging → promote on save, deletion with the record, rights inherited from the record). That model is sound and is not being questioned.

What is missing is the second nature of file: **library assets** — reusable, with an independent lifecycle, referenced by several records, organized in a folder tree with per-folder access rights. This is the standard asset manager expected from any DMS. The critical and non-trivial need is to **restrict access to some folders** by role, consistently with the existing permission system, without duplicating the authorization logic or creating a "picker that bypasses permissions" flaw (the canonical bug of the DMS products studied: Umbraco, Craft, Strapi).

## Goals & Success Criteria

- Upload, organize, move and delete assets in a folder tree.
- Restrict read/write/manage access per folder, with inheritance from the parent.
- Two consistent ACL sources: folders **bound** to a consumer (auto-provisioned, rights derived from the form permissions) and **free** folders (ACL set by hand, per role).
- Safe default: everything is **private** at the storage level; public visibility is an explicit choice, at **folder or file** granularity.
- No access path bypasses the ACL (listing, search and picker all consume the same endpoints).
- Negligible performance cost for a high-traffic public site (bytes never transit through the backend).
- The module is genuinely standalone: installable next to the DMS, without modifying `FileType`/`ImageType`.

**Measurable success criteria:**
- A "warehouse operator" role granted article editing *automatically* gets access to the bound asset folder, with no extra configuration.
- A user only sees, in the library, the folders their roles/permissions give access to (the others do not exist for them, except traverse-only ancestor shells).
- Switching a folder or a file between private and public changes no URL and moves no file.

## User Stories

- As an **admin**, I create a free folder (brand kit) and tick the roles allowed to read/write/manage it.
- As a **module developer**, I declare an `AssetType` field with a bound folder; the module provisions the folder and sets the rights derived from the form permissions.
- As an **editor (warehouse operator)**, when my role is granted article editing, I get access to the article asset folder without configuring anything.
- As an **editor**, I open the picker on the bound folder from a form field, yet I can navigate to an asset shared elsewhere if my rights allow it; my upload lands in the bound folder.
- As an **editor**, I crop or rotate an image from the library and the result is saved, with the option to go back to the original.
- As a **frontend integrator**, I reference a public asset through a stable, cacheable URL, without worrying about signature or expiry.

## Functional Requirements

### Structure & data model (tenant-scoped)

**`media_folders`**
- `_id`, `name`, `parentId` (null = root), `path: string[]` (ancestor ids — materialized path, like the Finder of PR #128).
- `acl?: AclEntry[]` — absent ⇒ inherits from the parent.
- `binding?` — consumer id (`AssetType` field / its page); idempotency key of the provisioning, marks the folder as non-restructurable by editors.
- `visibility: 'private' | 'public'` (default `private`).

**`media_assets`**
- `_id`, `folderId`, `name`, `mime`, `size`, `storageKey`, `storage`.
- `width`, `height`, `alt?`.
- `visibility: 'inherit' | 'private' | 'public'` (default `inherit`).
- `derivatives: Record<presetId, storageKey>` — cache of the generated derivatives.
- `originalKey?` — original preserved after a destructive edit (for "go back to the original").
- `createdBy`, timestamps.

**`AclEntry`** = `{ subject, rights }` where:
- `rights ⊆ { read, write, manage }`.
- `subject` = `{ kind: 'permission', id }` ("whoever holds `articles.table.edit`") **or** `{ kind: 'role', id }` (role ticked in the UI).

Indexing the ACL on **permissions** (and not only on roles) is the central insight: it reuses the stable DMS permission registry and makes access to bound folders follow automatically from the form rights, with no second system and no synchronization.

### Static module permissions (existing DMS registry)
- `settings.media.assets` — default DMS permission of the media page: see the library (registered by the DMS page, not by this module).
- `media.upload` — upload.
- `media.folders.manage` — create/rename/move/delete folders.
- `media.permissions.manage` — set/edit the ACLs.

### Permission resolution per request
- A single pass per request: load the tenant folders (without the assets), resolve the effective ACLs **top-down** (root ⇒ settings default, propagation, override wherever `acl` exists), evaluate each entry against the user's permission set (already computed by the guard) and their roles ⇒ three sets `readable` / `writable` / `manageable`.
- **Listing** a folder F: 403 if F ∉ readable; otherwise subfolders ∩ readable + assets of F.
- **Assets without their own ACL in v1**: they fully inherit the folder rights.
- **Traverse-only ancestors**: the ancestors of a readable folder are returned as shells (name visible for navigation, contents never listed), with an explicit flag in the API contract — handling of the Pimcore-style leak.
- **Search**: `folderId ∈ readable` injected into the query (no leak by construction).
- Every asset endpoint (metadata, read-url, move, delete, presign) resolves the rights of the relevant folder first.

### Two natures of files
- **Record files**: existing `FileType`/`ImageType`, **unchanged** (PR 262 included).
- **Library assets**: a new **`AssetType`** data type registered by the module — a reference to one or more assets, whose form widget opens the Finder modal in picker mode. This is the bridge to the forms. Rule of thumb: a document bound to a row ⇒ `FileType`; a reusable visual ⇒ `AssetType`.

### Bound folders (auto-provisioning)
- An `AssetType` field declares a bound folder plus a permission mapping (view → `read`, edit/create → `write`), overridable.
- The module provisions the folder **idempotently** (key = the binding), under a dedicated root (`/Content/...`), next to the free space (`/Media/...`).
- Bound folders are real DB rows (not a structure computed on the fly) ⇒ the global view stays an ordinary query filtered by rights.

### Upload
- `POST /api/media/presign` (`folderId` + name/size/mime) ⇒ `write` check ⇒ `CreateUploadUrl` in **staging** on the folder's named storage; reuses the signed token of PR 262 binding the upload to the storage.
- Client PUTs directly to the bucket (progress through `useUploadWithProgress`).
- `POST /api/media/confirm` ⇒ `GetFileMetadata` + `PromoteFile` + `media_assets` creation + image metadata extraction.
- Staging + sweep ⇒ no orphan objects if the PUT fails.

### Delivery (logical visibility, never physical)
- **A single bucket, always private.** Visibility is a flag in the database, not a location.
- Effective visibility = the asset override, otherwise the folder's, otherwise `private`. Granularity: **folder or file**.
- **Stable delivery route** `GET /media/:assetId/:filename` (URL never changes):
  - Private ⇒ auth + `read` ⇒ 302 to a short-lived signed URL, `no-store`.
  - Public ⇒ no check ⇒ 302 to a long-lived signed URL, `Cache-Control: public` (the CDN caches the redirect).
- Switching public ↔ private is a **boolean flip**: no copy, no broken URL (`MoveFile` disappears from the design).
- Public performance cost: Node never transfers the bytes (302 only); with a CDN in front, Node is hit about once per asset / edge / period, not per visitor; SSR does not hit the route (the browser loads the image), and the stable URL is cacheable in HTML.

### Image derivatives
- Bounded **named presets**: `{ id, width?, height?, fit, format, quality }`, configured in the owner settings (no arbitrary URL params ⇒ no DoS abuse).
- **Lazy** generation: on the first call for an `(asset, preset)` pair, sharp generates, writes to the bucket and caches; lock against concurrent generation.
- Route with a preset (`GET /media/:id/:preset/:filename`) ⇒ same visibility/ACL resolution, the derivative inherits the visibility of the original.
- **Cache key versioned** by a hash of the preset config ⇒ changing a preset requires no bulk job; the old key becomes orphaned (sweep), the new one is generated on demand.
- Framing `fit: cover` is centered by default in v1 (no focal point).

### Image editing (admin)
- **Crop + rotation only** in v1.
- The Finder sends the parameters (normalized rect, angle) to `POST /media/:id/transform`; the **server is authoritative** (sharp applies the operations, writes the new current file, invalidates the derivatives).
- `originalKey` is preserved ⇒ "go back to the original" button.
- Benefit for shared assets: the edit benefits every record referencing the asset through `AssetType`.

### Finder (frontend, from PR #128)
- Rebased into the module's nuxt layer (instead of `dms-ui`).
- Mock store replaced by an API adapter; views (grid/list/columns), hooks, DnD, context menu, breadcrumbs and i18n are kept.
- Used full-page (Media page, root category, guarded by `AuthUserWithPermission`) and as a modal (picker mode from `AssetType`).
- Picker: opens on the bound folder, free navigation wherever the rights allow it, uploads land in the bound folder.

## Non-Functional Requirements

- **Security**: no direct access to the bucket; everything goes through presign / the delivery route. A single data path for listing/search/picker ⇒ no ACL bypass.
- **Performance**: bytes never transferred by Node; derivatives generated once then cached; ACL resolved in a single pass per request.
- **Scalability**: public delivery offloaded to a CDN; storage on R2/S3 (object storage), no dependency on the server disk in production.
- **Consistency**: reuses the existing permission registry and guards (`GetEffectiveUserPermissions`, `HasPermission`, `AuthUserWithPermission`).
- **Portability**: storage abstracted through `interface-file-storage` (R2/S3 in production, local storage in development only).

## Technical Constraints

- DMS repository conventions (AGENTS.md): English, pnpm, no comments, no switch/case, functions ≤ 40 lines, no inline types, no magic values.
- Storage through `@antelopejs/interface-file-storage` (presign, staging, promote, named storages). `sharp` is already available.
- AntelopeJS decorator ORM (`@RegisterTable`, `@Field`, `@Index`, `BasicDataModel` models), tenant schema (`dms-tenant`).
- **Prerequisite to audit on the DMS repository side before starting**: check that the registries do cross module boundaries (plain interface state is per-module; only `InterfaceFunction`/proxies bridge it). To check: `RegisterPermission`, `RegisterPage`/`RegisterModule`, `RegisterDataType`, `RegisterTable`. Promote to `InterfaceFunction` the ones that do not cross — that is preparatory work in the DMS repository, to be estimated.
- Work with the signed token of PR 262 (upload bound to the field storage) rather than around it.

## Out of Scope (v1)

- Focal point (cover framing stays centered) — v2 refinement.
- Full versioning / op-by-op reversible edit stack — v2.
- Trash bin + deferred permanent deletion (30 days) — v2.
- Reference counting / "this asset is used in N records" (requires an index fed by `AssetType` writes) — v2.
- On-the-fly transformations through arbitrary URL params (explicit choice: named presets only).
- ACL at the level of an individual asset (assets inherit from the folder).
- Dedicated groups/teams and per-user ACLs (roles + permissions only).
- A CDN domain directly on a public bucket (performance fallback lever, not needed in v1).

## Open Questions

- **Orphan folders** (consumer deleted, module uninstalled): keep the files, access falling back to admin-only, "orphans" section — to be confirmed.
- **Folder bound by two bindings**: union of the ACL entries of both consumers (intended behaviour for shared assets) — to be confirmed.
- **Default root ACL**: exact values in the settings (proposed: `read`+`write` for holders of `settings.media.assets`/`media.upload`).
- **Frontend cropping library** for the editing UI (PR #128 does not provide one yet).
- Result of the **registry audit**: which ones cross module boundaries, which ones require a prior promotion on the DMS side.
