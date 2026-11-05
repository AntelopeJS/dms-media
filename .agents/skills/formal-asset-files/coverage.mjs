import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import RECORDED from "./coverage-record.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "../../..");
const RECORD = path.join(HERE, "coverage-record.mjs");
const SRC = "packages/dms-media/src";

/** The code AssetFiles.tla describes, as `file#function` (a method counts as a function). */
export const COVERED = {
  [`${SRC}/asset-lifecycle.ts`]: [
    "retiredFiles",
    "updateAssetMedia",
    "acknowledgeFile",
    "cleanupAssetFiles",
    "deleteMediaAsset",
  ],
  [`${SRC}/derivatives.ts`]: [
    "uploadStorageBytes",
    "generateDerivative",
    "commitDerivative",
    "partitionDerivatives",
    "ensureDerivative",
  ],
  [`${SRC}/transform.ts`]: [
    "renderAssetTransform",
    "commitTransform",
    "originalPatch",
    "applyImageTransform",
    "revertImageTransform",
  ],
  [`${SRC}/crons/sweep-derivatives.ts`]: ["sweepAssetDerivatives"],
  [`${SRC}/routes/media/storage-keys.ts`]: [
    "parseDerivatives",
    "collectAssetStorageKeys",
  ],
  [`${SRC}/db/models/mediaAssets.model.ts`]: [
    "compareMedia",
    "deleteCleanedAsset",
  ],
  [`${SRC}/routes/media/transform.ts`]: [
    "requireEditableAsset",
    "transform",
    "revert",
  ],
  [`${SRC}/routes/media/assets.ts`]: ["requireReadableAsset"],
  [`${SRC}/routes/media/asset-actions.ts`]: ["removeAsset"],
  [`${SRC}/routes/media/folders.ts`]: ["deleteFolderAssets"],
};

/** The repository paths of the covered files. */
export const COVERED_FILES = Object.keys(COVERED);

/**
 * The text of one declaration in an oxfmt-formatted file: from the line that
 * declares `name` with `function` or as an `async` method, to the first line
 * that closes it at the same indentation.
 *
 * @param {string} file Repository path
 * @param {string} name Function or method name
 * @returns {string} The declaration's text
 */
function declarationText(file, name) {
  const lines = readFileSync(path.join(REPO, file), "utf8").split("\n");
  const head = new RegExp(
    `^(\\s*)(?:export\\s+)?(?:private\\s+|static\\s+)*(?:async\\s+function\\s+|function\\s+|async\\s+)${name}\\s*[(<]`,
  );
  const starts = lines.flatMap((line, index) =>
    head.test(line) ? [index] : [],
  );
  if (starts.length !== 1) {
    throw new Error(
      `${file}#${name}: ${starts.length} declarations found, expected 1`,
    );
  }
  const [start] = starts;
  const indent = head.exec(lines[start])?.[1] ?? "";
  const end = lines.findIndex(
    (line, index) => index > start && line === `${indent}}`,
  );
  if (end < 0) throw new Error(`${file}#${name}: no closing brace`);
  return lines.slice(start, end + 1).join("\n");
}

/** @returns {Record<string, string>} Each covered function's fingerprint */
export function fingerprints() {
  /** @type {Record<string, string>} */
  const result = {};
  for (const [file, names] of Object.entries(COVERED)) {
    for (const name of names) {
      result[`${file}#${name}`] = createHash("sha256")
        .update(declarationText(file, name))
        .digest("hex")
        .slice(0, 16);
    }
  }
  return result;
}

/** @typedef {typeof RECORDED} CoverageRecord */

/** @returns {string[]} The covered functions that differ from the record, or are new or gone */
export function staleFunctions() {
  /** @type {Record<string, string>} */
  const recorded = RECORDED.functions;
  const current = fingerprints();
  const keys = new Set([...Object.keys(recorded), ...Object.keys(current)]);
  return [...keys].filter((key) => recorded[key] !== current[key]).sort();
}

/**
 * Records the current fingerprints, with the last commit that changed the
 * covered files. Refuses while a covered file has uncommitted changes.
 *
 * @returns {{ sync: string, functions: Record<string, string> }} The new record
 */
export function writeRecord() {
  const git = (/** @type {string[]} */ ...args) =>
    execFileSync("git", args, { cwd: REPO, encoding: "utf8" }).trim();
  if (git("status", "--porcelain", "--", ...COVERED_FILES) !== "") {
    throw new Error("commit the covered files before recording them");
  }
  const record = {
    sync: git("log", "-1", "--format=%h", "--", ...COVERED_FILES),
    functions: fingerprints(),
  };
  writeFileSync(
    RECORD,
    `/** Each covered function's fingerprint, and the last commit that changed the covered code when the model was confirmed against it. Written by \`check.mjs --sync\`. */\nexport default ${JSON.stringify(record, null, 2)};\n`,
  );
  return record;
}
