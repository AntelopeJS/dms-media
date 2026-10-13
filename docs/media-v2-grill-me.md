# dms-media v2 redesign: grill session

Self-answered design review of the dms-media migration to `@antelopejs/dms` 0.6 /
`@antelopejs/interface-dms` 0.4 / `@antelopejs/dms-frontend` 0.5 and of the v2
design (`dms-design-mockup/modules/media`). Every question was asked against the
code, the mockup, its UX review (`modules/media/review.html`, findings M01 to
M19) and the DMS migration guide (`docs/02.building/13.migration-0-3-to-0-4.md`
in AntelopeJS/dms). Each answer is the recommendation that was taken; the pull
request implements exactly these answers.

## 1. Dependencies and platform

**Q1.1 Which versions does the module move to?**
`@antelopejs/interface-dms` `>=0.4.0 <1.0.0` (module and interface package),
`@antelopejs/dms` `>=0.6.0 <0.7.0` (dev, test harness, playground),
`@antelopejs/dms-frontend` 0.5.0 (dev) with the frontend `engines` range
`>=0.5.0 <0.6.0`, `@antelopejs/core` `>=1.13.5 <2`. The test harness, the
hot-reload test and the playground also move to `@antelopejs/mongodb` 1.4.2
(required by the DMS 0.6: it stores a `$`-prefixed string as a string),
`@antelopejs/api` 1.3.3 and `@antelopejs/file-storage-local` 0.1.6.

**Q1.2 Why `<1.0.0` and not `<0.5.0` on the interface?**
`antelopejs-check-interface-ranges` (run by `pnpm lint`) refuses an interface
range that stops before the next major, so every module of a project resolves
one copy. The DMS caps its own range; that is enough.

**Q1.3 What breaks in the frontend layer?**
- Components are prefixed (dms-frontend 0.5): the layer declares
  `componentPrefix: "DmsMedia"` and registers bare names (`Explorer`,
  `AssetPicker`, …). The backend keeps sending full names (`DmsMediaExplorer`);
  the `AssetType` widget name `dms-media-asset-picker` resolves unchanged.
- Nothing is auto-imported without a `dms.frontend.build.ts` (dms-frontend
  0.4): the layer adds one declaring `app/composables`, `app/utils` and
  `app/types`. 304 type errors of the old layer came from that and from the
  legacy Finder; both are gone (Q3.6).
- `build/` components of the DMS are private: the layer only uses public ones
  (`DmsCard`, `DmsEmptyState`, `DmsBanner`, `DmsStatusPill`, `DmsIconWell`,
  `DmsSectionHeader`, `DmsEyebrow`, `DmsCopyButton`, `DmsMeter`,
  `DmsSegmented`, `DmsKeyValueList`) and public composables (`useAuthFetch`,
  `useConfirm` with `color`, `useToast`, `useRegionalFormat`).

**Q1.4 What breaks in the backend?**
Nothing in the TypeScript surface (`tsc` passes on interface-dms 0.4). The
behaviour that matters: pages under a `RegisterModule` are platform-owner only,
which drives Q2.1. Write routes are custom (no data controller), so the partial
edit change only means `update` keeps accepting a partial body, which it
already does.

## 2. Information architecture and access

**Q2.1 The mockup files Media as a module. Do we use `RegisterModule`?**
No. Module pages are owner-only by design and their permission ids are never
grantable through Roles. Media is used by merchandisers, marketers and
editors, and its per-folder ACL is built on role and permission grants. The
module registers a **root category** instead (`RootCategory("media")`,
`urlSlug: "media"`): its own top-level group in the main sidebar, with the
mockup's nav groups, and every page permission grantable in Roles. This
answers M01 (Media is no longer filed under Settings).

*Reversed on 2026-10-12 (section 10): Media registers with `RegisterModule`
like every other DMS module.*

**Q2.2 Which pages ship?**

As of 2026-10-13 (section 10, labels from Q10.7):

| Nav group | Page | URL | Content |
| --- | --- | --- | --- |
| Library | Overview | `/modules/media/overview` | Upload strip, KPIs, storage by type, needs attention, recent files, activity, first run |
| Library | Library | `/modules/media/files` | The explorer (tree, grid/list/columns, inspector, bulk bar, search, menus, drag and drop, shortcuts) |
| Library | Uploads | `/modules/media/uploads` | Current upload queue and the recent batches |
| (hidden) | File | `/modules/media/file?asset=` | File details: viewer, filmstrip, details, delivery, history, usage |
| (hidden) | Edit image | `/modules/media/editor?asset=` | Staged crop and rotate with presets preview, Save and Save as copy |
| (hidden) | Activity | `/modules/media/activity` | Every library event, filtered by kind of action, reached from the overview feed |
| Settings | Image sizes | `/modules/media/presets` | Preset sizes, URLs, render counts, cache and configuration |
| *(set aside)* | Access & visibility | — | Was `/media/access`: folder rules editor. Backend kept, page to come back later |
| *(set aside)* | Linked folders | — | Was `/media/linked`. Bindings and their routes kept, page to come back later |
| *(moved out)* | Asset field & picker | — | Was `/media/field`. The picker demo lives in the playground (`/media-demo`) |

