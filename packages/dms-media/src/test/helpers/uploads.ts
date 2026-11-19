import type { AxiosInstance, AxiosResponse } from "axios";
import { expect } from "chai";
import { z } from "zod";
import { putPresigned } from "./assets";
import { presignBody, readBody } from "./bodies";

const HTTP_OK = 200;
const HTTP_REDIRECT_BOUNDARY = 300;

/** A file the storage holds under a staging key, waiting for its confirm. */
export interface StagedUpload {
  resourceKey: string;
}

/** What a refused upload answers: the status, a reason and a readable message. */
export interface Refusal {
  status: number;
  data: {
    reason?: string;
    message?: string;
    quota?: number;
    remaining?: number;
    accepted?: string[];
  };
}

export function presign(
  client: AxiosInstance,
  folderId: string,
  filename: string,
  mimetype: string,
  size = 4,
): Promise<AxiosResponse> {
  return client.post("/api/media/upload/presign", {
    folderId,
    filename,
    size,
    mimetype,
  });
}

/** Presigns and PUTs the bytes, the first two steps of an upload. */
export async function stage(
  client: AxiosInstance,
  folderId: string,
  file: { filename: string; mimetype: string; body: Buffer },
): Promise<StagedUpload> {
  const presigned = await presign(
    client,
    folderId,
    file.filename,
    file.mimetype,
    file.body.byteLength,
  );
  expect(presigned.status, "presign").to.equal(HTTP_OK);
  const target = readBody(presigned, presignBody);
  const put = await putPresigned(target, file.body);
  expect(put.status, "storage PUT").to.be.lessThan(HTTP_REDIRECT_BOUNDARY);
  return { resourceKey: target.resourceKey };
}

export function confirm(
  client: AxiosInstance,
  folderId: string,
  resourceKey: string,
  filename: string,
): Promise<AxiosResponse> {
  return client.post("/api/media/upload/confirm", {
    folderId,
    resourceKey,
    filename,
  });
}

/** Bytes the library holds, as the overview's storage meter reports them. */
export async function storedBytes(client: AxiosInstance): Promise<number> {
  const response = await client.get("/api/media/stats/storage");
  expect(response.status).to.equal(HTTP_OK);
  return readBody(response, z.object({ value: z.number() })).value;
}

/** Asserts the documented refusal body: status, reason and a non-empty message. */
export function expectRefusal(
  response: Refusal,
  expected: { status: number; reason: string },
  label: string,
): void {
  expect(response.status, label).to.equal(expected.status);
  expect(response.data.reason, label).to.equal(expected.reason);
  expect(response.data.message, label).to.be.a("string");
  expect(response.data.message, label).to.not.equal("");
}
