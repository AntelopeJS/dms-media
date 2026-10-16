import path from "node:path";
import { ImplementInterface } from "@antelopejs/interface-core";
import {
  AddFrontendModule,
  type FrontendBackendProxy,
} from "@antelopejs/interface-dms/page";
import { Logging } from "@antelopejs/interface-core/logging";
import "./db";
import type { ScheduledTask } from "node-cron";
import { type DmsMediaConfig, configureMediaModule } from "./config";
import { registerMediaCrons } from "./crons";
import { cancelLibraryChange } from "./library/realtime";

export * from "./acl";
export * from "./bindings";
export * from "./config";
export * from "./constants";
export * from "./crons";
export * from "./db";
export * from "./derivatives";
export * from "./pages";
export * from "./presets";
export * from "./routes";
export * from "./transform";
export * from "./types";

let cronTasks: ScheduledTask[] = [];

/** The frontend module the dashboard loads: its blocks, viewers and fields. */
export const MEDIA_FRONTEND_MODULE = "@antelopejs/dms-media-frontend-vue";

/**
 * The file links a dashboard page shows (`/media/<id>/<name>`), which the
 * backend serves: proxied by the frontend server with the member's session,
 * so that a private file opens for a member signed in, as on the API origin.
 */
export const MEDIA_DELIVERY_PROXY: FrontendBackendProxy = {
  path: "/media/**",
  auth: "session",
};

export async function construct(config: DmsMediaConfig = {}): Promise<void> {
  configureMediaModule(config);
  ImplementInterface(
    await import("@antelopejs/interface-dms-media"),
    await import("./implementations/interface-dms-media"),
  );
  const sourcePath = path.join(__dirname, "../frontend-vue");

  await AddFrontendModule({
    name: MEDIA_FRONTEND_MODULE,
    sourcePath,
    renderer: { name: "vue", version: "3" },
    configKey: "dmsMedia",
    priority: 0,
    backendProxies: [MEDIA_DELIVERY_PROXY],
  });
}

export function start(): void {
  cronTasks = registerMediaCrons();
}

export async function stop(): Promise<void> {
  cancelLibraryChange();
  const teardowns = await Promise.allSettled(
    cronTasks.map(async (task) => task.destroy()),
  );
  for (const teardown of teardowns) {
    if (teardown.status === "rejected") {
      Logging.Error("A cron task failed to stop", teardown.reason);
    }
  }
  cronTasks = [];
}
