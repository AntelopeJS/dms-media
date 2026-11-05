----------------------------- MODULE AssetFiles -----------------------------
(***************************************************************************)
(* The stored files of one media asset while requests race on it:          *)
(* derivative generation (an image size requested for the first time),     *)
(* Save in the image editor, Revert to original, delete, and the nightly    *)
(* derivative sweep. Every await of the code is one step, so TLC tries      *)
(* every order in which the requests can interleave.                        *)
(*                                                                          *)
(* `row` is the media_assets row, with only its file fields. `storage` is   *)
(* the set of keys the file storage holds. A key stands for one stored      *)
(* file; `srcOf[k]` is the key whose image the file k shows, so a size      *)
(* rendered from an older image is visible in the model.                    *)
(***************************************************************************)
EXTENDS Naturals, FiniteSets

CONSTANTS
  Derivers,     \* requests of the image size Preset (delivery.ts, assets.ts)
  Editors,      \* Save of an image edit (routes/media/transform.ts transform)
  Reverters,    \* Revert to original (routes/media/transform.ts revert)
  Deleters,     \* file deletion (asset-actions.ts, folders.ts)
  Sweepers,     \* the sweep cron (crons/sweep-derivatives.ts)
  Preset,       \* an image size the configuration declares
  StalePreset,  \* an image size the configuration no longer declares
  MaxKeys       \* how many distinct stored files the run may create

Procs == Derivers \cup Editors \cup Reverters \cup Deleters \cup Sweepers
Presets == {Preset, StalePreset}
NoKey == 0
KeyIds == 1..MaxKeys
NoDerivs == [q \in Presets |-> NoKey]

VARIABLES
  row,      \* the media_assets row
  storage,  \* the keys the file storage holds
  srcOf,    \* the image each stored key shows
  nextKey,  \* the next fresh key (randomUUID in the storage path)
  pc,       \* where each request is
  snap,     \* the asset a request read first and works from
  obs,      \* the row a request read last, for its compare-and-set
  mine,     \* the key a request wrote and has not published yet
  todo,     \* the retired keys a cleanup still walks
  cur,      \* the retired key a cleanup is on
  refused   \* a request failed on "Cannot publish a retired media file"

vars == <<row, storage, srcOf, nextKey, pc, snap, obs, mine, todo, cur, refused>>

Rows == [exists: BOOLEAN, rev: Nat, sk: KeyIds, ok: KeyIds \cup {NoKey},
         derivs: [Presets -> KeyIds \cup {NoKey}], retired: SUBSET KeyIds,
         deleting: BOOLEAN]

