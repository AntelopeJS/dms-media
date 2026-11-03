---
covers:
  - packages/dms-media/src/routes/media/delivery.ts
  - packages/dms-media/src/routes/media/delivery-headers.ts
  - packages/dms-media/src/routes/media/delivery-stream.ts
  - packages/dms-media/src/read-urls.ts
  - packages/dms-media/src/routes/media/storage-keys.ts
docs:
  - packages/dms-media/docs/5.extending.md
  - packages/dms-media/docs/1.introduction.md
  - packages/dms-media/docs/6.faq.md
  - packages/dms-media/docs/4.usage/4.file.md
---

# Delivery

A file's link, `/media/<id>/<name>`, names the asset. The module answers it with a `302` to a short-lived signed URL of the storage, or streams SVG and XML itself, and decides who may follow it from the file's visibility and its folder's rights.

## Sub-features

- `public-file-redirects-to-the-same-bytes`: a public file's link redirects anyone to a signed URL with no-cache and an open CORS answer, and the storage serves every byte.
- `private-file-needs-a-reader`: a private file's link answers a script 401, sends a browser to the file page, redirects a reader with no-store and refuses a member without read.
- `a-reader-of-the-folder-opens-a-private-file`: a member whose role holds the permission a folder's ACL grants read opens its private file, and loses it when the ACL is another permission.
- `a-stale-name-redirects-to-the-canonical-link`: a link with an old or wrong file name redirects to the current one; a rename keeps the id, and a missing name or an unknown asset is 404.
- `signed-urls-live-an-hour-or-five-minutes`: a public file's signed URL lives one hour and a private one five minutes, and the module hands out the same URL again within half that.
- `visibility-is-the-file-then-the-folder-then-private`: a file takes its own visibility, else its folder's, else private; a change shows on the next request and never changes the link.
- `the-dashboard-origin-serves-media-links`: a /media link on the dashboard's origin reaches the backend with the member's session, so a private file opens there.
- `svg-is-served-inline-by-the-api`: an SVG is not redirected: the API streams its bytes inline under a sandbox policy, nosniff, an ETag that answers 304, no byte ranges, and a cache policy that follows its visibility.
- `xml-is-served-as-an-attachment`: an XML file, once the library accepts the type, is streamed by the API as an attachment under the same headers.
- `an-unreadable-stored-file-answers-502`: an SVG whose stored bytes the storage cannot read answers 502.

## How to get to it (user POV)

- The Delivery tab or Copy link of a file; any page or script that embeds `/media/<id>/<name>`.

## Driving it with dms-control

```bash
dms-control journey "$RUN" delivery
```

## Gotchas

- The journeys read with plain `fetch`, redirects not followed, and keep the headers and a SHA-256 of the body in `response.json`.
- The signed URL's lifetime is read from the local storage's token record (`.antelope/file-storage/tokens/read/<token>.json` of the run's playground).
- `xml-is-served-as-an-attachment` restarts the backend with `VERIFY_MEDIA_MIMETYPES` and restarts it again without it.
- `an-unreadable-stored-file-answers-502` deletes the SVG's stored file in the run's storage.
