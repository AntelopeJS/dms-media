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

function isIdList(value: unknown): value is string[] {
  return (
    Array.isArray(value) && value.every((entry) => typeof entry === "string")
  );
}

function isDemoValue(value: unknown): value is MediaDemoValue {
  return value === null || typeof value === "string" || isIdList(value);
}

/** Keeps the fields the form declares, each holding an id, ids or nothing. */
export function pickDemoValues(
  body: unknown,
  fieldIds: readonly string[],
): MediaDemoValues {
  if (!body || typeof body !== "object") return {};
  const entries = Object.entries(body as Record<string, unknown>);
  return Object.fromEntries(
    entries.filter(
      ([id, value]) => fieldIds.includes(id) && isDemoValue(value),
    ),
  ) as MediaDemoValues;
}

function valuesFile(tenantId: string): string {
  const safeTenantId = tenantId.replace(/[^\w-]/g, "_");
  return path.join(VALUES_DIRECTORY, `${safeTenantId}.json`);
}

async function readValues(tenantId: string): Promise<MediaDemoValues> {
  const raw = await readFile(valuesFile(tenantId), "utf8").catch(() => "{}");
  return JSON.parse(raw) as MediaDemoValues;
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
