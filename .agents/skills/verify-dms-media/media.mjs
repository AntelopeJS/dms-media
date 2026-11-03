import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { inflateRawSync } from "node:zlib";
import { join } from "node:path";
import sharp from "../../../packages/dms-media/node_modules/sharp/lib/index.js";

/**
 * @typedef {import("../../../packages/dms-media/node_modules/@antelopejs/dms/bin/control/journey.mjs").JourneyContext} Ctx
 * @typedef {import("../../../packages/dms-media/node_modules/@antelopejs/dms/bin/control/tab.mjs").Tab} Tab
 * @typedef {{ status: number | null, body: unknown, error: string | null, folder?: string }} Answer
 * @typedef {{ folder: string, status: number | null, headers: Record<string, string>, bytes: Buffer, text: string, json: unknown }} Raw
 * @typedef {Record<string, unknown>} Row
 * @typedef {{ name: string, pass: boolean, detail: string }} Check
 */

/** The library's HTTP API, which the dashboard and asset fields call. */
export const MEDIA = "/api/media";

/** The verification playground's trusted backend calls (`playground/src/fixture.ts`). */
export const FIXTURE = "/verify-media";

/** The tenant of a single-tenant DMS. */
export const TENANT = "default";

/**
 * @param {unknown} value Anything a JSON answer holds
 * @returns {value is Row} Whether it is an object
 */
