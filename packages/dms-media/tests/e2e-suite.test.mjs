import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { test } from "node:test";
import { repoRoot } from "./helpers/packed.mjs";

void test("no tracked file outside the agent docs names a verify skill folder, so deleting it breaks no test, e2e run or CI job", () => {
  const found = spawnSync(
    "git",
    [
      "grep",
      "-l",
      "-E",
      "-e",
      "[.]agents/skills/verify-",
      "--",
      ":!.agents",
      ":!*.md",
      ":!*package-lock.json",
    ],
    {
      cwd: repoRoot,
      encoding: "utf8",
    },
  );
  assert.equal(found.status, 1, `${found.stdout}${found.stderr}`);
});

void test("the e2e kit loads every journey from e2e/journeys.config.ts, the smoke journey first", () => {
  const cli = path.join(
    repoRoot,
    "node_modules",
    "@playwright",
    "test",
    "cli.js",
  );
  const list = spawnSync(
    process.execPath,
    [cli, "test", "-c", "e2e", "--list"],
    { cwd: repoRoot, encoding: "utf8" },
  );
  assert.equal(list.status, 0, `${list.stdout}${list.stderr}`);
  const listed = list.stdout.split("\n").filter((line) => line.includes(" › "));
  assert.match(listed[0] ?? "", / › smoke › smoke$/);
});
