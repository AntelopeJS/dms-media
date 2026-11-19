import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";

const MS_PER_SECOND = 1000;
const tokenRecord = z.object({ expiresAt: z.number() });

/** Seconds a signed read URL stays valid, read from the storage's record of its token. */
export async function readUrlLifetimeSeconds(url: string): Promise<number> {
  const token = new URL(url, "http://storage.invalid").searchParams.get(
    "token",
  );
  if (!token) throw new Error(`no token in ${url}`);
  const record = tokenRecord.parse(
    JSON.parse(
      await readFile(
        join(
          process.env.TEST_STORAGE_DIR ?? "",
          "tokens",
          "read",
          `${token}.json`,
        ),
        "utf8",
      ),
    ),
  );
  return Math.round((record.expiresAt - Date.now()) / MS_PER_SECOND);
}
