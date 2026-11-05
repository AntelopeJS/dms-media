#!/usr/bin/env node
/**
 * Model-checks AssetFiles.tla with TLC through the shared runner of
 * @antelopejs/tooling-configs, once per configuration in `CONFIGS`.
 *
 * - `check.mjs` prints `STALE <file>#<function>` for each covered function
 *   that changed since coverage-record.mjs, then checks every configuration. Every
 *   INVARIANT must hold, except the findings in `FINDINGS`. Exits 0 when all
 *   match, 1 when a rule changed or a covered function is stale, 2 when TLC
 *   could not run.
 * - `check.mjs --seeded` applies each mutation of `SEEDED` to a copy of the
 *   spec and requires its rule to break with the recorded counterexample
 *   length. Exits 1 on the first mutation the check misses.
 * - `check.mjs --sync` records the covered functions' fingerprints. Run it
 *   only once the spec describes the covered code.
 */
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { checkSpec } from "@antelopejs/tooling-configs/formal";
import RECORDED from "./coverage-record.mjs";
import { staleFunctions, writeRecord } from "./coverage.mjs";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const SPEC = "AssetFiles";

/** One configuration per family of races: which requests run at once. */
const CONFIGS = [
  "sizes",
  "edits",
  "saves",
  "delete",
  "delete-revert",
  "sweep-sizes",
  "sweep-edits",
  "sweep-delete",
];

/** Rules today's code breaks, per configuration, with the states in TLC's shortest counterexample. */
/** @type {Partial<Record<string, Record<string, number>>>} */
const FINDINGS = {};

/**
 * @typedef {object} Mutation
 * @property {string} id
 * @property {string} code The one-line bug in the code that the mutation mirrors
 * @property {string} config
 * @property {string} rule The rule that must break
 * @property {number} states The states in TLC's shortest counterexample
 * @property {string} from Text of AssetFiles.tla to replace
 * @property {string} to Its replacement
 * @property {number} count How many times `from` occurs
 */

/** @type {Mutation[]} */
const SEEDED = [
  {
    id: "lost-race-deletes-the-published-size",
    code: "derivatives.ts commitDerivative: DeleteFile(derivatives[cacheKey]) for DeleteFile(storageKey) when another request published the size first",
    config: "sizes",
    rule: "LiveFilesStored",
    states: 11,
    from: 'pc[p] = "c_drop"\n  /\\ DropMine(p)',
    to: "pc[p] = \"c_drop\"\n  /\\ storage' = storage \\ {row.derivs[Preset]}",
    count: 1,
  },
  {
    id: "save-keeps-the-old-sizes",
    code: 'transform.ts commitTransform: updateAssetMedia(model, fresh, patch) without json_derivatives: ""',
    config: "sizes",
    rule: "SizesShowCurrentImage",
    states: 6,
    from: "!.derivs = NoDerivs]",
    to: "!.derivs = obs[p].derivs]",
    count: 2,
  },
  {
    id: "size-published-after-the-image-changed",
    code: "derivatives.ts commitDerivative: no fresh.storageKey !== asset.storageKey check",
    config: "sizes",
    rule: "SizesShowCurrentImage",
    states: 11,
    from: "row.deleting \\/ row.sk # snap[p].sk\n            -> Go(p, \"c_discard\")",
    to: 'row.deleting\n            -> Go(p, "c_discard")',
    count: 1,
  },
  {
    id: "conflicting-save-keeps-its-file",
    code: "transform.ts applyImageTransform: the catch no longer deletes the rendered file on MediaAssetChangedError",
    config: "saves",
    rule: "NothingLeftBehind",
    states: 19,
    from: 'pc[p] = "e_discard"\n  /\\ DropMine(p)',
    to: 'pc[p] = "e_discard"\n  /\\ UNCHANGED storage',
    count: 1,
  },
  {
    id: "replaced-files-queued-with-live-ones",
    code: "asset-lifecycle.ts updateAssetMedia: retired = collectAssetStorageKeys(asset), without .filter((key) => !live.has(key))",
    config: "edits",
    rule: "NoRetiredFilePublished",
    states: 10,
    from: "o.retired \\cup (KeysOf(o) \\ live)",
    to: "o.retired \\cup KeysOf(o)",
    count: 1,
  },
];

/**
 * @param {string} text
 * @param {string} part
 * @returns {number}
 */
function occurrences(text, part) {
  return text.split(part).length - 1;
}

/** @param {Mutation} mutation */
async function checkMutation(mutation) {
  const spec = readFileSync(path.join(DIR, `${SPEC}.tla`), "utf8");
  const found = occurrences(spec, mutation.from);
  if (found !== mutation.count) {
    console.log(
      `MOVED  ${mutation.id}: its text occurs ${found} times in ${SPEC}.tla, expected ${mutation.count}`,
    );
    process.exit(1);
  }
  const work = mkdtempSync(path.join(os.tmpdir(), `seeded-${mutation.id}-`));
  writeFileSync(
    path.join(work, `${SPEC}.tla`),
    spec.replaceAll(mutation.from, mutation.to),
  );
  const config = readFileSync(path.join(DIR, `${mutation.config}.cfg`), "utf8")
    .split("\n")
    .filter(
      (line) =>
        !line.startsWith("INVARIANT") ||
        line === "INVARIANT TypeOK" ||
        line === `INVARIANT ${mutation.rule}`,
    )
    .join("\n");
  writeFileSync(path.join(work, "seeded.cfg"), config);
  console.log(`seeded ${mutation.id}: ${mutation.code}`);
  await checkSpec({
    dir: work,
    spec: SPEC,
    config: "seeded",
    findings: { [mutation.rule]: mutation.states },
  });
}

/** Checks every configuration, and fails when a covered function changed since the record. */
async function checkModel() {
  const stale = staleFunctions();
  for (const key of stale) console.log(`STALE ${key}`);
  for (const config of CONFIGS) {
    await checkSpec({
      dir: DIR,
      spec: SPEC,
      config,
      findings: (Object.hasOwn(FINDINGS, config) && FINDINGS[config]) || {},
    });
  }
  if (stale.length > 0) {
    console.log(
      `The covered code changed since ${RECORDED.sync}: update ${SPEC}.tla to match, then run check.mjs --sync.`,
    );
    process.exit(1);
  }
}

const [mode] = process.argv.slice(2);
if (mode === "--seeded") {
  for (const mutation of SEEDED) await checkMutation(mutation);
  console.log(`caught ${SEEDED.length} of ${SEEDED.length} seeded mutations`);
} else if (mode === "--sync") {
  const record = writeRecord();
  console.log(
    `recorded ${Object.keys(record.functions).length} functions at ${record.sync}`,
  );
} else {
  await checkModel();
}

