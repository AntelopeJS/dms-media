---
name: formal-asset-files
description: TLA+ model of a media asset's stored files (its image, its original, its image sizes and the queue of files to delete) while size requests, Save, Revert to original, deletion and the nightly sweep race, checked with TLC. Use when a change touches a function in its coverage record (asset-lifecycle.ts, derivatives.ts, transform.ts, sweep-derivatives.ts and their callers), or when a change to how dms-media writes, publishes or deletes stored files needs proof that no ordering of requests breaks a rule.
---

# Formal check: an asset's stored files

dms-media never edits a stored file in place. Every writer stores a new file first, then publishes its key on the `media_assets` row with a compare-and-set on `mediaRevision` (`compareMedia`). A replaced key goes into `json_retiredFiles`, and `cleanupAssetFiles` deletes it later and acknowledges it. A deletion marks the row `isDeleting` before it deletes any file. `AssetFiles.tla` models that protocol for one asset, one await per step. TLC tries every order in which these requests interleave:

- a page requesting an image size for the first time (`ensureDerivative`, `generateDerivative`, `commitDerivative`);
- Save in the image editor (`applyImageTransform`) and Revert to original (`revertImageTransform`), both through `commitTransform`;
- deleting a file, alone or with its folder (`deleteMediaAsset`);
- the nightly sweep that detaches sizes the configuration no longer declares (`sweepAssetDerivatives`).

## Run it

```sh
node .agents/skills/formal-asset-files/check.mjs            # the model against today's code
node .agents/skills/formal-asset-files/check.mjs --seeded   # the check still catches each seeded bug
```

It needs Node 24 and `pnpm install` done, because the runner comes from `@antelopejs/tooling-configs/formal`. Java 11 or later comes from `$JAVA`, else `java` on PATH, else the `eclipse-temurin:21-jre` Docker image. The first run downloads TLC 1.7.4 into `~/.cache/antelopejs-formal` and checks its SHA-256. The model check takes about 35 s through Docker on 16 cores, and `--seeded` about 30 s.

- Exit 0 means every rule holds in every configuration, and no covered function changed since `coverage-record.mjs`.
- Exit 1 has three causes. `BROKEN <rule>` names a rule that breaks, followed by TLC's shortest counterexample as a list of actions. `STALE <file>#<function>` names a covered function whose text changed since the model was last confirmed against it. Under `--seeded`, a line that is not `finding` names a seeded bug the check no longer catches. The runner prints the folder that keeps TLC's output.
- Exit 2 means TLC or Java could not run.

`verify-dms-media` runs it as the formal check `formal-asset-files` (`$C formal "$RUN"`) whenever a diff touches a covered file or this folder.

## The rules

| Rule | Plain sentence | Harm when it breaks | Today |
| --- | --- | --- | --- |
| `LiveFilesStored` | Every file the asset points to (its image, its original, its sizes) is in the storage. | The file's link, one of its sizes or Revert to original answers 404 or 502. | holds |
| `SizesShowCurrentImage` | Every image size shows the asset's current image. | After Save or Revert, thumbnails and sized links keep showing the old picture. | holds |
| `NoRetiredFilePublished` | No request fails because it would publish a file queued for deletion. | A size request, Save or Revert answers 500 (`Cannot publish a retired media file`). | holds |
| `NothingLeftBehind` | Once every request ended, the storage holds exactly the asset's files, nothing stays queued, and a deleted asset leaves no file and no row. | Storage keeps files nobody can reach, or a deleted file's row stays forever. | holds |

`TypeOK` holds too. The guard behind `NoRetiredFilePublished` (`updateAssetMedia` throws when a retired key would be published) never fires within these bounds. It is a safety net, and the rule records that no request trips it.

## Seeded bugs

`--seeded` applies each mutation in `SEEDED` (`check.mjs`) to a scratch copy of the spec. Each mutation mirrors a one-line bug in the code, and its rule must break with the recorded counterexample length.

| Mutation | The code bug it mirrors | Rule that breaks |
| --- | --- | --- |
| `lost-race-deletes-the-published-size` | `commitDerivative` deletes `derivatives[cacheKey]` in place of its own file when another request published the size first | `LiveFilesStored` |
| `save-keeps-the-old-sizes` | `commitTransform` publishes without `json_derivatives: ""` | `SizesShowCurrentImage` |
| `size-published-after-the-image-changed` | `commitDerivative` skips the `fresh.storageKey !== asset.storageKey` check | `SizesShowCurrentImage` |
| `conflicting-save-keeps-its-file` | `applyImageTransform` no longer deletes its rendered file on `MediaAssetChangedError` | `NothingLeftBehind` |
| `replaced-files-queued-with-live-ones` | `updateAssetMedia` retires every old key, without `.filter((key) => !live.has(key))` | `NoRetiredFilePublished` |

When you change the spec, `MOVED` means a mutation's text is gone from it. Rewrite that mutation against the new text, so it still mirrors the same code bug.

## Read every result with /statechart

Read each TLC result with the pstack `/statechart` skill. It turns a broken rule into its shortest path in plain words, and a passing configuration into a chart. Copy `AssetFiles.tla`, `AssetFiles.view.mjs` and the configuration into a scratch folder outside the repo, and give it `AssetFiles.view.mjs` as the view. Every configuration here is above its chart budget. For a chart of a passing model, use a copy of `saves.cfg` with `Editors = {e1}`. For a broken rule, give it the configuration that broke, and it reports the path even above the budget. When `/statechart` needs Java and cannot install it, point it at the cached `tla2tools.jar` and a Java of your own, as its skill explains.

