---
covers:
  - packages/dms-media/src/routes/media/folders.ts
  - packages/dms-media/src/library/folder-stats.ts
  - packages/dms-media/src/library/zip.ts
  - packages/dms-media/src/routes/media/bulk.ts
  - packages/dms-media/frontend-vue/app/components/dialogs/**
  - packages/dms-media/frontend-vue/app/components/FirstRun.vue
docs:
  - packages/dms-media/docs/4.usage/2.library.md
  - packages/dms-media/docs/5.extending.md
  - packages/dms-media/docs/6.faq.md
---

# Folders

Folders hold the files: names unique in their folder, rules for names Windows and macOS cannot save, moves, visibility, deletion with its subfolders, starter folders and zips.

## Sub-features

- `names-are-unique-whatever-their-case`: a folder name is unique among its siblings ignoring case and Unicode form, on create, rename and move, and the same name is fine elsewhere.
- `names-windows-or-macos-cannot-save-are-refused`: a folder name with / \ < > : " | ? * or a control character, or over 255 characters, is refused 400 with an error key; a file name refuses / \ and control characters only.
- `rename-move-and-visibility-show-in-the-tree`: a renamed, moved and published folder reads back so in the tree and its impact; a folder cannot move inside itself; folder visibility reaches its direct files only.
- `delete-takes-only-its-own-files`: deleting a folder removes its subfolders, their files and stored bytes, and leaves every other folder and file as it was.
- `starter-folders-need-manage-at-the-root`: the starter folders are created at the root by the owner, refused 409 when a root folder already has the name.
- `zips-hold-files-and-subfolders-within-limits`: a selection zips into media.zip with every byte of each file, a folder zips with its subfolders as directories, and more than 200 files are refused 413.
- `a-folders-menu-renames-and-moves-it`: a folder card's ⋯ menu renames the folder in a dialog that refuses a sibling's name in any case and a forbidden character before it asks, and moves it to the folder picked in a tree; the tree and the folder's files read back the same.
- `a-folders-menu-deletes-it-after-typing-its-name`: Delete folder… lists the subfolders, files and space that go with the folder, refuses an empty or wrong confirmation, and deletes only after the folder's name is typed; its subfolders, files and stored bytes are gone and a sibling folder stays.
- `a-folders-menu-publishes-and-zips-it`: Visibility… makes a folder public and private again with a warning first, reaching its direct files only, and Download as .zip saves an archive named after the folder and the day that holds its files and subfolders byte for byte.

## How to get to it (user POV)

- Library › New folder, a folder's menu, Download as zip.

## Driving it with dms-control

```bash
dms-control journey "$RUN" folders
```

## Gotchas

- The zip journeys read the archive with a small central-directory reader (`unzip` in `media.mjs`).
