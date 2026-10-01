import path from "node:path";
import { AddFrontendModule } from "@antelopejs/interface-dms/page";

import "./media-demo";
import "./welcome";

export async function construct(): Promise<void> {
  await AddFrontendModule({
    name: "playground-frontend-vue",
    sourcePath: path.join(__dirname, "../frontend-vue"),
    renderer: { name: "vue", version: "3" },
    configKey: "playground",
    priority: 1,
  });
}

export async function start(): Promise<void> {}