The mockup's Search screen is a mode of the explorer (`/modules/media/files?q=`), not
a page: the search box lives in the explorer toolbar and searching from any
folder must not navigate away. The "Design review" group is mockup-only.

**Q2.3 Nav groups and URLs?**
Three label categories (`library`, `manage`, `developers`) under the root, each
with `urlSlug: "/"`, so URLs stay `/media/<page>` and permission ids read
`media.library.files`, `media.manage.access`, …
*Since 2026-10-12 (Q10.1): two categories (`library`, `manage`) under the
module, URLs `/modules/media/<page>`, ids `modules.media.library.files`, …*

**Q2.4 The old page permission was `settings.media.assets`. What happens to it?**
It is gone with the settings page; the default root ACL now grants `read` to
`media.library.files` (the All files page). Roles that granted the old id must
grant the new one: this is a breaking change, called out in the PR and the
changelog. Folder ACLs stored in the database that name the old id keep
working only if a role still holds it, so the README says to update them.
*Since 2026-10-12 the id is `modules.media.library.files`, which the DMS grants
to owners only (Q10.2).*

**Q2.5 Do the static permissions change?**
No: `media.upload`, `media.folders.manage` and `media.permissions.manage` keep
their ids (configs and stored ACLs reference them). They get translated titles
and descriptions (`$dms_media.permissions.*`) and depend on the All files
page. They now sit under the `media` root in the Roles tree, next to the pages.
*Since 2026-10-12 there is no `media` root permission any more: the Roles tree
lists the three permissions at its top level, and their dependency on the All
files page is inert, the DMS never registering a module page permission.*

**Q2.6 How are the pages declared?**
Every page is a backend tree. Stock blocks where they fit: `StatGroup` (KPIs,
fetched), `Card` + `Meter` (storage by type) + `KeyValueList` (largest
folders, needs attention), `NavCardGrid` (folders, fetched), `ActivityFeed`
(activity, fetched), `TableView.fromSource` (upload history, linked folders),
`Section`, `Banner`, `Form` with real `AssetType` fields (Asset field page).
A custom block only where nothing stock renders the thing: the explorer, the
upload strip and queue, recent thumbnails, first run, the file viewer, the
image editor, the access editor, the preset cards and the configuration
snippet. Every custom block carries `.meta({ name, description, icon })` with
`$dms_media.blocks.<id>.*` keys, so the Roles tree shows a translated name, and
every write a role can withhold is an `.action()` of its block.

**Q2.7 Which actions are declared on blocks?**
None. Every write is already guarded by folder rights and the three static
permissions, which are the single authority the API enforces: adding a second
gate per block would let a role show a button the ACL then refuses, or the
reverse. Blocks expose those rights to the UI (the tree answers `rights` per
folder and the root rights), so a button only shows when the API will accept
it. Starring is personal and needs no gate.

**Q2.8 Nav badges?**
None. A count of every file is noise in a sidebar, the uploads in progress
are only known to the browser (the explorer status bar shows them), and a
server badge on Linked folders would need a table view tab with `navBadge`,
which a source table does not publish. The Linked folders table shows its
count in its caption instead.

## 3. Library and explorer

**Q3.1 One explorer or two (Library and picker)?**
One `Explorer` component, used by the All files page and by the picker modal
(`mode: "browse" | "pick"`). The old `finder/*` (unused, broken) and
`picker/*` explorers are removed (M18).

**Q3.2 Listing: client or server?**
Server. `GET /api/media/folders/:id/assets` pages (`offset`, `limit`), sorts
(`name`, `date`, `size`, `type`) and filters by type group. Smart views are
server listings too: `recent` (newest first), `starred` (the caller's
favorites) and `missing-alt` (images without alt text). The client never holds
the whole library, so nothing is silently truncated (M09).

**Q3.3 Search?**
`GET /api/media/search` matches file names, alt text and folder names across
the readable folders (or a folder and its subfolders), with type facets and
their counts, a visibility filter and a modified filter (any, 7 days, 30 days,
this year). Results say where the term matched (name or alt text) and their
path. No results suggests clearing filters and says what was searched (M10).

**Q3.4 Views?**
Grid (folders as compact rows above the files, tiles with persistent
visibility and missing-alt markers, M17), list (columns name, type, size, alt
text, visibility, modified) and columns (Finder-style). The view, the details
panel and the tile size persist per browser.

