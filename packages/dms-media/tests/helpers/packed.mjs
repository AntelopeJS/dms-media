import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { packageRoot } from "./manifest.mjs";

/** The checkout root, which holds both packages. */
export const repoRoot = path.resolve(packageRoot, "..", "..");

/**
 * Packs a package with `npm pack` and lists the tarball.
 *
 * @param {string} dir The package folder
 * @returns {{ files: string[], manifest: unknown }} The packed paths and the packed manifest
 */
export function packed(dir) {
  const folder = mkdtempSync(path.join(tmpdir(), "dms-media-pack-"));
  try {
    const output = execFileSync(
      "npm",
      ["pack", "--ignore-scripts", "--silent", "--pack-destination", folder],
      { cwd: dir, encoding: "utf8", shell: process.platform === "win32" },
    );
    const tarball = path.basename(output.trim().split("\n").at(-1) ?? "");
    const files = execFileSync("tar", ["-tzf", tarball], {
      cwd: folder,
      encoding: "utf8",
    })
      .split("\n")
      .filter(Boolean)
      .map((line) => line.replace(/^package\//, ""));
    /** @type {unknown} */
    const manifest = JSON.parse(
      execFileSync("tar", ["-xzOf", tarball, "package/package.json"], {
        cwd: folder,
        encoding: "utf8",
      }),
    );
    return { files, manifest };
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
}

/**
 * @param {string} file A file of the checkout, from its root
 * @returns {string} Its text
 */
export function readRepoFile(file) {
  return readFileSync(path.join(repoRoot, file), "utf8");
}

/**
 * @param {string} file A JSON file of the checkout, from its root
 * @returns {unknown} Its value
 */
export function readRepoJson(file) {
  return JSON.parse(readRepoFile(file));
}
