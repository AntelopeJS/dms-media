<div align="center">

# @antelopejs/interface-dms-media

<a href="https://www.npmjs.com/package/@antelopejs/interface-dms-media"><img alt="npm" src="https://img.shields.io/npm/v/@antelopejs/interface-dms-media?style=for-the-badge&labelColor=000000&color=000000"></a>
<a href="./LICENSE"><img alt="License" src="https://img.shields.io/npm/l/@antelopejs/interface-dms-media?style=for-the-badge&labelColor=000000&color=000000"></a>
<a href="https://discord.gg/sjK28QHrA7"><img alt="Discord" src="https://img.shields.io/badge/Discord-18181B?logo=discord&style=for-the-badge&color=000000"></a>
<a href="https://dms.antelopejs.com/docs/modules/media/extending"><img alt="Documentation" src="https://img.shields.io/badge/Docs-18181B?style=for-the-badge&color=000000"></a>

The AntelopeJS interface to add media library fields, and the folders bound to them, to DMS pages, and to ship library folders and files as code.

</div>

## What it does

- Adds an `AssetType` form field that references library assets by id (one id, or an array with `multiple`) and opens the library as a picker.
- Binds a field to a folder provisioned under the `Content` root of each tenant: `RegisterAssetBinding` and `UnregisterAssetBinding`, or `new AssetType({ binding })`.
- Derives the folder's rights from a page (`permissionsFromPage`), a `permissionMapping` or an explicit `acl`.
- Replays bindings to every new generation of the implementation, so either side can hot reload.
- Ships folders and files from backend code with `EnsureMediaFolder` and `ImportMediaAsset`: idempotent per key, they never undo what members changed since. `RetireMediaDeclaration` and `PruneMediaDeclarations` take back what the code stopped declaring, unless members changed it.
- Keeps your module independent of the implementation, [`@antelopejs/dms-media`](https://www.npmjs.com/package/@antelopejs/dms-media).

## Install

Add the interface to the `dependencies` of the module that declares asset fields:

```bash
pnpm add @antelopejs/interface-dms-media
```

## Quick start

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

Ship a folder and a file for an explicitly selected tenant. This example intentionally selects the default tenant; for SaaS use the trusted tenant from your application's durable `created` consumer, not a process-global implicit fallback:

```ts
import { EnsureMediaFolder, ImportMediaAsset } from "@antelopejs/interface-dms-media";
import { DEFAULT_TENANT_ID } from "@antelopejs/interface-dms/constants";

const tenantId = DEFAULT_TENANT_ID;
await EnsureMediaFolder({ tenantId, key: "helio.procedures", name: "Procedures" });
await ImportMediaAsset({
  tenantId,
  key: "helio.procedures.roof",
  folder: { key: "helio.procedures" },
  name: "Roof safety checklist.pdf",
  mimetype: "application/pdf",
  source: { filePath: "/srv/content/roof-safety-checklist.pdf" },
});
```

Both declarations require `tenantId` in TypeScript and reject missing, empty or whitespace-only values at runtime before writes. Existing users of these new APIs must pass it explicitly; older media APIs are unchanged. A tenant id does not establish authorization or completed provisioning. See the [application-owned lifecycle and backfill guidance](./docs/1.index.md#new-saas-tenants-application-owned-durable-lifecycle) for at-least-once delivery, durable receipts and deployment refreshes.

The interface also exports the option, declaration and ACL types: `AssetTypeOptions`, `AssetPickerComponentOptions`, `AssetBindingConfig`, `AssetPermissionMapping`, `MediaFolderDeclaration`, `MediaAssetDeclaration`, `MediaFolderTarget`, `MediaAssetSource`, `MediaLazySource`, `MediaDeclarationResult`, `MediaDeclarationStatus`, `MediaContentKind`, `MediaDeclarationRetirement`, `MediaDeclarationPrune`, `MediaRetirementResult`, `MediaRetirementStatus`, `AclEntry`, `AclSubject`, `AclSubjectKind` and `AclRight`.

## Compatibility

The 0.3 interface line requires `@antelopejs/dms-media >=0.5.0` for `EnsureMediaFolder` and `ImportMediaAsset`. Media 0.4 uses the 0.2 interface line. The interface declares these peer dependencies:

<!-- docs-compat: ./package.json#peerDependencies -->

| Package | Range |
| --- | --- |
| `@antelopejs/interface-api` | `>=0.0.15 <1.0.0` |
| `@antelopejs/interface-core` | `>=0.2.4 <1.0.0` |
| `@antelopejs/interface-dms` | `>=0.7.2 <1.0.0` |

## Documentation

- [Consumer reference](./docs/1.index.md): field types, bindings, lifecycle, declared content and permission precedence
- [Extending the media module](https://dms.antelopejs.com/docs/modules/media/extending): asset fields, folder bindings, the HTTP API and delivery URLs
- [The asset field](https://dms.antelopejs.com/docs/modules/media/usage/asset-field)
- [Media module guide](https://dms.antelopejs.com/docs/modules/media)

## Contributing

This package lives in the [`AntelopeJS/dms-media`](https://github.com/AntelopeJS/dms-media) pnpm workspace, next to the module that implements it. Read [CONTRIBUTING.md](https://github.com/AntelopeJS/dms-media/blob/main/CONTRIBUTING.md) and the [repository README](https://github.com/AntelopeJS/dms-media#contributing) for the development commands; `pnpm check:exports` checks, after a build, that the exports map matches `dist`. Release this package before the module that implements it.

## License

[Apache-2.0](./LICENSE)
