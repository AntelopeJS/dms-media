import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** The package directory: where its manifest and its build live. */
export const packageRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
);

/** The package's own `package.json`, parsed. */
export function readManifest() {
  return JSON.parse(
    readFileSync(path.join(packageRoot, "package.json"), "utf8"),
  );
}
