---
covers:
  - packages/dms-media/src/routes/media/library.ts
  - packages/dms-media/src/library/listing.ts
  - packages/dms-media/src/library/search.ts
  - packages/dms-media/src/library/asset-filters.ts
  - packages/dms-media/src/library/favorites.ts
  - packages/dms-media/src/library/type-groups.ts
  - packages/dms-media/src/library/composed-text.ts
  - packages/dms-media/src/library/module-readout.ts
  - packages/dms-media/src/validation/library.schema.ts
  - packages/dms-media/src/pages/files.ts
  - packages/dms-media/frontend-vue/app/components/Explorer.vue
  - packages/dms-media/frontend-vue/app/components/explorer/**
  - packages/dms-media/frontend-vue/app/components/shared/**
  - packages/dms-media/frontend-vue/app/composables/library/**
  - packages/dms-media/frontend-vue/app/build/library/**
  - packages/dms-media/frontend-vue/app/composables/definePageShortcuts.ts
  - packages/dms-media/frontend-vue/app/composables/useMediaPrefs.ts
  - packages/dms-media/frontend-vue/app/utils/explorerShortcuts.ts
  - packages/dms-media/frontend-vue/app/utils/rovingFocus.ts
docs:
  - packages/dms-media/docs/4.usage/2.library.md
  - packages/dms-media/docs/5.extending.md
---

# Library

The Library page: views, the folder tree, search, facets, sort, grid, list and columns, the details panel, the selection actions and the keyboard shortcuts.

## Sub-features

- `search-matches-every-word-ignoring-accents-case-and-punctuation`: every word must appear in the file's name, alt text or folder path, in any order, at least one in the name or alt; accents, case and punctuation are ignored; folder names match too; an empty search finds nothing; a folder scope keeps to it and its subfolders.
- `smart-views-gather-files-across-folders`: Recent, Starred, Largest files, Public and Missing alt text gather the files of every folder, the tree counts them, and a view can stay inside one folder.
- `facets-sort-and-paging-narrow-a-listing`: a folder listing narrows by type, visibility, modification date and orientation, sorts by name (in natural order), date added, size or type in either direction, and pages with offset and a limit of at most 500; search and views take the same facets.
- `the-explorer-shows-views-locations-and-thumbnails`: the Library lists the views and the folder tree, switches grid, list and columns with a tile size slider, opens a view and a search, and shows images by their thumb size, an SVG by its uncropped preview and a PDF by its type.
- `a-selection-is-moved-published-zipped-and-deleted`: the selection toolbar moves the selected files, makes them public, downloads them as a zip and deletes them; New folder creates a subfolder; the details panel edits the alt text.
- `the-details-drawer-steps-through-the-files`: narrower than 1000px the details open in the DMS drawer, whose previous and next buttons and J and K keys step through the files shown.
- `shortcuts-select-and-view`: ← → move between files, Shift ↓ extends the selection, Ctrl Space ticks a file, Ctrl A selects all, Escape clears, 1 2 3 switch grid, list and columns, I toggles the details panel, Enter opens the details, Space previews, ? lists every shortcut, and none fires while typing in a field.
- `shortcuts-act-on-files-and-folders`: Ctrl ↑ opens the parent folder, U opens the file picker, Shift N a new folder, F2 renames, M moves, Delete deletes and E opens the image editor.
- `the-details-panel-follows-the-explorers-width`: when the explorer is at least 1000px wide the details panel sits beside the files (1000, 1200 and 1500 px); at 999 px it leaves the side of the files for the DMS drawer, which the-details-drawer-steps-through-the-files opens.
- `the-modified-filter-keeps-its-window`: the modification date filter keeps the files changed in the last 7 days, the last 30 days or since 1 January, and every file for any date.

## How to get to it (user POV)

- Modules › Media › Library (`/modules/media/files`).

## Driving it with dms-control

```bash
dms-control journey "$RUN" library
```

## Gotchas

- The explorer hydrates after `load`; `explorerWithFiles` clicks a file until it is selected before it presses keys.
- The run's browser is 1280 px wide, so the explorer is narrower than 1000 px and the details open in a drawer; the side-panel steps widen the viewport to 1900 px.
- `the-details-drawer-steps-through-the-files` fails at the integration head: J, K or closing the drawer ends on a 500 (issue draft `dms-media-details-drawer-crashes`).
- `the-details-panel-follows-the-explorers-width` measures the explorer's content box, inside its border, which is what its layout follows, and never opens the drawer, which crashes at head (#119).
- `the-modified-filter-keeps-its-window` ages files in the run's database with `clock.mjs`.
