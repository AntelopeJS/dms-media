<div align="center">

# @antelopejs/interface-dms-media

<a href="https://www.npmjs.com/package/@antelopejs/interface-dms-media"><img alt="npm" src="https://img.shields.io/npm/v/@antelopejs/interface-dms-media?style=for-the-badge&labelColor=000000&color=000000"></a>
<a href="./LICENSE"><img alt="License" src="https://img.shields.io/npm/l/@antelopejs/interface-dms-media?style=for-the-badge&labelColor=000000&color=000000"></a>
<a href="https://discord.gg/sjK28QHrA7"><img alt="Discord" src="https://img.shields.io/badge/Discord-18181B?logo=discord&style=for-the-badge&color=000000"></a>
<a href="https://dms.antelopejs.com/docs/modules/media/extending"><img alt="Documentation" src="https://img.shields.io/badge/Docs-18181B?style=for-the-badge&color=000000"></a>

The AntelopeJS interface to add media library fields, and the folders bound to them, to DMS pages.

</div>

## What it does

- Adds an `AssetType` form field that references library assets by id (one id, or an array with `multiple`) and opens the library as a picker.
- Binds a field to a folder provisioned under the `Content` root of each tenant: `RegisterAssetBinding` and `UnregisterAssetBinding`, or `new AssetType({ binding })`.
- Derives the folder's rights from a page (`permissionsFromPage`), a `permissionMapping` or an explicit `acl`.
- Replays bindings to every new generation of the implementation, so either side can hot reload.
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

The interface also exports the option and ACL types: `AssetTypeOptions`, `AssetPickerComponentOptions`, `AssetBindingConfig`, `AssetPermissionMapping`, `AclEntry`, `AclSubject`, `AclSubjectKind` and `AclRight`.

## Compatibility

The implementation is `@antelopejs/dms-media >=0.4.0`. The interface declares these peer dependencies:

<!-- docs-compat: ./package.json#peerDependencies -->

| Package | Range |
| --- | --- |
| `@antelopejs/interface-api` | `>=0.0.15 <1.0.0` |
| `@antelopejs/interface-core` | `>=0.2.4 <1.0.0` |
| `@antelopejs/interface-dms` | `>=0.7.2 <1.0.0` |

## Documentation

- [Consumer reference](./docs/1.index.md): field types, bindings, lifecycle and permission precedence
- [Extending the media module](https://dms.antelopejs.com/docs/modules/media/extending): asset fields, folder bindings, the HTTP API and delivery URLs
- [The asset field](https://dms.antelopejs.com/docs/modules/media/usage/asset-field)
- [Media module guide](https://dms.antelopejs.com/docs/modules/media)

## Contributing

This package lives in the [`AntelopeJS/dms-media`](https://github.com/AntelopeJS/dms-media) pnpm workspace, next to the module that implements it. Read [CONTRIBUTING.md](https://github.com/AntelopeJS/dms-media/blob/main/CONTRIBUTING.md) and the [repository README](https://github.com/AntelopeJS/dms-media#contributing) for the development commands; `pnpm check:exports` checks, after a build, that the exports map matches `dist`. Release this package before the module that implements it.

## License

[Apache-2.0](./LICENSE)
