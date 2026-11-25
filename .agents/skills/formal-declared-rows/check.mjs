#!/usr/bin/env node
import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { checkSpec } from "@antelopejs/tooling-configs/formal";
import RECORDED from "./coverage-record.mjs";
import { staleFunctions, writeRecord } from "./coverage.mjs";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const SPEC = "DeclaredRows";

/** One configuration per family of races, then all three families at once. */
const CONFIGS = ["folders", "assets", "bindings", "mixed"];

/** Rules today's code breaks, per configuration, with the states in TLC's shortest counterexample. */
/** @type {Partial<Record<string, Record<string, number>>>} */
const FINDINGS = {};

/**
 * One text of the spec to change: `from` occurs `count` times and becomes
 * `to`. A `section` edit replaces the lines from `\* BEGIN <name>` to
 * `\* END <name>` with the file `seeded/<to>`.
 *
 * @typedef {{ from: string, to: string, count: number } | { section: string, to: string }} Edit
 *
 * @typedef {object} Mutation
 * @property {string} id
 * @property {string} code The bug in the code that the mutation mirrors
 * @property {string} config
 * @property {Record<string, number>} rules Each rule that must break, with the states in TLC's shortest counterexample
 * @property {Edit[]} edits
 */

/** @type {Mutation[]} */
const SEEDED = [
  {
    id: "declared-folder-under-a-random-id",
    code: "declared/folders.ts createFolder before #170: folderModel.insert without _id, so a process that read no sibling inserts a second folder, and one that read the first refuses",
    config: "folders",
    rules: { OneRowPerKey: 13, NoDeclarationRefused: 6 },
    edits: [
      { from: "FolderId(p) == Fixed", to: "FolderId(p) == p", count: 1 },
    ],
  },
  {
    id: "folder-loser-records-an-event",
    code: "declared/folders.ts createFolder: the IsDuplicateKeyError branch falls through to recordMediaEvent instead of returning `kept`",
    config: "folders",
    rules: { LoserRecordsNoEvent: 13 },
    edits: [
      {
        from: 'THEN Go(p, "f_record") /\\ UNCHANGED fRows',
        to: 'THEN Go(p, "f_event") /\\ UNCHANGED fRows',
        count: 1,
      },
    ],
  },
  {
    id: "declaration-record-under-a-random-id",
    code: "declared/records.ts rememberDeclaration before #170: declarationModel.insert without _id: targetId, so each process writes its own record",
    config: "folders",
    rules: { OneRecordPerKey: 12 },
    edits: [
      {
        from: "FolderRecordId(p) == FolderId(p)",
        to: "FolderRecordId(p) == p",
        count: 1,
      },
    ],
  },
  {
    id: "declared-asset-under-a-random-id",
    code: "services/add-file.ts insertAsset: assetModel.insert without _id, as before #173, so every importer that found no record inserts its own asset",
    config: "assets",
    rules: {
      OneRowPerKey: 15,
      LoserRecordsNoEvent: 15,
    },
    edits: [{ from: "AssetId(p) == Fixed", to: "AssetId(p) == p", count: 1 }],
  },
  {
    id: "asset-loser-keeps-its-stored-file",
    code: "services/add-file.ts storeNewFile: no discardFile() when insertAsset returned false",
    config: "assets",
    rules: { LoserLeavesNoFile: 15 },
    edits: [
      { from: "files' = files \\ {p}", to: "files' = files", count: 1 },
    ],
  },
  {
    id: "asset-loser-records-an-upload-event",
    code: "declared/assets.ts createAsset: no early `return { status: \"kept\", id }` for a process that lost the insert, so it records asset.upload too",
    config: "assets",
    rules: { LoserRecordsNoEvent: 16 },
    edits: [
      {
        from: 'files\' = files \\ {p}\n  /\\ Go(p, "a_record")',
        to: 'files\' = files \\ {p}\n  /\\ Go(p, "a_event")',
        count: 1,
      },
    ],
  },
  {
    id: "provision-lists-then-inserts",
    code: "bindings.ts provisionTenant before #174: folderModel.getAll, then insert the content root and the linked folder under random ids when the listing had none",
    config: "bindings",
    rules: { OneRowPerKey: 13 },
    edits: [{ section: "provisioning", to: "provision-lists-then-inserts.tla" }],
  },
  {
    id: "linked-folder-kept-without-its-acl",
    code: "bindings.ts ensureBindingFolder: no folderModel.update(id, { json_acl }) after a duplicate key, so the other process's folder keeps its old ACL",
    config: "bindings",
    rules: { BindingAclApplied: 13 },
    edits: [
      {
        from: 'IF link[BindId(p)] # "new"\n       THEN pc\' = [pc EXCEPT ![p] = "p_upd"]\n       ELSE pc\' = [pc EXCEPT ![p] = "done"]',
        to: "pc' = [pc EXCEPT ![p] = \"done\"]",
        count: 1,
      },
    ],
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

/**
 * @param {string} spec
 * @param {string} id
 * @param {Edit} edit
 * @returns {string} The spec with the edit applied; exits 1 when the edit's text is gone
 */
function applyEdit(spec, id, edit) {
  if ("section" in edit) {
    const begin = `\\* BEGIN ${edit.section}\n`;
    const end = `\\* END ${edit.section}\n`;
    const from = spec.indexOf(begin);
    const to = spec.indexOf(end);
    if (from < 0 || to < from) {
      console.log(
        `MOVED  ${id}: no BEGIN/END ${edit.section} markers in ${SPEC}.tla`,
      );
      process.exit(1);
    }
    return (
      spec.slice(0, from) +
      readFileSync(path.join(DIR, "seeded", edit.to), "utf8") +
      spec.slice(to + end.length)
    );
  }
  const found = occurrences(spec, edit.from);
  if (found !== edit.count) {
    console.log(
      `MOVED  ${id}: its text occurs ${found} times in ${SPEC}.tla, expected ${edit.count}`,
    );
    process.exit(1);
  }
  return spec.replaceAll(edit.from, edit.to);
}

/** @param {Mutation} mutation */
async function checkMutation(mutation) {
  const work = mkdtempSync(path.join(os.tmpdir(), `seeded-${mutation.id}-`));
  const spec = mutation.edits.reduce(
    (text, edit) => applyEdit(text, mutation.id, edit),
    readFileSync(path.join(DIR, `${SPEC}.tla`), "utf8"),
  );
  writeFileSync(path.join(work, `${SPEC}.tla`), spec);
  const rules = Object.keys(mutation.rules);
  const config = readFileSync(path.join(DIR, `${mutation.config}.cfg`), "utf8")
    .split("\n")
    .filter(
      (line) =>
        !line.startsWith("INVARIANT") ||
        line === "INVARIANT TypeOK" ||
        rules.some((rule) => line === `INVARIANT ${rule}`),
    )
    .join("\n");
  writeFileSync(path.join(work, "seeded.cfg"), config);
  console.log(`seeded ${mutation.id}: ${mutation.code}`);
  await checkSpec({
    dir: work,
    spec: SPEC,
    config: "seeded",
    findings: mutation.rules,
  });
}

/**
 * Model-checks DeclaredRows.tla with TLC through the shared runner of
 * @antelopejs/tooling-configs, once per configuration in `CONFIGS`.
 *
 * - `check.mjs` prints `STALE <file>#<function>` for each covered function
 *   that changed since coverage-record.mjs, then checks every configuration. Every
 *   INVARIANT must hold, except the findings in `FINDINGS`. Exits 0 when all
 *   match, 1 when a rule changed or a covered function is stale, 2 when TLC
 *   could not run.
 * - `check.mjs --seeded` applies each mutation of `SEEDED` to a copy of the
 *   spec and requires its rules to break with the recorded counterexample
 *   lengths. Exits 1 on the first mutation the check misses.
 * - `check.mjs --sync` records the covered functions' fingerprints. Run it
 *   only once the spec describes the covered code.
 *
 * Checks every configuration, and fails when a covered function changed since the record.
 */
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
  const unused = readdirSync(path.join(DIR, "seeded")).filter(
    (file) =>
      !SEEDED.some((mutation) =>
        mutation.edits.some((edit) => "section" in edit && edit.to === file),
      ),
  );
  if (unused.length > 0) {
    console.log(`UNUSED seeded/${unused.join(", seeded/")}`);
    process.exit(1);
  }
  console.log(`caught ${SEEDED.length} of ${SEEDED.length} seeded mutations`);
} else if (mode === "--sync") {
  const record = writeRecord();
  console.log(
    `recorded ${Object.keys(record.functions).length} functions at ${record.sync}`,
  );
} else {
  await checkModel();
}
