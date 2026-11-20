import { randomUUID } from "node:crypto";
import { GetModel } from "@antelopejs/interface-database-decorators";
import { TenantModel } from "@antelopejs/interface-dms/db";
import type {
  ExecutionCtx,
  JsonValue,
  LogLevel,
  TriggerType,
} from "@antelopejs/interface-dms-automation";
import {
  EnsureMediaFolder,
  ImportMediaAsset,
} from "@antelopejs/interface-dms-media";

export interface LoggedEntry {
  level: LogLevel;
  message: string;
  value?: JsonValue;
}

/** A step context that keeps what the action logs. */
export interface RecordingCtx extends ExecutionCtx {
  logged: LoggedEntry[];
}

export function stepCtx(procedureId = "procedure-1"): RecordingCtx {
  const logged: LoggedEntry[] = [];
  return {
    procedureId,
    runId: `run-${randomUUID()}`,
    nodeId: "node-1",
    logged,
    log(level, message, value) {
      logged.push({ level, message, value });
    },
  };
}

/** What an armed trigger received, and how to disarm it. */
export interface Capture<TPayload> {
  received: TPayload[];
  stop: () => Promise<void>;
}

/** Arms `trigger` with `config` and keeps every payload it emits. */
export async function capture<TConfig, TPayload extends JsonValue>(
  trigger: TriggerType<TConfig, TPayload, string>,
  config: TConfig,
): Promise<Capture<TPayload>> {
  const received: TPayload[] = [];
  const handle = await trigger.activate(config, (payload) => {
    received.push(payload);
  });
  return { received, stop: () => trigger.deactivate(handle) };
}

/** A tenant row of its own, for tests that check isolation. */
export async function newTenant(): Promise<string> {
  const tenantId = `media-automation-${randomUUID()}`;
  await GetModel(TenantModel).insert({ _id: tenantId, name: tenantId });
  return tenantId;
}

/** A declared folder of the tenant, by key. */
export async function declaredFolder(
  tenantId: string,
  key: string,
): Promise<string> {
  const result = await EnsureMediaFolder({ tenantId, key, name: key });
  return result.id;
}

/** Declares a text file of `bytes` bytes into the declared folder `folderKey`. */
export async function declaredText(
  tenantId: string,
  folderKey: string,
  name: string,
  bytes = 10,
): Promise<string> {
  const result = await ImportMediaAsset({
    tenantId,
    key: `${folderKey}/${name}`,
    folder: { key: folderKey },
    name,
    mimetype: "text/plain",
    source: { bytes: Buffer.alloc(bytes, "a") },
  });
  return result.id;
}

/** The message `work` fails with, or `"no failure"` when it succeeds. */
export async function failureOf(work: Promise<unknown>): Promise<string> {
  try {
    await work;
    return "no failure";
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}
