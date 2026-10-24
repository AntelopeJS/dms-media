import { createHash } from "node:crypto";
import type { HTTPResult, RequestContext } from "@antelopejs/interface-api";
import { assert } from "@antelopejs/interface-api-util";
import { ReadFile } from "@antelopejs/interface-file-storage";
import { PRIVATE_CACHE_CONTROL, PUBLIC_CACHE_CONTROL } from "./constants";
import {
  contentDisposition,
  contentSecurityPolicy,
  normalizedMimetype,
} from "./delivery-headers";

const HTTP_OK = 200;
const HTTP_NOT_MODIFIED = 304;
const HTTP_BAD_GATEWAY = 502;
const ETAG_HASH_LENGTH = 24;
const ANY_MATCH = "*";
const ANY_ORIGIN = "*";
const DENIED_ORIGIN = "false";
const HEAD_METHOD = "HEAD";

/** One stored file as the delivery route hands it out. */
export interface DeliveredFile {
  storageKey: string;
  storage: string | undefined;
  mimetype: string;
  filename: string;
  isPublic: boolean;
}

/** Public files can be read by scripts of any site; the API's own origins keep their CORS answer. */
export function openPublicCors(response: HTTPResult): void {
  const origin = response.peekHeaders()?.["Access-Control-Allow-Origin"];
  if (origin && origin !== DENIED_ORIGIN) return;
  response.addHeader("Access-Control-Allow-Origin", ANY_ORIGIN);
  response.removeHeader("Access-Control-Allow-Credentials");
}

/** Bytes behind a storage key never change, so the key identifies the representation. */
function entityTag(storageKey: string): string {
  const hash = createHash("sha1")
    .update(storageKey)
    .digest("hex")
    .slice(0, ETAG_HASH_LENGTH);
  return `"${hash}"`;
}

function matchesEntityTag(ctx: RequestContext, etag: string): boolean {
  const header = ctx.rawRequest.headers["if-none-match"];
  if (!header) return false;
  return header
    .split(",")
    .map((candidate) => candidate.trim().replace(/^W\//, ""))
    .some((candidate) => candidate === etag || candidate === ANY_MATCH);
}

function addRepresentationHeaders(
  response: HTTPResult,
  file: DeliveredFile,
  etag: string,
): void {
  response.addHeader("ETag", etag);
  response.addHeader(
    "Cache-Control",
    file.isPublic ? PUBLIC_CACHE_CONTROL : PRIVATE_CACHE_CONTROL,
  );
  response.addHeader("X-Content-Type-Options", "nosniff");
  response.addHeader(
    "Content-Disposition",
    contentDisposition(file.mimetype, file.filename),
  );
  const policy = contentSecurityPolicy(file.mimetype);
  if (policy) response.addHeader("Content-Security-Policy", policy);
  if (file.isPublic) openPublicCors(response);
}

/**
 * Serves the bytes through the API. Only used for active content (SVG,
 * legacy HTML/XML): the storage's signed URL cannot carry the sandbox policy
 * or the attachment disposition these files need, every other file is
 * redirected to the storage so its bandwidth never goes through Node.
 * Byte ranges are not served: these files are small and rendered whole.
 */
export async function streamStoredFile(
  ctx: RequestContext,
  file: DeliveredFile,
): Promise<HTTPResult | undefined> {
  const response = ctx.response;
  const etag = entityTag(file.storageKey);
  addRepresentationHeaders(response, file, etag);
  if (matchesEntityTag(ctx, etag)) {
    response.setStatus(HTTP_NOT_MODIFIED);
    response.setBody("");
    return response;
  }
  // Read from the storage itself: its read URL is the public origin, which
  // the server may not reach (private network, egress policy).
  const stored = await ReadFile(file.storageKey, file.storage).catch(
    () => undefined,
  );
  assert(stored, HTTP_BAD_GATEWAY, "File unavailable");
  response.addHeader("Content-Length", String(stored.size));
  const stream = response.getWriteStream(
    normalizedMimetype(file.mimetype),
    HTTP_OK,
  );
  const body = stored.body;
  if (ctx.rawRequest.method === HEAD_METHOD) {
    body.destroy();
    stream.end();
    return undefined;
  }
  body.on("error", () => stream.destroy());
  ctx.rawResponse.once("close", () => body.destroy());
  body.pipe(stream);
  return undefined;
}
