import { guarded } from "../guard.mjs";
import { media, text } from "../media.mjs";
import { folderMenuJourneys } from "./parts/folder-menus.mjs";

/** @typedef {import("../media.mjs").Ctx} Ctx */

/**
 * The folder bound to an asset field of the verification playground.
 *
 * @param {Ctx} ctx The journey
 * @param {string} bindingId The binding
 * @returns {Promise<string>} The folder id
 */
export async function boundFolder(ctx, bindingId) {
  const answer = await media(ctx, `read the folder of ${bindingId}`, "GET", `/bindings/${bindingId}/folder`);
  return text(answer.body, "folder", "id") || text(answer.body, "id");
}

/** Folders: the explorer menus. */
export const journeys = guarded([...folderMenuJourneys()]);
