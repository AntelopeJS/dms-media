import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { assert, expect } from "chai";
import { z } from "zod";
import { getBaseUrl } from "./http";

const HTTP_FOUND = 302;
const MS_PER_SECOND = 1000;

/** What a request to the delivery route, or to the storage it redirects to, answered. */
export interface Delivery {
  status: number;
  headers: Headers;
  body: Buffer;
}

async function readResponse(response: Response): Promise<Delivery> {
  return {
    status: response.status,
    headers: response.headers,
    body: Buffer.from(await response.arrayBuffer()),
  };
}

/** One request to the API, redirects left unfollowed. */
export async function deliver(
  path: string,
  headers: Record<string, string> = {},
  method = "GET",
): Promise<Delivery> {
  return readResponse(
    await fetch(`${getBaseUrl()}${path}`, {
      method,
      redirect: "manual",
      headers,
    }),
  );
}

/** Follows the delivery redirect to the storage and returns the stored bytes. */
export async function follow(
  path: string,
  headers: Record<string, string> = {},
): Promise<Delivery> {
  const redirect = await deliver(path, headers);
  expect(redirect.status, path).to.equal(HTTP_FOUND);
  const location = redirect.headers.get("location");
  assert.isNotNull(location, path);
  return readResponse(await fetch(location));
}

const readTokenBody = z.object({ expiresAt: z.number() });

/**
 * Seconds a signed storage URL stays valid, read from the token record the
 * local storage keeps for it.
 */
export async function signedLifetimeSeconds(location: string): Promise<number> {
  const token = new URL(location).searchParams.get("token");
  assert.isNotNull(token, location);
  const storageDir = process.env.TEST_STORAGE_DIR;
  assert.isDefined(storageDir, "TEST_STORAGE_DIR");
  const record = readTokenBody.parse(
    JSON.parse(
      await readFile(
        join(storageDir, "tokens", "read", `${token}.json`),
        "utf8",
      ),
    ),
  );
  return Math.round((record.expiresAt - Date.now()) / MS_PER_SECOND);
}

/** Lines long enough to cross several network chunks, outside ASCII. */
export function longText(lines: number): Buffer {
  return Buffer.from(
    Array.from(
      { length: lines },
      (_, index) => `ligne ${index} : été, naïve, 東京, €\n`,
    ).join(""),
    "utf8",
  );
}
