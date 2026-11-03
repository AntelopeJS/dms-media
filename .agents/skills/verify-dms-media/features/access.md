---
covers:
  - packages/dms-media/src/acl/**
  - packages/dms-media/src/guards.ts
  - packages/dms-media/src/pages/module.ts
  - packages/dms-media/src/pages/index.ts
  - packages/dms-media/src/pages/manage.ts
  - packages/dms-media/src/pages/texts.ts
docs:
  - packages/interface-dms-media/docs/1.index.md
  - packages/dms-media/docs/5.extending.md
  - packages/dms-media/docs/6.faq.md
  - packages/dms-media/docs/4.usage/4.file.md
---

# Access

Who may do what: the Media pages and statistics are the owner's, a folder's rights come from its ACL, its parent's or `rootAcl`, each right includes the weaker ones, and only the owner changes visibility.

## Sub-features

- `every-media-route-needs-a-signed-in-member`: the /api/media routes answer 401 without a session.
- `media-pages-and-statistics-are-owner-only`: a member, even one whose role holds the Library page permission, gets 403 from the overview and activity routes, cannot open the Media pages, and that permission grants no folder right.
- `a-member-reaches-only-what-their-rights-open`: for a member, the folder of a binding they cannot see is null, the starter folders need manage at the root, a folder zips only with read, and bulk actions refuse the files they cannot reach.
- `rights-include-the-weaker-ones`: manage includes write and read, write includes read: read lists, write uploads and edits files, manage changes the folder structure.
- `a-folder-without-an-acl-takes-its-parents`: a subfolder without its own ACL takes its parent's rights, a root folder takes rootAcl, which grants members nothing by default and opens every folder whose ancestors set no ACL when it names them.
- `only-the-owner-changes-visibility`: a member who manages a folder cannot change a folder's or a file's visibility, nor move a file where its visibility would change, but moves it where it stays the same.
- `a-writer-of-a-linked-folder-changes-any-of-its-files`: a member who can write in a linked folder renames, describes, moves, edits and deletes a file the owner uploaded there.
- `a-role-subject-grants-its-holders`: an ACL entry whose subject kind is role grants its rights to the members holding that role, and nothing to a member with another role.
- `a-write-mapping-grants-write-only`: a binding's write mapping, and the page fallback, grant write and not manage: the member uploads and renames files, but creating or renaming a folder answers 403, even with subfolders allowed.

## How to get to it (user POV)

- Settings › Roles grants a project page; the member then uses the asset field's folder.

## Driving it with dms-control

```bash
dms-control journey "$RUN" access
```

## Gotchas

- Members come from the fixture's `POST /verify-media/member`: a role with the given permissions (`page:fields` stands for the field page and its form block) and an invitation, then `/api/auth/signup`.
- `a-role-subject-grants-its-holders` names the role the fixture created for the member in `VERIFY_MEDIA_ROOT_ACL=role:<roleId>:read`.
