import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { test } from "node:test";
import { repoRoot } from "./helpers/packed.mjs";

for (const model of ["formal-asset-files", "formal-declared-rows"]) {
  void test(`${model}: every rule holds or matches its recorded finding, and the model describes the covered functions at HEAD`, () => {
    const check = spawnSync(
      process.execPath,
      [path.join(repoRoot, ".agents", "skills", model, "check.mjs")],
      { cwd: repoRoot, encoding: "utf8" },
    );
    assert.equal(check.status, 0, `${check.stdout}${check.stderr}`);
  });
}
