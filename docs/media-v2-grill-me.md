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

**Q2.2 Which pages ship?**

| Nav group | Page | URL | Content |
| --- | --- | --- | --- |
| Library | Overview | `/media/overview` | Upload strip, KPIs, storage by type, needs attention, recent files, folders, activity, first run |
| Library | All files | `/media/files` | The explorer (tree, grid/list/columns, inspector, bulk bar, search, menus, drag and drop, shortcuts) |
| Library | Uploads | `/media/uploads` | Current upload queue and the recent batches |
| (hidden) | File | `/media/file?asset=` | File details: viewer, filmstrip, details, delivery, history, usage |
| (hidden) | Edit image | `/media/editor?asset=` | Staged crop and rotate with presets preview |
| Manage | Access & visibility | `/media/access` | Folder tree, inheritance chain, who can view/upload/manage, rules, visibility |
| Manage | Linked folders | `/media/linked` | Folders created by `AssetType` bindings, with their field |
| Manage | Delivery presets | `/media/presets` | Preset sizes, URLs, render counts, cache and configuration |
| Developers | Asset field & picker | `/media/field` | Live `AssetType` fields and the code to declare them |

The mockup's Search screen is a mode of the explorer (`/media/files?q=`), not
a page: the search box lives in the explorer toolbar and searching from any
folder must not navigate away. The "Design review" group is mockup-only.

**Q2.3 Nav groups and URLs?**
Three label categories (`library`, `manage`, `developers`) under the root, each
with `urlSlug: "/"`, so URLs stay `/media/<page>` and permission ids read
`media.library.files`, `media.manage.access`, …

**Q2.4 The old page permission was `settings.media.assets`. What happens to it?**
It is gone with the settings page; the default root ACL now grants `read` to
`media.library.files` (the All files page). Roles that granted the old id must
grant the new one: this is a breaking change, called out in the PR and the
changelog. Folder ACLs stored in the database that name the old id keep
working only if a role still holds it, so the README says to update them.

**Q2.5 Do the static permissions change?**
No: `media.upload`, `media.folders.manage` and `media.permissions.manage` keep
their ids (configs and stored ACLs reference them). They get translated titles
and descriptions (`$dms_media.permissions.*`) and depend on the All files
page. They now sit under the `media` root in the Roles tree, next to the pages.

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
Read actions are free. The explorer declares `star` (favorites); the rest of
the writes are already guarded by folder rights and the three static
permissions, which are the single authority the API enforces: adding a second
gate per block would let a role show a button the ACL then refuses, or the
reverse. Blocks expose those rights to the UI (the tree answers `rights` per
folder and the root rights), so a button only shows when the API will accept
it.

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
`/` search, `U` upload, `⇧N` new folder, `Space` preview, `↵` open, `E` edit,
`F2` rename, `M` move, `⌫` delete, `⌘A` select all, `1` `2` `3` views, `I`
details panel, `?` shortcuts sheet, `Esc` clears. Bound on the explorer only,
ignored while typing in a field (M12). They are also listed in the DMS
shortcuts registry so they show in the account's shortcuts page.

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
`/media/file?asset=` with the viewer, previous/next within the folder (← / →,
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

## 6. Manage

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

## 7. Developers

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

**Q8.3 Needs attention?**
A `KeyValueList` fetched from `/api/media/stats/attention`: images without
alt text, failed uploads of the last day, files over 20 MB, folders with their
own rules. An empty list shows "Nothing needs attention".

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
