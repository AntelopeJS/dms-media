import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { test } from "node:test";
import { packageRoot as root, readManifest } from "./helpers/manifest.mjs";

const manifest = readManifest();
/**
 * Resolves the package's entry as a runtime embedding the module does
 * (AntelopeJS core's `resolvePackage`): through the `exports` map, which must
 * name the built entry and its types.
 */
const require = createRequire(path.join(root, "package.json"));

void test("the package name resolves to the built entry", () => {
  const entry = require.resolve(manifest.name);
  assert.equal(entry, path.join(root, manifest.main));
  assert.ok(existsSync(entry), `${entry} is built`);
});

void test("the exports map names the entry's types", () => {
  const types = manifest.exports["."].types;
  assert.equal(path.normalize(types), path.normalize(manifest.types));
  assert.ok(existsSync(path.join(root, types)), `${types} is built`);
});

void test("the manifest stays reachable", () => {
  assert.equal(
    require.resolve(`${manifest.name}/package.json`),
    path.join(root, "package.json"),
  );
});
