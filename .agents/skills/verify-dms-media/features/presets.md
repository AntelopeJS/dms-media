---
covers:
  - packages/dms-media/src/presets.ts
  - packages/dms-media/src/derivatives.ts
  - packages/dms-media/src/image-limits.ts
  - packages/dms-media/src/library/presets-page.ts
  - packages/dms-media/src/library/snippets.ts
  - packages/dms-media/src/routes/media/manage.ts
  - packages/dms-media/src/crons/index.ts
  - packages/dms-media/src/crons/sweep-derivatives.ts
  - packages/dms-media/frontend-vue/app/components/PresetCards.vue
  - packages/dms-media/frontend-vue/app/composables/useMediaPreviews.ts
docs:
  - packages/dms-media/docs/4.usage/7.image-sizes.md
  - packages/dms-media/docs/3.configuration.md
  - packages/dms-media/docs/5.extending.md
---

# Presets

Named image sizes: sharp renders each the first time it is requested, the storage keeps the rendering, and `/media/<id>/<size>/<name>` serves it. Settings › Image sizes shows them.

## Sub-features

- `default-sizes-render-on-first-request`: thumb renders 300×300 WebP cropped square, preview fits 1600 wide in WebP and never upscales, and the Image sizes API counts the cached renderings.
- `configured-sizes-follow-their-fields`: a presets list replaces the defaults; width or height alone keeps the ratio, neither keeps the size, cover is the default fit, contain fills the box, inside fits it, no format keeps the source's, quality applies only with a format (without one the bytes are those of no quality), and an SVG renders as PNG.
- `sizes-refuse-what-they-cannot-render`: an unknown size and a size of a file that is not an image answer 404, an image sharp cannot read 422, and a size the storage cannot write 503.
- `a-changed-size-renders-again-from-the-same-link`: after thumb changes in the config, the same link serves the new rendering, under a new cache key, with no cache to clear.
- `the-sizes-api-gives-copyable-examples`: the sizes list has no example while the library holds no image, then an example on the public origin built on the public photo, and a preview path; the cache facts give the signed link lifetimes and the config block names every size.
- `image-sizes-page-shows-each-size`: Settings › Image sizes shows a card per size with its size, format, an example link on the public origin, a preview loaded through the dashboard even for a private image, the cached count, the Cache card and the configuration block.
- `cover-cropping-is-centred`: a cover size crops around the centre, with no focal point: the square thumb of a red, green and blue banded image is all green, edge to edge.

## How to get to it (user POV)

- Settings › Image sizes; `/media/<id>/<size>/<name>` in a template.

## Driving it with dms-control

```bash
dms-control journey "$RUN" presets
```

## Gotchas

- Renderings are read back with sharp from the module's own dependencies (`sharpOf`).
- `sizes-refuse-what-they-cannot-render` makes the asset's rendering folder read-only in the run's storage to get a 503, then makes it writable again.
- `cover-cropping-is-centred` uploads three vertical bands, red, green and blue, and reads three pixels of the `thumb` back with sharp: a centred square holds only green.
