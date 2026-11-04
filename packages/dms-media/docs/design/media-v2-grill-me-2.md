---
title: "v2 redesign decisions, part 2"
description: The revision of the v2 redesign of the DMS media module, from the move under Modules to how vectors and PDFs look in the library.
mode: explanation
---

This page continues [the first part](./media-v2-grill-me.md) of the design review held before the v2 redesign of `@antelopejs/dms-media`. It records the decisions as they were taken, and the module docs describe the current behaviour. Sections 1 to 9, the questions Q1.1 to Q9.2 that this revision cites, are on the first page.

## 10. Revision of 2026-10-12

**Q10.1 Does Media still register a root category?**
No. Q2.1 is reversed by decision of the user: Media is a module like every
other DMS module. `src/pages/module.ts` calls `RegisterModule` (id `media`,
landing page `overview`, catalog category `$dms_media.catalog_category`) and
declares two label categories with `urlSlug: "/"` and `module: "media"`:
`library` and `manage`. Media is filed under Modules, its URLs read
`/modules/media/<page>` and its page permission ids
`modules.media.library.files`, `modules.media.manage.presets`, … `MEDIA_ROUTES`
(backend and frontend), the default root ACL and the dependencies of the static
permissions follow the new ids.

**Q10.2 What does it change for roles?**
What Q2.1 avoided, and this time on purpose. The DMS marks every permission
of a module page or category module-scoped (`MarkModuleScopedPermission`): it is never registered in the
Roles tree, `HasPermission` refuses it to any non-owner, the page routes only
open to the `*` wildcard, and module access is computed as "is owner". So a
member cannot be given the Media pages in Settings › Roles any more: the pages
are owner-only. The library itself stays reachable through the API (the picker
of an `AssetType` field on a project page) with `media.upload`,
`media.folders.manage`, a binding's permission mapping, or a permission or role
a project adds to `rootAcl`. The `read` entry the default root ACL gives the
All files page permission only matches owners now. The module does not work
around this behaviour: it is the intended access model (Q10.5).

**Q10.3 What happens to Access & visibility and Linked folders?**
Both pages are set aside, with every link to them (explorer inspector, folder
menu, empty shell state, locked folder dialog, overview "needs attention").
The ACL engine, the default rules and the bindings that provision linked
folders stay: a restricted folder stays restricted, and the explorer still
marks folders with their own rules. Everything only those pages used is gone
(2026-10-13): their routes (`/folders/:id/acl|access|access/stats`,
`/access/subjects`, `/linked`, `/linked/:bindingId` with its declaration
snippet), their custom blocks, their API calls and types in the layer, and
their texts. A folder's own visibility is set from the explorer. File visibility stays in the inspector, the File page and the
bulk bar, with the confirmation before making files public.

**Q10.4 Where does the picker demo live?**
In the playground. The Developers › Asset field & picker page left the module
with its declaration snippet and notes;
the playground's Media demo page (`/media-demo`) holds every flavour of the
field: a single cover image with a linked folder, a gallery with a maximum, a
PDF-only spec sheet, documents restricted to PDF, Word and text files in their
own linked folder, and a free attachment.

**Q10.5 How do members without the owner role use media, then?**
Through the component the module exports, not through its pages. The module
pages are the owner's administration of the library (folders, uploads, file
details, image editing, presets). Every other member works from the
**project's** pages, which Settings › Roles does grant: an `AssetType` field on
such a page opens the floating picker and uploader on a folder defined in
advance. The field's `binding` provisions a linked folder under `Content`, and
`permissionsFromPage: ThatProjectPage` writes the page's permission id into the
folder ACL with `read` and `write`. A member whose role grants the page
therefore sees that folder in the picker (its `Content` parent shows as a
traverse-only shell), picks from it and uploads into it; the picker opens on it
and its upload button targets it. The page permission has to be an explicit
grant of the role: a page open to every member by default (`memberAccess`,
`publicAccess`) gives no folder right, since folder ACL subjects only match the
permissions a member holds. `src/test/integration/media-project-field.test.ts`
walks that path for a member holding only a project page: the linked folder is
readable and writable, everything else is hidden or a shell, uploads land in
it, and the module pages stay closed to them.

**Q10.6 What happens to the three static permissions? (2026-10-13)**
They become owner-only. `media.upload`, `media.folders.manage` and
`media.permissions.manage` only made sense on the Media pages, which are
owner-only: Settings › Roles offered them to members for nothing, ticking one
silently added `modules.media.library.files` as a hidden dependency that
unticking left behind, and since the DMS skips a dependency that is not
registered, `media.upload` alone gave `write` on the whole library through the
default root ACL. The module no longer declares them at all: owner-only
actions check the owner wildcard (`*`), and projects start from a fresh
database, so nothing is migrated. The default `rootAcl` is now empty (owners
hold every right through the wildcard), linked folders no longer carry
`manage` entries, and changing the visibility of files and folders is
owner-only.
Members keep every right Q10.15 lists in the linked folders of their pages.
`src/test/integration/media-member-access.test.ts` covers it.

