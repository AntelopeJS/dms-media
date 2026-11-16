---
name: formal-declared-rows
description: TLA+ model of the rows one tenant gets for one declared key (a folder from EnsureMediaFolder, a file from ImportMediaAsset, the content root and the folder linked to an asset binding from provisionTenant) while several backend processes write them at once, checked with TLC. Use when a change touches a function in its coverage record (declared/folders.ts, declared/assets.ts, declared/records.ts, bindings.ts, fixed-id.ts and hasSiblingNamed) or when a change to how dms-media inserts, identifies or records declared content needs proof that no ordering of processes breaks a rule.
---

# Formal check: processes declaring one key at once

Backend replicas each run the declarations of a tenant: `EnsureMediaFolder`, `ImportMediaAsset` and the provisioning of the asset bindings. The in-process locks (`withDeclarationLock`, `provisioningLocks`) serialize one process only. Two processes that both read "missing" would insert twice, so every declared row takes an id that all processes compute alike (`declaredId`, `bindingFolderId`, both through `fixedId`), and the insert tolerates a duplicate key. `DeclaredRows.tla` models that protocol for one tenant and one key, one await per step. TLC tries every order in which these processes interleave:

- `EnsureMediaFolder` (`ensureDeclaredFolder`, `applyFolderDeclaration`, `createFolder`);
- `ImportMediaAsset` (`importDeclaredAsset`, `applyAssetDeclaration`, `createAsset`, `insertAsset`);
- `provisionTenant` (`ensureTenantBindings`, `ensureBindingFolder`), run for the content root and one linked folder.

## Run it

```sh
node .agents/skills/formal-declared-rows/check.mjs            # the model against today's code
node .agents/skills/formal-declared-rows/check.mjs --seeded   # the check still catches each seeded bug
```

It needs Node 24 and `pnpm install` done, because the runner comes from `@antelopejs/tooling-configs/formal`. Java 11 or later comes from `$JAVA`, else `java` on PATH, else the `eclipse-temurin:21-jre` Docker image. The first run downloads TLC 1.7.4 into `~/.cache/antelopejs-formal` and checks its SHA-256. The model check takes about 50 s on 4 cores, nearly all of it the `mixed` configuration, and `--seeded` about 25 s.

- Exit 0 means every rule holds in every configuration, and no covered function changed since `coverage-record.mjs`.
- Exit 1 has three causes. `BROKEN <rule>` names a rule that breaks, followed by TLC's shortest counterexample as a list of actions. `STALE <file>#<function>` names a covered function whose text changed since the model was last confirmed against it. Under `--seeded`, `HOLDS` or `CHANGED` on a line names a seeded bug the check no longer catches as recorded, and `MOVED` a mutation whose text left the spec. The runner prints the folder that keeps TLC's output.
- Exit 2 means TLC or Java could not run.

`verify-dms-media` runs it as the formal check `formal-declared-rows` (`$C formal "$RUN"`) whenever a diff touches a covered file or this folder.

## The rules

Each rule is checked once every process has finished.

| Rule | Plain sentence | Harm when it breaks | Today |
| --- | --- | --- | --- |
| `OneRowPerKey` | The tenant has one folder for a declared folder key, one file for a declared file key, one content root and one folder linked to the binding. | Two folders or two files for one declaration, or two content roots: members see duplicates, and a field binds to either. | holds |
| `OneRecordPerKey` | One declaration record exists per key. | A key resolves to either of two targets after the next provisioning. | holds |
| `LoserRecordsNoEvent` | One `folder.create` and one `asset.upload` event exist per key: only the process that wrote the row records it. | The library's history shows the same upload twice. | holds |
| `LoserLeavesNoFile` | The storage holds the file of the one asset row and no other: a process that lost the insert deletes its own file. | Storage keeps files no row points to. | holds |
| `NoDeclarationRefused` | No process refuses a folder declaration because another process wrote the folder (`a folder named ... already exists there`). | The losing replica's module fails to start or to provision. | holds |
| `BindingAclApplied` | The folder linked to the binding ends with the binding's ACL, including when another process wrote the folder first. | Members get the wrong access to the files of a field. | holds |

`TypeOK` holds too.

## Seeded bugs

`--seeded` applies each mutation in `SEEDED` (`check.mjs`) to a scratch copy of the spec. Each mutation mirrors a bug in the code, and its rules must break with the recorded counterexample lengths. The first, fourth and seventh are the code before #170, #173 and #174: the check fails on it.

