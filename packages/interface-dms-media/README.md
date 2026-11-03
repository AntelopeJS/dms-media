<div align="center">

# `@antelopejs/interface-dms-media`

<a href="https://www.npmjs.com/package/@antelopejs/interface-dms-media"><img data-illustration alt="npm" src="https://img.shields.io/npm/v/@antelopejs/interface-dms-media?style=for-the-badge&labelColor=000000&color=000000"></a>
<a href="./LICENSE"><img data-illustration alt="License" src="https://img.shields.io/npm/l/@antelopejs/interface-dms-media?style=for-the-badge&labelColor=000000&color=000000"></a>
<a href="https://discord.gg/g4pFt6eXqu"><img data-illustration alt="Discord" src="https://img.shields.io/badge/Discord-18181B?logo=discord&style=for-the-badge&color=000000"></a>
<a href="https://dms.antelopejs.com/docs/modules/media/extending"><img data-illustration alt="Documentation" src="https://img.shields.io/badge/Docs-18181B?style=for-the-badge&color=000000"></a>

The AntelopeJS interface to add media library fields, and the folders bound to them, to DMS pages, and to ship library folders and files as code.

</div>

## What it does

- Adds an `AssetType` form field that references library assets by id (one id, or an array with `multiple`) and opens the library as a picker.
- Binds a field to a folder provisioned under the `Content` root of each tenant: `RegisterAssetBinding` and `UnregisterAssetBinding`, or `new AssetType({ binding })`.
- Derives the folder's rights from a page (`permissionsFromPage`), a `permissionMapping` or an explicit `acl`.
- Replays bindings to every new generation of the implementation, so either side can hot reload.
- Ships folders and files from backend code with `EnsureMediaFolder` and `ImportMediaAsset`, called once per tenant from `Hook.TENANT_BEING_PROVISIONED`. Each declaration writes once per key and tenant, and the content belongs to the members from then on.
- Keeps your module independent of the implementation, [`@antelopejs/dms-media`](https://www.npmjs.com/package/@antelopejs/dms-media).

## Install

Add the interface to the `dependencies` of the module that declares asset fields:

```bash
pnpm add @antelopejs/interface-dms-media
```

## Quick start

```ts fragment
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

Ship a folder and a file with each new tenant, from the hook the DMS fires once when the tenant is created:

```ts
import { EnsureMediaFolder, ImportMediaAsset } from "@antelopejs/interface-dms-media";
import { Hook, RegisterHook } from "@antelopejs/interface-dms/hooks";

RegisterHook(Hook.TENANT_BEING_PROVISIONED, async ({ tenantId }) => {
  await EnsureMediaFolder({ tenantId, key: "helio.procedures", name: "Procedures" });
  await ImportMediaAsset({
    tenantId,
    key: "helio.procedures.roof",
    folder: { key: "helio.procedures" },
    name: "Roof safety checklist.pdf",
    mimetype: "application/pdf",
    source: { filePath: "/srv/content/roof-safety-checklist.pdf" },
  });
});
```

Both declarations require `tenantId` in TypeScript, and reject a missing, empty or whitespace-only value at runtime before any write. They do not check that the caller may act on that tenant. Call them from a `Hook.TENANT_BEING_PROVISIONED` handler, as [When to call](./docs/1.index.md#when-to-call) explains.

The interface also exports the option, declaration and ACL types: `AssetTypeOptions`, `AssetPickerComponentOptions`, `AssetBindingConfig`, `AssetBindingField`, `AssetPermissionMapping`, `MediaFolderDeclaration`, `MediaFolderVisibility`, `MediaAssetDeclaration`, `MediaFolderTarget`, `DeclaredFolderTarget`, `BoundFolderTarget`, `MediaAssetSource`, `MediaBytesSource`, `MediaFileSource`, `MediaLazySource`, `MediaDeclarationResult`, `MediaDeclarationStatus`, `AclEntry`, `AclSubject`, `AclSubjectKind` and `AclRight`. It exports the constants `ASSET_DATA_TYPE_ID` and `ASSET_PICKER_COMPONENT` too, and an `internal` namespace that only the implementation uses.

## Compatibility

The interface needs a `@antelopejs/dms-media` release that implements this version of it. The compatibility block of the [module README](../dms-media/README.md#compatibility) lists the interface range that each module release supports. The interface declares these peer dependencies:

<!-- antelopejs-docs-compat:start -->

| Package                      | Supported         | Tested with                                                |
| ---------------------------- | ----------------- | ---------------------------------------------------------- |
| `@antelopejs/interface-api`  | `>=0.0.15 <1.0.0` | `file:.campaign/tgz/antelopejs-interface-api-f2a99b5.tgz`  |
| `@antelopejs/interface-core` | `>=0.2.4 <1.0.0`  | `file:.campaign/tgz/antelopejs-interface-core-f7df541.tgz` |
| `@antelopejs/interface-dms`  | `>=0.9.0 <1.0.0`  | `file:.campaign/tgz/antelopejs-interface-dms-e0787e6.tgz`  |

<!-- antelopejs-docs-compat:end -->

## Documentation

- [Consumer reference](./docs/1.index.md): field types, bindings, lifecycle, declared content and permission precedence
- [Extending the media module](https://dms.antelopejs.com/docs/modules/media/extending): asset fields, folder bindings, the HTTP API and delivery URLs
- [The asset field](https://dms.antelopejs.com/docs/modules/media/usage/library#asset-field)
- [Media module guide](https://dms.antelopejs.com/docs/modules/media)

## Contributing

This package lives in the [`AntelopeJS/dms-media`](https://github.com/AntelopeJS/dms-media) pnpm workspace, next to the module that implements it. Read [CONTRIBUTING.md](https://github.com/AntelopeJS/dms-media/blob/main/CONTRIBUTING.md) and the [repository README](https://github.com/AntelopeJS/dms-media#contributing) for the development commands. After a build, `pnpm check:exports` checks that the exports map matches `dist`. Release this package before the module that implements it.

## License

[Apache-2.0](./LICENSE)
