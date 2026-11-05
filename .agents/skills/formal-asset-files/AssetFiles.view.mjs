/**
 * The reader's words for AssetFiles.tla, for the statechart skill's `--view`.
 * A TLC record arrives as an object, a TLA+ function of the presets as an
 * object keyed by preset, and a set as an array.
 *
 * @typedef {object} AssetRow
 * @property {boolean} exists
 * @property {number} sk
 * @property {number} ok
 * @property {Record<string, number>} derivs
 * @property {number[]} retired
 * @property {boolean} deleting
 *
 * @typedef {object} AssetState
 * @property {AssetRow} row
 * @property {number[]} storage
 * @property {Record<string, number>} srcOf
 */

export const title = "One media asset's stored files while requests race";

/**
 * @param {AssetState} v
 * @returns {string}
 */
export const state = (v) => {
  const { row } = v;
  if (!row.exists) return "File deleted";
  if (row.deleting) return "File being deleted";
  const image = row.ok ? "Edited image" : "Original image";
  const sizes = Object.values(row.derivs).filter((key) => key !== 0).length;
  const size = sizes === 0 ? "no size" : `${sizes} size${sizes > 1 ? "s" : ""}`;
  const queued = row.retired.length > 0 ? ", old files queued" : "";
  return `${image}, ${size}${queued}`;
};

/** @type {Partial<Record<string, string>>} */
const STEPS = {
  DGet: "a page asks for the image size",
  DRead: "the size is rendered",
  DWrite: "the size is rendered",
  CGet: "the size request rereads the file",
  CCas: "the size is published",
  CDrop: "another request's size wins",
  CDiscard: "the image changed: the size is dropped",
  GGet: "the size is rendered again",
  EGet: "you press Save in the editor",
  ERead: "the edit is rendered",
  EWrite: "the edit is rendered",
  RGet: "you press Revert to original",
  RRead: "the original is read",
  TGet: "the save rereads the file",
  TCas: "the save commits",
  EDiscard: "the save conflicts and drops its file",
  XGet: "you delete the file",
  XCas: "the file is marked deleted",
  SGet: "the nightly sweep runs",
  SCas: "the sweep detaches a removed size",
  ClStart: "old files are cleaned up",
  ClNext: "old files are cleaned up",
  ClCheck: "old files are cleaned up",
  ClDelete: "an old file is deleted from storage",
  AckGet: "an old file is deleted from storage",
  AckCas: "its deletion is recorded",
  ClFinal: "the cleanup ends",
  ClDrop: "the file's row is removed",
  Finished: "every request has finished",
};

/**
 * @param {string} action
 * @returns {string}
 */
export const step = (action) => STEPS[action] ?? action;

/**
 * @param {AssetState} v
 * @returns {string}
 */
export const group = (v) =>
  !v.row.exists || v.row.deleting ? "deleting" : "live";

export const colors = { live: "teal", deleting: "orange" };
