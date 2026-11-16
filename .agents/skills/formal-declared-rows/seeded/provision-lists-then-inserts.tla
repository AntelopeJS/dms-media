\* BEGIN provisioning
ProvisionerStart == "p_list"

\* folderModel.getAll, before the bindings.ts of #174
PList(p) ==
  /\ pc[p] = "p_list"
  /\ listing' = [listing EXCEPT ![p] = Table]
  /\ pc' = [pc EXCEPT ![p] = "p_root"]
  /\ UNCHANGED <<foldVars, assetVars, bindVars, won>>

\* ensureContentRoot: insert under a random id when the listing had none
PRoot(p) ==
  /\ pc[p] = "p_root"
  /\ IF listing[p].root = {}
       THEN root' = root \cup {p}
       ELSE UNCHANGED root
  /\ pc' = [pc EXCEPT ![p] = "p_link"]
  /\ UNCHANGED <<foldVars, assetVars, link, won, listing>>

\* ensureBindingFolder: update the listed row's ACL when it differs, else
\* insert under a random id
PLink(p) ==
  /\ pc[p] = "p_link"
  /\ IF \E i \in Ids : listing[p].link[i] # "none"
       THEN /\ UNCHANGED link
            /\ IF \E i \in Ids : listing[p].link[i] = "old"
                 THEN pc' = [pc EXCEPT ![p] = "p_upd"]
                 ELSE pc' = [pc EXCEPT ![p] = "done"]
       ELSE /\ link' = [link EXCEPT ![p] = "new"]
            /\ pc' = [pc EXCEPT ![p] = "done"]
  /\ UNCHANGED <<foldVars, assetVars, root, won, listing>>

PUpd(p) ==
  /\ pc[p] = "p_upd"
  /\ link' = [link EXCEPT ![CHOOSE i \in Ids : listing[p].link[i] # "none"] = "new"]
  /\ pc' = [pc EXCEPT ![p] = "done"]
  /\ UNCHANGED <<foldVars, assetVars, root, won, listing>>

ProvisionerStep(p) == PList(p) \/ PRoot(p) \/ PLink(p) \/ PUpd(p)
\* END provisioning
