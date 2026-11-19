import type { AxiosInstance, AxiosResponse } from "axios";
import { expect } from "chai";
import sharp from "sharp";
import { z } from "zod";
import type { AclEntry } from "../../types";
import { type UploadedAsset, uploadAsset } from "./assets";
import { createdBody, readBody } from "./bodies";
import { writeFolderAcl } from "./folders";
import { createRole, type MemberSession, registerMember } from "./members";

const HTTP_OK = 200;
const HTTP_FORBIDDEN = 403;
const HTTP_NOT_FOUND = 404;
const HTTP_SUCCESS_BOUNDARY = 300;
const PROBE_SIZE_BYTES = 10;

/** What the bulk routes answer: the files done and the ones refused, each with its status. */
export const bulkBody = z.object({
  done: z.array(z.string()),
  refused: z.array(
    z.object({ id: z.string(), status: z.number(), message: z.string() }),
  ),
});

/** What reading one file answers, for the fields the access suites compare. */
export const assetDetailBody = z.object({
  asset: z.object({
    id: z.string(),
    folderId: z.string(),
    name: z.string(),
    alt: z.string().optional(),
    width: z.number().optional(),
    height: z.number().optional(),
    visibility: z.string(),
  }),
});

/** A member whose single role holds exactly `permissions`. */
export async function memberHolding(
  name: string,
  permissions: string[],
): Promise<MemberSession> {
  return registerMember(name, [await createRole(`${name}-role`, permissions)]);
}

/** What a member can do in a folder, observed through the routes: list it and presign an upload into it. */
export async function probeRights(
  client: AxiosInstance,
  folderId: string,
): Promise<{ read: boolean; write: boolean }> {
  const listed = await client.get(`/api/media/folders/${folderId}/assets`);
  const presign = await client.post("/api/media/upload/presign", {
    folderId,
    filename: "probe.png",
    size: PROBE_SIZE_BYTES,
    mimetype: "image/png",
  });
  return {
    read: listed.status === HTTP_OK,
    write: presign.status === HTTP_OK,
  };
}

/** A folder the owner creates under `parentId` whose own ACL gives `rights` to holders of `permission`. */
export async function aclFolder(
  owner: AxiosInstance,
  name: string,
  permission: string,
  rights: AclEntry["rights"],
  parentId?: string,
): Promise<string> {
  const created = await owner.post("/api/media/folders", { name, parentId });
  expect(created.status, `create folder ${name}`).to.equal(HTTP_OK);
  const folderId = readBody(created, createdBody).id;
  await writeFolderAcl(folderId, [
    { subject: { kind: "permission", id: permission }, rights },
  ]);
  return folderId;
}

/** Uploads a solid PNG of the given size. */
export async function uploadPng(
  client: AxiosInstance,
  folderId: string,
  name: string,
  size: { width: number; height: number },
): Promise<UploadedAsset> {
  const bytes = await sharp({
    create: { ...size, channels: 3, background: "#3366cc" },
  })
    .png()
    .toBuffer();
  return uploadAsset(client, folderId, name, "image/png", bytes);
}

/** Zips a folder the way the library's download button does. */
export function zipFolder(
  client: AxiosInstance,
  folderId: string,
): Promise<AxiosResponse<Buffer>> {
  return client.post(`/api/media/folders/${folderId}/zip`, undefined, {
    responseType: "arraybuffer",
  });
}

/** Whether a call was refused for lack of a right: 403, or 404 when the member may not see the target. */
export function isRefused(response: { status: number }): boolean {
  return (
    response.status === HTTP_FORBIDDEN || response.status === HTTP_NOT_FOUND
  );
}

/** Whether a call went through. */
export function isAllowed(response: { status: number }): boolean {
  return response.status >= HTTP_OK && response.status < HTTP_SUCCESS_BOUNDARY;
}
