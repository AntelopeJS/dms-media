// The exports map has to describe the built package. Node does not fall back
// to a directory index inside an exports map and a `./*` pattern only matches
// files, so every directory index needs its own entry — today `dist/` is flat
// and this is a tripwire for the first subdirectory someone adds.
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const manifest = JSON.parse(
  fs.readFileSync(path.join(packageRoot, "package.json"), "utf8"),
);
const distRoot = path.join(packageRoot, "dist");

const failures = [];

function check(condition, message) {
  if (!condition) failures.push(message);
}

if (!fs.existsSync(distRoot)) {
  throw new Error(
    "dist is missing: run `pnpm run build` before checking the exports map.",
  );
}

function listFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(directory, entry.name);
    return entry.isDirectory() ? listFiles(full) : [full];
  });
}

function toSubpath(file) {
  const relative = path
    .relative(distRoot, file)
    .split(path.sep)
    .join("/")
    .replace(/\.js$/, "");
  return relative === "index" ? "." : `./${relative.replace(/\/index$/, "")}`;
}

const exportsMap = manifest.exports ?? {};
const explicit = new Set(
  Object.keys(exportsMap).filter((subpath) => !subpath.includes("*")),
);

// 1. One explicit entry per directory index.
const jsFiles = listFiles(distRoot).filter((file) => file.endsWith(".js"));
const directoryIndexes = jsFiles
  .filter((file) => path.basename(file) === "index.js")
  .map(toSubpath);
for (const subpath of directoryIndexes) {
  check(
    explicit.has(subpath),
    `exports needs an explicit "${subpath}" entry: a "./*" pattern never matches a directory index.`,
  );
}

// 2. Every explicit entry points at something that exists.
const scopedRequire = createRequire(path.join(packageRoot, "package.json"));
for (const subpath of explicit) {
  if (subpath === "./package.json") continue;
  const specifier =
    subpath === "." ? manifest.name : `${manifest.name}${subpath.slice(1)}`;
  try {
    scopedRequire.resolve(specifier);
  } catch (error) {
    check(
      false,
      `exports["${subpath}"] does not resolve: ${error.code ?? error.message}`,
    );
  }
}

if (failures.length > 0) {
  throw new Error(
    `${manifest.name} exports map is wrong:\n  ${failures.join("\n  ")}`,
  );
}

console.log(
  `exports cover ${jsFiles.length} built modules and ${directoryIndexes.length} directory indexes.`,
);