**Q3.5 Selection and bulk actions?**
Click selects, ⌘/⇧-click extends, the checkbox stays visible once something is
selected. Two or more files swap the location header for a bulk bar: Move to,
Visibility, Download .zip, Delete, Clear (M08). Bulk routes
(`/api/media/assets/bulk/move|visibility|delete`) apply every item or report
the ones refused; `POST /api/media/assets/zip` streams a stored zip of the
readable selection (capped at 200 files / 1 GB).

**Q3.6 Folder delete?**
"Delete folder…" in the folder menu opens an impact summary (subfolders,
files, size freed, public files warning) and asks to type the folder name,
because the delete is recursive and permanent (M04). The impact comes from
`GET /api/media/folders/:id/impact`.

**Q3.7 File delete?**
The dialog lists the files, flags public ones ("Pages or emails that embed it
will show a broken image") and offers "Make private instead" when the caller
can change visibility (M05). Delete sits in menus and the details footer.

**Q3.8 Linked folders in menus?**
Their menu keeps Rename, Move and Delete disabled with "Locked" and adds "Why
is this locked?", which explains the binding and links to Linked folders
(M11). Folders carry a link marker.

**Q3.9 Keyboard shortcuts?**
`⌘/` search (`/` alone belongs to the dashboard's navigation search), `U` upload, `⇧N` new folder, `Space` preview, `↵` open, `E` edit,
`F2` rename, `M` move, `⌫` delete, `⌘A` select all, `1` `2` `3` views, `I`
details panel, `?` shortcuts sheet, `Esc` clears. Bound on the explorer only,
ignored while typing in a field and while a dialog or a menu is open, so Escape,
Enter and Space reach the overlay (M12). They are also listed in the DMS
shortcuts registry so they show in the account's shortcuts page.

**Q3.9b How is the overview localized when stock blocks take no parameters?**
Since DMS 0.7.2 every overview block (`StatGroup`, `KeyValueList`,
`NavCardGrid`, `Meter`, `ActivityFeed`) takes composed texts: the routes answer
an i18n key with raw values (counts, byte sizes, dates) and the dashboard writes
them in the reader's language with its plural rules. The server translates
nothing.

**Q3.10 Optimistic updates?**
Rename, move, alt text, visibility, delete and new folder patch the local store
and roll back on failure, instead of reloading the tree and every asset (M19).
The tree reloads only after folder structure changes.

**Q3.11 Favorites?**
Per user, per tenant, in a `media_favorites` table (`userId`, `kind`,
`targetId`). Starring a file or folder is the explorer's `star` action.

**Q3.12 Preview?**
Space opens a lightbox with ← / →, the position ("3 of 14"), alt text and
visibility, and Edit (E) for images (M16). Double-click or "Open details"
opens the file page.

## 4. Uploads

**Q4.1 What changes in the upload flow?**
Uploads run in a queue shared by the whole layer (a module-level store), two
at a time, so one failure never stops the rest (M03). Each file walks presign →
PUT with progress (XHR) → confirm, and a failure stays on its row with its
reason and a Retry. Files over the 500 MB limit are refused before upload. The
queue survives navigation inside the dashboard, and a tray in the explorer
status bar shows it.

**Q4.2 Where do files go?**
Upload always names its destination (M07): the explorer uploads to the open
folder; at the root or on the overview, a destination picker shows the last
used folder (remembered per browser) and only folders the caller can write.
Dropping files from the desktop names the folder before release.

**Q4.3 What does the Uploads page show?**
The current batch (counts by state, overall progress, per-file rows, Pause,
Cancel remaining, Retry failed) and a source table of recent batches. A batch
summary is posted when the batch ends (`POST /api/media/upload/batches`) and
stored as an activity event, so the history is shared across devices.

## 5. File details and editing

**Q5.1 File page?**
`/modules/media/file?asset=` with the viewer, previous/next within the folder (← / →,
filmstrip), Copy link, Download and Edit image. Tabs: Details (name with fixed
extension, alt text with a 255 counter and saved state, folder with Move,
visibility as three choices with consequences, information), Delivery (stable
link and one URL per preset, M14), History (the asset's events) and Usage
(states honestly that reference tracking is not available yet). Changes save
on blur.

**Q5.2 Alt text?**
First field of the inspector and the file page (M06). Missing alt text is a
tile marker, a list column, a smart view and an overview KPI with a link.

**Q5.3 Image editor?**
Edits are staged (crop with aspect presets Free, 1:1 thumb, 3:2 original, 4:3,
16:9, 1.91:1 social; rotate left/right) and listed as pending changes; one
Save (⌘S) sends a single `transform` (M13). The preview of each delivery
preset updates live. Revert to original stays available when an original is
preserved. Failures keep the pending changes.
*Since 2026-10-13 (Q10.8): Save warns that it changes the image everywhere it
is used, and Save as copy keeps the source untouched.*

## 6. Manage

*Access & visibility and Linked folders are set aside since 2026-10-12
(Q10.3); Delivery presets stays.*

**Q6.1 Access & visibility?**
A folder tree with markers (public, own rules, linked), and for the selected
folder: the inheritance chain, how many members can view, upload and manage
(computed server-side from each member's roles), the rule table (role or
permission × view/upload/manage, implied rights shown), add a role or
permission, inherit from the parent, and the folder's visibility with a
confirmation before making a folder public (M02). Editing requires
`media.permissions.manage` and `manage` on the folder; others get a read-only
summary. Linked folders are read-only and say where their rules come from.

**Q6.2 Linked folders?**
A source table of every binding (folder, field, accepted types, who can upload,
visibility, files) with a row drawer: what declared it, the derived rights, the
field definition to copy. `AssetType` now forwards its `multiple`, `max` and
`mimetypes` to the binding registration (`field`, optional), so the table can
say what the field accepts.

**Q6.3 Delivery presets?**
One card per preset (box, fit, format, quality, URL pattern, cache key, how
many files have it rendered), the cache rules (nightly sweep, public CDN
lifetime, private signed links) and the configuration snippet. Presets stay
read-only: they are project configuration.
*Since 2026-10-13 the page is Settings › Image sizes (Q10.7), and the
`/media/...` redirect is no longer cacheable (Q10.14).*

## 7. Developers

*The page left the module on 2026-10-12: the picker demo lives in the
playground (Q10.4).*

**Q7.1 Asset field & picker page?**
A real `Form` with three `AssetType` fields (cover image, gallery of up to 8,
spec sheet PDF) in `saveMode: "none"`, so developers try the widget and the
picker, plus the declaration snippet. The gallery is a reorderable grid with a
Cover tag and missing-alt markers; the picker shows "N of max after adding",
dims files the field cannot accept with the reason and blocks picking past the
limit instead of dropping files after confirming (M15).

## 8. Overview

**Q8.1 KPIs?**
`StatGroup` (`cards`) fetched from `/api/media/stats/kpis`: files (with the
uploads of the last 30 days), storage (with the share of the optional
`storageQuotaBytes` config), public files (share of the library), missing alt
text (warning tone, links to the smart view).

**Q8.2 Storage by type and largest folders?**
A `Card` holding a segmented `Meter` (images, videos, PDF, documents,
spreadsheets, vectors, other) fetched from `/api/media/stats/storage` and a
`KeyValueList` of the five largest folders.
*The largest folders and the folder cards left the overview on 2026-10-13
(Q10.7).*

**Q8.3 Needs attention?**
A `KeyValueList` fetched from `/api/media/stats/attention`: images without
alt text, failed uploads of the last day, files over 20 MB. An empty list
shows "Nothing needs attention". *Folders with their own rules left the list on
2026-10-12 with the rules editor they linked to (Q10.3).*

**Q8.4 Activity?**
An `ActivityFeed` over a `media_events` table written by every write route
(upload batch, delete, visibility, transform, revert, move, rename, folder
create/delete, rules change). Events are filtered by the caller's readable
folders and kept 90 days (swept by the daily cron).

**Q8.5 First run?**
When the library has no folder, the overview shows a first-run block proposing
four starter folders (Catalog, Marketing, Brand public, Documents) created in
one click by a caller with root `manage`.

## 9. Quality

**Q9.1 Tests?**
Backend integration tests for every new route (listing, search, stats, bulk,
zip, impact, favorites, events, access summary, batches, linked folders,
presets) and unit tests for the pure helpers (type groups, zip writer, stats
aggregation). The browser pass covers every screen in dark and light, FR and
EN, a restricted member, and the picker inside a form.

**Q9.2 i18n?**
Every string goes through `$dms_media.*` keys in `media-en-GB.json` and
`media-fr-FR.json`, including block metas, permission titles and nav labels.

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
The backend stays as it is: the ACL engine, the default rules, the three
static permissions, the bindings that provision linked folders and every route
(`/folders/:id/acl|access|access/stats|visibility`, `/access/subjects`,
`/linked`, `/linked/:bindingId` with its `AssetType` declaration snippet). A
restricted folder stays restricted, and the explorer still marks folders with
their own rules. What only those pages used goes with them: their custom
blocks (`AccessTree`, `AccessFolder`, `AccessRulesCard`, `AccessVisibility`,
`LinkedDetail`, `useAccessEditor`), their API calls and types in the layer, and
their texts. A folder's own visibility, which only the rules editor changed, is
set through `POST /api/media/folders/:id/visibility` until the page returns. File visibility stays in the inspector, the File page and the
bulk bar, with the confirmation before making files public. The pages come
back later.

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
