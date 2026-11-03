---
covers:
  - packages/dms-media/src/routes/media/overview.ts
  - packages/dms-media/src/library/overview.ts
  - packages/dms-media/src/library/activity.ts
  - packages/dms-media/src/library/events.ts
  - packages/dms-media/src/library/realtime.ts
  - packages/dms-media/src/pages/overview.ts
  - packages/dms-media/src/pages/activity.ts
  - packages/dms-media/src/pages/toolbar.ts
  - packages/dms-media/frontend-vue/app/components/RecentFiles.vue
docs:
  - packages/dms-media/docs/4.usage/1.overview.md
  - packages/dms-media/docs/2.installation.md
  - packages/dms-media/docs/5.extending.md
---

# Overview

The Overview (needs attention, KPIs, storage by type, activity, recently added, the drop zone), the Activity page, live updates with Live and Pause, and pages rendered on the server.

## Sub-features

- `the-overview-reads-the-library`: Needs attention counts images without alt and the public ones, failed uploads of the last 24 hours and files over 20 MB; the KPIs count files, files added in 30 days, storage, public files and missing alt; storage by type counts edited originals; activity and recently added list the newest.
- `the-plan-shows-on-the-storage-kpi`: with storageQuotaBytes set, the storage KPI measures the use against the plan.
- `an-empty-library-offers-four-starter-folders`: while the library is empty the Overview offers to create Catalog, Marketing, Brand and Documents in one click.
- `the-drop-zone-remembers-the-last-folder`: the drop zone asks for the folder the first time, uploads the chosen files and files dropped anywhere on the page there, and the browser remembers it next time.
- `activity-lists-every-write-by-kind`: the Activity feed lists every write, the latest 50 grouped by day, and its tabs and the type filter keep uploads, edits, moves, deletions, visibility or folders; the page is hidden from the sidebar and opens from View all.
- `live-pages-follow-the-library-unless-paused`: the Overview follows a change made elsewhere; paused it does not read and counts the changes it missed; Live reads them at once; L switches; the choice is shared by the live pages and kept; ?live=0 opens paused.
- `own-uploads-keep-moving-while-paused-and-activity-follows`: while the Overview is paused, an upload of its own drop zone still goes through; the Activity page shows a change made elsewhere without a reload.
- `pages-arrive-rendered-by-the-server`: the Overview, the Library's folder tree and listing, a link to a folder, a view or a search, and a file's page arrive from the server with their data.
- `the-overview-figures-are-exact`: Needs attention counts exactly the files that failed today and the files over 20 MB, not one of exactly 20 MB; Storage by type gives each type's bytes, the original of an edited image included.
- `an-upload-that-exactly-fills-the-plan-is-accepted`: with storageQuotaBytes set, a file that fills the plan to the byte is accepted, and one more byte is refused with remaining 0.
- `the-clean-up-and-the-toolbar-tell-the-time`: the Cache card's nightly clean-up runs next at 04:00 server time, and the live toolbar's last-read age counts up and starts again after a read.

## How to get to it (user POV)

- Modules › Media › Overview; View all for Activity.

## Driving it with dms-control

```bash
dms-control journey "$RUN" overview
```

## Gotchas

- The toolbar names its buttons Live and Pause; the docs say Direct and Pause. The journeys press Live.
- `the-overview-reads-the-library` uploads a 21 MB file for the over-20-MB count.
