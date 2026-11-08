---
name: verify-dms-media
description: "Drive the AntelopeJS dms-media module (the media library, uploads, delivery links, image sizes, the image editor, folder bindings, asset fields and declared content) the way the platform owner and the members do, inside a DMS with free ports, its own MongoDB database and local file storage, and report a verdict with evidence. Use to prove a change to AntelopeJS/dms-media works before merge, or to verify a PR."
---

# Verify dms-media

Every deterministic step is a `dms-control` command. You choose which journeys to run and judge what they show; you never write a multi-step shell recipe. When a journey you need does not exist, add it to `journeys/<feature>.mjs`, describe it in its feature file, and run it.

`dms-control` is the bin of `@antelopejs/dms`, a devDependency of `packages/dms-media`. Run it with Node 24 after `pnpm install`, through that package:

```bash
C="pnpm --dir packages/dms-media exec dms-control"
$C                       # lists every command
```

Give `doors` and `--skill` absolute paths: the command runs in `packages/dms-media`.

## Launch

```bash
RUN=$($C up --prepare --base origin/main)   # installs, builds, starts; prints the run folder
```

`--prepare` runs the `prepare` commands of `verify.config.ts`: the frozen install, the build of the interface and the module, `playwright-core` into this folder, the link of the verification playground's `node_modules` to `packages/dms-media/node_modules`, and the TypeScript build of the playground's fixture module. Without it `up` uses the builds already there, and `doctor` fails on a stale one. `up` reads the playground from `verify.config.ts` (`playground/` in this folder: the DMS, the api, MongoDB, auth, local file storage and mail modules, the module under verification as a `local` source at `packages/dms-media`, and a fixture module of its own) and starts an isolated DMS:

- the checkout is laid out again under `$RUN/root`, every sibling linked, and the playground copied without `node_modules`, so the run's build, `.antelope/` and stored files are its own;
- the API, the dashboard and the mail sink get free ports from the kernel, and `HOME` is `$RUN/home`;
- a `mongod` the run owns serves `verify_<run>` databases;
- the backend runs `ajs project start -e docs`, the dashboard `ajs dms start -e docs -b <api>`; the api's public URL is the dashboard's, so copied links and the storage's upload URLs start with the dashboard's origin, which proxies `/media/**` and `/file-storage/**`.

The fixture module (`playground/src`) serves what a journey cannot do over the module's own HTTP API, under `/verify-media`: a member with a role of given permissions (`POST /member`; `page:fields` and `page:open` stand for the playground's pages and their form blocks), `EnsureMediaFolder` and `ImportMediaAsset` (`POST /folder`, `POST /asset`), `RegisterAssetBinding` and `UnregisterAssetBinding` at run time, the validation of an `AssetType`, and the data type's constants. It registers a page with four asset fields (`/verify-fields`) and a `memberAccess` page with one, and declares a folder and a text file from `Hook.TENANT_BEING_PROVISIONED` for every new database.

## Doctor

```bash
$C doctor "$RUN"          # prints only failing checks; --verbose prints all
```

Do not drive a run that fails doctor.

## Drive

```bash
$C plan --base origin/main   # the diff mapped to features; unmapped surfaces
$C journey "$RUN" smoke
$C journey "$RUN" uploads [journey-id...]
```

- Each feature file in [features/](features/README.md) lists its source globs (`covers:`), its docs pages (`docs:`) and its journeys; the journeys are in `journeys/<feature>.mjs` and `journeys/parts/`, with the helpers they share in `media.mjs` (requests, checks, images, storage), `library.mjs` (folders, uploads, members, declarations, configuration switches) and `guard.mjs` (environment loss).
- A journey starts on an empty database with the administrator onboarded and the backend restarted on it, so runtime bindings and configuration switches are gone. Stored files stay in the run's storage, so every journey creates its own folders. It reads every mutation back through a second view: the API, a reload, an anonymous request, a member's account, the storage's own records, or a backend restart.
- `withConfig(ctx, { VERIFY_MEDIA_*: … }, body)` restarts the backend with module options set (`MIMETYPES`, `QUOTA`, `PRESETS`, `ROOT_ACL`, `PUBLIC_BASE_URL`, `STORAGE_ORIGIN`, `NO_CORS`; see `playground/antelope.config.ts`) and restarts it again without them.
- To look at the product yourself: `$C onboard "$RUN"`, `$C browser "$RUN" login`, `goto --path`, `snapshot`, `click --role --name`, `fill`, `press`, `screenshot`, `$C api "$RUN" <method> <path> [--as anon] [--body <json>]`, `$C reset "$RUN"`. Each writes its evidence under `$RUN/evidence/`.

