import { createClient } from "../helpers/http";

const READY_TIMEOUT_MS = 30_000;
const POLL_INTERVAL_MS = 100;
const HTTP_OK = 200;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(
  description: string,
  check: () => Promise<boolean>,
): Promise<void> {
  const deadline = Date.now() + READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (await check()) return;
    await delay(POLL_INTERVAL_MS);
  }
  throw new Error(`Timed out waiting for ${description}`);
}

before(async function () {
  this.timeout(READY_TIMEOUT_MS + 5_000);

  const client = createClient();
  await waitFor("the DMS runtime to accept onboarding calls", async () => {
    try {
      const response = await client.get("/api/onboarding/informations");
      return response.status === HTTP_OK;
    } catch {
      return false;
    }
  });
});
