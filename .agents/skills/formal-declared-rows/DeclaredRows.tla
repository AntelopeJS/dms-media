---------------------------- MODULE DeclaredRows ----------------------------
(***************************************************************************)
(* The rows one tenant gets for one declared key while several backend     *)
(* processes run the declaration at once: EnsureMediaFolder                *)
(* (declared/folders.ts), ImportMediaAsset (declared/assets.ts) and the    *)
(* provisioning of the asset bindings (bindings.ts). Every await of the    *)
(* code is one step, so TLC tries every order in which the processes       *)
(* interleave. The in-process locks (`withDeclarationLock`,                *)
(* `provisioningLocks`) serialize one process only, so the model leaves    *)
(* them out.                                                               *)
(*                                                                         *)
(* A row id is a number: `Fixed` is the id every process computes for the  *)
(* key (`declaredId`, `bindingFolderId`); a process p that lets the        *)
(* database pick an id gets the number p. A storage key is the number of   *)
(* the process that stored the file. A step that only reads a row no       *)
(* request deletes (`folderModel.get(id)` right after an insert or a       *)
(* duplicate key) is folded into the step before it.                       *)
(***************************************************************************)
EXTENDS Naturals, FiniteSets

CONSTANTS
  Folderers,    \* processes running EnsureMediaFolder for the key
  Importers,    \* processes running ImportMediaAsset for the key
  Provisioners  \* processes running provisionTenant for one binding

Procs == Folderers \cup Importers \cup Provisioners
Fixed == 0
NoFile == 0
Ids == {Fixed} \cup Procs
Acls == {"none", "old", "new"}

\* The id a process gives the row it inserts: declaredId (declared/records.ts)
\* and bindingFolderId (bindings.ts), both through fixedId (fixed-id.ts).
FolderId(p) == Fixed
AssetId(p) == Fixed
BindId(p) == Fixed

\* The id of the declaration record: rememberDeclaration (declared/records.ts)
\* gives it the target's id.
FolderRecordId(p) == FolderId(p)
AssetRecordId(p) == AssetId(p)

VARIABLES
  fRows,    \* media_folders rows of the declared folder, by id
  fRecs,    \* media_declarations records of the folder key, by id
  fLog,     \* processes that recorded a folder.create event
  aRows,    \* media_assets rows of the declared file, by id
  aKeyOf,   \* the stored file each asset row points to
  files,    \* the keys the file storage holds
  aRecs,    \* media_declarations records of the file key, by id
  aLog,     \* processes that recorded an asset.upload event
  root,     \* media_folders rows of the content root, by id
  link,     \* media_folders rows linked to the binding, by id, with their ACL
  pc,       \* where each process is
  won,      \* whether the process's asset insert was the one that wrote the row
  listing   \* what a process's last media_folders getAll() returned

foldVars == <<fRows, fRecs, fLog>>
assetVars == <<aRows, aKeyOf, files, aRecs, aLog>>
bindVars == <<root, link>>
procVars == <<pc, won, listing>>
vars == <<foldVars, assetVars, bindVars, procVars>>

\* The media_folders table as getAll() returns it.
Table == [decl |-> fRows, root |-> root, link |-> link]
EmptyTable == [decl |-> {}, root |-> {}, link |-> [i \in Ids |-> "none"]]

NoLink == [i \in Ids |-> "none"]