## Evidence

Everything goes under `$RUN/evidence/`: `<feature>/<journey>/NN-<step>/` with `action.json`, `url.txt`, `aria.yml` and `screenshot.png` for a browser step, `request.json` and `response.json` (status, headers, size and SHA-256 of the body) for a request, and `checks.json` for every step that checks something; `<feature>/<journey>/result.json` and `<feature>/feature.json`. Read the evidence before you judge a PASS: a check passing proves only what it asserts.

## Cleanup

```bash
$C down "$RUN"
```

## Verdict rules

1. **Run every feature whose `covers:` globs the diff touches, plus the smoke journey.** `plan` prints that list as `run`.
2. **Unmapped surface fails the verdict.** User-facing code is `packages/dms-media/src/**`, `frontend-vue/**`, `skills/**`, `package.json`, and `packages/interface-dms-media/src/**` and `package.json`, tests and tool configs excluded (`verify.config.ts`). `map` checks the whole tree.
3. **Every registered journey of a feature in `run` must have run and passed.** Known findings stay as failing journeys (see the feature files' Gotchas): they fail a verdict only when the diff touches their feature.
4. **Docs.** Judge every `docs:` page of each touched feature against what the journeys showed.
5. **Formal checks.** `$C formal "$RUN"` runs every formal check whose covered files the diff touches; `formal-asset-files` ([SKILL.md](../formal-asset-files/SKILL.md)) covers how an asset's stored files are written, published and deleted. A check that exits non-zero fails the verdict, `STALE` included: the model must describe the code at HEAD.
6. **One-way doors.** The section comes right after the result line and is mandatory. `$C doors` prints the `One-way-door:` line for the diff.
7. **Result.** FAIL if any of rules 1 to 6 fail. PASS+NOTES when something is not verified or needs the owner's attention. PASS otherwise.

Write `$RUN/evidence/judgement.json` (`doors`, `docs`, `notVerified`, `attention`, `verifier`), then `$C verdict "$RUN" --pr <n>`, which writes `$RUN/evidence/verdict.md`. Report the verdict and what you saw in your own reply.

## Trust

The skill is not Trusted yet. It becomes Trusted when it passes a shadow run of 10 consecutive agent PRs, and its last maintain pass is newer than the last change to the repository or its `@antelopejs` dependencies and at most 30 days old.

## Gotchas

- Every dashboard page renders on the server and hydrates after `load`; a click that lands first does nothing. The journeys click again until what the click opens shows (`openPicker`, `clickUntil`, `rotateOnce`, `explorerWithFiles`), and `tab.signIn` waits for the sign-in form to hydrate.
- The run's browser is 1280 px wide: the Library's details open in the drawer. Journeys that need the side panel widen the viewport. The explorer lays out by its own content box, inside its 1 px border, not by the window: `journeys/parts/layout.mjs` resizes the window until that box is the width wanted.
- Members and owner-only checks need a page grant that includes the page's form block; the fixture's `page:fields` does that.
- The toolbar of the live pages names its buttons Live and Pause; the docs say Direct and Pause.
- No journey waits for Playwright's `filechooser` event: its interception turns on without being awaited, so an action right after `waitForEvent` can open no event. `openFilePicker` (`chooser.mjs`) cancels the click on the page's file input in a capture listener, counts it, and answers that input with `setInputFiles`, several files at once where the input is `multiple` (`pickSeveral` in `journeys/parts/pickers.mjs`). A drop is a synthetic `DragEvent` with a `DataTransfer` of `File`s.
- The reason a file was refused is read from its batch's result on the Uploads page, where the queue keeps it after the upload ends.
- `overview/own-uploads-keep-moving-while-paused-and-activity-follows` holds the browser's storage `PUT` for 4 s with Playwright's request routing, so the upload is still in progress while the page is paused.
- Uploads through the dashboard go to the dashboard's own origin; `STORAGE_ORIGIN=api` sends them to the API's origin, and `unreachable` to a closed port.
- No request ages a file or an event. `clock.mjs` moves a row's `createdAt` or `updatedAt` back in the run's database, with the MongoDB driver dms-control resolves, for the 24-hour, 7-day, 30-day and year windows.
- `mongod` comes from `DMS_CONTROL_MONGOD`, `PATH`, or the mongodb-memory-server cache (`~/.cache/mongodb-binaries`).
- A step whose check fails because the backend or the dashboard stopped answering ends the journey with a `NOT VERIFIED` error and no failing check (`guard.mjs`).
- Known findings on `origin/main`, each a failing journey with an open issue: `library/the-details-drawer-steps-through-the-files` (#119, the drawer ends on a 500), `uploads/a-live-uploads-page-shows-a-new-batch` (#118, Recent batches does not follow Live), `asset-field/the-pickers-upload-targets-the-linked-folder` (#121, the picker's Upload from a subfolder lands in the subfolder). `overview/own-uploads-keep-moving-while-paused-and-activity-follows` fails now and then (#124, 1 run in 10 on one stack): with Live pressed and checked, a rename made elsewhere sometimes does not show on the Activity page within 20 s. `files/the-history-lists-every-event` fails on purpose: a file's History stops at 50 events while the docs say it lists every event (draft `dms-media-history-cut-at-50`). `files/a-move-keeps-the-targets-rules` fails on purpose: a move into a linked folder skips the field's types, and a move onto a taken name is allowed (drafts `dms-media-move-ignores-field-types` and `dms-media-move-ignores-taken-names`).
- Docs that disagree, where the journeys assert the documented behaviour the code has: the config TSDoc names a request-origin default for `publicBaseUrl` and leaves PHP out of `allowedMimetypes` (#125); Extending says the sizes example is null without a public image, while the Image sizes page and the code fall back to a private one (docs draft `dms-media-docs-example-url-private`).

## Not driven

List these under `notVerified` in the judgement of every verdict:

- the scheduled jobs (`dms-media-purge-staging`, `dms-media-sweep-derivatives`): only the module's own `node-cron` schedule starts them, and no request or switch runs them, even though `clock.mjs` can age the rows they read;
- a zip over 1 GiB (the 200-file limit is driven; the size limit needs more than 1 GiB of stored files per run);
- links that stay relative with neither `publicBaseUrl` nor `apiBaseUrl`: the DMS fills `apiBaseUrl` with a default when it is unset;
- the 401 HTML page when the dashboard URL is unknown: the DMS refuses to start without `clientBaseUrl` outside development;
- HTML and XHTML served as attachments: the library refuses them at upload and import, so none can be stored (XML is driven);
- the `storage` option naming another backend: the playground has one file storage;
- a binding released when its module unloads and replayed to a reloaded implementation: the run starts the project without module reloads;
- another tenant using the same declaration key: the run has one tenant;
- the live toolbar hidden by a role: the Media pages are owner-only and an owner holds every block;
- the star icon of the Locations tree (icons are not in the accessibility tree; the `starred` flag is driven through the API, the link icon by `tree-icons.mjs`);
- the frontend server's 413 over 500 MiB and reverse-proxy limits (the dashboard's and the deployment's, not this module's);
- `ajs project modules add`, `ajs dms`'s renderer range refusal, and the repository playground's commands (developer tooling).

## Feature map

[features/README.md](features/README.md).
