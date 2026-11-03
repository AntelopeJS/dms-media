---
covers:
  - packages/dms-media/src/routes/media/upload.ts
  - packages/dms-media/src/upload-checks.ts
  - packages/dms-media/src/upload-names.ts
  - packages/dms-media/src/upload-policy.ts
  - packages/dms-media/src/validation/upload.schema.ts
  - packages/dms-media/src/library/upload-history.ts
  - packages/dms-media/src/library/batches.ts
  - packages/dms-media/src/pages/uploads.ts
  - packages/dms-media/src/pages/upload-availability.ts
  - packages/dms-media/src/crons/purge-staging.ts
  - packages/dms-media/frontend-vue/app/components/UploadQueue.vue
  - packages/dms-media/frontend-vue/app/components/UploadStrip.vue
  - packages/dms-media/frontend-vue/app/components/uploads/**
  - packages/dms-media/frontend-vue/app/composables/useUploadQueue.ts
  - packages/dms-media/frontend-vue/app/composables/useUploadApi.ts
  - packages/dms-media/frontend-vue/app/composables/useUploadFailureText.ts
  - packages/dms-media/frontend-vue/app/composables/useUploadToasts.ts
  - packages/dms-media/frontend-vue/app/composables/uploadLimits.ts
  - packages/dms-media/frontend-vue/app/utils/storageFailure.ts
  - packages/dms-media/frontend-vue/app/utils/uploadTypes.ts
  - packages/dms-media/frontend-vue/app/utils/explorerUploads.ts
  - packages/dms-media/frontend-vue/app/utils/acceptedTypes.ts
docs:
  - packages/dms-media/docs/4.usage/3.uploads.md
  - packages/dms-media/docs/3.configuration.md
  - packages/dms-media/docs/2.installation.md
  - packages/dms-media/docs/6.faq.md
---

# Uploads

Uploads go from the browser straight to the storage: `presign` checks the type and the quota, the browser `PUT`s the bytes, `confirm` checks the file again and decodes a declared image. The Uploads page lists the batches, and the queue explains each refusal.

## Sub-features

- `three-steps-keep-every-byte`: presign answers a staged storage URL, the PUT lands there, confirm creates the file: every byte of a multi-chunk upload and its non-ASCII name are kept.
- `abort-deletes-the-staged-file`: abort deletes a staged upload, so confirming it afterwards fails and nothing is listed.
- `active-documents-are-refused-by-type-or-extension`: HTML, XHTML and PHP are refused 415 type_not_allowed at presign and at confirm, by every type and every extension the module lists, case aside, and a type outside allowedMimetypes too; a default type is accepted.
- `allowed-mimetypes-match-a-prefix-and-confirm-checks-again`: by default video, audio, PDF, Office, OpenDocument, RTF, plain text, Markdown and CSV are accepted and other types refused; allowedMimetypes with image/* accepts any image and refuses a PDF, and confirm refuses a file whose type the library stopped accepting after presign.
- `a-field-folder-refuses-other-types`: a folder bound to a PDF field refuses an image with 415 field_type listing what the field accepts, and so does a subfolder of an image field for a PDF.
- `the-storage-plan-refuses-what-goes-past-it`: with storageQuotaBytes set, presign and confirm refuse with 413 quota, remaining and quota, an upload that would go past it.
- `a-declared-image-must-decode`: confirm refuses with 422 invalid_image an image that does not decode and deletes the staged file; a file that decodes as another format is stored with the decoded type; a format sharp does not decode is not checked.
- `keep-both-names-add-a-number`: names answers a free name for each file whose name is taken in the folder, whatever its case: photo (2).jpg, then photo (3).jpg.
- `batches-are-recorded-and-listed`: a recorded batch is listed with its folder, its counts, its size and its result, and a batch with a failure stays in failed today.
- `a-refused-file-never-stops-its-batch`: two files chosen in the Library: the refused HTML file is explained in plain words, the image still lands, and the batch shows on the Uploads page, in Failed today, with Open the folder.
- `a-live-uploads-page-shows-a-new-batch`: the Uploads page is live: a batch finished in another tab shows up in Recent batches on its own.
- `a-paused-uploads-page-keeps-its-rows`: paused, Recent batches keeps its rows, a banner counts the new batches, and Show reads them once without leaving the pause.
- `a-taken-name-offers-keep-both-or-cancel`: uploading a file whose name the folder already has, ignoring case, offers Keep both, which stores photo (2).jpg, or Cancel, which leaves the file out.
- `a-storage-that-refuses-the-origin-is-named`: a dashboard opened on an origin the API's CORS settings do not list, with the storage on the API's origin: presign works, the browser's PUT is blocked, the queue names the origin to add, and nothing is stored.
- `an-unreachable-storage-is-named`: when the storage's address cannot be reached from the browser, the queue names that address and nothing is stored.
- `every-file-picker-takes-several-files`: the Library's Upload, the Overview's Choose files, the Uploads page's Upload files and a multiple asset field's upload each take several files in one pick, and every file lands.
- `the-queue-explains-each-refusal`: the upload queue explains a field type refusal with the types the field accepts, an image that does not decode, and a full storage plan, while the other files of the batch land.

## How to get to it (user POV)

- Library › Upload, a drop on the explorer, or Modules › Media › Uploads.

## Driving it with dms-control

```bash
dms-control journey "$RUN" uploads
```

## Gotchas

- `chooseFiles` (`parts/upload-page.mjs`) clicks the Upload button and answers the browser's file chooser with in-memory files.
- `a-storage-that-refuses-the-origin-is-named` opens the dashboard on `http://localhost:<port>`: the DMS adds its own `clientBaseUrl` (127.0.0.1) to the API's CORS origins, so only another origin is refused. It sets `VERIFY_MEDIA_STORAGE_ORIGIN=api` so the browser PUTs to the API's origin, not through the dashboard's proxy.
- `a-live-uploads-page-shows-a-new-batch` fails at the integration head: Recent batches does not follow Live (issue draft `dms-media-uploads-page-not-live`).
