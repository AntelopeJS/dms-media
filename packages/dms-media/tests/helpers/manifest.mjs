import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

const manifestSchema = z.object({
  name: z.string(),
  main: z.string(),
  types: z.string(),
  exports: z.object({ ".": z.object({ types: z.string() }) }),
});

/** The package directory: where its manifest and its build live. */
export const packageRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
);

/** The package's own `package.json`, parsed. */
export function readManifest() {
  return manifestSchema.parse(
    JSON.parse(readFileSync(path.join(packageRoot, "package.json"), "utf8")),
  );
}
