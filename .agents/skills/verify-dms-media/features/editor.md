---
covers:
  - packages/dms-media/src/transform.ts
  - packages/dms-media/src/transform-ops.ts
  - packages/dms-media/src/routes/media/transform.ts
  - packages/dms-media/frontend-vue/app/components/ImageEditor.vue
  - packages/dms-media/frontend-vue/app/build/imageEditor/**
  - packages/dms-media/frontend-vue/app/utils/editorAspects.ts
docs:
  - packages/dms-media/docs/4.usage/5.image-editor.md
  - packages/dms-media/docs/4.usage/4.file.md
---

# Editor

The image editor crops and rotates JPEG, PNG, WebP and AVIF images on the server; Save overwrites, Save as copy adds a file, the original is kept for Revert to original.

## Sub-features

- `save-overwrites-everywhere-and-keeps-the-original`: a saved rotation is what the same link and every size serve next, the first save keeps the original upload and counts it in the storage, a later crop keeps that original, and Revert restores it byte for byte.
- `save-as-copy-leaves-the-source-untouched`: Save as copy writes the edit as a new file in the same folder and the source keeps its bytes.
- `only-raster-photos-are-edited`: JPEG, PNG, WebP and AVIF are edited; an SVG or a GIF is refused 422; a request with no operation, a rotation outside 90° steps or a crop past the image is refused 400 and nothing changes.
- `the-editor-crops-rotates-and-saves`: the editor offers free, original and the six preset ratios, the crop fields, left and right rotation and a preview per image size; nothing is written until Save; Save rotates the file, Revert to original restores it, Save as copy adds the edit beside it.
- `an-svg-is-edited-in-a-design-tool`: the editor of an SVG says it is a vector drawing to edit in a design tool and offers no save.

## How to get to it (user POV)

- A file's page › Edit image (`E`), or `/modules/media/editor?asset=<id>`.

## Driving it with dms-control

```bash
dms-control journey "$RUN" editor
```

## Gotchas

- The editor hydrates after `load`; `rotateOnce` clicks Rotate right until the rotation is pending.
- A typed or arrow-nudged crop is not asserted: it moves the frame but is not saved at the integration head (issue draft `dms-media-editor-typed-crop-not-saved`).
