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
- `the-crop-frame-follows-the-arrow-keys`: Shift with an arrow key resizes the crop frame and an arrow key moves it, and Save as copy applies that crop.
- `a-typed-crop-is-a-pending-change`: a crop typed in the W field is a pending change that Save as copy applies.
- `the-crop-frame-follows-the-pointer`: dragging the crop frame with the mouse moves it, dragging its right handle resizes it, and Save as copy applies the dragged frame.
- `each-ratio-sets-the-frame-proportions`: each aspect ratio gives the crop frame its proportions: the original ratio, 1:1, 4:5, 4:3, 16:9, 9:16 and 1.91:1.

## How to get to it (user POV)

- A file's page › Edit image (`E`), or `/modules/media/editor?asset=<id>`.

## Driving it with dms-control

```bash
dms-control journey "$RUN" editor
```

## Gotchas

- The editor hydrates after `load`; `rotateOnce` clicks Rotate right until the rotation is pending.
- The arrow keys cannot move a frame that spans the whole image: shrink it with Shift+arrow first, then move it.
- `the-crop-frame-follows-the-pointer` drags the cropper's `.vue-rectangle-stencil` and its `.vue-handler-wrapper--east` handle with the mouse, after a typed W leaves room to move.
