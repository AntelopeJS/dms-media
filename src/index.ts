import path from "node:path";
import { AddFrontendModule } from "@antelopejs/interface-dms/page";
import { Logging } from "@antelopejs/interface-core/logging";
import "./db";
import "./permissions";
import type { ScheduledTask } from "node-cron";
import { type DmsMediaConfig, configureMediaModule } from "./config";
import { registerMediaCrons } from "./crons";

export * from "./acl";
export * from "./asset-type";
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

export async function construct(config: DmsMediaConfig = {}): Promise<void> {
  configureMediaModule(config);
  const sourcePath = path.join(__dirname, "../frontend-vue");

  await AddFrontendModule({
    name: "@antelopejs/dms-media-frontend-vue",
    sourcePath,
    renderer: { name: "vue", version: "3" },
    configKey: "dmsMedia",
    priority: 0,
  });
}

export function start(): void {
  cronTasks = registerMediaCrons();
}

export async function stop(): Promise<void> {
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
