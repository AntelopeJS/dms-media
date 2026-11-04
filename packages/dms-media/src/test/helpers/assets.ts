import axios, { type AxiosInstance } from "axios";
import { expect } from "chai";
import { z } from "zod";
import { presignBody, readBody } from "./bodies";
import { getBaseUrl } from "./http";

const HTTP_OK = 200;
const HTTP_REDIRECT_BOUNDARY = 300;

export const PNG_NAME = "pixel.png";
export const PNG_MIMETYPE = "image/png";
export const ONE_PIXEL_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

const uploadedAssetBody = z.object({
  id: z.string(),
  folderId: z.string(),
  name: z.string(),
  width: z.number().nullish(),
  height: z.number().nullish(),
  url: z.string(),
});

export type UploadedAsset = z.infer<typeof uploadedAssetBody>;

export interface RawRedirectResponse {
  status: number;
  location: string | null;
  cacheControl: string | null;
}

export interface BatchFile {
  filename: string;
  mimetype: string;
  body: Buffer;
  batchId?: string;
}

/** Sends the bytes to the storage URL a presign answered, the way a browser does. */
export function putPresigned(
  presign: z.infer<typeof presignBody>,
  body: Buffer,
) {
  return axios.put(presign.uploadUrl, body, {
    headers: presign.headers,
    validateStatus: () => true,
    transformRequest: [(data: Buffer) => data],
  });
}

export function uploadAsset(
  client: AxiosInstance,
  folderId: string,
  filename: string,
  mimetype: string,
  body: Buffer,
): Promise<UploadedAsset> {
  return uploadAssetInBatch(client, folderId, { filename, mimetype, body });
}

export async function uploadAssetInBatch(
  client: AxiosInstance,
  folderId: string,
  file: BatchFile,
): Promise<UploadedAsset> {
  const { filename, mimetype, body, batchId } = file;
  const presign = await client.post("/api/media/upload/presign", {
    folderId,
    filename,
    size: body.byteLength,
    mimetype,
  });
  expect(presign.status, "presign").to.equal(HTTP_OK);
  const presigned = readBody(presign, presignBody);
  const put = await putPresigned(presigned, body);
  expect(put.status, "storage PUT").to.be.lessThan(HTTP_REDIRECT_BOUNDARY);
  const confirm = await client.post("/api/media/upload/confirm", {
    folderId,
    resourceKey: presigned.resourceKey,
    filename,
    batchId,
  });
  expect(confirm.status, "confirm").to.equal(HTTP_OK);
  return readBody(confirm, z.object({ asset: uploadedAssetBody })).asset;
}

export function uploadPixelPng(
  client: AxiosInstance,
  folderId: string,
): Promise<UploadedAsset> {
  return uploadAsset(client, folderId, PNG_NAME, PNG_MIMETYPE, ONE_PIXEL_PNG);
}

export function uploadTextAsset(
  client: AxiosInstance,
  folderId: string,
  filename: string,
): Promise<UploadedAsset> {
  return uploadAsset(
    client,
    folderId,
    filename,
    "text/plain",
    Buffer.from(`content of ${filename}`),
  );
}

export async function rawGet(
  path: string,
  token?: string,
): Promise<RawRedirectResponse> {
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(`${getBaseUrl()}${path}`, {
    redirect: "manual",
    headers,
  });
  return {
    status: response.status,
    location: response.headers.get("location"),
    cacheControl: response.headers.get("cache-control"),
  };
}
