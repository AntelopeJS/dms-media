import { GetModel } from "@antelopejs/interface-database-decorators";
import { DEFAULT_TENANT_ID } from "@antelopejs/interface-dms/constants";
import type { AxiosInstance } from "axios";
import { z } from "zod";
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

const folderNodeSchema = z.object({
  id: z.string(),
  name: z.string(),
  parentId: z.string().nullable(),
  binding: z.string().nullable(),
  bound: z.boolean(),
  acceptsSubfolders: z.boolean(),
  accepts: z.array(z.string()).nullable(),
});

export type FolderNode = z.infer<typeof folderNodeSchema>;

/** What `/api/media/tree` answers, checked against the fields the suites read. */
export const folderTreeBody = z.object({ folders: z.array(folderNodeSchema) });

/** The folders `/api/media/tree` answers. */
export async function fetchFolderNodes(
  client: AxiosInstance,
): Promise<FolderNode[]> {
  const response = await client.get("/api/media/tree");
  return folderTreeBody.parse(response.data).folders;
}
