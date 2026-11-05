---
covers:
  - packages/dms-media/src/config.ts
docs:
  - packages/dms-media/docs/3.configuration.md
  - packages/dms-media/docs/4.usage/4.file.md
  - packages/dms-media/docs/4.usage/7.image-sizes.md
---

# Config

The options that decide the origin of copied links: `publicBaseUrl`, else the DMS `apiBaseUrl`, never a request header.

## Sub-features

- `links-start-with-the-public-url`: copied links, the Delivery tab and the sizes' example start with publicBaseUrl, else the DMS apiBaseUrl, never with a request header.

## How to get to it (user POV)

- `antelope.config.ts`, module `config`.

## Driving it with dms-control

```bash
dms-control journey "$RUN" config
```

## Gotchas

- The other options are driven where they act: `allowedMimetypes` and `storageQuotaBytes` in uploads, `presets` in presets, `rootAcl` in access.
