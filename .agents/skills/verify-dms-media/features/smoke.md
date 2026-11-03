---
covers:
  - packages/dms-media/src/index.ts
  - packages/dms-media/src/constants.ts
  - packages/dms-media/src/types.ts
  - packages/dms-media/src/db/**
  - packages/dms-media/src/routes/index.ts
  - packages/dms-media/src/routes/media/index.ts
  - packages/dms-media/src/routes/media/controller.ts
  - packages/dms-media/src/routes/media/context.ts
  - packages/dms-media/src/routes/media/dto.ts
  - packages/dms-media/src/routes/media/constants.ts
  - packages/dms-media/frontend-vue/dms.frontend.ts
  - packages/dms-media/frontend-vue/dms.frontend.build.ts
  - packages/dms-media/frontend-vue/build/**
  - packages/dms-media/frontend-vue/app/composables/useMediaApi.ts
  - packages/dms-media/frontend-vue/app/composables/useMediaFormat.ts
  - packages/dms-media/frontend-vue/app/types/**
  - packages/dms-media/frontend-vue/app/config/**
  - packages/dms-media/frontend-vue/app/utils/httpStatus.ts
  - packages/dms-media/frontend-vue/tsconfig.json
docs:
  - packages/dms-media/docs/1.introduction.md
---

# Smoke

The fixed journey every verdict runs, whatever the diff touches: the introduction's "One image from upload to delivery".

## Sub-features

- `smoke`: an owner uploads an image into a new folder, sees it in the Library and its delivery link serves the same bytes.

## How to get to it (user POV)

- Modules › Media › Library, a folder, Upload; the file's link.

## Driving it with dms-control

```bash
dms-control journey "$RUN" smoke
```
