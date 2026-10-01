/** Right granted by an ACL entry. Rights imply weaker ones: `manage ⇒ write ⇒ read`. */
export type AclRight = "read" | "write" | "manage";

/** What an ACL entry grants its rights to: holders of a permission, or members of a role. */
export type AclSubjectKind = "permission" | "role";

export interface AclSubject {
  kind: AclSubjectKind;
  id: string;
}

/** One entry of a media folder ACL. */
export interface AclEntry {
  subject: AclSubject;
  rights: AclRight[];
}
