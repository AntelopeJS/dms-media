---
covers:
  - packages/dms-media/src/routes/media/assets.ts
  - packages/dms-media/src/routes/media/asset-actions.ts
  - packages/dms-media/src/routes/media/file.ts
  - packages/dms-media/src/asset-lifecycle.ts
  - packages/dms-media/src/pages/file.ts
  - packages/dms-media/src/validation/media.schema.ts
  - packages/dms-media/src/library/links.ts
  - packages/dms-media/frontend-vue/app/components/file/**
  - packages/dms-media/frontend-vue/app/components/FileHeader.vue
  - packages/dms-media/frontend-vue/app/components/FilePreview.vue
  - packages/dms-media/frontend-vue/app/components/FileProperties.vue
  - packages/dms-media/frontend-vue/app/composables/useFileDetails.ts
  - packages/dms-media/frontend-vue/app/composables/useCurrentFile.ts
  - packages/dms-media/frontend-vue/app/composables/useAssetLink.ts
  - packages/dms-media/frontend-vue/app/composables/useAssetContent.ts
  - packages/dms-media/frontend-vue/app/utils/mediaFiles.ts
docs:
  - packages/dms-media/docs/4.usage/4.file.md
  - packages/dms-media/docs/5.extending.md
  - packages/dms-media/docs/4.usage/2.library.md
---

# Files

One file: its page with Copy link, Download and its tabs, and the routes that rename, describe, move, delete and read it, one at a time or in bulk.

## Sub-features

- `rename-describe-move-and-delete-a-file`: a file's name and alt text read back after an update; a name taken in its folder ignoring case and Unicode form is refused 409; a move changes its folder; a delete removes it.
- `read-urls-previews-and-search`: a read URL lives five minutes and serves the file or one of its sizes; previews give thumbnails of images only; the asset list and the asset search answer the readable files by name and type.
- `bulk-actions-answer-done-and-refused`: bulk move, visibility and delete take up to 500 ids, act on each they can and answer the ids done and the ids refused with a reason.
- `the-file-api-reads-its-tabs`: details, information, history, delivery links on the public origin with each image size, the delivery notice and the tab counts read back a file.
- `stored-files-stay-readable`: a file and its folder written before a restart of the backend read back unchanged after it: listing, details, delivery bytes and a size.
- `the-file-page-header-steps-through-the-folder`: the file page names the file and its place in the folder, its arrows and the ← → keys open the previous and next file, Copy link copies the stable link, Download saves the bytes, and Edit image shows for an image only.
- `the-file-tabs-edit-and-show-the-file`: Details edits the name and alt text and offers Move… and three visibility choices, Delivery lists the stable links, History the events from the upload on, and Usage says usage is not tracked.
- `a-file-page-without-an-asset-opens-the-library`: the file page without ?asset= sends to the Library.
- `a-signed-out-browser-reaches-the-file-through-sign-in`: a signed-out browser following a private link goes to the file's page, signs in there and comes back to the file.
- `the-history-lists-every-event`: a file's History lists every event of the file, from its upload on: 55 renames and the upload give 56 entries, the upload last.
- `a-move-keeps-the-targets-rules`: a file moved into a linked folder must be of a type its field accepts, and a file moved into a folder must not take a name already there, whatever its case: both moves are refused and the file stays.

## How to get to it (user POV)

- Library › a file › its page (`/modules/media/file?asset=<id>`).

## Driving it with dms-control

```bash
dms-control journey "$RUN" files
```

## Gotchas

- Copy link is read back from the browser's clipboard (`clipboard-read` is granted to the tab); Download from the browser's download.
- `stored-files-stay-readable` restarts the backend between the writes and the reads.
