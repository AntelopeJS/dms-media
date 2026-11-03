import path from "node:path";
import type { AddFrontendModuleOptions } from "@antelopejs/interface-dms/page";

/**
 * The playground's frontend: `construct()` registers it with
 * `AddFrontendModule`, and `ajs dms dev`, `build` and `start` call this same
 * function (declared as `dmsFrontend` in package.json), since they read the
 * project rather than the backend's registrations.
 */
export function frontendModule(): AddFrontendModuleOptions {
  return {
    name: "playground-frontend-vue",
    sourcePath: path.join(__dirname, "../frontend-vue"),
    renderer: { name: "vue", version: "3" },
    configKey: "playground",
    priority: 1,
  };
}