| Mutation | The code bug it mirrors | Rules that break |
| --- | --- | --- |
| `declared-folder-under-a-random-id` | `createFolder` inserts a folder without `_id` (before #170) | `OneRowPerKey`, `NoDeclarationRefused` |
| `folder-loser-records-an-event` | `createFolder` records `folder.create` after a duplicate key | `LoserRecordsNoEvent` |
| `declaration-record-under-a-random-id` | `rememberDeclaration` inserts a record without `_id: targetId` | `OneRecordPerKey` |
| `declared-asset-under-a-random-id` | `insertAsset` inserts an asset without `_id` (before #173) | `OneRowPerKey`, `LoserRecordsNoEvent` |
| `asset-loser-keeps-its-stored-file` | `createAsset` skips `discardFile()` after a duplicate key | `LoserLeavesNoFile` |
| `asset-loser-records-an-upload-event` | `createAsset` records `asset.upload` after a duplicate key | `LoserRecordsNoEvent` |
| `provision-lists-then-inserts` | `provisionTenant` lists the folders, then inserts the missing ones under random ids (before #174); `seeded/provision-lists-then-inserts.tla` replaces the `provisioning` section | `OneRowPerKey` |
| `linked-folder-kept-without-its-acl` | `ensureBindingFolder` skips `folderModel.update(id, { json_acl })` after a duplicate key | `BindingAclApplied` |

When you change the spec, `MOVED` means a mutation's text is gone from it. Rewrite that mutation against the new text, so it still mirrors the same code bug.

## Read every result with /statechart

Read each TLC result with the pstack `/statechart` skill. It turns a broken rule into its shortest path in plain words, and a passing configuration into a chart. Copy `DeclaredRows.tla` and the configuration into a scratch folder outside the repo. Every configuration here is above its chart budget. For a chart of a passing model, use a copy of `bindings.cfg` with `Provisioners = {1, 2}`. For a broken rule, give it the configuration that broke, and it reports the path even above the budget. When `/statechart` needs Java and cannot install it, point it at the cached `tla2tools.jar` and a Java of your own, as its skill explains.

## Real bug or modeling error

Replay the counterexample against the code, one action per step, using the coverage record below. Each action is one `await` of the code. A step order is a modeling error when the code cannot produce it. Then fix the model, keep the rule, and say why in the change. Otherwise, reproduce it in a scratch integration test under `packages/dms-media/src/test/integration` (`pnpm --dir packages/dms-media test:integration`), the way `declared-folder-race.test.ts`, `declared-asset-race.test.ts` and `binding-folder-race.test.ts` stand in for the second process: seed the row it would have written, or hold the call at the step with a hook, then call the exported function. Assert only what a user observes: the rows through the models and the bytes in the storage. A real bug is a finding. Record it in `FINDINGS` (`check.mjs`) with its configuration and counterexample length, and in this file with its replay. Never weaken the rule or the model until it passes.

## Changing the model

- A diff that changes a covered function makes the check print `STALE`. Read the diff, change the action that maps to that code (see the coverage record) so the model does what the code now does, and rerun. A `BROKEN` rule after that is the diff's bug, unless the replay shows a modeling error.
- When a change adds a request that inserts, identifies, records or deletes declared rows, add an action for it, its function to `COVERED` in `coverage.mjs`, and a configuration that races it against the others.
- Once the model describes the code, commit the code and run `check.mjs --sync`. It records each covered function's fingerprint, and as the sync commit the last commit that changed the covered files. Run it only after you confirmed the model against the code; it refuses while a covered file has uncommitted changes.

## Coverage record

| Model action | Code |
| --- | --- |
| `FFind`, `FList`, `FInsert`, `FEvent`, `FRecord` | `ensureDeclaredFolder`, `applyFolderDeclaration`, `createFolder` (declared/folders.ts), `hasSiblingNamed` (routes/media/folders.ts) |
| `AFind`, `AWrite`, `AInsert`, `AGet`, `ADrop`, `AEvent`, `ARecord` | `importDeclaredAsset`, `applyAssetDeclaration`, `createAsset`, `insertAsset`, `writeFile` (declared/assets.ts) |
| `FolderId`, `AssetId`, `BindId`, `FolderRecordId`, `AssetRecordId` | `declaredId`, `rememberDeclaration` (declared/records.ts), `bindingFolderId` (bindings.ts), `fixedId` (fixed-id.ts) |
| `PRoot`, `PLink`, `PGet`, `PUpd` | `ensureTenantBindings`, `provisionTenant`, `ensureBindingFolder`, `insertOnce` (bindings.ts) |

`coverage-record.mjs` holds each covered function's fingerprint and the sync commit, `aef11f2`. That is the last commit that changed the covered code when the model was confirmed against it.

## Bounds and what is left out

The tenant has one declared folder key, one declared file key and one linked binding. The `Init` of the model starts either from an empty tenant or from one provisioned before, with the content root and the linked folder under the old ACL.

| Configuration | Processes racing | States |
| --- | --- | --- |
| `folders` | four `EnsureMediaFolder` | 14,038 |
| `assets` | four `ImportMediaAsset` | 11,138 |
| `bindings` | four `provisionTenant` | 641 |
| `mixed` | three `EnsureMediaFolder`, two `ImportMediaAsset`, two `provisionTenant` | 6,111,235 |

A pass covers these races and bounds only. The model leaves out:

- a process that stops between two steps: a winner that dies after inserting its row and before recording the event or the declaration record leaves no event, and a process that dies after storing its file and before the insert leaves that file on no row;
- storage and database failures, and a duplicate-key error on any row but the one the code tolerates;
- rows other than the ones modeled: two keys that share a folder name (the sibling check is modeled as "another row under this key's name"), a parent folder declared alongside, the target folder lookups, and the quota and image checks of an import, which read and write nothing the rules cover;
- an import into a binding folder, which calls `ensureTenantBindings` first: the model races the provisioning and the import as separate processes;
- rows written before #170, #173 and #174, which keep their random ids: the next declaration finds the record of a declared folder or file and keeps it, but `provisionTenant` writes a second content root and linked folder on a tenant that has them (stated in #174);
- members renaming, moving, editing the ACL of or deleting a declared row between the steps;
- the in-process locks, which the model leaves out so that two processes race as two replicas do.
