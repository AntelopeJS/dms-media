---
covers:
  - packages/dms-media/src/declared/**
  - packages/dms-media/src/validation/declared.schema.ts
  - packages/interface-dms-media/src/content.ts
  - packages/dms-media/src/upload-policy.ts
  - packages/dms-media/src/upload-checks.ts
docs:
  - packages/interface-dms-media/docs/1.index.md
  - packages/dms-media/docs/5.extending.md
  - packages/dms-media/docs/3.configuration.md
  - packages/dms-media/docs/6.faq.md
---

# Declared

`EnsureMediaFolder` and `ImportMediaAsset` ship folders and files as code, once per tenant and key, under the dashboard's rules: the upload policy and checks are the uploads' own, so this feature covers them too.

## Sub-features

- `a-declaration-is-written-once`: a folder and a file are created once per key: a second declaration returns kept with the first id, writes nothing and never reads the source again; the file's bytes, dimensions and System activity are right.
- `every-source-kind-is-read`: a file comes from bytes in memory, a path on the backend's disk or a load function, each stored byte for byte, multi-chunk and outside ASCII.
- `the-tenant-must-be-named`: an omitted, empty or blank tenantId rejects before any write or source read, with no default; surrounding whitespace is trimmed.
- `parents-bindings-visibility-and-acl`: a folder goes at the root, under a declared parent named by its key as a string or { key }, or under a binding that allows subfolders; visibility defaults to private; a file goes into a binding's folder.
- `the-provisioning-hook-ships-content-for-a-new-tenant`: declarations made from Hook.TENANT_BEING_PROVISIONED, as the docs prescribe, are in a fresh tenant's library, recorded as System's.
- `the-limits-of-an-upload-apply`: a declared file over 500 MiB, over the storage plan, of a type the library or the bound field refuses, or an image that does not decode is refused with an error naming its kind and key; a decoded image is stored under the decoded type.
- `folder-declarations-follow-the-dashboards-rules`: a declared folder refuses / \ < > : " | ? * and control characters, more than 255 characters, a sibling's name whatever its case or Unicode form, an undeclared, deleted or own parent, an unregistered binding or one without subfolders, and an ACL entry without rights; the key is trimmed and 1 to 255 characters.
- `file-declarations-follow-the-dashboards-rules`: a declared file refuses / \ and control characters or more than 255 characters in its name, an empty file, alt text over 255 characters and an undeclared folder; a colon is fine in a file name.
- `storage-paths-include-the-tenant`: a declared file and an uploaded file are stored under media/<tenantId>/<folderId>/ in the file storage, so storage paths include the tenant ID.

## How to get to it (user POV)

- A module's `Hook.TENANT_BEING_PROVISIONED` handler.

## Driving it with dms-control

```bash
dms-control journey "$RUN" declared
```

## Gotchas

- The fixture calls both functions from `POST /verify-media/folder` and `/asset` and answers `{ ok, result | error, loads }`, where `loads` counts the calls of a `load` source.
- `the-limits-of-an-upload-apply` writes a sparse 500 MiB + 1 byte file under the run's `HOME` and empties it afterwards.
- `storage-paths-include-the-tenant` reads the stored `storageKey` in the run's database (`storedRow` in `clock.mjs`): no request returns it.
