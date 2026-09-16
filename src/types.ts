export type AclRight = "read" | "write" | "manage";

export type AclSubjectKind = "permission" | "role";

export interface AclSubject {
  kind: AclSubjectKind;
  id: string;
}

export interface AclEntry {
  subject: AclSubject;
  rights: AclRight[];
}

export type FolderVisibility = "private" | "public";

export type AssetVisibility = "inherit" | "private" | "public";
