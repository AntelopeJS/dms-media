import assert from "node:assert/strict";
import path from "node:path";
import { test } from "node:test";
import { z } from "zod";
import { packageRoot } from "./helpers/manifest.mjs";
import {
  packed,
  readRepoFile,
  readRepoJson,
  repoRoot,
} from "./helpers/packed.mjs";

const interfaceRoot = path.join(repoRoot, "packages", "interface-dms-media");

const moduleManifestSchema = z.object({
  main: z.string(),
  types: z.string(),
  exports: z.object({
    ".": z.object({ types: z.string(), default: z.string() }),
  }),
  dmsFrontend: z.string(),
  antelopeJs: z.object({
    implements: z.array(z.string()),
    skills: z.array(z.string()),
  }),
  publishConfig: z.object({ access: z.string() }),
  dependencies: z.record(z.string(), z.string()),
});

const interfaceManifestSchema = z.object({
  name: z.string(),
  version: z.string(),
});

const frontendManifestSchema = z.object({
  engines: z.object({ "@antelopejs/dms-frontend": z.string() }),
});

void test("the module tarball holds every path its manifest names, the skill and the dashboard locales, without build info", () => {
  const { files, manifest } = packed(packageRoot);
  const parsed = moduleManifestSchema.parse(manifest);
  const targets = [
    parsed.main,
    parsed.types,
    parsed.exports["."].types,
    parsed.exports["."].default,
    parsed.dmsFrontend,
  ].map((target) => target.replace(/^\.\//, ""));
  for (const target of targets)
    assert.ok(files.includes(target), `${target} is packed`);
  assert.deepEqual(parsed.antelopeJs.implements, [
    "@antelopejs/interface-dms-media",
  ]);
  assert.deepEqual(parsed.antelopeJs.skills, ["./skills"]);
  for (const file of [
    "skills/dms-media/SKILL.md",
    "frontend-vue/dms.frontend.ts",
    "frontend-vue/i18n/locales/media-en-GB.json",
    "frontend-vue/i18n/locales/media-fr-FR.json",
  ]) {
    assert.ok(files.includes(file), `${file} is packed`);
  }
  assert.deepEqual(
    files.filter((file) => file.endsWith(".tsbuildinfo")),
    [],
  );
  assert.equal(parsed.publishConfig.access, "public");
});

void test("the interface tarball ships its build and consumer reference, and its declarations export the README's contract", () => {
  const { files, manifest } = packed(interfaceRoot);
  assert.equal(
    interfaceManifestSchema.parse(manifest).name,
    "@antelopejs/interface-dms-media",
  );
  for (const file of ["dist/index.js", "dist/index.d.ts", "docs/1.index.md"]) {
    assert.ok(files.includes(file), `${file} is packed`);
  }
  const declarations = ["index", "acl", "asset-type", "bindings", "content"]
    .map((name) =>
      readRepoFile(`packages/interface-dms-media/dist/${name}.d.ts`),
    )
    .join("\n");
  const missing = [
    "AssetType",
    "RegisterAssetBinding",
    "UnregisterAssetBinding",
    "EnsureMediaFolder",
    "ImportMediaAsset",
    "ASSET_DATA_TYPE_ID",
    "ASSET_PICKER_COMPONENT",
    "AssetTypeOptions",
    "AssetPickerComponentOptions",
    "AssetBindingConfig",
    "AssetBindingField",
    "AssetPermissionMapping",
    "MediaFolderDeclaration",
    "MediaFolderVisibility",
    "MediaAssetDeclaration",
    "MediaFolderTarget",
    "DeclaredFolderTarget",
    "BoundFolderTarget",
    "MediaAssetSource",
    "MediaBytesSource",
    "MediaFileSource",
    "MediaLazySource",
    "MediaDeclarationResult",
    "MediaDeclarationStatus",
    "AclEntry",
    "AclSubject",
    "AclSubjectKind",
    "AclRight",
  ].filter(
    (name) =>
      !new RegExp(
        `export (declare )?(function|class|const|interface|type) ${name}\\b`,
      ).test(declarations),
  );
  assert.deepEqual(missing, []);
});

void test("the README compatibility table names the interface ranges the module packs, and the interface range takes the tree's interface up to the next minor", () => {
  const readme = readRepoFile("packages/dms-media/README.md");
  const table = new Map(
    [...readme.matchAll(/^\| `(@antelopejs\/[^`]+)`\s*\| `([^`]+)`/gm)].map(
      (match) => [match[1], match[2]],
    ),
  );
  const { dependencies } = moduleManifestSchema.parse(
    readRepoJson("packages/dms-media/package.json"),
  );
  const { version } = interfaceManifestSchema.parse(
    readRepoJson("packages/interface-dms-media/package.json"),
  );
  for (const [name, spec] of Object.entries(dependencies)) {
    if (!name.startsWith("@antelopejs/interface-")) continue;
    assert.equal(
      table.get(name),
      spec === "workspace:^" ? `^${version}` : spec,
      name,
    );
  }

  const { engines } = frontendManifestSchema.parse(
    readRepoJson("packages/dms-media/frontend-vue/package.json"),
  );
  assert.match(
    engines["@antelopejs/dms-frontend"],
    /^>=\d+\.\d+\.\d+ <\d+\.\d+\.0$/,
  );
});
