import { ImplementInterface } from "@antelopejs/interface-core";
import { AddFrontendModule } from "@antelopejs/interface-dms/page";
import { Logging } from "@antelopejs/interface-core/logging";
import "./db";
import type { ScheduledTask } from "node-cron";
import { type DmsMediaConfig, configureMediaModule } from "./config";
import { registerMediaCrons } from "./crons";
import { frontendModule } from "./frontend-module";
import { cancelLibraryChange } from "./library/realtime";

export * from "./acl";
export * from "./bindings";
export * from "./config";
export * from "./constants";
export * from "./crons";
export * from "./db";
export * from "./derivatives";
export * from "./frontend-module";
export * from "./pages";
export * from "./presets";
export * from "./routes";
export * from "./transform";
export * from "./types";

let cronTasks: ScheduledTask[] = [];

export async function construct(config: DmsMediaConfig = {}): Promise<void> {
  configureMediaModule(config);
  ImplementInterface(
    await import("@antelopejs/interface-dms-media"),
    await import("./implementations/interface-dms-media"),
  );
  await AddFrontendModule(frontendModule());
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
