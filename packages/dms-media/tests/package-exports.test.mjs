// The package's entry, as a runtime embedding the module resolves it
// (AntelopeJS core's `resolvePackage`): through the `exports` map, which
// must name the built entry and its types.
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(
  readFileSync(path.join(root, "package.json"), "utf8"),
);
const require = createRequire(path.join(root, "package.json"));

test("the package name resolves to the built entry", () => {
  const entry = require.resolve(manifest.name);
  assert.equal(entry, path.join(root, manifest.main));
  assert.ok(existsSync(entry), `${entry} is built`);
});

test("the exports map names the entry's types", () => {
  const types = manifest.exports["."].types;
  assert.equal(path.normalize(types), path.normalize(manifest.types));
  assert.ok(existsSync(path.join(root, types)), `${types} is built`);
});

test("the manifest stays reachable", () => {
  assert.equal(
    require.resolve(`${manifest.name}/package.json`),
    path.join(root, "package.json"),
  );
});
