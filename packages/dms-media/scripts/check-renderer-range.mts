import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * `ajs dms dev` refuses to start when a frontend module's range excludes the
 * installed renderer, so the playground's own frontend must declare the
 * `@antelopejs/dms-frontend` range of this layer. Prints the violation only;
 * exits 1 when there is one.
 */

const PACKAGE = join(import.meta.dirname, "..");
const RENDERER = "@antelopejs/dms-frontend";
const LAYER = join(PACKAGE, "frontend-vue");
const PLAYGROUND_FRONTEND = join(PACKAGE, "playground", "frontend-vue");

function isObject(value: unknown): value is object {
  return typeof value === "object" && value !== null;
}

function isRange(value: unknown): value is string {
  return typeof value === "string";
}

/** The renderer range a frontend declares in `engines`, if it declares one. */
function rendererRange(directory: string): string | undefined {
  const manifest: unknown = JSON.parse(
    readFileSync(join(directory, "package.json"), "utf8"),
  );
  if (!isObject(manifest) || !("engines" in manifest)) return undefined;
  const { engines } = manifest;
  if (!isObject(engines) || !(RENDERER in engines)) return undefined;
  const range = engines[RENDERER];
  return isRange(range) ? range : undefined;
}

const layer = rendererRange(LAYER);
const playground = rendererRange(PLAYGROUND_FRONTEND);
if (layer === undefined) {
  console.error(`frontend-vue/package.json: no engines["${RENDERER}"]`);
  process.exitCode = 1;
} else if (playground !== layer) {
  console.error(
    `playground/frontend-vue/package.json: engines["${RENDERER}"] is ${JSON.stringify(playground)}, not the layer's ${JSON.stringify(layer)}`,
  );
  process.exitCode = 1;
}
