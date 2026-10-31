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
import { z } from "zod";
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

const demoBodySchema = z.record(
  z.string(),
  z
    .union([z.string(), z.array(z.string()), z.null()])
    .optional()
    .catch(undefined),
);

/** Keeps the fields the form declares, each holding an id, ids or nothing. */
export function pickDemoValues(
  body: z.infer<typeof demoBodySchema>,
  fieldIds: readonly string[],
): MediaDemoValues {
  return Object.fromEntries(
    Object.entries(body).flatMap(([id, value]): [string, MediaDemoValue][] =>
      fieldIds.includes(id) && value !== undefined ? [[id, value]] : [],
    ),
  );
}

function valuesFile(tenantId: string): string {
  const safeTenantId = tenantId.replace(/[^\w-]/g, "_");
  return path.join(VALUES_DIRECTORY, `${safeTenantId}.json`);
}

async function readValues(tenantId: string): Promise<MediaDemoValues> {
  const raw = await readFile(valuesFile(tenantId), "utf8").catch(() => "{}");
  const stored = demoBodySchema.safeParse(JSON.parse(raw));
  return pickDemoValues(
    stored.success ? stored.data : {},
    MEDIA_DEMO_FIELD_IDS,
  );
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
    const sent = demoBodySchema.safeParse(body);
    const next = {
      ...(await readValues(tenantId)),
      ...pickDemoValues(sent.success ? sent.data : {}, MEDIA_DEMO_FIELD_IDS),
    };
    await writeValues(tenantId, next);
    return next;
  }
}
