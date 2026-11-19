import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { assert } from "chai";

/**
 * Runs with a plain file where the folder of an asset's renderings would go,
 * so the local storage cannot write one on any platform, as root included.
 */
export async function withUnwritableDerivatives(
  asset: { id: string },
  run: () => Promise<void>,
): Promise<void> {
  const storageDir = process.env.TEST_STORAGE_DIR;
  assert.isDefined(storageDir, "TEST_STORAGE_DIR");
  const parent = join(storageDir, "files", "media-derivatives");
  const blocker = join(parent, asset.id);
  assert.isFalse(existsSync(blocker), `${blocker} holds no rendering yet`);
  mkdirSync(parent, { recursive: true });
  writeFileSync(blocker, "");
  try {
    await run();
  } finally {
    rmSync(blocker, { force: true });
  }
}
