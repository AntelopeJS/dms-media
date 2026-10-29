<div align="center">

# @antelopejs/dms-media

<a href="https://www.npmjs.com/package/@antelopejs/dms-media"><img alt="npm" src="https://img.shields.io/npm/v/@antelopejs/dms-media?style=for-the-badge&labelColor=000000&color=000000"></a>
<a href="./LICENSE"><img alt="License" src="https://img.shields.io/npm/l/@antelopejs/dms-media?style=for-the-badge&labelColor=000000&color=000000"></a>
<a href="https://discord.gg/sjK28QHrA7"><img alt="Discord" src="https://img.shields.io/badge/Discord-18181B?logo=discord&style=for-the-badge&color=000000"></a>
<a href="https://dms.antelopejs.com/docs/modules/media"><img alt="Documentation" src="https://img.shields.io/badge/Docs-18181B?style=for-the-badge&color=000000"></a>

A media library for the AntelopeJS DMS: uploads, folders, image sizes and light editing.

</div>

![The Media library explorer: views and folders on the left, the files of a folder in the middle, the selected file's details on the right](https://raw.githubusercontent.com/AntelopeJS/dms-media/main/packages/dms-media/docs/images/library.png)

## What it does

- Organises images, videos and documents in a Finder-style explorer, with smart views, search, drag and drop and bulk actions.
- Uploads files straight to the project's file storage and delivers them from stable `/media/<id>/<name>` URLs.
- Renders named image sizes on first request, with crop and rotation that can revert to the original.
- Applies per-folder rights built on the DMS permissions and roles.
- Adds an `AssetType` form field, from [`@antelopejs/interface-dms-media`](https://github.com/AntelopeJS/dms-media/tree/main/packages/interface-dms-media), that opens the library as a picker on your pages.
- Lets a project ship folders and files as code with `EnsureMediaFolder` and `ImportMediaAsset`, created once and never overwriting what members changed.

## Install

Run the AntelopeJS CLI from the root of a project that already loads `@antelopejs/dms` and a file storage module:

```bash
ajs project modules add @antelopejs/dms-media
```

## Quick start

Point the module's links at the API's public URL, and allow the dashboard's origin, since the browser uploads straight to the storage:

```ts
// antelope.config.ts
"dms-media": {
  source: { type: "package", package: "@antelopejs/dms-media", version: "^0.5.0" },
  config: {
    publicBaseUrl: "${@api.API_PUBLIC_BASE_URL}",
  },
},
api: {
  config: {
    cors: { allowedOrigins: ["https://dms.example.com"] },
  },
},
```

Restart the backend, then the frontend, and open **Modules › Media** (`/modules/media/overview`). To let members pick files from your own pages, add an asset field:

```ts
import { AssetType } from "@antelopejs/interface-dms-media";

new AssetType({
  mimetypes: ["image/*"],
  binding: { id: "articles.cover", folderName: "Article covers", permissionsFromPage: ArticlesPage },
});
```

## Compatibility

| Package | Version |
| --- | --- |
| `@antelopejs/dms` | `>=0.11.0 <1.0.0` |
| `@antelopejs/interface-dms` | `>=0.9.0 <1.0.0` |
| `@antelopejs/dms-frontend` (renderer) | `>=0.9.1 <0.10.0` |
| `@antelopejs/interface-dms-media` | `>=0.3.0 <0.4.0` |
| File storage | an `@antelopejs/interface-file-storage` implementation, such as `@antelopejs/file-storage-local` |

On DMS 0.8, use `@antelopejs/dms-media` 0.3.

## Documentation

- [Introduction](https://dms.antelopejs.com/docs/modules/media/introduction)
- [Installation](https://dms.antelopejs.com/docs/modules/media/installation)
- [Configuration](https://dms.antelopejs.com/docs/modules/media/configuration)
- [Usage](https://dms.antelopejs.com/docs/modules/media/usage/overview)
- [Extending](https://dms.antelopejs.com/docs/modules/media/extending)
- [FAQ](https://dms.antelopejs.com/docs/modules/media/faq)

The guide's sources live in [`packages/dms-media/docs`](https://github.com/AntelopeJS/dms-media/tree/main/packages/dms-media/docs). The module ships the `dms-media` Claude Code skill in [`packages/dms-media/skills`](https://github.com/AntelopeJS/dms-media/tree/main/packages/dms-media/skills), declared under `antelopeJs.skills`.

## Contributing

This package lives in the [`AntelopeJS/dms-media`](https://github.com/AntelopeJS/dms-media) pnpm workspace, next to `@antelopejs/interface-dms-media`. Read [CONTRIBUTING.md](https://github.com/AntelopeJS/dms-media/blob/main/CONTRIBUTING.md) and the [repository README](https://github.com/AntelopeJS/dms-media#contributing) for the development commands.

## License

[Apache-2.0](./LICENSE)
