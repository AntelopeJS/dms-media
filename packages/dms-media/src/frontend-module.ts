import path from "node:path";
import type {
  AddFrontendModuleOptions,
  FrontendBackendProxy,
} from "@antelopejs/interface-dms/page";

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

/**
 * This module's frontend, from its configuration alone: the backend registers
 * it with `AddFrontendModule`, and `@antelopejs/dms-frontend` calls this same
 * function (declared as `dmsFrontend` in package.json) to build and start the
 * frontend without a backend. It reads nothing but its arguments.
 */
export function frontendModule(): AddFrontendModuleOptions {
  return {
    name: MEDIA_FRONTEND_MODULE,
    sourcePath: path.join(__dirname, "../frontend-vue"),
    renderer: { name: "vue", version: "3" },
    configKey: "dmsMedia",
    priority: 0,
    backendProxies: [MEDIA_DELIVERY_PROXY],
  };
}
