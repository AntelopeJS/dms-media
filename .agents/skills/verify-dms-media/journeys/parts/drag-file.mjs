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