## Real bug or modeling error

Replay the counterexample against the code, one action per step, using the coverage record below. Each action is one `await` of the code. A step order is a modeling error when the code cannot produce it. Then fix the model, keep the rule, and say why in the change. Otherwise, reproduce it in a scratch integration test under `packages/dms-media/src/test/integration` (`pnpm --dir packages/dms-media test:integration`). Call the exported functions (`commitDerivative`, `updateAssetMedia`, `cleanupAssetFiles`, `deleteMediaAsset`, `applyImageTransform`) in the counterexample's order, and pass `cleanupAssetFiles` and `deleteMediaAsset` their `deleteFile` parameter to hold a deletion at the right step. Assert only what a user observes: the row through the API and the bytes in the storage. A real bug is a finding. Record it in `FINDINGS` (`check.mjs`) with its configuration and counterexample length, and in this file with its replay. Never weaken the rule or the model until it passes.

## Changing the model

- A diff that changes a covered function makes the check print `STALE`. Read the diff, change the action that maps to that code (see the coverage record) so the model does what the code now does, and rerun. A `BROKEN` rule after that is the diff's bug, unless the replay shows a modeling error.
- When a change adds a request that writes, publishes or deletes an asset's files, add an action for it, its function to `COVERED` in `coverage.mjs`, and a configuration that races it against the others.
- Once the model describes the code, commit the code and run `check.mjs --sync`. It records each covered function's fingerprint, and as the sync commit the last commit that changed the covered files. Run it only after you confirmed the model against the code; it refuses while a covered file has uncommitted changes.

## Coverage record

| Model action | Code |
| --- | --- |
| `DGet`, `DRead`, `DWrite`, `GGet` | `ensureDerivative`, `generateDerivative`, `uploadStorageBytes` (packages/dms-media/src/derivatives.ts); callers in routes/media/delivery.ts and routes/media/assets.ts |
| `CGet`, `CCas`, `CDrop`, `CDiscard` | `commitDerivative` (derivatives.ts) |
| `EGet`, `ERead`, `EWrite`, `EDiscard` | `transform` and `requireEditableAsset` (routes/media/transform.ts), `requireReadableAsset` (routes/media/assets.ts), `renderAssetTransform`, `applyImageTransform` (transform.ts) |
| `RGet`, `RRead` | `revert` (routes/media/transform.ts), `revertImageTransform` (transform.ts) |
| `TGet`, `TCas`, `SavePatch`, `RevertPatch` | `commitTransform`, `originalPatch` (transform.ts) |
| `XGet`, `XCas` | `deleteMediaAsset` (asset-lifecycle.ts), `removeAsset` (routes/media/asset-actions.ts), `deleteFolderAssets` (routes/media/folders.ts) |
| `SGet`, `SCas` | `sweepAssetDerivatives` (crons/sweep-derivatives.ts), `partitionDerivatives` (derivatives.ts) |
| `ClStart` .. `AckCas`, `ClFinal`, `ClDrop` | `cleanupAssetFiles`, `acknowledgeFile`, `retiredFiles` (asset-lifecycle.ts), `deleteCleanedAsset` (db/models/mediaAssets.model.ts) |
| `Publish`, `KeysOf`, `Live` | `updateAssetMedia` (asset-lifecycle.ts), `compareMedia` (db/models/mediaAssets.model.ts), `collectAssetStorageKeys`, `parseDerivatives` (routes/media/storage-keys.ts) |

`coverage-record.mjs` holds each covered function's fingerprint and the sync commit, `ac67959`. That is the last commit that changed the covered code when the model was confirmed against it.

## Bounds and what is left out

Each configuration starts from two assets. One holds its original image and one size the configuration no longer declares. The other was edited, so it also holds its original. There is one declared size and at most 12 stored files.

| Configuration | Requests racing | States |
| --- | --- | --- |
| `sizes` | two requests of the same size, Save | 31,728 |
| `edits` | a size request, Save, Revert | 95,376 |
| `saves` | two Saves | 2,095 |
| `delete` | a size request, Save, delete | 76,386 |
| `delete-revert` | Save, Revert, delete | 179,898 |
| `sweep-sizes` | a size request, delete, sweep | 19,745 |
| `sweep-edits` | Save, Revert, sweep | 46,756 |
| `sweep-delete` | Save, delete, sweep | 99,683 |

A pass covers these races and bounds only. All six requests at once (more than 15 million states for four of them) are not checked. The model leaves out:

- a process that stops between storing a new file and publishing it (`generateDerivative`, `applyImageTransform`, `createEditedCopy`, upload `confirm`): that file is on no row and in no queue, and no sweep finds it;
- storage failures. `cleanupAssetFiles` keeps a key queued when `FileExists` or `DeleteFile` throws, and the nightly sweep replays it, so `NothingLeftBehind` assumes the storage succeeds;
- an `unknown` acknowledgement from the database, which `compareMedia` turns into an error;
- the in-process `generationLocks` and `generationFailures`. The model lets two requests render the same size at once, as two backend processes would;
- uploads and their staging purge, Save as copy, declared imports, and rename, move, alt text and visibility, which leave the file fields and `mediaRevision` alone;
- the `preserveDetails` branch of `compareMedia`, which no caller passes;
- the order of a cleanup's walk. The code walks `json_retiredFiles` in array order, the model lowest key first.
