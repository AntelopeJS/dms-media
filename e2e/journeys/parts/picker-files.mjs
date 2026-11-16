import { folderAssets } from "../../library.mjs";
import { text } from "../../media.mjs";

/** @typedef {import("../../media.mjs").Ctx} Ctx */

/**
 * Drags a PNG over an element, dispatching each drag event in turn: `drop` last uploads it.
 *
 * @param {import("playwright-core").Locator} target The element the file is dragged over
 * @param {string} name The file's name
 * @param {Buffer} buffer The file's bytes
 * @param {string[]} types The drag events to dispatch
 * @returns {Promise<void>}
 */
export async function dragFile(target, name, buffer, types) {
  await target.evaluate(
    (element, file) => {
      const binary = atob(file.base64);
      const bytes = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
      const transfer = new DataTransfer();
      transfer.items.add(new File([bytes], file.name, { type: "image/png" }));
      for (const type of file.types) element.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: transfer }));
    },
    { base64: buffer.toString("base64"), name, types },
  );
}

/**
 * Lists the files of a linked folder and of its subfolder as one account sees them, again for up to 20 s until one of them holds the file.
 *
 * @param {Ctx} ctx The journey
 * @param {{ bound: string, sub: string }} folders The linked folder's id and its subfolder's id
 * @param {string} name The file's name
 * @param {string} as The account
 * @returns {Promise<{ bound: string[], sub: string[] }>} The file names in each folder
 */
export async function landed(ctx, folders, name, as) {
  /** @param {string} id */
  const names = async (id) => (await folderAssets(ctx, id, { as })).assets.map((asset) => text(asset, "name"));
  const list = async () => {
    const [bound, sub] = await Promise.all([names(folders.bound), names(folders.sub)]);
    return { bound, sub };
  };
  let listed = await list();
  for (let attempt = 0; attempt < 20 && ![...listed.bound, ...listed.sub].includes(name); attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    listed = await list();
  }
  return listed;
}
