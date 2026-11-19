import { chmodSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assert } from "chai";

const STORAGE_DIR_PREFIX = "dms-media-test-storage-";
const READ_ONLY_DIRECTORY = 0o500;
const WRITABLE_DIRECTORY = 0o700;

/**
 * Runs with the folder that would hold an asset's renderings read-only, so the
 * storage cannot write one. The local storage of this run is the directory
 * that holds the asset's original.
 */
export async function withUnwritableDerivatives(
  asset: { id: string; storageKey: string },
  run: () => Promise<void>,
): Promise<void> {
  const root = readdirSync(tmpdir())
    .filter((name) => name.startsWith(STORAGE_DIR_PREFIX))
    .map((name) => join(tmpdir(), name, "files"))
    .find((candidate) => existsSync(join(candidate, asset.storageKey)));
  assert.isDefined(root, "the local storage directory of this run");
  const derivatives = join(root, "media-derivatives", asset.id);
  mkdirSync(derivatives, { recursive: true });
  chmodSync(derivatives, READ_ONLY_DIRECTORY);
  try {
    await run();
  } finally {
    chmodSync(derivatives, WRITABLE_DIRECTORY);
  }
}