\* BEGIN provisioning
(***************************************************************************)
(* provisionTenant and ensureBindingFolder (bindings.ts): insert the       *)
(* content root, then the folder linked to the binding, each under its     *)
(* fixed id. A duplicate key on the linked folder reads the row and        *)
(* writes the binding's ACL when it differs.                               *)
(***************************************************************************)
ProvisionerStart == "p_root"

\* insertOnce of the content root: a duplicate key is ignored
PRoot(p) ==
  /\ pc[p] = "p_root"
  /\ root' = root \cup {BindId(p)}
  /\ pc' = [pc EXCEPT ![p] = "p_link"]
  /\ UNCHANGED <<foldVars, assetVars, link, won, listing>>

\* insertOnce of the linked folder, with the binding's ACL
PLink(p) ==
  /\ pc[p] = "p_link"
  /\ IF link[BindId(p)] = "none"
       THEN /\ link' = [link EXCEPT ![BindId(p)] = "new"]
            /\ pc' = [pc EXCEPT ![p] = "done"]
       ELSE /\ UNCHANGED link
            /\ pc' = [pc EXCEPT ![p] = "p_get"]
  /\ UNCHANGED <<foldVars, assetVars, root, won, listing>>

\* folderModel.get(id): the ACL differs from the binding's
PGet(p) ==
  /\ pc[p] = "p_get"
  /\ IF link[BindId(p)] # "new"
       THEN pc' = [pc EXCEPT ![p] = "p_upd"]
       ELSE pc' = [pc EXCEPT ![p] = "done"]
  /\ UNCHANGED <<foldVars, assetVars, bindVars, won, listing>>

\* folderModel.update(id, { json_acl })
PUpd(p) ==
  /\ pc[p] = "p_upd"
  /\ link' = [link EXCEPT ![BindId(p)] = "new"]
  /\ pc' = [pc EXCEPT ![p] = "done"]
  /\ UNCHANGED <<foldVars, assetVars, root, won, listing>>

ProvisionerStep(p) == PRoot(p) \/ PLink(p) \/ PGet(p) \/ PUpd(p)
\* END provisioning

Go(p, label) == pc' = [pc EXCEPT ![p] = label]

----------------------------------------------------------------------------
\* EnsureMediaFolder: applyFolderDeclaration and createFolder
\* (declared/folders.ts).

\* declarationModel.findByKey: a record means the key is kept
FFind(p) ==
  /\ pc[p] = "f_find"
  /\ IF fRecs # {} THEN Go(p, "done") ELSE Go(p, "f_list")
  /\ UNCHANGED <<foldVars, assetVars, bindVars, won, listing>>

\* folderModel.getAll, then hasSiblingNamed with the fixed id ignored: a row
\* of another id under the same name refuses the declaration
FList(p) ==
  /\ pc[p] = "f_list"
  /\ listing' = [listing EXCEPT ![p] = Table]
  /\ IF fRows \ {FolderId(p)} # {} THEN Go(p, "refused") ELSE Go(p, "f_insert")
  /\ UNCHANGED <<foldVars, assetVars, bindVars, won>>

\* folderModel.insert: a duplicate key keeps the row, with no event
FInsert(p) ==
  /\ pc[p] = "f_insert"
  /\ IF FolderId(p) \in fRows
       THEN Go(p, "f_record") /\ UNCHANGED fRows
       ELSE Go(p, "f_event") /\ fRows' = fRows \cup {FolderId(p)}
  /\ UNCHANGED <<fRecs, fLog, assetVars, bindVars, won, listing>>

\* recordMediaEvent folder.create
FEvent(p) ==
  /\ pc[p] = "f_event"
  /\ fLog' = fLog \cup {p}
  /\ Go(p, "f_record")
  /\ UNCHANGED <<fRows, fRecs, assetVars, bindVars, won, listing>>

\* rememberDeclaration: a duplicate key is ignored
FRecord(p) ==
  /\ pc[p] = "f_record"
  /\ fRecs' = fRecs \cup {FolderRecordId(p)}
  /\ Go(p, "done")
  /\ UNCHANGED <<fRows, fLog, assetVars, bindVars, won, listing>>

----------------------------------------------------------------------------
\* ImportMediaAsset: applyAssetDeclaration and createAsset
\* (declared/assets.ts), storing through storeNewFile (services/add-file.ts).

AFind(p) ==
  /\ pc[p] = "a_find"
  /\ IF aRecs # {} THEN Go(p, "done") ELSE Go(p, "a_write")
  /\ UNCHANGED <<foldVars, assetVars, bindVars, won, listing>>

\* storeNewFile: uploadStorageBytes of the file's bytes under a new key
AWrite(p) ==
  /\ pc[p] = "a_write"
  /\ files' = files \cup {p}
  /\ Go(p, "a_insert")
  /\ UNCHANGED <<foldVars, aRows, aKeyOf, aRecs, aLog, bindVars, won, listing>>

\* insertAsset: a duplicate key means another process wrote the row
AInsert(p) ==
  /\ pc[p] = "a_insert"
  /\ IF AssetId(p) \in aRows
       THEN /\ won' = [won EXCEPT ![p] = FALSE]
            /\ UNCHANGED <<aRows, aKeyOf>>
       ELSE /\ won' = [won EXCEPT ![p] = TRUE]
            /\ aRows' = aRows \cup {AssetId(p)}
            /\ aKeyOf' = [aKeyOf EXCEPT ![AssetId(p)] = p]
  /\ Go(p, "a_get")
  /\ UNCHANGED <<foldVars, files, aRecs, aLog, bindVars, listing>>

\* assetModel.get(id): the loser discards its file and returns `kept`
AGet(p) ==
  /\ pc[p] = "a_get"
  /\ IF won[p] THEN Go(p, "a_event") ELSE Go(p, "a_drop")
  /\ UNCHANGED <<foldVars, assetVars, bindVars, won, listing>>

\* DeleteFile of the process's own stored file
ADrop(p) ==
  /\ pc[p] = "a_drop"
  /\ files' = files \ {p}
  /\ Go(p, "a_record")
  /\ UNCHANGED <<foldVars, aRows, aKeyOf, aRecs, aLog, bindVars, won, listing>>

\* recordMediaEvent asset.upload
AEvent(p) ==
  /\ pc[p] = "a_event"
  /\ aLog' = aLog \cup {p}
  /\ Go(p, "a_record")
  /\ UNCHANGED <<foldVars, aRows, aKeyOf, files, aRecs, bindVars, won, listing>>

\* rememberDeclaration: a duplicate key is ignored
ARecord(p) ==
  /\ pc[p] = "a_record"
  /\ aRecs' = aRecs \cup {AssetRecordId(p)}
  /\ Go(p, "done")
  /\ UNCHANGED <<foldVars, aRows, aKeyOf, files, aLog, bindVars, won, listing>>

----------------------------------------------------------------------------

Init ==
  /\ fRows = {} /\ fRecs = {} /\ fLog = {}
  /\ aRows = {} /\ aKeyOf = [i \in Ids |-> NoFile] /\ files = {}
  /\ aRecs = {} /\ aLog = {}
  /\ \/ /\ root = {} /\ link = NoLink
     \/ /\ root = {Fixed} /\ link = [NoLink EXCEPT ![Fixed] = "old"]
  /\ pc = [p \in Procs |->
             IF p \in Folderers THEN "f_find"
             ELSE IF p \in Importers THEN "a_find" ELSE ProvisionerStart]
  /\ won = [p \in Procs |-> FALSE]
  /\ listing = [p \in Procs |-> EmptyTable]

Step(p) ==
  \/ FFind(p) \/ FList(p) \/ FInsert(p) \/ FEvent(p) \/ FRecord(p)
  \/ AFind(p) \/ AWrite(p) \/ AInsert(p) \/ AGet(p) \/ ADrop(p)
  \/ AEvent(p) \/ ARecord(p)
  \/ ProvisionerStep(p)

AtRest == \A p \in Procs: pc[p] \in {"done", "refused"}

\* every process finished; the state stays as it is
Finished == AtRest /\ UNCHANGED vars

Next == (\E p \in Procs: Step(p)) \/ Finished

Spec == Init /\ [][Next]_vars

----------------------------------------------------------------------------
\* The rules.

TypeOK ==
  /\ fRows \subseteq Ids /\ fRecs \subseteq Ids /\ fLog \subseteq Procs
  /\ aRows \subseteq Ids /\ aKeyOf \in [Ids -> Procs \cup {NoFile}]
  /\ files \subseteq Procs /\ aRecs \subseteq Ids /\ aLog \subseteq Procs
  /\ root \subseteq Ids /\ link \in [Ids -> Acls]
  /\ won \in [Procs -> BOOLEAN]

\* Once every process finished, the tenant has one row for the key: one
\* folder, one file, one content root and one folder linked to the binding.
OneRowPerKey ==
  AtRest =>
    /\ Folderers # {} => Cardinality(fRows) = 1
    /\ Importers # {} => Cardinality(aRows) = 1
    /\ Provisioners # {} =>
         /\ Cardinality(root) = 1
         /\ Cardinality({i \in Ids : link[i] # "none"}) = 1

\* ... and one declaration record for each key that was declared.
OneRecordPerKey ==
  AtRest =>
    /\ Folderers # {} => Cardinality(fRecs) = 1
    /\ Importers # {} => Cardinality(aRecs) = 1

\* ... and one event: only the process that wrote the row records it.
LoserRecordsNoEvent ==
  AtRest =>
    /\ Folderers # {} => Cardinality(fLog) = 1
    /\ Importers # {} => Cardinality(aLog) = 1

\* ... and the storage holds the file of that row and no other.
LoserLeavesNoFile ==
  AtRest /\ Importers # {} => files = {aKeyOf[i] : i \in aRows}

\* No process refuses a declaration because another process wrote the folder.
NoDeclarationRefused == \A p \in Procs: pc[p] # "refused"

\* The folder linked to the binding ends with the binding's ACL.
BindingAclApplied ==
  AtRest /\ Provisioners # {} => \A i \in Ids: link[i] \in {"none", "new"}
=============================================================================