**Q10.7 What are the pages called now? (2026-10-13)**
Only the labels change: All files becomes Library (Bibliothèque), the Manage
category becomes Settings (Réglages) and Delivery presets becomes Image sizes
(Tailles d'image). Page and category ids stay (`library`, `manage`), so the
URLs and the permission ids (`modules.media.library.files`,
`modules.media.manage.presets`) do not move. The overview gets lighter: the
folder cards, the storage per folder and the header Upload button, which
repeated the upload strip, are gone, with `GET /api/media/stats/folders` and
`GET /api/media/stats/largest`; the `largest` smart view lists the biggest
files. Uploads stays a page of its own, and its history becomes useful: a
retried batch shows once, with the names of the failed files and their
reasons. A hidden Activity page (`/modules/media/activity`), reached from the
overview feed, lists every event with a filter by kind of action
(`GET /api/media/activity?type=`).

**Q10.8 What does Save do in the image editor? (2026-10-13)**
It still overwrites the image, so every page using it shows the edit, and the
editor now says so next to the button. Save as copy
(`POST /api/media/assets/:id/transform/copy`) renders the same edit into a new
file in the same folder, under a free name, and leaves the source untouched.
Successive edits are rendered from the preserved original (`json_transform`
holds the cumulative crop and rotation), so a second crop does not degrade the
first, and Revert goes back to the original. Crops per format come later.

**Q10.9 Does the `AssetType` field still offer Crop? (2026-10-13)**
No. The button opened an owner-only page and changed an image every record
using it shares. It comes back with a crop per usage.

**Q10.10 What does Copy link do on a private file? (2026-10-13)**
It copies the link anyway, warns that it only opens for signed-in teammates
with access to the folder, and offers "Make public…" behind the usual
confirmation. Temporary links stay a proposal.

**Q10.11 Which files can be uploaded? (2026-10-13)**
The ones the `allowedMimetypes` config lists: by default images, video, audio,
PDF, office and OpenDocument files, RTF, plain text, Markdown and CSV. HTML,
XHTML and PHP are refused whatever the list says. `presign` answers 415
(`type_not_allowed`, or `field_type` when the linked folder feeds a field that
accepts fewer types) or 413 (`quota`, now enforced against
`storageQuotaBytes`); `confirm` decodes every declared image, answers 422
(`invalid_image`) for one that does not decode and stores the mimetype sharp
read. Active content already in a library is served by the API under
`Content-Security-Policy: sandbox`: SVG inline, HTML, XHTML and XML as
downloads.

**Q10.12 Can a folder hold two files with the same name? (2026-10-13)**
Not by renaming: a rename onto a name the folder already holds answers 409
`name_taken`, case and Unicode form aside, and folders follow the same rule.
On upload, a collision opens a dialog: Keep both adds the next free number
(`photo (2).jpg`, from `POST /api/media/upload/names`), Cancel skips those
files.

**Q10.13 Which size units? (2026-10-13)**
The dashboard's: base 1000, `kB` / `MB` in English and `Ko` / `Mo` in French,
in the upload queue, the upload history, the overview and the file details
alike.

**Q10.14 Does delivery still redirect? (2026-10-13)**
Yes. Serving the bytes through Node (with ETag/304) was tried and reversed:
`/media/...` keeps its 302 to the storage's signed URL, so file bandwidth never
goes through the API. The redirect is no longer cached (`no-cache` for public
files, `no-store` for private ones), so an edit or a switch to private shows
on the next request, and its signed target is reused for half its lifetime,
so the bytes stay cacheable under one address. Only active content is
streamed by the API (Q10.11). A browser that opens a private link without a
token lands on the file's page in the dashboard, which signs in and comes
back.

**Q10.15 What may a member do in a linked folder? (2026-10-13)**
What they could do before: a member whose role grants the page uploads,
describes, renames, moves, deletes and edits every file of the linked folder,
whoever added it. Limiting them to their own files was considered and
declined. Visibility stays with the owner (Q10.6).

**Q10.16 What is left out of this pull request? (2026-10-13)**
Replacing a file, a trash for deleted files and the server-side validation of
`AssetType` values: three follow-up pull requests, in that order. The 1 MiB
upload limit and the Windows bug of `@antelopejs/file-storage-local` are
fixed in that module, not worked around here.

**Q10.17 Can a linked folder hold subfolders? (2026-10-17)**
When its binding says so: `subfolders: true` on `AssetBindingConfig`, false by
default. The refusal (403 `bound_parent`) protected the binding's ownership of
the folder, and nothing in the module depends on a linked folder being a leaf:
a subfolder without its own ACL inherits the linked folder's (so the members
of the page reach it), the field's picker is the explorer scoped to the
linked folder and its subtree, and moves, zips and deletes already walk
subtrees. What a subfolder could escape is the field's types, so a folder
inside a linked folder accepts only the types of the nearest linked
ancestor's field. The linked folder itself stays locked. Declared content
places folders there with `EnsureMediaFolder({ parent: { binding } })`, which
a project needs for a layout per record (photos by project) that is also the
folder of a field. The field's upload button keeps targeting the linked
folder; picking from its subfolders works, editing their alt text from the
field does not yet.

**Q10.18 How do vectors and PDFs look in the library? (2026-10-17)**
A wide SVG logo (880 × 240) lost its ends in the grid and in recent uploads:
library thumbnails are the `thumb` preset, a 300 × 300 `cover` crop, and the
tile itself used `object-cover`. SVG files now take the `preview` preset when
it is configured and does not crop (by default 1600 wide, `inside`), and
the tile fits vectors inside (`object-contain`). A variant of `thumb` made for
the occasion was set aside: its cache key would not belong to a configured
preset, so the nightly sweep would delete it and every library visit would
render it again. Raster images keep the square crop, which suits photos.
PDFs keep their type icon. A first-page thumbnail needs a PDF renderer, and
the prebuilt sharp/libvips the module ships has none
(`sharp.format.pdf.input` is false with sharp 0.34.5 and libvips 8.17.3);
pdf.js would add a canvas implementation, and poppler or PDFium native
binaries per platform, for a preview the icon and the file viewer already
cover.
