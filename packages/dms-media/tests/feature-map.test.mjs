import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { test } from "node:test";
import { repoRoot } from "./helpers/packed.mjs";

void test("every user-facing file belongs to a verify feature that has journeys and existing docs pages", () => {
  const bin = path.join(
    repoRoot,
    "node_modules",
    "@antelopejs",
    "dms",
    "bin",
    "dms-control.mjs",
  );
  const map = spawnSync(process.execPath, [bin, "map"], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  assert.equal(map.status, 0, `${map.stdout}${map.stderr}`);
});
