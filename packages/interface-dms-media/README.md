# @antelopejs/interface-dms-media

<div align="center">
<a href="https://www.npmjs.com/package/@antelopejs/interface-dms-media"><img alt="NPM version" src="https://img.shields.io/npm/v/@antelopejs/interface-dms-media.svg?style=for-the-badge&labelColor=000000"></a>
<a href="./LICENSE"><img alt="License" src="https://img.shields.io/badge/license-Apache--2.0-blue?style=for-the-badge&labelColor=000000"></a>
<a href="https://discord.gg/sjK28QHrA7"><img src="https://img.shields.io/badge/Discord-18181B?logo=discord&style=for-the-badge&color=000000" alt="Discord"></a>
<a href="https://antelopejs.com"><img src="https://img.shields.io/badge/Docs-18181B?style=for-the-badge&color=000000" alt="Documentation"></a>
</div>

AntelopeJS interface for the DMS media module (`@antelopejs/dms-media`):
declare asset fields, and the media folders bound to them, from any module.

- **Implemented by** `@antelopejs/dms-media` (declared in its
  `antelopeJs.implements`).
- **Consumed by** modules that declare `AssetType` fields on their DMS pages.
  Declare this package in `dependencies`.

## Surface

- `AssetType` — form field referencing media library assets by id (one id, or
  an array with `multiple`). Registers the `asset` data type; its widget is the
  `dms-media-asset-picker` component the module ships.
- `RegisterAssetBinding(config)` / `UnregisterAssetBinding(id)` — declare or
  withdraw a folder binding. `new AssetType({ binding })` registers its binding
  itself. The implementer provisions the bound folder under the `Content` root
  of each tenant, with an ACL derived from `permissionMapping`,
  `permissionsFromPage` or an explicit `acl`.
- Types: `AssetTypeOptions`, `AssetPickerComponentOptions`,
  `AssetBindingConfig`, `AssetPermissionMapping`, `AclEntry`, `AclSubject`,
  `AclSubjectKind`, `AclRight`.

A binding registration belongs to the module that makes it: it is released
when that module is destroyed and replayed to every new generation of the
implementer, so either side can hot reload without losing it.

```ts
import { AssetType } from "@antelopejs/interface-dms-media";

new AssetType({
  mimetypes: ["image/*"],
  binding: {
    id: "articles.cover",
    folderName: "Article covers",
    permissionsFromPage: ArticlesPage,
  },
});
```

## Development

Lives in the [`dms-media`](https://github.com/AntelopeJS/dms-media) workspace,
next to the module that implements it.

```bash
pnpm build
pnpm lint
pnpm typecheck
pnpm knip
pnpm check:exports  # after build: the exports map matches dist
```
