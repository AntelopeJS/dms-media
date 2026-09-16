import axios, { type AxiosInstance } from "axios";
import { expect } from "chai";
import { getBaseUrl } from "./http";

const HTTP_OK = 200;
const HTTP_REDIRECT_BOUNDARY = 300;

export const PNG_NAME = "pixel.png";
export const PNG_MIMETYPE = "image/png";
export const ONE_PIXEL_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

export interface UploadedAsset {
  id: string;
  folderId: string;
  name: string;
  width?: number;
  height?: number;
  url: string;
}

export interface RawRedirectResponse {
  status: number;
  location: string | null;
  cacheControl: string | null;
}

export async function uploadAsset(
  client: AxiosInstance,
  folderId: string,
  filename: string,
  mimetype: string,
  body: Buffer,
): Promise<UploadedAsset> {
  const presign = await client.post("/api/media/upload/presign", {
    folderId,
    filename,
    size: body.byteLength,
    mimetype,
  });
  expect(presign.status, "presign").to.equal(HTTP_OK);
  const put = await axios.put(presign.data.uploadUrl, body, {
    headers: presign.data.headers,
    validateStatus: () => true,
    transformRequest: [(data) => data],
  });
  expect(put.status, "storage PUT").to.be.lessThan(HTTP_REDIRECT_BOUNDARY);
  const confirm = await client.post("/api/media/upload/confirm", {
    folderId,
    resourceKey: presign.data.resourceKey,
    filename,
  });
  expect(confirm.status, "confirm").to.equal(HTTP_OK);
  return confirm.data.asset;
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
