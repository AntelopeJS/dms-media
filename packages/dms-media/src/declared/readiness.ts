import { setTimeout as delay } from "node:timers/promises";
import { Schema } from "@antelopejs/interface-database";
import { TENANT_SCHEMA_NAME } from "@antelopejs/interface-dms/constants";

const POLL_INTERVAL_MS = 500;
/** How long a declaration waits for its tenant before giving up. */
const TENANT_WAIT_MS = 5 * 60_000;

const readyTenants = new Set<string>();

async function hasTenantInstance(tenantId: string): Promise<boolean> {
  try {
    const schema = Schema.get(TENANT_SCHEMA_NAME);
    if (!schema) return false;
    const instances = await schema.listInstances();
    return instances.includes(tenantId);
  } catch {
    return false;
  }
}

/**
 * Waits until the tenant's tables can be queried. Polling the schema, rather
 * than awaiting `Hook.DATABASE_INITIALIZED`, cannot deadlock a caller that
 * declares content from its own handler of that hook: handlers run in series.
 */
export async function waitForTenant(tenantId: string): Promise<void> {
  if (readyTenants.has(tenantId)) return;
  const deadline = Date.now() + TENANT_WAIT_MS;
  while (!(await hasTenantInstance(tenantId))) {
    if (Date.now() > deadline)
      throw new Error(
        `Media tenant '${tenantId}' was not ready after ${TENANT_WAIT_MS / 1000}s: declare content from start() or a Hook.DATABASE_INITIALIZED handler, never awaited in construct()`,
      );
    await delay(POLL_INTERVAL_MS);
  }
  readyTenants.add(tenantId);
}
