import { GetModel } from "@antelopejs/interface-database-decorators";
import { DEFAULT_TENANT_ID } from "@antelopejs/interface-dms/constants";
import { parseFolderAcl, serializeAcl } from "../../acl";
import { MediaFolderModel } from "../../db";
import type { AclEntry } from "../../types";

/** The folder's own ACL as stored, or `undefined` when it inherits. */
export async function readFolderAcl(
  folderId: string,
): Promise<AclEntry[] | undefined> {
  const folder = await GetModel(MediaFolderModel, DEFAULT_TENANT_ID).get(
    folderId,
  );
  return folder ? parseFolderAcl(folder) : undefined;
}

/** Stores a folder's own ACL, as a binding does; `null` makes it inherit. */
export async function writeFolderAcl(
  folderId: string,
  entries: AclEntry[] | null,
): Promise<void> {
  await GetModel(MediaFolderModel, DEFAULT_TENANT_ID).update(folderId, {
    json_acl: serializeAcl(entries ?? undefined) ?? "",
  });
}
