---
covers:
  - packages/interface-dms-media/src/asset-type.ts
  - packages/interface-dms-media/src/acl.ts
  - packages/interface-dms-media/src/index.ts
  - packages/interface-dms-media/package.json
  - packages/dms-media/frontend-vue/app/components/field/**
  - packages/dms-media/frontend-vue/app/components/picker/**
  - packages/dms-media/frontend-vue/app/components/AssetPicker.vue
  - packages/dms-media/frontend-vue/app/composables/useAssetFieldEntries.ts
  - packages/dms-media/frontend-vue/app/composables/useAssetFieldUploads.ts
  - packages/dms-media/frontend-vue/app/composables/useFieldFolders.ts
  - packages/dms-media/frontend-vue/app/utils/assetDataType.ts
  - packages/dms-media/frontend-vue/app/utils/fieldTypes.ts
docs:
  - packages/interface-dms-media/docs/1.index.md
  - packages/dms-media/docs/4.usage/2.library.md
  - packages/dms-media/docs/5.extending.md
---

# Asset field

`AssetType` is the form field that stores asset ids: its validation checks the shape only, its picker is the library explorer limited to what the member can read, and its uploads land in its linked folder.

## Sub-features

- `the-value-is-asset-ids-checked-for-shape-only`: by default one nonempty id; multiple takes an array of nonempty ids, the empty one included; max caps it only in multiple mode; an unknown id passes.
- `the-field-declares-its-picker-and-binding`: the package registers the asset data type, the field's input is dms-media-asset-picker with its options and the binding id but never the ACL, and a binding given to the field registers a folder accepting its types.
- `the-picker-shows-what-the-field-accepts`: the picker says what the field accepts, shows a file of another type but refuses it, lets a PDF be chosen, and the form stores the asset id, never a URL.
- `uploads-from-the-field-land-in-its-folder`: the field's Upload button and a drop on the field send the file to the field's linked folder.
- `a-members-picker-shows-only-what-they-can-read`: a member opening a field's picker sees only the folders they can read, and a linked field's picker opens on its folder and lists its subfolders.
- `the-pickers-upload-targets-the-linked-folder`: a linked field's picker browsed into a subfolder still uploads into the linked folder itself.
- `a-refusal-speaks-the-members-language`: a member whose language is French sees a refused file explained in French.

## How to get to it (user POV)

- A DMS page with a Form holding an `AssetType` field (the playground's Verify fields page).

## Driving it with dms-control

```bash
dms-control journey "$RUN" asset-field
```

## Gotchas

- The field page's form saves through `/api/verify-media/fields/values`, which the journeys read back.
- The pages render on the server and hydrate after `load`; `openPicker` clicks again until the dialog opens.
- `the-pickers-upload-targets-the-linked-folder` fails on main: from a subfolder the picker uploads into the subfolder (issue draft `dms-media-picker-upload-into-subfolder`).
