import type { AxiosInstance } from "axios";
import { expect } from "chai";
import { createdBody, readBody } from "./bodies";

const HTTP_OK = 200;

/** Creates a folder through the API as the client, under `parentId` or at the root. */
export async function createFolder(
  client: AxiosInstance,
  name: string,
  parentId?: string,
): Promise<string> {
  const response = await client.post("/api/media/folders", { name, parentId });
  expect(response.status, `create folder ${name}`).to.equal(HTTP_OK);
  return readBody(response, createdBody).id;
}

/** Posts to an `/api/media` route and expects it to succeed. */
export async function postOk(
  client: AxiosInstance,
  path: string,
  body: Record<string, string | number | boolean | null> = {},
): Promise<void> {
  const response = await client.post(`/api/media${path}`, body);
  expect(response.status, `${path}: ${JSON.stringify(response.data)}`).to.equal(
    HTTP_OK,
  );
}

/** Deletes through an `/api/media` route and expects it to succeed. */
export async function deleteOk(
  client: AxiosInstance,
  path: string,
): Promise<void> {
  const response = await client.delete(`/api/media${path}`);
  expect(response.status, path).to.equal(HTTP_OK);
}
