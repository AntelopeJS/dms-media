---
covers:
  - packages/dms-media/src/bindings.ts
  - packages/dms-media/src/library/binding-labels.ts
  - packages/dms-media/src/implementations/**
  - packages/interface-dms-media/src/bindings.ts
  - packages/interface-dms-media/src/internal.ts
docs:
  - packages/interface-dms-media/docs/1.index.md
  - packages/dms-media/docs/5.extending.md
  - packages/dms-media/docs/6.faq.md
---

# Bindings

A folder binding is the folder an asset field uploads into: provisioned per tenant under a private `Content` root, locked, and given an ACL from `acl`, `permissionMapping` and `permissionsFromPage` in that order.

## Sub-features

- `bound-folders-live-under-a-private-content-root`: each registered binding has a folder under a private Content root, named folderName or the binding id, accepting its field's types.
- `a-second-registration-replaces-the-first`: registering the same binding id again replaces it: the folder keeps its name and takes the new ACL; unregistering leaves the folder and its files in place.
- `a-linked-folder-is-locked`: a linked folder cannot be renamed, moved or deleted, holds no subfolder unless its binding allows them, and a subfolder of an allowing binding can be created and renamed.
- `acl-precedence-follows-the-documented-order`: an explicit acl, [] included, replaces every derived entry; a permissionMapping right takes precedence over the page one right at a time and [] turns that right off; a right with no mapping falls back to the page's permission.
- `a-field-folder-takes-its-page-rights`: a member whose role grants the field's page explicitly sees and uploads into the field's folder and its subfolders; a page held through memberAccess grants no folder right.

## How to get to it (user POV)

- `RegisterAssetBinding` or an `AssetType` with `binding`; the Content folder of the Library.

## Driving it with dms-control

```bash
dms-control journey "$RUN" bindings
```

## Gotchas

- The playground's fixture registers bindings at run time (`POST /verify-media/binding`); a backend restart forgets them, and every journey starts on a restarted backend.
- Rights are probed through the API: listing a folder is `read`, presigning into it is `write`.