\* collectAssetStorageKeys (routes/media/storage-keys.ts)
KeysOf(r) ==
  {r.sk} \cup (IF r.ok = NoKey THEN {} ELSE {r.ok})
    \cup {r.derivs[q] : q \in {p \in Presets : r.derivs[p] # NoKey}}

\* updateAssetMedia: a deleting row publishes nothing (asset-lifecycle.ts)
Live(next) == IF next.deleting THEN {} ELSE KeysOf(next)

Plain ==
  [exists |-> TRUE, rev |-> 0, sk |-> 1, ok |-> NoKey,
   derivs |-> [NoDerivs EXCEPT ![StalePreset] = 2],
   retired |-> {}, deleting |-> FALSE]

Edited ==
  [exists |-> TRUE, rev |-> 0, sk |-> 2, ok |-> 1,
   derivs |-> [NoDerivs EXCEPT ![StalePreset] = 3],
   retired |-> {}, deleting |-> FALSE]

Init ==
  /\ \/ /\ row = Plain
        /\ storage = {1, 2}
        /\ srcOf = [k \in KeyIds |-> IF k \in {1, 2} THEN 1 ELSE NoKey]
        /\ nextKey = 3
     \/ /\ row = Edited
        /\ storage = {1, 2, 3}
        /\ srcOf = [k \in KeyIds |-> CASE k = 1 -> 1 [] k \in {2, 3} -> 2
                                       [] OTHER -> NoKey]
        /\ nextKey = 4
  /\ pc = [p \in Procs |->
             CASE p \in Derivers -> "d_get" [] p \in Editors -> "e_get"
               [] p \in Reverters -> "r_get" [] p \in Deleters -> "x_get"
               [] p \in Sweepers -> "s_get"]
  /\ snap = [p \in Procs |-> row]
  /\ obs = [p \in Procs |-> row]
  /\ mine = [p \in Procs |-> NoKey]
  /\ todo = [p \in Procs |-> {}]
  /\ cur = [p \in Procs |-> NoKey]
  /\ refused = FALSE

Go(p, label) == pc' = [pc EXCEPT ![p] = label]
Got(p) == obs' = [obs EXCEPT ![p] = row]
Snapped(p) == snap' = [snap EXCEPT ![p] = row]

\* WriteFile of a new key (uploadStorageBytes, derivatives.ts)
Write(p, shows) ==
  /\ nextKey' = nextKey + 1
  /\ storage' = storage \cup {nextKey}
  /\ srcOf' = [srcOf EXCEPT ![nextKey] = IF shows = NoKey THEN nextKey ELSE shows]
  /\ mine' = [mine EXCEPT ![p] = nextKey]

\* DeleteFile of the request's own unpublished key
DropMine(p) == storage' = storage \ {mine[p]}

(***************************************************************************)
(* updateAssetMedia then compareMedia (asset-lifecycle.ts,                 *)
(* db/models/mediaAssets.model.ts): `next` is the observed row with the    *)
(* patch. Applied when the row still has the observed mediaRevision.       *)
(***************************************************************************)
Publish(p, next, onApplied, onStale) ==
  LET o == obs[p]
      live == Live(next)
  IN  IF o.deleting THEN Go(p, onStale) /\ UNCHANGED <<row, refused>>
      ELSE IF o.retired \cap live # {}
        THEN Go(p, "failed") /\ refused' = TRUE /\ UNCHANGED row
      ELSE IF row.exists /\ row.rev = o.rev
        THEN /\ row' = [next EXCEPT !.rev = row.rev + 1,
                         !.retired = o.retired \cup (KeysOf(o) \ live)]
             /\ Go(p, onApplied)
             /\ UNCHANGED refused
      ELSE Go(p, onStale) /\ UNCHANGED <<row, refused>>

----------------------------------------------------------------------------
\* Derivative generation: ensureDerivative, generateDerivative and
\* commitDerivative (derivatives.ts).

DGet(p) ==
  /\ pc[p] = "d_get"
  /\ IF ~row.exists \/ row.deleting \/ row.derivs[Preset] # NoKey
       THEN Go(p, "done") /\ UNCHANGED snap
       ELSE Go(p, "d_read") /\ Snapped(p)
  /\ UNCHANGED <<row, storage, srcOf, nextKey, obs, mine, todo, cur, refused>>

\* downloadStorageBytes(asset.storageKey) then WriteFile of the rendering
DRead(p) ==
  /\ pc[p] = "d_read"
  /\ IF snap[p].sk \in storage THEN Go(p, "d_write") ELSE Go(p, "failed")
  /\ UNCHANGED <<row, storage, srcOf, nextKey, snap, obs, mine, todo, cur, refused>>

DWrite(p) ==
  /\ pc[p] = "d_write"
  /\ Write(p, snap[p].sk)
  /\ Go(p, "c_get")
  /\ UNCHANGED <<row, snap, obs, todo, cur, refused>>

CGet(p) ==
  /\ pc[p] = "c_get"
  /\ CASE ~row.exists \/ row.deleting \/ row.sk # snap[p].sk
            -> Go(p, "c_discard") /\ UNCHANGED obs
       [] row.derivs[Preset] = mine[p] -> Go(p, "done") /\ UNCHANGED obs
       [] row.derivs[Preset] # NoKey -> Go(p, "c_drop") /\ UNCHANGED obs
       [] OTHER -> Go(p, "c_cas") /\ Got(p)
  /\ UNCHANGED <<row, storage, srcOf, nextKey, snap, mine, todo, cur, refused>>

CCas(p) ==
  /\ pc[p] = "c_cas"
  /\ Publish(p, [obs[p] EXCEPT !.derivs[Preset] = mine[p]], "done", "c_get")
  /\ UNCHANGED <<storage, srcOf, nextKey, snap, obs, mine, todo, cur>>

\* another request published this size first
CDrop(p) ==
  /\ pc[p] = "c_drop"
  /\ DropMine(p)
  /\ Go(p, "done")
  /\ UNCHANGED <<row, srcOf, nextKey, snap, obs, mine, todo, cur, refused>>

\* the image changed or is being deleted: commitDerivative returns undefined
CDiscard(p) ==
  /\ pc[p] = "c_discard"
  /\ DropMine(p)
  /\ Go(p, "g_get")
  /\ UNCHANGED <<row, srcOf, nextKey, snap, obs, mine, todo, cur, refused>>

\* generateDerivative renders again from the fresh asset
GGet(p) ==
  /\ pc[p] = "g_get"
  /\ IF ~row.exists \/ row.deleting
       THEN Go(p, "failed") /\ UNCHANGED snap
       ELSE Go(p, "d_read") /\ Snapped(p)
  /\ UNCHANGED <<row, storage, srcOf, nextKey, obs, mine, todo, cur, refused>>

----------------------------------------------------------------------------
\* Save and Revert: the routes, applyImageTransform, revertImageTransform and
\* commitTransform (transform.ts, routes/media/transform.ts).

EGet(p) ==
  /\ pc[p] = "e_get"
  /\ IF ~row.exists \/ row.deleting
       THEN Go(p, "done") /\ UNCHANGED snap
       ELSE Go(p, "e_read") /\ Snapped(p)
  /\ UNCHANGED <<row, storage, srcOf, nextKey, obs, mine, todo, cur, refused>>

\* renderAssetTransform reads originalKey || storageKey
ERead(p) ==
  /\ pc[p] = "e_read"
  /\ IF (IF snap[p].ok # NoKey THEN snap[p].ok ELSE snap[p].sk) \in storage
       THEN Go(p, "e_write") ELSE Go(p, "failed")
  /\ UNCHANGED <<row, storage, srcOf, nextKey, snap, obs, mine, todo, cur, refused>>

EWrite(p) ==
  /\ pc[p] = "e_write"
  /\ Write(p, NoKey)
  /\ Go(p, "t_get")
  /\ UNCHANGED <<row, snap, obs, todo, cur, refused>>

RGet(p) ==
  /\ pc[p] = "r_get"
  /\ IF ~row.exists \/ row.deleting \/ row.ok = NoKey
       THEN Go(p, "done") /\ UNCHANGED snap
       ELSE Go(p, "r_read") /\ Snapped(p)
  /\ UNCHANGED <<row, storage, srcOf, nextKey, obs, mine, todo, cur, refused>>

\* downloadStorageBytes(asset.originalKey)
RRead(p) ==
  /\ pc[p] = "r_read"
  /\ IF snap[p].ok \in storage THEN Go(p, "t_get") ELSE Go(p, "failed")
  /\ UNCHANGED <<row, storage, srcOf, nextKey, snap, obs, mine, todo, cur, refused>>

\* MediaAssetChangedError when the image changed since the request read it
TGet(p) ==
  /\ pc[p] = "t_get"
  /\ IF ~row.exists \/ row.deleting \/ row.sk # snap[p].sk
       THEN Go(p, IF p \in Editors THEN "e_discard" ELSE "done") /\ UNCHANGED obs
       ELSE Go(p, "t_cas") /\ Got(p)
  /\ UNCHANGED <<row, storage, srcOf, nextKey, snap, mine, todo, cur, refused>>

\* originalPatch(asset) reads the first snapshot, not the fresh row
SavePatch(p) ==
  [obs[p] EXCEPT !.sk = mine[p],
                 !.ok = IF snap[p].ok # NoKey THEN snap[p].ok ELSE snap[p].sk,
                 !.derivs = NoDerivs]

RevertPatch(p) ==
  [obs[p] EXCEPT !.sk = snap[p].ok, !.ok = NoKey, !.derivs = NoDerivs]

TCas(p) ==
  /\ pc[p] = "t_cas"
  /\ Publish(p, IF p \in Editors THEN SavePatch(p) ELSE RevertPatch(p),
             "cl_start", "t_get")
  /\ UNCHANGED <<storage, srcOf, nextKey, snap, obs, mine, todo, cur>>

EDiscard(p) ==
  /\ pc[p] = "e_discard"
  /\ DropMine(p)
  /\ Go(p, "done")
  /\ UNCHANGED <<row, srcOf, nextKey, snap, obs, mine, todo, cur, refused>>

----------------------------------------------------------------------------
\* deleteMediaAsset (asset-lifecycle.ts): tombstone, then cleanup.

XGet(p) ==
  /\ pc[p] = "x_get"
  /\ CASE ~row.exists -> Go(p, "done") /\ UNCHANGED obs
       [] row.deleting -> Go(p, "cl_start") /\ UNCHANGED obs
       [] OTHER -> Go(p, "x_cas") /\ Got(p)
  /\ UNCHANGED <<row, storage, srcOf, nextKey, snap, mine, todo, cur, refused>>

XCas(p) ==
  /\ pc[p] = "x_cas"
  /\ Publish(p, [obs[p] EXCEPT !.deleting = TRUE], "cl_start", "x_get")
  /\ UNCHANGED <<storage, srcOf, nextKey, snap, obs, mine, todo, cur>>

----------------------------------------------------------------------------
\* sweepAssetDerivatives (crons/sweep-derivatives.ts).

SGet(p) ==
  /\ pc[p] = "s_get"
  /\ IF ~row.exists \/ row.deleting \/ row.derivs[StalePreset] = NoKey
       THEN Go(p, "cl_start") /\ UNCHANGED obs
       ELSE Go(p, "s_cas") /\ Got(p)
  /\ UNCHANGED <<row, storage, srcOf, nextKey, snap, mine, todo, cur, refused>>

SCas(p) ==
  /\ pc[p] = "s_cas"
  /\ Publish(p, [obs[p] EXCEPT !.derivs[StalePreset] = NoKey], "cl_start", "s_get")
  /\ UNCHANGED <<storage, srcOf, nextKey, snap, obs, mine, todo, cur>>

----------------------------------------------------------------------------
\* cleanupAssetFiles and acknowledgeFile (asset-lifecycle.ts).

ClStart(p) ==
  /\ pc[p] = "cl_start"
  /\ IF ~row.exists
       THEN Go(p, "done") /\ UNCHANGED todo
       ELSE Go(p, "cl_next") /\ todo' = [todo EXCEPT ![p] = row.retired]
  /\ UNCHANGED <<row, storage, srcOf, nextKey, snap, obs, mine, cur, refused>>

\* the code walks json_retiredFiles in array order; the model takes the lowest key
ClNext(p) ==
  /\ pc[p] = "cl_next"
  /\ IF todo[p] = {}
       THEN Go(p, "cl_final") /\ UNCHANGED <<todo, cur>>
       ELSE LET k == CHOOSE k \in todo[p]: \A j \in todo[p]: k <= j
            IN  /\ todo' = [todo EXCEPT ![p] = @ \ {k}]
                /\ cur' = [cur EXCEPT ![p] = k]
                /\ Go(p, "cl_check")
  /\ UNCHANGED <<row, storage, srcOf, nextKey, snap, obs, mine, refused>>

\* skip a key already acknowledged, or one the asset uses again
ClCheck(p) ==
  /\ pc[p] = "cl_check"
  /\ IF \/ ~row.exists
        \/ cur[p] \notin row.retired
        \/ (~row.deleting /\ cur[p] \in KeysOf(row))
       THEN Go(p, "cl_next") ELSE Go(p, "cl_delete")
  /\ UNCHANGED <<row, storage, srcOf, nextKey, snap, obs, mine, todo, cur, refused>>

\* FileExists then DeleteFile
ClDelete(p) ==
  /\ pc[p] = "cl_delete"
  /\ storage' = storage \ {cur[p]}
  /\ Go(p, "ack_get")
  /\ UNCHANGED <<row, srcOf, nextKey, snap, obs, mine, todo, cur, refused>>

AckGet(p) ==
  /\ pc[p] = "ack_get"
  /\ IF ~row.exists \/ cur[p] \notin row.retired
       THEN Go(p, "cl_next") /\ UNCHANGED obs
       ELSE Go(p, "ack_cas") /\ Got(p)
  /\ UNCHANGED <<row, storage, srcOf, nextKey, snap, mine, todo, cur, refused>>

\* compareMedia of json_retiredFiles alone, outside updateAssetMedia
AckCas(p) ==
  /\ pc[p] = "ack_cas"
  /\ IF row.exists /\ row.rev = obs[p].rev
       THEN /\ row' = [obs[p] EXCEPT !.rev = row.rev + 1,
                        !.retired = obs[p].retired \ {cur[p]}]
            /\ Go(p, "cl_next")
       ELSE Go(p, "ack_get") /\ UNCHANGED row
  /\ UNCHANGED <<storage, srcOf, nextKey, snap, obs, mine, todo, cur, refused>>

ClFinal(p) ==
  /\ pc[p] = "cl_final"
  /\ IF row.exists /\ row.deleting /\ row.retired = {}
       THEN Go(p, "cl_drop") /\ Got(p)
       ELSE Go(p, "done") /\ UNCHANGED obs
  /\ UNCHANGED <<row, storage, srcOf, nextKey, snap, mine, todo, cur, refused>>

\* deleteCleanedAsset (db/models/mediaAssets.model.ts)
ClDrop(p) ==
  /\ pc[p] = "cl_drop"
  /\ IF row.exists /\ row.rev = obs[p].rev
       THEN row' = [row EXCEPT !.exists = FALSE]
       ELSE UNCHANGED row
  /\ Go(p, "done")
  /\ UNCHANGED <<storage, srcOf, nextKey, snap, obs, mine, todo, cur, refused>>

----------------------------------------------------------------------------

Step(p) ==
  \/ DGet(p) \/ DRead(p) \/ DWrite(p) \/ CGet(p) \/ CCas(p) \/ CDrop(p)
  \/ CDiscard(p) \/ GGet(p)
  \/ EGet(p) \/ ERead(p) \/ EWrite(p) \/ RGet(p) \/ RRead(p) \/ TGet(p)
  \/ TCas(p) \/ EDiscard(p)
  \/ XGet(p) \/ XCas(p) \/ SGet(p) \/ SCas(p)
  \/ ClStart(p) \/ ClNext(p) \/ ClCheck(p) \/ ClDelete(p) \/ AckGet(p)
  \/ AckCas(p) \/ ClFinal(p) \/ ClDrop(p)

AtRest == \A p \in Procs: pc[p] \in {"done", "failed"}

\* every request has finished; the state stays as it is
Finished == AtRest /\ UNCHANGED vars

Next == (\E p \in Procs: Step(p)) \/ Finished

Spec == Init /\ [][Next]_vars

(***************************************************************************)
(* TLC treats two states as one when they differ only in a value no later  *)
(* step reads: a request's locals outside the steps that read them, which  *)
(* image a key no longer stored showed, and the revision numbers. Every    *)
(* step compares a revision only with the row's own, and every write of    *)
(* the row moves it, so "the row a request read is still current" is all   *)
(* a revision tells.                                                       *)
(***************************************************************************)
Unrev(r) == [r EXCEPT !.rev = 0]
SeenRow(p) == <<obs[p].rev = row.rev, Unrev(obs[p])>>

ReadsSnap == {"d_read", "d_write", "c_get", "c_cas", "e_read", "e_write",
              "r_read", "t_get", "t_cas"}
ReadsObs == {"c_cas", "t_cas", "x_cas", "s_cas", "ack_cas", "cl_drop"}
ReadsMine == {"c_get", "c_cas", "c_drop", "c_discard", "t_get", "t_cas",
              "e_discard"}
ReadsCur == {"cl_check", "cl_delete", "ack_get", "ack_cas"}
ReadsTodo == ReadsCur \cup {"cl_next"}

Kept(p, labels, value, none) == IF pc[p] \in labels THEN value ELSE none

Locals(p) ==
  <<pc[p],
    Kept(p, ReadsSnap, <<snap[p].sk, snap[p].ok>>, <<>>),
    Kept(p, ReadsObs, SeenRow(p), <<>>),
    Kept(p, ReadsMine, mine[p], NoKey),
    Kept(p, ReadsCur, cur[p], NoKey),
    Kept(p, ReadsTodo, todo[p], {})>>

Shown == [k \in storage \cup KeysOf(row) |-> srcOf[k]]

View == <<Unrev(row), storage, Shown, nextKey, refused, [p \in Procs |-> Locals(p)]>>

----------------------------------------------------------------------------
\* The rules.


TypeOK ==
  /\ row \in Rows
  /\ storage \subseteq KeyIds
  /\ nextKey \in 1..(MaxKeys + 1)

\* A file the asset points to (its image, its original, its sizes) is stored.
LiveFilesStored ==
  row.exists /\ ~row.deleting => KeysOf(row) \subseteq storage

\* Every image size shows the asset's current image, never an older one.
SizesShowCurrentImage ==
  row.exists /\ ~row.deleting =>
    \A q \in Presets: row.derivs[q] # NoKey => srcOf[row.derivs[q]] = row.sk

\* No request fails because it would publish a file queued for deletion.
NoRetiredFilePublished == ~refused

\* Once every request finished, the storage holds exactly the asset's files,
\* no deletion is left queued, and a deleted asset has left no file and no row.
NothingLeftBehind ==
  AtRest =>
    IF row.exists
      THEN storage = KeysOf(row) /\ row.retired = {} /\ ~row.deleting
      ELSE storage = {}
=============================================================================