export function isRow(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * @param {unknown} value Anything a JSON answer holds
 * @returns {value is string} Whether it is a string
 */
export function isText(value) {
  return typeof value === "string";
}

/**
 * Reads a nested field of a JSON answer.
 *
 * @param {unknown} value The answer
 * @param {...string} path The field names, outermost first
 * @returns {unknown} The field, or undefined when a step is missing
 */
export function pick(value, ...path) {
  let current = value;
  for (const step of path) {
    if (!isRow(current)) return undefined;
    current = current[step];
  }
  return current;
}

/**
 * @param {unknown} value The answer
 * @param {...string} path The field names
 * @returns {string} The field when it is a string, else the empty string
 */
export function text(value, ...path) {
  const found = pick(value, ...path);
  return isText(found) ? found : "";
}

/**
 * The objects of an array field of a JSON answer.
 *
 * @param {unknown} value The answer
 * @param {...string} path The field names, outermost first
 * @returns {Row[]} The array's objects, empty when the field is not an array
 */
export function list(value, ...path) {
  const found = path.length === 0 ? value : pick(value, ...path);
  return Array.isArray(found) ? found.filter(isRow) : [];
}

/**
 * @param {unknown} value The answer
 * @param {...string} path The field names
 * @returns {string[]} The `name` of each object of the array field
 */
export function names(value, ...path) {
  return list(value, ...path).map((row) => text(row, "name"));
}

/**
 * A check, in the shape `ctx.record` takes.
 *
 * @param {string} name What is checked
 * @param {unknown} pass Whether it holds
 * @param {unknown} detail What was observed
 * @returns {Check} The check
 */
export function check(name, pass, detail) {
  return { name, pass: pass === true, detail: isText(detail) ? detail : (JSON.stringify(detail) ?? "undefined") };
}

/**
 * @param {Ctx} ctx The journey
 * @param {string} label What the call does
 * @param {string} method The HTTP method
 * @param {string} path The path under the media API
 * @param {{ body?: unknown, as?: string }} [options] The JSON body, and the account (`admin` by default, `anon` for nobody)
 * @returns {Promise<Answer>} The answer
 */
export function media(ctx, label, method, path, options = {}) {
  return ctx.api(label, { method, path: `${MEDIA}${path}`, body: options.body, as: options.as });
}

/**
 * Calls the verification playground's trusted backend.
 *
 * @param {Ctx} ctx The journey
 * @param {string} label What the call does
 * @param {string} method The HTTP method
 * @param {string} path The path under the fixture
 * @param {unknown} [body] The JSON body
 * @returns {Promise<Answer>} The answer
 */
export function fixture(ctx, label, method, path, body) {
  return ctx.api(label, { method, path: `${FIXTURE}${path}`, body, as: "anon" });
}

/**
 * @param {string} body A response body
 * @returns {unknown} Its JSON value, or undefined when it is not JSON
 */
export function parseJson(body) {
  try {
    return JSON.parse(body);
  } catch {
    return undefined;
  }
}

/**
 * The session token of an account, after one authenticated call signed it in.
 *
 * @param {Ctx} ctx The journey
 * @param {string} account The account
 * @returns {Promise<string | undefined>} The token
 */
export async function tokenOf(ctx, account) {
  if (!ctx.state.tokens?.[account]) await ctx.api(`sign ${account} in`, { method: "GET", path: `${MEDIA}/tree`, as: account });
  return ctx.state.tokens?.[account];
}

/**
 * A request to any URL with its response headers and bytes kept in the evidence, redirects not followed.
 *
 * @param {Ctx} ctx The journey
 * @param {string} label What the request does
 * @param {{ url?: string, path?: string, origin?: "api" | "web", method?: string, headers?: Record<string, string>, as?: string, body?: Buffer }} request What to send; `as` adds the account's session token
 * @returns {Promise<Raw>} The answer
 */
export async function raw(ctx, label, request) {
  const folder = ctx.step(label);
  const origin = request.origin === "web" ? ctx.state.webUrl : ctx.state.apiUrl;
  const url = request.url ?? `${origin}${request.path ?? "/"}`;
  const method = request.method ?? "GET";
  /** @type {Record<string, string>} */
  const headers = { ...request.headers };
  if (request.as) headers.authorization = `Bearer ${(await tokenOf(ctx, request.as)) ?? ""}`;
  const shown = Object.fromEntries(Object.entries(headers).map(([name, value]) => [name, /auth|cookie/i.test(name) ? "<session>" : value]));
  writeFileSync(join(folder, "request.json"), `${JSON.stringify({ method, url, headers: shown, bodyBytes: request.body?.byteLength ?? 0 }, null, 2)}\n`);
  const response = await fetch(url, { method, headers, redirect: "manual", body: request.body });
  const bytes = Buffer.from(await response.arrayBuffer());
  /** @type {Record<string, string>} */
  const received = {};
  for (const [name, value] of response.headers) received[name] = value;
  const body = bytes.toString("utf8");
  writeFileSync(join(folder, "response.json"), `${JSON.stringify({ status: response.status, headers: received, bytes: bytes.byteLength, sha256: sha256(bytes), body: body.slice(0, 4000) }, null, 2)}\n`);
  return { folder, status: response.status, headers: received, bytes, text: body, json: parseJson(body) };
}

/**
 * Records checks against the evidence folder `raw` made.
 *
 * @param {Ctx} ctx The journey
 * @param {Raw} answer The answer
 * @param {Check[]} checks The checks
 * @returns {boolean} Whether they all passed
 */
export function recordRaw(ctx, answer, checks) {
  return ctx.record(answer.folder, checks);
}

/**
 * @param {Uint8Array} bytes Some bytes
 * @returns {string} Their SHA-256, hex
 */
export function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

/**
 * sharp, from the module's own dependencies, to make test images and read the ones the module renders.
 *
 * @returns {typeof sharp} sharp
 */
export function sharpOf() {
  return sharp;
}

/**
 * An image of the given size, whose pixels differ from one call to another, so two images never share bytes.
 *
 * @param {Ctx} ctx The journey
 * @param {{ width: number, height: number, format?: "png" | "jpeg" | "webp" | "avif" | "gif" | "tiff", seed?: number }} spec The image
 * @returns {Promise<Buffer>} Its bytes
 */
export async function image(ctx, spec) {
  const seed = spec.seed ?? Math.floor(Math.random() * 200);
  const pixels = Buffer.alloc(spec.width * spec.height * 3);
  for (let index = 0; index < pixels.length; index += 1) pixels[index] = (index * 7 + seed) % 256;
  return sharpOf()(pixels, { raw: { width: spec.width, height: spec.height, channels: 3 } })
    .toFormat(spec.format ?? "png")
    .toBuffer();
}

/**
 * What sharp reads in an image the module served.
 *
 * @param {Ctx} ctx The journey
 * @param {Buffer} bytes The image
 * @returns {Promise<{ format: string, width: number, height: number }>} Its format and size, empty when sharp cannot read it
 */
export async function imageInfo(ctx, bytes) {
  try {
    const meta = await sharpOf()(bytes).metadata();
    return { format: meta.format ?? "", width: meta.width ?? 0, height: meta.height ?? 0 };
  } catch {
    return { format: "", width: 0, height: 0 };
  }
}

/** A small SVG drawing. */
export const SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="40" height="20" viewBox="0 0 40 20"><rect width="40" height="20" fill="#3a6"/></svg>\n');

/**
 * Text bytes long enough to cross several network chunks, with characters outside ASCII.
 *
 * @param {number} lines How many lines
 * @returns {Buffer} The bytes
 */
export function longText(lines) {
  return Buffer.from(Array.from({ length: lines }, (_, index) => `ligne ${index} : été, naïve, 東京, €\n`).join(""), "utf8");
}

/**
 * The run's local file storage, where the module's files, renderings and signed-link tokens live.
 *
 * @param {Ctx} ctx The journey
 * @param {...string} parts A path under it
 * @returns {string} The folder or file
 */
export function storagePath(ctx, ...parts) {
  return join(ctx.state.runPlayground ?? ctx.state.playground, ".antelope", "file-storage", ...parts);
}

/**
 * How long a signed storage link lives from now, read from the storage's own record of its token.
 *
 * @param {Ctx} ctx The journey
 * @param {string} location The signed URL
 * @returns {number} Seconds left, or -1 when the token is unknown
 */
export function signedLifetime(ctx, location) {
  const token = new URL(location, "http://x").searchParams.get("token") ?? "";
  try {
    const record = parseJson(readFileSync(storagePath(ctx, "tokens", "read", `${token}.json`), "utf8"));
    const expiresAt = pick(record, "expiresAt");
    return Number.isFinite(expiresAt) ? Math.round((Number(expiresAt) - Date.now()) / 1000) : -1;
  } catch {
    return -1;
  }
}

/**
 * The entries of a zip file, read from its central directory: names and uncompressed bytes.
 *
 * @param {Buffer} zip The zip
 * @returns {{ name: string, bytes: Buffer }[]} Its entries, empty when it is not a readable zip
 */
export function unzip(zip) {
  const end = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (end < 0) return [];
  const count = zip.readUInt16LE(end + 10);
  let offset = zip.readUInt32LE(end + 16);
  const entries = [];
  for (let index = 0; index < count; index += 1) {
    const method = zip.readUInt16LE(offset + 10);
    const compressed = zip.readUInt32LE(offset + 20);
    const nameLength = zip.readUInt16LE(offset + 28);
    const extraLength = zip.readUInt16LE(offset + 30);
    const commentLength = zip.readUInt16LE(offset + 32);
    const local = zip.readUInt32LE(offset + 42);
    const name = zip.toString("utf8", offset + 46, offset + 46 + nameLength);
    const dataStart = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
    const data = zip.subarray(dataStart, dataStart + compressed);
    entries.push({ name, bytes: method === 8 ? inflateRawSync(data) : Buffer.from(data) });
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}
