import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  Context,
  Controller,
  Get,
  JSONBody,
  Put,
  type RequestContext,
} from "@antelopejs/interface-api";
import type { User } from "@antelopejs/interface-dms/auth/db";
import { AuthUserWithPermission } from "@antelopejs/interface-dms/guards";
import { getRequestTenantId } from "@antelopejs/interface-dms/request-tenant";
import {
  MEDIA_DEMO_FIELD_IDS,
  MEDIA_DEMO_VALUES_LOCATION,
  MediaDemoPage,
} from "./media-demo";

/** Where the demo form's values are kept: next to the local file storage. */
const VALUES_DIRECTORY = path.join(".antelope", "media-demo");
const JSON_INDENT = 2;

export type MediaDemoValue = string | string[] | null;
export type MediaDemoValues = Record<string, MediaDemoValue>;

function isId(value: unknown): value is string {
  return typeof value === "string";
}

function isIdList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(isId);
}

function isDemoValue(value: unknown): value is MediaDemoValue {
  return value === null || isId(value) || isIdList(value);
}

function isBody(value: unknown): value is object {
  return typeof value === "object" && value !== null;
}

/** Keeps the fields the form declares, each holding an id, ids or nothing. */
export function pickDemoValues(
  body: unknown,
  fieldIds: readonly string[],
): MediaDemoValues {
  if (!isBody(body)) return {};
  return Object.fromEntries(
    Object.entries(body).flatMap(([id, value]): [string, MediaDemoValue][] =>
      fieldIds.includes(id) && isDemoValue(value) ? [[id, value]] : [],
    ),
  );
}

function valuesFile(tenantId: string): string {
  const safeTenantId = tenantId.replace(/[^\w-]/g, "_");
  return path.join(VALUES_DIRECTORY, `${safeTenantId}.json`);
}

async function readValues(tenantId: string): Promise<MediaDemoValues> {
  const raw = await readFile(valuesFile(tenantId), "utf8").catch(() => "{}");
  return pickDemoValues(JSON.parse(raw), MEDIA_DEMO_FIELD_IDS);
}

async function writeValues(
  tenantId: string,
  values: MediaDemoValues,
): Promise<void> {
  await mkdir(VALUES_DIRECTORY, { recursive: true });
  await writeFile(
    valuesFile(tenantId),
    JSON.stringify(values, null, JSON_INDENT),
  );
}

/**
 * Stores what the media demo form saves, per workspace, so a reload shows
 * the files the fields were given. Reading and saving both take the page's
 * own permission: whoever sees the form can fill it.
 */
export class MediaDemoValuesController extends Controller(
  MEDIA_DEMO_VALUES_LOCATION,
) {
  @Context()
  declare ctx: RequestContext;

  @AuthUserWithPermission(MediaDemoPage)
  declare user: User;

  @Get("/values")
  async values(): Promise<MediaDemoValues> {
    return readValues(getRequestTenantId(this.ctx));
  }

  @Put("/values")
  async save(@JSONBody() body: unknown): Promise<MediaDemoValues> {
    const tenantId = getRequestTenantId(this.ctx);
    const next = {
      ...(await readValues(tenantId)),
      ...pickDemoValues(body, MEDIA_DEMO_FIELD_IDS),
    };
    await writeValues(tenantId, next);
    return next;
  }
}
